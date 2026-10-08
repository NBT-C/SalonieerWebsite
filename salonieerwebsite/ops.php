<?php
declare(strict_types=1);
// Admin operations, loaded by index.php:
//   * application review checks: every application in the admin list carries the reasons it may need a closer look,
//     split into "invalid" (information that can't be right) and "review" (plausible, but a person should check);
//   * problem reports from subscribed salon owners (website Account page; the app sends its own through Supabase);
//   * the optional automatic deletion of salons that stayed suspended (settings in the admin panel, run by the worker).
if (!defined('SALONIEER')) { http_response_code(404); exit; }

use libphonenumber\PhoneNumberUtil;
use libphonenumber\PhoneNumberType;

// ---- Application review ---------------------------------------------------------------------------------------------
const DISPOSABLE_EMAIL_DOMAINS = ['mailinator.com','guerrillamail.com','guerrillamail.net','sharklasers.com','10minutemail.com','tempmail.com','temp-mail.org',
    'yopmail.com','trashmail.com','getnada.com','dispostable.com','maildrop.cc','throwawaymail.com','fakeinbox.com','mohmal.com','emailondeck.com','tempail.com','mintemail.com'];
const REPORT_CATEGORIES = ['bug','booking','billing','account','other'];

// Israeli/Palestinian ID numbers (Teudat Zehut, Palestinian ID) carry a check digit: weights 1,2,1,2… over 9 digits,
// two-digit products are summed digit by digit, and the total must be a multiple of 10.
function israeliIdValid(string $id): bool {
    if (!preg_match('/^\d{5,9}$/D', $id)) return false;
    $id = str_pad($id, 9, '0', STR_PAD_LEFT); $sum = 0;
    for ($i = 0; $i < 9; $i++) { $n = (int)$id[$i] * ($i % 2 + 1); $sum += $n > 9 ? $n - 9 : $n; }
    return $sum % 10 === 0;
}
// A subscriber number nobody would really have: one digit repeated, a straight run (1234567 / 9876543), only two
// different digits, or a short block repeated (121212, 123123). Checked on the last 7 digits (after the operator code).
function phoneLooksRandom(string $e164): bool {
    $d = substr(preg_replace('/\D/', '', $e164), -7);
    if (strlen($d) < 7) return true;
    if (count(array_unique(str_split($d))) <= 2) return true;
    foreach ([1, 9] as $step) {
        $run = 1;
        for ($i = 1; $i < strlen($d); $i++) { $run = ((int)$d[$i] - (int)$d[$i-1] + 10) % 10 === $step ? $run + 1 : 1; if ($run >= 6) return true; }
    }
    if (preg_match('/(\d)\1{4,}/', $d)) return true;
    if (preg_match('/(\d{2})\1\1|(\d{3})\2/', $d)) return true;
    return false;
}
// Keyboard mashing or a name without any real word: "asdfgh", "qwerty", "xxxxx", "bcdfgh", only digits/symbols.
function salonNameLooksRandom(string $name): bool {
    $n = mb_strtolower(trim($name));
    if (!preg_match('/\p{L}/u', $n)) return true;
    if (preg_match('/(.)\1{3,}/u', $n)) return true;
    foreach (['qwert','werty','asdf','sdfg','dfgh','zxcv','xcvb','hjkl','yuio','uiop','ghjk','1234'] as $row) if (str_contains($n, $row)) return true;
    // A long Latin word without vowels (Arabic/Hebrew are written without them, so only Latin is checked).
    foreach (preg_split('/[^a-z]+/', $n) as $w) if (strlen($w) >= 6 && !preg_match('/[aeiouy]/', $w)) return true;
    return false;
}
function phoneDigits(?string $p): string { return preg_replace('/\D/', '', (string)$p); }

