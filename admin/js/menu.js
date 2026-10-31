routes.menu = renderMenuEditor;

/* Editor for the storefront's category menu bars (Home / Photography / Gifts /
   ... and their mega dropdowns). There are several menus - the main one most
   pages share, plus the Gift Shop, Corporate and Photography pages' own - picked
   with the tabs at the top. Each is saved to its own setting and rendered on the
   storefront by js/shared/site-menu.js. Until one is saved, the backend serves
   what used to be hardcoded in that page's HTML.

   Every link points at a *target* picked from the catalog - a page, a category
   or a product (custom URL only as a last resort) - and the backend builds the
   actual URL from live data, so renames don't break links and hidden
   categories/products drop out of the menu on their own. */

let MENU_STATE = null;     // { items: [...], benefits: [...] } being edited
let MENU_TARGETS = null;   // { pages, categories, products } for the pickers
let MENU_NAME = "main";    // which menu is open
let MENU_LIST = [];        // [{ name, label, layout, pages }]
let MENU_SELECTED = 0;     // index of the item open in the editor pane
let MENU_DIRTY = false;

const MENU_BADGES = ["NEW", "HOT", "POPULAR", "BESTSELLER", "SALE"];

// Studio menu: an item pointing at a Studio category with no columns of its own
// gets its dropdown filled automatically with that category's packages.
function isAutoDropdown(it) {
  return menuLayout() === "studio" && !it.columns.length && it.target && it.target.type === "category" && it.target.page === "studio";
}

function menuLayout() {
  return (MENU_LIST.find(m => m.name === MENU_NAME) || {}).layout || "standard";
}

async function renderMenuEditor(params) {
  MENU_NAME = (params && params.get && params.get("name")) || "main";
  const view = document.getElementById("view");
  view.innerHTML = `
    <header class="page-head">
      <h1>Menu</h1>
      <div>
        <button class="btn secondary" id="resetMenuBtn">Reset to default</button>
        <button class="btn" id="saveMenuBtn">Save Menu</button>
      </div>
    </header>
    <div class="menu-tabs" id="menuTabs"></div>
    <p class="menu-intro" id="menuIntro">The category bar under the site header. Pick an item on the left to edit it and its dropdown.</p>
    <div id="menuNotice"></div>
    <div class="menu-editor" id="menuEditor">${LOADING}</div>
  `;

  let data;
  try {
    [data, MENU_TARGETS] = await Promise.all([Api.menu(MENU_NAME), Api.menuTargets()]);
  } catch (err) {
    const el = document.getElementById("menuEditor");
    if (el) el.innerHTML = `<div class="msg error">${esc(err.message)}</div>`;
    return;
  }
  // Navigated away while loading - this view no longer owns the page.
  if (!document.getElementById("menuEditor")) return;

  MENU_SELECTED = 0;
  loadMenuState(data);

  document.getElementById("saveMenuBtn").addEventListener("click", async (e) => {
    try {
      const saved = await withBusy(e.currentTarget, "Saving…", () => Api.setMenu(MENU_NAME, menuPayload()));
      loadMenuState(saved);
      flashMenuNotice("Menu saved — it's live on the storefront now.", "ok");
    } catch (err) { flashMenuNotice(err.message, "error"); }
  });

  document.getElementById("resetMenuBtn").addEventListener("click", async (e) => {
    if (!confirm("Discard the saved menu and go back to the default one?")) return;
    try {
      const data = await withBusy(e.currentTarget, "Resetting…", () => Api.resetMenu(MENU_NAME));
      MENU_SELECTED = 0;
      loadMenuState(data);
      flashMenuNotice("Menu reset to default.", "ok");
    } catch (err) { flashMenuNotice(err.message, "error"); }
  });
}

function paintMenuTabs() {
  const tabs = document.getElementById("menuTabs");
  if (!tabs) return;
  tabs.innerHTML = MENU_LIST.map(m => `
    <button type="button" class="menu-tab ${m.name === MENU_NAME ? "active" : ""}" data-menu="${esc(m.name)}">
      <strong>${esc(m.label)}</strong><small>${esc(m.pages)}</small>
    </button>`).join("");
  tabs.querySelectorAll("[data-menu]").forEach(b => b.addEventListener("click", () => {
    if (b.dataset.menu === MENU_NAME) return;
    if (MENU_DIRTY && !confirm("You have unsaved changes to this menu. Discard them?")) return;
    MENU_DIRTY = false;
    MENU_SELECTED = 0;
    location.hash = `#/menu?name=${encodeURIComponent(b.dataset.menu)}`;
  }));
}

function loadMenuState(data) {
  if (data.menus) MENU_LIST = data.menus;
  paintMenuTabs();
  MENU_STATE = JSON.parse(JSON.stringify(data.menu));
  MENU_STATE.benefits = MENU_STATE.benefits || [];
  MENU_STATE.items.forEach(it => {
    if (it.is_active === undefined) it.is_active = true;
    if (it.dropdown_active === undefined) it.dropdown_active = true;
    it.columns = it.columns || [];
    it.columns.forEach(c => {
      if (c.is_active === undefined) c.is_active = true;
      c.style = c.style || "list";
      c.links.forEach(l => { if (l.is_active === undefined) l.is_active = true; });
    });
  });
  if (MENU_SELECTED >= MENU_STATE.items.length) MENU_SELECTED = 0;
  setMenuDirty(false);
  document.getElementById("menuNotice").innerHTML = data.is_default
    ? `<p class="msg" style="background:var(--panel-2);color:var(--text-dim);">You're seeing the default menu (nothing saved yet). Edit it and hit "Save Menu" to take control of it.</p>`
    : "";
  paintMenuEditor();
}

