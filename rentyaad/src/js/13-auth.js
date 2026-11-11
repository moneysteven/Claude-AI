/* ============ DEMO authentication ============
   Accounts live on this device only. Passwords are salted and hashed with SHA-256 (SubtleCrypto);
   plain passwords are never stored. A real server with a slow password hash is needed for production. */
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = s => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
const Bio = {
  avail: false,
  async check() { try { this.avail = !!(window.PublicKeyCredential && window.isSecureContext && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); } catch (e) { this.avail = false; } },
  label() { const ua = navigator.userAgent; if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "Face ID"; if (/Macintosh/.test(ua)) return "Touch ID"; if (/Android/.test(ua)) return "Fingerprint unlock"; if (/Windows/.test(ua)) return "Windows Hello"; return "Face ID / fingerprint"; },
  icon() { const l = this.label(); return l === "Face ID" || l.includes("/") ? "faceid" : "fingerprint"; },
  blocked(e) { return !e || e.name === "SecurityError" || e.name === "NotSupportedError" || /feature is not enabled|permissions policy|ancestor|not the same|cross-origin|not allowed in this context|publickey-credentials/i.test(e.message || ""); },
  async enroll(acc) {
    if (window.PublicKeyCredential && navigator.credentials && window.isSecureContext) {
      try {
        const cred = await navigator.credentials.create({ publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)), rp: { name: CONFIG.APP_NAME },
          user: { id: new TextEncoder().encode(acc.id + ":" + randHex(6)).slice(0, 64), name: acc.email || acc.phone, displayName: acc.name },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
          authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" }, timeout: 60000, attestation: "none" } });
        if (cred) { commit(() => { acc.biometric = { type: "webauthn", credId: b64url(cred.rawId), createdAt: jmNow() }; acc.bioOffered = true; }); haptic(20); toast(`${this.label()} is on`); return true; }
      } catch (e) { if (!this.blocked(e)) { toast(`${this.label()} wasn’t set up`, { tone: "warn" }); return false; } }
    }
    const ok = await this.simulate("enroll");
    if (ok) { commit(() => { acc.biometric = { type: "simulated", createdAt: jmNow() }; acc.bioOffered = true; }); toast(`${this.label()} is on (simulated in this preview)`); }
    return ok;
  },
  async verify(acc) {
    const b = acc?.biometric; if (!b) return false;
    if (b.type === "webauthn" && window.PublicKeyCredential && window.isSecureContext) {
      try {
        const got = await navigator.credentials.get({ publicKey: { challenge: crypto.getRandomValues(new Uint8Array(32)), allowCredentials: [{ type: "public-key", id: fromB64url(b.credId), transports: ["internal", "hybrid"] }], userVerification: "required", timeout: 60000 } });
        return !!got; // a real server would verify the signed assertion here
      } catch (e) { if (!this.blocked(e)) { toast(`${this.label()} didn’t match or was cancelled`, { tone: "warn" }); return false; } }
    }
    return this.simulate("verify");
  },
  simulate(mode) {
    return new Promise(resolve => {
      const label = this.label(); const ic = this.icon();
      const hud = document.createElement("div"); hud.className = "bio-hud"; hud.setAttribute("role", "dialog"); hud.setAttribute("aria-label", `Simulated ${label}`);
      hud.innerHTML = `<div class="bio-card scanning">${icon(ic, "big")}<b>${mode === "enroll" ? `Set up ${label}` : label}</b><span class="demo-label">Simulated · demo</span><small>The real ${label} prompt works on the live HTTPS site through WebAuthn. This preview can’t reach your device’s biometrics, so it’s simulated here.</small><button type="button" class="link" data-x="cancel">Cancel</button></div>`;
      $("#app").appendChild(hud); const card = hud.firstElementChild;
      if (!reduced()) { hud.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 }); card.animate([{ transform: "scale(.9)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 380, easing: EASE }); }
      let done = false;
      const finish = ok => { if (done) return; done = true; clearTimeout(t1); const out = () => { hud.remove(); resolve(ok); }; if (reduced()) return out(); hud.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: "forwards" }).finished.then(out, out); };
      hud.addEventListener("click", e => { if (e.target.closest('[data-x="cancel"]')) finish(false); });
      const t1 = setTimeout(() => { card.classList.remove("scanning"); card.classList.add("ok"); card.querySelector(".i.big").outerHTML = icon("checkCircle", "big"); card.querySelector("b").textContent = mode === "enroll" ? `${label} ready` : "Recognised"; haptic(25); setTimeout(() => finish(true), 650); }, reduced() ? 200 : 1500);
    });
  },
};

