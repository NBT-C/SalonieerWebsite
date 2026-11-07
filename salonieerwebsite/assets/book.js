// METON booking pages (2.44, redesigned 2026-11-07 to match the METON app's booking screens).
//  /s/<code>  a business's own booking page: service → specialist → time → phone → verification → name → request.
//             No account. A small app strip that never blocks booking (BOOK-006, NEW-015).
//  /m/<token> one booking's private link: status, details, cancel within the business's rules (GUEST-001..004).
//  /me        My bookings: the bookings made with a verified number (AUTH-004/005, IDENT-006).
//  /forgot    business account password reset by email code (BIZ-001).
// runBooking() is the ONE booking interface: the real pages and both Try METON Free demos (assets/demo.js) use it; only
// the data source differs. A demo source never calls the server: its verification code is made and checked in the
// page, nothing is sent, booked or saved anywhere else (NEW-011, R-05).

export const W = {
  loading: { en: 'Loading…', ar: 'جارٍ التحميل…', he: 'טוען…' },
  notFound: { en: 'This booking link isn’t valid. Ask the business for its link again.', ar: 'رابط الحجز غير صحيح. اطلب الرابط من صاحب العمل من جديد.', he: 'קישור ההזמנה אינו תקין. בקשו מהעסק את הקישור שוב.' },
  stepService: { en: 'Service', ar: 'الخدمة', he: 'שירות' },
  stepSpecialist: { en: 'Specialist', ar: 'المختص', he: 'איש מקצוע' },
  stepTime: { en: 'Time', ar: 'الموعد', he: 'מועד' },
  stepDetails: { en: 'Your details', ar: 'بياناتك', he: 'הפרטים שלך' },
  steps: { en: 'Booking steps', ar: 'خطوات الحجز', he: 'שלבי ההזמנה' },
  chooseService: { en: 'Choose a service', ar: 'اختر الخدمة', he: 'בחרו שירות' },
  chooseSpecialist: { en: 'Choose a specialist', ar: 'اختر المختص', he: 'בחרו איש מקצוע' },
  chooseTime: { en: 'Choose a day and time', ar: 'اختر اليوم والوقت', he: 'בחרו יום ושעה' },
  noServices: { en: 'This business has no services to book online yet.', ar: 'لا توجد خدمات متاحة للحجز عبر الإنترنت في هذا العمل بعد.', he: 'לעסק הזה עדיין אין שירותים להזמנה מקוונת.' },
  closed: { en: 'This business isn’t taking bookings right now.', ar: 'هذا العمل لا يستقبل حجوزات حالياً.', he: 'העסק הזה לא מקבל הזמנות כרגע.' },
  offline: { en: 'Online booking isn’t open yet. Contact the business to book.', ar: 'الحجز عبر الإنترنت غير متاح بعد. تواصل مع العمل للحجز.', he: 'הזמנה מקוונת עדיין לא פתוחה. פנו לעסק כדי להזמין.' },
  noNew: { en: 'This business isn’t accepting new customers online.', ar: 'هذا العمل لا يستقبل عملاء جدداً عبر الإنترنت.', he: 'העסק הזה לא מקבל לקוחות חדשים באופן מקוון.' },
  noTimes: { en: 'No free times on this day. Try another day.', ar: 'لا توجد أوقات متاحة في هذا اليوم. جرّب يوماً آخر.', he: 'אין זמנים פנויים ביום הזה. נסו יום אחר.' },
  noDays: { en: 'No working days are open for booking right now.', ar: 'لا توجد أيام عمل متاحة للحجز حالياً.', he: 'אין כרגע ימי עבודה פתוחים להזמנה.' },
  morning: { en: 'Morning', ar: 'صباحاً', he: 'בוקר' },
  afternoon: { en: 'Afternoon', ar: 'بعد الظهر', he: 'צהריים' },
  evening: { en: 'Evening', ar: 'مساءً', he: 'ערב' },
  today: { en: 'Today', ar: 'اليوم', he: 'היום' },
  tomorrow: { en: 'Tomorrow', ar: 'غداً', he: 'מחר' },
  free: { en: 'Free', ar: 'مجاناً', he: 'חינם' },
  back: { en: 'Back', ar: 'رجوع', he: 'חזרה' },
  next: { en: 'Continue', ar: 'متابعة', he: 'המשך' },
  change: { en: 'Change', ar: 'تغيير', he: 'שינוי' },
  minutes: { en: 'min', ar: 'دقيقة', he: 'דק׳' },
  phoneTitle: { en: 'Your phone number', ar: 'رقم هاتفك', he: 'מספר הטלפון שלך' },
  phoneWhy: { en: 'We confirm the number with a short code, then ask for your name.', ar: 'نتحقق من الرقم برمز قصير، ثم نسأل عن اسمك.', he: 'נאמת את המספר בקוד קצר, ואז נשאל לשמך.' },
  phoneWhyNone: { en: 'The business uses it to reach you about this booking.', ar: 'يستخدمه العمل للتواصل معك بخصوص هذا الحجز.', he: 'העסק ישתמש בו כדי ליצור איתך קשר לגבי ההזמנה.' },
  phonePrivate: { en: 'Only {business} sees your number. No account needed.', ar: 'لا يرى رقمك إلا {business}. لا حاجة لحساب.', he: 'רק {business} רואה את המספר שלך. אין צורך בחשבון.' },
  phone: { en: 'Phone number', ar: 'رقم الهاتف', he: 'מספר טלפון' },
  dialCode: { en: 'Country code', ar: 'رمز الدولة', he: 'קידומת מדינה' },
  invalidPhone: { en: 'Enter a valid mobile number.', ar: 'أدخل رقم هاتف محمول صحيحاً.', he: 'הזינו מספר נייד תקין.' },
  codeTitle: { en: 'Enter the code', ar: 'أدخل الرمز', he: 'הזינו את הקוד' },
  codeSentWa: { en: 'We sent a 6-digit code to {phone} on WhatsApp.', ar: 'أرسلنا رمزاً من 6 أرقام إلى {phone} عبر واتساب.', he: 'שלחנו קוד בן 6 ספרות אל {phone} ב-WhatsApp.' },
  codeForDemo: { en: 'Verifying {phone}.', ar: 'جارٍ التحقق من {phone}.', he: 'מאמתים את {phone}.' },
  code: { en: 'Code', ar: 'الرمز', he: 'קוד' },
  verify: { en: 'Verify', ar: 'تحقق', he: 'אימות' },
  resend: { en: 'Send a new code', ar: 'إرسال رمز جديد', he: 'שליחת קוד חדש' },
  resendIn: { en: 'New code in {s} s', ar: 'رمز جديد بعد {s} ث', he: 'קוד חדש בעוד {s} שנ׳' },
  wrongCode: { en: 'That code isn’t right. {left} tries left.', ar: 'الرمز غير صحيح. تبقّى {left} محاولات.', he: 'הקוד שגוי. נותרו {left} ניסיונות.' },
  codeSix: { en: 'Enter the 6 digits of the code.', ar: 'أدخل الأرقام الستة للرمز.', he: 'הזינו את 6 הספרות של הקוד.' },
  codeExpired: { en: 'This code has expired. Send a new one.', ar: 'انتهت صلاحية الرمز. أرسل رمزاً جديداً.', he: 'תוקף הקוד פג. שלחו קוד חדש.' },
  codeTooSoon: { en: 'Please wait a moment before asking for another code.', ar: 'انتظر قليلاً قبل طلب رمز آخر.', he: 'המתינו רגע לפני בקשת קוד נוסף.' },
  codeNotSent: { en: 'We couldn’t send the code. Try again in a moment.', ar: 'تعذّر إرسال الرمز. حاول بعد قليل.', he: 'לא הצלחנו לשלוח את הקוד. נסו שוב בעוד רגע.' },
  changeNumber: { en: 'Change number', ar: 'تغيير الرقم', he: 'שינוי המספר' },
  // the simulated code of both demos (NEW-011/012)
  demoOtpTitle: { en: 'Demo verification code', ar: 'رمز التحقق التجريبي', he: 'קוד אימות לדוגמה' },
  demoOtpHow: { en: 'This is a demo code. Copy it and paste it into the verification field below.', ar: 'هذا رمز تجريبي. انسخه والصقه في خانة التحقق أدناه.', he: 'זהו קוד לדוגמה. העתיקו אותו והדביקו בשדה האימות שלמטה.' },
  demoOtpNoMsg: { en: 'No WhatsApp message was sent. Real bookings use WhatsApp verification when required.', ar: 'لم تُرسل أي رسالة واتساب. الحجوزات الحقيقية تستخدم التحقق عبر واتساب عند الحاجة.', he: 'לא נשלחה הודעת WhatsApp. בהזמנות אמיתיות משתמשים באימות ב-WhatsApp כשצריך.' },
  copyCode: { en: 'Copy code', ar: 'نسخ الرمز', he: 'העתקת הקוד' },
  codeCopied: { en: 'Copied', ar: 'تم النسخ', he: 'הועתק' },
  newDemoCode: { en: 'Get a new demo code', ar: 'رمز تجريبي جديد', he: 'קוד לדוגמה חדש' },
  trusted: { en: 'This browser is already verified for this number.', ar: 'هذا المتصفح موثّق مسبقاً لهذا الرقم.', he: 'הדפדפן הזה כבר מאומת למספר הזה.' },
  nameTitle: { en: 'Your name', ar: 'اسمك', he: 'השם שלך' },
  areYou: { en: 'Are you {name}?', ar: 'هل أنت {name}؟', he: 'האם את/ה {name}?' },
  yesMe: { en: 'Yes, that’s me', ar: 'نعم، هذا أنا', he: 'כן, זה אני' },
  notMe: { en: 'No, use another name', ar: 'لا، استخدم اسماً آخر', he: 'לא, שם אחר' },
  fullName: { en: 'Full name', ar: 'الاسم الكامل', he: 'שם מלא' },
  invalidName: { en: 'Enter your name (letters only, 2–60 characters).', ar: 'أدخل اسمك (حروف فقط، من 2 إلى 60 حرفاً).', he: 'הזינו את שמכם (אותיות בלבד, 2–60 תווים).' },
  note: { en: 'Note for the business (optional)', ar: 'ملاحظة للعمل (اختياري)', he: 'הערה לעסק (רשות)' },
  send: { en: 'Send booking request', ar: 'إرسال طلب الحجز', he: 'שליחת בקשת הזמנה' },
  summary: { en: '{service} with {specialist} · {when}', ar: '{service} مع {specialist} · {when}', he: '{service} עם {specialist} · {when}' },
  unverifiedNote: { en: 'Your number isn’t verified by code yet, so the business will check the request before confirming it.', ar: 'لم يُتحقق من رقمك برمز بعد، لذلك سيراجع العمل الطلب قبل تأكيده.', he: 'המספר שלך עדיין לא אומת בקוד, ולכן העסק יבדוק את הבקשה לפני האישור.' },
  okPending: { en: 'Booking request received', ar: 'تم استلام طلب الحجز', he: 'בקשת ההזמנה התקבלה' },
  okPendingSub: { en: 'Awaiting confirmation from {business}.', ar: 'بانتظار تأكيد {business}.', he: 'ממתין לאישור של {business}.' },
  okConfirmed: { en: 'Appointment confirmed', ar: 'تم تأكيد الموعد', he: 'התור אושר' },
  pendingPill: { en: 'Awaiting confirmation from the business', ar: 'بانتظار تأكيد العمل', he: 'ממתין לאישור העסק' },
  dSpecialist: { en: 'Specialist', ar: 'المختص', he: 'איש מקצוע' },
  dService: { en: 'Service', ar: 'الخدمة', he: 'שירות' },
  dDate: { en: 'Date', ar: 'التاريخ', he: 'תאריך' },
  dTime: { en: 'Time', ar: 'الوقت', he: 'שעה' },
  dName: { en: 'Name', ar: 'الاسم', he: 'שם' },
  manageTitle: { en: 'Your booking link', ar: 'رابط حجزك', he: 'הקישור להזמנה שלך' },
  manageWhy: { en: 'Save this link: it shows your booking’s status and lets you cancel it within the business’s rules, until the appointment starts.', ar: 'احفظ هذا الرابط: يعرض حالة حجزك ويتيح إلغاءه حسب قواعد العمل، حتى بداية الموعد.', he: 'שמרו את הקישור: הוא מציג את סטטוס ההזמנה ומאפשר לבטל אותה לפי כללי העסק, עד תחילת התור.' },
  copy: { en: 'Copy link', ar: 'نسخ الرابط', he: 'העתקת הקישור' },
  copied: { en: 'Link copied', ar: 'تم نسخ الرابط', he: 'הקישור הועתק' },
  openLink: { en: 'Open the link', ar: 'فتح الرابط', he: 'פתיחת הקישור' },
  browserOnly: { en: 'You booked in the browser, so you won’t get WhatsApp or app reminders for this booking. Check its status with the link above.', ar: 'حجزت عبر المتصفح، لذلك لن تصلك تذكيرات عبر واتساب أو التطبيق لهذا الحجز. تابع حالته من الرابط أعلاه.', he: 'הזמנתם בדפדפן, ולכן לא תקבלו תזכורות ב-WhatsApp או באפליקציה להזמנה הזו. בדקו את הסטטוס בקישור שלמעלה.' },
  accountTitle: { en: 'Get confirmations and reminders', ar: 'احصل على التأكيدات والتذكيرات', he: 'קבלו אישורים ותזכורות' },
  accountBody: { en: 'With the METON app you get booking confirmations, status changes and reminders as notifications, and all your bookings in one place. It’s optional.', ar: 'مع تطبيق METON تصلك تأكيدات الحجز وتغييرات الحالة والتذكيرات كإشعارات، وكل حجوزاتك في مكان واحد. هذا اختياري.', he: 'עם אפליקציית METON תקבלו אישורי הזמנה, שינויי סטטוס ותזכורות כהתראות, ואת כל ההזמנות במקום אחד. זה לא חובה.' },
  notNow: { en: 'Not now', ar: 'ليس الآن', he: 'לא עכשיו' },
  bookAnother: { en: 'Book another appointment', ar: 'حجز موعد آخر', he: 'הזמנת תור נוסף' },
  bannerText: { en: 'Get confirmations and reminders in the METON app.', ar: 'احصل على التأكيدات والتذكيرات في تطبيق METON.', he: 'קבלו אישורים ותזכורות באפליקציית METON.' },
  bannerOpen: { en: 'Open METON', ar: 'افتح METON', he: 'פתיחת METON' },
  bannerGet: { en: 'Get the app', ar: 'حمّل التطبيق', he: 'הורדת האפליקציה' },
  bannerStay: { en: 'Continue in browser', ar: 'المتابعة في المتصفح', he: 'המשך בדפדפן' },
  slotTaken: { en: 'That time was just taken. Choose another time.', ar: 'تم حجز هذا الوقت للتو. اختر وقتاً آخر.', he: 'הזמן הזה נתפס הרגע. בחרו זמן אחר.' },
  useApp: { en: 'This number belongs to the business’s team. Book from the METON app instead.', ar: 'هذا الرقم لأحد أفراد فريق العمل. احجز من تطبيق METON بدلاً من ذلك.', he: 'המספר הזה שייך לצוות העסק. הזמינו דרך אפליקציית METON.' },
  bookingUnavailable: { en: 'Booking isn’t possible with this business right now. Contact the business.', ar: 'الحجز غير ممكن لدى هذا العمل حالياً. تواصل مع العمل.', he: 'לא ניתן להזמין בעסק הזה כרגע. פנו לעסק.' },
  bookingRejected: { en: 'The business couldn’t accept this request.', ar: 'لم يتمكن العمل من قبول هذا الطلب.', he: 'העסק לא יכול לקבל את הבקשה.' },
  tryAgain: { en: 'Something went wrong. Try again.', ar: 'حدث خطأ. حاول مرة أخرى.', he: 'משהו השתבש. נסו שוב.' },
  verifyFirst: { en: 'Please confirm your number first.', ar: 'يرجى تأكيد رقمك أولاً.', he: 'נא לאמת קודם את המספר.' },
  // demos
  demoBadge: { en: 'Demo', ar: 'تجربة', he: 'הדגמה' },
  demoDoneNote: { en: 'Demo: this booking request was not sent to anyone, and no time was taken.', ar: 'تجربة: لم يُرسل طلب الحجز هذا لأي أحد، ولم يُحجز أي وقت.', he: 'הדגמה: בקשת ההזמנה הזו לא נשלחה לאף אחד, ושום זמן לא נתפס.' },
  demoLinkNote: { en: 'In this demo the link opens here; a real booking gets its own private link.', ar: 'في هذه التجربة يفتح الرابط هنا؛ أما الحجز الحقيقي فيحصل على رابطه الخاص.', he: 'בהדגמה הקישור נפתח כאן; הזמנה אמיתית מקבלת קישור פרטי משלה.' },
  // the private link
  mTitle: { en: 'Your booking', ar: 'حجزك', he: 'ההזמנה שלך' },
  mPending: { en: 'Request received · awaiting confirmation', ar: 'تم استلام الطلب · بانتظار التأكيد', he: 'הבקשה התקבלה · ממתין לאישור' },
  mConfirmed: { en: 'Confirmed', ar: 'مؤكد', he: 'מאושר' },
  mCancel: { en: 'Cancel this booking', ar: 'إلغاء هذا الحجز', he: 'ביטול ההזמנה' },
  mCancelAsk: { en: 'Cancel this booking? This can’t be undone.', ar: 'هل تريد إلغاء هذا الحجز؟ لا يمكن التراجع عن ذلك.', he: 'לבטל את ההזמנה? לא ניתן לבטל את הפעולה.' },
  mCancelled: { en: 'Your booking was cancelled.', ar: 'تم إلغاء حجزك.', he: 'ההזמנה בוטלה.' },
  mCancelUntil: { en: 'You can cancel online until {when}.', ar: 'يمكنك الإلغاء عبر الإنترنت حتى {when}.', he: 'אפשר לבטל באופן מקוון עד {when}.' },
  mCancelClosed: { en: 'Online cancellation has closed for this booking. Contact the business to change it.', ar: 'انتهى وقت الإلغاء عبر الإنترنت لهذا الحجز. تواصل مع العمل لتعديله.', he: 'הביטול המקוון להזמנה הזו נסגר. פנו לעסק כדי לשנות אותה.' },
  mNoCancel: { en: 'This business doesn’t take cancellations online. Contact the business.', ar: 'هذا العمل لا يقبل الإلغاء عبر الإنترنت. تواصل مع العمل.', he: 'העסק הזה לא מקבל ביטולים מקוונים. פנו לעסק.' },
  mGone_cancelled: { en: 'This booking was cancelled, so its link no longer works.', ar: 'تم إلغاء هذا الحجز، لذلك لم يعد رابطه يعمل.', he: 'ההזמנה בוטלה, ולכן הקישור כבר לא פעיל.' },
  mGone_started: { en: 'This link expired when the appointment started.', ar: 'انتهت صلاحية هذا الرابط عند بداية الموعد.', he: 'תוקף הקישור פג כשהתור התחיל.' },
  mGone_other: { en: 'This booking link isn’t valid.', ar: 'رابط الحجز هذا غير صالح.', he: 'קישור ההזמנה אינו תקף.' },
  mBookAgain: { en: 'Book with {business}', ar: 'احجز لدى {business}', he: 'הזמנה אצל {business}' },
  // My bookings
  meTitle: { en: 'My bookings', ar: 'حجوزاتي', he: 'ההזמנות שלי' },
  meLead: { en: 'See the bookings you made on METON booking pages with your verified number.', ar: 'اطّلع على الحجوزات التي أجريتها على صفحات حجز METON برقمك الموثّق.', he: 'צפו בהזמנות שביצעתם בדפי ההזמנה של METON עם המספר המאומת שלכם.' },
  meNone: { en: 'No bookings yet with this number.', ar: 'لا توجد حجوزات بهذا الرقم بعد.', he: 'עדיין אין הזמנות עם המספר הזה.' },
  meUnavailable: { en: 'My bookings needs phone verification, which isn’t available yet. Use the link you got with each booking.', ar: 'تحتاج صفحة حجوزاتي إلى التحقق من الهاتف، وهو غير متاح بعد. استخدم الرابط الذي حصلت عليه مع كل حجز.', he: 'דף ההזמנות שלי דורש אימות טלפון, שעדיין לא זמין. השתמשו בקישור שקיבלתם עם כל הזמנה.' },
  meUpcoming: { en: 'Upcoming', ar: 'القادمة', he: 'קרובות' },
  mePast: { en: 'Earlier', ar: 'السابقة', he: 'קודמות' },
  meForget: { en: 'Sign out of this browser', ar: 'الخروج من هذا المتصفح', he: 'יציאה מהדפדפן הזה' },
  meNote: { en: 'Only bookings made with this verified number on a booking page appear here. Each business keeps its own records.', ar: 'تظهر هنا فقط الحجوزات التي أُجريت بهذا الرقم الموثّق على صفحة حجز. يحتفظ كل عمل بسجلاته الخاصة.', he: 'מופיעות כאן רק הזמנות שבוצעו עם המספר המאומת הזה בדף הזמנה. כל עסק שומר את הרשומות שלו.' },
  st_pending: { en: 'Awaiting confirmation', ar: 'بانتظار التأكيد', he: 'ממתין לאישור' },
  st_confirmed: { en: 'Confirmed', ar: 'مؤكد', he: 'מאושר' },
  st_completed: { en: 'Completed', ar: 'مكتمل', he: 'הושלם' },
  st_cancelled: { en: 'Cancelled', ar: 'ملغي', he: 'בוטל' },
  st_no_show: { en: 'Missed', ar: 'لم يحضر', he: 'לא הגיע/ה' },
  st_expired: { en: 'Expired', ar: 'منتهي', he: 'פג תוקף' },
  poweredBy: { en: 'Online booking by METON', ar: 'الحجز عبر الإنترنت من METON', he: 'הזמנה מקוונת באמצעות METON' },
};
export const L = (c, k, vars = {}) => { let s = (W[k] && (W[k][c.lang] || W[k].en)) || k; for (const [a, b] of Object.entries(vars)) s = s.split('{' + a + '}').join(b); return s; };
export const STORE = { android: 'https://play.google.com/store/apps/details?id=com.salonieer.app', ios: 'https://apps.apple.com/app/id6813588408' };
export const device = () => /android/i.test(navigator.userAgent) ? 'android' : (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) ? 'ios' : 'desktop';
export const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { return null; } };
export const rid = () => { const b = crypto.getRandomValues(new Uint8Array(16)); return [...b].map(x => x.toString(16).padStart(2, '0')).join(''); };
export const deviceZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };
export const ymdIn = (date, tz) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz || deviceZone(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); } catch { return date.toISOString().slice(0, 10); } };
// Minutes since midnight now, in a time zone.
export const nowMinutesIn = tz => { try { const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: tz || deviceZone(), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':').map(Number); return h * 60 + m; } catch { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); } };
export const addDays = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); };
export const weekday = ymd => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const locale = c => (c.lang === 'he' ? 'he-IL' : c.lang === 'ar' ? 'ar-EG' : 'en-GB');
const fmt = (c, ymd, o) => { const [y, m, d] = ymd.split('-').map(Number); try { return new Intl.DateTimeFormat(locale(c), { ...o, timeZone: 'UTC', numberingSystem: 'latn' }).format(new Date(Date.UTC(y, m - 1, d))); } catch { return ymd; } };
export const dayLabel = (c, ymd) => fmt(c, ymd, { weekday: 'short', day: 'numeric', month: 'short' });
export const longDate = (c, ymd) => fmt(c, ymd, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
export const weekdayShort = (c, ymd) => fmt(c, ymd, { weekday: 'short' });
export const dayMonth = (c, ymd) => fmt(c, ymd, { day: 'numeric', month: 'short' });
export const whenLabel = (c, ymd, hm) => `${dayLabel(c, ymd)} · <bdi dir="ltr">${hm}</bdi>`;
export const toMin = hm => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + (m || 0); };
export const toHm = n => `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
export const money = (c, v, cur) => { if (v === null || v === undefined || v === '') return ''; if (Number(v) === 0) return L(c, 'free'); try { return new Intl.NumberFormat(c.lang === 'ar' ? 'ar-EG' : c.lang === 'he' ? 'he-IL' : 'en', { style: 'currency', currency: cur || 'ILS', maximumFractionDigits: 2, minimumFractionDigits: 0, numberingSystem: 'latn' }).format(Number(v)); } catch { return String(v); } };
export const initials = s => (String(s || '?').trim().split(/\s+/).map(w => [...w][0] || '').join('').slice(0, 2) || '?').toUpperCase();
export const avatar = (c, name, url, color) => url ? `<img class="book-av" src="${c.esc(url)}" alt="" loading="lazy">` : `<span class="book-av is-initials" aria-hidden="true"${color ? ` style="--av:${c.esc(color)}"` : ''}>${c.esc(initials(name))}</span>`;
const ico = (paths, s = 18) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
export const ICON = {
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.2-4 4.2-6 7.5-6s6.3 2 7.5 6"/>',
  case: '<rect x="3.5" y="7" width="17" height="12.5" rx="2"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5a7 7 0 1 0-14 0C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  shield: '<path d="M12 3.5 19 6v5.5c0 4.4-3 7.8-7 9-4-1.2-7-4.6-7-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  phone: '<path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16.5 16.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2z"/>',
  back: '<path d="M15 5.5 8.5 12l6.5 6.5"/>',
  card: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 15.5c.6-1.4 1.7-2 3-2s2.4.6 3 2M14.5 10h3.5M14.5 13h2.5"/>',
};
export { ico };

// Business colour: a hex colour drives the page accent; anything else keeps METON's. Text on it is white or ink,
// whichever reads better (WCAG contrast).
const hexOk = v => /^#[0-9a-f]{6}$/i.test(String(v || ''));
const lum = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0); };
export const inkOn = hex => { if (!hexOk(hex)) return '#FFFFFF'; const l = lum(hex); return 1.05 / (l + .05) >= (l + .05) / (lum('#241D28') + .05) ? '#FFFFFF' : '#241D28'; };
const bizVars = color => color ? `--biz:${color};--biz-ink:${inkOn(color)}` : '';
export const bizHeader = (c, page, extra = '') => {
  const color = hexOk(page.color || page.settings?.primary_color) ? (page.color || page.settings.primary_color) : '';
  const sub = [page.category, page.address].filter(Boolean).map(x => c.esc(x)).join(' · ');
  return `<header class="book-biz">${page.logo_url ? `<img class="book-logo" src="${c.esc(page.logo_url)}" alt="">` : `<span class="book-logo is-initials" aria-hidden="true"${color ? ` style="${bizVars(color)}"` : ''}>${c.esc(initials(page.name))}</span>`}
    <div class="book-biz-copy"><h1>${c.esc(page.name)}</h1>${sub ? `<p class="book-biz-sub">${sub}</p>` : ''}</div>${extra}</header>${page.about ? `<p class="book-about">${c.esc(page.about)}</p>` : ''}`;
};
// The detail rows of one booking (done screen, private link, demo dashboard).
export const detailRows = (c, b) => `<dl class="book-dl">
  <div><dt>${ico(ICON.user, 17)}${L(c, 'dSpecialist')}</dt><dd>${c.esc(b.specialist)}</dd></div>
  <div><dt>${ico(ICON.case, 17)}${L(c, 'dService')}</dt><dd>${c.esc(b.service)}</dd></div>
  <div><dt>${ico(ICON.cal, 17)}${L(c, 'dDate')}</dt><dd>${c.esc(longDate(c, b.date))}</dd></div>
  <div><dt>${ico(ICON.clock, 17)}${L(c, 'dTime')}</dt><dd><bdi dir="ltr">${c.esc(String(b.time).slice(0, 5))}</bdi></dd></div>
  ${b.name ? `<div><dt>${ico(ICON.card, 17)}${L(c, 'dName')}</dt><dd><bdi>${c.esc(b.name)}</bdi></dd></div>` : ''}</dl>`;
export const statusPill = (c, status) => `<p class="book-status is-${c.esc(status)}"><span aria-hidden="true"></span>${L(c, status === 'confirmed' ? 'mConfirmed' : status === 'pending' ? 'pendingPill' : 'st_' + status)}</p>`;
// Times split into the parts of the day, like the app's booking screen.
export function timeGroups(c, times, attr = 'data-time', cls = 'book-time') {
  const parts = [['morning', t => toMin(t) < 720], ['afternoon', t => toMin(t) >= 720 && toMin(t) < 1020], ['evening', t => toMin(t) >= 1020]];
  return parts.map(([k, f]) => { const list = times.filter(f); return list.length ? `<div class="book-tgroup"><h3>${L(c, k)}</h3><div class="book-time-grid">${list.map(t => `<button type="button" class="${cls}" ${attr}="${t}" dir="ltr">${t}</button>`).join('')}</div></div>` : ''; }).join('');
}
// The working days a specialist can be booked on, from today, within the booking window.
export function bookableDays(page, sp, today) {
  const days = [], win = Math.max(1, Math.min(60, Number(page.settings?.window_days) || 3));
  for (let i = 0; i < win; i++) { const d = addDays(today, i); if (sp?.days?.[String(weekday(d))]) days.push(d); }
  return days;
}
export const dayButton = (c, d, today, on, attr = 'data-day', cls = 'book-day') => `<button type="button" class="${cls}${on ? ' is-on' : ''}" ${attr}="${d}" aria-pressed="${on}"><span>${d === today ? L(c, 'today') : d === addDays(today, 1) ? L(c, 'tomorrow') : c.esc(weekdayShort(c, d))}</span><b>${c.esc(dayMonth(c, d))}</b></button>`;

// ── the booking interface (real pages and both demos) ─────────────────────────────────────────────────────────────
// page: { name, logo_url, code, slug, timezone, category?, about?, address?, color?, settings, services, specialists }
// src:  { mode: 'live'|'demo', verify: 'whatsapp'|'none'|'demo', times(sp, svc, date), phone(e164), code(code), book(payload) }
// opts: { country, afterDone (html), onBooked(result, state), onOpenLink(result) (demo), doneExtra (html) }
export function runBooking(c, root, page, src, opts = {}) {
  const s = { step: 'service', svc: null, sp: null, autoSp: false, date: null, time: null, phone: '', verified: false, hint: null, useHint: true, key: rid(), result: null, err: '', busy: false, demoCode: '' };
  const set = page.settings || {};
  const demo = src.mode !== 'live';
  const bookable = page.services.filter(x => page.specialists.some(p => (p.services || []).includes(x.id)));
  const tz = page.timezone || deviceZone();
  const today = ymdIn(new Date(), tz);
  const steps = [['service', 'stepService'], ['specialist', 'stepSpecialist'], ['time', 'stepTime'], ['details', 'stepDetails']];
  const stepIndex = { service: 0, specialist: 1, time: 2, phone: 3, code: 3, name: 3, done: 4 };
  const svcOf = id => page.services.find(x => x.id === id), spOf = id => page.specialists.find(x => x.id === id);
  const teamFor = id => page.specialists.filter(p => (p.services || []).includes(id));
  const color = hexOk(page.color || set.primary_color) ? (page.color || set.primary_color) : '';
  const banner = () => {
    if (demo || store('meton_app_strip') === 'off') return '';
    const dev = device(), code = encodeURIComponent(page.code || '');
    const play = STORE.android + '&referrer=' + encodeURIComponent('salon=' + (page.code || ''));
    const open = dev === 'android' ? `intent://salon/${code}#Intent;scheme=salonieer;package=com.salonieer.app;S.browser_fallback_url=${encodeURIComponent(play)};end` : dev === 'ios' ? `salonieer://salon/${code}` : '';
    return `<aside class="book-strip" id="book-strip"><span>${L(c, 'bannerText')}</span><span class="book-strip-actions">${open ? `<a class="btn small" href="${c.esc(open)}">${L(c, 'bannerOpen')}</a>` : ''}<a class="btn small" href="${c.esc(dev === 'ios' ? STORE.ios : play)}" rel="noopener">${L(c, 'bannerGet')}</a><button type="button" class="btn small ghost" id="book-strip-close">${L(c, 'bannerStay')}</button></span></aside>`;
  };
  const progress = () => { const i = stepIndex[s.step]; return `<ol class="book-progress" aria-label="${L(c, 'steps')}">${steps.map(([, k], n) => `<li class="${n < i ? 'is-done' : n === i ? 'is-current' : ''}"${n === i ? ' aria-current="step"' : ''}><span>${n < i ? ico(ICON.check, 13) : n + 1}</span>${L(c, k)}</li>`).join('')}</ol>`; };
  const picked = () => {
    const parts = [];
    if (s.svc) parts.push(`<button type="button" class="book-chip" data-go="service">${ico(ICON.case, 15)}${c.esc(svcOf(s.svc).name)}</button>`);
    if (s.sp) parts.push(`<button type="button" class="book-chip" data-go="${s.autoSp ? 'service' : 'specialist'}">${ico(ICON.user, 15)}${c.esc(spOf(s.sp).name)}</button>`);
    if (s.date && s.time && stepIndex[s.step] > 2) parts.push(`<button type="button" class="book-chip" data-go="time">${ico(ICON.clock, 15)}${whenLabel(c, s.date, s.time)}</button>`);
    return parts.length ? `<div class="book-picked">${parts.join('')}</div>` : '';
  };
  const err = () => s.err ? `<p class="book-error" role="alert">${c.esc(s.err)}</p>` : '';
  const backBtn = to => `<button type="button" class="btn ghost book-back" data-go="${to}">${ico(ICON.back, 16)}${L(c, 'back')}</button>`;
  const blocked = !set.open ? (set.closed_message || L(c, 'closed')) : set.online_booking === false ? L(c, 'offline') : !bookable.length ? L(c, 'noServices') : set.new_customers === false ? L(c, 'noNew') : '';
  const title = (n, k) => `<h2><span class="book-n" aria-hidden="true">${n}</span>${L(c, k)}</h2>`;

  function view() {
    if (blocked && !demo) return `<div class="book-card"><p class="book-empty">${c.esc(blocked)}</p></div>`;
    if (blocked && demo) return `<div class="book-card"><p class="book-empty">${c.esc(L(c, 'noServices'))}</p></div>`;
    if (s.step === 'done') return done();
    let body = '';
    if (s.step === 'service') body = `${title(1, 'chooseService')}<div class="book-list">${bookable.map(x => `<button type="button" class="book-option" data-svc="${c.esc(x.id)}"><span class="book-option-main"><b>${c.esc(x.name)}</b>${x.description ? `<small>${c.esc(x.description)}</small>` : ''}</span><span class="book-option-side"><span class="book-dur">${ico(ICON.clock, 14)}<bdi>${Number(x.duration)} ${L(c, 'minutes')}</bdi></span>${set.show_prices !== false && x.price != null && x.price !== '' ? `<b class="book-price">${money(c, x.price, set.currency)}</b>` : ''}</span></button>`).join('')}</div>`;
    if (s.step === 'specialist') {
      body = `${title(2, 'chooseSpecialist')}<div class="book-list">${teamFor(s.svc).map(p => `<button type="button" class="book-option is-person" data-sp="${c.esc(p.id)}">${avatar(c, p.name, p.image_url, p.color)}<span class="book-option-main"><b>${c.esc(p.name)}</b>${p.specialty ? `<small>${c.esc(p.specialty)}</small>` : ''}</span></button>`).join('')}</div>${backBtn('service')}`;
    }
    if (s.step === 'time') {
      const days = bookableDays(page, spOf(s.sp), today);
      if (!s.date || !days.includes(s.date)) s.date = days[0] || null;
      body = `${title(3, 'chooseTime')}${days.length ? `<div class="book-days" role="group" aria-label="${L(c, 'dDate')}">${days.map(d => dayButton(c, d, today, d === s.date)).join('')}</div>
        <div class="book-times" id="book-times" aria-live="polite"><p class="book-muted">${L(c, 'loading')}</p></div>` : `<p class="book-empty">${L(c, 'noDays')}</p>`}${backBtn(s.autoSp ? 'service' : 'specialist')}`;
    }
    if (s.step === 'phone') body = `${title(4, 'phoneTitle')}<p class="book-muted">${L(c, src.verify === 'none' ? 'phoneWhyNone' : 'phoneWhy')}</p>
      <form class="book-form" id="book-phone-form" novalidate><div class="book-phone"><div class="book-dial">${c.countryPicker(c.pickerOptions({ name: 'dial', value: opts.country || 'PS', mode: 'dial', label: L(c, 'dialCode') }))}</div>
      <label class="book-field"><span>${L(c, 'phone')}</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" dir="ltr" required value="${c.esc(s.phoneLocal || '')}"></label></div>
      ${err()}<button class="btn primary book-go" type="submit">${L(c, 'next')}</button><p class="book-fine">${ico(ICON.shield, 15)}${L(c, 'phonePrivate', { business: c.esc(page.name) })}</p></form>${backBtn('time')}`;
    if (s.step === 'code') body = `${title(4, 'codeTitle')}<p class="book-muted">${src.verify === 'demo' ? L(c, 'codeForDemo', { phone: `<bdi dir="ltr">${c.esc(s.phone)}</bdi>` }) : L(c, 'codeSentWa', { phone: `<bdi dir="ltr">${c.esc(s.phone)}</bdi>` })}</p>
      ${src.verify === 'demo' ? `<section class="book-demo-otp" aria-labelledby="demo-otp-title"><div class="book-demo-otp-top"><span class="book-demo-tag">${L(c, 'demoBadge')}</span><h3 id="demo-otp-title">${L(c, 'demoOtpTitle')}</h3></div>
        <div class="book-demo-otp-code"><output id="book-demo-code-value" dir="ltr" aria-label="${L(c, 'demoOtpTitle')}">${c.esc(s.demoCode)}</output><button type="button" class="btn small" id="book-demo-copy">${ico(ICON.copy, 16)}<span>${L(c, 'copyCode')}</span></button></div>
        <p>${L(c, 'demoOtpHow')}</p><p class="book-demo-otp-note">${L(c, 'demoOtpNoMsg')}</p></section>` : ''}
      <form class="book-form" id="book-code-form" novalidate><label class="book-field"><span>${L(c, 'code')}</span><input class="book-otp" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" dir="ltr" required></label>
      ${err()}<div class="book-row"><button class="btn primary book-go" type="submit">${L(c, 'verify')}</button>${src.verify === 'demo' ? `<button type="button" class="btn ghost" id="book-demo-new">${L(c, 'newDemoCode')}</button>` : `<button type="button" class="btn ghost" id="book-resend" disabled>${L(c, 'resendIn', { s: '45' })}</button>`}</div></form>
      <button type="button" class="btn ghost book-back" data-go="phone">${ico(ICON.back, 16)}${L(c, 'changeNumber')}</button>`;
    if (s.step === 'name') {
      const asking = s.hint && s.useHint;
      body = `${title(4, 'nameTitle')}${s.trusted ? `<p class="book-muted">${L(c, 'trusted')}</p>` : ''}
        <p class="book-muted book-number"><bdi dir="ltr">${c.esc(s.phone)}</bdi> · <button type="button" class="text-link" id="book-change-phone">${L(c, 'change')}</button></p>
        <form class="book-form" id="book-name-form" novalidate>${asking ? `<p class="book-areyou">${L(c, 'areYou', { name: `<bdi>${c.esc(s.hint)}</bdi>` })}</p><div class="book-row"><button type="button" class="btn primary" id="book-yes">${L(c, 'yesMe')}</button><button type="button" class="btn" id="book-no">${L(c, 'notMe')}</button></div>`
          : `<label class="book-field"><span>${L(c, 'fullName')}</span><input name="name" autocomplete="name" maxlength="60" required value="${c.esc(s.name || '')}"></label>`}
        <label class="book-field"><span>${L(c, 'note')}</span><textarea name="note" maxlength="300" rows="2">${c.esc(s.note || '')}</textarea></label>
        ${src.verify === 'none' && !s.verified ? `<p class="book-hint">${L(c, 'unverifiedNote')}</p>` : ''}
        <p class="book-summary">${L(c, 'summary', { service: c.esc(svcOf(s.svc).name), specialist: c.esc(spOf(s.sp).name), when: whenLabel(c, s.date, s.time) })}</p>
        ${err()}${asking ? '' : `<button class="btn primary book-go" type="submit">${L(c, 'send')}</button>`}</form>${backBtn('time')}`;
    }
    return `<div class="book-card">${picked()}${body}</div>`;
  }
  function done() {
    const r = s.result, b = r.booking || {};
    const dev = device();
    const link = demo ? `<section class="book-link"><h3>${L(c, 'manageTitle')}</h3><p class="book-muted">${L(c, 'manageWhy')}</p>
        <div class="book-link-box is-demo"><code dir="ltr">${c.esc(location.host)}/m/demo-${c.esc(String(r.id || '').slice(0, 10))}</code><button type="button" class="btn small" id="book-demo-open">${L(c, 'openLink')}</button></div><p class="book-fine">${L(c, 'demoLinkNote')}</p></section>`
      : `<section class="book-link"><h3>${L(c, 'manageTitle')}</h3><p class="book-muted">${L(c, 'manageWhy')}</p>
        <div class="book-link-box"><code dir="ltr">${c.esc(location.origin + r.manage)}</code><button type="button" class="btn small" id="book-copy">${ico(ICON.copy, 15)}${L(c, 'copy')}</button><a class="btn small" href="${c.esc(r.manage)}">${L(c, 'openLink')}</a></div></section>`;
    return `<div class="book-card book-done">${demo ? `<p class="book-demo-note"><span class="book-demo-tag">${L(c, 'demoBadge')}</span>${L(c, 'demoDoneNote')}</p>` : ''}<div class="book-done-mark" aria-hidden="true">${ico(ICON.check, 40)}</div>
      <h2>${L(c, b.status === 'confirmed' ? 'okConfirmed' : 'okPending')}</h2>${b.status !== 'confirmed' ? `<p class="book-done-sub">${L(c, 'okPendingSub', { business: c.esc(page.name) })}</p>` : ''}
      <div class="book-done-card">${detailRows(c, b)}${statusPill(c, b.status || 'pending')}</div>
      ${opts.doneExtra || ''}${link}
      <p class="book-hint">${L(c, 'browserOnly')}</p>
      ${store('meton_account_tip') === 'off' ? '' : `<section class="book-account" id="book-account"><h3>${L(c, 'accountTitle')}</h3><p>${L(c, 'accountBody')}</p>
        <div class="book-row">${dev !== 'ios' ? `<a class="btn small" href="${STORE.android}" rel="noopener">Google Play</a>` : ''}${dev !== 'android' ? `<a class="btn small" href="${STORE.ios}" rel="noopener">App Store</a>` : ''}<button type="button" class="btn small ghost" id="book-account-close">${L(c, 'notNow')}</button></div></section>`}
      <div class="book-row book-done-actions"><button type="button" class="btn ghost" data-again>${L(c, 'bookAnother')}</button>${opts.afterDone || ''}</div></div>`;
  }
  function paint() {
    const top = opts.header === false ? '' : bizHeader(c, page);
    root.innerHTML = `<div class="book${demo ? ' is-demo' : ''}"${color ? ` style="${bizVars(color)}"` : ''}>${top}${banner()}${s.step !== 'done' && !blocked ? progress() : ''}${view()}</div>`;
    wire();
  }
  const go = (step, focus = true) => {
    s.step = step; s.err = ''; paint();
    if (focus) { const h = root.querySelector('.book-card h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } if (opts.scroll !== false) root.querySelector('.book-card')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); }
  };
  // Choosing a service: when only one specialist offers it, the specialist step is answered for the customer (as in the app).
  function chooseService(id) {
    s.svc = id; s.date = null; s.time = null;
    const team = teamFor(id);
    if (team.length === 1) { s.sp = team[0].id; s.autoSp = true; go('time'); }
    else { s.sp = null; s.autoSp = false; go('specialist'); }
  }
  async function loadTimes() {
    const host = root.querySelector('#book-times'); if (!host || !s.date) return;
    const want = s.date;
    // The times of the day shown before are never left clickable while another day loads.
    host.innerHTML = `<p class="book-muted">${L(c, 'loading')}</p>`;
    let times = [];
    try { times = await src.times(s.sp, s.svc, s.date); } catch { host.innerHTML = `<p class="book-error">${L(c, 'tryAgain')}</p>`; return; }
    if (want !== s.date || !root.contains(host)) return;
    host.innerHTML = times.length ? timeGroups(c, times) : `<p class="book-empty">${L(c, 'noTimes')}</p>`;
    host.querySelectorAll('[data-time]').forEach(b => b.addEventListener('click', () => { s.time = b.dataset.time; go(s.verified ? 'name' : 'phone'); }));
  }
  function codeTimer() {
    const btn = root.querySelector('#book-resend'); if (!btn) return;
    const tick = () => { if (!root.contains(btn)) return; const left = Math.max(0, Math.ceil(((s.resendAt || 0) - Date.now()) / 1000)); btn.disabled = left > 0; btn.textContent = left > 0 ? L(c, 'resendIn', { s: String(left) }) : L(c, 'resend'); if (left > 0) setTimeout(tick, 1000); };
    tick();
    btn.addEventListener('click', async () => { btn.disabled = true; await sendPhone(true); });
  }
  const errText = e => e?.code === 'wrongCode' ? L(c, 'wrongCode', { left: String(e.left ?? e.detail?.left ?? '') }) : W[e?.code] ? L(c, e.code) : (e?.code === 'tooManyAttempts' ? L(c, 'codeTooSoon') : L(c, 'tryAgain'));
  async function sendPhone(resend = false) {
    try {
      const r = await src.phone(s.phone);
      if (r.state === 'verified') { s.verified = true; s.trusted = !!r.trusted; s.hint = r.name || null; s.useHint = !!s.hint; go('name'); return; }
      if (r.state === 'unverified') { s.verified = false; s.hint = null; go('name'); return; }
      s.demoCode = r.demoCode || '';
      s.resendAt = Date.now() + (r.resend_in || 45) * 1000; if (!resend || s.step !== 'code') go('code'); else { s.err = ''; paint(); }
    } catch (e) { s.err = errText(e); paint(); }
  }
  async function submit(name, note) {
    if (s.busy) return; s.busy = true;
    const btn = root.querySelector('#book-name-form button[type=submit], #book-yes');
    if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
    try {
      const r = await src.book({ slug: page.slug, service: s.svc, specialist: s.sp, date: s.date, time: s.time, name, note, request_key: s.key, phone: s.phone });
      if (r.duplicate && !r.booking) { s.err = L(c, 'tryAgain'); s.busy = false; paint(); return; }
      s.result = r; s.busy = false; opts.onBooked?.(r, s); go('done');
    } catch (e) {
      s.busy = false;
      if (e?.code === 'slotTaken') { s.time = null; s.key = rid(); s.step = 'time'; s.err = ''; paint(); root.querySelector('#book-times')?.insertAdjacentHTML('beforebegin', `<p class="book-error" role="alert">${L(c, 'slotTaken')}</p>`); loadTimes(); return; }
      if (e?.code === 'verifyFirst') { s.verified = false; go('phone'); return; }
      s.err = e?.code === 'bookingRejected' && e.detail && c.lang === 'ar' ? e.detail : errText(e); paint();
    }
  }
  function wire() {
    root.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { const to = b.dataset.go; if (to === 'service') { s.sp = null; s.autoSp = false; s.date = null; s.time = null; } if (to === 'specialist') { s.date = null; s.time = null; } if (to === 'time') s.time = null; if (to === 'phone' && s.verified && s.step !== 'code') return go('name'); go(to); }));
    root.querySelector('#book-strip-close')?.addEventListener('click', () => { store('meton_app_strip', 'off'); root.querySelector('#book-strip')?.remove(); });
    root.querySelectorAll('[data-svc]').forEach(b => b.addEventListener('click', () => chooseService(b.dataset.svc)));
    root.querySelectorAll('[data-sp]').forEach(b => b.addEventListener('click', () => { s.sp = b.dataset.sp; s.autoSp = false; s.date = null; s.time = null; go('time'); }));
    root.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => { s.date = b.dataset.day; root.querySelectorAll('[data-day]').forEach(x => { x.classList.toggle('is-on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); loadTimes(); }));
    if (s.step === 'time') loadTimes();
    const pf = root.querySelector('#book-phone-form');
    if (pf) {
      const dial = c.bindCountryPicker(pf.querySelector('[data-cpick="dial"]'), c.pickerOptions({ pinned: c.PINNED }));
      if (dial.value) dial.choose(dial.value, { silent: true });
      pf.addEventListener('submit', async e => {
        e.preventDefault();
        const raw = pf.elements.phone.value; s.phoneLocal = raw;
        const n = c.phoneE164(raw, dial.value);
        if (!n || (n.getType && !['MOBILE', 'FIXED_LINE_OR_MOBILE', undefined].includes(n.getType()))) { s.err = L(c, 'invalidPhone'); paint(); return; }
        if (s.phone && s.phone !== n.number) { s.verified = false; s.hint = null; }
        s.phone = n.number; opts.country = dial.value; s.err = '';
        const btn = pf.querySelector('button[type=submit]'); btn.disabled = true;
        await sendPhone();
      });
    }
    const cf = root.querySelector('#book-code-form');
    if (cf) {
      codeTimer();
      root.querySelector('#book-demo-copy')?.addEventListener('click', async ev => {
        const b = ev.currentTarget; let ok = false;
        try { await navigator.clipboard.writeText(s.demoCode); ok = true; } catch {}
        if (!ok) { const r = document.createRange(), out = root.querySelector('#book-demo-code-value'); r.selectNodeContents(out); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); try { ok = document.execCommand('copy'); } catch {} }
        b.classList.add('is-copied'); b.querySelector('span').textContent = L(c, 'codeCopied'); setTimeout(() => { if (b.isConnected) { b.classList.remove('is-copied'); b.querySelector('span').textContent = L(c, 'copyCode'); } }, 2200);
        cf.elements.code.focus();
      });
      root.querySelector('#book-demo-new')?.addEventListener('click', () => sendPhone(true));
      cf.elements.code.addEventListener('input', () => { const v = cf.elements.code.value.replace(/\D/g, '').slice(0, 6); if (v !== cf.elements.code.value) cf.elements.code.value = v; });
      if (!matchMedia('(pointer: coarse)').matches) cf.elements.code.focus({ preventScroll: true });
      cf.addEventListener('submit', async e => {
        e.preventDefault();
        const code = cf.elements.code.value.replace(/\D/g, '');
        if (code.length !== 6) { s.err = L(c, 'codeSix'); paint(); return; }
        const btn = cf.querySelector('button[type=submit]'); btn.disabled = true;
        try { const r = await src.code(code); s.verified = true; s.hint = r.name || null; s.useHint = !!s.hint; go('name'); }
        catch (er) { s.err = er?.code === 'codeExpired' ? L(c, 'codeExpired') : errText(er); paint(); }
      });
    }
    root.querySelector('#book-change-phone')?.addEventListener('click', () => { s.verified = false; s.trusted = false; s.hint = null; go('phone'); });
    const nf = root.querySelector('#book-name-form');
    if (nf) {
      root.querySelector('#book-yes')?.addEventListener('click', () => submit(s.hint, nf.elements.note.value));
      root.querySelector('#book-no')?.addEventListener('click', () => { s.useHint = false; s.note = nf.elements.note.value; paint(); root.querySelector('input[name=name]')?.focus(); });
      nf.addEventListener('submit', e => {
        e.preventDefault();
        const name = (nf.elements.name?.value || '').trim().replace(/\s+/g, ' ');
        if (!/^[^0-9<>{}@/\\]{2,60}$/.test(name)) { s.err = L(c, 'invalidName'); s.name = name; s.note = nf.elements.note.value; paint(); return; }
        s.name = name; s.note = nf.elements.note.value; submit(name, nf.elements.note.value);
      });
    }
    root.querySelector('#book-copy')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText(location.origin + s.result.manage); c.toast(L(c, 'copied'), 'success'); } catch {} });
    root.querySelector('#book-demo-open')?.addEventListener('click', () => opts.onOpenLink?.(s.result, () => paint()));
    root.querySelector('#book-account-close')?.addEventListener('click', () => { store('meton_account_tip', 'off'); root.querySelector('#book-account')?.remove(); });
    root.querySelectorAll('[data-again]').forEach(b => b.addEventListener('click', () => { Object.assign(s, { step: 'service', svc: null, sp: null, autoSp: false, date: null, time: null, key: rid(), result: null, err: '' }); go('service'); }));
    opts.onPaint?.(root, s);
  }
  paint();
  return { state: s, repaint: paint, reset: () => { Object.assign(s, { step: 'service', svc: null, sp: null, autoSp: false, date: null, time: null, key: rid(), result: null, err: '' }); paint(); } };
}

