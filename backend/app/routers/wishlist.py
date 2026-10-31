from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import User, WishlistItem
from ..schemas import WishlistItemOut, WishlistSyncIn, WishlistSyncOut

router = APIRouter(prefix="/api/wishlist", tags=["wishlist"])


def _to_out(row: WishlistItem) -> WishlistItemOut:
    return WishlistItemOut(
        key=row.item_key, product_id=row.product_id, name=row.name, price=row.price, img=row.img,
        url=row.url,
    )


def _items_for(db: Session, user: User) -> list[WishlistItem]:
    return (
        db.query(WishlistItem)
        .filter(WishlistItem.user_id == user.id)
        .order_by(WishlistItem.created_at.desc())
        .all()
    )


@router.get("", response_model=WishlistSyncOut)
def get_wishlist(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return WishlistSyncOut(items=[_to_out(r) for r in _items_for(db, user)])


@router.put("", response_model=WishlistSyncOut)
def sync_wishlist(body: WishlistSyncIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Replaces the stored wishlist with exactly what the client sends, the same
    contract PUT /api/cart uses. Saving is login-gated in the browser, so the
    client always holds the full list for the signed-in account before calling
    this - it persists what it's handed rather than diffing.

    Rows that survive the sync keep their original id/created_at so the
    newest-first ordering above stays stable instead of resetting on every save."""
    existing = {row.item_key: row for row in _items_for(db, user)}
    seen: set[str] = set()

    for item in body.items:
        if item.key in seen:
            continue  # the client's wishlist is keyed by item_key; ignore any duplicate
        seen.add(item.key)
        row = existing.get(item.key)
        if row is None:
            db.add(WishlistItem(
                user_id=user.id, item_key=item.key, product_id=item.product_id,
                name=item.name, price=item.price, img=item.img, url=item.url,
            ))
        else:
            row.product_id = item.product_id
            row.name = item.name
            row.price = item.price
            row.img = item.img
            row.url = item.url

    for key, row in existing.items():
        if key not in seen:
            db.delete(row)

    db.commit()
    return WishlistSyncOut(items=[_to_out(r) for r in _items_for(db, user)])


@router.delete("/items/{item_key:path}", status_code=status.HTTP_204_NO_CONTENT)
def remove_wishlist_item(item_key: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(WishlistItem).filter(
        WishlistItem.user_id == user.id, WishlistItem.item_key == item_key
    ).delete()
    db.commit()


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def clear_wishlist(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(WishlistItem).filter(WishlistItem.user_id == user.id).delete()
    db.commit()
