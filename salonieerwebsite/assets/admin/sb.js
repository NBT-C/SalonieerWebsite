// Platform session for the admin panel: Supabase Auth (email + password of a Salonieer platform owner or manager)
// and calls to the platform server functions (the app has no console since 2.29). Every permission is checked by the database; this
// file only carries the signed-in user's token. The URL and publishable key are public by design.
const STORE = 'salonieer:platform-session:v1';
let config = null, session = null, refreshing = null;

export function configure(c) { config = c; try { session = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch { session = null; } }
export const signedIn = () => !!session?.refresh_token;
export const sessionEmail = () => session?.user?.email || '';

function save(data) {
  if (data) session = { ...session, ...data, expires_at: Date.now() + Number(data.expires_in || 3600) * 1000 };
  else session = null;
  try { session ? localStorage.setItem(STORE, JSON.stringify(session)) : localStorage.removeItem(STORE); } catch {}
}
async function request(path, { method = 'POST', body, token } = {}) {
  if (!config?.url) throw { code: 'platformUnavailable' };
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
  let res;
  try {
    res = await fetch(config.url + path, { method, signal: controller.signal, cache: 'no-store',
      headers: { apikey: config.key, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body) });
  } catch { throw { code: 'connectionError' }; }
  finally { clearTimeout(timer); }
  const text = await res.text(); let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { throw { code: 'serverError' }; }
  if (!res.ok) throw { code: 'platformError', status: res.status, message: data?.message || data?.msg || data?.error_description || data?.error || 'error' };
  return data;
}
async function token() {
  if (!session) throw { code: 'platformSignIn' };
  if (Date.now() < session.expires_at - 60000) return session.access_token;
  refreshing ||= request('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: session.refresh_token } })
    .then(d => { save(d); return d.access_token; })
    .catch(e => { if ([400, 401, 403].includes(e.status)) save(null); throw e.status ? { code: 'platformSignIn' } : e; })
    .finally(() => { refreshing = null; });
  return refreshing;
}
export async function signIn(email, password) {
  try { save(await request('/auth/v1/token?grant_type=password', { body: { email, password } })); }
  catch (e) { throw e.status === 400 ? { code: 'invalidCredentials' } : e; }
}
export async function signOut() {
  try { if (session) await request('/auth/v1/logout', { token: await token() }); } catch {}
  save(null);
}
export async function recover(email) {
  return request('/auth/v1/recover', { body: { email, redirect_to: location.origin + '/admin' } });
}
// A password-recovery link lands on /admin with the tokens in the URL fragment: keep them, then clean the address bar.
export function consumeRecovery() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (!h.get('access_token') || !h.get('refresh_token')) return false;
  save({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token'), expires_in: Number(h.get('expires_in') || 3600) });
  history.replaceState(null, '', location.pathname + location.search);
  return h.get('type') === 'recovery';
}
export async function changePassword(password) { return request('/auth/v1/user', { method: 'PUT', token: await token(), body: { password } }); }

// rpc('platform_me') / rpc('elite_admin_list_users', {...}). Arabic database messages are passed on as `message`.
export async function rpc(fn, args = {}) {
  if (!/^[a-z_][a-z0-9_]*$/.test(fn)) throw { code: 'invalidRequest' };
  try {
    const data = await request('/rest/v1/rpc/' + fn, { body: args, token: await token() });
    if (data && typeof data === 'object' && !Array.isArray(data) && data.error) throw { code: 'platformError', message: data.error };
    return data;
  } catch (e) {
    if (e.status === 401) { save(null); throw { code: 'platformSignIn' }; }
    throw e;
  }
}
