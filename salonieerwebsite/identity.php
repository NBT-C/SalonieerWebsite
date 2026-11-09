<?php
declare(strict_types=1);
// METON 2.46 (owner spec 2026-11-08 #2): one METON account for the website and the app.
//  * Every website user (this SQLite) is linked one-to-one to a METON account in Supabase (users.account_id here,
//    salonieer_private.website_accounts there). Signing in (email OR phone + password), signing up, a forgotten or new
//    password, Google, and the account's email / phone / linked accounts go through that account (website_account_*),
//    so the website and the app accept the same identifiers and the same password.
//  * Users from before move once: those whose password is a bcrypt hash right away (identityImport), the others (an
//    older format) at their next sign-in, with the password they type. Until a user has moved it signs in as before.
//  * An account that signs in here for the first time gets its website user. One without an email adds and confirms
//    one first (billing and the website's emails need it). A website user from before is attached to an account only
//    when that account signed in itself AND has confirmed the same email. Nothing is ever matched by name.
//  * METON_IDENTITY=off in the private .env switches all of it off (the website signs in on its own, as before).
if (!defined('SALONIEER')) { http_response_code(404); exit; }

function identityOn(): bool { return supabaseReady() && strtolower((string)(paddleEnv('METON_IDENTITY') ?? 'on')) !== 'off'; }

// A website_account_* call; an unreachable database answers 503 (serviceUnavailable).
function idCall(string $fn, array $args): array {
    try { $r = sbRpc($fn, $args); }
    catch (Throwable $e) { error_log('METON identity '.$fn.': '.$e->getMessage()); fail(503, 'serviceUnavailable'); }
    return is_array($r) ? $r : [];
}
// The database's answer codes → the website's error codes (and the extras the page shows).
function idFail(array $r, ?string $field = null): never {
    $map = ['bad_credentials'=>[401,'invalidCredentials'], 'locked'=>[429,'loginLocked'], 'invalid_identifier'=>[400,'invalidIdentifier'],
        'invalid_email'=>[400,'invalidEmail'], 'email_taken'=>[409,'emailTaken'], 'phone_taken'=>[409,'phoneTaken'], 'invalid_phone'=>[400,'invalidPhone'],
        'too_soon'=>[429,'codeTooSoon'], 'too_many'=>[429,'codeTooMany'], 'wrong_code'=>[400,'wrongCode'], 'code_expired'=>[400,'codeExpired'],
        'no_code'=>[400,'codeExpired'], 'invalid_password'=>[400,'invalidPassword'], 'bad_password'=>[400,'wrongPassword'], 'same_password'=>[400,'samePassword'],
        'no_phone_codes'=>[409,'noPhoneCodes'], 'same_account'=>[400,'sameAccount'], 'link_expired'=>[400,'linkExpired'], 'link_blocked'=>[409,'linkBlocked'],
        'only_login'=>[409,'onlyLogin'], 'website_account'=>[409,'websiteEmailNeeded'], 'invalid_name'=>[400,'invalidFullName'],
        'link_disabled'=>[409,'linkDisabled']];
    [$status, $code] = $map[$r['code'] ?? ''] ?? [503, 'serviceUnavailable'];
    if ($code === 'serviceUnavailable') error_log('METON identity: unexpected answer '.substr(json_encode($r), 0, 300));
    if ($status === 429) header('Retry-After: '.(int)($r['retry_in'] ?? 900));
    sendJson($status, ['error'=>$code, 'field'=>$field, 'retryAfter'=>(int)($r['retry_in'] ?? 900)] + array_intersect_key($r, array_flip(['left','blockers'])));
}

