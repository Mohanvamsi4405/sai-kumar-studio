import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..deps import audit, get_current_user, require_owner
from ..models import Order, OrderTrackingEvent, Payment, PaymentDispute, Product, User, WebhookEvent
from ..schemas import PaymentVerifyIn
from ..security import verify_razorpay_signature, verify_webhook_signature
from ..services.inventory import restock
from ..services.notifications import notify, order_event
from ..services.pricing import to_paise
from ..services.razorpay_service import create_refund, mock_payment_signature

router = APIRouter(prefix="/api/payments", tags=["payments"])
settings = get_settings()


def _mark_paid(db: Session, payment: Payment, razorpay_payment_id: str, signature: str | None,
               method: str | None = None):
    if method and not payment.method:
        # The browser's /verify call usually wins the race and carries no method;
        # the webhook arriving after it still fills it in.
        payment.method = method[:20]
    if payment.status == "captured":
        return
    payment.status = "captured"
    payment.razorpay_payment_id = razorpay_payment_id
    payment.signature = signature
    payment.captured_at = datetime.now(timezone.utc)
    payment.error_code = None
    payment.error_description = None

    # Locks the row for this transaction - closes the narrow window where
    # orders.py's expire_stale_reservations() sweep could otherwise expire/restock
    # this exact order at the same instant its payment is being confirmed.
    order = db.get(Order, payment.order_id, with_for_update=True)
    if order.status in ("created", "payment_pending"):
        order.status = "paid"
        # Stock is no longer touched here - checkout() now reserves it atomically
        # (see services/inventory.py, orders.py's checkout()) at order-creation
        # time, not at payment-confirmation time. By the time a payment for this
        # order is being confirmed, its stock was already decremented; doing it
        # again here would double-decrement every paid order.
        db.add(OrderTrackingEvent(order_id=order.id, status="paid", title="Payment received"))
        order_event(db, order, "paid")
    else:
        # The order moved on (most likely cancelled by the customer) before this
        # payment confirmation arrived (a race between checkout and a delayed
        # Razorpay webhook/verify/mock-pay call). Real money has still been
        # captured above - silently dropping that here would leave an order
        # showing e.g. "cancelled" while the customer was actually charged, with
        # no stock adjusted and nobody ever told a manual refund is owed.
        db.add(OrderTrackingEvent(
            order_id=order.id, status=order.status,
            title="Payment received after order status changed",
            description=(
                f"Razorpay confirmed payment {razorpay_payment_id}, but the order had "
                f"already moved to '{order.status}' - needs manual review for a refund."
            ),
        ))
        notify(db, order.user_id, "Payment received on a changed order",
               f"We received your payment for order {order.number}, but its status had "
               f"already changed to '{order.status}'. Our team will review this and "
               "contact you if a refund is needed.")


@router.post("/verify")
def verify_payment(body: PaymentVerifyIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    payment = db.query(Payment).filter(Payment.razorpay_order_id == body.razorpay_order_id).first()
    if not payment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    order = db.get(Order, payment.order_id)
    if not order or order.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")

    if not verify_razorpay_signature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature, settings.razorpay_key_secret):
        payment.status = "failed"
        payment.error_code = "SIGNATURE_MISMATCH"
        payment.error_description = "Checkout returned a payment signature that did not verify"
        db.commit()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Payment signature verification failed")

    _mark_paid(db, payment, body.razorpay_payment_id, body.razorpay_signature)
    db.commit()
    return {"message": "Payment verified", "order_id": order.id, "order_number": order.number, "status": order.status}


DISPUTE_STATUSES = ("open", "under_review", "won", "lost", "closed")


def _from_paise(value) -> float:
    return round((value or 0) / 100, 2)


def _from_unix(value) -> datetime | None:
    return datetime.fromtimestamp(value, timezone.utc) if value else None


def _entity(payload: dict, name: str) -> dict:
    return (payload.get("payload", {}).get(name) or {}).get("entity") or {}


def _find_payment(db: Session, payment_entity: dict, refund_entity: dict, dispute_entity: dict) -> Payment | None:
    razorpay_order_id = payment_entity.get("order_id")
    if razorpay_order_id:
        payment = db.query(Payment).filter(Payment.razorpay_order_id == razorpay_order_id).first()
        if payment:
            return payment
    # Refund and dispute events always name the Razorpay payment, but their
    # payload is not guaranteed to carry the full payment entity with order_id.
    razorpay_payment_id = (
        payment_entity.get("id") or refund_entity.get("payment_id") or dispute_entity.get("payment_id")
    )
    if razorpay_payment_id:
        return db.query(Payment).filter(Payment.razorpay_payment_id == razorpay_payment_id).first()
    return None


