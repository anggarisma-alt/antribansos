/* Cetak struk antrian ke printer thermal 58/80 mm.
   Metode: 'rawbt' (aplikasi RawBT di Android), 'browser' (dialog cetak), 'bluetooth' (Web Bluetooth, eksperimental).
   Catatan: status "siap" hanya berdasarkan hasil Tes Cetak terakhir — RawBT tidak melaporkan koneksi printer. */
(function () {
  const LKEY = 'ab_printer';
  const BT_SERVICES = ['000018f0-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '0000ff00-0000-1000-8000-00805f9b34fb'];

  const ascii = s => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7E]/g, '?');
  const wrap = (s, w) => {
    const out = []; let cur = '';
    ascii(s).split(/\s+/).filter(Boolean).forEach(word => {
      if ((cur + ' ' + word).trim().length > w) { if (cur) out.push(cur); cur = word; } else cur = (cur + ' ' + word).trim();
    });
    if (cur) out.push(cur);
    return out;
  };
  const tglId = t => { const p = String(t || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : t; };

  // ---- Penyusun ESC/POS ----
  function Esc(w) { this.w = w; this.b = []; }
  Esc.prototype = {
    raw(a) { for (let i = 0; i < a.length; i++) this.b.push(a[i]); return this; },
    init() { return this.raw([0x1B, 0x40]); },
    align(n) { return this.raw([0x1B, 0x61, n]); },          // 0 kiri, 1 tengah
    bold(on) { return this.raw([0x1B, 0x45, on ? 1 : 0]); },
    size(n) { return this.raw([0x1D, 0x21, n]); },            // 0x00 normal, 0x11 2x, 0x33 4x
    text(s) { const t = ascii(s); for (let i = 0; i < t.length; i++) this.b.push(t.charCodeAt(i)); return this; },
    line(s) { return this.text(s).raw([0x0A]); },
    hr() { return this.line('-'.repeat(this.w)); },
    feed(n) { return this.raw([0x1B, 0x64, n]); },
    cut() { return this.raw([0x1D, 0x56, 0x42, 0x00]); },
    row(l, r) { const sp = Math.max(1, this.w - ascii(l).length - ascii(r).length); return this.line(l + ' '.repeat(sp) + r); },
    bytes() { return new Uint8Array(this.b); }
  };

  function bangunEscPos(d, ukuran) {
    const w = String(ukuran) === '80' ? 48 : 32;
    const e = new Esc(w).init().align(1);
    e.bold(true).size(0x01);
    wrap(d.nama_desa || '', Math.floor(w / 1)).forEach(l => e.line(l));
    e.size(0).bold(false);
    if (d.kecamatan) e.line(d.kecamatan);
    e.hr().line('NOMOR ANTRIAN').size(0x33).bold(true).line(d.nomor).size(0).line(d.jalur_label);
    e.bold(false);
    if (d.keterangan) e.line('(' + d.keterangan + ')');
    e.hr().align(0).row('Tanggal', tglId(d.tanggal));
    if (d.tampil_jam !== false && d.jam) e.row('Jam', d.jam);
    if (d.di_depan != null) e.row('Antrian di depan', String(d.di_depan));
    e.hr().align(1);
    wrap(d.pesan || '', w).forEach(l => e.line(l));
    return e.feed(4).cut().bytes();
  }

  const hx = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function kartuHtml(d, logo) {
    return (logo ? '<img src="' + hx(logo) + '" alt="">' : '') +
      '<h1>' + hx(d.nama_desa) + '</h1><div>' + hx(d.kecamatan) + '</div><hr><div>NOMOR ANTRIAN</div><div class="no">' + hx(d.nomor) + '</div>' +
      '<b>' + hx(d.jalur_label) + '</b>' + (d.keterangan ? '<div>(' + hx(d.keterangan) + ')</div>' : '') + '<hr>' +
      '<div class="r"><span>Tanggal</span><span>' + hx(tglId(d.tanggal)) + '</span></div>' +
      (d.tampil_jam !== false && d.jam ? '<div class="r"><span>Jam</span><span>' + hx(d.jam) + '</span></div>' : '') +
      (d.di_depan != null ? '<div class="r"><span>Antrian di depan</span><span>' + hx(d.di_depan) + '</span></div>' : '') +
      '<hr><div>' + hx(d.pesan) + '</div>';
  }
  function dokumenHtml(isi, ukuran) {
    const mm = String(ukuran) === '80' ? 72 : 48;
    return '<!doctype html><html><head><meta charset="utf-8"><style>@page{size:' + (mm + 6) + 'mm auto;margin:0}' +
      'body{margin:0;padding:3mm;width:' + mm + 'mm;font:12px/1.35 monospace;color:#000;text-align:center}' +
      'h1{font-size:14px;margin:4px 0 0}.no{font-size:44px;font-weight:700;margin:6px 0;line-height:1}hr{border:0;border-top:1px dashed #000}' +
      '.r{display:flex;justify-content:space-between;text-align:left}img{max-width:40mm;max-height:20mm}' +
      '.t{page-break-after:always;break-after:page;padding-bottom:2mm}.t:last-child{page-break-after:auto;break-after:auto}</style></head><body>' + isi + '</body></html>';
  }
  function bangunHtml(d, ukuran, logo) { return dokumenHtml('<div class="t">' + kartuHtml(d, logo) + '</div>', ukuran); }
  // Banyak struk: setiap nomor di halaman sendiri (satu struk per lembar/potongan)
  function bangunHtmlBanyak(daftar, ukuran, logo) { return dokumenHtml(daftar.map(d => '<div class="t">' + kartuHtml(d, logo) + '</div>').join(''), ukuran); }
  // Banyak struk ESC/POS: tiap struk berakhir dengan potong kertas
  function bangunEscPosBanyak(daftar, ukuran) {
    const bagian = daftar.map(d => bangunEscPos(d, ukuran));
    const total = bagian.reduce((n, b) => n + b.length, 0), out = new Uint8Array(total);
    let o = 0; bagian.forEach(b => { out.set(b, o); o += b.length; });
    return out;
  }

  const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };

  const Printer = {
    _bt: null, _chr: null,
    bangunEscPos: bangunEscPos, bangunHtml: bangunHtml, bangunHtmlBanyak: bangunHtmlBanyak, bangunEscPosBanyak: bangunEscPosBanyak, _wrap: wrap, RAWBT_BAGIAN: 40,

    lokal() { try { return JSON.parse(localStorage.getItem(LKEY) || '{}'); } catch (e) { return {}; } },
    simpanLokal(o) { try { localStorage.setItem(LKEY, JSON.stringify(Object.assign(this.lokal(), o))); } catch (e) {} },
    metode(cfg) { return this.lokal().metode || (cfg && cfg.PRINTER_METODE) || 'rawbt'; },

    // Status untuk pil di header
    status(cfg) {
      const m = this.metode(cfg), l = this.lokal();
      if (m === 'bluetooth') {
        const on = !!(this._bt && this._bt.gatt && this._bt.gatt.connected);
        return on ? { s: 'ok', t: 'Printer terhubung' } : { s: 'off', t: 'Printer offline' };
      }
      if (m === 'browser') return { s: 'warn', t: 'Cetak browser' };
      if (l.tesOk === false) return { s: 'off', t: 'RawBT gagal' };
      return l.tesOk ? { s: 'ok', t: 'RawBT siap' } : { s: 'warn', t: 'Belum dites' };
    },

    async cetak(d, cfg) {
      cfg = cfg || {};
      const m = this.metode(cfg), ukuran = cfg.PRINTER_UKURAN || '58';
      const salinan = Math.max(1, Math.min(3, Number(cfg.PRINTER_SALINAN) || 1));
      try {
        if (m === 'browser') { await this._cetakBrowser(d, ukuran, cfg); return { ok: true }; }
        const bytes = bangunEscPos(d, ukuran);
        const semua = new Uint8Array(bytes.length * salinan);
        for (let i = 0; i < salinan; i++) semua.set(bytes, i * bytes.length);
        if (m === 'bluetooth') { await this._kirimBt(semua); return { ok: true }; }
        // RawBT: kirim lewat intent. Harus dipicu dari sentuhan pengguna.
        window.location.href = 'intent:base64,' + b64(semua) + '#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;';
        return { ok: true, catatan: 'Dikirim ke RawBT.' };
      } catch (e) {
        return { ok: false, pesan: e && e.message ? e.message : 'Gagal mencetak.' };
      }
    },

    _cetakBrowser(d, ukuran, cfg) { return this._cetakHtml(bangunHtml(d, ukuran, cfg.STRUK_LOGO === '1' ? cfg.LOGO_URL : '')); },
    // Banyak struk sekaligus. Satu struk per nomor (salinan tidak dikalikan).
    // RawBT: dikirim per bagian (±40 struk) agar tiap bagian berasal dari satu ketukan pengguna; metode lain: sekali kirim.
    async cetakBanyak(daftar, cfg, bagian) {
      cfg = cfg || {};
      const m = this.metode(cfg), ukuran = cfg.PRINTER_UKURAN || '58';
      if (!daftar || !daftar.length) return { ok: false, pesan: 'Tidak ada struk untuk dicetak.' };
      try {
        if (m === 'browser') { await this._cetakHtml(bangunHtmlBanyak(daftar, ukuran, cfg.STRUK_LOGO === '1' ? cfg.LOGO_URL : '')); return { ok: true, total: 1, bagian: 0 }; }
        if (m === 'bluetooth') { await this._kirimBt(bangunEscPosBanyak(daftar, ukuran)); return { ok: true, total: 1, bagian: 0 }; }
        const bag = this.bagi(daftar, this.RAWBT_BAGIAN), i = Math.max(0, Math.min(Number(bagian) || 0, bag.length - 1));
        window.location.href = 'intent:base64,' + b64(bangunEscPosBanyak(bag[i], ukuran)) + '#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;';
        return { ok: true, total: bag.length, bagian: i };
      } catch (e) { return { ok: false, pesan: e && e.message ? e.message : 'Gagal mencetak.' }; }
    },
    bagi(daftar, n) { const out = []; for (let i = 0; i < daftar.length; i += n) out.push(daftar.slice(i, i + n)); return out; },
    // Jumlah bagian yang diperlukan untuk metode cetak saat ini (RawBT dibagi; lainnya satu)
    jumlahBagian(daftar, cfg) { return this.metode(cfg) === 'rawbt' ? Math.max(1, Math.ceil(daftar.length / this.RAWBT_BAGIAN)) : 1; },

    _cetakHtml(html) {
      return new Promise((res, rej) => {
        const f = document.createElement('iframe');
        f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
        document.body.appendChild(f);
        const doc = f.contentWindow.document;
        doc.open(); doc.write(html); doc.close();
        setTimeout(() => {
          try { f.contentWindow.focus(); f.contentWindow.print(); res(); } catch (e) { rej(e); }
          setTimeout(() => f.remove(), 3000);
        }, 350);
      });
    },

    async tes(cfg) {
      const d = {
        nama_desa: (cfg && cfg.NAMA_DESA) || 'Desa Contoh', kecamatan: (cfg && cfg.KECAMATAN) || '', nomor: 'U-000', jalur_label: 'TES CETAK',
        keterangan: '', tanggal: new Date().toISOString().slice(0, 10), jam: new Date().toTimeString().slice(0, 5), di_depan: 0,
        pesan: 'Jika struk ini terbaca jelas, printer siap dipakai.', tampil_jam: true
      };
      const r = await this.cetak(d, cfg);
      this.simpanLokal({ tesOk: r.ok });
      return r;
    },

    // ---- Web Bluetooth (eksperimental; butuh Chrome Android + HTTPS) ----
    async hubungkanBt() {
      if (!navigator.bluetooth) throw new Error('Browser ini tidak mendukung Web Bluetooth. Pakai Chrome di Android, atau metode RawBT.');
      const dev = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: BT_SERVICES });
      await this._sambungBt(dev);
      this.simpanLokal({ btNama: dev.name || 'Printer' });
      return dev.name || 'Printer';
    },
    async _sambungBt(dev) {
      const server = await dev.gatt.connect();
      let chr = null;
      const svcs = await server.getPrimaryServices();
      for (const s of svcs) {
        const cs = await s.getCharacteristics();
        chr = cs.filter(c => c.properties.write || c.properties.writeWithoutResponse)[0];
        if (chr) break;
      }
      if (!chr) throw new Error('Printer tidak menyediakan karakteristik tulis yang dikenali.');
      this._bt = dev; this._chr = chr;
      dev.addEventListener('gattserverdisconnected', () => window.dispatchEvent(new CustomEvent('ab:printer')));
      window.dispatchEvent(new CustomEvent('ab:printer'));
    },
    async _kirimBt(bytes) {
      if (!this._bt) throw new Error('Printer Bluetooth belum terhubung. Buka Akun → Printer → Hubungkan.');
      if (!this._bt.gatt.connected) await this._sambungBt(this._bt);
      const c = this._chr, n = 100;
      for (let i = 0; i < bytes.length; i += n) {
        const part = bytes.slice(i, i + n);
        if (c.properties.writeWithoutResponse) await c.writeValueWithoutResponse(part); else await c.writeValue(part);
        await new Promise(r => setTimeout(r, 25));
      }
    }
  };
  window.Printer = Printer;
})();
