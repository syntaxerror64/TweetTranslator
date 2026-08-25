const BLOCK_TAGS = new Set(['div', 'p', 'section', 'article', 'header', 'footer',
  'nav', 'aside', 'main', 'ul', 'ol', 'li', 'table', 'form', 'figure',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'details']);

const RADIX_SELECTOR = '[data-radix-popper-content-wrapper]';
const POPUP_CONTAINER_SELECTOR = RADIX_SELECTOR + ',[role="tooltip"],.pointer-events-auto.fixed';

const _OB_X_PROFILE = /^https?:\/\/(x\.com|twitter\.com)\/\w/i;
const _OB_TIME_AGO = /\b\d{1,3}[hmd]\b/i;
const _OB_MEMBERS = /\d+\s*Members/i;
const _OB_CREATED_BY = /Created by/i;
const _OB_REPLYING = /^Replying to\s+@/i;
const _OB_REPLYING_EXACT = /^Replying to\s+@\w+\s*$/i;
const _OB_HANDLE_START = /^@\w{1,15}/;
const _OB_JOINED = /Joined/i;
const _OB_JOINED_S = /Joined\s/i;
const _OB_FOLLOWERS_SIG = /\d[\d,.]*[KMBkmb]?\s*(followers|following)/i;
const _OB_PROFILE_PREFIX = /^[a-z][\w\s.\-·]*@\w{1,15}/i;
const _OB_STRIP_PREFIX = /^[\s\S]*?@\w{1,15}\s*/;
const _OB_STRIP_TIME = /^\d+[hmsд]\s*/i;

const _OB_HAS_CJK = /[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]/;

const _DELAYS_CATCHUP = [50, 200, 700];
const _DELAYS_POPUP_CHECK = [30, 100, 350, 800, 2000];
const _DELAYS_SCAN = [80, 250, 700, 1800, 3500];

function hasBlockChildren(el) {
  for (const child of el.children) {
    if (BLOCK_TAGS.has(child.tagName.toLowerCase())) return true;
  }
  return false;
}

function _hasOnlyBrChildren(el) {
  if (el.children.length === 0) return false;
  for (const child of el.children) {
    if (child.tagName !== 'BR') return false;
  }
  return true;
}

function _padWithOrigWhitespace(raw, translated) {
  if (!raw) return translated;
  let i = 0;
  while (i < raw.length && raw.charCodeAt(i) <= 32) i++;
  let j = raw.length;
  while (j > i && raw.charCodeAt(j - 1) <= 32) j--;
  return raw.slice(0, i) + translated + raw.slice(j);
}


const TEXT_BEARING_SELECTOR = 'div,span,p,a,section,article,h1,h2,h3,h4,h5,h6,blockquote,pre,li,td,th,label,figcaption,em,strong,b,i,small,dd,dt';

const _loggedFindTweet = new WeakSet();

