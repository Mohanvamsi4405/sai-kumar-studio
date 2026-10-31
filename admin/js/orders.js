routes.orders = renderOrders;

const ORDER_STATUSES = ["created", "payment_pending", "cod_confirmed", "paid", "in_production", "shipped", "delivered", "cancelled", "refunded"];

// "in_production" reads as "Designing" everywhere staff see it (status
// dropdowns, stage tracker) to match the customer-facing copy - every other
// status just gets its underscore swapped for a space.
function orderStatusLabel(s) {
  return s === "in_production" ? "Designing" : s.replace("_", " ");
}

// The backend now 403s a non-owner PATCHing an order to "refunded" (only the
// owner-gated Refund button actually talks to Razorpay and restocks) - hide the
// option from the plain status dropdown for staff so it doesn't dead-end in an
// alert(). Always keeps whatever the order's current status already is, so an
// already-refunded order still renders correctly for staff viewing it read-only.
function orderStatusOptionsFor(currentStatus) {
  if (CURRENT_USER && CURRENT_USER.role === "owner") return ORDER_STATUSES;
  return ORDER_STATUSES.filter(s => s !== "refunded" || s === currentStatus);
}

const CANCELLATION_REASON_LABELS = {
  changed_mind: "Changed their mind",
  found_better_price: "Found a better price elsewhere",
  ordered_by_mistake: "Ordered by mistake",
  delivery_time_too_long: "Delivery time too long",
  product_defect_expected: "Expects a product defect",
  duplicate_order: "Accidental duplicate order",
  other: "Other",
};

let _ordersTab = "orders";

