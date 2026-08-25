function _diagKey() {
  return (typeof CONFIG !== 'undefined' && CONFIG.DIAGNOSTICS && CONFIG.DIAGNOSTICS.STORAGE_KEY) || 'tx_diagnostics';
}
const DIAG_MAX_EVENTS = 200;
const DIAG_MAX_SNAPSHOTS = 50;
const DIAG_MAX_PATTERNS = 100;

class Diagnostics {
  constructor() {
    this.events = [];
    this.domPatterns = new Map();
    this.apiHistory = [];
    this.detectionStats = {
      totalPopups: 0,
      detected: 0,
      missed: 0,
      translated: 0,
      failed: 0,
      cacheHits: 0
    };
    this.domSnapshots = [];
    this.sessionStart = Date.now();
    this.loaded = false;
  }


  async load() {
    try {
      const data = await chrome.storage.local.get(_diagKey());
      const stored = data[_diagKey()];
      if (stored) {
        if (stored.events) this.events = stored.events.slice(-DIAG_MAX_EVENTS);
        if (stored.domPatterns) {
          for (const [key, val] of Object.entries(stored.domPatterns)) {
            this.domPatterns.set(key, val);
          }
        }
        if (stored.apiHistory) this.apiHistory = stored.apiHistory.slice(-100);
        if (stored.detectionStats) Object.assign(this.detectionStats, stored.detectionStats);
        if (stored.domSnapshots) this.domSnapshots = stored.domSnapshots.slice(-DIAG_MAX_SNAPSHOTS);
      }
    } catch (err) {
      console.warn('[AxiomTranslator:Diag] Failed to load diagnostics:', err);
    }
    this.loaded = true;
    this._log('session_start', { url: location.href, timestamp: new Date().toISOString() });
  }


  _log(type, data) {
    const event = {
      type,
      timestamp: Date.now(),
      ...data
    };
    this.events.push(event);
    if (this.events.length > DIAG_MAX_EVENTS * 1.5) {
      this.events = this.events.slice(-DIAG_MAX_EVENTS);
    }
    this._scheduleSave();
  }


  learnPopupPattern(popupNode) {
    if (!popupNode || popupNode.nodeType !== Node.ELEMENT_NODE) return;

    const pattern = this._extractPattern(popupNode);
    const hash = textHash(pattern.signature);

    const existing = this.domPatterns.get(hash);
    if (existing) {
      existing.count++;
      existing.lastSeen = Date.now();
    } else {
      this.domPatterns.set(hash, {
        signature: pattern.signature,
        attributes: pattern.attributes,
        structure: pattern.structure,
        depth: pattern.depth,
        count: 1,
        firstSeen: Date.now(),
        lastSeen: Date.now()
      });
    }

    if (this.domPatterns.size > DIAG_MAX_PATTERNS) {
      let minKey = null, minCount = Infinity;
      for (const [key, val] of this.domPatterns) {
        if (val.count < minCount) { minCount = val.count; minKey = key; }
      }
      if (minKey) this.domPatterns.delete(minKey);
    }

    this._scheduleSave();
  }

  _extractPattern(node) {
    const attributes = {};
    for (const attr of node.attributes || []) {
      if (attr.name.startsWith('data-') || attr.name === 'role') {
        attributes[attr.name] = attr.value;
      }
    }

    const structure = this._getStructureSignature(node, 3);
    const depth = this._getDepth(node);

    const signature = `${node.tagName}|${Object.keys(attributes).sort().join(',')}|${structure}`;

    return { signature, attributes, structure, depth };
  }

  _getStructureSignature(node, maxDepth, currentDepth = 0) {
    if (currentDepth >= maxDepth || !node.children || node.children.length === 0) return '';

    const childSignatures = [];
    for (const child of node.children) {
      const nested = this._getStructureSignature(child, maxDepth, currentDepth + 1);
      const childSig = nested
        ? `${child.tagName}(${child.children.length})[${nested}]`
        : `${child.tagName}(${child.children.length})`;
      childSignatures.push(childSig);
    }
    return childSignatures.slice(0, 10).join(',');
  }

