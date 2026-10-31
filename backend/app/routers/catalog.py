import logging
import re
import threading
import time

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from ..database import SessionLocal, get_db
from ..deps import get_current_user
from ..models import Category, Coupon, Media, Product, Review, Setting, SitePage, User
from ..schemas import ReviewIn, ReviewOut
from ..services.pricing import normalize_bulk_tiers
from ..services.site_menu import MENUS, get_site_menu, public_menu
from ..services.storage import get_or_create_thumbnail, warm_thumbnails

logger = logging.getLogger("catalog")

router = APIRouter(prefix="/api/catalog", tags=["catalog"])

HOMEPAGE_KEY = "homepage_layout"  # same Setting row admin.py's homepage builder writes

# page_bundle() below is this app's most-requested endpoint (every storefront page
# loads it on every visit) and its most expensive - it costs 3-4 sequential round
# trips to the Supabase DB, which alone runs ~1.4-1.6s (measured) because the DB
# is in a different region from wherever this API is served. That per-request cost
# can't be fixed by better queries; caching the response is what removes it, since
# this data (categories/products/portfolio images) only changes when an admin edits
# it. The TTL below only bounds staleness for a change made *outside* this app
# (a direct DB edit) - every admin write endpoint already calls
# invalidate_catalog_cache() right after commit, so a normal admin edit is live
# immediately regardless of TTL. That means the TTL can be generous (minutes, not
# seconds) purely to cut how often a visitor pays the ~1.5s DB round trip, with
# no real staleness cost.
_PAGE_BUNDLE_CACHE_TTL_SECONDS = 300
# Bumped by invalidate_catalog_cache() on every admin write. A build that started
# before the bump but finishes after it is writing data queried before the edit -
# without this guard it would overwrite the freshly-cleared cache with that stale
# result (the admin's change then stays invisible on the storefront for up to a
# full TTL instead of the "live immediately" every write endpoint promises). Each
# cache-populating block below captures this value before its DB read and only
# writes back if it's unchanged, so a straggling build just quietly discards its
# result instead of clobbering a newer one.
_cache_generation = 0
_page_bundle_cache: dict[str, tuple[float, dict]] = {}
# One lock per page_slug so concurrent requests landing in the same cold window
# don't all independently pay the ~1.5s DB cost - the first one populates the
# cache, the rest just wait on the lock and then read what it wrote.
_page_bundle_locks: dict[str, threading.Lock] = {}
_page_bundle_locks_guard = threading.Lock()


def _lock_for(page_slug: str) -> threading.Lock:
    with _page_bundle_locks_guard:
        return _page_bundle_locks.setdefault(page_slug, threading.Lock())


_WESERV_SKIP = re.compile(r"^https?://(localhost|127\.0\.0\.1)")


def cld_optimize(url: str | None) -> str | None:
    """Shrinks an R2 image URL down to a small WebP thumbnail before it's embedded in
    page_bundle() JSON, instead of shipping the ~500KB-1MB originals as-is for what's
    usually rendered as a card thumbnail. Runs Pillow in-process via
    storage.get_or_create_thumbnail() (cached permanently in R2 - see that function),
    which is the Python-library replacement for the images.weserv.nl proxy this used
    to call (each storefront page's hardcoded catalog data uses a precomputed
    js/shared/thumb-map.js instead - a browser can't run Pillow, and this app has
    no runtime resize endpoint at all - see scripts/generate_thumbnails.py).
    Anything that isn't one of this app's own R2 URLs (localhost dev media, legacy
    /media/ paths) passes through unchanged rather than failing the request."""
    if not url or _WESERV_SKIP.match(url):
        return url
    # wait=False: a thumbnail not yet confirmed ships the original for now rather
    # than holding up the whole page while it's checked/generated (see storage)
    return get_or_create_thumbnail(url, wait=False) or url


def split_media(media) -> tuple[list[str], list[str]]:
    """Splits one product's media rows into (image urls, video urls).

    Every storefront surface wants the images on their own: a card thumbnail, a
    hero, an OG image and the homepage all take `images[0]`, and a video landing
    first in that list would leave them pointing at an MP4. So `images` stays
    exactly what it has always been, and videos are handed back separately for the
    product detail gallery (the only place that plays one) to append.

    Image URLs go through cld_optimize() as before; video URLs do not - that runs
    Pillow, which can't open an MP4, and there is no transcoding step in this app."""
    images = [cld_optimize(m.url) for m in media if m.media_type != "video"]
    videos = [m.url for m in media if m.media_type == "video"]
    return images, videos


