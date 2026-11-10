// Accounts (2.40.1 / 2.40.2, platform owners): passwords are changed only by Salonieer — no salon can reset or set
// anyone's password. A person who forgot theirs contacts Salonieer support; find them by country + phone:
//   * their Salonieer account (new app): its salons and devices, and a one-time temporary password
//   * their sign-ups inside salons (older apps: salon code + phone + that salon's password): a one-time temporary
//     password for that salon sign-up
// Check who is asking first (the number is not verified); every reset signs the devices out and records the reason.
import { T, esc, rpc, view, setTitle, empty, pill, act, confirm, fmtDate, fmtTime, num, isOwner, site, toast } from './panel.js';
import { loadPhone, toE164, countryOptions } from './phone-input.js';

const field = (label, input, cls = '') => `<label class="ap-field ${cls}"><span>${esc(label)}</span>${input}</label>`;
const roleLabel = s => s.owned ? T('accessRoleOwner') : T('rowRole_' + (s.role || 'user'));
const helpList = list => list.length ? `<h4>${esc(T('accountHelp'))}</h4><ol class="ap-feed">${list.map(x => `<li><span>${esc(T('helpReset', { by: x.by || 'METON', reason: x.reason }))}</span><time>${esc(fmtTime(x.at))}</time></li>`).join('')}</ol>` : '';
const resetForm = (attr, lead) => `<form class="ap-form-grid" ${attr} novalidate><h4 class="is-full">${esc(T('resetTitle'))}</h4><p class="ap-quiet is-full">${esc(lead)}</p>
  ${field(T('resetReason'), `<textarea name="reason" rows="2" maxlength="300" required></textarea><small>${esc(T('resetReasonHint'))}</small>`, 'is-full')}
  <div class="ap-actions is-full"><button class="ap-btn is-danger" type="submit">${esc(T('resetTitle'))}</button><p class="ap-error" role="alert"></p></div></form>`;

