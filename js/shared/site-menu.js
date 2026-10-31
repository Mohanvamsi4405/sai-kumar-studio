/* ============================================================
   Sai Kumar Digital Lab & Studio — admin-managed category menus
   ------------------------------------------------------------
   The category menu bar (Home / Photography / Gifts / ... with mega
   dropdowns) used to be hand-copied into every page. It is now edited
   in admin > Menu and served by GET /api/menu?name=<menu>; this script
   renders it.

   Opt-in per container:
     <div class="menu-container" data-site-menu>             main menu
     <div class="menu-container" data-site-menu="flat">      main menu, top links only
     <div class="menu-container" data-site-menu="gifts">     a page's own menu
                                (gifts | corporate | photography)

   The page's existing static markup stays as the fallback: it is only
   replaced once a menu is available (from this browser's last copy, which
   renders instantly, then from the API).
   ============================================================ */
(function () {
  'use strict';

  var CACHE_PREFIX = 'sk_site_menu_v2_';
  var CARET = '<svg class="menu-caret" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6"/></svg>';
  // How many dropdowns (from the left) open anchored to their left edge instead
  // of centred, so the first ones don't spill off the left of the screen - and,
  // on a long bar, the last one is anchored right for the same reason.
  var LEFT_ANCHORED = 2;
  var RIGHT_ANCHOR_FROM = 5;

  // In-page category switchers: a menu link to "<this page>?category=x" calls
  // the page's own function instead of reloading the page.
  var IN_PAGE = {
    'corporate.html': function (cat) { return typeof window.switchCategory === 'function' && (window.switchCategory(cat, true), true); },
    'photography.html': function (cat) { return typeof window.selectCat === 'function' && (window.selectCat(cat), true); },
    'studio.html': function (cat) { return typeof window.switchCategory === 'function' && (window.switchCategory(cat), true); }
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // The API already refuses these; checked again so a bad row can never become
  // a script link on the storefront.
  function safeUrl(u) {
    u = String(u || '').trim();
    return /^\s*(javascript|data|vbscript):/i.test(u) ? '#' : (u || '#');
  }

  // Percent-encodes the characters that could end a CSS url('...') early.
  function cssUrl(u) {
    return String(u || '').replace(/[\s"'()\\]/g, function (c) {
      return '%' + ('0' + c.charCodeAt(0).toString(16).toUpperCase()).slice(-2);
    });
  }

  function pageOf(url) {
    var path = String(url || '').split(/[?#]/)[0];
    var file = path.slice(path.lastIndexOf('/') + 1);
    return (file || 'index.html').toLowerCase();
  }

  function categoryOf(url) {
    var m = /[?&]category=([^&#]*)/.exec(String(url || ''));
    return m ? decodeURIComponent(m[1]) : null;
  }

  var currentPage = pageOf(location.pathname);
  var currentCategory = categoryOf(location.search);

  // A top item is active when it points at this page - and, for a category
  // link, at the category being shown.
  function isActive(item) {
    if (/^https?:/i.test(item.url || '') || pageOf(item.url) !== currentPage) return false;
    var cat = categoryOf(item.url);
    return cat ? cat === currentCategory : true;
  }

  function badgeHtml(b, cls) {
    return b ? ' <span class="' + cls + '">' + esc(b) + '</span>' : '';
  }

  /* ---------------- standard dropdown: columns of links + promo card ---------------- */

  function standardLink(link) {
    if (link.heading != null) return '<h4 style="margin-top: 14px;">' + esc(link.heading) + '</h4>';
    return '<a href="' + esc(safeUrl(link.url)) + '" class="mega-link">' + esc(link.label) + badgeHtml(link.badge, 'mega-badge') + '</a>';
  }

  function standardDropdown(item) {
    var cols = item.columns.map(function (col) {
      return '<div class="mega-col">' + (col.title ? '<h4>' + esc(col.title) + '</h4>' : '') +
        col.links.map(standardLink).join('') + '</div>';
    }).join('');
    var p = item.promo;
    var promo = p ?
      '<a href="' + esc(safeUrl(p.url || item.url)) + '" class="mega-promo">' +
        (p.image ? '<img loading="lazy" src="' + esc(p.image) + '" alt="' + esc(p.title || item.label) + '">' : '') +
        '<div class="mega-promo-text">' +
          (p.title ? '<strong>' + esc(p.title) + '</strong>' : '') +
          (p.subtitle ? '<span>' + esc(p.subtitle) + '</span>' : '') +
        '</div></a>' : '';
    return '<div class="mega-dropdown">' + cols + promo + '</div>';
  }

  /* ---------------- photography dropdown: photo cards, link lists, packages box,
                      big promo card, benefits strip ---------------- */

  function photoCard(link) {
    if (link.heading != null) return '<h4 style="margin-top: 14px;">' + esc(link.heading) + '</h4>';
    return '<a href="' + esc(safeUrl(link.url)) + '" class="mega-item-card">' +
      (link.image ? '<img loading="lazy" src="' + esc(link.image) + '" alt="' + esc(link.label) + '" class="mega-item-thumb">' : '') +
      '<div class="mega-item-info"><span class="mega-item-title">' + esc(link.label) + badgeHtml(link.badge, 'mega-badge-new') + '</span>' +
      (link.description ? '<span class="mega-item-desc">' + esc(link.description) + '</span>' : '') +
      '</div></a>';
  }

  function photoListLink(link) {
    if (link.heading != null) return '<h4 style="margin-top: 14px;">' + esc(link.heading) + '</h4>';
    return '<a href="' + esc(safeUrl(link.url)) + '" class="mega-link-item"><span>' + esc(link.label) + '</span>' +
      (link.badge ? '<span class="mega-badge-new">' + esc(link.badge) + '</span>' : '') + '</a>';
  }

  function photoDropdown(item, benefits) {
    var sections = item.columns.map(function (col) {
      if (col.style === 'cards') {
        return '<div class="mega-section-left">' + (col.title ? '<h4>' + esc(col.title) + '</h4>' : '') +
          '<div class="mega-item-list">' + col.links.map(photoCard).join('') + '</div></div>';
      }
      var c = col.cta;
      var cta = c ? '<div class="mega-pkg-box">' +
          (c.title ? '<h5>' + esc(c.title) + '</h5>' : '') + (c.text ? '<p>' + esc(c.text) + '</p>' : '') +
          (c.button ? '<a href="' + esc(safeUrl(c.url)) + '" class="mega-btn-contact">' + esc(c.button) + '</a>' : '') +
        '</div>' : '';
      return '<div class="' + (c ? 'mega-section-packages' : 'mega-section-middle') + '">' +
        (col.title ? '<h4>' + esc(col.title) + '</h4>' : '') +
        '<div class="mega-links-column">' + col.links.map(photoListLink).join('') + '</div>' + cta + '</div>';
    }).join('');
    var p = item.promo;
    var promo = p ?
      '<div class="mega-promo-card"' + (p.image ? ' style="background-image: url(\'' + esc(cssUrl(p.image)) + '\');"' : '') + '>' +
        '<div class="mega-promo-content">' +
          (p.tag ? '<span class="mega-promo-tag">' + esc(p.tag) + '</span>' : '') +
          (p.title ? '<h3 class="mega-promo-title">' + esc(p.title) + '</h3>' : '') +
          (p.subtitle ? '<p class="mega-promo-sub">' + esc(p.subtitle) + '</p>' : '') +
          '<a href="' + esc(safeUrl(p.url || item.url)) + '" class="mega-promo-btn">' + esc(p.button || 'View More →') + '</a>' +
        '</div></div>' : '';
    var strip = benefits && benefits.length ?
      '<div class="mega-benefits-strip">' + benefits.map(function (b) {
        return '<div class="mega-benefit-item"><span class="mega-benefit-icon">' + esc(b.icon) + '</span>' +
          '<div class="mega-benefit-text"><strong>' + esc(b.title) + '</strong><span>' + esc(b.text) + '</span></div></div>';
      }).join('') + '</div>' : '';
    return '<div class="mega-dropdown"><div class="mega-body">' + sections + promo + '</div>' + strip + '</div>';
  }

  /* ---------------- studio bar: category links whose dropdowns js/studio.js fills
                      with the category's live packages, plus a "More" menu ---------------- */

  function studioItem(item, nested) {
    var catAttr = item.category ? ' data-key="' + esc(item.category) + '"' : '';
    var linkCls = (nested ? '' : 'menu-link ') + (item.category ? 'menu-cat-link' : '') + (!nested && isActive(item) ? ' active' : '');
    var hasDropdown = item.auto || item.columns.length;
    if (!hasDropdown) {
      return nested
        ? '<div class="menu-nav-item menu-nav-item-nested"><a href="' + esc(safeUrl(item.url)) + '" class="' + linkCls + '"' + catAttr + '>' + esc(item.label) + '</a></div>'
        : '<a href="' + esc(safeUrl(item.url)) + '" class="' + linkCls.trim() + '"' + catAttr + '>' + esc(item.label) + '</a>';
    }
    var ddCls = 'menu-mega-dropdown' + (nested ? ' menu-mega-dropdown-nested' : '');
    var dropdown = item.auto
      ? '<div class="' + ddCls + '" data-mega-key="' + esc(item.category) + '"></div>'
      : standardDropdown(item).replace('<div class="mega-dropdown">', '<div class="' + ddCls + '">');
    return '<div class="menu-nav-item' + (nested ? ' menu-nav-item-nested' : '') + '">' +
      '<a href="' + esc(safeUrl(item.url)) + '" class="' + linkCls.trim() + '"' + catAttr + '>' + esc(item.label) + CARET + '</a>' +
      dropdown + '</div>';
  }

  function renderStudio(menu, flat) {
    var main = menu.items.filter(function (i) { return flat || !i.in_more; });
    var more = flat ? [] : menu.items.filter(function (i) { return i.in_more; });
    menu.items.forEach(function (i) { i.columns = i.columns || []; if (flat) i.auto = false; });
    return main.map(function (i) { return flat ? studioItem({ label: i.label, url: i.url, category: i.category, columns: [] }, false) : studioItem(i, false); }).join('') +
      (more.length ?
        '<div class="menu-more-dropdown" tabindex="0">' +
          '<button type="button" class="menu-link menu-more-link"><span>More</span>' +
          '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6" /></svg></button>' +
          '<div class="menu-more-menu">' + more.map(function (i) { return studioItem(i, true); }).join('') + '</div>' +
        '</div>' : '');
  }

  /* ---------------- the bar ---------------- */

  function renderMenu(menu, flat) {
    if (menu.layout === 'studio') return renderStudio(menu, flat);
    var photo = menu.layout === 'photography';
    var dropdownCount = flat ? 0 : menu.items.filter(function (i) { return (i.columns || []).length; }).length;
    var dropdownIndex = 0;
    var active = menu.items.map(isActive);
    // Photography pages opened without a ?category= highlight their first section,
    // as the hardcoded menu always did.
    if (photo && currentPage === 'photography.html' && active.indexOf(true) === -1) {
      var first = menu.items.findIndex(function (i) { return (i.columns || []).length; });
      if (first >= 0) active[first] = true;
    }
    return menu.items.map(function (item, idx) {
      item.columns = item.columns || [];
      var cls = 'menu-link' + (active[idx] ? ' active' : '');
      if (flat || !item.columns.length) {
        return '<a href="' + esc(safeUrl(item.url)) + '" class="' + cls + '">' + esc(item.label) + '</a>';
      }
      var i = dropdownIndex++;
      var navCls = 'nav-item';
      if (!photo && i < LEFT_ANCHORED) navCls += ' mega-left';
      else if (!photo && dropdownCount >= RIGHT_ANCHOR_FROM && i === dropdownCount - 1) navCls += ' mega-right';
      return '<div class="' + navCls + '">' +
        '<a href="' + esc(safeUrl(item.url)) + '" class="' + cls + '">' + esc(item.label) + CARET + '</a>' +
        (photo ? photoDropdown(item, menu.benefits) : standardDropdown(item)) +
        '</div>';
    }).join('');
  }

  // Clicks on links to a category of *this* page switch it in place.
  function onMenuClick(e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button > 0) return;
    var href = a.getAttribute('href');
    var handler = IN_PAGE[currentPage];
    if (!handler || pageOf(href) !== currentPage) return;
    var query = (href.split('#')[0].split('?')[1] || '');
    var cat = categoryOf(href);
    if (!cat || query.split('&').length !== 1) return;
    if (handler(cat)) {
      e.preventDefault();
      currentCategory = cat;
      var bar = a.closest('.menu-container');
      if (bar) {
        bar.querySelectorAll(':scope > a.menu-link, :scope > .nav-item > a.menu-link').forEach(function (top) {
          top.classList.remove('active');
        });
        var owner = a.closest('.nav-item');
        var topLink = owner ? owner.querySelector('a.menu-link') : (a.classList.contains('menu-link') ? a : null);
        if (topLink) topLink.classList.add('active');
      }
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    }
  }

  var lastRendered = {};

  function apply(el, name, menu) {
    if (!menu || !Array.isArray(menu.items) || !menu.items.length) return;
    var flat = el.getAttribute('data-site-menu') === 'flat';
    var signature = (flat ? 'flat:' : '') + JSON.stringify(menu);
    if (lastRendered[el.id || name + flat] === signature) return;
    lastRendered[el.id || name + flat] = signature;
    el.innerHTML = renderMenu(menu, flat);
    document.dispatchEvent(new CustomEvent('sitemenu:rendered', { detail: { name: name, container: el } }));
  }

  function readCache(name) {
    try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + name) || 'null'); } catch (e) { return null; }
  }

  function writeCache(name, menu) {
    try { localStorage.setItem(CACHE_PREFIX + name, JSON.stringify(menu)); } catch (e) { /* storage disabled */ }
  }

  function menuName(el) {
    var v = el.getAttribute('data-site-menu') || '';
    return v === '' || v === 'flat' ? 'main' : v;
  }

  function init() {
    var containers = Array.prototype.slice.call(document.querySelectorAll('.menu-container[data-site-menu]'));
    if (!containers.length) return;
    var base = window.SAI_API_BASE || 'http://127.0.0.1:8000';
    var byName = {};
    containers.forEach(function (el) {
      var name = menuName(el);
      (byName[name] = byName[name] || []).push(el);
      el.addEventListener('click', onMenuClick);
    });
    Object.keys(byName).forEach(function (name) {
      var cached = readCache(name);
      byName[name].forEach(function (el) { apply(el, name, cached); });
      fetch(base + '/api/menu?name=' + encodeURIComponent(name))
        .then(function (res) { return res.ok ? res.json() : null; })
        .then(function (menu) {
          if (!menu) return;
          writeCache(name, menu);
          byName[name].forEach(function (el) { apply(el, name, menu); });
        })
        .catch(function () { /* offline / API down: keep whatever is showing */ });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
