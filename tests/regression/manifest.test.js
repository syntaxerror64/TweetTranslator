const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));

function allJsFilesExist(entries) {
  return entries.every(e => e.js.every(f => fs.existsSync(path.join(ROOT, f))));
}

test('manifest: references only existing files', () => {
  assert.ok(manifest.manifest_version, 'manifest_version');
  assert.ok(Array.isArray(manifest.content_scripts) && manifest.content_scripts.length === 5, '5 content_scripts (padre MAIN, axiom, padre, gmgn, twitter)');
  assert.ok(allJsFilesExist(manifest.content_scripts), 'every referenced js exists');
  const gmgnBlock = manifest.content_scripts.find(b => b.matches.includes('https://gmgn.ai/*'));
  assert.ok(gmgnBlock, 'gmgn content script present');
  assert.ok(gmgnBlock.js.includes('gmgn/constants.js'));
  assert.ok(gmgnBlock.js.includes('gmgn/observer.js'));
  assert.ok(gmgnBlock.js.includes('gmgn/content.js'));
  const twBlock = manifest.content_scripts.find(b => b.matches.includes('https://x.com/*'));
  assert.ok(twBlock, 'x.com content script present');
  assert.ok(twBlock.matches.includes('https://twitter.com/*'), 'twitter.com also matched');
  assert.ok(twBlock.js.includes('twitter/constants.js'));
  assert.ok(twBlock.js.includes('twitter/observer.js'));
  assert.ok(twBlock.js.includes('twitter/content.js'));
});

test('manifest: MAIN-world api-interceptor runs first at document_start', () => {
  const main = manifest.content_scripts.find(b => b.world === 'MAIN');
  assert.ok(main, 'MAIN world block exists');
  assert.strictEqual(main.run_at, 'document_start');
  assert.deepStrictEqual(main.js, ['padre/api-interceptor.js']);
  assert.deepStrictEqual(main.matches, ['https://trade.padre.gg/*']);
});

test('manifest: load order follows config -> core + site constants -> remaining core -> observer -> content', () => {
  const SITE_RE = /^(axiom|padre|gmgn)\//;
  for (const block of manifest.content_scripts) {
    if (block.world === 'MAIN') continue;
    const scripts = block.js;
    const site = block.matches.join(',');
    assert.strictEqual(scripts[0], 'core/config.js', site + ' starts with core/config.js');

    const coreLast = scripts.reduce((max, n, i) => (/^core\//.test(n) ? i : max), -1);
    const constantsAt = scripts.findIndex(n => n.endsWith('constants.js'));
    if (constantsAt >= 0) {
      assert.ok(constantsAt > 0, site + ': constants.js after core/config.js');
      assert.ok(/^core\//.test(scripts[constantsAt - 1]), site + ': constants.js embedded in core section');
      assert.ok(coreLast > constantsAt, site + ': core continues after constants');
    }
    // observer/content must load strictly after every core module
    const lastSite = scripts.findIndex(n => SITE_RE.test(n) && !n.endsWith('observer.js') && !n.endsWith('content.js') && !n.endsWith('constants.js'));
    assert.ok(lastSite === -1, site + ': no unexpected site module between core and observers');
    const obs = scripts.findIndex(n => n.endsWith('observer.js'));
    const content = scripts.findIndex(n => n.endsWith('content.js'));
    assert.ok(obs > coreLast, site + ': observer after all core modules');
    assert.ok(content === scripts.length - 1, site + ': content.js is last script in block');
  }
});

test('host_permissions: all supported sites present', () => {
  const perms = manifest.host_permissions || [];
  for (const host of ['https://x.com/*', 'https://twitter.com/*', 'https://axiom.trade/*', 'https://trade.padre.gg/*', 'https://gmgn.ai/*']) {
    assert.ok(perms.includes(host), 'missing host_permission: ' + host);
  }
});

test('background + action (popup) wiring exists', () => {
  assert.ok(manifest.background, 'background section');
  assert.ok(fs.existsSync(path.join(ROOT, manifest.background.service_worker)), 'service worker file');
  assert.ok(manifest.action && manifest.action.default_popup, 'action default_popup');
  assert.ok(fs.existsSync(path.join(ROOT, manifest.action.default_popup)), 'popup html exists');
  const popupJs = path.join(path.dirname(path.join(ROOT, manifest.action.default_popup)), 'popup.js');
  assert.ok(fs.existsSync(popupJs), 'popup.js exists');
  assert.ok(manifest.icons && fs.existsSync(path.join(ROOT, manifest.icons['128'])), 'icon128 exists');
});
