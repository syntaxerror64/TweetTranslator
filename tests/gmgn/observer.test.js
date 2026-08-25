const { test } = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');

global.CONFIG = require('../../core/config.js');
require('../../gmgn/constants.js');
Object.assign(global, require('../../core/utils.js'));
const { GmnObserver, GMN_TOOLTIP_SELECTOR, GMN_TWEET_SPAN_SELECTOR } = require('../../gmgn/observer.js');

const ORIG = 'gmgn alpha group spotted new meme token';

function setupDom(bodyHtml) {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body>' + bodyHtml + '</body></html>', {
    url: 'https://gmgn.ai/token/solana/abc',
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

function tooltipHtml(text, container) {
  return '<div role="tooltip" class="pi-tooltip-container">' + (container || '') +
    '<div class="rounded-[10px] w-[300px] bg-[#15202B]">' +
    '<div data-sentry-component="CollapsibleText">' +
    '<span data-sentry-element="SafeHtml" class="font-mono">' + text + '</span>' +
    '</div></div></div>';
}

function narrativeTooltipHtml(mainText, disclaimer) {
  return '<div role="tooltip" class="pi-tooltip-container">' +
    '<div class="max-w-[420px] bg-card-100">' +
    '<div class="opacity-100">' +
    '<div class="text-[14px] leading-[22px] font-medium text-text-100">' + mainText + '</div>' +
    '<div class="text-[11px] leading-[17px] font-normal pt-[12px] text-text-400">' + disclaimer + '</div>' +
    '</div></div></div>';
}

function makeMocks() {
  const calls = { api: 0 };
  const translator = {
    lastUsedApi: 'mock',
    async translate(text) { calls.api++; return 'ПЕРЕВОД: ' + text; }
  };
  const ui = {
    showTranslating() {}, showTranslated() {}, showFailed() {}
  };
  const diagnostics = { recordTranslationSuccess() {} };
  const cache = {};
  return { translator, ui, diagnostics, cache, calls };
}

let currentDom = null;
const flush = () => new Promise(r => setTimeout(r, 120));

test.afterEach(() => {
  delete global.window;
  delete global.document;
  delete global.Node;
  delete global.MutationObserver;
  delete global.getComputedStyle;
  delete global.requestAnimationFrame;
});

test('gmgn observer: translates SafeHtml tweet span on start scan', async () => {
  setupDom(tooltipHtml(ORIG));
  const { translator, ui, diagnostics, cache, calls } = makeMocks();
  const obs = new GmnObserver(translator, cache, ui, diagnostics);
  obs.start();
  await flush();
  const span = document.querySelector(GMN_TWEET_SPAN_SELECTOR);
  assert.ok(span, 'tweet span found');
  assert.strictEqual(span.dataset.translated, 'true');
  assert.strictEqual(span.dataset.originalText, ORIG);
  assert.strictEqual(span.textContent, 'ПЕРЕВОД: ' + ORIG);
  assert.strictEqual(calls.api, 1);
  obs.stop();
});
test('gmgn observer: translates tooltip added dynamically via MutationObserver', async () => {
  setupDom('');
  const { translator, ui, diagnostics, cache } = makeMocks();
  const obs = new GmnObserver(translator, cache, ui, diagnostics);
  obs.start();
  document.body.insertAdjacentHTML('beforeend', tooltipHtml('dynamic tooltip with a long english sentence'));
  await flush();
  const span = document.querySelector(GMN_TWEET_SPAN_SELECTOR);
  assert.ok(span, 'dynamically added span found');
  assert.strictEqual(span.dataset.translated, 'true');
  assert.ok(span.textContent.indexOf('ПЕРЕВОД:') === 0);
  obs.stop();
});

test('gmgn observer: skips native Translate button and Russian text', async () => {
  setupDom(
    '<div role="tooltip" class="pi-tooltip-container">' +
    '<button><span data-sentry-element="SafeHtml" class="font-mono">Translate native button label</span></button>' +
    '<div class="bg-[#15202B]"><div data-sentry-component="CollapsibleText">' +
    '<span data-sentry-element="SafeHtml" class="font-mono">Это русский текст твита переводить не нужно</span>' +
    '</div></div></div>'
  );
  const { translator, ui, diagnostics, cache, calls } = makeMocks();
  const obs = new GmnObserver(translator, cache, ui, diagnostics);
  obs.start();
  await flush();
  assert.strictEqual(calls.api, 0, 'nothing translated');
  const spans = document.querySelectorAll(GMN_TWEET_SPAN_SELECTOR);
  for (const s of spans) assert.notStrictEqual(s.dataset.translated, 'true');
  obs.stop();
});
test('gmgn observer: does not re-translate already handled spans', async () => {
  setupDom(tooltipHtml(ORIG));
  const { translator, ui, diagnostics, cache, calls } = makeMocks();
  const obs = new GmnObserver(translator, cache, ui, diagnostics);
  obs.start();
  await flush();
  assert.strictEqual(calls.api, 1);
  document.body.insertAdjacentHTML('beforeend', tooltipHtml('another english sentence present here too'));
  await flush();
  assert.strictEqual(calls.api, 2);
  const spans = document.querySelectorAll(GMN_TWEET_SPAN_SELECTOR);
  assert.strictEqual(spans.length, 2);
  for (const s of spans) assert.strictEqual(s.dataset.translated, 'true');
  obs.stop();
});

test('gmgn observer + core UI: click toggles translation back to original and forward', async () => {
  const { TranslationUI } = require('../../core/ui.js');
  const dom = setupDom(tooltipHtml('click me to see the original text content'));
  const { translator, ui, diagnostics, cache } = makeMocks();
  const realUi = new TranslationUI();
  const obs = new GmnObserver(translator, cache, realUi, diagnostics);
  obs.start();
  await flush();
  const span = document.querySelector(GMN_TWEET_SPAN_SELECTOR);
  assert.strictEqual(span.dataset.translated, 'true');
  const original = span.dataset.originalText;
  const translated = span.dataset.translatedText;
  assert.notStrictEqual(translated, original);
  span.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, button: 0 }));
  assert.strictEqual(span.dataset.translated, 'original');
  assert.strictEqual(span.textContent, original);
  await new Promise(r => setTimeout(r, 260));
  span.dispatchEvent(new dom.window.MouseEvent('pointerdown', { bubbles: true, button: 0 }));
  assert.strictEqual(span.dataset.translated, 'true');
  assert.strictEqual(span.textContent, translated);
  obs.stop();
});

