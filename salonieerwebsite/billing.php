<?php
declare(strict_types=1);
// Salon billing on top of Paddle: each salon's subscription (cancel / resume / pay a failed renewal / change plan),
// invoices, refunds, discount codes and the finance dashboard. Loaded by index.php only.
//
// Paddle is called through its REST API with plain JSON (paddleApi) and every changed subscription or transaction is
// re-read from Paddle, so what is stored is always Paddle's latest state, whatever order events arrive in. The salon
// side of it (grace period, reminders, pausing, plan changes) lives in Supabase: Salonieer-KMP/backend/website_billing.sql.
if (!defined('SALONIEER')) { http_response_code(404); exit; }

final class PaddleApiFailure extends RuntimeException {
    public function __construct(public string $errorCode, public int $httpStatus, string $detail) { parent::__construct($detail); }
}
function paddleApiBase(): string {
    // Local tests only: a stub Paddle on this machine (never anything but loopback).
    $local = paddleEnv('PADDLE_API_BASE');
    if ($local && preg_match('~^http://127\.0\.0\.1:\d+$~D', $local)) return $local;
    return (paddleEnv('PADDLE_ENVIRONMENT') ?? 'production') === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com';
}
// Returns the decoded body ({data, meta}). Paddle errors surface as PaddleApiFailure with Paddle's error code.
function paddleApi(string $method, string $path, ?array $body = null, array $query = []): array {
    $key = paddleEnv('PADDLE_API_KEY');
    if (!$key) throw new RuntimeException('PADDLE_API_KEY is not set.');
    if (!preg_match('~^/[a-z_-]+(/[A-Za-z0-9_-]+)*$~D', $path)) throw new InvalidArgumentException('Bad Paddle path.');
    $url = paddleApiBase().$path.($query ? '?'.http_build_query($query) : '');
    $c = curl_init($url);
    curl_setopt_array($c, [CURLOPT_CUSTOMREQUEST=>$method, CURLOPT_RETURNTRANSFER=>true, CURLOPT_CONNECTTIMEOUT=>8, CURLOPT_TIMEOUT=>30, CURLOPT_FOLLOWLOCATION=>false,
        CURLOPT_HTTPHEADER=>['Authorization: Bearer '.$key, 'Content-Type: application/json', 'Accept: application/json', 'Paddle-Version: 1']]);
    if ($body !== null) curl_setopt($c, CURLOPT_POSTFIELDS, json_encode($body, JSON_UNESCAPED_SLASHES|JSON_PRESERVE_ZERO_FRACTION));
    $raw = curl_exec($c); $status = (int)curl_getinfo($c, CURLINFO_HTTP_CODE); $err = curl_error($c); curl_close($c);
    if ($raw === false) throw new RuntimeException('Paddle unreachable: '.$err);
    $data = json_decode((string)$raw, true);
    if ($status < 200 || $status >= 300) {
        $e = is_array($data['error'] ?? null) ? $data['error'] : [];
        throw new PaddleApiFailure((string)($e['code'] ?? 'paddle_error'), $status, (string)($e['detail'] ?? substr((string)$raw, 0, 300)));
    }
    return is_array($data) ? $data : [];
}
// Paddle amounts are strings in the lowest unit (cents); zero-decimal currencies are not used here.
// One entity by ID, read through the list endpoint filtered by that ID. Paddle's GET /<entity>/<id> answers
// "URL called is invalid" on this account (seen 2026-10-03), while the filtered list returns the same full entity.
function paddleGetOne(string $kind, string $id): ?array {
    if (!in_array($kind, ['transactions','subscriptions','customers','adjustments','discounts','prices'], true) || !preg_match('/^[a-z]{3,6}_[a-z\d]{26}$/D', $id)) return null;
    $rows = paddleApi('GET', '/'.$kind, null, ['id'=>$id])['data'] ?? [];
    foreach ($rows as $r) if (($r['id'] ?? null) === $id) return $r;
    return null;
}
function centsToMoney(string|int|null $cents, string $currency = 'USD'): string {
    $n = (int)$cents / 100;
    return ($currency === 'USD' ? '$' : $currency.' ').number_format($n, fmod($n, 1.0) == 0.0 ? 0 : 2);
}

// ---- Price catalog ----------------------------------------------------------------------------------------------------
// Which plan/add-on, tier, interval and trial a Paddle price is (null when it isn't one of ours).
function paddlePriceInfo(string $priceId): ?array {
    static $map = null;
    if ($map === null) {
        $map = [];
        foreach (PADDLE_CATALOG as $tier => $groups) foreach ($groups as $group => $items) foreach ($items as $item => $id) {
            if ($id) $map[$id] = ['tier'=>$tier, 'item'=>$item, 'interval'=>str_starts_with($group, 'year') ? 'year' : 'month', 'trial'=>str_ends_with($group, '_trial')];
        }
    }
    return $map[$priceId] ?? null;
}
// Paddle price IDs for a plan with its add-ons, in one tier/interval (trial versions only exist for Pro).
function paddleItemsFor(string $tier, string $interval, string $plan, int $extra, bool $loyalty, bool $trial = false): array {
    $group = $interval.($trial ? '_trial' : '');
    $set = PADDLE_CATALOG[$tier][$group] ?? [];
    $planId = $set[$plan] ?? null;
    if (!$planId) throw new HttpFailure(400, 'checkoutUnavailable', 'plan');
    $items = [['price_id'=>$planId, 'quantity'=>1]];
    if ($loyalty && in_array($plan, ['basic','pro'], true)) $items[] = ['price_id'=>$set['loyalty'], 'quantity'=>1];
    if ($extra > 0 && $plan !== 'enterprise') $items[] = ['price_id'=>$set['specialist'], 'quantity'=>min(50, $extra)];
    return $items;
}

