'use strict';

// ---------- tiny helpers ----------------------------------------------------
const $main = document.getElementById('main');

// h('div', {class: 'x', onclick: fn}, child, ...) — builds DOM without innerHTML.
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty body */ }
  if (res.status === 401 && path !== '/login' && path !== '/me/password') { boot(); throw new Error(data.error || 'Please sign in.'); }
  if (!res.ok) { const e = new Error(data.error || `Error ${res.status}`); e.status = res.status; e.data = data; throw e; }
  return data;
}

function toast(msg) {
  const t = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDateTime = (iso) => new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
const fullName = (s) => `${s.first_name} ${s.last_name}`;
const field = (label, input) => h('div', {}, h('label', {}, label), input);
const errorLine = () => h('p', { class: 'error', role: 'alert' });

function beep(ok) {
  try {
    const ctx = beep.ctx || (beep.ctx = new (window.AudioContext || window.webkitAudioContext)());
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = ok ? 880 : 220;
    o.type = ok ? 'sine' : 'square';
    g.gain.value = 0.08;
    o.connect(g).connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + (ok ? 0.12 : 0.45));
  } catch { /* no audio */ }
}

// ---------- app state & navigation -----------------------------------------
const state = { user: null, today: null, products: [], tab: 'serve' };

const TABS = [
  { id: 'serve', label: 'Serve', render: renderServe },
  { id: 'today', label: 'Today', render: renderToday },
  { id: 'students', label: 'Students', render: renderStudents, admin: true },
  { id: 'products', label: 'Products', render: renderProducts, admin: true },
  { id: 'reports', label: 'Reports', render: renderReports, admin: true },
  { id: 'staff', label: 'Staff', render: renderStaff, admin: true },
  { id: 'account', label: 'Account', render: renderAccount },
];

function show(...nodes) { $main.replaceChildren(...nodes); }

function go(tab) {
  state.tab = tab;
  if (location.hash !== `#${tab}`) history.replaceState(null, '', `#${tab}`);
  for (const b of document.querySelectorAll('#tabs button')) b.classList.toggle('active', b.dataset.tab === tab);
  const t = TABS.find((x) => x.id === tab) || TABS[0];
  Promise.resolve(t.render()).catch((e) => show(h('div', { class: 'card' }, h('p', { class: 'error' }, e.message))));
}

async function boot() {
  const status = await api('/status');
  state.today = status.today;
  const topbar = document.getElementById('topbar');
  const tabs = document.getElementById('tabs');
  if (status.needsSetup) { topbar.hidden = tabs.hidden = true; return renderSetup(); }
  if (!status.user) { topbar.hidden = tabs.hidden = true; return renderLogin(); }

  state.user = status.user;
  topbar.hidden = tabs.hidden = false;
  document.getElementById('who').replaceChildren(
    h('div', {}, state.user.name), h('div', { class: 'small' }, state.user.role === 'admin' ? 'Administrator' : 'Staff'));
  const visible = TABS.filter((t) => !t.admin || state.user.role === 'admin');
  tabs.replaceChildren(...visible.map((t) => h('button', { 'data-tab': t.id, onclick: () => go(t.id) }, t.label)));
  const wanted = location.hash.slice(1);
  go(visible.some((t) => t.id === wanted) ? wanted : 'serve');
}

// ---------- setup & login ---------------------------------------------------
function renderSetup() {
  const name = h('input', { autocomplete: 'name', required: true });
  const username = h('input', { autocomplete: 'username', autocapitalize: 'none', required: true });
  const password = h('input', { type: 'password', autocomplete: 'new-password', minlength: 8, required: true });
  const confirm = h('input', { type: 'password', autocomplete: 'new-password', required: true });
  const err = errorLine();
  const form = h('form', {
    async onsubmit(e) {
      e.preventDefault();
      if (password.value !== confirm.value) { err.textContent = 'Passwords do not match.'; return; }
      try {
        await api('/setup', { method: 'POST', body: { name: name.value, username: username.value, password: password.value } });
        boot();
      } catch (ex) { err.textContent = ex.message; }
    },
  },
  field('Your full name', name), field('Choose a username', username),
  field('Choose a password (8+ characters)', password), field('Type the password again', confirm),
  err, h('button', { class: 'btn', type: 'submit' }, 'Create administrator account'));
  show(h('div', { class: 'card narrow' },
    h('h1', {}, 'Welcome to Solution'),
    h('p', { class: 'muted' }, 'First-time setup: create the main administrator account. You can add other staff logins afterwards.'),
    form));
  name.focus();
}

