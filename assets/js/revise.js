// Revision page: what is due, plus two speaking drills (a single question and
// a 5-question mock interview). Questions come from each topic's interview
// answers and follow-ups; self-ratings feed the schedule in progress.js.

import { curriculum, getTopic, getMarkdown, lineVar, nextUnfinished } from './curriculum.js';
import { renderMarkdown } from './render.js';
import { esc, icon, statusIcon, SITE_NAME, formatDate, announce } from './ui.js';

const P = window.Progress;
const DRILL_SECONDS = 60;
const MOCK_SIZE = 5;

const RATINGS = [
  { id: 'nailed', label: 'Nailed it', hint: 'It comes back later than planned' },
  { id: 'shaky', label: 'Shaky', hint: 'It keeps its current schedule' },
  { id: 'couldnt', label: "Couldn't", hint: 'It is marked Revise later' },
];
const RANK = { nailed: 0, shaky: 1, couldnt: 2 };

const shuffle = (list) => {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
const pick = (list) => list[Math.floor(Math.random() * list.length)];

function row(t, extra) {
  return `<li style="--line:${lineVar(t.phase)}">
    <a href="#/topic/${t.id}" class="topic-row">
      <span class="topic-row-status">${statusIcon(P.status(t.id))}</span>
      <span class="topic-row-main"><span class="topic-row-title">${esc(t.title)}</span>
      <span class="topic-row-meta"><span class="phase-chip-dot" aria-hidden="true"></span>${t.phase.code} · ${esc(t.phase.title)}</span></span>
      <span class="topic-row-extra">${extra}</span>
    </a></li>`;
}

function doneIds() {
  return curriculum().order.filter((t) => P.status(t.id) === 'done').map((t) => t.id);
}

/** Interview questions in a topic: "explain it" (the 30-second answer) plus each follow-up. */
async function questionsFor(topic) {
  const { fragment } = renderMarkdown(await getMarkdown(topic), { topicId: topic.id });
  const sections = [...fragment.querySelectorAll('.topic-section')];
  const titleOf = (s) => s.querySelector('h2').textContent.trim();
  const out = [];

  const say = sections.find((s) => /^how to say it/i.test(titleOf(s)));
  const answers = say ? [...say.querySelectorAll('.callout--interview .callout-body')] : [];
  if (answers.length) {
    out.push({
      topic,
      question: `Explain “${topic.title}” in about 30 seconds.`,
      answer: answers[0].innerHTML,
      more: answers[1] ? answers[1].innerHTML : '',
    });
  }

  const follow = sections.find((s) => /^(follow-up|situations)/i.test(titleOf(s)));
  (follow ? [...follow.querySelectorAll('details')] : []).forEach((d) => {
    const summary = d.querySelector('summary');
    const question = summary.textContent.trim();
    summary.remove();
    out.push({ topic, question, answer: d.innerHTML, more: '' });
  });
  return out;
}

/** Apply one self-rating to the revision schedule. */
function applyRating(id, rating) {
  if (rating === 'nailed' && P.status(id) === 'revise') P.setStatus(id, 'done'); // back on track: restart the schedule
  else P.recordReview(id, rating);
}

/* ---------- overview ---------- */

function practiceBlock() {
  const done = doneIds();
  const canDrill = done.length || P.reviseLater().length;
  const next = nextUnfinished(P.status, P.settings().mustKnowOnly, P.lastTopic());
  const phases = curriculum().phases.filter((ph) => ph.topics.some((t) => done.includes(t.id)));

  return `
  <section class="home-block" aria-labelledby="practice-title">
    <h2 id="practice-title">Practise out loud</h2>
    <p>Reading a topic is not the same as explaining it under pressure. Each question gives you ${DRILL_SECONDS} seconds to answer out loud, then shows the model answer so you can rate yourself honestly.</p>
    ${canDrill ? `
    <div class="practice-options">
      <div class="practice-option">
        <h3>Quick drill</h3>
        <p class="muted small">One question. Topics that are due or marked Revise later come first.</p>
        <a class="btn btn-primary" href="#/revise?mode=drill&n=${Date.now()}">Start a drill</a>
      </div>
      <div class="practice-option">
        <h3>Mock interview</h3>
        ${done.length ? `
        <p class="muted small">${MOCK_SIZE} questions from topics you've marked Done. At the end you get a list of weak topics.</p>
        <label class="small" for="mock-phase">Questions from</label>
        <select id="mock-phase">
          <option value="">All phases</option>
          ${phases.map((ph) => `<option value="${ph.id}">${ph.code} · ${esc(ph.title)}</option>`).join('')}
        </select>
        <button type="button" class="btn" id="start-mock">Start mock interview</button>`
        : '<p class="muted small">Unlocks when you mark at least one topic Done.</p>'}
      </div>
    </div>`
    : `<p class="empty">Practice unlocks when you mark a topic Done.${next ? ` Continue with <a href="#/topic/${next.id}">${esc(next.title)}</a>.` : ''}</p>`}
  </section>`;
}

function renderOverview(main) {
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
      <p class="lede">When you mark a topic done, it comes back here after ${P.REVIEW_DAYS.join(', ').replace(/, (\d+)$/, ', and $1')} days, so it is still fresh on interview day.</p>
    </header>

    ${practiceBlock()}

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
  </div>`;

  const start = main.querySelector('#start-mock');
  if (start) {
    start.addEventListener('click', () => {
      const phase = main.querySelector('#mock-phase').value;
      location.hash = `#/revise?mode=mock${phase ? `&phase=${phase}` : ''}&n=${Date.now()}`;
    });
  }
  return null;
}

