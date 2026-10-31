import re
from datetime import datetime, date

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .models import CANCELLATION_REASONS

_CANCELLATION_REASON_PATTERN = f"^({'|'.join(CANCELLATION_REASONS)})$"
_REQUEST_ACTION_PATTERN = "^(approve|reject)$"

# A plain format check (not full RFC 5322) that's deliberately strict about the
# characters allowed around @ — this is also what stands between a submitted
# "email" and it being rendered into an admin-panel onclick="..." attribute
# elsewhere (see admin/js/customers.js), so rejecting quotes/angle-brackets/
# parens here closes that off at the source, not just at the render site.
_EMAIL_RE = re.compile(r"^[^\s@'\"<>();]+@[^\s@'\"<>();]+\.[^\s@'\"<>();]{2,}$")


def _validate_email_str(v: str) -> str:
    v = (v or "").strip()
    if not _EMAIL_RE.match(v):
        raise ValueError("Invalid email address")
    return v


# Same reasoning as _EMAIL_RE: this app renders media URLs into admin-panel
# onclick="copyMediaUrl('...')" attributes (admin/js/media.js), so a URL
# containing a quote or angle bracket must be rejected here rather than relied
# on to be escaped correctly at every render site.
_UNSAFE_URL_CHARS = re.compile(r"[\"'<>]")

# Same idea for free-text that gets rendered into storefront/admin markup by a
# template string rather than a DOM text node (product input field labels,
# options, placeholders): reject at the source rather than trusting every render
# site to escape correctly. Narrower than _UNSAFE_URL_CHARS above - a bare
# apostrophe is deliberately allowed, because labels like "Child's Name" are
# entirely legitimate and every attribute this text reaches is double-quoted and
# run through a quote-escaping helper anyway (see js/shared/product-fields.js's
# escAttr). A double quote or an angle bracket has no such legitimate use here.
_UNSAFE_TEXT_CHARS = re.compile(r"[\"<>]")


def _validate_media_url(v: str) -> str:
    v = (v or "").strip()
    if not v or _UNSAFE_URL_CHARS.search(v):
        raise ValueError("Invalid URL")
    if not (v.startswith("http://") or v.startswith("https://") or v.startswith("/")):
        raise ValueError("Invalid URL")
    return v


# ---------------------------------------------------------------- auth

class LoginIn(BaseModel):
    email: str
    password: str

    _validate_email = field_validator("email")(_validate_email_str)


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: str
    name: str | None
    phone: str | None
    role: str
    is_active: bool
    created_at: datetime


class StaffIn(BaseModel):
    email: str
    name: str
    password: str
    role: str = Field(default="staff", pattern="^(staff|owner)$")

    _validate_email = field_validator("email")(_validate_email_str)


# ---------------------------------------------------------------- customer auth (OTP)

class OtpRequest(BaseModel):
    email: str

    _validate_email = field_validator("email")(_validate_email_str)


class OtpVerify(BaseModel):
    email: str
    code: str = Field(pattern=r"^\d{6}$")
    name: str | None = None

    _validate_email = field_validator("email")(_validate_email_str)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None


class CustomerOut(BaseModel):
    # id/is_active/joined are null for an email that has requested OTPs but
    # never completed signup - see admin.py's list_customers, which surfaces
    # those rows too so pre-signup OTP abuse is still visible/blockable.
    id: str | None
    name: str | None
    email: str
    phone: str | None
    is_active: bool | None
    joined: datetime | None
    last_login: datetime | None
    orders: int
    spend: float
    otp_requests: int
    last_otp_request: datetime | None
    is_blocked: bool


class BlockEmailIn(BaseModel):
    email: str
    reason: str = ""


# ---------------------------------------------------------------- addresses

class AddressIn(BaseModel):
    label: str = Field(default="Home", max_length=40)
    full_name: str = Field(min_length=2, max_length=120)
    phone: str = Field(pattern=r"^[6-9]\d{9}$")
    line1: str = Field(min_length=3, max_length=255)
    line2: str | None = Field(default=None, max_length=255)
    city: str = Field(min_length=2, max_length=80)
    state: str = Field(min_length=2, max_length=80)
    pincode: str = Field(pattern=r"^\d{6}$")
    is_default: bool = False


class AddressOut(AddressIn):
    model_config = ConfigDict(from_attributes=True)
    id: str


# ---------------------------------------------------------------- cart

class CartItemIn(BaseModel):
    key: str
    product_id: str | None = None
    name: str
    price: str
    img: str | None = None
    qty: int = Field(default=1, ge=1)
    # Relative deep link back to the product page/modal the line was configured
    # on ("studio.html?openProduct=...&pid=..."), so the cart can make each row
    # clickable. Stored on the line rather than derived from product_id because
    # each storefront page has its own deep-link scheme and the line doesn't
    # record which page it came from. Set by the browser; see cart-core.js.
    url: str | None = None
    customization: dict | None = None
    requirement: dict | None = None


