// Demo salons for the website's product screenshots: one made-up salon per site language, with its names,
// services and customers written in that language, so a screenshot never mixes languages. Every salon has the
// same shape (same team size, same day, same history) from one seeded random sequence, so the Arabic, English
// and Hebrew pictures show the same story. Nothing here is a real person or a real salon.
import { P } from '../../../Salonieer-KMP/tools/e2e_harness.mjs';

export const PASSWORD = 'Showcase-2026';

export const DATA = {
  ar: {
    slug: 'lamsa', code: 'LAMSA-1', name: 'صالون لمسة', tz: 'Asia/Hebron', iso: 'PS', cc: '970', prefix: '0599',
    owner: 'ليلى منصور',
    services: [['قص وسشوار', 45, 80], ['صبغة شعر', 90, 220], ['هايلايت', 120, 300], ['مكياج سهرة', 60, 180],
      ['مانيكير', 30, 60], ['باديكير', 45, 80], ['تشكيل حواجب', 20, 40], ['تنظيف بشرة', 60, 150]],
    team: [['رنا', 'شعر وصبغات', [0, 1, 2]], ['سلمى', 'مكياج وحواجب', [3, 6]], ['دانة', 'أظافر وعناية', [4, 5]], ['لين', 'بشرة وحواجب', [7, 6]]],
    booker: 'سما حداد',
    customers: ['ريم خليل', 'هبة ناصر', 'نور عودة', 'لينا جابر', 'ميس داود', 'رهف سالم', 'جنى عيسى', 'تالا زيد', 'يارا شاهين', 'سلام حمدان',
      'دينا قاسم', 'روان يوسف', 'ليان عمر', 'مرام سعيد', 'آية حسن', 'نادين خوري', 'شهد بكر', 'ريتال منصور', 'غدير عواد', 'سارة عبد الله',
      'ملك الأحمد', 'بيان زكي', 'هالة سمعان', 'رنيم صالح', 'جود عيّاد', 'لمى حمّاد', 'تسنيم نعيم', 'إسراء قطيط', 'وعد مرعي', 'دانا الخطيب'],
  },
  en: {
    slug: 'velvet', code: 'VELVET-1', name: 'Velvet Beauty Studio', tz: 'Asia/Hebron', iso: 'PS', cc: '970', prefix: '0598',
    owner: 'Nadia Hart',
    services: [['Cut & blow-dry', 45, 80], ['Hair color', 90, 220], ['Highlights', 120, 300], ['Evening makeup', 60, 180],
      ['Manicure', 30, 60], ['Pedicure', 45, 80], ['Brow shaping', 20, 40], ['Facial', 60, 150]],
    team: [['Mia', 'Hair & color', [0, 1, 2]], ['Sofia', 'Makeup & brows', [3, 6]], ['Lena', 'Nails & care', [4, 5]], ['Ava', 'Skin & brows', [7, 6]]],
    booker: 'Emma Brooks',
    customers: ['Olivia Hayes', 'Chloe Bennett', 'Grace Turner', 'Ella Morgan', 'Zoe Parker', 'Lily Foster', 'Hannah Reed', 'Nora Collins', 'Ruby Ward', 'Sophie Hughes',
      'Amelia Price', 'Isla Cooper', 'Mila Russell', 'Leah Barnes', 'Ivy Sanders', 'Maya Bell', 'Clara Jenkins', 'Alice Ross', 'Sara Kim', 'Julia Webb',
      'Rose Palmer', 'Lucy Grant', 'Eva Shaw', 'Holly Lane', 'Freya Wells', 'Daisy Cole', 'Nina Ford', 'Tessa Blake', 'Iris Hale', 'Megan Doyle'],
  },
  he: {
    slug: 'katifa', code: 'KATIFA-1', name: 'סטודיו קטיפה', tz: 'Asia/Jerusalem', iso: 'IL', cc: '972', prefix: '0546',
    owner: 'מיכל אורן',
    services: [['תספורת ופן', 45, 80], ['צבע לשיער', 90, 220], ['גוונים', 120, 300], ['איפור ערב', 60, 180],
      ['מניקור', 30, 60], ['פדיקור', 45, 80], ['עיצוב גבות', 20, 40], ['טיפול פנים', 60, 150]],
    team: [['נועה', 'שיער וצבע', [0, 1, 2]], ['מאיה', 'איפור וגבות', [3, 6]], ['שירה', 'ציפורניים וטיפוח', [4, 5]], ['טל', 'עור וגבות', [7, 6]]],
    booker: 'יעל מזרחי',
    customers: ['מאיה לוי', 'שירה פרץ', 'תמר ביטון', 'אביגיל דהן', 'רוני אברהם', 'הילה פרידמן', 'ליאור שפירא', 'עדי גולן', 'אור רוזן', 'דנה קפלן',
      'ענבל ברק', 'מיכל אזולאי', 'גלי חדד', 'ליה שלום', 'רותם בן דוד', 'אלה כץ', 'שני עמר', 'טליה סויסה', 'נגה אלון', 'הדר גבאי',
      'אגם וקנין', 'עמית שחר', 'ספיר נחום', 'קרן ישראלי', 'יובל מור', 'לירון אדרי', 'אופיר זילבר', 'סתיו ברגר', 'מורן טל', 'נטע כרמי'],
  },
};

