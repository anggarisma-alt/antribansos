/* Tampilan (HTML) tiap halaman. Logika aksi ada di app.js.
   Semua string dari server di-escape lewat E() sebelum masuk innerHTML. */
(function () {
  const AB = window.AB = window.AB || {};
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const I = (n, c) => '<svg class="ic ' + (c || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (ICONS[n] || '') + '</svg>';
  const hhmm = iso => { if (!iso) return ''; const d = new Date(iso); return isNaN(d) ? '' : String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const bagNo = no => String(no).split('-')[1] || no;
  const jalurNama = j => j === 'P' ? 'Prioritas' : j === 'K' ? 'Khusus' : 'Umum';
  const chipJalur = j => '<span class="chip ' + j + '">' + jalurNama(j) + '</span>';
  const singkatLoket = n => String(n || '').replace(/^Loket\s*/i, 'L');
  const rankJalur = j => j === 'K' ? 0 : 1;      // Khusus selalu paling depan, sama seperti urutan panggilan di server
  const cmpAntri = (a, b) => (rankJalur(a.jalur) - rankJalur(b.jalur)) || (b.sisip - a.sisip) || (a.sisip && b.sisip ? (a.waktu_sisip < b.waktu_sisip ? -1 : 1) : 0) || (a.waktu_daftar < b.waktu_daftar ? -1 : a.waktu_daftar > b.waktu_daftar ? 1 : 0);

  Object.assign(AB, { E, I, hhmm, bagNo, jalurNama, chipJalur });
  AB.VERSI_FRONTEND = '2026-10-21.7'; AB.BACKEND_MIN = 5;
  // Membaca isi QR undangan (no, nik, nama, alamat). Format dari pemerintah belum pasti, jadi parser dibuat
  // toleran: JSON, URL berparameter, baris "kunci: nilai", atau berurutan dengan pemisah | ; tab / baris / koma.
  // Yang paling penting hanya NIK 16 digit; bila tidak ditemukan, nik dikembalikan kosong.
  AB.parseQr = function (teks) {
    const mentah = String(teks == null ? '' : teks).trim();
    const out = { no: '', nik: '', nama: '', alamat: '', mentah: mentah };
    if (!mentah) return out;
    const norm = s => String(s).toLowerCase().replace(/[^a-z]/g, '');
    const PETA = { no: 'no', nomor: 'no', nourut: 'no', noundangan: 'no', nomorundangan: 'no', kode: 'no', kodeundangan: 'no', id: 'no',
      nik: 'nik', noktp: 'nik', ktp: 'nik', nomornik: 'nik', nonik: 'nik', nama: 'nama', namalengkap: 'nama', name: 'nama',
      alamat: 'alamat', alamatlengkap: 'alamat', address: 'alamat', domisili: 'alamat' };
    const isi = (k, v) => { const f = PETA[norm(k)]; v = String(v == null ? '' : v).trim(); if (f && v && !out[f]) out[f] = v; return !!f; };
    let struktur = false;
    if (/^[\[{]/.test(mentah)) {                                                   // JSON
      try { const j = JSON.parse(mentah), o = Array.isArray(j) ? j[0] : j; if (o && typeof o === 'object') Object.keys(o).forEach(k => { if (isi(k, o[k])) struktur = true; }); } catch (e) {}
    }
    if (!struktur && /^https?:\/\//i.test(mentah)) {                              // URL dengan parameter
      const qi = mentah.indexOf('?');
      if (qi >= 0) mentah.slice(qi + 1).split('&').forEach(par => {
        const e = par.indexOf('='); if (e <= 0) return;
        let v = par.slice(e + 1); try { v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (x) { /* biarkan apa adanya */ }
        if (isi(par.slice(0, e), v)) struktur = true;
      });
    }
    if (!struktur) {                                                               // kunci: nilai / kunci=nilai
      mentah.split(/\r?\n|;|\||&/).forEach(tok => { const m = tok.match(/^\s*([A-Za-z_ .]{2,20}?)\s*[:=]\s*(.+?)\s*$/); if (m && isi(m[1], m[2])) struktur = true; });
    }
    const bersih = s => String(s).replace(/[\s.\-]/g, '');
    if (!/^\d{16}$/.test(bersih(out.nik))) {                                       // berurutan: no | nik | nama | alamat
      out.nik = '';
      const sep = /\|/.test(mentah) ? '|' : /;/.test(mentah) ? ';' : /\t/.test(mentah) ? '\t' : /\n/.test(mentah) ? '\n' : ',';
      const tok = mentah.split(sep).map(s => s.trim());
      const i = tok.findIndex(s => /^\d{16}$/.test(bersih(s)));
      if (i >= 0) {
        out.nik = bersih(tok[i]);
        if (!out.no && i >= 1 && tok[i - 1].length <= 12) out.no = tok[i - 1];
        if (!out.nama && tok[i + 1]) out.nama = tok[i + 1];
        if (!out.alamat && tok.length > i + 2) out.alamat = tok.slice(i + 2).join(sep === '|' || sep === ';' || sep === '\t' ? ' ' : ', ').trim();
      }
    } else out.nik = bersih(out.nik);
    if (!out.nik) { const m = mentah.match(/(?<!\d)\d{16}(?!\d)/); if (m) out.nik = m[0]; }             // cadangan: 16 digit di mana saja
    return out;
  };

  // Kategori Khusus tersedia? (akun login: dari konfigurasi; halaman publik: dari data layar display)
  AB.khususAktif = () => AB.user ? (AB.config || {}).KHUSUS_AKTIF === '1' : !!(AB.home && AB.home.ambil && AB.home.ambil.khusus === '1');
  // Pintas keyboard di halaman ambil nomor: p = Prioritas, u = Umum, k = Khusus. Mengembalikan 'P' | 'U' | 'K' | null.
  AB.pintas = function (e, st) {
    if (!e || e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.isComposing) return null;
    if (!st || st.inputAktif || st.sheetTerbuka || st.sibuk || !st.halamanAmbil) return null;
    const k = String(e.key || '').toLowerCase();
    return k === 'p' ? 'P' : k === 'u' ? 'U' : k === 'k' ? 'K' : null;
  };

  const Q = AB.q = {
    all: () => (AB.state && AB.state.antrian) || [],
    by: st => Q.all().filter(r => st.indexOf(r.status) >= 0),
    menunggu: () => Q.by(['menunggu']).sort(cmpAntri),
    terlewati: () => Q.by(['terlewati']).sort((a, b) => a.waktu_dilewati < b.waktu_dilewati ? -1 : 1),
    selesai: () => Q.by(['selesai', 'dibatalkan', 'tidak_terdaftar']).sort((a, b) => (a.waktu_selesai || '') < (b.waktu_selesai || '') ? 1 : -1),
    loket: id => ((AB.state && AB.state.loket) || []).filter(l => l.id === id)[0],
    cfg: k => (AB.config || {})[k]
  };

  // ---------- komponen ----------
  function printerPill() {
    const s = Printer.status(AB.printCfg ? AB.printCfg() : AB.config);
    const buka = AB.user && AB.user.role === 'pendaftaran' ? 'data-act="printer-sheet"' : 'data-go="akun"';
    return '<button class="pill ' + s.s + '" ' + buka + ' aria-label="Status printer: ' + E(s.t) + '. Buka pengaturan printer">' + I(s.s === 'off' ? 'printerOff' : 'printer') + E(s.t) + '</button>';
  }
  function muteBtn(ctx) {
    const m = Suara.muted(ctx, null);
    return '<button class="icon-btn" data-act="toggle-mute" data-ctx="' + ctx + '" aria-label="' + (m ? 'Aktifkan suara' : 'Matikan suara') + '" aria-pressed="' + m + '">' + I(m ? 'mute' : 'volume') + '</button>';
  }
  function avatarBtn() {
    const u = AB.user; if (!u || u.role === 'pendaftaran') return '';
    const n = String(u.nama || '?').trim();
    return '<button class="avatar" data-go="akun" aria-label="Akun: ' + E(n) + '">' + E(n.charAt(0).toUpperCase()) + '</button>';
  }
  const skel = n => '<div class="skel" aria-hidden="true"></div>'.repeat(n || 3) + '<span class="sr">Memuat…</span>';
  AB.skel = skel;
  function hero(o) {
    const kp = (o.kpis || []).map(k => {
      const inner = I(k.icon) + '<b>' + E(k.v) + '</b><span>' + E(k.l) + '</span>';
      return k.go ? '<button class="kpi" data-go="' + k.go + '">' + inner + '</button>' : '<div class="kpi">' + inner + '</div>';
    }).join('');
    return '<header class="hero' + (o.compact ? ' compact' : '') + '"><div class="hero-top"><div><h1' + (o.secret ? ' data-secret="kiosk"' : '') + '>' + E(o.title) + '</h1><div class="hero-sub"><span id="clock">' + AB.clock() + '</span>' + (o.sub ? '<span>' + E(o.sub) + '</span>' : '') + '</div></div>' +
      '<div class="hero-actions">' + (o.masuk ? '<a class="pill" href="#/login">' + I('user') + 'Masuk</a>' : '') + (o.printer ? printerPill() : '') + (o.mute ? muteBtn(o.mute) : '') + (o.logout ? '<button class="icon-btn" data-act="logout" aria-label="Keluar">' + I('logout') + '</button>' : '') + (o.noAvatar ? '' : avatarBtn()) + '</div></div>' + (kp ? '<div class="kpis' + ((o.kpis || []).length === 2 ? ' two' : '') + '">' + kp + '</div>' : '') + '</header>';
  }
  function subHero(title, back) {
    return '<header class="hero compact"><div class="hero-top"><div class="row">' + (back ? '<button class="icon-btn" data-go="' + back + '" aria-label="Kembali">' + I('chevron', 'flip') + '</button>' : '') + '<h1>' + E(title) + '</h1></div><div class="hero-actions"><span id="clock" class="sr">' + AB.clock() + '</span></div></div></header>';
  }
  function qcard(r, actions, meta) {
    return '<article class="qcard"><div class="qno ' + r.jalur + '">' + E(bagNo(r.no)) + '</div><div class="qmain"><b>' + E(r.no) + '</b><div class="qmeta">' + chipJalur(r.jalur) +
      (r.nama ? '<span class="nm">' + E(r.nama) + '</span>' : '') + '<span class="row" style="gap:4px">' + I('clock') + (meta || hhmm(r.waktu_daftar)) + '</span></div></div>' +
      (actions ? '<div class="qact">' + actions + '</div>' : '') + '</article>';
  }
  function empty(ic, txt) { return '<div class="empty">' + I(ic) + E(txt) + '</div>'; }
  function recentBar() {
    const r = Q.all().filter(x => x.waktu_panggil).sort((a, b) => a.waktu_panggil < b.waktu_panggil ? 1 : -1).slice(0, 6);
    const nm = {}; ((AB.state && AB.state.loket) || []).forEach(l => nm[l.id] = singkatLoket(l.nama));
    return '<aside class="recent-bar" aria-label="Terakhir dipanggil"><h3>Terakhir Dipanggil</h3><div class="recent-chips">' +
      (r.length ? r.map(x => '<span class="chip">' + E(x.no) + (nm[x.loket_id] ? ' • ' + E(nm[x.loket_id]) : '') + '</span>').join('') : '<span class="muted small">Belum ada panggilan</span>') + '</div></aside>';
  }
  function ambilCard() {
    return '<section class="pick" aria-label="Ambil nomor antrian"><h2 class="pick-title">Pilih jenis antrian</h2><div class="pick-grid">' +
      '<button class="pick-card prio" data-act="ambil" data-jalur="P"><span class="pick-ic">' + I('heart') + '</span><kbd class="kbd-hint" aria-hidden="true">P</kbd><span class="pick-t">PRIORITAS</span><span class="pick-s">Lansia &amp; ibu hamil</span><span class="pick-go">Ambil nomor ' + I('arrow') + '</span></button>' +
      '<button class="pick-card umum" data-act="ambil" data-jalur="U"><span class="pick-ic">' + I('users') + '</span><kbd class="kbd-hint" aria-hidden="true">U</kbd><span class="pick-t">UMUM</span><span class="pick-s">Warga lainnya</span><span class="pick-go">Ambil nomor ' + I('arrow') + '</span></button></div></section>';
  }
  function liveStrip(d) {
    const aktif = (d.loket || []).filter(l => l.nomor);
    return '<section class="card" aria-live="polite" aria-label="Sedang dipanggil"><div class="live-head"><span class="dot-live" aria-hidden="true"></span><h2>Sedang dipanggil</h2></div>' +
      (aktif.length ? '<div class="live-list">' + aktif.map(l => '<div class="live-item ' + E(l.nomor.charAt(0)) + '"><span>' + E(l.nama) + '</span><b>' + E(l.nomor) + '</b></div>').join('') + '</div>'
        : '<p class="muted">Belum ada panggilan. Silakan ambil nomor antrian Anda.</p>') + '</section>';
  }
  const kpi3 = () => { const h = AB.state.hitung; return [
    { icon: 'users', v: h.menunggu_P + h.menunggu_U + (h.menunggu_K || 0), l: 'Antrian' }, { icon: 'checkCircle', v: h.selesai, l: 'Terlayani' }, { icon: 'calendar', v: h.total, l: 'Total Hari Ini' }]; };

  const field = (label, name, val, o) => { o = o || {};
    return '<div class="field"><label for="f_' + name + '">' + E(label) + '</label>' + (o.type === 'select'
      ? '<select class="input" id="f_' + name + '" name="' + name + '">' + o.opts.map(p => '<option value="' + E(p[0]) + '"' + (String(p[0]) === String(val) ? ' selected' : '') + '>' + E(p[1]) + '</option>').join('') + '</select>'
      : o.type === 'textarea' ? '<textarea class="input" id="f_' + name + '" name="' + name + '" rows="3">' + E(val) + '</textarea>'
      : '<input class="input" id="f_' + name + '" name="' + name + '" type="' + (o.type || 'text') + '" value="' + E(val) + '"' + (o.req ? ' required' : '') + (o.max ? ' maxlength="' + o.max + '"' : '') + (o.min !== undefined ? ' min="' + o.min + '"' : '') + (o.maxn !== undefined ? ' max="' + o.maxn + '"' : '') + (o.inputmode ? ' inputmode="' + o.inputmode + '"' : '') + (o.auto ? ' autocomplete="' + o.auto + '"' : '') + '>') +
      (o.hint ? '<div class="hint">' + E(o.hint) + '</div>' : '') + '</div>'; };
  const sw = (label, name, on, hint) => '<label class="switch"><span>' + E(label) + (hint ? '<span class="hint" style="display:block">' + E(hint) + '</span>' : '') + '</span><input type="checkbox" name="' + name + '"' + (on ? ' checked' : '') + '></label>';
  Object.assign(AB, { field, sw, qcard, empty, hero, subHero });

  // ---------- LOGIN ----------
  AB.pages = {};
  AB.pages.login = {
    render() {
      const nm = AB.pubName || 'AntriBansos Desa';
      return '<main class="login"><header class="hero"><div class="logo"><img class="logo-img" src="logo-putih.png" alt="" width="112" height="112"></div><h1>' + E(nm) + '</h1><div class="hero-sub" style="justify-content:center">Sistem antrian bantuan sosial</div></header>' +
        '<form class="card stack" data-form="login" autocomplete="on"><h2>Masuk</h2>' +
        field('Username', 'username', '', { req: true, auto: 'username' }) + field('Password', 'password', '', { type: 'password', req: true, auto: 'current-password' }) +
        '<button class="btn block" type="submit">Masuk</button><div id="login-err" class="chip danger" style="display:none" role="alert"></div></form>' +
        '<div class="body"><a class="btn ghost block" href="#/display" style="text-decoration:none">' + I('monitor') + 'Buka Layar Display</a><a class="btn ghost block" href="#/" style="text-decoration:none">' + I('ticket') + 'Kembali ke Ambil Nomor</a><p class="muted small" style="text-align:center">Versi aplikasi ' + AB.VERSI_FRONTEND + '</p></div></main>';
    }
  };

  // ---------- HALAMAN AWAL: AMBIL NOMOR (publik, tanpa login) ----------
  function recentBarDari(list) {
    return '<aside class="recent-bar" aria-label="Terakhir dipanggil"><h3>Terakhir Dipanggil</h3><div class="recent-chips">' +
      (list && list.length ? list.map(x => '<span class="chip">' + E(x.no) + (x.loket ? ' • ' + E(singkatLoket(x.loket)) : '') + '</span>').join('') : '<span class="muted small">Belum ada panggilan</span>') + '</div></aside>';
  }
  AB.pages.ambil = {
    recent: true,
    render() {
      const d = AB.home, u = AB.user;
      if (d && (!d.ambil || !d.hitung)) {            // backend lama: data display belum memuat bagian halaman awal
        return hero({ title: d.desa || 'AntriBansos Desa', sub: 'Ambil nomor antrian', secret: true, masuk: !u, logout: !!u }) +
          '<div class="body"><section class="card stack">' + I('alert') + '<h2>Backend belum diperbarui</h2><p>Halaman ini butuh versi backend terbaru. Di Apps Script: tempel ulang <b>Kode.gs</b> dan <b>Modul.gs</b>, lalu <b>Deploy → Manage deployments → ikon pensil → Version: New version → Deploy</b>. Setelah itu muat ulang halaman ini.</p></section></div>';
      }
      let kpis = [];
      if (d) { const h = d.hitung; kpis = [{ icon: 'users', v: h.menunggu_P + h.menunggu_U + (h.menunggu_K || 0), l: 'Antrian' }, { icon: 'checkCircle', v: h.selesai, l: 'Terlayani' }, { icon: 'calendar', v: h.total, l: 'Total Hari Ini' }]; }
      let isi;
      if (!d) isi = AB.homeErr ? '<section class="card stack"><p>' + E(AB.homeErr) + '</p><p class="muted small">Mencoba lagi…</p></section>' : '<div class="empty">Memuat…</div>';
      else if (u || d.ambil.aktif === '1') isi = ambilCard() + liveStrip(d);
      else isi = '<section class="card stack" style="text-align:center">' + I('alert') + '<h2>Pengambilan nomor mandiri belum dibuka</h2><p class="muted">Silakan hubungi petugas, atau masuk sebagai petugas pendaftaran.</p><a class="btn block" href="#/login" style="text-decoration:none">' + I('user') + 'Masuk Petugas</a></section>' + liveStrip(d);
      return hero({ title: d ? d.desa : (AB.pubName || 'AntriBansos Desa'), sub: 'Ambil nomor antrian', kpis: kpis, secret: true, masuk: !u, logout: !!u }) +
        '<div class="body">' + isi + '</div>' + (d ? recentBarDari(d.terakhir) : '');
    }
  };

  // ---------- LOKET (petugas) ----------
  // Petugas loket hanya punya dua tombol saat melayani: Lewati dan Selesai.
  // Selesai/Lewati otomatis memanggil nomor berikutnya; tombol Panggil hanya muncul saat loket sedang kosong.
  function servingCard(me, a) {
    return '<section class="card serving">' + chipJalur(a.jalur) + '<div class="big ' + a.jalur + '">' + E(a.no) + '</div><div class="muted">Sedang dilayani di ' + E(me.nama) + '</div>' +
      '<div class="btn-row two"><button class="btn warn xl2" data-act="lewati" data-id="' + a.id + '">' + I('skip') + 'Lewati</button>' +
      '<button class="btn ok xl2" data-act="selesai" data-id="' + a.id + '">' + I('check') + 'Selesai</button></div></section>';
  }
  function relevan(me) { const h = AB.state.hitung; return (h.menunggu_K || 0) + (me.mode === 'Prioritas' ? h.menunggu_P : me.mode === 'Umum' ? h.menunggu_U : h.menunggu_P + h.menunggu_U); }
  AB.pages.loket = {
    dynamic: true, recent: true,
    render() {
      const me = Q.loket(AB.user.loket_id);
      if (!me) return subHero('Panel Loket') + '<div class="body">' + empty('alert', 'Akun Anda belum ditautkan ke loket. Hubungi Admin.') + '</div>';
      const a = me.sedang ? Q.all().filter(r => r.id === me.sedang.id)[0] : null;
      const h = AB.state.hitung;
      const selesai = Q.all().filter(r => r.status === 'selesai' && r.loket_id === me.id).length;
      let isi;
      if (!me.aktif) isi = '<section class="card">' + empty('alert', me.nama + ' sedang dinonaktifkan oleh Admin.') + '</section>';
      else if (a) isi = servingCard(me, a);
      else {
        const rel = relevan(me);
        isi = '<section class="card"><button class="btn warn block xl" data-act="panggil-next">' + I('megaphone') + 'Panggil Berikutnya<small>Prioritas ' + h.menunggu_P + ' · Umum ' + h.menunggu_U + (h.menunggu_K ? ' · Khusus ' + h.menunggu_K : '') + ' menunggu</small></button>' +
          (rel === 0 && me.mode !== 'Campuran' && Q.cfg('PERILAKU_JALUR_KOSONG') === 'tunggu' ? '<p class="muted small" style="margin-top:10px;text-align:center">Loket ini hanya melayani jalur ' + E(me.mode) + ' dan sedang kosong.</p>' : '') + '</section>';
      }
      const next = Q.menunggu().filter(r => r.jalur === 'K' || me.mode === 'Campuran' || (me.mode === 'Prioritas' ? r.jalur === 'P' : r.jalur === 'U')).slice(0, 5);
      return hero({ title: me.nama, sub: 'Mode ' + me.mode.toUpperCase(), mute: 'panel', kpis: [
        { icon: 'users', v: relevan(me), l: 'Menunggu' }, { icon: 'checkCircle', v: selesai, l: 'Selesai' }, { icon: 'skip', v: h.terlewati, l: 'Terlewati', go: 'terlewati' }] }) +
        '<div class="body">' + isi + (next.length ? '<h2 class="sec">Berikutnya</h2>' + next.map(r => qcard(r)).join('') : '') + '</div>' + recentBar();
    }
  };

  // ---------- ADMIN: kendali antrian ----------
  AB.pages.antrian = {
    dynamic: true, recent: true,
    render() {
      const h = AB.state.hitung;
      const kartu = AB.state.loket.map(l => {
        const a = l.sedang ? Q.all().filter(r => r.id === l.sedang.id)[0] : null;
        const st = l.status_layanan === 'Melayani' ? 'warn' : l.status_layanan === 'Kosong' ? 'ok' : 'gray';
        let aksi = '';
        if (l.aktif && !a) aksi = '<button class="btn warn block" data-act="panggil-next" data-loket="' + l.id + '">' + I('megaphone') + 'Panggil Berikutnya</button>';
        if (a) aksi = '<div class="qcard" style="box-shadow:none;padding:0"><div class="qno ' + a.jalur + '">' + E(bagNo(a.no)) + '</div><div class="qmain"><b>' + E(a.no) + '</b><div class="qmeta">Sedang dilayani</div></div></div>' +
          '<div class="btn-row two"><button class="btn warn" data-act="lewati" data-id="' + a.id + '">' + I('skip') + 'Lewati</button><button class="btn ok" data-act="selesai" data-id="' + a.id + '">' + I('check') + 'Selesai</button></div>';
        return '<section class="card stack"><div class="row between"><div><b>' + E(l.nama) + '</b><div class="muted small">' + (l.petugas.length ? E(l.petugas.join(', ')) : 'Belum ada petugas') + '</div></div><span class="chip ' + st + '">' + l.status_layanan + '</span></div>' +
          '<div class="field"><label for="m_' + l.id + '">Mode layanan</label><select class="input" id="m_' + l.id + '" data-change="set-mode" data-id="' + l.id + '"><option' + (l.mode === 'Prioritas' ? ' selected' : '') + '>Prioritas</option><option' + (l.mode === 'Umum' ? ' selected' : '') + '>Umum</option><option' + (l.mode === 'Campuran' ? ' selected' : '') + '>Campuran</option></select></div>' + aksi + '</section>';
      }).join('');
      return hero({ title: Q.cfg('NAMA_DESA') || 'Antrian', sub: 'Kendali antrian', kpis: kpi3(), printer: true, mute: 'panel' }) +
        '<div class="body">' + ambilCard() + '<a class="btn ghost block" href="#/masal">' + I('printer') + 'Cetak antrian massal</a><div class="card"><div class="row between wrap"><span>' + chipJalur('P') + ' menunggu <b>' + h.menunggu_P + '</b></span><span>' + chipJalur('U') + ' menunggu <b>' + h.menunggu_U + '</b></span>' + (h.menunggu_K ? '<span>' + chipJalur('K') + ' menunggu <b>' + h.menunggu_K + '</b></span>' : '') + '<span class="chip warn">Terlewati <b>&nbsp;' + h.terlewati + '</b></span></div></div>' + '<div class="auto-grid">' + kartu + '</div></div>' + recentBar();
    }
  };

  // ---------- TERLEWATI ----------
  function terlewatiList() {
    const q = String(AB.ui.q || '').toLowerCase();
    const rows = Q.terlewati().filter(r => !q || r.no.toLowerCase().indexOf(q) >= 0 || (r.nama || '').toLowerCase().indexOf(q) >= 0);
    const role = AB.user.role;
    const me = role === 'loket' ? Q.loket(AB.user.loket_id) : null;
    const sibuk = me && me.sedang;
    if (!rows.length) return empty('skip', q ? 'Tidak ada yang cocok.' : 'Tidak ada nomor terlewati.');
    return rows.map(r => {
      let a = '';
      if (role === 'loket') a += '<button class="btn warn sm" data-act="panggil-kembali" data-id="' + r.id + '"' + (sibuk ? ' disabled title="Loket sedang melayani"' : '') + '>' + I('megaphone') + 'Panggil</button>';
      if (role === 'admin') a += '<button class="btn warn sm" data-act="panggil-ke-loket" data-id="' + r.id + '">' + I('megaphone') + 'Ke Loket</button>';
      a += '<button class="btn ghost sm" data-act="sisipkan" data-id="' + r.id + '">Sisipkan</button>';
      if (role === 'admin') a += '<button class="btn ghost sm" data-act="batalkan" data-id="' + r.id + '" aria-label="Batalkan ' + E(r.no) + '">' + I('x') + '</button>';
      return qcard(r, a, 'lewat ' + hhmm(r.waktu_dilewati) + ' · ' + r.jumlah_panggil + 'x panggil');
    }).join('');
  }
  AB.pages.terlewati = {
    dynamic: true, list: terlewatiList,
    render() {
      const n = Q.terlewati().length;
      return hero({ title: 'Antrian Terlewati', sub: n + ' nomor', compact: true }) +
        '<div class="body"><div class="field"><label class="sr" for="q">Cari</label><input class="input" id="q" data-input="q-terlewati" placeholder="Cari nomor atau nama…" value="' + E(AB.ui.q || '') + '" inputmode="search"></div>' +
        '<p class="muted small" style="padding:0 6px">Nomor terlewati tidak hangus — warga tidak perlu mengambil nomor baru. Berlaku sampai sesi hari ini berakhir.</p><div id="list" class="auto-grid">' + terlewatiList() + '</div></div>';
    }
  };

  // ---------- RIWAYAT ----------
  AB.pages.riwayat = {
    dynamic: true,
    render() {
      let rows = Q.selesai();
      if (AB.user.role === 'loket') rows = rows.filter(r => r.loket_id === AB.user.loket_id);
      const cls = { selesai: 'ok', dibatalkan: 'gray', tidak_terdaftar: 'danger' }, lbl = { selesai: 'Selesai', dibatalkan: 'Dibatalkan', tidak_terdaftar: 'Tidak terdaftar' };
      const list = rows.slice(0, 60).map(r => qcard(r, '<span class="chip ' + cls[r.status] + '">' + lbl[r.status] + '</span>', hhmm(r.waktu_selesai))).join('');
      return hero({ title: 'Riwayat Hari Ini', sub: rows.length + ' nomor', compact: true }) + '<div class="body">' + (list ? '<div class="auto-grid">' + list + '</div>' : empty('list', 'Belum ada riwayat.')) + '</div>';
    }
  };

  // ---------- DASHBOARD ----------
  function serahHtml(s) {
    if (!s) return '';
    const mx = Math.max(1, ...s.per_petugas.map(x => x.jumlah));
    return '<section class="card stack"><h2>Serah terima bansos</h2><div class="stat-grid">' +
      [['Diserahkan (periode)', s.total], ['Belum menerima', s.menunggu_serah], ['Sudah / seluruh penerima', s.total_sudah + ' / ' + s.total_penerima], ['Dengan foto bukti', s.dengan_foto]].map(x => '<div class="stat"><b>' + x[1] + '</b><span>' + x[0] + '</span></div>').join('') + '</div>' +
      (s.per_petugas.length ? '<h3 style="font-size:.9rem;margin:6px 0 0">Per petugas</h3>' + s.per_petugas.map(x => '<div class="hbar"><span>' + E(x.nama) + '</span><div class="track"><div class="fill" style="width:' + Math.round(x.jumlah / mx * 100) + '%"></div></div><b>' + x.jumlah + '</b></div>').join('') : '') + '</section>';
  }
  function dashHtml(d) {
    const h = d.ringkas, mx = Math.max(1, ...d.per_jam), mxl = Math.max(1, ...d.per_loket.map(x => x.selesai));
    const bars = d.per_jam.map((n, i) => '<i class="' + (n ? '' : 'zero') + '" style="height:' + Math.max(2, Math.round(n / mx * 100)) + '%" title="' + String(i).padStart(2, '0') + ':00 — ' + n + ' nomor"></i>').join('');
    return '<section class="card"><h2>Ringkasan</h2><div class="stat-grid">' +
      [['Total nomor', h.total], ['Selesai', h.selesai], ['Menunggu', h.menunggu], ['Sedang dilayani', h.dilayani], ['Terlewati', h.terlewati], ['Dibatalkan', h.dibatalkan], ['Tidak terdaftar', h.tidak_terdaftar], ['Terlewati lalu dilayani', d.terlewati_dilayani]].map(x => '<div class="stat"><b>' + x[1] + '</b><span>' + x[0] + '</span></div>').join('') + '</div></section>' +
      '<section class="card"><h2>Per kategori antrian</h2><div class="stat-grid"><div class="stat"><b>' + d.jalur.P.total + '</b><span>Prioritas (selesai ' + d.jalur.P.selesai + ')</span></div><div class="stat"><b>' + d.jalur.U.total + '</b><span>Umum (selesai ' + d.jalur.U.selesai + ')</span></div>' + (d.jalur.K && d.jalur.K.total ? '<div class="stat"><b>' + d.jalur.K.total + '</b><span>Khusus (selesai ' + d.jalur.K.selesai + ')</span></div>' : '') + '</div>' +
      '<p class="muted small" style="margin-top:10px">Rata-rata tunggu: ' + (d.rata_tunggu == null ? '–' : d.rata_tunggu + ' menit') + ' · rata-rata layanan: ' + (d.rata_layanan == null ? '–' : d.rata_layanan + ' menit') + '</p></section>' +
      '<section class="card"><h2>Nomor baru per jam</h2><div class="bars" role="img" aria-label="Grafik jumlah nomor per jam">' + bars + '</div><div class="bar-axis"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div></section>' +
      '<section class="card stack"><h2>Per loket (selesai)</h2>' + (d.per_loket.length ? d.per_loket.map(l => '<div class="hbar"><span>' + E(l.nama) + '</span><div class="track"><div class="fill" style="width:' + Math.round(l.selesai / mxl * 100) + '%"></div></div><b>' + l.selesai + '</b></div>').join('') : '<span class="muted">Belum ada data.</span>') + '</section>' +
      '<section class="card"><h2>Ringkasan otomatis</h2><ul class="insight">' + d.insight.map(s => '<li>' + E(s) + '</li>').join('') + '</ul><p class="hint" style="margin-top:8px">Dibuat dari aturan sederhana atas data antrian, bukan model AI.</p></section>' + serahHtml(d.serah);
  }
  function rangeForm(form, dari, sampai) {
    return '<form class="card" data-form="' + form + '"><div class="row wrap"><div class="field grow"><label for="dr">Dari</label><input class="input" id="dr" type="date" name="dari" value="' + E(dari) + '" required></div><div class="field grow"><label for="sp">Sampai</label><input class="input" id="sp" type="date" name="sampai" value="' + E(sampai) + '" required></div></div><button class="btn block" style="margin-top:12px">Muat</button></form>';
  }
  const QA = [['#/antrian', 'ticket', 'Kendali Antrian', 'blue'], ['#/masal', 'printer', 'Cetak Massal', 'violet'], ['#/serah', 'gift', 'Serah Terima', 'green'],
    ['#/pengaturan/penerima', 'file', 'Data Penerima', 'amber'], ['#/laporan', 'chart', 'Laporan', 'teal'], ['#/terlewati', 'skip', 'Terlewati', 'red']];
  AB.pages.beranda = {
    render() {
      const t = AB.today(), u = AB.user, depan = String(u.nama || '').trim().split(/\s+/)[0] || 'Admin';
      const admin = u.role === 'admin';
      return hero({ title: 'Halo, ' + depan, sub: (admin ? 'Admin' : 'Pimpinan') + ' · ' + (Q.cfg('NAMA_DESA') || ''), kpis: kpi3() }) +
        '<div class="body">' +
        (admin ? '<section aria-label="Aksi cepat"><h2 class="group-title">Aksi cepat</h2><div class="quick">' + QA.map(q => '<a class="qa" href="' + q[0] + '"><span class="tile t-' + q[3] + '">' + I(q[1]) + '</span>' + q[2] + '</a>').join('') + '</div></section>' : '') +
        '<details class="periode"><summary>' + I('calendar') + 'Periode laporan <span class="muted small" style="margin-left:auto">Ubah</span></summary>' + rangeForm('dashboard', t, t) + '</details>' +
        '<div id="async" class="auto-grid">' + skel(3) + '</div></div>';
    },
    onState() {                                              // angka KPI di header ikut bergerak tanpa memuat ulang halaman
      const h = AB.state.hitung, b = document.querySelectorAll('.hero .kpi b');
      if (b.length >= 3) { b[0].textContent = h.menunggu_P + h.menunggu_U + (h.menunggu_K || 0); b[1].textContent = h.selesai; b[2].textContent = h.total; }
    },
    async load(range) {
      const r = await Api.call('dashboard', range || { dari: AB.today(), sampai: AB.today() });
      const el = document.getElementById('async'); if (!el) return;
      el.innerHTML = r.success ? dashHtml(r.data) : empty('alert', r.message);
    }
  };

  // ---------- LAPORAN ----------
  AB.pages.laporan = {
    render() {
      const t = AB.today();
      return hero({ title: 'Laporan', sub: Q.cfg('NAMA_DESA'), compact: true }) +
        '<div class="body">' + rangeForm('laporan', t, t) + '<div id="async" class="stack"></div>' +
        '<section class="card stack"><h2>Status pengambilan bansos</h2><div class="btn-row"><button class="btn ok" data-act="lap-penerima" data-status="Sudah">' + I('download') + 'Sudah mengambil</button><button class="btn warn" data-act="lap-penerima" data-status="Belum">' + I('download') + 'Belum mengambil</button></div></section>' +
        '<section class="card stack"><h2>Riwayat serah terima</h2><p class="muted small">Memakai rentang tanggal di atas. Foto bukti hanya bisa dilihat Admin dan Pimpinan.</p><button class="btn" data-act="lap-serah">' + I('gift') + 'Tampilkan serah terima</button><div id="serah-lap" class="stack"></div></section></div>';
    },
    showSerah(d) {
      const el = document.getElementById('serah-lap'); if (!el) return;
      AB.lastSerah = d;
      const jam = iso => hhmm(iso);
      el.innerHTML = '<p><b>' + d.total + '</b> diserahkan · ' + d.stat.dengan_foto + ' dengan foto</p>' +
        (d.rows.length ? d.rows.slice(0, 100).map(r => '<div class="qcard" style="box-shadow:none;border:1px solid var(--line)"><div class="qmain"><b>' + E(r.nama) + '</b><div class="qmeta"><span>' + E(r.tgl_ambil.slice(5)) + ' ' + jam(r.waktu_serah) + '</span><span>' + E(r.petugas || '-') + '</span><span>' + E(r.bantuan) + '</span></div></div>' +
          (r.ada_foto ? '<button class="btn ghost sm" data-act="lihat-foto" data-id="' + r.id + '" aria-label="Lihat foto ' + E(r.nama) + '">' + I('camera') + 'Foto</button>' : '<span class="chip gray">Tanpa foto</span>') + '</div>').join('') : empty('gift', 'Belum ada serah terima pada periode ini.')) +
        (d.rows.length > 100 ? '<p class="hint">Menampilkan 100 baris; unduh CSV untuk semuanya.</p>' : '') + '<button class="btn ghost sm" data-act="lap-serah-csv">' + I('download') + 'Unduh CSV</button>';
    },
    show(d) {
      const el = document.getElementById('async'); if (!el) return;
      AB.lastLaporan = d;
      const rows = d.rows.slice(0, 200).map(r => '<tr><td>' + E(r.tanggal.slice(5)) + '</td><td>' + E(r.no) + '</td><td>' + E(r.status) + '</td><td>' + E(r.nama || '-') + '</td><td>' + E(r.loket || '-') + '</td></tr>').join('');
      el.innerHTML = dashHtml(d.rekap) + '<section class="card"><div class="row between"><h2>Rincian (' + d.rows.length + ')</h2><button class="btn ghost sm" data-act="lap-csv">' + I('download') + 'CSV</button></div>' +
        (d.terpotong ? '<p class="hint">Tampilan dibatasi 5.000 baris pertama.</p>' : '') + '<div class="scroll-x"><table class="tbl"><thead><tr><th>Tgl</th><th>No</th><th>Status</th><th>Nama</th><th>Loket</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        (d.rows.length > 200 ? '<p class="hint">Menampilkan 200 baris; unduh CSV untuk semuanya.</p>' : '') + '</section>';
    }
  };

  // ---------- PENGATURAN ----------
  // [rute/sub, ikon, judul, keterangan, warna ubin]
  const GROUPS = [
    ['Operasional', [
      ['#/masal', 'printer', 'Cetak Antrian Massal', 'Terbitkan & cetak banyak nomor sekaligus', 'violet'],
      ['#/serah', 'gift', 'Serah Terima Bansos', 'Scan QR undangan & foto bukti', 'green'],
      ['#/riwayatserah', 'list', 'Riwayat Serah Terima', 'Daftar penyerahan hari ini', 'teal']]],
    ['Data', [
      ['penerima', 'file', 'Data Penerima', 'Impor, scan QR, ubah data', 'amber'],
      ['jenis', 'gift', 'Jenis Bantuan', 'Master data bantuan', 'amber'],
      ['user', 'users', 'Pengguna', 'Petugas & peran', 'blue'],
      ['loket', 'door', 'Loket', 'Tambah loket & mode layanan', 'blue']]],
    ['Aturan layanan', [
      ['aturan', 'sliders', 'Aturan Antrian', 'Rasio, kategori Khusus, batas cetak massal', 'violet'],
      ['awal', 'ticket', 'Halaman Awal', 'Ambil nomor tanpa login', 'blue'],
      ['serahcfg', 'camera', 'Serah Terima', 'Foto bukti', 'green']]],
    ['Tampilan & perangkat', [
      ['identitas', 'building', 'Identitas Desa', 'Nama, kecamatan, logo', 'teal'],
      ['printer', 'printer', 'Struk & Printer', 'Ukuran kertas, isi struk', 'amber'],
      ['suara', 'volume', 'Suara Panggilan', 'Kecepatan, volume, kalimat', 'red']]],
    ['Sistem', [
      ['log', 'list', 'Log Aktivitas', 'Jejak aktivitas pengguna', 'gray'],
      ['#/akun', 'user', 'Akun & Perangkat', 'Password, tema, printer perangkat ini', 'gray']]]
  ];
  const MENU = [].concat.apply([], GROUPS.map(g => g[1]));
  function cfgForm(keys, inner, tombol) {
    return '<form class="card stack" data-form="config" data-keys="' + keys.join(',') + '">' + inner + '<button class="btn ok block">' + (tombol || 'Simpan') + '</button></form>';
  }
  const c = k => Q.cfg(k);
  const SUBS = {
    identitas: () => cfgForm(['NAMA_DESA', 'KECAMATAN'], field('Nama desa', 'NAMA_DESA', c('NAMA_DESA'), { req: true, max: 80 }) + field('Kecamatan', 'KECAMATAN', c('KECAMATAN'), { max: 80 })) +
      '<section class="card stack"><h2>Logo</h2>' + (c('LOGO_URL') ? '<img src="' + E(c('LOGO_URL')) + '" alt="Logo saat ini" style="width:96px;height:96px;object-fit:cover;border-radius:20px">' : '<p class="muted">Belum ada logo.</p>') +
      '<input class="input" type="file" accept="image/png,image/jpeg,image/webp" data-change="logo" aria-label="Pilih logo"><p class="hint">PNG/JPG/WebP, maksimal 1,5 MB. Logo tampil di layar display dan struk cetak browser.</p></section>',
    aturan: () => cfgForm(['RASIO_PRIORITAS', 'RASIO_UMUM', 'PERILAKU_JALUR_KOSONG', 'KHUSUS_AKTIF', 'MASAL_MAKS', 'TOKEN_JAM'],
      '<div class="row"><div class="field grow">' + field('Rasio Prioritas', 'RASIO_PRIORITAS', c('RASIO_PRIORITAS'), { type: 'number', min: 1, maxn: 9, inputmode: 'numeric' }) + '</div><div class="field grow">' + field('Rasio Umum', 'RASIO_UMUM', c('RASIO_UMUM'), { type: 'number', min: 1, maxn: 9, inputmode: 'numeric' }) + '</div></div><p class="hint">Hanya berlaku untuk loket bermode Campuran. Contoh 2 : 1 = dua Prioritas lalu satu Umum.</p>' +
      field('Jika jalur loket kosong', 'PERILAKU_JALUR_KOSONG', c('PERILAKU_JALUR_KOSONG'), { type: 'select', opts: [['bantu', 'Bantu jalur lain'], ['tunggu', 'Tetap menunggu']], hint: 'Berlaku untuk loket bermode Prioritas atau Umum.' }) +
      sw('Aktifkan kategori Khusus (darurat/sakit)', 'KHUSUS_AKTIF', c('KHUSUS_AKTIF') === '1', 'Nomor K didahulukan oleh SEMUA loket. Tombol cetaknya tersembunyi di menu printer; dari halaman publik hanya perangkat berkode perangkat yang bisa mencetaknya.') +
      field('Maksimal nomor sekali cetak massal', 'MASAL_MAKS', c('MASAL_MAKS'), { type: 'number', min: 1, maxn: 500, inputmode: 'numeric', hint: 'Kategori Khusus selalu dibatasi maksimal 20.' }) +
      field('Masa berlaku login (jam)', 'TOKEN_JAM', c('TOKEN_JAM'), { type: 'number', min: 1, maxn: 72, inputmode: 'numeric' })),
    awal: () => cfgForm(['AMBIL_PUBLIK', 'AMBIL_BATAS_MENIT', 'KODE_KIOSK'],
      sw('Izinkan ambil nomor tanpa login', 'AMBIL_PUBLIK', c('AMBIL_PUBLIK') === '1', 'Jika dimatikan, halaman awal meminta petugas masuk dulu.') +
      field('Batas nomor per menit (semua perangkat)', 'AMBIL_BATAS_MENIT', c('AMBIL_BATAS_MENIT'), { type: 'number', min: 1, maxn: 60, inputmode: 'numeric', hint: 'Pengaman agar halaman publik tidak dibanjiri nomor palsu.' }) +
      field('Kode perangkat (opsional)', 'KODE_KIOSK', '', { type: 'password', auto: 'off', hint: c('KIOSK_BERKODE') === '1' ? 'Kode sedang terpasang. Isi untuk menggantinya.' : 'Kosong = tanpa kode. Jika diisi (4–20 karakter), hanya perangkat yang sudah memasukkan kode ini yang bisa mengambil nomor.' }) +
      (c('KIOSK_BERKODE') === '1' ? sw('Hapus kode perangkat', 'HAPUS_KODE', false) : '')) +
      '<section class="card"><p class="small"><b>Cara memasukkan kode di perangkat pendaftaran:</b> di halaman awal, tekan dan tahan judul desa selama sekitar 1 detik. Jendela pengaturan printer dan kode perangkat akan terbuka. Tombol ini sengaja tidak terlihat oleh warga.</p></section>',
    serahcfg: () => cfgForm(['SERAH_FOTO_WAJIB'],
      sw('Foto bukti wajib saat serah terima', 'SERAH_FOTO_WAJIB', c('SERAH_FOTO_WAJIB') === '1', 'Jika dimatikan, petugas boleh mengonfirmasi tanpa foto.')) +
      '<section class="card"><p class="small"><b>QR undangan</b> dari pemerintah berisi no, NIK, nama, dan alamat. Petugas serah terima cukup scan: <b>NIK terisi otomatis</b>, lalu cari di Daftar Penerima. Data penerima dimasukkan Admin di <b>Data Penerima → Scan QR undangan</b>. Foto disimpan pribadi di Google Drive dan hanya bisa dilihat lewat aplikasi oleh Admin dan Pimpinan.</p></section>',
    printer: () => cfgForm(['PRINTER_UKURAN', 'PRINTER_METODE', 'PRINTER_NAMA', 'PRINTER_SALINAN', 'PRINTER_AUTO', 'STRUK_LOGO', 'STRUK_TAMPIL_JAM', 'STRUK_PESAN'],
      field('Ukuran kertas', 'PRINTER_UKURAN', c('PRINTER_UKURAN'), { type: 'select', opts: [['58', '58 mm'], ['80', '80 mm']] }) +
      field('Metode koneksi (default)', 'PRINTER_METODE', c('PRINTER_METODE'), { type: 'select', opts: [['rawbt', 'RawBT (Android, disarankan)'], ['browser', 'Cetak browser'], ['bluetooth', 'Bluetooth langsung (eksperimental)']], hint: 'Tiap perangkat bisa memilih metode sendiri di menu Akun.' }) +
      field('Nama printer (label)', 'PRINTER_NAMA', c('PRINTER_NAMA'), { max: 60 }) + field('Jumlah salinan', 'PRINTER_SALINAN', c('PRINTER_SALINAN'), { type: 'number', min: 1, maxn: 3, inputmode: 'numeric' }) +
      sw('Auto-cetak saat nomor terbit', 'PRINTER_AUTO', c('PRINTER_AUTO') === '1') + sw('Tampilkan jam di struk', 'STRUK_TAMPIL_JAM', c('STRUK_TAMPIL_JAM') === '1') +
      sw('Logo di struk', 'STRUK_LOGO', c('STRUK_LOGO') === '1', 'Hanya untuk metode Cetak browser.') + field('Pesan penutup', 'STRUK_PESAN', c('STRUK_PESAN'), { type: 'textarea' })),
    suara: () => cfgForm(['SUARA_DEFAULT', 'SUARA_DING', 'SUARA_KECEPATAN', 'SUARA_VOLUME', 'SUARA_FORMAT'],
      sw('Layar display bersuara secara default', 'SUARA_DEFAULT', c('SUARA_DEFAULT') === '1') + sw('Bunyi "ding" sebelum panggilan', 'SUARA_DING', c('SUARA_DING') === '1') +
      field('Kecepatan suara', 'SUARA_KECEPATAN', c('SUARA_KECEPATAN'), { type: 'select', opts: [['lambat', 'Lambat'], ['normal', 'Normal'], ['cepat', 'Cepat']] }) +
      field('Volume (0–100)', 'SUARA_VOLUME', c('SUARA_VOLUME'), { type: 'number', min: 0, maxn: 100, inputmode: 'numeric' }) +
      field('Format kalimat', 'SUARA_FORMAT', c('SUARA_FORMAT'), { hint: 'Gunakan {nomor} dan {loket}.', max: 160 })) +
      '<section class="card"><button class="btn ghost block" data-act="tes-suara">' + I('volume') + 'Tes suara</button><p class="hint" style="margin-top:8px">Suara memakai mesin text-to-speech di perangkat. Jika suara bahasa Indonesia tidak ada, perangkat memakai suara bawaannya.</p></section>'
  };
  AB.pages.pengaturan = {
    render() {
      const sub = AB.route.sub;
      if (!sub) {
        const baris = m => '<a class="row-link" href="' + (m[0].charAt(0) === '#' ? m[0] : '#/pengaturan/' + m[0]) + '"><span class="tile t-' + m[4] + '">' + I(m[1]) + '</span><span class="grow"><b>' + E(m[2]) + '</b><small>' + E(m[3]) + '</small></span>' + I('chevron') + '</a>';
        return hero({ title: 'Pengaturan', sub: Q.cfg('NAMA_DESA'), compact: true }) + '<div class="body"><div class="groups">' +
          GROUPS.map(g => '<div><h2 class="group-title">' + E(g[0]) + '</h2><nav class="group card" aria-label="' + E(g[0]) + '">' + g[1].map(baris).join('') + '</nav></div>').join('') + '</div></div>';
      }
      const jud = (MENU.filter(m => m[0] === sub)[0] || [0, 0, 'Pengaturan'])[2];
      let isi = '<div id="async" class="stack">' + skel(3) + '</div>';
      if (SUBS[sub]) isi = '<div class="stack">' + SUBS[sub]() + '</div>';
      return subHero(jud, 'pengaturan') + '<div class="body">' + isi + '</div>';
    },
    async load() {
      const sub = AB.route.sub, el = document.getElementById('async'); if (!el) return;
      if (sub === 'loket') el.innerHTML = loketList();
      else if (sub === 'user') { const r = await Api.call('listUser'); el.innerHTML = r.success ? userList(r.data.users) : empty('alert', r.message); }
      else if (sub === 'jenis') { const r = await Api.call('listJenis'); AB.cache.jenis = r.success ? r.data.data : []; el.innerHTML = r.success ? jenisList(r.data.data) : empty('alert', r.message); }
      else if (sub === 'penerima') { AB.pages.penerima.muat(); }
      else if (sub === 'log') { const r = await Api.call('getLog', { limit: 100 }); el.innerHTML = r.success ? logList(r.data.data) : empty('alert', r.message); }
    }
  };
  function loketList() {
    const l = AB.state.loket;
    return '<button class="btn block" data-act="loket-form">' + I('plus') + 'Tambah loket</button><div class="auto-grid">' + l.map(x => '<section class="card row between"><div class="grow"><b>' + E(x.nama) + '</b><div class="muted small">' + E(x.mode) + ' · ' + (x.petugas.length ? E(x.petugas.join(', ')) : 'belum ada petugas') + '</div></div><span class="chip ' + (x.aktif ? 'ok' : 'gray') + '">' + (x.aktif ? 'Aktif' : 'Nonaktif') + '</span><button class="btn ghost sm" data-act="loket-form" data-id="' + x.id + '" aria-label="Ubah ' + E(x.nama) + '">' + I('edit') + '</button></section>').join('') + '</div>';
  }
  const ROLE_LBL = { admin: 'Admin', pendaftaran: 'Pendaftaran', loket: 'Petugas Loket', pimpinan: 'Pimpinan', serahterima: 'Petugas Serah Terima' };
  function userList(us) {
    AB.cache.users = us;
    return '<button class="btn block" data-act="user-form">' + I('plus') + 'Tambah pengguna</button><button class="btn ghost block" data-act="buat-akun-serah">' + I('key') + 'Buat akun Serah Terima (serah1–serah3)</button><div class="auto-grid">' + us.map(u => '<section class="card row between"><div class="grow"><b>' + E(u.nama) + '</b><div class="muted small">@' + E(u.username) + ' · ' + ROLE_LBL[u.role] + (u.loket_id ? ' · ' + E((Q.loket(u.loket_id) || {}).nama || u.loket_id) : '') + '</div></div><span class="chip ' + (u.status === 'aktif' ? 'ok' : 'gray') + '">' + u.status + '</span><button class="btn ghost sm" data-act="user-form" data-id="' + u.id + '" aria-label="Ubah ' + E(u.nama) + '">' + I('edit') + '</button></section>').join('') + '</div>';
  }
  function jenisList(js) {
    return '<button class="btn block" data-act="jenis-form">' + I('plus') + 'Tambah jenis bantuan</button>' + (js.length ? '<div class="auto-grid">' + js.map(j => '<section class="card row between"><div class="grow"><b>' + E(j.nama_bantuan) + '</b><div class="muted small">' + E(j.periode || '-') + (j.keterangan ? ' · ' + E(j.keterangan) : '') + '</div></div><button class="btn ghost sm" data-act="jenis-form" data-id="' + j.id + '" aria-label="Ubah">' + I('edit') + '</button></section>').join('') + '</div>' : empty('gift', 'Belum ada jenis bantuan.'));
  }
  function logList(ls) {
    return ls.length ? '<section class="card"><div class="scroll-x"><table class="tbl"><thead><tr><th>Waktu</th><th>User</th><th>Aksi</th><th>Detail</th></tr></thead><tbody>' + ls.map(l => '<tr><td>' + E(String(l.waktu).slice(5, 16).replace('T', ' ')) + '</td><td>' + E(l.user) + '</td><td>' + E(l.aksi) + '</td><td>' + E(l.detail) + '</td></tr>').join('') + '</tbody></table></div></section>' : empty('list', 'Belum ada log.');
  }

  // ---------- DATA PENERIMA ----------
  AB.pages.penerima = {
    async muat(hal) {
      const el = document.getElementById('async'); if (!el) return;
      AB.ui.pHal = hal || 1;
      if (!AB.cache.jenis) { const j = await Api.call('listJenis'); AB.cache.jenis = j.success ? j.data.data : []; }
      const r = await Api.call('listPenerima', { q: AB.ui.pq || '', halaman: AB.ui.pHal });
      if (!r.success) { el.innerHTML = empty('alert', r.message); return; }
      const d = r.data, jn = {}; AB.cache.jenis.forEach(j => jn[j.id] = j.nama_bantuan); AB.cache.penerima = d.data;
      const maks = Math.ceil(d.total / d.per) || 1;
      el.innerHTML = '<div class="card stack"><h2>Masukkan data dari QR undangan</h2>' + (adaScanner() ? '<button class="btn block" data-act="scan-penerima">' + I('scan') + 'Scan QR undangan (kamera)</button>' : '') +
        '<form class="row" data-form="qr-penerima"><input class="input grow" name="teks" placeholder="Hasil scan alat scanner / tempel isi QR" autocomplete="off" spellcheck="false" aria-label="Isi QR undangan"><button class="btn sm" aria-label="Proses">' + I('arrow') + '</button></form>' +
        '<p class="hint">QR berisi no, NIK, nama, dan alamat. Data tampil di formulir untuk diperiksa sebelum disimpan.</p></div>' +
        '<div class="card stack"><div class="row"><button class="btn grow" data-act="penerima-form">' + I('plus') + 'Tambah</button><button class="btn ghost grow" data-act="penerima-impor">' + I('download', 'flipv') + 'Impor CSV</button></div>' +
        '<form class="row" data-form="cari-penerima"><input class="input grow" name="q" placeholder="Cari NIK / nama…" value="' + E(AB.ui.pq || '') + '" inputmode="search" aria-label="Cari penerima"><button class="btn sm">' + I('search') + '</button></form>' +
        '<p class="muted small">' + d.total + ' penerima · ' + d.sudah + ' sudah mengambil</p></div>' +
        (d.data.length ? '<div class="auto-grid">' + d.data.map(p => '<section class="card row between"><div class="grow"><b>' + E(p.nama) + '</b><div class="muted small">' + E(p.nik) + ' · ' + E(jn[p.jenis_bantuan_id] || '-') + '</div></div><span class="chip ' + (p.status_ambil === 'Sudah' ? 'ok' : 'gray') + '">' + (p.status_ambil === 'Sudah' ? 'Sudah mengambil' : 'Belum') + '</span><button class="btn ghost sm" data-act="penerima-form" data-id="' + p.id + '" aria-label="Ubah ' + E(p.nama) + '">' + I('edit') + '</button></section>').join('') + '</div>' : empty('users', 'Tidak ada data.')) +
        (maks > 1 ? '<div class="row between"><button class="btn ghost sm" data-act="penerima-hal" data-h="' + (d.halaman - 1) + '"' + (d.halaman <= 1 ? ' disabled' : '') + '>‹ Sebelumnya</button><span class="muted small">' + d.halaman + ' / ' + maks + '</span><button class="btn ghost sm" data-act="penerima-hal" data-h="' + (d.halaman + 1) + '"' + (d.halaman >= maks ? ' disabled' : '') + '>Berikutnya ›</button></div>' : '');
    }
  };

  function printerBlock() {
    const cfg = AB.printCfg(), met = Printer.metode(cfg), st = Printer.status(cfg), l = Printer.lokal();
    return '<div class="stack"><div class="row"><span class="pill flat ' + st.s + '">' + I(st.s === 'off' ? 'printerOff' : 'printer') + E(st.t) + '</span></div>' +
      '<div class="field"><label for="pm">Metode cetak</label><select class="input" id="pm" data-change="printer-metode"><option value="rawbt"' + (met === 'rawbt' ? ' selected' : '') + '>RawBT (Android)</option><option value="browser"' + (met === 'browser' ? ' selected' : '') + '>Cetak browser</option><option value="bluetooth"' + (met === 'bluetooth' ? ' selected' : '') + '>Bluetooth langsung (eksperimental)</option></select></div>' +
      (met === 'bluetooth' ? '<button class="btn ghost block" data-act="bt-hubung">' + I('bluetooth') + (l.btNama ? 'Hubungkan ulang (' + E(l.btNama) + ')' : 'Hubungkan printer') + '</button>' : '') +
      (met === 'rawbt' ? '<p class="hint">Pasang aplikasi RawBT, pasangkan printer Bluetooth di pengaturan Android, lalu pilih printer itu di RawBT.</p>' : '') +
      '<button class="btn block" data-act="tes-cetak">' + I('printer') + 'Tes cetak</button><p class="hint">Status "siap" berdasarkan Tes Cetak terakhir; aplikasi tidak bisa mendeteksi koneksi RawBT secara langsung.</p>' +
      // Jalur K (Khusus: darurat/sakit): sengaja dibuat mirip tombol uji biasa. Server tetap membatasi (login atau kode perangkat).
      (AB.khususAktif() && (!AB.user || AB.user.role === 'admin' || AB.user.role === 'pendaftaran') ? '<button class="btn ghost sm" style="justify-self:start;opacity:.75" data-act="ambil" data-jalur="K" data-confirm="Terbitkan nomor KHUSUS (darurat/sakit)? Nomor ini akan dipanggil lebih dulu oleh semua loket.">' + I('printer') + 'Cetak jalur K</button>' : '') + '</div>';
  }
  AB.printerBlock = printerBlock;
  AB.printCfg = AB.printCfg || (() => AB.config);

  // ---------- AKUN & PERANGKAT ----------
  AB.pages.akun = {
    render() {
      const u = AB.user, dark = document.documentElement.getAttribute('data-theme') === 'dark';
      const canPrint = u.role === 'admin' || u.role === 'loket';
      const printer = canPrint ? '<section class="card stack"><h2>Printer di perangkat ini</h2>' + printerBlock() + '</section>' : '';
      return hero({ title: 'Akun', sub: u.nama, compact: true }) + '<div class="body">' +
        '<section class="card"><div class="row"><div class="qno" style="width:56px;height:56px;border-radius:18px">' + I('user') + '</div><div><b>' + E(u.nama) + '</b><div class="muted small">@' + E(u.username) + ' · ' + ROLE_LBL[u.role] + (u.loket_id ? ' · ' + E((Q.loket(u.loket_id) || {}).nama || '') : '') + '</div></div></div></section>' +
        printer +
        '<section class="card stack"><h2>Tampilan & suara</h2><button class="btn ghost block" data-act="toggle-theme">' + I(dark ? 'sun' : 'moon') + (dark ? 'Mode terang' : 'Mode gelap') + '</button>' +
        '<button class="btn ghost block" data-act="toggle-mute" data-ctx="panel">' + I(Suara.muted('panel') ? 'mute' : 'volume') + (Suara.muted('panel') ? 'Suara panggilan di perangkat ini: mati' : 'Suara panggilan di perangkat ini: aktif') + '</button>' +
        (u.role !== 'pimpinan' ? '' : '') + '<a class="btn ghost block" href="#/display" style="text-decoration:none">' + I('monitor') + 'Buka layar display</a></section>' +
        '<form class="card stack" data-form="password"><h2>Ganti password</h2>' + field('Password lama', 'password_lama', '', { type: 'password', req: true, auto: 'current-password' }) + field('Password baru (min. 6 karakter)', 'password_baru', '', { type: 'password', req: true, auto: 'new-password' }) + '<button class="btn block">Simpan password</button></form>' +
        '<button class="btn danger block" data-act="logout">' + I('logout') + 'Keluar</button><p class="muted small" style="text-align:center">Versi aplikasi ' + AB.VERSI_FRONTEND + ' · backend ' + (AB.backendVersi || '?') + (AB.backendVersi && AB.backendVersi < AB.BACKEND_MIN ? ' (perlu diperbarui)' : '') + '</p></div>';
    }
  };

  // ---------- SHEET / FORM MODAL ----------
  AB.sheets = {
    masalHasil(b) {
      const daftar = AB.masalDaftar(b), n = Printer.jumlahBagian(daftar, AB.printCfg()), per = Printer.RAWBT_BAGIAN;
      let tombol;
      if (n > 1) {
        tombol = '<p class="hint">Metode RawBT: struk dikirim per bagian (maks. ' + per + ' struk). Tekan tiap bagian.</p><div class="stack">';
        for (let i = 0; i < n; i++) { const a = i * per, z = Math.min((i + 1) * per, daftar.length) - 1; tombol += '<button class="btn ' + (i === 0 ? '' : 'ghost') + ' block" data-act="masal-cetak" data-bagian="' + i + '">' + I('printer') + 'Cetak bagian ' + (i + 1) + ' (' + E(daftar[a].nomor) + ' – ' + E(daftar[z].nomor) + ')</button>'; }
        tombol += '</div>';
      } else tombol = '<button class="btn block" style="min-height:60px" data-act="masal-cetak" data-bagian="0">' + I('printer') + 'Cetak ' + daftar.length + ' struk</button>';
      return '<h2>' + b.jumlah + ' nomor terbit<button class="icon-btn plain" data-act="tutup" aria-label="Tutup">' + I('x') + '</button></h2>' +
        '<div class="struk-no ' + b.jalur + '" style="font-size:2.2rem">' + E(b.dari) + ' – ' + E(b.sampai) + '</div><p style="text-align:center">' + chipJalur(b.jalur) + '</p>' +
        '<p class="muted small" style="text-align:center">Nomor sudah masuk antrian. Jika struk belum keluar atau macet, tekan Cetak lagi (nomor tidak bertambah).</p>' + tombol +
        '<button class="btn ghost block" style="margin-top:10px" data-act="tutup">Tutup</button>';
    },
    akunBaru(d) {
      const baris = d.baru.map(x => '<tr><td>' + E(x.username) + '</td><td><code>' + E(x.password) + '</code></td></tr>').join('');
      return '<h2>Akun Serah Terima<button class="icon-btn plain" data-act="tutup" aria-label="Tutup">' + I('x') + '</button></h2>' +
        (d.baru.length ? '<p class="alert-box" role="alert">' + I('alert') + 'CATAT SEKARANG. Password hanya tampil sekali dan tidak bisa dilihat lagi.</p><div class="scroll-x"><table class="tbl"><thead><tr><th>Username</th><th>Password</th></tr></thead><tbody>' + baris + '</tbody></table></div><button class="btn block" style="margin-top:12px" data-act="salin-akun">' + I('file') + 'Salin daftar akun</button>'
          : '<p>Semua akun <b>serah1–serah3</b> sudah ada. Tidak ada yang diubah.</p>') +
        (d.sudah.length ? '<p class="muted small" style="margin-top:10px">Sudah ada sebelumnya: ' + E(d.sudah.join(', ')) + '. Lupa password? Ubah di daftar pengguna (isi kolom password baru).</p>' : '');
    },
    kamera(judul) { return '<h2>' + E(judul || 'Scan QR undangan') + '<button class="icon-btn plain" data-act="tutup" aria-label="Tutup">' + I('x') + '</button></h2><div class="scan-box"><video id="scan-video" playsinline muted></video><div class="scan-frame" aria-hidden="true"></div></div><p id="scan-info" class="muted small" style="text-align:center;margin-top:10px">Arahkan kamera ke QR pada undangan.</p>'; },
    foto(d) {
      const ok = String(d.dataUrl || '').indexOf('data:image/jpeg;base64,') === 0;
      return '<h2>Foto serah terima<button class="icon-btn plain" data-act="tutup" aria-label="Tutup">' + I('x') + '</button></h2>' + (ok ? '<img class="foto-view" src="' + d.dataUrl + '" alt="Foto serah terima ' + E(d.nama) + '">' : '<p class="muted">Foto tidak dapat ditampilkan.</p>') +
        '<p class="muted small" style="margin-top:8px">' + E(d.nama) + ' · ' + hhmm(d.waktu_serah) + ' · ' + E(d.petugas) + '</p>';
    },
    kiosk() {
      let kode = ''; try { kode = localStorage.getItem('ab_kode') || ''; } catch (e) {}
      return '<h2>Pengaturan perangkat<button class="icon-btn plain" data-act="tutup" aria-label="Tutup">' + I('x') + '</button></h2>' + printerBlock() +
        (AB.user ? '' : '<form class="stack" data-form="kode" style="margin-top:16px"><h2 style="font-size:1rem;margin:0">Kode perangkat</h2>' + field('Kode', 'kode', kode, { type: 'password', auto: 'off', hint: 'Isi hanya jika Admin mengaktifkan kode perangkat. Kode disimpan di perangkat ini.' }) + '<button class="btn block">Simpan kode</button></form>');
    },
    verifikasi(a) {
      return '<h2>Verifikasi ' + E(a.no) + '<button class="icon-btn plain" data-act="tutup" aria-label="Tutup">' + I('x') + '</button></h2><form class="row" data-form="cari-nik" data-id="' + a.id + '"><input class="input grow" name="q" placeholder="NIK atau nama warga…" required minlength="3" inputmode="search" autofocus aria-label="NIK atau nama"><button class="btn">' + I('search') + 'Cari</button></form><div id="hasil" class="hasil"><p class="muted small">Ketik minimal 3 karakter. Untuk NIK, boleh sebagian digit.</p></div>';
    },
    hasil(list, aid) {
      if (!list.length) return '<p class="muted">Tidak ditemukan. Jika warga memang bukan penerima, tutup dan pilih "Tidak terdaftar".</p>';
      return list.map(p => {
        const sudah = p.status_ambil === 'Sudah';
        return '<button data-act="tautkan" data-id="' + aid + '" data-pid="' + p.id + '"' + (sudah ? ' disabled' : '') + '><b>' + E(p.nama) + (p.umur != null ? ' · ' + p.umur + ' th' : '') + '</b><span class="muted small">' + E(p.nik) + '<br>' + E([p.alamat, p.rt ? 'RT ' + p.rt : '', p.rw ? 'RW ' + p.rw : ''].filter(Boolean).join(', ')) + ' · ' + E(p.bantuan) + '</span>' +
          (sudah ? '<br><span class="chip danger">Sudah mengambil ' + E(p.tgl_ambil || '') + '</span>' : '') +
          (!sudah && p.tgl_verifikasi ? '<br><span class="chip warn">Terverifikasi ' + E(p.tgl_verifikasi) + ', belum mengambil</span>' : '') + '</button>';
      }).join('');
    },
    nomor(d, otomatis) {
      const s = d.struk;
      return '<h2>Nomor terbit<button class="icon-btn plain" data-act="tutup" aria-label="Tutup">' + I('x') + '</button></h2><div class="struk-no ' + s.jalur + '">' + E(s.nomor) + '</div><p style="text-align:center">' + chipJalur(s.jalur) + '</p><p class="muted" style="text-align:center">' + E(s.nama_desa) + ' · ' + E(s.jam) + ' · ' + s.di_depan + ' antrian di depan</p>' +
        (otomatis ? '<p class="hint" style="text-align:center">Struk dikirim ke printer. Jika belum keluar, tekan Cetak.</p>' : '') +
        '<div class="btn-row"><button class="btn" data-act="cetak-sheet">' + I('printer') + 'Cetak</button><button class="btn ghost" data-act="tutup">Tutup</button></div>';
    },
    pilihLoket(a) {
      const ls = AB.state.loket.filter(l => l.aktif);
      return '<h2>Panggil ' + E(a.no) + ' ke loket<button class="icon-btn plain" data-act="tutup" aria-label="Tutup">' + I('x') + '</button></h2><div class="hasil">' + ls.map(l => {
        const ok = l.status_layanan === 'Kosong' && l.petugas.length;
        return '<button data-act="kirim-ke-loket" data-id="' + a.id + '" data-loket="' + l.id + '"' + (ok ? '' : ' disabled') + '><b>' + E(l.nama) + '</b><span class="muted small">' + (l.petugas.length ? E(l.petugas.join(', ')) : 'Belum ada petugas aktif') + ' · ' + (l.status_layanan === 'Melayani' ? 'sedang melayani ' + E(l.sedang.no) : l.status_layanan) + '</span></button>';
      }).join('') + '</div><p class="hint">Hanya loket yang kosong dan punya petugas aktif yang bisa dipilih.</p>';
    },
    loket(l) {
      l = l || { nama_loket: '', mode: 'Campuran', aktif: true };
      return '<h2>' + (l.id ? 'Ubah loket' : 'Tambah loket') + '<button class="icon-btn plain" data-act="tutup" aria-label="Tutup">' + I('x') + '</button></h2><form class="stack" data-form="loket" data-id="' + E(l.id || '') + '">' + field('Nama loket', 'nama_loket', l.nama || l.nama_loket, { req: true, max: 40 }) +
        field('Mode layanan', 'mode_layanan', l.mode, { type: 'select', opts: [['Prioritas', 'Prioritas — hanya lansia & ibu hamil'], ['Umum', 'Umum — hanya warga umum'], ['Campuran', 'Campuran — ikuti rasio']] }) + sw('Loket aktif', 'status_aktif', l.aktif) + '<button class="btn ok block">Simpan</button></form>';
    },
    user(u) {
      u = u || { nama: '', username: '', role: 'pendaftaran', loket_id: '', status: 'aktif' };
      const lk = AB.state.loket.map(l => [l.id, l.nama]);
      return '<h2>' + (u.id ? 'Ubah pengguna' : 'Tambah pengguna') + '<button class="icon-btn plain" data-act="tutup" aria-label="Tutup">' + I('x') + '</button></h2><form class="stack" data-form="user" data-id="' + E(u.id || '') + '">' + field('Nama', 'nama', u.nama, { req: true, max: 60 }) + field('Username', 'username', u.username, { req: true, max: 30, auto: 'off' }) +
        field('Peran', 'role', u.role, { type: 'select', opts: [['pendaftaran', 'Petugas Pendaftaran'], ['loket', 'Petugas Loket'], ['serahterima', 'Petugas Serah Terima'], ['pimpinan', 'Pimpinan'], ['admin', 'Admin']] }) +
        field('Loket (khusus Petugas Loket)', 'loket_id', u.loket_id, { type: 'select', opts: [['', '— tidak ada —']].concat(lk) }) +
        field(u.id ? 'Password baru (kosongkan jika tidak diubah)' : 'Password awal', 'password', '', { type: 'password', auto: 'new-password', hint: 'Minimal 6 karakter.' }) +
        field('Status', 'status', u.status, { type: 'select', opts: [['aktif', 'Aktif'], ['nonaktif', 'Nonaktif']] }) + '<button class="btn ok block">Simpan</button></form>';
    },
    penerima(p, opsi) {
      opsi = opsi || {};
      p = p || { nik: '', nama: '', tgl_lahir: '', alamat: '', rt: '', rw: '', jenis_bantuan_id: '', status_ambil: 'Belum' };
      const jn = [['', '— pilih —']].concat((AB.cache.jenis || []).map(j => [j.id, j.nama_bantuan]));
      return '<h2>' + (p.id ? 'Ubah penerima' : 'Tambah penerima') + '<button class="icon-btn plain" data-act="tutup" aria-label="Tutup">' + I('x') + '</button></h2>' +
        (opsi.dariQr ? '<div class="alert-box" style="background:var(--umum-bg);color:var(--umum)" role="status">' + I('scan') + '<p>' + (opsi.sudahAda ? 'NIK ini sudah terdaftar. Yang tampil adalah data tersimpan.' : 'Data dari QR undangan. Periksa, lalu simpan.') + '</p></div>' : '') +
        (opsi.mentah ? '<details class="small" style="margin:8px 0"><summary>Isi QR (untuk pemeriksaan)</summary><code style="word-break:break-all;display:block;margin-top:6px">' + E(opsi.mentah) + '</code></details>' : '') +
        '<form class="stack" data-form="penerima" data-id="' + E(p.id || '') + '">' + field('NIK (16 digit)', 'nik', p.nik, { req: true, max: 16, inputmode: 'numeric' }) + field('Nama', 'nama', p.nama, { req: true, max: 80 }) +
        field('Kode undangan (isi barcode undangan)', 'kode_undangan', p.kode_undangan || '', { max: 40, auto: 'off', hint: 'Kosong = barcode undangan berisi NIK.' }) + field('Tanggal lahir', 'tgl_lahir', p.tgl_lahir, { type: 'date' }) + field('Alamat / dusun', 'alamat', p.alamat, { max: 120 }) +
        '<div class="row"><div class="grow">' + field('RT', 'rt', p.rt, { max: 4, inputmode: 'numeric' }) + '</div><div class="grow">' + field('RW', 'rw', p.rw, { max: 4, inputmode: 'numeric' }) + '</div></div>' +
        field('Jenis bantuan', 'jenis_bantuan_id', p.jenis_bantuan_id, { type: 'select', opts: jn }) +
        (p.id ? field('Status pengambilan', 'status_ambil', p.status_ambil, { type: 'select', opts: [['Belum', 'Belum mengambil'], ['Sudah', 'Sudah mengambil']], hint: 'Ubah hanya untuk koreksi. "Belum" menghapus catatan serah terima (foto tetap tersimpan di Drive).' }) : '') +
        '<button class="btn ok block">Simpan</button>' + (opsi.dariQr && !p.id ? '<button class="btn block" data-lagi="1">' + I('scan') + 'Simpan &amp; scan berikutnya</button>' : '') + (p.id ? '<button type="button" class="btn danger block" data-act="penerima-hapus" data-id="' + p.id + '">' + I('trash') + 'Hapus</button>' : '') + '</form>';
    },
    jenis(j) {
      j = j || { nama_bantuan: '', periode: '', keterangan: '' };
      return '<h2>' + (j.id ? 'Ubah jenis bantuan' : 'Tambah jenis bantuan') + '<button class="icon-btn plain" data-act="tutup" aria-label="Tutup">' + I('x') + '</button></h2><form class="stack" data-form="jenis" data-id="' + E(j.id || '') + '">' + field('Nama bantuan', 'nama_bantuan', j.nama_bantuan, { req: true, max: 60 }) + field('Periode', 'periode', j.periode, { max: 40 }) + field('Keterangan', 'keterangan', j.keterangan, { max: 120 }) +
        '<button class="btn ok block">Simpan</button>' + (j.id ? '<button type="button" class="btn danger block" data-act="jenis-hapus" data-id="' + j.id + '">' + I('trash') + 'Hapus</button>' : '') + '</form>';
    },
    impor() {
      return '<h2>Impor penerima (CSV)<button class="icon-btn plain" data-act="tutup" aria-label="Tutup">' + I('x') + '</button></h2><div class="stack"><p class="muted small">Kolom berurutan: <b>nik, nama, tgl_lahir, alamat, rt, rw, jenis_bantuan_id, kode_undangan</b>. Baris pertama boleh judul kolom. Tanggal: tahun-bulan-tanggal atau hari/bulan/tahun. NIK yang sudah ada dilewati.</p>' +
        '<input class="input" type="file" accept=".csv,text/csv,text/plain" data-change="csv" aria-label="Pilih file CSV"><div id="impor-info" class="muted small"></div></div>';
    }
  };

  // ---------- CETAK ANTRIAN MASSAL (Admin & Petugas Loket) ----------
  const namaKategori = { P: 'Prioritas', U: 'Umum', K: 'Khusus' };
  AB.masalDaftar = b => b.items.map(it => Object.assign({}, b.template, { nomor: it.nomor, di_depan: it.di_depan }));
  const nomorBerikut = j => { const mx = Q.all().filter(r => r.jalur === j).reduce((m, r) => Math.max(m, parseInt(String(r.no).split('-')[1], 10) || 0), 0); return j + '-' + String(mx + 1).padStart(3, '0'); };
  AB.pages.masal = {
    render() {
      const maks = Math.max(1, Math.min(500, Number(Q.cfg('MASAL_MAKS')) || 100));
      const kats = [['U', 'UMUM', 'Warga lainnya', 'users'], ['P', 'PRIORITAS', 'Lansia & ibu hamil', 'heart']].concat(Q.cfg('KHUSUS_AKTIF') === '1' ? [['K', 'KHUSUS', 'Darurat / sakit', 'alert']] : []);
      const b = AB.masalTerakhir;
      return hero({ title: 'Cetak Antrian Massal', sub: Q.cfg('NAMA_DESA'), compact: true }) +
        '<div class="body"><form class="card stack" data-form="masal"><h2>Terbitkan banyak nomor sekaligus</h2>' +
        '<div class="field"><span class="lbl">Kategori antrian</span><div class="kat-grid" role="radiogroup" aria-label="Kategori antrian">' +
        kats.map((o, i) => '<label class="kat ' + o[0] + '"><input type="radio" name="jalur" value="' + o[0] + '"' + (i === 0 ? ' checked' : '') + '><span class="kat-in">' + I(o[3]) + '<b>' + o[1] + '</b><small>' + o[2] + '</small><em>Berikutnya ' + nomorBerikut(o[0]) + '</em></span></label>').join('') + '</div></div>' +
        field('Jumlah struk yang dicetak', 'jumlah', '', { type: 'number', min: 1, maxn: maks, inputmode: 'numeric', req: true, hint: 'Maksimal ' + maks + ' per cetak (Khusus maksimal 20). Nomor melanjutkan nomor yang sudah ada; tiap nomor dicetak satu struk.' }) +
        '<div class="chips-q" role="group" aria-label="Pilih jumlah cepat">' + [10, 20, 50, 100].filter(n => n <= maks).map(n => '<button type="button" class="chip gray" data-act="masal-jumlah" data-n="' + n + '">' + n + '</button>').join('') + '</div>' +
        '<button class="btn ok block" style="min-height:60px">' + I('printer') + 'Terbitkan &amp; Cetak</button></form>' +
        (b ? '<section class="card stack"><h2>Batch terakhir</h2><p><b>' + E(b.dari) + '</b> s.d. <b>' + E(b.sampai) + '</b> · ' + b.jumlah + ' nomor ' + E(namaKategori[b.jalur]) + '</p><button class="btn ghost block" data-act="masal-buka-hasil">' + I('printer') + 'Cetak ulang batch ini</button></section>' : '') +
        '<button class="btn ghost block" data-act="printer-sheet">' + I('sliders') + 'Pengaturan printer perangkat ini</button></div>';
    }
  };

  // ---------- SERAH TERIMA BANSOS ----------
  const adaScanner = () => 'BarcodeDetector' in window;
  function serahHasil() {
    const s = AB.serah;
    if (!s) return '<section class="card"><div class="empty">' + I('gift') + 'Scan QR undangan warga untuk memulai serah terima.</div></section>';
    const p = s.penerima;
    const info = '<section class="card stack"><div class="row between"><div class="grow"><h2 style="margin:0">' + E(p.nama) + '</h2><div class="muted small">NIK ' + E(p.nik) + (p.umur != null ? ' · ' + p.umur + ' th' : '') + '</div></div>' +
      (p.status_ambil === 'Sudah' ? '<span class="chip danger">Sudah menerima</span>' : '<span class="chip warn">Belum menerima</span>') + '</div>' +
      (s.qr && s.qr.no ? '<div class="muted small">No. undangan: <b>' + E(s.qr.no) + '</b></div>' : '') +
      '<div class="muted small">' + E([p.alamat, p.rt ? 'RT ' + p.rt : '', p.rw ? 'RW ' + p.rw : ''].filter(Boolean).join(', ') || '-') + '</div><div><span class="chip P">' + E(p.bantuan) + '</span></div></section>';
    if (!s.boleh) return info + '<section class="card stack"><div class="alert-box" role="alert">' + I('alert') + '<p>' + E(s.alasan) + '</p></div><button class="btn block" data-act="serah-reset">' + I('scan') + 'Scan QR berikutnya</button></section>';
    const foto = s.foto ? '<img src="' + s.foto + '" alt="Foto bukti serah terima">' : '<div class="foto-ph">' + I('camera') + '<span>Belum ada foto</span></div>';
    return info + '<section class="card stack"><h2>Foto bukti serah terima' + (s.fotoWajib ? '' : ' (opsional)') + '</h2><div class="foto-box">' + foto + '</div>' +
      '<label class="btn ghost block" for="foto-input">' + I('camera') + (s.foto ? 'Ganti foto' : 'Ambil foto') + '</label><input id="foto-input" class="sr" type="file" accept="image/*" capture="environment" data-change="foto-serah">' +
      '<button class="btn ok block" style="min-height:60px" data-act="serah-konfirmasi"' + (s.fotoWajib && !s.foto ? ' disabled' : '') + '>' + I('check') + 'Bansos Sudah Diserahkan</button>' +
      '<button class="btn ghost block" data-act="serah-reset">Batal</button></section>';
  }
  AB.pages.serah = {
    render() {
      const i = AB.serahInfo || {};
      return hero({ title: 'Serah Terima Bansos', sub: Q.cfg('NAMA_DESA'), kpis: [
        { icon: 'gift', v: i.jumlah == null ? '–' : i.jumlah, l: 'Diserahkan hari ini' }, { icon: 'clock', v: i.menunggu == null ? '–' : i.menunggu, l: 'Belum menerima' }] }) +
        '<div class="body"><section class="card stack"><h2>Scan QR undangan</h2>' +
        (adaScanner() ? '<button class="btn block" data-act="scan-kamera">' + I('scan') + 'Scan dengan kamera</button>' : '<p class="hint">Browser ini belum mendukung scan lewat kamera. Pakai alat scanner QR atau ketik NIK.</p>') +
        '<form class="row" data-form="cari-undangan"><input class="input grow" id="kode-undangan" name="kode" placeholder="NIK (terisi otomatis saat scan)" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="NIK atau isi QR"><button class="btn" aria-label="Cari">' + I('search') + '</button></form>' +
        '<p class="hint">Scan QR undangan: NIK terisi otomatis dan data penerima langsung dicari. Alat scanner USB/Bluetooth: ketuk kolom di atas, lalu scan.</p></section><div id="serah-hasil" class="stack">' + serahHasil() + '</div></div>';
    },
    paint() { const el = document.getElementById('serah-hasil'); if (el) el.innerHTML = serahHasil(); },
    async load() {
      const r = await Api.call('daftarSerah');
      if (r.success) {
        AB.serahInfo = { jumlah: r.data.jumlah, menunggu: r.data.menunggu_serah };
        const b = document.querySelectorAll('.kpi b'); if (b[0]) b[0].textContent = AB.serahInfo.jumlah; if (b[1]) b[1].textContent = AB.serahInfo.menunggu;
      }
      const f = document.getElementById('kode-undangan'); if (f && matchMedia('(pointer:fine)').matches) f.focus();
    }
  };
  AB.pages.riwayatserah = {
    render() { return hero({ title: 'Riwayat Serah Terima', sub: 'Hari ini', compact: true }) + '<div class="body"><div id="async" class="auto-grid">' + skel(3) + '</div></div>'; },
    async load() {
      const el = document.getElementById('async'); if (!el) return;
      const r = await Api.call('daftarSerah');
      if (!r.success) { el.innerHTML = empty('alert', r.message); return; }
      const d = r.data;
      el.innerHTML = '<section class="card"><b>' + d.jumlah + '</b> diserahkan hari ini · <b>' + d.menunggu_serah + '</b> belum menerima</section>' +
        (d.data.length ? d.data.map(x => '<section class="card row between"><div class="grow"><b>' + E(x.nama) + '</b><div class="muted small">NIK ••••' + E(x.nik_akhir) + ' · ' + hhmm(x.waktu_serah) + ' · ' + E(x.petugas) + '</div></div><span class="chip ' + (x.ada_foto ? 'ok' : 'gray') + '">' + (x.ada_foto ? 'Ada foto' : 'Tanpa foto') + '</span></section>').join('') : empty('gift', 'Belum ada serah terima hari ini.'));
    }
  };

  // ---------- LAYAR DISPLAY ----------
  AB.pages.display = {
    render(d) {
      const logo = d.logo ? '<img src="' + E(d.logo) + '" alt="">' : '';
      const aktif = d.loket.filter(l => l.nomor).sort((a, b) => a.waktu_panggil < b.waktu_panggil ? 1 : -1);
      const fitur = aktif[0] || null;
      const kartu = l => '<div class="dcard ' + (l.nomor ? 'aktif' : '') + '" data-lid="' + E(l.id) + '"><div class="lk">' + E(l.nama) + '</div><div class="mode">' + E(l.mode) + '</div><div class="no ' + (l.nomor ? E(l.nomor.charAt(0)) : 'kosong') + '">' + (l.nomor ? E(l.nomor) : '—') + '</div></div>';
      const utama = fitur ? '<div class="dcard feat aktif" data-lid="' + E(fitur.id) + '"><span class="feat-tag">' + I('bell') + 'SEDANG DIPANGGIL</span><div class="no ' + E(fitur.nomor.charAt(0)) + '">' + E(fitur.nomor) + '</div><div class="lk">Silakan menuju ' + E(fitur.nama) + '</div></div>' : '';
      const semua = d.loket.map(kartu).join('') || '<div class="dcard"><div class="lk">Belum ada loket aktif</div></div>';
      return '<div class="disp"><header class="disp-head">' + logo + '<div><h1>' + E(d.desa) + '</h1><p>' + E(d.kecamatan) + '</p></div><div class="disp-clock"><span id="clock">' + AB.clock(true) + '</span><small>' + E(AB.tanggalPanjang()) + '</small></div></header>' +
        (utama ? '<section class="disp-feat" aria-live="polite">' + utama + '</section>' : '') +
        '<div class="disp-label">Semua Loket</div><section class="disp-grid">' + semua + '</section>' +
        '<section class="disp-foot"><div class="dbox"><h2>Terakhir dipanggil</h2><div class="dchips">' + (d.terakhir.length ? d.terakhir.map(x => '<span>' + E(x.no) + (x.loket ? ' · ' + E(singkatLoket(x.loket)) : '') + '</span>').join('') : '<span>—</span>') + '</div></div>' +
        '<div class="dbox"><h2>Terlewati — silakan lapor ke petugas</h2><div class="dchips">' + (d.terlewati.length ? d.terlewati.slice(0, 12).map(x => '<span class="warn">' + E(x.no) + '</span>').join('') : '<span>—</span>') + '</div></div></section>' +
        '<p style="text-align:center;opacity:.8;font-weight:600">Menunggu: Prioritas ' + d.menunggu.P + ' · Umum ' + d.menunggu.U + (d.menunggu.K ? ' · Khusus ' + d.menunggu.K : '') + '</p></div>' +
        '<div class="disp-ctrl"><button class="icon-btn" data-act="toggle-mute" data-ctx="display" aria-label="Suara">' + I(Suara.muted('display', d.suara) ? 'mute' : 'volume') + '</button><button class="icon-btn" data-act="ulang-suara" aria-label="Ulangi suara">' + I('repeat') + '</button><button class="icon-btn" data-act="fullscreen" aria-label="Layar penuh">' + I('maximize') + '</button><button class="icon-btn" data-act="keluar-display" aria-label="Keluar dari layar display">' + I('logout') + '</button></div>';
    }
  };
})();
