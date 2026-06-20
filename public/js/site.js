(function () {
  'use strict';

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

  // Popups: close + remember dismissal for the session
  document.querySelectorAll('.popup-card').forEach(function (card) {
    var id = card.getAttribute('data-popup-id');
    var key = 'promocodich_popup_' + id;
    try { if (sessionStorage.getItem(key) === '1') { card.classList.add('hidden'); } } catch (e) {}
    var close = card.querySelector('.popup-close');
    if (close) {
      close.addEventListener('click', function () {
        card.classList.add('hidden');
        try { sessionStorage.setItem(key, '1'); } catch (e) {}
      });
    }
  });
})();
