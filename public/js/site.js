(function () {
  'use strict';

  // ---- Self-hosted analytics: page views + tracked clicks ----
  function track(type, label) {
    var data = JSON.stringify({ type: type, label: label || '', path: location.pathname });
    try {
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/track', new Blob([data], { type: 'application/json' }));
        return;
      }
    } catch (e) { /* fall through */ }
    try { fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: data, keepalive: true }); } catch (e) {}
  }
  track('pageview', document.title || location.pathname);
  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-track]') : null;
    if (el) track('click', el.getAttribute('data-track'));
  }, true);

  // Sticky header shadow on scroll
  var header = document.getElementById('siteHeader');
  function onScroll() {
    if (!header) return;
    header.classList.toggle('scrolled', window.scrollY > 10);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Mobile nav
  var toggle = document.getElementById('navToggle');
  var nav = document.querySelector('.main-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () { nav.classList.toggle('open'); });
  }

  // Copy promo code
  document.querySelectorAll('.promo-code').forEach(function (box) {
    var btn = box.querySelector('.promo-code-copy');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var code = box.getAttribute('data-code') || '';
      var done = function () {
        var prev = btn.textContent;
        box.classList.add('copied');
        btn.textContent = 'Скопировано!';
        setTimeout(function () { btn.textContent = prev; box.classList.remove('copied'); }, 1600);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(done).catch(done);
      } else {
        var t = document.createElement('textarea');
        t.value = code; document.body.appendChild(t); t.select();
        try { document.execCommand('copy'); } catch (e) {}
        document.body.removeChild(t); done();
      }
    });
  });

  // Gift widget: toggle the slide-out panel + copy code
  var giftWidget = document.getElementById('giftWidget');
  if (giftWidget) {
    var fab = document.getElementById('giftFab');
    var closeBtn = document.getElementById('giftClose');
    function setGift(open) {
      giftWidget.classList.toggle('open', open);
      if (fab) fab.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (fab) fab.addEventListener('click', function (e) {
      e.stopPropagation();
      setGift(!giftWidget.classList.contains('open'));
    });
    if (closeBtn) closeBtn.addEventListener('click', function () { setGift(false); });
    // Close when clicking outside the widget.
    document.addEventListener('click', function (e) {
      if (giftWidget.classList.contains('open') && !giftWidget.contains(e.target)) setGift(false);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setGift(false); });

    var giftCodeBox = giftWidget.querySelector('.gift-panel-code');
    if (giftCodeBox) {
      var gbtn = giftCodeBox.querySelector('.gift-code-copy');
      if (gbtn) gbtn.addEventListener('click', function () {
        var code = giftCodeBox.getAttribute('data-code') || '';
        var done = function () {
          var prev = gbtn.textContent;
          giftCodeBox.classList.add('copied');
          gbtn.textContent = 'Скопировано!';
          setTimeout(function () { gbtn.textContent = prev; giftCodeBox.classList.remove('copied'); }, 1600);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(code).then(done).catch(done);
        } else { done(); }
      });
    }
  }

  // Promo pagination
  var promoWrap = document.getElementById('promoGrid') && document.querySelector('.promo-section-wrap');
  if (promoWrap) {
    var perPage = parseInt(promoWrap.getAttribute('data-per-page'), 10) || 0;
    var grid = document.getElementById('promoGrid');
    var pagination = document.getElementById('promoPagination');
    if (perPage > 0 && grid && pagination) {
      var allCards = Array.prototype.slice.call(grid.querySelectorAll('.promo-card'));
      var allBanners = Array.prototype.slice.call(grid.querySelectorAll('.inline-banner'));
      var currentPage = 1;

      function showPage(page) {
        var start = (page - 1) * perPage;
        var end = start + perPage;

        // Show/hide cards
        allCards.forEach(function(card, i) {
          card.style.display = (i >= start && i < end) ? '' : 'none';
        });

        // Show/hide inline banners based on visible cards
        allBanners.forEach(function(ib) {
          var afterRow = parseInt(ib.getAttribute('data-ib-row') || '0', 10);
          // Find which row this banner follows, relative to current page start
          var firstVisibleIdx = start;
          var lastVisibleIdx = Math.min(end, allCards.length) - 1;
          // Banner's absolute row (1-based) among all cards
          // If after_row falls within the visible window, show it
          var bannerAbsRow = parseInt(ib.getAttribute('data-ib-abs-row') || '0', 10);
          var pageFirstRow = Math.floor(firstVisibleIdx / 3) + 1;
          var pageLastRow = Math.floor(lastVisibleIdx / 3) + 1;
          ib.style.display = (bannerAbsRow >= pageFirstRow && bannerAbsRow <= pageLastRow) ? '' : 'none';
        });

        // Update active button
        pagination.querySelectorAll('.promo-page-btn').forEach(function(btn) {
          btn.classList.toggle('active', parseInt(btn.getAttribute('data-page'), 10) === page);
        });

        currentPage = page;
      }

      // Attach data attributes to banners for quick row lookup
      allBanners.forEach(function(ib) {
        // Find the nearest preceding promo-card to determine its row
        var prev = ib.previousElementSibling;
        var idx = -1;
        while (prev) {
          if (prev.classList.contains('promo-card')) {
            var found = allCards.indexOf(prev);
            if (found !== -1) { idx = found; break; }
          }
          prev = prev.previousElementSibling;
        }
        var absRow = idx >= 0 ? Math.floor(idx / 3) + 1 : 0;
        ib.setAttribute('data-ib-abs-row', absRow);
      });

      pagination.addEventListener('click', function(e) {
        var btn = e.target.closest('.promo-page-btn');
        if (!btn) return;
        var page = parseInt(btn.getAttribute('data-page'), 10);
        if (page === currentPage) return;

        // Animate scroll to promo section
        var section = document.getElementById('promocodes');
        if (section) {
          section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        // Brief fade transition
        grid.style.transition = 'opacity 0.2s';
        grid.style.opacity = '0';
        setTimeout(function() {
          showPage(page);
          grid.style.opacity = '1';
        }, 200);
      });

      showPage(1);
    }
  }

  // Popups: close + remember dismissal for the session
  document.querySelectorAll('.popup-card').forEach(function (card) {
    var id = card.getAttribute('data-popup-id');
    var key = 'promocodich_popup_' + id;
    try { if (sessionStorage.getItem(key) === '1') { card.classList.add('hidden'); } } catch (e) {}
    var close = card.querySelector('.popup-close');
    if (close) {
      close.addEventListener('click', function () {
        try { sessionStorage.setItem(key, '1'); } catch (e) {}
        card.classList.add('closing');
        setTimeout(function () { card.classList.add('hidden'); card.classList.remove('closing'); }, 210);
      });
    }
  });
})();