const Auth = {
  el: null, ctx: null, fails: 0, lockUntil: 0,
  init() { this.el = $("#auth"); this.el.addEventListener("click", e => { if (this.ctx) handleAct(e, this.ctx, this.ctx.el); }); this.el.addEventListener("input", e => { if (this.ctx) handleInput(e, this.ctx, "input"); }); this.el.addEventListener("change", e => { if (this.ctx) handleInput(e, this.ctx, "change"); }); this.el.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("input:not([type=checkbox])") && this.ctx?.view.submit) { e.preventDefault(); this.ctx.view.actions[this.ctx.view.submit]?.(e.target, this.ctx); } }); },
  show(screen, params = {}) { this.el.hidden = false; if (!reduced()) this.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 }); this.go(screen, params, 0); },
  hide() { if (this.el.hidden) return; const done = () => { this.el.hidden = true; this.el.innerHTML = ""; this.ctx = null; }; if (reduced()) return done(); this.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: "ease", fill: "forwards" }).finished.then(() => { done(); this.el.getAnimations().forEach(a => a.cancel()); }, done); },
  go(screen, params = {}, dir = 1) {
    const old = this.ctx?.el; const el = document.createElement("div"); el.className = "auth-screen";
    el.innerHTML = `<div class="auth-scroll"></div>`;
    const ctx = { view: screen, params, el, scroller: el.firstElementChild, local: screen.init ? screen.init(params) : {}, refresh: () => this.render(ctx) };
    this.ctx = ctx; this.el.appendChild(el); this.render(ctx);
    if (old) {
      if (reduced() || !dir) old.remove();
      else { const W = this.el.clientWidth; el.animate([{ transform: `translate3d(${dir > 0 ? W : -W * 0.3}px,0,0)` }, { transform: "none" }], { duration: 420, easing: EASE }); old.style.zIndex = dir > 0 ? 0 : 2; const a = old.animate([{ transform: "none" }, { transform: `translate3d(${dir > 0 ? -W * 0.3 : W}px,0,0)` }], { duration: 420, easing: EASE, fill: "forwards" }); a.finished.then(() => old.remove(), () => old.remove()); }
    }
  },
  render(ctx) { const y = ctx.scroller.scrollTop; ctx.scroller.innerHTML = ctx.view.render(ctx); hydrate(ctx.el); ctx.view.mount?.(ctx); ctx.scroller.scrollTop = y; },
  restore() {
    let id = S.session?.remember ? S.session.userId : null; let remembered = !!id;
    if (!id) { try { id = sessionStorage.getItem(CONFIG.SESSION_KEY); } catch (e) { id = null; } }
    const acc = id && getAcc(id); return acc ? { acc, remembered } : null;
  },
  enter(acc, o = {}) {
    CURRENT_USER_ID = acc.id; S.lastUserId = acc.id;
    if (o.remember) { S.session = { userId: acc.id, remember: true, at: jmNow() }; try { sessionStorage.removeItem(CONFIG.SESSION_KEY); } catch (e) { /* ignore */ } }
    else { S.session = null; try { sessionStorage.setItem(CONFIG.SESSION_KEY, acc.id); } catch (e) { /* session stays in memory */ } }
    if ((acc.businessIds || []).length) S.hostBizId = acc.businessIds.includes(acc.activeBizId) ? acc.activeBizId : acc.businessIds[0];
    let role = o.role || acc.lastRole || (acc.roles?.renter ? "customer" : "business");
    if (role === "business" && !acc.roles?.host) role = "customer";
    if (role === "customer" && !acc.roles?.renter) role = acc.roles?.host ? "business" : "customer";
    Store.save(); this.hide(); Nav.setRole(role);
    if (o.offerBio && !acc.biometric && !acc.bioOffered) setTimeout(() => offerBiometric(acc), 650);
  },
  signOut(silent) {
    CURRENT_USER_ID = null; S.session = null; try { sessionStorage.removeItem(CONFIG.SESSION_KEY); } catch (e) { /* ignore */ }
    Store.save(); Nav.reset(); this.show(WelcomeScreen); if (!silent) toast("Signed out");
  },
  deleteAccount() {
    const a = me(); if (a.id === "guest") return;
    commit(st => { for (const bk of st.bookings) if (bk.customerId === a.id) { bk.customerId = "deleted"; bk.guest = { name: "Deleted user", from: "" }; } for (const b of st.businesses) if (b.ownerId === a.id) b.ownerId = null; st.accounts = st.accounts.filter(x => x.id !== a.id); if (st.lastUserId === a.id) st.lastUserId = null; }, { render: false });
    this.signOut(true); toast("Account deleted from this device");
  },
};
async function ensureDemoPassword() { for (const a of S.accounts || []) if (a.demo && !a.passHash) { a.salt = a.salt || "demo-" + randHex(8); a.passHash = await hashPassword(CONFIG.DEMO_PASSWORD, a.salt); } }
function findAccount(ident) { const id = String(ident || "").trim(); if (!id) return null; if (id.includes("@")) return S.accounts.find(a => a.email === id.toLowerCase()) || null; const k = phoneKey(id); return k.length >= 7 ? S.accounts.find(a => phoneKey(a.phone) === k) || null : null; }
function requestRole(role) {
  const a = me();
  if (role === "business" && !a.roles?.host) { openBecomeHost(); return; }
  if (role === "customer" && !a.roles?.renter) { a.roles.renter = true; Store.save(); toast("Renter mode is on"); }
  haptic(6); Nav.setRole(role);
}
function offerBiometric(acc) {
  if (!acc || acc.biometric) return;
  commit(() => { acc.bioOffered = true; }, { render: false });
  Sheets.open({ title: "", size: "auto",
    render: () => `<div style="text-align:center;padding:8px 6px 4px;display:flex;flex-direction:column;align-items:center;gap:10px">${icon(Bio.icon(), "lg")}<h2 style="font-size:22px;font-weight:700;letter-spacing:-.03em">Turn on ${Bio.label()}?</h2><p class="muted" style="max-width:32ch">Unlock ${esc(CONFIG.APP_NAME)} with your face or fingerprint instead of typing your password. Your biometric data never leaves your device.</p>${Bio.avail ? "" : `<span class="demo-label">Simulated in this preview</span>`}</div>`,
    mount: s => { const i = s.body.querySelector(".i.lg"); if (i) { i.style.width = "56px"; i.style.height = "56px"; i.style.strokeWidth = "1.2"; } },
    footer: () => `<div class="btn-row"><button type="button" class="btn plain press" data-act="close">Not now</button><button type="button" class="btn press" data-act="on">Turn on</button></div>`,
    actions: { on: async (t, s) => { s.close(); await Bio.enroll(acc); Nav.invalidate(); } } });
}
function openTerms() {
  Sheets.open({ title: "Terms & privacy (demo)", size: "large",
    render: () => `<div class="group pad"><p><b>Demo only.</b> ${esc(CONFIG.APP_NAME)} is a prototype. Every host, vehicle, price, booking and review is sample data.</p><p>Accounts are stored on this device. Passwords are salted and hashed with SHA-256 and never stored in plain text. A production app needs a server, secure password hashing (for example Argon2 or bcrypt), and a privacy policy that meets the Jamaica Data Protection Act.</p><p>Payments are simulated. No card numbers are stored or sent. Live payments would go through a licensed Jamaican-supported processor.</p><p>Renters must hold a valid driver’s licence and meet each vehicle’s minimum age. Hosts must keep vehicles insured and roadworthy.</p></div>` });
}
function pwMeterHTML(pw) { const s = pwStrength(pw || ""); return `<div class="pw-meter l${s.level}" aria-hidden="true"><i></i><i></i><i></i><i></i></div><div class="pw-label"><span>${pw ? s.label : "8+ characters with letters and numbers"}</span><span>${pw && !s.ok ? "Add letters and numbers" : ""}</span></div>`; }
function pwField(id, val, label = "Password", act = "eye", show = false, auto = "current-password") {
  return `<div class="field" data-f="${id}"><label for="${id}">${label}</label><div class="inp">${icon("lock")}<input id="${id}" type="${show ? "text" : "password"}" value="${esc(val)}" data-input="${id}" autocomplete="${auto}" placeholder="••••••••"><button type="button" class="eye" data-act="${act}" data-for="${id}" aria-label="${show ? "Hide" : "Show"} password">${icon(show ? "eyeOff" : "eye")}</button></div><span class="ferr"></span></div>`;
}
function setFieldErrors(ctx, errs) {
  for (const f of $$(".field[data-f]", ctx.el)) { const m = errs[f.dataset.f]; f.classList.toggle("err", !!m); const e = f.querySelector(".ferr"); if (e) e.textContent = m || ""; }
  const first = Object.keys(errs)[0]; if (first) { const f = ctx.el.querySelector(`.field[data-f="${first}"]`); const sc = ctx.scroller; if (f && sc) { const r = f.getBoundingClientRect(), sr = sc.getBoundingClientRect(); sc.scrollTo({ top: sc.scrollTop + r.top - sr.top - sr.height / 3, behavior: reduced() ? "auto" : "smooth" }); } haptic(20); if (!reduced()) f?.animate([{ transform: "translateX(0)" }, { transform: "translateX(6px)" }, { transform: "translateX(-5px)" }, { transform: "translateX(0)" }], { duration: 280 }); }
}
const backBtn = () => `<div class="auth-top"><button type="button" class="auth-back press" data-act="back" aria-label="Back">${icon("chevL")}</button><span class="demo-label">Demo authentication</span></div>`;

