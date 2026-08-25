const { test } = require('node:test');
const assert = require('node:assert');

const { installMockChrome, uninstallMockChrome } = require('../helpers/mock-chrome.js');
const { LRUCache } = require('../../core/cache.js');

test.beforeEach(() => {
  installMockChrome(null);
  global.CONFIG.CACHE.PERSIST_DEBOUNCE_MS = 5;
});

test.afterEach(() => {
  uninstallMockChrome();
});

test('LRU: evicts least recently used', () => {
  const cache = new LRUCache(3);
  cache.set('a', '1');
  cache.set('b', '2');
  cache.set('c', '3');
  cache.get('a'); // touch a -> a most recent, b oldest
  cache.set('d', '4');
  assert.strictEqual(cache.get('b'), null);
  assert.strictEqual(cache.get('a'), '1');
  assert.strictEqual(cache.size, 3);
});

test('LRU: get returns null for missing, refreshes recency', () => {
  const cache = new LRUCache(2);
  cache.set('a', '1');
  cache.set('b', '2');
  cache.get('a');
  cache.set('c', '3');
  assert.strictEqual(cache.get('b'), null);
  assert.strictEqual(cache.get('a'), '1');
});

test('LRU: filters known API error responses', () => {
  const cache = new LRUCache(5);
  cache.set('bad', 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS');
  cache.set('good', 'Привет мир');
  assert.strictEqual(cache.get('bad'), null);
  assert.strictEqual(cache.get('good'), 'Привет мир');
});

test('LRU: loadFromStorage + flushToStorage persistence', async () => {
  const { store } = installMockChrome(null);
  const cache = new LRUCache(100);
  cache.set('k1', 'v1');
  cache.set('k2', 'v2');
  await cache.flushToStorage();

  const saved = store.get(CONFIG_CACHE_KEY());
  assert.ok(saved, 'storage has persisted cache');
  assert.strictEqual(saved.k1, 'v1');
  assert.strictEqual(saved.k2, 'v2');

  const cache2 = new LRUCache(100);
  await cache2.loadFromStorage();
  assert.strictEqual(cache2.get('k1'), 'v1');
  assert.strictEqual(cache2.get('k2'), 'v2');
});

test('LRU: clear wipes memory and storage', async () => {
  const { store } = installMockChrome(null);
  const cache = new LRUCache(10);
  cache.set('a', '1');
  await cache.flushToStorage();
  await cache.clear();
  assert.strictEqual(cache.size, 0);
  assert.strictEqual(store.get(CONFIG_CACHE_KEY()), undefined);
});

test('LRU: version upgrade clears stale cache', async () => {
  const { store } = installMockChrome(null);
  const versionKey = CONFIG_CACHE_KEY() + '_version';
  store.set(versionKey, '0.9.0');
  store.set(CONFIG_CACHE_KEY(), { stale: 'old' });

  const cache = new LRUCache(10);
  await cache.loadFromStorage();
  assert.strictEqual(store.get(versionKey), '1.0.0');
  assert.strictEqual(store.get(CONFIG_CACHE_KEY()), undefined);
  assert.strictEqual(cache.size, 0);
});

function CONFIG_CACHE_KEY() {
  return global.CONFIG.CACHE.STORAGE_KEY;
}
