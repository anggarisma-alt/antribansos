/* Suara panggilan: text-to-speech bahasa Indonesia + bunyi "ding".
   Status bisu disimpan per perangkat dan per konteks ('display' atau 'panel'). */
(function () {
  const Suara = {
    queue: [], busy: false, unlocked: false, last: '', actx: null, voice: null,

    muted(ctx, cfg) {
      let v = null;
      try { v = localStorage.getItem('ab_mute_' + ctx); } catch (e) {}
      if (v === null) return ctx === 'display' ? (cfg && cfg.awal === '0') : true;   // panel loket default bisu
      return v === '1';
    },
    setMuted(ctx, m) { try { localStorage.setItem('ab_mute_' + ctx, m ? '1' : '0'); } catch (e) {} },

    supported() { return 'speechSynthesis' in window; },

    // Harus dipanggil dari sentuhan pengguna (kebijakan autoplay browser)
    unlock() {
      this.unlocked = true;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) { if (!this.actx) this.actx = new AC(); if (this.actx.state === 'suspended') this.actx.resume(); }
        if (this.supported()) { speechSynthesis.getVoices(); const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); }
      } catch (e) {}
    },

    _pickVoice() {
      if (!this.supported()) return null;
      const vs = speechSynthesis.getVoices() || [];
      return vs.filter(v => /^id[-_]/i.test(v.lang) || /indonesia/i.test(v.name))[0] || null;
    },

    ding(vol) {
      try {
        if (!this.actx) return Promise.resolve();
        const a = this.actx, t = a.currentTime, g = a.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(Math.max(.05, (vol || 1) * .5), t + .03);
        g.gain.exponentialRampToValueAtTime(0.0001, t + .9);
        g.connect(a.destination);
        [880, 660].forEach((f, i) => { const o = a.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(g); o.start(t + i * .28); o.stop(t + i * .28 + .4); });
        return new Promise(r => setTimeout(r, 900));
      } catch (e) { return Promise.resolve(); }
    },

    // "P-012" -> "Prioritas 12"
    ucapNomor(no) {
      const p = String(no).split('-');
      const kata = p[0] === 'P' ? 'Prioritas' : (p[0] === 'U' ? 'Umum' : (p[0] === 'K' ? 'Khusus' : p[0]));
      return kata + ' ' + (parseInt(p[1], 10) || p[1] || '');
    },
    kalimat(format, no, loket) {
      return String(format || 'Nomor antrian {nomor}, silakan menuju {loket}').replace('{nomor}', this.ucapNomor(no)).replace('{loket}', loket || '');
    },

    announce(no, loket, s) {          // s = {ding, kecepatan, volume, format}
      const teks = this.kalimat(s && s.format, no, loket);
      this.last = { teks: teks, s: s || {} };
      this.queue.push(this.last);
      this._next();
    },
    ulang() { if (this.last) { this.queue.push(this.last); this._next(); } },

    async _next() {
      if (this.busy || !this.queue.length) return;
      this.busy = true;
      const item = this.queue.shift();
      const vol = Math.max(0, Math.min(100, Number(item.s.volume == null ? 100 : item.s.volume))) / 100;
      try {
        if (item.s.ding !== '0') await this.ding(vol);
        if (this.supported() && vol > 0) {
          await new Promise(res => {
            const u = new SpeechSynthesisUtterance(item.teks);
            u.lang = 'id-ID'; u.volume = vol;
            u.rate = { lambat: .8, normal: 1, cepat: 1.2 }[item.s.kecepatan] || 1;
            const v = this._pickVoice(); if (v) u.voice = v;
            u.onend = res; u.onerror = res;
            speechSynthesis.cancel(); speechSynthesis.speak(u);
            setTimeout(res, 12000);   // jaga-jaga bila onend tidak terpanggil
          });
        }
      } catch (e) {}
      this.busy = false;
      this._next();
    }
  };
  window.Suara = Suara;
})();
