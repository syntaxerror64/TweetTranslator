// Shared test helpers: install a mocked chrome (storage + runtime) and fetch into global.
'use strict';

const CONFIG = require('../../core/config.js');

global.CONFIG = CONFIG;
global.window = global.window || globalThis;

/**
 * @param {(url: string) => Promise<{ok?: boolean, status?: number, json?: () => Promise<any>, text?: () => Promise<string>}>} fetchImpl
 * @param {{version?: string}} [opts]
 */
function installMockChrome(fetchImpl, opts = {}) {
  const store = new Map();

  const storage = {
    local: {
      async get(keys) {
        const list = typeof keys === 'string' ? [keys] : (Array.isArray(keys) ? keys : Object.keys(keys || {}));
        const out = {};
        for (const k of list) {
          if (store.has(k)) out[k] = store.get(k);
        }
        return out;
      },
      async set(obj) {
        for (const [k, v] of Object.entries(obj || {})) store.set(k, v);
      },
      async remove(keys) {
        const list = typeof keys === 'string' ? [keys] : keys || [];
        for (const k of list) store.delete(k);
      }
    }
  };

  const runtime = {
    id: 'test-extension-id',
    lastError: null,
    getManifest: () => ({ version: opts.version || '1.0.0' }),
    sendMessage(msg, cb) {
      if (msg && msg.type === 'PROXY_FETCH' && fetchImpl) {
        Promise.resolve()
          .then(() => fetchImpl(msg.url))
          .then(resp => cb(resp))
          .catch(err => cb({ error: err && err.message ? err.message : String(err) }));
      } else {
        cb({ ok: true });
      }
      return Promise.resolve();
    }
  };

  global.chrome = { storage, runtime };
  return { store, storage, runtime };
}

function uninstallMockChrome() {
  delete global.chrome;
  delete global.fetch;
}

/**
 * Minimal fetch Response-like object that the translator code expects.
 */
function mockResponse({ status = 200, body = null, json = null, text = null }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: json ? () => Promise.resolve(json) : (body ? () => Promise.resolve(JSON.parse(body)) : () => Promise.reject(new Error('no body'))),
    text: text ? () => Promise.resolve(text) : () => Promise.resolve(String(body || ''))
  };
}

module.exports = { installMockChrome, uninstallMockChrome, mockResponse, CONFIG };
