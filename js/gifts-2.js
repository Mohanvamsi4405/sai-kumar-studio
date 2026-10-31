document.addEventListener('DOMContentLoaded', () => {
  // 1. Sync cart count
  const cartCountHeader = document.getElementById('cartCount');
  const mobileCartCount = document.getElementById('mobileCartCount');
  if (cartCountHeader && mobileCartCount) {
    const observer = new MutationObserver(() => {
      mobileCartCount.textContent = cartCountHeader.textContent;
    });
    observer.observe(cartCountHeader, { childList: true, characterData: true });
    mobileCartCount.textContent = cartCountHeader.textContent;
  }

  // 2. Set active tab based on query param view
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view') || 'home';
  document.querySelectorAll('.mobile-bottom-nav-item').forEach(item => item.classList.remove('active'));
  if (view === 'home') {
    document.getElementById('navItemHome')?.classList.add('active');
  } else if (view === 'category') {
    document.getElementById('navItemCategories')?.classList.add('active');
  }

  // 3. Dynamic Subcategory Hover Switch in Mega Dropdowns
  function initSubcategoryHover() {
    document.querySelectorAll('.category-menu-bar .nav-item').forEach(navItem => {
      const triggers = navItem.querySelectorAll('.subcat-trigger[data-subcat-target]');
      const panels = navItem.querySelectorAll('.subcat-product-panel');

      triggers.forEach(trigger => {
        trigger.addEventListener('mouseenter', () => {
          const targetId = trigger.getAttribute('data-subcat-target');
          if (!targetId) return;

          triggers.forEach(t => t.classList.remove('active'));
          trigger.classList.add('active');

          panels.forEach(p => {
            if (p.id === targetId) {
              p.classList.add('active');
            } else {
              p.classList.remove('active');
            }
          });
        });
      });

      // Reset to first when re-entering parent nav item
      navItem.addEventListener('mouseenter', () => {
        const activeTrigger = navItem.querySelector('.subcat-trigger.active') || triggers[0];
        if (activeTrigger) {
          const targetId = activeTrigger.getAttribute('data-subcat-target');
          if (targetId) {
            panels.forEach(p => {
              if (p.id === targetId) {
                p.classList.add('active');
              } else {
                p.classList.remove('active');
              }
            });
          }
        }
      });
    });
  }
  initSubcategoryHover();
});
