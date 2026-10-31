"""
Full, read-only backup of the Supabase (Postgres) database this app runs on.

Every table is dumped four ways, so a restore is possible with or without this
repo, and the admin can also just open the data in Excel:

    schema.sql        CREATE TABLE / INDEX / CONSTRAINT statements for every table,
                      generated from the app's own SQLAlchemy models plus the
                      migrations in app/migrations.py - i.e. the same schema
                      main.py builds on startup, in plain SQL.
    data.sql          INSERT statements for every row, in FK-safe order. schema.sql
                      + data.sql restores the whole database with psql alone.
    data/<table>.json Typed JSON (one file per table) - the lossless copy, and what
                      restore_database.py reads.
    csv/<table>.csv   Excel/Sheets-friendly copy for reading, not for restoring
                      (CSV cannot tell an empty string from NULL).
    manifest.json     Row counts + SHA-256 of every file, so a backup can be verified.

Usage (run from `backend/`, with the venv active):

    python scripts/backup_database.py                       # -> backend/backups/<timestamp>/
    python scripts/backup_database.py --zip --keep 14       # zip it, keep the 14 newest
    python scripts/backup_database.py --out D:\\studio-backups
    python scripts/backup_database.py --source "postgresql://..."   # another project

Safe to run against the live database at any time, including while the site is
serving traffic: it opens ONE connection outside the app's pool, marks the
transaction READ ONLY (so the server itself rejects any write), and reads every
table inside a single REPEATABLE READ transaction, so all files come from the
same point in time rather than a smear across the run.

Always use the "Session pooler" connection string (aws-0-<region>.pooler.supabase.com),
not the direct db.<ref>.supabase.co host - the direct host is IPv6-only on new
Supabase projects and commonly fails to connect from Windows/most home networks.
"""
import argparse
import csv
import hashlib
import json
import shutil
import sys
import uuid
import zipfile
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/, so `app` is importable

from sqlalchemy import create_engine, func, select, text  # noqa: E402
from sqlalchemy.dialects import postgresql  # noqa: E402
from sqlalchemy.pool import NullPool  # noqa: E402
from sqlalchemy.schema import CreateIndex, CreateTable  # noqa: E402

from app.database import Base  # noqa: E402
from app import models  # noqa: E402,F401  (importing registers every table on Base.metadata)
from app import migrations  # noqa: E402
from app.config import get_settings  # noqa: E402

BACKEND_DIR = Path(__file__).resolve().parent.parent
FORMAT_VERSION = 1  # bump if the on-disk layout below changes incompatibly
# Read in chunks rather than materializing a whole table: media/orders grow without
# bound, and a backup should stay flat in memory however large they get.
CHUNK_ROWS = 2000


# ---------------------------------------------------------------- value encoding

