<?php
declare(strict_types=1);
// Warnings and deprecation notices go to the PHP error log, never into a page or a JSON response.
ini_set('display_errors','0');
ini_set('log_errors','1');

// Upload the contents of this folder into your document root (htdocs on InfinityFree).
// The private folder (database + encryption key) is created automatically on first visit:
// beside the document root when the host allows it, otherwise inside it at /salonieer-private (blocked from the web).
// Open /setup once to create the first admin account using SETUP_KEY below.
const SETUP_KEY = 'dd48a99c97b7af80d9';
const SESSION_SECONDS = 604800;
// Hash of a random string; checked against when an email has no account, so both paths take the same time.
const DUMMY_HASH = '$2y$10$5nsRln6fSBcJLXi2knBco..BlfDadb83eFkpJHnAIUFoPusRAHsGS';
const STATUSES = ['pending','in_review','needs_info','approved','declined'];
const PLANS = ['basic','pro','business','enterprise'];
// October 2026: Business is no longer sold (salons already on it keep it); Basic has one optional feature.
const OFFERED_PLANS = ['basic','pro','enterprise'];
const BASIC_OPTIONS = ['loyalty','smart_waitlist'];
const PRICE_TIER = 'usd2026';
define('SALONIEER',true);
require __DIR__.'/paddle.php';
if (is_file(__DIR__.'/vendor/autoload.php')) require_once __DIR__.'/vendor/autoload.php';
require __DIR__.'/security.php';
require __DIR__.'/supabase.php';
require __DIR__.'/mail.php';
require __DIR__.'/billing.php';
require __DIR__.'/ops.php';
// METON 2.44: business booking pages, private booking links, My bookings.
require __DIR__.'/booking.php';
require __DIR__.'/identity.php';

