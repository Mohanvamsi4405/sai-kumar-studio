routes.customers = renderCustomers;

async function renderCustomers() {
  const view = document.getElementById("view");
  view.innerHTML = `
    <header class="page-head">
      <h1>Customers</h1>
      <button class="btn secondary owner-only" id="blockEmailBtn">Block an email</button>
    </header>
    <div class="toolbar"><input id="customerSearch" placeholder="Search name, email, or phone…" style="max-width:320px;"></div>
    <div id="customersWrap">${LOADING}</div>
  `;
  document.getElementById("blockEmailBtn").addEventListener("click", () => openBlockEmailForm());
  let timer;
  document.getElementById("customerSearch").addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => loadCustomers(e.target.value.trim()), 300);
  });
  await loadCustomers();
}

async function loadCustomers(q, page = 1) {
  const wrap = document.getElementById("customersWrap");
  const res = await Api.customers(q, page);
  // The container is captured before the await above; a staff member who navigates
  // to another section while this request is in flight leaves it detached from the
  // document, and writing to it then throws an uncaught TypeError. Nothing is left
  // half-rendered by bailing out - the route they moved to owns the view now.
  if (!wrap) return;
  wrap._lastQuery = q;
  wrap._lastPage = res.page || page;
  if (!res.items.length) {
    wrap.innerHTML = `<div class="empty-state">No customers ${q ? "match that search" : "yet"}.</div>`;
    return;
  }
  const pageSize = res.page_size || res.items.length;
  const totalPages = Math.max(1, Math.ceil(res.total / pageSize));
  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Name</th><th>Email</th><th>Phone</th><th>Orders</th><th>Spend</th>
          <th>Joined</th><th>Last Login</th><th>OTP Requests</th><th>Status</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${res.items.map(c => `
          <tr>
            <td>${c.id ? esc(c.name || "—") : `<span style="color:var(--text-dim);">— no signup</span>`}</td>
            <td>${esc(c.email)}</td>
            <td>${esc(c.phone || "—")}</td>
            <td>${c.orders}</td>
            <td>${fmtINR(c.spend)}</td>
            <td>${c.joined ? fmtIST(c.joined) : "—"}</td>
            <td>${c.last_login ? fmtIST(c.last_login) : "—"}</td>
            <td>${c.otp_requests}${c.last_otp_request ? ` <span style="color:var(--text-dim);font-size:12px;">(last ${fmtIST(c.last_otp_request)})</span>` : ""}</td>
            <td>${c.is_blocked ? `<span class="badge off">Blocked</span>` : `<span class="badge on">Active</span>`}</td>
            <td class="actions owner-only">
              ${c.is_blocked
                ? `<button class="btn secondary" data-action="unblock" data-email="${esc(c.email)}">Unblock</button>`
                : `<button class="btn secondary" data-action="block" data-email="${esc(c.email)}">Block</button>`}
              ${c.id
                ? `<button class="btn danger" data-action="delete" data-id="${esc(c.id)}" data-email="${esc(c.email)}" data-orders="${c.orders}">Delete</button>`
                : `<button class="btn danger" data-action="remove-otp" data-email="${esc(c.email)}">Remove</button>`}
            </td>
          </tr>`).join("")}
      </tbody>
    </table>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;">
      <p style="color:var(--text-dim);font-size:12px;">
        ${res.total} total — rows marked "no signup" requested a login OTP but never completed signup.
      </p>
      ${totalPages > 1 ? `
        <div class="pagination" style="display:flex;align-items:center;gap:8px;">
          <button class="btn secondary" id="customersPrevPage" ${res.page <= 1 ? "disabled" : ""}>Prev</button>
          <span style="font-size:12px;color:var(--text-dim);">Page ${res.page} of ${totalPages}</span>
          <button class="btn secondary" id="customersNextPage" ${res.page >= totalPages ? "disabled" : ""}>Next</button>
        </div>
      ` : ""}
    </div>
  `;
  document.getElementById("customersPrevPage")?.addEventListener("click", () => loadCustomers(q, res.page - 1));
  document.getElementById("customersNextPage")?.addEventListener("click", () => loadCustomers(q, res.page + 1));
  // Row actions are wired via data-* attributes + a delegated listener, not inline
  // onclick="fn('${email}')" strings — an email is untrusted (submitted through the
  // public, unauthenticated OTP-request endpoint) and esc() only makes it safe to sit
  // inside an HTML attribute, not to be re-parsed as JS source inside onclick="...".
  wrap.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const { action, email, id, orders } = btn.dataset;
      if (action === "unblock") unblockCustomerEmail(email, btn);
      else if (action === "block") blockCustomerEmail(email, btn);
      else if (action === "delete") removeCustomer(id, email, parseInt(orders, 10), btn);
      else if (action === "remove-otp") removeOtpActivity(email, btn);
    });
  });
}

function reloadCustomers() {
  const wrap = document.getElementById("customersWrap");
  return loadCustomers(wrap?._lastQuery, wrap?._lastPage || 1);
}

async function removeCustomer(id, email, orderCount, btn) {
  const warning = orderCount > 0
    ? `Permanently delete ${email}? This also erases their ${orderCount} order${orderCount === 1 ? "" : "s"}, payments, addresses, cart/wishlist, and reviews. This cannot be undone.`
    : `Permanently delete ${email}? This also erases their addresses, cart/wishlist, and reviews. This cannot be undone.`;
  if (!confirm(warning)) return;
  try {
    await withBusy(btn, "Deleting…", () => Api.deleteCustomer(id));
    reloadCustomers();
  } catch (err) { alert(err.message); }
}

async function blockCustomerEmail(email, btn) {
  const reason = prompt(`Block ${email} from logging in or requesting OTPs?\n\nOptional reason (shown in the audit log):`);
  if (reason === null) return; // cancelled
  try {
    await withBusy(btn, "Blocking…", () => Api.blockEmail(email, reason));
    reloadCustomers();
  } catch (err) { alert(err.message); }
}

async function removeOtpActivity(email, btn) {
  if (!confirm(`Remove ${email}'s OTP request history? It never completed signup - this just clears the login-activity noise, it's not blocked from trying again.`)) return;
  try {
    await withBusy(btn, "Removing…", () => Api.clearOtpActivity(email));
    reloadCustomers();
  } catch (err) { alert(err.message); }
}

async function unblockCustomerEmail(email, btn) {
  if (!confirm(`Unblock ${email}? They'll be able to log in and request OTPs again.`)) return;
  try {
    await withBusy(btn, "Unblocking…", () => Api.unblockEmail(email));
    reloadCustomers();
  } catch (err) { alert(err.message); }
}

function openBlockEmailForm() {
  openModal(`
    <h2>Block an email</h2>
    <p style="color:var(--text-dim);font-size:13px;">
      Blocks login and OTP requests for this address, even if it has never signed up -
      use this for an email someone is hammering the login form with.
    </p>
    <div id="formMsg"></div>
    <form id="blockEmailForm">
      <label>Email</label><input id="be_email" type="email" required>
      <label>Reason (optional)</label><input id="be_reason">
      <div class="modal-actions">
        <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn danger">Block</button>
      </div>
    </form>
  `);
  document.getElementById("blockEmailForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    try {
      await withBusy(btn, "Blocking…", () => Api.blockEmail(
        document.getElementById("be_email").value.trim(),
        document.getElementById("be_reason").value.trim(),
      ));
      closeModal();
      reloadCustomers();
    } catch (err) {
      document.getElementById("formMsg").innerHTML = `<div class="msg error">${esc(err.message)}</div>`;
    }
  });
}
