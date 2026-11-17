/**
 * Konfigurasi frontend AntriBansos Desa.
 * Ganti GAS_URL dengan URL Web App Apps Script Anda (berakhiran /exec).
 * Jangan menaruh kunci rahasia di file ini — repo GitHub Pages bersifat publik.
 */
window.APP_CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbzY4g_V-jhbQJT0uHdLuaaIWgZUKjTcTeNL1psjPKwsej-ve1gr82_YiRluZAlMTRbUxg/exec',
  POLL_MS: 4000,          // jeda polling saat tab aktif
  POLL_HIDDEN_MS: 20000,  // jeda polling saat tab tersembunyi
  TIMEOUT_MS: 30000,
  DURASI_PANGGIL_MS: 6000 // lama layar penuh "nomor + loket" ditampilkan saat memanggil (minimum; bila suara aktif, menunggu ucapan selesai)
};
