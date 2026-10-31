
    /* ============ DATA ============
       Categories/packages/portfolio/hero all come from GET /api/catalog/photography
       (see boot() near the bottom of this file) - these start empty and are filled
       in before the first render. "All Services" is a client-side pseudo-category
       (not a real DB row - it's a navigation affordance, not content), so it's the
       one piece still hardcoded here and gets prepended once the real ones arrive. */
    const ALL_CATEGORY = { id: "all", icon: "📷", name: "All Services", image: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/All%20Services/Photo%20icon.png" };
    let CATEGORIES = [ALL_CATEGORY];
    let PACKAGES = {};
    let FOLIO = {};
    let FOLIO_TITLES = {};
    let CATEGORY_IMAGES = {};

    /* Cloudinary auto-format/auto-quality transform: purely size-reducing (no resize/crop),
       safe to wrap any URL — no-ops for non-Cloudinary URLs or already-transformed ones. */

    function resolveCategoryImage(cat) {
      return cldOpt(CATEGORY_IMAGES[cat] || CATEGORY_IMAGES.wedding);
    }

    let current = "wedding";
    let activeSidebar = "all"; /* which sidebar item is visually highlighted; decoupled from
  `current` because selectCat() maps the "all" category onto the "wedding" content set,
  and that content mapping must stay untouched */

    /* ============ RENDER ============ */
    /* Grouping for the sidebar list & the "All Services" grid only — CATEGORIES itself
       (and its order) stays untouched since it also drives packages/folio/deep-links.
       This is a subject-based split (Photography vs Videography) used only to decide
       which section a category's card appears under. Computed live from each
       category's group_label (a plain dropdown in the admin Categories form -
       "Photography" or "Videography", anything else/unset falls back to
       Photography) instead of a fixed id list - a previous fixed-list version
       meant every newly added category silently never appeared in the
       sidebar/grid until someone edited this file by hand. */
    function sidebarPhotographyIds() {
      return CATEGORIES.filter(c => c.id !== "all" && c.group_label !== "Videography").map(c => c.id);
    }
    function sidebarVideographyIds() {
      return CATEGORIES.filter(c => c.id !== "all" && c.group_label === "Videography").map(c => c.id);
    }

    function renderSidebar() {
      const el = document.getElementById("desktopSidebar");
      const sideItemHtml = c => `
    <div class="side-item ${c.id === 'all' ? 'all-item' : ''} ${c.id === activeSidebar ? 'active' : ''}" onclick="selectCat('${c.id}')">
      <div class="si-ico">${c.image ? `<img src="${cldOpt(c.image)}" alt="${c.name}" loading="lazy" onerror="this.parentElement.innerHTML='${c.icon}';this.parentElement.classList.add('emoji');">` : ''}</div>
      ${c.name}
    </div>`;
      const byId = id => CATEGORIES.find(c => c.id === id);
      el.innerHTML =
        sideItemHtml(byId("all")) +
        `<div class="side-section-label">Photography</div>` +
        sidebarPhotographyIds().map(id => sideItemHtml(byId(id))).join("") +
        `<div class="side-section-label">Videography</div>` +
        sidebarVideographyIds().map(id => sideItemHtml(byId(id))).join("");
    }

    function loadPortfolioImageFallback(img) {
      // Portfolio photos now come from the database with exactly one real URL each
      // (no more guessing between candidate on-disk filenames) - if that URL fails,
      // fall back once to the category's hero image, same pattern as package thumbs.
      const cat = img.dataset.category || "wedding";
      img.onerror = null;
      img.src = resolveCategoryImage(cat);
    }

    /* ============ REUSABLE IMAGE ZOOM HELPER ============ */
    function initImageZoom(img, container, badge) {
      if (!img || !container) return;
      let isZoomed = false;

      container.style.overflow = "hidden";
      container.style.cursor = "zoom-in";
      img.style.transition = "transform 0.3s cubic-bezier(0.2, 0, 0.2, 1)";
      img.style.transformOrigin = "center center";

      function updateOrigin(e) {
        if (!isZoomed) return;
        const rect = container.getBoundingClientRect();
        const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
        img.style.transformOrigin = `${x}% ${y}%`;
      }

      function toggleZoom(e) {
        isZoomed = !isZoomed;
        if (isZoomed) {
          img.style.transform = "scale(2.5)";
          container.style.cursor = "zoom-out";
          if (badge) badge.innerHTML = "🔎 Click to Zoom Out";
          updateOrigin(e);
        } else {
          img.style.transform = "scale(1)";
          img.style.transformOrigin = "center center";
          container.style.cursor = "zoom-in";
          if (badge) badge.innerHTML = "🔍 Click Image to Zoom";
        }
      }

      container.onclick = (e) => {
        if (e.target.classList.contains('gallery-nav-arrow')) return;
        toggleZoom(e);
      };

      container.onmousemove = (e) => {
        if (isZoomed) updateOrigin(e);
      };

      container.onmouseleave = () => {
        if (isZoomed) {
          isZoomed = false;
          img.style.transform = "scale(1)";
          img.style.transformOrigin = "center center";
          container.style.cursor = "zoom-in";
          if (badge) badge.innerHTML = "🔍 Click Image to Zoom";
        }
      };
    }

    /* ============ IN-PAGE GALLERY MODAL BOX SYSTEM ============ */
    let currentGalleryCat = 'wedding';
    let currentGalleryIdx = 0;

    function openGalleryModal(cat, index) {
      currentGalleryCat = cat || current || 'wedding';
      currentGalleryIdx = Number(index || 0);

      const catObj = CATEGORIES.find(c => c.id === currentGalleryCat) || CATEGORIES[1];
      const items = FOLIO[currentGalleryCat] || FOLIO.wedding;
      const titles = FOLIO_TITLES[currentGalleryCat] || catObj.name + " Portfolio";
      const pkgs = PACKAGES[currentGalleryCat] || PACKAGES.wedding;
      /* the headline package — the first one. It is the package BOOK NOW books,
         so it is also the one detailed in the panel. */
      const heroPkgIdx = 0;
      const heroPkg = pkgs[heroPkgIdx];

      const modalBody = document.getElementById("galleryModalBody");
      if (!modalBody) return;

      const imageList = items.map((item, i) => ({
        // The portfolio modal shows one photo large - the original, not the
        // strip's thumbnail (`full` from the catalog API; `url` as a fallback).
        src: item.full || item.url,
        caption: item.caption || `${catObj.name} Photo ${i + 1}`,
      }));

      if (currentGalleryIdx >= imageList.length) currentGalleryIdx = 0;
      const initialImg = imageList[currentGalleryIdx] || imageList[0] || { src: resolveCategoryImage(currentGalleryCat), caption: catObj.name };

      modalBody.innerHTML = `
        <div class="modal-grid gallery-modal-grid">
          <div class="modal-media-col">
            <div class="modal-media-header">
              <span class="gallery-cat-badge">${catObj.icon} ${catObj.name}</span>
              <span class="gallery-counter-badge" id="galleryCounter">Photo ${currentGalleryIdx + 1} of ${imageList.length}</span>
            </div>
            <div class="modal-media-main" id="galleryZoomContainer">
              <img src="${initialImg.src}" id="galleryModalMainImg" alt="${initialImg.caption}" onerror="this.onerror=null;this.src='${resolveCategoryImage(currentGalleryCat)}'">
              ${imageList.length > 1 ? `
                <button type="button" class="gallery-nav-arrow left" onclick="stepGalleryModal(-1)">&lsaquo;</button>
                <button type="button" class="gallery-nav-arrow right" onclick="stepGalleryModal(1)">&rsaquo;</button>
              ` : ''}
              <div class="zoom-badge" id="galleryZoomBadge">🔍 Click Image to Zoom</div>
            </div>
            <div class="gallery-caption-bar" id="galleryCaptionText">${initialImg.caption}</div>
            <div class="modal-gallery-thumbs" id="galleryThumbsGrid">
              ${imageList.map((imgItem, idx) => `
                <div class="modal-thumb ${idx === currentGalleryIdx ? 'active' : ''}" onclick="setGalleryModalImg(${idx})">
                  <img src="${imgItem.src}" alt="Thumb ${idx + 1}" loading="${idx === 0 ? 'eager' : 'lazy'}" onerror="this.onerror=null;this.src='${resolveCategoryImage(currentGalleryCat)}'">
                </div>
              `).join('')}
            </div>
          </div>

          <div class="modal-info-col">
            <div class="modal-header-block">
              <h3>${catObj.icon} ${titles}</h3>
              <p>Explore full high-resolution portfolio samples. Click on the image to zoom in and examine capturing quality.</p>
            </div>

            <div class="gallery-stats">
              <div class="g-stat"><span class="g-stat-num">${imageList.length}</span><span class="g-stat-lbl">Portfolio Photos</span></div>
              <div class="g-stat"><span class="g-stat-num">${pkgs.length}</span><span class="g-stat-lbl">Packages</span></div>
              <div class="g-stat"><span class="g-stat-num">${pkgs[0].price}</span><span class="g-stat-lbl">Starting From</span></div>
            </div>

            <div class="gallery-package-preview">
              <div class="modal-section-title">✨ Packages</div>
              <p class="gallery-pkg-hint">${pkgs.length} ${catObj.name} packages are available. Full photos, inclusions &amp; pricing for each one are on the main page.</p>
              <div class="gallery-pkg-list">
                ${pkgs.map(pk => `
                  <div class="gallery-pkg-row">
                    <div class="g-pkg-meta">
                      <span class="g-pkg-tier">${pk.tier}</span>
                      <span class="g-pkg-title">${pk.title}</span>
                    </div>
                    <span class="g-pkg-price">${pk.price}</span>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="gallery-includes">
              <div class="modal-section-title">✓ What You Get — ${heroPkg.tier} Package</div>
              <ul class="gallery-includes-list">
                ${heroPkg.feat.map(f => `<li>${f}</li>`).join('')}
              </ul>
            </div>

            <div class="modal-footer-cta gallery-cta-stack">
              <button type="button" class="modal-view-pkgs-btn" onclick="viewPackagesFromGalleryModal('${currentGalleryCat}')">
                ✨ VIEW PACKAGES — ${catObj.name.toUpperCase()} →
              </button>
              <button type="button" class="modal-book-btn" onclick="bookFromGalleryModal('${currentGalleryCat}')">
                BOOK NOW →
              </button>
            </div>
          </div>
        </div>
      `;

      window._currentGalleryList = imageList;
      document.getElementById("galleryModal").style.display = "flex";
      document.body.style.overflow = "hidden";

      setTimeout(() => {
        const imgEl = document.getElementById("galleryModalMainImg");
        const containerEl = document.getElementById("galleryZoomContainer");
        const badgeEl = document.getElementById("galleryZoomBadge");
        initImageZoom(imgEl, containerEl, badgeEl);
      }, 50);
    }

    /* "View Packages" (gallery modal): closes and hands off to that service's packages
       section on the main page, where every package shows with its own photos */
    function viewPackagesFromGalleryModal(cat) {
      closeGalleryModal();
      viewPackages(cat);
    }

    /* "Book Now" (gallery modal): books this service's headline (first) package
       through goBooking(), so the booking.html link format (and any queued
       equipment add-on) stays exactly as everywhere else */
    function bookFromGalleryModal(cat) {
      closeGalleryModal();
      goBooking(cat, 0);
    }

    function setGalleryModalImg(idx) {
      if (!window._currentGalleryList || !window._currentGalleryList.length) return;
      currentGalleryIdx = (idx + window._currentGalleryList.length) % window._currentGalleryList.length;
      const item = window._currentGalleryList[currentGalleryIdx];

      const mainImg = document.getElementById("galleryModalMainImg");
      const captionEl = document.getElementById("galleryCaptionText");
      const counterEl = document.getElementById("galleryCounter");

      if (mainImg) {
        mainImg.src = item.src;
        mainImg.alt = item.caption;
        mainImg.style.transform = "scale(1)";
        mainImg.style.transformOrigin = "center center";
      }
      if (captionEl) captionEl.textContent = item.caption;
      if (counterEl) counterEl.textContent = `Photo ${currentGalleryIdx + 1} of ${window._currentGalleryList.length}`;

      document.querySelectorAll("#galleryThumbsGrid .modal-thumb").forEach((t, i) => {
        t.classList.toggle("active", i === currentGalleryIdx);
      });
    }

    function stepGalleryModal(dir) {
      setGalleryModalImg(currentGalleryIdx + dir);
    }

    function closeGalleryModal(e) {
      if (e && e.target !== document.getElementById("galleryModal") && !e.target.classList.contains("equip-modal-close")) return;
      document.getElementById("galleryModal").style.display = "none";
      document.body.style.overflow = "";
    }

    function openCategoryGallery(cat, index) {
      openGalleryModal(cat, index);
    }

    function renderFolio() {
      /* Services booked from the Equipment & Coverage modal (Candid Photography, LED
         Screens, ...) have no portfolio of their own. Bail out instead of falling back
         to FOLIO.wedding, which used to put wedding captions under their title;
         updateServiceSectionsVisibility() hides the whole block for them. */
      const items = FOLIO[current];
      if (!items || !items.length) {
        document.getElementById("folioScroll").innerHTML = "";
        return;
      }
      document.getElementById("folioTitle").textContent = FOLIO_TITLES[current] || "Portfolio";
      const cardHTML = (item, i) => {
        const imageSrc = item.url;
        const cap = item.caption;
        return `
    <div class="folio-card" onclick="openCategoryGallery('${current}', ${i})" title="Click to explore ${cap} in full gallery &amp; book">
      <div class="explore-badge">Explore Gallery ↗</div>
      <img class="folio-photo" src="${imageSrc}" alt="${cap}" data-category="${current}" loading="lazy"
           onerror="loadPortfolioImageFallback(this)">
      <div class="ph">［ ${imageSrc} ］</div>
      <div class="cap">${cap}<span>Click to explore gallery &amp; packages &rarr;</span></div>
    </div>`;
      };
      const cards = items.map(cardHTML).join("");
      /* duplicated set (pixel-identical) lets the CSS marquee loop from -50% back to 0% with no visible seam */
      document.getElementById("folioScroll").innerHTML = `<div class="folio-track" id="folioTrack">${cards}${cards}</div>`;
      const track = document.getElementById("folioTrack");
      const realWidth = track.scrollWidth / 2;
      const duration = realWidth > 0 ? realWidth / FOLIO_SPEED : 30;
      track.style.animationDuration = duration + "s";
    }

    let pkgAutoSwipeTimers = [];

    function stopPkgAutoSwipe() {
      if (pkgAutoSwipeTimers && pkgAutoSwipeTimers.length) {
        pkgAutoSwipeTimers.forEach(t => clearInterval(t));
      }
      pkgAutoSwipeTimers = [];
    }

    function startPkgAutoSwipe() {
      stopPkgAutoSwipe();
      const pks = PACKAGES[current] || [];
      pks.forEach((p, i) => {
        const track = document.getElementById(`pkgTrack-${i}`);
        if (!track) return;
        const totalSlides = track.children.length;
        if (totalSlides <= 1) return;

        // Auto-swipe every 3 seconds (pauses on hover so user can interact)
        const timer = setInterval(() => {
          const t = document.getElementById(`pkgTrack-${i}`);
          if (!t) return;
          const pkgCard = t.closest('.pkg');
          if (pkgCard && pkgCard.matches(':hover')) return;

          const slideWidth = t.clientWidth;
          if (!slideWidth || slideWidth <= 0) return;
          const currentSlide = Math.round(t.scrollLeft / slideWidth);
          const nextSlide = (currentSlide + 1) % totalSlides;
          t.scrollTo({ left: slideWidth * nextSlide, behavior: 'smooth' });
        }, 3000);

        pkgAutoSwipeTimers.push(timer);
      });
    }

    /* The client asked for cards to show only the most attractive inclusions, at most
       5 - beyond that the cards in a row grow uneven and, on the 2-column mobile grid,
       very tall. The admin ticks which Package Includes items go on the card
       (extra.card_features, kept in Package Includes order); a package saved before
       that tick existed has none, and shows its first 5 instead. The full list is on
       booking.html's Package Includes, which the "+N more" line links to. */
    const CARD_FEATURE_LIMIT = 5;
    function cardFeaturesOf(p) {
      const chosen = p.extra && Array.isArray(p.extra.card_features)
        ? p.feat.filter(f => p.extra.card_features.includes(f))
        : p.feat;
      return chosen.slice(0, CARD_FEATURE_LIMIT);
    }

    function renderPackages() {
      const pks = PACKAGES[current] || [];
      const grid = document.getElementById("pkgGrid");
      /* Wedding has a 4th (Gold) tier - four across keeps every tier on one row
         instead of leaving Gold alone on a second row under three cards */
      grid.classList.toggle("cols-4", pks.length === 4);
      grid.innerHTML = pks.map((p, i) => {
        const tierKey = p.tier.toLowerCase().replace(/\s+/g, '-');
        const images = getPackageCarouselImages(current, p);

        const slidesHTML = images.map((imgSrc, imgIdx) => `
          <div class="pkg-carousel-slide" onclick="goBooking('${current}',${i})" title="Book the ${p.title} package">
            <img class="pkg-carousel-img" src="${imgSrc}" alt="${p.title} photo ${imgIdx + 1}" loading="lazy" data-category="${current}" data-tier="${tierKey}" data-next-index="0" onerror="loadPackageThumbFallback(this)">
          </div>
        `).join("");

        const dotsHTML = images.length > 1 ? `
          <div class="pkg-carousel-dots" id="pkgDots-${i}">
            ${images.map((_, dotIdx) => `
              <span class="pkg-carousel-dot ${dotIdx === 0 ? 'active' : ''}" onclick="event.stopPropagation(); scrollPkgCarousel('${i}', ${dotIdx})"></span>
            `).join("")}
          </div>
        ` : '';

        const arrowsHTML = images.length > 1 ? `
          <button type="button" class="pkg-carousel-btn prev" aria-label="Previous image" onclick="event.stopPropagation(); navPkgCarousel('${i}', -1)">&#10094;</button>
          <button type="button" class="pkg-carousel-btn next" aria-label="Next image" onclick="event.stopPropagation(); navPkgCarousel('${i}', 1)">&#10095;</button>
        ` : '';

        return `
    <div class="pkg">
      <div class="pkg-carousel">
        <div class="pkg-carousel-track" id="pkgTrack-${i}" onscroll="onPkgCarouselScroll('${i}')">
          ${slidesHTML}
        </div>
        <div class="pkg-carousel-hint">Click photo to book →</div>
        ${arrowsHTML}
        ${dotsHTML}
      </div>
      <span class="tier">${p.tier}</span>
      <h3>${p.title}</h3>
      ${p.description ? `<p class="pkg-desc">${p.description}</p>` : ""}
      <ul>${cardFeaturesOf(p).map(f => `<li>${f}</li>`).join("")}${p.feat.length > cardFeaturesOf(p).length
        ? `<li class="pkg-more" onclick="goBooking('${current}',${i})">+${p.feat.length - cardFeaturesOf(p).length} more in Package Includes →</li>`
        : ""}</ul>
      <div class="pkg-foot">
        <div class="price">${p.price}</div>
        <button class="book-btn" onclick="goBooking('${current}',${i})">Book Now</button>
      </div>
    </div>`;
      }).join("");
      startPkgAutoSwipe();
    }

    function loadPackageThumbFallback(img) {
      const cat = img.dataset.category || "wedding";
      img.onerror = null;
      img.src = resolveCategoryImage(cat);
    }

    // Each package's own photos now travel inline on its data (p.images, from the
    // database) instead of a separate PACKAGE_IMAGES lookup keyed by "category|tier".
    function getPackageCarouselImages(cat, pkg) {
      if (pkg && pkg.images && pkg.images.length) return pkg.images.map(cldOpt);
      return [resolveCategoryImage(cat)];
    }

    function scrollPkgCarousel(pkgIndex, slideIndex) {
      const track = document.getElementById(`pkgTrack-${pkgIndex}`);
      if (!track) return;
      const slideWidth = track.clientWidth;
      track.scrollTo({ left: slideWidth * slideIndex, behavior: 'smooth' });
    }

    function navPkgCarousel(pkgIndex, direction) {
      const track = document.getElementById(`pkgTrack-${pkgIndex}`);
      if (!track) return;
      const slideWidth = track.clientWidth;
      const currentSlide = Math.round(track.scrollLeft / slideWidth);
      const totalSlides = track.children.length;
      let targetSlide = currentSlide + direction;
      if (targetSlide < 0) targetSlide = totalSlides - 1;
      if (targetSlide >= totalSlides) targetSlide = 0;
      track.scrollTo({ left: slideWidth * targetSlide, behavior: 'smooth' });
    }

    function onPkgCarouselScroll(pkgIndex) {
      const track = document.getElementById(`pkgTrack-${pkgIndex}`);
      const dotsContainer = document.getElementById(`pkgDots-${pkgIndex}`);
      if (!track || !dotsContainer) return;
      const slideWidth = track.clientWidth;
      if (!slideWidth) return;
      const activeIdx = Math.round(track.scrollLeft / slideWidth);
      const dots = dotsContainer.querySelectorAll('.pkg-carousel-dot');
      dots.forEach((dot, idx) => {
        if (idx === activeIdx) {
          dot.classList.add('active');
        } else {
          dot.classList.remove('active');
        }
      });
    }

    /* "All Services" grid — shown for the "All Services" sidebar item, split into the
       same two sections as the sidebar: Photography and Videography. Within each
       section, a category expands to one card per actual bookable package/product
       (Wedding Standard, Wedding Premium, ...) whenever it has PACKAGES of its own —
       a single category card used to hide every one of its products behind an extra
       click. A category with no PACKAGES (it's an Explore-Details-only listing, e.g.
       Candid Photography) still gets its one equipment card, same as before. */
    function renderAllServices() {
      const grid = document.getElementById("allServicesGrid");
      if (!grid) return;
      const byId = id => CATEGORIES.find(c => c.id === id);

      const productCardHtml = (catId, pkg, idx) => {
        const cat = byId(catId);
        const img = (pkg.images && pkg.images[0]) || resolveCategoryImage(catId);
        return `
    <div class="all-service-card" onclick="goBooking('${catId}',${idx})">
      <img class="all-service-img" src="${cldOpt(img)}" alt="${pkg.title}" loading="lazy" data-category="${catId}" onerror="loadPackageThumbFallback(this)">
      <div class="all-service-body">
        <span class="tier">${pkg.tier}</span>
        <h3>${cat.name} — ${pkg.title}</h3>
        <div class="price">${pkg.price}</div>
        <button class="book-btn" onclick="event.stopPropagation();goBooking('${catId}',${idx})">Book Now</button>
      </div>
    </div>`;
      };

      const equipCardHtml = c => `
    <div class="all-service-card" onclick="directBookEquip('${c.id}')">
      ${c.image
          ? `<img class="all-service-img" src="${cldOpt(c.image)}" alt="${c.name}" loading="lazy" onerror="this.onerror=null;this.src='${resolveCategoryImage(c.id)}';">`
          : `<div class="all-service-img"></div>`}
      <div class="all-service-body">
        <h3>${c.name}</h3>
        <button class="book-btn" onclick="event.stopPropagation();directBookEquip('${c.id}')">Book Now</button>
      </div>
    </div>`;

      const sectionCardsHtml = ids => ids.map(id => {
        const pkgs = PACKAGES[id];
        return (pkgs && pkgs.length)
          ? pkgs.map((pkg, idx) => productCardHtml(id, pkg, idx)).join("")
          : equipCardHtml(byId(id));
      }).join("");

      grid.innerHTML = `
    <div class="all-services-group-label">Photography</div>
    <div class="all-services-grid">${sectionCardsHtml(sidebarPhotographyIds())}</div>
    <div class="all-services-group-label">Videography</div>
    <div class="all-services-grid">${sectionCardsHtml(sidebarVideographyIds())}</div>`;
    }

    /* toggles the "All Services" grid vs. the single-service portfolio/packages
       sections based on which sidebar item is active */
    function updateServiceSectionsVisibility() {
      const isAll = activeSidebar === "all";
      const allEl = document.getElementById("allServicesSection");
      const catEl = document.getElementById("categorySections");
      const folioEl = document.getElementById("portfolioSection");
      const pkgEl = document.getElementById("packagesSection");

      /* Data-driven: a service only shows "Our Work" if it has FOLIO entries, and only
         shows "Select Package" if it has PACKAGES. Candid Photography and LED Screens
         have neither, so both headings used to sit there with nothing under them.
         Adding FOLIO/PACKAGES data for a service brings its section back on its own. */
      const hasFolio = !!(FOLIO[current] && FOLIO[current].length);
      const hasPkgs = !!(PACKAGES[current] && PACKAGES[current].length);
      if (folioEl) folioEl.style.display = hasFolio ? "" : "none";
      if (pkgEl) pkgEl.style.display = hasPkgs ? "" : "none";

      /* with both of its sections gone the main column would be nothing but the hero,
         so fall back to the All Services grid — the page still has somewhere to go */
      if (allEl) allEl.style.display = (isAll || (!hasFolio && !hasPkgs)) ? "" : "none";
      if (catEl) catEl.style.display = (isAll || (!hasFolio && !hasPkgs)) ? "none" : "";
    }

    /* shared by selectCat()/viewPackages(): switches the active category and
       re-renders sidebar/portfolio/packages, without deciding where to scroll */
    function applyCategorySelection(id) {
      activeSidebar = id;
      if (id === "all") { current = "wedding"; } else { current = id; }
      renderSidebar(); renderFolio(); renderPackages();
      updateServiceSectionsVisibility();
    }
    const MOBILE_MQ = window.matchMedia("(max-width:760px)");
    /* On mobile, .main is its own independently scrollable column beside the sidebar
       (fixed-height .shell, overflow-y:auto), sitting below the app-switcher/header bar.
       Plain anchor.scrollIntoView() walks the WHOLE scrollable-ancestor chain, so it was
       also scrolling the outer window — pinning the header bar and scrolling the
       app-switcher off-screen, which is not wanted. Scroll only .main's own scrollTop on
       mobile instead; on desktop .main isn't a scroll container, so scrollIntoView (which
       scrolls the window, the actual scrolling element there) still applies as before. */
    function scrollToAnchor(anchor, behavior) {
      behavior = behavior || "smooth";
      if (MOBILE_MQ.matches) {
        const main = document.querySelector(".main");
        const delta = anchor.getBoundingClientRect().top - main.getBoundingClientRect().top;
        const offset = parseFloat(getComputedStyle(anchor).scrollMarginTop) || 0;
        main.scrollTo({ top: main.scrollTop + delta - offset, behavior });
      } else {
        anchor.scrollIntoView({ behavior, block: "start" });
      }
    }
    /* Sidebar clicks always land the visitor on that category's own product card(s)
       (portfolio + package grid) in the main column instead of booking anything on
       their behalf — including equipment-only categories (Drone, Candid Photography, ...),
       which used to skip straight to booking.html with no card ever shown. The visitor
       reviews the card(s) there and clicks one themselves (Book Now / the card image)
       when they're actually interested. */
    function selectCat(id) {
      applyCategorySelection(id);
      /* bring the newly-selected content into view (instead of jumping to the page top) —
         scroll-margin-top on the anchor keeps it clear of the sticky nav. "All Services"
         has no portfolio/packages of its own, so it scrolls to its own grid instead; a
         category with no portfolio of its own (most equipment-only ones) scrolls straight
         to its package card(s) since the portfolio anchor stays hidden for it. */
      const anchor = id === "all"
        ? document.getElementById("allServicesAnchor")
        : (FOLIO[current] && FOLIO[current].length ? document.getElementById("folioAnchor") : document.getElementById("pkgAnchor"));
      scrollToAnchor(anchor);
    }
    /* "View Packages" (hero-go button): same category switch as selectCat(), but scrolls
       straight to that service's package section instead of its portfolio */
    function viewPackages(id) {
      applyCategorySelection(id);
      scrollToAnchor(document.getElementById("pkgAnchor"));
    }

    /* ============ DETAIL VIEW ============ */
    /* builds the booking.html link. `pid` is this package's real database id -
       booking.html fetches the authoritative record from there instead of trusting
       the price/tier/feats below, which are only a display hint for the instant the
       page paints (fast first render) and are never what actually gets charged/booked.
       If the user queued an equipment add-on via the Explore modal, it gets
       automatically appended so booking.html pre-selects it. */
    function bookingURL(cat, idx) {
      const p = PACKAGES[cat][idx];
      const q = new URLSearchParams({
        pid: p.id,
        category: cat,
        package: p.title,
        tier: (p.tier || "").toLowerCase(),
        price: p.price,
        feats: p.feat.join("|")
      });
      if (window._pendingEquip) q.set("equip", window._pendingEquip);
      return "booking.html?" + q.toString();
    }
    function goBooking(cat, idx) { window.location.href = bookingURL(cat, idx); }

    function resolvePackageDetailImages(cat, pkg) {
      if (pkg && pkg.images && pkg.images.length) return pkg.images.map(cldOpt);

      // no dedicated package photos for this product — reuse its category hero
      // image (always exists) so the detail view never shows a broken thumbnail
      const mainImage = resolveCategoryImage(cat);
      return [mainImage, mainImage, mainImage];
    }

    function openDetail(cat, idx) {
      const p = PACKAGES[cat][idx];
      window._sel = { cat, idx };   /* remember selection for the detail CTA buttons */
      const catName = (CATEGORIES.find(c => c.id === cat) || {}).name || "Photography";
      document.getElementById("dCrumb").innerHTML = `Home / ${catName} / <b>${p.title}</b>`;
      document.getElementById("dTitle").textContent = p.title;
      document.getElementById("dSub").textContent = `${p.tier} package — professionally shot & edited by Sai Kumar Digital Lab & Studio.`;
      document.getElementById("dPrice").textContent = p.price;
      document.getElementById("dCtaPrice").textContent = p.price;
      document.getElementById("dHighlights").innerHTML = p.feat.map(f => `<li>${f}</li>`).join("");

      const imgs = resolvePackageDetailImages(cat, p);
      window._imgs = imgs;
      document.getElementById("thumbs").innerHTML = imgs.map((src, i) => `
    <div class="thumb ${i === 0 ? 'active' : ''}" onclick="setMain(${i})">
      <img class="thumb-photo" src="${src}" alt="view ${i + 1}" loading="${i === 0 ? 'eager' : 'lazy'}"
           onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
      <div class="ph">Image ${i + 1}<br>add photo</div>
    </div>`).join("");
      setMain(0);
      document.getElementById("detail").classList.add("open");
      document.body.style.overflow = "hidden";
    }
    function setMain(i) {
      document.querySelectorAll(".thumb").forEach((t, j) => t.classList.toggle("active", j === i));
      const box = document.getElementById("mainImg");
      box.querySelector(".main-photo")?.remove();
      const img = document.createElement("img");
      img.className = "main-photo"; img.src = window._imgs[i];
      img.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1";
      img.onerror = () => { img.remove(); document.getElementById("mainPh").style.display = "flex"; };
      img.onload = () => { document.getElementById("mainPh").style.display = "none"; };
      document.getElementById("mainPh").innerHTML = "Image " + (i + 1) + "<br>［ add photo ］";
      document.getElementById("mainPh").style.display = "flex";
      box.prepend(img);
    }
    function closeDetail() {
      document.getElementById("detail").classList.remove("open");
      document.body.style.overflow = "";
    }

    /* ============ HERO CAROUSEL ============ */
    /* one slide per service; clicking a slide opens that service's packages. HERO
       itself comes straight from the API's `hero[]` (data.hero in boot() below) -
       which categories appear here is an admin decision (the "Show in hero carousel"
       checkbox + a hero image being set on that category), not a hardcoded list. */
    let HERO = [];

    let heroIdx = 0, heroTimer = null, heroLastStepAt = 0;
    const HERO_STEP_COOLDOWN = 450; /* matches the smooth-scroll duration, so a rapid re-click can't land mid-transition and skip extra slides */
    const HERO_CLONE_COUNT = 2; /* matches the 2-slides-visible-at-a-time layout */
    /* leading clones (copies of the last slides) + real slides + trailing clones (copies of the
       first slides) let both forward AND backward wrap look like one short, continuous step
       instead of a long jump back across the whole track */
    let HERO_SLIDES = [];
    let heroPos = HERO_CLONE_COUNT; /* actual scroll position within HERO_SLIDES (real slide 0 sits at this offset) */
    let heroResetHandle = null;
    function heroRealPos(idx) { return HERO_CLONE_COUNT + idx; }

    // HERO_SLIDES depends on HERO, which starts empty and is only filled in once
    // boot() below has fetched the real data - this rebuilds the clone-padded slide
    // list from whatever HERO currently holds, and must run (from boot()) before
    // the first renderHero().
    function buildHeroSlides() {
      HERO_SLIDES = HERO.slice(-HERO_CLONE_COUNT).concat(HERO, HERO.slice(0, HERO_CLONE_COUNT));
      heroPos = HERO_CLONE_COUNT;
    }

    function renderHero() {
      document.getElementById("heroTrack").innerHTML = HERO_SLIDES.map((h, i) => `
    <div class="hero-slide" onclick="selectCat('${h.id}')">
      <img class="hero-img" src="${h.img}" alt="${h.title}" ${i === heroPos ? '' : 'loading="lazy"'}
           onerror="this.style.display='none'">
      <div class="grad"></div>
      <div class="scrim"></div>
      <div class="hero-body">
        <span class="hero-badge">★ ${h.title}</span>
        <h2>${h.title}</h2>
        <p>${h.tag}</p>
        <button class="hero-go" onclick="event.stopPropagation();viewPackages('${h.id}')">View Packages ›</button>
      </div>
    </div>`).join("");
      document.getElementById("heroDots").innerHTML = HERO.map((_, i) =>
        `<span class="${i === 0 ? 'on' : ''}" onclick="heroGo(${i})"></span>`).join("");
      heroPos = heroRealPos(heroIdx);
      document.getElementById("heroTrack").scrollTo({ left: heroPos * heroSlideWidth(), behavior: "instant" });
    }
    function heroSlideWidth() {
      const t = document.getElementById("heroTrack");
      const s = t.querySelector(".hero-slide");
      return s ? s.getBoundingClientRect().width + 16 : 0;
    }
    function updateHeroDots(activeIdx) {
      document.querySelectorAll("#heroDots span").forEach((d, j) => d.classList.toggle("on", j === activeIdx));
    }
    function clearHeroReset() {
      /* a step can start again before the previous loop-wrap reset has fired (cooldown is
         shorter than the reset delay) - apply the pending correction now instead of dropping
         it, otherwise heroPos drifts away from the track's real scroll position and the next
         step's scrollTo target is wrong, which looks like the carousel snapping back and forth
         and leaves the dots out of sync with what's actually on screen */
      if (heroResetHandle) { heroResetHandle.cancel(); heroResetHandle.flush(); heroResetHandle = null; }
    }
    /* once the auto-scroll settles on a cloned slide (visually identical to the real one),
       silently snap back to the matching real position with no animation so the loop never jumps */
    function scheduleHeroReset(expectedPos, realIdx, track) {
      const doReset = () => {
        heroResetHandle = null;
        if (heroPos !== expectedPos) return;
        heroPos = heroRealPos(realIdx);
        track.scrollTo({ left: heroPos * heroSlideWidth(), behavior: "instant" });
      };
      if ("onscrollend" in window) {
        const handler = () => { track.removeEventListener("scrollend", handler); doReset(); };
        track.addEventListener("scrollend", handler);
        heroResetHandle = { cancel: () => track.removeEventListener("scrollend", handler), flush: doReset };
      } else {
        const t = setTimeout(doReset, 550);
        heroResetHandle = { cancel: () => clearTimeout(t), flush: doReset };
      }
    }
    function heroGo(i) {
      clearHeroReset();
      heroIdx = ((i % HERO.length) + HERO.length) % HERO.length;
      heroPos = heroRealPos(heroIdx);
      document.getElementById("heroTrack").scrollTo({ left: heroPos * heroSlideWidth(), behavior: "smooth" });
      updateHeroDots(heroIdx);
    }
    function heroNext() {
      clearHeroReset();
      const track = document.getElementById("heroTrack");
      heroIdx = (heroIdx + 1) % HERO.length;
      heroPos += 1;
      track.scrollTo({ left: heroPos * heroSlideWidth(), behavior: "smooth" });
      updateHeroDots(heroIdx);
      const targetPos = heroRealPos(heroIdx);
      if (heroPos !== targetPos) scheduleHeroReset(heroPos, heroIdx, track);
    }
    function heroPrev() {
      clearHeroReset();
      const track = document.getElementById("heroTrack");
      heroIdx = (heroIdx - 1 + HERO.length) % HERO.length;
      heroPos -= 1;
      track.scrollTo({ left: heroPos * heroSlideWidth(), behavior: "smooth" });
      updateHeroDots(heroIdx);
      const targetPos = heroRealPos(heroIdx);
      if (heroPos !== targetPos) scheduleHeroReset(heroPos, heroIdx, track);
    }
    function heroStep(dir) {
      const now = Date.now();
      if (now - heroLastStepAt < HERO_STEP_COOLDOWN) return; /* ignore extra clicks until the current slide finishes moving */
      heroLastStepAt = now;
      if (dir > 0) { heroNext(); } else { heroPrev(); }
      restartHeroTimer();
    }
    let heroHovering = false;
    function startHeroTimer() {
      clearInterval(heroTimer);
      if (heroHovering) return; /* don't (re)arm autoplay while the cursor is still over the carousel */
      heroTimer = setInterval(heroNext, 4000); /* matches Studio Services' hero carousel autoplay interval */
    }
    function restartHeroTimer() { startHeroTimer(); }
    /* pause on hover — also covers the case where the page loads (or the carousel first
       renders) with the cursor already sitting over it, since mouseenter never fires then */
    function initHeroHover() {
      const h = document.querySelector(".hero");
      heroHovering = h.matches(":hover");
      h.addEventListener("mouseenter", () => { heroHovering = true; clearInterval(heroTimer); });
      h.addEventListener("mouseleave", () => { heroHovering = false; startHeroTimer(); });
      /* let a normal vertical mouse-wheel scroll move the page as usual instead of the
         browser redirecting it into the horizontal carousel just because the cursor is over it */
      document.getElementById("heroTrack").addEventListener("wheel", (e) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault();
          window.scrollBy(0, e.deltaY);
        }
      }, { passive: false });
    }

    /* ---------- PORTFOLIO AUTO-SCROLL ---------- */
    /* pure-CSS marquee (see .folio-track/@keyframes folioMarquee): constant linear speed,
       no JS-driven repositioning, so there's nothing to stutter or snap mid-animation */
    const FOLIO_SPEED = 65; /* px/sec, applied uniformly to every service via renderFolio() */

    /* ---------- MOBILE BOTTOM NAV ---------- */
    function setActiveBottomNav(el) {
      document.querySelectorAll(".bottom-nav-item").forEach(i => i.classList.remove("active"));
      el.classList.add("active");
    }

    /* ---------- MOBILE HEADER BAR: reliable pin-on-scroll ----------
       CSS position:sticky is kept as the baseline, but some Chromium builds fail to
       repaint a sticky element in its stuck position during real wheel/touch scrolling
       (it stays correctly positioned for layout/hit-testing, just not visually repainted).
       This mirrors sticky behavior manually with position:fixed, which doesn't rely on
       that per-scroll compositor recalculation, so it stays reliably visible. */
    function initMobileHeaderPin() {
      const bar = document.getElementById("mobileHeaderBar");
      const spacer = document.getElementById("mobileHeaderBarSpacer");
      const appSwitcher = document.querySelector(".mobile-app-switcher");
      if (!bar || !spacer || !appSwitcher) return;
      const mq = window.matchMedia("(max-width:760px)");
      let pinned = false, ticking = false;
      function apply() {
        ticking = false;
        if (!mq.matches) {
          if (pinned) { bar.classList.remove("js-pinned"); spacer.style.display = "none"; pinned = false; }
          return;
        }
        const shouldPin = window.scrollY >= appSwitcher.offsetHeight;
        if (shouldPin && !pinned) {
          spacer.style.height = bar.offsetHeight + "px";
          spacer.style.display = "block";
          bar.classList.add("js-pinned");
          pinned = true;
        } else if (!shouldPin && pinned) {
          bar.classList.remove("js-pinned");
          spacer.style.display = "none";
          pinned = false;
        }
      }
      function onScrollOrResize() {
        if (!ticking) { ticking = true; requestAnimationFrame(apply); }
      }
      window.addEventListener("scroll", onScrollOrResize, { passive: true });
      window.addEventListener("resize", onScrollOrResize);
      apply();
    }

    /* Equipment-only categories (Drone/Traditional Videography/Candid Photography/...)
       used to carry their own hardcoded crew/hours/gear/deliverables/gallery here and
       show them in a popup before booking. That data now lives in the database as each
       category's single (non-tiered) PACKAGES entry (see backend/app/seed.py
       EQUIPMENT_PRODUCTS) and no preview popup exists any more — clicking one of these
       categories books its one real product directly, same as any other package. */
    function directBookEquip(id) {
      const pkgs = PACKAGES[id];
      if (pkgs && pkgs.length) {
        goBooking(id, 0);
        return;
      }
      // catalog not loaded yet, or this category genuinely has no product yet (e.g. an
      // admin just created it) — fall back to browsing it instead of booking nothing
      applyCategorySelection(id);
      scrollToAnchor(document.getElementById("folioAnchor"));
    }

    /* Called when user clicks "Book X for Your Event" inside the Equipment modal.
       Stores the equipment as a pending add-on, shows the sticky banner,
       then scrolls down to the Functions (event packages) grid so the user
       can pick the event they actually want to book. */
    function bookEquipForEvent(id) {
      const item = CATEGORIES.find(c => c.id === id);
      if (!item) return;

      // Store pending equip globally
      window._pendingEquip = id;

      // Update and show the banner
      document.getElementById("pbIcon").textContent  = item.icon;
      document.getElementById("pbTitle").textContent = item.name + " — Add-on Queued ✅";
      const banner = document.getElementById("pendingEquipBanner");
      banner.style.display = "flex";
      document.body.classList.add("has-pending-banner");

      // Switch to All Services view so user can pick an event
      applyCategorySelection("all");
      updateServiceSectionsVisibility();

      // Scroll to the Functions group (event packages grid)
      setTimeout(() => {
        const functionsLabel = document.querySelector(".all-services-group-label");
        if (functionsLabel) scrollToAnchor(functionsLabel);
      }, 120);
    }

    function clearPendingEquip() {
      window._pendingEquip = null;
      document.getElementById("pendingEquipBanner").style.display = "none";
      document.body.classList.remove("has-pending-banner");
    }

    function closeEquipModal(e) {
      if (e && e.target !== document.getElementById("equipModal") && !e.target.classList.contains("equip-modal-close")) return;
      document.getElementById("equipModal").style.display = "none";
      document.body.style.overflow = "";
    }

    /* ============ BOOT ============
       Everything above is rendering code operating on module-level data (CATEGORIES/
       PACKAGES/FOLIO/FOLIO_TITLES/CATEGORY_IMAGES/HERO) that starts empty. This fetches
       that data from the database-backed API and fills it in before running the exact
       same init sequence this page always ran - only the data source changed. */
    const PHOTOGRAPHY_API_BASE = window.SAI_API_BASE || "http://localhost:8000";

    async function boot() {
      try {
        const res = await fetch(`${PHOTOGRAPHY_API_BASE}/api/catalog/photography`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        CATEGORIES = [ALL_CATEGORY, ...data.categories];
        PACKAGES = data.packages;
        FOLIO = data.folio;
        FOLIO_TITLES = data.folio_titles;
        CATEGORY_IMAGES = data.category_images;
        HERO = data.hero;
        buildHeroSlides();
      } catch (err) {
        console.error("Failed to load the photography catalog:", err);
        const sidebar = document.getElementById("desktopSidebar");
        if (sidebar) sidebar.innerHTML = '<div style="padding:16px;color:#b91c1c;">Could not load services right now. Please refresh the page.</div>';
        return;
      }

      /* init */
      renderHero(); initHeroHover(); startHeroTimer();
      initMobileHeaderPin();
      renderAllServices();

      /* deep-link & modal URL support */
      const urlParams = new URLSearchParams(location.search);
      const openGallery = urlParams.get("openGallery");
      const deepLinkCat = urlParams.get("category");
      const deepLinkItem = urlParams.get("item");

      if (deepLinkCat && CATEGORIES.some(c => c.id === deepLinkCat)) {
        applyCategorySelection(deepLinkCat);
        /* land straight on that category's portfolio/packages (same anchor selectCat()
           scrolls to on click) instead of leaving the visitor at the top hero slider —
           a ?category= link is meant to show that category's products, not the slider. */
        const anchor = deepLinkCat === "all"
          ? document.getElementById("allServicesAnchor")
          : (FOLIO[deepLinkCat] && FOLIO[deepLinkCat].length ? document.getElementById("folioAnchor") : document.getElementById("pkgAnchor"));
        if (anchor) scrollToAnchor(anchor, "auto");
      } else {
        renderSidebar(); renderFolio(); renderPackages();
      }
      updateServiceSectionsVisibility();

      /* Only ever auto-open the portfolio modal when a link explicitly asks for it with
         openGallery=true. It used to open for ANY ?category= link too, so arriving from
         the home page's service links, "Change package" on booking.html/booking-form.html
         or equipment-details.html popped the Wedding portfolio modal open on its own,
         with nothing clicked. Those links still select the category below — they just
         no longer force the modal. (gallery.html used to be the page that set
         openGallery=true before redirecting here; it was dead code - always redirected
         before rendering - and was removed, but this page's own handling of the query
         param is unrelated and still works exactly as before for whatever else sets it.) */
      if (openGallery === "true") {
        const catToOpen = deepLinkCat || "wedding";
        const itemToOpen = deepLinkItem ? parseInt(deepLinkItem, 10) : 0;
        setTimeout(() => {
          openGalleryModal(catToOpen, itemToOpen);
        }, 150);
      }
    }
    boot();

    (function initMobilePromoSlider() {
      function init() {
        const track = document.getElementById('photographyPromoTrack');
        const dots = document.querySelectorAll('#photographyPromoDots .promo-hero-dot');
        if (!track || !dots.length) return;

        const slideCount = 4;
        const totalSlots = slideCount + 2;
        const slotWidth = 100 / totalSlots;
        let pos = 1;
        let timer;

        function goTo(p, animate) {
          track.style.transition = animate === false ? 'none' : 'transform .7s cubic-bezier(.65,0,.35,1)';
          track.style.transform = 'translateX(-' + (p * slotWidth) + '%)';
          const realIndex = ((p - 1) % slideCount + slideCount) % slideCount;
          dots.forEach((d, di) => d.classList.toggle('active', di === realIndex));
        }

        function next() {
          pos++;
          goTo(pos);
        }

        track.addEventListener('transitionend', (e) => {
          if (e.target !== track || e.propertyName !== 'transform') return;
          if (pos >= totalSlots - 1) {
            pos = 1;
            goTo(pos, false);
          } else if (pos <= 0) {
            pos = slideCount;
            goTo(pos, false);
          }
        });

        function startAutoplay() {
          clearInterval(timer);
          timer = setInterval(next, 3000);
        }

        dots.forEach((dot) => {
          dot.addEventListener('click', () => {
            pos = parseInt(dot.dataset.i, 10) + 1;
            goTo(pos);
            startAutoplay();
          });
        });

        goTo(pos, false);
        startAutoplay();
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }
    })();
  