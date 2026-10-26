// Revision page. Phase A: lists what is due and what was marked "Revise later".
// The explain-aloud drill and mock interview mode are built in Phase D, once
// topics have real interview questions to draw from.

import { getTopic, lineVar, nextUnfinished } from './curriculum.js';
import { esc, statusIcon, SITE_NAME, formatDate } from './ui.js';

const P = window.Progress;

function row(t, extra) {
  return `<li style="--line:${lineVar(t.phase)}">
    <a href="#/topic/${t.id}" class="topic-row">
      <span class="topic-row-status">${statusIcon(P.status(t.id))}</span>
      <span class="topic-row-main"><span class="topic-row-title">${esc(t.title)}</span>
      <span class="topic-row-meta"><span class="phase-chip-dot" aria-hidden="true"></span>${t.phase.code} · ${esc(t.phase.title)}</span></span>
      <span class="topic-row-extra">${extra}</span>
    </a></li>`;
}

export function renderRevise(main) {
  document.title = `Revise · ${SITE_NAME}`;
  const due = P.dueTopics().map(getTopic).filter(Boolean);
  const later = P.reviseLater().map(getTopic).filter(Boolean);
  const upcoming = P.history()
    .map((h) => getTopic(h.id))
    .filter((t) => t && P.status(t.id) === 'done' && P.topic(t.id).nextReview > Date.now())
    .sort((a, b) => P.topic(a.id).nextReview - P.topic(b.id).nextReview)
    .slice(0, 8);
  const next = nextUnfinished(P.status, P.settings().mustKnowOnly, P.lastTopic());

  main.innerHTML = `
  <div class="page revise-page">
    <header class="page-head">
      <h1 tabindex="-1">Revise</h1>
      <p class="lede">Reading once is not enough to explain something under pressure. When you mark a topic done, it comes back here after ${P.REVIEW_DAYS.join(', ').replace(/, (\d+)$/, ', and $1')} days.</p>
    </header>

    <section class="home-block" aria-labelledby="due-title">
      <h2 id="due-title">Due today</h2>
      ${due.length
        ? `<ul class="topic-rows">${due.map((t) => row(t, 'Explain it aloud, then reread anything shaky')).join('')}</ul>`
        : `<p class="empty">Nothing to revise today.${next ? ` Continue with <a href="#/topic/${next.id}">${esc(next.title)}</a>.` : ''}</p>`}
    </section>

    ${later.length ? `
    <section class="home-block" aria-labelledby="later-title">
      <h2 id="later-title">Marked revise later</h2>
      <ul class="topic-rows">${later.map((t) => row(t, 'Needs another pass')).join('')}</ul>
    </section>` : ''}

    ${upcoming.length ? `
    <section class="home-block" aria-labelledby="upcoming-title">
      <h2 id="upcoming-title">Coming up</h2>
      <ul class="topic-rows">${upcoming.map((t) => row(t, `Due ${formatDate(P.topic(t.id).nextReview)}`)).join('')}</ul>
    </section>` : ''}

    <aside class="callout callout--note">
      <p class="callout-title"><span>Practice drills are on the way</span></p>
      <div class="callout-body"><p>A timed explain-it-aloud drill and a five-question mock interview will appear here once topics have their interview questions written.</p></div>
    </aside>
  </div>`;
  return null;
}
