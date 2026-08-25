(async function () {
  'use strict';

  const hostname = window.location.hostname;
  const isGmgn = hostname === 'gmgn.ai' || hostname.endsWith('.gmgn.ai');
  if (!isGmgn) return;

  const prefetchHosts = [
    'translate.googleapis.com',
    'mozhi.pussthecat.org',
    'mozhi.r4fo.com',
    'mzh.dc09.xyz',
    'mozhi.adminforge.de',
    'mozhi.bloat.cat',
    'mozhi.ducks.party',
    'simplytranslate.org',
    'translate.plausibility.cloud',
    'api.mymemory.translated.net'
  ];
  for (const host of prefetchHosts) {
    const dns = document.createElement('link');
    dns.rel = 'dns-prefetch';
    dns.href = '//' + host;
    document.head.appendChild(dns);
  }
  for (const host of prefetchHosts.slice(0, 8)) {
    const pc = document.createElement('link');
    pc.rel = 'preconnect';
    pc.href = 'https://' + host;
    pc.crossOrigin = 'anonymous';
    document.head.appendChild(pc);
  }

let state;
  try {
    state = await chrome.storage.local.get(['enabled', 'siteEnabled', 'stats']);
  } catch (err) {
    state = {};
  }
  let globalEnabled = state.enabled !== false;
  let siteEnabled = state.siteEnabled && state.siteEnabled[CONFIG.SITE_ID] !== undefined
    ? state.siteEnabled[CONFIG.SITE_ID]
    : true;
  let isEnabled = globalEnabled && siteEnabled;

  function applyEnabled() {
    isEnabled = globalEnabled && siteEnabled;
    observer.setEnabled(isEnabled);
    if (isEnabled) {
      observer.start();
    } else {
      observer.stop();
    }
  }

  const cache = new LRUCache();
  const diagnostics = new Diagnostics();
  await cache.loadFromStorage().catch(() => {});
  diagnostics.load().catch(() => {});

  const translator = new TranslationService(cache, diagnostics);

  if (state.stats) {
    Object.assign(translator.stats, state.stats);
  }

  const ui = new TranslationUI();
  const observer = new GmnObserver(translator, cache, ui, diagnostics);

  if (isEnabled) {
    try {
      chrome.runtime.sendMessage({
        type: 'PROXY_FETCH',
        url: 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ru&dt=t&q=hi'
      }, () => {});
    } catch (e) {}
    try {
      for (const host of CONFIG.APIS.MOZHI.instances) {
        fetch(host + '/api/translate?engine=' + CONFIG.APIS.MOZHI.engine + '&from=en&to=ru&text=hi', {
          method: 'GET', credentials: 'omit'
        }).catch(() => {});
      }
      fetch(CONFIG.APIS.SIMPLYTRANSLATE.url + '?engine=google&from=en&to=ru&text=hi', {
        method: 'GET', credentials: 'omit'
      }).catch(() => {});
      for (const host of CONFIG.APIS.LINGVA.instances) {
        fetch(host + '/api/v1/en/ru/hi', {
          method: 'GET', credentials: 'omit'
        }).catch(() => {});
      }
    } catch (e) {}

    observer.start();

    setInterval(() => {
      if (!isEnabled) return;
      try {
        chrome.runtime.sendMessage({
          type: 'PROXY_FETCH',
          url: 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ru&dt=t&q=ok'
        }, () => {});
      } catch (e) {}
      const mozhiHosts = CONFIG.APIS.MOZHI.instances;
      const idx = Math.floor(Math.random() * mozhiHosts.length);
      fetch(mozhiHosts[idx] + '/api/translate?engine=' + CONFIG.APIS.MOZHI.engine + '&from=en&to=ru&text=ok', {
        method: 'GET', credentials: 'omit'
      }).catch(() => {});
    }, 60000);
  }

  if (!chrome.runtime?.id) return;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
case 'TOGGLE_TRANSLATION':
        globalEnabled = message.enabled;
        applyEnabled();
        sendResponse({ ok: true });
        break;

      case 'SITE_TOGGLE':
        if (message.site === CONFIG.SITE_ID) {
          siteEnabled = message.siteEnabled;
          applyEnabled();
        }
        sendResponse({ ok: true });
        break;

      case 'CLEAR_CACHE':
        cache.clear();
        translator.stats.cached = 0;
        sendResponse({ ok: true });
        break;

      case 'GET_STATUS':
        sendResponse({
          enabled: isEnabled,
          stats: { ...translator.stats },
          cacheSize: cache.size,
          apis: translator.getApiStatuses()
        });
        break;

      case 'GET_DIAGNOSTICS':
        sendResponse(diagnostics.generateReport());
        break;

      case 'EXPORT_MEMORY':
        sendResponse({ text: diagnostics.generateMemoryUpdate() });
        break;

      case 'RESET_DIAGNOSTICS':
        diagnostics.reset().then(() => sendResponse({ ok: true }));
        break;

      default:
        sendResponse({ error: 'Unknown message type' });
        break;
    }
    return true;
  });

  let lastUrl = location.href;
  let navigationTimer = null;

  function handleNavigation() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;

    if (isEnabled) {
      observer.stop();

      if (navigationTimer) clearTimeout(navigationTimer);
      navigationTimer = setTimeout(() => {
        navigationTimer = null;
        if (isEnabled) observer.start();
      }, 150);
    }
  }

  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;
  history.pushState = function (...args) {
    origPushState.apply(this, args);
    handleNavigation();
  };
  history.replaceState = function (...args) {
    origReplaceState.apply(this, args);
    handleNavigation();
  };
  window.addEventListener('popstate', handleNavigation);

})();
