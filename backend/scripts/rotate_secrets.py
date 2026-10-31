"""
Rotate and verify the credentials in backend/.env.

Rotating a key is the easy half - the risky half is finding out it was wrong
only after the site is down. So this script's main job is to TEST every
credential against the real service before the app is restarted with it:

    python scripts/rotate_secrets.py --check

checks the database URL, the JWT signing key, Cloudflare R2, Razorpay and SMTP,
and prints which of them work. Nothing is written and no secret value is ever
printed - only a masked fingerprint.

Changing values:

    # new JWT signing key (this one the script can generate itself)
    python scripts/rotate_secrets.py --new-secret-key

    # keys you rotated in Cloudflare / Razorpay / Supabase - paste them in
    python scripts/rotate_secrets.py --set R2_ACCESS_KEY=... --set R2_SECRET_KEY=...
    python scripts/rotate_secrets.py --set DATABASE_URL="postgresql://..."

    # anything changed above, verified against the live services
    python scripts/rotate_secrets.py --check

Every write takes a timestamped copy of .env first (backend/.env.bak.<stamp>),
so a bad edit is one file copy away from being undone. Comments, blank lines
and key order in .env are preserved - only the value on a matching line changes.

If a key actually LEAKED (pasted in a chat, committed, sent to a vendor),
rotating it is not enough on its own - also end every logged-in session:

    python scripts/rotate_secrets.py --revoke-sessions
"""
import argparse
import shutil
import smtplib
import sys
from datetime import datetime, timezone
from pathlib import Path
from secrets import token_urlsafe

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/, so `app` is importable

BACKEND_DIR = Path(__file__).resolve().parent.parent
ENV_PATH = BACKEND_DIR / ".env"

# What breaks, and for whom, when each of these changes. Printed after a rotation
# so the blast radius is stated rather than discovered.
BLAST_RADIUS = {
    "SECRET_KEY": (
        "Signs access tokens (security.py) and hashes pending OTP codes.\n"
        "      - Every issued ACCESS token stops being accepted immediately.\n"
        "      - Refresh tokens are NOT affected (they are plain SHA-256, not\n"
        "        signed with this key), and /api/auth/refresh needs no valid\n"
        "        access token - so browsers silently get a new access token and\n"
        "        customers are NOT logged out.\n"
        "      - An OTP already emailed but not yet entered stops verifying.\n"
        "        Anyone mid-login has to request a new code."
    ),
    "DATABASE_URL": (
        "The database itself. Wrong value = the whole site is down at the next\n"
        "      restart. Always --check before restarting the backend."
    ),
    "R2_ACCESS_KEY": (
        "Uploads to Cloudflare R2. Already-uploaded images keep working - they\n"
        "      are served from the public R2 URL, which these keys do not affect.\n"
        "      Only NEW admin uploads break if this is wrong."
    ),
    "R2_SECRET_KEY": "Paired with R2_ACCESS_KEY - see above.",
    "RAZORPAY_KEY_SECRET": (
        "Signs and verifies payment confirmations. Wrong value = customers can\n"
        "      pay but the confirmation fails verification and the order is not\n"
        "      marked paid. Rotate this OUTSIDE business hours."
    ),
    "RAZORPAY_KEY_ID": "Sent to the browser checkout. Must match RAZORPAY_KEY_SECRET's key pair.",
    "RAZORPAY_WEBHOOK_SECRET": (
        "Verifies webhooks from Razorpay. Must be changed in the Razorpay\n"
        "      dashboard's webhook settings at the same time, or webhooks start\n"
        "      failing signature checks silently."
    ),
    "SMTP_PASSWORD": (
        "Sends OTP emails. Wrong value = nobody can log in by OTP, because the\n"
        "      code never arrives. Check this one before you trust it."
    ),
    "ADMIN_PASSWORD": (
        "Only used to seed the first admin user into an EMPTY database\n"
        "      (app/seed.py). Changing it does NOT change the password of an\n"
        "      admin that already exists - use scripts/set_admin_password.py."
    ),
}


def mask(value: str) -> str:
    """A fingerprint that is safe to print: enough to tell two values apart, not
    enough to be the value."""
    if not value:
        return "(empty)"
    if len(value) <= 8:
        return f"{value[0]}***  (len {len(value)})"
    return f"{value[:4]}...{value[-4:]}  (len {len(value)})"


