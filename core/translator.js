class RateLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'RateLimitError';
  }
}


const _PP_NL_TRIM = / *\n */g;
const _PP_MULTI_SPACE = /  +/g;

const _API_ERROR_RE = /QUERY\.LENGTH|LIMIT\.EXCEEDED|MAX\.ALLOWED|MYMEMORY WARNING|YOU USED ALL|INVALID LANGUAGE PAIR/i;
const _MOZHI_ERROR_RE = /QUERY\.LENGTH|LIMIT\.EXCEEDED|MAX\.ALLOWED/i;

const _PP_RT_PREFIX = /^(RT\s+@[A-Za-z_][A-Za-z0-9_]{0,14}:?\s*)/i;
const _PP_PLACEHOLDER = /§\s*(\d+)\s*§/g;
const _PP_SPACE_PUNCT = / ([.,;:!?)])/g;
const _PP_NEWLINE_PUNCT = /(\n+)\s*([.!?,;:])\s*/g;
const _PP_DUP_PUNCT = /([.,;:!?])\1+/g;
const _PP_NL_DOT = /\n\s*\.(?!\.)/g;
const _PP_LEADING_DOT = /^\.(?!\.)\s*/;
const _PP_TRAILING_COMMA_NL = /,(\s*\n\n)/g;
const _PP_TRAILING_COMMA = /,\s*$/;
const _PP_SPACE_AFTER_PUNCT = /([.,;:!?])([A-ZА-Яa-zа-я])/g;
const _PP_HTML_APOS = /&#39;/g;
const _PP_HTML_QUOT = /&quot;/g;
const _PP_HTML_AMP = /&amp;/g;
const _PP_SENT_SPLIT = /(?<=[.!?])\s+/;
const _PP_STRIP_PH = /§\d+§/g;
const _PP_RESTORE_PH = /§(\d+)§/g;
const _PP_WORD_SPLIT = /\s+/;

class TextPreprocessor {
  constructor() {
    this._buildRegex();
  }

  _buildRegex() {
    const cp = CONFIG.CRYPTO_PRESERVE;
    const multi = [...cp.MULTI_WORD].sort((a, b) => b.length - a.length);
    const single = [...cp.SINGLE_WORD].sort((a, b) => b.length - a.length);

    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const parts = [];
    for (const term of multi) parts.push(esc(term));
    for (const term of single) parts.push(esc(term));

    this._regex = new RegExp(
      '(' +
        '\\$[A-Za-z][A-Za-z0-9]{0,15}' +
        '|@[A-Za-z_][A-Za-z0-9_]{0,14}' +
        '|https?:\\/\\/[^\\s<>\"]{3,}' +
        '|\\bt\\.co\\/[A-Za-z0-9]+' +
        '|\\b(?:[a-zA-Z0-9-]+\\.)+[a-zA-Z]{2,}(?:\\/[^\\s<>\"]*)?' +
        '|\\b(?:' + parts.join('|') + ')\\b' +
      ')',
      'gi'
    );
  }

  preprocess(text) {
    const placeholders = [];
    let processed = text.replace(_PP_RT_PREFIX, (match) => {
      const idx = placeholders.length;
      placeholders.push(match);
      return '§' + idx + '§ ';
    });
    const cleanText = processed.replace(this._regex, (match) => {
      const idx = placeholders.length;
      placeholders.push(match);
      return '§' + idx + '§';
    });
    return { cleanText, placeholders };
  }

  postprocess(translated, placeholders) {
    if (placeholders.length === 0) return this._cleanArtifacts(translated);

    let result = this._cleanArtifacts(translated);

    const restored = new Set();
    result = result.replace(_PP_PLACEHOLDER, (match, idx) => {
      const i = parseInt(idx, 10);
      if (i < placeholders.length) {
        restored.add(i);
        return placeholders[i];
      }
      return match;
    });

    for (let i = 0; i < placeholders.length; i++) {
      if (!restored.has(i)) result += ' ' + placeholders[i];
    }

    result = result.replace(_PP_SPACE_PUNCT, '$1');
    result = result.replace(_PP_NEWLINE_PUNCT, '$2$1');
    result = result.replace(_PP_SPACE_PUNCT, '$1');
    result = result.replace(_PP_DUP_PUNCT, '$1');
    result = result.replace(_PP_NL_DOT, '\n');
    result = result.replace(_PP_LEADING_DOT, '');
    result = result.replace(_PP_NL_TRIM, '\n');

    result = result.replace(_PP_TRAILING_COMMA_NL, '$1').replace(_PP_TRAILING_COMMA, '');

    return result.replace(_PP_MULTI_SPACE, ' ').trim();
  }

