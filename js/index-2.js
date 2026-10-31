    // ---------- helpers ----------
    const starIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15 9 22 9.5 17 14.5 18.5 22 12 18 5.5 22 7 14.5 2 9.5 9 9"/></svg>`;
    const heartIcon = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>`;
    const tagIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20.5 12.79 12.7 20.6a2 2 0 0 1-2.83 0l-6.5-6.5a2 2 0 0 1 0-2.83L11.2 3.5H19a1.5 1.5 0 0 1 1.5 1.5v7.79z"/><circle cx="15.5" cy="8.5" r="1.25" fill="currentColor" stroke="none"/></svg>`;
    const cartIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1.4"/><circle cx="18" cy="21" r="1.4"/><path d="M2.5 3h2l2.4 12.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 8H6"/></svg>`;
    const camIcon = `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.55"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>`;
    const giftIcon = `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.5" opacity="0.55"><path d="M20 12v9H4v-9M2 7h20v5H2zM12 7v14"/></svg>`;

    // ---------- unsplash helper ----------
    const unsplash = (w, h, kw, sig) => `https://source.unsplash.com/${w}x${h}/?${kw}&sig=${sig}`;


    // ---------- categories ----------
    const categories = [
      ["Wedding Photography", "https://images.unsplash.com/photo-1519741497674-611481863552?w=150&h=150&fit=crop&q=80"],
      ["Pre-Wedding", "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?w=150&h=150&fit=crop&q=80"],
      ["Maternity Shoot", "https://images.unsplash.com/photo-1544126592-807ade215a0b?w=150&h=150&fit=crop&q=80"],
      ["Baby Shoot", "https://images.unsplash.com/photo-1519689680058-324335c77eba?w=150&h=150&fit=crop&q=80"],
      ["Birthday Photography", "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=150&h=150&fit=crop&q=80"],
      ["Event Photography", "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=150&h=150&fit=crop&q=80"],
      ["Customised Gift Shop", "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?w=150&h=150&fit=crop&q=80"],
      ["Studio Services", "https://images.unsplash.com/photo-1612815154858-60aa4c59eaa6?w=150&h=150&fit=crop&q=80"],
      ["Corporate Gifts", "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=150&h=150&fit=crop&q=80"]
    ];
    const categoryLinks = {
      "Wedding Photography": "photography.html?category=wedding",
      "Pre-Wedding": "photography.html?category=prewedding",
      "Maternity Shoot": "photography.html?category=maternity",
      "Baby Shoot": "photography.html?category=baby",
      "Birthday Photography": "photography.html?category=birthday",
      "Event Photography": "photography.html?category=event",
      "Customised Gift Shop": "gifts.html",
      "Studio Services": "studio.html",
      "Corporate Gifts": "corporate.html"
    };

    const categoryItemsHTML = categories.map(([name, imgUrl]) => `
    <a href="${categoryLinks[name] || '#'}" class="cat-item" style="text-decoration: none; color: inherit;">
      <div class="cat-circle"><img src="${imgUrl}" alt="${name}" loading="lazy"></div>
      <span>${name}</span>
    </a>`).join('');

    // Duplicate for seamless infinite scroll
    document.getElementById('catScroll').innerHTML = `<div class="cat-scroll-inner">${categoryItemsHTML}${categoryItemsHTML}</div>`;

    // ---------- photography services ----------
    // category id must match js/photography.js CATEGORIES ids, so the click lands
    // on that exact service's packages/portfolio - not just the generic page.
    // Populated by loadHomepageFeatured() below from the same GET /api/catalog/{page}
    // endpoints photography.html/studio.html/gifts.html/corporate.html themselves use -
    // the first product per category, from the database, instead of a hand-copied
    // snapshot of those pages' content that only stays correct until someone edits them.
    let services = [];
    function pctOff(price, old) {
      const p = parseInt(price.replace(/[^\d]/g, ''), 10);
      const o = parseInt(old.replace(/[^\d]/g, ''), 10);
      return Math.round((o - p) / o * 100);
    }

    function productCardHTML({ name, price, old, imgUrl, badge, rating, onClick, href, actionHTML }) {
      // href (when the caller has one) is baked into the wishlist entry as the
      // product's page, so the wishlist drawer can send the customer straight
      // back to it later - the same place clicking this card itself goes to.
      const wishOpts = href ? `{ url: '${href.replace(/'/g, "\\'")}' }` : '{}';
      return `
      <div class="p-card" onclick="${onClick}">
        <div class="p-thumb">
          <img src="${cldOpt(imgUrl)}" alt="${name}" loading="lazy" onerror="this.onerror=null;this.src=(window.SkLoading&&window.SkLoading.PLACEHOLDER_IMG)||'';">
          <button class="p-wish${isWished(name) ? ' active' : ''}" data-name="${name}" onclick="event.stopPropagation(); toggleWishItem('${name}', '${price}', '${imgUrl}', ${wishOpts})" aria-label="Add ${name} to wishlist">${heartIcon}</button>
        </div>
        <div class="p-body">
          <h4>${name}</h4>
          ${badge ? `<span class="p-badge">${tagIcon}${badge}</span>` : ''}
          <div class="p-card-footer">
            <span class="price">${price}${old ? `<span class="price-sub"><span class="old">${old}</span><span class="off-pct">${pctOff(price, old)}% OFF</span></span>` : ''}</span>
            <div class="p-rating">
              <button class="p-fav-btn" onclick="event.stopPropagation(); this.classList.toggle('faved')" aria-label="Add ${name} to favorites">${starIcon}</button>
            </div>
          </div>
          ${actionHTML ? `
          <div class="p-bottom-row">
            ${actionHTML}
          </div>` : ''}
        </div>
      </div>`;
    }

    // Same booking.html link photography.html's own package cards use (see
    // bookingURL() in js/photography.js) - so a homepage service card opens
    // that exact package's booking page instead of just landing on its category.
    function photoHref(categoryId, pid, name, tier, price, feat) {
      const q = new URLSearchParams({
        pid: pid || '',
        category: categoryId,
        package: name,
        tier: (tier || '').toLowerCase(),
        price: price,
        feats: (feat || []).join('|')
      });
      return `booking.html?${q.toString()}`;
    }

    function renderPhotoServices() {
      document.getElementById('photoServices').innerHTML = services.map(([name, price, tag, imgUrl, rating, categoryId, pid, tier, feat]) => {
        const href = photoHref(categoryId, pid, name, tier, price, feat);
        return productCardHTML({
          name, price, imgUrl, badge: tag, rating, href, onClick: `location.href='${href}'`
        });
      }).join('');
      wireFeaturedImageLoading('photoServices');
    }

    // ---------- studio services ----------
    // Populated by loadHomepageFeatured() below (see services comment above) -
    // category key included so the deep link can select the right category before
    // opening that package's preview modal (see studioHref() below).
    let studio = [];

    // ---------- customized gifts bestsellers ----------
    // Populated by loadHomepageFeatured() below (see services comment above) -
    // names must match the database exactly for gifts.html's ?view=product lookup.
    let gifts = [];

    // ---------- corporate gifts & hampers ----------
    // Populated by loadHomepageFeatured() below (see services comment above).
    let corp = [];

    const HOMEPAGE_API_BASE = window.SAI_API_BASE || "http://localhost:8000";

    // The first product per category, from the same page_bundle endpoint each
    // storefront page itself uses - so "editing a product in admin" and "editing
    // the homepage's picks for that page" are the same action for the owner.
    function pickFirstPerCategory(data, limit) {
      const picks = [];
      data.categories.forEach(c => {
        const pkgs = data.packages[c.id] || [];
        const chosen = pkgs[0];
        if (chosen) picks.push({ ...chosen, _categoryId: c.id });
      });
      return picks.slice(0, limit);
    }

    async function loadHomepageFeatured() {
      const fetchPage = slug => fetch(`${HOMEPAGE_API_BASE}/api/catalog/${slug}`)
        .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });

      const [photoData, studioData, giftsData, corpData] = await Promise.all([
        fetchPage('photography'), fetchPage('studio'), fetchPage('gifts'), fetchPage('corporate'),
      ]);

      services = pickFirstPerCategory(photoData, 6).map(p =>
        [p.title, p.price, 'Starting from', (p.images && p.images[0]) || '', p.rating || '', p._categoryId, p.id, p.tier, p.feat]);
      studio = pickFirstPerCategory(studioData, 6).map(p =>
        [p.title, p.price, p.mrp || null, (p.images && p.images[0]) || '', p.rating || '', p._categoryId, p.id]);
      gifts = pickFirstPerCategory(giftsData, 6).map(p =>
        [p.title, p.price, p.mrp || null, (p.images && p.images[0]) || '', p.rating || '']);
      corp = pickFirstPerCategory(corpData, 6).map(p =>
        [p.title, p.price, p.mrp || null, (p.images && p.images[0]) || '', p.rating || '', p.id]);
    }

    // deep-link builders - each page supports opening one exact product differently
    // (see the ?openProduct handling added to js/studio.js and js/corporate.js, and
    // gifts.html's existing ?view=product route)
    function giftHref(name) {
      return `gifts.html?view=product&product=${encodeURIComponent(name)}`;
    }
    function studioHref(name, categoryKey, pid) {
      const base = `studio.html?category=${encodeURIComponent(categoryKey)}&openProduct=${encodeURIComponent(name)}`;
      return pid ? `${base}&pid=${encodeURIComponent(pid)}` : base;
    }
    function corpHref(name, price, imgUrl, pid) {
      const base = `corporate.html?openProduct=${encodeURIComponent(name)}&openPrice=${encodeURIComponent(price)}&openImg=${encodeURIComponent(imgUrl)}`;
      return pid ? `${base}&pid=${encodeURIComponent(pid)}` : base;
    }

    function cartProductCardHTML(name, price, old, imgUrl, rating, targetHref) {
      // No quick-add "+" here anymore - the card itself now navigates straight to
      // that exact product, so adding to cart happens on the actual product page.
      // badge matches the "Starting from" label used by the photography section
      // above, so all four homepage shop-strip sections look the same.
      return productCardHTML({
        name, price, old, imgUrl, rating, badge: 'Starting from',
        href: targetHref, onClick: `location.href='${targetHref}'`
      });
    }

    function wireFeaturedImageLoading(containerId) {
      if (!window.SkLoading) return;
      const container = document.getElementById(containerId);
      if (!container) return;
      container.querySelectorAll('.p-thumb img').forEach(img => {
        window.SkLoading.wireImage(img, { wrap: img.closest('.p-thumb') });
      });
    }

    function renderProducts() {
      renderPhotoServices();
      document.getElementById('giftCards').innerHTML = gifts.map(([name, price, old, imgUrl, rating]) =>
        cartProductCardHTML(name, price, old, imgUrl, rating, giftHref(name))).join('');
      wireFeaturedImageLoading('giftCards');

      document.getElementById('studioServices').innerHTML = studio.map(([name, price, old, imgUrl, rating, categoryKey, pid]) =>
        cartProductCardHTML(name, price, old, imgUrl, rating, studioHref(name, categoryKey, pid))).join('');
      wireFeaturedImageLoading('studioServices');

      document.getElementById('corpCards').innerHTML = corp.map(([name, price, old, imgUrl, rating, pid]) =>
        cartProductCardHTML(name, price, old, imgUrl, rating, corpHref(name, price, imgUrl, pid))).join('');
      wireFeaturedImageLoading('corpCards');
    }

    // --- Cart System (js/shared/cart-core.js - shared storage/sync logic) ---
    function getCart() {
      return CartCore.getCart();
    }

    function saveCart(cart) {
      CartCore.saveCart(cart);
      updateCartUI();
    }

    function getCartQty(productName) {
      const cart = getCart();
      return cart[productName] ? cart[productName].qty : 0;
    }

    /* `key` is the cart line's real storage key (a configuration hash for any
       line added from a product page), never the display name - keying by name
       created a duplicate, product_id-less row instead of changing the row on
       screen. createIfMissing:false keeps that guarantee: the homepage has no
       add-to-cart of its own any more (its cards navigate to the product page),
       so these steppers only ever act on a line that already exists, and a
       stepper must not be able to invent one. */
    function updateCartQty(key, delta) {
      CartCore.updateQty(key, delta, {}, { createIfMissing: false });
      updateCartUI();
      renderProducts();
    }

    function removeCartItem(key) {
      CartCore.removeItem(key);
      updateCartUI();
      renderProducts();
    }

    function updateCartUI() {
      const cart = getCart();
      const items = Object.values(cart);
      let totalQty = 0;
      let totalPrice = 0;
      let firstItem = null;

      items.forEach(item => {
        totalQty += item.qty;
        const priceNum = parseInt(item.price.replace(/[^\d]/g, '')) || 0;
        totalPrice += priceNum * item.qty;
        if (!firstItem) firstItem = item;
      });

      // Update Header Cart Badge
      const navCartBadge = document.getElementById('navCartBadge');
      if (navCartBadge) {
        navCartBadge.textContent = totalQty;
        navCartBadge.style.display = totalQty > 0 ? 'flex' : 'none';
      }

      // Update Mobile Header Cart Badge
      const mobileCartBadge = document.getElementById('mobileCartBadge');
      if (mobileCartBadge) {
        mobileCartBadge.textContent = totalQty;
        mobileCartBadge.style.display = totalQty > 0 ? 'flex' : 'none';
      }

      // Update Mobile Bottom Nav Cart Badge
      const bottomNavCartBadge = document.getElementById('bottomNavCartBadge');
      if (bottomNavCartBadge) {
        bottomNavCartBadge.textContent = totalQty;
        bottomNavCartBadge.style.display = totalQty > 0 ? 'flex' : 'none';
      }

      // Update Mobile Floating Cart Bar
      const mobileBar = document.getElementById('mobileCartBar');
      if (mobileBar) {
        if (totalQty > 0) {
          mobileBar.style.display = 'flex';
          const barQty = document.getElementById('cartBarQty');
          if (barQty) {
            barQty.textContent = `${totalQty} ${totalQty === 1 ? 'item' : 'items'} • ₹${totalPrice}`;
          }
          const barThumb = document.getElementById('cartBarThumb');
          if (barThumb && firstItem) {
            barThumb.src = cldOpt(firstItem.img);
          }
        } else {
          mobileBar.style.display = 'none';
        }
      }

      // Update Cart Drawer Contents
      const drawerItemsContainer = document.getElementById('cartDrawerItems');
      const subtotalEl = document.getElementById('cartSubtotalValue');
      if (drawerItemsContainer) {
        if (items.length === 0) {
          drawerItemsContainer.innerHTML = cartDrawerEmptyStateHTML();
          if (subtotalEl) subtotalEl.textContent = '₹0';
        } else {
          drawerItemsContainer.innerHTML = Object.entries(cart).map(([key, item]) => `
            <div class="cart-drawer-item">
              <img class="cart-drawer-item-img" src="${cldOpt(item.img)}" alt="${item.name}" loading="lazy">
              <div class="cart-drawer-item-info">
                <h5>${item.name}</h5>
                <p>${item.price} each</p>
              </div>
              <div class="quantity-selector" style="height: 24px; min-width: 72px;">
                <button class="qty-btn" onclick="updateCartQty('${escapeAttrJs(key)}', -1)">-</button>
                <span class="qty-count">${item.qty}</span>
                <button class="qty-btn" onclick="updateCartQty('${escapeAttrJs(key)}', 1)">+</button>
              </div>
              <button class="cart-drawer-item-remove" onclick="removeCartItem('${escapeAttrJs(key)}')" title="Remove item" aria-label="Remove item">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
          `).join('');
          if (subtotalEl) subtotalEl.textContent = `₹${totalPrice}`;
        }
      }
    }

    // --- Wishlist + drawers ---
    // getWishlist/toggleWishItem/updateWishlistUI/openWishlistDrawer and the
    // mobile menu drawer used to be duplicated here. They now live in
    // js/shared/wishlist-menu.js (loaded by index.html below this file), which
    // is the one copy that gates saving behind sign-in and persists the
    // wishlist to the account instead of only this browser.

    function openCartDrawer() {
      document.getElementById('cartDrawer').classList.add('open');
      document.getElementById('cartDrawerOverlay').style.display = 'block';
      updateCartUI();
    }

    function closeCartDrawer() {
      document.getElementById('cartDrawer').classList.remove('open');
      document.getElementById('cartDrawerOverlay').style.display = 'none';
    }

    // ---------- cities ----------
    const cities = ["Hyderabad", "Secunderabad", "Gachibowli", "Madhapur", "Kukatpally", "Hitech City", "Ameerpet", "Dilsukhnagar", "LB Nagar", "Uppal"];
    const citiesVisibleCount = 4;
    const citiesExpandedState = {};

    function renderCityPills(containerId) {
      const list = citiesExpandedState[containerId] ? cities : cities.slice(0, citiesVisibleCount);
      document.getElementById(containerId).innerHTML = list.map(c => `<span class="pill">${c}</span>`).join('');
    }
    renderCityPills('citiesGifts');

    function toggleCities(btn) {
      const pillsWrap = btn.closest('.cities-card').querySelector('.city-pills');
      const containerId = pillsWrap.id;
      const expanded = !citiesExpandedState[containerId];
      citiesExpandedState[containerId] = expanded;
      pillsWrap.classList.toggle('expanded', expanded);
      renderCityPills(containerId);
      btn.classList.toggle('active', expanded);
      btn.querySelector('.view-more-label').textContent = expanded ? 'View Less' : 'View More';
    }

    // --- On Load ---
    window.addEventListener('DOMContentLoaded', async () => {
      try {
        await loadHomepageFeatured();
      } catch (err) {
        console.error('Could not load featured products for the homepage:', err);
      }
      renderProducts();
      updateCartUI(); // Initial cart UI refresh
      updateWishlistUI(); // Initial wishlist UI refresh
    });

    // ---------- MOBILE BOTTOM NAV ----------
    function setActiveBottomNav(el) {
      document.querySelectorAll(".bottom-nav-item").forEach(i => i.classList.remove("active"));
      el.classList.add("active");
    }