test('gmgn observer: translates narrative tooltip text blocks', async () => {
  const MAIN = 'ShiBulls posted about its army of green-capped Shiba Inu soldiers ready for battle';
  const DISCLAIMER = 'Disclaimer: AI-generated content. DYOR before investing.';
  setupDom(narrativeTooltipHtml(MAIN, DISCLAIMER));
  const { translator, ui, diagnostics, cache, calls } = makeMocks();
  const obs = new GmnObserver(translator, cache, ui, diagnostics);
  obs.start();
  await flush();
  const blocks = document.querySelectorAll('[data-gmn-tr="1"]');
  assert.strictEqual(blocks.length, 2, 'main narrative and disclaimer both translated');
  assert.strictEqual(calls.api, 2);
  const main = document.querySelector('div[class*="text-text-100"]');
  assert.strictEqual(main.dataset.translated, 'true');
  assert.strictEqual(main.textContent, 'ПЕРЕВОД: ' + MAIN);
  const disc = document.querySelector('div[class*="text-text-400"]');
  assert.strictEqual(disc.textContent, 'ПЕРЕВОД: ' + cleanTweetText(DISCLAIMER));
  obs.stop();
});

test('gmgn observer: narrative tooltip added dynamically via MutationObserver', async () => {
  setupDom('');
  const { translator, ui, diagnostics, cache } = makeMocks();
  const obs = new GmnObserver(translator, cache, ui, diagnostics);
  obs.start();
  document.body.insertAdjacentHTML('beforeend',
    narrativeTooltipHtml('dynamic narrative story about a brave bull token', 'Disclaimer: AI-generated content.'));
  await flush();
  const main = document.querySelector('div[class*="text-text-100"]');
  assert.ok(main, 'dynamic narrative block found');
  assert.strictEqual(main.dataset.translated, 'true');
  assert.ok(main.textContent.indexOf('ПЕРЕВОД:') === 0);
  obs.stop();
});

