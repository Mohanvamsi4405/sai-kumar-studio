"""Readable "what changed" lines for audit_log entries.

Before this, an admin update was logged as just {"title": ...}: the log said
*that* a product was saved but not what was changed, so when the collage
frame's upload question kept reverting to single-file (Oct 2026) there was no
way to tell which save did it. Each update now records a short list of
human-readable changes, computed before the new values are applied.
"""

from decimal import Decimal
from numbers import Number

# Friendly names for the columns staff actually edit; anything else falls back
# to the column name with underscores turned into spaces.
_LABELS = {
    "title": "Title", "name": "Name", "slug": "URL slug", "description": "Description",
    "price": "Price", "mrp": "MRP", "advance_amount": "Advance amount", "stock": "Stock",
    "is_active": "Visible", "sort": "Position", "category_id": "Category", "tier": "Tier",
    "type": "Type", "features": "Features", "search_keywords": "Search keywords",
    "delivery_days": "Delivery days", "address_change_window_hours": "Address change window (hours)",
    "extra": "Extra settings", "bulk_discounts": "Bulk discounts", "input_fields": "Customer questions",
    "icon": "Icon", "thumb_image_url": "Thumbnail", "hero_image_url": "Hero image",
    "hero_tagline": "Hero tagline", "show_in_hero": "Show in hero", "folio_title": "Folio title",
    "group_label": "Group label", "page_id": "Page", "code": "Code",
}

# Long or structured values: logging the full before/after would bloat the row
# and be unreadable, so only "changed" is recorded for these.
_SUMMARY_ONLY = {"description", "extra", "features", "search_keywords", "bulk_discounts",
                 "thumb_image_url", "hero_image_url"}

_MAX_VALUE_LEN = 60


def _label(key: str) -> str:
    return _LABELS.get(key, key.replace("_", " ").capitalize())


def _fmt(value) -> str:
    if value is None or value == "":
        return "(empty)"
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, (float, Decimal)):
        # Prices come back from Postgres as Decimal("499.00") and from the admin
        # form as 549.0 - show both as plain 499 / 549.
        value = f"{float(value):.2f}".rstrip("0").rstrip(".")
    text = str(value)
    return text if len(text) <= _MAX_VALUE_LEN else text[:_MAX_VALUE_LEN - 1] + "…"


def _upload_mode(field: dict) -> str:
    if field.get("multiple"):
        return f"Multiple files (max {field.get('max_files') or 1})"
    return "Single file"


def _question_changes(old_fields, new_fields) -> list[str]:
    old = {f.get("id"): f for f in (old_fields or []) if isinstance(f, dict)}
    new = {f.get("id"): f for f in (new_fields or []) if isinstance(f, dict)}
    lines = []
    for fid, f in new.items():
        if fid not in old:
            lines.append(f'Customer question added: "{f.get("label")}" ({f.get("type")})')
    for fid, f in old.items():
        if fid not in new:
            lines.append(f'Customer question removed: "{f.get("label")}"')
    for fid, n in new.items():
        o = old.get(fid)
        if not o:
            continue
        name = n.get("label")
        if o.get("label") != n.get("label"):
            lines.append(f'Customer question renamed: "{o.get("label")}" → "{name}"')
        if bool(o.get("required")) != bool(n.get("required")):
            lines.append(f'"{name}" required: {_fmt(bool(o.get("required")))} → {_fmt(bool(n.get("required")))}')
        if o.get("type") != n.get("type"):
            lines.append(f'"{name}" type: {o.get("type")} → {n.get("type")}')
        elif n.get("type") == "upload" and _upload_mode(o) != _upload_mode(n):
            lines.append(f'"{name}" uploads: {_upload_mode(o)} → {_upload_mode(n)}')
        elif n.get("type") == "dropdown":
            if (o.get("options") or []) != (n.get("options") or []):
                lines.append(f'"{name}" options: {len(o.get("options") or [])} → {len(n.get("options") or [])} options')
            if (o.get("option_prices") or {}) != (n.get("option_prices") or {}):
                lines.append(f'"{name}" option prices changed')
    if not lines and [f.get("id") for f in (old_fields or []) if isinstance(f, dict)] != \
            [f.get("id") for f in (new_fields or []) if isinstance(f, dict)]:
        lines.append("Customer questions reordered")
    return lines


def describe_changes(obj, data: dict) -> list[str]:
    """Compare obj's current attributes with the incoming `data` (before it is
    applied) and return one readable line per real change. An empty list means
    the save changed nothing."""
    lines: list[str] = []
    for key, new_value in data.items():
        old_value = getattr(obj, key, None)
        if key == "input_fields":
            lines.extend(_question_changes(old_value, new_value))
            continue
        if old_value == new_value:
            continue
        # A price stored as 499 and submitted as 499.0 is not a change.
        if isinstance(old_value, (int, float)) and isinstance(new_value, (int, float)) \
                and not isinstance(old_value, bool) and float(old_value) == float(new_value):
            continue
        if key in _SUMMARY_ONLY:
            lines.append(f"{_label(key)} changed")
        else:
            lines.append(f"{_label(key)}: {_fmt(old_value)} → {_fmt(new_value)}")
    return lines
