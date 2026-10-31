import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload, selectinload

from ..config import get_settings
from ..database import SessionLocal, get_db
from ..deps import get_current_user
from ..models import (
    Address, Order, OrderAddressChangeRequest, OrderCancellationRequest,
    OrderItem, OrderTrackingEvent, Payment, Product, User, uid,
)
from ..schemas import AddressChangeRequestIn, CancellationRequestIn, CheckoutIn, OrderOut, PaymentInitOut
from ..services.inventory import restock, try_decrement_stock
from ..services.notifications import order_event
from ..services.policy import (
    IMMEDIATE_CANCEL_STATUSES, REQUESTABLE_CANCEL_STATUSES,
    address_change_deadline, annotate_order, annotate_orders,
)
from ..services.pricing import deduct_order_item, price_cart, to_paise
from ..services.product_fields import resolve_product_price, validate_product_field_values
from ..services.razorpay_service import create_rzp_order
from ..services.retention import link_uploads_to_order
from ..services.storage import CUSTOM_UPLOAD_FIELDS, upload_data_uri

router = APIRouter(prefix="/api/orders", tags=["orders"])
settings = get_settings()
logger = logging.getLogger("orders")


def _customization_upload_urls(customization: dict | None) -> list[str]:
    """Every already-uploaded artwork URL in one line's customization.

    The counterpart to _customization_has_upload below: that one finds inline
    base64 still waiting to be moved to R2, this one finds files the storefront
    already uploaded up front (POST /api/uploads/artwork). Both shapes exist at
    once - a cart built before this change, or by a browser that fell back to
    the inline path, still arrives as base64 - so checkout handles either.

    These URLs are how a CustomerUpload row is matched to the order it ended up
    in, which is what starts its retention clock (services/retention.py)."""
    urls: list[str] = []
    if not isinstance(customization, dict):
        return urls

    def collect(value):
        if isinstance(value, str) and value.startswith(("http://", "https://")):
            urls.append(value)
        elif isinstance(value, list):
            for v in value:
                collect(v)

    for field in CUSTOM_UPLOAD_FIELDS:
        collect(customization.get(field))
    fields = customization.get("fields")
    if isinstance(fields, dict):
        for value in fields.values():
            collect(value)
    return urls


def _customization_has_upload(customization: dict | None) -> bool:
    """True if this line's customization contains at least one inline data:
    URI still waiting to be externalized to R2 - used to decide whether it's
    worth scheduling a background job for this order item at all."""
    if not isinstance(customization, dict):
        return False
    for field in CUSTOM_UPLOAD_FIELDS:
        value = customization.get(field)
        if isinstance(value, str) and value.startswith("data:"):
            return True
    fields = customization.get("fields")
    if isinstance(fields, dict):
        for value in fields.values():
            if isinstance(value, str) and value.startswith("data:"):
                return True
            if isinstance(value, list) and any(isinstance(v, str) and v.startswith("data:") for v in value):
                return True
    return False


def _externalize_customization(customization: dict | None, order_number: str) -> dict | None:
    """Swaps any uploaded photo/logo in a cart line's customization from an
    inline base64 data: URI to a small Supabase Storage URL before it's
    persisted - keeps the order (and every admin/customer list that reads it
    back) out of multi-MB-per-item territory. Falls back to the original
    base64 field-by-field if a given upload can't be externalized.

    This does real work (Pillow decode/validate/re-encode, then an R2 upload) -
    a few hundred ms to a couple of seconds per image. It must never run on the
    request path (see _externalize_order_item_background below): checkout
    already stores the raw base64 as OrderItem.product_snapshot, which is a
    perfectly valid, permanent value on its own (the same fallback already used
    if this externalization ever fails) - this just opportunistically shrinks
    it afterward, off the customer's critical path."""
    if not isinstance(customization, dict):
        return customization
    out = dict(customization)
    for field in CUSTOM_UPLOAD_FIELDS:
        value = out.get(field)
        if isinstance(value, str) and value.startswith("data:"):
            url = upload_data_uri(value, subfolder=order_number)
            if url:
                out[field] = url

    # Admin-configured dynamic upload fields (Product.input_fields) land under
    # customization.fields[fieldId] as a single data: URI or a list of them
    # (multi-upload fields) - externalize those the same way.
    fields = out.get("fields")
    if isinstance(fields, dict):
        new_fields = dict(fields)
        for key, value in fields.items():
            if isinstance(value, str) and value.startswith("data:"):
                url = upload_data_uri(value, subfolder=order_number)
                if url:
                    new_fields[key] = url
            elif isinstance(value, list):
                new_fields[key] = [
                    (upload_data_uri(v, subfolder=order_number) or v) if isinstance(v, str) and v.startswith("data:") else v
                    for v in value
                ]
        out["fields"] = new_fields
    return out


