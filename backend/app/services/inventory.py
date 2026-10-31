"""Atomic Product.stock adjustments.

A plain Python read-modify-write (`product.stock = product.stock - qty`) has a
check-then-act race: two concurrent requests (e.g. a webhook retry racing a
`/verify` call, or two customers on the last unit of a scarce item) can each
read the same pre-decrement value and both "succeed," overselling the product.
`scripts/test_e2e_concurrency.py` exists specifically to reproduce this.

Every stock mutation in the app goes through one of the two functions below
instead of touching `Product.stock` directly. Each is a single conditional
`UPDATE`, which Postgres executes atomically (the row lock it takes for the
duration of the UPDATE serializes any other writer targeting the same row) -
so two concurrent decrements against the same product can no longer both
"win" against a stock count too low to cover both.
"""
from sqlalchemy import update
from sqlalchemy.orm import Session

from ..models import Product


def _invalidate_catalog_cache() -> None:
    """Drops the storefront's cached product payloads so a stock change is
    visible to the next shopper.

    The page bundles and the flat product list are cached for five minutes
    (catalog._PAGE_BUNDLE_CACHE_TTL_SECONDS). That was harmless while stock was
    only enforced at checkout, but the storefront now SHOWS stock - "Only 3
    left", an out-of-stock card, a capped quantity picker - and a five-minute
    stale count turns that display into a promise the checkout then breaks.

    Imported inside the function because routers.catalog imports from services,
    so a module-level import here would be circular. Invalidation is cheap
    relative to an order: it costs the next request one catalog re-query."""
    try:
        from ..routers.catalog import invalidate_catalog_cache
        invalidate_catalog_cache()
    except Exception:  # pragma: no cover - never let cache upkeep break an order
        pass


def try_decrement_stock(db: Session, product_id: str, qty: int) -> bool:
    """Decrements Product.stock by qty, but only if at least qty is currently
    available - the WHERE clause and the write happen as one atomic statement,
    so there's no window between "check" and "act" for a concurrent decrement
    to sneak into. Returns True if it went through, False if there wasn't
    enough stock left (including if stock is NULL, i.e. not a stock-tracked
    product) - the caller decides what that means for its order."""
    result = db.execute(
        update(Product)
        .where(Product.id == product_id, Product.stock >= qty)
        .values(stock=Product.stock - qty)
    )
    if result.rowcount > 0:
        _invalidate_catalog_cache()
    return result.rowcount > 0


def restock(db: Session, product_id: str, qty: int) -> None:
    """Credits qty back onto Product.stock as one atomic UPDATE - same
    reasoning as try_decrement_stock: two concurrent restocks (e.g. two
    cancellation approvals for the same product processed back to back)
    doing a plain read-modify-write can lose one of the increments. No-ops
    for a product with NULL stock (not stock-tracked)."""
    db.execute(
        update(Product)
        .where(Product.id == product_id, Product.stock.isnot(None))
        .values(stock=Product.stock + qty)
    )
    _invalidate_catalog_cache()
