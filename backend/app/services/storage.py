"""Uploads customer-provided checkout files (customization photos/logos) and admin Media
Library images to Cloudflare R2 instead of embedding them as base64 inside product_snapshot
or writing them to this server's local disk.

Storefront pages (gifts.js/studio.js/corporate.js) still capture the upload as a data: URI
client-side for the live preview - that part is unchanged. This module intercepts it once, at
checkout, and swaps the base64 for a small R2 URL before it's ever written to Postgres. If the
upload fails for any reason (R2 misconfigured, network error) the caller keeps the original
base64 inline - checkout must never fail because of this.

R2 is a flat key -> object store (no folders, no auto-generated unique filenames like
Cloudinary gave us) - object keys below mirror the same "sai_kumar_studio/..." layout the
Cloudinary account used, with a uuid4 appended so concurrent uploads never collide.
"""
import hashlib
import io
import logging
import re
import threading
import time
import uuid

import boto3
import httpx
from botocore.config import Config as BotoConfig

from ..config import get_settings
from .media import make_thumbnail, process_image

logger = logging.getLogger("storage")
settings = get_settings()

# A cheap guard on the *estimated* decoded size of an incoming data: URI, so a
# huge base64 string is dropped before being decoded into memory. Deliberately
# above media.MAX_SIZE rather than equal to it: a photo right at the real cap
# would otherwise trip this first, and a rejection here is a silent None (the
# caller keeps the base64 inline) rather than process_image's clear "Image too
# large" - so the headroom leaves the real limit to the validator that can
# explain itself.
MAX_UPLOAD_BYTES = 24 * 1024 * 1024

# The customization keys storefront pages use for an uploaded photo/logo -
# mirrored in admin/js/orders.js's CUSTOM_IMAGE_FIELDS and admin.py's import
# of this constant, so there's one source of truth.
CUSTOM_UPLOAD_FIELDS = ("photoData", "logoData", "imageData", "artworkData")

_client = None


def storage_configured() -> bool:
    return settings.r2_configured


def ensure_storage_ready() -> None:
    """R2 has no bucket to pre-create here (the bucket itself is created once in the
    Cloudflare dashboard) - kept as a no-op call site so main.py's startup hook doesn't
    need to change if this changes again."""
    return


def _client_once():
    global _client
    if _client is None:
        _client = boto3.client(
            "s3",
            endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
            aws_access_key_id=settings.r2_access_key,
            aws_secret_access_key=settings.r2_secret_key,
            region_name="auto",
            config=BotoConfig(signature_version="s3v4"),
        )
    return _client


