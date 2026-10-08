# Salonieer website (salonieer.com)
Vanilla JS single-page app: `index.php` (PHP 8.2) serves `page.html`; `assets/app.js` (ES module) renders every page as HTML strings; one stylesheet `assets/app.css` (vanilla CSS, custom properties, no Tailwind, no framework). Languages EN / AR (RTL) / HE (RTL) from `assets/i18n.js`.

## SiteHeader
- Source: `assets/app.js` header()
- Category: layout
- Description: Sticky top bar with logo mark + wordmark, nav links, auth buttons, language select, phone menu toggle
- Extractable props: activeItem (string, default: "home"), signedIn (boolean, default: false)
- Hardcoded: logo image, link labels, CSS

## SiteFooter
- Source: `assets/app.js` footer()
- Category: layout
- Description: Dark footer with brand, product/legal/contact columns, copyright
- Extractable props: none
- Hardcoded: all

## PlanCard
- Source: `assets/app.js` plans()
- Category: basic
- Description: Pricing card with plan name, description, price, feature checklist, CTA; Pro is featured with 'Most popular'
- Extractable props: featured (boolean)
