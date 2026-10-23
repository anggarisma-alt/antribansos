/* AntriBansos Desa — inti aplikasi: router, state, polling, aksi, form, layar display. */
(function () {
  const AB = window.AB = window.AB || {};
  const { E, I, hhmm } = AB;
  const $ = s => document.querySelector(s);
  Object.assign(AB, { user: null, config: {}, state: null, rev: '', route: { name: '', sub: '' }, ui: {}, cache: {}, mode: '' });

  AB.clock = sec => new Date().toLocaleTimeString('id-ID', { hour12: false, hour: '2-digit', minute: '2-digit', second: sec ? '2-digit' : undefined }).replace(/\./g, ':');
  AB.today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  AB.tanggalPanjang = () => new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const NAV = {
    admin: [['beranda', 'Beranda', 'home'], ['antrian', 'Antrian', 'ticket'], ['terlewati', 'Terlewati', 'skip'], ['laporan', 'Laporan', 'file'], ['pengaturan', 'Pengaturan', 'sliders']],
    pendaftaran: [['ambil', 'Ambil Nomor', 'ticket']],        // hanya halaman cetak antrian
    loket: [['loket', 'Panel', 'megaphone'], ['terlewati', 'Terlewati', 'skip'], ['riwayat', 'Riwayat', 'list'], ['masal', 'Cetak', 'printer'], ['akun', 'Akun', 'user']],
    pimpinan: [['beranda', 'Dashboard', 'chart'], ['laporan', 'Laporan', 'file'], ['akun', 'Akun', 'user']],
    serahterima: [['serah', 'Serah Terima', 'gift'], ['riwayatserah', 'Riwayat', 'list'], ['akun', 'Akun', 'user']]
  };
  const halamanBoleh = () => NAV[AB.user.role].map(n => n[0]).concat(AB.user.role === 'pendaftaran' ? [] : ['akun']).concat(AB.user.role === 'admin' ? ['serah', 'riwayatserah', 'masal'] : []);

  // ---------- tema, toast, sheet ----------
  function initTheme() {
    let t = null; try { t = localStorage.getItem('ab_theme'); } catch (e) {}
    if (!t) t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', t);
  }
  function toast(msg, tipe) {
    const el = $('#toast'); el.textContent = msg; el.className = 'toast show ' + (tipe || '');
    clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), tipe === 'error' ? 5000 : 2800);
  }
  AB.toast = toast;
  function openSheet(html) {
    closeSheet();
    $('#sheet-root').innerHTML = '<div class="sheet-back"><div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>' + html + '</div></div>';
    const f = $('#sheet-root input:not([type=hidden]):not([type=checkbox]),#sheet-root select'); if (f && matchMedia('(pointer:fine)').matches) f.focus();
  }
  // Animasi masuk hanya sekali saat berpindah halaman; pembaruan data berkala tidak mengulangnya.
  function fx() { const v = $('#view'); if (!v) return; v.classList.add('fx'); setTimeout(() => v.classList.remove('fx'), 900); }
  function closeSheet() { stopScan(); clearTimeout(AB.sheetTimer); AB.sheetTimer = null; $('#sheet-root').innerHTML = ''; }

  // ---------- kerangka tampilan ----------
  function shell(mode) {
    const app = $('#app');
    document.body.classList.toggle('display', mode === 'display');
    app.classList.toggle('with-nav', mode === 'app');
    if (AB.mode === mode && $('#view')) return;
    AB.mode = mode;
    app.innerHTML = '<div id="view"></div>' + (mode === 'app' ? '<nav id="nav" class="bottom-nav" aria-label="Menu utama"></nav>' : '');
  }
  function renderNav() {
    const nav = $('#nav'); if (!nav) return;
    const tampil = NAV[AB.user.role].length > 1;                    // satu menu saja → tanpa navigasi bawah
    nav.style.display = tampil ? '' : 'none';
    document.documentElement.style.setProperty('--nav-h', tampil ? '84px' : '0px');
    if (!tampil) { nav.innerHTML = ''; return; }
    const n = AB.state ? AB.state.hitung.terlewati : 0;
    const merek = '<div class="nav-brand"><img src="icon-192.png" alt="" width="42" height="42"><span>AntriBansos<small>' + E((AB.config && AB.config.NAMA_DESA) || 'Desa') + '</small></span></div>';
    nav.innerHTML = merek + NAV[AB.user.role].map(i => '<a href="#/' + i[0] + '"' + (AB.route.name === i[0] ? ' aria-current="page"' : '') + '><span class="nav-ic">' + I(i[2]) + '</span><span>' + i[1] + '</span>' + (i[0] === 'terlewati' && n > 0 ? '<span class="badge" aria-label="' + n + ' nomor terlewati">' + n + '</span>' : '') + '</a>').join('');
  }
  function render() {
    const page = AB.pages[AB.route.name]; if (!page) return;
    shell('app');
    const y = window.scrollY;
    $('#view').innerHTML = page.render();
    document.documentElement.style.setProperty('--recent-h', page.recent ? '84px' : '0px');
    renderNav();
    window.scrollTo(0, y);
    if (page.load) page.load();
  }
  const inputAktif = () => { const a = document.activeElement; return a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'checkbox' && $('#view') && $('#view').contains(a); };
  function softRender() { if (inputAktif()) { AB.pending = true; return; } AB.pending = false; render(); }
  document.addEventListener('focusout', () => setTimeout(() => { if (AB.pending && !inputAktif()) softRender(); }, 250));

  // ---------- state & polling ----------
  const suaraCfg = () => ({ ding: AB.config.SUARA_DING, kecepatan: AB.config.SUARA_KECEPATAN, volume: AB.config.SUARA_VOLUME, format: AB.config.SUARA_FORMAT });
  function deteksiPanggilan(lama, baru) {
    if (!lama || AB.user.role !== 'loket') return;
    const f = s => (s.loket.filter(l => l.id === AB.user.loket_id)[0]) || null;
    const a = f(lama), b = f(baru);
    if (b && b.sedang && (!a || !a.sedang || a.sedang.id !== b.sedang.id || a.sedang.jumlah_panggil !== b.sedang.jumlah_panggil || a.sedang.waktu_panggil !== b.sedang.waktu_panggil)) {
      if (!Suara.muted('panel')) Suara.announce(b.sedang.no, b.nama, suaraCfg());
    }
  }
  function setState(st) {
    if (!st) return;
    const lama = AB.state; AB.state = st; AB.rev = st.rev;
    deteksiPanggilan(lama, st);
    const p = AB.pages[AB.route.name];
    if (p && p.dynamic) softRender(); else { renderNav(); if (p && p.onState) p.onState(); }
  }
  let pollT = null, polling = false, lastNetToast = 0;
  function jadwalPoll() {
    clearTimeout(pollT);
    if (!AB.user || AB.mode !== 'app' || AB.user.role === 'serahterima') return;
    pollT = setTimeout(poll, document.hidden ? APP_CONFIG.POLL_HIDDEN_MS : APP_CONFIG.POLL_MS);
  }
  async function poll() {
    if (polling || !AB.user) return;
    polling = true;
    const r = await Api.call('state', { lastRev: AB.rev });
    polling = false;
    if (r.success && r.data.changed) setState(r.data.state);
    else if (!r.success && r.code === 'NET' && Date.now() - lastNetToast > 30000) { lastNetToast = Date.now(); toast('Koneksi terputus, mencoba lagi…', 'error'); }
    jadwalPoll();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { if (AB.mode === 'app') { clearTimeout(pollT); poll(); } if (AB.mode === 'home') { clearTimeout(homeT); homePoll(); } if (AB.mode === 'display') { clearTimeout(dispT); dispPoll(); wakeLock(); } } });

  // ---------- sesi ----------
  function setSession(d) {
    AB.user = d.user; AB.config = d.config; AB.state = d.state; AB.rev = d.rev; AB.backendVersi = d.versi || 0;
    if (AB.backendVersi < AB.BACKEND_MIN) setTimeout(() => toast('Backend Apps Script belum diperbarui. Tempel ulang kode lalu Deploy → New version.', 'error'), 600);
    try { localStorage.setItem('ab_desa', d.config.NAMA_DESA || ''); } catch (e) {}
    document.title = (d.config.NAMA_DESA || 'AntriBansos') + ' — Antrian Bansos';
  }
  function logout(pesan) {
    Api.token = ''; AB.user = null; AB.state = null; AB.rev = ''; AB.cache = {}; AB.ui = {};
    clearTimeout(pollT); closeSheet();
    if (pesan) toast(pesan, 'error');
    const tujuan = pesan ? '#/login' : '#/';                 // keluar biasa → halaman awal; sesi habis → login
    if (location.hash !== tujuan) location.hash = tujuan; else go();
  }
  window.addEventListener('ab:auth', () => { if (AB.user) logout('Sesi berakhir. Silakan masuk lagi.'); });
  window.addEventListener('ab:printer', () => { const p = AB.pages[AB.route.name]; if (AB.user && p && (p.dynamic || AB.route.name === 'akun')) softRender(); if ($('#sheet-root .sheet') && $('#pm')) openSheet(AB.sheets.kiosk()); });

  // ---------- util perangkat ----------
  const lsGet = k => { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  function deviceId() {
    let v = lsGet('ab_dev');
    if (!v) { v = Math.random().toString(36).slice(2, 12) + Date.now().toString(36); try { localStorage.setItem('ab_dev', v); } catch (e) {} }
    return v;
  }
  // Pengaturan cetak: akun login memakai konfigurasi lengkap, halaman publik memakai bagian yang dikirim layar display
  AB.printCfg = () => AB.user ? AB.config : Object.assign({}, (AB.home && AB.home.cetak) || {});

  // ---------- router ----------
  function parseRoute() { const p = location.hash.replace(/^#\/?/, '').split('/'); return { name: p[0] || '', sub: p[1] || '' }; }
  function go() {
    AB.route = parseRoute();
    const nm = AB.route.name;
    if (nm !== 'display') stopDisplay();
    if (nm !== 'ambil') stopHome();
    if (nm === 'display') return startDisplay();
    if (!AB.user) {
      AB.pubName = lsGet('ab_desa');
      if (!nm || nm === 'ambil') return startHome();                // halaman awal publik: ambil nomor tanpa login
      shell('login'); $('#view').innerHTML = AB.pages.login.render(); fx(); document.documentElement.style.setProperty('--recent-h', '0px'); return;
    }
    if (!nm || halamanBoleh().concat(AB.user.role === 'admin' ? ['pengaturan'] : []).indexOf(nm) < 0) { location.replace('#/' + NAV[AB.user.role][0][0]); return; }
    if (nm === 'ambil') { clearTimeout(pollT); return startHome(); }
    AB.ui.q = nm === 'terlewati' ? (AB.ui.q || '') : '';
    window.scrollTo(0, 0); render(); fx(); jadwalPoll();
  }
  window.addEventListener('hashchange', go);

  // ---------- panggilan API dengan indikator sibuk ----------
  async function run(el, aksi, data) {
    if (el) { el.disabled = true; el.classList.add('busy'); }
    const r = await Api.call(aksi, data);
    if (el && el.isConnected) { el.disabled = false; el.classList.remove('busy'); }
    if (!r.success) { toast(r.message, 'error'); return null; }
    if (r.data && r.data.state) setState(r.data.state);
    return r.data || {};
  }
  const segarkanPrinter = () => { if ($('#sheet-root .sheet') && $('#pm')) openSheet(AB.sheets.kiosk()); else softRender(); };
  async function cetak(struk, id, ulang) {
    const r = await Printer.cetak(struk, AB.printCfg());
    if (!r.ok) toast('Gagal mencetak: ' + r.pesan, 'error');
    else if (id) Api.call(AB.user ? 'catatCetak' : 'catatCetakPublik', { id: id, ulang: !!ulang });
    return r;
  }
  async function ambilPublik(el, jalur) {
    if (el) { el.disabled = true; el.classList.add('busy'); } else toast('Mengambil nomor…');
    const r = await Api.call('ambilNomorPublik', { jalur: jalur, perangkat: deviceId(), kode: lsGet('ab_kode') });
    if (el && el.isConnected) { el.disabled = false; el.classList.remove('busy'); }
    if (!r.success) {
      if (jalur === 'K') {
        // Khusus: jangan membuka menu pengaturan perangkat dan jangan membocorkan alasan ke warga
        toast(r.code === 'RATE' || r.code === 'TUNGGU' ? r.message : 'Kategori khusus tidak tersedia di perangkat ini.', 'error');
      } else {
        toast(r.code === 'NOT_FOUND' ? 'Backend belum diperbarui. Deploy versi baru Apps Script (Manage deployments → New version).' : r.message, 'error');
        if (r.code === 'KODE') openSheet(AB.sheets.kiosk());
      }
      if (r.code === 'NONAKTIF') { clearTimeout(homeT); homePoll(); }
      return null;
    }
    return r.data;
  }
  // Satu pintu untuk tombol dan pintasan keyboard. Mencegah dua pengambilan sekaligus.
  async function ambilJalur(jalur, el) {
    if (AB.ambilSibuk) return;
    AB.ambilSibuk = true;
    try {
      const d = AB.user ? await run(el, 'ambilNomor', { jalur: jalur }) : await ambilPublik(el, jalur);
      if (!d) return;
      AB.lastStruk = { struk: d.struk, id: d.antrian.id };
      const auto = AB.printCfg().PRINTER_AUTO === '1';
      if (auto) cetak(d.struk, d.antrian.id, false);
      openSheet(AB.sheets.nomor(d, auto));
      if (auto) AB.sheetTimer = setTimeout(closeSheet, 6000);
      if (AB.mode === 'home') { clearTimeout(homeT); homePoll(); }      // segarkan hitungan antrian
    } finally { AB.ambilSibuk = false; }
  }

  // ---------- AKSI (klik) ----------
  const Actions = {
    async ambil(el) {
      if (el.dataset.confirm && !confirm(el.dataset.confirm)) return;
      return ambilJalur(el.dataset.jalur, el);
    },
    'cetak-sheet'() { if (AB.lastStruk) cetak(AB.lastStruk.struk, AB.lastStruk.id, true); },
    async batalkan(el) {
      const r = antrianById(el.dataset.id); if (!r || !confirm('Batalkan nomor ' + r.no + '?')) return;
      const d = await run(el, 'batalkan', { id: r.id }); if (d) toast(d.pesan, 'ok');
    },
    async 'panggil-next'(el) {
      const d = await run(el, 'panggilBerikutnya', { loket_id: el.dataset.loket });
      if (!d) return; if (d.kosong) toast(d.pesan); else toast('Memanggil ' + d.antrian.no, 'ok');
    },
    async ulangi(el) { const d = await run(el, 'ulangi', { id: el.dataset.id }); if (d) toast('Memanggil ulang ' + d.antrian.no, 'ok'); },
    async lewati(el) {
      const d = await run(el, 'lewati', { id: el.dataset.id }); if (!d) return;
      toast(d.dilewati + ' dilewati' + (d.antrian ? '. Memanggil ' + d.antrian.no : '.'), 'ok');
    },
    async selesai(el) {
      const d = await run(el, 'selesai', { id: el.dataset.id }); if (!d) return;
      toast(d.antrian ? d.selesai + ' selesai. Memanggil ' + d.antrian.no : d.selesai + ' selesai. Tidak ada antrian berikutnya.', 'ok');
    },
    async 'tidak-terdaftar'(el) {
      const r = antrianById(el.dataset.id); if (!r || !confirm('Tutup ' + r.no + ' sebagai tidak terdaftar?')) return;
      const d = await run(el, 'tidakTerdaftar', { id: r.id }); if (d) toast(d.pesan, 'ok');
    },
    verifikasi(el) { const a = antrianById(el.dataset.id); if (a) openSheet(AB.sheets.verifikasi(a)); },
    async tautkan(el) {
      const d = await run(el, 'tautkanPenerima', { id: el.dataset.id, penerima_id: el.dataset.pid });
      if (d) { closeSheet(); toast('Data cocok: ' + d.antrian.nama, 'ok'); }
    },
    async 'panggil-kembali'(el) { const d = await run(el, 'panggilKembali', { id: el.dataset.id }); if (d) toast('Memanggil ' + d.antrian.no, 'ok'); },
    'panggil-ke-loket'(el) { const a = antrianById(el.dataset.id); if (a) openSheet(AB.sheets.pilihLoket(a)); },
    async 'kirim-ke-loket'(el) {
      const d = await run(el, 'panggilKeLoket', { id: el.dataset.id, loket_id: el.dataset.loket });
      if (d) { closeSheet(); toast(d.pesan, 'ok'); }
    },
    async sisipkan(el) { const d = await run(el, 'sisipkan', { id: el.dataset.id }); if (d) toast(d.pesan, 'ok'); },
    tutup: closeSheet,
    'printer-sheet'() { openSheet(AB.sheets.kiosk()); },

    'toggle-mute'(el) {
      const ctx = el.dataset.ctx, m = !Suara.muted(ctx, dispData && dispData.suara);
      Suara.unlock(); Suara.setMuted(ctx, m);
      if (ctx === 'display' && dispData) { $('#view').innerHTML = AB.pages.display.render(dispData); } else softRender();
      toast(m ? 'Suara dimatikan' : 'Suara diaktifkan');
    },
    'ulang-suara'() {
      Suara.unlock();
      if (!Suara.last) { toast('Belum ada panggilan untuk diulang.'); return; }
      Suara.ulang();
    },
    'aktifkan-suara'(el) { Suara.unlock(); Suara.setMuted('display', false); const u = $('#unlock'); if (u) u.remove(); },
    'tanpa-suara'() { Suara.setMuted('display', true); const u = $('#unlock'); if (u) u.remove(); if (dispData) $('#view').innerHTML = AB.pages.display.render(dispData); },
    fullscreen() { try { document.documentElement.requestFullscreen(); } catch (e) {} },
    'keluar-display'() {
      if (!confirm('Keluar dari layar display?')) return;
      try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
      location.hash = '#/login';                  // jika sudah login, router mengarahkan ke halaman utama peran
    },
    'toggle-theme'() {
      const t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', t); try { localStorage.setItem('ab_theme', t); } catch (e) {} softRender();
    },
    logout() { if (confirm('Keluar dari aplikasi?')) logout(); },

    async 'tes-cetak'(el) {
      el.classList.add('busy'); const r = await Printer.tes(AB.printCfg()); el.classList.remove('busy');
      toast(r.ok ? (r.catatan || 'Tes cetak dikirim.') : 'Tes gagal: ' + r.pesan, r.ok ? 'ok' : 'error'); segarkanPrinter();
    },
    async 'bt-hubung'(el) {
      try { const n = await Printer.hubungkanBt(); toast('Terhubung ke ' + n, 'ok'); } catch (e) { toast(e.message || 'Gagal menghubungkan.', 'error'); } segarkanPrinter();
    },
    async 'buat-akun-serah'(el) {
      if (!confirm('Buat akun serah1–serah3 yang belum ada? Password acak akan ditampilkan SEKALI.')) return;
      const d = await run(el, 'buatAkunSerah', {}); if (!d) return;
      AB.akunBaruTeks = d.baru.map(x => x.username + ' / ' + x.password).join('\n');
      openSheet(AB.sheets.akunBaru(d)); if (AB.pages.pengaturan.load) AB.pages.pengaturan.load();
    },
    'salin-akun'() {
      if (!navigator.clipboard) { toast('Tidak bisa menyalin otomatis. Catat manual.', 'error'); return; }
      navigator.clipboard.writeText(AB.akunBaruTeks || '').then(() => toast('Daftar akun disalin.', 'ok'), () => toast('Tidak bisa menyalin. Catat manual.', 'error'));
    },
    'masal-jumlah'(el) { const i = document.querySelector('form[data-form="masal"] [name="jumlah"]'); if (i) { i.value = el.dataset.n; i.focus(); } },
    async 'masal-cetak'(el) {
      const b = AB.masalTerakhir; if (!b) return;
      const r = await Printer.cetakBanyak(AB.masalDaftar(b), AB.printCfg(), Number(el.dataset.bagian));
      if (!r.ok) { toast('Gagal mencetak: ' + r.pesan, 'error'); return; }
      el.classList.add('ok'); toast(r.total > 1 ? 'Bagian ' + (r.bagian + 1) + ' dari ' + r.total + ' dikirim ke printer.' : 'Struk dikirim ke printer.', 'ok');
    },
    'masal-buka-hasil'() { if (AB.masalTerakhir) openSheet(AB.sheets.masalHasil(AB.masalTerakhir)); },
    'scan-kamera'() { openSheet(AB.sheets.kamera('Scan QR undangan')); mulaiScan(cariUndangan); },
    'scan-penerima'() { openSheet(AB.sheets.kamera('Scan QR data penerima')); mulaiScan(masukDataQr); },
    'serah-reset'() { const k = $('#kode-undangan'); if (k) k.value = ''; AB.serah = null; AB.pages.serah.paint(); const f = $('#kode-undangan'); if (f && matchMedia('(pointer:fine)').matches) f.focus(); },
    async 'serah-konfirmasi'(el) {
      const s = AB.serah; if (!s) return;
      const d = await run(el, 'serahTerima', { penerima_id: s.penerima.id, foto: s.foto || '' });
      if (!d) return;
      toast('Serah terima tercatat: ' + d.penerima.nama, 'ok');
      if (navigator.vibrate) navigator.vibrate(80);
      const kk = $('#kode-undangan'); if (kk) kk.value = '';
      AB.serah = null; AB.pages.serah.paint(); AB.pages.serah.load();
    },
    async 'lihat-foto'(el) { const d = await run(el, 'ambilFoto', { id: el.dataset.id }); if (d) openSheet(AB.sheets.foto(d)); },
    async 'lap-serah'(el) {
      const f = document.querySelector('[data-form="laporan"]');
      const d = await run(el, 'laporanSerah', { dari: val(f, 'dari'), sampai: val(f, 'sampai') }); if (d) AB.pages.laporan.showSerah(d);
    },
    'lap-serah-csv'() {
      const d = AB.lastSerah; if (!d) return;
      unduhCsv('serah-terima-' + d.dari + '_' + d.sampai + '.csv', ['Tanggal', 'Waktu', 'NIK', 'Nama', 'Bantuan', 'Petugas', 'Ada foto'], d.rows.map(r => [r.tgl_ambil, r.waktu_serah, r.nik, r.nama, r.bantuan, r.petugas, r.ada_foto ? 'ya' : 'tidak']));
    },
    'tes-suara'() { Suara.unlock(); Suara.announce('P-012', 'Loket 1', suaraCfg()); },

    'loket-form'(el) { const l = el.dataset.id ? AB.state.loket.filter(x => x.id === el.dataset.id)[0] : null; openSheet(AB.sheets.loket(l)); },
    'user-form'(el) { const u = el.dataset.id ? (AB.cache.users || []).filter(x => x.id === el.dataset.id)[0] : null; openSheet(AB.sheets.user(u)); },
    'jenis-form'(el) { const j = el.dataset.id ? (AB.cache.jenis || []).filter(x => x.id === el.dataset.id)[0] : null; openSheet(AB.sheets.jenis(j)); },
    'penerima-form'(el) { const p = el.dataset.id ? (AB.cache.penerima || []).filter(x => x.id === el.dataset.id)[0] : null; openSheet(AB.sheets.penerima(p)); },
    async 'penerima-hapus'(el) {
      if (!confirm('Hapus data penerima ini?')) return;
      const d = await run(el, 'hapusPenerima', { id: el.dataset.id }); if (d) { closeSheet(); toast('Data dihapus.', 'ok'); AB.pages.penerima.muat(AB.ui.pHal); }
    },
    async 'jenis-hapus'(el) {
      if (!confirm('Hapus jenis bantuan ini?')) return;
      const d = await run(el, 'hapusJenis', { id: el.dataset.id }); if (d) { closeSheet(); AB.cache.jenis = d.data; AB.pages.pengaturan.load(); toast('Dihapus.', 'ok'); }
    },
    'penerima-impor'() { openSheet(AB.sheets.impor()); },
    'penerima-hal'(el) { AB.pages.penerima.muat(Number(el.dataset.h)); },

    'lap-csv'() {
      const d = AB.lastLaporan; if (!d) return;
      unduhCsv('laporan-antrian-' + d.dari + '_' + d.sampai + '.csv', ['Tanggal', 'No', 'Jalur', 'Status', 'Nama', 'Loket', 'Waktu daftar', 'Waktu panggil', 'Waktu selesai', 'Jumlah panggil'],
        d.rows.map(r => [r.tanggal, r.no, r.jalur, r.status, r.nama, r.loket, r.daftar, r.panggil, r.selesai, r.jumlah_panggil]));
    },
    async 'lap-penerima'(el) {
      const r = await run(el, 'laporanPenerima', { status: el.dataset.status }); if (!r) return;
      unduhCsv('penerima-' + (r.status === 'Sudah' ? 'sudah' : 'belum') + '-mengambil.csv', ['NIK', 'Nama', 'Alamat', 'RT', 'RW', 'Bantuan', 'Tanggal ambil'], r.rows.map(x => [x.nik, x.nama, x.alamat, x.rt, x.rw, x.bantuan, x.tgl_ambil]));
      toast(r.total + ' data diunduh.', 'ok');
    }
  };

  // ---------- perubahan (select / file) & input ----------
  const Changes = {
    async 'set-mode'(el) { const d = await run(null, 'setModeLoket', { id: el.dataset.id, mode: el.value }); if (d) toast('Mode loket diubah ke ' + el.value, 'ok'); else softRender(); },
    'printer-metode'(el) { Printer.simpanLokal({ metode: el.value }); segarkanPrinter(); },
    async logo(el) {
      const f = el.files && el.files[0]; if (!f) return;
      try {
        const url = await perkecilGambar(f, 512);
        const d = await run(null, 'uploadLogo', { dataUrl: url });
        if (d) { AB.config = d.config; toast('Logo diperbarui.', 'ok'); render(); }
      } catch (e) { toast('Gambar tidak dapat dibaca.', 'error'); }
    },
    async 'foto-serah'(el) {
      const f = el.files && el.files[0]; if (!f || !AB.serah) return;
      try { AB.serah.foto = await perkecilGambar(f, 1024, 'image/jpeg', .72); AB.pages.serah.paint(); }
      catch (e) { toast('Foto tidak dapat dibaca.', 'error'); }
    },
    csv(el) {
      const f = el.files && el.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { const rows = parseCsv(String(rd.result)).filter(r => r.some(c => String(c).trim())); impor(rows); };
      rd.readAsText(f);
    }
  };
  async function impor(rows) {
    const info = $('#impor-info');
    if (rows.length && !/^\d/.test(String(rows[0][0]).trim())) rows.shift();       // buang judul kolom
    const data = rows.map(r => ({ nik: r[0], nama: r[1], tgl_lahir: r[2], alamat: r[3], rt: r[4], rw: r[5], jenis_bantuan_id: r[6], kode_undangan: r[7] }));
    if (!data.length) { info.textContent = 'File kosong.'; return; }
    const tot = { ditambah: 0, dilewati: 0, galat: [], nGalat: 0 };
    for (let i = 0; i < data.length; i += 500) {
      info.textContent = 'Mengirim ' + Math.min(i + 500, data.length) + ' dari ' + data.length + '…';
      const r = await Api.call('importPenerima', { rows: data.slice(i, i + 500) });
      if (!r.success) { info.innerHTML = '<span class="chip danger">' + E(r.message) + '</span>'; return; }
      tot.ditambah += r.data.ditambah; tot.dilewati += r.data.dilewati; tot.nGalat += r.data.jumlah_galat; tot.galat = tot.galat.concat(r.data.galat).slice(0, 20);
    }
    info.innerHTML = '<span class="chip ok">' + tot.ditambah + ' ditambahkan</span> <span class="chip gray">' + tot.dilewati + ' duplikat dilewati</span> ' + (tot.nGalat ? '<span class="chip danger">' + tot.nGalat + ' baris bermasalah</span>' : '') +
      (tot.galat.length ? '<ul class="small">' + tot.galat.map(g => '<li>' + E(g) + '</li>').join('') + '</ul>' : '');
    AB.pages.penerima.muat(1);
  }

  document.addEventListener('input', e => {
    const t = e.target.closest('[data-input]'); if (!t) return;
    if (t.dataset.input === 'q-terlewati') { AB.ui.q = t.value; const l = $('#list'); if (l) l.innerHTML = AB.pages.terlewati.list(); }
  });
  document.addEventListener('change', e => { const t = e.target.closest('[data-change]'); if (t && Changes[t.dataset.change]) Changes[t.dataset.change](t); });
  document.addEventListener('click', e => {
    const t = e.target;
    if (t.classList && t.classList.contains('sheet-back')) return closeSheet();
    const g = t.closest('[data-go]'); if (g) { location.hash = '#/' + g.dataset.go; return; }
    const a = t.closest('[data-act]'); if (!a || a.disabled) return;
    clearTimeout(AB.sheetTimer);
    const fn = Actions[a.dataset.act]; if (fn) fn(a, e);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

  // Pintasan keyboard di halaman pengambilan nomor: p = Prioritas, u = Umum, k = Khusus.
  // Tidak aktif saat mengetik, saat jendela terbuka, atau saat pengambilan sedang diproses.
  document.addEventListener('keydown', e => {
    const ae = document.activeElement || {};
    const st = {
      inputAktif: /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName || '') || !!ae.isContentEditable,
      sheetTerbuka: !!$('#sheet-root .sheet'),
      sibuk: !!AB.ambilSibuk,
      halamanAmbil: AB.mode === 'home' || (AB.mode === 'app' && AB.route.name === 'antrian' && !!AB.user && AB.user.role === 'admin')
    };
    const j = AB.pintas(e, st); if (!j) return;
    if (j === 'K') {
      if (!AB.khususAktif()) return;
      if (!AB.user && !lsGet('ab_kode')) return;          // halaman publik tanpa kode perangkat: abaikan diam-diam
      e.preventDefault();
      if (!confirm('Terbitkan nomor KHUSUS (darurat/sakit)? Nomor ini akan dipanggil lebih dulu oleh semua loket.')) return;
      return ambilJalur('K', null);
    }
    if (!AB.user && !(AB.home && AB.home.ambil && AB.home.ambil.aktif === '1')) return;
    e.preventDefault(); ambilJalur(j, document.querySelector('[data-act="ambil"][data-jalur="' + j + '"]'));
  });

  // Tekan-tahan judul di halaman awal (±1,2 detik) membuka pengaturan printer & kode perangkat.
  // Sengaja tidak terlihat oleh warga.
  let rahasiaT = null;
  document.addEventListener('pointerdown', e => {
    const s = e.target.closest && e.target.closest('[data-secret]'); if (!s) return;
    clearTimeout(rahasiaT); rahasiaT = setTimeout(() => openSheet(AB.sheets.kiosk()), 1200);
  });
  ['pointerup', 'pointercancel', 'pointerleave', 'scroll'].forEach(ev => document.addEventListener(ev, () => clearTimeout(rahasiaT), true));
  document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('[data-secret]')) e.preventDefault(); });

  // ---------- Serah terima: pencarian undangan & scan kamera ----------
  // Teks bisa NIK, kode undangan, atau isi QR lengkap (no, nik, nama, alamat). Scan mengisi kolom NIK otomatis.
  async function cariUndangan(teks) {
    teks = String(teks || '').trim(); if (!teks) return;
    const q = AB.parseQr(teks);
    const kode = q.nik || teks;
    const inp = $('#kode-undangan'); if (inp) inp.value = q.nik || '';
    const r = await Api.call('cariUndangan', { kode: kode });
    if (!r.success) { toast(r.message, 'error'); AB.serah = null; if (AB.pages.serah.paint) AB.pages.serah.paint(); if (navigator.vibrate) navigator.vibrate([80, 60, 80]); return; }
    AB.serah = { penerima: r.data.penerima, boleh: r.data.boleh, alasan: r.data.alasan, fotoWajib: r.data.foto_wajib, foto: null, qr: q };
    AB.pages.serah.paint(); const hs = $('#serah-hasil'); if (hs && hs.scrollIntoView) hs.scrollIntoView({ block: 'start', behavior: 'smooth' });
    if (navigator.vibrate) navigator.vibrate(r.data.boleh ? 60 : [80, 60, 80]);
  }
  // Admin: data penerima dari QR undangan → formulir terisi (no, nik, nama, alamat) → periksa → simpan
  async function masukDataQr(teks) {
    const q = AB.parseQr(teks);
    if (!q.nik) { toast('QR tidak berisi NIK 16 digit yang dikenali. Isi QR: ' + String(q.mentah).slice(0, 80), 'error'); return; }
    if (!AB.cache.jenis) { const j = await Api.call('listJenis'); AB.cache.jenis = j.success ? j.data.data : []; }
    const r = await Api.call('listPenerima', { q: q.nik, halaman: 1 });
    if (!r.success) { toast(r.message, 'error'); return; }
    const ada = r.data.data.filter(x => x.nik === q.nik)[0];
    if (ada) { toast('NIK sudah terdaftar: ' + ada.nama, 'ok'); openSheet(AB.sheets.penerima(ada, { dariQr: true, sudahAda: true, mentah: q.mentah })); return; }
    openSheet(AB.sheets.penerima({ nik: q.nik, nama: q.nama, alamat: q.alamat, kode_undangan: q.no, rt: '', rw: '', jenis_bantuan_id: '', tgl_lahir: '', status_ambil: 'Belum' }, { dariQr: true, mentah: q.mentah }));
  }
  let scanStream = null, scanTimer = null;
  function stopScan() {
    clearInterval(scanTimer); scanTimer = null;
    if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
  }
  async function mulaiScan(cb) {
    const v = $('#scan-video'), info = $('#scan-info'); if (!v) return;
    try {
      if (!('BarcodeDetector' in window)) throw new Error('Browser ini belum mendukung scan kamera. Pakai scanner barcode atau ketik kodenya.');
      const fm = BarcodeDetector.getSupportedFormats ? await BarcodeDetector.getSupportedFormats() : null;
      const det = new BarcodeDetector(fm && fm.length ? { formats: fm } : undefined);
      scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
      v.srcObject = scanStream; await v.play();
      scanTimer = setInterval(async () => {
        if (!scanStream || v.readyState < 2) return;
        try {
          const hasil = await det.detect(v);
          if (hasil.length && hasil[0].rawValue) { const kode = hasil[0].rawValue; closeSheet(); cb(kode); }
        } catch (e) { /* bingkai belum siap */ }
      }, 300);
    } catch (e) { if (info) info.textContent = 'Kamera tidak dapat dibuka: ' + (e && e.message ? e.message : e); }
  }

  // ---------- FORM (submit) ----------
  const val = (f, n) => f.elements[n] ? f.elements[n].value : '';
  const Forms = {
    async login(f) {
      const err = $('#login-err'); err.style.display = 'none';
      Suara.unlock();
      const r = await Api.call('login', { username: val(f, 'username'), password: val(f, 'password') });
      if (!r.success) { err.textContent = r.message; err.style.display = 'inline-flex'; return; }
      Api.token = r.data.token;
      const b = await Api.call('bootstrap');
      if (!b.success) { err.textContent = b.message; err.style.display = 'inline-flex'; return; }
      setSession(b.data); location.hash = '#/' + NAV[AB.user.role][0][0]; go();
    },
    async dashboard(f) { const el = $('#async'); el.innerHTML = '<div class="empty">Memuat…</div>'; AB.pages.beranda.load({ dari: val(f, 'dari'), sampai: val(f, 'sampai') }); },
    async laporan(f) {
      const el = $('#async'); el.innerHTML = '<div class="empty">Memuat…</div>';
      const r = await Api.call('laporan', { dari: val(f, 'dari'), sampai: val(f, 'sampai') });
      if (r.success) AB.pages.laporan.show(r.data); else el.innerHTML = AB.empty('alert', r.message);
    },
    async config(f) {
      const nilai = {};
      f.dataset.keys.split(',').forEach(k => {
        const el = f.elements[k]; if (!el) return;
        if (k === 'KODE_KIOSK') {                         // kosong = biarkan kode lama; centang "Hapus" = hapus kode
          if (f.elements.HAPUS_KODE && f.elements.HAPUS_KODE.checked) nilai[k] = ''; else if (el.value) nilai[k] = el.value;
          return;
        }
        nilai[k] = el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value;
      });
      const d = await run(null, 'simpanConfig', { nilai: nilai });
      if (d) { AB.config = d.config; toast('Pengaturan disimpan.', 'ok'); }
    },
    async loket(f) {
      const d = await run(null, 'simpanLoket', { id: f.dataset.id, nama_loket: val(f, 'nama_loket'), mode_layanan: val(f, 'mode_layanan'), status_aktif: f.elements.status_aktif.checked ? 1 : 0 });
      if (d) { closeSheet(); toast('Loket disimpan.', 'ok'); AB.pages.pengaturan.load(); }
    },
    async user(f) {
      const d = await run(null, 'simpanUser', { id: f.dataset.id, nama: val(f, 'nama'), username: val(f, 'username'), role: val(f, 'role'), loket_id: val(f, 'loket_id'), password: val(f, 'password'), status: val(f, 'status') });
      if (d) { closeSheet(); toast('Pengguna disimpan.', 'ok'); AB.pages.pengaturan.load(); }
    },
    async penerima(f, sub) {
      const d = await run(null, 'simpanPenerima', { id: f.dataset.id, nik: val(f, 'nik'), nama: val(f, 'nama'), tgl_lahir: val(f, 'tgl_lahir'), alamat: val(f, 'alamat'), rt: val(f, 'rt'), rw: val(f, 'rw'), jenis_bantuan_id: val(f, 'jenis_bantuan_id'), kode_undangan: val(f, 'kode_undangan'), status_ambil: val(f, 'status_ambil') });
      if (d) {
        closeSheet(); toast('Data disimpan.', 'ok'); AB.pages.penerima.muat(AB.ui.pHal);
        if (sub && sub.dataset && sub.dataset.lagi) setTimeout(() => { openSheet(AB.sheets.kamera('Scan QR data penerima')); mulaiScan(masukDataQr); }, 300);   // lanjut scan beruntun
      }
    },
    async jenis(f) {
      const d = await run(null, 'simpanJenis', { id: f.dataset.id, nama_bantuan: val(f, 'nama_bantuan'), periode: val(f, 'periode'), keterangan: val(f, 'keterangan') });
      if (d) { closeSheet(); toast('Disimpan.', 'ok'); AB.pages.pengaturan.load(); }
    },
    kode(f) { try { localStorage.setItem('ab_kode', val(f, 'kode').trim()); } catch (e) {} toast('Kode disimpan di perangkat ini.', 'ok'); },
    async masal(f) {
      const jalur = (f.querySelector('input[name="jalur"]:checked') || {}).value, jumlah = Number(val(f, 'jumlah'));
      if (!jalur) { toast('Pilih kategori antrian.', 'error'); return; }
      if (!isFinite(jumlah) || jumlah < 1 || Math.floor(jumlah) !== jumlah) { toast('Isi jumlah struk dengan bilangan bulat minimal 1.', 'error'); return; }
      const nama = { P: 'PRIORITAS', U: 'UMUM', K: 'KHUSUS (darurat/sakit)' }[jalur];
      if (!confirm('Terbitkan ' + jumlah + ' nomor ' + nama + '? Nomor melanjutkan antrian yang sudah ada dan langsung masuk antrian.' + (jalur === 'K' ? ' Nomor KHUSUS dipanggil lebih dulu oleh semua loket.' : ''))) return;
      if (AB.ambilSibuk) return;
      AB.ambilSibuk = true;
      try {
        const d = await run(null, 'ambilNomorMasal', { jalur: jalur, jumlah: jumlah }); if (!d) return;
        AB.masalTerakhir = { jalur: d.jalur, jumlah: d.jumlah, dari: d.dari, sampai: d.sampai, template: d.template, items: d.items };
        openSheet(AB.sheets.masalHasil(AB.masalTerakhir));
        if (AB.printCfg().PRINTER_AUTO === '1') Printer.cetakBanyak(AB.masalDaftar(AB.masalTerakhir), AB.printCfg(), 0).then(r => { if (!r.ok) toast('Gagal mencetak: ' + r.pesan, 'error'); });
        softRender();                                         // perbarui "Berikutnya …" pada halaman
      } finally { AB.ambilSibuk = false; }
    },
    'cari-undangan'(f) { return cariUndangan(val(f, 'kode')); },
    'qr-penerima'(f) { const t = val(f, 'teks'); f.reset(); return masukDataQr(t); },
    'cari-penerima'(f) { AB.ui.pq = val(f, 'q').trim(); AB.pages.penerima.muat(1); },
    async 'cari-nik'(f) {
      const box = $('#hasil'); box.innerHTML = '<p class="muted">Mencari…</p>';
      const r = await Api.call('cariPenerima', { q: val(f, 'q') });
      box.innerHTML = r.success ? AB.sheets.hasil(r.data.hasil, f.dataset.id) : '<p class="chip danger">' + E(r.message) + '</p>';
    },
    async password(f) {
      const d = await run(null, 'gantiPassword', { password_lama: val(f, 'password_lama'), password_baru: val(f, 'password_baru') });
      if (d) { f.reset(); toast('Password diganti.', 'ok'); }
    }
  };
  document.addEventListener('submit', e => {
    const f = e.target.closest('[data-form]'); if (!f) return;
    e.preventDefault();
    const fn = Forms[f.dataset.form]; if (!fn) return;
    const b = f.querySelector('button:not([type=button])'); if (b) { b.disabled = true; b.classList.add('busy'); }
    Promise.resolve(fn(f, e.submitter)).finally(() => { if (b && b.isConnected) { b.disabled = false; b.classList.remove('busy'); } });
  });

  // ---------- util: CSV, gambar ----------
  function parseCsv(t) {
    t = t.replace(/^\uFEFF/, '');
    const delim = (t.split('\n')[0].match(/;/g) || []).length > (t.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c !== '\r') cur += c;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }
  function unduhCsv(nama, kepala, baris) {
    const esc = v => { let s = String(v == null ? '' : v); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const isi = '\uFEFF' + [kepala].concat(baris).map(r => r.map(esc).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([isi], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = nama; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function perkecilGambar(file, maks, tipe, kualitas) {
    return new Promise((res, rej) => {
      const img = new Image(), u = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, maks / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
        res(c.toDataURL(tipe || (file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'), kualitas || .9));
      };
      img.onerror = rej; img.src = u;
    });
  }

  // ---------- HALAMAN AWAL (ambil nomor) ----------
  let homeT = null, homeRev = '';
  function paintHome() { if (AB.mode === 'home' && $('#view')) $('#view').innerHTML = AB.pages.ambil.render(); }
  function startHome() {
    AB.mode = ''; shell('home'); AB.mode = 'home';
    clearTimeout(homeT); homeRev = ''; AB.homeErr = '';
    document.documentElement.style.setProperty('--nav-h', '0px'); document.documentElement.style.setProperty('--recent-h', '84px');
    paintHome(); fx(); window.scrollTo(0, 0); homePoll();
  }
  function stopHome() { if (AB.mode !== 'home') return; clearTimeout(homeT); AB.mode = ''; }
  async function homePoll() {
    if (AB.mode !== 'home') return;
    const r = await Api.display(homeRev);
    if (AB.mode !== 'home') return;
    if (r.success && r.data.changed) { AB.home = r.data; homeRev = r.data.rev; AB.homeErr = ''; document.title = r.data.desa + ' — Ambil Nomor Antrian'; paintHome(); }
    else if (!r.success) { AB.homeErr = r.message; if (!AB.home) paintHome(); }
    homeT = setTimeout(homePoll, r.success ? (document.hidden ? APP_CONFIG.POLL_HIDDEN_MS : APP_CONFIG.POLL_MS + 1000) : 8000);
  }

  // ---------- LAYAR DISPLAY (publik, tanpa login) ----------
  let dispT = null, dispRev = '', dispData = null, dispClock = null, wl = null;
  async function wakeLock() { try { if (navigator.wakeLock && !document.hidden) wl = await navigator.wakeLock.request('screen'); } catch (e) {} }
  function startDisplay() {
    AB.mode = ''; shell('display'); AB.mode = 'display';
    clearTimeout(dispT); dispRev = ''; dispData = null;
    $('#view').innerHTML = '<div class="disp"><div class="empty" style="margin:auto;color:#fff">Memuat layar antrian…</div></div>';
    clearInterval(dispClock); dispClock = setInterval(() => { const c = $('#clock'); if (c) c.textContent = AB.clock(true); }, 1000);
    wakeLock(); dispPoll();
  }
  function stopDisplay() {
    if (AB.mode !== 'display') return;
    clearTimeout(dispT); clearInterval(dispClock); try { wl && wl.release(); } catch (e) {} AB.mode = '';
    const u = $('#unlock'); if (u) u.remove();
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
    document.body.classList.remove('display');
  }
  async function dispPoll() {
    if (AB.mode !== 'display') return;
    const r = await Api.display(dispRev);
    if (AB.mode !== 'display') return;
    if (r.success && r.data.changed) onDisplay(r.data);
    else if (!r.success && !dispData) $('#view').innerHTML = '<div class="disp"><div class="empty" style="margin:auto;color:#fff">' + E(r.message) + '<br><small>Mencoba lagi…</small></div></div>';
    dispT = setTimeout(dispPoll, r.success ? (document.hidden ? APP_CONFIG.POLL_HIDDEN_MS : APP_CONFIG.POLL_MS) : 8000);
  }
  function onDisplay(d) {
    const lama = dispData; dispData = d; dispRev = d.rev;
    document.title = d.desa + ' — Layar Antrian';
    $('#view').innerHTML = AB.pages.display.render(d);
    if (!lama) {
      fx();
      if (!Suara.muted('display', d.suara) && !Suara.unlocked) {
        const u = document.createElement('div'); u.className = 'unlock'; u.id = 'unlock';
        u.innerHTML = '<div><p style="font-size:1.3rem;margin-bottom:18px">Sentuh layar sekali untuk mengaktifkan suara panggilan.</p><button class="btn ok" data-act="aktifkan-suara">' + I('volume') + 'Aktifkan Suara</button><p style="margin-top:14px"><button class="btn ghost" data-act="tanpa-suara">Tanpa suara</button></p></div>';
        document.body.appendChild(u);
      }
      return;                                    // jangan mengumumkan keadaan awal
    }
    d.loket.forEach(l => {
      const p = lama.loket.filter(x => x.id === l.id)[0];
      if (l.nomor && (!p || p.nomor !== l.nomor || p.jumlah_panggil !== l.jumlah_panggil || p.waktu_panggil !== l.waktu_panggil)) {
        const el = document.querySelector('.dcard[data-lid="' + l.id + '"]'); if (el) el.classList.add('flash');
        if (!Suara.muted('display', d.suara)) Suara.announce(l.nomor, l.nama, d.suara);
      }
    });
  }

  // ---------- mulai ----------
  async function init() {
    initTheme();
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
    if (parseRoute().name === 'display') return go();
    if (!Api.configured()) {
      $('#app').innerHTML = '<div class="body" style="padding-top:20vh"><div class="card stack"><h2>Aplikasi belum dikonfigurasi</h2><p>Buka <b>js/config.js</b> lalu isi <b>GAS_URL</b> dengan URL Web App Apps Script (berakhiran <code>/exec</code>).</p></div></div>';
      return;
    }
    if (Api.token) {
      const r = await Api.call('bootstrap');
      if (r.success) setSession(r.data);
      else if (r.code === 'NET') { $('#app').innerHTML = '<div class="body" style="padding-top:20vh"><div class="card stack"><h2>Tidak ada koneksi</h2><p>' + E(r.message) + '</p><button class="btn block" onclick="location.reload()">Coba lagi</button></div></div>'; return; }
      else Api.token = '';
    }
    go();
  }
  init();
})();
