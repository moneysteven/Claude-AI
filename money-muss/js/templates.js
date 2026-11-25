// Templates shared by the browser (js/main.js) and the build step (tools/build.mjs).
// One source for how the menu and the weekly specials are drawn, so the page looks
// the same whether it was stamped into index.html or re-drawn from fresh data.

const TODO_RE = /\[Owner to fill in:[^\]]*\]/g;

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Escapes text and gives every "[Owner to fill in: …]" its visible placeholder style.
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

function dishHTML(item, currency) {
  const tags = [];
  if (item.dineIn === true) tags.push('Dine-in');
  if (item.toGo === true) tags.push('To Go');
  const open = item.price === null || item.price === undefined || item.price === '';
  return `<li class="dish${open ? ' dish--open' : ''}">
<div class="dish__row"><span class="dish__name">${withTodos(item.name)}</span><span class="dish__rule" aria-hidden="true"></span><span class="dish__price">${priceHTML(item.price, currency)}</span></div>${
    item.description ? `\n<p class="dish__desc">${withTodos(item.description)}</p>` : ''
  }${
    tags.length ? `\n<p class="dish__tags">${tags.map((t) => `<span class="tag">${t}</span>`).join('')}</p>` : ''
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
  return `<div class="tabs" style="--tabs:${sections.length}"><div class="tabs__list">${tabs}<span class="tabs__pill" aria-hidden="true"></span></div></div>
<div class="menu-panels">
${panels}
</div>`;
}

export function specialsHTML(data) {
  const live = (data.specials || []).filter((s) => s && s.active !== false && s.title);
  if (!live.length) {
    return '<p class="posters__empty">No weekly specials are listed right now. Call us to hear what is on.</p>';
  }
  return live
    .map((s, i) => {
      const tone = ['cream', 'rose', 'crimson', 'navy'].includes(s.tone) ? s.tone : ['cream', 'rose'][i % 2];
      return `<article class="poster poster--${tone} reveal">
<h3 class="poster__title">${withTodos(s.title)}</h3>${s.subtitle ? `\n<p class="poster__sub">${withTodos(s.subtitle)}</p>` : ''}
<p class="poster__when">${withTodos(s.when)}</p>
<p class="poster__text">${withTodos(s.text)}</p>
</article>`;
    })
    .join('\n');
}
