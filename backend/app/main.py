import asyncio
import contextlib
import logging
import threading
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import DataError, OperationalError
from sqlalchemy.exc import TimeoutError as PoolTimeoutError
from starlette.responses import Response
from starlette.types import Scope

from .config import get_settings
from .database import Base, SessionLocal, engine
from .migrations import (
    backfill_address_snapshots, backfill_corporate_engraving_fields,
    backfill_gifts_personalisation_fields, backfill_requires_photo_upload_fields,
    backfill_studio_quantity_purpose_fields, run_check_constraint_migrations, run_column_migrations,
    run_constraint_migrations, run_index_migrations,
)
from .routers import (
    addresses, admin, analytics, auth, bookings, cart, catalog, contact, notifications, orders, payments,
    uploads, wishlist,
)
from .routers.orders import expire_stale_reservations
from .services.retention import purge_due_artwork
from .services.storage import ensure_storage_ready

settings = get_settings()
logger = logging.getLogger(__name__)

# R2 folders whose images were moved elsewhere (Oct 2026) and that are being deleted;
# writing new uploads into one of these would lose them.
RETIRED_R2_FOLDERS = {"sai_kumar_studio", "legacy"}

BACKEND_DIR = Path(__file__).resolve().parent.parent
ADMIN_DIR = BACKEND_DIR.parent / "admin"
MEDIA_DIR = BACKEND_DIR / "storage" / "media"

# How often the reservation sweep below checks for abandoned, unpaid orders to
# expire. Frequent enough that an abandoned cart doesn't sit on real stock much
# past orders.RESERVATION_TTL_MINUTES; infrequent enough to be a non-event for
# the DB (this is a handful of orders at most on this app's traffic).
RESERVATION_SWEEP_INTERVAL_SECONDS = 5 * 60


async def _reservation_sweep_loop():
    """Runs for the lifetime of the process, periodically releasing the
    checkout-time stock reservation (see services/inventory.py) held by orders
    nobody ever paid for. Single in-process loop, same single-instance
    assumption already documented for this app's other in-process state (see
    AUDIT_REPORT.md H9/H11/M7) - would need to move to a real scheduler/lock
    before running more than one instance of this app at once, or two
    instances could both sweep the same order at the same time. A failed sweep
    just waits for the next interval rather than crashing the loop - the
    consequence of a missed sweep is a delayed restock, not data loss."""
    while True:
        await asyncio.sleep(RESERVATION_SWEEP_INTERVAL_SECONDS)
        try:
            expired = await run_in_threadpool(expire_stale_reservations)
            if expired:
                logger.info("Reservation sweep expired %d abandoned order(s)", expired)
        except Exception:
            logger.warning("Reservation sweep failed", exc_info=True)


# Customer artwork is deleted on a date, not on an interval, so this only has to
# run often enough that a due file goes within a day of becoming due. Six hours
# gives four attempts a day - enough that a restart or a transient R2 failure
# doesn't delay a deletion past its date, without querying for nothing all day.
ARTWORK_SWEEP_INTERVAL_SECONDS = 6 * 60 * 60


async def _artwork_retention_sweep_loop():
    """Deletes customer-uploaded order artwork whose retention window has passed
    (see services/retention.py for the policy). Same single-instance assumption
    as the reservation sweep above; running it twice would be harmless anyway,
    since deleting an already-deleted object is treated as success.

    Runs once shortly after startup rather than waiting a full interval, so a
    server that restarts daily still sweeps - and so a backlog left by a server
    that was off for a while clears promptly. A failure is logged and waits for
    the next interval: a missed sweep delays a deletion, it doesn't lose data."""
    await asyncio.sleep(120)  # let startup finish first; this is not urgent work
    while True:
        try:
            result = await run_in_threadpool(_run_artwork_sweep)
            if result.get("purged") or result.get("failed"):
                logger.info(
                    "Artwork retention sweep: %d deleted, %d failed",
                    result.get("purged", 0), result.get("failed", 0),
                )
        except Exception:
            logger.warning("Artwork retention sweep failed", exc_info=True)
        await asyncio.sleep(ARTWORK_SWEEP_INTERVAL_SECONDS)


def _run_artwork_sweep() -> dict:
    db = SessionLocal()
    try:
        return purge_due_artwork(db)
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    run_column_migrations(engine)
    run_index_migrations(engine)
    run_constraint_migrations(engine)
    run_check_constraint_migrations(engine)
    backfill_address_snapshots(engine)
    backfill_requires_photo_upload_fields(engine)
    backfill_studio_quantity_purpose_fields(engine)
    backfill_corporate_engraving_fields(engine)
    backfill_gifts_personalisation_fields(engine)
    ensure_storage_ready()
    if settings.cloudinary_folder in RETIRED_R2_FOLDERS:
        logger.error(
            "CLOUDINARY_FOLDER=%r is a retired R2 folder that is being deleted - new uploads "
            "written there will be lost. Set CLOUDINARY_FOLDER in backend/.env to the current "
            "folder.", settings.cloudinary_folder)
    # In the background, not before `yield`: warming generates any missing thumbnail
    # (an R2 fetch + resize + upload each), and after every image URL changed at once
    # (the move to a new R2 folder, Oct 2026) that was ~1,000 of them - about 15
    # minutes during which the server answered nothing. Requests that arrive while
    # it runs just build their own thumbnails on demand, as they would on a cold cache.
    # A daemon thread rather than a threadpool task, so a shutdown mid-warm-up exits
    # at once instead of waiting for the remaining thumbnails.
    threading.Thread(target=catalog.warm_catalog_cache, name="catalog-warm-up", daemon=True).start()
    sweep_task = asyncio.create_task(_reservation_sweep_loop())
    artwork_task = asyncio.create_task(_artwork_retention_sweep_loop())
    yield
    for task in (sweep_task, artwork_task):
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


