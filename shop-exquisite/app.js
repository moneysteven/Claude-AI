(function () {
  const S = window.STORE, P = window.PRODUCTS;
  const $ = (s) => document.querySelector(s);
  const money = (n) => S.currencySymbol + Number(n).toLocaleString("en-US");
  const totalStock = (p) => Object.values(p.sizes).reduce((a, b) => a + b, 0);
  const find = (id) => P.find((p) => p.id === id);

  // ---------- Product imagery (elegant SVG garment if no photo supplied) ----------
  function art(p) {
    if (p.image) return `<img src="${p.image}" alt="${p.name}" loading="lazy">`;
    const c = p.color;
    const dress = ["Dresses"].includes(p.category), coat = p.category === "Outerwear",
      bottoms = p.category === "Bottoms", acc = p.category === "Accessories";
    let shape;
    if (dress) shape = `<path d="M150 70 L170 70 L178 120 L200 330 L120 330 L142 120 Z M142 70 L128 40 M178 70 L192 40" />`;
    else if (coat) shape = `<path d="M110 80 L150 66 L170 66 L210 80 L232 330 L190 330 L190 160 L130 160 L130 330 L88 330 Z"/>`;
    else if (bottoms) shape = `<path d="M118 90 L202 90 L218 330 L172 330 L160 160 L148 330 L102 330 Z"/>`;
    else if (acc) shape = `<rect x="108" y="150" width="104" height="90" rx="6"/><path d="M130 150 C130 100 190 100 190 150" fill="none" stroke="${c}" stroke-width="7"/>`;
    else shape = `<path d="M100 90 L140 70 Q160 90 180 70 L220 90 L245 170 L212 182 L205 140 L205 290 L115 290 L115 140 L108 182 L75 170 Z"/>`;
    return `<svg viewBox="0 0 320 400" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs><linearGradient id="g${p.id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#f6f0e6"/><stop offset="1" stop-color="#e3d6bf"/></linearGradient></defs>
      <rect width="320" height="400" fill="url(#g${p.id})"/>
      <g fill="${c}" stroke="rgba(0,0,0,.12)" stroke-width="1.5" stroke-linejoin="round">${shape}</g>
      <ellipse cx="160" cy="352" rx="70" ry="6" fill="rgba(0,0,0,.08)"/></svg>`;
  }

  function status(p) {
    const n = totalStock(p);
    if (n === 0) return { cls: "out", text: "Sold Out" };
    if (n <= S.lowStockAt) return { cls: "low", text: `Only ${n} left` };
    return { cls: "ok", text: "In Stock" };
  }

  // ---------- Catalog ----------
  let category = "All", query = "";
  let wish = new Set();
  try { wish = new Set(JSON.parse(localStorage.getItem("se_wish") || "[]").filter((id) => find(id))); } catch (e) {}
  const saveWish = () => { try { localStorage.setItem("se_wish", JSON.stringify([...wish])); } catch (e) {} };
  const cats = ["All", ...new Set(P.map((p) => p.category)), "Saved"];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const hay = (p) => (p.name + " " + p.category + " " + p.desc + " " + p.id).toLowerCase();
  const matches = (p, q) => { const t = q.toLowerCase().split(/\s+/).filter(Boolean); return t.every((w) => hay(p).includes(w)); };
  const hl = (text, q) => {
    const t = q.trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const safe = esc(text); if (!t.length) return safe;
    return safe.replace(new RegExp("(" + t.map(esc).join("|") + ")", "gi"), "<mark>$1</mark>");
  };
  const HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.3-8.7-8.7C2.2 8.2 3.9 5.5 6.8 5.5c1.8 0 3.2.9 3.9 2.2h2.6c.7-1.3 2.1-2.2 3.9-2.2 2.9 0 4.6 2.7 3.5 5.8C19 15.7 12 20 12 20z"/></svg>';
  function renderChips() {
    $("#categoryChips").innerHTML = cats.map((c) => {
      const label = c === "Saved" ? "Saved" + (wish.size ? ` (${wish.size})` : "") : c;
      return `<button class="chip ${c === category ? "on" : ""}" data-c="${c}">${label}</button>`;
    }).join("");
    const sc = $("#savedCount"); sc.textContent = wish.size; sc.hidden = !wish.size;
  }
  function filtered() {
    let list = P.filter((p) => category === "All" || (category === "Saved" ? wish.has(p.id) : p.category === category));
    if (query.trim()) list = list.filter((p) => matches(p, query));
    if ($("#inStockOnly").checked) list = list.filter((p) => totalStock(p) > 0);
    const s = $("#sortBy").value;
    if (s === "low") list = [...list].sort((a, b) => a.price - b.price);
    if (s === "high") list = [...list].sort((a, b) => b.price - a.price);
    return list;
  }
  function renderGrid(animate) {
    const list = filtered();
    $("#grid").innerHTML = list.map((p, k) => {
      const st = status(p), on = wish.has(p.id);
      return `<article class="card ${st.cls === "out" ? "sold" : ""} ${animate ? "enter" : ""}" style="--d:${k * 45}ms" data-id="${p.id}" tabindex="0">
        <div class="img">${art(p)}<span class="badge ${st.cls}">${st.text}</span>${p.isNew && st.cls !== "out" ? '<span class="badge new">New</span>' : ""}
          <button class="heart ${on ? "on" : ""}" type="button" data-heart="${p.id}" aria-pressed="${on}" aria-label="${on ? "Remove from saved" : "Save"} ${esc(p.name)}">${HEART}</button></div>
        <h3>${hl(p.name, query)}</h3><div class="cat">${p.category}</div><div class="price">${money(p.price)}</div></article>`;
    }).join("");
    const q = query.trim();
    $("#empty").hidden = list.length > 0;
    $("#resultCount").textContent = q || category !== "All" || $("#inStockOnly").checked ? `${list.length} ${list.length === 1 ? "item" : "items"}${q ? ` for “${q}”` : ""}` : "";
    if (!list.length) {
      $("#emptyTitle").textContent = q ? `No results for “${q}”` : category === "Saved" ? "Nothing saved yet" : "Nothing matches your filters";
      $("#emptySub").textContent = category === "Saved" && !q ? "Tap the heart on any piece to save it here." : "Try a different word, like tee, jeans or sneakers.";
    }
    $("#gridClear").hidden = !query;
  }
  function toggleWish(id) {
    wish.has(id) ? wish.delete(id) : wish.add(id);
    saveWish(); renderChips();
    document.querySelectorAll(`[data-heart="${id}"]`).forEach((b) => { const on = wish.has(id); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
    if (current && current.id === id) syncMHeart();
    if (category === "Saved") renderGrid();
    toast(wish.has(id) ? "Saved" : "Removed from saved");
  }

  // ---------- Modal ----------
  let current = null, pickedSize = null;
  function openModal(id) {
    current = find(id); pickedSize = null;
    const p = current;
    $("#mImg").innerHTML = art(p);
    $("#mCat").textContent = p.category;
    $("#mTitle").textContent = p.name;
    $("#mPrice").textContent = money(p.price);
    $("#mDesc").textContent = p.desc;
    $("#mSizes").innerHTML = Object.entries(p.sizes).map(([s, n]) => `<button class="size" data-s="${s}" ${n === 0 ? "disabled" : ""}>${s}</button>`).join("");
    const out = totalStock(p) === 0;
    $("#mStock").textContent = out ? "This piece is currently sold out." : "Select a size.";
    $("#mAdd").disabled = true;
    $("#mAdd").textContent = out ? "Sold Out" : "Add to Bag";
    syncMHeart();
    $("#modalOverlay").hidden = false;
  }
  function syncMHeart() { const on = !!current && wish.has(current.id); const b = $("#mHeart"); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); b.setAttribute("aria-label", on ? "Remove from saved" : "Save"); }
  const closeModal = () => ($("#modalOverlay").hidden = true);

  // ---------- Cart ----------
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem("se_cart") || "[]"); } catch (e) {}
  cart = cart.filter((i) => find(i.id) && (find(i.id).sizes[i.size] || 0) > 0)
             .map((i) => ({ ...i, qty: Math.min(i.qty, find(i.id).sizes[i.size]) }));
  const save = () => { try { localStorage.setItem("se_cart", JSON.stringify(cart)); } catch (e) {} };
  const subtotal = () => cart.reduce((a, i) => a + find(i.id).price * i.qty, 0);
  const shipping = () => (cart.length === 0 ? 0 : S.freeShippingOver && subtotal() >= S.freeShippingOver ? 0 : S.shippingFlat);

  function totalsHTML() {
    return `<div><span>Subtotal</span><span>${money(subtotal())}</span></div>
      <div><span>DHL delivery</span><span>${shipping() === 0 ? "Free" : money(shipping())}</span></div>
      <div class="grand"><span>Total</span><span>${money(subtotal() + shipping())}</span></div>`;
  }
  function renderCart() {
    $("#cartCount").textContent = cart.reduce((a, i) => a + i.qty, 0);
    if (!cart.length) {
      $("#cartItems").innerHTML = '<p class="empty-bag">Your bag is empty.</p>';
      $("#totals").innerHTML = ""; $("#toCheckout").disabled = true;
    } else {
      $("#toCheckout").disabled = false;
      $("#cartItems").innerHTML = cart.map((i, k) => {
        const p = find(i.id);
        return `<div class="line"><div class="t">${art(p)}</div>
          <div><b>${p.name}</b><small>Size ${i.size} · ${money(p.price)}</small>
          <div class="qty"><button data-k="${k}" data-d="-1" aria-label="Less">−</button><span>${i.qty}</span><button data-k="${k}" data-d="1" aria-label="More">+</button></div></div>
          <div><b>${money(p.price * i.qty)}</b><button class="rm" data-k="${k}" data-rm="1">Remove</button></div></div>`;
      }).join("");
      $("#totals").innerHTML = totalsHTML();
    }
    $("#totals2").innerHTML = totalsHTML();
    const bar = $("#shipBar");
    if (!S.freeShippingOver || !cart.length) bar.innerHTML = "";
    else {
      const left = S.freeShippingOver - subtotal(), pct = Math.min(100, Math.round(subtotal() / S.freeShippingOver * 100));
      bar.innerHTML = `<p>${left > 0 ? `Add <b>${money(left)}</b> more for free DHL delivery` : "<b>You've unlocked free DHL delivery</b>"}</p><div class="track"><i style="width:${pct}%"></i></div>`;
    }
    save();
  }
  function addToCart(p, size) {
    const have = p.sizes[size], ex = cart.find((i) => i.id === p.id && i.size === size);
    if (ex) { if (ex.qty >= have) return toast(`Only ${have} available in size ${size}`); ex.qty++; }
    else cart.push({ id: p.id, size, qty: 1 });
    renderCart(); toast("Added to your bag");
  }
  function show(view) {
    ["cartView", "checkoutView", "doneView"].forEach((v) => ($("#" + v).hidden = v !== view));
  }
  function openCart(view) {
    show(view || "cartView");
    $("#drawer").classList.add("open"); $("#drawer").setAttribute("aria-hidden", "false");
    $("#cartOverlay").hidden = false;
  }
  function closeCart() {
    $("#drawer").classList.remove("open"); $("#drawer").setAttribute("aria-hidden", "true");
    $("#cartOverlay").hidden = true;
  }
  let tt;
  function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("show"); clearTimeout(tt); tt = setTimeout(() => t.classList.remove("show"), 2200); }

  // ---------- Place order (emailed to the owner) ----------
  function orderNumber() { return "SE-" + Date.now().toString(36).toUpperCase().slice(-6); }
  async function placeOrder(e) {
    e.preventDefault();
    const f = e.target, err = $("#formError"); err.hidden = true;
    let ok = true;
    f.querySelectorAll("[required]").forEach((el) => { const bad = el.type === "checkbox" ? !el.checked : (!el.value.trim() || (el.type === "email" && !/^\S+@\S+\.\S+$/.test(el.value))); el.classList.toggle("bad", bad); if (bad) ok = false; });
    if (!ok) { err.textContent = f.agree.checked ? "Please complete the highlighted fields." : "Please complete the highlighted fields and accept the no-refund policy."; err.hidden = false; return; }
    if (f._honey.value) return; // bot
    if (!cart.length) return;

    const no = orderNumber(), d = Object.fromEntries(new FormData(f));
    const lines = cart.map((i) => { const p = find(i.id); return `${i.qty} x ${p.name} (${p.id}) — Size ${i.size} — ${money(p.price * i.qty)}`; }).join("\n");
    const payload = {
      _subject: `New Order ${no} — ${d.name} — ${money(subtotal() + shipping())}`,
      _template: "table", _captcha: "false", _cc: d.email,
      "Order Number": no,
      "Items": lines,
      "Subtotal": money(subtotal()),
      "DHL Delivery": shipping() === 0 ? "Free" : money(shipping()),
      "TOTAL": money(subtotal() + shipping()),
      "Customer": d.name, "Phone": d.phone, "email": d.email,
      "Address": `${d.address}, ${d.town}, ${d.parish}`,
      "Payment": d.payment === "Card" ? "Card — customer sent to secure payment page" + (S.cardPaymentLink ? "" : " (send payment link)") : "Arrange with seller",
      "No-refund policy accepted": "Yes",
      "Notes": d.notes || "—"
    };
    const btn = $("#placeOrder"); btn.disabled = true; btn.textContent = "Sending…";
    try {
      const r = await fetch("https://formsubmit.co/ajax/" + encodeURIComponent(S.ownerEmail), {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload)
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.success === "false" || j.success === false) throw new Error(j.message || "send failed");
      $("#orderNo").textContent = no;
      const card = d.payment === "Card", total = money(subtotal() + shipping());
      $("#payBtn").hidden = !(card && S.cardPaymentLink);
      if (card && S.cardPaymentLink) { $("#payBtn").href = S.cardPaymentLink; $("#payMsg").textContent = `Total to pay: ${total}. Use the button below to pay securely by card (reference ${no}).`; }
      else if (card) $("#payMsg").textContent = `Total: ${total}. We'll send you a secure card payment link shortly.`;
      else $("#payMsg").textContent = `Total: ${total}. We'll contact you to arrange payment.`;
      cart = []; renderCart(); f.reset(); show("doneView");
    } catch (x) {
      err.innerHTML = `We couldn't send your order automatically. Please try again, or <a href="https://wa.me/${S.whatsapp}?text=${encodeURIComponent("Order " + no + "\n" + lines + "\nTotal: " + money(subtotal() + shipping()) + "\n" + d.name + ", " + d.phone + "\n" + d.address + ", " + d.town + ", " + d.parish)}" target="_blank" rel="noopener"><u>send it via WhatsApp</u></a>.`;
      err.hidden = false;
    } finally { btn.disabled = false; btn.textContent = "Place Order"; }
  }

  // ---------- Wiring ----------
  $("#categoryChips").addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (!b) return; category = b.dataset.c; renderChips(); renderGrid(true); });
  $("#inStockOnly").addEventListener("change", () => renderGrid(true));
  $("#sortBy").addEventListener("change", () => renderGrid(true));
  const openCard = (e) => { const hb = e.target.closest(".heart"); if (hb) { e.stopPropagation(); return toggleWish(hb.dataset.heart); } const c = e.target.closest(".card"); if (c) openModal(c.dataset.id); };
  $("#grid").addEventListener("click", openCard);
  $("#grid").addEventListener("keydown", (e) => { if (e.key === "Enter") openCard(e); });
  $("#mSizes").addEventListener("click", (e) => {
    const b = e.target.closest(".size"); if (!b || b.disabled) return;
    pickedSize = b.dataset.s;
    document.querySelectorAll(".size").forEach((x) => x.classList.toggle("sel", x === b));
    const n = current.sizes[pickedSize];
    $("#mStock").textContent = n <= S.lowStockAt ? `Only ${n} left in size ${pickedSize}` : `In stock — size ${pickedSize}`;
    $("#mAdd").disabled = false;
  });
  $("#mAdd").addEventListener("click", () => { if (current && pickedSize) { addToCart(current, pickedSize); closeModal(); openCart(); } });
  $("#closeModal").addEventListener("click", closeModal);
  $("#modalOverlay").addEventListener("click", (e) => { if (e.target.id === "modalOverlay") closeModal(); });
  $("#openCart").addEventListener("click", () => openCart());
  $("#closeCart").addEventListener("click", closeCart);
  $("#cartOverlay").addEventListener("click", closeCart);
  $("#cartItems").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    const i = cart[+b.dataset.k]; if (!i) return;
    if (b.dataset.rm) cart.splice(+b.dataset.k, 1);
    else {
      const q = i.qty + +b.dataset.d, max = find(i.id).sizes[i.size];
      if (q > max) return toast(`Only ${max} available in size ${i.size}`);
      if (q < 1) cart.splice(+b.dataset.k, 1); else i.qty = q;
    }
    renderCart();
  });
  $("#toCheckout").addEventListener("click", () => show("checkoutView"));
  $("#backToBag").addEventListener("click", () => show("cartView"));
  $("#keepShopping").addEventListener("click", closeCart);
  $("#checkoutView").addEventListener("submit", placeOrder);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeModal(); closeCart(); } });

  // ---------- Search (grid field + Spotlight-style overlay) ----------
  const gs = $("#gridSearch");
  gs.addEventListener("input", () => { query = gs.value; renderGrid(); });
  $("#gridClear").addEventListener("click", () => { gs.value = ""; query = ""; renderGrid(true); gs.focus(); });
  $("#emptyReset").addEventListener("click", () => { gs.value = ""; query = ""; category = "All"; $("#inStockOnly").checked = false; renderChips(); renderGrid(true); });
  $("#mHeart").addEventListener("click", () => current && toggleWish(current.id));
  $("#openSaved").addEventListener("click", () => { category = "Saved"; renderChips(); renderGrid(true); document.getElementById("shop").scrollIntoView({ behavior: "smooth" }); });

  const spot = $("#spotOverlay"), si = $("#spotInput"), sList = $("#spotList"), sChips = $("#spotChips");
  let sItems = [], sAct = -1, sQ = "";
  const stockWord = (p) => { const s = status(p); return s.cls === "out" ? "Sold out" : s.cls === "low" ? s.text : "In stock"; };
  function renderSpot(q) {
    sQ = q;
    const all = q.trim() ? P.filter((p) => matches(p, q)) : P;
    const shown = all.slice(0, 6);
    sItems = shown.map((p) => ({ id: p.id }));
    let html = shown.map((p, k) => `<button type="button" class="sp-item" role="option" data-id="${p.id}" style="--d:${k * 32}ms">
      <span class="sp-img">${art(p)}</span>
      <span class="sp-txt"><b>${hl(p.name, q)}</b><small>${p.category} · <i class="${status(p).cls}">${stockWord(p)}</i></small></span>
      <span class="sp-price">${money(p.price)}</span></button>`).join("");
    if (q.trim() && all.length) html += `<button type="button" class="sp-all" data-all="1">See all ${all.length} ${all.length === 1 ? "result" : "results"} →</button>`;
    if (q.trim() && !all.length) html = `<p class="sp-empty"><b>No results for “${esc(q.trim())}”</b>Try “tee”, “jeans” or “sneakers”.</p>`;
    sList.innerHTML = html;
    sChips.hidden = !!q.trim();
    sAct = shown.length ? 0 : -1; markSpot();
  }
  function markSpot() {
    sList.querySelectorAll(".sp-item").forEach((e, k) => { e.classList.toggle("act", k === sAct); e.setAttribute("aria-selected", k === sAct); });
    if (sAct >= 0) { const el = sList.querySelectorAll(".sp-item")[sAct]; el && el.scrollIntoView({ block: "nearest" }); }
  }
  function openSpot(prefill) {
    closeCart(); closeModal();
    sChips.innerHTML = ["Tees", "Pants", "Shoes", "In stock"].map((c) => `<button type="button" class="chip" data-q="${c}">${c}</button>`).join("");
    spot.hidden = false; si.value = prefill || ""; renderSpot(si.value);
    requestAnimationFrame(() => si.focus());
  }
  const closeSpot = () => { spot.hidden = true; };
  function pickSpot(id) { closeSpot(); openModal(id); }
  function seeAll() {
    const q = sQ.trim(); closeSpot(); query = q; gs.value = q; category = "All"; renderChips(); renderGrid(true);
    document.getElementById("shop").scrollIntoView({ behavior: "smooth" });
  }
  si.addEventListener("input", () => renderSpot(si.value));
  si.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); if (sItems.length) { sAct = (sAct + 1) % sItems.length; markSpot(); } }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (sItems.length) { sAct = (sAct - 1 + sItems.length) % sItems.length; markSpot(); } }
    else if (e.key === "Enter") { e.preventDefault(); if (sAct >= 0) pickSpot(sItems[sAct].id); else if (si.value.trim()) seeAll(); }
    else if (e.key === "Escape") { e.stopPropagation(); closeSpot(); }
  });
  sList.addEventListener("click", (e) => { const it = e.target.closest(".sp-item"); if (it) return pickSpot(it.dataset.id); if (e.target.closest(".sp-all")) seeAll(); });
  sList.addEventListener("mousemove", (e) => { const it = e.target.closest(".sp-item"); if (!it) return; const k = [...sList.querySelectorAll(".sp-item")].indexOf(it); if (k !== sAct) { sAct = k; markSpot(); } });
  sChips.addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (!b) return; si.value = b.dataset.q === "In stock" ? "" : b.dataset.q; if (b.dataset.q === "In stock") { closeSpot(); $("#inStockOnly").checked = true; renderGrid(true); document.getElementById("shop").scrollIntoView({ behavior: "smooth" }); } else { renderSpot(si.value); si.focus(); } });
  $("#spotClose").addEventListener("click", closeSpot);
  spot.addEventListener("click", (e) => { if (e.target === spot) closeSpot(); });
  $("#openSearch").addEventListener("click", () => openSpot());
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || "");
    if ((e.key === "/" && !typing) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) { e.preventDefault(); spot.hidden ? openSpot() : si.focus(); }
  });

  // ---------- Init ----------
  $("#yr").textContent = new Date().getFullYear();
  $("#freeShipText").textContent = S.freeShippingOver ? money(S.freeShippingOver) : "";
  $(".announce").textContent = S.hours + " · Island-wide DHL delivery" + (S.freeShippingOver ? " · Free delivery over " + money(S.freeShippingOver) : "");
  $("#hoursText").textContent = S.hours + ".";
  $("#hoursFoot").textContent = S.hours;
  $("#rateText").textContent = `Flat ${money(S.shippingFlat)} per order across the island.` + (S.freeShippingOver ? ` Free delivery on orders over ${money(S.freeShippingOver)}.` : "");
  $("#waLink").href = "https://wa.me/" + S.whatsapp; $("#waLink").textContent = S.phoneDisplay;
  $("#igLink").href = "https://instagram.com/" + S.instagram; $("#igLink").textContent = "@" + S.instagram;
  $("#locText").textContent = S.location + ", Jamaica";
  renderChips(); renderGrid(); renderCart();
})();

