routes.staff = renderStaff;
routes.audit = renderAudit;
routes.activity = renderActivity;

async function renderStaff() {
  const view = document.getElementById("view");
  view.innerHTML = `
    <header class="page-head"><h1>Staff</h1><button class="btn" id="addStaffBtn">+ Add Staff</button></header>
    <div id="staffWrap">${LOADING}</div>
  `;
  document.getElementById("addStaffBtn").addEventListener("click", () => openStaffForm());
  await loadStaff();
}

async function loadStaff() {
  const wrap = document.getElementById("staffWrap");
  const staff = await Api.staff();
  // The container is captured before the await above; a staff member who navigates
  // to another section while this request is in flight leaves it detached from the
  // document, and writing to it then throws an uncaught TypeError. Nothing is left
  // half-rendered by bailing out - the route they moved to owns the view now.
  if (!wrap) return;
  wrap.innerHTML = `
    <table>
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${staff.map(u => `
          <tr>
            <td>${esc(u.name || "—")}</td>
            <td>${esc(u.email)}</td>
            <td>${esc(u.role)}</td>
            <td><span class="badge ${u.is_active ? "on" : "off"}">${u.is_active ? "Active" : "Deactivated"}</span></td>
            <td class="actions">${u.id === CURRENT_USER.id ? "" : u.is_active
              ? `<button class="btn danger" onclick="removeStaff('${u.id}', this)">Deactivate</button>`
              : `<button class="btn secondary" onclick="reactivateStaffAccount('${u.id}', this)">Reactivate</button>`}</td>
          </tr>`).join("")}
      </tbody>
    </table>
  `;
}

function openStaffForm() {
  openModal(`
    <h2>Add Staff</h2>
    <div id="formMsg"></div>
    <form id="staffForm">
      <label>Name</label><input id="s_name" required>
      <label>Email</label><input id="s_email" type="email" required>
      <label>Temporary password</label><input id="s_password" type="password" required minlength="8">
      <label>Role</label>
      <select id="s_role"><option value="staff">Staff</option><option value="owner">Owner</option></select>
      <div class="modal-actions">
        <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn">Create</button>
      </div>
    </form>
  `);
  document.getElementById("staffForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    try {
      await withBusy(btn, "Creating…", () => Api.createStaff({
        name: document.getElementById("s_name").value.trim(),
        email: document.getElementById("s_email").value.trim(),
        password: document.getElementById("s_password").value,
        role: document.getElementById("s_role").value,
      }));
      closeModal();
      loadStaff();
    } catch (err) {
      document.getElementById("formMsg").innerHTML = `<div class="msg error">${esc(err.message)}</div>`;
    }
  });
}

async function removeStaff(id, btn) {
  if (!confirm("Deactivate this staff account?")) return;
  try { await withBusy(btn, "Deactivating…", () => Api.deactivateStaff(id)); loadStaff(); }
  catch (err) { alert(err.message); }
}

async function reactivateStaffAccount(id, btn) {
  if (!confirm("Reactivate this staff account? They'll be able to log in again.")) return;
  try { await withBusy(btn, "Reactivating…", () => Api.reactivateStaff(id)); loadStaff(); }
  catch (err) { alert(err.message); }
}

// ==================================================================== audit log (owner only)

async function renderAudit() {
  const view = document.getElementById("view");
  view.innerHTML = `
    <header class="page-head">
      <h1>Audit Log</h1>
      <button class="btn danger owner-only" id="clearAuditBtn">Clear</button>
    </header>
    <p style="color:var(--text-dim);font-size:13px;">
      Every recorded admin/customer action (logins, deletions, blocks, etc). The Activity page
      is this same data, filtered to just sign-ins/sign-ups - clearing here clears both.
    </p>
    <div id="auditWrap">${LOADING}</div>`;
  document.getElementById("clearAuditBtn").addEventListener("click", (e) => clearAuditLog(renderAudit, e.currentTarget));
  await loadAuditTable();
}