def default_variant_pricing(product: Product) -> tuple[float, float | None] | None:
    """The (price, mrp) a shopper actually sees the moment they open this product,
    when its price comes from a priced dropdown rather than Product.price.

    A product whose "Customer Questions" include a priced dropdown (Studio's
    "16 Photos = ₹200", a size/colour picker where each option costs a different
    amount) is never sold at Product.price: the storefront pre-selects that
    dropdown's FIRST option on render - see renderChoiceControl() in
    js/shared/product-fields.js, `const initial = priced ? options[0] : null` -
    and that option's price is what the page shows and what add-to-cart charges.

    Cards were still advertising Product.price, so a product whose first option
    costs ₹50 could sit on the grid promising ₹30. This returns what the card
    should say instead; None means the product has no priced dropdown and its
    own price is already correct.

    Mirrors getSelectedPricing() exactly, including the fallback: if options[0]
    happens to carry no price the storefront shows Product.price, so this does
    too rather than hunting for the next priced option."""
    fields = sorted(product.input_fields or [], key=lambda f: f.get("sort", 0))
    field = next(
        (f for f in fields
         if f.get("type") == "dropdown" and not f.get("multi_select") and f.get("option_prices")),
        None,
    )
    if not field:
        return None
    options = field.get("options") or []
    if not options:
        return None
    initial = options[0]
    raw_price = (field.get("option_prices") or {}).get(initial)
    if raw_price is None:
        return None
    try:
        price = float(raw_price)
    except (TypeError, ValueError):
        return None
    raw_mrp = (field.get("option_mrps") or {}).get(initial)
    try:
        mrp = float(raw_mrp) if raw_mrp is not None else None
    except (TypeError, ValueError):
        mrp = None
    # Same rule the storefront uses: a was-price is only shown when it is
    # actually above what is being charged.
    return price, (mrp if mrp is not None and mrp > price else None)


def product_page_url(p: Product) -> str | None:
    """Storefront link straight to one product - the Python twin of
    js/shared/search.js's buildProductUrl(), so a "product link" field opens the
    product exactly the way a search result for it does. Each page has its own
    deep-link scheme (see that function's comment); photography has no
    per-product opener, so it links to the category."""
    from urllib.parse import quote
    page = p.category.page.slug if p.category and p.category.page else None
    name = quote(p.title, safe="")
    if page == "gifts":
        return f"gifts.html?view=product&product={name}"
    if page == "corporate":
        img = next((m.url for m in p.media if m.media_type != "video"), "")
        return (f"corporate.html?openProduct={name}&openPrice={quote(format_price(p), safe='')}"
                f"&openImg={quote(cld_optimize(img) or '', safe='')}&pid={quote(str(p.id), safe='')}")
    if page == "studio":
        return f"studio.html?openProduct={name}&pid={quote(str(p.id), safe='')}"
    if page == "photography":
        return f"photography.html?category={quote(p.category.slug if p.category else '', safe='')}"
    return None


def _link_entries(field: dict) -> list[dict]:
    """A link field's [{product_id, label}] - its `links` list, or for a field
    saved before multi-link existed, its single link_product_id."""
    if field.get("links"):
        return [e for e in field["links"] if isinstance(e, dict) and e.get("product_id")]
    if field.get("link_product_id"):
        return [{"product_id": field["link_product_id"], "label": field.get("label") or ""}]
    return []


def linked_products(db: Session, products) -> dict:
    """Every active product that any of `products`' "product link" fields points
    at, fetched in one query - {id: Product}."""
    ids = {
        e["product_id"]
        for p in products
        for f in (p.input_fields or [])
        if f.get("type") == "link"
        for e in _link_entries(f)
    }
    if not ids:
        return {}
    rows = (
        db.query(Product)
        .options(selectinload(Product.media), selectinload(Product.category).selectinload(Category.page))
        .filter(Product.id.in_(ids), Product.is_active == True)
        .all()
    )
    return {p.id: p for p in rows}


