// Plan Finder (/plans#finder, November 2026): which plan fits a salon and what it really costs.
// The prices and included specialists come from the live price list the server sends with the page (state.catalog: Basic,
// Pro, the Basic option, the extra-specialist price, yearly = yearlyMonths × monthly), so the finder always quotes what the
// checkout charges. What each plan includes comes from plans-data.js (generated from the app's plans.js, the same
// entitlements as salonieer_private.plan_features). The rule never favours a plan: the cheapest plan that covers
// everything chosen wins; at an equal price the plan that includes more (Pro) wins; Enterprise only for several branches,
// custom terms or a team larger than can be ordered online.
import { PLAN_FEATURES } from './plans-data.js';

// The most extra specialists an application can order (the same limit as the form and /api/applications).
export const MAX_EXTRA = 50;
export const MAX_SPECIALISTS = 99;
// What a salon may need beyond the basics, by kind: 'option' = Basic's one optional add-on (Pro includes both),
// 'pro' = Pro and Enterprise only. 'statistics_history' is the statistics feature beyond Basic's last 30 days.
const KIND = Object.fromEntries(PLAN_FEATURES.filter(f => f.included !== 'all').map(f => [f.key, f.included === 'option' ? 'option' : 'pro']));
KIND.statistics_history = 'pro';
const GROUPS = [
  ['customers', ['loyalty', 'smart_waitlist', 'coupons', 'service_packages', 'retention_suggestions', 'deposits', 'shop']],
  ['money', ['smart_checkout', 'financial_management', 'inventory']],
  ['team', ['employee_earnings', 'employee_commissions', 'attendance']],
  ['reports', ['statistics_history']],
].map(([id, keys]) => [id, keys.filter(k => KIND[k])]);