// Name, email and gender follow the account (the country of a website user stays: its prices depend on it).
function idSync(array $u, array $acc): array {
    $name = trim((string)($acc['name'] ?? '')) ?: $u['full_name'];
    $email = strtolower((string)($acc['email'] ?? '')) ?: $u['email'];
    $gender = in_array($acc['gender'] ?? null, GENDERS, true) ? $acc['gender'] : ($u['gender'] ?? null);
    if ($email !== $u['email'] && one('SELECT 1 FROM users WHERE email=? AND id<>?', [$email, $u['id']])) $email = $u['email'];
    if ($name !== $u['full_name'] || $email !== $u['email'] || $gender !== ($u['gender'] ?? null)) {
        runSql('UPDATE users SET full_name=?,email=?,gender=? WHERE id=?', [$name, $email, $gender, $u['id']]);
        $u = one('SELECT * FROM users WHERE id=?', [$u['id']]);
    }
    return $u;
}

// The website user of an account: linked already, or attached / made now. null = the account has no email yet;
// 'confirm' = a website user from before has this email but the account never confirmed it; 'conflict' = taken.
function idUserFor(array $acc, string $password = ''): array|string|null {
    $u = one('SELECT * FROM users WHERE account_id=?', [$acc['id']]);
    if (!$u && !empty($acc['website_user_id'])) {
        $u = one('SELECT * FROM users WHERE id=?', [(int)$acc['website_user_id']]);
        if ($u) runSql('UPDATE users SET account_id=? WHERE id=?', [$acc['id'], $u['id']]);    // e.g. after linking two accounts
    }
    if ($u) return idSync($u, $acc);
    $email = strtolower((string)($acc['email'] ?? ''));
    if ($email === '') return null;
    $legacy = one('SELECT * FROM users WHERE email=?', [$email]);
    if ($legacy) {
        if (($legacy['account_id'] ?? null) !== null) return 'conflict';
        if (empty($acc['email_confirmed'])) return 'confirm';
        $m = idCall('website_account_map', ['p_website_user'=>(int)$legacy['id'], 'p_account'=>$acc['id']]);
        if (($m['status'] ?? '') !== 'ok') return 'conflict';
        runSql('UPDATE users SET account_id=? WHERE id=? AND account_id IS NULL', [$acc['id'], $legacy['id']]);
        return idSync(one('SELECT * FROM users WHERE id=?', [$legacy['id']]), $acc);
    }
    // A new website user for this account. Its password lives in the account; the copy here only serves a rollback.
    try {
        runSql('INSERT INTO users(username,full_name,email,country,region,password_hash,is_admin,gender,account_id) VALUES(?,?,?,?,?,?,0,?,?)',
            [generatedUsername($email), trim((string)($acc['name'] ?? '')) ?: 'METON', $email, preg_match('/^[A-Z]{2}$/D', (string)($acc['country'] ?? '')) ? $acc['country'] : '',
             '', $password !== '' ? password_hash($password, PASSWORD_DEFAULT) : null, in_array($acc['gender'] ?? null, GENDERS, true) ? $acc['gender'] : null, $acc['id']]);
    } catch (PDOException $e) { if (str_contains($e->getMessage(), 'UNIQUE constraint failed')) return 'conflict'; throw $e; }
    $id = (int)db()->lastInsertId();
    $m = idCall('website_account_map', ['p_website_user'=>$id, 'p_account'=>$acc['id']]);
    if (($m['status'] ?? '') !== 'ok') error_log('METON identity: map '.$id.': '.($m['code'] ?? 'failed'));
    return one('SELECT * FROM users WHERE id=?', [$id]);
}

// A website user from before moves to its METON account (the password just typed; the email unconfirmed).
function identityMoveOne(array $u, string $password): void {
    if (!identityOn() || ($u['account_id'] ?? null) !== null) return;
    try {
        $m = sbRpc('website_account_import_one', ['p_website_user'=>(int)$u['id'], 'p_email'=>$u['email'], 'p_password'=>$password,
            'p_name'=>$u['full_name'], 'p_gender'=>(string)($u['gender'] ?? ''), 'p_country'=>(string)$u['country']]);
        if (in_array($m['status'] ?? '', ['created','linked'], true) && !empty($m['account']['id'])) runSql('UPDATE users SET account_id=? WHERE id=?', [$m['account']['id'], $u['id']]);
        else error_log('METON identity: user '.(int)$u['id'].' stays as before: '.($m['code'] ?? 'unknown'));
    } catch (Throwable $e) { error_log('METON identity move: '.$e->getMessage()); }
}