// Plain-language wording for each recorded action, so the log reads as
// "Updated product "Collage frame"" instead of raw action/entity/JSON columns.
const AUDIT_VERBS = {
  create: "Created", update: "Updated", delete: "Deleted", reorder: "Reordered", arrange: "Arranged",
  set: "Changed", upload: "Uploaded", block: "Blocked", unblock: "Unblocked",
  deactivate: "Deactivated", reactivate: "Reactivated", refund: "Refunded",
  update_status: "Changed status of", update_tracking: "Updated tracking for",
  toggle_review: "Showed/hid", clear_audit_log: "Cleared the audit log",
  clear_otp_activity: "Cleared OTP activity for",
  admin_login: "Logged in to admin", login: "Logged in", signup: "Signed up", logout: "Logged out",
  artwork_hold: "Held artwork for", artwork_purge_now: "Purged artwork for",
  artwork_sweep: "Ran artwork cleanup", artwork_retention: "Changed artwork retention",
};
const AUDIT_NOUNS = {
  product: "product", category: "category", coupon: "coupon", staff: "login", order: "order",
  booking: "booking", setting: "setting", media: "photo", category_media: "category photo",
  product_media: "product photo", site_page: "page", customer: "customer", email: "email",
  review: "review", contact_message: "contact message", customer_upload: "customer upload",
};
// Actions where naming the entity would only repeat the verb.
const AUDIT_NO_NOUN = new Set(["admin_login", "login", "signup", "logout", "clear_audit_log", "artwork_sweep", "artwork_retention"]);

function auditSubject(l) {
  const d = l.detail || {};
  return d.title || d.name || d.code || d.email || d.key || d.order_number || "";
}

function auditWhat(l) {
  const verb = AUDIT_VERBS[l.action] || l.action;
  if (AUDIT_NO_NOUN.has(l.action)) return esc(verb);
  const noun = AUDIT_NOUNS[l.entity] || (l.entity || "").replace(/_/g, " ");
  const subject = auditSubject(l);
  return `${esc(verb)} ${esc(noun)}${subject ? ` <strong>${esc(subject)}</strong>` : ""}`;
}

function auditChanges(l) {
  const d = l.detail || {};
  if (Array.isArray(d.changes)) {
    if (!d.changes.length) return `<span class="audit-dim">Saved with no changes</span>`;
    return `<ul class="audit-changes">${d.changes.map(c => `<li>${esc(c)}</li>`).join("")}</ul>`;
  }
  // Older rows (before changes were recorded) and non-update actions: show
  // whatever extra detail exists beyond the name already in "What happened".
  const shown = new Set(["title", "name", "code", "email", "key", "order_number"]);
  const rest = Object.entries(d).filter(([k, v]) => !shown.has(k) && v !== null && v !== "");
  if (!rest.length) return l.action === "update" ? `<span class="audit-dim">Not recorded (older entry)</span>` : "";
  return `<span class="audit-dim">${rest.map(([k, v]) => `${esc(k.replace(/_/g, " "))}: ${esc(typeof v === "object" ? JSON.stringify(v) : String(v))}`).join(" · ")}</span>`;
}

function auditWho(l) {
  if (!l.user_email) return `<span class="audit-dim">System / unknown</span>`;
  return `<div><strong>${esc(l.user_name || l.user_email)}</strong>
    <span class="badge ${l.user_role === "owner" ? "on" : ""}" style="margin-left:4px;">${esc(l.user_role || "")}</span></div>
    <div class="audit-dim">${esc(l.user_email)}</div>`;
}

