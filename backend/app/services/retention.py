"""Retention and deletion of customer-uploaded order artwork.

A customer's uploaded photo is personal data we hold only because we needed it
to produce their order. Once the order is delivered and the return/complaint
window has passed, keeping it is a liability rather than an asset - so every
file gets a deletion date the moment its order is marked delivered, and a sweep
removes it from R2 when that date arrives.

The policy, in one place:

  * The clock starts on DELIVERY, not on order date or payment. Production,
    shipping and a delayed delivery all extend the life of the file naturally,
    because none of them start the clock.
  * The window defaults to 15 days after delivery and is configurable by the
    owner (Setting key "order_artwork_retention_days"), because the right
    number is a business decision about reprints and disputes, not a constant.
  * Admin can hold any file indefinitely (purge_hold). A reprint, a damaged
    delivery or a dispute has to outlive the window, and that decision must
    survive the automatic sweep.
  * Cancelled and refunded orders get the same treatment as delivered ones -
    those files will never be printed, so holding them has even less purpose.
  * Uploads that never became an order (the customer attached a photo and left)
    are deleted after a short orphan window. Without this the bucket
    accumulates every photo anyone ever picked, forever.
  * Deleting the file does NOT delete the row. The CustomerUpload record stays,
    with purged_at set, so the order's history still shows that artwork existed
    and when it was removed. An order whose artwork is gone must not look like
    an order that never had any.
"""
import logging
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..models import CustomerUpload, Order, Setting
from .storage import delete_object

logger = logging.getLogger("retention")

RETENTION_SETTING_KEY = "order_artwork_retention_days"
DEFAULT_RETENTION_DAYS = 15

# An upload that never reached checkout. Long enough that someone can fill a
# form, wander off, and come back the next day to a cart that still works;
# short enough that abandoned photos don't pile up indefinitely.
ORPHAN_RETENTION_DAYS = 7

# Statuses that mean the artwork has done its job. "delivered" is the normal
# path; a cancelled or refunded order will never be produced at all.
TERMINAL_STATUSES = ("delivered", "cancelled", "refunded")


def get_retention_days(db: Session) -> int:
    """The configured window, or the default. Clamped to at least 1 day: a value
    of 0 would make artwork eligible for deletion the same day it is delivered,
    before anyone could act on a delivery complaint."""
    row = db.query(Setting).filter(Setting.key == RETENTION_SETTING_KEY).first()
    try:
        value = int((row.value or {}).get("days")) if row else DEFAULT_RETENTION_DAYS
    except (TypeError, ValueError):
        value = DEFAULT_RETENTION_DAYS
    return max(1, value)


def schedule_order_artwork_purge(db: Session, order: Order, *, days: int | None = None) -> int:
    """Give every file attached to `order` a deletion date, counted from today.

    Called when an order reaches a terminal status. Returns how many files were
    scheduled. Does not commit - the caller is already inside a transaction that
    is changing the order's status, and the two belong together.

    Files already on hold are skipped: an admin decision to keep artwork must
    not be undone by a later status change. Files already purged are skipped
    too, so re-running this is harmless.
    """
    if days is None:
        days = get_retention_days(db)
    purge_after = date.today() + timedelta(days=days)

    uploads = db.query(CustomerUpload).filter(
        CustomerUpload.order_id == order.id,
        CustomerUpload.purged_at.is_(None),
        CustomerUpload.purge_hold.is_(False),
    ).all()
    for upload in uploads:
        upload.purge_after = purge_after
    if uploads:
        logger.info(
            "Scheduled %d artwork file(s) of order %s for deletion on %s",
            len(uploads), order.order_number, purge_after,
        )
    return len(uploads)


def link_uploads_to_order(db: Session, order: Order, urls: list[str]) -> int:
    """Attach the CustomerUpload rows behind `urls` to a newly placed order.

    Until this runs an upload is an orphan, on the short orphan clock. Matching
    is by URL because that is all the cart carries - the browser never sees the
    storage key. Only unattached rows are claimed, so a URL that somehow appears
    in two orders cannot move the file from the first one.
    """
    urls = [u for u in urls if isinstance(u, str) and u]
    if not urls:
        return 0
    uploads = db.query(CustomerUpload).filter(
        CustomerUpload.url.in_(urls),
        CustomerUpload.order_id.is_(None),
    ).all()
    for upload in uploads:
        upload.order_id = order.id
        # Back on the shelf: it now lives or dies with the order, so the orphan
        # clock no longer applies.
        upload.purge_after = None
    return len(uploads)


def purge_due_artwork(db: Session, *, limit: int = 200, today: date | None = None) -> dict:
    """Delete every file whose purge date has arrived, plus expired orphans.

    Batched (`limit`) so one sweep can't spend minutes inside a single
    transaction if a backlog ever builds up; the next run picks up the rest.
    Each file is deleted from R2 first and the row marked only if that
    succeeded, so a transient R2 failure leaves the row due and it is retried
    next time rather than being recorded as purged while the object survives.

    Returns counts for logging and for the admin screen.
    """
    today = today or date.today()
    orphan_cutoff = datetime.now(timezone.utc) - timedelta(days=ORPHAN_RETENTION_DAYS)

    due = db.query(CustomerUpload).filter(
        CustomerUpload.purged_at.is_(None),
        CustomerUpload.purge_hold.is_(False),
        or_(
            # Scheduled by a terminal order status.
            CustomerUpload.purge_after.isnot(None) & (CustomerUpload.purge_after <= today),
            # Never made it into an order and has sat around past the grace period.
            CustomerUpload.order_id.is_(None) & (CustomerUpload.created_at < orphan_cutoff),
        ),
    ).limit(limit).all()

    purged = failed = 0
    for upload in due:
        if delete_object(upload.storage_key):
            upload.purged_at = datetime.now(timezone.utc)
            purged += 1
        else:
            failed += 1
    if purged or failed:
        db.commit()
        logger.info("Artwork sweep: %d purged, %d failed", purged, failed)
    return {"purged": purged, "failed": failed, "considered": len(due)}


def purge_uploads_now(db: Session, uploads: list[CustomerUpload]) -> dict:
    """Delete specific files immediately, ignoring their schedule and hold flag.

    This is the admin's explicit "delete this now" - a customer exercising a
    right to erasure, or artwork that plainly should not have been uploaded.
    Because it overrides the hold, it is only reachable from an owner-gated
    endpoint.
    """
    purged = failed = 0
    for upload in uploads:
        if upload.purged_at:
            continue
        if delete_object(upload.storage_key):
            upload.purged_at = datetime.now(timezone.utc)
            purged += 1
        else:
            failed += 1
    if purged or failed:
        db.commit()
    return {"purged": purged, "failed": failed}
