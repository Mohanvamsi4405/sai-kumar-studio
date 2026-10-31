# MCP server: setup and deployment

Read-only MCP server over the backend's `/api/analytics/*` endpoints. For people connecting to it, see [docs/MCP.md](../docs/MCP.md).

```
MCP client ──(API key)──▶ server.py ──(staff/owner JWT)──▶ backend /api/analytics ──▶ Postgres
```

The server holds no database credentials. It logs in to the backend as one account, so the backend's role checks still apply. It uses its own venv because `mcp` 2.x needs newer pydantic/starlette than the backend pins.

## Setup

```powershell
cd mcp_server
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
copy .env.example .env    # then fill it in
```

Use an **owner** account for `STUDIO_EMAIL`/`STUDIO_PASSWORD` if you want logins and user actions. A staff account gets orders, bookings and products only. A dedicated account (for example `mcp@…`) makes its activity easy to tell apart in the audit log.

## Run

**Local, for yourself** (stdio, launched by the client):

```bash
claude mcp add studio -- "D:\Gen AI\Studio\studio-backed\mcp_server\.venv\Scripts\python.exe" "D:\Gen AI\Studio\studio-backed\mcp_server\server.py" stdio
```

**Shared with others** (HTTP at `/mcp`, every request needs `Authorization: Bearer <key>`):

```bash
python server.py http        # binds MCP_HOST:MCP_PORT, default 127.0.0.1:8100
curl localhost:8100/health   # {"status":"ok"}, the only route without a key
```

Give each person their own key in `MCP_API_KEYS` (comma-separated). To revoke one, remove it and restart.

## Deploy on the VM

```bash
cd /home/ubuntu/app/mcp_server
python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env && nano .env        # STUDIO_API_URL=http://127.0.0.1:8000
sudo cp ../server-config/studio-mcp.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now studio-mcp
```

Exposing it publicly (pick one):

- **nginx**: `server-config/nginx-studio.conf` now proxies `/mcp` to port 8100. Copy it to the VM and run `sudo nginx -t && sudo systemctl reload nginx`. Put the public hostname in `MCP_ALLOWED_HOSTS`. Serve it over HTTPS only: the API key travels in a header.
- **Cloudflare quick tunnel**: the current tunnel points at the backend (port 8000), not nginx. Run a second one with `cloudflared tunnel --url http://127.0.0.1:8100`, and set `MCP_ALLOWED_HOSTS=*`, since the `trycloudflare.com` name changes on every restart.

Logs: `sudo journalctl -u studio-mcp -f`.

## Security notes

- Tool output includes customer emails, names and login IPs. Only give keys to people who should see that.
- Wrong or missing keys get `401`. Unknown `Host` headers get `421` (DNS-rebinding protection) unless `MCP_ALLOWED_HOSTS=*`.
- Backend 5xx errors and login failures reach clients only as a generic error. Details stay in the server log.
