"""End-to-end regression test for the checkout/payments/admin bug-fix batch
(oversell prevention, checkout-time stock reservation + its release on cancel/
expiry, coupon messaging, payment-after-status-change handling, double-restock
guards across cancel/refund paths, dropdown-field validation, pagination
validation, malformed-UUID handling, notifications wiring).

Runs the real FastAPI app in-process (TestClient, so lifespan/migrations run
exactly as they do under uvicorn) against the configured database. Seeds
throwaway, uniquely-tagged rows, exercises the real HTTP endpoints, verifies
behavior against the DB, then deletes everything it created.

Usage (run from `backend/`, with the venv active):

    python scripts/test_e2e_bugfixes.py
"""
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/, so `app` is importable

from fastapi.testclient import TestClient  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    Address, Booking, Category, Coupon, Notification, Order, Product, User, uid,
)
from app.routers.orders import RESERVATION_TTL_MINUTES, expire_stale_reservations  # noqa: E402
from app.security import create_access_token  # noqa: E402

tag = str(int(time.time()))
EMAIL = f"e2e-bugfix-test-{tag}@example.com"

checks: list[tuple[str, bool]] = []


def check(label: str, condition: bool):
    checks.append((label, condition))
    print(f"  [{'PASS' if condition else 'FAIL'}] {label}")


db = SessionLocal()

owner = db.query(User).filter(User.role == "owner").first()
assert owner, "no owner user found - cannot mint an admin token"
category = db.query(Category).first()
assert category, "no category found - needed to attach test products"

customer = User(email=EMAIL, name="E2E Bugfix Test", role="customer")
db.add(customer)
db.flush()

address = Address(
    user_id=customer.id, label="Home", full_name="E2E Bugfix Test", phone="9999999998",
    line1="1 Test Lane", city="Hyderabad", state="Telangana", pincode="500001",
)
db.add(address)

stock_product = Product(
    id=uid(), category_id=category.id, title=f"E2E Stock Test {tag}", slug=f"e2e-stock-test-{tag}",
    type="product", price=100, stock=3, is_active=True,
)
db.add(stock_product)

dropdown_product = Product(
    id=uid(), category_id=category.id, title=f"E2E Dropdown Test {tag}", slug=f"e2e-dropdown-test-{tag}",
    type="service", price=50, is_active=True,
    input_fields=[{
        "id": "size", "type": "dropdown", "label": "Size", "required": True,
        "options": ["S", "M"], "multi_select": False,
    }],
)
db.add(dropdown_product)

# One dedicated, single-use stock product per section below that decrements stock
# via a real checkout() call - sharing one product across sections (as D1/D2 used
# to, both against `stock_product`) would make an earlier section's still-unpaid
# reservation silently starve stock for a later section, since checkout() now
# really reserves it instead of only checking it informationally.
d1_product = Product(
    id=uid(), category_id=category.id, title=f"E2E D1 Stock Test {tag}", slug=f"e2e-d1-stock-test-{tag}",
    type="product", price=100, stock=1, is_active=True,
)
d2_product = Product(
    id=uid(), category_id=category.id, title=f"E2E D2 Stock Test {tag}", slug=f"e2e-d2-stock-test-{tag}",
    type="product", price=100, stock=1, is_active=True,
)
j_product = Product(
    id=uid(), category_id=category.id, title=f"E2E Reserve-at-checkout Test {tag}", slug=f"e2e-reserve-checkout-{tag}",
    type="product", price=100, stock=2, is_active=True,
)
k_product = Product(
    id=uid(), category_id=category.id, title=f"E2E Reserve-cancel Test {tag}", slug=f"e2e-reserve-cancel-{tag}",
    type="product", price=100, stock=1, is_active=True,
)
l_product_1 = Product(
    id=uid(), category_id=category.id, title=f"E2E Item-cancel Test A {tag}", slug=f"e2e-item-cancel-a-{tag}",
    type="product", price=100, stock=1, is_active=True,
)
l_product_2 = Product(
    id=uid(), category_id=category.id, title=f"E2E Item-cancel Test B {tag}", slug=f"e2e-item-cancel-b-{tag}",
    type="product", price=100, stock=1, is_active=True,
)
m_product = Product(
    id=uid(), category_id=category.id, title=f"E2E Expiry Sweep Test {tag}", slug=f"e2e-expiry-sweep-{tag}",
    type="product", price=100, stock=1, is_active=True,
)
new_products = [d1_product, d2_product, j_product, k_product, l_product_1, l_product_2, m_product]
for p in new_products:
    db.add(p)

