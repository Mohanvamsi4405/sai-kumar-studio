/* Client-side mirror of backend services/pricing.py's quantity-tier ("buy 10,
   save 10%") maths, plus the storefront wording for it. Loaded by every page
   that shows a product card/detail panel and by the cart.

   Why a mirror rather than asking the server: the cart page shows a running
   total and a "spend a little more" nudge while the customer changes
   quantities, long before any request is made - and checkout (routers/orders.py)
   re-derives every price server-side and is the only authority on what is
   charged. The two therefore have to agree to the paisa, which is the same
   arrangement product-fields.js has with services/product_fields.py. Keep the
   rounding here identical to money()/_apply_bulk_discounts(): round each
   figure to 2dp with half-up, and give the last line of a group the remainder.

   Tiers reach the client already normalized (sorted by min_qty, deduped,
   labels filled) from catalog.py, so normalize() here is only a safety net for
   a page holding data cached before this feature shipped. */
(function (global) {
  function round2(n) {
    // Half-up on the absolute value, matching Python's ROUND_HALF_UP. JS's
    // Math.round is half-up toward +Infinity, which differs on negatives -
    // amounts here are never negative, but this keeps the rule explicit.
    return Math.sign(n) * Math.round(Math.abs(n) * 100 + Number.EPSILON) / 100;
  }

  function defaultLabel(minQty, type, value) {
    const amount = type === 'flat'
      ? `₹${Math.round(Number(value))} off`
      : `${Number(value)}% off`;
    return `Buy ${minQty} or more, get ${amount}`;
  }

  /* Mirrors pricing.normalize_bulk_tiers(): drops unusable rows rather than
     throwing, so one bad tier can't break a product card. */
  function normalize(raw) {
    const tiers = [];
    (raw || []).forEach((entry) => {
      if (!entry || typeof entry !== 'object') return;
      const minQty = parseInt(entry.min_qty, 10);
      let value = Number(entry.value);
      if (!(minQty >= 1) || !(value > 0)) return;
      const type = entry.type === 'flat' ? 'flat' : 'percent';
      if (type === 'percent' && value > 100) value = 100;
      let maxDiscount = entry.max_discount == null || entry.max_discount === '' ? null : Number(entry.max_discount);
      if (!(maxDiscount > 0)) maxDiscount = null;
      tiers.push({
        min_qty: minQty,
        type,
        value,
        max_discount: maxDiscount,
        label: String(entry.label || '').trim() || defaultLabel(minQty, type, value),
      });
    });
    // Two tiers at the same min_qty would otherwise make the winner depend on
    // list order - and on *whose* list order, since tierFor() below and
    // pricing.py's normalize_bulk_tiers() would not have to break the tie the
    // same way. That is the one class of divergence that shows a customer one
    // saving in the cart and charges another at checkout, so both sides apply
    // the identical rule: keep the better-value tier, preferring percent.
    const best = new Map();
    tiers.forEach((tier) => {
      const current = best.get(tier.min_qty);
      if (!current || rank(tier) > rank(current)) best.set(tier.min_qty, tier);
    });
    return Array.from(best.values()).sort((a, b) => a.min_qty - b.min_qty);
  }

  // percent and flat aren't comparable without an order value, so rank within
  // a type only and prefer percent as the more common intent.
  function rank(tier) {
    return (tier.type === 'percent' ? 1e9 : 0) + tier.value;
  }

  /* The single best tier this quantity qualifies for. Tiers don't stack: at
     qty 25 with tiers at 10 and 20, only the 20 tier applies. */
  function tierFor(tiers, qty) {
    let best = null;
    normalize(tiers).forEach((t) => {
      if (qty >= t.min_qty && (!best || t.min_qty > best.min_qty)) best = t;
    });
    return best;
  }

  /* The next tier the customer hasn't reached yet, for the "add 4 more and
     save 20%" nudge. Null once they're on the top tier. */
  function nextTier(tiers, qty) {
    const upcoming = normalize(tiers).filter((t) => qty < t.min_qty);
    return upcoming.length ? upcoming[0] : null;
  }

  /* Discount on `amount` (the value of every unit of one product) for buying
     `qty`. Mirrors pricing.bulk_discount_for(). */
  function discountFor(tiers, qty, amount) {
    const value = round2(Number(amount) || 0);
    if (!(qty >= 1) || !(value > 0)) return { tier: null, discount: 0 };
    const tier = tierFor(tiers, qty);
    if (!tier) return { tier: null, discount: 0 };
    let discount = tier.type === 'percent' ? round2(value * tier.value / 100) : round2(tier.value);
    if (tier.type === 'percent' && tier.max_discount != null) discount = Math.min(discount, tier.max_discount);
    return { tier, discount: Math.min(discount, value) };
  }

  /* Short badge for a product card: "Buy 10 save 10% · Buy 20 save 20%".
     Empty string when the product has no tiers, so a caller can use it
     directly as a render guard. */
  function badge(tiers, maxTiers) {
    const list = normalize(tiers);
    if (!list.length) return '';
    const shown = list.slice(0, maxTiers || 3).map((t) => (
      t.type === 'flat' ? `Buy ${t.min_qty} save ₹${Math.round(t.value)}` : `Buy ${t.min_qty} save ${t.value}%`
    ));
    if (list.length > (maxTiers || 3)) shown.push('& more');
    return shown.join(' · ');
  }

  /* Full offer wording, one line per tier, for a product detail panel. */
  function offerLines(tiers) {
    return normalize(tiers).map((t) => t.label);
  }

  /* Prices a whole cart's worth of quantity tiers in one pass - the client-side
     counterpart to pricing._apply_bulk_discounts(), including its
     aggregate-per-product rule and its last-line-gets-the-remainder split.

     cart:      the localStorage cart object ({ lineKey: {product_id, price, qty} })
     tiersById: { [productId]: bulk_discounts } for whatever products are known

     Returns { total, byKey, tierByKey, qtyByProduct, nextByProduct } - byKey is
     keyed by cart line so a row can show its own share, and nextByProduct
     drives the upsell nudge. */
  function priceCart(cart, tiersById, parsePrice) {
    const toNumber = parsePrice || ((v) => parseInt(String(v || '0').replace(/[^\d]/g, ''), 10) || 0);
    const groups = {};
    const byKey = {};
    const tierByKey = {};
    const qtyByProduct = {};
    const nextByProduct = {};

    Object.entries(cart || {}).forEach(([key, item]) => {
      byKey[key] = 0;
      tierByKey[key] = null;
      const pid = item && item.product_id;
      if (!pid || !(tiersById || {})[pid]) return;
      const qty = Math.max(1, parseInt(item.qty, 10) || 1);
      (groups[pid] = groups[pid] || []).push({ key, lineTotal: round2(toNumber(item.price) * qty), qty });
      qtyByProduct[pid] = (qtyByProduct[pid] || 0) + qty;
    });

    let total = 0;
    Object.entries(groups).forEach(([pid, group]) => {
      const tiers = tiersById[pid];
      const groupQty = qtyByProduct[pid];
      const groupTotal = round2(group.reduce((sum, l) => sum + l.lineTotal, 0));
      nextByProduct[pid] = nextTier(tiers, groupQty);
      const { tier, discount } = discountFor(tiers, groupQty, groupTotal);
      if (!tier || discount <= 0 || groupTotal <= 0) return;
      let allocated = 0;
      group.slice(0, -1).forEach((line) => {
        const share = round2(discount * line.lineTotal / groupTotal);
        byKey[line.key] = share;
        tierByKey[line.key] = tier;
        allocated += share;
      });
      const last = group[group.length - 1];
      byKey[last.key] = round2(discount - allocated);
      tierByKey[last.key] = tier;
      total = round2(total + discount);
    });

    return { total, byKey, tierByKey, qtyByProduct, nextByProduct };
  }

  function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : s;
    return d.innerHTML;
  }

  function moneyText(n) {
    return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
  }

  /* Renders a product page's "buy more, save more" panel into `el`, hiding it
     when the product has no tiers - so a caller can hand this any product
     without first checking. Shared by every storefront product view (gifts,
     studio, corporate) rather than each one writing the offer wording itself,
     which is how the cart and the product page came to disagree about the
     variant price before product-fields.js consolidated that.

     opts.qty / opts.unitPrice, when given, make it live: the tier the current
     quantity has reached is marked, the actual rupee saving is shown, and the
     next tier becomes an invitation. Pass them again on every quantity change. */
  function renderOfferBox(el, tiers, opts) {
    if (!el) return;
    const list = normalize(tiers);
    if (!list.length) {
      el.style.display = 'none';
      el.innerHTML = '';
      return;
    }
    const qty = Math.max(0, parseInt((opts || {}).qty, 10) || 0);
    const unitPrice = Number((opts || {}).unitPrice) || 0;
    const active = qty ? tierFor(list, qty) : null;
    const upcoming = qty ? nextTier(list, qty) : null;

    /* Tiers render as a row of chips rather than sentences: a shopper scanning
       a "buy more, save more" block wants to compare the rungs at a glance, and
       three stacked sentences make that work. The admin's own wording, when
       they set one, still appears in the call-to-action line below - that is
       where it is actually read. */
    const chips = list.map((t) => {
      const on = active && active.min_qty === t.min_qty;
      const next = !on && upcoming && upcoming.min_qty === t.min_qty;
      const amount = t.type === 'flat' ? moneyText(t.value) : `${t.value}%`;
      return `<li class="bulk-offer-tier${on ? ' is-active' : ''}${next ? ' is-next' : ''}">
        <span class="bot-qty">${t.min_qty}+</span>
        <span class="bot-save">${escHtml(amount)} off</span>
        ${on ? '<span class="bot-flag">Applied</span>' : ''}
      </li>`;
    }).join('');

    /* Both lines can appear at once, and at the quantities that matter most
       they should: someone on the 10% rung at qty 15 is exactly the person
       worth telling about the 20% rung. Showing only the saving there (as this
       first did) drops the upsell at the one moment it is most useful. */
    let saving = '';
    if (active && unitPrice > 0) {
      const res = discountFor(list, qty, round2(unitPrice * qty));
      if (res.discount > 0) {
        saving = `<p class="bulk-offer-cta is-saving">
          <span class="boc-icon" aria-hidden="true">&#10003;</span>
          You're saving <strong>${moneyText(res.discount)}</strong> on ${qty}
        </p>`;
      }
    }

    let progress = '';
    let next = '';
    if (upcoming) {
      const needed = upcoming.min_qty - qty;
      const amount = upcoming.type === 'flat' ? `${moneyText(upcoming.value)} off` : `${upcoming.value}% off`;
      // How far along they are toward the next rung, so the ask reads as
      // progress rather than as a demand.
      const pct = Math.max(6, Math.min(100, Math.round((qty / upcoming.min_qty) * 100)));
      progress = `<div class="bulk-offer-progress" role="presentation">
        <span style="width:${pct}%"></span>
      </div>`;
      next = `<p class="bulk-offer-cta">
        Add <strong>${needed}</strong> more to get <strong>${escHtml(amount)}</strong>
      </p>`;
    }
    // Order matters: what they have earned, then the bar and the ask that
    // belongs with it.
    const cta = saving + progress + next;

    el.innerHTML = `
      <div class="bulk-offer-head">
        <span class="boh-mark" aria-hidden="true">%</span>
        <span class="boh-text">Buy more, save more</span>
      </div>
      <ul class="bulk-offer-tiers">${chips}</ul>
      ${cta}
      <p class="bulk-offer-note">Applied automatically in your cart &mdash; no code needed.</p>`;
    el.style.display = '';
  }

  /* Loads { [productId]: bulk_discounts } for the whole live catalog.

     The cart needs tiers for lines it only knows by product_id: a cart line
     stores name/price/img/qty (see cart-core.js) and deliberately not the
     product's offer rules, which would then be a stale snapshot from whenever
     the line was added - an offer the admin has since changed or withdrawn
     would keep being advertised in that customer's cart indefinitely.

     /api/products is already server-cached for 30s and returns the whole active
     set in one request (see catalog.py public_products), so this is one call for
     any number of cart lines. The promise is cached per page: a failure resolves
     to {} rather than rejecting, because a cart that can't reach the catalog
     should still render and check out at full price - the server applies the
     real discount at checkout either way. */
  let catalogPromise = null;

  /* One request, shared: the cart needs a product's offer tiers AND its stock
     count, and both come from this same payload. Kept as a single cached
     promise so a cart with ten lines still makes one call. */
  function fetchCatalog() {
    if (catalogPromise) return catalogPromise;
    const base = global.SAI_API_BASE || '';
    catalogPromise = fetch(base + '/api/products?page_size=1000')
      .then((res) => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then((data) => {
        const tiers = {};
        const stock = {};
        (data.items || []).forEach((p) => {
          const t = normalize(p.bulk_discounts);
          if (t.length) tiers[p.id] = t;
          stock[p.id] = { type: p.type, stock: p.stock };
        });
        return { tiers, stock };
      })
      .catch(() => ({ tiers: {}, stock: {} }));
    return catalogPromise;
  }

  function fetchTiers() {
    return fetchCatalog().then((c) => c.tiers);
  }

  /* { [productId]: {type, stock} } for every live product - what the cart uses
     to cap a line's "+" button without a product page in front of it. */
  function fetchStock() {
    return fetchCatalog().then((c) => c.stock);
  }

  global.BulkTiers = {
    fetchTiers,
    fetchStock,
    renderOfferBox,
    normalize,
    defaultLabel,
    tierFor,
    nextTier,
    discountFor,
    badge,
    offerLines,
    priceCart,
    round2,
  };
})(window);
