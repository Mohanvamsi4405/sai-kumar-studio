"""Customer artwork upload.

The storefront calls this when a customer adds a customised product to the cart
(or hits Buy Now), and puts the returned URL in the cart line. Picking the file
itself sends nothing - the File is held in memory until one of those buttons is
pressed, so a customer who browses away never uploads anything. Before this existed the photo was
carried as a base64 data: URI: held in localStorage (whose ~5MB quota a single
large photo could exhaust, making "Add to cart" fail outright), re-sent to the
server in full on every cart change, and stored in cart_items.customization as
text until a post-checkout background task moved it to R2.

Uploading here instead means the cart carries roughly a hundred characters
instead of several megabytes, the customer's file reaches production at full
quality rather than being downscaled to fit a browser limit, and every file has
a database row from birth - which is what makes deleting it later possible at
all (see services/retention.py).
"""
import logging

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import CustomerUpload, User
from ..services.media import MAX_SIZE
from ..services.storage import storage_configured, upload_customer_artwork

router = APIRouter(prefix="/api/uploads", tags=["uploads"])
logger = logging.getLogger(__name__)

# A logged-in customer may have a lot of legitimate photos on one order (a photo
# book, a "64 photos" print pack), so this is deliberately generous. It exists to
# stop a single account filling the bucket, not to police normal ordering.
MAX_PENDING_UPLOADS_PER_USER = 200


@router.post("/artwork", status_code=status.HTTP_201_CREATED)
def upload_artwork(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Store one customer photo and return its URL for the cart line.

    Authenticated: an anonymous endpoint that writes to object storage is an
    open file host, and orders require an account anyway (Order.user_id is not
    nullable), so there is no flow that needs this before sign-in.
    """
    if not storage_configured():
        # Without R2 there is nowhere to put the file. Say so plainly rather than
        # half-succeeding - the storefront falls back to the inline base64 path,
        # which still works for small photos.
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Photo storage is not configured on this server"
        )

    data = file.file.read(MAX_SIZE + 1)
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That file is empty")
    if len(data) > MAX_SIZE:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"That photo is larger than {MAX_SIZE // (1024 * 1024)}MB - please choose a smaller one",
        )

    pending = db.query(CustomerUpload).filter(
        CustomerUpload.user_id == user.id,
        CustomerUpload.order_id.is_(None),
        CustomerUpload.purged_at.is_(None),
    ).count()
    if pending >= MAX_PENDING_UPLOADS_PER_USER:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many photos are waiting on unfinished orders. Please complete or clear your cart first.",
        )

    try:
        result = upload_customer_artwork(data)
    except ValueError as e:
        # process_image's own message - "Image too large", an unsupported format,
        # or not a decodable image at all. Safe and useful to show the customer.
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    if not result:
        logger.warning("Customer artwork upload failed for user %s", user.id)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Could not store that photo - please try again")

    url, key, content_type, size = result
    row = CustomerUpload(
        user_id=user.id,
        storage_key=key,
        url=url,
        content_type=content_type,
        bytes=size,
        original_filename=(file.filename or "")[:300] or None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "url": row.url, "bytes": row.bytes, "content_type": row.content_type}
