routes.media = renderMediaLibrary;

let _MEDIA_CATS = [];
let _MEDIA_SELECTED_CAT_ID = "";
let _MEDIA_SELECTED_IDS = new Set();

async function renderMediaLibrary() {
  const view = document.getElementById("view");
  view.innerHTML = `
    <header class="page-head"><h1>Media Library</h1></header>
    <div class="toolbar">
      <select id="mediaCatSelect"><option value="">All media</option></select>
      <input type="file" id="mediaUploadInput" accept="image/*,${MEDIA_VIDEO_ACCEPT}">
      <span id="uploadStatus" style="color:var(--text-dim);font-size:12px;"></span>
    </div>
    <p id="mediaUploadHint" style="color:var(--text-dim);font-size:12px;margin:-6px 0 12px;"></p>
    <div id="mediaBulkBar" class="media-bulk-bar" style="display:none;">
      <label class="inline"><input type="checkbox" id="mediaSelectAll"> Select all</label>
      <span id="mediaSelectedCount"></span>
      <button type="button" class="btn danger" id="mediaBulkDeleteBtn">Delete Selected</button>
    </div>
    <div class="media-grid" id="mediaGrid">${LOADING}</div>
  `;
  document.getElementById("mediaSelectAll").addEventListener("change", (e) => {
    const grid = document.getElementById("mediaGrid");
    grid.querySelectorAll(".media-tile-checkbox:not(:disabled)").forEach((cb) => {
      cb.checked = e.target.checked;
      if (e.target.checked) _MEDIA_SELECTED_IDS.add(cb.dataset.selectId);
      else _MEDIA_SELECTED_IDS.delete(cb.dataset.selectId);
    });
    updateBulkBar();
  });
  document.getElementById("mediaBulkDeleteBtn").addEventListener("click", (e) => bulkDeleteMedia(e.currentTarget));

  const pages = await Api.pages();
  // Bail out if the admin navigated to another section while this request was in
  // flight - the elements below belong to a view that is no longer in the document,
  // and writing to them throws an uncaught TypeError (see coupons.js).
  if (!document.getElementById("mediaCatSelect")) return;
  _MEDIA_CATS = await allCategoriesAcrossPages(pages);
  const catSelect = document.getElementById("mediaCatSelect");
  catSelect.insertAdjacentHTML("beforeend", _MEDIA_CATS.map(c =>
    `<option value="${c.id}">${esc(c.pageName)} — ${esc(c.name)}</option>`).join(""));
  catSelect.value = _MEDIA_SELECTED_CAT_ID;
  updateUploadHint();
  catSelect.addEventListener("change", () => {
    _MEDIA_SELECTED_CAT_ID = catSelect.value;
    updateUploadHint();
    loadMediaGrid();
  });

  document.getElementById("mediaUploadInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const status = document.getElementById("uploadStatus");
    // Caught before a pointless 25MB+ round trip the backend would only reject.
    if (file.type.startsWith("video/") && file.size > MAX_VIDEO_UPLOAD_BYTES) {
      status.textContent = `Video is over the ${MAX_VIDEO_UPLOAD_BYTES / (1024 * 1024)}MB limit.`;
      e.target.value = "";
      return;
    }
    status.textContent = "Uploading…";
    e.target.disabled = true;
    try {
      const fd = new FormData();
      fd.append("file", file);
      // Scopes the upload into that category's own media_library/<page>/<category>/...
      // folder in R2 (see upload_media_library_asset()'s docstring in
      // services/storage.py) instead of the flat, unsorted media_library/ root —
      // same organization the per-category "Photos" picker already gets, now
      // available from this standalone page too when a category is selected.
      const cat = _MEDIA_CATS.find(c => c.id === _MEDIA_SELECTED_CAT_ID);
      if (cat) {
        fd.append("page_slug", cat.pageSlug);
        fd.append("category_slug", cat.slug);
      }
      await Api.uploadMedia(fd);
      status.textContent = "";
      e.target.value = "";
      loadMediaGrid();
    } catch (err) {
      status.textContent = err.message;
    } finally {
      e.target.disabled = false;
    }
  });
  await loadMediaGrid();
}

function updateUploadHint() {
  const hint = document.getElementById("mediaUploadHint");
  if (!hint) return;
  const cat = _MEDIA_CATS.find(c => c.id === _MEDIA_SELECTED_CAT_ID);
  hint.textContent = cat
    ? `Uploads here are filed under ${cat.pageName} — ${cat.name}'s own folder.`
    : `Uploads here go to the general library folder — pick a category above to file them under that category instead.`;
}

