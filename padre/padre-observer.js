const BLOCK_TAGS = new Set(['div', 'p', 'section', 'article', 'header', 'footer',
  'nav', 'aside', 'main', 'ul', 'ol', 'li', 'table', 'form', 'figure',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'details']);

const INTERACTIVE_POPUP_SELECTOR = '.MuiTooltip-popperInteractive';
const ALL_TOOLTIP_SELECTOR = '[role="tooltip"]';
const POPUP_CONTAINER_SELECTOR = INTERACTIVE_POPUP_SELECTOR + ',' + ALL_TOOLTIP_SELECTOR;

const POPUP_GUARD_SELECTOR = '.base-Popper-root, .MuiTooltip-popperInteractive, [role="tooltip"]';
const COMBINED_POPUP_POLL_SELECTOR = INTERACTIVE_POPUP_SELECTOR + ',' + ALL_TOOLTIP_SELECTOR + ',.base-Popper-root:not(.MuiTooltip-popper)';

const _OB_MEMBERS = /\d+\s*Members/i;
const _OB_CREATED_BY = /Created by/i;
const _OB_JOINED_S = /Joined\s/i;
const _OB_JOINED = /Joined/i;
const _OB_HANDLE_ONLY = /^@\w+$/;
const _OB_TWO_WORDS = /\s.*\s/;
const _OB_HANDLE = /@\w{1,15}/;
const _OB_FOLLOWERS_SIG = /\d[\d,.]*[KMBkmb]?\s*(followers|following)/i;
const _OB_SEE_PROFILE = /See profile/i;
const _OB_FOLLOWERS_EXACT = /^(followers|following)$/i;
const _OB_TIME_12H = /^\d{1,2}:\d{2}\s*(AM|PM)/i;
const _OB_TIME_AGO = /\d+[dhms](?=[^a-z]|$)/;
const _OB_PROFILE_PREFIX = /^[a-z][\w\s.\-·]*@\w{1,15}/i;
const _OB_STRIP_PREFIX = /^[\s\S]*?@\w{1,15}\s*/;
const _OB_STRIP_TIME = /^\d+[hmsд]\s*/i;
const _OB_STRIP_URL_LINE = /^[a-z0-9][\w.-]*\.[a-z]{2,}(\/\S*)?[…]?\s*$/gim;
const _OB_MULTI_NL = /\n{3,}/g;
const _OB_TRAILING_COMMA_NL = /,(\s*\n\n)/g;
const _OB_TRAILING_COMMA = /,\s*$/;
const _OB_STRIP_PROTO = /^https?:\/\//;
const _OB_REPLYING = /Replying to\s+@\w+/i;
const _OB_SEE_PROFILE_X = /See profile on X/i;
const _OB_VIEW_COMMUNITY = /(?:View|See) community/i;
const _OB_BONDING = /Bonding/i;
const _OB_MENTION_SPLIT = /(@\w+)/g;

function hasBlockChildren(el) {
  for (const child of el.children) {
    if (BLOCK_TAGS.has(child.tagName.toLowerCase())) return true;
  }
  return false;
}

const TEXT_BEARING_SELECTOR = 'div,span,p,a,section,article,h1,h2,h3,h4,h5,h6,blockquote,pre,li,td,th,label,figcaption,em,strong,b,i,small,dd,dt';
function findCommunityDescription(popupRoot) {
  const popupText = getSpacedTextContent(popupRoot);
  if (!_OB_MEMBERS.test(popupText) && !_OB_CREATED_BY.test(popupText)) return [];
  if (_OB_JOINED_S.test(popupText)) return [];

  let membersNode = null;
  const walker = document.createTreeWalker(popupRoot, NodeFilter.SHOW_TEXT, null);
  let tNode;
  while ((tNode = walker.nextNode())) {
    if (_OB_MEMBERS.test(tNode.textContent) || _OB_CREATED_BY.test(tNode.textContent)) {
      membersNode = tNode;
      break;
    }
  }

  const allElements = popupRoot.querySelectorAll(TEXT_BEARING_SELECTOR);
  let best = null;
  let bestLen = 0;

  for (let pass = 0; pass < 2; pass++) {
    for (const el of allElements) {
      const tn = el.tagName;
      if (tn === 'H1' || tn === 'H2' || tn === 'H3' || tn === 'H4' || tn === 'H5' || tn === 'H6') continue;
      if (el.closest('h1,h2,h3,h4,h5,h6')) continue;
      if (el.classList?.contains('MuiTypography-noWrap')) continue;
      if (el.classList?.contains('MuiTypography-paragraph3')) continue;
      if (el.children.length > 300) continue;

      if (membersNode) {
        const pos = el.compareDocumentPosition(membersNode);

        if ((pos & Node.DOCUMENT_POSITION_PRECEDING) !== 0 && !el.contains(membersNode)) continue;
      }

      const hasBlock = hasBlockChildren(el);
      if (pass === 0 && hasBlock) continue;
      if (pass === 1 && !hasBlock) continue;

      const fullText = getFullTextContent(el);
      if (fullText.length < 20) continue;
      if (pass === 1 && fullText.length > 600) continue;

      const cleaned = cleanTweetText(fullText);
      if (cleaned.length < 20) continue;
      if (isMetadataText(cleaned)) continue;
      if (_OB_HANDLE_ONLY.test(cleaned)) continue;
      if (cleaned.length < 40 && !_OB_TWO_WORDS.test(cleaned.trim())) continue;

      if (cleaned.split(/\s+/).length < 3) continue;

      if (cleaned.length > bestLen) {
        bestLen = cleaned.length;
        best = el;
      }
    }
    if (best) break;
  }

  return best ? [best] : [];
}

