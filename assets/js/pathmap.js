// The learning path: a metro-style route map (default) and a plain checklist.
//
// One semantic DOM (an <ol> of station links per phase) serves both layouts:
// - wide screens: JS positions stations on snaking horizontal rows over an SVG track
// - narrow screens: pure CSS, one vertical line per phase

import { curriculum, lineVar, isVisible } from './curriculum.js';
import { esc, icon, statusIcon, STATUS_LABEL, SITE_NAME, announce, prefersReducedMotion } from './ui.js';

const P = window.Progress;

// Layout constants (px). Labels sit under each station and wrap to at most 3 lines.
const VERTICAL_BELOW = 640; // track width under which lines go vertical
const LABEL_W = 128;
const GAP_MIN = 124;        // smallest distance between two full stations
const GAP_MAX = 168;
const MINOR_GAP = 0.5;      // good-to-know ticks (must-know-only mode) take half a gap
const TURN = 80;            // how far a U-turn swings out past the row's end station
const CORNER = 22;
const TOP = 46;             // room above the first row for the "You are here" pin
const ROW_H = 132;

function stationsFor(phase, s) {
  const statusOf = (id) => P.status(id);
  return phase.topics.map((t) => ({
    t,
    status: statusOf(t.id),
    minor: !isVisible(t, s.mustKnowOnly),
  }));
}

function legend() {
  const item = (cls, label) => `<li><span class="legend-dot station-dot--${cls}" aria-hidden="true"></span>${label}</li>`;
  return `<ul class="legend" aria-label="Map legend">
    ${item('not-started', 'Not started')}
    ${item('reading', 'Reading')}
    ${item('done', 'Done')}
    ${item('revise', 'Needs revision')}
    <li><span class="legend-pin" aria-hidden="true">You are here</span></li>
    <li><span class="star" aria-hidden="true">★</span> Must-know</li>
  </ul>`;
}

function mapHtml(s, here) {
  return curriculum().phases.map((phase) => {
    const stations = stationsFor(phase, s);
    const counted = stations.filter((x) => !x.minor);
    const done = counted.filter((x) => x.status === 'done').length;
    const items = stations.map((x, i) => {
      const nextDone = stations[i + 1] && stations[i + 1].status === 'done';
      const cls = [
        'station', `is-${x.status}`,
        x.minor ? 'is-minor' : '',
        x.t.priority === 'must-know' ? 'is-must' : '',
        x.t.id === here ? 'is-here' : '',
        x.status === 'done' && nextDone ? 'seg-done' : '',
      ].filter(Boolean).join(' ');
      const sr = `${STATUS_LABEL[x.status]}${x.t.priority === 'must-know' ? ', must-know' : ''}${x.t.id === here ? ', you are here' : ''}`;
      return `<li class="${cls}" data-id="${x.t.id}">
        <a class="station-link" href="#/topic/${x.t.id}"${x.minor ? ` title="${esc(x.t.title)}"` : ''}>
          <span class="station-dot station-dot--${x.status}" aria-hidden="true"></span>
          <span class="station-label"><span class="station-num" aria-hidden="true">${x.t.indexInPhase + 1}</span>${esc(x.t.title)}${x.t.priority === 'must-know' ? '<span class="star" aria-hidden="true"> ★</span>' : ''}<span class="sr-only"> (${sr})</span></span>
        </a>
        ${x.t.id === here ? '<span class="here-pin" aria-hidden="true">You are here</span>' : ''}
      </li>`;
    }).join('');
    return `
    <section class="line" id="line-${phase.id}" style="--line:${lineVar(phase)}" aria-labelledby="line-${phase.id}-title">
      <header class="line-head">
        <span class="line-badge" aria-hidden="true">${phase.code}</span>
        <div class="line-titles">
          <h2 id="line-${phase.id}-title"><span class="sr-only">${phase.code}: </span>${esc(phase.title)}</h2>
          <p class="line-summary">${esc(phase.summary)}</p>
        </div>
        <p class="line-count"><strong>${done}</strong> of ${counted.length} done</p>
      </header>
      <div class="line-track">
        <svg class="line-svg" aria-hidden="true" focusable="false"></svg>
        <ol class="stations">${items}</ol>
      </div>
    </section>`;
  }).join('');
}

