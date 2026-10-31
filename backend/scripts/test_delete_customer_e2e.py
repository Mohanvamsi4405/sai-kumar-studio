"""One-off end-to-end test for DELETE /api/admin/customers/{user_id}.

Seeds a throwaway customer with one row in every table that references a
user, calls the real HTTP endpoint (running server, port 8000) with a token
minted for an existing owner, then re-queries the DB to confirm: CASCADE
tables (including bookings) are empty, RESTRICT-guarded orders (+ their own
children) are gone, audit_log keeps its row with user_id cleared (SET NULL,
kept for the audit trail), and the OTP row (linked by email only) is gone too.

Usage (run from `backend/`, with the venv active, server already running
on :8000):

    python scripts/test_delete_customer_e2e.py
"""
import sys
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/, so `app` is importable

import httpx  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    Address, AuditLog, Booking, CartItem, Notification, Order, OrderAddressChangeRequest,
    OrderCancellationRequest, OrderItem, OrderTrackingEvent, OtpCode, Payment, Product,
    RefreshToken, Review, User, WishlistItem,
)
from app.security import create_access_token  # noqa: E402

BASE_URL = "http://127.0.0.1:8000"
tag = str(int(time.time()))
EMAIL = f"e2e-delete-test-{tag}@example.com"

db = SessionLocal()

owner = db.query(User).filter(User.role == "owner").first()
assert owner, "no owner user found - cannot mint an admin token"
product = db.query(Product).first()
assert product, "no product found - needed for the review row"

# ---------------------------------------------------------------- seed
user = User(email=EMAIL, name="E2E Delete Test", role="customer")
db.add(user)
db.flush()
user_id = user.id

address = Address(
    user_id=user_id, label="Home", full_name="E2E Delete Test", phone="9999999999",
    line1="1 Test Lane", city="Hyderabad", state="Telangana", pincode="500001",
)
db.add(address)
db.flush()

db.add(CartItem(user_id=user_id, item_key="cart-1", name="Test Item", price="₹100", qty=1))
db.add(WishlistItem(user_id=user_id, item_key="wish-1", name="Test Item", price="₹100"))
db.add(Review(product_id=product.id, user_id=user_id, rating=5, comment="e2e test review"))
db.add(Notification(user_id=user_id, title="Test notification"))
db.add(RefreshToken(
    user_id=user_id, token_hash=f"hash-{tag}",
    expires_at=datetime.now(timezone.utc) + timedelta(days=1),
))
db.add(OtpCode(
    email=EMAIL, code_hash="deadbeef", purpose="login",
    expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
))
db.add(Booking(
    user_id=user_id, customer_name="E2E Delete Test", customer_phone="9999999999",
    customer_email=EMAIL, event_date=date.today(), status="enquiry",
))
db.add(AuditLog(user_id=user_id, action="test", entity="e2e", entity_id=str(uuid.uuid4())))

order = Order(
    number=f"E2E{tag}", user_id=user_id, status="paid",
    subtotal=100, discount=0, total=100, address_id=address.id,
)
db.add(order)
db.flush()
db.add(OrderItem(order_id=order.id, unit_price=100, qty=1, product_snapshot={"title": "Test"}))
db.add(Payment(order_id=order.id, razorpay_order_id=f"order_e2e_{tag}", status="captured", amount=100))
db.add(OrderTrackingEvent(order_id=order.id, status="paid", title="Order placed"))
db.add(OrderCancellationRequest(order_id=order.id, user_id=user_id, reason="other", note="e2e"))
db.add(OrderAddressChangeRequest(
    order_id=order.id, user_id=user_id,
    requested_address={"full_name": "x", "phone": "9999999999", "line1": "y", "city": "z", "state": "z", "pincode": "500001"},
))
db.commit()
order_id = order.id
address_id = address.id

print(f"Seeded customer {EMAIL} ({user_id}) with 1 row in every related table.")

# ---------------------------------------------------------------- act: call the real endpoint
token = create_access_token(owner.id, owner.role)
resp = httpx.delete(
    f"{BASE_URL}/api/admin/customers/{user_id}",
    headers={"Authorization": f"Bearer {token}"},
    timeout=10,
)
print(f"DELETE /api/admin/customers/{user_id} -> {resp.status_code}")

# ---------------------------------------------------------------- assert
db.expire_all()
checks = []

def check(label, condition):
    checks.append((label, condition))
    print(f"  [{'PASS' if condition else 'FAIL'}] {label}")

check("HTTP 204 No Content", resp.status_code == 204)
check("User row gone", db.get(User, user_id) is None)
check("Address gone", db.query(Address).filter(Address.user_id == user_id).count() == 0)
check("CartItem gone", db.query(CartItem).filter(CartItem.user_id == user_id).count() == 0)
check("WishlistItem gone", db.query(WishlistItem).filter(WishlistItem.user_id == user_id).count() == 0)
check("Review gone", db.query(Review).filter(Review.user_id == user_id).count() == 0)
check("Notification gone", db.query(Notification).filter(Notification.user_id == user_id).count() == 0)
check("RefreshToken gone", db.query(RefreshToken).filter(RefreshToken.user_id == user_id).count() == 0)
check("OtpCode gone (matched by email)", db.query(OtpCode).filter(OtpCode.email == EMAIL).count() == 0)
check("Order gone", db.get(Order, order_id) is None)
check("OrderItem gone (cascaded via order)", db.query(OrderItem).filter(OrderItem.order_id == order_id).count() == 0)
check("Payment gone (cascaded via order)", db.query(Payment).filter(Payment.order_id == order_id).count() == 0)
check("OrderTrackingEvent gone (cascaded via order)", db.query(OrderTrackingEvent).filter(OrderTrackingEvent.order_id == order_id).count() == 0)
check("OrderCancellationRequest gone", db.query(OrderCancellationRequest).filter(OrderCancellationRequest.order_id == order_id).count() == 0)
check("OrderAddressChangeRequest gone", db.query(OrderAddressChangeRequest).filter(OrderAddressChangeRequest.order_id == order_id).count() == 0)

check("Booking gone (CASCADE)", db.query(Booking).filter(Booking.customer_email == EMAIL).count() == 0)

audit_rows = db.query(AuditLog).filter(AuditLog.entity_id == str(user_id)).all()
delete_audit = [a for a in audit_rows if a.action == "delete" and a.entity == "customer"]
check("Audit log has a 'delete customer' entry", len(delete_audit) == 1)
check("That audit entry's actor is the owner (user_id preserved)", len(delete_audit) == 1 and delete_audit[0].user_id == owner.id)

test_audit_row = db.query(AuditLog).filter(AuditLog.action == "test", AuditLog.entity == "e2e").first()
check("Pre-existing audit_log row for the customer preserved, user_id cleared", test_audit_row is not None and test_audit_row.user_id is None)

# cleanup rows this script itself created outside the deletion's blast radius
if test_audit_row:
    db.delete(test_audit_row)
if delete_audit:
    db.delete(delete_audit[0])
db.commit()
db.close()

failed = [label for label, ok in checks if not ok]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed.")
if failed:
    print("FAILED:", ", ".join(failed))
    sys.exit(1)
print("ALL PASSED")