// ---- Mirror: subscriptions → Supabase salon billing, transactions & refunds → SQLite --------------------------------
// The application a subscription pays for: Paddle copies the checkout's custom_data onto the subscription.
function subscriptionApplicationId(array $sub): ?string {
    $app = $sub['custom_data']['application_id'] ?? null;
    if (is_string($app) && preg_match('/^SLN-[A-F0-9]{8}-[A-F0-9]{4}$/D', $app)) return $app;
    // Subscriptions created before the link existed: the application paid with one of this subscription's transactions.
    $txns = array_column(rows('SELECT transaction_id FROM transactions WHERE subscription_id=?', [$sub['id']]), 'transaction_id');
    foreach ($txns as $t) { $r = one('SELECT application_id FROM transactions WHERE transaction_id=? AND application_id IS NOT NULL', [$t]); if ($r) return $r['application_id']; }
    return null;
}
function billingSyncSubscription(string $subscriptionId): ?array {
    if (!supabaseReady() || !paddleEnv('PADDLE_API_KEY')) return null;
    $sub = paddleGetOne('subscriptions', $subscriptionId);
    if (!is_array($sub)) return null;
    $app = subscriptionApplicationId($sub);
    if (!$app) return null;
    $items = []; $total = 0; $trialEnds = null; $interval = 'month';
    foreach ($sub['items'] ?? [] as $i) {
        if (($i['status'] ?? '') === 'inactive') continue;
        $info = paddlePriceInfo($i['price']['id'] ?? '');
        $unit = (int)($i['price']['unit_price']['amount'] ?? 0);
        $items[] = ['priceId'=>$i['price']['id'] ?? '', 'item'=>$info['item'] ?? null, 'name'=>$i['product']['name'] ?? ($i['price']['description'] ?? ''),
            'quantity'=>(int)($i['quantity'] ?? 1), 'unitAmount'=>(string)$unit, 'trial'=>$info['trial'] ?? false];
        $total += $unit * (int)($i['quantity'] ?? 1);
        $trialEnds ??= $i['trial_dates']['ends_at'] ?? null;
        if (($i['price']['billing_cycle']['interval'] ?? '') === 'year') $interval = 'year';
    }
    $change = $sub['scheduled_change'] ?? null;
    return sbRpc('website_billing_sync', ['p_app'=>$app, 'p_data'=>[
        'subscriptionId'=>$sub['id'], 'customerId'=>$sub['customer_id'] ?? '', 'status'=>$sub['status'] ?? '',
        'interval'=>$interval, 'items'=>$items, 'currency'=>$sub['currency_code'] ?? 'USD', 'recurringTotal'=>(string)$total,
        'currentPeriodEndsAt'=>$sub['current_billing_period']['ends_at'] ?? null, 'nextBilledAt'=>$sub['next_billed_at'] ?? null,
        'scheduledChange'=>is_array($change) ? ['action'=>$change['action'] ?? '', 'effectiveAt'=>$change['effective_at'] ?? null, 'resumeAt'=>$change['resume_at'] ?? null] : null,
        'trialEndsAt'=>$trialEnds, 'paddleUpdatedAt'=>(string)($sub['updated_at'] ?? ''),
    ]]);
}
// Full money breakdown of a transaction (fees, tax, earnings, line items) for the finance dashboard.
function financeSyncTransaction(string $transactionId): void {
    if (!paddleEnv('PADDLE_API_KEY')) return;
    $t = paddleGetOne('transactions', $transactionId);
    if (!is_array($t)) return;
    $tot = $t['details']['totals'] ?? [];
    $items = array_map(static fn($l)=>['id'=>$l['id'] ?? '', 'priceId'=>$l['price_id'] ?? '', 'name'=>$l['product']['name'] ?? '', 'quantity'=>(int)($l['quantity'] ?? 1),
        'total'=>(string)($l['totals']['total'] ?? '0')], $t['details']['line_items'] ?? []);
    $app = $t['custom_data']['application_id'] ?? null;
    if (!is_string($app) || !preg_match('/^SLN-[A-F0-9]{8}-[A-F0-9]{4}$/D', $app)) {
        $app = null;
        // Renewals carry no custom_data of their own: inherit the application from the subscription's first payment.
        if (!empty($t['subscription_id'])) { $r = one('SELECT application_id FROM transactions WHERE subscription_id=? AND application_id IS NOT NULL LIMIT 1', [$t['subscription_id']]); $app = $r['application_id'] ?? null; }
    }
    $paddleUpdated = str_replace(['T','Z'], [' ',''], (string)($t['updated_at'] ?? gmdate('Y-m-d H:i:s')));
    runSql(<<<SQL
INSERT INTO transactions(transaction_id,customer_id,subscription_id,status,currency,total,invoice_number,billed_at,paddle_updated_at,subtotal,tax,fee,earnings,discount,origin,items_json,application_id,period_start,period_end)
VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(transaction_id) DO UPDATE SET customer_id=excluded.customer_id,subscription_id=excluded.subscription_id,status=excluded.status,currency=excluded.currency,total=excluded.total,
invoice_number=excluded.invoice_number,billed_at=excluded.billed_at,subtotal=excluded.subtotal,tax=excluded.tax,fee=excluded.fee,earnings=excluded.earnings,discount=excluded.discount,
origin=excluded.origin,items_json=excluded.items_json,application_id=coalesce(excluded.application_id,transactions.application_id),period_start=excluded.period_start,period_end=excluded.period_end,
paddle_updated_at=max(excluded.paddle_updated_at,transactions.paddle_updated_at),updated_at=datetime('now')
SQL, [$t['id'], $t['customer_id'] ?? null, $t['subscription_id'] ?? null, $t['status'] ?? '', $tot['currency_code'] ?? ($t['currency_code'] ?? 'USD'),
        (string)($tot['grand_total'] ?? $tot['total'] ?? '0'), $t['invoice_number'] ?? null, isset($t['billed_at']) ? str_replace(['T','Z'], [' ',''], substr((string)$t['billed_at'], 0, 19)) : null,
        $paddleUpdated, (string)($tot['subtotal'] ?? '0'), (string)($tot['tax'] ?? '0'), (string)($tot['fee'] ?? '0'), (string)($tot['earnings'] ?? '0'), (string)($tot['discount'] ?? '0'),
        $t['origin'] ?? '', json_encode($items, JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE), $app,
        $t['billing_period']['starts_at'] ?? null, $t['billing_period']['ends_at'] ?? null]);
}
function financeSyncAdjustment(string $adjustmentId): void {
    if (!paddleEnv('PADDLE_API_KEY')) return;
    $a = (paddleApi('GET', '/adjustments', null, ['id'=>$adjustmentId])['data'] ?? [])[0] ?? null;
    if (!is_array($a)) return;
    $tot = $a['totals'] ?? [];
    runSql(<<<SQL
INSERT INTO adjustments(adjustment_id,transaction_id,subscription_id,customer_id,action,type,status,reason,currency,total,fee,earnings,created_at,updated_at)
VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,datetime('now'))
ON CONFLICT(adjustment_id) DO UPDATE SET status=excluded.status,total=excluded.total,fee=excluded.fee,earnings=excluded.earnings,updated_at=datetime('now')
SQL, [$a['id'], $a['transaction_id'] ?? null, $a['subscription_id'] ?? null, $a['customer_id'] ?? null, $a['action'] ?? '', $a['type'] ?? '', $a['status'] ?? '',
        mb_substr((string)($a['reason'] ?? ''), 0, 500), $tot['currency_code'] ?? ($a['currency_code'] ?? 'USD'), (string)($tot['total'] ?? '0'),
        (string)($tot['fee'] ?? '0'), (string)($tot['earnings'] ?? '0'), str_replace(['T','Z'], [' ',''], substr((string)($a['created_at'] ?? gmdate('c')), 0, 19))]);
}

