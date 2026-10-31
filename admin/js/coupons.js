routes.coupons = renderCoupons;

async function renderCoupons() {
  const view = document.getElementById("view");
  view.innerHTML = `
    <header class="page-head"><h1>Coupons & Offers</h1><button class="btn" id="addCouponBtn">+ Add Coupon</button></header>
    <div id="couponWrap">${LOADING}</div>
  `;
  document.getElementById("addCouponBtn").addEventListener("click", () => openCouponForm());
  await loadCoupons();
}

async function loadCoupons() {
  const wrap = document.getElementById("couponWrap");
  const coupons = await Api.coupons();
  window._COUPONS_CACHE = coupons;
  // The container is captured before the await above; a staff member who navigates
  // to another section while this request is in flight leaves it detached from the
  // document, and writing to it then throws an uncaught TypeError. Nothing is left
  // half-rendered by bailing out - the route they moved to owns the view now.
  if (!wrap) return;
  if (!coupons.length) {
    wrap.innerHTML = `<div class="empty-state">No coupons yet.</div>`;
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead><tr><th>Code</th><th>Discount</th><th>Min Order</th><th>Placement</th><th>Status</th><th></th></tr></thead>
      <tbody>
        ${coupons.map(c => `
          <tr>
            <td><b>${esc(c.code)}</b><div style="color:var(--text-dim);font-size:11px;">${esc(c.title || "")}</div></td>
            <td>${c.type === "percent" ? `${c.value}%` : `₹${c.value}`}${c.max_discount ? ` (max ₹${c.max_discount})` : ""}</td>
            <td>₹${c.min_order}</td>
            <td>${esc(c.placement || "—")}</td>
            <td><span class="badge ${c.is_active ? "on" : "off"}">${c.is_active ? "Active" : "Off"}</span></td>
            <td class="actions">
              <button class="btn secondary" onclick="openCouponForm('${c.id}')">Edit</button>
              <button class="btn danger" onclick="removeCoupon('${c.id}', this)">Delete</button>
            </td>
          </tr>`).join("")}
      </tbody>
    </table>
  `;
}

function openCouponForm(id) {
  const c = id ? window._COUPONS_CACHE.find(x => x.id === id) : null;
  openModal(`
    <h2>${c ? "Edit" : "Add"} Coupon</h2>
    <div id="formMsg"></div>
    <form id="couponForm">
      <div class="two-col">
        <div><label>Code</label><input id="f_code" value="${esc(c?.code || "")}" required style="text-transform:uppercase"></div>
        <div><label>Type</label>
          <select id="f_type">
            <option value="percent" ${!c || c.type === "percent" ? "selected" : ""}>Percent off</option>
            <option value="flat" ${c?.type === "flat" ? "selected" : ""}>Flat amount off</option>
          </select>
        </div>
      </div>
      <div class="two-col">
        <div><label>Value</label><input id="f_value" type="number" value="${c?.value ?? ""}" required></div>
        <div><label>Max discount (₹, for percent, optional)</label><input id="f_max" type="number" value="${c?.max_discount ?? ""}"></div>
      </div>
      <label>Minimum order value (₹)</label><input id="f_min" type="number" value="${c?.min_order ?? 0}">
      <label>Title / banner text</label><input id="f_title" value="${esc(c?.title || "")}">
      <label>Banner image URL (optional)</label><input id="f_banner" value="${esc(c?.banner_image || "")}">
      <label>Placement</label>
      <select id="f_placement">
        <option value="" ${!c?.placement ? "selected" : ""}>— none —</option>
        <option value="home_hero" ${c?.placement === "home_hero" ? "selected" : ""}>Homepage hero</option>
        <option value="home_strip" ${c?.placement === "home_strip" ? "selected" : ""}>Homepage strip</option>
        <option value="mega_menu" ${c?.placement === "mega_menu" ? "selected" : ""}>Mega menu</option>
      </select>
      <label class="inline"><input type="checkbox" id="f_active" ${!c || c.is_active ? "checked" : ""}> Active</label>
      <div class="modal-actions">
        <button type="button" class="btn secondary" onclick="closeModal()">Cancel</button>
        <button type="submit" class="btn">${c ? "Save" : "Create"}</button>
      </div>
    </form>
  `);
  document.getElementById("couponForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const num = (v) => (v === "" || v === null ? null : Number(v));
    const data = {
      code: document.getElementById("f_code").value.trim().toUpperCase(),
      type: document.getElementById("f_type").value,
      value: Number(document.getElementById("f_value").value),
      max_discount: num(document.getElementById("f_max").value),
      min_order: Number(document.getElementById("f_min").value || 0),
      title: document.getElementById("f_title").value.trim(),
      banner_image: document.getElementById("f_banner").value.trim() || null,
      placement: document.getElementById("f_placement").value || null,
      is_active: document.getElementById("f_active").checked,
    };
    const btn = e.target.querySelector('button[type="submit"]');
    try {
      await withBusy(btn, c ? "Saving…" : "Creating…", () =>
        c ? Api.updateCoupon(c.id, data) : Api.createCoupon(data));
      closeModal();
      loadCoupons();
    } catch (err) {
      document.getElementById("formMsg").innerHTML = `<div class="msg error">${esc(err.message)}</div>`;
    }
  });
}

async function removeCoupon(id, btn) {
  if (!confirm("Delete this coupon?")) return;
  try { await withBusy(btn, "Deleting…", () => Api.deleteCoupon(id)); loadCoupons(); }
  catch (err) { alert(err.message); }
}
