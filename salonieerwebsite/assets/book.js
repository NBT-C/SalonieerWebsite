// METON 2.44 (2026-11-06): booking pages and Try METON Free (decision record v2.0).
//  /s/<code>       a business's booking page: service → specialist → time → phone → verification → name → request.
//                  No account. A small app strip that never blocks booking (BOOK-006, NEW-015).
//  /m/<token>      one booking's private link: status, details, cancel within the business's rules (GUEST-001..004).
//  /me             My bookings: the bookings made with a verified number (AUTH-004/005, IDENT-006).
//  /try            Try METON Free: (A) book as a customer in an example business, (B) build a business page and test it
//                  (NEW-006..012). Demos never call the booking server: verification is simulated in the page, nothing
//                  is sent, no time is taken, no record is made.
// The same step screens serve the real page and both demos; only the data source differs.

const W = {
  loading: { en: 'Loading…', ar: 'جارٍ التحميل…', he: 'טוען…' },
  notFound: { en: 'This booking link isn’t valid. Ask the business for its link again.', ar: 'رابط الحجز غير صحيح. اطلب الرابط من صاحب العمل من جديد.', he: 'קישור ההזמנה אינו תקין. בקשו מהעסק את הקישור שוב.' },
  stepService: { en: 'Service', ar: 'الخدمة', he: 'שירות' },
  stepSpecialist: { en: 'Specialist', ar: 'المختص', he: 'איש מקצוע' },
  stepTime: { en: 'Time', ar: 'الموعد', he: 'מועד' },
  stepDetails: { en: 'Your details', ar: 'بياناتك', he: 'הפרטים שלך' },
  chooseService: { en: 'Choose a service', ar: 'اختر الخدمة', he: 'בחרו שירות' },
  chooseSpecialist: { en: 'Choose a specialist', ar: 'اختر المختص', he: 'בחרו איש מקצוע' },
  chooseTime: { en: 'Choose a day and time', ar: 'اختر اليوم والوقت', he: 'בחרו יום ושעה' },
  noServices: { en: 'This business has no services to book online yet.', ar: 'لا توجد خدمات متاحة للحجز عبر الإنترنت في هذا العمل بعد.', he: 'לעסק הזה עדיין אין שירותים להזמנה מקוונת.' },
  closed: { en: 'This business isn’t taking bookings right now.', ar: 'هذا العمل لا يستقبل حجوزات حالياً.', he: 'העסק הזה לא מקבל הזמנות כרגע.' },
  offline: { en: 'Online booking isn’t open yet. Contact the business to book.', ar: 'الحجز عبر الإنترنت غير متاح بعد. تواصل مع العمل للحجز.', he: 'הזמנה מקוונת עדיין לא פתוחה. פנו לעסק כדי להזמין.' },
  noNew: { en: 'This business isn’t accepting new customers online.', ar: 'هذا العمل لا يستقبل عملاء جدداً عبر الإنترنت.', he: 'העסק הזה לא מקבל לקוחות חדשים באופן מקוון.' },
  noTimes: { en: 'No free times on this day. Try another day.', ar: 'لا توجد أوقات متاحة في هذا اليوم. جرّب يوماً آخر.', he: 'אין זמנים פנויים ביום הזה. נסו יום אחר.' },
  noDays: { en: 'No working days are open for booking right now.', ar: 'لا توجد أيام عمل متاحة للحجز حالياً.', he: 'אין כרגע ימי עבודה פתוחים להזמנה.' },
  back: { en: 'Back', ar: 'رجوع', he: 'חזרה' },
  next: { en: 'Continue', ar: 'متابعة', he: 'המשך' },
  change: { en: 'Change', ar: 'تغيير', he: 'שינוי' },
  minutes: { en: 'min', ar: 'دقيقة', he: 'דק׳' },
  phoneTitle: { en: 'Your phone number', ar: 'رقم هاتفك', he: 'מספר הטלפון שלך' },
  phoneWhy: { en: 'We confirm the number with a short code, then ask for your name.', ar: 'نتحقق من الرقم برمز قصير، ثم نسأل عن اسمك.', he: 'נאמת את המספר בקוד קצר, ואז נשאל לשמך.' },
  phoneWhyNone: { en: 'The business uses it to reach you about this booking.', ar: 'يستخدمه العمل للتواصل معك بخصوص هذا الحجز.', he: 'העסק ישתמש בו כדי ליצור איתך קשר לגבי ההזמנה.' },
  phone: { en: 'Phone number', ar: 'رقم الهاتف', he: 'מספר טלפון' },
  dialCode: { en: 'Country code', ar: 'رمز الدولة', he: 'קידומת מדינה' },
  invalidPhone: { en: 'Enter a valid mobile number.', ar: 'أدخل رقم هاتف محمول صحيحاً.', he: 'הזינו מספר נייד תקין.' },
  codeTitle: { en: 'Enter the code', ar: 'أدخل الرمز', he: 'הזינו את הקוד' },
  codeSentWa: { en: 'We sent a 6-digit code to {phone} on WhatsApp.', ar: 'أرسلنا رمزاً من 6 أرقام إلى {phone} عبر واتساب.', he: 'שלחנו קוד בן 6 ספרות אל {phone} ב-WhatsApp.' },
  code: { en: 'Code', ar: 'الرمز', he: 'קוד' },
  verify: { en: 'Verify', ar: 'تحقق', he: 'אימות' },
  resend: { en: 'Send a new code', ar: 'إرسال رمز جديد', he: 'שליחת קוד חדש' },
  resendIn: { en: 'New code in {s} s', ar: 'رمز جديد بعد {s} ث', he: 'קוד חדש בעוד {s} שנ׳' },
  wrongCode: { en: 'That code isn’t right. {left} tries left.', ar: 'الرمز غير صحيح. تبقّى {left} محاولات.', he: 'הקוד שגוי. נותרו {left} ניסיונות.' },
  codeExpired: { en: 'This code has expired. Send a new one.', ar: 'انتهت صلاحية الرمز. أرسل رمزاً جديداً.', he: 'תוקף הקוד פג. שלחו קוד חדש.' },
  codeTooSoon: { en: 'Please wait a moment before asking for another code.', ar: 'انتظر قليلاً قبل طلب رمز آخر.', he: 'המתינו רגע לפני בקשת קוד נוסף.' },
  codeNotSent: { en: 'We couldn’t send the code. Try again in a moment.', ar: 'تعذّر إرسال الرمز. حاول بعد قليل.', he: 'לא הצלחנו לשלוח את הקוד. נסו שוב בעוד רגע.' },
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
  // Try METON Free
  tryTitle: { en: 'Try METON free', ar: 'جرّب METON مجاناً', he: 'נסו את METON בחינם' },
  tryLead: { en: 'No account and no payment needed. Pick how you want to try it.', ar: 'بدون حساب وبدون دفع. اختر طريقة التجربة.', he: 'בלי חשבון ובלי תשלום. בחרו איך לנסות.' },
  tryA: { en: 'Book as a customer', ar: 'احجز كعميل', he: 'הזמנה כלקוח' },
  tryABody: { en: 'Open a ready-made example business and book an appointment: service, specialist, time, then a demo verification.', ar: 'افتح عملاً تجريبياً جاهزاً واحجز موعداً: الخدمة ثم المختص ثم الوقت، ثم تحقق تجريبي.', he: 'פתחו עסק לדוגמה מוכן והזמינו תור: שירות, איש מקצוע, שעה, ואז אימות לדוגמה.' },
  tryB: { en: 'Build your business page', ar: 'أنشئ صفحة عملك', he: 'בנו את דף העסק שלכם' },
  tryBBody: { en: 'Enter your business, services, team and hours, preview your booking page, make test bookings and see them in a sample dashboard.', ar: 'أدخل بيانات عملك وخدماتك وفريقك وساعات العمل، وعاين صفحة الحجز، واحجز مواعيد تجريبية وشاهدها في لوحة تجريبية.', he: 'הזינו את העסק, השירותים, הצוות והשעות, צפו בדף ההזמנה, בצעו הזמנות ניסיון וראו אותן בלוח בקרה לדוגמה.' },
  tryStart: { en: 'Start', ar: 'ابدأ', he: 'התחלה' },
  demoBadge: { en: 'Demo', ar: 'تجربة', he: 'הדגמה' },
  demoBar: { en: 'Demo: nothing is sent, booked or saved on a server.', ar: 'تجربة: لا يُرسل شيء ولا يُحجز ولا يُحفظ على الخادم.', he: 'הדגמה: שום דבר לא נשלח, לא מוזמן ולא נשמר בשרת.' },
  demoCode: { en: 'This is a demo verification. No message is being sent. For real bookings, a verification code may be sent to your phone (for example on WhatsApp) when needed. Demo code: {code}', ar: 'هذا تحقق تجريبي. لا تُرسل أي رسالة. في الحجوزات الحقيقية قد يصل رمز تحقق إلى هاتفك (مثلاً عبر واتساب) عند الحاجة. الرمز التجريبي: {code}', he: 'זהו אימות לדוגמה. לא נשלחת הודעה. בהזמנות אמיתיות ייתכן שקוד אימות יישלח לטלפון שלכם (למשל ב-WhatsApp) כשצריך. קוד לדוגמה: {code}' },
  useDemoCode: { en: 'Use demo code', ar: 'استخدم الرمز التجريبي', he: 'שימוש בקוד לדוגמה' },
  demoDone: { en: 'Demo booking made', ar: 'تم الحجز التجريبي', he: 'הזמנת ההדגמה בוצעה' },
  demoDoneSub: { en: 'In a real booking the business now confirms it, and you keep a private link to your booking.', ar: 'في الحجز الحقيقي يؤكده العمل الآن، وتحتفظ برابط خاص لحجزك.', he: 'בהזמנה אמיתית העסק מאשר אותה עכשיו, ואתם שומרים קישור פרטי להזמנה.' },
  demoAgain: { en: 'Try again', ar: 'جرّب مرة أخرى', he: 'לנסות שוב' },
  tryOther: { en: 'Try the other demo', ar: 'جرّب التجربة الأخرى', he: 'לנסות את ההדגמה השנייה' },
  seePlans: { en: 'See plans', ar: 'عرض الخطط', he: 'צפייה במסלולים' },
  // owner demo (builder)
  bTitle: { en: 'Build your booking page', ar: 'أنشئ صفحة الحجز الخاصة بك', he: 'בנו את דף ההזמנה שלכם' },
  bLead: { en: 'A private preview: only you see it. Make test bookings, then go live when you’re ready.', ar: 'معاينة خاصة: لا يراها غيرك. احجز مواعيد تجريبية، ثم انشر الصفحة عندما تكون جاهزاً.', he: 'תצוגה מקדימה פרטית: רק אתם רואים אותה. בצעו הזמנות ניסיון, ואז עלו לאוויר כשאתם מוכנים.' },
  bBusiness: { en: 'Business', ar: 'العمل', he: 'העסק' },
  bName: { en: 'Business name', ar: 'اسم العمل', he: 'שם העסק' },
  bKind: { en: 'What you do (for example: physiotherapy, consulting, barber shop)', ar: 'مجال عملك (مثلاً: علاج طبيعي، استشارات، صالون حلاقة)', he: 'במה אתם עוסקים (למשל: פיזיותרפיה, ייעוץ, מספרה)' },
  bColor: { en: 'Brand colour', ar: 'لون العلامة', he: 'צבע המותג' },
  bServices: { en: 'Services', ar: 'الخدمات', he: 'שירותים' },
  bServiceName: { en: 'Service', ar: 'الخدمة', he: 'שירות' },
  bDuration: { en: 'Minutes', ar: 'الدقائق', he: 'דקות' },
  bPrice: { en: 'Price', ar: 'السعر', he: 'מחיר' },
  bAddService: { en: 'Add a service', ar: 'إضافة خدمة', he: 'הוספת שירות' },
  bTeam: { en: 'Team', ar: 'الفريق', he: 'צוות' },
  bPerson: { en: 'Name', ar: 'الاسم', he: 'שם' },
  bRole: { en: 'Role (optional)', ar: 'الدور (اختياري)', he: 'תפקיד (רשות)' },
  bAddPerson: { en: 'Add a team member', ar: 'إضافة عضو فريق', he: 'הוספת איש צוות' },
  bOffers: { en: 'Offers', ar: 'يقدّم', he: 'מציע/ה' },
  bHours: { en: 'Opening hours', ar: 'ساعات العمل', he: 'שעות פעילות' },
  bFrom: { en: 'From', ar: 'من', he: 'מ־' },
  bTo: { en: 'To', ar: 'إلى', he: 'עד' },
  bRemove: { en: 'Remove', ar: 'حذف', he: 'הסרה' },
  bPreview: { en: 'Preview', ar: 'المعاينة', he: 'תצוגה מקדימה' },
  bPreviewNote: { en: 'Private preview · not public · test bookings only', ar: 'معاينة خاصة · غير منشورة · حجوزات تجريبية فقط', he: 'תצוגה פרטית · לא ציבורית · הזמנות ניסיון בלבד' },
  bAdmin: { en: 'Your dashboard (sample)', ar: 'لوحة التحكم (تجريبية)', he: 'לוח הבקרה (לדוגמה)' },
  bAdminEmpty: { en: 'Test bookings you make in the preview appear here.', ar: 'تظهر هنا الحجوزات التجريبية التي تجريها في المعاينة.', he: 'הזמנות הניסיון שתבצעו בתצוגה יופיעו כאן.' },
  bConfirm: { en: 'Confirm', ar: 'تأكيد', he: 'אישור' },
  bDecline: { en: 'Decline', ar: 'رفض', he: 'דחייה' },
  bSaved: { en: 'Saved in this browser only.', ar: 'محفوظ في هذا المتصفح فقط.', he: 'נשמר בדפדפן הזה בלבד.' },
  bSaveTitle: { en: 'Keep it and go live', ar: 'احتفظ بها وانشرها', he: 'לשמור ולעלות לאוויר' },
  bSaveBody: { en: 'Your draft stays in this browser. To keep it on your account, sign in or create a free account. Your page goes public instantly once your subscription is active — no approval wait.', ar: 'تبقى مسودتك في هذا المتصفح. لحفظها في حسابك، سجّل الدخول أو أنشئ حساباً مجانياً. تُنشر صفحتك فوراً عند تفعيل اشتراكك — دون انتظار موافقة.', he: 'הטיוטה נשארת בדפדפן הזה. כדי לשמור אותה בחשבון, התחברו או צרו חשבון חינמי. הדף שלכם עולה לאוויר מיד כשהמנוי פעיל — בלי המתנה לאישור.' },
  bSaveBtn: { en: 'Save to my account', ar: 'حفظ في حسابي', he: 'שמירה בחשבון' },
  bSavedAccount: { en: 'Saved to your account.', ar: 'تم الحفظ في حسابك.', he: 'נשמר בחשבון שלך.' },
  bGoLive: { en: 'Go live — choose a plan', ar: 'انشر الآن — اختر خطة', he: 'לעלות לאוויר — בחירת מסלול' },
  bReset: { en: 'Start over', ar: 'البدء من جديد', he: 'להתחיל מחדש' },
  bNeedService: { en: 'Add at least one service and one team member to preview bookings.', ar: 'أضف خدمة واحدة وعضو فريق واحداً على الأقل لمعاينة الحجز.', he: 'הוסיפו לפחות שירות אחד ואיש צוות אחד כדי לראות הזמנות.' },
  bFlagged: { en: 'We’ll review a few words in your draft before it goes public (for example links in the name or description).', ar: 'سنراجع بعض الكلمات في مسودتك قبل نشرها (مثل الروابط في الاسم أو الوصف).', he: 'נבדוק כמה מילים בטיוטה לפני שהיא תעלה לאוויר (למשל קישורים בשם או בתיאור).' },
};
const L = (c, k, vars = {}) => { let s = (W[k] && (W[k][c.lang] || W[k].en)) || k; for (const [a, b] of Object.entries(vars)) s = s.split('{' + a + '}').join(b); return s; };
const STORE = { android: 'https://play.google.com/store/apps/details?id=com.salonieer.app', ios: 'https://apps.apple.com/app/id6813588408' };
const device = () => /android/i.test(navigator.userAgent) ? 'android' : (/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) ? 'ios' : 'desktop';
const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { return null; } };
const rid = () => { const b = crypto.getRandomValues(new Uint8Array(16)); return [...b].map(x => x.toString(16).padStart(2, '0')).join(''); };
const ymdIn = (date, tz) => { try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); } catch { return date.toISOString().slice(0, 10); } };
const addDays = (ymd, n) => { const [y, m, d] = ymd.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10); };
const weekday = ymd => { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const dayLabel = (c, ymd) => { const [y, m, d] = ymd.split('-').map(Number); try { return new Intl.DateTimeFormat(c.lang === 'he' ? 'he-IL' : c.lang === 'ar' ? 'ar' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d))); } catch { return ymd; } };
const whenLabel = (c, ymd, hm) => `${dayLabel(c, ymd)} · <bdi dir="ltr">${hm}</bdi>`;
const money = (c, v, cur) => { if (v === null || v === undefined || v === '') return ''; try { return new Intl.NumberFormat(c.lang === 'ar' ? 'ar' : c.lang === 'he' ? 'he-IL' : 'en', { style: 'currency', currency: cur || 'ILS', maximumFractionDigits: 2 }).format(Number(v)); } catch { return String(v); } };
const initials = s => (String(s || '?').trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2) || '?').toUpperCase();
const avatar = (c, name, url) => url ? `<img class="book-av" src="${c.esc(url)}" alt="" loading="lazy">` : `<span class="book-av is-initials" aria-hidden="true">${c.esc(initials(name))}</span>`;