function renderLogin() {
  const username = h('input', { autocomplete: 'username', autocapitalize: 'none', required: true });
  const password = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const err = errorLine();
  const form = h('form', {
    async onsubmit(e) {
      e.preventDefault();
      try {
        await api('/login', { method: 'POST', body: { username: username.value, password: password.value } });
        boot();
      } catch (ex) { err.textContent = ex.message; password.value = ''; password.focus(); }
    },
  }, field('Username', username), field('Password', password), err,
  h('button', { class: 'btn', type: 'submit' }, 'Sign in'));
  show(h('div', { class: 'card narrow' },
    h('div', { class: 'brand center' }, h('img', { src: 'icon.svg', alt: '', width: 40, height: 40 })),
    h('h1', { class: 'center' }, 'Solution'),
    h('p', { class: 'muted center' }, 'Staff sign-in'), form));
  username.focus();
}

// ---------- serve -----------------------------------------------------------
async function renderServe() {
  state.products = await api('/products');
  if (!state.products.length) {
    return show(h('div', { class: 'card' }, h('h2', {}, 'No products yet'),
      h('p', {}, state.user.role === 'admin'
        ? 'Add the food/products you give out on the Products tab first.'
        : 'Ask an administrator to add the food/products you give out.')));
  }
  const saved = store.get('solution.product');
  const product = h('select', { onchange: () => store.set('solution.product', product.value) },
    state.products.map((p) => h('option', { value: p.id }, p.name)));
  if (state.products.some((p) => String(p.id) === saved)) product.value = saved;

  const id = h('input', {
    class: 'serve-id', inputmode: 'text', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false',
    placeholder: 'Scan or type School ID', 'aria-label': 'School ID',
  });
  const resultBox = h('div', { 'aria-live': 'assertive' });
  const countLine = h('p', { class: 'muted small center' });
  let busy = false;

  async function refreshCount() {
    const d = await api('/distributions');
    const total = d.summary.reduce((n, s) => n + s.count, 0);
    countLine.textContent = `${total} serving${total === 1 ? '' : 's'} recorded today (${state.today}).`;
  }

  function result(kind, icon, title, ...lines) {
    resultBox.replaceChildren(h('div', { class: `result ${kind}` },
      h('div', { class: 'icon', 'aria-hidden': 'true' }, icon),
      h('div', {}, h('p', { class: 'title' }, title), ...lines.filter(Boolean).map((l) => h('p', {}, l)))));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const studentLine = (s) => `${fullName(s)} · ID ${s.student_number}${s.grade ? ` · Grade ${s.grade}` : ''}`;

  async function serve() {
    const number = id.value.trim();
    if (!number || busy) return id.focus();
    busy = true;
    try {
      const r = await api('/serve', { method: 'POST', body: { studentNumber: number, productId: Number(product.value) } });
      beep(true);
      result('ok', '✓', `GIVE ${r.product.name.toUpperCase()}`, studentLine(r.student), `Recorded at ${fmtTime(r.served_at)}.`);
      refreshCount();
    } catch (e) {
      beep(false);
      const d = e.data || {};
      if (d.result === 'duplicate') {
        result('bad', '✕', 'ALREADY RECEIVED TODAY', studentLine(d.student),
          `${d.product.name} was already given at ${fmtTime(d.previous.served_at)} by ${d.previous.served_by}.`, 'Do not give again.');
      } else if (d.result === 'not_found') {
        result('warn', '?', 'NOT ON THE LIST', e.message, 'Check the number, or ask an administrator to add the student.');
      } else if (d.result === 'not_eligible') {
        result('warn', '!', 'NOT ACTIVE', studentLine(d.student), e.message);
      } else {
        result('warn', '!', 'Could not record', e.message);
      }
    } finally {
      busy = false;
      id.value = '';
      id.focus();
    }
  }

  async function check() {
    const number = id.value.trim();
    if (!number) return id.focus();
    try {
      const r = await api(`/lookup/${encodeURIComponent(number)}`);
      const got = r.today.length
        ? `Today: ${r.today.map((t) => `${t.product} at ${fmtTime(t.served_at)}`).join(', ')}.`
        : 'Has not received anything today.';
      result('info', 'i', studentLine(r.student), r.student.active ? got : 'Not currently active on the program.', r.student.program && `Program: ${r.student.program}`);
    } catch (e) {
      result('warn', '?', 'NOT ON THE LIST', e.message);
    }
    id.focus();
  }

  show(
    resultBox,
    h('div', { class: 'card' },
      field('Giving out', product),
      h('form', { onsubmit: (e) => { e.preventDefault(); serve(); } },
        h('label', {}, 'Student School ID'), id,
        h('div', { class: 'serve-buttons' },
          h('button', { class: 'btn', type: 'submit' }, 'Record & give'),
          h('button', { class: 'btn secondary', type: 'button', onclick: check }, 'Check only'))),
      h('p', { class: 'muted small' }, 'Barcode scanners work too: scan the ID card and it records automatically.')),
    countLine);
  id.focus();
  refreshCount();
}

// ---------- today -----------------------------------------------------------
function distributionTable(rows, { onVoid } = {}) {
  if (!rows.length) return h('p', { class: 'muted' }, 'No records.');
  return h('div', { class: 'table-wrap' }, h('table', {},
    h('thead', {}, h('tr', {},
      h('th', {}, 'Time'), h('th', {}, 'Student'), h('th', { class: 'hide-sm' }, 'School ID'),
      h('th', {}, 'Product'), h('th', { class: 'hide-sm' }, 'By'), onVoid && h('th', {}, ''))),
    h('tbody', {}, rows.map((r) => h('tr', { class: r.voided ? 'voided' : '' },
      h('td', { class: 'num' }, rows.some((x) => x.served_on !== rows[0].served_on) ? fmtDateTime(r.served_at) : fmtTime(r.served_at)),
      h('td', {}, `${r.first_name} ${r.last_name}`, r.voided ? h('div', { class: 'small' }, `Voided: ${r.void_reason}`) : null),
      h('td', { class: 'hide-sm' }, r.student_number),
      h('td', {}, r.product),
      h('td', { class: 'hide-sm' }, r.served_by),
      onVoid && h('td', {}, r.voided ? '' : h('button', { class: 'btn danger small', onclick: () => onVoid(r) }, 'Undo')))))));
}

function summaryStats(summary) {
  const total = summary.reduce((n, s) => n + s.count, 0);
  return h('div', { class: 'stats' },
    h('div', { class: 'stat' }, h('div', { class: 'n' }, total), h('div', { class: 'l' }, 'Total servings')),
    summary.map((s) => h('div', { class: 'stat' }, h('div', { class: 'n' }, s.count), h('div', { class: 'l' }, s.product))));
}

async function voidRecord(r, after) {
  const reason = prompt(`Undo ${r.product} for ${r.first_name} ${r.last_name}?\n\nThis lets them be served again today. Reason:`);
  if (!reason || !reason.trim()) return;
  try {
    await api(`/distributions/${r.id}/void`, { method: 'POST', body: { reason } });
    toast('Entry undone.');
    after();
  } catch (e) { alert(e.message); }
}

async function renderToday() {
  const d = await api('/distributions');
  const isAdmin = state.user.role === 'admin';
  show(
    h('h1', {}, `Today · ${d.from}`),
    summaryStats(d.summary),
    h('div', { class: 'card' },
      h('div', { class: 'row' }, h('h2', {}, 'Everyone served today'),
        h('button', { class: 'btn secondary small', onclick: renderToday }, 'Refresh')),
      distributionTable(d.rows, isAdmin ? { onVoid: (r) => voidRecord(r, renderToday) } : {}),
      !isAdmin && h('p', { class: 'muted small' }, 'Made a mistake? Ask an administrator to undo the entry.')));
}

// ---------- students --------------------------------------------------------
async function renderStudents() {
  const search = h('input', { type: 'search', placeholder: 'Search by name or School ID', 'aria-label': 'Search students' });
  const list = h('div');
  const totalLine = h('p', { class: 'muted small' });

  async function load() {
    const r = await api(`/students?q=${encodeURIComponent(search.value)}`);
    totalLine.textContent = `${r.total} student${r.total === 1 ? '' : 's'} on file${search.value ? ` · ${r.students.length} match` : ''}${r.students.length === 500 ? ' (showing first 500)' : ''}.`;
    if (!r.students.length) return list.replaceChildren(h('p', { class: 'muted' }, 'No students found.'));
    list.replaceChildren(h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'School ID'), h('th', {}, 'Name'), h('th', { class: 'hide-sm' }, 'Grade'),
        h('th', { class: 'hide-sm' }, 'Program'), h('th', {}, 'Status'), h('th', {}, ''))),
      h('tbody', {}, r.students.map((s) => h('tr', {},
        h('td', {}, s.student_number), h('td', {}, fullName(s)), h('td', { class: 'hide-sm' }, s.grade),
        h('td', { class: 'hide-sm' }, s.program),
        h('td', {}, h('span', { class: `pill ${s.active ? 'on' : 'off'}` }, s.active ? 'Active' : 'Inactive')),
        h('td', {}, h('div', { class: 'actions' },
          h('button', { class: 'btn secondary small', onclick: () => studentForm(s) }, 'Edit'),
          h('button', { class: 'btn secondary small', onclick: () => studentHistory(s) }, 'History')))))))));
  }

  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(load, 250); });

  show(
    h('div', { class: 'row' }, h('h1', {}, 'Students'),
      h('button', { class: 'btn', onclick: () => studentForm(null) }, '+ Add student'),
      h('button', { class: 'btn secondary', onclick: importForm }, 'Import list')),
    h('div', { class: 'card' }, search, totalLine, list));
  load();
}

