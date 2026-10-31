import uuid
from datetime import datetime, date

from sqlalchemy import (
    String, Text, Boolean, Integer, Numeric, DateTime, Date, ForeignKey,
    UniqueConstraint, Index, JSON, func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def uid() -> str:
    return str(uuid.uuid4())


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


# ---------------------------------------------------------------- users / auth

class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(20), unique=True, nullable=True)
    name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    role: Mapped[str] = mapped_column(String(20), default="customer")  # customer | staff | owner
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)  # staff/owner only
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    addresses: Mapped[list["Address"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class OtpCode(Base):
    __tablename__ = "otp_codes"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(String(255), index=True)
    code_hash: Mapped[str] = mapped_column(String(128))
    purpose: Mapped[str] = mapped_column(String(20), default="login")
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    # Request-time IP, so admin login-activity can spot one IP hammering OTPs
    # across many emails (or one email from many IPs) before deciding to block.
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BlockedEmail(Base, TimestampMixin):
    """An email address the owner has locked out of OTP request/verify and
    password login - independent of whether a User row exists yet, since the
    abuse this guards against (someone hammering OTP requests for an email
    they don't own) happens before any account is created. See admin.py's
    block_email/unblock_email and auth.py's request_otp/verify_otp/login."""
    __tablename__ = "blocked_emails"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    reason: Mapped[str] = mapped_column(Text, default="")
    blocked_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(128), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ---------------------------------------------------------------- site pages (top-level nav)

class SitePage(Base, TimestampMixin):
    """One row per storefront page (photography, corporate, gifts, catalog, ...).
    Categories/products are scoped to a page so the same admin screens and public
    catalog endpoint shape can serve every section of the site."""
    __tablename__ = "site_pages"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    slug: Mapped[str] = mapped_column(String(60), unique=True, index=True)  # e.g. "photography"
    name: Mapped[str] = mapped_column(String(120))
    sort: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    categories: Mapped[list["Category"]] = relationship(back_populates="page", order_by="Category.sort")


# ---------------------------------------------------------------- catalog

class Category(Base, TimestampMixin):
    """A service/product category within a page — e.g. "Wedding Photography" on the
    photography page, or "Corporate Hampers" on the corporate page. Carries the
    sidebar/hero display data that used to be hardcoded per page (icon, images,
    tagline, hero visibility, sidebar grouping)."""
    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    page_id: Mapped[str] = mapped_column(ForeignKey("site_pages.id", ondelete="CASCADE"), index=True)
    slug: Mapped[str] = mapped_column(String(80), index=True)  # unique within a page, e.g. "wedding"
    name: Mapped[str] = mapped_column(String(160))
    icon: Mapped[str | None] = mapped_column(String(20), nullable=True)  # emoji
    description: Mapped[str | None] = mapped_column(Text, nullable=True)  # category blurb, e.g. studio/corporate/gifts "desc"
    thumb_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)   # sidebar / "All Services" card
    hero_image_url: Mapped[str | None] = mapped_column(Text, nullable=True)    # large hero banner image
    hero_tagline: Mapped[str | None] = mapped_column(String(200), nullable=True)
    show_in_hero: Mapped[bool] = mapped_column(Boolean, default=False)
    folio_title: Mapped[str | None] = mapped_column(String(200), nullable=True)  # e.g. "Videography Reel"
    group_label: Mapped[str | None] = mapped_column(String(40), nullable=True)   # e.g. "Functions" / "Equipment"
    sort: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    page: Mapped["SitePage"] = relationship(back_populates="categories")
    products: Mapped[list["Product"]] = relationship(
        back_populates="category", cascade="all, delete-orphan", order_by="Product.sort"
    )
    media: Mapped[list["Media"]] = relationship(
        back_populates="category", cascade="all, delete-orphan", order_by="Media.sort",
        foreign_keys="Media.category_id",
    )

    __table_args__ = (UniqueConstraint("page_id", "slug", name="uq_category_page_slug"),)


class Product(Base, TimestampMixin):
    """A sellable/bookable item. For tiered services (photography packages) each tier
    (Standard/Premium/Platinum) is its own Product row under the same category."""
    __tablename__ = "products"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    category_id: Mapped[str] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"), index=True)
    tier: Mapped[str | None] = mapped_column(String(40), nullable=True)  # Standard | Premium | Platinum | null
    title: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(220), unique=True, index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    type: Mapped[str] = mapped_column(String(10), default="service")  # service | product
    price: Mapped[float] = mapped_column(Numeric(10, 2))
    mrp: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)  # strike-through price, optional
    advance_amount: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)  # booking deposit
    stock: Mapped[int | None] = mapped_column(Integer, nullable=True)  # physical products only
    # How many hours after an order is placed a customer may still request a
    # delivery-address change on it, before this product's production/packing
    # is assumed to start. Null -> falls back to the site-wide default in
    # Setting["order_policy"] (see services/policy.py).
    address_change_window_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Estimated days to fulfil this product, shown to the customer as "Delivery by
    # <date>" in the product page's Delivery Info section. Null -> storefront falls
    # back to a generic 3-day estimate (see catalog.py/*.js delivery estimate code).
    delivery_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    features: Mapped[list] = mapped_column(JSON, default=list)  # ["150+ High-Res Photos", ...]
    # Admin-entered synonyms/related terms for this product (e.g. a "Ceramic Mug"
    # product tagged ["coffee cup", "birthday gift"]) - matched by storefront search
    # alongside title/description/category so a shopper does not have to type the
    # exact title wording. See catalog.py public_products and js/catalog.js /
    # js/shared/search.js, which all match against this too.
    search_keywords: Mapped[list] = mapped_column(JSON, default=list)
    # Quantity-tier ("buy more, save more") offers on this product, as
    # [{min_qty, type: percent|flat, value, max_discount?, label?}] sorted by
    # min_qty - see services/pricing.bulk_discount_for(), which picks the single
    # highest tier a line's quantity reaches (tiers do not stack with each
    # other). Quantity is summed across every cart line of this product, so ten
    # mugs ordered as 6 of one photo + 4 of another still reach a min_qty of 10.
    # JSON rather than its own table for the same reason as input_fields: the
    # admin edits the whole list as one form section and nothing ever queries an
    # individual tier.
    bulk_discounts: Mapped[list] = mapped_column(JSON, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort: Mapped[int] = mapped_column(Integer, default=0)
    # Free-form JSON for fields with no dedicated column yet (studio's configurator:
    # quantityOptions/purposeOptions) - admin edits this as raw JSON rather than each
    # one-off field needing its own migration + form control. requiresPhotoUpload used
    # to live here too (a studio-only "must upload a photo" checkbox) until it was
    # folded into input_fields below as an upload-type required field - every page
    # (studio/corporate/gifts/photography) now shares that one mechanism instead of
    # studio having its own separate one. See migrations.backfill_requires_photo_upload_fields
    # for the one-time conversion of already-flagged products.
    extra: Mapped[dict] = mapped_column(JSON, default=dict)
    # Admin-configurable extra customer inputs (upload/dropdown/text), built with the
    # "Customer Questions" form builder - see ProductInputFieldIn. Separate from
    # `extra` above, which stays reserved for the older pricing-tied qty/purpose config.
    # Every storefront product page (studio/corporate/gifts/photography) renders,
    # validates and collects these the same way via js/shared/product-fields.js.
    input_fields: Mapped[list] = mapped_column(JSON, default=list)

    category: Mapped["Category"] = relationship(back_populates="products")
    media: Mapped[list["Media"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", order_by="Media.sort",
        foreign_keys="Media.product_id",
    )


class Media(Base, TimestampMixin):
    """An image (or, for a product, a short video) attached either to a Category
    (portfolio gallery photo, kind="portfolio") or to a Product (package carousel
    photo/clip, kind="package")."""
    __tablename__ = "media"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    category_id: Mapped[str | None] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), nullable=True, index=True
    )
    product_id: Mapped[str | None] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=True, index=True
    )
    url: Mapped[str] = mapped_column(Text)
    alt: Mapped[str] = mapped_column(String(200), default="")  # portfolio caption
    kind: Mapped[str] = mapped_column(String(20), default="portfolio")  # portfolio | package
    # "image" (the default, and what every row was before this column existed) or
    # "video". Only a product's own gallery renders video - category portfolios,
    # listing/card thumbnails, hero banners and the homepage all filter video rows
    # out by this column, because none of them have anywhere sensible to play one.
    # See services/media.py's sniff_video/process_video for what's accepted on
    # upload, and catalog.py, which splits a product's media into images/videos.
    media_type: Mapped[str] = mapped_column(String(10), default="image")  # image | video
    sort: Mapped[int] = mapped_column(Integer, default=0)

    category: Mapped["Category | None"] = relationship(back_populates="media", foreign_keys=[category_id])
    product: Mapped["Product | None"] = relationship(back_populates="media", foreign_keys=[product_id])


