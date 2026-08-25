const X_TWEET_TEXT_SELECTOR = '[data-testid="tweetText"]';
const X_RETRY_DELAYS = [50, 150, 400, 1000];
const X_MARKER = 'xTr';

class TweetObserver {
  constructor(translator, cache, ui, diagnostics) {
    this.translator = translator;
    this.cache = cache;
    this.ui = ui;
    this.diagnostics = diagnostics || null;
    this.enabled = true;
    this._observer = null;
    this._processing = new WeakSet();
    this._pollTimer = null;
    this._pollInterval = 1500;
    this._flushing = false;
    this._flushQueued = false;
  }

  start() {
    if (!this.enabled) return;
    if (this._observer) return;
    this._observerMuts = new Set();
    this._observer = new MutationObserver((muts) => {
      for (const m of muts) {
        for (const n of m.addedNodes || []) {
          if (n && n.nodeType === Node.ELEMENT_NODE) this._observerMuts.add(n);
        }
      }
      this._scheduleFlush();
    });
    const root = document.documentElement || document.body;
    try {
      this._observer.observe(root, { childList: true, subtree: true });
    } catch (e) { /* ignore */ }
    this._scan(false);
    this._pollTimer = setInterval(() => this._scan(false), this._pollInterval);
  }

  stop() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
      this._observerMuts = null;
    }
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  _scheduleFlush() {
    if (this._flushing) { this._flushQueued = true; return; }
    this._flushing = true;
    setTimeout(() => {
      this._flushing = false;
      const nodes = this._observerMuts && this._observerMuts.size > 0 ? [...this._observerMuts] : [];
      if (this._observerMuts) this._observerMuts.clear();
      for (const n of nodes) this._processAddedNode(n);
      if (this._flushQueued) { this._flushQueued = false; this._scheduleFlush(); }
    }, 60);
  }

  _processAddedNode(node) {
    if (!this.enabled) return;
    if (node.matches && node.matches(X_TWEET_TEXT_SELECTOR)) {
      this._handleTweetText(node);
      return;
    }
    if (node.querySelectorAll) {
      const texts = node.querySelectorAll(X_TWEET_TEXT_SELECTOR);
      for (const t of texts) this._handleTweetText(t);
    }
  }

  _scan(includeExisting = true) {
    const texts = document.querySelectorAll(X_TWEET_TEXT_SELECTOR);
    for (const t of texts) this._handleTweetText(t);
  }

  _handleTweetText(tweetText) {
    if (!this.enabled) return;
    if (this._processing.has(tweetText)) return;
    this._processing.add(tweetText);

    const wait = (attempt) => {
      if (!tweetText.isConnected) { this._processing.delete(tweetText); return; }
      const text = this._collectFullText(tweetText);
      if (text) {
        this._processing.delete(tweetText);
        this._translateTweet(tweetText, text);
        return;
      }
      if (attempt >= X_RETRY_DELAYS.length) { this._processing.delete(tweetText); return; }
      setTimeout(() => wait(attempt + 1), X_RETRY_DELAYS[attempt]);
    };
    wait(0);
  }

  _collectTextParts(el, parts) {
    if (el.nodeType === 3) {
      const t = el.textContent;
      if (t && t.trim()) parts.push(t.trim());
      return;
    }
    if (el.nodeType !== 1) return;
    if (el.getAttribute && el.getAttribute('aria-hidden') === 'true') return;
    if (el.tagName === 'BUTTON') return;
    for (const child of el.childNodes) this._collectTextParts(child, parts);
  }

  _collectFullText(tweetText) {
    if (tweetText.dataset && tweetText.dataset[X_MARKER] === '1') return null;
    const parts = [];
    this._collectTextParts(tweetText, parts);
    const raw = parts.join(' ');
    if (!raw) return null;
    const meaningful = cleanTweetText(raw);
    if (meaningful.length < CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH) return null;
    if (isRussianText(meaningful)) return null;
    return cleanTweetText(raw, { stripUrls: false });
  }

  async _translateTweet(tweetText, original) {
    if (!original) return;
    if (tweetText.dataset[X_MARKER] === '1') return;
    tweetText.dataset[X_MARKER] = '1';
    try {
      if (this.ui) this.ui.showTranslating(tweetText);
      const translated = await this.translator.translate(original);
      if (!translated) { this._markFailed(tweetText); return; }
      if (!tweetText.isConnected) return;
      tweetText.dataset.originalText = original;
      tweetText.dataset.translatedText = translated;
      tweetText.textContent = translated;
      tweetText.dataset.translated = 'true';
      if (this.ui) this.ui.showTranslated(tweetText);
      if (this.diagnostics) this.diagnostics.recordTranslationSuccess(original, translated, this.translator.lastUsedApi || 'unknown', 0);
    } catch (err) {
      this._markFailed(tweetText);
    }
  }

  _markFailed(el) {
    if (!this.ui) return;
    this.ui.showFailed(el);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TweetObserver, X_TWEET_TEXT_SELECTOR, X_RETRY_DELAYS };
}
