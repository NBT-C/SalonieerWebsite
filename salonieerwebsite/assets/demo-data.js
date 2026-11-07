// Try METON Free (2026-11-07): the content of both demos, in English, Arabic and Hebrew.
//  * CATEGORIES: the business types a visitor picks in the page builder, each with example services they can edit,
//    replace or delete. Prices are examples in the visitor's currency (ILS for Arabic and Hebrew, USD for English).
//  * DEMO_BUSINESS: the ready-made example business of "Book as a customer" (the same business as on the home page's
//    app screens). Everything here is made up.
// Nothing in this file is sent anywhere.

const T = (lang, en, ar, he) => ({ en, ar, he })[lang] || en;

// [key, icon (24×24 stroke paths), name, examples]
export const CATEGORIES = [
  { key: 'beauty', icon: '<path d="M6 21c0-4 2.7-6 6-6s6 2 6 6"/><circle cx="12" cy="8" r="4"/><path d="M15.5 4.5 18 2M17 6h3"/>',
    name: ['Beauty & Personal Care', 'التجميل والعناية الشخصية', 'יופי וטיפוח'],
    examples: ['Salons, barbers, spas, nail and make-up studios', 'صالونات وحلاقون وسبا واستوديوهات أظافر ومكياج', 'מספרות, סלונים, ספא, סטודיו לציפורניים ולאיפור'],
    services: [
      [['Haircut & styling', 'قص وتصفيف الشعر', 'תספורת ועיצוב'], 45, 30, 100],
      [['Hair colouring', 'صبغة الشعر', 'צבע לשיער'], 90, 70, 250],
      [['Manicure', 'مانيكير', 'מניקור'], 40, 25, 90],
      [['Facial treatment', 'تنظيف البشرة', 'טיפול פנים'], 60, 50, 180]] },
  { key: 'health', icon: '<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/><path d="M12 9v5M9.5 11.5h5"/>',
    name: ['Clinics & Healthcare', 'العيادات والرعاية الصحية', 'קליניקות ובריאות'],
    examples: ['Clinics, dentists, physiotherapy, psychologists, nutritionists', 'عيادات وأطباء أسنان وعلاج طبيعي وأخصائيون نفسيون وأخصائيو تغذية', 'קליניקות, רופאי שיניים, פיזיותרפיה, פסיכולוגים, תזונאים'],
    services: [
      [['First consultation', 'استشارة أولى', 'ייעוץ ראשוני'], 30, 50, 180],
      [['Follow-up visit', 'زيارة متابعة', 'ביקור מעקב'], 20, 30, 120],
      [['Physiotherapy session', 'جلسة علاج طبيعي', 'טיפול פיזיותרפיה'], 45, 60, 220],
      [['Nutrition consultation', 'استشارة تغذية', 'ייעוץ תזונתי'], 45, 45, 160]] },
  { key: 'fitness', icon: '<path d="M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12"/>',
    name: ['Fitness', 'اللياقة البدنية', 'כושר'],
    examples: ['Personal trainers, gyms, yoga and pilates studios', 'مدربون شخصيون وصالات رياضية واستوديوهات يوغا وبيلاتس', 'מאמנים אישיים, חדרי כושר, סטודיו ליוגה ולפילאטיס'],
    services: [
      [['Personal training', 'تدريب شخصي', 'אימון אישי'], 60, 40, 150],
      [['Trial session', 'حصة تجريبية', 'אימון ניסיון'], 30, 0, 0],
      [['Yoga class', 'حصة يوغا', 'שיעור יוגה'], 60, 20, 70],
      [['Fitness assessment', 'تقييم اللياقة', 'הערכת כושר'], 30, 25, 90]] },
  { key: 'education', icon: '<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v5c1.6 1.6 3.6 2.5 5.5 2.5s3.9-.9 5.5-2.5v-5M21.5 9v5"/>',
    name: ['Education', 'التعليم', 'חינוך והוראה'],
    examples: ['Tutors, language and music lessons, driving schools', 'دروس خصوصية ودروس لغات وموسيقى ومدارس تعليم القيادة', 'מורים פרטיים, שיעורי שפה ומוזיקה, בתי ספר לנהיגה'],
    services: [
      [['Private lesson', 'درس خصوصي', 'שיעור פרטי'], 60, 30, 110],
      [['Exam preparation', 'تحضير للامتحان', 'הכנה למבחן'], 90, 45, 160],
      [['Trial lesson', 'درس تجريبي', 'שיעור ניסיון'], 30, 0, 0],
      [['Language lesson', 'درس لغة', 'שיעור שפה'], 45, 25, 90]] },
  { key: 'consulting', icon: '<path d="M4 5.5h11a2 2 0 0 1 2 2V13a2 2 0 0 1-2 2H9l-4 3.5V15H4a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2z"/><path d="M19 9h1a2 2 0 0 1 2 2v5.5a2 2 0 0 1-2 2h-1V21l-3-2.5h-3"/>',
    name: ['Consulting', 'الاستشارات', 'ייעוץ'],
    examples: ['Lawyers, accountants, coaches, business advisers', 'محامون ومحاسبون ومدربو حياة ومستشارو أعمال', 'עורכי דין, רואי חשבון, קואצ׳רים, יועצים עסקיים'],
    services: [
      [['Initial consultation', 'استشارة أولية', 'פגישת היכרות'], 30, 60, 200],
      [['Strategy session', 'جلسة تخطيط', 'פגישת אסטרטגיה'], 60, 120, 400],
      [['Follow-up call', 'مكالمة متابعة', 'שיחת מעקב'], 30, 50, 180]] },
  { key: 'home', icon: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5M10 20v-5.5h4V20"/>',
    name: ['Home Services', 'الخدمات المنزلية', 'שירותים לבית'],
    examples: ['Cleaning, repairs, technicians, installers', 'تنظيف وصيانة وفنيون وتركيبات', 'ניקיון, תיקונים, טכנאים, התקנות'],
    services: [
      [['Home cleaning', 'تنظيف المنزل', 'ניקיון הבית'], 120, 60, 220],
      [['Repair visit', 'زيارة صيانة', 'ביקור תיקון'], 60, 45, 160],
      [['Installation', 'تركيب', 'התקנה'], 90, 70, 250],
      [['Inspection & quote', 'معاينة وعرض سعر', 'בדיקה והצעת מחיר'], 30, 0, 0]] },
  { key: 'other', icon: '<circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/>',
    name: ['Other', 'أخرى', 'אחר'],
    examples: ['Photographers, pet groomers, car care and more', 'مصورون وعناية بالحيوانات الأليفة وبالسيارات وغيرها', 'צלמים, טיפוח חיות מחמד, טיפול ברכב ועוד'],
    services: [
      [['Appointment', 'موعد', 'פגישה'], 30, 30, 100],
      [['Consultation', 'استشارة', 'ייעוץ'], 45, 40, 150],
      [['Full session', 'جلسة كاملة', 'מפגש מלא'], 60, 60, 220]] },
];
const IDX = { en: 0, ar: 1, he: 2 };
export const pick3 = (arr, lang) => arr[IDX[lang] ?? 0] || arr[0];
export const categoryOf = key => CATEGORIES.find(c => c.key === key) || null;
// The visitor's demo currency: shekels for Arabic and Hebrew visitors, dollars otherwise.
export const demoCurrency = lang => (lang === 'en' ? 'USD' : 'ILS');
export function exampleServices(key, lang) {
  const cat = categoryOf(key) || categoryOf('other'), usd = demoCurrency(lang) === 'USD';
  return cat.services.map(([names, duration, priceUsd, priceIls], i) => ({ id: 's' + (i + 1), name: pick3(names, lang), duration, price: usd ? priceUsd : priceIls }));
}
// Usual working week by language: Arabic Saturday–Thursday, Hebrew Sunday–Thursday, English Monday–Friday (0 = Sunday).
export function defaultHours(lang) {
  const days = lang === 'ar' ? [1, 1, 1, 1, 1, 0, 1] : lang === 'he' ? [1, 1, 1, 1, 1, 0, 0] : [0, 1, 1, 1, 1, 1, 0];
  return { from: '09:00', to: '18:00', days: Object.fromEntries(days.map((on, i) => [String(i), !!on])) };
}
export const weekStart = lang => (lang === 'en' ? 1 : lang === 'ar' ? 6 : 0);