// One seeded random sequence for every language: the same day, the same history, only the words differ.
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

const hm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export async function seedSalon({ db, one, call }, lang) {
  const L = DATA[lang], S = L.slug, rnd = rng(20261028);
  const pick = list => list[Math.floor(rnd() * list.length)];
  // The look every salon gets when Salonieer approves it from the website (website_app_approve): the brand colours
  // and the light "ivory" style.
  await call('platform_create_salon', [{ slug: S, name: L.name, access_code: L.code, primary_color: '#1a88a4', secondary_color: '#c6b18b',
    timezone: L.tz, style_preset: 'ivory', motion: 'full', team_composition: 'female', clientele: 'women', subscription: { plan_code: 'pro' } }]);
  const today = (await one(`select (now() at time zone $1)::date::text d`, [L.tz])).d;
  const nowMin = (await one(`select extract(hour from now() at time zone $1)::int * 60 + extract(minute from now() at time zone $1)::int m`, [L.tz])).m;
  const day = n => one(`select ((now() at time zone $1)::date + $2::int)::text d`, [L.tz, n]).then(r => r.d);
  const sched = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, d === 5
    ? { on: false, periods: [], breaks: [] }
    : { on: true, periods: [{ start: '10:00', end: '20:00' }], breaks: [{ start: '14:00', end: '14:30' }] }]));
  const svc = [];
  for (const [name, dur, price] of L.services) svc.push({ id: (await call(`${S}_admin_save_service`, [P, null, name, '', dur, price, true])).id, name, dur, price });
  const team = [];
  for (const [name, specialty, list] of L.team) {
    const id = (await call(`${S}_admin_save_barber_v2`, [P, null, { name, schedule: sched, specialty }])).id;
    await call(`${S}_admin_set_barber_services`, [P, id, list.map(i => svc[i].id)]);
    team.push({ id, name, services: list.map(i => svc[i]) });
  }
  // Accounts that sign in: the owner, the first specialist, and the customer who books in the pictures.
  const ownerPhone = L.prefix + '000001', specPhone = L.prefix + '000002', bookerPhone = L.prefix + '000101';
  const owner = await call(`${S}_admin_add_user`, [P, ownerPhone, L.owner, 'admin']);
  const spec = await call(`${S}_admin_add_user`, [P, specPhone, team[0].name, 'barber']);
  await call(`${S}_admin_update_user`, [P, spec.id, null, 'barber', null, team[0].id]);
  await db.query(`update shop_${S}.users set password_hash = extensions.crypt($1, extensions.gen_salt('bf')) where id = any($2::uuid[])`, [PASSWORD, [owner.id, spec.id]]);
  for (const ph of [ownerPhone, specPhone]) await call('salonieer_account_login_v1', ['+' + L.cc + ph.slice(1), L.cc, PASSWORD], null);
  const booker = await call(`${S}_auth_register`, [bookerPhone, L.booker, PASSWORD], null);
  await db.query(`update shop_${S}.app_settings set online_booking = true, show_prices = false where id = 1`);
  // Customers, who joined over the last two months.
  const cust = [];
  let n = 200;
  for (const name of L.customers) {
    const id = (await call(`${S}_admin_add_user`, [P, L.prefix + '000' + n++, name, 'user'])).id;
    await db.query(`update shop_${S}.users set created_at = now() - make_interval(days => $2) where id = $1`, [id, Math.floor(rnd() * 70) + 1]);
    cust.push(id);
  }
  // The visits. No amounts are stored (price 0): the pictures never show money.
  const rows = [];
  const busy = new Map();
  const free = (b, date, start, dur) => { const k = b + date, list = busy.get(k) || []; return list.every(([s, e]) => start >= e || start + dur <= s); };
  const take = (b, date, start, dur) => { const k = b + date; busy.set(k, [...(busy.get(k) || []), [start, start + dur]]); };
  const add = (who, b, s, date, start, status) => { take(b.id, date, start, s.dur); rows.push([who, b.id, s.id, date, hm(start), status, s.name, b.name, s.dur]); };
  const slot = (b, s, date, from = 600, to = 1200) => {
    for (let tries = 0; tries < 40; tries++) {
      const start = from + Math.floor(rnd() * ((to - from - s.dur) / 15)) * 15;
      if ((start < 870 && start + s.dur > 840) || start + s.dur > to) continue;
      if (free(b.id, date, start, s.dur)) return start;
    }
    return null;
  };
  for (let d = 63; d >= 1; d--) {
    const date = await day(-d);
    const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
    if (weekday === 5) continue;
    const count = 9 + Math.floor(rnd() * 7) + (weekday === 4 ? 4 : 0);
    for (let i = 0; i < count; i++) {
      const b = team[Math.floor(rnd() * rnd() * team.length)], s = pick(b.services), start = slot(b, s, date);
      if (start === null) continue;
      const r = rnd();
      add(pick(cust), b, s, date, start, r < .84 ? 'completed' : r < .93 ? 'cancelled' : 'no_show');
    }
  }
  // Today: done before now, booked after it, and two requests waiting for the salon.
  const plan = [[0, 0, 600], [0, 1, 660], [0, 0, 765], [0, 0, 870], [0, 1, 930], [0, 0, 1050], [0, 0, 1110],
    [1, 0, 600], [1, 1, 675], [1, 0, 720], [1, 1, 795], [1, 0, 900], [1, 1, 975], [1, 0, 1080],
    [2, 0, 600], [2, 1, 645], [2, 0, 705], [2, 0, 750], [2, 1, 870], [2, 0, 930], [2, 1, 1005], [2, 0, 1080],
    [3, 0, 630], [3, 1, 705], [3, 0, 750], [3, 0, 900], [3, 1, 975], [3, 0, 1050]];
  for (const [bi, si, start] of plan) {
    const b = team[bi], s = b.services[si];
    if (!free(b.id, today, start, s.dur)) continue;
    add(pick(cust), b, s, today, start, start + s.dur <= nowMin ? 'completed' : 'confirmed');
  }
  const tomorrow = await day(1);
  for (const [bi, si, start, status] of [[0, 0, 600, 'confirmed'], [0, 1, 720, 'confirmed'], [0, 0, 900, 'pending'], [0, 2, 1080, 'confirmed'],
    [1, 0, 660, 'confirmed'], [1, 1, 750, 'pending'], [1, 0, 1020, 'confirmed'], [2, 0, 630, 'confirmed'], [2, 1, 720, 'confirmed'],
    [2, 0, 870, 'confirmed'], [2, 1, 1110, 'pending'], [3, 0, 720, 'confirmed'], [3, 1, 930, 'confirmed']]) {
    const b = team[bi], s = b.services[si];
    if (free(b.id, tomorrow, start, s.dur)) add(pick(cust), b, s, tomorrow, start, status);
  }
  for (const r of rows) await db.query(`insert into shop_${S}.bookings(user_id, barber_id, service_id, booking_date, booking_time, status, service_name, barber_name, price, duration)
    values ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9)`, r);
  return { L, S, today, tomorrow, nowMin, svc, team, owner, spec, booker, ownerPhone, specPhone, bookerPhone, cust, count: rows.length };
}
