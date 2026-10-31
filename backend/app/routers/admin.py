import csv
import io
import logging
import re
import time
from urllib.parse import urlparse
from datetime import date, datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, Form, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from ..config import get_settings
from ..database import get_db
from ..deps import audit, require_owner, require_staff
from ..models import (
    Address, AuditLog, BlockedEmail, Booking, Category, ContactMessage, Coupon, CustomerUpload,
    Media, Order,
    OrderAddressChangeRequest, OrderCancellationRequest, OrderTrackingEvent,
    OtpCode, Product, Review, Setting, SitePage, User,
)
from ..schemas import (
    AddressChangeDecisionIn, AdminAddressChangeRequestOut, AdminCancellationRequestOut,
    ArrangeIn, ArtworkHoldIn, ArtworkPurgeIn, ArtworkRetentionIn,
    BlockEmailIn, BookingOut, BookingStatusUpdate, CancellationDecisionIn, CategoryIn,
    CategoryOut, CategoryReorderIn, ContactOut, ContactReadIn, CouponIn, CouponOut, CustomerOut,
    HomepageLayoutIn, MediaIn, MediaLibraryOut,
    MediaOut, MediaReorderIn, MediaUsageOut, OrderOut, OrderStatusUpdate, ProductIn, ProductOut, ProductPatch,
    SettingIn, SettingOut, SiteMenuIn, SitePageIn, SitePageOut, StaffIn, TrackingUpdateIn, UserOut,
)
from ..security import hash_password
from ..services.audit_changes import describe_changes
from ..services.inventory import restock
from ..services.media import process_image, process_video, sniff_video
from ..services.notifications import booking_event, notify, order_event
from ..services.policy import annotate_order, annotate_orders, refund_status as compute_refund_status
from ..services.pricing import deduct_order_item, normalize_bulk_tiers
from ..services.retention import (
    DEFAULT_RETENTION_DAYS, RETENTION_SETTING_KEY,
    TERMINAL_STATUSES as RETENTION_TERMINAL_STATUSES,
    get_retention_days, purge_due_artwork, purge_uploads_now, schedule_order_artwork_purge,
)
from ..services.site_menu import MENUS, default_menu, get_site_menu, menu_list, menu_targets
from ..services.storage import (
    CUSTOM_UPLOAD_FIELDS, get_or_create_thumbnail, purge_unreferenced_uploads, upload_media_library_asset,
)
from .catalog import invalidate_catalog_cache

router = APIRouter(prefix="/api/admin", tags=["admin"])
settings = get_settings()
logger = logging.getLogger(__name__)

# Minimal sanity check for admin-driven order status changes - not a full
# state machine, just enough to reject obviously-nonsensical backward moves
# (e.g. "delivered" -> "created"). cancelled/refunded are deliberately left
# out of this sequence since they can legitimately be reached from several
# points in the flow (an order can be cancelled/refunded from most states).
ORDER_STATUS_FLOW = ["created", "payment_pending", "cod_confirmed", "paid", "in_production", "shipped", "delivered"]

# Keep in sync with MAX_UPLOAD_FILES in admin/js/catalog.js - that's a
# per-selection-batch cap only, this is the authoritative cumulative cap
# (the frontend limit is a UX nicety, this is what actually blocks the DB
# from ending up with more photos than the admin UI is designed to show).
MAX_MEDIA_PER_ENTITY = 10


def _is_own_r2_url(url: str) -> bool:
    """A prefix check (url.startswith(r2_public_base_url)) passes for
    "https://pub-xxxx.r2.dev.attacker.com/..." since that's a real string prefix
    match while pointing at a completely different host - compare the parsed
    scheme+host instead, which is what the check actually means to enforce."""
    if not settings.r2_public_base_url:
        return False
    try:
        target = urlparse(url)
        base = urlparse(settings.r2_public_base_url)
    except ValueError:
        return False
    return bool(target.scheme) and bool(target.netloc) and target.scheme == base.scheme and target.netloc == base.netloc


def _validate_order_status_transition(current: str, new: str) -> None:
    if current == new:
        return
    if current in ("cancelled", "refunded"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Order is already {current} and its status cannot be changed further",
        )
    if current in ORDER_STATUS_FLOW and new in ORDER_STATUS_FLOW:
        if ORDER_STATUS_FLOW.index(new) < ORDER_STATUS_FLOW.index(current):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Cannot move order status backward from '{current}' to '{new}'",
            )

ORDER_STATUS_TRACKING_TITLES = {
    "created": "Order placed",
    "payment_pending": "Awaiting payment",
    "cod_confirmed": "Order confirmed (Cash on Delivery)",
    "paid": "Payment received",
    "in_production": "Designing",
    "shipped": "Order shipped",
    "delivered": "Order delivered",
    "cancelled": "Order cancelled",
    "refunded": "Order refunded",
}

ORDER_ADMIN_LOAD = (
    selectinload(Order.items), selectinload(Order.payments),
    # user/address are many-to-one (exactly one row per order) - joinedload
    # folds them into the main query instead of costing their own DB round
    # trip, which matters when the DB is remote and latency-bound.
    joinedload(Order.user), joinedload(Order.address),
    selectinload(Order.tracking_events),
    selectinload(Order.cancellation_requests),
    selectinload(Order.address_change_requests),
)

HOMEPAGE_KEY = "homepage_layout"

# Same cache-with-invalidation pattern as catalog.py's page_bundle(): the media
# picker (product/category "Choose from Media Library") re-fetches on every
# open, and the underlying Media table only changes on an admin write, so a
# short TTL removes the DB round-trip for repeat opens within that window
# without ever risking stale data past it - every write below that touches
# Media also calls _invalidate_media_library_cache() right after commit.
_MEDIA_LIBRARY_CACHE_TTL_SECONDS = 60
_media_library_cache: dict[tuple[str | None, str | None], tuple[float, list]] = {}


def _invalidate_media_library_cache() -> None:
    _media_library_cache.clear()

# Checkout now uploads these fields to Supabase Storage and stores a URL
# instead of base64 (see services/storage.py) - this stripping is a safety
# net for the fallback path (upload failed, base64 kept inline) and for any
# order placed before that change, so the list endpoint never ships a
# multi-MB blob regardless of which shape ends up in a given row.


def _is_inline_upload(value) -> bool:
    return isinstance(value, str) and value.startswith("data:")


def _strip_uploads(snapshot: dict) -> tuple[dict, int]:
    """Drops still-inline base64 uploads out of one order item's snapshot and
    reports how many there were, so the list endpoint can show a "N files"
    badge without shipping the files themselves.

    Two shapes have to be handled, not one. The legacy storefront keys
    (CUSTOM_UPLOAD_FIELDS) sit at the top of `customization`, but every upload
    from an admin-configured upload field (Product.input_fields) lands under
    `customization.fields[<fieldId>]` instead - as a single data: URI, or a
    list of them for a multi-file field. Counting only the legacy keys meant a
    dynamic-field order was never stripped at all (the whole base64 blob went
    out with the list, several MB per photo) and always reported upload_count
    0, so the badge never appeared for the field type actually in use. See
    orders.py's _externalize_customization(), which already walks both shapes."""
    customization = snapshot.get("customization")
    if not isinstance(customization, dict):
        return snapshot, 0

    upload_count = sum(1 for f in CUSTOM_UPLOAD_FIELDS if _is_inline_upload(customization.get(f)))

    fields = customization.get("fields")
    stripped_fields = None
    if isinstance(fields, dict):
        for key, value in fields.items():
            if _is_inline_upload(value):
                upload_count += 1
                if stripped_fields is None:
                    stripped_fields = dict(fields)
                # Replaced rather than removed: the admin UI keys its per-field
                # display off the field id, so dropping the key entirely would
                # make an uploaded field look like one the customer skipped.
                stripped_fields[key] = ""
            elif isinstance(value, list):
                inline = [v for v in value if _is_inline_upload(v)]
                if inline:
                    upload_count += len(inline)
                    if stripped_fields is None:
                        stripped_fields = dict(fields)
                    stripped_fields[key] = [v for v in value if not _is_inline_upload(v)]

    if not upload_count:
        return snapshot, 0

    trimmed = dict(snapshot)
    new_customization = {k: v for k, v in customization.items() if k not in CUSTOM_UPLOAD_FIELDS}
    if stripped_fields is not None:
        new_customization["fields"] = stripped_fields
    trimmed["customization"] = new_customization
    return trimmed, upload_count


def _strip_order_uploads(order_out: OrderOut) -> OrderOut:
    for item in order_out.items:
        item.product_snapshot, item.upload_count = _strip_uploads(item.product_snapshot)
    return order_out


# ---------------------------------------------------------------- dashboard

