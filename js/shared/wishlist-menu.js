/* ============================================================
   Shared Wishlist + Mobile Menu Drawer (site-wide)
   ------------------------------------------------------------
   Saving to the wishlist requires being signed in. Tapping any
   heart as a guest opens the shared sign-in modal (SaiAuth.open,
   js/shared/auth-modal.js) explaining why, and the item they
   tapped is saved for real the moment the OTP is verified.

   Once signed in, the wishlist lives in the database
   (PUT /api/wishlist -> wishlist_items) so it follows the account
   to any browser or device. localStorage stays in play only as a
   cache, so badges and the drawer render instantly on page load
   instead of waiting on the network - and it is cleared on logout
   (see CustomerAuth.logout) so one customer's saved items never
   show up for the next person on a shared browser.

   Requires js/shared/customer-api.js; js/shared/auth-modal.js
   provides the sign-in gate.
   ============================================================ */

var WISHLIST_STORAGE_KEY = 'sai_studio_wishlist';

/* ---------- local cache ---------- */

function getWishlist() {
  try {
    return JSON.parse(localStorage.getItem(WISHLIST_STORAGE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveWishlist(wishlist) {
  try {
    localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(wishlist));
  } catch (e) {}
  updateWishlistUI();
  refreshHeartButtons();
}

function isWished(productKey) {
  return !!getWishlist()[productKey];
}

/* ---------- sign-in gate ---------- */

function isWishlistSignedIn() {
  return typeof isCustomerLoggedIn === 'function' && isCustomerLoggedIn();
}

/* Runs `action` if the customer is signed in; otherwise opens the shared
   sign-in modal with wishlist-specific copy and runs `action` once they are
   verified, so the heart they tapped still gets saved without a second click. */
function requireLoginForWishlist(action) {
  if (isWishlistSignedIn()) {
    action();
    return true;
  }
  if (window.SaiAuth && typeof window.SaiAuth.open === 'function') {
    window.SaiAuth.open({
      reason: {
        title: 'Sign in to save this',
        body: 'Your wishlist is saved to your account, so it is waiting for you on any device. ' +
              'Enter your email and we will send a 6-digit code.',
      },
      onSuccess: action,
    });
  } else {
    // auth-modal.js is not on this page - say it plainly rather than silently
    // doing nothing when the heart is tapped.
    showWishlistToast('Please sign in to add items to your wishlist.');
  }
  return false;
}

/* ---------- server sync ---------- */

function wishlistToServerItems(wishlist) {
  return Object.keys(wishlist).map(function (key) {
    var item = wishlist[key] || {};
    return {
      key: key,
      product_id: item.product_id || null,
      name: item.name || key,
      price: item.price == null ? '' : String(item.price),
      img: item.img || null,
      url: item.url || null,
    };
  });
}

function serverItemsToWishlist(items) {
  var wishlist = {};
  (items || []).forEach(function (item) {
    wishlist[item.key] = {
      key: item.key, product_id: item.product_id || null,
      name: item.name, price: item.price, img: item.img, url: item.url || null,
    };
  });
  return wishlist;
}

var wishlistSyncInFlight = null;

/* Pulls the signed-in account's wishlist and makes it the local cache. The
   server is the source of truth here (saving is login-gated, so anything in
   localStorage came from this same account) - no merge needed, unlike the cart,
   which has to keep guest items added before login. */
function syncWishlistWithServer() {
  if (!isWishlistSignedIn()) return Promise.resolve();
  if (wishlistSyncInFlight) return wishlistSyncInFlight;
  wishlistSyncInFlight = CustomerAuth.getWishlist().then(function (result) {
    try {
      localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(serverItemsToWishlist(result.items)));
    } catch (e) {}
    updateWishlistUI();
    refreshHeartButtons();
  }).catch(function () {
    // best-effort: a failed pull leaves the cached copy in place
  }).then(function () {
    wishlistSyncInFlight = null;
  });
  return wishlistSyncInFlight;
}

/* Fire-and-forget push after a local change, so the account's stored wishlist
   stays current without the heart animation waiting on the network. */
function pushWishlistIfLoggedIn() {
  if (!isWishlistSignedIn()) return;
  CustomerAuth.syncWishlist(wishlistToServerItems(getWishlist())).catch(function () {});
}

/* ---------- mutations ---------- */

/* `opts` carries what the plain (name, price, img) signature cannot:
   { key } to store under a product id instead of the name, { product_id }
   to link the row to a catalog product server-side, and { url } - the
   product's own page, baked in at save time so the wishlist drawer can send
   the customer straight back to it later from any page/device. */
function toggleWishItem(productName, priceStr, imgUrl, opts) {
  opts = opts || {};
  var key = opts.key || productName;

  requireLoginForWishlist(function () {
    var wishlist = getWishlist();
    var added;
    if (wishlist[key]) {
      delete wishlist[key];
      added = false;
    } else {
      wishlist[key] = {
        key: key, name: productName, price: priceStr, img: imgUrl,
        product_id: opts.product_id || null, url: opts.url || null,
      };
      added = true;
    }
    saveWishlist(wishlist);
    pushWishlistIfLoggedIn();
    if (!opts.silent) {
      showWishlistToast(added ? 'Saved to your wishlist.' : 'Removed from your wishlist.');
    }
    if (typeof opts.onDone === 'function') opts.onDone(added);
  });
}

function removeWishItem(productKey) {
  if (!isWishlistSignedIn()) return;
  var wishlist = getWishlist();
  delete wishlist[productKey];
  saveWishlist(wishlist);
  pushWishlistIfLoggedIn();
}

/* Sends the customer to the actual product page for a saved item - the drawer
   row itself is the "open this" control, so there is no separate button for it. */
function openWishItem(productKey) {
  var item = getWishlist()[productKey];
  if (!item || !item.url) {
    showWishlistToast('Sorry, we could not find that product’s page.');
    return;
  }
  window.location.href = item.url;
}

/* ---------- drawer + badges ---------- */

function escapeWishHTML(value) {
  var d = document.createElement('div');
  d.textContent = value == null ? '' : value;
  return d.innerHTML;
}

function updateWishlistUI() {
  var wishlist = getWishlist();
  var keys = Object.keys(wishlist);
  var count = keys.length;

  [document.getElementById('navWishlistBadge'), document.getElementById('mobileWishlistBadge')].forEach(function (badge) {
    if (!badge) return;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  });

  var drawerItemsContainer = document.getElementById('wishlistDrawerItems');
  if (!drawerItemsContainer) return;

  if (count === 0) {
    drawerItemsContainer.innerHTML =
      '<div style="text-align: center; color: #888; padding-top: 40px;">' +
        '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 12px; opacity: 0.5;">' +
          '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />' +
        '</svg>' +
        '<p>' + (isWishlistSignedIn() ? 'Your wishlist is empty' : 'Sign in to see your saved items') + '</p>' +
      '</div>';
    return;
  }

  // Item data goes in data-* attributes and the buttons are wired by delegation
  // below - building onclick="...('${item.name}')" strings broke on any product
  // whose name contains an apostrophe. The row itself (data-wish-open) is the
  // "go to this product" control; only the × button opts out of that via
  // data-wish-action="remove" + stopPropagation in the click handler below.
  drawerItemsContainer.innerHTML = keys.map(function (key) {
    var item = wishlist[key] || {};
    var k = escapeWishHTML(key);
    var safeName = escapeWishHTML(item.name);
    return '' +
      '<div class="cart-drawer-item" data-wish-open data-wish-key="' + k + '" ' +
        'role="button" tabindex="0" title="View ' + safeName + '" style="cursor:pointer;">' +
        '<img class="cart-drawer-item-img" src="' + escapeWishHTML(item.img) + '" alt="' + safeName + '" loading="lazy">' +
        '<div class="cart-drawer-item-info">' +
          '<h5>' + safeName + '</h5>' +
          '<p>' + escapeWishHTML(item.price) + '</p>' +
        '</div>' +
        '<button class="cart-drawer-item-remove" data-wish-action="remove" data-wish-key="' + k + '" title="Remove item" aria-label="Remove ' + safeName + '">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>' +
          '</svg>' +
        '</button>' +
      '</div>';
  }).join('');
}

function openWishlistDrawer() {
  var drawer = document.getElementById('wishlistDrawer');
  var overlay = document.getElementById('wishlistDrawerOverlay');
  if (drawer) drawer.classList.add('open');
  if (overlay) overlay.style.display = 'block';
  updateWishlistUI();
  syncWishlistWithServer();
}

function closeWishlistDrawer() {
  var drawer = document.getElementById('wishlistDrawer');
  var overlay = document.getElementById('wishlistDrawerOverlay');
  if (drawer) drawer.classList.remove('open');
  if (overlay) overlay.style.display = 'none';
}

function openMobileMenuDrawer() {
  var drawer = document.getElementById('mobileMenuDrawer');
  var overlay = document.getElementById('mobileMenuOverlay');
  if (window.SaiAuthNav) window.SaiAuthNav.refresh();
  if (drawer) drawer.classList.add('open');
  if (overlay) overlay.style.display = 'block';
}

function closeMobileMenuDrawer() {
  var drawer = document.getElementById('mobileMenuDrawer');
  var overlay = document.getElementById('mobileMenuOverlay');
  if (drawer) drawer.classList.remove('open');
  if (overlay) overlay.style.display = 'none';
}

/* ---------- lightweight toast ---------- */

/* Most pages have no toast of their own (catalog.js and gifts.js each have one,
   with their own signatures), so the wishlist ships a small self-contained one
   rather than depending on whichever page it happens to be running on. */
function showWishlistToast(message) {
  var el = document.getElementById('skWishToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'skWishToast';
    el.setAttribute('role', 'status');
    el.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%) translateY(12px);' +
      'z-index:1300;max-width:calc(100vw - 32px);padding:12px 18px;border-radius:11px;background:#0B1220;' +
      'color:#fff;font:600 13.5px/1.4 Inter,system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center;' +
      'box-shadow:0 14px 34px rgba(11,18,32,.32);opacity:0;pointer-events:none;transition:opacity .22s,transform .22s;';
    document.body.appendChild(el);
  }
  el.textContent = message;
  requestAnimationFrame(function () {
    el.style.opacity = '1';
    el.style.transform = 'translateX(-50%) translateY(0)';
  });
  clearTimeout(el._hideTimer);
  el._hideTimer = setTimeout(function () {
    el.style.opacity = '0';
    el.style.transform = 'translateX(-50%) translateY(12px)';
  }, 2600);
}

/* ---------- heart buttons across the site ---------- */

/* Product cards on studio/gifts/corporate render a heart whose only behaviour
   was an inline `this.classList.toggle('active')` - it looked saved but stored
   nothing. Rather than editing every one of those templates (and corporate.html's
   hardcoded cards), one capture-phase listener claims those clicks and routes
   them through the same gated, DB-backed toggle as everything else. */
var DECORATIVE_HEART_SELECTOR = '.p-wishlist-btn, .pkg-wishlist-btn, .gallery-wishlist-btn';
var ALL_HEART_SELECTOR = DECORATIVE_HEART_SELECTOR + ', .p-wish, .wishlist-heart-btn';

function textOf(el) {
  return el ? (el.textContent || '').trim() : '';
}

function firstText(root, selectors) {
  for (var i = 0; i < selectors.length; i++) {
    var found = root.querySelector(selectors[i]);
    if (found && textOf(found)) return textOf(found);
  }
  return '';
}

/* Pulls a page-navigation URL straight off onclick="location.href='...'" (or
   window.location.href=) - the pattern js/index-2.js's homepage cards use, so
   a heart on that card can point the wishlist drawer at the exact same place
   the card itself would navigate to, with no per-page logic needed here. */
function extractHrefFromOnclick(el) {
  if (!el) return null;
  var attr = el.getAttribute('onclick') || '';
  var m = attr.match(/(?:window\.)?location(?:\.href)?\s*=\s*'([^']*)'/) ||
          attr.match(/(?:window\.)?location(?:\.href)?\s*=\s*"([^"]*)"/);
  return m ? m[1] : null;
}

