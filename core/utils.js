function textHash(text) {
  let hash = 5381;
  let prevSpace = true;
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c >= 65 && c <= 90) c += 32;
    if (c <= 32) {
      if (prevSpace) continue;
      prevSpace = true;
      c = 32;
    } else {
      prevSpace = false;
    }
    hash = ((hash << 5) + hash) + c;
  }
  return 'tx_' + (hash >>> 0).toString(36);
}

function isRussianText(text) {
  let cyr = 0, lat = 0;
  const len = text.length;
  const checkLen = len > 150 ? 150 : len;
  for (let i = 0; i < checkLen; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0x0400 && c <= 0x04FF) cyr++;
    else if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) lat++;
  }
  return cyr > lat && cyr > 3;
}


const _MT_HANDLE = /^@\w{1,15}$/;
const _MT_JOINED = /^Joined\s/i;
const _MT_FOLLOWER_COUNT = /^\d[\d,.]*[KMBkmb]?\s*(followers|following|members|views)/i;
const _MT_NUMBER = /^\d[\d,.]*[KMBkmb]?\s*$/i;
const _MT_TIME_AGO = /^\d+[hms]$/i;
const _MT_REPLYING = /^Replying to\s+@\w+$/i;
const _MT_TIMESTAMP = /^\d{1,2}:\d{2}\s*(AM|PM)/i;
const _MT_WALLET = /^[A-Za-z0-9]{30,}$/;
const _MT_URL = /^(https?:\/\/|[a-z0-9-]+\.[a-z]{2,}\/)\S*$/i;
const _MT_SHOW_MORE = /^(Show more|Show this thread|Read more( on \w+)?|Подробнее( на \w+)?)$/i;
const _MT_TOGGLE = /^(Hide|Show)\s+translation$/i;
const _MT_NAME_HANDLE = /^.+@\w{1,15}$/;
const _MT_CREATED = /^Created\s+(at\s+)?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i;
const _MT_VIEW_COMMUNITY = /^(?:View|See) community/i;
const _MT_SEE_PROFILE = /^See profile/i;
const _MT_BROWSER_SUPPORT = /^Your browser does not support/i;
const _MT_ENGAGEMENT = /^\d+\s*(likes?|retweets?|replies|quote tweets?|comments?)$/i;
const _MT_CREATED_BY = /^Created by$/i;
const _MT_MEMBERS = /^\d[\d,.]*[KMBkmb]?\s*Members$/i;
const _MT_STANDALONE_UI = /^(Following|Followers|Pinned|Joined|Likes?|Retweets?|Replies|Posts?)$/i;
const _MT_MONTH_YEAR = /^(Jan(uary)?|Feb(ruary)?|Mar(ch)?|Apr(il)?|May|June?|July?|Aug(ust)?|Sep(tember)?|Oct(ober)?|Nov(ember)?|Dec(ember)?)\s+\d{4}$/i;
const _MT_PROMOTED = /^(Promoted|Ad)$/i;
const _MT_UNAVAILABLE = /^(Unavailable|Content unavailable|This Post is unavailable)$/i;
const _MT_SEE_LESS = /^(See less|Показать меньше)$/i;
const _MT_UI_BUTTONS = /^(Pin(ned)?|Quote|Repost|Share|Copy link|Bookmark|Like|Reply|More)$/i;

const _UA_DOMAIN = /[a-z0-9-]+\.[a-z]{2,}(\/\S*)?$/i;