class CartItemOut(CartItemIn):
    pass


class CartSyncIn(BaseModel):
    items: list[CartItemIn] = []


class CartSyncOut(BaseModel):
    items: list[CartItemOut] = []


# ---------------------------------------------------------------- wishlist

class WishlistItemIn(BaseModel):
    key: str
    product_id: str | None = None
    name: str
    price: str = ""
    img: str | None = None
    url: str | None = None


class WishlistItemOut(WishlistItemIn):
    pass


class WishlistSyncIn(BaseModel):
    items: list[WishlistItemIn] = []


class WishlistSyncOut(BaseModel):
    items: list[WishlistItemOut] = []


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    title: str
    body: str
    is_read: bool
    created_at: datetime


# ---------------------------------------------------------------- site pages

class SitePageIn(BaseModel):
    slug: str
    name: str
    sort: int = 0
    is_active: bool = True


class SitePageOut(SitePageIn):
    model_config = ConfigDict(from_attributes=True)
    id: str


# ---------------------------------------------------------------- media

class MediaIn(BaseModel):
    url: str
    alt: str = ""
    kind: str = Field(default="portfolio", pattern="^(portfolio|package)$")
    # "video" is only accepted on a product's media (add_product_media) - a category
    # portfolio rejects it, because nothing renders a category's media as anything
    # but an <img>. See models.Media.media_type.
    media_type: str = Field(default="image", pattern="^(image|video)$")
    sort: int = 0

    _validate_url = field_validator("url")(_validate_media_url)


class MediaOut(MediaIn):
    model_config = ConfigDict(from_attributes=True)
    id: str
    # upload_media() (admin.py) sets kind="library" directly on the ORM object,
    # bypassing MediaIn's write-side pattern - so the read side must accept it
    # too, or every response containing a library upload 500s on serialization.
    kind: str


class MediaUsageOut(BaseModel):
    """Where a non-deletable MediaLibraryOut image is actually attached, so the
    admin doesn't have to hunt for it - the delete button there is disabled with
    no other way to tell which category/product to go remove it from."""
    kind: str  # "category" | "product"
    name: str  # category name, or "<product title> (<category name>)"
    category_id: str  # the category to jump to either way - itself, or the product's own category
    page_slug: str  # that category's page, so the Categories tab can be pointed at the right page


class MediaLibraryOut(BaseModel):
    """One row per distinct image URL for the admin Media Library page - the
    underlying `media` table has one row per *usage* (a product/category photo
    plus any ad hoc upload), so without this grouping the same picture shows
    up once per product/category it's attached to."""
    id: str
    url: str
    alt: str
    usage_count: int  # how many products/categories currently use this image
    media_type: str = "image"  # "video" rows render as a <video> tile, not an <img>
    deletable: bool  # true only if there's a standalone library upload of it
    used_in: list[MediaUsageOut] = []  # empty when deletable (nothing to point at)
    # Small WebP for the picker grid - `url` stays the real full-resolution image
    # (it's what gets attached to a product/category on select), so this must never
    # replace it. None when not computed (the unscoped "all" library view skips this,
    # and a video has no still to thumbnail without ffmpeg - see list_media()) - the
    # frontend falls back to `url` in that case.
    thumb_url: str | None = None


# ---------------------------------------------------------------- categories

class CategoryIn(BaseModel):
    page_id: str
    slug: str
    name: str
    icon: str | None = None
    description: str | None = None
    thumb_image_url: str | None = None
    hero_image_url: str | None = None
    hero_tagline: str | None = None
    show_in_hero: bool = False
    folio_title: str | None = None
    group_label: str | None = None
    sort: int = 0
    is_active: bool = True


class CategoryOut(CategoryIn):
    model_config = ConfigDict(from_attributes=True)
    id: str


# ---------------------------------------------------------------- products

class ProductLinkIn(BaseModel):
    """One tile in a "product link" field: which product it opens, and the short
    name printed under its photo ("Black & White"). Blank -> the product's title."""
    product_id: str = Field(min_length=1, max_length=64)
    label: str = Field(default="", max_length=60)

    @field_validator("label")
    @classmethod
    def _no_markup_chars(cls, v: str) -> str:
        if v and _UNSAFE_TEXT_CHARS.search(v):
            raise ValueError("Cannot contain double quotes or angle brackets")
        return v


