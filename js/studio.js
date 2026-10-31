let categoriesData = {};

let currentCategory = "all";
let searchQuery = "";

// Applies Cloudinary's auto-format/auto-quality transformation to any Cloudinary
// delivery URL right before it's rendered. No-op for non-Cloudinary URLs (local
// paths, icons8.com, data:/blob: URIs), so it's safe to wrap any image-url

/* ================= DESKTOP FILTER BAR STATE ================= */
const categoryDefaultTurnaround = {
  photo_printing: "30 min",
  photo_lamination: "20 min",
  photo_restoration: "1 day",
  photo_portrait: "1 hour",
  id_card_printing: "45 min",
  certificate_printing: "30 min",
  scanning: "20 min",
  cd_dvd_copying: "1 hour"
};

/* ================= DESKTOP HERO CAROUSEL (SLIDES PER SERVICE) ================= */
const heroBadgesHTML = `
  <div class="hero-banner-badges">
    <span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <path d="M12 6v6l4 2"></path>
      </svg>
      24H Delivery
    </span>
    <span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2l2.6 6.6 7 .5-5.4 4.5 1.8 6.9L12 16.9 5.9 20.5l1.8-6.9L2.3 9.1l7-.5z"></path>
      </svg>
      Premium Quality
    </span>
    <span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="10" rx="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
      </svg>
      Secure Payment
    </span>
  </div>
`;

