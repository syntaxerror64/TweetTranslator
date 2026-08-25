(function () {
  'use strict';
  // Thin per-site config for x.com / twitter.com (core defines the shared CONFIG).
  if (typeof CONFIG === 'undefined') return;
  CONFIG.SITE_ID = 'x';
  CONFIG.CACHE.STORAGE_KEY = 'x_translation_cache_v2';
  CONFIG.DIAGNOSTICS.STORAGE_KEY = 'x_diagnostics';
  CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH = 4;
})();
