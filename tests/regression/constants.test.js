const { test } = require('node:test');
const assert = require('node:assert');

const CONFIG = require('../../core/config.js');

// Thin per-site constants mutate the shared CONFIG (same pattern as in browser:
// core/config.js defines CONFIG, then site/constants.js overrides keys).
test('site constants: each site keeps its own cache storage key', () => {
  global.CONFIG = CONFIG;
  require('../../axiom/constants.js');
  assert.strictEqual(CONFIG.CACHE.STORAGE_KEY, 'axiom_translation_cache_v2');
  assert.strictEqual(CONFIG.DIAGNOSTICS.STORAGE_KEY, 'axiom_diagnostics');

  require('../../padre/constants.js');
  assert.strictEqual(CONFIG.CACHE.STORAGE_KEY, 'padre_translation_cache_v2');
  assert.strictEqual(CONFIG.DIAGNOSTICS.STORAGE_KEY, 'padre_diagnostics');

  require('../../gmgn/constants.js');
  assert.strictEqual(CONFIG.CACHE.STORAGE_KEY, 'gmgn_translation_cache_v2');
  assert.strictEqual(CONFIG.DIAGNOSTICS.STORAGE_KEY, 'gmgn_diagnostics');
  delete global.CONFIG;
});

test('config contract: required keys used by core modules are present', () => {
  const apis = CONFIG.APIS;
  for (const name of ['GOOGLE', 'MOZHI', 'SIMPLYTRANSLATE', 'LINGVA', 'MYMEMORY']) {
    assert.ok(apis[name], 'missing API config: ' + name);
    assert.ok(Number.isFinite(apis[name].timeout), name + '.timeout');
  }
  assert.ok(Array.isArray(apis.MOZHI.instances) && apis.MOZHI.instances.length > 0, 'MOZHI.instances');
  assert.ok(Array.isArray(apis.LINGVA.instances) && apis.LINGVA.instances.length > 0, 'LINGVA.instances');
  assert.ok(Number.isInteger(apis.MOZHI.breakerThreshold), 'MOZHI.breakerThreshold');
  assert.ok(Number.isInteger(apis.GOOGLE.breakerThreshold), 'GOOGLE.breakerThreshold');
  assert.ok(apis.MOZHI.fallbackEngine, 'MOZHI.fallbackEngine');

  assert.ok(Number.isInteger(CONFIG.CACHE.MAX_MEMORY_ENTRIES), 'CACHE.MAX_MEMORY_ENTRIES');
  assert.ok(Number.isInteger(CONFIG.CACHE.MAX_STORAGE_ENTRIES), 'CACHE.MAX_STORAGE_ENTRIES');
  assert.ok(CONFIG.CACHE.STORAGE_KEY, 'CACHE.STORAGE_KEY');
  assert.ok(Number.isInteger(CONFIG.QUEUE.MAX_CONCURRENCY), 'QUEUE.MAX_CONCURRENCY');
  assert.ok(Number.isInteger(CONFIG.QUEUE.RATE_LIMIT_MAX), 'QUEUE.RATE_LIMIT_MAX');

  assert.ok(Array.isArray(CONFIG.CRYPTO_PRESERVE.MULTI_WORD) && CONFIG.CRYPTO_PRESERVE.MULTI_WORD.length > 30, 'CRYPTO_PRESERVE.MULTI_WORD');
  assert.ok(Array.isArray(CONFIG.CRYPTO_PRESERVE.SINGLE_WORD) && CONFIG.CRYPTO_PRESERVE.SINGLE_WORD.length > 30, 'CRYPTO_PRESERVE.SINGLE_WORD');

  assert.ok(Number.isInteger(CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH), 'DETECTION.MIN_TWEET_TEXT_LENGTH');
  assert.ok(CONFIG.DIAGNOSTICS.STORAGE_KEY, 'DIAGNOSTICS.STORAGE_KEY');
});
