"""The storefront's category menu bar (Home / Photography / Gifts / ... with mega
dropdowns). It used to be hand-copied into every HTML page; it now lives in one
Setting row that the admin "Menu" section edits and js/shared/site-menu.js renders.

Menu entries point at a *target* (a page, a category, a product, or - as a last
resort - a custom URL) rather than a pasted URL. The URL is built here from live
catalog data each time the public menu is (re)cached, so a renamed product keeps
working and a hidden category/product quietly drops out of the menu.

There are several menus (see MENUS): the main one shared by most pages, plus the
Gift Shop, Corporate and Photography pages' own category menus. Until an admin
saves one, its default (what used to be hardcoded in that page's HTML) is served,
so the storefront never shows an empty bar."""
import copy
import json
from functools import lru_cache
from pathlib import Path
from urllib.parse import quote, urlencode

from sqlalchemy.orm import Session, joinedload, selectinload

from ..models import Category, Product, Setting

SITE_MENU_KEY = "site_menu"
_SEED_DIR = Path(__file__).resolve().parent.parent / "seed_data"

# name -> what the admin sees, where it's stored, and how the storefront draws it.
# "photography" layout = that page's richer dropdown (photo cards, packages box,
# promo card with a button, benefits strip); "standard" = columns of links + promo;
# "studio" is described on its entry.
MENUS = {
    "main": {"label": "Main site menu", "layout": "standard", "key": SITE_MENU_KEY, "file": "site_menu.json",
             "pages": "Home, About Us, Contact Us, Cart, Bulk Orders, My Account / Orders / Bookings"},
    "gifts": {"label": "Gift Shop page", "layout": "standard", "key": "site_menu_gifts",
              "file": "site_menu_gifts.json", "pages": "Customised Gift Shop"},
    "corporate": {"label": "Corporate page", "layout": "standard", "key": "site_menu_corporate",
                  "file": "site_menu_corporate.json", "pages": "Corporate Gifts"},
    "photography": {"label": "Photography pages", "layout": "photography", "key": "site_menu_photography",
                    "file": "site_menu_photography.json",
                    "pages": "Photography, Equipment Booking, Booking Form, Booking Confirmation, Equipment Details"},
    # "studio" layout = that page's bar: category links whose dropdowns list the
    # category's packages automatically (unless given columns), plus a "More" menu.
    "studio": {"label": "Studio Services page", "layout": "studio", "key": "site_menu_studio",
               "file": "site_menu_studio.json", "pages": "Studio Services"},
}


def menu_list() -> list[dict]:
    return [{"name": n, "label": m["label"], "layout": m["layout"], "pages": m["pages"]} for n, m in MENUS.items()]

# Every storefront page a menu entry can open, as (slug, name). The slug is the
# HTML file name without ".html". The four catalog pages also have categories.
SITE_PAGES = [
    ("index", "Home"),
    ("photography", "Photography"),
    ("gifts", "Customised Gift Shop"),
    ("studio", "Studio Services"),
    ("corporate", "Corporate Gifts"),
    ("bulk-orders", "Bulk Orders"),
    ("booking", "Equipment Booking"),
    ("about-us", "About Us"),
    ("contact-us", "Contact Us"),
    ("cart", "Cart"),
    ("my-account", "My Account"),
    ("my-orders", "My Orders"),
    ("my-bookings", "My Bookings"),
]
_PAGE_SLUGS = {slug for slug, _ in SITE_PAGES}


@lru_cache(maxsize=None)
def _default_menu(name: str) -> dict:
    with open(_SEED_DIR / MENUS[name]["file"], encoding="utf-8") as f:
        return json.load(f)


def default_menu(name: str = "main") -> dict:
    # Deep copy so a caller mutating the result can't corrupt the cached default.
    return copy.deepcopy(_default_menu(name))


