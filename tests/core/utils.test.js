const { test } = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');

const {
  textHash, isRussianText, cleanTweetText, isMetadataText,
  collectTranslatableTextNodes, getSpacedTextContent, isInsideUrlAnchor
} = require('../../core/utils.js');

function withDom(html, fn) {
  const dom = new JSDOM(html);
  const win = dom.window;
  global.document = win.document;
  global.Node = win.Node;
  global.NodeFilter = win.NodeFilter;
  global.Element = win.Element;
  global.HTMLElement = win.HTMLElement;
  global.HTMLAnchorElement = win.HTMLAnchorElement;
  try {
    return fn(win.document);
  } finally {
    delete global.document;
    delete global.Node;
    delete global.NodeFilter;
    delete global.Element;
    delete global.HTMLElement;
    delete global.HTMLAnchorElement;
  }
}

test('textHash: stable, case/whitespace insensitive', () => {
  assert.strictEqual(textHash('Hello World'), textHash('hello   world'));
  assert.strictEqual(textHash('ABC'), textHash('abc'));
  assert.notStrictEqual(textHash('a'), textHash('b'));
  assert.match(textHash('x'), /^tx_/);
});

test('isRussianText: detects cyrillic dominance', () => {
  assert.ok(isRussianText('Привет мир, как дела?'));
  assert.ok(!isRussianText('Hello world'));
  assert.ok(!isRussianText(''));
  assert.ok(!isRussianText('mix Привет world'));
});

test('cleanTweetText: strips urls, metadata, collapses spaces', () => {
  const t = cleanTweetText(`Check https://t.co/abc123
Joined March 2024
  100 followers
Great project!`);
  assert.ok(t.includes('Great project!'));
  assert.ok(!t.includes('https://'));
  assert.ok(!t.includes('Joined'));
  assert.ok(!t.includes('followers'));
});

test('isMetadataText: identifies handles/numbers/dates', () => {
  assert.ok(isMetadataText('@elonmusk'));
  assert.ok(isMetadataText('1,234'));
  assert.ok(isMetadataText('Joined March 2024'));
  assert.ok(isMetadataText('2h'));
  assert.ok(!isMetadataText('This is a real tweet message about the market'));
});

test('collectTranslatableTextNodes: extracts tweet text from popup', () => {
  const html = `
    <div class="popup">
      <span class="handle">@gmgn_ai</span>
      <span class="time">2h</span>
      <div class="tweet-text">The protocol is launching a new token with a fair launch.</div>
      <span class="meta">12 replies</span>
    </div>
  `;
  withDom(html, (doc) => {
    const root = doc.querySelector('.popup');
    const nodes = collectTranslatableTextNodes(root);
    const texts = nodes.map(n => n.text);
    assert.ok(texts.some(t => t.includes('launching a new token')), 'tweet text collected: ' + JSON.stringify(texts));
    assert.ok(!texts.some(t => t === '2h'), 'time metadata skipped');
    assert.ok(!texts.some(t => t === '12 replies'), 'engagement skipped');
  });
});

test('getSpacedTextContent: joins text nodes with spaces', () => {
  withDom('<div>Hello <b>brave</b> new <i>world</i></div>', (doc) => {
    assert.strictEqual(getSpacedTextContent(doc.querySelector('div')), 'Hello brave new world');
  });
});

test('isInsideUrlAnchor: identifies text inside link anchors', () => {
  withDom('<div>See <a href="https://x.com/user/status/1">https://x.com/status</a> now</div>', (doc) => {
    const anchor = doc.querySelector('a');
    const textNode = anchor.firstChild;
    assert.ok(isInsideUrlAnchor(textNode));
  });
});
