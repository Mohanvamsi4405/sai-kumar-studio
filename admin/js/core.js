let CURRENT_USER = null;
const routes = {};

async function boot() {
  if (!getToken()) { location.href = "index.html"; return; }
  try {
    CURRENT_USER = await Api.me();
  } catch (e) {
    return; // api.js already redirects to login on 401
  }
  document.getElementById("userEmail").textContent = CURRENT_USER.email;
  document.body.classList.toggle("is-owner", CURRENT_USER.role === "owner");
  document.getElementById("logoutLink").addEventListener("click", (e) => { e.preventDefault(); logout(); });
  window.addEventListener("hashchange", route);
  setupMobileNav();
  applyBrandTheme();
  route();
}

/* Off-canvas sidebar for narrow screens: hamburger button opens it, and the
   dimmed overlay (or picking a nav link) closes it again. */
function setupMobileNav() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const toggle = document.getElementById("sidebarToggle");
  if (!sidebar || !overlay || !toggle) return;

  const close = () => { sidebar.classList.remove("open"); overlay.classList.remove("open"); };
  toggle.addEventListener("click", () => {
    sidebar.classList.toggle("open");
    overlay.classList.toggle("open");
  });
  overlay.addEventListener("click", close);
  sidebar.querySelectorAll("nav a").forEach(a => a.addEventListener("click", close));
}

/* Lets the owner's Settings > Branding colors re-theme the admin UI itself
   (not just documentation) — falls back to the CSS defaults when unset. */
async function applyBrandTheme() {
  try {
    const all = await Api.allSettings();
    const b = all.branding || {};
    const root = document.documentElement.style;
    if (b.primary_color) root.setProperty("--accent", b.primary_color);
    if (b.accent_color) root.setProperty("--accent-2", b.accent_color);
  } catch (e) { /* non-fatal — keep CSS defaults */ }
}

function logout() { clearToken(); location.href = "index.html"; }

/* CSV report endpoints require the admin's bearer token like every other API
   call, so a plain <a href> (no Authorization header) always 401s — this
   fetches with the token instead and saves the response as a file. */
async function downloadCsvReport(path, filename, btn) {
  await withBusy(btn, "Exporting…", async () => {
    const token = getToken();
    const res = await fetch(`${API_BASE}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      let detail = res.statusText;
      try { detail = (await res.json()).detail || detail; } catch (_) {}
      alert(`Couldn't download the report: ${detail}`);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  });
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, qs] = raw.split("?");
  return { path: path || "dashboard", params: new URLSearchParams(qs || "") };
}

// Nav links to these are already hidden from staff via .owner-only, but that's
// cosmetic only - direct hash navigation (typing #/staff in the address bar)
// used to still call the route handler, which would await Api.staff() (or
// Api.auditLog()/Api.activity()), get a 403 with no try/catch around it, and
// leave the page on an unhandled-rejection, permanently-stuck loading spinner.
const OWNER_ONLY_ROUTES = ["staff", "audit", "activity"];

function route() {
  const { path, params } = parseHash();
  document.querySelectorAll(".sidebar nav a").forEach(a => a.classList.toggle("active", a.dataset.route === path));
  if (OWNER_ONLY_ROUTES.includes(path) && CURRENT_USER && CURRENT_USER.role !== "owner") {
    document.getElementById("view").innerHTML = `<div class="empty-state">Access denied — this page is owner-only.</div>`;
    return;
  }
  (routes[path] || routes.dashboard)(params);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function openModal(html, wide) {
  closeModal();
  const bg = document.createElement("div");
  bg.className = "modal-backdrop";
  bg.id = "modalBackdrop";
  bg.innerHTML = `<div class="modal${wide ? " modal-wide" : ""}">${html}</div>`;
  bg.addEventListener("click", (e) => { if (e.target === bg) closeModal(); });
  document.body.appendChild(bg);
  wireModalErrorDock(bg.querySelector(".modal"));
}

/* Long forms (a product with many fields) put #formMsg at the very top, while
   Save sits at the bottom - so a failed save showed its reason somewhere the
   admin couldn't see, and they had to scroll all the way up to find it. Every
   modal form writes its errors into #formMsg, so instead of changing each one,
   this watches that box and mirrors any error into a "dock" inside the action
   bar, which is pinned to the bottom of the screen (see .modal-actions in
   admin.css). The top message stays where it was; the dock disappears again as
   soon as the form clears it, or with its own x. */
function wireModalErrorDock(modal) {
  const msg = modal && modal.querySelector("#formMsg");
  if (!msg) return;
  const sync = () => {
    const error = msg.querySelector(".msg.error");
    const actions = Array.from(modal.querySelectorAll(".modal-actions")).pop();
    let dock = modal.querySelector(".modal-error-dock");
    if (!error || !actions) { dock?.remove(); return; }
    if (!dock) {
      dock = document.createElement("div");
      dock.className = "modal-error-dock msg error";
      dock.setAttribute("role", "alert");
      actions.prepend(dock);
    }
    dock.innerHTML = `<div class="modal-error-dock-text">${error.innerHTML}</div>
      <button type="button" class="modal-error-dock-close" aria-label="Dismiss">&times;</button>`;
    dock.querySelector(".modal-error-dock-close").addEventListener("click", () => dock.remove());
  };
  new MutationObserver(sync).observe(msg, { childList: true, subtree: true, characterData: true });
}
function closeModal() { document.getElementById("modalBackdrop")?.remove(); }

/* Fetches every site page's categories concurrently instead of one page at a
   time (Products & Arrange both need "categories across every page" in one
   flat list) — with N pages this is one round-trip's worth of latency instead
   of N sequential ones, which matters a lot on a slow/remote DB connection. */
async function allCategoriesAcrossPages(pages) {
  const perPage = await Promise.all(pages.map(p => Api.categories(p.slug)));
  const allCats = [];
  perPage.forEach((cats, i) => cats.forEach(c => allCats.push({ ...c, pageName: pages[i].name, pageSlug: pages[i].slug })));
  return allCats;
}

function card(num, lbl) {
  return `<div class="card"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`;
}

/* Shared inline loading indicator — an actual spinner reads as "busy, wait"
   more clearly than static "Loading…" text, especially on the DB's slower
   round-trips. Used via ${LOADING} inside a template literal, or assigned
   directly (`wrap.innerHTML = LOADING`) where there's no surrounding markup. */
const LOADING = `<div class="loading"><span class="spinner"></span> Loading…</div>`;

/* Disables `btn` and swaps its label to `busyLabel` while `fn()` runs, then
   restores the original label/enabled state afterward whether `fn` succeeds
   or throws. Every Save/Create/Delete button in the admin used to give no
   feedback at all while its request was in flight, so a slow connection made
   it look like nothing happened — inviting a second click that fired the
   same request twice. Re-throws so the caller's own try/catch still runs. */
async function withBusy(btn, busyLabel, fn) {
  if (!btn) return fn();
  const original = btn.textContent;
  btn.disabled = true;
  btn.textContent = busyLabel;
  try {
    return await fn();
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

/* Copies `text` to the clipboard, trying the modern async Clipboard API first
   and falling back to a hidden textarea + execCommand("copy") when that API
   is missing or refuses (it silently rejects outside a secure/HTTPS context,
   or when the page lacks clipboard-write permission) — the old code only
   tried the async API with no fallback and no .catch, so on plain HTTP it
   failed with zero feedback and looked like "copy" just didn't work. Resolves
   true/false so callers can tell the admin whether it actually worked. */
async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) { /* fall through to the execCommand fallback below */ }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch (e) {
    return false;
  }
}

function fmtINR(n) {
  return `₹${Number(n || 0).toLocaleString("en-IN")}`;
}

/* Forces every admin timestamp to a detailed IST 12-hour rendering, regardless
   of the viewing staff member's own browser/OS timezone — e.g. "03 Sep 2026,
   04:32 PM IST". Asia/Kolkata has no DST, so the "IST" suffix is always correct. */
function fmtIST(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const formatted = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  }).format(d);
  return `${formatted.replace(/\s?(am|pm)$/i, (m) => m.toUpperCase())} IST`;
}

/* Date-only variant (still forced to IST) for tables that only need the day. */
function fmtISTDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric",
  }).format(d);
}

