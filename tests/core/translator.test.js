const { test } = require('node:test');
const assert = require('node:assert');

const { installMockChrome, uninstallMockChrome, mockResponse } = require('../helpers/mock-chrome.js');
const { LRUCache } = require('../../core/cache.js');
const {
  TextPreprocessor, RateLimiter, CircuitBreaker, TranslationService
} = require('../../core/translator.js');

test.afterEach(() => {
  uninstallMockChrome();
  delete global.fetch;
});

function installFetch(handler) {
  global.fetch = async (url, opts) => {
    const resp = await handler(String(url), opts);
    return resp;
  };
}

// handler: (url) -> Promise<ResponseLike>; google goes through PROXY_FETCH.
function mockForGoogle(results, onProxy) {
  installMockChrome(async (url) => {
    if (onProxy) onProxy(url);
    return results(url);
  });
  installFetch(async () => mockResponse({ status: 500, body: '{}' }));
}

test('TextPreprocessor: crypto terms are preserved as placeholders', () => {
  const pp = new TextPreprocessor();
  const { cleanText, placeholders } = pp.preprocess('Buy the dip, then rug pull the weak hands');
  assert.strictEqual(placeholders.length, 3);
  assert.ok(!cleanText.includes('rug pull'), 'term replaced by placeholder');
  assert.ok(placeholders.some(p => p.includes('rug pull')));

  const restored = pp.postprocess('Купи просадку, потом §2§', placeholders);
  assert.ok(restored.includes('rug pull'));
});

test('RateLimiter: allows up to max then blocks', async () => {
  const rl = new RateLimiter(2, 1000);
  assert.ok(rl.canProceed());
  rl.record();
  assert.ok(rl.canProceed());
  rl.record();
  assert.ok(!rl.canProceed());
});

test('CircuitBreaker: opens after threshold, resets on success', () => {
  const cb = new CircuitBreaker('test', 2, 5000);
  cb.recordFailure();
  cb.recordFailure();
  assert.ok(cb.isDisabled());
  cb.recordSuccess();
  assert.ok(!cb.isDisabled());
});

test('translate: Google path returns translation and caches', async () => {
  let proxyCalls = 0;
  mockForGoogle((url) => {
    proxyCalls++;
    if (url.includes('googleapis.com')) {
      return { status: 200, text: JSON.stringify([[[['Привет мир']]]]) };
    }
    return { status: 500 };
  });

  const cache = new LRUCache(100);
  const tx = new TranslationService(cache, null);
  const r1 = await tx.translate('hello world from the test');
  assert.strictEqual(r1, 'Привет мир');
  assert.strictEqual(tx.stats.translated, 1);

  const before = proxyCalls;
  const r2 = await tx.translate('hello world from the test');
  assert.strictEqual(r2, 'Привет мир');
  assert.strictEqual(proxyCalls, before, 'cached hit must not call API again');
  assert.strictEqual(tx.stats.cached, 1);
});

test('translate: falls back from Google to Mozhi on failure', async () => {
  mockForGoogle((url) => ({ status: 500 }));
  installFetch(async (url) =>
    url.includes('mozhi')
      ? mockResponse({ status: 200, json: { 'translated-text': 'Мозхи-перевод' } })
      : mockResponse({ status: 500 }));
  const cache = new LRUCache(100);
  const tx = new TranslationService(cache, null);
  const r = await tx.translate('people are building things today');
  assert.strictEqual(r, 'Мозхи-перевод');
  assert.ok(tx.stats.translated >= 1);
});

test('translate: all APIs rate-limited returns null and counts error', async () => {
  mockForGoogle((url) => ({ status: 429 }));
  installFetch(async (url) => mockResponse({ status: 429 }));

  const cache = new LRUCache(100);
  const tx = new TranslationService(cache, null);
  const r = await tx.translate('anything at all here');
  assert.strictEqual(r, null);
  assert.strictEqual(tx.stats.errors, 1);
});
