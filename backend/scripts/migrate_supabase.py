"""
Move the whole database to a different Supabase (or any Postgres) project.

Written for the recurring free-tier case: the project's egress allowance is spent,
so the site moves to a fresh project. It is also the right tool for any planned
move - a region change, an upgrade, splitting staging off production.

The migration always goes THROUGH A BACKUP rather than streaming rows straight
from one database to the other, because that leaves you holding a verified copy
of the data on your own machine no matter how the rest of the move goes. Two
paths, and which one you use depends on whether the old project still answers:

    Old project still reachable (the planned case):
        python scripts/migrate_supabase.py --target "postgresql://...NEW..."
      Backs up the old project now, then loads it into the new one.

    Old project throttled, suspended or already gone (egress spent):
        python scripts/migrate_supabase.py --target "postgresql://...NEW..." \\
            --from-backup "D:\\studio-backups\\backup_20260929_094533Z.zip"
      Reads NOTHING from the old project - the last scheduled backup is the
      source. This is the whole reason backup_database.py runs on a schedule.

Other options:
    --wipe-target      clear the target's tables first (re-running a migration,
                       or reusing a project that already has rows)
    --backup-out DIR   where to put the safety backup (default: backend/backups)
    --yes              skip the confirmation prompt
    --dry-run          verify both ends and print the plan, change nothing

Always use the "Session pooler" connection string for BOTH ends
(aws-0-<region>.pooler.supabase.com), not the direct db.<ref>.supabase.co host -
the direct host is IPv6-only on new Supabase projects and commonly fails to
connect from Windows/most home networks.

After this finishes, the data is moved but the site is NOT: nothing has pointed
the app at the new project yet. The script ends by printing the cutover steps,
which are also in PROJECT_MIGRATION_GUIDE.txt.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/, so `app` is importable
sys.path.insert(0, str(Path(__file__).resolve().parent))         # scripts/, for the backup/restore modules

from sqlalchemy import create_engine, func, select, text  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402

from app.database import Base  # noqa: E402
from app import models  # noqa: E402,F401  (importing registers every table on Base.metadata)
from app.config import get_settings  # noqa: E402

from backup_database import run_backup  # noqa: E402
from restore_database import load_manifest, open_backup, run_restore, verify_backup  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parent.parent


def check_target_empty(engine) -> dict[str, int]:
    """Row counts for any of our tables that already exist on the target. A fresh
    Supabase project has none of them, so anything here means the target is in use -
    worth knowing BEFORE the migration, not after it has merged two datasets."""
    existing: dict[str, int] = {}
    with engine.connect() as conn:
        present = set(conn.execute(text(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
        )).scalars())
        for table in Base.metadata.sorted_tables:
            if table.name in present:
                count = conn.execute(select(func.count()).select_from(table)).scalar_one()
                if count:
                    existing[table.name] = count
    return existing


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--target", required=True, help="NEW project's database URL")
    parser.add_argument("--source", default=None,
                        help="OLD project's database URL (defaults to backend/.env). Ignored with --from-backup.")
    parser.add_argument("--from-backup", dest="from_backup", default=None,
                        help="Migrate from an existing backup folder/.zip instead of reading the old project")
    parser.add_argument("--backup-out", default=None,
                        help="Where to write the safety backup (default: backend/backups)")
    parser.add_argument("--wipe-target", action="store_true",
                        help="Delete existing rows in the target's tables first")
    parser.add_argument("--dry-run", action="store_true",
                        help="Check both ends and print the plan without changing anything")
    parser.add_argument("--yes", action="store_true", help="Skip the confirmation prompt")
    args = parser.parse_args()

    settings = get_settings()
    target_url = args.target

    target_engine = create_engine(target_url, poolclass=NullPool)
    safe_target = target_engine.url.render_as_string(hide_password=True)

    if target_url == settings.database_url:
        raise SystemExit(
            "--target is the DATABASE_URL already in backend/.env - that is the database "
            "you are migrating AWAY from, not the new one."
        )

    print("=" * 70)
    print(" SUPABASE PROJECT MIGRATION")
    print("=" * 70)

    # ---------------------------------------------------------------- 1. source
    temp_dir = None
    try:
        if args.from_backup:
            backup_path = Path(args.from_backup)
            print(f"\n[1/4] Source: existing backup {backup_path}")
            print("      (the old project will not be contacted at all)")
            backup_dir, temp_dir = open_backup(backup_path)
        else:
            source_url = args.source or settings.database_url
            if source_url == target_url:
                raise SystemExit("Source and target URLs are identical - refusing to run.")
            source_engine = create_engine(source_url, poolclass=NullPool)
            print(f"\n[1/4] Source: {source_engine.url.render_as_string(hide_password=True)}")
            print("      Taking a fresh backup first - this is both the transfer medium")
            print("      and the thing that saves you if the rest of the move goes wrong.")
            if args.dry_run:
                with source_engine.connect() as conn:
                    conn.execute(text("SET TRANSACTION READ ONLY"))
                    conn.execute(select(1))
                print("      Source reachable. (--dry-run: no backup taken.)")
                backup_dir = None
            else:
                backup_path = run_backup(
                    source_url,
                    Path(args.backup_out) if args.backup_out else BACKEND_DIR / "backups",
                )
                backup_dir, temp_dir = open_backup(backup_path)

        # ------------------------------------------------------------ 2. verify
        if backup_dir is not None:
            print("\n[2/4] Verifying the backup before it is trusted as the source...")
            manifest = load_manifest(backup_dir)
            problems = verify_backup(backup_dir, manifest)
            if problems:
                for p in problems:
                    print(f"    - {p}")
                raise SystemExit("Backup is not intact - refusing to migrate from it.")
            print(f"      OK: {manifest['total_rows']} rows across {len(manifest['row_counts'])} tables,")
            print(f"      taken {manifest.get('snapshot_at', manifest['created_at'])}")
        else:
            manifest = None

        # ------------------------------------------------------------ 3. target
        print(f"\n[3/4] Target: {safe_target}")
        try:
            occupied = check_target_empty(target_engine)
        except Exception as exc:
            raise SystemExit(f"      Cannot reach the target database: {exc}")

        if occupied:
            print("      This target ALREADY HAS DATA:")
            for name, count in sorted(occupied.items()):
                print(f"        {name:34s} {count:7d} rows")
            if not args.wipe_target:
                raise SystemExit(
                    "\nRefusing to load on top of existing rows - the two datasets would merge and\n"
                    "primary keys would collide. Re-run with --wipe-target to replace them, or\n"
                    "point --target at a genuinely fresh project."
                )
            print("      --wipe-target given: these rows will be DELETED.")
        else:
            print("      Target is empty. Good.")

        if args.dry_run:
            print("\n[4/4] --dry-run: stopping here. Both ends are reachable and the plan is valid.")
            return

        if not args.yes:
            answer = input(f"\nMigrate into {safe_target}? Type 'yes' to continue: ")
            if answer.strip().lower() != "yes":
                raise SystemExit("Aborted.")

        # ------------------------------------------------------------ 4. load
        print("\n[4/4] Loading into the target...")
        loaded = run_restore(
            target_engine, backup_dir, Base.metadata.sorted_tables, wipe=args.wipe_target,
        )

        expected = manifest["row_counts"]
        drift = [t for t, n in expected.items() if loaded.get(t, 0) != n]
        if drift:
            raise SystemExit(f"Loaded counts differ from the manifest for: {', '.join(drift)}")

        print_cutover_checklist(safe_target, backup_path)
    finally:
        if temp_dir:
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)


def print_cutover_checklist(safe_target: str, backup_path: Path) -> None:
    print(f"""
{'=' * 70}
 DATA IS MOVED. THE SITE IS NOT - DO THESE NEXT.
{'=' * 70}