function listHtml(s, here) {
  return curriculum().phases.map((phase) => {
    const topics = phase.topics.filter((t) => isVisible(t, s.mustKnowOnly));
    const done = topics.filter((t) => P.status(t.id) === 'done').length;
    return `
    <section class="list-phase" id="line-${phase.id}" style="--line:${lineVar(phase)}" aria-labelledby="list-${phase.id}-title">
      <h2 id="list-${phase.id}-title"><span class="line-badge" aria-hidden="true">${phase.code}</span><span class="list-phase-title">${esc(phase.title)}</span><span class="line-count"><strong>${done}</strong> of ${topics.length} done</span></h2>
      <ul class="check-list">
        ${topics.map((t) => {
          const st = P.status(t.id);
          return `<li class="${t.id === here ? 'is-here' : ''}" data-status="${st}">
            <input type="checkbox" id="chk-${t.id}" data-done-toggle="${t.id}"${st === 'done' ? ' checked' : ''} aria-label="Done: ${esc(t.title)}">
            <span class="check-status" title="${STATUS_LABEL[st]}">${statusIcon(st)}<span class="sr-only">${STATUS_LABEL[st]}</span></span>
            <a href="#/topic/${t.id}">${esc(t.title)}</a>
            ${t.priority === 'must-know' ? '<span class="star" title="Must-know">★<span class="sr-only"> must-know</span></span>' : ''}
            ${t.id === here ? '<span class="legend-pin">You are here</span>' : ''}
            <span class="check-min">${t.minutes} min</span>
          </li>`;
        }).join('')}
      </ul>
    </section>`;
  }).join('');
}

/* ---------- map layout ---------- */

function splitRows(stations, capacity) {
  const run = (limit) => {
    const rows = [[0]];
    let len = 0;
    for (let i = 1; i < stations.length; i++) {
      const gap = stations[i].minor || stations[i - 1].minor ? MINOR_GAP : 1;
      if (len + gap > limit + 1e-6) {
        rows.push([i]);
        len = 0;
      } else {
        rows[rows.length - 1].push(i);
        len += gap;
      }
    }
    return rows;
  };
  const greedy = run(capacity);
  if (greedy.length < 2) return greedy;
  // Balance rows so the last one isn't a lonely stub.
  let total = 0;
  for (let i = 1; i < stations.length; i++) total += stations[i].minor || stations[i - 1].minor ? MINOR_GAP : 1;
  const balanced = run(Math.min(capacity, Math.ceil((total - (greedy.length - 1)) / greedy.length)));
  return balanced.length === greedy.length ? balanced : greedy;
}

function layoutLine(section) {
  const track = section.querySelector('.line-track');
  const svg = track.querySelector('.line-svg');
  const lis = [...track.querySelectorAll('.station')];
  const width = track.clientWidth;

  if (width < VERTICAL_BELOW) {
    track.classList.add('is-vertical');
    track.classList.remove('is-horizontal');
    track.style.height = '';
    svg.innerHTML = '';
    lis.forEach((li) => { li.style.left = ''; li.style.top = ''; });
    return;
  }
  track.classList.add('is-horizontal');
  track.classList.remove('is-vertical');

  const stations = lis.map((li) => ({ li, minor: li.classList.contains('is-minor'), done: li.classList.contains('is-done') }));
  const gapAfter = (i) => (stations[i].minor || stations[i + 1].minor ? MINOR_GAP : 1);

  let pad = LABEL_W / 2 + 6;
  let capacity = Math.max(1, Math.floor((width - 2 * pad) / GAP_MIN));
  let rows = splitRows(stations, capacity);
  if (rows.length > 1) {
    pad = TURN + 14;
    capacity = Math.max(1, Math.floor((width - 2 * pad) / GAP_MIN));
    rows = splitRows(stations, capacity);
  }

  const rowLen = rows.map((r) => r.slice(0, -1).reduce((sum, i) => sum + gapAfter(i), 0));
  const maxLen = Math.max(1, ...rowLen);
  const unit = Math.min(GAP_MAX, (width - 2 * pad) / maxLen);
  const xLeft = pad;
  const xRight = pad + unit * maxLen;

  const pos = [];
  rows.forEach((row, r) => {
    const y = TOP + r * ROW_H;
    const dir = r % 2 === 0 ? 1 : -1;
    let x = dir === 1 ? xLeft : xRight;
    row.forEach((i, k) => {
      if (k > 0) x += dir * unit * gapAfter(row[k - 1]);
      pos[i] = { x, y, row: r };
    });
  });

  lis.forEach((li, i) => {
    li.style.left = `${pos[i].x}px`;
    li.style.top = `${pos[i].y}px`;
  });

  const segs = [];
  for (let i = 0; i < stations.length - 1; i++) {
    const a = pos[i];
    const b = pos[i + 1];
    let d;
    if (a.row === b.row) {
      d = `M${a.x} ${a.y}H${b.x}`;
    } else if (a.row % 2 === 0) {
      const xt = xRight + TURN;
      d = `M${a.x} ${a.y}H${xt - CORNER}A${CORNER} ${CORNER} 0 0 1 ${xt} ${a.y + CORNER}V${b.y - CORNER}A${CORNER} ${CORNER} 0 0 1 ${xt - CORNER} ${b.y}H${b.x}`;
    } else {
      const xt = xLeft - TURN;
      d = `M${a.x} ${a.y}H${xt + CORNER}A${CORNER} ${CORNER} 0 0 0 ${xt} ${a.y + CORNER}V${b.y - CORNER}A${CORNER} ${CORNER} 0 0 0 ${xt + CORNER} ${b.y}H${b.x}`;
    }
    const travelled = stations[i].done && stations[i + 1].done;
    segs.push(`<path d="${d}" class="seg${travelled ? ' seg--done' : ''}"/>`);
  }

  const height = TOP + (rows.length - 1) * ROW_H + 96;
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.innerHTML = segs.join('');
  track.style.height = `${height}px`;
}

