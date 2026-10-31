
    const BOOKING_STATUS_LABELS = {
      enquiry: 'Enquiry Received',
      advance_pending: 'Advance Pending',
      confirmed: 'Confirmed',
      completed: 'Completed',
      cancelled: 'Cancelled',
    };

    let bookingsPageLoginEmail = '';

    function refreshCartBadge() {
      let totalQty = 0;
      try {
        const cart = JSON.parse(localStorage.getItem('sai_studio_cart')) || {};
        totalQty = Object.values(cart).reduce((sum, item) => sum + (item.qty || 0), 0);
      } catch (e) {}
      [document.getElementById('navCartBadge'), document.getElementById('bottomNavCartBadge')].forEach(el => {
        if (!el) return;
        el.textContent = totalQty;
        el.style.display = totalQty > 0 ? 'flex' : 'none';
      });
    }

    function initMyBookingsPage() {
      refreshCartBadge();
      if (isCustomerLoggedIn()) {
        showBookingsPageList();
      } else {
        resetBookingsLoginGate();
      }
    }

    function resetBookingsLoginGate() {
      document.getElementById('bookingsLoginGate').style.display = 'block';
      document.getElementById('bookingsListSection').style.display = 'none';
      bookingsPageLoginEmail = getCustomerEmail() || '';
      document.getElementById('bookingsLoginEmail').value = bookingsPageLoginEmail;
      document.getElementById('bookingsLoginOtp').value = '';
      document.getElementById('bookingsLoginMsg').style.display = 'none';
      document.getElementById('bookingsLoginEmailStep').style.display = 'block';
      document.getElementById('bookingsLoginOtpStep').style.display = 'none';
    }

    function backToBookingsEmailStep() {
      document.getElementById('bookingsLoginEmailStep').style.display = 'block';
      document.getElementById('bookingsLoginOtpStep').style.display = 'none';
      document.getElementById('bookingsLoginMsg').style.display = 'none';
    }

    async function sendBookingsPageOtp() {
      const email = document.getElementById('bookingsLoginEmail').value.trim();
      const msgEl = document.getElementById('bookingsLoginMsg');
      msgEl.style.display = 'none';

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        msgEl.textContent = 'Please enter a valid email address.';
        msgEl.style.display = 'block';
        return;
      }

      const btn = document.getElementById('bookingsSendOtpBtn');
      if (window.SkLoading) window.SkLoading.button(btn, true); else btn.disabled = true;
      try {
        await CustomerAuth.requestOtp(email);
        bookingsPageLoginEmail = email;
        document.getElementById('bookingsOtpSentTo').textContent = `(sent to ${email})`;
        document.getElementById('bookingsLoginEmailStep').style.display = 'none';
        document.getElementById('bookingsLoginOtpStep').style.display = 'block';
        document.getElementById('bookingsLoginOtp').focus();
      } catch (err) {
        msgEl.textContent = err.message || 'Could not send the OTP. Please try again.';
        msgEl.style.display = 'block';
      } finally {
        if (window.SkLoading) window.SkLoading.button(btn, false); else btn.disabled = false;
      }
    }

    async function verifyBookingsPageOtp() {
      const code = document.getElementById('bookingsLoginOtp').value.trim();
      const msgEl = document.getElementById('bookingsLoginMsg');
      msgEl.style.display = 'none';

      if (!/^\d{6}$/.test(code)) {
        msgEl.textContent = 'Please enter the 6-digit code.';
        msgEl.style.display = 'block';
        return;
      }

      const btn = document.getElementById('bookingsVerifyOtpBtn');
      if (window.SkLoading) window.SkLoading.button(btn, true); else btn.disabled = true;
      try {
        await CustomerAuth.verifyOtp(bookingsPageLoginEmail, code);
        window.SaiAuthNav?.refresh();
        await showBookingsPageList();
      } catch (err) {
        msgEl.textContent = err.message || 'That code didn’t work. Please try again.';
        msgEl.style.display = 'block';
      } finally {
        if (window.SkLoading) window.SkLoading.button(btn, false); else btn.disabled = false;
      }
    }

    async function showBookingsPageList() {
      document.getElementById('bookingsLoginGate').style.display = 'none';
      document.getElementById('bookingsListSection').style.display = 'block';
      const wrap = document.getElementById('bookingsListWrap');
      wrap.innerHTML = '<div class="orders-loading">Loading your bookings&hellip;</div>';
      try {
        const bookings = await CustomerAuth.myBookings();
        renderBookingsPageList(bookings);
      } catch (err) {
        wrap.innerHTML = `<div class="cart-form-msg" style="display:block;">${err.message || 'Could not load your bookings.'}</div>`;
      }
    }

    function renderBookingsPageList(bookings) {
      const wrap = document.getElementById('bookingsListWrap');
      if (!bookings.length) {
        wrap.innerHTML = `
          <div class="cart-empty-state">
            <h2>No photography bookings yet</h2>
            <p>Once you book a shoot, it'll show up here.</p>
            <a href="photography.html" class="cart-continue-btn">Browse Photography Packages</a>
          </div>`;
        return;
      }
      wrap.innerHTML = bookings.map(bookingCardHTML).join('');
    }

    /* Bookings placed before booking.js started handing the package photo over in
       the URL have no details.image, so the service's own hero photo stands in —
       same images photography.html/booking.html use, keyed the same way. */
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

    const BOOKING_CATEGORY_LABELS = {
      wedding: "Wedding Photography", prewedding: "Pre-Wedding", maternity: "Maternity Shoot",
      baby: "Baby Shoot", birthday: "Birthday Photography", event: "Event Photography",
      outdoor: "Outdoor Photography", drone: "Drone Videography", video: "Videography",
      album: "Album Designing", housewarming: "House Warming", sareefunction: "Saree Function",
      traditionalphoto: "Traditional Photography", traditionalvideo: "Traditional Videography",
      cinematicvideo: "Cinematic Videography", candidphoto: "Candid Photography",
      ledscreens: "LED Screens",
    };

    // Add-ons only started carrying their own `image` once booking.js was updated
    // to record it (see js/booking.js goToBookingForm) - a booking made before
    // that still names a real equipment service ("Drone Videography", "Cinematic
    // Videography"...). Keyed by the exact display name booking.js's
    // EQUIPMENT_DATA uses, with the SAME photo it shows on booking.html for that
    // service (not the category's own hero banner, which is a different photo).
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
      "Candid Photography": "📷", "Drone Videography": "🛸",
      "Cinematic Videography": "🎬", "Album Designing": "📔",
      "Traditional Photography": "🥁", "Traditional Videography": "🎞️",
      "LED Screens": "💡", "Outdoor Photography": "🏞️",
    };
    const ADDON_GENERIC_ICON = "🎥";

    function addonImage(addon) {
      return addon.image || ADDON_NAME_IMAGES[addon.name] || '';
    }

    function addonIcon(addon) {
      return addon.icon || ADDON_FALLBACK_ICONS[addon.name] || ADDON_GENERIC_ICON;
    }

    function escapeBookingHTML(s) {
      const d = document.createElement('div');
      d.textContent = s == null ? '' : s;
      return d.innerHTML;
    }

    function escapeBookingAttr(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
        .replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // Prices travel as the display strings the packages are sold at ("₹24,999",
    // "₹8,000") rather than numbers, so totals have to be read back out of them.
    function bookingAmount(value) {
      if (typeof value === 'number') return Math.round(value);
      return parseInt(String(value || '').replace(/[^\d]/g, ''), 10) || 0;
    }

    function bookingMoney(amount) {
      return '₹' + Math.round(amount).toLocaleString('en-IN');
    }

    function fmtBookingDate(value) {
      if (!value) return '';
      const d = new Date(value);
      if (isNaN(d)) return String(value);
      return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    }

    /* booking-form.js stores each function of a multi-event shoot as one string,
       "Sangeet — 2026-09-22, 05:45 AM – 02:15 PM", built from its own dropdowns.
       Splitting it back into event / date / start / end is what lets the booking
       show a real schedule table instead of that raw line. Anything that doesn't
       match falls back to the original text so nothing is ever dropped. */
    function parseBookingEvent(entry) {
      if (typeof entry !== 'string' || !entry.trim()) return null;
      const raw = entry.trim();
      const dashAt = raw.indexOf('—');
      if (dashAt === -1) return { raw };

      const type = raw.slice(0, dashAt).trim();
      const tail = raw.slice(dashAt + 1).trim();
      const commaAt = tail.indexOf(',');
      if (commaAt === -1) return { raw, type, date: tail };

      const date = tail.slice(0, commaAt).trim();
      const times = tail.slice(commaAt + 1).trim();
      const [start, end] = times.split('–').map(t => (t || '').trim());
      return { raw, type, date, start, end: end || '' };
    }

    function bookingScheduleHTML(booking) {
      const details = booking.details || {};
      const schedule = Array.isArray(details.event_schedule) ? details.event_schedule : [];

      const events = schedule.map(parseBookingEvent).filter(Boolean);
      if (!events.length && booking.event_date) {
        // Single-event services keep the date on the booking row itself and the
        // chosen time in `slot`, rather than in the schedule list.
        events.push({ type: details.package || 'Shoot', date: booking.event_date, start: booking.slot || '', end: '' });
      }
      if (!events.length) return '';

      return `
        <div class="booking-section">
          <h5 class="order-section-title">Event Schedule</h5>
          <div class="booking-events">
            ${events.map(ev => ev.type ? `
              <div class="booking-event-row">
                <span class="booking-event-type">${escapeBookingHTML(ev.type)}</span>
                <span class="booking-event-date">${escapeBookingHTML(fmtBookingDate(ev.date))}</span>
                <span class="booking-event-time">${ev.start ? escapeBookingHTML(ev.end ? `${ev.start} – ${ev.end}` : ev.start) : '—'}</span>
              </div>` : `
              <div class="booking-event-row"><span class="booking-event-type">${escapeBookingHTML(ev.raw)}</span></div>`).join('')}
          </div>
        </div>`;
    }

    // One row per add-on with its own photo, exactly like an order line item —
    // a booking with several add-ons (Candid Photography + Drone + LED Screens)
    // used to render as a wall of identical text rows with no way to tell them
    // apart at a glance; each now carries the same service photo shown when it
    // was picked on photography.html/booking.html.
    function bookingAddonRowHTML(addon) {
      const image = addonImage(addon);
      return `
        <div class="booking-addon-row">
          <div class="booking-addon-thumb">
            ${image
              ? `<img src="${escapeBookingAttr(image)}" alt="${escapeBookingAttr(addon.name)}" loading="lazy" onerror="this.parentElement.classList.add('booking-addon-thumb-empty');this.remove();">`
              : `<span class="booking-addon-icon">${escapeBookingHTML(addonIcon(addon))}</span>`}
          </div>
          <span class="booking-addon-name">${escapeBookingHTML(addon.name)}</span>
          <span class="booking-addon-price">${addon.price ? escapeBookingHTML(addon.price) : 'Included'}</span>
        </div>`;
    }

    function bookingAddonsHTML(details) {
      // Bookings made before add-on prices/photos were recorded still carry
      // just the comma-joined names — those still render, without a photo.
      const addons = Array.isArray(details.addons) && details.addons.length
        ? details.addons.filter(a => a && a.name)
        : String(details.equipments || '').split(',').map(n => n.trim()).filter(Boolean)
            .map(name => ({ name, price: '', icon: '', image: '' }));
      if (!addons.length) return '';
      return `
        <div class="booking-section">
          <h5 class="order-section-title">Equipment &amp; Coverage Add-ons <span class="count">(${addons.length})</span></h5>
          <div class="booking-addons">${addons.map(bookingAddonRowHTML).join('')}</div>
        </div>`;
    }

    function bookingAmountsHTML(booking, details) {
      const packagePrice = bookingAmount(details.price);
      const addons = Array.isArray(details.addons) ? details.addons.filter(a => a && a.name) : [];
      const addonsTotal = addons.reduce((sum, addon) => sum + bookingAmount(addon.price), 0);
      const advance = bookingAmount(booking.advance_paid);

      if (!packagePrice && !addonsTotal && !advance) return '';

      const estimate = packagePrice + addonsTotal;
      const rows = [];
      if (packagePrice) rows.push(['Package Price', bookingMoney(packagePrice)]);
      if (addonsTotal) rows.push([`Add-ons (${addons.length})`, bookingMoney(addonsTotal)]);
      if (advance) rows.push(['Advance Paid', '−' + bookingMoney(advance)]);

      return `
        <div class="order-amount-summary">
          ${rows.map(([label, value]) => `
            <div class="order-amount-row"><span>${label}</span><span>${value}</span></div>`).join('')}
          ${estimate ? `
            <div class="order-amount-row order-amount-total">
              <span>${advance ? 'Balance Due' : 'Total'}</span>
              <span>${bookingMoney(Math.max(0, estimate - advance))}</span>
            </div>
            ${advance ? `<div class="booking-amount-note">Estimated total ${bookingMoney(estimate)} &middot; balance payable to the studio.</div>` : ''}` : ''}
        </div>`;
    }

    function bookingPanelsHTML(booking, details) {
      const venue = details.venue && details.venue !== '—' ? details.venue : '';
      return `
        <div class="order-panels">
          <div class="order-panel">
            <h5 class="order-panel-title">Shoot Venue / Address</h5>
            ${venue
              ? `<p class="order-address-line">${escapeBookingHTML(venue)}</p>`
              : '<p class="order-panel-empty">No venue address was given &mdash; our team will confirm it with you.</p>'}
          </div>
          <div class="order-panel">
            <h5 class="order-panel-title">Contact Details</h5>
            <p class="order-address-name">${escapeBookingHTML(booking.customer_name)}</p>
            <p class="order-address-line">Phone: ${escapeBookingHTML(booking.customer_phone)}</p>
            ${booking.customer_email ? `<p class="order-address-line">Email: ${escapeBookingHTML(booking.customer_email)}</p>` : ''}
          </div>
        </div>`;
    }

    function bookingCardHTML(booking) {
      const details = booking.details || {};
      const bookedOn = new Date(booking.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const statusLabel = BOOKING_STATUS_LABELS[booking.status] || booking.status;
      const pkg = details.package || 'Photography Booking';
      const category = details.category || '';
      const categoryLabel = details.category_label || BOOKING_CATEGORY_LABELS[category] || '';
      const image = details.image || BOOKING_CATEGORY_IMAGES[category] || BOOKING_CATEGORY_IMAGES.wedding;
      const tier = details.tier ? String(details.tier) : '';
      const message = details.message && details.message !== '—' ? details.message : '';
      const reference = String(booking.id || '').split('-')[0].toUpperCase();

      return `
        <article class="order-card booking-card">
          <div class="booking-hero-banner">
            <img class="booking-hero-img" src="${escapeBookingAttr(image)}" alt="${escapeBookingAttr(pkg)}" loading="lazy"
                 title="Click to view full size"
                 onclick="openBookingImagePreview('${escapeBookingAttr(image)}')"
                 onerror="this.closest('.booking-hero-banner').remove();">
          </div>
          <div class="booking-card-head">
            <div class="booking-head-main">
              ${categoryLabel ? `<span class="booking-category">${escapeBookingHTML(categoryLabel)}</span>` : ''}
              <span class="order-number">${escapeBookingHTML(pkg)}</span>
              <span class="order-date">Booked on ${bookedOn}${reference ? ` &middot; Ref ${escapeBookingHTML(reference)}` : ''}</span>
              <div class="booking-chips">
                ${tier ? `<span class="booking-chip">${escapeBookingHTML(tier.charAt(0).toUpperCase() + tier.slice(1))} Package</span>` : ''}
                ${details.price ? `<span class="booking-chip booking-chip-price">${escapeBookingHTML(details.price)}</span>` : ''}
              </div>
            </div>
            <span class="order-status-badge order-status-${booking.status}">${statusLabel}</span>
          </div>

          ${bookingScheduleHTML(booking)}
          ${bookingPanelsHTML(booking, details)}
          ${bookingAddonsHTML(details)}
          ${bookingAmountsHTML(booking, details)}

          ${message ? `
            <div class="booking-section">
              <h5 class="order-section-title">Your Note to the Studio</h5>
              <p class="booking-message">${escapeBookingHTML(message)}</p>
            </div>` : ''}
        </article>`;
    }

    /* ---------- full-size preview of the package photo ---------- */

    function openBookingImagePreview(src) {
      closeBookingImagePreview();
      const overlay = document.createElement('div');
      overlay.className = 'image-preview-overlay';
      overlay.id = 'bookingImagePreviewOverlay';
      overlay.innerHTML = `<img src="${escapeBookingAttr(src)}" alt="Booking package photo">`;
      overlay.addEventListener('click', closeBookingImagePreview);
      document.body.appendChild(overlay);
    }

    function closeBookingImagePreview() {
      document.getElementById('bookingImagePreviewOverlay')?.remove();
    }

    function bookingsPageLogout() {
      CustomerAuth.logout();
      window.SaiAuthNav?.refresh();
      resetBookingsLoginGate();
    }

    window.addEventListener('DOMContentLoaded', initMyBookingsPage);