class ProductInputFieldIn(BaseModel):
    """One admin-configured extra customer input on a product's order/booking
    form - built by the "Customer Input Fields" form builder in the admin
    catalog UI. `id` is stable across edits so submitted values (keyed by
    field id in an order item's customization.fields) keep meaning even if
    the label/options are edited later."""
    # Restricted to an identifier charset, not just a length: this value is used
    # as a DOM id / for= target by the storefront field renderer
    # (js/shared/product-fields.js) and as a key in an order item's
    # customization.fields, so anything quote- or bracket-bearing here is a
    # markup-injection vector on a public product page. Same reasoning as
    # _EMAIL_RE and _validate_media_url above: reject it at the source instead
    # of relying on every render site to escape it correctly.
    id: str = Field(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9_-]+$")
    type: str = Field(pattern="^(upload|dropdown|text|link)$")
    label: str = Field(min_length=1, max_length=160)
    required: bool = False
    help_text: str = Field(default="", max_length=300)
    # Optional hint text shown inside a text field's input. Was already read by
    # the storefront renderer but had no home in this schema, so it could never
    # actually be set - declared here (and offered in the admin field builder)
    # so the renderer's support for it is reachable.
    placeholder: str = Field(default="", max_length=120)
    sort: int = 0
    # upload only
    multiple: bool = False
    max_files: int = Field(default=1, ge=1, le=10)
    # dropdown only
    options: list[str] = Field(default_factory=list, max_length=50)
    multi_select: bool = False
    # dropdown only, optional - when set, picking that option replaces the item's
    # unit price with this value instead of just recording an answer (e.g. Studio's
    # "16 Photos = ₹200" quantity picker). Keyed by the option string itself; an
    # option with no entry here just behaves like a normal answer.
    option_prices: dict[str, float] | None = None
    # Display only, and only meaningful alongside option_prices: the struck-through
    # "was" price shown on that option's tile in the storefront's variant picker
    # (js/shared/product-fields.js). Deliberately NOT read by
    # services/product_fields.py's resolve_product_price - what a customer is
    # charged comes from option_prices alone, so a wrong figure here can only ever
    # mis-advertise a discount, never mis-bill. The storefront hides it unless it is
    # above that option's actual price.
    option_mrps: dict[str, float] | None = None
    # Display only, and entirely optional: maps an option to one of this product's
    # own gallery photos by position ("9X9 is the 2nd photo"), so picking that
    # option swaps the product page's main image to the matching one. 1-based,
    # matching how the admin field builder counts photos in the Photos dialog.
    # Options with no entry - and a product with no mapping at all - simply leave
    # the gallery alone, which is the behaviour every existing product has. An
    # index past the end of the gallery is ignored by the storefront rather than
    # rejected here, because photos can be removed long after the mapping is set.
    option_images: dict[str, int] | None = None
    # Display only, and entirely optional: a picture of its own for each option,
    # shown on that option's tile in the storefront's variant picker. This is the
    # swatch case option_images cannot serve - a colour, a fabric, a frame style
    # has no reason to exist in the product's own gallery, and there is no
    # gallery photo to point at. Keyed by the option string, like option_prices;
    # an option with no entry simply renders as the text-only tile it always did,
    # so a product that never used this is unaffected. Uploaded through the admin
    # field builder, which stores the Media Library URL it gets back.
    option_image_urls: dict[str, str] | None = None

    # Longest answer a customer may submit for a text field on this product.
    # Without a cap, nothing stopped a several-hundred-KB string being stored as
    # an order line's answer and then re-sent with every order list/detail
    # response that includes it. Per-field so a "Name to print" and a "Gift
    # message" can differ; the ceiling keeps any single answer bounded.
    max_length: int = Field(default=500, ge=1, le=5000)

    # link only - not a question at all but a signpost: "Also available in Black &
    # White ->" pointing at another product (the colour and B&W versions of one
    # design, say). Display only: the customer answers nothing, nothing is stored
    # on the order, and it is never required. The public catalog resolves the id
    # to that product's current name/picture/price/URL (catalog.public_input_fields),
    # so renaming or re-pricing the linked product never leaves this stale, and a
    # link to a deleted or hidden product simply isn't shown.
    link_product_id: str | None = Field(default=None, max_length=64)
    # Legacy: the old single-link card's button wording. No longer shown.
    link_text: str = Field(default="", max_length=60)
    # The products this field links to - one picture tile each, in this order,
    # under the field's label as a heading ("Also available in"). Supersedes
    # link_product_id, which only ever held one; that is still read for fields
    # saved before this existed (see catalog.public_input_fields).
    links: list[ProductLinkIn] = Field(default_factory=list, max_length=12)

    @field_validator("label", "help_text", "placeholder", "link_text")
    @classmethod
    def _no_markup_chars(cls, v: str) -> str:
        # These are rendered into the storefront product page; quotes and angle
        # brackets are rejected here for the same reason as `id` above.
        if v and _UNSAFE_TEXT_CHARS.search(v):
            raise ValueError("Cannot contain double quotes or angle brackets")
        return v

    @field_validator("option_image_urls")
    @classmethod
    def _safe_option_image_urls(cls, v: dict[str, str] | None) -> dict[str, str] | None:
        # Same rules as any other stored media URL (MediaIn.url): absolute http(s)
        # or a site-relative path, and no quote/angle-bracket characters, because
        # this lands in an src= attribute on a public product page.
        if not v:
            return None
        return {option: _validate_media_url(url) for option, url in v.items()}

    @field_validator("options")
    @classmethod
    def _safe_options(cls, v: list[str]) -> list[str]:
        for option in v:
            if _UNSAFE_TEXT_CHARS.search(option):
                raise ValueError(f'Option "{option}" cannot contain double quotes or angle brackets')
        return v

    @model_validator(mode="after")
    def _check_type_fields(self):
        if self.type == "dropdown" and not self.options:
            raise ValueError(f'Dropdown field "{self.label}" needs at least one option')
        if self.type == "link":
            if not self.links and not self.link_product_id:
                raise ValueError(f'Product link "{self.label}" needs at least one product to link to')
            # Nothing for the customer to fill in, so it can never be required.
            self.required = False
        if self.type == "upload" and self.multiple and self.max_files < 2:
            raise ValueError(f'Upload field "{self.label}" allows multiple files but has max_files < 2')
        if self.option_prices:
            unknown = [o for o in self.option_prices if o not in set(self.options or [])]
            if unknown:
                raise ValueError(
                    f'Field "{self.label}" prices an option it does not offer: {", ".join(unknown)}'
                )
        # Same check for the picture map: a leftover entry for a renamed or
        # removed option would quietly never render, so it is rejected rather
        # than stored. Deliberately NOT extended to option_mrps/option_images,
        # which predate this: ProductOut runs this same model over every stored
        # product on the way OUT (see _product_out in routers/admin.py), so a
        # tightened rule there would turn a harmless stale key on an existing
        # product into a 500 on the admin's product list.
        if self.option_image_urls:
            unknown = [o for o in self.option_image_urls if o not in set(self.options or [])]
            if unknown:
                raise ValueError(
                    f'Field "{self.label}" has a picture for an option it does not offer: {", ".join(unknown)}'
                )
        return self


