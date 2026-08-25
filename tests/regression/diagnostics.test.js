const { test } = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');
const { installMockChrome, uninstallMockChrome } = require('../helpers/mock-chrome.js');
const { Diagnostics } = require('../../core/diagnostics.js');

test.afterEach(() => uninstallMockChrome());

function withDiag(fn) {
  const d = new Diagnostics();
  d.sessionStart = Date.now();
  try {
    return fn(d);
  } finally {
    if (d._saveTimer) clearTimeout(d._saveTimer);
  }
}

test('recordTranslationSuccess/Failure update stats and history', () => {
  withDiag((d) => {
    d.recordTranslationSuccess('hello world', 'Привет', 'Google Translate', 120);
    d.recordTranslationFailure('hello world', new Error('HTTP 500'), 'Mozhi');
    assert.strictEqual(d.detectionStats.translated, 1);
    assert.strictEqual(d.detectionStats.failed, 1);
    assert.strictEqual(d.apiHistory.length, 2);
    assert.strictEqual(d.apiHistory[0].success, true);
    assert.strictEqual(d.apiHistory[1].success, false);
    assert.strictEqual(d.apiHistory[1].error, 'HTTP 500');
  });
});

test('generateReport: detection rate and api reliability math', () => {
  const dom = new JSDOM('<div>miss</div>');
  const node = dom.window.document.querySelector('div');
  withDiag((d) => {
    d.recordDetectionSuccess({ textContent: 'first popup' }, ['handle']);
    d.recordDetectionMiss(node);
    d.recordDetectionSuccess({ textContent: 'second popup' }, ['joined']);
    d.recordTranslationSuccess('a', 'b', 'Google Translate', 100);
    d.recordTranslationSuccess('c', 'd', 'Google Translate', 300);
    d.recordTranslationFailure('e', new Error('boom'), 'Mozhi');
    const r = d.generateReport();
    assert.strictEqual(r.detection.detected, 2);
    assert.strictEqual(r.detection.totalPopups, 3);
    assert.strictEqual(r.detection.detectionRate, '67%');
    assert.strictEqual(r.apiReliability['Google Translate'].total, 2);
    assert.strictEqual(r.apiReliability['Google Translate'].successRate, 100);
    assert.strictEqual(r.apiReliability['Google Translate'].avgDuration, 200);
    assert.strictEqual(r.apiReliability.Mozhi.successRate, 0);
    assert.strictEqual(r.recentMisses.length, 1);
    assert.strictEqual(r.recentMisses[0].tagName, 'DIV');
  });
  dom.window.close();
});

test('events are capped at DIAG_MAX_EVENTS', () => {
  withDiag((d) => {
    for (let i = 0; i < 400; i++) d._log('spam', { i });
    assert.ok(d.events.length <= 300, 'events bounded, got ' + d.events.length);
    assert.strictEqual(d.events[0].type, 'spam');
  });
});

test('reset clears stats and storage', async () => {
  const { store } = installMockChrome(null);
  const d = new Diagnostics();
  d.sessionStart = Date.now();
  try {
    d.recordTranslationSuccess('a', 'b', 'ok', 1);
    await d.reset();
    assert.strictEqual(d.detectionStats.translated, 0);
    assert.strictEqual(d.events.length, 0);
    assert.strictEqual(d.apiHistory.length, 0);
    assert.strictEqual(store.get(global.CONFIG.DIAGNOSTICS.STORAGE_KEY), undefined);
  } finally {
    if (d._saveTimer) clearTimeout(d._saveTimer);
  }
});