  _cleanArtifacts(text) {
    let r = text;
    r = r.replace(_PP_MULTI_SPACE, ' ');
    r = r.replace(_PP_SPACE_PUNCT, '$1');
    r = r.replace(_PP_SPACE_AFTER_PUNCT, '$1 $2');
    r = r.replace(_PP_HTML_APOS, "'");
    r = r.replace(_PP_HTML_QUOT, '"');
    r = r.replace(_PP_HTML_AMP, '&');
    r = r.trim();
    return r;
  }
}


class CircuitBreaker {
  constructor(name, failureThreshold, resetTimeoutMs) {
    this.name = name;
    this.failureCount = 0;
    this.failureThreshold = failureThreshold;
    this.resetTimeoutMs = resetTimeoutMs;
    this.state = 'CLOSED';
    this.lastFailureTime = 0;
    this._halfOpenProbing = false;
  }

  isDisabled() {
    if (this.state === 'CLOSED') return false;
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeoutMs) {
        this.state = 'HALF_OPEN';
        if (this._halfOpenProbing) return true;
        this._halfOpenProbing = true;
        return false;
      }
      return true;
    }
    if (this._halfOpenProbing) return true;
    this._halfOpenProbing = true;
    return false;
  }

  recordSuccess() {
    this.failureCount = 0;
    this.state = 'CLOSED';
    this._halfOpenProbing = false;
  }

  recordFailure() {
    const wasHalfOpen = this.state === 'HALF_OPEN';
    this._halfOpenProbing = false;
    this.failureCount++;
    this.lastFailureTime = Date.now();
    if (wasHalfOpen || this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
}


class RateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.timestamps = [];
    this._head = 0;
  }

  canProceed() {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    while (this._head < this.timestamps.length && this.timestamps[this._head] <= cutoff) {
      this._head++;
    }
    if (this._head > 100) {
      this.timestamps = this.timestamps.slice(this._head);
      this._head = 0;
    }
    return (this.timestamps.length - this._head) < this.maxRequests;
  }

  record() {
    this.timestamps.push(Date.now());
  }

  async waitAndProceed() {
    if (this.canProceed()) {
      this.record();
      return;
    }
    const oldest = this.timestamps[this._head];
    const waitMs = Math.max(0, this.windowMs - (Date.now() - oldest) + 1);
    await new Promise(r => setTimeout(r, waitMs));
    while (!this.canProceed()) {
      const nextOldest = this.timestamps[this._head];
      const nextWait = Math.max(0, this.windowMs - (Date.now() - nextOldest) + 1);
      await new Promise(r => setTimeout(r, nextWait));
    }
    this.record();
  }
}


class TranslationQueue {
  constructor(translateFn, concurrency = CONFIG.QUEUE.MAX_CONCURRENCY) {
    this.translateFn = translateFn;
    this.concurrency = concurrency;
    this.queue = [];
    this.priorityQueue = [];
    this.active = 0;
    this.dedupeMap = new Map();
  }

  enqueue(text, priority = false) {
    if (this.dedupeMap.has(text)) {
      if (priority) {
        const idx = this.queue.findIndex(item => item.text === text);
        if (idx !== -1) {
          const [item] = this.queue.splice(idx, 1);
          this.priorityQueue.push(item);
          this._processNext();
        }
      }
      return this.dedupeMap.get(text);
    }

    const promise = new Promise((resolve, reject) => {
      if (priority) {
        this.priorityQueue.push({ text, resolve, reject });
      } else {
        this.queue.push({ text, resolve, reject });
      }
      this._processNext();
    });

    this.dedupeMap.set(text, promise);
    promise.then(
      () => this.dedupeMap.delete(text),
      () => this.dedupeMap.delete(text)
    );

    return promise;
  }