const W = {
  title: { ar: 'ما الباقة المناسبة لعملك؟', en: 'Which plan fits your business?', he: 'איזו חבילה מתאימה לעסק שלכם?' },
  lead: { ar: 'اختر عدد المختصين والميزات التي تحتاجها فعلاً، ونحسب لك تكلفة كل باقة ونرشّح الأنسب لك — لا الأغلى.',
    en: 'Choose how many specialists you have and the features you actually need. We work out what each plan would cost and recommend the best fit — not the most expensive one.',
    he: 'בחרו כמה מומחים יש לכם ואילו פיצ׳רים אתם באמת צריכים. נחשב כמה תעלה כל חבילה ונמליץ על המתאימה ביותר — לא על היקרה ביותר.' },
  jump: { ar: 'لست متأكداً؟ اعرف الباقة المناسبة خلال دقيقة', en: 'Not sure? Find your plan in a minute', he: 'לא בטוחים? מצאו את החבילה שלכם בדקה' },
  q1: { ar: 'كم مختصاً يستقبل حجوزات؟', en: 'How many specialists take appointments?', he: 'כמה מומחים מקבלים תורים?' },
  q1hint: { ar: 'احسب كل من يستقبل مواعيد، وأنت أيضاً إن كنت تخدم العملاء. الاستقبال والمساعدون لا يُحسبون.',
    en: 'Count everyone who takes bookings — yourself too if you serve customers. Reception and assistants don’t count.',
    he: 'ספרו את כל מי שמקבל תורים — גם אתכם, אם אתם משרתים לקוחות. קבלה ועוזרים לא נספרים.' },
  fewer: { ar: 'مختص أقل', en: 'One fewer specialist', he: 'מומחה אחד פחות' },
  more: { ar: 'مختص أكثر', en: 'One more specialist', he: 'מומחה אחד יותר' },
  q2: { ar: 'ماذا تحتاج أيضاً؟', en: 'What else do you need?', he: 'מה עוד אתם צריכים?' },
  q2hint: { ar: 'اختر فقط ما ستستخدمه. كل الباقات تشمل:', en: 'Pick only what you’ll use. Every plan already includes:', he: 'בחרו רק מה שתשתמשו בו. כל החבילות כוללות:' },
  last30: { ar: 'آخر 30 يوماً', en: 'last 30 days', he: '30 הימים האחרונים' },
  groups: { customers: { ar: 'العملاء والحجوزات', en: 'Customers and bookings', he: 'לקוחות והזמנות' },
    money: { ar: 'الدفع والمال', en: 'Payments and money', he: 'תשלומים וכספים' },
    team: { ar: 'الفريق', en: 'Your team', he: 'הצוות' },
    reports: { ar: 'التقارير', en: 'Reports', he: 'דוחות' } },
  statisticsHistory: { ar: 'الإحصائيات لكل الفترات السابقة', en: 'Statistics for every past period', he: 'סטטיסטיקה לכל התקופות' },
  statisticsHistoryD: { ar: 'Basic يعرض آخر 30 يوماً فقط؛ وPro يعرض كل السجل والمقارنات.', en: 'Basic shows the last 30 days; Pro shows the full history and comparisons.', he: 'Basic מציג 30 ימים אחרונים; Pro מציג את כל ההיסטוריה וההשוואות.' },
  q3: { ar: 'لدي عدة فروع أو أحتاج شروطاً خاصة ودعماً مخصصاً', en: 'I have several branches, or need custom terms and dedicated support', he: 'יש לי כמה סניפים, או שאני צריך תנאים מותאמים ותמיכה ייעודית' },
  result: { ar: 'النتيجة', en: 'Your result', he: 'התוצאה שלכם' },
  bestFit: { ar: 'الأنسب لك', en: 'Best fit', he: 'הכי מתאים' },
  includes: { ar: 'يشمل', en: 'includes', he: 'כולל' },
  extra: { ar: 'مختصون إضافيون', en: 'Extra specialists', he: 'מומחים נוספים' },
  addon: { ar: 'إضافة', en: 'add-on', he: 'תוספת' },
  total: { ar: 'المجموع', en: 'Total', he: 'סה״כ' },
  notIncluded: { ar: 'لا تشمل ما اخترته:', en: 'Doesn’t include what you picked:', he: 'לא כולל את מה שבחרתם:' },
  bothOptions: { ar: 'نقاط الولاء وقائمة الانتظار معاً', en: 'Loyalty Coins and the Smart waitlist together', he: 'מטבעות נאמנות ורשימת המתנה יחד' },
  aMonth: { ar: 'شهرياً', en: 'a month', he: 'בחודש' },
  aYear: { ar: 'سنوياً', en: 'a year', he: 'בשנה' },
  why: {
    basic_cheaper: { ar: 'باقة Basic تغطي كل ما اخترته، وتكلفتها أقل من Pro بـ {diff} {per}.', en: 'Basic covers everything you chose and costs {diff} {per} less than Pro.', he: 'Basic מכסה את כל מה שבחרתם ועולה {diff} {per} פחות מ־Pro.' },
    pro_same: { ar: 'مع {n} من المختصين تصبح تكلفة Basic {basic} — نفس سعر Pro الذي يشمل كل الميزات و{proN}. لذلك Pro هو الأوفر.', en: 'With {n} specialists, Basic would cost {basic} — the same as Pro, which includes every feature and {proN}. So Pro is the better deal.', he: 'עם {n} מומחים Basic יעלה {basic} — כמו Pro, שכולל את כל הפיצ׳רים ו־{proN}. לכן Pro משתלם יותר.' },
    pro_cheaper: { ar: 'مع {n} من المختصين تصبح تكلفة Basic {basic}، بينما Pro بـ {pro} ويشمل كل الميزات و{proN}. Pro أرخص لفريقك.', en: 'With {n} specialists, Basic would cost {basic}, while Pro costs {pro} and includes every feature and {proN}. Pro is cheaper for your team.', he: 'עם {n} מומחים Basic יעלה {basic}, ו־Pro עולה {pro} וכולל את כל הפיצ׳רים ו־{proN}. Pro זול יותר לצוות שלכם.' },
    needs_pro: { ar: 'متوفّر في Pro فقط: {features}.', en: 'Available only in Pro: {features}.', he: 'זמין רק ב־Pro: {features}.' },
    two_options: { ar: 'يمكن إضافة ميزة واحدة فقط إلى Basic: نقاط الولاء أو قائمة الانتظار الذكية. وPro يشمل الاثنتين.', en: 'Basic can add one of Loyalty Coins or the Smart waitlist, not both. Pro includes both.', he: 'ל־Basic אפשר להוסיף רק אחת: מטבעות נאמנות או רשימת המתנה חכמה. Pro כולל את שתיהן.' },
    custom: { ar: 'للفروع المتعددة أو الشروط الخاصة، سعر Enterprise حسب الاتفاق. تواصل معنا ونقترح عليك الأنسب. للمقارنة: Pro لفريقك بـ {pro}.', en: 'For several branches or custom terms, Enterprise is priced by agreement — contact us and we’ll suggest the best setup. For comparison, Pro for your team is {pro}.', he: 'לכמה סניפים או תנאים מותאמים, Enterprise במחיר לפי הסכם — צרו קשר ונציע את ההתאמה הטובה ביותר. להשוואה, Pro לצוות שלכם עולה {pro}.' },
    large: { ar: 'أكثر من {max} من المختصين يتجاوز ما يمكن طلبه عبر الموقع. سعر Enterprise حسب الاتفاق — تواصل معنا.', en: 'More than {max} specialists is beyond what can be ordered online. Enterprise is priced by agreement — contact us.', he: 'יותר מ־{max} מומחים זה מעבר למה שאפשר להזמין באתר. Enterprise במחיר לפי הסכם — צרו קשר.' },
  },
  bigTeam: { ar: 'مع فريق كبير يمكنك أيضاً سؤالنا عن Enterprise.', en: 'With a big team you can also ask us about Enterprise.', he: 'עם צוות גדול אפשר לשאול אותנו גם על Enterprise.' },
  otherPeriod: { month: { ar: 'عند الدفع الشهري: {amount} شهرياً', en: 'Billed monthly: {amount} a month', he: 'בחיוב חודשי: {amount} בחודש' },
    year: { ar: 'عند الدفع السنوي: {amount} سنوياً (خصم {pct})', en: 'Billed yearly: {amount} a year ({pct} off)', he: 'בחיוב שנתי: {amount} בשנה ({pct} הנחה)' } },
  startWith: { ar: 'ابدأ بباقة {plan}', en: 'Start with {plan}', he: 'התחילו עם {plan}' },
  reset: { ar: 'ابدأ من جديد', en: 'Start over', he: 'להתחיל מחדש' },
  // 2026-11-08: the compact layout (feature groups fold; the cost breakdown folds under the answer)
  q2pick: { ar: 'افتح القسم الذي يهمك واختر فقط ما ستستخدمه.', en: 'Open the parts that matter to you and pick only what you’ll use.', he: 'פתחו את התחומים שחשובים לכם ובחרו רק מה שתשתמשו בו.' },
  basicsTitle: { ar: 'ما تشمله كل الباقات', en: 'What every plan already includes', he: 'מה כל חבילה כבר כוללת' },
  picked: { ar: '{n} مختارة', en: '{n} picked', he: '{n} נבחרו' },
  breakdown: { ar: 'تفاصيل التكلفة: Basic مقابل Pro', en: 'Cost breakdown: Basic vs Pro', he: 'פירוט העלות: Basic מול Pro' },
};
const L = (o, lang) => (o && (o[lang] || o.en)) || '';
export const finderLink = lang => L(W.jump, lang);
const featureName = (key, lang) => key === 'statistics_history' ? L(W.statisticsHistory, lang) : L(PLAN_FEATURES.find(f => f.key === key)?.t, lang);
const featureText = (key, lang) => key === 'statistics_history' ? L(W.statisticsHistoryD, lang) : L(PLAN_FEATURES.find(f => f.key === key)?.d, lang);
const clampN = v => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(MAX_SPECIALISTS, Math.max(1, n)) : 1; };