// Fixed order-level milestone stages for the horizontal tracker in the order
// modal - mirrors js/my-orders.js's customer-facing copy (small intentional
// duplication, same pattern as CUSTOM_HIDDEN_FIELDS above).
const STAGE_DEFS = [
  { key: "placed", label: "Order Placed", statuses: ["created", "payment_pending"] },
  { key: "confirmed", label: "Order Confirmed", statuses: ["cod_confirmed", "paid"] },
  { key: "designing", label: "Designing", statuses: ["in_production"] },
  { key: "shipped", label: "Shipped", statuses: ["shipped"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered"] },
];

function orderStageIndex(status) {
  return STAGE_DEFS.findIndex(s => s.statuses.includes(status));
}

const REFUND_STATUS_LABELS = { pending: "Refund pending", refunded: "Refunded", failed: "Refund failed" };
const REFUND_BADGE_CLASS = { pending: "refund-pending", refunded: "refund-refunded", failed: "refund-pending" };

function refundBadgeHTML(refundStatus) {
  const label = REFUND_STATUS_LABELS[refundStatus];
  if (!label) return "";
  return `<span class="badge ${REFUND_BADGE_CLASS[refundStatus]}">${label}</span>`;
}

// Extra rows under "Payment status" in the order modal, from what Razorpay's
// webhooks recorded (routers/payments.py): why a payment failed, where its
// refund is, and any chargeback the customer's bank raised against it.
function paymentDetailRowsHTML(p) {
  const row = (label, value) => `
        <div class="order-summary-payment"><span>${label}</span><span>${value}</span></div>`;
  let html = "";
  if (p.status === "failed" && (p.error_code || p.error_description)) {
    html += row("Failure reason", esc([p.error_code, p.error_description].filter(Boolean).join(": ")));
  }
  if (p.refund_status) {
    const parts = [p.refund_status, p.refund_amount != null ? fmtINR(p.refund_amount) : "", p.refund_id || "",
      p.refunded_at ? fmtIST(p.refunded_at) : ""].filter(Boolean);
    html += row("Refund detail", esc(parts.join(" · ")));
    if (p.refund_status === "failed" && p.refund_error) html += row("Refund error", esc(p.refund_error));
  }
  for (const d of p.disputes || []) {
    const parts = [d.status, d.phase || "", fmtINR(d.amount), d.reason_code || "",
      d.respond_by ? `respond by ${fmtIST(d.respond_by)}` : "",
      d.amount_deducted ? `${fmtINR(d.amount_deducted)} deducted` : ""].filter(Boolean);
    html += row(`Dispute ${esc(d.razorpay_dispute_id)}`, `<span class="badge refund-pending">${esc(parts.join(" · "))}</span>`);
  }
  return html;
}

// Whether there's a captured payment still owed a refund - matches the
// backend's own eligibility check (routers/payments.py refund_order): any
// captured payment, regardless of Order.status.
function orderRefundable(order) {
  return (order.payments || []).some(p => p.status === "captured");
}

/* The order LIST response has its uploaded artwork stripped out server-side
   (see backend's _strip_uploads) to keep it small - it only carries an
   upload_count per item. Viewing one order, or downloading its artwork,
   needs the real data, so those fetch the full order on demand and cache it
   here per id; the cache is cleared whenever the list is reloaded, since
   that's the point at which the underlying data may have changed. */
const _ORDER_DETAIL_CACHE = new Map();

async function getOrderDetail(id) {
  if (_ORDER_DETAIL_CACHE.has(id)) return _ORDER_DETAIL_CACHE.get(id);
  const order = await Api.order(id);
  _ORDER_DETAIL_CACHE.set(id, order);
  return order;
}

async function renderOrders() {
  const view = document.getElementById("view");
  view.innerHTML = `
    <header class="page-head"><h1>Orders</h1><button type="button" class="btn secondary" onclick="downloadCsvReport('/api/admin/reports/orders.csv', 'orders.csv', this)">Export CSV</button></header>
    <div class="tabs" id="ordersTabs"></div>
    <div id="ordersTabBody">${LOADING}</div>
  `;
  await renderOrdersTabs();
}

async function renderOrdersTabs() {
  const tabsWrap = document.getElementById("ordersTabs");
  let pendingCancel = 0, pendingAddr = 0;
  try {
    const summary = await Api.summary();
    pendingCancel = summary.cancellation_requests_pending || 0;
    pendingAddr = summary.address_change_requests_pending || 0;
  } catch (e) { /* non-fatal — tab still works without the badge count */ }

  const tabs = [
    { key: "orders", label: "All Orders" },
    { key: "cancellations", label: "Cancellation Requests", badge: pendingCancel },
    { key: "address-changes", label: "Address Change Requests", badge: pendingAddr },
  ];
  tabsWrap.innerHTML = tabs.map(t => `
    <button type="button" class="tab-btn ${t.key === _ordersTab ? "active" : ""}" data-tab="${t.key}">
      ${esc(t.label)}${t.badge ? `<span class="tab-badge">${t.badge}</span>` : ""}
    </button>`).join("");
  tabsWrap.querySelectorAll("[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => { _ordersTab = btn.dataset.tab; renderOrdersTabBody(); });
  });
  await renderOrdersTabBody();
}

async function renderOrdersTabBody() {
  document.querySelectorAll("#ordersTabs .tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === _ordersTab));
  const body = document.getElementById("ordersTabBody");
  body.innerHTML = LOADING;
  if (_ordersTab === "orders") await renderOrdersTable(body);
  else if (_ordersTab === "cancellations") await renderCancellationRequests(body);
  else await renderAddressChangeRequests(body);
}

async function renderOrdersTable(body) {
  body.innerHTML = `
    <div class="toolbar">
      <select id="orderStatusFilter">
        <option value="">All statuses</option>
        ${ORDER_STATUSES.map(s => `<option value="${s}">${orderStatusLabel(s)}</option>`).join("")}
      </select>
    </div>
    <div id="ordersWrap">${LOADING}</div>
  `;
  document.getElementById("orderStatusFilter").addEventListener("change", (e) => loadOrders(e.target.value));
  await loadOrders();
}

async function loadOrders(statusFilter) {
  const wrap = document.getElementById("ordersWrap");
  const orders = await Api.orders(statusFilter);
  // See the note in coupons.js: the container was captured before the await, so
  // it may already be detached if the admin navigated away mid-load.
  if (!wrap) return;
  window._ORDERS_CACHE = orders;
  _ORDER_DETAIL_CACHE.clear();
  if (!orders.length) {
    wrap.innerHTML = `<div class="empty-state">No orders yet.</div>`;
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead><tr><th>Order #</th><th>Items</th><th>Artwork</th><th>Total</th><th>Payment</th><th>Status</th><th>Requests</th><th>Created</th><th></th></tr></thead>
      <tbody>
        ${orders.map(o => {
          const uploadCount = orderUploadCount(o);
          return `
          <tr>
            <td><b>${esc(o.number)}</b></td>
            <td>${orderItemsCellHTML(o)}</td>
            <td>${uploadCount
              ? `<button class="btn secondary otr-dl" title="Download all customer artwork on this order"
                         onclick="downloadAllOrderArtwork('${o.id}')">&#11015; ${uploadCount} file${uploadCount === 1 ? "" : "s"}</button>`
              : "—"}</td>
            <td>${fmtINR(o.total)}</td>
            <td><span class="badge ${o.payments.some(p => p.status === "captured") ? "on" : "off"}">${o.status === "cod_confirmed" ? "cod" : (o.payments[0]?.status || "—")}</span> ${refundBadgeHTML(o.refund_status)}</td>
            <td><select class="order-status-select order-status-${esc(o.status)}" onchange="updateOrderStatus('${o.id}', this.value, this)">
              ${orderStatusOptionsFor(o.status).map(s => `<option value="${s}" ${s === o.status ? "selected" : ""}>${orderStatusLabel(s)}</option>`).join("")}
            </select></td>
            <td>${orderRequestBadges(o)}</td>
            <td>${fmtIST(o.created_at)}</td>
            <td class="actions">
              <button class="btn secondary" onclick="viewOrder('${o.id}')">View</button>
              ${orderRefundable(o) ? `<button class="btn danger owner-only" onclick="refundOrder('${o.id}', this)">Refund</button>` : ""}
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
  document.body.classList.toggle("is-owner", CURRENT_USER.role === "owner");
}

/* The Items column shows what was actually ordered — up to three product
   thumbnails plus the first title — so staff can recognise an order from the
   list instead of having to open every "3 items" row to find out. */
function orderItemsCellHTML(order) {
  const items = order.items || [];
  const shown = items.slice(0, 3);
  const first = (items[0] || {}).product_snapshot || {};
  const extra = items.length - shown.length;
  return `
    <div class="otr-items">
      <div class="otr-thumbs">
        ${shown.map(i => {
          const image = ((i.product_snapshot || {}).image) || "";
          return image
            ? `<img src="${esc(image)}" alt="" class="otr-thumb" onerror="this.style.visibility='hidden'">`
            : `<span class="otr-thumb otr-thumb-blank"></span>`;
        }).join("")}
        ${extra > 0 ? `<span class="otr-thumb otr-thumb-more">+${extra}</span>` : ""}
      </div>
      <span class="otr-items-label">${esc(first.title || "—")}${items.length > 1 ? ` +${items.length - 1} more` : ""}</span>
    </div>`;
}

function orderRequestBadges(o) {
  const bits = [];
  if ((o.cancellation_requests || []).some(r => r.status === "pending")) bits.push(`<span class="badge req-pending">Cancel pending</span>`);
  if ((o.address_change_requests || []).some(r => r.status === "pending")) bits.push(`<span class="badge req-pending">Address pending</span>`);
  return bits.join(" ") || "—";
}

async function updateOrderStatus(id, status, selectEl) {
  if (selectEl) selectEl.disabled = true;
  try {
    await Api.updateOrderStatus(id, status);
    if (selectEl) selectEl.className = `order-status-select order-status-${status}`;
    _ORDER_DETAIL_CACHE.delete(id);
  }
  catch (err) { alert(err.message); renderOrdersTabBody(); }
  finally { if (selectEl) selectEl.disabled = false; }
}

/* ---------- customer artwork & personalisation ----------
   Different storefront pages save the customer's uploaded artwork and custom
   message under different customization field names (gifts.js/studio.js:
   photoData/text, corporate.js: logoData/engravingText) and every one of them
   lands verbatim in product_snapshot.customization. Production staff need ALL
   of it — the artwork file itself, the message, and every option the customer
   picked (finish, technique, colour, size, print placement) — so the artwork
   is matched by known aliases and every other value is listed generically
   rather than from a fixed per-page list. */

const CUSTOM_IMAGE_FIELDS = ["photoData", "logoData", "imageData", "artworkData"];
const CUSTOM_TEXT_FIELDS = ["text", "engravingText", "message", "customText"];
const CUSTOM_NAME_FIELDS = ["photoName", "logoName", "fileName"];

// Rendered on their own (artwork, message, print-placement geometry) or pure
// internal/live-preview state with nothing production needs (which rendering
// path the 3D preview used, echoing the product name back, etc). `fields`/
// `fieldLabels` (Product.input_fields answers) are unpacked separately below
// rather than hidden entirely - they're real customer-supplied data too.
const CUSTOM_HIDDEN_FIELDS = new Set([
  ...CUSTOM_IMAGE_FIELDS, ...CUSTOM_TEXT_FIELDS,
  "photoCrop", "rotationX", "rotationY", "zoom",
  "photoZoom", "photoX", "photoY", "photoFit",
  "previewTemplate", "previewMode", "fields", "fieldLabels",
]);

function customFieldLabel(customization, fieldId) {
  return (customization && customization.fieldLabels && customization.fieldLabels[fieldId]) || fieldId;
}

// True for anything that looks like an uploaded file (a data: URI or an R2/
// http(s) URL) as opposed to a plain text/dropdown answer.
function looksLikeUpload(value) {
  return typeof value === "string" && (value.startsWith("data:") || /^https?:\/\//i.test(value));
}

const CUSTOM_FIELD_LABELS = {
  photoName: "Uploaded file", logoName: "Uploaded file", fileName: "Uploaded file",
  finish: "Finish", technique: "Technique", color: "Colour", accent: "Accent colour",
  textStyle: "Text style", photoLayout: "Photo layout", shape: "Shape",
  size: "Size", thickness: "Thickness", stand: "Stand", background: "Background",
  lighting: "Lighting", shadow: "Shadow", quantity: "Quantity", purpose: "Purpose",
  notes: "Notes", acrylic: "Acrylic",
};

function prettyCustomLabel(key) {
  return CUSTOM_FIELD_LABELS[key] || String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (c) => c.toUpperCase());
}

function orderItemCustomText(customization) {
  if (!customization) return "";
  for (const field of CUSTOM_TEXT_FIELDS) {
    const value = customization[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

// Most customization fields are flat scalars, but a few (studio.js's acrylic
// frame options: shape/size/stand/background...) are saved as one nested
// object. Flattening one level in, with the parent name prefixed onto each
// label, is what stops that whole group silently vanishing from production's
// view instead of just being unreadable.
function orderItemCustomSpecs(customization) {
  if (!customization || typeof customization !== "object") return [];
  const specs = [];
  Object.entries(customization).forEach(([key, value]) => {
    if (CUSTOM_HIDDEN_FIELDS.has(key) || value == null) return;
    if (typeof value === "string" || typeof value === "number") {
      const str = String(value).trim();
      if (str && !str.startsWith("data:")) specs.push([prettyCustomLabel(key), str]);
    } else if (typeof value === "object" && !Array.isArray(value)) {
      const prefix = prettyCustomLabel(key);
      Object.entries(value).forEach(([subKey, subValue]) => {
        if (typeof subValue !== "string" && typeof subValue !== "number") return;
        const str = String(subValue).trim();
        if (str) specs.push([`${prefix} ${prettyCustomLabel(subKey)}`, str]);
      });
    }
  });
  // Admin-configured text/dropdown fields (Product.input_fields answers) -
  // upload-type field values are shown as artwork by orderItemUploads()
  // instead, not listed here.
  const fields = customization.fields;
  if (fields && typeof fields === "object") {
    Object.entries(fields).forEach(([fieldId, value]) => {
      if (value == null || value === "") return;
      const label = customFieldLabel(customization, fieldId);
      if (Array.isArray(value)) {
        const text = value.filter(v => typeof v === "string" && !looksLikeUpload(v)).join(", ");
        if (text) specs.push([label, text]);
      } else if (typeof value === "string" && !looksLikeUpload(value)) {
        specs.push([label, value]);
      }
    });
  }
  return specs;
}

/* How the customer positioned their photo inside the print area. Unlike the
   customer-facing order history (where this is noise), the print shop needs it
   to reproduce what the customer saw in the live preview. */
function orderItemPlacement(customization) {
  if (!customization) return "";
  const crop = customization.photoCrop || {};
  const fit = crop.fit ?? customization.photoFit;
  const zoom = crop.zoom ?? customization.photoZoom;
  const x = crop.x ?? customization.photoX;
  const y = crop.y ?? customization.photoY;
  const bits = [];
  if (fit) bits.push(`fit: ${fit}`);
  if (zoom != null && zoom !== "") bits.push(`zoom: ${Number(zoom).toFixed(2)}×`);
  if ((x != null && x !== "") || (y != null && y !== "")) bits.push(`offset: ${Number(x || 0)}%, ${Number(y || 0)}%`);
  return bits.join(" · ");
}

/* Turns "image/jpeg" into a file extension. JFIF/JPG both arrive as image/jpeg;
   anything unrecognised keeps a generic .img rather than a wrong extension that
   would stop the design tool opening it. */
const ARTWORK_EXTENSIONS = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp",
  "image/gif": "gif", "image/avif": "avif", "image/svg+xml": "svg", "image/bmp": "bmp",
  "image/tiff": "tiff",
};

function artworkFilenameSafe(s) {
  return String(s || "")
    .replace(/\.[a-z0-9]{2,5}$/i, "")          // drop the original extension; the real MIME decides it
    .replace(/[^\w\-. ]+/g, "")
    .trim().replace(/\s+/g, "-")
    .slice(0, 60) || "artwork";
}

/* A data: URI's payload is base64, so its decoded byte count is derivable
   without decoding the whole (potentially multi-MB) string — staff need the
   file size to judge whether the upload is print-resolution before downloading. */
function base64ByteLength(b64) {
  const clean = b64.replace(/=+$/, "");
  return Math.floor((clean.length * 3) / 4);
}

function fmtBytes(bytes) {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* Checkout now uploads these to Supabase Storage and stores a plain URL
   instead of base64 (see backend's services/storage.py) - a data: URI only
   shows up as a fallback if that upload failed. Byte size isn't knowable from
   a URL without a separate request, so it's just omitted for those. */
function mimeFromUrl(url) {
  const ext = (url.split("?")[0].split("#")[0].split(".").pop() || "").toLowerCase();
  const byExt = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    gif: "image/gif", avif: "image/avif", svg: "image/svg+xml", bmp: "image/bmp", tiff: "image/tiff",
  };
  return byExt[ext] || "image/jpeg";
}

/* Every artwork file on one order item. An item can legitimately carry more
   than one (a photo AND a logo), so this returns a list rather than the single
   "first match" the old view showed. */
function orderItemUploads(item, itemIndex, orderNumber) {
  const customization = (item.product_snapshot || {}).customization;
  if (!customization) return [];
  const originalName = CUSTOM_NAME_FIELDS
    .map((f) => customization[f])
    .find((v) => typeof v === "string" && v.trim()) || "";

  const uploads = [];
  function pushUpload(field, data, label) {
    if (typeof data !== "string") return;
    const isDataUri = data.startsWith("data:image/");
    const isUrl = /^https?:\/\//i.test(data);
    if (!isDataUri && !isUrl) return;
    const comma = isDataUri ? data.indexOf(",") : -1;
    const mime = isDataUri ? (data.slice(5, comma).split(";")[0] || "image/png").toLowerCase() : mimeFromUrl(data);
    const ext = ARTWORK_EXTENSIONS[mime] || "img";
    const base = artworkFilenameSafe(label || originalName || (item.product_snapshot || {}).title);
    uploads.push({
      field, data, mime, originalName: label || originalName, isDataUri,
      bytes: isDataUri ? base64ByteLength(data.slice(comma + 1)) : null,
      filename: `${orderNumber}_item${itemIndex + 1}_${base}.${ext}`,
    });
  }
  CUSTOM_IMAGE_FIELDS.forEach((field) => pushUpload(field, customization[field]));

  // Admin-configured upload fields (Product.input_fields) - addressed as
  // "fields.<fieldId>" (single) or "fields.<fieldId>.<index>" (multi-upload).
  const dynFields = customization.fields;
  if (dynFields && typeof dynFields === "object") {
    Object.entries(dynFields).forEach(([fieldId, value]) => {
      const label = customFieldLabel(customization, fieldId);
      if (Array.isArray(value)) {
        value.forEach((v, i) => pushUpload(`fields.${fieldId}.${i}`, v, `${label} ${i + 1}`));
      } else {
        pushUpload(`fields.${fieldId}`, value, label);
      }
    });
  }
  return uploads;
}

/* Works against either shape of order data: the list response (artwork
   stripped, only item.upload_count is trustworthy) or a full detail fetch
   (real customization data, so orderItemUploads finds the actual files). */
function orderUploadCount(order) {
  return (order.items || []).reduce((n, item, i) => {
    const real = orderItemUploads(item, i, order.number).length;
    return n + (real || item.upload_count || 0);
  }, 0);
}

/* Pixel dimensions are only knowable once the browser has decoded the image, so
   they're filled in on load rather than rendered with the rest of the row. Staff
   need them to judge whether an upload is big enough to print before they take
   it into production. */
function showArtworkDimensions(img) {
  const slot = img.closest(".oid-artwork-file")?.querySelector(".oid-dims");
  if (!slot || !img.naturalWidth) return;
  slot.textContent = ` · ${img.naturalWidth} × ${img.naturalHeight} px`;
  if (Math.max(img.naturalWidth, img.naturalHeight) < 1200) {
    slot.classList.add("oid-dims-low");
    slot.title = "Low resolution — check with the customer before printing large.";
  }
}

/* ---------- downloading the artwork ----------
   Uploads live in the database as data: URIs. Browsers refuse a top-level
   navigation to a data: URL, so the bytes are handed to the download as an
   object URL instead — which also means no multi-MB string ever has to sit in
   an onclick attribute. */

function dataUriToBlob(dataUri) {
  const comma = dataUri.indexOf(",");
  const mime = dataUri.slice(5, comma).split(";")[0] || "application/octet-stream";
  const binary = atob(dataUri.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/* Uploads live either as a base64 data: URI (the fallback path, if storing to
   Supabase Storage failed at checkout) or a plain URL (the normal path) - the
   former decodes locally, the latter needs an actual fetch to get bytes.
   The URL case is routed through this app's own API (same origin as the
   admin panel) instead of fetching the R2 bucket URL directly - a
   cross-origin fetch() to R2 needs CORS enabled on that bucket, which isn't
   guaranteed, so this sidesteps it entirely. */
async function uploadToBlob(upload) {
  if (upload.isDataUri) return dataUriToBlob(upload.data);
  const proxyUrl = `${API_BASE}/api/admin/media/download?url=${encodeURIComponent(upload.data)}&filename=${encodeURIComponent(upload.filename)}`;
  const res = await fetch(proxyUrl, { headers: { Authorization: `Bearer ${getToken()}` } });
  if (!res.ok) throw new Error(`Couldn't fetch the file (${res.status})`);
  return res.blob();
}

async function downloadOrderArtwork(orderId, itemIndex, field) {
  let order;
  try { order = await getOrderDetail(orderId); } catch (err) { alert(err.message); return; }
  const upload = orderItemUploads(order.items[itemIndex], itemIndex, order.number).find((u) => u.field === field);
  if (!upload) return;
  try { saveBlob(await uploadToBlob(upload), upload.filename); }
  catch (err) { alert("Couldn't download the file: " + err.message); }
}

/* Downloads every artwork file on an order in one go. They're staggered because
   browsers drop same-tick bursts of programmatic downloads — the gap is what
   makes a 6-file order actually produce 6 files. */
async function downloadAllOrderArtwork(orderId) {
  let order;
  try { order = await getOrderDetail(orderId); } catch (err) { alert(err.message); return; }
  const uploads = [];
  order.items.forEach((item, i) => uploads.push(...orderItemUploads(item, i, order.number)));
  if (!uploads.length) {
    alert("This order has no customer-uploaded artwork.");
    return;
  }
  uploads.forEach((upload, i) => {
    setTimeout(async () => {
      try { saveBlob(await uploadToBlob(upload), upload.filename); }
      catch (err) { console.error(`Couldn't download ${upload.filename}:`, err); }
    }, i * 400);
  });
}

/* Horizontal Placed→Confirmed→Designing→Shipped→Delivered milestone tracker,
   with a status <select> alongside it so staff can move the order forward
   from right where they're already reviewing it, instead of only from the
   dropdown back in the orders table row. Cancelled/refunded orders don't fit
   on this line (there's no "how far did it get" that matters once called
   off) so they get a banner instead. */
function orderStageTrackerHTML(order) {
  const isTerminalStop = order.status === "cancelled" || order.status === "refunded";
  const trackerBody = isTerminalStop
    ? `<div class="order-stage-banner">
        <span>${order.status === "refunded" ? "This order was refunded." : "This order was cancelled."}</span>
        ${refundBadgeHTML(order.refund_status)}
      </div>`
    : (() => {
        const currentIndex = orderStageIndex(order.status);
        return `<div class="order-stage-track">
          ${STAGE_DEFS.map((stage, i) => {
            const state = currentIndex < 0 ? "upcoming" : i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
            return `
              <div class="order-stage-node order-stage-${state}">
                ${i > 0 ? `<span class="order-stage-connector"></span>` : ""}
                <span class="order-stage-dot"></span>
                <span class="order-stage-label">${esc(stage.label)}</span>
              </div>`;
          }).join("")}
        </div>`;
      })();

  return `
    <div class="stage-tracker-wrap">
      ${trackerBody}
      <select class="order-status-select order-status-${esc(order.status)}" onchange="updateOrderStatusFromModal('${order.id}', this.value, this)">
        ${orderStatusOptionsFor(order.status).map(s => `<option value="${s}" ${s === order.status ? "selected" : ""}>${orderStatusLabel(s)}</option>`).join("")}
      </select>
    </div>`;
}

// Same PATCH as the table row's dropdown, but re-opens the modal afterward
// so the tracker/status badge/refund row all reflect the new status
// immediately instead of staff having to close and reopen it.
async function updateOrderStatusFromModal(id, newStatus, selectEl) {
  if (selectEl) selectEl.disabled = true;
  try {
    await Api.updateOrderStatus(id, newStatus);
    _ORDER_DETAIL_CACHE.delete(id);
    viewOrder(id);
  } catch (err) {
    alert(err.message);
    if (selectEl) selectEl.disabled = false;
  }
}

function trackingTimelineHTML(order) {
  const events = order.tracking_events || [];
  if (!events.length) return `<p class="odg-empty">No tracking updates yet.</p>`;
  return `<div class="tracking-timeline">
    ${events.map(ev => `
      <div class="tracking-event">
        <span class="tracking-dot"></span>
        <div class="tracking-event-body">
          <div class="tracking-event-head"><b>${esc(ev.title)}</b><span>${fmtIST(ev.created_at)}</span></div>
          ${ev.description ? `<p>${esc(ev.description)}</p>` : ""}
          ${ev.location ? `<span class="tracking-loc">${esc(ev.location)}</span>` : ""}
        </div>
      </div>`).join("")}
  </div>`;
}

function pendingRequestHTML(order) {
  const cancel = (order.cancellation_requests || []).find(r => r.status === "pending");
  const addr = (order.address_change_requests || []).find(r => r.status === "pending");
  let html = "";
  if (cancel) {
    const scoped = !!cancel.order_item_id;
    html += `
      <div class="request-card">
        <div class="request-card-head"><b>${scoped ? `Cancellation requested — ${esc(cancel.item_title || "one item")}` : "Cancellation requested (whole order)"}</b><span class="badge req-pending">Pending</span></div>
        <p>Reason: ${esc(CANCELLATION_REASON_LABELS[cancel.reason] || cancel.reason)}${cancel.note ? ` — “${esc(cancel.note)}”` : ""}</p>
        <div class="modal-actions" style="justify-content:flex-start;">
          <button type="button" class="btn" onclick="decideRequest('cancellation', '${cancel.id}', 'approve', this)">Approve ${scoped ? "(cancel this item)" : "(cancel order)"}</button>
          <button type="button" class="btn secondary" onclick="decideRequest('cancellation', '${cancel.id}', 'reject', this)">Reject</button>
        </div>
      </div>`;
  }
  if (addr) {
    const a = addr.requested_address;
    html += `
      <div class="request-card">
        <div class="request-card-head"><b>Address change requested</b><span class="badge req-pending">Pending</span></div>
        <p>${esc(a.full_name)} &middot; ${esc(a.phone)}<br>
        ${esc(a.line1)}${a.line2 ? `, ${esc(a.line2)}` : ""}, ${esc(a.city)}, ${esc(a.state)} - ${esc(a.pincode)}</p>
        ${addr.note ? `<p class="odg-empty">Note: ${esc(addr.note)}</p>` : ""}
        <div class="modal-actions" style="justify-content:flex-start;">
          <button type="button" class="btn" onclick="decideRequest('address', '${addr.id}', 'approve', this)">Approve (update address)</button>
          <button type="button" class="btn secondary" onclick="decideRequest('address', '${addr.id}', 'reject', this)">Reject</button>
        </div>
      </div>`;
  }
  return html;
}

async function decideRequest(kind, id, action, btn) {
  const label = action === "approve" ? "Approve" : "Reject";
  let adminNote = "";
  if (action === "reject") {
    adminNote = prompt(`Reason for the customer (optional) — ${label} this request:`) || "";
  } else if (!confirm(`${label} this request?`)) {
    return;
  }
  try {
    await withBusy(btn, action === "approve" ? "Approving…" : "Rejecting…", () => kind === "cancellation"
      ? Api.decideCancellationRequest(id, action, adminNote)
      : Api.decideAddressChangeRequest(id, action, adminNote));
    closeModal();
    renderOrdersTabs();
  } catch (err) {
    alert(err.message);
  }
}

const ITEM_STATUS_BADGE = {
  cancel_requested: `<span class="badge req-pending">Cancellation requested</span>`,
  cancelled: `<span class="badge off">Cancelled</span>`,
};

function orderItemDetailHTML(order, item, index) {
  const snap = item.product_snapshot || {};
  const customization = snap.customization || null;
  const customText = orderItemCustomText(customization);
  const specs = orderItemCustomSpecs(customization);
  const placement = orderItemPlacement(customization);
  const uploads = orderItemUploads(item, index, order.number);
  const itemStatus = item.status || "active";
  const pendingItemRequest = (order.cancellation_requests || []).find(r => r.order_item_id === item.id && r.status === "pending");

  return `
    <div class="order-item-detail-row">
      <img class="oid-thumb" src="${esc(snap.image || "")}" alt="" onerror="this.style.visibility='hidden'">
      <div class="oid-body">
        <div class="oid-title-row">
          <b>${esc(snap.title || "—")}</b>
          <span class="mono">${item.product_id ? `Product ID: ${esc(item.product_id)}` : "Custom item (no catalog ID)"}</span>
          ${ITEM_STATUS_BADGE[itemStatus] || ""}
        </div>
        <div class="oid-pricing">${item.qty} × ${fmtINR(item.unit_price)} = ${item.discount > 0
          ? `<s>${fmtINR(item.unit_price * item.qty)}</s> <b>${fmtINR(item.unit_price * item.qty - item.discount)}</b>
             <span class="oid-bulk-saving">quantity offer &minus;${fmtINR(item.discount)}</span>`
          : `<b>${fmtINR(item.unit_price * item.qty)}</b>`}</div>
        ${item.notes ? `<div class="oid-note">Note: ${esc(item.notes)}</div>` : ""}
        ${pendingItemRequest ? `
        <div class="request-card" style="margin-top:8px;">
          <div class="request-card-head"><b>Cancellation requested</b><span class="badge req-pending">Pending</span></div>
          <p>Reason: ${esc(CANCELLATION_REASON_LABELS[pendingItemRequest.reason] || pendingItemRequest.reason)}${pendingItemRequest.note ? ` — “${esc(pendingItemRequest.note)}”` : ""}</p>
          <div class="modal-actions" style="justify-content:flex-start;">
            <button type="button" class="btn" onclick="decideRequest('cancellation', '${pendingItemRequest.id}', 'approve', this)">Approve (cancel this item)</button>
            <button type="button" class="btn secondary" onclick="decideRequest('cancellation', '${pendingItemRequest.id}', 'reject', this)">Reject</button>
          </div>
        </div>` : ""}

        ${uploads.length ? `
        <div class="oid-artwork">
          <div class="oid-artwork-label">Customer artwork &mdash; ${uploads.length} file${uploads.length === 1 ? "" : "s"}</div>
          <div class="oid-artwork-files">
            ${uploads.map(u => `
              <div class="oid-artwork-file">
                <img class="oid-upload" src="${u.data}" alt="Customer's uploaded artwork"
                     title="Click to view full size" onload="showArtworkDimensions(this)"
                     onclick="openArtworkZoom('${order.id}', ${index}, '${u.field}')">
                <div class="oid-artwork-meta">
                  <b title="${esc(u.filename)}">${esc(u.originalName || u.filename)}</b>
                  <span>${esc(u.mime.replace("image/", "").toUpperCase())}${u.bytes != null ? ` &middot; ${fmtBytes(u.bytes)}` : ""}<span class="oid-dims"></span></span>
                  <button type="button" class="btn secondary oid-dl"
                          onclick="downloadOrderArtwork('${order.id}', ${index}, '${u.field}')">&#11015; Download</button>
                </div>
              </div>`).join("")}
          </div>
        </div>` : ""}

        ${customText || specs.length || placement ? `
        <div class="oid-custom">
          ${customText ? `<div class="oid-text">Custom text: &ldquo;${esc(customText)}&rdquo;</div>` : ""}
          ${specs.length ? `
            <dl class="oid-specs">
              ${specs.map(([label, value]) => `<div class="oid-spec-row"><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}
            </dl>` : ""}
          ${placement ? `<div class="oid-placement">Print placement &mdash; ${esc(placement)}</div>` : ""}
        </div>` : ""}
      </div>
    </div>`;
}

async function viewOrder(id) {
  openModal(LOADING, true);
  let o;
  try {
    o = await getOrderDetail(id);
  } catch (err) {
    closeModal();
    alert(err.message || "Couldn't load order details.");
    return;
  }
  renderOrderModal(o);
}

function renderOrderModal(o) {
  const c = o.customer;
  const a = o.address;
  const payment = o.payments[o.payments.length - 1];
  const uploadCount = orderUploadCount(o);
  openModal(`
    <div class="order-modal-head">
      <div>
        <h2>Order ${esc(o.number)}</h2>
        <p class="order-modal-meta">Placed ${fmtIST(o.created_at)}</p>
      </div>
      <span class="order-status-badge order-status-${esc(o.status)}">${esc(o.status.replace("_", " "))}</span>
    </div>

    ${pendingRequestHTML(o)}

    <div class="order-section">
      <div class="order-detail-grid">
        <div class="odg-col">
          <h3>Customer</h3>
          ${c ? `
          <p>${esc(c.name || "—")}<br>
          ${esc(c.email)}<br>
          ${esc(c.phone || "—")}</p>` : `<p class="odg-empty">No customer on file.</p>`}
        </div>
        <div class="odg-col">
          <h3>Delivery Address</h3>
          ${a ? `
          <p>${esc(a.full_name)} &middot; ${esc(a.phone)}<br>
          ${esc(a.line1)}${a.line2 ? `, ${esc(a.line2)}` : ""}<br>
          ${esc(a.city)}, ${esc(a.state)} - ${esc(a.pincode)}</p>
          ${o.delivery_slot ? `<p class="odg-slot">Delivery slot: ${esc(o.delivery_slot)}</p>` : ""}` : `<p class="odg-empty">No address on file.</p>`}
        </div>
      </div>
    </div>

    <div class="order-section">
      <h3 class="order-section-title">
        Items <span class="count">(${o.items.length})</span>
        ${uploadCount ? `<button type="button" class="btn secondary oid-dl-all" onclick="downloadAllOrderArtwork('${o.id}')">&#11015; Download all artwork (${uploadCount})</button>` : ""}
      </h3>
      <div class="order-items-detail">
        ${o.items.map((i, idx) => orderItemDetailHTML(o, i, idx)).join("")}
      </div>
    </div>

    <div class="order-section">
      <h3 class="order-section-title">Order Summary</h3>
      <div class="order-summary-card">
        <div class="order-summary-row"><span>Subtotal</span><span>${fmtINR(o.subtotal)}</span></div>
        ${o.bulk_discount > 0 ? `
        <div class="order-summary-row"><span>Quantity discount</span><span>-${fmtINR(o.bulk_discount)}</span></div>` : ""}
        <div class="order-summary-row"><span>Discount${o.coupon_code ? ` (${esc(o.coupon_code)})` : ""}</span><span>-${fmtINR(o.discount)}</span></div>
        <div class="order-summary-row total"><span>Total</span><span>${fmtINR(o.total)}</span></div>
        ${payment ? `
        <div class="order-summary-payment">
          <span>Payment status</span>
          <b>${esc(payment.status)}${payment.method ? ` &middot; ${esc(payment.method)}` : ""}${payment.razorpay_payment_id ? ` &middot; ${esc(payment.razorpay_payment_id)}` : ""}</b>
        </div>
        ${paymentDetailRowsHTML(payment)}` : ""}
        ${o.refund_status !== "not_applicable" || orderRefundable(o) ? `
        <div class="order-summary-payment">
          <span>Refund</span>
          <span>
            ${refundBadgeHTML(o.refund_status) || `<span class="badge off">Not refunded</span>`}
            ${orderRefundable(o) ? `<button type="button" class="btn danger owner-only" style="margin-left:8px;" onclick="refundOrder('${o.id}', this)">Refund</button>` : ""}
          </span>
        </div>` : ""}
      </div>
    </div>

    <div class="order-section">
      <h3 class="order-section-title">Shipment &amp; Tracking</h3>
      ${orderStageTrackerHTML(o)}
      ${(o.carrier || o.tracking_number || o.expected_delivery) ? `
      <div class="tracking-current">
        ${o.carrier ? `<span>Carrier: <b>${esc(o.carrier)}</b></span>` : ""}
        ${o.tracking_number ? `<span>Tracking #: <b>${esc(o.tracking_number)}</b></span>` : ""}
        ${o.expected_delivery ? `<span>Expected: <b>${esc(o.expected_delivery)}</b></span>` : ""}
        ${o.tracking_url ? `<span><a href="${esc(o.tracking_url)}" target="_blank" rel="noopener">Track shipment &rarr;</a></span>` : ""}
      </div>` : ""}
      <form id="trackingForm" class="tracking-form">
        <div class="two-col">
          <div><label>Carrier</label><input id="tk_carrier" value="${esc(o.carrier || "")}" placeholder="e.g. BlueDart, Delhivery"></div>
          <div><label>Tracking number</label><input id="tk_number" value="${esc(o.tracking_number || "")}"></div>
        </div>
        <div class="two-col">
          <div><label>Tracking URL (optional)</label><input id="tk_url" value="${esc(o.tracking_url || "")}" placeholder="https://..."></div>
          <div><label>Expected delivery</label><input id="tk_eta" type="date" value="${o.expected_delivery || ""}"></div>
        </div>
        <label>Add a timeline update (optional)</label>
        <div class="two-col">
          <input id="tk_event_title" placeholder="e.g. Out for delivery">
          <input id="tk_event_location" placeholder="Location (optional)">
        </div>
        <textarea id="tk_event_desc" rows="2" placeholder="Note shown to the customer (optional)"></textarea>
        <div class="modal-actions" style="justify-content:flex-start;">
          <button type="submit" class="btn">Save Tracking Update</button>
          <span class="save-msg" id="trackingMsg"></span>
        </div>
      </form>
      ${trackingTimelineHTML(o)}
    </div>

    <div class="modal-actions">
      <button type="button" class="btn secondary" onclick="closeModal()">Close</button>
    </div>
  `, true);

  document.getElementById("trackingForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = {
      carrier: document.getElementById("tk_carrier").value.trim() || null,
      tracking_number: document.getElementById("tk_number").value.trim() || null,
      tracking_url: document.getElementById("tk_url").value.trim() || null,
      expected_delivery: document.getElementById("tk_eta").value || null,
      event_title: document.getElementById("tk_event_title").value.trim() || null,
      event_description: document.getElementById("tk_event_desc").value.trim(),
      event_location: document.getElementById("tk_event_location").value.trim() || null,
    };
    const msg = document.getElementById("trackingMsg");
    const btn = e.target.querySelector('button[type="submit"]');
    try {
      await withBusy(btn, "Saving…", () => Api.updateOrderTracking(o.id, data));
      closeModal();
      renderOrdersTabs();
    } catch (err) {
      msg.textContent = err.message;
    }
  });
}

/* Opens one artwork file full size. Addressed by order/item/field rather than
   by src so the modal can offer the download too — and so a multi-MB data URI
   never has to travel through an inline onclick attribute. */
async function openArtworkZoom(orderId, itemIndex, field) {
  let order;
  try { order = await getOrderDetail(orderId); } catch (err) { alert(err.message); return; }
  const item = order.items[itemIndex];
  const upload = orderItemUploads(item, itemIndex, order.number).find(u => u.field === field);
  if (!upload) return;
  openModal(`
    <div class="artwork-zoom-head">
      <div>
        <b>${esc(upload.originalName || upload.filename)}</b>
        <span class="artwork-zoom-meta">${esc((item.product_snapshot || {}).title || "")} &middot; ${esc(upload.mime.replace("image/", "").toUpperCase())}${upload.bytes != null ? ` &middot; ${fmtBytes(upload.bytes)}` : ""}</span>
      </div>
      <button type="button" class="btn" onclick="downloadOrderArtwork('${orderId}', ${itemIndex}, '${field}')">&#11015; Download</button>
    </div>
    <img src="${upload.data}" alt="Customer's uploaded artwork" class="artwork-zoom-img">
    <div class="modal-actions"><button type="button" class="btn secondary" onclick="closeModal()">Close</button></div>
  `);
}

async function refundOrder(id, btn) {
  if (!confirm("Refund this order via Razorpay? This will restock physical items.")) return;
  try {
    await withBusy(btn, "Refunding…", () => Api.refundOrder(id));
    _ORDER_DETAIL_CACHE.delete(id);
    // Reflect the new refund/payment status wherever the admin is looking -
    // back in the order modal if that's where the button was clicked from,
    // otherwise the orders table.
    if (document.querySelector(".order-modal-head")) await viewOrder(id);
    else loadOrders();
  }
  catch (err) { alert(err.message); }
}

/* ---------- cancellation / address-change request tabs ---------- */

async function renderCancellationRequests(body) {
  const reqs = await Api.cancellationRequests();
  if (!reqs.length) {
    body.innerHTML = `<div class="empty-state">No cancellation requests.</div>`;
    return;
  }
  body.innerHTML = `
    <table>
      <thead><tr><th>Order #</th><th>Customer</th><th>Scope</th><th>Reason</th><th>Note</th><th>Status</th><th>Refund</th><th>Raised</th><th></th></tr></thead>
      <tbody>
        ${reqs.map(r => `
          <tr>
            <td><b>${esc(r.order_number || "—")}</b></td>
            <td>${esc(r.customer_name || r.customer_email || "—")}</td>
            <td>${r.order_item_id ? `<span class="badge">Item</span> ${esc(r.item_title || "—")}` : `<span class="badge">Whole order</span>`}</td>
            <td>${esc(CANCELLATION_REASON_LABELS[r.reason] || r.reason)}</td>
            <td>${esc(r.note || "—")}</td>
            <td><span class="badge ${r.status === "pending" ? "req-pending" : r.status === "approved" ? "on" : "off"}">${esc(r.status)}</span></td>
            <td>${refundBadgeHTML(r.refund_status) || "—"}</td>
            <td>${fmtIST(r.created_at)}</td>
            <td class="actions">
              ${r.status === "pending" ? `
                <button class="btn" onclick="decideRequest('cancellation', '${r.id}', 'approve', this)">Approve</button>
                <button class="btn secondary" onclick="decideRequest('cancellation', '${r.id}', 'reject', this)">Reject</button>
              ` : (r.admin_note ? esc(r.admin_note) : "—")}
            </td>
          </tr>`).join("")}
      </tbody>
    </table>
  `;
}

async function renderAddressChangeRequests(body) {
  const reqs = await Api.addressChangeRequests();
  if (!reqs.length) {
    body.innerHTML = `<div class="empty-state">No address change requests.</div>`;
    return;
  }
  body.innerHTML = `
    <table>
      <thead><tr><th>Order #</th><th>Customer</th><th>Requested Address</th><th>Status</th><th>Raised</th><th></th></tr></thead>
      <tbody>
        ${reqs.map(r => {
          const a = r.requested_address || {};
          return `
          <tr>
            <td><b>${esc(r.order_number || "—")}</b></td>
            <td>${esc(r.customer_name || r.customer_email || "—")}</td>
            <td>${esc(a.full_name || "")} &middot; ${esc(a.phone || "")}<br>${esc(a.line1 || "")}${a.line2 ? `, ${esc(a.line2)}` : ""}, ${esc(a.city || "")}, ${esc(a.state || "")} - ${esc(a.pincode || "")}</td>
            <td><span class="badge ${r.status === "pending" ? "req-pending" : r.status === "approved" ? "on" : "off"}">${esc(r.status)}</span></td>
            <td>${fmtIST(r.created_at)}</td>
            <td class="actions">
              ${r.status === "pending" ? `
                <button class="btn" onclick="decideRequest('address', '${r.id}', 'approve', this)">Approve</button>
                <button class="btn secondary" onclick="decideRequest('address', '${r.id}', 'reject', this)">Reject</button>
              ` : (r.admin_note ? esc(r.admin_note) : "—")}
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
}
