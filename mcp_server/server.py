"""MCP server exposing Sai Kumar Studio analytics (read-only).

    python server.py stdio   # local client (Claude Desktop / Claude Code) launches it
    python server.py http    # network server at http://MCP_HOST:MCP_PORT/mcp, API-key protected

Talks to the backend's /api/analytics endpoints over HTTP as one owner/staff account,
so all permission checks stay in the backend. See README.md for configuration.
"""
import hmac
import os
import sys
from datetime import date as Date

import httpx
import uvicorn
from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.server.transport_security import TransportSecuritySettings
from mcp.types import ToolAnnotations


def _env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if value is None:
        sys.exit(f"Missing required environment variable {name} (see mcp_server/README.md)")
    return value


def _load_dotenv(path: str) -> None:
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))


class Backend:
    """Logs in with email/password via /api/auth/login and re-logs in when the
    12-hour access token expires."""

    def __init__(self, base_url: str, email: str, password: str):
        self.client = httpx.AsyncClient(base_url=base_url.rstrip("/"), timeout=30)
        self.email, self.password = email, password
        self.token: str | None = None

    async def _login(self) -> None:
        r = await self.client.post("/api/auth/login", json={"email": self.email, "password": self.password})
        if r.status_code != 200:
            raise RuntimeError(f"Backend login failed ({r.status_code}): {r.text[:200]}")
        self.token = r.json()["access_token"]

    async def get(self, path: str, params: dict) -> dict:
        params = {k: v for k, v in params.items() if v is not None}
        for attempt in range(2):
            if self.token is None:
                await self._login()
            r = await self.client.get(path, params=params, headers={"Authorization": f"Bearer {self.token}"})
            if r.status_code == 401 and attempt == 0:
                self.token = None
                continue
            if r.status_code == 403:
                raise ToolError("The backend account configured for this MCP server lacks permission "
                                "(logins and user actions need an owner account).")
            if 400 <= r.status_code < 500:
                try:
                    detail = r.json().get("detail")
                except ValueError:
                    detail = None
                raise ToolError(f"Invalid request: {detail}" if detail else f"Request rejected ({r.status_code})")
            r.raise_for_status()
            return r.json()
        raise RuntimeError("Backend rejected the refreshed token")


backend = Backend(
    _env("STUDIO_API_URL", "http://localhost:8000"),
    _env("STUDIO_EMAIL"),
    _env("STUDIO_PASSWORD"),
)

mcp = MCPServer(
    name="sai-kumar-studio",
    title="Sai Kumar Studio Analytics",
    version="1.0.0",
    instructions=(
        "Read-only business analytics for Sai Kumar Studio (photography, gifts, corporate, studio). "
        "All tools take an optional `date` (YYYY-MM-DD, default today) and `days` (window ending on "
        "that date, default 1). Days are Indian Standard Time calendar days. Login and action data "
        "come from the audit log: it records logins, signups, logouts and staff changes "
        "(products, orders, bookings, coupons, settings). Customer browsing and cart activity are "
        "not recorded."
    ),
)
READ_ONLY = ToolAnnotations(read_only_hint=True, open_world_hint=False)


def _window(day: Date | None, days: int) -> dict:
    return {"date": day.isoformat() if day else None, "days": days}


@mcp.tool(annotations=READ_ONLY)
async def get_summary(date: Date | None = None, days: int = 1) -> dict:
    """One-call overview: orders, bookings, products added, logins and action counts for the period."""
    return await backend.get("/api/analytics/summary", _window(date, days))


@mcp.tool(annotations=READ_ONLY)
async def count_orders(date: Date | None = None, days: int = 1) -> dict:
    """Orders placed in the period: count, breakdown by status, paid revenue, unique customers."""
    return await backend.get("/api/analytics/orders", _window(date, days))


@mcp.tool(annotations=READ_ONLY)
async def count_bookings(date: Date | None = None, days: int = 1) -> dict:
    """Photography bookings created in the period: count, breakdown by status, advance paid."""
    return await backend.get("/api/analytics/bookings", _window(date, days))


@mcp.tool(annotations=READ_ONLY)
async def products_added(date: Date | None = None, days: int = 1, limit: int = 50) -> dict:
    """Products added to the catalog in the period, with count per page and the newest items."""
    return await backend.get("/api/analytics/products", {**_window(date, days), "limit": limit})


@mcp.tool(annotations=READ_ONLY)
async def login_stats(date: Date | None = None, days: int = 1) -> dict:
    """Logins in the period: total, unique users, customer logins, new signups, staff logins, logouts."""
    return await backend.get("/api/analytics/logins", _window(date, days))


@mcp.tool(annotations=READ_ONLY)
async def user_actions(
    date: Date | None = None,
    days: int = 1,
    action: str | None = None,
    entity: str | None = None,
    user_email: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict:
    """Who did what: audit-log entries (newest first) with the user's email, name and role,
    plus counts per action. Filter by action (e.g. login, signup, admin_login, logout, create,
    update, delete, update_status, refund), entity (e.g. user, product, order, booking, coupon,
    category, media) or user_email. Page with limit/offset."""
    return await backend.get("/api/analytics/actions", {
        **_window(date, days), "action": action, "entity": entity,
        "user_email": user_email, "limit": limit, "offset": offset,
    })


class ApiKeyMiddleware:
    """Requires `Authorization: Bearer <key>` matching one of MCP_API_KEYS. /health is open."""

    def __init__(self, app, keys: list[str]):
        self.app, self.keys = app, [k.encode() for k in keys]

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        if scope["path"] == "/health":
            return await self._respond(send, 200, b'{"status":"ok"}')
        auth = dict(scope["headers"]).get(b"authorization", b"")
        presented = auth[7:] if auth[:7].lower() == b"bearer " else b""
        if not any(hmac.compare_digest(presented, k) for k in self.keys):
            return await self._respond(send, 401, b'{"error":"invalid or missing API key"}')
        return await self.app(scope, receive, send)

    @staticmethod
    async def _respond(send, status: int, body: bytes):
        await send({"type": "http.response.start", "status": status,
                    "headers": [(b"content-type", b"application/json"), (b"www-authenticate", b"Bearer")]})
        await send({"type": "http.response.body", "body": body})


def http_app():
    keys = [k.strip() for k in _env("MCP_API_KEYS").split(",") if k.strip()]
    if not keys or any(len(k) < 24 for k in keys):
        sys.exit("MCP_API_KEYS must hold one or more comma-separated keys of 24+ characters")
    hosts = [h.strip() for h in os.environ.get("MCP_ALLOWED_HOSTS", "").split(",") if h.strip()]
    if "*" in hosts:
        # For hostnames that change (e.g. a trycloudflare.com quick tunnel); the API key still applies.
        security = TransportSecuritySettings(enable_dns_rebinding_protection=False)
    else:
        security = TransportSecuritySettings(
            allowed_hosts=["127.0.0.1:*", "localhost:*", *hosts],
            allowed_origins=["http://127.0.0.1:*", "http://localhost:*", *(f"https://{h}" for h in hosts)],
        )
    app = mcp.streamable_http_app(stateless_http=True, json_response=True, transport_security=security)
    return ApiKeyMiddleware(app, keys)


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "stdio"
    if mode == "stdio":
        mcp.run("stdio")
    elif mode == "http":
        uvicorn.run(http_app(), host=os.environ.get("MCP_HOST", "127.0.0.1"),
                    port=int(os.environ.get("MCP_PORT", "8100")), proxy_headers=True)
    else:
        sys.exit("usage: python server.py [stdio|http]")
