"""Read-only counts over existing tables, for dashboards and the MCP server
(see ../../mcp_server). Login and activity figures come from audit_log, so they
only cover what the app already audits: logins/signups/logouts and staff
changes. Customer browsing and cart activity are not recorded anywhere."""
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import require_owner, require_staff
from ..models import AuditLog, Booking, Category, Order, Product, SitePage, User

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

# The business runs on Indian time; "today" means the IST calendar day.
IST = timezone(timedelta(hours=5, minutes=30))
LOGIN_ACTIONS = ("login", "signup", "admin_login")
PAID_STATUSES = ("cod_confirmed", "paid", "in_production", "shipped", "delivered")
MAX_DAYS = 366


def _window(day: date | None, days: int) -> tuple[datetime, datetime, dict]:
    if not 1 <= days <= MAX_DAYS:
        raise HTTPException(422, f"days must be between 1 and {MAX_DAYS}")
    end_day = day or datetime.now(IST).date()
    start_day = end_day - timedelta(days=days - 1)
    start = datetime.combine(start_day, time.min, IST)
    end = datetime.combine(end_day + timedelta(days=1), time.min, IST)
    return start, end, {"from": start_day.isoformat(), "to": end_day.isoformat(), "days": days, "timezone": "Asia/Kolkata"}


def _by_status(db: Session, model, start: datetime, end: datetime) -> dict[str, int]:
    rows = (
        db.query(model.status, func.count())
        .filter(model.created_at >= start, model.created_at < end)
        .group_by(model.status).all()
    )
    return {status: n for status, n in rows}


def _orders(db: Session, start: datetime, end: datetime) -> dict:
    in_range = (Order.created_at >= start, Order.created_at < end)
    by_status = _by_status(db, Order, start, end)
    revenue = db.query(func.coalesce(func.sum(Order.total), 0)).filter(
        *in_range, Order.status.in_(PAID_STATUSES)).scalar()
    customers = db.query(func.count(func.distinct(Order.user_id))).filter(*in_range).scalar()
    return {
        "count": sum(by_status.values()),
        "paid_or_confirmed": sum(n for s, n in by_status.items() if s in PAID_STATUSES),
        "by_status": by_status,
        "revenue_paid": float(revenue),
        "unique_customers": customers,
        "all_time_total": db.query(func.count(Order.id)).scalar(),
    }


def _bookings(db: Session, start: datetime, end: datetime) -> dict:
    by_status = _by_status(db, Booking, start, end)
    advance = db.query(func.coalesce(func.sum(Booking.advance_paid), 0)).filter(
        Booking.created_at >= start, Booking.created_at < end).scalar()
    return {
        "count": sum(by_status.values()),
        "by_status": by_status,
        "advance_paid": float(advance),
        "all_time_total": db.query(func.count(Booking.id)).scalar(),
    }


def _products(db: Session, start: datetime, end: datetime, limit: int) -> dict:
    q = (
        db.query(Product.id, Product.title, Product.price, Product.created_at,
                 Category.name.label("category"), SitePage.slug.label("page"))
        .join(Category, Product.category_id == Category.id)
        .join(SitePage, Category.page_id == SitePage.id)
        .filter(Product.created_at >= start, Product.created_at < end)
    )
    count = q.count()
    rows = q.order_by(Product.created_at.desc()).limit(limit).all()
    by_page: dict[str, int] = {}
    for page, n in (
        db.query(SitePage.slug, func.count(Product.id))
        .join(Category, Category.page_id == SitePage.id)
        .join(Product, Product.category_id == Category.id)
        .filter(Product.created_at >= start, Product.created_at < end)
        .group_by(SitePage.slug).all()
    ):
        by_page[page] = n
    return {
        "count": count,
        "by_page": by_page,
        "products": [
            {"id": r.id, "title": r.title, "price": float(r.price), "category": r.category,
             "page": r.page, "created_at": r.created_at.isoformat()}
            for r in rows
        ],
        "all_time_total": db.query(func.count(Product.id)).scalar(),
    }


