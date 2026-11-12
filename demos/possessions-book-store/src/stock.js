// "In Stock": a searchable card-catalogue of the shop's stock list, plus a
// per-visitor "My Booklist" that parents fill while browsing and then email
// or copy for the shop. Data comes from src/data/stock.json (embedded at build).
// No timers: rendering is batched with requestAnimationFrame, feedback uses WAAPI.

const SVG = 'http://www.w3.org/2000/svg';
const STATUS = { in: 'In stock', low: 'Few left', out: 'Out of stock' };
const RANK = { in: 0, low: 1, out: 2 };
const CATS = [
  ['School Textbooks', 'Textbooks'],
  ['Workbooks', 'Workbooks'],
  ['Stationery', 'Stationery'],
  ['Gifts', 'Gifts'],
];
const ALL = 'All levels';
const CAP = 24; // cards shown before "Show all"
const KEY = 'pbs-booklist';
const SHOP_EMAIL = 'possessionsbookshop@gmail.com';

// Book-cover colour and icon: by subject for books, by category otherwise.
const SUBJECT_COVER = {
  Mathematics: ['#1f4d38', 'sub-math'],
  English: ['#5d1b20', 'sub-english'],
  Science: ['#1d4a4c', 'sub-science'],
  'Social Studies': ['#24344a', 'sub-social'],
  Business: ['#6a2817', 'sub-business'],
  'Mixed subjects': ['#4e1c10', 'sub-mixed'],
};
const CATEGORY_COVER = {
  'School Textbooks': ['#4e1c10', 'book'],
  Workbooks: ['#2b5a43', 'workbook'],
  Stationery: ['#e6d5ae', 'pencil', 'is-light'],
  Gifts: ['#a8782c', 'gift', 'is-gift'],
};

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[–—]/g, '-');
const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// "maths" should find "Mathematics", "books" should find "book"
const has = (hay, word) => hay.includes(word) || (word.length > 3 && word.endsWith('s') && hay.includes(word.slice(0, -1)));
const levelParts = (l) => {
  const m = /^(.*?)\s*\((.*)\)$/.exec(l);
  return m ? [m[1], m[2]] : [l, ''];
};
const shortLevel = (l) => {
  if (/csec/i.test(l)) return 'CSEC';
  const m = /(\d+)\s*[–-]\s*(\d+)/.exec(l);
  if (m) return `${m[1]}–${m[2]}`;
  return l === ALL ? 'ALL' : l.slice(0, 6).toUpperCase();
};
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function icon(name, size) {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('width', size);
  s.setAttribute('height', size);
  s.setAttribute('aria-hidden', 'true');
  const u = document.createElementNS(SVG, 'use');
  u.setAttribute('href', '#i-' + name);
  s.appendChild(u);
  return s;
}

