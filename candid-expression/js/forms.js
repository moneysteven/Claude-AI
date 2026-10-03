/* Candid Expressions — booking & review forms.
   Forms are sent through WhatsApp or email (no server needed). If
   SITE.formEndpoint is set in content.js, the email button submits the
   form there instead (e.g. Formspree). */
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

  function send(form, via, title, subject) {
    form.classList.add("was-validated");
    if (!form.checkValidity()) {
      form.reportValidity();
      status(form, "Please fill in the highlighted fields.", false);
      return;
    }
    var lines = pretty(form, collect(form));
    var wa = "*" + title + "*\n\n" + lines.map(function (l) { return "*" + l.label + ":* " + l.value; }).join("\n");
    var plain = title + "\n\n" + lines.map(function (l) { return l.label + ": " + l.value; }).join("\n");

    if (via === "email" && SITE.formEndpoint) {
      var fd = new FormData(form);
      fd.append("_subject", subject);
      fd.append("summary", plain);
      status(form, "Sending…", true);
      fetch(SITE.formEndpoint, { method: "POST", body: fd, headers: { Accept: "application/json" } })
        .then(function (r) {
          if (!r.ok) throw new Error();
          status(form, "Thank you! Your request was sent — we’ll be in touch shortly.", true);
          form.reset();
          form.classList.remove("was-validated");
          form.dispatchEvent(new Event("change"));
        })
        .catch(function () { status(form, "Sorry, that didn’t go through. Please try WhatsApp or call (876) 568-5668.", false); });
      return;
    }

    var url = via === "wa"
      ? "https://wa.me/" + SITE.whatsapp + "?text=" + encodeURIComponent(wa)
      : "mailto:" + SITE.email + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(plain);
    if (via === "wa") window.open(url, "_blank", "noopener"); else window.location.href = url;
    status(form, via === "wa"
      ? "WhatsApp is opening with your details — just press send. Not opening? Message (876) 568-5668."
      : "Your email app is opening with your details — just press send.", true);
  }

  function wire(form, getTitle, getSubject) {
    var via = "wa";
    form.querySelectorAll("[data-send]").forEach(function (b) {
      b.addEventListener("click", function () { via = b.getAttribute("data-send"); });
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      send(form, via, getTitle(), getSubject());
    });
  }
  window.CEForms = { wire: wire, send: send };

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
      if (t === booking) {
        var checked = booking.querySelector('input[name="service"]:checked');
        showPanel(checked ? checked.value : "");
      }
    });

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
      window.WEDDING_PACKAGES.forEach(function (p) {
        var o = document.createElement("option");
        o.textContent = p.name + (p.price ? " — " + p.price : "");
        wsel.insertBefore(o, wsel.firstChild);
      });
      wsel.selectedIndex = 0;
    }

    /* Pre-select from links like booking.html?service=wedding&fiwi=1 */
    var q = new URLSearchParams(window.location.search);
    var svc = q.get("service");
    if (svc) {
      var r = booking.querySelector('input[name="service"][value="' + svc + '"]');
      if (r) { r.checked = true; showPanel(svc); }
    }
    if (q.get("fiwi") && svc) {
      var v = booking.querySelector('input[name="' + svc + '_fiwi"][value="Venue at Fiwi Place"]');
      if (v) v.checked = true;
    }
    var opt = q.get("option");
    if (opt && svc === "id") {
      var map = { print: 0, design: 1, full: 2 };
      var radios = booking.querySelectorAll('input[name="id_option"]');
      if (radios[map[opt]]) radios[map[opt]].checked = true;
    }

    if (SITE.formEndpoint) {
      var lbl = booking.querySelector("[data-email-label]");
      if (lbl) lbl.textContent = "Submit request";
      var note = booking.querySelector(".form-note");
      if (note) note.textContent = "Send on WhatsApp, or submit the form and we’ll reply by phone or email.";
    }

    wire(booking,
      function () { return "New booking request — Candid Expressions website"; },
      function () {
        var r = booking.querySelector('input[name="service"]:checked');
        var n = booking.querySelector('[name="name"]').value.trim();
        return "Booking request: " + (r ? r.getAttribute("data-title") : "") + (n ? " — " + n : "");
      });
  }

  /* ---------- Review form ---------- */
  var review = document.getElementById("review-form");
  if (review) {
    wire(review,
      function () { return "New review — Candid Expressions website"; },
      function () { return "Review from " + (review.querySelector('[name="name"]').value.trim() || "a client"); });
  }

  if (CE.paintIcons) CE.paintIcons();
})();