// ── The arithmetic (pure; also used by the tests) ──────────────────────────────────────────────────────────────────
// catalog: the server's price list (USD). need: { n, picked: [feature keys], custom }. Monthly amounts.
export function planMath(catalog, need) {
  const plan = id => (catalog?.plans || []).find(p => p.id === id);
  const B = plan('basic'), P = plan('pro'), E = plan('enterprise');
  const usd = v => (v === null || v === undefined || !Number.isFinite(Number(v))) ? null : Number(v);
  const seat = usd(catalog?.addons?.specialist?.USD), opt = usd(catalog?.addons?.loyalty?.USD);
  if (!B || !P || usd(B.prices?.USD) === null || usd(P.prices?.USD) === null || seat === null || opt === null) return null;
  const n = clampN(need.n);
  const picked = [...new Set(need.picked || [])].filter(k => KIND[k]);
  const options = picked.filter(k => KIND[k] === 'option'), proOnly = picked.filter(k => KIND[k] === 'pro');
  const bIncl = Number(B.specialists) || 1, pIncl = Number(P.specialists) || 7;
  const bExtra = Math.max(0, n - bIncl), pExtra = Math.max(0, n - pIncl);
  const basic = { base: usd(B.prices.USD), included: bIncl, extra: bExtra, seat, option: options.length === 1 ? options[0] : null };
  basic.optionPrice = basic.option ? opt : 0;
  basic.total = basic.base + basic.optionPrice + bExtra * seat;
  // (A team too large to order Basic online always costs more on Basic than on Pro, so seats never decide on their own.)
  basic.missing = [...proOnly, ...(options.length > 1 ? ['two_options'] : [])];
  basic.ok = basic.missing.length === 0;
  const pro = { base: usd(P.prices.USD), included: pIncl, extra: pExtra, seat, total: usd(P.prices.USD) + pExtra * seat, ok: pExtra <= MAX_EXTRA };
  let pick, reason;
  if (need.custom && E) { pick = 'enterprise'; reason = 'custom'; }
  else if (!pro.ok) { pick = E ? 'enterprise' : 'pro'; reason = 'large'; }
  else if (basic.ok && basic.total < pro.total) { pick = 'basic'; reason = 'basic_cheaper'; }
  else if (basic.ok) { pick = 'pro'; reason = basic.total === pro.total ? 'pro_same' : 'pro_cheaper'; }
  else { pick = 'pro'; reason = proOnly.length ? 'needs_pro' : 'two_options'; }
  return { n, basic, pro, hasEnterprise: !!E, pick, reason, proOnly, options, maxSpecialists: pIncl + MAX_EXTRA,
    names: { basic: B.name, pro: P.name, enterprise: E?.name || 'Enterprise' } };
}
// The application form, filled in with the finder's answer.
export function applyLink(m) {
  if (m.pick === 'enterprise') return '/apply?plan=enterprise';
  const q = new URLSearchParams({ plan: m.pick });
  if (m.pick === 'basic' && m.basic.option) q.set('option', m.basic.option);
  const extra = m.pick === 'basic' ? m.basic.extra : m.pro.extra;
  if (extra > 0) q.set('extra', String(extra));
  return '/apply?' + q.toString();
}

