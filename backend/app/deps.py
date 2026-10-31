from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .database import get_db
from .models import AuditLog, BlockedEmail, User
from .security import decode_token

bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    payload = decode_token(creds.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = db.get(User, payload["sub"])
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or disabled")
    # Blocking an email used to gate only the login endpoints (see routers/auth.py),
    # so an access token already issued to that address kept working for the rest of
    # its lifetime - up to access_token_minutes, which is half a day by default.
    # Staff blocking someone abusive reasonably expect it to take effect now, not at
    # the next login they were never going to make, so the block is enforced on every
    # authenticated request too.
    if db.query(BlockedEmail).filter(BlockedEmail.email == user.email).first():
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This account has been blocked")
    return user


def require_staff(user: User = Depends(get_current_user)) -> User:
    if user.role not in ("staff", "owner"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user


def require_owner(user: User = Depends(get_current_user)) -> User:
    if user.role != "owner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Owner access required")
    return user


def audit(db: Session, user: User | None, action: str, entity: str,
          entity_id: str | None = None, detail: dict | None = None,
          request: Request | None = None):
    db.add(AuditLog(
        user_id=user.id if user else None,
        action=action,
        entity=entity,
        entity_id=entity_id,
        detail=detail or {},
        ip=request.client.host if request and request.client else None,
    ))
