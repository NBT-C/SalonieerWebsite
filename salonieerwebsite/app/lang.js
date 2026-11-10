// Device-local UI language. This preference is independent of salon accounts.
window.Lang = (() => {
  const KEY = "salonieer:language:v1";
  const choices = { ar: "العربية", en: "English", he: "עברית" };
  const device = () => {
    const code = String(navigator.languages?.[0] || navigator.language || "en").split("-")[0].toLowerCase();
    return choices[code] ? code : "en";
  };
  let current = (() => { try { return choices[localStorage.getItem(KEY)] ? localStorage.getItem(KEY) : device(); } catch { return device(); } })();
  // Only exact application-owned strings are translated. Salon names, free
  // text, prices and customer input must never go through a translation API.
  const words = {
    "الرئيسية":["Home","בית"], "حجوزاتي":["My Bookings","ההזמנות שלי"], "المنتجات":["Products","מוצרים"],
    "الإشعارات":["Notifications","התראות"], "حسابي":["My Account","החשבון שלי"], "تسجيل الدخول":["Sign In","התחברות"],
    "إنشاء حساب جديد":["Create Account","יצירת חשבון"], "تسجيل الدخول مطلوب":["Sign in required","נדרשת התחברות"],
    "سجّل الدخول أو أنشئ حساباً للمتابعة.":["Sign in or create an account to continue.","יש להתחבר או ליצור חשבון כדי להמשיך."],
    "ليس الآن":["Not Now","לא עכשיו"], "تصفح صالون التجربة":["Browse Demo Business","עיון בעסק לדוגמה"], "تصفح العمل التجريبي":["Browse Demo Business","עיון בעסק לדוגמה"], "تصفح العمل التجريبي":["Browse Demo Business","עיון בעסק לדוגמה"],
    "الدخول إلى صالون التجربة":["Enter Demo Business","כניסה לעסק לדוגמה"], "الدخول إلى العمل التجريبي":["Enter Demo Business","כניסה לעסק לדוגמה"], "الدخول إلى العمل التجريبي":["Enter Demo Business","כניסה לעסק לדוגמה"], "المتابعة كضيف":["Continue as Guest","המשך כאורח"],
    "يمكنك تصفح الخدمات والأوقات دون حساب.":["Browse services and available times without an account.","אפשר לעיין בשירותים ובשעות הפנויות ללא חשבון."],
    "إضافة صالون":["Add Business","הוספת עסק"], "إضافة عمل":["Add Business","הוספת עסק"], "إضافة عمل":["Add Business","הוספת עסק"], "امسح رمز QR أو أدخل رمز الصالون.":["Scan a QR code or enter a business code.","סרקו קוד QR או הזינו קוד עסק."], "امسح رمز QR أو أدخل رمز العمل.":["Scan a QR code or enter a business code.","סרקו קוד QR או הזינו קוד עסק."], "امسح رمز QR أو أدخل رمز العمل.":["Scan a QR code or enter a business code.","סרקו קוד QR או הזינו קוד עסק."],
    "مسح رمز QR":["Scan QR Code","סריקת קוד QR"], "أو":["or","או"], "رمز الصالون":["Business Code","קוד עסק"], "رمز العمل":["Business Code","קוד עסק"], "رمز العمل":["Business Code","קוד עסק"],
    "إضافة الصالون":["Add Business","הוספת עסק"], "إضافة العمل":["Add Business","הוספת עסק"], "إضافة العمل":["Add Business","הוספת עסק"], "جاري التحقق...":["Checking…","בודק…"], "رجوع":["Back","חזרה"],
    "اختر الصالون":["Choose a Business","בחירת עסק"], "اختر العمل":["Choose a Business","בחירת עסק"], "اختر العمل":["Choose a Business","בחירת עסק"], "فتح":["Open","פתיחה"], "إزالة":["Remove","הסרה"],
    "إضافة صالون آخر":["Add Another Business","הוספת עסק נוסף"], "إضافة عمل آخر":["Add Another Business","הוספת עסק נוסף"], "إضافة عمل آخر":["Add Another Business","הוספת עסק נוסף"], "الإزالة تحذف الصالون من هذا الجهاز فقط.":["Removing a business only removes it from this device.","הסרת העסק מתבצעת מהמכשיר הזה בלבד."], "الإزالة تحذف العمل من هذا الجهاز فقط.":["Removing a business only removes it from this device.","הסרת העסק מתבצעת מהמכשיר הזה בלבד."], "الإزالة تحذف العمل من هذا الجهاز فقط.":["Removing a business only removes it from this device.","הסרת העסק מתבצעת מהמכשיר הזה בלבד."],
    "صالوناتي":["My Businesses","העסקים שלי"], "أعمالي":["My Businesses","העסקים שלי"], "أعمالي":["My Businesses","העסקים שלי"], "أدخل رقم هاتفك للمتابعة":["Enter your phone number to continue","הזינו מספר טלפון להמשך"],
    "رقم الهاتف":["Phone Number","מספר טלפון"], "متابعة":["Continue","המשך"], "إنشاء حساب جديد":["Create a new account","יצירת חשבון חדש"],
    "الشروط والأحكام":["Terms & Conditions","תנאים והגבלות"], "أدخل بياناتك":["Enter your details","הזינו את הפרטים שלכם"],
    "الاسم الكامل":["Full Name","שם מלא"], "كلمة المرور":["Password","סיסמה"], "تأكيد كلمة المرور":["Confirm Password","אישור סיסמה"],
    "إنشاء الحساب":["Create Account","יצירת חשבון"], "لديك حساب؟":["Already have an account?","כבר יש לכם חשבון?"],
    "تغيير رقم الهاتف":["Change Phone Number","שינוי מספר טלפון"], "أدخل كلمة المرور":["Enter Password","הזינו סיסמה"],
    "أنشئ كلمة مرور":["Create Password","יצירת סיסמה"], "تأكيد وإنشاء الحساب":["Confirm and Create Account","אישור ויצירת חשבון"],
    "حجز موعد":["Book an Appointment","קביעת תור"], "احجز موعد":["Book Appointment","קביעת תור"], "تأكيد الحجز":["Confirm Booking","אישור ההזמנה"],
    "المختصون":["Specialists","אנשי מקצוע"], "الخدمات":["Services","שירותים"], "المواعيد":["Available Times","שעות פנויות"],
    "اختر المختص لعرض خدماته والحجز.":["Choose a specialist to see services and book.","בחרו איש מקצוע להצגת שירותים וקביעת תור."],
    "ابحث عن مختص أو خدمة":["Search specialists or services","חיפוש איש מקצוע או שירות"], "عرض الخدمات":["View Services","הצגת שירותים"],
    "مفتوح للحجز":["Open for bookings","פתוח להזמנות"], "مغلق الآن":["Closed now","סגור כעת"], "الصالون مغلق حالياً":["The business is currently closed","העסק סגור כעת"], "العمل مغلق حالياً":["The business is currently closed","העסק סגור כעת"], "العمل مغلق حالياً":["The business is currently closed","העסק סגור כעת"],
    "اختر الخدمة":["Choose a service","בחרו שירות"], "اختر اليوم":["Choose a day","בחרו יום"], "اختر الوقت":["Choose a time","בחרו שעה"],
    "أقرب موعد متاح":["Next Available Time","התור הפנוי הקרוב"], "اختر الخدمة أولاً ثم اضغط هنا":["Choose a service first","בחרו שירות תחילה"],
    "اختر خدمة ويوماً أولاً":["Choose a service and day first","בחרו שירות ויום תחילה"], "جارٍ تحميل الأوقات…":["Loading times…","טוען שעות…"],
    "لا توجد أوقات متاحة":["No available times","אין שעות פנויות"], "لا توجد أيام عمل متاحة":["No working days available","אין ימי עבודה זמינים"],
    "لا توجد مواعيد متاحة في هذا اليوم.":["No times are available on this day.","אין תורים פנויים ביום זה."],
    "الحجز على اسم شخص آخر":["Book for someone else","הזמנה עבור אדם אחר"], "اسم صاحب الموعد":["Appointment holder's name","שם בעל התור"],
    "المدة":["Duration","משך"], "التكلفة":["Price","מחיר"], "تفاصيل المنتج":["Product Details","פרטי המוצר"],
    "متوفر":["Available","זמין"], "غير متوفر":["Unavailable","לא זמין"], "غير متوفر حالياً":["Currently unavailable","לא זמין כעת"],
    "الصفحة غير موجودة":["Page not found","העמוד לא נמצא"], "تعذّر تحميل الصفحة":["Unable to load page","לא ניתן לטעון את העמוד"],
    "التفضيلات":["Preferences","העדפות"], "الحساب":["Account","חשבון"], "الصالون":["Business","עסק"], "العمل":["Business","עסק"], "العمل":["Business","עסק"],
    "الوضع الداكن":["Dark Mode","מצב כהה"], "تنبيهات حالة الحجز":["Booking status alerts","התראות על מצב הזמנה"],
    "تعديل الاسم":["Edit Name","עריכת שם"], "تغيير كلمة المرور":["Change Password","שינוי סיסמה"], "حذف الحساب":["Delete Account","מחיקת חשבון"],
    "سيُحذف حسابك وبياناتك الشخصية نهائياً. ستُحفظ السجلات التجارية المطلوبة بعد إزالة هويتك.":["Your account and personal data will be permanently deleted. Required business records will be kept without your identity.","החשבון והנתונים האישיים שלך יימחקו לצמיתות. רשומות עסקיות נדרשות יישמרו ללא פרטים מזהים."],
    "أدخل كلمة مرورك لتأكيد الحذف":["Enter your password to confirm deletion","הזינו את הסיסמה לאישור המחיקה"],
    "حذف حسابي نهائياً":["Permanently Delete My Account","מחיקת החשבון לצמיתות"], "إلغاء":["Cancel","ביטול"],
    "اللغة":["Language","שפה"], "الدعم والتواصل":["Support & Contact","תמיכה ויצירת קשר"],
    "معلومات التطبيق":["App Information","פרטי היישום"], "سياسة الخصوصية":["Privacy Policy","מדיניות פרטיות"],
    "تسجيل الخروج":["Sign Out","התנתקות"], "هل تريد تسجيل الخروج؟":["Sign out?","להתנתק?"],
    "فعّل الإشعارات":["Enable Notifications","הפעלת התראות"], "ليصلك تأكيد الحجز وتغييرات الموعد والتذكير قبل زيارتك.":["Get booking confirmations, changes, and appointment reminders.","קבלו אישורי הזמנה, שינויים ותזכורות לתור."],
    "تفعيل الآن":["Enable Now","הפעלה כעת"], "لاحقاً":["Not Now","לא עכשיו"],
    "السبت":["Saturday","שבת"], "الأحد":["Sunday","יום ראשון"], "الاثنين":["Monday","יום שני"],
    "الثلاثاء":["Tuesday","יום שלישי"], "الأربعاء":["Wednesday","יום רביעי"], "الخميس":["Thursday","יום חמישי"], "الجمعة":["Friday","יום שישי"],
    "صباحاً":["AM","בוקר"], "بعد الظهر":["Afternoon","אחר הצהריים"], "مساءً":["PM","ערב"], "ليلاً":["Night","לילה"],
    ...window.SalonieerTranslations
  };
  const locale = () => ({ar:"ar", en:"en", he:"he"})[current];
  function t(ar) {
    const input = String(ar ?? "");
    if (current === "ar") return input;
    const row = words[input] || words[input.trim()];
    return row ? row[current === "he" ? 1 : 0] : input;
  }
  // Server errors are localized at their boundary. Never show raw SQL details,
  // PostgREST internals, or an unexpected English/Arabic error to a customer.
  const serverErrors = [
    [/invalid login credentials|invalid_grant|رقم الهاتف أو كلمة المرور غير صحيحة/i, ["بيانات الدخول غير صحيحة", "Invalid login credentials", "פרטי ההתחברות שגויים"]],
    [/email not confirmed|email_not_confirmed/i, ["أكد بريدك الإلكتروني قبل تسجيل الدخول", "Confirm your email before signing in", "אשרו את כתובת הדוא״ל לפני ההתחברות"]],
    [/user already registered|already been registered|رقم الهاتف مسجل مسبقاً/i, ["هذا الحساب مسجل مسبقاً", "This account is already registered", "החשבון הזה כבר רשום"]],
    [/password.*(short|weak)|كلمة المرور قصيرة|كلمة المرور يجب/i, ["اختر كلمة مرور أقوى", "Choose a stronger password", "בחרו סיסמה חזקה יותר"]],
    [/rate limit|too many requests|عدد كبير|محاولات كثيرة/i, ["محاولات كثيرة. حاول لاحقاً.", "Too many attempts. Try again later.", "יותר מדי ניסיונות. נסו שוב מאוחר יותר."]],
    [/jwt|session|token|جلسة|الرجاء تسجيل الدخول|سجل الدخول/i, ["انتهت جلستك. سجّل الدخول مجدداً.", "Your session expired. Please sign in again.", "תוקף ההתחברות פג. יש להתחבר מחדש."]],
    [/الميزة غير مفعلة|feature.*disabled/i, ["هذه الميزة غير متاحة لهذا العمل", "This feature is unavailable for this business", "התכונה הזאת אינה זמינה בעסק הזה"]],
    [/هذا الموعد|already booked|time slot|موعد محجوز|exclusion constraint/i,["الموعد لم يعد متاحاً. اختر وقتاً آخر.", "This time is no longer available. Choose another.", "השעה הזאת כבר אינה פנויה. בחרו שעה אחרת."]],
    // A database rule refused the data (missing / invalid value): never show the raw SQL text.
    [/null value in column|violates (not-null|check|foreign key|unique) constraint|duplicate key value|invalid input (syntax|value)/i, ["تعذّر الحفظ: معلومة مطلوبة ناقصة أو غير صحيحة. حاول مجدداً، وإذا تكرر ذلك تواصل مع العمل.", "Couldn't save: some required information is missing or invalid. Try again, and contact the business if it keeps happening.", "לא ניתן לשמור: חסר מידע נדרש או שהוא שגוי. נסו שוב, ואם זה חוזר פנו לעסק."]],
    [/network|failed to fetch|load failed|aborterror|timeout|تعذّر الاتصال/i, ["تعذّر الاتصال. تحقق من الإنترنت وحاول مجدداً.", "Connection failed. Check the internet and try again.", "החיבור נכשל. בדקו את האינטרנט ונסו שוב."]],
    [/permission|not authorized|forbidden|غير مصرح|ليس لديك صلاحية/i, ["ليس لديك صلاحية لهذا الإجراء", "You do not have permission for this action", "אין לך הרשאה לבצע את הפעולה הזאת"]],
    [/not found|غير موجود/i, ["العنصر المطلوب غير موجود", "The requested item was not found", "הפריט המבוקש לא נמצא"]],
  ];
  function error(value) {
    const message = String(value?.rawMessage || value?.message || value || "").trim();
    if (current === "ar" && /[\u0600-\u06ff]/.test(message)) return message;
    if (words[message]) return t(message);
    for (const [pattern, row] of serverTemplates) {
      const match = message.match(pattern);
      if (match) {
        let part = 0;
        return row[current === "he" ? 1 : 0].replace(/%/g, () => match[++part]);
      }
    }
    for (const [pattern, pair] of serverErrors) if (pattern.test(message)) return pair[{ar:0,en:1,he:2}[current]];
    return current === "ar" ? "تعذّر إكمال العملية. حاول مجدداً."
      : current === "he" ? "לא ניתן להשלים את הפעולה. נסו שוב." : "Could not complete the request. Please try again.";
  }
  function localized(ar, en) {
    if (current === "ar") return ar || en || "";
    if (current === "en") return en || t(ar || "");
    return words[ar]?.[1] || en || "";
  }
  function number(value) { return Number(value || 0).toLocaleString(locale()); }
  function duration(value) {
    const n = Math.max(0, Math.round(Number(value) || 0));
    const unit = (amount, hour) => {
      if (current === "ar") {
        if (amount === 1) return hour ? "ساعة" : "دقيقة";
        if (amount === 2) return hour ? "ساعتان" : "دقيقتان";
        return number(amount) + " " + (amount >= 3 && amount <= 10
          ? hour ? "ساعات" : "دقائق" : hour ? "ساعة" : "دقيقة");
      }
      return number(amount) + " " + (current === "he"
        ? hour ? amount === 1 ? "שעה" : "שעות" : amount === 1 ? "דקה" : "דקות"
        : hour ? amount === 1 ? "hour" : "hours" : amount === 1 ? "minute" : "minutes");
    };
    const hours = Math.floor(n / 60), minutes = n % 60;
    return hours ? unit(hours, true) + (minutes ? (current === "ar" ? " و" : current === "he" ? " ו־" : " and ") + unit(minutes, false) : "")
      : unit(minutes, false);
  }
  function notification(item) {
    const kind = String(item?.kind || "");
    const translated = item?.details?.i18n?.[current];
    // Every alert that carries its own complete copy in the reader's language
    // uses it: salon announcements, business alerts (biz_*) and — 2.34 — the
    // team, membership and reassignment alerts (they stayed Arabic before).
    if (translated?.title)
      return {title:translated.title, body:translated.body || ""};
    if (current === "ar")
      return {title:item?.title || "", body:item?.body || ""};
    const he=current === "he";
    const choose=(english,hebrew)=>he?hebrew:english;
    const status=kind.replace(/^(customer|barber)_booking_/, "");
    const customer=kind.startsWith("customer_booking_");
    const barber=kind.startsWith("barber_booking_");
    const headings={created:["Booking request sent","בקשת התור נשלחה"],confirmed:["Your booking is confirmed","התור שלך אושר"],cancelled:["Your booking was cancelled","התור שלך בוטל"],completed:["Thank you for your visit","תודה על הביקור"],rescheduled:["Your booking time changed","מועד התור שלך השתנה"],no_show:["Booking update","עדכון בנוגע לתור"]};
    const staffHeadings={created:["New booking","תור חדש"],removed:["Booking removed from your schedule","תור הוסר מלוח הזמנים שלך"],rescheduled:["Booking time changed","מועד התור השתנה"]};
    const customerBodies={created:["We sent your request to the business and will notify you when it is confirmed.","הבקשה נשלחה לעסק. נעדכן אותך לאחר האישור."],confirmed:["Your appointment is confirmed.","התור שלך אושר."],cancelled:["Your appointment was cancelled.","התור שלך בוטל."],completed:["Your visit is complete.","הביקור שלך הושלם."],rescheduled:["Your appointment date or time has changed.","התאריך או השעה של התור שלך השתנו."],pending:["Your request is awaiting confirmation.","הבקשה שלך ממתינה לאישור."],no_show:["The appointment was marked as a no-show.","התור סומן כאי־הגעה."]};
    const staffBodies={created:["A new appointment was booked.","נקבע תור חדש."],removed:["A booking was moved or unassigned.","התור הועבר או בוטל השיוך שלו."],rescheduled:["The appointment date or time changed.","מועד התור השתנה."]};
    if (customer || barber || kind === "reminder") {
      const head=customer?headings[status]||["Your booking was updated","התור שלך עודכן"]:barber?staffHeadings[status]||["Booking status updated","סטטוס התור עודכן"]:["Appointment reminder","תזכורת לתור"];
      const intro=customer?customerBodies[status]||["Your appointment details were updated.","פרטי התור שלך עודכנו."]:barber?staffBodies[status]||["A booking on your schedule was updated.","תור בלוח הזמנים שלך עודכן."]:["Your appointment is coming up.","התור שלך מתקרב."];
      const details=item.details||{}, lines=[];
      const add=(value,labelEn,labelHe)=>{if(value)lines.push(choose(labelEn,labelHe)+value);};
      if(barber)add(details.customer,"Customer: ","לקוח: ");
      add(details.service,"Service: ","שירות: ");
      if(!barber)add(details.specialist,"Specialist: ","איש מקצוע: ");
      if(details.date&&details.time)add(details.date+" · "+String(details.time).slice(0,5),"Appointment: ","תור: ");
      const pay=details.payment||{};
      if(pay.method==="coins")lines.push(choose(`Paid with Loyalty Coins (${pay.coins} coins)`,`שולם במטבעות מועדון (${pay.coins} מטבעות)`));
      else if(pay.refunded_coins!=null)add(pay.refunded_coins,"Coins refunded: ","מטבעות שהוחזרו: ");
      else if(pay.method==="salon"&&status!=="removed")lines.push(choose("Payment at the business","תשלום בעסק"));
      if(kind==="customer_booking_completed"&&pay.earned_coins!=null)lines.push(choose(`Coins earned: ${pay.earned_coins} · Balance: ${pay.balance}`,`מטבעות שנצברו: ${pay.earned_coins} · יתרה: ${pay.balance}`));
      return {title:choose(...head),body:[choose(...intro),...lines].join("\n")};
    }
    if(kind==="test")return {title:choose("Test notification","התראת בדיקה"),body:choose("METON notifications are ready on this device.","ההתראות של METON מוכנות במכשיר הזה.")};
    if(kind==="owner_activity" && item.title==="تم تحديث أوقات العمل") {
      const name=String(item.body||"").split(" قام بتحديث أوقات عمله.")[0];
      return {title:choose("Working hours updated","שעות העבודה עודכנו"),body:name&&name!==item.body?name+choose(" updated their working hours."," עדכן את שעות העבודה שלו."):choose("A specialist updated their working hours.","איש מקצוע עדכן את שעות העבודה שלו.")};
    }
    if(kind==="owner_activity" && ["طلب استبدال نقاط جديد","ألغى العميل طلب استبدال"].includes(item.title)) {
      const requested=item.title==="طلب استبدال نقاط جديد",source=String(item.body||""),amount=source.match(/(\d+) نقطة/)?.[1],reward=source.split(requested?"مقابل: ":"ألغى طلب: ")[1]?.split(/[.\n]/)[0];
      const name=source.split(requested?" استبدل ":" ألغى طلب:")[0];
      return {title:requested?choose("New coin redemption request","בקשת מימוש מטבעות חדשה"):choose("Redemption request cancelled","בקשת המימוש בוטלה"),body:(requested?choose("A customer redeemed coins.","לקוח מימש מטבעות."):choose("A customer cancelled a redemption request; coins were refunded.","לקוח ביטל בקשת מימוש; המטבעות הוחזרו."))+(amount?" "+amount+choose(" coins."," מטבעות."):"")+(name&&name!==source?" "+choose("Customer: ","לקוח: ")+name+".":"")+(reward?" "+choose("Reward: ","הטבה: ")+reward:"")};
    }
    if(kind==="announcements" && ["تم تسليم طلبك","أُلغي طلب الاستبدال"].includes(item.title)) {
      const delivered=item.title==="تم تسليم طلبك",reward=String(item.body||"").split(delivered?"استلمت: ":"مقابل: ")[1]?.split(".")[0];
      return {title:delivered?choose("Your reward was delivered","ההטבה שלך נמסרה"):choose("Redemption cancelled","המימוש בוטל"),body:(delivered?choose("Your reward was delivered.","ההטבה שלך נמסרה."):choose("The coins were returned to your balance.","המטבעות הוחזרו ליתרה שלך."))+(reward?" "+choose("Reward: ","הטבה: ")+reward:"")};
    }
    if(kind==="announcements" || kind==="announcement")return {title:item?.title||"",body:item?.body||""};
    return {title:ui(item?.title || ""), body:ui(item?.body || "")};
  }
  function date(value, opts = {day:"numeric", month:"long", year:"numeric"}) {
    const raw = String(value || "");
    const day = new Date(raw + (raw.length <= 10 ? "T00:00:00" : ""));
    return Number.isNaN(day.getTime()) ? raw : new Intl.DateTimeFormat(locale(), opts).format(day);
  }
  const phrases = Object.keys(words).filter(key => /[\u0600-\u06ff]/.test(key)).sort((a,b) => b.length-a.length);
  const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // Most specific first: "% إضافة مختص" must win over "% مختص", "إزالة % من صالوناتي؟" over "%؟".
  const serverTemplates = Object.entries(words).filter(([key]) => key.includes("%"))
    .sort((a, b) => b[0].replace(/%/g, "").length - a[0].replace(/%/g, "").length)
    .map(([key,row]) => [new RegExp("^" + key.split("%").map(escapeRegex).join("(.+?)") + "$", "u"), row]);
  // For app-owned labels joined to counts, translate the known label and keep
  // the number. Never translate arbitrary prose from a salon or a customer.
  function ui(value) {
    const raw = String(value ?? "");
    const original = raw.trim();
    // Markup often wraps a sentence over several source lines; the catalog
    // key has single spaces. Matching on the collapsed form translates the
    // sentence as one unit instead of in mismatched pieces.
    const trimmed = original.replace(/\s+/g, " ");
    if (current !== "en" && window.SalonieerEnglishLabels?.[trimmed])
      return raw.replace(original, window.SalonieerEnglishLabels[trimmed][current === "he" ? 1 : 0]);
    if (current === "ar" || !/[\u0600-\u06ff]/.test(raw)) return raw;
    if (words[trimmed]) return raw.replace(original, t(trimmed));
    for (const [pattern, row] of serverTemplates) {
      const match = trimmed.match(pattern);
      if (!match) continue;
      let part = 0;
      return raw.replace(original, row[current === "he" ? 1 : 0].replace(/%/g, () => match[++part]));
    }
    let result = raw.replace(original, trimmed);
    for (const key of phrases) {
      if (key.length < 3 || !result.includes(key)) continue;
      const expression = new RegExp(`(^|[^\\p{L}])(${escapeRegex(key)})(?=$|[^\\p{L}])`, "gu");
      result = result.replace(expression, (_, before) => before + t(key));
    }
    return /[\u0600-\u06ff]/.test(result) ? raw : result;
  }
  function apply() {
    document.documentElement.lang = current;
    document.documentElement.dir = current === "en" ? "ltr" : "rtl";
  }
  // Changing the language keeps the person exactly where they are. The screen
  // they are on is redrawn underneath a short (0.8 s), localized loading veil instead
  // of reloading the document (a reload re-ran salon selection and could land
  // on the salon picker). Without a registered redraw (tests, very early boot)
  // the old full reload is still the safe fallback.
  const changeHandlers = new Set();
  const SWITCH_MS = 800;
  const switchingCopy = { ar: "جارٍ تغيير اللغة…", en: "Changing language…", he: "מחליף שפה…" };
  function veil(next) {
    const el = document.createElement("div");
    el.className = "language-veil";
    el.setAttribute("data-i18n-skip", "");
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.innerHTML = `<div class="language-veil-card"><span class="language-veil-spinner" aria-hidden="true"></span><b>${switchingCopy[next]}</b><small>${choices[next]}</small></div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    return el;
  }
  let switching = null;
  async function set(next) {
    if (!choices[next] || next === current) return;
    current = next;
    try { localStorage.setItem(KEY, next); } catch {}
    apply();
    window.NativeBridge?.request?.("language", {language:next}).catch(()=>{});
    if (!changeHandlers.size || !document.body?.appendChild) { location.reload(); return; }
    const token = switching = {};
    const shade = veil(next);
    const wait = new Promise(resolve => setTimeout(resolve, SWITCH_MS));
    try {
      await Promise.all([wait, ...[...changeHandlers].map(fn => Promise.resolve().then(() => fn(next)).catch(error => console.warn(error)))]);
    } finally {
      if (token === switching) {
        shade.classList.remove("show");
        setTimeout(() => shade.remove(), 220);
      } else shade.remove();
    }
  }
  function onChange(fn) { changeHandlers.add(fn); return () => changeHandlers.delete(fn); }
  // compact=true: just the control, for rows that already carry a visible
  // "Language" label (a second copy squeezed the row and split the word).
  function selector(opts = {}) {
    const control = `<select id="salonieer-language" aria-label="${t("اللغة")}">${Object.entries(choices).map(([k,v]) => `<option data-i18n-skip value="${k}" ${current === k ? "selected" : ""}>${v}</option>`).join("")}</select>`;
    return opts.compact ? `<span class="language-choice compact">${control}</span>` : `<label class="language-choice"><span>${t("اللغة")}</span>${control}</label>`;
  }
  function wireSelector() { document.getElementById("salonieer-language")?.addEventListener("change", event => set(event.target.value)); }
  function translate(root) {
    if (!root) return;
    const visit = node => {
      if (node.nodeType === 3) {
        const raw = node.nodeValue;
        if (!/[؀-ۿ]/.test(raw) && !(current !== "en" && window.SalonieerEnglishLabels?.[raw.trim()])) return;
        if (node.parentElement?.closest("script,style,textarea,[data-i18n-skip]")) return;
        const translated = ui(raw);
        if (translated !== raw) node.nodeValue = translated;
      } else if (node.nodeType === 1 && !node.closest("script,style,[data-i18n-skip]")) {
        // A text area's placeholder and label are app copy and are translated;
        // what is typed inside it is the person's own text and never is.
        const typed = node.closest("textarea");
        if (typed && typed !== node) return;
        for (const a of ["placeholder", "aria-label", "title", "alt", "data-label"]) if (node.hasAttribute(a)) {
          const raw = node.getAttribute(a), translated = ui(raw);
          if (translated !== raw) node.setAttribute(a, translated);
        }
        if (!typed) for (const child of node.childNodes) visit(child);
      }
    };
    visit(root);
  }
  apply();
  const observer = new MutationObserver(records => {
    observer.disconnect();
    for (const record of records) {
      if (record.type === "characterData") translate(record.target);
      for (const node of record.addedNodes) translate(node);
    }
    // A page that is being torn down (closed web view) has no document left to watch.
    try { observer.observe(document, {childList:true, subtree:true, characterData:true}); } catch {}
  });
  observer.observe(document, {childList:true, subtree:true, characterData:true});
  return {t, ui, error, localized, number, duration, date, locale, notification, get: () => current, set, onChange, selector, wireSelector};
})();
