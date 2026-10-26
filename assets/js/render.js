// Markdown -> sanitized HTML, then DOM enhancements:
// callouts, heading anchors, code highlighting, Mermaid diagrams, glossary terms.

import { esc, slugify, icon } from './ui.js';

const MERMAID_URL = 'https://cdn.jsdelivr.net/npm/mermaid@12.1.0/dist/mermaid.esm.min.mjs';

const CALLOUTS = {
  INTERVIEW: { cls: 'interview', label: 'Say it in an interview', icon: 'interview' },
  MISTAKE: { cls: 'mistake', label: 'Common mistake', icon: 'mistake' },
  TIP: { cls: 'tip', label: 'Tip', icon: 'tip' },
  NOTE: { cls: 'note', label: 'Note', icon: 'note' },
  // GitHub's other alert types map onto the four styles above.
  IMPORTANT: { cls: 'interview', label: 'Important', icon: 'note' },
  WARNING: { cls: 'mistake', label: 'Warning', icon: 'mistake' },
  CAUTION: { cls: 'mistake', label: 'Caution', icon: 'mistake' },
};

const LANG_NAMES = {
  js: 'JavaScript', javascript: 'JavaScript', ts: 'TypeScript', typescript: 'TypeScript',
  bash: 'bash', sh: 'shell', shell: 'shell', sql: 'SQL', json: 'JSON', yaml: 'YAML', yml: 'YAML',
  dockerfile: 'Dockerfile', docker: 'Dockerfile', nginx: 'Nginx', http: 'HTTP', html: 'HTML',
  css: 'CSS', jsx: 'JSX', tsx: 'TSX', text: 'text', plaintext: 'text', ini: 'ini', diff: 'diff',
};

let configured = false;
function configureMarked() {
  if (configured) return;
  window.marked.use({ gfm: true, breaks: false });
  configured = true;
}

/**
 * Render a topic's Markdown. Returns a DocumentFragment plus the list of
 * `##` headings (for the table of contents).
 */
export function renderMarkdown(md, { topicId } = {}) {
  configureMarked();
  const raw = window.marked.parse(md);
  const clean = window.DOMPurify.sanitize(raw, { ADD_ATTR: ['open'] });
  const tpl = document.createElement('template');
  tpl.innerHTML = clean;
  const root = tpl.content;

  transformCallouts(root);
  transformCode(root);
  const headings = transformHeadings(root, topicId);
  wrapSections(root, headings);
  transformLinks(root, topicId);
  wrapTables(root);
  return { fragment: root, headings };
}

// Sections shown in "Quick review" mode: the one-liner, the mechanism, the
// interview answers, and the self-check.
const CORE_SECTION = /^(in one line|how it works|how to say it|check yourself)/i;

/** Wrap each `##` heading and its content in a <section>, flagging the core ones. */
function wrapSections(root, headings) {
  let current = null;
  [...root.childNodes].forEach((node) => {
    if (node.nodeType === 1 && node.tagName === 'H2') {
      current = document.createElement('section');
      current.className = 'topic-section';
      const slug = node.dataset.slug;
      const heading = headings.find((h) => h.slug === slug);
      if (heading) heading.core = CORE_SECTION.test(heading.text);
      if (heading && heading.core) current.classList.add('is-core');
      node.replaceWith(current);
      current.appendChild(node);
    } else if (current) {
      current.appendChild(node);
    }
  });
}

function transformCallouts(root) {
  root.querySelectorAll('blockquote').forEach((bq) => {
    const first = bq.firstElementChild;
    if (!first || first.tagName !== 'P') return;
    const m = first.innerHTML.match(/^\s*\[!([A-Z]+)\]\s*(?:<br>)?\s*/);
    if (!m || !CALLOUTS[m[1]]) return;
    const kind = CALLOUTS[m[1]];
    first.innerHTML = first.innerHTML.slice(m[0].length);
    if (!first.textContent.trim() && !first.querySelector('*')) first.remove();

    const aside = document.createElement('aside');
    aside.className = `callout callout--${kind.cls}`;
    aside.setAttribute('aria-label', kind.label);
    aside.innerHTML = `<p class="callout-title">${icon(kind.icon, 18)}<span>${kind.label}</span></p>`;
    const body = document.createElement('div');
    body.className = 'callout-body';
    while (bq.firstChild) body.appendChild(bq.firstChild);
    aside.appendChild(body);
    bq.replaceWith(aside);
  });
}

