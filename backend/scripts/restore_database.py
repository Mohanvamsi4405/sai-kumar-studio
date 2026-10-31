"""
Restore a backup produced by scripts/backup_database.py into a Postgres/Supabase
database - the recovery half of that script.

It builds the schema the same way main.py does on startup (Base.metadata.create_all
plus every migration in app/migrations.py), then loads data/*.json in FK-safe order
and verifies the resulting row counts against the backup's manifest.

Usage (run from `backend/`, with the venv active):

    # check a backup is complete and uncorrupted - touches no database at all
    python scripts/restore_database.py --from backups/backup_20260929_101500Z --verify-only

    # restore into a fresh, empty Supabase project
    python scripts/restore_database.py --from backups/backup_20260929_101500Z \\
        --target "postgresql://postgres.NEWREF:PASSWORD@aws-0-<region>.pooler.supabase.com:5432/postgres"

    # restore over a database that already has rows (deletes them first)
    python scripts/restore_database.py --from backups/backup_20260929_101500Z \\
        --target "postgresql://..." --wipe --yes

    # bring back just one table (e.g. products deleted by accident)
    python scripts/restore_database.py --from backups/backup_20260929_101500Z \\
        --target "postgresql://..." --tables products --wipe --yes

--from accepts either a backup folder or the .zip that `backup_database.py --zip`
produced; a zip is extracted to a temporary folder for the run.

This script WRITES. It refuses to touch the database in backend/.env unless
--allow-live is passed as well, so a mistyped command cannot overwrite production.
"""
import argparse
import json
import shutil
import sys
import tempfile
import uuid
import zipfile
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/, so `app` is importable
sys.path.insert(0, str(Path(__file__).resolve().parent))         # scripts/, for backup_database's helpers