// Adds 'review' => ['level' => 'invalid'|'review'|'clear', 'flags' => [['code','level','vars'], …]] to each application.
function applicationReviewFlags(array $apps): array {
    $identity = [];
    foreach (rows('SELECT application_id,user_id,identity_hash FROM application_identity') as $r) $identity[$r['application_id']] = $r;
    $byPhone = []; $byId = []; $byUser = [];
    foreach ($apps as $a) {
        $u = (int)($a['websiteUserId'] ?? 0);
        foreach (array_unique(array_filter([phoneDigits($a['phone'] ?? ''), phoneDigits($a['ownerPhone'] ?? '')])) as $p) $byPhone[substr($p, -9)][] = $a;
        if (isset($identity[$a['id']])) $byId[$identity[$a['id']]['identity_hash']][] = $a;
        $byUser[$u][] = $a;
    }
    $util = PhoneNumberUtil::getInstance();
    $others = static fn(array $list, array $a) => array_values(array_filter($list, static fn($x) => (int)($x['websiteUserId'] ?? 0) !== (int)($a['websiteUserId'] ?? 0)));
    $refs = static fn(array $list) => implode(', ', array_slice(array_unique(array_column($list, 'id')), 0, 3)).(count($list) > 3 ? ' …' : '');
    foreach ($apps as &$a) {
        $flags = [];
        $add = static function (string $code, string $level, array $vars = []) use (&$flags) { $flags[] = ['code'=>$code, 'level'=>$level, 'vars'=>$vars]; };
        $country = (string)($a['country'] ?? '');
        // ID number
        $idn = (string)($a['identityNumber'] ?? '');
        if ($idn !== '') {
            if (ctype_digit($idn) && obviousFakeId($idn)) $add('idPattern', 'invalid');
            elseif (in_array($country, ['IL','PS'], true) && ctype_digit($idn) && strlen($idn) <= 9 && !israeliIdValid($idn)) $add('idChecksum', 'invalid');
        }
        $hash = $identity[$a['id']]['identity_hash'] ?? null;
        if ($hash && ($dup = $others($byId[$hash] ?? [], $a))) $add('idDuplicate', 'review', ['refs'=>$refs($dup)]);
        // Phone
        $phone = (string)($a['phone'] ?? '');
        if ($phone !== '') {
            try {
                $n = $util->parse($phone, null);
                if (!$util->isValidNumber($n)) $add('phoneInvalid', 'invalid');
                else {
                    $type = $util->getNumberType($n);
                    if (!in_array($type, [PhoneNumberType::MOBILE, PhoneNumberType::FIXED_LINE_OR_MOBILE], true)) $add('phoneNotMobile', 'review');
                    $region = (string)$util->getRegionCodeForNumber($n);
                    $same = $region === $country || (in_array($region, ['IL','PS'], true) && in_array($country, ['IL','PS'], true));
                    if ($country !== '' && $region !== '' && !$same) $add('phoneCountry', 'review', ['phoneCountry'=>$region, 'country'=>$country]);
                }
            } catch (Throwable) { $add('phoneInvalid', 'invalid'); }
            if (phoneLooksRandom($phone)) $add('phoneRandom', 'review');
        }
        $dupPhones = [];
        foreach (array_unique(array_filter([phoneDigits($phone), phoneDigits($a['ownerPhone'] ?? '')])) as $p) $dupPhones = array_merge($dupPhones, $others($byPhone[substr($p, -9)] ?? [], $a));
        if ($dupPhones) $add('phoneDuplicate', 'review', ['refs'=>$refs($dupPhones)]);
        // Salon name, email, volume
        if (salonNameLooksRandom((string)($a['salonName'] ?? ''))) $add('nameRandom', 'review');
        $domain = strtolower(substr(strrchr((string)($a['email'] ?? ''), '@') ?: '', 1));
        if ($domain !== '' && in_array($domain, DISPOSABLE_EMAIL_DOMAINS, true)) $add('emailDisposable', 'review', ['domain'=>$domain]);
        $created = strtotime((string)($a['createdAt'] ?? '')) ?: 0;
        $burst = array_filter($byUser[(int)($a['websiteUserId'] ?? 0)] ?? [], static fn($x) => abs((strtotime((string)($x['createdAt'] ?? '')) ?: 0) - $created) <= 86400);
        if (count($burst) >= 4) $add('manyApplications', 'review', ['n'=>count($burst)]);
        $level = in_array('invalid', array_column($flags, 'level'), true) ? 'invalid' : ($flags ? 'review' : 'clear');
        $a['review'] = ['level'=>$level, 'flags'=>$flags];
    }
    return $apps;
}

