const { test } = require('node:test');
const assert = require('node:assert');

const { installMockChrome, uninstallMockChrome, mockResponse } = require('../helpers/mock-chrome.js');
const { LRUCache } = require('../../core/cache.js');
const {
  TextPreprocessor, CircuitBreaker, TranslationService, RateLimitError
} = require('../../core/translator.js');

test.afterEach(() => {
  global.CONFIG.CACHE.PERSIST_DEBOUNCE_MS = 2000;
  uninstallMockChrome();
  delete global.fetch;
});

// google goes though PROXY_FETCH (handler returns { status, text }), others use global fetch.
function installCtx(proxyHandler, fetchHandler) {
  installMockChrome(proxyHandler);
  global.fetch = async (url) => fetchHandler(String(url));
  global.CONFIG.CACHE.PERSIST_DEBOUNCE_MS = 5;
  return new TranslationService(new LRUCache(100), null);
}

const GOOGLE_OK = (text) => ({ status: 200, text: JSON.stringify([[[[text]]]]) });

test('TextPreprocessor: RT prefix also becomes a placeholder', () => {
  const pp = new TextPreprocessor();
  const { cleanText, placeholders } = pp.preprocess('RT @whale: buy the dip');
  assert.ok(placeholders.some(p => /^RT @whale/.test(p)), 'RT prefix placeholder');
  assert.ok(placeholders.some(p => /buy the dip/.test(p)), 'crypto term placeholder');
  assert.ok(!cleanText.includes('buy the dip'));
});

test('translate: text with no real words (all tokens) is served without any API call', async () => {
  let direct = 0;
  const tx = installCtx(
    (url) => { throw new Error('proxy must not be called'); },
    (url) => { direct++; throw new Error('fetch must not be called'); }
  );
  const out = await tx.translate('RT @whale: $SOLO');
  assert.ok(out.includes('RT @whale'));
  assert.ok(out.includes('SOLO'));
  assert.ok(!out.includes('§'), 'no leftover placeholders');
  assert.strictEqual(direct, 0, 'no API calls for token-only tweet');
  assert.ok(tx.stats.preserved >= 2, 'preserved counter bumped');
});

test('translate: all circuit breakers open returns null and counts error', async () => {
  const tx = installCtx(() => { throw new Error('no proxy'); }, () => { throw new Error('no fetch'); });
  for (const api of tx.apis) {
    api.breaker.state = 'OPEN';
    api.breaker.lastFailureTime = Date.now();
  }
  const out = await tx.translate('people are building things right now');
  assert.strictEqual(out, null);
  assert.strictEqual(tx.stats.errors, 1);
});

test('CircuitBreaker: half-open probing and reopen transition', () => {
  const cb = new CircuitBreaker('lb', 3, 5000);
  cb.recordFailure(); cb.recordFailure(); cb.recordFailure();
  assert.strictEqual(cb.state, 'OPEN');
  assert.strictEqual(cb.isDisabled(), true, 'blocked inside reset window');
  cb.lastFailureTime = Date.now() - 6000;
  assert.strictEqual(cb.isDisabled(), false, 'first probe after reset allowed');
  assert.strictEqual(cb.state, 'HALF_OPEN');
  assert.strictEqual(cb.isDisabled(), true, 'second probe blocked while probing');
  cb.recordSuccess();
  assert.strictEqual(cb.state, 'CLOSED', 'success closes breaker');

  const cb2 = new CircuitBreaker('lb2', 3, 5000);
  for (let i = 0; i < 3; i++) cb2.recordFailure();
  cb2.lastFailureTime = Date.now() - 6000;
  cb2.isDisabled(); // -> HALF_OPEN + probe
  cb2.recordFailure();
  assert.strictEqual(cb2.state, 'OPEN', 'failure during half-open reopens');
});