def _externalize_order_item_background(order_item_id: str, customization: dict, order_number: str) -> None:
    """Runs after checkout()'s response has already been sent (see
    background_tasks.add_task below) - opens its own DB session since the
    request's session is gone by then. Best-effort: OrderItem.product_snapshot
    already holds the valid, permanent inline-base64 version from checkout()
    itself, so a failure here just leaves that in place, exactly like a failed
    upload_data_uri() call always has."""
    try:
        externalized = _externalize_customization(customization, order_number)
    except Exception:
        logger.warning("Background customization externalization failed for order item %s", order_item_id, exc_info=True)
        return
    db = SessionLocal()
    try:
        item = db.get(OrderItem, order_item_id)
        if not item:
            return
        snapshot = dict(item.product_snapshot or {})
        snapshot["customization"] = externalized
        item.product_snapshot = snapshot
        db.commit()
    except Exception:
        logger.warning("Failed to save externalized customization for order item %s", order_item_id, exc_info=True)
        db.rollback()
    finally:
        db.close()


ORDER_LOAD = (
    selectinload(Order.items),
    selectinload(Order.payments),
    # user/address are many-to-one (exactly one row per order) - joinedload
    # folds them into the main query instead of costing their own DB round
    # trip, which matters when the DB is remote and latency-bound.
    joinedload(Order.user),
    joinedload(Order.address),
    selectinload(Order.tracking_events),
    selectinload(Order.cancellation_requests),
    selectinload(Order.address_change_requests),
)

# Same as ORDER_LOAD, but with user/address as selectinload (a separate query)
# instead of joinedload (a LEFT OUTER JOIN folded into the main query) - both
# are nullable FKs, and Postgres refuses "SELECT ... FOR UPDATE" the moment a
# LEFT OUTER JOIN is involved ("FOR UPDATE cannot be applied to the nullable
# side of an outer join"). confirm_cod() below is the one place that combines
# ORDER_LOAD's eager loading with .with_for_update() to lock the order row,
# so it needs this variant instead - two small extra queries cost far less
# than the crash this was causing on every Cash-on-Delivery confirmation.
ORDER_LOAD_LOCKABLE = (
    selectinload(Order.items),
    selectinload(Order.payments),
    selectinload(Order.user),
    selectinload(Order.address),
    selectinload(Order.tracking_events),
    selectinload(Order.cancellation_requests),
    selectinload(Order.address_change_requests),
)


def order_number() -> str:
    return f"SK{datetime.now():%y%m%d}{secrets.randbelow(10000):04d}"


def _payment_init(order: Order, payment: Payment, user: User) -> PaymentInitOut:
    return PaymentInitOut(
        payment_id=payment.id,
        razorpay_order_id=payment.razorpay_order_id,
        razorpay_key_id=settings.razorpay_key_id,
        amount=float(payment.amount),
        amount_paise=to_paise(payment.amount),
        mock=settings.razorpay_mock,
        description=f"Order {order.number}",
        prefill_contact=user.phone,
        prefill_email=user.email,
    )