const heroSlideBanners = {
  photo_printing: { src: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/studio_assets/slide-images/photo_printing.png", bg: "#7a0f3d" },
  photo_lamination: { src: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/studio_assets/slide-images/photo-lamination.png", bg: "#64b5f6" },
  photo_restoration: { src: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/studio_assets/slide-images/photo-restoration.png", bg: "#9acb9a" },
  photo_portrait: { src: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/studio_assets/slide-images/photo-editing.png", bg: "#fce9cc" },
  id_card_printing: { src: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/studio_assets/slide-images/id-card-printing.png", bg: "#0c2b18" },
  certificate_printing: { src: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/studio_assets/slide-images/certificate-printing.png", bg: "#1a1408" },
  scanning: { src: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/studio_assets/slide-images/scanning.png", bg: "#c81e2c" },
  cd_dvd_copying: { src: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/studio_assets/slide-images/cd-dvd-copying.png", bg: "#d7edb0" },
  xerox_printing: { src: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/legacy/ChatGPT_Image_Aug_31_2026_11_00_54_PM.png", bg: "#f7ede0" }
};

function getHeroSlides() {
  const slides = [{
    key: "all",
    title: "Studio Services",
    desc: "One-stop solution for all your photography and printing needs. Professional quality, fast delivery and affordable prices.",
    img: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/assets/studio_camera_setup.jpg",
    banner: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/studio_assets/slide-images/all-services.png",
    bannerBg: "#f7ede0"
  }];
  Object.keys(categoriesData).forEach(key => {
    const cat = categoriesData[key];
    const bannerInfo = heroSlideBanners[key];
    const bannerSrc = (bannerInfo && typeof bannerInfo === 'object') ? bannerInfo.src : bannerInfo;
    const bannerBg = (bannerInfo && typeof bannerInfo === 'object') ? bannerInfo.bg : null;
    slides.push({ key, title: cat.title, desc: cat.desc, img: cat.icon, banner: bannerSrc, bannerBg: bannerBg });
  });
  return slides;
}

const HERO_SLIDES_VISIBLE = 2;
const HERO_SLIDE_GAP = 16;

let heroSlides = [];
let heroSlideIndex = 0;
let heroMaxIndex = 0;
let heroCarouselTimer = null;
let heroTransitioning = false;

function renderHeroSlideHTML(slide, eager) {
  const lazyAttr = eager ? '' : ' loading="lazy"';
  return slide.banner ? `
    <div class="hero-slide hero-slide-banner" onclick="switchCategory('${slide.key}')" style="${slide.bannerBg ? `background-color: ${slide.bannerBg};` : ''}">
      <img src="${fullImg(slide.banner)}" alt="${slide.title}"${lazyAttr} style="${slide.bannerBg ? `background: ${slide.bannerBg};` : ''}">
    </div>
  ` : `
    <div class="hero-slide" onclick="switchCategory('${slide.key}')">
      <div class="hero-banner-text">
        <h1>${slide.title}</h1>
        <p>${slide.desc}</p>
        ${heroBadgesHTML}
      </div>
      <div class="hero-banner-image">
        <img src="${fullImg(slide.img)}" alt="${slide.title}"${lazyAttr}>
      </div>
    </div>
  `;
}

function buildHeroCarousel() {
  heroSlides = getHeroSlides();
  const track = document.getElementById('heroCarouselTrack');
  const dots = document.getElementById('heroCarouselDots');
  if (!track || !dots) return;

  heroMaxIndex = Math.max(0, heroSlides.length - HERO_SLIDES_VISIBLE);

  // Clone the tail before the first real slide and the head after the last real
  // slide so stepping past either end can keep sliding in the same direction —
  // the clone visually duplicates the real slide it wraps to, so the reset back
  // to the real index (done with transitions disabled) is imperceptible.
  const extendedSlides = [
    ...heroSlides.slice(-HERO_SLIDES_VISIBLE),
    ...heroSlides,
    ...heroSlides.slice(0, HERO_SLIDES_VISIBLE)
  ];
  track.innerHTML = extendedSlides.map((slide, i) =>
    renderHeroSlideHTML(slide, i >= HERO_SLIDES_VISIBLE && i < HERO_SLIDES_VISIBLE * 2)
  ).join('');

  dots.innerHTML = Array.from({ length: heroMaxIndex + 1 }, (_, i) => `
    <span class="hero-dot ${i === 0 ? 'active' : ''}" onclick="event.stopPropagation(); goToHeroSlide(${i}, true)"></span>
  `).join('');

  if (!track.dataset.transitionBound) {
    track.addEventListener('transitionend', handleHeroTransitionEnd);
    track.dataset.transitionBound = '1';
  }

  heroSlideIndex = 0;
  heroTransitioning = false;
  track.style.transition = 'none';
  updateHeroCarouselPosition();
  void track.offsetHeight;
  track.style.transition = '';
  startHeroAutoplay();
}

function updateHeroCarouselPosition() {
  const track = document.getElementById('heroCarouselTrack');
  const firstSlide = track ? track.querySelector('.hero-slide') : null;
  if (!track || !firstSlide) return;
  const step = firstSlide.getBoundingClientRect().width + HERO_SLIDE_GAP;
  const extIndex = heroSlideIndex + HERO_SLIDES_VISIBLE;
  track.style.transform = `translateX(-${extIndex * step}px)`;

  const dotSpan = heroMaxIndex + 1;
  const dotIndex = ((heroSlideIndex % dotSpan) + dotSpan) % dotSpan;
  document.querySelectorAll('.hero-dot').forEach((d, i) => d.classList.toggle('active', i === dotIndex));
}

function goToHeroSlide(i, userInitiated) {
  if (!heroSlides.length) return;
  heroTransitioning = false;
  heroSlideIndex = i;
  updateHeroCarouselPosition();
  if (userInitiated) startHeroAutoplay();
}

function stepHeroSlide(direction, userInitiated) {
  if (!heroSlides.length || heroTransitioning) return;
  heroTransitioning = true;
  heroSlideIndex += direction;
  updateHeroCarouselPosition();
  if (userInitiated) startHeroAutoplay();
}

function handleHeroTransitionEnd(e) {
  if (e.target !== e.currentTarget || e.propertyName !== 'transform') return;
  heroTransitioning = false;
  const track = e.currentTarget;

  if (heroSlideIndex >= heroSlides.length) {
    // Reached the appended clone of the first slide(s) — content is identical
    // to index 0, so resetting here (transition disabled) is invisible.
    track.style.transition = 'none';
    heroSlideIndex = 0;
    updateHeroCarouselPosition();
    void track.offsetHeight;
    track.style.transition = '';
  } else if (heroSlideIndex <= -HERO_SLIDES_VISIBLE) {
    // Reached the prepended clone of the last slide(s) — content is identical
    // to heroMaxIndex, so resetting here is invisible.
    track.style.transition = 'none';
    heroSlideIndex = heroMaxIndex;
    updateHeroCarouselPosition();
    void track.offsetHeight;
    track.style.transition = '';
  }
}

function heroCarouselNext() {
  stepHeroSlide(1, true);
}

function heroCarouselPrev() {
  stepHeroSlide(-1, true);
}

function startHeroAutoplay() {
  clearInterval(heroCarouselTimer);
  heroCarouselTimer = setInterval(() => stepHeroSlide(1, false), 4000);
}

let filterState = { sort: "popular" };

function setSortFilter(value) {
  filterState.sort = value;
  renderContent();
}

function applyFilters(packages) {
  let result = packages.slice();

  if (filterState.sort === "lowToHigh") {
    result.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
  } else if (filterState.sort === "highToLow") {
    result.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
  }

  return result;
}

function initSidebar() {
  const keys = Object.keys(categoriesData);

  // Desktop Sidebar
  let sidebarHTML = `
    <div class="sidebar-item ${currentCategory === 'all' ? 'active' : ''}" onclick="switchCategory('all', false)" data-key="all">
      <img src="https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/studio_assets/side-bar-icons/all-services.png" alt="All Studio Services">
      <span>All Services</span>
    </div>
  `;
  sidebarHTML += keys.map(key => {
    const cat = categoriesData[key];
    return `
      <div class="sidebar-item ${key === currentCategory ? 'active' : ''}" onclick="switchCategory('${key}', false)" data-key="${key}">
        <img src="${cldOpt(cat.icon)}" alt="${cat.title}" loading="lazy">
        <span>${cat.title}</span>
      </div>
    `;
  }).join('');
  document.getElementById('desktopSidebar').innerHTML = `<div class="sidebar-sticky-inner">${sidebarHTML}</div>`;

  // Mobile Scrolling Bar
  let mobileHTML = `
    <div class="mobile-cat-item ${currentCategory === 'all' ? 'active' : ''}" onclick="switchCategory('all', false)" data-mkey="all">
      <img src="https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/studio_assets/side-bar-icons/all-services.png" alt="All Studio Services">
      <span>All Services</span>
    </div>
  `;
  mobileHTML += keys.map(key => {
    const cat = categoriesData[key];
    return `
      <div class="mobile-cat-item ${key === currentCategory ? 'active' : ''}" onclick="switchCategory('${key}', false)" data-mkey="${key}">
        <img src="${cldOpt(cat.icon)}" alt="${cat.title}" loading="lazy">
        <span>${cat.title}</span>
      </div>
    `;
  }).join('');
  document.getElementById('mobileCatScroll').innerHTML = mobileHTML;
}

/* Text-node escaping only - textContent -> innerHTML escapes & < > but NOT
   quotes, so this is safe between tags and NOT safe inside an attribute value.
   Use escapeAttr() there. */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* Attribute-value escaping. Product titles and category names come from the
   live catalog and have no character validation, so one containing a double
   quote would close an attribute early (data-mega-name=, alt=) and let the rest
   of the string become live markup. Same quote-safe form the rest of the
   storefront already uses (cart.js's escapeHtml, my-orders.js's escapeOrdAttr). */
function escapeAttr(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function buildCategoryMegaMenus() {
  document.querySelectorAll('.menu-mega-dropdown').forEach(dd => {
    const key = dd.dataset.megaKey;
    const cat = categoriesData[key];
    if (!cat) return;

    const linksHTML = cat.packages.map(pkg => `
      <a href="javascript:void(0)" class="mega-link" data-mega-name="${escapeAttr(pkg.name)}">
        ${escapeHtml(pkg.name)}
        ${pkg.badge ? `<span class="mega-badge">${escapeHtml(pkg.badge)}</span>` : ''}
      </a>
    `).join('');

    const banner = heroSlideBanners[key];
    const startingPrice = Math.min(...cat.packages.map(p => parsePrice(p.price)));

    dd.innerHTML = `
      <div class="mega-col">
        <h4>${escapeHtml(cat.title)}</h4>
        ${linksHTML}
      </div>
      <a href="javascript:void(0)" class="mega-promo" data-mega-viewall>
        <img src="${cldOpt(banner ? banner.src : cat.icon)}" alt="${escapeAttr(cat.title)}" loading="lazy">
        <div class="mega-promo-text">
          <strong>${escapeHtml(cat.title)}</strong>
          <span>Starting at &#8377;${startingPrice}</span>
        </div>
      </a>
    `;

    dd.addEventListener('click', (e) => {
      const link = e.target.closest('.mega-link');
      const viewAll = e.target.closest('[data-mega-viewall]');
      if (link) {
        switchCategory(key);
        const idx = currentPackages.findIndex(p => p.name === link.dataset.megaName);
        if (idx >= 0) openProductPreview(idx);
      } else if (viewAll) {
        switchCategory(key);
      }
    });
  });
}

// The menu bar itself comes from admin > Menu (js/shared/site-menu.js) and can be
// redrawn after this page has set up - each redraw brings back empty automatic
// dropdowns and no active link, so refill/re-mark them. Before the catalog has
// loaded, buildCategoryMegaMenus() simply skips them; init fills them later.
document.addEventListener('sitemenu:rendered', () => {
  buildCategoryMegaMenus();
  document.querySelectorAll('.menu-cat-link').forEach(el => {
    el.classList.toggle('active', el.dataset.key === currentCategory);
  });
});

// Dynamically measures the sticky header (same idea as corporate.js's
// getScrollOffset()) so the jump to categoryHeader clears it instead of
// landing partly hidden underneath.
function getStudioScrollOffset() {
  const header = document.querySelector('.header-sticky-wrap');
  return (header ? header.offsetHeight : 0) + 12;
}

// Brings the selected category's title/packages into view instead of leaving
// the visitor at the hero carousel above it (which cycles through every
// category, not just the one just selected).
function scrollToStudioCategory(behavior) {
  const target = document.getElementById('categoryHeader');
  if (!target) return;
  const y = target.getBoundingClientRect().top + window.pageYOffset - getStudioScrollOffset();
  window.scrollTo({ top: Math.max(0, y), behavior: behavior || 'smooth' });
}

function switchCategory(key, syncTopNav = true) {
  if (key !== 'all' && !categoriesData[key]) return;
  currentCategory = key;

  document.querySelectorAll('.sidebar-item').forEach(el => {
    el.classList.toggle('active', el.dataset.key === key);
  });
  document.querySelectorAll('.mobile-cat-item').forEach(el => {
    el.classList.toggle('active', el.dataset.mkey === key);
  });
  if (syncTopNav) {
    document.querySelectorAll('.menu-cat-link').forEach(el => {
      el.classList.toggle('active', el.dataset.key === key);
    });
  }

  const url = new URL(window.location);
  url.searchParams.set('category', key);
  window.history.pushState({}, '', url);

  renderContent();
  scrollToStudioCategory('smooth');
}

function renderContent() {
  let title = "";
  let desc = "";
  let packages = [];
  // Only meaningful when searchQuery is set - how many of `packages` (the ones
  // at the front) are actual matches, for the "Best Match" badge below.
  let matchCount = 0;

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    let allPackages = [];
    Object.keys(categoriesData).forEach(k => {
      allPackages = allPackages.concat(categoriesData[k].packages.map(p => ({ ...p, _catKey: k })));
    });
    const isMatch = pkg => pkg.name.toLowerCase().includes(q) || pkg.subtitle.toLowerCase().includes(q) ||
      (pkg.search_keywords && pkg.search_keywords.join(' ').toLowerCase().includes(q));
    // Matches float to the top instead of hiding every other service - a query
    // only a couple of packages are tagged with used to leave the whole grid
    // looking empty. Sort (price/etc) applies within each group separately so
    // it can't scramble matches back in among the rest.
    const matches = applyFilters(allPackages.filter(isMatch));
    const others = applyFilters(allPackages.filter(p => !isMatch(p)));
    packages = matches.concat(others);
    matchCount = matches.length;
    title = `Search results for "${searchQuery}"`;
    desc = matches.length
      ? `${matches.length} service${matches.length === 1 ? '' : 's'} match your search.`
      : "No services matched your search. Try a different keyword.";
  } else if (currentCategory === 'all') {
    title = "All Studio Services";
    desc = "Discover our comprehensive suite of quick passport photos, document prints, photo enlargements, photocopying, scanning, lamination, and graphic design.";
    const keys = Object.keys(categoriesData);
    keys.forEach(k => {
      packages = packages.concat(categoriesData[k].packages.map(p => ({ ...p, _catKey: k })));
    });
    packages = applyFilters(packages);
  } else {
    const cat = categoriesData[currentCategory];
    title = cat.title;
    desc = cat.desc;
    packages = cat.packages.map(p => ({ ...p, _catKey: currentCategory }));
    packages = applyFilters(packages);
  }

  // Header
  document.getElementById('catTitle').textContent = title;
  document.getElementById('catDesc').textContent = desc;

  // Packages
  currentPackages = packages;
  const packagesHTML = packages.map((pkg, idx) => {
    const isSearchMatch = searchQuery && idx < matchCount;
    return `
    <div class="pkg-card${isSearchMatch ? ' search-match' : ''}">
      <div class="pkg-image-wrap" onclick="openProductPreview(${idx})">
        <img class="pkg-image" src="${cldOpt(pkg.img)}" alt="${pkg.name}" loading="lazy" onerror="this.onerror=null;this.src=(window.SkLoading&&window.SkLoading.PLACEHOLDER_IMG)||'';">
        ${isSearchMatch ? `<span class="pkg-ribbon pkg-ribbon-bestseller">Best Match</span>` : (pkg.badge ? `<span class="pkg-ribbon pkg-ribbon-${pkg.badge.toLowerCase()}">${pkg.badge}</span>` : '')}
        ${!isSearchMatch && pkg.tag ? `<span class="pkg-badge">${escapeHtml(pkg.tag)}</span>` : ''}
        <button type="button" class="pkg-wishlist-btn" aria-label="Save" onclick="event.stopPropagation(); this.classList.toggle('active')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"></path>
          </svg>
        </button>
      </div>
      <div class="pkg-body" onclick="openProductPreview(${idx})">
        <h3>${pkg.name}</h3>
        <div class="pkg-meta-row">
          ${pkg.oldPrice
            ? `<span class="pkg-price">${pkg.price}</span>
               <span class="pkg-old-price">${pkg.oldPrice}</span>
               <span class="pkg-discount-badge">${Math.round((1 - parsePrice(pkg.price) / parsePrice(pkg.oldPrice)) * 100)}% off</span>`
            : `<span class="pkg-price">${pkg.price}</span>`}
        </div>
      </div>
    </div>
  `;
  }).join('');
  const packagesGridEl = document.getElementById('packagesGrid');
  packagesGridEl.innerHTML = packagesHTML;
  if (window.SkLoading) {
    packagesGridEl.querySelectorAll('.pkg-image-wrap img').forEach(img => {
      window.SkLoading.wireImage(img, { wrap: img.closest('.pkg-image-wrap') });
    });
  }
}

function orderNowFromCard(idx) {
  const pkg = currentPackages[idx];
  if (!pkg) return;
  if (pkg.requiresPhotoUpload || (pkg.input_fields && pkg.input_fields.length)) {
    openProductPreview(idx);
    return;
  }
  addToStudioCart(pkg.name, pkg.price, pkg.img, null, null, pkg.id, 1,
    `studio.html?category=${encodeURIComponent(currentCategory)}&openProduct=${encodeURIComponent(pkg.name)}${pkg.id ? `&pid=${encodeURIComponent(pkg.id)}` : ''}`);
  location.href = 'cart.html';
}

/* ================= PRODUCT PREVIEW MODAL ================= */
let currentPackages = [];
let activePreviewPkg = null;
let activePreviewImgIdx = 0;
let activePreviewQtyOption = null;
let activePreviewPurpose = "";
let activePreviewPhotoFile = null;
let activePreviewItemQty = 1;

function openProductPreview(idx, opts = {}) {
  const pkg = currentPackages[idx];
  if (!pkg) return;
  activePreviewPkg = pkg;
  activePreviewImgIdx = 0;
  activePreviewItemQty = 1;
  document.getElementById('previewItemQty').textContent = '1';

  const images = pkg.images && pkg.images.length ? pkg.images : [pkg.img];
  // Photos first, then any clip the admin attached - see js/shared/product-media.js
  // for why videos are kept out of `images` rather than appended to it upstream.
  const galleryItems = ProductMedia.build(images, pkg.videos, pkg.images && pkg.images.length ? pkg.fullImages : null);
  const highlights = pkg.highlights && pkg.highlights.length
    ? pkg.highlights
    : ["High-Quality Output", "Premium Paper Stock", "Quick Studio Handover"];

  const catTitle = document.getElementById('catTitle').textContent;
  document.getElementById('previewBreadcrumb').innerHTML =
    `<a href="javascript:void(0)" onclick="closeProductPreview()">Home</a> / ${catTitle} / ${pkg.name}`;

  document.getElementById('previewTitle').textContent = pkg.name;
  // pkg.subtitle is the product's description (see the mapping further down).
  // It used to be printed twice - once as a grey line under the title and again
  // here in the Description accordion - so the subtitle line is gone and this is
  // the single place it appears, matching the gifts and corporate product views.
  // pkg.subtitle itself stays: search and the share sheet still read it.
  document.getElementById('previewDescriptionContent').textContent = pkg.subtitle;
  document.getElementById('previewPrice').textContent = pkg.price;
  document.getElementById('previewActionPrice').textContent = pkg.price;

  const oldPriceEl = document.getElementById('previewOldPrice');
  const discountEl = document.getElementById('previewDiscountPercent');
  if (pkg.oldPrice) {
    oldPriceEl.textContent = pkg.oldPrice;
    oldPriceEl.style.display = 'inline';
    const oldNum = parsePrice(pkg.oldPrice);
    const newNum = parsePrice(pkg.price);
    const percentOff = Math.round((1 - newNum / oldNum) * 100);
    discountEl.textContent = `${percentOff}% off`;
    // '' rather than 'inline' for the same reason as the gallery dots below:
    // the shared product-view stylesheet renders this as an inline-flex pill,
    // and an inline display set here would beat that and knock the pill's
    // centring out. This line only decides shown vs hidden.
    discountEl.style.display = '';
  } else {
    oldPriceEl.style.display = 'none';
    discountEl.style.display = 'none';
  }

  renderPreviewOptions(pkg);

  const galleryEl = document.getElementById('previewGallery');
  // controls (not autoplay) and preload="metadata": the clip is one slide in a
  // carousel the visitor may never scroll to, so it costs a header until played.
  galleryEl.innerHTML = galleryItems.map((item, i) => item.type === 'video'
    ? `<video src="${cldOpt(item.url)}" class="preview-slide preview-slide-video" controls playsinline preload="metadata" aria-label="${pkg.name} video"></video>`
    : `<img src="${fullImg(item.full || item.url)}" class="preview-slide" data-slide-index="${i}" alt="${pkg.name} view ${i + 1}" loading="${i === 0 ? 'eager' : 'lazy'}" onerror="this.onerror=null;this.src=(window.SkLoading&&window.SkLoading.PLACEHOLDER_IMG)||'';">`
  ).join('');

  document.getElementById('previewDots').innerHTML = galleryItems.map((item, i) => `
    <span class="preview-dot ${i === 0 ? 'active' : ''}" onclick="scrollPreviewTo(${i})"></span>
  `).join('');
  // '' (not 'flex') so the stylesheet decides whether dots are shown at all:
  // css/shared/product-view.css hides them, because the thumbnail rail is the
  // shared way to switch photos across all three product views. An inline
  // 'flex' here would beat that rule and this page would show dots AND
  // thumbnails together. Only the single-image case is decided here - one
  // photo needs no switcher of either kind.
  document.getElementById('previewDots').style.display = galleryItems.length > 1 ? '' : 'none';

  const thumbRailEl = document.getElementById('previewThumbRail');
  thumbRailEl.innerHTML = galleryItems.map((item, i) => item.type === 'video'
    ? `<span class="preview-thumb preview-thumb-video ${i === 0 ? 'active' : ''}" onclick="scrollPreviewTo(${i})" role="button" tabindex="0" aria-label="${pkg.name} video"><video src="${cldOpt(item.url)}" muted playsinline preload="metadata"></video><span class="preview-thumb-play"></span></span>`
    : `<img src="${cldOpt(item.url)}" class="preview-thumb ${i === 0 ? 'active' : ''}" onclick="scrollPreviewTo(${i})" alt="${pkg.name} thumbnail ${i + 1}" loading="${i === 0 ? 'eager' : 'lazy'}" onerror="this.onerror=null;this.src=(window.SkLoading&&window.SkLoading.PLACEHOLDER_IMG)||'';">`
  ).join('');
  if (window.SkLoading) {
    // img only - wireImage attaches load/error handlers that mean nothing on a
    // <video>, and the skeleton class it adds would sit over the clip forever.
    galleryEl.querySelectorAll('img.preview-slide').forEach(img => window.SkLoading.wireImage(img));
    thumbRailEl.querySelectorAll('img.preview-thumb').forEach(img => window.SkLoading.wireImage(img));
  }
  // Click a photo to open it full screen with zoom (ProductFields.openImageViewer).
  galleryEl.onclick = (event) => {
    const slide = event.target.closest('img.preview-slide');
    if (!slide || !window.ProductFields || !ProductFields.openImageViewer) return;
    const photos = galleryItems.filter(item => item.type !== 'video');
    const clicked = galleryItems[Number(slide.dataset.slideIndex)];
    ProductFields.openImageViewer({
      label: `${pkg.name} photos`,
      index: Math.max(0, photos.indexOf(clicked)),
      items: photos.map(item => ({ url: fullImg(item.full || item.url), thumb: cldOpt(item.url) })),
    });
  };

  galleryEl.scrollLeft = 0;
  galleryEl.onscroll = handlePreviewGalleryScroll;

  document.getElementById('previewHighlights').innerHTML = highlights.map(h => `<li>${h}</li>`).join('');

  renderPreviewRelated(pkg);

  const est = new Date();
  est.setDate(est.getDate() + (pkg.deliveryDays || 3));
  const estStr = est.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short' });
  document.getElementById('previewDeliveryEst').textContent = `Delivery by ${estStr}`;

  document.getElementById('productPreviewModal').classList.add('open');
  document.body.style.overflow = 'hidden';

  // An option can name one of this product's photos (see option_images in
  // js/shared/product-fields.js). A priced dropdown comes up with its first
  // option already selected, so the gallery should open on that option's photo
  // rather than on photo 1 - but only once the modal is actually laid out, since
  // scrollPreviewTo() measures the slide width and that is 0 while it is closed.
  // No mapping, or one pointing past the last photo, leaves the gallery on the
  // cover exactly as before.
  const mappedIdx = previewMappedImageIndex();
  if (mappedIdx !== null) requestAnimationFrame(() => scrollPreviewTo(mappedIdx, 'auto'));

  // Reflect the open product in the URL (?category=..&openProduct=..&pid=..) so the
  // address bar is specific to this product, refresh/share/back-button behave sanely,
  // and the existing deep-link reader (see DOMContentLoaded below) can re-open it. pid
  // is the real database id - included whenever the catalog gave us one - so the link
  // stays unique even if two products share a display name.
  if (!opts.skipHistory) {
    const url = new URL(window.location);
    url.searchParams.set('category', currentCategory);
    url.searchParams.set('openProduct', pkg.name);
    if (pkg.id) url.searchParams.set('pid', pkg.id);
    else url.searchParams.delete('pid');
    window.history.pushState({ studioProductPreview: true }, '', url);
  }
}

// "You may also like" for the product preview modal - scored by shared
// search_keywords first (admin-entered synonyms/tags), same category as a
// secondary tiebreak, across every loaded category (not just the one the
// opened package belongs to).
function findStudioPackageCategory(id) {
  if (!id) return null;
  for (const [catKey, cat] of Object.entries(categoriesData)) {
    if ((cat.packages || []).some(p => p.id === id)) return catKey;
  }
  return null;
}

function renderPreviewRelated(pkg) {
  const relatedEl = document.getElementById('previewRelatedProducts');
  const sectionEl = document.getElementById('previewRelatedSection');
  if (!relatedEl) return;
  const currentCatKey = pkg._catKey || findStudioPackageCategory(pkg.id);
  const currentKeywords = new Set((pkg.search_keywords || []).map(k => String(k).toLowerCase().trim()).filter(Boolean));
  const pool = [];
  Object.entries(categoriesData).forEach(([catKey, cat]) => {
    (cat.packages || []).forEach(p => pool.push(Object.assign({ _catKey: catKey }, p)));
  });
  const scored = pool
    .filter(p => p.id !== pkg.id)
    .map(p => {
      const itemKeywords = (p.search_keywords || []).map(k => String(k).toLowerCase().trim());
      const shared = itemKeywords.filter(k => currentKeywords.has(k)).length;
      const sameCategory = p._catKey === currentCatKey ? 1 : 0;
      return { item: p, score: shared * 10 + sameCategory };
    })
    .sort((a, b) => b.score - a.score)
    .map(entry => entry.item);

  if (sectionEl) sectionEl.style.display = scored.length ? '' : 'none';
  // First 4, then a "View more" button pages through the rest of the studio
  // catalog (js/shared/related-more.js).
  const relatedCard = p => `
    <div class="pkg-card" onclick="openStudioRelatedProduct('${p.id}')">
      <div class="pkg-image-wrap">
        <img class="pkg-image" src="${cldOpt(p.img)}" alt="${p.name}" loading="lazy" onerror="this.onerror=null;this.src=(window.SkLoading&&window.SkLoading.PLACEHOLDER_IMG)||'';">
      </div>
      <div class="pkg-body">
        <h3>${p.name}</h3>
        <div class="pkg-meta-row">
          <span class="pkg-price">${p.price}</span>${p.oldPrice ? `<span class="pkg-old-price">${p.oldPrice}</span>` : ''}
        </div>
      </div>
    </div>
  `;
  const wireImages = cards => {
    if (!window.SkLoading) return;
    cards.forEach(card => card.querySelectorAll('.pkg-image-wrap img').forEach(img => window.SkLoading.wireImage(img, { wrap: img.closest('.pkg-image-wrap') })));
  };
  if (window.RelatedMore) {
    RelatedMore.render(relatedEl, scored, relatedCard, { key: pkg.id, afterAppend: wireImages });
  } else {
    relatedEl.innerHTML = scored.slice(0, 4).map(relatedCard).join('');
    wireImages(Array.from(relatedEl.children));
  }
}

// Recommended items can belong to a category the visitor never browsed to, so
// they won't already be sitting in currentPackages (openProductPreview() only
// opens by index into that array) - append it first if it's missing, then open
// by the resulting index.
window.openStudioRelatedProduct = function (id) {
  let idx = currentPackages.findIndex(p => String(p.id) === String(id));
  if (idx === -1) {
    const found = Object.values(categoriesData).flatMap(c => c.packages || []).find(p => String(p.id) === String(id));
    if (!found) return;
    currentPackages = currentPackages.concat([found]);
    idx = currentPackages.length - 1;
  }
  openProductPreview(idx);
};

function renderPreviewOptions(pkg) {
  activePreviewQtyOption = null;
  activePreviewPurpose = "";
  activePreviewPhotoFile = null;

  const optionsWrap = document.getElementById('previewOptions');
  const qtyGroup = document.getElementById('previewQtyGroup');
  const purposeGroup = document.getElementById('previewPurposeGroup');
  const uploadGroup = document.getElementById('previewUploadGroup');
  const qtySelect = document.getElementById('previewQtySelect');
  const purposeSelect = document.getElementById('previewPurposeSelect');
  const uploadInput = document.getElementById('previewPhotoUpload');
  const uploadFilename = document.getElementById('previewUploadFilename');

  uploadInput.value = '';
  uploadFilename.textContent = '';
  [qtyGroup, purposeGroup, uploadGroup].forEach(g => g.classList.remove('field-error'));

  // Quantity/purpose (with per-option pricing) now live in pkg.input_fields, rendered
  // generically below - this group only still covers the legacy requiresPhotoUpload flag.
  qtyGroup.style.display = 'none';
  purposeGroup.style.display = 'none';
  const hasUpload = !!pkg.requiresPhotoUpload;
  optionsWrap.style.display = hasUpload ? 'flex' : 'none';
  uploadGroup.style.display = hasUpload ? 'flex' : 'none';

  const customFieldsWrap = document.getElementById('previewCustomFields');
  if (customFieldsWrap && window.ProductFields) {
    ProductFields.renderProductFields(customFieldsWrap, pkg);
    const price = ProductFields.getSelectedPrice(customFieldsWrap, pkg);
    const priceText = (price || price === 0) ? ProductFields.formatPrice(price) : pkg.price;
    document.getElementById('previewPrice').textContent = priceText;
    document.getElementById('previewActionPrice').textContent = priceText;
  }
  renderStudioStock();
  renderStudioBulkOffers();
}

/* The "buy more, save more" panel in the preview modal. Priced options here
   replace the unit price (Studio's "16 Photos = ₹200" picker), so the saving is
   quoted against whichever one is selected - re-run on every quantity change
   and on pf:pricechange. */
function renderStudioBulkOffers() {
  const box = document.getElementById('previewBulkOffers');
  if (!box || !window.BulkTiers || !activePreviewPkg) return;
  const wrap = document.getElementById('previewCustomFields');
  const selected = wrap && window.ProductFields
    ? ProductFields.getSelectedPrice(wrap, activePreviewPkg) : null;
  const unitPrice = (selected || selected === 0)
    ? selected
    : parseInt(String(activePreviewPkg.price || '0').replace(/[^\d]/g, ''), 10) || 0;
  BulkTiers.renderOfferBox(box, activePreviewPkg.bulk_discounts, {
    qty: activePreviewItemQty,
    unitPrice,
  });
}

function initStudioProductAccordions() {
  document.querySelectorAll('.preview-accordion-trigger').forEach(trigger => {
    trigger.addEventListener('click', () => {
      const item = trigger.closest('.preview-accordion-item');
      const group = item?.parentElement;
      if (!item || !group) return;
      const shouldOpen = trigger.getAttribute('aria-expanded') !== 'true';
      group.querySelectorAll('.preview-accordion-item').forEach(other => {
        other.classList.remove('is-open');
        other.querySelector('.preview-accordion-trigger')?.setAttribute('aria-expanded', 'false');
      });
      if (shouldOpen) {
        item.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
      }
    });
  });
  document.querySelector('.preview-accordion-item')?.classList.add('is-open');
}

function handlePreviewQtyChange(select) {
  if (!activePreviewPkg || !activePreviewPkg.quantityOptions) return;
  const opt = activePreviewPkg.quantityOptions.find(o => o.value === select.value);
  if (!opt) return;
  activePreviewQtyOption = opt;
  document.getElementById('previewPrice').textContent = `₹${opt.price}`;
  document.getElementById('previewActionPrice').textContent = `₹${opt.price}`;
}

function handlePreviewPurposeChange(select) {
  activePreviewPurpose = select.value;
  if (activePreviewPurpose) {
    document.getElementById('previewPurposeGroup').classList.remove('field-error');
  }
}

function handlePreviewPhotoUpload(input) {
  const file = input.files && input.files[0] ? input.files[0] : null;
  const filenameEl = document.getElementById('previewUploadFilename');
  if (file) {
    const isImage = file.type.startsWith('image/') || /\.(jpe?g|png|webp|jfif|avif|bmp|tiff?)$/i.test(file.name);
    if (!isImage) {
      activePreviewPhotoFile = null;
      input.value = '';
      if (filenameEl) filenameEl.textContent = 'Please choose a JPG, PNG or WebP image.';
      return;
    }
    if (window.ProductFields && file.size > ProductFields.MAX_UPLOAD_BYTES) {
      activePreviewPhotoFile = null;
      input.value = '';
      if (filenameEl) filenameEl.textContent = `That image is larger than ${ProductFields.MAX_UPLOAD_MB} MB - please choose a smaller photo.`;
      return;
    }
  }
  activePreviewPhotoFile = file;
  if (filenameEl) filenameEl.textContent = file ? file.name : '';
  if (activePreviewPhotoFile) {
    document.getElementById('previewUploadGroup').classList.remove('field-error');
  }
}

function validatePreviewOptions() {
  if (!activePreviewPkg) return false;
  let valid = true;
  const missing = [];

  if (activePreviewPkg.requiresPhotoUpload && !activePreviewPhotoFile) {
    document.getElementById('previewUploadGroup').classList.add('field-error');
    missing.push('photo upload');
    valid = false;
  }

  if (!valid) {
    alert(`Please choose ${missing.join(' and ')} before continuing.`);
    return false;
  }

  const customFieldsWrap = document.getElementById('previewCustomFields');
  if (customFieldsWrap && window.ProductFields) {
    const fieldErrors = ProductFields.validateProductFields(customFieldsWrap, activePreviewPkg);
    if (fieldErrors.length) {
      alert(fieldErrors.join('\n'));
      return false;
    }
  }

  return valid;
}

// Reads the currently selected value of every single-select dropdown Customer
// Question (quantity/purpose/etc, in sort order) straight from the rendered
// controls, so the cart line's display name keeps the "(16 Photos – 4x6)" style
// suffix it always had, now driven by input_fields instead of the old
// quantityOptions/purposeOptions-specific state.
function previewDropdownSelections() {
  const wrap = document.getElementById('previewCustomFields');
  if (!wrap || !activePreviewPkg) return [];
  return (activePreviewPkg.input_fields || [])
    .filter(f => f.type === 'dropdown' && !f.multi_select)
    .slice().sort((a, b) => (a.sort || 0) - (b.sort || 0))
    .map(f => document.getElementById(`${wrap.id}_${f.id}`)?.value || '')
    .filter(Boolean);
}

function buildPreviewCartName() {
  const parts = [activePreviewPkg.name];
  const details = previewDropdownSelections();
  if (details.length) parts.push(`(${details.join(' – ')})`);
  return parts.join(' ');
}

function handlePreviewGalleryScroll() {
  const galleryEl = document.getElementById('previewGallery');
  const slideWidth = galleryEl.clientWidth;
  if (!slideWidth) return;
  const idx = Math.round(galleryEl.scrollLeft / slideWidth);
  if (idx === activePreviewImgIdx) return;
  activePreviewImgIdx = idx;
  // Scrolling away from a playing clip must stop it - otherwise its audio keeps
  // running under whatever slide the visitor actually landed on.
  ProductMedia.pauseAll(galleryEl, galleryEl.children[idx]);
  document.querySelectorAll('.preview-dot').forEach((el, i) => {
    el.classList.toggle('active', i === idx);
  });
  document.querySelectorAll('.preview-thumb').forEach((el, i) => {
    el.classList.toggle('active', i === idx);
  });
}

function scrollPreviewTo(i, behavior = 'smooth') {
  const galleryEl = document.getElementById('previewGallery');
  galleryEl.scrollTo({ left: i * galleryEl.clientWidth, behavior });
}

/* Prev/next arrows on the preview gallery (studio.html), so this view is reached
   the same way as the gifts and corporate galleries rather than by swipe alone.
   Wraps at both ends - the gallery is a short loop of product photos, and a dead
   arrow on the last slide reads as broken. */
function navigatePreviewGallery(step) {
  const galleryEl = document.getElementById('previewGallery');
  const count = galleryEl ? galleryEl.children.length : 0;
  if (count < 2) return;
  scrollPreviewTo((activePreviewImgIdx + step + count) % count);
}

/* The photo index the current Customer-Questions selection points at, or null if
   nothing maps or the mapping is out of range for this product's photos. Videos
   sit after the photos in the gallery (see js/shared/product-media.js), so a
   valid mapping is always inside the image portion. */
function previewMappedImageIndex() {
  const wrap = document.getElementById('previewCustomFields');
  if (!wrap || !window.ProductFields || !activePreviewPkg) return null;
  const index = ProductFields.getSelectedImageIndex(wrap, activePreviewPkg);
  return clampPreviewImageIndex(index);
}

function clampPreviewImageIndex(index) {
  if (index === null || index === undefined) return null;
  const count = (activePreviewPkg && activePreviewPkg.images && activePreviewPkg.images.length) || 1;
  return index >= 0 && index < count ? index : null;
}

function sharePreviewProduct() {
  if (!activePreviewPkg) return;
  if (navigator.share) {
    navigator.share({ title: activePreviewPkg.name, text: activePreviewPkg.subtitle }).catch(() => {});
  } else {
    alert(`${activePreviewPkg.name} — ${activePreviewPkg.price}`);
  }
}

function adjustPreviewItemQty(delta) {
  const want = activePreviewItemQty + delta;
  activePreviewItemQty = window.StockUI
    ? StockUI.clampQty(want, activePreviewPkg, 99)
    : Math.max(1, Math.min(99, want));
  document.getElementById('previewItemQty').textContent = activePreviewItemQty;
  renderStudioStock();
  renderStudioBulkOffers();
}

/* Stock state for the preview modal. Studio had none at all before: a package
   could be out of stock and the modal would still invite an order, with the
   refusal only arriving at checkout. */
function renderStudioStock() {
  const badgeEl = document.getElementById('previewStockBadge');
  const capEl = document.getElementById('previewQtyCapNote');
  if (!badgeEl || !window.StockUI || !activePreviewPkg) return;
  const info = StockUI.badge(activePreviewPkg);
  if (!info) {
    badgeEl.style.display = 'none';
  } else {
    badgeEl.textContent = info.text;
    // Same class vocabulary gifts and corporate already use, so one rule set
    // covers all three rather than studio inventing its own.
    const mod = info.state === 'out' ? ' out-of-stock' : (info.state === 'low' ? ' low-stock' : '');
    badgeEl.className = 'stock-badge' + mod;
    badgeEl.style.display = '';
  }
  const out = StockUI.isOutOfStock(activePreviewPkg);
  ['previewAddToCart', 'previewBuyNow', 'previewOrderBtn'].forEach((id) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = out;
    btn.classList.toggle('btn-disabled', out);
  });
  if (capEl) {
    const msg = StockUI.capMessage(activePreviewPkg, activePreviewItemQty);
    capEl.textContent = msg || '';
    capEl.style.display = msg ? 'block' : 'none';
  }
}

function closeProductPreview() {
  ProductMedia.pauseAll(document.getElementById('previewGallery'));
  document.getElementById('productPreviewModal').classList.remove('open');
  document.body.style.overflow = '';
  activePreviewPkg = null;

  if (new URLSearchParams(window.location.search).has('openProduct')) {
    const url = new URL(window.location);
    url.searchParams.delete('openProduct');
    url.searchParams.delete('pid');
    window.history.replaceState({}, '', url);
  }
}

// Closing the modal via the browser Back button lands here instead of closeProductPreview()
// (the URL has already changed by the time this fires) - just tear down the modal UI/state.
window.addEventListener('popstate', () => {
  if (activePreviewPkg && !new URLSearchParams(window.location.search).has('openProduct')) {
    ProductMedia.pauseAll(document.getElementById('previewGallery'));
    document.getElementById('productPreviewModal').classList.remove('open');
    document.body.style.overflow = '';
    activePreviewPkg = null;
  }
});

// Reads the validated upload (if this package needs one) into a data URL so it can be
// stored on the cart item - File objects themselves aren't JSON-serializable for
// localStorage. Resolves to null for packages with no photo requirement.
function readActivePreviewPhoto() {
  if (!activePreviewPkg || !activePreviewPkg.requiresPhotoUpload || !activePreviewPhotoFile) {
    return Promise.resolve(null);
  }
  // Shared with the admin-configured "Customer Input Fields" upload type
  // (js/shared/product-fields.js): uploads the photo and returns its URL, so
  // the cart line carries a link rather than a multi-MB base64 string that
  // could exhaust localStorage and make add-to-cart fail (see
  // CartCore.saveCart()). Falls back to an inline, resized data: URI when the
  // upload isn't possible.
  return ProductFields.fileToStoredValue(activePreviewPhotoFile);
}

// Returns { fields: {fieldId: value}, fieldLabels: {fieldId: label} } so the
// order-detail views (admin/js/orders.js, js/my-orders.js) can show a real
// label instead of the raw field id - or null if this product has none.
async function collectPreviewCustomFields() {
  const wrap = document.getElementById('previewCustomFields');
  if (!wrap || !window.ProductFields || !activePreviewPkg) return null;
  const fields = await ProductFields.collectProductFields(wrap, activePreviewPkg);
  if (!Object.keys(fields).length) return null;
  const fieldLabels = Object.fromEntries((activePreviewPkg.input_fields || []).map(f => [f.id, f.label]));
  return { fields, fieldLabels };
}

// The item's price, taking into account a priced Customer Questions dropdown
// (e.g. Studio's old quantity picker) if this product has one selected -
// falls back to the package's own price otherwise.
function currentPreviewPrice() {
  const wrap = document.getElementById('previewCustomFields');
  const price = wrap && window.ProductFields ? ProductFields.getSelectedPrice(wrap, activePreviewPkg) : null;
  return (price || price === 0) ? ProductFields.formatPrice(price) : activePreviewPkg.price;
}

// Deep link back to this product's own modal on this page - used both for the
// cart line's "needs your attention" Fix link and (now) to make the cart row
// itself clickable, so a shopper can get back to the thing they configured.
function previewProductUrl() {
  if (!activePreviewPkg) return '';
  return `studio.html?category=${encodeURIComponent(currentCategory)}`
    + `&openProduct=${encodeURIComponent(activePreviewPkg.name)}`
    + (activePreviewPkg.id ? `&pid=${encodeURIComponent(activePreviewPkg.id)}` : '');
}

/* Uploading the customer's photo happens inside readActivePreviewPhoto() below,
   on this click - not when the file was picked. On a slow connection that is a
   few seconds of nothing, on the one button the customer is waiting for, so the
   button shows it is working. Without this the page looks frozen and people
   click again. */
async function previewAddToCart(ev) {
  if (!activePreviewPkg) return;
  if (!validatePreviewOptions()) return;
  const btn = (ev && ev.currentTarget) || document.querySelector('.preview-add-btn');
  const price = currentPreviewPrice();
  let photoData;
  if (window.SkLoading) SkLoading.button(btn, true);
  try {
    photoData = await readActivePreviewPhoto();
  } catch {
    if (window.SkLoading) SkLoading.button(btn, false);
    alert('That photo could not be processed - please choose a different image.');
    return;
  }
  const custom = await collectPreviewCustomFields();
  if (window.SkLoading) SkLoading.button(btn, false);
  const customization = (photoData || custom) ? { ...(photoData ? { photoData } : {}), ...(custom || {}) } : null;
  const url = previewProductUrl();
  const requirement = activePreviewPkg.requiresPhotoUpload
    ? { label: 'Upload your photo', fields: ['photoData'], editUrl: url }
    : null;
  addToStudioCart(buildPreviewCartName(), price, activePreviewPkg.img, customization, requirement, activePreviewPkg.id, activePreviewItemQty, url);
  showCartToast();
}

let cartToastTimer = null;

function showCartToast() {
  const toast = document.getElementById('cartToast');
  if (!toast) return;
  toast.classList.add('show');
  clearTimeout(cartToastTimer);
  cartToastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

function goToCartFromToast() {
  location.href = 'cart.html';
}

/* Uploading the customer's photo happens inside readActivePreviewPhoto() below,
   on this click - not when the file was picked. On a slow connection that is a
   few seconds of nothing, on the one button the customer is waiting for, so the
   button shows it is working. Without this the page looks frozen and people
   click again. */
async function previewBuyNow(ev) {
  if (!activePreviewPkg) return;
  if (!validatePreviewOptions()) return;
  const btn = (ev && ev.currentTarget) || document.querySelector('.preview-buy-btn');
  const price = currentPreviewPrice();
  let photoData;
  if (window.SkLoading) SkLoading.button(btn, true);
  try {
    photoData = await readActivePreviewPhoto();
  } catch {
    if (window.SkLoading) SkLoading.button(btn, false);
    alert('That photo could not be processed - please choose a different image.');
    return;
  }
  const custom = await collectPreviewCustomFields();
  if (window.SkLoading) SkLoading.button(btn, false);
  const customization = (photoData || custom) ? { ...(photoData ? { photoData } : {}), ...(custom || {}) } : null;
  const url = previewProductUrl();
  const requirement = activePreviewPkg.requiresPhotoUpload
    ? { label: 'Upload your photo', fields: ['photoData'], editUrl: url }
    : null;
  addToStudioCart(buildPreviewCartName(), price, activePreviewPkg.img, customization, requirement, activePreviewPkg.id, activePreviewItemQty, url);
  closeProductPreview();
  // The item's already in the persistent cart above (unlike gifts.js's Buy Now,
  // which hands the item itself to cart.html) - this just flags the handoff as
  // "buy now" so cart.js's consumePendingBuyNow() sends the shopper straight to
  // the address step instead of the cart review list (items: [] - nothing left
  // for it to merge in).
  sessionStorage.setItem('sai_studio_checkout', JSON.stringify({ source: 'buy-now', items: [] }));
  location.href = 'cart.html';
}

/* ================= SITE-WIDE CART (shared 'sai_studio_cart' key — same one used by
   cart.js, catalog.js, corporate.js, gifts.js, bulk-orders.js, index-2.js, so items
   added here show up in the same cart everywhere else on the site) ================= */
// js/shared/cart-core.js - shared storage/sync logic
function getStudioCart() {
  return CartCore.getCart();
}

function saveStudioCart(cart) {
  CartCore.saveCart(cart);
  updateStudioCartBadge();
}

// `name` here is the display name, which already carries the selected options
// as a "(16 Photos)" suffix (buildPreviewCartName). The cart *key*, though,
// comes from the configuration itself (CartCore.lineKey) rather than from that
// string: the suffix is presentation and can legitimately be absent, and when
// it was the only thing separating two variants, the 8-photo and 16-photo
// lines merged into one row priced at whichever went in first.
function addToStudioCart(name, price, img, customization, requirement, productId, qty, url) {
  const key = CartCore.lineKey(name, customization);
  CartCore.updateQty(key, qty || 1, {
    name, price, img, url, product_id: productId, customization, requirement,
  });
  updateStudioCartBadge();
}

function updateStudioCartBadge() {
  const cart = getStudioCart();
  const items = Object.values(cart);
  const totalQty = items.reduce((sum, item) => sum + item.qty, 0);

  const navCartBadge = document.getElementById('navCartBadge');
  if (navCartBadge) {
    if (totalQty > 0) {
      navCartBadge.textContent = totalQty;
      navCartBadge.style.display = 'flex';
    } else {
      navCartBadge.style.display = 'none';
    }
  }

  const bottomCartBadge = document.getElementById('bottomNavCartBadge');
  if (bottomCartBadge) {
    if (totalQty > 0) {
      bottomCartBadge.textContent = totalQty;
      bottomCartBadge.style.display = 'flex';
    } else {
      bottomCartBadge.style.display = 'none';
    }
  }
}

/* ================= CHECKOUT FLOW (CART / REVIEW / PAYMENT) ================= */
let selectedPaymentMethod = 'cod';

function findPackageByName(name) {
  const keys = Object.keys(categoriesData);
  for (const k of keys) {
    const found = categoriesData[k].packages.find(p => p.name === name);
    if (found) return found;
  }
  return null;
}

function parsePrice(str) {
  return CartCore.parsePrice(str);
}

function computeCartTotals() {
  const cart = getStudioCart();
  // Each item carries the object key it's stored under: a line's key is no
  // longer simply its name (two configurations of one product share a name but
  // are separate rows - see addToStudioCart), so the qty/remove buttons have to
  // act on the real key.
  const items = Object.entries(cart).map(([key, item]) => ({ ...item, __key: key }));
  let productTotal = 0;
  let discountTotal = 0;

  items.forEach(item => {
    const pkg = findPackageByName(item.name);
    const unitPrice = parsePrice(item.price);
    const unitOld = pkg && pkg.oldPrice ? parsePrice(pkg.oldPrice) : unitPrice;
    productTotal += unitOld * item.qty;
    discountTotal += (unitOld - unitPrice) * item.qty;
  });

  const orderTotal = productTotal - discountTotal;
  return { items, productTotal, discountTotal, orderTotal };
}

function openCheckout() {
  const { items } = computeCartTotals();
  if (items.length === 0) {
    alert('Your cart is empty. Add a product first to check out.');
    return;
  }
  document.getElementById('checkoutOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  goToCheckoutStep(1);
}

function closeCheckout() {
  document.getElementById('checkoutOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

function goToCheckoutStep(step) {
  document.querySelectorAll('.checkout-step').forEach(el => el.classList.remove('active'));
  document.getElementById('checkoutStep' + step).classList.add('active');

  if (step === 1) renderCheckoutCartStep();
  if (step === 2) renderCheckoutReviewStep();
  if (step === 3) renderCheckoutPaymentStep();
}

function renderPriceDetails(suffix) {
  const { items, productTotal, discountTotal, orderTotal } = computeCartTotals();
  const itemCountEl = document.getElementById('checkoutItemCount' + suffix);
  if (itemCountEl) itemCountEl.textContent = items.length;

  const productPriceEl = document.getElementById('checkoutProductPrice' + suffix);
  if (productPriceEl) productPriceEl.textContent = `₹${productTotal}`;

  const discountEl = document.getElementById('checkoutTotalDiscount' + suffix);
  if (discountEl) discountEl.textContent = `- ₹${discountTotal}`;

  const orderTotalEl = document.getElementById('checkoutOrderTotal' + suffix);
  if (orderTotalEl) orderTotalEl.textContent = `₹${orderTotal}`;

  const footerPriceEl = document.getElementById('checkoutFooterPrice' + suffix);
  if (footerPriceEl) footerPriceEl.textContent = `₹${orderTotal}`;

  return { items, productTotal, discountTotal, orderTotal };
}

function cartItemRowHTML(item, withActions) {
  // The line's own object key, not its name: two configurations of one product
  // share a name but are separate rows (see addToStudioCart), so keying these
  // buttons by name would drive the wrong row - or no row at all.
  const key = String(item.__key || item.name).replace(/'/g, "\\'");
  return `
    <div class="checkout-cart-item">
      <img src="${cldOpt(item.img)}" alt="${item.name}" class="checkout-item-img" loading="lazy" onerror="this.onerror=null;this.src=(window.SkLoading&&window.SkLoading.PLACEHOLDER_IMG)||'';">
      <div class="checkout-item-info">
        <p class="checkout-item-name">${item.name}</p>
        <p class="checkout-item-price">${item.price}</p>
        ${withActions ? `
          <div class="checkout-qty-stepper">
            <button type="button" onclick="event.stopPropagation(); adjustCartQty('${escapeAttrJs(key)}', -1)">−</button>
            <span>${item.qty}</span>
            <button type="button" onclick="event.stopPropagation(); adjustCartQty('${escapeAttrJs(key)}', 1)">+</button>
          </div>
        ` : `<p class="checkout-item-qty">Qty: ${item.qty}</p>`}
      </div>
      ${withActions ? `
        <button type="button" class="checkout-item-remove" onclick="removeCartItem('${escapeAttrJs(key)}')" aria-label="Remove">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      ` : ''}
    </div>
  `;
}

function renderCheckoutCartStep() {
  const { items } = computeCartTotals();
  document.getElementById('checkoutCartItems').innerHTML = items.map(item => cartItemRowHTML(item, true)).join('');
  renderPriceDetails('1');
}

function adjustCartQty(name, delta) {
  CartCore.updateQty(name, delta, {}, { createIfMissing: false });
  updateStudioCartBadge();
  renderCheckoutCartStep();
}

function removeCartItem(name) {
  CartCore.removeItem(name);
  updateStudioCartBadge();
  renderCheckoutCartStep();
  const { items } = computeCartTotals();
  if (items.length === 0) closeCheckout();
}

function renderCheckoutReviewStep() {
  const { items } = computeCartTotals();
  document.getElementById('checkoutReviewItems').innerHTML = items.map(item => cartItemRowHTML(item, false)).join('');
  renderPriceDetails('2');

  // Slowest item in the cart sets the order's delivery estimate.
  const maxDeliveryDays = items.reduce((max, item) => {
    const pkg = findPackageByName(item.name);
    return Math.max(max, (pkg && pkg.deliveryDays) || 3);
  }, 3);
  const est = new Date();
  est.setDate(est.getDate() + maxDeliveryDays);
  const estStr = est.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short' });
  document.getElementById('checkoutDeliveryEst').textContent = `Estimated Delivery by ${estStr}`;
}

function confirmReviewAndContinue() {
  const name = document.getElementById('checkoutName').value.trim();
  const phone = document.getElementById('checkoutPhone').value.trim();
  const address = document.getElementById('checkoutAddress').value.trim();
  if (!name || !phone || !address) {
    alert('Please fill in your name, phone number, and delivery address to continue.');
    return;
  }
  goToCheckoutStep(3);
}

function renderCheckoutPaymentStep() {
  const totals = renderPriceDetails('3');
  const codPrice = totals.orderTotal;
  const onlineDiscount = Math.round(codPrice * 0.05);
  const onlinePrice = codPrice - onlineDiscount;

  document.getElementById('paymentCodPrice').textContent = `₹${codPrice}`;
  document.getElementById('paymentOnlineOldPrice').textContent = `₹${codPrice}`;
  document.getElementById('paymentOnlinePrice').textContent = `₹${onlinePrice}`;
  document.getElementById('paymentSaveBadge').textContent = `Save ₹${onlineDiscount}`;

  selectedPaymentMethod = 'cod';
  updatePaymentSelectionUI();
  updateCheckoutFooterForPayment(codPrice, onlinePrice);
}

function selectPaymentMethod(method) {
  selectedPaymentMethod = method;
  updatePaymentSelectionUI();

  const codPrice = parsePrice(document.getElementById('paymentCodPrice').textContent);
  const onlinePrice = parsePrice(document.getElementById('paymentOnlinePrice').textContent);
  updateCheckoutFooterForPayment(codPrice, onlinePrice);
}

function updatePaymentSelectionUI() {
  document.getElementById('paymentCOD').classList.toggle('selected', selectedPaymentMethod === 'cod');
  document.getElementById('paymentOnline').classList.toggle('selected', selectedPaymentMethod === 'online');
}

function updateCheckoutFooterForPayment(codPrice, onlinePrice) {
  const finalPrice = selectedPaymentMethod === 'online' ? onlinePrice : codPrice;
  document.getElementById('checkoutFooterPrice3').textContent = `₹${finalPrice}`;
}

function placeOrder() {
  const name = document.getElementById('checkoutName').value.trim();
  closeCheckout();
  saveStudioCart({});
  document.getElementById('modalMessage').textContent = name
    ? `Thank you, ${name}! Your order has been placed. We will contact you shortly to confirm delivery.`
    : 'Thank you! Your order has been placed. We will contact you shortly to confirm delivery.';
  document.getElementById('successModal').style.display = 'flex';
}

function closeModal() {
  document.getElementById('successModal').style.display = 'none';
}

function setActiveBottomNav(el) {
  document.querySelectorAll('.bottom-nav-item').forEach(item => item.classList.remove('active'));
  el.classList.add('active');
}

// Categories/packages come from GET /api/catalog/studio (the database) instead of the
// hardcoded categoriesData literal this page used to ship. Field mapping: category
// name/description/image map directly; each package's title/price/mrp/images/feat map
// to name/oldPrice/img+images/highlights, and the fields with no dedicated database
// column yet (tag/badge/turnaround/quantityOptions/purposeOptions/requiresPhotoUpload)
// travel in the product's `extra` JSON column, which the admin panel edits as raw JSON.
const STUDIO_API_BASE = window.SAI_API_BASE || "http://localhost:8000";

async function loadStudioCatalog() {
  const res = await fetch(`${STUDIO_API_BASE}/api/catalog/studio`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();

  const built = {};
  data.categories.forEach(c => {
    built[c.id] = {
      title: c.name,
      desc: c.description || "",
      icon: c.image,
      packages: (data.packages[c.id] || []).map(p => {
        const extra = p.extra || {};
        // "Turnaround: ..." / "Quantity options: ..." bullets were baked into feat[]
        // by the original data seed before extra.turnaround/quantityOptions existed -
        // drop them here since that same info now renders properly from extra below.
        const highlights = (p.feat || []).filter(f => !/^(Turnaround|Quantity options):/i.test(f));
        const pkg = {
          id: p.id,
          name: p.title,
          subtitle: p.description || "",
          price: p.price,
          img: (p.images && p.images[0]) || "",
          images: p.images || [],
          // Same photos uncompressed, for the preview's large slides and zoom viewer.
          fullImages: p.full_images || [],
          // Rendered only by the preview modal's gallery, never by a card.
          videos: p.videos || [],
          highlights,
        };
        if (p.mrp) pkg.oldPrice = p.mrp;
        if (extra.tag) pkg.tag = extra.tag;
        if (extra.badge) pkg.badge = extra.badge;
        if (extra.turnaround) pkg.turnaround = extra.turnaround;
        if (extra.requiresPhotoUpload) pkg.requiresPhotoUpload = extra.requiresPhotoUpload;
        pkg.input_fields = p.input_fields || [];
        pkg.bulk_discounts = p.bulk_discounts || [];
        pkg.type = p.type || null;
        pkg.stock = p.stock ?? null;
        pkg.deliveryDays = p.delivery_days || null;
        pkg.search_keywords = p.search_keywords || [];
        return pkg;
      }),
    };
  });
  categoriesData = built;
}

function renderPackagesGridSkeleton() {
  const grid = document.getElementById('packagesGrid');
  if (!grid) return;
  // The catalog fetch below is the only thing that fills this grid - without
  // something here in the meantime, the whole "Select Option" section is a
  // blank box for however long that request takes, which reads as broken
  // rather than loading.
  grid.innerHTML = Array.from({ length: 6 }).map(() => `
    <div class="pkg-card">
      <div class="pkg-image-wrap sk-img-skel" style="aspect-ratio:1/1;"></div>
      <div class="pkg-body">
        <div class="sk-img-skel" style="height:14px;border-radius:4px;margin-bottom:8px;"></div>
        <div class="sk-img-skel" style="height:14px;width:60%;border-radius:4px;"></div>
      </div>
    </div>
  `).join('');
}

window.addEventListener('DOMContentLoaded', async () => {
  renderPackagesGridSkeleton();
  try {
    await loadStudioCatalog();
  } catch (err) {
    console.error("Failed to load the studio catalog:", err);
    const sidebar = document.getElementById('desktopSidebar');
    if (sidebar) sidebar.innerHTML = '<div style="padding:16px;color:#b91c1c;">Could not load services right now. Please refresh the page.</div>';
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const catParam = urlParams.get('category');
  const hasCatDeepLink = catParam && (catParam === 'all' || categoriesData[catParam]);
  if (hasCatDeepLink) {
    currentCategory = catParam;
  }

  initSidebar();
  document.querySelectorAll('.menu-cat-link').forEach(el => {
    el.classList.toggle('active', el.dataset.key === currentCategory);
  });
  buildCategoryMegaMenus();
  buildHeroCarousel();
  renderContent();
  initStudioProductAccordions();
  updateStudioCartBadge();

  // Priced Customer Questions dropdown (e.g. a quantity picker) - keep the modal's
  // displayed price live as the customer changes their selection, same as the old
  // dedicated quantity-select handler used to.
  document.getElementById('previewCustomFields')?.addEventListener('pf:pricechange', (e) => {
    if (!activePreviewPkg) return;
    const price = e.detail && (e.detail.price || e.detail.price === 0) ? e.detail.price : null;
    const text = price !== null ? ProductFields.formatPrice(price) : activePreviewPkg.price;
    document.getElementById('previewPrice').textContent = text;
    document.getElementById('previewActionPrice').textContent = text;
    // The saving is quoted against the selected option's price, so it moves with it.
    renderStudioBulkOffers();
  });

  // An option that names one of this product's photos scrolls the carousel to it.
  // Only fires for options an admin actually mapped, so an unmapped dropdown
  // leaves the gallery alone.
  document.getElementById('previewCustomFields')?.addEventListener('pf:imagechange', (e) => {
    const index = clampPreviewImageIndex(e.detail && e.detail.index);
    if (index !== null) scrollPreviewTo(index);
  });

  // A ?category= deep link (header mega-menu, homepage cards, ...) should land on
  // that category's title/packages, not the hero carousel above it - same place
  // switchCategory() itself scrolls to when picked in-page.
  if (hasCatDeepLink) {
    scrollToStudioCategory('auto');
  }

  /* deep-link support: ?category=<key>&openProduct=<package name>&pid=<id> auto-opens
     that package's preview modal (used by homepage product cards so clicking one opens
     the exact product, not just its category page). pid is matched first since it's the
     real database id and can't collide between products - openProduct name is only the
     fallback for older links that predate pid. */
  const openProductParam = urlParams.get('openProduct');
  const pidParam = urlParams.get('pid');
  if (openProductParam || pidParam) {
    const idx = pidParam
      ? currentPackages.findIndex(p => String(p.id) === pidParam)
      : currentPackages.findIndex(p => p.name === openProductParam);
    if (idx !== -1) {
      setTimeout(() => openProductPreview(idx, { skipHistory: true }), 150);
    }
  }

  window.addEventListener('resize', updateHeroCarouselPosition);

  const searchInputs = [
    document.getElementById('mobileSearchInput'),
    document.getElementById('desktopSearchInput')
  ].filter(Boolean);

  searchInputs.forEach(input => {
    input.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      searchInputs.forEach(other => {
        if (other !== e.target) other.value = searchQuery;
      });
      renderContent();
    });
  });

  const scrollContainer = document.querySelector('.main-content');
  const appSwitcher = document.querySelector('.mobile-app-switcher');
  const headerAddress = document.querySelector('.mobile-header-address');
  if (scrollContainer && appSwitcher) {
    let lastScrollTop = 0;
    scrollContainer.addEventListener('scroll', () => {
      const scrollTop = scrollContainer.scrollTop;
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