// ---- Periodic work (cron.php, and after responses as a fallback) ------------------------------------------------------
function billingWork(int $minSeconds = 600, bool $verbose = false): array {
    $report = [];
    if (!supabaseReady()) return ['skipped'=>'not configured'];
    if (!workerClaim('billing', $minSeconds)) return ['skipped'=>'busy or too soon'];
    try {
        // Once: link salons that were paid before subscriptions were tied to applications.
        if (!setting('billing_backfilled') && paddleEnv('PADDLE_API_KEY')) { $report['backfill'] = billingBackfill(); saveSetting('billing_backfilled', gmdate('c')); }
        if (paddleEnv('PADDLE_API_KEY')) $report['reconcile'] = paddleReconcile();
        $report['tick'] = sbRpc('website_billing_tick');
        // Suspended-salon cleanup (ops.php): only when the admin switched it on; at most every 6 hours.
        try { $report['cleanup'] = cleanupWork(); } catch (Throwable $e) { error_log('Salonieer cleanup: '.$e->getMessage()); $report['cleanup'] = ['error'=>$e->getMessage()]; }
        $health = setting('paddle_health');
        if (paddleEnv('PADDLE_API_KEY') && (!is_array($health) || ($health['at'] ?? 0) < time() - 600)) $report['paddle'] = paddleHealth();
    } catch (Throwable $e) { error_log('Salonieer billing worker: '.$e->getMessage()); $report['error'] = $e->getMessage(); }
    finally { workerRelease('billing'); }
    if ($verbose) echo json_encode($report), "\n";
    return $report;
}
// Safety net that needs no webhook: completed payments of the last days are read from Paddle's transaction list and
// recorded exactly like a webhook would (customer, account link, application paid, subscription, finance). Repeat-safe:
// every step is an upsert or a no-op when already done.
function paddleReconcile(int $days = 3): array {
    paddleAutoload();
    $since = gmdate('Y-m-d\TH:i:s\Z', time() - $days * 86400);
    $done = 0; $failed = 0; $after = null;
    for ($page = 0; $page < 10; $page++) {
        $q = ['status'=>'completed,paid', 'updated_at[GTE]'=>$since, 'per_page'=>30, 'order_by'=>'updated_at[DESC]'];
        if ($after) $q['after'] = $after;
        $res = paddleApi('GET', '/transactions', null, $q);
        $rows = $res['data'] ?? [];
        foreach ($rows as $raw) {
            if (empty($raw['custom_data']['application_id'])) continue;
            try {
                onPaddleTransaction(Paddle\SDK\Notifications\Entities\Transaction::from($raw));
                if (!empty($raw['subscription_id'])) billingSyncSubscription($raw['subscription_id']);
                $done++;
            } catch (Throwable $e) {
                $failed++;
                paddleTrace('reconcile FAILED', ['txn'=>$raw['id'] ?? '', 'error'=>substr($e->getMessage(), 0, 160)]);
            }
        }
        if (!($res['meta']['pagination']['has_more'] ?? false) || !$rows) break;
        $after = end($rows)['id'];
    }
    return ['recorded'=>$done, 'failed'=>$failed];
}
// Which Paddle permissions the website's API key has. Reads are real list calls (one item); writes are deliberately
// incomplete requests, so Paddle answers 403 when the permission is missing and a validation error when it is there —
// nothing is ever created. Saved for the finance page.
function paddleHealth(): array {
    $checks = [
        'transactions.read'=>['GET', '/transactions', null, ['per_page'=>1]], 'events.read'=>['GET', '/events', null, ['per_page'=>1]],
        'customers.read'=>['GET', '/customers', null, ['per_page'=>1]], 'subscriptions.read'=>['GET', '/subscriptions', null, ['per_page'=>1]],
        'discounts.read'=>['GET', '/discounts', null, ['per_page'=>1]], 'adjustments.read'=>['GET', '/adjustments', null, ['per_page'=>1]],
        'discounts.write'=>['POST', '/discounts', ['type'=>'percentage'], []], 'adjustments.write'=>['POST', '/adjustments', ['action'=>'refund'], []],
        'transactions.write'=>['POST', '/transactions', ['items'=>[]], []], 'subscriptions.write'=>['PATCH', '/subscriptions/sub_00000000000000000000000000', ['proration_billing_mode'=>'do_not_bill'], []],
    ];
    $out = [];
    foreach ($checks as $name => [$m, $p, $b, $q]) {
        try { paddleApi($m, $p, $b, $q); $out[$name] = 'ok'; }
        catch (PaddleApiFailure $e) { $out[$name] = $e->httpStatus === 403 || in_array($e->errorCode, ['forbidden','authentication_missing','authentication_malformed'], true) ? 'denied: '.$e->errorCode : ($e->httpStatus === 401 ? 'denied: '.$e->errorCode : 'ok'); }
        catch (Throwable $e) { $out[$name] = 'error: '.substr($e->getMessage(), 0, 120); }
    }
    saveSetting('paddle_health', ['at'=>time(), 'checks'=>$out]);
    return $out;
}
function billingWorkAfterResponse(int $minSeconds): void { afterResponse(static fn() => billingWork($minSeconds)); }
function billingBackfill(): int {
    $n = 0;
    foreach (sbRpc('website_admin_applications', ['p_status'=>'approved']) ?: [] as $a) {
        $ref = (string)($a['paymentReference'] ?? '');
        if (!preg_match('/^txn_[a-z\d]{26}$/D', $ref)) continue;
        try {
            financeSyncTransaction($ref);
            runSql('UPDATE transactions SET application_id=? WHERE transaction_id=? AND application_id IS NULL', [$a['id'], $ref]);
            $sub = one('SELECT subscription_id FROM transactions WHERE transaction_id=?', [$ref])['subscription_id'] ?? null;
            if ($sub) { billingSyncSubscription($sub); $n++; }
        } catch (Throwable $e) { error_log('Salonieer billing backfill '.$a['id'].': '.$e->getMessage()); }
    }
    return $n;
}