def get_site_menu(db: Session, name: str = "main") -> tuple[dict, bool]:
    """Returns (menu, is_default) - the raw, editable menu."""
    setting = db.get(Setting, MENUS[name]["key"])
    if setting and setting.value and setting.value.get("items"):
        return setting.value, False
    return default_menu(name), True


# ---------------------------------------------------------------- picker data (admin)

def _first_image(media) -> str | None:
    return next((m.url for m in media if m.media_type != "video"), None)


def menu_targets(db: Session) -> dict:
    """Everything the admin link picker offers: pages, categories, products."""
    cats = (
        db.query(Category).options(joinedload(Category.page))
        .order_by(Category.sort).all()
    )
    products = (
        db.query(Product).options(selectinload(Product.media), joinedload(Product.category).joinedload(Category.page))
        .order_by(Product.sort).all()
    )
    return {
        "pages": [{"slug": s, "name": n} for s, n in SITE_PAGES],
        "categories": [
            {
                "id": c.id, "slug": c.slug, "name": c.name, "page": c.page.slug,
                "is_active": bool(c.is_active and c.page.is_active),
                "image": c.thumb_image_url or c.hero_image_url,
            }
            for c in cats if c.page
        ],
        "products": [
            {
                "id": p.id, "title": p.title, "page": p.category.page.slug,
                "category": p.category.slug, "category_name": p.category.name,
                "is_active": bool(p.is_active and p.category.is_active),
                "image": _first_image(p.media),
            }
            for p in products if p.category and p.category.page
        ],
    }


# ---------------------------------------------------------------- public menu

class _Resolver:
    """Turns targets into storefront URLs, loading only what the menu references."""

    def __init__(self, db: Session, menu: dict):
        self.db = db
        product_ids = set()
        for t in _all_targets(menu):
            if t and t.get("type") == "product" and t.get("product_id"):
                product_ids.add(t["product_id"])
        self.cats = {
            (c.page.slug, c.slug): c
            for c in db.query(Category).options(joinedload(Category.page)).all() if c.page
        }
        self.products = {
            p.id: p for p in (
                db.query(Product)
                .options(selectinload(Product.media), joinedload(Product.category).joinedload(Category.page))
                .filter(Product.id.in_(product_ids)).all()
            )
        } if product_ids else {}

    def card_defaults(self, t: dict | None) -> tuple[str, str]:
        """(image, description) a "cards" link falls back to when left blank."""
        if t and t.get("type") == "category":
            c = self.cats.get((t.get("page"), t.get("category")))
            if c:
                return c.thumb_image_url or c.hero_image_url or "", c.hero_tagline or ""
        if t and t.get("type") == "product":
            p = self.products.get(t.get("product_id"))
            if p:
                return _first_image(p.media) or "", ""
        return "", ""

    def url(self, t: dict | None) -> str | None:
        """The link for a target, or None when it shouldn't be shown (hidden or deleted)."""
        if not t:
            return None
        kind = t.get("type")
        if kind == "url":
            return t.get("url") or None
        if kind == "page":
            return f"{t['page']}.html" if t.get("page") in _PAGE_SLUGS else None
        if kind == "category":
            cat = self.cats.get((t.get("page"), t.get("category")))
            # A category that isn't in the catalog (yet) still gets its link - the
            # page itself decides what to show for it. Only a deliberately hidden
            # one is dropped.
            if cat is not None and not (cat.is_active and cat.page.is_active):
                return None
            return category_url(t["page"], t["category"], t.get("keyword", ""))
        if kind == "product":
            p = self.products.get(t.get("product_id"))
            if p is None or not p.is_active or not p.category or not p.category.is_active:
                return None
            return product_url(p)
        return None


def category_url(page: str, category: str, keyword: str = "") -> str:
    if page == "gifts":
        q = {"view": "category", "category": category}
        if keyword:
            q["search"] = keyword
        return "gifts.html?" + urlencode(q)
    return f"{page}.html?" + urlencode({"category": category})


