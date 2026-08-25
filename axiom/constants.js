(function () {
  'use strict';
  // Thin per-site config: core/config.js already defined the shared CONFIG global.
  // Only apply code-specific overrides here (loaded right after core/config.js).
  if (typeof CONFIG === 'undefined') return;
  CONFIG.SITE_ID = 'axiom';
  CONFIG.CACHE.STORAGE_KEY = 'axiom_translation_cache_v2';
  CONFIG.DIAGNOSTICS.STORAGE_KEY = 'axiom_diagnostics';
})();