app = FastAPI(
    title="Sai Kumar Studio API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)

@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    # Server-side processing time (route handler + DB round trips), exposed so
    # latency testing can separate "backend+DB" time from pure network transit.
    start = time.perf_counter()
    response = await call_next(request)
    response.headers["X-Process-Time-Ms"] = f"{(time.perf_counter() - start) * 1000:.1f}"
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
# Compresses every JSON/text response over 1KB - page_bundle() and friends ship
# a few hundred products' worth of JSON per storefront page load, and gzip
# shrinks that ~70-80% for free on any client that sends Accept-Encoding: gzip
# (every browser).
app.add_middleware(GZipMiddleware, minimum_size=1000)


@app.exception_handler(DataError)
async def data_error_handler(request: Request, exc: DataError):
    # Every primary key in this schema is a Postgres UUID column. A path/query
    # param that isn't a well-formed UUID (garbage input, a stale/corrupted
    # localStorage id, a scanner probing the API) makes psycopg2 raise this
    # deep inside the query - it's a malformed-identifier request, not a server
    # fault, so it must not surface as an unhandled 500.
    return JSONResponse(status_code=400, content={"detail": "Invalid identifier"})


def _service_unavailable(request: Request, exc: Exception, reason: str) -> JSONResponse:
    # Neither of the two conditions below is a bug in the request, and neither is
    # permanent, so neither may surface to a customer mid-checkout as a bare 500
    # with no guidance. 503 + Retry-After says "try again shortly", which is both
    # accurate and what a browser/proxy/monitor already knows how to act on.
    # Logged at error level because a sustained run of these is a capacity
    # problem worth alerting on.
    logger.error("Database %s for %s %s", reason, request.method, request.url.path, exc_info=True)
    return JSONResponse(
        status_code=503,
        content={"detail": "The service is briefly unavailable. Please try again in a moment."},
        headers={"Retry-After": "5"},
    )


@app.exception_handler(OperationalError)
async def operational_error_handler(request: Request, exc: OperationalError):
    # The database was unreachable or refused the connection outright - most often
    # the hosted pooler's client limit being hit (EMAXCONNSESSION; see
    # database.py's pool sizing comment), otherwise a transient network blip.
    return _service_unavailable(request, exc, "unavailable")


@app.exception_handler(PoolTimeoutError)
async def pool_timeout_handler(request: Request, exc: PoolTimeoutError):
    """Every connection in this process's own pool was busy and none freed up
    within pool_timeout, so SQLAlchemy gave up waiting.

    This needs its own handler because sqlalchemy.exc.TimeoutError is NOT a
    subclass of OperationalError - they share only SQLAlchemyError - so the
    handler above never saw it. The two failure modes look identical to a
    customer but are genuinely different: OperationalError means the pooler
    refused us a connection, this means we were rate-limited by our own pool
    while under more concurrent load than it is sized for. Both are transient
    and both deserve a 503 rather than a 500."""
    return _service_unavailable(request, exc, "pool exhausted")


app.include_router(auth.router)
app.include_router(catalog.router)
app.include_router(catalog.reviews_router)
app.include_router(bookings.router)
app.include_router(contact.router)
app.include_router(addresses.router)
app.include_router(cart.router)
app.include_router(wishlist.router)
app.include_router(notifications.router)
app.include_router(orders.router)
app.include_router(payments.router)
app.include_router(uploads.router)
app.include_router(admin.router)
app.include_router(analytics.router)

if ADMIN_DIR.exists():
    app.mount("/admin", StaticFiles(directory=ADMIN_DIR, html=True), name="admin")


class CachedStaticFiles(StaticFiles):
    """/media filenames are random tokens minted fresh per upload (media.py's
    secrets.token_hex) - a given URL's content never changes, so it's safe to tell
    browsers/CDNs to cache it forever instead of revalidating on every repeat view."""

    async def get_response(self, path: str, scope: Scope) -> Response:
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


MEDIA_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/media", CachedStaticFiles(directory=MEDIA_DIR), name="media")


@app.get("/api/health")
def health(response: Response):
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        response.status_code = 503
        return {"status": "error", "detail": "database unreachable"}
    return {"status": "ok"}