// ---- Owner actions -----------------------------------------------------------------------------------------------------
// The owner's own salon billing (404 for anyone else's).
function ownerBilling(array $user, string $app): array {
    $b = sbRpc('website_billing_get', ['p_app'=>$app, 'p_user'=>(int)$user['id']]);
    if (!is_array($b) || empty($b['subscriptionId'])) fail(404, 'noSubscription');
    return $b;
}
function billingCancel(string $app, array $b): array {
    if (in_array($b['status'], ['canceled'], true)) fail(409, 'alreadyCanceled');
    paddleApi('POST', '/subscriptions/'.$b['subscriptionId'].'/cancel', ['effective_from'=>'next_billing_period']);
    $nb = billingSyncSubscription($b['subscriptionId']) ?? $b;
    sbRpc('website_queue_mail', ['p_app'=>$app, 'p_recipient'=>'customer', 'p_template'=>'cancel_scheduled', 'p_vars'=>['date'=>$nb['scheduledChange']['effectiveAt'] ?? $nb['currentPeriodEndsAt'] ?? null]]);
    mailWorkAfterResponse(0);
    return $nb;
}
function billingResume(string $app, array $b): array {
    if (($b['scheduledChange']['action'] ?? '') !== 'cancel') fail(409, 'nothingToResume');
    paddleApi('PATCH', '/subscriptions/'.$b['subscriptionId'], ['scheduled_change'=>null]);
    $nb = billingSyncSubscription($b['subscriptionId']) ?? $b;
    sbRpc('website_queue_mail', ['p_app'=>$app, 'p_recipient'=>'customer', 'p_template'=>'cancel_resumed', 'p_vars'=>['date'=>$nb['nextBilledAt'] ?? null]]);
    mailWorkAfterResponse(0);
    return $nb;
}
// A failed renewal is paid by updating the card: Paddle then collects the past-due amount by itself.
function billingPaymentTransaction(array $b): string {
    $t = paddleApi('GET', '/subscriptions/'.$b['subscriptionId'].'/update-payment-method-transaction')['data'] ?? [];
    if (empty($t['id'])) fail(502, 'billingUnavailable');
    return $t['id'];
}
// What a change would cost right now (prorated) and from the next renewal, straight from Paddle.
function billingPreview(string $app, array $b, array $change, array $owner): array {
    $tier = $owner['country'] === 'PS' ? 'west_bank' : 'standard';
    $items = paddleItemsFor($tier, $change['interval'], $change['plan'], $change['extraSpecialists'], $change['loyalty']);
    $check = sbRpc('website_change_check', ['p_app'=>$app, 'p_approved'=>$change]);
    $p = paddleApi('PATCH', '/subscriptions/'.$b['subscriptionId'].'/preview', ['items'=>$items, 'proration_billing_mode'=>'prorated_immediately'])['data'] ?? [];
    $now = $p['immediate_transaction']['details']['totals']['grand_total'] ?? '0';
    $next = $p['next_transaction']['details']['totals']['grand_total'] ?? ($p['recurring_transaction_details']['totals']['grand_total'] ?? null);
    $cur = $p['currency_code'] ?? 'USD';
    $credit = $p['update_summary']['credit']['amount'] ?? '0';
    return ['items'=>$items, 'check'=>$check, 'immediate'=>centsToMoney($now, $cur), 'immediateCents'=>(string)$now, 'next'=>$next === null ? null : centsToMoney($next, $cur),
        'nextBilledAt'=>$p['next_billed_at'] ?? null, 'credit'=>centsToMoney($credit, $cur)];
}
function cleanChange(array $d): array {
    $plan = $d['plan'] ?? null; $interval = $d['interval'] ?? 'month'; $extra = $d['extraSpecialists'] ?? 0;
    if (!in_array($plan, PLANS, true)) fail(400, 'invalidPlan', 'plan');
    if ($plan === 'enterprise') fail(400, 'enterpriseByAgreement', 'plan');
    if (!in_array($interval, ['month','year'], true)) fail(400, 'invalidInterval', 'interval');
    if (!is_int($extra) || $extra < 0 || $extra > 50) fail(400, 'invalidAddons', 'extraSpecialists');
    return ['plan'=>$plan, 'interval'=>$interval, 'extraSpecialists'=>$extra, 'loyalty'=>($d['loyalty'] ?? false) === true && in_array($plan, ['basic','pro'], true)];
}
function applicationOwner(string $app): array {
    $a = sbRpc('website_application', ['p_id'=>$app, 'p_user'=>null]);
    if (!is_array($a)) fail(404, 'notFound');
    $u = one('SELECT * FROM users WHERE id=?', [(int)$a['websiteUserId']]);
    if (!$u) fail(404, 'notFound');
    return [$a, $u];
}
// Admin applies a change: seats are checked first, then Paddle charges the prorated difference (prevent_change: if the
// payment fails, the subscription keeps its old items), then the salon gets the new plan.
function billingApplyChange(string $app, array $change, ?int $requestId, string $note, array $admin): array {
    [$a, $owner] = applicationOwner($app);
    $b = sbRpc('website_billing_get', ['p_app'=>$app, 'p_user'=>null]);
    if (!is_array($b) || empty($b['subscriptionId'])) fail(409, 'noSubscription');
    $preview = billingPreview($app, $b, $change, $owner);
    if (!($preview['check']['ok'] ?? false)) fail(409, 'tooManySpecialists');
    try {
        paddleApi('PATCH', '/subscriptions/'.$b['subscriptionId'], ['items'=>$preview['items'], 'proration_billing_mode'=>'prorated_immediately', 'on_payment_failure'=>'prevent_change']);
    } catch (PaddleApiFailure $e) {
        if ($requestId) sbRpc('website_change_request_decide', ['p_id'=>$requestId, 'p_status'=>'failed', 'p_approved'=>$change, 'p_preview'=>['immediate'=>$preview['immediate']], 'p_note'=>$note, 'p_actor'=>$admin['email']]);
        mailWorkAfterResponse(0);
        error_log('Salonieer change '.$app.': '.$e->errorCode.' '.$e->getMessage());
        fail(402, str_contains($e->errorCode, 'payment') || $e->httpStatus === 402 ? 'paymentDeclined' : 'billingUnavailable');
    }
    $summary = ['immediate'=>$preview['immediate'], 'next'=>$preview['next']];
    $result = $requestId
        ? sbRpc('website_change_request_decide', ['p_id'=>$requestId, 'p_status'=>'charged', 'p_approved'=>$change, 'p_preview'=>$summary, 'p_note'=>$note, 'p_actor'=>$admin['email']])
        : sbRpc('website_admin_change', ['p_app'=>$app, 'p_approved'=>$change, 'p_preview'=>$summary, 'p_note'=>$note, 'p_actor'=>$admin['email']]);
    billingSyncSubscription($b['subscriptionId']);
    mailWorkAfterResponse(0);
    return ['result'=>$result, 'preview'=>$summary];
}

