// Dashboard: Continue button, progress per line, revise today, recently read.

import { curriculum, getTopic, lineVar, isVisible, nextUnfinished } from './curriculum.js';
import { esc, icon, statusIcon, STATUS_LABEL, SITE_NAME, relTime } from './ui.js';

const P = window.Progress;

/** The topic the Continue button should open, plus a short description. */
export function continueTarget() {
  const s = P.settings();
  const last = P.lastTopic() && getTopic(P.lastTopic());
  if (last && P.status(last.id) !== 'done') {
    return { topic: last, verb: 'Continue', note: progressNote(last) };
  }
  const next = nextUnfinished(P.status, s.mustKnowOnly, last ? last.id : null);
  if (!next) return null;
  return { topic: next, verb: last ? 'Continue' : 'Start', note: last ? `Next stop after “${last.title}”` : 'The first stop on the path' };
}

function progressNote(t) {
  const pct = Math.round((P.topic(t.id).scroll || 0) * 100);
  return pct > 2 ? `You were ${pct}% of the way through` : 'You opened this one last';
}

function intro() {
  return `
  <section class="intro" aria-labelledby="intro-title">
    <h2 id="intro-title">How to use this site</h2>
    <ol>
      <li><strong>Follow the path in order.</strong> Each topic only relies on topics that come before it.</li>
      <li><strong>Read, then say it out loud.</strong> Every topic ends with a 30-second and a 2-minute interview answer. Practise them aloud, not just in your head.</li>
      <li><strong>Mark a topic done only when you can explain it without looking.</strong> Done topics come back for revision after 3, 10, and 30 days.</li>
      <li><strong>Your progress stays in this browser.</strong> To move it to another device, use <a href="#/settings">Export progress</a> or a progress code.</li>
    </ol>
    <button type="button" class="btn btn-quiet" id="dismiss-intro">Got it, hide this</button>
  </section>`;
}

function phaseRows(s) {
  return curriculum().phases.map((phase) => {
    const topics = phase.topics.filter((t) => isVisible(t, s.mustKnowOnly));
    const done = topics.filter((t) => P.status(t.id) === 'done').length;
    const dots = topics.map((t) => {
      const st = P.status(t.id);
      return `<span class="mini-dot station-dot--${st}" title="${esc(t.title)}: ${STATUS_LABEL[st]}"></span>`;
    }).join('');
    return `<li style="--line:${lineVar(phase)}">
      <a class="phase-row" href="#/path?phase=${phase.id}">
        <span class="line-badge" aria-hidden="true">${phase.code}</span>
        <span class="phase-row-title">${esc(phase.title)}</span>
        <span class="mini-line" aria-hidden="true">${dots}</span>
        <span class="phase-row-count">${done}/${topics.length}<span class="sr-only"> done</span></span>
      </a>
    </li>`;
  }).join('');
}

function topicRow(t, extra) {
  return `<li style="--line:${lineVar(t.phase)}">
    <a href="#/topic/${t.id}" class="topic-row">
      <span class="topic-row-status">${statusIcon(P.status(t.id))}</span>
      <span class="topic-row-main"><span class="topic-row-title">${esc(t.title)}</span>
      <span class="topic-row-meta"><span class="phase-chip-dot" aria-hidden="true"></span>${t.phase.code} · ${esc(t.phase.title)}</span></span>
      <span class="topic-row-extra">${extra}</span>
    </a>
  </li>`;
}

export function renderHome(main) {
  document.title = SITE_NAME;
  const s = P.settings();
  const visible = curriculum().order.filter((t) => isVisible(t, s.mustKnowOnly));
  const doneCount = visible.filter((t) => P.status(t.id) === 'done').length;
  const pct = visible.length ? Math.round((doneCount / visible.length) * 100) : 0;
  const target = continueTarget();

  const due = P.dueTopics().map(getTopic).filter(Boolean);
  const revise = P.reviseLater().map(getTopic).filter(Boolean);

  const seen = new Set();
  const recent = P.history()
    .filter((h) => getTopic(h.id) && !seen.has(h.id) && seen.add(h.id))
    .slice(0, 5);

  main.innerHTML = `
  <div class="page home">
    <h1 class="sr-only" tabindex="-1">${SITE_NAME}</h1>

    <section class="continue" aria-label="Continue learning">
      ${target ? `
        <a class="btn btn-primary btn-continue" href="#/topic/${target.topic.id}" style="--line:${lineVar(target.topic.phase)}">
          <span class="btn-continue-text"><span class="btn-continue-verb">${target.verb}:</span> ${esc(target.topic.title)}</span>
          ${icon('arrowRight', 22)}
        </a>
        <p class="continue-note"><span class="phase-chip-dot" style="--line:${lineVar(target.topic.phase)}" aria-hidden="true"></span>${target.topic.phase.code} · ${esc(target.topic.phase.title)} · ${esc(target.note)}</p>
      ` : `
        <p class="continue-done">You have finished every topic on the path. Keep it fresh with <a href="#/revise">revision</a>.</p>
      `}
    </section>

    ${s.introDismissed ? '' : intro()}

    ${due.length || revise.length ? `
    <section class="home-block" aria-labelledby="revise-title">
      <h2 id="revise-title">Revise today</h2>
      <ul class="topic-rows">
        ${due.map((t) => topicRow(t, 'Scheduled review')).join('')}
        ${revise.map((t) => topicRow(t, 'Marked revise later')).join('')}
      </ul>
    </section>` : ''}

    <section class="home-block" aria-labelledby="progress-title">
      <div class="block-head">
        <h2 id="progress-title">Your progress</h2>
        <a href="#/path" class="quiet-link">Open the map</a>
      </div>
      <p class="overall"><strong>${doneCount}</strong> of ${visible.length} topics done${s.mustKnowOnly ? ' (must-know only)' : ''}</p>
      <div class="overall-bar" role="progressbar" aria-label="Topics done" aria-valuemin="0" aria-valuemax="${visible.length}" aria-valuenow="${doneCount}"><span style="width:${pct}%"></span></div>
      <ul class="phase-rows">${phaseRows(s)}</ul>
    </section>

    <section class="home-block" aria-labelledby="recent-title">
      <h2 id="recent-title">Recently read</h2>
      ${recent.length
        ? `<ul class="topic-rows">${recent.map((h) => topicRow(getTopic(h.id), `<time datetime="${new Date(h.at).toISOString()}">${relTime(h.at)}</time>`)).join('')}</ul>`
        : `<p class="empty">Nothing yet. Topics you open will show up here${target ? `, starting with <a href="#/topic/${target.topic.id}">${esc(target.topic.title)}</a>` : ''}.</p>`}
    </section>
  </div>`;

  const dismiss = main.querySelector('#dismiss-intro');
  if (dismiss) {
    dismiss.addEventListener('click', () => {
      P.setSetting('introDismissed', true);
      main.querySelector('.intro').remove();
    });
  }
  return null;
}