const _SK_HANDLE_WORD = /^\w{1,15}$/;
const _SK_MENTION = /^@\w{1,15}(\s*\+?\s*)$/;
const _SK_HANDLE_IN_TEXT = /@\w{1,15}/;
const _SK_HANDLE_EXTRACT = /^.*?@\w{1,15}\s*/;
const _SK_TIME_STRIP = /^\d+[hmsд]\s*/i;
const _SK_JOINED = /^Joined\s/i;
const _SK_JOINED_EXACT = /^Joined$/i;
const _SK_FOLLOWER = /^\d[\d,.]*[KMBkmb]?\s*(followers|following)/i;
const _SK_FOLLOWING = /^(Following|Followers|See profile.*)$/i;
const _SK_TIME_AGO = /^\d+[hmsд]$/i;
const _SK_TIME_UNIT = /^[hmsд]$/i;
const _SK_CREATED = /^Created\s+(at\s+)?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i;
const _SK_CREATED_EXACT = /^Created$/i;
const _SK_VIEW_COMMUNITY = /^(?:View|See) community/i;
const _SK_TRANSLATION_TOGGLE = /^(Hide|Show)\s+translation$/i;
const _SK_ENGAGEMENT = /^\d+\s*(likes?|retweets?|replies|quote tweets?|comments?)$/i;
const _SK_CREATED_BY = /^Created by$/i;
const _SK_MEMBERS_RE = /^\d[\d,.]*[KMBkmb]?\s*Members$/i;
const _SK_READ_MORE = /^(Read more|Подробнее)( (on|на) \w+)?$/i;
const _SK_TIMESTAMP = /^\d{1,2}:\d{2}\s*(AM|PM)/i;
const _SK_AM_PM = /^(AM|PM)\s*[·.]/i;
const _SK_DATE_RU = /^\d{1,2}\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i;
const _SK_DATE_EN = /^(Jan(uary)?|Feb(ruary)?|Mar(ch)?|Apr(il)?|May|June?|July?|Aug(ust)?|Sep(tember)?|Oct(ober)?|Nov(ember)?|Dec(ember)?)\s+\d/i;
const _SK_REPLYING = /^Replying to$/i;
const _SK_HASHTAG = /^#\w+$/;
const _SK_SHORT_NONALPHA = /[a-zA-Z\u0400-\u04FF]/;
const _SK_NUMBER = /^\d[\d,.]*[KMBkmb]?$/;
const _SK_WALLET = /^[A-Za-z0-9]{30,}$/;
const _SK_URL = /^(?:https?:\/\/|[a-z0-9-]+\.[a-z]{2,}\/)\S*$/i;

const _CT_WALLET = /\b[A-Za-z0-9]{30,}\b/g;
const _CT_URL_FULL = /https?:\/\/\S+/g;
const _CT_URL_TCO = /\bt\.co\/\S+/g;
const _CT_URL_DOMAIN = /\b[a-z0-9-]+\.[a-z]{2,}\/\S*/gi;
const _CT_TIMESTAMP = /\d{1,2}:\d{2}\s*(AM|PM)[,·\s]*(\w+\s+\d{1,2},?\s+\d{4})?/gi;
const _CT_JOINED = /Joined\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*(\s+\d{4})?/gi;
const _CT_FOLLOWERS = /\d[\d,.]*[KMBkmb]?\s*(followers|following|views)/gi;
const _CT_MEDIA = /Your browser does not support the (video|audio) tag\.?/gi;
const _CT_CREATED = /Created\s+(at\s+)?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*(\s+\d{4})?/gi;
const _CT_COMMUNITY = /(?:View|See) community( on\s+\w+)?\.?/gi;
const _CT_TRIM = /^\s*[,.\s·]+|[,.\s·]+\s*$/g;
const _CT_SPACES = /\s{2,}/g;
const _CT_P_PROFILE = /See profile( on\s+\w+)?\.?/gi;
const _CT_P_TOGGLE = /\b(Hide|Show)\s+translation\b/gi;
const _CT_P_CREATED_BY = /\bCreated by\b/gi;
const _CT_P_MEMBERS = /\d[\d,.]*[KMBkmb]?\s*Members/gi;
const _CT_P_READ_MORE = /(Подробнее|Read more)\s*(на|on)\s*\w+\.?/gi;
const _CT_P_TIMESTAMP_RU = /(AM|PM)\s*[·.]\s*\d{1,2}\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+\d{4}\s*(г\.?)?/gi;

function getFullTextContent(element) {
  return (element.textContent || '').trim();
}

function getSpacedTextContent(element) {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
  const parts = [];
  let node;
  while ((node = walker.nextNode())) {
    const t = node.textContent;
    if (t && t.trim()) parts.push(t.trim());
  }
  return parts.join(' ');
}

function withTimeout(promise, ms, controller) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (controller) controller.abort();
      reject(new Error('Timeout'));
    }, ms);
    promise.then(
      val => { clearTimeout(timer); resolve(val); },
      err => { clearTimeout(timer); reject(err); }
    );
  });
}

