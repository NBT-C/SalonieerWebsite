<?php
declare(strict_types=1);
// Background jobs for a cPanel cron entry, e.g. every 5 minutes:
//   /usr/local/bin/php /home/<user>/public_html/cron.php
// Sends queued application emails, reads replies from the mailbox and pulls new Paddle events.
// Command line only; the web server refuses this file (.htaccess) and it exits for any web request.
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
ini_set('display_errors', '0');
ini_set('log_errors', '1');
define('SALONIEER_CRON', true);
require __DIR__.'/index.php';
