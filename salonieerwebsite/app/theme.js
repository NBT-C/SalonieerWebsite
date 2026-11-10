/* Local brand system. Each salon owns its colors; the control plane resets them. */
(function () {
  "use strict";
  // 2.31: the official Salonieer identity is the default theme: cool blue
  // (#3576CA, the deeper of the two sampled logo blues, so white text on it
  // stays readable) with the champagne-gold detail (#E8C588). Salons that chose
  // their own colours keep them.
  const DEFAULTS = Object.freeze({ primary_color: "#3576ca", secondary_color: "#e8c588", style_preset: "ivory", motion: "full" });
  // Colour pairs every salon was created with before 2.31 (database default,
  // website-created salons, the earlier app default). A salon still showing
  // exactly one of these pairs never chose colours, so it gets the new default.
  const LEGACY_DEFAULTS = new Set(["#1a88a4|#c6b18b", "#246653|#d0ab73"]);
  const presets = ["noir", "ivory", "midnight"];
  const hex = (v, fallback) => /^#[0-9a-f]{6}$/i.test(v || "") ? v.toLowerCase() : fallback;
  const rgb = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const mix = (a, b, amount) => "#" + rgb(a).map((v, i) => Math.round(v * (1 - amount) + rgb(b)[i] * amount).toString(16).padStart(2, "0")).join("");
  const luminance = c => rgb(c).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [.2126, .7152, .0722][i], 0);
  // Text on a coloured surface: whichever of white or near-black has the
  // higher contrast (they are equal at a luminance of about 0.19).
  const ink = c => luminance(c) > .19 ? "#071115" : "#ffffff";

  // The status bar, the home-indicator strip and the overscroll area are
  // painted by whatever colour the page reports. Reading the resolved --bg
  // keeps them identical to the surface right below them in BOTH themes —
  // a guessed constant is what produced the mismatched band.
  const toHex = (value) => {
    const v = String(value || "").trim();
    if (/^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
    if (/^#[0-9a-f]{3}$/i.test(v)) return ("#" + v[1] + v[1] + v[2] + v[2] + v[3] + v[3]).toLowerCase();
    const m = v.match(/^rgba?\(([^)]+)\)$/i);
    // Surfaces mixed with color-mix() (the clay theme) compute to
    // color(srgb r g b) with 0-1 channels; without this the reader fell back
    // to a light default and Android/iOS painted light system bars over a
    // dark page.
    const srgb = v.match(/^color\(\s*srgb\s+([^)]+)\)$/i);
    if (!m && !srgb) return "";
    const parts = (m ? m[1] : srgb[1]).split(/[\s,/]+/).filter(Boolean)
      .map((n, i) => n.endsWith("%") ? parseFloat(n) / 100 * (m && i < 3 ? 255 : 1) : Number(n));
    if (parts.length < 3 || parts.slice(0, 3).some(n => !Number.isFinite(n))) return "";
    if (parts.length > 3 && parts[3] === 0) return "";          // transparent: not a surface
    const channels = srgb ? parts.slice(0, 3).map(n => n * 255) : parts.slice(0, 3);
    return "#" + channels.map(n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")).join("");
  };
  function surfaceColor() {
    const root = document.documentElement;
    const read = (el) => toHex(getComputedStyle(el).getPropertyValue("--bg"))
      || toHex(getComputedStyle(el).backgroundColor);
    return read(document.body || root) || read(root) || (root.dataset.theme === "light" ? "#f7f6f3" : "#0e0f12");
  }
  let chromeFrame = 0;
  function syncChrome() {
    // One read per frame: the colour can only change once per paint anyway,
    // and getComputedStyle inside a scroll would force needless style work.
    cancelAnimationFrame(chromeFrame);
    chromeFrame = requestAnimationFrame(() => {
      const color = surfaceColor();
      const root = document.documentElement;
      root.style.setProperty("--surface-chrome", color);
      document.querySelectorAll('meta[name="theme-color"]').forEach(tag => tag.setAttribute("content", color));
      document.dispatchEvent(new CustomEvent("salonieer:theme"));
    });
  }

  function normalize(data = {}) {
    let primary = hex(data.primary_color, DEFAULTS.primary_color), secondary = hex(data.secondary_color, DEFAULTS.secondary_color);
    const custom = !LEGACY_DEFAULTS.has(primary + "|" + secondary) && !(primary === DEFAULTS.primary_color && secondary === DEFAULTS.secondary_color);
    if (!custom) { primary = DEFAULTS.primary_color; secondary = DEFAULTS.secondary_color; }
    return { primary_color: primary, secondary_color: secondary,
      style_preset: presets.includes(data.style_preset) ? data.style_preset : DEFAULTS.style_preset,
      motion: ["full", "subtle"].includes(data.motion) ? data.motion : DEFAULTS.motion, custom };
  }
  // 2.32: the Salonieer palette is neutral first. Surfaces are warm white
  // (light) or charcoal (dark), never blue; the accent is the logo's navy on
  // light surfaces and its champagne gold on dark ones. Blue stayed on every
  // button, tab and badge in 2.31, which made the main screens read as one
  // blue block. A salon that chose its own colours keeps them.
  // METON (2026-11-06): aubergine actions on light surfaces, coral on dark ones; coral details (meton.css).
  // Cobalt Pulse (owner, 2026-11-10): ONE METON palette on every screen of every business, in both modes (meton.css).
  // A business's saved colours stay in its settings but no longer recolour the app.
  const SALONIEER_ACCENT = Object.freeze({ light: "#3d50d9", dark: "#9faaff", detailLight: "#3d50d9", detailDark: "#9faaff" });
  function apply(data = {}, options = {}) {
    const theme = { ...normalize(data), custom: false }, el = options.element || document.documentElement;
    const dark = options.dark ?? theme.style_preset !== "ivory";
    const p = dark ? SALONIEER_ACCENT.dark : SALONIEER_ACCENT.light;
    const a = dark ? SALONIEER_ACCENT.detailDark : SALONIEER_ACCENT.detailLight;
    el.dataset.theme = dark ? "dark" : "light";
    el.dataset.style = theme.style_preset;
    el.dataset.motion = theme.motion;
    // The platform screens and salons without their own colours use the
    // Salonieer palette for surfaces too (brand.css); custom salons keep the
    // surfaces of the theme they already had.
    el.dataset.palette = theme.custom ? "salon" : "salonieer";
    const values = {
      "--brand": p, "--accent": p, "--brass": p, "--brass-2": mix(p, "#000000", .13),
      "--brand-ink": mix(p, dark ? "#ffffff" : "#000000", dark ? .46 : .34),
      "--brass-bright": mix(p, dark ? "#ffffff" : "#000000", dark ? .46 : .34),
      "--brand-soft": mix(p, dark ? "#0c1215" : "#ffffff", .88),
      "--brass-soft": mix(p, dark ? "#0c1215" : "#ffffff", .88),
      "--brand-line": mix(p, dark ? "#0c1215" : "#ffffff", .64),
      "--brass-line": mix(p, dark ? "#0c1215" : "#ffffff", .64),
      "--accent-soft": mix(p, dark ? "#0c1215" : "#ffffff", .88),
      "--accent-ink": mix(p, dark ? "#ffffff" : "#000000", dark ? .46 : .34),
      "--on-brand": ink(p), "--on-accent": ink(p), "--detail": a,
      "--detail-ink": mix(a, dark ? "#ffffff" : "#000000", dark ? .15 : .4)
    };
    Object.entries(values).forEach(([key, val]) => el.style.setProperty(key, val));
    if (!options.element) {
      syncChrome();
    }
    return theme;
  }
  window.SalonTheme = { DEFAULTS, SALONIEER_ACCENT, normalize, apply, ink, syncChrome };
  // Light / Dark / System (owner, 2026-11-10). Remembered on this device ("meton:appearance"); System follows the
  // device and changes with it. The account's saved dark_mode is kept in step for Light / Dark.
  const KEY = "meton:appearance", media = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
  const Appearance = {
    get() { try { const v = localStorage.getItem(KEY); return ["light", "dark", "system"].includes(v) ? v : "system"; } catch { return "system"; } },
    isDark(pref = Appearance.get()) { return pref === "dark" || (pref === "system" && !!media?.matches); },
    set(v) { try { localStorage.setItem(KEY, ["light", "dark"].includes(v) ? v : "system"); localStorage.setItem("aj_dark", Appearance.isDark() ? "1" : "0"); } catch {} },
  };
  media?.addEventListener?.("change", () => { if (Appearance.get() === "system") window.Auth?.applyTheme?.(); });
  window.Appearance = Appearance;
  document.addEventListener("DOMContentLoaded", syncChrome);
})();