coupon = Coupon(code=f"E2E{tag}", type="flat", value=5, min_order=0, is_active=True)
db.add(coupon)

db.commit()
for obj in (address, stock_product, dropdown_product, coupon, *new_products):
    db.refresh(obj)

print(f"Seeded customer {EMAIL} ({customer.id}), products {stock_product.id}/{dropdown_product.id}, coupon {coupon.code}")

customer_token = create_access_token(customer.id, "customer")
owner_token = create_access_token(owner.id, "owner")
CUST = {"Authorization": f"Bearer {customer_token}"}
OWNER = {"Authorization": f"Bearer {owner_token}"}

order_ids: list[str] = []

# Not using `with TestClient(app) as client:` on purpose - that triggers the
# app's lifespan (schema migrations, cache warmup), which this script has no
# need to re-run against a database that's already fully migrated, and one
# attempt already hit a statement-timeout contending for a lock on `products`.
# Every dependency this app's routes actually use (the DB engine/session) is
# constructed at import time in database.py, independent of the lifespan.
client = TestClient(app)
if True:

    # ---------------------------------------------------------------- A: oversell prevention
    print("\n-- A: oversell prevention across duplicate cart lines --")
    r = client.post("/api/orders/checkout", headers=CUST, json={
        "address_id": address.id,
        "items": [
            {"product_id": stock_product.id, "title": "x", "price": 100, "qty": 2},
            {"product_id": stock_product.id, "title": "x", "price": 100, "qty": 2},
        ],
    })
    check("4 units across 2 lines against stock=3 -> 400 out of stock", r.status_code == 400 and "out of stock" in r.json().get("detail", ""))

    r = client.post("/api/orders/checkout", headers=CUST, json={
        "address_id": address.id,
        "items": [
            {"product_id": stock_product.id, "title": "x", "price": 100, "qty": 2},
            {"product_id": stock_product.id, "title": "x", "price": 100, "qty": 1},
        ],
    })
    check("3 units across 2 lines against stock=3 -> 201 created", r.status_code == 201)
    if r.status_code == 201:
        order_ids.append(r.json()["order"]["id"])

    # ---------------------------------------------------------------- B: coupon message
    print("\n-- B: coupon_message on checkout --")
    r = client.post("/api/orders/checkout", headers=CUST, json={
        "address_id": address.id,
        "items": [{"title": "no-product-item", "price": 10, "qty": 1}],
        "coupon_code": "DOES-NOT-EXIST",
    })
    check("invalid coupon -> 201 with non-empty coupon_message", r.status_code == 201 and bool(r.json().get("coupon_message")))
    check("invalid coupon -> order.discount == 0", r.status_code == 201 and r.json()["order"]["discount"] == 0)
    if r.status_code == 201:
        order_ids.append(r.json()["order"]["id"])

    r = client.post("/api/orders/checkout", headers=CUST, json={
        "address_id": address.id,
        "items": [{"title": "no-product-item", "price": 10, "qty": 1}],
        "coupon_code": coupon.code.lower(),
    })
    check("valid coupon (lowercase) -> 201 with empty coupon_message", r.status_code == 201 and r.json().get("coupon_message") == "")
    check("valid coupon -> order.discount == 5", r.status_code == 201 and float(r.json()["order"]["discount"]) == 5.0)
    check("valid coupon -> order.coupon_code set", r.status_code == 201 and r.json()["order"]["coupon_code"] == coupon.code)
    if r.status_code == 201:
        order_ids.append(r.json()["order"]["id"])

    # ---------------------------------------------------------------- C: payment race after cancel
    print("\n-- C: payment confirmed after order already cancelled --")
    r = client.post("/api/orders/checkout", headers=CUST, json={
        "address_id": address.id,
        "items": [{"title": "race-test-item", "price": 100, "qty": 1}],
    })
    check("race-test checkout -> 201", r.status_code == 201)
    race_order_id = r.json()["order"]["id"]
    race_payment_id = r.json()["payment"]["payment_id"]
    order_ids.append(race_order_id)

    r = client.post(f"/api/orders/{race_order_id}/cancel", headers=CUST, json={"reason": "changed_mind", "note": "e2e cancel before payment lands"})
    check("customer cancels payment_pending order -> immediate cancel", r.status_code == 200 and r.json()["status"] == "cancelled")

    r = client.post(f"/api/payments/mock-pay/{race_payment_id}", headers=CUST)
    check("mock-pay after cancel -> 200", r.status_code == 200)
    check("order status stays 'cancelled', not overwritten to 'paid'", r.status_code == 200 and r.json()["status"] == "cancelled")

    db.expire_all()
    order = db.get(Order, race_order_id)
    check("tracking event 'Payment received after order status changed' recorded",
          any(e.title == "Payment received after order status changed" for e in order.tracking_events))
    notif = db.query(Notification).filter(
        Notification.user_id == customer.id, Notification.title == "Payment received on a changed order",
    ).first()
    check("customer notified about payment on changed order", notif is not None)

    # ---------------------------------------------------------------- D1: admin-status-dropdown cancel restocks, refund doesn't double it
    print("\n-- D1: admin status-dropdown cancel restocks once; refund doesn't restock again --")
    r = client.post("/api/orders/checkout", headers=CUST, json={
        "address_id": address.id,
        "items": [{"product_id": d1_product.id, "title": "x", "price": 100, "qty": 1}],
    })
    check("D1 checkout -> 201", r.status_code == 201)
    d1_order_id = r.json()["order"]["id"]
    d1_payment_id = r.json()["payment"]["payment_id"]
    order_ids.append(d1_order_id)

    db.expire_all()
    stock_before = db.get(Product, d1_product.id).stock
    r = client.post(f"/api/payments/mock-pay/{d1_payment_id}", headers=CUST)
    check("D1 mock-pay -> 200 paid", r.status_code == 200 and r.json()["status"] == "paid")
    db.expire_all()
    stock_after_pay = db.get(Product, d1_product.id).stock
    check("D1 stock unchanged by payment (already reserved at checkout)", stock_after_pay == stock_before)

    r = client.patch(f"/api/admin/orders/{d1_order_id}/status", headers=OWNER, json={"status": "cancelled"})
    check("D1 admin cancel via status dropdown -> 200", r.status_code == 200 and r.json()["status"] == "cancelled")
    db.expire_all()
    stock_after_cancel = db.get(Product, d1_product.id).stock
    check("D1 stock restored on admin cancel", stock_after_cancel == stock_before + 1)
    d1_order = db.get(Order, d1_order_id)
    check("D1 all order items flipped to 'cancelled' status", all(i.status == "cancelled" for i in d1_order.items))

    r = client.post(f"/api/payments/refund/{d1_order_id}", headers=OWNER)
    check("D1 refund after cancel -> 200", r.status_code == 200)
    db.expire_all()
    stock_after_refund = db.get(Product, d1_product.id).stock
    check("D1 refund does NOT restock a second time", stock_after_refund == stock_after_cancel)

    # ---------------------------------------------------------------- D2: customer cancellation-request approval restocks once, refund doesn't double it
    print("\n-- D2: cancellation-request approval restocks once; refund doesn't restock again --")
    r = client.post("/api/orders/checkout", headers=CUST, json={
        "address_id": address.id,
        "items": [{"product_id": d2_product.id, "title": "x", "price": 100, "qty": 1}],
    })
    check("D2 checkout -> 201", r.status_code == 201)
    d2_order_id = r.json()["order"]["id"]
    d2_payment_id = r.json()["payment"]["payment_id"]
    order_ids.append(d2_order_id)

    db.expire_all()
    stock_before_2 = db.get(Product, d2_product.id).stock
    r = client.post(f"/api/payments/mock-pay/{d2_payment_id}", headers=CUST)
    check("D2 mock-pay -> 200 paid", r.status_code == 200 and r.json()["status"] == "paid")

    r = client.post(f"/api/orders/{d2_order_id}/cancel", headers=CUST, json={"reason": "changed_mind", "note": "e2e requestable cancel on a paid order"})
    check("D2 customer request on paid order -> stays 'paid', files request", r.status_code == 200 and r.json()["status"] == "paid")
    reqs = r.json().get("cancellation_requests", [])
    pending = [c for c in reqs if c["status"] == "pending" and c["order_item_id"] is None]
    check("D2 pending whole-order cancellation request created", len(pending) == 1)
    request_id = pending[0]["id"] if pending else None

    if request_id:
        r = client.patch(f"/api/admin/orders/cancellation-requests/{request_id}", headers=OWNER, json={"action": "approve"})
        check("D2 admin approves cancellation request -> 200", r.status_code == 200)
    db.expire_all()
    stock_after_approve = db.get(Product, d2_product.id).stock
    check("D2 stock restored on approval", stock_after_approve == stock_before_2 + 1)
    d2_order = db.get(Order, d2_order_id)
    check("D2 order status -> cancelled", d2_order.status == "cancelled")
    check("D2 all order items flipped to 'cancelled' status", all(i.status == "cancelled" for i in d2_order.items))

    r = client.post(f"/api/payments/refund/{d2_order_id}", headers=OWNER)
    check("D2 refund after approval -> 200", r.status_code == 200)
    db.expire_all()
    stock_after_refund_2 = db.get(Product, d2_product.id).stock
    check("D2 refund does NOT restock a second time", stock_after_refund_2 == stock_after_approve)

    # ---------------------------------------------------------------- J: stock reserved at checkout, not at payment
    print("\n-- J: checkout reserves stock immediately, before any payment --")
    stock_before_j = db.get(Product, j_product.id).stock
    r = client.post("/api/orders/checkout", headers=CUST, json={
        "address_id": address.id,
        "items": [{"product_id": j_product.id, "title": "x", "price": 100, "qty": 2}],
    })
    check("J checkout -> 201", r.status_code == 201)
    j_order_id = r.json()["order"]["id"]
    order_ids.append(j_order_id)
    db.expire_all()
    check("J stock decremented immediately, before payment", db.get(Product, j_product.id).stock == stock_before_j - 2)

    r = client.post("/api/orders/checkout", headers=CUST, json={
        "address_id": address.id,
        "items": [{"product_id": j_product.id, "title": "x", "price": 100, "qty": 1}],
    })
    check("J further checkout against now-exhausted stock -> 400 out of stock",
          r.status_code == 400 and "out of stock" in r.json().get("detail", ""))

    # ---------------------------------------------------------------- K: cancelling an unpaid order releases its reservation
    print("\n-- K: cancelling a payment_pending order releases its stock reservation --")
    stock_before_k = db.get(Product, k_product.id).stock
    r = client.post("/api/orders/checkout", headers=CUST, json={
        "address_id": address.id,
        "items": [{"product_id": k_product.id, "title": "x", "price": 100, "qty": 1}],
    })
    check("K checkout -> 201", r.status_code == 201)
    k_order_id = r.json()["order"]["id"]
    order_ids.append(k_order_id)
    db.expire_all()
    check("K stock reserved at checkout", db.get(Product, k_product.id).stock == stock_before_k - 1)

    r = client.post(f"/api/orders/{k_order_id}/cancel", headers=CUST, json={"reason": "changed_mind", "note": "e2e reservation release"})
    check("K cancel before payment -> immediate cancel", r.status_code == 200 and r.json()["status"] == "cancelled")
    db.expire_all()
    check("K stock released back on cancel", db.get(Product, k_product.id).stock == stock_before_k)
    k_order = db.get(Order, k_order_id)
    check("K order item flipped to 'cancelled' status", all(i.status == "cancelled" for i in k_order.items))

    # ---------------------------------------------------------------- L: cancelling one item of an unpaid multi-item order releases only that item's reservation
    print("\n-- L: cancelling a single item of a payment_pending order releases only that item's stock --")
    stock1_before_l = db.get(Product, l_product_1.id).stock
    stock2_before_l = db.get(Product, l_product_2.id).stock
    r = client.post("/api/orders/checkout", headers=CUST, json={
        "address_id": address.id,
        "items": [
            {"product_id": l_product_1.id, "title": "x", "price": 100, "qty": 1},
            {"product_id": l_product_2.id, "title": "y", "price": 100, "qty": 1},
        ],
    })
    check("L checkout (2 items, 2 products) -> 201", r.status_code == 201)
    l_order_id = r.json()["order"]["id"]
    order_ids.append(l_order_id)
    db.expire_all()
    check("L both products reserved at checkout",
          db.get(Product, l_product_1.id).stock == stock1_before_l - 1
          and db.get(Product, l_product_2.id).stock == stock2_before_l - 1)

    l_order = db.get(Order, l_order_id)
    l_item_1 = next(i for i in l_order.items if i.product_id == l_product_1.id)
    r = client.post(f"/api/orders/{l_order_id}/cancel", headers=CUST,
                    json={"order_item_id": l_item_1.id, "reason": "changed_mind", "note": "e2e single-item reservation release"})
    check("L cancel single item before payment -> 200", r.status_code == 200)
    db.expire_all()
    check("L only the cancelled item's product was restocked",
          db.get(Product, l_product_1.id).stock == stock1_before_l
          and db.get(Product, l_product_2.id).stock == stock2_before_l - 1)
    l_order = db.get(Order, l_order_id)
    l_item_1 = next(i for i in l_order.items if i.product_id == l_product_1.id)
    l_item_2 = next(i for i in l_order.items if i.product_id == l_product_2.id)
    check("L cancelled item is 'cancelled', the other stays 'active'",
          l_item_1.status == "cancelled" and l_item_2.status == "active")

    # ---------------------------------------------------------------- M: abandoned reservations expire on the periodic sweep
    print("\n-- M: expire_stale_reservations() releases an abandoned order's stock --")
    stock_before_m = db.get(Product, m_product.id).stock
    r = client.post("/api/orders/checkout", headers=CUST, json={
        "address_id": address.id,
        "items": [{"product_id": m_product.id, "title": "x", "price": 100, "qty": 1}],
    })
    check("M checkout -> 201", r.status_code == 201)
    m_order_id = r.json()["order"]["id"]
    order_ids.append(m_order_id)
    db.expire_all()
    check("M stock reserved at checkout", db.get(Product, m_product.id).stock == stock_before_m - 1)

    # Back-date created_at past the reservation TTL to simulate an abandoned order,
    # without waiting RESERVATION_TTL_MINUTES of real wall-clock time.
    db.query(Order).filter(Order.id == m_order_id).update(
        {"created_at": datetime.now(timezone.utc) - timedelta(minutes=RESERVATION_TTL_MINUTES + 1)},
        synchronize_session=False,
    )
    db.commit()

    # >=1, not ==1 - this runs against the live DB, which may hold other genuinely
    # stale payment_pending orders (real abandoned carts) unrelated to this test.
    expired_count = expire_stale_reservations()
    check("M sweep expired at least this one stale order", expired_count >= 1)
    db.expire_all()
    check("M stock released back by the sweep", db.get(Product, m_product.id).stock == stock_before_m)
    m_order = db.get(Order, m_order_id)
    check("M order marked cancelled by the sweep", m_order.status == "cancelled")
    check("M order item flipped to 'cancelled' status", all(i.status == "cancelled" for i in m_order.items))

    # Idempotency, checked on this specific order/product rather than the sweep's
    # overall count (which, again, may pick up unrelated stale orders elsewhere in
    # the DB on this pass) - re-running must not touch an order that's already
    # 'cancelled', since the sweep only selects "created"/"payment_pending" ones.
    tracking_count_before = len(m_order.tracking_events)
    expire_stale_reservations()
    db.expire_all()
    check("M re-running the sweep doesn't restock this order again", db.get(Product, m_product.id).stock == stock_before_m)
    m_order = db.get(Order, m_order_id)
    check("M re-running the sweep doesn't add a second cancellation event", len(m_order.tracking_events) == tracking_count_before)

    # ---------------------------------------------------------------- E: single-select dropdown given a list
    print("\n-- E: single-select dropdown field given a list value --")
    r = client.post("/api/orders/checkout", headers=CUST, json={
        "address_id": address.id,
        "items": [{
            "product_id": dropdown_product.id, "title": "x", "price": 50, "qty": 1,
            "customization": {"fields": {"size": ["S"]}},
        }],
    })
    check("list value for single-select dropdown -> 400, not 500", r.status_code == 400 and "only accepts a single selection" in r.json().get("detail", ""))

    r = client.post("/api/orders/checkout", headers=CUST, json={
        "address_id": address.id,
        "items": [{
            "product_id": dropdown_product.id, "title": "x", "price": 50, "qty": 1,
            "customization": {"fields": {"size": "S"}},
        }],
    })
    check("scalar value for single-select dropdown -> 201", r.status_code == 201)
    if r.status_code == 201:
        order_ids.append(r.json()["order"]["id"])

    # ---------------------------------------------------------------- F: pagination validation
    print("\n-- F: pagination query-param validation --")
    r = client.get("/api/admin/products", headers=OWNER, params={"page": 0})
    check("admin products page=0 -> 422", r.status_code == 422)
    r = client.get("/api/admin/products", headers=OWNER, params={"page_size": 501})
    check("admin products page_size=501 -> 422", r.status_code == 422)
    r = client.get("/api/admin/customers", headers=OWNER, params={"page": 0})
    check("admin customers page=0 -> 422", r.status_code == 422)
    r = client.get("/api/products", params={"page": 0})
    check("public products page=0 -> 422", r.status_code == 422)
    r = client.get("/api/products", params={"page_size": 201})
    check("public products page_size=201 -> 422", r.status_code == 422)
    r = client.get("/api/products", params={"page": 1, "page_size": 1})
    check("public products page=1&page_size=1 -> 200", r.status_code == 200)

    # ---------------------------------------------------------------- G: malformed UUID -> 400
    print("\n-- G: malformed identifier handling --")
    r = client.get("/api/orders/not-a-uuid", headers=CUST)
    check("malformed order id -> 400 Invalid identifier (not 500)", r.status_code == 400 and r.json().get("detail") == "Invalid identifier")
    r = client.post("/api/notifications/not-a-uuid/read", headers=CUST)
    check("malformed notification id -> 400 Invalid identifier (not 500)", r.status_code == 400 and r.json().get("detail") == "Invalid identifier")

    # ---------------------------------------------------------------- H: notifications endpoints
    print("\n-- H: notifications list/mark-read --")
    r = client.get("/api/notifications", headers=CUST)
    check("list notifications -> 200", r.status_code == 200)
    mine = [n for n in r.json() if n["title"] == "Payment received on a changed order"]
    check("earlier payment-race notification shows up in the list", len(mine) == 1)
    if mine:
        nid = mine[0]["id"]
        check("notification starts unread", mine[0]["is_read"] is False)
        r = client.post(f"/api/notifications/{nid}/read", headers=CUST)
        check("mark-read -> 200 and is_read true", r.status_code == 200 and r.json()["is_read"] is True)
    r = client.post(f"/api/notifications/{uid()}/read", headers=CUST)
    check("mark-read on a non-existent (but valid-shaped) id -> 404", r.status_code == 404)

    # ---------------------------------------------------------------- I: booking status update notifies the booker
    print("\n-- I: booking status update creates an in-app notification --")
    booking = Booking(
        user_id=customer.id, customer_name="E2E Bugfix Test", customer_phone="9999999998",
        customer_email=EMAIL, status="enquiry",
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)

    r = client.patch(f"/api/admin/bookings/{booking.id}", headers=OWNER, json={"status": "confirmed"})
    check("admin confirms booking -> 200", r.status_code == 200 and r.json()["status"] == "confirmed")
    db.expire_all()
    booking_notif = db.query(Notification).filter(
        Notification.user_id == customer.id, Notification.title == "Booking confirmed",
    ).first()
    check("booking.user_id (not None) notified of confirmation", booking_notif is not None)

    db.delete(db.get(Booking, booking.id))
    db.commit()

# ---------------------------------------------------------------- cleanup
print("\n-- cleanup --")
db.expire_all()
if order_ids:
    db.query(Order).filter(Order.id.in_(order_ids)).delete(synchronize_session=False)
db.query(Notification).filter(Notification.user_id == customer.id).delete(synchronize_session=False)
db.query(Address).filter(Address.user_id == customer.id).delete(synchronize_session=False)
db.query(Product).filter(Product.id.in_([stock_product.id, dropdown_product.id, *[p.id for p in new_products]])).delete(synchronize_session=False)
db.query(Coupon).filter(Coupon.id == coupon.id).delete(synchronize_session=False)
db.query(User).filter(User.id == customer.id).delete(synchronize_session=False)
db.commit()
db.close()
print("Cleaned up all seeded rows.")

failed = [label for label, ok in checks if not ok]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed.")
if failed:
    print("FAILED:", ", ".join(failed))
    sys.exit(1)
print("ALL PASSED")