function isMetadataText(text) {
  const t = text.trim();
  if (t.length > 120) return false;
  if (_MT_HANDLE.test(t)) return true;
  if (_MT_JOINED.test(t)) return true;
  if (_MT_FOLLOWER_COUNT.test(t)) return true;
  if (_MT_NUMBER.test(t)) return true;
  if (_MT_TIME_AGO.test(t)) return true;
  if (_MT_REPLYING.test(t)) return true;
  if (_MT_TIMESTAMP.test(t)) return true;
  if (_MT_WALLET.test(t)) return true;
  if (_MT_URL.test(t)) return true;
  if (_MT_SHOW_MORE.test(t)) return true;
  if (_MT_TOGGLE.test(t)) return true;
  if (t.length <= 40 && _MT_NAME_HANDLE.test(t)) return true;
  if (_MT_CREATED.test(t)) return true;
  if (_MT_VIEW_COMMUNITY.test(t)) return true;
  if (_MT_SEE_PROFILE.test(t)) return true;
  if (_MT_BROWSER_SUPPORT.test(t)) return true;
  if (_MT_ENGAGEMENT.test(t)) return true;
  if (_MT_CREATED_BY.test(t)) return true;
  if (_MT_MEMBERS.test(t)) return true;
  if (_MT_STANDALONE_UI.test(t)) return true;
  if (_MT_MONTH_YEAR.test(t)) return true;
  if (_MT_PROMOTED.test(t)) return true;
  if (_MT_UNAVAILABLE.test(t)) return true;
  if (_MT_SEE_LESS.test(t)) return true;
  if (_MT_UI_BUTTONS.test(t)) return true;
  return false;
}

function isInsideUrlAnchor(node) {
  let el = node.parentElement;
  while (el) {
    if (el.tagName === 'A') {
      const href = el.getAttribute('href') || '';
      if (!href.startsWith('http') && !href.startsWith('//')) return false;
      const linkText = (el.textContent || '').trim();
      if (linkText.length > 120) return false;
      if (linkText.includes(' ')) {
        if (_UA_DOMAIN.test(linkText)) return true;
        return false;
      }
      return true;
    }
    el = el.parentElement;
  }
  return false;
}

function collectTranslatableTextNodes(element) {
  const elText = getSpacedTextContent(element);
  const isBroadPopup = _SK_HANDLE_IN_TEXT.test(elText) && _SK_JOINED.test(elText);

  const result = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);

  let foundHandle = !isBroadPopup;
  let collectingTweet = false;
  let lastWasBareAt = false;

  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent;
    if (!text || !text.trim()) continue;

    if (isInsideUrlAnchor(node)) continue;

    if (node.parentElement?.closest?.('a[href*="/communities/"]')) continue;

    const _profileLink = node.parentElement?.closest?.('a[href*="x.com/"],a[href*="twitter.com/"]');
    if (_profileLink && !_profileLink.href?.includes('/status/')) continue;

    if (node.parentElement?.className?.includes?.("font-['IBM_Plex_Sans']")) continue;

    const trimmed = text.trim();

    if (trimmed === '@') {
      lastWasBareAt = true;
      continue;
    }
    if (lastWasBareAt && _SK_HANDLE_WORD.test(trimmed)) {
      lastWasBareAt = false;
      if (isBroadPopup) {
        if (!foundHandle) {
          foundHandle = true;
        } else if (collectingTweet) {
          break;
        }
      } else if (result.length > 0) {
        const collectedLen = result.reduce((s, r) => s + r.text.length, 0);
        if (collectedLen >= 40) break;
        result.length = 0;
      }
      continue;
    }
    lastWasBareAt = false;

    if (_SK_MENTION.test(trimmed)) {
      if (isBroadPopup) {
        if (!foundHandle) {
          foundHandle = true;
        } else if (collectingTweet) {
          break;
        }
      } else if (result.length > 0) {
        const collectedLen = result.reduce((s, r) => s + r.text.length, 0);
        if (collectedLen >= 40) break;
        result.length = 0;
      }
      continue;
    }

    if (node.parentElement?.closest?.('h1,h2,h3,h4,h5,h6')) continue;

    if (node.parentElement?.classList?.contains('MuiTypography-noWrap')) continue;

    if (!foundHandle) {
      if (_SK_HANDLE_IN_TEXT.test(trimmed)) {
        foundHandle = true;
        const afterHandle = trimmed.replace(_SK_HANDLE_EXTRACT, '');
        const afterTime = afterHandle.replace(_SK_TIME_STRIP, '');
        if (afterTime.length >= 5 && !isMetadataText(afterTime)) {
          collectingTweet = true;
          result.push({ node: node, text: afterTime, raw: text });
        }
      }
      continue;
    }

    if (_SK_JOINED.test(trimmed)) continue;
    if (_SK_JOINED_EXACT.test(trimmed)) continue;
    if (_SK_FOLLOWER.test(trimmed)) continue;
    if (_SK_FOLLOWING.test(trimmed)) continue;
    if (_SK_TIME_AGO.test(trimmed)) continue;
    if (_SK_TIME_UNIT.test(trimmed)) continue;
    if (_SK_CREATED.test(trimmed)) continue;
    if (_SK_CREATED_EXACT.test(trimmed)) continue;
    if (_SK_VIEW_COMMUNITY.test(trimmed)) continue;
    if (_SK_TRANSLATION_TOGGLE.test(trimmed)) continue;
    if (_SK_ENGAGEMENT.test(trimmed)) continue;
    if (_SK_CREATED_BY.test(trimmed)) continue;
    if (_SK_MEMBERS_RE.test(trimmed)) continue;
    if (_SK_READ_MORE.test(trimmed)) continue;
    if (_SK_TIMESTAMP.test(trimmed)) continue;
    if (_SK_AM_PM.test(trimmed)) continue;
    if (_SK_DATE_RU.test(trimmed)) continue;
    if (_SK_DATE_EN.test(trimmed)) continue;
    if (_SK_REPLYING.test(trimmed)) continue;
    if (_SK_HASHTAG.test(trimmed)) continue;
    if (trimmed.length < 3 && !_SK_SHORT_NONALPHA.test(trimmed)) continue;
    if (_SK_NUMBER.test(trimmed)) continue;
    if (_SK_WALLET.test(trimmed)) continue;
    if (_SK_URL.test(trimmed)) continue;

    result.push({ node, text: trimmed, raw: text });
    if (isBroadPopup) collectingTweet = true;
  }

  return result;
}