/* Builds the deep link back to a specific product on pages that open it via a
   JS function/modal rather than a plain navigation - matching the ?openProduct=
   readers each of those pages already implements for its own homepage cards. */
function buildProductUrl(item) {
  if (typeof window.openProductPageByName === 'function') {
    // gifts.html
    return 'gifts.html?view=product&product=' + encodeURIComponent(item.name);
  }
  if (typeof window.orderNowDirect === 'function') {
    // corporate.html
    return 'corporate.html?openProduct=' + encodeURIComponent(item.name) +
      '&openPrice=' + encodeURIComponent(item.price || '') +
      '&openImg=' + encodeURIComponent(item.img || '');
  }
  if (typeof window.openProductPreview === 'function') {
    // studio.html - switchCategory() keeps ?category= in the URL in sync with
    // whatever's currently showing, so it is safe to read back here.
    var category = new URLSearchParams(window.location.search).get('category') || 'all';
    return 'studio.html?category=' + encodeURIComponent(category) +
      '&openProduct=' + encodeURIComponent(item.name);
  }
  return null;
}

/* Reads the product a heart belongs to. Explicit data-wish-* attributes win;
   otherwise the surrounding card's own markup is used, which is what makes the
   static cards in corporate.html work without touching them. */
function readHeartItem(btn) {
  if (btn.classList.contains('gallery-wishlist-btn')) {
    // gifts.html's product view - the "card" is the whole detail page
    var nameEl = document.getElementById('productName');
    if (!nameEl || !textOf(nameEl)) return null;
    var galleryImg = document.getElementById('galleryImage');
    var galleryItem = {
      key: textOf(nameEl),
      name: textOf(nameEl),
      price: textOf(document.getElementById('productPrice')),
      img: galleryImg ? galleryImg.getAttribute('src') : '',
      product_id: null,
    };
    galleryItem.url = buildProductUrl(galleryItem);
    return galleryItem;
  }

  var card = btn.closest('[data-wish-name], .pkg-card, .fnp-product-card, .p-card, .product-card');
  if (!card) return null;

  if (card.getAttribute('data-wish-name')) {
    var explicitItem = {
      key: card.getAttribute('data-wish-key') || card.getAttribute('data-wish-name'),
      name: card.getAttribute('data-wish-name'),
      price: card.getAttribute('data-wish-price') || '',
      img: card.getAttribute('data-wish-img') || '',
      product_id: card.getAttribute('data-wish-product-id') || null,
    };
    explicitItem.url = card.getAttribute('data-wish-url') || extractHrefFromOnclick(card) || buildProductUrl(explicitItem);
    return explicitItem;
  }

  var name = firstText(card, ['.p-name', '.p-title', '.pkg-body h3', 'h3', 'h4']) || card.getAttribute('data-name');
  if (!name) return null;
  var img = card.querySelector('img');
  var item = {
    key: name,
    name: name,
    price: firstText(card, ['.p-price', '.pkg-price', '.price']),
    img: img ? img.getAttribute('src') : '',
    product_id: card.getAttribute('data-product-id') || null,
  };
  item.url = extractHrefFromOnclick(card) || buildProductUrl(item);
  return item;
}

