const { test } = require('node:test');
const assert = require('node:assert');

const { installMockChrome, uninstallMockChrome } = require('../helpers/mock-chrome.js');
const { LRUCache } = require('../../core/cache.js');

const KEY = () => global.CONFIG.CACHE.STORAGE_KEY;

test.beforeEach(() => {
  installMockChrome(null);
  global.CONFIG.CACHE.PERSIST_DEBOUNCE_MS = 5;
});
test.afterEach(() => {
  global.CONFIG.CACHE.MAX_STORAGE_ENTRIES = 8000;
  uninstallMockChrome();
});

test('flush: storage does not exceed MAX_STORAGE_ENTRIES', async () => {
  global.CONFIG.CACHE.MAX_STORAGE_ENTRIES = 50;
  const { store } = installMockChrome(null);
  const cache = new LRUCache(500);
  for (let i = 1; i <= 80; i++) cache.set('k' + i, 'v' + i);
  await cache.flushToStorage();
  const stored = store.get(KEY());
  assert.ok(stored, 'storage persisted');
  const keys = Object.keys(stored);
  assert.strictEqual(keys.length, 50, 'trimmed to MAX_STORAGE_ENTRIES');
  assert.ok(keys.includes('k80'), 'newest entry kept');
  assert.ok(!keys.includes('k1'), 'oldest entry dropped');
});

test('flush: quota exceeded trims to half and keeps future flushes working', async () => {
  global.CONFIG.CACHE.MAX_STORAGE_ENTRIES = 10;
  const { store } = installMockChrome(null);
  const cache = new LRUCache(500);
  for (let i = 1; i <= 10; i++) cache.set('k' + i, 'v' + i);

  let throwsQuota = true;
  const origSet = chrome.storage.local.set.bind(chrome.storage.local);
  chrome.storage.local.set = async (obj) => {
    if (throwsQuota) {
      throwsQuota = false;
      const err = new Error('QUOTA_BYTES quota exceeded');
      err.name = 'QuotaExceededError';
      throw err;
    }
    return origSet(obj);
  };

  await cache.flushToStorage();
  const afterQuota = Object.keys(store.get(KEY()) || {});
  assert.strictEqual(afterQuota.length, 5, 'trimmed to half of MAX_STORAGE_ENTRIES');
  assert.strictEqual(throwsQuota, false, 'quota retried');
  assert.strictEqual(cache._flushing, false, 'flushing flag released');

  cache.set('k11', 'v11');
  await cache.flushToStorage();
  assert.ok(store.get(KEY()).k11, 'flush works after quota path');
});

test('loadFromStorage: filters cached API error strings', async () => {
  const { store } = installMockChrome(null);
  store.set(KEY(), {
    ok: 'fine',
    bad: 'MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS',
    bad2: 'QUERY.LENGTH_EXCEEDS_MAX_LIMIT'
  });
  const cache = new LRUCache(100);
  await cache.loadFromStorage();
  assert.strictEqual(cache.get('ok'), 'fine');
  assert.strictEqual(cache.get('bad'), null);
  assert.strictEqual(cache.get('bad2'), null);
});

test('flush: empty pendingWrites is a no-op that clears the debounce', async () => {
  const cache = new LRUCache(10);
  cache.schedulePersist('x', '1');
  cache.pendingWrites.clear();
  await cache.flushToStorage();
  assert.strictEqual(cache.writeScheduled, false);
  assert.strictEqual(cache.pendingWrites.size, 0);
});
