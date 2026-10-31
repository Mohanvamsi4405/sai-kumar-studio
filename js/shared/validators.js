// Shared client-side validation helpers. Several page scripts (contact-us.js,
// cart.js, booking-form.js, my-account.js) used to each keep their own copy of
// the same email/phone regexes, and they had already started drifting (e.g.
// booking-form.js only checked phone.length >= 10 instead of the real Indian
// mobile pattern the other forms use). Load this before any page script that
// validates a customer-entered email or phone number.
(function (global) {
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const PHONE_RE = /^[6-9]\d{9}$/;

  function isValidEmail(value) {
    return EMAIL_RE.test(String(value || '').trim());
  }

  function isValidPhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return PHONE_RE.test(digits);
  }

  global.Validators = { isValidEmail, isValidPhone };
})(window);
