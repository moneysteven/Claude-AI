/* Candid Expressions — client proofing.
   Galleries and access codes are set in js/content.js (PROOFING_GALLERIES). */
(function () {
  "use strict";

  var SITE = window.SITE || {};
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

  function sha256(text) {
    if (window.crypto && crypto.subtle && window.TextEncoder) {
      return crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buf) {
        return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
      });
    }
    return Promise.reject(new Error("unsupported"));
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
    mailBtn.href = "mailto:" + SITE.email + "?subject=" + encodeURIComponent("Photo order \u2014 " + gallery.name) + "&body=" + encodeURIComponent(body);
  }
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
    buildOrder();
    status(orderForm, "WhatsApp is opening with your order. Just press send. If it doesn\u2019t open, message (876) 568-5668.", true);
  });
  mailBtn.addEventListener("click", function (e) {
    if (!orderValid()) { e.preventDefault(); return; }
    buildOrder();
    status(orderForm, "Your email app is opening with your order. If it doesn\u2019t, email " + SITE.email + ".", true);
  });
  orderForm.addEventListener("submit", function (e) { e.preventDefault(); waBtn.click(); });

  renderCart();
})();
