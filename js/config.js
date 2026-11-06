/**
 * Konfigurasi frontend AntriBansos Desa.
 * Ganti GAS_URL dengan URL Web App Apps Script Anda (berakhiran /exec).
 * Jangan menaruh kunci rahasia di file ini — repo GitHub Pages bersifat publik.
 */
window.APP_CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbzEolgdl4_PN8IRu91DtGePTHZ02uvbnY3A21hyoakm5WCAQnhjZhKFVdBpZTGI4JaCTA/exec',
  POLL_MS: 4000,          // jeda polling saat tab aktif
  POLL_HIDDEN_MS: 20000,  // jeda polling saat tab tersembunyi
  TIMEOUT_MS: 30000
};