function liveSource(c, page, verify) {
  return {
    mode: 'live', verify,
    times: (sp, svc, date) => c.api(`/api/book/times?slug=${encodeURIComponent(page.slug)}&service=${encodeURIComponent(svc)}&specialist=${encodeURIComponent(sp)}&date=${encodeURIComponent(date)}`).then(r => r.times || []),
    phone: phone => c.api('/api/book/phone', { method: 'POST', body: JSON.stringify({ phone, slug: page.slug, purpose: 'booking', lang: c.lang }) }),
    code: code => c.api('/api/book/code', { method: 'POST', body: JSON.stringify({ code, slug: page.slug }) }),
    book: ({ phone, ...payload }) => c.api('/api/book', { method: 'POST', body: JSON.stringify(payload) }),
  };
}

// ── one booking's page: the private link, and the same page in the demos ─────────────────────────────────────────
// b: { valid, reason, status, service, specialist, date, time, name, business: { name, logo_url, code }, cancellation_allowed,
//      can_cancel, cancel_until }
export function manageView(c, root, b, { demo = false, onCancel, onBookAgain, onBack } = {}) {
  const head = bizHeader(c, { name: b.business?.name || '', logo_url: b.business?.logo_url || '', color: b.business?.color || '' }, demo ? `<span class="book-demo-badge">${L(c, 'demoBadge')}</span>` : '');
  if (!b || !b.valid) {
    const k = b?.reason === 'cancelled' ? 'mGone_cancelled' : b?.reason === 'started' ? 'mGone_started' : 'mGone_other';
    root.innerHTML = `<div class="book">${b?.business ? head : ''}<div class="book-card"><h1 class="book-h1">${L(c, 'mTitle')}</h1><p class="book-empty">${L(c, k)}</p>
      ${b?.business?.code && !demo ? `<a class="btn ghost" href="/s/${encodeURIComponent(b.business.code)}">${L(c, 'mBookAgain', { business: c.esc(b.business.name) })}</a>` : ''}${onBack ? `<button type="button" class="btn ghost" id="m-back">${ico(ICON.back, 16)}${L(c, 'back')}</button>` : ''}</div></div>`;
    root.querySelector('#m-back')?.addEventListener('click', onBack);
    return;
  }
  const until = b.cancel_until ? new Intl.DateTimeFormat(locale(c), { dateStyle: 'medium', timeStyle: 'short', numberingSystem: 'latn' }).format(new Date(b.cancel_until)) : '';
  const vars = hexOk(b.business?.color) ? ` style="${bizVars(b.business.color)}"` : '';
  root.innerHTML = `<div class="book"${vars}>${head}<div class="book-card book-manage" id="m-card"><h1 class="book-h1">${L(c, 'mTitle')}</h1>
    <p class="book-status is-${c.esc(b.status)}"><span aria-hidden="true"></span>${L(c, b.status === 'confirmed' ? 'mConfirmed' : 'mPending')}</p>
    ${detailRows(c, b)}
    ${!b.cancellation_allowed ? `<p class="book-hint">${L(c, 'mNoCancel')}</p>` : b.can_cancel ? `<p class="book-muted">${L(c, 'mCancelUntil', { when: c.esc(until) })}</p><button type="button" class="btn danger" id="m-cancel">${L(c, 'mCancel')}</button>` : `<p class="book-hint">${L(c, 'mCancelClosed')}</p>`}
    <div class="book-row">${b.business?.code && !demo ? `<a class="btn ghost" href="/s/${encodeURIComponent(b.business.code)}">${L(c, 'mBookAgain', { business: c.esc(b.business.name) })}</a>` : ''}${onBookAgain ? `<button type="button" class="btn ghost" id="m-again">${L(c, 'mBookAgain', { business: c.esc(b.business?.name || '') })}</button>` : ''}${onBack ? `<button type="button" class="btn ghost" id="m-back">${ico(ICON.back, 16)}${L(c, 'back')}</button>` : ''}</div></div></div>`;
  root.querySelector('#m-back')?.addEventListener('click', onBack);
  root.querySelector('#m-again')?.addEventListener('click', onBookAgain);
  root.querySelector('#m-cancel')?.addEventListener('click', async ev => {
    if (!(await c.confirmDialog({ title: L(c, 'mCancel'), body: L(c, 'mCancelAsk'), confirm: L(c, 'mCancel'), cancel: L(c, 'back'), tone: 'danger' }))) return;
    ev.target.disabled = true;
    await onCancel?.();
  });
}