  _processNext() {
    while (this.priorityQueue.length > 0 && this.active < this.concurrency + 5) {
      this.active++;
      const item = this.priorityQueue.shift();
      this._run(item.text, item.resolve, item.reject, true);
    }
    while (this.active < this.concurrency && this.queue.length > 0) {
      this.active++;
      const item = this.queue.shift();
      this._run(item.text, item.resolve, item.reject, false);
    }
  }

  async _run(text, resolve, reject, priority) {
    try {
      const result = await this.translateFn(text, priority);
      resolve(result);
    } catch (err) {
      reject(err);
    } finally {
      this.active--;
      this._processNext();
    }
  }
}


class TranslationService {
  constructor(cache, diagnostics) {
    this.cache = cache;
    this.diagnostics = diagnostics || null;
    this.preprocessor = new TextPreprocessor();
    this.rateLimiter = new RateLimiter(
      CONFIG.QUEUE.RATE_LIMIT_MAX,
      CONFIG.QUEUE.RATE_LIMIT_WINDOW_MS
    );

    this._mozhiLatency = new Map();
    this._lastGoogleMs = 0;
    this._lingvaIndex = Math.floor(Math.random() * (CONFIG.APIS.LINGVA.instances?.length || 1));

    const mozhiInstances = CONFIG.APIS.MOZHI.instances;
    this._mozhiApis = mozhiInstances.map(url => {
      const host = new URL(url).hostname;
      const short = host.split('.').slice(-2, -1)[0];
      return {
        name: 'Mozhi (' + short + ')',
        breaker: new CircuitBreaker('mozhi_' + short, CONFIG.APIS.MOZHI.breakerThreshold, CONFIG.APIS.MOZHI.breakerResetMs),
        translate: (text, signal) => this._mozhiDirectTranslate(url, text, signal),
        timeout: CONFIG.APIS.MOZHI.timeout,
        _mozhiUrl: url,
        _isMozhi: true
      };
    });

    this.apis = [
      {
        name: CONFIG.APIS.GOOGLE.name,
        breaker: new CircuitBreaker('google', CONFIG.APIS.GOOGLE.breakerThreshold, CONFIG.APIS.GOOGLE.breakerResetMs),
        translate: (text, signal) => this._googleTranslate(text, signal),
        timeout: CONFIG.APIS.GOOGLE.timeout
      },
      ...this._mozhiApis,
      {
        name: CONFIG.APIS.SIMPLYTRANSLATE.name,
        breaker: new CircuitBreaker('simplytranslate', CONFIG.APIS.SIMPLYTRANSLATE.breakerThreshold, CONFIG.APIS.SIMPLYTRANSLATE.breakerResetMs),
        translate: (text, signal) => this._simplyTranslate(text, signal),
        timeout: CONFIG.APIS.SIMPLYTRANSLATE.timeout
      },
      {
        name: CONFIG.APIS.LINGVA.name,
        breaker: new CircuitBreaker('lingva', CONFIG.APIS.LINGVA.breakerThreshold, CONFIG.APIS.LINGVA.breakerResetMs),
        translate: (text, signal) => this._lingvaTranslate(text, signal),
        timeout: CONFIG.APIS.LINGVA.timeout
      },
      {
        name: CONFIG.APIS.MYMEMORY.name,
        breaker: new CircuitBreaker('mymemory', CONFIG.APIS.MYMEMORY.breakerThreshold, CONFIG.APIS.MYMEMORY.breakerResetMs),
        translate: (text, signal) => this._myMemoryTranslate(text, signal),
        timeout: CONFIG.APIS.MYMEMORY.timeout
      }
    ];

    this.queue = new TranslationQueue(
      (text, priority) => this._translateWithFallback(text, priority),
      CONFIG.QUEUE.MAX_CONCURRENCY
    );

    this.stats = { translated: 0, cached: 0, errors: 0, preserved: 0 };
    this.lastUsedApi = '';
    this._reportScheduled = false;
    this._reportTimer = null;
    this._lastReportTime = 0;

    this._chromeSession = null;
    this._chromeAvailable = false;
    this._initChromeTranslator();
  }


