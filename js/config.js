/**
 * Konfigurasi frontend AntriBansos Desa.
 * Ganti GAS_URL dengan URL Web App Apps Script Anda (berakhiran /exec).
 * Jangan menaruh kunci rahasia di file ini — repo GitHub Pages bersifat publik.
 */
window.APP_CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbwg9G90zcFGxNIZBs1Jn47dsA-duRELi948SpSaEVaav4UZi5Bvl62pL4GGSR9uP5sV0A/exec',
  POLL_MS: 4000,          // jeda polling saat tab aktif
  POLL_HIDDEN_MS: 20000,  // jeda polling saat tab tersembunyi
  TIMEOUT_MS: 30000
};
