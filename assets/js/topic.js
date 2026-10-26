// Topic page: sticky status header, TOC, scroll restore, notes, prev/next.

import { getTopic, getMarkdown, neighbors, lineVar, isPlaceholder, curriculum } from './curriculum.js';
import { renderMarkdown, renderDiagrams, linkGlossary } from './render.js';
import { esc, icon, statusIcon, STATUS_LABEL, SITE_NAME, throttle, debounce, announce, copyText, prefersReducedMotion } from './ui.js';

const P = window.Progress;

export function sectionUrl(topicId, slug) {
  return `${location.origin}${location.pathname}#/topic/${topicId}/${slug}`;
}

function statusOptions(current) {
  return P.STATUSES.map((s) => `<option value="${s}"${s === current ? ' selected' : ''}>${STATUS_LABEL[s]}</option>`).join('');
}

function topicLink(t, label) {
  if (!t) return '<span></span>';
  return `<a class="pager-link pager-link--${label === 'Previous' ? 'prev' : 'next'}" href="#/topic/${t.id}">
    <span class="pager-dir">${label === 'Previous' ? icon('arrowLeft', 16) : ''}${label}${label === 'Next' ? icon('arrowRight', 16) : ''}</span>
    <span class="pager-title">${esc(t.title)}</span></a>`;
}