def public_input_fields(fields, linked: dict) -> list:
    """A product's input_fields as the storefront should see them: each "product
    link" field gets a `link` block with the target's CURRENT name, picture,
    price and URL (resolved here, never stored, so it can't go stale), and a link
    whose target was deleted or hidden is dropped rather than shown broken."""
    out = []
    for f in fields or []:
        if f.get("type") == "link":
            resolved = []
            for entry in _link_entries(f):
                target = linked.get(entry["product_id"])
                url = product_page_url(target) if target else None
                if not url:
                    continue
                image = next((m.url for m in target.media if m.media_type != "video"), None)
                resolved.append({
                    "id": target.id,
                    "title": target.title,
                    "label": entry.get("label") or target.title,
                    "image": cld_optimize(image) if image else "",
                    "price": format_price(target),
                    "url": url,
                })
            if not resolved:
                continue
            legacy = not f.get("links")
            f = {**f, "links": resolved}
            # A field saved before multi-link used its label as the tile's name,
            # so it gets the generic heading the old single tile sat under.
            if legacy:
                f["label"] = "Also available in"
        out.append(f)
    return out


def display_pricing(product: Product) -> tuple[float, float | None]:
    """(price, mrp) for any card or listing - the priced dropdown's first option
    when there is one, otherwise the product's own figures."""
    variant = default_variant_pricing(product)
    if variant:
        return variant
    mrp = float(product.mrp) if product.mrp else None
    price = float(product.price)
    return price, (mrp if mrp is not None and mrp > price else None)


def format_price(product: Product) -> str:
    """Most products show a real price; a quote-based service (equipment add-ons like
    Drone/Traditional Videography) is flagged with extra.price_on_request instead of
    a fake ₹0, so the storefront shows "On Request" rather than formatting that 0."""
    if (product.extra or {}).get("price_on_request"):
        return "On Request"
    return format_inr(display_pricing(product)[0])


def format_mrp(product: Product) -> str | None:
    """The struck-through "was" price to sit beside format_price() - taken from
    the same option, so the pair on a card always describes one thing."""
    if (product.extra or {}).get("price_on_request"):
        return None
    mrp = display_pricing(product)[1]
    return format_inr(mrp) if mrp else None


def format_inr(value) -> str:
    n = int(round(float(value)))
    s = str(abs(n))
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        groups = []
        while len(head) > 2:
            groups.insert(0, head[-2:])
            head = head[:-2]
        if head:
            groups.insert(0, head)
        s = ",".join(groups + [tail])
    sign = "-" if n < 0 else ""
    return f"{sign}₹{s}"


@router.get("/pages")
def list_pages(db: Session = Depends(get_db)):
    pages = db.query(SitePage).filter(SitePage.is_active == True).order_by(SitePage.sort).all()
    return [{"slug": p.slug, "name": p.name} for p in pages]


@router.get("/offers")
def active_offers(placement: str | None = None, db: Session = Depends(get_db)):
    query = db.query(Coupon).filter(Coupon.is_active == True)
    if placement:
        query = query.filter(Coupon.placement == placement)
    coupons = query.order_by(Coupon.created_at.desc()).all()
    return [
        {
            "code": c.code, "type": c.type, "value": float(c.value), "title": c.title,
            "banner_image": c.banner_image, "placement": c.placement,
            "min_order": float(c.min_order), "max_discount": float(c.max_discount) if c.max_discount else None,
        }
        for c in coupons
    ]


@router.get("/{page_slug}")
def page_bundle(page_slug: str, db: Session = Depends(get_db)):
    """Assembles one page's full storefront data set — categories, tiered packages,
    portfolio galleries, hero carousel — in one call, replacing what used to be
    hardcoded CATEGORIES/PACKAGES/FOLIO/HERO literals in that page's JS file."""
    cached = _page_bundle_cache.get(page_slug)
    if cached and time.monotonic() - cached[0] < _PAGE_BUNDLE_CACHE_TTL_SECONDS:
        return cached[1]

    # Only the first request in a cold window actually hits the DB; anyone else
    # landing here at the same time just waits on this lock and then reads the
    # cache entry that request filled in, instead of each paying the ~1.5s cost.
    with _lock_for(page_slug):
        cached = _page_bundle_cache.get(page_slug)
        if cached and time.monotonic() - cached[0] < _PAGE_BUNDLE_CACHE_TTL_SECONDS:
            return cached[1]
        gen = _cache_generation
        result = _build_page_bundle(page_slug, db)
        if gen == _cache_generation:
            _page_bundle_cache[page_slug] = (time.monotonic(), result)
        return result


