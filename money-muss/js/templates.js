// Templates shared by the browser (js/main.js) and the build step (tools/build.mjs).
// One source for how the menu, the favourites label, the weekly-night tickets and the
// marquee are drawn, so the page looks the same whether it was stamped into index.html
// or re-drawn from fresh data.

const TODO_RE = /\[Owner to (?:fill in|confirm)[^\]]*\]/g;

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Escapes text and gives every "[Owner to fill in: …]" / "[Owner to confirm …]" its visible placeholder style.
export function withTodos(value) {
  return esc(value).replace(TODO_RE, (m) => `<span class="todo">${m}</span>`);
}

export function priceHTML(price, currency = 'J$') {
  if (price === null || price === undefined || price === '') {
    return '<span class="todo">[Owner to fill in: price]</span>';
  }
  if (typeof price === 'number' && Number.isFinite(price)) {
    return `${esc(currency)}${price.toLocaleString('en-US')}`;
  }
  return withTodos(price);
}

/* ------------------------------------------------------------------ menu */

function dishHTML(item, currency) {
  const stamps = [];
  if (item.dineIn === true) stamps.push('Dine-in');
  if (item.toGo === true) stamps.push('To go');
  const open = item.price === null || item.price === undefined || item.price === '';
  return `<li class="dish${open ? ' dish--open' : ''}">
<div class="dish__row"><span class="dish__name">${withTodos(item.name)}</span><span class="dish__dots" aria-hidden="true"></span><span class="dish__price">${priceHTML(item.price, currency)}</span></div>${
    item.description ? `\n<p class="dish__desc">${withTodos(item.description)}</p>` : ''
  }${
    stamps.length ? `\n<p class="dish__stamps">${stamps.map((t) => `<span class="inkstamp">${t}</span>`).join('')}</p>` : ''
  }
</li>`;
}

export function menuHTML(menu) {
  const currency = menu.currency || 'J$';
  const sections = (menu.sections || []).filter((s) => s && s.id && s.label);
  if (!sections.length) return '';
  const tabs = sections
    .map((s, i) => `<button class="tabs__tab${i === 0 ? ' is-active' : ''}" type="button" data-tab="${esc(s.id)}">${esc(s.label)}</button>`)
    .join('');
  const panels = sections
    .map((s, i) => {
      const items = (s.items || []).map((item) => dishHTML(item, currency)).join('\n');
      return `<div class="menu-panel${i === 0 ? ' is-active' : ''}" id="menu-${esc(s.id)}" data-panel="${esc(s.id)}">
<h3 class="menu-panel__title">${esc(s.label)}</h3>${s.note ? `\n<p class="menu-panel__note">${withTodos(s.note)}</p>` : ''}
<ul class="dishes">
${items}
</ul>
</div>`;
    })
    .join('\n');
  return `<div class="tabs"><div class="tabs__list">${tabs}</div></div>
<div class="menu-sheet">
${panels}
</div>`;
}

// The "Jamaican favourites" label: names only, set like the front of a rum label.
export function favouritesHTML(menu) {
  const f = menu.favourites;
  const items = ((f && f.items) || []).filter((i) => i && i.name);
  if (!items.length) return '';
  const list = items
    .map((i) => `<li>${withTodos(i.name)}${i.note ? ` <small>${withTodos(i.note)}</small>` : ''}</li>`)
    .join('\n');
  return `<div class="label favs">
<h3 class="label__title">${withTodos(f.title || 'Jamaican favourites')}</h3>
<p class="label__kicker">${withTodos(f.kicker || 'From the kitchen')}</p>
<ul class="favs__list">
${list}
</ul>${f.note ? `\n<p class="favs__note">${withTodos(f.note)}</p>` : ''}
</div>`;
}

/* ------------------------------------------------------------------ weekly nights */

const TONES = ['navy', 'cream', 'crimson', 'rose', 'olive'];
const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

export function liveSpecials(data) {
  return ((data && data.specials) || []).filter((s) => s && s.active !== false && s.title);
}

// "Five reasons", "One reason": the heading counts whatever is switched on in specials.json.
export function countPhrase(data) {
  const n = liveSpecials(data).length;
  if (!n) return 'Reasons';
  return `${WORDS[n] || String(n)} reason${n === 1 ? '' : 's'}`;
}

function scratchHTML(scratch) {
  const deals = (scratch.deals || [])
    .filter((d) => d && (d.name || d.detail))
    .map((d) => `<li><span class="deal__name">${withTodos(d.name)}</span><span class="deal__detail">${withTodos(d.detail)}</span></li>`)
    .join('\n');
  if (!deals) return '';
  return `
<div class="scratch" data-scratch>
<p class="scratch__label">${withTodos(scratch.label || 'The deals')}</p>
<ul class="scratch__deals">
${deals}
</ul>
</div>${scratch.note ? `\n<p class="ticket__confirm">${withTodos(scratch.note)}</p>` : ''}`;
}

function ticketHTML(s, i) {
  const tone = TONES.includes(s.tone) ? s.tone : TONES[i % TONES.length];
  const stub = String(s.stub || '').trim().slice(0, 5).toUpperCase();
  const serial = String(i + 1).padStart(4, '0');
  const scratch = s.scratch ? scratchHTML(s.scratch) : '';
  return `<article class="ticket ticket--${tone}${scratch ? ' ticket--big' : ''} reveal">
<div class="ticket__paper">
<div class="ticket__stub" aria-hidden="true"><span class="ticket__day" data-len="${stub.length}">${esc(stub)}</span></div>
<div class="ticket__body">
<h3 class="ticket__title">${withTodos(s.title)}</h3>${s.subtitle ? `\n<p class="ticket__sub">${withTodos(s.subtitle)}</p>` : ''}
<p class="ticket__when">${withTodos(s.when)}</p>
<p class="ticket__text">${withTodos(s.text)}</p>${scratch}
<p class="ticket__serial" aria-hidden="true">No. MM ${serial}</p>
</div>
</div>
</article>`;
}

export function specialsHTML(data) {
  const live = liveSpecials(data);
  if (!live.length) {
    return '<p class="tickets__empty">No weekly nights are listed right now. Call us to hear what is on.</p>';
  }
  return live.map(ticketHTML).join('\n');
}

// The strip under the hero: every night that is switched on, plus any extras named in the data.
export function marqueeHTML(data) {
  const names = [...liveSpecials(data).map((s) => s.title), ...((data && data.marqueeExtras) || [])]
    .map((n) => String(n || '').trim())
    .filter(Boolean);
  if (!names.length) return '';
  const star = '<svg class="marquee__star" aria-hidden="true" focusable="false"><use href="#i-star"/></svg>';
  const set = (copy) => `<ul class="marquee__set"${copy ? ' aria-hidden="true"' : ''}>
${names.map((n) => `<li>${esc(n)}${star}</li>`).join('\n')}
</ul>`;
  // Four identical sets: the track slides by exactly one of them, so the loop never shows a gap.
  return `<div class="marquee__track" style="--items:${names.length}">
${set(false)}
${set(true)}
${set(true)}
${set(true)}
</div>`;
}
