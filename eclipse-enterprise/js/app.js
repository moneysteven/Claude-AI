const $ = (s, r = document) => r.querySelector(s);
const money = n => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0 });
const G = "#d4af6a", G2 = "#f0d9a3";

/* ---------- product illustrations (inline SVG) ---------- */
function art(t) {
  const d = `<defs><linearGradient id="g${t}" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${G2}"/><stop offset="1" stop-color="${G}"/></linearGradient><linearGradient id="s${t}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2540"/><stop offset="1" stop-color="#0b0b12"/></linearGradient></defs>`;
  const f = `url(#g${t})`, s = `url(#s${t})`;
  const body = {
    cabinet: `<rect x="50" y="10" width="100" height="180" rx="10" fill="#17171f" stroke="${f}" stroke-width="2"/><rect x="60" y="20" width="80" height="14" rx="3" fill="${f}"/><rect x="60" y="42" width="80" height="78" rx="5" fill="${s}" stroke="${G}" stroke-opacity=".5"/><circle cx="100" cy="81" r="22" fill="none" stroke="${f}" stroke-width="3"/><path d="M92 81h16M100 73v16" stroke="${f}" stroke-width="3"/><rect x="60" y="130" width="80" height="22" rx="3" fill="#0b0b12" stroke="${G}" stroke-opacity=".4"/><g fill="${f}"><circle cx="75" cy="141" r="5"/><circle cx="92" cy="141" r="5"/><circle cx="108" cy="141" r="5"/><circle cx="125" cy="141" r="5"/></g><rect x="82" y="160" width="36" height="6" rx="2" fill="#000"/><rect x="40" y="188" width="120" height="8" rx="3" fill="#0b0b12" stroke="${G}" stroke-opacity=".4"/>`,
    dual: `<rect x="40" y="8" width="120" height="30" rx="6" fill="${f}"/><rect x="48" y="14" width="104" height="18" rx="3" fill="#0b0b12"/><rect x="45" y="44" width="110" height="146" rx="8" fill="#17171f" stroke="${f}" stroke-width="2"/><rect x="53" y="52" width="94" height="44" rx="4" fill="${s}"/><rect x="53" y="100" width="94" height="44" rx="4" fill="${s}"/><g fill="${f}"><circle cx="72" cy="160" r="5"/><circle cx="90" cy="160" r="5"/><circle cx="108" cy="160" r="5"/><circle cx="126" cy="160" r="5"/></g><rect x="82" y="172" width="36" height="6" rx="2" fill="#000"/>`,
    slant: `<path d="M50 40h100l8 60H42z" fill="#17171f" stroke="${f}" stroke-width="2"/><rect x="56" y="46" width="88" height="48" rx="4" fill="${s}"/><path d="M42 100h116v26H42z" fill="#0b0b12" stroke="${G}" stroke-opacity=".5"/><g fill="${f}"><circle cx="70" cy="113" r="5"/><circle cx="90" cy="113" r="5"/><circle cx="110" cy="113" r="5"/><circle cx="130" cy="113" r="5"/></g><rect x="46" y="126" width="108" height="64" rx="4" fill="#17171f" stroke="${f}" stroke-width="2"/><rect x="82" y="140" width="36" height="6" rx="2" fill="#000"/>`,
    counter: `<rect x="40" y="40" width="120" height="86" rx="8" fill="#17171f" stroke="${f}" stroke-width="2"/><rect x="48" y="48" width="104" height="62" rx="4" fill="${s}"/><circle cx="100" cy="79" r="16" fill="none" stroke="${f}" stroke-width="3"/><rect x="85" y="126" width="30" height="14" fill="#17171f" stroke="${G}" stroke-opacity=".5"/><rect x="60" y="140" width="80" height="8" rx="3" fill="${f}"/>`,
    screen: `<rect x="30" y="45" width="140" height="95" rx="6" fill="#17171f" stroke="${f}" stroke-width="2"/><rect x="38" y="53" width="124" height="79" rx="3" fill="${s}"/><path d="M50 118l24-26 18 14 28-34 30 40" fill="none" stroke="${f}" stroke-width="3"/><rect x="85" y="140" width="30" height="14" fill="#17171f" stroke="${G}" stroke-opacity=".5"/><rect x="65" y="154" width="70" height="6" rx="3" fill="${f}"/>`,
    acceptor: `<rect x="45" y="55" width="110" height="80" rx="8" fill="#17171f" stroke="${f}" stroke-width="2"/><rect x="62" y="85" width="76" height="10" rx="3" fill="#000" stroke="${G}"/><rect x="62" y="68" width="30" height="8" rx="2" fill="${f}"/><path d="M80 110l20-8 20 8" fill="none" stroke="${f}" stroke-width="3"/>`,
    board: `<rect x="35" y="45" width="130" height="100" rx="5" fill="#10261e" stroke="${f}" stroke-width="2"/><rect x="60" y="65" width="40" height="40" fill="#0b0b12" stroke="${f}"/><rect x="115" y="65" width="35" height="20" fill="#0b0b12" stroke="${G}" stroke-opacity=".6"/><path d="M45 125h50M45 133h70M110 100v30h40" stroke="${G}" stroke-opacity=".7" fill="none"/><g fill="${f}"><circle cx="48" cy="58" r="3"/><circle cx="152" cy="58" r="3"/><circle cx="48" cy="132" r="3"/><circle cx="152" cy="132" r="3"/></g>`,
    buttons: `<rect x="25" y="70" width="150" height="60" rx="8" fill="#17171f" stroke="${f}" stroke-width="2"/><g fill="${f}" stroke="#000"><circle cx="55" cy="100" r="14"/><circle cx="90" cy="100" r="14"/><circle cx="125" cy="100" r="14"/><circle cx="160" cy="100" r="9" fill="#17171f" stroke="${G}"/></g>`,
    printer: `<rect x="45" y="60" width="110" height="70" rx="8" fill="#17171f" stroke="${f}" stroke-width="2"/><rect x="62" y="80" width="76" height="8" rx="3" fill="#000" stroke="${G}"/><path d="M75 88v50h50V88" fill="#f4f1ea" stroke="#999"/><path d="M85 105h30M85 115h22" stroke="#999"/>`,
    power: `<rect x="40" y="65" width="120" height="70" rx="6" fill="#17171f" stroke="${f}" stroke-width="2"/><circle cx="85" cy="100" r="22" fill="none" stroke="${G}"/><path d="M85 82v18l12 8" stroke="${f}" stroke-width="3" fill="none"/><path d="M125 78l-10 22h14l-10 22" stroke="${f}" stroke-width="3" fill="none"/>`,
    lamp: `<rect x="30" y="85" width="140" height="28" rx="14" fill="${f}"/><rect x="38" y="91" width="124" height="16" rx="8" fill="#fff" opacity=".55"/><path d="M40 70l-12-10M100 66V50M160 70l12-10M40 128l-12 10M100 132v16M160 128l12 10" stroke="${f}" stroke-width="3" stroke-linecap="round"/>`,
    service: `<path d="M100 28l60 22v48c0 36-26 62-60 76-34-14-60-40-60-76V50z" fill="#17171f" stroke="${f}" stroke-width="3"/><path d="M72 100l20 20 38-42" fill="none" stroke="${f}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`,
    cover: `<path d="M55 190V70q0-40 45-40t45 40v120z" fill="#1b1b24" stroke="${f}" stroke-width="2"/><path d="M70 190V80q0-30 30-30t30 30v110" fill="none" stroke="${G}" stroke-opacity=".4"/><text x="100" y="125" text-anchor="middle" font-family="Georgia" font-size="22" fill="${f}">E</text>`,
    lock: `<rect x="55" y="85" width="90" height="75" rx="10" fill="#17171f" stroke="${f}" stroke-width="2"/><path d="M75 85V65a25 25 0 0150 0v20" fill="none" stroke="${f}" stroke-width="6"/><circle cx="100" cy="115" r="9" fill="${f}"/><rect x="97" y="118" width="6" height="22" fill="${f}"/>`
  };
  return `<svg viewBox="0 0 200 200" role="img" aria-hidden="true">${d}${body[t] || body.cabinet}</svg>`;
}

