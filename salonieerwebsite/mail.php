<?php
declare(strict_types=1);
// Email for plan applications, through the site's own cPanel mailbox: SMTP (implicit TLS, port 465) to send and
// IMAP (TLS, port 993) to read replies. Plain PHP streams, no extension or library needed.
//
// What is sent comes from the shared queue in Supabase (website_outbox), so a decision made in the Salonieer app's
// platform console emails the customer too. Replies to an application email carry its reference (SLN-…) in the
// subject and are attached to that application: from the applicant they become customer messages; from ADMIN_EMAIL
// they are forwarded to the customer as a message from Salonieer.
//
// Settings (.env in the private folder): MAIL_HOST, MAIL_USER, MAIL_PASSWORD, optional MAIL_SMTP_PORT (465),
// MAIL_IMAP_PORT (993), MAIL_FROM_NAME (Salonieer), ADMIN_EMAIL (salonieer1st@gmail.com),
// ADMIN_ALERT_EMAILS (hello@salonieer.com plus ADMIN_EMAIL), SITE_URL (https://salonieer.com).
if (!defined('SALONIEER')) { http_response_code(404); exit; }

function mailSetting(string $key, string $default=''): string { return paddleEnv($key) ?? $default; }
function mailReady(): bool { return mailSetting('MAIL_HOST')!=='' && mailSetting('MAIL_USER')!=='' && mailSetting('MAIL_PASSWORD')!==''; }
function adminEmail(): string { return strtolower(mailSetting('ADMIN_EMAIL','salonieer1st@gmail.com')); }
// Who receives admin alerts (new application, payment, customer reply): ADMIN_ALERT_EMAILS, comma separated.
function adminAlertEmails(): array {
    $list = array_map('trim', explode(',', strtolower(mailSetting('ADMIN_ALERT_EMAILS', 'hello@salonieer.com,'.adminEmail()))));
    return array_values(array_unique(array_filter($list, fn($a) => filter_var($a, FILTER_VALIDATE_EMAIL))));
}
function siteUrl(): string { return rtrim(mailSetting('SITE_URL','https://salonieer.com'),'/'); }
const APP_REF_PATTERN = '/SLN-[A-F0-9]{8}-[A-F0-9]{4}/';

// ---- Transport ----------------------------------------------------------------------------------------------------
final class MailConnection {
    /** @var resource */ private $s;
    public function __construct(string $host, int $port) {
        $ctx = stream_context_create(['ssl'=>['verify_peer'=>true,'verify_peer_name'=>true,'peer_name'=>$host,'SNI_enabled'=>true]]);
        $s = @stream_socket_client('ssl://'.$host.':'.$port, $errno, $error, 15, STREAM_CLIENT_CONNECT, $ctx);
        if (!$s) throw new RuntimeException("Mail server $host:$port unreachable: $error");
        stream_set_timeout($s, 20);
        $this->s = $s;
    }
    public function line(): string {
        $l = fgets($this->s, 65536);
        if ($l === false) throw new RuntimeException('Mail server closed the connection.');
        return $l;
    }
    public function read(int $n): string {
        $out = '';
        while (strlen($out) < $n) { $chunk = fread($this->s, $n - strlen($out)); if ($chunk === false || $chunk === '') throw new RuntimeException('Mail read failed.'); $out .= $chunk; }
        return $out;
    }
    public function write(string $data): void {
        for ($done = 0; $done < strlen($data); $done += $w) { $w = fwrite($this->s, substr($data, $done)); if (!$w) throw new RuntimeException('Mail write failed.'); }
    }
    public function close(): void { @fclose($this->s); }
}

