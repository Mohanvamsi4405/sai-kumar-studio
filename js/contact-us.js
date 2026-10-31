    function closeModal() {
      document.getElementById('successModal').classList.remove('show');
    }

    window.addEventListener('DOMContentLoaded', () => {

      const CONTACT_API_BASE = window.SAI_API_BASE || "http://localhost:8000";

      /* ---------- Live open / closed status (9:00 AM – 9:00 PM, all week) ---------- */
      const OPEN_MINS = 9 * 60;
      const CLOSE_MINS = 21 * 60;

      function refreshStatus() {
        const now = new Date();
        const mins = now.getHours() * 60 + now.getMinutes();
        const row = document.getElementById('statusRow');
        const text = document.getElementById('statusText');
        const next = document.getElementById('statusNext');
        if (!row) return;

        if (mins >= OPEN_MINS && mins < CLOSE_MINS) {
          row.classList.remove('closed');
          text.textContent = 'Open Now';
          next.textContent = mins >= CLOSE_MINS - 60 ? 'Closing soon · 9:00 PM' : 'Closes at 9:00 PM';
        } else {
          row.classList.add('closed');
          text.textContent = 'Closed Right Now';
          next.textContent = mins < OPEN_MINS ? 'Opens today at 9:00 AM' : 'Opens tomorrow at 9:00 AM';
        }

        document.querySelectorAll('#hoursList .today-tag').forEach(tag => tag.remove());
        document.querySelectorAll('#hoursList li').forEach(li => {
          li.classList.toggle('today', Number(li.dataset.day) === now.getDay());
        });

        const todayRow = document.querySelector('#hoursList li.today .day');
        if (todayRow) {
          const tag = document.createElement('span');
          tag.className = 'today-tag';
          tag.textContent = 'Today';
          todayRow.appendChild(tag);
        }
      }

      refreshStatus();
      setInterval(refreshStatus, 60000);

      /* ---------- FAQ accordion ---------- */
      document.querySelectorAll('.faq-q').forEach(btn => {
        btn.setAttribute('aria-expanded', 'false');
        btn.addEventListener('click', () => {
          const item = btn.parentElement;
          const panel = item.querySelector('.faq-a');
          const isOpen = item.classList.contains('open');

          document.querySelectorAll('.faq-item.open').forEach(open => {
            open.classList.remove('open');
            open.querySelector('.faq-a').style.maxHeight = null;
            open.querySelector('.faq-q').setAttribute('aria-expanded', 'false');
          });

          if (!isOpen) {
            item.classList.add('open');
            panel.style.maxHeight = panel.scrollHeight + 'px';
            btn.setAttribute('aria-expanded', 'true');
          }
        });
      });

      /* Keep an open answer correctly sized when the window resizes */
      window.addEventListener('resize', () => {
        const openPanel = document.querySelector('.faq-item.open .faq-a');
        if (openPanel) openPanel.style.maxHeight = openPanel.scrollHeight + 'px';
      });

      /* ---------- Scroll reveal ---------- */
      const revealables = document.querySelectorAll('.reveal');
      if ('IntersectionObserver' in window) {
        const io = new IntersectionObserver((entries) => {
          entries.forEach((entry, i) => {
            if (entry.isIntersecting) {
              setTimeout(() => entry.target.classList.add('in'), i * 70);
              io.unobserve(entry.target);
            }
          });
        }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
        revealables.forEach(el => io.observe(el));
      } else {
        revealables.forEach(el => el.classList.add('in'));
      }

      /* ---------- Form: character counter ---------- */
      const messageBox = document.getElementById('contactMessage');
      const charCount = document.getElementById('charCount');
      if (messageBox && charCount) {
        messageBox.addEventListener('input', () => {
          charCount.textContent = messageBox.value.length;
        });
      }

      /* ---------- Form: validation + submit ---------- */
      const contactForm = document.getElementById('contactForm');
      const submitBtn = document.getElementById('submitBtn');

      const rules = {
        contactName: v => v.trim().length >= 2,
        contactPhone: v => Validators.isValidPhone(v),
        contactEmail: v => Validators.isValidEmail(v),
        contactSubject: v => v.trim().length >= 3,
        contactMessage: v => v.trim().length >= 10
      };

      function validateField(id) {
        const input = document.getElementById(id);
        const ok = rules[id](input.value);
        input.closest('.fld').classList.toggle('invalid', !ok);
        return ok;
      }

      Object.keys(rules).forEach(id => {
        const input = document.getElementById(id);
        if (!input) return;
        input.addEventListener('blur', () => validateField(id));
        input.addEventListener('input', () => {
          const wrap = input.closest('.fld');
          if (wrap.classList.contains('invalid')) validateField(id);
        });
      });

      if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
          e.preventDefault();

          const allValid = Object.keys(rules).map(validateField).every(Boolean);
          if (!allValid) {
            const firstBad = contactForm.querySelector('.fld.invalid input, .fld.invalid textarea');
            if (firstBad) {
              firstBad.focus();
              firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return;
          }

          const topic = document.querySelector('input[name="topic"]:checked');
          const fullName = document.getElementById('contactName').value.trim();
          const name = fullName.split(' ')[0];

          submitBtn.classList.add('loading');
          submitBtn.disabled = true;
          submitBtn.querySelector('.btn-label').textContent = 'Sending...';

          fetch(`${CONTACT_API_BASE}/api/contact`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: fullName,
              phone: document.getElementById('contactPhone').value.trim(),
              email: document.getElementById('contactEmail').value.trim(),
              topic: topic ? topic.value : null,
              subject: document.getElementById('contactSubject').value.trim(),
              message: document.getElementById('contactMessage').value.trim(),
            }),
          })
            .then(res => {
              if (!res.ok) throw new Error(`Request failed (${res.status})`);
              return res.json();
            })
            .then(() => {
              document.getElementById('modalMessage').textContent =
                'Thanks ' + name + '! Your ' + (topic ? topic.value.toLowerCase() : '') +
                ' enquiry has reached our studio team. We\'ll get back to you within 24 hours.';
              document.getElementById('successModal').classList.add('show');

              contactForm.reset();
              if (charCount) charCount.textContent = '0';
              contactForm.querySelectorAll('.fld.invalid').forEach(f => f.classList.remove('invalid'));
            })
            .catch(err => {
              console.error('Failed to send contact enquiry:', err);
              document.getElementById('modalMessage').textContent =
                'Sorry, something went wrong sending your message. Please try again, or reach us directly on WhatsApp/phone.';
              document.getElementById('successModal').classList.add('show');
            })
            .finally(() => {
              submitBtn.classList.remove('loading');
              submitBtn.disabled = false;
              submitBtn.querySelector('.btn-label').textContent = 'Send Message';
            });
        });
      }

      /* ---------- Modal dismissal ---------- */
      const overlay = document.getElementById('successModal');
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeModal();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeModal();
      });
    });
