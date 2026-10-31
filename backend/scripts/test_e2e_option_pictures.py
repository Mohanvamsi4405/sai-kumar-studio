"""End-to-end regression test for the "Customer questions" dropdown feature set:
per-option pictures (option_image_urls), per-option prices/was-prices, the
gallery-photo mapping, and the server-side price resolution that decides what a
customer is actually charged for a priced option.

Runs the real FastAPI app in-process (TestClient, so lifespan/migrations run
exactly as they do under uvicorn) against the configured database. Seeds
throwaway, uniquely-tagged rows, exercises the real HTTP endpoints, verifies
behavior against the DB, then deletes everything it created.

Usage (run from `backend/`, with the venv active):

    python scripts/test_e2e_option_pictures.py
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/, so `app` is importable

from fastapi.testclient import TestClient  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Category, Product, User, uid  # noqa: E402
from app.security import create_access_token  # noqa: E402
from app.services.product_fields import resolve_product_price  # noqa: E402

tag = str(int(time.time()))

checks: list[tuple[str, bool]] = []


def check(label: str, condition: bool, detail: str = ""):
    checks.append((label, bool(condition)))
    suffix = f"  ({detail})" if detail and not condition else ""
    print(f"  [{'PASS' if condition else 'FAIL'}] {label}{suffix}")


db = SessionLocal()
owner = db.query(User).filter(User.role == "owner").first()
assert owner, "no owner user found - cannot mint an admin token"
category = db.query(Category).first()
assert category, "no category found - needed to attach test products"

token = create_access_token(owner.id, owner.role)
auth = {"Authorization": f"Bearer {token}"}
created_product_ids: list[str] = []

SWATCHES = {
    "Maroon": "/media/e2e-maroon.webp",
    "Navy": "https://cdn.example.com/e2e-navy.png",
}

with TestClient(app) as client:
    # ------------------------------------------------------- A. admin create
    print("\n-- A. admin creates a product with priced, pictured options --")
    payload = {
        "category_id": category.id,
        "title": f"E2E Option Pictures {tag}",
        "slug": f"e2e-option-pictures-{tag}",
        "type": "product",
        "price": 999,                      # base price: must be overridden by the dropdown
        "is_active": False,                # keep it off the live storefront
        "input_fields": [{
            "id": "colour", "type": "dropdown", "label": "Colour", "required": True, "sort": 0,
            "options": ["Maroon", "Navy"], "multi_select": False,
            "option_prices": {"Maroon": 1699, "Navy": 1799},
            "option_mrps": {"Navy": 1999},
            "option_images": {"Maroon": 2},
            "option_image_urls": dict(SWATCHES),
        }],
    }
    r = client.post("/api/admin/products", json=payload, headers=auth)
    check("POST /api/admin/products -> 201", r.status_code == 201, f"{r.status_code} {r.text[:200]}")
    product_id = r.json()["id"] if r.status_code == 201 else None
    if product_id:
        created_product_ids.append(product_id)
    field = r.json()["input_fields"][0] if r.status_code == 201 else {}
    check("response echoes option_image_urls", field.get("option_image_urls") == SWATCHES,
          str(field.get("option_image_urls")))
    check("response keeps option_prices", field.get("option_prices") == {"Maroon": 1699, "Navy": 1799})
    check("response keeps option_mrps", field.get("option_mrps") == {"Navy": 1999})
    check("response keeps option_images (gallery mapping)", field.get("option_images") == {"Maroon": 2})

    # ------------------------------------------------------- B. persistence
    print("\n-- B. it is really stored, not just echoed --")
    db.expire_all()
    row = db.get(Product, product_id) if product_id else None
    stored = (row.input_fields or [{}])[0] if row else {}
    check("stored in the DB's input_fields JSON", stored.get("option_image_urls") == SWATCHES,
          str(stored.get("option_image_urls")))
    # There is no GET /api/admin/products/{id} - the admin UI reads the paginated
    # list (which returns {"items": [...], "total": n, "page": n}), so read it back
    # the same way the admin actually does, narrowed to this product's category.
    r = client.get("/api/admin/products", headers=auth,
                   params={"category_id": category.id, "page_size": 500})
    got = next((p for p in (r.json().get("items") or []) if p["id"] == product_id), {})
    check("admin read-back returns the pictures",
          (got.get("input_fields") or [{}])[0].get("option_image_urls") == SWATCHES,
          f"list status {r.status_code}, found={bool(got)}")

    # ------------------------------------------------------- C. public API
    print("\n-- C. the public catalog exposes them to the storefront --")
    pr = client.patch(f"/api/admin/products/{product_id}", json={"is_active": True}, headers=auth)
    check("PATCH activate -> 200", pr.status_code == 200, f"{pr.status_code} {pr.text[:200]}")
    r = client.get(f"/api/catalog/product/{product_id}")
    pub = r.json() if r.status_code == 200 else {}
    pub_field = (pub.get("input_fields") or [{}])[0]
    check("public product endpoint -> 200", r.status_code == 200, f"{r.status_code} {r.text[:160]}")
    check("public payload carries option_image_urls", pub_field.get("option_image_urls") == SWATCHES,
          str(pub_field.get("option_image_urls")))
    check("public payload carries option_prices", pub_field.get("option_prices") == {"Maroon": 1699, "Navy": 1799})
    client.patch(f"/api/admin/products/{product_id}", json={"is_active": False}, headers=auth)

    # ------------------------------------------------------- D. pricing
    print("\n-- D. server-side price resolution (what the customer is charged) --")
    db.expire_all()
    row = db.get(Product, product_id)
    check("first option's price wins over the base price",
          resolve_product_price(row, {"colour": "Maroon"}) == 1699.0,
          str(resolve_product_price(row, {"colour": "Maroon"})))
    check("a different option changes the charge",
          resolve_product_price(row, {"colour": "Navy"}) == 1799.0)
    check("no answer falls back to the product's own price",
          resolve_product_price(row, {}) == 999.0)
    check("an option that is not offered falls back, never guesses",
          resolve_product_price(row, {"colour": "Gold"}) == 999.0)
    check("a picture never affects the charge",
          resolve_product_price(row, {"colour": "Maroon"}) == 1699.0)

    # ------------------------------------------------------- E. validation
    print("\n-- E. the API rejects bad picture maps --")

    def create_bad(label, field_patch, expect_reject=True):
        bad = {
            **payload,
            "title": f"E2E Bad {label} {tag}", "slug": f"e2e-bad-{label}-{tag}".replace(" ", "-").lower(),
            "input_fields": [{**payload["input_fields"][0], **field_patch}],
        }
        rr = client.post("/api/admin/products", json=bad, headers=auth)
        if rr.status_code == 201:
            created_product_ids.append(rr.json()["id"])
        check(f"{label} -> {'rejected' if expect_reject else 'accepted'}",
              (rr.status_code == 422) if expect_reject else (rr.status_code == 201),
              f"status {rr.status_code}")

    create_bad("picture for an option that does not exist", {"option_image_urls": {"Gold": "/media/x.webp"}})
    create_bad("javascript: url", {"option_image_urls": {"Maroon": "javascript:alert(1)"}})
    create_bad("url with a double quote", {"option_image_urls": {"Maroon": '/media/a".webp'}})
    create_bad("no pictures at all", {"option_image_urls": None}, expect_reject=False)

    # ------------------------------------------------------- F. back-compat
    print("\n-- F. products that predate the feature are unaffected --")
    legacy = {
        **payload,
        "title": f"E2E Legacy {tag}", "slug": f"e2e-legacy-{tag}",
        "input_fields": [{
            "id": "sizes", "type": "dropdown", "label": "SIZES", "required": True, "sort": 0,
            "options": ["9X9", "10X10"], "multi_select": False,
            "option_prices": {"9X9": 1699, "10X10": 1799},
        }],
    }
    r = client.post("/api/admin/products", json=legacy, headers=auth)
    check("legacy-shaped product still creates -> 201", r.status_code == 201, f"{r.status_code} {r.text[:200]}")
    if r.status_code == 201:
        created_product_ids.append(r.json()["id"])
        lf = r.json()["input_fields"][0]
        check("option_image_urls defaults to null, not {}", lf.get("option_image_urls") is None,
              str(lf.get("option_image_urls")))
        db.expire_all()
        check("legacy pricing unchanged",
              resolve_product_price(db.get(Product, r.json()["id"]), {"sizes": "10X10"}) == 1799.0)

    # A stale option_mrps/option_images key on an existing product must still be
    # readable - ProductOut validates every stored product on the way out, so a
    # stricter rule here would 500 the admin product list (see schemas.py).
    stale = Product(
        id=uid(), category_id=category.id, title=f"E2E Stale {tag}", slug=f"e2e-stale-{tag}",
        type="product", price=100, is_active=False,
        input_fields=[{
            "id": "d", "type": "dropdown", "label": "D", "options": ["A"], "multi_select": False,
            "option_prices": {"A": 10}, "option_mrps": {"Removed": 99}, "option_images": {"Removed": 3},
        }],
    )
    db.add(stale)
    db.commit()
    created_product_ids.append(stale.id)
    r = client.get("/api/admin/products", headers=auth)
    check("admin product list still 200s with a legacy stale key", r.status_code == 200,
          f"{r.status_code} {r.text[:200]}")

    # ------------------------------------------------------- G. other APIs
    print("\n-- G. the rest of the public API still answers --")
    page_slug = None
    rr = client.get("/api/catalog/pages")
    if rr.status_code == 200 and rr.json():
        page_slug = (rr.json()[0] or {}).get("slug")
    for label, path in [
        ("health", "/api/health"),
        ("catalog pages", "/api/catalog/pages"),
        ("catalog offers", "/api/catalog/offers"),
        ("one page bundle", f"/api/catalog/{page_slug}" if page_slug else "/api/catalog/pages"),
        ("products list", "/api/products"),
        ("homepage", "/api/homepage"),
    ]:
        rr = client.get(path)
        check(f"GET {path} -> 2xx", 200 <= rr.status_code < 300, f"status {rr.status_code}")

    for label, path in [
        ("admin products", "/api/admin/products"),
        ("admin categories", "/api/admin/categories"),
        ("admin orders", "/api/admin/orders"),
        ("admin media", "/api/admin/media"),
    ]:
        rr = client.get(path, headers=auth)
        check(f"GET {path} -> 2xx", 200 <= rr.status_code < 300, f"status {rr.status_code}")

    rr = client.get("/api/admin/products")
    check("admin endpoints still reject an unauthenticated caller", rr.status_code in (401, 403),
          f"status {rr.status_code}")

# ---------------------------------------------------------------- cleanup
print("\n-- cleanup --")
db.expire_all()
if created_product_ids:
    db.query(Product).filter(Product.id.in_(created_product_ids)).delete(synchronize_session=False)
    db.commit()
leftover = db.query(Product).filter(Product.id.in_(created_product_ids)).count() if created_product_ids else 0
check("every seeded product deleted", leftover == 0, f"{leftover} left behind")
db.close()
print(f"Cleaned up {len(created_product_ids)} seeded product(s).")

failed = [label for label, ok in checks if not ok]
print(f"\n{len(checks) - len(failed)}/{len(checks)} checks passed.")
if failed:
    print("FAILED:", "; ".join(failed))
    sys.exit(1)
print("ALL PASSED")
