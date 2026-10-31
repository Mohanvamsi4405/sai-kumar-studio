routes.arrange = renderArrange;

async function renderArrange(params) {
  const view = document.getElementById("view");
  const catParam = params?.get ? params.get("cat") : null;

  const pages = await Api.pages();
  const allCats = await allCategoriesAcrossPages(pages);
  if (!allCats.length) {
    view.innerHTML = `<header class="page-head"><h1>Arrange</h1></header><div class="empty-state">No categories yet.</div>`;
    return;
  }
  const categoryId = catParam && allCats.some(c => c.id === catParam) ? catParam : allCats[0].id;

  view.innerHTML = `
    <header class="page-head"><h1>Arrange Products</h1></header>
    <div class="toolbar">
      <select id="arrangeCatSelect">${allCats.map(c => `<option value="${c.id}" ${c.id === categoryId ? "selected" : ""}>${esc(c.pageName)} — ${esc(c.name)}</option>`).join("")}</select>
      <button class="btn secondary" id="toggleAddBtn">+ Quick Add Product</button>
      <button class="btn" id="saveArrangeBtn">💾 Save Order</button>
    </div>
    <div id="quickAddWrap"></div>
    <div id="arrangeList"></div>
  `;
  document.getElementById("arrangeCatSelect").addEventListener("change", (e) => {
    location.hash = `#/arrange?cat=${e.target.value}`;
  });
  document.getElementById("toggleAddBtn").addEventListener("click", () => toggleQuickAdd(categoryId));
  document.getElementById("saveArrangeBtn").addEventListener("click", async (e) => {
    try {
      await withBusy(e.currentTarget, "Saving…", () => Api.setArrange(categoryId, window._ARRANGE_ITEMS.map(i => i.id)));
      alert("Order saved.");
    } catch (err) { alert(err.message); }
  });
  await loadArrangeList(categoryId);
}

async function loadArrangeList(categoryId) {
  const data = await Api.arrange(categoryId);
  // Bail out if the admin navigated to another section while this request was in
  // flight - the elements below belong to a view that is no longer in the document,
  // and writing to them throws an uncaught TypeError (see coupons.js).
  if (!document.getElementById("arrangeList")) return;
  window._ARRANGE_CAT = data.category;
  window._ARRANGE_ITEMS = data.items;
  renderDraggableList(document.getElementById("arrangeList"), data.items, {});
}

function toggleQuickAdd(categoryId) {
  const wrap = document.getElementById("quickAddWrap");
  if (wrap.innerHTML) { wrap.innerHTML = ""; return; }
  wrap.innerHTML = `
    <form id="quickAddForm" class="settings-panel">
      <div class="two-col">
        <div><label>Title</label><input id="qa_title" required minlength="2" maxlength="120"></div>
        <div><label>Type</label>
          <select id="qa_type"><option value="product">Product</option><option value="service">Service</option></select>
        </div>
      </div>
      <div class="two-col">
        <div><label>Price (₹)</label><input id="qa_price" type="number" required></div>
        <div><label>MRP (₹, optional)</label><input id="qa_mrp" type="number"></div>
      </div>
      <label>Image URL (optional)</label><input id="qa_img">
      <div class="modal-actions" style="justify-content:flex-start;">
        <button type="submit" class="btn">Add</button>
        <span class="save-msg" style="color:var(--text-dim);font-size:12px;"></span>
      </div>
    </form>
  `;
  document.getElementById("quickAddForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("qa_title").value.trim();
    const price = Number(document.getElementById("qa_price").value);
    const mrp = document.getElementById("qa_mrp").value;
    const img = document.getElementById("qa_img").value.trim();
    const msg = e.target.querySelector(".save-msg");
    const btn = e.target.querySelector('button[type="submit"]');
    try {
      await withBusy(btn, "Adding…", () => Api.createProduct({
        category_id: categoryId,
        title,
        slug: `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}-${Date.now().toString(36)}`,
        type: document.getElementById("qa_type").value,
        price,
        mrp: mrp ? Number(mrp) : null,
        media: img ? [{ url: img }] : [],
      }));
      wrap.innerHTML = "";
      loadArrangeList(categoryId);
    } catch (err) {
      msg.textContent = err.message;
    }
  });
}
