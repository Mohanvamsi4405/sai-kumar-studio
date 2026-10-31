"""
One-off maintenance script: sets the owner account's (ADMIN_EMAIL) password to
whatever ADMIN_PASSWORD currently is in backend/.env.

Use this to rotate the owner password after editing ADMIN_PASSWORD in .env -
seed_admin_user() (app/seed.py) only ever creates that account once and never
updates an existing row's password, and there is no in-app "change my
password" flow yet, so this is the only way to change it after first setup.

Refuses to run if ADMIN_PASSWORD in .env is still the default shipped in
config.py, so it can't be used to (re-)introduce the known-default password.

Connects to DATABASE_URL from backend/.env, same as the app itself.

Usage (run from `backend/`, with the venv active, after editing
ADMIN_PASSWORD in .env to a real value):

    cd backend
    python scripts/set_admin_password.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/, so `app` is importable

from app.config import get_settings  # noqa: E402
from app.database import SessionLocal  # noqa: E402
from app.models import User  # noqa: E402
from app.security import hash_password  # noqa: E402


def main() -> None:
    settings = get_settings()
    default_password = type(settings).model_fields["admin_password"].default
    if settings.admin_password == default_password:
        print(
            "Refusing to run: ADMIN_PASSWORD in backend/.env is still the default "
            "shipped in config.py. Edit backend/.env, set ADMIN_PASSWORD to a real "
            "value, then re-run this script."
        )
        sys.exit(1)

    email = settings.admin_email.lower().strip()
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"No user found for {email}. Run `python -m app.seed` first to create the owner account.")
            sys.exit(1)
        user.password_hash = hash_password(settings.admin_password)
        db.commit()
        print(f"Password updated for {email} (role={user.role}).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