/* ---------- view ---------- */

export function renderPath(main, query) {
  document.title = `Learning path · ${SITE_NAME}`;
  const s = P.settings();
  const here = P.lastTopic();
  const total = curriculum().order.filter((t) => isVisible(t, s.mustKnowOnly)).length;
  const view = s.pathView === 'list' ? 'list' : 'map';

  main.innerHTML = `
  <div class="page page--wide path-page">
    <header class="page-head">
      <h1 tabindex="-1">Learning path</h1>
      <p class="lede">${curriculum().phases.length} lines, ${total} stops, from how the internet works to the interview itself. Ride each line in order; every topic only uses ideas from the stops before it.</p>
      ${s.mustKnowOnly ? '<p class="filter-note">Showing must-know topics only. Good-to-know topics appear as small ticks. <a href="#/settings">Change in settings</a></p>' : ''}
      <div class="path-tools">
        <div class="segmented" role="group" aria-label="Path view">
          <button type="button" data-view="map" aria-pressed="${view === 'map'}">${icon('map', 18)}<span>Map</span></button>
          <button type="button" data-view="list" aria-pressed="${view === 'list'}">${icon('list', 18)}<span>List</span></button>
        </div>
        ${view === 'map' ? legend() : ''}
      </div>
    </header>
    <div class="path-body path-body--${view}" id="path-body">
      ${view === 'map' ? mapHtml(s, here) : listHtml(s, here)}
    </div>
  </div>`;

  main.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => {
      P.setSetting('pathView', btn.dataset.view);
      renderPath(main, query);
      main.querySelector(`[data-view="${btn.dataset.view}"]`).focus();
    });
  });

  main.querySelectorAll('[data-done-toggle]').forEach((box) => {
    box.addEventListener('change', () => {
      const id = box.dataset.doneToggle;
      P.setStatus(id, box.checked ? 'done' : 'reading');
      const li = box.closest('li');
      const st = box.checked ? 'done' : 'reading';
      li.dataset.status = st;
      li.querySelector('.check-status').innerHTML = `${statusIcon(st)}<span class="sr-only">${STATUS_LABEL[st]}</span>`;
      const section = box.closest('.list-phase');
      section.querySelector('.line-count strong').textContent = section.querySelectorAll('input:checked').length;
      announce(box.checked ? 'Marked done' : 'Marked as reading');
    });
  });

  let observer = null;
  if (view === 'map') {
    const lines = [...main.querySelectorAll('.line')];
    let frame = 0;
    const relayout = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => lines.forEach(layoutLine));
    };
    lines.forEach(layoutLine);
    observer = new ResizeObserver(relayout);
    observer.observe(main.querySelector('#path-body'));
  }

  // Bring the requested phase, or "You are here", into view.
  const behavior = 'auto';
  const phaseTarget = query.get('phase') && main.querySelector(`#line-${CSS.escape(query.get('phase'))}`);
  if (phaseTarget) {
    phaseTarget.scrollIntoView({ block: 'start', behavior });
  } else if (here) {
    const hereEl = main.querySelector(view === 'map' ? '.station.is-here' : '.check-list .is-here');
    if (hereEl) hereEl.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : behavior });
  }

  return {
    cleanup() {
      if (observer) observer.disconnect();
    },
  };
}
