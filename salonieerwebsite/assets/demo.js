// Try METON Free (2026-11-07). One entry, two demos (NEW-006..012):
//  /try           choose: book as a customer, or build your business page
//  /try/customer  a fully prepared example business, booked through the SAME booking interface as every real business
//                 page (book.js runBooking) — only its data source is simulated
//  /try/business  a 3-step page builder (business → booking setup → preview & test) with a large interactive preview:
//                 the business's booking page next to its dashboard (demo-board.js); test bookings appear on the schedule
//                 and can be confirmed, rescheduled or cancelled
// Demo safety: nothing here calls the booking server. The verification code is made and checked in this page (it can
// never verify a real booking: real bookings are verified only by the server), no message is sent, no time is taken,
// no record is made. The builder's draft and test bookings stay in this browser (localStorage) until the visitor chooses
// to save the page to an account (/api/drafts, which stores the setup only, never published by itself).
import { L as BL, runBooking, manageView, store, rid, deviceZone, ymdIn, nowMinutesIn, addDays, weekday, toMin, toHm, bookableDays, ico, ICON, initials, longDate } from './book.js';
import { CATEGORIES, categoryOf, pick3, exampleServices, defaultHours, demoBusiness, demoCurrency, SAMPLE_PEOPLE, weekStart } from './demo-data.js';
import { mountBoard } from './demo-board.js';