function setMenuDirty(dirty) {
  MENU_DIRTY = dirty;
  const btn = document.getElementById("saveMenuBtn");
  if (btn && !btn.disabled) btn.textContent = dirty ? "Save Menu •" : "Save Menu";
}

function flashMenuNotice(text, kind) {
  const el = document.getElementById("menuNotice");
  if (!el) return;
  el.innerHTML = `<p class="msg ${kind}">${esc(text)}</p>`;
  if (kind === "ok") setTimeout(() => { if (el.isConnected) el.innerHTML = ""; }, 3000);
}

function menuChanged() { setMenuDirty(true); paintMenuEditor(); }

function menuPayload() {
  return {
    items: MENU_STATE.items.map(it => ({
      label: it.label, target: it.target, is_active: it.is_active !== false, dropdown_active: it.dropdown_active !== false,
      in_more: !!it.in_more,
      columns: it.columns.map(c => ({
        title: c.title || "", style: c.style || "list", is_active: c.is_active !== false,
        links: c.links.map(l => l.heading != null
          ? { heading: l.heading, is_active: l.is_active !== false }
          : { label: l.label, badge: l.badge || "", is_active: l.is_active !== false, target: l.target,
              description: l.description || "", image: l.image || "" }),
        cta: c.cta && (c.cta.title || c.cta.text || c.cta.button) ? c.cta : null,
      })),
      promo: it.promo && (it.promo.image || it.promo.title || it.promo.subtitle) ? it.promo : null,
    })),
    benefits: (MENU_STATE.benefits || []).filter(b => b.title || b.text),
  };
}

/* ---------------------------------------------------------------- target helpers */

function menuPageName(slug) {
  return (MENU_TARGETS.pages.find(p => p.slug === slug) || {}).name || slug;
}
function menuFindCategory(page, slug) {
  return MENU_TARGETS.categories.find(c => c.page === page && c.slug === slug);
}
function menuFindProduct(id) {
  return MENU_TARGETS.products.find(p => p.id === id);
}

// { text, warn } describing where a target goes, for the editor rows. The page
// name is left out when it's the same section as the menu item (`ctxPage`).
function describeTarget(t, ctxPage) {
  if (!t) return { text: "Not linked yet", warn: true };
  if (t.type === "page") return { text: `Page · ${menuPageName(t.page)}` };
  if (t.type === "category") {
    const c = menuFindCategory(t.page, t.category);
    const kw = t.keyword ? ` · search “${t.keyword}”` : "";
    const where = t.page === ctxPage ? "" : ` (${menuPageName(t.page)})`;
    if (!c) return { text: `Category · ${t.category}${where}${kw} — not found in catalog`, warn: true };
    return { text: `Category · ${c.name}${where}${kw}${c.is_active ? "" : " — hidden, won't show"}`, warn: !c.is_active };
  }
  if (t.type === "product") {
    const p = menuFindProduct(t.product_id);
    if (!p) return { text: "Product · deleted — pick another", warn: true };
    return { text: `Product · ${p.title}${p.is_active ? "" : " — hidden, won't show"}`, warn: !p.is_active };
  }
  return { text: `Custom URL · ${t.url}` };
}

// A sensible label when the admin picks a target and hasn't typed one.
function defaultLabelFor(t) {
  if (!t) return "";
  if (t.type === "page") return menuPageName(t.page);
  if (t.type === "category") return (menuFindCategory(t.page, t.category) || {}).name || "";
  if (t.type === "product") return (menuFindProduct(t.product_id) || {}).title || "";
  return "";
}

/* ---------------------------------------------------------------- layout */

function paintMenuEditor() {
  const wrap = document.getElementById("menuEditor");
  if (!wrap) return;
  const items = MENU_STATE.items;
  const it = items[MENU_SELECTED];
  wrap.innerHTML = `
    <aside class="menu-list">
      <div class="menu-list-title">Menu items <span>(drag to reorder)</span></div>
      <div id="menuItemList">
        ${items.map((x, i) => {
          const linkCount = x.columns.reduce((n, c) => n + c.links.filter(l => l.heading == null).length, 0);
          let sub = !x.is_active ? "Hidden"
            : isAutoDropdown(x) ? (x.dropdown_active === false ? "Dropdown hidden" : "Automatic dropdown")
            : !linkCount ? "Link only" : x.dropdown_active === false ? "Dropdown hidden" : `Dropdown · ${linkCount} links`;
          if (x.in_more && menuLayout() === "studio") sub += " · under More";
          return `
          <div class="menu-list-row ${i === MENU_SELECTED ? "selected" : ""} ${x.is_active ? "" : "off"}" data-i="${i}">
            <span class="drag-handle">⠿</span>
            <span class="menu-list-text"><strong>${esc(x.label)}</strong><small>${esc(sub)}</small></span>
            ${visToggle(x.is_active, "item-vis", "Show this item in the menu")}
          </div>`;
        }).join("")}
      </div>
      <button class="btn secondary menu-add-item" id="addMenuItemBtn">+ Add menu item</button>
    </aside>
    <section class="menu-detail">${it ? itemEditorHtml(it) : `<div class="empty-state">Add a menu item to get started.</div>`}</section>
  `;

  const m = MENU_LIST.find(x => x.name === MENU_NAME);
  const intro = document.getElementById("menuIntro");
  if (intro && m) intro.textContent = `Shown on: ${m.pages}. Pick an item on the left to edit it and its dropdown.`;

  wireItemList(wrap);
  if (it) wireItemEditor(wrap.querySelector(".menu-detail"), it);
}