// ---- Admin billing (2.26): every salon, cash billing, card links, switching card ⇄ cash --------------------------------
// Cash = paid by hand (cash or bank transfer) and recorded here; the salon stays open until its paid-until date, then gets
// 7 days of grace and pauses (website_billing.sql). Only an admin puts a salon on cash; applicants can only choose card or
// bank transfer. Moving from cash to card is a Paddle checkout link emailed to the owner: the new subscription takes over.
function adminCents(mixed $v, string $field = 'amount'): int {
    if (!is_numeric($v)) fail(400, 'invalidAmount', $field);
    $n = (int)round(((float)$v) * 100);
    if ($n < 0 || $n > 100000000) fail(400, 'invalidAmount', $field);
    return $n;
}
function cleanCurrency(mixed $v): string {
    $c = strtoupper(is_string($v) ? trim($v) : '');
    if (!preg_match('/^[A-Z]{3}$/D', $c)) fail(400, 'invalidCurrency', 'currency');
    return $c;
}
function cleanDate(mixed $v, string $field): ?string {
    if ($v === null || $v === '') return null;
    if (!is_string($v) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D', $v, $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1])) fail(400, 'invalidDate', $field);
    return $v;
}
// Plan for admin billing: like an owner's change, but Enterprise is allowed (priced by agreement, cash only).
function cleanAdminPlan(array $d): array {
    $plan = $d['plan'] ?? null; $interval = $d['interval'] ?? 'month'; $extra = $d['extraSpecialists'] ?? 0;
    if (!in_array($plan, PLANS, true)) fail(400, 'invalidPlan', 'plan');
    if (!in_array($interval, ['month','year'], true)) fail(400, 'invalidInterval', 'interval');
    if (!is_int($extra) || $extra < 0 || $extra > 50) fail(400, 'invalidAddons', 'extraSpecialists');
    return ['plan'=>$plan, 'interval'=>$interval, 'extraSpecialists'=>$plan === 'enterprise' ? 0 : $extra, 'loyalty'=>($d['loyalty'] ?? false) === true && in_array($plan, ['basic','pro'], true)];
}
// The salon owner's contact for billing emails, linked to their website account when one has this email.
function cleanBillingOwner(mixed $o): array {
    $o = is_array($o) ? $o : [];
    $email = strtolower(cleanText($o['email'] ?? null));
    if ($email !== '' && !validEmail($email)) fail(400, 'invalidEmail', 'email');
    $name = mb_substr(cleanText($o['name'] ?? null), 0, 120);
    $country = is_string($o['country'] ?? null) && preg_match('/^[A-Z]{2}$/D', $o['country']) ? $o['country'] : '';
    $user = $email !== '' ? one('SELECT id,full_name,country FROM users WHERE email=?', [$email]) : false;
    return ['email'=>$email, 'name'=>$name !== '' ? $name : (string)($user['full_name'] ?? ''), 'lang'=>siteLang($o['lang'] ?? 'ar'),
        'country'=>$country !== '' ? $country : (string)($user['country'] ?? ''), 'websiteUserId'=>$user ? (int)$user['id'] : 0];
}
function cleanTier(mixed $v, string $country): string {
    if (in_array($v, ['standard','west_bank'], true)) return $v;
    return $country === 'PS' ? 'west_bank' : 'standard';
}
function adminBillingGet(string $slug): array {
    $r = sbRpc('website_billing_admin_get', ['p_slug'=>$slug]);
    $app = $r['applicationId'] ?? null;
    $r['transactions'] = $app ? financeTransactions(['app'=>$app])['items'] : [];
    return $r;
}
// A Paddle checkout for the chosen plan, tied to the salon's billing record (custom_data.application_id), emailed to the
// owner. Paddle copies custom_data onto the subscription, so when it is paid the salon switches to card by itself.
function adminCardLink(string $app, array $change, string $tier, int $userId, array $admin): string {
    if (!paddleEnv('PADDLE_API_KEY')) fail(503, 'billingUnavailable');
    $items = paddleItemsFor($tier, $change['interval'], $change['plan'], $change['extraSpecialists'], $change['loyalty']);
    $custom = ['application_id'=>$app] + ($userId > 0 ? [PADDLE_USER_KEY=>$userId] : []);
    $t = paddleApi('POST', '/transactions', ['items'=>$items, 'custom_data'=>$custom, 'collection_mode'=>'automatic'])['data'] ?? [];
    if (empty($t['id'])) fail(502, 'billingUnavailable');
    $link = siteUrl().'/checkout?_ptxn='.$t['id'];
    sbRpc('website_billing_card_link', ['p_app'=>$app, 'p_txn'=>$t['id'], 'p_link'=>$link, 'p_actor'=>$admin['email']]);
    mailWorkAfterResponse(0);
    return $link;
}
function adminBillingCreate(string $slug, array $d, array $admin): array {
    $method = $d['method'] ?? '';
    if (!in_array($method, ['cash','card'], true)) fail(400, 'invalidRequest', 'method');
    $plan = cleanAdminPlan($d);
    $owner = cleanBillingOwner($d['owner'] ?? []);
    $data = $plan + ['method'=>$method, 'owner'=>$owner, 'applyPlan'=>($d['applyPlan'] ?? true) !== false];
    $first = null;
    if ($method === 'cash') {
        $data['currency'] = cleanCurrency($d['currency'] ?? 'USD');
        $data['priceCents'] = (string)adminCents($d['price'] ?? 0, 'price');
        $until = cleanDate($d['paidUntil'] ?? null, 'paidUntil');
        $received = ($d['received'] ?? null) === null || $d['received'] === '' ? null : adminCents($d['received'], 'received');
        // Money received now is a payment for the period up to paidUntil; without it, paidUntil is a free period.
        if ($received !== null && $received > 0) $first = ['amountCents'=>$received, 'currency'=>$data['currency'], 'via'=>in_array($d['via'] ?? 'cash', ['cash','bank_transfer','other'], true) ? $d['via'] : 'cash', 'until'=>$until, 'note'=>mb_substr(cleanText($d['note'] ?? null), 0, 500)];
        else $data['paidUntil'] = $until;
    } else {
        if ($plan['plan'] === 'enterprise') fail(400, 'enterpriseByAgreement', 'plan');
        if ($owner['email'] === '') fail(400, 'emailRequired', 'email');
    }
    $r = sbRpc('website_billing_create', ['p_slug'=>$slug, 'p_data'=>$data, 'p_actor'=>$admin['email']]);
    $app = (string)$r['applicationId'];
    if ($first) sbRpc('website_billing_cash_add', ['p_app'=>$app, 'p_data'=>$first, 'p_actor'=>$admin['email']]);
    $out = ['link'=>null];
    if ($method === 'card') $out['link'] = adminCardLink($app, $plan, cleanTier($d['tier'] ?? null, $owner['country']), $owner['websiteUserId'], $admin);
    mailWorkAfterResponse(0);
    return $out + adminBillingGet($slug);
}
function adminCashPayment(string $app, array $d, array $admin): array {
    $via = $d['via'] ?? 'cash';
    if (!in_array($via, ['cash','bank_transfer','other'], true)) fail(400, 'invalidRequest', 'via');
    $periods = $d['periods'] ?? 1;
    if (!is_int($periods) || $periods < 1 || $periods > 36) fail(400, 'invalidRequest', 'periods');
    $data = ['amountCents'=>adminCents($d['amount'] ?? null), 'via'=>$via, 'periods'=>$periods, 'until'=>cleanDate($d['until'] ?? null, 'until'),
        'paidOn'=>cleanDate($d['paidOn'] ?? null, 'paidOn'), 'note'=>mb_substr(cleanText($d['note'] ?? null), 0, 500)];
    if (isset($d['currency'])) $data['currency'] = cleanCurrency($d['currency']);
    $r = sbRpc('website_billing_cash_add', ['p_app'=>$app, 'p_data'=>$data, 'p_actor'=>$admin['email']]);
    mailWorkAfterResponse(0);
    return $r;
}
function adminCashUpdate(string $app, array $d, array $admin): array {
    $data = [];
    if (array_key_exists('price', $d)) $data['priceCents'] = (string)adminCents($d['price'], 'price');
    if (array_key_exists('currency', $d)) $data['currency'] = cleanCurrency($d['currency']);
    if (array_key_exists('interval', $d)) { if (!in_array($d['interval'], ['month','year'], true)) fail(400, 'invalidInterval', 'interval'); $data['interval'] = $d['interval']; }
    if (array_key_exists('paidUntil', $d)) $data['paidUntil'] = cleanDate($d['paidUntil'], 'paidUntil');
    if (array_key_exists('endsAtPeriodEnd', $d)) $data['endsAtPeriodEnd'] = $d['endsAtPeriodEnd'] === true;
    if (array_key_exists('plan', $d)) $data += cleanAdminPlan($d);
    return sbRpc('website_billing_cash_update', ['p_app'=>$app, 'p_data'=>$data, 'p_actor'=>$admin['email']]);
}
// Card → cash: Paddle stops at the end of the paid period (a failed renewal stops now), the salon is then tracked as cash
// paid until that date. The owner's card is never charged again.
function adminToCash(string $app, array $b, array $d, array $admin): array {
    $sub = (string)($b['subscriptionId'] ?? '');
    $until = cleanDate($d['paidUntil'] ?? null, 'paidUntil');
    if ($sub !== '' && in_array($b['status'] ?? '', ['active','trialing','past_due','paused'], true)) {
        if (($b['scheduledChange']['action'] ?? '') !== 'cancel')
            paddleApi('POST', '/subscriptions/'.$sub.'/cancel', ['effective_from'=>in_array($b['status'], ['past_due','paused'], true) ? 'immediately' : 'next_billing_period']);
        $b = billingSyncSubscription($sub) ?? $b;
        if (in_array($b['status'] ?? '', ['canceled'], true) && $until === null) $until = gmdate('Y-m-d');
    }
    $data = ['paidUntil'=>$until];
    if (isset($d['price']) && $d['price'] !== '') $data['priceCents'] = (string)adminCents($d['price'], 'price');
    if (isset($d['currency']) && $d['currency'] !== '') $data['currency'] = cleanCurrency($d['currency']);
    $r = sbRpc('website_billing_to_cash', ['p_app'=>$app, 'p_data'=>$data, 'p_actor'=>$admin['email']]);
    mailWorkAfterResponse(0);
    return $r;
}
// Card subscription controls beyond cancel/resume at period end: stop now, pause and resume a paused subscription.
function adminCardAction(string $app, array $b, string $action): array {
    $sub = (string)($b['subscriptionId'] ?? '');
    if ($sub === '') fail(409, 'noSubscription');
    match ($action) {
        'cancel-now' => paddleApi('POST', '/subscriptions/'.$sub.'/cancel', ['effective_from'=>'immediately']),
        'pause' => paddleApi('POST', '/subscriptions/'.$sub.'/pause', ['effective_from'=>'immediately']),
        'unpause' => paddleApi('POST', '/subscriptions/'.$sub.'/resume', ['effective_from'=>'immediately']),
    };
    $nb = billingSyncSubscription($sub) ?? $b;
    mailWorkAfterResponse(0);
    return $nb;
}

// ---- Website accounts (2.26): what stops a deletion ---------------------------------------------------------------------
// A running subscription (card or cash), or a paid application still waiting for approval, blocks deleting the account.
function accountDeletionStatus(array $user): array {
    $blocking = []; $open = 0; $salons = 0;
    if (supabaseReady()) {
        $st = sbRpc('website_account_status', ['p_user'=>(int)$user['id']]);
        $blocking = $st['blocking'] ?? []; $open = (int)($st['openApplications'] ?? 0); $salons = (int)($st['salons'] ?? 0);
    }
    // Paddle's own record too (a subscription not yet tied to a salon).
    if (!array_filter($blocking, fn($b) => ($b['reason'] ?? '') === 'card_subscription'))
        foreach (paddleUserSubscriptions($user) as $s)
            if (in_array($s['status'], ['active','trialing','past_due','paused'], true)) { $blocking[] = ['reason'=>'card_subscription', 'salonName'=>(string)($s['product_name'] ?? '')]; break; }
    return ['blocking'=>array_values($blocking), 'openApplications'=>$open, 'salons'=>$salons, 'isAdmin'=>(bool)(int)$user['is_admin']];
}

// ---- Invoices & refunds ------------------------------------------------------------------------------------------------
function invoiceDTO(array $t): array {
    return ['id'=>$t['transaction_id'], 'status'=>$t['status'], 'invoiceNumber'=>$t['invoice_number'], 'billedAt'=>$t['billed_at'] ? str_replace(' ', 'T', $t['billed_at']).'Z' : null,
        'currency'=>$t['currency'], 'total'=>$t['total'], 'totalText'=>centsToMoney($t['total'], $t['currency']), 'subtotal'=>$t['subtotal'] ?? null, 'tax'=>$t['tax'] ?? null,
        'fee'=>$t['fee'] ?? null, 'earnings'=>$t['earnings'] ?? null, 'items'=>json_decode((string)($t['items_json'] ?? '[]'), true) ?: [],
        'applicationId'=>$t['application_id'] ?? null, 'subscriptionId'=>$t['subscription_id'], 'origin'=>$t['origin'] ?? '',
        'refunded'=>(string)(one("SELECT coalesce(sum(cast(total as integer)),0) n FROM adjustments WHERE transaction_id=? AND action='refund' AND status IN ('approved','pending_approval')", [$t['transaction_id']])['n'] ?? 0)];
}
function ownerInvoices(array $user): array {
    $ids = paddleCustomerIds($user);
    if (!$ids) return [];
    $marks = implode(',', array_fill(0, count($ids), '?'));
    return array_map('invoiceDTO', rows("SELECT * FROM transactions WHERE customer_id IN ($marks) AND status IN ('completed','paid','past_due','billed') ORDER BY billed_at DESC, created_at DESC LIMIT 200", $ids));
}
function invoicePdfUrl(string $transactionId): string {
    $url = paddleApi('GET', '/transactions/'.$transactionId.'/invoice', null, ['disposition'=>'inline'])['data']['url'] ?? '';
    $host = (string)parse_url($url, PHP_URL_HOST);
    if (!str_starts_with($url, 'https://') || $host === '') fail(502, 'billingUnavailable');
    return $url;
}
// Full refund, or a partial amount spread over the line items in order.
function refundTransaction(string $transactionId, string $type, int $amountCents, string $reason): array {
    $t = paddleGetOne('transactions', $transactionId);
    if (!is_array($t) || !in_array($t['status'] ?? '', ['completed','paid'], true)) fail(409, 'notRefundable');
    $body = ['action'=>'refund', 'transaction_id'=>$transactionId, 'reason'=>$reason, 'type'=>$type];
    if ($type === 'partial') {
        $left = $amountCents; $items = [];
        foreach ($t['details']['line_items'] ?? [] as $l) {
            if ($left <= 0) break;
            $take = min($left, (int)($l['totals']['total'] ?? 0));
            if ($take > 0) { $items[] = ['item_id'=>$l['id'], 'type'=>'partial', 'amount'=>(string)$take]; $left -= $take; }
        }
        if (!$items || $left > 0) fail(400, 'invalidAmount', 'amount');
        $body['items'] = $items;
    }
    $a = paddleApi('POST', '/adjustments', $body)['data'] ?? [];
    if (!empty($a['id'])) financeSyncAdjustment($a['id']);
    return ['id'=>$a['id'] ?? null, 'status'=>$a['status'] ?? null];
}

// ---- Discount codes ----------------------------------------------------------------------------------------------------
function discountDTO(array $d): array {
    return ['id'=>$d['id'], 'code'=>$d['code'] ?? null, 'description'=>$d['description'] ?? '', 'type'=>$d['type'] ?? '', 'amount'=>$d['amount'] ?? '0',
        'currency'=>$d['currency_code'] ?? null, 'recur'=>(bool)($d['recur'] ?? false), 'maxIntervals'=>$d['maximum_recurring_intervals'] ?? null,
        'usageLimit'=>$d['usage_limit'] ?? null, 'timesUsed'=>(int)($d['times_used'] ?? 0), 'expiresAt'=>$d['expires_at'] ?? null, 'status'=>discountStatus($d),
        'enabledForCheckout'=>(bool)($d['enabled_for_checkout'] ?? false), 'createdAt'=>$d['created_at'] ?? null];
}
// Paddle only stores active / archived; an active code past its date or out of uses is shown as expired / used up.
function discountStatus(array $d): string {
    $s = (string)($d['status'] ?? '');
    if ($s !== 'active') return $s;
    if (!empty($d['expires_at']) && strtotime((string)$d['expires_at']) < time()) return 'expired';
    if (!empty($d['usage_limit']) && (int)($d['times_used'] ?? 0) >= (int)$d['usage_limit']) return 'used';
    return $s;
}
function discountsList(): array {
    // Paddle's status filter accepts only active and archived.
    $all = paddleApi('GET', '/discounts', null, ['per_page'=>200, 'status'=>'active,archived', 'order_by'=>'created_at[DESC]'])['data'] ?? [];
    return array_map('discountDTO', $all);
}
function discountCreate(array $d): array {
    $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string)($d['code'] ?? '')));
    if (strlen($code) < 3 || strlen($code) > 16) fail(400, 'invalidCode', 'code');
    $type = $d['type'] ?? 'percentage';
    if (!in_array($type, ['percentage','flat'], true)) fail(400, 'invalidType', 'type');
    $amount = (float)($d['amount'] ?? 0);
    if ($type === 'percentage' && ($amount <= 0 || $amount > 100)) fail(400, 'invalidAmount', 'amount');
    if ($type === 'flat' && ($amount <= 0 || $amount > 10000)) fail(400, 'invalidAmount', 'amount');
    $body = ['description'=>mb_substr(trim((string)($d['description'] ?? $code)), 0, 100) ?: $code, 'enabled_for_checkout'=>true, 'code'=>$code, 'type'=>$type,
        'amount'=>$type === 'percentage' ? rtrim(rtrim(number_format($amount, 2, '.', ''), '0'), '.') : (string)(int)round($amount * 100),
        'recur'=>($d['recur'] ?? false) === true];
    if ($type === 'flat') $body['currency_code'] = 'USD';
    if ($body['recur'] && is_int($d['maxIntervals'] ?? null) && $d['maxIntervals'] > 0) $body['maximum_recurring_intervals'] = min(60, $d['maxIntervals']);
    if (is_int($d['usageLimit'] ?? null) && $d['usageLimit'] > 0) $body['usage_limit'] = min(100000, $d['usageLimit']);
    if (is_string($d['expiresAt'] ?? null) && preg_match('/^\d{4}-\d{2}-\d{2}$/D', $d['expiresAt'])) $body['expires_at'] = $d['expiresAt'].'T23:59:59Z';
    try { return discountDTO(paddleApi('POST', '/discounts', $body)['data'] ?? []); }
    catch (PaddleApiFailure $e) { if (str_contains($e->errorCode, 'code')) fail(409, 'codeTaken', 'code'); throw $e; }
}
function discountSetStatus(string $id, string $status): array {
    if (!preg_match('/^dsc_[a-z\d]{26}$/D', $id) || !in_array($status, ['active','archived'], true)) fail(400, 'invalidRequest');
    return discountDTO(paddleApi('PATCH', '/discounts/'.$id, ['status'=>$status])['data'] ?? []);
}