# ---------------------------------------------------------------- addresses / orders / payments

class Address(Base, TimestampMixin):
    __tablename__ = "addresses"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    label: Mapped[str] = mapped_column(String(40), default="Home")
    full_name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(15))
    line1: Mapped[str] = mapped_column(String(255))
    line2: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str] = mapped_column(String(80))
    state: Mapped[str] = mapped_column(String(80))
    pincode: Mapped[str] = mapped_column(String(10))
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)

    user: Mapped["User"] = relationship(back_populates="addresses")


class CartItem(Base, TimestampMixin):
    """A logged-in customer's saved cart line, mirroring the shared localStorage
    cart shape (name/price/img/qty/customization/requirement) used across every
    storefront page, so the cart follows the account across logins/devices
    instead of living only in one browser's localStorage."""
    __tablename__ = "cart_items"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    item_key: Mapped[str] = mapped_column(String(300))  # the localStorage cart object's key
    product_id: Mapped[str | None] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"), nullable=True
    )  # set once a storefront page's data comes from the catalog API instead of hardcoded JS
    name: Mapped[str] = mapped_column(String(300))
    price: Mapped[str] = mapped_column(String(40))  # kept as the formatted string ("₹399") the frontend uses
    img: Mapped[str | None] = mapped_column(Text, nullable=True)
    qty: Mapped[int] = mapped_column(Integer, default=1)
    # Deep link back to the product page/modal this line was configured on, so
    # the cart can make the row clickable - see schemas.CartItemIn.url.
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    customization: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    requirement: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    user: Mapped["User"] = relationship()

    __table_args__ = (UniqueConstraint("user_id", "item_key", name="uq_cart_item_per_user"),)


