/* Shared fetch wrapper for the admin panel. Same origin as the API by default —
   override by setting window.API_BASE before this script loads (e.g. for local
   dev where the admin is opened as a static file instead of via FastAPI). */
const API_BASE = window.API_BASE || "";

/* Media Library uploads are served by FastAPI itself at /media/<file> (see
   backend/app/main.py), so a relative URL only resolves correctly when the
   admin is loaded from that same origin. Opened as a static file instead
   (Live Server etc.), the relative path resolves against the static server's
   own origin and 404s - route it through API_BASE like every other request. */
function mediaUrl(url) {
  return url && url.startsWith("/media/") ? `${API_BASE}${url}` : url;
}

function getToken() {
  return localStorage.getItem("admin_token");
}

function setToken(token) {
  localStorage.setItem("admin_token", token);
}

function clearToken() {
  localStorage.removeItem("admin_token");
}

// FastAPI's `detail` on a 422 is a list of {loc, msg, ...} objects, not a string -
// new Error(thatArray) stringifies to "[object Object]"/similar instead of the
// actual per-field message. Every other error shape (a plain string detail, or no
// body at all) passes through unchanged.
function formatApiErrorDetail(detail, fallback) {
  if (Array.isArray(detail)) {
    return detail.map((d) => {
      const field = Array.isArray(d.loc) ? d.loc[d.loc.length - 1] : null;
      return field && field !== "body" ? `${field}: ${d.msg}` : d.msg;
    }).join("; ") || fallback;
  }
  return detail || fallback;
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearToken();
    if (!location.pathname.endsWith("index.html") && location.pathname !== "/admin/" && location.pathname !== "/admin") {
      location.href = "index.html";
    }
    throw new Error("Not authenticated");
  }

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = formatApiErrorDetail(body.detail, detail);
    } catch (_) {}
    throw new Error(detail);
  }

  if (res.status === 204) return null;
  return res.json();
}