const B = {
  tryEyebrow: { en: 'Free · no account needed', ar: 'مجاناً · بدون حساب', he: 'בחינם · בלי חשבון' },
  tryTitle: { en: 'Try METON free', ar: 'جرّب METON مجاناً', he: 'נסו את METON בחינם' },
  tryLead: { en: 'See METON from both sides before you subscribe: book like a customer, or build your own booking page and manage test bookings.', ar: 'شاهد METON من الجهتين قبل الاشتراك: احجز كعميل، أو أنشئ صفحة الحجز الخاصة بعملك وأدِر حجوزات تجريبية.', he: 'הכירו את METON משני הצדדים לפני המנוי: הזמינו תור כלקוח, או בנו דף הזמנות לעסק ונהלו הזמנות ניסיון.' },
  tryA: { en: 'Book as a customer', ar: 'احجز كعميل', he: 'הזמנה כלקוח' },
  tryABody: { en: 'Open a ready-made example business and book an appointment exactly as your customers would.', ar: 'افتح عملاً تجريبياً جاهزاً واحجز موعداً تماماً كما سيفعل عملاؤك.', he: 'פתחו עסק לדוגמה מוכן וקבעו תור בדיוק כמו שהלקוחות שלכם יעשו.' },
  tryA1: { en: 'Services, specialists, prices and free times', ar: 'خدمات ومختصون وأسعار وأوقات متاحة', he: 'שירותים, אנשי מקצוע, מחירים וזמנים פנויים' },
  tryA2: { en: 'A demo verification code — no message is sent', ar: 'رمز تحقق تجريبي — لا تُرسل أي رسالة', he: 'קוד אימות לדוגמה — לא נשלחת הודעה' },
  tryA3: { en: 'The same request and status screens as a real booking', ar: 'نفس شاشات الطلب والحالة في الحجز الحقيقي', he: 'אותם מסכי בקשה וסטטוס כמו בהזמנה אמיתית' },
  tryB: { en: 'Build your business page', ar: 'أنشئ صفحة عملك', he: 'בנו את דף העסק שלכם' },
  tryBBody: { en: 'Create your booking page in three quick steps, then test it with your own bookings and your dashboard.', ar: 'أنشئ صفحة الحجز في ثلاث خطوات سريعة، ثم جرّبها بحجوزاتك ولوحة عملك.', he: 'צרו את דף ההזמנות בשלושה צעדים מהירים, ואז נסו אותו עם הזמנות משלכם ועם לוח הבקרה.' },
  tryB1: { en: 'Ready-made services for your type of business', ar: 'خدمات جاهزة حسب نوع عملك', he: 'שירותים מוכנים לפי סוג העסק' },
  tryB2: { en: 'A live preview of your page and your schedule', ar: 'معاينة حية لصفحتك وجدول مواعيدك', he: 'תצוגה חיה של הדף ושל היומן' },
  tryB3: { en: 'Private until you choose to publish', ar: 'خاصة حتى تقرر نشرها', he: 'פרטי עד שתבחרו לפרסם' },
  tryStartA: { en: 'Book a demo appointment', ar: 'احجز موعداً تجريبياً', he: 'קביעת תור לדוגמה' },
  tryStartB: { en: 'Start building', ar: 'ابدأ الإنشاء', he: 'מתחילים לבנות' },
  tryFoot: { en: 'No account and no payment. Nothing you do in a demo is sent or booked. Create an account only if you want to save your page.', ar: 'بدون حساب وبدون دفع. لا يُرسل ولا يُحجز أي شيء تفعله في التجربة. أنشئ حساباً فقط إذا أردت حفظ صفحتك.', he: 'בלי חשבון ובלי תשלום. שום דבר שתעשו בהדגמה לא נשלח ולא מוזמן. צרו חשבון רק אם תרצו לשמור את הדף.' },
  demoBar: { en: 'Example business — nothing you do here is sent or booked.', ar: 'عمل تجريبي — لا يُرسل ولا يُحجز أي شيء تفعله هنا.', he: 'עסק לדוגמה — שום דבר שתעשו כאן לא נשלח ולא מוזמן.' },
  exitDemo: { en: 'Exit demo', ar: 'الخروج من التجربة', he: 'יציאה מההדגמה' },
  buildOwn: { en: 'Build your own page', ar: 'أنشئ صفحتك الخاصة', he: 'בנו דף משלכם' },
  // builder
  wizEyebrow: { en: 'Build your business page · free', ar: 'أنشئ صفحة عملك · مجاناً', he: 'בונים את דף העסק · בחינם' },
  s1: { en: 'Business information', ar: 'معلومات العمل', he: 'פרטי העסק' },
  s2: { en: 'Booking setup', ar: 'إعداد الحجز', he: 'הגדרת ההזמנות' },
  s3: { en: 'Preview & test', ar: 'المعاينة والتجربة', he: 'תצוגה וניסיון' },
  s1Title: { en: 'Tell us about your business', ar: 'أخبرنا عن عملك', he: 'ספרו לנו על העסק' },
  s1Lead: { en: 'Two quick answers. You can change everything later.', ar: 'إجابتان سريعتان، ويمكنك تغيير كل شيء لاحقاً.', he: 'שתי תשובות מהירות. אפשר לשנות הכול אחר כך.' },
  s2Title: { en: 'Set up your bookings', ar: 'جهّز حجوزاتك', he: 'מגדירים את ההזמנות' },
  s2Lead: { en: 'We added example services for your type of business. Edit, replace or delete them.', ar: 'أضفنا خدمات مقترحة حسب نوع عملك. عدّلها أو استبدلها أو احذفها.', he: 'הוספנו שירותים לדוגמה לפי סוג העסק. ערכו, החליפו או מחקו אותם.' },
  s3Title: { en: 'Preview & test your page', ar: 'عاين صفحتك وجرّبها', he: 'צפו בדף ונסו אותו' },
  s3Lead: { en: 'Your booking page and your dashboard, side by side. Make a test booking, then confirm, reschedule or cancel it.', ar: 'صفحة الحجز ولوحة عملك جنباً إلى جنب. احجز موعداً تجريبياً، ثم أكّده أو غيّر موعده أو ألغِه.', he: 'דף ההזמנות ולוח הבקרה זה לצד זה. קבעו תור לדוגמה, ואז אשרו, שנו מועד או בטלו אותו.' },
  bizName: { en: 'Business name', ar: 'اسم العمل', he: 'שם העסק' },
  bizNamePh: { en: 'For example: Nova Physio', ar: 'مثلاً: مركز نوفا', he: 'למשל: נובה פיזיותרפיה' },
  bizNameErr: { en: 'Enter your business name (2–60 characters).', ar: 'أدخل اسم عملك (من 2 إلى 60 حرفاً).', he: 'הזינו את שם העסק (2–60 תווים).' },
  catLegend: { en: 'What kind of business is it?', ar: 'ما نوع عملك؟', he: 'איזה סוג עסק זה?' },
  catErr: { en: 'Choose the type of business.', ar: 'اختر نوع العمل.', he: 'בחרו את סוג העסק.' },
  svcTitle: { en: 'Services', ar: 'الخدمات', he: 'שירותים' },
  svcLead: { en: 'Customers choose one of these when they book.', ar: 'يختار العملاء واحدة منها عند الحجز.', he: 'הלקוחות בוחרים אחד מאלה כשהם קובעים תור.' },
  svcName: { en: 'Service name', ar: 'اسم الخدمة', he: 'שם השירות' },
  duration: { en: 'Duration', ar: 'المدة', he: 'משך' },
  price: { en: 'Price', ar: 'السعر', he: 'מחיר' },
  addSvc: { en: 'Add a service', ar: 'إضافة خدمة', he: 'הוספת שירות' },
  remove: { en: 'Remove', ar: 'حذف', he: 'הסרה' },
  svcErr: { en: 'Add at least one service with a name.', ar: 'أضف خدمة واحدة على الأقل مع اسمها.', he: 'הוסיפו לפחות שירות אחד עם שם.' },
  replaceAsk: { en: 'Replace your services with the examples for {cat}?', ar: 'استبدال خدماتك بالخدمات المقترحة لـ {cat}؟', he: 'להחליף את השירותים בשירותים לדוגמה של {cat}?' },
  replace: { en: 'Replace', ar: 'استبدال', he: 'החלפה' },
  keepMine: { en: 'Keep mine', ar: 'إبقاء خدماتي', he: 'להשאיר את שלי' },
  whoTitle: { en: 'Who provides the services?', ar: 'من يقدّم الخدمات؟', he: 'מי נותן את השירותים?' },
  solo: { en: 'Just me', ar: 'أنا فقط', he: 'רק אני' },
  soloSub: { en: 'You work on your own', ar: 'تعمل بمفردك', he: 'עובדים לבד' },
  team: { en: 'Me and my team', ar: 'أنا وفريقي', he: 'אני והצוות' },
  teamSub: { en: 'Customers choose a specialist', ar: 'يختار العملاء المختص', he: 'הלקוחות בוחרים איש מקצוע' },
  ownerName: { en: 'Your name as customers see it (optional)', ar: 'اسمك كما يراه العملاء (اختياري)', he: 'השם שלך כפי שהלקוחות יראו (רשות)' },
  personName: { en: 'Name', ar: 'الاسم', he: 'שם' },
  personRole: { en: 'Role (optional)', ar: 'الدور (اختياري)', he: 'תפקיד (רשות)' },
  offers: { en: 'Offers', ar: 'يقدّم', he: 'נותן/ת' },
  addPerson: { en: 'Add a specialist', ar: 'إضافة مختص', he: 'הוספת איש מקצוע' },
  teamErr: { en: 'Add at least one specialist with a name and a service.', ar: 'أضف مختصاً واحداً على الأقل مع اسمه وخدمة يقدمها.', he: 'הוסיפו לפחות איש מקצוע אחד עם שם ושירות.' },
  hoursTitle: { en: 'Working hours', ar: 'ساعات العمل', he: 'שעות עבודה' },
  hoursLead: { en: 'Customers can book inside these hours.', ar: 'يستطيع العملاء الحجز ضمن هذه الساعات.', he: 'הלקוחות יכולים לקבוע תור בשעות האלה.' },
  opens: { en: 'Opens', ar: 'يفتح', he: 'פתיחה' },
  closes: { en: 'Closes', ar: 'يغلق', he: 'סגירה' },
  hoursErr: { en: 'Choose at least one working day, and a closing time after the opening time.', ar: 'اختر يوم عمل واحداً على الأقل، ووقت إغلاق بعد وقت الفتح.', he: 'בחרו לפחות יום עבודה אחד, ושעת סגירה אחרי שעת הפתיחה.' },
  moreTitle: { en: 'Customize your page (optional)', ar: 'خصّص صفحتك (اختياري)', he: 'התאמה אישית של הדף (רשות)' },
  moreLead: { en: 'Colour, logo and a short description. You can skip this.', ar: 'اللون والشعار ووصف قصير. يمكنك تخطي ذلك.', he: 'צבע, לוגו ותיאור קצר. אפשר לדלג.' },
  color: { en: 'Brand colour', ar: 'لون العلامة', he: 'צבע המותג' },
  customColor: { en: 'Another colour', ar: 'لون آخر', he: 'צבע אחר' },
  logo: { en: 'Logo', ar: 'الشعار', he: 'לוגו' },
  logoBtn: { en: 'Upload a logo', ar: 'رفع شعار', he: 'העלאת לוגו' },
  logoRemove: { en: 'Remove logo', ar: 'إزالة الشعار', he: 'הסרת הלוגו' },
  logoBad: { en: 'Use a PNG, JPG or WebP image.', ar: 'استخدم صورة PNG أو JPG أو WebP.', he: 'השתמשו בתמונת PNG,‏ JPG או WebP.' },
  about: { en: 'Short description', ar: 'وصف قصير', he: 'תיאור קצר' },
  aboutPh: { en: 'For example: Physiotherapy and sports massage for every age.', ar: 'مثلاً: علاج طبيعي ومساج رياضي لكل الأعمار.', he: 'למשל: פיזיותרפיה ועיסוי ספורטאים לכל הגילים.' },
  address: { en: 'Address or area', ar: 'العنوان أو المنطقة', he: 'כתובת או אזור' },
  continue: { en: 'Continue', ar: 'متابعة', he: 'המשך' },
  back: { en: 'Back', ar: 'رجوع', he: 'חזרה' },
  preview: { en: 'Preview my page', ar: 'عاين صفحتي', he: 'לתצוגה של הדף' },
  pvNote: { en: 'Private demo: only you can see this page. It can’t receive public bookings until you subscribe and go live.', ar: 'تجربة خاصة: لا يرى هذه الصفحة غيرك. لا يمكنها استقبال حجوزات من العموم حتى تشترك وتنشرها.', he: 'הדגמה פרטית: רק אתם רואים את הדף. הוא לא יכול לקבל הזמנות מהציבור עד שתירשמו למנוי ותפרסמו אותו.' },
  pvNote2: { en: 'Test bookings stay in this browser.', ar: 'تبقى الحجوزات التجريبية في هذا المتصفح.', he: 'הזמנות הניסיון נשארות בדפדפן הזה.' },
  pvPage: { en: 'Booking page', ar: 'صفحة الحجز', he: 'דף ההזמנות' },
  pvDash: { en: 'Dashboard', ar: 'لوحة العمل', he: 'לוח בקרה' },
  pvPageCap: { en: 'What your customers see', ar: 'ما يراه عملاؤك', he: 'מה הלקוחות רואים' },
  pvDashCap: { en: 'What you see', ar: 'ما تراه أنت', he: 'מה אתם רואים' },
  seeDash: { en: 'See it in your dashboard', ar: 'شاهده في لوحة عملك', he: 'לראות בלוח הבקרה' },
  testAdded: { en: 'Test booking added to your dashboard.', ar: 'أُضيف الحجز التجريبي إلى لوحة عملك.', he: 'הזמנת הניסיון נוספה ללוח הבקרה.' },
  ctaTitle: { en: 'Ready to take real bookings?', ar: 'جاهز لاستقبال حجوزات حقيقية؟', he: 'מוכנים לקבל הזמנות אמיתיות?' },
  ctaText: { en: 'Save your progress, or choose a plan to publish this page. It goes live as soon as your subscription is active — no approval wait.', ar: 'احفظ تقدمك، أو اختر باقة لنشر هذه الصفحة. تُنشر فور تفعيل اشتراكك — دون انتظار موافقة.', he: 'שמרו את ההתקדמות, או בחרו חבילה כדי לפרסם את הדף. הוא עולה לאוויר ברגע שהמנוי פעיל — בלי המתנה לאישור.' },
  ctaPlans: { en: 'See plans & publish', ar: 'الباقات والنشر', he: 'חבילות ופרסום' },
  ctaSave: { en: 'Save my progress', ar: 'احفظ تقدمي', he: 'שמירת ההתקדמות' },
  ctaEdit: { en: 'Edit setup', ar: 'تعديل الإعداد', he: 'עריכת ההגדרות' },
  ctaReset: { en: 'Start over', ar: 'البدء من جديد', he: 'להתחיל מחדש' },
  resetAsk: { en: 'Start over? Your page and test bookings in this browser are deleted.', ar: 'البدء من جديد؟ ستُحذف صفحتك وحجوزاتك التجريبية من هذا المتصفح.', he: 'להתחיל מחדש? הדף והזמנות הניסיון בדפדפן הזה יימחקו.' },
  saveTitle: { en: 'Save your progress', ar: 'احفظ تقدمك', he: 'שמירת ההתקדמות' },
  saveBody: { en: 'Create a free account or log in to keep your business page and come back to it later. Nothing is published until you subscribe.', ar: 'أنشئ حساباً مجانياً أو سجّل الدخول للاحتفاظ بصفحة عملك والعودة إليها لاحقاً. لا يُنشر شيء حتى تشترك.', he: 'צרו חשבון חינמי או התחברו כדי לשמור את דף העסק ולחזור אליו אחר כך. שום דבר לא מתפרסם עד שתירשמו למנוי.' },
  createAccount: { en: 'Create a free account', ar: 'إنشاء حساب مجاني', he: 'יצירת חשבון חינמי' },
  logIn: { en: 'Log in', ar: 'تسجيل الدخول', he: 'התחברות' },
  savedAccount: { en: 'Saved to your account. You can come back to it any time.', ar: 'تم الحفظ في حسابك. يمكنك العودة إليه متى شئت.', he: 'נשמר בחשבון. אפשר לחזור אליו בכל זמן.' },
  savedLocal: { en: 'Saved in this browser.', ar: 'محفوظ في هذا المتصفح.', he: 'נשמר בדפדפן הזה.' },
  flagged: { en: 'We’ll review a few words in your page before it goes public (for example links in the name).', ar: 'سنراجع بعض الكلمات في صفحتك قبل نشرها (مثل الروابط في الاسم).', he: 'נבדוק כמה מילים בדף לפני שיעלה לאוויר (למשל קישורים בשם).' },
  you: { en: 'You', ar: 'أنت', he: 'את/ה' },
  stepOf: { en: 'Step {n} of 3', ar: 'الخطوة {n} من 3', he: 'שלב {n} מתוך 3' },
  free: { en: 'Free', ar: 'مجاناً', he: 'חינם' },
};
const T = (c, k, v = {}) => { let s = (B[k] && (B[k][c.lang] || B[k].en)) || BL(c, k); for (const [a, b] of Object.entries(v)) s = s.split('{' + a + '}').join(b); return s; };
const COLORS = ['#241D28', '#1F4E79', '#2E7D6B', '#6A4C93', '#B5402B', '#C8932E', '#2F6FDB', '#C2457A'];
const TEAM_COLORS = ['#3B6FD8', '#C8932E', '#2E9E7A', '#C2457A', '#6A4C93', '#1F4E79', '#B5402B', '#2F8F9D'];
const DURATIONS = [10, 15, 20, 30, 40, 45, 60, 75, 90, 120, 150, 180, 240];
const BAD = /(https?:\/\/|www\.|\.(com|net|org|ru|xyz|top)\b|casino|viagra|crypto|bitcoin|loan|porn|sex|bet\b)/i;
export function draftFlags(d) { const f = []; for (const v of [d.name, ...(d.services || []).map(s => s.name), ...(d.team || []).map(t => t.name + ' ' + (t.role || '')), d.look?.about, d.look?.address]) if (BAD.test(v || '')) f.push(v); return f; }