function studentForm(s) {
  const f = {
    student_number: h('input', { value: s ? s.student_number : '', required: true, autocomplete: 'off' }),
    first_name: h('input', { value: s ? s.first_name : '', required: true, autocomplete: 'off' }),
    last_name: h('input', { value: s ? s.last_name : '', required: true, autocomplete: 'off' }),
    grade: h('input', { value: s ? s.grade : '', autocomplete: 'off' }),
    program: h('input', { value: s ? s.program : '', placeholder: 'e.g. PATH, free lunch grant', autocomplete: 'off' }),
  };
  const active = h('select', {}, h('option', { value: '1' }, 'Active — can receive'), h('option', { value: '0' }, 'Inactive — cannot receive'));
  active.value = s && !s.active ? '0' : '1';
  const err = errorLine();
  show(h('div', { class: 'card' },
    h('h1', {}, s ? `Edit ${fullName(s)}` : 'Add student'),
    h('form', {
      async onsubmit(e) {
        e.preventDefault();
        const body = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value]));
        body.active = active.value === '1';
        try {
          if (s) await api(`/students/${s.id}`, { method: 'PATCH', body });
          else await api('/students', { method: 'POST', body });
          toast('Saved.');
          renderStudents();
        } catch (ex) { err.textContent = ex.message; }
      },
    },
    h('div', { class: 'row' }, field('School ID number', f.student_number), field('Grade / class', f.grade)),
    h('div', { class: 'row' }, field('First name', f.first_name), field('Last name', f.last_name)),
    h('div', { class: 'row' }, field('Program / grant', f.program), field('Status', active)),
    err,
    h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'submit' }, 'Save'),
      h('button', { class: 'btn secondary', type: 'button', onclick: renderStudents }, 'Cancel')))));
  f.student_number.focus();
}

