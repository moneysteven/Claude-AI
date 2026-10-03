/* Candid Expressions — booking & review forms.
   The "Send on WhatsApp" / "Send by email" buttons are real links whose
   address is rebuilt from the form as it's filled in, so they work on any
   host. If SITE.formEndpoint is set in content.js, the email button
   submits the form there instead (e.g. Formspree). */
(function () {
  "use strict";

  var SITE = window.SITE || {};
  var CE = window.CE || {};

  function labelFor(form, name) {
    var el = form.querySelector('[name="' + name + '"]');
    return (el && el.getAttribute("data-label")) || name;
  }

  /* Turn the enabled, filled-in fields into readable lines. */
  function collect(form) {
    var data = new FormData(form);
    var order = [], values = {};
    data.forEach(function (v, k) {
      v = String(v).trim();
      if (!v) return;
      if (!values[k]) { values[k] = []; order.push(k); }
      values[k].push(v);
    });
    return order.map(function (k) {
      var v = values[k];
      if (k === "service") {
        var r = form.querySelector('input[name="service"]:checked');
        v = [r ? r.getAttribute("data-title") : v[0]];
      }
      return { name: k, label: labelFor(form, k), value: v.join(", ") };
    });
  }

  function formatTime(t) {
    if (!/^\d{2}:\d{2}$/.test(t)) return t;
    var h = parseInt(t.slice(0, 2), 10), m = t.slice(3);
    var ap = h >= 12 ? "PM" : "AM";
    h = h % 12 || 12;
    return h + ":" + m + " " + ap;
  }
  function formatDate(d) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    var dt = new Date(d + "T12:00:00");
    try { return dt.toLocaleDateString("en-JM", { weekday: "short", day: "numeric", month: "short", year: "numeric" }); }
    catch (e) { return d; }
  }
  function pretty(form, lines) {
    return lines.map(function (l) {
      var el = form.querySelector('[name="' + l.name + '"]');
      var v = l.value;
      if (el && el.type === "time") v = formatTime(v);
      if (el && el.type === "date") v = formatDate(v);
      return { label: l.label, value: v };
    });
  }

  function status(form, msg, ok) {
    var s = form.querySelector(".form-status");
    if (!s) return;
    s.textContent = msg;
    s.className = "form-status " + (ok ? "is-ok" : "is-err");
  }

  /* opts: { title(), subject(), lines(form) optional, validate(form) optional } */
  function wire(form, opts) {
    var waBtn = form.querySelector('[data-send="wa"]');
    var mailBtn = form.querySelector('[data-send="email"]');

    function build() {
      var lines = opts.lines ? opts.lines() : pretty(form, collect(form));
      var title = opts.title();
      var wa = "*" + title + "*\n\n" + lines.map(function (l) { return l.label ? "*" + l.label + ":* " + l.value : l.value; }).join("\n");
      var plain = title + "\n\n" + lines.map(function (l) { return l.label ? l.label + ": " + l.value : l.value; }).join("\n");
      if (waBtn) waBtn.href = "https://wa.me/" + SITE.whatsapp + "?text=" + encodeURIComponent(wa);
      if (mailBtn) mailBtn.href = "mailto:" + SITE.email + "?subject=" + encodeURIComponent(opts.subject()) + "&body=" + encodeURIComponent(plain);
      return plain;
    }
    function valid() {
      form.classList.add("was-validated");
      var custom = opts.validate ? opts.validate() : "";
      if (custom) { status(form, custom, false); return false; }
      if (!form.checkValidity()) {
        form.reportValidity();
        status(form, "Please fill in the highlighted fields.", false);
        return false;
      }
      return true;
    }

    form.addEventListener("input", build);
    form.addEventListener("change", build);
    build();

    if (waBtn) waBtn.addEventListener("click", function (e) {
      if (!valid()) { e.preventDefault(); return; }
      build();
      status(form, "WhatsApp is opening with your details. Just press send. If it doesn’t open, message (876) 568-5668.", true);
    });

    if (mailBtn) mailBtn.addEventListener("click", function (e) {
      if (!valid()) { e.preventDefault(); return; }
      var plain = build();
      if (SITE.formEndpoint) {
        e.preventDefault();
        var fd = new FormData(form);
        fd.append("_subject", opts.subject());
        fd.append("summary", plain);
        status(form, "Sending…", true);
        fetch(SITE.formEndpoint, { method: "POST", body: fd, headers: { Accept: "application/json" } })
          .then(function (r) {
            if (!r.ok) throw new Error();
            status(form, "Thank you! Your request was sent. We’ll be in touch shortly.", true);
          })
          .catch(function () { status(form, "That didn’t go through. Please use WhatsApp or call (876) 568-5668.", false); });
        return;
      }
      status(form, "Your email app is opening with your details. If it doesn’t, email " + SITE.email + ".", true);
    });

    /* Enter key in a field = send on WhatsApp */
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (waBtn) waBtn.click();
    });

    return { build: build };
  }
  window.CEForms = { wire: wire, status: status };

  /* ---------- Booking form ---------- */
  var booking = document.getElementById("booking-form");
  if (booking) {
    var panels = booking.querySelectorAll("[data-panel]");
    function showPanel(key) {
      panels.forEach(function (p) {
        var on = p.getAttribute("data-panel") === key;
        p.hidden = !on;
        p.disabled = !on;
      });
    }
    booking.addEventListener("change", function (e) {
      var t = e.target;
      if (t.name === "service") showPanel(t.value);
      if (t.type === "radio" && t.name) {
        var other = booking.querySelector('[data-other-for="' + t.name + '"]');
        if (other) other.hidden = t.value !== "Others";
      }
      if (t.name === "session_length" || t.name === "session_start") autoEnd();
    }, true);

    /* Time ends = time starts + session length (unless edited by hand). */
    var end = booking.querySelector("[data-auto-end]");
    var endTouched = false;
    if (end) end.addEventListener("input", function () { endTouched = !!end.value; });
    function autoEnd() {
      var start = booking.querySelector('[name="session_start"]').value;
      var len = booking.querySelector('[name="session_length"]:checked');
      if (!end || endTouched || !start || !len) return;
      var mins = len.value.indexOf("30") === 0 ? 30 : 60;
      var parts = start.split(":");
      var total = (parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10) + mins) % 1440;
      end.value = String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
    }

    /* No past dates. */
    var today = new Date();
    var iso = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    booking.querySelectorAll('input[type="date"]').forEach(function (d) { d.min = iso; });

    /* Wedding package options from content.js */
    var wsel = booking.querySelector("[data-wedding-select]");
    if (wsel && window.WEDDING_PACKAGES) {
      window.WEDDING_PACKAGES.slice().reverse().forEach(function (p) {
        var o = document.createElement("option");
        o.textContent = p.name + (p.price ? " — " + p.price : "");
        wsel.insertBefore(o, wsel.firstChild);
      });
      wsel.selectedIndex = 0;
    }

    /* Pre-select from links like booking.html#wedding-fiwi or #id-design
       (booking.html?service=wedding&fiwi=1 also works). */
    var q = new URLSearchParams(window.location.search);
    function preselect(svc, fiwi, opt) {
      var picked = svc && booking.querySelector('input[name="service"][value="' + svc + '"]');
      if (!picked) return;
      picked.checked = true;
      showPanel(svc);
      if (fiwi) {
        var v = booking.querySelector('input[name="' + svc + '_fiwi"][value="Venue at Fiwi Place"]');
        if (v) v.checked = true;
      }
      if (opt && svc === "id") {
        var r = booking.querySelectorAll('input[name="id_option"]')[{ print: 0, design: 1, full: 2 }[opt]];
        if (r) r.checked = true;
      }
      booking.dispatchEvent(new Event("change"));
      setTimeout(function () { booking.scrollIntoView({ behavior: "smooth", block: "start" }); }, 400);
    }
    function fromHash() {
      var bits = (window.location.hash || "").slice(1).toLowerCase().split("-");
      if (!bits[0]) return;
      preselect(bits[0], bits[1] === "fiwi", bits[1] !== "fiwi" ? bits[1] : null);
    }
    if (q.get("service")) preselect(q.get("service"), !!q.get("fiwi"), q.get("option"));
    else fromHash();
    window.addEventListener("hashchange", fromHash);

    if (SITE.formEndpoint) {
      var lbl = booking.querySelector("[data-email-label]");
      if (lbl) lbl.textContent = "Submit request";
    }

    wire(booking, {
      title: function () { return "New booking request \u2014 Candid Expressions website"; },
      subject: function () {
        var r = booking.querySelector('input[name="service"]:checked');
        var n = booking.querySelector('[name="name"]').value.trim();
        return "Booking request: " + (r ? r.getAttribute("data-title") : "") + (n ? " \u2014 " + n : "");
      }
    });
  }

  /* ---------- Review form ---------- */
  var review = document.getElementById("review-form");
  if (review) {
    wire(review, {
      title: function () { return "New review \u2014 Candid Expressions website"; },
      subject: function () { return "Review from " + (review.querySelector('[name="name"]').value.trim() || "a client"); }
    });
  }

  if (CE.paintIcons) CE.paintIcons();
})();
