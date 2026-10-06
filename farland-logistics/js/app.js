(function(){
  const C = window.FARLAND, $ = s => document.querySelector(s);
  // shared: mobile menu, whatsapp float, contact links
  const m = $(".menu"); if(m) m.onclick = () => $("header nav").classList.toggle("open");
  document.querySelectorAll("[data-wa]").forEach(a => a.href = "https://wa.me/" + C.whatsapp);
  document.querySelectorAll("[data-email]").forEach(a => {a.href = "mailto:" + C.email; a.textContent = a.textContent || C.email;});
  document.querySelectorAll("[data-phone]").forEach(a => a.textContent = C.phone);
  const addr = $("#addr"); if(addr) addr.textContent = [C.miami.line1, C.miami.line2, C.miami.country].join("\n");
  document.querySelectorAll("[data-year]").forEach(e => e.textContent = new Date().getFullYear());

  // quick track box -> shows pre-alert link (no live carrier API in static build)
  const tf = $("#trackForm");
  if(tf) tf.onsubmit = e => { e.preventDefault(); const v = $("#trackNo").value.trim(); if(v) location.href = "prealert.html?tracking=" + encodeURIComponent(v); };

  // calculator
  const w = $("#weight");
  if(w){ const out = $("#cost"), upd = () => {
      const lb = Math.max(parseFloat(w.value)||0, 0), usd = lb ? Math.max(lb*C.ratePerLb, C.minimumCharge) : 0;
      out.textContent = "$" + usd.toFixed(2) + " USD";
      $("#costJmd").textContent = "≈ J$" + Math.round(usd*C.usdToJmd).toLocaleString() + " · estimate before duty/GCT";
    }; w.oninput = upd; upd(); }

  // pre-alert form
  const f = $("#prealertForm"); if(!f) return;
  const p = new URLSearchParams(location.search);
  if(p.get("tracking")) f.tracking.value = p.get("tracking");
  if(p.get("store")) f.store.value = p.get("store");
  try { const s = JSON.parse(localStorage.getItem("farlandCustomer")||"{}"); ["name","phone","email","mailbox"].forEach(k => { if(s[k] && f[k]) f[k].value = s[k]; }); } catch(e){}

  function courier(t){
    t = t.replace(/\s/g,"").toUpperCase();
    if(/^1Z[0-9A-Z]{16}$/.test(t)) return "UPS";
    if(/^TBA\d+/.test(t)) return "Amazon Logistics";
    if(/^(94|93|92|95)\d{18,20}$/.test(t)) return "USPS";
    if(/^(\d{12}|\d{15}|\d{20})$/.test(t)) return "FedEx";
    if(/^(JD|JJD)\d+/.test(t) || /^\d{10}$/.test(t)) return "DHL";
    return "";
  }
  f.tracking.addEventListener("input", () => {
    const c = courier(f.tracking.value), el = $("#courier");
    el.innerHTML = c ? '<span class="chip">Detected: ' + c + '</span>' : "";
    f.courier.value = c;
  });
  if(f.tracking.value) f.tracking.dispatchEvent(new Event("input"));

  f.onsubmit = async e => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(f).entries()); delete d.invoice;
    d.submitted = new Date().toISOString();
    try { localStorage.setItem("farlandCustomer", JSON.stringify({name:d.name,phone:d.phone,email:d.email,mailbox:d.mailbox})); } catch(e){}
    const text = ["NEW PRE-ALERT — Farland Logistics","Name: "+d.name,"Mailbox #: "+(d.mailbox||"n/a"),"Phone: "+d.phone,"Email: "+d.email,
      "Store: "+d.store,"Tracking: "+d.tracking+(d.courier?" ("+d.courier+")":""),"Items: "+d.description,"Value: $"+d.value,"Notes: "+(d.notes||"-")].join("\n");
    let sent = false;
    if(C.formEndpoint){
      try { const r = await fetch(C.formEndpoint,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(d)}); sent = r.ok; } catch(e){}
    }
    f.style.display = "none"; $("#success").style.display = "block";
    $("#ref").textContent = "FL-" + Date.now().toString(36).toUpperCase().slice(-6);
    $("#sendWa").href = "https://wa.me/" + C.whatsapp + "?text=" + encodeURIComponent(text);
    $("#sendMail").href = "mailto:" + C.email + "?subject=" + encodeURIComponent("Pre-Alert: " + d.tracking) + "&body=" + encodeURIComponent(text);
    $("#fallback").style.display = sent ? "none" : "block";
    $("#sentMsg").style.display = sent ? "block" : "none";
    window.scrollTo({top:0,behavior:"smooth"});
  };
})();