def encode_value(value):
    """DB value -> JSON-safe value. Decimal becomes a string rather than a float so
    money survives the round trip exactly; restore_database.py reverses this using
    each column's declared type."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, timedelta):
        return value.total_seconds()
    if isinstance(value, (bytes, memoryview)):
        return {"__bytes_hex__": bytes(value).hex()}
    if isinstance(value, (dict, list)):
        return value  # JSON columns come back already decoded
    return str(value)


def sql_literal(value) -> str:
    """Postgres literal for data.sql. Assumes standard_conforming_strings=on (the
    default since PG 9.1), so a backslash inside a quoted string is just a backslash."""
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float, Decimal)):
        return str(value)
    if isinstance(value, (bytes, memoryview)):
        return "'\\x" + bytes(value).hex() + "'::bytea"
    if isinstance(value, (dict, list)):
        value = json.dumps(value, ensure_ascii=False)
    elif isinstance(value, (datetime, date, time)):
        value = value.isoformat()
    return "'" + str(value).replace("'", "''") + "'"


def csv_value(value) -> str:
    if value is None:
        return ""
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, (bytes, memoryview)):
        return bytes(value).hex()
    return str(value)


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as fh:
        for block in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


# ---------------------------------------------------------------- schema dump

def build_schema_sql() -> str:
    """The full DDL: the models, plus every statement app/migrations.py applies on
    startup. Written so a fresh Supabase project can be brought to the current schema
    by running this one file - no Python, no repo checkout."""
    dialect = postgresql.dialect()
    parts: list[str] = [
        "-- Sai Kumar Studio - full schema (tables, indexes, constraints).",
        "-- Generated by scripts/backup_database.py from app/models.py + app/migrations.py.",
        '-- Restore into an EMPTY database:  psql "<DATABASE_URL>" -f schema.sql',
        "",
        "BEGIN;",
        "",
    ]

    for table in Base.metadata.sorted_tables:  # topological: parents before children
        parts.append(str(CreateTable(table, if_not_exists=True).compile(dialect=dialect)).strip() + ";")
        parts.append("")
        for index in sorted(table.indexes, key=lambda i: i.name or ""):
            parts.append(str(CreateIndex(index, if_not_exists=True).compile(dialect=dialect)).strip() + ";")
        if table.indexes:
            parts.append("")

    parts += ["-- ---- app/migrations.py: columns added/removed after a table first shipped ----", ""]
    for table_name, clauses in migrations._COLUMN_MIGRATIONS.items():
        for clause in clauses:
            parts.append(f"ALTER TABLE {table_name} {clause};")
    parts.append("")

    parts += ["-- ---- app/migrations.py: indexes backfilled onto existing tables ----", ""]
    for clauses in migrations._INDEX_MIGRATIONS.values():
        for clause in clauses:
            parts.append(clause + ";")
    parts.append("")

    parts += ["-- ---- app/migrations.py: foreign keys whose ON DELETE was changed ----", ""]
    for name, tbl, column, ref_table, ondelete in migrations._CONSTRAINT_MIGRATIONS:
        parts.append(f"ALTER TABLE {tbl} DROP CONSTRAINT IF EXISTS {name};")
        parts.append(
            f"ALTER TABLE {tbl} ADD CONSTRAINT {name} "
            f"FOREIGN KEY ({column}) REFERENCES {ref_table}(id) ON DELETE {ondelete};"
        )
    parts.append("")

    # Postgres has no ADD CONSTRAINT IF NOT EXISTS, so unlike everything above this
    # section is not re-runnable against a DB that already has the constraints.
    parts += [
        "-- ---- app/migrations.py: CHECK constraints. This section is the one part of",
        "-- ---- this file that is NOT idempotent - on a database that already has them,",
        "-- ---- each line errors with 'constraint already exists'. Harmless to skip.",
        "",
    ]
    for name, tbl, check_sql in migrations._CHECK_CONSTRAINT_MIGRATIONS:
        parts.append(f"ALTER TABLE {tbl} ADD CONSTRAINT {name} CHECK ({check_sql});")

    parts += ["", "COMMIT;", ""]
    return "\n".join(parts)


# ---------------------------------------------------------------- data dump

def dump_table(conn, table, out_dir: Path, sql_fh) -> int:
    """Stream one table into data/<t>.json, csv/<t>.csv and the shared data.sql.
    Returns the row count."""
    columns = [c.name for c in table.columns]
    json_path = out_dir / "data" / f"{table.name}.json"
    csv_path = out_dir / "csv" / f"{table.name}.csv"
    quoted_cols = ", ".join(f'"{c}"' for c in columns)

    count = 0
    with json_path.open("w", encoding="utf-8") as json_fh, \
            csv_path.open("w", encoding="utf-8-sig", newline="") as csv_fh:
        json_fh.write("[\n")
        writer = csv.writer(csv_fh)
        writer.writerow(columns)

        # stream_results keeps the driver from buffering the whole table client-side.
        result = conn.execution_options(stream_results=True).execute(
            table.select().order_by(*table.primary_key.columns)
        )
        sql_fh.write(f"\n-- {table.name}\n")
        for partition in result.mappings().partitions(CHUNK_ROWS):
            for row in partition:
                values = [row[c] for c in columns]
                if count:
                    json_fh.write(",\n")
                json_fh.write("  " + json.dumps(
                    {c: encode_value(v) for c, v in zip(columns, values)}, ensure_ascii=False
                ))
                writer.writerow([csv_value(v) for v in values])
                literals = ", ".join(sql_literal(v) for v in values)
                sql_fh.write(f"INSERT INTO {table.name} ({quoted_cols}) VALUES ({literals});\n")
                count += 1
        json_fh.write("\n]\n" if count else "]\n")

    if count == 0:
        sql_fh.write("-- (no rows)\n")
    return count


def prune_old_backups(root: Path, keep: int) -> list[str]:
    """Keep the `keep` newest backups (folder or .zip), delete the rest. Only touches
    entries this script named, so anything else in the folder is left alone."""
    entries = [p for p in root.iterdir() if p.name.startswith("backup_")]
    entries.sort(key=lambda p: p.name, reverse=True)  # names are timestamps: name order == time order
    removed = []
    for old in entries[keep:]:
        if old.is_dir():
            shutil.rmtree(old)
        else:
            old.unlink()
        removed.append(old.name)
    return removed


def run_backup(source_url: str, out_root: Path, *, zip_it: bool = False, keep: int = 0,
               write_sql: bool = True) -> Path:
    """Take one full backup. Returns the path written (a folder, or a .zip if zip_it).
    Split out of main() so migrate_supabase.py can take the pre-migration safety
    backup through the same code path the scheduled backup uses."""
    root = out_root
    root.mkdir(parents=True, exist_ok=True)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%SZ")
    out_dir = root / f"backup_{stamp}"
    (out_dir / "data").mkdir(parents=True, exist_ok=True)
    (out_dir / "csv").mkdir(parents=True, exist_ok=True)

    # NullPool: this is a one-shot script, and the app's pool budget on the Supabase
    # session pooler is deliberately tight (see app/database.py) - a backup run must
    # not hold a pooled connection open or compete for one.
    engine = create_engine(source_url, poolclass=NullPool)
    safe_url = engine.url.render_as_string(hide_password=True)
    print(f"Source : {safe_url}")
    print(f"Output : {out_dir}")

    print("\n[1/4] Writing schema.sql...")
    (out_dir / "schema.sql").write_text(build_schema_sql(), encoding="utf-8")
    print(f"  {len(Base.metadata.sorted_tables)} tables described.")

    print("\n[2/4] Dumping rows (read-only, single consistent snapshot)...")
    counts: dict[str, int] = {}
    tables = Base.metadata.sorted_tables
    sql_path = out_dir / "data.sql"
    with engine.connect().execution_options(isolation_level="REPEATABLE READ") as conn:
        # First statement of the transaction, so it governs everything below: the
        # server now refuses any write originating from this connection.
        conn.execute(text("SET TRANSACTION READ ONLY"))
        snapshot_at = conn.execute(select(func.now())).scalar_one()
        with sql_path.open("w", encoding="utf-8") as sql_fh:
            sql_fh.write(
                "-- Sai Kumar Studio - row data.\n"
                "-- Generated by scripts/backup_database.py.\n"
                f"-- Snapshot: {snapshot_at}\n"
                "-- Restore into a database that already has schema.sql applied:\n"
                '--   psql "<DATABASE_URL>" -f data.sql\n'
                "-- Tables are in FK-safe order, so run the file top to bottom.\n\n"
                "BEGIN;\n"
            )
            for table in tables:
                counts[table.name] = dump_table(conn, table, out_dir, sql_fh)
                print(f"  {table.name:36s} {counts[table.name]:7d} rows")
            sql_fh.write("\nCOMMIT;\n")
    if not write_sql:
        sql_path.unlink()

    total_rows = sum(counts.values())
    print(f"  {'TOTAL':36s} {total_rows:7d} rows")

    print("\n[3/4] Writing manifest.json + README.txt...")
    (out_dir / "README.txt").write_text(RESTORE_README, encoding="utf-8")
    files = sorted(p for p in out_dir.rglob("*") if p.is_file() and p.name != "manifest.json")
    manifest = {
        "format_version": FORMAT_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "snapshot_at": str(snapshot_at),
        "source": safe_url,
        "table_order": [t.name for t in tables],  # FK-safe: insert in this order, delete in reverse
        "row_counts": counts,
        "total_rows": total_rows,
        "files": {
            str(p.relative_to(out_dir)).replace("\\", "/"): {
                "bytes": p.stat().st_size, "sha256": sha256_of(p),
            }
            for p in files
        },
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    final_path = out_dir
    if zip_it:
        print("\n[4/4] Compressing...")
        zip_path = root / f"backup_{stamp}.zip"
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for p in sorted(out_dir.rglob("*")):
                if p.is_file():
                    zf.write(p, p.relative_to(out_dir))
        shutil.rmtree(out_dir)
        final_path = zip_path
        print(f"  {zip_path.name}  ({zip_path.stat().st_size / 1_048_576:.1f} MB)")
    else:
        print("\n[4/4] Skipping zip (pass --zip to compress).")

    if keep > 0:
        removed = prune_old_backups(root, keep)
        if removed:
            print(f"\nPruned {len(removed)} old backup(s): {', '.join(removed)}")

    print(f"\nDone. Backup at: {final_path}")
    return final_path


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--source", default=None,
                        help="Database URL to back up (defaults to DATABASE_URL in backend/.env)")
    parser.add_argument("--out", default=None,
                        help="Directory to write backups into (default: backend/backups)")
    parser.add_argument("--zip", action="store_true",
                        help="Compress the backup into a single .zip and remove the folder")
    parser.add_argument("--keep", type=int, default=0,
                        help="After a successful backup, keep only the N newest backups (0 = keep all)")
    parser.add_argument("--no-sql", action="store_true",
                        help="Skip data.sql (JSON + CSV only) - faster on very large tables")
    args = parser.parse_args()

    run_backup(
        args.source or get_settings().database_url,
        Path(args.out) if args.out else BACKEND_DIR / "backups",
        zip_it=args.zip, keep=args.keep, write_sql=not args.no_sql,
    )


RESTORE_README = """\
Sai Kumar Studio - database backup
==================================

