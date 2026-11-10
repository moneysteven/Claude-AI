/*!
 * Conroy chat + booking widget (Steven Scale Solutions)
 * Embed: <script src="https://APP_DOMAIN/widget.js" data-business="SLUG" defer></script>
 * Optional: data-position="left", data-open="book"
 * No dependencies. Renders inside a Shadow DOM so the host site's CSS can't break it.
 * Motion follows the visitor's "reduce motion" setting.
 */
(function () {
  "use strict";
  var script = document.currentScript || document.querySelector("script[data-business][src*='widget.js']");
  if (!script || window.__conroyWidgetLoaded) return;
  window.__conroyWidgetLoaded = true;

  var slug = script.getAttribute("data-business");
  if (!slug) return;
  var base = new URL(script.src, location.href).origin;
  var api = base + "/api/public/" + encodeURIComponent(slug);
  var side = script.getAttribute("data-position") === "left" ? "left" : "right";
  var TZ = "America/Jamaica";
  var storeKey = "conroy:" + slug;
  var reduceMotion = false;
  try { reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { reduceMotion = false; }

  function store(key, value) {
    try {
      if (value === undefined) return JSON.parse(localStorage.getItem(storeKey + ":" + key) || "null");
      localStorage.setItem(storeKey + ":" + key, JSON.stringify(value));
    } catch (e) {
      return null;
    }
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        if (k === "text") node.textContent = attrs[k];
        else if (k === "class") node.className = attrs[k];
        else if (k.indexOf("on") === 0) node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== false && attrs[k] != null) node.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
      }
    }
    (children || []).forEach(function (c) {
      if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  // Inline SVG icons (static markup, never user content).
  var ICON = {
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.4-5.1A8.5 8.5 0 1 1 21 12z"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/></svg>',
    check: '<svg viewBox="0 0 52 52" aria-hidden="true"><circle class="ring" cx="26" cy="26" r="23" fill="none"/><path class="tick" fill="none" d="M15 27l7.5 7.5L38 18.5"/></svg>',
  };
  function icon(name, cls) {
    var span = el("span", { class: cls || "ico", "aria-hidden": "true" });
    span.innerHTML = ICON[name];
    return span;
  }

  // Assistant text -> nodes, turning http(s) links into anchors. Never uses innerHTML.
  function richText(text) {
    var frag = document.createDocumentFragment();
    var parts = String(text).split(/(https?:\/\/[^\s<>"']+)/g);
    parts.forEach(function (p, i) {
      if (i % 2 === 1) frag.appendChild(el("a", { href: p, target: "_blank", rel: "noopener noreferrer", text: p }));
      else if (p) frag.appendChild(document.createTextNode(p));
    });
    return frag;
  }

  function request(method, path, body) {
    var opts = { method: method, headers: {} };
    if (body) {
      // text/plain keeps this a "simple" CORS request (no preflight); the server parses JSON.
      opts.headers["content-type"] = "text/plain;charset=UTF-8";
      opts.body = JSON.stringify(body);
    }
    return fetch(api + path, opts).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok && !data.alternatives) throw new Error(data.error || "Something went wrong");
        return data;
      });
    });
  }

  function jmDate(d) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  }
  function datePart(d, opts) {
    return new Intl.DateTimeFormat("en-JM", Object.assign({ timeZone: TZ }, opts)).format(d);
  }

  var EASE_SPRING = "cubic-bezier(.34,1.56,.64,1)";
  var EASE_OUT = "cubic-bezier(.22,1,.36,1)";
  var EASE_SHEET = "cubic-bezier(.32,.72,0,1)";
  var BRAND_GRAD = "linear-gradient(135deg,color-mix(in srgb,var(--brand) 78%,#fff),var(--brand) 45%,color-mix(in srgb,var(--brand) 78%,#000))";

  var CSS = [
    ":host{all:initial}",
    "*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI',Roboto,system-ui,sans-serif;-webkit-tap-highlight-color:transparent}",
    // launcher
    ".launcher{position:fixed;bottom:22px;" + side + ":22px;width:62px;height:62px;border-radius:50%;border:0;cursor:pointer;background:var(--brand);background:" + BRAND_GRAD + ";color:var(--ink);",
    "box-shadow:0 10px 30px color-mix(in srgb,var(--brand) 45%,transparent),0 2px 6px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.35);z-index:2147483000;display:flex;align-items:center;justify-content:center;",
    "transition:transform .45s " + EASE_SPRING + ",box-shadow .3s;animation:cw-launch .7s " + EASE_SPRING + " both}",
    ".launcher:hover{transform:scale(1.07) translateY(-2px)}.launcher:active{transform:scale(.92)}",
    ".launcher::before{content:'';position:absolute;inset:0;border-radius:50%;animation:cw-ring 2.6s " + EASE_OUT + " 1.2s infinite}",
    ".launcher.seen::before{animation:none}",
    ".launcher .ico{position:absolute;display:flex;transition:transform .45s " + EASE_SPRING + ",opacity .25s}",
    ".launcher .ico svg{width:28px;height:28px}",
    ".launcher .ico.b{opacity:0;transform:rotate(-90deg) scale(.4)}",
    ".launcher.open .ico.a{opacity:0;transform:rotate(90deg) scale(.4)}.launcher.open .ico.b{opacity:1;transform:none}",
    "@keyframes cw-launch{from{opacity:0;transform:scale(.3) translateY(30px)}to{opacity:1;transform:none}}",
    "@keyframes cw-ring{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--brand) 55%,transparent)}100%{box-shadow:0 0 0 20px transparent}}",
    // panel
    ".panel{position:fixed;bottom:98px;" + side + ":22px;width:380px;max-width:calc(100vw - 24px);height:600px;max-height:calc(100vh - 120px);",
    "background:rgba(255,255,255,.94);-webkit-backdrop-filter:saturate(180%) blur(30px);backdrop-filter:saturate(180%) blur(30px);color:#1c1c1e;border-radius:28px;",
    "box-shadow:0 40px 90px rgba(17,12,34,.28),0 12px 28px rgba(17,12,34,.14),0 0 0 .5px rgba(0,0,0,.08);z-index:2147483001;display:flex;flex-direction:column;overflow:hidden;font-size:15px;line-height:1.42;",
    "transform-origin:bottom " + side + ";animation:cw-open .55s " + EASE_SPRING + " both}",
    ".panel[hidden]{display:none}",
    ".panel.closing{animation:cw-close .22s ease-in both}",
    "@keyframes cw-open{from{opacity:0;transform:translateY(24px) scale(.86)}to{opacity:1;transform:none}}",
    "@keyframes cw-close{to{opacity:0;transform:translateY(16px) scale(.94)}}",
    "@media (max-width:480px){.panel{inset:0;width:100%;max-width:none;height:100%;max-height:none;border-radius:0;background:#fff;-webkit-backdrop-filter:none;backdrop-filter:none;animation:cw-sheet .5s " + EASE_SHEET + " both}.panel.closing{animation:cw-sheet-out .28s ease-in both}}",
    "@keyframes cw-sheet{from{transform:translateY(100%)}to{transform:none}}@keyframes cw-sheet-out{to{transform:translateY(100%)}}",
    // header
    ".head{position:relative;overflow:hidden;background:var(--brand);background:" + BRAND_GRAD + ";color:var(--ink);padding:16px 16px 14px;display:flex;align-items:center;gap:12px}",
    ".head::after{content:'';position:absolute;inset:-40% -20%;background:radial-gradient(closest-side,rgba(255,255,255,.28),transparent 70%);transform:translateX(-60%);animation:cw-sheen 6s ease-in-out infinite;pointer-events:none}",
    "@keyframes cw-sheen{0%,100%{transform:translateX(-60%) translateY(-10%)}50%{transform:translateX(55%) translateY(10%)}}",
    ".avatar{position:relative;flex:0 0 auto;width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,.22);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px}",
    ".avatar::after{content:'';position:absolute;right:0;bottom:1px;width:11px;height:11px;border-radius:50%;background:#34c759;box-shadow:0 0 0 2px color-mix(in srgb,var(--brand) 85%,#000);animation:cw-live 2.4s ease-in-out infinite}",
    "@keyframes cw-live{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}",
    ".who{flex:1;min-width:0;position:relative;z-index:1}",
    ".head h2{font-size:17px;font-weight:700;letter-spacing:-.01em;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.head small{display:block;opacity:.92;font-size:12.5px;margin-top:1px}",
    ".x{position:relative;z-index:1;flex:0 0 auto;width:32px;height:32px;border-radius:50%;border:0;background:rgba(255,255,255,.2);color:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:transform .35s " + EASE_SPRING + ",background .2s}",
    ".x:hover{background:rgba(255,255,255,.3)}.x:active{transform:scale(.88)}.x svg{width:16px;height:16px}",
    ".notice{font-size:12px;color:#55555b;padding:10px 16px 0}.notice a{color:inherit;font-weight:600}",
    // segmented control
    ".seg{position:relative;display:grid;grid-template-columns:1fr 1fr;margin:10px 16px 6px;padding:2px;border-radius:11px;background:rgba(118,118,128,.14)}",
    ".seg .thumb{position:absolute;top:2px;bottom:2px;left:2px;width:calc(50% - 2px);border-radius:9px;background:#fff;box-shadow:0 3px 8px rgba(0,0,0,.12),0 3px 1px rgba(0,0,0,.04),0 0 0 .5px rgba(0,0,0,.04);transition:transform .45s " + EASE_SPRING + "}",
    ".seg[data-active=book] .thumb{transform:translateX(100%)}",
    ".tab{position:relative;z-index:1;border:0;background:transparent;cursor:pointer;padding:7px 8px;font-size:14px;font-weight:600;color:#3a3a3f;border-radius:9px}",
    ".tab[aria-selected=true]{color:#1c1c1e}",
    // chat
    ".body{flex:1;overflow-y:auto;padding:12px 14px;scroll-behavior:smooth}",
    ".log{display:flex;flex-direction:column;gap:6px}",
    ".msg{max-width:82%;padding:9px 13px;border-radius:20px;white-space:pre-wrap;word-wrap:break-word;font-size:15px;animation:cw-bubble .5s " + EASE_SPRING + " both}",
    ".msg.bot{align-self:flex-start;background:#e9e9eb;color:#1c1c1e;border-bottom-left-radius:6px;transform-origin:bottom left}",
    ".msg.me{align-self:flex-end;background:var(--brand);background:" + BRAND_GRAD + ";color:var(--ink);border-bottom-right-radius:6px;transform-origin:bottom right;box-shadow:0 4px 14px color-mix(in srgb,var(--brand) 30%,transparent)}",
    ".msg.staff{align-self:flex-start;background:#dcebff;color:#0b2a52;border-bottom-left-radius:6px;transform-origin:bottom left}",
    ".msg a{color:inherit;font-weight:600}",
    "@keyframes cw-bubble{from{opacity:0;transform:translateY(12px) scale(.7)}to{opacity:1;transform:none}}",
    ".typing{align-self:flex-start;display:flex;gap:4px;align-items:center;background:#e9e9eb;padding:12px 14px;border-radius:20px;border-bottom-left-radius:6px;animation:cw-bubble .4s " + EASE_SPRING + " both;transform-origin:bottom left}",
    ".typing i{width:7px;height:7px;border-radius:50%;background:#8e8e93;animation:cw-dot 1.2s ease-in-out infinite}.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}",
    "@keyframes cw-dot{0%,70%,100%{transform:translateY(0);opacity:.45}35%{transform:translateY(-5px);opacity:1}}",
    "form.send{display:flex;gap:8px;align-items:center;padding:10px 12px calc(10px + env(safe-area-inset-bottom));border-top:.5px solid rgba(60,60,67,.18);background:rgba(255,255,255,.7)}",
    "form.send input{flex:1;border-radius:22px;padding:10px 16px;background:#f2f2f7;border:.5px solid rgba(60,60,67,.18)}",
    ".sendbtn{flex:0 0 auto;width:38px;height:38px;border-radius:50%;border:0;cursor:pointer;background:var(--brand);background:" + BRAND_GRAD + ";color:var(--ink);display:flex;align-items:center;justify-content:center;transition:transform .35s " + EASE_SPRING + ",opacity .2s}",
    ".sendbtn:active{transform:scale(.85)}.sendbtn[disabled]{opacity:.4;cursor:default}.sendbtn svg{width:20px;height:20px}",
    // inputs
    "input,textarea,select{font:inherit;font-size:16px;border:.5px solid rgba(60,60,67,.18);border-radius:12px;padding:11px 12px;width:100%;color:#1c1c1e;background:#f2f2f7;transition:box-shadow .2s,background .2s}",
    "input:focus,textarea:focus{outline:none;background:#fff;box-shadow:0 0 0 3px color-mix(in srgb,var(--brand) 30%,transparent)}",
    "textarea{min-height:64px;resize:vertical}",
    // booking screens
    ".screen{animation:cw-push .42s " + EASE_OUT + " both}.screen.back-anim{animation-name:cw-pop-back}",
    "@keyframes cw-push{from{opacity:0;transform:translateX(30px)}to{opacity:1;transform:none}}@keyframes cw-pop-back{from{opacity:0;transform:translateX(-30px)}to{opacity:1;transform:none}}",
    ".screen p{margin:4px 2px 10px}.lead{font-size:20px;font-weight:700;letter-spacing:-.01em;margin:4px 2px 12px!important}",
    ".rise{animation:cw-rise .5s " + EASE_OUT + " both;animation-delay:calc(var(--i,0) * 35ms)}",
    "@keyframes cw-rise{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}",
    ".opt{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:0;background:#fff;border-radius:16px;padding:13px 14px;margin-bottom:8px;cursor:pointer;color:#1c1c1e;",
    "box-shadow:0 1px 2px rgba(0,0,0,.06),0 0 0 .5px rgba(0,0,0,.07);transition:transform .35s " + EASE_SPRING + ",box-shadow .25s}",
    ".opt:hover{transform:translateY(-2px);box-shadow:0 10px 24px rgba(0,0,0,.1),0 0 0 1.5px color-mix(in srgb,var(--brand) 55%,transparent)}.opt:active{transform:scale(.97)}",
    ".opt .txt{flex:1;min-width:0}.opt strong{display:block;font-size:15.5px;font-weight:600}.opt small{display:block;color:#5d5d63;font-size:13px;margin-top:1px}",
    ".chev{flex:0 0 auto;color:#a1a1a6;font-size:22px;line-height:1}",
    ".days{display:flex;gap:8px;overflow-x:auto;padding:4px 2px 10px;margin:0 -2px 6px;scroll-snap-type:x mandatory;scrollbar-width:none}.days::-webkit-scrollbar{display:none}",
    ".day{flex:0 0 auto;scroll-snap-align:start;width:62px;border:0;border-radius:16px;padding:9px 4px;background:#fff;cursor:pointer;color:#1c1c1e;text-align:center;",
    "box-shadow:0 1px 2px rgba(0,0,0,.06),0 0 0 .5px rgba(0,0,0,.07);transition:transform .4s " + EASE_SPRING + ",box-shadow .25s,background .25s}",
    ".day span{display:block;font-size:11.5px;font-weight:600;color:#5d5d63;text-transform:uppercase;letter-spacing:.02em}.day b{display:block;font-size:22px;font-weight:700;margin:1px 0}",
    ".day:hover{transform:translateY(-2px)}.day:active{transform:scale(.94)}",
    ".day[aria-pressed=true]{background:var(--brand);background:" + BRAND_GRAD + ";color:var(--ink);transform:scale(1.06);box-shadow:0 10px 22px color-mix(in srgb,var(--brand) 40%,transparent)}.day[aria-pressed=true] span{color:inherit;opacity:.9}",
    ".times{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}",
    ".time{border:0;border-radius:12px;padding:11px 4px;background:#fff;cursor:pointer;color:#1c1c1e;font-weight:600;font-size:14.5px;box-shadow:0 1px 2px rgba(0,0,0,.06),0 0 0 .5px rgba(0,0,0,.07);transition:transform .35s " + EASE_SPRING + ",box-shadow .25s}",
    ".time:hover{transform:translateY(-2px);box-shadow:0 8px 18px rgba(0,0,0,.1),0 0 0 1.5px color-mix(in srgb,var(--brand) 55%,transparent)}.time:active{transform:scale(.93)}",
    ".skel{height:42px;border-radius:12px;background:linear-gradient(90deg,#ececf0 25%,#f7f7fa 50%,#ececf0 75%);background-size:200% 100%;animation:cw-shimmer 1.1s linear infinite}",
    "@keyframes cw-shimmer{from{background-position:200% 0}to{background-position:-200% 0}}",
    ".muted{color:#5d5d63;font-size:13px}",
    ".sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}",
    "label{display:block;font-weight:600;font-size:13px;color:#3a3a3f;margin:12px 2px 0}label input,label textarea{margin-top:6px;font-weight:400}",
    "label.check{display:flex;gap:12px;align-items:center;font-weight:500;font-size:13.5px;color:#1c1c1e;background:#fff;border-radius:14px;padding:12px;box-shadow:0 0 0 .5px rgba(0,0,0,.07)}",
    // iOS switch made from the real checkbox
    "label.check input{flex:0 0 auto;-webkit-appearance:none;appearance:none;width:51px;height:31px;margin:0;padding:0;border:0;border-radius:999px;cursor:pointer;",
    "background-color:#e3e3e8;background-image:radial-gradient(circle at center,#fff 0,#fff 12.5px,rgba(0,0,0,.12) 13.2px,transparent 14px);background-size:31px 31px;background-repeat:no-repeat;background-position:0 0;",
    "transition:background-color .25s,background-position .4s " + EASE_SPRING + "}",
    "label.check input:checked{background-color:#34c759;background-position:20px 0}",
    "label.check input:focus-visible{box-shadow:0 0 0 3px color-mix(in srgb,var(--brand) 35%,transparent)}",
    ".primary{position:relative;overflow:hidden;display:block;width:100%;margin-top:14px;border:0;border-radius:16px;padding:15px 16px;font-size:17px;font-weight:600;cursor:pointer;",
    "background:var(--brand);background:" + BRAND_GRAD + ";color:var(--ink);box-shadow:0 12px 26px color-mix(in srgb,var(--brand) 38%,transparent);transition:transform .35s " + EASE_SPRING + ",opacity .2s}",
    ".primary::after{content:'';position:absolute;top:0;bottom:0;width:40%;left:-60%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.35),transparent);transform:skewX(-20deg);transition:left .7s " + EASE_OUT + "}",
    ".primary:hover::after{left:120%}.primary:active{transform:scale(.97)}.primary[disabled]{opacity:.6;cursor:default}",
    ".back{display:inline-flex;align-items:center;gap:2px;background:none;border:0;color:var(--brand);font-size:16px;font-weight:500;cursor:pointer;padding:2px 0;margin:0 0 6px}",
    ".err{color:#c4281c;font-size:13px;margin:8px 2px 0;min-height:0}",
    // success
    ".done{display:flex;flex-direction:column;align-items:center;text-align:center;padding:18px 6px 6px}",
    ".burst{position:relative;width:96px;height:96px;margin:6px 0 14px}",
    ".burst svg{width:96px;height:96px;filter:drop-shadow(0 10px 20px rgba(52,199,89,.35))}",
    ".burst .ring{stroke:#34c759;stroke-width:3;stroke-dasharray:145;stroke-dashoffset:145;animation:cw-draw .7s " + EASE_OUT + " forwards}",
    ".burst .tick{stroke:#34c759;stroke-width:4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:40;stroke-dashoffset:40;animation:cw-draw .45s " + EASE_OUT + " .55s forwards}",
    "@keyframes cw-draw{to{stroke-dashoffset:0}}",
    ".burst i{position:absolute;left:50%;top:50%;width:8px;height:8px;margin:-4px;border-radius:50%;opacity:0;background:var(--c);animation:cw-spark .9s " + EASE_OUT + " .6s forwards}",
    "@keyframes cw-spark{0%{opacity:1;transform:rotate(var(--a)) translateY(0) scale(1)}100%{opacity:0;transform:rotate(var(--a)) translateY(-64px) scale(.3)}}",
    ".ok{color:#1c1c1e;font-size:15px;animation:cw-rise .6s " + EASE_OUT + " .5s both}.ok strong{display:block;font-size:22px;letter-spacing:-.01em;margin-bottom:6px}",
    ".ref{display:inline-block;margin-top:10px;padding:6px 12px;border-radius:999px;background:rgba(52,199,89,.14);color:#1b6f36;font-weight:700;letter-spacing:.04em}",
    ".hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}",
    ":focus-visible{outline:2px solid var(--brand);outline-offset:2px}",
    "@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-delay:0s!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}",
  ].join("");

  request("GET", "/config")
    .then(start)
    .catch(function () {
      /* business unknown or widget not allowed on this site: stay invisible */
    });

  function start(cfg) {
    var host = el("div", { id: "conroy-widget" });
    document.body.appendChild(host);
    var root = host.attachShadow({ mode: "open" });
    root.appendChild(el("style", { text: CSS }));
    host.style.setProperty("--brand", cfg.brandColor || "#6a1b9a");
    host.style.setProperty("--ink", cfg.brandTextColor || "#ffffff");

    var launcher = el("button", { class: "launcher", type: "button", "aria-label": "Chat with " + cfg.assistantName + " or book an appointment", "aria-expanded": "false" }, [
      icon("chat", "ico a"),
      icon("close", "ico b"),
    ]);
    if (store("seen")) launcher.classList.add("seen");

    var title = el("h2", { id: "cw-title", text: cfg.name });
    var closeBtn = el("button", { class: "x", type: "button", "aria-label": "Close" }, [icon("close")]);
    var initial = (cfg.assistantName || "C").trim().charAt(0).toUpperCase();
    var panel = el("div", { class: "panel", role: "dialog", "aria-labelledby": "cw-title", hidden: true }, [
      el("div", { class: "head" }, [
        el("div", { class: "avatar", "aria-hidden": "true", text: initial }),
        el("div", { class: "who" }, [title, el("small", { text: cfg.assistantName + " · AI assistant · replies instantly" })]),
        closeBtn,
      ]),
      el("div", { class: "notice" }, [cfg.aiNotice + " ", el("a", { href: cfg.privacyUrl, target: "_blank", rel: "noopener", text: "Privacy notice" })]),
    ]);
    var tabChat = el("button", { class: "tab", role: "tab", "aria-selected": "true", id: "cw-tab-chat", "aria-controls": "cw-chat", type: "button", text: "Chat" });
    var tabBook = el("button", { class: "tab", role: "tab", "aria-selected": "false", id: "cw-tab-book", "aria-controls": "cw-book", type: "button", text: "Book" });
    var seg = el("div", { class: "seg", role: "tablist", "aria-label": "Widget sections", "data-active": "chat" }, [el("span", { class: "thumb", "aria-hidden": "true" }), tabChat, tabBook]);
    panel.appendChild(seg);

    // ---------------------------------------------------------- chat
    var log = el("div", { class: "log", role: "log", "aria-live": "polite", "aria-label": "Conversation" });
    var chatBody = el("div", { class: "body" }, [log]);
    var input = el("input", { type: "text", name: "message", maxlength: "1000", "aria-label": "Type your message", placeholder: "Message " + cfg.assistantName + "…", autocomplete: "off" });
    var sendBtn = el("button", { class: "sendbtn", type: "submit", "aria-label": "Send" }, [icon("send")]);
    var sendForm = el("form", { class: "send" }, [input, sendBtn]);
    var chatPane = el("div", { id: "cw-chat", role: "tabpanel", "aria-labelledby": "cw-tab-chat" }, [chatBody, sendForm]);
    chatPane.style.cssText = "display:flex;flex-direction:column;flex:1;min-height:0";

    var history = store("history") || [];
    var token = store("token");
    var lastStaffAt = store("lastStaffAt") || 0;
    var status = "BOT";
    var pollTimer = null;

    function scrollDown() {
      chatBody.scrollTop = chatBody.scrollHeight;
    }
    function addMsg(who, text, save) {
      log.appendChild(el("div", { class: "msg " + who }, [who === "me" ? text : richText(text)]));
      scrollDown();
      if (save) {
        history.push({ who: who, text: text });
        history = history.slice(-30);
        store("history", history);
      }
    }
    if (history.length) history.forEach(function (m) { addMsg(m.who, m.text, false); });
    else addMsg("bot", cfg.welcome, false);

    function poll() {
      if (!token || panel.hidden) return;
      request("GET", "/chat?token=" + encodeURIComponent(token) + "&after=" + lastStaffAt)
        .then(function (data) {
          (data.messages || []).forEach(function (m) {
            addMsg("staff", m.text, true);
            lastStaffAt = Math.max(lastStaffAt, m.at);
            store("lastStaffAt", lastStaffAt);
          });
          status = data.status;
          schedulePoll();
        })
        .catch(schedulePoll);
    }
    function schedulePoll() {
      clearTimeout(pollTimer);
      if (status === "HUMAN" && !panel.hidden) pollTimer = setTimeout(poll, 6000);
    }

    sendForm.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = input.value.trim();
      if (!text) return;
      input.value = "";
      addMsg("me", text, true);
      sendBtn.disabled = true;
      var typing = el("div", { class: "typing" }, [el("i"), el("i"), el("i"), el("span", { class: "sr", text: cfg.assistantName + " is typing…" })]);
      log.appendChild(typing);
      scrollDown();
      var started = Date.now();
      var tz = "";
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (err) { tz = ""; }
      request("POST", "/chat", { message: text, token: token, timezone: tz })
        .then(function (data) {
          token = data.token;
          store("token", token);
          status = data.status;
          return data;
        })
        .then(function (data) {
          // Let the typing dots show briefly, so instant answers still feel natural.
          var wait = reduceMotion ? 0 : Math.max(0, 550 - (Date.now() - started));
          return new Promise(function (resolve) { setTimeout(function () { resolve(data); }, wait); });
        })
        .then(function (data) {
          typing.remove();
          if (data.reply) addMsg("bot", data.reply, true);
          else if (data.notice) addMsg("bot", data.notice, true);
          schedulePoll();
        })
        .catch(function (err) {
          typing.remove();
          addMsg("bot", err.message || "Sorry, I couldn't send that. Please try again.", false);
        })
        .then(function () {
          sendBtn.disabled = false;
          input.focus();
        });
    });

    // ---------------------------------------------------------- booking
    var bookBody = el("div", { class: "body" });
    var bookPane = el("div", { id: "cw-book", role: "tabpanel", "aria-labelledby": "cw-tab-book", hidden: true });
    bookPane.style.cssText = "flex:1;min-height:0;overflow-y:auto";
    bookPane.appendChild(bookBody);
    var services = null;
    var sel = {};

    function screen(nodes, goingBack) {
      bookBody.textContent = "";
      var wrap = el("div", { class: "screen" + (goingBack ? " back-anim" : "") });
      nodes.forEach(function (n) { if (n) wrap.appendChild(n); });
      bookBody.appendChild(wrap);
      bookBody.scrollTop = 0;
      var first = bookBody.querySelector("button,input,select");
      if (first && !panel.hidden && !bookPane.hidden) first.focus({ preventScroll: true });
    }
    function back(fn) {
      return el("button", { class: "back", type: "button", onclick: fn }, [el("span", { "aria-hidden": "true", text: "‹" }), " Back"]);
    }
    function rise(node, i) {
      node.classList.add("rise");
      node.style.setProperty("--i", String(i));
      return node;
    }
    function row(strong, small, onclick, i) {
      return rise(
        el("button", { class: "opt", type: "button", onclick: onclick }, [
          el("span", { class: "txt" }, [el("strong", { text: strong }), small ? el("small", { text: small }) : null]),
          el("span", { class: "chev", "aria-hidden": "true", text: "›" }),
        ]),
        i,
      );
    }

    function showServices(goingBack) {
      if (!services) {
        screen([el("p", { class: "lead", text: "Loading services…" }), el("div", { class: "skel" }), el("div", { class: "skel", style: "margin-top:8px" }), el("div", { class: "skel", style: "margin-top:8px" })]);
        request("GET", "/services")
          .then(function (d) { services = d.services; showServices(); })
          .catch(function () { screen([el("p", { class: "err", text: "Couldn't load services. Please try the chat instead." })]); });
        return;
      }
      sel = {};
      screen(
        [el("p", { class: "lead", text: "What would you like to book?" })].concat(
          services.map(function (s, i) {
            return row(s.name, s.price + " · " + s.durationMin + " min" + (s.deposit ? " · deposit " + s.deposit : ""), function () { sel.service = s; showStaff(); }, i);
          })
        ),
        goingBack,
      );
    }

    function showStaff(goingBack) {
      var staff = sel.service.staff || [];
      if (staff.length <= 1) { sel.staff = null; return goingBack ? showServices(true) : showDays(); }
      screen(
        [back(function () { showServices(true); }), el("p", { class: "lead", text: "Who would you like?" }),
          row("Anyone available", "First free stylist", function () { sel.staff = null; showDays(); }, 0)].concat(
          staff.map(function (p, i) {
            return row(p.name, null, function () { sel.staff = p; showDays(); }, i + 1);
          })
        ),
        goingBack,
      );
    }

    function showDays(selectedDate, goingBack) {
      var days = el("div", { class: "days", role: "group", "aria-label": "Choose a day" });
      var times = el("div", { class: "times", role: "group", "aria-label": "Choose a time" });
      for (var i = 0; i < 21; i++) {
        (function (d, idx) {
          var date = jmDate(d);
          var full = idx === 0 ? "Today" : idx === 1 ? "Tomorrow" : datePart(d, { weekday: "long", day: "numeric", month: "long" });
          var chip = el("button", { class: "day", type: "button", "aria-pressed": String(date === selectedDate), "aria-label": full }, [
            el("span", { text: idx === 0 ? "Today" : idx === 1 ? "Tmrw" : datePart(d, { weekday: "short" }) }),
            el("b", { text: datePart(d, { day: "numeric" }) }),
            el("span", { text: datePart(d, { month: "short" }) }),
          ]);
          chip.addEventListener("click", function () {
            var keep = days.scrollLeft;
            showDays(date);
            var again = bookBody.querySelector(".days");
            if (again) again.scrollLeft = keep;
          });
          days.appendChild(selectedDate ? chip : rise(chip, Math.min(idx, 8)));
        })(new Date(Date.now() + i * 86400000), i);
      }
      screen(
        [
          back(function () { showStaff(true); }),
          el("p", { class: "lead" }, [sel.service.name, sel.staff ? el("span", { class: "muted", text: " with " + sel.staff.name }) : null]),
          el("p", { class: "muted", text: "Pick a day (Jamaica time):" }),
          days,
          times,
        ],
        goingBack || Boolean(selectedDate),
      );
      // Re-rendering for a chosen day shouldn't replay the slide.
      if (selectedDate) bookBody.firstChild.style.animation = "none";
      if (!selectedDate) return;
      times.appendChild(el("p", { class: "sr", text: "Checking…" }));
      for (var k = 0; k < 6; k++) times.appendChild(el("div", { class: "skel", "aria-hidden": "true" }));
      var q = "/availability?serviceId=" + encodeURIComponent(sel.service.id) + "&date=" + selectedDate + (sel.staff ? "&staffId=" + encodeURIComponent(sel.staff.id) : "");
      request("GET", q)
        .then(function (d) {
          times.textContent = "";
          if (!d.slots.length) { times.appendChild(el("p", { class: "muted", style: "grid-column:1/-1", text: "No times free that day. Try another day." })); return; }
          d.slots.forEach(function (s, idx) {
            times.appendChild(rise(el("button", { class: "time", type: "button", text: s.label, onclick: function () { sel.start = s.start; sel.label = s.label; sel.date = selectedDate; showForm(); } }), idx));
          });
        })
        .catch(function () { times.textContent = ""; times.appendChild(el("p", { class: "err", text: "Couldn't load times." })); });
    }

    function showForm(errorText) {
      var name = el("input", { name: "name", autocomplete: "name", required: true, maxlength: "120", placeholder: "First and last name" });
      var phone = el("input", { name: "phone", type: "tel", inputmode: "tel", autocomplete: "tel", required: true, maxlength: "30", placeholder: "876-555-1234" });
      var notes = el("textarea", { name: "notes", maxlength: "500", placeholder: "Optional" });
      var consent = el("input", { type: "checkbox", name: "consent", required: true });
      var hp = el("input", { name: "website", tabindex: "-1", autocomplete: "off" });
      var submit = el("button", { class: "primary", type: "submit", text: "Confirm booking" });
      var err = el("p", { class: "err", role: "alert", text: errorText || "" });
      var form = el("form", null, [
        el("label", null, ["Your name", name]),
        el("label", null, ["WhatsApp number", phone]),
        el("label", null, ["Anything we should know? (optional)", notes]),
        el("div", { class: "hp", "aria-hidden": "true" }, [hp]),
        el("label", { class: "check", style: "margin-top:14px" }, [consent, "Send my confirmation and reminders by WhatsApp. I've read the privacy notice."]),
        err, submit,
      ]);
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        submit.disabled = true;
        submit.textContent = "Booking…";
        err.textContent = "";
        request("POST", "/bookings", {
          serviceId: sel.service.id, staffId: sel.staff ? sel.staff.id : null, start: sel.start,
          name: name.value, phone: phone.value, notes: notes.value || null, consent: consent.checked, website: hp.value,
        })
          .then(function (d) {
            if (!d.ok) { submit.disabled = false; submit.textContent = "Confirm booking"; err.textContent = d.error || "That time is no longer free."; return; }
            var burst = el("div", { class: "burst", "aria-hidden": "true" });
            burst.innerHTML = ICON.check;
            var colors = ["#34c759", "#ffcc00", "#ff2d55", "#5ac8fa", "#af52de"];
            for (var p = 0; p < 12; p++) {
              var dot = el("i");
              dot.style.setProperty("--a", p * 30 + "deg");
              dot.style.setProperty("--c", colors[p % colors.length]);
              burst.appendChild(dot);
            }
            screen([
              el("div", { class: "done" }, [
                burst,
                el("div", { class: "ok", role: "status" }, [
                  el("strong", { text: "You're booked!" }),
                  d.service + (d.staff ? " with " + d.staff : "") + ", " + d.when + ". ",
                  el("span", { class: "ref", text: "Reference: " + d.reference }),
                  el("br"),
                  el("span", { class: "muted", text: "We've sent your confirmation by WhatsApp." }),
                ]),
              ]),
              d.deposit ? el("p", { class: "muted", style: "text-align:center", text: d.deposit }) : null,
              rise(el("button", { class: "opt", type: "button", style: "justify-content:center;margin-top:16px", text: "Book something else", onclick: function () { showServices(); } }), 18),
            ]);
          })
          .catch(function (e2) { submit.disabled = false; submit.textContent = "Confirm booking"; err.textContent = e2.message; });
      });
      screen([
        back(function () { showDays(sel.date, true); }),
        el("p", { class: "lead" }, [sel.service.name, el("span", { class: "muted", text: " · " + sel.label })]),
        el("p", { class: "muted", text: (sel.staff ? "With " + sel.staff.name + ". " : "") + "Times are Jamaica time." }),
        form,
      ]);
    }

    function selectTab(which) {
      var chat = which === "chat";
      seg.setAttribute("data-active", chat ? "chat" : "book");
      tabChat.setAttribute("aria-selected", String(chat));
      tabBook.setAttribute("aria-selected", String(!chat));
      chatPane.style.display = chat ? "flex" : "none";
      bookPane.hidden = chat;
      if (!chat && !bookBody.firstChild) showServices();
      var target = chat ? input : bookBody.querySelector("button,input");
      if (target) target.focus({ preventScroll: true });
    }
    tabChat.addEventListener("click", function () { selectTab("chat"); });
    tabBook.addEventListener("click", function () { selectTab("book"); });
    [tabChat, tabBook].forEach(function (t, idx, arr) {
      t.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") { var next = arr[(idx + 1) % 2]; next.focus(); next.click(); }
      });
    });

    panel.appendChild(chatPane);
    panel.appendChild(bookPane);

    var closeTimer = null;
    function open(tab) {
      clearTimeout(closeTimer);
      panel.classList.remove("closing");
      panel.hidden = false;
      launcher.classList.add("open", "seen");
      store("seen", true);
      launcher.setAttribute("aria-expanded", "true");
      selectTab(tab || "chat");
      scrollDown();
      schedulePoll();
    }
    function close() {
      if (panel.hidden) return;
      launcher.setAttribute("aria-expanded", "false");
      launcher.classList.remove("open");
      clearTimeout(pollTimer);
      panel.classList.add("closing");
      clearTimeout(closeTimer);
      closeTimer = setTimeout(function () {
        panel.hidden = true;
        panel.classList.remove("closing");
      }, reduceMotion ? 0 : 260);
      launcher.focus();
    }
    launcher.addEventListener("click", function () {
      if (panel.hidden || panel.classList.contains("closing")) open();
      else close();
    });
    closeBtn.addEventListener("click", close);
    panel.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });

    root.appendChild(launcher);
    root.appendChild(panel);
    window.Conroy = { open: open, close: close };
    if (script.getAttribute("data-open")) open(script.getAttribute("data-open") === "book" ? "book" : "chat");
  }
})();
