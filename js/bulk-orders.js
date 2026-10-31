
    // --- Mobile hamburger menu toggle (Secondary Navigation) ---
    function toggleMobileMenu() {
      const menu = document.getElementById('menuContainer');
      if (menu) menu.classList.toggle('mobile-open');
    }

    function closeModal() {
      document.getElementById('successModal').style.display = 'none';
    }

    // --- Cart Badge Sync (js/shared/cart-core.js - shared storage/sync logic) ---
    function getCart() {
      return CartCore.getCart();
    }

    function updateNavCartBadge() {
      const cart = getCart();
      const totalQty = Object.values(cart).reduce((sum, item) => sum + (item.qty || 0), 0);
      const cartBadgeEl = document.getElementById('navCartBadge');
      if (cartBadgeEl) {
        cartBadgeEl.textContent = totalQty;
        cartBadgeEl.style.display = totalQty > 0 ? 'flex' : 'none';
      }
    }

    window.addEventListener('storage', (e) => {
      if (e.key === 'sai_studio_cart') updateNavCartBadge();
    });

    // --- FAQ accordion (new, purely presentational) ---
    document.querySelectorAll('.faq-item').forEach((item) => {
      const question = item.querySelector('.faq-question');
      const answer = item.querySelector('.faq-answer');
      question.addEventListener('click', () => {
        const isOpen = item.classList.contains('open');
        document.querySelectorAll('.faq-item.open').forEach((openItem) => {
          if (openItem !== item) {
            openItem.classList.remove('open');
            openItem.querySelector('.faq-answer').style.maxHeight = null;
          }
        });
        if (isOpen) {
          item.classList.remove('open');
          answer.style.maxHeight = null;
        } else {
          item.classList.add('open');
          answer.style.maxHeight = answer.scrollHeight + 'px';
        }
      });
    });

    // --- Testimonial rotator (new, purely presentational) ---
    const testimonials = [
      {
        text: "Sai Kumar Digital Lab & Studio has been our trusted partner for all our corporate gifting needs. The quality, customization and timely delivery are excellent!",
        name: "Ramesh Kumar",
        role: "HR Manager, Tech Solutions Pvt. Ltd."
      },
      {
        text: "The bulk order process was seamless from quote to delivery. Our branded welcome kits arrived on time across all our regional offices.",
        name: "Priya Nair",
        role: "Admin Head, Bright Future Corp."
      },
      {
        text: "Great pricing for large quantities and the custom branding on our diaries and pens looked extremely premium.",
        name: "Arjun Mehta",
        role: "Procurement Lead, Vertex Industries"
      }
    ];
    let testimonialIndex = 0;

    function renderTestimonialDots() {
      const dotsWrap = document.getElementById('testimonialDots');
      dotsWrap.innerHTML = testimonials.map((_, i) =>
        `<button class="${i === testimonialIndex ? 'active' : ''}" onclick="goToTestimonial(${i})" aria-label="Testimonial ${i + 1}"></button>`
      ).join('');
    }

    function goToTestimonial(i) {
      testimonialIndex = i;
      const t = testimonials[i];
      document.getElementById('testimonialText').textContent = t.text;
      document.getElementById('testimonialName').textContent = t.name;
      document.getElementById('testimonialRole').textContent = t.role;
      renderTestimonialDots();
    }

    renderTestimonialDots();

    // --- Existing bulk inquiry form logic (unchanged behavior) ---
    window.addEventListener('DOMContentLoaded', () => {
      updateNavCartBadge();
      const bulkForm = document.getElementById('bulkInquiryForm');
      if (bulkForm) {
        bulkForm.addEventListener('submit', (e) => {
          e.preventDefault();
          document.getElementById('successModal').style.display = 'flex';
          bulkForm.reset();
        });
      }
    });
  