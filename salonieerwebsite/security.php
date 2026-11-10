<?php
declare(strict_types=1);
// Input validation and sign-in protection, loaded by index.php. Every rule here is also mirrored in the browser
// (assets/validate.js) for instant feedback, but only these server checks are trusted.
if (!defined('SALONIEER')) { http_response_code(404); exit; }

use libphonenumber\PhoneNumberUtil;
use libphonenumber\PhoneNumberFormat;
use libphonenumber\NumberParseException;

// ---- Phone numbers ------------------------------------------------------------------------------------------------
// Numbers are parsed with libphonenumber for the dialing country the visitor picked (or their account country), so
// "0501234567" in Israel and "+972 50-123-4567" both become "+972501234567". Accounts are matched on that E.164 form.
function normalizePhone(mixed $raw, string $region): ?string {
    if (!is_string($raw)) return null;
    $raw = trim($raw);
    if ($raw === '' || strlen($raw) > 40 || !preg_match('/^[+0-9\s().\-\/]+$/D', $raw)) return null;
    $util = PhoneNumberUtil::getInstance();
    $clean = preg_replace('/^00/', '+', preg_replace('/[\s().\-\/]/', '', $raw));
    // Israeli and Palestinian local numbers are used interchangeably, so a local number is also tried in the other.
    foreach (array_merge([$region], ['IL' => ['PS'], 'PS' => ['IL']][$region] ?? []) as $r) {
        try { $n = $util->parse($clean, $r); } catch (NumberParseException) { continue; }
        if ($util->isValidNumber($n)) return canonicalPhone($util->format($n, PhoneNumberFormat::E164));
    }
    return null;
}
// Palestinian mobile operators (Jawwal 059, Ooredoo 056) are reachable under both +970 and +972, so one physical
// number has two E.164 spellings. Both are stored as +970 so the same number can't open two accounts.
function canonicalPhone(string $e164): string {
    return preg_match('/^\+9725([69]\d{7})$/D', $e164, $m) ? '+9705' . $m[1] : $e164;
}
// Best-effort E.164 for numbers saved before validation existed (used only to find duplicates).
function legacyPhoneKey(string $phone, string $country): string {
    return normalizePhone($phone, $country ?: 'ZZ') ?? preg_replace('/[^0-9+]/', '', $phone);
}

// ---- Names, email, password -----------------------------------------------------------------------------------------
function cleanText(mixed $v): string { return is_string($v) ? trim(preg_replace('/\s+/u', ' ', $v)) : ''; }
function validFullName(string $name): bool {
    $letters = preg_match_all('/\p{L}/u', $name);
    return mb_strlen($name) >= 2 && mb_strlen($name) <= 100 && $letters >= 2
        && (bool)preg_match("/^[\p{L}\p{M}][\p{L}\p{M} .'’\-]*$/uD", $name);
}
function validEmail(string $email): bool {
    if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) return false;
    $domain = substr(strrchr($email, '@'), 1);
    return (bool)preg_match('/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/D', $domain);
}
const COMMON_PASSWORDS = ['1234567890','12345678910','0123456789','1111111111','0000000000','1234512345','qwertyuiop','password123','password1234','passw0rd123','iloveyou123','abcdefghij','abc1234567','qwerty1234','qwerty12345','1q2w3e4r5t','1qaz2wsx3edc','letmein123','welcome123','admin12345','administrator','salonieer1','salonieer123','987654321','9876543210','asdfghjkl1','zxcvbnm123','aaaaaaaaaa','11223344556','password!1'];
// Returns an error code, or null when the password is acceptable.
function passwordProblem(mixed $password, string $email = '', string $username = ''): ?string {
    if (!is_string($password) || mb_strlen($password) < 10 || mb_strlen($password) > 128) return 'invalidPassword';
    $lower = mb_strtolower($password);
    if (in_array($lower, COMMON_PASSWORDS, true) || count(array_unique(mb_str_split($lower))) < 4) return 'weakPassword';
    foreach ([strstr($email, '@', true) ?: '', $username] as $part) {
        if (mb_strlen($part) >= 4 && str_contains($lower, mb_strtolower($part))) return 'passwordPersonal';
    }
    return null;
}

// ---- Identity numbers ------------------------------------------------------------------------------------------------
// Asked only for salons in these countries. The rule: digits only, at least 5 of them, and not an obvious made-up
// number. This proves a number is plausible, not that it belongs to the applicant; there is no authoritative lookup.
const ID_COUNTRIES = ['IL', 'PS'];
const ID_MIN_DIGITS = 5;
const ID_MAX_CHARS = 64; // storage safety only, not a format rule
function normalizeIdNumber(mixed $raw): string {
    return is_string($raw) ? strtoupper(preg_replace('/[\s\-.\/_]/u', '', $raw)) : '';
}
// Same digit repeated (11111), a straight run up or down (12345, 1234567890, 98765), or a short block repeated (121212, 123123).
function obviousFakeId(string $digits): bool {
    $n = strlen($digits);
    if (count(array_unique(str_split($digits))) === 1) return true;
    foreach ([1, 9] as $step) { // +1 or -1 per digit, wrapping 9 -> 0
        $run = true;
        for ($i = 1; $i < $n && $run; $i++) $run = ((int)$digits[$i] - (int)$digits[$i-1] + 10) % 10 === $step;
        if ($run) return true;
    }
    for ($len = 2; $len <= min(4, intdiv($n, 2)); $len++)
        if (str_starts_with(str_repeat(substr($digits, 0, $len), intdiv($n, $len) + 1), $digits)) return true;
    return false;
}
// Returns the ID for storage, or null when it is not acceptable.
function canonicalIdNumber(string $id, string $country): ?string {
    if (strlen($id) > ID_MAX_CHARS || !preg_match('/^\d{' . ID_MIN_DIGITS . ',}$/D', $id)) return null;
    return obviousFakeId($id) ? null : $id;
}
// Keyed hash used to find a second application with the same ID without storing it in the clear.
function idFingerprint(string $canonical, string $country): string {
    $scope = in_array($country, ['IL', 'PS'], true) ? 'IL-PS' : $country;
    return hash_hmac('sha256', $scope . ':' . $canonical, identityKey());
}