def _build_page_bundle(page_slug: str, db: Session) -> dict:
    page = db.query(SitePage).filter(SitePage.slug == page_slug, SitePage.is_active == True).first()
    if not page:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Page not found")

    # Filter is_active/kind at the relationship-load level (not after, in Python) -
    # this page is assembled from a remote DB, so every inactive product/wrong-kind
    # media row skipped here is a row that never has to cross that network round trip.
    categories = (
        db.query(Category)
        .options(
            selectinload(Category.products.and_(Product.is_active == True))
            .selectinload(Product.media.and_(Media.kind == "package")),
            selectinload(Category.media.and_(Media.kind == "portfolio")),
        )
        .filter(Category.page_id == page.id, Category.is_active == True)
        .order_by(Category.sort, Category.name)
        .all()
    )

    # One grouped query for every product's average rating, instead of one query per
    # product. Scoped to just this page's products, not a site-wide reviews scan.
    all_product_ids = [p.id for c in categories for p in c.products]
    ratings: dict[str, float] = {}
    if all_product_ids:
        rating_rows = (
            db.query(Review.product_id, func.avg(Review.rating))
            .filter(Review.product_id.in_(all_product_ids), Review.is_approved == True)
            .group_by(Review.product_id)
            .all()
        )
        ratings = {pid: round(float(avg), 1) for pid, avg in rating_rows}

    cat_list, packages, folio, folio_titles = [], {}, {}, {}
    category_images, hero = {}, []
    # Targets of every "product link" field on this page, in one query.
    linked = linked_products(db, [p for c in categories for p in c.products])

    for c in categories:
        cat_list.append({
            "id": c.slug,
            "icon": c.icon or "",
            "name": c.name,
            "description": c.description or "",
            "image": cld_optimize(c.thumb_image_url) or "",
            # The same picture uncompressed, for pages that show it as a banner
            # rather than a card (e.g. the gifts category header).
            "image_full": c.thumb_image_url or "",
            "group_label": c.group_label,
        })

        # Both relationships already carry `order_by` (Product.sort / Media.sort),
        # so c.products / c.media / p.media arrive pre-sorted - no Python re-sort needed.
        active_products = c.products
        # Each product carries its own id/images inline now, instead of a separate
        # package_images dict keyed by "category|tier" - that scheme assumed a small
        # fixed set of tiers per category (true for photography's Standard/Premium/
        # Platinum) but silently collided for flat multi-product categories with no
        # real tier (studio/corporate/gifts), where every product shares an empty
        # tier and would otherwise overwrite each other's images under one key.
        # Split once per product here rather than in the dict literal below, which
        # would otherwise walk p.media twice per product on every cache rebuild.
        product_media = {p.id: split_media(p.media) for p in active_products}
        packages[c.slug] = [
            {
                "id": p.id,
                "tier": p.tier or "",
                "title": p.title,
                "description": p.description or "",
                "price": format_price(p),
                "mrp": format_mrp(p),
                "feat": p.features or [],
                "images": product_media[p.id][0],
                # Same photos, same order, uncompressed - for the detail views'
                # main image and full-screen viewer (`images` are card thumbnails).
                "full_images": [m.url for m in p.media if m.media_type != "video"],
                # Short product clips an admin attached alongside the photos. Only the
                # product detail gallery renders these - cards/heroes stay images-only.
                "videos": product_media[p.id][1],
                "rating": ratings.get(p.id),
                "extra": p.extra or {},
                "input_fields": public_input_fields(p.input_fields, linked),
                # Normalized here rather than handed over raw so the storefront
                # never has to sort, dedupe or invent a label for these - see
                # js/shared/bulk-tiers.js, which only picks and formats.
                "bulk_discounts": normalize_bulk_tiers(p.bulk_discounts),
                "delivery_days": p.delivery_days,
                "type": p.type,
                "stock": p.stock,
                "search_keywords": p.search_keywords or [],
            }
            for p in active_products
        ]

        # `url` is the thumbnail for the portfolio strip; `full` is the original
        # for anywhere a portfolio photo is opened large.
        folio[c.slug] = [{"url": cld_optimize(m.url), "full": m.url, "caption": m.alt} for m in c.media]
        folio_titles[c.slug] = c.folio_title or f"{c.name} Portfolio"

        # Hero / banner pictures are shown full width, so they're sent as the
        # original - a 640px card thumbnail stretched across a desktop banner is
        # exactly the blur this app should never show.
        if c.hero_image_url:
            category_images[c.slug] = c.hero_image_url

        if c.show_in_hero and c.hero_image_url:
            hero.append({"id": c.slug, "title": c.name, "tag": c.hero_tagline or "", "img": c.hero_image_url})

    result = {
        "page": page.slug,
        "categories": cat_list,
        "packages": packages,
        "folio": folio,
        "folio_titles": folio_titles,
        "category_images": category_images,
        "hero": hero,
    }
    return result