// ── /s/<code> ────────────────────────────────────────────────────────────────────────────────────────────────────
export const bookPage = c => `<section class="book-shell" id="book-root"><p class="book-loading" role="status">${L(c, 'loading')}</p></section>`;
export async function bindBook(c) {
  const root = document.getElementById('book-root'); if (!root) return;
  const code = (location.pathname.match(/^\/s\/([A-Za-z0-9_-]{2,64})\/?$/) || [])[1];
  let data = null;
  try { if (code) data = await c.api('/api/book/page?code=' + encodeURIComponent(code)); } catch {}
  if (!document.body.contains(root)) return;
  if (!data?.page) { root.innerHTML = `<div class="book"><div class="book-card"><p class="book-empty">${L(c, 'notFound')}</p></div></div>`; return; }
  document.title = data.page.name;
  const tz = data.page.timezone || '';
  runBooking(c, root, data.page, liveSource(c, data.page, data.verify), { country: tz === 'Asia/Jerusalem' ? 'IL' : 'PS' });
}

// ── /m/<token> ───────────────────────────────────────────────────────────────────────────────────────────────────
export const managePage = c => `<section class="book-shell" id="manage-root"><p class="book-loading" role="status">${L(c, 'loading')}</p></section>`;
export async function bindManage(c) {
  const root = document.getElementById('manage-root'); if (!root) return;
  const t = (location.pathname.match(/^\/m\/([a-f0-9]{48})\/?$/) || [])[1] || '';
  const paint = async () => {
    let b = null; try { b = (await c.api('/api/book/manage?t=' + t)).booking; } catch {}
    if (!document.body.contains(root)) return;
    if (b?.business?.name) document.title = b.business.name;
    manageView(c, root, b, { onCancel: async () => {
      try { await c.api('/api/book/cancel', { method: 'POST', body: JSON.stringify({ t }) }); c.toast(L(c, 'mCancelled'), 'success'); }
      catch (e) { c.toast(L(c, e?.code === 'cancelClosed' ? 'mCancelClosed' : 'tryAgain'), 'error'); }
      paint();
    } });
  };
  paint();
}

