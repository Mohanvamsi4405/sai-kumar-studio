/* "You May Also Like" with a "View more" control, shared by the three product
   views (gifts product page, corporate product modal, studio preview modal).

   Each page still decides what goes in the list and how one card looks - the
   card markup differs per page and its click handling is wired there. This only
   owns the paging: the first `initial` cards render, then a "View more" button
   under the row appends the next `step` (30) each click, with a "Showing 34 of 48"
   count, until every item is out and the button goes away.

   Callers pass the COMPLETE ordered list (best matches first, then the rest of
   that page's catalog), already without the current product. Items are
   de-duplicated here by `keyOf` as a safety net, so one product listed under two
   categories never shows twice.

   The first newly added card is scrolled into view so the click visibly does
   something.

   Loaded by every storefront page that has the section. */
(function (global) {
  const DEFAULT_INITIAL = 4;
  const DEFAULT_STEP = 30;

  function footerFor(gridEl) {
    let footer = gridEl.nextElementSibling;
    if (footer && footer.classList.contains('related-more')) return footer;
    footer = document.createElement('div');
    footer.className = 'related-more';
    footer.innerHTML = '<p class="related-more-count" aria-live="polite"></p>'
      + '<button type="button" class="related-more-btn">View more'
      + '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">'
      + '<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>'
      + '</button>';
    gridEl.insertAdjacentElement('afterend', footer);
    footer.querySelector('.related-more-btn').addEventListener('click', () => showMore(gridEl, true));
    return footer;
  }

  function updateFooter(gridEl) {
    const state = gridEl._relatedMore;
    const footer = footerFor(gridEl);
    const total = state.items.length;
    // Nothing beyond the first batch: no control, no count - same look as before.
    footer.hidden = total <= state.initial;
    const remaining = total - state.shown;
    footer.querySelector('.related-more-count').textContent = remaining > 0
      ? `Showing ${state.shown} of ${total}`
      : `Showing all ${total} products`;
    const btn = footer.querySelector('.related-more-btn');
    btn.hidden = remaining <= 0;
    btn.setAttribute('aria-label', `View ${Math.min(state.step, remaining)} more products`);
  }

  function appendRange(gridEl, from, to) {
    const state = gridEl._relatedMore;
    const before = gridEl.children.length;
    gridEl.insertAdjacentHTML('beforeend', state.items.slice(from, to).map(state.renderCard).join(''));
    const added = Array.prototype.slice.call(gridEl.children, before);
    if (state.afterAppend && added.length) state.afterAppend(added);
    return added;
  }

  function showMore(gridEl, reveal) {
    const state = gridEl._relatedMore;
    if (!state || state.shown >= state.items.length) return;
    const next = Math.min(state.items.length, state.shown + state.step);
    const added = appendRange(gridEl, state.shown, next);
    state.shown = next;
    updateFooter(gridEl);
    if (reveal && added[0] && added[0].scrollIntoView) {
      added[0].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
    }
  }

  /* gridEl:     the .related-grid container
     items:      full ordered list (current product already excluded)
     renderCard: item -> HTML string for one card
     opts:       { initial, step, keyOf(item), afterAppend(addedEls), key }
                 `key` identifies what the list is for (e.g. the current product);
                 re-rendering with the same key keeps however many cards the
                 customer had already expanded to, instead of snapping back. */
  function render(gridEl, items, renderCard, opts) {
    if (!gridEl) return;
    opts = opts || {};
    const keyOf = opts.keyOf || (item => item && (item.id != null ? item.id : item.name));
    const seen = new Set();
    const unique = (items || []).filter(item => {
      const k = String(keyOf(item));
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const initial = opts.initial || DEFAULT_INITIAL;
    const prev = gridEl._relatedMore;
    const keepShown = prev && opts.key !== undefined && prev.key === opts.key ? prev.shown : 0;
    gridEl._relatedMore = {
      items: unique,
      renderCard,
      afterAppend: opts.afterAppend || null,
      initial,
      step: opts.step || DEFAULT_STEP,
      key: opts.key,
      shown: Math.min(unique.length, Math.max(initial, keepShown)),
    };
    gridEl.innerHTML = '';
    appendRange(gridEl, 0, gridEl._relatedMore.shown);
    updateFooter(gridEl);
  }

  global.RelatedMore = { render };
})(window);
