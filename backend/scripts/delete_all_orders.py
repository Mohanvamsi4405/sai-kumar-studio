"""
One-off maintenance script: delete every row from the orders table (and,
via each table's ON DELETE CASCADE FK, its order_items, payments,
order_tracking_events, order_cancellation_requests and
order_address_change_requests).

Connects to DATABASE_URL from backend/.env, same as the app itself.

Usage (run from `backend/`, with the venv active):

    cd backend
    python scripts/delete_all_orders.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/, so `app` is importable

from sqlalchemy import create_engine, text  # noqa: E402

from app.config import get_settings  # noqa: E402


def main() -> None:
    settings = get_settings()
    engine = create_engine(settings.database_url)

    print(f"Target: {engine.url.render_as_string(hide_password=True)}")

    with engine.begin() as conn:
        before = conn.execute(text("SELECT COUNT(*) FROM orders")).scalar_one()
        print(f"orders before: {before}")

        conn.execute(text("DELETE FROM orders"))

        after = conn.execute(text("SELECT COUNT(*) FROM orders")).scalar_one()
        print(f"orders after: {after}")

    print(f"\nDeleted {before - after} orders (cascaded to order_items, payments, "
          f"order_tracking_events, order_cancellation_requests, order_address_change_requests).")


if __name__ == "__main__":
    main()
