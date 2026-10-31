routes.homepage = renderHomepage;

// Mirrors the exact fallback public_homepage() (backend/app/routers/catalog.py)
// uses when nothing has been curated yet: the first 8 active categories/products,
// in their existing sort order. Kept in sync with that limit so this builder's
// "on" state always matches what's actually live on the storefront right now.
const HOMEPAGE_AUTO_COUNT = 8;

async function renderHomepage() {
  const view = document.getElementById("view");
  view.innerHTML = `
    <header class="page-head">
      <h1>Homepage Builder</h1>
      <div>
        <button class="btn secondary" id="resetHomepageBtn">Reset to automatic</button>
        <button class="btn" id="saveHomepageBtn">Save & Freeze Layout</button>
      </div>
    </header>
    <p style="color:var(--text-dim);font-size:13px;">Drag to reorder, use the checkbox to hide an item.</p>
    <div id="homeAutoNotice"></div>
    <h3>Featured Categories</h3>
    <div id="homeCategories"></div>
    <h3 style="margin-top:24px;">Featured Products</h3>
    <div id="homeProducts"></div>
  `;
  const data = await Api.homepage();
  // Bail out if the admin navigated to another section while this request was in
  // flight - the elements below belong to a view that is no longer in the document,
  // and writing to them throws an uncaught TypeError (see coupons.js).
  if (!document.getElementById("homeAutoNotice")) return;
  const isAutomatic = !data.layout.category_ids.length && !data.layout.product_ids.length;

  // Nothing curated yet doesn't mean the homepage is blank - the storefront
  // still shows the first 8 of each (see HOMEPAGE_AUTO_COUNT above), so this
  // builder used to be misleading: it marked every single row "off" (dimmed)
  // in that state, looking broken/empty when the live site wasn't. Defaulting
  // the same first-8 rows to "on" here keeps what's checked in sync with
  // what's actually showing, until the admin explicitly saves a real pick.
  document.getElementById("homeAutoNotice").innerHTML = isAutomatic
    ? `<p class="msg" style="background:var(--panel-2);color:var(--text-dim);">
         Nothing has been picked yet, so the homepage is automatically showing the first ${HOMEPAGE_AUTO_COUNT} active categories and first ${HOMEPAGE_AUTO_COUNT} active products below (already checked). Adjust and hit "Save & Freeze Layout" to lock in your own picks instead.
       </p>`
    : "";

  const categoryItems = workingList(data.all.categories, data.layout.category_ids, (_, i) => i < HOMEPAGE_AUTO_COUNT);
  const productItems = workingList(data.all.products, data.layout.product_ids, (_, i) => i < HOMEPAGE_AUTO_COUNT);

  renderDraggableList(document.getElementById("homeCategories"), categoryItems, { showToggle: true });
  renderDraggableList(document.getElementById("homeProducts"), productItems, { showToggle: true });

  window._HOME_CATS = categoryItems;
  window._HOME_PRODS = productItems;

  document.getElementById("saveHomepageBtn").addEventListener("click", async (e) => {
    try {
      await withBusy(e.currentTarget, "Saving…", () => Api.setHomepage({
        category_ids: window._HOME_CATS.filter(i => i.on !== false).map(i => i.id),
        product_ids: window._HOME_PRODS.filter(i => i.on !== false).map(i => i.id),
      }));
      alert("Homepage layout saved.");
      renderHomepage();
    } catch (err) { alert(err.message); }
  });

  document.getElementById("resetHomepageBtn").addEventListener("click", async (e) => {
    if (!confirm("Reset the homepage to automatic ordering?")) return;
    try { await withBusy(e.currentTarget, "Resetting…", () => Api.resetHomepage()); renderHomepage(); }
    catch (err) { alert(err.message); }
  });
}

// Merges the backend's `all` list with the saved order: saved ids first (in saved
// order, shown "on"), then anything not yet curated appended with `on` decided by
// `defaultOn(item, index)` when nothing has been saved yet, or "off" once curation
// exists (curation is authoritative at that point - unlisted items really are hidden).
function workingList(allItems, savedIds, defaultOn) {
  const bySavedOrder = [];
  const seen = new Set();
  savedIds.forEach(id => {
    const item = allItems.find(i => i.id === id);
    if (item) { bySavedOrder.push({ ...item, on: true }); seen.add(id); }
  });
  allItems.forEach((item, index) => {
    if (!seen.has(item.id)) {
      bySavedOrder.push({ ...item, on: savedIds.length ? false : defaultOn(item, index) });
    }
  });
  return bySavedOrder;
}