async function studentHistory(s) {
  const r = await api(`/students/${s.id}/history`);
  show(h('div', { class: 'card' },
    h('h1', {}, fullName(r.student)),
    h('p', { class: 'muted' }, `School ID ${r.student.student_number}${r.student.grade ? ` · Grade ${r.student.grade}` : ''}${r.student.program ? ` · ${r.student.program}` : ''}`),
    r.history.length ? h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'When'), h('th', {}, 'Product'), h('th', {}, 'By'))),
      h('tbody', {}, r.history.map((x) => h('tr', { class: x.voided ? 'voided' : '' },
        h('td', {}, fmtDateTime(x.served_at)), h('td', {}, x.product, x.voided ? h('div', { class: 'small' }, `Voided: ${x.void_reason}`) : null),
        h('td', {}, x.served_by))))))
      : h('p', { class: 'muted' }, 'Nothing received yet.'),
    h('div', { class: 'actions' }, h('button', { class: 'btn secondary', onclick: renderStudents }, '← Back to students'))));
}

function importForm() {
  const text = h('textarea', { placeholder: 'school_id,first_name,last_name,grade,program\n10023,Maria,Brown,4,Free lunch grant\n10024,Andre,Campbell,5,Free lunch grant' });
  const file = h('input', { type: 'file', accept: '.csv,text/csv,text/plain' });
  file.addEventListener('change', async () => { if (file.files[0]) text.value = await file.files[0].text(); });
  const err = errorLine();
  const out = h('div');
  show(h('div', { class: 'card' },
    h('h1', {}, 'Import student list'),
    h('p', {}, 'Upload a CSV file (Excel → Save As → CSV) or paste the list below. Columns, in this order:'),
    h('p', {}, h('strong', {}, 'School ID, First name, Last name, Grade, Program')),
    h('p', { class: 'muted small' }, 'A header row is optional. Students already on file (same School ID) are updated and set to Active; new ones are added.'),
    field('CSV file', file), field('…or paste here', text), err, out,
    h('div', { class: 'actions' },
      h('button', {
        class: 'btn',
        async onclick() {
          err.textContent = '';
          try {
            const r = await api('/students/import', { method: 'POST', body: { csv: text.value } });
            out.replaceChildren(h('div', { class: 'notice' },
              `Added ${r.added}, updated ${r.updated}.`,
              r.errorCount ? h('div', {}, `${r.errorCount} line(s) skipped:`, h('ul', {}, r.errors.map((x) => h('li', {}, x)))) : null));
          } catch (ex) { err.textContent = ex.message; }
        },
      }, 'Import'),
      h('button', { class: 'btn secondary', onclick: renderStudents }, '← Back to students'))));
}

