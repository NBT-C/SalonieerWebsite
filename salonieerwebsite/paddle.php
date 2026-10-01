<?php
declare(strict_types=1);

// Paddle Billing: webhook fulfillment, subscription mirror, access checks and the customer portal.
// Loaded by index.php only. Requires `composer install --no-dev` (vendor/ must be uploaded with the site).
// Secrets come from environment variables, or from a .env file in the private folder (see .env.example).
if (!defined('SALONIEER')) { http_response_code(404); exit; }

use Paddle\SDK\Client;
use Paddle\SDK\Entities\Event;
use Paddle\SDK\Environment;
use Paddle\SDK\Exceptions\ApiError;
use Paddle\SDK\Notifications\Entities\Customer as CustomerEntity;
use Paddle\SDK\Notifications\Entities\Subscription as SubscriptionEntity;
use Paddle\SDK\Notifications\Entities\Subscription\SubscriptionItem;
use Paddle\SDK\Notifications\Entities\Transaction as TransactionEntity;
use Paddle\SDK\Notifications\Events;
use Paddle\SDK\Notifications\Secret;
use Paddle\SDK\Notifications\Verifier;
use Paddle\SDK\Options;
use Paddle\SDK\Resources\CustomerPortalSessions\Operations\CreateCustomerPortalSession;

// Statuses that grant paid access. A scheduled_change (cancel/pause at period end) never revokes access by itself:
// access ends only when Paddle actually moves the subscription to canceled or paused.
// past_due keeps access while Paddle retries the payment (dunning); remove it here to cut access on the first failed renewal.
const PADDLE_ACCESS_STATUSES = ['active','trialing','past_due'];
const PADDLE_MAX_WEBHOOK_BYTES = 1048576;
// Everything else Paddle sends is acknowledged with 200 and ignored.
const PADDLE_HANDLED_EVENTS = ['customer.created','customer.updated','subscription.created','subscription.updated','subscription.canceled','transaction.completed'];

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
    if (!is_file($autoload)) throw new RuntimeException('Paddle SDK missing: run composer install --no-dev and upload vendor/.');
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
        $secret=paddleEnv('PADDLE_WEBHOOK_SECRET');
        if (!$secret) throw new RuntimeException('PADDLE_WEBHOOK_SECRET is not set.');
        $request=new GuzzleHttp\Psr7\ServerRequest('POST','/api/paddle/webhook',['Paddle-Signature'=>$signature],$raw);
        $verified=$signature!=='' && (new Verifier())->verify($request,new Secret($secret));
    } catch (Throwable $e) {
        error_log('Salonieer Paddle webhook config: '.$e->getMessage());
        sendJson(500,['error'=>'serverError']);
    }
    if (!$verified) sendJson(401,['error'=>'invalidSignature']);
    // Only now is the body trusted enough to parse.
    $data=json_decode($raw,true);
    if (!is_array($data) || !is_string($data['event_type']??null)) sendJson(400,['error'=>'invalidRequest']);
    if (!in_array($data['event_type'],PADDLE_HANDLED_EVENTS,true)) sendJson(200,['ok'=>true,'ignored'=>$data['event_type']]);
    try {
        paddleDispatch(Event::from($data));
    } catch (Throwable $e) {
        error_log('Salonieer Paddle webhook '.$data['event_type'].' '.($data['event_id']??'').' failed: '.$e->getMessage());
        sendJson(500,['error'=>'serverError']);
    }
    sendJson(200,['ok'=>true]);
}
function paddleDispatch(Event $event): void {
    match (true) {
        $event instanceof Events\CustomerCreated, $event instanceof Events\CustomerUpdated => onPaddleCustomer($event->data),
        $event instanceof Events\SubscriptionCreated, $event instanceof Events\SubscriptionUpdated, $event instanceof Events\SubscriptionCanceled => onPaddleSubscription($event->data),
        $event instanceof Events\TransactionCompleted => onPaddleTransaction($event->data),
        default => null,
    };
}

// ---- Mirror (idempotent, order-safe upserts keyed on Paddle IDs) -----------------
// A row only moves forward: an older delivery arriving late (lower paddle_updated_at) is ignored.
function onPaddleCustomer(CustomerEntity $c): void {
    upsertPaddleCustomer($c->id,$c->email,paddleTime($c->updatedAt,true));
}
function upsertPaddleCustomer(string $id, string $email, string $paddleUpdatedAt): void {
    $email=strtolower(trim($email));
    // Link to the website account with the same email (emails are unique and stored lowercase in users).
    runSql(<<<SQL
INSERT INTO customers(customer_id,email,user_id,paddle_updated_at) VALUES(?,?,(SELECT id FROM users WHERE email=?),?)
ON CONFLICT(customer_id) DO UPDATE SET email=excluded.email,user_id=COALESCE(customers.user_id,excluded.user_id),paddle_updated_at=excluded.paddle_updated_at,updated_at=datetime('now')
WHERE excluded.paddle_updated_at>=customers.paddle_updated_at
SQL,[$id,$email,$email,$paddleUpdatedAt]);
}
function onPaddleSubscription(SubscriptionEntity $s): void {
    // Subscription events can arrive before customer.created; fetch the customer so the foreign key holds.
    if (!one('SELECT 1 FROM customers WHERE customer_id=?',[$s->customerId])) {
        $c=paddle()->customers->get($s->customerId);
        upsertPaddleCustomer($c->id,$c->email,paddleTime($c->updatedAt,true));
    }
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
}
// The plan is the first recurring item still on the subscription; add-ons (loyalty, extra specialists) come after it.
function paddlePlanItem(array $items): ?SubscriptionItem {
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
}

// ---- Access -------------------------------------------------------------------
function subscriptionGrantsAccess(array|false|null $subscription): bool {
    return is_array($subscription) && in_array($subscription['status'],PADDLE_ACCESS_STATUSES,true);
}
// Paddle customer IDs for a signed-in user, resolved only from the server-side session user.
// A customer created before the account existed (same email) is linked on first lookup.
function paddleCustomerIds(array $user): array {
    runSql('UPDATE customers SET user_id=?,updated_at=datetime(\'now\') WHERE user_id IS NULL AND email=?',[(int)$user['id'],strtolower($user['email'])]);
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