// ── State (kept across re-renders: the page repaints when the period or currency changes) ───────────────────────────
const KEY = 'salonieer_plan_finder';
// open: the feature groups the visitor opened; brk: the cost breakdown is open (kept when the page repaints).
const S = { n: 1, picked: [], custom: false, open: [], brk: false };
try { const s = JSON.parse(sessionStorage.getItem(KEY) || 'null'); if (s) { S.n = clampN(s.n); S.picked = Array.isArray(s.picked) ? s.picked.filter(k => KIND[k]) : []; S.custom = s.custom === true; S.open = Array.isArray(s.open) ? s.open.filter(g => GROUPS.some(([id]) => id === g)) : []; S.brk = s.brk === true; } } catch {}
const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(S)); } catch {} };

// ── The section ────────────────────────────────────────────────────────────────────────────────────────────────────
// ctx: { lang, esc, t, catalog, interval, yearMonths, yearlySaving, shownPrice, shownPriceText, money, trialShown, trialDays }
export function planFinder(ctx) {
  const { lang, esc } = ctx;
  if (!planMath(ctx.catalog, S)) return '';
  const basics = PLAN_FEATURES.filter(f => f.included === 'all' && f.key !== 'specialists')
    .map(f => esc(L(f.t, lang)) + (f.key === 'statistics' ? ` (${esc(L(W.last30, lang))})` : '')).join(' · ');
  const chip = k => `<label class="pf-chip"><input type="checkbox" name="pf-need" value="${k}"${S.picked.includes(k) ? ' checked' : ''}><span><b>${esc(featureName(k, lang))}</b><small>${esc(featureText(k, lang))}</small></span></label>`;
  // Each group of features folds away; its title says how many are picked, so a closed group still shows the choice.
  const group = ([id, keys]) => { const n = keys.filter(k => S.picked.includes(k)).length;
    return `<details class="pf-acc" data-pf-group="${id}"${S.open.includes(id) ? ' open' : ''}><summary><span class="pf-acc-title">${esc(L(W.groups[id], lang))}</span><span class="pf-acc-count" data-pf-count="${id}"${n ? '' : ' hidden'}>${esc(L(W.picked, lang).replace('{n}', String(n)))}</span><span class="pf-acc-sub">${esc(keys.map(k => featureName(k, lang)).join(' · '))}</span></summary><div class="pf-chips">${keys.map(chip).join('')}</div></details>`; };
  return `<section class="plan-finder" id="finder" aria-labelledby="pf-title">
    <div class="pf-head"><h2 id="pf-title">${esc(L(W.title, lang))}</h2><p class="pf-lead">${esc(L(W.lead, lang))}</p></div>
    <div class="pf-grid">
      <div class="pf-form" role="group" aria-labelledby="pf-title">
        <div class="pf-q pf-q-n"><label class="pf-label" for="pf-n">${esc(L(W.q1, lang))}</label>
          <div class="pf-n-row"><div class="pf-stepper"><button type="button" class="pf-step" data-pf-step="-1" aria-label="${esc(L(W.fewer, lang))}" aria-controls="pf-n">−</button><input id="pf-n" type="number" inputmode="numeric" min="1" max="${MAX_SPECIALISTS}" step="1" value="${S.n}" dir="ltr" aria-describedby="pf-n-hint"><button type="button" class="pf-step" data-pf-step="1" aria-label="${esc(L(W.more, lang))}" aria-controls="pf-n">+</button></div>
          <p class="pf-hint" id="pf-n-hint">${esc(L(W.q1hint, lang))}</p></div></div>
        <div class="pf-q"><p class="pf-label" id="pf-q2">${esc(L(W.q2, lang))}</p><p class="pf-hint pf-q2-hint">${esc(L(W.q2pick, lang))}</p>
          <div class="pf-accs" role="group" aria-labelledby="pf-q2">${GROUPS.map(group).join('')}</div>
          <details class="pf-basics"><summary>${esc(L(W.basicsTitle, lang))}</summary><p>${basics}.</p></details></div>
        <label class="pf-custom"><input type="checkbox" id="pf-custom"${S.custom ? ' checked' : ''}><span>${esc(L(W.q3, lang))}</span></label>
        <button type="button" class="text-link pf-reset" id="pf-reset">${esc(L(W.reset, lang))}</button>
      </div>
      <div class="pf-result" id="pf-result" aria-live="polite" aria-label="${esc(L(W.result, lang))}">${resultHTML(ctx)}</div>
    </div></section>`;
}

