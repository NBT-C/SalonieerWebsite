// Try METON Free (2026-11-07): the business dashboard of the page builder's preview, laid out like the METON app's
// (stat cards, Requests, a Day / Week schedule with every specialist, booking cards with Confirm / Reschedule / Cancel).
// It shows the visitor's own test bookings (and, if they keep them on, a few sample ones) from this browser only, and
// uses the same opening-hours rules as the booking page to offer free times. Nothing here reaches a server.
import { L as BL, ico, ICON, detailRows, timeGroups, bookableDays, dayButton, addDays, weekday, toMin, toHm, longDate, weekdayShort, dayMonth, ymdIn, deviceZone, initials } from './book.js';

const D = {
  dash: { en: 'Business dashboard', ar: 'لوحة العمل', he: 'לוח הבקרה של העסק' },
  statToday: { en: 'Today’s bookings', ar: 'حجوزات اليوم', he: 'תורים היום' },
  statPending: { en: 'Awaiting confirmation', ar: 'بانتظار التأكيد', he: 'ממתינים לאישור' },
  statWeek: { en: 'Next 7 days', ar: 'الأيام السبعة القادمة', he: '7 הימים הקרובים' },
  statCustomers: { en: 'Customers', ar: 'العملاء', he: 'לקוחות' },
  statPendingSub: { en: 'Needs your review', ar: 'تحتاج مراجعتك', he: 'דורש בדיקה שלך' },
  statTodaySub: { en: '{n} confirmed', ar: '{n} مؤكدة', he: '{n} מאושרים' },
  statWeekSub: { en: 'Appointments', ar: 'مواعيد', he: 'תורים' },
  statCustSub: { en: 'Who booked with you', ar: 'من حجزوا عندك', he: 'מי שקבעו אצלך' },
  requests: { en: 'Requests', ar: 'الطلبات', he: 'בקשות' },
  schedule: { en: 'Schedule', ar: 'الجدول', he: 'יומן' },
  day: { en: 'Day', ar: 'يوم', he: 'יום' },
  week: { en: 'Week', ar: 'أسبوع', he: 'שבוע' },
  prev: { en: 'Previous', ar: 'السابق', he: 'הקודם' },
  next: { en: 'Next', ar: 'التالي', he: 'הבא' },
  today: { en: 'Today', ar: 'اليوم', he: 'היום' },
  all: { en: 'All specialists', ar: 'كل المختصين', he: 'כל אנשי המקצוע' },
  noRequests: { en: 'No requests are waiting. Make a test booking on your booking page and it appears here at once.', ar: 'لا توجد طلبات بانتظارك. احجز موعداً تجريبياً من صفحة الحجز وسيظهر هنا فوراً.', he: 'אין בקשות שממתינות. קבעו תור לדוגמה בדף ההזמנה והוא יופיע כאן מיד.' },
  closedDay: { en: 'Closed on this day.', ar: 'مغلق في هذا اليوم.', he: 'סגור ביום הזה.' },
  emptyDay: { en: 'No appointments on this day yet.', ar: 'لا توجد مواعيد في هذا اليوم بعد.', he: 'אין עדיין תורים ביום הזה.' },
  available: { en: 'Available', ar: 'متاح', he: 'פנוי' },
  minutes: { en: 'min', ar: 'دقيقة', he: 'דק׳' },
  confirm: { en: 'Confirm appointment', ar: 'تأكيد الموعد', he: 'אישור התור' },
  decline: { en: 'Decline', ar: 'رفض', he: 'דחייה' },
  reschedule: { en: 'Reschedule', ar: 'تغيير الموعد', he: 'שינוי מועד' },
  cancel: { en: 'Cancel booking', ar: 'إلغاء الحجز', he: 'ביטול התור' },
  close: { en: 'Close', ar: 'إغلاق', he: 'סגירה' },
  pending: { en: 'Pending', ar: 'بانتظار التأكيد', he: 'ממתין' },
  confirmed: { en: 'Confirmed', ar: 'مؤكد', he: 'מאושר' },
  cancelled: { en: 'Cancelled', ar: 'ملغي', he: 'בוטל' },
  test: { en: 'Test booking', ar: 'حجز تجريبي', he: 'הזמנת ניסיון' },
  sample: { en: 'Sample', ar: 'مثال', he: 'דוגמה' },
  newOne: { en: 'New', ar: 'جديد', he: 'חדש' },
  samples: { en: 'Show sample bookings', ar: 'إظهار حجوزات المثال', he: 'הצגת הזמנות לדוגמה' },
  phoneL: { en: 'Phone', ar: 'الهاتف', he: 'טלפון' },
  noteL: { en: 'Note', ar: 'ملاحظة', he: 'הערה' },
  confirmedToast: { en: 'Appointment confirmed. In the real app the customer gets a notification.', ar: 'تم تأكيد الموعد. في التطبيق الحقيقي يصل العميلَ إشعار.', he: 'התור אושר. באפליקציה האמיתית הלקוח מקבל התראה.' },
  declinedToast: { en: 'Request declined.', ar: 'تم رفض الطلب.', he: 'הבקשה נדחתה.' },
  cancelledToast: { en: 'Booking cancelled. The time is free again.', ar: 'تم إلغاء الحجز وأصبح الوقت متاحاً من جديد.', he: 'התור בוטל. הזמן התפנה שוב.' },
  movedToast: { en: 'Moved to {when}. In the real app the customer gets a notification.', ar: 'تم نقل الموعد إلى {when}. في التطبيق الحقيقي يصل العميلَ إشعار.', he: 'התור הועבר ל־{when}. באפליקציה האמיתית הלקוח מקבל התראה.' },
  declineAsk: { en: 'Decline this request? The time becomes free again.', ar: 'رفض هذا الطلب؟ سيصبح الوقت متاحاً من جديد.', he: 'לדחות את הבקשה? הזמן יתפנה שוב.' },
  cancelAsk: { en: 'Cancel this booking? The time becomes free again.', ar: 'إلغاء هذا الحجز؟ سيصبح الوقت متاحاً من جديد.', he: 'לבטל את התור? הזמן יתפנה שוב.' },
  keep: { en: 'Keep it', ar: 'إبقاء', he: 'להשאיר' },
  pickNew: { en: 'Choose the new day and time', ar: 'اختر اليوم والوقت الجديدين', he: 'בחרו יום ושעה חדשים' },
  noFree: { en: 'No free times on this day.', ar: 'لا توجد أوقات متاحة في هذا اليوم.', he: 'אין זמנים פנויים ביום הזה.' },
  back: { en: 'Back', ar: 'رجوع', he: 'חזרה' },
};
const T = (c, k, v = {}) => { let s = (D[k] && (D[k][c.lang] || D[k].en)) || BL(c, k); for (const [a, b] of Object.entries(v)) s = s.split('{' + a + '}').join(b); return s; };
const live = b => b.status !== 'cancelled';
const range = (b) => `<bdi dir="ltr">${b.time}–${toHm(toMin(b.time) + b.dur)}</bdi>`;

