// Single source of truth for the 'sai_studio_cart' localStorage cart, shared by
// every page that lets a visitor add/remove/change quantity (index-2.js,
// catalog.js, corporate.js, studio.js, gifts.js, contact-us-2.js,
// bulk-orders.js, cart.js). Each page used to keep its own copy of
// get/save/updateQty/removeItem - all reading/writing the same localStorage
// key but drifting slightly in behaviour (e.g. only some of them pushed a
// change to the logged-in customer's server-side cart), which is exactly the
// kind of bug that's invisible until a specific page/flow combination hits it.
// Load this before any page script that touches the cart. Drawer/UI rendering
// stays page-specific (the markup differs per page) - only the data layer
// lives here.
(function (global) {
  const STORAGE_KEY = 'sai_studio_cart';
  // Keys explicitly removed locally since the last confirmed server sync. The
  // server-side cart PUT (CustomerAuth.syncCart) is fire-and-forget - if the
  // customer navigates away (e.g. delete -> immediately go to checkout, or the
  // request is just slow) before it lands, syncCartWithServer()'s next GET/merge
  // reads the *old* server cart and, being a union merge, re-adds whatever this
  // browser doesn't have locally - resurrecting the very item just deleted, both
  // locally and back on the server. Recording the delete here means the merge
  // can recognize "this is a deletion still in flight," not "another device
  // added this," and skip re-adding it. Cleared once a push actually succeeds.
  const REMOVED_KEY = 'sai_studio_cart_removed';

  function getRemovedKeys() {
    try {
      return JSON.parse(localStorage.getItem(REMOVED_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function addRemovedKey(key) {
    const keys = getRemovedKeys();
    if (!keys.includes(key)) {
      keys.push(key);
      localStorage.setItem(REMOVED_KEY, JSON.stringify(keys));
    }
  }

  function clearRemovedKeys() {
    localStorage.removeItem(REMOVED_KEY);
  }

  function getCart() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function parsePrice(str) {
    return parseInt(String(str || '0').replace(/[^\d]/g, ''), 10) || 0;
  }

  /* ---------------- cart line identity ----------------------------------
     A cart line is one *configuration* of a product, not one product. Two
     lines of the same product that differ in any choice the customer made -
     a priced "16 Photos" vs "8 Photos" dropdown, a colour, an engraving, a
     different uploaded photo - are different things to buy, usually at
     different prices, and each needs its own row.

     Every page used to key lines by product name alone (studio.js appended
     the selected dropdown values to the *display* name, which helped only as
     long as that suffix was built; corporate.js didn't even do that), so two
     configurations of one product collapsed into a single row that kept
     whichever price and customization was added FIRST and just multiplied
     its quantity - the customer saw "16 Photos" at the 8-photo price, qty 2.

     Hashing the configuration - rather than gifts.js's old
     `${name}::${Date.now()}`, which was unique per *click* - keeps this
     deterministic: re-adding an identical configuration increments the row
     that's already there instead of stacking near-duplicate rows. */

  // Canonical JSON: object keys sorted, so two equal configurations always
  // hash the same regardless of the order the page happened to build them in.
  function stableStringify(value) {
    if (value === null || value === undefined) return 'null';
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    return `{${Object.keys(value).sort()
      .map(k => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
  }

  // Drops empty answers so a product whose optional fields were all left blank
  // still keys by its plain name (and so merges with an identical earlier add)
  // instead of by the hash of `{a:'',b:[]}`.
  function pruneEmpty(value) {
    if (Array.isArray(value)) {
      const out = value.map(pruneEmpty).filter(v => v !== undefined);
      return out.length ? out : undefined;
    }
    if (value && typeof value === 'object') {
      const out = {};
      Object.keys(value).forEach(k => {
        const v = pruneEmpty(value[k]);
        if (v !== undefined) out[k] = v;
      });
      return Object.keys(out).length ? out : undefined;
    }
    if (value === '' || value === null || value === undefined || value === false) return undefined;
    return value;
  }

  // FNV-1a, base36. Not a checksum anyone verifies - just a short, stable,
  // collision-unlikely id for a configuration, including base64 photo data.
  function hash36(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(36);
  }

  // `signature` is whatever distinguishes this line from another of the same
  // product - normally the whole `customization` object. Labels-only metadata
  // (fieldLabels) is ignored: it describes the questions, not the answers, so
  // it must not split a row. Returns the plain name when nothing distinguishes
  // it, which is what uncustomized products have always used (and what the
  // qty steppers on the simpler pages still key by).
  const MAX_KEY_LEN = 300; // cart_items.item_key is VARCHAR(300) server-side
  function lineKey(name, signature) {
    const meaningful = pruneEmpty(stripLabelMeta(signature));
    const base = String(name == null ? '' : name);
    if (meaningful === undefined) return base.slice(0, MAX_KEY_LEN);
    return `${base.slice(0, MAX_KEY_LEN - 12)}::${hash36(stableStringify(meaningful))}`;
  }

  function stripLabelMeta(signature) {
    if (!signature || typeof signature !== 'object' || Array.isArray(signature)) return signature;
    const { fieldLabels, ...rest } = signature;
    return rest;
  }

  function cartTotals(cart) {
    const items = Object.values(cart || getCart());
    let totalQty = 0;
    let totalPrice = 0;
    items.forEach((item) => {
      totalQty += item.qty;
      totalPrice += parsePrice(item.price) * item.qty;
    });
    return { items, totalQty, totalPrice };
  }

  function cartToServerItems(cart) {
    return Object.entries(cart).map(([key, item]) => ({
      key,
      product_id: item.product_id || null,
      name: item.name,
      price: String(item.price),
      img: item.img || null,
      qty: item.qty,
      // Deep link back to the product page/modal this line was configured on,
      // so the cart can make each row clickable (see cart.js). Kept on the
      // line rather than derived from product_id because each storefront page
      // has its own deep-link scheme (gifts ?view=product, studio/corporate
      // ?openProduct=&pid=) and the line doesn't record which page it came
      // from. Round-trips through the server cart so it survives a device
      // switch - see backend schemas.CartItemIn.url.
      url: item.url || null,
      customization: item.customization || null,
      requirement: item.requirement || null,
    }));
  }

  function serverItemsToCart(items) {
    const cart = {};
    (items || []).forEach((item) => {
      cart[item.key] = {
        product_id: item.product_id || null,
        name: item.name,
        price: item.price,
        img: item.img,
        qty: item.qty,
        url: item.url || '',
        customization: item.customization,
        requirement: item.requirement,
      };
    });
    return cart;
  }

  // Union merge: an item only on one side is kept as-is; an item on both sides
  // keeps the higher quantity - avoids silently dropping whichever side has
  // more without double-adding every time this runs. Items still pending
  // deletion (see REMOVED_KEY above) are excluded from "only on server side"
  // so an in-flight delete can't be resurrected by a stale server read.
  function mergeCarts(localCart, serverCart) {
    const removed = getRemovedKeys();
    const merged = { ...localCart };
    Object.entries(serverCart).forEach(([key, item]) => {
      if (removed.includes(key)) return;
      if (!merged[key]) merged[key] = item;
      else if (item.qty > merged[key].qty) merged[key] = { ...merged[key], qty: item.qty };
    });
    return merged;
  }

  // Fire-and-forget push to the account's server-side cart. Guarded so pages
  // that haven't loaded js/shared/customer-api.js (or a guest visitor) just
  // no-op instead of throwing. Clears the removed-keys tombstone only once this
  // push actually lands - the cart it just sent already reflects every pending
  // deletion, so a successful PUT means the server is caught up and future
  // merges are safe again.
  function pushCartIfLoggedIn(cart) {
    if (typeof isCustomerLoggedIn !== 'function' || !isCustomerLoggedIn()) return;
    if (typeof CustomerAuth === 'undefined') return;
    CustomerAuth.syncCart(cartToServerItems(cart || getCart())).then(clearRemovedKeys).catch(() => {});
  }

  // Every mutation funnels through here so the server push happens uniformly -
  // previously only cart.js and gifts.js remembered to push after a change,
  // so an item added while logged in from, say, the homepage or corporate.js
  // stayed local-only until the visitor happened to also open cart.html.
  function saveCart(cart) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch (e) {
      // Most commonly QuotaExceededError - a large base64 photo (or several)
      // pushed the serialized cart past the browser's ~5-10MB localStorage
      // limit. Left uncaught, this throws out of updateQty()/removeItem()
      // (called directly from "Add to cart"/qty-stepper handlers with no
      // try/catch of their own on most pages) and the item silently never
      // gets added, with no indication to the shopper of what went wrong.
      console.error('Could not save cart to local storage', e);
      alert('This item could not be added - your browser storage is full. Try removing a photo from another cart item, or clearing some browser storage, then try again.');
      return cart;
    }
    pushCartIfLoggedIn(cart);
    return cart;
  }

  // Upsert-style +/- used by "Add to cart" buttons and quantity steppers
  // across the product-listing pages. `extra` supplies the fields needed to
  // create the row the first time (name/price/img/product_id/customization/
  // requirement); on an existing row only qty changes (customization/
  // requirement are overwritten only when explicitly passed again).
  function updateQty(key, delta, extra = {}, { createIfMissing = true } = {}) {
    const cart = getCart();
    if (!cart[key]) {
      if (!createIfMissing) return cart;
      cart[key] = {
        name: extra.name || key,
        product_id: extra.product_id || null,
        qty: 0,
        price: extra.price || '',
        img: extra.img || '',
        url: extra.url || '',
        customization: extra.customization || null,
        requirement: extra.requirement || null,
      };
    }
    // Refresh the display fields whenever the caller actually supplies them
    // (an add-to-cart does; a +/- stepper passes `{}` and so changes nothing).
    // Previously only qty ever changed on an existing row, so a line kept the
    // name/price it was first created with forever - which is how a row could
    // sit in the cart showing a price the product no longer sells at.
    if (extra.name) cart[key].name = extra.name;
    if (extra.price) cart[key].price = extra.price;
    if (extra.img) cart[key].img = extra.img;
    if (extra.product_id) cart[key].product_id = extra.product_id;
    if (extra.url) cart[key].url = extra.url;
    if (extra.customization) cart[key].customization = extra.customization;
    if (extra.requirement) cart[key].requirement = extra.requirement;
    cart[key].qty += delta;
    if (cart[key].qty <= 0) {
      delete cart[key];
      addRemovedKey(key);
    }
    saveCart(cart);
    return cart;
  }

  function removeItem(key) {
    const cart = getCart();
    delete cart[key];
    addRemovedKey(key);
    saveCart(cart);
    return cart;
  }

  global.CartCore = {
    STORAGE_KEY,
    getCart,
    saveCart,
    parsePrice,
    lineKey,
    cartTotals,
    updateQty,
    removeItem,
    cartToServerItems,
    serverItemsToCart,
    mergeCarts,
    pushCartIfLoggedIn,
  };
})(window);