def _put_object(data: bytes, key: str, content_type: str) -> str | None:
    try:
        _client_once().put_object(
            Bucket=settings.r2_bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        return f"{settings.r2_public_base_url}/{key}"
    except Exception as e:
        logger.warning("R2 upload failed: %s", e)
        return None


def upload_customer_artwork(data: bytes, subfolder: str = "") -> tuple[str, str, str, int] | None:
    """Validate and store one customer-supplied photo, returning
    (public_url, storage_key, content_type, bytes) - or None if R2 isn't
    configured or the upload fails. Raises ValueError (from process_image) if
    the bytes aren't a valid, allowed image, so the caller can tell the
    customer why rather than failing silently.

    Unlike upload_data_uri() this takes raw bytes, because it runs at the moment
    the customer picks the file rather than at checkout - there's no base64 step
    any more (see models.CustomerUpload for why that matters).

    The key is returned alongside the URL because this file is deleted later:
    order artwork is kept only while it's needed, and the caller records the key
    on a CustomerUpload row so the object can actually be found again. Keys are
    datestamped rather than grouped by order because at upload time there is no
    order yet - the customer is still shopping.
    """
    if not storage_configured():
        return None
    # Pillow decode / format allowlist / re-encode, same as every other upload
    # path here. This is untrusted input straight off a customer's device.
    data, ext, content_type = process_image(data)
    prefix = f"{subfolder}/" if subfolder else ""
    key = f"{settings.cloudinary_folder}/customer_uploads/{prefix}{uuid.uuid4().hex}{ext}"
    url = _put_object(data, key, content_type)
    if not url:
        return None
    return url, key, content_type, len(data)


def delete_object(key: str) -> bool:
    """Remove one object from R2 by key. True when R2 reports it gone (deleting a
    key that no longer exists is also a success - the desired end state is the
    same, and a retention sweep must not stall forever on an object someone
    already removed by hand in the Cloudflare console)."""
    if not storage_configured() or not key:
        return False
    try:
        _client_once().delete_object(Bucket=settings.r2_bucket, Key=key)
        return True
    except Exception as e:
        logger.warning("R2 delete failed for %s: %s", key, e)
        return False


def upload_data_uri(data_uri: str, subfolder: str) -> str | None:
    """Uploads a data: URI to R2, returning the public URL - or None if it isn't a
    data: URI, R2 isn't configured, the upload fails, or (see process_image() below)
    it isn't actually a valid image, in which case the caller falls back to keeping
    the original base64 inline (never served back out as a URL, so an invalid/bogus
    upload never reaches the public CDN)."""
    if not storage_configured() or not isinstance(data_uri, str) or not data_uri.startswith("data:"):
        return None
    try:
        header, b64data = data_uri.split(",", 1)
    except ValueError:
        return None
    approx_bytes = len(b64data) * 3 // 4
    if approx_bytes == 0 or approx_bytes > MAX_UPLOAD_BYTES:
        return None

    import base64
    try:
        data = base64.b64decode(b64data)
    except Exception:
        return None

    # Same Pillow-based decode/format-allowlist/re-encode admin Media Library uploads
    # go through (services/media.py) - a customer's checkout upload is untrusted input
    # too, and previously only had its declared data: header string-matched (not its
    # actual bytes validated) before being written to the public R2 bucket under
    # whatever content-type that guess produced.
    try:
        data, ext, content_type = process_image(data)
    except Exception as e:
        logger.warning("Checkout upload rejected (not a valid image): %s", e)
        return None

    key = f"{settings.cloudinary_folder}/order_uploads/{subfolder}/{uuid.uuid4().hex}{ext}"
    return _put_object(data, key, content_type)


def _object_exists(key: str) -> bool:
    try:
        _client_once().head_object(Bucket=settings.r2_bucket, Key=key)
        return True
    except Exception:
        return False


# Every call still checks R2 (a real network round trip, ~300ms even on a cache hit)
# unless memoized here - without this, catalog.py's page_bundle() re-doing that
# head_object for the same handful of hundred Category/Product images on every
# cache-refresh (let alone the full sweep warm_catalog_cache() does at startup)
# adds minutes of pure network wait for no reason, since within one process
# lifetime the answer for a given (url, width, quality) never changes.
_thumb_url_cache: dict[str, str | None] = {}

# Card / listing thumbnails. 800px at q82 rather than the old 640px at q75: a
# card is ~300-400 CSS px wide, i.e. 600-800 real pixels on a phone or laptop
# with a 2x screen, so 640px was being upscaled there and looked soft. Large
# views (banners, detail galleries, the zoom viewer) use the original instead.
# Changing either value gives every thumbnail a new cache key, so they are all
# regenerated once (warm_thumbnails() at startup does that up front).
THUMB_WIDTH = 800
THUMB_QUALITY = 82
_thumb_cache_lock = threading.Lock()


# A failed thumbnail is retried after this long rather than remembered as failed
# for the life of the process - a dropped connection on one large original
# would otherwise leave that card loading the full multi-MB file until restart.
_THUMB_RETRY_AFTER = 600  # seconds
_thumb_failed_at: dict[str, float] = {}


def _fetch_and_upload_thumbnail(url: str, key: str, width: int, quality: int) -> str | None:
    # Originals are stored untouched now (several MB each), and R2's public
    # endpoint occasionally drops a long download part-way - one quick retry
    # covers that without making a genuinely missing file slow.
    resp = None
    for attempt in (1, 2):
        try:
            resp = httpx.get(url, timeout=30, follow_redirects=True)
            resp.raise_for_status()
            break
        except Exception as e:
            if attempt == 2:
                logger.warning("Thumbnail source fetch failed for %s: %s", url, e)
                return None

    try:
        thumb_bytes = make_thumbnail(resp.content, width=width, quality=quality)
    except Exception as e:
        logger.warning("Thumbnail generation failed for %s: %s", url, e)
        return None

    return _put_object(thumb_bytes, key, "image/webp")


_bg_thumb_pool = None
_bg_thumb_pending: set[str] = set()


def _queue_thumbnail(url: str, width: int, quality: int, cache_key: str) -> None:
    """Checks/creates one thumbnail on a small background pool, once per key at a time."""
    global _bg_thumb_pool
    from concurrent.futures import ThreadPoolExecutor
    with _thumb_cache_lock:
        if cache_key in _bg_thumb_pending:
            return
        _bg_thumb_pending.add(cache_key)
        if _bg_thumb_pool is None:
            _bg_thumb_pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="thumb-bg")

    def run():
        try:
            get_or_create_thumbnail(url, width=width, quality=quality)
        finally:
            with _thumb_cache_lock:
                _bg_thumb_pending.discard(cache_key)
    _bg_thumb_pool.submit(run)


