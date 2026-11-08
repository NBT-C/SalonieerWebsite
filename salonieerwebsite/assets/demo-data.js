// Try METON Free: the content of both demos, in English, Arabic and Hebrew. Everything here is made up.
//  * CATEGORIES: the sectors a visitor picks in the page builder. Each sector has business TYPES (2026-11-08), and each
//    type brings its own example services (editable), the usual staff role, and who usually provides and receives the
//    services (only used to pick realistic example names; it never limits who can book).
//    Prices are examples in the visitor's currency (ILS for Arabic and Hebrew, USD for English).
//  * demoBusiness(): the ready-made example business of "Try booking as a customer" (the same business as on the home
//    page's app screens).
// Nothing in this file is sent anywhere.

const T = (lang, en, ar, he) => ({ en, ar, he })[lang] || en;
const IDX = { en: 0, ar: 1, he: 2 };
export const pick3 = (arr, lang) => arr[IDX[lang] ?? 0] || arr[0];

// A role in both forms: [[en, ar, he] for a man, [en, ar, he] for a woman].
const R = (en, arM, arF, heM, heF) => [[en, arM, heM], [en, arF, heF]];
const SPECIALIST = R('Specialist', 'مختص', 'مختصة', 'איש מקצוע', 'אשת מקצוע');
// [names, minutes, USD, ILS]
const S = (en, ar, he, min, usd, ils) => [[en, ar, he], min, usd, ils];
const other = (services, role = SPECIALIST) => ({ key: 'other', name: ['Other', 'أخرى', 'אחר'], providers: 'any', customers: 'any', role, services });

export const PREFS = ['male', 'female', 'mixed', 'any'];

