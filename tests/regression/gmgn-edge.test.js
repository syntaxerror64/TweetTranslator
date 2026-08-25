const { test } = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');

global.CONFIG = require('../../core/config.js');
require('../../gmgn/constants.js');
Object.assign(global, require('../../core/utils.js'));
const { GmnObserver, GMN_TOOLTIP_SELECTOR, GMN_TWEET_SPAN_SELECTOR } = require('../../gmgn/observer.js');

const handle = (win) => ({
  window: win
});

function setupDom(bodyHtml, { url } = {}) {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body>' + bodyHtml + '</body></html>', {
    url: url || 'https://gmgn.ai/token/solana/abc',
    pretendToBeVisual: true
  });
  currentDom = dom;
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  global.Node = window.Node;
  global.MutationObserver = window.MutationObserver;
  global.getComputedStyle = window.getComputedStyle;
  global.requestAnimationFrame = window.requestAnimationFrame;
  return dom;
}

function spanHtml(text) {
  return '<span data-sentry-element="SafeHtml" class="font-mono">' + text + '</span>';
}

function emptyTooltipHtml(inner) {
  return '<div role="tooltip" class="pi-tooltip-container">' +
    '<div class="bg-[#15202B]"><div data-sentry-component="CollapsibleText">' + (inner || '') + '</div></div></div>';
}

function makeMocks(translateImpl) {
  const calls = { api: 0, failed: 0 };
  const translator = {
    lastUsedApi: 'mock',
    async translate(text) {
      calls.api++;
      if (translateImpl) return translateImpl(text);
      return 'ПЕРЕВОД: ' + text;
    }
  };
  const ui = {
    showTranslating() {},
    showTranslated() {},
    showFailed() { calls.failed++; }
  };
  const diagnostics = { recordTranslationSuccess() {} };
  const cache = {};
  return { translator, ui, diagnostics, cache, calls };
}

let currentDom = null;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

test.afterEach(() => {
  if (currentDom) { currentDom.window.close(); currentDom = null; }
  delete global.window;
  delete global.document;
  delete global.Node;
  delete global.MutationObserver;
  delete global.getComputedStyle;
  delete global.requestAnimationFrame;
});

test('gmgn: delays then translates span that loads into tooltip async', async () => {
  setupDom(emptyTooltipHtml(''));
  const { translator, ui, diagnostics, cache, calls } = makeMocks();
  const obs = new GmnObserver(translator, cache, ui, diagnostics);
  obs.start();
  const tooltip = document.querySelector(GMN_TOOLTIP_SELECTOR);
  assert.ok(tooltip, 'tooltip exists');
  await sleep(120);
  assert.strictEqual(calls.api, 0, 'no span yet, nothing translated');
  tooltip.querySelector('[data-sentry-component="CollapsibleText"]')
    .insertAdjacentHTML('beforeend', spanHtml('fresh tweet text just appeared here')) ;
  await sleep(700);
  const span = document.querySelector(GMN_TWEET_SPAN_SELECTOR);
  assert.ok(span, 'span processed after retry');
  assert.strictEqual(span.dataset.translated, 'true');
  assert.ok(span.textContent.indexOf('ПЕРЕВОД:') === 0);
  obs.stop();
});

test('gtk: tooltip removed before content resolves is aborted safely', async () => {
  setupDom(emptyTooltipHtml(''));
  const { translator, ui, diagnostics, cache, calls } = makeMocks();
  const obs = new GmnObserver(translator, cache, ui, diagnostics);
  obs.start();
  const tooltip = document.querySelector(GMN_TOOLTIP_SELECTOR);
  tooltip.remove();
  await sleep(700);
  assert.strictEqual(calls.api, 0, 'no translation attempt after removal');
  obs.stop();
});

test('gtk: translator returning null marks failed and is not retried', async () => {
  setupDom(emptyTooltipHtml(spanHtml('long enough english sentence here')));
  const { translator, ui, diagnostics, cache, calls } = makeMocks(() => null);
  const obs = new GmnObserver(translator, cache, ui, diagnostics);
  obs.start();
  await sleep(300);
  const span = document.querySelector(GMN_TWEET_SPAN_SELECTOR);
  assert.strictEqual(calls.api, 1);
  assert.strictEqual(calls.failed, 1, 'ui.showFailed called');
  assert.strictEqual(span.dataset.gmnTr, '1', 'marker set to skip retries');
  assert.strictEqual(span.dataset.translated, undefined);
  obs.stop();
});

test('gtk: multiple spans in one tooltip are all translated', async () => {
  setupDom(emptyTooltipHtml(spanHtml('first english sentence here') + spanHtml('second english sentence here')));
  const { translator, ui, diagnostics, cache, calls } = makeMocks();
  const obs = new GmnObserver(translator, cache, ui, diagnostics);
  obs.start();
  await sleep(120);
  const spans = document.querySelectorAll(GMN_TWEET_SPAN_SELECTOR);
  assert.strictEqual(spans.length, 2);
  assert.strictEqual(calls.api, 2);
  for (const s of spans) assert.strictEqual(s.dataset.translated, 'true');
  obs.stop();
});

test('gtk: translator throwing is caught and marked failed', async () => {
  setupDom(emptyTooltipHtml(spanHtml('sentence that will blow up on purpose')));
  const { translator, ui, diagnostics, cache, calls } = makeMocks(() => { throw new Error('boom'); });
  const obs = new GmnObserver(translator, cache, ui, diagnostics);
  obs.start();
  await sleep(300);
  const span = document.querySelector(GMN_TWEET_SPAN_SELECTOR);
  assert.strictEqual(calls.api, 1);
  assert.strictEqual(calls.failed, 1, 'failure shown via ui');
  assert.strictEqual(span.dataset.translated, undefined);
  obs.stop();
});
