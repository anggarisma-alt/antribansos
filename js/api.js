/* Klien REST untuk Google Apps Script.
   - POST memakai text/plain agar lolos CORS tanpa preflight.
   - Token dikirim di body, tidak pernah di URL. */
(function () {
  const KEY = 'ab_token';
  const Api = {
    get token() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } },
    set token(v) { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch (e) {} },

    configured() {
      const u = (window.APP_CONFIG && APP_CONFIG.GAS_URL) || '';
      return /^https:\/\/script\.google\.com\/.+\/exec$/.test(u) && u.indexOf('XXXX') < 0;
    },

    async _fetch(url, opts) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), APP_CONFIG.TIMEOUT_MS || 30000);
      try {
        const res = await fetch(url, Object.assign({ redirect: 'follow', signal: ctl.signal }, opts));
        const txt = await res.text();
        try { return JSON.parse(txt); }
        catch (e) { return { success: false, message: 'Respons server tidak dikenali. Pastikan deployment Web App: akses "Anyone".', code: 'BAD' }; }
      } catch (e) {
        return { success: false, code: 'NET', message: e.name === 'AbortError' ? 'Server terlalu lama menjawab. Coba lagi.' : 'Tidak dapat terhubung ke server. Periksa internet.' };
      } finally { clearTimeout(timer); }
    },

    async call(action, data) {
      if (!this.configured()) return { success: false, code: 'CONFIG', message: 'GAS_URL belum diisi di js/config.js.' };
      const r = await this._fetch(APP_CONFIG.GAS_URL, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: action, token: this.token, data: data || {} })
      });
      if (r && r.code === 'AUTH') window.dispatchEvent(new CustomEvent('ab:auth'));
      return r;
    },

    // Data publik layar display (GET, tanpa token)
    async display(rev) {
      if (!this.configured()) return { success: false, code: 'CONFIG', message: 'GAS_URL belum diisi di js/config.js.' };
      return this._fetch(APP_CONFIG.GAS_URL + '?action=display&rev=' + encodeURIComponent(rev || ''), { method: 'GET' });
    }
  };
  window.Api = Api;
})();
