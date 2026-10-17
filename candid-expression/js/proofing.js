/* Candid Expressions — client proofing.
   Galleries and access codes are set in js/content.js (PROOFING_GALLERIES). */
(function () {
  "use strict";

  var SITE = (window.CE && window.CE.SITE) || window.SITE || {};
  var CE = window.CE || {};
  var GALLERIES = window.PROOFING_GALLERIES || [];
  var OPTIONS = window.ORDER_OPTIONS || ["Digital file", "Print"];

  var gate = document.getElementById("proof-gate");
  var unlock = document.getElementById("proof-unlock");
  var app = document.getElementById("proof-app");
  var grid = document.getElementById("proof-grid");
  var q = document.getElementById("proof-q");
  var cartList = document.getElementById("cart-list");
  var cartEmpty = document.getElementById("cart-empty");
  var orderForm = document.getElementById("proof-order");
  var steps = document.querySelector(".proof-steps");
  if (!unlock) return;

  var gallery = null;
  var cart = []; // { img, option, qty }

  function field(form, name) { return form.elements.namedItem(name); }

  function normImg(v) {
    return String(v || "").toUpperCase().replace(/IMG|[#_\-\s]/g, "").replace(/^0+(?=\d)/, "");
  }

  /* Browsers only offer crypto.subtle on secure (https) pages, so if the site is ever
     opened over plain http, or in an older browser, the code is checked with this small
     built-in SHA-256 instead. Both give the same result. */
  function sha256Fallback(text) {
    var K = [], H = [], i, j;
    var isPrime = function (n) { for (var f = 2; f * f <= n; f++) if (n % f === 0) return false; return true; };
    for (var n = 2, c = 0; c < 64; n++) {
      if (!isPrime(n)) continue;
      if (c < 8) H[c] = (Math.pow(n, 1 / 2) * 4294967296) | 0;
      K[c++] = (Math.pow(n, 1 / 3) * 4294967296) | 0;
    }
    var bytes = unescape(encodeURIComponent(text)), len = bytes.length, words = [];
    for (i = 0; i < len; i++) words[i >> 2] |= (bytes.charCodeAt(i) & 255) << (24 - (i % 4) * 8);
    words[len >> 2] |= 0x80 << (24 - (len % 4) * 8);
    var total = (((len + 8) >> 6) + 1) * 16;
    for (i = words.length; i < total; i++) words[i] = words[i] | 0;
    words[total - 1] = len * 8;
    var rotr = function (x, r) { return (x >>> r) | (x << (32 - r)); };
    for (i = 0; i < total; i += 16) {
      var w = words.slice(i, i + 16), a = H[0], b = H[1], c2 = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (j = 0; j < 64; j++) {
        if (j >= 16) {
          var s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
          var s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
          w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
        }
        var t1 = (h + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[j] + w[j]) | 0;
        var t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c2) ^ (b & c2))) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c2; c2 = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c2) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (x) { return ("00000000" + (x >>> 0).toString(16)).slice(-8); }).join("");
  }

  function sha256(text) {
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
      }, function () { return sha256Fallback(text); });
    }
    return Promise.resolve(sha256Fallback(text));
  }

  function status(form, msg, ok) {
    var s = form.querySelector(".form-status");
    s.textContent = msg;
    s.className = "form-status " + (ok ? "is-ok" : "is-err");
  }

  unlock.addEventListener("submit", function (e) {
    e.preventDefault();
    var code = field(unlock, "code").value.trim().toUpperCase();
    if (!code) { field(unlock, "code").focus(); status(unlock, "Please enter your access code.", false); return; }
    sha256(code).then(function (hash) {
      var g = GALLERIES.filter(function (x) { return x.codeHash === hash; })[0];
      if (!g) { status(unlock, "That code didn’t match a gallery. Check your slip, or message us on WhatsApp.", false); return; }
      openGallery(g, field(unlock, "img").value);
    }).catch(function () {
      status(unlock, "Your browser can’t open galleries here. Please try another browser, or message us on WhatsApp.", false);
    });
  });

  function openGallery(g, img) {
    gallery = g;
    gate.hidden = true;
    if (steps) steps.hidden = true;
    app.hidden = false;
    document.getElementById("proof-gallery-name").textContent = g.name;
    q.value = img ? normImg(img) : "";
    render();
    app.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  document.getElementById("proof-lock").addEventListener("click", function () {
    gallery = null; cart = [];
    app.hidden = true; gate.hidden = false;
    if (steps) steps.hidden = false;
    unlock.reset();
    unlock.querySelector(".form-status").className = "form-status";
    renderCart();
    field(unlock, "code").focus();
  });

  q.addEventListener("input", render);

  function render() {
    var needle = normImg(q.value);
    var list = gallery.photos.filter(function (p) { return !needle || normImg(p.img).indexOf(needle) !== -1; });
    if (!list.length) {
      grid.innerHTML = '<p class="no-results">No photo found for IMG #' + needle.replace(/[<>&"]/g, "") +
        '. Double-check the number, or <a href="' + CE.waLink("Hi! I can't find IMG #" + needle + " in the " + gallery.name + " gallery.") + '" target="_blank" rel="noopener">ask us on WhatsApp</a>.</p>';
      return;
    }
    grid.innerHTML = list.map(function (p) {
      var inCart = cart.some(function (c) { return c.img === p.img; });
      return '<article class="proof-card' + (inCart ? " is-selected" : "") + '">' +
        '<div class="proof-card__img" oncontextmenu="return false"><img src="' + p.src + '" alt="Proof IMG #' + p.img + '" loading="lazy" draggable="false"></div>' +
        '<div class="proof-card__meta"><span class="proof-card__id">IMG #' + p.img + "</span>" +
        '<button class="btn btn--sm ' + (inCart ? "btn--ghost" : "btn--primary") + '" type="button" data-add="' + p.img + '">' + (inCart ? "Added" : "Add") + "</button></div></article>";
    }).join("");
  }

  grid.addEventListener("click", function (e) {
    var b = e.target.closest("[data-add]");
    if (!b) return;
    var id = b.getAttribute("data-add");
    if (!cart.some(function (c) { return c.img === id; })) cart.push({ img: id, option: OPTIONS[0], qty: 1 });
    render(); renderCart();
  });

  function renderCart() {
    cartEmpty.hidden = cart.length > 0;
    setTimeout(function () { if (typeof buildOrder === "function") buildOrder(); }, 0);
    cartList.innerHTML = cart.map(function (c, i) {
      var opts = OPTIONS.map(function (o) { return "<option" + (o === c.option ? " selected" : "") + ">" + o + "</option>"; }).join("");
      return '<li class="cart-line"><div class="cart-line__top">IMG #' + c.img + '<button class="link-btn" type="button" data-remove="' + i + '">Remove</button></div>' +
        '<label class="sr-only" for="opt-' + i + '">Option for IMG #' + c.img + "</label>" +
        '<select class="input" id="opt-' + i + '" data-opt="' + i + '">' + opts + "</select>" +
        '<label class="sr-only" for="qty-' + i + '">Quantity</label>' +
        '<input class="input" id="qty-' + i + '" type="number" min="1" value="' + c.qty + '" data-qty="' + i + '"></li>';
    }).join("");
  }
  cartList.addEventListener("change", function (e) {
    var t = e.target;
    if (t.hasAttribute("data-opt")) cart[+t.getAttribute("data-opt")].option = t.value;
    if (t.hasAttribute("data-qty")) cart[+t.getAttribute("data-qty")].qty = Math.max(1, parseInt(t.value, 10) || 1);
    buildOrder();
  });
  cartList.addEventListener("click", function (e) {
    var b = e.target.closest("[data-remove]");
    if (!b) return;
    cart.splice(+b.getAttribute("data-remove"), 1);
    renderCart(); render();
  });

  var waBtn = orderForm.querySelector('[data-send="wa"]');
  var mailBtn = orderForm.querySelector('[data-send="email"]');

  /* The send buttons are real links; their address is rebuilt from the order. */
  function buildOrder() {
    if (!gallery) return;
    var lines = cart.map(function (c) { return "\u2022 IMG #" + c.img + " \u2014 " + c.option + " \u00d7 " + c.qty; });
    var who = [
      "Name: " + field(orderForm, "name").value.trim(),
      "Phone: " + field(orderForm, "phone").value.trim()
    ];
    if (field(orderForm, "student").value.trim()) who.push("Student / class: " + field(orderForm, "student").value.trim());
    var body = "Photo order \u2014 " + gallery.name + "\n\n" + lines.join("\n") + "\n\n" + who.join("\n");
    waBtn.href = "https://wa.me/" + SITE.whatsapp + "?text=" + encodeURIComponent(body);
    mailBtn.href = "mailto:" + SITE.email + "?subject=" + encodeURIComponent(orderSubject()) + "&body=" + encodeURIComponent(body);
    return body;
  }
  function orderSubject() { return "Photo order \u2014 " + gallery.name; }

  /* With a form service set in content.js, the order also reaches the business's inbox,
     and the second button sends it straight away; if that fails, the email app opens. */
  function sendOrder(body) {
    return window.CE && window.CE.sendForm ? window.CE.sendForm(orderForm, orderSubject(), body) : Promise.reject(new Error("off"));
  }
  var direct = !!(window.CE && window.CE.canSendForms && window.CE.canSendForms());
  var mailLabel = orderForm.querySelector("[data-email-label]");
  if (mailLabel && direct) mailLabel.textContent = "Send order";
  function orderValid() {
    if (!cart.length) { status(orderForm, "Add at least one photo to your order first.", false); return false; }
    orderForm.classList.add("was-validated");
    if (!orderForm.checkValidity()) { orderForm.reportValidity(); status(orderForm, "Please add your name and phone number.", false); return false; }
    return true;
  }
  orderForm.addEventListener("input", buildOrder);
  cartList.addEventListener("input", function () { setTimeout(buildOrder, 0); });
  waBtn.addEventListener("click", function (e) {
    if (!orderValid()) { e.preventDefault(); return; }
    var body = buildOrder();
    status(orderForm, "WhatsApp is opening with your order. Just press send. If it doesn\u2019t open, message " + (SITE.whatsappDisplay || SITE.phoneDisplay) + " on WhatsApp.", true);
    if (direct) sendOrder(body).then(function () {
      status(orderForm, "Thank you! We\u2019ve received your order. You can also send it in WhatsApp to chat with us there.", true);
    }, function () {});
  });
  mailBtn.addEventListener("click", function (e) {
    if (!orderValid()) { e.preventDefault(); return; }
    var body = buildOrder();
    var opening = "Your email app is opening with your order. If it doesn\u2019t, email " + SITE.email + ".";
    if (!direct) { status(orderForm, opening, true); return; }
    e.preventDefault();
    status(orderForm, "Sending\u2026", true);
    sendOrder(body).then(function () {
      status(orderForm, "Thank you! Your order was sent. We\u2019ll confirm prices and pickup or delivery with you.", true);
    }, function () {
      status(orderForm, opening, true);
      window.location.href = mailBtn.href;
    });
  });
  orderForm.addEventListener("submit", function (e) { e.preventDefault(); waBtn.click(); });

  renderCart();
})();