const WelcomeScreen = {
  render() {
    const hero = getV("v16") || S.vehicles[0]; const last = S.lastUserId && getAcc(S.lastUserId);
    return `<div class="welcome-hero"><img src="${artURL(hero, 1)}" alt="Sample render of a vehicle at dusk"><div class="wh-brand"><span class="brand-mark">${BRAND_SVG}</span><span class="brand-name">${esc(CONFIG.APP_NAME)}</span><span class="demo-pill">Demo</span></div></div>
      <div class="welcome-body">
        <h1 class="auth-title">Rent the right ride, anywhere in Jamaica.</h1>
        <p class="auth-sub">Cars, SUVs, vans and scooters from trusted local hosts, in every parish.</p>
        ${last?.biometric ? `<button type="button" class="btn block ink press bio-btn" data-act="bioLogin">${icon(Bio.icon())}Sign in as ${esc(last.name.split(" ")[0])} with ${Bio.label()}</button><div class="or-sep">or</div>` : ""}
        <button type="button" class="role-card primary press" data-act="signup" data-role="renter"><span class="rc-ico">${icon("key")}</span><span class="rc-txt"><b>Continue as Renter</b><small>Find and book a vehicle</small></span>${icon("chevR", "muted")}</button>
        <button type="button" class="role-card press" data-act="signup" data-role="host"><span class="rc-ico">${icon("store")}</span><span class="rc-txt"><b>Continue as Host</b><small>List your vehicles and earn</small></span>${icon("chevR", "muted")}</button>
        <p class="auth-alt">Already have an account? <button type="button" class="link" data-act="login" style="padding:0">Log in</button></p>
        <div class="demo-box"><b>Demo authentication.</b> Accounts and password hashes are stored on this device only. A real server is needed for production.<br>Demo account: <b>${CONFIG.DEMO_EMAIL}</b> / <b>${CONFIG.DEMO_PASSWORD}</b> (renter and host of the sample businesses).<button type="button" class="btn block plain press" data-act="demo">Continue with the demo account</button></div>
      </div>`;
  },
  actions: {
    signup: t => Auth.go(SignupScreen, { role: t.dataset.role }),
    login: () => Auth.go(LoginScreen, {}),
    demo: () => { const a = S.accounts.find(x => x.demo); if (!a) { toast("Demo account was deleted. Reset the demo to restore it.", { tone: "warn" }); return; } Auth.enter(a, { remember: true, offerBio: true }); toast(`Signed in as ${a.name} (demo)`); },
    bioLogin: async () => { const a = getAcc(S.lastUserId); if (a && await Bio.verify(a)) Auth.enter(a, { remember: true }); },
  },
};

