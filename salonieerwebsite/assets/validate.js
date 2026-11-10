// Client-side validation for instant feedback. These rules mirror security.php; the server re-checks everything.
const COMMON = new Set(['1234567890','12345678910','0123456789','1111111111','0000000000','1234512345','qwertyuiop','password123','password1234','passw0rd123','iloveyou123','abcdefghij','abc1234567','qwerty1234','qwerty12345','1q2w3e4r5t','1qaz2wsx3edc','letmein123','welcome123','admin12345','administrator','salonieer1','salonieer123','987654321','9876543210','asdfghjkl1','zxcvbnm123','aaaaaaaaaa','11223344556','password!1']);
export const clean = v => String(v ?? '').replace(/\s+/gu, ' ').trim();

export function username(v) {
  return /^[\p{L}\p{N}][\p{L}\p{N}_.-]{2,31}$/u.test(clean(v)) ? null : 'invalidUsername';
}
export function fullName(v) {
  const s = clean(v);
  if (!s) return 'requiredFullName';
  const letters = (s.match(/\p{L}/gu) || []).length;
  return s.length <= 100 && letters >= 2 && /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u.test(s) ? null : 'invalidFullName';
}
export function email(v) {
  const s = clean(v).toLowerCase();
  if (!s) return 'requiredEmail';
  return s.length <= 254 && /^[^\s@<>()[\]\\,;:"]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(s) ? null : 'invalidEmail';
}
export function password(v, mail = '', user = '') {
  if (!v) return 'requiredPassword';
  if (v.length < 10 || v.length > 128) return 'invalidPassword';
  const lower = v.toLowerCase();
  if (COMMON.has(lower) || new Set([...lower]).size < 4) return 'weakPassword';
  for (const part of [String(mail).split('@')[0], String(user)]) if (part.length >= 4 && lower.includes(part.toLowerCase())) return 'passwordPersonal';
  return null;
}
// 0 (empty) to 4 (strong) for the strength meter; the server only enforces the rules above.
export function passwordScore(v) {
  if (!v) return 0;
  let s = v.length >= 10 ? 1 : 0;
  if (v.length >= 14) s++;
  if (/[a-z]/.test(v) && /[A-Z]/.test(v)) s++;
  if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) s++;
  return Math.min(4, s);
}

// ---- ID numbers (same rule as canonicalIdNumber in security.php) ----
export const normalizeId = v => String(v ?? '').toUpperCase().replace(/[\s\-./_]/gu, '');
// Same digit repeated (11111), a straight run up or down (12345, 987654321), or a short block repeated (121212, 123123).
export function obviousFakeId(d) {
  if (new Set(d).size === 1) return true;
  for (const step of [1, 9]) if ([...d].every((c, i) => i === 0 || (+c - +d[i - 1] + 10) % 10 === step)) return true;
  for (let len = 2; len <= Math.min(4, Math.floor(d.length / 2)); len++) if (d.slice(0, len).repeat(Math.floor(d.length / len) + 1).startsWith(d)) return true;
  return false;
}
export function idNumber(v) {
  const id = normalizeId(v);
  if (!id) return 'requiredId';
  if (id.length > 64 || !/^\d{5,}$/.test(id)) return 'invalidId';
  return obviousFakeId(id) ? 'fakeId' : null;
}
export function salonName(v) {
  const s = clean(v);
  if (!s) return 'requiredSalonName';
  return s.length >= 2 && s.length <= 100 && /[\p{L}\p{N}]/u.test(s) && !/[<>{}]/.test(s) ? null : 'invalidSalonName';
}
