"""Server-side validation for a product's admin-configured "Customer Input
Fields" (upload/dropdown/text) against the values a customer submitted at
checkout - see ProductInputFieldIn in schemas.py and the admin field builder
in admin/js/catalog.js. Mirrors the client-side checks in
js/shared/product-fields.js so a request that slips past (or skips) the
storefront JS still can't create an order that's missing a required answer.
"""
from ..models import Product


def _field_value_errors(field: dict, value) -> list[str]:
    label = field.get("label") or field.get("id")
    required = bool(field.get("required"))
    ftype = field.get("type")

    # A product link is a signpost to another product, not a question - there is
    # never an answer to check (and a stray "required" on one must not block
    # checkout).
    if ftype == "link":
        return []

    if value is None or value == "" or value == []:
        return [f'"{label}" is required'] if required else []

    if ftype == "text":
        if not isinstance(value, str):
            return [f'"{label}" must be text']
        # Bounded so a single answer can't be an unbounded blob: it's stored on
        # the order item and re-serialized into every order list/detail response
        # that includes that item for the life of the order. Default matches
        # ProductInputFieldIn.max_length's own default, so a field saved before
        # that setting existed still gets a ceiling.
        max_length = field.get("max_length")
        max_length = int(max_length) if isinstance(max_length, (int, float)) and max_length > 0 else 500
        if len(value) > max_length:
            return [f'"{label}" must be {max_length} characters or fewer']
        return []

    if ftype == "dropdown":
        options = set(field.get("options") or [])
        if not field.get("multi_select"):
            # A single-select dropdown's answer must be a scalar - a
            # single-element list (e.g. a client that always wraps field
            # answers in an array) must not silently pass through as a list,
            # or resolve_product_price()'s dict.get(selected) blows up with
            # an unhashable-type TypeError further down the checkout path.
            if isinstance(value, list):
                return [f'"{label}" only accepts a single selection']
            chosen = [value]
        else:
            chosen = value if isinstance(value, list) else [value]
        invalid = [c for c in chosen if c not in options]
        if invalid:
            return [f'"{label}" has an invalid selection']
        return []

    if ftype == "upload":
        files = value if isinstance(value, list) else [value]
        files = [f for f in files if f]
        max_files = int(field.get("max_files") or 1) if field.get("multiple") else 1
        if len(files) > max_files:
            return [f'"{label}" allows at most {max_files} file(s)']
        return []

    return []


def validate_product_field_values(product: Product, fields_values: dict | None) -> list[str]:
    """Returns a list of human-readable error strings (empty = valid)."""
    input_fields = product.input_fields or []
    if not input_fields:
        return []
    values = fields_values or {}
    errors: list[str] = []
    for field in input_fields:
        errors.extend(_field_value_errors(field, values.get(field.get("id"))))
    return errors


def resolve_product_price(product: Product, fields_values: dict | None) -> float:
    """Server-side mirror of js/shared/product-fields.js's getSelectedPrice(): the first
    non-multi-select dropdown field with option_prices replaces the product's base price
    entirely once the customer picks one of its priced options (e.g. Studio's "16 Photos
    = ₹200" quantity picker) - it does not add to product.price.

    This is the one and only place a checkout line's price should come from for any item
    with a resolvable product_id - see routers/orders.py's checkout(), which must never
    trust a client-supplied price for such lines."""
    values = fields_values or {}
    fields = sorted(product.input_fields or [], key=lambda f: f.get("sort", 0))
    priced_field = next(
        (f for f in fields if f.get("type") == "dropdown" and not f.get("multi_select") and f.get("option_prices")),
        None,
    )
    if priced_field:
        selected = values.get(priced_field.get("id"))
        price = (priced_field.get("option_prices") or {}).get(selected)
        if price is not None:
            return float(price)
    return float(product.price)
