// Salonieer 2.43 — amounts in the salon's own currency.
// A salon works in one currency (its Business Suite currency): it arrives with the salon's settings
// (get_app_settings → App.settings.currency) and the Business Suite pages get the same one in their context. Every
// price the app writes goes through Money.fmt: services and bookings, receipts, finance, wages, packages. A new salon
// gets its country's currency (Bahrain → BHD); the owner can change it in the salon settings.
// Salonieer's own prices (an extra Specialist seat) are US dollars — Paddle charges USD only: Money.seat().
(function () {
  const lang = () => (window.Lang && Lang.get && Lang.get()) || "ar";
  const pick = (ar, en, he) => { const l = lang(); return l === "en" ? en : l === "he" ? he : ar; };
  // dec: digits after the point when an amount is not whole (dinars count fils: 4.500). The label follows the amount,
  // as the app always wrote prices; the shekel and the Jordanian dinar keep their catalogue words.
  const C = {
    ILS: { dec: 2, label: () => Lang.t("شيكل"), name: () => pick("شيكل", "Israeli shekel", "שקל חדש") },
    JOD: { dec: 2, label: () => Lang.t("دينار"), name: () => pick("دينار أردني", "Jordanian dinar", "דינר ירדני") },
    BHD: { dec: 3, label: () => pick("د.ب", "BHD", "BHD"), name: () => pick("دينار بحريني", "Bahraini dinar", "דינר בחרייני") },
    SAR: { dec: 2, label: () => pick("ر.س", "SAR", "SAR"), name: () => pick("ريال سعودي", "Saudi riyal", "ריאל סעודי") },
    AED: { dec: 2, label: () => pick("د.إ", "AED", "AED"), name: () => pick("درهم إماراتي", "UAE dirham", "דירהם אמירתי") },
    KWD: { dec: 3, label: () => pick("د.ك", "KWD", "KWD"), name: () => pick("دينار كويتي", "Kuwaiti dinar", "דינר כוויתי") },
    QAR: { dec: 2, label: () => pick("ر.ق", "QAR", "QAR"), name: () => pick("ريال قطري", "Qatari riyal", "ריאל קטרי") },
    OMR: { dec: 3, label: () => pick("ر.ع", "OMR", "OMR"), name: () => pick("ريال عماني", "Omani rial", "ריאל עומאני") },
    EGP: { dec: 2, label: () => pick("ج.م", "EGP", "EGP"), name: () => pick("جنيه مصري", "Egyptian pound", "לירה מצרית") },
    USD: { dec: 2, label: () => "$", name: () => pick("دولار أمريكي", "US dollar", "דולר אמריקאי") },
    EUR: { dec: 2, label: () => "€", name: () => pick("يورو", "Euro", "אירו") },
  };
  // The order the owner sees them in: the Gulf, the Levant and Egypt, then the dollar and the euro.
  const ORDER = ["BHD", "SAR", "AED", "KWD", "QAR", "OMR", "JOD", "ILS", "EGP", "USD", "EUR"];
  const SYMBOLS = { "₪": "ILS", "$": "USD", "€": "EUR", "JD": "JOD" };

  // The salon's currency now: the settings of the open salon, else the shekel (as before 2.43).
  function code() {
    const c = String(window.App?.settings?.currency || "").toUpperCase();
    return C[c] ? c : "ILS";
  }
  // A server symbol (₪, $, €, JD) or an ISO code → the code; null when unknown.
  function fromSymbol(s) {
    if (!s) return null;
    const v = String(s).trim();
    if (SYMBOLS[v]) return SYMBOLS[v];
    const u = v.toUpperCase();
    return C[u] ? u : null;
  }
  function label(cur) { return (C[cur] || C.ILS).label(); }
  // 12 → "12 د.ب", 4.5 → "4.500 د.ب", 12.5 → "12.50 شيكل"; a minus sign stays on the left of the number in RTL.
  function fmt(amount, cur) {
    const c = C[fromSymbol(cur) || cur] ? (fromSymbol(cur) || cur) : code();
    const def = C[c];
    const v = Math.round((Number(amount) || 0) * Math.pow(10, def.dec)) / Math.pow(10, def.dec);
    const whole = Math.abs(v % 1) < 1e-9;
    let digits;
    try { digits = v.toLocaleString(window.Lang?.locale?.() || "ar", { minimumFractionDigits: whole ? 0 : def.dec, maximumFractionDigits: def.dec }); }
    catch { digits = String(v); }
    const text = v < 0 ? "⁦" + digits + "⁩" : digits;
    return text + " " + def.label();
  }
  // "دينار بحريني (BHD)" for the currency picker.
  function name(cur) { const c = C[cur]; return c ? `${c.name()} (${cur})` : cur; }
  function options(selected) {
    const sel = C[selected] ? selected : code();
    return ORDER.map(k => `<option value="${k}" ${k === sel ? "selected" : ""}>${UI.esc(name(k))}</option>`).join("");
  }
  // An extra Specialist seat: what the salon pays Salonieer (USD), e.g. "5 $ لكل شهر" / "55 $ لكل سنة"
  // ("per month" / "per year": the catalogue's «شهرياً» is the adjective "Monthly").
  function seat(price) {
    if (!price || !(Number(price.amount) > 0)) return "";
    return fmt(price.amount, price.currency || "USD") + " " + Lang.t(price.period === "year" ? "لكل سنة" : "لكل شهر");
  }
  window.Money = { fmt, code, label, fromSymbol, name, options, seat, codes: () => ORDER.slice() };
})();
