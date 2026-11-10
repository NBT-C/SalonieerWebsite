# Home page screenshots (real app, three languages)

The home page shows real screens of the Salonieer app, one set per site language
(`salonieerwebsite/assets/img/showcase/<screen>-<lang>-<width>.webp`). They are made here, offline:
the real app (`Salonieer-KMP/web`) runs in Chromium against the real backend (`Salonieer-KMP/INSTALL.sql`
in embedded Postgres, through the app's e2e harness). The salons, people and visits are made up (`seed.mjs`).
No real salon or customer data is involved, and nothing is sent anywhere.

| Step | Command | Output |
|---|---|---|
| 1. Capture | `node capture.mjs final` (≈6 min) | `raw/<lang>/<screen>.png`, each checked for words in another language and for money |
| 2. Build | `node build.mjs` | adds the device status bar (mirrored for Arabic/Hebrew), writes the WebP files |
| 3. Check locally | `node test-home.mjs` | real PHP site + backend: 7 widths × 3 languages, switch, tabs, enlarged view, reduced motion |
| 4. Check live | `node check-live.mjs` | read-only check of https://salonieer.com after a deploy |

Recapture after visible app changes (new look, renamed screens). The screens and what the home page says
about them are listed in `shots.mjs` and `assets/app.js` (`TOUR`, the four steps); features under the tour come from
`assets/plans-data.js`. Prices never appear: bookings are stored with price 0 and the salons hide prices.