function visToggle(on, act, title) {
  return `<button type="button" class="vis-toggle ${on ? "on" : ""}" data-act="${act}" title="${esc(title)}">${on ? "Shown" : "Hidden"}</button>`;
}

function itemEditorHtml(it) {
  const d = describeTarget(it.target);
  const hasLinks = it.columns.length > 0;
  const auto = isAutoDropdown(it);
  return `
    <div class="menu-card">
      <div class="menu-card-head">
        <h3>${esc(it.label || "Menu item")}</h3>
        <button type="button" class="btn danger" data-act="item-delete">Delete item</button>
      </div>
      <div class="two-col">
        <div><label>Label</label><input id="mItemLabel" value="${esc(it.label)}" maxlength="60"></div>
        <div><label>Opens</label>
          <div class="target-field ${d.warn ? "warn" : ""}">
            <span>${esc(d.text)}</span>
            <button type="button" class="btn secondary" data-act="item-target">Change</button>
          </div>
        </div>
      </div>
      <label class="inline"><input type="checkbox" data-act="item-active" ${it.is_active ? "checked" : ""}> Show this item in the menu</label>
      ${menuLayout() === "studio" ? `<label class="inline"><input type="checkbox" data-act="item-more" ${it.in_more ? "checked" : ""}> Put it under the "More" dropdown</label>` : ""}
    </div>

    <div class="menu-card">
      <div class="menu-card-head">
        <h3>Dropdown</h3>
        ${hasLinks || auto ? `<label class="inline menu-switch"><input type="checkbox" data-act="dd-active" ${it.dropdown_active !== false ? "checked" : ""}> Show dropdown</label>` : ""}
      </div>
      ${auto ? `<p class="menu-auto-note ${it.dropdown_active === false ? "menu-dimmed" : ""}"><strong>Automatic.</strong> This dropdown lists every package in
          “${esc((menuFindCategory("studio", it.target.category) || {}).name || it.target.category)}” with a “Starting at ₹…” card, and keeps itself up to date
          as you add, hide or reorder packages in <a href="#/products">Products &amp; Packages</a>. Add a column only if you want to write this dropdown yourself instead.</p>`
        : !hasLinks ? `<p class="form-hint">No dropdown — this item is a plain link. Add a column to give it one.</p>` : ""}
      <div class="${it.dropdown_active === false ? "menu-dimmed" : ""}">
        ${it.columns.map((c, ci) => columnHtml(c, ci, it.columns.length, it.target && it.target.page)).join("")}
      </div>
      <button type="button" class="btn secondary" data-act="col-add" ${it.columns.length >= 6 ? "disabled" : ""}>+ Add column</button>
    </div>

    ${hasLinks ? promoHtml(it) : ""}
    ${menuLayout() === "photography" ? benefitsHtml() : ""}
  `;
}

function benefitsHtml() {
  const rows = MENU_STATE.benefits;
  return `
    <div class="menu-card">
      <div class="menu-card-head"><h3>Benefits strip <small>shown along the bottom of every dropdown in this menu</small></h3></div>
      ${rows.map((b, i) => `
        <div class="menu-benefit-row" data-benefit="${i}">
          <input data-bf="icon" value="${esc(b.icon)}" maxlength="8" placeholder="📷" class="menu-benefit-icon">
          <input data-bf="title" value="${esc(b.title)}" maxlength="60" placeholder="Title (e.g. Expert Photographers)">
          <input data-bf="text" value="${esc(b.text)}" maxlength="100" placeholder="Short text">
          <button type="button" class="icon-btn danger" data-act="benefit-delete" title="Delete">🗑</button>
        </div>`).join("") || `<p class="form-hint">No benefits — the strip is hidden.</p>`}
      <button type="button" class="btn secondary" data-act="benefit-add" ${rows.length >= 6 ? "disabled" : ""}>+ Add benefit</button>
    </div>`;
}

