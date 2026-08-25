(function () {
  'use strict';
  // Thin per-site config: core already defined the shared CONFIG.
  if (typeof CONFIG === 'undefined') return;
  CONFIG.SITE_ID = 'padre';
  CONFIG.CACHE.STORAGE_KEY = 'padre_translation_cache_v2';
  CONFIG.DIAGNOSTICS.STORAGE_KEY = 'padre_diagnostics';
})();