final class HttpFailure extends RuntimeException {
    public function __construct(public int $status, public string $errorCode, public ?string $field = null) {
        parent::__construct($errorCode);
    }
}
function fail(int $status, string $code, ?string $field = null): never { throw new HttpFailure($status, $code, $field); }
function db(): PDO {
    static $db;
    if ($db instanceof PDO) return $db;
    if (!in_array('sqlite',PDO::getAvailableDrivers(),true)) throw new RuntimeException('PHP PDO SQLite driver is not available on this host.');
    $private = privateDir();
    $file = $private.'/salonieer.sqlite';
    $db = new PDO('sqlite:' . $file, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC, PDO::ATTR_TIMEOUT => 5]);
    $db->exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
    if ((int)$db->query('PRAGMA user_version')->fetchColumn() < 1) {
        $db->exec(<<<SQL
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT NOT NULL UNIQUE COLLATE NOCASE,full_name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,phone TEXT NOT NULL UNIQUE,country TEXT NOT NULL,region TEXT NOT NULL DEFAULT '',password_hash TEXT,is_admin INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,csrf TEXT NOT NULL,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rate_limits(bucket TEXT PRIMARY KEY,hits INTEGER NOT NULL,reset_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sin_codes(code_hash TEXT PRIMARY KEY,used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,expires_at INTEGER,created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS applications(id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,submission_key TEXT NOT NULL,salon_name TEXT NOT NULL,identity_encrypted TEXT NOT NULL,identity_last4 TEXT NOT NULL,logo BLOB NOT NULL,logo_type TEXT NOT NULL,plan TEXT NOT NULL,quote_json TEXT NOT NULL,payment_method TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT,UNIQUE(user_id,submission_key));
CREATE TABLE IF NOT EXISTS geo_cache(ip_hash TEXT PRIMARY KEY,country TEXT,expires_at INTEGER NOT NULL);
PRAGMA user_version=1;
SQL);
    }
    if ((int)$db->query('PRAGMA user_version')->fetchColumn() < 2) {
        // Paddle mirror, written only by verified webhooks (paddle.php). paddle_updated_at = Paddle's own updated_at, used to drop stale deliveries.
        $db->exec(<<<SQL
CREATE TABLE IF NOT EXISTS customers(customer_id TEXT PRIMARY KEY,email TEXT NOT NULL,user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,paddle_updated_at TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS customers_user ON customers(user_id);
CREATE INDEX IF NOT EXISTS customers_email ON customers(email);
CREATE TABLE IF NOT EXISTS subscriptions(subscription_id TEXT PRIMARY KEY,customer_id TEXT NOT NULL REFERENCES customers(customer_id),status TEXT NOT NULL,price_id TEXT NOT NULL,product_id TEXT NOT NULL,product_name TEXT,billing_interval TEXT,billing_frequency INTEGER,scheduled_change_action TEXT,scheduled_change_at TEXT,current_period_ends_at TEXT,next_billed_at TEXT,canceled_at TEXT,paddle_updated_at TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS subscriptions_customer ON subscriptions(customer_id);
CREATE TABLE IF NOT EXISTS transactions(transaction_id TEXT PRIMARY KEY,customer_id TEXT,subscription_id TEXT,status TEXT NOT NULL,currency TEXT NOT NULL,total TEXT NOT NULL,invoice_number TEXT,billed_at TEXT,paddle_updated_at TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (datetime('now')),updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS transactions_subscription ON transactions(subscription_id);
PRAGMA user_version=2;
SQL);
    }
    if ((int)$db->query('PRAGMA user_version')->fetchColumn() < 3) {
        // Pull sync position in Paddle's event stream (paddleSync in paddle.php).
        $db->exec(<<<SQL
CREATE TABLE IF NOT EXISTS paddle_sync(id INTEGER PRIMARY KEY CHECK(id=1),cursor TEXT,failed_event TEXT,failures INTEGER NOT NULL DEFAULT 0,locked_until INTEGER NOT NULL DEFAULT 0,last_run INTEGER NOT NULL DEFAULT 0);
PRAGMA user_version=3;
SQL);
    }
    if ((int)$db->query('PRAGMA user_version')->fetchColumn() < 4) {
        // Site-wide settings written by admins (the Theme Manager stores the active theme and custom themes here).
        $db->exec(<<<SQL
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT (datetime('now')));
PRAGMA user_version=4;
SQL);
    }
    if ((int)$db->query('PRAGMA user_version')->fetchColumn() < 5) {
        // Normalized phone (E.164) and ID fingerprints for duplicate checks, sign-in failure tracking, used bot challenges.
        $cols=array_column($db->query('PRAGMA table_info(users)')->fetchAll(),'name');
        if (!in_array('phone_norm',$cols,true)) $db->exec('ALTER TABLE users ADD COLUMN phone_norm TEXT');
        $cols=array_column($db->query('PRAGMA table_info(applications)')->fetchAll(),'name');
        if (!in_array('identity_hash',$cols,true)) $db->exec('ALTER TABLE applications ADD COLUMN identity_hash TEXT');
        $db->exec(<<<SQL
CREATE INDEX IF NOT EXISTS users_phone_norm ON users(phone_norm);
CREATE INDEX IF NOT EXISTS applications_identity ON applications(identity_hash);
CREATE TABLE IF NOT EXISTS auth_failures(bucket TEXT PRIMARY KEY,fails INTEGER NOT NULL,locked_until INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS used_challenges(id TEXT PRIMARY KEY,expires_at INTEGER NOT NULL);
SQL);
        foreach ($db->query('SELECT id,phone,country FROM users WHERE phone_norm IS NULL')->fetchAll() as $u)
            $db->prepare('UPDATE users SET phone_norm=? WHERE id=?')->execute([legacyPhoneKey($u['phone'],$u['country']),$u['id']]);
        foreach ($db->query('SELECT a.id,a.identity_encrypted,u.country FROM applications a JOIN users u ON u.id=a.user_id WHERE a.identity_hash IS NULL')->fetchAll() as $a) {
            try { $raw=normalizeIdNumber(decryptId($a['identity_encrypted'])); $hash=idFingerprint(canonicalIdNumber($raw,$a['country'])??$raw,$a['country']); }
            catch (Throwable $e) { error_log('Salonieer ID backfill: '.$e->getMessage()); continue; }
            $db->prepare('UPDATE applications SET identity_hash=? WHERE id=?')->execute([$hash,$a['id']]);
        }
        $db->exec('PRAGMA user_version=5');
    }
    if ((int)$db->query('PRAGMA user_version')->fetchColumn() < 6) {
        // Applications now live in Supabase (shared with the Salonieer app). The ID number stays on this server only:
        // encrypted, with its fingerprint for the one-application-per-ID rule. The old applications table is kept for
        // the one-time migration and as a record.
        $db->exec(<<<SQL
CREATE TABLE IF NOT EXISTS application_identity(application_id TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,identity_encrypted TEXT NOT NULL,identity_hash TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS application_identity_hash ON application_identity(identity_hash);
PRAGMA user_version=6;
SQL);
    }
    if ((int)$db->query('PRAGMA user_version')->fetchColumn() < 7) {
        // Sign-up is email only: the phone moves to each application, so it becomes optional and may repeat.
        // SQLite can't drop a column constraint, so the table is rebuilt (foreign keys off, as SQLite documents).
        $db->exec('PRAGMA foreign_keys=OFF');
        $db->exec('BEGIN IMMEDIATE');
        try {
            if ((int)$db->query('PRAGMA user_version')->fetchColumn() < 7) {
                $db->exec(<<<SQL
CREATE TABLE users_v7(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT NOT NULL UNIQUE COLLATE NOCASE,full_name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,phone TEXT,country TEXT NOT NULL,region TEXT NOT NULL DEFAULT '',password_hash TEXT,is_admin INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT (datetime('now')),phone_norm TEXT);
INSERT INTO users_v7(id,username,full_name,email,phone,country,region,password_hash,is_admin,created_at,phone_norm) SELECT id,username,full_name,email,phone,country,region,password_hash,is_admin,created_at,phone_norm FROM users;
DROP TABLE users;
ALTER TABLE users_v7 RENAME TO users;
CREATE INDEX IF NOT EXISTS users_phone_norm ON users(phone_norm);
PRAGMA user_version=7;
SQL);
                if ($db->query('PRAGMA foreign_key_check')->fetch()) throw new RuntimeException('Foreign key check failed after rebuilding users.');
            }
            $db->exec('COMMIT');
        } catch (Throwable $e) { $db->exec('ROLLBACK'); throw $e; }
        finally { $db->exec('PRAGMA foreign_keys=ON'); }
    }
    if ((int)$db->query('PRAGMA user_version')->fetchColumn() < 8) {
        // Finance: the full money breakdown of each transaction (billing.php financeSyncTransaction) and refunds.
        $cols=array_column($db->query('PRAGMA table_info(transactions)')->fetchAll(),'name');
        foreach (['subtotal','tax','fee','earnings','discount','origin','items_json','application_id','period_start','period_end'] as $c)
            if (!in_array($c,$cols,true)) $db->exec('ALTER TABLE transactions ADD COLUMN '.$c.' TEXT');
        $db->exec(<<<SQL
CREATE INDEX IF NOT EXISTS transactions_billed ON transactions(billed_at);
CREATE INDEX IF NOT EXISTS transactions_application ON transactions(application_id);
CREATE INDEX IF NOT EXISTS transactions_customer ON transactions(customer_id);
CREATE TABLE IF NOT EXISTS adjustments(adjustment_id TEXT PRIMARY KEY,transaction_id TEXT,subscription_id TEXT,customer_id TEXT,action TEXT NOT NULL,type TEXT,status TEXT NOT NULL,reason TEXT,currency TEXT,total TEXT,fee TEXT,earnings TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS adjustments_transaction ON adjustments(transaction_id);
PRAGMA user_version=8;
SQL);
    }
    if ((int)$db->query('PRAGMA user_version')->fetchColumn() < 9) {
        // 2.41: the account holder's gender, chosen at sign-up; accounts made before stay empty until they choose.
        $cols=array_column($db->query('PRAGMA table_info(users)')->fetchAll(),'name');
        if (!in_array('gender',$cols,true)) $db->exec("ALTER TABLE users ADD COLUMN gender TEXT CHECK (gender IN ('male','female'))");
        $db->exec('PRAGMA user_version=9');
    }
    if ((int)$db->query('PRAGMA user_version')->fetchColumn() < 10) {
        // 2.46: each website user is linked to its METON account (shared with the app); identity.php.
        $cols=array_column($db->query('PRAGMA table_info(users)')->fetchAll(),'name');
        if (!in_array('account_id',$cols,true)) $db->exec('ALTER TABLE users ADD COLUMN account_id TEXT');
        $db->exec('CREATE UNIQUE INDEX IF NOT EXISTS users_account ON users(account_id) WHERE account_id IS NOT NULL');
        $db->exec('PRAGMA user_version=10');
    }
    return $db;
}
function privateDir(): string {
    static $dir;
    if ($dir) return $dir;
    $candidates=[dirname(__DIR__).'/salonieer-private', __DIR__.'/salonieer-private'];
    foreach ($candidates as $c) if (@is_dir($c) && @is_writable($c)) return $dir=$c;
    foreach ($candidates as $c) {
        if (@mkdir($c,0700,true) || @is_dir($c)) {
            if (!@is_writable($c)) continue;
            @file_put_contents($c.'/.htaccess',"Require all denied\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n");
            @file_put_contents($c.'/index.html','');
            return $dir=$c;
        }
    }
    throw new RuntimeException('Cannot create a writable salonieer-private folder.');
}
function one(string $sql, array $params=[]): array|false { $s=db()->prepare($sql); $s->execute($params); return $s->fetch(); }
function rows(string $sql, array $params=[]): array { $s=db()->prepare($sql); $s->execute($params); return $s->fetchAll(); }
function runSql(string $sql, array $params=[]): int { $s=db()->prepare($sql); $s->execute($params); return $s->rowCount(); }
function nowMs(): int { return (int)floor(microtime(true)*1000); }
function digest(string $v): string { return hash('sha256',$v); }
function token(): string { return bin2hex(random_bytes(32)); }
function cookieName(): string { return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS']!=='off') ? '__Host-salonieer' : 'salonieer_session'; }
function setAuthCookie(string $value, int $age): void { setcookie(cookieName(),$value,['expires'=>time()+$age,'path'=>'/','secure'=>cookieName()==='__Host-salonieer','httponly'=>true,'samesite'=>'Lax']); }
function sessionRow(): array|false {
    $v=$_COOKIE[cookieName()] ?? '';
    if (!is_string($v) || !preg_match('/^[a-f0-9]{64}$/D',$v)) return false;
    return one('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?',[digest($v),nowMs()]);
}
function newSession(?int $uid, array|false $old): string {
    if ($old) runSql('DELETE FROM sessions WHERE token_hash=?',[$old['token_hash']]);
    $v=token(); $csrf=token(); $age=$uid?SESSION_SECONDS:7200;
    runSql('INSERT INTO sessions(token_hash,user_id,csrf,expires_at) VALUES(?,?,?,?)',[digest($v),$uid,$csrf,nowMs()+$age*1000]);
    setAuthCookie($v,$age);
    return $csrf;
}
function userDTO(array|false $user): ?array {
    if (!$user) return null;
    return ['id'=>(int)$user['id'],'username'=>$user['username'],'fullName'=>$user['full_name'],'email'=>$user['email'],'phone'=>$user['phone']??'','country'=>$user['country'],'region'=>$user['region'],'gender'=>$user['gender']??null,'isAdmin'=>(bool)$user['is_admin']];
}
const GENDERS = ['male','female'];
function requireUser(array|false $user): void { if (!$user) fail(401,'loginRequired'); }
function requireAdmin(array|false $user): void { requireUser($user); if (!(int)$user['is_admin']) fail(403,'forbidden'); }
function sendJson(int $status,array $data): never { http_response_code($status);header('Content-Type: application/json; charset=utf-8');echo json_encode($data,JSON_UNESCAPED_SLASHES|JSON_INVALID_UTF8_SUBSTITUTE);exit; }
function redirectTo(string $path): never { header('Location: '.$path,true,303);exit; }
function body(): array {
    if (!str_starts_with(strtolower($_SERVER['CONTENT_TYPE']??''),'application/json')) fail(415,'invalidRequest');
    if ((int)($_SERVER['CONTENT_LENGTH']??0)>3000000) fail(413,'fileTooLarge','logo');
    $raw=file_get_contents('php://input',false,null,0,3000001);
    if ($raw===false || strlen($raw)>3000000) fail(413,'fileTooLarge','logo');
    $data=json_decode($raw,true);
    // An object is required; {} (decoded as an empty array) is a valid empty object.
    if (!is_array($data) || (array_is_list($data) && trim($raw)!=='{}')) fail(400,'invalidRequest');
    return $data;
}
function rateLimit(string $type,int $max,int $seconds,string $identifier=''): void {
    $remote=$_SERVER['REMOTE_ADDR']??'unknown';
    $bucket=digest($type.':'.($identifier!==''?$identifier:$remote)); $now=nowMs();
    $r=one('SELECT hits,reset_at FROM rate_limits WHERE bucket=?',[$bucket]);
    if ($r && (int)$r['reset_at']>$now && (int)$r['hits'] >= $max) fail(429,'tooManyAttempts');
    runSql('INSERT INTO rate_limits(bucket,hits,reset_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=CASE WHEN reset_at<=? THEN 1 ELSE hits+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END',[$bucket,$now+$seconds*1000,$now,$now]);
}
function csrfAndOrigin(array|false $session): void {
    $origin=$_SERVER['HTTP_ORIGIN']??'';
    $host=$_SERVER['HTTP_HOST']??'';
    $scheme=(!empty($_SERVER['HTTPS'])&&$_SERVER['HTTPS']!=='off')?'https':'http';
    if (!$origin || !hash_equals($scheme.'://'.$host,$origin) || ($_SERVER['HTTP_SEC_FETCH_SITE']??'')==='cross-site') fail(403,'invalidOrigin');
    if (!$session || !is_string($_SERVER['HTTP_X_CSRF_TOKEN']??null) || !hash_equals($session['csrf'],$_SERVER['HTTP_X_CSRF_TOKEN'])) fail(403,'sessionExpired');
}
function countryList(): array {
    $file=privateDir().'/countries.php';
    if (is_file($file)) { $list=require $file; if (is_array($list)) return $list; }
    $js=@file_get_contents(__DIR__.'/assets/countries.js');
    if ($js && preg_match("/COUNTRIES = '([A-Z ]+)'/",$js,$m)) return explode(' ',$m[1]);
    throw new RuntimeException('Country list missing.');
}
function validateRegistration(array $d): array {
    $v=['fullName'=>cleanText($d['fullName']??null),'email'=>strtolower(cleanText($d['email']??null))];
    if (!validFullName($v['fullName'])) fail(400,'invalidFullName','fullName');
    $v['gender']=$d['gender']??null;
    if (!in_array($v['gender'],GENDERS,true)) fail(400,'invalidGender','gender');
    if (!validEmail($v['email'])) fail(400,'invalidEmail','email');
    if (!in_array($d['country']??null,countryList(),true)) fail(400,'invalidCountry','country');
    $v['country']=$d['country'];$v['region']='';
    if ($problem=passwordProblem($d['password']??null,$v['email'])) fail(400,$problem,'password');
    if (($d['password']??null)!==($d['passwordConfirm']??null)) fail(400,'passwordMismatch','passwordConfirm');
    return $v;
}
// Sign-up asks for an email only; the username column is filled with a hidden unique name made from it.
function generatedUsername(string $email): string {
    $base=substr(preg_replace('/[^a-z0-9_.-]/','',strtolower(strstr($email,'@',true)?:'user')),0,20);
    if (!preg_match('/^[a-z0-9]/',$base)) $base='user'.$base;
    do { $name=$base.'-'.bin2hex(random_bytes(3)); } while (one('SELECT 1 FROM users WHERE username=?',[$name]));
    return $name;
}
// One generic answer for a taken email, so sign-up can't be used to look up who has an account.
function ensureAvailable(array $v): void {
    if (one('SELECT 1 FROM users WHERE email=? LIMIT 1',[$v['email']])) fail(409,'accountUnavailable');
}
function createUser(array $v,string $password,bool $admin=false): int {
    try {
        runSql('INSERT INTO users(username,full_name,email,country,region,password_hash,is_admin,gender) VALUES(?,?,?,?,?,?,?,?)',[generatedUsername($v['email']),$v['fullName'],$v['email'],$v['country'],$v['region'],password_hash($password,PASSWORD_DEFAULT),$admin?1:0,$v['gender']]);
    } catch (PDOException $e) { if (str_contains($e->getMessage(),'UNIQUE constraint failed')) fail(409,'accountUnavailable');throw $e; }
    return (int)db()->lastInsertId();
}
function verifyHash(string $password,?string $stored): bool {
    if ($stored===null) return false;
    if (str_starts_with($stored,'$')) return password_verify($password,$stored);
    // Existing Node passwords use RFC 7914 scrypt with N=16384,r=8,p=1.
    if (!function_exists('sodium_crypto_pwhash_scryptsalsa208sha256')) throw new RuntimeException('PHP sodium extension required for existing accounts.');
    if (!preg_match('/^([a-f0-9]{32}):([a-f0-9]{128})$/D',$stored,$m)) return false;
    return hash_equals($m[2],bin2hex(sodium_crypto_pwhash_scryptsalsa208sha256(64,$password,$m[1],524288,16777216)));
}
// ---- Pricing ----------------------------------------------------------------
// Edit prices here. Order of 'plans': Basic, Pro, Business, Enterprise (null = by agreement).
// 'standard' is the higher price list and is used whenever a location cannot be determined.
// One price list in US dollars for everyone (November 2026): every checkout and subscription is charged in USD. Visitors
// may see an approximate amount in their own currency next to it (fxRates below), for information only.
// The older tiers below stay only so saved quotes and existing subscriptions on their prices are still recognised
// (October 2026 shekels, and the earlier USD/ILS lists).
const CURRENCIES = ['USD'];
const DEFAULT_CURRENCY = 'USD';
const PRICES = [
    PRICE_TIER => [
        'USD' => ['plans'=>[20,40,null,null], 'loyalty'=>3, 'specialist'=>5],
    ],
    'list2026' => [
        'ILS' => ['plans'=>[65,130,null,null], 'loyalty'=>10, 'specialist'=>15],
    ],
    'standard' => [
        'USD' => ['plans'=>[39,85,139,null], 'loyalty'=>9, 'specialist'=>9],
        'ILS' => ['plans'=>[130,280,459,null], 'loyalty'=>30, 'specialist'=>30],
    ],
    // Palestine (West Bank and Gaza): half of every standard price, plans and add-ons, matching the Paddle
    // "Monthly (Palestine)" prices. The key stays 'west_bank' because saved application quotes use it.
    'west_bank' => [
        'USD' => ['plans'=>[19.5,42.5,69.5,null], 'loyalty'=>4.5, 'specialist'=>4.5],
        'ILS' => ['plans'=>[65,140,229.5,null], 'loyalty'=>15, 'specialist'=>15],
    ],
];
// Paddle checkout. The client-side token and price IDs are public (they're sent to the browser); secrets stay in .env.
// One Paddle price per plan and pricing tier, billed monthly; null = no online checkout (Enterprise is priced by agreement).
// The tier comes from the account's saved country (userTier), never from the visitor's location, so the price shown on the
// site is the price charged. The Paddle prices have no country overrides for the same reason.
const PADDLE_CLIENT_TOKEN = 'live_f46c13539b6db94cb05e4eb04ec';
// Every Paddle price the site sells, per tier: monthly, yearly (11 × monthly: one month free), and the 14-day free-trial
// versions used for a Pro salon's first checkout (all items of a trial checkout must trial together, so its add-ons
// have trial versions too). Plans and add-ons go in the same checkout; Enterprise is priced by agreement.
const YEARLY_MONTHS = 11;
const TRIAL_PLANS = ['pro'];
const PADDLE_CATALOG = [
    // November 2026: ONE price list for everyone, in US dollars (Paddle prices without country overrides, so Paddle
    // charges USD everywhere). 'loyalty' is the Basic option (Loyalty Coins OR the Smart waitlist, one at a time) at $3.
    'usd2026' => [
        'month'       => ['basic'=>'pri_01m69c7nd231q0q3817px6pwd5','pro'=>'pri_01m69c7np1xtzt1ymd8wn81872','loyalty'=>'pri_01m69c7nz4ydbvnw4pm10hc943','specialist'=>'pri_01m69c7p7y0fvp4dnh5n3bh9e5'],
        'year'        => ['basic'=>'pri_01m69c7pher6h86m6enwef26q4','pro'=>'pri_01m69c7q2kf8a1kf7qgjzgv9sd','loyalty'=>'pri_01m69c7qakpt8chys1d7zjp6hj','specialist'=>'pri_01m69c7qjta3590m72y1rs98yy'],
        'month_trial' => ['pro'=>'pri_01m69c7qv32a22v08ydp14hme3','loyalty'=>'pri_01m69c7r2vxfxqhxj5xwxxhdt5','specialist'=>'pri_01m69c7rb1nqx4gcjndjawmkrv'],
        'year_trial'  => ['pro'=>'pri_01m69c7rjtya3yj4f8y6yvm3ej','loyalty'=>'pri_01m69c7rtzmn7qxjcqaefp9026','specialist'=>'pri_01m69c7s2pfkmnb1j4yjyw5cjj'],
    ],
    // October 2026 shekel list: no longer sold, kept for the subscriptions already on it (their changes stay in ILS).
    'list2026' => [
        'month'       => ['basic'=>'pri_01m4dwf2fnyv56zeyn6f6rnf87','pro'=>'pri_01m4dwf3eqb7qxj78wzbz41crc','loyalty'=>'pri_01m4dwf3xhxp8qvg4zae74cjj2','specialist'=>'pri_01m4dwf4cppnndkww47a1zffmn'],
        'year'        => ['basic'=>'pri_01m4dwf36gp8mtbzm0exdbtd6a','pro'=>'pri_01m4dwf3p0th2n6ac4zz4pryzm','loyalty'=>'pri_01m4dwf451ed6ry28py2myfgm6','specialist'=>'pri_01m4dwf4mbbn73ktv4g594p48k'],
        'month_trial' => ['pro'=>'pri_01m4dwf4vveck6ka9ne0c1j69j','loyalty'=>'pri_01m4dwf5ahme0ydgf2mj83vqac','specialist'=>'pri_01m4dwf5rnngrrk5m195dartww'],
        'year_trial'  => ['pro'=>'pri_01m4dwf52sxg3fzb227qatf4kd','loyalty'=>'pri_01m4dwf5hk5cqq32k84ph4fr0y','specialist'=>'pri_01m4dwf60tk242e1gvkdrfpbd8'],
    ],
    'standard' => [
        'month'       => ['basic'=>'pri_01m3ysefa4m4ysdz2afgw325ry','pro'=>'pri_01m3yseftqb0cdc1ag5zqthkbv','business'=>'pri_01m3ysegqz9s8qs6gayftkbxe6','loyalty'=>'pri_01m3yseh8s5v5cm1sma0hrbbe4','specialist'=>'pri_01m3ysehvnsyeybntjqy10fa9v'],
        'year'        => ['basic'=>'pri_01m4176vyr0p4bzb4g8vsqwshk','pro'=>'pri_01m4176w6rd7njyzcgvy17ghwq','business'=>'pri_01m4176weas18qr4gd7594ddn6','loyalty'=>'pri_01m4176wpveb4k8q60tw7rt1yb','specialist'=>'pri_01m4176wy4cm9t7qhyr2s1ea2w'],
        'month_trial' => ['pro'=>'pri_01m4176x5t8rg5w66ghwx51pve','loyalty'=>'pri_01m4176xnt54txv69ge6g7g6gw','specialist'=>'pri_01m4176y647wmcyp0h7pgnfrwh'],
        'year_trial'  => ['pro'=>'pri_01m4176xe72030twvfpkhqbd6d','loyalty'=>'pri_01m4176xy0kn89t0swe0etjrwt','specialist'=>'pri_01m4176ydeg5n65a6jntbe733y'],
    ],
    // Palestine (West Bank and Gaza) accounts: half of every standard price.
    'west_bank' => [
        'month'       => ['basic'=>'pri_01m3ytvq3m1j4rv0xe58a9fpm9','pro'=>'pri_01m3ytvqhr7770x13st7cr5xz2','business'=>'pri_01m3ytvqzv5b6ph9k2tvea6z74','loyalty'=>'pri_01m40z9m0sqbpfafnecjbqndv6','specialist'=>'pri_01m40z9m7qd2vx0azfhtfvzgfh'],
        'year'        => ['basic'=>'pri_01m4176ynw1ke5wbgzc7c5q9s2','pro'=>'pri_01m4176yxdfjnwaqmam6c25q55','business'=>'pri_01m4176z4h775ccnscq6x91z08','loyalty'=>'pri_01m4176zb7jr24jbmtbsgaj8k4','specialist'=>'pri_01m4176zjc08zm0n0k9crty9jc'],
        'month_trial' => ['pro'=>'pri_01m4176zss3zcwvpx5tysc3w9s','loyalty'=>'pri_01m417709pztvb5t8135e709p1','specialist'=>'pri_01m41770qqb1pg8ya3t3788xp2'],
        'year_trial'  => ['pro'=>'pri_01m417702vvydzcjm10v4f64rw','loyalty'=>'pri_01m41770gvptg79vbebpv28dzf','specialist'=>'pri_01m41770yfc8h6f05gvmj12t1f'],
    ],
];
// Monthly plan prices, as before (paddle.php uses them to spot the plan item and to log mismatched tiers).
const PADDLE_PRICE_IDS = [
    PRICE_TIER  => ['basic'=>PADDLE_CATALOG[PRICE_TIER]['month']['basic'],'pro'=>PADDLE_CATALOG[PRICE_TIER]['month']['pro'],'business'=>null,'enterprise'=>null],
    'list2026'  => ['basic'=>PADDLE_CATALOG['list2026']['month']['basic'],'pro'=>PADDLE_CATALOG['list2026']['month']['pro'],'business'=>null,'enterprise'=>null],
    'standard'  => ['basic'=>PADDLE_CATALOG['standard']['month']['basic'],'pro'=>PADDLE_CATALOG['standard']['month']['pro'],'business'=>PADDLE_CATALOG['standard']['month']['business'],'enterprise'=>null],
    'west_bank' => ['basic'=>PADDLE_CATALOG['west_bank']['month']['basic'],'pro'=>PADDLE_CATALOG['west_bank']['month']['pro'],'business'=>PADDLE_CATALOG['west_bank']['month']['business'],'enterprise'=>null],
];
// A free trial is for a first salon only: accounts that never had a Paddle subscription.
function trialEligible(array|false $user): bool { return $user && !paddleUserSubscriptions($user); }
// Checkout settings for this visitor: the prices of the signed-in account's tier (guests can't check out).
function checkoutConfig(array|false $user): array {
    $tier=PRICE_TIER;$c=PADDLE_CATALOG[$tier];
    $pick=static fn(array $set,array $keys)=>array_intersect_key($set,array_flip($keys));
    return ['clientToken'=>PADDLE_CLIENT_TOKEN,'environment'=>str_starts_with(PADDLE_CLIENT_TOKEN,'test_')?'sandbox':'production','tier'=>$tier,
        // 'prices'/'addons' = monthly, kept for older pages; 'catalog' holds every interval and the trial versions.
        'prices'=>$pick($c['month'],['basic','pro']),'addons'=>$pick($c['month'],['loyalty','specialist']),'basicOptions'=>BASIC_OPTIONS,
        'catalog'=>$c,'trialPlans'=>TRIAL_PLANS,'trialEligible'=>trialEligible($user),'yearlyMonths'=>YEARLY_MONTHS,
        // Paddle Retain (payment recovery prompts) identifies a signed-in owner by their Paddle customer ID.
        'customerId'=>$user ? (paddleCustomerIds($user)[0] ?? null) : null];
}
// Everyone is on the same price list since October 2026 (the account's country no longer changes the price).
function userTier(array $user): string { return PRICE_TIER; }
function catalog(string $tier, array $meta=[]): array {
    $names=['Basic','Pro','Business','Enterprise'];$spec=[1,7,16,null];
    $features=[['oneSpecialist','coreSystem','bookingsCustomers','salonSettings','basicOptionFeature'],['allBasic','sevenSpecialists','productsPage','analytics','loyaltyIncluded','extraSpecialistsFeature'],['allPro','sixteenSpecialists','loyaltyIncluded','largerCapacity'],['allFeatures','unlimitedSpecialists','customAddons','dedicatedSupport']];
    $plans=[];
    $tier=PRICE_TIER;
    foreach (OFFERED_PLANS as $id) {
        $i=array_search($id,PLANS,true);
        $prices=[];foreach (CURRENCIES as $cur) $prices[$cur]=PRICES[$tier][$cur]['plans'][$i];
        $plans[]=['id'=>$id,'name'=>$names[$i],'prices'=>$prices,'specialists'=>$spec[$i],'features'=>$features[$i],'includesOptions'=>$id!=='basic'];
    }
    $addons=['loyalty'=>[],'specialist'=>[]];
    foreach (CURRENCIES as $cur) { $addons['loyalty'][$cur]=PRICES[$tier][$cur]['loyalty'];$addons['specialist'][$cur]=PRICES[$tier][$cur]['specialist']; }
    return ['currencies'=>CURRENCIES,'defaultCurrency'=>DEFAULT_CURRENCY,'region'=>$tier,'plans'=>$plans,'addons'=>$addons,'basicOptions'=>BASIC_OPTIONS,'yearlyMonths'=>YEARLY_MONTHS,'trialPlans'=>TRIAL_PLANS,'trialDays'=>14,
        'fx'=>fxPublic(is_string($meta['country'] ?? null) ? $meta['country'] : null)]+$meta;
}
// Prices per billing period: monthly as listed, yearly = YEARLY_MONTHS × monthly.
// The free trial is optional: a Pro applicant who doesn't ask for it subscribes (and pays) right away.
// The Basic option ('loyalty' in saved quotes) is Loyalty Coins or the Smart waitlist; Pro and above include both.
function quote(array $user,string $plan,bool $loyalty,int $extra,string $currency,string $interval='month',bool $wantsTrial=false,string $option='loyalty'): array {
    $tier=userTier($user);$p=PRICES[$tier][$currency];$i=array_search($plan,PLANS,true);
    $k=$interval==='year'?YEARLY_MONTHS:1;
    $base=$p['plans'][$i]===null?null:$p['plans'][$i]*$k;
    $loyalty=$loyalty && $plan==='basic';
    $option=in_array($option,BASIC_OPTIONS,true)?$option:'loyalty';
    $extra=$plan==='enterprise'?0:$extra;
    $trial=$wantsTrial && $interval!=='' && in_array($plan,TRIAL_PLANS,true) && trialEligible($user);
    return ['plan'=>$plan,'currency'=>$currency,'region'=>$tier,'interval'=>$interval,'trialDays'=>$trial?14:0,'base'=>$base,'loyalty'=>$loyalty,'option'=>$loyalty?$option:null,'extraSpecialists'=>$extra,
        'loyaltyPrice'=>$loyalty?$p['loyalty']*$k:0,'specialistPrice'=>$p['specialist']*$k,'total'=>$base===null?null:$base+($loyalty?$p['loyalty']*$k:0)+$extra*$p['specialist']*$k];
}

// ---- Visitor location (no sign-in needed) -------------------------------------
// 1) Country headers set by a CDN / server GeoIP module, 2) a cached lookup of the visitor IP.
// Any failure returns null, which means standard (higher) prices.
function isPublicIp(string $ip): bool { return (bool)filter_var($ip,FILTER_VALIDATE_IP,FILTER_FLAG_NO_PRIV_RANGE|FILTER_FLAG_NO_RES_RANGE); }
function httpGetJson(string $url): ?array {
    $body=null;
    try {
    if (function_exists('curl_init') && function_exists('curl_exec') && function_exists('curl_setopt_array')) {
        $c=curl_init($url);
        curl_setopt_array($c,[CURLOPT_RETURNTRANSFER=>true,CURLOPT_CONNECTTIMEOUT=>2,CURLOPT_TIMEOUT=>3,CURLOPT_FOLLOWLOCATION=>false,CURLOPT_HTTPHEADER=>['Accept: application/json'],CURLOPT_USERAGENT=>'Salonieer/1.0']);
        $r=curl_exec($c);$code=(int)curl_getinfo($c,CURLINFO_HTTP_CODE);curl_close($c);
        if (is_string($r)&&$code===200) $body=$r;
    } elseif (ini_get('allow_url_fopen')) {
        $r=@file_get_contents($url,false,stream_context_create(['http'=>['timeout'=>3,'header'=>"Accept: application/json\r\nUser-Agent: METON/1.0\r\n"]]));
        if (is_string($r)) $body=$r;
    }
    } catch (Throwable $e) { error_log('Salonieer geo lookup failed: '.$e->getMessage()); return null; }
    if ($body===null||strlen($body)>4096) return null;
    $d=json_decode($body,true);
    return is_array($d)?$d:null;
}
function lookupCountry(string $ip): ?string {
    $d=httpGetJson('https://api.country.is/'.rawurlencode($ip));
    $cc=is_string($d['country']??null)?strtoupper($d['country']):'';
    if (!preg_match('/^[A-Z]{2}$/D',$cc)) {
        $d=httpGetJson('https://ipapi.co/'.rawurlencode($ip).'/json/');
        $cc=is_string($d['country_code']??null)?strtoupper($d['country_code']):'';
    }
    return preg_match('/^[A-Z]{2}$/D',$cc)?$cc:null;
}
function visitorCountry(): ?string {
    foreach (['HTTP_CF_IPCOUNTRY','HTTP_CLOUDFRONT_VIEWER_COUNTRY','GEOIP_COUNTRY_CODE','MM_COUNTRY_CODE','HTTP_X_COUNTRY_CODE'] as $h) {
        $v=strtoupper(trim((string)($_SERVER[$h]??'')));
        if (preg_match('/^[A-Z]{2}$/D',$v) && !in_array($v,['XX','T1','ZZ'],true)) return $v;
    }
    $ip=(string)($_SERVER['REMOTE_ADDR']??'');
    if (!isPublicIp($ip)) return null;
    $key=digest('geo:'.$ip);
    try {
        db()->exec('CREATE TABLE IF NOT EXISTS geo_cache(ip_hash TEXT PRIMARY KEY,country TEXT,expires_at INTEGER NOT NULL)');
        $hit=one('SELECT country FROM geo_cache WHERE ip_hash=? AND expires_at>?',[$key,nowMs()]);
        if ($hit) return $hit['country']?:null;
    } catch (Throwable) {}
    $country=lookupCountry($ip);
    try {
        // Successful lookups are cached for a day; failures for 10 minutes.
        runSql('INSERT OR REPLACE INTO geo_cache(ip_hash,country,expires_at) VALUES(?,?,?)',[$key,$country??'',nowMs()+($country?86400000:600000)]);
        if (random_int(1,200)===1) runSql('DELETE FROM geo_cache WHERE expires_at<=?',[nowMs()]);
    } catch (Throwable) {}
    return $country;
}
function guestPricing(string $timeZone, string $hint=''): array {
    try { $country=visitorCountry(); }
    catch (Throwable $e) { error_log('Salonieer location failed: '.$e->getMessage()); $country=null; }
    // If the server could not locate the visitor, accept the country their browser looked up (display only;
    // the price on an application always comes from the account's saved country and region).
    if ($country===null && preg_match('/^[A-Z]{2}$/D',$hint)) $country=$hint;
    return catalog(PRICE_TIER,['source'=>$country?'location':'default','country'=>$country]);
}

// ---- Approximate local prices (display only) ----------------------------------------------------------------------
// Everything is charged in US dollars. Visitors also see roughly what that is in their own currency, converted with
// daily market rates. Rates come from open.er-api.com, or the free currency-api (jsDelivr, then its pages.dev mirror) when
// that fails, and a table is accepted only if every currency the European Central Bank also publishes (frankfurter.dev)
// agrees within 3% (or, when the ECB can't be reached, within 15% of the last accepted table). The table is cached in the
// private folder and refreshed every 6 hours (cron.php, or the first visit after that). Without a checked table from the
// last 3 days the site shows US dollars only.
const FX_CURRENCIES = ['USD','ILS','JOD','EGP','SAR','AED','QAR','KWD','BHD','OMR','IQD','MAD','TND','DZD','LYD','TRY','EUR','GBP','CHF','SEK','NOK','DKK','PLN','CZK','HUF','RON','CAD','AUD','NZD','INR','PKR','MYR','IDR','SGD','JPY','CNY','KRW','ZAR','BRL','MXN'];
const FX_REFRESH = 21600, FX_RETRY = 900, FX_MAX_AGE = 259200, FX_ECB_TOLERANCE = 0.03, FX_PREVIOUS_TOLERANCE = 0.15;
// The currency shown by default for a country (anything not listed sees US dollars).
const COUNTRY_CURRENCY = ['PS'=>'ILS','IL'=>'ILS','JO'=>'JOD','EG'=>'EGP','SA'=>'SAR','AE'=>'AED','QA'=>'QAR','KW'=>'KWD','BH'=>'BHD','OM'=>'OMR','IQ'=>'IQD',
    'MA'=>'MAD','TN'=>'TND','DZ'=>'DZD','LY'=>'LYD','TR'=>'TRY','GB'=>'GBP','CH'=>'CHF','LI'=>'CHF','SE'=>'SEK','NO'=>'NOK','DK'=>'DKK','PL'=>'PLN','CZ'=>'CZK',
    'HU'=>'HUF','RO'=>'RON','CA'=>'CAD','AU'=>'AUD','NZ'=>'NZD','IN'=>'INR','PK'=>'PKR','MY'=>'MYR','ID'=>'IDR','SG'=>'SGD','JP'=>'JPY','CN'=>'CNY','KR'=>'KRW',
    'ZA'=>'ZAR','BR'=>'BRL','MX'=>'MXN','AT'=>'EUR','BE'=>'EUR','CY'=>'EUR','DE'=>'EUR','EE'=>'EUR','ES'=>'EUR','FI'=>'EUR','FR'=>'EUR','GR'=>'EUR','HR'=>'EUR',
    'IE'=>'EUR','IT'=>'EUR','LT'=>'EUR','LU'=>'EUR','LV'=>'EUR','MT'=>'EUR','NL'=>'EUR','PT'=>'EUR','SI'=>'EUR','SK'=>'EUR','AD'=>'EUR','MC'=>'EUR','SM'=>'EUR',
    'VA'=>'EUR','ME'=>'EUR','XK'=>'EUR','BG'=>'EUR'];
function fxSources(): array {
    // Local tests only: stub sources on this machine (never anything but loopback).
    $local = paddleEnv('FX_TEST_BASE');
    if ($local && preg_match('~^http://127\.0\.0\.1:\d+$~D', $local))
        return ['main'=>[$local.'/er/USD', $local.'/fa/usd.min.json', $local.'/fb/usd.min.json'], 'ecb'=>$local.'/ecb?base=USD'];
    return ['main'=>['https://open.er-api.com/v6/latest/USD', 'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json',
        'https://latest.currency-api.pages.dev/v1/currencies/usd.min.json'], 'ecb'=>'https://api.frankfurter.dev/v1/latest?base=USD'];
}
function fxGet(string $url): ?array {
    try {
        $c = curl_init($url);
        curl_setopt_array($c, [CURLOPT_RETURNTRANSFER=>true, CURLOPT_CONNECTTIMEOUT=>3, CURLOPT_TIMEOUT=>5, CURLOPT_FOLLOWLOCATION=>false, CURLOPT_HTTPHEADER=>['Accept: application/json'], CURLOPT_USERAGENT=>'Salonieer/1.0']);
        $r = curl_exec($c); $code = (int)curl_getinfo($c, CURLINFO_HTTP_CODE); curl_close($c);
    } catch (Throwable $e) { error_log('Salonieer rates: '.$e->getMessage()); return null; }
    if (!is_string($r) || $code !== 200 || strlen($r) > 400000) return null;
    $d = json_decode($r, true);
    return is_array($d) ? $d : null;
}
// One source's answer as [rates (per 1 USD), as-of time], keeping only the site's currencies with a sane rate.
function fxParse(?array $d): ?array {
    if (!$d) return null;
    if (($d['result'] ?? '') === 'success' && ($d['base_code'] ?? '') === 'USD' && is_array($d['rates'] ?? null)) { $raw = $d['rates']; $at = (int)($d['time_last_update_unix'] ?? 0); }
    elseif (is_array($d['usd'] ?? null) && is_string($d['date'] ?? null)) { $raw = array_change_key_case($d['usd'], CASE_UPPER); $at = (int)strtotime($d['date'].' 00:00:00 UTC'); }
    elseif (($d['base'] ?? '') === 'USD' && is_array($d['rates'] ?? null) && is_string($d['date'] ?? null)) { $raw = $d['rates']; $at = (int)strtotime($d['date'].' 00:00:00 UTC'); }
    else return null;
    $rates = ['USD'=>1.0];
    foreach (FX_CURRENCIES as $cur) {
        $v = $raw[$cur] ?? null;
        if ($cur !== 'USD' && is_numeric($v) && is_finite((float)$v) && (float)$v > 0 && (float)$v < 1e7) $rates[$cur] = (float)$v;
    }
    return ['rates'=>$rates, 'asOf'=>$at];
}
// The largest relative difference between two tables over the currencies both have (0 when none are shared).
function fxGap(array $a, array $b): float {
    $gap = 0.0;
    foreach ($a as $cur => $v) if ($cur !== 'USD' && isset($b[$cur])) $gap = max($gap, abs($v - $b[$cur]) / $b[$cur]);
    return $gap;
}
function fxDownload(?array $previous): ?array {
    $src = fxSources();
    $ecb = fxParse(fxGet($src['ecb']));
    if ($ecb && count($ecb['rates']) < 10) $ecb = null;
    foreach ($src['main'] as $i => $url) {
        $t = fxParse(fxGet($url));
        if (!$t || count($t['rates']) < 20 || !isset($t['rates']['ILS'], $t['rates']['EUR']) || $t['asOf'] < time() - FX_MAX_AGE || $t['asOf'] > time() + 86400) continue;
        if ($ecb ? fxGap($t['rates'], $ecb['rates']) > FX_ECB_TOLERANCE : ($previous && fxGap($t['rates'], $previous['rates']) > FX_PREVIOUS_TOLERANCE)) {
            error_log('Salonieer rates: source '.$i.' disagrees with the check, skipped'); continue;
        }
        return ['rates'=>$t['rates'], 'asOf'=>$t['asOf'], 'source'=>['open.er-api.com','currency-api','currency-api'][$i], 'checked'=>$ecb ? 'ecb' : 'previous', 'fetchedAt'=>time()];
    }
    return null;
}
// The cached table, refreshed when it is 6 hours old (one request at a time, at most every 15 minutes on failures).
function fxRates(bool $force = false): ?array {
    $file = privateDir().'/fx-rates.json';
    $cache = is_file($file) ? json_decode((string)@file_get_contents($file), true) : null;
    $cache = is_array($cache) ? $cache : [];
    $table = is_array($cache['table'] ?? null) ? $cache['table'] : null;
    $due = !$table || ($table['fetchedAt'] ?? 0) < time() - FX_REFRESH;
    if (($force || $due) && ($cache['triedAt'] ?? 0) < time() - ($force ? 60 : FX_RETRY)) {
        $lock = @fopen(privateDir().'/fx-rates.lock', 'c');
        if ($lock && flock($lock, LOCK_EX | LOCK_NB)) {
            $fresh = fxDownload($table);
            $cache = ['table'=>$fresh ?? $table, 'triedAt'=>time()];
            $tmp = $file.'.'.bin2hex(random_bytes(4));
            if (@file_put_contents($tmp, json_encode($cache)) !== false) @rename($tmp, $file);
            $table = $cache['table'];
            flock($lock, LOCK_UN);
        }
        if ($lock) fclose($lock);
    }
    return $table && ($table['asOf'] ?? 0) >= time() - FX_MAX_AGE ? $table : null;
}
// What the browser gets: the rates of the offered currencies and the visitor's own currency (null = US dollars only).
function fxPublic(?string $country): ?array {
    try { $t = fxRates(); } catch (Throwable $e) { error_log('Salonieer rates: '.$e->getMessage()); $t = null; }
    if (!$t) return null;
    $local = COUNTRY_CURRENCY[strtoupper((string)$country)] ?? 'USD';
    return ['base'=>'USD', 'rates'=>$t['rates'], 'asOf'=>gmdate('Y-m-d\TH:i:s\Z', (int)$t['asOf']), 'local'=>isset($t['rates'][$local]) ? $local : 'USD'];
}
function logoData(mixed $input): ?array {
    if (!is_string($input)||strlen($input)>2800000||!preg_match('~^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$~D',$input,$m) || strlen($m[2])%4!==0) return null;
    $bytes=base64_decode($m[2],true);
    if ($bytes===false || strlen($bytes)<32 || strlen($bytes)>2097152) return null;
    $type='image/'.$m[1];
    if (!function_exists('getimagesizefromstring')) throw new RuntimeException('PHP image size support required.');
    $size=@getimagesizefromstring($bytes);
    if (!$size || ($size['mime']??'')!==$type || $size[0]<1 || $size[1]<1 || $size[0]>4096 || $size[1]>4096 || $size[0]*$size[1]>16000000) return null;
    return ['bytes'=>$bytes,'type'=>$type];
}
function identityKey(): string {
    static $key;
    if ($key) return $key;
    $file=privateDir().'/encryption.key';
    if (!is_file($file)) {
        $fh=@fopen($file,'x');
        if ($fh) { fwrite($fh,random_bytes(32)); fclose($fh); @chmod($file,0600); }
    }
    $key=file_get_contents($file);
    if ($key===false||strlen($key)!==32) throw new RuntimeException('Invalid encryption key');
    return $key;
}
function encryptId(string $id): string {
    $nonce=random_bytes(12);$tag='';
    $enc=openssl_encrypt($id,'aes-256-gcm',identityKey(),OPENSSL_RAW_DATA,$nonce,$tag);
    if ($enc===false) throw new RuntimeException('Encryption error');
    return base64_encode($nonce.$tag.$enc);
}
function decryptId(string $value): string {
    $b=base64_decode($value,true);
    if ($b===false || strlen($b)<28) throw new RuntimeException('Invalid encrypted ID');
    $text=openssl_decrypt(substr($b,28),'aes-256-gcm',identityKey(),OPENSSL_RAW_DATA,substr($b,0,12),substr($b,12,16));
    if ($text===false) throw new RuntimeException('Decryption error');
    return $text;
}
function applicationDTO(array $r,bool $admin=false): array {
    $a=['id'=>$r['id'],'salonName'=>$r['salon_name'],'plan'=>$r['plan'],'quote'=>json_decode($r['quote_json'],true),'paymentMethod'=>$r['payment_method'],'status'=>$r['status'],'createdAt'=>str_replace(' ','T',$r['created_at']).'Z','idLast4'=>$r['identity_last4'],'logoUrl'=>'/api/applications/'.rawurlencode($r['id']).'/logo'];
    if ($admin) $a+=['fullName'=>$r['full_name'],'email'=>$r['email'],'phone'=>$r['phone'],'country'=>$r['country'],'region'=>$r['region'],'identityNumber'=>decryptId($r['identity_encrypted'])];
    return $a;
}
// ---- Applications in Supabase ----------------------------------------------------------------------------------------
const SALON_CATEGORIES = ['male','female','beauty'];
const TEAM_COMPOSITIONS = ['male','female','mixed'];
const CLIENTELES = ['men','women','both'];
function defaultTimezone(string $country): string {
    return ['PS'=>'Asia/Hebron','IL'=>'Asia/Jerusalem','JO'=>'Asia/Amman','SA'=>'Asia/Riyadh','AE'=>'Asia/Dubai','EG'=>'Africa/Cairo','TR'=>'Europe/Istanbul',
        'LB'=>'Asia/Beirut','QA'=>'Asia/Qatar','KW'=>'Asia/Kuwait','BH'=>'Asia/Bahrain','OM'=>'Asia/Muscat','IQ'=>'Asia/Baghdad','SY'=>'Asia/Damascus',
        'MA'=>'Africa/Casablanca','TN'=>'Africa/Tunis','DZ'=>'Africa/Algiers','GB'=>'Europe/London','DE'=>'Europe/Berlin','FR'=>'Europe/Paris','US'=>'America/New_York'][$country] ?? 'Asia/Hebron';
}
function validTimezone(mixed $tz): bool { return is_string($tz) && in_array($tz, DateTimeZone::listIdentifiers(), true); }
// The number the owner types to sign in to the Salonieer app: national digits, e.g. +970599123456 → 0599123456.
function localPhone(string $e164): string {
    try {
        $util = \libphonenumber\PhoneNumberUtil::getInstance();
        $digits = preg_replace('/\D/', '', $util->format($util->parse($e164, null), \libphonenumber\PhoneNumberFormat::NATIONAL));
        if (strlen($digits) >= 9) return $digits;
    } catch (Throwable) {}
    return preg_replace('/\D/', '', $e164);
}
function siteLang(mixed $v): string { return in_array($v, ['en','ar','he'], true) ? $v : 'en'; }
function logoExtension(string $type): string { return ['image/png'=>'png','image/jpeg'=>'jpg','image/webp'=>'webp'][$type] ?? 'png'; }
// Sends one application to Supabase (logo to Storage first). Used for new applications and the legacy migration.
function submitApplication(array $user, string $id, array $f, string $logoBytes, string $logoType, array $extra = []): array {
    $phone = (string)($f['phone'] ?? $user['phone'] ?? '');
    $logoUrl = sbUploadLogo('applications/'.$id.'-'.substr(hash('sha256', $logoBytes), 0, 10).'.'.logoExtension($logoType), $logoBytes, $logoType);
    return sbRpc('website_submit_application', ['p_data'=>[
        'id'=>$id, 'websiteUserId'=>(int)$user['id'], 'fullName'=>$user['full_name'], 'email'=>$user['email'], 'phone'=>$phone, 'country'=>$f['country'] ?? $user['country'],
        'lang'=>$f['lang'], 'salonName'=>$f['salonName'], 'salonCategory'=>$f['salonCategory'], 'teamComposition'=>$f['teamComposition']??null, 'clientele'=>$f['clientele']??null, 'timezone'=>$f['timezone'], 'logoUrl'=>$logoUrl,
        'plan'=>$f['plan'], 'quote'=>$f['quote'], 'paymentMethod'=>$f['paymentMethod'], 'idLast4'=>$f['idLast4'], 'ownerPhone'=>$phone === '' ? '' : localPhone($phone),
    ] + $extra]);
}
// One time: applications saved before the Supabase connection are copied there (no emails are sent for them).
function migrateLegacyApplications(): void {
    if (!supabaseReady() || setting('applications_migrated') === true) return;
    $rows = rows('SELECT a.*,u.full_name,u.email,u.phone,u.country FROM applications a JOIN users u ON u.id=a.user_id WHERE a.id NOT IN (SELECT application_id FROM application_identity) ORDER BY a.created_at');
    foreach ($rows as $r) {
        $user = ['id'=>$r['user_id'],'full_name'=>$r['full_name'],'email'=>$r['email'],'phone'=>$r['phone'],'country'=>$r['country']];
        $quote = json_decode($r['quote_json'], true) ?: [];
        submitApplication($user, $r['id'], ['lang'=>'en','salonName'=>$r['salon_name'],'salonCategory'=>'male','timezone'=>defaultTimezone($r['country']),
            'plan'=>$r['plan'],'quote'=>$quote,'paymentMethod'=>$r['payment_method'],'idLast4'=>$r['identity_last4']], (string)$r['logo'], $r['logo_type'],
            ['legacy'=>true, 'status'=>$r['status'], 'createdAt'=>str_replace(' ','T',$r['created_at']).'Z']);
        runSql('INSERT OR IGNORE INTO application_identity(application_id,user_id,identity_encrypted,identity_hash,created_at) VALUES(?,?,?,?,?)',
            [$r['id'], $r['user_id'], $r['identity_encrypted'], $r['identity_hash'] ?? '', $r['created_at']]);
    }
    saveSetting('applications_migrated', true);
}
// Admins see the full ID number, which never leaves this server.
function withIdentity(array $apps): array {
    foreach ($apps as &$a) {
        $r = one('SELECT identity_encrypted FROM application_identity WHERE application_id=?', [$a['id']]);
        try { $a['identityNumber'] = $r ? decryptId($r['identity_encrypted']) : ''; } catch (Throwable) { $a['identityNumber'] = ''; }
    }
    return $apps;
}
function appIdFrom(string $path, string $suffix): ?string {
    return preg_match('~^/api/(?:admin/)?applications/(SLN-[A-F0-9]{8}-[A-F0-9]{4})'.preg_quote($suffix, '~').'$~D', $path, $m) ? $m[1] : null;
}

// The app shell, with the script and stylesheet URLs stamped with their file times so browsers fetch a new upload
// instead of a cached copy (the modules app.js imports are kept fresh by the no-cache header in .htaccess).
// Every script module gets its file time as a version, through an import map: after a deploy a browser loads exactly
// the new set, never a mix of fresh and cached files. The map is inline, so its hash is allowed in the CSP.
function importMap(): string {
    static $json;
    if ($json!==null) return $json;
    $imports=[];
    $it=new RecursiveIteratorIterator(new RecursiveDirectoryIterator(__DIR__.'/assets',FilesystemIterator::SKIP_DOTS));
    foreach ($it as $f) if ($f->isFile() && str_ends_with($f->getFilename(),'.js')) {
        $rel='/assets/'.strtr(substr($f->getPathname(),strlen(__DIR__.'/assets/')),DIRECTORY_SEPARATOR,'/');
        $imports[$rel]=$rel.'?v='.$f->getMTime();
    }
    ksort($imports);
    return $json=json_encode(['imports'=>$imports],JSON_UNESCAPED_SLASHES);
}
function importMapHash(): string { return "'sha256-".base64_encode(hash('sha256',importMap(),true))."'"; }
function pageHtml(): string {
    $html=(string)file_get_contents(__DIR__.'/page.html');
    foreach (['/assets/app.js','/assets/app.css','/assets/site.css'] as $asset) $html=str_replace('"'.$asset.'"','"'.$asset.'?v='.(@filemtime(__DIR__.$asset)?:0).'"',$html);
    $html=str_replace('<script type="module"','<script type="importmap">'.importMap().'</script>'.PHP_EOL.'  <script type="module"',$html);
    [$attrs,$style,$bg]=themeHead();
    if ($attrs) $html=preg_replace('/<html lang="en" dir="ltr"/','<html lang="en" dir="ltr"'.$attrs,$html,1);
    if ($bg) $html=preg_replace('/<meta name="theme-color" content="[^"]*">/','<meta name="theme-color" content="'.$bg.'">',$html,1);
    if ($style) $html=str_replace('</head>',$style."\n</head>",$html);
    return $html;
}

// ---- Theme (Theme Manager) -----------------------------------------------------------------------------------------
// The browser builds a theme's CSS variables (assets/theme.js); the server only checks their shape and prints them.
const THEME_CATEGORIES=['luxury','light','dark','warm','neutral','feminine','masculine','beauty','minimal','modern'];
const THEME_COLORS=['primary','secondary','accent','background','surface','surface2','text','textSecondary','textMuted','border','success','warning','error','info'];
const THEME_COMPONENTS=['buttonPrimaryBg','buttonPrimaryText','buttonPrimaryHover','buttonSecondaryBg','buttonText','link','navActive','iconAccent','inputFocus','badgeBg','accent3d','highlight3d'];
const THEME_SETTINGS=['effects'=>['off','subtle','enhanced'],'motion'=>['low','normal'],'depth'=>['soft','medium']];
const MAX_CUSTOM_THEMES=40;
const THEME_SETTING_DEFAULTS=['effects'=>'subtle','motion'=>'normal','depth'=>'soft'];
function setting(string $key): mixed {
    $r=one('SELECT value FROM settings WHERE key=?',[$key]);
    return $r?json_decode($r['value'],true):null;
}
function saveSetting(string $key,mixed $value): void {
    runSql("INSERT INTO settings(key,value,updated_at) VALUES(?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",[$key,json_encode($value,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE)]);
}
function themeHexes(mixed $src,array $keys): array {
    if ($src===null) return [];
    if (!is_array($src)) fail(400,'invalidTheme');
    $out=[];
    foreach ($src as $k=>$v) {
        if (!in_array($k,$keys,true) || !is_string($v) || !preg_match('/^#[0-9A-Fa-f]{6}$/D',$v)) fail(400,'invalidTheme');
        $out[$k]=strtoupper($v);
    }
    return $out;
}
function cleanTheme(mixed $t): array {
    if (!is_array($t) || !is_string($t['id']??null) || !preg_match('/^[a-z0-9-]{3,40}$/D',$t['id'])) fail(400,'invalidTheme');
    $name=is_string($t['name']??null)?trim($t['name']):'';
    if (mb_strlen($name)<1 || mb_strlen($name)>60 || preg_match('/[\x00-\x1f<>]/u',$name)) fail(400,'invalidTheme');
    $categories=is_array($t['categories']??null)?array_values(array_intersect(THEME_CATEGORIES,array_filter($t['categories'],'is_string'))):[];
    $settings=[];
    foreach (THEME_SETTINGS as $k=>$allowed) $settings[$k]=in_array($t['settings'][$k]??null,$allowed,true)?$t['settings'][$k]:THEME_SETTING_DEFAULTS[$k];
    return ['id'=>$t['id'],'name'=>$name,'builtIn'=>($t['builtIn']??false)===true,'categories'=>$categories,'colors'=>themeHexes($t['colors']??null,THEME_COLORS),'components'=>themeHexes($t['components']??null,THEME_COMPONENTS),'settings'=>$settings];
}
// Variable names and values may only contain characters that cannot end a CSS declaration or an HTML element.
function cleanThemeVars(mixed $vars): array {
    if (!is_array($vars) || !$vars || count($vars)>120) fail(400,'invalidTheme');
    $out=[];
    foreach ($vars as $k=>$v) {
        if (!is_string($k) || !preg_match('/^--[a-z0-9-]{2,40}$/D',$k) || !is_string($v) || !preg_match('/^[#a-zA-Z0-9(),.%\s-]{1,400}$/D',$v)) fail(400,'invalidTheme');
        $out[$k]=$v;
    }
    return $out;
}
// [html attributes, <style> with the variables, background colour] for the applied theme, or empties for the default.
// The Theme Manager is retired (Oct 2026 redesign): the site has one fixed art direction, so saved themes are no
// longer printed into pages. The saved settings stay in the database, unused.
function themeHead(): array {
    return ['','',null];
    try { $a=setting('theme_active'); } catch (Throwable $e) { error_log('Salonieer theme: '.$e->getMessage()); return ['','',null]; }
    if (!is_array($a) || !is_array($a['vars']??null)) return ['','',null];
    $css=[];
    foreach ($a['vars'] as $k=>$v) if (is_string($k)&&is_string($v)&&preg_match('/^--[a-z0-9-]{2,40}$/D',$k)&&preg_match('/^[#a-zA-Z0-9(),.%\s-]{1,400}$/D',$v)) $css[]=$k.':'.$v;
    $mode=($a['mode']??'')==='dark'?'dark':'light';
    $attrs=' data-mode="'.$mode.'"';
    foreach (THEME_SETTINGS as $k=>$allowed) if (in_array($a['settings'][$k]??null,$allowed,true)) $attrs.=' data-'.$k.'="'.$a['settings'][$k].'"';
    $bg=preg_match('/^#[0-9A-Fa-f]{6}$/D',$a['vars']['--color-background']??'')?$a['vars']['--color-background']:null;
    return [$attrs,'<style id="theme-vars">:root{'.implode(';',$css).'}</style>',$bg];
}
function api(string $method,string $path,array|false $session,array|false $user): never {
    if ($method==='GET'&&$path==='/api/session') {
        // Every page load calls this: keep the Paddle mirror current without cron or inbound webhooks.
        paddleSyncAfterResponse(300);
        // Application emails go out and mailbox replies come in without waiting for the cron job.
        mailWorkAfterResponse(60);
        // Grace reminders and pauses run even when the cron job isn't set up.
        billingWorkAfterResponse(600);
        // 2.46: website users from before move to their METON accounts (once).
        if (identityOn() && setting('identity_import')!=='done') afterResponse('identityImport');
        if (!$session) rateLimit('guest-session',200,3600);
        sendJson(200,['user'=>userDTO($user),'csrf'=>$session?$session['csrf']:newSession(null,$session),'checkout'=>checkoutConfig($user),'google'=>metonGoogleReady()]+(!$user&&($g=metonGoogleSignup())?['googleSignup'=>$g]:[])+($user&&(int)$user['is_admin']?['platform'=>platformConfig()]:[]));
    }
    if ($method==='GET'&&$path==='/api/health') {
        $sqlite=in_array('sqlite',PDO::getAvailableDrivers(),true);$database=false;
        try { $database=(bool)db()->query('SELECT 1')->fetchColumn(); } catch (Throwable $e) { error_log('Salonieer health: '.$e->getMessage()); }
        sendJson(200,['ok'=>$sqlite&&$database,'php'=>PHP_VERSION,'sqlite'=>$sqlite,'database'=>$database]);
    }
    if ($method==='GET'&&$path==='/api/setup') sendJson(200,['available'=>!one('SELECT 1 FROM users WHERE is_admin=1 LIMIT 1')]);
    // 2.34: the salon behind a salon link (/s/<code>): its public name and logo only.
    if ($method==='GET'&&$path==='/api/salon-link') {
        rateLimit('salon-link',600,3600);
        $code=(string)($_GET['code']??'');
        if (!preg_match('/^[A-Za-z0-9_-]{2,64}$/D',$code)) fail(400,'invalidRequest');
        $salon=null;
        // sbRpc only calls website_* functions, so this one public lookup goes through supabaseRequest directly.
        try { [$st,$raw]=supabaseRequest('POST','/rest/v1/rpc/platform_lookup_salon',json_encode(['p_code'=>$code]),['Content-Type: application/json','Accept: application/json']);
            $s=$st>=200&&$st<300?json_decode($raw,true):null; if ($st<200||$st>=300) error_log('Salonieer salon link: HTTP '.$st);
            if (is_array($s)&&!empty($s['slug'])) $salon=['name'=>(string)($s['name']??''),'logo_url'=>preg_match('~^https://~',(string)($s['logo_url']??''))?(string)$s['logo_url']:'','code'=>(string)($s['access_code']??$code)]; }
        catch (Throwable $e) { error_log('Salonieer salon link: '.$e->getMessage()); }
        header('Cache-Control: public, max-age=300');
        sendJson(200,['salon'=>$salon]);
    }
    if ($method==='GET'&&$path==='/api/billing') {
        // Right after a checkout (?fresh=1) the page waits for Paddle's newest events; otherwise it answers at once and
        // the sync runs after the response.
        requireUser($user);
        if (($_GET['fresh']??'')==='1') paddleSync(15); else paddleSyncAfterResponse(60);
        sendJson(200,billingSummary($user));
    }
    if ($method==='GET'&&$path==='/api/challenge') { rateLimit('challenge',120,3600);sendJson(200,newChallenge()); }
    // 2.46: the app's "send the code now" (it can only make already-queued mail go out).
    if ($method==='GET'&&$path==='/api/outbox/kick') identityKick();
    if ($method==='POST'&&$path==='/api/logout') {
        // Idempotent: a second click, an expired session or another tab's logout all end signed out without an error.
        if ($session && $session['user_id']!==null) {
            csrfAndOrigin($session);
            runSql('DELETE FROM sessions WHERE token_hash=?',[$session['token_hash']]);
        }
        setAuthCookie('',-3600);sendJson(200,['ok'=>true]);
    }
    if (!in_array($method,['GET','HEAD'],true)) csrfAndOrigin($session);
    if (str_starts_with($path,'/api/book')||str_starts_with($path,'/api/me/')) metonBookingApi($method,$path,$session);
    if ($path==='/api/drafts') metonDraftsApi($method,$path,$user);
    if (str_starts_with($path,'/api/admin/review')) metonReviewApi($method,$path,$user);
    if (str_starts_with($path,'/api/password/')) metonPasswordApi($method,$path,$session);
    if ($method==='POST'&&$path==='/api/billing/portal') {
        // The customer is resolved from the signed-in session user only; nothing from the request body is used.
        requireUser($user);rateLimit('billing-portal',20,3600,(string)$user['id']);
        sendJson(200,['url'=>paddlePortalUrl($user)]);
    }
    if ($method==='POST'&&$path==='/api/register/google') { if ($user) fail(409,'alreadyLoggedIn'); metonGoogleSignupApi($session); }
    if ($method==='POST'&&$path==='/api/register') {
        if ($user) fail(409,'alreadyLoggedIn');
        // 2.46: the account is a METON account (website and app); identity.php.
        if (identityOn()) identityRegister($session);
        rateLimit('registration',12,3600);$d=body();
        // Hidden field people never see; filled in only by form-filling bots.
        if (($d['website']??'')!=='') fail(400,'invalidRequest');
        requireChallengeIf(recentHits('registration')>3,$d);
        $v=validateRegistration($d);
        db()->exec('BEGIN IMMEDIATE');
        try { ensureAvailable($v);$id=createUser($v,$d['password']);db()->exec('COMMIT'); }
        catch (Throwable $e) { db()->exec('ROLLBACK');throw $e; }
        sendJson(201,['user'=>userDTO(one('SELECT * FROM users WHERE id=?',[$id])),'csrf'=>newSession($id,$session)]);
    }
    if ($method==='POST'&&$path==='/api/setup') {
        rateLimit('setup',10,3600);$d=body();
        requireChallengeIf(recentHits('setup')>3,$d);
        if (!is_string($d['setupKey']??null) || !hash_equals(SETUP_KEY,trim($d['setupKey']))) fail(403,'invalidSetupKey','setupKey');
        $v=validateRegistration($d);
        db()->exec('BEGIN IMMEDIATE');
        try {
            if (one('SELECT 1 FROM users WHERE is_admin=1 LIMIT 1')) fail(409,'setupDone');
            ensureAvailable($v);$id=createUser($v,$d['password'],true);
            db()->exec('COMMIT');
        } catch (Throwable $e) { db()->exec('ROLLBACK');throw $e; }
        sendJson(201,['user'=>userDTO(one('SELECT * FROM users WHERE id=?',[$id])),'csrf'=>newSession($id,$session)]);
    }
    // 2.46: sign in with an email or a phone number of the METON account (identity.php); two more steps when the
    // account must add or confirm an email for the website.
    if ($method==='POST'&&$path==='/api/login/email'&&identityOn()) identityLoginEmail();
    if ($method==='POST'&&$path==='/api/login/verify'&&identityOn()) identityLoginVerify($session);
    if (str_starts_with($path,'/api/account/identity')||in_array($path,['/api/account/email','/api/account/email/verify','/api/account/phone','/api/account/phone/verify','/api/account/link','/api/account/link/finish'],true)) {
        if (!identityOn()) fail(404,'notFound');
        identityApi($method,$path,$user);
    }
    if ($method==='POST'&&$path==='/api/login') {
        if (identityOn()) identityLogin($session);
        rateLimit('login-ip',40,900);$d=body();
        $email=strtolower(cleanText($d['email']??null));$password=$d['password']??null;
        if (!validEmail($email) || !is_string($password) || $password==='' || strlen($password)>512) fail(401,'invalidCredentials');
        $emailBucket=failureBucket('email',$email);$ipBucket=failureBucket('ip',$_SERVER['REMOTE_ADDR']??'unknown');
        if ($wait=lockedFor($emailBucket)) { header('Retry-After: '.$wait);sendJson(429,['error'=>'loginLocked','retryAfter'=>$wait,'field'=>null]); }
        requireChallengeIf(failureState($emailBucket)['fails']>=CHALLENGE_AFTER || failureState($ipBucket)['fails']>=10,$d);
        $found=one('SELECT * FROM users WHERE email=?',[$email]);
        // Unknown emails still pay for a hash check so response times don't reveal which accounts exist.
        $ok=$found ? verifyHash($password,$found['password_hash']) : (password_verify($password,DUMMY_HASH) && false);
        if (!$ok) { recordFailure($emailBucket);recordFailure($ipBucket);fail(401,'invalidCredentials'); }
        clearFailures($emailBucket);
        if ($found['password_hash'] && str_starts_with($found['password_hash'],'$') && password_needs_rehash($found['password_hash'],PASSWORD_DEFAULT)) runSql('UPDATE users SET password_hash=? WHERE id=?',[password_hash($password,PASSWORD_DEFAULT),$found['id']]);
        if (random_int(1,100)===1) runSql('DELETE FROM sessions WHERE expires_at<?',[nowMs()]);
        sendJson(200,['user'=>userDTO($found),'csrf'=>newSession((int)$found['id'],$session)]);
    }
    if ($method==='GET'&&$path==='/api/plans') {
        if ($user) sendJson(200,catalog(userTier($user),['source'=>'account','country'=>$user['country'],'area'=>$user['region']]));
        $tz=is_string($_GET['tz']??null)?substr($_GET['tz'],0,64):'';
        $cc=is_string($_GET['cc']??null)?strtoupper(substr($_GET['cc'],0,2)):'';
        sendJson(200,guestPricing($tz,$cc));
    }
    if ($method==='GET'&&$path==='/api/applications') {
        requireUser($user);
        try { migrateLegacyApplications(); $list=sbRpc('website_applications',['p_user'=>(int)$user['id']]); } catch (Throwable $e) { supabaseFail($e); }
        sendJson(200,['applications'=>$list]);
    }
    if ($method==='GET'&&$path==='/api/salons') {
        // The salons created from this account's approved applications, with their codes, plan and owner login.
        requireUser($user);
        try { sendJson(200,['salons'=>sbRpc('website_my_salons',['p_user'=>(int)$user['id']])]); } catch (Throwable $e) { supabaseFail($e); }
    }
    if ($method==='POST'&&preg_match('~^/api/salons/(SLN-[A-F0-9]{8}-[A-F0-9]{4})/password-saved$~D',$path,$m)) {
        requireUser($user);
        try { sbRpc('website_clear_credential',['p_user'=>(int)$user['id'],'p_id'=>$m[1]]); } catch (Throwable $e) { supabaseFail($e); }
        sendJson(200,['ok'=>true]);
    }
    // ---- Account (2.26): name, password, deletion ----
    if ($method==='PATCH'&&$path==='/api/account') {
        requireUser($user);rateLimit('account-edit',30,3600,(string)$user['id']);$d=body();
        $name=cleanText($d['fullName']??null);
        if (!validFullName($name)) fail(400,'invalidFullName','fullName');
        // Gender is optional here: an account made before 2.41 keeps it empty until the person chooses.
        $gender=$d['gender']??null;
        if ($gender!==null && !in_array($gender,GENDERS,true)) fail(400,'invalidGender','gender');
        // 2.46: the name is the METON account's (the app and every business it is linked to show it too).
        if (identityOn() && !empty($user['account_id'])) {
            $r=idCall('website_account_profile',['p_account'=>$user['account_id'],'p_name'=>$name,'p_gender'=>$gender??'']);
            if (isset($r['error'])) idFail($r,'fullName');
        }
        runSql('UPDATE users SET full_name=?,gender=COALESCE(?,gender) WHERE id=?',[$name,$gender,$user['id']]);
        sendJson(200,['user'=>userDTO(one('SELECT * FROM users WHERE id=?',[$user['id']]))]);
    }
    if ($method==='POST'&&$path==='/api/account/password') {
        // The current password is required; every other signed-in device is signed out.
        requireUser($user);rateLimit('account-password',10,3600,(string)$user['id']);$d=body();
        $current=$d['currentPassword']??null;
        // 2.46: the METON account's password (the same in the app); an account without one (Google) sets its first.
        if (identityOn() && !empty($user['account_id'])) {
            $new=$d['newPassword']??null;
            if ($problem=passwordProblem($new,(string)$user['email'])) fail(400,$problem,'newPassword');
            if ($new!==($d['newPasswordConfirm']??null)) fail(400,'passwordMismatch','newPasswordConfirm');
            $r=idCall('website_account_password',['p_account'=>$user['account_id'],'p_current'=>is_string($current)?$current:'','p_new'=>$new]);
            if (isset($r['error'])) idFail($r,($r['code']??'')==='bad_password'?'currentPassword':'newPassword');
            db()->exec('BEGIN IMMEDIATE');
            try { runSql('UPDATE users SET password_hash=? WHERE id=?',[password_hash($new,PASSWORD_DEFAULT),$user['id']]);runSql('DELETE FROM sessions WHERE user_id=?',[$user['id']]);db()->exec('COMMIT'); }
            catch (Throwable $e) { db()->exec('ROLLBACK');throw $e; }
            sendJson(200,['ok'=>true,'csrf'=>newSession((int)$user['id'],false)]);
        }
        if (!is_string($current)||$current===''||strlen($current)>512||!verifyHash($current,$user['password_hash'])) fail(400,'wrongPassword','currentPassword');
        $new=$d['newPassword']??null;
        if ($problem=passwordProblem($new,$user['email'])) fail(400,$problem,'newPassword');
        if ($new===$current) fail(400,'samePassword','newPassword');
        if ($new!==($d['newPasswordConfirm']??null)) fail(400,'passwordMismatch','newPasswordConfirm');
        db()->exec('BEGIN IMMEDIATE');
        try { runSql('UPDATE users SET password_hash=? WHERE id=?',[password_hash($new,PASSWORD_DEFAULT),$user['id']]);runSql('DELETE FROM sessions WHERE user_id=?',[$user['id']]);db()->exec('COMMIT'); }
        catch (Throwable $e) { db()->exec('ROLLBACK');throw $e; }
        sendJson(200,['ok'=>true,'csrf'=>newSession((int)$user['id'],false)]);
    }
    if ($method==='GET'&&$path==='/api/account/deletion') {
        requireUser($user);
        try { sendJson(200,accountDeletionStatus($user)); } catch (HttpFailure $e) { throw $e; } catch (Throwable $e) { supabaseFail($e); }
    }
    if ($method==='POST'&&$path==='/api/account/delete') {
        // Only without a running subscription (card or cash) or a paid application waiting for approval. Salons, invoices
        // and payment records stay; the website login and its personal data go.
        requireUser($user);rateLimit('account-delete',5,3600,(string)$user['id']);$d=body();
        if ((int)$user['is_admin']) fail(409,'adminCannotDelete');
        if (($d['confirm']??null)!=='DELETE') fail(400,'confirmDelete','confirm');
        // 2.46: the METON account's password (Google-only accounts set one first); the METON account is deleted too.
        $account=identityOn() && !empty($user['account_id']) ? identityAccountOf($user) : null;
        if ($account) {
            if (empty($account['has_password'])) fail(409,'setPasswordFirst','password');
            $ok=is_string($d['password']??null) && $d['password']!=='' && strlen($d['password'])<=512
                && (idCall('website_account_login',['p_identifier'=>$account['email'] ?: $account['phone'],'p_password'=>$d['password'],'p_dial'=>''])['status']??'')==='ok';
            if (!$ok) fail(400,'wrongPassword','password');
        }
        elseif (!is_string($d['password']??null)||$d['password']===''||strlen($d['password'])>512||!verifyHash($d['password'],$user['password_hash'])) fail(400,'wrongPassword','password');
        try {
            if (accountDeletionStatus($user)['blocking']) fail(409,'activeSubscription');
            if (supabaseReady()) sbRpc('website_account_closed',['p_user'=>(int)$user['id']]);
            if ($account) { $r=sbRpc('website_account_delete',['p_account'=>$account['id']]); if (($r['status']??'')!=='ok') throw new RuntimeException('account delete failed'); }
        } catch (HttpFailure $e) { throw $e; } catch (Throwable $e) { supabaseFail($e); }
        db()->exec('BEGIN IMMEDIATE');
        try { runSql('DELETE FROM users WHERE id=?',[$user['id']]);db()->exec('COMMIT'); }
        catch (Throwable $e) { db()->exec('ROLLBACK');throw $e; }
        setAuthCookie('',-3600);sendJson(200,['ok'=>true]);
    }
    // ---- Problem reports: owners of a salon with an active subscription (ops.php) ----
    if ($method==='POST'&&preg_match('~^/api/salons/(SLN-[A-F0-9]{8}-[A-F0-9]{4})/report$~D',$path,$m)) {
        requireUser($user);rateLimit('problem-report',10,3600,(string)$user['id']);
        sendJson(201,['report'=>problemReportCreate($user,$m[1],body())]);
    }
    // ---- 2.27: Help / FAQ shown in the app and the app versions (update check), edited only here ----
    if (str_starts_with($path,'/api/admin/faq')||str_starts_with($path,'/api/admin/app-versions')) {
        requireAdmin($user);
        try {
            if ($method==='GET'&&$path==='/api/admin/faq') sendJson(200,['faq'=>sbRpc('website_faq_list')]);
            if ($method==='POST'&&$path==='/api/admin/faq') { rateLimit('faq-save',120,3600,(string)$user['id']); $d=body(); if (!is_array($d)) fail(400,'invalidRequest'); sendJson(200,['faq'=>sbRpc('website_faq_save',['p_data'=>$d])]); }
            if ($method==='POST'&&$path==='/api/admin/faq/order') {
                $ids=body()['ids']??null; if (!is_array($ids)||count($ids)>500) fail(400,'invalidRequest');
                foreach ($ids as $id) if (!is_string($id)||!preg_match('/^[0-9a-f-]{36}$/D',$id)) fail(400,'invalidRequest');
                sendJson(200,['faq'=>sbRpc('website_faq_reorder',['p_ids'=>array_values($ids)])]);
            }
            if ($method==='DELETE'&&preg_match('~^/api/admin/faq/([0-9a-f-]{36})$~D',$path,$m)) sendJson(200,['faq'=>sbRpc('website_faq_delete',['p_id'=>$m[1]])]);
            if ($method==='GET'&&$path==='/api/admin/app-versions') sendJson(200,['releases'=>sbRpc('website_app_release_list')]);
            if ($method==='PUT'&&preg_match('~^/api/admin/app-versions/(android|ios)$~D',$path,$m)) { $d=body(); if (!is_array($d)) fail(400,'invalidRequest'); sendJson(200,['releases'=>sbRpc('website_app_release_save',['p_platform'=>$m[1],'p_data'=>$d])]); }
        } catch (HttpFailure $e) { throw $e; }
        catch (Throwable $e) { supabaseFail($e); }
        fail(404,'notFound');
    }
    if (str_starts_with($path,'/api/admin/problem-reports')||str_starts_with($path,'/api/admin/cleanup')) {
        requireAdmin($user);
        try {
            if ($method==='GET'&&$path==='/api/admin/problem-reports') sendJson(200,['reports'=>sbRpc('website_problem_reports',['p_status'=>in_array($_GET['status']??'',['open','resolved'],true)?$_GET['status']:''])]);
            if ($method==='PATCH'&&preg_match('~^/api/admin/problem-reports/(\d+)$~D',$path,$m)) {
                $d=body();if (!in_array($d['status']??null,['open','resolved'],true)) fail(400,'invalidRequest','status');
                $note=is_string($d['note']??null)?mb_substr(trim($d['note']),0,1000):null;
                sendJson(200,['report'=>sbRpc('website_problem_report_set',['p_id'=>(int)$m[1],'p_status'=>$d['status'],'p_note'=>$note,'p_actor'=>$user['email']])]);
            }
            if ($method==='GET'&&$path==='/api/admin/cleanup') sendJson(200,cleanupOverview());
            if ($method==='PUT'&&$path==='/api/admin/cleanup') { cleanupSave(body(),$user); sendJson(200,cleanupOverview()); }
            if ($method==='POST'&&$path==='/api/admin/cleanup/run') { rateLimit('cleanup-run',12,3600,(string)$user['id']); $r=cleanupWork(true); sendJson(200,['result'=>$r]+cleanupOverview()); }
        } catch (HttpFailure $e) { throw $e; }
        catch (Throwable $e) { supabaseFail($e); }
        fail(404,'notFound');
    }
    // ---- Salon billing (owner) — billing.php ----
    if (preg_match('~^/api/salons/(SLN-[A-F0-9]{8}-[A-F0-9]{4})/(cancel|resume|pay|change-preview|change-request|change-cancel)$~D',$path,$m)) {
        requireUser($user);rateLimit('billing-action',40,3600,(string)$user['id']);
        [, $app, $action]=$m;
        try {
            if ($method==='POST'&&$action==='change-cancel') { sendJson(200,['ok'=>sbRpc('website_change_request_cancel',['p_user'=>(int)$user['id'],'p_app'=>$app])]); }
            if ($method==='POST'&&$action==='change-request') {
                $d=body();$change=cleanChange($d);$note=is_string($d['note']??null)?mb_substr(trim($d['note']),0,1000):'';
                if (!is_array(sbRpc('website_application',['p_id'=>$app,'p_user'=>(int)$user['id']]))) fail(404,'notFound');
                sendJson(201,['request'=>sbRpc('website_change_request_create',['p_user'=>(int)$user['id'],'p_app'=>$app,'p_requested'=>$change,'p_note'=>$note])]);
            }
            $b=ownerBilling($user,$app);
            if ($method==='POST'&&$action==='cancel') sendJson(200,['billing'=>billingCancel($app,$b)]);
            if ($method==='POST'&&$action==='resume') sendJson(200,['billing'=>billingResume($app,$b)]);
            if ($method==='POST'&&$action==='pay') sendJson(200,['transactionId'=>billingPaymentTransaction($b)]);
            if ($method==='POST'&&$action==='change-preview') { $p=billingPreview($app,$b,cleanChange(body()),$user); unset($p['items']); sendJson(200,['preview'=>$p]); }
        } catch (HttpFailure $e) { throw $e; }
        catch (PaddleApiFailure $e) { error_log('Salonieer billing '.$app.' '.$action.': '.$e->errorCode.' '.$e->getMessage()); fail(502,'billingUnavailable'); }
        catch (Throwable $e) { supabaseFail($e); }
        fail(405,'invalidRequest');
    }
    if ($method==='GET'&&$path==='/api/invoices') { requireUser($user);sendJson(200,['invoices'=>ownerInvoices($user)]); }
    if ($method==='GET'&&preg_match('~^/api/(admin/)?invoices/(txn_[a-z\d]{26})/pdf$~D',$path,$m)) {
        requireUser($user);
        if ($m[1]) requireAdmin($user);
        elseif (!in_array($m[2],array_column(ownerInvoices($user),'id'),true)) fail(404,'notFound');
        try { sendJson(200,['url'=>invoicePdfUrl($m[2])]); } catch (PaddleApiFailure $e) { error_log('Salonieer invoice '.$m[2].': '.$e->getMessage()); fail(502,'billingUnavailable'); }
    }
    // ---- Finance & billing (admin) — billing.php ----
    if (str_starts_with($path,'/api/admin/finance')||str_starts_with($path,'/api/admin/billing')||str_starts_with($path,'/api/admin/change-requests')||str_starts_with($path,'/api/admin/discounts')||str_starts_with($path,'/api/admin/transactions')) {
        requireAdmin($user);
        try {
            if ($method==='GET'&&$path==='/api/admin/finance') { if (($_GET['fresh']??'')==='1') paddleSync(15); sendJson(200,financeOverview()); }
            if ($method==='GET'&&$path==='/api/admin/finance/transactions') sendJson(200,financeTransactions($_GET));
            if ($method==='GET'&&$path==='/api/admin/billing') sendJson(200,['billing'=>sbRpc('website_billing_list')]);
            if ($method==='GET'&&$path==='/api/admin/change-requests') sendJson(200,['requests'=>sbRpc('website_change_requests',['p_status'=>in_array($_GET['status']??'',['pending','charged','failed','rejected','cancelled','all'],true)?$_GET['status']:'all'])]);
            if ($method==='POST'&&preg_match('~^/api/admin/change-requests/(\d+)/reject$~D',$path,$m)) {
                $d=body();$note=is_string($d['note']??null)?mb_substr(trim($d['note']),0,1000):'';
                $r=sbRpc('website_change_request_decide',['p_id'=>(int)$m[1],'p_status'=>'rejected','p_approved'=>null,'p_preview'=>null,'p_note'=>$note,'p_actor'=>$user['email']]);
                mailWorkAfterResponse(0);sendJson(200,['request'=>$r]);
            }
            // 2.26: every salon's billing, setting billing up, cash payments, card links, card <-> cash.
            if ($method==='GET'&&$path==='/api/admin/billing/salons') sendJson(200,['salons'=>sbRpc('website_billing_salons')]);
            if (preg_match('~^/api/admin/billing/salon/([a-z][a-z0-9_]{1,31})(/create)?$~D',$path,$m)) {
                if ($method==='GET'&&empty($m[2])) sendJson(200,adminBillingGet($m[1]));
                if ($method==='POST'&&!empty($m[2])) { rateLimit('billing-create',60,3600,(string)$user['id']); sendJson(200,adminBillingCreate($m[1],body(),$user)); }
            }
            if ($method==='POST'&&preg_match('~^/api/admin/billing/(SLN-[A-F0-9]{8}-[A-F0-9]{4})/(cash-payment|cash-void|cash-update|cash-stop-now|owner|card-link|to-cash|cancel-now|pause|unpause)$~D',$path,$m)) {
                [, $app, $action]=$m;$d=body();rateLimit('billing-admin',200,3600,(string)$user['id']);
                if ($action==='cash-payment') sendJson(200,['billing'=>adminCashPayment($app,$d,$user)]);
                if ($action==='cash-void') {
                    $reason=is_string($d['reason']??null)?mb_substr(trim($d['reason']),0,300):'';
                    if (mb_strlen($reason)<2) fail(400,'reasonRequired','reason');
                    sendJson(200,['billing'=>sbRpc('website_billing_cash_void',['p_app'=>$app,'p_id'=>(int)($d['id']??0),'p_reason'=>$reason,'p_actor'=>$user['email']])]);
                }
                if ($action==='cash-update') sendJson(200,['billing'=>adminCashUpdate($app,$d,$user)]);
                if ($action==='cash-stop-now') { $r=sbRpc('website_billing_cash_stop_now',['p_app'=>$app,'p_actor'=>$user['email']]); mailWorkAfterResponse(0); sendJson(200,['billing'=>$r]); }
                if ($action==='owner') sendJson(200,['billing'=>sbRpc('website_billing_owner_set',['p_app'=>$app,'p_owner'=>cleanBillingOwner($d),'p_actor'=>$user['email']])]);
                $a=sbRpc('website_application',['p_id'=>$app,'p_user'=>null]);
                $b=sbRpc('website_billing_get',['p_app'=>$app,'p_user'=>null]);
                if (!is_array($a)||!is_array($b)) fail(404,'noSubscription');
                if ($action==='card-link') {
                    $change=cleanAdminPlan($d);
                    if ($change['plan']==='enterprise') fail(400,'enterpriseByAgreement','plan');
                    if (($a['email']??'')==='') fail(409,'emailRequired','email');
                    sendJson(200,['link'=>adminCardLink($app,$change,cleanTier($d['tier']??null,(string)($a['country']??'')),(int)($a['websiteUserId']??0),$user)]);
                }
                if ($action==='to-cash') sendJson(200,['billing'=>adminToCash($app,$b,$d,$user)]);
                sendJson(200,['billing'=>adminCardAction($app,$b,$action)]);
            }
            if (preg_match('~^/api/admin/billing/(SLN-[A-F0-9]{8}-[A-F0-9]{4})(?:/(preview|apply|cancel|resume|pay-link|sync))?$~D',$path,$m)) {
                $app=$m[1];$action=$m[2]??'';
                if ($method==='GET'&&$action==='') {
                    $b=sbRpc('website_billing_get',['p_app'=>$app,'p_user'=>null]);
                    sendJson(200,['billing'=>$b,'transactions'=>financeTransactions(['app'=>$app])['items']]);
                }
                if ($method==='POST'&&$action==='sync') {
                    $b=sbRpc('website_billing_get',['p_app'=>$app,'p_user'=>null]);
                    if (!is_array($b)||empty($b['subscriptionId'])) fail(404,'noSubscription');
                    sendJson(200,['billing'=>billingSyncSubscription($b['subscriptionId'])]);
                }
                $b=sbRpc('website_billing_get',['p_app'=>$app,'p_user'=>null]);
                if (!is_array($b)||empty($b['subscriptionId'])) fail(404,'noSubscription');
                if ($method==='POST'&&$action==='preview') { [, $owner]=applicationOwner($app); $p=billingPreview($app,$b,cleanChange(body()),$owner); unset($p['items']); sendJson(200,['preview'=>$p]); }
                if ($method==='POST'&&$action==='apply') {
                    $d=body();$note=is_string($d['note']??null)?mb_substr(trim($d['note']),0,1000):'';
                    $rid=is_int($d['requestId']??null)?$d['requestId']:null;
                    sendJson(200,billingApplyChange($app,cleanChange($d),$rid,$note,$user));
                }
                if ($method==='POST'&&$action==='cancel') sendJson(200,['billing'=>billingCancel($app,$b)]);
                if ($method==='POST'&&$action==='resume') sendJson(200,['billing'=>billingResume($app,$b)]);
                if ($method==='POST'&&$action==='pay-link') {
                    // A Paddle checkout link for the card update / past-due payment, emailed to the owner.
                    $txn=billingPaymentTransaction($b);$link=siteUrl().'/checkout?_ptxn='.$txn;
                    sbRpc('website_queue_mail',['p_app'=>$app,'p_recipient'=>'customer','p_template'=>'pay_link','p_vars'=>['link'=>$link]]);
                    mailWorkAfterResponse(0);sendJson(200,['link'=>$link]);
                }
            }
            if ($method==='POST'&&preg_match('~^/api/admin/transactions/(txn_[a-z\d]{26})/refund$~D',$path,$m)) {
                rateLimit('refund',30,3600,(string)$user['id']);$d=body();
                $type=($d['type']??'full')==='partial'?'partial':'full';
                $amount=$type==='partial'?(int)round(((float)($d['amount']??0))*100):0;
                $reason=is_string($d['reason']??null)?mb_substr(trim($d['reason']),0,200):'';
                if ($reason==='') fail(400,'reasonRequired','reason');
                if ($type==='partial'&&$amount<=0) fail(400,'invalidAmount','amount');
                sendJson(200,['adjustment'=>refundTransaction($m[1],$type,$amount,$reason)]);
            }
            if ($method==='GET'&&$path==='/api/admin/discounts') sendJson(200,['discounts'=>discountsList()]);
            if ($method==='POST'&&$path==='/api/admin/discounts') sendJson(201,['discount'=>discountCreate(body())]);
            if ($method==='PATCH'&&preg_match('~^/api/admin/discounts/(dsc_[a-z\d]{26})$~D',$path,$m)) { $d=body(); sendJson(200,['discount'=>discountSetStatus($m[1],(string)($d['status']??''))]); }
        } catch (HttpFailure $e) { throw $e; }
        catch (PaddleApiFailure $e) {
            // Admins see Paddle's own reason (e.g. an API key without the needed permission); owners never reach this route.
            error_log('Salonieer admin billing: '.$e->errorCode.' '.$e->getMessage());
            sendJson(502,['error'=>$e->httpStatus===403||str_contains($e->errorCode,'forbidden')||str_contains($e->errorCode,'permission')?'paddlePermission':'billingUnavailable','detail'=>'Paddle '.$e->httpStatus.' '.$e->errorCode.': '.mb_substr($e->getMessage(),0,300)]);
        }
        catch (Throwable $e) { supabaseFail($e); }
        fail(404,'notFound');
    }
    if ($method==='POST'&&($id=appIdFrom($path,'/payment-check'))) {
        // The applicant's own application only; answers with its current state either way.
        requireUser($user);rateLimit('payment-check',40,3600,(string)$user['id']);$d=body();
        try { $a=sbRpc('website_application',['p_id'=>$id,'p_user'=>(int)$user['id']]); } catch (Throwable $e) { supabaseFail($e); }
        if (!is_array($a)) fail(404,'notFound');
        if (($a['paymentStatus']??'unpaid')==='unpaid') {
            try { paddleConfirmApplicationPayment($user,$id,is_string($d['transactionId']??null)?$d['transactionId']:''); }
            catch (Throwable $e) { error_log('Salonieer payment check '.$id.': '.$e->getMessage()); try { saveSetting('paddle_confirm_error',['at'=>time(),'app'=>$id,'error'=>substr(get_class($e).': '.$e->getMessage(),0,300)]); } catch (Throwable) {} }
            try { $a=sbRpc('website_application',['p_id'=>$id,'p_user'=>(int)$user['id']]); } catch (Throwable $e) { supabaseFail($e); }
        }
        sendJson(200,['application'=>$a]);
    }
    if ($method==='POST'&&($id=appIdFrom($path,'/messages'))) {
        // The applicant answers on the website; the same thread is what the admin and the app console see.
        requireUser($user);rateLimit('application-message',30,3600,(string)$user['id']);$d=body();
        $text=is_string($d['body']??null)?trim($d['body']):'';
        if (mb_strlen($text)<1||mb_strlen($text)>5000) fail(400,'messageRequired','body');
        $admin=str_starts_with($path,'/api/admin/');
        if ($admin) requireAdmin($user);
        try { $a=sbRpc('website_add_message',['p_id'=>$id,'p_direction'=>$admin?'out':'in','p_author'=>$user['email'],'p_body'=>$text,'p_email_id'=>null,'p_user'=>$admin?null:(int)$user['id']]); }
        catch (Throwable $e) { supabaseFail($e); }
        sendJson(200,['application'=>$admin?withIdentity([$a])[0]:sbRpc('website_application',['p_id'=>$id,'p_user'=>(int)$user['id']])]);
    }
    if ($method==='POST'&&($id=appIdFrom($path,'/test-pay'))) {
        // Admin-only free purchase: marks the application paid exactly like a completed checkout, without charging.
        requireAdmin($user);
        try { sbRpc('website_mark_paid',['p_id'=>$id,'p_method'=>'test_paid','p_reference'=>'TEST','p_actor'=>$user['email'],'p_user'=>null]); }
        catch (Throwable $e) { supabaseFail($e); }
        // As with a real payment, the business goes live at once unless something needs a review.
        metonInstantApprove($id, null);
        sendJson(200,['application'=>sbRpc('website_application',['p_id'=>$id,'p_user'=>null])]);
    }
    if ($method==='POST'&&$path==='/api/applications') {
        requireUser($user);$d=body();
        if (!is_string($d['submissionKey']??null)||!preg_match('/^[a-zA-Z0-9-]{20,64}$/D',$d['submissionKey'])) fail(400,'invalidRequest');
        rateLimit('application-user',20,3600,(string)$user['id']);
        $name=cleanText($d['salonName']??null);
        if (mb_strlen($name)<2||mb_strlen($name)>100||!preg_match('/[\p{L}\p{N}]/u',$name)||preg_match('/[\x00-\x1f<>{}]/u',$name)) fail(400,'invalidSalonName','salonName');
        // The salon's country, chosen on the form (an older page sends none: the account's country is used).
        $country=array_key_exists('country',$d)?$d['country']:$user['country'];
        if (!is_string($country)||!in_array($country,countryList(),true)) fail(400,'invalidCountry','country');
        // An ID number is asked only for salons in Israel or Palestine; any other country sends none and none is kept.
        $idNumber='';$idHash='';
        if (in_array($country,ID_COUNTRIES,true)) {
            // Normalized first, so "123-456-789" and "123 456 789" are the same ID.
            $rawId=normalizeIdNumber($d['identityNumber']??null);
            $idNumber=canonicalIdNumber($rawId,$country);
            if ($idNumber===null) fail(400,ctype_digit($rawId)&&strlen($rawId)>=ID_MIN_DIGITS&&strlen($rawId)<=ID_MAX_CHARS?'fakeId':'invalidId','identityNumber');
            $idHash=idFingerprint($idNumber,$country);
        }
        if (!in_array($d['plan']??null,OFFERED_PLANS,true)) fail(400,'invalidPlan','plan');
        if (!in_array($d['paymentMethod']??null,['card','bank_transfer'],true)) fail(400,'invalidPayment','paymentMethod');
        if (array_key_exists('option',$d) && !in_array($d['option'],BASIC_OPTIONS,true)) fail(400,'invalidAddons');
        if (!is_bool($d['loyalty']??null)||!is_int($d['extraSpecialists']??null)||$d['extraSpecialists']<0||$d['extraSpecialists']>50) fail(400,'invalidAddons');
        $logo=logoData($d['logo']??null);if (!$logo) fail(400,'invalidLogo','logo');
        $currency=$d['currency']??DEFAULT_CURRENCY;if (!in_array($currency,CURRENCIES,true)) fail(400,'invalidCurrency','currency');
        $interval=$d['interval']??'month';if (!in_array($interval,['month','year'],true)) fail(400,'invalidInterval','interval');
        if (array_key_exists('trial',$d) && !is_bool($d['trial'])) fail(400,'invalidRequest');
        $quote=quote($user,$d['plan'],$d['loyalty'],$d['extraSpecialists'],$currency,$interval,($d['trial']??false)===true && $d['paymentMethod']==='card',$d['option']??'loyalty');
        // Two separate classifications (stored for later use); the old salon type is derived from the clientele so the
        // app's existing Discover category keeps working.
        $team=$d['teamComposition']??null;if (!in_array($team,TEAM_COMPOSITIONS,true)) fail(400,'invalidTeamComposition','teamComposition');
        $clientele=$d['clientele']??null;if (!in_array($clientele,CLIENTELES,true)) fail(400,'invalidClientele','clientele');
        $category=$clientele==='women'?'female':'male';
        $timezone=$d['timezone']??defaultTimezone($country);if (!validTimezone($timezone)) fail(400,'invalidTimezone','timezone');
        // The salon's contact and owner sign-in number; the same number may be used on any number of applications.
        $dial=is_string($d['phoneCountry']??null)&&in_array($d['phoneCountry'],countryList(),true)?$d['phoneCountry']:$country;
        // 2.47: optional — the business belongs to the applicant's METON account; a number given here is contact only.
        $rawPhone=trim((string)($d['phone']??''));
        $phone=$rawPhone===''?'':normalizePhone($rawPhone,$dial);if ($phone===null) fail(400,'invalidPhone','phone');
        if (!supabaseReady()) fail(503,'serviceUnavailable');
        // The same submission (a retried click) always maps to the same reference, so it is saved once.
        $key=strtoupper(hash('sha256',$user['id'].':'.$d['submissionKey']));
        $id='SLN-'.substr($key,0,8).'-'.substr($key,8,4);
        // The ID number is saved first (keyed by the reference, so a retry reuses the row). No database lock is held
        // during the logo upload and the Supabase call, so a slow network can't block other requests or time this one out.
        // The same ID number may be used on any number of applications.
        if ($idNumber!=='') runSql('INSERT OR IGNORE INTO application_identity(application_id,user_id,identity_encrypted,identity_hash) VALUES(?,?,?,?)',[$id,$user['id'],encryptId($idNumber),$idHash]);
        try {
            $a=submitApplication($user,$id,['lang'=>siteLang($d['lang']??null),'country'=>$country,'salonName'=>$name,'salonCategory'=>$category,'teamComposition'=>$team,'clientele'=>$clientele,'timezone'=>$timezone,'phone'=>$phone,'plan'=>$d['plan'],
                'quote'=>$quote,'paymentMethod'=>$d['paymentMethod'],'idLast4'=>$idNumber===''?'':mb_substr($idNumber,-4)],$logo['bytes'],$logo['type']);
        } catch (Throwable $e) { supabaseFail($e); }
        sendJson(201,['application'=>$a]);
    }
    if ($method==='GET'&&preg_match('~^/api/applications/(SLN-[A-F0-9-]+)/logo$~D',$path,$m)) {
        requireUser($user);$r=one('SELECT user_id,logo,logo_type FROM applications WHERE id=?',[$m[1]]);
        if (!$r || ((int)$r['user_id']!==(int)$user['id'] && !(int)$user['is_admin'])) fail(404,'notFound');
        header('Content-Type: '.$r['logo_type']);header('Content-Disposition: inline; filename="salon-logo"');echo $r['logo'];exit;
    }
    if ($method==='GET'&&$path==='/api/admin/applications') {
        requireAdmin($user);
        try { migrateLegacyApplications(); $list=sbRpc('website_admin_applications',['p_status'=>'all']); } catch (Throwable $e) { supabaseFail($e); }
        sendJson(200,['applications'=>applicationReviewFlags(withIdentity($list))]);
    }
    if ($method==='GET'&&($id=appIdFrom($path,'/suggest'))) {
        requireAdmin($user);
        try { sendJson(200,sbRpc('website_suggest_identity',['p_id'=>$id])); } catch (Throwable $e) { supabaseFail($e); }
    }
    if ($method==='POST'&&($id=appIdFrom($path,'/mark-paid'))) {
        // A bank transfer that has arrived (card payments are marked automatically from Paddle).
        requireAdmin($user);$d=body();
        $ref=is_string($d['reference']??null)?mb_substr(trim($d['reference']),0,120):'';
        try { $a=sbRpc('website_mark_paid',['p_id'=>$id,'p_method'=>'paid','p_reference'=>$ref!==''?$ref:'bank transfer','p_actor'=>$user['email'],'p_user'=>null]); }
        catch (Throwable $e) { supabaseFail($e); }
        // 2026-11-08: no separate approval step: a confirmed transfer publishes the business unless it needs a review.
        metonInstantApprove($id, null);
        try { $a=sbRpc('website_application',['p_id'=>$id,'p_user'=>null]) ?: $a; } catch (Throwable $e) {}
        sendJson(200,['application'=>withIdentity([$a])[0]]);
    }
    if ($method==='POST'&&($id=appIdFrom($path,'/approve'))) {
        // Creates the salon in the Salonieer app with the purchased plan and the owner's login, then emails the customer.
        requireAdmin($user);$d=body();
        $o=[];
        // 2.41: who works there and who it serves (the applicant's answers unless corrected here); the older salon
        // type follows the clientele in the database.
        foreach (['slug'=>'slug','accessCode'=>'access_code','salonCategory'=>'salon_category','teamComposition'=>'team_composition','clientele'=>'clientele','timezone'=>'timezone','ownerPhone'=>'owner_phone'] as $from=>$to)
            if (is_string($d[$from]??null) && trim($d[$from])!=='') $o[$to]=mb_substr(trim($d[$from]),0,64);
        if (isset($o['salon_category']) && !in_array($o['salon_category'],SALON_CATEGORIES,true)) fail(400,'invalidCategory','salonCategory');
        if (isset($o['team_composition']) && !in_array($o['team_composition'],TEAM_COMPOSITIONS,true)) fail(400,'invalidTeamComposition','teamComposition');
        if (isset($o['clientele']) && !in_array($o['clientele'],CLIENTELES,true)) fail(400,'invalidClientele','clientele');
        if (isset($o['timezone']) && !validTimezone($o['timezone'])) fail(400,'invalidTimezone','timezone');
        try { $a=sbRpc('website_approve',['p_id'=>$id,'p_overrides'=>(object)$o,'p_actor'=>$user['email']]); } catch (Throwable $e) { supabaseFail($e); }
        mailWorkAfterResponse(0);
        sendJson(200,['application'=>withIdentity([$a])[0]]);
    }
    if ($path==='/api/admin/theme') { requireAdmin($user); sendJson(410,['error'=>'notFound']); }
    if ($method==='GET'&&$path==='/api/admin/theme') {
        requireAdmin($user);
        $active=setting('theme_active');$custom=setting('theme_custom');
        sendJson(200,['active'=>is_array($active)?['theme'=>$active['theme']??null,'updatedAt'=>$active['updatedAt']??null]:null,'custom'=>is_array($custom)?$custom:[]]);
    }
    if ($method==='PUT'&&$path==='/api/admin/theme') {
        requireAdmin($user);rateLimit('theme-save',120,3600,(string)$user['id']);$d=body();
        if (!is_array($d['custom']??null) || !array_is_list($d['custom'])) fail(400,'invalidTheme');
        if (count($d['custom'])>MAX_CUSTOM_THEMES) fail(400,'tooManyThemes');
        $custom=array_map('cleanTheme',$d['custom']);
        foreach ($custom as $c) if ($c['builtIn']) fail(400,'invalidTheme');
        if (count(array_unique(array_column($custom,'id')))!==count($custom)) fail(400,'invalidTheme');
        $active=null;
        if (isset($d['active'])) {
            $a=$d['active'];if (!is_array($a)) fail(400,'invalidTheme');
            $theme=cleanTheme($a['theme']??null);$vars=cleanThemeVars($a['vars']??null);
            $settings=[];foreach (THEME_SETTINGS as $k=>$allowed) $settings[$k]=in_array($a['settings'][$k]??null,$allowed,true)?$a['settings'][$k]:$theme['settings'][$k];
            $active=['theme'=>$theme,'vars'=>$vars,'mode'=>($a['mode']??'')==='dark'?'dark':'light','settings'=>$settings,'updatedAt'=>gmdate('c'),'by'=>(int)$user['id']];
        }
        db()->exec('BEGIN IMMEDIATE');
        try { saveSetting('theme_custom',$custom); if ($active) saveSetting('theme_active',$active); db()->exec('COMMIT'); }
        catch (Throwable $e) { db()->exec('ROLLBACK');throw $e; }
        sendJson(200,['ok'=>true]);
    }
    if ($method==='PATCH'&&preg_match('~^/api/admin/applications/(SLN-[A-F0-9-]+)$~D',$path,$m)) {
        // Review status, a request for more information, or a decline. Approval has its own endpoint (it builds the salon).
        requireAdmin($user);$d=body();if (!in_array($d['status']??null,array_diff(STATUSES,['approved']),true)) fail(400,'invalidStatus');
        $note=is_string($d['note']??null)?mb_substr(trim($d['note']),0,5000):'';
        try { $a=sbRpc('website_set_status',['p_id'=>$m[1],'p_status'=>$d['status'],'p_note'=>$note,'p_actor'=>$user['email']]); } catch (Throwable $e) { supabaseFail($e); }
        sendJson(200,['ok'=>true,'application'=>withIdentity([$a])[0]]);
    }
    fail(404,'notFound');
}
// cron.php (command line only): background jobs, then stop before any HTTP handling.
if (defined('SALONIEER_CRON')) {
    try { paddleSync(0); } catch (Throwable $e) { error_log('Salonieer cron Paddle: '.$e->getMessage()); }
    try { fxRates(); } catch (Throwable $e) { error_log('Salonieer cron rates: '.$e->getMessage()); }
    billingWork(0, true);
    mailWork(0, true);
    // 2.46: website users from before move to their METON accounts (once; also after a page load).
    try { identityImport(); } catch (Throwable $e) { error_log('Salonieer cron identity: '.$e->getMessage()); }
    exit;
}
header('X-Content-Type-Options: nosniff');header('X-Frame-Options: DENY');header('Referrer-Policy: same-origin');
header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
// Paddle.js (checkout overlay) loads from cdn.paddle.com, frames buy.paddle.com and adds its own overlay styles.
// The admin panel talks to Supabase from the browser (connect-src). Images may come from any https host, since salon logos can be links.
$supabaseOrigin='';
try { $u=parse_url(supabaseUrl()); if (preg_match('/^[a-z0-9.-]+$/D',$u['host']??'')) $supabaseOrigin=' '.$u['scheme'].'://'.$u['host'].(isset($u['port'])?':'.$u['port']:''); } catch (Throwable) {}
header("Content-Security-Policy: default-src 'self'; script-src 'self' ".importMapHash()." https://cdn.paddle.com https://public.profitwell.com; style-src 'self' 'unsafe-inline' https://cdn.paddle.com; img-src 'self' data: blob: https:; connect-src 'self'$supabaseOrigin https://api.country.is https://*.paddle.com https://*.profitwell.com; frame-src https://buy.paddle.com https://sandbox-buy.paddle.com; font-src 'self' https://cdn.paddle.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");
header('Cache-Control: no-store');header('Vary: Cookie');
if (cookieName()==='__Host-salonieer') header('Strict-Transport-Security: max-age=31536000');
try {
    $path=rawurldecode(parse_url($_SERVER['REQUEST_URI']??'/',PHP_URL_PATH)?:'/');
    $method=strtoupper($_SERVER['REQUEST_METHOD']??'GET');
    // Server-to-server from Paddle: authenticated by its signature, so no cookies, session or CSRF.
    if ($path==='/api/paddle/webhook') paddleWebhook($method);
    $session=sessionRow();
    $user=$session && $session['user_id']!==null ? one('SELECT * FROM users WHERE id=?',[$session['user_id']]) : false;
    if (str_starts_with($path,'/api/')) api($method,$path,$session,$user);
    if (!in_array($method,['GET','HEAD'],true)) fail(405,'invalidRequest');
    $route=preg_replace('~\.html$~','',$path);$route=rtrim($route,'/')?:'/';if ($route==='/index') $route='/';
    // METON 2.44: Google sign-in for business accounts (only when configured).
    if ($route==='/auth/google'||$route==='/auth/google/callback') metonGoogleRoute($route,$session);
    // /checkout is Paddle's default payment link (invoices, card updates, payment links): it opens checkout for ?_ptxn=.
    // /invite: team invitation links (https://salonieer.com/invite?code=INV-…) are opened by people without a website account.
    $public=['/','/login','/register','/support','/privacy','/terms','/refund','/plans','/setup','/checkout','/invite'];$private=['/apply','/applications','/account','/admin'];
    // 2.34: a salon's own link (https://salonieer.com/s/<code>), shared on Instagram / WhatsApp.
    if (preg_match('~^/s/[A-Za-z0-9_-]{2,64}$~D',$route)) $public[]=$route;
    // METON 2.44: a booking's private link (/m/<token>), My bookings, and Try METON Free.
    if (preg_match('~^/m/[a-f0-9]{48}$~D',$route)||preg_match('~^/try(/(customer|business))?$~D',$route)||$route==='/me'||$route==='/forgot') $public[]=$route;
    $adminPanel=str_starts_with($route,'/admin/');
    if ((in_array($route,$private,true)||$adminPanel)&&!$user) redirectTo('/login?next='.rawurlencode($route.(empty($_SERVER['QUERY_STRING'])?'':'?'.$_SERVER['QUERY_STRING'])));
    if (($route==='/admin'||$adminPanel)&&!$user['is_admin']) redirectTo('/applications');
    if (in_array($route,['/login','/register'],true)&&$user) redirectTo('/plans');
    if (in_array($route,array_merge($public,$private),true)||$adminPanel) {header('Content-Type: text/html; charset=utf-8');if ($method!=='HEAD') echo pageHtml();exit;}
    [$themeAttrs,$themeStyle]=themeHead();
    http_response_code(404);header('Content-Type: text/html; charset=utf-8');echo '<!doctype html><html lang="en"'.$themeAttrs.'><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Page not found · METON</title><link rel="icon" href="/assets/brand/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/app.css"><link rel="stylesheet" href="/assets/site.css">'.$themeStyle.'<main class="wrap empty-state"><img src="/assets/brand/meton-wordmark-ink.svg" alt="METON" width="180" height="36" style="display:block;margin:0 auto 24px;height:auto"><h1>Page not found</h1><p>This page doesn’t exist or has moved.</p><a class="btn primary" href="/">Back to METON</a></main></html>';
} catch (HttpFailure $e) {
    if ($e->status===429) header('Retry-After: 900');
    sendJson($e->status,['error'=>$e->errorCode,'field'=>$e->field]);
} catch (Throwable $e) {
    error_log('Salonieer request failed: '.$e->getMessage());
    sendJson(500,['error'=>'serverError']);
}