@router.get("/product/{product_id}")
def get_product(product_id: str, db: Session = Depends(get_db)):
    """One product's authoritative record, by id. booking.html fetches this instead
    of trusting the price/tier/features it was linked with in its own URL query
    string — those are only ever a display hint from the page that built the link,
    never something a visitor should be able to edit by hand before checkout."""
    product = (
        db.query(Product)
        .options(selectinload(Product.media), selectinload(Product.category))
        .filter(Product.id == product_id, Product.is_active == True)
        .first()
    )
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")

    avg_rating = (
        db.query(func.avg(Review.rating))
        .filter(Review.product_id == product.id, Review.is_approved == True)
        .scalar()
    )

    category = product.category
    package_media = sorted([m for m in product.media if m.kind == "package"], key=lambda m: m.sort)
    package_images, package_videos = split_media(package_media)
    return {
        "id": product.id,
        "category": {"id": category.slug, "name": category.name, "icon": category.icon or ""},
        "tier": product.tier or "",
        "title": product.title,
        "description": product.description or "",
        "price": format_price(product),
        "mrp": format_mrp(product),
        "feat": product.features or [],
        "images": package_images,
        # The same photos, same order, as uploaded rather than through
        # cld_optimize()'s 640px thumbnail - for the detail page's main gallery
        # image, which is shown large (and zoomed) where a thumbnail looks soft.
        # `images` stays the thumbnails for the thumb strip and every other surface.
        "full_images": [m.url for m in package_media if m.media_type != "video"],
        "videos": package_videos,
        "rating": round(float(avg_rating), 1) if avg_rating else None,
        "extra": product.extra or {},
        "input_fields": public_input_fields(product.input_fields, linked_products(db, [product])),
        "bulk_discounts": normalize_bulk_tiers(product.bulk_discounts),
        "delivery_days": product.delivery_days,
        "type": product.type,
        "stock": product.stock,
        "search_keywords": product.search_keywords or [],
    }


# ---------------------------------------------------------------- other public, unprefixed
# endpoints (reviews, homepage, flat product listing) that don't fit under /api/catalog/*

reviews_router = APIRouter(tags=["reviews"])

_homepage_cache: dict[str, tuple[float, dict]] = {}
_products_cache: dict[str, tuple[float, list]] = {}
_menu_cache: dict[str, tuple[float, dict]] = {}


def invalidate_catalog_cache() -> None:
    """Clears every storefront cache (page bundles, homepage, flat product list) so
    an admin's change is live on the next request instead of waiting out the 30s
    TTL. Admin write endpoints call this right after commit. Clearing is O(1) and
    always safe - worst case the next visitor's request just pays the one DB round
    trip that would've happened anyway once the TTL expired, then re-caches."""
    global _cache_generation
    _cache_generation += 1
    _page_bundle_cache.clear()
    _homepage_cache.clear()
    _products_cache.clear()
    _menu_cache.clear()


