// Settings: theme, must-know filter, export/import, progress code, reset.

import { icon, SITE_NAME, announce, copyText } from './ui.js';

const P = window.Progress;

export function renderSettings(main) {
  document.title = `Settings · ${SITE_NAME}`;
  const s = P.settings();
  const radio = (value, label) => `<label class="radio"><input type="radio" name="theme" value="${value}"${s.theme === value ? ' checked' : ''}><span>${label}</span></label>`;

  main.innerHTML = `
  <div class="page settings">
    <header class="page-head"><h1 tabindex="-1">Settings</h1></header>

    <section class="settings-block" aria-labelledby="set-look">
      <h2 id="set-look">Appearance</h2>
      <fieldset class="radio-group">
        <legend>Theme</legend>
        ${radio('system', 'Match my device')}${radio('light', 'Light')}${radio('dark', 'Dark')}
      </fieldset>
    </section>

    <section class="settings-block" aria-labelledby="set-focus">
      <h2 id="set-focus">Study focus</h2>
      <label class="switch">
        <input type="checkbox" id="must-know"${s.mustKnowOnly ? ' checked' : ''}>
        <span class="switch-track" aria-hidden="true"></span>
        <span><strong>Only show must-know topics</strong><br><span class="muted">For when your interview is days away. Hides good-to-know topics from the path and the counts.</span></span>
      </label>
    </section>

    <section class="settings-block" aria-labelledby="set-progress">
      <h2 id="set-progress">Your progress</h2>
      <p class="storage-note">${P.isAvailable()
        ? 'Progress is saved in this browser on this device only. Your phone will not see what you did on your laptop unless you move it with one of the options below.'
        : '<strong>This browser is blocking storage</strong> (private browsing or strict settings), so progress will be lost when you close the tab. Export it before you leave.'}</p>

      <h3>Save to a file</h3>
      <div class="button-row">
        <button type="button" class="btn" id="export-btn">${icon('download', 18)}<span>Export progress</span></button>
        <label class="btn btn-file">${icon('upload', 18)}<span>Import progress</span><input type="file" id="import-file" accept="application/json,.json"></label>
      </div>
      <p class="muted small">Importing merges: for each topic, the most recently updated version wins. Nothing is deleted.</p>

      <h3>Progress code</h3>
      <p class="muted small">A copyable code for moving progress between devices, for example by messaging it to yourself.</p>
      <div class="button-row">
        <button type="button" class="btn" id="code-make">Create my code</button>
      </div>
      <div class="code-out" id="code-out" hidden>
        <label for="code-text" class="small">Your code</label>
        <textarea id="code-text" rows="3" readonly></textarea>
        <button type="button" class="btn" id="code-copy">${icon('copy', 18)}<span>Copy code</span></button>
      </div>
      <label for="code-in" class="small code-in-label">Paste a code from another device</label>
      <textarea id="code-in" rows="3" placeholder="bip1.…"></textarea>
      <div class="button-row"><button type="button" class="btn" id="code-apply">Apply code</button></div>
      <p class="form-msg" id="progress-msg" role="status"></p>
    </section>

    <section class="settings-block settings-danger" aria-labelledby="set-reset">
      <h2 id="set-reset">Start over</h2>
      <p class="muted small">Erases every status, note, and history entry in this browser. Export first if you might want it back.</p>
      <div class="button-row">
        <button type="button" class="btn btn-danger" id="reset-btn">Reset all progress</button>
        <button type="button" class="btn btn-danger-solid" id="reset-confirm" hidden>Yes, erase everything</button>
        <button type="button" class="btn btn-quiet" id="reset-cancel" hidden>Cancel</button>
      </div>
    </section>
  </div>`;

  const msg = main.querySelector('#progress-msg');
  const say = (text, isError = false) => {
    msg.textContent = text;
    msg.classList.toggle('is-error', isError);
  };

  main.querySelectorAll('input[name="theme"]').forEach((r) => {
    r.addEventListener('change', () => {
      P.setSetting('theme', r.value);
      announce(`Theme: ${r.parentElement.textContent.trim()}`);
    });
  });

  main.querySelector('#must-know').addEventListener('change', (e) => {
    P.setSetting('mustKnowOnly', e.target.checked);
    announce(e.target.checked ? 'Showing must-know topics only' : 'Showing all topics');
  });

  main.querySelector('#export-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(P.exportData(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interview-playbook-progress-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say('Progress exported. Check your downloads.');
  });

  main.querySelector('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const { updated, kept } = P.importData(JSON.parse(await file.text()));
      say(`Imported. ${updated} topic${updated === 1 ? '' : 's'} updated, ${kept} kept from this browser because they were newer.`);
    } catch (err) {
      say('That file could not be read. Choose a file made with “Export progress”.', true);
    }
    e.target.value = '';
  });

  main.querySelector('#code-make').addEventListener('click', async () => {
    const code = await P.toCode();
    main.querySelector('#code-text').value = code;
    main.querySelector('#code-out').hidden = false;
    say(`Code created (${code.length} characters).`);
  });

  main.querySelector('#code-copy').addEventListener('click', async () => {
    const ok = await copyText(main.querySelector('#code-text').value);
    say(ok ? 'Code copied.' : 'Could not copy. Select the code and copy it manually.', !ok);
  });

  main.querySelector('#code-apply').addEventListener('click', async () => {
    const value = main.querySelector('#code-in').value;
    if (!value.trim()) {
      say('Paste a code first.', true);
      return;
    }
    try {
      const { updated, kept } = await P.fromCode(value);
      say(`Code applied. ${updated} topic${updated === 1 ? '' : 's'} updated, ${kept} kept from this browser.`);
      main.querySelector('#code-in').value = '';
    } catch (err) {
      say(`That code did not work: ${err.message}`, true);
    }
  });

  const resetBtn = main.querySelector('#reset-btn');
  const confirmBtn = main.querySelector('#reset-confirm');
  const cancelBtn = main.querySelector('#reset-cancel');
  const toggleConfirm = (on) => {
    resetBtn.hidden = on;
    confirmBtn.hidden = !on;
    cancelBtn.hidden = !on;
    (on ? cancelBtn : resetBtn).focus();
  };
  resetBtn.addEventListener('click', () => toggleConfirm(true));
  cancelBtn.addEventListener('click', () => toggleConfirm(false));
  confirmBtn.addEventListener('click', () => {
    P.reset();
    toggleConfirm(false);
    announce('All progress erased');
    say('All progress erased.');
  });
  return null;
}
