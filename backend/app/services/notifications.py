import logging

from sqlalchemy.orm import Session

from ..models import Notification

logger = logging.getLogger("notifications")

_ORDER_EVENTS = {
    "paid": ("Payment received", "We've received your payment and your order is being processed."),
    "cod_confirmed": ("Order confirmed", "Your Cash on Delivery order is confirmed and being processed."),
    "in_production": ("Order in production", "Your order is now being prepared."),
    "shipped": ("Order shipped", "Your order is on its way."),
    "delivered": ("Order delivered", "Your order has been delivered. Thank you for shopping with us!"),
    "cancelled": ("Order cancelled", "Your order has been cancelled."),
    "refunded": ("Refund processed", "Your refund has been initiated and will reflect in a few business days."),
}


def notify(db: Session, user_id: str | None, title: str, body: str = "", channel: str = "app"):
    db.add(Notification(user_id=user_id, channel=channel, title=title, body=body))
    logger.info("notify user=%s title=%s", user_id, title)


def order_event(db: Session, order, event: str):
    title, body = _ORDER_EVENTS.get(event, ("Order update", f"Your order status changed to {event}."))
    body = f"{body} (Order {order.number})"
    notify(db, order.user_id, title, body)


def booking_event(db: Session, booking, event: str):
    titles = {
        "confirmed": "Booking confirmed",
        "advance_pending": "Booking received",
        "completed": "Booking completed",
        "cancelled": "Booking cancelled",
    }
    title = titles.get(event, "Booking update")
    notify(db, booking.user_id, title, f"{booking.customer_name} — {event}")
