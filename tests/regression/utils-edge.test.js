const { test } = require('node:test');
const assert = require('node:assert');
const { JSDOM } = require('jsdom');

const {
  textHash, isMetadataText, cleanTweetText, isInsideUrlAnchor, collectTranslatableTextNodes
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
    dom.window.close();
  }
}

test('textHash: collapses interior whitespace and is case-insensitive', () => {
  assert.strictEqual(textHash('hello   world'), textHash('hello world'));
  assert.strictEqual(textHash('HeLLo'), textHash('hello'));
  assert.strictEqual(textHash(''), textHash(''));
  assert.notStrictEqual(textHash('a'), textHash('aa'));
  assert.notStrictEqual(textHash('hello world'), textHash('hello  world!'));
});

test('isMetadataText: positive cases for time/toggle/month/year', () => {
  assert.ok(isMetadataText('2:30 PM'), 'timestamp');
  assert.ok(isMetadataText('Hide translation'), 'toggle');
  assert.ok(isMetadataText('Show translation'), 'toggle show');
  assert.ok(isMetadataText('March 2024'), 'month year');
  assert.ok(isMetadataText('1,234'), 'number');
  assert.ok(isMetadataText('Replying to @elonmusk'), 'replying to');
  assert.ok(isMetadataText('See profile'), 'see profile');
});

test('isMetadataText: negative cases stay translatable', () => {
  assert.ok(!isMetadataText('The protocol is launching a new token with a fair launch'));
  assert.ok(!isMetadataText('Great run on the charts today by far'));
  assert.ok(!isMetadataText('Just bought more bags and holding'));
});

test('cleanTweetText: strips timestamp, views, wallets, community labels', () => {
  const t = cleanTweetText('Let me know your thoughts\n2:30 PM · Feb 4, 2024\n117.5K views\n0x1234567890abcdef1234567890abcdef12345678\nView community');
  assert.ok(t.includes('Let me know your thoughts'), 'core kept: ' + t);
  assert.ok(!t.includes('2:30 PM'), 'timestamp removed');
  assert.ok(!t.includes('views'), 'views removed');
  assert.ok(!t.includes('0x1234'), 'wallet removed');
  assert.ok(!t.includes('community'), 'community label removed');
});

test('cleanTweetText: strips Russian timestamp and read-more link', () => {
  const t = cleanTweetText('Отличные новости\n2:30 PM · 24 января 2024 г.\nRead more on x.com');
  assert.ok(t.includes('Отличные новости'));
  assert.ok(!t.includes('января'));
  assert.ok(!t.includes('Read more'));
});

test('isInsideUrlAnchor: relative/non-http links are not treated as URL text', () => {
  withDom('<div><a href="/profile/user">user profile</a></div>', (doc) => {
    const node = doc.querySelector('a').firstChild;
    assert.strictEqual(isInsideUrlAnchor(node), false);
  });
  withDom('<div><a href="https://x.com/user/status/1">x.com/status/1</a></div>', (doc) => {
    const node = doc.querySelector('a').firstChild;
    assert.strictEqual(isInsideUrlAnchor(node), true);
  });
});

test('collectTranslatableTextNodes: skips url anchors inside the popup', () => {
  const html = '<div class="popup"><span>@gmgn_ai</span><span>Joined March 2024</span>' +
    '<div>Token just launched <a href="https://x.com/status/1">https://x.com/status/1</a></div>' +
    '<span>12 replies</span></div>';
  withDom(html, (doc) => {
    const nodes = collectTranslatableTextNodes(doc.querySelector('.popup'));
    const texts = nodes.map(n => n.text);
    assert.ok(texts.some(t => t.includes('Token just launched')), 'tweet text: ' + JSON.stringify(texts));
    assert.ok(!texts.some(t => t.includes('x.com/status')), 'url anchor text excluded');
    assert.ok(!texts.some(t => t === '12 replies'), 'engagement excluded');
  });
});