export function renderTopic(main, { id, section }) {
  const t = getTopic(id);
  if (!t) return null;
  const phase = t.phase;
  const settings = P.settings();
  P.open(id);
  const saved = P.topic(id);
  const { prev, next } = neighbors(id, settings.mustKnowOnly);
  document.title = `${t.title} · ${SITE_NAME}`;

  const related = (t.related || []).map(getTopic).filter(Boolean);

  main.innerHTML = `
  <div class="topic-page${settings.quickReview ? ' is-quick' : ''}" style="--line:${lineVar(phase)}">
    <div class="topic-bar" id="topic-bar">
      <div class="topic-bar-inner">
        <a class="phase-chip" href="#/path?phase=${phase.id}"><span class="phase-chip-dot" aria-hidden="true"></span>${phase.code} · ${esc(phase.title)}</a>
        <p class="topic-bar-title" aria-hidden="true">${esc(t.title)}</p>
        <label class="status-control" data-status="${saved.status}">
          <span class="sr-only">Topic status</span>
          <span class="status-control-icon">${statusIcon(saved.status)}</span>
          <select id="status-select">${statusOptions(saved.status)}</select>
        </label>
      </div>
      <div class="read-progress" aria-hidden="true"><span id="read-progress-bar"></span></div>
    </div>

    <div class="topic-layout">
      <aside class="toc-panel" aria-label="On this page">
        <p class="toc-heading">On this page</p>
        <ol class="toc-list" id="toc-desktop"></ol>
      </aside>

      <article class="topic" id="topic-article">
        <header class="topic-head">
          <h1 tabindex="-1" id="topic-title">${esc(t.title)}</h1>
          <p class="topic-meta">
            <span>${t.priority === 'must-know' ? '<span class="star" aria-hidden="true">★</span> Must-know' : 'Good to know'}</span>
            <span>${esc(t.level[0].toUpperCase() + t.level.slice(1))}</span>
            <span>About ${t.minutes} min</span>
          </p>
          <div class="segmented view-toggle" role="group" aria-label="How much of the topic to show">
            <button type="button" data-mode="full" aria-pressed="${!settings.quickReview}">Full topic</button>
            <button type="button" data-mode="quick" aria-pressed="${settings.quickReview}">Quick review</button>
          </div>
          <p class="quick-note">Quick review shows the one-liner, how it works, the interview answers, and the self-check. Switch to <strong>Full topic</strong> for everything else.</p>
        </header>

        <details class="toc-mobile" id="toc-mobile-wrap">
          <summary>On this page</summary>
          <ol class="toc-list" id="toc-mobile"></ol>
        </details>

        <div class="prose" id="topic-body"><p class="loading">Loading topic…</p></div>

        <footer class="topic-end">
          <div class="done-row">
            <button type="button" class="btn btn-primary btn-large" id="done-next">
              ${icon('check', 20)}<span>${next ? 'Mark done &amp; next topic' : 'Mark done'}</span>
            </button>
            <p class="done-hint">Mark it done when you can explain it out loud without looking.</p>
          </div>

          <nav class="pager" aria-label="Previous and next topic">
            ${topicLink(prev, 'Previous')}
            ${topicLink(next, 'Next')}
          </nav>

          <section class="notes" aria-labelledby="notes-title">
            <h2 id="notes-title">My notes</h2>
            <label class="sr-only" for="notes-area">Notes for ${esc(t.title)}</label>
            <textarea id="notes-area" rows="5" placeholder="Write the answer in your own words, or anything you want to remember.">${esc(saved.notes)}</textarea>
            <p class="notes-status" id="notes-status">Saved in this browser only.</p>
          </section>

          ${related.length ? `
          <section class="related" aria-labelledby="related-title">
            <h2 id="related-title">Related topics</h2>
            <ul class="related-list">
              ${related.map((r) => `<li style="--line:${lineVar(r.phase)}"><a href="#/topic/${r.id}">${statusIcon(P.status(r.id))}<span>${esc(r.title)}</span></a></li>`).join('')}
            </ul>
          </section>` : ''}
        </footer>
      </article>
    </div>
  </div>`;

  const body = main.querySelector('#topic-body');
  const bar = main.querySelector('#read-progress-bar');
  const topicBar = main.querySelector('#topic-bar');
  const select = main.querySelector('#status-select');
  const statusControl = main.querySelector('.status-control');
  let destroyed = false;
  let userScrolled = false;
  let restoring = false;
  let currentSection = section;

  /* status control */
  select.addEventListener('change', () => {
    P.setStatus(id, select.value);
    statusControl.dataset.status = select.value;
    statusControl.querySelector('.status-control-icon').innerHTML = statusIcon(select.value);
    announce(`Status set to ${STATUS_LABEL[select.value]}`);
  });

  main.querySelector('#done-next').addEventListener('click', () => {
    P.setStatus(id, 'done');
    announce(`Marked “${t.title}” done`);
    location.hash = next ? `#/topic/${next.id}` : '#/path';
  });

  /* full / quick review */
  const pageEl = main.querySelector('.topic-page');
  main.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const quick = btn.dataset.mode === 'quick';
      P.setSetting('quickReview', quick);
      pageEl.classList.toggle('is-quick', quick);
      main.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      announce(quick ? 'Showing quick review' : 'Showing the full topic');
    });
  });

  /* notes */
  const notes = main.querySelector('#notes-area');
  const notesStatus = main.querySelector('#notes-status');
  const saveNotes = debounce(() => {
    P.setNotes(id, notes.value);
    notesStatus.textContent = P.isAvailable() ? 'Saved in this browser.' : 'Could not save: storage is blocked in this browser.';
  }, 500);
  notes.addEventListener('input', () => {
    notesStatus.textContent = 'Saving…';
    saveNotes();
  });

  /* scroll tracking */
  const scrollFraction = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    return max > 0 ? Math.min(1, window.scrollY / max) : 0;
  };
  const saveScroll = throttle(() => {
    if (!destroyed && !restoring) P.setScroll(id, scrollFraction());
  }, 400);
  let ticking = false;
  const onScroll = () => {
    if (!restoring) userScrolled = true;
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(() => {
        bar.style.transform = `scaleX(${scrollFraction()})`;
        ticking = false;
      });
    }
    saveScroll();
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  function restoreScroll() {
    restoring = true;
    if (currentSection) {
      const target = document.getElementById(`s-${currentSection}`);
      if (target) {
        revealSection(target);
        target.scrollIntoView({ block: 'start' });
      }
    } else {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, Math.round((saved.scroll || 0) * max));
    }
    requestAnimationFrame(() => { restoring = false; });
  }

  /* show the title in the sticky bar once the h1 scrolls away */
  const titleObserver = new IntersectionObserver(([e]) => {
    topicBar.classList.toggle('show-title', !e.isIntersecting);
  }, { rootMargin: '-60px 0px 0px 0px' });
  titleObserver.observe(main.querySelector('#topic-title'));

  let sectionObserver = null;

  function buildToc(headings) {
    const items = headings.map((h) => `<li${h.core ? ' class="is-core"' : ''}><a href="#/topic/${id}/${h.slug}" data-toc="${h.slug}">${esc(h.text)}</a></li>`).join('');
    main.querySelector('#toc-desktop').innerHTML = items;
    main.querySelector('#toc-mobile').innerHTML = items;
    if (!headings.length) {
      main.querySelector('.toc-panel').hidden = true;
      main.querySelector('#toc-mobile-wrap').hidden = true;
    }
    // TOC clicks scroll without adding a history entry for every section.
    main.querySelectorAll('[data-toc]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        goToSection(a.dataset.toc);
        main.querySelector('#toc-mobile-wrap').open = false;
      });
    });
    const links = main.querySelectorAll('#toc-desktop [data-toc]');
    const visible = new Map();
    sectionObserver = new IntersectionObserver((entries) => {
      entries.forEach((e) => visible.set(e.target.dataset.slug, e.isIntersecting));
      const active = headings.filter((h) => visible.get(h.slug)).map((h) => h.slug)[0];
      if (!active) return;
      links.forEach((l) => l.toggleAttribute('aria-current', l.dataset.toc === active));
    }, { rootMargin: '-80px 0px -60% 0px' });
    body.querySelectorAll('h2[id]').forEach((h) => sectionObserver.observe(h));
  }

  // A link to a section that quick review hides switches back to the full topic.
  function revealSection(target) {
    if (pageEl.classList.contains('is-quick') && target.closest('.topic-section:not(.is-core)')) {
      main.querySelector('[data-mode="full"]').click();
    }
  }

  function goToSection(slug) {
    const target = document.getElementById(`s-${slug}`);
    if (!target) return;
    revealSection(target);
    currentSection = slug;
    history.replaceState(null, '', `#/topic/${id}/${slug}`);
    target.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
  }

  /* load content */
  getMarkdown(t).then((md) => {
    if (destroyed) return;
    const { fragment, headings } = renderMarkdown(md, { topicId: id });
    body.replaceChildren(fragment);
    if (isPlaceholder(md)) main.querySelector('.topic').classList.add('is-placeholder');
    linkGlossary(body, curriculum().glossary);
    buildToc(headings);
    restoreScroll();
    return renderDiagrams(body).then(() => {
      // Diagrams change the page height; re-apply the saved position if the reader hasn't moved.
      if (!destroyed && !userScrolled) restoreScroll();
    });
  }).catch((err) => {
    if (destroyed) return;
    body.innerHTML = `<div class="callout callout--mistake"><p class="callout-title">${icon('mistake', 18)}<span>Could not load this topic</span></p>
      <div class="callout-body"><p>${esc(err.message)}</p><p>If you opened <code>index.html</code> directly from disk, run a local server instead: <code>python3 -m http.server 8000</code>.</p></div></div>`;
  });

  return {
    /** Same topic, different section (e.g. a deep link clicked inside the page). */
    update({ id: nextId, section: nextSection }) {
      if (nextId !== id) return false;
      if (nextSection) goToSection(nextSection);
      return true;
    },
    cleanup() {
      destroyed = true;
      saveNotes.cancel();
      if (notes.value !== saved.notes) P.setNotes(id, notes.value);
      if (!restoring) P.setScroll(id, scrollFraction());
      window.removeEventListener('scroll', onScroll);
      titleObserver.disconnect();
      if (sectionObserver) sectionObserver.disconnect();
    },
  };
}