// ctx: { page(): the preview business, bookings(): array (mutable), save(), freeTimes(page, bookings, sp, svc, date, opts),
//        samples(): boolean, setSamples(on), weekStart (0–6) }
export function mountBoard(c, host, ctx) {
  const tz = () => ctx.page().timezone || deviceZone();
  const today = () => ymdIn(new Date(), tz());
  const page = () => ctx.page();
  // The schedule opens on the first day the business is open (today, or the next open day).
  const firstOpen = () => { const t = today(); for (let i = 0; i < 14; i++) { const d = addDays(t, i); if (page().specialists.some(p => p.days?.[String(weekday(d))])) return d; } return t; };
  const st = { tab: 'schedule', view: 'day', date: firstOpen(), sp: 'all', fresh: null };
  const spOf = id => page().specialists.find(p => p.id === id);
  const svcOf = id => page().services.find(s => s.id === id);
  const weekOf = d => { const off = (weekday(d) - (ctx.weekStart ?? 0) + 7) % 7; const start = addDays(d, -off); return Array.from({ length: 7 }, (_, i) => addDays(start, i)); };
  const visible = () => ctx.bookings().filter(b => ctx.samples() || b.source !== 'sample').filter(b => spOf(b.sp) && svcOf(b.svc));
  const nowMin = () => { try { const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: tz(), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':').map(Number); return h * 60 + m; } catch { return 0; } };
  const upcoming = b => b.date > today() || (b.date === today() && toMin(b.time) + b.dur > nowMin());
  const pill = b => `<span class="db-pill is-${b.status}"><span aria-hidden="true"></span>${T(c, b.status)}</span>`;
  const tag = b => b.source === 'sample' ? `<span class="db-tag">${T(c, 'sample')}</span>` : `<span class="db-tag is-test">${b.id === st.fresh ? T(c, 'newOne') + ' · ' : ''}${T(c, 'test')}</span>`;
  const actions = b => b.status === 'pending' ? `<div class="db-actions"><button type="button" class="btn small primary" data-act="confirm" data-id="${b.id}">${ico(ICON.check, 15)}${T(c, 'confirm')}</button><button type="button" class="btn small" data-act="move" data-id="${b.id}">${T(c, 'reschedule')}</button><button type="button" class="btn small danger" data-act="decline" data-id="${b.id}">${T(c, 'decline')}</button></div>`
    : b.status === 'confirmed' ? `<div class="db-actions"><button type="button" class="btn small" data-act="move" data-id="${b.id}">${T(c, 'reschedule')}</button><button type="button" class="btn small danger" data-act="cancel" data-id="${b.id}">${T(c, 'cancel')}</button></div>` : '';
  const card = (b, { showDate = false, showSp = true } = {}) => {
    const sp = spOf(b.sp), sv = svcOf(b.svc);
    return `<article class="db-appt is-${b.status}${b.id === st.fresh ? ' is-fresh' : ''}" data-open="${b.id}" style="--sp:${c.esc(sp.color || '#241D28')}">
      <div class="db-appt-top"><b><bdi>${c.esc(b.name)}</bdi></b>${pill(b)}</div>
      <p class="db-appt-line">${c.esc(sv.name)} · ${range(b)} · ${b.dur} ${T(c, 'minutes')}</p>
      <p class="db-appt-meta">${showDate ? `${c.esc(longDate(c, b.date))} · ` : ''}${showSp && page().specialists.length > 1 ? `<span class="db-dot" aria-hidden="true"></span>${c.esc(sp.name)} · ` : ''}${tag(b)}</p>
      ${actions(b)}</article>`;
  };
  function stats() {
    const all = visible().filter(live), t = today(), week = Array.from({ length: 7 }, (_, i) => addDays(t, i));
    const todays = all.filter(b => b.date === t), pend = all.filter(b => b.status === 'pending' && upcoming(b));
    const cust = new Set(all.map(b => b.name.trim().toLowerCase())).size;
    const card = (k, n, sub, icon, tone) => `<div class="db-stat is-${tone}"><span class="db-stat-ico">${ico(icon, 18)}</span><small>${T(c, k)}</small><b>${n}</b><em>${sub}</em></div>`;
    return `<div class="db-stats">${card('statToday', todays.length, T(c, 'statTodaySub', { n: String(todays.filter(b => b.status === 'confirmed').length) }), ICON.cal, 'ink')}${card('statPending', pend.length, T(c, 'statPendingSub'), ICON.clock, 'amber')}${card('statWeek', all.filter(b => week.includes(b.date)).length, T(c, 'statWeekSub'), ICON.case, 'blue')}${card('statCustomers', cust, T(c, 'statCustSub'), ICON.user, 'green')}</div>`;
  }
  function requests() {
    const list = visible().filter(b => b.status === 'pending' && upcoming(b)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    return list.length ? `<div class="db-list">${list.map(b => card(b, { showDate: true })).join('')}</div>` : `<p class="db-empty">${T(c, 'noRequests')}</p>`;
  }
  function chips() {
    const team = page().specialists;
    if (team.length < 2) return '';
    return `<div class="db-chips" role="group">${[{ id: 'all', name: T(c, 'all') }, ...team].map(p => `<button type="button" class="db-chip${st.sp === p.id ? ' is-on' : ''}" data-sp="${c.esc(p.id)}" aria-pressed="${st.sp === p.id}">${p.id === 'all' ? ico(ICON.user, 15) : `<span class="db-dot" style="--sp:${c.esc(p.color || '#241D28')}" aria-hidden="true"></span>`}${c.esc(p.name)}</button>`).join('')}</div>`;
  }
  // One day: every appointment in order, with the free time between them (like the app's specialist day).
  function dayView() {
    const d = st.date, team = page().specialists.filter(p => st.sp === 'all' || p.id === st.sp);
    const open = team.filter(p => p.days?.[String(weekday(d))]);
    if (!open.length) return `<p class="db-empty">${T(c, 'closedDay')}</p>`;
    const items = visible().filter(b => b.date === d && (st.sp === 'all' || b.sp === st.sp)).sort((a, b) => a.time.localeCompare(b.time) || a.sp.localeCompare(b.sp));
    const rows = [];
    if (team.length === 1 || st.sp !== 'all') {
      const p = open[0], h = p.hours || page().hours; let cur = toMin(h.from); const end = toMin(h.to);
      for (const b of items) {
        if (live(b) && toMin(b.time) - cur >= 30) rows.push(gap(cur, toMin(b.time)));
        rows.push(`<div class="db-row"><time dir="ltr"><b>${b.time}</b><small>${toHm(toMin(b.time) + b.dur)}</small></time>${card(b, { showSp: false })}</div>`);
        if (live(b)) cur = Math.max(cur, toMin(b.time) + b.dur);
      }
      if (end - cur >= 30) rows.push(gap(cur, end));
    } else {
      for (const b of items) rows.push(`<div class="db-row"><time dir="ltr"><b>${b.time}</b><small>${toHm(toMin(b.time) + b.dur)}</small></time>${card(b)}</div>`);
      if (!items.length) rows.push(`<p class="db-empty">${T(c, 'emptyDay')}</p>`);
    }
    return `<div class="db-day">${rows.join('')}</div>`;
  }
  const gap = (a, b) => `<div class="db-row is-gap"><time dir="ltr"><b>${toHm(a)}</b></time><div class="db-free">${ico('<path d="M12 5v14M5 12h14"/>', 15)}<b>${T(c, 'available')}</b><bdi dir="ltr">${toHm(a)} – ${toHm(b)}</bdi><small>${b - a} ${T(c, 'minutes')}</small></div></div>`;
  function weekView() {
    const days = weekOf(st.date), t = today();
    const all = visible().filter(b => st.sp === 'all' || b.sp === st.sp);
    return `<div class="db-week" role="grid">${days.map(d => {
      const list = all.filter(b => b.date === d).sort((a, b) => a.time.localeCompare(b.time));
      const closed = !page().specialists.some(p => (st.sp === 'all' || p.id === st.sp) && p.days?.[String(weekday(d))]);
      return `<div class="db-wcol${d === t ? ' is-today' : ''}${closed ? ' is-closed' : ''}" role="gridcell"><button type="button" class="db-whead" data-goday="${d}"><span>${c.esc(weekdayShort(c, d))}</span><b>${c.esc(dayMonth(c, d))}</b></button>
        <div class="db-wlist">${list.map(b => `<button type="button" class="db-wappt is-${b.status}" data-open="${b.id}" style="--sp:${c.esc(spOf(b.sp).color || '#241D28')}"><b dir="ltr">${b.time}</b><span><bdi>${c.esc(b.name)}</bdi></span><small>${c.esc(svcOf(b.svc).name)}</small></button>`).join('') || (closed ? `<span class="db-wclosed">—</span>` : '')}</div></div>`;
    }).join('')}</div>`;
  }
  function title() {
    if (st.view === 'week') { const w = weekOf(st.date); return `${c.esc(dayMonth(c, w[0]))} – ${c.esc(dayMonth(c, w[6]))}`; }
    return `${st.date === today() ? T(c, 'today') + ' · ' : ''}${c.esc(longDate(c, st.date))}`;
  }
  function paint() {
    const p = page(), pend = visible().filter(b => b.status === 'pending' && upcoming(b)).length;
    host.innerHTML = `<div class="db">
      <header class="db-top">${p.logo_url ? `<img class="db-logo" src="${c.esc(p.logo_url)}" alt="">` : `<span class="db-logo" aria-hidden="true">${c.esc(initials(p.name))}</span>`}<div><b>${c.esc(p.name)}</b><small>${T(c, 'dash')}</small></div></header>
      ${stats()}
      <div class="db-tabs" role="tablist"><button type="button" role="tab" class="db-tab${st.tab === 'requests' ? ' is-on' : ''}" data-tab="requests" aria-selected="${st.tab === 'requests'}">${ico('<path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15z"/><path d="M10 21h4"/>', 16)}${T(c, 'requests')}${pend ? ` <span class="db-count">${pend}</span>` : ''}</button><button type="button" role="tab" class="db-tab${st.tab === 'schedule' ? ' is-on' : ''}" data-tab="schedule" aria-selected="${st.tab === 'schedule'}">${ico(ICON.cal, 16)}${T(c, 'schedule')}</button></div>
      ${st.tab === 'requests' ? requests() : `<div class="db-tools"><div class="db-seg" role="group"><button type="button" class="${st.view === 'day' ? 'is-on' : ''}" data-view="day" aria-pressed="${st.view === 'day'}">${T(c, 'day')}</button><button type="button" class="${st.view === 'week' ? 'is-on' : ''}" data-view="week" aria-pressed="${st.view === 'week'}">${T(c, 'week')}</button></div>
        <div class="db-nav"><button type="button" class="db-arrow" data-move="-1" aria-label="${T(c, 'prev')}">${ico('<path d="M15 5.5 8.5 12l6.5 6.5"/>', 18)}</button><span class="db-when">${title()}</span><button type="button" class="db-arrow" data-move="1" aria-label="${T(c, 'next')}">${ico('<path d="m9 5.5 6.5 6.5L9 18.5"/>', 18)}</button>${st.date !== today() ? `<button type="button" class="db-today" data-move="0">${T(c, 'today')}</button>` : ''}</div></div>
        ${chips()}${st.view === 'day' ? dayView() : weekView()}`}
      <label class="db-samples"><input type="checkbox" id="db-samples"${ctx.samples() ? ' checked' : ''}> ${T(c, 'samples')}</label></div>`;
    wire();
  }
  function wire() {
    host.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { st.tab = b.dataset.tab; paint(); }));
    host.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => { st.view = b.dataset.view; paint(); }));
    host.querySelectorAll('[data-move]').forEach(b => b.addEventListener('click', () => { const n = Number(b.dataset.move); st.date = n === 0 ? today() : addDays(st.date, n * (st.view === 'week' ? 7 : 1)); paint(); }));
    host.querySelectorAll('[data-sp]').forEach(b => b.addEventListener('click', () => { st.sp = b.dataset.sp; paint(); }));
    host.querySelectorAll('[data-goday]').forEach(b => b.addEventListener('click', () => { st.date = b.dataset.goday; st.view = 'day'; paint(); }));
    host.querySelector('#db-samples')?.addEventListener('change', e => { ctx.setSamples(e.target.checked); paint(); });
    host.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); act(b.dataset.act, b.dataset.id); }));
    host.querySelectorAll('[data-open]').forEach(el => el.addEventListener('click', e => { if (e.target.closest('[data-act]')) return; sheet(el.dataset.open); }));
  }
  const find = id => ctx.bookings().find(b => b.id === id);
  async function act(what, id, after) {
    const b = find(id); if (!b) return;
    if (what === 'confirm') { b.status = 'confirmed'; ctx.save(); c.toast(T(c, 'confirmedToast'), 'success'); }
    if (what === 'decline' || what === 'cancel') {
      if (!(await c.confirmDialog({ title: T(c, what === 'decline' ? 'decline' : 'cancel'), body: T(c, what === 'decline' ? 'declineAsk' : 'cancelAsk'), confirm: T(c, what === 'decline' ? 'decline' : 'cancel'), cancel: T(c, 'keep'), tone: 'danger' }))) return;
      b.status = 'cancelled'; ctx.save(); c.toast(T(c, what === 'decline' ? 'declinedToast' : 'cancelledToast'), 'success');
    }
    if (what === 'move') { closeSheet(); return moveSheet(id); }
    after?.(); paint(); ctx.onChange?.();
  }
  let open = null;
  function closeSheet() { if (!open) return; const w = open; open = null; w.classList.remove('is-open'); document.body.classList.remove('modal-open'); setTimeout(() => w.remove(), 200); }
  function shell(inner, labelId) {
    closeSheet();
    const w = document.createElement('div'); w.className = 'modal-root db-sheet-root';
    w.innerHTML = `<div class="modal-backdrop" data-close></div><div class="modal db-sheet" role="dialog" aria-modal="true" aria-labelledby="${labelId}">${inner}</div>`;
    document.body.appendChild(w); document.body.classList.add('modal-open'); requestAnimationFrame(() => w.classList.add('is-open'));
    w.addEventListener('click', e => { if (e.target.closest('[data-close]')) closeSheet(); });
    w.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
    open = w; setTimeout(() => w.querySelector('button')?.focus(), 30);
    return w;
  }
  function sheet(id) {
    const b = find(id); if (!b) return;
    const sp = spOf(b.sp), sv = svcOf(b.svc);
    const w = shell(`<h2 id="db-sheet-title"><bdi>${c.esc(b.name)}</bdi></h2>${pill(b)} ${tag(b)}
      ${detailRows(c, { specialist: sp.name, service: sv.name, date: b.date, time: b.time })}
      <dl class="book-dl db-more"><div><dt>${ico(ICON.phone, 17)}${T(c, 'phoneL')}</dt><dd><bdi dir="ltr">${c.esc(b.phone || '—')}</bdi></dd></div>${b.note ? `<div><dt>${ico('<path d="M5 4.5h14v15H5z"/><path d="M8.5 9h7M8.5 12.5h7M8.5 16h4"/>', 17)}${T(c, 'noteL')}</dt><dd>${c.esc(b.note)}</dd></div>` : ''}</dl>
      ${actions(b)}<div class="modal-actions"><button type="button" class="btn ghost" data-close>${T(c, 'close')}</button></div>`, 'db-sheet-title');
    w.querySelectorAll('[data-act]').forEach(x => x.addEventListener('click', () => act(x.dataset.act, x.dataset.id, closeSheet)));
  }
  function moveSheet(id) {
    const b = find(id); if (!b) return;
    const sp = spOf(b.sp), t = today();
    const days = bookableDays(page(), sp, t);
    let date = days.includes(b.date) ? b.date : days[0];
    const w = shell(`<h2 id="db-move-title">${T(c, 'reschedule')}</h2><p class="book-muted"><bdi>${c.esc(b.name)}</bdi> · ${c.esc(svcOf(b.svc).name)} · ${c.esc(longDate(c, b.date))} <bdi dir="ltr">${b.time}</bdi></p>
      <h3 class="db-move-h">${T(c, 'pickNew')}</h3><div class="book-days" id="db-move-days">${days.map(d => dayButton(c, d, t, d === date, 'data-mday', 'book-day')).join('')}</div><div id="db-move-times" class="book-times"></div>
      <div class="modal-actions"><button type="button" class="btn ghost" data-close>${T(c, 'back')}</button></div>`, 'db-move-title');
    const times = () => {
      const host = w.querySelector('#db-move-times');
      const list = ctx.freeTimes(page(), ctx.bookings(), b.sp, b.svc, date, { exclude: b.id });
      host.innerHTML = list.length ? timeGroups(c, list, 'data-mtime', 'book-time') : `<p class="book-empty">${T(c, 'noFree')}</p>`;
      host.querySelectorAll('[data-mtime]').forEach(x => x.addEventListener('click', () => {
        b.date = date; b.time = x.dataset.mtime; ctx.save(); closeSheet();
        st.date = date; st.tab = 'schedule'; st.view = 'day'; st.fresh = b.id; paint(); ctx.onChange?.();
        c.toast(T(c, 'movedToast', { when: `${longDate(c, date)} ${b.time}` }), 'success');
      }));
    };
    w.querySelectorAll('[data-mday]').forEach(x => x.addEventListener('click', () => { date = x.dataset.mday; w.querySelectorAll('[data-mday]').forEach(y => { y.classList.toggle('is-on', y === x); y.setAttribute('aria-pressed', String(y === x)); }); times(); }));
    times();
  }
  paint();
  return {
    refresh: paint,
    // A test booking just made on the booking page: show it where it landed.
    show(id) { const b = find(id); if (!b) return paint(); st.fresh = id; st.date = b.date; st.tab = b.status === 'pending' ? 'requests' : 'schedule'; paint(); },
  };
}