class ProductBulkTierIn(BaseModel):
    """One quantity-tier ("buy more, save more") offer on a product. Several per
    product is the point - "10 for 10% off, 20 for 20% off" is two rows - and the
    single highest tier a customer's quantity reaches is the one that applies;
    they never stack with each other. See services/pricing.bulk_discount_for().

    Quantity is counted per product across the whole cart, so two differently
    customized lines of the same product add up toward min_qty."""
    min_qty: int = Field(ge=2, le=100000)
    type: str = Field(default="percent", pattern="^(percent|flat)$")
    # A percentage of the product's line value, or a flat rupee amount off it.
    value: float = Field(gt=0)
    # percent only, optional - caps what one tier can ever take off, the same
    # guard CouponIn.max_discount gives a percentage coupon.
    max_discount: float | None = Field(default=None, gt=0)
    # Storefront wording. Left blank, pricing.default_tier_label() generates
    # "Buy 10 or more, get 10% off" - so the admin only types this to override it.
    label: str = Field(default="", max_length=120)

    @field_validator("value")
    @classmethod
    def _percent_within_range(cls, v, info):
        if (info.data.get("type") or "percent") == "percent" and v > 100:
            raise ValueError("A percentage discount cannot exceed 100")
        return v


class ProductIn(BaseModel):
    category_id: str
    tier: str | None = None
    title: str
    slug: str
    description: str = ""
    type: str = Field(default="service", pattern="^(service|product)$")
    price: float = Field(ge=0)
    mrp: float | None = Field(default=None, ge=0)
    advance_amount: float | None = Field(default=None, ge=0)
    stock: int | None = None
    address_change_window_hours: int | None = Field(default=None, ge=0, le=720)
    delivery_days: int | None = Field(default=None, ge=0, le=365)
    features: list[str] = []
    search_keywords: list[str] = []
    is_active: bool = True
    sort: int = 0
    extra: dict = {}
    input_fields: list[ProductInputFieldIn] = []
    bulk_discounts: list[ProductBulkTierIn] = []
    media: list[MediaIn] = []


