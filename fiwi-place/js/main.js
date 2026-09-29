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
  // Book Now opens the Jotform booking form (loaded into the iframe on first open)
  var overlay = document.getElementById('bookModalOverlay');
  var modalEventName = document.getElementById('bookModalEvent');
  var modalSummary = document.getElementById('bookModalSummary');
  var lastFocus = null;

  var modalTitle = document.getElementById('bookModalTitle');
  var modalCopy = document.getElementById('bookModalCopy');
  var bookCopy = modalCopy.textContent;
  var bookingFrame = document.getElementById('bookingFrame');
  var bookingLink = document.getElementById('bookingLink');
  var bookingEmbed = bookingFrame ? bookingFrame.parentNode : null;

  function openModal(eventName, summary, isOrder) {
    lastFocus = document.activeElement;
    modalTitle.firstChild.textContent = isOrder ? 'Order: ' : 'Book Now: ';
    modalCopy.textContent = isOrder
      ? 'Online ordering is being set up. Call us and we will confirm availability, price and pickup for your order.'
      : bookCopy;
    if (bookingEmbed) {
      bookingEmbed.hidden = !!isOrder;
      if (!isOrder && !bookingFrame.src) bookingFrame.src = bookingFrame.getAttribute('data-src');
    }
    bookingLink.hidden = !!isOrder;
    document.getElementById('bookModalQuote').hidden = !!isOrder;
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
  document.querySelectorAll('[data-order]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      openModal(btn.getAttribute('data-order'), '', true);
    });
  });
  document.getElementById('bookModalClose').addEventListener('click', closeModal);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeModal(); closeQuote(); setMenu(false); }
  });

  // ---- Request a Quote page ----
  var QUOTE_ENDPOINT = 'https://formsubmit.co/ajax/fiwiplacejaofficial@gmail.com';
  var quotePage = document.getElementById('quotePage');
  var quoteForm = document.getElementById('quoteForm');
  var quoteError = document.getElementById('quoteError');
  var quoteSubmit = document.getElementById('quoteSubmit');
  var quoteDone = document.getElementById('quoteDone');
  var quoteFallback = document.getElementById('quoteFallback');
  var quoteSummary = document.getElementById('quoteSummary');
  var quoteReturn = null;

  function showQuoteView(view) {
    quoteForm.hidden = view !== 'form';
    quoteDone.hidden = view !== 'done';
    quoteFallback.hidden = view !== 'fallback';
    quotePage.scrollTop = 0;
  }
  function openQuote(eventName) {
    quoteReturn = document.activeElement;
    closeModal();
    setMenu(false);
    if (eventName) document.getElementById('qEvent').value = eventName;
    showQuoteView('form');
    quotePage.hidden = false;
    requestAnimationFrame(function () { quotePage.classList.add('is-open'); });
    document.body.style.overflow = 'hidden';
    document.getElementById('quoteBack').focus();
  }
  function closeQuote() {
    if (quotePage.hidden) return;
    quotePage.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(function () { quotePage.hidden = true; }, reduceMotion ? 0 : 300);
    if (quoteReturn) quoteReturn.focus();
  }

  document.querySelectorAll('[data-quote]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      openQuote(btn.getAttribute('data-quote'));
    });
  });
  document.getElementById('widgetQuote').addEventListener('click', function () {
    openQuote(document.getElementById('eventType').value);
  });
  document.getElementById('bookModalQuote').addEventListener('click', function () {
    var ev = modalEventName.textContent;
    openQuote(ev === 'General Inquiry' ? '' : ev);
  });
  ['quoteBack', 'quoteDoneBack'].forEach(function (id) {
    document.getElementById(id).addEventListener('click', closeQuote);
  });
  document.getElementById('quoteFallbackBack').addEventListener('click', function () { showQuoteView('form'); });

  function collectQuote() {
    var data = {};
    new FormData(quoteForm).forEach(function (value, key) {
      value = String(value).trim();
      if (!value) return;
      data[key] = data[key] ? data[key] + ', ' + value : value;
    });
    return data;
  }
  function summarize(data) {
    return Object.keys(data).map(function (k) { return k + ': ' + data[k]; }).join('\n');
  }

  quoteForm.addEventListener('submit', function (e) {
    e.preventDefault();
    quoteError.hidden = true;
    var missing = [];
    [['qEvent', 'type of event'], ['qGuests', 'number of guests'], ['qName', 'full name'], ['qPhone', 'phone'], ['qEmail', 'email']].forEach(function (f) {
      var el = document.getElementById(f[0]);
      var bad = !el.value.trim() || (el.type === 'email' && !el.checkValidity());
      el.classList.toggle('is-invalid', bad);
      if (bad) missing.push(f[1]);
    });
    if (missing.length) {
      quoteError.textContent = 'Please fill in: ' + missing.join(', ') + '.';
      quoteError.hidden = false;
      return;
    }
    var data = collectQuote();
    data._subject = 'Quote request: ' + data['Event type'] + ' (' + data['Name'] + ')';
    data._template = 'table';
    data._replyto = data.email;
    quoteSubmit.disabled = true;
    quoteSubmit.textContent = 'Sending...';
    fetch(QUOTE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(data)
    }).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok || String(body.success) !== 'true') throw new Error(body.message || 'Send failed');
      });
    }).then(function () {
      quoteForm.reset();
      showQuoteView('done');
    }).catch(function () {
      var clean = {};
      Object.keys(data).forEach(function (k) { if (k.charAt(0) !== '_') clean[k] = data[k]; });
      quoteSummary.textContent = summarize(clean);
      showQuoteView('fallback');
    }).then(function () {
      quoteSubmit.disabled = false;
      quoteSubmit.textContent = 'Request Quote';
    });
  });

  document.getElementById('quoteCopy').addEventListener('click', function () {
    var btn = this, text = quoteSummary.textContent;
    function show(label) { btn.textContent = label; setTimeout(function () { btn.textContent = 'Copy Request'; }, 1600); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { show('Copied'); }, function () {
        var r = document.createRange(); r.selectNodeContents(quoteSummary);
        var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); show('Text selected');
      });
    } else { show('Select the text above'); }
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