def product_url(p: Product) -> str:
    """Same deep-link scheme as js/shared/search.js's buildProductUrl()."""
    from ..routers.catalog import format_price  # local import: catalog imports this module

    page, name = p.category.page.slug, quote(p.title, safe="")
    if page == "gifts":
        return f"gifts.html?view=product&product={name}"
    if page == "corporate":
        img = _first_image(p.media) or ""
        return (f"corporate.html?openProduct={name}&openPrice={quote(format_price(p), safe='')}"
                f"&openImg={quote(img, safe='')}&pid={quote(p.id, safe='')}")
    if page == "studio":
        return f"studio.html?openProduct={name}&pid={quote(p.id, safe='')}"
    # photography has no per-product opener - its category listing is the closest.
    return category_url(page, p.category.slug)


def _all_targets(menu: dict):
    for item in menu.get("items", []):
        yield item.get("target")
        if item.get("promo"):
            yield item["promo"].get("target")
        for col in item.get("columns", []):
            if col.get("cta"):
                yield col["cta"].get("target")
            for link in col.get("links", []):
                yield link.get("target")


def public_menu(db: Session, menu: dict, layout: str = "standard") -> dict:
    """What visitors get: hidden entries dropped, every target resolved to a URL,
    in the {label, url, columns, promo} shape js/shared/site-menu.js renders."""
    r = _Resolver(db, menu)
    items = []
    for item in menu.get("items", []):
        if not item.get("is_active", True):
            continue
        url = r.url(item.get("target"))
        if not url:
            continue
        columns = []
        if item.get("dropdown_active", True):
            for col in item.get("columns", []):
                if not col.get("is_active", True):
                    continue
                links = []
                for link in col.get("links", []):
                    if not link.get("is_active", True):
                        continue
                    if link.get("heading") is not None:
                        links.append({"heading": link["heading"]})
                        continue
                    link_url = r.url(link.get("target"))
                    if not link_url:
                        continue
                    out = {"label": link["label"], "url": link_url, "badge": link.get("badge", "")}
                    if col.get("style") == "cards":
                        img, desc = r.card_defaults(link.get("target"))
                        out["image"] = link.get("image") or img
                        out["description"] = link.get("description") or desc
                    links.append(out)
                # Drop sub-headings left with nothing under them.
                links = [l for i, l in enumerate(links)
                         if "heading" not in l or (i + 1 < len(links) and "heading" not in links[i + 1])]
                if any("url" in l for l in links):
                    cta = col.get("cta")
                    if cta and (cta.get("title") or cta.get("text") or cta.get("button")):
                        cta = {"title": cta.get("title", ""), "text": cta.get("text", ""),
                               "button": cta.get("button", ""), "url": r.url(cta.get("target")) or url}
                    else:
                        cta = None
                    columns.append({"title": col.get("title", ""), "style": col.get("style", "list"),
                                    "links": links, "cta": cta})
        promo = None
        p = item.get("promo")
        if columns and p and (p.get("image") or p.get("title")):
            promo = {
                "url": r.url(p.get("target")) or url,
                "image": p.get("image", ""), "tag": p.get("tag", ""), "title": p.get("title", ""),
                "subtitle": p.get("subtitle", ""), "button": p.get("button", ""),
            }
        out = {"label": item["label"], "url": url, "columns": columns, "promo": promo}
        if layout == "studio":
            t = item.get("target") or {}
            out["in_more"] = bool(item.get("in_more"))
            if t.get("type") == "category" and t.get("page") == "studio":
                out["category"] = t["category"]
                # No columns of its own: studio.js fills the dropdown from that
                # category's live packages (with a "Starting at" promo).
                out["auto"] = not columns and item.get("dropdown_active", True)
        items.append(out)
    result = {"layout": layout, "items": items}
    if layout == "photography":
        result["benefits"] = [b for b in menu.get("benefits", []) if b.get("title")]
    return result
