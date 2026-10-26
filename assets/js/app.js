// Boot + hash router. Routes:
//   #/                     dashboard
//   #/path[?phase=<id>]    route map / list
//   #/topic/<id>[/<slug>]  topic page (optionally scrolled to a section)
//   #/search[?q=]          search
//   #/revise               revision
//   #/settings             settings

import { loadCurriculum } from './curriculum.js';
import { renderHome } from './home.js';
import { renderPath } from './pathmap.js';
import { renderTopic, initTermPopover, sectionUrl } from './topic.js';
import { renderSearch } from './search.js';
import { renderRevise } from './revise.js';
import { renderSettings } from './settings.js';
import { esc, SITE_NAME, announce, copyText } from './ui.js';

const P = window.Progress;
const main = document.getElementById('main');
let current = null;      // { name, view } of the rendered route
let firstRender = true;

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map((p) => {
    try { return decodeURIComponent(p); } catch (e) { return p; }
  });
  return { parts, query: new URLSearchParams(qs || '') };
}

function resolve({ parts, query }) {
  const [head, a, b] = parts;
  switch (head) {
    case undefined: return { name: 'home', render: () => renderHome(main) };
    case 'path': return { name: 'path', render: () => renderPath(main, query) };
    case 'topic': return { name: 'topic', params: { id: a, section: b }, render: () => renderTopic(main, { id: a, section: b }) };
    case 'search': return { name: 'search', render: () => renderSearch(main, query) };
    case 'revise': return { name: 'revise', render: () => renderRevise(main) };
    case 'settings': return { name: 'settings', render: () => renderSettings(main) };
    default: return { name: 'missing', render: () => renderMissing() };
  }
}

function renderMissing() {
  document.title = `Page not found · ${SITE_NAME}`;
  main.innerHTML = `<div class="page"><header class="page-head"><h1 tabindex="-1">That page doesn't exist</h1>
    <p class="lede">The link may be old or mistyped. Go back to the <a href="#/">dashboard</a> or open the <a href="#/path">learning path</a>.</p></header></div>`;
  return null;
}

function route() {
  const parsed = parseHash();
  const next = resolve(parsed);

  // Same topic, new section: scroll instead of re-rendering.
  if (current && current.name === 'topic' && next.name === 'topic' && current.view && current.view.update
      && current.view.update(next.params)) {
    return;
  }

  if (current && current.view && current.view.cleanup) current.view.cleanup();
  window.scrollTo(0, 0);
  let view = next.render();
  if (view === null && next.name === 'topic') {
    view = renderMissing();
    next.name = 'missing';
  }
  current = { name: next.name, view };
  updateNav(next.name);

  // Move focus to the new page heading so screen readers announce the change.
  if (!firstRender) {
    const target = (view && view.focusTarget) || main.querySelector('h1');
    if (target) target.focus({ preventScroll: true });
  }
  firstRender = false;
}

function updateNav(name) {
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  updateReviseBadge();
}

function updateReviseBadge() {
  const count = P.dueTopics().length + P.reviseLater().length;
  document.querySelectorAll('[data-revise-count]').forEach((el) => {
    el.textContent = count ? String(count) : '';
    el.hidden = !count;
    el.setAttribute('aria-label', `${count} to revise`);
  });
}

function initGlobalHandlers() {
  // Copy buttons on code blocks and section links (delegated: content is re-rendered often).
  document.addEventListener('click', async (e) => {
    const codeBtn = e.target.closest('[data-copy-code]');
    if (codeBtn) {
      const code = codeBtn.closest('.code-block').querySelector('pre').innerText;
      const ok = await copyText(code);
      const label = codeBtn.querySelector('span');
      label.textContent = ok ? 'Copied' : 'Copy failed';
      setTimeout(() => { label.textContent = 'Copy'; }, 1600);
      return;
    }
    const secBtn = e.target.closest('[data-copy-section]');
    if (secBtn) {
      const id = parseHash().parts[1];
      const ok = await copyText(sectionUrl(id, secBtn.dataset.copySection));
      announce(ok ? 'Link to this section copied' : 'Could not copy the link');
    }
  });

  // Skip link: focus <main> without touching the hash (the router owns it).
  document.querySelector('.skip-link').addEventListener('click', (e) => {
    e.preventDefault();
    main.focus();
  });

  // "/" jumps to search from anywhere except text fields.
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
    e.preventDefault();
    if (current && current.name === 'search') document.getElementById('search-input').focus();
    else location.hash = '#/search';
  });

  // Print: expand every hidden answer, then restore.
  let opened = [];
  window.addEventListener('beforeprint', () => {
    opened = [...document.querySelectorAll('details:not([open])')];
    opened.forEach((d) => { d.open = true; });
  });
  window.addEventListener('afterprint', () => {
    opened.forEach((d) => { d.open = false; });
    opened = [];
  });

  P.subscribe(updateReviseBadge);
}

async function boot() {
  try {
    await loadCurriculum();
  } catch (err) {
    const fromDisk = location.protocol === 'file:';
    main.innerHTML = `<div class="page"><header class="page-head"><h1>The study material could not load</h1>
      <p class="lede">${fromDisk
        ? 'This site needs to be served over HTTP. In the project folder run <code>python3 -m http.server 8000</code>, then open <a href="http://localhost:8000">http://localhost:8000</a>.'
        : `Check your connection and reload the page. (${esc(err.message)})`}</p></header></div>`;
    return;
  }
  initGlobalHandlers();
  initTermPopover();
  window.addEventListener('hashchange', route);
  route();
}

boot();