// ---------- products --------------------------------------------------------
async function renderProducts() {
  const products = await api('/products?all=1');
  const name = h('input', { placeholder: 'e.g. Lunch, Breakfast, Snack pack', required: true });
  const err = errorLine();
  show(
    h('h1', {}, 'Products / Food'),
    h('div', { class: 'card' },
      h('p', { class: 'muted' }, 'Each student can receive each product once per day.'),
      h('form', {
        class: 'row',
        async onsubmit(e) {
          e.preventDefault();
          try { await api('/products', { method: 'POST', body: { name: name.value } }); toast('Added.'); renderProducts(); }
          catch (ex) { err.textContent = ex.message; }
        },
      }, field('New product', name), h('button', { class: 'btn', type: 'submit' }, 'Add')),
      err),
    h('div', { class: 'card' }, products.length ? h('table', {},
      h('tbody', {}, products.map((p) => h('tr', {},
        h('td', {}, p.name), h('td', {}, h('span', { class: `pill ${p.active ? 'on' : 'off'}` }, p.active ? 'In use' : 'Hidden')),
        h('td', {}, h('div', { class: 'actions' },
          h('button', {
            class: 'btn secondary small',
            async onclick() {
              const n = prompt('New name:', p.name);
              if (!n || !n.trim()) return;
              try { await api(`/products/${p.id}`, { method: 'PATCH', body: { name: n } }); renderProducts(); } catch (e) { alert(e.message); }
            },
          }, 'Rename'),
          h('button', {
            class: 'btn secondary small',
            async onclick() { await api(`/products/${p.id}`, { method: 'PATCH', body: { active: !p.active } }); renderProducts(); },
          }, p.active ? 'Hide' : 'Use again')))))))
      : h('p', { class: 'muted' }, 'No products yet.')));
}