def get_or_create_thumbnail(url: str, width: int = THUMB_WIDTH, quality: int = THUMB_QUALITY,
                            wait: bool = True) -> str | None:
    """Resizes an already-hosted (R2) image to a small WebP thumbnail with Pillow and
    caches it permanently in R2 under a key derived from (url, width, quality) - the
    self-hosted replacement for routing every card/thumbnail through images.weserv.nl.

    A given thumbnail is only ever generated once: every call after the first just
    confirms the cached object exists (one cheap head_object) and returns its URL
    unchanged, so repeat page loads pay for a plain R2 fetch - no per-request network
    hop to a third party, no per-request Pillow work. Returns None (caller falls back
    to the original url) if R2 isn't configured, the source can't be fetched, or
    Pillow can't decode it - this must never be the reason an image fails to load.

    wait=False (storefront page requests, via catalog.cld_optimize) never blocks on
    R2: a thumbnail not already confirmed in this process's memo returns None at once
    - the page ships the original image - and is checked/created on a background
    pool. Waiting here made a page build pay one R2 round trip per unconfirmed image,
    plus a full fetch+resize+upload per missing one; after every image URL changed
    at once (the move to a new R2 folder, Oct 2026) the photography catalog took
    minutes. warm_catalog_cache() fills the memo at startup, so this only matters
    until it finishes."""
    if not storage_configured():
        return None

    cache_key = f"{url}|{width}|{quality}"
    with _thumb_cache_lock:
        if cache_key in _thumb_url_cache:
            return _thumb_url_cache[cache_key]
        failed_at = _thumb_failed_at.get(cache_key)
        if failed_at and time.monotonic() - failed_at < _THUMB_RETRY_AFTER:
            return None
    if not wait:
        _queue_thumbnail(url, width, quality, cache_key)
        return None

    digest = hashlib.sha1(cache_key.encode()).hexdigest()
    key = f"{settings.cloudinary_folder}/thumb_cache/{digest}.webp"

    if _object_exists(key):
        result = f"{settings.r2_public_base_url}/{key}"
    else:
        result = _fetch_and_upload_thumbnail(url, key, width, quality)

    with _thumb_cache_lock:
        if result:
            _thumb_url_cache[cache_key] = result
            _thumb_failed_at.pop(cache_key, None)
        else:
            _thumb_failed_at[cache_key] = time.monotonic()
    return result


def warm_thumbnails(urls: list[str], width: int = THUMB_WIDTH, quality: int = THUMB_QUALITY, max_workers: int = 24) -> None:
    """Pre-populates both the R2 thumbnail cache and the in-process memo above for many
    URLs at once, using a thread pool since each is a blocking network call (head_object,
    and on a miss, an httpx fetch + upload) - the same work get_or_create_thumbnail() would
    do one at a time, just concurrently instead of paying N sequential round trips.
    Best-effort: a failure for one URL just means that image falls back to its original,
    non-optimized url the first time it's actually requested."""
    if not storage_configured() or not urls:
        return
    from concurrent.futures import ThreadPoolExecutor

    unique = [u for u in dict.fromkeys(urls) if u]
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        list(pool.map(lambda u: get_or_create_thumbnail(u, width=width, quality=quality), unique))


_SLUG_SAFE = re.compile(r"[^a-z0-9_-]+")


