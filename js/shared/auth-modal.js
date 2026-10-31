/* ============================================================
   Sai Kumar Digital Lab & Studio — shared sign-in modal
   ------------------------------------------------------------
   Every "Login" link on the site (index, about-us, bulk-orders,
   cart, contact-us, corporate, studio, my-orders) and every
   "nav-account-link" pointed at "#signin" / "index.html#signin" -
   an anchor that never existed - so the link did nothing. This
   file builds one shared modal, wires it to every touchpoint, and
   signs people in for real via email OTP (js/shared/customer-api.js -
   the same backend session checkout and My Orders use), so a
   customer who signs in here is recognized everywhere else too.
   Requires js/shared/customer-api.js to be loaded first.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- styles ---------- */
  function injectStyles() {
    var css =
      '.sk-auth-overlay{position:fixed;inset:0;z-index:1200;display:none;align-items:center;justify-content:center;' +
        'padding:20px;background:rgba(11,18,32,.55);backdrop-filter:blur(6px);font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;}' +
      '.sk-auth-overlay.show{display:flex;}' +
      '.sk-auth-card{position:relative;width:100%;max-width:400px;max-height:calc(100vh - 40px);overflow-y:auto;' +
        'background:#fff;border-radius:22px;box-shadow:0 30px 70px rgba(11,18,32,.35);animation:skPopIn .32s cubic-bezier(.175,.885,.32,1.275);}' +
      '@keyframes skPopIn{from{opacity:0;transform:scale(.9) translateY(10px);}to{opacity:1;transform:scale(1) translateY(0);}}' +
      '.sk-auth-top{height:5px;background:linear-gradient(90deg,#5C0930,#FFC700,#5C0930);border-radius:22px 22px 0 0;}' +
      '.sk-auth-close{position:absolute;top:16px;right:16px;width:32px;height:32px;border-radius:50%;border:none;' +
        'background:#F1F5F9;color:#334155;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .2s;}' +
      '.sk-auth-close:hover{background:#E2E8F0;}' +
      '.sk-auth-body{padding:30px 28px 28px;}' +
      '.sk-auth-brand{display:flex;align-items:center;gap:10px;margin-bottom:18px;}' +
      '.sk-auth-brand img{height:42px;width:42px;object-fit:contain;border-radius:9px;}' +
      '.sk-auth-brand strong{display:block;font-size:14.5px;font-weight:850;color:#0B1220;}' +
      '.sk-auth-brand small{display:block;font-size:10.5px;color:#64748B;letter-spacing:.3px;}' +
      '.sk-auth-head h2{font-size:21px;font-weight:900;color:#0B1220;letter-spacing:-.4px;margin-bottom:4px;}' +
      '.sk-auth-head p{font-size:13px;color:#64748B;margin-bottom:20px;line-height:1.5;}' +
      '.sk-fld{position:relative;margin-bottom:16px;}' +
      '.sk-fld input{width:100%;padding:20px 14px 8px;border:1.5px solid #E2E8F0;border-radius:11px;font-size:14px;' +
        'font-family:inherit;color:#0B1220;background:#FCFDFF;outline:none;transition:border-color .2s,box-shadow .2s;}' +
      '.sk-fld input:focus{border-color:#5C0930;background:#fff;box-shadow:0 0 0 4px rgba(92,9,48,.1);}' +
      '.sk-fld label{position:absolute;left:14px;top:14px;font-size:13.5px;color:#94A3B8;pointer-events:none;transition:all .15s ease;}' +
      '.sk-fld input:focus + label,.sk-fld input:not(:placeholder-shown) + label{top:6px;font-size:10px;font-weight:800;' +
        'letter-spacing:.5px;text-transform:uppercase;color:#5C0930;}' +
      '.sk-fld .sk-err{display:none;font-size:11px;font-weight:700;color:#EF4444;margin-top:5px;}' +
      '.sk-fld.invalid input{border-color:#FCA5A5;background:#FFF8F8;}' +
      '.sk-fld.invalid .sk-err{display:block;}' +
      '.sk-auth-msg{font-size:12.5px;font-weight:700;color:#DC2626;background:rgba(220,38,38,.08);' +
        'padding:10px 12px;border-radius:9px;margin-bottom:14px;}' +
      '.sk-otp-sent-to{font-weight:600;color:#94A3B8;text-transform:none;letter-spacing:0;}' +
      '.sk-auth-actions{display:flex;gap:10px;}' +
      '.sk-auth-actions .sk-auth-secondary{flex:0 0 auto;}' +
      '.sk-auth-submit{position:relative;overflow:hidden;flex:1;width:100%;padding:14px;border:none;border-radius:11px;' +
        'background:linear-gradient(135deg,#5C0930,#8A1049);color:#FFC700;font-size:14px;font-weight:850;cursor:pointer;' +
        'box-shadow:0 12px 26px rgba(92,9,48,.35);transition:transform .2s,box-shadow .2s;}' +
      '.sk-auth-submit:hover{transform:translateY(-2px);box-shadow:0 18px 34px rgba(92,9,48,.42);}' +
      '.sk-auth-submit:disabled{opacity:.7;cursor:progress;transform:none;}' +
      '.sk-auth-secondary{padding:14px 16px;border:1.5px solid #E2E8F0;border-radius:11px;background:#fff;' +
        'color:#475569;font-size:13.5px;font-weight:800;cursor:pointer;font-family:inherit;}' +
      '.sk-auth-secondary:hover{background:#F8FAFC;}' +
      '.sk-auth-divider{display:flex;align-items:center;gap:10px;margin:20px 0;color:#94A3B8;font-size:11px;font-weight:700;' +
        'text-transform:uppercase;letter-spacing:.5px;}' +
      '.sk-auth-divider::before,.sk-auth-divider::after{content:"";flex:1;height:1px;background:#E2E8F0;}' +
      '.sk-auth-guest{display:block;width:100%;text-align:center;padding:12px;border-radius:11px;border:1.5px solid #E2E8F0;' +
        'background:#fff;color:#334155;font-size:13px;font-weight:800;cursor:pointer;transition:background .2s,border-color .2s;}' +
      '.sk-auth-guest:hover{background:#FFFBEB;border-color:#FFC700;}' +
      /* success state */
      '.sk-auth-success{text-align:center;padding:8px 4px 4px;}' +
      '.sk-check{display:block;width:70px;height:70px;margin:6px auto 18px;}' +
      '.sk-check-c{fill:none;stroke:#22C55E;stroke-width:2.5;stroke-dasharray:157;stroke-dashoffset:157;animation:skDrawC .6s cubic-bezier(.65,0,.45,1) forwards;}' +
      '.sk-check-m{fill:none;stroke:#22C55E;stroke-width:3.2;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:48;' +
        'stroke-dashoffset:48;animation:skDrawM .35s cubic-bezier(.65,0,.45,1) .5s forwards;}' +
      '@keyframes skDrawC{to{stroke-dashoffset:0;}}@keyframes skDrawM{to{stroke-dashoffset:0;}}' +
      '.sk-auth-success h2{font-size:20px;font-weight:900;color:#0B1220;margin-bottom:6px;}' +
      '.sk-auth-success p{font-size:13.5px;color:#64748B;margin-bottom:22px;line-height:1.5;}' +
      /* account panel (logged-in state) */
      '.sk-account-avatar{width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#5C0930,#8A1049);' +
        'color:#FFC700;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;margin:0 auto 14px;}' +
      '.sk-account-name{text-align:center;font-size:17px;font-weight:850;color:#0B1220;}' +
      '.sk-account-sub{text-align:center;font-size:12.5px;color:#64748B;margin-bottom:24px;}' +
      '.sk-account-list{display:flex;flex-direction:column;gap:8px;margin-bottom:8px;}' +
      '.sk-account-item{display:flex;align-items:center;gap:12px;padding:13px 14px;border-radius:12px;border:1.5px solid #EEF2F7;' +
        'background:#fff;text-decoration:none;color:#0B1220;font-size:13.5px;font-weight:700;transition:background .2s,border-color .2s;cursor:pointer;text-align:left;width:100%;}' +
      '.sk-account-item:hover{background:#FDF5F9;border-color:#F0D9E4;}' +
      '.sk-account-item svg{color:#5C0930;flex-shrink:0;}' +
      '.sk-account-item.sk-logout{color:#DC2626;}' +
      '.sk-account-item.sk-logout svg{color:#DC2626;}' +
      /* mini account trigger states (nav text swap) */
      '.sk-user-chip{display:inline-flex;align-items:center;gap:7px;}' +
      '.sk-user-chip .sk-chip-dot{width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#5C0930,#8A1049);' +
        'color:#FFC700;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;}' +
      '@media (prefers-reduced-motion:reduce){.sk-auth-card,.sk-check-c,.sk-check-m,.sk-auth-submit{animation:none !important;transition:none !important;}}';
    var tag = document.createElement('style');
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  /* ---------- markup ---------- */
  function buildModal() {
    var overlay = document.createElement('div');
    overlay.className = 'sk-auth-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
      '<div class="sk-auth-card">' +
        '<div class="sk-auth-top"></div>' +
        '<button type="button" class="sk-auth-close" aria-label="Close">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>' +
        '</button>' +
        '<div class="sk-auth-body" id="skAuthBody"></div>' +
      '</div>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function brandBlock() {
    return (
      '<div class="sk-auth-brand">' +
        '<img src="https://pub-0f96bbc0f4a649b7b396578fc5db875b.r2.dev/skds_0438a7a87e/legacy/Sai_digital_lab_logo.png" alt="" loading="lazy">' +
        '<div><strong>Sai Kumar Digital Lab</strong><small>&amp; Studio</small></div>' +
      '</div>'
    );
  }

  function emailStepHTML(reason) {
    return (
      brandBlock() +
      '<div class="sk-auth-head">' +
        '<h2>' + escapeHTML((reason && reason.title) || 'Sign in') + '</h2>' +
        '<p>' + escapeHTML((reason && reason.body) ||
          'We only ever ask for your email - a 6-digit code takes it from there. Track orders and check out faster next time.') + '</p>' +
      '</div>' +
      '<div id="skAuthMsg" class="sk-auth-msg" style="display:none;"></div>' +
      '<form id="skEmailForm" novalidate>' +
        '<div class="sk-fld" data-field="email"><input type="email" id="skEmail" placeholder=" " autocomplete="email"><label for="skEmail">Email Address</label><span class="sk-err">Enter a valid email address</span></div>' +
        '<div class="sk-fld" data-field="name"><input type="text" id="skName" placeholder=" " autocomplete="name"><label for="skName">Full Name <span style="text-transform:none;font-weight:600;">(first time only)</span></label></div>' +
        '<button type="submit" class="sk-auth-submit" id="skSendOtpBtn"><span class="sk-label">Send OTP</span></button>' +
      '</form>' +
      '<div class="sk-auth-divider">or</div>' +
      '<button type="button" class="sk-auth-guest" id="skGuestBtn">Continue Browsing as Guest</button>'
    );
  }

  function otpStepHTML(email) {
    return (
      brandBlock() +
      '<div class="sk-auth-head">' +
        '<h2>Enter your code</h2>' +
        '<p>We sent a 6-digit code to <strong>' + escapeHTML(email) + '</strong>. It expires in 5 minutes.</p>' +
      '</div>' +
      '<div id="skAuthMsg" class="sk-auth-msg" style="display:none;"></div>' +
      '<form id="skOtpForm" novalidate>' +
        '<div class="sk-fld" data-field="otp"><input type="text" id="skOtp" placeholder=" " inputmode="numeric" maxlength="6"><label for="skOtp">6-Digit Code</label><span class="sk-err">Enter the 6-digit code</span></div>' +
        '<div class="sk-auth-actions">' +
          '<button type="button" class="sk-auth-secondary" id="skBackToEmailBtn">&larr; Back</button>' +
          '<button type="submit" class="sk-auth-submit" id="skVerifyOtpBtn"><span class="sk-label">Verify &amp; Continue</span></button>' +
        '</div>' +
      '</form>'
    );
  }

  function successHTML(name) {
    return (
      '<div class="sk-auth-success">' +
        '<svg class="sk-check" viewBox="0 0 52 52" aria-hidden="true">' +
          '<circle class="sk-check-c" cx="26" cy="26" r="25"/><path class="sk-check-m" d="M15 27l7.5 7.5L38 19"/>' +
        '</svg>' +
        '<h2>Signed in</h2>' +
        '<p>Welcome' + (name ? ', ' + escapeHTML(name.split(' ')[0]) : '') + '! You can now track orders and check out faster.</p>' +
        '<button type="button" class="sk-auth-submit" id="skSuccessContinue"><span class="sk-label">Continue</span></button>' +
      '</div>'
    );
  }

  function accountHTML(email, name) {
    var displayName = name || (email ? email.split('@')[0] : 'Your Account');
    var initials = (name || email || 'U').trim().split(/[\s@]+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
    return (
      '<div class="sk-account-avatar">' + escapeHTML(initials) + '</div>' +
      '<div class="sk-account-name">' + escapeHTML(displayName) + '</div>' +
      '<div class="sk-account-sub">' + escapeHTML(email || '') + '</div>' +
      '<div class="sk-account-list">' +
        '<a class="sk-account-item" href="my-account.html">' +
          '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>' +
          'My Account' +
        '</a>' +
        '<a class="sk-account-item" href="my-orders.html">' +
          '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v4H3z"/><path d="M5 7v13h14V7"/><path d="M9 12h6"/></svg>' +
          'My Orders' +
        '</a>' +
        '<a class="sk-account-item" href="my-bookings.html">' +
          '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="14" rx="3"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1.5-2h5L16 6"/></svg>' +
          'My Photography Bookings' +
        '</a>' +
        '<a class="sk-account-item" href="contact-us.html">' +
          '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.7a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.7.6a2 2 0 0 1 1.7 2z"/></svg>' +
          'Contact Support' +
        '</a>' +
        '<button type="button" class="sk-account-item sk-logout" id="skLogoutBtn">' +
          '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>' +
          'Sign Out' +
        '</button>' +
      '</div>'
    );
  }

  function escapeHTML(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : s;
    return d.innerHTML;
  }

  /* ---------- controller ---------- */
  var overlay, body;
  var pendingEmail = '';
  var pendingName = '';
  // Set by openModal(options) when something other than the nav "Login" link
  // asks for a sign-in (e.g. the wishlist heart): {title, body} replaces the
  // modal's generic copy, and onSuccess runs once the customer is signed in.
  var pendingReason = null;
  var pendingOnSuccess = null;

  function openModal(options) {
    pendingReason = (options && options.reason) || null;
    pendingOnSuccess = (options && typeof options.onSuccess === 'function') ? options.onSuccess : null;

    // Already signed in - the caller wanted the action, not the sign-in form.
    if (pendingOnSuccess && isCustomerLoggedIn()) {
      var done = pendingOnSuccess;
      pendingOnSuccess = null;
      pendingReason = null;
      done();
      return;
    }

    if (isCustomerLoggedIn()) {
      body.innerHTML = accountHTML(getCustomerEmail(), getCustomerName());
      overlay.classList.add('show');
      document.body.style.overflow = 'hidden';
      // Name may be stale (e.g. set on another device) - refresh quietly.
      CustomerAuth.getMe().then(function (me) {
        if (isCustomerLoggedIn()) body.innerHTML = accountHTML(getCustomerEmail(), me.name);
      }).catch(function () {});
    } else {
      pendingEmail = '';
      pendingName = '';
      body.innerHTML = emailStepHTML(pendingReason);
      overlay.classList.add('show');
      document.body.style.overflow = 'hidden';
      var firstInput = body.querySelector('input');
      if (firstInput) setTimeout(function () { firstInput.focus(); }, 60);
    }
  }

  function closeModal() {
    overlay.classList.remove('show');
    document.body.style.overflow = '';
    pendingReason = null;
    pendingOnSuccess = null;
  }

  function showAuthMsg(text) {
    var el = document.getElementById('skAuthMsg');
    if (!el) return;
    el.textContent = text;
    el.style.display = 'block';
  }

  function wireEmailForm() {
    var form = document.getElementById('skEmailForm');
    if (!form || form.dataset.wired) return;
    form.dataset.wired = '1';

    var guest = document.getElementById('skGuestBtn');
    if (guest) guest.addEventListener('click', closeModal);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var emailInput = document.getElementById('skEmail');
      var email = emailInput.value.trim();
      var wrap = emailInput.closest('.sk-fld');
      var valid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
      wrap.classList.toggle('invalid', !valid);
      if (!valid) return;

      var name = document.getElementById('skName').value.trim();
      var btn = document.getElementById('skSendOtpBtn');
      if (window.SkLoading) window.SkLoading.button(btn, true); else btn.disabled = true;
      CustomerAuth.requestOtp(email).then(function () {
        pendingEmail = email;
        pendingName = name;
        body.innerHTML = otpStepHTML(email);
        wireOtpForm();
        var otpInput = document.getElementById('skOtp');
        if (otpInput) otpInput.focus();
      }).catch(function (err) {
        if (window.SkLoading) window.SkLoading.button(btn, false); else btn.disabled = false;
        showAuthMsg(err.message || 'Could not send the OTP. Please try again.');
      });
    });
  }

  function wireOtpForm() {
    var form = document.getElementById('skOtpForm');
    if (!form || form.dataset.wired) return;
    form.dataset.wired = '1';

    var back = document.getElementById('skBackToEmailBtn');
    if (back) back.addEventListener('click', function () {
      body.innerHTML = emailStepHTML(pendingReason);
      wireEmailForm();
      var emailInput = document.getElementById('skEmail');
      if (emailInput) emailInput.value = pendingEmail;
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var otpInput = document.getElementById('skOtp');
      var code = otpInput.value.trim();
      var wrap = otpInput.closest('.sk-fld');
      var valid = /^\d{6}$/.test(code);
      wrap.classList.toggle('invalid', !valid);
      if (!valid) return;

      var btn = document.getElementById('skVerifyOtpBtn');
      if (window.SkLoading) window.SkLoading.button(btn, true); else btn.disabled = true;
      CustomerAuth.verifyOtp(pendingEmail, code, pendingName || undefined).then(function () {
        // cart.html's own pull-from-server sync only ever runs once, at page
        // load, gated on already being logged in at that instant - logging in
        // through this modal mid-session (without a reload) would otherwise
        // never pull in whatever's saved on the account, making the cart look
        // empty even though the server has it.
        if (window.syncCartWithServer) window.syncCartWithServer();
        // Same reasoning for the wishlist: saving is login-gated, so the moment
        // someone signs in we pull the account's saved items down into this tab.
        if (window.syncWishlistWithServer) window.syncWishlistWithServer();
        return CustomerAuth.getMe().catch(function () { return { name: pendingName }; });
      }).then(function (me) {
        body.innerHTML = successHTML(me && me.name);
        // Whatever the customer was trying to do when the gate appeared - e.g.
        // tapping the wishlist heart on a product - now runs for real, so they
        // don't have to hunt down the product and click it a second time.
        if (pendingOnSuccess) {
          var done = pendingOnSuccess;
          pendingOnSuccess = null;
          try { done(); } catch (_) {}
        }
        var cont = document.getElementById('skSuccessContinue');
        if (cont) cont.addEventListener('click', function () {
          closeModal();
          refreshTriggers();
        });
      }).catch(function (err) {
        if (window.SkLoading) window.SkLoading.button(btn, false); else btn.disabled = false;
        showAuthMsg(err.message || 'That code didn’t work. Please try again.');
      });
    });
  }

  function wireAccountPanel() {
    var logout = document.getElementById('skLogoutBtn');
    if (!logout || logout.dataset.wired) return;
    logout.dataset.wired = '1';
    logout.addEventListener('click', function () {
      CustomerAuth.logout();
      closeModal();
      refreshTriggers();
    });
  }

  function observeBody() {
    var mo = new MutationObserver(function () {
      wireEmailForm();
      wireOtpForm();
      wireAccountPanel();
    });
    mo.observe(body, { childList: true });
  }

  /* ---------- wiring every touchpoint on the page ---------- */
  function findTriggers() {
    var els = [];
    document.querySelectorAll(
      'a[href="#signin"], a[href="index.html#signin"], a.nav-login-link, a.nav-account-link, a.bottom-nav-item[href*="#signin"]'
    ).forEach(function (el) { els.push(el); });

    var avatar = document.querySelector('.mobile-profile, .mobile-avatar');
    if (avatar) els.push(avatar.classList.contains('mobile-profile') ? avatar : avatar.closest('.mobile-profile') || avatar);

    return els;
  }

  function triggerLabel() {
    var name = getCustomerName();
    var email = getCustomerEmail();
    var first = name ? name.trim().split(' ')[0] : (email ? email.split('@')[0] : 'Account');
    var initials = (name || email || 'U').trim().split(/[\s@]+/).map(function (w) { return w[0]; }).slice(0, 2).join('').toUpperCase();
    return { first: first, initials: initials };
  }

  // Site-wide hamburger drawer (#mobileMenuDrawer, present on every page -
  // see js/shared/wishlist-menu.js's openMobileMenuDrawer). Logged in, it
  // gets a profile card (name/email/phone) up top and a Logout link pinned
  // to the bottom of the list; logged out, it falls back to the drawer's
  // own static "Login / Account" link.
  var mePhoneFetchAttempted = false;

  function refreshMobileMenuDrawer() {
    var drawer = document.getElementById('mobileMenuDrawer');
    if (!drawer) return;
    var header = drawer.querySelector('.cart-drawer-header');
    var linksWrap = drawer.querySelector('.mobile-menu-links');
    if (!header || !linksWrap) return;

    var loggedIn = isCustomerLoggedIn();
    var authLink = linksWrap.querySelector('a[href="#signin"]');
    var profile = drawer.querySelector('.mobile-menu-profile');

    if (loggedIn) {
      var email = getCustomerEmail();
      var phone = getCustomerPhone();
      var t = triggerLabel();
      var displayName = getCustomerName() || (email ? email.split('@')[0] : 'My Account');

      if (!profile) {
        profile = document.createElement('div');
        profile.className = 'mobile-menu-profile';
        header.insertAdjacentElement('afterend', profile);
      }
      profile.innerHTML =
        '<span class="mobile-menu-avatar">' + escapeHTML(t.initials) + '</span>' +
        '<span class="mobile-menu-profile-info">' +
          '<span class="mobile-menu-profile-name">' + escapeHTML(displayName) + '</span>' +
          (email ? '<span class="mobile-menu-profile-detail">' + escapeHTML(email) + '</span>' : '') +
          (phone ? '<span class="mobile-menu-profile-detail">' + escapeHTML(phone) + '</span>' : '') +
        '</span>';
      profile.style.display = 'flex';

      // Phone isn't part of the login response - fetch it once so the card
      // fills in without waiting on some other page to call getMe() first.
      if (!phone && !mePhoneFetchAttempted) {
        mePhoneFetchAttempted = true;
        CustomerAuth.getMe().then(function () { refreshMobileMenuDrawer(); }).catch(function () {});
      }
    } else {
      mePhoneFetchAttempted = false;
      if (profile) profile.style.display = 'none';
    }

    if (authLink) authLink.style.display = loggedIn ? 'none' : '';

    var detailsLink = linksWrap.querySelector('.mobile-menu-details-link');
    if (loggedIn) {
      if (!detailsLink) {
        detailsLink = document.createElement('a');
        detailsLink.className = 'mobile-menu-details-link';
        detailsLink.href = 'my-account.html';
        detailsLink.innerHTML =
          '<svg class="mobile-menu-link-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/></svg>' +
          '<span>My Details</span>';
        // Pinned to the top of the list, right under the profile card -
        // unlike Logout (bottom), this is somewhere people look for it first.
        linksWrap.insertBefore(detailsLink, linksWrap.firstChild);
      }
    } else if (detailsLink) {
      detailsLink.remove();
    }

    var logoutLink = linksWrap.querySelector('.mobile-menu-logout');
    if (loggedIn) {
      if (!logoutLink) {
        logoutLink = document.createElement('a');
        logoutLink.href = '#';
        logoutLink.className = 'mobile-menu-logout';
        logoutLink.innerHTML =
          '<svg class="mobile-menu-link-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>' +
          '<span>Logout</span>';
        logoutLink.addEventListener('click', function (e) {
          e.preventDefault();
          CustomerAuth.logout();
          refreshTriggers();
          if (typeof closeMobileMenuDrawer === 'function') closeMobileMenuDrawer();
        });
        linksWrap.appendChild(logoutLink);
      }
    } else if (logoutLink) {
      logoutLink.remove();
    }
  }

  function refreshTriggers() {
    var loggedIn = isCustomerLoggedIn();
    refreshMobileMenuDrawer();
    findTriggers().forEach(function (el) {
      if (el.classList.contains('nav-login-link')) {
        if (loggedIn) {
          var t = triggerLabel();
          el.innerHTML = '<span class="sk-user-chip"><span class="sk-chip-dot">' + escapeHTML(t.initials) + '</span>' + escapeHTML(t.first) + '</span>';
        } else {
          el.textContent = 'Login';
        }
      } else if (el.classList.contains('nav-account-link')) {
        var span = el.querySelector('span');
        if (span) span.textContent = loggedIn ? triggerLabel().first : 'Login';
      } else if (el.classList.contains('bottom-nav-item')) {
        var lbl = el.querySelector('span:last-child');
        if (lbl) lbl.textContent = loggedIn ? triggerLabel().first : 'Account';
      } else if (el.classList.contains('mobile-profile')) {
        var av = el.querySelector('.mobile-avatar');
        if (av) {
          if (loggedIn) {
            av.innerHTML = '<span style="font-size:12px;font-weight:800;">' + escapeHTML(triggerLabel().initials) + '</span>';
          } else {
            av.innerHTML =
              '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">' +
              '<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
          }
        }
      }
    });
  }

  function wireTriggers() {
    findTriggers().forEach(function (el) {
      el.style.cursor = 'pointer';
      el.addEventListener('click', function (e) {
        e.preventDefault();
        openModal();  // no options - the plain nav sign-in, not a gated action
      });
    });
  }

  /* ---------- start ---------- */
  function init() {
    injectStyles();
    overlay = buildModal();
    body = document.getElementById('skAuthBody');

    overlay.querySelector('.sk-auth-close').addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && overlay.classList.contains('show')) closeModal(); });

    observeBody();
    wireTriggers();
    refreshTriggers();
  }

  // Other pages sign the customer in/out through their own OTP forms (cart.js's
  // checkout gate, my-orders.js's login gate) instead of this modal - they need
  // a way to tell this shared header nav to update after doing so.
  window.SaiAuthNav = { refresh: function () { refreshTriggers(); } };

  // Lets any page open this modal to gate an action behind sign-in:
  //   SaiAuth.open({ reason: {title, body}, onSuccess: fn })
  // If the customer is already signed in, onSuccess runs immediately and no
  // modal is shown. Used by the site-wide wishlist heart (wishlist-menu.js).
  window.SaiAuth = {
    open: function (options) { openModal(options); },
    close: function () { closeModal(); },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
