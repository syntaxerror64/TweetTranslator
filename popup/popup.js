(async function () {
  'use strict';

  const SITES = [
    { id: 'x', label: 'X / Twitter', urls: ['https://x.com/*', 'https://twitter.com/*'] },
    { id: 'axiom', label: 'Axiom', urls: ['https://axiom.trade/*'] },
    { id: 'padre', label: 'Padre', urls: ['https://trade.padre.gg/*'] },
    { id: 'gmgn', label: 'GMGN', urls: ['https://gmgn.ai/*'] }
  ];
  const ALL_URLS = SITES.flatMap(s => s.urls);

  const state = await chrome.storage.local.get(['enabled', 'siteEnabled', 'stats']).catch(() => ({}));

  const toggle = document.getElementById('toggle');
  toggle.checked = state.enabled !== false;

  const siteToggles = {};
  for (const site of SITES) {
    const el = document.getElementById('site-' + site.id);
    el.checked = !state.siteEnabled || state.siteEnabled[site.id] !== false;
    siteToggles[site.id] = el;
  }

  async function broadcast(message, urls) {
    const tabs = await chrome.tabs.query({ url: urls || ALL_URLS }).catch(() => []);
    for (const t of tabs) {
      try { chrome.tabs.sendMessage(t.id, message); } catch (e) {}
    }
  }

  toggle.addEventListener('change', async () => {
    const enabled = toggle.checked;
    await chrome.storage.local.set({ enabled }).catch(() => {});
    broadcast({ type: 'TOGGLE_TRANSLATION', enabled: enabled });
  });

  for (const site of SITES) {
    siteToggles[site.id].addEventListener('change', async () => {
      const siteEnabled = Object.assign({}, state.siteEnabled || {});
      siteEnabled[site.id] = siteToggles[site.id].checked;
      state.siteEnabled = siteEnabled;
      await chrome.storage.local.set({ siteEnabled }).catch(() => {});
      broadcast({ type: 'SITE_TOGGLE', site: site.id, siteEnabled: siteEnabled[site.id] }, site.urls);
    });
  }

  document.getElementById('clear').addEventListener('click', () => {
    broadcast({ type: 'CLEAR_CACHE' });
  });

  if (state.stats) {
    const s = state.stats;
    document.getElementById('stats').textContent =
      'Переводов: ' + (s.translated || 0) +
      ' · Из кэша: ' + (s.cached || 0) +
      ' · Ошибок: ' + (s.errors || 0);
  }
})();