function activeClassFor(btn) {
  return btn.classList.contains('wishlist-heart-btn') ? 'is-active' : 'active';
}

/* Keeps every heart on the page showing the real saved state - after a page
   render, after a server sync, and after logout clears the cache. */
function refreshHeartButtons() {
  var wishlist = getWishlist();
  document.querySelectorAll(ALL_HEART_SELECTOR).forEach(function (btn) {
    var key = btn.getAttribute('data-name');
    if (!key) {
      var item = readHeartItem(btn);
      if (!item) return;
      key = item.key;
    }
    btn.classList.toggle(activeClassFor(btn), !!wishlist[key]);
  });
}

document.addEventListener('click', function (e) {
  var target = e.target;
  if (!target || typeof target.closest !== 'function') return;

  // Wishlist drawer row's × (remove) button - takes priority over the row's
  // own click-to-open below since it's nested inside that row.
  var rowActionBtn = target.closest('[data-wish-action="remove"]');
  if (rowActionBtn) {
    e.preventDefault();
    e.stopPropagation();
    removeWishItem(rowActionBtn.getAttribute('data-wish-key'));
    return;
  }

  // Wishlist drawer row itself - sends the customer to that product's page.
  var rowOpen = target.closest('[data-wish-open]');
  if (rowOpen) {
    e.preventDefault();
    e.stopPropagation();
    openWishItem(rowOpen.getAttribute('data-wish-key'));
    return;
  }

  // Hearts that have no real handler of their own. Claiming the click in the
  // capture phase stops the inline `this.classList.toggle('active')` (and the
  // card's own click-through to the product page) from running.
  var heart = target.closest(DECORATIVE_HEART_SELECTOR);
  if (!heart) return;
  e.preventDefault();
  e.stopPropagation();

  var heartItem = readHeartItem(heart);
  if (!heartItem) return;
  toggleWishItem(heartItem.name, heartItem.price, heartItem.img, {
    key: heartItem.key,
    product_id: heartItem.product_id,
    url: heartItem.url,
  });
}, true);

// Keyboard equivalent of the drawer row click above (role="button" tabindex="0").
document.addEventListener('keydown', function (e) {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  var target = e.target;
  if (!target || typeof target.closest !== 'function') return;
  var rowOpen = target.closest('[data-wish-open]');
  if (!rowOpen) return;
  e.preventDefault();
  openWishItem(rowOpen.getAttribute('data-wish-key'));
});

/* Cards on catalog/gifts/corporate/studio render after their data loads, so a
   one-shot pass at DOMContentLoaded would miss most hearts. */
var heartRefreshTimer = null;
function scheduleHeartRefresh() {
  clearTimeout(heartRefreshTimer);
  heartRefreshTimer = setTimeout(refreshHeartButtons, 120);
}

function initWishlist() {
  updateWishlistUI();
  refreshHeartButtons();
  syncWishlistWithServer();
  if (window.MutationObserver && document.body) {
    new MutationObserver(scheduleHeartRefresh).observe(document.body, { childList: true, subtree: true });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWishlist);
} else {
  initWishlist();
}