// ── the opening-hours rules both demos use (and the dashboard's "reschedule") ─────────────────────────────────────
// Times every 30 minutes (and right after another visit) inside the specialist's hours, that don't overlap a booking
// and aren't in the past. The example business also has its regular customers' visits ("busy").
const hash = s => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
function rng(seed) { let a = seed; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function busyFor(sp, date, open, close) {
  const r = rng(hash(sp + '|' + date)), out = [], n = 2 + Math.floor(r() * 3);
  for (let i = 0; i < n * 3 && out.length < n; i++) {
    const start = open + 30 * Math.floor(r() * Math.max(1, (close - open) / 30 - 1)), len = [30, 45, 60][Math.floor(r() * 3)];
    if (start + len <= close && !out.some(([a, e]) => start < e && a < start + len)) out.push([start, start + len]);
  }
  return out;
}
export function freeTimes(page, bookings, spId, svcId, date, { exclude = null } = {}) {
  const sp = page.specialists.find(p => p.id === spId), svc = page.services.find(s => s.id === svcId);
  if (!sp || !svc || !sp.days?.[String(weekday(date))]) return [];
  const h = sp.hours || page.hours || { from: '09:00', to: '18:00' }, open = toMin(h.from), close = toMin(h.to), dur = Math.max(5, Number(svc.duration) || 30);
  const tz = page.timezone || deviceZone(), today = ymdIn(new Date(), tz);
  if (date < today) return [];
  const busy = bookings.filter(b => b.sp === spId && b.date === date && b.status !== 'cancelled' && b.id !== exclude).map(b => [toMin(b.time), toMin(b.time) + b.dur]);
  if (page.busy) busy.push(...busyFor(spId, date, open, close));
  const starts = new Set();
  for (let m = open; m + dur <= close; m += 30) starts.add(m);
  for (const [, e] of busy) if (e >= open && e + dur <= close) starts.add(e);
  const earliest = date === today ? nowMinutesIn(tz) + 15 : -1;
  return [...starts].filter(m => m >= earliest && !busy.some(([a, e]) => m < e && a < m + dur)).sort((a, b) => a - b).map(toHm);
}
const code6 = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, '0');
// The demos' data source for runBooking: everything happens in this page.
function demoSource(page, list, add) {
  let pending = null;
  return {
    mode: 'demo', verify: 'demo',
    times: async (sp, svc, date) => freeTimes(page(), list(), sp, svc, date),
    phone: async phone => { pending = { phone, code: code6(), tries: 0 }; return { state: 'code_sent', resend_in: 0, demoCode: pending.code }; },
    code: async code => {
      if (!pending) throw { code: 'codeExpired' };
      pending.tries++;
      if (code !== pending.code) { const left = 5 - pending.tries; if (left <= 0) { pending = null; throw { code: 'codeExpired' }; } throw { code: 'wrongCode', left }; }
      // A number that booked before in this demo is greeted by its saved name, as on a real page.
      const before = list().filter(b => b.phone === pending.phone && b.name).at(-1);
      pending = null;
      return { name: before ? before.name : null };
    },
    book: async p => {
      const pg = page(), svc = pg.services.find(s => s.id === p.service), sp = pg.specialists.find(x => x.id === p.specialist);
      if (!svc || !sp || !freeTimes(pg, list(), p.specialist, p.service, p.date).includes(p.time)) throw { code: 'slotTaken' };
      const b = { id: 'b' + rid().slice(0, 12), sp: p.specialist, svc: p.service, date: p.date, time: p.time, dur: Math.max(5, Number(svc.duration) || 30), name: p.name, phone: p.phone, note: p.note || '', status: 'pending', source: 'test', at: Date.now() };
      add(b);
      return { id: b.id, booking: { status: 'pending', date: b.date, time: b.time, service: svc.name, specialist: sp.name, name: b.name, verified: true } };
    },
  };
}
// One demo booking as its private link shows it.
function demoManage(page, b) {
  const pg = page, svc = pg.services.find(s => s.id === b.svc), sp = pg.specialists.find(x => x.id === b.sp);
  const tz = pg.timezone || deviceZone(), today = ymdIn(new Date(), tz);
  const days = Math.round((Date.parse(b.date + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
  const startsIn = days * 1440 + toMin(b.time) - nowMinutesIn(tz);   // minutes until the appointment starts
  const started = startsIn <= 0;
  const limit = (pg.settings?.cancel_limit_hours ?? 2) * 60;
  const until = new Date(Date.now() + (startsIn - limit) * 60000);
  return { valid: b.status !== 'cancelled' && !started, reason: b.status === 'cancelled' ? 'cancelled' : started ? 'started' : '', status: b.status, service: svc?.name || '', specialist: sp?.name || '', date: b.date, time: b.time, name: b.name,
    business: { name: pg.name, logo_url: pg.logo_url || '', color: pg.color || '' }, cancellation_allowed: pg.settings?.allow_cancellation !== false, can_cancel: startsIn > limit, cancel_until: until.toISOString() };
}

// ── /try ──────────────────────────────────────────────────────────────────────────────────────────────────────────
export const tryPage = c => `<section class="book-shell try-shell" id="try-root"><p class="book-loading" role="status">${BL(c, 'loading')}</p></section>`;
export function bindTry(c) {
  const root = document.getElementById('try-root'); if (!root) return;
  const which = location.pathname.replace(/\/$/, '');
  if (which === '/try/customer') return customerDemo(c, root);
  if (which === '/try/business') return builder(c, root);
  const shot = (id, cls) => `<span class="try-shot ${cls}"><img src="/assets/img/showcase/${id}-${c.lang}-${cls === 'is-tablet' ? 640 : 360}.webp" alt="" loading="lazy" decoding="async"></span>`;
  const li = k => `<li>${ico(ICON.check, 16)}<span>${T(c, k)}</span></li>`;
  root.innerHTML = `<div class="try"><header class="try-head"><p class="eyebrow">${T(c, 'tryEyebrow')}</p><h1>${T(c, 'tryTitle')}</h1><p class="lead">${T(c, 'tryLead')}</p></header>
    <div class="try-grid">
      <a class="try-card" href="/try/customer"><div class="try-visual">${shot('book', 'is-phone')}${shot('requested', 'is-phone is-back')}</div><div class="try-copy"><h2>${T(c, 'tryA')}</h2><p>${T(c, 'tryABody')}</p><ul class="try-points">${li('tryA1')}${li('tryA2')}${li('tryA3')}</ul><span class="btn primary">${T(c, 'tryStartA')}</span></div></a>
      <a class="try-card" href="/try/business"><div class="try-visual">${shot('tablet-schedule', 'is-tablet')}</div><div class="try-copy"><h2>${T(c, 'tryB')}</h2><p>${T(c, 'tryBBody')}</p><ul class="try-points">${li('tryB1')}${li('tryB2')}${li('tryB3')}</ul><span class="btn primary">${T(c, 'tryStartB')}</span></div></a>
    </div><p class="try-foot">${T(c, 'tryFoot')}</p></div>`;
}

// ── Book as a customer ───────────────────────────────────────────────────────────────────────────────────────────
function customerDemo(c, root) {
  const page = demoBusiness(c.lang);
  const bookings = [];
  root.innerHTML = `<div class="demo-bar" role="note"><span class="book-demo-tag">${BL(c, 'demoBadge')}</span><span>${T(c, 'demoBar')}</span><a class="demo-exit" href="/try">${T(c, 'exitDemo')}</a></div><div id="demo-book"></div>`;
  const host = root.querySelector('#demo-book');
  let ui;
  const openLink = (r, back) => {
    const b = bookings.find(x => x.id === r.id); if (!b) return;
    const draw = () => manageView(c, host, demoManage(page, b), { demo: true, onBack: () => { ui.repaint(); back?.(); },
      onBookAgain: () => ui.reset(),
      onCancel: async () => { b.status = 'cancelled'; c.toast(BL(c, 'mCancelled'), 'success'); draw(); } });
    draw(); host.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  };
  ui = runBooking(c, host, page, demoSource(() => page, () => bookings, b => bookings.push(b)), { country: c.lang === 'he' ? 'IL' : 'PS', onOpenLink: openLink,
    afterDone: `<a class="btn" href="/try/business">${T(c, 'buildOwn')}</a>` });
}

// ── Build your business page ─────────────────────────────────────────────────────────────────────────────────────
const KEY = 'meton_demo_v2', OLD = 'meton_draft_v1';
const uid = p => p + Math.random().toString(36).slice(2, 8);
function freshDraft(c, category = '') {
  return { v: 2, step: 1, name: '', category, services: category ? exampleServices(category, c.lang) : [], servicesFor: category, solo: true, owner: '', team: [],
    hours: defaultHours(c.lang), look: { color: COLORS[0], logo: '', about: '', address: '' }, bookings: [], samples: true, sampleSig: '', currency: demoCurrency(c.lang) };
}
// Builder drafts from the first version (single form) are carried over.
function fromOld(c, o) {
  const d = freshDraft(c);
  d.name = String(o.name || ''); d.category = 'other';
  d.services = (o.services || []).filter(s => s && s.id).map(s => ({ id: String(s.id), name: String(s.name || ''), duration: Number(s.duration) || 30, price: s.price === '' || s.price == null ? '' : Number(s.price) }));
  const team = (o.team || []).filter(t => t && String(t.name || '').trim());
  if (team.length) { d.solo = false; d.team = team.map(t => ({ id: String(t.id), name: String(t.name), role: String(t.role || ''), services: (t.services || []).map(String) })); }
  if (o.hours) d.hours = { from: o.hours.from || '09:00', to: o.hours.to || '18:00', days: { ...defaultHours(c.lang).days, ...(o.hours.days || {}) } };
  if (/^#[0-9a-f]{6}$/i.test(o.color || '')) d.look.color = o.color;
  d.step = d.name && d.services.length ? 2 : 1;
  return d;
}
function loadDraft(c) {
  try { const d = JSON.parse(store(KEY) || 'null'); if (d && d.v === 2 && Array.isArray(d.services)) return { ...freshDraft(c), ...d, look: { ...freshDraft(c).look, ...(d.look || {}) } }; } catch {}
  try { const o = JSON.parse(store(OLD) || 'null'); if (o && Array.isArray(o.services)) return fromOld(c, o); } catch {}
  return null;
}
// The business the preview shows, from the draft.
function draftPage(c, d) {
  const cat = categoryOf(d.category);
  const services = d.services.filter(s => String(s.name || '').trim()).map(s => ({ id: s.id, name: s.name.trim(), duration: Math.max(5, Math.min(480, Number(s.duration) || 30)), price: s.price === '' || s.price == null ? null : Math.max(0, Number(s.price) || 0) }));
  const ids = services.map(s => s.id);
  const team = d.solo ? [] : d.team.filter(t => String(t.name || '').trim());
  const specialists = team.length ? team.map((t, i) => ({ id: t.id, name: t.name.trim(), specialty: String(t.role || '').trim(), services: t.services.filter(x => ids.includes(x)), days: d.hours.days, color: TEAM_COLORS[i % TEAM_COLORS.length] }))
    : [{ id: 'me', name: (d.owner || d.name || T(c, 'you')).trim(), specialty: cat ? pick3(cat.name, c.lang) : '', services: ids, days: d.hours.days, color: TEAM_COLORS[0] }];
  return { name: d.name.trim() || T(c, 'bizName'), slug: 'preview', code: 'PREVIEW', timezone: '', category: cat ? pick3(cat.name, c.lang) : '', about: d.look.about, address: d.look.address, color: d.look.color, logo_url: d.look.logo,
    settings: { open: true, online_booking: true, window_days: 14, show_prices: true, currency: d.currency || demoCurrency(c.lang), new_customers: true, allow_cancellation: true, cancel_limit_hours: 2 },
    services, specialists, hours: { from: d.hours.from, to: d.hours.to } };
}
// What /api/drafts keeps for the account (the server cleans it again): a solo business is one specialist, the owner.
function serverDraft(c, d) {
  const p = draftPage(c, d);
  return { name: d.name.trim(), kind: p.category, color: d.look.color, services: p.services.map(s => ({ id: s.id, name: s.name, duration: s.duration, price: s.price ?? '' })),
    team: p.specialists.map(s => ({ id: s.id, name: s.name, role: s.specialty, services: s.services })), hours: d.hours };
}
function builder(c, root) {
  const q = new URLSearchParams(location.search);
  let d = loadDraft(c);
  const fresh = !d;
  if (!d) d = freshDraft(c, categoryOf(q.get('category')) ? q.get('category') : '');
  else if (categoryOf(q.get('category')) && !d.name && d.step === 1) { d.category = q.get('category'); d.services = exampleServices(d.category, c.lang); d.servicesFor = d.category; }
  const save = () => store(KEY, JSON.stringify(d));
  save();
  const signedIn = () => !!c.state.user;
  async function saveToAccount(quiet = false) {
    try { await c.api('/api/drafts', { method: 'POST', body: JSON.stringify({ draft: serverDraft(c, d) }) }); d.savedAt = Date.now(); save(); c.toast(T(c, 'savedAccount'), 'success'); return true; }
    catch { if (!quiet) c.toast(BL(c, 'tryAgain'), 'error'); return false; }
  }
  // Back from creating an account or logging in to save: save now.
  if (q.get('save') === '1') { history.replaceState(history.state, '', '/try/business'); if (signedIn()) saveToAccount(true); }
  // Signed in with a page saved on the account and nothing in this browser: continue from the saved one.
  if (fresh && signedIn()) c.api('/api/drafts').then(r => {
    const s = r?.draft; if (!s || !Array.isArray(s.services) || !root.isConnected || d.name) return;
    const o = fromOld(c, s); o.step = 2; o.category = CATEGORIES.find(k => pick3(k.name, c.lang) === s.kind || k.name.includes(s.kind))?.key || 'other'; d = o; save(); paint();
  }).catch(() => {});

  let board = null, ui = null, pvTab = 'page', samplesFor = '';
  const page = () => draftPage(c, d);
  const sig = () => JSON.stringify([d.services.map(s => [s.id, s.duration]), d.solo, d.team.map(t => [t.id, t.services]), d.hours]);
  // A few example customers, so the schedule looks like a working day (shown as "Sample", can be hidden).
  function seedSamples() {
    if (d.sampleSig === sig() && d.bookings.some(b => b.source === 'sample')) return;
    d.bookings = d.bookings.filter(b => b.source !== 'sample');
    const p = page(), people = SAMPLE_PEOPLE[c.lang] || SAMPLE_PEOPLE.en, today = ymdIn(new Date(), deviceZone());
    let n = 0;
    for (let day = 0; day < 4; day++) {
      for (const sp of p.specialists) {
        const date = bookableDays(p, sp, today).find(x => x >= addDays(today, day));
        if (!date || date !== addDays(today, day)) continue;
        for (let k = 0; k < 2; k++) {
          const svc = p.services.filter(s => sp.services.includes(s.id))[(n + k) % Math.max(1, sp.services.length)]; if (!svc) continue;
          const free = freeTimes(p, d.bookings, sp.id, svc.id, date); if (!free.length) continue;
          const time = free[Math.min(free.length - 1, Math.floor(free.length * (k ? .7 : .25)))];
          const [name, phone] = people[n % people.length];
          d.bookings.push({ id: 'x' + rid().slice(0, 12), sp: sp.id, svc: svc.id, date, time, dur: svc.duration, name, phone, note: '', status: n === 1 ? 'pending' : 'confirmed', source: 'sample', at: 0 });
          n++;
        }
      }
    }
    d.sampleSig = sig(); save();
  }
  const steps = () => `<ol class="wiz-steps" aria-label="${T(c, 'stepOf', { n: String(d.step) })}">${[['s1', 1], ['s2', 2], ['s3', 3]].map(([k, n]) => `<li class="${n < d.step ? 'is-done' : n === d.step ? 'is-current' : ''}"${n === d.step ? ' aria-current="step"' : ''}>${n < d.step ? `<button type="button" data-step="${n}">` : '<span>'}<i>${n < d.step ? ico(ICON.check, 13) : n}</i>${T(c, k)}${n < d.step ? '</button>' : '</span>'}</li>`).join('')}</ol>`;
  const head = () => `<header class="wiz-head"><p class="eyebrow">${T(c, 'wizEyebrow')}</p><h1>${T(c, 's' + d.step + 'Title')}</h1><p class="lead">${T(c, 's' + d.step + 'Lead')}</p></header>`;
  const errBox = k => k ? `<p class="book-error" role="alert">${c.esc(T(c, k))}</p>` : '';
  let err1 = '', err2 = '';
  function step1() {
    return `<form class="wiz-card" id="wz1" novalidate>
      <label class="book-field"><span>${T(c, 'bizName')}</span><input name="name" maxlength="60" autocomplete="organization" placeholder="${c.esc(T(c, 'bizNamePh'))}" value="${c.esc(d.name)}" required></label>
      <fieldset class="wiz-cats"><legend>${T(c, 'catLegend')}</legend><div class="wiz-cat-grid">${CATEGORIES.map(k => `<label class="wiz-cat"><input type="radio" name="category" value="${k.key}"${d.category === k.key ? ' checked' : ''}><span class="wiz-cat-ico">${ico(k.icon, 22)}</span><b>${c.esc(pick3(k.name, c.lang))}</b><small>${c.esc(pick3(k.examples, c.lang))}</small></label>`).join('')}</div></fieldset>
      ${errBox(err1)}<div class="wiz-actions"><button class="btn primary" type="submit">${T(c, 'continue')}${ico('<path d="m9 5.5 6.5 6.5L9 18.5"/>', 16)}</button></div></form>`;
  }
  function step2() {
    const cur = d.currency || demoCurrency(c.lang);
    const named = d.services.filter(s => String(s.name || '').trim());
    const dayName = k => { try { return new Intl.DateTimeFormat(c.lang === 'he' ? 'he-IL' : c.lang === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 10, 1 + Number(k)))); } catch { return k; } };
    const order = [0, 1, 2, 3, 4, 5, 6].map(i => String((weekStart(c.lang) + i) % 7));
    return `<form class="wiz-card" id="wz2" novalidate>
      <section class="wiz-sec"><div class="wiz-sec-head"><h2>${T(c, 'svcTitle')}</h2><p>${T(c, 'svcLead')}</p></div>
        <div class="wiz-svcs">${d.services.map(s => `<div class="wiz-svc" data-svc="${c.esc(s.id)}"><label class="wiz-svc-name"><span class="sr-only">${T(c, 'svcName')}</span><input data-f="name" maxlength="60" placeholder="${c.esc(T(c, 'svcName'))}" value="${c.esc(s.name)}"></label>
          <label class="wiz-mini"><span>${T(c, 'duration')}</span><select data-f="duration">${[...new Set([...DURATIONS, Number(s.duration) || 30])].sort((a, b) => a - b).map(m => `<option value="${m}"${Number(s.duration) === m ? ' selected' : ''}>${m} ${BL(c, 'minutes')}</option>`).join('')}</select></label>
          <label class="wiz-mini"><span>${T(c, 'price')} (${cur === 'USD' ? '$' : '₪'})</span><input data-f="price" type="number" min="0" max="1000000" step="1" inputmode="decimal" dir="ltr" value="${c.esc(String(s.price ?? ''))}" placeholder="0"></label>
          <button type="button" class="wiz-del" data-del-svc="${c.esc(s.id)}" aria-label="${T(c, 'remove')}: ${c.esc(s.name)}">${ico('<path d="M6 6l12 12M18 6 6 18"/>', 18)}</button></div>`).join('')}</div>
        <button type="button" class="btn small" id="wz-add-svc">${ico('<path d="M12 5v14M5 12h14"/>', 15)}${T(c, 'addSvc')}</button></section>
      <section class="wiz-sec"><div class="wiz-sec-head"><h2>${T(c, 'whoTitle')}</h2></div>
        <div class="wiz-who" role="radiogroup"><label class="wiz-opt"><input type="radio" name="solo" value="1"${d.solo ? ' checked' : ''}><span><b>${T(c, 'solo')}</b><small>${T(c, 'soloSub')}</small></span></label><label class="wiz-opt"><input type="radio" name="solo" value="0"${d.solo ? '' : ' checked'}><span><b>${T(c, 'team')}</b><small>${T(c, 'teamSub')}</small></span></label></div>
        ${d.solo ? `<label class="book-field"><span>${T(c, 'ownerName')}</span><input name="owner" maxlength="60" autocomplete="name" placeholder="${c.esc(d.name || T(c, 'you'))}" value="${c.esc(d.owner)}"></label>`
          : `<div class="wiz-team">${d.team.map(t => `<div class="wiz-person" data-team="${c.esc(t.id)}"><div class="wiz-person-row"><input data-f="name" maxlength="60" placeholder="${c.esc(T(c, 'personName'))}" aria-label="${T(c, 'personName')}" value="${c.esc(t.name)}"><input data-f="role" maxlength="60" placeholder="${c.esc(T(c, 'personRole'))}" aria-label="${T(c, 'personRole')}" value="${c.esc(t.role)}"><button type="button" class="wiz-del" data-del-team="${c.esc(t.id)}" aria-label="${T(c, 'remove')}">${ico('<path d="M6 6l12 12M18 6 6 18"/>', 18)}</button></div>
            <div class="wiz-offers"><span>${T(c, 'offers')}:</span>${named.map(s => `<label><input type="checkbox" data-offer="${c.esc(s.id)}"${t.services.includes(s.id) ? ' checked' : ''}> ${c.esc(s.name)}</label>`).join('')}</div></div>`).join('')}</div>
            <button type="button" class="btn small" id="wz-add-team">${ico('<path d="M12 5v14M5 12h14"/>', 15)}${T(c, 'addPerson')}</button>`}</section>
      <section class="wiz-sec"><div class="wiz-sec-head"><h2>${T(c, 'hoursTitle')}</h2><p>${T(c, 'hoursLead')}</p></div>
        <div class="wiz-days">${order.map(k => `<label class="wiz-day"><input type="checkbox" data-day="${k}"${d.hours.days[k] ? ' checked' : ''}><span>${c.esc(dayName(k))}</span></label>`).join('')}</div>
        <div class="wiz-hours"><label class="book-field"><span>${T(c, 'opens')}</span><input type="time" name="from" step="900" dir="ltr" value="${c.esc(d.hours.from)}"></label><label class="book-field"><span>${T(c, 'closes')}</span><input type="time" name="to" step="900" dir="ltr" value="${c.esc(d.hours.to)}"></label></div></section>
      <details class="wiz-sec wiz-more"${d.look.logo || d.look.about || d.look.address || d.look.color !== COLORS[0] ? ' open' : ''}><summary><span><b>${T(c, 'moreTitle')}</b><small>${T(c, 'moreLead')}</small></span></summary>
        <div class="wiz-more-body"><fieldset class="wiz-colors"><legend>${T(c, 'color')}</legend>${COLORS.map(x => `<label class="wiz-swatch" style="--sw:${x}"><input type="radio" name="color" value="${x}"${d.look.color.toLowerCase() === x.toLowerCase() ? ' checked' : ''}><span class="sr-only">${x}</span></label>`).join('')}<label class="wiz-swatch is-custom"><input type="color" name="customColor" value="${c.esc(d.look.color)}" aria-label="${T(c, 'customColor')}"></label></fieldset>
          <div class="wiz-logo"><span class="wiz-logo-prev">${d.look.logo ? `<img src="${c.esc(d.look.logo)}" alt="">` : c.esc(initials(d.name || '?'))}</span><label class="btn small"><input type="file" id="wz-logo" accept="image/png,image/jpeg,image/webp" hidden>${T(c, 'logoBtn')}</label>${d.look.logo ? `<button type="button" class="btn small ghost" id="wz-logo-x">${T(c, 'logoRemove')}</button>` : ''}</div>
          <label class="book-field"><span>${T(c, 'about')}</span><textarea name="about" rows="2" maxlength="160" placeholder="${c.esc(T(c, 'aboutPh'))}">${c.esc(d.look.about)}</textarea></label>
          <label class="book-field"><span>${T(c, 'address')}</span><input name="address" maxlength="80" autocomplete="street-address" value="${c.esc(d.look.address)}"></label></div></details>
      ${errBox(err2)}<div class="wiz-actions"><button type="button" class="btn ghost" data-step="1">${T(c, 'back')}</button><button class="btn primary" type="submit">${T(c, 'preview')}${ico('<path d="m9 5.5 6.5 6.5L9 18.5"/>', 16)}</button></div></form>`;
  }
  function step3() {
    const flagged = draftFlags(d).length > 0;
    const pend = d.bookings.filter(b => b.status === 'pending' && (d.samples || b.source !== 'sample')).length;
    return `<div class="pv${pvTab === 'dash' ? ' show-dash' : ''}">
      <p class="pv-note">${ico(ICON.shield, 18)}<span><b>${T(c, 'pvNote')}</b> ${T(c, 'pvNote2')}</span></p>${flagged ? `<p class="book-hint">${T(c, 'flagged')}</p>` : ''}
      <div class="pv-switch" role="tablist"><button type="button" role="tab" data-pv="page" aria-selected="${pvTab === 'page'}">${T(c, 'pvPage')}</button><button type="button" role="tab" data-pv="dash" aria-selected="${pvTab === 'dash'}">${T(c, 'pvDash')}${pend ? ` <span class="db-count">${pend}</span>` : ''}</button></div>
      <div class="pv-grid"><section class="pv-page" aria-label="${T(c, 'pvPage')}"><p class="pv-cap">${T(c, 'pvPageCap')}</p><div class="pv-device"><div class="pv-bar" aria-hidden="true"><i></i><span dir="ltr">${c.esc(location.host)}/s/${c.esc((d.name || 'business').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'business')}</span></div><div class="pv-screen" id="pv-booking"></div></div></section>
        <section class="pv-dash" aria-label="${T(c, 'pvDash')}"><p class="pv-cap">${T(c, 'pvDashCap')}</p><div id="pv-board"></div></section></div>
      <section class="pv-cta"><div><h2>${T(c, 'ctaTitle')}</h2><p>${T(c, 'ctaText')}</p></div><div class="pv-cta-actions"><a class="btn primary" href="/plans?from=builder">${T(c, 'ctaPlans')}</a><button type="button" class="btn" id="pv-save">${T(c, 'ctaSave')}</button><button type="button" class="btn ghost" data-step="2">${T(c, 'ctaEdit')}</button><button type="button" class="btn ghost" id="pv-reset">${T(c, 'ctaReset')}</button></div></section></div>`;
  }
  function paint() {
    root.innerHTML = `<div class="wiz${d.step === 3 ? ' is-preview' : ''}">${head()}${steps()}${d.step === 1 ? step1() : d.step === 2 ? step2() : step3()}</div>`;
    wire();
  }
  const toStep = n => { d.step = n; err1 = err2 = ''; save(); paint(); root.querySelector('.wiz-head h1')?.focus?.(); window.scrollTo({ top: 0, behavior: 'instant' }); };
  function valid1() { if (String(d.name).trim().length < 2) return 'bizNameErr'; if (!categoryOf(d.category)) return 'catErr'; return ''; }
  function valid2() {
    if (!d.services.some(s => String(s.name || '').trim())) return 'svcErr';
    if (!d.solo) { const p = draftPage(c, d); if (!d.team.some(t => String(t.name || '').trim()) || !p.specialists.some(s => s.services.length)) return 'teamErr'; }
    if (!Object.values(d.hours.days).some(Boolean) || toMin(d.hours.to) <= toMin(d.hours.from)) return 'hoursErr';
    return '';
  }
  async function pickCategory(key) {
    if (key === d.category) return;
    const touched = d.services.length && JSON.stringify(d.services.map(s => [s.name, Number(s.duration), String(s.price)])) !== JSON.stringify(exampleServices(d.servicesFor || d.category || 'other', c.lang).map(s => [s.name, s.duration, String(s.price)]));
    d.category = key;
    if (!d.services.length || !touched) { d.services = exampleServices(key, c.lang); d.servicesFor = key; d.team.forEach(t => t.services = d.services.map(s => s.id)); }
    else if (await c.confirmDialog({ title: pick3(categoryOf(key).name, c.lang), body: T(c, 'replaceAsk', { cat: pick3(categoryOf(key).name, c.lang) }), confirm: T(c, 'replace'), cancel: T(c, 'keepMine') })) {
      d.services = exampleServices(key, c.lang); d.servicesFor = key; d.team.forEach(t => t.services = d.services.map(s => s.id));
    }
    save();
  }
  async function loadLogo(file) {
    if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) { c.toast(T(c, 'logoBad'), 'error'); return; }
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const s = Math.min(1, 256 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round(img.width * s)); cv.height = Math.max(1, Math.round(img.height * s));
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      d.look.logo = cv.toDataURL('image/webp', .85); save(); paint();
    } catch { c.toast(T(c, 'logoBad'), 'error'); } finally { URL.revokeObjectURL(url); }
  }
  function wire() {
    root.querySelectorAll('[data-step]').forEach(b => b.addEventListener('click', () => { const n = Number(b.dataset.step); if (n === 3 && (valid1() || valid2())) return; toStep(n); }));
    const f1 = root.querySelector('#wz1');
    if (f1) {
      f1.elements.name.addEventListener('input', e => { d.name = e.target.value; save(); });
      f1.querySelectorAll('input[name=category]').forEach(r => r.addEventListener('change', () => pickCategory(r.value)));
      f1.addEventListener('submit', async e => { e.preventDefault(); d.name = f1.elements.name.value.replace(/\s+/g, ' ').trim(); err1 = valid1(); if (err1) { paint(); root.querySelector(err1 === 'catErr' ? '.wiz-cat input' : 'input[name=name]')?.focus(); return; } toStep(2); });
      if (!d.name) f1.elements.name.focus();
    }
    const f2 = root.querySelector('#wz2');
    if (f2) {
      let t = 0; const later = () => { clearTimeout(t); t = setTimeout(save, 300); };
      f2.querySelectorAll('[data-svc]').forEach(row => row.querySelectorAll('[data-f]').forEach(inp => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => { const s = d.services.find(x => x.id === row.dataset.svc); s[inp.dataset.f] = inp.dataset.f === 'duration' ? Number(inp.value) : inp.dataset.f === 'price' ? (inp.value === '' ? '' : Number(inp.value)) : inp.value; later(); })));
      f2.querySelectorAll('[data-del-svc]').forEach(b => b.addEventListener('click', () => { d.services = d.services.filter(s => s.id !== b.dataset.delSvc); d.team.forEach(m => m.services = m.services.filter(x => x !== b.dataset.delSvc)); save(); paint(); }));
      f2.querySelector('#wz-add-svc')?.addEventListener('click', () => { const id = uid('s'); d.services.push({ id, name: '', duration: 30, price: '' }); d.team.forEach(m => m.services.push(id)); save(); paint(); root.querySelector(`[data-svc="${id}"] input`)?.focus(); });
      f2.querySelectorAll('input[name=solo]').forEach(r => r.addEventListener('change', () => { d.solo = r.value === '1'; if (!d.solo && !d.team.length) d.team = [{ id: uid('t'), name: d.owner || '', role: '', services: d.services.map(s => s.id) }, { id: uid('t'), name: '', role: '', services: d.services.map(s => s.id) }]; save(); paint(); }));
      f2.elements.owner?.addEventListener('input', e => { d.owner = e.target.value; later(); });
      f2.querySelectorAll('[data-team]').forEach(row => {
        row.querySelectorAll('[data-f]').forEach(inp => inp.addEventListener('input', () => { const m = d.team.find(x => x.id === row.dataset.team); m[inp.dataset.f] = inp.value; later(); }));
        row.querySelectorAll('[data-offer]').forEach(cb => cb.addEventListener('change', () => { const m = d.team.find(x => x.id === row.dataset.team); m.services = cb.checked ? [...new Set([...m.services, cb.dataset.offer])] : m.services.filter(x => x !== cb.dataset.offer); save(); }));
      });
      f2.querySelectorAll('[data-del-team]').forEach(b => b.addEventListener('click', () => { d.team = d.team.filter(m => m.id !== b.dataset.delTeam); if (!d.team.length) d.solo = true; save(); paint(); }));
      f2.querySelector('#wz-add-team')?.addEventListener('click', () => { const id = uid('t'); d.team.push({ id, name: '', role: '', services: d.services.map(s => s.id) }); save(); paint(); root.querySelector(`[data-team="${id}"] input`)?.focus(); });
      f2.querySelectorAll('[data-day]').forEach(cb => cb.addEventListener('change', () => { d.hours.days[cb.dataset.day] = cb.checked; save(); }));
      f2.elements.from.addEventListener('change', e => { d.hours.from = e.target.value || '09:00'; save(); });
      f2.elements.to.addEventListener('change', e => { d.hours.to = e.target.value || '18:00'; save(); });
      f2.querySelectorAll('input[name=color]').forEach(r => r.addEventListener('change', () => { d.look.color = r.value; save(); f2.elements.customColor.value = r.value; }));
      f2.elements.customColor?.addEventListener('input', e => { d.look.color = e.target.value; f2.querySelectorAll('input[name=color]').forEach(r => r.checked = false); save(); });
      f2.querySelector('#wz-logo')?.addEventListener('change', e => loadLogo(e.target.files[0]));
      f2.querySelector('#wz-logo-x')?.addEventListener('click', () => { d.look.logo = ''; save(); paint(); });
      f2.elements.about?.addEventListener('input', e => { d.look.about = e.target.value; later(); });
      f2.elements.address?.addEventListener('input', e => { d.look.address = e.target.value; later(); });
      f2.addEventListener('submit', e => { e.preventDefault(); err2 = valid2(); if (err2) { paint(); root.querySelector('.book-error')?.scrollIntoView({ block: 'center' }); return; } if (valid1()) return toStep(1); toStep(3); });
    }
    if (d.step === 3) mountPreview();
  }
  function mountPreview() {
    if (valid1() || valid2()) { d.step = valid1() ? 1 : 2; save(); return paint(); }
    seedSamples();
    const list = () => d.bookings;
    board = mountBoard(c, root.querySelector('#pv-board'), { page, bookings: list, save: () => { save(); updateBadge(); }, freeTimes, samples: () => d.samples, setSamples: on => { d.samples = on; save(); updateBadge(); }, weekStart: weekStart(c.lang), onChange: updateBadge });
    const bookingHost = root.querySelector('#pv-booking');
    ui = runBooking(c, bookingHost, page(), demoSource(page, list, b => { d.bookings.push(b); save(); }), { country: c.lang === 'he' ? 'IL' : 'PS', scroll: false,
      doneExtra: `<button type="button" class="btn primary book-see-dash" id="pv-see-dash">${T(c, 'seeDash')}</button>`,
      onBooked: r => { board.show(r.id); updateBadge(); c.toast(T(c, 'testAdded'), 'success'); },
      onOpenLink: (r, back) => { const b = d.bookings.find(x => x.id === r.id); if (!b) return; const draw = () => manageView(c, bookingHost, demoManage(page(), b), { demo: true, onBack: () => { ui.repaint(); back?.(); }, onBookAgain: () => ui.reset(), onCancel: async () => { b.status = 'cancelled'; save(); board.refresh(); updateBadge(); c.toast(BL(c, 'mCancelled'), 'success'); draw(); } }); draw(); },
      onPaint: host => host.querySelector('#pv-see-dash')?.addEventListener('click', () => { setTab('dash'); root.querySelector('.pv-dash')?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }) });
    root.querySelectorAll('[data-pv]').forEach(b => b.addEventListener('click', () => setTab(b.dataset.pv)));
    root.querySelector('#pv-save')?.addEventListener('click', saveProgress);
    root.querySelector('#pv-reset')?.addEventListener('click', async () => { if (await c.confirmDialog({ title: T(c, 'ctaReset'), body: T(c, 'resetAsk'), confirm: T(c, 'ctaReset'), cancel: T(c, 'back'), tone: 'danger' })) { d = freshDraft(c); save(); paint(); window.scrollTo({ top: 0, behavior: 'instant' }); } });
  }
  function setTab(t) { pvTab = t; root.querySelector('.pv')?.classList.toggle('show-dash', t === 'dash'); root.querySelectorAll('[data-pv]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.pv === t))); }
  function updateBadge() {
    const b = root.querySelector('[data-pv="dash"]'); if (!b) return;
    const n = d.bookings.filter(x => x.status === 'pending' && (d.samples || x.source !== 'sample')).length;
    b.innerHTML = `${T(c, 'pvDash')}${n ? ` <span class="db-count">${n}</span>` : ''}`;
  }
  async function saveProgress() {
    if (signedIn()) return saveToAccount();
    const wrap = document.createElement('div'); wrap.className = 'modal-root';
    wrap.innerHTML = `<div class="modal-backdrop" data-close></div><div class="modal pv-save-modal" role="dialog" aria-modal="true" aria-labelledby="pv-save-title"><h2 id="pv-save-title">${T(c, 'saveTitle')}</h2><p>${T(c, 'saveBody')}</p><p class="book-fine">${T(c, 'savedLocal')}</p>
      <div class="modal-actions"><button type="button" class="btn ghost" data-close>${BL(c, 'notNow')}</button><a class="btn" href="/login?next=${encodeURIComponent('/try/business?save=1')}">${T(c, 'logIn')}</a><a class="btn primary" href="/register?next=${encodeURIComponent('/try/business?save=1')}">${T(c, 'createAccount')}</a></div></div>`;
    document.body.appendChild(wrap); document.body.classList.add('modal-open'); requestAnimationFrame(() => wrap.classList.add('is-open'));
    const close = () => { wrap.classList.remove('is-open'); document.body.classList.remove('modal-open'); setTimeout(() => wrap.remove(), 200); };
    wrap.addEventListener('click', e => { if (e.target.closest('[data-close]')) close(); if (e.target.closest('a')) close(); });
    wrap.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    setTimeout(() => wrap.querySelector('.btn.primary')?.focus(), 30);
  }
  paint();
}
