from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy.orm import Session

from ..models import Coupon


def money(v) -> Decimal:
    return Decimal(str(v)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def to_paise(v) -> int:
    """Converts a rupee amount to integer paise for Razorpay, staying in
    Decimal arithmetic the whole way through (no float round-trip) so this
    stays consistent with money()'s Decimal-based rounding."""
    return int((money(v) * 100).to_integral_value(rounding=ROUND_HALF_UP))


# ---------------------------------------------------------------- quantity tiers

def default_tier_label(min_qty: int, dtype: str, value) -> str:
    """The offer wording shown on the storefront when the admin didn't type their
    own. Mirrored by js/shared/bulk-tiers.js so a card rendered from a page's
    cached catalog data reads identically to one priced here."""
    amount = f"{float(value):g}% off" if dtype == "percent" else f"₹{int(round(float(value)))} off"
    return f"Buy {min_qty} or more, get {amount}"


def normalize_bulk_tiers(raw) -> list[dict]:
    """Cleans a Product.bulk_discounts list into usable tiers, sorted by min_qty
    ascending. Deliberately tolerant: these rows are admin-entered JSON that may
    predate any given validation rule, and one malformed tier must be dropped
    rather than break pricing for every cart the product appears in. Idempotent,
    so passing an already-normalized list back through is safe."""
    tiers = []
    for entry in raw or []:
        if not isinstance(entry, dict):
            continue
        try:
            min_qty = int(entry.get("min_qty") or 0)
            value = Decimal(str(entry.get("value") or 0))
        except (TypeError, ValueError, ArithmeticError):
            continue
        if min_qty < 1 or value <= 0:
            continue
        dtype = entry.get("type") if entry.get("type") in ("percent", "flat") else "percent"
        if dtype == "percent" and value > 100:
            value = Decimal("100")
        try:
            raw_max = entry.get("max_discount")
            max_discount = Decimal(str(raw_max)) if raw_max not in (None, "") else None
        except (TypeError, ValueError, ArithmeticError):
            max_discount = None
        if max_discount is not None and max_discount <= 0:
            max_discount = None
        tiers.append({
            "min_qty": min_qty,
            "type": dtype,
            "value": float(value),
            "max_discount": float(max_discount) if max_discount is not None else None,
            "label": str(entry.get("label") or "").strip() or default_tier_label(min_qty, dtype, value),
        })
    # Two tiers at the same min_qty would make the winner depend on list order,
    # which the admin has no way to see - keep the better-value one.
    best: dict[int, dict] = {}
    for tier in tiers:
        current = best.get(tier["min_qty"])
        if current is None or _tier_rank(tier) > _tier_rank(current):
            best[tier["min_qty"]] = tier
    return sorted(best.values(), key=lambda t: t["min_qty"])


def _tier_rank(tier: dict) -> tuple[int, float]:
    # percent and flat aren't directly comparable without an order value, so
    # rank within a type only and prefer percent as the more common intent.
    return (1 if tier["type"] == "percent" else 0, tier["value"])


def bulk_tier_for(tiers: list[dict], qty: int) -> dict | None:
    """The single best tier `qty` units qualify for, or None. Tiers never stack
    with each other: at qty 25 with tiers at 10 and 20, the customer gets the
    20 tier only, not both."""
    qualifying = [t for t in tiers if qty >= t["min_qty"]]
    return max(qualifying, key=lambda t: t["min_qty"]) if qualifying else None


def bulk_discount_for(tiers, qty: int, amount) -> tuple[dict | None, Decimal]:
    """Discount on `amount` - the pre-discount value of every unit of one
    product - for buying `qty` of it. Returns (tier, discount), or (None, 0)
    when no tier applies. Never exceeds `amount`, so a too-generous flat tier
    can't drive a line negative."""
    amount = money(amount)
    if qty < 1 or amount <= 0:
        return None, Decimal("0")
    tier = bulk_tier_for(normalize_bulk_tiers(tiers), qty)
    if not tier:
        return None, Decimal("0")
    if tier["type"] == "percent":
        discount = (amount * money(tier["value"]) / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if tier.get("max_discount") is not None:
            discount = min(discount, money(tier["max_discount"]))
    else:
        discount = money(tier["value"])
    return tier, min(discount, amount)


def deduct_order_item(order, item) -> Decimal:
    """Removes one cancelled line from its order's money columns, keeping
    subtotal / bulk_discount / total mutually consistent, and returns the net
    amount removed (what the customer is actually owed back for that line).

    The line's gross value comes off the subtotal but its share of the
    quantity-tier discount comes off bulk_discount at the same time, so the net
    change to the total is only what the customer really paid for it. Subtracting
    the gross alone - as this did before per-line discounts existed - would refund
    a bulk-discounted line at its list price.

    The remaining lines keep the tier they were sold under even if cancelling
    this one drops the product's surviving quantity below that tier's min_qty:
    re-pricing a paid order upward after the fact would mean charging the
    customer more than they agreed to. The coupon discount is likewise left
    alone, matching how whole-line cancellation has always treated it."""
    gross = money(item.unit_price) * item.qty
    line_discount = min(money(item.discount or 0), gross)
    net = gross - line_discount
    order.subtotal = max(money(0), money(order.subtotal) - gross)
    order.bulk_discount = max(money(0), money(order.bulk_discount or 0) - line_discount)
    order.total = max(money(0), money(order.total) - net)
    return net


def validate_coupon(db: Session, code: str | None, subtotal: Decimal) -> tuple[Coupon | None, Decimal, str]:
    if not code:
        return None, Decimal("0"), ""
    coupon = db.query(Coupon).filter(Coupon.code == code.upper(), Coupon.is_active == True).first()
    if not coupon:
        return None, Decimal("0"), "Coupon not found or inactive"

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    if coupon.starts_at and now < coupon.starts_at:
        return None, Decimal("0"), "Coupon not active yet"
    if coupon.ends_at and now > coupon.ends_at:
        return None, Decimal("0"), "Coupon has expired"
    if subtotal < money(coupon.min_order):
        return None, Decimal("0"), f"Minimum order value is ₹{coupon.min_order}"

    if coupon.type == "percent":
        discount = (subtotal * money(coupon.value) / Decimal("100")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if coupon.max_discount is not None:
            discount = min(discount, money(coupon.max_discount))
    else:
        discount = money(coupon.value)

    discount = min(discount, subtotal)
    return coupon, discount, ""


def _apply_bulk_discounts(lines: list[dict], products: dict) -> Decimal:
    """Applies each product's quantity tiers to `lines` in place - setting
    line["bulk_discount"] and line["bulk_tier"] - and returns the total.

    Quantity is summed per product across lines, not per line: a cart holding 6
    mugs with one photo and 4 with another is ten mugs and reaches a min_qty of
    10. Each line is a separate *configuration* of a product (see
    js/shared/cart-core.js's line-identity hash), and counting per line would
    silently deny the offer to a customer who did buy ten of the thing.

    The group's discount is then split back over its lines in proportion to each
    line's value, because one line can be cancelled independently of the rest and
    has to carry its own share - see OrderItem.discount."""
    groups: dict[str, list[dict]] = {}
    for line in lines:
        line["bulk_discount"] = Decimal("0")
        line["bulk_tier"] = None
        product_id = line.get("product_id")
        if product_id and product_id in products:
            groups.setdefault(product_id, []).append(line)

    total = Decimal("0")
    for product_id, group in groups.items():
        tiers = normalize_bulk_tiers(getattr(products[product_id], "bulk_discounts", None))
        if not tiers:
            continue
        group_qty = sum(line["qty"] for line in group)
        group_total = sum((line["line_total"] for line in group), Decimal("0"))
        tier, discount = bulk_discount_for(tiers, group_qty, group_total)
        if not tier or discount <= 0:
            continue
        # Proportional split with the remainder on the last line, so the per-line
        # shares always add back up to exactly `discount` - rounding each line
        # independently drifts by a paisa or two across a multi-line group, and
        # that gap would show up as an order whose items don't sum to its total.
        allocated = Decimal("0")
        for line in group[:-1]:
            share = (discount * line["line_total"] / group_total).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
            line["bulk_discount"] = share
            line["bulk_tier"] = tier
            allocated += share
        group[-1]["bulk_discount"] = discount - allocated
        group[-1]["bulk_tier"] = tier
        total += discount
    return total


def price_cart(
    db: Session,
    items: list[dict],
    coupon_code: str | None = None,
    products: dict | None = None,
) -> dict:
    """items: [{title, price, qty, image?, product_id?}]. Prices are taken as given —
    most storefront pages still render hardcoded package data with no backend Product
    row to check a price against (see orders.py for the product_id-linked exception).

    `products` maps product_id -> Product for the lines that have one, and is what
    makes automatic quantity-tier discounts possible; a line whose product isn't in
    it (or that has no product_id at all) simply gets no tier discount.

    Discount order: a product's quantity tiers come off first, and a coupon then
    applies to what's left rather than to the list price - so a 20% coupon on top
    of a 20% bulk tier saves 36%, not 40%, and two generous offers can't compound
    into a near-free order."""
    products = products or {}
    lines = []
    subtotal = Decimal("0")
    for entry in items:
        qty = max(1, int(entry.get("qty", 1)))
        unit_price = money(entry["price"])
        line_total = unit_price * qty
        lines.append({**entry, "qty": qty, "unit_price": unit_price, "line_total": line_total})
        subtotal += line_total

    bulk_discount = _apply_bulk_discounts(lines, products)
    after_bulk = subtotal - bulk_discount

    coupon, discount, coupon_message = validate_coupon(db, coupon_code, after_bulk)
    total = after_bulk - discount

    return {
        "lines": lines,
        "subtotal": subtotal,
        "bulk_discount": bulk_discount,
        "discount": discount,
        "total": total,
        "coupon": coupon,
        "coupon_message": coupon_message,
    }
