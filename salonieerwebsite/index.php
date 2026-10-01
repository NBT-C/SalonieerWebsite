<?php
declare(strict_types=1);

// Upload the contents of this folder into your document root (htdocs on InfinityFree).
// The private folder (database + encryption key) is created automatically on first visit:
// beside the document root when the host allows it, otherwise inside it at /salonieer-private (blocked from the web).
// Open /setup once to create the first admin account using SETUP_KEY below.
const SETUP_KEY = 'dd48a99c97b7af80d9';
const SESSION_SECONDS = 604800;
const STATUSES = ['pending','in_review','needs_info','approved','declined'];
const PLANS = ['basic','pro','business','enterprise'];
define('SALONIEER',true);
require __DIR__.'/paddle.php';

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
    return ['id'=>(int)$user['id'],'username'=>$user['username'],'fullName'=>$user['full_name'],'email'=>$user['email'],'phone'=>$user['phone'],'country'=>$user['country'],'region'=>$user['region'],'isAdmin'=>(bool)$user['is_admin']];
}
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
    if (!is_array($data) || array_is_list($data)) fail(400,'invalidRequest');
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
    $v=[];
    foreach (['username','fullName','email','phone'] as $field) $v[$field]=is_string($d[$field]??null)?trim($d[$field]):'';
    $v['email']=strtolower($v['email']);
    $v['phone']=preg_replace('/[\s().-]/u','',$v['phone']);$v['phone']=preg_replace('/^00/','+',$v['phone']);
    if (!preg_match('/^[\p{L}\p{N}_.-]{3,32}$/uD',$v['username'])) fail(400,'invalidUsername','username');
    if (mb_strlen($v['fullName'])<3 || mb_strlen($v['fullName'])>100 || preg_match('/[\x00-\x1f<>]/',$v['fullName'])) fail(400,'invalidFullName','fullName');
    if (strlen($v['email'])>254 || !filter_var($v['email'],FILTER_VALIDATE_EMAIL)) fail(400,'invalidEmail','email');
    if (!preg_match('/^\+[1-9][0-9]{7,14}$/D',$v['phone'])) fail(400,'invalidPhone','phone');
    $countries=countryList();
    if (!in_array($d['country']??null,$countries,true)) fail(400,'invalidCountry','country');
    $v['country']=$d['country'];$v['region']=$v['country']==='PS'?($d['region']??''):'';
    if ($v['country']==='PS' && !in_array($v['region'],['WEST_BANK','GAZA','OTHER'],true)) fail(400,'invalidRegion','region');
    $password=$d['password']??null;
    if (!is_string($password) || mb_strlen($password)<10 || mb_strlen($password)>128) fail(400,'invalidPassword','password');
    if ($password!==($d['passwordConfirm']??null)) fail(400,'passwordMismatch','passwordConfirm');
    return $v;
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
const CURRENCIES = ['USD','ILS'];
const DEFAULT_CURRENCY = 'USD';
const PRICES = [
    'standard' => [
        'USD' => ['plans'=>[39,85,139,null], 'loyalty'=>9, 'specialist'=>9],
        'ILS' => ['plans'=>[130,280,459,null], 'loyalty'=>30, 'specialist'=>30],
    ],
    'west_bank' => [
        'USD' => ['plans'=>[19,42,69,null], 'loyalty'=>5, 'specialist'=>5],
        'ILS' => ['plans'=>[65,140,229,null], 'loyalty'=>15, 'specialist'=>15],
    ],
];
// Paddle checkout. The client-side token and price IDs are public (they're sent to the browser); secrets stay in .env.
// One Paddle price per plan, billed monthly; null = no online checkout (Enterprise is priced by agreement).
const PADDLE_CLIENT_TOKEN = 'live_6bf8f0eeffe1dc28b1c91119561';
const PADDLE_PRICE_IDS = ['basic'=>'pri_01m3w0a3ydswgs640dgrp2w14r','pro'=>'pri_01m3w0fb4pcqmje2qmqjgkqjby','business'=>'pri_01m3w0gw93sr9cbrm48hcpdrvr','enterprise'=>null];
function checkoutConfig(): array {
    return ['clientToken'=>PADDLE_CLIENT_TOKEN,'environment'=>str_starts_with(PADDLE_CLIENT_TOKEN,'test_')?'sandbox':'production','prices'=>array_filter(PADDLE_PRICE_IDS)];
}
function userTier(array $user): string { return $user['country']==='PS'&&$user['region']==='WEST_BANK'?'west_bank':'standard'; }
function catalog(string $tier, array $meta=[]): array {
    $names=['Basic','Pro','Business','Enterprise'];$spec=[1,7,16,null];
    $features=[['oneSpecialist','coreSystem','bookingsCustomers','salonSettings'],['allBasic','sevenSpecialists','productsPage','analytics'],['allPro','sixteenSpecialists','loyaltyIncluded','largerCapacity'],['allFeatures','unlimitedSpecialists','loyaltyIncluded','customAddons','dedicatedSupport']];
    $plans=[];
    foreach (PLANS as $i=>$id) {
        $prices=[];foreach (CURRENCIES as $cur) $prices[$cur]=PRICES[$tier][$cur]['plans'][$i];
        $plans[]=['id'=>$id,'name'=>$names[$i],'prices'=>$prices,'specialists'=>$spec[$i],'features'=>$features[$i]];
    }
    $addons=['loyalty'=>[],'specialist'=>[]];
    foreach (CURRENCIES as $cur) { $addons['loyalty'][$cur]=PRICES[$tier][$cur]['loyalty'];$addons['specialist'][$cur]=PRICES[$tier][$cur]['specialist']; }
    return ['currencies'=>CURRENCIES,'defaultCurrency'=>DEFAULT_CURRENCY,'region'=>$tier,'plans'=>$plans,'addons'=>$addons]+$meta;
}
function quote(array $user,string $plan,bool $loyalty,int $extra,string $currency): array {
    $tier=userTier($user);$p=PRICES[$tier][$currency];$i=array_search($plan,PLANS,true);$base=$p['plans'][$i];
    $loyalty=$loyalty && !in_array($plan,['business','enterprise'],true);
    $extra=$plan==='enterprise'?0:$extra;
    return ['plan'=>$plan,'currency'=>$currency,'region'=>$tier,'base'=>$base,'loyalty'=>$loyalty,'extraSpecialists'=>$extra,'loyaltyPrice'=>$loyalty?$p['loyalty']:0,'specialistPrice'=>$p['specialist'],'total'=>$base===null?null:$base+($loyalty?$p['loyalty']:0)+$extra*$p['specialist']];
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
        $r=@file_get_contents($url,false,stream_context_create(['http'=>['timeout'=>3,'header'=>"Accept: application/json\r\nUser-Agent: Salonieer/1.0\r\n"]]));
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
    // Palestinian IPs get West Bank pricing unless the device clock is set to Gaza.
    $tier=($country==='PS' && $timeZone!=='Asia/Gaza')?'west_bank':'standard';
    return catalog($tier,['source'=>$country?'location':'default','country'=>$country]);
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
function api(string $method,string $path,array|false $session,array|false $user): never {
    if ($method==='GET'&&$path==='/api/session') {
        // Every page load calls this: keep the Paddle mirror current without cron or inbound webhooks.
        paddleSyncAfterResponse(300);
        if (!$session) rateLimit('guest-session',200,3600);
        sendJson(200,['user'=>userDTO($user),'csrf'=>$session?$session['csrf']:newSession(null,$session),'checkout'=>checkoutConfig()]);
    }
    if ($method==='GET'&&$path==='/api/health') {
        $sqlite=in_array('sqlite',PDO::getAvailableDrivers(),true);$database=false;
        try { $database=(bool)db()->query('SELECT 1')->fetchColumn(); } catch (Throwable $e) { error_log('Salonieer health: '.$e->getMessage()); }
        sendJson(200,['ok'=>$sqlite&&$database,'php'=>PHP_VERSION,'sqlite'=>$sqlite,'database'=>$database]);
    }
    if ($method==='GET'&&$path==='/api/setup') sendJson(200,['available'=>!one('SELECT 1 FROM users WHERE is_admin=1 LIMIT 1')]);
    if ($method==='GET'&&$path==='/api/billing') { requireUser($user);paddleSync(15);sendJson(200,billingSummary($user)); }
    if (!in_array($method,['GET','HEAD'],true)) csrfAndOrigin($session);
    if ($method==='POST'&&$path==='/api/billing/portal') {
        // The customer is resolved from the signed-in session user only; nothing from the request body is used.
        requireUser($user);rateLimit('billing-portal',20,3600,(string)$user['id']);
        sendJson(200,['url'=>paddlePortalUrl($user)]);
    }
    if ($method==='POST'&&$path==='/api/register') {
        if ($user) fail(409,'alreadyLoggedIn');
        rateLimit('registration',12,3600);$d=body();$v=validateRegistration($d);
        $hash=password_hash($d['password'],PASSWORD_DEFAULT);
        try {
            runSql('INSERT INTO users(username,full_name,email,phone,country,region,password_hash) VALUES(?,?,?,?,?,?,?)',[$v['username'],$v['fullName'],$v['email'],$v['phone'],$v['country'],$v['region'],$hash]);
            $id=(int)db()->lastInsertId();
        } catch (PDOException $e) { if (str_contains($e->getMessage(),'UNIQUE constraint failed')) fail(409,'accountExists');throw $e; }
        sendJson(201,['user'=>userDTO(one('SELECT * FROM users WHERE id=?',[$id])),'csrf'=>newSession($id,$session)]);
    }
    if ($method==='POST'&&$path==='/api/setup') {
        rateLimit('setup',10,3600);$d=body();
        if (!is_string($d['setupKey']??null) || !hash_equals(SETUP_KEY,trim($d['setupKey']))) fail(403,'invalidSetupKey','setupKey');
        $v=validateRegistration($d);$hash=password_hash($d['password'],PASSWORD_DEFAULT);
        db()->exec('BEGIN IMMEDIATE');
        try {
            if (one('SELECT 1 FROM users WHERE is_admin=1 LIMIT 1')) fail(409,'setupDone');
            runSql('INSERT INTO users(username,full_name,email,phone,country,region,password_hash,is_admin) VALUES(?,?,?,?,?,?,?,1)',[$v['username'],$v['fullName'],$v['email'],$v['phone'],$v['country'],$v['region'],$hash]);
            $id=(int)db()->lastInsertId();
            db()->exec('COMMIT');
        } catch (PDOException $e) { db()->exec('ROLLBACK');if (str_contains($e->getMessage(),'UNIQUE constraint failed')) fail(409,'accountExists');throw $e;
        } catch (Throwable $e) { db()->exec('ROLLBACK');throw $e; }
        sendJson(201,['user'=>userDTO(one('SELECT * FROM users WHERE id=?',[$id])),'csrf'=>newSession($id,$session)]);
    }
    if ($method==='POST'&&$path==='/api/login') {
        rateLimit('login-ip',40,900);$d=body();$email=is_string($d['email']??null)?substr(strtolower(trim($d['email'])),0,254):'';
        rateLimit('login-email',10,900,$email);
        if (!is_string($d['password']??null)||strlen($d['password'])>512) fail(401,'invalidCredentials');
        $found=one('SELECT * FROM users WHERE email=?',[$email]);
        if (!$found || !verifyHash($d['password'],$found['password_hash'])) fail(401,'invalidCredentials');
        runSql('DELETE FROM rate_limits WHERE bucket=?',[digest('login-email:'.$email)]);
        sendJson(200,['user'=>userDTO($found),'csrf'=>newSession((int)$found['id'],$session)]);
    }
    if ($method==='POST'&&$path==='/api/logout') {
        if ($session) runSql('DELETE FROM sessions WHERE token_hash=?',[$session['token_hash']]);
        setAuthCookie('',-3600);sendJson(200,['ok'=>true]);
    }
    if ($method==='GET'&&$path==='/api/plans') {
        if ($user) sendJson(200,catalog(userTier($user),['source'=>'account','country'=>$user['country'],'area'=>$user['region']]));
        $tz=is_string($_GET['tz']??null)?substr($_GET['tz'],0,64):'';
        $cc=is_string($_GET['cc']??null)?strtoupper(substr($_GET['cc'],0,2)):'';
        sendJson(200,guestPricing($tz,$cc));
    }
    if ($method==='GET'&&$path==='/api/applications') {
        requireUser($user);
        $list=rows('SELECT id,salon_name,plan,quote_json,payment_method,status,created_at,identity_last4 FROM applications WHERE user_id=? ORDER BY created_at DESC,id DESC',[$user['id']]);
        sendJson(200,['applications'=>array_map('applicationDTO',$list)]);
    }
    if ($method==='POST'&&$path==='/api/applications') {
        requireUser($user);$d=body();
        if (!is_string($d['submissionKey']??null)||!preg_match('/^[a-zA-Z0-9-]{20,64}$/D',$d['submissionKey'])) fail(400,'invalidRequest');
        $existing=one('SELECT * FROM applications WHERE user_id=? AND submission_key=?',[$user['id'],$d['submissionKey']]);
        if ($existing) sendJson(200,['application'=>applicationDTO($existing)]);
        rateLimit('application-user',20,3600,(string)$user['id']);
        $name=is_string($d['salonName']??null)?trim($d['salonName']):'';
        $idNumber=is_string($d['identityNumber']??null)?trim($d['identityNumber']):'';
        if (mb_strlen($name)<2||mb_strlen($name)>100||preg_match('/[\x00-\x1f<>]/',$name)) fail(400,'invalidSalonName','salonName');
        if (!preg_match('/^[\p{L}\p{N} -]{5,30}$/uD',$idNumber)) fail(400,'invalidId','identityNumber');
        if (!in_array($d['plan']??null,PLANS,true)) fail(400,'invalidPlan','plan');
        if (!in_array($d['paymentMethod']??null,['card','bank_transfer'],true)) fail(400,'invalidPayment','paymentMethod');
        if (!is_bool($d['loyalty']??null)||!is_int($d['extraSpecialists']??null)||$d['extraSpecialists']<0||$d['extraSpecialists']>50) fail(400,'invalidAddons');
        $logo=logoData($d['logo']??null);if (!$logo) fail(400,'invalidLogo','logo');
        $currency=$d['currency']??DEFAULT_CURRENCY;if (!in_array($currency,CURRENCIES,true)) fail(400,'invalidCurrency','currency');
        $quote=quote($user,$d['plan'],$d['loyalty'],$d['extraSpecialists'],$currency);
        $id='SLN-'.strtoupper(bin2hex(random_bytes(4))).'-'.strtoupper(bin2hex(random_bytes(2)));
        $s=db()->prepare('INSERT INTO applications(id,user_id,submission_key,salon_name,identity_encrypted,identity_last4,logo,logo_type,plan,quote_json,payment_method) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
        $s->bindValue(1,$id);$s->bindValue(2,$user['id'],PDO::PARAM_INT);$s->bindValue(3,$d['submissionKey']);$s->bindValue(4,$name);$s->bindValue(5,encryptId($idNumber));$s->bindValue(6,mb_substr($idNumber,-4));$s->bindValue(7,$logo['bytes'],PDO::PARAM_LOB);$s->bindValue(8,$logo['type']);$s->bindValue(9,$d['plan']);$s->bindValue(10,json_encode($quote));$s->bindValue(11,$d['paymentMethod']);$s->execute();
        sendJson(201,['application'=>applicationDTO(one('SELECT * FROM applications WHERE id=?',[$id]))]);
    }
    if ($method==='GET'&&preg_match('~^/api/applications/(SLN-[A-F0-9-]+)/logo$~D',$path,$m)) {
        requireUser($user);$r=one('SELECT user_id,logo,logo_type FROM applications WHERE id=?',[$m[1]]);
        if (!$r || ((int)$r['user_id']!==(int)$user['id'] && !(int)$user['is_admin'])) fail(404,'notFound');
        header('Content-Type: '.$r['logo_type']);header('Content-Disposition: inline; filename="salon-logo"');echo $r['logo'];exit;
    }
    if ($method==='GET'&&$path==='/api/admin/applications') {
        requireAdmin($user);
        $list=rows('SELECT a.*,u.full_name,u.email,u.phone,u.country,u.region FROM applications a JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC,a.id DESC LIMIT 500');
        sendJson(200,['applications'=>array_map(static fn($r)=>applicationDTO($r,true),$list)]);
    }
    if ($method==='PATCH'&&preg_match('~^/api/admin/applications/(SLN-[A-F0-9-]+)$~D',$path,$m)) {
        requireAdmin($user);$d=body();if (!in_array($d['status']??null,STATUSES,true)) fail(400,'invalidStatus');
        if (!runSql("UPDATE applications SET status=?,updated_at=datetime('now') WHERE id=?",[$d['status'],$m[1]])) fail(404,'notFound');
        sendJson(200,['ok'=>true]);
    }
    fail(404,'notFound');
}
header('X-Content-Type-Options: nosniff');header('X-Frame-Options: DENY');header('Referrer-Policy: same-origin');
header('Permissions-Policy: camera=(), microphone=(), geolocation=()');
// Paddle.js (checkout overlay) loads from cdn.paddle.com, frames buy.paddle.com and adds its own overlay styles.
header("Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.paddle.com https://public.profitwell.com; style-src 'self' 'unsafe-inline' https://cdn.paddle.com; img-src 'self' data: blob: https://cdn.paddle.com; connect-src 'self' https://api.country.is https://*.paddle.com https://*.profitwell.com; frame-src https://buy.paddle.com https://sandbox-buy.paddle.com; font-src 'self' https://cdn.paddle.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");
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
    $public=['/','/login','/register','/support','/privacy','/terms','/refund','/plans','/setup'];$private=['/apply','/applications','/account','/admin'];
    if (in_array($route,$private,true)&&!$user) redirectTo('/login?next='.rawurlencode($route.(empty($_SERVER['QUERY_STRING'])?'':'?'.$_SERVER['QUERY_STRING'])));
    if ($route==='/admin'&&!$user['is_admin']) redirectTo('/applications');
    if (in_array($route,['/login','/register'],true)&&$user) redirectTo('/plans');
    if (in_array($route,array_merge($public,$private),true)) {header('Content-Type: text/html; charset=utf-8');if ($method!=='HEAD') readfile(__DIR__.'/page.html');exit;}
    http_response_code(404);header('Content-Type: text/html; charset=utf-8');echo '<!doctype html><html lang="en"><meta charset="utf-8"><title>Page not found · Salonieer</title><link rel="stylesheet" href="/assets/app.css"><main class="wrap empty-state"><h1>Page not found</h1><a class="btn primary" href="/">Back to Salonieer</a></main></html>';
} catch (HttpFailure $e) {
    if ($e->status===429) header('Retry-After: 900');
    sendJson($e->status,['error'=>$e->errorCode,'field'=>$e->field]);
} catch (Throwable $e) {
    error_log('Salonieer request failed: '.$e->getMessage());
    sendJson(500,['error'=>'serverError']);
}