// ---------- Smooth touches: nav shadow + scroll reveal ----------
(function () {
  document.documentElement.classList.add("js");
  const nav = document.querySelector(".nav");
  const onScroll = () => nav.classList.toggle("scrolled", window.scrollY > 8);
  const tt = document.getElementById("toTop");
  const onScroll2 = () => { onScroll(); if (tt) tt.hidden = window.scrollY < 700; };
  if (tt) tt.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  window.addEventListener("scroll", onScroll2, { passive: true }); onScroll2();
  const els = document.querySelectorAll(".reveal");
  const show = (e) => e.classList.add("in");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => es.forEach((x) => { if (x.isIntersecting) { show(x.target); io.unobserve(x.target); } }), { threshold: 0.12 });
    els.forEach((e) => io.observe(e));
    setTimeout(() => els.forEach(show), 2500);
  } else els.forEach(show);
})();

// ---------- Modern dropdowns (replace the browser's default select list) ----------
(function () {
  const CHEV = '<svg class="cs-chev" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const all = [];
  function enhance(sel) {
    const wrap = document.createElement("div");
    wrap.className = "cs" + (sel.id === "sortBy" ? " cs-pill" : "");
    sel.parentNode.insertBefore(wrap, sel); wrap.appendChild(sel);
    sel.classList.add("cs-native"); sel.tabIndex = -1; sel.setAttribute("aria-hidden", "true");
    const btn = document.createElement("button");
    btn.type = "button"; btn.className = "cs-btn"; btn.setAttribute("aria-haspopup", "listbox"); btn.setAttribute("aria-expanded", "false");
    const list = document.createElement("div");
    list.className = "cs-list"; list.setAttribute("role", "listbox"); list.hidden = true;
    wrap.append(btn, list);
    const opts = [...sel.options].filter((o) => o.value !== "");
    let active = -1;
    function sync() {
      const o = sel.options[sel.selectedIndex];
      btn.innerHTML = `<span>${o ? o.text : ""}</span>${CHEV}`;
      btn.classList.toggle("placeholder", !sel.value);
      list.innerHTML = opts.map((o, i) => `<div class="cs-opt${o.value === sel.value ? " sel" : ""}" role="option" data-i="${i}" aria-selected="${o.value === sel.value}">${o.text}</div>`).join("");
    }
    function mark(i) {
      active = i;
      list.querySelectorAll(".cs-opt").forEach((e, k) => { e.classList.toggle("act", k === i); if (k === i) e.scrollIntoView({ block: "nearest" }); });
    }
    function open() {
      all.forEach((c) => c !== api && c.close());
      list.hidden = false; wrap.classList.add("open"); btn.setAttribute("aria-expanded", "true");
      mark(Math.max(0, opts.findIndex((o) => o.value === sel.value)));
    }
    function close() { list.hidden = true; wrap.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); }
    function choose(i) {
      sel.value = opts[i].value;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
      sel.classList.remove("bad"); sync(); close(); btn.focus();
    }
    btn.addEventListener("click", () => (list.hidden ? open() : close()));
    list.addEventListener("click", (e) => { const o = e.target.closest(".cs-opt"); if (o) choose(+o.dataset.i); });
    list.addEventListener("mousemove", (e) => { const o = e.target.closest(".cs-opt"); if (o) mark(+o.dataset.i); });
    btn.addEventListener("keydown", (e) => {
      const k = e.key;
      if (list.hidden) { if (["ArrowDown", "ArrowUp", "Enter", " "].includes(k)) { e.preventDefault(); open(); } return; }
      if (k === "ArrowDown") { e.preventDefault(); mark(Math.min(opts.length - 1, active + 1)); }
      else if (k === "ArrowUp") { e.preventDefault(); mark(Math.max(0, active - 1)); }
      else if (k === "Enter" || k === " ") { e.preventDefault(); choose(active); }
      else if (k === "Escape") { e.stopPropagation(); close(); }
      else if (k === "Tab") close();
      else if (k.length === 1) { const i = opts.findIndex((o) => o.text.toLowerCase().startsWith(k.toLowerCase())); if (i >= 0) mark(i); }
    });
    document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) close(); });
    if (sel.form) sel.form.addEventListener("reset", () => setTimeout(sync));
    const api = { close };
    all.push(api); sync();
  }
  document.querySelectorAll("select").forEach(enhance);
})();