const SignupScreen = {
  submit: "create",
  init: p => ({ role: p.role || "renter", name: "", phone: "", email: "", pw: "", show: false, parish: "", terms: false, remember: true, kind: "business", hostName: "", idImg: "", payout: "later", busy: false }),
  render(ctx) {
    const L = ctx.local; const host = L.role === "host";
    return `${backBtn()}
      <h1 class="auth-title">${host ? "Create your host account" : "Create your account"}</h1>
      <p class="auth-sub">${host ? "List vehicles, set your prices and payment options, and manage bookings." : "Book vehicles from local hosts across Jamaica."} You can switch to ${host ? "renting" : "hosting"} later with the same account.</p>
      <div class="field" data-f="name"><label for="su_name">Full name</label><div class="inp">${icon("user")}<input id="su_name" value="${esc(L.name)}" data-input="name" autocomplete="name" placeholder="As on your licence"></div><span class="ferr"></span></div>
      <div class="field" data-f="phone"><label for="su_phone">Phone</label><div class="inp">${icon("phone")}<input id="su_phone" type="tel" inputmode="tel" value="${esc(L.phone)}" data-input="phone" autocomplete="tel" placeholder="+1 876-XXX-XXXX"></div><span class="ferr"></span></div>
      <div class="field" data-f="email"><label for="su_email">Email</label><div class="inp">${icon("mail")}<input id="su_email" type="email" inputmode="email" value="${esc(L.email)}" data-input="email" autocomplete="email" placeholder="you@example.com"></div><span class="ferr"></span></div>
      ${pwField("pw", L.pw, "Password", "eye", L.show, "new-password")}<div id="pwMeter" style="margin:-8px 0 14px">${pwMeterHTML(L.pw)}</div>
      <div class="field" data-f="parish"><span class="lab">Parish</span><button type="button" class="select-btn press" data-act="parish">${L.parish ? `<span>${esc(L.parish)}</span>` : `<span class="sel-ph">Choose your parish</span>`}${icon("chevD")}</button><span class="ferr"></span></div>
      ${host ? `<h3 class="group-title" style="margin-top:18px">Hosting details</h3>
        ${seg("kind", [{ v: "business", label: "Business" }, { v: "individual", label: "Individual" }], L.kind, "block")}<div style="height:12px"></div>
        <div class="field" data-f="hostName"><label for="su_host">${L.kind === "business" ? "Business name" : "Name shown to renters"}</label><div class="inp">${icon("store")}<input id="su_host" value="${esc(L.hostName)}" data-input="hostName" placeholder="${L.kind === "business" ? "e.g. Island Wheels Ltd" : "e.g. Marcia’s Rentals"}"></div><span class="ferr"></span></div>
        <div class="field"><span class="lab">ID verification</span><label class="upload-tile press"><span class="ut-img">${L.idImg ? `<img src="${L.idImg}" alt="">` : icon("idcard")}</span><div class="ut-txt"><b>${L.idImg ? "Licence photo added" : "Upload your driver’s licence"}</b><span>Placeholder in this demo · reviewed by the admin</span></div><input type="file" accept="image/*" capture="environment" data-change="id"></label></div>
        <div class="field"><span class="lab">Payout preference (optional)</span>${seg("payout", PAYOUT_OPTIONS, L.payout, "block")}</div>` : ""}
      <label class="check-line" data-f="terms"><input type="checkbox" data-change="terms" ${L.terms ? "checked" : ""}><span class="check-box">${icon("check")}</span><span>I agree to the <button type="button" class="link" data-act="terms" style="padding:0;font-size:14px">Terms and Privacy Policy</button> (demo).</span></label>
      <div class="group" style="margin-bottom:18px"><label class="row"><span class="lbl"><b>Remember me</b><small>Stay signed in on this device</small></span>${switchEl("su_rem", L.remember, 'data-change="remember"', "Remember me")}</label></div>
      <div id="suErr"></div>
      <button type="button" class="btn block press ${L.busy ? "loading" : ""}" data-act="create">${host ? "Create host account" : "Create account"}</button>
      <p class="auth-alt">Already have an account? <button type="button" class="link" data-act="login" style="padding:0">Log in</button></p>`;
  },
  inputs: {
    name: (t, ctx) => { ctx.local.name = t.value; }, email: (t, ctx) => { ctx.local.email = t.value; }, hostName: (t, ctx) => { ctx.local.hostName = t.value; },
    phone: (t, ctx) => { const f = formatPhone(t.value); if (f !== t.value && !t.value.endsWith("-")) t.value = f; ctx.local.phone = t.value; },
    pw: (t, ctx) => { ctx.local.pw = t.value; ctx.el.querySelector("#pwMeter").innerHTML = pwMeterHTML(t.value); },
    terms: (t, ctx) => { ctx.local.terms = t.checked; }, remember: (t, ctx) => { ctx.local.remember = t.checked; },
    id: async (t, ctx) => { const f = t.files[0]; if (!f) return; try { ctx.local.idImg = await readImage(f, 1000, 0.75); Auth.render(ctx); toast("Licence photo added"); } catch (e) { toast(e.message, { tone: "warn" }); } },
  },
  onSeg: (ctx, name, v) => { ctx.local[name] = v; if (name === "kind") Auth.render(ctx); },
  actions: {
    back: () => Auth.go(WelcomeScreen, {}, -1),
    login: () => Auth.go(LoginScreen, {}, 1),
    terms: (t, ctx, e) => { e.preventDefault(); openTerms(); },
    eye: (t, ctx) => { ctx.local.show = !ctx.local.show; const inp = ctx.el.querySelector("#pw"); inp.type = ctx.local.show ? "text" : "password"; t.innerHTML = icon(ctx.local.show ? "eyeOff" : "eye"); },
    parish: async (t, ctx) => { const r = await pickParish(ctx.local.parish); if (r) { ctx.local.parish = r; t.innerHTML = `<span>${esc(r)}</span>${icon("chevD")}`; ctx.el.querySelector('.field[data-f="parish"]').classList.remove("err"); } },
    create: async (t, ctx) => {
      const L = ctx.local; if (L.busy) return; const e = {};
      if (L.name.trim().length < 2 || !/\s/.test(L.name.trim())) e.name = "Enter your first and last name.";
      if (!validJmPhone(L.phone)) e.phone = "Use a Jamaican number: +1 876-XXX-XXXX (or 658).";
      else if (S.accounts.some(a => phoneKey(a.phone) === phoneKey(L.phone))) e.phone = "An account already uses this phone. Log in instead.";
      if (!validEmail(L.email)) e.email = "Enter a valid email address.";
      else if (S.accounts.some(a => a.email === L.email.trim().toLowerCase())) e.email = "An account already uses this email. Log in instead.";
      const ps = pwStrength(L.pw); if (!ps.ok) e.pw = "Use 8+ characters with letters and numbers.";
      if (!L.parish) e.parish = "Choose your parish.";
      if (L.role === "host" && L.hostName.trim().length < 2) e.hostName = "Add your business or host name.";
      setFieldErrors(ctx, e);
      const box = ctx.el.querySelector("#suErr"); box.innerHTML = !Object.keys(e).length && !L.terms ? `<div class="auth-error fade-in">${icon("alert")}<span>Agree to the terms to continue.</span></div>` : "";
      if (Object.keys(e).length || !L.terms) { if (!L.terms && !Object.keys(e).length) haptic(20); return; }
      L.busy = true; t.classList.add("loading");
      const salt = randHex(16); const passHash = await hashPassword(L.pw, salt); L.pw = "";
      const host = L.role === "host";
      const acc = { id: uid("u_"), name: L.name.trim().replace(/\s+/g, " "), email: L.email.trim().toLowerCase(), phone: formatPhone(L.phone), salt, passHash, parish: L.parish,
        roles: { renter: !host, host }, businessIds: [], activeBizId: null, avatar: "", createdAt: jmNow(), verified: { email: false, phone: false, id: L.idImg ? "submitted" : "none" },
        licence: "", licenceExpiry: "", age: 25, favs: [], biometric: null, bioOffered: false, demo: false, hostKind: L.kind, hostName: host ? L.hostName.trim() : "", payout: L.payout, idDoc: { img: L.idImg, status: L.idImg ? "submitted" : "none" }, lastRole: host ? "business" : "customer" };
      commit(st => { st.accounts.push(acc); if (host) { const d = newBusinessDraft(acc); d.name = acc.hostName; d.kind = L.kind; d.parish = L.parish; d.town = PARISH_TOWNS[L.parish][0][0]; createBusinessFor(acc, d); } }, { render: false });
      haptic(20); Auth.enter(acc, { remember: L.remember, offerBio: true });
      toast(host ? "Host account created. Your business is awaiting approval." : `Welcome, ${acc.name.split(" ")[0]}`, { ms: 2800 });
    },
  },
};

