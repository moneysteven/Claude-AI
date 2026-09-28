document.addEventListener('DOMContentLoaded', function () {

  // Footer year
  var yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Sticky header background on scroll
  var header = document.getElementById('siteHeader');
  function onScroll() {
    if (window.scrollY > 40) header.classList.add('is-scrolled');
    else header.classList.remove('is-scrolled');
  }
  window.addEventListener('scroll', onScroll);
  onScroll();

  // Mobile nav toggle
  var hamburger = document.getElementById('hamburgerBtn');
  var mainNav = document.getElementById('mainNav');
  hamburger.addEventListener('click', function () {
    var isOpen = mainNav.classList.toggle('is-open');
    hamburger.classList.toggle('is-open', isOpen);
    hamburger.setAttribute('aria-expanded', String(isOpen));
  });
  mainNav.querySelectorAll('a, button').forEach(function (el) {
    el.addEventListener('click', function () {
      mainNav.classList.remove('is-open');
      hamburger.classList.remove('is-open');
      hamburger.setAttribute('aria-expanded', 'false');
    });
  });

  // ---- Hero carousel ----
  var slides = Array.prototype.slice.call(document.querySelectorAll('.hero-slide'));
  var dotsWrap = document.getElementById('heroDots');
  var current = 0;
  var timer;

  slides.forEach(function (_, i) {
    var dot = document.createElement('button');
    if (i === 0) dot.classList.add('is-active');
    dot.addEventListener('click', function () { goTo(i); resetTimer(); });
    dotsWrap.appendChild(dot);
  });
  var dots = Array.prototype.slice.call(dotsWrap.children);

  function goTo(index) {
    slides[current].classList.remove('is-active');
    dots[current].classList.remove('is-active');
    current = (index + slides.length) % slides.length;
    slides[current].classList.add('is-active');
    dots[current].classList.add('is-active');
  }

  function resetTimer() {
    clearInterval(timer);
    timer = setInterval(function () { goTo(current + 1); }, 6000);
  }

  document.getElementById('heroNext').addEventListener('click', function () { goTo(current + 1); resetTimer(); });
  document.getElementById('heroPrev').addEventListener('click', function () { goTo(current - 1); resetTimer(); });
  resetTimer();

  // ---- Book Now modal ----
  var overlay = document.getElementById('bookModalOverlay');
  var modalEventName = document.getElementById('bookModalEvent');
  var closeBtn = document.getElementById('bookModalClose');

  function openModal(eventName) {
    modalEventName.textContent = eventName || 'General Inquiry';
    overlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  document.querySelectorAll('[data-book]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      openModal(btn.getAttribute('data-book'));
    });
  });

  closeBtn.addEventListener('click', closeModal);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeModal();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeModal();
  });

  // Booking widget submit -> open modal with selected event type
  var bookingWidget = document.getElementById('bookingWidget');
  bookingWidget.addEventListener('submit', function (e) {
    e.preventDefault();
    var eventType = document.getElementById('eventType').value || 'General Inquiry';
    openModal(eventType);
  });

});