// Every user from before whose password is a bcrypt hash moves at once (one pass, after a response).
function identityImport(): void {
    if (!identityOn() || setting('identity_import') === 'done' || !workerClaim('identity', 300)) return;
    try {
        $users = rows("SELECT id,email,password_hash,full_name,gender,country FROM users WHERE account_id IS NULL AND password_hash LIKE '$2%' ORDER BY id");
        foreach (array_chunk($users, 100) as $chunk) {
            $r = sbRpc('website_account_import', ['p_users'=>array_map(fn($u) => ['id'=>(int)$u['id'], 'email'=>$u['email'], 'hash'=>$u['password_hash'],
                'name'=>$u['full_name'], 'gender'=>(string)($u['gender'] ?? ''), 'country'=>(string)$u['country']], $chunk)]);
            foreach ((array)$r as $x) if (in_array($x['status'] ?? '', ['created','linked'], true) && !empty($x['account_id']))
                runSql('UPDATE users SET account_id=? WHERE id=? AND account_id IS NULL', [$x['account_id'], (int)$x['id']]);
        }
        saveSetting('identity_import', 'done');
    } catch (Throwable $e) { error_log('METON identity import: '.$e->getMessage()); }
    finally { workerRelease('identity'); }
}

// ── Signing in ───────────────────────────────────────────────────────────────────────────────────────────────────
// A sign-in that needs one more step first: an email to add (an account with a phone only) or to confirm (a website
// user from before has it). The browser keeps only the ticket (15 minutes).
function identityPendingTable(): void { db()->exec("CREATE TABLE IF NOT EXISTS signin_pending(token_hash TEXT PRIMARY KEY,account_id TEXT NOT NULL,mode TEXT NOT NULL,email TEXT NOT NULL DEFAULT '',password_hash TEXT,expires_at INTEGER NOT NULL)"); }
function identityPending(array $acc, string $mode, string $password, string $lang): never {
    identityPendingTable();
    runSql('DELETE FROM signin_pending WHERE expires_at<?', [nowMs()]);
    $t = token();
    runSql('INSERT INTO signin_pending(token_hash,account_id,mode,email,password_hash,expires_at) VALUES(?,?,?,?,?,?)',
        [digest($t), $acc['id'], $mode, strtolower((string)($acc['email'] ?? '')), password_hash($password, PASSWORD_DEFAULT), nowMs()+900000]);
    $out = ['step'=>$mode, 'ticket'=>$t];
    if ($mode === 'confirm') {
        $r = idCall('website_account_email_start', ['p_account'=>$acc['id'], 'p_email'=>$acc['email'], 'p_lang'=>$lang]);
        if (isset($r['error']) && ($r['code'] ?? '') !== 'too_soon') idFail($r);
        mailWorkAfterResponse(0);
        $out['email'] = $acc['email'];
    }
    sendJson(200, $out);
}
function identityPendingRow(array $d): array {
    identityPendingTable();
    $t = is_string($d['ticket'] ?? null) ? $d['ticket'] : '';
    $p = preg_match('/^[a-f0-9]{64}$/D', $t) ? one('SELECT * FROM signin_pending WHERE token_hash=? AND expires_at>?', [digest($t), nowMs()]) : false;
    if (!$p) fail(400, 'signinExpired');
    return $p;
}
// The finished sign-in: a session for the website user (made now if needed); a Google sign-in waiting for this
// account's password confirms the email Google proved.
function identityFinish(array $acc, array $user, string $password, array|false $session, string $identifier = ''): never {
    if ($password !== '' && (!$user['password_hash'] || !str_starts_with((string)$user['password_hash'], '$') || !password_verify($password, (string)$user['password_hash'])))
        runSql('UPDATE users SET password_hash=? WHERE id=?', [password_hash($password, PASSWORD_DEFAULT), $user['id']]);
    if ($identifier !== '' && ($proof = identityGoogleProof()) && hash_equals($proof, strtolower($identifier)) && empty($acc['email_confirmed'])) {
        idCall('website_account_confirm_email', ['p_account'=>$acc['id'], 'p_email'=>$proof]);
        identityGoogleProofClear();
    }
    $user = one('SELECT * FROM users WHERE id=?', [$user['id']]);
    sendJson(200, ['user'=>userDTO($user), 'csrf'=>newSession((int)$user['id'], $session)]);
}

