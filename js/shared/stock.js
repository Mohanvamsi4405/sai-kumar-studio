/* One definition of how stock is read, worded and enforced on the storefront.

   Before this, only the gifts product page and the corporate modal knew about
   Product.stock; the studio preview showed none at all, the grid cards showed
   none anywhere, and every quantity picker let a shopper choose 99 of something
   with 3 left - the refusal only came at checkout, after they had filled in
   their address. The server is still the authority (routers/orders.py reserves
   stock atomically and rejects an oversell), but a customer should be stopped
   at the picker, not at the till.

   Stock is only meaningful for a real, stock-tracked physical product:
     type !== "product"  -> a service/booking, never limited here
     stock == null       -> an admin never set a count, so it is unlimited
   Both cases return null from limitFor(), meaning "no cap".

   Loaded by every storefront page that renders a product card, a quantity
   picker or the cart. */
(function (global) {
  /* The cap for one product, or null when it is not stock-tracked. */
  function limitFor(product) {
    if (!product) return null;
    if (product.type && product.type !== 'product') return null;
    const raw = product.stock;
    if (raw === null || raw === undefined || raw === '') return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? Math.max(0, n) : null;
  }

  function isOutOfStock(product) {
    return limitFor(product) === 0;
  }

  /* How many more of this product a shopper may add, given how many of it are
     already in their cart. Null means unlimited. */
  function remaining(product, alreadyInCart) {
    const limit = limitFor(product);
    if (limit === null) return null;
    return Math.max(0, limit - (parseInt(alreadyInCart, 10) || 0));
  }

  /* Clamps a requested quantity into [1, limit]. `max` is an extra ceiling the
     caller already applied (the pickers cap at 99). */
  function clampQty(requested, product, max) {
    const ceiling = typeof max === 'number' && max > 0 ? max : 99;
    const limit = limitFor(product);
    const top = limit === null ? ceiling : Math.min(ceiling, Math.max(1, limit));
    return Math.max(1, Math.min(top, parseInt(requested, 10) || 1));
  }

  /* The badge a card or product page shows. Returns null when there is nothing
     worth saying, so a caller can use it as a render guard.
     `lowAt` is where "Only N left" starts - 5 matches what the gifts product
     page already used before this was shared. */
  function badge(product, lowAt) {
    const limit = limitFor(product);
    if (limit === null) return null;
    if (limit <= 0) return { state: 'out', text: 'Out of stock' };
    const low = typeof lowAt === 'number' ? lowAt : 5;
    if (limit <= low) return { state: 'low', text: `Only ${limit} left` };
    return { state: 'in', text: 'In stock' };
  }

  /* Why a picker refused to go higher, for a short inline note. Null when the
     shopper has not hit the ceiling. */
  function capMessage(product, requestedQty) {
    const limit = limitFor(product);
    if (limit === null || limit <= 0) return null;
    if ((parseInt(requestedQty, 10) || 0) < limit) return null;
    return limit === 1
      ? 'Only 1 available'
      : `Only ${limit} available`;
  }

  global.StockUI = {
    limitFor,
    isOutOfStock,
    remaining,
    clampQty,
    badge,
    capMessage,
  };
})(window);
