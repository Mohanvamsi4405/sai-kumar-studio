from secrets import token_hex

from ..config import get_settings
from ..security import razorpay_signature

settings = get_settings()


def _client():
    import razorpay
    return razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))


def create_rzp_order(amount_paise: int, receipt: str, notes: dict | None = None) -> dict:
    if settings.razorpay_mock:
        return {
            "id": f"order_MOCK{token_hex(7)}",
            "amount": amount_paise,
            "currency": "INR",
            "receipt": receipt,
            "status": "created",
        }
    return _client().order.create({
        "amount": amount_paise, "currency": "INR", "receipt": receipt, "notes": notes or {},
    })


def mock_payment_signature(razorpay_order_id: str) -> dict:
    payment_id = f"pay_MOCK{token_hex(7)}"
    signature = razorpay_signature(razorpay_order_id, payment_id, settings.razorpay_key_secret)
    return {
        "razorpay_order_id": razorpay_order_id,
        "razorpay_payment_id": payment_id,
        "razorpay_signature": signature,
    }


def create_refund(payment_id: str, amount_paise: int | None = None) -> dict:
    if settings.razorpay_mock:
        return {"id": f"rfnd_MOCK{token_hex(7)}", "status": "processed"}
    return _client().payment.refund(payment_id, {"amount": amount_paise} if amount_paise else {})