// ---------- reports ---------------------------------------------------------
async function renderReports() {
  const products = await api('/products?all=1');
  const monthStart = `${state.today.slice(0, 8)}01`;
  const from = h('input', { type: 'date', value: monthStart });
  const to = h('input', { type: 'date', value: state.today });
  const product = h('select', {}, h('option', { value: '' }, 'All products'), products.map((p) => h('option', { value: p.id }, p.name)));
  const voided = h('select', {}, h('option', { value: '' }, 'Hide undone entries'), h('option', { value: '1' }, 'Show undone entries'));
  const out = h('div');
  const download = h('a', { class: 'btn secondary' }, 'Download spreadsheet (CSV)');

  const params = () => new URLSearchParams({ from: from.value, to: to.value, productId: product.value, includeVoided: voided.value }).toString();
  async function run() {
    download.href = `/api/distributions.csv?${params()}`;
    const d = await api(`/distributions?${params()}`);
    out.replaceChildren(summaryStats(d.summary),
      h('div', { class: 'card' },
        h('p', { class: 'muted small' }, `${d.rows.length} record(s) from ${d.from} to ${d.to}${d.rows.length === 5000 ? ' (showing the latest 5000 — download the CSV for all)' : ''}.`),
        distributionTable(d.rows, { onVoid: (r) => voidRecord(r, run) })));
  }
  for (const el of [from, to, product, voided]) el.addEventListener('change', run);

  show(h('h1', {}, 'Reports'),
    h('div', { class: 'card' },
      h('div', { class: 'row' }, field('From', from), field('To', to), field('Product', product), field('Undone entries', voided)),
      h('div', { class: 'actions' }, download)),
    out);
  run();
}

// ---------- staff -----------------------------------------------------------
async function renderStaff() {
  const users = await api('/users');
  const f = {
    name: h('input', { required: true, autocomplete: 'off' }),
    username: h('input', { required: true, autocomplete: 'off', autocapitalize: 'none' }),
    password: h('input', { type: 'password', required: true, minlength: 8, autocomplete: 'new-password' }),
    role: h('select', {}, h('option', { value: 'staff' }, 'Staff — serve & see today'), h('option', { value: 'admin' }, 'Administrator — everything')),
  };
  const err = errorLine();
  const patch = async (u, body, msg) => {
    try { await api(`/users/${u.id}`, { method: 'PATCH', body }); toast(msg); renderStaff(); } catch (e) { alert(e.message); }
  };

  show(
    h('h1', {}, 'Staff logins'),
    h('div', { class: 'card' },
      h('h2', {}, 'Add a staff member'),
      h('form', {
        async onsubmit(e) {
          e.preventDefault();
          try {
            await api('/users', { method: 'POST', body: Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value])) });
            toast('Login created.'); renderStaff();
          } catch (ex) { err.textContent = ex.message; }
        },
      },
      h('div', { class: 'row' }, field('Full name', f.name), field('Username', f.username)),
      h('div', { class: 'row' }, field('Starting password (8+ characters)', f.password), field('Access', f.role)),
      err, h('button', { class: 'btn', type: 'submit' }, 'Create login'))),
    h('div', { class: 'card table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Username'), h('th', {}, 'Access'), h('th', {}, ''))),
      h('tbody', {}, users.map((u) => h('tr', {},
        h('td', {}, u.name, u.active ? null : h('div', {}, h('span', { class: 'pill off' }, 'Disabled'))),
        h('td', {}, u.username),
        h('td', {}, u.role === 'admin' ? 'Administrator' : 'Staff'),
        h('td', {}, u.id === state.user.id ? h('span', { class: 'muted small' }, 'You') : h('div', { class: 'actions' },
          h('button', {
            class: 'btn secondary small',
            onclick() {
              const p = prompt(`New password for ${u.name} (8+ characters):`);
              if (p) patch(u, { password: p }, 'Password reset.');
            },
          }, 'Reset password'),
          h('button', { class: 'btn secondary small', onclick: () => patch(u, { role: u.role === 'admin' ? 'staff' : 'admin' }, 'Access changed.') },
            u.role === 'admin' ? 'Make staff' : 'Make admin'),
          h('button', { class: `btn small ${u.active ? 'danger' : 'secondary'}`, onclick: () => patch(u, { active: !u.active }, u.active ? 'Login disabled.' : 'Login enabled.') },
            u.active ? 'Disable' : 'Enable')))))))),
    h('div', { class: 'card' }, h('button', { class: 'btn secondary', onclick: renderAudit }, 'View activity log')));
}