function transformCode(root) {
  root.querySelectorAll('pre > code').forEach((code) => {
    const pre = code.parentElement;
    const langClass = [...code.classList].find((c) => c.startsWith('language-'));
    const lang = langClass ? langClass.slice(9).toLowerCase() : '';

    if (lang === 'mermaid') {
      const fig = document.createElement('figure');
      fig.className = 'diagram';
      fig.dataset.src = code.textContent;
      fig.innerHTML = '<div class="diagram-scroll"><div class="diagram-render"><p class="diagram-loading">Drawing diagram…</p></div></div>';
      // A paragraph that is only emphasis right after the diagram is its caption.
      const next = pre.nextElementSibling;
      if (next && next.tagName === 'P' && next.children.length === 1 && next.firstElementChild.tagName === 'EM'
          && next.textContent.trim() === next.firstElementChild.textContent.trim()) {
        const cap = document.createElement('figcaption');
        cap.innerHTML = next.firstElementChild.innerHTML;
        fig.appendChild(cap);
        next.remove();
      }
      pre.replaceWith(fig);
      return;
    }

    const hl = window.hljs;
    const hlLang = lang === 'docker' ? 'dockerfile' : lang === 'sh' ? 'bash' : lang;
    if (hl && hlLang && hl.getLanguage(hlLang)) {
      code.innerHTML = hl.highlight(code.textContent, { language: hlLang, ignoreIllegals: true }).value;
      code.classList.add('hljs');
    }
    const wrap = document.createElement('div');
    wrap.className = 'code-block';
    const name = LANG_NAMES[lang] || lang || 'code';
    wrap.innerHTML = `<div class="code-head"><span class="code-lang">${esc(name)}</span>`
      + `<button type="button" class="code-copy" data-copy-code>${icon('copy', 16)}<span>Copy</span></button></div>`;
    pre.replaceWith(wrap);
    wrap.appendChild(pre);
    pre.tabIndex = 0; // long lines scroll; let keyboard users scroll too
  });
}

function transformHeadings(root, topicId) {
  const used = new Set();
  const headings = [];
  root.querySelectorAll('h2, h3').forEach((h) => {
    let slug = slugify(h.textContent);
    let n = 2;
    while (used.has(slug)) slug = `${slugify(h.textContent)}-${n++}`;
    used.add(slug);
    h.id = `s-${slug}`;
    h.dataset.slug = slug;
    if (h.tagName === 'H2') {
      headings.push({ slug, text: h.textContent.trim() });
      if (topicId) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'heading-link';
        btn.dataset.copySection = slug;
        btn.setAttribute('aria-label', `Copy link to "${h.textContent.trim()}"`);
        btn.innerHTML = icon('link', 16);
        h.appendChild(btn);
      }
    }
  });
  return headings;
}

function transformLinks(root, topicId) {
  root.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href');
    if (/^https?:\/\//i.test(href)) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.classList.add('external');
    } else if (href.startsWith('#') && !href.startsWith('#/') && topicId) {
      // In-page anchors become route links so the hash router keeps working.
      a.setAttribute('href', `#/topic/${topicId}/${slugify(href.slice(1))}`);
    }
  });
}

function wrapTables(root) {
  root.querySelectorAll('table').forEach((table) => {
    const wrap = document.createElement('div');
    wrap.className = 'table-scroll';
    wrap.tabIndex = 0;
    table.replaceWith(wrap);
    wrap.appendChild(table);
  });
}

/* ---------- Mermaid ---------- */

let mermaidPromise = null;
let diagramCount = 0;

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import(MERMAID_URL).then((m) => m.default).catch((err) => {
      mermaidPromise = null;
      throw err;
    });
  }
  return mermaidPromise;
}

