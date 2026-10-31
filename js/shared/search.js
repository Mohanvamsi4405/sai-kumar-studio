/*
  Sai Kumar Digital Lab & Studio — Nav Search Autosuggest
  Self-contained: injects its own styles + dropdown markup. Include once per page,
  after the desktop nav's ".nav-search-bar input" exists in the DOM.
*/
(function () {
  "use strict";

  var CATALOG = [
    { name: "Wedding Photography", category: "Photography", url: "photography.html?category=wedding" },
    { name: "Pre-Wedding Shoot", category: "Photography", url: "photography.html?category=prewedding" },
    { name: "Birthday Photography", category: "Photography", url: "photography.html?category=birthday" },
    { name: "Event Photography", category: "Photography", url: "photography.html?category=event" },
    { name: "Maternity Shoot", category: "Photography", url: "photography.html?category=maternity" },
    { name: "Baby Shoot", category: "Photography", url: "photography.html?category=baby" },
    { name: "Outdoor Photography", category: "Photography", url: "photography.html?category=outdoor" },
    { name: "Drone Photography", category: "Photography", url: "photography.html?category=drone" },
    { name: "Videography", category: "Photography", url: "photography.html?category=video" },
    { name: "Album Designing", category: "Photography", url: "photography.html?category=album" },
    { name: "House Warming", category: "Photography", url: "photography.html?category=housewarming" },
    { name: "Saree Function", category: "Photography", url: "photography.html?category=sareefunction" },
    { name: "Candid Photography", category: "Photography", url: "photography.html?category=candidphoto" },
    { name: "Traditional Photography", category: "Photography", url: "photography.html?category=traditionalphoto" },
    { name: "Traditional Videography", category: "Photography", url: "photography.html?category=traditionalvideo" },
    { name: "Cinematic Videography", category: "Photography", url: "photography.html?category=cinematicvideo" },
    { name: "LED Screens", category: "Photography", url: "photography.html?category=ledscreens" },

    { name: "Acrylic Frames", category: "Customised Gift Shop", url: "gifts.html?view=category&category=frames&search=acrylic" },
    { name: "Wooden Frames", category: "Customised Gift Shop", url: "gifts.html?view=category&category=frames&search=wooden" },
    { name: "Crystal Frames", category: "Customised Gift Shop", url: "gifts.html?view=category&category=frames&search=crystal" },
    { name: "LED Frames", category: "Customised Gift Shop", url: "gifts.html?view=category&category=frames&search=led" },
    { name: "Neon Frames", category: "Customised Gift Shop", url: "gifts.html?view=category&category=frames&search=neon" },
    { name: "QR Voice Frames", category: "Customised Gift Shop", url: "gifts.html?view=category&category=frames&search=qr" },
    { name: "Collage Frames", category: "Customised Gift Shop", url: "gifts.html?view=category&category=frames&search=collage" },
    { name: "Mosaic Frames", category: "Customised Gift Shop", url: "gifts.html?view=category&category=frames&search=mosaic" },
    { name: "Pencil Sketch Frames", category: "Customised Gift Shop", url: "gifts.html?view=category&category=frames&search=sketch" },
    { name: "Magic Mugs", category: "Customised Gift Shop", url: "gifts.html?view=category&category=drinkware&search=magic" },
    { name: "Heart Handle Mugs", category: "Customised Gift Shop", url: "gifts.html?view=category&category=drinkware&search=heart" },
    { name: "Photo Water Bottles", category: "Customised Gift Shop", url: "gifts.html?view=category&category=drinkware&search=bottle" },
    { name: "Heart Pillow", category: "Customised Gift Shop", url: "gifts.html?view=category&category=pillows&search=heart" },
    { name: "Magic Pillow", category: "Customised Gift Shop", url: "gifts.html?view=category&category=pillows&search=magic" },
    { name: "Kids Pillow", category: "Customised Gift Shop", url: "gifts.html?view=category&category=pillows&search=kids" },
    { name: "Book Pillow", category: "Customised Gift Shop", url: "gifts.html?view=category&category=pillows" },
    { name: "Crystal Cubes", category: "Customised Gift Shop", url: "gifts.html?view=category&category=crystal&search=cube" },
    { name: "Crystal Photo Stand", category: "Customised Gift Shop", url: "gifts.html?view=category&category=crystal&search=stand" },
    { name: "Rotate LED Crystal", category: "Customised Gift Shop", url: "gifts.html?view=category&category=crystal&search=rotat" },
    { name: "Wall Clocks", category: "Customised Gift Shop", url: "gifts.html?view=category&category=clocks" },
    { name: "Fridge Magnets", category: "Customised Gift Shop", url: "gifts.html?view=category&category=decor&search=magnet" },
    { name: "Kiddy Banks", category: "Customised Gift Shop", url: "gifts.html?view=category&category=decor&search=kiddy" },
    { name: "Keychains", category: "Customised Gift Shop", url: "gifts.html?view=category&category=accessories&search=keychain" },
    { name: "Wallets", category: "Customised Gift Shop", url: "gifts.html?view=category&category=accessories&search=wallet" },
    { name: "Diaries", category: "Customised Gift Shop", url: "gifts.html?view=category&category=accessories&search=diary" },

    { name: "Photo Printing", category: "Studio Services", url: "studio.html?category=photo_printing" },
    { name: "Passport Size Photos", category: "Studio Services", url: "studio.html?category=photo_printing" },
    { name: "Canvas Printing", category: "Studio Services", url: "studio.html?category=xerox_printing" },
    { name: "ID Card Printing", category: "Studio Services", url: "studio.html?category=id_card_printing" },
    { name: "Certificate Printing", category: "Studio Services", url: "studio.html?category=certificate_printing" },
    { name: "Photo Restoration", category: "Studio Services", url: "studio.html?category=photo_restoration" },
    { name: "Photo Editing", category: "Studio Services", url: "studio.html?category=photo_portrait" },
    { name: "Background Removal", category: "Studio Services", url: "studio.html?category=photo_portrait" },
    { name: "Photo Lamination", category: "Studio Services", url: "studio.html?category=photo_lamination" },
    { name: "Scanning", category: "Studio Services", url: "studio.html?category=scanning" },
    { name: "CD/DVD Copying", category: "Studio Services", url: "studio.html?category=cd_dvd_copying" },

    { name: "Corporate Gift Sets", category: "Corporate Gifts", url: "corporate.html?category=sets" },
    { name: "Employee Welcome Kits", category: "Corporate Gifts", url: "corporate.html?category=kits" },
    { name: "Promotional Gifts", category: "Corporate Gifts", url: "corporate.html?category=promotional" },
    { name: "Customized Branding", category: "Corporate Gifts", url: "corporate.html" },
    { name: "Mementos", category: "Corporate Gifts", url: "corporate.html?category=mementos" },
    { name: "Shields", category: "Corporate Gifts", url: "corporate.html?category=shields" },
    { name: "Trophies", category: "Corporate Gifts", url: "corporate.html?category=trophies" },
    { name: "Awards", category: "Corporate Gifts", url: "corporate.html?category=trophies" },
    { name: "Name Plates", category: "Corporate Gifts", url: "corporate.html" },
    { name: "Pens", category: "Corporate Gifts", url: "corporate.html?category=pens" },
    { name: "Diaries", category: "Corporate Gifts", url: "corporate.html?category=diaries" },
    { name: "Water Bottles", category: "Corporate Gifts", url: "corporate.html?category=bottles" }
  ];

  // Curated CATALOG above only covers the site's core service menu, not the live
  // product catalog - a product an admin adds later has no entry here and would
  // never surface in this dropdown on ANY page (this file is shared by every
  // page's header). Fetching the live list once and appending it fixes that
  // without touching the curated entries above (categories/services that aren't
  // literal database products, e.g. "Photo Editing").
  var SEARCH_API_BASE = window.SAI_API_BASE || "http://localhost:8000";
  var PAGE_LABELS = { gifts: "Customised Gift Shop", photography: "Photography", studio: "Studio Services", corporate: "Corporate Gifts" };
  var liveProductsPromise = null;

  // Builds a link straight to the product's own home page/modal instead of a
  // shared "browse everything" page (catalog.html, removed - every live product
  // it merged in only ever deep-linked back to gifts/corporate/studio/photography
  // anyway, so this is what it was already doing one hop later). Each page's own
  // product-detail deep-link scheme differs - see each script's own reader:
  // gifts.js matches ?product= by exact name; corporate.js's ?openProduct=/&pid=
  // reader (js/corporate.js ~line 2256) also wants openPrice/openImg as instant
  // display values while it looks the rest up by pid; studio.js's ?openProduct=/
  // &pid= reader (js/studio.js ~line 1290) searches the full flattened "all"
  // package list by default, so no ?category= is required for it to resolve.
  // photography.js has no per-product opener at all, so a photography product
  // can only link to its category listing, not its own modal.
  function buildProductUrl(p) {
    var name = encodeURIComponent(p.title);
    if (p.page_slug === "gifts") {
      return "gifts.html?view=product&product=" + name;
    }
    if (p.page_slug === "corporate") {
      var price = "₹" + Math.round(p.price).toLocaleString("en-IN");
      var img = (p.images && p.images[0]) || "";
      return "corporate.html?openProduct=" + name
        + "&openPrice=" + encodeURIComponent(price)
        + "&openImg=" + encodeURIComponent(img)
        + "&pid=" + encodeURIComponent(p.id);
    }
    if (p.page_slug === "studio") {
      return "studio.html?openProduct=" + name + "&pid=" + encodeURIComponent(p.id);
    }
    if (p.page_slug === "photography") {
      return "photography.html?category=" + encodeURIComponent(p.category_slug || "");
    }
    return null;
  }

  // Returns the same promise on every call, so a caller that needs the live
  // catalog to be *there* (the full-results window, which otherwise decides
  // "No products found" while the fetch is still in flight) can wait on it,
  // while the typing dropdown can keep ignoring it and just re-render later.
  function loadLiveProducts() {
    if (liveProductsPromise) return liveProductsPromise;
    liveProductsPromise = fetch(SEARCH_API_BASE + "/api/products?page_size=1000")
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        (data.items || []).forEach(function (p) {
          var url = buildProductUrl(p);
          // No known home page for this product (page/category data missing) -
          // there's nowhere sensible left to send a shopper, so leave it out of
          // search entirely rather than link to a page that doesn't exist.
          if (!url) return;
          CATALOG.push({
            name: p.title,
            category: PAGE_LABELS[p.page_slug] || p.category_name || "Catalog",
            // Admin-entered synonyms (Product.search_keywords) - lets a query like
            // "coffee cup" surface a product titled "Ceramic Mug" even though that
            // word appears in neither the name nor category above.
            keywords: p.search_keywords || [],
            // Real photo/price for the full-results overlay's product cards - the
            // curated CATALOG entries above have neither (they're category links,
            // not actual products), so those render as plain text tiles instead.
            image: (p.images && p.images[0]) || "",
            price: "₹" + Math.round(p.price).toLocaleString("en-IN"),
            url: url
          });
        });
      })
      .catch(function (err) {
        console.error("Could not load live products for search:", err);
      });
    return liveProductsPromise;
  }

  /* ========================================================================
     Shared text helpers
     ====================================================================== */

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // item.name/item.category can come from the admin-entered catalog (see
  // loadLiveProducts above: name: p.title, category: p.category_name) - unlike the
  // hardcoded CATALOG entries, that text isn't trusted and must be escaped before
  // landing in any innerHTML, same as the query text is.
  function escHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function highlight(name, query) {
    var safeName = escHtml(name);
    var safeQuery = escHtml(query);
    if (!safeQuery) return safeName;
    var re = new RegExp("(" + escapeRegExp(safeQuery) + ")", "ig");
    return safeName.replace(re, "<mark>$1</mark>");
  }

  // limit omitted (or Infinity) returns every match - used by "See all results"/
  // Enter-with-nothing-highlighted, so a broad term like "birthday" (which can
  // match dozens of products across every section) isn't artificially capped
  // the way the live-typing dropdown deliberately is.
  function filterCatalog(query, limit) {
    var q = query.trim().toLowerCase();
    if (!q) return [];
    var starts = [], contains = [];
    CATALOG.forEach(function (item) {
      var n = item.name.toLowerCase();
      var c = item.category.toLowerCase();
      var k = (item.keywords || []).join(" ").toLowerCase();
      if (n.indexOf(q) === 0) {
        starts.push(item);
      } else if (n.indexOf(q) !== -1 || c.indexOf(q) !== -1 || k.indexOf(q) !== -1) {
        contains.push(item);
      }
    });
    var all = starts.concat(contains);
    return typeof limit === "number" ? all.slice(0, limit) : all;
  }

  // What the full-results window will actually show. The curated CATALOG
  // entries are category links with no photo or price of their own, so they
  // never appear there - and must not be counted in the offer to open it.
  function productMatches(query) {
    return filterCatalog(query).filter(function (item) { return !!item.image; });
  }

  /* ========================================================================
     Style isolation

     Both the typing dropdown and the full-results window live inside a shadow
     root instead of in the page's own DOM. This file is shared by 16 pages
     whose stylesheets know nothing about it, and the previous approach - a
     global <style> plus progressively more inline style="" on every element -
     kept losing: a page rule would collapse a card's image box, the card's own
     overflow:hidden would clip the name/price away with it, and the grid rows
     would compress so later cards painted over earlier ones. Inline styles only
     win until some page ships an !important, and none of it could be *designed*
     because every property had to be defensive.

     A shadow root ends that class of bug outright: page CSS selectors cannot
     match anything inside one. Only inherited properties (font, color, ...)
     cross the boundary, and :host/* below set those explicitly. Everything here
     is therefore plain, readable CSS again.
     ====================================================================== */

  var SHADOW_RESET =
    "*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}"
    + "\n:host{font-family:'Inter','Poppins',system-ui,-apple-system,'Segoe UI',sans-serif !important;"
    + "font-size:14px !important;font-weight:400 !important;line-height:1.45 !important;"
    + "color:#161616 !important;letter-spacing:normal !important;word-spacing:normal !important;"
    + "text-transform:none !important;text-align:left !important;text-indent:0 !important;"
    + "font-style:normal !important;font-variant:normal !important;white-space:normal !important;"
    + "text-shadow:none !important;visibility:visible !important;opacity:1 !important;"
    + "direction:ltr !important;transform:none !important;filter:none !important;}"
    + "\nbutton{font:inherit;color:inherit;background:none;border:none;cursor:pointer;}"
    + "\na{color:inherit;text-decoration:none;}"
    + "\nimg{display:block;max-width:100%;}";

  var SUGGEST_CSS = SHADOW_RESET
    // The host is the one part of this widget the page can see and stack,
    // so it carries the z-index; everything else is behind the shadow boundary.
    + "\n:host{position:fixed !important;z-index:2147483000 !important;display:none !important;}"
    + "\n:host(.open){display:block !important;}"
    + "\n.panel{background:#fff;border:1px solid #ededed;border-radius:14px;"
    + "box-shadow:0 18px 44px rgba(0,0,0,.16);overflow:hidden;max-height:var(--sk-max,min(62vh,400px));overflow-y:auto;"
    + "overscroll-behavior:contain;}"
    + "\n.row{display:flex;align-items:center;gap:10px;padding:10px 16px;cursor:pointer;}"
    + "\n.row:hover,.row.active{background:#f7f7f7;}"
    + "\n.row-name{font-size:14px;font-weight:600;color:#161616;}"
    + "\n.row-name mark{background:none;color:#F97316;font-weight:800;}"
    + "\n.row-cat{margin-left:auto;font-size:11px;font-weight:700;color:#8a8a8a;white-space:nowrap;}"
    + "\n.empty{padding:14px 16px;font-size:13px;color:#6b6b6b;}"
    + "\n.empty a{color:#F97316;font-weight:700;}"
    + "\n.empty a:hover{text-decoration:underline;}"
    + "\n.seeall{display:block;width:100%;text-align:center;padding:12px 16px;border-top:1px solid #f1f1f1;"
    + "background:#fafafa;color:#F97316;font-size:13px;font-weight:700;position:sticky;bottom:0;}"
    + "\n.seeall:hover{background:#f2f2f2;}";

  var RESULTS_CSS = SHADOW_RESET
    + "\n:host{position:fixed !important;inset:0 !important;z-index:2147483001 !important;display:none !important;}"
    + "\n:host(.open){display:block !important;}"
    + "\n.scrim{position:absolute;inset:0;background:rgba(17,17,20,.58);"
    + "backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);animation:fade .18s ease;}"
    + "\n@keyframes fade{from{opacity:0}to{opacity:1}}"
    + "\n@keyframes rise{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}}"
    + "\n.wrap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:32px 20px;}"
    // grid-template-rows is what actually guarantees the layout: header and
    // footer take exactly their content height, the body gets whatever is left
    // (1fr) and scrolls inside it. minmax(0,1fr) - not plain 1fr - is what lets
    // that middle track shrink below its content instead of growing the panel
    // past its max-height and getting silently clipped. The single *column*
    // needs pinning the same way: left as the default "auto" it sizes to the
    // widest row - the chip strip - and the panel then overflows its own width
    // on a phone. min-width:0 on the tracks below is the same fix one level in.
    + "\n.panel{position:relative;display:grid;grid-template-rows:auto minmax(0,1fr) auto;"
    + "grid-template-columns:minmax(0,1fr);"
    + "width:min(1160px,100%);max-height:min(860px,calc(100vh - 64px));background:#fff;border-radius:18px;"
    + "box-shadow:0 30px 80px rgba(0,0,0,.34);overflow:hidden;animation:rise .2s cubic-bezier(.2,.8,.3,1);}"

    /* ---- header ---- */
    + "\n.head,.body,.foot{min-width:0;}"
    + "\n.head{padding:20px 24px 0;border-bottom:1px solid #eee;background:#fff;}"
    + "\n.head-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;min-width:0;}"
    + "\n.head-top>div{min-width:0;}"
    + "\n.eyebrow{font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#F97316;}"
    + "\n.title{margin-top:4px;font-size:21px;font-weight:800;color:#141414;line-height:1.25;"
    + "overflow-wrap:anywhere;}"
    + "\n.count{margin-top:3px;font-size:13px;color:#6f6f6f;}"
    + "\n.close{flex:0 0 auto;width:38px;height:38px;border-radius:50%;background:#f4f4f5;color:#3a3a3a;"
    + "display:flex;align-items:center;justify-content:center;transition:background .15s;}"
    + "\n.close:hover{background:#e8e8ea;}"
    + "\n.close:focus-visible{outline:2px solid #F97316;outline-offset:2px;}"
    + "\n.chips{display:flex;gap:8px;overflow-x:auto;padding:14px 0 12px;scrollbar-width:none;min-width:0;}"
    + "\n.chips::-webkit-scrollbar{display:none;}"
    + "\n.chips:empty{display:none;}"
    + "\n.chip{flex:0 0 auto;padding:7px 14px;border-radius:999px;border:1px solid #e4e4e7;background:#fff;"
    + "font-size:12.5px;font-weight:700;color:#4b4b4b;white-space:nowrap;transition:.15s;}"
    + "\n.chip:hover{border-color:#d4d4d8;background:#fafafa;}"
    + "\n.chip.on{background:#161616;border-color:#161616;color:#fff;}"
    + "\n.chip span{opacity:.6;font-weight:600;margin-left:5px;}"

    /* ---- scrolling body ---- */
    + "\n.body{overflow-y:auto;overscroll-behavior:contain;padding:20px 24px 24px;background:#fcfcfd;}"
    + "\n.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(182px,1fr));gap:18px 16px;"
    // max-content rows + start alignment: every row is exactly as tall as the
    // tallest card in it and rows pack from the top. Nothing can compress a row
    // so that the card overflowing it paints under the next one.
    + "grid-auto-rows:max-content;align-content:start;min-width:0;}"

    /* ---- card ---- */
    + "\n.card{display:flex;flex-direction:column;background:#fff;border:1px solid #ececef;border-radius:14px;"
    + "overflow:hidden;transition:box-shadow .16s,transform .16s,border-color .16s;}"
    + "\n.card:hover{box-shadow:0 12px 28px rgba(0,0,0,.11);border-color:#e0e0e4;transform:translateY(-2px);}"
    + "\n.card:focus-visible{outline:2px solid #F97316;outline-offset:2px;}"
    // aspect-ratio keeps the photo box proportional to the column instead of a
    // magic pixel height, and flex:0 0 auto stops it being squeezed by the text
    // block below it.
    + "\n.shot{flex:0 0 auto;position:relative;width:100%;aspect-ratio:1/1;background:#f2f2f4;overflow:hidden;}"
    + "\n.shot img{width:100%;height:100%;object-fit:cover;}"
    + "\n.shot.blank::after{content:'';position:absolute;inset:0;"
    + "background:linear-gradient(135deg,#f4f4f6 0%,#ececed 50%,#f4f4f6 100%);}"
    + "\n.info{flex:0 0 auto;display:flex;flex-direction:column;gap:4px;padding:11px 13px 13px;}"
    + "\n.name{font-size:13px;font-weight:700;color:#191919;line-height:1.35;height:2.7em;"
    + "display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}"
    + "\n.name mark{background:none;color:#F97316;font-weight:800;}"
    + "\n.price{padding-top:2px;font-size:14px;font-weight:800;color:#111;}"
    + "\n.cat{font-size:10.5px;font-weight:700;color:#8e8e93;text-transform:uppercase;letter-spacing:.04em;}"
    // Curated CATALOG entries (e.g. "Wall Clocks") are category links, not real
    // products - no photo or price to show, so they get a flat text tile rather
    // than an empty image box.
    + "\n.card.plain{justify-content:center;min-height:118px;background:#fafafa;}"
    + "\n.card.plain .info{padding:16px 14px;}"

    /* ---- skeleton ---- */
    + "\n@keyframes shimmer{from{background-position:200% 0}to{background-position:-200% 0}}"
    + "\n.sk{border:1px solid #ececef;border-radius:14px;overflow:hidden;background:#fff;}"
    + "\n.sk .b{background:linear-gradient(90deg,#f0f0f2 25%,#e6e6e9 37%,#f0f0f2 63%);background-size:200% 100%;"
    + "animation:shimmer 1.3s linear infinite;}"
    + "\n.sk .b.shot{aspect-ratio:1/1;}"
    + "\n.sk .b.l1{height:11px;margin:12px 13px 0;border-radius:4px;}"
    + "\n.sk .b.l2{height:11px;margin:8px 40% 14px 13px;border-radius:4px;}"

    /* ---- empty state ---- */
    + "\n.none{padding:54px 20px 60px;text-align:center;}"
    + "\n.none-mark{width:56px;height:56px;margin:0 auto 16px;border-radius:50%;background:#f4f4f5;"
    + "display:flex;align-items:center;justify-content:center;color:#a1a1aa;}"
    + "\n.none h3{font-size:16px;font-weight:800;color:#1c1c1c;overflow-wrap:anywhere;}"
    + "\n.none p{margin-top:6px;font-size:13.5px;color:#6f6f6f;}"
    + "\n.none-links{display:flex;flex-wrap:wrap;gap:9px;justify-content:center;margin-top:18px;}"
    + "\n.none-links a{padding:9px 16px;border:1px solid #e4e4e7;border-radius:999px;background:#fff;"
    + "font-size:13px;font-weight:700;color:#333;}"
    + "\n.none-links a:hover{border-color:#F97316;color:#F97316;}"

    /* ---- footer ---- */
    + "\n.foot{display:flex;align-items:center;justify-content:space-between;gap:16px;"
    + "padding:14px 24px;border-top:1px solid #eee;background:#fff;}"
    + "\n.foot[hidden]{display:none;}"
    + "\n.shown{font-size:12.5px;font-weight:600;color:#78787d;}"
    + "\n.more{padding:10px 22px;border-radius:10px;background:#F97316;color:#fff;font-size:13px;font-weight:800;"
    + "box-shadow:0 6px 16px rgba(249,115,22,.28);transition:background .15s;}"
    + "\n.more:hover{background:#ea6a0c;}"
    + "\n.more:focus-visible{outline:2px solid #161616;outline-offset:2px;}"
    + "\n.more[hidden]{display:none;}"

    /* ---- phones: full-height sheet, denser grid ---- */
    + "\n@media (max-width:640px){"
    + ".wrap{padding:0;}"
    + ".panel{width:100%;height:100%;max-height:none;border-radius:0;animation:none;}"
    + ".head{padding:calc(14px + env(safe-area-inset-top)) 16px 0;}"
    + ".eyebrow{display:none;}"
    + ".title{font-size:17px;margin-top:0;}"
    + ".body{padding:14px 16px 20px;}"
    + ".grid{grid-template-columns:repeat(auto-fill,minmax(144px,1fr));gap:14px 12px;}"
    + ".foot{padding:12px 16px calc(12px + env(safe-area-inset-bottom));}"
    + ".more{padding:10px 18px;}"
    + "}"
    + "\n@media (prefers-reduced-motion:reduce){.scrim,.panel{animation:none;}.card:hover{transform:none;}}";

  /* ========================================================================
     Full results window

     Opened by Enter or "See all N results" - the equivalent of Amazon's search
     button opening a results page rather than just a longer dropdown.
     ====================================================================== */

  // Cards are added a batch at a time (button, plus auto-load as the grid nears
  // its end) rather than all at once: a broad term like "photo" matches 100+
  // products, and putting every one in the DOM up front is wasted work for the
  // ones nobody scrolls to.
  var PAGE_SIZE = 24;

  var BROWSE = [
    { label: "Photography", href: "photography.html" },
    { label: "Gift Shop", href: "gifts.html" },
    { label: "Studio Services", href: "studio.html" },
    { label: "Corporate Gifts", href: "corporate.html" }
  ];

  var results = null; // lazily built on first use

  function buildResultsWindow() {
    if (results) return results;

    var host = document.createElement("div");
    // The one thing a shadow root can't hide from: the host element itself is
    // still a page node, so give it nothing for page CSS to key off beyond a
    // name, and set its own positioning from inside (:host).
    host.setAttribute("data-sk-search-results", "");
    var root = host.attachShadow({ mode: "open" });
    root.innerHTML =
      "<style>" + RESULTS_CSS + "</style>"
      + '<div class="scrim" part="scrim"></div>'
      + '<div class="wrap">'
      + '<div class="panel" role="dialog" aria-modal="true" aria-labelledby="sk-rtitle">'
      + '<div class="head">'
      + '<div class="head-top">'
      + "<div>"
      + '<div class="eyebrow">Search results</div>'
      + '<h2 class="title" id="sk-rtitle"></h2>'
      + '<p class="count"></p>'
      + "</div>"
      + '<button type="button" class="close" aria-label="Close search results">'
      + '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'
      + "</button>"
      + "</div>"
      + '<div class="chips" role="group" aria-label="Filter results by section"></div>'
      + "</div>"
      + '<div class="body"><div class="grid"></div></div>'
      + '<div class="foot" hidden><span class="shown"></span><button type="button" class="more"></button></div>'
      + "</div></div>";
    document.body.appendChild(host);

    var ui = {
      host: host,
      root: root,
      panel: root.querySelector(".panel"),
      title: root.querySelector(".title"),
      count: root.querySelector(".count"),
      chips: root.querySelector(".chips"),
      body: root.querySelector(".body"),
      grid: root.querySelector(".grid"),
      foot: root.querySelector(".foot"),
      shown: root.querySelector(".shown"),
      more: root.querySelector(".more"),
      close: root.querySelector(".close")
    };

    root.querySelector(".scrim").addEventListener("click", closeResults);
    ui.close.addEventListener("click", closeResults);
    // Clicks on the padding around the panel close too, the same way the scrim
    // does - but not clicks that started inside the panel.
    root.querySelector(".wrap").addEventListener("click", function (e) {
      if (e.target === e.currentTarget) closeResults();
    });
    ui.more.addEventListener("click", function () { appendBatch(); });
    ui.body.addEventListener("scroll", function () {
      if (ui.body.scrollTop + ui.body.clientHeight >= ui.body.scrollHeight - 420) appendBatch();
    });
    // A product photo that 404s would otherwise leave a broken-image glyph in
    // an otherwise clean grid; drop the <img> and let .shot's own placeholder
    // gradient stand in. Capture phase - "error" on <img> doesn't bubble.
    ui.grid.addEventListener("error", function (e) {
      var img = e.target;
      if (img && img.tagName === "IMG" && img.parentNode) {
        img.parentNode.classList.add("blank");
        img.remove();
      }
    }, true);

    results = ui;
    return ui;
  }

  var view = { query: "", matches: [], visible: [], shown: 0, section: "all", lastFocus: null };

  function cardHtml(item, query) {
    if (!item.image) {
      return '<a class="card plain" href="' + escHtml(item.url) + '">'
        + '<div class="info"><div class="name">' + highlight(item.name, query) + "</div>"
        + '<div class="cat">' + escHtml(item.category) + "</div></div></a>";
    }
    return '<a class="card" href="' + escHtml(item.url) + '">'
      + '<div class="shot"><img src="' + escHtml(item.image) + '" alt="" loading="lazy" decoding="async"></div>'
      + '<div class="info">'
      + '<div class="name">' + highlight(item.name, query) + "</div>"
      + (item.price ? '<div class="price">' + escHtml(item.price) + "</div>" : "")
      + '<div class="cat">' + escHtml(item.category) + "</div>"
      + "</div></a>";
  }

  function appendBatch() {
    var ui = results;
    if (!ui || view.shown >= view.visible.length) return;
    var next = view.visible.slice(view.shown, view.shown + PAGE_SIZE);
    var html = next.map(function (item) { return cardHtml(item, view.query); }).join("");
    ui.grid.insertAdjacentHTML("beforeend", html);
    view.shown += next.length;
    updateFoot();
  }

  function updateFoot() {
    var ui = results;
    var total = view.visible.length;
    var left = total - view.shown;
    ui.foot.hidden = total === 0;
    ui.shown.textContent = "Showing " + view.shown + " of " + total;
    ui.more.hidden = left <= 0;
    ui.more.textContent = "Load " + Math.min(PAGE_SIZE, left) + " more";
  }

  function renderChips() {
    var ui = results;
    var order = [], tally = {};
    view.matches.forEach(function (item) {
      if (tally[item.category] == null) { tally[item.category] = 0; order.push(item.category); }
      tally[item.category]++;
    });
    // One section is no choice at all - the row would just restate the count
    // already in the header.
    if (order.length < 2) { ui.chips.innerHTML = ""; return; }
    var html = '<button type="button" class="chip' + (view.section === "all" ? " on" : "")
      + '" data-section="all" aria-pressed="' + (view.section === "all") + '">All<span>'
      + view.matches.length + "</span></button>";
    order.forEach(function (cat) {
      var on = view.section === cat;
      html += '<button type="button" class="chip' + (on ? " on" : "") + '" data-section="' + escHtml(cat)
        + '" aria-pressed="' + on + '">' + escHtml(cat) + "<span>" + tally[cat] + "</span></button>";
    });
    ui.chips.innerHTML = html;
    Array.prototype.forEach.call(ui.chips.querySelectorAll(".chip"), function (chip) {
      chip.addEventListener("click", function () {
        view.section = chip.getAttribute("data-section");
        renderChips();
        renderGrid();
      });
    });
  }

  function renderGrid() {
    var ui = results;
    view.visible = view.section === "all"
      ? view.matches
      : view.matches.filter(function (item) { return item.category === view.section; });
    view.shown = 0;
    ui.grid.innerHTML = "";
    ui.body.scrollTop = 0;

    if (!view.visible.length) {
      ui.foot.hidden = true;
      ui.grid.innerHTML = '<div class="none" style="grid-column:1/-1">'
        + '<div class="none-mark"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></div>'
        + "<h3>No products matched &ldquo;" + escHtml(view.query) + "&rdquo;</h3>"
        + "<p>Try a shorter word, or browse a section below.</p>"
        + '<div class="none-links">'
        + BROWSE.map(function (b) { return '<a href="' + b.href + '">' + b.label + "</a>"; }).join("")
        + "</div></div>";
      return;
    }
    appendBatch();
  }

  function renderSkeleton() {
    var ui = results;
    ui.foot.hidden = true;
    ui.chips.innerHTML = "";
    ui.grid.innerHTML = new Array(12).join("|").split("|").map(function () {
      return '<div class="sk"><div class="b shot"></div><div class="b l1"></div><div class="b l2"></div></div>';
    }).join("");
  }

  function paintResults() {
    var ui = results;
    // Real products only - the curated CATALOG entries (category shortcuts like
    // "Wall Clocks", with no photo or price of their own) don't belong in a grid
    // meant to read as product results; they stay reachable from the typing
    // dropdown and the site's own menus.
    view.matches = productMatches(view.query);
    view.section = "all";
    ui.count.textContent = view.matches.length
      ? view.matches.length + " product" + (view.matches.length === 1 ? "" : "s") + " found"
      : "No products found";
    renderChips();
    renderGrid();
  }

  function openResults(query) {
    query = (query || "").trim();
    if (!query) return;
    var ui = buildResultsWindow();
    view.query = query;
    view.lastFocus = document.activeElement;
    ui.title.textContent = "“" + query + "”";
    ui.count.textContent = "Searching…";

    var pending = !liveProductsPromise;
    var loading = loadLiveProducts();
    if (pending) renderSkeleton(); else paintResults();

    lockScroll(true);
    ui.host.classList.add("open");
    ui.close.focus();

    // Deciding "No products found" before the live catalog has arrived was the
    // old behaviour; wait for the fetch, then paint - but only if this same
    // query is still the one on screen.
    loading.then(function () {
      if (ui.host.classList.contains("open") && view.query === query) paintResults();
    });
  }

  function closeResults() {
    if (!results || !results.host.classList.contains("open")) return;
    results.host.classList.remove("open");
    lockScroll(false);
    if (view.lastFocus && view.lastFocus.focus) view.lastFocus.focus();
    view.lastFocus = null;
  }

  // Removing the page's scrollbar shifts the whole layout left unless its width
  // is handed back as padding.
  var scrollPad = "";
  function lockScroll(on) {
    if (on) {
      var bar = window.innerWidth - document.documentElement.clientWidth;
      scrollPad = document.body.style.paddingRight;
      if (bar > 0) document.body.style.paddingRight = bar + "px";
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
      document.body.style.paddingRight = scrollPad;
    }
  }

  document.addEventListener("keydown", function (e) {
    if (!results || !results.host.classList.contains("open")) return;
    if (e.key === "Escape") { e.preventDefault(); closeResults(); return; }
    if (e.key !== "Tab") return;
    // Keep Tab inside the dialog while it's up - without this, focus walks off
    // into the page behind the scrim, which the reader can't even see.
    var focusables = results.panel.querySelectorAll("button:not([hidden]),a[href]");
    if (!focusables.length) return;
    var first = focusables[0], last = focusables[focusables.length - 1];
    var active = results.root.activeElement;
    if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  });

  /* ========================================================================
     Typing dropdown (one per search input on the page)
     ====================================================================== */

  function setup(input) {
    var container = input.closest(".nav-search-container") || input.closest(".mobile-search-container") || input.parentElement;
    if (!container) return;

    var host = document.createElement("div");
    host.setAttribute("data-sk-search-suggest", "");
    var root = host.attachShadow({ mode: "open" });
    root.innerHTML = "<style>" + SUGGEST_CSS + "</style><div class=\"panel\"></div>";
    var panel = root.querySelector(".panel");
    document.body.appendChild(host);

    // Anchors the panel under (or, on a cramped screen, over) the input and
    // hands it the height budget actually available, rather than a fixed vh
    // guess that the on-screen keyboard invalidates.
    function place() {
      var r = input.getBoundingClientRect();
      var vh = window.innerHeight;
      var vv = window.visualViewport;
      var usableBottom = vv ? Math.min(vh, vv.offsetTop + vv.height) : vh;
      // The input has been scrolled out of view - there is nothing to hang off.
      if (r.bottom < 0 || r.top > vh) { close(); return; }
      var gap = 8, pad = 10;
      var below = usableBottom - r.bottom - gap - pad;
      var above = r.top - gap - pad;
      var flip = below < 180 && above > below;
      host.style.left = Math.round(r.left) + "px";
      host.style.width = Math.round(r.width) + "px";
      host.style.top = flip ? "auto" : Math.round(r.bottom + gap) + "px";
      host.style.bottom = flip ? Math.round(vh - r.top + gap) + "px" : "auto";
      host.style.setProperty("--sk-max", Math.max(150, Math.min(420, flip ? above : below)) + "px");
    }

    var reposition = function () { if (host.classList.contains("open")) place(); };
    // Capture phase: the input may sit inside its own scrolling header,
    // whose scroll events never reach window on the bubble path.
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", reposition);
      window.visualViewport.addEventListener("scroll", reposition);
    }

    var activeIndex = -1;
    var currentItems = [];
    // Same model as Amazon's search box: hovering a suggestion with the mouse
    // only highlights it for a click - it must never decide what a *keyboard*
    // Enter does. Only ArrowUp/ArrowDown (a real, deliberate keyboard pick) sets
    // this, and Enter only jumps straight to activeIndex when it's true;
    // otherwise Enter always opens the full results window, same as Amazon's
    // search button does regardless of which suggestion the mouse happens to be
    // resting on.
    var keyboardActive = false;

    function close() {
      host.classList.remove("open");
      panel.innerHTML = "";
      activeIndex = -1;
      currentItems = [];
      keyboardActive = false;
    }

    function go(item) { window.location.href = item.url; }

    // Renders `items` as the clickable suggestion rows, plus an optional single
    // extra row after them (the "See all N results" footer, which opens the full
    // results window - see openResults above).
    function renderRows(items, query, extraRowHtml) {
      panel.innerHTML = items.map(function (item, i) {
        return '<a href="' + escHtml(item.url) + '" class="row" data-index="' + i + '">'
          + '<span class="row-name">' + highlight(item.name, query.trim()) + "</span>"
          + '<span class="row-cat">' + escHtml(item.category) + "</span></a>";
      }).join("") + (extraRowHtml || "");
      place();
      host.classList.add("open");
      requestAnimationFrame(place);

      Array.prototype.forEach.call(panel.querySelectorAll(".row"), function (row) {
        row.addEventListener("mouseenter", function () {
          activeIndex = Number(row.getAttribute("data-index"));
          // Mouse movement, not a keyboard pick - see keyboardActive above.
          keyboardActive = false;
          updateActive();
        });
        row.addEventListener("click", function (e) {
          e.preventDefault();
          go(currentItems[Number(row.getAttribute("data-index"))]);
        });
      });

      var seeAll = panel.querySelector(".seeall");
      if (seeAll) {
        seeAll.addEventListener("click", function () {
          close();
          openResults(query);
        });
      }
    }

    function renderEmpty(query) {
      panel.innerHTML = '<div class="empty">No matches for "' + escHtml(query) + '". Try '
        + BROWSE.map(function (b) { return '<a href="' + b.href + '">' + b.label + "</a>"; }).join(", ")
        + ".</div>";
      place();
      host.classList.add("open");
      requestAnimationFrame(place);
    }

    function render(query) {
      currentItems = filterCatalog(query, 8);
      activeIndex = -1;
      keyboardActive = false;

      if (!query.trim()) { close(); return; }
      if (currentItems.length === 0) { renderEmpty(query); return; }

      var productCount = productMatches(query).length;
      var extraRowHtml = productCount > 0 && filterCatalog(query).length > currentItems.length
        ? '<button type="button" class="seeall">See all ' + productCount
          + " product" + (productCount === 1 ? "" : "s") + " for &quot;" + escHtml(query.trim()) + "&quot;</button>"
        : "";
      renderRows(currentItems, query, extraRowHtml);
    }

    function updateActive() {
      Array.prototype.forEach.call(panel.querySelectorAll(".row"), function (row) {
        row.classList.toggle("active", Number(row.getAttribute("data-index")) === activeIndex);
      });
    }

    input.addEventListener("input", function () {
      loadLiveProducts(); // no-op after the first call - see the focus handler below
      render(input.value);
    });

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        if (host.classList.contains("open") && currentItems.length > 0 && activeIndex >= 0 && keyboardActive) {
          // Explicitly arrowed to one suggestion - that's a deliberate pick.
          e.preventDefault();
          go(currentItems[activeIndex]);
          return;
        }
        // Plain Enter (nothing arrowed to via keyboard) always opens the full
        // results window - same as Amazon's search button, regardless of which
        // suggestion the mouse happens to be hovering or how many matches exist.
        if (input.value.trim()) {
          e.preventDefault();
          close();
          openResults(input.value);
        }
        return;
      }
      if (!host.classList.contains("open") || currentItems.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        keyboardActive = true;
        activeIndex = Math.min(activeIndex + 1, currentItems.length - 1);
        updateActive();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        keyboardActive = true;
        activeIndex = Math.max(activeIndex - 1, 0);
        updateActive();
      } else if (e.key === "Escape") {
        close();
        input.blur();
      }
    });

    input.addEventListener("focus", function () {
      // Loads the full catalog on first real interaction with a search box rather
      // than on every page load - most visitors never open search at all, so this
      // was fetching the entire product list for nothing on every navigation.
      loadLiveProducts();
      if (input.value.trim()) render(input.value);
    });

    // Events from inside the shadow root retarget to `host`, which lives in
    // `container`, so this still tells a click on a suggestion apart from a
    // click out in the page.
    document.addEventListener("click", function (e) {
      // A click inside the shadow root retargets to the host, which no longer
      // lives in the container - so test for it separately.
      if (!container.contains(e.target) && e.target !== host) close();
    });

    // A page may swap its search form for a submit-driven one; treat that the
    // same as Enter rather than letting the page navigate to "?q=".
    var form = input.closest("form");
    if (form) {
      form.addEventListener("submit", function (e) {
        if (!input.value.trim()) return;
        e.preventDefault();
        close();
        openResults(input.value);
      });
    }
  }

  function init() {
    var inputs = document.querySelectorAll(".nav-search-bar input, .mobile-search-bar input");
    Array.prototype.forEach.call(inputs, setup);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