@router.post("/checkout", status_code=status.HTTP_201_CREATED)
def checkout(body: CheckoutIn, background_tasks: BackgroundTasks,
             user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    address = db.query(Address).filter(Address.id == body.address_id, Address.user_id == user.id).first()
    if not address:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Address not found")
    if not body.items:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cart is empty")

    # Only items that name a real, resolvable Product get stock-checked and linked —
    # most storefront pages still render hardcoded package data with no backend row.
    product_ids = [entry.product_id for entry in body.items if entry.product_id]
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_(product_ids)).all()} if product_ids else {}
    # The same product can appear as more than one cart line (e.g. two different
    # customizations of the same item) - stock must be checked against the total
    # quantity requested across every line for that product, not each line in
    # isolation, or two lines that individually fit in stock can jointly oversell it.
    requested_qty: dict[str, int] = {}
    for entry in body.items:
        if entry.product_id:
            requested_qty[entry.product_id] = requested_qty.get(entry.product_id, 0) + entry.qty
    # A client-supplied price is only ever trusted for lines with no product_id at all
    # (hardcoded storefront pages with no backend Product row). Any line that names a
    # real product gets its price re-derived from the catalog here — see
    # resolve_product_price(); the client's `price` field for such lines is discarded.
    resolved_prices: dict[int, float] = {}
    for idx, entry in enumerate(body.items):
        if not entry.product_id:
            continue
        product = products.get(entry.product_id)
        if not product or not product.is_active:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f'"{entry.title}" is no longer available')
        field_errors = validate_product_field_values(
            product, (entry.customization or {}).get("fields") if entry.customization else None
        )
        if field_errors:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f'"{product.title}": {"; ".join(field_errors)}')
        resolved_prices[idx] = resolve_product_price(
            product, (entry.customization or {}).get("fields") if entry.customization else None
        )

    # Stock is reserved right here, atomically, rather than merely checked - this
    # is what actually closes the gap the old informational-only check left open
    # (two customers checking out the last unit at the same instant could both
    # pass a plain `stock < qty` read and both place an order for it). Reserving
    # at checkout instead of at payment time also means an abandoned/unpaid order
    # doesn't let its items be sold to someone else while it's still theoretically
    # payable - see expire_stale_reservations() below for how that reservation is
    # released if the order is never paid. Only one reservation per product even
    # if it appears on multiple lines - requested_qty above already summed those.
    for product_id, qty in requested_qty.items():
        product = products[product_id]
        if product.type == "product" and product.stock is not None and not try_decrement_stock(db, product_id, qty):
            db.rollback()
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f'"{product.title}" is out of stock')

    priced = price_cart(
        db,
        [
            {
                "product_id": i.product_id,
                "title": i.title,
                "price": resolved_prices[idx] if i.product_id else i.price,
                "qty": i.qty,
                "image": i.image,
                "customization": i.customization,
            }
            for idx, i in enumerate(body.items)
        ],
        body.coupon_code,
        products,
    )
    if not priced["lines"]:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cart is empty")

    number = order_number()
    rzp_order = create_rzp_order(to_paise(priced["total"]), receipt=number)

    # id is assigned client-side (models.uid) rather than left to the column
    # default, so OrderItem rows below can reference order.id immediately -
    # no need to flush the Order insert to the DB just to learn its own id.
    # user/address are set as relationships (not just user_id/address_id) so
    # annotate_order() below can read order.user/order.address straight out of
    # memory - both are already fully loaded objects sitting right here, so
    # there's no reason to make it lazy-load them back out of the DB.
    order = Order(
        id=uid(),
        number=number,
        user_id=user.id,
        user=user,
        status="payment_pending",
        subtotal=priced["subtotal"],
        discount=priced["discount"],
        bulk_discount=priced["bulk_discount"],
        total=priced["total"],
        coupon_code=priced["coupon"].code if priced["coupon"] else None,
        address_id=address.id,
        address=address,
        address_snapshot={
            "full_name": address.full_name, "phone": address.phone,
            "line1": address.line1, "line2": address.line2,
            "city": address.city, "state": address.state, "pincode": address.pincode,
        },
        delivery_slot=body.delivery_slot,
    )
    db.add(order)

    # Any uploaded photo/logo customization is stored inline (base64) right now -
    # externalizing it to a small R2 URL involves real Pillow processing plus a
    # network upload (a few hundred ms to multiple seconds per image, worse with
    # several items), which used to run synchronously here and was the single
    # biggest contributor to slow checkouts. It's scheduled as a background task
    # below instead, well after this response is already on its way to the
    # customer - see _externalize_order_item_background()'s docstring for why
    # the inline base64 stored here is already a complete, valid final value on
    # its own, not a placeholder waiting to be filled in.
    # Appended onto order.items/payments/tracking_events (cascade="all,
    # delete-orphan" on each relationship already cascades the INSERT - see
    # models.py) instead of a separate db.add(child(order_id=order.id)) per
    # row. A plain db.add() with a raw order_id never touches order.items in
    # memory, so annotate_order() below would otherwise have no way to know
    # these rows exist without lazy-loading them straight back out of the DB
    # it just wrote them to - one extra remote round trip per relationship
    # (items/payments/tracking_events/cancellation_requests/
    # address_change_requests/user/address - ~1.5s each on this DB), on
    # every single checkout.
    pending_externalization: list[tuple[str, dict]] = []
    artwork_urls: list[str] = []
    for line in priced["lines"]:
        item_id = uid()
        customization = line.get("customization")
        order.items.append(OrderItem(
            id=item_id,
            product_id=line.get("product_id"),
            product_snapshot={
                "title": line["title"], "image": line.get("image"),
                "customization": customization,
            },
            unit_price=line["unit_price"],
            qty=line["qty"],
            discount=line.get("bulk_discount") or 0,
        ))
        if _customization_has_upload(customization):
            pending_externalization.append((item_id, customization))
        artwork_urls.extend(_customization_upload_urls(customization))

    # Claim the CustomerUpload rows behind this order's artwork. Until now they
    # were orphans on a short expiry clock (the customer might never have
    # checked out); from here they live and die with the order, and get their
    # real deletion date when it reaches a terminal status. Inside the same
    # transaction as the order itself, so an order can never exist with its
    # artwork still marked orphaned and due for sweeping.
    if artwork_urls:
        link_uploads_to_order(db, order, artwork_urls)

    # Payment/OrderTrackingEvent both default created_at to a server-side
    # func.now() - normally picked up by refreshing after commit, but the
    # whole point here is to avoid a refresh that would also blow away
    # order.items/payments/tracking_events above. Set it client-side instead:
    # this row is being inserted right now in the same request, so a Python
    # timestamp is as accurate as the DB's, and PaymentOut/OrderTrackingEventOut
    # (both read via order.payments/tracking_events in annotate_order() below)
    # require a real datetime, not the None a server_default leaves it at
    # in memory until something reloads the row.
    now = datetime.now(timezone.utc)
    payment = Payment(
        razorpay_order_id=rzp_order["id"],
        amount=order.total,
        created_at=now,
    )
    order.payments.append(payment)
    order.tracking_events.append(OrderTrackingEvent(status=order.status, title="Order placed", created_at=now))
    db.commit()
    # order.cancellation_requests/address_change_requests were never touched
    # above, so they're still sitting at the empty-list default a brand new
    # Order starts with - true for this order, and no DB round trip needed to
    # confirm it.
    #
    # order.created_at is the one thing above that's still a server-side
    # default (TimestampMixin's server_default=func.now()) this session's
    # expire_on_commit=False doesn't pick up without a refresh - but a bare
    # db.refresh(order) expires (and lazy-reloads on next access) *every*
    # attribute, including the relationships just populated above entirely in
    # memory above, undoing all of it. attribute_names scopes the refresh to
    # just the one column that actually needs it.
    db.refresh(order, attribute_names=["created_at"])

    for item_id, customization in pending_externalization:
        background_tasks.add_task(_externalize_order_item_background, item_id, customization, number)

    return {
        "order": annotate_order(db, order),
        "payment": _payment_init(order, payment, user),
        # Non-empty only when a coupon_code was submitted but didn't apply (not
        # found/inactive/expired/below the minimum order value) - price_cart()
        # silently proceeds at full price in that case, so without this the
        # customer would have no idea why their code had no effect.
        "coupon_message": priced["coupon_message"],
    }