const Api = {
  login: (email, password) => api("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => api("/api/auth/me"),

  summary: () => api("/api/admin/summary"),

  pages: () => api("/api/admin/pages"),
  createPage: (data) => api("/api/admin/pages", { method: "POST", body: JSON.stringify(data) }),

  categories: (pageSlug) => api(`/api/admin/categories${pageSlug ? `?page=${encodeURIComponent(pageSlug)}` : ""}`),
  createCategory: (data) => api("/api/admin/categories", { method: "POST", body: JSON.stringify(data) }),
  updateCategory: (id, data) => api(`/api/admin/categories/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCategory: (id) => api(`/api/admin/categories/${id}`, { method: "DELETE" }),
  reorderCategories: (pageId, ids) => api("/api/admin/categories/reorder", { method: "PUT", body: JSON.stringify({ page_id: pageId, ids }) }),
  categoryMedia: (id) => api(`/api/admin/categories/${id}/media`),
  addCategoryMedia: (id, data) => api(`/api/admin/categories/${id}/media`, { method: "POST", body: JSON.stringify(data) }),

  products: (categoryId) => api(`/api/admin/products${categoryId ? `?category_id=${encodeURIComponent(categoryId)}` : ""}`),
  // Every product on every page - the field builder's "Product link" picker searches these.
  allProducts: () => api("/api/admin/products?page_size=500"),
  createProduct: (data) => api("/api/admin/products", { method: "POST", body: JSON.stringify(data) }),
  updateProduct: (id, data) => api(`/api/admin/products/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteProduct: (id) => api(`/api/admin/products/${id}`, { method: "DELETE" }),
  addProductMedia: (id, data) => api(`/api/admin/products/${id}/media`, { method: "POST", body: JSON.stringify(data) }),

  deleteMedia: (id) => api(`/api/admin/media/${id}`, { method: "DELETE" }),
  reorderMedia: (ids) => api("/api/admin/media/reorder", { method: "PUT", body: JSON.stringify({ ids }) }),

  coupons: () => api("/api/admin/coupons"),
  createCoupon: (data) => api("/api/admin/coupons", { method: "POST", body: JSON.stringify(data) }),
  updateCoupon: (id, data) => api(`/api/admin/coupons/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCoupon: (id) => api(`/api/admin/coupons/${id}`, { method: "DELETE" }),

  bookings: (status) => api(`/api/admin/bookings${status ? `?status_filter=${encodeURIComponent(status)}` : ""}`),
  updateBookingStatus: (id, status) => api(`/api/admin/bookings/${id}`, { method: "PATCH", body: JSON.stringify({ status }) }),

  getSetting: (key) => api(`/api/admin/settings/${key}`).catch(() => null),
  setSetting: (key, value) => api(`/api/admin/settings/${key}`, { method: "PUT", body: JSON.stringify({ value }) }),

  staff: () => api("/api/admin/staff"),
  createStaff: (data) => api("/api/admin/staff", { method: "POST", body: JSON.stringify(data) }),
  deactivateStaff: (id) => api(`/api/admin/staff/${id}`, { method: "DELETE" }),
  reactivateStaff: (id) => api(`/api/admin/staff/${id}/reactivate`, { method: "POST" }),

  auditLog: (limit = 500) => api(`/api/admin/audit-log?limit=${limit}`),
  clearAuditLog: (olderThanDays) => api(`/api/admin/audit-log${olderThanDays ? `?older_than_days=${olderThanDays}` : ""}`, { method: "DELETE" }),
  activity: () => api("/api/admin/activity"),

  orders: (status) => api(`/api/admin/orders${status ? `?status_filter=${encodeURIComponent(status)}` : ""}`),
  order: (id) => api(`/api/admin/orders/${id}`),
  updateOrderStatus: (id, status) => api(`/api/admin/orders/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) }),
  updateOrderTracking: (id, data) => api(`/api/admin/orders/${id}/tracking`, { method: "PUT", body: JSON.stringify(data) }),
  refundOrder: (orderId) => api(`/api/payments/refund/${orderId}`, { method: "POST" }),

  cancellationRequests: (status) => api(`/api/admin/orders/cancellation-requests${status ? `?status_filter=${encodeURIComponent(status)}` : ""}`),
  decideCancellationRequest: (id, action, adminNote) => api(`/api/admin/orders/cancellation-requests/${id}`, { method: "PATCH", body: JSON.stringify({ action, admin_note: adminNote || "" }) }),

  addressChangeRequests: (status) => api(`/api/admin/orders/address-change-requests${status ? `?status_filter=${encodeURIComponent(status)}` : ""}`),
  decideAddressChangeRequest: (id, action, adminNote) => api(`/api/admin/orders/address-change-requests/${id}`, { method: "PATCH", body: JSON.stringify({ action, admin_note: adminNote || "" }) }),

  customers: (q, page = 1) => api(`/api/admin/customers?page=${page}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  deleteCustomer: (id) => api(`/api/admin/customers/${id}`, { method: "DELETE" }),
  blockEmail: (email, reason) => api("/api/admin/customers/block", { method: "POST", body: JSON.stringify({ email, reason: reason || "" }) }),
  unblockEmail: (email) => api("/api/admin/customers/unblock", { method: "POST", body: JSON.stringify({ email }) }),
  clearOtpActivity: (email) => api(`/api/admin/customers/otp-activity/${encodeURIComponent(email)}`, { method: "DELETE" }),

  contactMessages: (unreadOnly) =>
    api(`/api/admin/contact-messages${unreadOnly ? "?unread_only=true" : ""}`),
  setContactMessageRead: (id, isRead) =>
    api(`/api/admin/contact-messages/${id}/read`, { method: "PATCH", body: JSON.stringify({ is_read: isRead }) }),
  deleteContactMessage: (id) => api(`/api/admin/contact-messages/${id}`, { method: "DELETE" }),

  reviews: () => api("/api/admin/reviews"),
  toggleReview: (id) => api(`/api/admin/reviews/${id}/toggle`, { method: "PATCH" }),

  mediaLibrary: ({ categoryId, pageId } = {}) => {
    const params = new URLSearchParams();
    if (categoryId) params.set("category_id", categoryId);
    else if (pageId) params.set("page_id", pageId);
    const qs = params.toString();
    return api(`/api/admin/media${qs ? `?${qs}` : ""}`);
  },
  uploadMedia: (formData) => {
    const token = getToken();
    return fetch(`${API_BASE}/api/admin/media/upload`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    }).then(async (res) => {
      if (!res.ok) {
        let detail = res.statusText;
        try { detail = formatApiErrorDetail((await res.json()).detail, detail); } catch (_) {}
        throw new Error(detail);
      }
      return res.json();
    });
  },
  // Same endpoint as uploadMedia, but via XMLHttpRequest instead of fetch()
  // so onProgress(percent) can report real upload progress - fetch has no
  // upload-progress event, so a big photo (or a slow connection) left the
  // admin staring at a static "Uploading…" with no sign anything was
  // happening. onProgress is optional; omit it to behave like uploadMedia.
  uploadMediaWithProgress: (formData, onProgress) => {
    const token = getToken();
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE}/api/admin/media/upload`);
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      if (onProgress && xhr.upload) {
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        });
      }
      xhr.onload = () => {
        let body = null;
        try { body = JSON.parse(xhr.responseText); } catch (_) {}
        if (xhr.status >= 200 && xhr.status < 300) resolve(body);
        else reject(new Error(formatApiErrorDetail(body && body.detail, xhr.statusText || `HTTP ${xhr.status}`)));
      };
      xhr.onerror = () => reject(new Error("Network error during upload"));
      xhr.send(formData);
    });
  },

  allSettings: () => api("/api/admin/settings"),

  homepage: () => api("/api/admin/homepage"),
  setHomepage: (layout) => api("/api/admin/homepage", { method: "PUT", body: JSON.stringify(layout) }),
  resetHomepage: () => api("/api/admin/homepage", { method: "DELETE" }),
  menu: (name = "main") => api(`/api/admin/menu?name=${encodeURIComponent(name)}`),
  menuTargets: () => api("/api/admin/menu/targets"),
  setMenu: (name, menu) => api(`/api/admin/menu?name=${encodeURIComponent(name)}`, { method: "PUT", body: JSON.stringify(menu) }),
  resetMenu: (name) => api(`/api/admin/menu?name=${encodeURIComponent(name)}`, { method: "DELETE" }),

  arrange: (categoryId) => api(`/api/admin/arrange/${categoryId}`),
  setArrange: (categoryId, ids) => api("/api/admin/arrange", { method: "PUT", body: JSON.stringify({ category_id: categoryId, ids }) }),
};