test('mozhi: 500 retries with fallback engine', async () => {
  let yandexCalls = 0;
  const tx = installCtx(
    () => ({ status: 500 }),
    (url) => {
      if (url.includes('engine=yandex')) { yandexCalls++; return mockResponse({ status: 500, body: '{}' }); }
      if (url.includes('engine=duckduckgo')) return mockResponse({ status: 200, json: { 'translated-text': 'fallback ok' } });
      throw new Error('unexpected url ' + url);
    }
  );
  const api = tx.apis.find(a => a._isMozhi);
  const out = await api.translate('hello friend', new AbortController().signal);
  assert.strictEqual(out, 'fallback ok');
  assert.strictEqual(yandexCalls, 1, 'yandex tried once, then fallback engine');
});

test('mymemory: responseData match 0 with 429 marks RateLimitError', async () => {
  const tx = installCtx(() => ({ status: 500 }), () => mockResponse({
    status: 200,
    json: { responseData: { translatedText: 'x', match: 0 }, responseStatus: 429 }
  }));
  await assert.rejects(
    () => tx._myMemoryTranslate('hello world', new AbortController().signal),
    (e) => e instanceof RateLimitError
  );
});

test('lingva: rotates to next instance when the first fails', async () => {
  const saved = global.CONFIG.APIS.LINGVA.instances;
  global.CONFIG.APIS.LINGVA.instances = ['https://alpha.example', 'https://beta.example'];
  try {
    const tx = installCtx(() => ({ status: 500 }), (url) => {
      if (url.startsWith('https://beta.example')) return mockResponse({ status: 200, json: { translation: 'lingva ok' } });
      throw new Error('no translation');
    });
    const out = await tx._lingvaTranslate('bonjour', new AbortController().signal);
    assert.strictEqual(out, 'lingva ok');
  } finally {
    global.CONFIG.APIS.LINGVA.instances = saved;
    uninstallMockChrome();
    delete global.fetch;
  }
});

test('wave race: filters API-shaped error strings from results', async () => {
  const tx = installCtx(() => ({ status: 500 }), () => ({ status: 500 }));
  const bad = (val) => ({
    breaker: new CircuitBreaker('bad', 1, 50),
    translate: async () => val
  });
  const null1 = await tx._waveRace([bad('QUERY.LENGTH_EXCEEDS_MAX_LIMIT'), bad('MYMEMORY WARNING: YOU USED ALL')], 'hello');
  assert.strictEqual(null1, null, 'error-shaped texts are rejected');

  const good = {
    breaker: new CircuitBreaker('good', 5, 50),
    translate: async () => 'fine result'
  };
  const ok = await tx._waveRace([good], 'hello');
  assert.ok(ok && ok.raw === 'fine result', 'valid result wins');
});

test('queue: concurrent identical texts dedupe to a single API call', async () => {
  let proxyCalls = 0;
  const tx = installCtx(
    (url) => { proxyCalls++; return GOOGLE_OK('DUP'); },
    (url) => mockResponse({ status: 500 })
  );
  const [a, b] = await Promise.all([
    tx.translate('same sentence that is certainly unique'),
    tx.translate('same sentence that is certainly unique')
  ]);
  assert.strictEqual(a, 'DUP');
  assert.strictEqual(b, 'DUP');
  assert.strictEqual(proxyCalls, 1, 'single API call for two identical queued texts');
});

test('translate: long text is chunked and recombined', async () => {
  const tx = installCtx(
    () => GOOGLE_OK('para'),
    () => mockResponse({ status: 500 })
  );
  const longText = Array.from({ length: 40 }, (_, i) => 'sentence number ' + i + ' about the crypto market today').join('\n\n');
  const out = await tx.translate(longText);
  assert.strictEqual(out, Array.from({ length: 40 }, () => 'para').join('\n\n'));
  assert.ok(tx.stats.translated >= 40, 'chunk translations counted');
  assert.strictEqual(tx.stats.errors, 0);
});


