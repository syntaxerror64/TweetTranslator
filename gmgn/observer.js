const GMN_TOOLTIP_SELECTOR = 'div[role="tooltip"].pi-tooltip-container';
const GMN_TWEET_SPAN_SELECTOR = 'span[data-sentry-element="SafeHtml"]';
const GMN_X_CARD_SELECTOR = 'a[href*="x.com"], a[href*="twitter.com"]';
const GMN_NARRATIVE_BLOCK_SELECTOR = 'div[class*="text-text-"]';
const GMN_RETRY_DELAYS = [50, 150, 400, 1000];
const GMN_MARKER = 'gmnTr';

class GmnObserver {
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
    const seen = new WeakSet();
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
    // Tooltip node itself
    if (node.matches && node.matches(GMN_TOOLTIP_SELECTOR)) {
      this._handleTooltip(node);
      return;
    }
    // Tooltip nested inside an added subtree
    if (node.querySelectorAll) {
      const tips = node.querySelectorAll(GMN_TOOLTIP_SELECTOR);
      for (const t of tips) this._handleTooltip(t);
    }
    // New tweet span added into an existing tooltip (async content load / related tweets)
    if (node.matches && node.matches(GMN_TWEET_SPAN_SELECTOR)) {
      const tip = node.closest(GMN_TOOLTIP_SELECTOR);
      if (tip && this._isTweetSpan(node)) this._translateElement(node);
    }
    // New narrative text block added into an existing non-X tooltip (async content load)
    if (node.matches && node.matches(GMN_NARRATIVE_BLOCK_SELECTOR)) {
      const tip = node.closest(GMN_TOOLTIP_SELECTOR);
      if (tip && !tip.querySelector(GMN_X_CARD_SELECTOR) && this._isNarrativeBlock(node)) {
        this._translateElement(node);
      }
    }
  }

  _scan(includeExisting = true) {
    const tips = document.querySelectorAll(GMN_TOOLTIP_SELECTOR);
    for (const t of tips) this._handleTooltip(t);
  }

_handleTooltip(tooltip) {
    if (!this.enabled) return;
    if (this._processing.has(tooltip)) return;
    this._processing.add(tooltip);

    // X cards (tooltips containing x.com/twitter.com links) are tweet cards:
    // only their SafeHtml spans are content. Everything else in the card
    // (handle, timestamp, view/stats counts) is metadata and must NOT be
    // translated via the broad narrative selector.
    const isXCard = tooltip.querySelector(GMN_X_CARD_SELECTOR) !== null;

    const wait = (attempt) => {
      if (!tooltip.isConnected) { this._processing.delete(tooltip); return; }
      const spans = this._collectTweetSpans(tooltip);
      const blocks = isXCard ? [] : this._collectNarrativeBlocks(tooltip);
      if (spans.length > 0 || blocks.length > 0) {
        this._processing.delete(tooltip);
        for (const s of spans) this._translateElement(s);
        for (const b of blocks) this._translateElement(b);
        return;
      }
      if (attempt >= GMN_RETRY_DELAYS.length) { this._processing.delete(tooltip); return; }
      setTimeout(() => wait(attempt + 1), GMN_RETRY_DELAYS[attempt]);
    };
    wait(0);
  }

  _isTweetSpan(s) {
    if (s.closest && s.closest('button')) return false;         // skip gmgn's own Translate button
    if (s.dataset && s.dataset[GMN_MARKER] === '1') return false; // already handled by us
    const text = cleanTweetText(s.textContent || '');
    if (!text || text.length < CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH) return false;
    if (isRussianText(text)) return false;
    if (isMetadataText(text)) return false;
    return true;
  }

  _collectTweetSpans(tooltip) {
    const result = [];
    for (const s of tooltip.querySelectorAll(GMN_TWEET_SPAN_SELECTOR)) {
      if (this._isTweetSpan(s)) result.push(s);
    }
    return result;
  }

  _isNarrativeBlock(b) {
    if (b.closest && b.closest('button')) return false;           // skip gmgn's own Translate button
    if (b.dataset && b.dataset[GMN_MARKER] === '1') return false; // already handled by us
    if (b.querySelector(GMN_NARRATIVE_BLOCK_SELECTOR)) return false; // only leaf text blocks
    const text = cleanTweetText(b.textContent || '');
    if (!text || text.length < CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH) return false;
    if (isRussianText(text)) return false;
    if (isMetadataText(text)) return false;
    return true;
  }

  _collectNarrativeBlocks(tooltip) {
    // X cards are tweet cards: handled via the SafeHtml span path only.
    if (tooltip.querySelector(GMN_X_CARD_SELECTOR)) return [];
    // Tooltips that already contain SafeHtml spans are handled via the span path.
    if (tooltip.querySelector(GMN_TWEET_SPAN_SELECTOR)) return [];
    const result = [];
    for (const b of tooltip.querySelectorAll(GMN_NARRATIVE_BLOCK_SELECTOR)) {
      if (this._isNarrativeBlock(b)) result.push(b);
    }
    return result;
  }

  async _translateElement(el) {
    if (el.dataset[GMN_MARKER] === '1') return;
    el.dataset[GMN_MARKER] = '1';
    try {
      if (this.ui) this.ui.showTranslating(el);
      const original = cleanTweetText(el.textContent || '');
      if (!original || original.length < CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH) { this._markFailed(el); return; }
      const translated = await this.translator.translate(original);
      if (!translated) { this._markFailed(el); return; }
      if (!el.isConnected) return;
      el.dataset.originalText = original;
      el.dataset.translatedText = translated;
      el.textContent = translated;
      el.dataset.translated = 'true';
      if (this.ui) this.ui.showTranslated(el);
      if (this.diagnostics) this.diagnostics.recordTranslationSuccess(original, translated, this.translator.lastUsedApi || 'unknown', 0);
    } catch (err) {
      this._markFailed(el);
    }
  }

  _markFailed(el) {
    if (!this.ui) return;
    this.ui.showFailed(el);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { GmnObserver, GMN_TOOLTIP_SELECTOR, GMN_TWEET_SPAN_SELECTOR, GMN_X_CARD_SELECTOR, GMN_NARRATIVE_BLOCK_SELECTOR, GMN_RETRY_DELAYS };
}
