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

  // slides after the first wait for the page to finish loading, so the first
  // screen gets the bandwidth (matters most on mobile data)
  function loadSlide(i) {
    var img = slides[(i + slides.length) % slides.length].querySelector('img[data-srcset]');
    if (!img) return;
    img.srcset = img.getAttribute('data-srcset');
    img.src = img.getAttribute('data-src');
    img.removeAttribute('data-srcset');
    img.removeAttribute('data-src');
  }
  function loadAllSlides() { slides.forEach(function (s, i) { loadSlide(i); }); }
  if (document.readyState === 'complete') loadAllSlides();
  else window.addEventListener('load', loadAllSlides);

  function goTo(index) {
    loadSlide(index);
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
  // start the slideshow once the opening bonfire has finished
  if (document.getElementById('intro')) document.addEventListener('fiwi:intro-done', restart, { once: true });
  else restart();

  // ---- WhatsApp button: on phones, tucked away while the booking box at the
  // top is on screen so it doesn't cover Book Now / Request Quote ----
  var waFloat = document.getElementById('waFloat');
  var bookingBox = document.getElementById('bookingWidget');
  if (waFloat && bookingBox && 'IntersectionObserver' in window) {
    var boxInView = false;
    var updateWa = function () { waFloat.classList.toggle('is-tucked', boxInView && window.innerWidth < 720); };
    new IntersectionObserver(function (entries) { boxInView = entries[0].isIntersecting; updateWa(); }).observe(bookingBox);
    window.addEventListener('resize', updateWa);
  }

  // ---- Merch order modal ----
  var overlay = document.getElementById('bookModalOverlay');
  var modalEventName = document.getElementById('bookModalEvent');
  var lastFocus = null;
  function openModal(itemName) {
    lastFocus = document.activeElement;
    modalEventName.textContent = itemName;
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
  document.querySelectorAll('[data-order]').forEach(function (btn) {
    btn.addEventListener('click', function (e) { e.preventDefault(); openModal(btn.getAttribute('data-order')); });
  });
  document.getElementById('bookModalClose').addEventListener('click', closeModal);
  overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });

  // ---- Booking and quote pages (full-screen forms emailed to FiWi Place) ----
  var FORM_ENDPOINT = 'https://formsubmit.co/ajax/fiwiplacejaofficial@gmail.com';
  var pages = {};
  var openPage = null;

  function setupPage(page) {
    var kind = page.getAttribute('data-kind');
    var form = page.querySelector('.fp-form');
    var eventSel = form.querySelector('.fp-event');
    var errorEl = page.querySelector('.fp-error');
    var submitBtn = page.querySelector('.fp-submit');
    var submitLabel = submitBtn.textContent;
    var doneEl = page.querySelector('.fp-done');
    var fallbackEl = page.querySelector('.fp-fallback');
    var summaryEl = page.querySelector('.fp-summary');
    var capacityEl = form.querySelector('.q-capacity');
    var returnFocus = null;

    function cateringSite() {
      var r = form.querySelector('input[name="Catering location"]:checked');
      return r ? r.value : '';
    }
    function setVisible(el, show) {
      el.hidden = !show;
      el.querySelectorAll('input, select, textarea').forEach(function (c) { c.disabled = !show; });
      if (el.matches('input, select, textarea')) el.disabled = !show;
    }
    function listHas(attr, ev) {
      return attr.split(',').map(function (s) { return s.trim(); }).indexOf(ev) !== -1;
    }
    function refresh() {
      var ev = eventSel.value;
      var offsite = ev === 'Catering' && /^Off/.test(cateringSite());
      form.querySelectorAll('[data-show-events]').forEach(function (el) { setVisible(el, listHas(el.getAttribute('data-show-events'), ev)); });
      form.querySelectorAll('[data-hide-events]:not([data-venue])').forEach(function (el) { setVisible(el, !listHas(el.getAttribute('data-hide-events'), ev)); });
      // venue areas: hidden for off-site catering and for events listed in data-hide-events
      form.querySelectorAll('[data-venue]').forEach(function (el) {
        var hideFor = el.getAttribute('data-hide-events');
        setVisible(el, !offsite && !(hideFor && listHas(hideFor, ev)));
      });
      form.querySelectorAll('[data-offsite]').forEach(function (el) { setVisible(el, offsite); });
      // follow-up choices for one location (e.g. picnic area seating)
      var locPick = form.querySelector('input[name="Location"]:checked');
      form.querySelectorAll('[data-show-location]').forEach(function (el) {
        setVisible(el, !!locPick && !locPick.disabled && locPick.value.indexOf(el.getAttribute('data-show-location')) === 0);
      });
      // private dinner: show the starters and mains of the chosen menu only
      var pdMenu = form.querySelector('input[name="Private dinner menu"]:checked');
      form.querySelectorAll('[data-pd-menu]').forEach(function (el) {
        setVisible(el, ev === 'Private Dinner' && !!pdMenu && !pdMenu.disabled && pdMenu.value.indexOf(el.getAttribute('data-pd-menu') + ' ') === 0);
      });
      lockBridgeGuests(ev);
      checkCapacity();
    }
    // a dinner on the bridge is for two: show 2 guests and lock the field
    var guestsEl = form.querySelector('.fp-guests');
    var guestsHint = form.querySelector('.fp-guests-hint');
    function lockBridgeGuests(ev) {
      if (!guestsEl) return;
      var setting = form.querySelector('input[name="Private dinner setting"]:checked');
      var bridge = ev === 'Private Dinner' && setting && !setting.disabled && /^On the bridge/.test(setting.value);
      if (bridge) {
        guestsEl.value = '2';
        guestsEl.readOnly = true;
        guestsEl.dataset.locked = '1';
        guestsEl.max = 2;
        guestsEl.closest('[data-req]').classList.remove('has-error');
        guestsEl.classList.remove('is-invalid');
      } else if (guestsEl.dataset.locked) {
        guestsEl.readOnly = false;
        guestsEl.value = '';
        delete guestsEl.dataset.locked;
      }
      if (guestsHint && bridge) { guestsHint.textContent = 'Dinners on the bridge are for 2 people only.'; guestsHint.hidden = false; }
    }
    // the most guests the chosen dinner setting or area allows (none for the
    // entire venue or the open lawn); the guest count can't go above it
    var WORD_NUMBERS = { two: 2, four: 4, eight: 8 };
    function guestCap() {
      var ev = eventSel.value;
      if (ev === 'Private Dinner') {
        var setting = form.querySelector('input[name="Private dinner setting"]:checked');
        var w = setting && !setting.disabled && setting.value.match(/maximum (\w+) people/);
        if (w && WORD_NUMBERS[w[1]]) return { max: WORD_NUMBERS[w[1]], where: setting.value.replace(/ \(.*$/, '').replace(/^(In|On) the /, 'The ') };
        return null;
      }
      var loc = form.querySelector('input[name="Location"]:checked');
      // "capacity 20-30" caps at 30, "capacity 40" at 40; "capacity 1000+" has no cap
      var m = loc && !loc.disabled && loc.value.match(/capacity (\d+)(?:-(\d+))?(?![\d+])/);
      return m ? { max: parseInt(m[2] || m[1], 10), where: loc.value.replace(/ \(.*$/, '') } : null;
    }
    function checkCapacity() {
      if (capacityEl) capacityEl.hidden = true;
      if (!guestsEl || guestsEl.dataset.locked) return;
      var cap = guestCap();
      if (!cap) {
        guestsEl.removeAttribute('max');
        if (guestsHint) guestsHint.hidden = true;
        return;
      }
      guestsEl.max = cap.max;
      var guests = parseInt(guestsEl.value, 10);
      if (guests > cap.max) guestsEl.value = cap.max;
      if (guestsHint) {
        guestsHint.textContent = cap.where + ' holds up to ' + cap.max + ' guests.';
        guestsHint.hidden = false;
      }
    }
    function clearError(e) {
      var wrap = e.target.closest('[data-req]');
      if (wrap) wrap.classList.remove('has-error');
      e.target.classList.remove('is-invalid');
    }
    form.addEventListener('change', function (e) { clearError(e); refresh(); });
    form.addEventListener('input', clearError);
    form.addEventListener('input', function (e) { if (e.target.classList.contains('fp-guests')) checkCapacity(); });

    function showView(view) {
      form.hidden = view !== 'form';
      doneEl.hidden = view !== 'done';
      fallbackEl.hidden = view !== 'fallback';
      page.scrollTop = 0;
    }
    function selectEvent(ev) {
      if (!ev) return;
      var parts = ev.split(':');
      ev = parts[0];
      if (!Array.prototype.some.call(eventSel.options, function (o) { return o.value === ev; })) {
        var opt = document.createElement('option');
        opt.textContent = ev;
        eventSel.insertBefore(opt, eventSel.lastElementChild);
      }
      eventSel.value = ev;
      if (parts[1]) {
        var want = parts[1] === 'offsite' ? /^Off/ : /^On/;
        form.querySelectorAll('input[name="Catering location"]').forEach(function (r) { r.checked = want.test(r.value); });
      }
    }
    function open(ev, notes) {
      returnFocus = document.activeElement;
      if (openPage && openPage !== api) openPage.close(true);
      closeModal();
      setMenu(false);
      selectEvent(ev);
      if (notes) {
        var box = form.querySelector('textarea[name="Special requests"], textarea[name="Additional details"]');
        if (box && box.value.indexOf(notes) === -1) box.value = box.value ? box.value + '\n' + notes : notes;
      }
      refresh();
      showView('form');
      page.hidden = false;
      requestAnimationFrame(function () { page.classList.add('is-open'); });
      document.body.style.overflow = 'hidden';
      page.querySelector('.fp-close').focus();
      openPage = api;
    }
    function close(silent) {
      if (page.hidden) return;
      page.classList.remove('is-open');
      document.body.style.overflow = '';
      if (silent) page.hidden = true;
      else setTimeout(function () { page.hidden = true; }, reduceMotion ? 0 : 300);
      if (openPage === api) openPage = null;
      if (!silent && returnFocus) returnFocus.focus();
    }

    function validate() {
      var missing = [];
      form.querySelectorAll('[data-req]').forEach(function (wrap) {
        if (wrap.closest('[hidden]')) return;
        var radios = wrap.querySelectorAll('input[type="radio"]');
        var bad;
        if (radios.length) {
          bad = !Array.prototype.some.call(radios, function (r) { return r.checked; });
        } else {
          var c = wrap.querySelector('input, select, textarea');
          bad = !c || !c.value.trim() || (c.type === 'email' && !c.checkValidity());
          if (c) c.classList.toggle('is-invalid', bad);
        }
        wrap.classList.toggle('has-error', bad);
        if (bad) missing.push(wrap.getAttribute('data-req'));
      });
      return missing;
    }
    function collect() {
      var data = {};
      new FormData(form).forEach(function (value, key) {
        value = String(value).trim();
        if (!value) return;
        data[key] = data[key] ? data[key] + ', ' + value : value;
      });
      return data;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errorEl.hidden = true;
      var missing = validate();
      if (missing.length) {
        errorEl.textContent = 'Please fill in: ' + missing.join(', ') + '.';
        errorEl.hidden = false;
        var first = form.querySelector('.has-error');
        if (first) first.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
        return;
      }
      var data = collect();
      data._subject = kind === 'Review'
        ? 'New FiWi Experience review: ' + data['Rating'] + ' from ' + data['Name'] + ' (' + data['Event type'] + ')' +
          (data['OK to post'] ? ' - OK to post' : ' - private, do not post')
        : kind + ' request: ' + data['Event type'] + ' (' + data['Name'] + ')';
      data._template = 'table';
      data._replyto = data.email;
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';
      fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(data)
      }).then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok || String(body.success) !== 'true') throw new Error(body.message || 'Send failed');
        });
      }).then(function () {
        form.reset();
        refresh();
        showView('done');
      }).catch(function () {
        summaryEl.textContent = Object.keys(data).filter(function (k) { return k.charAt(0) !== '_'; })
          .map(function (k) { return k + ': ' + data[k]; }).join('\n');
        showView('fallback');
      }).then(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = submitLabel;
      });
    });

    page.querySelectorAll('.fp-close').forEach(function (b) { b.addEventListener('click', function () { close(); }); });
    page.querySelector('.fp-back').addEventListener('click', function () { showView('form'); });
    page.querySelector('.fp-copy').addEventListener('click', function () {
      var btn = this;
      function show(label) { btn.textContent = label; setTimeout(function () { btn.textContent = 'Copy Request'; }, 1600); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(summaryEl.textContent).then(function () { show('Copied'); }, function () {
          var r = document.createRange(); r.selectNodeContents(summaryEl);
          var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r); show('Text selected');
        });
      } else { show('Select the text above'); }
    });

    var api = { open: open, close: close, element: page, currentEvent: function () { return eventSel.value; } };
    refresh();
    return api;
  }

  // ---- FiWi Experience wall: approved reviews from js/reviews.js ----
  (function renderReviews() {
    var wall = document.getElementById('reviewWall');
    var summary = document.getElementById('reviewSummary');
    var list = (window.FIWI_REVIEWS || []).filter(function (r) { return r && r.name && r.text; });
    if (!wall || !list.length) return;
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    function stars(n) {
      n = Math.max(1, Math.min(5, Math.round(Number(n) || 5)));
      return new Array(n + 1).join('★') + new Array(6 - n).join('☆');
    }
    function el(tag, cls, text) {
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text) e.textContent = text;
      return e;
    }
    list.forEach(function (r) {
      var card = el('figure', 'review-card');
      var s = el('p', 'review-stars', stars(r.rating));
      s.setAttribute('aria-label', (Math.round(Number(r.rating) || 5)) + ' out of 5 stars');
      card.appendChild(s);
      if (r.title) card.appendChild(el('h3', 'review-title', r.title));
      card.appendChild(el('blockquote', 'review-text', r.text));
      var by = el('figcaption', 'review-by');
      by.appendChild(el('strong', '', r.name));
      var meta = [r.event];
      var m = /^(\d{4})-(\d{2})/.exec(r.date || '');
      if (m) meta.push(months[parseInt(m[2], 10) - 1] + ' ' + m[1]);
      meta = meta.filter(Boolean).join(' · ');
      if (meta) by.appendChild(el('span', '', meta));
      card.appendChild(by);
      wall.appendChild(card);
    });
    var avg = list.reduce(function (t, r) { return t + (Number(r.rating) || 5); }, 0) / list.length;
    summary.textContent = avg.toFixed(1) + ' out of 5 from ' + list.length + ' guest review' + (list.length === 1 ? '' : 's');
    summary.hidden = false;
    wall.hidden = false;
  })();

  pages.booking = setupPage(document.getElementById('bookingPage'));
  pages.quote = setupPage(document.getElementById('quotePage'));
  pages.review = setupPage(document.getElementById('reviewPage'));

  document.querySelectorAll('[data-book]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var ev = btn.getAttribute('data-book');
      pages.booking.open(ev === 'General Inquiry' ? '' : ev);
    });
  });
  document.querySelectorAll('[data-review]').forEach(function (btn) {
    btn.addEventListener('click', function (e) { e.preventDefault(); pages.review.open(btn.getAttribute('data-review')); });
  });
  document.querySelectorAll('[data-quote]').forEach(function (btn) {
    btn.addEventListener('click', function (e) { e.preventDefault(); pages.quote.open(btn.getAttribute('data-quote')); });
  });
  document.querySelector('#bookingPage .fp-to-quote').addEventListener('click', function () {
    pages.quote.open(pages.booking.currentEvent());
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeModal(); if (openPage) openPage.close(); setMenu(false); }
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

  // Booking card: open the booking page with what the visitor picked
  function widgetNotes() {
    var menu = document.getElementById('menuOption').value;
    var shuttle = document.getElementById('shuttleOption').checked;
    var parts = [];
    if (menu) parts.push('Private dinner setting: ' + menu.replace(/^setting:/, ''));
    if (shuttle) parts.push('Shuttle / transportation requested');
    return parts.join('\n');
  }
  function openFromWidget(page) {
    var ev = document.getElementById('eventType').value;
    var menu = document.getElementById('menuOption').value;
    var setting = menu.indexOf('setting:') === 0 ? menu.slice(8) : '';
    if (setting && !ev) ev = 'Private Dinner';
    page.open(ev, widgetNotes());
    if (setting) {
      var radio = page.element.querySelector('input[name="Private dinner setting"][value="' + setting + '"]');
      if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change', { bubbles: true })); }
    }
  }
  document.getElementById('bookingWidget').addEventListener('submit', function (e) {
    e.preventDefault();
    openFromWidget(pages.booking);
  });
  document.getElementById('widgetQuote').addEventListener('click', function () {
    openFromWidget(pages.quote);
  });
});