/* Shared drag-reorder list used by homepage.js and arrange.js. Renders `items`
   (each needs an `id`, `title`/`name`, `image`, optional `price`, optional `on`)
   into `containerEl` with drag handles + up/down buttons + an optional "Show"
   checkbox (when `showToggle` is true). Calls `onChange(newItemsArray)` after
   every reorder/toggle so the caller can keep its own state in sync. */
function renderDraggableList(containerEl, items, { showToggle = false, onChange } = {}) {
  let dragIdx = null;

  function move(from, to) {
    if (to < 0 || to >= items.length) return;
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    paint();
    onChange && onChange(items);
  }

  function paint() {
    containerEl.innerHTML = items.map((item, i) => `
      <div class="drag-row ${showToggle && item.on === false ? "off" : ""}" draggable="true" data-idx="${i}">
        <span class="drag-handle">⠿</span>
        ${item.image ? `<img src="${esc(item.image)}" class="drag-thumb" onerror="this.style.visibility='hidden'">` : ""}
        <span class="drag-title">${esc(item.title || item.name || "")}</span>
        ${item.price != null ? `<span class="drag-price">${fmtINR(item.price)}</span>` : ""}
        <span class="drag-actions">
          <button type="button" class="btn secondary" data-move="-1" data-idx="${i}">↑</button>
          <button type="button" class="btn secondary" data-move="1" data-idx="${i}">↓</button>
          ${showToggle ? `<label class="inline"><input type="checkbox" data-toggle="${i}" ${item.on !== false ? "checked" : ""}> Show</label>` : ""}
        </span>
      </div>`).join("") || `<div class="empty-state">Nothing to arrange yet.</div>`;

    containerEl.querySelectorAll("[data-move]").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = Number(btn.dataset.idx);
        move(i, i + Number(btn.dataset.move));
      });
    });
    if (showToggle) {
      containerEl.querySelectorAll("[data-toggle]").forEach(cb => {
        cb.addEventListener("change", () => {
          items[Number(cb.dataset.toggle)].on = cb.checked;
          containerEl.querySelector(`.drag-row[data-idx="${cb.dataset.toggle}"]`).classList.toggle("off", !cb.checked);
          onChange && onChange(items);
        });
      });
    }
    containerEl.querySelectorAll(".drag-row").forEach(row => {
      row.addEventListener("dragstart", () => { dragIdx = Number(row.dataset.idx); });
      row.addEventListener("dragover", (e) => e.preventDefault());
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        const to = Number(row.dataset.idx);
        if (dragIdx === null || dragIdx === to) return;
        move(dragIdx, to);
        dragIdx = null;
      });
    });
  }

  paint();
}