// ── the step screens (shared by the real page and the demos) ───────────────────────────────────────────────────
// page: { name, logo_url, code, slug, timezone, settings, services, specialists }
// src:  { mode: 'live'|'demo', verify: 'whatsapp'|'none'|'demo', times(sp, svc, date), phone(e164), code(code), book(payload) }
function runBooking(c, root, page, src, opts = {}) {
  const s = { step: 'service', svc: null, sp: null, date: null, time: null, phone: '', verified: false, hint: null, useHint: true, key: rid(), result: null, err: '', busy: false, codeState: null };
  const set = page.settings || {};
  const bookable = page.services.filter(x => page.specialists.some(p => (p.services || []).includes(x.id)));
  const today = ymdIn(new Date(), page.timezone || 'Asia/Hebron');
  const steps = [['service', 'stepService'], ['specialist', 'stepSpecialist'], ['time', 'stepTime'], ['details', 'stepDetails']];
  const stepIndex = { service: 0, specialist: 1, time: 2, phone: 3, code: 3, name: 3, done: 4 };
  const svcOf = id => page.services.find(x => x.id === id), spOf = id => page.specialists.find(x => x.id === id);
  const head = () => `<header class="book-biz">${page.logo_url ? `<img class="book-logo" src="${c.esc(page.logo_url)}" alt="">` : `<span class="book-logo is-initials" aria-hidden="true">${c.esc(initials(page.name))}</span>`}
      <div><h1>${c.esc(page.name)}</h1>${opts.sub ? `<p class="book-biz-sub">${opts.sub}</p>` : ''}</div>${src.mode === 'demo' ? `<span class="book-demo-badge">${L(c, 'demoBadge')}</span>` : ''}</header>`;
  const banner = () => {
    if (src.mode !== 'live' || store('meton_app_strip') === 'off') return '';
    const dev = device(), code = encodeURIComponent(page.code || '');
    const play = STORE.android + '&referrer=' + encodeURIComponent('salon=' + (page.code || ''));
    const open = dev === 'android' ? `intent://salon/${code}#Intent;scheme=salonieer;package=com.salonieer.app;S.browser_fallback_url=${encodeURIComponent(play)};end` : dev === 'ios' ? `salonieer://salon/${code}` : '';
    return `<aside class="book-strip" id="book-strip"><span>${L(c, 'bannerText')}</span><span class="book-strip-actions">${open ? `<a class="btn small" href="${c.esc(open)}">${L(c, 'bannerOpen')}</a>` : ''}<a class="btn small" href="${c.esc(dev === 'ios' ? STORE.ios : play)}" rel="noopener">${L(c, 'bannerGet')}</a><button type="button" class="btn small ghost" id="book-strip-close">${L(c, 'bannerStay')}</button></span></aside>`;
  };
  const progress = () => { const i = stepIndex[s.step]; return `<ol class="book-progress" aria-label="${L(c, 'stepDetails')}">${steps.map(([, k], n) => `<li class="${n < i ? 'is-done' : n === i ? 'is-current' : ''}"${n === i ? ' aria-current="step"' : ''}><span>${n + 1}</span>${L(c, k)}</li>`).join('')}</ol>`; };
  const picked = () => {
    const parts = [];
    if (s.svc) parts.push(`<button type="button" class="book-chip" data-go="service">${c.esc(svcOf(s.svc).name)}</button>`);
    if (s.sp) parts.push(`<button type="button" class="book-chip" data-go="specialist">${c.esc(spOf(s.sp).name)}</button>`);
    if (s.date && s.time && stepIndex[s.step] > 2) parts.push(`<button type="button" class="book-chip" data-go="time">${whenLabel(c, s.date, s.time)}</button>`);
    return parts.length ? `<div class="book-picked">${parts.join('')}</div>` : '';
  };
  const err = () => s.err ? `<p class="book-error" role="alert">${c.esc(s.err)}</p>` : '';
  const backBtn = to => `<button type="button" class="btn ghost book-back" data-go="${to}">${L(c, 'back')}</button>`;
  const blocked = !set.open ? (set.closed_message || L(c, 'closed')) : set.online_booking === false ? L(c, 'offline') : !bookable.length ? L(c, 'noServices') : set.new_customers === false ? L(c, 'noNew') : '';

  function view() {
    if (blocked && src.mode === 'live') return `<div class="book-card"><p class="book-empty">${c.esc(blocked)}</p></div>`;
    if (s.step === 'done') return done();
    let body = '';
    if (s.step === 'service') body = `<h2>${L(c, 'chooseService')}</h2><div class="book-list">${bookable.map(x => `<button type="button" class="book-option" data-svc="${x.id}"><span class="book-option-main"><b>${c.esc(x.name)}</b>${x.description ? `<small>${c.esc(x.description)}</small>` : ''}</span><span class="book-option-side"><span>${x.duration} ${L(c, 'minutes')}</span>${set.show_prices !== false && x.price != null ? `<span>${money(c, x.price, set.currency)}</span>` : ''}</span></button>`).join('')}</div>`;
    if (s.step === 'specialist') {
      const team = page.specialists.filter(p => (p.services || []).includes(s.svc));
      body = `<h2>${L(c, 'chooseSpecialist')}</h2><div class="book-list">${team.map(p => `<button type="button" class="book-option is-person" data-sp="${p.id}">${avatar(c, p.name, p.image_url)}<span class="book-option-main"><b>${c.esc(p.name)}</b>${p.specialty ? `<small>${c.esc(p.specialty)}</small>` : ''}</span></button>`).join('')}</div>${backBtn('service')}`;
    }
    if (s.step === 'time') {
      const sp = spOf(s.sp), days = [];
      for (let i = 0; i < (set.window_days || 3); i++) { const d = addDays(today, i); if (sp.days?.[String(weekday(d))]) days.push(d); }
      if (!s.date && days.length) s.date = days[0];
      body = `<h2>${L(c, 'chooseTime')}</h2>${days.length ? `<div class="book-days" role="group">${days.map(d => `<button type="button" class="book-day${d === s.date ? ' is-on' : ''}" data-day="${d}" aria-pressed="${d === s.date}">${dayLabel(c, d)}</button>`).join('')}</div>
        <div class="book-times" id="book-times" aria-live="polite"><p class="book-muted">${L(c, 'loading')}</p></div>` : `<p class="book-empty">${L(c, 'noDays')}</p>`}${backBtn('specialist')}`;
    }
    if (s.step === 'phone') body = `<h2>${L(c, 'phoneTitle')}</h2><p class="book-muted">${L(c, src.verify === 'none' ? 'phoneWhyNone' : 'phoneWhy')}</p>
      <form class="book-form" id="book-phone-form" novalidate><div class="book-phone"><div class="book-dial">${c.countryPicker(c.pickerOptions({ name: 'dial', value: opts.country || 'PS', mode: 'dial', label: L(c, 'dialCode') }))}</div>
      <label class="book-field"><span>${L(c, 'phone')}</span><input name="phone" type="tel" inputmode="tel" autocomplete="tel" dir="ltr" required value="${c.esc(s.phoneLocal || '')}"></label></div>
      ${err()}<button class="btn primary" type="submit">${L(c, 'next')}</button></form>${backBtn('time')}`;
    if (s.step === 'code') body = `<h2>${L(c, 'codeTitle')}</h2><p class="book-muted">${src.verify === 'demo' ? L(c, 'demoCode', { code: '<b dir="ltr">' + DEMO_CODE + '</b>' }) : L(c, 'codeSentWa', { phone: `<bdi dir="ltr">${c.esc(s.phone)}</bdi>` })}</p>
      <form class="book-form" id="book-code-form" novalidate><label class="book-field"><span>${L(c, 'code')}</span><input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" dir="ltr" required></label>
      ${err()}<div class="book-row"><button class="btn primary" type="submit">${L(c, 'verify')}</button>${src.verify === 'demo' ? `<button type="button" class="btn" id="book-demo-code">${L(c, 'useDemoCode')}</button>` : `<button type="button" class="btn ghost" id="book-resend" disabled>${L(c, 'resendIn', { s: '45' })}</button>`}</div></form>${backBtn('phone')}`;
    if (s.step === 'name') {
      const asking = s.hint && s.useHint;
      body = `<h2>${L(c, 'nameTitle')}</h2>${s.trusted ? `<p class="book-muted">${L(c, 'trusted')}</p>` : ''}
        <p class="book-muted book-number"><bdi dir="ltr">${c.esc(s.phone)}</bdi> · <button type="button" class="text-link" id="book-change-phone">${L(c, 'change')}</button></p>
        <form class="book-form" id="book-name-form" novalidate>${asking ? `<p class="book-areyou">${L(c, 'areYou', { name: `<bdi>${c.esc(s.hint)}</bdi>` })}</p><div class="book-row"><button type="button" class="btn primary" id="book-yes">${L(c, 'yesMe')}</button><button type="button" class="btn" id="book-no">${L(c, 'notMe')}</button></div>`
          : `<label class="book-field"><span>${L(c, 'fullName')}</span><input name="name" autocomplete="name" maxlength="60" required value="${c.esc(s.name || '')}"></label>`}
        <label class="book-field"><span>${L(c, 'note')}</span><textarea name="note" maxlength="300" rows="2">${c.esc(s.note || '')}</textarea></label>
        ${src.verify === 'none' && !s.verified ? `<p class="book-hint">${L(c, 'unverifiedNote')}</p>` : ''}
        <p class="book-summary">${L(c, 'summary', { service: c.esc(svcOf(s.svc).name), specialist: c.esc(spOf(s.sp).name), when: whenLabel(c, s.date, s.time) })}</p>
        ${err()}${asking ? '' : `<button class="btn primary" type="submit">${L(c, 'send')}</button>`}</form>${backBtn('time')}`;
    }
    return `<div class="book-card">${picked()}${body}</div>`;
  }
  function done() {
    const r = s.result, b = r.booking || {};
    if (src.mode === 'demo') return `<div class="book-card book-done"><div class="book-done-mark" aria-hidden="true">✓</div><h2>${L(c, 'demoDone')}</h2><p>${L(c, 'demoDoneSub')}</p>
      <p class="book-summary">${L(c, 'summary', { service: c.esc(b.service), specialist: c.esc(b.specialist), when: whenLabel(c, b.date, b.time) })}</p>
      <div class="book-row"><button type="button" class="btn primary" data-again>${L(c, 'demoAgain')}</button>${opts.afterDemo || ''}</div></div>`;
    const url = location.origin + r.manage;
    const dev = device();
    return `<div class="book-card book-done"><div class="book-done-mark" aria-hidden="true">✓</div>
      <h2>${L(c, b.status === 'confirmed' ? 'okConfirmed' : 'okPending')}</h2>${b.status !== 'confirmed' ? `<p>${L(c, 'okPendingSub', { business: c.esc(page.name) })}</p>` : ''}
      <p class="book-summary">${L(c, 'summary', { service: c.esc(b.service), specialist: c.esc(b.specialist), when: whenLabel(c, b.date, b.time) })}</p>
      <section class="book-link"><h3>${L(c, 'manageTitle')}</h3><p class="book-muted">${L(c, 'manageWhy')}</p>
        <div class="book-link-box"><code dir="ltr">${c.esc(url)}</code><button type="button" class="btn small" id="book-copy">${L(c, 'copy')}</button><a class="btn small" href="${c.esc(r.manage)}">${L(c, 'openLink')}</a></div></section>
      <p class="book-hint">${L(c, 'browserOnly')}</p>
      ${store('meton_account_tip') === 'off' ? '' : `<section class="book-account" id="book-account"><h3>${L(c, 'accountTitle')}</h3><p>${L(c, 'accountBody')}</p>
        <div class="book-row">${dev !== 'ios' ? `<a class="btn" href="${STORE.android}" rel="noopener">Google Play</a>` : ''}${dev !== 'android' ? `<a class="btn" href="${STORE.ios}" rel="noopener">App Store</a>` : ''}<button type="button" class="btn ghost" id="book-account-close">${L(c, 'notNow')}</button></div></section>`}
      <button type="button" class="btn ghost" data-again>${L(c, 'bookAnother')}</button></div>`;
  }
  function paint() {
    root.innerHTML = `<div class="book${src.mode === 'demo' ? ' is-demo' : ''}">${src.mode === 'demo' ? `<p class="book-demo-bar">${L(c, 'demoBar')}</p>` : ''}${head()}${banner()}${s.step !== 'done' && !(blocked && src.mode === 'live') ? progress() : ''}${view()}</div>`;
    wire();
    root.querySelector('h2')?.setAttribute('tabindex', '-1');
  }
  const go = step => { s.step = step; s.err = ''; paint(); root.querySelector('h2')?.focus({ preventScroll: false }); };
  async function loadTimes() {
    const host = root.querySelector('#book-times'); if (!host || !s.date) return;
    const want = s.date;
    // The times of the day shown before are never left clickable while another day loads.
    host.innerHTML = `<p class="book-muted">${L(c, 'loading')}</p>`;
    let times = [];
    try { times = await src.times(s.sp, s.svc, s.date); } catch { host.innerHTML = `<p class="book-error">${L(c, 'tryAgain')}</p>`; return; }
    if (want !== s.date || !root.contains(host)) return;
    host.innerHTML = times.length ? `<div class="book-time-grid">${times.map(t => `<button type="button" class="book-time" data-time="${t}" dir="ltr">${t}</button>`).join('')}</div>` : `<p class="book-empty">${L(c, 'noTimes')}</p>`;
    host.querySelectorAll('[data-time]').forEach(b => b.addEventListener('click', () => { s.time = b.dataset.time; go(s.verified ? 'name' : 'phone'); }));
  }
  function codeTimer() {
    const btn = root.querySelector('#book-resend'); if (!btn) return;
    let left = s.resendAt ? Math.max(0, Math.ceil((s.resendAt - Date.now()) / 1000)) : 0;
    const tick = () => { if (!root.contains(btn)) return; left = Math.max(0, Math.ceil((s.resendAt - Date.now()) / 1000)); btn.disabled = left > 0; btn.textContent = left > 0 ? L(c, 'resendIn', { s: String(left) }) : L(c, 'resend'); if (left > 0) setTimeout(tick, 1000); };
    tick();
    btn.addEventListener('click', async () => { btn.disabled = true; await sendPhone(true); });
  }
  const errText = e => e?.code === 'wrongCode' ? L(c, 'wrongCode', { left: String(e.left ?? e.detail?.left ?? '') }) : W[e?.code] ? L(c, e.code) : (e?.code === 'tooManyAttempts' ? L(c, 'codeTooSoon') : L(c, 'tryAgain'));
  async function sendPhone(resend = false) {
    try {
      const r = await src.phone(s.phone);
      if (r.state === 'verified') { s.verified = true; s.trusted = !!r.trusted; s.hint = r.name || null; s.useHint = !!s.hint; go('name'); return; }
      if (r.state === 'unverified') { s.verified = false; s.hint = null; go('name'); return; }
      s.resendAt = Date.now() + (r.resend_in || 45) * 1000; if (!resend || s.step !== 'code') go('code'); else { s.err = ''; paint(); }
    } catch (e) { s.err = errText(e); paint(); }
  }
  async function submit(name, note) {
    if (s.busy) return; s.busy = true;
    const btn = root.querySelector('#book-name-form button[type=submit], #book-yes');
    if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
    try {
      const r = await src.book({ slug: page.slug, service: s.svc, specialist: s.sp, date: s.date, time: s.time, name, note, request_key: s.key });
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
    root.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => { const to = b.dataset.go; if (to === 'service') { s.sp = null; s.date = null; s.time = null; } if (to === 'specialist') { s.date = null; s.time = null; } if (to === 'time') s.time = null; if (to === 'phone' && s.verified) return go('name'); go(to); }));
    root.querySelector('#book-strip-close')?.addEventListener('click', () => { store('meton_app_strip', 'off'); root.querySelector('#book-strip')?.remove(); });
    root.querySelectorAll('[data-svc]').forEach(b => b.addEventListener('click', () => { s.svc = b.dataset.svc; const team = page.specialists.filter(p => (p.services || []).includes(s.svc)); s.sp = null; s.date = null; s.time = null; go('specialist'); if (team.length === 1) { /* one specialist: still shown, one tap */ } }));
    root.querySelectorAll('[data-sp]').forEach(b => b.addEventListener('click', () => { s.sp = b.dataset.sp; s.date = null; s.time = null; go('time'); }));
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
      root.querySelector('#book-demo-code')?.addEventListener('click', () => { cf.elements.code.value = DEMO_CODE; cf.requestSubmit(); });
      cf.elements.code.focus();
      cf.addEventListener('submit', async e => {
        e.preventDefault();
        const code = cf.elements.code.value.replace(/\D/g, '');
        if (code.length !== 6) { s.err = L(c, 'wrongCode', { left: '' }).replace(/\s*\S*\s*$/, '.'); paint(); return; }
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
    root.querySelector('#book-account-close')?.addEventListener('click', () => { store('meton_account_tip', 'off'); root.querySelector('#book-account')?.remove(); });
    root.querySelectorAll('[data-again]').forEach(b => b.addEventListener('click', () => { Object.assign(s, { step: 'service', svc: null, sp: null, date: null, time: null, key: rid(), result: null, err: '' }); paint(); }));
  }
  paint();
  return { state: s, repaint: paint };
}
const DEMO_CODE = '246810';
// The demo's own data source: verification is simulated, no request leaves the page.
function demoSource(page, onBook) {
  const taken = new Set(['10:30', '12:00', '15:30']);
  return {
    mode: 'demo', verify: 'demo',
    times: async (sp, svc, date) => { const out = [], d = (page.services.find(x => x.id === svc)?.duration || 30); const h = page.hours || { from: '09:00', to: '18:00' };
      const [fh, fm] = h.from.split(':').map(Number), [th, tm] = h.to.split(':').map(Number);
      for (let m = fh * 60 + fm; m + d <= th * 60 + tm; m += 30) { const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; if (!taken.has(t) && !(page.booked || []).some(b => b.sp === sp && b.date === date && b.time === t)) out.push(t); }
      return out; },
    phone: async () => ({ state: 'code_sent', resend_in: 0 }),
    code: async code => { if (code !== DEMO_CODE) throw { code: 'wrongCode', left: 4 }; return { name: null }; },
    book: async p => { const svc = page.services.find(x => x.id === p.service), sp = page.specialists.find(x => x.id === p.specialist);
      const r = { booking: { status: 'pending', date: p.date, time: p.time, service: svc.name, specialist: sp.name, name: p.name } };
      onBook?.(p, r); return r; },
  };
}
function liveSource(c, page, verify) {
  return {
    mode: 'live', verify,
    times: (sp, svc, date) => c.api(`/api/book/times?slug=${encodeURIComponent(page.slug)}&service=${encodeURIComponent(svc)}&specialist=${encodeURIComponent(sp)}&date=${encodeURIComponent(date)}`).then(r => r.times || []),
    phone: phone => c.api('/api/book/phone', { method: 'POST', body: JSON.stringify({ phone, slug: page.slug, purpose: 'booking', lang: c.lang }) }),
    code: code => c.api('/api/book/code', { method: 'POST', body: JSON.stringify({ code, slug: page.slug }) }),
    book: payload => c.api('/api/book', { method: 'POST', body: JSON.stringify(payload) }),
  };
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
  document.title = data.page.name + ' · METON';
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
    if (!b || !b.valid) {
      const k = b?.reason === 'cancelled' ? 'mGone_cancelled' : b?.reason === 'started' ? 'mGone_started' : 'mGone_other';
      root.innerHTML = `<div class="book"><div class="book-card"><h1 class="book-h1">${L(c, 'mTitle')}</h1><p class="book-empty">${L(c, k)}</p></div></div>`; return;
    }
    const until = b.cancel_until ? new Intl.DateTimeFormat(c.lang === 'he' ? 'he-IL' : c.lang === 'ar' ? 'ar' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(b.cancel_until)) : '';
    root.innerHTML = `<div class="book"><header class="book-biz">${b.business?.logo_url ? `<img class="book-logo" src="${c.esc(b.business.logo_url)}" alt="">` : `<span class="book-logo is-initials" aria-hidden="true">${c.esc(initials(b.business?.name))}</span>`}<div><h1>${c.esc(b.business?.name || '')}</h1><p class="book-biz-sub">${L(c, 'mTitle')}</p></div></header>
      <div class="book-card"><p class="book-status is-${c.esc(b.status)}">${L(c, b.status === 'confirmed' ? 'mConfirmed' : 'mPending')}</p>
      <dl class="book-dl"><div><dt>${L(c, 'stepService')}</dt><dd>${c.esc(b.service)}</dd></div><div><dt>${L(c, 'stepSpecialist')}</dt><dd>${c.esc(b.specialist)}</dd></div><div><dt>${L(c, 'stepTime')}</dt><dd>${whenLabel(c, b.date, b.time)}</dd></div><div><dt>${L(c, 'nameTitle')}</dt><dd><bdi>${c.esc(b.name)}</bdi></dd></div></dl>
      ${!b.cancellation_allowed ? `<p class="book-hint">${L(c, 'mNoCancel')}</p>` : b.can_cancel ? `<p class="book-muted">${L(c, 'mCancelUntil', { when: c.esc(until) })}</p><button type="button" class="btn danger" id="m-cancel">${L(c, 'mCancel')}</button>` : `<p class="book-hint">${L(c, 'mCancelClosed')}</p>`}
      ${b.business?.code ? `<a class="btn ghost" href="/s/${encodeURIComponent(b.business.code)}">${L(c, 'mBookAgain', { business: c.esc(b.business.name) })}</a>` : ''}</div></div>`;
    root.querySelector('#m-cancel')?.addEventListener('click', async ev => {
      if (!(await c.confirmDialog({ title: L(c, 'mCancel'), body: L(c, 'mCancelAsk'), confirm: L(c, 'mCancel'), cancel: L(c, 'back') }))) return;
      ev.target.disabled = true;
      try { await c.api('/api/book/cancel', { method: 'POST', body: JSON.stringify({ t }) }); c.toast(L(c, 'mCancelled'), 'success'); }
      catch (e) { c.toast(L(c, e?.code === 'cancelClosed' ? 'mCancelClosed' : 'tryAgain'), 'error'); }
      paint();
    });
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
    const row = b => `<li class="me-row"><div><b>${c.esc(b.business)}</b><small>${c.esc(b.service)} · ${c.esc(b.specialist)}</small></div><div class="me-side"><span>${whenLabel(c, b.date, b.time)}</span><span class="book-status is-${c.esc(b.status)}">${statusOf(b)}</span></div></li>`;
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
      root.innerHTML = shell(`<p class="book-muted">${L(c, 'codeSentWa', { phone: `<bdi dir="ltr">${c.esc(s.phone)}</bdi>` })}</p><form class="book-form" id="me-code" novalidate><label class="book-field"><span>${L(c, 'code')}</span><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" dir="ltr" required></label>${s.err ? `<p class="book-error" role="alert">${c.esc(s.err)}</p>` : ''}<button class="btn primary" type="submit">${L(c, 'verify')}</button></form>`);
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

// ── /try ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// The example business, in the visitor's language (made up; any kind of business can use the same page).
function demoBusiness(c) {
  const T = (en, ar, he) => ({ en, ar, he })[c.lang] || en;
  const svc = [['s1', T('First consultation', 'استشارة أولى', 'ייעוץ ראשוני'), 30, 60], ['s2', T('Physiotherapy session', 'جلسة علاج طبيعي', 'טיפול פיזיותרפיה'), 45, 80], ['s3', T('Sports massage', 'مساج رياضي', 'עיסוי ספורטאים'), 60, 120], ['s4', T('Follow-up visit', 'زيارة متابعة', 'ביקור מעקב'), 20, 40]];
  const all = { 0: true, 1: true, 2: true, 3: true, 4: true, 5: false, 6: true };
  return { name: T('Nova Physio & Wellness', 'مركز نوفا للعلاج الطبيعي', 'מרכז נובה לפיזיותרפיה'), slug: 'demo', code: 'DEMO', timezone: 'Asia/Hebron',
    settings: { open: true, online_booking: true, window_days: 7, show_prices: true, currency: 'ILS', new_customers: true },
    services: svc.map(([id, name, duration, price]) => ({ id, name, duration, price })),
    specialists: [{ id: 'p1', name: T('Dr. Mia Haddad', 'د. ميا حداد', 'ד"ר מיה חדאד'), specialty: T('Physiotherapy', 'علاج طبيعي', 'פיזיותרפיה'), services: ['s1', 's2', 's4'], days: all },
      { id: 'p2', name: T('Omar Saleh', 'عمر صالح', 'עומר סאלח'), specialty: T('Sports massage', 'مساج رياضي', 'עיסוי ספורטאים'), services: ['s1', 's3'], days: all }],
    hours: { from: '09:00', to: '18:00' } };
}
export const tryPage = c => `<section class="book-shell" id="try-root"><p class="book-loading" role="status">${L(c, 'loading')}</p></section>`;
export function bindTry(c) {
  const root = document.getElementById('try-root'); if (!root) return;
  const which = location.pathname.replace(/\/$/, '');
  if (which === '/try/customer') {
    const other = `<a class="btn" href="/try/business" data-link>${L(c, 'tryOther')}</a>`;
    runBooking(c, root, demoBusiness(c), demoSource(demoBusiness(c)), { afterDemo: other, country: 'PS' });
    return;
  }
  if (which === '/try/business') return builder(c, root);
  root.innerHTML = `<div class="try"><header class="title-block"><p class="eyebrow">METON</p><h1>${L(c, 'tryTitle')}</h1><p class="lead">${L(c, 'tryLead')}</p></header>
    <div class="try-grid"><a class="try-card" href="/try/customer" data-link><span class="try-ico" aria-hidden="true">◷</span><h2>${L(c, 'tryA')}</h2><p>${L(c, 'tryABody')}</p><span class="btn primary">${L(c, 'tryStart')}</span></a>
    <a class="try-card" href="/try/business" data-link><span class="try-ico" aria-hidden="true">▦</span><h2>${L(c, 'tryB')}</h2><p>${L(c, 'tryBBody')}</p><span class="btn primary">${L(c, 'tryStart')}</span></a></div></div>`;
}

// The owner demo: a draft business page kept in this browser (localStorage), its private preview with test bookings,
// and a sample dashboard of those bookings. Saving to an account and going live are separate, explicit steps.
const DRAFT_KEY = 'meton_draft_v1';
const DAY_KEYS = ['0', '1', '2', '3', '4', '5', '6'];
function blankDraft(c) {
  const d = demoBusiness(c);
  return { name: '', kind: '', color: '#241D28', services: d.services.slice(0, 2).map((x, i) => ({ id: 'd' + (i + 1), name: x.name, duration: x.duration, price: x.price })),
    team: [{ id: 't1', name: '', role: '', services: ['d1', 'd2'] }], hours: { from: '09:00', to: '18:00', days: { 0: true, 1: true, 2: true, 3: true, 4: true, 5: false, 6: true } }, bookings: [] };
}
const BAD = /(https?:\/\/|www\.|\.(com|net|org|ru|xyz|top)\b|casino|viagra|crypto|bitcoin|loan|porn|sex|bet\b)/i;
export function draftFlags(d) { const f = []; for (const v of [d.name, d.kind, ...d.services.map(s => s.name), ...d.team.map(t => t.name + ' ' + t.role)]) if (BAD.test(v || '')) f.push(v); return f; }
function builder(c, root) {
  let d; try { d = JSON.parse(store(DRAFT_KEY) || 'null'); } catch { d = null; }
  const fresh = !d || !Array.isArray(d.services);
  if (fresh) d = blankDraft(c);
  const save = () => store(DRAFT_KEY, JSON.stringify(d));
  // Signed in with a draft saved on the account and nothing in this browser: continue from the saved one.
  if (fresh && c.state.user) c.api('/api/drafts').then(r => { if (r?.draft && Array.isArray(r.draft.services) && root.isConnected) { d = { ...blankDraft(c), ...r.draft, bookings: [] }; save(); paint(); } }).catch(() => {});
  const uidN = p => p + Math.random().toString(36).slice(2, 8);
  const preview = () => ({ name: d.name || L(c, 'bName'), slug: 'draft', code: 'DRAFT', timezone: 'Asia/Hebron',
    settings: { open: true, online_booking: true, window_days: 7, show_prices: true, currency: 'ILS', new_customers: true, primary_color: d.color },
    services: d.services.filter(s => s.name.trim()).map(s => ({ id: s.id, name: s.name, duration: Math.max(5, Number(s.duration) || 30), price: s.price === '' ? null : Number(s.price) })),
    specialists: d.team.filter(t => t.name.trim()).map(t => ({ id: t.id, name: t.name, specialty: t.role, services: t.services, days: d.hours.days })),
    hours: d.hours, booked: d.bookings.filter(b => b.status !== 'declined') });
  function paint() {
    const p = preview(), dayName = k => { try { return new Intl.DateTimeFormat(c.lang === 'he' ? 'he-IL' : c.lang === 'ar' ? 'ar' : 'en-GB', { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 10, 1 + Number(k)))); } catch { return k; } };
    const flagged = draftFlags(d).length > 0;
    root.innerHTML = `<div class="builder"><p class="book-demo-bar">${L(c, 'demoBar')}</p><header class="title-block"><h1>${L(c, 'bTitle')}</h1><p class="lead">${L(c, 'bLead')}</p></header>
    <div class="builder-grid"><form class="builder-form" id="bf" novalidate>
      <fieldset><legend>${L(c, 'bBusiness')}</legend><label class="book-field"><span>${L(c, 'bName')}</span><input name="name" maxlength="60" value="${c.esc(d.name)}"></label>
        <label class="book-field"><span>${L(c, 'bKind')}</span><input name="kind" maxlength="80" value="${c.esc(d.kind)}"></label>
        <label class="book-field book-color"><span>${L(c, 'bColor')}</span><input name="color" type="color" value="${c.esc(d.color)}"></label></fieldset>
      <fieldset><legend>${L(c, 'bServices')}</legend>${d.services.map(s => `<div class="builder-row" data-svc-row="${s.id}"><input aria-label="${L(c, 'bServiceName')}" placeholder="${L(c, 'bServiceName')}" data-f="name" maxlength="60" value="${c.esc(s.name)}"><input aria-label="${L(c, 'bDuration')}" type="number" min="5" max="480" step="5" data-f="duration" value="${c.esc(String(s.duration))}"><input aria-label="${L(c, 'bPrice')}" type="number" min="0" step="1" data-f="price" value="${c.esc(String(s.price ?? ''))}"><button type="button" class="btn small ghost" data-del-svc="${s.id}">${L(c, 'bRemove')}</button></div>`).join('')}
        <button type="button" class="btn small" id="add-svc">${L(c, 'bAddService')}</button></fieldset>
      <fieldset><legend>${L(c, 'bTeam')}</legend>${d.team.map(t => `<div class="builder-person" data-team-row="${t.id}"><div class="builder-row"><input aria-label="${L(c, 'bPerson')}" placeholder="${L(c, 'bPerson')}" data-f="name" maxlength="60" value="${c.esc(t.name)}"><input aria-label="${L(c, 'bRole')}" placeholder="${L(c, 'bRole')}" data-f="role" maxlength="60" value="${c.esc(t.role)}"><button type="button" class="btn small ghost" data-del-team="${t.id}">${L(c, 'bRemove')}</button></div>
          <div class="builder-offers"><span>${L(c, 'bOffers')}:</span>${d.services.filter(s => s.name.trim()).map(s => `<label><input type="checkbox" data-offer="${s.id}" ${t.services.includes(s.id) ? 'checked' : ''}> ${c.esc(s.name)}</label>`).join('')}</div></div>`).join('')}
        <button type="button" class="btn small" id="add-team">${L(c, 'bAddPerson')}</button></fieldset>
      <fieldset><legend>${L(c, 'bHours')}</legend><div class="builder-days">${DAY_KEYS.map(k => `<label><input type="checkbox" data-day-on="${k}" ${d.hours.days[k] ? 'checked' : ''}> ${c.esc(dayName(k))}</label>`).join('')}</div>
        <div class="builder-row"><label class="book-field"><span>${L(c, 'bFrom')}</span><input type="time" name="from" value="${c.esc(d.hours.from)}" dir="ltr"></label><label class="book-field"><span>${L(c, 'bTo')}</span><input type="time" name="to" value="${c.esc(d.hours.to)}" dir="ltr"></label></div></fieldset>
      <p class="book-muted">${L(c, 'bSaved')}</p>${flagged ? `<p class="book-hint">${L(c, 'bFlagged')}</p>` : ''}
      <section class="builder-live"><h2>${L(c, 'bSaveTitle')}</h2><p>${L(c, 'bSaveBody')}</p><div class="book-row"><button type="button" class="btn" id="b-save">${L(c, 'bSaveBtn')}</button><a class="btn primary" href="/plans?from=builder" data-link>${L(c, 'bGoLive')}</a><button type="button" class="btn ghost" id="b-reset">${L(c, 'bReset')}</button></div></section>
    </form>
    <div class="builder-side"><section class="builder-preview" style="--draft:${c.esc(d.color)}"><h2>${L(c, 'bPreview')}</h2><p class="book-muted">${L(c, 'bPreviewNote')}</p><div id="b-preview"></div></section>
      <section class="builder-admin"><h2>${L(c, 'bAdmin')}</h2>${d.bookings.length ? `<ul class="me-list">${d.bookings.slice().reverse().map(b => `<li class="me-row"><div><b><bdi>${c.esc(b.name)}</bdi></b><small>${c.esc(b.service)} · ${c.esc(b.specialist)}</small></div><div class="me-side"><span>${whenLabel(c, b.date, b.time)}</span><span class="book-status is-${b.status}">${L(c, 'st_' + (b.status === 'declined' ? 'cancelled' : b.status))}</span>${b.status === 'pending' ? `<span class="book-row"><button type="button" class="btn small" data-confirm="${b.id}">${L(c, 'bConfirm')}</button><button type="button" class="btn small ghost" data-decline="${b.id}">${L(c, 'bDecline')}</button></span>` : ''}</div></li>`).join('')}</ul>` : `<p class="book-muted">${L(c, 'bAdminEmpty')}</p>`}</section></div></div></div>`;
    const host = root.querySelector('#b-preview');
    if (!p.services.length || !p.specialists.length) host.innerHTML = `<p class="book-empty">${L(c, 'bNeedService')}</p>`;
    else runBooking(c, host, p, demoSource(p, (q, r) => { d.bookings.push({ id: uidN('b'), status: 'pending', name: q.name, date: q.date, time: q.time, sp: q.specialist, service: r.booking.service, specialist: r.booking.specialist }); save(); setTimeout(paint, 900); }), { country: 'PS' });
    wire();
  }
  function wire() {
    const f = root.querySelector('#bf');
    let t = 0; const later = () => { clearTimeout(t); t = setTimeout(() => { save(); paint(); }, 600); };
    f.elements.name.addEventListener('input', e => { d.name = e.target.value; save(); later(); });
    f.elements.kind.addEventListener('input', e => { d.kind = e.target.value; save(); later(); });
    f.elements.color.addEventListener('input', e => { d.color = e.target.value; save(); root.querySelector('.builder-preview')?.style.setProperty('--draft', d.color); });
    f.elements.from.addEventListener('change', e => { d.hours.from = e.target.value || '09:00'; save(); paint(); });
    f.elements.to.addEventListener('change', e => { d.hours.to = e.target.value || '18:00'; save(); paint(); });
    root.querySelectorAll('[data-svc-row]').forEach(row => row.querySelectorAll('[data-f]').forEach(inp => inp.addEventListener('input', () => { const s = d.services.find(x => x.id === row.dataset.svcRow); s[inp.dataset.f] = inp.value; save(); later(); })));
    root.querySelectorAll('[data-team-row]').forEach(row => {
      row.querySelectorAll('[data-f]').forEach(inp => inp.addEventListener('input', () => { const m = d.team.find(x => x.id === row.dataset.teamRow); m[inp.dataset.f] = inp.value; save(); later(); }));
      row.querySelectorAll('[data-offer]').forEach(cb => cb.addEventListener('change', () => { const m = d.team.find(x => x.id === row.dataset.teamRow); m.services = cb.checked ? [...new Set([...m.services, cb.dataset.offer])] : m.services.filter(x => x !== cb.dataset.offer); save(); paint(); }));
    });
    root.querySelectorAll('[data-day-on]').forEach(cb => cb.addEventListener('change', () => { d.hours.days[cb.dataset.dayOn] = cb.checked; save(); paint(); }));
    root.querySelector('#add-svc').addEventListener('click', () => { const id = uidN('d'); d.services.push({ id, name: '', duration: 30, price: '' }); save(); paint(); });
    root.querySelector('#add-team').addEventListener('click', () => { d.team.push({ id: uidN('t'), name: '', role: '', services: d.services.map(s => s.id) }); save(); paint(); });
    root.querySelectorAll('[data-del-svc]').forEach(b => b.addEventListener('click', () => { d.services = d.services.filter(s => s.id !== b.dataset.delSvc); d.team.forEach(m => m.services = m.services.filter(x => x !== b.dataset.delSvc)); save(); paint(); }));
    root.querySelectorAll('[data-del-team]').forEach(b => b.addEventListener('click', () => { d.team = d.team.filter(m => m.id !== b.dataset.delTeam); save(); paint(); }));
    root.querySelectorAll('[data-confirm]').forEach(b => b.addEventListener('click', () => { d.bookings.find(x => x.id === b.dataset.confirm).status = 'confirmed'; save(); paint(); }));
    root.querySelectorAll('[data-decline]').forEach(b => b.addEventListener('click', () => { d.bookings.find(x => x.id === b.dataset.decline).status = 'declined'; save(); paint(); }));
    root.querySelector('#b-reset').addEventListener('click', async () => { if (await c.confirmDialog({ title: L(c, 'bReset'), body: L(c, 'bReset') + '?', confirm: L(c, 'bReset'), cancel: L(c, 'back') })) { d = blankDraft(c); save(); paint(); } });
    root.querySelector('#b-save').addEventListener('click', async ev => {
      if (!c.state.user) { c.go('/register?next=' + encodeURIComponent('/try/business')); return; }
      ev.target.disabled = true;
      try { await c.api('/api/drafts', { method: 'POST', body: JSON.stringify({ draft: { ...d, bookings: [] } }) }); c.toast(L(c, 'bSavedAccount'), 'success'); }
      catch { c.toast(L(c, 'tryAgain'), 'error'); }
      ev.target.disabled = false;
    });
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
