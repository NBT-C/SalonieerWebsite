<?php
declare(strict_types=1);
// Supabase: the shared database of the website and the Salonieer app. Plan applications, payment status, messages,
// the email queue and the salons created from applications live there (backend/website_bridge.sql in Salonieer-KMP).
// The service-role key never leaves the server: it is read from the environment or the private .env file.
if (!defined('SALONIEER')) { http_response_code(404); exit; }

const SUPABASE_DEFAULT_URL = 'https://jauiffbyaibpdtuhgqei.supabase.co';
const SUPABASE_LOGO_BUCKET = 'salon-logos';
// Public by design (it is in the Salonieer app too): the admin panel signs in to Supabase in the browser with it.
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_KhD0mHc3jdbUHdp4Xdc5GA_mVkSEHJc';
function platformConfig(): array { return ['url'=>supabaseUrl(),'key'=>paddleEnv('SUPABASE_PUBLISHABLE_KEY') ?? SUPABASE_PUBLISHABLE_KEY]; }

final class SupabaseFailure extends RuntimeException {
    public function __construct(public string $remoteMessage, public int $httpStatus) { parent::__construct($remoteMessage); }
}
function supabaseUrl(): string {
    $url = rtrim(paddleEnv('SUPABASE_URL') ?? SUPABASE_DEFAULT_URL, '/');
    // http://127.0.0.1 is accepted for local testing only; production is always https.
    if (!preg_match('~^(https://[a-z0-9.-]+|http://127\.0\.0\.1:\d+)$~D', $url)) throw new RuntimeException('SUPABASE_URL is invalid.');
    return $url;
}
function supabaseKey(): ?string { return paddleEnv('SUPABASE_SERVICE_ROLE_KEY'); }
function supabaseReady(): bool { return (bool)supabaseKey(); }
function supabaseRequest(string $method, string $path, ?string $body, array $headers): array {
    $key = supabaseKey();
    if (!$key) throw new RuntimeException('SUPABASE_SERVICE_ROLE_KEY is not set.');
    if (!function_exists('curl_init')) throw new RuntimeException('PHP cURL is required for Supabase.');
    $c = curl_init(supabaseUrl().$path);
    curl_setopt_array($c, [CURLOPT_CUSTOMREQUEST=>$method, CURLOPT_RETURNTRANSFER=>true, CURLOPT_CONNECTTIMEOUT=>8, CURLOPT_TIMEOUT=>25,
        // New secret keys (sb_secret_…) go in the apikey header only; a legacy service_role JWT is also sent as Bearer.
        CURLOPT_FOLLOWLOCATION=>false, CURLOPT_HTTPHEADER=>array_merge(['apikey: '.$key], str_starts_with($key, 'sb_') ? [] : ['Authorization: Bearer '.$key], $headers)]);
    if ($body !== null) curl_setopt($c, CURLOPT_POSTFIELDS, $body);
    $raw = curl_exec($c); $status = (int)curl_getinfo($c, CURLINFO_HTTP_CODE); $error = curl_error($c); curl_close($c);
    if ($raw === false) throw new RuntimeException('Supabase unreachable: '.$error);
    return [$status, (string)$raw];
}
// Calls public.<fn>(args) and returns the decoded JSON result. Database exceptions surface as SupabaseFailure with
// the raw message (e.g. "payment_required"), which callers translate into the site's own error codes.
function sbRpc(string $fn, array $args = []): mixed {
    if (!preg_match('/^website_[a-z_]+$/D', $fn)) throw new InvalidArgumentException('Unexpected RPC name.');
    [$status, $raw] = supabaseRequest('POST', '/rest/v1/rpc/'.$fn, json_encode($args, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE), ['Content-Type: application/json', 'Accept: application/json']);
    $data = $raw === '' ? null : json_decode($raw, true);
    if ($status < 200 || $status >= 300) throw new SupabaseFailure(is_array($data) ? (string)($data['message'] ?? 'rpc_failed') : 'rpc_failed', $status);
    return $data;
}
// Uploads a logo and returns its public URL. The path is unique per application, so re-uploading is an overwrite.
function sbUploadLogo(string $name, string $bytes, string $type): string {
    if (!preg_match('~^[A-Za-z0-9/_.-]{3,120}$~D', $name)) throw new InvalidArgumentException('Bad storage path.');
    [$status, $raw] = supabaseRequest('POST', '/storage/v1/object/'.SUPABASE_LOGO_BUCKET.'/'.$name, $bytes, ['Content-Type: '.$type, 'x-upsert: true', 'Cache-Control: max-age=31536000']);
    if ($status < 200 || $status >= 300) throw new SupabaseFailure('storage_failed: '.substr($raw, 0, 200), $status);
    // SUPABASE_PUBLIC_URL only differs from SUPABASE_URL in local tests (a fake https host for public file links).
    return rtrim(paddleEnv('SUPABASE_PUBLIC_URL') ?? supabaseUrl(), '/').'/storage/v1/object/public/'.SUPABASE_LOGO_BUCKET.'/'.$name;
}
// Maps a database exception to an API error the browser understands.
function supabaseFail(Throwable $e): never {
    if ($e instanceof SupabaseFailure) {
        foreach (['payment_required'=>[409,'paymentRequired'],'already_approved'=>[409,'alreadyApproved'],'application_declined'=>[409,'applicationDeclined'],
            'application_not_found'=>[404,'notFound'],'message_required'=>[400,'messageRequired'],'invalid_message'=>[400,'messageRequired'],
            'invalid_owner_phone'=>[400,'invalidPhone'],'هذا المعرف مستخدم'=>[409,'slugTaken'],'المعرف:'=>[400,'invalidSlug'],'هذا المعرف محجوز'=>[400,'invalidSlug'],
            'رمز الصالون'=>[409,'codeTaken'],'المنطقة الزمنية'=>[400,'invalidTimezone'],'invalid_timezone'=>[400,'invalidTimezone'],
            'not_subscribed'=>[403,'notSubscribed'],'too_many_reports'=>[429,'tooManyReports'],'invalid_report_message'=>[400,'reportMessageInvalid'],
            'invalid_category'=>[400,'invalidRequest'],'report_not_found'=>[404,'notFound'],
            // 2.26 admin billing and accounts
            'account_has_subscription'=>[409,'activeSubscription'],'billing_exists'=>[409,'billingExists'],'billing_not_found'=>[404,'noSubscription'],
            'salon_not_found'=>[404,'notFound'],'payment_not_found'=>[404,'notFound'],'not_cash'=>[409,'notCash'],'already_cash'=>[409,'alreadyCash'],
            'reason_required'=>[400,'reasonRequired'],'invalid_email'=>[400,'invalidEmail'],'invalid_amount'=>[400,'invalidAmount'],
            'invalid_currency'=>[400,'invalidCurrency'],'invalid_method'=>[400,'invalidRequest'],'invalid_plan'=>[400,'invalidPlan'],
            'invalid_interval'=>[400,'invalidInterval'],'invalid_link'=>[502,'billingUnavailable'],
            'لا يمكن خفض حد المختصين'=>[409,'tooManySpecialists']] as $needle=>[$status,$code])
            if (str_contains($e->remoteMessage, $needle)) fail($status, $code);
    }
    error_log('Salonieer Supabase: '.$e->getMessage());
    fail(503, 'serviceUnavailable');
}