def _order_note(db: Session, payment: Payment, title: str, description: str) -> None:
    order = db.get(Order, payment.order_id)
    if order:
        db.add(OrderTrackingEvent(order_id=order.id, status=order.status, title=title, description=description))


def _apply_refund_event(db: Session, payment: Payment, event: str, refund: dict) -> None:
    if refund.get("id"):
        payment.refund_id = refund["id"]
    if refund.get("amount"):
        payment.refund_amount = _from_paise(refund["amount"])

    if event == "refund.processed":
        payment.status = "refunded"
        payment.refund_status = "processed"
        payment.refunded_at = datetime.now(timezone.utc)
        payment.refund_error = None
    elif event == "refund.failed":
        # The order was already marked refunded when staff clicked Refund, but no
        # money went back. Put the payment back to "captured" so the Refund button
        # reappears for a retry, and leave a visible note on the order - otherwise
        # the customer is never refunded and nobody finds out.
        payment.status = "captured"
        payment.refund_status = "failed"
        payment.refund_error = (
            refund.get("error_description") or (refund.get("status_details") or {}).get("description")
            or "Razorpay reported the refund as failed"
        )
        _order_note(db, payment, "Refund failed",
                    f"Razorpay could not process refund {payment.refund_id or ''}. "
                    "The refund needs to be retried from the admin dashboard.")
        order = db.get(Order, payment.order_id)
        if order:
            notify(db, order.user_id, "Refund delayed",
                   f"We could not complete the refund for order {order.number} yet. "
                   "Our team will retry it and keep you updated.")
    elif event == "refund.created" and not payment.refund_status:
        payment.refund_status = "pending"


def _apply_dispute_event(db: Session, payment: Payment, event: str, dispute: dict) -> None:
    dispute_id = dispute.get("id")
    if not dispute_id:
        return
    row = db.query(PaymentDispute).filter(PaymentDispute.razorpay_dispute_id == dispute_id).first()
    is_new = row is None
    if is_new:
        row = PaymentDispute(payment_id=payment.id, razorpay_dispute_id=dispute_id, amount=0)
        db.add(row)

    # Later events can be partial; a field Razorpay leaves out keeps its value.
    if dispute.get("amount") is not None:
        row.amount = _from_paise(dispute["amount"])
    if dispute.get("amount_deducted") is not None:
        row.amount_deducted = _from_paise(dispute["amount_deducted"])
    row.reason_code = (dispute.get("reason_code") or row.reason_code or "")[:80] or None
    row.reason_description = dispute.get("reason_description") or row.reason_description
    row.phase = (dispute.get("phase") or row.phase or "")[:30] or None
    row.respond_by = _from_unix(dispute.get("respond_by")) or row.respond_by
    # Razorpay adds statuses over time; an unknown one must not break the
    # webhook (or the CHECK constraint), so the last known status is kept.
    new_status = dispute.get("status")
    if new_status in DISPUTE_STATUSES:
        row.status = new_status
    elif event.endswith(".won"):
        row.status = "won"
    elif event.endswith(".lost"):
        row.status = "lost"
    elif event.endswith(".closed"):
        row.status = "closed"

    if is_new:
        respond = f" Respond by {row.respond_by:%d %b %Y}." if row.respond_by else ""
        _order_note(db, payment, "Payment disputed",
                    f"The customer's bank raised a {row.phase or 'dispute'} for Rs {row.amount:.2f}"
                    f" ({row.reason_code or 'no reason given'}).{respond}")
    elif event.endswith((".won", ".lost")):
        _order_note(db, payment, f"Dispute {row.status}",
                    f"Dispute {dispute_id} {row.status}; Rs {row.amount_deducted:.2f} deducted.")


