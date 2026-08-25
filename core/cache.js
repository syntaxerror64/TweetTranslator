const _CACHE_ERROR_RE = /QUERY\.LENGTH|LIMIT\.EXCEEDED|MAX\.ALLOWED|MYMEMORY WARNING|YOU USED ALL|INVALID LANGUAGE PAIR/i;

class LRUCache {
  constructor(maxSize = CONFIG.CACHE.MAX_MEMORY_ENTRIES) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.pendingWrites = new Map();
    this.writeScheduled = false;
    this._flushing = false;
    this.storageLoaded = false;
  }

  async loadFromStorage() {
    try {
      const currentVersion = chrome.runtime.getManifest?.()?.version || '0';
      const versionKey = CONFIG.CACHE.STORAGE_KEY + '_version';
      const versionData = await chrome.storage.local.get(versionKey);
      const storedVersion = versionData[versionKey];

      if (storedVersion && storedVersion !== currentVersion) {
        if (CONFIG.DEBUG) console.log(`[AxiomTranslator] Version upgrade ${storedVersion} → ${currentVersion}, clearing stale cache`);
        await chrome.storage.local.remove(CONFIG.CACHE.STORAGE_KEY);
        await chrome.storage.local.set({ [versionKey]: currentVersion });
        this.storageLoaded = true;
        return;
      }

      if (!storedVersion) {
        await chrome.storage.local.set({ [versionKey]: currentVersion });
      }

      const data = await chrome.storage.local.get(CONFIG.CACHE.STORAGE_KEY);
      const stored = data[CONFIG.CACHE.STORAGE_KEY];
      if (stored && typeof stored === 'object') {
        const entries = Object.entries(stored);
        const toLoad = entries.slice(-this.maxSize);
        for (const [key, value] of toLoad) {
          if (value && _CACHE_ERROR_RE.test(value)) continue;
          this.cache.set(key, value);
        }
        if (CONFIG.DEBUG) console.log(`[AxiomTranslator] Cache loaded: ${toLoad.length} entries from storage`);
      }
    } catch (err) {
      console.warn('[AxiomTranslator] Failed to load cache from storage:', err);
    }
    this.storageLoaded = true;
  }

  get(key) {
    if (!this.cache.has(key)) return null;
    const value = this.cache.get(key);
    if (typeof value === 'string' && _CACHE_ERROR_RE.test(value)) {
      this.cache.delete(key);
      return null;
    }
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (typeof value === 'string' && _CACHE_ERROR_RE.test(value)) return;
    if (this.cache.has(key)) this.cache.delete(key);
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
    this.schedulePersist(key, value);
  }

  get size() {
    return this.cache.size;
  }

  async clear() {
    this.cache.clear();
    this.pendingWrites.clear();
    try {
      await chrome.storage.local.remove(CONFIG.CACHE.STORAGE_KEY);
    } catch (err) {
      console.warn('[AxiomTranslator] Failed to clear storage cache:', err);
    }
    if (CONFIG.DEBUG) console.log('[AxiomTranslator] Cache cleared');
  }

  schedulePersist(key, value) {
    this.pendingWrites.set(key, value);
    if (!this.writeScheduled) {
      this.writeScheduled = true;
      setTimeout(() => this.flushToStorage(), CONFIG.CACHE.PERSIST_DEBOUNCE_MS);
    }
  }

  async flushToStorage() {
    if (this.pendingWrites.size === 0) {
      this.writeScheduled = false;
      return;
    }

    if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
      this.pendingWrites.clear();
      this.writeScheduled = false;
      return;
    }

    if (this._flushing) {
      if (!this.writeScheduled) {
        this.writeScheduled = true;
        setTimeout(() => this.flushToStorage(), CONFIG.CACHE.PERSIST_DEBOUNCE_MS);
      }
      return;
    }

    const batch = new Map(this.pendingWrites);
    this.pendingWrites.clear();
    this.writeScheduled = false;
    this._flushing = true;

    try {
      const data = await chrome.storage.local.get(CONFIG.CACHE.STORAGE_KEY);
      const existing = data[CONFIG.CACHE.STORAGE_KEY] || {};

      for (const [key, value] of batch) {
        existing[key] = value;
      }

      const entries = Object.entries(existing);
      let toStore = existing;
      if (entries.length > CONFIG.CACHE.MAX_STORAGE_ENTRIES) {
        toStore = Object.fromEntries(
          entries.slice(entries.length - CONFIG.CACHE.MAX_STORAGE_ENTRIES)
        );
      }

      try {
        await chrome.storage.local.set({ [CONFIG.CACHE.STORAGE_KEY]: toStore });
      } catch (quotaErr) {
        if (quotaErr.name === 'QuotaExceededError' || quotaErr.message?.includes('QUOTA') || quotaErr.message?.includes('quota')) {
          const halfMax = Math.floor(CONFIG.CACHE.MAX_STORAGE_ENTRIES * 0.5);
          const trimmed = Object.fromEntries(
            Object.entries(toStore).slice(-halfMax)
          );
          await chrome.storage.local.set({ [CONFIG.CACHE.STORAGE_KEY]: trimmed });
          console.warn(`[AxiomTranslator] Storage quota hit, trimmed to ${halfMax} entries`);
        } else {
          throw quotaErr;
        }
      }
    } catch (err) {
      if (err.message?.includes('Extension context invalidated')) return;
      console.warn('[AxiomTranslator] Failed to persist cache:', err);
    } finally {
      this._flushing = false;
    }
  }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LRUCache };
}
