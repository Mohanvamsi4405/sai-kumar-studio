
    const ACCT_ORDER_STATUS_LABELS = {
      created: 'Created',
      payment_pending: 'Awaiting Payment',
      cod_confirmed: 'Confirmed (Cash on Delivery)',
      paid: 'Paid',
      in_production: 'Designing',
      shipped: 'Shipped',
      delivered: 'Delivered',
      cancelled: 'Cancelled',
      refunded: 'Refunded',
    };

    const ACCT_BOOKING_STATUS_LABELS = {
      enquiry: 'Enquiry Received',
      advance_pending: 'Advance Pending',
      confirmed: 'Confirmed',
      completed: 'Completed',
      cancelled: 'Cancelled',
    };

    let acctLoginEmail = '';
    let acctAddresses = [];

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

    function initMyAccountPage() {
      refreshCartBadge();
      if (isCustomerLoggedIn()) {
        showAcctContent();
      } else {
        resetAcctLoginGate();
      }
    }

    function resetAcctLoginGate() {
      document.getElementById('acctLoginGate').style.display = 'block';
      document.getElementById('acctContent').style.display = 'none';
      acctLoginEmail = getCustomerEmail() || '';
      document.getElementById('acctLoginEmail').value = acctLoginEmail;
      document.getElementById('acctLoginOtp').value = '';
      document.getElementById('acctLoginMsg').style.display = 'none';
      document.getElementById('acctLoginEmailStep').style.display = 'block';
      document.getElementById('acctLoginOtpStep').style.display = 'none';
    }

    function backToAcctEmailStep() {
      document.getElementById('acctLoginEmailStep').style.display = 'block';
      document.getElementById('acctLoginOtpStep').style.display = 'none';
      document.getElementById('acctLoginMsg').style.display = 'none';
    }

    async function sendAcctOtp() {
      const email = document.getElementById('acctLoginEmail').value.trim();
      const msgEl = document.getElementById('acctLoginMsg');
      msgEl.style.display = 'none';

      if (!Validators.isValidEmail(email)) {
        msgEl.textContent = 'Please enter a valid email address.';
        msgEl.style.display = 'block';
        return;
      }

      const btn = document.getElementById('acctSendOtpBtn');
      if (window.SkLoading) window.SkLoading.button(btn, true); else btn.disabled = true;
      try {
        await CustomerAuth.requestOtp(email);
        acctLoginEmail = email;
        document.getElementById('acctOtpSentTo').textContent = `(sent to ${email})`;
        document.getElementById('acctLoginEmailStep').style.display = 'none';
        document.getElementById('acctLoginOtpStep').style.display = 'block';
        document.getElementById('acctLoginOtp').focus();
      } catch (err) {
        msgEl.textContent = err.message || 'Could not send the OTP. Please try again.';
        msgEl.style.display = 'block';
      } finally {
        if (window.SkLoading) window.SkLoading.button(btn, false); else btn.disabled = false;
      }
    }

    async function verifyAcctOtp() {
      const code = document.getElementById('acctLoginOtp').value.trim();
      const msgEl = document.getElementById('acctLoginMsg');
      msgEl.style.display = 'none';

      if (!/^\d{6}$/.test(code)) {
        msgEl.textContent = 'Please enter the 6-digit code.';
        msgEl.style.display = 'block';
        return;
      }

      const btn = document.getElementById('acctVerifyOtpBtn');
      if (window.SkLoading) window.SkLoading.button(btn, true); else btn.disabled = true;
      try {
        await CustomerAuth.verifyOtp(acctLoginEmail, code);
        window.SaiAuthNav?.refresh();
        await showAcctContent();
      } catch (err) {
        msgEl.textContent = err.message || 'That code didn’t work. Please try again.';
        msgEl.style.display = 'block';
      } finally {
        if (window.SkLoading) window.SkLoading.button(btn, false); else btn.disabled = false;
      }
    }

    async function showAcctContent() {
      document.getElementById('acctLoginGate').style.display = 'none';
      document.getElementById('acctContent').style.display = 'block';
      await Promise.all([loadAcctProfile(), loadAcctAddresses(), loadAcctOrdersPreview(), loadAcctBookingsPreview()]);
      scrollToHashSection();
    }

    // The mobile menu's "My Addresses" link (js/shared/auth-modal.js) and any
    // other deep link into this page point at #acctAddressesSection - jump
    // there once the section actually has content, instead of relying on the
    // browser's own anchor scroll, which fires too early while #acctContent
    // is still display:none on first load. Plain scrollIntoView would tuck
    // the section right under the sticky header (.header-sticky-wrap, same
    // one cart.js's goToCartStep offsets for), hiding it - so offset by its
    // height instead.
    function scrollToHashSection() {
      const hash = (location.hash || '').replace('#', '');
      if (!hash) return;
      const el = document.getElementById(hash);
      if (!el) return;
      const header = document.querySelector('.header-sticky-wrap');
      const offset = (header ? header.offsetHeight : 0) + 16;
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
    }

    /* ---------- profile ---------- */

    function acctInitials(name, email) {
      const src = (name || email || 'U').trim();
      return src.split(/[\s@]+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    }

    async function loadAcctProfile() {
      try {
        const me = await CustomerAuth.getMe();
        document.getElementById('acctAvatar').textContent = acctInitials(me.name, me.email);
        document.getElementById('acctHeroName').textContent = me.name || 'Your Account';
        document.getElementById('acctHeroEmail').textContent = me.email;
        document.getElementById('acctNameInput').value = me.name || '';
        document.getElementById('acctPhoneInput').value = me.phone || '';
        document.getElementById('acctEmailInput').value = me.email;
        if (me.created_at) {
          const since = new Date(me.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
          document.getElementById('acctSince').textContent = since;
          document.getElementById('acctSinceChip').style.display = 'inline-flex';
        }
      } catch (err) {
        // session likely expired
        acctSignOut();
      }
    }

    async function saveAcctProfile() {
      const name = document.getElementById('acctNameInput').value.trim();
      const phone = document.getElementById('acctPhoneInput').value.trim();
      const msgEl = document.getElementById('acctProfileMsg');
      msgEl.style.display = 'none';
      msgEl.classList.remove('acct-save-ok');

      if (phone && !Validators.isValidPhone(phone)) {
        msgEl.textContent = 'Please enter a valid 10-digit mobile number.';
        msgEl.style.display = 'block';
        return;
      }

      const btn = document.getElementById('acctSaveProfileBtn');
      btn.disabled = true;
      try {
        const me = await CustomerAuth.updateMe({ name: name || null, phone: phone || null });
        document.getElementById('acctAvatar').textContent = acctInitials(me.name, me.email);
        document.getElementById('acctHeroName').textContent = me.name || 'Your Account';
        window.SaiAuthNav?.refresh();
        msgEl.textContent = 'Profile updated successfully.';
        msgEl.classList.add('acct-save-ok');
        msgEl.style.display = 'block';
      } catch (err) {
        msgEl.textContent = err.message || 'Could not update your profile. Please try again.';
        msgEl.style.display = 'block';
      } finally {
        btn.disabled = false;
      }
    }

    /* ---------- addresses ---------- */

    async function loadAcctAddresses() {
      const wrap = document.getElementById('acctAddressList');
      try {
        acctAddresses = await CustomerAuth.getAddresses();
        renderAcctAddresses();
      } catch (err) {
        wrap.innerHTML = `<div class="cart-form-msg" style="display:block;">${escapeAcctHTML(err.message || 'Could not load your addresses.')}</div>`;
      }
    }

    function renderAcctAddresses() {
      const wrap = document.getElementById('acctAddressList');
      if (!acctAddresses.length) {
        wrap.innerHTML = '<div class="acct-empty-mini">No saved addresses yet. Add one to speed up checkout.</div>';
        return;
      }
      wrap.innerHTML = `<div class="acct-address-grid">${acctAddresses.map(addressCardHTML).join('')}</div>`;
    }

    function escapeAcctHTML(s) {
      const d = document.createElement('div');
      d.textContent = s == null ? '' : s;
      return d.innerHTML;
    }

    function addressCardHTML(addr) {
      return `
        <div class="acct-address-card ${addr.is_default ? 'is-default' : ''}">
          <div class="acct-address-label-row">
            <span class="acct-address-label">${escapeAcctHTML(addr.label)}</span>
            ${addr.is_default ? '<span class="acct-default-badge">Default</span>' : ''}
          </div>
          <div class="acct-address-name">${escapeAcctHTML(addr.full_name)} &middot; ${escapeAcctHTML(addr.phone)}</div>
          <div class="acct-address-text">${escapeAcctHTML(addr.line1)}${addr.line2 ? ', ' + escapeAcctHTML(addr.line2) : ''}, ${escapeAcctHTML(addr.city)}, ${escapeAcctHTML(addr.state)} - ${escapeAcctHTML(addr.pincode)}</div>
          <div class="acct-address-actions">
            <button onclick="editAcctAddress('${addr.id}')">Edit</button>
            ${!addr.is_default ? `<button onclick="makeAcctAddressDefault('${addr.id}', this)">Set Default</button>` : ''}
            <button class="acct-danger" onclick="deleteAcctAddress('${addr.id}', this)">Delete</button>
          </div>
        </div>`;
    }

    function showAcctAddressForm() {
      document.getElementById('acctAddressForm').style.display = 'block';
      document.getElementById('acctAddAddressBtn').style.display = 'none';
      document.getElementById('acctAddressForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function hideAcctAddressForm() {
      document.getElementById('acctAddressForm').style.display = 'none';
      document.getElementById('acctAddAddressBtn').style.display = 'inline-flex';
      document.getElementById('acctAddressMsg').style.display = 'none';
      document.getElementById('acctAddressId').value = '';
      ['acctAddrLabel', 'acctAddrName', 'acctAddrPhone', 'acctAddrLine1', 'acctAddrLine2', 'acctAddrCity', 'acctAddrState', 'acctAddrPincode'].forEach(id => {
        document.getElementById(id).value = '';
      });
      document.getElementById('acctAddrDefault').checked = false;
    }

    function editAcctAddress(id) {
      const addr = acctAddresses.find(a => a.id === id);
      if (!addr) return;
      showAcctAddressForm();
      document.getElementById('acctAddressId').value = addr.id;
      document.getElementById('acctAddrLabel').value = addr.label || '';
      document.getElementById('acctAddrName').value = addr.full_name || '';
      document.getElementById('acctAddrPhone').value = addr.phone || '';
      document.getElementById('acctAddrLine1').value = addr.line1 || '';
      document.getElementById('acctAddrLine2').value = addr.line2 || '';
      document.getElementById('acctAddrCity').value = addr.city || '';
      document.getElementById('acctAddrState').value = addr.state || '';
      document.getElementById('acctAddrPincode').value = addr.pincode || '';
      document.getElementById('acctAddrDefault').checked = !!addr.is_default;
    }

    async function saveAcctAddress() {
      const msgEl = document.getElementById('acctAddressMsg');
      msgEl.style.display = 'none';

      const data = {
        label: document.getElementById('acctAddrLabel').value.trim() || 'Home',
        full_name: document.getElementById('acctAddrName').value.trim(),
        phone: document.getElementById('acctAddrPhone').value.trim(),
        line1: document.getElementById('acctAddrLine1').value.trim(),
        line2: document.getElementById('acctAddrLine2').value.trim() || null,
        city: document.getElementById('acctAddrCity').value.trim(),
        state: document.getElementById('acctAddrState').value.trim(),
        pincode: document.getElementById('acctAddrPincode').value.trim(),
        is_default: document.getElementById('acctAddrDefault').checked,
      };

      if (data.full_name.length < 2 || !Validators.isValidPhone(data.phone) || data.line1.length < 3 ||
          data.city.length < 2 || data.state.length < 2 || !/^\d{6}$/.test(data.pincode)) {
        msgEl.textContent = 'Please fill in all required fields correctly.';
        msgEl.style.display = 'block';
        return;
      }

      const id = document.getElementById('acctAddressId').value;
      const btn = document.getElementById('acctSaveAddressBtn');
      btn.disabled = true;
      try {
        if (id) {
          await CustomerAuth.updateAddress(id, data);
        } else {
          await CustomerAuth.createAddress(data);
        }
        hideAcctAddressForm();
        await loadAcctAddresses();
      } catch (err) {
        msgEl.textContent = err.message || 'Could not save this address. Please try again.';
        msgEl.style.display = 'block';
      } finally {
        btn.disabled = false;
      }
    }

    async function makeAcctAddressDefault(id, btn) {
      const addr = acctAddresses.find(a => a.id === id);
      if (!addr) return;
      if (window.SkLoading) window.SkLoading.button(btn, true);
      try {
        await CustomerAuth.updateAddress(id, { ...addr, is_default: true });
        await loadAcctAddresses();
      } catch (err) {
        if (window.SkLoading) window.SkLoading.button(btn, false);
        alert(err.message || 'Could not update this address.');
      }
    }

    async function deleteAcctAddress(id, btn) {
      if (!confirm('Remove this saved address?')) return;
      if (window.SkLoading) window.SkLoading.button(btn, true);
      try {
        await CustomerAuth.deleteAddress(id);
        await loadAcctAddresses();
      } catch (err) {
        if (window.SkLoading) window.SkLoading.button(btn, false);
        alert(err.message || 'Could not delete this address.');
      }
    }

    /* ---------- orders preview ---------- */

    async function loadAcctOrdersPreview() {
      const wrap = document.getElementById('acctOrdersPreview');
      try {
        const orders = await CustomerAuth.myOrders();
        if (!orders.length) {
          wrap.innerHTML = '<div class="acct-empty-mini">No orders yet. Once you place an order, it’ll show up here.</div>';
          return;
        }
        wrap.innerHTML = orders.slice(0, 3).map(orderMiniHTML).join('');
      } catch (err) {
        wrap.innerHTML = `<div class="cart-form-msg" style="display:block;">${escapeAcctHTML(err.message || 'Could not load your orders.')}</div>`;
      }
    }

    function orderMiniHTML(order) {
      const date = new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const statusLabel = ACCT_ORDER_STATUS_LABELS[order.status] || order.status;
      return `
        <div class="acct-order-mini">
          <div class="acct-order-mini-info">
            <b>Order ${escapeAcctHTML(order.number)}</b>
            <span>${date} &middot; &#8377;${Math.round(order.total)}</span>
          </div>
          <span class="order-status-badge order-status-${order.status}">${statusLabel}</span>
        </div>`;
    }

    /* ---------- photography bookings preview ---------- */

    async function loadAcctBookingsPreview() {
      const wrap = document.getElementById('acctBookingsPreview');
      try {
        const bookings = await CustomerAuth.myBookings();
        if (!bookings.length) {
          wrap.innerHTML = '<div class="acct-empty-mini">No photography bookings yet. Book a shoot and it’ll show up here.</div>';
          return;
        }
        wrap.innerHTML = bookings.slice(0, 3).map(bookingMiniHTML).join('');
      } catch (err) {
        wrap.innerHTML = `<div class="cart-form-msg" style="display:block;">${escapeAcctHTML(err.message || 'Could not load your bookings.')}</div>`;
      }
    }

    function bookingMiniHTML(booking) {
      const date = new Date(booking.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
      const statusLabel = ACCT_BOOKING_STATUS_LABELS[booking.status] || booking.status;
      const pkg = booking.details && booking.details.package ? booking.details.package : 'Photography Booking';
      return `
        <div class="acct-order-mini">
          <div class="acct-order-mini-info">
            <b>${escapeAcctHTML(pkg)}</b>
            <span>Booked on ${date}</span>
          </div>
          <span class="order-status-badge order-status-${booking.status}">${statusLabel}</span>
        </div>`;
    }

    /* ---------- sign out ---------- */

    function acctSignOut() {
      CustomerAuth.logout();
      window.SaiAuthNav?.refresh();
      resetAcctLoginGate();
    }

    window.addEventListener('DOMContentLoaded', initMyAccountPage);