function findTweetTextElements(popupRoot, isProfile) {

  const communityResult = findCommunityDescription(popupRoot);
  if (communityResult.length > 0) return communityResult;

  const popupFullText = getSpacedTextContent(popupRoot);
  const hasCommunitySignal = _OB_MEMBERS.test(popupFullText) || _OB_CREATED_BY.test(popupFullText);
  if (hasCommunitySignal && !_OB_JOINED_S.test(popupFullText)) {
    return [];
  }

  const paraSpans = popupRoot.querySelectorAll(
    'span.MuiTypography-paragraph1:not(.MuiTypography-noWrap)'
  );

  const padreResults = [];
  for (const span of paraSpans) {

    if (span.closest('h1,h2,h3,h4,h5,h6')) continue;

    const text = getFullTextContent(span);
    if (text.length < CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH) continue;

    const cleaned = cleanTweetText(text);
    if (cleaned.length < CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH) continue;
    if (isMetadataText(cleaned)) continue;

    if (isProfile && cleaned.split(/\s+/).length < 3) continue;

    const trimmed = text.trim();

    if (_OB_JOINED_S.test(trimmed)) continue;

    if (_OB_FOLLOWERS_SIG.test(trimmed)) continue;

    if (_OB_FOLLOWERS_EXACT.test(trimmed)) continue;

    if (_OB_TIME_12H.test(trimmed)) continue;

    const metaSignals = (
      (_OB_HANDLE.test(text) ? 1 : 0) +
      (_OB_FOLLOWERS_SIG.test(text) ? 1 : 0) +
      (_OB_JOINED_S.test(text) ? 1 : 0) +
      (_OB_SEE_PROFILE.test(text) ? 1 : 0)
    );
    if (metaSignals >= 2) continue;

    padreResults.push(span);
    if (padreResults.length >= 3) break;
  }

  if (padreResults.length > 0) {
    return padreResults;
  }

  const textCandidates = [];
  const layoutCandidates = [];
  const broadCandidates = [];

  const allElements = popupRoot.querySelectorAll(TEXT_BEARING_SELECTOR);

  for (const el of allElements) {
    if (el.children.length > 300) continue;

    const tn = el.tagName;
    if (tn === 'H1' || tn === 'H2' || tn === 'H3' || tn === 'H4' || tn === 'H5' || tn === 'H6') continue;
    if (el.closest('h1,h2,h3,h4,h5,h6')) continue;
    if (el.classList?.contains('MuiTypography-noWrap')) continue;

    if (el.querySelector('svg[data-testid$="Icon"]')) continue;

    const fullText = getFullTextContent(el);
    if (fullText.length < CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH) continue;

    const cleanedText = cleanTweetText(fullText);
    if (cleanedText.length < CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH) continue;
    if (isMetadataText(cleanedText)) continue;

    if (isProfile && cleanedText.split(/\s+/).length < 3) continue;

    const isBroadContainer = _OB_HANDLE.test(fullText) && _OB_JOINED.test(fullText) &&
        _OB_FOLLOWERS_SIG.test(fullText);

    let depth = 0;
    let current = el;
    while (current && current !== popupRoot) {
      depth++;
      current = current.parentElement;
    }

    const candidate = {
      element: el,
      text: cleanedText,
      length: cleanedText.length,
      depth: depth
    };

    if (isBroadContainer) {
      broadCandidates.push(candidate);
    } else if (el.children.length === 0 || !hasBlockChildren(el)) {
      textCandidates.push(candidate);
    } else {
      layoutCandidates.push(candidate);
    }
  }

  let candidates;
  if (textCandidates.length > 0) {
    candidates = textCandidates;
  } else if (broadCandidates.length > 0) {
    candidates = broadCandidates;
  } else {
    candidates = layoutCandidates;
  }

  if (candidates.length === 0) return [];

  candidates.sort((a, b) => b.length - a.length);

  const results = [];
  const seen = new Set();
  for (const candidate of candidates) {
    let isDuplicate = false;
    for (const found of results) {
      if (found.element.contains(candidate.element) || candidate.element.contains(found.element)) {
        isDuplicate = true;
        break;
      }
    }
    if (isDuplicate) continue;
    if (seen.has(candidate.text)) continue;
    seen.add(candidate.text);
    results.push(candidate);
    if (results.length >= 2) break;
  }

  if (results.length === 0 && broadCandidates.length > 0) {
    broadCandidates.sort((a, b) => b.length - a.length);
    results.push(broadCandidates[0]);
  }

  return results.map(r => r.element);
}

class TweetObserver {
  constructor(translator, cache, ui, diagnostics) {
    this.translator = translator;
    this.cache = cache;
    this.ui = ui;
    this.diagnostics = diagnostics;
    this.observer = null;
    this._inFlightTexts = new Map();
    this._pendingMutations = [];
    this._rafScheduled = false;
    this.isEnabled = true;
    this._consecutiveErrors = 0;
    this._maxConsecutiveErrors = 10;
    this._restartBackoffMs = 1000;
    this._maxBackoffMs = 30000;

    this._apiTweetStore = new Map();
    this._apiDiagnostics = [];
    this._setupApiListener();

    this._pcSet = new Set();
    this._pcQueue = [];
    this._pcMax = 200;
    this._pcScanned = new WeakSet();
    this._pcPending = [];
    this._pcDraining = false;
    this._scheduledDelayedScans = new WeakSet();
    this._scheduledDelayedChecks = new WeakSet();
  }

  _setupApiListener() {
    const self = this;
    window.addEventListener('message', function (event) {
      if (!event.data || event.data.channel !== '__axiom_tx__') return;

      if (event.data.type === 'tweets') {
        for (const tweet of event.data.tweets) {
          const handle = tweet.handle;
          if (!handle) continue;
          if (!self._apiTweetStore.has(handle)) {
            self._apiTweetStore.set(handle, []);
          }
          const arr = self._apiTweetStore.get(handle);
          if (!arr.some(t => t.text === tweet.text)) {
            arr.push(tweet);
            if (arr.length > 20) arr.shift();

            if (self.isEnabled && tweet.text.length >= CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH && tweet.text.length <= 4500) {
              const cleaned = typeof cleanTweetText === 'function'
                ? cleanTweetText(tweet.text) : tweet.text;
              if (cleaned && cleaned.length >= CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH &&
                  typeof isRussianText === 'function' && !isRussianText(cleaned)) {
                self.translator.translate(cleaned).catch(() => {});
              }
            }
          }
        }
        if (self._apiTweetStore.size > 1000) {
          const iter = self._apiTweetStore.keys();
          for (let i = 0; i < 200; i++) {
            const key = iter.next().value;
            if (key) self._apiTweetStore.delete(key);
          }
        }
      }

      if (event.data.type === 'api_response') {
        self._apiDiagnostics.push({
          source: event.data.source,
          tweetsFound: event.data.tweetsFound,
          bodyLength: event.data.bodyLength,
          keys: event.data.keys,
          ts: Date.now()
        });
        if (self._apiDiagnostics.length > 200) self._apiDiagnostics.shift();
      }

    });
  }

  _findClosestHandle(element) {
    const popupRoot = element.closest?.('.padre-no-scroll') ||
                      element.closest?.('.MuiTooltip-popperInteractive') ||
                      element.closest?.(POPUP_CONTAINER_SELECTOR) || element;

    const handleSpans = popupRoot.querySelectorAll('.MuiTypography-noWrap');
    let bestHandle = null;

    for (const span of handleSpans) {
      const text = span.textContent.trim();
      const match = text.match(/^@(\w{1,15})$/);
      if (!match) continue;

      const pos = element.compareDocumentPosition(span);
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) {
        bestHandle = match[1];
      }
    }

    if (!bestHandle) {
      const allText = popupRoot.textContent || '';
      const handleMatch = allText.match(/@(\w{1,15})/);
      if (handleMatch) bestHandle = handleMatch[1];
    }