function columnHtml(c, ci, count, ctxPage) {
  const linkCount = c.links.filter(l => l.heading == null).length;
  return `
    <div class="menu-col-card ${c.is_active ? "" : "off"} ${c._collapsed ? "collapsed" : ""}" data-col="${ci}">
      <div class="menu-col-head">
        <button type="button" class="icon-btn" data-act="col-collapse" title="${c._collapsed ? "Expand" : "Collapse"}">${c._collapsed ? "▸" : "▾"}</button>
        <input data-act="col-title" value="${esc(c.title)}" placeholder="Column heading (e.g. Photo Frames)" maxlength="80">
        ${menuLayout() === "photography" ? `
          <select data-act="col-style" title="How this column's links look">
            <option value="cards" ${c.style === "cards" ? "selected" : ""}>Photo cards</option>
            <option value="list" ${c.style !== "cards" ? "selected" : ""}>Text links</option>
          </select>` : ""}
        ${visToggle(c.is_active, "col-vis", "Show this column")}
        <button type="button" class="icon-btn" data-act="col-left" title="Move column left" ${ci === 0 ? "disabled" : ""}>◀</button>
        <button type="button" class="icon-btn" data-act="col-right" title="Move column right" ${ci === count - 1 ? "disabled" : ""}>▶</button>
        <button type="button" class="icon-btn danger" data-act="col-delete" title="Delete column">🗑</button>
      </div>
      ${c._collapsed ? `<div class="menu-col-summary">${linkCount} link${linkCount === 1 ? "" : "s"} — click ▸ to edit</div>` : `
      <div class="menu-link-list" data-col="${ci}">
        ${c.links.map((l, li) => linkRowHtml(l, li, ctxPage, c.style === "cards")).join("") || `<div class="form-hint" style="padding:8px 4px;">No links yet.</div>`}
      </div>
      <div class="menu-col-foot">
        <button type="button" class="btn secondary" data-act="link-add">+ Add link</button>
        <button type="button" class="btn secondary" data-act="heading-add">+ Sub-heading</button>
        ${menuLayout() === "photography" && c.style !== "cards" && !c.cta ? `<button type="button" class="btn secondary" data-act="cta-add">+ Help box</button>` : ""}
      </div>
      ${c.cta ? ctaHtml(c.cta) : ""}`}
    </div>`;
}

function ctaHtml(cta) {
  const d = cta.target ? describeTarget(cta.target) : { text: "Same as the menu item" };
  return `
    <div class="menu-cta">
      <div class="menu-card-head"><strong>Help box</strong><button type="button" class="icon-btn danger" data-act="cta-delete" title="Remove help box">🗑</button></div>
      <div class="two-col">
        <div><label>Heading</label><input data-cf="title" value="${esc(cta.title)}" maxlength="80" placeholder="Need Something Special?"></div>
        <div><label>Button text</label><input data-cf="button" value="${esc(cta.button)}" maxlength="40" placeholder="Contact Us"></div>
      </div>
      <label>Text</label><input data-cf="text" value="${esc(cta.text)}" maxlength="200">
      <label>Button opens</label>
      <div class="target-field ${d.warn ? "warn" : ""}"><span>${esc(d.text)}</span>
        <button type="button" class="btn secondary" data-act="cta-target">Change</button></div>
    </div>`;
}

function cardDefaultImage(t) {
  if (t && t.type === "category") return (menuFindCategory(t.page, t.category) || {}).image || "";
  if (t && t.type === "product") return (menuFindProduct(t.product_id) || {}).image || "";
  return "";
}

function linkRowHtml(l, li, ctxPage, cards) {
  if (l.heading != null) {
    return `
      <div class="menu-link-row is-heading ${l.is_active ? "" : "off"}" data-link="${li}">
        <span class="drag-handle">⠿</span>
        <input data-act="heading-text" value="${esc(l.heading)}" placeholder="Sub-heading" maxlength="80">
        ${visToggle(l.is_active, "link-vis", "Show this sub-heading")}
        <button type="button" class="icon-btn danger" data-act="link-delete" title="Delete">🗑</button>
      </div>`;
  }
  const d = describeTarget(l.target, ctxPage);
  const thumb = cards ? (l.image || cardDefaultImage(l.target)) : "";
  return `
    <div class="menu-link-row ${l.is_active ? "" : "off"}" data-link="${li}">
      <span class="drag-handle">⠿</span>
      ${cards ? (thumb ? `<img class="menu-link-thumb" src="${esc(thumb)}" alt="" onerror="this.style.visibility='hidden'">` : `<span class="menu-link-thumb"></span>`) : ""}
      <button type="button" class="menu-link-main" data-act="link-edit" title="Edit link">
        <strong>${esc(l.label)}${l.badge ? ` <span class="menu-badge">${esc(l.badge)}</span>` : ""}</strong>
        <small class="${d.warn ? "warn" : ""}">${esc(d.text)}</small>
      </button>
      ${visToggle(l.is_active, "link-vis", "Show this link")}
      <button type="button" class="icon-btn" data-act="link-edit" title="Edit">✎</button>
      <button type="button" class="icon-btn danger" data-act="link-delete" title="Delete">🗑</button>
    </div>`;
}