def _safe_slug(value: str | None) -> str | None:
    """Defensively strips anything outside a-z0-9_- from a page/category slug before
    it's spliced into an R2 key - slugs are already DB-controlled, but a key is
    forever (R2 has no rename), so this never trusts caller input for that."""
    if not value:
        return None
    cleaned = _SLUG_SAFE.sub("", value.lower())
    return cleaned or None


def upload_media_library_asset(
    data: bytes,
    page_slug: str | None = None,
    category_slug: str | None = None,
    ext: str = ".webp",
    content_type: str = "image/webp",
) -> str | None:
    """Uploads an admin Media Library asset (already validated/re-encoded by
    services/media.py's process_image, or validated by its process_video) to R2,
    returning its public URL - or None if R2 isn't configured or the upload fails.

    ext/content_type default to the WebP every image upload is re-encoded to; a
    product video passes its own sniffed container/MIME instead, since it is
    stored byte-for-byte (nothing here transcodes video).

    page_slug/category_slug (when the upload happens from a specific product/category's
    media picker) file the object under media_library/<page>/<category>/... instead of
    one flat folder - purely for human browsability in the R2 bucket console, since R2
    keys are flat strings with no real directory semantics (see module docstring). This
    does NOT drive the app's own image queries - those always go through the Media
    table's category_id/product_id columns - so it has no effect on catalog load time.
    Falls back to the flat media_library/ folder when no page/category context is given
    (e.g. an upload from the standalone Media Library page, not tied to one product).

    Unlike upload_data_uri(), there's no local-disk fallback here: this app's
    database is a shared, hosted Postgres instance, so a file saved to one
    environment's disk (a laptop, a deploy) is invisible to every other
    environment reading the same Media row - which is exactly how uploads used
    to go missing. The caller must treat None as a failed upload, not silently
    keep serving a URL nothing backs."""
    if not storage_configured():
        return None
    page_slug = _safe_slug(page_slug)
    category_slug = _safe_slug(category_slug)
    subfolder = f"{page_slug}/{category_slug}/" if page_slug and category_slug else ""
    key = f"{settings.cloudinary_folder}/media_library/{subfolder}{uuid.uuid4().hex}{ext}"
    return _put_object(data, key, content_type)


def purge_unreferenced_uploads(db, urls) -> int:
    """Delete admin-uploaded image files (and their thumbnails) from R2 once nothing
    in the database uses them any more. Called after a media row, product or
    category is deleted - before this, those deletes only removed the database row
    and left every file in the public bucket forever.

    Deliberately narrow, because one file is often used in several places:
      - only files under this app's own <folder>/media_library/ (admin uploads) -
        never the static page assets, which the site's HTML/JS links to directly;
      - only when no other row in any table still contains the URL - another
        product sharing the photo (e.g. a tier copied from another), a category
        image, and past orders' product snapshots / bookings, which keep showing
        the picture in "My Orders". The audit log is history and doesn't count.
    Returns how many files were deleted. Never raises: a leftover file is a storage
    cost, not a broken page."""
    if not storage_configured():
        return 0
    from sqlalchemy import text as sql_text
    prefix = f"{settings.r2_public_base_url}/{settings.cloudinary_folder}/media_library/"
    candidates = {u for u in urls if u and u.startswith(prefix)}
    if not candidates:
        return 0
    deleted = 0
    try:
        columns = db.execute(sql_text(
            "select table_name, column_name from information_schema.columns "
            "where table_schema = current_schema() and table_name <> 'audit_log' "
            "and data_type in ('text', 'character varying', 'json', 'jsonb')"
        )).all()
        for url in candidates:
            in_use = any(
                db.execute(sql_text(f'select 1 from "{t}" where "{c}"::text like :u limit 1'), {"u": f"%{url}%"}).first()
                for t, c in columns
            )
            if in_use:
                continue
            if delete_object(url[len(settings.r2_public_base_url) + 1:]):
                deleted += 1
                cache_key = f"{url}|{THUMB_WIDTH}|{THUMB_QUALITY}"
                digest = hashlib.sha1(cache_key.encode()).hexdigest()
                delete_object(f"{settings.cloudinary_folder}/thumb_cache/{digest}.webp")
                with _thumb_cache_lock:
                    _thumb_url_cache.pop(cache_key, None)
    except Exception:
        logger.warning("Cleaning up deleted uploads failed", exc_info=True)
    return deleted
