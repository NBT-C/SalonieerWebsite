<?php
declare(strict_types=1);

// Paddle Billing: event fulfillment, subscription mirror, access checks and the customer portal.
// Events reach the same handlers two ways: pushed to the signed webhook, or pulled from Paddle's event stream by paddleSync().
// Hosts that block inbound server-to-server requests (InfinityFree's browser check) can only use the pull.
// Loaded by index.php only. Needs the vendor/ folder (Paddle PHP SDK, committed) uploaded with the site.
// Secrets come from environment variables, or from a .env file in the private folder (see .env.example).
if (!defined('SALONIEER')) { http_response_code(404); exit; }

use Paddle\SDK\Client;
use Paddle\SDK\Entities\Event;
use Paddle\SDK\Environment;
use Paddle\SDK\Exceptions\ApiError;
use Paddle\SDK\Notifications\Entities\Adjustment as AdjustmentEntity;
use Paddle\SDK\Notifications\Entities\Customer as CustomerEntity;
use Paddle\SDK\Notifications\Entities\Shared\CustomData;
use Paddle\SDK\Notifications\Entities\Subscription as SubscriptionEntity;
use Paddle\SDK\Notifications\Entities\Subscription\SubscriptionItem;
use Paddle\SDK\Notifications\Entities\Transaction as TransactionEntity;
use Paddle\SDK\Notifications\Events;
use Paddle\SDK\Notifications\Secret;
use Paddle\SDK\Notifications\Verifier;
use Paddle\SDK\Options;
use Paddle\SDK\Resources\CustomerPortalSessions\Operations\CreateCustomerPortalSession;
use Paddle\SDK\Entities\Event\EventTypeName;
use Paddle\SDK\Resources\Events\Operations\ListEvents;
use Paddle\SDK\Resources\Shared\Operations\List\Pager;

// Statuses that grant paid access. A scheduled_change (cancel/pause at period end) never revokes access by itself:
// access ends only when Paddle actually moves the subscription to canceled or paused.
// past_due keeps access while Paddle retries the payment (dunning); remove it here to cut access on the first failed renewal.
const PADDLE_ACCESS_STATUSES = ['active','trialing','past_due'];
const PADDLE_MAX_WEBHOOK_BYTES = 1048576;
// Everything else Paddle sends is acknowledged with 200 and ignored.
const PADDLE_HANDLED_EVENTS = ['customer.created','customer.updated',
    'subscription.created','subscription.updated','subscription.canceled','subscription.activated','subscription.past_due','subscription.paused','subscription.resumed','subscription.trialing',
    'transaction.completed','transaction.paid','transaction.past_due','transaction.payment_failed','transaction.billed',
    'adjustment.created','adjustment.updated'];

function paddleEnv(string $key): ?string {
    static $file;
    $v=getenv($key);
    if (is_string($v) && $v!=='') return $v;
    if (is_string($_SERVER[$key]??null) && $_SERVER[$key]!=='') return $_SERVER[$key];
    if ($file===null) {
        $file=[];
        $path=privateDir().'/.env';
        if (is_file($path)) foreach (file($path,FILE_IGNORE_NEW_LINES|FILE_SKIP_EMPTY_LINES)?:[] as $line) {
            if (preg_match('/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/D',$line,$m) && !str_starts_with(ltrim($line),'#')) $file[$m[1]]=trim($m[2],"\"'");
        }
    }
    return ($file[$key]??'')!=='' ? $file[$key] : null;
}
function paddleAutoload(): void {
    static $loaded=false;
    if ($loaded) return;
    $autoload=__DIR__.'/vendor/autoload.php';
    if (!is_file($autoload)) throw new RuntimeException('Paddle SDK missing: upload the vendor/ folder next to index.php.');
    require_once $autoload;
    $loaded=true;
}
function paddle(): Client {
    static $client;
    if ($client) return $client;
    paddleAutoload();
    $key=paddleEnv('PADDLE_API_KEY');
    if (!$key) throw new RuntimeException('PADDLE_API_KEY is not set.');
    $env=Environment::tryFrom(paddleEnv('PADDLE_ENVIRONMENT') ?? 'production');
    if (!$env) throw new RuntimeException('PADDLE_ENVIRONMENT must be production or sandbox.');
    return $client=new Client($key,new Options($env));
}
// Paddle timestamps → UTC text. Display columns match datetime('now'); paddle_updated_at keeps microseconds for ordering.
function paddleTime(?DateTimeInterface $t, bool $precise=false): ?string {
    return $t ? DateTimeImmutable::createFromInterface($t)->setTimezone(new DateTimeZone('UTC'))->format($precise?'Y-m-d H:i:s.u':'Y-m-d H:i:s') : null;
}