function findTweetTextElements(popupRoot) {
  const rawRootText = popupRoot.textContent || '';
  const rootText = rawRootText.includes('Members') && rawRootText.includes('Created by')
    ? getSpacedTextContent(popupRoot) : '';
  if (rootText && _OB_MEMBERS.test(rootText) && _OB_CREATED_BY.test(rootText)) {
    const paras = popupRoot.querySelectorAll('p');
    for (const p of paras) {
      if (p.querySelector('a[href*="/communities/"]')) continue;
      if (p.closest('a[href*="/communities/"]')) continue;
      const text = cleanTweetText(getFullTextContent(p));
      if (text.length >= 20 && !isMetadataText(text)) {
        if (CONFIG.DEBUG) console.log('[AxiomTranslator]   Community: "' + text.substring(0, 80) + '" (' + text.length + 'ch)');
        return [p];
      }
    }
    const descEls = popupRoot.querySelectorAll('div,span');
    for (const el of descEls) {
      if (el.children.length > 5) continue;
      if (el.closest('a[href*="/communities/"]')) continue;
      if (el.querySelector('a[href*="/communities/"]')) continue;
      if (hasBlockChildren(el)) continue;
      const text = cleanTweetText(getFullTextContent(el));
      if (text.length >= 20 && !isMetadataText(text) && !isRussianText(text)) {
        if (CONFIG.DEBUG) console.log('[AxiomTranslator]   Community (non-p): "' + text.substring(0, 80) + '" (' + text.length + 'ch)');
        return [el];
      }
    }
    if (CONFIG.DEBUG) console.log('[AxiomTranslator]   Community popup — no description, skip');
    return [];
  }

  let textCandidates = [];
  let layoutCandidates = [];
  const broadCandidates = [];
  const _handleEls = [];

  const allElements = popupRoot.querySelectorAll(TEXT_BEARING_SELECTOR);

  let mediaContainers = null;
  if (popupRoot.querySelector('video,audio,iframe,noscript')) {
    mediaContainers = popupRoot.querySelectorAll('video,audio,iframe,noscript');
  }

  for (const el of allElements) {
    { const _t = el.textContent || '';
      if (_t.length < 30 && _OB_HANDLE_START.test(_t)) _handleEls.push(el); }

    if (el.children.length > 30) continue;

    const tn = el.tagName;
    if (tn === 'H1' || tn === 'H2' || tn === 'H3' || tn === 'H4' || tn === 'H5' || tn === 'H6') continue;
    if (el.closest('h1,h2,h3,h4,h5,h6')) continue;

    const ancestorLink = tn === 'A' ? el : el.closest('a');
    if (ancestorLink && ancestorLink.href) {
      if (ancestorLink.href.includes('/communities/')) continue;
      if (_OB_X_PROFILE.test(ancestorLink.href) && !ancestorLink.href.includes('/status/')) continue;
    }

    if (mediaContainers) {
      let insideMedia = false;
      for (const media of mediaContainers) {
        if (media.contains(el)) { insideMedia = true; break; }
      }
      if (insideMedia) continue;
    }

    const fullText = getFullTextContent(el);
    if (fullText.length < CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH) continue;

    const cleanedText = cleanTweetText(fullText);
    if (cleanedText.length < CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH) continue;

    if (isMetadataText(cleanedText)) continue;

    if (_OB_REPLYING.test(cleanedText) && hasBlockChildren(el)) continue;

    if (!ancestorLink) {
      const _childCommLink = el.querySelector?.('a[href*="/communities/"]');
      if (_childCommLink) {
        const commNameLen = getFullTextContent(_childCommLink).length;
        if (commNameLen >= fullText.length * 0.5) continue;
      }
    }

    if (fullText.length < 40 && el.parentElement &&
        el.parentElement.querySelector('i[class*="ri-map-pin"]')) continue;

    const isBroadContainer = CONFIG.DETECTION.HANDLE_REGEX.test(fullText) && _OB_JOINED.test(fullText) &&
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
      depth: depth,
      childCount: el.children.length
    };

    if (isBroadContainer) {
      broadCandidates.push(candidate);
    } else if (el.children.length === 0 || !hasBlockChildren(el)) {
      textCandidates.push(candidate);
    } else {
      layoutCandidates.push(candidate);
    }
  }

  if (_handleEls.length > 0) {
    const popupText = popupRoot.textContent || '';
    const isProfilePopup = _OB_JOINED_S.test(popupText) &&
        _OB_FOLLOWERS_SIG.test(popupText);

    const _isDisplayName = (c) => {
      if (c.length >= 40) return false;
      if (!isProfilePopup && !c.element.closest('.font-semibold, .font-bold')) return false;
      for (const h of _handleEls) {
        if (c.element.compareDocumentPosition(h) & 4) return true;
      }
      return false;
    };
    textCandidates = textCandidates.filter(c => !_isDisplayName(c));
    layoutCandidates = layoutCandidates.filter(c => !_isDisplayName(c));
  }

  let bestT1Len = 0;
  for (let i = 0; i < textCandidates.length; i++)
    if (textCandidates[i].length > bestT1Len) bestT1Len = textCandidates[i].length;
  let bestT2Len = 0;
  for (let i = 0; i < layoutCandidates.length; i++)
    if (layoutCandidates[i].length > bestT2Len) bestT2Len = layoutCandidates[i].length;
  let bestT3Len = 0;
  for (let i = 0; i < broadCandidates.length; i++)
    if (broadCandidates[i].length > bestT3Len) bestT3Len = broadCandidates[i].length;

  let candidates;
  if (textCandidates.length > 0) {
    if (bestT1Len < 40 && bestT2Len > bestT1Len * 3) {
      const nonOverlapping = layoutCandidates.filter(lc =>
        !textCandidates.some(tc => lc.element.contains(tc.element))
      );
      candidates = [...textCandidates, ...nonOverlapping];
    } else if (bestT1Len < 40 && bestT3Len > bestT1Len * 3) {
      const nonOverlapping = broadCandidates.filter(bc =>
        !textCandidates.some(tc => bc.element.contains(tc.element))
      );
      candidates = [...textCandidates, ...nonOverlapping];
    } else {
      candidates = textCandidates;
    }
  } else if (layoutCandidates.length > 0) {
    if (bestT2Len < 40 && bestT3Len > bestT2Len * 3 && broadCandidates.length > 0) {
      const nonOverlapping = broadCandidates.filter(bc =>
        !layoutCandidates.some(lc => bc.element.contains(lc.element))
      );
      candidates = [...layoutCandidates, ...nonOverlapping];
    } else {
      candidates = layoutCandidates;
    }
  } else {
    candidates = broadCandidates;
  }

  if (candidates.length === 0) return [];

  candidates.sort((a, b) => {
    const ratio = Math.min(a.length, b.length) / Math.max(a.length, b.length);
    if (ratio < 0.8) return b.length - a.length;
    return b.depth - a.depth;
  });

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
    if (CONFIG.DEBUG) console.log('[AxiomTranslator]   T3 FALLBACK → using T3 (' + broadCandidates[0].length + 'ch)');
  }

  if (CONFIG.DEBUG && !_loggedFindTweet.has(popupRoot)) {
    _loggedFindTweet.add(popupRoot);
    const tierUsed = candidates === textCandidates ? 'T1' : candidates === layoutCandidates ? 'T2' : 'T3';
    if (textCandidates.length > 0) {
      textCandidates.forEach((c, i) =>
        console.log('[AxiomTranslator]   T1[' + i + ']: "' + c.text.substring(0, 70) + '" (' + c.length + 'ch, depth=' + c.depth + ')')
      );
    }
    if (layoutCandidates.length > 0) {
      layoutCandidates.forEach((c, i) =>
        console.log('[AxiomTranslator]   T2[' + i + ']: "' + c.text.substring(0, 70) + '" (' + c.length + 'ch, depth=' + c.depth + ')')
      );
    }
    if (broadCandidates.length > 0) {
      console.log('[AxiomTranslator]   T3: ' + broadCandidates.length + ' broad, best=' + bestT3Len + 'ch');
    }
    if (results.length > 0) {
      results.forEach((r, i) =>
        console.log('[AxiomTranslator]   → result[' + i + '] (' + tierUsed + '): "' + r.text.substring(0, 80) + '" (' + r.length + 'ch)')
      );
    } else {
      console.log('[AxiomTranslator]   → nothing selected');
    }
  }


  const mainResults = results.map(r => r.element);

  if (mainResults.length > 0 && _OB_HAS_CJK.test(rawRootText)) {
    for (const el of allElements) {
      if (mainResults.includes(el)) continue;
      if (el.dataset?.translated) continue;
      if (hasBlockChildren(el)) continue;
      if (el.children.length > 10) continue;
      const etn = el.tagName;
      if (etn === 'H1' || etn === 'H2' || etn === 'H3' || etn === 'H4' || etn === 'H5' || etn === 'H6') continue;
      if (el.closest('h1,h2,h3,h4,h5,h6')) continue;
      const eLink = etn === 'A' ? el : el.closest('a');
      if (eLink && eLink.href) {
        if (eLink.href.includes('/communities/')) continue;
        if (_OB_X_PROFILE.test(eLink.href) && !eLink.href.includes('/status/')) continue;
      }
      const eText = cleanTweetText(getFullTextContent(el));
      if (eText.length < 15) continue;
      if (_OB_HAS_CJK.test(eText)) continue;
      if (isRussianText(eText)) continue;
      if (isMetadataText(eText)) continue;
      if (mainResults.some(m => el.contains(m))) continue;
      el._axiomEmbeddedTranslation = true;
      mainResults.push(el);
      if (CONFIG.DEBUG) console.log('[AxiomTranslator]   EMBEDDED: "' + eText.substring(0, 80) + '" (' + eText.length + 'ch)');
      break;
    }
  }

  return mainResults;
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
    this._loggedRoots = new WeakSet();
    this._popupId = 0;

    this._pcSet = new Set();
    this._pcQueue = [];
    this._pcMax = 200;
    this._pcCount = 0;
    this._pcScanned = new WeakSet();
    this._pcPending = [];
    this._pcDraining = false;

    this._scheduledDelayedChecks = new WeakSet();
  }


  start() {
    if (this.observer) this.stop();

    this.observer = new MutationObserver((mutations) => {
      if (!this.isEnabled) return;

      for (const m of mutations) {
        if (m.type !== 'childList') continue;
        for (const node of m.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE && node.matches?.(POPUP_CONTAINER_SELECTOR)) {
            const all = this._pendingMutations.length > 0
              ? this._pendingMutations.concat(mutations)
              : mutations;
            this._pendingMutations = [];
            this._processMutations(all);
            return;
          }
        }
      }

      for (let i = 0; i < mutations.length; i++) this._pendingMutations.push(mutations[i]);
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
      subtree: true
    });

    this._scheduleCatchupScan();
    this._startMouseDetection();
    this._startPopupPoller();
    this._startFeedPreCacher();
    if (CONFIG.DEBUG) console.log('[AxiomTranslator] Observer started (v3.3 — triple detection + pre-cache)');
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
    document.querySelectorAll(POPUP_CONTAINER_SELECTOR).forEach(el => {
      delete el._axiomTranslated;
      delete el._axiomFirstSeen;
      if (el._axiomWatcher) { el._axiomWatcher.disconnect(); delete el._axiomWatcher; }
    });
    if (CONFIG.DEBUG) console.log('[AxiomTranslator] Observer stopped');
  }

  setEnabled(enabled) {
    this.isEnabled = enabled;
  }

  _scheduleCatchupScan() {
    for (const delay of _DELAYS_CATCHUP) {
      setTimeout(() => {
        if (!this.isEnabled) return;
        const popups = document.querySelectorAll(POPUP_CONTAINER_SELECTOR);
        for (const popup of popups) {
          if (popup.querySelector('[data-translated="true"],[data-translated="pending"],.axiom-tx-panel')) continue;
          const popupInfo = this._checkPopup(popup);
          if (!popupInfo) continue;
          if (this.diagnostics) this.diagnostics.learnPopupPattern(popup);
          const elements = findTweetTextElements(popupInfo.popupRoot);
          this._processFoundElements(elements, popup);
          this._watchPopup(popupInfo.popupRoot, popup);
        }
      }, delay);
    }
  }


  _processMutations(mutations) {
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;

      for (const addedNode of mutation.addedNodes) {
        if (addedNode.nodeType !== Node.ELEMENT_NODE) continue;
        const tag = addedNode.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'LINK') continue;

        const matchesSelf = addedNode.matches?.(POPUP_CONTAINER_SELECTOR);
        const popupChild = !matchesSelf ? addedNode.querySelector?.(POPUP_CONTAINER_SELECTOR) : null;
        const isPopupContainer = !!(matchesSelf || popupChild);

        const nodeText = addedNode.textContent || '';
        const textLen = nodeText.length;

        if (textLen < 3 && !isPopupContainer) continue;

        if (textLen < 20 && !isPopupContainer) {
          if (addedNode.closest?.(POPUP_CONTAINER_SELECTOR)) {
            const ancestorPopup = this._findAncestorPopup(addedNode);
            if (ancestorPopup && !this._isStillTranslated(ancestorPopup.popupRoot)) {
              const elements = findTweetTextElements(ancestorPopup.popupRoot);
              this._processFoundElements(elements, addedNode);
              this._scheduleDelayedScan(ancestorPopup.popupRoot, addedNode);
              this._watchPopup(ancestorPopup.popupRoot, addedNode);
            }
          }
          continue;
        }

        const popupInfo = this._checkPopup(addedNode);

        if (!popupInfo) {
          if (isPopupContainer) {
            this._scheduleDelayedPopupCheck(addedNode);
            const earlyRoot = matchesSelf ? addedNode : popupChild;
            if (earlyRoot) this._watchPopup(earlyRoot, addedNode);
            continue;
          }

          if (textLen >= 20) {
            const ancestorPopup = this._findAncestorPopup(addedNode);
            if (ancestorPopup && !this._isStillTranslated(ancestorPopup.popupRoot)) {
              const elements = findTweetTextElements(ancestorPopup.popupRoot);
              this._processFoundElements(elements, addedNode);
              this._scheduleDelayedScan(ancestorPopup.popupRoot, addedNode);
              this._watchPopup(ancestorPopup.popupRoot, addedNode);
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

        const elements = findTweetTextElements(popupInfo.popupRoot);
        this._processFoundElements(elements, addedNode);
        this._scheduleDelayedScan(popupInfo.popupRoot, addedNode);
        this._watchPopup(popupInfo.popupRoot, addedNode);
      }
    }
  }


  _watchPopup(popupRoot, popupNode) {
    if (popupRoot._axiomWatcher) return;

    let debounceTimer = null;
    const rescan = () => {
      if (!popupRoot.isConnected || !this.isEnabled) { cleanup(); return; }
      const elements = findTweetTextElements(popupRoot);
      this._processFoundElements(elements, popupNode);
    };

    const obs = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(rescan, 50);
    });

    obs.observe(popupRoot, {
      childList: true,
      characterData: true,
      subtree: true
    });

    popupRoot._axiomWatcher = obs;

    const cleanup = () => {
      obs.disconnect();
      delete popupRoot._axiomWatcher;
      if (debounceTimer) clearTimeout(debounceTimer);
    };

    setTimeout(cleanup, 10000);
  }

  _isStillTranslated(popup) {
    if (!popup._axiomTranslated) return false;
    if (popup.querySelector('[data-translated="true"],[data-translated="pending"],.axiom-tx-panel')) {
      return true;
    }
    delete popup._axiomTranslated;
    delete popup._axiomFirstSeen;
    return false;
  }


  _checkPopup(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    let popupEl = node.matches?.(POPUP_CONTAINER_SELECTOR) ? node : null;
    if (!popupEl) {
      popupEl = node.querySelector(POPUP_CONTAINER_SELECTOR);
    }
    const isConfirmedPopup = !!popupEl;

    const allText = getSpacedTextContent(node);
    const checkText = allText.length > 600
      ? allText.substring(0, 300) + ' ' + allText.substring(allText.length - 300)
      : allText;

    const hasHandle = CONFIG.DETECTION.HANDLE_REGEX.test(checkText) || /@\s\w{1,15}/.test(checkText);
    const hasFollowers = CONFIG.DETECTION.FOLLOWERS_REGEX.test(checkText);
    const hasJoinDate = CONFIG.DETECTION.JOIN_DATE_REGEX.test(checkText);
    const hasTimeAgo = _OB_TIME_AGO.test(checkText);
    const hasMembersCount = _OB_MEMBERS.test(checkText);
    const twitterSignals = (hasHandle ? 1 : 0) + (hasFollowers ? 1 : 0) + (hasJoinDate ? 1 : 0) + (hasTimeAgo ? 1 : 0) + (hasMembersCount ? 1 : 0);

    if (isConfirmedPopup && popupEl) {
      const rect = popupEl.getBoundingClientRect();
      if (rect.width > 0 && rect.width < 200 && rect.height > 0 && rect.height < 60) {
        return null;
      }
    }

    let isLikelyPopup = (isConfirmedPopup && twitterSignals >= 1);

    if (!isLikelyPopup && !isConfirmedPopup && twitterSignals >= 1) {
      const cs = window.getComputedStyle(node);
      const isOverlay = (cs.position === 'fixed' || cs.position === 'absolute') &&
                        parseInt(cs.zIndex) >= 100;
      if (isOverlay && (
        twitterSignals >= CONFIG.DETECTION.MIN_TWITTER_SIGNALS ||
        (hasHandle && allText.length > 80)
      )) {
        isLikelyPopup = true;
      }
    }

    if (!isLikelyPopup) {
      if (CONFIG.DEBUG && twitterSignals > 0) {
        console.log('[AxiomTranslator]   REJECT: signals=' + twitterSignals +
          ' confirmed=' + isConfirmedPopup +
          ' handle=' + hasHandle + ' followers=' + hasFollowers +
          ' joined=' + hasJoinDate + ' timeAgo=' + hasTimeAgo +
          ' len=' + allText.length +
          ' text="' + allText.substring(0, 80).replace(/\n/g, ' ') + '..."');
      }
      return null;
    }

    const popupRoot = popupEl || node;

    if (CONFIG.DEBUG && !this._loggedRoots.has(popupRoot)) {
      this._loggedRoots.add(popupRoot);
      this._popupId++;
      popupRoot._pId = this._popupId;
      const container = isConfirmedPopup
        ? (popupEl.matches?.('[role="tooltip"]') ? 'tooltip' : 'radix')
        : 'unconfirmed';
      const nameMatch = allText.match(/^([^@]{1,40})@/);
      const displayName = nameMatch ? nameMatch[1].trim() : '?';
      console.log('[AxiomTranslator] ══ #' + this._popupId + ' TWEET | ' + container + ' | ' + displayName + ' ══');
      console.log('[AxiomTranslator]   signals: handle=' + hasHandle + ' followers=' + hasFollowers + ' joined=' + hasJoinDate + ' timeAgo=' + hasTimeAgo);
      console.log('[AxiomTranslator]   text: "' + allText.substring(0, 120).replace(/\n/g, ' ') + '..."');
    }

    return { popupRoot, isConfirmedPopup };
  }

  _processFoundElements(elements, popupNode) {
    const _now = Date.now();
    for (const el of elements) {
      const status = el.dataset.translated;
      if (status === 'pending') {
        const ps = parseInt(el.dataset.pendingSince || '0', 10);
        if (ps && _now - ps > 3000) {
          delete el.dataset.translated;
          delete el.dataset.pendingSince;
          if (CONFIG.DEBUG) console.log('[AxiomTranslator]   reset stuck pending (' + (_now - ps) + 'ms)');
        } else {
          continue;
        }
      }
      if (status === 'en-only') continue;
      if (status === 'url-only') continue;

      if (status === 'failed') {
        const failedAt = parseInt(el.dataset.translatedAt || '0', 10);
        if (_now - failedAt < 800) continue;
        delete el.dataset.translated;
        delete el.dataset.translatedAt;
      }

      if (status === 'true' || status === 'original' || status === 'panel') {
        if (status === 'original') continue;
        if (el.dataset.userToggled) continue;

        const currentText = cleanTweetText(getFullTextContent(el));
        const storedCleanText = el.dataset.cleanedFullText;
        if (storedCleanText && currentText === storedCleanText) continue;

        const translatedAt = parseInt(el.dataset.translatedAt || '0', 10);
        if (_now - translatedAt < 500) continue;

        if (CONFIG.DEBUG) console.log('[AxiomTranslator]   re-translating: content changed ("' + currentText.substring(0, 50) + '...")');
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
      if (el.matches?.(POPUP_CONTAINER_SELECTOR)) {
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

    for (const delay of _DELAYS_POPUP_CHECK) {
      setTimeout(() => {
        if (!node.isConnected || !this.isEnabled) return;
        if (node.querySelector('[data-translated="true"],[data-translated="original"],.axiom-tx-panel')) return;

        const popupInfo = this._checkPopup(node);
        if (!popupInfo) return;

        if (this.diagnostics) this.diagnostics.learnPopupPattern(node);
        const elements = findTweetTextElements(popupInfo.popupRoot);
        this._processFoundElements(elements, node);
        this._scheduleDelayedScan(popupInfo.popupRoot, node);
        this._watchPopup(popupInfo.popupRoot, node);
      }, delay);
    }
  }

  _scheduleDelayedScan(popupRoot, popupNode) {
    const now = Date.now();
    if (popupRoot._axiomDelayedScanAt && now - popupRoot._axiomDelayedScanAt < 50) return;
    popupRoot._axiomDelayedScanAt = now;
    for (const delay of _DELAYS_SCAN) {
      setTimeout(() => {
        if (!popupRoot.isConnected || !this.isEnabled) return;
        const pending = popupRoot.querySelectorAll('[data-translated="pending"]');
        for (const p of pending) {
          const pendingStart = parseInt(p.dataset.pendingSince || '0', 10);
          if (pendingStart && Date.now() - pendingStart > 3000) {
            delete p.dataset.translated;
            delete p.dataset.pendingSince;
          }
        }
        const elements = findTweetTextElements(popupRoot);
        this._processFoundElements(elements, popupNode);
      }, delay);
    }
  }

  _looksLikePopup(node) {
    if (node.querySelector(POPUP_CONTAINER_SELECTOR)) return true;
    if (node.matches?.('[role="dialog"]')) return true;
    if (node.parentElement === document.body) {
      const pos = node.style.position;
      if (pos === 'fixed' || pos === 'absolute') return true;
      if (!pos) {
        const cs = window.getComputedStyle(node);
        if (cs.position === 'fixed' || cs.position === 'absolute') return true;
      }
    }
    return false;
  }


  _startMouseDetection() {
    this._lastMouseCheck = 0;
    this._onMouseOver = (e) => {
      if (!this.isEnabled) return;
      const now = Date.now();
      if (now - this._lastMouseCheck < 100) return;
      this._lastMouseCheck = now;

      const popup = e.target.closest?.(POPUP_CONTAINER_SELECTOR);
      if (!popup) return;

      if (this._isStillTranslated(popup)) {
        const firstSeen = popup._axiomFirstSeen || 0;
        if (!firstSeen || now - firstSeen > 8000) return;
      }
      if (!popup._axiomFirstSeen) popup._axiomFirstSeen = now;

      const popupInfo = this._checkPopup(popup);
      if (!popupInfo) return;

      if (this.diagnostics) this.diagnostics.learnPopupPattern(popup);
      const elements = findTweetTextElements(popupInfo.popupRoot);
      this._processFoundElements(elements, popup);
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
      const popups = document.querySelectorAll(POPUP_CONTAINER_SELECTOR);
      for (const popup of popups) {
        if (!popup.isConnected) continue;

        if (this._isStillTranslated(popup)) {
          const firstSeen = popup._axiomFirstSeen || 0;
          if (!firstSeen || Date.now() - firstSeen > 8000) continue;
        }
        if (!popup._axiomFirstSeen) popup._axiomFirstSeen = Date.now();

        const popupInfo = this._checkPopup(popup);
        if (!popupInfo) continue;

        if (this.diagnostics) this.diagnostics.learnPopupPattern(popup);
        const elements = findTweetTextElements(popupInfo.popupRoot);
        this._processFoundElements(elements, popup);
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

    if (CONFIG.DEBUG) console.log('[AxiomTranslator] Pre-cacher ON (rolling ' + this._pcMax + ')');
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
    if (!this._pcRoot || !this._pcRoot.isConnected) {
      this._pcRoot = document.querySelector('main') ||
                     document.querySelector('[class*="feed"]') ||
                     document.querySelector('[class*="content"]') ||
                     document.body;
    }
    const root = this._pcRoot;
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

      if (el.closest(POPUP_CONTAINER_SELECTOR)) continue;

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

    if (text.length < 15 || text.length > 800) return;
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
      this._pcCount++;
      this.translator.translate(text).catch(() => {});

      if (CONFIG.DEBUG && (this._pcCount <= 10 || this._pcCount % 50 === 0)) {
        console.log('[AxiomTranslator] PRE-CACHE #' + this._pcCount + ' (queue:' + this._pcPending.length + '): "' + text.substring(0, 60) + '..."');
      }
    }

    if (this._pcPending.length > 0) {
      setTimeout(() => this._pcDrain(), 50 + Math.random() * 80);
    } else {
      this._pcDraining = false;
    }
  }

  _insertPanel(element, translated) {
    const panel = document.createElement('div');
    panel.className = 'axiom-tx-panel';
    panel.textContent = translated;
    panel.dataset.translated = 'true';
    panel.dataset.translatedAt = String(Date.now());
    if (translated.includes('\n')) panel.style.whiteSpace = 'pre-line';
    element.insertAdjacentElement('afterend', panel);
  }


  async _handleTweetFound(element, popupNode) {
    if (element.parentElement?.closest('[data-translated]') && !element._axiomEmbeddedTranslation) return;
    if (element.querySelector('[data-translated]')) return;
    if (element.nextElementSibling?.classList.contains('axiom-tx-panel')) return;

    const textNodes = collectTranslatableTextNodes(element);

    let domText = '';
    let isFragmented = false;
    let hasBrOnly = false;
    let brSegments = null;

    if (textNodes.length > 0) {
      const texts = textNodes.map(n => n.text);
      hasBrOnly = _hasOnlyBrChildren(element);
      let shortCount = 0;
      for (let i = 0; i < texts.length; i++) if (texts[i].length < 12) shortCount++;
      isFragmented = !hasBrOnly && textNodes.length >= 4 && (shortCount / textNodes.length) > 0.6;
      if (hasBrOnly) brSegments = texts;
      domText = isFragmented ? texts.join(' ') : texts.join('\n\n');
    } else {
      const rawFull = getFullTextContent(element);
      if (_OB_REPLYING_EXACT.test(rawFull)) return;
      if (element.querySelector('a[href*="/communities/"]') || element.closest('a[href*="/communities/"]')) return;
      domText = cleanTweetText(rawFull);
    }

    if (!domText || domText.length < CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH) return;
    if (isRussianText(domText)) return;
    if (isMetadataText(domText)) return;

    let textToTranslate = domText;
    const hasProfilePrefix = _OB_PROFILE_PREFIX.test(textToTranslate);
    if (hasProfilePrefix) {
      let stripped = textToTranslate.replace(_OB_STRIP_PREFIX, '');
      stripped = stripped.replace(_OB_STRIP_TIME, '');
      stripped = cleanTweetText(stripped);
      if (stripped && stripped.length >= CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH) {
        textToTranslate = stripped;
      }
    }

    if (textToTranslate.length < CONFIG.DETECTION.MIN_TWEET_TEXT_LENGTH || isRussianText(textToTranslate)) return;
    if (isMetadataText(textToTranslate)) return;

    const textKey = textToTranslate.substring(0, 120);
    const _flight = this._inFlightTexts.get(textKey);
    if (_flight && _flight.el.isConnected) return;
    const _now = Date.now();
    if (this._inFlightTexts.size > 300) {
      for (const [k, v] of this._inFlightTexts) {
        if (_now - v.ts > 10000) this._inFlightTexts.delete(k);
      }
    }
    this._inFlightTexts.set(textKey, { ts: _now, el: element });

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

    if (CONFIG.DEBUG) {
      const fragInfo = isFragmented ? ' (FRAG:' + textNodes.length + ')' : '';
      console.log('[AxiomTranslator]   translating' + fragInfo + ': "' + textToTranslate.substring(0, 100) + '..." (' + textToTranslate.length + 'ch)');
    }

    if (this.diagnostics) {
      this.diagnostics.recordDetectionSuccess(element, {
        hasRadix: !!popupNode?.querySelector?.('[data-radix-popper-content-wrapper]'),
        textLength: textToTranslate.length
      });
    }

    const startTime = Date.now();

    try {
      let translated = await this.translator.translate(textToTranslate);
      if (translated) {
        translated = translated.replace(_PP_TRAILING_COMMA_NL, '$1').replace(_PP_TRAILING_COMMA, '');
      }
      if (!translated) {
        element.dataset.translated = 'failed';
        this.ui.showFailed(element);
        return;
      }
      if (!element.isConnected) {
        this._inFlightTexts.delete(textKey);
        if (translated) {
          const pr = popupNode?.isConnected
            ? (popupNode.matches?.(POPUP_CONTAINER_SELECTOR) ? popupNode : popupNode.closest?.(POPUP_CONTAINER_SELECTOR))
            : null;
          if (pr?.isConnected) {
            const fe = findTweetTextElements(pr);
            this._processFoundElements(fe, popupNode);
          }
        }
        return;
      }


      if (!hasBrOnly && translated.includes('\n')) element.style.whiteSpace = 'pre-line';

      const nodesAlive = textNodes.length > 0 && textNodes[0].node.isConnected;
      let insertedVia = '';

      const hasEmbeds = element.children.length > 0 && hasBlockChildren(element);

      if (nodesAlive && isFragmented) {
        const alive = textNodes.filter(n => n.node.isConnected);
        if (alive.length > 0) {
          alive[0].node.textContent = _padWithOrigWhitespace(textNodes[0].raw, translated);
          for (let i = 1; i < alive.length; i++) alive[i].node.textContent = '';
          insertedVia = 'first-node (' + alive.length + ' spans)';
        } else if (hasEmbeds) {
          this._insertPanel(element, translated);
          insertedVia = 'panel (fragmented, has embeds)';
        } else {
          element.textContent = translated;
          insertedVia = 'textContent-fallback (fragmented, disconnected)';
        }

      } else if (nodesAlive && !isFragmented) {
        let parts = translated.split('\n\n');
        if (parts.length !== textNodes.length) parts = translated.split('\n');
        if (parts.length === textNodes.length) {
          for (let i = 0; i < textNodes.length; i++) {
            textNodes[i].node.textContent = _padWithOrigWhitespace(textNodes[i].raw, parts[i]);
          }
          insertedVia = 'node-by-node (' + textNodes.length + ')';
        } else if (hasBrOnly && brSegments && brSegments.length > 1) {
          const perParts = await Promise.all(
            brSegments.map(seg => this.translator.translate(seg).then(t => t || seg))
          );
          if (!element.isConnected) { this._inFlightTexts.delete(textKey); return; }
          for (let i = 0; i < textNodes.length; i++) {
            textNodes[i].node.textContent = _padWithOrigWhitespace(textNodes[i].raw, perParts[i] || '');
          }
          insertedVia = 'per-segment-br (' + textNodes.length + ' nodes)';
        } else if (hasEmbeds) {
          this._insertPanel(element, translated);
          insertedVia = 'panel (mismatch, has embeds)';
        } else {
          textNodes[0].node.textContent = _padWithOrigWhitespace(textNodes[0].raw, translated);
          for (let i = 1; i < textNodes.length; i++) {
            if (textNodes[i].node.isConnected) textNodes[i].node.textContent = '';
          }
          insertedVia = 'first-node (mismatch: ' + parts.length + ' parts vs ' + textNodes.length + ' nodes)';
        }

      } else if (!nodesAlive && textNodes.length > 0) {
        const fresh = collectTranslatableTextNodes(element);
        if (fresh.length > 0 && hasEmbeds && fresh.length > 1) {
          this._insertPanel(element, translated);
          insertedVia = 'panel (fresh multi, has embeds)';
        } else if (fresh.length > 0) {
          fresh[0].node.textContent = _padWithOrigWhitespace(fresh[0].raw, translated);
          for (let i = 1; i < fresh.length; i++) {
            if (fresh[i].node.isConnected) fresh[i].node.textContent = '';
          }
          insertedVia = 'fresh-nodes (' + fresh.length + ')';
        } else if (hasEmbeds) {
          this._insertPanel(element, translated);
          insertedVia = 'panel (fresh empty, has embeds)';
        } else {
          element.textContent = translated;
          insertedVia = 'textContent-fallback (fresh empty)';
        }

      } else if (hasEmbeds) {
        this._insertPanel(element, translated);
        insertedVia = 'panel (no nodes, has embeds)';
      } else {
        element.textContent = translated;
        insertedVia = 'textContent-fallback (no nodes)';
      }

      if (element._txNodes) {
        element._txTranslated = element._txNodes
          .filter(n => n.isConnected)
          .map(n => n.textContent);
      }
      element.dataset.translatedHtml = element.innerHTML;
      element.dataset.translatedText = translated;
      element.dataset.cleanedFullText = cleanTweetText(getFullTextContent(element));
      element.dataset.translatedAt = String(Date.now());
      element.dataset.translated = 'true';
      if (!hasBlockChildren(element)) {
        element.classList.add('axiom-tx-leaf');
      }
      let anc = element.parentElement;
      while (anc && anc !== document.body) {
        if (anc.matches?.(POPUP_CONTAINER_SELECTOR)) anc._axiomTranslated = true;
        anc = anc.parentElement;
      }
      this.ui.showTranslated(element);
      this._consecutiveErrors = 0;
      this._restartBackoffMs = 1000;

      const elapsed = Date.now() - startTime;
      if (CONFIG.DEBUG) {
        console.log('[AxiomTranslator]   ✓ OK (' + elapsed + 'ms, ' + insertedVia + '): "' + translated.substring(0, 80) + '..."');
      }

      if (this.diagnostics) {
        this.diagnostics.recordTranslationSuccess(
          textToTranslate, translated, 'auto', elapsed
        );
      }
    } catch (err) {
      console.warn('[AxiomTranslator] Translation failed:', err);
      if (element.dataset.originalHtml && element.isConnected) {
        element.innerHTML = element.dataset.originalHtml;
      }
      element.dataset.translated = 'failed';
      element.dataset.translatedAt = String(Date.now());
      this.ui.showFailed(element);
      this._consecutiveErrors++;

      if (this.diagnostics) {
        this.diagnostics.recordTranslationFailure(textToTranslate, err, 'auto');
      }

      if (this._consecutiveErrors >= this._maxConsecutiveErrors) {
        console.warn(`[AxiomTranslator] Too many errors, restarting in ${this._restartBackoffMs}ms...`);
        this._consecutiveErrors = 0;
        const backoff = this._restartBackoffMs;
        this._restartBackoffMs = Math.min(this._restartBackoffMs * 2, this._maxBackoffMs);
        this.stop();
        setTimeout(() => {
          if (this.isEnabled) this.start();
        }, backoff);
      }
    } finally {
      setTimeout(() => this._inFlightTexts.delete(textKey), 800);
    }
  }

}