function smtpExpect(MailConnection $c, array $codes): string {
    do { $l = $c->line(); } while (isset($l[3]) && $l[3] === '-');
    if (!in_array((int)substr($l, 0, 3), $codes, true)) throw new RuntimeException('SMTP: '.trim($l));
    return $l;
}
function encodeHeader(string $v): string { return preg_match('/[^\x20-\x7e]/', $v) ? '=?UTF-8?B?'.base64_encode($v).'?=' : $v; }
function cleanAddress(string $a): string {
    $a = trim($a);
    if (!filter_var($a, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n<>]/', $a)) throw new InvalidArgumentException('Invalid email address.');
    return $a;
}
function smtpSend(string|array $to, string $subject, string $html, string $text, string $replyTo = ''): void {
    $host = mailSetting('MAIL_HOST'); $user = cleanAddress(mailSetting('MAIL_USER'));
    $to = array_map('cleanAddress', (array)$to);
    $c = new MailConnection($host, (int)mailSetting('MAIL_SMTP_PORT','465'));
    try {
        smtpExpect($c, [220]);
        $c->write("EHLO ".(parse_url(siteUrl(), PHP_URL_HOST) ?: 'localhost')."\r\n"); smtpExpect($c, [250]);
        $c->write("AUTH LOGIN\r\n"); smtpExpect($c, [334]);
        $c->write(base64_encode($user)."\r\n"); smtpExpect($c, [334]);
        $c->write(base64_encode(mailSetting('MAIL_PASSWORD'))."\r\n"); smtpExpect($c, [235]);
        $c->write("MAIL FROM:<$user>\r\n"); smtpExpect($c, [250]);
        foreach ($to as $rcpt) { $c->write("RCPT TO:<$rcpt>\r\n"); smtpExpect($c, [250, 251]); }
        $c->write("DATA\r\n"); smtpExpect($c, [354]);
        $b = 'b'.bin2hex(random_bytes(12));
        $domain = substr(strrchr($user, '@'), 1);
        $headers = ['Date: '.date(DATE_RFC2822), 'From: '.encodeHeader(mailSetting('MAIL_FROM_NAME','Salonieer'))." <$user>", 'To: '.implode(', ', array_map(fn($a) => "<$a>", $to)),
            'Reply-To: <'.($replyTo !== '' ? cleanAddress($replyTo) : $user).'>', 'Subject: '.encodeHeader($subject),
            'Message-ID: <'.bin2hex(random_bytes(16))."@$domain>", 'MIME-Version: 1.0', "Content-Type: multipart/alternative; boundary=\"$b\"", 'Auto-Submitted: auto-generated'];
        $body = implode("\r\n", $headers)."\r\n\r\n"
            ."--$b\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n".chunk_split(base64_encode($text))
            ."--$b\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n".chunk_split(base64_encode($html))
            ."--$b--\r\n";
        $c->write($body.".\r\n"); smtpExpect($c, [250]);
        $c->write("QUIT\r\n");
    } finally { $c->close(); }
}

// ---- IMAP: new replies ----------------------------------------------------------------------------------------------
final class Imap {
    private MailConnection $c; private int $tag = 0;
    public function __construct() {
        $this->c = new MailConnection(mailSetting('MAIL_HOST'), (int)mailSetting('MAIL_IMAP_PORT','993'));
        $this->c->line();
        $this->cmd('LOGIN '.$this->quote(mailSetting('MAIL_USER')).' '.$this->quote(mailSetting('MAIL_PASSWORD')));
    }
    private function quote(string $v): string { return '"'.addcslashes($v, "\"\\").'"'; }
    // Runs a command; returns untagged lines with any {n} literals inlined after their line.
    public function cmd(string $command): array {
        $tag = 'A'.(++$this->tag);
        $this->c->write("$tag $command\r\n");
        $out = [];
        while (true) {
            $l = $this->c->line();
            if (str_starts_with($l, "$tag ")) {
                if (!preg_match('/^\S+ OK/', $l)) throw new RuntimeException('IMAP: '.trim(preg_replace('/LOGIN .*/', 'LOGIN …', $l)));
                return $out;
            }
            if (preg_match('/\{(\d+)\}\r\n$/', $l, $m)) { $out[] = ['line'=>$l, 'literal'=>$this->c->read((int)$m[1])]; continue; }
            $out[] = ['line'=>$l, 'literal'=>null];
        }
    }
    public function unseen(): array {
        $this->cmd('SELECT INBOX');
        foreach ($this->cmd('UID SEARCH UNSEEN') as $r) if (preg_match('/^\* SEARCH ?(.*)$/', trim($r['line']), $m)) return array_map('intval', array_filter(explode(' ', $m[1])));
        return [];
    }
    public function fetch(int $uid): ?string {
        foreach ($this->cmd("UID FETCH $uid (BODY.PEEK[])") as $r) if ($r['literal'] !== null) return $r['literal'];
        return null;
    }
    public function seen(int $uid): void { $this->cmd("UID STORE $uid +FLAGS (\\Seen)"); }
    public function close(): void { try { $this->cmd('LOGOUT'); } catch (Throwable) {} $this->c->close(); }
}

// Minimal MIME: headers, and the first text/plain part (or text/html stripped), decoded to UTF-8.
function mimeSplit(string $raw): array {
    $raw = str_replace("\r\n", "\n", $raw);
    [$head, $body] = array_pad(explode("\n\n", $raw, 2), 2, '');
    $headers = [];
    foreach (explode("\n", preg_replace("/\n[ \t]+/", ' ', $head)) as $line)
        if (preg_match('/^([A-Za-z0-9-]+):\s*(.*)$/', $line, $m)) $headers[strtolower($m[1])] ??= $m[2];
    return [$headers, $body];
}
function mimeText(array $headers, string $body, int $depth = 0): ?string {
    $type = strtolower($headers['content-type'] ?? 'text/plain');
    if ($depth < 5 && str_starts_with($type, 'multipart/') && preg_match('/boundary="?([^";]+)"?/i', $headers['content-type'], $m)) {
        $html = null;
        foreach (array_slice(explode('--'.$m[1], $body), 1) as $part) {
            if (str_starts_with($part, '--')) break;
            [$h, $b] = mimeSplit(ltrim($part, "\n"));
            $t = strtolower($h['content-type'] ?? 'text/plain');
            if (str_starts_with($t, 'text/plain') || str_starts_with($t, 'multipart/')) { $text = mimeText($h, $b, $depth + 1); if ($text !== null && trim($text) !== '') return $text; }
            elseif (str_starts_with($t, 'text/html')) $html ??= mimeText($h, $b, $depth + 1);
        }
        return $html;
    }
    if (!str_starts_with($type, 'text/')) return null;
    $enc = strtolower(trim($headers['content-transfer-encoding'] ?? ''));
    $text = $enc === 'base64' ? (string)base64_decode(preg_replace('/\s+/', '', $body)) : ($enc === 'quoted-printable' ? quoted_printable_decode($body) : $body);
    if (preg_match('/charset="?([A-Za-z0-9_.-]+)"?/i', $type, $cm) && strtolower($cm[1]) !== 'utf-8') $text = toUtf8($text, $cm[1]);
    if (str_starts_with($type, 'text/html')) $text = html_entity_decode(strip_tags(preg_replace('~<(br|/p|/div)[^>]*>~i', "\n", $text)), ENT_QUOTES|ENT_HTML5, 'UTF-8');
    return $text;
}
// mbstring rejects some legacy charsets (e.g. Windows-1256, common for Arabic mail) with an exception; iconv knows them.
function toUtf8(string $text, string $charset): string {
    try { $out = mb_convert_encoding($text, 'UTF-8', $charset); if (is_string($out)) return $out; } catch (ValueError) {}
    $out = function_exists('iconv') ? @iconv($charset, 'UTF-8//IGNORE', $text) : false;
    return is_string($out) ? $out : $text;
}
// The new text of a reply: everything above the quoted original.
function replyText(string $text): string {
    $lines = preg_split('/\r?\n/', str_replace("\r\n", "\n", $text));
    $out = [];
    foreach ($lines as $i => $l) {
        if (preg_match('/^\s*>/', $l) || preg_match('/^-{2,}\s*Original Message|^_{5,}$/i', $l)) break;
        // "On …, <x> wrote:" (Gmail, Apple Mail, Outlook web), possibly wrapped onto two lines; Arabic/Hebrew too.
        if (preg_match('/(wrote|كتب|כתב|écrit|schrieb):\s*$/u', $l) || (isset($lines[$i+1]) && preg_match('/^(On|في|ב-?) .*/u', $l) && preg_match('/(wrote|كتب|כתב):\s*$/u', $lines[$i+1]))) break;
        if (preg_match('/^From:\s.*@/i', $l)) break;
        $out[] = $l;
    }
    return trim(implode("\n", $out));
}
function headerAddress(string $v): string { return preg_match('/<([^>]+)>/', $v, $m) ? strtolower(trim($m[1])) : strtolower(trim($v)); }

function pollReplies(): int {
    $imap = new Imap(); $stored = 0;
    try {
        foreach (array_slice($imap->unseen(), 0, 25) as $uid) {
            $raw = $imap->fetch($uid);
            if ($raw === null || strlen($raw) > 5000000) { $imap->seen($uid); continue; }
            [$h, $body] = mimeSplit($raw);
            $subject = (string)(@mb_decode_mimeheader($h['subject'] ?? '') ?: ($h['subject'] ?? ''));
            $from = headerAddress((string)(@mb_decode_mimeheader($h['from'] ?? '') ?: ($h['from'] ?? '')));
            $messageId = substr(trim($h['message-id'] ?? ('uid-'.$uid.'-'.md5($raw))), 0, 300);
            $auto = preg_match('/auto-replied|auto-generated/i', $h['auto-submitted'] ?? '') || preg_match('/mailer-daemon|postmaster/i', $from);
            if (!$auto && preg_match(APP_REF_PATTERN, $subject, $m)) {
                $text = replyText((string)mimeText($h, $body));
                $app = sbRpc('website_application', ['p_id'=>$m[0], 'p_user'=>null]);
                if ($text !== '' && is_array($app)) {
                    $direction = $from === adminEmail() ? 'out' : ($from === strtolower((string)$app['email']) ? 'in' : null);
                    if ($direction) { sbRpc('website_add_message', ['p_id'=>$m[0], 'p_direction'=>$direction, 'p_author'=>$from, 'p_body'=>mb_substr($text, 0, 5000), 'p_email_id'=>$messageId, 'p_user'=>null]); $stored++; }
                }
            }
            $imap->seen($uid);
        }
    } finally { $imap->close(); }
    return $stored;
}

// ---- Templates ------------------------------------------------------------------------------------------------------
function mailCopy(string $template, string $lang): array {
    $c = [
        'received' => [
            'en' => ['We received your application', "Thank you! We received your application for {salon} ({plan} plan). Reference: {ref}.\n\n{payline}\n\nApproval usually takes up to one day once payment is confirmed. You can follow it any time on your Applications page."],
            'ar' => ['استلمنا طلبك', "شكراً لك! استلمنا طلبك لصالون {salon} (باقة {plan}). رقم المرجع: {ref}.\n\n{payline}\n\nتتم الموافقة عادةً خلال يوم واحد كحد أقصى بعد تأكيد الدفع. يمكنك متابعة الطلب في أي وقت من صفحة طلباتي."],
            'he' => ['קיבלנו את הבקשה שלך', "תודה! קיבלנו את הבקשה עבור {salon} (חבילת {plan}). אסמכתא: {ref}.\n\n{payline}\n\nהאישור לוקח בדרך כלל עד יום אחד לאחר אישור התשלום. אפשר לעקוב בדף הבקשות."]],
        'payment_received' => [
            'en' => ['Payment received — awaiting approval', "We received the payment for {salon} ({ref}). Your application is now awaiting approval, which usually takes up to one day. We'll email you as soon as your salon is ready."],
            'ar' => ['تم استلام الدفع — بانتظار الموافقة', "استلمنا الدفع لصالون {salon} ({ref}). طلبك الآن بانتظار الموافقة، وتستغرق عادةً يوماً واحداً كحد أقصى. سنراسلك فور تجهيز صالونك."],
            'he' => ['התשלום התקבל — ממתין לאישור', "קיבלנו את התשלום עבור {salon} ({ref}). הבקשה ממתינה כעת לאישור, שלוקח בדרך כלל עד יום אחד. נשלח לך דוא״ל ברגע שהסלון יהיה מוכן."]],
        'needs_info' => [
            'en' => ['We need a little more information', "To continue with your application for {salon} ({ref}), we need the following:\n\n{body}\n\nJust reply to this email, or answer on your Applications page."],
            'ar' => ['نحتاج بعض المعلومات الإضافية', "لمتابعة طلبك لصالون {salon} ({ref}) نحتاج ما يلي:\n\n{body}\n\nيمكنك الرد على هذا البريد مباشرة، أو الإجابة من صفحة طلباتي."],
            'he' => ['נדרש מעט מידע נוסף', "כדי להמשיך בבקשה עבור {salon} ({ref}) נצטרך את הפרטים הבאים:\n\n{body}\n\nאפשר להשיב לדוא״ל הזה או לענות בדף הבקשות."]],
        'message' => [
            'en' => ['A message about your application', "{body}\n\n— Salonieer ({ref})\nYou can reply to this email."],
            'ar' => ['رسالة بخصوص طلبك', "{body}\n\n— Salonieer ({ref})\nيمكنك الرد على هذا البريد."],
            'he' => ['הודעה בנוגע לבקשה שלך', "{body}\n\n— Salonieer ({ref})\nאפשר להשיב לדוא״ל הזה."]],
        'approved' => [
            'en' => ['Your salon is ready', "Great news — {salon} is approved and ready in the Salonieer app.\n\nSalon code: {code}\nPlan: {plan}\n\nTo manage your salon:\n1. Install Salonieer (App Store / Google Play) and add your salon with the code {code} or the QR code on your account page.\n2. Sign in with phone {phone} and the temporary password {password}\n3. Change the password from My Account after signing in.\n\nYour account page shows all your salon details and its QR code: {site}/account"],
            'ar' => ['صالونك جاهز', "خبر سعيد — تمت الموافقة على {salon} وأصبح جاهزاً في تطبيق Salonieer.\n\nرمز الصالون: {code}\nالباقة: {plan}\n\nلإدارة صالونك:\n1. ثبّت تطبيق Salonieer وأضف صالونك بالرمز {code} أو برمز QR الموجود في صفحة حسابك.\n2. سجّل الدخول برقم الهاتف {phone} وكلمة المرور المؤقتة {password}\n3. غيّر كلمة المرور من «حسابي» بعد الدخول.\n\nتجد كل تفاصيل صالونك ورمز QR في صفحة حسابك: {site}/account"],
            'he' => ['הסלון שלך מוכן', "חדשות טובות — {salon} אושר ומוכן ביישום Salonieer.\n\nקוד הסלון: {code}\nחבילה: {plan}\n\nכדי לנהל את הסלון:\n1. התקינו את Salonieer והוסיפו את הסלון עם הקוד {code} או קוד ה־QR בדף החשבון.\n2. התחברו עם הטלפון {phone} והסיסמה הזמנית {password}\n3. שנו את הסיסמה מ״החשבון שלי״ לאחר הכניסה.\n\nכל פרטי הסלון וקוד ה־QR בדף החשבון: {site}/account"]],
        'declined' => [
            'en' => ['About your application', "We're sorry — we can't approve the application for {salon} ({ref}) at this time.\n\n{body}\n\nIf you have questions, just reply to this email."],
            'ar' => ['بخصوص طلبك', "نأسف — لا يمكننا الموافقة على طلب صالون {salon} ({ref}) حالياً.\n\n{body}\n\nإذا كان لديك أي سؤال، رد على هذا البريد."],
            'he' => ['בנוגע לבקשה שלך', "מצטערים — לא נוכל לאשר כרגע את הבקשה עבור {salon} ({ref}).\n\n{body}\n\nלשאלות, פשוט השיבו לדוא״ל הזה."]],
        // ---- Billing (website_billing.sql / billing.php) ----
        'payment_failed' => [
            'en' => ['Payment failed — {days} days left for {salon}', "We couldn't charge your card for the {salon} subscription.\n\nPlease pay within {days} days (by {date}) or {salon} will be paused: customers won't be able to book and your team won't be able to sign in. Nothing is deleted, and paying reopens it right away.\n\nUpdate your card and pay: {site}/account"],
            'ar' => ['فشل الدفع — متبقٍ {days} أيام لصالون {salon}', "لم نتمكن من خصم اشتراك صالون {salon} من بطاقتك.\n\nيرجى الدفع خلال {days} أيام (قبل {date}) وإلا سيتم إيقاف {salon} مؤقتاً: لن يتمكن الزبائن من الحجز ولن يتمكن فريقك من الدخول. لن يُحذف أي شيء، والدفع يعيد تشغيله فوراً.\n\nحدّث بطاقتك وادفع من هنا: {site}/account"],
            'he' => ['התשלום נכשל — נותרו {days} ימים עבור {salon}', "לא הצלחנו לחייב את הכרטיס עבור המנוי של {salon}.\n\nנא לשלם בתוך {days} ימים (עד {date}), אחרת {salon} יושהה: לקוחות לא יוכלו לקבוע תורים והצוות לא יוכל להתחבר. דבר לא נמחק, ותשלום מחזיר אותו מיד.\n\nעדכון כרטיס ותשלום: {site}/account"]],
        'salon_paused' => [
            'en' => ['{salon} is paused', "{salon} has been paused because {reasontext}.\n\nCustomers can't book and your team can't sign in until the subscription is paid. All your data is kept safe — paying reopens the salon immediately.\n\nPay or re-subscribe: {site}/account"],
            'ar' => ['تم إيقاف {salon} مؤقتاً', "تم إيقاف {salon} مؤقتاً لأن {reasontext}.\n\nلن يتمكن الزبائن من الحجز ولا فريقك من الدخول حتى يتم دفع الاشتراك. جميع بياناتك محفوظة — الدفع يعيد فتح الصالون فوراً.\n\nادفع أو جدّد الاشتراك: {site}/account"],
            'he' => ['{salon} הושהה', "{salon} הושהה כי {reasontext}.\n\nלקוחות לא יכולים לקבוע תורים והצוות לא יכול להתחבר עד שהמנוי ישולם. כל הנתונים שמורים — תשלום פותח את הסלון מיד.\n\nתשלום או חידוש מנוי: {site}/account"]],
        'salon_reactivated' => [
            'en' => ['{salon} is open again', "Thank you — your payment went through and {salon} is open again. Customers can book and your team can sign in as usual."],
            'ar' => ['عاد {salon} للعمل', "شكراً لك — تم الدفع بنجاح وعاد {salon} للعمل. يمكن للزبائن الحجز ولفريقك الدخول كالمعتاد."],
            'he' => ['{salon} פתוח שוב', "תודה — התשלום עבר ו־{salon} פתוח שוב. לקוחות יכולים לקבוע תורים והצוות יכול להתחבר כרגיל."]],
        'cancel_scheduled' => [
            'en' => ['Your subscription will end on {date}', "Auto-renewal for {salon} is cancelled. You've already paid until {date}, so everything keeps working until then; after that the salon will be paused (nothing is deleted).\n\nChanged your mind? Resume any time before {date}: {site}/account"],
            'ar' => ['سينتهي اشتراكك في {date}', "تم إلغاء التجديد التلقائي لصالون {salon}. لقد دفعت حتى {date}، لذا يبقى كل شيء يعمل حتى ذلك التاريخ؛ بعده سيتم إيقاف الصالون مؤقتاً (دون حذف أي شيء).\n\nغيّرت رأيك؟ يمكنك الاستئناف في أي وقت قبل {date}: {site}/account"],
            'he' => ['המנוי שלך יסתיים ב־{date}', "החידוש האוטומטי עבור {salon} בוטל. שילמת עד {date}, ולכן הכול ממשיך לעבוד עד אז; לאחר מכן הסלון יושהה (דבר לא נמחק).\n\nהתחרטתם? אפשר לחדש בכל עת לפני {date}: {site}/account"]],
        'cancel_resumed' => [
            'en' => ['Your subscription continues', "Good to have you — the subscription for {salon} will renew as usual on {date}."],
            'ar' => ['اشتراكك مستمر', "يسعدنا بقاؤك — سيتجدد اشتراك {salon} كالمعتاد في {date}."],
            'he' => ['המנוי שלך ממשיך', "שמחים שנשארתם — המנוי של {salon} יתחדש כרגיל ב־{date}."]],
        'pay_link' => [
            'en' => ['Payment link for {salon}', "Please complete the payment for {salon} here: {link}\n\nAfter paying, everything updates automatically."],
            'ar' => ['رابط الدفع لصالون {salon}', "يرجى إكمال الدفع لصالون {salon} من هنا: {link}\n\nبعد الدفع يتم تحديث كل شيء تلقائياً."],
            'he' => ['קישור לתשלום עבור {salon}', "נא להשלים את התשלום עבור {salon} כאן: {link}\n\nלאחר התשלום הכול מתעדכן אוטומטית."]],
        'trial_ending' => [
            'en' => ['Your free trial ends on {date}', "Your 14-day free trial of {salon} ends on {date}. Your subscription then starts automatically with the card you added — nothing to do.\n\nTo stop before you're charged, cancel from your account page: {site}/account"],
            'ar' => ['تنتهي تجربتك المجانية في {date}', "تنتهي تجربتك المجانية لمدة 14 يوماً لصالون {salon} في {date}. بعدها يبدأ اشتراكك تلقائياً بالبطاقة التي أضفتها — لا حاجة لأي إجراء.\n\nلإيقافه قبل الخصم، ألغِ من صفحة حسابك: {site}/account"],
            'he' => ['תקופת הניסיון שלך מסתיימת ב־{date}', "תקופת הניסיון של 14 יום עבור {salon} מסתיימת ב־{date}. אחר כך המנוי מתחיל אוטומטית עם הכרטיס שהוספת — אין צורך לעשות דבר.\n\nכדי לעצור לפני החיוב, בטלו מדף החשבון: {site}/account"]],
        'change_approved' => [
            'en' => ['Your plan change is active', "Your change for {salon} is done: {change}.\n\n{amountline}\n\n{note}"],
            'ar' => ['تم تفعيل تغيير باقتك', "تم تنفيذ التغيير لصالون {salon}: {change}.\n\n{amountline}\n\n{note}"],
            'he' => ['שינוי החבילה פעיל', "השינוי עבור {salon} בוצע: {change}.\n\n{amountline}\n\n{note}"]],
        'change_rejected' => [
            'en' => ['About your plan change request', "We couldn't make the requested change for {salon} ({change}).\n\n{note}\n\nReply to this email if you have questions."],
            'ar' => ['بخصوص طلب تغيير الباقة', "لم نتمكن من تنفيذ التغيير المطلوب لصالون {salon} ({change}).\n\n{note}\n\nرد على هذا البريد إذا كان لديك سؤال."],
            'he' => ['בנוגע לבקשת שינוי החבילה', "לא הצלחנו לבצע את השינוי שביקשתם עבור {salon} ({change}).\n\n{note}\n\nאפשר להשיב לדוא״ל הזה בכל שאלה."]],
        'change_payment_failed' => [
            'en' => ['Payment needed for your plan change', "We tried to charge the difference for your change to {salon} ({change}), but the payment didn't go through, so nothing changed yet.\n\nPlease update your card on your account page, then tell us and we'll apply it: {site}/account"],
            'ar' => ['مطلوب دفع لتغيير باقتك', "حاولنا خصم الفرق للتغيير على {salon} ({change}) لكن الدفع لم يتم، لذا لم يتغير شيء بعد.\n\nيرجى تحديث بطاقتك من صفحة حسابك ثم إبلاغنا لننفذ التغيير: {site}/account"],
            'he' => ['נדרש תשלום לשינוי החבילה', "ניסינו לחייב את ההפרש עבור השינוי ב־{salon} ({change}), אך התשלום לא עבר ולכן עדיין לא השתנה דבר.\n\nנא לעדכן את הכרטיס בדף החשבון ולעדכן אותנו כדי שנבצע את השינוי: {site}/account"]],
        // ---- Cash billing and card links (2.26) ----
        'card_link' => [
            'en' => ['Set up card payments for {salon}', "From now on {salon} can be paid by card, automatically each period. Please complete the first payment here:\n\n{link}\n\nAfter paying, renewals are charged to your card and everything updates by itself. Questions? Just reply to this email."],
            'ar' => ['تفعيل الدفع بالبطاقة لصالون {salon}', "من الآن يمكن دفع اشتراك {salon} بالبطاقة تلقائياً في كل فترة. يرجى إكمال الدفعة الأولى من هنا:\n\n{link}\n\nبعد الدفع يتم تجديد الاشتراك على بطاقتك ويتحدث كل شيء تلقائياً. لأي سؤال، رد على هذا البريد."],
            'he' => ['הפעלת תשלום בכרטיס עבור {salon}', "מעכשיו אפשר לשלם על {salon} בכרטיס, אוטומטית בכל תקופה. נא להשלים את התשלום הראשון כאן:\n\n{link}\n\nלאחר התשלום החידושים יחויבו בכרטיס והכול יתעדכן מעצמו. לשאלות, השיבו לדוא״ל הזה."]],
        'cash_payment_received' => [
            'en' => ['Payment received for {salon}', "Thank you — we received {amount} for {salon}. Your subscription is paid until {date}."],
            'ar' => ['تم استلام الدفعة لصالون {salon}', "شكراً لك — استلمنا {amount} لصالون {salon}. اشتراكك مدفوع حتى {date}."],
            'he' => ['התשלום עבור {salon} התקבל', "תודה — קיבלנו {amount} עבור {salon}. המנוי שלך משולם עד {date}."]],
        'cash_renewal_soon' => [
            'en' => ['{salon}: your paid period ends on {date}', "Your Salonieer subscription for {salon} is paid until {date}. To keep everything running, please arrange the next payment with us before then.\n\nReply to this email if you have any questions."],
            'ar' => ['{salon}: تنتهي فترتك المدفوعة في {date}', "اشتراك Salonieer لصالون {salon} مدفوع حتى {date}. ليستمر كل شيء بالعمل، يرجى ترتيب الدفعة التالية معنا قبل هذا التاريخ.\n\nرد على هذا البريد إذا كان لديك أي سؤال."],
            'he' => ['{salon}: התקופה ששולמה מסתיימת ב־{date}', "המנוי של Salonieer עבור {salon} משולם עד {date}. כדי שהכול ימשיך לעבוד, נא לתאם איתנו את התשלום הבא לפני כן.\n\nלשאלות, השיבו לדוא״ל הזה."]],
        'cash_due' => [
            'en' => ['Payment due — {days} days left for {salon}', "The paid period of {salon} has ended.\n\nPlease make the payment within {days} days (by {date}) or {salon} will be paused: customers won't be able to book and your team won't be able to sign in. Nothing is deleted, and the payment reopens it right away.\n\nReply to this email to arrange the payment."],
            'ar' => ['مطلوب الدفع — متبقٍ {days} أيام لصالون {salon}', "انتهت الفترة المدفوعة لصالون {salon}.\n\nيرجى الدفع خلال {days} أيام (قبل {date}) وإلا سيتم إيقاف {salon} مؤقتاً: لن يتمكن الزبائن من الحجز ولن يتمكن فريقك من الدخول. لن يُحذف أي شيء، والدفع يعيد تشغيله فوراً.\n\nرد على هذا البريد لترتيب الدفع."],
            'he' => ['נדרש תשלום — נותרו {days} ימים עבור {salon}', "התקופה ששולמה עבור {salon} הסתיימה.\n\nנא לשלם בתוך {days} ימים (עד {date}), אחרת {salon} יושהה: לקוחות לא יוכלו לקבוע תורים והצוות לא יוכל להתחבר. דבר לא נמחק, והתשלום מחזיר אותו מיד.\n\nהשיבו לדוא״ל הזה כדי לתאם את התשלום."]],
        'billing_to_cash' => [
            'en' => ['Your billing for {salon} changed', "From now on {salon} is billed directly by Salonieer (cash or bank transfer) instead of your card. Your card will not be charged again.\n\nThe current period is paid until {date}. We'll contact you about the next payment before then."],
            'ar' => ['تغيّرت طريقة الدفع لصالون {salon}', "من الآن تتم محاسبة {salon} مباشرة من Salonieer (نقداً أو بتحويل بنكي) بدلاً من بطاقتك. لن يتم الخصم من بطاقتك مرة أخرى.\n\nالفترة الحالية مدفوعة حتى {date}. سنتواصل معك بخصوص الدفعة التالية قبل هذا التاريخ."],
            'he' => ['אופן החיוב עבור {salon} השתנה', "מעכשיו {salon} מחויב ישירות על ידי Salonieer (מזומן או העברה בנקאית) במקום בכרטיס שלך. הכרטיס לא יחויב שוב.\n\nהתקופה הנוכחית משולמת עד {date}. ניצור איתך קשר לגבי התשלום הבא לפני כן."]],
        'admin_cash_due' => ['en' => ['Cash payment due: {salon}', "{salon} ({ref}) is billed in cash and its paid period has ended. The owner has until {date} before the salon pauses automatically; reminders go out every 2 days.\n\nOwner: {name} <{email}>\n\nRecord the payment: {site}/admin/billing"]],
        'admin_past_due' => ['en' => ['Payment failed: {salon}', "The renewal payment for {salon} ({ref}) failed. The owner has 7 days (until {date}) before the salon pauses automatically; reminders go out every 2 days.\n\nOwner: {name} <{email}>\n\nFinance: {site}/admin/finance"]],
        'admin_paused' => ['en' => ['Salon paused: {salon}', "{salon} ({ref}) was paused automatically because {reasontext}.\nIt reopens by itself when the subscription is paid.\n\nOwner: {name} <{email}>\n\nFinance: {site}/admin/finance"]],
        'admin_change_request' => ['en' => ['Plan change request: {salon}', "{name} <{email}> asked to change {salon} ({ref}) to: {change}.\n\nNote: {note}\n\nReview, preview the charge and approve: {site}/admin/requests"]],
        'admin_new_application' => ['en' => ['New application: {salon}', "A new application was submitted.

Reference: {ref}
Submitted: {created}

Applicant
Name: {name}
Email: {email}
Phone: {phone}
Country: {country}
Language: {lang}
ID number (last 4): {idlast4}

Salon
Name: {salon}
Type: {category}
Time zone: {timezone}
Logo: {logo}

Plan and payment
Plan: {plan}
Loyalty add-on: {loyalty}
Extra specialists: {extra}
Monthly total: {total}
Payment method: {method}
Payment status: {payment}

Review: {site}/admin/applications/{ref}"]],
        'admin_payment' => ['en' => ['Paid — awaiting approval: {salon}', "{ref} ({salon}, {plan}) is {payment} and waiting for your approval.\nApproval promised within a day.\n\nReview: {site}/admin"]],
        'admin_problem_report' => ['en' => ['Problem report: {v:salon}', "A salon owner reported a problem ({v:category}, from the {v:source}).

Salon: {v:salon} ({v:slug})
From: {v:reporter} <{v:contact}>

{v:body}

All reports: {site}/admin/reports"]],
        'admin_salon_deleted' => ['en' => ['Salon deleted after suspension: {v:salon}', "{v:salon} ({v:slug}) was deleted automatically: it had been suspended since {v:since} ({v:months} months or more).

Cleanup settings: {site}/admin/cleanup"]],
        'admin_reply' => ['en' => ['Reply from {name}: {salon}', "{name} <{email}> answered on {ref}:\n\n{body}\n\nReply to this email to answer the customer, or open {site}/admin"]],
    ];
    $set = $c[$template] ?? null;
    if (!$set) throw new RuntimeException('Unknown mail template '.$template);
    return $set[$lang] ?? $set['en'];
}
function renderMail(array $item): array {
    $a = $item['application'] ?? [];
    $admin = $item['recipient'] === 'admin';
    $lang = $admin ? 'en' : (in_array($a['lang'] ?? '', ['en','ar','he'], true) ? $a['lang'] : 'en');
    [$subject, $body] = mailCopy($item['template'], $lang);
    $q = $a['quote'] ?? [];
    $paid = in_array($a['paymentStatus'] ?? '', ['paid','test_paid'], true);
    $paylines = ['en'=>[$paid?'Payment is confirmed.':(($a['paymentMethod'] ?? '')==='card'?'Complete the card payment on your Applications page to start the review.':'We will contact you with the bank transfer details.')],
        'ar'=>[$paid?'تم تأكيد الدفع.':(($a['paymentMethod'] ?? '')==='card'?'أكمل الدفع بالبطاقة من صفحة طلباتي لبدء المراجعة.':'سنتواصل معك بتفاصيل التحويل البنكي.')],
        'he'=>[$paid?'התשלום אושר.':(($a['paymentMethod'] ?? '')==='card'?'השלימו את התשלום בכרטיס בדף הבקשות כדי להתחיל בבדיקה.':'ניצור קשר עם פרטי ההעברה הבנקאית.')]];
    $vars = ['{ref}'=>$a['id'] ?? '', '{salon}'=>$a['salonName'] ?? '', '{plan}'=>ucfirst((string)($a['plan'] ?? '')), '{name}'=>$a['fullName'] ?? '',
        '{email}'=>$a['email'] ?? '', '{phone}'=>($item['template']==='approved' ? ($a['ownerPhone'] ?? '') : ($a['phone'] ?? '')),
        '{method}'=>($a['paymentMethod'] ?? '')==='card'?'card':'bank transfer', '{payment}'=>str_replace('_',' ',(string)($a['paymentStatus'] ?? '')).(!empty($item['vars']['test'])?' (TEST, no charge)':''),
        '{total}'=>isset($q['total']) && $q['total']!==null ? $q['total'].' '.($q['currency'] ?? '') : 'by agreement', '{payline}'=>$paylines[$lang][0],
        '{code}'=>$a['salon']['accessCode'] ?? '',
        '{created}'=>isset($a['createdAt']) ? gmdate('Y-m-d H:i', strtotime((string)$a['createdAt'])).' UTC' : '', '{country}'=>$a['country'] ?? '', '{lang}'=>strtoupper((string)($a['lang'] ?? '')),
        '{idlast4}'=>$a['idLast4'] ?? '', '{category}'=>ucfirst((string)($a['salonCategory'] ?? '')), '{timezone}'=>$a['timezone'] ?? '', '{logo}'=>$a['logoUrl'] ?? '',
        '{loyalty}'=>!empty($q['loyalty']) ? 'yes' : (in_array($a['plan'] ?? '', ['business','enterprise'], true) ? 'included' : 'no'), '{extra}'=>(string)(int)($q['extraSpecialists'] ?? 0), '{password}'=>(string)($item['vars']['password'] ?? ''), '{body}'=>(string)($item['vars']['body'] ?? ''), '{site}'=>siteUrl()];
    $vars += billingMailVars($item, $lang);
    // {v:name} = a value queued with the email itself (problem reports, cleanup notices).
    foreach (($item['vars'] ?? []) as $k => $v) if (is_string($k) && is_scalar($v)) $vars['{v:'.$k.'}'] = (string)$v;
    $subject = strtr($subject, $vars).' · '.($a['id'] ?? 'Salonieer');
    $text = strtr($body, $vars);
    $dir = $lang === 'en' ? 'ltr' : 'rtl';
    $safe = nl2br(htmlspecialchars($text, ENT_QUOTES|ENT_HTML5, 'UTF-8'));
    $safe = preg_replace('~(https://[^\s<]+)~', '<a href="$1">$1</a>', $safe);
    $html = '<!doctype html><html lang="'.$lang.'" dir="'.$dir.'"><body style="margin:0;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;color:#1d1d1b">'
        .'<div style="max-width:560px;margin:0 auto;padding:28px 18px"><div style="background:#fff;border-radius:16px;padding:28px;line-height:1.7;font-size:15px;text-align:'.($dir==='rtl'?'right':'left').'">'
        .'<div style="font-weight:700;letter-spacing:.08em;color:#1a88a4;margin-bottom:14px">SALONIEER</div>'.$safe.'</div>'
        .'<p style="font-size:12px;color:#8a857b;text-align:center;margin-top:16px">Salonieer · '.htmlspecialchars(siteUrl()).'</p></div></body></html>';
    return [$subject, $html, $text];
}

// Placeholders of the billing emails: dates in the reader's language, the requested/approved change, amounts.
function billingMailVars(array $item, string $lang): array {
    $v = $item['vars'] ?? [];
    $when = $v['graceEndsAt'] ?? $v['trialEndsAt'] ?? $v['date'] ?? null;
    $date = '';
    if (is_string($when) && ($ts = strtotime($when))) {
        $date = class_exists('IntlDateFormatter')
            ? (string)(new IntlDateFormatter($lang === 'en' ? 'en_GB' : $lang, IntlDateFormatter::LONG, IntlDateFormatter::NONE, 'UTC'))->format($ts)
            : gmdate('j M Y', $ts);
    }
    $plans = ['en'=>['basic'=>'Basic','pro'=>'Pro','business'=>'Business','enterprise'=>'Enterprise'],
        'ar'=>['basic'=>'الأساسية','pro'=>'الاحترافية','business'=>'الأعمال','enterprise'=>'المؤسسات'],
        'he'=>['basic'=>'בסיסית','pro'=>'פרו','business'=>'עסקית','enterprise'=>'ארגונית']];
    $words = ['en'=>['plan'=>'plan','seats'=>'extra specialists','loyalty'=>'Loyalty Coins','month'=>'monthly','year'=>'yearly','charged'=>'Charged now: {x}.','canceled'=>'the subscription was cancelled and its paid period ended','past_due'=>'the renewal payment was not completed within 7 days'],
        'ar'=>['plan'=>'باقة','seats'=>'مختصون إضافيون','loyalty'=>'نقاط الولاء','month'=>'شهري','year'=>'سنوي','charged'=>'تم خصم: {x}.','canceled'=>'تم إلغاء الاشتراك وانتهت فترته المدفوعة','past_due'=>'لم يتم دفع التجديد خلال 7 أيام'],
        'he'=>['plan'=>'חבילת','seats'=>'אנשי מקצוע נוספים','loyalty'=>'מטבעות נאמנות','month'=>'חודשי','year'=>'שנתי','charged'=>'חויב כעת: {x}.','canceled'=>'המנוי בוטל ותקופת התשלום הסתיימה','past_due'=>'תשלום החידוש לא הושלם תוך 7 ימים']][$lang];
    $change = '';
    if (isset($v['plan'])) {
        $parts = [$words['plan'].' '.($plans[$lang][$v['plan']] ?? $v['plan'])];
        if ((int)($v['extraSpecialists'] ?? 0) > 0) $parts[] = (int)$v['extraSpecialists'].' '.$words['seats'];
        if (!empty($v['loyalty'])) $parts[] = $words['loyalty'];
        if (in_array($v['interval'] ?? '', ['month','year'], true)) $parts[] = $words[$v['interval']];
        $change = implode(' · ', $parts);
    }
    $amount = $v['preview']['immediate'] ?? null;
    return ['{days}'=>(string)(int)($v['daysLeft'] ?? 7), '{date}'=>$date, '{change}'=>$change, '{note}'=>trim((string)($v['note'] ?? '')),
        '{link}'=>(string)($v['link'] ?? siteUrl().'/account'),
        '{amount}'=>isset($v['amount']) ? centsToMoney((string)$v['amount'], (string)($v['currency'] ?? 'USD')) : '',
        '{amountline}'=>is_string($amount) && $amount !== '' ? strtr($words['charged'], ['{x}'=>$amount]) : '',
        '{reasontext}'=>$words[($v['reason'] ?? '') === 'canceled' ? 'canceled' : 'past_due']];
}

// ---- Worker -----------------------------------------------------------------------------------------------------------
// One run at a time across all requests (and the cron job). Sends what's queued, then reads new replies.
function workerClaim(string $name, int $minSeconds): bool {
    db()->exec('CREATE TABLE IF NOT EXISTS worker_lock(name TEXT PRIMARY KEY,locked_until INTEGER NOT NULL DEFAULT 0,last_run INTEGER NOT NULL DEFAULT 0)');
    $now = nowMs();
    runSql('INSERT OR IGNORE INTO worker_lock(name) VALUES(?)', [$name]);
    return runSql('UPDATE worker_lock SET locked_until=?,last_run=? WHERE name=? AND locked_until<? AND last_run<=?', [$now+120000, $now, $name, $now, $now-$minSeconds*1000]) > 0;
}
function workerRelease(string $name): void { runSql('UPDATE worker_lock SET locked_until=0 WHERE name=?', [$name]); }
function mailWork(int $minSeconds = 60, bool $verbose = false): array {
    $report = ['sent'=>0, 'failed'=>0, 'replies'=>0];
    if (!supabaseReady() || !mailReady()) return $report + ['skipped'=>'not configured'];
    if (!workerClaim('mail', $minSeconds)) return $report + ['skipped'=>'busy or too soon'];
    try {
        $started = microtime(true);
        while (microtime(true) - $started < 20) {
            $batch = sbRpc('website_outbox_claim', ['p_limit'=>10]);
            if (!$batch) break;
            foreach ($batch as $item) {
                try {
                    $to = $item['recipient'] === 'admin' ? adminAlertEmails() : (string)($item['application']['email'] ?? '');
                    // A salon billed by an admin may have no owner email on file: nothing to send to.
                    if ($to === '' || $to === []) { sbRpc('website_outbox_finish', ['p_id'=>$item['id'], 'p_ok'=>true, 'p_error'=>'no recipient']); continue; }
                    [$subject, $html, $text] = renderMail($item);
                    // Admin alerts reply straight to the customer's application thread through the mailbox.
                    smtpSend($to, $subject, $html, $text);
                    sbRpc('website_outbox_finish', ['p_id'=>$item['id'], 'p_ok'=>true, 'p_error'=>'']);
                    $report['sent']++;
                } catch (Throwable $e) {
                    error_log('Salonieer mail '.$item['id'].' failed: '.$e->getMessage());
                    sbRpc('website_outbox_finish', ['p_id'=>$item['id'], 'p_ok'=>false, 'p_error'=>substr($e->getMessage(), 0, 400)]);
                    $report['failed']++;
                }
            }
        }
        try { $report['replies'] = pollReplies(); }
        catch (Throwable $e) { error_log('Salonieer IMAP: '.$e->getMessage()); $report['imapError'] = $e->getMessage(); }
    } catch (Throwable $e) { error_log('Salonieer mail worker: '.$e->getMessage()); $report['error'] = $e->getMessage(); }
    finally { workerRelease('mail'); }
    if ($verbose) echo json_encode($report), "\n";
    return $report;
}
function mailWorkAfterResponse(int $minSeconds): void {
    afterResponse(static fn() => mailWork($minSeconds));
}