  _getDepth(node) {
    let depth = 0;
    let current = node;
    while (current.parentElement) {
      depth++;
      current = current.parentElement;
    }
    return depth;
  }


  recordDetectionSuccess(element, signals) {
    this.detectionStats.totalPopups++;
    this.detectionStats.detected++;
    this._log('detection_success', {
      textLength: element.textContent?.length || 0,
      signals: signals,
      textPreview: (element.textContent || '').substring(0, 50)
    });
  }

  recordDetectionMiss(node) {
    this.detectionStats.totalPopups++;
    this.detectionStats.missed++;

    const snapshot = {
      timestamp: Date.now(),
      outerHTML: (node.outerHTML || '').substring(0, 2000),
      textContent: (node.textContent || '').substring(0, 500),
      tagName: node.tagName,
      attributes: this._getAttributes(node),
      childCount: node.children?.length || 0,
      parentTag: node.parentElement?.tagName || 'none'
    };

    this.domSnapshots.push(snapshot);
    if (this.domSnapshots.length > DIAG_MAX_SNAPSHOTS * 1.5) {
      this.domSnapshots = this.domSnapshots.slice(-DIAG_MAX_SNAPSHOTS);
    }

    this._log('detection_miss', {
      textLength: node.textContent?.length || 0,
      tagName: node.tagName,
      childCount: node.children?.length || 0
    });
    this._scheduleSave();
  }

  _getAttributes(node) {
    const attrs = {};
    for (const attr of node.attributes || []) {
      if (attr.name.startsWith('data-') || attr.name === 'role' || attr.name === 'style') {
        attrs[attr.name] = attr.value.substring(0, 100);
      }
    }
    return attrs;
  }


  recordTranslationSuccess(text, translatedText, apiName, durationMs) {
    this.detectionStats.translated++;
    this._log('translation_success', {
      api: apiName,
      duration: durationMs,
      originalLength: text.length,
      translatedLength: translatedText.length
    });
    this.apiHistory.push({
      timestamp: Date.now(),
      api: apiName,
      success: true,
      duration: durationMs
    });
    this._trimApiHistory();
  }

  recordTranslationFailure(text, error, apiName) {
    this.detectionStats.failed++;
    this._log('translation_failure', {
      api: apiName,
      error: error.message || String(error),
      textLength: text.length
    });
    this.apiHistory.push({
      timestamp: Date.now(),
      api: apiName,
      success: false,
      error: error.message || String(error)
    });
    this._trimApiHistory();
  }

  recordCacheHit() {
    this.detectionStats.cacheHits++;
  }

  _trimApiHistory() {
    if (this.apiHistory.length > 100) {
      this.apiHistory = this.apiHistory.slice(-100);
    }
  }


  _saveTimer = null;

