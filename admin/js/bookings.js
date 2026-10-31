routes.bookings = renderBookings;

const BOOKING_STATUSES = ["enquiry", "advance_pending", "confirmed", "completed", "cancelled"];
const BOOKING_STATUS_LABELS = {
  enquiry: "Enquiry", advance_pending: "Advance Pending", confirmed: "Confirmed",
  completed: "Completed", cancelled: "Cancelled",
};

/* Bookings taken before booking.js started handing the package photo over have
   no details.image, so the service's own hero photo stands in — the same images
   photography.html/booking.html use, keyed the same way. */
const BOOKING_CATEGORY_IMAGES = {
  wedding: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/hero/wedding.png",
  prewedding: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/hero/pre-wedding.png",
  maternity: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/hero/maternity.jpg",
  baby: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/hero/baby-shower.jpg",
  birthday: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/hero/birthday-event.jpg",
  outdoor: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/hero/outdoor.jpg",
  drone: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/hero/drone.jpg",
  video: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/hero/video.jpg",
  album: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/hero/album%20designing.jpg",
  event: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/hero/wedding.png",
  housewarming: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/hero/wedding.png",
  sareefunction: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/hero/saree%20ceremony.png",
  traditionalphoto: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/portfolio/traditional-photography-1.png",
  traditionalvideo: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/portfolio/video_1.jpg",
  cinematicvideo: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/portfolio/cinematic-videography-1.png",
  candidphoto: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/portfolio/wedding-1.png",
  ledscreens: "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/portfolio/led-screens-1.png",
};

function bookingImage(details) {
  return (details && details.image) || BOOKING_CATEGORY_IMAGES[(details || {}).category] || BOOKING_CATEGORY_IMAGES.wedding;
}

// Add-ons only started carrying their own `image` once booking.js was updated
// to record it (see js/booking.js goToBookingForm) - a booking made before
// that still names a real equipment service ("Drone Videography", "Cinematic
// Videography"...). Keyed by the exact display name booking.js's EQUIPMENT_DATA
// uses, with the SAME photo it shows on booking.html for that service (NOT
// BOOKING_CATEGORY_IMAGES above, which is each category's own hero banner —
// a different, less specific photo). */
const ADDON_NAME_IMAGES = {
  "Candid Photography": "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/portfolio/wedding-1.png",
  "Drone Videography": "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/portfolio/drone_1.jpg",
  "Cinematic Videography": "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/portfolio/cinematic-videography-1.png",
  "Album Designing": "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/portfolio/album_1.jpg",
  "Traditional Photography": "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/portfolio/traditional-photography-1.png",
  "Traditional Videography": "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/portfolio/video_1.jpg",
  "LED Screens": "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/portfolio/led-screens-1.png",
  "Outdoor Photography": "https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/Photography_assets/assets/portfolio/outdoor_1.jpg",
};

// Same idea for the emoji shown when even the name-based image lookup misses
// (a genuinely custom add-on) - matches the icons EQUIPMENT_DATA uses on
// booking.html for these same services.
const ADDON_FALLBACK_ICONS = {
  "Candid Photography": "\u{1F4F7}", "Drone Videography": "\u{1F6F8}",
  "Cinematic Videography": "\u{1F3AC}", "Album Designing": "\u{1F4D4}",
  "Traditional Photography": "\u{1FA94}", "Traditional Videography": "\u{1F39E}\u{FE0F}",
  "LED Screens": "\u{1F4A1}", "Outdoor Photography": "\u{1F3DE}\u{FE0F}",
};
const ADDON_GENERIC_ICON = "\u{1F3A5}";

function addonImage(addon) {
  return addon.image || ADDON_NAME_IMAGES[addon.name] || "";
}

function addonIcon(addon) {
  return addon.icon || ADDON_FALLBACK_ICONS[addon.name] || ADDON_GENERIC_ICON;
}

/* Package and add-on prices travel as the display strings they're sold at
   ("₹24,999", "₹8,000"), so a booking's totals have to be read back out of them. */
function bkAmount(value) {
  if (typeof value === "number") return Math.round(value);
  return parseInt(String(value || "").replace(/[^\d]/g, ""), 10) || 0;
}

/* [{name, price, icon, image}] once booking.js records add-on prices/photos;
   older bookings only have the comma-joined names, which still render (without
   a price or photo). */
function bkAddons(details) {
  if (Array.isArray(details.addons) && details.addons.length) {
    return details.addons.filter(a => a && a.name);
  }
  return String(details.equipments || "").split(",").map(s => s.trim()).filter(Boolean)
    .map(name => ({ name, price: "", icon: "", image: "" }));
}