// ---- Problem reports ----------------------------------------------------------------------------------------------------
function problemReportCreate(array $user, string $app, array $d): array {
    $category = in_array($d['category'] ?? null, REPORT_CATEGORIES, true) ? $d['category'] : null;
    if ($category === null) fail(400, 'invalidRequest', 'category');
    $message = is_string($d['message'] ?? null) ? trim(preg_replace('/[\x00-\x08\x0b\x0c\x0e-\x1f]/u', '', $d['message'])) : '';
    if (mb_strlen($message) < 10 || mb_strlen($message) > 2000) fail(400, 'reportMessageInvalid', 'message');
    try {
        $r = sbRpc('website_problem_report_create', ['p_user'=>(int)$user['id'], 'p_app'=>$app, 'p_name'=>$user['full_name'], 'p_email'=>$user['email'], 'p_category'=>$category, 'p_message'=>$message]);
    } catch (Throwable $e) { supabaseFail($e); }
    mailWorkAfterResponse(0);
    return $r;
}

// ---- Suspended-salon cleanup ----------------------------------------------------------------------------------------------
// Off until the admin switches it on. Eligibility is counted from the suspension date that the database records when
// a salon is suspended (and clears when it is reactivated), so a salon that reopened is never deleted.
function cleanupSettings(): array {
    $s = setting('salon_cleanup');
    return ['enabled'=>is_array($s) && !empty($s['enabled']), 'months'=>is_array($s) ? max(1, min(24, (int)($s['months'] ?? 2))) : 2,
        'updatedBy'=>is_array($s) ? ($s['updatedBy'] ?? null) : null, 'updatedAt'=>is_array($s) ? ($s['updatedAt'] ?? null) : null];
}
function cleanupSave(array $d, array $user): array {
    if (!is_bool($d['enabled'] ?? null) || !is_int($d['months'] ?? null) || $d['months'] < 1 || $d['months'] > 24) fail(400, 'invalidRequest');
    saveSetting('salon_cleanup', ['enabled'=>$d['enabled'], 'months'=>$d['months'], 'updatedBy'=>$user['email'], 'updatedAt'=>gmdate('c')]);
    return cleanupSettings();
}
// Runs at most every 6 hours from the background worker (or right away when the admin asks). Deletes up to 5 salons
// per run; the rest follow on the next runs.
function cleanupWork(bool $force = false): array {
    $s = cleanupSettings();
    if (!$s['enabled']) return ['skipped'=>'disabled'];
    $last = setting('salon_cleanup_last');
    if (!$force && is_array($last) && ($last['at'] ?? 0) > time() - 6 * 3600) return ['skipped'=>'too soon'];
    $r = sbRpc('website_cleanup_suspended', ['p_months'=>$s['months'], 'p_apply'=>true, 'p_limit'=>5]);
    saveSetting('salon_cleanup_last', ['at'=>time(), 'months'=>$s['months'], 'deleted'=>array_column($r['deleted'] ?? [], 'slug'), 'failed'=>$r['failed'] ?? []]);
    if (!empty($r['deleted'])) mailWorkAfterResponse(0);
    return $r;
}
function cleanupOverview(): array {
    $s = cleanupSettings();
    $last = setting('salon_cleanup_last');
    return ['settings'=>$s, 'suspended'=>sbRpc('website_suspended_salons', ['p_months'=>$s['months']]) ?? [],
        'lastRun'=>is_array($last) ? ['at'=>gmdate('c', (int)$last['at']), 'deleted'=>$last['deleted'] ?? [], 'failed'=>$last['failed'] ?? []] : null];
}