  _scheduleSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._save();
    }, 10000);
  }

  async _save() {
    try {
      if (!chrome.runtime?.id) return;
      const data = {
        events: this.events.slice(-DIAG_MAX_EVENTS),
        domPatterns: Object.fromEntries(this.domPatterns),
        apiHistory: this.apiHistory.slice(-100),
        detectionStats: { ...this.detectionStats },
        domSnapshots: this.domSnapshots.slice(-DIAG_MAX_SNAPSHOTS),
        lastSaved: Date.now()
      };
      await chrome.storage.local.set({ [_diagKey()]: data });
    } catch (err) { /* save non-critical */ }
  }


  generateReport() {
    const uptime = Math.round((Date.now() - this.sessionStart) / 1000);
    const patterns = [...this.domPatterns.values()];
    const topPatterns = patterns.sort((a, b) => b.count - a.count).slice(0, 10);

    const apiStats = {};
    for (const entry of this.apiHistory) {
      if (!apiStats[entry.api]) {
        apiStats[entry.api] = { total: 0, success: 0, avgDuration: 0, durations: [] };
      }
      apiStats[entry.api].total++;
      if (entry.success) {
        apiStats[entry.api].success++;
        if (entry.duration) apiStats[entry.api].durations.push(entry.duration);
      }
    }
    for (const [name, stats] of Object.entries(apiStats)) {
      stats.successRate = stats.total > 0 ? Math.round(stats.success / stats.total * 100) : 0;
      stats.avgDuration = stats.durations.length > 0
        ? Math.round(stats.durations.reduce((a, b) => a + b, 0) / stats.durations.length)
        : 0;
      delete stats.durations;
    }

    const detectionRate = this.detectionStats.totalPopups > 0
      ? Math.round(this.detectionStats.detected / this.detectionStats.totalPopups * 100)
      : 0;

    return {
      session: {
        uptime: `${Math.floor(uptime / 60)}m ${uptime % 60}s`,
        sessionStart: new Date(this.sessionStart).toISOString()
      },
      detection: {
        ...this.detectionStats,
        detectionRate: `${detectionRate}%`
      },
      apiReliability: apiStats,
      topDomPatterns: topPatterns.map(p => ({
        signature: p.signature,
        count: p.count,
        attributes: p.attributes
      })),
      recentMisses: this.domSnapshots.slice(-5).map(s => ({
        tagName: s.tagName,
        attributes: s.attributes,
        childCount: s.childCount,
        textPreview: s.textContent?.substring(0, 100)
      })),
      recentEvents: this.events.slice(-20).map(e => ({
        type: e.type,
        timestamp: new Date(e.timestamp).toISOString(),
        ...e
      }))
    };
  }

  generateMemoryUpdate() {
    const report = this.generateReport();
    const lines = [];
    const date = new Date().toISOString().split('T')[0];

    lines.push(`### ${date} — Auto-Diagnostics Report`);
    lines.push('');
    lines.push(`**Session:** ${report.session.uptime} uptime`);
    lines.push(`**Detection rate:** ${report.detection.detectionRate} (${report.detection.detected}/${report.detection.totalPopups} popups)`);
    lines.push(`**Translated:** ${report.detection.translated}, Cache hits: ${report.detection.cacheHits}, Errors: ${report.detection.failed}`);
    lines.push('');

    if (Object.keys(report.apiReliability).length > 0) {
      lines.push('**API Reliability:**');
      for (const [name, stats] of Object.entries(report.apiReliability)) {
        lines.push(`- ${name}: ${stats.successRate}% success (${stats.success}/${stats.total}), avg ${stats.avgDuration}ms`);
      }
      lines.push('');
    }

    if (report.topDomPatterns.length > 0) {
      lines.push('**Learned DOM Patterns (top 5):**');
      for (const p of report.topDomPatterns.slice(0, 5)) {
        lines.push(`- \`${p.signature.substring(0, 80)}\` — seen ${p.count}x`);
      }
      lines.push('');
    }

    if (report.recentMisses.length > 0) {
      lines.push('**Recent Detection Misses (review needed):**');
      for (const m of report.recentMisses.slice(0, 3)) {
        lines.push(`- ${m.tagName} (${m.childCount} children, attrs: ${JSON.stringify(m.attributes)}) — "${(m.textPreview || '').substring(0, 60)}..."`);
      }
    }

    return lines.join('\n');
  }

  async reset() {
    this.events = [];
    this.domPatterns.clear();
    this.apiHistory = [];
    this.detectionStats = {
      totalPopups: 0, detected: 0, missed: 0,
      translated: 0, failed: 0, cacheHits: 0
    };
    this.domSnapshots = [];
    this.sessionStart = Date.now();
    try {
      await chrome.storage.local.remove(_diagKey());
    } catch (err) { /* reset non-critical */ }
  }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Diagnostics };
}
