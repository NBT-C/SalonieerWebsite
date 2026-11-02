// Phone numbers in the admin panel, the same rules as the Salonieer app and the database: a country (calling code)
// plus the number, sent as E.164. Israeli and Palestinian local numbers are tried in both countries, and a Palestinian
// mobile written +972 59… / 56… is the +970 number it is (as on the server). Used by "Owners & access" and approvals.
export const DIAL_COUNTRIES = ['PS', 'IL', 'JO', 'SA', 'AE', 'EG', 'TR', 'LB', 'QA', 'KW', 'BH', 'OM', 'IQ', 'SY', 'MA', 'TN', 'DZ', 'GB', 'DE', 'FR', 'US'];
const DIAL_FALLBACK = { PS: '970', IL: '972', JO: '962', SA: '966', AE: '971', EG: '20', TR: '90', LB: '961', QA: '974', KW: '965', BH: '973', OM: '968',
  IQ: '964', SY: '963', MA: '212', TN: '216', DZ: '213', GB: '44', DE: '49', FR: '33', US: '1' };
const TZ_COUNTRY = { 'Asia/Hebron': 'PS', 'Asia/Gaza': 'PS', 'Asia/Jerusalem': 'IL', 'Asia/Tel_Aviv': 'IL', 'Asia/Amman': 'JO', 'Asia/Riyadh': 'SA',
  'Asia/Dubai': 'AE', 'Africa/Cairo': 'EG', 'Europe/Istanbul': 'TR', 'Asia/Beirut': 'LB', 'Asia/Qatar': 'QA', 'Asia/Kuwait': 'KW', 'Asia/Bahrain': 'BH',
  'Asia/Muscat': 'OM', 'Asia/Baghdad': 'IQ', 'Asia/Damascus': 'SY', 'Africa/Casablanca': 'MA', 'Africa/Tunis': 'TN', 'Africa/Algiers': 'DZ',
  'Europe/London': 'GB', 'Europe/Berlin': 'DE', 'Europe/Paris': 'FR', 'America/New_York': 'US' };
let lib = null;
export const loadPhone = async () => lib ||= await import('../lib/phone.js');
export const dialOf = c => { try { return String(lib.getCountryCallingCode(c)); } catch { return DIAL_FALLBACK[c] || ''; } };
export const countryName = (c, lang) => { try { return new Intl.DisplayNames([lang, 'en'], { type: 'region' }).of(c) || c; } catch { return c; } };
export const countryForTimezone = tz => TZ_COUNTRY[tz] || '';
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
// <option>s for a country select: "Palestine (+970)" (the code kept left-to-right inside Arabic / Hebrew text).
export const countryOptions = (selected, lang) => DIAL_COUNTRIES.map(c => `<option value="${c}"${c === selected ? ' selected' : ''}>${esc(countryName(c, lang))} (⁦+${esc(dialOf(c))}⁩)</option>`).join('');
// { e164, dial } for the number in the chosen country, or null when it is not a valid number.
export function toE164(value, country) {
  const v = String(value || '').trim().replace(/^00/, '+');
  if (!lib || !v) return null;
  let found = null;
  if (v.startsWith('+')) { try { const n = lib.parsePhoneNumberWithError(v); if (n.isValid()) found = n; } catch {} }
  for (const c of [country, ...({ IL: ['PS'], PS: ['IL'] }[country] || [])].filter(Boolean)) {
    if (found) break;
    try { const n = lib.parsePhoneNumberWithError(v, c); if (n.isValid()) found = n; } catch {}
  }
  if (!found) return null;
  const pal = found.number.match(/^\+9725([69]\d{7})$/);
  return { e164: pal ? '+9705' + pal[1] : found.number, dial: pal ? '970' : String(found.countryCallingCode) };
}
// The country and the national number of an E.164 number (to prefill a form), or null.
export function splitE164(value) {
  if (!lib || !/^\+\d{6,15}$/.test(String(value || ''))) return null;
  try {
    const n = lib.parsePhoneNumberWithError(value);
    const country = n.number.startsWith('+970') ? 'PS' : n.country || '';
    return DIAL_COUNTRIES.includes(country) ? { country, national: n.formatNational().replace(/[^\d]/g, '') } : null;
  } catch { return null; }
}