@router.get("/summary")
def dashboard_summary(admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    from sqlalchemy import func as sa_func, select

    paid_statuses = ("cod_confirmed", "paid", "in_production", "shipped", "delivered")
    row = db.execute(
        select(
            select(sa_func.count()).select_from(SitePage).scalar_subquery().label("pages"),
            select(sa_func.count()).select_from(Category).scalar_subquery().label("categories"),
            select(sa_func.count()).select_from(Product).scalar_subquery().label("products"),
            select(sa_func.count()).select_from(Coupon)
                .where(Coupon.is_active == True).scalar_subquery().label("coupons"),
            select(sa_func.count()).select_from(Booking)
                .where(Booking.status.in_(["enquiry", "advance_pending"]))
                .scalar_subquery().label("bookings_pending"),
            select(sa_func.count()).select_from(Booking).scalar_subquery().label("bookings_total"),
            select(sa_func.count()).select_from(Order)
                .where(Order.status.in_(["created", "payment_pending"]))
                .scalar_subquery().label("orders_pending"),
            select(sa_func.count()).select_from(Order).scalar_subquery().label("orders_total"),
            select(sa_func.coalesce(sa_func.sum(Order.total), 0))
                .where(Order.status.in_(paid_statuses)).scalar_subquery().label("revenue"),
            select(sa_func.count()).select_from(OrderCancellationRequest)
                .where(OrderCancellationRequest.status == "pending")
                .scalar_subquery().label("cancellation_requests_pending"),
            select(sa_func.count()).select_from(OrderAddressChangeRequest)
                .where(OrderAddressChangeRequest.status == "pending")
                .scalar_subquery().label("address_change_requests_pending"),
            # Surfaced on the dashboard so a contact-form enquiry is noticed even
            # if its notification email never arrived - see list_contact_messages.
            select(sa_func.count()).select_from(ContactMessage)
                .where(ContactMessage.is_read == False)
                .scalar_subquery().label("enquiries_unread"),
        )
    ).one()
    return {
        "pages": row.pages,
        "categories": row.categories,
        "products": row.products,
        "coupons": row.coupons,
        "bookings_pending": row.bookings_pending,
        "bookings_total": row.bookings_total,
        "orders_pending": row.orders_pending,
        "orders_total": row.orders_total,
        "revenue": float(row.revenue),
        "cancellation_requests_pending": row.cancellation_requests_pending,
        "address_change_requests_pending": row.address_change_requests_pending,
        "enquiries_unread": row.enquiries_unread,
    }


# ---------------------------------------------------------------- site pages

@router.get("/pages", response_model=list[SitePageOut])
def list_pages(admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    return db.query(SitePage).order_by(SitePage.sort).all()


@router.post("/pages", response_model=SitePageOut, status_code=status.HTTP_201_CREATED)
def create_page(body: SitePageIn, request: Request,
                admin: User = Depends(require_owner), db: Session = Depends(get_db)):
    if db.query(SitePage).filter(SitePage.slug == body.slug).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Slug already exists")
    page = SitePage(**body.model_dump())
    db.add(page)
    db.flush()
    audit(db, admin, "create", "site_page", page.id, {"slug": page.slug}, request)
    db.commit()
    db.refresh(page)
    return page


# ---------------------------------------------------------------- categories

def _category_out(c: Category) -> CategoryOut:
    return CategoryOut.model_validate(c)


@router.get("/categories", response_model=list[CategoryOut])
def list_categories(page: str | None = None, admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    query = db.query(Category)
    if page:
        site_page = db.query(SitePage).filter(SitePage.slug == page).first()
        if not site_page:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Page not found")
        query = query.filter(Category.page_id == site_page.id)
    return query.order_by(Category.sort, Category.name).all()


@router.post("/categories", response_model=CategoryOut, status_code=status.HTTP_201_CREATED)
def create_category(body: CategoryIn, request: Request,
                    admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    if not db.get(SitePage, body.page_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Page not found")
    clash = db.query(Category).filter(Category.page_id == body.page_id, Category.slug == body.slug).first()
    if clash:
        raise HTTPException(status.HTTP_409_CONFLICT, "Slug already exists on this page")
    cat = Category(**body.model_dump())
    db.add(cat)
    db.flush()
    audit(db, admin, "create", "category", cat.id, {"name": cat.name}, request)
    db.commit()
    db.refresh(cat)
    invalidate_catalog_cache()
    return _category_out(cat)


@router.put("/categories/reorder")
def reorder_categories(body: CategoryReorderIn, request: Request,
                       admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    # Must be registered before PUT /categories/{cat_id} below - otherwise
    # that path-param route would swallow this one first, treating "reorder"
    # as a category id and 404ing instead of ever reaching this handler.
    #
    # Scoped to page_id (like set_arrange is scoped to category_id) so a
    # stale/tampered id list can only ever reorder within the one page the
    # admin was looking at, never reach across into another page's categories.
    valid_ids = {
        c.id for c in db.query(Category.id).filter(Category.page_id == body.page_id).all()
    }
    mappings = [
        {"id": cat_id, "sort": position}
        for position, cat_id in enumerate(body.ids)
        if cat_id in valid_ids
    ]
    if mappings:
        db.bulk_update_mappings(Category, mappings)
    count = len(mappings)
    audit(db, admin, "reorder", "category", body.page_id, {"count": count}, request)
    db.commit()
    invalidate_catalog_cache()
    return {"ok": True, "count": count}


@router.put("/categories/{cat_id}", response_model=CategoryOut)
def update_category(cat_id: str, body: CategoryIn, request: Request,
                    admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    cat = db.get(Category, cat_id)
    if not cat:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    clash = (
        db.query(Category)
        .filter(Category.page_id == body.page_id, Category.slug == body.slug, Category.id != cat_id)
        .first()
    )
    if clash:
        raise HTTPException(status.HTTP_409_CONFLICT, "Slug already exists on this page")
    data = body.model_dump()
    changes = describe_changes(cat, data)
    for key, value in data.items():
        setattr(cat, key, value)
    audit(db, admin, "update", "category", cat.id, {"name": cat.name, "changes": changes}, request)
    db.commit()
    db.refresh(cat)
    invalidate_catalog_cache()
    return _category_out(cat)


@router.delete("/categories/{cat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(cat_id: str, request: Request,
                    admin: User = Depends(require_owner), db: Session = Depends(get_db)):
    cat = db.get(Category, cat_id)
    if not cat:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    audit(db, admin, "delete", "category", cat_id, {"name": cat.name}, request)
    # the category's own images, portfolio and every product's photos - purged from
    # R2 below only where nothing else (another product, a past order) still uses them
    urls = [cat.thumb_image_url, cat.hero_image_url, *(m.url for m in cat.media),
            *(m.url for p in cat.products for m in p.media)]
    db.delete(cat)
    db.commit()
    purge_unreferenced_uploads(db, urls)
    invalidate_catalog_cache()


# ---------------------------------------------------------------- category portfolio media

@router.get("/categories/{cat_id}/media", response_model=list[MediaOut])
def list_category_media(cat_id: str, admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    cat = db.get(Category, cat_id)
    if not cat:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    return sorted([m for m in cat.media if m.kind == "portfolio"], key=lambda m: m.sort)


@router.post("/categories/{cat_id}/media", response_model=MediaOut, status_code=status.HTTP_201_CREATED)
def add_category_media(cat_id: str, body: MediaIn, request: Request,
                       admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    cat = db.get(Category, cat_id)
    if not cat:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    existing = sum(1 for m in cat.media if m.kind == "portfolio")
    if existing >= MAX_MEDIA_PER_ENTITY:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"This category already has the maximum of {MAX_MEDIA_PER_ENTITY} photos",
        )
    # A category's portfolio is rendered only as <img> everywhere it appears
    # (sidebar thumb, hero banner, the folio strip) - there is no player to put a
    # clip in - so a video is refused here outright rather than silently stored as
    # a row that would render as a broken image. Product galleries are where video
    # belongs; see add_product_media below.
    if body.media_type == "video":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Videos can only be added to a product's photos, not a category portfolio",
        )
    # Force the kind this endpoint's URL already implies, instead of trusting
    # whatever the caller sent (MediaIn.kind defaults to "portfolio" when
    # omitted, which happens to be correct here only by coincidence - the
    # product-media endpoint below has the same field default to "portfolio"
    # too, which is wrong for it. Several real products ended up with photos
    # tagged "portfolio" this way and silently vanished from the storefront,
    # since catalog.py only ever serves a product's media where kind="package").
    media = Media(**{**body.model_dump(), "category_id": cat_id, "kind": "portfolio"})
    db.add(media)
    audit(db, admin, "create", "category_media", cat_id, {"url": media.url}, request)
    db.commit()
    db.refresh(media)
    invalidate_catalog_cache()
    _invalidate_media_library_cache()
    return media


@router.delete("/media/{media_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_media(media_id: str, request: Request,
                 admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    media = db.get(Media, media_id)
    if not media:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Media not found")
    audit(db, admin, "delete", "media", media_id, {}, request)
    url = media.url
    db.delete(media)
    db.commit()
    purge_unreferenced_uploads(db, [url])
    invalidate_catalog_cache()
    _invalidate_media_library_cache()


@router.put("/media/reorder")
def reorder_media(body: MediaReorderIn, request: Request,
                  admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    valid_ids = {m.id for m in db.query(Media.id).filter(Media.id.in_(body.ids)).all()}
    mappings = [
        {"id": media_id, "sort": position}
        for position, media_id in enumerate(body.ids)
        if media_id in valid_ids
    ]
    if mappings:
        db.bulk_update_mappings(Media, mappings)
    count = len(mappings)
    audit(db, admin, "reorder", "media", ",".join(body.ids[:1]) or "-", {"count": count}, request)
    db.commit()
    invalidate_catalog_cache()
    _invalidate_media_library_cache()
    return {"ok": True, "count": count}


# ---------------------------------------------------------------- products

def _product_out(p: Product) -> ProductOut:
    return ProductOut.model_validate(p)


@router.get("/products")
def admin_products(
    admin: User = Depends(require_staff), db: Session = Depends(get_db),
    category_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
):
    query = db.query(Product).options(selectinload(Product.media))
    if category_id:
        query = query.filter(Product.category_id == category_id)
    total = query.count()
    products = query.order_by(Product.sort).offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [_product_out(p).model_dump() for p in products], "total": total, "page": page}


@router.post("/products", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(body: ProductIn, request: Request,
                   admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    if not db.get(Category, body.category_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Category not found")
    if db.query(Product).filter(Product.slug == body.slug).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Slug already exists")
    if len(body.media) > MAX_MEDIA_PER_ENTITY:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"A product can have at most {MAX_MEDIA_PER_ENTITY} photos/videos",
        )
    data = body.model_dump(exclude={"media"})
    # Stored canonically (sorted by min_qty, deduped, default labels filled in)
    # so the storefront and the pricing engine read identical tiers whichever
    # order the admin happened to add the rows in.
    data["bulk_discounts"] = normalize_bulk_tiers(data.get("bulk_discounts"))
    product = Product(**data)
    db.add(product)
    db.flush()
    for i, m in enumerate(body.media):
        # kind="package" forced, not m.kind - see add_product_media's comment.
        db.add(Media(product_id=product.id, url=m.url, alt=m.alt, kind="package",
                     media_type=m.media_type, sort=m.sort or i))
    audit(db, admin, "create", "product", product.id, {"title": product.title}, request)
    db.commit()
    db.refresh(product)
    invalidate_catalog_cache()
    return _product_out(product)


@router.patch("/products/{product_id}", response_model=ProductOut)
def update_product(product_id: str, body: ProductPatch, request: Request,
                   admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    data = body.model_dump(exclude_unset=True)
    if "bulk_discounts" in data:
        data["bulk_discounts"] = normalize_bulk_tiers(data["bulk_discounts"])
    if "category_id" in data and not db.get(Category, data["category_id"]):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Category not found")
    if "slug" in data:
        clash = db.query(Product).filter(Product.slug == data["slug"], Product.id != product_id).first()
        if clash:
            raise HTTPException(status.HTTP_409_CONFLICT, "Slug already exists")
    changes = describe_changes(product, data)
    for key, value in data.items():
        setattr(product, key, value)
    audit(db, admin, "update", "product", product.id, {"title": product.title, "changes": changes}, request)
    db.commit()
    db.refresh(product)
    invalidate_catalog_cache()
    return _product_out(product)


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: str, request: Request,
                   admin: User = Depends(require_owner), db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    audit(db, admin, "delete", "product", product_id, {"title": product.title}, request)
    urls = [m.url for m in product.media]
    db.delete(product)
    db.commit()
    purge_unreferenced_uploads(db, urls)
    invalidate_catalog_cache()


@router.post("/products/{product_id}/media", response_model=MediaOut, status_code=status.HTTP_201_CREATED)
def add_product_media(product_id: str, body: MediaIn, request: Request,
                      admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    if len(product.media) >= MAX_MEDIA_PER_ENTITY:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"This product already has the maximum of {MAX_MEDIA_PER_ENTITY} photos/videos",
        )
    # Force kind="package" regardless of what the caller sent - see the matching
    # comment in add_category_media above. This is the endpoint where trusting
    # MediaIn.kind's "portfolio" default actually broke things: several real
    # products' photos got saved as kind="portfolio" and were then silently
    # excluded from the storefront (catalog.py only serves a product's media
    # where kind="package"), while still showing up fine in this admin panel's
    # own photo list, which doesn't filter by kind.
    media = Media(**{**body.model_dump(), "product_id": product_id, "kind": "package"})
    db.add(media)
    audit(db, admin, "create", "product_media", product_id, {"url": media.url}, request)
    db.commit()
    db.refresh(media)
    invalidate_catalog_cache()
    _invalidate_media_library_cache()
    return media


# ---------------------------------------------------------------- coupons

@router.get("/coupons", response_model=list[CouponOut])
def list_coupons(admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    return db.query(Coupon).order_by(Coupon.created_at.desc()).all()


@router.post("/coupons", response_model=CouponOut, status_code=status.HTTP_201_CREATED)
def create_coupon(body: CouponIn, request: Request,
                  admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    if db.query(Coupon).filter(Coupon.code == body.code.upper()).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Coupon code already exists")
    data = body.model_dump()
    data["code"] = data["code"].upper()
    coupon = Coupon(**data)
    db.add(coupon)
    db.flush()
    audit(db, admin, "create", "coupon", coupon.id, {"code": coupon.code}, request)
    db.commit()
    db.refresh(coupon)
    return coupon


@router.put("/coupons/{coupon_id}", response_model=CouponOut)
def update_coupon(coupon_id: str, body: CouponIn, request: Request,
                  admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    coupon = db.get(Coupon, coupon_id)
    if not coupon:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coupon not found")
    data = body.model_dump()
    data["code"] = data["code"].upper()
    clash = db.query(Coupon).filter(Coupon.code == data["code"], Coupon.id != coupon_id).first()
    if clash:
        raise HTTPException(status.HTTP_409_CONFLICT, "Coupon code already exists")
    changes = describe_changes(coupon, data)
    for key, value in data.items():
        setattr(coupon, key, value)
    audit(db, admin, "update", "coupon", coupon.id, {"code": coupon.code, "changes": changes}, request)
    db.commit()
    db.refresh(coupon)
    return coupon


@router.delete("/coupons/{coupon_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_coupon(coupon_id: str, request: Request,
                  admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    coupon = db.get(Coupon, coupon_id)
    if not coupon:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Coupon not found")
    audit(db, admin, "delete", "coupon", coupon_id, {"code": coupon.code}, request)
    db.delete(coupon)
    db.commit()


# ---------------------------------------------------------------- bookings

@router.get("/bookings", response_model=list[BookingOut])
def list_bookings(status_filter: str | None = None,
                  admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    query = db.query(Booking)
    if status_filter:
        query = query.filter(Booking.status == status_filter)
    bookings = query.order_by(Booking.created_at.desc()).all()

    # One query for every referenced package's configured advance, rather than a
    # lazy-load per booking - see BookingOut.advance_expected for why it's here.
    product_ids = {b.product_id for b in bookings if b.product_id}
    advances = dict(
        db.query(Product.id, Product.advance_amount).filter(Product.id.in_(product_ids)).all()
    ) if product_ids else {}

    out = []
    for b in bookings:
        row = BookingOut.model_validate(b)
        row.advance_expected = advances.get(b.product_id)
        out.append(row)
    return out


@router.patch("/bookings/{booking_id}", response_model=BookingOut)
def update_booking_status(booking_id: str, body: BookingStatusUpdate, request: Request,
                          admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    booking = db.get(Booking, booking_id)
    if not booking:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking not found")
    booking.status = body.status
    booking_event(db, booking, body.status)
    audit(db, admin, "update_status", "booking", booking_id, {"status": body.status}, request)
    db.commit()
    db.refresh(booking)
    return booking


# ---------------------------------------------------------------- settings

@router.get("/settings/{key}", response_model=SettingOut)
def get_setting(key: str, admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    setting = db.get(Setting, key)
    if not setting:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Setting not found")
    return setting


@router.put("/settings/{key}", response_model=SettingOut)
def set_setting(key: str, body: SettingIn, request: Request,
                admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    setting = db.get(Setting, key)
    if setting:
        setting.value = body.value
    else:
        setting = Setting(key=key, value=body.value)
        db.add(setting)
    audit(db, admin, "set", "setting", key, {}, request)
    db.commit()
    db.refresh(setting)
    return setting


# ---------------------------------------------------------------- staff & audit log (owner only)

@router.get("/staff", response_model=list[UserOut])
def list_staff(admin: User = Depends(require_owner), db: Session = Depends(get_db)):
    return db.query(User).filter(User.role.in_(["staff", "owner"])).order_by(User.created_at).all()


@router.post("/staff", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_staff(body: StaffIn, request: Request,
                 admin: User = Depends(require_owner), db: Session = Depends(get_db)):
    email = body.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(email=email, name=body.name, role=body.role, password_hash=hash_password(body.password))
    db.add(user)
    db.flush()
    audit(db, admin, "create", "staff", user.id, {"email": email}, request)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/staff/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_staff(user_id: str, request: Request,
                     admin: User = Depends(require_owner), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff not found")
    if user.role == "owner" and user.is_active:
        other_active_owners = (
            db.query(User)
            .filter(User.role == "owner", User.is_active.is_(True), User.id != user.id)
            .count()
        )
        if other_active_owners == 0:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Cannot deactivate the last active owner account",
            )
    user.is_active = False
    audit(db, admin, "deactivate", "staff", user_id, {}, request)
    db.commit()


@router.post("/staff/{user_id}/reactivate", response_model=UserOut)
def reactivate_staff(user_id: str, request: Request,
                     admin: User = Depends(require_owner), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Staff not found")
    user.is_active = True
    audit(db, admin, "reactivate", "staff", user_id, {}, request)
    db.commit()
    db.refresh(user)
    return user


@router.get("/audit-log")
def list_audit_log(limit: int = 100, admin: User = Depends(require_owner), db: Session = Depends(get_db)):
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(min(limit, 500)).all()
    # Who did it, by name and email: the page used to show only actions, so with
    # several owner logins there was no way to tell whose save was whose.
    user_ids = {l.user_id for l in logs if l.user_id}
    users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}
    return [
        {
            "id": l.id, "user_id": l.user_id, "action": l.action, "entity": l.entity,
            "entity_id": l.entity_id, "detail": l.detail, "ip": l.ip,
            "created_at": l.created_at.isoformat(),
            "user_name": users[l.user_id].name if l.user_id in users else None,
            "user_email": users[l.user_id].email if l.user_id in users else None,
            "user_role": users[l.user_id].role if l.user_id in users else None,
        }
        for l in logs
    ]


@router.delete("/audit-log")
def clear_audit_log(request: Request, older_than_days: int | None = None,
                    admin: User = Depends(require_owner), db: Session = Depends(get_db)):
    """Clears the audit_log table - which backs both the Audit Log and Activity
    pages (Activity is just that same table filtered to login/logout/signup/
    admin_login), so this empties both at once. Writes one fresh entry recording
    the clear itself, so there's always a record that a wipe happened and by whom."""
    query = db.query(AuditLog)
    if older_than_days is not None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=older_than_days)
        query = query.filter(AuditLog.created_at < cutoff)
    deleted = query.delete(synchronize_session=False)
    audit(db, admin, "clear_audit_log", "audit_log", None, {"deleted": deleted, "older_than_days": older_than_days}, request)
    db.commit()
    return {"deleted": deleted}


@router.get("/activity")
def list_activity(admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    logs = (
        db.query(AuditLog)
        .filter(AuditLog.action.in_(["login", "logout", "signup", "admin_login"]))
        .order_by(AuditLog.created_at.desc())
        .limit(60)
        .all()
    )
    user_ids = {l.user_id for l in logs if l.user_id}
    users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}
    return [
        {
            "id": l.id, "action": l.action,
            "who": users[l.user_id].name if l.user_id in users and users[l.user_id].name else None,
            "email": users[l.user_id].email if l.user_id in users else None,
            "ip": l.ip, "at": l.created_at.isoformat(),
        }
        for l in logs
    ]


# ---------------------------------------------------------------- orders

@router.get("/orders", response_model=list[OrderOut])
def list_orders(status_filter: str | None = None,
                admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    query = db.query(Order).options(*ORDER_ADMIN_LOAD)
    if status_filter:
        query = query.filter(Order.status == status_filter)
    orders = query.order_by(Order.created_at.desc()).limit(300).all()
    return [_strip_order_uploads(o) for o in annotate_orders(db, orders)]


@router.patch("/orders/{order_id}/status", response_model=OrderOut)
def update_order_status(order_id: str, body: OrderStatusUpdate, request: Request,
                        admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    order = db.query(Order).options(*ORDER_ADMIN_LOAD).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    if body.status == "refunded" and admin.role != "owner":
        # Only POST /api/payments/refund/{order_id} (owner-gated, actually calls
        # Razorpay and restocks) may move an order to "refunded". Without this, any
        # staff account could pick "Refunded" from this plain status dropdown and the
        # customer would get the same "your refund has been initiated" notification
        # with no real refund ever happening.
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Owner access required to mark an order as refunded")
    _validate_order_status_transition(order.status, body.status)
    if body.status == "cancelled" and order.status in ("cod_confirmed", "paid", "in_production", "shipped"):
        # This plain status dropdown is also how staff cancel an order outside
        # the customer-request flow (decide_cancellation_request, which already
        # restocks). Without this, stock decremented at payment/COD-confirm time
        # never comes back - silent, permanent inventory drift every time staff
        # use this everyday action instead of the dedicated cancellation flow.
        active_items = [item for item in order.items if item.status == "active"]
        product_ids = [item.product_id for item in active_items if item.product_id]
        products = {p.id: p for p in db.query(Product).filter(Product.id.in_(product_ids)).all()} if product_ids else {}
        for item in active_items:
            product = products.get(item.product_id)
            if product and product.type == "product" and product.stock is not None:
                restock(db, product.id, item.qty)
            item.status = "cancelled"
    order.status = body.status
    # Delivered (or cancelled/refunded) means the customer's uploaded artwork has
    # done its job, so this is where its deletion clock starts - 15 days by
    # default, owner-configurable, and skipped for any file an admin has put on
    # hold. Nothing is deleted here; the sweep does that when the date arrives.
    # See services/retention.py for the policy and why delivery is the trigger.
    if body.status in RETENTION_TERMINAL_STATUSES:
        schedule_order_artwork_purge(db, order)
    db.add(OrderTrackingEvent(
        order_id=order.id, status=body.status,
        title=ORDER_STATUS_TRACKING_TITLES.get(body.status, body.status.replace("_", " ").title()),
    ))
    order_event(db, order, body.status)
    audit(db, admin, "update_status", "order", order_id, {"status": body.status}, request)
    db.commit()
    db.refresh(order)
    return annotate_order(db, order)


@router.put("/orders/{order_id}/tracking", response_model=OrderOut)
def update_order_tracking(order_id: str, body: TrackingUpdateIn, request: Request,
                          admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    order = db.query(Order).options(*ORDER_ADMIN_LOAD).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")

    if body.carrier is not None:
        order.carrier = body.carrier or None
    if body.tracking_number is not None:
        order.tracking_number = body.tracking_number or None
    if body.tracking_url is not None:
        order.tracking_url = body.tracking_url or None
    if body.expected_delivery is not None:
        order.expected_delivery = body.expected_delivery
    if body.event_title:
        db.add(OrderTrackingEvent(
            order_id=order.id, status=order.status, title=body.event_title,
            description=body.event_description, location=body.event_location,
        ))
    audit(db, admin, "update_tracking", "order", order_id,
          {"carrier": order.carrier, "tracking_number": order.tracking_number}, request)
    db.commit()
    db.refresh(order)
    return annotate_order(db, order)


# ---------------------------------------------------------------- order cancellation requests

def _cancellation_out(req: OrderCancellationRequest) -> dict:
    item = None
    if req.order_item_id and req.order:
        item = next((i for i in req.order.items if i.id == req.order_item_id), None)
    return {
        "id": req.id, "order_id": req.order_id, "order_item_id": req.order_item_id,
        "item_title": (item.product_snapshot or {}).get("title") if item else None,
        "reason": req.reason, "note": req.note,
        "status": req.status, "admin_note": req.admin_note,
        "created_at": req.created_at, "resolved_at": req.resolved_at,
        "order_number": req.order.number if req.order else None,
        "customer_name": req.user.name if req.user else None,
        "customer_email": req.user.email if req.user else None,
        "refund_status": compute_refund_status(req.order) if req.order else "not_applicable",
    }


@router.get("/orders/cancellation-requests", response_model=list[AdminCancellationRequestOut])
def list_cancellation_requests(status_filter: str | None = None,
                               admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    query = db.query(OrderCancellationRequest).options(
        selectinload(OrderCancellationRequest.order).selectinload(Order.items),
        selectinload(OrderCancellationRequest.order).selectinload(Order.payments),
        selectinload(OrderCancellationRequest.user),
    )
    if status_filter:
        query = query.filter(OrderCancellationRequest.status == status_filter)
    reqs = query.order_by(OrderCancellationRequest.created_at.desc()).limit(200).all()
    return [_cancellation_out(r) for r in reqs]


@router.patch("/orders/cancellation-requests/{request_id}", response_model=AdminCancellationRequestOut)
def decide_cancellation_request(request_id: str, body: CancellationDecisionIn, request: Request,
                                admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    req = db.query(OrderCancellationRequest).options(
        selectinload(OrderCancellationRequest.order).selectinload(Order.items),
        selectinload(OrderCancellationRequest.order).selectinload(Order.payments),
        selectinload(OrderCancellationRequest.user),
    ).filter(OrderCancellationRequest.id == request_id).first()
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    if req.status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This request has already been resolved")

    order = req.order
    req.admin_note = body.admin_note
    req.resolved_by = admin.id
    req.resolved_at = datetime.now(timezone.utc)

    if req.order_item_id:
        _decide_item_cancellation(db, req, order, body, admin)
    elif body.action == "approve":
        req.status = "approved"
        if order.status in ("cod_confirmed", "paid", "in_production", "shipped"):
            # Only restock items still "active" - one may have already been
            # cancelled (and restocked) individually via a prior per-item
            # cancellation request; restocking it again here would inflate
            # stock above the true on-hand count.
            active_items = [item for item in order.items if item.status == "active"]
            product_ids = [item.product_id for item in active_items if item.product_id]
            products = {p.id: p for p in db.query(Product).filter(Product.id.in_(product_ids)).all()} if product_ids else {}
            for item in active_items:
                product = products.get(item.product_id)
                if product and product.type == "product" and product.stock is not None:
                    restock(db, product.id, item.qty)
                # Mark restocked so a later refund on this same (now-cancelled)
                # order - refund_order() also restocks "paid"/"cancelled" orders -
                # doesn't credit these units back to stock a second time.
                item.status = "cancelled"
        order.status = "cancelled"
        db.add(OrderTrackingEvent(
            order_id=order.id, status="cancelled", title="Order cancelled",
            description=f"Cancellation request approved. Reason: {req.reason}",
        ))
        order_event(db, order, "cancelled")
    else:
        req.status = "rejected"
        notify(db, req.user_id, "Cancellation request declined",
               f"Your cancellation request for order {order.number} was declined."
               + (f" {body.admin_note}" if body.admin_note else ""))

    audit(db, admin, f"{body.action}_cancellation", "order_cancellation_request", req.id, {"order_id": order.id}, request)
    db.commit()
    db.refresh(req)
    return _cancellation_out(req)


def _decide_item_cancellation(db: Session, req: OrderCancellationRequest, order: Order,
                              body: CancellationDecisionIn, admin: User) -> None:
    """Approve/reject a single-line-item cancellation request - leaves the rest
    of the order (and Order.status) untouched, unlike the whole-order path."""
    item = next((i for i in order.items if i.id == req.order_item_id), None)
    title = (item.product_snapshot or {}).get("title") if item else "Item"

    if body.action == "approve":
        req.status = "approved"
        if item:
            item.status = "cancelled"
            product = db.get(Product, item.product_id) if item.product_id else None
            if product and product.type == "product" and product.stock is not None:
                restock(db, product.id, item.qty)
            deduct_order_item(order, item)
        db.add(OrderTrackingEvent(
            order_id=order.id, status=order.status, title=f"Item cancelled: {title}",
            description=f"Cancellation request approved. Reason: {req.reason}",
        ))
    else:
        req.status = "rejected"
        if item and item.status == "cancel_requested":
            item.status = "active"
        notify(db, req.user_id, "Cancellation request declined",
               f"Your request to cancel \"{title}\" from order {order.number} was declined."
               + (f" {body.admin_note}" if body.admin_note else ""))


# ---------------------------------------------------------------- order address-change requests

def _address_change_out(req: OrderAddressChangeRequest) -> dict:
    return {
        "id": req.id, "order_id": req.order_id, "requested_address": req.requested_address,
        "note": req.note, "status": req.status, "admin_note": req.admin_note,
        "created_at": req.created_at, "resolved_at": req.resolved_at,
        "order_number": req.order.number if req.order else None,
        "customer_name": req.user.name if req.user else None,
        "customer_email": req.user.email if req.user else None,
    }


@router.get("/orders/address-change-requests", response_model=list[AdminAddressChangeRequestOut])
def list_address_change_requests(status_filter: str | None = None,
                                 admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    query = db.query(OrderAddressChangeRequest).options(
        selectinload(OrderAddressChangeRequest.order), selectinload(OrderAddressChangeRequest.user),
    )
    if status_filter:
        query = query.filter(OrderAddressChangeRequest.status == status_filter)
    reqs = query.order_by(OrderAddressChangeRequest.created_at.desc()).limit(200).all()
    return [_address_change_out(r) for r in reqs]


@router.patch("/orders/address-change-requests/{request_id}", response_model=AdminAddressChangeRequestOut)
def decide_address_change_request(request_id: str, body: AddressChangeDecisionIn, request: Request,
                                  admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    req = db.query(OrderAddressChangeRequest).options(
        selectinload(OrderAddressChangeRequest.order), selectinload(OrderAddressChangeRequest.user),
    ).filter(OrderAddressChangeRequest.id == request_id).first()
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Request not found")
    if req.status != "pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This request has already been resolved")

    req.admin_note = body.admin_note
    req.resolved_by = admin.id
    req.resolved_at = datetime.now(timezone.utc)

    if body.action == "approve":
        req.status = "approved"
        addr = req.requested_address
        new_address = Address(
            user_id=req.user_id, label="Order update",
            full_name=addr.get("full_name", ""), phone=addr.get("phone", ""),
            line1=addr.get("line1", ""), line2=addr.get("line2"),
            city=addr.get("city", ""), state=addr.get("state", ""), pincode=addr.get("pincode", ""),
        )
        db.add(new_address)
        db.flush()
        req.order.address_id = new_address.id
        req.order.address_snapshot = {
            "full_name": new_address.full_name, "phone": new_address.phone,
            "line1": new_address.line1, "line2": new_address.line2,
            "city": new_address.city, "state": new_address.state, "pincode": new_address.pincode,
        }
        db.add(OrderTrackingEvent(
            order_id=req.order.id, status=req.order.status, title="Delivery address updated",
            description="The delivery address was changed at the customer's request.",
        ))
        notify(db, req.user_id, "Address updated", f"Your new delivery address for order {req.order.number} has been applied.")
    else:
        req.status = "rejected"
        notify(db, req.user_id, "Address change declined",
               f"Your address change request for order {req.order.number} was declined."
               + (f" {body.admin_note}" if body.admin_note else ""))

    audit(db, admin, f"{body.action}_address_change", "order_address_change_request", req.id, {"order_id": req.order_id}, request)
    db.commit()
    db.refresh(req)
    return _address_change_out(req)


@router.get("/orders/{order_id}", response_model=OrderOut)
def get_order(order_id: str, admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    """Full order detail, including uploaded artwork - the list endpoint
    strips that out for size, so the admin UI's order modal fetches this
    on demand when staff open one order."""
    order = db.query(Order).options(*ORDER_ADMIN_LOAD).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return annotate_order(db, order)


@router.get("/reports/orders.csv")
def export_orders_csv(admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    orders = (
        db.query(Order)
        .options(joinedload(Order.user), joinedload(Order.address), selectinload(Order.items))
        .order_by(Order.created_at.desc())
        .limit(1000)
        .all()
    )
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        "Order Number", "Status", "Customer Name", "Customer Email", "Customer Phone",
        "Items", "Item Count", "City", "Subtotal", "Quantity Discount", "Discount", "Total", "Coupon",
        "Tracking Number", "Created At",
    ])
    for o in orders:
        item_titles = "; ".join((i.product_snapshot or {}).get("title", "Item") for i in o.items)
        writer.writerow([
            o.number, o.status,
            o.user.name if o.user else "", o.user.email if o.user else "", o.user.phone if o.user else "",
            item_titles, len(o.items), o.address.city if o.address else "",
            o.subtotal, o.bulk_discount, o.discount, o.total, o.coupon_code or "",
            o.tracking_number or "", o.created_at.isoformat(),
        ])
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=orders.csv"},
    )


@router.get("/reports/bookings.csv")
def export_bookings_csv(admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    bookings = db.query(Booking).order_by(Booking.created_at.desc()).limit(1000).all()
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow([
        "Customer Name", "Phone", "Email", "Package", "Category", "Event Date", "Slot",
        "Venue", "Price", "Advance Paid", "Status", "Created At",
    ])
    for b in bookings:
        details = b.details or {}
        writer.writerow([
            b.customer_name, b.customer_phone, b.customer_email or "",
            details.get("package", ""), details.get("category", ""),
            b.event_date.isoformat() if b.event_date else "", b.slot or "",
            details.get("venue", ""), details.get("price", ""), b.advance_paid,
            b.status, b.created_at.isoformat(),
        ])
    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=bookings.csv"},
    )


# ---------------------------------------------------------------- customers

@router.get("/customers")
def list_customers(q: str | None = None, page: int = Query(1, ge=1),
                   admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    """Customers, merged with their OTP/login activity. Also surfaces emails that
    requested OTPs (or got blocked) but never completed signup, so pre-signup OTP
    abuse - someone hammering the login form with an email they don't own - is
    visible and blockable even though there's no User row for it yet."""
    page_size = 30

    users = db.query(User).filter(User.role == "customer").all()
    otp_by_email = {
        email: (cnt, last)
        for email, cnt, last in (
            db.query(OtpCode.email, func.count(OtpCode.id), func.max(OtpCode.created_at))
            .group_by(OtpCode.email).all()
        )
    }
    blocked_emails = {b.email for b in db.query(BlockedEmail).all()}

    paid_statuses = ("cod_confirmed", "paid", "in_production", "shipped", "delivered")
    user_ids = [u.id for u in users]
    orders_by_user: dict[str, list[Order]] = {uid: [] for uid in user_ids}
    if user_ids:
        for o in db.query(Order).filter(Order.user_id.in_(user_ids)).all():
            orders_by_user[o.user_id].append(o)

    rows: dict[str, CustomerOut] = {}
    for u in users:
        orders = orders_by_user[u.id]
        spend = sum(float(o.total) for o in orders if o.status in paid_statuses)
        otp_count, otp_last = otp_by_email.get(u.email, (0, None))
        rows[u.email] = CustomerOut(
            id=u.id, name=u.name, email=u.email, phone=u.phone, is_active=u.is_active,
            joined=u.created_at, last_login=u.last_login, orders=len(orders), spend=spend,
            otp_requests=otp_count, last_otp_request=otp_last, is_blocked=u.email in blocked_emails,
        )
    for email, (otp_count, otp_last) in otp_by_email.items():
        if email not in rows:
            rows[email] = CustomerOut(
                id=None, name=None, email=email, phone=None, is_active=None, joined=None,
                last_login=None, orders=0, spend=0.0, otp_requests=otp_count,
                last_otp_request=otp_last, is_blocked=email in blocked_emails,
            )
    for email in blocked_emails:
        if email not in rows:
            rows[email] = CustomerOut(
                id=None, name=None, email=email, phone=None, is_active=None, joined=None,
                last_login=None, orders=0, spend=0.0, otp_requests=0,
                last_otp_request=None, is_blocked=True,
            )

    items = list(rows.values())
    if q:
        ql = q.lower()
        items = [
            c for c in items
            if ql in c.email.lower() or (c.name and ql in c.name.lower()) or (c.phone and ql in c.phone)
        ]

    epoch = datetime.min.replace(tzinfo=timezone.utc)
    items.sort(key=lambda c: c.joined or c.last_otp_request or epoch, reverse=True)
    total = len(items)
    start = (page - 1) * page_size
    return {"items": items[start:start + page_size], "total": total, "page": page, "page_size": page_size}


@router.get("/blocked-emails")
def list_blocked_emails(admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    rows = db.query(BlockedEmail).order_by(BlockedEmail.created_at.desc()).all()
    return [
        {"email": b.email, "reason": b.reason, "created_at": b.created_at.isoformat()}
        for b in rows
    ]


@router.post("/customers/block", status_code=status.HTTP_204_NO_CONTENT)
def block_email(body: BlockEmailIn, request: Request,
                admin: User = Depends(require_owner), db: Session = Depends(get_db)):
    email = body.email.lower().strip()
    if db.query(User).filter(User.email == email, User.role.in_(("staff", "owner"))).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot block a staff/owner account")
    existing = db.query(BlockedEmail).filter(BlockedEmail.email == email).first()
    if existing:
        existing.reason = body.reason
    else:
        db.add(BlockedEmail(email=email, reason=body.reason, blocked_by=admin.id))
    audit(db, admin, "block", "email", email, {"reason": body.reason}, request)
    db.commit()


@router.post("/customers/unblock", status_code=status.HTTP_204_NO_CONTENT)
def unblock_email(body: BlockEmailIn, request: Request,
                  admin: User = Depends(require_owner), db: Session = Depends(get_db)):
    email = body.email.lower().strip()
    db.query(BlockedEmail).filter(BlockedEmail.email == email).delete(synchronize_session=False)
    audit(db, admin, "unblock", "email", email, {}, request)
    db.commit()


@router.delete("/customers/otp-activity/{email}", status_code=status.HTTP_204_NO_CONTENT)
def clear_otp_activity(email: str, request: Request,
                       admin: User = Depends(require_owner), db: Session = Depends(get_db)):
    """Purges OTP-request history for an email that never completed signup (no
    User row) - the "no signup" rows in the customers list. Not for a real
    account; use DELETE /customers/{user_id} for that."""
    email = email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This email has an account - delete the customer instead")
    deleted = db.query(OtpCode).filter(OtpCode.email == email).delete(synchronize_session=False)
    if not deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No OTP activity found for this email")
    audit(db, admin, "clear_otp_activity", "email", email, {"deleted": deleted}, request)
    db.commit()


@router.delete("/customers/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_customer(user_id: str, request: Request,
                    admin: User = Depends(require_owner), db: Session = Depends(get_db)):
    """Permanently erases a customer and everything tied to them: addresses, cart/wishlist,
    reviews, notifications, refresh tokens, pending OTPs, bookings, and their orders (which
    in turn cascades to that order's items/payments/tracking events/cancellation &
    address-change requests). The audit-log entry for this action, and any older audit-log
    rows referencing them, keep their own snapshot and just have user_id cleared - that
    trail is deliberately kept. Irreversible, so the admin UI must confirm before calling
    this."""
    user = db.get(User, user_id)
    if not user or user.role != "customer":
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Customer not found")

    audit(db, admin, "delete", "customer", user_id, {"email": user.email, "name": user.name}, request)

    db.query(OtpCode).filter(OtpCode.email == user.email).delete(synchronize_session=False)
    # orders.user_id is ON DELETE RESTRICT (an accidental-delete guard elsewhere in the
    # app) - clear them explicitly first so the User delete below doesn't hit that guard.
    db.query(Order).filter(Order.user_id == user_id).delete(synchronize_session=False)
    db.delete(user)
    db.commit()


# ---------------------------------------------------------------- contact enquiries

@router.get("/contact-messages", response_model=list[ContactOut])
def list_contact_messages(unread_only: bool = False, limit: int = Query(200, ge=1, le=500),
                          admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    """Contact-form enquiries. POST /api/contact has always saved these and
    emailed the owner, but nothing could read them back - so an enquiry whose
    notification email failed (best-effort by design, see routers/contact.py)
    was effectively lost, and ContactMessage.is_read had no way to ever be set."""
    query = db.query(ContactMessage)
    if unread_only:
        query = query.filter(ContactMessage.is_read == False)
    return query.order_by(ContactMessage.created_at.desc()).limit(limit).all()


@router.patch("/contact-messages/{message_id}/read", response_model=ContactOut)
def mark_contact_message_read(message_id: str, body: ContactReadIn, request: Request,
                              admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    message = db.get(ContactMessage, message_id)
    if not message:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    message.is_read = body.is_read
    audit(db, admin, "read" if body.is_read else "unread", "contact_message", message_id, {}, request)
    db.commit()
    db.refresh(message)
    return message


@router.delete("/contact-messages/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contact_message(message_id: str, request: Request,
                           admin: User = Depends(require_owner), db: Session = Depends(get_db)):
    """Owner-only: staff can read and triage enquiries, but only the owner can
    destroy one - same split as the audit log and staff management."""
    message = db.get(ContactMessage, message_id)
    if not message:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    audit(db, admin, "delete", "contact_message", message_id, {"email": message.email}, request)
    db.delete(message)
    db.commit()


# ---------------------------------------------------------------- reviews

@router.patch("/reviews/{review_id}/toggle")
def toggle_review(review_id: str, request: Request,
                  admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    review = db.get(Review, review_id)
    if not review:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Review not found")
    review.is_approved = not review.is_approved
    audit(db, admin, "toggle_review", "review", review_id, {"approved": review.is_approved}, request)
    db.commit()
    invalidate_catalog_cache()  # cached page bundles embed each product's avg rating
    return {"id": review.id, "is_approved": review.is_approved}


@router.get("/reviews")
def list_reviews(admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    rows = (
        db.query(Review, User.name, User.email, Product.title)
        .join(User, Review.user_id == User.id)
        .join(Product, Review.product_id == Product.id)
        .order_by(Review.created_at.desc())
        .limit(300)
        .all()
    )
    return [
        {
            "id": r.id, "rating": r.rating, "comment": r.comment, "is_approved": r.is_approved,
            "reviewer": name or email, "product_title": title, "created_at": r.created_at.isoformat(),
        }
        for r, name, email, title in rows
    ]


# ---------------------------------------------------------------- media library

_SAFE_FILENAME = re.compile(r"[^A-Za-z0-9_.-]+")


@router.get("/media/download")
def download_media(url: str, filename: str = "artwork",
                   admin: User = Depends(require_staff)):
    """Streams a customer-uploaded artwork file (or any R2-hosted asset) back
    through this API instead of letting the admin panel's JS fetch() it
    straight from the R2 bucket - a browser fetch() to a different origin
    (pub-xxxx.r2.dev) needs CORS enabled on that bucket, which isn't
    guaranteed to be configured, and the R2 API token this app holds only has
    object-level permissions, not the bucket-admin scope needed to set CORS
    rules itself. Proxying through here sidesteps that entirely, since the
    admin panel calls this same-origin (it's served by this same FastAPI app).
    Restricted to this app's own R2 bucket to avoid this becoming an
    open proxy/SSRF vector."""
    if not _is_own_r2_url(url):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid file URL")
    try:
        # No redirects: a same-origin R2 object URL has no legitimate reason to
        # redirect, and following one would silently widen the SSRF check above
        # to whatever host it points at.
        resp = httpx.get(url, timeout=30, follow_redirects=False)
        resp.raise_for_status()
    except Exception:
        logger.warning("download_media failed to fetch %s", url, exc_info=True)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not fetch the file")

    safe_name = _SAFE_FILENAME.sub("_", filename) or "artwork"
    return StreamingResponse(
        iter([resp.content]),
        media_type=resp.headers.get("content-type", "application/octet-stream"),
        headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
    )


@router.post("/media/upload")
def upload_media(file: UploadFile, request: Request,
                 page_slug: str | None = Form(default=None),
                 category_slug: str | None = Form(default=None),
                 admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    # Plain `def`, not `async def` - process_image()/Cloudinary upload below are
    # blocking. FastAPI runs sync routes in a worker thread automatically; an
    # `async def` route doing that same work would block the whole event loop
    # (every other concurrent request) for its duration.
    data = file.file.read()
    # Which of the two validators to run is decided by the file's own magic bytes,
    # never by its name or declared Content-Type - both are caller-controlled, and
    # this picks the content-type the object is then served back out under from a
    # public bucket. An image still gets decoded and re-encoded to WebP; a video is
    # stored byte-for-byte (no transcoding - this app has no ffmpeg), so
    # sniff_video()'s container check is all that gates it.
    is_video = sniff_video(data) is not None
    try:
        media_bytes, ext, mime = process_video(data) if is_video else process_image(data, to_webp=True)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc))

    # Uploaded to Cloudinary rather than this server's local disk - this app's
    # DB is a shared, hosted Postgres instance, so a file saved locally is
    # invisible to every other environment (another deploy, another machine)
    # reading the same Media row. page_slug/category_slug (sent when this upload
    # comes from a specific product/category's media picker) just organize the R2
    # key for human browsability - see upload_media_library_asset()'s docstring.
    url = upload_media_library_asset(
        media_bytes, page_slug=page_slug, category_slug=category_slug, ext=ext, content_type=mime,
    )
    if not url:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Upload failed — try again")

    media = Media(url=url, alt=file.filename or "", kind="library",
                  media_type="video" if is_video else "image")
    db.add(media)
    audit(db, admin, "upload", "media", media.id, {"url": media.url}, request)
    db.commit()
    db.refresh(media)
    _invalidate_media_library_cache()
    return {"id": media.id, "url": media.url, "alt": media.alt, "mime": mime,
            "media_type": media.media_type, "size": len(media_bytes)}


@router.get("/media", response_model=list[MediaLibraryOut])
def list_media(
    category_id: str | None = None,
    page_id: str | None = None,
    admin: User = Depends(require_staff), db: Session = Depends(get_db),
):
    cache_key = (category_id, page_id)
    cached = _media_library_cache.get(cache_key)
    if cached and time.monotonic() - cached[0] < _MEDIA_LIBRARY_CACHE_TTL_SECONDS:
        return cached[1]

    # Every image in the app lives in this one table - uploads made directly on this
    # page (kind="library") plus every category portfolio photo and product package
    # photo (kind="portfolio"/"package") - shown together so this page is a full
    # inventory of every image in use, not just ad hoc uploads. The table has one row
    # per *usage* though, so the same picture attached to three products is three rows -
    # group them by URL here so the grid shows each picture once, with a usage count.
    # Eager-loaded so building each row's used_in below doesn't run a query per
    # attached category/product (this can be up to 2000 rows) - Category.page and
    # Product.category.page are one level deeper, needed for the page_slug that
    # lets the frontend jump the Categories tab to the right page.
    query = db.query(Media).options(
        joinedload(Media.category).joinedload(Category.page),
        joinedload(Media.product).joinedload(Product.category).joinedload(Category.page),
    )
    # category_id/page_id scope this down to "images already used near where I'm
    # attaching one" (the product/category media picker's default view) instead of
    # every image across the whole site - the picker used to fetch all ~2000 rows
    # on every open regardless of which product it was opened from. Unattached
    # library uploads (kind="library", no category_id/product_id) always pass the
    # filter since they're the freely-reusable pool, not scoped to anything yet.
    # Neither param scopes anything - this is the standalone Media Library page's
    # "show everything" view.
    unattached = and_(Media.category_id.is_(None), Media.product_id.is_(None))
    if category_id:
        product_ids = db.query(Product.id).filter(Product.category_id == category_id)
        query = query.filter(or_(Media.category_id == category_id, Media.product_id.in_(product_ids), unattached))
    elif page_id:
        category_ids = db.query(Category.id).filter(Category.page_id == page_id)
        product_ids = db.query(Product.id).filter(Product.category_id.in_(category_ids))
        query = query.filter(or_(Media.category_id.in_(category_ids), Media.product_id.in_(product_ids), unattached))
    rows = query.order_by(Media.created_at.desc()).limit(2000).all()

    groups: dict[str, dict] = {}
    order: list[str] = []
    for m in rows:
        g = groups.get(m.url)
        if g is None:
            g = {"row_id": m.id, "library_id": None, "alt": m.alt, "usage_count": 0,
                 "media_type": m.media_type or "image", "used_in": {}}
            groups[m.url] = g
            order.append(m.url)
        if m.category_id and m.category:
            g["usage_count"] += 1
            g["used_in"][("category", m.category_id)] = MediaUsageOut(
                kind="category", name=m.category.name,
                category_id=m.category_id, page_slug=m.category.page.slug,
            )
        elif m.product_id and m.product and m.product.category:
            g["usage_count"] += 1
            g["used_in"][("product", m.product_id)] = MediaUsageOut(
                kind="product", name=f"{m.product.title} ({m.product.category.name})",
                category_id=m.product.category_id, page_slug=m.product.category.page.slug,
            )
        elif m.category_id or m.product_id:
            g["usage_count"] += 1  # attached row whose category/product got deleted underneath it
        elif g["library_id"] is None:
            g["library_id"] = m.id
            g["alt"] = m.alt

    result = [
        MediaLibraryOut(
            id=groups[url]["library_id"] or groups[url]["row_id"],
            url=url,
            alt=groups[url]["alt"],
            usage_count=groups[url]["usage_count"],
            media_type=groups[url]["media_type"],
            deletable=groups[url]["library_id"] is not None,
            used_in=list(groups[url]["used_in"].values()),
        )
        for url in order[:1000]
    ]
    # Only for a scoped request (the product/category media picker), not the
    # standalone Media Library page's unscoped "everything" view - that one can be
    # up to 1000 images, and thumbnailing all of them here (rather than the handful
    # a scoped picker returns) would risk turning one page load into a cold-cache
    # stampede of R2 round trips. Concurrent, same pattern as warm_thumbnails() -
    # a plain per-item cld_optimize() loop would pay each thumbnail's R2 round trip
    # sequentially instead of overlapping them.
    if category_id or page_id:
        from concurrent.futures import ThreadPoolExecutor
        with ThreadPoolExecutor(max_workers=16) as pool:
            # Videos are skipped, not thumbnailed: get_or_create_thumbnail() runs the
            # bytes through Pillow, which can't open an MP4, so every video row would
            # pay a wasted R2 fetch just to fail. The picker renders those as a
            # <video> element off `url` instead.
            thumbs = list(pool.map(
                lambda r: get_or_create_thumbnail(r.url) if r.media_type != "video" else None, result))
        for item, thumb in zip(result, thumbs):
            item.thumb_url = thumb  # None (thumbnailing failed/unconfigured, or a video) -> frontend falls back to item.url
    _media_library_cache[cache_key] = (time.monotonic(), result)
    return result


# ---------------------------------------------------------------- settings (all keys)

@router.get("/settings")
def list_settings(admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    return {s.key: s.value for s in db.query(Setting).all()}


# ---------------------------------------------------------------- site menu (category menu bar)

def _menu_name(name: str) -> str:
    if name not in MENUS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown menu")
    return name


@router.get("/menu")
def get_menu(name: str = "main", admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    menu, is_default = get_site_menu(db, _menu_name(name))
    return {"name": name, "menu": menu, "is_default": is_default, "menus": menu_list()}


@router.get("/menu/targets")
def get_menu_targets(admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    """Pages, categories and products the Menu editor's link picker offers."""
    return menu_targets(db)


@router.put("/menu")
def set_menu(body: SiteMenuIn, request: Request, name: str = "main",
             admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    key = MENUS[_menu_name(name)]["key"]
    value = body.model_dump()
    setting = db.get(Setting, key)
    if setting:
        setting.value = value
    else:
        db.add(Setting(key=key, value=value))
    audit(db, admin, "set", "setting", key, {"items": len(value["items"])}, request)
    db.commit()
    invalidate_catalog_cache()
    return {"name": name, "menu": value, "is_default": False, "menus": menu_list()}


@router.delete("/menu")
def reset_menu(request: Request, name: str = "main",
               admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    key = MENUS[_menu_name(name)]["key"]
    setting = db.get(Setting, key)
    if setting:
        db.delete(setting)
        audit(db, admin, "delete", "setting", key, {}, request)
        db.commit()
        invalidate_catalog_cache()
    return {"name": name, "menu": default_menu(name), "is_default": True, "menus": menu_list()}


# ---------------------------------------------------------------- homepage builder

@router.get("/homepage")
def get_homepage(admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    setting = db.get(Setting, HOMEPAGE_KEY)
    layout = setting.value if setting else {}

    categories = (
        db.query(Category)
        .filter(Category.is_active == True)
        .order_by(Category.sort, Category.name)
        .all()
    )
    products = (
        db.query(Product)
        .options(selectinload(Product.media))
        .filter(Product.is_active == True)
        .order_by(Product.sort)
        .all()
    )

    def cat_image(c):
        return c.thumb_image_url or c.hero_image_url

    def prod_image(p):
        # First *image*, skipping any video in the gallery - this is rendered as a
        # plain <img> preview in the homepage builder.
        return next((m.url for m in p.media if m.media_type != "video"), None)

    return {
        "layout": {
            "category_ids": layout.get("category_ids", []),
            "product_ids": layout.get("product_ids", []),
        },
        "all": {
            "categories": [{"id": c.id, "name": c.name, "image": cat_image(c)} for c in categories],
            "products": [
                {"id": p.id, "title": p.title, "image": prod_image(p), "price": float(p.price)}
                for p in products
            ],
        },
    }


@router.put("/homepage")
def set_homepage(body: HomepageLayoutIn, request: Request,
                 admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    value = body.model_dump()
    setting = db.get(Setting, HOMEPAGE_KEY)
    if setting:
        setting.value = value
    else:
        db.add(Setting(key=HOMEPAGE_KEY, value=value))
    audit(db, admin, "set", "setting", HOMEPAGE_KEY, {}, request)
    db.commit()
    invalidate_catalog_cache()
    return {"ok": True, "layout": value}


@router.delete("/homepage")
def reset_homepage(request: Request, admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    setting = db.get(Setting, HOMEPAGE_KEY)
    if setting:
        db.delete(setting)
        audit(db, admin, "delete", "setting", HOMEPAGE_KEY, {}, request)
        db.commit()
        invalidate_catalog_cache()
    return {"ok": True}


# ---------------------------------------------------------------- arrange (per-category product order)

@router.get("/arrange/{category_id}")
def get_arrange(category_id: str, admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    category = db.get(Category, category_id)
    if not category:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
    products = (
        db.query(Product)
        .options(selectinload(Product.media))
        .filter(Product.category_id == category_id)
        .order_by(Product.sort, Product.created_at.desc())
        .all()
    )
    return {
        "category": {"id": category.id, "slug": category.slug, "name": category.name},
        "items": [
            {
                "id": p.id, "slug": p.slug, "title": p.title,
                "image": next((m.url for m in p.media if m.media_type != "video"), None),
                "price": float(p.price), "active": p.is_active, "type": p.type,
            }
            for p in products
        ],
    }


@router.put("/arrange")
def set_arrange(body: ArrangeIn, request: Request,
                admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    valid_ids = {
        p.id for p in db.query(Product.id).filter(Product.category_id == body.category_id).all()
    }
    mappings = [
        {"id": product_id, "sort": position}
        for position, product_id in enumerate(body.ids)
        if product_id in valid_ids
    ]
    if mappings:
        db.bulk_update_mappings(Product, mappings)
    count = len(mappings)
    audit(db, admin, "arrange", "category", body.category_id, {"count": count}, request)
    db.commit()
    invalidate_catalog_cache()
    return {"ok": True, "count": count}


# ---------------------------------------------------------------- order artwork retention
# Customer-uploaded photos are personal data held only to produce an order. These
# endpoints are the admin side of services/retention.py: see what is scheduled for
# deletion, keep anything that is still needed, delete on request, and set the
# window. Nothing here deletes on a timer - the sweep in main.py does that.

@router.get("/artwork")
def list_artwork(status_filter: str = "scheduled", limit: int = 200,
                 admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    """Artwork files, newest first.

    status_filter:
      scheduled - has a deletion date and is still on the clock (the default view:
                  "what is about to go")
      held      - an admin has chosen to keep it past its window
      purged    - already deleted; the row remains as the record that it existed
      orphan    - uploaded but never checked out
      all       - everything
    """
    q = db.query(CustomerUpload)
    if status_filter == "scheduled":
        q = q.filter(CustomerUpload.purged_at.is_(None), CustomerUpload.purge_hold.is_(False),
                     CustomerUpload.purge_after.isnot(None))
    elif status_filter == "held":
        q = q.filter(CustomerUpload.purged_at.is_(None), CustomerUpload.purge_hold.is_(True))
    elif status_filter == "purged":
        q = q.filter(CustomerUpload.purged_at.isnot(None))
    elif status_filter == "orphan":
        q = q.filter(CustomerUpload.purged_at.is_(None), CustomerUpload.order_id.is_(None))
    rows = q.order_by(CustomerUpload.created_at.desc()).limit(min(limit, 500)).all()

    order_ids = {r.order_id for r in rows if r.order_id}
    orders = {
        o.id: o for o in db.query(Order).filter(Order.id.in_(order_ids)).all()
    } if order_ids else {}
    return {
        "retention_days": get_retention_days(db),
        "items": [
            {
                "id": r.id,
                # The URL is omitted once purged - it would 404, and offering a dead
                # link reads as a broken page rather than a deleted file.
                "url": None if r.purged_at else r.url,
                "filename": r.original_filename,
                "bytes": r.bytes,
                "created_at": r.created_at,
                "order_id": r.order_id,
                "order_number": orders[r.order_id].order_number if r.order_id in orders else None,
                "order_status": orders[r.order_id].status if r.order_id in orders else None,
                "purge_after": r.purge_after,
                "purged_at": r.purged_at,
                "purge_hold": r.purge_hold,
                "purge_note": r.purge_note,
            }
            for r in rows
        ],
    }


@router.put("/artwork/{upload_id}/hold")
def set_artwork_hold(upload_id: str, body: ArtworkHoldIn, request: Request,
                     admin: User = Depends(require_staff), db: Session = Depends(get_db)):
    """Keep a file past its deletion date, or release it back onto the clock.

    Holding is the escape hatch for reprints, damage claims and disputes, so it
    is staff-level rather than owner-only: the failure mode is keeping a file
    too long, which is recoverable, unlike deleting one too early."""
    row = db.get(CustomerUpload, upload_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Upload not found")
    if row.purged_at:
        raise HTTPException(status.HTTP_409_CONFLICT, "That file has already been deleted")
    row.purge_hold = bool(body.hold)
    row.purge_note = (body.note or "").strip()[:300] or None
    if not row.purge_hold and row.order_id and row.purge_after is None:
        # Released with no date left on it (its order hit a terminal status while
        # it was held, so scheduling skipped it) - give it today's window rather
        # than leaving it in limbo, unscheduled and never swept.
        row.purge_after = date.today() + timedelta(days=get_retention_days(db))
    audit(db, admin, "artwork_hold", "customer_upload", row.id,
          {"hold": row.purge_hold, "note": row.purge_note}, request)
    db.commit()
    return {"ok": True, "hold": row.purge_hold, "purge_after": row.purge_after}


@router.post("/artwork/purge-now")
def purge_artwork_now(body: ArtworkPurgeIn, request: Request,
                      admin: User = Depends(require_owner), db: Session = Depends(get_db)):
    """Delete specific files immediately, ignoring schedule and hold.

    Owner-gated and irreversible: the object is removed from R2 and cannot be
    recovered. This exists for a customer asking for their photo to be erased,
    and for artwork that should never have been uploaded."""
    rows = db.query(CustomerUpload).filter(CustomerUpload.id.in_(body.ids)).all()
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No matching uploads")
    result = purge_uploads_now(db, rows)
    audit(db, admin, "artwork_purge_now", "customer_upload", ",".join(body.ids[:20]), result, request)
    db.commit()
    return {"ok": True, **result}


@router.post("/artwork/run-sweep")
def run_artwork_sweep(request: Request,
                      admin: User = Depends(require_owner), db: Session = Depends(get_db)):
    """Run the retention sweep now instead of waiting for the scheduled one.
    Only deletes what is already due, so it is the same operation the timer
    performs - useful after changing the window, or to confirm it works."""
    result = purge_due_artwork(db)
    audit(db, admin, "artwork_sweep", "customer_upload", "-", result, request)
    db.commit()
    return {"ok": True, **result}


@router.put("/artwork/retention")
def set_artwork_retention(body: ArtworkRetentionIn, request: Request,
                          admin: User = Depends(require_owner), db: Session = Depends(get_db)):
    """Set how many days after delivery artwork is kept.

    Owner-only: shortening this shortens the life of files already scheduled,
    and lengthening it is a data-retention commitment. Already-scheduled dates
    are left alone - a file's deletion date is fixed when its order completes,
    so a policy change applies to orders completed from now on and can't
    retroactively delete something sooner than promised."""
    row = db.query(Setting).filter(Setting.key == RETENTION_SETTING_KEY).first()
    if not row:
        row = Setting(key=RETENTION_SETTING_KEY, value={})
        db.add(row)
    row.value = {"days": body.days}
    audit(db, admin, "artwork_retention", "setting", RETENTION_SETTING_KEY, {"days": body.days}, request)
    db.commit()
    return {"ok": True, "days": body.days, "default": DEFAULT_RETENTION_DAYS}
