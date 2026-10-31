
    // ---------- MOBILE BOTTOM NAV ----------
    function setActiveBottomNav(el) {
      document.querySelectorAll(".bottom-nav-item").forEach(i => i.classList.remove("active"));
      el.classList.add("active");
    }
  