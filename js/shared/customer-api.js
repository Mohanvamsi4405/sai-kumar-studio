/* ============================================================
   Real backend-auth helper (OTP login + addresses + orders).
   Backs both checkout (cart.html) and the site-wide nav "Login"
   modal (js/shared/auth-modal.js) — one real session, same email
   OTP, everywhere.
   ============================================================ */
const CUSTOMER_API_BASE = window.SAI_API_BASE || "http://localhost:8000";
const CUSTOMER_TOKEN_KEY = "sai_studio_customer_token";
const CUSTOMER_REFRESH_KEY = "sai_studio_customer_refresh";
const CUSTOMER_EMAIL_KEY = "sai_studio_customer_email";
const CUSTOMER_NAME_KEY = "sai_studio_customer_name";
const CUSTOMER_PHONE_KEY = "sai_studio_customer_phone";

function getCustomerToken() { return localStorage.getItem(CUSTOMER_TOKEN_KEY); }
function getCustomerEmail() { return localStorage.getItem(CUSTOMER_EMAIL_KEY); }
function getCustomerName() { return localStorage.getItem(CUSTOMER_NAME_KEY) || ""; }
function getCustomerPhone() { return localStorage.getItem(CUSTOMER_PHONE_KEY) || ""; }
function isCustomerLoggedIn() { return !!getCustomerToken(); }

function setCustomerSession(tokens, email) {
  localStorage.setItem(CUSTOMER_TOKEN_KEY, tokens.access_token);
  localStorage.setItem(CUSTOMER_REFRESH_KEY, tokens.refresh_token);
  if (email) localStorage.setItem(CUSTOMER_EMAIL_KEY, email);
}

function clearCustomerSession() {
  localStorage.removeItem(CUSTOMER_TOKEN_KEY);
  localStorage.removeItem(CUSTOMER_REFRESH_KEY);
  localStorage.removeItem(CUSTOMER_EMAIL_KEY);
  localStorage.removeItem(CUSTOMER_NAME_KEY);
  localStorage.removeItem(CUSTOMER_PHONE_KEY);
}

// A 401 here means the stored access token is expired/invalid. Until this ran,
// isCustomerLoggedIn() kept returning true off the mere presence of a token,
// so the nav/drawer/account-modal kept showing the cached name off a session
// that no longer works - and every real request (cart sync included) failed
// silently underneath it. Clearing the session + cached wishlist and asking
// the nav to repaint is what drops the UI back to "logged out" immediately,
// instead of leaving stale identity on screen until the customer reloads.
function handleExpiredCustomerSession() {
  clearCustomerSession();
  try {
    localStorage.removeItem("sai_studio_wishlist");
    // The cart is a single shared localStorage key, not namespaced per-account -
    // if it's left behind after logout, the next person to sign in on this same
    // browser (or this same account's next guest session) gets whatever the
    // previous customer had in their cart merged straight into their account
    // the moment syncCartWithServer()/pushCartIfLoggedIn() next runs.
    localStorage.removeItem("sai_studio_cart");
    if (typeof window.updateWishlistUI === "function") window.updateWishlistUI();
    if (typeof window.renderCartPage === "function") window.renderCartPage();
    if (typeof window.updateCartUI === "function") window.updateCartUI();
  } catch (_) {}
  if (window.SaiAuthNav && typeof window.SaiAuthNav.refresh === "function") window.SaiAuthNav.refresh();
}