// ── /me ───────────────────────────────────────────────────────────────────────────────────────────────────────────
export const mePage = c => `<section class="book-shell" id="me-root"><p class="book-loading" role="status">${L(c, 'loading')}</p></section>`;
export async function bindMe(c) {
  const root = document.getElementById('me-root'); if (!root) return;
  const s = { step: 'list', phone: '', err: '', country: 'PS' };
  const shell = inner => `<div class="book"><header class="title-block"><h1>${L(c, 'meTitle')}</h1><p class="lead">${L(c, 'meLead')}</p></header><div class="book-card">${inner}</div></div>`;
  const statusOf = b => L(c, 'st_' + b.status);
  async function list() {
    let r = null; try { r = await c.api('/api/me/bookings'); } catch (e) { if (e?.code !== 'verifyFirst') { s.err = L(c, 'tryAgain'); } s.step = 'phone'; return paint(); }
    const up = r.bookings.filter(b => b.upcoming), past = r.bookings.filter(b => !b.upcoming);
    const row = b => `<li class="me-row"><div><b>${c.esc(b.business)}</b><small>${c.esc(b.service)} · ${c.esc(b.specialist)}</small></div><div class="me-side"><span>${whenLabel(c, b.date, b.time)}</span><span class="book-status is-${c.esc(b.status)}"><span aria-hidden="true"></span>${statusOf(b)}</span></div></li>`;
    root.innerHTML = shell(`<p class="book-muted" dir="ltr">${c.esc(r.phone)}</p>${r.bookings.length ? `${up.length ? `<h2>${L(c, 'meUpcoming')}</h2><ul class="me-list">${up.map(row).join('')}</ul>` : ''}${past.length ? `<h2>${L(c, 'mePast')}</h2><ul class="me-list">${past.map(row).join('')}</ul>` : ''}` : `<p class="book-empty">${L(c, 'meNone')}</p>`}
      <p class="book-hint">${L(c, 'meNote')}</p><button type="button" class="btn ghost" id="me-forget">${L(c, 'meForget')}</button>`);
    root.querySelector('#me-forget').addEventListener('click', async () => { try { await c.api('/api/book/forget', { method: 'POST', body: '{}' }); } catch {} s.step = 'phone'; paint(); });
  }
  function paint() {
    if (s.step === 'list') return list();
    if (s.step === 'unavailable') { root.innerHTML = shell(`<p class="book-empty">${L(c, 'meUnavailable')}</p>`); return; }
    if (s.step === 'phone') {
      root.innerHTML = shell(`<form class="book-form" id="me-phone" novalidate><div class="book-phone"><div class="book-dial">${c.countryPicker(c.pickerOptions({ name: 'dial', value: s.country, mode: 'dial', label: L(c, 'dialCode') }))}</div>
        <label class="book-field"><span>${L(c, 'phone')}</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" dir="ltr" required></label></div>${s.err ? `<p class="book-error" role="alert">${c.esc(s.err)}</p>` : ''}<button class="btn primary" type="submit">${L(c, 'next')}</button></form>`);
      const f = root.querySelector('#me-phone'), dial = c.bindCountryPicker(f.querySelector('[data-cpick="dial"]'), c.pickerOptions({ pinned: c.PINNED }));
      if (dial.value) dial.choose(dial.value, { silent: true });
      f.addEventListener('submit', async e => {
        e.preventDefault(); const n = c.phoneE164(f.elements.phone.value, dial.value); s.country = dial.value;
        if (!n) { s.err = L(c, 'invalidPhone'); return paint(); }
        s.phone = n.number;
        try { const r = await c.api('/api/book/phone', { method: 'POST', body: JSON.stringify({ phone: s.phone, purpose: 'my_bookings', lang: c.lang }) }); s.err = ''; s.step = r.state === 'verified' ? 'list' : 'code'; }
        catch (er) { if (er?.code === 'verifyUnavailable') s.step = 'unavailable'; else s.err = W[er?.code] ? L(c, er.code) : L(c, 'tryAgain'); }
        paint();
      });
      return;
    }
    if (s.step === 'code') {
      root.innerHTML = shell(`<p class="book-muted">${L(c, 'codeSentWa', { phone: `<bdi dir="ltr">${c.esc(s.phone)}</bdi>` })}</p><form class="book-form" id="me-code" novalidate><label class="book-field"><span>${L(c, 'code')}</span><input class="book-otp" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" dir="ltr" required></label>${s.err ? `<p class="book-error" role="alert">${c.esc(s.err)}</p>` : ''}<button class="btn primary" type="submit">${L(c, 'verify')}</button></form>`);
      const f = root.querySelector('#me-code'); f.elements.code.focus();
      f.addEventListener('submit', async e => {
        e.preventDefault();
        try { await c.api('/api/book/code', { method: 'POST', body: JSON.stringify({ code: f.elements.code.value }) }); s.err = ''; s.step = 'list'; }
        catch (er) { s.err = er?.code === 'wrongCode' ? L(c, 'wrongCode', { left: String(er.left ?? '') }) : L(c, 'codeExpired'); if (er?.code !== 'wrongCode') s.step = 'phone'; }
        paint();
      });
    }
  }
  paint();
}