@router.post("/{order_id}/confirm-cod", response_model=OrderOut)
def confirm_cod(order_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Cash-on-Delivery skips the Razorpay verify/webhook path entirely (no online
    # payment happens), so without this the order would sit in "payment_pending"
    # forever — indistinguishable from a checkout the customer simply abandoned.
    # Locks the row for the duration of this transaction - closes the (very narrow)
    # window where expire_stale_reservations() below could be mid-way through
    # expiring/restocking this exact order at the same instant the customer
    # confirms it, which would otherwise leave a "cod_confirmed" order whose
    # reservation had just been released out from under it.
    order = (
        db.query(Order).options(*ORDER_LOAD_LOCKABLE)
        .filter(Order.id == order_id, Order.user_id == user.id)
        .with_for_update().first()
    )
    if not order:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    if order.status == "payment_pending":
        order.status = "cod_confirmed"
        # Stock is no longer touched here - checkout() reserves it atomically at
        # order-creation time now (see services/inventory.py, orders.py's
        # checkout()), the same for a COD order as an online-payment one. It was
        # already decremented before this order ever reached "payment_pending".
        # Appended onto the relationship (already eager-loaded in full by
        # ORDER_LOAD above) rather than db.add(child(order_id=order.id)), so
        # order.tracking_events already reflects this new row without a
        # reload - nothing below needs a fresh copy of `order` from the DB:
        # status was just set in Python above, and every relationship
        # annotate_order() reads was already loaded by ORDER_LOAD or updated
        # in memory right here. A bare db.refresh(order) after commit would
        # otherwise expire all of that eager-loaded data, forcing
        # annotate_order() to silently re-fetch every one of those
        # relationships one at a time (~1.5s each on this DB).
        # created_at set client-side for the same reason as checkout()'s -
        # see the comment there.
        order.tracking_events.append(OrderTrackingEvent(
            status="cod_confirmed", title="Order confirmed (Cash on Delivery)",
            created_at=datetime.now(timezone.utc),
        ))
        order_event(db, order, "cod_confirmed")
        db.commit()
    return annotate_order(db, order)


# How long an unpaid order gets to hold its checkout-time stock reservation
# before expire_stale_reservations() below releases it back to the shelf. Long
# enough to cover a slow Razorpay checkout/UPI approval; short enough that an
# abandoned cart doesn't lock real inventory away from other customers for long.
RESERVATION_TTL_MINUTES = 30


def expire_stale_reservations() -> int:
    """Finds "created"/"payment_pending" orders old enough to be considered
    abandoned and releases their checkout-time stock reservation, marking them
    cancelled - without this, an order whose customer closed the tab before
    paying would hold its items' stock hostage forever (checkout() now reserves
    stock up front - see services/inventory.py - specifically so a payment_pending
    order can't be oversold to someone else, but that only works if an order
    that's never going to be paid eventually lets go of what it reserved).

    Called periodically from main.py's lifespan, not from a request - opens its
    own DB session the same way _externalize_order_item_background() above does.
    `SKIP LOCKED` means an order mid-payment-confirmation on another connection
    (holding its own row lock - see with_for_update() in confirm_cod() and
    _mark_paid()) is just left for the next sweep instead of blocking this one;
    if that confirmation succeeds, the next sweep won't see it as pending
    anymore anyway. Returns how many orders were expired, for the caller to log.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=RESERVATION_TTL_MINUTES)
    db = SessionLocal()
    try:
        stale = (
            db.query(Order)
            .options(selectinload(Order.items))
            .filter(Order.status.in_(("created", "payment_pending")), Order.created_at < cutoff)
            .with_for_update(skip_locked=True)
            .all()
        )
        for order in stale:
            _restock_order_items(db, [i for i in order.items if i.status == "active"])
            order.status = "cancelled"
            db.add(OrderTrackingEvent(
                order_id=order.id, status="cancelled", title="Order cancelled",
                description="Automatically cancelled - payment was never completed within the reservation window.",
            ))
            order_event(db, order, "cancelled")
        if stale:
            db.commit()
        return len(stale)
    except Exception:
        logger.warning("expire_stale_reservations failed", exc_info=True)
        db.rollback()
        return 0
    finally:
        db.close()


@router.get("/my", response_model=list[OrderOut])
def my_orders(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    orders = (
        db.query(Order)
        .options(*ORDER_LOAD)
        .filter(Order.user_id == user.id)
        .order_by(Order.created_at.desc())
        .limit(100)
        .all()
    )
    return annotate_orders(db, orders)


@router.get("/{order_id}", response_model=OrderOut)
def get_order(order_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    order = (
        db.query(Order).options(*ORDER_LOAD)
        .filter(Order.id == order_id, Order.user_id == user.id).first()
    )
    if not order:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    return annotate_order(db, order)


@router.post("/{order_id}/retry-payment")
def retry_payment(order_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id, Order.user_id == user.id).first()
    if not order:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    if order.status != "payment_pending":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Order is not awaiting payment")

    rzp_order = create_rzp_order(to_paise(order.total), receipt=f"{order.number}-retry")
    payment = Payment(order_id=order.id, razorpay_order_id=rzp_order["id"], amount=order.total)
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return {"payment": _payment_init(order, payment, user)}


def _restock_order_items(db: Session, items: list[OrderItem]) -> None:
    """Releases the checkout-time stock reservation (see services/inventory.py)
    for each given item and marks it "cancelled" - the same item.status bookkeeping
    every other restock site in this app uses, so a later refund/cancellation-
    approval on this same order (which only restocks items still "active") never
    double-credits one of these back."""
    product_ids = [i.product_id for i in items if i.product_id]
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_(product_ids)).all()} if product_ids else {}
    for item in items:
        product = products.get(item.product_id)
        if product and product.type == "product" and product.stock is not None:
            restock(db, product.id, item.qty)
        item.status = "cancelled"


@router.post("/{order_id}/cancel", response_model=OrderOut)
def cancel_order(order_id: str, body: CancellationRequestIn,
                 user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Before anything's been charged (created/payment_pending) this cancels
    immediately - nothing to refund or unwind yet. Once payment has gone
    through or production has started, it instead files a cancellation
    request for staff to approve or reject (they may already be mid-production
    or have a courier booked), visible on the admin Orders page.

    When body.order_item_id is set, only that line item is targeted - the rest
    of the order (and Order.status) is left untouched. See cancel_order_item()."""
    order = db.query(Order).options(*ORDER_LOAD).filter(Order.id == order_id, Order.user_id == user.id).first()
    if not order:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")

    if body.order_item_id:
        return _cancel_order_item(db, order, body, user)

    if order.status in IMMEDIATE_CANCEL_STATUSES:
        # checkout() reserves stock for every line up front now (see
        # services/inventory.py), so an order cancelled before it's even been
        # paid for still holds a real reservation that must be released here -
        # unlike before, when stock wasn't touched until payment confirmation
        # and there was nothing to give back at this point.
        _restock_order_items(db, [i for i in order.items if i.status == "active"])
        order.status = "cancelled"
        db.add(OrderTrackingEvent(order_id=order.id, status="cancelled", title="Order cancelled",
                                   description=f"Cancelled by customer. Reason: {body.reason}"))
        order_event(db, order, "cancelled")
        db.commit()
        db.refresh(order)
        return annotate_order(db, order)

    if order.status not in REQUESTABLE_CANCEL_STATUSES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This order can no longer be cancelled")
    if any(r.status == "pending" and r.order_item_id is None for r in order.cancellation_requests):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A cancellation request is already pending for this order")

    db.add(OrderCancellationRequest(order_id=order.id, user_id=user.id, reason=body.reason, note=body.note))
    db.commit()
    db.refresh(order)
    return annotate_order(db, order)


def _cancel_order_item(db: Session, order: Order, body: CancellationRequestIn, user: User) -> OrderOut:
    item = next((i for i in order.items if i.id == body.order_item_id), None)
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order item not found")
    if item.status != "active":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This item has already been cancelled or has a pending cancellation")
    active_items = [i for i in order.items if i.status == "active"]
    if len(active_items) <= 1:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This is the last item in your order - please cancel the entire order instead",
        )
    if order.status not in (IMMEDIATE_CANCEL_STATUSES + REQUESTABLE_CANCEL_STATUSES):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This order can no longer be cancelled")
    # Only a pending whole-order request blocks this item - another item's own
    # pending request is irrelevant to it (item.status != "active", checked
    # above, already stops a duplicate request against this same item).
    if any(r.status == "pending" and r.order_item_id is None for r in order.cancellation_requests):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A cancellation request is already pending for this order")

    title = (item.product_snapshot or {}).get("title") or "Item"

    if order.status in IMMEDIATE_CANCEL_STATUSES:
        # See the matching comment in cancel_order() - this item's stock was
        # reserved at checkout and must be released now that it won't be paid for.
        _restock_order_items(db, [item])
        deduct_order_item(order, item)
        db.add(OrderTrackingEvent(order_id=order.id, status=order.status, title=f"Item cancelled: {title}",
                                   description=f"Cancelled by customer. Reason: {body.reason}"))
        db.commit()
        db.refresh(order)
        return annotate_order(db, order)

    item.status = "cancel_requested"
    db.add(OrderCancellationRequest(
        order_id=order.id, user_id=user.id, order_item_id=item.id,
        reason=body.reason, note=body.note,
    ))
    db.commit()
    db.refresh(order)
    return annotate_order(db, order)


@router.post("/{order_id}/address-change", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def request_address_change(order_id: str, body: AddressChangeRequestIn,
                           user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    order = db.query(Order).options(*ORDER_LOAD).filter(Order.id == order_id, Order.user_id == user.id).first()
    if not order:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")

    deadline = address_change_deadline(db, order)
    if not deadline or datetime.now(timezone.utc) > deadline:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Address changes are no longer allowed for this order")
    if any(r.status == "pending" for r in order.address_change_requests):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "An address change request is already pending for this order")

    requested = body.model_dump(exclude={"note"})
    db.add(OrderAddressChangeRequest(order_id=order.id, user_id=user.id, requested_address=requested, note=body.note))
    db.commit()
    db.refresh(order)
    return annotate_order(db, order)