function resultHTML(ctx) {
  const { lang, esc, t } = ctx, m = planMath(ctx.catalog, S);
  if (!m) return '';
  const year = ctx.interval === 'year', k = year ? ctx.yearMonths() : 1, per = v => v * k;
  const perWords = L(year ? W.aYear : W.aMonth, lang), periodSmall = ` <small>${esc(t(year ? 'perYear' : 'perMonth'))}</small>`;
  // Prices inside a sentence: kept left-to-right as a unit ("≈ ₪62 ($20)") inside Arabic and Hebrew text.
  const txt = v => `<bdi dir="ltr">${esc(ctx.shownPriceText(per(v)))}</bdi>`;
  const fill = (tpl, vars) => esc(tpl).replace(/\{(\w+)\}/g, (_, x) => vars[x] ?? '');
  const proN = esc(L(PLAN_FEATURES.find(f => f.key === 'specialists')?.limit?.pro, lang));
  const names = list => list.map(key => key === 'two_options' ? L(W.bothOptions, lang) : featureName(key, lang));
  const vars = { diff: txt(m.pro.total - m.basic.total), per: esc(perWords), n: `<bdi>${m.n}</bdi>`, basic: txt(m.basic.total), pro: txt(m.pro.total), proN,
    features: esc(names(m.proOnly).join(lang === 'ar' ? '، ' : ', ')), max: `<bdi>${m.maxSpecialists}</bdi>` };
  const why = fill(L(W.why[m.reason], lang), vars) + (m.n >= 15 && m.pick !== 'enterprise' && m.hasEnterprise ? ' ' + esc(L(W.bigTeam, lang)) : '');
  const usdLine = (label, v) => `<li><span>${label}</span><b><bdi dir="ltr">${esc(ctx.money(per(v), 'USD'))}</bdi></b></li>`;
  const card = (id) => {
    const p = m[id], isPick = m.pick === id;
    const limit = esc(L(PLAN_FEATURES.find(f => f.key === 'specialists')?.limit?.[id], lang));
    const lines = [usdLine(`${esc(m.names[id])} · ${esc(L(W.includes, lang))} ${limit}`, p.base)];
    if (id === 'basic' && p.option) lines.push(usdLine(`${esc(featureName(p.option, lang))} (${esc(L(W.addon, lang))})`, p.optionPrice));
    if (p.extra > 0) lines.push(usdLine(`${esc(L(W.extra, lang))} × <bdi>${p.extra}</bdi>`, p.extra * p.seat));
    const missing = id === 'basic' && !p.ok ? `<p class="pf-miss"><b>${esc(L(W.notIncluded, lang))}</b> ${esc(names(p.missing).join(lang === 'ar' ? '، ' : ', '))}</p>` : '';
    const trial = id === 'pro' && ctx.trialShown('pro') ? `<span class="trial-badge">${esc(t('trialBadge', { n: ctx.trialDays() }))}</span>` : '';
    return `<article class="pf-card${isPick ? ' is-pick' : ''}${id === 'basic' && !p.ok ? ' is-out' : ''}" data-pf-plan="${id}"><header><h4>${esc(m.names[id])}</h4>${isPick ? `<span class="tag">${esc(L(W.bestFit, lang))}</span>` : ''}${trial}</header>
      <ul class="pf-lines">${lines.join('')}</ul>
      <p class="pf-card-total"><span>${esc(L(W.total, lang))}</span><span class="pf-amount" data-pf-total="${per(p.total)}">${ctx.shownPrice(per(p.total), periodSmall)}</span></p>${missing}</article>`;
  };
  const pickTotal = m.pick === 'basic' ? m.basic.total : m.pick === 'pro' ? m.pro.total : null;
  const other = pickTotal === null ? '' : `<p class="pf-other">${fill(L(year ? W.otherPeriod.month : W.otherPeriod.year, lang), {
    amount: `<bdi dir="ltr">${esc(ctx.shownPriceText(year ? pickTotal : pickTotal * ctx.yearMonths()))}</bdi>`, pct: `<bdi dir="ltr">${esc(ctx.yearlySaving())}%</bdi>` })}</p>`;
  const cta = m.pick === 'enterprise' ? esc(t('contactUs')) : fill(L(W.startWith, lang), { plan: esc(m.names[m.pick]) });
  return `<div class="pf-verdict ink" data-pf-pick="${m.pick}" data-pf-reason="${m.reason}"><p class="pf-kicker">${esc(L(W.bestFit, lang))}</p><h3>${esc(m.names[m.pick])}</h3>
      <p class="pf-total">${pickTotal === null ? esc(t('byAgreement')) : ctx.shownPrice(per(pickTotal), periodSmall)}</p>${other}
      <p class="pf-why">${why}</p>
      <a class="btn primary" id="pf-cta" href="${esc(applyLink(m))}">${cta}</a></div>
    <details class="pf-break" id="pf-break"${S.brk ? ' open' : ''}><summary>${esc(L(W.breakdown, lang))}</summary><div class="pf-cards">${card('basic')}${card('pro')}</div></details>`;
}