/* ---------- glossary popover (shared, one element) ---------- */

export function initTermPopover() {
  const pop = document.getElementById('term-pop');
  let anchor = null;
  let hoverTimer = null;

  function place(btn) {
    const r = btn.getBoundingClientRect();
    pop.style.left = '0px';
    pop.style.top = '0px';
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    const margin = 12;
    let left = r.left + r.width / 2 - pw / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - pw - margin));
    let top = r.bottom + 8;
    if (top + ph > window.innerHeight - margin && r.top - ph - 8 > margin) top = r.top - ph - 8;
    pop.style.left = `${left + window.scrollX}px`;
    pop.style.top = `${top + window.scrollY}px`;
  }

  function show(btn) {
    const entry = curriculum().glossary.find((g) => g.term === btn.dataset.term);
    if (!entry) return;
    if (anchor && anchor !== btn) hide();
    anchor = btn;
    pop.innerHTML = `<p class="term-pop-name">${esc(entry.term)}</p><p>${esc(entry.definition)}</p>`;
    pop.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    btn.setAttribute('aria-describedby', 'term-pop');
    place(btn);
  }

  function hide() {
    if (!anchor) return;
    anchor.setAttribute('aria-expanded', 'false');
    anchor.removeAttribute('aria-describedby');
    anchor = null;
    pop.hidden = true;
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button.term');
    if (btn) {
      if (anchor === btn) hide();
      else show(btn);
      return;
    }
    if (!e.target.closest('#term-pop')) hide();
  });
  document.addEventListener('mouseover', (e) => {
    const btn = e.target.closest('button.term');
    if (!btn || !window.matchMedia('(hover: hover)').matches) return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => show(btn), 150);
  });
  document.addEventListener('mouseout', (e) => {
    const btn = e.target.closest('button.term');
    if (!btn || !window.matchMedia('(hover: hover)').matches) return;
    clearTimeout(hoverTimer);
    if (e.relatedTarget && (e.relatedTarget.closest('#term-pop') || e.relatedTarget === btn)) return;
    hoverTimer = setTimeout(() => { if (anchor === btn) hide(); }, 200);
  });
  pop.addEventListener('mouseleave', () => {
    hoverTimer = setTimeout(hide, 200);
  });
  pop.addEventListener('mouseenter', () => clearTimeout(hoverTimer));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && anchor) {
      const btn = anchor;
      hide();
      btn.focus();
    }
  });
  window.addEventListener('resize', hide);
  window.addEventListener('hashchange', hide);
}