export function initStock({ reduce = false, html = document.documentElement } = {}) {
  const d = document;
  const $ = (id) => d.getElementById(id);
  const root = $('in-stock');
  const src = $('stock-data');
  if (!root || !src) return;
  let data;
  try {
    data = JSON.parse(src.textContent);
  } catch (e) {
    return;
  }

  const items = (data.items || []).map((it, i) => ({
    ...it,
    i,
    id: it.id || slug(`${it.item}-${it.level}`),
    status: STATUS[it.status] ? it.status : 'in',
    hay: norm([it.item, it.category, it.subject, it.level, /csec/i.test(it.level) ? 'cxc' : ''].join(' ')),
  }));
  const byId = new Map(items.map((it) => [it.id, it]));
  const sample = data.sample !== false;
  if (!sample) root.querySelectorAll('[data-sample-only]').forEach((n) => n.remove());
  const levels = (data.levels && data.levels.length ? data.levels : [...new Set(items.map((it) => it.level))]).filter((l) => l !== ALL);

  const form = root.querySelector('.stock__tools');
  const q = $('stock-q');
  const sortSel = $('stock-sort');
  const avail = $('stock-avail');
  const list = $('stock-list');
  const ledger = $('stock-count');
  const empty = $('stock-empty');
  const more = $('stock-more');

  const state = { cat: '', level: '', words: [], avail: false, sort: 'shelf', all: false };

  // every control counts what it would show given the *other* active filters
  const matches = (it, skip) =>
    (skip === 'cat' || !state.cat || it.category === state.cat) &&
    (skip === 'level' || !state.level || it.level === state.level || it.level === ALL) &&
    (!state.avail || it.status !== 'out') &&
    state.words.every((wd) => has(it.hay, wd));

  // ---- controls built from the data
  const chipEls = [['', 'All'], ...CATS].map(([value, label]) => {
    const b = el('button', 'chip');
    b.type = 'button';
    b.dataset.cat = value;
    b.setAttribute('aria-pressed', String(value === ''));
    const n = el('span', 'chip__n', '0');
    n.setAttribute('aria-hidden', 'true');
    b.append(el('span', null, label), n);
    $('stock-cats').appendChild(b);
    return b;
  });
  const tabEls = [['', 'All levels', ''], ...levels.map((l) => [l, ...levelParts(l)])].map(([value, title, sub]) => {
    const b = el('button', 'tab');
    b.type = 'button';
    b.dataset.level = value;
    b.setAttribute('aria-pressed', String(value === ''));
    // word joiner after dashes so "Grades 7–9" never breaks as "7–" / "9"
    b.append(el('span', 'tab__t', title.replace(/[–-]/g, '$&⁠')));
    if (sub) b.append(el('span', 'tab__s', sub));
    b.append(el('span', 'tab__n', ''));
    $('stock-levels').appendChild(b);
    return b;
  });

  // ---- booklist (kept in this browser only)
  const picked = new Set();
  try {
    (JSON.parse(localStorage.getItem(KEY)) || []).forEach((id) => byId.has(id) && picked.add(id));
  } catch (e) {
    /* storage blocked: the list still works for this visit */
  }
  const save = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...picked]));
    } catch (e) {
      /* ignore */
    }
  };

  // ---- cards
  function card(it, n) {
    const li = el('li', 'ccard');
    li.dataset.status = it.status;
    li.style.setProperty('--n', String(Math.min(n, 10)));

    const [cv, ic, mod] =
      it.category === 'Stationery' || it.category === 'Gifts'
        ? CATEGORY_COVER[it.category]
        : SUBJECT_COVER[it.subject] || CATEGORY_COVER[it.category] || ['#4e1c10', 'book'];
    const cover = el('div', 'ccard__cover');
    cover.setAttribute('aria-hidden', 'true');
    const book = el('span', 'ccard__book' + (mod ? ' ' + mod : ''));
    book.style.setProperty('--cv', cv);
    book.append(icon(ic, 26), el('b', null, shortLevel(it.level)));
    cover.append(book);

    const head = el('div', 'ccard__head');
    head.append(el('span', 'ccard__cat', it.category));
    if (sample) head.append(el('span', 'ccard__tag', 'Sample'));

    const status = el('p', 'ccard__status');
    status.append(el('i'), d.createTextNode(STATUS[it.status]));
    const add = el('button', 'ccard__add');
    add.type = 'button';
    add.dataset.id = it.id;
    add.setAttribute('aria-pressed', String(picked.has(it.id)));
    const off = el('span', 'is-off');
    off.append(icon('plus', 14), d.createTextNode('Add to list'));
    const on = el('span', 'is-on');
    on.append(icon('check', 14), d.createTextNode('On my list'));
    // spoken name starts with the visible words, then says which item
    add.append(off, on, el('span', 'sr-only', `: ${it.item}, ${it.level}`));
    const foot = el('div', 'ccard__foot');
    foot.append(status, add);

    const body = el('div', 'ccard__body');
    body.append(head, el('h4', 'ccard__title', it.item), el('p', 'ccard__meta', `${it.subject} · ${it.level}`), foot);
    li.append(cover, body);
    return li;
  }

  function render() {
    chipEls.forEach((b) => {
      const v = b.dataset.cat;
      b.lastChild.textContent = items.filter((it) => matches(it, 'cat') && (!v || it.category === v)).length;
    });
    tabEls.forEach((b) => {
      const v = b.dataset.level;
      const n = items.filter((it) => matches(it, 'level') && (!v || it.level === v || it.level === ALL)).length;
      b.lastChild.textContent = plural(n, 'item');
    });

    const hits = items.filter((it) => matches(it));
    const tally = { in: 0, low: 0, out: 0 };
    hits.forEach((it) => tally[it.status]++);
    const noun = sample ? 'sample item' : 'item';
    const total = el('span', 'is-total', hits.length === items.length ? plural(items.length, noun) : `${hits.length} of ${plural(items.length, noun)}`);
    ledger.replaceChildren(
      total,
      ...['in', 'low', 'out'].map((k) => {
        const s = el('span', 'is-' + k);
        s.append(el('i'), d.createTextNode(`${tally[k]} ${STATUS[k].toLowerCase()}`));
        return s;
      })
    );

    const sorter =
      state.sort === 'az'
        ? (a, b) => a.item.localeCompare(b.item) || a.i - b.i
        : state.sort === 'avail'
        ? (a, b) => RANK[a.status] - RANK[b.status] || a.i - b.i
        : (a, b) => a.i - b.i;
    const order = [...levels, ALL];
    const groups = order.map((lv) => [lv, hits.filter((it) => it.level === lv).sort(sorter)]).filter(([, g]) => g.length);
    const stray = hits.filter((it) => !order.includes(it.level)).sort(sorter);
    if (stray.length) groups.push(['Other', stray]);

    let budget = state.all ? Infinity : CAP;
    let n = 0;
    const frag = d.createDocumentFragment();
    for (const [lv, g] of groups) {
      if (budget <= 0) break;
      const group = el('div', 'shelf-group');
      const h = el('h3', 'shelf-label');
      const [title, sub] = lv === ALL ? ['For every level', ''] : levelParts(lv);
      h.append(d.createTextNode(title));
      if (sub) h.append(el('small', null, sub));
      h.append(el('small', 'shelf-label__n', plural(g.length, 'item')));
      const ul = el('ul', 'catalog');
      g.slice(0, budget).forEach((it) => ul.appendChild(card(it, n++)));
      budget -= g.length;
      group.append(h, ul);
      frag.appendChild(group);
    }
    list.replaceChildren(frag);

    empty.hidden = hits.length > 0;
    const shown = Math.min(hits.length, state.all ? hits.length : CAP);
    more.hidden = shown >= hits.length;
    if (!more.hidden) more.textContent = `Show all ${hits.length} items`;
  }

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      render();
    });
  };
  const refilter = () => {
    state.all = false;
    schedule();
  };
  const press = (els, current) => els.forEach((b) => b.setAttribute('aria-pressed', String(b === current)));

  // ---- control events
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    q.blur();
  });
  q.addEventListener('input', () => {
    state.words = norm(q.value).split(/[^a-z0-9-]+/).filter(Boolean);
    refilter();
  });
  root.querySelectorAll('.try').forEach((b) =>
    b.addEventListener('click', () => {
      q.value = b.dataset.q;
      q.dispatchEvent(new Event('input'));
    })
  );
  chipEls.forEach((b) =>
    b.addEventListener('click', () => {
      press(chipEls, b);
      state.cat = b.dataset.cat;
      refilter();
    })
  );
  tabEls.forEach((b) =>
    b.addEventListener('click', () => {
      press(tabEls, b);
      state.level = b.dataset.level;
      refilter();
    })
  );
  sortSel.addEventListener('change', () => {
    state.sort = sortSel.value;
    refilter();
  });
  avail.addEventListener('change', () => {
    state.avail = avail.checked;
    refilter();
  });
  $('stock-reset').addEventListener('click', () => {
    q.value = '';
    state.words = [];
    state.cat = '';
    state.level = '';
    state.avail = avail.checked = false;
    press(chipEls, chipEls[0]);
    press(tabEls, tabEls[0]);
    render();
    q.focus();
  });
  more.addEventListener('click', () => {
    const before = list.querySelectorAll('.ccard').length;
    state.all = true;
    render();
    const next = list.querySelectorAll('.ccard')[before];
    if (next) {
      next.tabIndex = -1;
      next.focus({ preventScroll: true });
    }
  });
  // "/" jumps to the search box (desktop habit)
  d.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || dlg.open) return;
    if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    e.preventDefault();
    q.focus();
  });

  // ---- my booklist: floating button + dialog
  const fab = $('mylist-open');
  const fabN = $('mylist-n');
  const dlg = $('mylist');
  const dItems = $('mylist-items');
  const dEmpty = $('mylist-empty');
  const actions = dlg.querySelector('.mylist__actions');
  const mail = $('mylist-mail');
  const copyBtn = $('mylist-copy');
  const copyLabel = copyBtn.querySelector('span');
  const clearBtn = $('mylist-clear');
  const ping = el('span', 'mylist-fab__ping');
  ping.setAttribute('aria-hidden', 'true');
  fab.appendChild(ping);

  const lines = () =>
    [...picked].map((id, k) => {
      const it = byId.get(id);
      return `${k + 1}. ${it.item} (${it.subject}, ${it.level})`;
    });

  function syncCards() {
    list.querySelectorAll('.ccard__add').forEach((b) => b.setAttribute('aria-pressed', String(picked.has(b.dataset.id))));
  }
  function syncList(bump) {
    const n = picked.size;
    fabN.textContent = n;
    fab.setAttribute('aria-label', `Open my booklist, ${plural(n, 'item')}`);
    if (n && fab.hidden) {
      fab.hidden = false;
      requestAnimationFrame(() => fab.classList.add('is-on'));
    } else {
      fab.classList.toggle('is-on', n > 0);
    }
    if (bump && n && !reduce && ping.animate) {
      ping.animate([{ opacity: 0.9, transform: 'scale(.8)' }, { opacity: 0, transform: 'scale(1.8)' }], { duration: 650, easing: 'ease-out' });
    }
    dItems.replaceChildren(
      ...[...picked].map((id) => {
        const it = byId.get(id);
        const li = el('li');
        const name = el('span', 'mylist__name', it.item);
        name.append(el('small', null, `${it.subject} · ${it.level}`));
        const rm = el('button', 'mylist__rm');
        rm.type = 'button';
        rm.dataset.id = id;
        rm.setAttribute('aria-label', `Remove ${it.item}, ${it.level}, from my booklist`);
        rm.append(icon('close', 18));
        li.append(name, rm);
        return li;
      })
    );
    dEmpty.hidden = n > 0;
    actions.hidden = n === 0;
    clearBtn.hidden = n === 0;
    const body = `Hello Possessions Book Store,\n\nI am looking for these items:\n\n${lines().join('\n')}\n\nThank you.`;
    mail.href = `mailto:${SHOP_EMAIL}?subject=${encodeURIComponent('My booklist')}&body=${encodeURIComponent(body)}`;
  }

  list.addEventListener('click', (e) => {
    const b = e.target.closest('.ccard__add');
    if (!b) return;
    const id = b.dataset.id;
    if (picked.has(id)) picked.delete(id);
    else picked.add(id);
    save();
    b.setAttribute('aria-pressed', String(picked.has(id)));
    syncList(picked.has(id));
  });

  fab.addEventListener('click', () => {
    if (typeof dlg.showModal === 'function') dlg.showModal();
    else dlg.setAttribute('open', '');
    html.classList.add('dialog-open');
  });
  const close = () => (typeof dlg.close === 'function' ? dlg.close() : dlg.removeAttribute('open'));
  $('mylist-close').addEventListener('click', close);
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) close(); // backdrop
  });
  dlg.addEventListener('close', () => {
    html.classList.remove('dialog-open');
    if (picked.size) fab.focus({ preventScroll: true });
  });
  dItems.addEventListener('click', (e) => {
    const b = e.target.closest('.mylist__rm');
    if (!b) return;
    const idx = [...dItems.children].indexOf(b.closest('li'));
    picked.delete(b.dataset.id);
    save();
    syncList(false);
    syncCards();
    // keep focus in the list: the row that moved into this spot, else the one above, else Close
    const target = dItems.children[Math.min(idx, dItems.children.length - 1)];
    (target ? target.querySelector('.mylist__rm') : $('mylist-close')).focus();
  });
  clearBtn.addEventListener('click', () => {
    picked.clear();
    save();
    syncList(false);
    syncCards();
    $('mylist-close').focus();
  });
  const flash = (text) => {
    copyLabel.textContent = text;
    copyBtn.animate([{ opacity: 1 }, { opacity: 1 }], { duration: 1800 }).onfinish = () => {
      copyLabel.textContent = 'Copy list';
    };
  };
  copyBtn.addEventListener('click', () => {
    const text = `My booklist\n\n${lines().join('\n')}\n\nPossessions Book Store: ${SHOP_EMAIL} · (876) 918-1433 · (876) 327-8718`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => flash('Copied'),
        () => flash('Copy not available')
      );
    } else {
      flash('Copy not available');
    }
  });

  render();
  syncList(false);
}
