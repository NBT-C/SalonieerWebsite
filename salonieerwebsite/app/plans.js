// plans.js — 2.32: what Basic, Pro and Enterprise include, explained for
// business owners (METON, industry-neutral since 2026-11-06). Built from the plan entitlements in the database
// (salonieer_private.plan_features, October 2026): nothing here is promised
// that a plan does not unlock. Online payments are left out on purpose (a
// provider is connected on request only). The app shows no prices or payment
// links (the website does); changing plan is done with Salonieer.
window.Plans = (() => {
  "use strict";
  const E = (s) => UI.esc(s);
  const L = (o) => o[Lang.get()] || o.ar;
  // included: "all" | "pro" | "option" (Basic: one of the two as an add-on)
  const FEATURES = [
    { key: "booking", included: "all",
      t: { ar: "الحجز الإلكتروني وإدارة المواعيد", en: "Online booking and appointments", he: "הזמנה אונליין וניהול תורים" },
      d: { ar: "عملاؤك يحجزون من هواتفهم في أي وقت حسب أوقات عمل كل مختص، وأنت تؤكد وتلغي وتسجّل الحضور من التطبيق.", en: "Customers book from their phones at any hour, within each specialist's working times; you confirm, cancel and mark attendance in the app.", he: "הלקוחות מזמינים מהטלפון בכל שעה, לפי שעות העבודה של כל מומחה; אתם מאשרים, מבטלים ומסמנים הגעה באפליקציה." },
      x: { ar: "مثال: عميل يحجز موعداً الساعة 11 ليلاً دون أن يتصل بك.", en: "Example: a customer books an appointment at 11 pm without calling you.", he: "לדוגמה: לקוח קובע תור ב־23:00 בלי להתקשר." } },
    { key: "schedule", included: "all",
      t: { ar: "جدول اليوم والأسبوع", en: "Daily and weekly schedule", he: "לוח יומי ושבועי" },
      d: { ar: "كل مواعيد اليوم مرتبة حسب الوقت مع حالة كل موعد والوقت المتاح، ونظرة أسبوعية لكل المختصين.", en: "Every appointment of the day in time order with its status and the free time, plus a week view of the whole team.", he: "כל תורי היום לפי שעה, עם הסטטוס והזמן הפנוי, ותצוגה שבועית של כל הצוות." },
      x: { ar: "مثال: ترى بنظرة أن يوم الخميس ممتلئ وأن الاثنين فيه وقت فارغ.", en: "Example: see at a glance that Thursday is full and Monday has gaps.", he: "לדוגמה: רואים מיד שיום חמישי מלא ובשני יש חורים." } },
    { key: "notifications", included: "all",
      t: { ar: "الإشعارات والتذكير بالمواعيد", en: "Notifications and reminders", he: "התראות ותזכורות" },
      d: { ar: "يصل العميل تأكيد الحجز وأي تغيير وتذكير قبل الموعد، ويصل المختص إشعار بكل حجز جديد. ويمكنك إرسال رسالة لعميل.", en: "Customers get the confirmation, any change and a reminder before the visit; specialists hear about every new booking. You can also message a customer.", he: "הלקוח מקבל אישור, כל שינוי ותזכורת לפני התור; המומחה מקבל התראה על כל הזמנה חדשה. אפשר גם לשלוח הודעה ללקוח." },
      x: { ar: "مثال: التذكير قبل ساعة يقلل المواعيد الضائعة.", en: "Example: a reminder an hour before cuts missed appointments.", he: "לדוגמה: תזכורת שעה לפני מפחיתה תורים שהוחמצו." } },
    { key: "statistics", included: "all", limit: { basic: { ar: "آخر 30 يوماً", en: "Last 30 days", he: "30 הימים האחרונים" }, pro: { ar: "كل السجل", en: "Full history", he: "כל ההיסטוריה" } },
      t: { ar: "الإحصائيات", en: "Statistics", he: "סטטיסטיקות" },
      d: { ar: "عدد الحجوزات والإيرادات والعملاء وأداء كل مختص. في Basic آخر 30 يوماً، وفي Pro كل الفترات السابقة والمقارنات.", en: "Bookings, revenue, customers and each specialist's performance. Basic shows the last 30 days; Pro shows every past period and comparisons.", he: "הזמנות, הכנסות, לקוחות וביצועי כל מומחה. ב־Basic ‏30 הימים האחרונים; ב־Pro כל התקופות וההשוואות." },
      x: { ar: "مثال: تقارن هذا الشهر بنفس الشهر من العام الماضي (Pro).", en: "Example: compare this month with the same month last year (Pro).", he: "לדוגמה: השוואת החודש לאותו חודש בשנה שעברה (Pro)." } },
    { key: "specialists", included: "all", limit: { basic: { ar: "مختص واحد", en: "1 specialist", he: "מומחה אחד" }, pro: { ar: "7 مختصين", en: "7 specialists", he: "7 מומחים" }, enterprise: { ar: "حسب الاتفاق", en: "As agreed", he: "לפי הסכם" } },
      t: { ar: "عدد المختصين", en: "Specialists", he: "מספר מומחים" },
      d: { ar: "كل مختص له جدوله وخدماته وحجوزاته. يمكن إضافة مختصين أكثر من المشمول في الباقة كإضافة شهرية لكل مختص.", en: "Each specialist has their own schedule, services and bookings. More specialists than the plan includes can be added, billed monthly per specialist.", he: "לכל מומחה לוח, שירותים והזמנות משלו. אפשר להוסיף מומחים מעבר לכלול בחבילה, בתשלום חודשי לכל מומחה." },
      x: null },
    { key: "loyalty", included: "option",
      t: { ar: "نقاط الولاء", en: "Loyalty Coins", he: "מטבעות נאמנות" },
      d: { ar: "يجمع العميل نقاطاً عن كل زيارة أو شراء ويستبدلها بخدمة أو منتج أو مكافأة تحددها أنت.", en: "Customers earn coins for each visit or purchase and redeem them for a service, product or reward you choose.", he: "הלקוחות צוברים מטבעות על כל ביקור או רכישה וממירים אותם לשירות, מוצר או הטבה שתבחרו." },
      x: { ar: "مثال: بعد 10 زيارات تصبح الزيارة التالية مجانية — سبب ليعود العميل إليك.", en: "Example: the 10th visit is free — a reason to come back to you.", he: "לדוגמה: הביקור העשירי בחינם — סיבה לחזור אליכם." } },
    { key: "smart_waitlist", included: "option",
      t: { ar: "قائمة الانتظار الذكية", en: "Smart waitlist", he: "רשימת המתנה חכמה" },
      d: { ar: "عندما يكون اليوم ممتلئاً ينضم العميل لقائمة الانتظار على وقت محدد. إذا ألغى أحدهم يُعرض الوقت تلقائياً على أول منتظر لمدة 10 دقائق قبل أن يُفتح للجميع.", en: "When a day is full, customers wait for a specific time. If someone cancels, the time is offered automatically to the first in line for 10 minutes before it opens to everyone.", he: "כשהיום מלא, הלקוח ממתין לשעה מסוימת. אם מישהו מבטל, השעה מוצעת אוטומטית לראשון בתור ל־10 דקות לפני שהיא נפתחת לכולם." },
      x: { ar: "مثال: إلغاء في آخر لحظة لا يترك موعداً فارغاً.", en: "Example: a last-minute cancellation doesn't leave a slot empty.", he: "לדוגמה: ביטול ברגע האחרון לא משאיר משבצת ריקה." } },
    { key: "shop", included: "pro",
      t: { ar: "صفحة المنتجات", en: "Products page", he: "דף מוצרים" },
      d: { ar: "اعرض منتجاتك بأسعارها وصورها في التطبيق ليطلبها العميل ويستلمها في زيارته.", en: "Show your products with prices and photos in the app, for customers to pick up on their visit.", he: "הציגו מוצרים עם מחירים ותמונות באפליקציה, לאיסוף בביקור." },
      x: null },
    { key: "smart_checkout", included: "pro",
      t: { ar: "الدفع الذكي عند إنهاء الزيارة", en: "Smart Checkout", he: "קופה חכמה" },
      d: { ar: "تُنهي الزيارة وتسجل الدفع نقداً أو بالبطاقة مع الخصومات والدفع المجزأ والمبالغ المتبقية، ويحصل العميل على إيصال.", en: "Finish a visit and record the payment (cash or card at the reception) with discounts, split payments and balances due; the customer gets a receipt.", he: "סוגרים ביקור ורושמים תשלום (מזומן או כרטיס בקבלה) עם הנחות, תשלום מפוצל ויתרות; הלקוח מקבל קבלה." },
      x: null },
    { key: "financial_management", included: "pro",
      t: { ar: "الإدارة المالية والتقارير", en: "Finance and reports", he: "כספים ודוחות" },
      d: { ar: "الإيرادات والمصاريف والمبالغ المستحقة في مكان واحد، مع تقارير يومية وشهرية وتصدير Excel.", en: "Income, expenses and amounts due in one place, with daily and monthly reports and Excel export.", he: "הכנסות, הוצאות ויתרות במקום אחד, עם דוחות יומיים וחודשיים וייצוא ל־Excel." },
      x: { ar: "مثال: تعرف صافي ربح الشهر دون دفتر حسابات.", en: "Example: know the month's net profit without a ledger.", he: "לדוגמה: לדעת את הרווח הנקי של החודש בלי פנקס." } },
    { key: "employee_earnings", included: "pro",
      t: { ar: "رواتب وأرباح الموظفين", en: "Employee wages and earnings", he: "שכר ורווחי עובדים" },
      d: { ar: "راتب ثابت أو بالساعة أو عمولة أو إيجار كرسي أو غرفة لكل موظف، ويحسب التطبيق المستحقات والدفعات تلقائياً.", en: "Salary, hourly pay, commission or chair/room rent per employee; the app calculates what is owed and what was paid.", he: "משכורת, שכר שעתי, עמלה או השכרת כיסא או חדר לכל עובד; האפליקציה מחשבת מה מגיע ומה שולם." },
      x: null },
    { key: "employee_commissions", included: "pro",
      t: { ar: "عمولات المختصين", en: "Specialist commissions", he: "עמלות מומחים" },
      d: { ar: "نسبة أو مبلغ لكل خدمة أو منتج تُحسب تلقائياً بعد الدفع.", en: "A percentage or amount per service or product, calculated automatically after payment.", he: "אחוז או סכום לכל שירות או מוצר, מחושב אוטומטית אחרי התשלום." },
      x: null },
    { key: "attendance", included: "pro",
      t: { ar: "الحضور والانصراف", en: "Attendance", he: "נוכחות" },
      d: { ar: "يسجّل الموظف حضوره من هاتفه في مكان العمل (بالموقع أو رمز QR أو رمز متغيّر)، مع الوقت الإضافي والمراجعة.", en: "Employees clock in at work from their phone (location, QR code or rotating code), with overtime and review.", he: "העובד מחתים נוכחות מהטלפון במקום העבודה (מיקום, קוד QR או קוד מתחלף), כולל שעות נוספות ובקרה." },
      x: null },
    { key: "inventory", included: "pro",
      t: { ar: "المخزون", en: "Inventory", he: "מלאי" },
      d: { ar: "كميات المنتجات وتنبيه عند نقصها وحركة كل منتج والمشتريات والباركود.", en: "Product quantities, low-stock alerts, every movement, purchases and barcodes.", he: "כמויות מוצרים, התראות על מלאי נמוך, תנועות, רכש וברקודים." },
      x: { ar: "مثال: تنبيه عندما تبقى 3 قطع فقط من منتج.", en: "Example: an alert when only 3 units of a product are left.", he: "לדוגמה: התראה כשנשארו רק 3 יחידות ממוצר." } },
    { key: "deposits", included: "pro",
      t: { ar: "العربون وسياسة الإلغاء", en: "Deposits and cancellation policy", he: "מקדמה ומדיניות ביטול" },
      d: { ar: "اطلب عربوناً لخدمات معينة مع مهلة دفع، وحدد ما يحدث عند الإلغاء المتأخر أو عدم الحضور.", en: "Ask for a deposit on chosen services with a payment deadline, and decide what happens on late cancellations or no-shows.", he: "בקשו מקדמה לשירותים נבחרים עם מועד תשלום, וקבעו מה קורה בביטול מאוחר או אי־הגעה." },
      x: null },
    { key: "coupons", included: "pro",
      t: { ar: "الكوبونات", en: "Coupons", he: "קופונים" },
      d: { ar: "أكواد خصم بنسبة أو مبلغ ثابت مع حدود للاستخدام والتاريخ.", en: "Discount codes (percentage or fixed amount) with usage and date limits.", he: "קודי הנחה (אחוז או סכום קבוע) עם מגבלות שימוש ותאריך." },
      x: null },
    { key: "service_packages", included: "pro",
      t: { ar: "باقات الجلسات", en: "Session packages", he: "חבילות טיפולים" },
      d: { ar: "بِع باقة جلسات مدفوعة مسبقاً، وتُخصم جلسة تلقائياً عند كل زيارة مشمولة.", en: "Sell prepaid session packages; a session is deducted automatically on each included visit.", he: "מכרו חבילות מראש; טיפול יורד אוטומטית בכל ביקור כלול." },
      x: { ar: "مثال: باقة 5 جلسات ليزر بسعر أقل.", en: "Example: a 5-session laser package at a better price.", he: "לדוגמה: חבילת 5 טיפולי לייזר במחיר מוזל." } },
    { key: "retention_suggestions", included: "pro",
      t: { ar: "استعادة العملاء", en: "Win-back suggestions", he: "החזרת לקוחות" },
      d: { ar: "يعرض لك العملاء الذين لم يزوروك منذ فترة ويقترح كوبوناً لهم — أنت تقرر الإرسال.", en: "Shows customers who haven't visited for a while and suggests a coupon for them — you decide whether to send it.", he: "מציג לקוחות שלא ביקרו זמן מה ומציע להם קופון — אתם מחליטים אם לשלוח." },
      x: null },
  ];
  const PLAN_NAMES = { basic: "Basic", pro: "Pro", enterprise: "Enterprise" };
  const SUMMARY = {
    basic: { ar: "للمنشأة الصغيرة أو المختص المستقل: الحجز والجدول والإشعارات وإحصائيات آخر 30 يوماً، ومختص واحد. يمكن إضافة ميزة واحدة: نقاط الولاء أو قائمة الانتظار الذكية.", en: "For a small business or an independent specialist: booking, schedule, notifications and statistics for the last 30 days, with 1 specialist. One add-on available: Loyalty Coins or the Smart waitlist.", he: "לעסק קטן או למומחה עצמאי: הזמנות, לוח, התראות וסטטיסטיקה ל־30 יום, עם מומחה אחד. תוספת אחת אפשרית: מטבעות נאמנות או רשימת המתנה חכמה." },
    pro: { ar: "للمنشأة التي تدير فريقاً وأموالاً: كل ما في Basic مع 7 مختصين، وكل الميزات: الدفع الذكي والمالية ورواتب الموظفين والحضور والمخزون والولاء وقائمة الانتظار وكل سجل الإحصائيات.", en: "For a business running a team and its money: everything in Basic with 7 specialists and every feature — Smart Checkout, finance, employee wages, attendance, inventory, loyalty, waitlist and full statistics history.", he: "לעסק שמנהל צוות וכספים: כל מה שב־Basic עם 7 מומחים וכל הפיצ׳רים — קופה חכמה, כספים, שכר עובדים, נוכחות, מלאי, נאמנות, רשימת המתנה וכל היסטוריית הסטטיסטיקה." },
    enterprise: { ar: "للسلاسل والمنشآت الكبيرة: كل الميزات، وعدد المختصين والإضافات والسعر حسب الاتفاق، مع دعم مخصص.", en: "For chains and large businesses: every feature; specialists, extras and price as agreed, with dedicated support.", he: "לרשתות ולעסקים גדולים: כל הפיצ׳רים; מומחים, תוספות ומחיר לפי הסכם, עם תמיכה ייעודית." },
  };
  const cell = (f, plan) => {
    if (f.limit && f.limit[plan]) return `<span class="lim">${E(L(f.limit[plan]))}</span>`;
    if (f.limit && plan === "enterprise") return `<span class="yes">✓</span>`;
    const on = f.included === "all" || plan !== "basic";
    if (on) return `<span class="yes" aria-label="${E(Lang.t("مشمولة"))}">✓</span>`;
    if (f.included === "option") return `<span class="lim">${E(Lang.t("إضافة اختيارية"))}</span>`;
    return `<span class="no" aria-label="${E(Lang.t("غير مشمولة"))}">—</span>`;
  };
  // The comparison: plan cards, then every feature with its explanation one tap away.
  function html(current) {
    const plans = ["basic", "pro", "enterprise"];
    return `<div class="plans-cmp">
      <div class="plans-cards">${plans.map((p) => `<article class="plan-card ${current === p ? "current" : ""}">${p === "pro" ? `<span class="plan-tag">${E(Lang.t("الأكثر اختياراً"))}</span>` : ""}${current === p ? `<span class="plan-tag">${E(Lang.t("باقتك الحالية"))}</span>` : ""}<h4 data-i18n-skip>${E(PLAN_NAMES[p])}</h4><p>${E(L(SUMMARY[p]))}</p></article>`).join("")}</div>
      <div class="plans-table-wrap"><table class="plans-table"><thead><tr><th scope="col">${E(Lang.t("الميزة"))}</th>${plans.map((p) => `<th scope="col" data-i18n-skip>${E(PLAN_NAMES[p])}</th>`).join("")}</tr></thead>
        <tbody>${FEATURES.map((f) => `<tr><th scope="row">${E(L(f.t))}<details class="feat-more"><summary>${E(Lang.t("عرض المزيد"))}</summary><p>${E(L(f.d))}${f.x ? `<em>${E(L(f.x))}</em>` : ""}</p></details></th>${plans.map((p) => `<td data-label="${E(PLAN_NAMES[p])}">${cell(f, p)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
      <p class="plans-note">${E(Lang.t("في Basic يمكن إضافة ميزة واحدة: نقاط الولاء أو قائمة الانتظار الذكية. ويمكن إضافة مختصين أكثر من المشمول في Basic وPro."))}</p>
    </div>`;
  }
  function open(current) {
    UI.modal(`<div class="mhead"><h3>${E(Lang.t("مقارنة الباقات"))}</h3><button class="iconbtn" id="plans-x" aria-label="${E(Lang.t("إغلاق"))}">${UI.icon("x", 20)}</button></div>
      ${html(current)}<p class="plans-note">${E(Lang.t("تفعيل الميزات المدفوعة أو إضافة مختصين إضافيين يتم عبر إدارة METON."))}</p>`);
    document.getElementById("plans-x").onclick = UI.closeModal;
  }
  return { FEATURES, SUMMARY, PLAN_NAMES, html, open };
})();