const LoginScreen = {
  submit: "go",
  init: p => ({ ident: p.ident || "", pw: "", show: false, remember: true, busy: false }),
  render(ctx) {
    const L = ctx.local; const last = S.lastUserId && getAcc(S.lastUserId);
    return `${backBtn()}
      <h1 class="auth-title">Welcome back</h1>
      <p class="auth-sub">Log in with your email or phone number.</p>
      <div id="liErr"></div>
      <div class="field" data-f="ident"><label for="li_id">Email or phone</label><div class="inp">${icon("user")}<input id="li_id" value="${esc(L.ident)}" data-input="ident" autocomplete="username" placeholder="you@example.com or +1 876-…"></div><span class="ferr"></span></div>
      ${pwField("pw", L.pw, "Password", "eye", L.show)}
      <div style="display:flex;justify-content:flex-end;margin:-6px 0 12px"><button type="button" class="link" data-act="forgot" style="padding:4px 0">Forgot password?</button></div>
      <div class="group" style="margin-bottom:18px"><label class="row"><span class="lbl"><b>Remember me</b><small>Stay signed in on this device</small></span>${switchEl("li_rem", L.remember, 'data-change="remember"', "Remember me")}</label></div>
      <button type="button" class="btn block press ${L.busy ? "loading" : ""}" data-act="go">Log in</button>
      ${last?.biometric ? `<div class="or-sep">or</div><button type="button" class="btn block plain press bio-btn" data-act="bio">${icon(Bio.icon())}Use ${Bio.label()} for ${esc(last.name.split(" ")[0])}</button>` : ""}
      <p class="auth-alt">New here? <button type="button" class="link" data-act="signup" style="padding:0">Create an account</button></p>
      <p class="fineprint">Demo account: ${CONFIG.DEMO_EMAIL} / ${CONFIG.DEMO_PASSWORD}</p>`;
  },
  inputs: { ident: (t, ctx) => { ctx.local.ident = t.value; }, pw: (t, ctx) => { ctx.local.pw = t.value; }, remember: (t, ctx) => { ctx.local.remember = t.checked; } },
  actions: {
    back: () => Auth.go(WelcomeScreen, {}, -1),
    signup: () => Auth.go(SignupScreen, { role: "renter" }),
    forgot: (t, ctx) => Auth.go(ForgotScreen, { ident: ctx.local.ident }),
    eye: (t, ctx) => { ctx.local.show = !ctx.local.show; const inp = ctx.el.querySelector("#pw"); inp.type = ctx.local.show ? "text" : "password"; t.innerHTML = icon(ctx.local.show ? "eyeOff" : "eye"); },
    bio: async () => { const a = getAcc(S.lastUserId); if (a && await Bio.verify(a)) Auth.enter(a, { remember: true }); },
    go: async (t, ctx) => {
      const L = ctx.local; if (L.busy) return; const box = ctx.el.querySelector("#liErr"); const show = m => { box.innerHTML = `<div class="auth-error fade-in">${icon("alert")}<span>${esc(m)}</span></div>`; haptic(20); };
      if (Date.now() < Auth.lockUntil) { show(`Too many attempts. Try again in ${Math.ceil((Auth.lockUntil - Date.now()) / 1000)} seconds.`); return; }
      const e = {}; if (!L.ident.trim()) e.ident = "Enter your email or phone."; if (!L.pw) e.pw = "Enter your password."; setFieldErrors(ctx, e); if (Object.keys(e).length) return;
      const acc = findAccount(L.ident);
      L.busy = true; t.classList.add("loading");
      const ok = acc && (await hashPassword(L.pw, acc.salt)) === acc.passHash;
      L.busy = false; t.classList.remove("loading");
      if (!ok) { Auth.fails++; if (Auth.fails >= 5) { Auth.lockUntil = Date.now() + 30000; Auth.fails = 0; } show(acc ? "That password isn’t right. Try again or reset it." : "We couldn’t find an account with that email or phone."); return; }
      Auth.fails = 0; L.pw = ""; haptic(15);
      Auth.enter(acc, { remember: L.remember, offerBio: true }); toast(`Welcome back, ${acc.name.split(" ")[0]}`);
    },
  },
};