  async translate(text, priority = false) {
    if (!text || text.length < 3) return null;
    if (text.length > 4500) {
      text = text.substring(0, 4500);
    }

    const hash = textHash(text);
    const cached = this.cache.get(hash);
    if (cached) {
      this.stats.cached++;
      if (this.diagnostics) this.diagnostics.recordCacheHit();
      this._reportStats();
      return cached;
    }

    if (text.length > 480) {
      return this._translateLong(text, hash, priority);
    }

    try {
      const result = await this.queue.enqueue(text, priority);
      return result;
    } catch (err) {
      this.stats.errors++;
      this._reportStats();
      return null;
    }
  }


  async _translateLong(text, hash, priority) {
    let paras = text.split('\n\n');
    let sep = '\n\n';
    if (paras.length <= 1 && text.includes('\n')) {
      paras = text.split('\n');
      sep = '\n';
    }

    const tasks = [];
    for (let pi = 0; pi < paras.length; pi++) {
      const p = paras[pi].trim();
      if (!p || p.length < 3) {
        tasks.push({ pi, si: 0, text: p, skip: true });
        continue;
      }
      if (p.length <= 350) {
        tasks.push({ pi, si: 0, text: p, skip: false });
      } else {
        const subs = this._splitParagraph(p, 350);
        for (let si = 0; si < subs.length; si++) {
          tasks.push({ pi, si, text: subs[si], skip: false });
        }
      }
    }

    const toTranslate = tasks.filter(t => !t.skip);
    if (toTranslate.length === 0) {
      const result = paras.join(sep);
      this.cache.set(hash, result);
      return result;
    }

    try {
      for (let i = 0; i < toTranslate.length; i += 2) {
        const batch = [this.queue.enqueue(toTranslate[i].text, priority).catch(() => null)];
        if (i + 1 < toTranslate.length) {
          batch.push(this.queue.enqueue(toTranslate[i + 1].text, priority).catch(() => null));
        }
        const br = await Promise.all(batch);
        toTranslate[i]._result = br[0];
        if (i + 1 < toTranslate.length) toTranslate[i + 1]._result = br[1];
      }

      if (toTranslate.every(t => !t._result)) {
        console.warn('[AxiomTranslator] Long text: ALL ' + toTranslate.length + ' chunks failed for "' + text.substring(0, 80) + '..." (' + text.length + 'ch)');
        this.stats.errors++;
        this._reportStats();
        return null;
      }

      const paraResults = paras.map(p => p.trim());
      for (const t of tasks) {
        if (t.skip) continue;
        if (t.si === 0) {
          paraResults[t.pi] = t._result || t.text;
        } else {
          paraResults[t.pi] += ' ' + (t._result || t.text);
        }
      }

      const result = paraResults.join(sep);
      this.cache.set(hash, result);
      this.stats.translated++;
      this._reportStats();
      if (CONFIG.DEBUG) {
        console.log('[AxiomTranslator] Chunked ' + toTranslate.length + ' parts (' + paras.length + ' paras) for ' + text.length + ' chars');
      }
      return result;
    } catch (err) {
      this.stats.errors++;
      this._reportStats();
      return null;
    }
  }

  _splitParagraph(text, maxLen) {
    const chunks = [];
    const sents = text.split(_PP_SENT_SPLIT);
    let buf = '';
    for (const s of sents) {
      if (s.length > maxLen) {
        if (buf) { chunks.push(buf); buf = ''; }
        const words = s.split(_PP_WORD_SPLIT);
        for (const w of words) {
          if (buf && buf.length + w.length + 1 > maxLen) {
            chunks.push(buf);
            buf = '';
          }
          buf += (buf ? ' ' : '') + w;
        }
      } else {
        if (buf && buf.length + s.length + 1 > maxLen) {
          chunks.push(buf);
          buf = '';
        }
        buf += (buf ? ' ' : '') + s;
      }
    }
    if (buf) chunks.push(buf);
    return chunks.length > 0 ? chunks : [text];
  }