function identityLogin(array|false $session): never {
    rateLimit('login-ip', 40, 900); $d = body();
    $raw = cleanText($d['identifier'] ?? $d['email'] ?? null); $password = $d['password'] ?? null;
    $dial = preg_replace('/\D/', '', (string)($d['dial'] ?? ''));
    $isEmail = str_contains($raw, '@'); $ident = $isEmail ? strtolower($raw) : $raw;
    if ($ident === '' || !is_string($password) || $password === '' || strlen($password) > 512) fail(401, 'invalidCredentials');
    if ($isEmail ? !validEmail($ident) : !preg_match('/^\+[1-9][0-9]{6,14}$/D', $ident)) fail(401, 'invalidCredentials');
    $idBucket = failureBucket($isEmail ? 'email' : 'phone', $ident); $ipBucket = failureBucket('ip', $_SERVER['REMOTE_ADDR'] ?? 'unknown');
    if ($wait = lockedFor($idBucket)) { header('Retry-After: '.$wait); sendJson(429, ['error'=>'loginLocked', 'retryAfter'=>$wait, 'field'=>null]); }
    requireChallengeIf(failureState($idBucket)['fails'] >= CHALLENGE_AFTER || failureState($ipBucket)['fails'] >= 10, $d);
    $acc = null; $user = false;
    try { $r = sbRpc('website_account_login', ['p_identifier'=>$ident, 'p_password'=>$password, 'p_dial'=>$dial]); }
    catch (Throwable $e) { error_log('METON identity login: '.$e->getMessage()); $r = null; }
    if (is_array($r) && ($r['status'] ?? '') === 'ok') $acc = $r['account'];
    elseif (is_array($r) && ($r['code'] ?? '') === 'locked') { header('Retry-After: 900'); sendJson(429, ['error'=>'loginLocked', 'retryAfter'=>900, 'field'=>null]); }
    if ($acc) {
        $u = idUserFor($acc, $password);
        if ($u === null || $u === 'confirm') { clearFailures($idBucket); identityPending($acc, $u === null ? 'email' : 'confirm', $password, siteLang($d['lang'] ?? null)); }
        if ($u === 'conflict') { error_log('METON identity: account '.$acc['id'].' and a website user disagree'); fail(409, 'accountConflict'); }
        $user = $u;
    } elseif ($isEmail) {
        // A website user that has not moved yet (or the database could not be reached): its password kept here.
        $found = one('SELECT * FROM users WHERE email=? AND account_id IS NULL', [$ident]);
        $ok = $found ? verifyHash($password, $found['password_hash']) : (password_verify($password, DUMMY_HASH) && false);
        if ($ok) { $user = $found; identityMoveOne($found, $password); }
    } else password_verify($password, DUMMY_HASH);
    if (!$user) { recordFailure($idBucket); recordFailure($ipBucket); fail(401, 'invalidCredentials'); }
    clearFailures($idBucket);
    if (random_int(1, 100) === 1) runSql('DELETE FROM sessions WHERE expires_at<?', [nowMs()]);
    if (!$acc) {   // not moved: the website's own copy of the password, as before
        if ($user['password_hash'] && str_starts_with($user['password_hash'], '$') && password_needs_rehash($user['password_hash'], PASSWORD_DEFAULT))
            runSql('UPDATE users SET password_hash=? WHERE id=?', [password_hash($password, PASSWORD_DEFAULT), $user['id']]);
        sendJson(200, ['user'=>userDTO($user), 'csrf'=>newSession((int)$user['id'], $session)]);
    }
    identityFinish($acc, $user, $password, $session, $ident);
}
// Step 2 of a pending sign-in: the email to add (or the account's own, to confirm) gets a code.
function identityLoginEmail(): never {
    rateLimit('signin-email', 20, 3600); $d = body(); $p = identityPendingRow($d);
    $email = $p['mode'] === 'confirm' ? $p['email'] : strtolower(cleanText($d['email'] ?? null));
    if (!validEmail($email)) fail(400, 'invalidEmail', 'email');
    $r = idCall('website_account_email_start', ['p_account'=>$p['account_id'], 'p_email'=>$email, 'p_lang'=>siteLang($d['lang'] ?? null)]);
    if (isset($r['error'])) idFail($r, 'email');
    if ($p['mode'] === 'email') runSql('UPDATE signin_pending SET email=? WHERE token_hash=?', [$email, $p['token_hash']]);
    mailWorkAfterResponse(0);
    sendJson(200, ['sent'=>true, 'email'=>$email]);
}
// Step 3: the code confirms the email; the account now has its website user and signs in.
function identityLoginVerify(array|false $session): never {
    rateLimit('signin-verify', 30, 3600); $d = body(); $p = identityPendingRow($d);
    $r = idCall('website_account_email_verify', ['p_account'=>$p['account_id'], 'p_code'=>preg_replace('/\D/', '', (string)($d['code'] ?? ''))]);
    if (isset($r['error'])) idFail($r, 'code');
    $acc = $r['account'] ?? null;
    if (!$acc) fail(503, 'serviceUnavailable');
    $u = idUserFor($acc);
    if (!is_array($u)) fail(409, 'accountConflict');
    runSql('DELETE FROM signin_pending WHERE token_hash=?', [$p['token_hash']]);
    if ($p['password_hash'] && (!$u['password_hash'] || !str_starts_with((string)$u['password_hash'], '$'))) runSql('UPDATE users SET password_hash=? WHERE id=?', [$p['password_hash'], $u['id']]);
    identityFinish($acc, $u, '', $session);
}