export const CATEGORIES = [
  { key: 'beauty', icon: '<path d="M6 21c0-4 2.7-6 6-6s6 2 6 6"/><circle cx="12" cy="8" r="4"/><path d="M15.5 4.5 18 2M17 6h3"/>',
    name: ['Beauty & Personal Care', 'التجميل والعناية الشخصية', 'יופי וטיפוח'],
    examples: ['Barbers, beauty salons, nails, skincare, spas', 'حلاقون وصالونات تجميل وأظافر وعناية بالبشرة وسبا', 'מספרות, סלוני יופי, ציפורניים, טיפוח עור, ספא'],
    types: [
      { key: 'barber', name: ["Men's barbershop", 'صالون حلاقة رجالي', 'מספרה לגברים'], providers: 'male', customers: 'male',
        role: R('Barber', 'حلاق', 'حلاقة', 'ספר', 'ספרית'), bizPh: ['For example: Sharp Line Barbers', 'مثلاً: صالون الأناقة للحلاقة', 'למשל: המספרה של רון'],
        services: [S('Haircut', 'قص شعر', 'תספורת', 30, 20, 60), S('Beard trim & shape', 'تهذيب وتشكيل اللحية', 'עיצוב זקן', 20, 12, 40), S('Haircut & beard', 'قص شعر ولحية', 'תספורת וזקן', 45, 28, 90), S('Kids haircut', 'قص شعر للأطفال', 'תספורת ילדים', 20, 14, 45), S('Hot towel shave', 'حلاقة بالموس والمنشفة الساخنة', 'גילוח עם מגבת חמה', 30, 18, 50)] },
      { key: 'women_salon', name: ["Women's beauty salon", 'صالون تجميل نسائي', 'סלון יופי לנשים'], providers: 'female', customers: 'female',
        role: R('Hair stylist', 'مصفف شعر', 'مصففة شعر', 'מעצב שיער', 'מעצבת שיער'), bizPh: ['For example: Rose Beauty Lounge', 'مثلاً: صالون روز للتجميل', 'למשל: סלון ורד'],
        services: [S('Haircut & blow-dry', 'قص وسشوار', 'תספורת ופן', 60, 40, 150), S('Hair colouring', 'صبغة شعر', 'צבע לשיער', 120, 80, 300), S('Blow-dry', 'سشوار', 'פן', 45, 25, 90), S('Highlights', 'هايلايت', 'גוונים', 150, 110, 400), S('Bridal hair & make-up', 'تسريحة ومكياج عروس', 'שיער ואיפור כלה', 180, 200, 750)] },
      { key: 'nails', name: ['Nail studio', 'استوديو أظافر', 'סטודיו לציפורניים'], providers: 'female', customers: 'female',
        role: R('Nail technician', 'فني أظافر', 'فنية أظافر', 'מניקוריסט', 'מניקוריסטית'), bizPh: ['For example: Polish Nail Studio', 'مثلاً: استوديو لمسة للأظافر', 'למשל: סטודיו לק'],
        services: [S('Gel manicure', 'مانيكير جل', 'מניקור ג׳ל', 60, 35, 120), S('Classic manicure', 'مانيكير كلاسيك', 'מניקור קלאסי', 40, 22, 80), S('Pedicure', 'باديكير', 'פדיקור', 50, 35, 130), S('Nail extensions', 'تركيب أظافر', 'בניית ציפורניים', 90, 55, 200), S('Gel removal', 'إزالة الجل', 'הסרת ג׳ל', 20, 10, 40)] },
      { key: 'skincare', name: ['Skincare center', 'مركز العناية بالبشرة', 'מרכז לטיפוח העור'], providers: 'female', customers: 'mixed',
        role: R('Skincare specialist', 'أخصائي بشرة', 'أخصائية بشرة', 'קוסמטיקאי', 'קוסמטיקאית'), bizPh: ['For example: Glow Skin Clinic', 'مثلاً: مركز نضارة للبشرة', 'למשל: גלואו טיפוח עור'],
        services: [S('Deep cleansing facial', 'تنظيف بشرة عميق', 'טיפול פנים עמוק', 60, 45, 180), S('Chemical peel', 'تقشير كيميائي', 'פילינג כימי', 45, 60, 250), S('Hydrafacial', 'هايدرافيشال', 'הידרפיישל', 60, 80, 300), S('Skin consultation', 'استشارة بشرة', 'ייעוץ עור', 20, 0, 0), S('Laser hair removal', 'إزالة الشعر بالليزر', 'הסרת שיער בלייזר', 30, 50, 200)] },
      { key: 'spa', name: ['Spa & body care', 'سبا والعناية بالجسم', 'ספא וטיפוח הגוף'], providers: 'mixed', customers: 'mixed',
        role: R('Therapist', 'معالج', 'معالجة', 'מטפל', 'מטפלת'), bizPh: ['For example: Calm Day Spa', 'مثلاً: سبا السكينة', 'למשל: ספא שלווה'],
        services: [S('Swedish massage', 'مساج سويدي', 'עיסוי שוודי', 60, 50, 200), S('Deep tissue massage', 'مساج الأنسجة العميقة', 'עיסוי רקמות עמוק', 60, 60, 230), S('Hot stone massage', 'مساج بالأحجار الساخنة', 'עיסוי אבנים חמות', 75, 70, 260), S('Moroccan bath', 'حمام مغربي', 'חמאם מרוקאי', 60, 45, 180), S('Body scrub', 'تقشير الجسم', 'פילינג גוף', 45, 35, 150)] },
      other([S('Haircut & styling', 'قص وتصفيف الشعر', 'תספורת ועיצוב', 45, 30, 100), S('Hair colouring', 'صبغة الشعر', 'צבע לשיער', 90, 70, 250), S('Manicure', 'مانيكير', 'מניקור', 40, 25, 90), S('Facial treatment', 'تنظيف البشرة', 'טיפול פנים', 60, 50, 180)]),
    ] },
  { key: 'health', icon: '<path d="M12 21s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 5.6-7 10-7 10z"/><path d="M12 9v5M9.5 11.5h5"/>',
    name: ['Clinics & Healthcare', 'العيادات والرعاية الصحية', 'קליניקות ובריאות'],
    examples: ['Physiotherapy, dentists, clinics, therapists, dietitians', 'علاج طبيعي وأطباء أسنان وعيادات ومعالجون وأخصائيو تغذية', 'פיזיותרפיה, רופאי שיניים, מרפאות, מטפלים, דיאטנים'],
    types: [
      { key: 'physio', name: ['Physiotherapy clinic', 'عيادة علاج طبيعي', 'קליניקה לפיזיותרפיה'], providers: 'mixed', customers: 'mixed',
        role: R('Physiotherapist', 'أخصائي علاج طبيعي', 'أخصائية علاج طبيعي', 'פיזיותרפיסט', 'פיזיותרפיסטית'), bizPh: ['For example: Nova Physio', 'مثلاً: مركز نوفا', 'למשל: נובה פיזיותרפיה'],
        services: [S('Initial assessment', 'تقييم أولي', 'הערכה ראשונית', 45, 60, 220), S('Physiotherapy session', 'جلسة علاج طبيعي', 'טיפול פיזיותרפיה', 45, 55, 200), S('Sports injury rehab', 'تأهيل إصابات رياضية', 'שיקום פציעות ספורט', 60, 65, 240), S('Dry needling', 'الإبر الجافة', 'דיקור יבש', 30, 45, 170), S('Follow-up session', 'جلسة متابعة', 'טיפול מעקב', 30, 40, 150)] },
      { key: 'dental', name: ['Dental clinic', 'عيادة أسنان', 'מרפאת שיניים'], providers: 'mixed', customers: 'mixed',
        role: R('Dentist', 'طبيب أسنان', 'طبيبة أسنان', 'רופא שיניים', 'רופאת שיניים'), bizPh: ['For example: Bright Smile Dental', 'مثلاً: عيادة ابتسامة للأسنان', 'למשל: מרפאת שיניים חיוך'],
        services: [S('Check-up & cleaning', 'فحص وتنظيف', 'בדיקה וניקוי', 45, 60, 250), S('Filling', 'حشوة', 'סתימה', 45, 80, 350), S('Teeth whitening', 'تبييض الأسنان', 'הלבנת שיניים', 60, 150, 600), S('Consultation', 'استشارة', 'ייעוץ', 20, 25, 100), S('Root canal treatment', 'علاج عصب', 'טיפול שורש', 90, 250, 1000)] },
      { key: 'medical', name: ['Medical clinic', 'عيادة طبية', 'מרפאה'], providers: 'mixed', customers: 'mixed',
        role: R('Doctor', 'طبيب', 'طبيبة', 'רופא', 'רופאה'), bizPh: ['For example: City Family Clinic', 'مثلاً: عيادة العائلة', 'למשל: מרפאת המשפחה'],
        services: [S('General consultation', 'كشف عام', 'בדיקה כללית', 20, 40, 150), S('Follow-up visit', 'زيارة متابعة', 'ביקור מעקב', 15, 25, 100), S('Medical certificate', 'تقرير طبي', 'אישור רפואי', 15, 20, 80), S('Blood pressure & sugar check', 'فحص ضغط وسكري', 'בדיקת לחץ דם וסוכר', 15, 15, 50)] },
      { key: 'psych', name: ['Psychology & therapy', 'علاج نفسي وإرشاد', 'פסיכולוגיה וטיפול רגשי'], providers: 'mixed', customers: 'mixed',
        role: R('Psychologist', 'أخصائي نفسي', 'أخصائية نفسية', 'פסיכולוג', 'פסיכולוגית'), bizPh: ['For example: Clear Mind Therapy', 'مثلاً: مركز صفاء للإرشاد', 'למשל: מרחב טיפולי'],
        services: [S('First session', 'جلسة أولى', 'פגישה ראשונה', 50, 80, 300), S('Therapy session', 'جلسة علاجية', 'פגישת טיפול', 50, 70, 280), S('Couples session', 'جلسة للأزواج', 'טיפול זוגי', 60, 100, 400), S('Online session', 'جلسة عن بُعد', 'פגישה מקוונת', 50, 65, 250)] },
      { key: 'nutrition', name: ['Nutrition & dietetics', 'تغذية وحميات', 'תזונה ודיאטה'], providers: 'mixed', customers: 'mixed',
        role: R('Dietitian', 'أخصائي تغذية', 'أخصائية تغذية', 'דיאטן', 'דיאטנית'), bizPh: ['For example: Balance Nutrition', 'مثلاً: مركز توازن للتغذية', 'למשל: איזון תזונה'],
        services: [S('Nutrition consultation', 'استشارة تغذية', 'ייעוץ תזונתי', 45, 45, 180), S('Personal diet plan', 'خطة غذائية شخصية', 'תפריט אישי', 60, 60, 220), S('Follow-up & weigh-in', 'متابعة ووزن', 'מעקב ושקילה', 20, 25, 90), S('Body composition analysis', 'تحليل مكونات الجسم', 'בדיקת הרכב גוף', 20, 20, 80)] },
      other([S('First consultation', 'استشارة أولى', 'ייעוץ ראשוני', 30, 50, 180), S('Follow-up visit', 'زيارة متابعة', 'ביקור מעקב', 20, 30, 120), S('Treatment session', 'جلسة علاج', 'טיפול', 45, 60, 220)]),
    ] },
  { key: 'fitness', icon: '<path d="M3 10v4M6 7v10M18 7v10M21 10v4M6 12h12"/>',
    name: ['Fitness & Wellness', 'اللياقة والصحة', 'כושר ואיכות חיים'],
    examples: ['Personal trainers, gyms, yoga and pilates, martial arts', 'مدربون شخصيون وصالات رياضية ويوغا وبيلاتس وفنون قتالية', 'מאמנים אישיים, חדרי כושר, יוגה ופילאטיס, אומנויות לחימה'],
    types: [
      { key: 'trainer', name: ['Personal training', 'تدريب شخصي', 'אימון אישי'], providers: 'mixed', customers: 'mixed',
        role: R('Personal trainer', 'مدرب شخصي', 'مدربة شخصية', 'מאמן אישי', 'מאמנת אישית'), bizPh: ['For example: Peak Personal Training', 'مثلاً: قمة للتدريب الشخصي', 'למשל: פסגה אימון אישי'],
        services: [S('Personal training session', 'حصة تدريب شخصي', 'אימון אישי', 60, 40, 150), S('Trial session', 'حصة تجريبية', 'אימון ניסיון', 30, 0, 0), S('Fitness assessment', 'تقييم اللياقة', 'הערכת כושר', 45, 30, 120), S('Training plan', 'خطة تدريب', 'תוכנית אימונים', 30, 35, 130)] },
      { key: 'gym', name: ['Gym & fitness studio', 'نادٍ رياضي واستوديو لياقة', 'חדר כושר וסטודיו'], providers: 'mixed', customers: 'mixed',
        role: R('Coach', 'مدرب', 'مدربة', 'מאמן', 'מאמנת'), bizPh: ['For example: Core Fitness Studio', 'مثلاً: نادي اللياقة', 'למשל: סטודיו קור'],
        services: [S('Gym induction', 'جولة تعريفية', 'היכרות עם חדר הכושר', 30, 0, 0), S('Private session', 'حصة خاصة', 'אימון פרטי', 60, 35, 130), S('Body assessment', 'تقييم الجسم', 'בדיקת מדדים', 30, 20, 80), S('Boxing session', 'حصة ملاكمة', 'אימון אגרוף', 45, 30, 120)] },
      { key: 'yoga', name: ['Yoga & Pilates', 'يوغا وبيلاتس', 'יוגה ופילאטיס'], providers: 'female', customers: 'mixed',
        role: R('Instructor', 'مدرب', 'مدربة', 'מדריך', 'מדריכה'), bizPh: ['For example: Lotus Yoga Studio', 'مثلاً: استوديو لوتس لليوغا', 'למשל: סטודיו לוטוס'],
        services: [S('Private yoga session', 'حصة يوغا خاصة', 'שיעור יוגה פרטי', 60, 45, 170), S('Private Pilates session', 'حصة بيلاتس خاصة', 'שיעור פילאטיס פרטי', 55, 50, 180), S('Reformer Pilates', 'بيلاتس ريفورمر', 'פילאטיס מכשירים', 55, 55, 200), S('Breathing & relaxation', 'تنفس واسترخاء', 'נשימה והרפיה', 30, 25, 90)] },
      { key: 'martial', name: ['Martial arts & boxing', 'فنون قتالية وملاكمة', 'אומנויות לחימה ואגרוף'], providers: 'male', customers: 'mixed',
        role: R('Coach', 'مدرب', 'مدربة', 'מאמן', 'מאמנת'), bizPh: ['For example: Iron Fist Academy', 'مثلاً: أكاديمية القبضة', 'למשל: אקדמיית אגרוף'],
        services: [S('Private boxing session', 'حصة ملاكمة خاصة', 'אימון אגרוף אישי', 60, 40, 150), S('Kids martial arts', 'فنون قتالية للأطفال', 'אומנויות לחימה לילדים', 45, 25, 90), S('Self-defence lesson', 'درس دفاع عن النفس', 'שיעור הגנה עצמית', 60, 35, 130), S('Trial lesson', 'درس تجريبي', 'שיעור ניסיון', 30, 0, 0)] },
      other([S('Personal training', 'تدريب شخصي', 'אימון אישי', 60, 40, 150), S('Trial session', 'حصة تجريبية', 'אימון ניסיון', 30, 0, 0), S('Fitness assessment', 'تقييم اللياقة', 'הערכת כושר', 30, 25, 90)], R('Coach', 'مدرب', 'مدربة', 'מאמן', 'מאמנת')),
    ] },
  { key: 'education', icon: '<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v5c1.6 1.6 3.6 2.5 5.5 2.5s3.9-.9 5.5-2.5v-5M21.5 9v5"/>',
    name: ['Education & Training', 'التعليم والتدريب', 'חינוך והדרכה'],
    examples: ['Tutors, language and music lessons, driving schools', 'دروس خصوصية ودروس لغات وموسيقى ومدارس تعليم القيادة', 'מורים פרטיים, שיעורי שפה ומוזיקה, בתי ספר לנהיגה'],
    types: [
      { key: 'tutoring', name: ['Private tutoring', 'دروس خصوصية', 'שיעורים פרטיים'], providers: 'mixed', customers: 'mixed',
        role: R('Tutor', 'مدرّس', 'مدرّسة', 'מורה', 'מורה'), bizPh: ['For example: Bright Minds Tutoring', 'مثلاً: مركز النجاح للدروس', 'למשל: מרכז הצלחה'],
        services: [S('Math lesson', 'درس رياضيات', 'שיעור מתמטיקה', 60, 30, 120), S('English lesson', 'درس لغة إنجليزية', 'שיעור אנגלית', 60, 30, 120), S('Exam preparation', 'تحضير للامتحان', 'הכנה לבחינה', 90, 45, 160), S('Homework help', 'مساعدة في الواجبات', 'עזרה בשיעורי בית', 45, 20, 80)] },
      { key: 'language', name: ['Language lessons', 'دروس لغات', 'שיעורי שפה'], providers: 'mixed', customers: 'mixed',
        role: R('Language teacher', 'معلّم لغة', 'معلّمة لغة', 'מורה לשפה', 'מורה לשפה'), bizPh: ['For example: Lingo Language Studio', 'مثلاً: مركز لغتي', 'למשל: סטודיו לשפות'],
        services: [S('Private language lesson', 'درس لغة خاص', 'שיעור שפה פרטי', 60, 30, 120), S('Conversation practice', 'تدريب على المحادثة', 'תרגול שיחה', 45, 25, 90), S('Placement test', 'اختبار تحديد المستوى', 'מבחן רמה', 20, 0, 0), S('Business language', 'لغة الأعمال', 'שפה עסקית', 60, 40, 150)] },
      { key: 'music', name: ['Music lessons', 'دروس موسيقى', 'שיעורי מוזיקה'], providers: 'mixed', customers: 'mixed',
        role: R('Music teacher', 'معلّم موسيقى', 'معلّمة موسيقى', 'מורה למוזיקה', 'מורה למוזיקה'), bizPh: ['For example: Melody Music School', 'مثلاً: مدرسة نغم للموسيقى', 'למשל: בית ספר מנגינה'],
        services: [S('Piano lesson', 'درس بيانو', 'שיעור פסנתר', 45, 35, 130), S('Guitar lesson', 'درس غيتار', 'שיעור גיטרה', 45, 35, 130), S('Singing lesson', 'درس غناء', 'שיעור פיתוח קול', 45, 35, 130), S('Oud lesson', 'درس عود', 'שיעור עוד', 45, 35, 130)] },
      { key: 'driving', name: ['Driving school', 'مدرسة تعليم قيادة', 'בית ספר לנהיגה'], providers: 'male', customers: 'mixed',
        role: R('Driving instructor', 'مدرب قيادة', 'مدربة قيادة', 'מורה לנהיגה', 'מורה לנהיגה'), bizPh: ['For example: Green Light Driving', 'مثلاً: مدرسة الإشارة الخضراء', 'למשל: אור ירוק נהיגה'],
        services: [S('Driving lesson', 'درس قيادة', 'שיעור נהיגה', 40, 30, 160), S('Double lesson', 'درس مزدوج', 'שיעור כפול', 80, 55, 300), S('Test preparation', 'تحضير للفحص العملي', 'הכנה לטסט', 40, 35, 180), S('First lesson', 'الدرس الأول', 'שיעור ראשון', 40, 25, 140)] },
      other([S('Private lesson', 'درس خصوصي', 'שיעור פרטי', 60, 30, 110), S('Exam preparation', 'تحضير للامتحان', 'הכנה למבחן', 90, 45, 160), S('Trial lesson', 'درس تجريبي', 'שיעור ניסיון', 30, 0, 0)], R('Teacher', 'معلّم', 'معلّمة', 'מורה', 'מורה')),
    ] },
  { key: 'consulting', icon: '<path d="M4 5.5h11a2 2 0 0 1 2 2V13a2 2 0 0 1-2 2H9l-4 3.5V15H4a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2z"/><path d="M19 9h1a2 2 0 0 1 2 2v5.5a2 2 0 0 1-2 2h-1V21l-3-2.5h-3"/>',
    name: ['Consulting & Professional Services', 'الاستشارات والخدمات المهنية', 'ייעוץ ושירותים מקצועיים'],
    examples: ['Lawyers, accountants, business advisers, coaches', 'محامون ومحاسبون ومستشارو أعمال ومدربو حياة', 'עורכי דין, רואי חשבון, יועצים עסקיים, קואצ׳רים'],
    types: [
      { key: 'legal', name: ['Legal services', 'خدمات قانونية', 'שירותים משפטיים'], providers: 'mixed', customers: 'mixed',
        role: R('Lawyer', 'محامٍ', 'محامية', 'עורך דין', 'עורכת דין'), bizPh: ['For example: Haddad Law Office', 'مثلاً: مكتب حداد للمحاماة', 'למשל: משרד עורכי דין לוי'],
        services: [S('Initial consultation', 'استشارة أولية', 'פגישת ייעוץ ראשונה', 30, 60, 250), S('Legal consultation', 'استشارة قانونية', 'ייעוץ משפטי', 60, 100, 400), S('Contract review', 'مراجعة عقد', 'בדיקת חוזה', 60, 120, 450), S('Document signing', 'توقيع مستندات', 'חתימה על מסמכים', 20, 40, 150)] },
      { key: 'accounting', name: ['Accounting & tax', 'محاسبة وضرائب', 'הנהלת חשבונות ומיסים'], providers: 'mixed', customers: 'mixed',
        role: R('Accountant', 'محاسب', 'محاسبة', 'רואה חשבון', 'רואת חשבון'), bizPh: ['For example: Ledger & Co. Accounting', 'مثلاً: مكتب الدقة للمحاسبة', 'למשל: משרד רואי חשבון'],
        services: [S('Tax consultation', 'استشارة ضريبية', 'ייעוץ מס', 45, 60, 250), S('Annual tax return', 'الإقرار الضريبي السنوي', 'דוח שנתי', 60, 120, 500), S('Bookkeeping review', 'مراجعة الدفاتر', 'בדיקת הנהלת חשבונות', 45, 50, 200), S('Business setup advice', 'استشارة فتح مشروع', 'ייעוץ לפתיחת עסק', 60, 80, 300)] },
      { key: 'business', name: ['Business consulting', 'استشارات أعمال', 'ייעוץ עסקי'], providers: 'mixed', customers: 'mixed',
        role: R('Consultant', 'مستشار', 'مستشارة', 'יועץ', 'יועצת'), bizPh: ['For example: Growth Path Advisors', 'مثلاً: مسار للاستشارات', 'למשל: מסלול צמיחה'],
        services: [S('Initial consultation', 'استشارة أولية', 'פגישת היכרות', 30, 60, 200), S('Strategy session', 'جلسة تخطيط استراتيجي', 'פגישת אסטרטגיה', 60, 120, 400), S('Follow-up call', 'مكالمة متابعة', 'שיחת מעקב', 30, 50, 180), S('Business plan review', 'مراجعة خطة العمل', 'בדיקת תוכנית עסקית', 90, 150, 550)] },
      { key: 'coaching', name: ['Coaching', 'كوتشينغ وتطوير ذاتي', 'קואצ׳ינג'], providers: 'mixed', customers: 'mixed',
        role: R('Coach', 'مدرّب', 'مدرّبة', 'קואץ׳', 'קואצ׳רית'), bizPh: ['For example: Next Step Coaching', 'مثلاً: خطوة للتطوير', 'למשל: הצעד הבא'],
        services: [S('Discovery call', 'مكالمة تعارف', 'שיחת היכרות', 20, 0, 0), S('Coaching session', 'جلسة كوتشينغ', 'מפגש קואצ׳ינג', 60, 70, 250), S('Career coaching', 'إرشاد مهني', 'ייעוץ קריירה', 60, 80, 300), S('Follow-up session', 'جلسة متابعة', 'מפגש מעקב', 30, 40, 150)] },
      other([S('Initial consultation', 'استشارة أولية', 'פגישת היכרות', 30, 60, 200), S('Strategy session', 'جلسة تخطيط', 'פגישת אסטרטגיה', 60, 120, 400), S('Follow-up call', 'مكالمة متابعة', 'שיחת מעקב', 30, 50, 180)], R('Consultant', 'مستشار', 'مستشارة', 'יועץ', 'יועצת')),
    ] },
  { key: 'home', icon: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h13V9.5M10 20v-5.5h4V20"/>',
    name: ['Home Services', 'الخدمات المنزلية', 'שירותים לבית'],
    examples: ['Cleaning, repairs, electricians and plumbers, AC technicians', 'تنظيف وصيانة وكهرباء وسباكة وفنيو تكييف', 'ניקיון, תיקונים, חשמל ואינסטלציה, טכנאי מיזוג'],
    types: [
      { key: 'cleaning', name: ['Cleaning services', 'خدمات تنظيف', 'שירותי ניקיון'], providers: 'mixed', customers: 'any',
        role: R('Cleaner', 'عامل تنظيف', 'عاملة تنظيف', 'עובד ניקיון', 'עובדת ניקיון'), bizPh: ['For example: Sparkle Home Cleaning', 'مثلاً: لمعة لخدمات التنظيف', 'למשל: ברק ניקיון'],
        services: [S('Home cleaning', 'تنظيف المنزل', 'ניקיון הבית', 120, 60, 250), S('Deep cleaning', 'تنظيف عميق', 'ניקיון יסודי', 240, 120, 500), S('Office cleaning', 'تنظيف مكاتب', 'ניקיון משרד', 120, 70, 280), S('Sofa & carpet cleaning', 'تنظيف كنب وسجاد', 'ניקוי ספות ושטיחים', 90, 50, 200)] },
      { key: 'repairs', name: ['Repairs & maintenance', 'صيانة وتصليحات', 'תיקונים ותחזוקה'], providers: 'male', customers: 'any',
        role: R('Technician', 'فني', 'فنية', 'טכנאי', 'טכנאית'), bizPh: ['For example: FixRight Maintenance', 'مثلاً: الصيانة السريعة', 'למשל: תיקון מהיר'],
        services: [S('Repair visit', 'زيارة صيانة', 'ביקור תיקון', 60, 45, 180), S('Furniture assembly', 'تركيب أثاث', 'הרכבת רהיטים', 90, 50, 200), S('Door & lock repair', 'تصليح أبواب وأقفال', 'תיקון דלתות ומנעולים', 45, 40, 160), S('Inspection & quote', 'معاينة وعرض سعر', 'בדיקה והצעת מחיר', 30, 0, 0)] },
      { key: 'electric', name: ['Electrical & plumbing', 'كهرباء وسباكة', 'חשמל ואינסטלציה'], providers: 'male', customers: 'any',
        role: R('Technician', 'فني', 'فنية', 'טכנאי', 'טכנאית'), bizPh: ['For example: Volt & Pipe Services', 'مثلاً: خدمات الكهرباء والسباكة', 'למשל: חשמל ומים'],
        services: [S('Electrical repair', 'تصليح كهرباء', 'תיקון חשמל', 60, 50, 200), S('Plumbing repair', 'تصليح سباكة', 'תיקון אינסטלציה', 60, 50, 200), S('Water heater service', 'صيانة سخان', 'טיפול בדוד', 45, 40, 180), S('Leak inspection', 'فحص تسريب', 'איתור נזילה', 30, 30, 120)] },
      { key: 'ac', name: ['AC & appliances', 'تكييف وأجهزة منزلية', 'מיזוג ומכשירי חשמל'], providers: 'male', customers: 'any',
        role: R('Technician', 'فني', 'فنية', 'טכנאי', 'טכנאית'), bizPh: ['For example: CoolAir Technicians', 'مثلاً: فنيو التكييف', 'למשל: אוויר קר'],
        services: [S('AC cleaning & service', 'تنظيف وصيانة مكيف', 'ניקוי ושירות מזגן', 60, 45, 200), S('AC installation', 'تركيب مكيف', 'התקנת מזגן', 120, 120, 500), S('Washing machine repair', 'تصليح غسالة', 'תיקון מכונת כביסה', 60, 50, 220), S('Fridge repair', 'تصليح ثلاجة', 'תיקון מקרר', 60, 50, 220)] },
      other([S('Home cleaning', 'تنظيف المنزل', 'ניקיון הבית', 120, 60, 220), S('Repair visit', 'زيارة صيانة', 'ביקור תיקון', 60, 45, 160), S('Installation', 'تركيب', 'התקנה', 90, 70, 250), S('Inspection & quote', 'معاينة وعرض سعر', 'בדיקה והצעת מחיר', 30, 0, 0)], R('Technician', 'فني', 'فنية', 'טכנאי', 'טכנאית')),
    ] },
  { key: 'other', icon: '<circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/>',
    name: ['Other', 'أخرى', 'אחר'],
    examples: ['Photographers, pet groomers, car care and more', 'مصورون وعناية بالحيوانات الأليفة وبالسيارات وغيرها', 'צלמים, טיפוח חיות מחמד, טיפול ברכב ועוד'],
    types: [
      { key: 'photo', name: ['Photography studio', 'استوديو تصوير', 'סטודיו לצילום'], providers: 'mixed', customers: 'mixed',
        role: R('Photographer', 'مصوّر', 'مصوّرة', 'צלם', 'צלמת'), bizPh: ['For example: Frame Photo Studio', 'مثلاً: استوديو إطار للتصوير', 'למשל: סטודיו מסגרת'],
        services: [S('Portrait session', 'جلسة تصوير شخصية', 'צילומי פורטרט', 60, 80, 300), S('Family photo session', 'جلسة تصوير عائلية', 'צילומי משפחה', 60, 100, 400), S('Passport photos', 'صور جواز سفر', 'תמונות פספורט', 10, 10, 40), S('Product photography', 'تصوير منتجات', 'צילום מוצרים', 90, 120, 450)] },
      { key: 'pets', name: ['Pet grooming', 'العناية بالحيوانات الأليفة', 'טיפוח חיות מחמד'], providers: 'mixed', customers: 'any',
        role: R('Pet groomer', 'مختص عناية بالحيوانات', 'مختصة عناية بالحيوانات', 'מטפח חיות', 'מטפחת חיות'), bizPh: ['For example: Happy Paws Grooming', 'مثلاً: بيت الأليف', 'למשל: כפות שמחות'],
        services: [S('Dog bath & brush', 'حمام وتمشيط للكلب', 'רחצה וסירוק לכלב', 60, 40, 150), S('Full grooming', 'عناية كاملة', 'טיפוח מלא', 90, 60, 220), S('Nail clipping', 'قص الأظافر', 'גזיזת ציפורניים', 15, 10, 40), S('Cat grooming', 'عناية بالقطط', 'טיפוח לחתול', 60, 45, 170)] },
      { key: 'car', name: ['Car care', 'العناية بالسيارات', 'טיפול ברכב'], providers: 'male', customers: 'any',
        role: R('Car care specialist', 'فني سيارات', 'فنية سيارات', 'טכנאי רכב', 'טכנאית רכב'), bizPh: ['For example: Shine Auto Care', 'مثلاً: لمعان للعناية بالسيارات', 'למשל: ברק לרכב'],
        services: [S('Car wash', 'غسيل سيارة', 'שטיפת רכב', 30, 15, 60), S('Interior cleaning', 'تنظيف داخلي', 'ניקוי פנים', 60, 40, 150), S('Full detailing', 'تلميع كامل', 'דיטיילינג מלא', 180, 120, 450), S('Oil change', 'تغيير زيت', 'החלפת שמן', 30, 40, 180)] },
      other([S('Appointment', 'موعد', 'פגישה', 30, 30, 100), S('Consultation', 'استشارة', 'ייעוץ', 45, 40, 150), S('Full session', 'جلسة كاملة', 'מפגש מלא', 60, 60, 220)]),
    ] },
];
export const categoryOf = key => CATEGORIES.find(c => c.key === key) || null;
// A business type of a sector ('other' when unknown or not chosen yet).
export const typeOf = (sector, type) => { const c = categoryOf(sector) || categoryOf('other'); return c.types.find(t => t.key === type) || c.types.find(t => t.key === 'other'); };
// The type the home page's sector links and older drafts start with: the sector's own "Other".
export const defaultType = () => 'other';
// Who usually provides / receives the services for a type.
export const prefDefaults = (sector, type) => { const t = typeOf(sector, type); return { providers: t.providers, customers: t.customers }; };
// The visitor's demo currency: shekels for Arabic and Hebrew visitors, dollars otherwise.
export const demoCurrency = lang => (lang === 'en' ? 'USD' : 'ILS');
export function exampleServices(sector, lang, type) {
  const usd = demoCurrency(lang) === 'USD';
  return typeOf(sector, type).services.map(([names, duration, priceUsd, priceIls], i) => ({ id: 's' + (i + 1), name: pick3(names, lang), duration, price: usd ? priceUsd : priceIls }));
}
// The staff role of a type for a man (g = 'm') or a woman (g = 'f').
export const roleFor = (sector, type, g, lang) => pick3(typeOf(sector, type).role[g === 'f' ? 1 : 0], lang);
// Usual working week by language: Arabic Saturday–Thursday, Hebrew Sunday–Thursday, English Monday–Friday (0 = Sunday).
export function defaultHours(lang) {
  const days = lang === 'ar' ? [1, 1, 1, 1, 1, 0, 1] : lang === 'he' ? [1, 1, 1, 1, 1, 0, 0] : [0, 1, 1, 1, 1, 1, 0];
  return { from: '09:00', to: '18:00', days: Object.fromEntries(days.map((on, i) => [String(i), !!on])) };
}
export const weekStart = lang => (lang === 'en' ? 1 : lang === 'ar' ? 6 : 0);