// ── /forgot: business account password reset by email code (BIZ-001) ────────────────────────────────────────────────
const F = {
  title: { en: 'Reset your password', ar: 'إعادة تعيين كلمة المرور', he: 'איפוס הסיסמה' },
  lead: { en: 'We’ll email you a 6-digit code from support@meton.work.', ar: 'سنرسل إليك رمزاً من 6 أرقام من support@meton.work.', he: 'נשלח אליך קוד בן 6 ספרות מ-support@meton.work.' },
  email: { en: 'Email', ar: 'البريد الإلكتروني', he: 'אימייל' },
  send: { en: 'Send code', ar: 'إرسال الرمز', he: 'שליחת קוד' },
  sent: { en: 'If an account uses {email}, a code is on its way. Check your inbox and spam folder.', ar: 'إذا كان هناك حساب بالبريد {email} فالرمز في الطريق. تحقق من البريد الوارد ومجلد الرسائل غير المرغوب فيها.', he: 'אם קיים חשבון עם {email}, הקוד בדרך. בדקו את תיבת הדואר ואת תיקיית הספאם.' },
  code: { en: 'Code', ar: 'الرمز', he: 'קוד' },
  pw: { en: 'New password (at least 10 characters)', ar: 'كلمة المرور الجديدة (10 أحرف على الأقل)', he: 'סיסמה חדשה (לפחות 10 תווים)' },
  pw2: { en: 'Repeat the new password', ar: 'أعد كتابة كلمة المرور الجديدة', he: 'חזרו על הסיסמה החדשה' },
  save: { en: 'Save new password', ar: 'حفظ كلمة المرور الجديدة', he: 'שמירת הסיסמה החדשה' },
  done: { en: 'Your password was changed. Log in with the new one.', ar: 'تم تغيير كلمة المرور. سجّل الدخول بالكلمة الجديدة.', he: 'הסיסמה שונתה. התחברו עם הסיסמה החדשה.' },
  login: { en: 'Log in', ar: 'تسجيل الدخول', he: 'התחברות' },
  e_wrongCode: { en: 'That code isn’t right.', ar: 'الرمز غير صحيح.', he: 'הקוד שגוי.' },
  e_codeExpired: { en: 'This code has expired. Ask for a new one.', ar: 'انتهت صلاحية الرمز. اطلب رمزاً جديداً.', he: 'תוקף הקוד פג. בקשו קוד חדש.' },
  e_invalidPassword: { en: 'Use 10 to 128 characters.', ar: 'استخدم من 10 إلى 128 حرفاً.', he: 'השתמשו ב-10 עד 128 תווים.' },
  e_weakPassword: { en: 'This password is too easy to guess.', ar: 'كلمة المرور هذه سهلة التخمين.', he: 'הסיסמה הזו קלה מדי לניחוש.' },
  e_passwordPersonal: { en: 'Don’t use your email in the password.', ar: 'لا تستخدم بريدك الإلكتروني في كلمة المرور.', he: 'אל תשתמשו באימייל בסיסמה.' },
  e_passwordMismatch: { en: 'The two passwords are different.', ar: 'كلمتا المرور غير متطابقتين.', he: 'שתי הסיסמאות שונות.' },
  e_invalidEmail: { en: 'Enter a valid email.', ar: 'أدخل بريداً إلكترونياً صحيحاً.', he: 'הזינו אימייל תקין.' },
  e_other: { en: 'Something went wrong. Try again.', ar: 'حدث خطأ. حاول مرة أخرى.', he: 'משהו השתבש. נסו שוב.' },
};
const FL = (c, k, v = {}) => { let s = (F[k] && (F[k][c.lang] || F[k].en)) || k; for (const [a, b] of Object.entries(v)) s = s.split('{' + a + '}').join(b); return s; };
export const forgotPage = c => `<section class="book-shell" id="forgot-root"><p class="book-loading" role="status">${FL(c, 'title')}</p></section>`;
export function bindForgot(c) {
  const root = document.getElementById('forgot-root'); if (!root) return;
  const s = { step: 'email', email: '', err: '' };
  const errOf = e => FL(c, F['e_' + e?.code] ? 'e_' + e.code : 'e_other');
  function paint() {
    const err = s.err ? `<p class="book-error" role="alert">${c.esc(s.err)}</p>` : '';
    const body = s.step === 'email' ? `<form class="book-form" id="fg-email" novalidate><label class="book-field"><span>${FL(c, 'email')}</span><input name="email" type="email" autocomplete="email" dir="ltr" required value="${c.esc(s.email)}"></label>${err}<button class="btn primary" type="submit">${FL(c, 'send')}</button></form>`
      : s.step === 'code' ? `<p class="book-muted">${FL(c, 'sent', { email: `<bdi dir="ltr">${c.esc(s.email)}</bdi>` })}</p><form class="book-form" id="fg-reset" novalidate><label class="book-field"><span>${FL(c, 'code')}</span><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" dir="ltr" required></label>
          <label class="book-field"><span>${FL(c, 'pw')}</span><input name="password" type="password" autocomplete="new-password" minlength="10" maxlength="128" required value="${c.esc(s.pw || '')}"></label>
          <label class="book-field"><span>${FL(c, 'pw2')}</span><input name="passwordConfirm" type="password" autocomplete="new-password" maxlength="128" required value="${c.esc(s.pw2 || '')}"></label>${err}<button class="btn primary" type="submit">${FL(c, 'save')}</button></form>`
      : `<p>${FL(c, 'done')}</p><a class="btn primary" href="/login">${FL(c, 'login')}</a>`;
    root.innerHTML = `<div class="book"><header class="title-block"><h1>${FL(c, 'title')}</h1><p class="lead">${FL(c, 'lead')}</p></header><div class="book-card">${body}</div></div>`;
    root.querySelector('#fg-email')?.addEventListener('submit', async e => {
      e.preventDefault(); s.email = e.target.elements.email.value.trim();
      try { await c.api('/api/password/code', { method: 'POST', body: JSON.stringify({ email: s.email, lang: c.lang }) }); s.err = ''; s.step = 'code'; } catch (er) { s.err = errOf(er); }
      paint();
    });
    root.querySelector('#fg-reset')?.addEventListener('submit', async e => {
      e.preventDefault(); const f = e.target.elements; s.pw = f.password.value; s.pw2 = f.passwordConfirm.value;
      try { await c.api('/api/password/reset', { method: 'POST', body: JSON.stringify({ email: s.email, code: f.code.value, password: f.password.value, passwordConfirm: f.passwordConfirm.value }) }); s.err = ''; s.step = 'done'; }
      catch (er) { s.err = errOf(er); if (er?.code === 'codeExpired') { s.step = 'email'; s.pw = s.pw2 = ''; } }
      paint();
    });
  }
  paint();
}
