/* Minimal PostgREST/Auth transport. Bundled with the app; no runtime JS CDN. */
(function () {
  "use strict";
  class Client {
    constructor(url, key, options = {}) {
      this.persist = options.auth?.persistSession !== false;
      this.url = String(url).replace(/\/$/, ""); this.key = key;
      this.storageKey = "salonieer:supabase-session:" + btoa(this.url).replace(/[^a-z0-9]/gi, "").slice(0, 80);
      this.session = this.readSession(); this.refreshing = null;
      if (!/^https:\/\/[a-zA-Z0-9.-]+(?::\d+)?$/.test(this.url)) throw new Error("رابط Supabase غير صحيح");
      let savedFragment = "";
      try { savedFragment = sessionStorage.getItem("salonieer:auth-fragment") || ""; } catch {}
      this.consumeAuthRedirect(savedFragment || window.location.hash);
    }
    async send(path, body, jwt, method = "POST") {
      const headers = { apikey: this.key, "Content-Type": "application/json" };
      if (jwt) headers.Authorization = "Bearer " + jwt;
      else headers.Authorization = "Bearer " + this.key;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45000);
      try {
        const response = await fetch(this.url + path, {
          method, headers, body: method === "GET" ? undefined : JSON.stringify(body || {}), signal: controller.signal
        });
        const raw = await response.text();
        let data;
        try { data = raw ? JSON.parse(raw) : null; } catch { throw new Error("استجابة الخادم غير صحيحة"); }
        if (!response.ok) {
          const rawMessage = data?.msg || data?.message || data?.error_description || data?.error || "تعذّر إكمال الطلب";
          const error = new Error(window.Lang ? Lang.error(rawMessage) : rawMessage);
          error.rawMessage = rawMessage; error.status = response.status; throw error;
        }
        return data;
      } finally { clearTimeout(timeout); }
    }
    readSession() {
      if (!this.persist) return null;
      try {
        const value = JSON.parse(localStorage.getItem(this.storageKey) || "null");
        return value && typeof value.access_token === "string" && typeof value.refresh_token === "string" ? value : null;
      } catch { return null; }
    }
    saveSession() {
      if (!this.persist) return;
      try { if (this.session) localStorage.setItem(this.storageKey, JSON.stringify(this.session)); else localStorage.removeItem(this.storageKey); }
      catch { /* Private browsing can reject storage; the in-memory session still works. */ }
    }
    consumeAuthRedirect(input) {
      // Supabase recovery links return access_token/refresh_token in the URL
      // fragment. Consume them before the hash router runs, then remove the
      // credentials from the address bar and leave a one-shot marker for the
      // platform password-change screen.
      const hash = String(input || "");
      const raw = hash.startsWith("#") ? hash.slice(1) : hash;
      if (!raw.includes("access_token=") || !raw.includes("refresh_token=")) return;
      const params = new URLSearchParams(raw.replace(/^\//, ""));
      const access = params.get("access_token"), refresh = params.get("refresh_token");
      if (!access || !refresh) return;
      this.keep({ access_token: access, refresh_token: refresh, expires_in: Number(params.get("expires_in") || 3600) });
      try { sessionStorage.setItem("salonieer:recovery", "1"); } catch {}
      try { sessionStorage.removeItem("salonieer:auth-fragment"); } catch {}
      try { history.replaceState(null, "", location.pathname + "?recovery=1"); } catch {}
    }
    keep(data) {
      if (data?.access_token) {
        this.session = {
          ...(this.session || {}), ...data,
          refresh_token: data.refresh_token || this.session?.refresh_token || "",
          expires_at: Date.now() + Number(data.expires_in || 3600) * 1000,
        };
        if (this.session.refresh_token) this.saveSession();
      }
      return data;
    }
    async token() {
      if (this.persist && !this.refreshing) this.session = this.readSession();
      if (!this.session) return null;
      if (Date.now() < this.session.expires_at - 60000) return this.session.access_token;
      if (!this.session.refresh_token) { this.session = null; this.saveSession(); return null; }
      if (!this.refreshing) this.refreshing = this.send("/auth/v1/token?grant_type=refresh_token", { refresh_token: this.session.refresh_token })
        .then(data => this.keep(data).access_token)
        .catch(error => {
          // Offline/temporary server failures must not erase a valid refresh session.
          if ([400,401,403].includes(error.status)) { this.session = null; this.saveSession(); }
          throw error;
        })
        .finally(() => { this.refreshing = null; });
      return this.refreshing;
    }
    async rpc(fn, args = {}) {
      // A call started by a tap shows the loading screen only if it takes a
      // while (rework.js): a change after 0.45 s, a read after 0.9 s.
      const done = window.TapGuard ? window.TapGuard.track(!window.rpcIsWrite || window.rpcIsWrite(fn)) : null;
      try {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(fn)) throw new Error("اسم العملية غير صحيح");
        const data = await this.send("/rest/v1/rpc/" + fn, args, await this.token());
        return { data, error: null };
      } catch (error) { return { data: null, error }; }
      finally { if (done) done(); }
    }
    async signIn(email, password) {
      return this.keep(await this.send("/auth/v1/token?grant_type=password", { email, password }));
    }
    async signOut() {
      try { const token = await this.token(); if (token) await this.send("/auth/v1/logout", {}, token); }
      finally { this.session = null; this.saveSession(); }
    }
    async changePassword(password) {
      const token = await this.token();
      if (!token) throw new Error("سجل الدخول أولاً");
      return this.send("/auth/v1/user", { password }, token, "PUT");
    }
    async recover(email) {
      const body = { email };
      if (window.NativeBridge?.available?.()) body.redirect_to = "salonieer://recovery";
      else if (/^https?:$/i.test(location.protocol)) body.redirect_to = location.origin + location.pathname;
      return this.send("/auth/v1/recover", body);
    }
  }
  window.supabase = { createClient: (url, key, options) => new Client(url, key, options) };
})();