// ── example people (made up) ──────────────────────────────────────────────────────────────────────────────────────
// Separate lists for men and women in each language. Staff take names from the start of a list, customers from the
// end, so the same name is never both.
const NAMES = {
  en: { m: ['Daniel Brooks', 'James Carter', 'Lucas Reed', 'Ethan Hughes', 'Adam Collins', 'Ryan Mitchell', 'Noah Bennett', 'Liam Foster', 'Oliver Price', 'Samuel Ward'],
        f: ['Sophie Turner', 'Grace Hall', 'Chloe Morgan', 'Hannah Lewis', 'Zoe Parker', 'Lily Evans', 'Lucy Grant', 'Emma Wright', 'Ava Mills', 'Mila Russell'] },
  ar: { m: ['خالد منصور', 'سامي حداد', 'رامي خوري', 'طارق زيدان', 'ليث عمرو', 'كريم عيسى', 'أحمد ناصر', 'محمد عودة', 'يوسف قاسم', 'زيد الشريف'],
        f: ['ريم عيسى', 'دانا منصور', 'هبة يوسف', 'جنى قاسم', 'رنا خوري', 'مريم عودة', 'سارة خليل', 'ليان حداد', 'نور سلامة', 'تالا يونس'] },
  he: { m: ['עומר כהן', 'נועם פרץ', 'אורי אברהם', 'תומר שפירא', 'עידו פרידמן', 'רון אזולאי', 'דניאל לוי', 'יואב מזרחי', 'איתי ביטון', 'אליה דהן'],
        f: ['תמר לוי', 'יעל מזרחי', 'מיכל ביטון', 'רוני דהן', 'הילה שפירא', 'אורית פרידמן', 'נועה כהן', 'מאיה פרץ', 'שירה אברהם', 'אביגיל אזולאי'] },
};
const PHONE = { en: i => '+1555010' + String(1000 + i).slice(1), ar: i => '+970599000' + String(100 + i), he: i => '+972500000' + String(100 + i) };
// The genders of n people for a preference: men, women, a deliberate mix (alternating), or not specified (no rule:
// a fixed, irregular pattern so it doesn't read as a deliberate mix).
function genders(pref, n) {
  if (pref === 'male') return Array(n).fill('m');
  if (pref === 'female') return Array(n).fill('f');
  if (pref === 'mixed') return Array.from({ length: n }, (_, i) => (i % 2 ? 'm' : 'f'));
  const loose = ['f', 'm', 'm', 'f', 'f', 'f', 'm', 'f', 'm', 'm'];
  return Array.from({ length: n }, (_, i) => loose[i % loose.length]);
}
// Example staff: [{ name, g }] (from the start of the lists).
export function staffNames(lang, pref, n, skip = 0) {
  const pool = NAMES[lang] || NAMES.en, used = { m: 0, f: 0 };
  return genders(pref, n + skip).map(g => ({ name: pool[g][used[g]++ % 5], g })).slice(skip);
}
// Example customers: [[name, phone]] (from the end of the lists).
export function customerNames(lang, pref, n) {
  const pool = NAMES[lang] || NAMES.en, used = { m: 0, f: 0 }, phone = PHONE[lang] || PHONE.en;
  return genders(pref, n).map((g, i) => [pool[g][5 + (used[g]++ % 5)], phone(i + 1)]);
}
// Kept for older callers: a mixed list of example customers.
export const SAMPLE_PEOPLE = { en: customerNames('en', 'mixed', 6), ar: customerNames('ar', 'mixed', 6), he: customerNames('he', 'mixed', 6) };

// ── "Try booking as a customer": a fully prepared example business ────────────────────────────────────────────────
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
    color: '#241D28', timezone: '', customers: 'mixed',
    settings: { open: true, online_booking: true, window_days: 14, show_prices: true, currency: demoCurrency(lang), new_customers: true, allow_cancellation: true, cancel_limit_hours: 2 },
    services, specialists, hours: { from: '09:00', to: '19:00' },
  };
}