const ForgotScreen = {
  submit: "next",
  init: p => ({ step: "id", ident: p.ident || "", code: "", sent: "", pw: "", show: false, acc: null }),
  render(ctx) {
    const L = ctx.local;
    if (L.step === "id") return `${backBtn()}<h1 class="auth-title">Reset your password</h1><p class="auth-sub">Enter the email or phone on your account and we’ll send a 6-digit code.</p><div id="fgErr"></div>
      <div class="field" data-f="ident"><label for="fg_id">Email or phone</label><div class="inp">${icon("user")}<input id="fg_id" value="${esc(L.ident)}" data-input="ident" autocomplete="username"></div><span class="ferr"></span></div>
      <button type="button" class="btn block press" data-act="next">Send code</button>`;
    if (L.step === "code") return `${backBtn()}<h1 class="auth-title">Enter the code</h1><p class="auth-sub">We sent a 6-digit code to ${esc(L.acc.email.includes("@") && L.ident.includes("@") ? L.acc.email : L.acc.phone)}.</p>
      <div class="mock-banner" style="margin-bottom:14px">${icon("info")}<span><b>Demo:</b> no email or SMS is really sent. Your code is <b class="tnum" style="letter-spacing:.12em">${L.sent}</b>.</span></div>
      <div id="fgErr"></div><div class="otp" role="group" aria-label="6-digit code">${Array.from({ length: 6 }, (_, i) => `<input inputmode="numeric" autocomplete="${i ? "off" : "one-time-code"}" data-input="otp" data-i="${i}" aria-label="Digit ${i + 1}" value="${L.code[i] || ""}">`).join("")}</div>
      <button type="button" class="btn block press" data-act="next">Verify code</button><p class="auth-alt"><button type="button" class="link" data-act="resend" style="padding:0">Send a new code</button></p>`;
    return `${backBtn()}<h1 class="auth-title">Choose a new password</h1><p class="auth-sub">For ${esc(L.acc.email)}.</p><div id="fgErr"></div>
      ${pwField("pw", L.pw, "New password", "eye", L.show, "new-password")}<div id="pwMeter" style="margin:-8px 0 14px">${pwMeterHTML(L.pw)}</div>
      <button type="button" class="btn block press" data-act="next">Save new password</button>`;
  },
  mount(ctx) { const first = ctx.el.querySelector(".otp input"); if (first && !reduced()) setTimeout(() => first.focus(), 450); },
  inputs: {
    ident: (t, ctx) => { ctx.local.ident = t.value; },
    pw: (t, ctx) => { ctx.local.pw = t.value; ctx.el.querySelector("#pwMeter").innerHTML = pwMeterHTML(t.value); },
    otp: (t, ctx) => {
      const boxes = $$(".otp input", ctx.el); const i = +t.dataset.i; const d = digits(t.value);
      if (d.length > 1) { d.slice(0, 6 - i).split("").forEach((c, k) => { boxes[i + k].value = c; }); boxes[Math.min(5, i + d.length - 1)].focus(); }
      else { t.value = d; if (d && i < 5) boxes[i + 1].focus(); }
      ctx.local.code = boxes.map(b => b.value).join("");
      if (ctx.local.code.length === 6) ForgotScreen.actions.next(null, ctx);
    },
  },
  actions: {
    back: (t, ctx) => { const L = ctx.local; if (L.step === "id") Auth.go(LoginScreen, { ident: L.ident }, -1); else { L.step = L.step === "new" ? "code" : "id"; Auth.render(ctx); } },
    resend: (t, ctx) => { ctx.local.sent = String(100000 + Math.floor(Math.random() * 900000)); ctx.local.code = ""; Auth.render(ctx); toast("New code sent (demo)"); },
    eye: (t, ctx) => { ctx.local.show = !ctx.local.show; const inp = ctx.el.querySelector("#pw"); inp.type = ctx.local.show ? "text" : "password"; t.innerHTML = icon(ctx.local.show ? "eyeOff" : "eye"); },
    next: async (t, ctx) => {
      const L = ctx.local; const box = ctx.el.querySelector("#fgErr"); const err = m => { box.innerHTML = `<div class="auth-error fade-in">${icon("alert")}<span>${esc(m)}</span></div>`; haptic(20); };
      if (L.step === "id") { const acc = findAccount(L.ident); if (!acc) { err("We couldn’t find an account with that email or phone."); return; } L.acc = acc; L.sent = String(100000 + Math.floor(Math.random() * 900000)); L.step = "code"; Auth.render(ctx); return; }
      if (L.step === "code") { if (L.code !== L.sent) { err("That code doesn’t match. Check the demo code above."); $$(".otp input", ctx.el).forEach(b => { b.value = ""; }); L.code = ""; ctx.el.querySelector(".otp input")?.focus(); return; } L.step = "new"; Auth.render(ctx); return; }
      if (!pwStrength(L.pw).ok) { err("Use 8+ characters with letters and numbers."); return; }
      const salt = randHex(16); const h = await hashPassword(L.pw, salt); L.pw = "";
      commit(() => { L.acc.salt = salt; L.acc.passHash = h; }, { render: false });
      toast("Password updated. Log in with your new password."); Auth.go(LoginScreen, { ident: L.acc.email }, -1);
    },
  },
};

