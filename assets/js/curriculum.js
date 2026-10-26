// Loads curriculum.json + glossary.json and answers ordering questions.
// curriculum.json is the source of truth for the order of topics.

let data = null;
const markdownCache = new Map();

async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

export async function loadCurriculum() {
  const [cur, glossary] = await Promise.all([
    fetchJSON('data/curriculum.json'),
    fetchJSON('data/glossary.json').catch(() => ({ terms: [] })),
  ]);
  const order = [];
  const byId = new Map();
  cur.phases.forEach((phase, pi) => {
    phase.num = pi + 1;
    phase.code = `P${String(pi + 1).padStart(2, '0')}`;
    phase.topics.forEach((t, ti) => {
      t.phase = phase;
      t.indexInPhase = ti;
      t.order = order.length;
      order.push(t);
      byId.set(t.id, t);
    });
  });
  data = { phases: cur.phases, order, byId, glossary: glossary.terms || [] };
  return data;
}

export const curriculum = () => data;
export const getTopic = (id) => data.byId.get(id);
export const getPhase = (id) => data.phases.find((p) => p.id === id);
export const lineVar = (phase) => `var(--line-${phase.num})`;

export function isVisible(topic, mustKnowOnly) {
  return !mustKnowOnly || topic.priority === 'must-know';
}

export function visibleTopics(mustKnowOnly) {
  return data.order.filter((t) => isVisible(t, mustKnowOnly));
}

/** Previous/next topic in path order, skipping filtered-out topics. */
export function neighbors(id, mustKnowOnly) {
  const t = getTopic(id);
  if (!t) return { prev: null, next: null };
  let prev = null;
  let next = null;
  for (let i = t.order - 1; i >= 0; i--) {
    if (isVisible(data.order[i], mustKnowOnly)) { prev = data.order[i]; break; }
  }
  for (let i = t.order + 1; i < data.order.length; i++) {
    if (isVisible(data.order[i], mustKnowOnly)) { next = data.order[i]; break; }
  }
  return { prev, next };
}

/** First visible topic after `fromId` (or from the start) that is not Done. */
export function nextUnfinished(statusOf, mustKnowOnly, fromId = null) {
  const start = fromId && getTopic(fromId) ? getTopic(fromId).order + 1 : 0;
  const list = data.order;
  for (let k = 0; k < list.length; k++) {
    const t = list[(start + k) % list.length];
    if (isVisible(t, mustKnowOnly) && statusOf(t.id) !== 'done') return t;
  }
  return null;
}

export async function getMarkdown(topic) {
  if (markdownCache.has(topic.id)) return markdownCache.get(topic.id);
  const res = await fetch(topic.file, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${topic.file} (${res.status})`);
  const text = await res.text();
  markdownCache.set(topic.id, text);
  return text;
}

export const isPlaceholder = (md) => md.trimStart().startsWith('<!-- placeholder');
