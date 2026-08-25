const { test } = require('node:test');
const assert = require('node:assert');

test('test runner works', () => {
  assert.strictEqual(1 + 1, 2);
});

test('jsdom loads', () => {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<div id="a">hi</div>');
  assert.strictEqual(dom.window.document.querySelector('#a').textContent, 'hi');
});