// ---- Finance dashboard -------------------------------------------------------------------------------------------------
// Everything the dashboard shows, from the local mirror (no Paddle round trip per page view) plus Paddle's own metrics,
// cached for 15 minutes.
function financeOverview(): array {
    $months = [];
    for ($i = 11; $i >= 0; $i--) $months[gmdate('Y-m', strtotime("first day of -$i month"))] = ['gross'=>0, 'net'=>0, 'fees'=>0, 'tax'=>0, 'count'=>0, 'refunds'=>0];
    foreach (rows("SELECT substr(billed_at,1,7) m, sum(cast(total as integer)) gross, sum(cast(coalesce(earnings,'0') as integer)) net, sum(cast(coalesce(fee,'0') as integer)) fees,
        sum(cast(coalesce(tax,'0') as integer)) tax, count(*) n FROM transactions WHERE status IN ('completed','paid') AND billed_at IS NOT NULL AND billed_at >= ? GROUP BY m", [array_key_first($months).'-01']) as $r)
        if (isset($months[$r['m']])) $months[$r['m']] = ['gross'=>(int)$r['gross'], 'net'=>(int)$r['net'], 'fees'=>(int)$r['fees'], 'tax'=>(int)$r['tax'], 'count'=>(int)$r['n'], 'refunds'=>0];
    foreach (rows("SELECT substr(created_at,1,7) m, sum(cast(total as integer)) t FROM adjustments WHERE action='refund' AND status='approved' GROUP BY m") as $r)
        if (isset($months[$r['m']])) $months[$r['m']]['refunds'] = (int)$r['t'];
    $days = [];
    for ($i = 29; $i >= 0; $i--) $days[gmdate('Y-m-d', time() - $i * 86400)] = 0;
    foreach (rows("SELECT substr(billed_at,1,10) d, sum(cast(total as integer)) t FROM transactions WHERE status IN ('completed','paid') AND billed_at >= ? GROUP BY d", [array_key_first($days)]) as $r)
        if (isset($days[$r['d']])) $days[$r['d']] = (int)$r['t'];
    $billing = supabaseReady() ? (sbRpc('website_billing_list') ?: []) : [];
    $mrr = 0; $active = 0; $trialing = 0; $pastDue = []; $paused = []; $renewals = []; $planMix = []; $cancelling = [];
    $cashSalons = 0; $cashDue = []; $cashRenewals = [];
    $soon = time() + 7 * 86400;
    foreach ($billing as $b) {
        $st = $b['status'] ?? '';
        if (!empty($b['pausedForBilling'])) $paused[] = $b;
        // Cash salons (2.26) are counted on their own: Paddle's numbers don't include them.
        if (($b['method'] ?? 'card') === 'cash') {
            if (empty($b['pausedForBilling'])) $cashSalons++;
            if (!empty($b['pastDueSince']) && empty($b['pausedForBilling'])) $cashDue[] = $b;
            $until = isset($b['paidUntil']) ? strtotime((string)$b['paidUntil']) : false;
            if ($until && $until <= $soon && $until >= strtotime('today') && empty($b['cashEnds'])) $cashRenewals[] = $b;
            continue;
        }
        $monthly = (int)($b['recurringTotal'] ?? 0) / (($b['interval'] ?? 'month') === 'year' ? 12 : 1);
        if (in_array($st, ['active','past_due'], true)) { $mrr += $monthly; $active++; $planMix[$b['plan']] = ($planMix[$b['plan']] ?? 0) + 1; }
        if ($st === 'trialing') { $trialing++; $planMix[$b['plan'].' (trial)'] = ($planMix[$b['plan'].' (trial)'] ?? 0) + 1; }
        if ($st === 'past_due') $pastDue[] = $b;
        if (($b['scheduledChange']['action'] ?? '') === 'cancel') $cancelling[] = $b;
        $next = isset($b['nextBilledAt']) ? strtotime((string)$b['nextBilledAt']) : false;
        if ($next && $next <= $soon && in_array($st, ['active','trialing'], true)) $renewals[] = $b;
    }
    $churn = [];
    foreach (array_keys($months) as $m) $churn[$m] = 0;
    foreach (rows("SELECT substr(canceled_at,1,7) m, count(*) n FROM subscriptions WHERE canceled_at IS NOT NULL GROUP BY m") as $r) if (isset($churn[$r['m']])) $churn[$r['m']] = (int)$r['n'];
    $newSubs = [];
    foreach (array_keys($months) as $m) $newSubs[$m] = 0;
    foreach (rows("SELECT substr(created_at,1,7) m, count(*) n FROM subscriptions GROUP BY m") as $r) if (isset($newSubs[$r['m']])) $newSubs[$r['m']] = (int)$r['n'];
    // Cash and bank-transfer payments recorded by admins, per month and currency (never mixed into Paddle's USD).
    $cash = supabaseReady() ? (sbRpc('website_billing_cash_list', ['p_from'=>array_key_first($months).'-01', 'p_to'=>null]) ?: []) : [];
    $cashMonths = [];
    foreach (array_keys($months) as $m) $cashMonths[$m] = [];
    foreach ($cash as $c) { $m = substr((string)$c['paidOn'], 0, 7); if (isset($cashMonths[$m])) $cashMonths[$m][$c['currency']] = ($cashMonths[$m][$c['currency']] ?? 0) + (int)$c['amount']; }
    $thisMonth = $months[gmdate('Y-m')] ?? ['gross'=>0, 'net'=>0];
    $lastMonth = $months[gmdate('Y-m', strtotime('first day of -1 month'))] ?? ['gross'=>0, 'net'=>0];
    return [
        'currency'=>'USD',
        'kpis'=>['mrr'=>(int)round($mrr), 'arr'=>(int)round($mrr * 12), 'activeSubscriptions'=>$active, 'trialing'=>$trialing, 'pastDue'=>count($pastDue), 'paused'=>count($paused),
            'revenueThisMonth'=>$thisMonth['gross'], 'revenueLastMonth'=>$lastMonth['gross'], 'netThisMonth'=>$thisMonth['net'], 'netLastMonth'=>$lastMonth['net'],
            'arpa'=>$active ? (int)round($mrr / $active) : 0, 'cancelling'=>count($cancelling), 'cashSalons'=>$cashSalons, 'cashDue'=>count($cashDue)],
        'months'=>$months, 'days'=>$days, 'churn'=>$churn, 'newSubscriptions'=>$newSubs, 'planMix'=>$planMix,
        'pastDue'=>$pastDue, 'paused'=>$paused, 'renewals'=>$renewals, 'cancelling'=>$cancelling,
        'cashDue'=>$cashDue, 'cashRenewals'=>$cashRenewals, 'cashMonths'=>$cashMonths, 'cashThisMonth'=>$cashMonths[gmdate('Y-m')] ?? [], 'cashPayments'=>array_slice($cash, 0, 50),
        'metrics'=>financeMetrics(),
        'syncedAt'=>gmdate('c'),
    ];
}
function financeMetrics(): ?array {
    if (!paddleEnv('PADDLE_API_KEY')) return null;
    $cached = setting('paddle_metrics');
    if (is_array($cached) && ($cached['at'] ?? 0) > time() - 900) return $cached['data'];
    $from = gmdate('Y-m-d', strtotime('-90 days')); $to = gmdate('Y-m-d', strtotime('+1 day'));
    $data = [];
    foreach (['revenue'=>'/metrics/revenue', 'mrr'=>'/metrics/monthly-recurring-revenue', 'activeSubscribers'=>'/metrics/active-subscribers', 'refunds'=>'/metrics/refunds'] as $k => $path) {
        try { $data[$k] = paddleApi('GET', $path, null, ['from'=>$from, 'to'=>$to])['data'] ?? null; }
        catch (Throwable $e) { error_log('Salonieer Paddle metrics '.$k.': '.$e->getMessage()); $data[$k] = null; }
    }
    saveSetting('paddle_metrics', ['at'=>time(), 'data'=>$data]);
    return $data;
}
function financeTransactions(array $q): array {
    $where = ['1=1']; $args = [];
    if (in_array($q['status'] ?? '', ['completed','past_due','billed','canceled','paid'], true)) { $where[] = 'status=?'; $args[] = $q['status']; }
    if (preg_match('/^SLN-[A-F0-9]{8}-[A-F0-9]{4}$/D', (string)($q['app'] ?? ''))) { $where[] = 'application_id=?'; $args[] = $q['app']; }
    $page = max(0, min(200, (int)($q['page'] ?? 0)));
    $list = rows('SELECT * FROM transactions WHERE '.implode(' AND ', $where).' ORDER BY coalesce(billed_at,created_at) DESC LIMIT 51 OFFSET '.($page * 50), $args);
    return ['items'=>array_map('invoiceDTO', array_slice($list, 0, 50)), 'hasMore'=>count($list) > 50];
}