async function loadAuditTable() {
  const logs = await Api.auditLog();
  const wrap = document.getElementById("auditWrap");
  if (!logs.length) {
    wrap.innerHTML = `<div class="empty-state">No audit log entries.</div>`;
    return;
  }
  const people = [...new Map(logs.filter(l => l.user_email).map(l => [l.user_email, l.user_name || l.user_email])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  wrap.innerHTML = `
    <div class="audit-filters">
      <select id="auditWho">
        <option value="">Everyone</option>
        ${people.map(([email, name]) => `<option value="${esc(email)}">${esc(name)} (${esc(email)})</option>`).join("")}
      </select>
      <select id="auditKind">
        <option value="">All actions</option>
        <option value="changes">Changes only (no logins)</option>
        <option value="logins">Logins only</option>
      </select>
      <input type="search" id="auditSearch" placeholder="Search product, IP, change…">
      <span class="audit-dim" id="auditCount"></span>
    </div>
    <div class="audit-table-wrap">
      <table class="audit-table">
        <thead><tr><th>When (IST)</th><th>Who</th><th>What happened</th><th>Changes</th><th>IP Address</th></tr></thead>
        <tbody id="auditBody"></tbody>
      </table>
    </div>
  `;
  const LOGIN_ACTIONS = new Set(["admin_login", "login", "signup", "logout"]);
  const draw = () => {
    const who = document.getElementById("auditWho").value;
    const kind = document.getElementById("auditKind").value;
    const q = document.getElementById("auditSearch").value.trim().toLowerCase();
    const rows = logs.filter(l =>
      (!who || l.user_email === who) &&
      (!kind || (kind === "logins") === LOGIN_ACTIONS.has(l.action)) &&
      (!q || [l.user_name, l.user_email, l.ip, l.action, l.entity, JSON.stringify(l.detail || {})]
        .join(" ").toLowerCase().includes(q)));
    document.getElementById("auditCount").textContent = `${rows.length} of ${logs.length} entries`;
    document.getElementById("auditBody").innerHTML = rows.map(l => `
      <tr>
        <td style="white-space:nowrap;">${fmtIST(l.created_at)}</td>
        <td>${auditWho(l)}</td>
        <td>${auditWhat(l)}</td>
        <td>${auditChanges(l)}</td>
        <td class="mono">${esc(l.ip || "—")}</td>
      </tr>`).join("") || `<tr><td colspan="5" class="audit-dim">No entries match.</td></tr>`;
  };
  ["auditWho", "auditKind"].forEach(id => document.getElementById(id).addEventListener("change", draw));
  document.getElementById("auditSearch").addEventListener("input", draw);
  draw();
}

async function clearAuditLog(onDone, btn) {
  if (!confirm("Permanently clear the audit log? This also empties the Activity page (same underlying data). This cannot be undone.")) return;
  try {
    await withBusy(btn, "Clearing…", () => Api.clearAuditLog());
    onDone();
  } catch (err) { alert(err.message); }
}

// ==================================================================== activity feed (login/logout/signup)

async function renderActivity() {
  const view = document.getElementById("view");
  view.innerHTML = `
    <header class="page-head">
      <h1>Activity</h1>
      <button class="btn danger owner-only" id="clearActivityBtn">Clear</button>
    </header>
    <p style="color:var(--text-dim);font-size:13px;">
      Recent sign-ins, sign-ups, and admin logins, with the originating IP address - a filtered
      view of the Audit Log (same table, narrowed to just these actions). Clearing here clears
      the full Audit Log too, since it's the same data.
    </p>
    <div id="activityWrap">${LOADING}</div>`;
  document.getElementById("clearActivityBtn").addEventListener("click", (e) => clearAuditLog(renderActivity, e.currentTarget));
  await loadActivityTable();
}

async function loadActivityTable() {
  const logs = await Api.activity();
  const wrap = document.getElementById("activityWrap");
  if (!logs.length) {
    wrap.innerHTML = `<div class="empty-state">No activity recorded yet.</div>`;
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead><tr><th>When (IST)</th><th>Action</th><th>Who</th><th>Email</th><th>IP Address</th></tr></thead>
      <tbody>
        ${logs.map(l => `
          <tr>
            <td>${fmtIST(l.at)}</td>
            <td><span class="badge ${l.action === "logout" ? "off" : "on"}">${esc(l.action)}</span></td>
            <td>${esc(l.who || "—")}</td>
            <td>${esc(l.email || "—")}</td>
            <td class="mono">${esc(l.ip || "—")}</td>
          </tr>`).join("")}
      </tbody>
    </table>
  `;
}