const LockScreen = {
  init: p => ({ acc: p.acc }),
  render(ctx) {
    const a = ctx.local.acc;
    return `<div class="lock-wrap"><span class="brand-mark" style="width:44px;height:44px;border-radius:12px;margin-bottom:18px">${BRAND_SVG}</span>
      <div class="lock-avatar">${a.avatar ? `<img src="${a.avatar}" alt="">` : esc(initials(a.name))}</div>
      <h1 class="auth-title" style="margin:8px 0 0">Welcome back, ${esc(a.name.split(" ")[0])}</h1><p class="auth-sub">${esc(CONFIG.APP_NAME)} is locked.</p>
      <button type="button" class="btn ink press bio-btn" data-act="unlock" style="min-width:260px">${icon(Bio.icon())}Unlock with ${Bio.label()}</button>
      <button type="button" class="link" data-act="pw">Use password instead</button>
      <button type="button" class="link plain" data-act="out" style="margin-top:16px">Not ${esc(a.name.split(" ")[0])}? Sign out</button>
      ${a.biometric?.type === "simulated" ? `<span class="demo-label" style="margin-top:10px">${Bio.label()} is simulated in this preview</span>` : ""}</div>`;
  },
  actions: {
    unlock: async (t, ctx) => { const a = ctx.local.acc; if (await Bio.verify(a)) { Auth.enter(a, { remember: true }); toast(`Unlocked with ${Bio.label()}`); } },
    pw: (t, ctx) => Auth.go(LoginScreen, { ident: ctx.local.acc.email }),
    out: () => { S.session = null; Store.save(); Auth.go(WelcomeScreen, {}, -1); },
  },
};

