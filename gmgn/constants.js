(function () {
  'use strict';
  // Thin per-site config for gmgn.ai (core defines the shared CONFIG).
  if (typeof CONFIG === 'undefined') return;
  CONFIG.SITE_ID = 'gmgn';
  CONFIG.CACHE.STORAGE_KEY = 'gmgn_translation_cache_v2';
  CONFIG.DIAGNOSTICS.STORAGE_KEY = 'gmgn_diagnostics';
  CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH = 8;
})();
