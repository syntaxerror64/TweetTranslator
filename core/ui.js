class TranslationUI {
  constructor() {
    this._injectStyles();
    this._setupGlobalToggle();
  }

  _injectStyles() {
    if (document.getElementById('axiom-translator-styles')) return;
    const style = document.createElement('style');
    style.id = 'axiom-translator-styles';
    style.textContent = `
      [data-translated="pending"] {
        opacity: ${CONFIG.UI.TRANSLATION_PENDING_OPACITY};
        transition: opacity 0.2s ease;
      }

      [data-translated="true"] {
        position: relative;
        overflow: visible !important;
        opacity: 1;
        transition: opacity 0.2s ease;
      }

      [data-translated="true"]::after {
        content: 'RU';
        position: absolute;
        top: -6px;
        right: -8px;
        font-size: 7px;
        font-weight: 700;
        background: ${CONFIG.UI.BADGE_COLOR};
        color: white;
        padding: 1px 3px;
        border-radius: 3px;
        opacity: 0.8;
        pointer-events: none;
        line-height: 1.2;
        letter-spacing: 0.5px;
        z-index: 10;
      }

      [data-translated="original"] {
        position: relative;
      }

      [data-translated="original"]::after {
        content: 'EN';
        position: absolute;
        top: -6px;
        right: -8px;
        font-size: 7px;
        font-weight: 700;
        background: #6b7280;
        color: white;
        padding: 1px 3px;
        border-radius: 3px;
        opacity: 0.8;
        pointer-events: none;
        line-height: 1.2;
        letter-spacing: 0.5px;
        z-index: 10;
      }

      [data-translated="failed"] {
        opacity: 1;
      }

      [data-translated="true"].axiom-tx-leaf:hover,
      [data-translated="original"].axiom-tx-leaf:hover {
        cursor: pointer;
        text-decoration-line: underline;
        text-decoration-style: dotted;
        text-decoration-color: ${CONFIG.UI.BADGE_COLOR};
        text-underline-offset: 3px;
      }

      [data-translated="true"]:not(.axiom-tx-leaf):hover,
      [data-translated="original"]:not(.axiom-tx-leaf):hover {
        cursor: pointer;
      }

      .axiom-tx-panel {
        padding: 6px 10px;
        margin: 4px 0 0 0;
        border-top: 1px solid rgba(124, 58, 237, 0.2);
        font: inherit;
        line-height: inherit;
        color: inherit;
        cursor: pointer;
        position: relative;
      }
      .axiom-tx-panel[data-translated="true"]::after {
        content: 'RU';
        position: absolute;
        top: -6px;
        right: -4px;
        font-size: 7px;
        font-weight: 700;
        background: ${CONFIG.UI.BADGE_COLOR};
        color: white;
        padding: 1px 3px;
        border-radius: 3px;
        opacity: 0.8;
        pointer-events: none;
        line-height: 1.2;
        letter-spacing: 0.5px;
        z-index: 10;
      }
      .axiom-tx-panel:hover {
        text-decoration-line: underline;
        text-decoration-style: dotted;
        text-decoration-color: ${CONFIG.UI.BADGE_COLOR};
        text-underline-offset: 3px;
      }
    `;
    document.head.appendChild(style);
  }

  showTranslating(element) {
    element.dataset.translated = 'pending';
  }

  showTranslated(element) {
    element.dataset.translated = 'true';
  }

  showFailed(element) {
    element.dataset.translated = 'failed';
  }

  _setupGlobalToggle() {
    const self = this;
    const interactiveSelector = 'a[href], button, img, svg, video, input, select, textarea, [role="button"]';

    const getToggleTarget = (e) => {
      const el = e.target.closest('[data-translated="true"], [data-translated="original"]');
      if (!el) return null;
      const hit = e.target.closest(interactiveSelector);
      if (hit && el.contains(hit)) return null;
      return el;
    };

    document.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const el = getToggleTarget(e);
      if (!el) return;
      e.stopPropagation();
      e.preventDefault();

      const now = Date.now();
      if (el._txLastToggle && now - el._txLastToggle < 200) return;
      el._txLastToggle = now;

      if (el.classList.contains('axiom-tx-panel')) {
        self._togglePanel(el);
      } else {
        self._toggleText(el);
      }
    }, true);

    const suppress = (e) => {
      if (getToggleTarget(e)) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    document.addEventListener('pointerup', suppress, true);
    document.addEventListener('mousedown', suppress, true);
    document.addEventListener('mouseup', suppress, true);
    document.addEventListener('click', suppress, true);
  }

  _togglePanel(panel) {
    panel.dataset.userToggled = '1';
    if (panel.dataset.translated === 'true') {
      panel.style.display = 'none';
      panel.dataset.translated = 'original';
    } else {
      panel.style.display = '';
      panel.dataset.translated = 'true';
    }
  }

  _toggleText(element) {
    const status = element.dataset.translated;
    if (status !== 'true' && status !== 'original') return;

    element.dataset.userToggled = '1';

    const isTranslated = status === 'true';
    const newState = isTranslated ? 'original' : 'true';

    const canUpdateClean = typeof cleanTweetText === 'function' && typeof getFullTextContent === 'function';

    const nodes = element._txNodes;
    const orig = element._txOriginal;
    const trans = element._txTranslated;

    if (nodes && orig && trans &&
        nodes.length === orig.length && nodes.length === trans.length) {
      if (nodes.every(n => n.isConnected)) {
        const targetTexts = isTranslated ? orig : trans;
        for (let i = 0; i < nodes.length; i++) {
          nodes[i].textContent = targetTexts[i];
        }
        element.dataset.translated = newState;
        element.dataset.translatedAt = String(Date.now());
        if (canUpdateClean) element.dataset.cleanedFullText = cleanTweetText(getFullTextContent(element));
        return;
      }
      delete element._txNodes;
      delete element._txOriginal;
      delete element._txTranslated;
    }

    const originalHtml = element.dataset.originalHtml;
    const translatedHtml = element.dataset.translatedHtml;

    if (originalHtml && translatedHtml) {
      element.innerHTML = isTranslated ? originalHtml : translatedHtml;
      element.dataset.translated = newState;
      element.dataset.translatedAt = String(Date.now());
      if (canUpdateClean) element.dataset.cleanedFullText = cleanTweetText(getFullTextContent(element));
      delete element._txNodes;
      delete element._txOriginal;
      delete element._txTranslated;
      return;
    }

    const originalText = element.dataset.originalText;
    const translatedText = element.dataset.translatedText;
    if (!originalText || !translatedText) return;

    element.textContent = isTranslated ? originalText : translatedText;
    element.dataset.translated = newState;
    element.dataset.translatedAt = String(Date.now());
    if (canUpdateClean) element.dataset.cleanedFullText = cleanTweetText(getFullTextContent(element));
  }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { TranslationUI };
}
