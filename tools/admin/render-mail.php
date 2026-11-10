<?php
// Renders queued emails with the site's own mail.php without sending anything (no SMTP, no settings).
//   php render-mail.php <path to mail.php> <items.json>   → JSON [{template, subject, text}]
declare(strict_types=1);
define('SALONIEER', true);
function paddleEnv(string $key): ?string { return null; }
function centsToMoney(string $cents, string $currency): string { return $cents.' '.$currency; }
require $argv[1];
$out = [];
foreach (json_decode((string)file_get_contents($argv[2]), true) as $item) {
    [$subject, , $text] = renderMail($item);
    $out[] = ['template'=>$item['template'], 'subject'=>$subject, 'text'=>$text];
}
echo json_encode($out, JSON_UNESCAPED_UNICODE);