  async _translateWithFallback(text, priority = false) {
    const { cleanText, placeholders } = this.preprocessor.preprocess(text);

    if (placeholders.length > 0) {
      this.stats.preserved += placeholders.length;
    }

    const strippedCheck = cleanText.replace(_PP_STRIP_PH, '').trim();
    if (strippedCheck.length < 3) {
      let result = cleanText.replace(_PP_RESTORE_PH, (_, idx) => {
        const i = parseInt(idx, 10);
        return i < placeholders.length ? placeholders[i] : _;
      });
      const hash = textHash(text);
      this.cache.set(hash, result.trim());
      return result.trim();
    }

    const t0 = Date.now();

    if (this._chromeAvailable) {
      const chromeRaw = await this._chromeTranslate(cleanText);
      if (chromeRaw) {
        const finalResult = this.preprocessor.postprocess(chromeRaw, placeholders);
        const hash = textHash(text);
        this.cache.set(hash, finalResult);
        this.stats.translated++;
        this.lastUsedApi = CONFIG.APIS.CHROME_TRANSLATOR.name;
        this._reportStats();
        if (CONFIG.DEBUG) {
          console.log('[AxiomTranslator] OK via Chrome Translator (' + (Date.now() - t0) + 'ms): "' + finalResult.substring(0, 60) + '..."');
        }
        return finalResult;
      }
    }

    if (!priority) {
      await this.rateLimiter.waitAndProceed();
    } else {
      this.rateLimiter.record();
    }

    const available = this.apis.filter(a => !a.breaker.isDisabled());

    if (available.length === 0) {
      const statuses = this.apis.map(a => a.name + ' [' + a.breaker.state + ', ' + a.breaker.failureCount + ' fails]');
      console.error('[AxiomTranslator] NO APIs AVAILABLE \u2014 all circuit breakers open:\n  \u2022 ' + statuses.join('\n  \u2022 ') + '\n  Text: "' + text.substring(0, 80) + '..."');
      throw new Error('All translation APIs failed');
    }

    {
      const skipped = this.apis.filter(a => a.breaker.isDisabled());
      if (skipped.length > 0 && skipped.length !== this._lastBreakerLogCount) {
        this._lastBreakerLogCount = skipped.length;
        console.warn('[AxiomTranslator] Circuit breakers OPEN (' + skipped.length + '/' + this.apis.length + '): ' + skipped.map(a => a.name).join(', '));
      }
      if (skipped.length === 0 && this._lastBreakerLogCount > 0) {
        this._lastBreakerLogCount = 0;
        console.log('[AxiomTranslator] All circuit breakers recovered');
      }
    }

    if (available.length >= 2) {
      const rawResult = await this._waveRace(available, cleanText);
      if (rawResult) {
        const finalResult = this.preprocessor.postprocess(rawResult.raw, placeholders);
        const hash = textHash(text);
        this.cache.set(hash, finalResult);
        this.stats.translated++;
        this.lastUsedApi = rawResult.api.name;
        this._reportStats();
        if (CONFIG.DEBUG) {
          console.log('[AxiomTranslator] OK via ' + rawResult.api.name + ' (' + (Date.now() - t0) + 'ms): "' + finalResult.substring(0, 60) + '..."');
        }
        return finalResult;
      }
    } else {
      const result = await this._tryOneApi(available[0], cleanText);
      if (result) {
        const finalResult = this.preprocessor.postprocess(result, placeholders);
        const hash = textHash(text);
        this.cache.set(hash, finalResult);
        this.stats.translated++;
        this.lastUsedApi = available[0].name;
        this._reportStats();
        if (CONFIG.DEBUG) {
          console.log('[AxiomTranslator] OK via ' + available[0].name + ' (solo, ' + (Date.now() - t0) + 'ms)');
        }
        return finalResult;
      }
    }

    throw new Error('All translation APIs failed');
  }


  _orderForWaveRace(available) {
    const mozhi = [];
    const other = [];
    for (const api of available) {
      if (api._isMozhi) mozhi.push(api);
      else other.push(api);
    }

    mozhi.sort((a, b) =>
      (this._mozhiLatency.get(a._mozhiUrl)?.avg || 500) -
      (this._mozhiLatency.get(b._mozhiUrl)?.avg || 500)
    );

    const result = [];
    let mi = 0, oi = 0;
    if (oi < other.length) result.push(other[oi++]);
    if (mi < mozhi.length) result.push(mozhi[mi++]);
    if (mi < mozhi.length) result.push(mozhi[mi++]);
    if (oi < other.length) result.push(other[oi++]);
    if (mi < mozhi.length) result.push(mozhi[mi++]);
    if (mi < mozhi.length) result.push(mozhi[mi++]);
    while (oi < other.length) result.push(other[oi++]);
    while (mi < mozhi.length) result.push(mozhi[mi++]);
    return result;
  }