class WishlistItem(Base, TimestampMixin):
    """A logged-in customer's saved-for-later product. Saving to the wishlist is
    login-gated on the storefront (the heart icon opens the sign-in modal for a
    guest), so unlike the cart there is no guest state to merge - the rows here
    are the wishlist, and localStorage only caches them for instant rendering."""
    __tablename__ = "wishlist_items"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    item_key: Mapped[str] = mapped_column(String(300))  # the localStorage wishlist object's key
    product_id: Mapped[str | None] = mapped_column(
        ForeignKey("products.id", ondelete="SET NULL"), nullable=True
    )  # set on pages whose cards come from the catalog API instead of hardcoded JS
    name: Mapped[str] = mapped_column(String(300))
    price: Mapped[str] = mapped_column(String(40))  # kept as the formatted string the frontend shows
    img: Mapped[str | None] = mapped_column(Text, nullable=True)
    url: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )  # the product's page (e.g. "studio.html?category=..&openProduct=..") - baked in
    # at save time since each storefront page builds its own deep link differently, so the
    # wishlist drawer can send the customer straight to the product from any page/device.

    user: Mapped["User"] = relationship()

    __table_args__ = (UniqueConstraint("user_id", "item_key", name="uq_wishlist_item_per_user"),)


ORDER_STATUSES = [
    "created", "payment_pending", "cod_confirmed", "paid", "in_production",
    "shipped", "delivered", "cancelled", "refunded",
]


