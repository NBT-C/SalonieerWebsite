// Admin operations: application review checks (badges and reasons), problem reports from subscribed salon owners,
// and the automatic deletion of salons that stayed suspended (settings + the salons it would affect).
import { T, esc, view, setTitle, loading, empty, pill, act, confirm, fmtTime, fmtDate, num, isOwner, site, params } from './panel.js';

// ---- Application review --------------------------------------------------------------------------------------------
// "Invalid" = information that can't be right (e.g. an ID number failing its check digit); "Review" = plausible but
// a person should look (a phone number used by another account, a number that looks made up, …).
export function reviewBadge(a) {
  const r = a.review;
  if (!r || r.level === 'clear') return '';
  const n = r.flags.length;
  return r.level === 'invalid' ? pill('danger', T('reviewInvalid', { n: num(n) })) : pill('warn', T('reviewNeeded', { n: num(n) }));
}
export function reviewPanel(a) {
  const r = a.review;
  if (!r) return '';
  if (r.level === 'clear') return `<section class="ap-panel ap-review is-clear"><h3>${esc(T('reviewTitle'))}</h3><p class="ap-quiet">${esc(T('reviewClear'))}</p></section>`;
  const order = { invalid: 0, review: 1 };
  const flags = [...r.flags].sort((x, y) => order[x.level] - order[y.level]);
  return `<section class="ap-panel ap-review is-${r.level}"><h3>${esc(T('reviewTitle'))}</h3><p class="ap-quiet">${esc(T(r.level === 'invalid' ? 'reviewLeadInvalid' : 'reviewLeadReview'))}</p>
    <ul class="ap-flags" data-paginate="review-${esc(a.id)}">${flags.map(f => `<li class="is-${f.level}">${pill(f.level === 'invalid' ? 'danger' : 'warn', T(f.level === 'invalid' ? 'flagInvalid' : 'flagReview'))}<span>${esc(T('flag_' + f.code, f.vars || {}))}</span></li>`).join('')}</ul></section>`;
}

// ---- Problem reports -----------------------------------------------------------------------------------------------
const CATS = ['bug', 'booking', 'billing', 'account', 'other'];
export async function reportsView() {
  setTitle(T('navReports'));
  view().innerHTML = loading();
  const filter = ['open', 'resolved', 'all'].includes(params().get('status')) ? params().get('status') : 'open';
  const reports = (await site().api('/api/admin/problem-reports' + (filter === 'all' ? '' : '?status=' + filter))).reports || [];
  view().innerHTML = `<p class="ap-quiet ap-lead">${esc(T('reportsLead'))}</p>
    <div class="ap-toolbar"><div class="ap-chips" role="group" aria-label="${esc(T('filter'))}">${['open', 'resolved', 'all'].map(f => `<a class="ap-chip" href="/admin/reports?status=${f}" aria-pressed="${f === filter}">${esc(T(f === 'open' ? 'reportsOpen' : f === 'resolved' ? 'reportsResolved' : 'all'))}</a>`).join('')}</div></div>
    ${reports.length ? `<div class="ap-stack" data-paginate="reports-${filter}">${reports.map(reportCard).join('')}</div>` : empty(T('noReports'), T('noReportsText'))}`;
  view().querySelectorAll('form[data-report]').forEach(form => form.addEventListener('submit', async e => {
    e.preventDefault();
    const status = e.submitter?.dataset.status || 'resolved';
    await act(e.submitter, () => site().api('/api/admin/problem-reports/' + form.dataset.report, { method: 'PATCH', body: JSON.stringify({ status, note: form.elements.note.value.trim() }) }),
      T(status === 'resolved' ? 'reportResolved' : 'reportReopened')).then(reportsView).catch(() => {});
  }));
}
function reportCard(r) {
  const cat = CATS.includes(r.category) ? site().t('reportCat_' + r.category) : r.category;
  return `<article class="ap-panel ap-report"><header class="ap-report-head"><div><h3>${esc(r.salonName || r.salonSlug)}</h3>
      <p class="ap-quiet"><span dir="ltr">${esc(r.salonSlug)}</span> · ${esc(T(r.source === 'app' ? 'fromApp' : 'fromWebsite'))} · <time>${esc(fmtTime(r.createdAt))}</time></p></div>
      <div class="ap-pills">${pill('info', cat)}${pill(r.status === 'open' ? 'warn' : 'ok', T(r.status === 'open' ? 'reportsOpen' : 'reportsResolved'))}</div></header>
    <p class="ap-report-body">${esc(r.message)}</p>
    <dl class="ap-facts"><div><dt>${esc(T('reportedBy'))}</dt><dd>${esc(r.reporterName || '—')}</dd></div><div><dt>${esc(T('contact'))}</dt><dd dir="ltr">${r.reporterContact.includes('@') ? `<a href="mailto:${esc(r.reporterContact)}">${esc(r.reporterContact)}</a>` : esc(r.reporterContact || '—')}</dd></div>
      ${r.applicationId ? `<div><dt>${esc(T('application'))}</dt><dd><a href="/admin/applications/${esc(r.applicationId)}" dir="ltr">${esc(r.applicationId)}</a></dd></div>` : ''}
      ${r.resolvedAt ? `<div><dt>${esc(T('resolvedOn'))}</dt><dd>${esc(fmtTime(r.resolvedAt))}${r.resolvedBy ? ` · <span dir="ltr">${esc(r.resolvedBy)}</span>` : ''}</dd></div>` : ''}</dl>
    <form class="ap-compose" data-report="${esc(r.id)}"><label class="ap-field"><span>${esc(T('internalNote'))}</span><textarea name="note" rows="2" maxlength="1000">${esc(r.adminNote || '')}</textarea></label>
      <div class="ap-actions">${r.status === 'open' ? `<button class="ap-btn is-primary" type="submit" data-status="resolved">${esc(T('markResolved'))}</button>` : `<button class="ap-btn" type="submit" data-status="open">${esc(T('reopen'))}</button>`}<p class="ap-error" role="alert"></p></div></form></article>`;
}

