/* ============================================================
   Sai Kumar Digital Lab & Studio — shared home navigation
   ------------------------------------------------------------
   Every page in this site has its own bespoke header, so home
   navigation used to be inconsistent: some pages hid the logo on
   mobile, some back buttons pointed at a hard-coded page that had
   nothing to do with where the visitor actually came from.

   This one script, included on every page, rewires any
   .mobile-back-btn to a real "back" — returns to the previous page
   when the visitor arrived from inside the site, and falls back to
   the home page when they didn't.
   ============================================================ */
(function () {
  'use strict';

  var HOME = 'index.html';
  var TRAIL = 'sk_previous_page';

  /* ---------- Remember the page the visitor came from, per browser tab ----------
     document.referrer alone is not dependable: it is always empty on file://
     pages and a referrer policy can strip it over http(s). A sessionStorage
     breadcrumb is scoped to the tab, survives both cases, and is cleared the
     moment the visitor opens the site in a fresh tab — which is exactly when
     we want "back" to mean "go home" instead of leaving the site.          */
  var previousPage = null;

  function recordTrail() {
    try {
      previousPage = sessionStorage.getItem(TRAIL);
      sessionStorage.setItem(TRAIL, location.href);
    } catch (e) {
      previousPage = null; // private mode / storage disabled
    }
  }

  function referrerIsThisSite() {
    if (!document.referrer) return false;
    try {
      var from = new URL(document.referrer, location.href);
      if (from.href === location.href) return false;

      // file:// pages report a null origin, so compare the folder instead.
      if (location.protocol === 'file:') {
        var folder = function (url) { return url.slice(0, url.lastIndexOf('/')); };
        return folder(from.href) === folder(location.href);
      }
      return from.origin === location.origin;
    } catch (e) {
      return false;
    }
  }

  function cameFromThisSite() {
    if (previousPage && previousPage !== location.href) return true;
    return referrerIsThisSite();
  }

  function goBack() {
    if (cameFromThisSite() && history.length > 1) history.back();
    else location.href = HOME;
  }

  /* ---------- 1. Make every back button behave like a back button ---------- */
  function wireBackButtons() {
    document.querySelectorAll('.mobile-back-btn').forEach(function (btn) {
      btn.removeAttribute('onclick');
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        goBack();
      });
      if (!btn.getAttribute('aria-label')) btn.setAttribute('aria-label', 'Go back');
    });
  }

  /* ---------- Start ---------- */
  function init() {
    recordTrail();
    wireBackButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