class Order(Base, TimestampMixin):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    number: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="created", index=True)
    subtotal: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    # Coupon-code discount only. The quantity-tier discount is tracked
    # separately in bulk_discount below so the customer (and staff) can see
    # which of the two saved them what, instead of one opaque figure.
    discount: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    # Sum of every line's automatic quantity-tier discount (OrderItem.discount).
    # Applied to the subtotal *before* the coupon, so a coupon percentage is
    # taken on the already-reduced amount rather than the list price - see
    # services/pricing.price_cart().
    bulk_discount: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    total: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    coupon_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    address_id: Mapped[str | None] = mapped_column(ForeignKey("addresses.id", ondelete="SET NULL"), nullable=True)
    # Snapshot of the address at checkout time (full_name/phone/line1/line2/city/state/pincode) -
    # address_id alone isn't enough to keep this order's delivery details intact, since the
    # customer can edit or delete that Address row later (My Account) and address_id is
    # ON DELETE SET NULL, which would otherwise blank out this order's shipping address
    # retroactively. See services/policy._annotate(), which prefers this over the live join.
    address_snapshot: Mapped[dict] = mapped_column(JSON, default=dict)
    delivery_slot: Mapped[str | None] = mapped_column(String(60), nullable=True)
    carrier: Mapped[str | None] = mapped_column(String(80), nullable=True)
    tracking_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    tracking_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    expected_delivery: Mapped[date | None] = mapped_column(Date, nullable=True)

    user: Mapped["User"] = relationship()
    address: Mapped["Address | None"] = relationship()
    items: Mapped[list["OrderItem"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    payments: Mapped[list["Payment"]] = relationship(back_populates="order", cascade="all, delete-orphan")
    tracking_events: Mapped[list["OrderTrackingEvent"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderTrackingEvent.created_at"
    )
    cancellation_requests: Mapped[list["OrderCancellationRequest"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderCancellationRequest.created_at.desc()"
    )
    address_change_requests: Mapped[list["OrderAddressChangeRequest"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderAddressChangeRequest.created_at.desc()"
    )

    @property
    def customer(self) -> "User":
        # OrderOut.customer reads this instead of `user` directly - "customer" is
        # the term staff actually use in the admin UI.
        return self.user


class OrderItem(Base):
    __tablename__ = "order_items"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    product_id: Mapped[str | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    product_snapshot: Mapped[dict] = mapped_column(JSON, default=dict)  # {title, slug, type, image}
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2))
    qty: Mapped[int] = mapped_column(Integer, default=1)
    # This line's share of the order's quantity-tier ("buy 10, save 10%")
    # discount, already applied to Order.subtotal/total. Held per line rather
    # than only as one order-level figure because a single line can be cancelled
    # independently of the rest (see status below): refund_order()/the
    # cancellation path subtract this line's *net* value, and without the
    # per-line split they would refund the undiscounted unit_price * qty and
    # give back more than the customer ever paid.
    discount: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    notes: Mapped[str] = mapped_column(Text, default="")
    # active | cancel_requested | cancelled - lets one line item in a multi-item
    # order be cancelled independently of the rest (see OrderCancellationRequest
    # .order_item_id). A whole-order cancellation approval that restocks (i.e. the
    # order had already been paid) also flips every "active" item to "cancelled" -
    # required so a later refund on the same order doesn't restock those units
    # a second time (see decide_cancellation_request/refund_order's shared
    # item.status == "active" restock guard). A whole-order cancel *before*
    # payment (nothing to restock yet) leaves items "active".
    status: Mapped[str] = mapped_column(String(20), default="active")

    order: Mapped["Order"] = relationship(back_populates="items")
    product: Mapped["Product | None"] = relationship()


class CustomerUpload(Base, TimestampMixin):
    """One photo/artwork file a customer attached to a product they're ordering.

    The file goes to R2 when the item is added to the cart, and only its URL
    travels through the cart and into the order. Previously a customer's photo
    was carried as a base64 data: URI in localStorage, pushed to
    cart_items.customization on every cart change, and only moved to R2 by a
    background task after checkout - which put multi-MB strings through the
    browser's ~5MB localStorage quota (a large upload simply failed to add to
    the cart), through the database, and through every cart read in between.

    This row is the record that lets the file be found and deleted later.
    Nothing else knows the R2 object key: the cart and the order only carry the
    public URL, and an order's artwork has to be removable once it has served
    its purpose. Keeping customer photographs forever is a liability, not a
    feature - they're personal data we have no reason to hold after the print
    has shipped and the return window has closed.

    Lifecycle:
      uploaded         order_id NULL, purge_after NULL   - orphan until checkout
      in an order      order_id set                      - kept while it's needed
      order delivered  purge_after = delivered + N days  - clock starts
      purged           purged_at set, R2 object deleted  - row kept as the record
    """
    __tablename__ = "customer_uploads"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    # SET NULL rather than CASCADE: deleting a customer account must not delete the
    # artwork of an order that was already produced and shipped - the order itself
    # survives account deletion (orders.user_id is RESTRICT), so its files must too.
    user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # The R2 object key. Stored explicitly rather than parsed back out of `url`,
    # because deletion must not depend on reversing however the public URL was
    # built at the time (the base URL has already changed once, in the Cloudinary
    # -> R2 move). Without a reliable key an orphaned object can never be removed.
    storage_key: Mapped[str] = mapped_column(Text)
    # The public URL that goes into the cart line and the order's snapshot.
    # Indexed because linking uploads to an order at checkout looks them up by it.
    url: Mapped[str] = mapped_column(Text, index=True)
    content_type: Mapped[str] = mapped_column(String(80), default="")
    bytes: Mapped[int] = mapped_column(Integer, default=0)
    # What the customer called it. Shown to admin next to the order so a support
    # conversation ("the second photo I sent") has something to match against.
    original_filename: Mapped[str | None] = mapped_column(String(300), nullable=True)

    order_id: Mapped[str | None] = mapped_column(
        ForeignKey("orders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # The date this file becomes eligible for deletion. NULL means "not yet" -
    # either it isn't in a delivered order, or it's an orphan still inside the
    # orphan grace period. Indexed: the sweep queries exactly this column.
    purge_after: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    purged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Admin's "keep this one". A reprint, a dispute or a complaint means the
    # artwork must outlive the retention window, and that decision has to survive
    # the automatic sweep - so it's a flag on the row, not a date that the next
    # status change would recompute.
    purge_hold: Mapped[bool] = mapped_column(Boolean, default=False)
    purge_note: Mapped[str | None] = mapped_column(String(300), nullable=True)

    order: Mapped["Order | None"] = relationship()


class Payment(Base, TimestampMixin):
    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    razorpay_order_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    razorpay_payment_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    signature: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="created")  # created|authorized|captured|failed|refunded
    amount: Mapped[float] = mapped_column(Numeric(10, 2))
    # card | upi | netbanking | wallet | emi | ... as Razorpay reports it, so staff
    # can answer "how did they pay" without opening the Razorpay dashboard.
    method: Mapped[str | None] = mapped_column(String(20), nullable=True)
    captured_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Razorpay's reason for a failed attempt (e.g. BAD_REQUEST_ERROR / "Payment
    # was declined by the bank") - without it a "failed" row says nothing about why.
    error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    error_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    refund_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # status flips to "refunded" the moment staff start a refund, but Razorpay
    # settles it later and can still reject it. This tracks where the refund
    # itself actually is: pending | processed | failed (null = never refunded).
    refund_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    refund_amount: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    refund_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    order: Mapped["Order"] = relationship(back_populates="payments")
    # selectin: every place that loads payments (admin and customer order views)
    # gets the disputes in one extra query instead of one per payment.
    disputes: Mapped[list["PaymentDispute"]] = relationship(
        back_populates="payment", cascade="all, delete-orphan", lazy="selectin",
        order_by="PaymentDispute.created_at",
    )


class PaymentDispute(Base, TimestampMixin):
    """A chargeback or dispute a customer raised with their bank against a
    payment, as reported by Razorpay's payment.dispute.* webhooks. One row per
    Razorpay dispute, updated in place as it moves through its lifecycle
    (open -> under_review -> won/lost/closed), so the order shows whether money
    is being clawed back and by when staff must respond."""
    __tablename__ = "payment_disputes"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    payment_id: Mapped[str] = mapped_column(ForeignKey("payments.id", ondelete="CASCADE"), index=True)
    razorpay_dispute_id: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    amount: Mapped[float] = mapped_column(Numeric(10, 2))
    amount_deducted: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    reason_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    reason_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    phase: Mapped[str | None] = mapped_column(String(30), nullable=True)  # chargeback | pre_arbitration | arbitration | fraud ...
    status: Mapped[str] = mapped_column(String(20), default="open")  # open | under_review | won | lost | closed
    respond_by: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    payment: Mapped["Payment"] = relationship(back_populates="disputes")


class WebhookEvent(Base):
    __tablename__ = "webhook_events"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    event_id: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    event_type: Mapped[str] = mapped_column(String(60))
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    processed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ---------------------------------------------------------------- order tracking / customer requests

CANCELLATION_REASONS = [
    "changed_mind", "found_better_price", "ordered_by_mistake",
    "delivery_time_too_long", "product_defect_expected", "duplicate_order", "other",
]

REQUEST_STATUSES = ["pending", "approved", "rejected"]


class OrderTrackingEvent(Base):
    """One entry in an order's shipment timeline (order placed / in production /
    shipped / out for delivery / delivered / cancelled ...). Auto-appended on every
    admin status change, plus any extra checkpoints staff add manually (courier
    handoff, out-for-delivery, hub scan, etc.)."""
    __tablename__ = "order_tracking_events"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(20))  # snapshot of Order.status at this point
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    location: Mapped[str | None] = mapped_column(String(160), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    order: Mapped["Order"] = relationship(back_populates="tracking_events")


class OrderCancellationRequest(Base, TimestampMixin):
    """A customer's request to cancel an order that's past the point of an
    instant self-serve cancel (already paid / in production / shipped) - staff
    review and approve or reject it from the admin Orders page."""
    __tablename__ = "order_cancellation_requests"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # NULL = whole-order request (the original behavior). Set = a request to
    # cancel just this one line item, leaving the rest of the order untouched.
    order_item_id: Mapped[str | None] = mapped_column(
        ForeignKey("order_items.id", ondelete="CASCADE"), nullable=True, index=True
    )
    reason: Mapped[str] = mapped_column(String(40))
    note: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    admin_note: Mapped[str] = mapped_column(Text, default="")
    resolved_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    order: Mapped["Order"] = relationship(back_populates="cancellation_requests")
    user: Mapped["User"] = relationship(foreign_keys=[user_id])
    order_item: Mapped["OrderItem | None"] = relationship(foreign_keys=[order_item_id])


class OrderAddressChangeRequest(Base, TimestampMixin):
    """A customer's request to change the delivery address on an existing order,
    only offered while the order is inside that order's address-change buffer
    window (see services/policy.py). Staff approve (which swaps the order's
    address) or reject it."""
    __tablename__ = "order_address_change_requests"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    order_id: Mapped[str] = mapped_column(ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    requested_address: Mapped[dict] = mapped_column(JSON, default=dict)  # full_name/phone/line1/line2/city/state/pincode
    note: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    admin_note: Mapped[str] = mapped_column(Text, default="")
    resolved_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    order: Mapped["Order"] = relationship(back_populates="address_change_requests")
    user: Mapped["User"] = relationship(foreign_keys=[user_id])


# ---------------------------------------------------------------- reviews / notifications

class Review(Base, TimestampMixin):
    __tablename__ = "reviews"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    rating: Mapped[int] = mapped_column(Integer)
    comment: Mapped[str] = mapped_column(Text, default="")
    is_approved: Mapped[bool] = mapped_column(Boolean, default=True)

    product: Mapped["Product"] = relationship()
    user: Mapped["User"] = relationship()

    __table_args__ = (UniqueConstraint("product_id", "user_id", name="uq_review_per_user"),)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    channel: Mapped[str] = mapped_column(String(20), default="app")  # app | email
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text, default="")
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


# ---------------------------------------------------------------- contact

class ContactMessage(Base, TimestampMixin):
    __tablename__ = "contact_messages"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(120))
    phone: Mapped[str] = mapped_column(String(20))
    email: Mapped[str] = mapped_column(String(200))
    topic: Mapped[str | None] = mapped_column(String(60), nullable=True)
    subject: Mapped[str] = mapped_column(String(200))
    message: Mapped[str] = mapped_column(Text)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)


# ---------------------------------------------------------------- bookings

BOOKING_STATUSES = ["enquiry", "advance_pending", "confirmed", "completed", "cancelled"]


class Booking(Base, TimestampMixin):
    __tablename__ = "bookings"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    product_id: Mapped[str | None] = mapped_column(ForeignKey("products.id", ondelete="SET NULL"), nullable=True)
    # CASCADE (not SET NULL): deleting a customer erases their bookings too, same
    # as orders - stays nullable for guest bookings that were never tied to an
    # account in the first place. See migrations.run_constraint_migrations for
    # the ALTER on an already-existing DB, and admin.delete_customer.
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    customer_name: Mapped[str] = mapped_column(String(120))
    customer_phone: Mapped[str] = mapped_column(String(20))
    customer_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    event_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    slot: Mapped[str | None] = mapped_column(String(40), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)  # location, notes, add-ons, snapshot of package
    advance_paid: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    status: Mapped[str] = mapped_column(String(20), default="enquiry", index=True)

    product: Mapped["Product | None"] = relationship()


# ---------------------------------------------------------------- offers / coupons

class Coupon(Base, TimestampMixin):
    __tablename__ = "coupons"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    type: Mapped[str] = mapped_column(String(10))  # percent | flat
    value: Mapped[float] = mapped_column(Numeric(10, 2))
    min_order: Mapped[float] = mapped_column(Numeric(10, 2), default=0)
    max_discount: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    title: Mapped[str] = mapped_column(String(160), default="")
    banner_image: Mapped[str | None] = mapped_column(Text, nullable=True)
    placement: Mapped[str | None] = mapped_column(String(40), nullable=True)  # home_hero | home_strip | mega_menu
    starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


# ---------------------------------------------------------------- misc

class Setting(Base, TimestampMixin):
    """Free-form JSON config for anything that doesn't warrant its own table —
    homepage hero ordering, per-page misc copy, feature flags, etc."""
    __tablename__ = "settings"

    key: Mapped[str] = mapped_column(String(60), primary_key=True)
    value: Mapped[dict] = mapped_column(JSON)


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=uid)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column(String(80))
    entity: Mapped[str] = mapped_column(String(60))
    entity_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