def warm_catalog_cache() -> None:
    """Called once at app startup (see main.py's lifespan) so the *first* real
    visitor after a deploy/restart doesn't land on a cold cache and pay the
    ~1.5s Supabase round trip that page_bundle()/public_homepage() would
    otherwise only pay on demand. Best-effort: a failure here (e.g. DB not
    reachable yet) just means the first real request warms the cache the
    normal way instead - it must never block or crash startup."""
    # Every image page_bundle()/public_homepage() touch below goes through
    # cld_optimize() -> storage.get_or_create_thumbnail(), a real R2 round trip
    # (~300ms even on a cache hit, much more on a first-ever cold generate).
    # Warming all of them concurrently first means the sequential page_bundle()
    # calls that follow just hit get_or_create_thumbnail's in-process memo - the
    # difference between a few seconds and several minutes of startup at this
    # image count (see warm_thumbnails()). The url list is gathered through its
    # own short-lived session, closed *before* that network-bound call - holding
    # a session open across a 100s+ call would leave a long "idle in transaction"
    # connection, which is exactly what can block a concurrent migration's
    # ALTER TABLE from acquiring its lock.
    try:
        warm_db = SessionLocal()
        try:
            urls = [r[0] for r in warm_db.query(Media.url).filter(Media.media_type != "video").all()]
            for thumb, hero in warm_db.query(Category.thumb_image_url, Category.hero_image_url).all():
                urls += [u for u in (thumb, hero) if u]
        finally:
            warm_db.close()
        warm_thumbnails(urls)
    except Exception:
        logger.warning("Thumbnail warm-up failed", exc_info=True)

    db = SessionLocal()
    try:
        slugs = [p.slug for p in db.query(SitePage).filter(SitePage.is_active == True).all()]
        for slug in slugs:
            try:
                page_bundle(slug, db)
            except Exception:
                logger.warning("Cache warm-up failed for page %r", slug, exc_info=True)
        try:
            public_homepage(db)
        except Exception:
            logger.warning("Cache warm-up failed for homepage", exc_info=True)
    finally:
        db.close()


@reviews_router.get("/api/homepage")
def public_homepage(db: Session = Depends(get_db)):
    """Public, unauthenticated equivalent of admin's homepage builder (admin.py's
    get_homepage) - resolves the curated layout into the actual featured
    categories/products a visitor's index.html should render, rather than the
    admin version's full "pick from everything" list (which is every active
    product site-wide - far more than a homepage needs)."""
    cached = _homepage_cache.get("v")
    if cached and time.monotonic() - cached[0] < _PAGE_BUNDLE_CACHE_TTL_SECONDS:
        return cached[1]
    gen = _cache_generation

    setting = db.get(Setting, HOMEPAGE_KEY)
    layout = setting.value if setting else {}
    category_ids = layout.get("category_ids", [])
    product_ids = layout.get("product_ids", [])

    if category_ids:
        cats = db.query(Category).filter(Category.is_active == True, Category.id.in_(category_ids)).all()
        cat_by_id = {c.id: c for c in cats}
        ordered_cats = [cat_by_id[i] for i in category_ids if i in cat_by_id]
    else:
        # Nothing curated yet - fall back to the first few active categories so
        # the homepage is never blank before an admin sets up the layout.
        ordered_cats = db.query(Category).filter(Category.is_active == True).order_by(Category.sort).limit(8).all()

    if product_ids:
        prods = (
            db.query(Product).options(selectinload(Product.media))
            .filter(Product.is_active == True, Product.id.in_(product_ids)).all()
        )
        prod_by_id = {p.id: p for p in prods}
        ordered_prods = [prod_by_id[i] for i in product_ids if i in prod_by_id]
    else:
        # Nothing curated yet - fall back to the first few active products so
        # the homepage is never blank before an admin sets up the layout.
        ordered_prods = (
            db.query(Product).options(selectinload(Product.media))
            .filter(Product.is_active == True)
            .order_by(Product.sort).limit(8).all()
        )

    result = {
        "categories": [
            {"id": c.id, "slug": c.slug, "name": c.name, "image": cld_optimize(c.thumb_image_url or c.hero_image_url)}
            for c in ordered_cats
        ],
        "products": [
            {
                "id": p.id, "title": p.title,
                # First *image*, not first media row - a product whose gallery leads
                # with a video would otherwise put an MP4 in this homepage card's <img>.
                "image": next((cld_optimize(m.url) for m in p.media if m.media_type != "video"), None),
                "price": display_pricing(p)[0],
            }
            for p in ordered_prods
        ],
    }
    if gen == _cache_generation:
        _homepage_cache["v"] = (time.monotonic(), result)
    return result


@reviews_router.get("/api/menu")
def public_site_menu(name: str = Query("main", pattern="^[a-z]{1,20}$"), db: Session = Depends(get_db)):
    """A category menu bar the storefront renders (js/shared/site-menu.js), as edited
    in admin's Menu section - "main" or one page's own menu (see site_menu.MENUS).
    Requested on every page view, so it's cached the same way as the homepage; admin
    menu/catalog writes call invalidate_catalog_cache()."""
    if name not in MENUS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown menu")
    cached = _menu_cache.get(name)
    if cached and time.monotonic() - cached[0] < _PAGE_BUNDLE_CACHE_TTL_SECONDS:
        return cached[1]
    gen = _cache_generation
    menu, _ = get_site_menu(db, name)
    result = public_menu(db, menu, MENUS[name]["layout"])
    if gen == _cache_generation:
        _menu_cache[name] = (time.monotonic(), result)
    return result


