/* ============ messages: WhatsApp-style chat per booking ============ */
const MessagesView = {
  id: "messages", large: true, ptr: true, title: () => "Messages",
  render() {
    const side = Nav.role === "business" ? "business" : "customer";
    const bks = side === "customer" ? custBookings() : bizBookings(S.hostBizId);
    const threads = bks.filter(b => threadMsgs(b.id).length).map(b => ({ b, last: threadMsgs(b.id)[threadMsgs(b.id).length - 1], unread: unreadFor(b.id, side) })).sort((a, z) => z.last.at - a.last.at);
    return `<div class="inner"><h1 class="large-title">Messages</h1>
      <p class="lede">${side === "customer" ? "Chat with hosts about each booking." : `Customer chats for ${esc(getB(S.hostBizId)?.name || "your business")}.`}</p>
      ${threads.length ? `<div class="group stagger go" data-skel>${threads.map(({ b, last, unread }, i) => {
        const biz = getB(b.businessId); const v = getV(b.vehicleId); const name = side === "customer" ? biz.name : customerName(b);
        const who = last.from === side ? "You: " : "";
        return `<button type="button" class="thread tap" style="--i:${i}" data-act="openChat" data-id="${b.id}" data-side="${side}">${side === "customer" ? bizLogo(biz) : avatar(name)}<div>
          <div class="th-top"><b>${esc(name)}</b><time>${fmtWhen(last.at)}</time></div>
          <div class="th-sub">${esc(vName(v))} · ${b.ref} · ${fmtDate(b.start)}</div>
          <div class="th-last ${unread ? "unread" : ""}"><span>${esc(who + last.text)}</span>${unread ? `<b class="unread-dot">${unread}</b>` : ""}</div></div></button>`;
      }).join("")}</div>` : emptyState("chat", "No messages yet", side === "customer" ? "Each booking gets its own chat with the host." : "Customer messages for your bookings appear here.")}
    </div>`;
  },
};

function bubbleHTML(m, side, prev) {
  if (m.from === "system") return `<div class="bubble sys">${esc(m.text)}</div>`;
  const mine = m.from === side; const first = !prev || prev.from !== m.from || m.at - prev.at > 30 * MIN;
  return `<div class="bubble ${mine ? "out" : "in"} ${first ? "first" : ""}">${m.auto ? `<span class="auto">Auto-reply · demo</span>` : ""}${esc(m.text)}<span class="meta">${fmtClock(m.at)}${mine ? `<span class="ticks">${icon("ticks")}</span>` : ""}</span></div>`;
}
function msgsHTML(list, side) {
  let html = "", lastDay = null, prev = null;
  for (const m of list) { const d = sod(m.at); if (d !== lastDay) { html += `<div class="day-sep">${fmtDayHeader(m.at)}</div>`; lastDay = d; prev = null; } html += bubbleHTML(m, side, prev); prev = m; }
  return html;
}