/* ---------- drill / mock interview session ---------- */

function renderSession(main, mode, query) {
  const mock = mode === 'mock';
  document.title = `${mock ? 'Mock interview' : 'Drill'} · ${SITE_NAME}`;
  main.innerHTML = `
  <div class="page practice-page">
    <p class="practice-back"><a href="#/revise">${icon('arrowLeft', 16)} End practice</a></p>
    <h1 tabindex="-1">${mock ? 'Mock interview' : 'Explain it out loud'}</h1>
    <div id="practice" aria-live="polite"><p class="loading">Picking a question…</p></div>
  </div>`;

  const box = main.querySelector('#practice');
  let timer = null;
  let destroyed = false;
  const stopTimer = () => { clearInterval(timer); timer = null; };
  const again = `#/revise?mode=${mode}${query.get('phase') ? `&phase=${query.get('phase')}` : ''}`;

  // Which topics to ask about
  let topicIds;
  if (mock) {
    const phase = query.get('phase');
    topicIds = doneIds().filter((id) => !phase || getTopic(id).phase.id === phase);
  } else {
    const forced = query.get('topic');
    const priority = [...P.dueTopics(), ...P.reviseLater()];
    topicIds = forced && getTopic(forced) ? [forced] : (priority.length ? priority : doneIds());
  }
  if (!topicIds.length) {
    box.innerHTML = `<p class="empty">No topics to practise yet. Mark a topic Done first, then come back. <a href="#/revise">Back to Revise</a></p>`;
    return { cleanup: () => {} };
  }

  async function loadQuestions() {
    if (!mock) {
      const qs = await questionsFor(getTopic(pick(topicIds)));
      return qs.length ? [pick(qs)] : [];
    }
    // One question per topic first; reuse topics only when fewer than MOCK_SIZE are done.
    const pools = await Promise.all(shuffle(topicIds).slice(0, MOCK_SIZE).map((id) => questionsFor(getTopic(id)).then(shuffle)));
    const picked = [];
    while (picked.length < MOCK_SIZE && pools.some((p) => p.length)) {
      pools.forEach((p) => { if (p.length && picked.length < MOCK_SIZE) picked.push(p.shift()); });
    }
    return picked;
  }

  const ratings = []; // { id, rating } for the mock summary

  function showQuestion(questions, i) {
    const q = questions[i];
    stopTimer();
    box.innerHTML = `
    <article class="practice-card" style="--line:${lineVar(q.topic.phase)}">
      <p class="practice-meta"><span class="phase-chip-dot" aria-hidden="true"></span>${q.topic.phase.code} · ${esc(q.topic.title)}${mock ? ` · Question ${i + 1} of ${questions.length}` : ''}</p>
      <h2 class="practice-question" tabindex="-1">${esc(q.question)}</h2>
      <p class="practice-prompt">Explain this out loud as if to an interviewer.</p>
      <div class="timer" role="timer" aria-label="Time left">
        <span class="timer-num" id="timer-num">${DRILL_SECONDS}</span><span class="timer-unit">seconds</span>
        <div class="timer-bar" aria-hidden="true"><span id="timer-bar"></span></div>
      </div>
      <div class="button-row" id="question-actions">
        <button type="button" class="btn btn-primary" id="timer-start">Start ${DRILL_SECONDS}-second timer</button>
        <button type="button" class="btn" id="reveal">Show the model answer</button>
      </div>
      <div id="answer" hidden></div>
    </article>`;
    box.querySelector('.practice-question').focus();

    const num = box.querySelector('#timer-num');
    const bar = box.querySelector('#timer-bar');
    const startBtn = box.querySelector('#timer-start');
    startBtn.addEventListener('click', () => {
      let left = DRILL_SECONDS;
      startBtn.disabled = true;
      startBtn.textContent = 'Timer running…';
      timer = setInterval(() => {
        left -= 1;
        num.textContent = String(left);
        bar.style.transform = `scaleX(${left / DRILL_SECONDS})`;
        if (left <= 0) {
          stopTimer();
          box.querySelector('.timer').classList.add('is-up');
          startBtn.textContent = "Time's up";
          announce("Time's up");
          box.querySelector('#reveal').focus();
        }
      }, 1000);
    });
    box.querySelector('#reveal').addEventListener('click', () => reveal(questions, i));
  }

  function reveal(questions, i) {
    const q = questions[i];
    stopTimer();
    box.querySelector('#question-actions').hidden = true;
    const answer = box.querySelector('#answer');
    answer.hidden = false;
    answer.innerHTML = `
      <h3 class="practice-answer-title" tabindex="-1">Model answer</h3>
      <div class="prose practice-answer">${q.answer}</div>
      ${q.more ? `<details class="practice-more"><summary>Longer version (2 minutes)</summary><div class="prose">${q.more}</div></details>` : ''}
      <p class="practice-rate-label">How did you do?</p>
      <div class="rating-row">
        ${RATINGS.map((r) => `<button type="button" class="btn rating rating--${r.id}" data-rating="${r.id}"><span>${r.label}</span><span class="rating-hint">${r.hint}</span></button>`).join('')}
      </div>`;
    answer.querySelector('.practice-answer-title').focus();
    answer.querySelectorAll('[data-rating]').forEach((btn) => {
      btn.addEventListener('click', () => rate(questions, i, btn.dataset.rating));
    });
  }

  function rate(questions, i, rating) {
    const q = questions[i];
    if (!mock) {
      applyRating(q.topic.id, rating);
      const note = {
        nailed: 'Nice. This topic comes back later than planned.',
        shaky: 'Saved. It stays on its current schedule; reread the parts you missed.',
        couldnt: 'Marked Revise later. Reread the topic, then try again.',
      }[rating];
      box.innerHTML = `
      <div class="practice-card practice-result" style="--line:${lineVar(q.topic.phase)}">
        <h2 tabindex="-1">${esc(note)}</h2>
        <div class="button-row">
          <a class="btn btn-primary" href="${again}&n=${Date.now()}">Another question</a>
          <a class="btn" href="#/topic/${q.topic.id}">Open “${esc(q.topic.title)}”</a>
          <a class="btn btn-quiet" href="#/revise">Back to Revise</a>
        </div>
      </div>`;
      box.querySelector('h2').focus();
      return;
    }
    ratings.push({ id: q.topic.id, rating });
    if (i + 1 < questions.length) showQuestion(questions, i + 1);
    else summary();
  }

  function summary() {
    // Each topic gets its worst rating from this interview, applied once.
    const worst = new Map();
    ratings.forEach(({ id, rating }) => {
      if (!worst.has(id) || RANK[rating] > RANK[worst.get(id)]) worst.set(id, rating);
    });
    worst.forEach((rating, id) => applyRating(id, rating));
    const weak = [...worst].filter(([, r]) => r !== 'nailed').map(([id, r]) => ({ t: getTopic(id), r }));
    const strong = [...worst].filter(([, r]) => r === 'nailed').map(([id]) => getTopic(id));
    const nailedCount = ratings.filter((x) => x.rating === 'nailed').length;

    box.innerHTML = `
    <div class="practice-card practice-result">
      <h2 tabindex="-1">You nailed ${nailedCount} of ${ratings.length} questions</h2>
      ${weak.length ? `
        <h3>Weak topics to reread</h3>
        <ul class="topic-rows">${weak.map(({ t, r }) => row(t, r === 'couldnt' ? "Couldn't answer" : 'Shaky')).join('')}</ul>`
        : '<p>No weak topics this time. They will still come back on schedule.</p>'}
      ${strong.length ? `<h3>Strong</h3><ul class="topic-rows">${strong.map((t) => row(t, 'Nailed it')).join('')}</ul>` : ''}
      <div class="button-row practice-end">
        <a class="btn btn-primary" href="${again}&n=${Date.now()}">Start another mock interview</a>
        <a class="btn btn-quiet" href="#/revise">Back to Revise</a>
      </div>
    </div>`;
    box.querySelector('h2').focus();
  }

  loadQuestions().then((questions) => {
    if (destroyed) return;
    if (!questions.length) {
      box.innerHTML = '<p class="empty">Couldn\'t find interview questions for these topics. <a href="#/revise">Back to Revise</a></p>';
      return;
    }
    showQuestion(questions, 0);
  }).catch((err) => {
    if (!destroyed) box.innerHTML = `<p class="empty">Couldn't load questions (${esc(err.message)}). <a href="#/revise">Back to Revise</a></p>`;
  });

  return {
    cleanup() {
      destroyed = true;
      stopTimer();
    },
  };
}

export function renderRevise(main, query) {
  const mode = query && query.get('mode');
  if (mode === 'drill' || mode === 'mock') return renderSession(main, mode, query);
  return renderOverview(main);
}
