"""Business rules for post-purchase order self-service: when a customer can
still request a delivery-address change or a cancellation, and the computed
flags the frontend uses to show/hide those actions."""
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from ..models import Order, Product, Setting
from ..schemas import OrderAddressOut, OrderOut

DEFAULT_ADDRESS_CHANGE_WINDOW_HOURS = 24

# Address changes only make sense before an order's items go into production -
# once a product enters "in_production" (design/manufacturing has actually
# started) there's nowhere left to redirect it, so that status and everything
# after it (shipped/delivered/cancelled/refunded) are excluded.
ADDRESS_CHANGE_ELIGIBLE_STATUSES = ("created", "payment_pending", "cod_confirmed", "paid")

# Nothing has been charged or committed yet at these statuses, so a customer can
# cancel immediately without staff review.
IMMEDIATE_CANCEL_STATUSES = ("created", "payment_pending")

# Once money has moved, cancelling needs a staff decision (refund/restock
# implications) - raised as a request instead. Cancellation stops being
# offered at all once a product enters "in_production" - production has
# actually started by then, so it (and shipped/delivered after it) are
# excluded, same cutoff as address changes above.
REQUESTABLE_CANCEL_STATUSES = ("cod_confirmed", "paid")


def _default_window_hours(db: Session) -> int:
    setting = db.get(Setting, "order_policy")
    if setting and isinstance(setting.value, dict):
        value = setting.value.get("default_address_change_window_hours")
        if isinstance(value, (int, float)) and value > 0:
            return int(value)
    return DEFAULT_ADDRESS_CHANGE_WINDOW_HOURS


def _product_window_map(db: Session, product_ids: set[str]) -> dict[str, int]:
    """Batch lookup of address_change_window_hours for a set of product ids,
    so callers annotating many orders can avoid one Product query per order."""
    if not product_ids:
        return {}
    rows = (
        db.query(Product.id, Product.address_change_window_hours)
        .filter(Product.id.in_(product_ids))
        .all()
    )
    return {pid: hours for pid, hours in rows if hours is not None}


def address_change_deadline(
    db: Session, order: Order,
    window_map: dict[str, int] | None = None, default_hours: int | None = None,
) -> datetime | None:
    """The instant after which this order can no longer have its address
    changed, or None if it's already past the point of change entirely.
    Each item's product may set its own window (set by staff when creating the
    product - e.g. a "prints same day" product needs a shorter buffer than a
    made-to-order gift); the order uses the strictest (smallest) one so no
    item risks being produced against a stale address.

    window_map/default_hours let callers annotating many orders at once
    (e.g. the admin order list) pass in pre-fetched lookups instead of
    triggering a Product/Setting query per order."""
    if order.status not in ADDRESS_CHANGE_ELIGIBLE_STATUSES:
        return None
    product_ids = [item.product_id for item in order.items if item.product_id]
    if window_map is not None:
        windows = [window_map[pid] for pid in product_ids if pid in window_map]
    else:
        windows = []
        if product_ids:
            windows = [
                p.address_change_window_hours
                for p in db.query(Product).filter(Product.id.in_(product_ids)).all()
                if p.address_change_window_hours is not None
            ]
    if windows:
        hours = min(windows)
    else:
        hours = default_hours if default_hours is not None else _default_window_hours(db)
    return order.created_at + timedelta(hours=hours)


def refund_status(order: Order) -> str:
    """Whether money paid on this order still needs to come back to the
    customer. Purely computed from existing Payment/Order state - there's no
    separate refund workflow, just Payment.status flipping to "refunded" when
    staff use the manual Refund action (see routers/payments.py)."""
    payments = order.payments or []
    # Checked first: a refund Razorpay rejected leaves the order saying
    # "refunded" while the money is still with us (see payments.py refund.failed).
    if any(p.status == "captured" and p.refund_status == "failed" for p in payments):
        return "failed"
    if order.status == "refunded" or any(p.status == "refunded" for p in payments):
        return "refunded"
    if order.status == "cancelled" and any(p.status == "captured" for p in payments):
        return "pending"
    return "not_applicable"


def _annotate(
    order: Order, deadline: datetime | None,
) -> OrderOut:
    out = OrderOut.model_validate(order)
    # Prefer the immutable checkout-time snapshot over the live Address join -
    # the customer can edit or delete that Address row later (My Account), and
    # address_id is ON DELETE SET NULL, so the live join alone would let a
    # completed order's delivery address silently change or disappear.
    # Falls back to the live join for orders placed before this snapshot
    # existed and never backfilled (see migrations.backfill_address_snapshots).
    if order.address_snapshot:
        out.address = OrderAddressOut(**order.address_snapshot)
    now = datetime.now(timezone.utc)
    out.address_change_deadline = deadline
    # Address changes are capped at one request per order for its whole
    # lifetime, regardless of outcome - not just "no request pending right
    # now" - so a customer can't keep re-requesting after each decision.
    out.can_request_address_change = bool(
        deadline and now <= deadline and not order.address_change_requests
    )
    # Only a pending *whole-order* request (order_item_id is None) blocks the
    # "Cancel Order" action - a pending request against one line item must not
    # lock out the others, or every other product in the order would wrongly
    # show "cancellation pending" too (see per-item gating in the frontend,
    # which mirrors this same scoping).
    out.can_cancel = (
        order.status in (IMMEDIATE_CANCEL_STATUSES + REQUESTABLE_CANCEL_STATUSES)
        and not any(r.status == "pending" and r.order_item_id is None for r in order.cancellation_requests)
    )
    out.refund_status = refund_status(order)
    return out


def annotate_order(db: Session, order: Order) -> OrderOut:
    """Builds the customer-facing OrderOut, filling in the can_cancel /
    can_request_address_change / address_change_deadline flags the frontend
    uses to decide which self-service buttons to show."""
    deadline = address_change_deadline(db, order)
    return _annotate(order, deadline)


def annotate_orders(db: Session, orders: list[Order]) -> list[OrderOut]:
    """Same as annotate_order, but for a list: batches the Product window
    lookups and the order_policy Setting lookup into a couple of queries
    total instead of a couple per order."""
    product_ids = {
        item.product_id
        for o in orders if o.status in ADDRESS_CHANGE_ELIGIBLE_STATUSES
        for item in o.items if item.product_id
    }
    window_map = _product_window_map(db, product_ids)
    default_hours = _default_window_hours(db)
    return [
        _annotate(o, address_change_deadline(db, o, window_map, default_hours))
        for o in orders
    ]