  _waveRace(apis, cleanText) {
    const ordered = this._orderForWaveRace(apis);

    const googleEma = this._lastGoogleMs || 100;
    const bestMozhiEma = (ordered[1] && ordered[1]._isMozhi)
      ? (this._mozhiLatency.get(ordered[1]._mozhiUrl)?.avg || 300)
      : 300;
    const wave2Delay = Math.max(30, Math.min(100, Math.max(googleEma, bestMozhiEma) + 10));
    const wave3Delay = wave2Delay + 50;
    const wave4Delay = wave3Delay + 80;

    return new Promise((resolve) => {
      let settled = false;
      let failures = 0;
      const total = ordered.length;
      const controllers = ordered.map(() => new AbortController());
      const timers = [];

      const finish = (raw, api, idx) => {
        if (settled) return;
        settled = true;
        timers.forEach(clearTimeout);
        api.breaker.recordSuccess();
        controllers.forEach((ac, j) => { if (j !== idx) ac.abort(); });
        resolve({ raw, api });
      };

      const failReasons = [];
      const fail = (api, err) => {
        if (settled) return;
        if (err.name !== 'AbortError') {
          api.breaker.recordFailure();
          failReasons.push(api.name + ': ' + err.message);
          console.warn('[AxiomTranslator] \u2717 ' + api.name + ' \u2014 ' + err.message);
        } else if (api.breaker.state === 'HALF_OPEN') {
          api.breaker._halfOpenProbing = false;
        }
        if (++failures >= total) {
          settled = true;
          timers.forEach(clearTimeout);
          if (failReasons.length > 0) {
            console.error('[AxiomTranslator] ALL APIs FAILED (' + failReasons.length + ' errors):\n  \u2022 ' + failReasons.join('\n  \u2022 ') + '\n  Text: "' + cleanText.substring(0, 80) + '..."');
          }
          resolve(null);
        }
      };

      const startApi = (idx) => {
        if (settled) return;
        const api = ordered[idx];
        withTimeout(api.translate(cleanText, controllers[idx].signal), api.timeout, controllers[idx])
          .then(raw => {
            if (raw && raw.trim() && !_API_ERROR_RE.test(raw)) {
              finish(raw, api, idx);
            } else {
              fail(api, new Error(raw ? 'Error response: ' + raw.substring(0, 60) : 'Empty result'));
            }
          })
          .catch(err => fail(api, err));
      };

      startApi(0);
      if (total >= 2) startApi(1);

      if (total > 2) {
        const w2end = Math.min(4, total);
        timers.push(setTimeout(() => {
          for (let i = 2; i < w2end; i++) startApi(i);
        }, wave2Delay));
      }

      if (total > 4) {
        const w3end = Math.min(6, total);
        timers.push(setTimeout(() => {
          for (let i = 4; i < w3end; i++) startApi(i);
        }, wave3Delay));
      }

      if (total > 6) {
        timers.push(setTimeout(() => {
          for (let i = 6; i < total; i++) startApi(i);
        }, wave4Delay));
      }
    });
  }

  async _tryOneApi(api, cleanText) {
    try {
      const ac = new AbortController();
      const raw = await withTimeout(api.translate(cleanText, ac.signal), api.timeout, ac);
      if (raw && raw.trim() && !_API_ERROR_RE.test(raw)) {
        api.breaker.recordSuccess();
        return raw;
      }
      console.warn('[AxiomTranslator] \u2717 ' + api.name + ' (solo) \u2014 ' + (raw ? 'error response: ' + raw.substring(0, 60) : 'empty result'));
    } catch (err) {
      console.warn('[AxiomTranslator] \u2717 ' + api.name + ' (solo) \u2014 ' + err.message);
      if (err.name !== 'AbortError') api.breaker.recordFailure();
    }
    return null;
  }