The app is still talking to the OLD project. Until step 2, every order
placed on the live site lands in the old database and will NOT be in the
new one. Keep that window short.

 1. Rotate the secrets for the new project, and check they all work
    BEFORE restarting anything:

        python scripts/rotate_secrets.py --check

 2. Point the app at the new project - this one:

        {safe_target}

    Set DATABASE_URL to it (with the real password) in backend/.env on
    the VM, then restart the backend (see VM_REDEPLOY_GUIDE.txt).

 3. Verify against the live site, not just the database:
      - the storefront loads products and images
      - admin login works
      - place one test order end to end
      - an existing customer can still log in

 4. Re-point the scheduled backup at the new project, or it will keep
    backing up the abandoned one. Nothing to change if it uses the
    default (it reads DATABASE_URL from backend/.env).

 5. Do NOT delete the old Supabase project for at least a week. It is
    your rollback: put the old DATABASE_URL back and restart.

 6. Any order placed during the window in step 2 exists only in the old
    project. If there were any, migrate just those tables across:

        python scripts/restore_database.py --from <a fresh backup of the old project> \\
            --target "<new URL>" --tables orders,order_items,payments,order_tracking_events

    Check first - if the site was quiet, there is nothing to do.

 Safety backup from this run (keep it):
   {backup_path}
""")


if __name__ == "__main__":
    main()
