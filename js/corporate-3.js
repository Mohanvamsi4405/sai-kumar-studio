    (function () {
      // Measures the fixed mobile header's real rendered height and exposes it two ways:
      //   1. As body's padding-top, so page content starts right below the fixed header.
      //   2. As the --corp-mobile-header-h CSS variable, so css/corporate.css can size the
      //      mobile ".corp-dashboard" shell (icon rail + scrolling content column, side by
      //      side, same pattern as photography.html's ".shell") to exactly fill the rest of
      //      the viewport beneath it.
      function fixMobileHeaderGap() {
        var header = document.querySelector('.mobile-sticky-header');
        if (!header) return;
        if (window.innerWidth <= 767) {
          var h = header.getBoundingClientRect().height;
          document.body.style.setProperty('padding-top', h + 'px', 'important');
          document.documentElement.style.setProperty('--corp-mobile-header-h', h + 'px');
        } else {
          document.body.style.removeProperty('padding-top');
          document.documentElement.style.removeProperty('--corp-mobile-header-h');
        }
      }
      window.addEventListener('load', fixMobileHeaderGap);
      window.addEventListener('resize', fixMobileHeaderGap);
      document.addEventListener('DOMContentLoaded', fixMobileHeaderGap);
      if (typeof ResizeObserver !== 'undefined') {
        document.addEventListener('DOMContentLoaded', function () {
          var el = document.querySelector('.mobile-sticky-header');
          if (el) new ResizeObserver(fixMobileHeaderGap).observe(el);
        });
      }

      // On mobile, main.main (formerly .corp-main-col) is its own
      // independently-scrolling column (see css/corporate.css) rather than
      // the page itself scrolling past it. switchCategory(key,
      // shouldScroll=true)'s own "scroll to the grid" step calls
      // window.scrollTo() on the whole PAGE - but the page barely scrolls at
      // all now (the shell has a fixed viewport-height footprint), so that
      // call just yanks the entire shell up by whatever offset it computed,
      // shoving the fixed header/rail out of sync with the footer sliding
      // into view underneath - the "everything jumps and looks broken"
      // effect clicking a hero slide or sidebar item produced.
      // Fix: run the original with scrolling suppressed, then do the
      // equivalent scroll inside main.main itself so the grid scrolls
      // into view within its own box instead of moving the page.
      if (typeof window.switchCategory === 'function') {
        var _switchCategory = window.switchCategory;
        window.switchCategory = function (key, shouldScroll) {
          if (window.innerWidth <= 767) {
            var wantsScroll = shouldScroll !== false;
            var result = _switchCategory.call(this, key, false);
            if (wantsScroll) {
              setTimeout(function () {
                var mainCol = document.querySelector('.corp-dashboard .main');
                var targetEl = document.getElementById('catalogContainer') || document.getElementById('productsGrid') || document.querySelector('.content-layout');
                if (!mainCol || !targetEl) return;
                var mainRect = mainCol.getBoundingClientRect();
                var targetRect = targetEl.getBoundingClientRect();
                var offset = Math.max(0, (targetRect.top - mainRect.top) + mainCol.scrollTop - 12);
                // A smooth-scrollTo() animation on this container was unreliable
                // (silently never reaching its target in some environments) -
                // a direct jump is less flashy but always actually lands.
                mainCol.scrollTop = offset;
              }, 50);
            }
            return result;
          }
          return _switchCategory.apply(this, arguments);
        };
      }
    })();
