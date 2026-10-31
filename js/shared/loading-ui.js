/* ============================================================
   Sai Kumar Digital Lab & Studio — shared loading feedback
   ------------------------------------------------------------
   Two small, self-installing helpers used across every page:
     SkLoading.button(btnEl, isLoading) - spinner + disable on any
       button, regardless of its existing markup/colors (the
       spinner overlays via currentColor so it matches the button's
       own text color instead of needing per-button CSS).
     SkLoading.wireImage(imgEl, { wrap, fallback }) - fades an image
       in once it finishes loading (instead of popping in blank/
       broken), with an optional fallback src on error and an
       optional shimmer on the wrapping element while it waits.
   Injects its own <style> tag the first time it runs, the same
   pattern js/shared/auth-modal.js uses, so no page needs its own
   CSS changes - just <script src="js/shared/loading-ui.js">.
   ============================================================ */
(function () {
  'use strict';

  function injectStyles() {
    var css =
      '.sk-btn-busy{position:relative;pointer-events:none;}' +
      '.sk-btn-busy .sk-btn-label{visibility:hidden;}' +
      '.sk-btn-spinner{display:none;}' +
      '.sk-btn-busy .sk-btn-spinner{display:block;position:absolute;left:50%;top:50%;width:16px;height:16px;' +
        'margin:-8px 0 0 -8px;border-radius:50%;border:2px solid currentColor;border-top-color:transparent;' +
        'opacity:.85;animation:sk-btn-spin .7s linear infinite;}' +
      '@keyframes sk-btn-spin{to{transform:rotate(360deg);}}' +
      // !important on opacity/transition since every page already has its own
      // "<wrap-class> img { ... }" rule (hover-zoom transforms, object-fit) that
      // is more specific than a single utility class and would otherwise win
      // the cascade and silently drop the fade-in.
      '.sk-img-fade{opacity:0 !important;transition:opacity .35s ease !important;}' +
      '.sk-img-fade.sk-img-loaded{opacity:1 !important;}' +
      '.sk-img-skel{position:relative;background:linear-gradient(90deg,#eee 25%,#f4f4f4 37%,#eee 63%);' +
        'background-size:400% 100%;animation:sk-img-shimmer 1.4s ease infinite;}' +
      '@keyframes sk-img-shimmer{0%{background-position:100% 50%;}100%{background-position:0 50%;}}' +
      '@media (prefers-reduced-motion:reduce){.sk-btn-spinner,.sk-img-skel{animation:none !important;}' +
        '.sk-img-fade{transition:none !important;}}';
    var tag = document.createElement('style');
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  function setButtonLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
      // Wrap the button's existing content (usually a bare text node, which
      // a "hide every child but the spinner" CSS rule can't target on its
      // own) in a span once, so it can be hidden/shown as a single unit on
      // every subsequent toggle without disturbing the button's real markup.
      if (!btn.querySelector(':scope > .sk-btn-label')) {
        var label = document.createElement('span');
        label.className = 'sk-btn-label';
        while (btn.firstChild) label.appendChild(btn.firstChild);
        btn.appendChild(label);
      }
      if (!btn.querySelector(':scope > .sk-btn-spinner')) {
        var spin = document.createElement('span');
        spin.className = 'sk-btn-spinner';
        btn.appendChild(spin);
      }
      btn.disabled = true;
      btn.classList.add('sk-btn-busy');
    } else {
      btn.classList.remove('sk-btn-busy');
      btn.disabled = false;
    }
  }

  function wireImage(img, opts) {
    if (!img || img.dataset.skImgWired) return;
    opts = opts || {};
    img.dataset.skImgWired = '1';
    img.classList.add('sk-img-fade');
    var wrap = opts.wrap || null;
    if (wrap) wrap.classList.add('sk-img-skel');

    function done() {
      img.classList.add('sk-img-loaded');
      if (wrap) wrap.classList.remove('sk-img-skel');
    }
    function failed() {
      if (opts.fallback && img.getAttribute('src') !== opts.fallback) {
        img.removeAttribute('onerror');
        img.src = opts.fallback;
      }
      done();
    }
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', failed, { once: true });
    // The image may already be cached/complete by the time this runs
    // (synchronous src assignment right before calling wireImage).
    if (img.complete) {
      if (img.naturalWidth > 0) done();
      else failed();
    }
  }

  injectStyles();
  window.SkLoading = {
    button: setButtonLoading,
    wireImage: wireImage,
    // A generic "no photo yet" placeholder for any product image that has
    // none/fails to load and has no better brand-specific fallback of its own.
    PLACEHOLDER_IMG: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Crect width='300' height='300' fill='%23f1e9dd'/%3E%3Ctext x='50%25' y='50%25' font-family='sans-serif' font-size='14' fill='%23a88a5c' text-anchor='middle' dominant-baseline='middle'%3ENo photo yet%3C/text%3E%3C/svg%3E",
  };
})();
