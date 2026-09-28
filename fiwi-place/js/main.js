(function (init) {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(function () {
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ---- Header: solid glass background once the page scrolls ----
  var header = document.getElementById('siteHeader');
  function onScroll() {
    header.classList.toggle('is-scrolled', window.scrollY > 40);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---- Mobile menu ----
  var hamburger = document.getElementById('hamburgerBtn');
  var mainNav = document.getElementById('mainNav');
  function setMenu(open) {
    mainNav.classList.toggle('is-open', open);
    hamburger.classList.toggle('is-open', open);
    hamburger.setAttribute('aria-expanded', String(open));
    hamburger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  hamburger.addEventListener('click', function () {
    setMenu(!mainNav.classList.contains('is-open'));
  });
  mainNav.querySelectorAll('a, button').forEach(function (el) {
    el.addEventListener('click', function () { setMenu(false); });
  });

  // ---- Hero carousel ----
  var hero = document.getElementById('hero');
  var slides = Array.prototype.slice.call(document.querySelectorAll('.hero-slide'));
  var dotsWrap = document.getElementById('heroDots');
  var current = 0;
  var timer = null;

  slides.forEach(function (slide, i) {
    slide.setAttribute('aria-hidden', i === 0 ? 'false' : 'true');
    var dot = document.createElement('button');
    dot.type = 'button';
    dot.setAttribute('role', 'tab');
    dot.setAttribute('aria-label', 'Slide ' + (i + 1));
    dot.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
    if (i === 0) dot.classList.add('is-active');
    dot.addEventListener('click', function () { goTo(i); restart(); });
    dotsWrap.appendChild(dot);
  });
  var dots = Array.prototype.slice.call(dotsWrap.children);

  function goTo(index) {
    slides[current].classList.remove('is-active');
    slides[current].setAttribute('aria-hidden', 'true');
    dots[current].classList.remove('is-active');
    dots[current].setAttribute('aria-selected', 'false');
    current = (index + slides.length) % slides.length;
    slides[current].classList.add('is-active');
    slides[current].setAttribute('aria-hidden', 'false');
    dots[current].classList.add('is-active');
    dots[current].setAttribute('aria-selected', 'true');
  }
  function restart() {
    clearInterval(timer);
    if (!reduceMotion) timer = setInterval(function () { goTo(current + 1); }, 6500);
  }

  document.getElementById('heroNext').addEventListener('click', function () { goTo(current + 1); restart(); });
  document.getElementById('heroPrev').addEventListener('click', function () { goTo(current - 1); restart(); });

  var touchX = null;
  hero.addEventListener('touchstart', function (e) { touchX = e.touches[0].clientX; }, { passive: true });
  hero.addEventListener('touchend', function (e) {
    if (touchX === null) return;
    var dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 50) { goTo(current + (dx < 0 ? 1 : -1)); restart(); }
    touchX = null;
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) clearInterval(timer); else restart();
  });
  restart();

  // ---- Book Now modal ----
  // TODO: when the booking embed link is ready, route data-book values to it here.
  var overlay = document.getElementById('bookModalOverlay');
  var modalEventName = document.getElementById('bookModalEvent');
  var modalSummary = document.getElementById('bookModalSummary');
  var lastFocus = null;

  function openModal(eventName, summary) {
    lastFocus = document.activeElement;
    modalEventName.textContent = eventName || 'General Inquiry';
    modalSummary.textContent = summary || '';
    modalSummary.hidden = !summary;
    overlay.hidden = false;
    requestAnimationFrame(function () { overlay.classList.add('is-open'); });
    document.body.style.overflow = 'hidden';
    document.getElementById('bookModalClose').focus();
  }
  function closeModal() {
    if (overlay.hidden) return;
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(function () { overlay.hidden = true; }, reduceMotion ? 0 : 250);
    if (lastFocus) lastFocus.focus();
  }

  document.querySelectorAll('[data-book]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      openModal(btn.getAttribute('data-book'));
    });
  });
  document.getElementById('bookModalClose').addEventListener('click', closeModal);
  document.getElementById('bookModalDone').addEventListener('click', closeModal);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeModal(); setMenu(false); }
  });

  // Copy buttons: the visible text is the fallback when the clipboard is unavailable
  document.querySelectorAll('.copy-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var original = btn.textContent;
      function show(label) {
        btn.textContent = label;
        setTimeout(function () { btn.textContent = original; }, 1600);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(btn.getAttribute('data-copy')).then(
          function () { show('Copied'); },
          function () { show('Select text'); }
        );
      } else {
        show('Select text');
      }
    });
  });

  // Booking card: open the modal with what the visitor picked
  document.getElementById('bookingWidget').addEventListener('submit', function (e) {
    e.preventDefault();
    var eventType = document.getElementById('eventType').value;
    var menu = document.getElementById('menuOption').value;
    var shuttle = document.getElementById('shuttleOption').checked;
    var parts = [];
    if (menu) parts.push(menu);
    if (shuttle) parts.push('Shuttle requested');
    openModal(eventType || 'General Inquiry', parts.join(' · '));
  });
});