const _cleanTextCache = new Map();
const _CLEAN_CACHE_MAX = 200;

function cleanTweetText(text, options) {
  const stripUrls = !options || options.stripUrls !== false;
  const cacheKey = (stripUrls ? '' : 'u:') + text;
  const cached = _cleanTextCache.get(cacheKey);
  if (cached !== undefined) {
    _cleanTextCache.delete(cacheKey);
    _cleanTextCache.set(cacheKey, cached);
    return cached;
  }

  let cleaned = text;

  if (stripUrls) {
    cleaned = cleaned.replace(_CT_URL_FULL, '');
    cleaned = cleaned.replace(_CT_URL_TCO, '');
    cleaned = cleaned.replace(_CT_URL_DOMAIN, '');
  }
  cleaned = cleaned.replace(_CT_WALLET, '');
  cleaned = cleaned.replace(_CT_P_TIMESTAMP_RU, '');
  cleaned = cleaned.replace(_CT_JOINED, '');
  cleaned = cleaned.replace(_CT_FOLLOWERS, '');
  cleaned = cleaned.replace(_CT_MEDIA, '');
  cleaned = cleaned.replace(_CT_CREATED, '');
  cleaned = cleaned.replace(_CT_COMMUNITY, '');

  cleaned = cleaned.replace(_CT_P_PROFILE, '');
  cleaned = cleaned.replace(_CT_P_TOGGLE, '');
  cleaned = cleaned.replace(_CT_P_CREATED_BY, '');
  cleaned = cleaned.replace(_CT_P_MEMBERS, '');
  cleaned = cleaned.replace(_CT_P_READ_MORE, '');
  cleaned = cleaned.replace(_CT_TIMESTAMP, '');

  cleaned = cleaned.replace(_CT_TRIM, '');
  cleaned = cleaned.replace(_CT_SPACES, ' ').trim();

  if (_cleanTextCache.size >= _CLEAN_CACHE_MAX) {
    const first = _cleanTextCache.keys().next().value;
    _cleanTextCache.delete(first);
  }
  _cleanTextCache.set(cacheKey, cleaned);

  return cleaned;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    textHash, isRussianText, getFullTextContent, getSpacedTextContent,
    withTimeout, isMetadataText, isInsideUrlAnchor,
    collectTranslatableTextNodes, cleanTweetText
  };
}