// ---- Webhook ------------------------------------------------------------------
// Paddle stops retrying on any 2xx, so only verified and fully processed deliveries get one.
function paddleWebhook(string $method): never {
    if ($method!=='POST') sendJson(405,['error'=>'invalidRequest']);
    if ((int)($_SERVER['CONTENT_LENGTH']??0)>PADDLE_MAX_WEBHOOK_BYTES) sendJson(413,['error'=>'invalidRequest']);
    // Raw bytes exactly as sent: the signature covers the unparsed body.
    $raw=file_get_contents('php://input',false,null,0,PADDLE_MAX_WEBHOOK_BYTES+1);
    if ($raw===false || $raw==='' || strlen($raw)>PADDLE_MAX_WEBHOOK_BYTES) sendJson(400,['error'=>'invalidRequest']);
    $signature=(string)($_SERVER['HTTP_PADDLE_SIGNATURE']??'');
    try {
        paddleAutoload();
        $request=new GuzzleHttp\Psr7\ServerRequest('POST','/api/paddle/webhook',['Paddle-Signature'=>$signature],$raw);
        // 60 s of clock tolerance (the SDK default of 5 s rejects a delivery that is merely slow to arrive).
        $verify=static fn(?string $secret)=>$secret && $signature!=='' && (new Verifier(60))->verify($request,new Secret($secret));
        // The destination's signing secret as Paddle reports it to our API key (so it always belongs to the same
        // account as the key), then the .env copy. The secret never leaves the server.
        $verified = $verify(paddleDestinationSecret(false)) || $verify(paddleEnv('PADDLE_WEBHOOK_SECRET')) || $verify(paddleDestinationSecret(true));
        if (!$verified) paddleTrace('webhook rejected', ['signed'=>$signature !== '', 'event'=>preg_match('/"event_type"\s*:\s*"([a-z_.]+)"/', $raw, $m) ? $m[1] : '?']);
    } catch (Throwable $e) {
        error_log('Salonieer Paddle webhook config: '.$e->getMessage());
        sendJson(500,['error'=>'serverError']);
    }
    if (!$verified) { try { saveSetting('paddle_webhook_error', ['at'=>time(), 'error'=>'invalid signature (check PADDLE_WEBHOOK_SECRET)']); } catch (Throwable) {} sendJson(401,['error'=>'invalidSignature']); }
    // Only now is the body trusted enough to parse.
    $data=json_decode($raw,true);
    if (!is_array($data) || !is_string($data['event_type']??null)) sendJson(400,['error'=>'invalidRequest']);
    if (!in_array($data['event_type'],PADDLE_HANDLED_EVENTS,true)) sendJson(200,['ok'=>true,'ignored'=>$data['event_type']]);
    try {
        paddleDispatch(Event::from($data));
    } catch (Throwable $e) {
        paddleTrace('webhook FAILED', ['event'=>$data['event_type'], 'error'=>substr($e->getMessage(), 0, 200)]);
        error_log('Salonieer Paddle webhook '.$data['event_type'].' '.($data['event_id']??'').' failed: '.$e->getMessage());
        try { saveSetting('paddle_webhook_error', ['at'=>time(), 'event'=>$data['event_type'], 'error'=>substr(get_class($e).': '.$e->getMessage(), 0, 300)]); } catch (Throwable) {}
        sendJson(500,['error'=>'serverError']);
    }
    sendJson(200,['ok'=>true]);
}
// Signing secret of this site's webhook destination, read from Paddle with the API key and kept in the private database
// for an hour (the same trust level as .env). $fresh skips the cache, at most once a minute.
function paddleDestinationSecret(bool $fresh): ?string {
    $cached=setting('paddle_destination_secret');
    if (!$fresh && is_array($cached) && ($cached['at']??0)>time()-3600) return $cached['secret']??null;
    if ($fresh && is_array($cached) && ($cached['at']??0)>time()-60) return null;
    try {
        $want=rtrim((defined('SITE_URL')?SITE_URL:'https://salonieer.com'),'/').'/api/paddle/webhook';
        foreach (paddleApi('GET','/notification-settings')['data'] ?? [] as $n) {
            if (($n['type']??'')==='url' && rtrim((string)($n['destination']??''),'/')===$want && !empty($n['endpoint_secret_key'])) {
                saveSetting('paddle_destination_secret',['at'=>time(),'secret'=>$n['endpoint_secret_key']]);
                return $n['endpoint_secret_key'];
            }
        }
        saveSetting('paddle_destination_secret',['at'=>time(),'secret'=>null]);
    } catch (Throwable $e) { error_log('Salonieer Paddle destination secret: '.$e->getMessage()); }
    return null;
}
function paddleTrace(string $step, array $info = []): void {
    try {
        $log = setting('paddle_trace');
        $log = is_array($log) ? $log : [];
        $log[] = ['at'=>gmdate('H:i:s'), 'step'=>$step] + $info;
        saveSetting('paddle_trace', array_slice($log, -40));
    } catch (Throwable) {}
}
function paddleDispatch(Event $event): void {
    // Grouped by the entity each event carries, so every subscription / transaction / refund event takes one path.
    match (true) {
        $event->data instanceof CustomerEntity => onPaddleCustomer($event->data),
        $event->data instanceof SubscriptionEntity => onPaddleSubscription($event->data),
        $event->data instanceof TransactionEntity => onPaddleTransaction($event->data),
        $event->data instanceof AdjustmentEntity => financeSyncAdjustment($event->data->id),
        default => null,
    };
}