export function bindPlanFinder(ctx) {
  const root = document.getElementById('finder');
  if (!root) return;
  const out = document.getElementById('pf-result'), input = document.getElementById('pf-n');
  const keepBreak = () => out.querySelector('#pf-break')?.addEventListener('toggle', e => { S.brk = e.target.open; save(); });
  const counts = () => GROUPS.forEach(([id, keys]) => { const el = root.querySelector(`[data-pf-count="${id}"]`), n = keys.filter(k => S.picked.includes(k)).length; if (el) { el.textContent = L(W.picked, ctx.lang).replace('{n}', String(n)); el.hidden = !n; } });
  const update = () => { save(); counts(); out.innerHTML = resultHTML(ctx); keepBreak(); };
  keepBreak();
  root.querySelectorAll('.pf-acc').forEach(d => d.addEventListener('toggle', () => { S.open = [...root.querySelectorAll('.pf-acc[open]')].map(x => x.dataset.pfGroup); save(); }));
  input.addEventListener('input', () => { if (input.value.trim() === '') return; S.n = clampN(input.value); update(); });
  input.addEventListener('change', () => { S.n = clampN(input.value); input.value = S.n; update(); });
  root.querySelectorAll('[data-pf-step]').forEach(b => b.addEventListener('click', () => { S.n = clampN(S.n + Number(b.dataset.pfStep)); input.value = S.n; update(); }));
  root.querySelectorAll('input[name="pf-need"]').forEach(box => box.addEventListener('change', () => {
    S.picked = [...root.querySelectorAll('input[name="pf-need"]:checked')].map(x => x.value); update();
  }));
  document.getElementById('pf-custom').addEventListener('change', e => { S.custom = e.target.checked; update(); });
  document.getElementById('pf-reset').addEventListener('click', () => {
    S.n = 1; S.picked = []; S.custom = false; S.open = []; input.value = 1;
    root.querySelectorAll('input[type="checkbox"]').forEach(x => { x.checked = false; });
    root.querySelectorAll('.pf-acc[open]').forEach(x => { x.open = false; }); update(); input.focus();
  });
}