class ProductPatch(BaseModel):
    category_id: str | None = None
    tier: str | None = None
    title: str | None = None
    slug: str | None = None
    description: str | None = None
    type: str | None = None
    price: float | None = Field(default=None, ge=0)
    mrp: float | None = Field(default=None, ge=0)
    advance_amount: float | None = Field(default=None, ge=0)
    stock: int | None = None
    address_change_window_hours: int | None = Field(default=None, ge=0, le=720)
    delivery_days: int | None = Field(default=None, ge=0, le=365)
    features: list[str] | None = None
    search_keywords: list[str] | None = None
    is_active: bool | None = None
    sort: int | None = None
    extra: dict | None = None
    input_fields: list[ProductInputFieldIn] | None = None
    bulk_discounts: list[ProductBulkTierIn] | None = None


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    category_id: str
    tier: str | None
    title: str
    slug: str
    description: str
    type: str
    price: float
    mrp: float | None
    advance_amount: float | None
    stock: int | None
    address_change_window_hours: int | None
    delivery_days: int | None
    features: list[str]
    search_keywords: list[str] = []
    is_active: bool
    sort: int
    extra: dict
    input_fields: list[ProductInputFieldIn] = []
    bulk_discounts: list[ProductBulkTierIn] = []
    # A JSON column holding null rather than [] must not take the whole product
    # list down with it - the same null-tolerance the order money fields need.
    # Applied to input_fields too: it has always had this shape and this risk,
    # and there is no reason for one of the two to be the fragile one.
    _coerce_json_lists = field_validator("bulk_discounts", "input_fields", mode="before")(
        lambda v: [] if v is None else v
    )
    media: list[MediaOut] = []


# ---------------------------------------------------------------- coupons

class CouponIn(BaseModel):
    code: str
    type: str = Field(pattern="^(percent|flat)$")
    value: float = Field(ge=0)
    min_order: float = Field(default=0, ge=0)
    max_discount: float | None = Field(default=None, ge=0)
    title: str = ""
    banner_image: str | None = None
    placement: str | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    is_active: bool = True

    @model_validator(mode="after")
    def _check_percent_value(self):
        if self.type == "percent" and self.value > 100:
            raise ValueError("A percent coupon's value cannot exceed 100")
        return self


class CouponOut(CouponIn):
    model_config = ConfigDict(from_attributes=True)
    id: str


# ---------------------------------------------------------------- bookings

class ContactIn(BaseModel):
    # This was the one input schema on the app with no validation at all - it
    # accepted {"email": "not-an-email", "phone": "1"} and had no length limits
    # on any field, on an endpoint that is both unauthenticated and the easiest
    # table to flood. Lengths match the ContactMessage columns so an over-long
    # value is a readable 422 rather than a database error, and email reuses the
    # same validator every other email field on the app uses.
    name: str = Field(min_length=2, max_length=120)
    phone: str = Field(pattern=r"^[6-9]\d{9}$")
    email: str
    topic: str | None = Field(default=None, max_length=60)
    subject: str = Field(min_length=3, max_length=200)
    message: str = Field(min_length=3, max_length=5000)

    _validate_email = field_validator("email")(_validate_email_str)


class ContactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    phone: str
    email: str
    topic: str | None
    subject: str
    message: str
    is_read: bool
    created_at: datetime


class ContactReadIn(BaseModel):
    is_read: bool = True


class BookingIn(BaseModel):
    product_id: str | None = None
    customer_name: str
    customer_phone: str
    customer_email: str | None = None
    event_date: date | None = None
    slot: str | None = None
    details: dict = {}


class BookingStatusUpdate(BaseModel):
    status: str = Field(pattern="^(enquiry|advance_pending|confirmed|completed|cancelled)$")


class BookingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    product_id: str | None
    user_id: str | None
    customer_name: str
    customer_phone: str
    customer_email: str | None
    event_date: date | None
    slot: str | None
    details: dict
    advance_paid: float
    status: str
    created_at: datetime
    # What this booking's package is configured to take as an advance
    # (Product.advance_amount), alongside advance_paid, which is what staff have
    # actually recorded as received. Read-only, filled in by the admin bookings
    # endpoint from the joined product - without it the advance an admin sets on
    # a service package had no effect anywhere and staff had no reference for
    # what they were supposed to be collecting.
    advance_expected: float | None = None


# ---------------------------------------------------------------- orders / payments

class CheckoutItemIn(BaseModel):
    # product_id is set when the item came from the backend catalog; storefront
    # pages that still render hardcoded package data (most of them, today) send
    # just title/price/image straight from the localStorage cart instead.
    product_id: str | None = None
    title: str
    price: float
    qty: int = Field(default=1, ge=1)
    image: str | None = None
    customization: dict | None = None


class CheckoutIn(BaseModel):
    items: list[CheckoutItemIn]
    address_id: str
    delivery_slot: str | None = None
    coupon_code: str | None = None


def _zero_if_none(v):
    """A nullable money column read back as None becomes 0. Used for the
    quantity-discount fields, which were added to tables that already had rows
    and are still nullable - without this, one old order with a NULL in it
    turns every list/detail endpoint that includes it into a 500."""
    return 0 if v is None else v


class OrderItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    product_id: str | None
    product_snapshot: dict
    unit_price: float
    qty: int
    # This line's share of the order's automatic quantity-tier discount, so the
    # customer and staff can see which line the saving came from - see
    # OrderItem.discount. Coerced from null because the column is nullable and
    # rows can predate it (or be written by a path that never sets it, e.g.
    # seed_dummy_orders.py) - an old order must still serialize, not 500.
    discount: float = 0
    _coerce_discount = field_validator("discount", mode="before")(_zero_if_none)
    notes: str
    # active | cancel_requested | cancelled - see OrderItem.status.
    status: str = "active"
    # Set only by the admin order LIST endpoint, which strips uploaded artwork
    # (customer photos/logos can be several MB each as base64) out of
    # product_snapshot to keep the list response small; the count lets the
    # list still show a "N files" badge. Always 0 on every other endpoint,
    # where product_snapshot is left intact.
    upload_count: int = 0


class PaymentDisputeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    razorpay_dispute_id: str
    amount: float
    amount_deducted: float
    reason_code: str | None
    reason_description: str | None
    phase: str | None
    status: str
    respond_by: datetime | None
    created_at: datetime


class PaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    razorpay_order_id: str
    razorpay_payment_id: str | None
    status: str
    amount: float
    method: str | None = None
    captured_at: datetime | None = None
    error_code: str | None = None
    error_description: str | None = None
    refund_id: str | None
    refund_status: str | None = None
    refund_amount: float | None = None
    refunded_at: datetime | None = None
    refund_error: str | None = None
    disputes: list[PaymentDisputeOut] = []
    created_at: datetime


class OrderCustomerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    name: str | None
    email: str
    phone: str | None


class OrderAddressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    full_name: str
    phone: str
    line1: str
    line2: str | None
    city: str
    state: str
    pincode: str


class OrderTrackingEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    status: str
    title: str
    description: str
    location: str | None
    created_at: datetime


class TrackingUpdateIn(BaseModel):
    carrier: str | None = Field(default=None, max_length=80)
    tracking_number: str | None = Field(default=None, max_length=120)
    tracking_url: str | None = Field(default=None, max_length=500)
    expected_delivery: date | None = None
    event_title: str | None = Field(default=None, max_length=160)
    event_description: str = Field(default="", max_length=1000)
    event_location: str | None = Field(default=None, max_length=160)


class CancellationRequestIn(BaseModel):
    reason: str = Field(pattern=_CANCELLATION_REASON_PATTERN)
    # Free-text is mandatory alongside the reason dropdown - staff reviewing
    # the request need the customer's own words, not just the category.
    note: str = Field(min_length=3, max_length=500)
    # When set, cancels just this one line item instead of the whole order.
    order_item_id: str | None = None

    @field_validator("note")
    @classmethod
    def _note_not_blank(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Please tell us a bit more about why you're cancelling")
        return v


class CancellationDecisionIn(BaseModel):
    action: str = Field(pattern=_REQUEST_ACTION_PATTERN)
    admin_note: str = Field(default="", max_length=500)


class CancellationRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    order_id: str
    order_item_id: str | None = None
    # Populated by the router from the order's items - None for a whole-order
    # request, the item's product title for an item-level one.
    item_title: str | None = None
    reason: str
    note: str
    status: str
    admin_note: str
    created_at: datetime
    resolved_at: datetime | None
    # Whether the order's payment still needs refunding - see
    # services/policy.refund_status(). Populated by the router.
    refund_status: str = "not_applicable"


# Flat, cross-order admin listing (Admin > Orders > Cancellation Requests) needs
# the order number and customer alongside each request - built from a plain
# dict in the router rather than model_validate(), since those two fields
# don't live on the OrderCancellationRequest row itself.
class AdminCancellationRequestOut(CancellationRequestOut):
    order_number: str | None = None
    customer_name: str | None = None
    customer_email: str | None = None


class AddressChangeRequestIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=120)
    phone: str = Field(pattern=r"^[6-9]\d{9}$")
    line1: str = Field(min_length=3, max_length=255)
    line2: str | None = Field(default=None, max_length=255)
    city: str = Field(min_length=2, max_length=80)
    state: str = Field(min_length=2, max_length=80)
    pincode: str = Field(pattern=r"^\d{6}$")
    note: str = Field(default="", max_length=500)


class AddressChangeDecisionIn(BaseModel):
    action: str = Field(pattern=_REQUEST_ACTION_PATTERN)
    admin_note: str = Field(default="", max_length=500)


class AddressChangeRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    order_id: str
    requested_address: dict
    note: str
    status: str
    admin_note: str
    created_at: datetime
    resolved_at: datetime | None


class AdminAddressChangeRequestOut(AddressChangeRequestOut):
    order_number: str | None = None
    customer_name: str | None = None
    customer_email: str | None = None


class OrderOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    number: str
    status: str
    subtotal: float
    # Coupon discount only; the automatic quantity-tier saving is bulk_discount.
    discount: float
    # Null-coerced for the same reason as OrderItemOut.discount above: orders
    # placed before this column existed must keep serializing.
    bulk_discount: float = 0
    _coerce_bulk = field_validator("bulk_discount", mode="before")(_zero_if_none)
    total: float
    coupon_code: str | None
    address_id: str | None
    delivery_slot: str | None
    carrier: str | None = None
    tracking_number: str | None = None
    tracking_url: str | None = None
    expected_delivery: date | None = None
    created_at: datetime
    items: list[OrderItemOut] = []
    payments: list[PaymentOut] = []
    customer: OrderCustomerOut | None = None
    address: OrderAddressOut | None = None
    tracking_events: list[OrderTrackingEventOut] = []
    cancellation_requests: list[CancellationRequestOut] = []
    address_change_requests: list[AddressChangeRequestOut] = []
    # Computed server-side per request (see services/policy.annotate_order) -
    # not derivable straight from the ORM row, so these default to a safe
    # "no" until a router explicitly fills them in.
    can_cancel: bool = False
    can_request_address_change: bool = False
    address_change_deadline: datetime | None = None
    # "not_applicable" | "pending" | "refunded" - see services/policy.refund_status().
    refund_status: str = "not_applicable"


class OrderStatusUpdate(BaseModel):
    status: str = Field(pattern="^(created|payment_pending|cod_confirmed|paid|in_production|shipped|delivered|cancelled|refunded)$")


class PaymentInitOut(BaseModel):
    payment_id: str
    razorpay_order_id: str
    razorpay_key_id: str
    amount: float
    amount_paise: int
    mock: bool
    name: str = "Sai Kumar Studio"
    description: str
    prefill_contact: str | None = None
    prefill_email: str | None = None