// ---- Pull sync ------------------------------------------------------------------
// Reads new events from GET /events (oldest first, resuming after the last processed event ID) over an authenticated
// HTTPS call to api.paddle.com, so no signature is involved. Runs at most once per $minSeconds across all visitors.
const PADDLE_SYNC_MAX_EVENTS = 200;
const PADDLE_SYNC_MAX_SECONDS = 8;
const PADDLE_SYNC_SKIP_AFTER = 5; // an event that fails this many runs in a row is logged and skipped so it can't block the stream
function paddleSync(int $minSeconds): void {
    if (!paddleEnv('PADDLE_API_KEY')) return;
    $now=nowMs();
    try {
        runSql('INSERT OR IGNORE INTO paddle_sync(id) VALUES(1)');
        // Atomic claim: only one request syncs at a time, and only when the interval has passed.
        if (!runSql('UPDATE paddle_sync SET locked_until=?,last_run=? WHERE id=1 AND locked_until<? AND last_run<=?',[$now+60000,$now,$now,$now-$minSeconds*1000])) return;
    } catch (Throwable $e) { error_log('Salonieer Paddle sync lock: '.$e->getMessage()); return; }
    $done=0;$more=false;$started=microtime(true);
    try {
        $client=paddle(); // also loads the SDK
        $state=one('SELECT cursor,failed_event,failures FROM paddle_sync WHERE id=1');
        $types=array_map(static fn($t)=>EventTypeName::from($t),PADDLE_HANDLED_EVENTS);
        foreach ($client->events->list(new ListEvents(new Pager(after:$state['cursor'],perPage:50),$types)) as $event) {
            try {
                paddleDispatch($event);
            } catch (Throwable $e) {
                $failures=$state['failed_event']===$event->eventId?(int)$state['failures']+1:1;
                error_log('Salonieer Paddle sync '.$event->eventType->getValue().' '.$event->eventId.' failed ('.$failures.'): '.$e->getMessage());
                if ($failures<PADDLE_SYNC_SKIP_AFTER) { runSql('UPDATE paddle_sync SET failed_event=?,failures=? WHERE id=1',[$event->eventId,$failures]); break; }
                error_log('Salonieer Paddle sync skipped event '.$event->eventId.' after '.$failures.' failures.');
            }
            runSql('UPDATE paddle_sync SET cursor=?,failed_event=NULL,failures=0 WHERE id=1',[$event->eventId]);
            $state['failed_event']=null;
            if (++$done>=PADDLE_SYNC_MAX_EVENTS || microtime(true)-$started>PADDLE_SYNC_MAX_SECONDS) { $more=true; break; }
        }
    } catch (Throwable $e) {
        error_log('Salonieer Paddle sync failed: '.$e->getMessage());
        // Kept for the finance page: a sync that keeps failing must not stay invisible.
        try { saveSetting('paddle_sync_error', ['at'=>time(), 'error'=>substr(get_class($e).': '.$e->getMessage(), 0, 300)]); } catch (Throwable) {}
    }
    // Out of budget with more possibly waiting: let the next request continue straight away.
    try { runSql('UPDATE paddle_sync SET locked_until=0'.($more?',last_run=0':'').' WHERE id=1'); }
    catch (Throwable $e) { error_log('Salonieer Paddle sync unlock: '.$e->getMessage()); }
}
// Background sync after the response has been sent, where the server supports it (PHP-FPM); otherwise it runs inline.
function paddleSyncAfterResponse(int $minSeconds): void {
    afterResponse(static fn() => paddleSync($minSeconds));
}
// Background work runs only after the visitor already has the full response: PHP-FPM (fastcgi_finish_request) or
// LiteSpeed (litespeed_finish_request, this host). Where neither exists it is skipped and the cron job (cron.php) does
// it, so no page or button ever waits on Paddle, SMTP or IMAP.
function afterResponse(callable $job): void {
    static $jobs = null;
    if ($jobs === null) {
        $jobs = new ArrayObject();
        register_shutdown_function(static function() use ($jobs): void {
            if (!count($jobs)) return;
            if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
            elseif (function_exists('litespeed_finish_request')) litespeed_finish_request();
            else return;
            ignore_user_abort(true);
            @set_time_limit(90);
            foreach ($jobs as $run) { try { $run(); } catch (Throwable $e) { error_log('Salonieer background job: '.$e->getMessage()); } }
        });
    }
    $jobs->append($job);
}