    return bestHandle ? bestHandle.toLowerCase() : null;
  }

  _extractTweetId(element) {
    const popupRoot = element.closest?.('.padre-no-scroll') ||
                      element.closest?.('.MuiTooltip-popperInteractive') ||
                      element.closest?.(POPUP_CONTAINER_SELECTOR) || element;

    const sectionHandle = this._findClosestHandle(element);

    const links = popupRoot.querySelectorAll('a[href]');
    let handleMatchId = null;
    let bestPrecedingId = null;
    let firstId = null;

    for (const link of links) {
      const href = link.getAttribute('href') || '';
      const match = href.match(/(?:twitter\.com|x\.com)\/(\w+)\/status\/(\d+)/);
      if (!match) continue;

      const linkHandle = match[1].toLowerCase();
      const linkId = match[2];

      if (!firstId) firstId = linkId;

      if (sectionHandle && linkHandle === sectionHandle) {
        handleMatchId = linkId;
      }

      const pos = element.compareDocumentPosition(link);
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) {
        bestPrecedingId = linkId;
      }
    }

    return handleMatchId || bestPrecedingId || firstId;
  }

  async _fetchTweetTextById(tweetId) {
    try {
      return await new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 2500);
        chrome.runtime.sendMessage({ type: 'GET_TWEET_TEXT', tweetId }, (result) => {
          clearTimeout(timer);
          resolve(result || null);
        });
      });
    } catch (e) {
      return null;
    }
  }

  _findApiTweet(element, domText) {

    const handle = this._findClosestHandle(element);
    if (!handle) return null;

    const tweets = this._apiTweetStore.get(handle);
    if (!tweets || tweets.length === 0) return null;

    if (tweets.length === 1) return tweets[0].text;

    const domWords = new Set(
      domText.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    );
    if (domWords.size === 0) return tweets[tweets.length - 1].text;

    let bestScore = -1;
    let bestText = null;

    for (const tweet of tweets) {
      const words = tweet.text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      let score = 0;
      for (const w of words) {
        if (domWords.has(w)) score++;
      }
      if (score > bestScore) {
        bestScore = score;
        bestText = tweet.text;
      }
    }

    return bestScore > 0 ? bestText : tweets[tweets.length - 1].text;
  }

  start() {
    if (this.observer) this.stop();

    this.observer = new MutationObserver((mutations) => {
      if (!this.isEnabled) return;

      for (const m of mutations) {
        if (m.type !== 'childList') continue;
        for (const node of m.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          const isPopup = !!(
            node.matches?.(POPUP_CONTAINER_SELECTOR) ||
            node.querySelector?.(POPUP_CONTAINER_SELECTOR) ||

            node.classList?.contains('base-Popper-root') ||
            node.querySelector?.('.base-Popper-root')
          );

          if (isPopup) {

            const all = this._pendingMutations.length > 0
              ? this._pendingMutations.concat(Array.from(mutations))
              : Array.from(mutations);
            this._pendingMutations = [];
            this._processMutations(all);
            return;
          }
        }
      }

      this._pendingMutations.push(...mutations);
      if (!this._rafScheduled) {
        this._rafScheduled = true;
        requestAnimationFrame(() => {
          const batch = this._pendingMutations;
          this._pendingMutations = [];
          this._rafScheduled = false;
          this._processMutations(batch);
        });
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    this._scheduleCatchupScan();
    this._startMouseDetection();
    this._startPopupPoller();
    this._startFeedPreCacher();
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this._inFlightTexts.clear();
    this._pendingMutations = [];
    this._rafScheduled = false;
    this._stopMouseDetection();
    this._stopPopupPoller();
    this._stopFeedPreCacher();
  }

  setEnabled(enabled) {
    this.isEnabled = enabled;
  }

  _scheduleCatchupScan() {
    const delays = [50, 200, 700];
    for (const delay of delays) {
      setTimeout(() => {
        if (!this.isEnabled) return;

        const interactivePopups = document.querySelectorAll(INTERACTIVE_POPUP_SELECTOR);
        for (const popup of interactivePopups) {
          this._processPopupIfNeeded(popup);
        }

        const tooltips = document.querySelectorAll(ALL_TOOLTIP_SELECTOR);
        for (const tt of tooltips) {

          if (!tt.classList?.contains('MuiTooltip-popperInteractive')) {
            const text = tt.textContent || '';
            if (text.length < 50) continue;
          }
          this._processPopupIfNeeded(tt);
        }
      }, delay);
    }
  }

  _startMouseDetection() {
    this._lastMouseCheck = 0;
    this._onMouseOver = (e) => {
      if (!this.isEnabled) return;
      const now = Date.now();
      if (now - this._lastMouseCheck < 50) return;
      this._lastMouseCheck = now;

      const interactive = e.target.closest?.(INTERACTIVE_POPUP_SELECTOR);
      if (interactive) {
        this._processPopupIfNeeded(interactive);
        return;
      }

      const tooltip = e.target.closest?.(ALL_TOOLTIP_SELECTOR);
      if (tooltip) {

        const text = tooltip.textContent || '';
        if (text.length >= 30) {
          this._processPopupIfNeeded(tooltip);
        }
        return;
      }

      const popper = e.target.closest?.('.base-Popper-root');
      if (popper) {
        const text = popper.textContent || '';
        if (text.length >= 50) {
          this._processPopupIfNeeded(popper);
        }
        return;
      }
    };
    document.addEventListener('mouseover', this._onMouseOver, { passive: true });
  }

  _stopMouseDetection() {
    if (this._onMouseOver) {
      document.removeEventListener('mouseover', this._onMouseOver);
      this._onMouseOver = null;
    }
  }

  _startPopupPoller() {
    this._popupPoller = setInterval(() => {
      if (!this.isEnabled) return;

      const popups = document.querySelectorAll(COMBINED_POPUP_POLL_SELECTOR);
      for (const popup of popups) {
        if (!popup.isConnected) continue;
        if (!popup.classList?.contains('MuiTooltip-popperInteractive')) {
          const text = popup.textContent || '';
          if (text.length < 50) continue;
        }
        this._processPopupIfNeeded(popup);
      }
    }, 400);
  }

  _stopPopupPoller() {
    if (this._popupPoller) {
      clearInterval(this._popupPoller);
      this._popupPoller = null;
    }
  }

  _startFeedPreCacher() {
    this._pcTimer = setInterval(() => {
      if (this.isEnabled) this._pcScan();
    }, 800);

    setTimeout(() => { if (this.isEnabled) this._pcScan(); }, 150);
    setTimeout(() => { if (this.isEnabled) this._pcScan(); }, 600);

    this._pcLastScroll = 0;
    this._onScroll = () => {
      if (!this.isEnabled) return;
      const now = Date.now();
      if (now - this._pcLastScroll < 200) return;
      this._pcLastScroll = now;
      this._pcScan();
    };
    window.addEventListener('scroll', this._onScroll, { passive: true });
  }

  _stopFeedPreCacher() {
    if (this._pcTimer) {
      clearInterval(this._pcTimer);
      this._pcTimer = null;
    }
    if (this._onScroll) {
      window.removeEventListener('scroll', this._onScroll);
      this._onScroll = null;
    }
    this._pcPending = [];
    this._pcDraining = false;
  }

  _pcScan() {
    const root = document.querySelector('main') ||
                 document.querySelector('[class*="feed"]') ||
                 document.querySelector('[class*="content"]') ||
                 document.body;
    if (!root) return;

    const els = root.querySelectorAll(TEXT_BEARING_SELECTOR);
    let found = 0;

    for (const el of els) {
      if (found >= 75) break;
      if (this._pcScanned.has(el)) continue;
      if (el.dataset?.translated) continue;
      if (el.children.length > 20) continue;

      const text = el.textContent || '';
      if (text.length < 30 || text.length > 600) continue;
      if (!CONFIG.DETECTION.HANDLE_REGEX.test(text)) continue;

      if (el.closest(POPUP_CONTAINER_SELECTOR) || el.closest('.base-Popper-root')) continue;

      this._pcScanned.add(el);
      this._pcExtract(text);
      found++;
    }
  }

  _pcExtract(raw) {
    if (!raw || raw.length < 30) return;
    if (!CONFIG.DETECTION.HANDLE_REGEX.test(raw)) return;

    let text = raw.replace(_OB_STRIP_PREFIX, '');
    text = text.replace(_OB_STRIP_TIME, '');
    text = cleanTweetText(text);

    if (text.length < CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH || text.length > 800) return;
    if (isRussianText(text)) return;
    if (isMetadataText(text)) return;

    const hash = textHash(text);

    if (this._pcSet.has(hash)) return;
    if (this.cache.get(hash)) {
      this._pcSet.add(hash);
      return;
    }

    this._pcSet.add(hash);
    this._pcQueue.push(hash);
    while (this._pcQueue.length > this._pcMax) {
      this._pcSet.delete(this._pcQueue.shift());
    }

    if (this._pcPending.length >= 100) this._pcPending.shift();
    this._pcPending.push(text);

    if (!this._pcDraining) this._pcDrain();
  }

  _pcDrain() {
    if (!this.isEnabled || this._pcPending.length === 0) {
      this._pcDraining = false;
      return;
    }
    this._pcDraining = true;

    const batch = this._pcPending.splice(0, 12);
    for (const text of batch) {
      this.translator.translate(text).catch(() => {});
    }

    if (this._pcPending.length > 0) {
      setTimeout(() => this._pcDrain(), 50 + Math.random() * 80);
    } else {
      this._pcDraining = false;
    }
  }

  _processPopupIfNeeded(popupEl) {
    if (!popupEl || !popupEl.isConnected) return;
    const pending = popupEl.querySelector('[data-translated="pending"]');
    if (pending) {
      const ps = parseInt(pending.dataset.pendingSince || '0');
      if (ps && Date.now() - ps < 3000) return;
      delete pending.dataset.translated;
      delete pending.dataset.pendingSince;
    }

    const popupInfo = this._checkPopup(popupEl);
    if (!popupInfo) return;

    if (this.diagnostics) this.diagnostics.learnPopupPattern(popupEl);
    const elements = findTweetTextElements(popupInfo.popupRoot, popupInfo.isProfile);
    this._processFoundElements(elements, popupEl);
    this._scheduleDelayedScan(popupInfo.popupRoot, popupEl, popupInfo.isProfile);
  }

  _processMutations(mutations) {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') continue;

      if (mutation.type !== 'childList') continue;

      for (const addedNode of mutation.addedNodes) {
        if (addedNode.nodeType !== Node.ELEMENT_NODE) continue;
        const tag = addedNode.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK') continue;
        if (addedNode.closest?.('[data-translated]')) continue;

        const isPopupContainer = !!(
          addedNode.matches?.(POPUP_CONTAINER_SELECTOR) ||
          addedNode.querySelector?.(POPUP_CONTAINER_SELECTOR) ||
          addedNode.classList?.contains('base-Popper-root') ||
          addedNode.classList?.contains('MuiTooltip-popperInteractive') ||
          addedNode.querySelector?.('.base-Popper-root')
        );

        const nodeText = addedNode.textContent || '';
        const textLen = nodeText.length;

        if (textLen < 3 && !isPopupContainer) continue;

        if (textLen < 20 && !isPopupContainer) {
          if (addedNode.closest?.(POPUP_CONTAINER_SELECTOR)) {
            const ancestorPopup = this._findAncestorPopup(addedNode);
            if (ancestorPopup) {
              const elements = findTweetTextElements(ancestorPopup.popupRoot, ancestorPopup.isProfile);
              this._processFoundElements(elements, addedNode);
            }
          }
          continue;
        }

        const popupInfo = this._checkPopup(addedNode);

        if (!popupInfo) {
          if (isPopupContainer) {
            this._scheduleDelayedPopupCheck(addedNode);
            continue;
          }

          if (textLen >= 20) {
            const ancestorPopup = this._findAncestorPopup(addedNode);
            if (ancestorPopup) {
              const elements = findTweetTextElements(ancestorPopup.popupRoot, ancestorPopup.isProfile);
              this._processFoundElements(elements, addedNode);
              continue;
            }
          }

          if (textLen >= 30 && CONFIG.DETECTION.HANDLE_REGEX.test(nodeText)) {
            this._pcExtract(nodeText);
          }

          if (this.diagnostics && this._looksLikePopup(addedNode)) {
            this.diagnostics.recordDetectionMiss(addedNode);
          }
          continue;
        }

        if (this.diagnostics) {
          this.diagnostics.learnPopupPattern(addedNode);
        }

        const elements = findTweetTextElements(popupInfo.popupRoot, popupInfo.isProfile);
        this._processFoundElements(elements, addedNode);
        this._scheduleDelayedScan(popupInfo.popupRoot, addedNode, popupInfo.isProfile);
      }
    }
  }

  _checkPopup(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    let popupEl = null;

    if (node.classList?.contains('MuiTooltip-popperInteractive')) popupEl = node;
    else if (node.matches?.('[role="tooltip"]')) popupEl = node;
    else if (node.classList?.contains('base-Popper-root')) popupEl = node;

    if (!popupEl) {
      popupEl = node.querySelector(INTERACTIVE_POPUP_SELECTOR) ||
                node.querySelector(ALL_TOOLTIP_SELECTOR) ||
                node.querySelector('.base-Popper-root');
    }

    if (!popupEl && node.classList?.contains('padre-no-scroll')) {
      const parent = node.closest('.base-Popper-root') || node.closest('[role="tooltip"]');
      if (parent) {
        popupEl = parent;
      }

    }

    const isConfirmedPopup = !!popupEl;

    if (isConfirmedPopup && popupEl) {
      const isInteractive = popupEl.classList?.contains('MuiTooltip-popperInteractive');
      if (!isInteractive) {
        const text = popupEl.textContent || '';
        if (text.length < 50) return null;
      }
    }

    const contentEl = (popupEl?.querySelector?.('.padre-no-scroll') || popupEl || node);
    const allText = getSpacedTextContent(contentEl);
    const checkText = allText.length > 600
      ? allText.substring(0, 300) + ' ' + allText.substring(allText.length - 300)
      : allText;

    const hasHandle = CONFIG.DETECTION.HANDLE_REGEX.test(checkText);
    const hasFollowers = CONFIG.DETECTION.FOLLOWERS_REGEX.test(checkText) || _OB_FOLLOWERS_SIG.test(checkText);
    const hasJoinDate = CONFIG.DETECTION.JOIN_DATE_REGEX.test(checkText);
    const hasTimeAgo = _OB_TIME_AGO.test(checkText);
    const twitterSignals = (hasHandle ? 1 : 0) + (hasFollowers ? 1 : 0) + (hasJoinDate ? 1 : 0) + (hasTimeAgo ? 1 : 0);

    const isCommunity = (
      _OB_MEMBERS.test(checkText) || _OB_CREATED_BY.test(checkText)
    ) && (_OB_VIEW_COMMUNITY.test(checkText) || _OB_BONDING.test(checkText) || !hasJoinDate);

    if (isConfirmedPopup && popupEl) {
      const rect = popupEl.getBoundingClientRect();
      if (rect.width > 0 && rect.width < 200 && rect.height > 0 && rect.height < 60) {
        return null;
      }
    }

    const isLikelyPopup =
      (isConfirmedPopup && twitterSignals >= 1) ||
      (isConfirmedPopup && isCommunity);

    if (!isLikelyPopup) return null;

    let isProfile = false;
    if (isConfirmedPopup && !isCommunity) {
      const hasSeeProfile = _OB_SEE_PROFILE_X.test(checkText);
      const hasTimeAgoInText = _OB_TIME_AGO.test(checkText);
      const hasReplying = _OB_REPLYING.test(checkText);
      if (hasSeeProfile && !hasTimeAgoInText && !hasReplying) {
        isProfile = true;
      }
    }

    const popupRoot = contentEl.querySelector?.('.padre-no-scroll') || contentEl;

    return { popupRoot, isConfirmedPopup, isCommunity, isProfile };
  }

  _processFoundElements(elements, popupNode) {
    for (const el of elements) {
      const status = el.dataset.translated;
      if (status === 'pending') continue;
      if (status === 'en-only') continue;
      if (status === 'url-only') continue;

      if (status === 'failed') {
        const failedAt = parseInt(el.dataset.translatedAt || '0');
        if (Date.now() - failedAt < 1500) continue;
        delete el.dataset.translated;
        delete el.dataset.translatedAt;
      }

      if (status === 'true' || status === 'original' || status === 'panel') {
        const translatedAt = parseInt(el.dataset.translatedAt || '0');
        if (Date.now() - translatedAt < 10000) continue;

        if (status === 'original') continue;

        if (el.dataset.userToggled) continue;

        const currentText = cleanTweetText(getFullTextContent(el));
        const storedCleanText = el.dataset.cleanedFullText;
        if (storedCleanText && currentText === storedCleanText) continue;
        delete el.dataset.translated;
        delete el.dataset.originalHtml;
        delete el.dataset.translatedHtml;
        delete el.dataset.originalText;
        delete el.dataset.translatedText;
        delete el.dataset.cleanedFullText;
        delete el.dataset.translatedAt;
        const panel = el.nextElementSibling;
        if (panel?.classList.contains('axiom-tx-panel')) panel.remove();
      }

      this._handleTweetFound(el, popupNode);
    }
  }

  _findAncestorPopup(node) {
    let el = node.parentElement;
    let depth = 0;
    while (el && el !== document.body && depth < 15) {

      if (el.matches?.(POPUP_CONTAINER_SELECTOR) ||
          el.classList?.contains('MuiTooltip-popperInteractive') ||
          el.classList?.contains('base-Popper-root')) {
        return this._checkPopup(el);
      }
      el = el.parentElement;
      depth++;
    }
    return null;
  }

  _scheduleDelayedPopupCheck(node) {
    if (this._scheduledDelayedChecks.has(node)) return;
    this._scheduledDelayedChecks.add(node);

    const delays = [30, 100, 350, 800];
    for (const delay of delays) {
      setTimeout(() => {
        if (!node.isConnected || !this.isEnabled) return;
        if (node.querySelector('[data-translated="true"],[data-translated="pending"],[data-translated="original"],.axiom-tx-panel')) return;

        const popupInfo = this._checkPopup(node);
        if (!popupInfo) return;

        if (this.diagnostics) this.diagnostics.learnPopupPattern(node);
        const elements = findTweetTextElements(popupInfo.popupRoot, popupInfo.isProfile);
        this._processFoundElements(elements, node);
        this._scheduleDelayedScan(popupInfo.popupRoot, node, popupInfo.isProfile);
      }, delay);
    }
  }

  _scheduleDelayedScan(popupRoot, popupNode, isProfile) {
    if (this._scheduledDelayedScans.has(popupRoot)) return;
    this._scheduledDelayedScans.add(popupRoot);

    const delays = [80, 250, 700, 1800];
    for (const delay of delays) {
      setTimeout(() => {
        if (!popupRoot.isConnected || !this.isEnabled) return;
        const pending = popupRoot.querySelector('[data-translated="pending"]');
        if (pending) {
          const pendingEl = pending;
          const pendingStart = parseInt(pendingEl.dataset.pendingSince || '0');
          if (pendingStart && Date.now() - pendingStart < 3000) return;
          delete pendingEl.dataset.translated;
          delete pendingEl.dataset.pendingSince;
        }
        const elements = findTweetTextElements(popupRoot, isProfile);
        this._processFoundElements(elements, popupNode);
      }, delay);
    }
  }

  _looksLikePopup(node) {

    if (node.classList?.contains('base-Popper-root')) return true;
    if (node.classList?.contains('MuiTooltip-popperInteractive')) return true;
    if (node.matches?.('[role="tooltip"]')) return true;
    return false;
  }

  async _handleTweetFound(element, popupNode) {

    if (!element.closest(POPUP_GUARD_SELECTOR)) return;

    if (element.parentElement?.closest('[data-translated]')) return;
    if (element.querySelector('[data-translated]')) return;
    if (element.nextElementSibling?.classList.contains('axiom-tx-panel')) return;

    if (element.querySelector('.fast-search-available')) {
      return this._handlePadreText(element, popupNode);
    }

    const textNodes = collectTranslatableTextNodes(element);

    let domText = '';
    let isFragmented = false;

    if (textNodes.length > 0) {
      const contentNodes = textNodes.filter(n => !n.isCardLabel && !n.isUrl);
      const texts = contentNodes.map(n => n.text);
      const avgLen = texts.length > 0 ? texts.reduce((s, t) => s + t.length, 0) / texts.length : 0;
      isFragmented = contentNodes.length >= 4 && avgLen < 15;
      domText = isFragmented ? texts.join(' ') : texts.join('\n\n');
    } else {
      domText = cleanTweetText(getFullTextContent(element));
    }

    if (!domText || domText.length < CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH) {
      if (textNodes.length > 0 && textNodes.every(n => n.isUrl || n.isCardLabel || !n.text)) {
        for (const tn of textNodes) {
          if (!tn.node.isConnected) continue;
          if (tn.isUrl) {
            const parentA = tn.node.parentElement?.closest?.('a');
            if (parentA) parentA.style.display = 'none';
            else tn.node.textContent = '';
          } else if (tn.isCardLabel) {
            tn.node.textContent = '';
          }
        }
        element.dataset.translated = 'url-only';
      }
      return;
    }
    if (isRussianText(domText)) return;
    if (isMetadataText(domText)) return;

    const textKey = textHash(domText);
    if (this._inFlightTexts.has(textKey)) return;
    const _now = Date.now();
    if (this._inFlightTexts.size > 300) {
      for (const [k, v] of this._inFlightTexts) {
        if (_now - v > 10000) this._inFlightTexts.delete(k);
      }
    }
    this._inFlightTexts.set(textKey, _now);

    let textToTranslate = domText;
    let apiSource = null;

    if (this._apiTweetStore.size > 0) {
      const apiText = this._findApiTweet(element, domText);
      if (apiText) {
        const cleaned = cleanTweetText(apiText);
        if (cleaned && cleaned.length >= CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH) {
          const domSufficient = domText.length > cleaned.length * 0.6;
          if (domSufficient) {
            apiSource = 'dom-preferred';
          } else {
            textToTranslate = cleaned;
            apiSource = 'interceptor';
          }
        }
      }
    }

    if (!apiSource) {
      const hasProfilePrefix = _OB_PROFILE_PREFIX.test(textToTranslate);
      if (hasProfilePrefix) {
        let stripped = textToTranslate.replace(_OB_STRIP_PREFIX, '');
        stripped = stripped.replace(_OB_STRIP_TIME, '');
        stripped = cleanTweetText(stripped);
        if (stripped && stripped.length >= CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH) {
          textToTranslate = stripped;
        }
      }
    }

    _OB_STRIP_URL_LINE.lastIndex = 0;
    textToTranslate = textToTranslate.replace(_OB_STRIP_URL_LINE, '').replace(_OB_MULTI_NL, '\n\n').trim();

    if (textToTranslate.length < CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH || isRussianText(textToTranslate)) {
      this._inFlightTexts.delete(textKey);
      return;
    }
    if (isMetadataText(textToTranslate)) {
      this._inFlightTexts.delete(textKey);
      return;
    }

    const tweetId = this._extractTweetId(element);
    if (tweetId && !apiSource) {
      this._fetchTweetTextById(tweetId).then(apiResult => {
        if (apiResult?.text) {
          const cleaned = cleanTweetText(apiResult.text);
          if (cleaned && cleaned.length >= CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH && cleaned !== textToTranslate) {
            this.translator.translate(cleaned).catch(() => {});
          }
        }
      }).catch(() => {});
    }

    element.dataset.originalHtml = element.innerHTML;
    element.dataset.originalText = domText;
    element.dataset.cleanedFullText = cleanTweetText(getFullTextContent(element));
    element.dataset.translated = 'pending';
    element.dataset.pendingSince = String(Date.now());

    if (textNodes.length > 0) {
      element._txNodes = textNodes.map(n => n.node);
      element._txOriginal = textNodes.map(n => n.node.textContent);
    }

    this.ui.showTranslating(element);

    if (this.diagnostics) {
      this.diagnostics.recordDetectionSuccess(element, {
        hasTooltip: !!popupNode?.matches?.(POPUP_CONTAINER_SELECTOR),
        hasInteractive: !!popupNode?.classList?.contains('MuiTooltip-popperInteractive'),
        textLength: textToTranslate.length
      });
    }

    const startTime = Date.now();

    try {
      let translated = await this.translator.translate(textToTranslate, true);
      if (translated) {
        translated = translated.replace(_OB_TRAILING_COMMA_NL, '$1').replace(_OB_TRAILING_COMMA, '');
      }
      if (!translated) {
        element.dataset.translated = 'failed';
        element.dataset.translatedAt = String(Date.now());
        this.ui.showFailed(element);
        return;
      }

      let _hasCyr = false;
      for (let i = 0; i < translated.length; i++) {
        const c = translated.charCodeAt(i);
        if (c >= 0x0400 && c <= 0x04FF) { _hasCyr = true; break; }
      }
      if (!_hasCyr) {
        delete element.dataset.originalHtml;
        delete element.dataset.originalText;
        delete element.dataset.cleanedFullText;
        delete element.dataset.pendingSince;
        delete element._txNodes;
        delete element._txOriginal;
        element.dataset.translated = 'en-only';
        element.dataset.translatedAt = String(Date.now());
        return;
      }

      if (!element.isConnected) {
        this._inFlightTexts.delete(textKey);
        return;
      }

      for (const tn of textNodes) {
        if (!tn.node.isConnected) continue;
        if (tn.isUrl) {
          const parentA = tn.node.parentElement?.closest?.('a');
          if (parentA) parentA.style.display = 'none';
          else tn.node.textContent = '';
        } else if (tn.isCardLabel) {
          tn.node.textContent = '';
        }
      }
      const insertNodes = textNodes.filter(n => !n.isCardLabel && !n.isUrl);
      const nodesAlive = insertNodes.length > 0 && insertNodes.every(n => n.node.isConnected);
      let insertedVia = '';

      if (translated.includes('\n')) element.style.whiteSpace = 'pre-line';

      if (nodesAlive && isFragmented) {
        const alive = insertNodes.filter(n => n.node.isConnected);
        if (alive.length > 0) {
          alive[0].node.textContent = translated;
          for (let i = 1; i < alive.length; i++) alive[i].node.textContent = '';
          insertedVia = 'first-node (' + alive.length + ' spans)';
        } else {
          element.textContent = translated;
          insertedVia = 'textContent-fallback (fragmented, disconnected)';
        }

      } else if (nodesAlive && !isFragmented) {
        let parts = translated.split('\n\n');
        if (parts.length !== insertNodes.length) parts = translated.split('\n');

        if (parts.length === insertNodes.length) {
          for (let i = 0; i < insertNodes.length; i++) {
            insertNodes[i].node.textContent = parts[i];
          }
          insertedVia = 'node-by-node (' + insertNodes.length + ')';
        } else {
          insertNodes[0].node.textContent = translated;
          for (let i = 1; i < insertNodes.length; i++) {
            if (insertNodes[i].node.isConnected) insertNodes[i].node.textContent = '';
          }
          insertedVia = 'first-node (mismatch: ' + parts.length + ' parts vs ' + insertNodes.length + ' nodes)';
        }

      } else if (!nodesAlive && insertNodes.length > 0) {
        const fresh = collectTranslatableTextNodes(element).filter(n => !n.isCardLabel && !n.isUrl);
        if (fresh.length > 0) {
          fresh[0].node.textContent = translated;
          for (let i = 1; i < fresh.length; i++) {
            if (fresh[i].node.isConnected) fresh[i].node.textContent = '';
          }
          insertedVia = 'fresh-nodes (' + fresh.length + ')';
        } else {
          element.textContent = translated;
          insertedVia = 'textContent-fallback (fresh empty)';
        }

      } else {
        element.textContent = translated;
        insertedVia = 'textContent-fallback (no nodes)';
      }

      if (element._txNodes) {
        element._txTranslated = element._txNodes
          .map(n => n.isConnected ? n.textContent : '');
      }
      element.dataset.translatedHtml = element.innerHTML;
      element.dataset.translatedText = translated;
      element.dataset.cleanedFullText = cleanTweetText(getFullTextContent(element));
      element.dataset.translatedAt = String(Date.now());
      delete element.dataset.pendingSince;
      element.dataset.translated = 'true';
      this.ui.showTranslated(element);
      this._consecutiveErrors = 0;
      this._restartBackoffMs = 2000;

      const elapsed = Date.now() - startTime;

      if (this.diagnostics) {
        this.diagnostics.recordTranslationSuccess(
          textToTranslate, translated, 'auto', elapsed
        );
      }
    } catch (err) {
      if (element.dataset.originalHtml && element.isConnected) {
        element.innerHTML = element.dataset.originalHtml;
      }
      element.dataset.translated = 'failed';
      element.dataset.translatedAt = String(Date.now());
      delete element.dataset.pendingSince;
      this.ui.showFailed(element);
      this._consecutiveErrors++;

      if (this.diagnostics) {
        this.diagnostics.recordTranslationFailure(textToTranslate, err, 'auto');
      }

      if (this._consecutiveErrors >= this._maxConsecutiveErrors) {
        this._consecutiveErrors = 0;
        const backoff = this._restartBackoffMs;
        this._restartBackoffMs = Math.min(this._restartBackoffMs * 2, this._maxBackoffMs);
        this.stop();
        setTimeout(() => {
          if (this.isEnabled) this.start();
        }, backoff);
      }
    } finally {
      this._inFlightTexts.delete(textKey);
    }
  }

  async _handlePadreText(element, popupNode) {

    if (!element.closest(POPUP_GUARD_SELECTOR)) {
      return;
    }

    const rawText = (function walk(n) {
      let s = '';
      for (const c of n.childNodes) {
        if (c.nodeType === 3) s += c.textContent;
        else if (c.nodeType === 1) {
          const tag = c.tagName;
          if (tag === 'HR' || tag === 'BR') s += '\n';

          else if (c !== element && c.classList?.contains('MuiTypography-paragraph1') && !c.classList?.contains('MuiTypography-noWrap')) continue;

          else if (c.childElementCount > 0 && c.querySelector?.('span.MuiTypography-paragraph1:not(.MuiTypography-noWrap)')) continue;
          else s += walk(c);
        }
      }
      return s;
    })(element).trim();

    const urlSpans = element.querySelectorAll('.tweet-url');
    const extractedUrls = [];
    const seenUrlsNorm = new Set();
    let urlColor = null;
    for (const span of urlSpans) {
      const u = span.textContent.trim();
      if (!u) continue;
      const norm = u.replace(_OB_STRIP_PROTO, '');
      if (seenUrlsNorm.has(norm)) continue;
      seenUrlsNorm.add(norm);
      extractedUrls.push(u);
      if (!urlColor) { try { urlColor = getComputedStyle(span).color; } catch (_) {} }
    }
    if (extractedUrls.length === 0) {

      const regexUrls = rawText.match(/https?:\/\/\S+/g) || [];
      const domainUrls = rawText.match(/\b[a-z0-9-]+\.[a-z]{2,}\/\S+/gi) || [];
      for (const u of [...regexUrls, ...domainUrls]) {
        const norm = u.replace(_OB_STRIP_PROTO, '');
        if (!seenUrlsNorm.has(norm)) { seenUrlsNorm.add(norm); extractedUrls.push(u); }
      }
    }

    let mentionColor = null;
    const mentionSpan = element.querySelector('.tweet-mention-handle');
    if (mentionSpan) { try { mentionColor = getComputedStyle(mentionSpan).color; } catch (_) {} }

    if (!mentionColor) mentionColor = urlColor;

    const extractedAddresses = [];
    const addrMatches = rawText.match(/\b[A-Za-z0-9]{30,}\b/g) || [];
    for (const addr of addrMatches) {

      const isPartOfUrl = extractedUrls.some(u => u.includes(addr));
      if (!isPartOfUrl) {
        extractedAddresses.push(addr);
      }
    }

    let textToTranslate = rawText.split('\n')
      .map(l => cleanTweetText(l))
      .filter(l => l && l.length > 0)
      .join('\n');

    if (extractedAddresses.length > 0) {
      for (const addr of extractedAddresses) {
        textToTranslate = textToTranslate.replace(addr, '');
      }
      textToTranslate = textToTranslate.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .join('\n');
    }

    if (extractedUrls.length > 0) {
      for (const url of extractedUrls) {
        textToTranslate = textToTranslate.replace(url, '');
      }
      _OB_STRIP_URL_LINE.lastIndex = 0;
      textToTranslate = textToTranslate.replace(_OB_STRIP_URL_LINE, '');
      textToTranslate = textToTranslate.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 0)
        .join('\n');
    }

    if (!textToTranslate || textToTranslate.length < CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH) return;
    if (isRussianText(textToTranslate)) return;

    if (isMetadataText(textToTranslate)) return;

    const textKey = textHash(textToTranslate);
    if (this._inFlightTexts.has(textKey)) return;
    const _now2 = Date.now();
    if (this._inFlightTexts.size > 300) {
      for (const [k, v] of this._inFlightTexts) {
        if (_now2 - v > 10000) this._inFlightTexts.delete(k);
      }
    }
    this._inFlightTexts.set(textKey, _now2);

    if (this._apiTweetStore.size > 0) {
      const apiText = this._findApiTweet(element, textToTranslate);
      if (apiText) {
        const cleaned = apiText.split('\n').map(l => cleanTweetText(l)).filter(l => l).join('\n');
        if (cleaned && cleaned.length >= CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH) {
          textToTranslate = cleaned;
        }
      }
    }

    if (!textToTranslate || textToTranslate.length < CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH || isRussianText(textToTranslate)) {
      this._inFlightTexts.delete(textKey);
      return;
    }
    if (isMetadataText(textToTranslate)) {
      this._inFlightTexts.delete(textKey);
      return;
    }

    const tweetId = this._extractTweetId(element);
    if (tweetId) {
      this._fetchTweetTextById(tweetId).then(apiResult => {
        if (apiResult?.text) {
          const cleaned = apiResult.text.split('\n').map(l => cleanTweetText(l)).filter(l => l).join('\n');
          if (cleaned && cleaned.length >= CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH && cleaned !== textToTranslate) {
            this.translator.translate(cleaned).catch(() => {});
          }
        }
      }).catch(() => {});
    }

    element.dataset.originalHtml = element.innerHTML;
    element.dataset.originalText = rawText;
    element.dataset.cleanedFullText = cleanTweetText(rawText);
    element.dataset.translated = 'pending';
    element.dataset.pendingSince = String(Date.now());

    this.ui.showTranslating(element);

    if (this.diagnostics) {
      this.diagnostics.recordDetectionSuccess(element, {
        hasPadreWordSpans: true,
        textLength: textToTranslate.length
      });
    }

    const startTime = Date.now();

    try {
      const translated = await this.translator.translate(textToTranslate, true);
      if (!translated) {
        element.dataset.translated = 'failed';
        element.dataset.translatedAt = String(Date.now());
        this.ui.showFailed(element);
        return;
      }
      let _hasCyrP = false;
      for (let i = 0; i < translated.length; i++) {
        const c = translated.charCodeAt(i);
        if (c >= 0x0400 && c <= 0x04FF) { _hasCyrP = true; break; }
      }
      if (!_hasCyrP) {
        delete element.dataset.originalHtml;
        delete element.dataset.originalText;
        delete element.dataset.cleanedFullText;
        delete element.dataset.pendingSince;
        element.dataset.translated = 'en-only';
        element.dataset.translatedAt = String(Date.now());
        return;
      }

      if (!element.isConnected) {
        this._inFlightTexts.delete(textKey);
        return;
      }

      element.innerHTML = '';
      const tLines = translated.split('\n');
      for (let i = 0; i < tLines.length; i++) {
        if (i > 0) {
          element.appendChild(document.createElement('br'));
          element.appendChild(document.createElement('br'));
        }
        if (tLines[i]) {

          if (mentionColor) {
            _OB_MENTION_SPLIT.lastIndex = 0;
            const parts = tLines[i].split(_OB_MENTION_SPLIT);
            for (const part of parts) {
              if (!part) continue;
              if (_OB_HANDLE_ONLY.test(part)) {
                const ms = document.createElement('span');
                ms.textContent = part;
                ms.style.color = mentionColor;
                element.appendChild(ms);
              } else {
                element.appendChild(document.createTextNode(part));
              }
            }
          } else {
            element.appendChild(document.createTextNode(tLines[i]));
          }
        }
      }

      if (extractedAddresses.length > 0) {
        for (const addr of extractedAddresses) {
          element.appendChild(document.createElement('br'));
          element.appendChild(document.createElement('br'));
          const addrSpan = document.createElement('span');
          addrSpan.textContent = addr;
          addrSpan.style.wordBreak = 'break-all';
          element.appendChild(addrSpan);
        }
      }

      if (extractedUrls.length > 0) {
        for (const url of extractedUrls) {
          const hr = document.createElement('hr');
          hr.style.border = 'none';
          hr.style.background = 'transparent';
          element.appendChild(hr);
          const link = document.createElement('a');
          link.href = url.startsWith('http') ? url : 'https://' + url;
          link.textContent = url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.className = 'tweet-url';
          if (urlColor) {
            link.style.color = urlColor;
            link.style.textDecoration = 'none';
          }
          element.appendChild(link);
        }
      }

      element.dataset.translatedHtml = element.innerHTML;
      element.dataset.translatedText = translated;
      element.dataset.cleanedFullText = cleanTweetText(getFullTextContent(element));
      element.dataset.translatedAt = String(Date.now());
      delete element.dataset.pendingSince;
      element.dataset.translated = 'true';
      this.ui.showTranslated(element);
      this._consecutiveErrors = 0;
      this._restartBackoffMs = 2000;

      const elapsed = Date.now() - startTime;

      if (this.diagnostics) {
        this.diagnostics.recordTranslationSuccess(
          textToTranslate, translated, 'auto', elapsed
        );
      }
    } catch (err) {
      if (element.dataset.originalHtml && element.isConnected) {
        element.innerHTML = element.dataset.originalHtml;
      }
      element.dataset.translated = 'failed';
      element.dataset.translatedAt = String(Date.now());
      delete element.dataset.pendingSince;
      this.ui.showFailed(element);
      this._consecutiveErrors++;

      if (this.diagnostics) {
        this.diagnostics.recordTranslationFailure(textToTranslate, err, 'auto');
      }

      if (this._consecutiveErrors >= this._maxConsecutiveErrors) {
        this._consecutiveErrors = 0;
        const backoff = this._restartBackoffMs;
        this._restartBackoffMs = Math.min(this._restartBackoffMs * 2, this._maxBackoffMs);
        this.stop();
        setTimeout(() => {
          if (this.isEnabled) this.start();
        }, backoff);
      }
    } finally {
      this._inFlightTexts.delete(textKey);
    }
  }

  _createTranslationPanel(element, translated, original) {
    if (element.nextElementSibling?.classList.contains('axiom-tx-panel')) return;

    const panel = document.createElement('div');
    panel.className = 'axiom-tx-panel';
    panel.textContent = translated;
    panel.dataset.translated = 'true';
    panel.dataset.translatedText = translated;
    panel.dataset.originalText = original || '';

    if (element.nextSibling) {
      element.parentNode.insertBefore(panel, element.nextSibling);
    } else {
      element.parentNode.appendChild(panel);
    }

    element.dataset.translated = 'panel';
    element.dataset.cleanedFullText = cleanTweetText(getFullTextContent(element));
    element.dataset.translatedAt = String(Date.now());

    this._consecutiveErrors = 0;
    this._restartBackoffMs = 2000;
  }
}