async function loadMediaGrid() {
  const grid = document.getElementById("mediaGrid");
  if (!grid) return;
  grid.innerHTML = LOADING;
  _MEDIA_SELECTED_IDS = new Set();
  document.getElementById("mediaSelectAll").checked = false;
  const items = await Api.mediaLibrary({ categoryId: _MEDIA_SELECTED_CAT_ID || null });
  // Gone if the admin navigated away while the library was loading (see coupons.js).
  if (!document.getElementById("mediaGrid")) return;
  updateBulkBar();
  if (!items.length) {
    grid.innerHTML = _MEDIA_SELECTED_CAT_ID
      ? `<div class="empty-state">No images used in this category yet — upload one above, or switch to "All images" and reuse one from elsewhere.</div>`
      : `<div class="empty-state">No images in the library yet — upload one above.</div>`;
    return;
  }
  grid.innerHTML = items.map(m => `
    <figure class="media-tile" data-id="${m.id}">
      <div class="media-tile-imgwrap">
        ${isVideoMedia(m)
          // No server-side poster frame exists (that needs ffmpeg), so the tile is
          // the clip itself with only its metadata fetched, plus a badge so it reads
          // as a video before any frame decodes.
          ? `<video src="${esc(mediaUrl(m.url))}" muted playsinline preload="metadata" title="Click to copy URL" data-copy-url="${esc(m.url)}"></video>
             <span class="media-video-badge" title="Video">▶</span>`
          : `<img src="${esc(mediaUrl(m.thumb_url || m.url))}" title="Click to copy URL" data-copy-url="${esc(m.url)}" onerror="this.src='${esc(mediaUrl(m.url))}'">`}
        <label class="media-tile-select" title="${m.deletable ? "Select" : "Still attached elsewhere — see below"}">
          <input type="checkbox" class="media-tile-checkbox" data-select-id="${m.id}" ${!m.deletable ? "disabled" : ""}>
        </label>
        ${m.usage_count ? `<span class="media-tile-usage" title="Used by ${m.usage_count} product/category photo(s)">${m.usage_count}×</span>` : ""}
        ${m.deletable
          ? `<button class="media-tile-delete" title="Delete" data-delete-id="${m.id}">×</button>`
          : `<button class="media-tile-delete" title="Still attached elsewhere — see below" disabled>×</button>`}
      </div>
      <button type="button" class="media-tile-copy" title="Copy ${isVideoMedia(m) ? "video" : "image"} URL" data-copy-url="${esc(m.url)}">🔗 Copy URL</button>
      <figcaption>${esc(m.alt || m.url)}</figcaption>
      ${!m.deletable && m.used_in.length ? `
        <div class="media-tile-usedin">Used in:
          ${m.used_in.map(u => `<a href="#/${u.kind === "category" ? `categories?page=${encodeURIComponent(u.page_slug)}` : `products?cat=${encodeURIComponent(u.category_id)}`}">${esc(u.name)}</a>`).join(", ")}
        </div>` : ""}
    </figure>
  `).join("");
  // data-* + delegated listeners, not onclick="fn('${url}')" — a media URL is
  // admin/staff-entered free text (add-by-URL) with no format validation, so it can't
  // be trusted to safely re-enter JS source the way onclick="..." string interpolation
  // requires, even after HTML-escaping it for the attribute itself.
  grid.querySelectorAll("[data-copy-url]").forEach((el) => {
    el.addEventListener("click", () => copyMediaUrl(el.dataset.copyUrl));
  });
  grid.querySelectorAll("button[data-delete-id]").forEach((btn) => {
    btn.addEventListener("click", () => deleteMediaLibraryItem(btn.dataset.deleteId, btn));
  });
  grid.querySelectorAll(".media-tile-checkbox").forEach((cb) => {
    cb.addEventListener("change", () => {
      if (cb.checked) _MEDIA_SELECTED_IDS.add(cb.dataset.selectId);
      else _MEDIA_SELECTED_IDS.delete(cb.dataset.selectId);
      updateBulkBar();
    });
  });
}

function updateBulkBar() {
  const bar = document.getElementById("mediaBulkBar");
  const count = _MEDIA_SELECTED_IDS.size;
  bar.style.display = count > 0 ? "flex" : "none";
  document.getElementById("mediaSelectedCount").textContent = `${count} selected`;
}

async function bulkDeleteMedia(btn) {
  const ids = [..._MEDIA_SELECTED_IDS];
  if (!ids.length) return;
  if (!confirm(`Delete ${ids.length} selected image${ids.length === 1 ? "" : "s"} from the library? This cannot be undone.`)) return;
  try {
    const results = await withBusy(btn, `Deleting ${ids.length}…`, () =>
      Promise.allSettled(ids.map((id) => Api.deleteMedia(id))));
    const failed = results.filter((r) => r.status === "rejected").length;
    loadMediaGrid();
    if (failed) alert(`${failed} of ${ids.length} image(s) couldn't be deleted — they may still be attached elsewhere.`);
  } catch (err) { alert(err.message); }
}

async function copyMediaUrl(url) {
  const s = document.getElementById("uploadStatus");
  const ok = await copyToClipboard(url);
  if (!s) return;
  s.textContent = ok ? "URL copied!" : "Couldn't copy automatically — long-press or select the URL and copy it manually.";
  s.style.color = ok ? "" : "var(--danger)";
  setTimeout(() => { s.textContent = ""; s.style.color = ""; }, ok ? 1500 : 4000);
}

async function deleteMediaLibraryItem(id, btn) {
  if (!confirm("Delete this image from the library?")) return;
  try {
    await withBusy(btn, "×", () => Api.deleteMedia(id));
    loadMediaGrid();
  }
  catch (err) { alert(err.message); }
}
