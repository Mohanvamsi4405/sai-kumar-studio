/* Shared renderer/collector/validator for Product.input_fields - the
   admin-configured extra "Customer Input Fields" (upload/dropdown/text) built
   in the admin catalog's field builder (admin/js/catalog.js). Every
   storefront page that has a product detail / customize / add-to-cart panel
   (studio.js, gifts.js, corporate.js, catalog.js, equipment-details.js)
   loads this once and calls the three functions below instead of each
   re-implementing upload/dropdown/text UI for admin-defined fields.

   Values collected here are meant to be merged into the cart line's
   `customization.fields = { [fieldId]: value }` - a key namespace separate
   from each page's own ad hoc customization keys (photoData/text/...), so
   nothing existing has to change shape. See backend's
   services/product_fields.py for the matching server-side validation and
   routers/orders.py's _externalize_customization() for how uploads under
   `fields` get swapped for R2 URLs at checkout. */
(function (global) {
  /* Text-node escaping only. The textContent -> innerHTML trick escapes
     & < > but NOT quotes, so it is safe between tags and NOT safe inside an
     attribute value - use escAttr() for those. */
  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : s;
    return d.innerHTML;
  }

  /* Attribute-value escaping. Everything this file interpolates into an
     attribute (a dropdown option's value, a field's id/placeholder) comes from
     Product.input_fields, which staff author in the admin catalog's field
     builder and the backend stores verbatim - a label or option containing a
     double quote would otherwise close the attribute early and let the rest of
     the string become live markup (e.g. onmouseover=...) on a public product
     page. Matches the quote-safe escapers the rest of the storefront already
     uses for this (cart.js's escapeHtml, my-orders.js's escapeOrdAttr,
     admin/js/core.js's esc). */
  function escAttr(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /* The DOM id for one field's control. field.id is staff-authored and stored
     verbatim by the backend, and this value lands in id=/for= attributes and in
     getElementById() lookups - so it is reduced to a safe charset HERE, once,
     rather than escaped at each render site. Escaping only at render would make
     the rendered id and the id these lookups ask for disagree the moment the
     field id contained a quote or angle bracket, silently breaking collection
     and validation for that field. Uniqueness is preserved because the backend
     already rejects duplicate field ids within a product and the substitution
     is per-character. */
  function controlId(container, field) {
    const safeContainer = String(container.id || 'pf').replace(/[^A-Za-z0-9_-]/g, '_');
    const safeField = String((field && field.id) || '').replace(/[^A-Za-z0-9_-]/g, '_');
    return `${safeContainer}_${safeField}`;
  }

  const _fileStore = new WeakMap(); // container -> { [fieldId]: File[] }

  function sortedFields(product) {
    return ((product && product.input_fields) || []).slice().sort((a, b) => (a.sort || 0) - (b.sort || 0));
  }

  function renderProductFields(container, product) {
    if (!container) return;
    const fields = sortedFields(product);
    _fileStore.delete(container);
    if (!fields.length) {
      container.innerHTML = '';
      container.style.display = 'none';
      return;
    }
    container.style.display = '';
    container.innerHTML = fields.map(field => renderField(container, field)).join('');
    container.querySelectorAll('.pf-upload-input').forEach(input => {
      input.addEventListener('change', () => handleUploadChange(container, input));
    });
    // Dropdowns render as a tile grid over a hidden <select> (see
    // renderChoiceControl) - bind the tiles and paint the initial selection.
    fields.filter(f => f.type === 'dropdown').forEach(field => {
      wireChoiceControl(container, field);
      syncChoiceControl(container, field);
    });
    // Priced dropdowns (Product.input_fields option_prices) - let a page listen for
    // "pf:pricechange" to live-update its own displayed price instead of polling.
    container.querySelectorAll('.pf-dropdown-input[data-priced]').forEach(select => {
      select.addEventListener('change', () => {
        const field = fields.find(f => f.id === select.closest('.pf-field').dataset.fieldId);
        const price = field && field.option_prices ? field.option_prices[select.value] : null;
        // mrp rides along so a listener can refresh the was-price and discount
        // badge from the event alone, instead of updating the price and leaving
        // the product's own MRP beside it. Same non-null rule as
        // getSelectedPricing(), which is where the test lives.
        const pricing = getSelectedPricing(container, product);
        container.dispatchEvent(new CustomEvent('pf:pricechange', {
          bubbles: true,
          detail: { fieldId: field.id, price, mrp: pricing ? pricing.mrp : null },
        }));
      });
    });
  }

  /* Both numbers the selected option controls - { price, mrp } from this
     container's first priced dropdown, or null when the product has none or
     nothing is selected yet.

     A page showing a priced dropdown has to replace its was-price and discount
     badge as well as its price: leaving the product's own MRP on screen beside
     an option's price advertises a discount that was never calculated from
     these two numbers (a ₹1,999 "was" beside a ₹1,699 option that is simply
     the cheapest size, not a reduction). `mrp` is therefore only non-null when
     the admin gave that option its own was-price AND it is above the option's
     price - the same test renderChoiceControl() applies to the tile itself, so
     the headline and the tile can never disagree. Callers that need this
     synchronously (at render time, or at add-to-cart) use this rather than
     waiting for a pf:pricechange the initial selection never fires. */
  function getSelectedPricing(container, product) {
    if (!container) return null;
    const field = sortedFields(product).find(f => f.type === 'dropdown' && !f.multi_select && f.option_prices && Object.keys(f.option_prices).length);
    if (!field) return null;
    const el = document.getElementById(controlId(container, field));
    if (!el || !el.value) return null;
    const price = field.option_prices[el.value];
    if (!(price || price === 0)) return null;
    const mrp = (field.option_mrps || {})[el.value];
    const showMrp = (mrp || mrp === 0) && Number(mrp) > Number(price);
    return { price, mrp: showMrp ? mrp : null };
  }

  // The currently selected price from this container's first priced dropdown (if
  // any), or null if the product has none / nothing's priced yet. Callers that need
  // the value synchronously (e.g. at add-to-cart time) use this instead of the event.
  function getSelectedPrice(container, product) {
    const pricing = getSelectedPricing(container, product);
    return pricing ? pricing.price : null;
  }

  /* Formats an option's price the way the rest of the storefront writes money -
     Indian digit grouping, and paise only when the number actually has them
     (Rs 1,234 rather than Rs 1,234.00, but Rs 1,234.50 stays intact). */
  function money(value) {
    const n = Number(value);
    if (!isFinite(n)) return '';
    const hasPaise = Math.round(n * 100) % 100 !== 0;
    return '\u20B9' + n.toLocaleString('en-IN', {
      minimumFractionDigits: hasPaise ? 2 : 0,
      maximumFractionDigits: 2,
    });
  }

  /* A dropdown renders as a grid of selectable tiles rather than a <select>:
     the options on these products are variants a shopper compares (size, shape,
     quantity - often each at its own price), and a native select hides all but
     one of them behind a click, with no room for a price or a struck-through
     was-price.

     The <select> is still emitted, just visually hidden, and remains the single
     source of truth for the value. Everything downstream - collectProductFields,
     validateProductFields, getSelectedPrice, the pf:pricechange listener and any
     page reading .pf-dropdown-input - keeps reading it exactly as before, so the
     tiles are presentation and nothing else has to know they exist. Clicking one
     writes to the select and dispatches its 'change', which is what fires the
     price-change event the product pages already listen for. */
  /* Which gallery photo an option points at, as a 0-based index, or null when it
     points at none.

     option_images is optional in every sense: a product can have no mapping at
     all, and a mapped dropdown can still leave most of its options unmapped.
     Either way this returns null and the caller leaves the gallery exactly where
     it is - which is how every product behaved before mappings existed, and what
     keeps this from being a breaking change.

     Stored 1-based (the admin counts photos as 1, 2, 3 in the Photos dialog) and
     handed back 0-based for the galleries. Range is NOT checked here: the caller
     knows how many photos it actually has, and a mapping can outlive the photo it
     named. */
  function optionImageIndex(field, value) {
    const n = Number((field.option_images || {})[value]);
    return Number.isFinite(n) && n >= 1 ? Math.round(n) - 1 : null;
  }

  /* An option's own picture, shown on its tile - the swatch case
     option_images above cannot serve. option_images points at one of the
     product's OWN gallery photos, which is right for "the 10X10 looks like
     this" but wrong for a colour or a fabric: nobody wants ten swatch
     close-ups sitting in the main gallery, and there would be no photo there
     to point at anyway. option_image_urls is a picture per option instead,
     uploaded in the admin field builder and stored as a Media Library URL.

     Optional at every level, exactly like option_images: a product can have no
     pictures at all, and a field that has some can still leave options without
     one. Either way this returns null and the tile renders as the text-only
     tile it always did. */
  function optionImageUrl(field, value) {
    const url = (field.option_image_urls || {})[value];
    return url ? resolveMediaUrl(url) : null;
  }

  /* Media Library uploads are stored as site-relative "/media/<file>" paths and
     served by the backend, not by whatever is hosting these pages - the same
     reason cldOpt() (js/shared/cart-ui.js) exists. Deferred to that when it is
     loaded, so the thumbnail mapping applies too; the fallback repeats only the
     /media/ rule, so this file stays usable on a page that does not load it. */
  function resolveMediaUrl(url) {
    if (typeof global.cldOpt === 'function') return global.cldOpt(url);
    if (url && url.indexOf('/media/') === 0) return `${global.SAI_API_BASE || ''}${url}`;
    return url;
  }

  /* The photo index for whatever is currently selected, so a page can paint the
     right image as it opens rather than waiting for the first click. Mirrors
     getSelectedPrice: first single-select dropdown with a mapped selection wins,
     null if there is none. */
  function getSelectedImageIndex(container, product) {
    if (!container) return null;
    for (const field of sortedFields(product)) {
      if (field.type !== 'dropdown' || field.multi_select || !field.option_images) continue;
      const el = document.getElementById(controlId(container, field));
      if (!el || !el.value) continue;
      const index = optionImageIndex(field, el.value);
      if (index !== null) return index;
    }
    return null;
  }

  function renderChoiceControl(cid, field) {
    const options = field.options || [];
    const priced = !field.multi_select && field.option_prices && Object.keys(field.option_prices).length;
    const prices = field.option_prices || {};
    const mrps = field.option_mrps || {};
    // A priced dropdown always needs a value to price the item by, so (like
    // Studio's old quantity picker) it starts on its first option rather than
    // forcing a pick. Everything else starts with nothing selected, which is what
    // the old blank "Choose an option" entry meant.
    const initial = priced ? options[0] : null;

    const opts = options.map(o =>
      `<option value="${escAttr(o)}"${o === initial ? ' selected' : ''}>${esc(o)}</option>`).join('');
    // aria-hidden + tabindex="-1": the tiles carry the accessible radiogroup /
    // checkbox semantics, so the select must not be announced or focusable a
    // second time.
    const select = field.multi_select
      ? `<select multiple class="pf-dropdown-input pf-choice-value" id="${cid}" aria-hidden="true" tabindex="-1">${opts}</select>`
      : `<select class="pf-dropdown-input pf-choice-value" id="${cid}" aria-hidden="true" tabindex="-1"${priced ? ' data-priced="true"' : ''}>${priced ? '' : '<option value=""></option>'}${opts}</select>`;

    // One option carrying a picture makes every tile in the group a picture
    // tile, with a blank frame standing in for any option the admin hasn't
    // given one - a grid where some tiles are tall and some are one line high
    // reads as broken rather than as a deliberate mix.
    const withPictures = options.some(o => optionImageUrl(field, o));

    const tiles = options.map((o, i) => {
      const selected = !field.multi_select && o === initial;
      const price = prices[o];
      const mrp = mrps[o];
      const hasPrice = price || price === 0;
      // Struck through only when the admin actually entered a was-price above
      // the current one - a stale or equal figure would advertise a discount
      // that isn't there.
      const showMrp = hasPrice && (mrp || mrp === 0) && Number(mrp) > Number(price);
      const tabbable = field.multi_select || selected || (!initial && i === 0);
      const picture = withPictures ? optionImageUrl(field, o) : null;
      // alt="" on purpose: the option's name is right below it in the same
      // button, so describing the picture again would have a screen reader
      // announce every tile twice.
      const thumb = withPictures
        ? `<span class="pf-choice-thumb">${picture ? `<img src="${escAttr(picture)}" alt="" loading="lazy">` : ''}</span>`
        : '';
      const tile = `
        <button type="button" class="pf-choice${selected ? ' is-selected' : ''}"
                role="${field.multi_select ? 'checkbox' : 'radio'}" aria-checked="${selected ? 'true' : 'false'}"
                tabindex="${tabbable ? '0' : '-1'}" data-value="${escAttr(o)}">
          ${thumb}
          <span class="pf-choice-name">${esc(o)}</span>
          ${hasPrice ? `<span class="pf-choice-price">${money(price)}</span>` : ''}
          ${showMrp ? `<span class="pf-choice-mrp">${money(mrp)}</span>` : ''}
        </button>`;
      if (!withPictures) return tile;
      // The thumbnail is cropped square and small, so a picture tile gets its own
      // "view larger" control. It sits beside the tile button rather than inside
      // it - a button nested in a button is invalid and its click would also
      // select the option.
      const zoom = picture
        ? `<button type="button" class="pf-choice-zoom" data-value="${escAttr(o)}"
                   aria-label="View larger picture of ${escAttr(o)}" title="View larger">
             <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M10 2a8 8 0 0 1 6.32 12.9l5.39 5.4-1.41 1.41-5.4-5.39A8 8 0 1 1 10 2zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12zm1 2v3h3v2h-3v3H9v-3H6V9h3V6h2z"/></svg>
           </button>`
        : '';
      return `<div class="pf-choice-wrap">${tile}${zoom}</div>`;
    }).join('');

    return `
      <div class="pf-choices${withPictures ? ' has-pictures' : ''}" id="${cid}_choices"
           role="${field.multi_select ? 'group' : 'radiogroup'}"
           aria-labelledby="${cid}_label">${tiles}</div>
      ${select}`;
  }

  /* Full-screen picture viewer, shared by the option-picture tiles below and
     the product pages' main gallery (exported as ProductFields.openImageViewer).
     Shows the picture uncropped at full resolution, with a thumbnail strip to
     jump between pictures, and zoom: + / - buttons, mouse wheel, double-click,
     pinch on a phone, and drag to pan around a zoomed picture.

     openImageViewer({ items, index, label, onChoose, isChosen })
       items:    [{ url, thumb?, title?, subtitle?, value? }]
       onChoose: optional - shows a "Choose this" button that calls it with the
                 current item's value (used by the option tiles).
     One overlay is built lazily and reused. */
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 5;
  let _viewer = null;

  function buildViewer() {
    const el = document.createElement('div');
    el.className = 'pf-lightbox';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.innerHTML = `
      <div class="pf-lightbox-panel">
        <button type="button" class="pf-lightbox-close" aria-label="Close">&times;</button>
        <div class="pf-lightbox-stage">
          <img class="pf-lightbox-img" alt="" draggable="false">
          <button type="button" class="pf-lightbox-nav pf-lightbox-prev" aria-label="Previous picture">&#8249;</button>
          <button type="button" class="pf-lightbox-nav pf-lightbox-next" aria-label="Next picture">&#8250;</button>
          <div class="pf-lightbox-zoom" role="group" aria-label="Zoom">
            <button type="button" class="pf-zoom-out" aria-label="Zoom out">&minus;</button>
            <span class="pf-zoom-level" aria-live="polite">100%</span>
            <button type="button" class="pf-zoom-in" aria-label="Zoom in">+</button>
            <button type="button" class="pf-zoom-fit" aria-label="Fit to screen">Fit</button>
          </div>
        </div>
        <div class="pf-lightbox-thumbs" role="tablist" aria-label="Pictures"></div>
        <div class="pf-lightbox-footer">
          <div class="pf-lightbox-caption">
            <span class="pf-lightbox-name"></span>
            <span class="pf-lightbox-price"></span>
          </div>
          <span class="pf-lightbox-count"></span>
          <button type="button" class="pf-lightbox-choose"></button>
        </div>
      </div>`;
    document.body.appendChild(el);

    const stage = el.querySelector('.pf-lightbox-stage');
    const img = el.querySelector('.pf-lightbox-img');
    const v = { el, state: null, lastFocus: null, zoom: { s: 1, x: 0, y: 0 } };

    /* ---- zoom / pan ---- */
    // Keeps the zoomed picture covering the stage: it can't be dragged so far
    // that a gap opens up beside it.
    const clampPan = () => {
      const z = v.zoom;
      const maxX = Math.max(0, (img.offsetWidth * z.s - stage.clientWidth) / 2);
      const maxY = Math.max(0, (img.offsetHeight * z.s - stage.clientHeight) / 2);
      z.x = Math.min(maxX, Math.max(-maxX, z.x));
      z.y = Math.min(maxY, Math.max(-maxY, z.y));
    };
    const applyZoom = () => {
      const z = v.zoom;
      if (z.s <= ZOOM_MIN) { z.s = ZOOM_MIN; z.x = 0; z.y = 0; }
      clampPan();
      img.style.transform = `translate(${z.x}px, ${z.y}px) scale(${z.s})`;
      stage.classList.toggle('is-zoomed', z.s > ZOOM_MIN);
      el.querySelector('.pf-zoom-level').textContent = `${Math.round(z.s * 100)}%`;
      el.querySelector('.pf-zoom-out').disabled = z.s <= ZOOM_MIN;
      el.querySelector('.pf-zoom-in').disabled = z.s >= ZOOM_MAX;
      el.querySelector('.pf-zoom-fit').disabled = z.s <= ZOOM_MIN;
    };
    // Zoom to `next`, keeping the point under (clientX, clientY) where it is -
    // so wheel/pinch zoom into what the shopper is pointing at, not the centre.
    const zoomTo = (next, clientX, clientY) => {
      const z = v.zoom;
      next = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
      const r = stage.getBoundingClientRect();
      const cx = (clientX === undefined ? r.left + r.width / 2 : clientX) - (r.left + r.width / 2);
      const cy = (clientY === undefined ? r.top + r.height / 2 : clientY) - (r.top + r.height / 2);
      const px = (cx - z.x) / z.s;
      const py = (cy - z.y) / z.s;
      z.x = cx - px * next;
      z.y = cy - py * next;
      z.s = next;
      applyZoom();
    };
    const resetZoom = () => { v.zoom = { s: 1, x: 0, y: 0 }; applyZoom(); };

    stage.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoomTo(v.zoom.s * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    }, { passive: false });
    img.addEventListener('load', resetZoom);
    window.addEventListener('resize', () => { if (!el.hidden) applyZoom(); });

    // Pointer events cover mouse, pen and touch alike: a click/tap on the picture
    // zooms in on that spot (or back out when already zoomed), one pointer drags
    // a zoomed picture (or swipes to the next one when not zoomed), two pinch.
    const pointers = new Map();
    let gesture = null;
    stage.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      stage.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = Array.from(pointers.values());
      if (pts.length === 2) {
        gesture = {
          type: 'pinch', s: v.zoom.s,
          dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
        };
      } else if (pts.length === 1) {
        // tap: still a candidate for click-to-zoom until it moves or a second
        // finger joins; only a press that started on the picture itself counts.
        gesture = { type: 'drag', sx: e.clientX, sy: e.clientY, x: v.zoom.x, y: v.zoom.y, tap: e.target === img };
      }
    });
    stage.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = Array.from(pointers.values());
      if (gesture && gesture.type === 'pinch' && pts.length === 2) {
        const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        zoomTo(gesture.s * dist / gesture.dist, (pts[0].x + pts[1].x) / 2, (pts[0].y + pts[1].y) / 2);
      } else if (gesture && gesture.type === 'drag') {
        if (Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy) > 6) gesture.tap = false;
        if (v.zoom.s <= ZOOM_MIN) return;
        v.zoom.x = gesture.x + (e.clientX - gesture.sx);
        v.zoom.y = gesture.y + (e.clientY - gesture.sy);
        applyZoom();
      }
    });
    const endPointer = (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      // A click/tap (no drag) toggles zoom at that spot: in to 250%, or back out.
      if (gesture && gesture.type === 'drag' && gesture.tap && e.type === 'pointerup' && !pointers.size) {
        zoomTo(v.zoom.s > ZOOM_MIN ? ZOOM_MIN : 2.5, e.clientX, e.clientY);
        gesture = null;
        return;
      }
      // A sideways swipe on an un-zoomed picture moves to the next one.
      if (gesture && gesture.type === 'drag' && v.zoom.s <= ZOOM_MIN && e.type === 'pointerup') {
        const dx = e.clientX - gesture.sx;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(e.clientY - gesture.sy)) v.step(dx < 0 ? 1 : -1);
      }
      // Lifting one finger of a pinch hands over to a drag from where it is.
      if (pointers.size === 1) {
        const p = Array.from(pointers.values())[0];
        gesture = { type: 'drag', sx: p.x, sy: p.y, x: v.zoom.x, y: v.zoom.y };
      } else if (!pointers.size) {
        gesture = null;
      }
    };
    stage.addEventListener('pointerup', endPointer);
    stage.addEventListener('pointercancel', endPointer);

    /* ---- navigation ---- */
    const close = () => {
      el.hidden = true;
      document.body.classList.remove('pf-lightbox-open');
      if (v.lastFocus && v.lastFocus.focus) v.lastFocus.focus();
      v.state = null;
    };
    v.step = (d) => {
      const s = v.state;
      if (!s || s.items.length < 2) return;
      s.index = (s.index + d + s.items.length) % s.items.length;
      v.show();
    };
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('.pf-lightbox-close')) close();
      else if (e.target.closest('.pf-lightbox-prev')) v.step(-1);
      else if (e.target.closest('.pf-lightbox-next')) v.step(1);
      else if (e.target.closest('.pf-zoom-in')) zoomTo(v.zoom.s * 1.5);
      else if (e.target.closest('.pf-zoom-out')) zoomTo(v.zoom.s / 1.5);
      else if (e.target.closest('.pf-zoom-fit')) resetZoom();
      else if (e.target.closest('.pf-lightbox-thumb')) {
        v.state.index = Number(e.target.closest('.pf-lightbox-thumb').dataset.index);
        v.show();
      } else if (e.target.closest('.pf-lightbox-choose')) {
        const s = v.state;
        if (s && s.onChoose) s.onChoose(s.items[s.index].value);
        close();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (el.hidden) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') v.step(-1);
      else if (e.key === 'ArrowRight') v.step(1);
      else if (e.key === '+' || e.key === '=') zoomTo(v.zoom.s * 1.5);
      else if (e.key === '-') zoomTo(v.zoom.s / 1.5);
      else if (e.key === '0') resetZoom();
    });

    v.show = () => {
      const s = v.state;
      const it = s.items[s.index];
      resetZoom();
      img.src = it.url;
      img.alt = it.title || '';
      el.querySelector('.pf-lightbox-name').textContent = it.title || '';
      el.querySelector('.pf-lightbox-price').textContent = it.subtitle || '';
      el.querySelector('.pf-lightbox-count').textContent =
        s.items.length > 1 ? `${s.index + 1} / ${s.items.length}` : '';
      el.querySelectorAll('.pf-lightbox-nav').forEach(b => { b.hidden = s.items.length < 2; });
      // A strip of every picture under the big one, so the shopper can jump
      // straight to any of them instead of stepping through with arrows.
      const strip = el.querySelector('.pf-lightbox-thumbs');
      strip.hidden = s.items.length < 2;
      if (strip.dataset.for !== s.key) {
        strip.dataset.for = s.key;
        strip.innerHTML = s.items.map((x, i) => `
          <button type="button" class="pf-lightbox-thumb" role="tab" data-index="${i}"
                  aria-label="${escAttr(x.title || `Picture ${i + 1}`)}"${x.title ? ` title="${escAttr(x.title)}"` : ''}>
            <img src="${escAttr(x.thumb || x.url)}" alt="" loading="lazy">
            ${x.title ? `<span>${esc(x.title)}</span>` : ''}
          </button>`).join('');
      }
      strip.querySelectorAll('.pf-lightbox-thumb').forEach((b, i) => {
        const on = i === s.index;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
      const btn = el.querySelector('.pf-lightbox-choose');
      btn.hidden = !s.onChoose;
      if (s.onChoose) {
        const chosen = !!(s.isChosen && s.isChosen(it.value));
        btn.textContent = chosen ? 'Selected' : 'Choose this';
        btn.disabled = chosen;
      }
      // The caption bar only when it has something to show.
      el.querySelector('.pf-lightbox-footer').hidden =
        !it.title && !it.subtitle && !s.onChoose && s.items.length < 2;
    };
    return v;
  }

  function openImageViewer(opts) {
    const items = ((opts && opts.items) || []).filter(it => it && it.url);
    if (!items.length) return;
    if (!_viewer) _viewer = buildViewer();
    const index = Math.min(items.length - 1, Math.max(0, Number(opts.index) || 0));
    _viewer.el.setAttribute('aria-label', opts.label || 'Picture viewer');
    // key: rebuild the thumbnail strip only when a different set of pictures is
    // opened, not on every step.
    _viewer.state = {
      items, index, key: items.map(it => it.url).join('|'),
      onChoose: opts.onChoose || null, isChosen: opts.isChosen || null,
    };
    _viewer.lastFocus = document.activeElement;
    _viewer.el.hidden = false;
    document.body.classList.add('pf-lightbox-open');
    _viewer.show();
    _viewer.el.querySelector('.pf-lightbox-close').focus();
  }

  /* The option tiles' "view larger" button: every pictured option in the field,
     captioned with its name and price, with "Choose this" to pick one. */
  function openOptionLightbox(field, startValue, onChoose, getSelected) {
    const options = (field.options || []).filter(o => optionImageUrl(field, o));
    const prices = field.option_prices || {};
    openImageViewer({
      label: field.label || 'Option picture',
      index: Math.max(0, options.indexOf(startValue)),
      items: options.map(o => ({
        value: o,
        // Original, never a THUMB_MAP thumbnail - this is the zoom view.
        url: typeof global.fullImg === 'function'
          ? global.fullImg((field.option_image_urls || {})[o])
          : optionImageUrl(field, o),
        thumb: optionImageUrl(field, o),
        title: o,
        subtitle: (prices[o] || prices[o] === 0) ? money(prices[o]) : '',
      })),
      onChoose,
      isChosen: value => getSelected().indexOf(value) !== -1,
    });
  }

  /* Reflects the tile grid from its <select> and updates the "Label: <selected>"
     line - called after every click so the two can never drift apart, and once
     at render time for the initial selection. */
  function syncChoiceControl(container, field) {
    const cid = controlId(container, field);
    const select = document.getElementById(cid);
    const grid = document.getElementById(`${cid}_choices`);
    if (!select || !grid) return;
    const chosen = field.multi_select
      ? Array.from(select.selectedOptions).map(o => o.value)
      : (select.value ? [select.value] : []);
    grid.querySelectorAll('.pf-choice').forEach(tile => {
      const on = chosen.indexOf(tile.dataset.value) !== -1;
      tile.classList.toggle('is-selected', on);
      tile.setAttribute('aria-checked', on ? 'true' : 'false');
      // Roving tabindex on a radiogroup: exactly one tile sits in the tab order
      // and the arrow keys move between them, the way a native radio set works.
      // Checkboxes stay individually tabbable.
      if (!field.multi_select) tile.tabIndex = on ? 0 : -1;
    });
    if (!field.multi_select && !chosen.length) {
      const first = grid.querySelector('.pf-choice');
      if (first) first.tabIndex = 0;
    }
    const current = document.getElementById(`${cid}_current`);
    if (current) current.textContent = chosen.join(', ');
  }

  function wireChoiceControl(container, field) {
    const cid = controlId(container, field);
    const select = document.getElementById(cid);
    const grid = document.getElementById(`${cid}_choices`);
    if (!select || !grid) return;

    const choose = (tile) => {
      const value = tile.dataset.value;
      if (field.multi_select) {
        Array.from(select.options).forEach(o => {
          if (o.value === value) o.selected = !o.selected;
        });
      } else {
        select.value = value;
      }
      syncChoiceControl(container, field);
      // Dispatched on the select, not the tile: the priced-dropdown listener in
      // renderProductFields() (and any page listening for a plain 'change' on
      // .pf-dropdown-input) is bound there.
      select.dispatchEvent(new Event('change', { bubbles: true }));

      // Options can name one of the product's photos, in which case picking one
      // swaps the gallery's main image to it (see optionImageIndex). Nothing is
      // emitted for an unmapped option, so a page's gallery is only ever touched
      // when an admin has actually asked for it. On a multi-select, only turning
      // an option ON moves the gallery - un-ticking one has no obvious photo to
      // move to.
      const turnedOn = field.multi_select
        ? Array.from(select.selectedOptions).some(o => o.value === value)
        : true;
      const index = turnedOn ? optionImageIndex(field, value) : null;
      if (index !== null) {
        container.dispatchEvent(new CustomEvent('pf:imagechange', {
          bubbles: true, detail: { fieldId: field.id, index },
        }));
      }
    };

    grid.addEventListener('click', (e) => {
      const zoom = e.target.closest('.pf-choice-zoom');
      if (zoom && grid.contains(zoom)) {
        openOptionLightbox(field, zoom.dataset.value, (value) => {
          const tile = Array.from(grid.querySelectorAll('.pf-choice')).find(t => t.dataset.value === value);
          // Choosing from the lightbox only ever turns an option on - toggling a
          // ticked multi-select option off from a "Choose this" button would be
          // the opposite of what it says.
          if (tile && !(field.multi_select && tile.classList.contains('is-selected'))) choose(tile);
        }, () => Array.from(grid.querySelectorAll('.pf-choice.is-selected')).map(t => t.dataset.value));
        return;
      }
      const tile = e.target.closest('.pf-choice');
      if (tile && grid.contains(tile)) choose(tile);
    });

    // Space/Enter already activates a <button>, so only the radiogroup's arrow
    // keys need wiring.
    if (field.multi_select) return;
    grid.addEventListener('keydown', (e) => {
      const step = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
      if (!step) return;
      const tiles = Array.from(grid.querySelectorAll('.pf-choice'));
      const from = tiles.indexOf(e.target.closest('.pf-choice'));
      if (from === -1 || !tiles.length) return;
      e.preventDefault();
      const next = tiles[(from + step + tiles.length) % tiles.length];
      choose(next);
      next.focus();
    });
  }

  /* A "product link" field: not a question but a signpost to other versions of
     this product (e.g. the black & white and sepia ones). The backend resolves
     `field.links` to each target's current picture/URL and short name, and
     drops any target that is gone - see public_input_fields() in
     backend/app/routers/catalog.py. Nothing is collected or validated for it.

     Rendered Amazon's "other styles" way: the field's label as the heading,
     then one row of picture tiles - just the photo and its short name - so
     four or five versions line up neatly instead of stacking as long cards. */
  function linkTileHTML(link) {
    // Only our own same-site page links ("gifts.html?..."), as the backend builds
    // them - never an arbitrary or javascript: URL.
    if (!link || !/^[a-z-]+\.html\?/.test(String(link.url || ''))) return '';
    const image = link.image ? resolveMediaUrl(link.image) : '';
    return `
      <a class="pf-link-tile" href="${escAttr(link.url)}" title="${escAttr(link.title || link.label || '')}">
        <span class="pf-link-thumb">${image ? `<img src="${escAttr(image)}" alt="" loading="lazy">` : ''}</span>
        <span class="pf-link-name">${esc(link.label || link.title || '')}</span>
      </a>`;
  }

  function renderLinkField(field) {
    const tiles = (field.links || []).map(linkTileHTML).join('');
    if (!tiles) return '';
    return `
      <div class="pf-field pf-field-link" data-field-id="${escAttr(field.id)}" data-field-type="link">
        <span class="pf-label">${esc(field.label)}</span>
        <div class="pf-link-tiles">${tiles}</div>
        ${field.help_text ? `<div class="pf-help">${esc(field.help_text)}</div>` : ''}
      </div>`;
  }

  function renderField(container, field) {
    if (field.type === 'link') return renderLinkField(field);
    const cid = controlId(container, field);
    const req = field.required ? '<span class="pf-required">*</span>' : '';
    const help = field.help_text ? `<div class="pf-help">${esc(field.help_text)}</div>` : '';
    // A tile grid has no closed state to read the answer off, so the chosen
    // option is echoed next to the label instead - the one thing a <select>
    // gave for free. Filled in by syncChoiceControl(); empty until something
    // is picked, and the ":" separator is hidden with it via :empty in CSS.
    const chosen = field.type === 'dropdown' ? `<span class="pf-choice-current" id="${cid}_current"></span>` : '';
    let control = '';
    if (field.type === 'text') {
      // maxlength mirrors the server-side cap in services/product_fields.py so
      // an over-long answer is stopped at the keyboard rather than at checkout.
      const textMax = Number(field.max_length) > 0 ? Number(field.max_length) : 500;
      control = `<input type="text" class="pf-text-input" id="${cid}" maxlength="${textMax}" placeholder="${escAttr(field.placeholder || '')}">`;
    } else if (field.type === 'dropdown') {
      control = renderChoiceControl(cid, field);
    } else if (field.type === 'upload') {
      const max = field.multiple ? (field.max_files || 1) : 1;
      // The limit is stated up front: before this the only sign of it was a
      // count that appeared after picking, so customers picked 10 photos for a
      // 6-photo frame and the extras were silently dropped.
      const limit = max > 1 ? `Upload up to ${max} photos` : 'Upload 1 photo';
      control = `
        <span class="pf-upload-limit">${limit} &middot; max ${MAX_UPLOAD_MB} MB each</span>
        <label class="pf-upload-btn" for="${cid}">${max > 1 ? 'Choose photos' : 'Choose a photo'}</label>
        <input type="file" accept="image/*" class="pf-upload-input" id="${cid}" data-max-files="${max}" ${max > 1 ? 'multiple' : ''}>
        <div class="pf-upload-status" id="${cid}_status"></div>
        <div class="pf-upload-list" id="${cid}_list"></div>`;
    }
    // A dropdown's label points at the tile grid (via the grid's aria-labelledby)
    // rather than carrying for=, which would send a click to the hidden <select>.
    const labelEl = field.type === 'dropdown'
      ? `<span class="pf-label" id="${cid}_label">${esc(field.label)}${req}${chosen}</span>`
      : `<label class="pf-label" for="${cid}">${esc(field.label)}${req}</label>`;
    return `
      <div class="pf-field" data-field-id="${escAttr(field.id)}" data-field-type="${escAttr(field.type)}">
        ${labelEl}
        ${control}
        ${help}
        <div class="pf-error" id="${cid}_err"></div>
      </div>`;
  }

  function handleUploadChange(container, input) {
    const field = input.closest('.pf-field');
    const fieldId = field.dataset.fieldId;
    const max = parseInt(input.dataset.maxFiles || '1', 10);
    let store = _fileStore.get(container);
    if (!store) { store = {}; _fileStore.set(container, store); }
    const incoming = Array.from(input.files || []);
    input.value = '';
    if (!incoming.length) return;
    // A single-photo field swaps the photo: appending would keep the first
    // pick and silently ignore every later one.
    const existing = max === 1 ? [] : (store[fieldId] || []);
    const combined = existing.concat(incoming);
    const dropped = Math.max(0, combined.length - max);
    if (max === 1) (store[fieldId] || []).forEach(revokePreview);
    combined.slice(max).forEach(revokePreview);
    store[fieldId] = combined.slice(0, max);
    renderUploadList(container, input, fieldId, store[fieldId], dropped);
  }

  // Object URLs for the thumbnails, one per File, released when the photo is
  // removed so a customer swapping photos repeatedly doesn't pin them all in memory.
  const _previewUrls = new WeakMap();
  function previewUrl(file) {
    if (!_previewUrls.has(file)) _previewUrls.set(file, URL.createObjectURL(file));
    return _previewUrls.get(file);
  }
  function revokePreview(file) {
    const url = _previewUrls.get(file);
    if (url) { URL.revokeObjectURL(url); _previewUrls.delete(file); }
  }

  function renderUploadList(container, input, fieldId, files, dropped = 0) {
    const list = document.getElementById(`${input.id}_list`);
    if (!list) return;
    const max = parseInt(input.dataset.maxFiles || '1', 10);
    // Thumbnails rather than filename chips: phone photo names
    // ("IMG-20241012-WA0012...jpg") are one unbreakable word that pushed the
    // remove button out of its chip, hiding it for some photos. The button now
    // sits inside a fixed-size tile, so a name can never move it.
    list.innerHTML = files.map((f, i) => `
      <div class="pf-upload-thumb" title="${escAttr(f.name)}">
        <img src="${previewUrl(f)}" alt="">
        <button type="button" class="pf-upload-remove" data-i="${i}" aria-label="Remove ${escAttr(f.name)}">&times;</button>
      </div>
    `).join('');
    list.querySelectorAll('.pf-upload-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const store = _fileStore.get(container);
        const [removed] = store[fieldId].splice(parseInt(btn.dataset.i, 10), 1);
        if (removed) revokePreview(removed);
        renderUploadList(container, input, fieldId, store[fieldId]);
      });
    });

    const full = max > 1 && files.length >= max;
    const btn = container.querySelector(`label.pf-upload-btn[for="${CSS.escape(input.id)}"]`);
    input.disabled = full;
    if (btn) {
      btn.classList.toggle('is-disabled', full);
      btn.textContent = max === 1
        ? (files.length ? 'Change photo' : 'Choose a photo')
        : (full ? `All ${max} photos added` : (files.length ? 'Add more photos' : 'Choose photos'));
    }
    const status = document.getElementById(`${input.id}_status`);
    if (status) {
      let text = '';
      if (max > 1 && files.length) {
        text = `${files.length} of ${max} photos added`;
        if (!full) text += ` - you can add ${max - files.length} more`;
      }
      if (dropped) text += `${text ? '. ' : ''}Only ${max} photo${max > 1 ? 's are' : ' is'} allowed, so ${dropped} ${dropped > 1 ? 'were' : 'was'} not added.`;
      status.textContent = text;
      status.classList.toggle('is-warning', !!dropped);
    }
  }

  // A raw phone-camera photo (often 3-10MB) read straight into a base64 data:
  // URI and stored in the cart's localStorage entry can blow past the ~5-10MB
  // per-origin quota, especially with 2+ customized items in the cart at once -
  // saveCart() then throws, the fallback silently drops the photo (keeping
  // only its filename), and the customer sees "the photo itself was too large
  // to store" despite believing they'd attached it. Downscaling here (matching
  // the resize already used by the older hardcoded-customizer upload flow -
  // see gifts.js's resizeUploadedImage) keeps ample resolution for print while
  // reliably fitting in localStorage; the backend's own Pillow pipeline
  // (services/media.py) still validates/re-encodes it again at checkout.
  const MAX_UPLOAD_SIDE = 1600;
  const UPLOAD_JPEG_QUALITY = 0.85;
  // Ceiling for a photo kept INLINE in the cart (the fallback path only - an
  // uploaded photo is a URL and has no such limit). localStorage allows roughly
  // 5MB per origin for the whole cart, shared across every line, and browsers
  // store strings as UTF-16, so the usable budget for base64 characters is
  // smaller than the nominal quota suggests. 1.2M characters (~900KB of image)
  // leaves room for several customized lines at once.
  const MAX_INLINE_DATA_URI_CHARS = 1200000;
  // Must match the backend's own hard limit (services/media.py MAX_SIZE) -
  // checked in validateProductFields() before add-to-cart so an oversized raw
  // file can't slip through just because this shared field type has no per-file
  // size check of its own. Both of these are exported, and every other customer
  // upload on the storefront (studio.js, corporate.js's photo/logo pickers,
  // gifts.js's hardcoded customizer flows) reads them from there rather than
  // repeating the number - each used to carry its own copy, which is how the
  // limit and the wording shown beside it drifted apart.
  const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
  const MAX_UPLOAD_MB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));

  /* Turns a picked file into the value stored on the cart line.

     Preferred path: upload it to the server, which validates and re-encodes it,
     stores it in R2, and returns a URL - so the cart line carries ~100
     characters instead of several megabytes of base64.

     That matters for three reasons. localStorage has a ~5MB quota, and a single
     raw photo could exhaust it, at which point saveCart() threw and "Add to
     cart" simply failed (the resize below only triggered on images wider than
     1600px, so a smaller-but-heavier PNG - a phone screenshot, an AI-generated
     image - sailed through at full size). The cart is also pushed to the server
     in full on every change, so every base64 photo was re-uploaded on each
     quantity tap and stored in cart_items.customization. And a photo kept at
     full quality prints better than one downscaled to fit a browser limit.

     Fallback: if the upload fails, or the customer isn't signed in yet, keep
     the old inline behaviour rather than blocking them from ordering. Checkout
     still understands both shapes, and still externalizes any base64 that
     reaches it. The size ceiling is what it always was. */
  async function fileToStoredValue(file) {
    const canUpload = typeof CustomerAuth !== 'undefined'
      && typeof CustomerAuth.uploadArtwork === 'function'
      && typeof isCustomerLoggedIn === 'function' && isCustomerLoggedIn();
    if (canUpload) {
      try {
        const result = await CustomerAuth.uploadArtwork(file);
        if (result && result.url) return result.url;
      } catch (e) {
        // Network blip, storage not configured, server rejection - fall through
        // to the inline path so the customer can still place the order.
        console.warn('Artwork upload failed, keeping the photo inline for now', e);
      }
    }
    return fileToDataUri(file);
  }

  /* For the older gifts customizers, which keep a downscaled copy of the photo
     for their on-screen preview: swaps that preview copy for the ORIGINAL file,
     uploaded untouched, at add-to-cart time - so what gets printed is what the
     customer picked, not a 900px JPEG. `previewValue` is returned unchanged when
     there's nothing to swap (no photo, photo since removed, not signed in, or the
     upload failed), so the order still goes through exactly as before. */
  // One upload per picked file: adding the same photo twice reuses the URL, so
  // the cart sees the same configuration (qty 2) rather than two different ones.
  const _originalUrls = new WeakMap();

  async function originalPhotoValue(file, previewValue) {
    if (!file || !previewValue) return previewValue;
    if (_originalUrls.has(file)) return _originalUrls.get(file);
    const canUpload = typeof CustomerAuth !== 'undefined'
      && typeof CustomerAuth.uploadArtwork === 'function'
      && typeof isCustomerLoggedIn === 'function' && isCustomerLoggedIn();
    if (!canUpload) return previewValue;
    try {
      const result = await CustomerAuth.uploadArtwork(file);
      if (result && result.url) {
        _originalUrls.set(file, result.url);
        return result.url;
      }
    } catch (e) {
      console.warn('Original photo upload failed, keeping the preview copy', e);
    }
    return previewValue;
  }

  function fileToDataUri(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const rawDataUri = reader.result;
        // Non-image uploads (a future field type, or an unexpected accept
        // override) pass through unresized - only photos are ever this large.
        if (!file.type || !file.type.startsWith('image/')) {
          resolve(rawDataUri);
          return;
        }
        const img = new Image();
        img.onerror = () => resolve(rawDataUri); // not a decodable image - let the backend reject it, don't block the upload here
        img.onload = () => {
          const scale = Math.min(1, MAX_UPLOAD_SIDE / Math.max(img.width, img.height));
          // Re-encode when the image is too big in PIXELS *or* in BYTES. Testing
          // only the pixel dimensions was the bug behind "your browser storage is
          // full": a 1024x1024 PNG is well inside MAX_UPLOAD_SIDE but can weigh
          // several MB, so it was passed through untouched and blew the ~5MB
          // localStorage quota once base64 added its ~33% on top. Dimensions and
          // file size are not the same measurement.
          if (scale >= 1 && rawDataUri.length <= MAX_INLINE_DATA_URI_CHARS) { resolve(rawDataUri); return; }
          // Step down until it actually fits, rather than encoding once and
          // hoping. A single pass at 1600px/0.85 is usually ample, but a dense
          // photo can still land over budget, and "over budget" here means the
          // add-to-cart fails - so keep shrinking instead of handing back
          // something that cannot be stored. Bounded to a few attempts; the
          // last one is small enough that it always fits.
          const attempts = [
            [scale, UPLOAD_JPEG_QUALITY], [scale, 0.7],
            [scale * 0.75, 0.7], [scale * 0.5, 0.65], [scale * 0.35, 0.6],
          ];
          const canvas = document.createElement('canvas');
          let out = null;
          for (const [s, quality] of attempts) {
            canvas.width = Math.max(1, Math.round(img.width * s));
            canvas.height = Math.max(1, Math.round(img.height * s));
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            out = canvas.toDataURL('image/jpeg', quality);
            if (out.length <= MAX_INLINE_DATA_URI_CHARS) break;
          }
          resolve(out);
        };
        img.src = rawDataUri;
      };
      reader.readAsDataURL(file);
    });
  }

  async function collectProductFields(container, product) {
    const values = {};
    if (!container) return values;
    for (const field of sortedFields(product)) {
      if (field.type === 'text') {
        const el = document.getElementById(controlId(container, field));
        values[field.id] = el ? el.value.trim() : '';
      } else if (field.type === 'dropdown') {
        const el = document.getElementById(controlId(container, field));
        if (!el) { values[field.id] = field.multi_select ? [] : ''; continue; }
        values[field.id] = field.multi_select
          ? Array.from(el.selectedOptions).map(o => o.value)
          : el.value;
      } else if (field.type === 'upload') {
        const store = _fileStore.get(container) || {};
        const files = store[field.id] || [];
        // Uploads to R2 and stores the URL where possible, falling back to an
        // inline data: URI - see fileToStoredValue.
        const stored = await Promise.all(files.map(fileToStoredValue));
        values[field.id] = field.multiple ? stored : (stored[0] || '');
      }
    }
    return values;
  }

  // Synchronous - reads the current DOM/file-selection state directly (an
  // upload field only needs to know how many files were picked, not their
  // base64 content, so this doesn't need collectProductFields' async
  // FileReader pass). Marks offending .pf-field blocks with .pf-field-error
  // for inline highlighting, same convention as studio.js's
  // validatePreviewOptions(), and returns a list of human-readable messages -
  // call this before collectProductFields()/add-to-cart, every time.
  function validateProductFields(container, product) {
    const errors = [];
    if (!container) return errors;
    container.querySelectorAll('.pf-field').forEach(el => el.classList.remove('pf-field-error'));
    sortedFields(product).forEach(field => {
      let message = null;
      if (field.type === 'text') {
        const el = document.getElementById(controlId(container, field));
        const value = el ? el.value.trim() : '';
        const textMax = Number(field.max_length) > 0 ? Number(field.max_length) : 500;
        if (field.required && !value) message = `"${field.label}" is required.`;
        else if (value.length > textMax) message = `"${field.label}" must be ${textMax} characters or fewer.`;
      } else if (field.type === 'dropdown') {
        const el = document.getElementById(controlId(container, field));
        const selected = el ? (field.multi_select ? Array.from(el.selectedOptions).map(o => o.value) : el.value) : (field.multi_select ? [] : '');
        const empty = field.multi_select ? selected.length === 0 : !selected;
        if (field.required && empty) message = `"${field.label}" is required.`;
      } else if (field.type === 'upload') {
        const store = _fileStore.get(container) || {};
        const files = store[field.id] || [];
        const max = field.multiple ? (field.max_files || 1) : 1;
        const oversized = files.find(f => f.size > MAX_UPLOAD_BYTES);
        if (field.required && files.length === 0) message = `"${field.label}" is required.`;
        else if (files.length > max) message = `"${field.label}" allows at most ${max} file(s).`;
        else if (oversized) message = `"${field.label}": "${oversized.name}" is larger than ${MAX_UPLOAD_MB} MB - please choose a smaller photo.`;
      }
      if (message) {
        errors.push(message);
        const el = container.querySelector(`.pf-field[data-field-id="${CSS.escape(field.id)}"]`);
        if (el) el.classList.add('pf-field-error');
      }
    });
    return errors;
  }

  global.ProductFields = {
    renderProductFields, collectProductFields, validateProductFields, getSelectedPrice,
    getSelectedPricing, getSelectedImageIndex, openImageViewer,
    // Exported as formatPrice so a page's headline price is written the same way
    // as the option tile it came from - the two sit next to each other, and
    // "Rs 1234.5" beside "Rs 1,234.50" reads like two different numbers.
    formatPrice: money,
    // Exposed for the older, non-input_fields upload flows (studio.js's
    // requiresPhotoUpload, corporate.js's logo/photo uploads) so they can
    // reuse the same size cap + auto-resize instead of reading a raw file
    // straight to base64 (which has no ceiling and can blow past
    // localStorage's quota on an unresized phone photo).
    fileToDataUri, fileToStoredValue, originalPhotoValue, MAX_UPLOAD_BYTES, MAX_UPLOAD_MB,
  };
})(window);