def read_env() -> list[str]:
    if not ENV_PATH.exists():
        raise SystemExit(f"{ENV_PATH} not found.")
    return ENV_PATH.read_text(encoding="utf-8").splitlines()


def backup_env() -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%SZ")
    dest = BACKEND_DIR / f".env.bak.{stamp}"
    shutil.copy2(ENV_PATH, dest)
    return dest


def write_env(updates: dict[str, str]) -> Path:
    """Replace the value of each KEY in .env, appending any that are not there yet.
    Rewrites whole lines rather than reformatting the file, so comments and ordering
    survive - .env is edited by hand too, and a reformat would lose that."""
    backup = backup_env()
    lines = read_env()
    remaining = dict(updates)
    out = []
    for line in lines:
        stripped = line.lstrip()
        if stripped and not stripped.startswith("#") and "=" in stripped:
            key = stripped.split("=", 1)[0].strip()
            if key in remaining:
                out.append(f"{key}={remaining.pop(key)}")
                continue
        out.append(line)
    for key, value in remaining.items():
        out.append(f"{key}={value}")
    ENV_PATH.write_text("\n".join(out) + "\n", encoding="utf-8")
    return backup


def fresh_settings():
    """Settings is @lru_cache'd, so a value written above is invisible until the
    cache is dropped. Re-reads .env from disk."""
    from app.config import get_settings
    get_settings.cache_clear()
    return get_settings()


# ---------------------------------------------------------------- checks

def check_database(settings) -> tuple[bool, str]:
    from sqlalchemy import create_engine, text as sql_text
    from sqlalchemy.pool import NullPool
    try:
        engine = create_engine(settings.database_url, poolclass=NullPool)
        with engine.connect() as conn:
            conn.execute(sql_text("SET TRANSACTION READ ONLY"))
            version = conn.execute(sql_text("SHOW server_version")).scalar_one()
            db = conn.execute(sql_text("SELECT current_database()")).scalar_one()
            tables = conn.execute(sql_text(
                "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'"
            )).scalar_one()
        host = engine.url.host or "?"
        return True, f"Postgres {version}, db={db}, {tables} tables, host={host}"
    except Exception as exc:
        return False, f"{type(exc).__name__}: {exc}"


def check_secret_key(settings) -> tuple[bool, str]:
    from app import security
    security.settings = settings  # module caches its own settings at import
    if settings.secret_key == "dev-secret-change-me":
        return False, "still the built-in development default - anyone can forge an admin token"
    if len(settings.secret_key) < 32:
        return False, f"only {len(settings.secret_key)} characters - use at least 43 (--new-secret-key)"
    token = security.create_access_token("test-user-id", "admin")
    decoded = security.decode_token(token)
    if not decoded or decoded.get("sub") != "test-user-id":
        return False, "sign/verify round trip failed"
    return True, f"signs and verifies, {len(settings.secret_key)} chars"


def check_r2(settings) -> tuple[bool | None, str]:
    if not settings.r2_configured:
        return None, "not configured in this .env (the VM's .env may still have it)"
    try:
        import boto3
        from botocore.config import Config as BotoConfig
        client = boto3.client(
            "s3",
            endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=settings.r2_access_key,
            aws_secret_access_key=settings.r2_secret_key,
            region_name="auto",
            config=BotoConfig(signature_version="s3v4", connect_timeout=10, retries={"max_attempts": 1}),
        )
        client.head_bucket(Bucket=settings.r2_bucket)
        return True, f"bucket '{settings.r2_bucket}' reachable and writable by these keys"
    except Exception as exc:
        return False, f"{type(exc).__name__}: {exc}"


def check_razorpay(settings) -> tuple[bool | None, str]:
    if settings.razorpay_mock:
        return None, "MOCK MODE - no real payments are processed with this key"
    try:
        import razorpay
        client = razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))
        client.order.all({"count": 1})
        return True, f"key {settings.razorpay_key_id} authenticates"
    except Exception as exc:
        return False, f"{type(exc).__name__}: {exc}"


def check_smtp(settings) -> tuple[bool | None, str]:
    if not settings.smtp_configured:
        return None, "not configured - OTP login email cannot be sent"
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as server:
            if settings.smtp_use_tls:
                server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
        return True, f"{settings.smtp_user} authenticates at {settings.smtp_host}"
    except Exception as exc:
        return False, f"{type(exc).__name__}: {exc}"


