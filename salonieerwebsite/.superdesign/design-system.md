# Salonieer — website design system

## Product context
Salonieer is a salon-management app (bookings, calendar, specialists, services, customers, loyalty coins, notifications) for barbers, beauty salons and women's salons, mainly in Palestine, Israel and the Arab world. The website (salonieer.com) explains the product, shows plans and prices (USD / ILS; Palestinian accounts pay half), and lets owners apply for a plan, pay, and follow their application. After approval the salon appears in the Salonieer mobile app and the website's Account page shows its QR code.

Audience: salon owners and managers, often on phones, reading Arabic, Hebrew or English. They are practical, design-conscious (beauty industry), and need trust before paying.

Jobs: understand what the app does in seconds → pick a plan → apply → pay → wait for approval → get the salon code/QR.

Key pages: Home, Plans, Apply, Applications, Account, Login/Register, Support, legal pages.

## Brand (KEEP)
- Logo: rose-gold calligraphic "S" on a near-black rounded tile, plus the wordmark "Salonieer". Always use the real logo image.
- Colours (keep these values):
  - Ink / primary #1F1F1D (buttons, headings, footer background)
  - Ivory background #F5F1EA, surface #FCFAF7, sand #E8DED1, sunken #EEE7DC
  - Brass accent #B89A68 (hover #A68B5E, accent text #786444, soft rgba(184,154,104,.14))
  - Secondary text #746D65, muted #93877A
  - Status: success #68856F, warning #C49B58, error #A96060, info #6C7F91
- Dark mode exists: ink background, ivory text, the same brass accent.

## Typography (REQUIRED)
- English: **Sora** (400, 500, 600, 700). Headlines 600–700 with slightly tight tracking (-0.02em); body 400, line-height 1.55.
- Arabic: **Alexandria** (400, 500, 600, 700). No letter-spacing; line-height 1.8 for body, 1.35 for headlines.
- Hebrew: **Varela Round** (only one weight, 400 — never fake bold). Hierarchy comes from size and colour; line-height 1.65.
- One family per language; no serif display face, no italics for emphasis.
- Type scale (desktop): 64 / 44 / 32 / 24 / 18 / 16 / 14 / 12. Phone: 40 / 32 / 26 / 20 / 17 / 16 / 14 / 12.

## Layout & components
- Max content width 1240px; 16px side gutter on phones; breakpoints 360 / 768 / 1024 / 1440+.
- Fully mirrored for RTL (Arabic, Hebrew): use logical start/end, mirrored arrows and layouts.
- Buttons: primary = ink background, ivory text; secondary = surface with hairline border; pill radius. Visible keyboard focus ring in brass.
- Cards: surface colour, generous padding, radius 18–26px, soft warm shadow (not grey). Structure (borders, numbering) only when it carries meaning.
- Pricing: 4 plans — Basic, Pro (most popular), Business, Enterprise (by agreement); add-ons Loyalty Coins and Extra specialist; USD/ILS switch; monthly prices.
- Real product screenshots of the app (calendar, dashboard, customer booking) are available as imagery.

## Motion
One orchestrated page-load moment per page; purposeful micro-interactions on press/hover/focus; page changes cross-fade (View Transitions where supported). Transform/opacity only; respect prefers-reduced-motion.

## Avoid
Generic SaaS card grids with identical shadows, gradient washes, all-caps eyebrow labels on every section, emoji, stock photos, neon or purple, serif display fonts, "→" appended to every link.
