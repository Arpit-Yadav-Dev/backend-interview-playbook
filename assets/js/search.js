// Client-side search over titles, summaries, tags, glossary terms, and
// (after the first search) the full Markdown bodies of every topic.

import { curriculum, getMarkdown, lineVar } from './curriculum.js';
import { esc, icon, statusIcon, SITE_NAME, debounce } from './ui.js';

const P = window.Progress;

let bodies = null;          // Map topicId -> plain text
let bodiesLoading = null;

function plainText(md) {
  return md
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/```mermaid[\s\S]*?```/g, ' ')
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/\[!(\w+)\]/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_#>|~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadBodies(onProgress) {
  if (bodiesLoading) return bodiesLoading;
  const topics = curriculum().order;
  const map = new Map();
  let i = 0;
  let finished = 0;
  const worker = async () => {
    while (i < topics.length) {
      const t = topics[i++];
      try {
        map.set(t.id, plainText(await getMarkdown(t)));
      } catch (e) {
        map.set(t.id, '');
      }
      finished += 1;
      if (onProgress && finished % 20 === 0) onProgress(finished, topics.length);
    }
  };
  bodiesLoading = Promise.all(Array.from({ length: 6 }, worker)).then(() => {
    bodies = map;
    return map;
  });
  return bodiesLoading;
}

function highlight(text, tokens) {
  let out = esc(text);
  tokens.forEach((tok) => {
    const re = new RegExp(`(${esc(tok).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    out = out.replace(re, '<mark>$1</mark>');
  });
  return out;
}

function snippet(text, tokens, radius = 90) {
  const lower = text.toLowerCase();
  let at = -1;
  for (const tok of tokens) {
    at = lower.indexOf(tok);
    if (at >= 0) break;
  }
  if (at < 0) return null;
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + radius);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

export function search(query) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return { topics: [], terms: [] };

  const topics = [];
  for (const t of curriculum().order) {
    const title = t.title.toLowerCase();
    const summary = t.summary.toLowerCase();
    const tags = t.tags.join(' ').toLowerCase();
    const phase = t.phase.title.toLowerCase();
    const body = bodies ? (bodies.get(t.id) || '').toLowerCase() : '';
    let score = 0;
    let all = true;
    for (const tok of tokens) {
      let hit = 0;
      if (title.includes(tok)) hit += 10;
      if (tags.includes(tok)) hit += 6;
      if (summary.includes(tok)) hit += 4;
      if (phase.includes(tok)) hit += 2;
      if (body.includes(tok)) hit += 1 + Math.min(4, body.split(tok).length - 2);
      if (!hit) { all = false; break; }
      score += hit;
    }
    if (!all) continue;
    if (title.startsWith(tokens[0])) score += 5;
    const bodyText = bodies ? bodies.get(t.id) || '' : '';
    const snip = snippet(bodyText, tokens) || t.summary;
    topics.push({ t, score, snip });
  }
  topics.sort((a, b) => b.score - a.score || a.t.order - b.t.order);

  const terms = curriculum().glossary.filter((g) => {
    const hay = [g.term, ...(g.aliases || []), g.definition].join(' ').toLowerCase();
    return tokens.every((tok) => hay.includes(tok));
  }).sort((a, b) => {
    const aName = tokens.every((tok) => a.term.toLowerCase().includes(tok)) ? 0 : 1;
    const bName = tokens.every((tok) => b.term.toLowerCase().includes(tok)) ? 0 : 1;
    return aName - bName;
  }).slice(0, 8);

  return { topics: topics.slice(0, 40), terms, tokens };
}

export function renderSearch(main, query) {
  document.title = `Search · ${SITE_NAME}`;
  const initial = query.get('q') || '';

  main.innerHTML = `
  <div class="page search-page">
    <header class="page-head">
      <h1 tabindex="-1">Search</h1>
      <form class="search-form" role="search" id="search-form">
        <label for="search-input" class="sr-only">Search topics and terms</label>
        ${icon('search', 20)}
        <input type="search" id="search-input" value="${esc(initial)}" placeholder="Try “index”, “JWT”, or “docker”" autocomplete="off" spellcheck="false">
      </form>
      <p class="search-status muted small" id="search-status" role="status"></p>
    </header>
    <div id="search-results"></div>
  </div>`;

  const input = main.querySelector('#search-input');
  const out = main.querySelector('#search-results');
  const status = main.querySelector('#search-status');
  let destroyed = false;

  function draw() {
    if (destroyed) return;
    const q = input.value.trim();
    history.replaceState(null, '', q ? `#/search?q=${encodeURIComponent(q)}` : '#/search');
    if (!q) {
      out.innerHTML = '<p class="empty">Search every topic title, tag, glossary term, and (once loaded) the full text of every topic.</p>';
      return;
    }
    const { topics, terms, tokens } = search(q);
    if (!topics.length && !terms.length) {
      out.innerHTML = `<p class="empty">No matches for “${esc(q)}”. Try a shorter word, or browse the <a href="#/path">learning path</a>.</p>`;
      return;
    }
    out.innerHTML = `
      ${terms.length ? `<section aria-labelledby="res-terms"><h2 id="res-terms" class="results-heading">Glossary</h2>
        <dl class="term-results">${terms.map((g) => `<div><dt>${highlight(g.term, tokens)}</dt><dd>${highlight(g.definition, tokens)}</dd></div>`).join('')}</dl></section>` : ''}
      ${topics.length ? `<section aria-labelledby="res-topics"><h2 id="res-topics" class="results-heading">Topics <span class="muted">(${topics.length})</span></h2>
        <ol class="search-results">${topics.map(({ t, snip }) => `
          <li style="--line:${lineVar(t.phase)}">
            <a href="#/topic/${t.id}">
              <span class="result-title">${statusIcon(P.status(t.id))}<span>${highlight(t.title, tokens)}</span></span>
              <span class="result-meta"><span class="phase-chip-dot" aria-hidden="true"></span>${t.phase.code} · ${esc(t.phase.title)}</span>
              <span class="result-snippet">${highlight(snip, tokens)}</span>
            </a>
          </li>`).join('')}</ol></section>` : ''}`;
  }

  const drawSoon = debounce(draw, 120);
  input.addEventListener('input', drawSoon);
  main.querySelector('#search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    drawSoon.flush();
  });

  draw();
  if (!bodies) {
    status.textContent = 'Loading full text of every topic…';
    loadBodies((n, total) => { if (!destroyed) status.textContent = `Loading full text… ${n} of ${total}`; })
      .then(() => {
        if (destroyed) return;
        status.textContent = '';
        draw();
      });
  }

  requestAnimationFrame(() => {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });

  return {
    focusTarget: input,
    cleanup() { destroyed = true; drawSoon.cancel(); },
  };
}