// ── Signing up ───────────────────────────────────────────────────────────────────────────────────────────────────
// The website's own form and checks; the account is made first, then its website user. A code to confirm the email
// goes out at once (the person can confirm it from the account page; the app asks for it at its first sign-in).
function identityRegister(array|false $session): never {
    rateLimit('registration', 12, 3600); $d = body();
    if (($d['website'] ?? '') !== '') fail(400, 'invalidRequest');
    requireChallengeIf(recentHits('registration') > 3, $d);
    $v = validateRegistration($d);
    ensureAvailable($v);
    $r = idCall('website_account_register', ['p_email'=>$v['email'], 'p_password'=>$d['password'], 'p_name'=>$v['fullName'], 'p_gender'=>$v['gender'],
        'p_country'=>$v['country'], 'p_lang'=>siteLang($d['lang'] ?? null)]);
    if (($r['status'] ?? '') !== 'ok') { if (($r['code'] ?? '') === 'email_taken') fail(409, 'accountUnavailable'); idFail($r, ($r['code'] ?? '') === 'invalid_name' ? 'fullName' : 'password'); }
    $acc = $r['account'];
    db()->exec('BEGIN IMMEDIATE');
    try { ensureAvailable($v); $id = createUser($v, $d['password']); runSql('UPDATE users SET account_id=? WHERE id=?', [$acc['id'], $id]); db()->exec('COMMIT'); }
    catch (Throwable $e) { db()->exec('ROLLBACK'); throw $e; }
    $m = idCall('website_account_map', ['p_website_user'=>$id, 'p_account'=>$acc['id']]);
    if (($m['status'] ?? '') !== 'ok') error_log('METON identity: map '.$id.': '.($m['code'] ?? 'failed'));
    mailWorkAfterResponse(0);
    sendJson(201, ['user'=>userDTO(one('SELECT * FROM users WHERE id=?', [$id])), 'csrf'=>newSession($id, $session)]);
}