def _logins(db: Session, start: datetime, end: datetime) -> dict:
    in_range = (AuditLog.created_at >= start, AuditLog.created_at < end)
    by_action = dict(
        db.query(AuditLog.action, func.count())
        .filter(*in_range, AuditLog.action.in_(LOGIN_ACTIONS))
        .group_by(AuditLog.action).all()
    )
    unique_users = db.query(func.count(func.distinct(AuditLog.user_id))).filter(
        *in_range, AuditLog.action.in_(LOGIN_ACTIONS)).scalar()
    return {
        "count": sum(by_action.values()),
        "unique_users": unique_users,
        "customer_logins": by_action.get("login", 0),
        "new_signups": by_action.get("signup", 0),
        "staff_logins": by_action.get("admin_login", 0),
        "logouts": db.query(func.count(AuditLog.id)).filter(*in_range, AuditLog.action == "logout").scalar(),
    }


def _action_counts(db: Session, start: datetime, end: datetime) -> list[dict]:
    rows = (
        db.query(AuditLog.action, AuditLog.entity, func.count())
        .filter(AuditLog.created_at >= start, AuditLog.created_at < end)
        .group_by(AuditLog.action, AuditLog.entity)
        .order_by(func.count().desc()).all()
    )
    return [{"action": a, "entity": e, "count": n} for a, e, n in rows]


@router.get("/summary")
def summary(day: date | None = Query(None, alias="date"), days: int = 1,
            owner: User = Depends(require_owner), db: Session = Depends(get_db)):
    """Everything in one call: orders, bookings, new products, logins, actions."""
    start, end, period = _window(day, days)
    return {
        "period": period,
        "orders": _orders(db, start, end),
        "bookings": _bookings(db, start, end),
        "products_added": _products(db, start, end, limit=20),
        "logins": _logins(db, start, end),
        "actions": _action_counts(db, start, end),
    }


@router.get("/orders")
def orders(day: date | None = Query(None, alias="date"), days: int = 1,
           staff: User = Depends(require_staff), db: Session = Depends(get_db)):
    start, end, period = _window(day, days)
    return {"period": period, **_orders(db, start, end)}


@router.get("/bookings")
def bookings(day: date | None = Query(None, alias="date"), days: int = 1,
             staff: User = Depends(require_staff), db: Session = Depends(get_db)):
    start, end, period = _window(day, days)
    return {"period": period, **_bookings(db, start, end)}


@router.get("/products")
def products_added(day: date | None = Query(None, alias="date"), days: int = 1,
                   limit: int = Query(50, ge=1, le=500),
                   staff: User = Depends(require_staff), db: Session = Depends(get_db)):
    start, end, period = _window(day, days)
    return {"period": period, **_products(db, start, end, limit)}


@router.get("/logins")
def logins(day: date | None = Query(None, alias="date"), days: int = 1,
           owner: User = Depends(require_owner), db: Session = Depends(get_db)):
    start, end, period = _window(day, days)
    return {"period": period, **_logins(db, start, end)}


@router.get("/actions")
def actions(day: date | None = Query(None, alias="date"), days: int = 1,
            action: str | None = None, entity: str | None = None, user_email: str | None = None,
            limit: int = Query(100, ge=1, le=500), offset: int = Query(0, ge=0),
            owner: User = Depends(require_owner), db: Session = Depends(get_db)):
    """Audit-log entries with the acting user's email/name/role, newest first."""
    start, end, period = _window(day, days)
    q = (
        db.query(AuditLog, User.email, User.name, User.role)
        .outerjoin(User, AuditLog.user_id == User.id)
        .filter(AuditLog.created_at >= start, AuditLog.created_at < end)
    )
    if action:
        q = q.filter(AuditLog.action == action)
    if entity:
        q = q.filter(AuditLog.entity == entity)
    if user_email:
        q = q.filter(User.email == user_email.lower().strip())
    total = q.count()
    rows = q.order_by(AuditLog.created_at.desc()).offset(offset).limit(limit).all()
    return {
        "period": period,
        "total": total,
        "offset": offset,
        "counts": _action_counts(db, start, end),
        "entries": [
            {"at": log.created_at.isoformat(), "action": log.action, "entity": log.entity,
             "entity_id": log.entity_id, "user_email": email, "user_name": name, "user_role": role,
             "detail": log.detail, "ip": log.ip}
            for log, email, name, role in rows
        ],
    }