def _process_webhook(db: Session, body: bytes, event_id: str) -> None:
    payload = json.loads(body)
    if event_id:
        db.add(WebhookEvent(event_id=event_id, event_type=payload.get("event", ""), payload=payload))

    event = payload.get("event") or ""
    payment_entity = _entity(payload, "payment")
    refund_entity = _entity(payload, "refund")
    dispute_entity = _entity(payload, "dispute")
    payment = _find_payment(db, payment_entity, refund_entity, dispute_entity)

    if payment:
        if event in ("payment.captured", "order.paid"):
            _mark_paid(db, payment, payment_entity.get("id", payment.razorpay_payment_id), None,
                       payment_entity.get("method"))
        elif event == "payment.failed" and payment.status != "captured":
            payment.status = "failed"
            if payment_entity.get("method"):
                payment.method = payment_entity["method"][:20]
            payment.error_code = (payment_entity.get("error_code") or "")[:80] or None
            payment.error_description = payment_entity.get("error_description")
        elif event.startswith("refund."):
            _apply_refund_event(db, payment, event, refund_entity)
        elif event.startswith("payment.dispute."):
            _apply_dispute_event(db, payment, event, dispute_entity)

    db.commit()


@router.post("/webhook")
async def razorpay_webhook(request: Request, db: Session = Depends(get_db)):
    # Reading the body is genuinely async I/O; everything after it is synchronous
    # DB work (network round trips to the remote Postgres) and must not run
    # directly on the event loop, or it blocks every other concurrent request
    # for its duration - so it's pushed to a worker thread via run_in_threadpool.
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    event_id = request.headers.get("X-Razorpay-Event-Id", "")

    if not verify_webhook_signature(body, signature, settings.razorpay_webhook_secret):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid webhook signature")

    if event_id and db.query(WebhookEvent).filter(WebhookEvent.event_id == event_id).first():
        return {"message": "ok"}

    await run_in_threadpool(_process_webhook, db, body, event_id)
    return {"message": "ok"}


@router.post("/mock-pay/{payment_id}")
def mock_pay(payment_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not settings.razorpay_mock:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not available")
    payment = db.get(Payment, payment_id)
    if not payment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")
    order = db.get(Order, payment.order_id)
    if not order or order.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Payment not found")

    mock = mock_payment_signature(payment.razorpay_order_id)
    _mark_paid(db, payment, mock["razorpay_payment_id"], mock["razorpay_signature"])
    db.commit()
    return {"message": "Payment verified", "order_id": order.id, "order_number": order.number, "status": order.status}


@router.post("/refund/{order_id}")
def refund_order(order_id: str, request: Request, admin: User = Depends(require_owner), db: Session = Depends(get_db)):
    order = db.get(Order, order_id)
    if not order:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
    payment = (
        db.query(Payment)
        .filter(Payment.order_id == order.id, Payment.status == "captured")
        .order_by(Payment.created_at.desc())
        .first()
    )
    if not payment:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No captured payment to refund")

    refund = create_refund(payment.razorpay_payment_id, to_paise(payment.amount))
    payment.status = "refunded"
    payment.refund_id = refund.get("id")
    payment.refund_amount = payment.amount
    payment.refund_error = None
    # Razorpay usually answers "processed" straight away for normal-speed
    # refunds, but may say "pending"; the refund.processed / refund.failed
    # webhook settles it either way.
    if refund.get("status") == "processed":
        payment.refund_status = "processed"
        payment.refunded_at = datetime.now(timezone.utc)
    else:
        payment.refund_status = "pending"

    if order.status in ("paid", "in_production", "cancelled"):
        # Only restock items still "active" - an order.status == "cancelled" here
        # means one or more items may have already been individually restocked
        # by an earlier per-item or whole-order cancellation; crediting them
        # again would inflate stock above the true on-hand count.
        active_items = [item for item in order.items if item.status == "active"]
        product_ids = [item.product_id for item in active_items if item.product_id]
        products = {p.id: p for p in db.query(Product).filter(Product.id.in_(product_ids)).all()} if product_ids else {}
        for item in active_items:
            product = products.get(item.product_id)
            if product and product.type == "product" and product.stock is not None:
                restock(db, product.id, item.qty)
            item.status = "cancelled"
    order.status = "refunded"

    db.add(OrderTrackingEvent(order_id=order.id, status="refunded", title="Order refunded"))
    order_event(db, order, "refunded")
    audit(db, admin, "refund", "order", order.id, {"refund_id": refund.get("id")}, request)
    db.commit()
    return {"message": "Refund initiated", "refund_id": refund.get("id")}
