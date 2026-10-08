# Salonieer website (salonieer.com)
Vanilla JS single-page app: `index.php` (PHP 8.2) serves `page.html`; `assets/app.js` (ES module) renders every page as HTML strings; one stylesheet `assets/app.css` (vanilla CSS, custom properties, no Tailwind, no framework). Languages EN / AR (RTL) / HE (RTL) from `assets/i18n.js`.

Client-side router in `assets/app.js` (`pages` map, `routeOf()`, `paint()`); the PHP server returns the same shell for every route.
| Path | Render function | Notes |
|---|---|---|
| / | home() | Hero with product mockup scene, 3 pillars, 2 showcases, CTA band |
| /plans | plans() | 4 plan cards (Basic, Pro featured, Business, Enterprise), currency switch USD/ILS, 2 add-on cards |
| /apply?plan= | apply() | Application form (signed in) |
| /applications | applications() | Applicant's applications |
| /account | account() | Salons with QR code, billing |
| /login, /register, /setup | login(), register(), setup() | Auth forms with authIntro aside |
| /support, /privacy, /terms, /refund | support(), legalPage() | Content pages |
| /admin/* | assets/admin/panel.js | Separate admin panel shell (own CSS) |

Header + footer wrap every page (paint()). Private routes: /apply, /applications, /account, /admin.