async function customerApi(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  const token = getCustomerToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${CUSTOMER_API_BASE}${path}`, { ...options, headers });
  if (res.status === 401 && token) {
    handleExpiredCustomerSession();
    throw new Error("Your session has expired. Please sign in again.");
  }
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail || detail; } catch (_) {}
    throw new Error(detail);
  }
  if (res.status === 204) return null;
  return res.json();
}

const CustomerAuth = {
  requestOtp: (email) => customerApi("/api/auth/otp/request", { method: "POST", body: JSON.stringify({ email }) }),
  verifyOtp: async (email, code, name) => {
    const tokens = await customerApi("/api/auth/otp/verify", { method: "POST", body: JSON.stringify({ email, code, name: name || undefined }) });
    setCustomerSession(tokens, email);
    return tokens;
  },
  // The wishlist is login-gated and lives on the account, so its localStorage
  // copy is just a cache of the signed-out user's rows - leaving it behind
  // would show their saved items to whoever signs in next on this browser.
  logout: () => handleExpiredCustomerSession(),

  getMe: async () => {
    const me = await customerApi("/api/auth/me");
    try {
      localStorage.setItem(CUSTOMER_NAME_KEY, me.name || "");
      localStorage.setItem(CUSTOMER_PHONE_KEY, me.phone || "");
    } catch (_) {}
    return me;
  },
  updateMe: async (data) => {
    const me = await customerApi("/api/auth/me", { method: "PATCH", body: JSON.stringify(data) });
    try {
      localStorage.setItem(CUSTOMER_NAME_KEY, me.name || "");
      localStorage.setItem(CUSTOMER_PHONE_KEY, me.phone || "");
    } catch (_) {}
    return me;
  },

  getAddresses: () => customerApi("/api/addresses"),
  createAddress: (data) => customerApi("/api/addresses", { method: "POST", body: JSON.stringify(data) }),
  updateAddress: (id, data) => customerApi(`/api/addresses/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteAddress: (id) => customerApi(`/api/addresses/${id}`, { method: "DELETE" }),

  getCart: () => customerApi("/api/cart"),
  syncCart: (items) => customerApi("/api/cart", { method: "PUT", body: JSON.stringify({ items }) }),
  clearServerCart: () => customerApi("/api/cart", { method: "DELETE" }),

  // Fire-and-forget push after a local cart mutation while logged in, so a
  // page that doesn't already have its own cart-sync (e.g. gifts.js's several
  // views) still keeps the account's server-side cart current - without this,
  // items added while logged in only ever lived in that one browser's
  // localStorage and vanished the moment the customer logged in elsewhere.
  pushCartIfLoggedIn: (cart) => {
    if (!isCustomerLoggedIn()) return;
    const items = Object.entries(cart).map(([key, item]) => ({
      key, product_id: item.product_id || null, name: item.name, price: String(item.price), img: item.img || null,
      qty: item.qty, customization: item.customization || null, requirement: item.requirement || null,
    }));
    customerApi("/api/cart", { method: "PUT", body: JSON.stringify({ items }) }).catch(() => {});
  },

  // Wishlist. Unlike the cart there's no guest state to merge - the heart icon
  // is login-gated (js/shared/wishlist-menu.js), so the server rows ARE the
  // wishlist and localStorage is only a cache for instant rendering.
  getWishlist: () => customerApi("/api/wishlist"),
  syncWishlist: (items) => customerApi("/api/wishlist", { method: "PUT", body: JSON.stringify({ items }) }),
  removeWishlistItem: (key) => customerApi(`/api/wishlist/items/${encodeURIComponent(key)}`, { method: "DELETE" }),
  clearServerWishlist: () => customerApi("/api/wishlist", { method: "DELETE" }),

  checkout: (body) => customerApi("/api/orders/checkout", { method: "POST", body: JSON.stringify(body) }),
  confirmCod: (orderId) => customerApi(`/api/orders/${orderId}/confirm-cod`, { method: "POST" }),
  mockPay: (paymentId) => customerApi(`/api/payments/mock-pay/${paymentId}`, { method: "POST" }),
  verifyPayment: (body) => customerApi("/api/payments/verify", { method: "POST", body: JSON.stringify(body) }),
  myOrders: () => customerApi("/api/orders/my"),
  getOrder: (orderId) => customerApi(`/api/orders/${orderId}`),
  requestCancellation: (orderId, reason, note, orderItemId) =>
    customerApi(`/api/orders/${orderId}/cancel`, { method: "POST", body: JSON.stringify({ reason, note: note || "", order_item_id: orderItemId || null }) }),
  requestAddressChange: (orderId, address) =>
    customerApi(`/api/orders/${orderId}/address-change`, { method: "POST", body: JSON.stringify(address) }),
  myBookings: () => customerApi("/api/bookings/my"),

  // Uploads one customer photo and resolves to its stored URL. Deliberately not
  // routed through customerApi(): that sets Content-Type: application/json,
  // whereas a multipart body needs the browser to set the header itself so it
  // can include the multipart boundary. Everything else - the bearer token, the
  // expired-session handling, the server's error text - matches.
  uploadArtwork: async (file) => {
    const token = getCustomerToken();
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${CUSTOMER_API_BASE}/api/uploads/artwork`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
    if (res.status === 401 && token) {
      handleExpiredCustomerSession();
      throw new Error("Your session has expired. Please sign in again.");
    }
    if (!res.ok) {
      let detail = res.statusText;
      try { detail = (await res.json()).detail || detail; } catch (_) {}
      throw new Error(detail);
    }
    return res.json();
  },
};