/* ---------- cart ---------- */
const Cart = {
  get() { try { return JSON.parse(localStorage.getItem("eclipse_cart")) || {}; } catch { return {}; } },
  save(c) { try { localStorage.setItem("eclipse_cart", JSON.stringify(c)); } catch {} Cart.render(); },
  add(id) { const c = Cart.get(); c[id] = (c[id] || 0) + 1; Cart.save(c); toast("Added to cart"); },
  set(id, q) { const c = Cart.get(); if (q <= 0) delete c[id]; else c[id] = q; Cart.save(c); },
  clear() { Cart.save({}); },
  lines() { const c = Cart.get(); return Object.keys(c).map(id => ({ p: PRODUCTS.find(x => x.id === id), q: c[id] })).filter(l => l.p); },
  total() { return Cart.lines().reduce((s, l) => s + l.p.price * l.q, 0); },
  count() { return Cart.lines().reduce((s, l) => s + l.q, 0); },
  render() {
    const n = Cart.count();
    document.querySelectorAll(".cartbtn b").forEach(e => e.textContent = n);
    const box = $("#cartItems"); if (!box) return;
    const ls = Cart.lines();
    box.innerHTML = ls.length ? ls.map(({ p, q }) => `<div class="line"><div class="th">${art(p.art)}</div><div><h4>${p.name}</h4><small>${money(p.price)}</small><div class="qty"><button data-dec="${p.id}" aria-label="Decrease">−</button><span>${q}</span><button data-inc="${p.id}" aria-label="Increase">+</button></div></div><div><b>${money(p.price * q)}</b><button class="rm" data-rm="${p.id}">Remove</button></div></div>`).join("")
      : `<p style="color:var(--mute);padding:40px 0;text-align:center">Your cart is empty.</p>`;
    $("#cartTotal").textContent = money(Cart.total());
    $("#checkoutLink").style.display = ls.length ? "block" : "none";
  }
};
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("on"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("on"), 1600); }
function drawer(open) { $("#drawer").classList.toggle("on", open); $("#veil").classList.toggle("on", open); }