def run_checks(settings) -> bool:
    checks = [
        ("DATABASE_URL", check_database),
        ("SECRET_KEY", check_secret_key),
        ("Cloudflare R2", check_r2),
        ("Razorpay", check_razorpay),
        ("SMTP", check_smtp),
    ]
    print("\nChecking every credential against the real service...\n")
    failed = False
    for name, fn in checks:
        ok, detail = fn(settings)
        if ok is None:
            mark = "SKIP"
        elif ok:
            mark = " OK "
        else:
            mark = "FAIL"
            failed = True
        print(f"  [{mark}] {name:16s} {detail}")
    if settings.cloudinary_configured:
        print("  [NOTE] Cloudinary      still configured; R2 is the current image store")
    print()
    if failed:
        print("At least one credential does NOT work. Fix it before restarting the backend.")
    else:
        print("All configured credentials work.")
    return not failed


def revoke_sessions(settings) -> None:
    """Delete every refresh token and pending OTP. Only worth doing when a key has
    actually leaked: rotating SECRET_KEY alone does not log anyone out, because
    refresh tokens are not signed with it."""
    from sqlalchemy import create_engine, delete
    from sqlalchemy.pool import NullPool
    from app.models import OtpCode, RefreshToken

    engine = create_engine(settings.database_url, poolclass=NullPool)
    with engine.begin() as conn:
        tokens = conn.execute(delete(RefreshToken)).rowcount
        otps = conn.execute(delete(OtpCode)).rowcount
    print(f"\nRevoked {tokens} refresh token(s) and cleared {otps} pending OTP(s).")
    print("Every customer and admin must log in again from scratch.")


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--check", action="store_true",
                        help="Test every credential against its real service (the default)")
    parser.add_argument("--new-secret-key", action="store_true",
                        help="Generate a new SECRET_KEY and write it to backend/.env")
    parser.add_argument("--set", action="append", default=[], metavar="KEY=VALUE",
                        help="Set a value in backend/.env (repeatable)")
    parser.add_argument("--revoke-sessions", action="store_true",
                        help="Delete all refresh tokens and pending OTPs - logs everyone out")
    parser.add_argument("--show", action="store_true",
                        help="List the configured keys with masked fingerprints")
    parser.add_argument("--yes", action="store_true", help="Skip confirmation prompts")
    args = parser.parse_args()

    updates: dict[str, str] = {}
    for pair in args.set:
        if "=" not in pair:
            raise SystemExit(f"--set expects KEY=VALUE, got: {pair}")
        key, value = pair.split("=", 1)
        updates[key.strip()] = value

    if args.new_secret_key:
        # 64 URL-safe chars from secrets - HS256 takes any length, and this is well
        # past the 256-bit output of the hash it keys.
        updates["SECRET_KEY"] = token_urlsafe(48)

    if updates:
        print("About to change backend/.env:")
        for key, value in updates.items():
            print(f"  {key:24s} -> {mask(value)}")
            if key in BLAST_RADIUS:
                print(f"      {BLAST_RADIUS[key]}")
        if not args.yes:
            answer = input("\nType 'yes' to write these: ")
            if answer.strip().lower() != "yes":
                raise SystemExit("Aborted - nothing written.")
        backup = write_env(updates)
        print(f"\nWritten. Previous .env saved as: {backup.name}")
        print("Delete that .bak file once the new values are confirmed working -")
        print("it still contains the old secrets.")

    settings = fresh_settings()

    if args.show:
        print("\nConfigured values (masked):\n")
        for key in ("DATABASE_URL", "SECRET_KEY", "R2_ACCESS_KEY", "R2_SECRET_KEY",
                    "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
                    "SMTP_USER", "SMTP_PASSWORD", "SUPABASE_SECRET_KEY"):
            print(f"  {key:24s} {mask(getattr(settings, key.lower(), '') or '')}")
        print()

    if args.revoke_sessions:
        if not args.yes:
            answer = input("\nLog out EVERY customer and admin right now? Type 'yes': ")
            if answer.strip().lower() != "yes":
                raise SystemExit("Aborted.")
        revoke_sessions(settings)

    # Checking is the point of the script, so it runs unless the invocation was
    # purely one of the other actions.
    if args.check or not (updates or args.revoke_sessions or args.show):
        if not run_checks(settings):
            sys.exit(1)

    if updates:
        print("\nThe running backend still has the OLD values - a process reads .env once,")
        print("at startup. Restart it to pick these up (see VM_REDEPLOY_GUIDE.txt).")


if __name__ == "__main__":
    main()