// Every diagram is drawn twice, once per theme, and CSS shows the matching one.
// Switching theme is then instant, and printing always uses the light version.
// Keep these in sync with the tokens in main.css.
const DIAGRAM_PALETTES = {
  light: { surface: '#FFFFFF', surface2: '#EEF1F5', text: '#18202B', muted: '#556070', accent: '#1F5FD6', accentSoft: '#E8EEFB', border: '#C5CCD6' },
  dark: { surface: '#1A212B', surface2: '#222B37', text: '#E4E8EE', muted: '#9AA5B4', accent: '#7FAAFF', accentSoft: '#1A2742', border: '#3A4554' },
};
const FONT = '"IBM Plex Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function mermaidConfig(theme) {
  const { surface, surface2, text, muted, accent, accentSoft, border } = DIAGRAM_PALETTES[theme];
  return {
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    fontFamily: FONT,
    flowchart: { useMaxWidth: false, htmlLabels: true, curve: 'basis' },
    sequence: { useMaxWidth: false, mirrorActors: false, showSequenceNumbers: false },
    themeVariables: {
      darkMode: theme === 'dark',
      fontSize: '15px',
      fontFamily: FONT,
      background: surface,
      primaryColor: accentSoft,
      primaryTextColor: text,
      primaryBorderColor: accent,
      secondaryColor: surface2,
      secondaryTextColor: text,
      secondaryBorderColor: border,
      tertiaryColor: surface,
      tertiaryTextColor: text,
      tertiaryBorderColor: border,
      lineColor: muted,
      textColor: text,
      mainBkg: accentSoft,
      nodeBorder: accent,
      clusterBkg: surface2,
      clusterBorder: border,
      edgeLabelBackground: surface,
      titleColor: text,
      actorBkg: accentSoft,
      actorBorder: accent,
      actorTextColor: text,
      actorLineColor: border,
      signalColor: text,
      signalTextColor: text,
      labelBoxBkgColor: surface2,
      labelBoxBorderColor: border,
      labelTextColor: text,
      loopTextColor: text,
      noteBkgColor: surface2,
      noteTextColor: text,
      noteBorderColor: border,
      activationBkgColor: surface2,
      activationBorderColor: accent,
      sequenceNumberColor: surface,
    },
  };
}

/** Render every diagram inside `root`, in both a light and a dark version. */
export async function renderDiagrams(root) {
  const figs = [...root.querySelectorAll('figure.diagram[data-src]')];
  if (!figs.length) return;
  let mermaid;
  try {
    mermaid = await loadMermaid();
  } catch (err) {
    figs.forEach((fig) => showDiagramError(fig, 'The diagram library could not load. Check your connection and reload.'));
    return;
  }
  const svgs = new Map(figs.map((fig) => [fig, {}]));
  for (const theme of ['light', 'dark']) {
    mermaid.initialize(mermaidConfig(theme));
    for (const fig of figs) {
      if (!fig.isConnected || svgs.get(fig).error) continue;
      try {
        svgs.get(fig)[theme] = (await mermaid.render(`mmd-${++diagramCount}`, fig.dataset.src)).svg;
      } catch (err) {
        svgs.get(fig).error = err && err.message ? err.message.split('\n')[0] : 'unknown error';
      }
    }
  }
  for (const [fig, out] of svgs) {
    if (out.error) {
      showDiagramError(fig, `This diagram has a syntax error: ${out.error}`);
      continue;
    }
    fig.querySelector('.diagram-render').innerHTML = `<div class="diagram-light">${out.light}</div><div class="diagram-dark">${out.dark}</div>`;
  }
}

function showDiagramError(fig, message) {
  fig.classList.add('has-error');
  fig.querySelector('.diagram-render').innerHTML = `<p class="diagram-error">${esc(message)}</p><pre><code>${esc(fig.dataset.src)}</code></pre>`;
}

/* ---------- Glossary ---------- */

const SKIP_SELECTOR = 'h1, h2, h3, h4, h5, h6, a, code, pre, summary, button, figure, .callout-title, .term, mark, kbd';

/**
 * Wrap the first use of each glossary term in a button that shows its definition.
 * Only the first occurrence on the page is marked, so the text stays readable.
 */
export function linkGlossary(root, glossary) {
  if (!glossary.length) return;
  const lookup = new Map();
  const patterns = [];
  glossary.forEach((entry) => {
    [entry.term, ...(entry.aliases || [])].forEach((form) => {
      lookup.set(form.toLowerCase(), entry);
      patterns.push(form);
    });
  });
  patterns.sort((a, b) => b.length - a.length);
  const escaped = patterns.map((p) => p.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'));
  const re = new RegExp(`(?<![\\w-])(${escaped.join('|')})(?![\\w-])`, 'gi');

  const used = new Set();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      return node.parentElement.closest(SKIP_SELECTOR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (let node of nodes) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(node.nodeValue))) {
      const entry = lookup.get(match[1].toLowerCase());
      if (!entry || used.has(entry.term)) continue;
      // Acronyms (all caps) must match exactly, so "port" never matches "PORT" in prose.
      if (/^[A-Z0-9/]+$/.test(entry.term) && match[1] !== entry.term && match[1].toLowerCase() === entry.term.toLowerCase()) continue;
      used.add(entry.term);
      const after = node.splitText(match.index);
      node = after.splitText(match[1].length);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'term';
      btn.dataset.term = entry.term;
      btn.setAttribute('aria-expanded', 'false');
      btn.textContent = after.nodeValue;
      after.replaceWith(btn);
      re.lastIndex = 0;
    }
  }
}