// ---- Mirror (idempotent, order-safe upserts keyed on Paddle IDs) -----------------
// A row only moves forward: an older delivery arriving late (lower paddle_updated_at) is ignored.
function onPaddleCustomer(CustomerEntity $c): void {
    upsertPaddleCustomer($c->id,$c->email,paddleTime($c->updatedAt,true));
}
function upsertPaddleCustomer(string $id, string $email, string $paddleUpdatedAt): void {
    runSql(<<<SQL
INSERT INTO customers(customer_id,email,paddle_updated_at) VALUES(?,?,?)
ON CONFLICT(customer_id) DO UPDATE SET email=excluded.email,paddle_updated_at=excluded.paddle_updated_at,updated_at=datetime('now')
WHERE excluded.paddle_updated_at>=customers.paddle_updated_at
SQL,[$id,strtolower(trim($email)),$paddleUpdatedAt]);
}
// Links a Paddle customer to a website account. Registration is open and emails are not verified, so an email match
// alone is not proof: the checkout must pass custom_data {"salonieer_user_id": <users.id>} (Paddle copies it from the
// transaction to the subscription), AND that account's email must equal the Paddle customer's email. Someone who
// edits custom_data can only attach a purchase made with their own account's email. The first link is kept.
const PADDLE_USER_KEY = 'salonieer_user_id';
function paddleLinkUser(?string $customerId, ?CustomData $customData): void {
    $data=$customData?->data;
    $userId=is_array($data) ? filter_var($data[PADDLE_USER_KEY]??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]) : false;
    if (!$customerId || $userId===false) return;
    runSql("UPDATE customers SET user_id=?,updated_at=datetime('now') WHERE customer_id=? AND user_id IS NULL AND email=(SELECT email FROM users WHERE id=?)",[$userId,$customerId,$userId]);
}
// Events can arrive before (or without) customer.created: make sure the customer row exists so links and keys hold.
function ensurePaddleCustomer(?string $customerId): void {
    if (!$customerId || one('SELECT 1 FROM customers WHERE customer_id=?',[$customerId])) return;
    $c=paddleGetOne('customers',$customerId);
    if (!$c) throw new RuntimeException('Paddle customer '.$customerId.' not found.');
    upsertPaddleCustomer($c['id'],(string)$c['email'],paddleTime(new DateTimeImmutable((string)$c['updated_at']),true));
}
function onPaddleSubscription(SubscriptionEntity $s): void {
    ensurePaddleCustomer($s->customerId);
    $item=paddlePlanItem($s->items);
    if (!$item) throw new RuntimeException('Subscription '.$s->id.' has no items.');
    $cycle=$item->price->billingCycle ?? $s->billingCycle;
    $change=$s->scheduledChange;
    runSql(<<<SQL
INSERT INTO subscriptions(subscription_id,customer_id,status,price_id,product_id,product_name,billing_interval,billing_frequency,scheduled_change_action,scheduled_change_at,current_period_ends_at,next_billed_at,canceled_at,paddle_updated_at)
VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(subscription_id) DO UPDATE SET customer_id=excluded.customer_id,status=excluded.status,price_id=excluded.price_id,product_id=excluded.product_id,product_name=excluded.product_name,
billing_interval=excluded.billing_interval,billing_frequency=excluded.billing_frequency,scheduled_change_action=excluded.scheduled_change_action,scheduled_change_at=excluded.scheduled_change_at,
current_period_ends_at=excluded.current_period_ends_at,next_billed_at=excluded.next_billed_at,canceled_at=excluded.canceled_at,paddle_updated_at=excluded.paddle_updated_at,updated_at=datetime('now')
WHERE excluded.paddle_updated_at>=subscriptions.paddle_updated_at
SQL,[
        $s->id,$s->customerId,$s->status->getValue(),$item->price->id,$item->price->productId,$item->product?->name,
        $cycle?->interval->getValue(),$cycle?->frequency,$change?->action->getValue(),paddleTime($change?->effectiveAt),
        paddleTime($s->currentBillingPeriod?->endsAt),paddleTime($s->nextBilledAt),paddleTime($s->canceledAt),paddleTime($s->updatedAt,true),
    ]);
    paddleLinkUser($s->customerId,$s->customData);
    // The site only offers Palestine prices to accounts registered in Palestine, but anyone can open a Paddle checkout
    // with a public price ID. Log it when the price tier doesn't match the linked account so it can be reviewed.
    $owner=one('SELECT u.id,u.country FROM customers c JOIN users u ON u.id=c.user_id WHERE c.customer_id=?',[$s->customerId]);
    $tier=paddlePriceTier($item->price->id);
    // Since October 2026 there is one price list; older subscriptions keep the price they were sold at.
    if (false && $owner && $tier && $tier!==userTier($owner)) error_log('Salonieer Paddle subscription '.$s->id.' uses '.$tier.' pricing but user '.$owner['id'].' is registered in '.$owner['country'].'.');
    // The salon this subscription pays for: grace period, pause / reopen, cancellation (billing.php → Supabase).
    billingSyncSubscription($s->id);
}
// Which pricing tier in index.php a plan price belongs to ('standard', 'west_bank'), or null if it isn't listed.
function paddlePriceTier(string $priceId): ?string {
    $info=paddlePriceInfo($priceId);
    return $info && in_array($info['item'],['basic','pro','business'],true) ? $info['tier'] : null;
}
// The plan is the item whose price is one of the plan prices in index.php; add-ons (loyalty, extra specialists) are
// other items on the same subscription. Falls back to the first active recurring item for prices not listed there.
function paddlePlanItem(array $items): ?SubscriptionItem {
    foreach ($items as $i) if (in_array(paddlePriceInfo($i->price->id)['item']??null,['basic','pro','business'],true) && $i->status->getValue()!=='inactive') return $i;
    foreach ($items as $i) if ($i->recurring && $i->status->getValue()!=='inactive') return $i;
    return $items[0] ?? null;
}
function onPaddleTransaction(TransactionEntity $t): void {
    $totals=$t->details->totals;
    runSql(<<<SQL
INSERT INTO transactions(transaction_id,customer_id,subscription_id,status,currency,total,invoice_number,billed_at,paddle_updated_at) VALUES(?,?,?,?,?,?,?,?,?)
ON CONFLICT(transaction_id) DO UPDATE SET customer_id=excluded.customer_id,subscription_id=excluded.subscription_id,status=excluded.status,currency=excluded.currency,total=excluded.total,
invoice_number=excluded.invoice_number,billed_at=excluded.billed_at,paddle_updated_at=excluded.paddle_updated_at,updated_at=datetime('now')
WHERE excluded.paddle_updated_at>=transactions.paddle_updated_at
SQL,[$t->id,$t->customerId,$t->subscriptionId,$t->status->getValue(),$t->currencyCode->getValue(),$totals->grandTotal ?? $totals->total,$t->invoiceNumber,paddleTime($t->billedAt),paddleTime($t->updatedAt,true)]);
    ensurePaddleCustomer($t->customerId);
    paddleLinkUser($t->customerId,$t->customData);
    paddlePayApplication($t);
    // Fees, tax, earnings and line items for the finance dashboard and invoices.
    financeSyncTransaction($t->id);
}
// A completed checkout opened from an application marks that application paid in Supabase ("awaiting approval").
// Only when the Paddle customer is linked to the same website account that owns the application (see paddleLinkUser).
// A Supabase failure throws, so the event is retried by the next sync instead of being lost.
function paddlePayApplication(TransactionEntity $t): void {
    $data=$t->customData?->data;
    if (!is_array($data) || !in_array($t->status->getValue(),['completed','paid'],true)) return;
    $app=$data['application_id']??null;
    $userId=filter_var($data[PADDLE_USER_KEY]??null,FILTER_VALIDATE_INT,['options'=>['min_range'=>1]]);
    if (!is_string($app) || !preg_match('/^SLN-[A-F0-9]{8}-[A-F0-9]{4}$/D',$app) || $userId===false || !$t->customerId) return;
    if (!one('SELECT 1 FROM customers WHERE customer_id=? AND user_id=?',[$t->customerId,$userId])) {
        error_log('Salonieer Paddle '.$t->id.' names application '.$app.' but its customer is not linked to user '.$userId.'.');
        return;
    }
    if (!supabaseReady()) throw new RuntimeException('Supabase is not configured; cannot mark '.$app.' paid.');
    try { sbRpc('website_mark_paid',['p_id'=>$app,'p_method'=>'paid','p_reference'=>$t->id,'p_actor'=>'paddle','p_user'=>$userId]); }
    catch (SupabaseFailure $e) {
        // A declined or unknown application cannot be paid; that is final, not a reason to retry.
        if (preg_match('/application_declined|application_not_found/',$e->remoteMessage)) { error_log('Salonieer Paddle '.$t->id.': '.$e->remoteMessage.' for '.$app); return; }
        throw $e;
    }
}