test('gmgn observer: narrative path skipped when tooltip has tweet spans', async () => {
  setupDom(tooltipHtml('tweet span text with a long english sentence present here'));
  const { translator, ui, diagnostics, cache, calls } = makeMocks();
  const obs = new GmnObserver(translator, cache, ui, diagnostics);
  obs.start();
  await flush();
  const span = document.querySelector(GMN_TWEET_SPAN_SELECTOR);
  assert.ok(span);
  assert.strictEqual(span.dataset.translated, 'true');
  assert.strictEqual(calls.api, 1, 'only the span translated, no narrative double-handling');
  obs.stop();
});

test('gmgn observer: skips short narrative blocks', async () => {
  setupDom(narrativeTooltipHtml('Short', ''));
  const { translator, ui, diagnostics, cache, calls } = makeMocks();
  const obs = new GmnObserver(translator, cache, ui, diagnostics);
  obs.start();
  await flush();
  assert.strictEqual(calls.api, 0);
  obs.stop();
});

test('gmgn observer: X card metadata divs are never translated via narrative path', async () => {
  setupDom(
    '<div role="tooltip" class="pi-tooltip-container">' +
    '<div class="flex items-center text-text-300"><a href="https://x.com/SomeHandle/status/123">Read more on X</a></div>' +
    '<div class="rounded-[10px] w-[300px] bg-[#15202B]">' +
    '<div class="flex items-center gap-1px text-text-300">@SomeHandle</div>' +
    '<div class="text-[14px] leading-[22px] font-medium text-text-100">9:26AM, Aug 18, 2026 3.8K</div>' +
    '<div class="flex items-center gap-4px text-[#8C98A6] hover:text-text-100">46 18 33 3</div>' +
    '<div data-sentry-component="CollapsibleText">' +
    '<span data-sentry-element="SafeHtml" class="font-mono">gmgn alpha group spotted new meme token</span>' +
    '</div></div></div>'
  );
  const { translator, ui, diagnostics, cache, calls } = makeMocks();
  const obs = new GmnObserver(translator, cache, ui, diagnostics);
  obs.start();
  await flush();
  assert.strictEqual(calls.api, 1, 'only the tweet span is translated');
  const span = document.querySelector(GMN_TWEET_SPAN_SELECTOR);
  assert.strictEqual(span.dataset.translated, 'true');
  const translated = document.querySelectorAll('[data-gmn-tr="1"]');
  assert.strictEqual(translated.length, 1, 'no metadata block was translated');
  const meta = document.querySelector('div[class*="text-text-300"]');
  assert.strictEqual(meta.dataset.translated, undefined);
  obs.stop();
});

test('gmgn observer: X card waits for SafeHtml span instead of translating metadata first', async () => {
  setupDom(
    '<div role="tooltip" class="pi-tooltip-container">' +
    '<a href="https://x.com/SomeHandle/status/123">Read more on X</a>' +
    '<div class="rounded-[10px] w-[300px] bg-[#15202B]">' +
    '<div class="text-[14px] leading-[22px] font-medium text-text-100">Some long english label sentence that must not be translated</div>' +
    '<div data-sentry-component="CollapsibleText"></div>' +
    '</div></div>'
  );
  const { translator, ui, diagnostics, cache, calls } = makeMocks();
  const obs = new GmnObserver(translator, cache, ui, diagnostics);
  obs.start();
  await new Promise(r => setTimeout(r, 250));
  assert.strictEqual(calls.api, 0, 'narrative block ignored while waiting for the tweet span');
  document.querySelector('[data-sentry-component="CollapsibleText"]')
    .insertAdjacentHTML('beforeend', '<span data-sentry-element="SafeHtml" class="font-mono">real tweet text arrives async here</span>');
  await new Promise(r => setTimeout(r, 1500));
  const span = document.querySelector(GMN_TWEET_SPAN_SELECTOR);
  assert.ok(span, 'async span found');
  assert.strictEqual(span.dataset.translated, 'true');
  const markerCount = document.querySelectorAll('[data-gmn-tr="1"]').length;
  assert.strictEqual(markerCount, 1, 'only the tweet span translated, metadata block untouched');
  const block = document.querySelector('div[class*="text-text-100"]');
  assert.strictEqual(block.dataset.translated, undefined);
  obs.stop();
});
