/* Candid Expressions — shared site behaviour.
   Content lives in js/content.js; you shouldn't need to edit this file. */
(function () {
  "use strict";

  document.documentElement.classList.remove("no-js");

  var SITE = window.SITE || {};
  /* When the site is shown inside another page (e.g. a private preview link),
     embedded maps are blocked, so show a directions card instead. */
  var FRAMED = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();
  /* Hide the header before anything is drawn so it doesn't flicker during the intro. */
  if (document.querySelector(".hero") && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.body.classList.add("intro-playing");
  }
  var enc = encodeURIComponent;

  /* ---------- Icons ---------- */
  var P = 'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
  var ICONS = {
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    wa: '<path d="M3.6 20.4l1.2-4.2A8.6 8.6 0 1 1 8 19.3z"/><path d="M9.2 8.6c.2-.5.6-.5.9-.5h.4c.2 0 .4.1.5.4l.6 1.5c.1.2 0 .5-.1.6l-.5.6c-.1.1-.1.3 0 .5.6 1 1.4 1.8 2.4 2.3.2.1.4.1.5 0l.6-.7c.2-.2.4-.2.6-.1l1.5.7c.2.1.3.3.3.5v.4c0 .4-.3 1-.9 1.2-.6.2-1.5.3-3.2-.5-2-1-3.3-2.9-3.7-3.6-.4-.7-.7-1.6-.2-2.4z" fill="currentColor" stroke="none"/>',
    phone: '<path d="M21 16.4v2.7a1.8 1.8 0 0 1-2 1.8 17.8 17.8 0 0 1-7.8-2.8 17.5 17.5 0 0 1-5.4-5.4A17.8 17.8 0 0 1 3 4.9 1.8 1.8 0 0 1 4.8 3h2.7a1.8 1.8 0 0 1 1.8 1.5c.1.9.3 1.7.6 2.5a1.8 1.8 0 0 1-.4 1.9L8.3 10a14.4 14.4 0 0 0 5.4 5.4l1.1-1.1a1.8 1.8 0 0 1 1.9-.4c.8.3 1.6.5 2.5.6a1.8 1.8 0 0 1 1.5 1.9z"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
    pin: '<path d="M19.5 10c0 5.6-7.5 11.5-7.5 11.5S4.5 15.6 4.5 10a7.5 7.5 0 0 1 15 0z"/><circle cx="12" cy="10" r="2.8"/>',
    directions: '<path d="M3 11 21 3l-8 18-2-8z"/>',
    cap: '<path d="M22 9.5 12 4.5 2 9.5l10 5 10-5z"/><path d="M6 11.6v4.9c3.4 2.6 8.6 2.6 12 0v-4.9"/><path d="M22 9.5v5"/>',
    camera: '<path d="M14.5 4.5h-5L7.6 7H4.5A1.5 1.5 0 0 0 3 8.5v10A1.5 1.5 0 0 0 4.5 20h15a1.5 1.5 0 0 0 1.5-1.5v-10A1.5 1.5 0 0 0 19.5 7h-3.1z"/><circle cx="12" cy="13.2" r="3.6"/>',
    balloon: '<path d="M12 2.8a6 6 0 0 1 6 6c0 4.2-3.4 7.4-6 7.4s-6-3.2-6-7.4a6 6 0 0 1 6-6z"/><path d="m11 18 1-1.8 1 1.8z"/><path d="M12 18c-.8 1.4 1.2 2 .2 3.4"/>',
    rings: '<circle cx="9" cy="14.5" r="5"/><circle cx="15" cy="14.5" r="5"/><path d="m10.6 5.5 1.4-2 1.4 2-1.4 1.6z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 20.5c1.4-3.7 4.4-5.6 8-5.6s6.6 1.9 8 5.6"/>',
    id: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="8.5" cy="11" r="2.2"/><path d="M5.5 16c.5-1.4 1.6-2.2 3-2.2s2.5.8 3 2.2M14.5 10h4M14.5 13h3"/>',
    print: '<path d="M6.5 9V3.5h11V9"/><rect x="6.5" y="14" width="11" height="6.5" rx="1"/><path d="M6.5 17.5h-2A1.5 1.5 0 0 1 3 16v-5.5A1.5 1.5 0 0 1 4.5 9h15a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 1-1.5 1.5h-2"/>',
    download: '<path d="M12 3.5v12M7 10.5l5 5 5-5M4.5 20.5h15"/>',
    check: '<path d="M20 6.5 9.5 17 4 11.5"/>',
    star: '<path d="m12 2.8 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.3l-5.7 3 1.1-6.3-4.6-4.5 6.4-.9z" fill="currentColor" stroke="none"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    left: '<path d="m15 5-7 7 7 7"/>',
    right: '<path d="m9 5 7 7-7 7"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z"/>',
    sparkle: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM18.5 16l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
    venue: '<path d="M3 20.5h18M5 20.5V9l7-5 7 5v11.5M10 20.5v-5h4v5"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9.5" r="1.8"/><path d="m21 16-5-5-9 9"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.3 3.4-5 6.5-5s5.5 1.7 6.5 5"/><path d="M15.5 4.8a3.5 3.5 0 0 1 0 6.4M18 15.4c1.6.7 2.8 2.2 3.5 4.6"/>',
    box: '<path d="m12 3 8.5 4.5v9L12 21l-8.5-4.5v-9z"/><path d="m3.5 7.5 8.5 4.5 8.5-4.5M12 12v9"/>',
    drone: '<rect x="9.5" y="10" width="5" height="4" rx="1.2"/><path d="M9.5 11 6.5 8M14.5 11l3-3M9.5 13l-3 3M14.5 13l3 3"/><ellipse cx="5.5" cy="7" rx="3" ry="1.2"/><ellipse cx="18.5" cy="7" rx="3" ry="1.2"/><ellipse cx="5.5" cy="17" rx="3" ry="1.2"/><ellipse cx="18.5" cy="17" rx="3" ry="1.2"/>',
    brief: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8.5 7V5a1.5 1.5 0 0 1 1.5-1.5h4A1.5 1.5 0 0 1 15.5 5v2M3 12.5h18"/>'
  };
  function icon(name) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" ' + P + ">" + (ICONS[name] || "") + "</svg>";
  }
  function paintIcons(root) {
    (root || document).querySelectorAll("[data-icon]").forEach(function (el) {
      if (!el.firstElementChild) el.innerHTML = icon(el.getAttribute("data-icon"));
    });
  }

  /* ---------- Link helpers ---------- */
  function waLink(text) {
    return "https://wa.me/" + SITE.whatsapp + (text ? "?text=" + enc(text) : "");
  }
  var LINKS = {
    wa: waLink("Hi Candid Expressions! I'd like to ask about booking a photo session."),
    tel: "tel:" + SITE.phoneLink,
    mail: "mailto:" + SITE.email,
    directions: "https://www.google.com/maps/dir/?api=1&destination=" + enc(SITE.mapsQuery),
    map: "https://www.google.com/maps/search/?api=1&query=" + enc(SITE.mapsQuery)
  };
  var MAP_EMBED = "https://maps.google.com/maps?q=" + enc(SITE.mapsQuery) + "&z=16&output=embed";
  function mapCard(extraClass) {
    return '<a class="map-card ' + (extraClass || "") + '" href="' + LINKS.directions + '" target="_blank" rel="noopener" aria-label="Get directions to Hendon Mall, Savanna-la-Mar">' +
      '<span class="map-card__grid" aria-hidden="true"></span>' +
      '<span class="map-card__road map-card__road--a" aria-hidden="true"></span><span class="map-card__road map-card__road--b" aria-hidden="true"></span>' +
      '<span class="map-card__pin" aria-hidden="true">' + icon("pin") + "</span>" +
      '<span class="map-card__label"><strong>Hendon Mall, Shop #15</strong>Beckford Street, Savanna-la-Mar<span class="map-card__go">' + icon("directions") + "Get directions</span></span></a>";
  }
  function mapEmbed(title) {
    if (FRAMED) return mapCard();
    return '<iframe title="' + title + '" src="' + MAP_EMBED + '" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>';
  }

  /* ---------- Navigation ---------- */
  var NAV = [
    { href: "index.html", label: "Home", key: "home" },
    { href: "about.html", label: "About", key: "about" },
    { href: "galleries.html", label: "Galleries", key: "galleries" },
    { href: "services.html", label: "Services & Pricing", key: "services", short: "Pricing" },
    { href: "testimonials.html", label: "Reviews", key: "testimonials" },
    { href: "proofing.html", label: "Client Proofing", key: "proofing", short: "Proofing" },
    { href: "booking.html", label: "Book & Contact", key: "booking" }
  ];
  var page = document.body.getAttribute("data-page") || "";

  /* The logo comes in two versions: full colour for light backgrounds and a
     light version (cream lettering) for dark ones. The header shows whichever
     suits its current background (CSS decides); the footer is always dark. */
  var LOGO_ALT = "Candid Expressions Photography Jamaica Ltd.";
  function brand(where) {
    var imgs = where === "footer"
      ? '<img class="brand__logo" src="images/logo-light.png" alt="' + LOGO_ALT + '" width="900" height="318" loading="lazy" decoding="async">'
      : '<img class="brand__logo brand__logo--on-light" src="images/logo.png" alt="' + LOGO_ALT + '" width="900" height="318" decoding="async">' +
        '<img class="brand__logo brand__logo--on-dark" src="images/logo-light.png" alt="" aria-hidden="true" width="900" height="318" decoding="async">';
    return '<a class="brand brand--' + (where || "header") + '" href="index.html" aria-label="' + LOGO_ALT + ' \u2014 home">' + imgs + "</a>";
  }
  function cur(key) {
    return key === page ? ' aria-current="page"' : "";
  }

  function buildHeader() {
    var slot = document.getElementById("site-header");
    if (!slot) return;
    var desk = NAV.filter(function (n) { return n.key !== "booking"; })
      .map(function (n) { return '<li><a href="' + n.href + '"' + cur(n.key) + ">" + (n.short || n.label) + "</a></li>"; })
      .join("");
    var mob = NAV.map(function (n) { return '<li><a href="' + n.href + '"' + cur(n.key) + ">" + n.label + "</a></li>"; }).join("");
    slot.outerHTML =
      '<header class="site-header" id="top-header"><div class="container">' + brand() +
      '<nav class="nav" aria-label="Main"><ul>' + desk + "</ul></nav>" +
      '<a class="btn btn--primary btn--sm header-cta" href="booking.html">Book a session</a>' +
      '<button class="menu-toggle" type="button" aria-expanded="false" aria-controls="mobile-menu" aria-label="Open menu"><span></span></button>' +
      "</div></header>" +
      '<div class="mobile-menu" id="mobile-menu" aria-hidden="true"><nav aria-label="Mobile"><ol>' + mob + "</ol></nav>" +
      '<div class="mobile-menu__foot">' +
      '<a class="btn btn--wa btn--block" href="' + LINKS.wa + '" target="_blank" rel="noopener">' + icon("wa") + "Chat on WhatsApp</a>" +
      '<a href="' + LINKS.tel + '">' + SITE.phoneDisplay + "</a>" +
      '<a href="' + LINKS.mail + '">' + SITE.email + "</a>" +
      "<span>Hendon Mall, Savanna-la-Mar</span></div></div>";

    var header = document.getElementById("top-header");
    var toggle = header.querySelector(".menu-toggle");
    var menu = document.getElementById("mobile-menu");
    function setMenu(open) {
      document.body.classList.toggle("menu-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      menu.setAttribute("aria-hidden", String(!open));
    }
    toggle.addEventListener("click", function () { setMenu(!document.body.classList.contains("menu-open")); });
    menu.addEventListener("click", function (e) { if (e.target.closest("a")) setMenu(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });

    var hasHero = !!document.querySelector(".hero");
    function onScroll() {
      header.classList.toggle("is-scrolled", window.scrollY > 40);
      if (hasHero) document.body.classList.toggle("hero-top", window.scrollY < window.innerHeight * 0.5);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  function buildFooter() {
    var slot = document.getElementById("site-footer");
    if (!slot) return;
    var links = NAV.map(function (n) { return '<li><a href="' + n.href + '">' + n.label + "</a></li>"; }).join("");
    slot.outerHTML =
      '<footer class="site-footer"><div class="container">' +
      '<div class="footer-big" aria-hidden="true">Let’s make <em>memories.</em></div>' +
      '<div class="footer-grid">' +
      '<div class="footer-col">' + brand("footer") +
      '<p class="mt-s">Wedding, event &amp; school photography — plus portraits, prints and ID cards — from our studio at Hendon Mall in Savanna-la-Mar.</p>' +
      '<a class="btn btn--wa btn--sm" href="' + LINKS.wa + '" target="_blank" rel="noopener">' + icon("wa") + "WhatsApp us</a></div>" +
      '<div class="footer-col"><h3>Explore</h3><ul>' + links + "</ul></div>" +
      '<div class="footer-col"><h3>Visit &amp; contact</h3><ul class="footer-contact">' +
      "<li>" + icon("pin") + '<address><a href="' + LINKS.directions + '" target="_blank" rel="noopener" aria-label="Get directions to ' + SITE.address + '">' +
      "Shop #15 Hendon Mall,<br>Beckford Street, Savanna-la-Mar,<br>Westmoreland, Jamaica</a></address></li>" +
      "<li>" + icon("phone") + '<a href="' + LINKS.tel + '">' + SITE.phoneDisplay + "</a></li>" +
      "<li>" + icon("mail") + '<a href="' + LINKS.mail + '">' + SITE.email + "</a></li>" +
      "<li>" + icon("wa") + '<a href="' + LINKS.wa + '" target="_blank" rel="noopener">WhatsApp ' + SITE.phoneDisplay + "</a></li>" +
      "</ul></div>" +
      '<div class="footer-col"><h3>Find the studio</h3>' +
      '<div class="footer-map">' + mapEmbed("Map to Candid Expressions Photography, Hendon Mall, Savanna-la-Mar") + "</div>" +
      '<a class="btn btn--light btn--sm" href="' + LINKS.directions + '" target="_blank" rel="noopener">' + icon("directions") + "Get directions</a></div>" +
      "</div>" +
      '<div class="footer-bottom"><span>© ' + new Date().getFullYear() + " Candid Expressions Photography Jamaica Ltd. All rights reserved.</span>" +
      "<span>Savanna-la-Mar · Westmoreland · Jamaica</span>" +
      '<button class="theme-toggle" type="button" data-theme-toggle>Theme: Auto</button></div>' +
      "</div></footer>" +
      '<a class="wa-float" href="' + LINKS.wa + '" target="_blank" rel="noopener" aria-label="Chat with us on WhatsApp">' + icon("wa") + "</a>";
  }

  /* ---------- Theme toggle (auto / light / dark) ---------- */
  function initTheme() {
    var btn = document.querySelector("[data-theme-toggle]");
    var modes = ["auto", "light", "dark"];
    var mode = "auto";
    try { mode = localStorage.getItem("ce-theme") || "auto"; } catch (e) {}
    function apply() {
      if (mode === "auto") document.documentElement.removeAttribute("data-theme");
      else document.documentElement.setAttribute("data-theme", mode);
      if (btn) btn.textContent = "Theme: " + mode.charAt(0).toUpperCase() + mode.slice(1);
    }
    apply();
    if (btn) btn.addEventListener("click", function () {
      mode = modes[(modes.indexOf(mode) + 1) % modes.length];
      try { localStorage.setItem("ce-theme", mode); } catch (e) {}
      apply();
    });
  }

  /* ---------- Fill contact links/text placed in page HTML ---------- */
  function fillLinks() {
    document.querySelectorAll("[data-link]").forEach(function (a) {
      var k = a.getAttribute("data-link");
      if (LINKS[k]) a.setAttribute("href", LINKS[k]);
      if (k === "wa" || k === "directions" || k === "map") { a.target = "_blank"; a.rel = "noopener"; }
    });
    document.querySelectorAll("[data-map-embed]").forEach(function (f) {
      if (FRAMED) f.outerHTML = mapCard();
      else f.src = MAP_EMBED;
    });
    if (FRAMED) {
      /* Inside a preview frame "index.html" may not resolve; "./" always reaches the home page. */
      document.querySelectorAll('a[href="index.html"]').forEach(function (a) { a.setAttribute("href", "./"); });
      document.querySelectorAll('a[href^="index.html#"]').forEach(function (a) { a.setAttribute("href", "./" + a.getAttribute("href").slice(10)); });
    }
    if (SITE.fiwiPlaceUrl) {
      document.querySelectorAll(".partner").forEach(function (box) {
        var a = document.createElement("a");
        a.className = "link-arrow";
        a.href = SITE.fiwiPlaceUrl;
        a.target = "_blank";
        a.rel = "noopener";
        a.innerHTML = "Visit Fiwi Place " + icon("arrow");
        (box.classList.contains("partner--wide") ? box.firstElementChild : box).appendChild(a);
      });
    }
  }

  /* ---------- Reveal on scroll ---------- */
  function initReveal() {
    var els = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-visible"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });
    els.forEach(function (el) {
      /* Content is always visible; items below the first screen just lift gently into place. */
      if (el.getBoundingClientRect().top > window.innerHeight) el.classList.add("is-armed");
      io.observe(el);
    });
  }

  /* ---------- Home intro ---------- */
  function initHero() {
    var hero = document.querySelector(".hero");
    if (!hero) return;
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var seen = false;
    try { seen = sessionStorage.getItem("ce-intro") === "1"; sessionStorage.setItem("ce-intro", "1"); } catch (e) {}

    if (reduce) { hero.classList.add("is-ready", "is-settled"); return; }
    if (seen) { hero.style.setProperty("--stagger", "45ms"); hero.style.setProperty("--lead-in", "100ms"); }

    document.body.classList.add("intro-playing");
    /* Start the name centred on screen; CSS glides it to the side on settle. */
    var name = hero.querySelector(".hero__name");
    function centreName() {
      if (!name || hero.classList.contains("is-settled")) return;
      name.style.transition = "none";
      hero.style.setProperty("--name-dx", "0px");
      var h = hero.getBoundingClientRect(), r = name.getBoundingClientRect();
      hero.style.setProperty("--name-dx", Math.round(h.left + h.width / 2 - (r.left + r.width / 2)) + "px");
      void name.offsetWidth; /* apply the centred position instantly */
      name.style.transition = "";
    }
    centreName();
    window.addEventListener("resize", centreName);

    var settle = function () {
      hero.classList.add("is-settled");
      document.body.classList.remove("intro-playing");
    };
    var img = hero.querySelector(".hero__photo img");
    var start = function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { hero.classList.add("is-ready"); });
      });
      setTimeout(settle, seen ? 3000 : 6200);
    };
    if (img && !img.complete) {
      var started = false;
      var go = function () { if (!started) { started = true; start(); } };
      img.addEventListener("load", go);
      img.addEventListener("error", go);
      setTimeout(go, 1500);
    } else start();
    hero.addEventListener("click", function () { if (!hero.classList.contains("is-settled")) { hero.classList.add("is-ready"); settle(); } });
  }

  /* ---------- Home photo stream ---------- */
  /* Six lanes; CSS decides how many show (3 on phones, 5 on tablets, 6 on desktop).
     Each lane loops its tiles upward at its own speed; lower opacity reads as farther away. */
  var LANES = [
    { s: 46, d: -6,  o: 0.62, r: ["2 / 3", "4 / 5", "3 / 2"] },
    { s: 64, d: -31, o: 0.3,  r: ["4 / 5", "3 / 2", "2 / 3"] },
    { s: 52, d: -18, o: 0.55, r: ["3 / 2", "2 / 3", "4 / 5"] },
    { s: 70, d: -44, o: 0.32, r: ["2 / 3", "3 / 2", "4 / 5"] },
    { s: 50, d: -12, o: 0.58, r: ["4 / 5", "2 / 3", "3 / 2"] },
    { s: 66, d: -27, o: 0.34, r: ["3 / 2", "4 / 5", "2 / 3"] }
  ];
  function renderStream() {
    var box = document.querySelector(".hero__stream");
    if (!box) return;
    var photos = (window.HERO_STREAM && window.HERO_STREAM.length) ? window.HERO_STREAM : ["images/hero.jpg"];
    var N = photos.length;
    /* With 1-3 photos every lane cycles through all of them (a multiple of N tiles).
       With more, each lane takes every third photo from its own starting point, so
       the first three lanes (all that phones show) cover every photo between them
       and no lane repeats a photo within its loop. */
    var few = N <= 3;
    var L = few ? N * Math.ceil(3 / N) : Math.max(3, Math.ceil(N / 3));
    box.innerHTML = LANES.map(function (lane, li) {
      var cycle = "";
      for (var k = 0; k < L; k++) {
        var src = String(photos[few ? (k + li * 3) % N : (li + 3 * k) % N]).replace(/"/g, "&quot;");
        cycle += '<div class="hero__tile" style="--r:' + lane.r[k % 3] + '"><img src="' + src + '" alt="" decoding="async"></div>';
      }
      /* The track holds the cycle three times and moves up by one cycle per loop,
         so the loop is seamless even on short, wide screens. */
      return '<div class="hero__lane" style="--o:' + lane.o + '"><div class="hero__track" style="--s:' + Math.round(lane.s * L / 3) + "s;--d:" + lane.d + 's">' + cycle + cycle + cycle + "</div></div>";
    }).join("");

    /* Pause the motion once most of the hero is scrolled away. */
    var hero = box.closest(".hero");
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) {
        hero.classList.toggle("is-offscreen", en[0].intersectionRatio < 0.2);
      }, { threshold: [0, 0.2] }).observe(hero);
    }
  }

  /* ---------- Services ribbon (home) ---------- */
  function initRibbon() {
    var ribbon = document.querySelector(".marquee");
    if (!ribbon) return;
    var fontsReady = false, inView = !("IntersectionObserver" in window);
    function update() { ribbon.classList.toggle("is-running", fontsReady && inView); }
    function ready() { if (!fontsReady) { fontsReady = true; update(); } }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(ready, ready);
    setTimeout(ready, 3000); /* don't wait forever on a slow connection */
    if (!inView) {
      new IntersectionObserver(function (en) { inView = en[0].isIntersecting; update(); }).observe(ribbon);
    }
    update();
  }

  /* ---------- Featured grid (home) ---------- */
  var CATEGORIES = [
    { key: "weddings", title: "Weddings", blurb: "Your day, start to finish", icon: "rings" },
    { key: "events", title: "Birthdays & Events", blurb: "Parties, celebrations & functions", icon: "balloon" },
    { key: "schools", title: "Schools", blurb: "Portraits, class photos & school events", icon: "cap" },
    { key: "sessions", title: "Photo Sessions", blurb: "Maternity, newborn, engagement & more", icon: "camera" },
    { key: "portraits", title: "Portraits", blurb: "School, business & product", icon: "user" },
    { key: "aerial", title: "Aerial & Real Estate", blurb: "Properties, resorts & developments from above", icon: "drone" },
    { key: "id", title: "ID Printing", blurb: "Design, photos, printing & programming", icon: "id" }
  ];
  window.CE_CATEGORIES = CATEGORIES;

  function photoTile(p, group, extraClass) {
    return (
      '<button type="button" class="photo-tile ' + (extraClass || "") + '" data-full="' + p.src + '" data-group="' + group + '" data-alt="' + (p.alt || "").replace(/"/g, "&quot;") + '">' +
      '<img src="' + p.src + '" alt="' + (p.alt || "").replace(/"/g, "&quot;") + '"' +
      (p.pos ? ' style="object-position:' + String(p.pos).replace(/[^0-9a-z% .-]/gi, "") + '"' : "") + ' loading="lazy" decoding="async">' +
      (p.category ? '<span class="photo-tile__cap">' + p.category + "</span>" : "") +
      "</button>"
    );
  }

  function renderFeatured() {
    var grid = document.getElementById("featured-grid");
    if (!grid) return;
    var photos = (window.FEATURED || []).slice(0, 10);
    var html = "", cells = 0;
    /* First photo is large (2x2); portrait photos are tall (1x2), others 1x1. */
    var cls = photos.map(function (p, i) { return i === 0 ? "is-tall is-wide" : (p.tall ? "is-tall" : ""); });
    var size = function (c) { return (c.indexOf("is-tall") > -1 ? 2 : 1) * (c.indexOf("is-wide") > -1 ? 2 : 1); };
    cls.forEach(function (c) { cells += size(c); });
    if (photos.length >= 6) {
      /* No category tiles: lay photos out in 4x2 bands that always fill —
         one large + two tall (the large photo alternating sides), and the
         last band as four talls or two larges, depending on what's left. */
      cls = [];
      var band = 0;
      while (cls.length < photos.length) {
        var left = photos.length - cls.length;
        if (left === 4) cls.push("is-tall", "is-tall", "is-tall", "is-tall");
        else if (left === 2) cls.push("is-tall is-wide", "is-tall is-wide");
        else if (band % 2) cls.push("is-tall", "is-tall", "is-tall is-wide");
        else cls.push("is-tall is-wide", "is-tall", "is-tall");
        band++;
      }
    }
    if (photos.length >= 6) {
      /* Landscape photos (wide: true) suit the large square-ish slots better than the
         tall ones: the first photo keeps the first slot, landscape photos take the
         other large slots, and everything else fills the tall slots in order. */
      var big = [], rest = [];
      photos.slice(1).forEach(function (p) { (p.wide ? big : rest).push(p); });
      var ordered = [photos[0]];
      cls.slice(1).forEach(function (c) {
        var want = c.indexOf("is-wide") > -1 ? big : rest;
        ordered.push(want.length ? want.shift() : (big.length ? big.shift() : rest.shift()));
      });
      photos = ordered;
    }
    photos.forEach(function (p, i) { html += photoTile(p, "featured", cls[i]); });
    if (photos.length < 6) {
      /* Widen just enough category tiles (from the end) to fill the 4-column grid evenly. */
      var widen = (4 - (cells + CATEGORIES.length) % 4) % 4;
      CATEGORIES.forEach(function (c, i) {
        var cls = i >= CATEGORIES.length - widen ? "is-wide" : "";
        html +=
          '<a class="cat-tile ' + cls + '" href="galleries.html#' + c.key + '">' +
          '<span class="cat-tile__num">0' + (i + 1) + "</span>" +
          '<span><span class="cat-tile__title">' + c.title + '</span><br><span class="cat-tile__go"><span class="cat-tile__blurb">' + c.blurb + "</span>" + icon("arrow") + "</span></span></a>";
      });
    }
    grid.innerHTML = html;
  }

  /* ---------- Gallery sections ---------- */
  function renderGalleries() {
    var data = window.GALLERIES || {};
    document.querySelectorAll("[data-gallery]").forEach(function (box) {
      var key = box.getAttribute("data-gallery");
      var list = data[key] || [];
      var cat = CATEGORIES.filter(function (c) { return c.key === key; })[0] || { title: "" };
      if (!list.length) {
        box.innerHTML =
          '<div class="gal-empty"><span class="gal-empty__word" aria-hidden="true">' + cat.title + "</span>" +
          "<h3>New work coming soon</h3><p>We’re curating this gallery. Message us on WhatsApp and we’ll send recent " + cat.title.toLowerCase() + " photos straight to your phone.</p>" +
          '<div class="btn-row"><a class="btn btn--light btn--sm" href="' + waLink("Hi! Could you send me some samples of your " + cat.title.toLowerCase() + " photography?") + '" target="_blank" rel="noopener">' + icon("wa") + "Ask for samples</a></div></div>";
        return;
      }
      /* Mostly-landscape galleries get a lead photo across the top with pairs below;
         others use the masonry columns. */
      var wide = list.filter(function (p) { return p.wide; }).length;
      var mod = wide * 2 > list.length ? " masonry--landscape" : list.length === 1 ? " masonry--single" : list.length === 2 ? " masonry--pair" : "";
      box.innerHTML = '<div class="masonry' + mod + '">' + list.map(function (p) { return photoTile(p, key); }).join("") + "</div>";
      if (mod === " masonry--pair") {
        /* Two photos side by side at the same height: each takes width in
           proportion to its shape (a guess from `wide` until the image loads). */
        box.querySelectorAll(".photo-tile").forEach(function (tile, i) {
          var img = tile.querySelector("img");
          tile.style.setProperty("--ar", list[i].wide ? 1.5 : 0.67);
          var set = function () { if (img.naturalWidth) tile.style.setProperty("--ar", (img.naturalWidth / img.naturalHeight).toFixed(3)); };
          if (img.complete) set(); else img.addEventListener("load", set);
        });
      }
    });
  }

  /* ---------- Lightbox ---------- */
  function initLightbox() {
    var dlg = document.createElement("dialog");
    dlg.className = "lightbox";
    dlg.setAttribute("aria-label", "Photo viewer");
    dlg.innerHTML =
      '<div class="lightbox__bar"><span data-lb-count></span><button class="icon-btn" type="button" data-lb-close aria-label="Close">' + icon("close") + "</button></div>" +
      '<div class="lightbox__stage"><img alt=""></div>' +
      '<div class="lightbox__nav"><button class="icon-btn" type="button" data-lb-prev aria-label="Previous photo">' + icon("left") + "</button>" +
      '<button class="icon-btn" type="button" data-lb-next aria-label="Next photo">' + icon("right") + "</button></div>";
    document.body.appendChild(dlg);
    var img = dlg.querySelector("img");
    var count = dlg.querySelector("[data-lb-count]");
    var items = [], idx = 0;
    function show() {
      var t = items[idx];
      img.src = t.getAttribute("data-full");
      img.alt = t.getAttribute("data-alt") || "";
      count.textContent = idx + 1 + " / " + items.length;
      dlg.querySelector("[data-lb-prev]").hidden = dlg.querySelector("[data-lb-next]").hidden = items.length < 2;
    }
    document.addEventListener("click", function (e) {
      var t = e.target.closest(".photo-tile[data-full]");
      if (!t || typeof dlg.showModal !== "function") return;
      var g = t.getAttribute("data-group");
      items = Array.prototype.slice.call(document.querySelectorAll('.photo-tile[data-group="' + g + '"]'));
      idx = items.indexOf(t);
      show();
      dlg.showModal();
    });
    dlg.querySelector("[data-lb-close]").addEventListener("click", function () { dlg.close(); });
    dlg.querySelector("[data-lb-prev]").addEventListener("click", function () { idx = (idx - 1 + items.length) % items.length; show(); });
    dlg.querySelector("[data-lb-next]").addEventListener("click", function () { idx = (idx + 1) % items.length; show(); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg || e.target.classList.contains("lightbox__stage")) dlg.close(); });
    dlg.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") { idx = (idx - 1 + items.length) % items.length; show(); }
      if (e.key === "ArrowRight") { idx = (idx + 1) % items.length; show(); }
    });
  }

  /* ---------- Gallery tabs scroll-spy ---------- */
  function initTabs() {
    var tabs = document.querySelectorAll(".tabs__list a");
    if (!tabs.length || !("IntersectionObserver" in window)) return;
    var map = {};
    tabs.forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          tabs.forEach(function (a) { a.classList.remove("is-active"); });
          var a = map[en.target.id];
          if (a) {
            a.classList.add("is-active");
            var list = a.parentNode.parentNode;
            list.scrollTo({ left: a.offsetLeft - 16, behavior: "smooth" });
          }
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    Object.keys(map).forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
  }

  /* ---------- Prices & packages ---------- */
  function renderPrices() {
    var prices = window.PRICES || {};
    document.querySelectorAll("[data-price]").forEach(function (el) {
      var v = prices[el.getAttribute("data-price")];
      if (v) { el.textContent = v; el.classList.remove("is-quote"); }
      else { el.textContent = "Ask for a quote"; el.classList.add("is-quote"); }
    });
    document.querySelectorAll("[data-wedding-packages]").forEach(function (box) {
      var list = window.WEDDING_PACKAGES || [];
      if (!list.length) {
        box.innerHTML = '<div class="package"><div class="package__top"><h4>Custom packages</h4><span class="package__price">Ask us</span></div>' +
          '<ul><li>Packages built around your day — ask for our current wedding menu.</li></ul></div>';
        return;
      }
      box.innerHTML = list.map(function (p) {
        return '<div class="package"><div class="package__top"><h4>' + p.name + '</h4><span class="package__price">' + (p.price || "Ask us") + "</span></div>" +
          (p.features && p.features.length ? "<ul>" + p.features.map(function (f) { return "<li>" + f + "</li>"; }).join("") + "</ul>" : "") + "</div>";
      }).join("");
    });
  }

  /* ---------- Testimonials ---------- */
  function stars(n) {
    var s = "";
    for (var i = 0; i < (n || 5); i++) s += icon("star");
    return '<span class="stars" aria-label="' + (n || 5) + ' out of 5 stars">' + s + "</span>";
  }
  function renderTestimonials() {
    var list = window.TESTIMONIALS || [];
    document.querySelectorAll("[data-testimonials]").forEach(function (box) {
      var limit = parseInt(box.getAttribute("data-limit") || "0", 10);
      var items = limit ? list.slice(0, limit) : list;
      var emptyTarget = box.getAttribute("data-empty-target");
      if (!items.length) {
        box.hidden = true;
        if (emptyTarget) document.querySelectorAll(emptyTarget).forEach(function (e) { e.hidden = false; });
        return;
      }
      box.innerHTML = items.map(function (t) {
        return '<figure class="quote reveal">' + stars(t.rating) + "<blockquote>" + t.quote + "</blockquote>" +
          "<figcaption><strong>" + t.name + "</strong>" + (t.role || "") + "</figcaption></figure>";
      }).join("");
    });
  }

  /* ---------- Boot ---------- */
  buildHeader();
  buildFooter();
  initTheme();
  fillLinks();
  renderStream();
  initRibbon();
  renderFeatured();
  renderGalleries();
  renderPrices();
  renderTestimonials();
  paintIcons();
  initReveal();
  initHero();
  initLightbox();
  initTabs();

  window.CE = { icon: icon, waLink: waLink, paintIcons: paintIcons, LINKS: LINKS, SITE: SITE };
})();
