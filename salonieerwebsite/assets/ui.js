// Shared UI pieces: modal dialogs, toasts, button busy states and the bot-challenge solver.

// ---- Modal ---------------------------------------------------------------------------------------------------------
// confirmDialog({ title, body, confirm, cancel, tone }) resolves true/false. Focus is trapped inside and returned to
// the element that opened it; Escape and the backdrop cancel.
export function confirmDialog({ title, body = '', confirm = 'OK', cancel = 'Cancel', tone = '' }) {
  return new Promise(resolve => {
    const opener = document.activeElement;
    const wrap = document.createElement('div');
    wrap.className = 'modal-root';
    wrap.innerHTML = `<div class="modal-backdrop" data-close></div><div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="modal-title" aria-describedby="modal-body"><h2 id="modal-title"></h2><p id="modal-body"></p><div class="modal-actions"><button type="button" class="btn" data-cancel></button><button type="button" class="btn ${tone === 'danger' ? 'danger-solid' : 'primary'}" data-ok></button></div></div>`;
    wrap.querySelector('h2').textContent = title;
    wrap.querySelector('#modal-body').textContent = body;
    wrap.querySelector('[data-ok]').textContent = confirm;
    wrap.querySelector('[data-cancel]').textContent = cancel;
    document.body.appendChild(wrap);
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => wrap.classList.add('is-open'));
    const buttons = [...wrap.querySelectorAll('button')];
    buttons[0].focus();
    const done = value => {
      wrap.classList.remove('is-open'); wrap.classList.add('is-closing');
      document.body.classList.remove('modal-open');
      document.removeEventListener('keydown', key, true);
      setTimeout(() => wrap.remove(), 220);
      opener?.focus?.({ preventScroll: true });
      resolve(value);
    };
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); done(false); }
      if (e.key === 'Tab') { const i = buttons.indexOf(document.activeElement); e.preventDefault(); buttons[(i + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length].focus(); }
    };
    document.addEventListener('keydown', key, true);
    wrap.addEventListener('click', e => { if (e.target.closest('[data-ok]')) done(true); else if (e.target.closest('[data-cancel],[data-close]')) done(false); });
  });
}

// ---- Toast ---------------------------------------------------------------------------------------------------------
let toastHost;
export function toast(message, tone = 'info', ms = 3600) {
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'toast-host';
    toastHost.setAttribute('role', 'status');
    toastHost.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastHost);
  }
  const el = document.createElement('div');
  el.className = `toast ${tone}`;
  el.textContent = message;
  toastHost.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  setTimeout(() => { el.classList.remove('is-in'); setTimeout(() => el.remove(), 300); }, ms);
}

// ---- Busy buttons ----------------------------------------------------------------------------------------------------
// Keeps the button's width, shows a spinner with a status label and blocks repeat clicks until released.
export function setBusy(button, busy, label = '') {
  if (!button) return;
  if (busy) {
    if (button.dataset.busy === 'true') return;
    button.dataset.busy = 'true';
    button.dataset.label = button.innerHTML;
    button.style.minWidth = button.offsetWidth + 'px';
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.classList.add('is-loading');
    button.innerHTML = `<span class="spinner" aria-hidden="true"></span><span>${label}</span>`;
  } else {
    if (button.dataset.busy !== 'true') return;
    button.dataset.busy = 'false';
    button.innerHTML = button.dataset.label || '';
    button.style.minWidth = '';
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.classList.remove('is-loading');
  }
}

// ---- Bot challenge -----------------------------------------------------------------------------------------------------
// Finds the number whose SHA-256 with the server's signed salt equals the challenge (see security.php). Hashes are
// computed in parallel batches so a typical solve takes about a second without freezing the page.
export async function solveChallenge(c) {
  const enc = new TextEncoder();
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  const batch = 400;
  for (let start = 0; start <= c.maxnumber; start += batch) {
    const nums = Array.from({ length: Math.min(batch, c.maxnumber - start + 1) }, (_, i) => start + i);
    const hashes = await Promise.all(nums.map(n => crypto.subtle.digest('SHA-256', enc.encode(c.salt + n))));
    const hit = hashes.findIndex(h => hex(h) === c.challenge);
    if (hit >= 0) return { salt: c.salt, number: nums[hit], challenge: c.challenge, signature: c.signature };
  }
  throw { code: 'challengeRequired' };
}
