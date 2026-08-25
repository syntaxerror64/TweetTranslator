const { test } = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');

global.CONFIG = require('../../core/config.js');
require('../../twitter/constants.js');
Object.assign(global, require('../../core/utils.js'));
const { TweetObserver, X_TWEET_TEXT_SELECTOR } = require('../../twitter/observer.js');

function setupDom(bodyHtml) {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body>' + bodyHtml + '</body></html>', {
    url: 'https://x.com/quantgz/status/2089794413228679186',
    pretendToBeVisual: true
  });
  const { window } = dom;
  global.window = window;
  global.document = window.document;
  global.Node = window.Node;
  global.MutationObserver = window.MutationObserver;
  global.getComputedStyle = window.getComputedStyle;
  global.requestAnimationFrame = window.requestAnimationFrame;
  return dom;
}

function tweetHtml(...spans) {
  return '<div data-testid="tweetText">' + spans.join('') + '</div>';
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

const activeObservers = [];
const flush = () => new Promise(r => setTimeout(r, 120));

test.afterEach(() => {
  for (const obs of activeObservers) obs.stop();
  activeObservers.length = 0;
  delete global.window;
  delete global.document;
  delete global.Node;
  delete global.MutationObserver;
  delete global.getComputedStyle;
  delete global.requestAnimationFrame;
});

test('twitter observer: whole tweet translated as a single unit, not per-span', async () => {
  setupDom(tweetHtml(
    '<span>gm just used </span>',
    '<a href="/anyswapbot"><span>@anyswapbot</span></a>',
    '<span> to fund 100 aged wallets through 19 different exchanges, funding spread over 24 hours so nobody can trace the bundle </span>',
    '<a href="https://t.co/OCtVUdrpct"><span>https://t.co/OCtVUdrpct</span></a>'
  ));
  const { translator, ui, diagnostics, cache, calls } = makeMocks();
  const obs = new TweetObserver(translator, cache, ui, diagnostics);
  activeObservers.push(obs);
  obs.start();
  await flush();
  const tweet = document.querySelector(X_TWEET_TEXT_SELECTOR);
  assert.ok(tweet, 'tweetText found');
  assert.strictEqual(calls.api, 1, 'exactly one API call for the whole tweet');
  const expected =
    'gm just used @anyswapbot to fund 100 aged wallets through 19 different exchanges, ' +
    'funding spread over 24 hours so nobody can trace the bundle https://t.co/OCtVUdrpct';
  assert.strictEqual(tweet.dataset.originalText, expected);
  assert.strictEqual(tweet.dataset.translated, 'true');
  assert.strictEqual(tweet.textContent, 'ПЕРЕВОД: ' + expected);
  assert.strictEqual(tweet.querySelector('span'), null, 'span structure replaced by a single text block');
});

test('twitter observer: URL text is preserved inside the single translated block', async () => {
  const LINK_TEXT = 'https://t.co/BTTxvitEHT';
  setupDom(tweetHtml(
    '<span>BREAKING: Moderna stock surges after announcing the first ever positive Phase 3 results for a personalized cancer vaccine </span>',
    '<a href="' + LINK_TEXT + '"><span>' + LINK_TEXT + '</span></a>'
  ));
  const { translator, ui, diagnostics, cache, calls } = makeMocks();
  const obs = new TweetObserver(translator, cache, ui, diagnostics);
  activeObservers.push(obs);
  obs.start();
  await flush();
  const tweet = document.querySelector(X_TWEET_TEXT_SELECTOR);
  assert.strictEqual(calls.api, 1);
  assert.ok(tweet.textContent.includes('ПЕРЕВОД:'));
  assert.ok(tweet.textContent.includes(LINK_TEXT), 'URL kept in the translated text');
});

test('twitter observer: russian tweet is skipped without API calls', async () => {
  setupDom(tweetHtml('<span>Это русский текст твита переводить не нужно</span>'));
  const { translator, ui, diagnostics, cache, calls } = makeMocks();
  const obs = new TweetObserver(translator, cache, ui, diagnostics);
  activeObservers.push(obs);
  obs.start();
  await flush();
  assert.strictEqual(calls.api, 0);
  const tweet = document.querySelector(X_TWEET_TEXT_SELECTOR);
  assert.notStrictEqual(tweet.dataset.translated, 'true');
});

test('twitter observer: aria-hidden and button content are excluded from the tweet text', async () => {
  setupDom(tweetHtml(
    '<span>Real tweet content that must be translated as one unit</span>',
    '<span aria-hidden="true">decorative label</span>',
    '<button><span>Show more</span></button>'
  ));
  const { translator, ui, diagnostics, cache, calls } = makeMocks();
  const obs = new TweetObserver(translator, cache, ui, diagnostics);
  activeObservers.push(obs);
  obs.start();
  await flush();
  const tweet = document.querySelector(X_TWEET_TEXT_SELECTOR);
  assert.strictEqual(calls.api, 1);
  assert.strictEqual(tweet.dataset.originalText, 'Real tweet content that must be translated as one unit');
  assert.strictEqual(tweet.textContent, 'ПЕРЕВОД: Real tweet content that must be translated as one unit');
});

test('twitter observer: multiple tweets are translated independently, one call each', async () => {
  setupDom(
    tweetHtml('<span>First tweet text with enough words to translate it</span>') +
    tweetHtml('<span>Second tweet text with enough words to translate it</span>')
  );
  const { translator, ui, diagnostics, cache, calls } = makeMocks();
  const obs = new TweetObserver(translator, cache, ui, diagnostics);
  activeObservers.push(obs);
  obs.start();
  await flush();
  assert.strictEqual(calls.api, 2);
  const tweets = document.querySelectorAll(X_TWEET_TEXT_SELECTOR);
  assert.strictEqual(tweets.length, 2);
  for (const t of tweets) assert.strictEqual(t.dataset.translated, 'true');
});