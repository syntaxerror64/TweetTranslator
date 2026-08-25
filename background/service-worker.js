// Tweet Translator — background service worker.
// Выполняет прокси-запросы (Google Translate изолирован в этом контексте)
// и сохраняет статистику из content-скриптов.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  if (message.type === 'PROXY_FETCH') {
    fetch(message.url, {
      method: message.method || 'GET',
      headers: message.headers || {},
      credentials: 'omit'
    })
      .then(async (resp) => {
        const text = await resp.text();
        sendResponse({ status: resp.status, text: text });
      })
      .catch((err) => {
        sendResponse({ status: 0, error: String((err && err.message) || err) });
      });
    return true;
  }

  if (message.type === 'UPDATE_STATS') {
    chrome.storage.local.set({ stats: message.stats || {} }).catch(() => {});
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