export async function accountsView() {
  setTitle(T('navAccounts'));
  if (!isOwner()) { view().innerHTML = empty(T('errOwnerOnly')); return; }
  await loadPhone().catch(() => null);
  view().innerHTML = `<section class="ap-panel"><h3>${esc(T('accountsTitle'))}</h3><p class="ap-quiet">${esc(T('accountsLead'))}</p>
      <form id="ap-acc-find" class="ap-form-grid" novalidate>
        ${field(T('dialCode'), `<select name="country">${countryOptions('PS', site().lang)}</select>`)}
        ${field(T('phoneOrEmail'), `<input name="phone" dir="ltr" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" required maxlength="254" placeholder="0599123456 · name@example.com">`)}
        <div class="ap-actions is-full"><button class="ap-btn is-primary" type="submit">${esc(T('findAccount'))}</button><p class="ap-error" role="alert"></p></div></form></section>
    <div id="ap-acc-result" class="ap-stack"></div>`;
  const form = document.getElementById('ap-acc-find'), out = document.getElementById('ap-acc-result');
  let last = null, shown = null;   // shown: the temporary password just set ({ password, name, salon? }), displayed once
  const draw = r => {
    const once = shown ? `<section class="ap-panel is-success" id="ap-acc-once"><h3>${esc(shown.salon ? T('resetDoneSalon', { name: shown.name, salon: shown.salon }) : T('resetDone', { name: shown.name }))}</h3>
        <p><code class="ap-secret" dir="ltr">${esc(shown.password)}</code> <button class="ap-btn is-quiet" type="button" id="ap-acc-copy">${esc(T('copy'))}</button></p>
        <p class="ap-quiet">${esc(T('resetOnce'))}</p><p class="ap-quiet">${esc(T(shown.salon ? 'resetLeadSalon' : 'resetLead'))}</p></section>` : '';
    const signups = r.salon_signups || [];
    if (!r.accounts.length && !signups.length) { out.innerHTML = once + empty(T('accountNoneAll', { phone: r.phone })); return wireCopy(); }
    out.innerHTML = once + r.accounts.map(a => `<section class="ap-panel" data-account="${esc(a.id)}">
        <h3>${esc(a.name)} <small><bdi dir="ltr">${esc([a.phone, a.email].filter(Boolean).join(' · '))}</bdi></small></h3>
        <div class="ap-pills">${pill('info', T('salonieerAccount'))}${a.status !== 'active' ? pill('danger', T('accountDisabled')) : ''}${a.locked ? pill('warn', T('accountLocked')) : ''}</div>
        <dl class="ap-facts"><div><dt>${esc(T('accCreatedOn'))}</dt><dd>${esc(fmtDate(a.created_at))}</dd></div>
          <div><dt>${esc(T('accountLastActive'))}</dt><dd>${a.last_active ? esc(fmtTime(a.last_active)) : '—'}</dd></div>
          <div><dt>${esc(T('accountDevices'))}</dt><dd>${esc(num(a.devices))}</dd></div>
          <div><dt>${esc(T('accountPasswordChanged'))}</dt><dd>${esc(fmtTime(a.password_changed_at))}</dd></div></dl>
        <h4>${esc(T('accountSalons'))}</h4>${a.salons.length ? `<ul class="ap-rows">${a.salons.map(s => `<li><span><b>${esc(s.name)}</b><small dir="ltr">${esc(s.slug)}</small></span>${pill(s.owned ? 'ok' : 'muted', roleLabel(s))}</li>`).join('')}</ul>` : `<p class="ap-quiet">${esc(T('accountNoSalons'))}</p>`}
        ${helpList(a.help)}
        ${a.status === 'active' ? resetForm(`data-reset="${esc(a.id)}"`, T('resetLead')) : ''}
      </section>`).join('')
      + (signups.length ? `<section class="ap-panel"><h3>${esc(T('signupsTitle'))}</h3><p class="ap-quiet">${esc(T('signupsLead'))}</p></section>` + signups.map(s => `<section class="ap-panel" data-signup="${esc(s.slug)}|${esc(s.user_id)}">
        <h3>${esc(s.name || T('noName'))} <small>${esc(s.salon)}</small></h3>
        <div class="ap-pills">${pill('muted', T('rowRole_' + (s.role || 'user')))}${s.disabled ? pill('danger', T('accountDisabled')) : ''}${s.has_password ? '' : pill('warn', T('signupNoPassword'))}</div>
        <dl class="ap-facts"><div><dt>${esc(T('signupBookings'))}</dt><dd>${esc(num(s.bookings))}</dd></div></dl>
        ${helpList(s.help)}
        ${s.disabled ? '' : resetForm(`data-salon-reset="${esc(s.slug)}|${esc(s.user_id)}"`, T('resetLeadSalon'))}
      </section>`).join('') : '');
    const after = async () => {
      const again = await rpc('platform_account_find', { p_phone: last }).catch(() => null);
      draw(again && !again.error ? again : r);
      document.getElementById('ap-acc-once')?.scrollIntoView({ block: 'center' });
    };
    const reason = f => { const v = f.elements.reason.value.trim(); if (v.length < 3) { f.querySelector('.ap-error').textContent = T('errResetReason'); f.elements.reason.focus(); return null; } return v; };
    out.querySelectorAll('[data-reset]').forEach(f => f.addEventListener('submit', async e => {
      e.preventDefault();
      const a = r.accounts.find(x => x.id === f.dataset.reset), why = reason(f); if (!why) return;
      if (!(await confirm(T('resetTitle'), T('resetConfirmAccount', { name: a.name, phone: a.phone }), { danger: true, confirmLabel: T('resetTitle') }))) return;
      const res = await act(f.querySelector('[type=submit]'), () => rpc('platform_account_reset_password', { p_account: a.id, p_reason: why })).catch(() => null);
      if (!res?.password) return;
      shown = { password: res.password, name: a.name }; await after();
    }));
    out.querySelectorAll('[data-salon-reset]').forEach(f => f.addEventListener('submit', async e => {
      e.preventDefault();
      const [slug, user] = f.dataset.salonReset.split('|'), s = signups.find(x => x.slug === slug && x.user_id === user), why = reason(f); if (!why) return;
      if (!(await confirm(T('resetTitle'), T('resetConfirmSalon', { name: s.name || T('noName'), salon: s.salon, phone: r.phone }), { danger: true, confirmLabel: T('resetTitle') }))) return;
      const res = await act(f.querySelector('[type=submit]'), () => rpc('platform_salon_password_reset', { p_slug: slug, p_user: user, p_reason: why })).catch(() => null);
      if (!res?.password) return;
      shown = { password: res.password, name: s.name || T('noName'), salon: s.salon }; await after();
    }));
    wireCopy();
  };
  const wireCopy = () => document.getElementById('ap-acc-copy')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(shown.password); toast(T('copied')); } catch {}
  });
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const box = form.querySelector('.ap-error'); box.textContent = '';
    // 2.47: an account may have only an email — find by email too (platform_account_find takes either).
    const raw = form.elements.phone.value.trim();
    const n = raw.includes('@') ? (/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(raw) ? { e164: raw.toLowerCase() } : null) : toE164(raw, form.elements.country.value);
    if (!n) { box.textContent = T(raw.includes('@') ? 'invalidEmail' : 'invalidPhoneIntl'); form.elements.phone.focus(); return; }
    shown = null; last = n.e164;
    const r = await act(form.querySelector('[type=submit]'), () => rpc('platform_account_find', { p_phone: n.e164 })).catch(() => null);
    if (r && !r.error) draw(r); else if (r?.error) box.textContent = T('invalidPhoneIntl');
  });
}