async function renderAudit() {
  const rows = await api('/audit');
  show(h('div', { class: 'card' }, h('h1', {}, 'Activity log'),
    h('p', { class: 'muted small' }, 'Latest 300 sign-ins and changes.'),
    h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'When (UTC)'), h('th', {}, 'Who'), h('th', {}, 'What'), h('th', {}, 'Details'))),
      h('tbody', {}, rows.map((r) => h('tr', {}, h('td', {}, r.at), h('td', {}, r.user || ''), h('td', {}, r.action.replace(/_/g, ' ')), h('td', {}, r.details)))))),
    h('div', { class: 'actions' }, h('button', { class: 'btn secondary', onclick: renderStaff }, '← Back'))));
}

// ---------- account ---------------------------------------------------------
function renderAccount() {
  const current = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const next = h('input', { type: 'password', autocomplete: 'new-password', minlength: 8, required: true });
  const confirm = h('input', { type: 'password', autocomplete: 'new-password', required: true });
  const err = errorLine();
  show(
    h('div', { class: 'card' },
      h('h1', {}, 'My account'),
      h('p', {}, `${state.user.name} (${state.user.username}) · ${state.user.role === 'admin' ? 'Administrator' : 'Staff'}`),
      h('button', {
        class: 'btn secondary',
        async onclick() { await api('/logout', { method: 'POST', body: {} }); state.user = null; location.hash = ''; boot(); },
      }, 'Sign out')),
    h('div', { class: 'card' },
      h('h2', {}, 'Change password'),
      h('form', {
        async onsubmit(e) {
          e.preventDefault();
          if (next.value !== confirm.value) { err.textContent = 'New passwords do not match.'; return; }
          try {
            await api('/me/password', { method: 'POST', body: { currentPassword: current.value, newPassword: next.value } });
            toast('Password changed.'); renderAccount();
          } catch (ex) { err.textContent = ex.message; }
        },
      }, field('Current password', current), field('New password (8+ characters)', next), field('New password again', confirm),
      err, h('button', { class: 'btn', type: 'submit' }, 'Change password'))),
    h('div', { class: 'card' },
      h('h2', {}, 'Use on a phone'),
      h('p', {}, 'Open this same web address on a phone connected to the school Wi-Fi, then:'),
      h('ul', {},
        h('li', {}, 'iPhone (Safari): tap Share → Add to Home Screen.'),
        h('li', {}, 'Android (Chrome): tap ⋮ → Add to Home screen.')),
      h('p', { class: 'muted small' }, `Address: ${location.origin}`)));
}

boot().catch((e) => show(h('div', { class: 'card narrow' }, h('h1', {}, 'Cannot reach Solution'),
  h('p', {}, 'Make sure the Solution server is running on the main computer and that this device is on the same network.'),
  h('p', { class: 'muted small' }, e.message))));