const ChatView = {
  id: "chat", hideTabs: true, pageClass: "chat-page",
  title: ctx => { const bk = getBk(ctx.params.id); if (!bk) return "Chat"; return ctx.params.side === "business" ? customerName(bk) : getB(bk.businessId).name; },
  navRight: ctx => `<button type="button" class="nav-btn press" data-act="${ctx.params.side === "business" ? "openHostBooking" : "openTrip"}" data-id="${ctx.params.id}" aria-label="Booking details">${icon("info")}</button>`,
  render(ctx) {
    const bk = getBk(ctx.params.id); if (!bk) return emptyState("chat", "Chat not found", "This booking no longer exists.");
    const v = getV(bk.vehicleId); const side = ctx.params.side;
    return `<div class="inner">
      <button type="button" class="chat-card press" data-act="${side === "business" ? "openHostBooking" : "openTrip"}" data-id="${bk.id}"><img src="${coverURL(v)}" alt=""><div><b>${esc(vFull(v))} · ${bk.ref}</b>${fmtDate(bk.start)} → ${fmtDate(bk.end)} · ${STATUS[bk.status].label}</div>${chev()}</button>
      <div class="msgs" id="msgs">${msgsHTML(threadMsgs(bk.id), side)}</div><div id="typing"></div></div>`;
  },
  fixed(ctx) {
    const side = ctx.params.side; const bk = getBk(ctx.params.id); if (!bk) return "";
    const quick = side === "customer" ? ["What time can I pick up?", "Is the deposit refundable?", "Can you deliver to my hotel?", "Running 30 minutes late, is that OK?"] : null;
    const sugg = side === "business" ? (ctx.local.sugg || []) : [];
    return `<div class="composer glass">
      <div class="sugg hscroll" id="sugg">${side === "business"
        ? `<button type="button" class="chip ai press" data-act="suggest">${icon("sparkles")}${ctx.local.sugg ? "New suggestions" : "Suggest replies"}</button>${ctx.local.loading ? `<span class="chip sk"></span><span class="chip sk"></span>` : sugg.map((t, i) => `<button type="button" class="chip press" data-act="useSugg" data-i="${i}" title="${esc(t)}">${esc(t)}</button>`).join("")}`
        : quick.map(t => `<button type="button" class="chip press" data-act="quick" data-t="${esc(t)}">${esc(t)}</button>`).join("")}</div>
      <div class="comp-row"><textarea id="chatInput" rows="1" placeholder="Message" data-input="grow" aria-label="Message"></textarea><button type="button" class="send press" data-act="send" aria-label="Send">${icon("send")}</button></div></div>`;
  },
  mount(ctx) {
    const side = ctx.params.side; const id = ctx.params.id;
    if (unreadFor(id, side)) { markRead(S, id, side); Store.save(); Nav.updateBadges(); }
    requestAnimationFrame(() => { ctx.scroller.scrollTop = ctx.scroller.scrollHeight; });
    const ta = ctx.fixed.querySelector("textarea");
    if (ta) ta.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); ChatView.actions.send(null, ctx); } });
  },
  inputs: { grow: t => { t.style.height = "auto"; t.style.height = Math.min(120, t.scrollHeight) + "px"; } },
  actions: {
    send: (t, ctx) => { const ta = ctx.fixed.querySelector("textarea"); const text = ta.value.trim(); if (!text) return; ta.value = ""; ta.style.height = ""; postChat(ctx, text); },
    quick: (t, ctx) => postChat(ctx, t.dataset.t),
    useSugg: (t, ctx) => { const ta = ctx.fixed.querySelector("textarea"); ta.value = ctx.local.sugg[+t.dataset.i] || ""; ta.focus(); ChatView.inputs.grow(ta); haptic(4); },
    suggest: async (t, ctx) => {
      if (ctx.local.loading) return; ctx.local.loading = true; refreshComposer(ctx);
      const bk = getBk(ctx.params.id);
      try { ctx.local.sugg = await suggestReplies(bk); }
      catch (e) { ctx.local.sugg = localReplySuggestions(bk); if (e && e.code !== "unavailable") toast(e.code === "not_granted" ? "AI declined — showing template replies" : "AI unavailable — showing template replies", { tone: "warn" }); }
      ctx.local.loading = false; refreshComposer(ctx);
    },
  },
};
function refreshComposer(ctx) { const old = ctx.fixed.querySelector("#sugg"); if (!old) return; const tmp = document.createElement("div"); tmp.innerHTML = ChatView.fixed(ctx); const fresh = tmp.querySelector("#sugg"); old.replaceWith(fresh); fresh.classList.add("fade-in"); }
function appendBubble(ctx, m) {
  const box = ctx.content.querySelector("#msgs"); if (!box) return;
  const list = threadMsgs(ctx.params.id); const prev = list[list.length - 2];
  const tmp = document.createElement("div"); tmp.innerHTML = bubbleHTML(m, ctx.params.side, prev && sod(prev.at) === sod(m.at) ? prev : null);
  const el = tmp.firstElementChild; el.classList.add("new"); box.appendChild(el);
  ctx.scroller.scrollTo({ top: ctx.scroller.scrollHeight, behavior: reduced() ? "auto" : "smooth" });
}
function postChat(ctx, text) {
  const side = ctx.params.side, id = ctx.params.id; const m = { from: side, text, at: jmNow() };
  commit(st => { (st.messages[id] = st.messages[id] || []).push(m); markRead(st, id, side); }, { render: false });
  for (const k in Nav.stacks) for (const p of Nav.stacks[k].pages) if (p !== ctx) p.dirty = true;
  appendBubble(ctx, m); haptic(6);
  if (side === "customer") simulateHostReply(ctx, text);
}
function simulateHostReply(ctx, text) {
  const bk = getBk(ctx.params.id); const b = getB(bk.businessId); const v = getV(bk.vehicleId); const t = text.toLowerCase();
  let reply;
  if (/deposit|refund|hold/.test(t)) reply = `Yes, the ${moneyJ(bk.quote.deposit)} deposit is a refundable hold. It’s released 3–5 business days after return if there’s no new damage.`;
  else if (/deliver|hotel|drop/.test(t)) reply = offers(v, "hotel") ? `We can deliver to your hotel for ${moneyJ(v.pickupOpts.hotel.fee)}. Send the hotel name and we’ll add it to the booking.` : "Sorry, this vehicle is pick-up only. We’ll meet you at the pick-up point on your booking.";
  else if (/late|delay|traffic/.test(t)) reply = `No problem, thanks for letting us know. There’s a 59-minute grace period, then late returns are charged by the hour.`;
  else if (/seat|child|baby|pickney/.test(t)) reply = `Child seats are ${moneyJ(EXTRAS.childSeat.perDay)} a day each. Tell us how many and the ages and we’ll have them installed.`;
  else if (/time|pick ?up|when|arriv|flight|land/.test(t)) reply = `Our hours are ${b.hours}. We’ll see you at ${pickupLong(bk)} for your booked time of ${fmtTime(bk.start)}. Share your flight or arrival time if it changes.`;
  else if (/fuel|gas|petrol|diesel/.test(t)) reply = FUEL_POLICIES[b.fuelPolicy].desc;
  else reply = "Thanks for your message! We’ll reply properly as soon as we can.";
  const typing = ctx.content.querySelector("#typing");
  setTimeout(() => { if (!typing.isConnected) return; typing.innerHTML = `<div class="bubble in first" style="width:max-content"><span class="typing"><i></i><i></i><i></i></span></div>`; ctx.scroller.scrollTo({ top: ctx.scroller.scrollHeight, behavior: reduced() ? "auto" : "smooth" }); }, 700);
  setTimeout(() => {
    const m = { from: "business", text: reply, at: jmNow(), auto: true };
    commit(st => { (st.messages[bk.id] = st.messages[bk.id] || []).push(m); if (typing.isConnected && Nav.top() === ctx) markRead(st, bk.id, "customer"); }, { render: false });
    for (const k in Nav.stacks) for (const p of Nav.stacks[k].pages) if (p !== ctx) p.dirty = true;
    if (typing.isConnected) { typing.innerHTML = ""; appendBubble(ctx, m); }
    Nav.updateBadges();
  }, 2100);
}
function localReplySuggestions(bk) {
  const b = getB(bk.businessId); const v = getV(bk.vehicleId); const last = [...threadMsgs(bk.id)].reverse().find(m => m.from === "customer"); const t = (last?.text || "").toLowerCase();
  const out = [];
  if (/time|7:30|early|later|instead|collect|pick/.test(t)) out.push(`Let me check the driver’s schedule and confirm the new time within the hour.`, `That should be fine. Please confirm the exact address for pick-up.`);
  if (/deposit|refund/.test(t)) out.push(`The ${moneyJ(bk.quote.deposit)} deposit is released 3–5 business days after return if there’s no new damage.`);
  if (/deliver|hotel/.test(t)) out.push(offers(v, "hotel") ? `We can deliver to your hotel for ${moneyJ(v.pickupOpts.hotel.fee)}. Which hotel are you staying at?` : `This vehicle is collected from ${vLoc(v)}.`);
  if (/flight|land|arriv/.test(t)) out.push(`Thanks! We’ll track your flight and meet you at ${pickupLong(bk)}.`);
  out.push(`Thanks for booking with ${b.name}! See you on ${fmtDate(bk.start)} at ${fmtTime(bk.start)}.`, `Our hours are ${b.hours}. Call or WhatsApp ${b.whatsapp} if anything changes.`);
  return [...new Set(out)].slice(0, 3);
}