  async _initChromeTranslator() {
    try {
      if (typeof Translator === 'undefined') {
        if (CONFIG.DEBUG) console.log('[AxiomTranslator] Chrome Translator API not available');
        return;
      }

      const avail = await Translator.availability({ sourceLanguage: 'en', targetLanguage: 'ru' });
      if (avail === 'unavailable') {
        if (CONFIG.DEBUG) console.log('[AxiomTranslator] Chrome Translator: EN→RU model unavailable');
        return;
      }

      if (CONFIG.DEBUG) console.log('[AxiomTranslator] Chrome Translator status: ' + avail);

      const timeout = CONFIG.APIS.CHROME_TRANSLATOR.initTimeout;
      this._chromeSession = await Promise.race([
        Translator.create({ sourceLanguage: 'en', targetLanguage: 'ru' }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Init timeout')), timeout))
      ]);

      this._chromeAvailable = true;
      if (CONFIG.DEBUG) console.log('[AxiomTranslator] Chrome Translator ready (on-device)');
    } catch (err) {
      if (CONFIG.DEBUG) console.warn('[AxiomTranslator] Chrome Translator init failed:', err.message);
    }
  }

  async _chromeTranslate(text) {
    if (!this._chromeAvailable || !this._chromeSession) return null;
    try {
      const result = await this._chromeSession.translate(text);
      return (result && result.trim()) ? result : null;
    } catch (err) {
      if (CONFIG.DEBUG) console.warn('[AxiomTranslator] Chrome Translator error:', err.message);
      this._chromeAvailable = false;
      setTimeout(() => this._initChromeTranslator(), 30000);
      return null;
    }
  }


  async _googleTranslate(text, signal) {
    const params = new URLSearchParams({
      ...CONFIG.APIS.GOOGLE.params,
      q: text
    });
    const url = `${CONFIG.APIS.GOOGLE.url}?${params}`;
    const t0 = Date.now();

    const resp = await this._proxyFetch(url, signal);
    if (resp.status === 429) throw new RateLimitError('Rate limited');
    if (resp.status !== 200) throw new Error(`HTTP ${resp.status}`);

    const data = JSON.parse(resp.text);
    if (!data || !Array.isArray(data[0])) throw new Error('Invalid response');

    let result = '';
    for (let i = 0; i < data[0].length; i++) {
      if (data[0][i] != null && data[0][i][0] != null) result += data[0][i][0];
    }

    const ms = Date.now() - t0;
    this._lastGoogleMs = this._lastGoogleMs
      ? this._lastGoogleMs * 0.7 + ms * 0.3
      : ms;

    return result;
  }

  _proxyFetch(url, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) { reject(new Error('Aborted')); return; }
      if (!chrome.runtime?.id) { reject(new Error('Extension context invalidated')); return; }
      const onAbort = () => reject(new Error('Aborted'));
      signal?.addEventListener('abort', onAbort, { once: true });
      try {
        chrome.runtime.sendMessage({ type: 'PROXY_FETCH', url }, (resp) => {
          signal?.removeEventListener('abort', onAbort);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!resp || resp.error) {
            reject(new Error(resp?.error || 'No response'));
          } else {
            resolve(resp);
          }
        });
      } catch (e) {
        signal?.removeEventListener('abort', onAbort);
        reject(e);
      }
    });
  }

  async _mozhiDirectTranslate(baseUrl, text, signal) {
    const params = new URLSearchParams({
      engine: CONFIG.APIS.MOZHI.engine,
      from: 'en',
      to: 'ru',
      text: text
    });
    const url = baseUrl + '/api/translate?' + params;
    const t0 = Date.now();

    let resp = await fetch(url, { credentials: 'omit', signal });
    if (resp.status >= 500 && CONFIG.APIS.MOZHI.fallbackEngine) {
      const fbParams = new URLSearchParams({
        engine: CONFIG.APIS.MOZHI.fallbackEngine || CONFIG.APIS.MOZHI.engine,
        from: 'en', to: 'ru', text: text
      });
      resp = await fetch(baseUrl + '/api/translate?' + fbParams, { credentials: 'omit', signal });
    }
    if (resp.status === 429) throw new RateLimitError('Rate limited by ' + baseUrl);
    if (!resp.ok) throw new Error('HTTP ' + resp.status + ' from ' + baseUrl);

    const data = await resp.json();
    const translated = data['translated-text'] || data['translated_text'] || data.translatedText || data.translation;
    if (!translated) throw new Error('No translation from ' + baseUrl);
    if (_MOZHI_ERROR_RE.test(translated) && translated.length < 200) {
      throw new Error('API error response from ' + baseUrl + ': ' + translated.substring(0, 80));
    }

    this._recordMozhiLatency(baseUrl, Date.now() - t0);
    return translated;
  }

  _recordMozhiLatency(instance, ms) {
    const entry = this._mozhiLatency.get(instance) || { sum: 0, count: 0, avg: 1000 };
    entry.sum += ms;
    entry.count++;
    entry.avg = entry.count <= 3
      ? entry.sum / entry.count
      : entry.avg * 0.7 + ms * 0.3;
    this._mozhiLatency.set(instance, entry);
  }

  async _simplyTranslate(text, signal) {
    const params = new URLSearchParams({
      engine: 'google',
      from: 'en',
      to: 'ru',
      text: text
    });
    const url = `${CONFIG.APIS.SIMPLYTRANSLATE.url}?${params}`;

    const resp = await fetch(url, { credentials: 'omit', signal });
    if (resp.status === 429) throw new RateLimitError('Rate limited');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();
    const translated = data.translated_text || data['translated-text'] || '';
    if (!translated) throw new Error('No translation');

    return translated;
  }

  async _lingvaTranslate(text, signal) {
    const instances = CONFIG.APIS.LINGVA.instances;
    const startIdx = this._lingvaIndex;
    let lastError = null;

    for (let attempt = 0; attempt < instances.length; attempt++) {
      const idx = (startIdx + attempt) % instances.length;
      const base = instances[idx];
      const url = base + '/api/v1/en/ru/' + encodeURIComponent(text);

      try {
        const resp = await fetch(url, { credentials: 'omit', signal });
        if (resp.status === 429) throw new RateLimitError('Rate limited by ' + base);
        if (!resp.ok) throw new Error('HTTP ' + resp.status + ' from ' + base);

        const data = await resp.json();
        const translated = data.translation;
        if (!translated) throw new Error('No translation from ' + base);

        this._lingvaIndex = (idx + 1) % instances.length;
        return translated;
      } catch (err) {
        lastError = err;
        if (err.name === 'AbortError' || err.name === 'RateLimitError') throw err;
      }
    }

    throw lastError || new Error('All Lingva instances failed');
  }

  async _myMemoryTranslate(text, signal) {
    const params = new URLSearchParams({
      q: text,
      langpair: 'en|ru'
    });
    const url = `${CONFIG.APIS.MYMEMORY.url}?${params}`;

    const resp = await fetch(url, { credentials: 'omit', signal });
    if (resp.status === 429) throw new RateLimitError('Rate limited');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const data = await resp.json();
    if (!data.responseData || !data.responseData.translatedText) {
      throw new Error('No translation');
    }

    const match = data.responseData.match;
    if (match !== undefined && match === 0 && (data.responseStatus === 429 || data.responseStatus === '429')) {
      throw new RateLimitError('MyMemory daily quota exceeded');
    }

    return data.responseData.translatedText;
  }


  getApiStatuses() {
    return this.apis.map(api => ({
      name: api.name,
      status: api.breaker.state,
      failures: api.breaker.failureCount
    }));
  }

  _reportStats() {
    if (this._reportScheduled || this._reportTimer) return;
    const now = Date.now();
    if (this._lastReportTime && now - this._lastReportTime < 3000) {
      this._reportTimer = setTimeout(() => {
        this._reportTimer = null;
        this._reportStats();
      }, 3000 - (now - this._lastReportTime));
      return;
    }
    this._reportScheduled = true;

    const schedule = window.requestIdleCallback
      ? (fn) => requestIdleCallback(fn, { timeout: 1000 })
      : (fn) => setTimeout(fn, 0);
    schedule(() => {
      this._reportScheduled = false;
      this._lastReportTime = Date.now();
      try {
        if (!chrome.runtime?.id) return;
        chrome.runtime.sendMessage({
          type: 'UPDATE_STATS',
          stats: { ...this.stats }
        });
      } catch (err) { /* stats non-critical */ }
    });
  }
}
if (typeof module !== 'undefined' && module.exports) {
  const _utils = require('./utils.js');
  Object.assign(global, _utils);
  if (!global.CONFIG) global.CONFIG = require('./config.js');
  module.exports = {
    RateLimitError, TextPreprocessor, CircuitBreaker, RateLimiter,
    TranslationQueue, TranslationService
  };
}
