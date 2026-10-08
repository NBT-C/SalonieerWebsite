# Salonieer website (salonieer.com)
Vanilla JS single-page app: `index.php` (PHP 8.2) serves `page.html`; `assets/app.js` (ES module) renders every page as HTML strings; one stylesheet `assets/app.css` (vanilla CSS, custom properties, no Tailwind, no framework). Languages EN / AR (RTL) / HE (RTL) from `assets/i18n.js`.

## Part 1 — Token summary
- Palette (light, default): background #F5F1EA (warm ivory), surface #FCFAF7, surface-secondary #E8DED1, sunken #EEE7DC; text #1F1F1D / #746D65 / muted #93877A; accent (brass/gold) #B89A68, hover #A68B5E, accent text #786444, accent soft rgba(184,154,104,.14); primary button #1F1F1D on #F5F1EA; borders rgba(31,31,29,.08/.16); success #68856F, warning #C49B58, error #A96060, info #6C7F91; footer #1F1F1D with #F5F1EA text and #B89A68 accent.
- Logo: rose-gold calligraphic "S" mark on a near-black rounded tile (assets/img/logo-mark-512.webp) + 'Salonieer' wordmark.
- Current fonts: Manrope (body), Cormorant Garamond (display, italic accents), IBM Plex Sans Arabic, Heebo. NEW REQUIRED fonts: Sora (EN), Alexandria (AR), Varela Round (HE, single weight).
- Spacing: 4 8 12 16 24 40 64 104. Radius: 10 14 18 26 32 999. Neumorphic soft shadows (light top-left, warm shadow bottom-right). Wrap 1240px, nav 84px.
- Breakpoints: 1500, 1150, 960, 720, 450. Dark mode via :root[data-mode=dark].
- Motion: ease cubic-bezier(.22,.61,.36,1), durations 200/320/500ms; reveal-on-scroll, tilt, floating cards; reduced-motion respected.
## Part 2 — Raw tokens (`assets/app.css`)
```css
@charset "UTF-8";
/* Salonieer design system. Colours, shadows and 3D light come only from the theme variables below; the defaults are the
   Champagne Ivory theme, and index.php prints the active theme's values (built by assets/theme.js) over them. */
@font-face{font-family:"Cormorant Garamond";src:url(/assets/fonts/cormorant-latin.woff2) format("woff2");font-weight:500 700;font-style:normal;font-display:swap}
@font-face{font-family:"Cormorant Garamond";src:url(/assets/fonts/cormorant-italic-latin.woff2) format("woff2");font-weight:500 700;font-style:italic;font-display:swap}
@font-face{font-family:Manrope;src:url(/assets/fonts/manrope-latin.woff2) format("woff2");font-weight:400 700;font-display:swap}
@font-face{font-family:"IBM Plex Sans Arabic";src:url(/assets/fonts/plex-arabic-400.woff2) format("woff2");font-weight:400;font-display:swap;unicode-range:U+0600-06FF,U+0750-077F,U+0870-08FF,U+FB50-FDFF,U+FE70-FEFF,U+200C-200E,U+0660-0669}
@font-face{font-family:"IBM Plex Sans Arabic";src:url(/assets/fonts/plex-arabic-500.woff2) format("woff2");font-weight:500;font-display:swap;unicode-range:U+0600-06FF,U+0750-077F,U+0870-08FF,U+FB50-FDFF,U+FE70-FEFF,U+200C-200E,U+0660-0669}
@font-face{font-family:"IBM Plex Sans Arabic";src:url(/assets/fonts/plex-arabic-600.woff2) format("woff2");font-weight:600 700;font-display:swap;unicode-range:U+0600-06FF,U+0750-077F,U+0870-08FF,U+FB50-FDFF,U+FE70-FEFF,U+200C-200E,U+0660-0669}
@font-face{font-family:Heebo;src:url(/assets/fonts/heebo-hebrew.woff2) format("woff2");font-weight:400 700;font-display:swap;unicode-range:U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F}

:root{
  --color-primary:#1F1F1D;
  --color-secondary:#746D65;
  --color-accent:#B89A68;
  --color-accent-hover:#A68B5E;
  --color-accent-text:#786444;
  --color-accent-soft:rgba(184,154,104,0.14);
  --color-on-accent:#1F1F1D;
  --color-background:#F5F1EA;
  --color-surface:#FCFAF7;
  --color-surface-secondary:#E8DED1;
  --color-surface-sunken:#EEE7DC;
  --color-text-primary:#1F1F1D;
  --color-text-secondary:#746D65;
  --color-text-muted:#93877A;
  --color-border:rgba(31,31,29,0.08);
  --color-border-strong:rgba(31,31,29,0.16);
  --color-success:#68856F;
  --color-warning:#C49B58;
  --color-error:#A96060;
  --color-info:#6C7F91;
  --color-success-text:#5E7864;
  --color-error-text:#A15B5B;
  --color-warning-text:#896D3E;
  --color-info-text:#617283;
  --color-footer-bg:#1F1F1D;
  --color-footer-text:#F5F1EA;
  --color-footer-muted:#A4A19C;
  --color-footer-accent:#B89A68;
  --color-overlay:rgba(19,19,17,0.38);
  --shadow-light:rgba(254,253,252,0.95);
  --shadow-dark:rgba(139,133,125,0.22);
  --shadow-soft:0 2px 6px rgba(139,133,125,0.12), 0 12px 32px rgba(139,133,125,0.12);
  --shadow-raised:-6px -6px 26px rgba(254,253,252,0.95), 10px 12px 36px rgba(139,133,125,0.22), inset 1px 1px 0 rgba(255,255,255,.7), inset -1px -1px 0 rgba(139,133,125,0.08);
  --shadow-card:-5px -5px 22px rgba(254,253,252,0.95), 8px 10px 31px rgba(139,133,125,0.12), inset 1px 1px 0 rgba(255,255,255,.7), inset -1px -1px 0 rgba(139,133,125,0.08);
  --shadow-control:-2px -2px 10px rgba(254,253,252,0.95), 4px 5px 14px rgba(139,133,125,0.12), inset 1px 1px 0 rgba(255,255,255,.7), inset -1px -1px 0 rgba(139,133,125,0.08);
  --shadow-hover:-8px -8px 34px rgba(254,253,252,0.95), 14px 17px 48px rgba(139,133,125,0.22), inset 1px 1px 0 rgba(255,255,255,.7), inset -1px -1px 0 rgba(139,133,125,0.08);
  --shadow-inset:inset 3px 3px 8px rgba(139,133,125,0.08), inset -3px -3px 8px rgba(254,253,252,0.95);
  --shadow-pressed:inset 2px 2px 6px rgba(139,133,125,0.22), inset -2px -2px 5px rgba(254,253,252,0.95);
  --shadow-float:0 30px 60px rgba(139,133,125,0.22), 0 8px 18px rgba(139,133,125,0.12);
  --button-primary-bg:#1F1F1D;
  --button-primary-text:#F5F1EA;
  --button-primary-hover:#413A2E;
  --button-secondary-bg:#FCFAF7;
  --button-secondary-text:#1F1F1D;
  --input-bg:#F9F6F1;
  --input-focus:#B89A68;
  --nav-active:#9C8358;
  --badge-bg:rgba(184,154,104,0.14);
  --badge-text:#816C49;
  --icon-accent:#B89A68;
  --3d-primary:#FCFAF7;
  --3d-secondary:#E8DED1;
  --3d-accent:#B89A68;
  --3d-highlight:#DFD2BB;
  --3d-shadow:rgba(139,133,125,0.28);
  --3d-surface:#FDFCFA;
  --3d-glow:rgba(223,210,187,0.4);
  --3d-light:rgba(255,253,248,.9);
  --space-2xs:4px;--space-xs:8px;--space-sm:12px;--space-md:16px;--space-lg:24px;--space-xl:40px;--space-2xl:64px;--space-3xl:104px;
  --radius-xs:10px;--radius-sm:14px;--radius-md:18px;--radius-lg:26px;--radius-xl:32px;--radius-full:999px;
  --font-body:Manrope,"Segoe UI",system-ui,-apple-system,sans-serif;--font-display:"Cormorant Garamond",Georgia,"Times New Roman",serif;
  --ease:cubic-bezier(.22,.61,.36,1);--ease-out:cubic-bezier(.16,1,.3,1);--dur-fast:200ms;--dur:320ms;--dur-slow:500ms;
  --wrap:1240px;--nav-h:84px;
  color-scheme:light;
}
:root[data-mode=dark]{color-scheme:dark}
:lang(ar){--font-body:"IBM Plex Sans Arabic",Manrope,Tahoma,sans-serif;--font-display:"IBM Plex Sans Arabic",Tahoma,sans-serif}
:lang(he){--font-body:Heebo,Manrope,Arial,sans-serif;--font-display:Heebo,Arial,sans-serif}
```