/* ---------- shared chrome ---------- */
function chrome() {
  const page = document.body.dataset.page;
  const lk = (h, t, k) => `<li><a href="${h}" class="${page === k ? "on" : ""}">${t}</a></li>`;
  $("#hdr").innerHTML = `<header><div class="wrap nav"><a href="index.html" class="logo"><img class="mark" src="img/logo.jpg" alt=""><span>Eclipse<small>Enterprise LTD</small></span></a>
  <nav><ul id="menu">${lk("index.html", "Home", "home")}${lk("shop.html", "Shop", "shop")}${lk("shop.html?c=machines", "Machines", "m")}${lk("shop.html?c=parts", "Parts", "p")}${lk("index.html#contact", "Contact", "c")}</ul></nav>
  <div style="display:flex;gap:10px;align-items:center"><button class="cartbtn" id="openCart">Cart<b>0</b></button><button class="burger" id="burger" aria-label="Menu">☰</button></div></div></header>`;
  $("#ftr").innerHTML = `<footer><div class="wrap"><div class="cols"><div><a class="logo" href="index.html"><img class="mark" src="img/logo.jpg" alt=""><span>Eclipse<small>Enterprise LTD</small></span></a><p style="margin-top:14px;max-width:320px">Premium gaming machines, parts and accessories for operators who demand more. Questions after your purchase? Just call us.</p></div>
  <div><p class="eyebrow">Shop</p><p><a href="shop.html?c=machines">Machines</a><br><a href="shop.html?c=parts">Parts</a><br><a href="shop.html?c=accessories">Accessories</a></p></div>
  <div><p class="eyebrow">Contact</p><p><a href="tel:+18764410085">876-441-0085</a><br><a href="mailto:Eclipseenterprisecoltd@gmail.com">Eclipseenterprisecoltd@gmail.com</a></p></div>
  <div><p class="eyebrow">Company</p><p><a href="index.html#why">Why Eclipse</a><br><a href="index.html#contact">Contact</a><br><a href="checkout.html">Checkout</a></p></div></div>
  <div class="legal">© ${new Date().getFullYear()} Eclipse Enterprise LTD. All rights reserved. All sales are final. Machines and parts are sold as-is with no warranty, and Eclipse Enterprise LTD is not responsible for any item after sale; support is provided only when a customer contacts us. Gaming machines are sold to adults only (18+, or 21+ where required) and to buyers in jurisdictions where ownership and operation are lawful. Purchasers are responsible for all licensing, permits and compliance with local gaming laws. Please play responsibly.</div></div></footer>
  <div class="veil" id="veil"></div>
  <aside class="drawer" id="drawer"><header><h3>Your Cart</h3><button class="x" id="closeCart" style="position:static">×</button></header><div class="items" id="cartItems"></div>
  <div class="foot"><div class="tot"><span>Subtotal</span><b id="cartTotal"></b></div><a id="checkoutLink" class="btn solid" style="display:block;text-align:center" href="checkout.html">Checkout</a></div></aside>
  <div class="modal" id="modal"><div class="box" id="modalBox"></div></div><div class="toast" id="toast"></div>`;
  $("#burger").onclick = () => $("#menu").classList.toggle("on");
  $("#openCart").onclick = () => drawer(true);
  $("#closeCart").onclick = $("#veil").onclick = () => drawer(false);
  $("#drawer").addEventListener("click", e => {
    const t = e.target, c = Cart.get();
    if (t.dataset.inc) Cart.set(t.dataset.inc, c[t.dataset.inc] + 1);
    if (t.dataset.dec) Cart.set(t.dataset.dec, c[t.dataset.dec] - 1);
    if (t.dataset.rm) Cart.set(t.dataset.rm, 0);
  });
  $("#modal").addEventListener("click", e => { if (e.target.id === "modal" || e.target.classList.contains("x")) $("#modal").classList.remove("on"); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") { $("#modal").classList.remove("on"); drawer(false); } });
  document.addEventListener("click", e => {
    const a = e.target.closest("[data-add]"); if (a) Cart.add(a.dataset.add);
    const v = e.target.closest("[data-view]"); if (v) openProduct(v.dataset.view);
  });
  Cart.render();
  ageGate();
}
function openProduct(id) {
  const p = PRODUCTS.find(x => x.id === id);
  $("#modalBox").innerHTML = `<button class="x" aria-label="Close">×</button><div class="art">${art(p.art)}</div><div class="info"><span class="eyebrow">${CATEGORIES[p.cat].name}</span><h2>${p.name}</h2><div class="price">${money(p.price)}</div><p style="color:var(--mute);margin-top:12px">${p.desc}</p><ul>${p.specs.map(s => `<li>${s}</li>`).join("")}</ul><button class="btn solid" data-add="${p.id}">Add to cart</button></div>`;
  $("#modal").classList.add("on");
}
function ageGate() {
  let ok = false; try { ok = sessionStorage.getItem("eclipse_age") === "1"; } catch {}
  if (ok) return;
  const g = document.createElement("div"); g.className = "gate";
  g.innerHTML = `<div class="box"><img class="mark" src="img/logo.jpg" alt=""><h2>Adults Only</h2><p>Eclipse Enterprise LTD sells gaming equipment intended for adult customers. Please confirm you are of legal age in your jurisdiction (18+ or 21+ where required).</p><button class="btn solid" id="yes">I am of legal age</button><a class="btn" href="https://www.google.com">Exit</a></div>`;
  document.body.appendChild(g);
  $("#yes").onclick = () => { try { sessionStorage.setItem("eclipse_age", "1"); } catch {} g.remove(); };
}
const card = p => `<article class="card"><div class="art" data-view="${p.id}">${p.tag ? `<span class="tag">${p.tag}</span>` : ""}${art(p.art)}</div><div class="body"><span class="cat-l">${CATEGORIES[p.cat].name}</span><h3 data-view="${p.id}">${p.name}</h3><p>${p.desc}</p><div class="row"><span class="price">${money(p.price)}</span><button class="btn sm" data-add="${p.id}">Add to cart</button></div></div></article>`;

/* ---------- pages ---------- */
function home() {
  
  $("#featured").innerHTML = PRODUCTS.filter(p => p.tag).slice(0, 4).map(card).join("");
}
function shop() {
  let cat = new URLSearchParams(location.search).get("c") || "all", q = "";
  const chips = $("#chips");
  chips.innerHTML = [["all", "All"], ...Object.entries(CATEGORIES).map(([k, v]) => [k, v.name])].map(([k, n]) => `<button class="chip" data-c="${k}">${n}</button>`).join("") + `<input id="q" type="search" placeholder="Search products…" aria-label="Search">`;
  const draw = () => {
    chips.querySelectorAll(".chip").forEach(c => c.classList.toggle("on", c.dataset.c === cat));
    const list = PRODUCTS.filter(p => (cat === "all" || p.cat === cat) && (p.name + p.desc).toLowerCase().includes(q));
    $("#grid").innerHTML = list.length ? list.map(card).join("") : `<p style="color:var(--mute)">No products match your search.</p>`;
    $("#blurb").textContent = cat === "all" ? "Machines, parts and accessories — everything your floor needs." : CATEGORIES[cat].blurb;
  };
  chips.addEventListener("click", e => { if (e.target.dataset.c) { cat = e.target.dataset.c; draw(); } });
  $("#q").oninput = e => { q = e.target.value.toLowerCase(); draw(); };
  draw();
}
function checkout() {
  const ls = Cart.lines();
  const sum = () => { const sub = Cart.total(); return `${Cart.lines().map(({ p, q }) => `<div class="line"><span>${p.name} × ${q}</span><b>${money(p.price * q)}</b></div>`).join("")}<div class="tot" style="margin-top:18px"><span>Total</span><b>${money(sub)}</b></div><p style="color:var(--mute);font-size:.8rem">Shipping and any applicable taxes are confirmed by our team before payment.</p>`; };
  $("#sum").innerHTML = ls.length ? sum() : `<p style="color:var(--mute)">Your cart is empty. <a href="shop.html" style="color:var(--gold)">Browse the shop →</a></p>`;
  $("#orderForm").onsubmit = e => {
    e.preventDefault();
    if (!Cart.count()) return toast("Your cart is empty");
    const ref = "ECL-" + Date.now().toString(36).toUpperCase();
    // No backend yet: this records the order request locally. Connect a payment provider/API to go live.
    try { const o = JSON.parse(localStorage.getItem("eclipse_orders") || "[]"); o.push({ ref, items: Cart.get(), total: Cart.total(), form: Object.fromEntries(new FormData(e.target)), at: new Date().toISOString() }); localStorage.setItem("eclipse_orders", JSON.stringify(o)); } catch {}
    Cart.clear();
    $("#checkoutMain").innerHTML = `<div class="done wrap"><span class="eyebrow">Order request received</span><h1>Thank you.</h1><p style="color:var(--mute)">Your reference is <b style="color:var(--gold2)">${ref}</b>.<br>Our team will contact you to confirm shipping, compliance details and payment.</p><p style="margin-top:30px"><a class="btn" href="shop.html">Continue shopping</a></p></div>`;
    scrollTo(0, 0);
  };
}
document.addEventListener("DOMContentLoaded", () => {
  chrome();
  const p = document.body.dataset.page;
  if (p === "home") home(); if (p === "shop") shop(); if (p === "checkout") checkout();
});
