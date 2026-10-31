  /* ==========================================================================
    SAI KUMAR DIGITAL LAB & STUDIO - CORPORATE GIFTS PAGE INTERACTIVITY SCRIPT
    ========================================================================== */

  (function () {
    // Applies Cloudinary's auto-format/auto-quality transformation to any Cloudinary
    // delivery URL right before it's rendered. No-op for non-Cloudinary URLs (local
    // paths, icons8.com, data:/blob: URIs), so it's safe to wrap any image-url

    // --- Category Page Data ---
    // --- Category Page Data (Strictly Unique Assets) ---
    let categoriesData = {};
    // --- Header Dropdown Catalog Dataset ---
    const headerSubNavCatalog = {
      occasions: {
        title: "Occasions",
        desc: "Thoughtful personalized gifts curated for Birthdays, Weddings, Anniversaries & Festivals.",
        catKey: "all",
        products: [
          { name: "Wedding Photo Album Box", price: "₹2,499", img: "https://img.magnific.com/premium-psd/beautiful-brides-wedding-photos-precious-moments_584879-3347.jpg?w=740" },
          { name: "Anniversary LED Acrylic Frame", price: "₹899", img: "https://img.magnific.com/free-photo/front-view-people-celebrating-tamil-new-year_23-2151210797.jpg?w=740" },
          { name: "Birthday Magic Photo Mug", price: "₹399", img: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/corporate_assets/magic_photo_mug.jpg" },
          { name: "Executive Metallic Pen Set", price: "₹499", img: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/corporate_assets/pen_gift_set.jpg" }
        ]
      },
      personalised: {
        title: "Personalised Gifts",
        desc: "Custom photo printed gifts, engraved crystals, and unique customized keepsakes.",
        catKey: "all",
        products: [
          { name: "Customized Photo Wall Clock", price: "₹899", img: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/assets/photographer_banner.png" },
          { name: "3D Laser Crystal Cube", price: "₹999", img: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/corporate_assets/crystal_cube.jpg" },
          { name: "Personalized Steel Flask", price: "₹399", img: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/corporate_assets/photo_water_bottle.jpg" },
          { name: "Custom Acrylic Keychain", price: "₹149", img: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/corporate_assets/magic_photo_mug.jpg" }
        ]
      },
      frames: {
        title: "Photo Frames",
        desc: "Premium wooden photo frames, LED acrylic night lights, and multi-photo collage frames.",
        catKey: "mementos",
        products: [
          { name: "Warm LED Acrylic Photo Frame", price: "₹899", img: "https://img.magnific.com/free-photo/front-view-people-celebrating-tamil-new-year_23-2151210797.jpg?w=740" },
          { name: "Multi-Photo Collage Frame", price: "₹1,299", img: "https://img.magnific.com/premium-psd/beautiful-brides-wedding-photos-precious-moments_584879-3347.jpg?w=740" },
          { name: "Mosaic Portrait Frame", price: "₹1,599", img: "https://img.magnific.com/premium-psd/beautiful-brides-wedding-photos-precious-moments_584879-3347.jpg?w=740" },
          { name: "Pencil Sketch Portrait Frame", price: "₹1,899", img: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=300&h=300&fit=crop&q=80" }
        ]
      },
      mugs: {
        title: "Magic Mugs & Drinkware",
        desc: "Heat-sensitive color changing ceramic magic mugs, heart handle mugs, and printed bottles.",
        catKey: "promotional",
        products: [
          { name: "Standard Color Changing Magic Mug", price: "₹399", img: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/corporate_assets/magic_photo_mug.jpg" },
          { name: "Heart Handle Magic Mug", price: "₹499", img: "https://img.magnific.com/premium-photo/heart-coffee-cup-gray-background_762785-30576.jpg?w=740" },
          { name: "Personalized Steel Water Bottle", price: "₹399", img: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/corporate_assets/photo_water_bottle.jpg" },
          { name: "Custom Ceramic Coffee Mug", price: "₹299", img: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/corporate_assets/magic_photo_mug.jpg" }
        ]
      },
      crystals: {
        title: "Crystal Gifts",
        desc: "3D laser engraved crystal photo cubes and rotating LED crystal light stands.",
        catKey: "mementos",
        products: [
          { name: "3D Laser Engraved Crystal Cube", price: "₹999", img: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/corporate_assets/crystal_cube.jpg" },
          { name: "Luminous Glass Photo Stand", price: "₹1,299", img: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/corporate_assets/crystal_cube.jpg" },
          { name: "Rotating LED Crystal Base Set", price: "₹1,799", img: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/corporate_assets/crystal_cube.jpg" },
          { name: "Heart Glass Crystal Block", price: "₹1,199", img: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/corporate_assets/crystal_cube.jpg" }
        ]
      },
      albums: {
        title: "Albums & Printing",
        desc: "High-definition layflat photo albums, photobooks, and professional digital studio prints.",
        catKey: "all",
        products: [
          { name: "HD Photobook Hardcover Album", price: "₹2,999", img: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/assets/photographer_banner.png" },
          { name: "Passport Photo Print Pack", price: "₹99", img: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/corporate_assets/studio_camera_setup.jpg" },
          { name: "Instant Digital Print 4x6 Set", price: "₹149", img: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/corporate_assets/studio_camera_setup.jpg" },
          { name: "Custom Canvas Wall Print", price: "₹1,499", img: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/assets/photographer_banner.png" }
        ]
      },
      bestsellers: {
        title: "Best Sellers",
        desc: "Top trending customized gifts loved by 10,000+ customers.",
        catKey: "all",
        products: [
          { name: "Standard Color Changing Magic Mug", price: "₹399", img: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/corporate_assets/magic_photo_mug.jpg" },
          { name: "Warm LED Acrylic Photo Frame", price: "₹899", img: "https://img.magnific.com/free-photo/front-view-people-celebrating-tamil-new-year_23-2151210797.jpg?w=740" },
          { name: "Personalized Steel Water Bottle", price: "₹399", img: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/corporate_assets/photo_water_bottle.jpg" },
          { name: "3D Laser Engraved Crystal Cube", price: "₹999", img: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/corporate_assets/crystal_cube.jpg" }
        ]
      }
    };

    // --- State management ---
    let currentCategory = "all";

    // --- Render Header Components ---
    function renderHeaderComponents() {
      return;
    }

    window.toggleMobileDrawer = function (open) {
      const drawer = document.getElementById('mobileNavDrawer');
      const overlay = document.getElementById('mobileNavDrawerOverlay');
      if (open) {
        if (drawer) drawer.classList.add('active');
        if (overlay) overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
      } else {
        if (drawer) drawer.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
        document.body.style.overflow = '';
      }
    };

    function getScrollOffset() {
      if (window.innerWidth <= 767) {
        const header = document.querySelector('.mobile-sticky-header');
        if (header) {
          let h = header.getBoundingClientRect().height;
          const appSwitcher = document.querySelector('.mobile-app-switcher');
          // If app switcher is not collapsed yet, it will collapse on scroll.
          // Subtract its height so we don't undershoot.
          if (appSwitcher && !appSwitcher.classList.contains('nav-collapsed')) {
            h -= appSwitcher.getBoundingClientRect().height;
          }
          return -(h + 16); // 16px extra breathing room
        }
      } else {
        const desktopNav = document.querySelector('.desktop-nav');
        const h = desktopNav ? desktopNav.offsetHeight : 130;
        return -(h + 32); // Generous desktop breathing room
      }
      return -100; // Fallback
    }

    window.scrollToB2B = function () {
      const el = document.getElementById('b2bBanner') || document.querySelector('.b2b-banner');
      if (el) {
        const yOffset = getScrollOffset();
        const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      }
    };

    window.scrollToGallery = function () {
      const el = document.getElementById('galleryGrid') || document.querySelector('.gallery-grid');
      if (el) {
        const yOffset = getScrollOffset();
        const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      }
    };

    window.handleGlobalHeaderSearch = function (e) {
      const query = e.target.value.trim().toLowerCase();
      const packagesGridEl = document.getElementById('packagesGrid');
      if (!packagesGridEl) return;

      if (!query) {
        renderContent();
        return;
      }

      let allProds = [];
      Object.keys(categoriesData).forEach(k => {
        allProds = allProds.concat(categoriesData[k].products);
      });

      const isMatch = p => p.name.toLowerCase().includes(query) || (p.subtitle && p.subtitle.toLowerCase().includes(query)) || (p.search_keywords && p.search_keywords.join(' ').toLowerCase().includes(query));
      const matches = allProds.filter(isMatch);

      if (matches.length === 0) {
        packagesGridEl.innerHTML = `
          <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #64748b;">
            <h3>No products matching "${query}"</h3>
            <p style="margin-top: 8px;">Try searching for "kit", "bottle", "pen", "memento", or "mug"</p>
          </div>
        `;
      } else {
        // Matches float to the top instead of hiding the rest of the catalog - a
        // query only a couple of products are tagged with (e.g. an occasion word
        // like "rakhi") used to leave the whole grid looking empty.
        const others = allProds.filter(p => !isMatch(p));
        const ordered = matches.concat(others);
        packagesGridEl.innerHTML = ordered.map((p, i) => {
          const isSearchMatch = i < matches.length;
          const cleanName = p.name.replace(/'/g, "\\'");
          return `
            <div class="pkg-card fnp-product-card${isSearchMatch ? ' search-match' : ''}" onclick="orderNowDirect('${cleanName}', '${p.price}', '${p.img}', '${p.id || ''}')">
              <div class="p-thumb">
                <img src="${cldOpt(p.img)}" alt="${p.name}" loading="lazy" onerror="this.onerror=null;this.src=(window.SkLoading&&window.SkLoading.PLACEHOLDER_IMG)||'';">
                ${isSearchMatch ? `<span class="p-discount-badge">Best Match</span>` : (p.oldPrice ? `<span class="p-discount-badge">${Math.round((1 - parsePrice(p.price) / parsePrice(p.oldPrice)) * 100)}% off</span>` : '')}
                <button type="button" class="p-wishlist-btn" aria-label="Save" onclick="event.stopPropagation(); this.classList.toggle('active')">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"></path>
                  </svg>
                </button>
                <div class="pkg-card-hover-overlay">
                  <button class="order-now-hover-btn" onclick="event.stopPropagation(); orderNowDirect('${cleanName}', '${p.price}', '${p.img}', '${p.id || ''}')">
                    Order Now
                  </button>
                </div>
              </div>
              <div class="p-info">
                <span class="card-logo-badge">✨ Custom Logo Engraving</span>
                <h4 class="p-title">${p.name}</h4>
                <div class="p-price-row">
                  <span class="p-price">${p.price}</span>
                  ${p.oldPrice ? `<span class="p-old-price">${p.oldPrice}</span>` : ''}
                </div>
              </div>
            </div>
          `;
        }).join('');
        if (window.SkLoading) {
          packagesGridEl.querySelectorAll('.p-thumb img').forEach(img => window.SkLoading.wireImage(img, { wrap: img.closest('.p-thumb') }));
        }
      }

      if (e.key === 'Enter') {
        const yOffset = -90;
        const y = packagesGridEl.getBoundingClientRect().top + window.pageYOffset + yOffset;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      }
    };

    // --- Load Sidebar Items ---
    window.initSidebar = function () {
      // categoriesData was built (loadProductsFromBackend) by iterating
      // data.categories in the exact order GET /api/catalog/corporate returned
      // them - already sorted server-side by each category's admin-configured
      // Sort Order (Category.sort). A hardcoded slug list used to override that
      // order here, so changing a category's Sort Order in the admin panel had
      // no visible effect on the sidebar/mobile bar - Object.keys() on a
      // string-keyed object preserves insertion order, so this now just
      // follows the same order the API already gives.
      const keys = Object.keys(categoriesData);

      // Desktop Sidebar
      let sidebarHTML = `
        <div class="sidebar-item ${currentCategory === 'all' ? 'active' : ''}" onclick="switchCategory('all')" data-key="all">
          <span class="sidebar-item-icon"><img src="https://img.icons8.com/color/96/briefcase.png" alt="All Items" loading="lazy"></span>
          <span class="sidebar-item-label">All Items</span>
        </div>
      `;
      sidebarHTML += keys.map(key => {
        const cat = categoriesData[key];
        return `
          <div class="sidebar-item ${key === currentCategory ? 'active' : ''}" onclick="switchCategory('${key}')" data-key="${key}">
            <span class="sidebar-item-icon"><img src="${cldOpt(cat.icon)}" alt="${cat.title}" loading="lazy"></span>
            <span class="sidebar-item-label">${cat.title}</span>
          </div>
        `;
      }).join('');
      const desktopSidebarEl = document.getElementById('desktopSidebar');
      if (desktopSidebarEl) desktopSidebarEl.innerHTML = sidebarHTML;

      // Mobile Scrolling Bar
      let mobileHTML = `
        <div class="mobile-cat-item ${currentCategory === 'all' ? 'active' : ''}" onclick="switchCategory('all')" data-mkey="all">
          <img src="https://img.icons8.com/color/96/briefcase.png" alt="All Items" loading="lazy">
          <span>All Items</span>
        </div>
      `;
      mobileHTML += keys.map(key => {
        const cat = categoriesData[key];
        return `
          <div class="mobile-cat-item ${key === currentCategory ? 'active' : ''}" onclick="switchCategory('${key}')" data-mkey="${key}">
            <img src="${cldOpt(cat.icon)}" alt="${cat.title}" loading="lazy">
            <span>${cat.title}</span>
          </div>
        `;
      }).join('');
      const mobileCatScrollEl = document.getElementById('mobileCatScroll');
      if (mobileCatScrollEl) mobileCatScrollEl.innerHTML = mobileHTML;
    };

    // --- Scroll Category Slider Helper ---
    window.scrollCategorySlider = function (amount) {
      const track = document.getElementById('categorySliderTrack') || document.querySelector('.slider-track');
      if (track) {
        track.scrollBy({ left: amount, behavior: 'smooth' });
      }
    };

    // --- Switch Category ---
    window.switchCategory = function (key, shouldScroll = true) {
      if (key !== 'all' && !categoriesData[key]) return;
      currentCategory = key;

      // Update sidebar & slider active classes
      document.querySelectorAll('.sidebar-item').forEach(el => {
        el.classList.toggle('active', el.dataset.key === key);
      });
      document.querySelectorAll('.mobile-cat-item').forEach(el => {
        el.classList.toggle('active', el.dataset.mkey === key);
      });

      // Update URL parameters silently
      const url = new URL(window.location);
      url.searchParams.set('category', key);
      window.history.pushState({}, '', url);

      // Render content
      renderContent();

      // Smooth scroll down directly to products catalog
      if (shouldScroll) {
        setTimeout(() => {
          const targetEl = document.getElementById('catalogContainer') || document.getElementById('packagesGrid') || document.querySelector('.content-layout');
          if (targetEl) {
            const yOffset = getScrollOffset();
            const y = targetEl.getBoundingClientRect().top + window.pageYOffset + yOffset;
            window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
          }
        }, 50);
      }
    };

    // --- Mega Dropdown Selection & Toggle Helpers ---
    window.selectCategoryFromDropdown = function (key, event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      // Close any open click dropdowns
      document.querySelectorAll('.mega-dropdown').forEach(d => d.classList.remove('force-open'));
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('dropdown-open'));

      // Switch category and scroll to products
      window.switchCategory(key, true);
    };

    window.toggleCorporateDropdown = function (event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      const corpNavItem = document.getElementById('corporateGiftsNavItem') || document.querySelector('.nav-item.mega-right');
      if (corpNavItem) {
        const isCurrentlyOpen = corpNavItem.classList.contains('dropdown-open');
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('dropdown-open'));
        document.querySelectorAll('.mega-dropdown').forEach(d => d.classList.remove('force-open'));

        if (!isCurrentlyOpen) {
          corpNavItem.classList.add('dropdown-open');
          const dropdown = corpNavItem.querySelector('.mega-dropdown');
          if (dropdown) dropdown.classList.add('force-open');
        }
      }
    };

    // Close dropdown on clicking outside
    document.addEventListener('click', function (e) {
      const isInsideNav = e.target.closest('.category-menu-bar') || e.target.closest('.nav-tab-pill.tab-corp');
      if (!isInsideNav) {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('dropdown-open'));
        document.querySelectorAll('.mega-dropdown').forEach(d => d.classList.remove('force-open'));
      }
    });

    // --- Sort By Filter (matches Studio Services page's "Sort by" dropdown) ---
    let filterState = { sort: "popular" };

    function parsePrice(str) {
      return parseInt(String(str).replace(/[^\d]/g, '')) || 0;
    }

    function applyProductSort() {
      const grid = document.getElementById('packagesGrid');
      if (!grid) return;

      // Cache the grid's natural render order the first time it's sorted, so
      // switching back to "Popular" can restore it instead of losing it.
      if (!grid._naturalOrder) {
        grid._naturalOrder = Array.from(grid.children);
      }

      let cards = grid._naturalOrder.slice();
      if (filterState.sort === 'lowToHigh' || filterState.sort === 'highToLow') {
        const dir = filterState.sort === 'lowToHigh' ? 1 : -1;
        cards.sort((a, b) => {
          const priceA = parsePrice(a.querySelector('.p-price')?.textContent || '0');
          const priceB = parsePrice(b.querySelector('.p-price')?.textContent || '0');
          return (priceA - priceB) * dir;
        });
      }
      cards.forEach(card => grid.appendChild(card));
    }

    window.setSortFilter = function (value) {
      filterState.sort = value;
      applyProductSort();
    };

    // --- Render Content Panel ---
    window.renderContent = function () {
      const packagesGridEl = document.getElementById('packagesGrid');
      if (!packagesGridEl) return;
      packagesGridEl._naturalOrder = null; // grid content is about to change - drop the stale sort cache

      // The 'all' view is every category's database products, the same as a single
      // category's view. It used to restore a snapshot of 38 product cards
      // hard-coded in corporate.html instead, so the default view never showed what
      // the admin had actually added, removed or re-priced.
      let title = "";
      let desc = "";
      let products = [];

      if (currentCategory === 'all') {
        title = "All Corporate Gifts";
        desc = "Explore our complete range of customized executive gift sets, welcome kits, corporate diaries, pens, awards, and promotional materials.";
        const keys = Object.keys(categoriesData);
        keys.forEach(k => {
          products = products.concat(categoriesData[k].products);
        });
      } else {
        const cat = categoriesData[currentCategory];
        title = cat.title;
        desc = cat.desc;
        products = cat.products;
      }

      const catTitleEl = document.getElementById('catTitle');
      const catDescEl = document.getElementById('catDesc');
      if (catTitleEl) catTitleEl.textContent = title;
      if (catDescEl) catDescEl.textContent = desc;

      // De-dupe by id/name (not by image) - two distinct products that happen to
      // share a photo, or that have no photo at all yet, must never be treated
      // as "the same product" and dropped. Missing/duplicate images should fall
      // back to a placeholder thumbnail, not hide the product from the catalog.
      const seen = new Set();
      const uniqueProducts = [];
      products.forEach(p => {
        const key = p.id || p.name;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueProducts.push(p);
        }
      });

      const PLACEHOLDER_THUMB = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Crect width='300' height='300' fill='%23f1e9dd'/%3E%3Ctext x='50%25' y='50%25' font-family='sans-serif' font-size='14' fill='%23a88a5c' text-anchor='middle' dominant-baseline='middle'%3ENo photo yet%3C/text%3E%3C/svg%3E";

      const productsHTML = uniqueProducts.map((p) => {
        const cleanName = p.name.replace(/'/g, "\\'");
        const thumbSrc = p.img ? cldOpt(p.img) : PLACEHOLDER_THUMB;
        return `
        <div class="pkg-card fnp-product-card" onclick="orderNowDirect('${cleanName}', '${p.price}', '${p.img}', '${p.id || ''}')">
          <div class="p-thumb">
            <img src="${thumbSrc}" alt="${p.name}" loading="lazy" onerror="this.onerror=null; this.src='${PLACEHOLDER_THUMB}';">
            ${p.oldPrice ? `<span class="p-discount-badge">${Math.round((1 - parsePrice(p.price) / parsePrice(p.oldPrice)) * 100)}% off</span>` : ''}
            <button type="button" class="p-wishlist-btn" aria-label="Save" onclick="event.stopPropagation(); this.classList.toggle('active')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"></path>
              </svg>
            </button>
            <div class="pkg-card-hover-overlay">
              <button class="order-now-hover-btn" onclick="event.stopPropagation(); orderNowDirect('${cleanName}', '${p.price}', '${p.img}', '${p.id || ''}')">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                Upload Logo & Order
              </button>
            </div>
          </div>
          <div class="p-info">
            <div class="pkg-card-tag-row" style="margin-bottom: 4px;">
              <span class="card-logo-badge" style="font-size: 10px; font-weight: 800; color: #A67C1E; background: rgba(197, 160, 89, 0.18); border: 1px solid rgba(197, 160, 89, 0.4); padding: 2px 8px; border-radius: 6px;">✨ Custom Logo Engraving</span>
            </div>
            <h4 class="p-title">${p.name}</h4>
            <div class="p-price-row">
              <span class="p-price">${p.price}</span>
              ${p.oldPrice ? `<span class="p-old-price">${p.oldPrice}</span>` : ''}
            </div>
          </div>
        </div>
      `;
      }).join('');
      if (packagesGridEl) {
        packagesGridEl.innerHTML = productsHTML;
        if (window.SkLoading) {
          packagesGridEl.querySelectorAll('.p-thumb img').forEach(img => window.SkLoading.wireImage(img, { wrap: img.closest('.p-thumb') }));
        }
      }
    };

    // FNP-style "Choose Delivery Preference" pincode check - purely a
    // frontend estimate (no delivery/serviceability backend exists), so it
    // just confirms a valid-looking pincode and refreshes the estimate text.
    window.checkModalDeliveryPincode = function () {
      const input = document.getElementById('modalPincodeInput');
      const estimateEl = document.getElementById('modalDeliveryEstimate');
      if (!input || !estimateEl) return;
      const pincode = input.value.trim();
      if (!/^\d{6}$/.test(pincode)) {
        estimateEl.textContent = 'Please enter a valid 6-digit pincode.';
        return;
      }
      const est = new Date();
      est.setDate(est.getDate() + (activeModalProduct?.deliveryDays || 3));
      const estDate = est.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short' });
      estimateEl.textContent = `Delivered by ${estDate} to ${pincode}.`;
    };

    // Looks up a product's full backend record (for its input_fields) by id
    // across every loaded category - orderNowDirect() only receives the bare
    // name/price/img/id a product card passes it, not the full object.
    function findCorporateProductById(id) {
      if (!id) return null;
      for (const cat of Object.values(categoriesData)) {
        const found = (cat.products || []).find(p => p.id === id);
        if (found) return found;
      }
      return null;
    }

    function findCorporateProductCategory(id) {
      if (!id) return null;
      for (const [catId, cat] of Object.entries(categoriesData)) {
        if ((cat.products || []).some(p => p.id === id)) return catId;
      }
      return null;
    }

    // "You may also like" for the product-detail modal - scored by shared
    // search_keywords first (admin-entered synonyms/tags), same category as a
    // secondary tiebreak, across every loaded category (not just the one the
    // opened product belongs to).
    function renderModalRelated(product) {
      const relatedEl = document.getElementById('modalRelatedProducts');
      const sectionEl = document.getElementById('modalRelatedSection');
      if (!relatedEl) return;
      const currentCatId = findCorporateProductCategory(product && product.id);
      const currentKeywords = new Set(((product && product.search_keywords) || []).map(k => String(k).toLowerCase().trim()).filter(Boolean));
      const pool = [];
      Object.entries(categoriesData).forEach(([catId, cat]) => {
        (cat.products || []).forEach(p => pool.push(Object.assign({ _catId: catId }, p)));
      });
      const scored = pool
        .filter(p => p.id !== (product && product.id))
        .map(p => {
          const itemKeywords = (p.search_keywords || []).map(k => String(k).toLowerCase().trim());
          const shared = itemKeywords.filter(k => currentKeywords.has(k)).length;
          const sameCategory = p._catId === currentCatId ? 1 : 0;
          return { item: p, score: shared * 10 + sameCategory };
        })
        .sort((a, b) => b.score - a.score)
        .map(entry => entry.item);

      if (sectionEl) sectionEl.style.display = scored.length ? '' : 'none';
      // First 4, then a "View more" button pages through the rest of the
      // corporate catalog (js/shared/related-more.js).
      const relatedCard = p => {
        const cleanName = p.name.replace(/'/g, "\\'");
        return `
        <div class="pkg-card fnp-product-card" onclick="orderNowDirect('${cleanName}', '${p.price}', '${p.img}', '${p.id || ''}')">
          <div class="p-thumb">
            <img src="${p.img ? cldOpt(p.img) : ''}" alt="${p.name}" loading="lazy" onerror="this.onerror=null;this.src=(window.SkLoading&&window.SkLoading.PLACEHOLDER_IMG)||'';">
            ${p.oldPrice ? `<span class="p-discount-badge">${Math.round((1 - parsePrice(p.price) / parsePrice(p.oldPrice)) * 100)}% off</span>` : ''}
          </div>
          <div class="p-info">
            <h4 class="p-title">${p.name}</h4>
            <div class="p-price-row"><span class="p-price">${p.price}</span>${p.oldPrice ? `<span class="p-old-price">${p.oldPrice}</span>` : ''}</div>
          </div>
        </div>`;
      };
      const wireImages = cards => {
        if (!window.SkLoading) return;
        cards.forEach(card => card.querySelectorAll('.p-thumb img').forEach(img => window.SkLoading.wireImage(img, { wrap: img.closest('.p-thumb') })));
      };
      if (window.RelatedMore) {
        RelatedMore.render(relatedEl, scored, relatedCard, { key: product && product.id, afterAppend: wireImages });
      } else {
        relatedEl.innerHTML = scored.slice(0, 4).map(relatedCard).join('');
        wireImages(Array.from(relatedEl.children));
      }
    }

    window.orderNowDirect = function (name, price, img, productId, opts = {}) {
      const product = findCorporateProductById(productId);
      window.activeModalProduct = activeModalProduct = { name, price, img, id: productId || null, input_fields: product?.input_fields || [], bulk_discounts: product?.bulk_discounts || [], type: product?.type || null, stock: product?.stock ?? null, deliveryDays: product?.delivery_days || null };
      const customFieldsWrap = document.getElementById('modalCustomFields');
      if (customFieldsWrap && window.ProductFields) {
        ProductFields.renderProductFields(customFieldsWrap, activeModalProduct);
      }
      modalSelectedQty = 1;
      modalSelectedColor = "Black";
      currentModalImgIndex = 0;

      // Prefer the product's full photo gallery (every image an admin
      // attached via Categories > Products > Photos) over the single `img`
      // the calling card happened to be rendered with - that single value
      // was silently capping the thumbnail strip at one photo regardless of
      // how many were actually uploaded.
      // Entries of {type, url}, not bare URLs - a product's gallery can end with a
      // short video the admin attached (see js/shared/product-media.js).
      activeModalImages = ProductMedia.build(
        (product && product.images && product.images.length) ? product.images : [img],
        product && product.videos,
        // Originals for the main image + zoom viewer; the strip keeps thumbnails.
        (product && product.images && product.images.length && product.fullImages) || null,
      );
      if (!activeModalImages.length) activeModalImages = [{ type: 'image', url: img }];
      renderModalRelated(product);

      const titleEl = document.getElementById('modalProductTitle');
      const priceEl = document.getElementById('modalProductPrice');
      const mainImgEl = document.getElementById('modalMainImg');
      const qtyNumEl = document.getElementById('modalQtyNum');
      const breadcrumbNameEl = document.getElementById('modalBreadcrumbName');
      const productCodeEl = document.getElementById('modalProductCode');
      const pincodeInputEl = document.getElementById('modalPincodeInput');
      const deliveryEstimateEl = document.getElementById('modalDeliveryEstimate');
      const deliveryInfoTextEl = document.getElementById('modalDeliveryInfoText');

      if (titleEl) titleEl.textContent = name;
      // currentModalPrice(), not the base `price` passed in: a priced Customer
      // Questions dropdown has already rendered above and starts on its first
      // option, but that initial selection fires no pf:pricechange, so showing
      // `price` here would leave the modal advertising the base price while the
      // selected tile - and add-to-cart - use the option's.
      if (priceEl) priceEl.textContent = currentModalPrice();
      renderCorporateBulkOffers();
      if (breadcrumbNameEl) breadcrumbNameEl.textContent = name;

      // product.stock only means something for a real, database-backed physical
      // product - a card without a resolvable productId, or one that never set
      // a stock count, leaves the modal's static "In stock" badge as-is.
      const stockBadgeEl = document.getElementById('modalStockBadge');
      if (stockBadgeEl) {
        if (product && product.type === 'product' && product.stock !== null && product.stock !== undefined) {
          const stock = product.stock;
          const outOfStock = stock <= 0;
          stockBadgeEl.textContent = outOfStock ? 'Out of stock' : (stock <= 5 ? `Only ${stock} left` : 'In stock');
          stockBadgeEl.classList.toggle('out-of-stock', outOfStock);
          stockBadgeEl.classList.toggle('low-stock', !outOfStock && stock <= 5);
          [document.getElementById('modalAddCartBtn'), document.getElementById('modalBuyNowBtn')].forEach(btn => {
            if (!btn) return;
            btn.disabled = outOfStock;
            btn.classList.toggle('btn-disabled', outOfStock);
          });
        } else {
          stockBadgeEl.textContent = 'In stock';
          stockBadgeEl.classList.remove('out-of-stock', 'low-stock');
          [document.getElementById('modalAddCartBtn'), document.getElementById('modalBuyNowBtn')].forEach(btn => {
            if (!btn) return;
            btn.disabled = false;
            btn.classList.remove('btn-disabled');
          });
        }
      }
      // Paints the opening gallery item through the same path the thumbnails and
      // arrows use, so an image/video swap only has to be right in one place.
      // A Customer-Questions option can name one of this product's photos (see
      // option_images in js/shared/product-fields.js), and a priced dropdown opens
      // with its first option already selected - so the modal should open on that
      // option's photo. With no mapping this is 0, the cover, exactly as before.
      if (mainImgEl) setModalMainImg(modalMappedImageIndex() ?? 0);
      if (qtyNumEl) qtyNumEl.textContent = '1';
      if (productCodeEl) productCodeEl.textContent = productId ? `EXCORP${productId}` : '';
      if (pincodeInputEl) pincodeInputEl.value = '';
      if (deliveryEstimateEl) {
        deliveryEstimateEl.textContent = activeModalProduct.deliveryDays
          ? `Delivered in ${activeModalProduct.deliveryDays} business day${activeModalProduct.deliveryDays === 1 ? '' : 's'} across India.`
          : 'Delivered in 2-3 business days across India.';
      }
      if (deliveryInfoTextEl) {
        deliveryInfoTextEl.textContent = activeModalProduct.deliveryDays
          ? `Delivered in ${activeModalProduct.deliveryDays} business day${activeModalProduct.deliveryDays === 1 ? '' : 's'} across India. 30-day hassle-free replacement and quality warranty.`
          : 'Delivered in 2-3 business days across India. 30-day hassle-free replacement and quality warranty.';
      }

      // Description/highlights shown here used to be static boilerplate baked
      // into the HTML (same text for every product, regardless of what the
      // admin typed) - now pulled from the actual product record so what the
      // admin enters in Categories > Products is what customers see here.
      const descTextEl = document.getElementById('modalDescriptionText');
      const highlightsListEl = document.getElementById('modalHighlightsList');
      if (descTextEl) {
        descTextEl.textContent = (product && product.subtitle) || 'No description added for this product yet.';
      }
      if (highlightsListEl) {
        const features = (product && product.features) || [];
        highlightsListEl.innerHTML = '';
        features.forEach(f => {
          const li = document.createElement('li');
          li.textContent = f;
          highlightsListEl.appendChild(li);
        });
        highlightsListEl.style.display = features.length ? '' : 'none';
      }

      const thumbsContainer = document.getElementById('modalThumbsContainer');
      if (thumbsContainer) {
        thumbsContainer.innerHTML = activeModalImages.map((item, idx) => `
          <button class="thumb-btn ${idx === 0 ? 'active' : ''}${item.type === 'video' ? ' thumb-btn-video' : ''}" onclick="setModalMainImg(${idx})" aria-label="${item.type === 'video' ? 'Play product video' : `Show photo ${idx + 1}`}">
            ${item.type === 'video'
              // muted + preload="metadata": the strip shows a first frame without
              // pulling down every clip in full just to draw a thumbnail.
              ? `<video src="${cldOpt(item.url)}" muted playsinline preload="metadata"></video><span class="thumb-play-badge"></span>`
              : `<img src="${cldOpt(item.url)}" alt="Thumb ${idx + 1}" loading="${idx === 0 ? 'eager' : 'lazy'}" onerror="this.onerror=null;this.src=(window.SkLoading&&window.SkLoading.PLACEHOLDER_IMG)||'';">`}
          </button>
        `).join('');
        if (window.SkLoading) {
          thumbsContainer.querySelectorAll('img').forEach(t => window.SkLoading.wireImage(t));
        }
      }

      switchModalTab('description');

      const overlay = document.getElementById('productDetailOverlay');
      if (overlay) {
        overlay.style.display = 'flex';
        setTimeout(() => {
          overlay.classList.add('active');
        }, 10);
      }
      // Reflect the open product in the URL (?openProduct=..&openPrice=..&openImg=..&pid=..)
      // so the address bar is specific to this product, refresh/share/back-button behave
      // sanely, and the existing openProduct deep-link reader (see below) can re-open it.
      // pid is the real database id - included whenever the caller has one - so the link
      // stays unique even if two products share a display name.
      if (!opts.skipHistory) {
        const url = new URL(window.location);
        url.searchParams.set('openProduct', name);
        url.searchParams.set('openPrice', price);
        url.searchParams.set('openImg', img);
        if (productId) url.searchParams.set('pid', productId);
        else url.searchParams.delete('pid');
        window.history.pushState({ corporateProductPreview: true }, '', url);
      }
    };

    window.closeProductDetailModal = function (e) {
      if (e && e.target && e.target.id !== 'productDetailOverlay' && !e.target.classList.contains('close-modal-btn')) {
        return;
      }
      // A clip left playing would keep its audio running behind the closed modal.
      ProductMedia.pauseAll(document.querySelector('.modal-gallery-main'));
      const overlay = document.getElementById('productDetailOverlay');
      if (overlay) {
        overlay.classList.remove('active');
        setTimeout(() => overlay.style.display = 'none', 300);
      }
      const params = new URLSearchParams(window.location.search);
      if (params.has('openProduct')) {
        const url = new URL(window.location);
        url.searchParams.delete('openProduct');
        url.searchParams.delete('openPrice');
        url.searchParams.delete('openImg');
        url.searchParams.delete('pid');
        window.history.replaceState({}, '', url);
      }
    };

    // Closing the modal via the browser Back button skips closeProductDetailModal() (the
    // URL has already changed by the time this fires) - just tear down the modal UI.
    window.addEventListener('popstate', () => {
      if (activeModalProduct && !new URLSearchParams(window.location.search).has('openProduct')) {
        ProductMedia.pauseAll(document.querySelector('.modal-gallery-main'));
        const overlay = document.getElementById('productDetailOverlay');
        if (overlay) {
          overlay.classList.remove('active');
          setTimeout(() => overlay.style.display = 'none', 300);
        }
        window.activeModalProduct = activeModalProduct = null;
      }
    });

    window.setModalMainImg = function (index) {
      currentModalImgIndex = index;
      const item = activeModalImages[index];
      const mainImgEl = document.getElementById('modalMainImg');
      const mainVideoEl = document.getElementById('modalMainVideo');
      if (item && mainImgEl) {
        const isVideo = item.type === 'video';
        // The two elements are siblings that take turns, rather than one element
        // whose tag changes - the gallery's arrow/wishlist/share buttons are
        // positioned against their shared parent and must not move when swapping.
        mainImgEl.style.display = isVideo ? 'none' : '';
        if (mainVideoEl) {
          mainVideoEl.style.display = isVideo ? '' : 'none';
          if (isVideo) {
            // Only reload when the source actually changes - reassigning the same
            // src restarts a clip the visitor may be part-way through.
            const src = cldOpt(item.url);
            if (mainVideoEl.getAttribute('src') !== src) mainVideoEl.setAttribute('src', src);
          } else if (!mainVideoEl.paused) {
            mainVideoEl.pause();
          }
        }
        if (!isVideo) {
          // Same reused <img> across every product opened from this modal -
          // wireImage() only hooks up once per element (data-sk-img-wired), so that
          // has to be cleared each time or products after the first never fade in.
          delete mainImgEl.dataset.skImgWired;
          mainImgEl.classList.remove('sk-img-loaded');
          mainImgEl.src = fullImg(item.full || item.url);
          mainImgEl.onerror = function () { this.onerror = null; this.src = (window.SkLoading && window.SkLoading.PLACEHOLDER_IMG) || ''; };
          if (window.SkLoading) window.SkLoading.wireImage(mainImgEl, { wrap: mainImgEl.closest('.modal-gallery-main') });
        }
      }
      document.querySelectorAll('.thumb-btn').forEach((btn, idx) => {
        btn.classList.toggle('active', idx === index);
      });
    };

    // Click the main photo to open it full screen with zoom
    // (ProductFields.openImageViewer) - same viewer as the gifts and studio pages.
    window.openModalImageViewer = function () {
      if (!window.ProductFields || !ProductFields.openImageViewer) return;
      const current = activeModalImages[currentModalImgIndex];
      if (!current || current.type === 'video') return;
      const photos = activeModalImages.filter(item => item.type !== 'video');
      ProductFields.openImageViewer({
        label: `${(activeModalProduct && activeModalProduct.name) || 'Product'} photos`,
        index: Math.max(0, photos.indexOf(current)),
        items: photos.map(item => ({ url: fullImg(item.full || item.url), thumb: cldOpt(item.url) })),
      });
    };
    document.getElementById('modalMainImg')?.addEventListener('click', () => window.openModalImageViewer());

    window.navigateModalGallery = function (direction) {
      if (!activeModalImages.length) return;
      currentModalImgIndex = (currentModalImgIndex + direction + activeModalImages.length) % activeModalImages.length;
      setModalMainImg(currentModalImgIndex);
    };

    window.shareModalProduct = function () {
      if (!activeModalProduct) return;
      if (navigator.share) {
        navigator.share({ title: activeModalProduct.name, text: activeModalProduct.price }).catch(() => {});
      } else {
        alert(`${activeModalProduct.name} — ${activeModalProduct.price}`);
      }
    };

    window.switchModalTab = function (tabName) {
      document.querySelectorAll('.modal-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick').includes(tabName));
      });
      document.querySelectorAll('.modal-tab-pane').forEach(pane => {
        pane.classList.remove('active');
      });
      const activePane = document.getElementById('tab' + tabName.charAt(0).toUpperCase() + tabName.slice(1));
      if (activePane) activePane.classList.add('active');
    };

    window.selectModalColor = function (btnEl, colorName) {
      modalSelectedColor = colorName;
      document.querySelectorAll('.color-swatch-btn').forEach(b => b.classList.remove('active'));
      if (btnEl) btnEl.classList.add('active');
    };

    window.adjustModalQty = function (delta) {
      // Was unbounded: a shopper could pick 500 of something with 3 in stock
      // and only find out at checkout.
      const want = modalSelectedQty + delta;
      modalSelectedQty = window.StockUI
        ? StockUI.clampQty(want, activeModalProduct, 99)
        : Math.max(1, Math.min(99, want));
      const qtyNumEl = document.getElementById('modalQtyNum');
      if (qtyNumEl) qtyNumEl.textContent = modalSelectedQty;
      const capEl = document.getElementById('modalQtyCapNote');
      if (capEl && window.StockUI) {
        const msg = StockUI.capMessage(activeModalProduct, modalSelectedQty);
        capEl.textContent = msg || '';
        capEl.style.display = msg ? 'block' : 'none';
      }
      renderCorporateBulkOffers();
    };

    /* The "buy more, save more" panel in the product modal, quoted against the
       quantity picker and whichever priced Customer Questions option is
       selected - re-run from both, and on open. */
    function renderCorporateBulkOffers() {
      const box = document.getElementById('modalBulkOffers');
      if (!box || !window.BulkTiers || !activeModalProduct) return;
      const wrap = document.getElementById('modalCustomFields');
      const selected = wrap && window.ProductFields
        ? ProductFields.getSelectedPrice(wrap, activeModalProduct) : null;
      const unitPrice = (selected || selected === 0)
        ? selected
        : parseInt(String(activeModalProduct.price || '0').replace(/[^\d]/g, ''), 10) || 0;
      BulkTiers.renderOfferBox(box, activeModalProduct.bulk_discounts, {
        qty: modalSelectedQty,
        unitPrice,
      });
    }

    // Best-effort synchronous snapshot of the first Customer Questions text-type
    // answer for this product, for the few fallback spots (order summary when
    // nothing's actually in the cart yet) that build a cart-shaped item straight
    // from window.activeModalProduct instead of the cart. Uploads need the async
    // collectModalCustomFields() FileReader pass those callers don't do, so this
    // only covers text - fine for a summary label.
    function activeModalTextSnapshot() {
      const wrap = document.getElementById('modalCustomFields');
      const product = window.activeModalProduct;
      if (!wrap || !product) return '';
      const field = (product.input_fields || []).find(f => f.type === 'text');
      if (!field) return '';
      const el = document.getElementById(`${wrap.id}_${field.id}`);
      return el ? el.value.trim() : '';
    }
    window.activeModalTextSnapshot = activeModalTextSnapshot;

    // Validates admin-configured custom fields (if any) and reads any uploads
    // in them into data: URIs, returning { fields, fieldLabels } (fieldLabels
    // lets order-detail views show a real label instead of the raw field id)
    // - or null if validation fails (errors are already shown inline by
    // ProductFields.validateProductFields).
    async function collectModalCustomFields() {
      const wrap = document.getElementById('modalCustomFields');
      if (!wrap || !window.ProductFields || !activeModalProduct) return {};
      const errors = ProductFields.validateProductFields(wrap, activeModalProduct);
      if (errors.length) {
        alert(errors.join('\n'));
        return null;
      }
      const fields = await ProductFields.collectProductFields(wrap, activeModalProduct);
      if (!Object.keys(fields).length) return {};
      const fieldLabels = Object.fromEntries((activeModalProduct.input_fields || []).map(f => [f.id, f.label]));
      return { fields, fieldLabels };
    }

    // A priced Customer Questions dropdown (admin-configured option_prices) should
    // override the base price shown/charged, same as studio.js's preview and
    // gifts.js's product page - falls back to the base price (already a
    // formatted "₹NNN" string here) once nothing/an unpriced option is selected.
    function currentModalPrice() {
      const wrap = document.getElementById('modalCustomFields');
      const price = wrap && window.ProductFields && activeModalProduct ? ProductFields.getSelectedPrice(wrap, activeModalProduct) : null;
      return (price || price === 0) ? ProductFields.formatPrice(price) : activeModalProduct?.price;
    }
    document.getElementById('modalCustomFields')?.addEventListener('pf:pricechange', () => {
      const priceEl = document.getElementById('modalProductPrice');
      if (!priceEl || !activeModalProduct) return;
      priceEl.textContent = currentModalPrice();
      renderCorporateBulkOffers();
    });

    /* The gallery index the current Customer-Questions selection points at, or
       null when nothing maps or the mapping outlived the photo it named. Videos
       sit after the photos in activeModalImages (see js/shared/product-media.js),
       so this also refuses an index that has landed on one. */
    function modalMappedImageIndex() {
      const wrap = document.getElementById('modalCustomFields');
      if (!wrap || !window.ProductFields || !activeModalProduct) return null;
      return clampModalImageIndex(ProductFields.getSelectedImageIndex(wrap, activeModalProduct));
    }

    function clampModalImageIndex(index) {
      if (index === null || index === undefined) return null;
      const item = activeModalImages[index];
      return item && item.type !== 'video' ? index : null;
    }

    // An option that names one of this product's photos swaps the main image to
    // it. Only fires for options an admin actually mapped, so an unmapped
    // dropdown leaves the gallery alone.
    document.getElementById('modalCustomFields')?.addEventListener('pf:imagechange', (e) => {
      const index = clampModalImageIndex(e.detail && e.detail.index);
      if (index !== null) setModalMainImg(index);
    });

    // Both are async (collectModalCustomFields() reads/resizes any uploaded
    // photo) and bound via a plain onclick="..." in corporate.html, not
    // addEventListener - a module-level in-flight flag guards against a
    // second tap on a slow connection firing this again before the first call
    // finishes, which would otherwise double up modalSelectedQty via a second
    // updateCartQty() call.
    // Deep link back to this product's own modal, so the cart can make each row
    // clickable. Matches the ?openProduct=/&pid= reader further down this file
    // (which also wants openPrice/openImg as instant display values while it
    // looks the rest up by pid).
    function corporateProductUrl(product) {
      if (!product) return '';
      return 'corporate.html?openProduct=' + encodeURIComponent(product.name)
        + '&openPrice=' + encodeURIComponent(product.price || '')
        + '&openImg=' + encodeURIComponent(product.img || '')
        + (product.id ? '&pid=' + encodeURIComponent(product.id) : '');
    }

    let modalCartActionInFlight = false;

    window.addModalItemToCart = async function () {
      if (modalCartActionInFlight || !activeModalProduct) return;
      modalCartActionInFlight = true;
      try {
        const custom = await collectModalCustomFields();
        if (custom === null) return;
        updateCartQty(
          activeModalProduct.name,
          modalSelectedQty,
          currentModalPrice(),
          activeModalProduct.img,
          { color: modalSelectedColor, ...custom },
          null,
          activeModalProduct.id,
          corporateProductUrl(activeModalProduct)
        );
        // Deliberately does NOT close the modal (unlike modalBuyNow below, where
        // leaving to check out is the point) - a customer adding one item still
        // wants to keep reviewing/customizing this same product, or add a second
        // one at a different quantity, without the view getting yanked out from
        // under them. showCartToast() (js/shared/cart-ui.js) is the confirmation
        // that the add actually happened, with a way to jump to the cart if
        // that's what they actually wanted.
        showCartToast();
      } finally {
        modalCartActionInFlight = false;
      }
    };

    window.modalBuyNow = async function () {
      if (modalCartActionInFlight || !activeModalProduct) return;
      modalCartActionInFlight = true;
      try {
        const custom = await collectModalCustomFields();
        if (custom === null) return;
        updateCartQty(
          activeModalProduct.name,
          modalSelectedQty,
          currentModalPrice(),
          activeModalProduct.img,
          { color: modalSelectedColor, ...custom },
          null,
          activeModalProduct.id,
          corporateProductUrl(activeModalProduct)
        );
        closeProductDetailModal();
        window.location.href = 'cart.html';
      } finally {
        modalCartActionInFlight = false;
      }
    };

    // --- Cart System (js/shared/cart-core.js - shared storage/sync logic) ---
    window.getCart = function () {
      return CartCore.getCart();
    };

    window.saveCart = function (cart) {
      CartCore.saveCart(cart);
      updateCartUI();
    };

    window.getCartQty = function (productName) {
      const cart = getCart();
      return cart[productName] ? cart[productName].qty : 0;
    };

    // A cart line is one *configuration* of a product: the same gift in red and
    // in blue, or with two different engravings, are separate things to buy at
    // (often) separate prices. Keying by product name alone merged them into a
    // single row that kept whichever price/customization went in first and just
    // multiplied the quantity. CartCore.lineKey keys by the configuration
    // instead, so identical adds still stack and different ones don't.
    window.updateCartQty = function (productName, delta, priceStr = '', imgUrl = '', customization = null, requirement = null, productId = null, url = '') {
      CartCore.updateQty(CartCore.lineKey(productName, customization), delta, {
        name: productName, price: priceStr, img: imgUrl, url,
        product_id: productId, customization, requirement,
      });
      updateCartUI();
      renderContent();
    };

    // The cart drawer's +/- steppers act on a row that already exists, so they
    // pass its real object key instead of re-deriving one from the name.
    window.updateCartQtyByKey = function (key, delta) {
      CartCore.updateQty(key, delta, {}, { createIfMissing: false });
      updateCartUI();
      renderContent();
    };

    window.updateCartUI = function () {
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

      // Update Header Cart Badges
      const navBadge = document.getElementById('navCartBadge');
      if (navBadge) {
        navBadge.textContent = totalQty;
        navBadge.style.display = totalQty > 0 ? 'inline-flex' : 'none';
      }
      const cartPriceEl = document.querySelector('.nav-cart-price');
      if (cartPriceEl) {
        cartPriceEl.textContent = `${totalQty} ${totalQty === 1 ? 'item' : 'items'}`;
      }
      const globalCartBadge = document.getElementById('globalHeaderCartBadge');
      if (globalCartBadge) {
        globalCartBadge.textContent = totalQty;
      }

      // Update Mobile Floating Cart Bar (ONLY ON MOBILE SCREENS <= 768px)
      const mobileBar = document.getElementById('mobileCartBar');
      if (mobileBar) {
        if (totalQty > 0 && window.innerWidth <= 768) {
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
          drawerItemsContainer.innerHTML = Object.entries(cart).map(([itemKey, item]) => {
            const cust = item.customization;
            let custBadgeHTML = '';
            if (cust && (cust.engravingText || cust.logoName)) {
              const textStr = cust.engravingText ? `Text: "${cust.engravingText}"` : '';
              const logoStr = cust.logoName ? `Logo: ${cust.logoName}` : '';
              const detailsStr = [textStr, logoStr].filter(Boolean).join(' • ');
              custBadgeHTML = `<div class="cart-customization-badge">✨ Custom ${cust.technique || 'Engraved'}: ${detailsStr}</div>`;
            }
            // The row's own object key, not its name: two configurations of one
            // product share a name but are separate rows, so keying the steppers
            // by name would drive the wrong one.
            const cleanItemKey = String(itemKey).replace(/'/g, "\\'");
            return `
              <div class="cart-drawer-item">
                <img class="cart-drawer-item-img" src="${cldOpt(item.img)}" alt="${item.name}" loading="lazy" onerror="this.onerror=null;this.src=(window.SkLoading&&window.SkLoading.PLACEHOLDER_IMG)||'';">
                <div class="cart-drawer-item-info">
                  <h5>${item.name}</h5>
                  <p>${item.price} each</p>
                  ${custBadgeHTML}
                </div>
                <div class="quantity-selector" style="height: 24px; min-width: 72px;">
                  <button class="qty-btn" onclick="updateCartQtyByKey('${cleanItemKey}', -1)">-</button>
                  <span class="qty-count">${item.qty}</span>
                  <button class="qty-btn" onclick="updateCartQtyByKey('${cleanItemKey}', 1)">+</button>
                </div>
              </div>
            `;
          }).join('');
          if (subtotalEl) subtotalEl.textContent = `₹${totalPrice}`;
        }
      }
    };

    window.openCartDrawer = function () {
      const drawer = document.getElementById('cartDrawer');
      const overlay = document.getElementById('cartDrawerOverlay');
      if (drawer) drawer.classList.add('open');
      if (overlay) overlay.style.display = 'block';
      updateCartUI();
    };

    window.closeCartDrawer = function () {
      const drawer = document.getElementById('cartDrawer');
      const overlay = document.getElementById('cartDrawerOverlay');
      if (drawer) drawer.classList.remove('open');
      if (overlay) overlay.style.display = 'none';
    };

    // --- 2-Up Sliding Hero Carousel (2 slides visible at once, matches Studio Services page) ---
    const HERO_SLIDES_VISIBLE = 2;
    let currentHeroSlide = 0; // logical index over the 10 real slides (the 2 clone slides are excluded)
    let heroMaxSlideIndex = 0;
    let heroSlideInterval = null;
    let isHeroTransitioning = false;

    function getHeroStepPx() {
      const track = document.getElementById('heroRailTrack');
      const first = track ? track.querySelector('.slide') : null;
      if (!track || !first) return 0;
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return first.getBoundingClientRect().width + gap;
    }

    function updateHeroActiveState() {
      const slides = document.querySelectorAll('#heroRailTrack .slide');
      slides.forEach((slide, extIndex) => {
        const realIndex = extIndex - 1; // shift past the prepended clone slot
        slide.classList.toggle('active', realIndex === currentHeroSlide || realIndex === currentHeroSlide + 1);
      });

      const dotSpan = heroMaxSlideIndex + 1;
      const dotIndex = ((currentHeroSlide % dotSpan) + dotSpan) % dotSpan;
      document.querySelectorAll('.hero-ctrl .dots button').forEach((dot, i) => {
        const on = i === dotIndex;
        dot.classList.toggle('on', on);
        dot.classList.toggle('active', on);
      });
    }

    window.showHeroSlide = function (index, immediate = false) {
      const track = document.getElementById('heroRailTrack');
      const slides = document.querySelectorAll('#heroRailTrack .slide');
      if (!track || !slides.length) return;

      const realCount = slides.length - 2; // exclude the prepend/append clone slides
      heroMaxSlideIndex = Math.max(0, realCount - HERO_SLIDES_VISIBLE);
      currentHeroSlide = index;

      const extIndex = currentHeroSlide + 1; // +1 to land past the prepended clone slot
      const step = getHeroStepPx();

      if (immediate) {
        track.classList.remove('is-sliding');
        track.style.transition = 'none';
        track.style.transform = `translateX(-${extIndex * step}px)`;
        void track.offsetWidth; // Force layout
        track.style.transition = '';
        updateHeroActiveState();
        return;
      }

      if (isHeroTransitioning) return;
      isHeroTransitioning = true;

      // Enable CSS transition for smooth carousel movement
      track.classList.add('is-sliding');
      track.style.transform = `translateX(-${extIndex * step}px)`;
      updateHeroActiveState();

      const handleTransitionEnd = (e) => {
        if (e && e.target !== track) return;
        track.removeEventListener('transitionend', handleTransitionEnd);
        track.classList.remove('is-sliding');

        if (currentHeroSlide > heroMaxSlideIndex) {
          // Reached the appended clone pair - content is identical to index 0,
          // so resetting here (transition disabled) is invisible.
          track.style.transition = 'none';
          currentHeroSlide = 0;
          track.style.transform = `translateX(-${(currentHeroSlide + 1) * getHeroStepPx()}px)`;
          void track.offsetWidth; // Force layout sync
          track.style.transition = '';
        } else if (currentHeroSlide < 0) {
          // Reached the prepended clone pair - content is identical to the last
          // valid index, so resetting here is invisible.
          track.style.transition = 'none';
          currentHeroSlide = heroMaxSlideIndex;
          track.style.transform = `translateX(-${(currentHeroSlide + 1) * getHeroStepPx()}px)`;
          void track.offsetWidth;
          track.style.transition = '';
        }
        isHeroTransitioning = false;
      };

      track.addEventListener('transitionend', handleTransitionEnd);

      // Fallback safety timeout in case browser skips transitionend
      setTimeout(() => {
        if (isHeroTransitioning) {
          handleTransitionEnd({ target: track });
        }
      }, 900);
    };

    window.moveHeroSlide = function (step) {
      if (isHeroTransitioning) return;
      showHeroSlide(currentHeroSlide + step);
      resetHeroAutoplay();
    };

    window.setHeroSlide = function (dotIndex) {
      if (isHeroTransitioning) return;
      showHeroSlide(dotIndex);
      resetHeroAutoplay();
    };

    function resetHeroAutoplay() {
      if (heroSlideInterval) clearInterval(heroSlideInterval);
      heroSlideInterval = setInterval(() => {
        moveHeroSlide(1);
      }, 3800);
    }

    function pauseHeroAutoplay() {
      if (heroSlideInterval) clearInterval(heroSlideInterval);
    }

    function initSliderEvents() {
      const section = document.getElementById('heroZone') || document.getElementById('heroSliderSection');
      if (!section) return;

      section.addEventListener('mouseenter', pauseHeroAutoplay);
      section.addEventListener('mouseleave', resetHeroAutoplay);

      // Touch Swipe Support for Mobile & Tablet
      let touchStartX = 0;
      let touchEndX = 0;

      section.addEventListener('touchstart', (e) => {
        pauseHeroAutoplay();
        touchStartX = e.changedTouches[0].screenX;
      }, { passive: true });

      section.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        if (touchStartX - touchEndX > 40) {
          moveHeroSlide(1); // Swipe Left -> Next Slide
        } else if (touchEndX - touchStartX > 40) {
          moveHeroSlide(-1); // Swipe Right -> Prev Slide
        } else {
          resetHeroAutoplay();
        }
      }, { passive: true });

      // Initialize track at the first real slide pair
      showHeroSlide(0, true);
    }

    // Keep the 2-up carousel aligned when the viewport (and slide width) changes
    window.addEventListener('resize', () => showHeroSlide(currentHeroSlide, true));

    // Auto-start the continuous hero slider
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        initSliderEvents();
        resetHeroAutoplay();
      });
    } else {
      initSliderEvents();
      resetHeroAutoplay();
    }

    // --- Sticky Sidebar Initializer (CSS Sticky) ---
    function initStickySidebarScroll() {
      const sidebar = document.querySelector('.sidebar');
      const productsPanel = document.querySelector('.products-panel');
      if (sidebar) {
        sidebar.style.position = '';
        sidebar.style.top = '';
        sidebar.style.bottom = '';
        sidebar.classList.remove('is-fixed-sticky');
      }
      if (productsPanel) {
        productsPanel.style.marginLeft = '0px';
      }
    }

    const studioState = {
      mode: 'catalog', // 'catalog' or 'upload'
      productName: 'Smart Temperature LED Bottle',
      productImgSrc: 'https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/corporate_assets/water%20bottle%2005.jpg',
      logoX: 300,
      logoY: 260,
      logoScale: 1.0,
      logoRotate: 0,
      text: '',
      textX: 300,
      textY: 380,
      font: 'Outfit',
      textColor: '#d4af37',
      effect: 'engrave', // 'engrave', 'uv_print', 'gold_foil', 'embroidery'
      showOriginal: false,
      qty: 10,
      isDragging: false,
      activeDragItem: null, // 'logo' or 'text'
      dragOffsetX: 0,
      dragOffsetY: 0
    };

    let studioCanvas = null;
    let studioCtx = null;
    let bgImageObj = null;

    window.openAIStudioModal = function () {
      const modal = document.getElementById('aiStudioModal');
      if (!modal) return;
      modal.style.display = 'flex';

      setTimeout(() => {
        initStudioCanvas();
      }, 50);
    };

    window.closeAIStudioModal = function () {
      const modal = document.getElementById('aiStudioModal');
      if (modal) modal.style.display = 'none';
    };

    window.switchProductSource = function (source) {
      studioState.mode = source;
      const btnCatalog = document.getElementById('btnSourceCatalog');
      const btnUpload = document.getElementById('btnSourceUpload');
      const catalogPane = document.getElementById('catalogSelectView');
      const uploadPane = document.getElementById('uploadOwnView');

      if (source === 'catalog') {
        if (btnCatalog) btnCatalog.classList.add('active');
        if (btnUpload) btnUpload.classList.remove('active');
        if (catalogPane) catalogPane.style.display = 'block';
        if (uploadPane) uploadPane.style.display = 'none';
        if (!studioState.customProductImg) {
          window.selectPresetProduct('bottle', 'https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/corporate_assets/water%20bottle%2005.jpg', 'Smart Temperature LED Bottle');
        } else {
          renderCanvas();
        }
      } else {
        if (btnUpload) btnUpload.classList.add('active');
        if (btnCatalog) btnCatalog.classList.remove('active');
        if (uploadPane) uploadPane.style.display = 'block';
        if (catalogPane) catalogPane.style.display = 'none';
        if (studioState.customProductImg) {
          loadBgImage(studioState.customProductImg.src);
        } else {
          renderCanvas();
        }
      }
    };

    window.selectPresetProduct = function (key, imgSrc, name) {
      studioState.productName = name;
      studioState.productImgSrc = imgSrc;

      const nameInput = document.getElementById('studioProductNameInput');
      if (nameInput) nameInput.value = name;

      // Auto-Position Logo in Optimal Print Zone (1-Click Instant Branding)
      const printPositions = {
        bottle: { x: 300, y: 260 },
        diary: { x: 300, y: 260 },
        mug: { x: 300, y: 275 },
        keychain: { x: 300, y: 280 },
        trophy: { x: 300, y: 310 }
      };
      const pos = printPositions[key] || { x: 300, y: 260 };
      studioState.logoX = pos.x;
      studioState.logoY = pos.y;

      const prices = {
        bottle: 699,
        diary: 499,
        mug: 399,
        keychain: 149,
        trophy: 999
      };
      studioState.productBasePrice = prices[key] || 699;

      document.querySelectorAll('.preset-card').forEach(card => card.classList.remove('active'));
      if (event && event.currentTarget) event.currentTarget.classList.add('active');

      loadBgImage(imgSrc);
      window.recalculateStudioPrice();
    };

    // Visual AI Pixel Analyzer: Photo Frame & Pillow Detector with Product Whitelist
    function detectVisualFrameOrPillow(img, fileName) {
      try {
        const lowerName = (fileName || '').toLowerCase();

        // 1. ALLOWED PRODUCT WHITELIST (Instant Pass for Mugs, Bottles, T-Shirts, Diaries, Keychains, Bags, Trophies)
        const allowedKeywords = ['mug', 'cup', 'bottle', 'flask', 'tshirt', 'shirt', 'diary', 'pen', 'keychain', 'bag', 'trophy', 'box', 'gift'];
        for (const kw of allowedKeywords) {
          if (lowerName.includes(kw)) {
            return false; // Allowed! Do not reject.
          }
        }

        // 2. DISALLOWED PRODUCT BLACKLIST (Instant Reject for Pillows, Cushions, Frames)
        const forbiddenKeywords = ['pillow', 'cushion', 'frame', 'photoframe', 'wallframe', 'photo_frame', 'portrait', 'bedsheet', 'blanket', 'curtain', 'poster', 'collage', 'painting', 'wall_art', 'picture_frame'];
        for (const kw of forbiddenKeywords) {
          if (lowerName.includes(kw)) {
            return true; // Reject!
          }
        }

        // 3. VISUAL PIXEL FRAME DETECTION (For generic filenames like Screenshot)
        const isScreenshot = lowerName.includes('screenshot') || lowerName.includes('capture') || lowerName.includes('untitled');

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const w = 200;
        const h = Math.max(100, Math.round((img.height / img.width) * 200));
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);

        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;

        let darkBorderPixels = 0;
        let horizLines = 0;
        let vertLines = 0;

        for (let y = 10; y < h - 10; y += 4) {
          for (let x = 10; x < w - 10; x += 4) {
            const i = (y * w + x) * 4;
            const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
            if (brightness < 60) {
              darkBorderPixels++;
            }
          }
        }

        // Horizontal & Vertical straight edge scanner (signature of photo frame borders)
        for (let y = 15; y < h - 15; y += 8) {
          let run = 0;
          for (let x = 15; x < w - 15; x += 3) {
            const i = (y * w + x) * 4;
            const b = (data[i] + data[i + 1] + data[i + 2]) / 3;
            if (b < 60) run++;
            else {
              if (run >= 5) horizLines++;
              run = 0;
            }
          }
        }

        for (let x = 15; x < w - 15; x += 8) {
          let run = 0;
          for (let y = 15; y < h - 15; y += 3) {
            const i = (y * w + x) * 4;
            const b = (data[i] + data[i + 1] + data[i + 2]) / 3;
            if (b < 60) run++;
            else {
              if (run >= 5) vertLines++;
              run = 0;
            }
          }
        }

        // Only reject if it has strong photo frame characteristics AND generic screenshot name
        if (isScreenshot && darkBorderPixels > 120 && horizLines > 4 && vertLines > 4) {
          return true;
        }

        return false;
      } catch (err) {
        return false;
      }
    }

    window.handleCustomProductUpload = function (e) {
      const file = e.target.files[0];
      if (!file) return;

      const scanTag = document.getElementById('customProductScanTag');
      const errTag = document.getElementById('customProductErrorTag');
      const infoTag = document.getElementById('customProductInfo');
      const errMsg = document.getElementById('customProductErrorMsg');

      const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|jfif|avif|bmp|gif)$/i.test(file.name);
      if (!isImage) {
        if (errMsg) errMsg.textContent = '❌ Please choose an image file (JPG, PNG or WebP).';
        if (errTag) errTag.style.display = 'flex';
        e.target.value = '';
        return;
      }
      if (window.ProductFields && file.size > ProductFields.MAX_UPLOAD_BYTES) {
        if (errMsg) errMsg.textContent = `❌ That image is larger than ${ProductFields.MAX_UPLOAD_MB} MB - please choose a smaller photo.`;
        if (errTag) errTag.style.display = 'flex';
        e.target.value = '';
        return;
      }

      // Show Scanning UI State
      if (scanTag) scanTag.style.display = 'flex';
      if (errTag) errTag.style.display = 'none';
      if (infoTag) infoTag.style.display = 'none';

      const reader = new FileReader();
      reader.onerror = function () {
        if (scanTag) scanTag.style.display = 'none';
        if (errMsg) errMsg.textContent = '❌ That file could not be read - please try a different image.';
        if (errTag) errTag.style.display = 'flex';
        e.target.value = '';
      };
      reader.onload = function (evt) {
        const img = new Image();
        img.onerror = function () {
          if (scanTag) scanTag.style.display = 'none';
          if (errMsg) errMsg.textContent = '❌ That file is not a valid image - please choose a different photo.';
          if (errTag) errTag.style.display = 'flex';
          e.target.value = '';
        };
        img.onload = function () {
          if (scanTag) scanTag.style.display = 'none';

          // Perform Ultra-Strict Visual AI Inspection
          const isFrameOrPillow = detectVisualFrameOrPillow(img, file.name);

          if (isFrameOrPillow) {
            const errMsg = document.getElementById('customProductErrorMsg');
            if (errMsg) {
              errMsg.textContent = `🚫 UPLOAD REJECTED (PHOTO FRAME / PILLOW DETECTED): Photo frames, pillows, and wall decor are STRICTLY NOT ALLOWED for custom branding. Please upload a clear photo of a bottle, mug, t-shirt, diary, pen, bag, or trophy.`;
            }
            if (errTag) errTag.style.display = 'flex';
            e.target.value = ''; // Reset file input
            return;
          }

          if (img.width < 200 || img.height < 200) {
            const errMsg = document.getElementById('customProductErrorMsg');
            if (errMsg) errMsg.textContent = `❌ Low Clarity / Resolution: Image must be clear and at least 200x200 pixels.`;
            if (errTag) errTag.style.display = 'flex';
            e.target.value = '';
            return;
          }

          const aspect = img.width / img.height;
          if (aspect > 2.8 || aspect < 0.35) {
            const errMsg = document.getElementById('customProductErrorMsg');
            if (errMsg) errMsg.textContent = `❌ Unclear Product Image: The uploaded image shape is unclear. Please upload a clear, centered photo of a valid product.`;
            if (errTag) errTag.style.display = 'flex';
            e.target.value = '';
            return;
          }

          // --- ACCEPTED VALID PRODUCT ---
          studioState.customProductImg = img;
          studioState.productName = 'Custom Product (' + file.name.replace(/\.[^/.]+$/, '') + ')';

          const nameInput = document.getElementById('studioProductNameInput');
          if (nameInput) nameInput.value = studioState.productName;

          const fileNameSpan = document.getElementById('customProductFileName');
          if (infoTag) infoTag.style.display = 'flex';
          if (fileNameSpan) fileNameSpan.textContent = '✓ AI Verified Product: ' + file.name;

          loadBgImage(evt.target.result);
        };
        img.src = evt.target.result;
      };
      reader.readAsDataURL(file);
    };

    window.dismissCustomProductError = function () {
      const errTag = document.getElementById('customProductErrorTag');
      if (errTag) errTag.style.display = 'none';
    };

    window.resetCustomProduct = function () {
      studioState.customProductImg = null;
      const infoTag = document.getElementById('customProductInfo');
      const input = document.getElementById('customProductInput');
      if (infoTag) infoTag.style.display = 'none';
      if (input) input.value = '';
      window.switchProductSource('catalog');
    };

    // Automatic Logo Background Removal & AI Auto-Centering
    function removeLogoBackground(img, callback) {
      try {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        tempCtx.drawImage(img, 0, 0);

        const imgData = tempCtx.getImageData(0, 0, img.width, img.height);
        const data = imgData.data;

        // Sample corner pixels to detect solid background color
        const bgR = data[0];
        const bgG = data[1];
        const bgB = data[2];

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          const diff = Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB);
          const isNearWhite = (r > 230 && g > 230 && b > 230);

          if (diff < 45 || isNearWhite) {
            data[i + 3] = 0; // Make background transparent
          }
        }

        tempCtx.putImageData(imgData, 0, 0);
        const cleanImg = new Image();
        cleanImg.onload = function () {
          callback(cleanImg);
        };
        cleanImg.src = tempCanvas.toDataURL();
      } catch (err) {
        callback(img);
      }
    }

    function calculateProductCenter() {
      if (!studioCanvas) return { x: 300, y: 270 };
      const width = studioCanvas.width;
      const height = studioCanvas.height;

      if (bgImageObj) {
        const scale = Math.min((width - 40) / bgImageObj.width, (height - 40) / bgImageObj.height);
        const nw = bgImageObj.width * scale;
        const nh = bgImageObj.height * scale;
        const nx = (width - nw) / 2;
        const ny = (height - nh) / 2;

        return {
          x: nx + nw / 2,
          y: ny + nh / 2.05 // Exact optical center of product
        };
      }
      return { x: 300, y: 270 };
    }

    window.handleStudioLogoUpload = function (e) {
      const file = e.target.files[0];
      if (!file) return;

      const statusSpan = document.getElementById('studioLogoStatus');
      const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|jfif|avif|bmp|gif)$/i.test(file.name);
      if (!isImage) {
        if (statusSpan) statusSpan.textContent = '❌ Please choose an image file (JPG, PNG or WebP).';
        e.target.value = '';
        return;
      }
      if (window.ProductFields && file.size > ProductFields.MAX_UPLOAD_BYTES) {
        if (statusSpan) statusSpan.textContent = `❌ That image is larger than ${ProductFields.MAX_UPLOAD_MB} MB - please choose a smaller file.`;
        e.target.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onerror = function () {
        if (statusSpan) statusSpan.textContent = '❌ That file could not be read - please try a different image.';
        e.target.value = '';
      };
      reader.onload = function (evt) {
        const rawImg = new Image();
        rawImg.onerror = function () {
          if (statusSpan) statusSpan.textContent = '❌ That file is not a valid image - please choose a different logo.';
          e.target.value = '';
        };
        rawImg.onload = function () {
          // Run AI Auto-Background Removal & Auto-Centering
          removeLogoBackground(rawImg, function (cleanLogoImg) {
            studioState.logoImg = cleanLogoImg;

            // Automatically fix logo at EXACT CENTER of product
            const center = calculateProductCenter();
            studioState.logoX = center.x;
            studioState.logoY = center.y;
            studioState.logoScale = 1.0;
            studioState.logoRotate = 0;

            const statusSpan = document.getElementById('studioLogoStatus');
            const controlsDiv = document.getElementById('studioLogoControls');
            if (statusSpan) statusSpan.textContent = '✓ Logo Auto-Centered: ' + file.name;
            if (controlsDiv) controlsDiv.style.display = 'flex';

            renderCanvas();
            runAIDesignAudit();
          });
        };
        rawImg.src = evt.target.result;
      };
      reader.readAsDataURL(file);
    };

    window.updateLogoScale = function (val) {
      studioState.logoScale = parseFloat(val) / 100;
      renderCanvas();
    };

    window.updateLogoRotate = function (val) {
      studioState.logoRotate = parseFloat(val);
      renderCanvas();
    };

    window.updateStudioText = function (val) {
      studioState.text = val;
      renderCanvas();
      runAIDesignAudit();
    };

    window.updateStudioFont = function (font) {
      studioState.font = font;
      renderCanvas();
    };

    window.updateStudioTextColor = function (color) {
      studioState.textColor = color;
      const hexSpan = document.getElementById('colorHexText');
      if (hexSpan) hexSpan.textContent = color.toUpperCase();
      renderCanvas();
      runAIDesignAudit();
    };

    window.setStudioEffect = function (effect, btnEl) {
      studioState.effect = effect;
      document.querySelectorAll('.tech-card').forEach(card => card.classList.remove('active'));
      if (btnEl) btnEl.classList.add('active');

      const simText = document.getElementById('aiSimText');
      const effectNames = {
        engrave: 'Laser Engraving Finish (Laser Etched Specular Metallics)',
        uv_print: 'UV Digital Print Finish (High Gloss Full Color)',
        gold_foil: 'Gold Foil Emboss Finish (Reflective Metallic Sheen)',
        embroidery: 'Embroidery Stitching Finish (Tactile Thread Texture)'
      };
      if (simText) simText.innerHTML = `AI Mockup Engine: Simulating <strong>${effectNames[effect]}</strong> on product surface`;

      renderCanvas();
      runAIDesignAudit();
    };

    window.resetCanvasTransform = function () {
      studioState.logoX = 300;
      studioState.logoY = 240;
      studioState.logoScale = 1.0;
      studioState.logoRotate = 0;
      studioState.textX = 300;
      studioState.textY = 380;

      const scaleSlider = document.getElementById('logoScaleSlider');
      const rotateSlider = document.getElementById('logoRotateSlider');
      if (scaleSlider) scaleSlider.value = 100;
      if (rotateSlider) rotateSlider.value = 0;

      renderCanvas();
    };

    window.centerCanvasDesign = function () {
      studioState.logoX = 300;
      studioState.logoY = 240;
      studioState.textX = 300;
      studioState.textY = 380;
      renderCanvas();
    };

    window.toggleBeforeAfter = function () {
      studioState.showOriginal = !studioState.showOriginal;
      const btn = document.getElementById('btnToggleCompare');
      if (btn) {
        btn.textContent = studioState.showOriginal ? '✨ Show AI Mockup' : '👁️ View Original';
      }
      renderCanvas();
    };

    function initStudioCanvas() {
      studioCanvas = document.getElementById('studioCanvas');
      if (!studioCanvas) return;
      studioCtx = studioCanvas.getContext('2d');

      // Attach Drag Listeners
      studioCanvas.addEventListener('mousedown', handleCanvasMouseDown);
      studioCanvas.addEventListener('mousemove', handleCanvasMouseMove);
      window.addEventListener('mouseup', handleCanvasMouseUp);

      studioCanvas.addEventListener('touchstart', handleCanvasTouchStart, { passive: false });
      studioCanvas.addEventListener('touchmove', handleCanvasTouchMove, { passive: false });
      window.addEventListener('touchend', handleCanvasMouseUp);

      loadBgImage(studioState.productImgSrc);
    }

    function loadBgImage(src) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = function () {
        bgImageObj = img;
        renderCanvas();
        runAIDesignAudit();
      };
      img.src = src;
    }

    function renderCanvas() {
      if (!studioCtx || !studioCanvas) return;
      const ctx = studioCtx;
      const width = studioCanvas.width;
      const height = studioCanvas.height;

      // Clear Canvas
      ctx.clearRect(0, 0, width, height);

      // 1. Render Background Product Image
      if (bgImageObj) {
        const scale = Math.min((width - 40) / bgImageObj.width, (height - 40) / bgImageObj.height);
        const nw = bgImageObj.width * scale;
        const nh = bgImageObj.height * scale;
        const nx = (width - nw) / 2;
        const ny = (height - nh) / 2;

        ctx.save();
        ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
        ctx.shadowBlur = 30;
        ctx.shadowOffsetY = 15;
        ctx.drawImage(bgImageObj, nx, ny, nw, nh);
        ctx.restore();
      } else {
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(0, 0, width, height);
      }

      // If "Show Original" is active, skip branding layer overlays
      if (studioState.showOriginal) return;

      // 2. Render Logo Layer with 3D Photorealistic Material Blending & Curvature
      if (studioState.logoImg) {
        ctx.save();
        ctx.translate(studioState.logoX, studioState.logoY);
        ctx.rotate((studioState.logoRotate * Math.PI) / 180);

        const baseLw = 130 * studioState.logoScale;
        const lh = (studioState.logoImg.height / studioState.logoImg.width) * baseLw;
        const lw = baseLw * 0.95; // 3D Cylindrical Surface Perspective Compression

        if (studioState.effect === 'engrave') {
          // Photorealistic Laser Etched Specular Metal/Ceramic Finish
          ctx.save();
          ctx.globalAlpha = 0.88;
          ctx.shadowColor = "rgba(0, 0, 0, 0.85)";
          ctx.shadowBlur = 3;
          ctx.shadowOffsetX = 1;
          ctx.shadowOffsetY = 1.5;
          ctx.drawImage(studioState.logoImg, -lw / 2, -lh / 2, lw, lh);

          // Specular Engraved Surface Tint
          ctx.globalCompositeOperation = "source-atop";
          const etchGrad = ctx.createLinearGradient(-lw / 2, -lh / 2, lw / 2, lh / 2);
          etchGrad.addColorStop(0, "rgba(226, 232, 240, 0.95)");
          etchGrad.addColorStop(0.5, "rgba(203, 213, 225, 0.9)");
          etchGrad.addColorStop(1, "rgba(148, 163, 184, 0.85)");
          ctx.fillStyle = etchGrad;
          ctx.fillRect(-lw / 2, -lh / 2, lw, lh);
          ctx.restore();

          // Multiply texture overlay for real ceramic/metal grain
          ctx.save();
          ctx.globalCompositeOperation = "multiply";
          ctx.globalAlpha = 0.3;
          ctx.drawImage(studioState.logoImg, -lw / 2, -lh / 2, lw, lh);
          ctx.restore();

        } else if (studioState.effect === 'gold_foil') {
          // Luxurious Metallic Gold Foil Stamping
          ctx.save();
          ctx.shadowColor = "rgba(245, 158, 11, 0.7)";
          ctx.shadowBlur = 6;
          ctx.drawImage(studioState.logoImg, -lw / 2, -lh / 2, lw, lh);

          ctx.globalCompositeOperation = "source-atop";
          const goldGrad = ctx.createLinearGradient(-lw / 2, -lh / 2, lw / 2, lh / 2);
          goldGrad.addColorStop(0, "#fef08a");
          goldGrad.addColorStop(0.3, "#f59e0b");
          goldGrad.addColorStop(0.7, "#d4af37");
          goldGrad.addColorStop(1, "#b45309");
          ctx.fillStyle = goldGrad;
          ctx.fillRect(-lw / 2, -lh / 2, lw, lh);
          ctx.restore();
        } else if (studioState.effect === 'embroidery') {
          // Stitched Thread Texture
          ctx.save();
          ctx.shadowColor = "rgba(0, 0, 0, 0.7)";
          ctx.shadowBlur = 4;
          ctx.shadowOffsetY = 2;
          ctx.drawImage(studioState.logoImg, -lw / 2, -lh / 2, lw, lh);
          ctx.restore();
        } else {
          // UV High Gloss Digital Print (Sublimation Ceramic Gloss)
          ctx.save();
          ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
          ctx.shadowBlur = 4;
          ctx.shadowOffsetY = 2;
          ctx.drawImage(studioState.logoImg, -lw / 2, -lh / 2, lw, lh);

          ctx.globalCompositeOperation = "soft-light";
          ctx.globalAlpha = 0.4;
          const glossGrad = ctx.createLinearGradient(-lw / 2, -lh / 2, lw / 2, lh / 2);
          glossGrad.addColorStop(0, "rgba(255, 255, 255, 0.8)");
          glossGrad.addColorStop(0.5, "transparent");
          glossGrad.addColorStop(1, "rgba(0, 0, 0, 0.3)");
          ctx.fillStyle = glossGrad;
          ctx.fillRect(-lw / 2, -lh / 2, lw, lh);
          ctx.restore();
        }

        ctx.restore();
      }

      // 3. Render Custom Text Layer with Material Depth
      if (studioState.text) {
        ctx.save();
        ctx.font = `700 24px "${studioState.font}", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        if (studioState.effect === 'engrave') {
          ctx.shadowColor = "rgba(0,0,0,0.9)";
          ctx.shadowBlur = 3;
          ctx.shadowOffsetY = 2;
          ctx.fillStyle = "#e2e8f0";
          ctx.fillText(studioState.text, studioState.textX, studioState.textY);
        } else if (studioState.effect === 'gold_foil') {
          ctx.shadowColor = "rgba(251, 191, 36, 0.8)";
          ctx.shadowBlur = 6;
          ctx.fillStyle = "#fbbf24";
          ctx.fillText(studioState.text, studioState.textX, studioState.textY);
        } else {
          ctx.shadowColor = "rgba(0,0,0,0.4)";
          ctx.shadowBlur = 4;
          ctx.shadowOffsetY = 2;
          ctx.fillStyle = studioState.textColor;
          ctx.fillText(studioState.text, studioState.textX, studioState.textY);
        }

        ctx.restore();
      }

      // Only draw active drag border when user is actively dragging item
      if (studioState.isDragging && studioState.logoImg) {
        ctx.save();
        ctx.strokeStyle = "rgba(251, 191, 36, 0.5)";
        ctx.lineWidth = 1;
        const lw = 130 * studioState.logoScale;
        const lh = ((studioState.logoImg.height / studioState.logoImg.width) * 130) * studioState.logoScale;
        ctx.strokeRect(studioState.logoX - lw / 2 - 4, studioState.logoY - lh / 2 - 4, lw + 8, lh + 8);
        ctx.restore();
      }
    }

    // --- Canvas Mouse/Touch Interaction ---
    function getCanvasCoords(e) {
      const rect = studioCanvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const scaleX = studioCanvas.width / rect.width;
      const scaleY = studioCanvas.height / rect.height;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    }

    function handleCanvasMouseDown(e) {
      const coords = getCanvasCoords(e);
      // Check if clicked near logo
      if (studioState.logoImg) {
        const distLogo = Math.hypot(coords.x - studioState.logoX, coords.y - studioState.logoY);
        if (distLogo < 80) {
          studioState.isDragging = true;
          studioState.activeDragItem = 'logo';
          studioState.dragOffsetX = coords.x - studioState.logoX;
          studioState.dragOffsetY = coords.y - studioState.logoY;
          return;
        }
      }
      // Check if clicked near text
      if (studioState.text) {
        const distText = Math.hypot(coords.x - studioState.textX, coords.y - studioState.textY);
        if (distText < 60) {
          studioState.isDragging = true;
          studioState.activeDragItem = 'text';
          studioState.dragOffsetX = coords.x - studioState.textX;
          studioState.dragOffsetY = coords.y - studioState.textY;
          return;
        }
      }
    }

    function handleCanvasMouseMove(e) {
      if (!studioState.isDragging) return;
      if (e.cancelable) e.preventDefault();
      const coords = getCanvasCoords(e);

      if (studioState.activeDragItem === 'logo') {
        studioState.logoX = coords.x - studioState.dragOffsetX;
        studioState.logoY = coords.y - studioState.dragOffsetY;
      } else if (studioState.activeDragItem === 'text') {
        studioState.textX = coords.x - studioState.dragOffsetX;
        studioState.textY = coords.y - studioState.dragOffsetY;
      }

      renderCanvas();
    }

    function handleCanvasMouseUp() {
      if (studioState.isDragging) {
        studioState.isDragging = false;
        studioState.activeDragItem = null;
      }
    }

    // --- AI Quality Inspector & Auditor ---
    function runAIDesignAudit() {
      // Audit UI removed as requested
    }

    function handleCanvasTouchStart(e) {
      if (e.cancelable) e.preventDefault();
      handleCanvasMouseDown(e);
    }

    function handleCanvasTouchMove(e) {
      handleCanvasMouseMove(e);
    }

    // --- Pricing & Order Handler ---
    window.adjustStudioQty = function (delta) {
      const qtyInput = document.getElementById('studioQtyInput');
      if (!qtyInput) return;
      let newQty = parseInt(qtyInput.value || 1) + delta;
      if (newQty < 1) newQty = 1;
      qtyInput.value = newQty;
      window.recalculateStudioPrice();
    };

    window.recalculateStudioPrice = function () {
      const qtyInput = document.getElementById('studioQtyInput');
      const qty = parseInt(qtyInput ? qtyInput.value : 10) || 1;
      studioState.qty = qty;

      let unitPrice = studioState.productBasePrice;
      let discountPct = 0;

      if (qty >= 100) discountPct = 25;
      else if (qty >= 50) discountPct = 20;
      else if (qty >= 25) discountPct = 15;
      else if (qty >= 10) discountPct = 10;

      const discountedUnit = unitPrice * (1 - discountPct / 100);
      const totalPrice = Math.round(discountedUnit * qty);

      const unitSpan = document.getElementById('studioUnitPrice');
      const totalSpan = document.getElementById('studioTotalPrice');
      const discountBadge = document.getElementById('studioDiscountBadge');

      if (unitSpan) unitSpan.textContent = '₹' + unitPrice.toLocaleString('en-IN');
      if (totalSpan) totalSpan.textContent = '₹' + totalPrice.toLocaleString('en-IN');
      if (discountBadge) {
        if (discountPct > 0) {
          discountBadge.style.display = 'block';
          discountBadge.textContent = `🎉 ${discountPct}% Bulk Discount Applied!`;
        } else {
          discountBadge.style.display = 'none';
        }
      }
    };

    window.submitStudioOrder = function (action) {
      const titleInput = document.getElementById('studioProductNameInput');
      const productName = titleInput ? titleInput.value : studioState.productName;
      const qty = studioState.qty;
      const totalSpan = document.getElementById('studioTotalPrice');
      const totalPrice = totalSpan ? totalSpan.textContent : '₹' + (studioState.productBasePrice * qty);

      const mockupDataUrl = studioCanvas ? studioCanvas.toDataURL('image/png') : '';

      // Route through the same object-keyed 'sai_studio_cart' updateCartQty()
      // everything else on this page uses (was previously pushing onto a plain
      // array, which crashed the moment a real customer already had the normal
      // object-shaped cart saved - array/object aren't interchangeable there).
      updateCartQty(
        'CUSTOM: ' + productName,
        qty,
        totalPrice,
        mockupDataUrl || cldOpt(studioState.productImgSrc),
        { technique: studioState.effect.toUpperCase() + ' BRANDED' }
      );

      if (action === 'cart') {
        window.closeAIStudioModal();
        showCartToast();
      } else if (action === 'buynow') {
        window.closeAIStudioModal();
        window.location.href = 'cart.html';
      }
    };

    /**
     * Dynamically clones marquee track items for continuous seamless scrolling
     * without duplicating markup in HTML.
     */
    function initMarqueeAutoCloning() {
      const tracks = document.querySelectorAll('.category-marquee-track, .marquee-track');
      tracks.forEach(track => {
        if (track.getAttribute('data-marquee-cloned') === 'true') return;
        const children = Array.from(track.children);
        children.forEach(child => {
          const clone = child.cloneNode(true);
          clone.setAttribute('aria-hidden', 'true');
          track.appendChild(clone);
        });
        track.setAttribute('data-marquee-cloned', 'true');
      });
    }

    // The 9 hand-built .slide elements in #heroRailTrack (kits/sets/trophies/...)
    // are static markup, not read from the database - an admin toggling a
    // *different* category's "Show in hero carousel" checkbox (Categories >
    // edit > Hero banner) had no way to appear here. GET /api/catalog/corporate
    // already computes exactly which categories qualify (show_in_hero=true and
    // a hero image set) as `data.hero` - this appends one slide per such
    // category that isn't already one of the static ones, so a newly-flagged
    // category actually shows up instead of silently doing nothing.
    function syncDynamicHeroSlides(heroList) {
      const track = document.getElementById('heroRailTrack');
      if (!track || !Array.isArray(heroList) || !heroList.length) return;

      // Re-syncing (e.g. a future re-fetch) shouldn't pile up duplicates.
      track.querySelectorAll('.hero-slide-dynamic').forEach(el => el.remove());

      const existingKeys = new Set();
      track.querySelectorAll('.slide[onclick]').forEach(el => {
        const m = /switchCategory\('([^']+)'\)/.exec(el.getAttribute('onclick') || '');
        if (m) existingKeys.add(m[1]);
      });

      const escHero = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

      const html = heroList
        .filter(h => h.id && h.img && !existingKeys.has(h.id))
        .map(h => `
          <div class="slide category-hero-slide hero-slide-dynamic" onclick="switchCategory('${escHero(h.id)}')" style="cursor:pointer;" title="${escHero(h.title)}">
            <img loading="lazy" src="${escHero(h.img)}" alt="${escHero(h.title)}" class="bg">
            <div class="s-body" style="background:linear-gradient(0deg, rgba(0,0,0,.6), rgba(0,0,0,.2) 55%, transparent 80%);">
              ${h.tag ? `<span class="s-tag">${escHero(h.tag)}</span>` : ''}
              <h1 class="s-title">${escHero(h.title)}</h1>
              <a href="#packagesGrid" onclick="switchCategory('${escHero(h.id)}')" class="btn btn-gold">
                <span>EXPLORE</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
              </a>
            </div>
          </div>`)
        .join('');
      if (!html) return;

      track.insertAdjacentHTML('beforeend', html);
      // The carousel engine recomputes slide count from the live DOM on every
      // call, so just re-triggering it at the current position picks up the
      // newly-added slide(s) without disturbing whichever slide is showing.
      if (typeof showHeroSlide === 'function') showHeroSlide(currentHeroSlide, true);
    }

    // --- Fetch Backend Products ---
    // Categories/products for the sidebar and per-category views come from the
    // database via GET /api/catalog/corporate. Field mapping: category name/
    // description/image map directly; each product's title/price/mrp/images/
    // description map to name/oldPrice/img+subtitle. The "All Corporate Gifts"
    // landing view keeps its existing static HTML cards (see renderContent's
    // early-return for currentCategory === 'all') - only per-category views are
    // now database-driven.
    const CORPORATE_API_BASE = window.SAI_API_BASE || "http://localhost:8000";

    async function loadProductsFromBackend() {
      try {
        const response = await fetch(`${CORPORATE_API_BASE}/api/catalog/corporate`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const built = {};
        data.categories.forEach(c => {
          built[c.id] = {
            title: c.name,
            desc: c.description || "",
            icon: c.image,
            products: (data.packages[c.id] || []).map(p => {
              const prod = {
                id: p.id,
                name: p.title,
                price: p.price,
                img: (p.images && p.images[0]) || "",
                // Full gallery, not just the first photo - orderNowDirect()
                // needs this to populate the product modal's thumbnail strip
                // with every photo an admin attached, not only the one the
                // card itself was rendered with.
                images: p.images || [],
                // Same photos uncompressed, for the modal's main image and zoom viewer.
                fullImages: p.full_images || [],
                // Only the detail modal's gallery plays these - cards stay images-only.
                videos: p.videos || [],
                subtitle: p.description || "",
              };
              if (p.mrp) prod.oldPrice = p.mrp;
              prod.input_fields = p.input_fields || [];
              prod.bulk_discounts = p.bulk_discounts || [];
              prod.delivery_days = p.delivery_days || null;
              prod.features = p.feat || [];
              prod.type = p.type || null;
              prod.stock = p.stock ?? null;
              prod.search_keywords = p.search_keywords || [];
              return prod;
            }),
          };
        });
        categoriesData = built;
        syncDynamicHeroSlides(data.hero || []);
      } catch (e) {
        console.error("Could not load corporate catalog from backend.", e);
        const sidebar = document.getElementById('desktopSidebar');
        if (sidebar) sidebar.innerHTML = '<div style="padding:16px;color:#b91c1c;">Could not load products right now. Please refresh the page.</div>';
      }
    }

    // --- Dynamic Desktop Navbar Height for Sticky Sidebar Offset ---
    function updateStickyHeaderOffset() {
      if (window.innerWidth > 767) {
        const desktopNav = document.querySelector('.desktop-nav');
        if (desktopNav) {
          const navHeight = desktopNav.offsetHeight;
          if (navHeight > 0) {
            document.documentElement.style.setProperty('--navbar-height', `${navHeight}px`);
          }
        }
      }
    }

    window.addEventListener('resize', updateStickyHeaderOffset);
    window.addEventListener('load', updateStickyHeaderOffset);

    function initCorporateProductAccordions() {
      document.querySelectorAll('.corporate-accordion-trigger').forEach(trigger => {
        trigger.addEventListener('click', () => {
          const item = trigger.closest('.corporate-accordion-item');
          const group = item?.parentElement;
          if (!item || !group) return;
          const shouldOpen = trigger.getAttribute('aria-expanded') !== 'true';
          group.querySelectorAll('.corporate-accordion-item').forEach(other => {
            other.classList.remove('is-open');
            other.querySelector('.corporate-accordion-trigger')?.setAttribute('aria-expanded', 'false');
          });
          if (shouldOpen) {
            item.classList.add('is-open');
            trigger.setAttribute('aria-expanded', 'true');
          }
        });
      });
      document.querySelector('.corporate-accordion-item')?.classList.add('is-open');
    }

    // --- On Load ---
    document.addEventListener('DOMContentLoaded', async () => {
      updateStickyHeaderOffset();
      initCorporateProductAccordions();
      initMarqueeAutoCloning();
      renderHeaderComponents();

      await loadProductsFromBackend();

      const urlParams = new URLSearchParams(window.location.search);
      const catParam = urlParams.get('category');
      const hasCatDeepLink = catParam && (catParam === 'all' || categoriesData[catParam]);
      if (hasCatDeepLink) {
        currentCategory = catParam;
      }

      initSidebar();
      // Without this, a ?category=<slug> deep link (from the header mega-menu, or
      // any other page's link) only marked the right sidebar item active - the
      // product grid itself still showed whatever static "All" HTML was already
      // in the page, since nothing had ever called renderContent() on page load.
      renderContent();
      // A ?category= deep link left the visitor at the top hero slider (which
      // cycles through every category, not just this one) instead of the actual
      // product grid it just rendered below - same scroll switchCategory() already
      // does when a category is picked in-page, just missing for the page-load path.
      if (hasCatDeepLink) {
        setTimeout(() => {
          const targetEl = document.getElementById('catalogContainer') || document.getElementById('packagesGrid') || document.querySelector('.content-layout');
          if (targetEl) {
            const yOffset = getScrollOffset();
            const y = targetEl.getBoundingClientRect().top + window.pageYOffset + yOffset;
            window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
          }
        }, 50);
      }
      updateCartUI();
      initSliderEvents();
      resetHeroAutoplay();
      updateStickyHeaderOffset();

      /* deep-link support: ?openProduct=<name>&openPrice=<price>&openImg=<url>&pid=<id>
         auto-opens that exact product's detail modal (used by homepage product cards so
         clicking one opens the exact product, not just the corporate page) - orderNowDirect
         takes the product's literal name/price/img rather than looking it up, so no catalog
         match is needed here. pid just carries the real database id through if the link had
         one, so it's still there in the URL/for editUrl links built off it. */
      const openProductParam = urlParams.get('openProduct');
      if (openProductParam) {
        const price = urlParams.get('openPrice') || '';
        const img = urlParams.get('openImg') || '';
        const pid = urlParams.get('pid') || null;
        setTimeout(() => window.orderNowDirect(openProductParam, price, img, pid, { skipHistory: true }), 150);
      }

      // Mobile App Switcher Collapse on Scroll
      const appSwitcher = document.querySelector('.mobile-app-switcher');
      const headerAddress = document.querySelector('.mobile-header-address');
      if (appSwitcher) {
        let lastScrollTop = 0;
        window.addEventListener('scroll', () => {
          const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
          const scrolledDown = scrollTop > lastScrollTop;

          if (scrolledDown && scrollTop > 40) {
            appSwitcher.classList.add('nav-collapsed');
            if (headerAddress) headerAddress.classList.add('nav-collapsed');
          } else if (!scrolledDown) {
            appSwitcher.classList.remove('nav-collapsed');
            if (headerAddress) headerAddress.classList.remove('nav-collapsed');
          }

          lastScrollTop = scrollTop;
        }, { passive: true });
      }
    });
  })();