What is in here
---------------
schema.sql        Every CREATE TABLE / INDEX / CONSTRAINT for the app's database.
data.sql          INSERT statements for every row, in foreign-key-safe order.
data/*.json       One file per table - the lossless copy (this is what the
                  restore script reads).
csv/*.csv         The same data, openable in Excel / Google Sheets. For reading
                  only: CSV cannot distinguish an empty string from NULL, so
                  never restore from these.
manifest.json     Row counts and a SHA-256 for every file above.

Restoring - option A (no repo needed, just psql)
------------------------------------------------
Into a brand-new, EMPTY Supabase project:

    psql "<NEW DATABASE_URL>" -f schema.sql
    psql "<NEW DATABASE_URL>" -f data.sql

Use the Session pooler connection string (aws-0-<region>.pooler.supabase.com),
not db.<ref>.supabase.co - the direct host is IPv6-only and usually will not
connect from Windows or a home network.

Restoring - option B (from the repo, recommended)
-------------------------------------------------
    cd backend
    python scripts/restore_database.py --from <this folder> \\
        --target "<NEW DATABASE_URL>" --wipe --yes

This creates the schema, applies every migration in app/migrations.py, loads
data/*.json in FK-safe order, then verifies row counts against manifest.json.
Leave out --wipe when the target database is already empty.

Checking a backup is intact
---------------------------
    cd backend
    python scripts/restore_database.py --from <this folder> --verify-only
"""


if __name__ == "__main__":
    main()
