/*
 * progress.js: the ONLY file that reads or writes localStorage.
 *
 * Loaded as a classic (non-module) script in <head> so the saved theme is
 * applied before the first paint. Other modules use it via `window.Progress`.
 * Every storage access is wrapped in try/catch; if storage is unavailable
 * (private browsing, blocked cookies) state lives in memory for the session.
 */
(function () {
  'use strict';

  const KEY = 'bip:v1';
  const SCHEMA = 1;
  const HISTORY_CAP = 50;
  const DAY = 24 * 60 * 60 * 1000;
  const REVIEW_DAYS = [3, 10, 30]; // revision reminders after a topic is marked Done
  const STATUSES = ['not-started', 'reading', 'done', 'revise'];

  const defaultSettings = () => ({
    theme: 'system',      // 'system' | 'light' | 'dark'
    mustKnowOnly: false,
    introDismissed: false,
    pathView: 'map',      // 'map' | 'list'
    quickReview: false,   // topic pages show only the core sections
  });

  const emptyState = () => ({
    schema: SCHEMA,
    lastTopic: null,
    topics: {},
    history: [],
    settings: defaultSettings(),
  });

  const emptyTopic = () => ({
    status: 'not-started',
    scroll: 0,
    notes: '',
    updatedAt: 0,
    doneAt: null,
    nextReview: null,
    reviewStep: 0,
  });

  let available = true;
  let state = emptyState();
  const listeners = new Set();

  /* ---------- raw storage ---------- */

  function readRaw() {
    try {
      return window.localStorage.getItem(KEY);
    } catch (e) {
      available = false;
      return null;
    }
  }

  function writeRaw(text) {
    try {
      window.localStorage.setItem(KEY, text);
      available = true;
      return true;
    } catch (e) {
      available = false;
      return false;
    }
  }

  /* ---------- schema migration ---------- */

  const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

  function normalizeTopic(t) {
    const base = emptyTopic();
    if (!t || typeof t !== 'object') return base;
    return {
      status: STATUSES.includes(t.status) ? t.status : base.status,
      scroll: isNum(t.scroll) ? Math.min(1, Math.max(0, t.scroll)) : 0,
      notes: typeof t.notes === 'string' ? t.notes : '',
      updatedAt: isNum(t.updatedAt) ? t.updatedAt : 0,
      doneAt: isNum(t.doneAt) ? t.doneAt : null,
      nextReview: isNum(t.nextReview) ? t.nextReview : null,
      reviewStep: isNum(t.reviewStep) ? t.reviewStep : 0,
    };
  }

  /**
   * Bring any saved shape up to the current schema without losing progress.
   * When the schema changes, add a step here (e.g. `if (data.schema === 1) {...; data.schema = 2;}`)
   * and bump SCHEMA. Never drop fields a reader cares about.
   */
  function migrate(data) {
    if (!data || typeof data !== 'object') return emptyState();
    const out = emptyState();
    out.lastTopic = typeof data.lastTopic === 'string' ? data.lastTopic : null;
    if (data.topics && typeof data.topics === 'object') {
      for (const [id, t] of Object.entries(data.topics)) out.topics[id] = normalizeTopic(t);
    }
    if (Array.isArray(data.history)) {
      out.history = data.history
        .filter((h) => h && typeof h.id === 'string' && isNum(h.at))
        .slice(0, HISTORY_CAP);
    }
    if (data.settings && typeof data.settings === 'object') {
      out.settings = { ...defaultSettings(), ...data.settings };
    }
    return out;
  }

  function load() {
    const raw = readRaw();
    if (!raw) return emptyState();
    try {
      return migrate(JSON.parse(raw));
    } catch (e) {
      return emptyState();
    }
  }

  function save() {
    writeRaw(JSON.stringify(state));
    listeners.forEach((fn) => {
      try { fn(); } catch (e) { console.error(e); }
    });
  }

  /* ---------- topics ---------- */

  function entry(id) {
    if (!state.topics[id]) state.topics[id] = emptyTopic();
    return state.topics[id];
  }

  function topic(id) {
    return { ...emptyTopic(), ...(state.topics[id] || {}) };
  }

  function status(id) {
    return state.topics[id] ? state.topics[id].status : 'not-started';
  }

  function setStatus(id, next) {
    if (!STATUSES.includes(next)) return;
    const t = entry(id);
    const now = Date.now();
    t.status = next;
    t.updatedAt = now;
    if (next === 'done') {
      t.doneAt = now;
      t.reviewStep = 0;
      t.nextReview = now + REVIEW_DAYS[0] * DAY;
    } else {
      t.nextReview = null;
      t.reviewStep = 0;
      if (next === 'not-started') t.doneAt = null;
    }
    save();
  }

  /** Called when a topic page is opened: marks it Reading if new, records history. */
  function open(id) {
    const t = entry(id);
    const now = Date.now();
    if (t.status === 'not-started') {
      t.status = 'reading';
      t.updatedAt = now;
    }
    state.lastTopic = id;
    state.history = [{ id, at: now }, ...state.history.filter((h) => h.id !== id)].slice(0, HISTORY_CAP);
    save();
  }

  function setScroll(id, fraction) {
    if (!isNum(fraction)) return;
    const t = entry(id);
    t.scroll = Math.min(1, Math.max(0, Math.round(fraction * 1000) / 1000));
    t.updatedAt = Date.now();
    // Scroll saves are frequent; skip notifying listeners to avoid needless re-renders.
    writeRaw(JSON.stringify(state));
  }

  function setNotes(id, text) {
    const t = entry(id);
    t.notes = String(text);
    t.updatedAt = Date.now();
    writeRaw(JSON.stringify(state));
  }

  /** Topics whose scheduled revision date has arrived. */
  function dueTopics(now = Date.now()) {
    return Object.entries(state.topics)
      .filter(([, t]) => t.status === 'done' && t.nextReview && t.nextReview <= now)
      .sort((a, b) => a[1].nextReview - b[1].nextReview)
      .map(([id]) => id);
  }

  function reviseLater() {
    return Object.entries(state.topics)
      .filter(([, t]) => t.status === 'revise')
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .map(([id]) => id);
  }

  /** Self-rating after a drill: 'nailed' | 'shaky' | 'couldnt'. */
  function recordReview(id, rating) {
    const t = entry(id);
    const now = Date.now();
    t.updatedAt = now;
    if (rating === 'couldnt') {
      t.status = 'revise';
      t.nextReview = null;
      t.reviewStep = 0;
    } else if (rating === 'nailed') {
      t.reviewStep += 1;
      t.nextReview = t.reviewStep < REVIEW_DAYS.length ? now + REVIEW_DAYS[t.reviewStep] * DAY : null;
    } else if (t.status === 'done') {
      // Shaky: repeat the current interval.
      t.nextReview = now + REVIEW_DAYS[Math.min(t.reviewStep, REVIEW_DAYS.length - 1)] * DAY;
    }
    save();
  }

  /* ---------- settings ---------- */

  function settings() {
    return { ...state.settings };
  }

  function setSetting(key, value) {
    state.settings[key] = value;
    if (key === 'theme') applyTheme();
    save();
  }

  function applyTheme() {
    const theme = state.settings.theme;
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
    else root.removeAttribute('data-theme');
  }

  /* ---------- export / import ---------- */

  function exportData() {
    return {
      app: 'backend-interview-playbook',
      exportedAt: new Date().toISOString(),
      ...JSON.parse(JSON.stringify(state)),
    };
  }

  /** Merge rule: for each topic keep whichever entry was updated most recently. */
  function importData(incoming) {
    const other = migrate(incoming);
    let updated = 0;
    let kept = 0;
    for (const [id, t] of Object.entries(other.topics)) {
      const mine = state.topics[id];
      if (!mine || t.updatedAt > mine.updatedAt) {
        state.topics[id] = t;
        updated += 1;
      } else {
        kept += 1;
      }
    }
    const seen = new Set();
    state.history = [...state.history, ...other.history]
      .sort((a, b) => b.at - a.at)
      .filter((h) => (seen.has(h.id) ? false : seen.add(h.id)))
      .slice(0, HISTORY_CAP);
    state.lastTopic = state.history.length ? state.history[0].id : state.lastTopic || other.lastTopic;
    save();
    return { updated, kept };
  }

  /* Progress code: JSON -> deflate (built-in CompressionStream) -> base64url. */

  const CODE_PREFIX_ZIP = 'bip1.';
  const CODE_PREFIX_RAW = 'bip0.';

  function toBase64Url(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function fromBase64Url(text) {
    const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  async function pipeBytes(bytes, stream) {
    const out = new Blob([bytes]).stream().pipeThrough(stream);
    return new Uint8Array(await new Response(out).arrayBuffer());
  }

  async function toCode() {
    // Settings stay per device; the code carries progress only.
    const payload = JSON.stringify({ schema: SCHEMA, lastTopic: state.lastTopic, topics: state.topics, history: state.history });
    const bytes = new TextEncoder().encode(payload);
    if (typeof CompressionStream === 'function') {
      try {
        return CODE_PREFIX_ZIP + toBase64Url(await pipeBytes(bytes, new CompressionStream('deflate-raw')));
      } catch (e) { /* fall through to uncompressed */ }
    }
    return CODE_PREFIX_RAW + toBase64Url(bytes);
  }

  async function fromCode(code) {
    const text = String(code).trim();
    let bytes;
    if (text.startsWith(CODE_PREFIX_ZIP)) {
      if (typeof DecompressionStream !== 'function') throw new Error('This browser cannot read compressed codes.');
      bytes = await pipeBytes(fromBase64Url(text.slice(CODE_PREFIX_ZIP.length)), new DecompressionStream('deflate-raw'));
    } else if (text.startsWith(CODE_PREFIX_RAW)) {
      bytes = fromBase64Url(text.slice(CODE_PREFIX_RAW.length));
    } else {
      throw new Error('That does not look like a progress code.');
    }
    return importData(JSON.parse(new TextDecoder().decode(bytes)));
  }

  function reset() {
    const keep = { theme: state.settings.theme };
    state = emptyState();
    state.settings = { ...state.settings, ...keep };
    save();
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  /* ---------- boot ---------- */

  state = load();
  applyTheme();

  // Keep tabs in sync: another tab saved progress.
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    state = load();
    applyTheme();
    listeners.forEach((fn) => {
      try { fn(); } catch (err) { console.error(err); }
    });
  });

  window.Progress = {
    STATUSES,
    REVIEW_DAYS,
    isAvailable: () => available,
    topic,
    status,
    setStatus,
    open,
    setScroll,
    setNotes,
    dueTopics,
    reviseLater,
    recordReview,
    lastTopic: () => state.lastTopic,
    history: () => state.history.slice(),
    settings,
    setSetting,
    exportData,
    importData,
    toCode,
    fromCode,
    reset,
    subscribe,
    migrate,
  };
})();