function promoHtml(it) {
  const p = it.promo || {};
  const d = p.target ? describeTarget(p.target) : { text: "Same as the menu item" };
  return `
    <div class="menu-card">
      <div class="menu-card-head"><h3>Promo card <small>optional · shown at the right of the dropdown</small></h3></div>
      <div class="menu-promo-grid">
        <div>
          <label>Image URL <span class="form-hint">(copy one from the Media Library)</span></label>
          <input data-pf="image" value="${esc(p.image || "")}" placeholder="https://…">
          <div class="two-col">
            <div><label>Title</label><input data-pf="title" value="${esc(p.title || "")}" maxlength="80" placeholder="e.g. Gift Combos"></div>
            <div><label>Subtitle</label><input data-pf="subtitle" value="${esc(p.subtitle || "")}" maxlength="120" placeholder="e.g. Bestsellers from ₹449"></div>
          </div>
          ${menuLayout() === "photography" ? `
          <div class="two-col">
            <div><label>Tag</label><input data-pf="tag" value="${esc(p.tag || "")}" maxlength="40" placeholder="e.g. Special Offer"></div>
            <div><label>Button text</label><input data-pf="button" value="${esc(p.button || "")}" maxlength="40" placeholder="e.g. View All Packages →"></div>
          </div>` : ""}
          <label>Opens</label>
          <div class="target-field ${d.warn ? "warn" : ""}">
            <span>${esc(d.text)}</span>
            <button type="button" class="btn secondary" data-act="promo-target">Change</button>
            ${p.target ? `<button type="button" class="btn secondary" data-act="promo-target-clear">Use item's</button>` : ""}
          </div>
        </div>
        <div class="menu-promo-preview">${p.image ? `<img src="${esc(p.image)}" alt="" onerror="this.style.visibility='hidden'">` : `<span>No image</span>`}</div>
      </div>
    </div>`;
}

/* ---------------------------------------------------------------- wiring */

// Drag-and-drop reordering of `arr` via rows carrying data-<key>="index". Only the
// ⠿ handle starts a drag, so text inside the row's inputs stays selectable.
function wireSortable(container, rowSelector, key, arr, onMoved) {
  let from = null;
  container.querySelectorAll(rowSelector).forEach(row => {
    row.draggable = false;
    const handle = row.querySelector(".drag-handle");
    if (handle) {
      handle.addEventListener("mousedown", () => { row.draggable = true; });
      handle.addEventListener("mouseup", () => { row.draggable = false; });
    }
    row.addEventListener("dragstart", (e) => {
      from = Number(row.dataset[key]);
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => { row.classList.remove("dragging"); row.draggable = false; from = null; });
    row.addEventListener("dragover", (e) => { if (from !== null) { e.preventDefault(); row.classList.add("drag-over"); } });
    row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      row.classList.remove("drag-over");
      const to = Number(row.dataset[key]);
      if (from === null || from === to) return;
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      from = null;
      onMoved(to);
    });
  });
}

function wireItemList(wrap) {
  const items = MENU_STATE.items;
  const list = wrap.querySelector("#menuItemList");
  list.addEventListener("click", (e) => {
    const row = e.target.closest(".menu-list-row");
    if (!row) return;
    const i = Number(row.dataset.i);
    if (e.target.closest('[data-act="item-vis"]')) { items[i].is_active = !items[i].is_active; menuChanged(); return; }
    MENU_SELECTED = i;
    paintMenuEditor();
  });
  const selectedItem = items[MENU_SELECTED];
  wireSortable(list, ".menu-list-row", "i", items, () => {
    MENU_SELECTED = Math.max(0, items.indexOf(selectedItem));  // keep the open item open
    menuChanged();
  });
  wrap.querySelector("#addMenuItemBtn").addEventListener("click", () => {
    openTargetPicker({ title: "Add menu item", withLabel: true, onSave: ({ target, label }) => {
      items.push({ label, target, is_active: true, dropdown_active: true, columns: [], promo: null });
      MENU_SELECTED = items.length - 1;
      menuChanged();
    } });
  });
}

function wireItemEditor(pane, it) {
  const items = MENU_STATE.items;

  pane.querySelector("#mItemLabel").addEventListener("input", (e) => {
    it.label = e.target.value;
    setMenuDirty(true);
    const listRow = document.querySelector(`.menu-list-row[data-i="${MENU_SELECTED}"] strong`);
    if (listRow) listRow.textContent = it.label;
  });
  pane.querySelector("#mItemLabel").addEventListener("change", () => paintMenuEditor());

  // Plain text inputs: update state without repainting (keeps focus).
  pane.querySelectorAll('[data-act="col-title"]').forEach(inp => inp.addEventListener("input", () => {
    it.columns[Number(inp.closest("[data-col]").dataset.col)].title = inp.value; setMenuDirty(true);
  }));
  pane.querySelectorAll('[data-act="heading-text"]').forEach(inp => inp.addEventListener("input", () => {
    const ci = Number(inp.closest(".menu-col-card").dataset.col);
    it.columns[ci].links[Number(inp.closest("[data-link]").dataset.link)].heading = inp.value; setMenuDirty(true);
  }));
  pane.querySelectorAll("[data-pf]").forEach(inp => inp.addEventListener("input", () => {
    it.promo = it.promo || { image: "", title: "", subtitle: "", target: null };
    it.promo[inp.dataset.pf] = inp.value;
    if (inp.dataset.pf === "image") {
      const prev = pane.querySelector(".menu-promo-preview");
      const src = inp.value.trim();
      prev.innerHTML = src ? `<img src="${esc(src)}" alt="" onerror="this.style.visibility='hidden'">` : `<span>No image</span>`;
    }
    setMenuDirty(true);
  }));

  pane.querySelectorAll("[data-cf]").forEach(inp => inp.addEventListener("input", () => {
    it.columns[Number(inp.closest(".menu-col-card").dataset.col)].cta[inp.dataset.cf] = inp.value; setMenuDirty(true);
  }));
  pane.querySelectorAll("[data-bf]").forEach(inp => inp.addEventListener("input", () => {
    MENU_STATE.benefits[Number(inp.closest("[data-benefit]").dataset.benefit)][inp.dataset.bf] = inp.value; setMenuDirty(true);
  }));

  pane.addEventListener("change", (e) => {
    const act = e.target.dataset.act;
    if (act === "col-style") {
      const col = it.columns[Number(e.target.closest(".menu-col-card").dataset.col)];
      col.style = e.target.value;
      if (col.style === "cards") col.cta = null;
      return menuChanged();
    }
    if (act === "item-active") { it.is_active = e.target.checked; menuChanged(); }
    if (act === "item-more") { it.in_more = e.target.checked; menuChanged(); }
    if (act === "dd-active") { it.dropdown_active = e.target.checked; menuChanged(); }
  });

  pane.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn || btn.tagName === "INPUT") return;
    const act = btn.dataset.act;
    const colEl = btn.closest(".menu-col-card");
    const ci = colEl ? Number(colEl.dataset.col) : -1;
    const col = ci >= 0 ? it.columns[ci] : null;
    const rowEl = btn.closest("[data-link]");
    const li = rowEl ? Number(rowEl.dataset.link) : -1;

    switch (act) {
      case "item-delete":
        if (!confirm(`Delete "${it.label}" from the menu?`)) return;
        items.splice(MENU_SELECTED, 1);
        MENU_SELECTED = Math.max(0, MENU_SELECTED - 1);
        return menuChanged();
      case "item-target":
        return openTargetPicker({ title: `Where should "${it.label}" go?`, target: it.target, onSave: ({ target }) => { it.target = target; menuChanged(); } });
      case "col-add":
        it.columns.push({ title: "", is_active: true, links: [] });
        return menuChanged();
      case "col-vis": col.is_active = !col.is_active; return menuChanged();
      case "col-collapse": col._collapsed = !col._collapsed; return paintMenuEditor();
      case "col-left": case "col-right": {
        const to = ci + (act === "col-left" ? -1 : 1);
        it.columns.splice(to, 0, it.columns.splice(ci, 1)[0]);
        return menuChanged();
      }
      case "col-delete":
        if (col.links.length && !confirm(`Delete the column "${col.title || "untitled"}" and its ${col.links.length} rows?`)) return;
        it.columns.splice(ci, 1);
        return menuChanged();
      case "link-add":
        return openTargetPicker({ title: "Add link", withLabel: true, withBadge: true, withCard: col.style === "cards",
          onSave: ({ target, label, badge, description, image }) => {
            col.links.push({ label, badge, target, is_active: true, description, image }); menuChanged();
          } });
      case "heading-add":
        col.links.push({ heading: "New sub-heading", is_active: true });
        menuChanged();
        pane.querySelector(`.menu-col-card[data-col="${ci}"] .menu-link-row:last-child input`)?.select();
        return;
      case "link-edit": {
        const link = col.links[li];
        return openTargetPicker({ title: "Edit link", withLabel: true, withBadge: true, withCard: col.style === "cards",
          target: link.target, label: link.label, badge: link.badge, description: link.description, image: link.image,
          onSave: ({ target, label, badge, description, image }) => {
            Object.assign(link, { target, label, badge, description, image }); menuChanged();
          } });
      }
      case "link-vis": col.links[li].is_active = !col.links[li].is_active; return menuChanged();
      case "link-delete": col.links.splice(li, 1); return menuChanged();
      case "promo-target":
        return openTargetPicker({ title: "Where should the promo card go?", target: it.promo?.target || it.target, onSave: ({ target }) => {
          it.promo = it.promo || { image: "", title: "", subtitle: "" };
          it.promo.target = target; menuChanged();
        } });
      case "promo-target-clear": it.promo.target = null; return menuChanged();
      case "cta-add": col.cta = { title: "", text: "", button: "Contact Us", target: { type: "page", page: "contact-us" } }; return menuChanged();
      case "cta-delete": col.cta = null; return menuChanged();
      case "cta-target":
        return openTargetPicker({ title: "Where should the help box button go?", target: col.cta.target, onSave: ({ target }) => {
          col.cta.target = target; menuChanged();
        } });
      case "benefit-add": MENU_STATE.benefits.push({ icon: "", title: "", text: "" }); return menuChanged();
      case "benefit-delete": MENU_STATE.benefits.splice(Number(btn.closest("[data-benefit]").dataset.benefit), 1); return menuChanged();
    }
  });

  pane.querySelectorAll(".menu-link-list").forEach(list => {
    const col = it.columns[Number(list.dataset.col)];
    wireSortable(list, ".menu-link-row", "link", col.links, () => menuChanged());
  });
}

/* ---------------------------------------------------------------- link picker modal */

/* Opens a dialog to choose where something links to. With `withLabel`/`withBadge`
   it also edits the link's text and badge. Calls onSave({ target, label, badge }). */
function openTargetPicker({ title, target, label = "", badge = "", description = "", image = "",
                           withLabel = false, withBadge = false, withCard = false, onSave }) {
  let t = target ? { ...target } : { type: "category", page: "", category: "", keyword: "" };
  let labelTouched = !!label;
  const catPages = [...new Set(MENU_TARGETS.categories.map(c => c.page))];
  const customBadge = badge && !MENU_BADGES.includes(badge);

  openModal(`
    <h2>${esc(title)}</h2>
    <div id="formMsg"></div>
    <label>Links to</label>
    <div class="seg" id="tpTabs">
      ${[["category", "Category"], ["product", "Product"], ["page", "Page"], ["url", "Custom URL"]]
        .map(([k, n]) => `<button type="button" data-type="${k}" class="${t.type === k ? "active" : ""}">${n}</button>`).join("")}
    </div>
    <div id="tpBody" class="tp-body"></div>
    ${withLabel ? `<label>Label shown in the menu</label><input id="tpLabel" value="${esc(label)}" maxlength="80" placeholder="Filled in from your pick">` : ""}
    ${withCard ? `
      <label>Short description <span class="form-hint">(optional — shown under the label)</span></label>
      <input id="tpDesc" value="${esc(description)}" maxlength="160" placeholder="e.g. Full ceremony &amp; reception coverage">
      <label>Photo URL <span class="form-hint">(optional — blank uses the category's / product's own photo)</span></label>
      <input id="tpImage" value="${esc(image)}" maxlength="1000" placeholder="https://…">` : ""}
    ${withBadge ? `
      <label>Badge <span class="form-hint">(optional)</span></label>
      <div class="seg seg-wrap" id="tpBadges">
        <button type="button" data-badge="" class="${!badge ? "active" : ""}">None</button>
        ${MENU_BADGES.map(b => `<button type="button" data-badge="${b}" class="${badge === b ? "active" : ""}">${b}</button>`).join("")}
        <button type="button" data-badge="__custom" class="${customBadge ? "active" : ""}">Custom…</button>
      </div>
      <input id="tpBadgeCustom" maxlength="20" placeholder="Badge text" value="${esc(customBadge ? badge : "")}" style="${customBadge ? "" : "display:none;"}margin-top:6px;">` : ""}
    <div class="modal-actions">
      <button type="button" class="btn secondary" id="tpCancel">Cancel</button>
      <button type="button" class="btn" id="tpSave">Done</button>
    </div>
  `);

  const body = document.getElementById("tpBody");
  const labelEl = document.getElementById("tpLabel");
  if (labelEl) labelEl.addEventListener("input", () => { labelTouched = labelEl.value.trim() !== ""; });
  const autoLabel = () => { if (labelEl && !labelTouched) labelEl.value = defaultLabelFor(t); };

  const paintBody = () => {
    if (t.type === "category") {
      const page = t.page && catPages.includes(t.page) ? t.page : catPages[0];
      t.page = page;
      const cats = MENU_TARGETS.categories.filter(c => c.page === page);
      if (!cats.some(c => c.slug === t.category)) t.category = "";
      body.innerHTML = `
        <div class="two-col">
          <div><label>Section</label><select id="tpCatPage">${catPages.map(p => `<option value="${esc(p)}" ${p === page ? "selected" : ""}>${esc(menuPageName(p))}</option>`).join("")}</select></div>
          <div><label>Category</label><select id="tpCat">
            <option value="">— choose —</option>
            ${cats.map(c => `<option value="${esc(c.slug)}" ${c.slug === t.category ? "selected" : ""}>${esc(c.name)}${c.is_active ? "" : " (hidden)"}</option>`).join("")}
          </select></div>
        </div>
        ${page === "gifts" ? `<label>Search word <span class="form-hint">(optional) — opens the category with this typed in its search box, so matching products show first, e.g. "acrylic"</span></label><input id="tpKeyword" value="${esc(t.keyword || "")}" maxlength="60" placeholder="Leave blank to open the whole category">` : ""}`;
      body.querySelector("#tpCatPage").addEventListener("change", (e) => { t.page = e.target.value; t.category = ""; t.keyword = ""; paintBody(); });
      body.querySelector("#tpCat").addEventListener("change", (e) => { t.category = e.target.value; autoLabel(); });
      body.querySelector("#tpKeyword")?.addEventListener("input", (e) => { t.keyword = e.target.value; });
    } else if (t.type === "product") {
      const chosen = t.product_id ? menuFindProduct(t.product_id) : null;
      body.innerHTML = `
        <div id="tpChosen">${chosen ? productChip(chosen) : `<p class="form-hint">No product chosen yet.</p>`}</div>
        <input id="tpSearch" placeholder="Search products by name…" autocomplete="off">
        <div id="tpResults" class="tp-results"></div>`;
      const search = body.querySelector("#tpSearch");
      const results = body.querySelector("#tpResults");
      const showResults = () => {
        const q = search.value.trim().toLowerCase();
        const matches = MENU_TARGETS.products
          .filter(p => !q || p.title.toLowerCase().includes(q) || (p.category_name || "").toLowerCase().includes(q))
          .slice(0, 30);
        results.innerHTML = matches.map(p => `
          <button type="button" class="tp-result ${p.id === t.product_id ? "active" : ""}" data-pid="${esc(p.id)}">
            ${p.image ? `<img src="${esc(p.image)}" alt="" loading="lazy">` : `<span class="tp-noimg"></span>`}
            <span><strong>${esc(p.title)}</strong><small>${esc(menuPageName(p.page))} › ${esc(p.category_name)}${p.is_active ? "" : " · hidden"}</small></span>
          </button>`).join("") || `<p class="form-hint">No product matches.</p>`;
      };
      search.addEventListener("input", showResults);
      results.addEventListener("click", (e) => {
        const b = e.target.closest("[data-pid]");
        if (!b) return;
        t.product_id = b.dataset.pid;
        body.querySelector("#tpChosen").innerHTML = productChip(menuFindProduct(t.product_id));
        results.querySelectorAll(".tp-result").forEach(x => x.classList.toggle("active", x === b));
        autoLabel();
      });
      showResults();
      search.focus();
    } else if (t.type === "page") {
      if (!t.page || !MENU_TARGETS.pages.some(p => p.slug === t.page)) t.page = MENU_TARGETS.pages[0].slug;
      body.innerHTML = `<label>Page</label><select id="tpPage">${MENU_TARGETS.pages.map(p => `<option value="${esc(p.slug)}" ${p.slug === t.page ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>`;
      body.querySelector("#tpPage").addEventListener("change", (e) => { t.page = e.target.value; autoLabel(); });
      autoLabel();
    } else {
      body.innerHTML = `
        <label>URL</label><input id="tpUrl" value="${esc(t.url || "")}" placeholder="https://… or page.html?…" maxlength="500">
        <p class="form-hint">Only for things that aren't a page, category or product — e.g. a WhatsApp or Instagram link.</p>`;
      body.querySelector("#tpUrl").addEventListener("input", (e) => { t.url = e.target.value.trim(); });
    }
  };

  document.getElementById("tpTabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-type]");
    if (!b || b.dataset.type === t.type) return;
    t = { type: b.dataset.type, page: "", category: "", keyword: "", product_id: "", url: "" };
    document.querySelectorAll("#tpTabs button").forEach(x => x.classList.toggle("active", x === b));
    paintBody();
  });

  let badgeValue = badge;
  document.getElementById("tpBadges")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-badge]");
    if (!b) return;
    document.querySelectorAll("#tpBadges button").forEach(x => x.classList.toggle("active", x === b));
    const custom = document.getElementById("tpBadgeCustom");
    custom.style.display = b.dataset.badge === "__custom" ? "" : "none";
    badgeValue = b.dataset.badge;
    if (badgeValue === "__custom") custom.focus();
  });

  document.getElementById("tpCancel").addEventListener("click", closeModal);
  document.getElementById("tpSave").addEventListener("click", () => {
    const msg = document.getElementById("formMsg");
    const fail = (text) => { msg.innerHTML = `<div class="msg error">${esc(text)}</div>`; };
    if (t.type === "category" && !t.category) return fail("Choose a category.");
    if (t.type === "product" && !t.product_id) return fail("Choose a product.");
    if (t.type === "url" && !t.url) return fail("Enter a URL.");
    if (t.type === "url" && /^\s*(javascript|data|vbscript):/i.test(t.url)) return fail("That kind of URL isn't allowed.");
    const out = { type: t.type };
    if (t.type === "page") out.page = t.page;
    if (t.type === "category") { out.page = t.page; out.category = t.category; if (t.keyword?.trim()) out.keyword = t.keyword.trim(); }
    if (t.type === "product") out.product_id = t.product_id;
    if (t.type === "url") out.url = t.url;
    const lbl = labelEl ? labelEl.value.trim() || defaultLabelFor(out) : "";
    if (withLabel && !lbl) return fail("Enter a label.");
    let b = badgeValue === "__custom" ? document.getElementById("tpBadgeCustom").value.trim() : badgeValue;
    const description = withCard ? document.getElementById("tpDesc").value.trim() : "";
    const image = withCard ? document.getElementById("tpImage").value.trim() : "";
    closeModal();
    onSave({ target: out, label: lbl, badge: b || "", description, image });
  });

  paintBody();
}

function productChip(p) {
  if (!p) return "";
  return `<div class="tp-chosen">
    ${p.image ? `<img src="${esc(p.image)}" alt="">` : `<span class="tp-noimg"></span>`}
    <span><strong>${esc(p.title)}</strong><small>${esc(menuPageName(p.page))} › ${esc(p.category_name)}</small></span>
  </div>`;
}

// Warn before closing/reloading the admin while the Menu section has unsaved edits.
window.addEventListener("beforeunload", (e) => {
  if (MENU_DIRTY && document.getElementById("menuEditor")) { e.preventDefault(); e.returnValue = ""; }
});