// Customers on the sample bookings of the page builder's dashboard (made up).
export const SAMPLE_PEOPLE = {
  en: [['Lucy Grant', '+15550100101'], ['Emma Brooks', '+15550100102'], ['Noah Bennett', '+15550100103'], ['Ava Collins', '+15550100104'], ['Liam Foster', '+15550100105'], ['Mila Russell', '+15550100106']],
  ar: [['سارة خليل', '+970599000101'], ['أحمد ناصر', '+970599000102'], ['ليان حداد', '+970599000103'], ['محمد عودة', '+970599000104'], ['نور سلامة', '+970599000105'], ['يوسف قاسم', '+970599000106']],
  he: [['נועה כהן', '+972500000101'], ['דניאל לוי', '+972500000102'], ['מאיה פרץ', '+972500000103'], ['יואב מזרחי', '+972500000104'], ['שירה אברהם', '+972500000105'], ['איתי ביטון', '+972500000106']],
};

// "Book as a customer": a fully prepared example business.
export function demoBusiness(lang) {
  const t = (en, ar, he) => T(lang, en, ar, he), usd = demoCurrency(lang) === 'USD';
  const p = (u, s) => (usd ? u : s);
  const services = [
    { id: 'n1', name: t('First consultation', 'استشارة أولى', 'ייעוץ ראשוני'), description: t('A full assessment and a care plan made for you.', 'تقييم كامل وخطة علاج مصممة لك.', 'הערכה מלאה ותוכנית טיפול מותאמת אישית.'), duration: 30, price: p(50, 180) },
    { id: 'n2', name: t('Physiotherapy session', 'جلسة علاج طبيعي', 'טיפול פיזיותרפיה'), description: t('Hands-on treatment and exercises for pain and movement.', 'علاج يدوي وتمارين للألم والحركة.', 'טיפול ידני ותרגילים לכאב ולתנועה.'), duration: 45, price: p(60, 220) },
    { id: 'n3', name: t('Sports massage', 'مساج رياضي', 'עיסוי ספורטאים'), description: t('Deep tissue massage for recovery after training.', 'مساج عميق للتعافي بعد التمرين.', 'עיסוי רקמות עמוק להתאוששות אחרי אימון.'), duration: 60, price: p(55, 200) },
    { id: 'n4', name: t('Nutrition plan', 'خطة تغذية', 'תוכנית תזונה'), description: t('A personal eating plan with a follow-up.', 'خطة غذائية شخصية مع متابعة.', 'תוכנית תזונה אישית עם מעקב.'), duration: 45, price: p(45, 160) },
    { id: 'n5', name: t('Follow-up visit', 'زيارة متابعة', 'ביקור מעקב'), description: t('Check your progress and adjust the plan.', 'متابعة تقدمك وتعديل الخطة.', 'בדיקת ההתקדמות ועדכון התוכנית.'), duration: 20, price: p(30, 120) },
  ];
  const wk = { 0: true, 1: true, 2: true, 3: true, 4: true, 5: false, 6: false };
  const specialists = [
    { id: 'm1', name: t('Dr. Mia Haddad', 'د. ميا حداد', 'ד״ר מיה חדאד'), specialty: t('Physiotherapist', 'أخصائية علاج طبيعي', 'פיזיותרפיסטית'), services: ['n1', 'n2', 'n5'], days: { ...wk, 6: true }, hours: { from: '09:00', to: '17:00' }, color: '#3B6FD8' },
    { id: 'm2', name: t('Omar Saleh', 'عمر صالح', 'עומר סאלח'), specialty: t('Sports massage therapist', 'معالج مساج رياضي', 'מעסה ספורטאים'), services: ['n1', 'n3'], days: wk, hours: { from: '11:00', to: '19:00' }, color: '#C8932E' },
    { id: 'm3', name: t('Lena Aziz', 'لينا عزيز', 'לנה עזיז'), specialty: t('Nutritionist', 'أخصائية تغذية', 'תזונאית'), services: ['n4', 'n5'], days: { ...wk, 2: false }, hours: { from: '10:00', to: '18:00' }, color: '#2E9E7A' },
  ];
  return {
    name: t('Nova Physio & Wellness', 'مركز نوفا للعلاج الطبيعي', 'נובה פיזיותרפיה ובריאות'), slug: 'demo', code: 'DEMO',
    category: t('Clinics & Healthcare', 'العيادات والرعاية الصحية', 'קליניקות ובריאות'),
    about: t('Physiotherapy, sports massage and nutrition care for every age.', 'علاج طبيعي ومساج رياضي ورعاية تغذوية لكل الأعمار.', 'פיזיותרפיה, עיסוי ספורטאים וליווי תזונתי לכל הגילים.'),
    address: t('14 Garden Street, City Centre', 'شارع الحدائق 14، وسط المدينة', 'רחוב הגנים 14, מרכז העיר'),
    color: '#241D28', timezone: '',
    settings: { open: true, online_booking: true, window_days: 14, show_prices: true, currency: demoCurrency(lang), new_customers: true, allow_cancellation: true, cancel_limit_hours: 2 },
    services, specialists, hours: { from: '09:00', to: '19:00' }, busy: true,
  };
}