from sqlalchemy import (  # noqa: E402
    Boolean, Date, DateTime, Integer, LargeBinary, Numeric, Time, create_engine, func, select,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.database import Base  # noqa: E402
from app import models  # noqa: E402,F401  (importing registers every table on Base.metadata)
from app.migrations import (  # noqa: E402
    run_check_constraint_migrations,
    run_column_migrations,
    run_constraint_migrations,
    run_index_migrations,
)
from app.config import get_settings  # noqa: E402

INSERT_BATCH = 500


def decode_value(value, column):
    """Reverse backup_database.encode_value() using the column's declared type, so
    a Numeric column gets a Decimal and a timestamp column a datetime rather than
    the string they were stored as in JSON."""
    if value is None:
        return None
    if isinstance(value, dict) and "__bytes_hex__" in value:
        return bytes.fromhex(value["__bytes_hex__"])

    type_ = column.type
    if isinstance(type_, Numeric) and not isinstance(value, Decimal):
        # Numeric covers Float too; asdecimal tells them apart the way SQLAlchemy does.
        return Decimal(str(value)) if getattr(type_, "asdecimal", True) else float(value)
    if isinstance(type_, DateTime) and isinstance(value, str):
        return datetime.fromisoformat(value)
    if isinstance(type_, Date) and isinstance(value, str):
        return date.fromisoformat(value)
    if isinstance(type_, Time) and isinstance(value, str):
        return time.fromisoformat(value)
    if isinstance(type_, Boolean) and isinstance(value, str):
        return value.lower() in ("true", "t", "1", "yes")
    if isinstance(type_, Integer) and isinstance(value, str):
        return int(value)
    if isinstance(type_, LargeBinary) and isinstance(value, str):
        return bytes.fromhex(value)
    if isinstance(type_, PGUUID) and getattr(type_, "as_uuid", False) and isinstance(value, str):
        return uuid.UUID(value)
    return value


def open_backup(source: Path) -> tuple[Path, Path | None]:
    """Resolve a --from argument to a readable backup folder. A .zip is extracted to
    a temp folder, returned as the second item so the caller can delete it after."""
    if not source.exists():
        raise SystemExit(f"Not found: {source}")
    if source.is_file() and source.suffix.lower() == ".zip":
        temp_dir = Path(tempfile.mkdtemp(prefix="studio_restore_"))
        with zipfile.ZipFile(source) as zf:
            zf.extractall(temp_dir)
        print(f"Extracted {source.name} -> {temp_dir}")
        return temp_dir, temp_dir
    return source, None


def cascade_targets(selected, all_tables) -> list[str]:
    """Tables NOT in `selected` that Postgres would still modify when the selected
    tables are emptied, because they reference them with ON DELETE CASCADE or
    SET NULL. Reported before a partial --tables wipe so nobody restores one table
    while silently destroying another."""
    selected_names = {t.name for t in selected}
    hit: dict[str, set[str]] = {}
    for table in all_tables:
        if table.name in selected_names:
            continue
        for fk in table.foreign_keys:
            action = (fk.ondelete or "").upper()
            if fk.column.table.name in selected_names and action in ("CASCADE", "SET NULL"):
                hit.setdefault(table.name, set()).add(f"{fk.parent.name} -> {fk.column.table.name} ON DELETE {action}")
    return [f"{name}  ({'; '.join(sorted(reasons))})" for name, reasons in sorted(hit.items())]


def load_manifest(backup_dir: Path) -> dict:
    manifest_path = backup_dir / "manifest.json"
    if not manifest_path.exists():
        raise SystemExit(
            f"{manifest_path} not found - is {backup_dir} a backup folder made by backup_database.py?"
        )
    return json.loads(manifest_path.read_text(encoding="utf-8"))


def verify_backup(backup_dir: Path, manifest: dict) -> list[str]:
    """Check every file the manifest lists is present, the right size and the right
    SHA-256, and that each table's JSON holds the row count the manifest recorded.
    Returns a list of problems (empty means the backup is intact)."""
    from backup_database import sha256_of  # same folder; reuse rather than duplicate

    problems: list[str] = []
    for rel, meta in manifest["files"].items():
        path = backup_dir / rel
        if not path.exists():
            problems.append(f"missing file: {rel}")
            continue
        if path.stat().st_size != meta["bytes"]:
            problems.append(f"size changed: {rel}")
            continue
        if sha256_of(path) != meta["sha256"]:
            problems.append(f"checksum mismatch (file is corrupted or edited): {rel}")

    for table_name, expected in manifest["row_counts"].items():
        path = backup_dir / "data" / f"{table_name}.json"
        if not path.exists():
            problems.append(f"missing data file for table {table_name}")
            continue
        try:
            rows = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            problems.append(f"{table_name}.json is not valid JSON: {exc}")
            continue
        if len(rows) != expected:
            problems.append(f"{table_name}: manifest says {expected} rows, file has {len(rows)}")
    return problems




def run_restore(engine, backup_dir: Path, tables, *, wipe: bool,
                schema_only: bool = False) -> dict[str, int]:
    """Build the schema on `engine`, optionally clear `tables`, load their rows from
    `backup_dir`, then verify the counts; raises SystemExit on a shortfall. Split out
    of main() so migrate_supabase.py drives this identical code path instead of
    keeping its own copy of it. Returns {table name: rows loaded}."""
    print("\n[2/5] Creating schema + applying migrations on target...")
    Base.metadata.create_all(bind=engine)
    run_column_migrations(engine)
    run_index_migrations(engine)
    run_constraint_migrations(engine)
    run_check_constraint_migrations(engine)
    print("  Schema ready.")

    if schema_only:
        print("\nDone (schema only: no rows loaded).")
        return {}

    if wipe:
        print("\n[3/5] Deleting existing rows (reverse FK order)...")
        with engine.begin() as conn:
            for table in reversed(tables):
                deleted = conn.execute(table.delete()).rowcount
                if deleted:
                    print(f"  {table.name:36s} {deleted:7d} deleted")
    else:
        print("\n[3/5] Skipping wipe (target must already be empty).")

    print("\n[4/5] Loading rows (FK-safe order)...")
    loaded: dict[str, int] = {}
    # One transaction for the whole load: a failure part-way through rolls the
    # entire restore back rather than leaving half a database behind.
    with engine.begin() as conn:
        for table in tables:
            path = backup_dir / "data" / f"{table.name}.json"
            rows = json.loads(path.read_text(encoding="utf-8"))
            # Columns the backup has but this model no longer does (or vice versa)
            # are dropped rather than crashing the restore - an older backup can
            # still be loaded onto today's schema.
            cols = {c.name: c for c in table.columns}
            prepared = [
                {k: decode_value(v, cols[k]) for k, v in row.items() if k in cols}
                for row in rows
            ]
            for i in range(0, len(prepared), INSERT_BATCH):
                conn.execute(table.insert(), prepared[i:i + INSERT_BATCH])
            loaded[table.name] = len(prepared)
            print(f"  {table.name:36s} {len(prepared):7d} rows")

    print("\n[5/5] Verifying row counts on target...")
    mismatches = []
    with engine.connect() as conn:
        for table in tables:
            actual = conn.execute(select(func.count()).select_from(table)).scalar_one()
            expected = loaded[table.name]
            # Without a wipe the target may legitimately hold more than the backup,
            # so only a shortfall is a failure.
            status = "OK" if actual >= expected else "MISMATCH"
            if actual < expected:
                mismatches.append(table.name)
            print(f"  {table.name:36s} backup={expected:7d} target={actual:7d}  {status}")

    if mismatches:
        raise SystemExit(f"\nDone WITH MISMATCHES in: {', '.join(mismatches)}")
    print("\nRestore complete and verified.")
    return loaded


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--from", dest="source", required=True,
                        help="Backup folder or .zip made by backup_database.py")
    parser.add_argument("--target", default=None, help="Database URL to restore INTO")
    parser.add_argument("--verify-only", action="store_true",
                        help="Only check the backup's integrity; connect to no database")
    parser.add_argument("--wipe", action="store_true",
                        help="Delete existing rows in the target tables first (required to "
                             "restore over a database that already has data)")
    parser.add_argument("--tables", default=None,
                        help="Comma-separated table names to restore (default: all)")
    parser.add_argument("--schema-only", action="store_true",
                        help="Create the schema and stop - load no rows")
    parser.add_argument("--allow-live", action="store_true",
                        help="Permit --target to be the DATABASE_URL in backend/.env")
    parser.add_argument("--yes", action="store_true",
                        help="Skip the confirmation prompt (needed for --wipe in a scheduled run)")
    args = parser.parse_args()

    source = Path(args.source)
    backup_dir, temp_dir = open_backup(source)

    try:
        manifest = load_manifest(backup_dir)
        print(f"Backup : {source}")
        print(f"Taken  : {manifest.get('snapshot_at', manifest['created_at'])}")
        print(f"From   : {manifest['source']}")
        print(f"Rows   : {manifest['total_rows']} across {len(manifest['row_counts'])} tables")

        print("\n[1/5] Verifying backup integrity...")
        problems = verify_backup(backup_dir, manifest)
        if problems:
            print("  PROBLEMS FOUND:")
            for p in problems:
                print(f"    - {p}")
            raise SystemExit("\nBackup is not intact - refusing to restore from it.")
        print("  All files present, checksums and row counts match.")

        if args.verify_only:
            print("\nDone (--verify-only: no database was contacted).")
            return

        if not args.target:
            raise SystemExit("--target is required unless --verify-only is passed.")

        live_url = get_settings().database_url
        if args.target == live_url and not args.allow_live:
            raise SystemExit(
                "--target is the DATABASE_URL in backend/.env (the live database).\n"
                "Re-run with --allow-live if overwriting the live database is really what you want."
            )

        engine = create_engine(args.target, poolclass=NullPool)
        safe_url = engine.url.render_as_string(hide_password=True)
        print(f"\nTarget : {safe_url}")

        all_tables = Base.metadata.sorted_tables  # topological order, respects FKs
        if args.tables:
            wanted = {t.strip() for t in args.tables.split(",") if t.strip()}
            unknown = wanted - {t.name for t in all_tables}
            if unknown:
                raise SystemExit(f"Unknown table(s): {', '.join(sorted(unknown))}")
            tables = [t for t in all_tables if t.name in wanted]
        else:
            tables = list(all_tables)

        collateral = cascade_targets(tables, all_tables) if args.wipe else []
        if collateral:
            # e.g. --tables products --wipe also destroys every media row (products
            # -> media is ON DELETE CASCADE) and nulls out order_items.product_id.
            # Restoring one table is only safe if its children are restored too.
            print(
                "\nWARNING: wiping the selected table(s) will also affect rows in tables\n"
                "you did NOT select, through ON DELETE CASCADE / SET NULL:\n"
                + "".join(f"    {t}\n" for t in collateral)
                + "Add them to --tables (or drop --tables to restore everything) unless\n"
                "you are certain that is what you want."
            )

        if not args.yes:
            action = "WIPE and reload" if args.wipe else "load rows into"
            answer = input(
                f"\nAbout to {action} {len(tables)} table(s) on {safe_url}.\nType 'yes' to continue: "
            )
            if answer.strip().lower() != "yes":
                raise SystemExit("Aborted.")
        elif collateral:
            raise SystemExit(
                "Refusing to run unattended (--yes) with a partial --tables wipe that "
                "cascades into the tables listed above. Re-run without --yes to confirm "
                "interactively, or include those tables."
            )

        run_restore(
            engine, backup_dir, tables,
            wipe=args.wipe, schema_only=args.schema_only,
        )
    finally:
        if temp_dir:
            shutil.rmtree(temp_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
