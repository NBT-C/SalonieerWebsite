<?php
declare(strict_types=1);
// METON 2.44 (2026-11-06): the business booking page, its private booking links and "My bookings" (decision record
// v2.0). The rules live in Supabase (backend/meton_web.sql in Salonieer-KMP, website_meton_* functions); this file:
//  * keeps who verified which number in this browser session (SQLite book_verify), never in the browser;
//  * sends the verification code — WhatsApp Cloud API (Meta, direct) when WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID
//    are set in the private .env. Without them the booking page takes requests marked "phone not verified" for the
//    business (and My bookings is unavailable), until a code channel is configured;
//  * sets the 90-day trusted-browser cookie (HttpOnly) bound to the verified number;
//  * never logs or returns a code. Demo pages never call these endpoints (their verification is simulated in the page).
if (!defined('SALONIEER')) { http_response_code(404); exit; }

function metonChannel(): string {
    if (strtolower((string)(paddleEnv('METON_VERIFY') ?? '')) === 'off') return 'none';
    return (paddleEnv('WHATSAPP_TOKEN') && paddleEnv('WHATSAPP_PHONE_NUMBER_ID')) ? 'whatsapp' : 'none';
}
function metonTrustCookie(): string { return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? '__Host-meton-trust' : 'meton_trust'; }
function metonSetTrust(string $value, int $age): void {
    setcookie(metonTrustCookie(), $value, ['expires'=>time()+$age, 'path'=>'/', 'secure'=>metonTrustCookie()==='__Host-meton-trust', 'httponly'=>true, 'samesite'=>'Lax']);
}
function metonTrustToken(): string { $v = $_COOKIE[metonTrustCookie()] ?? ''; return is_string($v) && preg_match('/^[a-f0-9]{64}$/D', $v) ? $v : ''; }
function metonTables(): void {
    static $done = false; if ($done) return;
    db()->exec('CREATE TABLE IF NOT EXISTS book_verify(session_hash TEXT PRIMARY KEY,phone TEXT NOT NULL,otp_id TEXT,customer_id TEXT,verified_at INTEGER,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS book_results(request_key TEXT PRIMARY KEY,session_hash TEXT NOT NULL,response TEXT NOT NULL,created_at INTEGER NOT NULL);');
    if (random_int(1, 50) === 1) { runSql('DELETE FROM book_verify WHERE expires_at<?', [nowMs()]); runSql('DELETE FROM book_results WHERE created_at<?', [nowMs()-86400000]); }
    $done = true;
}
function metonRpc(string $fn, array $args): array {
    try { $r = sbRpc($fn, $args); }
    catch (Throwable $e) { error_log('METON '.$fn.': '.$e->getMessage()); fail(503, 'serviceUnavailable'); }
    return is_array($r) ? $r : [];
}
function metonVerify(array|false $session): array|false {
    if (!$session) return false;
    metonTables();
    return one('SELECT * FROM book_verify WHERE session_hash=? AND expires_at>?', [$session['token_hash'], nowMs()]);
}
function metonLang(mixed $v): string { return in_array($v, ['ar','en','he'], true) ? $v : 'en'; }
function metonE164(mixed $v): string { $v = is_string($v) ? trim($v) : ''; return preg_match('/^\+[1-9][0-9]{6,14}$/D', $v) ? $v : ''; }
function metonSlug(mixed $v): string { return is_string($v) && preg_match('/^[a-z][a-z0-9_]{1,31}$/D', $v) ? $v : ''; }
function metonUuid(mixed $v): string { return is_string($v) && preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/D', strtolower($v)) ? strtolower($v) : ''; }
function metonHint(string $slug, string $customer, string $phone): ?string {
    if ($slug === '' || $customer === '') return null;
    $h = metonRpc('website_meton_name_hint', ['p_slug'=>$slug, 'p_customer'=>$customer, 'p_phone'=>$phone]);
    return isset($h['name']) && is_string($h['name']) && $h['name'] !== '' ? $h['name'] : null;
}
// WhatsApp Cloud API (direct, no intermediary): an approved "authentication" template with the code in the body and
// the copy-code button. Template name and languages come from the .env (defaults: meton_otp, ar / en / he).
function metonSendWhatsApp(string $phone, string $code, string $lang): bool {
    $token = paddleEnv('WHATSAPP_TOKEN'); $pid = paddleEnv('WHATSAPP_PHONE_NUMBER_ID');
    if (!$token || !$pid || !preg_match('/^[0-9]{5,30}$/D', $pid)) return false;
    $base = rtrim(paddleEnv('WHATSAPP_API_BASE') ?? 'https://graph.facebook.com/v21.0', '/');
    if (!preg_match('~^(https://graph\.facebook\.com/v[0-9]+\.[0-9]+|http://127\.0\.0\.1:[0-9]+)$~D', $base)) return false;
    $langs = ['ar'=>paddleEnv('WHATSAPP_TEMPLATE_LANG_AR') ?? 'ar', 'he'=>paddleEnv('WHATSAPP_TEMPLATE_LANG_HE') ?? 'he', 'en'=>paddleEnv('WHATSAPP_TEMPLATE_LANG_EN') ?? 'en'];
    $payload = ['messaging_product'=>'whatsapp', 'to'=>ltrim($phone, '+'), 'type'=>'template', 'template'=>[
        'name'=>paddleEnv('WHATSAPP_OTP_TEMPLATE') ?? 'meton_otp', 'language'=>['code'=>$langs[$lang] ?? 'en'],
        'components'=>[['type'=>'body', 'parameters'=>[['type'=>'text', 'text'=>$code]]],
                       ['type'=>'button', 'sub_type'=>'url', 'index'=>'0', 'parameters'=>[['type'=>'text', 'text'=>$code]]]]]];
    $c = curl_init($base.'/'.$pid.'/messages');
    curl_setopt_array($c, [CURLOPT_POST=>true, CURLOPT_RETURNTRANSFER=>true, CURLOPT_CONNECTTIMEOUT=>6, CURLOPT_TIMEOUT=>15, CURLOPT_FOLLOWLOCATION=>false,
        CURLOPT_HTTPHEADER=>['Authorization: Bearer '.$token, 'Content-Type: application/json'], CURLOPT_POSTFIELDS=>json_encode($payload, JSON_UNESCAPED_SLASHES)]);
    $raw = curl_exec($c); $status = (int)curl_getinfo($c, CURLINFO_HTTP_CODE); curl_close($c);
    if ($status < 200 || $status >= 300) { error_log('METON WhatsApp: HTTP '.$status.' '.substr(preg_replace('/[0-9]{6}/', '******', (string)$raw), 0, 300)); return false; }
    return true;
}
function metonError(int $status, string $code, array $extra = []): never { sendJson($status, ['error'=>$code] + $extra); }

// ── Instant activation and light moderation (NEW-004/005/010) ────────────────────────────────────────────────────
// Obvious spam or links in a business name or draft: such a case waits for a human in the admin inbox; every other
// business is created the moment its card payment completes (no approval queue).
const METON_FLAG = '/(https?:\/\/|www\.|\.(com|net|org|ru|xyz|top|info|biz|click|link)\b|casino|viagra|cialis|crypto|bitcoin|forex|loan|porn|sex\b|escort|\bbet\b|gambl)/iu';
function metonFlagged(string ...$texts): bool { foreach ($texts as $t) if (preg_match(METON_FLAG, $t)) return true; return false; }
function metonDraftTable(): void {
    static $done = false; if ($done) return;
    db()->exec('CREATE TABLE IF NOT EXISTS drafts(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,draft TEXT NOT NULL,flagged INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL)');
    $done = true;
}
// A draft from the Try METON Free builder, reduced to what a business setup needs.
function metonCleanDraft(mixed $d): ?array {
    if (!is_array($d)) return null;
    $txt = fn($v, $max) => is_string($v) ? mb_substr(trim(preg_replace('/[\x00-\x1f<>{}]/u', '', $v)), 0, $max) : '';
    $id = fn($v) => is_string($v) && preg_match('/^[A-Za-z0-9_-]{1,24}$/D', $v) ? $v : '';
    $time = fn($v, $def) => is_string($v) && preg_match('/^([01][0-9]|2[0-3]):[0-5][0-9]$/D', $v) ? $v : $def;
    $services = [];
    foreach (array_slice(is_array($d['services'] ?? null) ? $d['services'] : [], 0, 30) as $s) {
        if (!is_array($s) || $id($s['id'] ?? null) === '') continue;
        $services[] = ['id'=>$id($s['id']), 'name'=>$txt($s['name'] ?? '', 60), 'duration'=>max(5, min(480, (int)($s['duration'] ?? 30))), 'price'=>is_numeric($s['price'] ?? null) ? max(0, min(1000000, (float)$s['price'])) : ''];
    }
    $sids = array_column($services, 'id'); $team = [];
    foreach (array_slice(is_array($d['team'] ?? null) ? $d['team'] : [], 0, 20) as $t) {
        if (!is_array($t) || $id($t['id'] ?? null) === '') continue;
        $team[] = ['id'=>$id($t['id']), 'name'=>$txt($t['name'] ?? '', 60), 'role'=>$txt($t['role'] ?? '', 60),
            'services'=>array_values(array_intersect(array_map('strval', is_array($t['services'] ?? null) ? $t['services'] : []), $sids))];
    }
    $h = is_array($d['hours'] ?? null) ? $d['hours'] : []; $days = [];
    foreach (range(0, 6) as $k) $days[(string)$k] = (bool)($h['days'][(string)$k] ?? $h['days'][$k] ?? ($k !== 5));
    $color = is_string($d['color'] ?? null) && preg_match('/^#[0-9a-fA-F]{6}$/D', $d['color']) ? $d['color'] : '#241D28';
    return ['name'=>$txt($d['name'] ?? '', 60), 'kind'=>$txt($d['kind'] ?? '', 80), 'color'=>$color, 'services'=>$services, 'team'=>$team,
        'hours'=>['from'=>$time($h['from'] ?? null, '09:00'), 'to'=>$time($h['to'] ?? null, '18:00'), 'days'=>$days], 'bookings'=>[]];
}
function metonDraftsApi(string $method, string $path, array|false $user): void {
    if (!$user) fail(401, 'loginRequired');
    metonDraftTable();
    if ($method === 'GET' && $path === '/api/drafts') {
        $r = one('SELECT draft,flagged,updated_at FROM drafts WHERE user_id=?', [(int)$user['id']]);
        sendJson(200, ['draft'=>$r ? json_decode($r['draft'], true) : null, 'flagged'=>$r ? (bool)$r['flagged'] : false]);
    }
    if ($method === 'POST' && $path === '/api/drafts') {
        rateLimit('draft-save', 120, 3600, (string)$user['id']);
        $d = metonCleanDraft(body()['draft'] ?? null);
        if (!$d) fail(400, 'invalidRequest');
        $flag = metonFlagged($d['name'], $d['kind'], ...array_column($d['services'], 'name'), ...array_map(fn($t) => $t['name'].' '.$t['role'], $d['team']));
        runSql('INSERT INTO drafts(user_id,draft,flagged,updated_at) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET draft=excluded.draft,flagged=excluded.flagged,updated_at=excluded.updated_at',
            [(int)$user['id'], json_encode($d, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES), $flag ? 1 : 0, nowMs()]);
        sendJson(200, ['ok'=>true, 'flagged'=>$flag]);
    }
    fail(404, 'notFound');
}
// ── Business sign-in (BIZ-001/004) ───────────────────────────────────────────────────────────────────────────────
// Forgotten password: a 6-digit code by email (support@meton.work), 15 minutes, 5 tries. The answer never says
// whether an account exists. A reset signs the account out everywhere.
function metonPasswordApi(string $method, string $path, array|false $session): void {
    db()->exec('CREATE TABLE IF NOT EXISTS password_codes(email TEXT PRIMARY KEY,code_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,sent_at INTEGER NOT NULL)');
    if ($method === 'POST' && $path === '/api/password/code') {
        $d = body(); $email = strtolower(cleanText($d['email'] ?? null));
        if (!validEmail($email)) fail(400, 'invalidEmail', 'email');
        rateLimit('pw-code-ip', 20, 3600); rateLimit('pw-code', 5, 3600, $email);
        $u = one('SELECT id,full_name FROM users WHERE email=?', [$email]);
        $prev = one('SELECT sent_at FROM password_codes WHERE email=?', [$email]);
        if ($u && (!$prev || (int)$prev['sent_at'] < nowMs() - 45000)) {
            $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
            runSql('INSERT INTO password_codes(email,code_hash,expires_at,attempts,sent_at) VALUES(?,?,?,0,?) ON CONFLICT(email) DO UPDATE SET code_hash=excluded.code_hash,expires_at=excluded.expires_at,attempts=0,sent_at=excluded.sent_at',
                [$email, password_hash($code, PASSWORD_DEFAULT), nowMs()+900000, nowMs()]);
            $lang = metonLang($d['lang'] ?? null);
            $copy = ['en'=>['Your METON code', 'Your code to reset your METON password', 'It expires in 15 minutes. If you didn’t ask for it, you can ignore this email; your password stays the same.'],
                'ar'=>['رمز METON الخاص بك', 'رمزك لإعادة تعيين كلمة مرور METON', 'تنتهي صلاحيته بعد 15 دقيقة. إذا لم تطلبه يمكنك تجاهل هذه الرسالة، وتبقى كلمة مرورك كما هي.'],
                'he'=>['הקוד שלך ב-METON', 'הקוד לאיפוס הסיסמה ב-METON', 'הקוד בתוקף ל-15 דקות. אם לא ביקשת אותו, אפשר להתעלם מהמייל; הסיסמה נשארת כפי שהיא.']][$lang];
            $dir = $lang === 'en' ? 'ltr' : 'rtl';
            $html = '<div dir="'.$dir.'" style="font-family:Arial,sans-serif;color:#241D28;max-width:520px"><p style="font-size:22px;font-weight:800;letter-spacing:.04em">METON</p><p>'.htmlspecialchars($copy[1]).':</p><p style="font-size:32px;font-weight:800;letter-spacing:.3em" dir="ltr">'.$code.'</p><p style="color:#6c6170">'.htmlspecialchars($copy[2]).'</p></div>';
            try { if (mailReady()) smtpSend($email, $copy[0].': '.$code, $html, $copy[1].': '.$code."\n\n".$copy[2]); else error_log('METON password code: mail is not configured'); }
            catch (Throwable $e) { error_log('METON password code: '.$e->getMessage()); }
        }
        sendJson(200, ['ok'=>true]);
    }
    if ($method === 'POST' && $path === '/api/password/reset') {
        $d = body(); $email = strtolower(cleanText($d['email'] ?? null)); $code = preg_replace('/[^0-9]/', '', (string)($d['code'] ?? ''));
        rateLimit('pw-reset-ip', 30, 3600);
        $row = validEmail($email) ? one('SELECT * FROM password_codes WHERE email=?', [$email]) : false;
        if (!$row || (int)$row['expires_at'] < nowMs() || (int)$row['attempts'] >= 5) fail(400, 'codeExpired', 'code');
        runSql('UPDATE password_codes SET attempts=attempts+1 WHERE email=?', [$email]);
        if (strlen($code) !== 6 || !password_verify($code, $row['code_hash'])) fail(400, 'wrongCode', 'code');
        $u = one('SELECT id,email,username FROM users WHERE email=?', [$email]);
        if (!$u) fail(400, 'codeExpired', 'code');
        if ($problem = passwordProblem($d['password'] ?? null, $email)) fail(400, $problem, 'password');
        if (($d['password'] ?? null) !== ($d['passwordConfirm'] ?? null)) fail(400, 'passwordMismatch', 'passwordConfirm');
        runSql('UPDATE users SET password_hash=? WHERE id=?', [password_hash((string)$d['password'], PASSWORD_DEFAULT), $u['id']]);
        runSql('DELETE FROM sessions WHERE user_id=?', [$u['id']]);
        runSql('DELETE FROM password_codes WHERE email=?', [$email]);
        sendJson(200, ['ok'=>true]);
    }
    fail(404, 'notFound');
}
// Google sign-in, switched on by GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in the private .env (the owner creates the
// OAuth client; redirect URI https://www.meton.work/auth/google/callback). It signs in to an EXISTING website account
// with the same verified email; it never creates permissions and never links a second identity silently (BIZ-004).
function metonGoogleReady(): bool { return (bool)(paddleEnv('GOOGLE_CLIENT_ID') && paddleEnv('GOOGLE_CLIENT_SECRET')); }
function metonGoogleRoute(string $route, array|false $session): void {
    if (!metonGoogleReady()) redirectTo('/login');
    $redirect = siteUrlFor('/auth/google/callback');
    if ($route === '/auth/google') {
        $state = token(); setcookie('meton_oauth', $state, ['expires'=>time()+600, 'path'=>'/auth/google', 'secure'=>!empty($_SERVER['HTTPS']), 'httponly'=>true, 'samesite'=>'Lax']);
        redirectTo('https://accounts.google.com/o/oauth2/v2/auth?'.http_build_query(['client_id'=>paddleEnv('GOOGLE_CLIENT_ID'), 'redirect_uri'=>$redirect,
            'response_type'=>'code', 'scope'=>'openid email', 'state'=>$state, 'prompt'=>'select_account']));
    }
    $state = (string)($_GET['state'] ?? ''); $code = (string)($_GET['code'] ?? '');
    if ($state === '' || !hash_equals((string)($_COOKIE['meton_oauth'] ?? ''), $state) || $code === '') redirectTo('/login?google=failed');
    setcookie('meton_oauth', '', ['expires'=>time()-3600, 'path'=>'/auth/google']);
    $c = curl_init('https://oauth2.googleapis.com/token');
    curl_setopt_array($c, [CURLOPT_POST=>true, CURLOPT_RETURNTRANSFER=>true, CURLOPT_TIMEOUT=>15, CURLOPT_POSTFIELDS=>http_build_query(['code'=>$code,
        'client_id'=>paddleEnv('GOOGLE_CLIENT_ID'), 'client_secret'=>paddleEnv('GOOGLE_CLIENT_SECRET'), 'redirect_uri'=>$redirect, 'grant_type'=>'authorization_code'])]);
    $tok = json_decode((string)curl_exec($c), true); curl_close($c);
    $parts = explode('.', (string)($tok['id_token'] ?? ''));
    $claims = count($parts) === 3 ? json_decode(base64_decode(strtr($parts[1], '-_', '+/')), true) : null;
    // The token came straight from Google over TLS (code exchange with our secret), so its claims are trusted; the
    // audience and issuer are still checked.
    if (!is_array($claims) || ($claims['aud'] ?? '') !== paddleEnv('GOOGLE_CLIENT_ID') || !in_array($claims['iss'] ?? '', ['https://accounts.google.com', 'accounts.google.com'], true)
        || empty($claims['email_verified']) || (int)($claims['exp'] ?? 0) < time()) redirectTo('/login?google=failed');
    $email = strtolower((string)$claims['email']);
    $u = one('SELECT id FROM users WHERE email=?', [$email]);
    if (!$u) redirectTo('/register?google=noaccount&email='.rawurlencode($email));
    newSession((int)$u['id'], $session);
    redirectTo('/account');
}
function siteUrlFor(string $path): string {
    $host = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
    $base = in_array($host, ['www.meton.work', 'meton.work', 'salonieer.com', 'www.salonieer.com'], true) ? 'https://'.$host : rtrim(siteUrl(), '/');
    return $base.$path;
}

// Called when a CARD payment for an application completes (paddle.php). Bank transfers and admin test payments keep
// the admin's manual approval (a person is already looking at them). Never throws: on any problem the application
// simply stays in the admin inbox, as before.
function metonInstantApprove(string $appId, ?int $userId): void {
    if (strtolower((string)(paddleEnv('METON_INSTANT_APPROVAL') ?? 'on')) === 'off') return;
    try {
        $a = sbRpc('website_application', ['p_id'=>$appId, 'p_user'=>null]);
        if (!is_array($a) || !empty($a['salon']) || ($a['status'] ?? '') === 'declined') return;
        $draft = null;
        if ($userId) { metonDraftTable(); $row = one('SELECT draft,flagged FROM drafts WHERE user_id=?', [$userId]); if ($row) $draft = $row; }
        if (metonFlagged((string)($a['salonName'] ?? '')) || ($draft && (int)$draft['flagged'])) { error_log('METON instant approval '.$appId.': flagged for review'); return; }
        $r = sbRpc('website_approve', ['p_id'=>$appId, 'p_overrides'=>(object)[], 'p_actor'=>'METON (instant)']);
        $slug = is_array($r) ? (string)($r['salon']['slug'] ?? '') : '';
        if ($slug !== '' && $draft) {
            $ap = sbRpc('website_meton_apply_draft', ['p_slug'=>$slug, 'p_draft'=>json_decode($draft['draft'], true)]);
            if (!empty($ap['ok'])) runSql('DELETE FROM drafts WHERE user_id=?', [$userId]);
        }
        mailWorkAfterResponse(0);
    } catch (Throwable $e) {
        if (!preg_match('/already_approved/', $e->getMessage())) error_log('METON instant approval '.$appId.': '.$e->getMessage());
    }
}

function metonBookingApi(string $method, string $path, array|false $session): void {
    // ── the booking page (anyone, before any account) ──
    if ($method === 'GET' && $path === '/api/book/page') {
        rateLimit('book-page', 600, 3600);
        $code = (string)($_GET['code'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_-]{2,64}$/D', $code)) fail(400, 'invalidRequest');
        $p = metonRpc('website_meton_page', ['p_code'=>$code]);
        if (empty($p['found'])) fail(404, 'notFound');
        sendJson(200, ['page'=>$p, 'verify'=>metonChannel()]);
    }
    if ($method === 'GET' && $path === '/api/book/times') {
        rateLimit('book-times', 900, 3600);
        $slug = metonSlug($_GET['slug'] ?? ''); $svc = metonUuid($_GET['service'] ?? ''); $sp = metonUuid($_GET['specialist'] ?? ''); $date = (string)($_GET['date'] ?? '');
        if ($slug === '' || $svc === '' || $sp === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $date)) fail(400, 'invalidRequest');
        $r = metonRpc('website_meton_times', ['p_slug'=>$slug, 'p_service'=>$svc, 'p_barber'=>$sp, 'p_date'=>$date]);
        sendJson(200, ['times'=>is_array($r['times'] ?? null) ? $r['times'] : [], 'online'=>(bool)($r['online_booking'] ?? true)]);
    }
    if ($method === 'GET' && $path === '/api/book/manage') {
        rateLimit('book-manage', 300, 3600);
        $t = (string)($_GET['t'] ?? '');
        if (!preg_match('/^[a-f0-9]{48}$/D', $t)) sendJson(200, ['booking'=>['valid'=>false, 'reason'=>'not_found']]);
        sendJson(200, ['booking'=>metonRpc('website_meton_manage', ['p_link'=>$t])]);
    }
    // Everything below changes state: a browser session (and its CSRF token, checked by api()) is required.
    if (!$session) fail(403, 'sessionExpired');
    metonTables();
    $sh = $session['token_hash'];
    if ($method === 'POST' && $path === '/api/book/phone') {
        $d = body(); $phone = metonE164($d['phone'] ?? null); $slug = metonSlug($d['slug'] ?? ''); $purpose = ($d['purpose'] ?? '') === 'my_bookings' ? 'my_bookings' : 'booking';
        if ($phone === '') fail(400, 'invalidPhone', 'phone');
        rateLimit('book-phone', 40, 3600); rateLimit('book-phone-n', 12, 3600, $phone);
        runSql('DELETE FROM book_verify WHERE session_hash=?', [$sh]);
        // A browser this number already verified (90 days): no code needed.
        $trust = metonTrustToken();
        if ($trust !== '') {
            $t = metonRpc('website_meton_trust', ['p_token'=>$trust, 'p_phone'=>$phone]);
            if (!empty($t['ok']) && metonUuid($t['customer_id'] ?? '') !== '') {
                runSql('INSERT INTO book_verify(session_hash,phone,otp_id,customer_id,verified_at,expires_at) VALUES(?,?,?,?,?,?)', [$sh, (string)$t['phone'], null, (string)$t['customer_id'], nowMs(), nowMs()+1800000]);
                sendJson(200, ['state'=>'verified', 'trusted'=>true, 'name'=>metonHint($slug, (string)$t['customer_id'], (string)$t['phone'])]);
            }
        }
        if (metonChannel() === 'none') {
            if ($purpose === 'my_bookings') metonError(409, 'verifyUnavailable');
            runSql('INSERT INTO book_verify(session_hash,phone,otp_id,customer_id,verified_at,expires_at) VALUES(?,?,?,?,?,?)', [$sh, $phone, null, null, null, nowMs()+1800000]);
            sendJson(200, ['state'=>'unverified']);
        }
        $o = metonRpc('website_meton_otp_start', ['p_phone'=>$phone, 'p_purpose'=>$purpose]);
        if (($o['error'] ?? '') === 'too_soon') metonError(429, 'codeTooSoon', ['wait'=>(int)($o['wait'] ?? 45)]);
        if (($o['error'] ?? '') === 'limit') metonError(429, 'tooManyAttempts');
        if (!empty($o['error']) || empty($o['id'])) fail(400, 'invalidPhone', 'phone');
        if (!metonSendWhatsApp((string)$o['phone'], (string)$o['code'], metonLang($d['lang'] ?? null))) metonError(503, 'codeNotSent');
        runSql('INSERT INTO book_verify(session_hash,phone,otp_id,customer_id,verified_at,expires_at) VALUES(?,?,?,?,?,?)', [$sh, (string)$o['phone'], (string)$o['id'], null, null, nowMs()+900000]);
        sendJson(200, ['state'=>'code_sent', 'channel'=>'whatsapp', 'resend_in'=>45]);
    }
    if ($method === 'POST' && $path === '/api/book/code') {
        $d = body(); $row = metonVerify($session); $slug = metonSlug($d['slug'] ?? '');
        if (!$row || empty($row['otp_id'])) metonError(409, 'verifyFirst');
        rateLimit('book-code', 40, 3600);
        $code = preg_replace('/[^0-9]/', '', (string)($d['code'] ?? ''));
        if (strlen($code) !== 6) metonError(400, 'wrongCode', ['field'=>'code']);
        $v = metonRpc('website_meton_otp_verify', ['p_id'=>$row['otp_id'], 'p_phone'=>$row['phone'], 'p_code'=>$code]);
        if (($v['error'] ?? '') === 'wrong_code') metonError(400, 'wrongCode', ['field'=>'code', 'left'=>(int)($v['left'] ?? 0)]);
        if (!empty($v['error']) || empty($v['ok'])) { runSql('DELETE FROM book_verify WHERE session_hash=?', [$sh]); metonError(400, 'codeExpired'); }
        runSql('UPDATE book_verify SET otp_id=NULL,customer_id=?,verified_at=?,expires_at=? WHERE session_hash=?', [(string)$v['customer_id'], nowMs(), nowMs()+1800000, $sh]);
        if (preg_match('/^[a-f0-9]{64}$/D', (string)($v['trust_token'] ?? ''))) metonSetTrust((string)$v['trust_token'], 90*86400);
        sendJson(200, ['state'=>'verified', 'name'=>metonHint($slug, (string)$v['customer_id'], (string)$row['phone'])]);
    }
    if ($method === 'POST' && $path === '/api/book') {
        $d = body(); $row = metonVerify($session);
        $key = (string)($d['request_key'] ?? '');
        if (!preg_match('/^[A-Za-z0-9_-]{16,80}$/D', $key)) fail(400, 'invalidRequest');
        $prior = one('SELECT * FROM book_results WHERE request_key=?', [$key]);
        if ($prior && hash_equals($prior['session_hash'], $sh)) sendJson(201, json_decode($prior['response'], true));
        if (!$row) metonError(409, 'verifyFirst');
        $customer = (string)($row['customer_id'] ?? '');
        if ($customer === '' && metonChannel() !== 'none') metonError(409, 'verifyFirst');
        $slug = metonSlug($d['slug'] ?? ''); $svc = metonUuid($d['service'] ?? ''); $sp = metonUuid($d['specialist'] ?? '');
        $date = (string)($d['date'] ?? ''); $time = (string)($d['time'] ?? '');
        if ($slug === '' || $svc === '' || $sp === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $date) || !preg_match('/^\d{2}:\d{2}$/D', $time)) fail(400, 'invalidRequest');
        rateLimit('book-create', 20, 3600);
        $r = metonRpc('website_meton_book', ['p_slug'=>$slug, 'p_service'=>$svc, 'p_barber'=>$sp, 'p_date'=>$date, 'p_time'=>$time, 'p_phone'=>$row['phone'],
            'p_name'=>mb_substr(is_string($d['name'] ?? null) ? $d['name'] : '', 0, 80), 'p_customer'=>$customer !== '' ? $customer : null,
            'p_request_key'=>$key, 'p_note'=>mb_substr(is_string($d['note'] ?? null) ? $d['note'] : '', 0, 300)]);
        $err = (string)($r['error'] ?? '');
        if ($err !== '') {
            $map = ['slot_taken'=>'slotTaken', 'invalid_name'=>'invalidName', 'use_app'=>'useApp', 'unavailable'=>'bookingUnavailable', 'busy'=>'tryAgain',
                'not_verified'=>'verifyFirst', 'invalid_phone'=>'invalidPhone', 'rejected'=>'bookingRejected'];
            metonError(409, $map[$err] ?? 'bookingRejected', array_filter(['detail'=>is_string($r['message'] ?? null) ? mb_substr($r['message'], 0, 200) : null, 'field'=>$err === 'invalid_name' ? 'name' : null]));
        }
        if (!empty($r['duplicate'])) sendJson(200, ['duplicate'=>true]);
        $res = ['booking'=>['status'=>(string)($r['status'] ?? 'pending'), 'date'=>(string)($r['date'] ?? $date), 'time'=>(string)($r['time'] ?? $time),
            'service'=>(string)($r['service'] ?? ''), 'specialist'=>(string)($r['specialist'] ?? ''), 'name'=>(string)($r['name'] ?? ''), 'verified'=>!empty($r['verified'])],
            'manage'=>'/m/'.(string)$r['link_token']];
        runSql('INSERT OR REPLACE INTO book_results(request_key,session_hash,response,created_at) VALUES(?,?,?,?)', [$key, $sh, json_encode($res, JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES), nowMs()]);
        sendJson(201, $res);
    }
    if ($method === 'POST' && $path === '/api/book/cancel') {
        $d = body(); $t = (string)($d['t'] ?? '');
        if (!preg_match('/^[a-f0-9]{48}$/D', $t)) metonError(409, 'linkInvalid');
        rateLimit('book-cancel', 30, 3600);
        $r = metonRpc('website_meton_cancel', ['p_link'=>$t]);
        if (!empty($r['error'])) metonError(409, $r['error'] === 'cancel_closed' ? 'cancelClosed' : 'linkInvalid');
        sendJson(200, ['ok'=>true]);
    }
    if ($method === 'GET' && $path === '/api/me/bookings') {
        $row = metonVerify($session);
        if (!$row || empty($row['customer_id'])) metonError(401, 'verifyFirst');
        $r = metonRpc('website_meton_my_bookings', ['p_customer'=>$row['customer_id']]);
        sendJson(200, ['phone'=>$row['phone'], 'bookings'=>is_array($r['bookings'] ?? null) ? $r['bookings'] : []]);
    }
    if ($method === 'POST' && $path === '/api/book/forget') {
        $t = metonTrustToken();
        if ($t !== '') metonRpc('website_meton_trust_revoke', ['p_token'=>$t]);
        metonSetTrust('', -3600);
        runSql('DELETE FROM book_verify WHERE session_hash=?', [$sh]);
        sendJson(200, ['ok'=>true]);
    }
    fail(404, 'notFound');
}
