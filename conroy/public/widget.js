/*!
 * Conroy chat + booking widget (Steven Scale Solutions)
 * Embed: <script src="https://APP_DOMAIN/widget.js" data-business="SLUG" defer></script>
 * Optional: data-position="left", data-open="book"
 * No dependencies. Renders inside a Shadow DOM so the host site's CSS can't break it.
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
  function dayLabel(d) {
    return new Intl.DateTimeFormat("en-JM", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(d);
  }

  var CSS =
    ":host{all:initial}" +
    "*{box-sizing:border-box;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}" +
    ".launcher{position:fixed;bottom:20px;" + side + ":20px;width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;background:var(--brand);color:var(--ink);box-shadow:0 6px 20px rgba(0,0,0,.25);z-index:2147483000;display:flex;align-items:center;justify-content:center}" +
    ".launcher svg{width:28px;height:28px}" +
    ".panel{position:fixed;bottom:92px;" + side + ":20px;width:370px;max-width:calc(100vw - 24px);height:560px;max-height:calc(100vh - 110px);background:#fff;color:#1d1724;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.28);z-index:2147483001;display:flex;flex-direction:column;overflow:hidden;font-size:15px;line-height:1.45}" +
    ".panel[hidden]{display:none}" +
    "@media (max-width:480px){.panel{inset:0;width:100%;max-width:none;height:100%;max-height:none;border-radius:0}}" +
    ".head{background:var(--brand);color:var(--ink);padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px}" +
    ".head h2{font-size:16px;margin:0}.head small{opacity:.9;font-size:12px}" +
    ".x{background:transparent;border:0;color:inherit;font-size:24px;cursor:pointer;line-height:1;padding:4px 8px;border-radius:6px}" +
    ".notice{font-size:12px;color:#5a5163;background:#f6f3f8;padding:8px 12px;border-bottom:1px solid #eee}" +
    ".notice a{color:inherit}" +
    ".tabs{display:flex;border-bottom:1px solid #eee}" +
    ".tab{flex:1;padding:10px;border:0;background:#fff;cursor:pointer;font-weight:600;color:#5a5163;border-bottom:3px solid transparent}" +
    ".tab[aria-selected=true]{color:#1d1724;border-bottom-color:var(--brand)}" +
    ".body{flex:1;overflow-y:auto;padding:12px}" +
    ".log{display:flex;flex-direction:column;gap:8px}" +
    ".msg{max-width:85%;padding:8px 11px;border-radius:14px;white-space:pre-wrap;word-wrap:break-word}" +
    ".msg.bot{align-self:flex-start;background:#f1edf5}.msg.me{align-self:flex-end;background:var(--brand);color:var(--ink)}.msg.staff{align-self:flex-start;background:#e6f0fb}" +
    ".msg a{color:inherit}" +
    ".typing{align-self:flex-start;color:#7a7183;font-size:13px}" +
    "form.send{display:flex;gap:8px;padding:10px;border-top:1px solid #eee}" +
    "input,textarea,select{font:inherit;border:1px solid #d8d1df;border-radius:10px;padding:9px 10px;width:100%;color:#1d1724;background:#fff}" +
    "textarea{min-height:60px;resize:vertical}" +
    "button.primary{background:var(--brand);color:var(--ink);border:0;border-radius:10px;padding:9px 14px;font-weight:600;cursor:pointer}" +
    "button.primary[disabled]{opacity:.6;cursor:default}" +
    ".opt{display:block;width:100%;text-align:left;border:1px solid #e2dbe8;background:#fff;border-radius:12px;padding:10px 12px;margin-bottom:8px;cursor:pointer;color:#1d1724}" +
    ".opt:hover{border-color:var(--brand)}.opt small{display:block;color:#6b6274}" +
    ".days{display:flex;gap:6px;overflow-x:auto;padding-bottom:6px;margin-bottom:8px}" +
    ".chip{flex:0 0 auto;border:1px solid #e2dbe8;background:#fff;border-radius:999px;padding:7px 11px;cursor:pointer;color:#1d1724}" +
    ".chip[aria-pressed=true]{background:var(--brand);color:var(--ink);border-color:var(--brand)}" +
    ".times{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}" +
    "label{display:block;font-weight:600;font-size:13px;margin:10px 0 4px}" +
    "label.check{display:flex;gap:8px;align-items:flex-start;font-weight:400}label.check input{width:auto;margin-top:3px}" +
    ".back{background:none;border:0;color:#5a5163;cursor:pointer;padding:0;margin-bottom:8px;text-decoration:underline}" +
    ".err{color:#b3261e;font-size:13px;margin-top:6px}.ok{background:#e5f5ec;color:#1e7b45;padding:12px;border-radius:12px}" +
    ".hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}" +
    ":focus-visible{outline:2px solid var(--brand);outline-offset:2px}";

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

    var launcher = el("button", { class: "launcher", type: "button", "aria-label": "Chat with " + cfg.assistantName + " or book an appointment", "aria-expanded": "false" });
    launcher.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    var title = el("h2", { id: "cw-title", text: cfg.name });
    var closeBtn = el("button", { class: "x", type: "button", "aria-label": "Close" , text: "×" });
    var panel = el("div", { class: "panel", role: "dialog", "aria-labelledby": "cw-title", hidden: true }, [
      el("div", { class: "head" }, [el("div", null, [title, el("small", { text: cfg.assistantName + " · AI assistant" })]), closeBtn]),
      el("div", { class: "notice" }, [cfg.aiNotice + " ", el("a", { href: cfg.privacyUrl, target: "_blank", rel: "noopener", text: "Privacy notice" })]),
    ]);
    var tabChat = el("button", { class: "tab", role: "tab", "aria-selected": "true", id: "cw-tab-chat", "aria-controls": "cw-chat", type: "button", text: "Chat" });
    var tabBook = el("button", { class: "tab", role: "tab", "aria-selected": "false", id: "cw-tab-book", "aria-controls": "cw-book", type: "button", text: "Book" });
    panel.appendChild(el("div", { class: "tabs", role: "tablist", "aria-label": "Widget sections" }, [tabChat, tabBook]));

    // ---------------------------------------------------------- chat
    var log = el("div", { class: "log", role: "log", "aria-live": "polite", "aria-label": "Conversation" });
    var chatBody = el("div", { class: "body" }, [log]);
    var input = el("input", { type: "text", name: "message", maxlength: "1000", "aria-label": "Type your message", placeholder: "Type a message…", autocomplete: "off" });
    var sendBtn = el("button", { class: "primary", type: "submit", text: "Send" });
    var sendForm = el("form", { class: "send" }, [input, sendBtn]);
    var chatPane = el("div", { id: "cw-chat", role: "tabpanel", "aria-labelledby": "cw-tab-chat", style: "display:flex;flex-direction:column;flex:1;min-height:0" }, [chatBody, sendForm]);

    var history = store("history") || [];
    var token = store("token");
    var lastStaffAt = store("lastStaffAt") || 0;
    var status = "BOT";
    var pollTimer = null;

    function addMsg(who, text, save) {
      log.appendChild(el("div", { class: "msg " + who }, [who === "me" ? text : richText(text)]));
      chatBody.scrollTop = chatBody.scrollHeight;
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
      var typing = el("div", { class: "typing", text: cfg.assistantName + " is typing…" });
      log.appendChild(typing);
      var tz = "";
      try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (err) { tz = ""; }
      request("POST", "/chat", { message: text, token: token, timezone: tz })
        .then(function (data) {
          token = data.token;
          store("token", token);
          status = data.status;
          if (data.reply) addMsg("bot", data.reply, true);
          else if (data.notice) addMsg("bot", data.notice, true);
          schedulePoll();
        })
        .catch(function (err) {
          addMsg("bot", err.message || "Sorry, I couldn't send that. Please try again.", false);
        })
        .then(function () {
          typing.remove();
          sendBtn.disabled = false;
          input.focus();
        });
    });

    // ---------------------------------------------------------- booking
    var bookBody = el("div", { class: "body" });
    var bookPane = el("div", { id: "cw-book", role: "tabpanel", "aria-labelledby": "cw-tab-book", hidden: true, style: "flex:1;min-height:0;overflow-y:auto" }, [bookBody]);
    var services = null;
    var sel = {};

    function screen(nodes) {
      bookBody.textContent = "";
      nodes.forEach(function (n) { if (n) bookBody.appendChild(n); });
      var first = bookBody.querySelector("button,input,select");
      if (first && !panel.hidden && !bookPane.hidden) first.focus();
    }
    function back(fn) {
      return el("button", { class: "back", type: "button", text: "← Back", onclick: fn });
    }

    function showServices() {
      if (!services) {
        screen([el("p", { text: "Loading services…" })]);
        request("GET", "/services")
          .then(function (d) { services = d.services; showServices(); })
          .catch(function () { screen([el("p", { class: "err", text: "Couldn't load services. Please try the chat instead." })]); });
        return;
      }
      sel = {};
      screen(
        [el("p", { text: "What would you like to book?" })].concat(
          services.map(function (s) {
            return el("button", { class: "opt", type: "button", onclick: function () { sel.service = s; showStaff(); } }, [
              el("strong", { text: s.name }),
              el("small", { text: s.price + " · " + s.durationMin + " min" + (s.deposit ? " · deposit " + s.deposit : "") }),
            ]);
          })
        )
      );
    }

    function showStaff() {
      var staff = sel.service.staff || [];
      if (staff.length <= 1) { sel.staff = null; return showDays(); }
      screen(
        [back(showServices), el("p", { text: "Who would you like? (optional)" }),
          el("button", { class: "opt", type: "button", onclick: function () { sel.staff = null; showDays(); } }, [el("strong", { text: "Anyone available" })])].concat(
          staff.map(function (p) {
            return el("button", { class: "opt", type: "button", onclick: function () { sel.staff = p; showDays(); } }, [el("strong", { text: p.name })]);
          })
        )
      );
    }

    function showDays(selectedDate) {
      var days = el("div", { class: "days", role: "group", "aria-label": "Choose a day" });
      var times = el("div", { class: "times", role: "group", "aria-label": "Choose a time" });
      var info = el("p", { text: "Pick a day (Jamaica time):" });
      for (var i = 0; i < 21; i++) {
        (function (d) {
          var date = jmDate(d);
          var chip = el("button", { class: "chip", type: "button", "aria-pressed": String(date === selectedDate), text: i === 0 ? "Today" : i === 1 ? "Tomorrow" : dayLabel(d) });
          chip.addEventListener("click", function () { showDays(date); });
          days.appendChild(chip);
        })(new Date(Date.now() + i * 86400000));
      }
      screen([back(showStaff), el("p", null, [el("strong", { text: sel.service.name }), sel.staff ? " with " + sel.staff.name : ""]), info, days, times]);
      if (!selectedDate) return;
      times.appendChild(el("p", { text: "Checking…" }));
      var q = "/availability?serviceId=" + encodeURIComponent(sel.service.id) + "&date=" + selectedDate + (sel.staff ? "&staffId=" + encodeURIComponent(sel.staff.id) : "");
      request("GET", q)
        .then(function (d) {
          times.textContent = "";
          if (!d.slots.length) { times.appendChild(el("p", { text: "No times free that day. Try another day." })); return; }
          d.slots.forEach(function (s) {
            times.appendChild(el("button", { class: "chip", type: "button", text: s.label, onclick: function () { sel.start = s.start; sel.label = s.label; sel.date = selectedDate; showForm(); } }));
          });
        })
        .catch(function () { times.textContent = ""; times.appendChild(el("p", { class: "err", text: "Couldn't load times." })); });
    }

    function showForm(errorText) {
      var name = el("input", { name: "name", autocomplete: "name", required: true, maxlength: "120" });
      var phone = el("input", { name: "phone", type: "tel", inputmode: "tel", autocomplete: "tel", required: true, maxlength: "30", placeholder: "876-555-1234" });
      var notes = el("textarea", { name: "notes", maxlength: "500" });
      var consent = el("input", { type: "checkbox", name: "consent", required: true });
      var hp = el("input", { name: "website", tabindex: "-1", autocomplete: "off" });
      var submit = el("button", { class: "primary", type: "submit", text: "Confirm booking" });
      var err = el("p", { class: "err", role: "alert", text: errorText || "" });
      var form = el("form", null, [
        el("label", { text: "Your name" }), name,
        el("label", { text: "WhatsApp number" }), phone,
        el("label", { text: "Anything we should know? (optional)" }), notes,
        el("div", { class: "hp", "aria-hidden": "true" }, [hp]),
        el("label", { class: "check" }, [consent, "Send my confirmation and reminders by WhatsApp. I've read the privacy notice."]),
        err, submit,
      ]);
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        submit.disabled = true;
        err.textContent = "";
        request("POST", "/bookings", {
          serviceId: sel.service.id, staffId: sel.staff ? sel.staff.id : null, start: sel.start,
          name: name.value, phone: phone.value, notes: notes.value || null, consent: consent.checked, website: hp.value,
        })
          .then(function (d) {
            if (!d.ok) { submit.disabled = false; err.textContent = d.error || "That time is no longer free."; return; }
            screen([
              el("div", { class: "ok", role: "status" }, [
                el("strong", { text: "You're booked! " }),
                d.service + (d.staff ? " with " + d.staff : "") + ", " + d.when + ". Reference: " + d.reference + ". We've sent your confirmation by WhatsApp.",
              ]),
              d.deposit ? el("p", { text: d.deposit }) : null,
              el("button", { class: "opt", type: "button", text: "Book something else", onclick: showServices }),
            ]);
          })
          .catch(function (e2) { submit.disabled = false; err.textContent = e2.message; });
      });
      screen([back(function () { showDays(sel.date); }), el("p", null, [el("strong", { text: sel.service.name }), " · " + sel.label + " (Jamaica time)"]), form]);
    }

    function selectTab(which) {
      var chat = which === "chat";
      tabChat.setAttribute("aria-selected", String(chat));
      tabBook.setAttribute("aria-selected", String(!chat));
      chatPane.style.display = chat ? "flex" : "none";
      bookPane.hidden = chat;
      if (!chat && !bookBody.firstChild) showServices();
      var target = chat ? input : bookBody.querySelector("button,input");
      if (target) target.focus();
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

    function open(tab) {
      panel.hidden = false;
      launcher.setAttribute("aria-expanded", "true");
      selectTab(tab || "chat");
      schedulePoll();
    }
    function close() {
      panel.hidden = true;
      launcher.setAttribute("aria-expanded", "false");
      clearTimeout(pollTimer);
      launcher.focus();
    }
    launcher.addEventListener("click", function () { panel.hidden ? open() : close(); });
    closeBtn.addEventListener("click", close);
    panel.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });

    root.appendChild(launcher);
    root.appendChild(panel);
    window.Conroy = { open: open, close: close };
    if (script.getAttribute("data-open")) open(script.getAttribute("data-open") === "book" ? "book" : "chat");
  }
})();