async function renderBookings() {
  const view = document.getElementById("view");
  view.innerHTML = `
    <header class="page-head"><h1>Bookings</h1><button type="button" class="btn secondary" onclick="downloadCsvReport('/api/admin/reports/bookings.csv', 'bookings.csv', this)">Export CSV</button></header>
    <div id="bookingsWrap">${LOADING}</div>
  `;
  const bookings = await Api.bookings();
  window._BOOKINGS_CACHE = bookings;
  const wrap = document.getElementById("bookingsWrap");
  // Bail out if the admin navigated to another section while this request was in
  // flight - the elements below belong to a view that is no longer in the document,
  // and writing to them throws an uncaught TypeError (see coupons.js).
  if (!wrap) return;
  if (!bookings.length) {
    wrap.innerHTML = `<div class="empty-state">No bookings yet.</div>`;
    return;
  }
  wrap.innerHTML = `
    <table>
      <thead><tr><th>Service Booked</th><th>Customer</th><th>Phone</th><th>Event Date</th><th>Slot</th><th>Venue</th><th>Package</th><th>Advance</th><th>Status</th><th>Created</th><th></th></tr></thead>
      <tbody>
        ${bookings.map(b => {
          const details = b.details || {};
          const venue = details.venue && details.venue !== "—" ? details.venue : "—";
          const addons = bkAddons(details);
          return `
          <tr>
            <td>
              <div class="bkr-service">
                <img class="bkr-thumb" src="${esc(bookingImage(details))}" alt="" onerror="this.style.visibility='hidden'">
                <div class="bkr-service-text">
                  <b>${esc(details.package || "Photography Booking")}</b>
                  <span>${esc([bkTitleCase(details.category), details.tier].filter(Boolean).join(" · ") || "—")}</span>
                  ${addons.length ? `<span class="bkr-addons">+${addons.length} add-on${addons.length === 1 ? "" : "s"}</span>` : ""}
                </div>
              </div>
            </td>
            <td>${esc(b.customer_name)}</td>
            <td>${esc(b.customer_phone)}</td>
            <td>${b.event_date || "—"}</td>
            <td>${esc(b.slot || "—")}</td>
            <td class="bkr-venue" title="${esc(venue)}">${esc(venue)}</td>
            <td>${esc(details.price || "—")}</td>
            <td>${fmtINR(b.advance_paid)}${
              // The package's configured advance (Product.advance_amount), shown
              // next to what has actually been received so staff can see at a
              // glance whether anything is still outstanding.
              b.advance_expected ? `<div class="bkr-advance-expected">of ${fmtINR(b.advance_expected)}</div>` : ""
            }</td>
            <td><select onchange="updateBookingStatus('${b.id}', this.value, this)">
              ${BOOKING_STATUSES.map(s => `<option value="${s}" ${s === b.status ? "selected" : ""}>${s.replace("_", " ")}</option>`).join("")}
            </select></td>
            <td>${fmtIST(b.created_at)}</td>
            <td class="actions"><button class="btn secondary" onclick="viewBooking('${b.id}')">View</button></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `;
}

async function updateBookingStatus(id, status, selectEl) {
  if (selectEl) selectEl.disabled = true;
  try { await Api.updateBookingStatus(id, status); }
  catch (err) { alert(err.message); renderBookings(); }
  finally { if (selectEl) selectEl.disabled = false; }
}

/* ---------------------------------------------------------------- detail modal */

const BK_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* "YYYY-MM-DD" -> {day:"24", mon:"Sep"} without going through Date/timezone
   conversion, since these are plain calendar dates with no time component. */
function bkDayBadge(isoDate) {
  if (!isoDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!m) return null;
  return { day: m[3], mon: BK_MONTHS[Number(m[2]) - 1] || "" };
}

/* Each row in details.event_schedule was built client-side (booking-form.js)
   as "<Event Type> — <YYYY-MM-DD>, <start> – <end>" - split it back apart so
   every event can render as its own dated card instead of one raw string. */
function bkParseEventRow(raw) {
  const m = /^(.*?)\s—\s(\d{4}-\d{2}-\d{2}),\s*(.+)$/.exec(raw || "");
  if (!m) return { type: raw || "Event", date: null, time: "" };
  return { type: m[1], date: m[2], time: m[3] };
}

/* Category slugs ("baby-shoot", "pre_wedding") -> a readable event-type label
   ("Baby Shoot", "Pre Wedding") for the single-event schedule card, so it says
   what kind of shoot this is instead of just repeating the package title. */
function bkTitleCase(slug) {
  if (!slug) return "";
  return slug.split(/[-_\s]+/).filter(Boolean).map(w => w[0].toUpperCase() + w.slice(1)).join(" ");
}

function bkField(label, value, mono) {
  if (value == null || value === "" || value === "—") return "";
  return `<div class="bk-field"><span>${esc(label)}</span><b${mono ? ' class="mono"' : ""}>${esc(value)}</b></div>`;
}

function bkEventCard(type, isoDate, time) {
  const badge = bkDayBadge(isoDate);
  return `
    <div class="bk-event-card">
      <div class="bk-event-daybox">
        ${badge ? `<span class="bk-event-day">${esc(badge.day)}</span><span class="bk-event-mon">${esc(badge.mon)}</span>` : `<span class="bk-event-mon">TBD</span>`}
      </div>
      <div class="bk-event-body">
        <b>${esc(type)}</b>
        ${time ? `<span>${esc(time)}</span>` : ""}
      </div>
    </div>`;
}

function openBookingImageZoom(src, alt) {
  openModal(`
    <img src="${esc(src)}" alt="${esc(alt || "")}" style="width:100%;border-radius:8px;display:block;">
    <div class="modal-actions"><button type="button" class="btn secondary" onclick="closeModal()">Close</button></div>
  `, true);
}

function viewBooking(id) {
  const b = window._BOOKINGS_CACHE.find(x => x.id === id);
  if (!b) return;
  const details = b.details || {};
  const eventSchedule = Array.isArray(details.event_schedule) ? details.event_schedule : [];
  const addons = bkAddons(details);
  const statusLabel = BOOKING_STATUS_LABELS[b.status] || b.status;

  const packagePrice = bkAmount(details.price);
  const addonsTotal = addons.reduce((sum, a) => sum + bkAmount(a.price), 0);
  const advance = bkAmount(b.advance_paid);
  const estimate = packagePrice + addonsTotal;

  const eventsHTML = eventSchedule.length
    ? eventSchedule.map(row => { const e = bkParseEventRow(row); return bkEventCard(e.type, e.date, e.time); }).join("")
    : bkEventCard(bkTitleCase(details.category) || "Photography Shoot", b.event_date, b.slot || "");

  openModal(`
    <div class="bk-hero-banner">
      <img class="bk-hero-img" id="bkHeroImg" src="${esc(bookingImage(details))}" alt="${esc(details.package || "Photography Booking")}"
           title="Click to view full size"
           onerror="this.closest('.bk-hero-banner').remove()">
    </div>
    <div class="bk-modal-head">
      <div>
        ${details.category ? `<span class="bk-kicker">${esc(details.category_label || bkTitleCase(details.category))}${details.tier ? ` &middot; ${esc(details.tier)}` : ""}</span>` : ""}
        <h2>${esc(details.package || "Photography Booking")}</h2>
      </div>
      <span class="bk-status-badge bk-status-${esc(b.status)}">${esc(statusLabel)}</span>
    </div>
    <p class="bk-meta">Booked ${fmtIST(b.created_at)} &middot; <span class="mono">${esc(b.id)}</span></p>

    <div class="bk-section">
      <h3 class="bk-section-title">Customer</h3>
      <div class="bk-grid-2">
        ${bkField("Name", b.customer_name)}
        ${bkField("Phone", b.customer_phone)}
        ${bkField("Email", b.customer_email)}
        ${bkField("Account", b.user_id, true)}
      </div>
    </div>

    <div class="bk-section">
      <h3 class="bk-section-title">Schedule</h3>
      <div class="bk-events">${eventsHTML}</div>
    </div>

    ${details.venue && details.venue !== "—" ? `
    <div class="bk-section">
      <h3 class="bk-section-title">Venue / Address</h3>
      <p class="bk-venue">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>
        ${esc(details.venue)}
      </p>
    </div>` : ""}

    ${addons.length ? `
    <div class="bk-section">
      <h3 class="bk-section-title">Add-ons / Equipment <span class="count">(${addons.length})</span></h3>
      <div class="bk-addons">
        ${addons.map(a => {
          const image = addonImage(a);
          return `
          <div class="bk-addon-row">
            <div class="bk-addon-thumb">
              ${image
                ? `<img src="${esc(image)}" alt="${esc(a.name)}" loading="lazy" onerror="this.parentElement.classList.add('bk-addon-thumb-empty');this.remove();">`
                : `<span class="bk-addon-icon">${esc(addonIcon(a))}</span>`}
            </div>
            <span class="bk-addon-name">${esc(a.name)}</span>
            <b class="bk-addon-price">${a.price ? esc(a.price) : "Included"}</b>
          </div>`;
        }).join("")}
      </div>
    </div>` : ""}

    ${details.message && details.message !== "—" ? `
    <div class="bk-section">
      <h3 class="bk-section-title">Requirements / Message</h3>
      <p class="bk-quote">${esc(details.message)}</p>
    </div>` : ""}

    <div class="bk-section">
      <h3 class="bk-section-title">Package &amp; Payment</h3>
      <div class="bk-grid-2">
        ${bkField("Package Price", details.price)}
        ${addonsTotal ? bkField(`Add-ons (${addons.length})`, fmtINR(addonsTotal)) : ""}
        ${estimate ? bkField("Estimated Total", fmtINR(estimate)) : ""}
        ${bkField("Advance Paid", fmtINR(advance))}
        ${estimate ? bkField("Balance Due", fmtINR(Math.max(0, estimate - advance))) : ""}
        ${bkField("Product ID", b.product_id, true)}
      </div>
    </div>

    <div class="modal-actions">
      <button type="button" class="btn secondary" onclick="closeModal()">Close</button>
    </div>
  `, true);

  // Wired here (not via onclick="openBookingImageZoom('${details.package}')" in the
  // template above) because details.package is customer-submitted text from the public
  // booking form — esc() makes it safe as an HTML attribute value, not as JS source
  // re-parsed out of an onclick="..." string, so it can't be interpolated into one.
  const heroImg = document.getElementById("bkHeroImg");
  if (heroImg) {
    heroImg.addEventListener("click", () => {
      openBookingImageZoom(bookingImage(details), details.package || "Photography Booking");
    });
  }
}
