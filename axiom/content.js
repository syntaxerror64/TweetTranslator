(async function () {
  'use strict';

  const hostname = window.location.hostname;
  if (hostname !== 'axiom.trade' && !hostname.endsWith('.axiom.trade')) return;

  if (CONFIG.DEBUG) console.log('[AxiomTranslator] Extension loaded on', window.location.href);


  let state;
  try {
    state = await chrome.storage.local.get(['enabled', 'siteEnabled', 'stats']);
  } catch (err) {
    console.warn('[AxiomTranslator] Failed to load state:', err);
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
  await cache.loadFromStorage();

  const diagnostics = new Diagnostics();
  await diagnostics.load();

  const translator = new TranslationService(cache, diagnostics);

  if (state.stats) {
    Object.assign(translator.stats, state.stats);
  }

  const ui = new TranslationUI();
  const observer = new TweetObserver(translator, cache, ui, diagnostics);

  const _apiHosts = [
    new URL(CONFIG.APIS.GOOGLE.url).hostname,
    ...CONFIG.APIS.MOZHI.instances.map(u => new URL(u).hostname),
    new URL(CONFIG.APIS.SIMPLYTRANSLATE.url).hostname,
    ...CONFIG.APIS.LINGVA.instances.map(u => new URL(u).hostname),
    new URL(CONFIG.APIS.MYMEMORY.url).hostname,
    'api.fxtwitter.com'
  ];

  const _prefetchFrag = document.createDocumentFragment();
  for (const host of _apiHosts) {
    const dns = document.createElement('link');
    dns.rel = 'dns-prefetch';
    dns.href = '//' + host;
    _prefetchFrag.appendChild(dns);
  }
  for (const host of _apiHosts.slice(0, 8)) {
    const pc = document.createElement('link');
    pc.rel = 'preconnect';
    pc.href = 'https://' + host;
    pc.crossOrigin = 'anonymous';
    _prefetchFrag.appendChild(pc);
  }
  document.head.appendChild(_prefetchFrag);


  function _pingApis(word) {
    try {
      const gUrl = CONFIG.APIS.GOOGLE.url + '?' + new URLSearchParams({ ...CONFIG.APIS.GOOGLE.params, q: word });
      chrome.runtime.sendMessage({ type: 'PROXY_FETCH', url: gUrl }, () => {});
    } catch (e) {}
    for (const base of CONFIG.APIS.MOZHI.instances) {
      fetch(base + '/api/translate?engine=' + CONFIG.APIS.MOZHI.engine + '&from=en&to=ru&text=' + word, { method: 'GET', credentials: 'omit' }).catch(() => {});
    }
    fetch(CONFIG.APIS.SIMPLYTRANSLATE.url + '?engine=google&from=en&to=ru&text=' + word, { method: 'GET', credentials: 'omit' }).catch(() => {});
    for (const base of CONFIG.APIS.LINGVA.instances) {
      fetch(base + '/api/v1/en/ru/' + word, { method: 'GET', credentials: 'omit' }).catch(() => {});
    }
  }

  if (isEnabled) _pingApis('hi');

  const _keepAliveId = setInterval(() => {
    if (!isEnabled) return;
    if (!chrome.runtime?.id) { clearInterval(_keepAliveId); return; }
    _pingApis('ok');
  }, 60000);


  if (isEnabled) {
    observer.start();
  }

  if (CONFIG.DEBUG) console.log(`[AxiomTranslator] Ready. Enabled: ${isEnabled}, Cache: ${cache.size} entries`);


  if (!chrome.runtime?.id) return;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'TOGGLE_TRANSLATION':
        globalEnabled = message.enabled;
        applyEnabled();
        if (CONFIG.DEBUG) console.log(`[AxiomTranslator] Translation ${isEnabled ? 'enabled' : 'disabled'}`);
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
        if (CONFIG.DEBUG) console.log('[AxiomTranslator] Cache cleared');
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

      case 'GET_DEBUG_LOG': {
        const orderedLog = _debugLog.length < _DEBUG_LOG_MAX
          ? _debugLog
          : _debugLog.slice(_debugLogHead).concat(_debugLog.slice(0, _debugLogHead));
        sendResponse({
          log: getIssuesSummary() + orderedLog.join('\n'),
          entries: _debugLog.length,
          issues: Object.keys(_debugIssues).length,
          url: window.location.href
        });
        break;
      }

      case 'RESET_DIAGNOSTICS':
        diagnostics.reset()
          .then(() => sendResponse({ ok: true }))
          .catch(err => sendResponse({ error: err.message }));
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
    const oldUrl = lastUrl;
    lastUrl = location.href;

    if (CONFIG.DEBUG) console.log(`[AxiomTranslator] Navigation: ${oldUrl} → ${lastUrl}`);

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