// Right after a card payment the browser asks for its application to be checked, so "Paid" shows at once instead of
// after the next background sync. With the checkout's transaction id the transaction is read from Paddle directly and
// trusted only if it is completed, names this application and this account, and the Paddle customer's email is the
// account's email (the same rule as paddleLinkUser). Without an id (the checkout window was closed or the page left),
// the pending Paddle events are synced now.
function paddleConfirmApplicationPayment(array $user, string $appId, string $txnId): void {
    if (!paddleEnv('PADDLE_API_KEY')) return;
    if (!preg_match('/^txn_[a-z\d]{26}$/D',$txnId)) { paddleTrace('confirm: no transaction id, reconciling'); paddleReconcile(1); return; }
    paddleAutoload();
    $raw=paddleGetOne('transactions',$txnId);
    if (!$raw) { paddleTrace('confirm: transaction not found'); return; }
    $t=Paddle\SDK\Entities\Transaction::from($raw);
    $data=$t->customData?->data;
    if (!is_array($data) || ($data['application_id']??null)!==$appId || (int)($data[PADDLE_USER_KEY]??0)!==(int)$user['id']) { paddleTrace('confirm: custom data mismatch'); return; }
    if (!in_array($t->status->getValue(),['completed','paid'],true) || !$t->customerId) { paddleTrace('confirm: status '.$t->status->getValue()); return; }
    $c=paddleGetOne('customers',$t->customerId);
    if (!$c) { paddleTrace('confirm: customer not found'); return; }
    if (strtolower(trim((string)$c['email']))!==strtolower((string)$user['email'])) { error_log('Salonieer payment check '.$txnId.': customer email differs from account '.$user['id'].'.'); return; }
    upsertPaddleCustomer($c['id'],(string)$c['email'],paddleTime(new DateTimeImmutable((string)$c['updated_at']),true));
    runSql("UPDATE customers SET user_id=?,updated_at=datetime('now') WHERE customer_id=? AND user_id IS NULL",[(int)$user['id'],$c['id']]);
    if (!one('SELECT 1 FROM customers WHERE customer_id=? AND user_id=?',[$c['id'],(int)$user['id']])) { paddleTrace('confirm: customer linked to another account'); return; }
    sbRpc('website_mark_paid',['p_id'=>$appId,'p_method'=>'paid','p_reference'=>$t->id,'p_actor'=>'paddle','p_user'=>(int)$user['id']]);
}