class PaymentVerifyIn(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


# ---------------------------------------------------------------- reviews

class ReviewIn(BaseModel):
    product_id: str
    rating: int = Field(ge=1, le=5)
    comment: str = Field(default="", max_length=2000)


class ReviewOut(BaseModel):
    rating: int
    comment: str
    name: str
    created_at: datetime


# ---------------------------------------------------------------- homepage / arrange

class HomepageLayoutIn(BaseModel):
    category_ids: list[str] = Field(default_factory=list, max_length=20)
    product_ids: list[str] = Field(default_factory=list, max_length=20)


# ---------------------------------------------------------------- site menu (category menu bar)

# Custom links end up as <a href> on every storefront page, so anything that could
# run script (javascript:, data:, vbscript:) is refused here. Relative paths
# ("gifts.html?category=frames"), "#anchors", http(s), mailto: and tel: are fine.
_MENU_URL_RE = re.compile(r"^(https?://|mailto:|tel:|#|[A-Za-z0-9_./?=&%+-])", re.IGNORECASE)
_MENU_BAD_SCHEME_RE = re.compile(r"^\s*(javascript|data|vbscript):", re.IGNORECASE)
_SLUG_RE = re.compile(r"^[A-Za-z0-9_-]{1,80}$")


def _clean_menu_url(v: str) -> str:
    v = (v or "").strip()
    if not v:
        raise ValueError("Link URL is required")
    if _MENU_BAD_SCHEME_RE.match(v) or not _MENU_URL_RE.match(v):
        raise ValueError(f"Unsupported link URL: {v[:60]}")
    return v


class MenuTargetIn(BaseModel):
    """Where a menu entry points. Pages/categories/products are stored as
    references (not URLs) so the storefront link is built from live data - a
    renamed product keeps working, a hidden one drops out of the menu."""
    type: str = Field(pattern="^(page|category|product|url)$")
    page: str = Field(default="", max_length=60)        # page / category targets
    category: str = Field(default="", max_length=80)    # category slug within `page`
    keyword: str = Field(default="", max_length=60)     # optional filter within a gifts category
    product_id: str = Field(default="", max_length=64)
    url: str = Field(default="", max_length=500)

    @model_validator(mode="after")
    def _check(self):
        self.keyword = self.keyword.strip()
        if self.type in ("page", "category") and not _SLUG_RE.match(self.page or ""):
            raise ValueError("Choose a page for this link")
        if self.type == "category" and not _SLUG_RE.match(self.category or ""):
            raise ValueError("Choose a category for this link")
        if self.type == "product" and not self.product_id.strip():
            raise ValueError("Choose a product for this link")
        if self.type == "url":
            self.url = _clean_menu_url(self.url)
        return self


def _legacy_url_to_target(data):
    # Menus saved before links had pickers stored a plain "url".
    if isinstance(data, dict) and not data.get("target") and data.get("url"):
        data = {**data, "target": {"type": "url", "url": data["url"]}}
        data.pop("url", None)
    return data


def _clean_menu_image(v: str) -> str:
    v = (v or "").strip()
    if v and not re.match(r"^(https?://|[A-Za-z0-9_./-])", v, re.IGNORECASE):
        raise ValueError("Images must be an http(s) URL or a site path")
    return v


class MenuLinkIn(BaseModel):
    # A row is either a link (label + target, optional badge) or a sub-heading inside
    # the column (heading only) - e.g. "Pillows" under the Drinkware links.
    label: str = Field(default="", max_length=80)
    badge: str = Field(default="", max_length=20)
    # Only used by "cards" columns (photo + one-line description). Blank = taken
    # from the linked category/product.
    description: str = Field(default="", max_length=160)
    image: str = Field(default="", max_length=1000)
    heading: str | None = Field(default=None, max_length=80)
    is_active: bool = True
    target: MenuTargetIn | None = None

    _legacy = model_validator(mode="before")(_legacy_url_to_target)

    @model_validator(mode="after")
    def _check(self):
        if self.heading is not None:
            self.heading = self.heading.strip()
            if not self.heading:
                raise ValueError("Sub-heading text is required")
            self.target = None
            return self
        self.label = self.label.strip()
        if not self.label:
            raise ValueError("Every dropdown link needs a label")
        if self.target is None:
            raise ValueError(f'Choose where "{self.label}" links to')
        self.badge = self.badge.strip()
        self.description = self.description.strip()
        self.image = _clean_menu_image(self.image)
        return self


class MenuCtaIn(BaseModel):
    """Small "Need something special? [Contact Us]" box under a column."""
    title: str = Field(default="", max_length=80)
    text: str = Field(default="", max_length=200)
    button: str = Field(default="", max_length=40)
    target: MenuTargetIn | None = None


class MenuColumnIn(BaseModel):
    title: str = Field(default="", max_length=80)
    style: str = Field(default="list", pattern="^(list|cards)$")
    is_active: bool = True
    links: list[MenuLinkIn] = Field(default_factory=list, max_length=40)
    cta: MenuCtaIn | None = None

    @field_validator("cta")
    @classmethod
    def _cta(cls, v):
        return v if v is not None and (v.title or v.text or v.button) else None


class MenuPromoIn(BaseModel):
    image: str = Field(default="", max_length=1000)
    tag: str = Field(default="", max_length=40)       # e.g. "Special Offer" (photography layout)
    title: str = Field(default="", max_length=80)
    subtitle: str = Field(default="", max_length=120)
    button: str = Field(default="", max_length=40)    # e.g. "View All Packages →" (photography layout)
    target: MenuTargetIn | None = None  # None = same place as the menu item

    _legacy = model_validator(mode="before")(_legacy_url_to_target)

    @field_validator("image")
    @classmethod
    def _image(cls, v):
        return _clean_menu_image(v)


class MenuItemIn(BaseModel):
    label: str = Field(min_length=1, max_length=60)
    target: MenuTargetIn
    is_active: bool = True
    dropdown_active: bool = True
    in_more: bool = False  # studio layout: listed under the bar's "More" dropdown
    columns: list[MenuColumnIn] = Field(default_factory=list, max_length=6)
    promo: MenuPromoIn | None = None

    _legacy = model_validator(mode="before")(_legacy_url_to_target)

    @field_validator("label")
    @classmethod
    def _label(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("Menu item label is required")
        return v

    @field_validator("promo")
    @classmethod
    def _promo(cls, v):
        # An all-blank promo card is the same as no promo card.
        if v is not None and not (v.image or v.title or v.subtitle):
            return None
        return v


class MenuBenefitIn(BaseModel):
    icon: str = Field(default="", max_length=8)
    title: str = Field(default="", max_length=60)
    text: str = Field(default="", max_length=100)


class SiteMenuIn(BaseModel):
    items: list[MenuItemIn] = Field(min_length=1, max_length=20)
    # Strip along the bottom of every dropdown (photography layout only).
    benefits: list[MenuBenefitIn] = Field(default_factory=list, max_length=6)


class ArrangeIn(BaseModel):
    category_id: str
    ids: list[str]


class CategoryReorderIn(BaseModel):
    page_id: str
    ids: list[str]


class MediaReorderIn(BaseModel):
    ids: list[str]  # media ids in the desired display order (first = main image)


# ---------------------------------------------------------------- settings

class SettingIn(BaseModel):
    value: dict


class SettingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    key: str
    value: dict


# ---------------------------------------------------------------- order artwork retention

class ArtworkHoldIn(BaseModel):
    hold: bool
    # Why this file is being kept - shown in the admin list so a hold set months
    # ago still explains itself ("reprint pending", "damage claim #1234").
    note: str | None = None


class ArtworkPurgeIn(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=200)


class ArtworkRetentionIn(BaseModel):
    # 1 day minimum: same-day deletion would remove artwork before anyone could
    # act on a delivery complaint. 3650 is a sanity ceiling, not a policy.
    days: int = Field(ge=1, le=3650)