// ---- Suspended-salon cleanup (owner) ------------------------------------------------------------------------------------
export async function cleanupView() {
  setTitle(T('navCleanup'));
  if (!isOwner()) { view().innerHTML = empty(T('errOwnerOnly')); return; }
  view().innerHTML = loading();
  draw(await site().api('/api/admin/cleanup'));
}
function draw(d) {
  const s = d.settings, list = d.suspended || [];
  const eligible = list.filter(x => x.eligible && !x.protected).length;
  view().innerHTML = `<div class="ap-columns"><section class="ap-panel"><h3>${esc(T('cleanupTitle'))}</h3><p class="ap-quiet">${esc(T('cleanupLead'))}</p>
      <form id="ap-cleanup" class="ap-form-grid" novalidate>
        <label class="ap-toggle is-full"><input type="checkbox" name="enabled" ${s.enabled ? 'checked' : ''}><span>${esc(T('cleanupEnabled'))}</span></label>
        <label class="ap-field"><span>${esc(T('cleanupMonths'))}</span><input type="number" name="months" min="1" max="24" step="1" required value="${esc(s.months)}" inputmode="numeric"><small>${esc(T('cleanupMonthsHint'))}</small></label>
        <div class="ap-actions is-full"><button class="ap-btn is-primary" type="submit">${esc(T('saveChanges'))}</button><button class="ap-btn is-quiet" type="button" id="ap-cleanup-run"${s.enabled ? '' : ' disabled'}>${esc(T('cleanupRunNow'))}</button><p class="ap-error" role="alert"></p></div>
      </form>
      ${s.updatedAt ? `<p class="ap-quiet ap-meta">${esc(T('cleanupUpdated', { time: fmtTime(s.updatedAt), by: s.updatedBy || '' }))}</p>` : ''}</section>
    <section class="ap-panel"><h3>${esc(T('cleanupStatus'))}</h3>
      <dl class="ap-strip"><div><dt>${esc(T('salonsPaused'))}</dt><dd>${num(list.length)}</dd></div><div><dt>${esc(T('cleanupEligible'))}</dt><dd>${num(eligible)}</dd></div></dl>
      <p class="ap-quiet">${esc(s.enabled ? T('cleanupOnNote', { n: num(s.months) }) : T('cleanupOffNote'))}</p>
      ${d.lastRun ? `<p class="ap-quiet">${esc(T('cleanupLastRun', { time: fmtTime(d.lastRun.at), n: num(d.lastRun.deleted.length) }))}${d.lastRun.failed?.length ? ' ' + esc(T('cleanupFailed', { n: num(d.lastRun.failed.length) })) : ''}</p>` : ''}</section></div>
    <section class="ap-panel"><h3>${esc(T('suspendedSalons'))}</h3>
      ${list.length ? `<div class="ap-table-wrap"><table class="ap-table"><thead><tr><th>${esc(T('salon'))}</th><th>${esc(T('suspendedSince'))}</th><th>${esc(T('deleteAfter'))}</th><th>${esc(T('status'))}</th></tr></thead>
        <tbody data-paginate="suspended-salons">${list.map(x => `<tr><td data-label="${esc(T('salon'))}"><a href="/admin/salons/${esc(x.slug)}"><b>${esc(x.name)}</b></a><small dir="ltr">${esc(x.slug)}${x.ownerEmail ? ' · ' + esc(x.ownerEmail) : ''}</small></td>
          <td data-label="${esc(T('suspendedSince'))}">${esc(fmtDate(x.suspendedAt))}${x.pauseReason ? `<small>${esc(T('pauseReason_' + x.pauseReason))}</small>` : ''}</td>
          <td data-label="${esc(T('deleteAfter'))}">${x.protected ? '—' : esc(fmtDate(x.deleteAfter))}</td>
          <td data-label="${esc(T('status'))}">${x.protected ? pill('muted', T('cleanupProtected')) : x.eligible ? pill(s.enabled ? 'danger' : 'warn', T(s.enabled ? 'cleanupDue' : 'cleanupWouldDelete')) : pill('info', T('cleanupWaiting'))}</td></tr>`).join('')}</tbody></table></div>`
        : `<p class="ap-quiet">${esc(T('noSuspended'))}</p>`}</section>`;
  const form = document.getElementById('ap-cleanup');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const months = Number(form.elements.months.value), enabled = form.elements.enabled.checked;
    if (!Number.isInteger(months) || months < 1 || months > 24) { form.querySelector('.ap-error').textContent = T('cleanupMonthsHint'); return; }
    if (enabled && !s.enabled && !(await confirm(T('cleanupEnableTitle'), T('cleanupEnableBody', { n: num(months) }), { danger: true, confirmLabel: T('cleanupEnableConfirm') }))) return;
    await act(form.querySelector('[type=submit]'), () => site().api('/api/admin/cleanup', { method: 'PUT', body: JSON.stringify({ enabled, months }) }), T('saved')).then(draw).catch(() => {});
  });
  document.getElementById('ap-cleanup-run').addEventListener('click', async e => {
    if (!(await confirm(T('cleanupRunNow'), T('cleanupRunBody', { n: num(eligible) }), { danger: true, confirmLabel: T('cleanupRunNow') }))) return;
    await act(e.currentTarget, () => site().post('/api/admin/cleanup/run', {})).then(r => { draw(r); }).catch(() => {});
  });
}