// ---- Access -------------------------------------------------------------------
function subscriptionGrantsAccess(array|false|null $subscription): bool {
    return is_array($subscription) && in_array($subscription['status'],PADDLE_ACCESS_STATUSES,true);
}
// Paddle customer IDs for a signed-in user, resolved only from the server-side session user (see paddleLinkUser).
function paddleCustomerIds(array $user): array {
    return array_column(rows('SELECT customer_id FROM customers WHERE user_id=? ORDER BY updated_at DESC',[(int)$user['id']]),'customer_id');
}
function paddleUserSubscriptions(array $user): array {
    $ids=paddleCustomerIds($user);
    if (!$ids) return [];
    $marks=implode(',',array_fill(0,count($ids),'?'));
    return rows("SELECT * FROM subscriptions WHERE customer_id IN ($marks) ORDER BY CASE status WHEN 'active' THEN 0 WHEN 'trialing' THEN 1 WHEN 'past_due' THEN 2 WHEN 'paused' THEN 3 ELSE 4 END,updated_at DESC",$ids);
}
function userHasPaidAccess(array $user): bool {
    foreach (paddleUserSubscriptions($user) as $s) if (subscriptionGrantsAccess($s)) return true;
    return false;
}
function subscriptionDTO(array $s): array {
    $iso=static fn(?string $v)=>$v===null?null:str_replace(' ','T',$v).'Z';
    return ['id'=>$s['subscription_id'],'status'=>$s['status'],'hasAccess'=>subscriptionGrantsAccess($s),'productName'=>$s['product_name'],'priceId'=>$s['price_id'],
        'interval'=>$s['billing_interval'],'frequency'=>$s['billing_frequency']===null?null:(int)$s['billing_frequency'],
        'scheduledChange'=>$s['scheduled_change_action']?['action'=>$s['scheduled_change_action'],'at'=>$iso($s['scheduled_change_at'])]:null,
        'currentPeriodEndsAt'=>$iso($s['current_period_ends_at']),'nextBilledAt'=>$iso($s['next_billed_at'])];
}
function billingSummary(array $user): array {
    $subs=paddleUserSubscriptions($user);
    return ['hasCustomer'=>(bool)paddleCustomerIds($user),'hasAccess'=>array_reduce($subs,static fn($ok,$s)=>$ok||subscriptionGrantsAccess($s),false),'subscriptions'=>array_map('subscriptionDTO',$subs)];
}

// ---- Customer portal ------------------------------------------------------------
function paddlePortalUrl(array $user): string {
    $ids=paddleCustomerIds($user);
    if (!$ids) fail(404,'noBillingAccount');
    $customerId=$ids[0];
    $subs=array_column(rows("SELECT subscription_id FROM subscriptions WHERE customer_id=? AND status<>'canceled' ORDER BY updated_at DESC LIMIT 25",[$customerId]),'subscription_id');
    try {
        $session=paddle()->customerPortalSessions->create($customerId,$subs?new CreateCustomerPortalSession($subs):new CreateCustomerPortalSession());
    } catch (ApiError $e) {
        error_log('Salonieer Paddle portal for '.$customerId.' failed: '.$e->getMessage());
        fail(502,'billingUnavailable');
    } catch (Throwable $e) {
        error_log('Salonieer Paddle portal unavailable: '.$e->getMessage());
        fail(503,'billingUnavailable');
    }
    $url=$session->urls->general->overview;
    $host=(string)parse_url($url,PHP_URL_HOST);
    if (!str_starts_with($url,'https://') || !($host==='paddle.com' || str_ends_with($host,'.paddle.com'))) fail(502,'billingUnavailable');
    return $url;
}
