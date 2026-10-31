    (function () {
      function init() {
      var track = document.getElementById('heroTrack');
      var dots = document.querySelectorAll('#heroDots .hero-dot');
      var prevBtn = document.getElementById('heroPrev');
      var nextBtn = document.getElementById('heroNext');
      var slideCount = 4;
      var totalSlots = slideCount + 2; // leading clone + 4 real + trailing clone
      var slotWidth = 100 / totalSlots;
      var pos = 1; // starts on real slide 0 (Photography)
      var timer;

      function goTo(p, animate) {
        track.style.transition = animate === false ? 'none' : 'transform .7s cubic-bezier(.65,0,.35,1)';
        track.style.transform = 'translateX(-' + (p * slotWidth) + '%)';
        var realIndex = ((p - 1) % slideCount + slideCount) % slideCount;
        dots.forEach(function (d, di) {
          d.classList.toggle('active', di === realIndex);
        });
      }

      function next() {
        pos++;
        goTo(pos);
      }

      function prev() {
        pos--;
        goTo(pos);
      }

      track.addEventListener('transitionend', function (e) {
        if (e.target !== track || e.propertyName !== 'transform') return;
        if (pos >= totalSlots - 1) {
          pos = 1;
          goTo(pos, false);
        } else if (pos <= 0) {
          pos = slideCount;
          goTo(pos, false);
        }
      });

      function startAutoplay() {
        clearInterval(timer);
        timer = setInterval(next, 3000);
      }

      function stopAutoplay() {
        clearInterval(timer);
      }

      function restartAutoplay() {
        stopAutoplay();
        startAutoplay();
      }

      dots.forEach(function (dot) {
        dot.addEventListener('click', function () {
          pos = parseInt(dot.dataset.i, 10) + 1;
          goTo(pos);
          restartAutoplay();
        });
      });

      nextBtn.addEventListener('click', function () {
        next();
        restartAutoplay();
      });

      prevBtn.addEventListener('click', function () {
        prev();
        restartAutoplay();
      });

      var heroEl = document.querySelector('.hero');
      heroEl.addEventListener('mouseenter', stopAutoplay);
      heroEl.addEventListener('mouseleave', startAutoplay);

      goTo(pos, false);
      startAutoplay();
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
      } else {
        init();
      }
    })();
