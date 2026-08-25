const { test } = require('node:test');
const assert = require('node:assert');

function loadBackground() {
  const SW = require.resolve('../../background/service-worker.js');
  delete require.cache[SW];
  const listeners = [];
  global.chrome = { runtime: { onMessage: { addListener: (fn) => listeners.push(fn) } } };
  require(SW);
  return listeners;
}

test('sw proxy fetch returns mapped status and text', async () => {
  let fetchOpts = null;
  global.fetch = async (url, opts) => {
    fetchOpts = opts;
    return { status: 200, text: async () => 'hello from proxy' };
  };
  const [listener] = loadBackground();
  const resp = await new Promise((resolve) => {
    const ret = listener({ type: 'PROXY_FETCH', url: 'https://example.org/x' }, {}, resolve);
    assert.strictEqual(ret, true, 'keeps message channel open');
  });
  assert.strictEqual(resp.status, 200);
  assert.strictEqual(resp.text, 'hello from proxy');
  assert.strictEqual(fetchOpts.credentials, 'omit');
  delete global.fetch;
});

test('sw proxy maps fetch failure to status zero and error', async () => {
  global.fetch = async () => { throw new Error('network down'); };
  const [listener] = loadBackground();
  const resp = await new Promise((resolve) => listener({ type: 'PROXY_FETCH', url: 'https://example.org/x' }, {}, resolve));
  assert.strictEqual(resp.status, 0);
  assert.match(resp.error, /network down/);
  delete global.fetch;
});

test('sw update stats persists to storage', async () => {
  let written = null;
  const [listener] = loadBackground();
  global.chrome.storage = { local: { set: async (obj) => { written = obj; } } };
  const resp = await new Promise((resolve) => listener({ type: 'UPDATE_STATS', stats: { translated: 3, cached: 1 } }, {}, resolve));
  assert.deepStrictEqual(resp, { ok: true });
  assert.deepStrictEqual(written.stats, { translated: 3, cached: 1 });
});