// ── Google proof: Google showed this browser owns an email whose account never confirmed it ─────────────────────────
function identityGoogleProofCookie(): string { return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? '__Host-meton-gproof' : 'meton_gproof'; }
function identityGoogleProofSet(string $email): void {
    db()->exec('CREATE TABLE IF NOT EXISTS google_proofs(token_hash TEXT PRIMARY KEY,email TEXT NOT NULL,expires_at INTEGER NOT NULL)');
    runSql('DELETE FROM google_proofs WHERE expires_at<? OR email=?', [nowMs(), $email]);
    $t = token();
    runSql('INSERT INTO google_proofs(token_hash,email,expires_at) VALUES(?,?,?)', [digest($t), $email, nowMs() + 900000]);
    setcookie(identityGoogleProofCookie(), $t, ['expires'=>time() + 900, 'path'=>'/', 'secure'=>!empty($_SERVER['HTTPS']), 'httponly'=>true, 'samesite'=>'Lax']);
}
function identityGoogleProof(): ?string {
    $v = $_COOKIE[identityGoogleProofCookie()] ?? '';
    if (!is_string($v) || !preg_match('/^[a-f0-9]{64}$/D', $v)) return null;
    db()->exec('CREATE TABLE IF NOT EXISTS google_proofs(token_hash TEXT PRIMARY KEY,email TEXT NOT NULL,expires_at INTEGER NOT NULL)');
    $r = one('SELECT email FROM google_proofs WHERE token_hash=? AND expires_at>?', [digest($v), nowMs()]);
    return $r ? (string)$r['email'] : null;
}
function identityGoogleProofClear(): void {
    $v = $_COOKIE[identityGoogleProofCookie()] ?? '';
    if (is_string($v) && $v !== '') runSql('DELETE FROM google_proofs WHERE token_hash=?', [digest($v)]);
    setcookie(identityGoogleProofCookie(), '', ['expires'=>time() - 3600, 'path'=>'/', 'secure'=>!empty($_SERVER['HTTPS']), 'httponly'=>true, 'samesite'=>'Lax']);
}