@reviews_router.get("/api/products")
def public_products(
    category_id: str | None = None,
    page: int = Query(1, ge=1),
    # Both callers that need "every live product in one call" (catalog.js's
    # mergeLiveCatalogProducts(), search.js's loadLiveProducts()) request
    # page_size=1000 - a le=200 cap made every one of those requests fail
    # with a 422 that both callers silently swallowed (just console.error),
    # so catalog.html never actually merged in a single admin-added product
    # and nav search never found one either. The docstring below already
    # explains why this costs nothing extra: the whole active-product set
    # (currently 233 rows) is fetched and cached as one query regardless of
    # the requested page_size, so raising this cap doesn't add DB load - it
    # just lets it hand back what it already has in one response instead of
    # rejecting the request outright.
    page_size: int = Query(24, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    """Public flat product listing across every category/page - what catalog.html's
    browse-all/wishlist view needs. Mirrors admin's GET /api/admin/products but
    public and is_active-only. The full active-product set is small (low hundreds
    of rows), so it's cached whole for 30s and paginated in Python rather than
    re-querying per page/filter combination."""
    cached = _products_cache.get("v")
    if not (cached and time.monotonic() - cached[0] < _PAGE_BUNDLE_CACHE_TTL_SECONDS):
        gen = _cache_generation
        rows = (
            db.query(Product)
            .options(
                selectinload(Product.media),
                selectinload(Product.category).selectinload(Category.page),
            )
            .filter(Product.is_active == True)
            .order_by(Product.sort)
            .all()
        )
        serialized = [
            {
                "id": p.id, "title": p.title, "slug": p.slug,
                "description": p.description or "",
                # The priced-dropdown option a shopper lands on, not the bare
                # Product.price - see display_pricing().
                "price": display_pricing(p)[0], "mrp": display_pricing(p)[1],
                # Images only: every consumer of this endpoint (nav search results,
                # wishlist tiles, cross-page card grids) renders images[0] as an <img>.
                "images": [cld_optimize(m.url) for m in p.media if m.media_type != "video"],
                "category_id": p.category_id,
                "category_slug": p.category.slug if p.category else None,
                "category_name": p.category.name if p.category else None,
                # Which storefront tab (gifts/photography/studio/corporate) this product
                # belongs under - needed by any page-agnostic search (nav search dropdown,
                # catalog.html) to link back to the right place / category filter.
                "page_slug": p.category.page.slug if p.category and p.category.page else None,
                "search_keywords": p.search_keywords or [],
                "bulk_discounts": normalize_bulk_tiers(p.bulk_discounts),
                # Needed by the cart, which can raise a line's quantity with no
                # product page in front of it and so has nowhere else to learn
                # what is actually in stock. Null means "not stock-tracked"
                # (a service, or a product an admin never gave a count).
                "type": p.type,
                "stock": p.stock,
            }
            for p in rows
        ]
        cached = (time.monotonic(), serialized)
        if gen == _cache_generation:
            _products_cache["v"] = cached
    all_products = cached[1]

    filtered = [p for p in all_products if not category_id or p["category_id"] == category_id]
    total = len(filtered)
    start = (page - 1) * page_size
    return {
        "items": filtered[start:start + page_size],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@reviews_router.get("/api/products/{slug}/reviews", response_model=list[ReviewOut])
def product_reviews(slug: str, db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.slug == slug).first()
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    rows = (
        db.query(Review, User.name)
        .join(User, Review.user_id == User.id)
        .filter(Review.product_id == product.id, Review.is_approved == True)
        .order_by(Review.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        ReviewOut(rating=r.rating, comment=r.comment, name=name or "Customer", created_at=r.created_at)
        for r, name in rows
    ]


@reviews_router.post("/api/reviews", status_code=status.HTTP_201_CREATED)
def submit_review(body: ReviewIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == body.product_id, Product.is_active == True).first()
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")

    review = db.query(Review).filter(Review.product_id == body.product_id, Review.user_id == user.id).first()
    if review:
        review.rating = body.rating
        review.comment = body.comment
    else:
        db.add(Review(product_id=body.product_id, user_id=user.id, rating=body.rating, comment=body.comment))

    db.commit()
    return {"message": "Review saved"}
