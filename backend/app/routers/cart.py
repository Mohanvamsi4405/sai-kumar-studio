from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import CartItem, User
from ..schemas import CartItemOut, CartSyncIn, CartSyncOut

router = APIRouter(prefix="/api/cart", tags=["cart"])


def _to_out(row: CartItem) -> CartItemOut:
    return CartItemOut(
        key=row.item_key, product_id=row.product_id, name=row.name, price=row.price, img=row.img,
        qty=row.qty, url=row.url, customization=row.customization, requirement=row.requirement,
    )


@router.get("", response_model=CartSyncOut)
def get_cart(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.query(CartItem).filter(CartItem.user_id == user.id).all()
    return CartSyncOut(items=[_to_out(r) for r in rows])


@router.put("", response_model=CartSyncOut)
def sync_cart(body: CartSyncIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Replaces the stored cart with exactly what the client sends. The browser
    is responsible for merging local + server state before calling this (see
    cart.js mergeCarts) - this endpoint just persists whatever full cart it's
    handed, it doesn't diff against what's already stored."""
    db.query(CartItem).filter(CartItem.user_id == user.id).delete()
    for item in body.items:
        db.add(CartItem(
            user_id=user.id, item_key=item.key, product_id=item.product_id, name=item.name, price=item.price,
            img=item.img, qty=item.qty, url=item.url, customization=item.customization,
            requirement=item.requirement,
        ))
    db.commit()
    rows = db.query(CartItem).filter(CartItem.user_id == user.id).all()
    return CartSyncOut(items=[_to_out(r) for r in rows])


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def clear_cart(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.query(CartItem).filter(CartItem.user_id == user.id).delete()
    db.commit()