// ---- Failed sign-in tracking and lockout ------------------------------------------------------------------------------
// Failures are counted per email (whether or not an account exists, so the response never reveals that) and per IP.
// From the 5th failure for an email, sign-in for it pauses for 1, 2, 4 … up to 30 minutes after each further failure.
const LOCK_AFTER = 5;
const CHALLENGE_AFTER = 3;
function failureBucket(string $kind, string $value): string { return digest('fail:' . $kind . ':' . $value); }
function failureState(string $bucket): array {
    $r = one('SELECT fails,locked_until,updated_at FROM auth_failures WHERE bucket=?', [$bucket]);
    if (!$r || (int)$r['updated_at'] < nowMs() - 86400000) return ['fails' => 0, 'locked_until' => 0];
    return ['fails' => (int)$r['fails'], 'locked_until' => (int)$r['locked_until']];
}
function recordFailure(string $bucket): void {
    $s = failureState($bucket); $fails = $s['fails'] + 1;
    $lock = $fails >= LOCK_AFTER ? nowMs() + min(1800, 60 * 2 ** ($fails - LOCK_AFTER)) * 1000 : 0;
    runSql('INSERT INTO auth_failures(bucket,fails,locked_until,updated_at) VALUES(?,?,?,?) ON CONFLICT(bucket) DO UPDATE SET fails=excluded.fails,locked_until=excluded.locked_until,updated_at=excluded.updated_at', [$bucket, $fails, $lock, nowMs()]);
}
function clearFailures(string $bucket): void { runSql('DELETE FROM auth_failures WHERE bucket=?', [$bucket]); }
function lockedFor(string $bucket): int { $s = failureState($bucket); return max(0, (int)ceil(($s['locked_until'] - nowMs()) / 1000)); }

// ---- Bot challenge (proof of work) ------------------------------------------------------------------------------------
// When an IP or email looks suspicious, the browser must find a number whose SHA-256 (with a signed, expiring salt)
// matches the challenge. It costs a person a second of background work and makes scripted guessing expensive.
// Self-hosted: no third-party CAPTCHA, cookies or tracking.
const CHALLENGE_MAX = 120000;
function challengeKey(): string { return hash('sha256', 'salonieer-challenge:' . identityKey(), true); }
function newChallenge(): array {
    $salt = bin2hex(random_bytes(12)) . '?expires=' . (time() + 600);
    $number = random_int(1000, CHALLENGE_MAX);
    $challenge = hash('sha256', $salt . $number);
    return ['algorithm' => 'SHA-256', 'salt' => $salt, 'challenge' => $challenge, 'maxnumber' => CHALLENGE_MAX, 'signature' => hash_hmac('sha256', $challenge, challengeKey())];
}
function challengeSolved(mixed $s): bool {
    if (!is_array($s) || !is_string($s['salt'] ?? null) || !is_string($s['challenge'] ?? null) || !is_string($s['signature'] ?? null) || !is_int($s['number'] ?? null)) return false;
    if (!preg_match('/^[a-f0-9]{24}\?expires=(\d{10})$/D', $s['salt'], $m) || (int)$m[1] < time()) return false;
    if (!hash_equals(hash_hmac('sha256', $s['challenge'], challengeKey()), $s['signature'])) return false;
    if (!hash_equals($s['challenge'], hash('sha256', $s['salt'] . $s['number']))) return false;
    // Each solution works once.
    try { runSql('INSERT INTO used_challenges(id,expires_at) VALUES(?,?)', [$s['challenge'], (int)$m[1]]); }
    catch (PDOException) { return false; }
    if (random_int(1, 50) === 1) runSql('DELETE FROM used_challenges WHERE expires_at<?', [time()]);
    return true;
}
function requireChallengeIf(bool $suspicious, array $d): void {
    if ($suspicious && !challengeSolved($d['challenge'] ?? null)) fail(403, 'challengeRequired');
}
// Recent activity from this IP for an action (counts every attempt, not just failures).
function recentHits(string $type): int {
    $r = one('SELECT hits,reset_at FROM rate_limits WHERE bucket=?', [digest($type . ':' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'))]);
    return $r && (int)$r['reset_at'] > nowMs() ? (int)$r['hits'] : 0;
}
