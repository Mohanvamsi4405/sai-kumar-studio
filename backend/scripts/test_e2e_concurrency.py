"""Concurrency probe for checkout()'s stock reservation (routers/orders.py).

This used to test _mark_paid()'s stock decrement (routers/payments.py), back
when stock was only decremented at payment-confirmation time and checkout()
merely checked it informationally - two orders for the same last unit could
both be placed, then both paid concurrently, both winning the same
read-modify-write race.

Both halves of that are now fixed:
  1. checkout() reserves stock atomically, up front, via
     services/inventory.py's try_decrement_stock() (a single conditional
     `UPDATE ... WHERE stock >= qty`) - so two customers can no longer even
     both *place* an order for the same last unit, let alone both pay for it.
  2. Payment confirmation no longer touches stock at all (it was already
     reserved at checkout), so there is nothing left for a payment-time race
     to corrupt.

This script proves (1): it seeds a stock=1 product and fires two concurrent
/api/orders/checkout requests for 1 unit each, then checks that exactly one
succeeded and the other was correctly rejected as out of stock - not that
both succeeded and stock was merely clamped afterward, which is what the old
version of this script tested for.

Runs against the live DB in-process (TestClient, lifespan skipped - see
test_e2e_bugfixes.py for why). Seeds/cleans up its own tagged rows.

Usage (run from `backend/`, with the venv active):

    python scripts/test_e2e_concurrency.py
"""
import sys
import threading
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Address, Category, Order, Product, User, uid  # noqa: E402
from app.security import create_access_token  # noqa: E402

tag = str(int(time.time()))
EMAIL = f"e2e-concurrency-test-{tag}@example.com"

db = SessionLocal()
category = db.query(Category).first()
assert category, "no category found"

customer = User(email=EMAIL, name="E2E Concurrency Test", role="customer")
db.add(customer)
db.flush()
address = Address(
    user_id=customer.id, label="Home", full_name="E2E Concurrency Test", phone="9999999997",
    line1="1 Test Lane", city="Hyderabad", state="Telangana", pincode="500001",
)
db.add(address)
product = Product(
    id=uid(), category_id=category.id, title=f"E2E Race Test {tag}", slug=f"e2e-race-test-{tag}",
    type="product", price=100, stock=1, is_active=True,
)
db.add(product)
db.commit()
for obj in (address, product):
    db.refresh(obj)
print(f"Seeded customer {customer.id}, product {product.id} with stock=1")

token = create_access_token(customer.id, "customer")
HEADERS = {"Authorization": f"Bearer {token}"}
client = TestClient(app)  # lifespan intentionally not triggered - see docstring

results = [None, None]
barrier = threading.Barrier(2)


def checkout(idx):
    barrier.wait()  # line both threads up so the two HTTP calls fire as close to simultaneously as possible
    r = client.post("/api/orders/checkout", headers=HEADERS, json={
        "address_id": address.id,
        "items": [{"product_id": product.id, "title": "race", "price": 100, "qty": 1}],
    })
    results[idx] = r


threads = [threading.Thread(target=checkout, args=(i,)) for i in range(2)]
for t in threads:
    t.start()
for t in threads:
    t.join()

status_codes = [r.status_code for r in results]
succeeded = [r for r in results if r.status_code == 201]
rejected = [r for r in results if r.status_code == 400]
order_ids = [r.json()["order"]["id"] for r in succeeded]

db.expire_all()
final_stock = db.get(Product, product.id).stock

print(f"checkout responses: {status_codes}")
print(f"orders created: {order_ids}")
print(f"final stock: {final_stock} (started at 1)")

if len(succeeded) == 1 and len(rejected) == 1 and final_stock == 0:
    print("\n[RESERVATION HELD] Exactly one of the two concurrent checkouts succeeded, the other "
          "was correctly rejected as out of stock, and final stock is exactly 0 - the atomic "
          "reservation in checkout() closed the race.")
elif len(succeeded) == 2:
    print(f"\n[RACE STILL PRESENT] Both concurrent checkouts succeeded against stock=1 "
          f"(final stock={final_stock}) - try_decrement_stock()'s atomicity did not hold. "
          f"This should not be reachable; if you see this, something regressed it.")
else:
    print(f"\n[UNEXPECTED OUTCOME] {len(succeeded)} succeeded, {len(rejected)} rejected, "
          f"final stock={final_stock} - doesn't match either expected shape above; "
          f"inspect the raw responses.")
    for r in results:
        print(" ", r.status_code, r.text[:200])

# ---------------------------------------------------------------- cleanup
if order_ids:
    db.query(Order).filter(Order.id.in_(order_ids)).delete(synchronize_session=False)
db.query(Address).filter(Address.user_id == customer.id).delete(synchronize_session=False)
db.query(Product).filter(Product.id == product.id).delete(synchronize_session=False)
db.query(User).filter(User.id == customer.id).delete(synchronize_session=False)
db.commit()
db.close()
print("Cleaned up all seeded rows.")