// ── The account page: how this account signs in ───────────────────────────────────────────────────────────────────
// The signed-in website user's account (a merged account follows to the one it was linked into).
function identityAccountOf(array $user): array {
    if (empty($user['account_id'])) fail(409, 'accountNotMoved');
    $acc = idCall('website_account_get', ['p_account'=>$user['account_id']]);
    if (($acc['status'] ?? '') === 'merged' && !empty($acc['merged_into'])) {
        $acc = idCall('website_account_get', ['p_account'=>$acc['merged_into']]);
        if (!empty($acc['id'])) runSql('UPDATE users SET account_id=? WHERE id=?', [$acc['id'], $user['id']]);
    }
    if (empty($acc['id']) || ($acc['status'] ?? '') !== 'active') fail(409, 'accountNotMoved');
    return $acc;
}
function identityView(array $acc): array {
    return ['email'=>$acc['email'] ?? null, 'emailConfirmed'=>(bool)($acc['email_confirmed'] ?? false), 'emailPending'=>$acc['email_pending'] ?? null,
        'phone'=>$acc['phone'] ?? null, 'phoneConfirmed'=>(bool)($acc['phone_confirmed'] ?? false), 'phoneLogin'=>(bool)($acc['phone_login'] ?? false),
        'hasPassword'=>(bool)($acc['has_password'] ?? true), 'phoneCodes'=>(bool)($acc['phone_codes'] ?? false), 'google'=>metonGoogleReady()];
}
function identityApi(string $method, string $path, array|false $user): never {
    requireUser($user);
    $uid = (string)$user['id'];
    if ($method === 'GET' && $path === '/api/account/identity') {
        $acc = identityAccountOf($user);
        $user = idSync(one('SELECT * FROM users WHERE id=?', [$user['id']]), $acc);
        sendJson(200, ['identity'=>identityView($acc), 'user'=>userDTO($user)]);
    }
    $acc = identityAccountOf($user); $d = body(); $lang = siteLang($d['lang'] ?? null);
    $done = function (array $r) use ($user, $acc): never {
        $fresh = isset($r['account']['id']) ? $r['account'] : idCall('website_account_get', ['p_account'=>$acc['id']]);
        $u = idSync(one('SELECT * FROM users WHERE id=?', [$user['id']]), $fresh);
        sendJson(200, ['identity'=>identityView($fresh), 'user'=>userDTO($u)] + array_intersect_key($r, array_flip(['status','email','phone'])));
    };
    if ($method === 'POST' && $path === '/api/account/email') {
        rateLimit('account-email', 10, 3600, $uid);
        $r = idCall('website_account_email_start', ['p_account'=>$acc['id'], 'p_email'=>strtolower(cleanText($d['email'] ?? null)), 'p_lang'=>$lang]);
        if (isset($r['error'])) idFail($r, 'email');
        mailWorkAfterResponse(0); $done($r);
    }
    if ($method === 'POST' && $path === '/api/account/email/verify') {
        rateLimit('account-email-code', 20, 3600, $uid);
        $r = idCall('website_account_email_verify', ['p_account'=>$acc['id'], 'p_code'=>preg_replace('/\D/', '', (string)($d['code'] ?? ''))]);
        if (isset($r['error'])) idFail($r, 'code');
        $done($r);
    }
    if ($method === 'POST' && $path === '/api/account/phone') {
        rateLimit('account-phone', 10, 3600, $uid);
        $r = idCall('website_account_phone_start', ['p_account'=>$acc['id'], 'p_phone'=>(string)($d['phone'] ?? ''), 'p_dial'=>preg_replace('/\D/', '', (string)($d['dial'] ?? '')), 'p_lang'=>$lang]);
        if (isset($r['error'])) idFail($r, 'phone');
        if (($r['status'] ?? '') === 'code_sent') mailWorkAfterResponse(0);
        $done($r);
    }
    if ($method === 'POST' && $path === '/api/account/phone/verify') {
        rateLimit('account-phone-code', 20, 3600, $uid);
        $r = idCall('website_account_phone_verify', ['p_account'=>$acc['id'], 'p_code'=>preg_replace('/\D/', '', (string)($d['code'] ?? ''))]);
        if (isset($r['error'])) idFail($r, 'code');
        $done($r);
    }
    if ($method === 'POST' && $path === '/api/account/link') {
        rateLimit('account-link', 10, 3600, $uid);
        $id = cleanText($d['identifier'] ?? null);
        $r = idCall('website_account_link_start', ['p_account'=>$acc['id'], 'p_identifier'=>str_contains($id, '@') ? strtolower($id) : $id,
            'p_password'=>(string)($d['password'] ?? ''), 'p_dial'=>preg_replace('/\D/', '', (string)($d['dial'] ?? ''))]);
        if (isset($r['error'])) idFail($r, 'identifier');
        sendJson(200, ['ticket'=>$r['ticket'], 'other'=>$r['other'] ?? null, 'blockers'=>$r['blockers'] ?? []]);
    }
    if ($method === 'POST' && $path === '/api/account/link/finish') {
        rateLimit('account-link', 10, 3600, $uid);
        $r = idCall('website_account_link_finish', ['p_account'=>$acc['id'], 'p_ticket'=>(string)($d['ticket'] ?? '')]);
        if (isset($r['error'])) idFail($r);
        $done($r + ['status'=>'linked']);
    }
    fail(404, 'notFound');
}

// The app asks the website to send what it just queued (a code) right away; it can only make queued mail go out.
function identityKick(): never {
    rateLimit('outbox-kick', 60, 3600);
    mailWorkAfterResponse(3);
    header('Access-Control-Allow-Origin: *');
    sendJson(200, ['ok'=>true]);
}
