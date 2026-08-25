const { test } = require('node:test');
const assert = require('node:assert');

test('core modules expose expected contracts', () => {
  const cache = require('../../core/cache.js');
  const translator = require('../../core/translator.js');
  const utils = require('../../core/utils.js');
  const diag = require('../../core/diagnostics.js');
  const debug = require('../../core/debug.js');

  assert.strictEqual(typeof cache.LRUCache, 'function');
  assert.strictEqual(typeof translator.TranslationService, 'function');
  assert.strictEqual(typeof translator.TextPreprocessor, 'function');
  assert.strictEqual(typeof translator.CircuitBreaker, 'function');
  assert.strictEqual(typeof translator.RateLimiter, 'function');
  for (const fn of ['textHash', 'isRussianText', 'cleanTweetText', 'isMetadataText', 'collectTranslatableTextNodes', 'withTimeout']) {
    assert.strictEqual(typeof utils[fn], 'function', 'utils.' + fn);
  }
  assert.strictEqual(typeof diag.Diagnostics, 'function');
  assert.strictEqual(typeof debug.logIssue, 'function');
  assert.strictEqual(typeof debug.getIssuesSummary, 'function');
});

test('core config is a singleton shared with site constants', () => {
  const CONFIG = require('../../core/config.js');
  global.CONFIG = CONFIG;
  require('../../gmgn/constants.js');
  assert.strictEqual(CONFIG.CACHE.STORAGE_KEY, 'gmgn_translation_cache_v2');
  delete global.CONFIG;
});

test('browser-only modules are syntactically valid', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { spawnSync } = require('node:child_process');
  const root = path.resolve(__dirname, '../..');
  const files = [
    'axiom/observer.js', 'axiom/content.js', 'padre/padre-observer.js',
    'padre/content.js', 'padre/api-interceptor.js',
    'gmgn/observer.js', 'gmgn/content.js', 'gmgn/constants.js',
    'twitter/observer.js', 'twitter/content.js', 'twitter/constants.js',
    'background/service-worker.js', 'popup/popup.js'
  ];
  for (const f of files) {
    assert.ok(fs.existsSync(path.join(root, f)), 'file exists: ' + f);
    const r = spawnSync(process.execPath, ['--check', path.join(root, f)], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, 'syntax ok: ' + f + '\n' + r.stderr);
  }
});