function openChangePassword() {
  const a = me(); const L = { cur: "", pw: "" };
  Sheets.open({ title: "Change password", size: "auto",
    render: () => `<div id="cpErr"></div><div class="field"><label for="cp_cur">Current password</label><input id="cp_cur" class="input" type="password" data-input="cur" autocomplete="current-password"></div><div class="field"><label for="cp_new">New password</label><input id="cp_new" class="input" type="password" data-input="pw" autocomplete="new-password"></div><div id="cpMeter">${pwMeterHTML("")}</div>`,
    inputs: { cur: t => { L.cur = t.value; }, pw: (t, s) => { L.pw = t.value; s.body.querySelector("#cpMeter").innerHTML = pwMeterHTML(t.value); } },
    footer: () => `<button type="button" class="btn block press" data-act="save">Update password</button>`,
    actions: { save: async (t, s) => {
      const box = s.body.querySelector("#cpErr"); const err = m => { box.innerHTML = `<div class="auth-error fade-in">${icon("alert")}<span>${esc(m)}</span></div>`; haptic(20); };
      if ((await hashPassword(L.cur, a.salt)) !== a.passHash) { err("Your current password isn’t right."); return; }
      if (!pwStrength(L.pw).ok) { err("Use 8+ characters with letters and numbers."); return; }
      const salt = randHex(16); const h = await hashPassword(L.pw, salt); L.cur = L.pw = "";
      commit(() => { a.salt = salt; a.passHash = h; }, { render: false }); s.close(); toast("Password updated");
    } } });
}
