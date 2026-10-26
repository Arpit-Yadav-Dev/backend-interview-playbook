// Small shared helpers: escaping, icons, status labels, timing utilities.

export const SITE_NAME = 'Backend Interview Playbook';

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[`'"’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
}

export const STATUS_LABEL = {
  'not-started': 'Not started',
  reading: 'Reading',
  done: 'Done',
  revise: 'Revise later',
};

/** Status icons mirror the route-map stations: hollow, half, filled, ringed. */
export function statusIcon(status, size = 16) {
  const s = `width="${size}" height="${size}" viewBox="0 0 16 16" aria-hidden="true" focusable="false" class="status-icon status-icon--${status}"`;
  switch (status) {
    case 'reading':
      return `<svg ${s}><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 2a6 6 0 0 0 0 12z" fill="currentColor"/></svg>`;
    case 'done':
      return `<svg ${s}><circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M4.8 8.2l2.1 2.1 4.3-4.5" fill="none" stroke="var(--bg)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case 'revise':
      return `<svg ${s}><circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="8" cy="8" r="3.4" fill="currentColor"/></svg>`;
    default:
      return `<svg ${s}><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
  }
}

const ICON_PATHS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20h5v-6h4v6h5V9.5"/>',
  path: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.5 6H15a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h6.5"/>',
  revise: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2.2"/><circle cx="8" cy="17" r="2.2"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  tip: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z"/>',
  interview: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  mistake: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  note: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="m3.5 6 1 1 2-2M3.5 12l1 1 2-2M3.5 18l1 1 2-2"/>',
  map: '<circle cx="5" cy="7" r="2"/><circle cx="12" cy="7" r="2"/><circle cx="19" cy="7" r="2"/><circle cx="12" cy="17" r="2"/><path d="M7 7h3M14 7h3M19 9v3a5 5 0 0 1-5 5"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
};

export function icon(name, size = 20) {
  return `<svg class="icon icon--${name}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON_PATHS[name] || ''}</svg>`;
}

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function relTime(ts, now = Date.now()) {
  const diff = Math.round((ts - now) / 1000);
  const abs = Math.abs(diff);
  if (abs < 45) return 'just now';
  const steps = [
    [60, 'second', 1], [3600, 'minute', 60], [86400, 'hour', 3600],
    [604800, 'day', 86400], [2629800, 'week', 604800], [31557600, 'month', 2629800],
  ];
  for (const [limit, unit, size] of steps) {
    if (abs < limit) return rtf.format(Math.round(diff / size), unit);
  }
  return rtf.format(Math.round(diff / 31557600), 'year');
}

export function formatDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function debounce(fn, ms) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = (...args) => { clearTimeout(t); fn(...args); };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

export function throttle(fn, ms) {
  let last = 0;
  let timer = null;
  return (...args) => {
    const now = Date.now();
    const wait = ms - (now - last);
    if (wait <= 0) {
      last = now;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        last = Date.now();
        timer = null;
        fn(...args);
      }, wait);
    }
  };
}

/** Polite screen-reader announcement, plus a brief visible toast. */
export function announce(message) {
  const live = document.getElementById('announcer');
  if (live) {
    live.textContent = '';
    requestAnimationFrame(() => { live.textContent = message; });
  }
  const toast = document.getElementById('toast');
  if (toast) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(announce.timer);
    announce.timer = setTimeout(() => { toast.hidden = true; }, 2200);
  }
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // Fallback for non-secure contexts.
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    area.remove();
    return ok;
  }
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
