    const cartIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1.4"/><circle cx="18" cy="21" r="1.4"/><path d="M2.5 3h2l2.4 12.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.6L21 8H6"/></svg>`;


    // --- Cart System (js/shared/cart-core.js - shared storage/sync logic) ---
    function getCart() {
      return CartCore.getCart();
    }

    function saveCart(cart) {
      CartCore.saveCart(cart);
      updateCartUI();
    }

    function updateCartQty(productName, delta, priceStr = '', imgUrl = '') {
      CartCore.updateQty(productName, delta, { name: productName, price: priceStr, img: imgUrl });
      updateCartUI();
    }

    function removeCartItem(productName) {
      CartCore.removeItem(productName);
      updateCartUI();
    }

    function updateCartUI() {
      const cart = getCart();
      const items = Object.values(cart);
      let totalQty = 0;
      let totalPrice = 0;
      items.forEach(item => {
        totalQty += item.qty;
        totalPrice += (parseInt(item.price.replace(/[^\d]/g, '')) || 0) * item.qty;
      });

      const navCartBadge = document.getElementById('navCartBadge');
      if (navCartBadge) {
        navCartBadge.textContent = totalQty;
        navCartBadge.style.display = totalQty > 0 ? 'flex' : 'none';
      }

      const drawerItemsContainer = document.getElementById('cartDrawerItems');
      const subtotalEl = document.getElementById('cartSubtotalValue');
      if (!drawerItemsContainer) return;

      if (items.length === 0) {
        drawerItemsContainer.innerHTML = cartDrawerEmptyStateHTML();
        if (subtotalEl) subtotalEl.textContent = '₹0';
      } else {
        drawerItemsContainer.innerHTML = items.map(item => `
          <div class="cart-drawer-item">
            <img class="cart-drawer-item-img" src="${cldOpt(item.img)}" alt="${item.name}" loading="lazy">
            <div class="cart-drawer-item-info">
              <h5>${item.name}</h5>
              <p>${item.price} each</p>
            </div>
            <div class="quantity-selector" style="height: 24px; min-width: 72px;">
              <button class="qty-btn" onclick="updateCartQty('${escapeAttrJs(item.name)}', -1, '${escapeAttrJs(item.price)}', '${escapeAttrJs(item.img)}')">-</button>
              <span class="qty-count">${item.qty}</span>
              <button class="qty-btn" onclick="updateCartQty('${escapeAttrJs(item.name)}', 1, '${escapeAttrJs(item.price)}', '${escapeAttrJs(item.img)}')">+</button>
            </div>
            <button class="cart-drawer-item-remove" onclick="removeCartItem('${escapeAttrJs(item.name)}')" title="Remove item" aria-label="Remove item">
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

    function openCartDrawer() {
      document.getElementById('cartDrawer').classList.add('open');
      document.getElementById('cartDrawerOverlay').style.display = 'block';
      updateCartUI();
    }

    function closeCartDrawer() {
      document.getElementById('cartDrawer').classList.remove('open');
      document.getElementById('cartDrawerOverlay').style.display = 'none';
    }

    // --- Wishlist + drawer ---
    // getWishlist/toggleWishItem/updateWishlistUI/openWishlistDrawer used to be
    // duplicated here. They now live in js/shared/wishlist-menu.js (loaded by
    // contact-us.html below this file), which is the one copy that gates saving
    // behind sign-in and persists the wishlist to the account.

    window.addEventListener('DOMContentLoaded', () => {
      updateCartUI();
      updateWishlistUI();
    });