// ---------- Hero gallery: videos + photo (swipe, arrows, dots, keys); each video plays only while its slide is showing ----------
(function () {
  const sl = document.getElementById("slides"), pb = document.getElementById("vidBtn");
  if (!sl || !pb) return;
  const slides = [...sl.children], dots = [...document.querySelectorAll("#dots button")];
  const vids = slides.map((s) => s.querySelector("video"));
  const prev = document.getElementById("carPrev"), next = document.getElementById("carNext");
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const userPaused = slides.map(() => reduce);
  let idx = 0;
  const cur = () => vids[idx];
  const syncBtn = () => { const v = cur(); if (!v) return; pb.textContent = v.paused ? "▶" : "❚❚"; pb.setAttribute("aria-label", v.paused ? "Play video" : "Pause video"); };
  function show(i) {
    idx = Math.max(0, Math.min(slides.length - 1, i));
    sl.scrollTo({ left: idx * sl.clientWidth, behavior: reduce ? "auto" : "smooth" });
  }
  function onScroll() {
    const i = Math.round(sl.scrollLeft / sl.clientWidth);
    if (i === idx && dots[i] && dots[i].classList.contains("on")) return;
    idx = i;
    dots.forEach((d, k) => d.classList.toggle("on", k === i));
    prev.disabled = i === 0; next.disabled = i === slides.length - 1;
    pb.hidden = !vids[i];
    vids.forEach((v, k) => { if (!v) return; if (k === i) { if (!userPaused[k]) v.play().catch(() => {}); } else v.pause(); });
    syncBtn();
  }
  sl.addEventListener("scroll", () => requestAnimationFrame(onScroll), { passive: true });
  prev.addEventListener("click", () => show(idx - 1));
  next.addEventListener("click", () => show(idx + 1));
  dots.forEach((d, k) => d.addEventListener("click", () => show(k)));
  sl.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") { e.preventDefault(); show(idx + 1); } if (e.key === "ArrowLeft") { e.preventDefault(); show(idx - 1); } });
  pb.addEventListener("click", () => { const v = cur(); if (!v) return; if (v.paused) { userPaused[idx] = false; v.play(); } else { userPaused[idx] = true; v.pause(); } });
  vids.forEach((v) => { if (v) { v.addEventListener("play", syncBtn); v.addEventListener("pause", syncBtn); } });
  if (reduce) vids.forEach((v) => v && v.pause());
  window.addEventListener("resize", () => sl.scrollTo({ left: idx * sl.clientWidth }));
  onScroll(); syncBtn();
})();

// ---------- Liquid glass: the light on a panel follows the pointer ----------
(function () {
  if (window.matchMedia("(pointer: coarse)").matches) return;
  const sel = ".hero-text,.sec-head,.strip,.cols>div,.card,.modal,footer";
  let raf = 0;
  document.addEventListener("pointermove", (e) => {
    const el = e.target.closest && e.target.closest(sel);
    if (!el || raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", e.clientX - r.left + "px");
      el.style.setProperty("--my", e.clientY - r.top + "px");
    });
  }, { passive: true });
})();

// ---------- Background photo swap: photo 1 at the top, photo 2 over the shop, back to photo 1 for delivery ----------
(function () {
  const shop = document.getElementById("shop"), del = document.getElementById("delivery");
  if (!shop || !del) return;
  let raf = 0;
  const update = () => {
    raf = 0;
    const line = window.innerHeight * 0.55;
    const two = shop.getBoundingClientRect().top < line && del.getBoundingClientRect().top > line;
    document.body.classList.toggle("bg2", two);
  };
  window.addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
  window.addEventListener("resize", update); update();
})();
