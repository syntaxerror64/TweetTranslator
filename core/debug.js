(function (global) {
  'use strict';

  const _debugLog = [];
  let _debugLogHead = 0;
  const _DEBUG_LOG_MAX = 2000;

  const _debugIssues = {};
  const _debugIssueDetails = [];
  let _debugIssueHead = 0;
  const _DEBUG_ISSUES_MAX = 100;

  function logIssue(category, detail) {
    _debugIssues[category] = (_debugIssues[category] || 0) + 1;
    const ts = new Date().toISOString().substring(11, 23);
    const entry = ts + ' ⚠ ' + category + ': ' + detail;
    if (_debugIssueDetails.length < _DEBUG_ISSUES_MAX) {
      _debugIssueDetails.push(entry);
    } else {
      _debugIssueDetails[_debugIssueHead] = entry;
      _debugIssueHead = (_debugIssueHead + 1) % _DEBUG_ISSUES_MAX;
    }
    (global.console.warn || console.warn).call(console, '[TweetTranslator] ⚠ ' + category + ':', detail);
  }

  function getIssuesSummary() {
    const keys = Object.keys(_debugIssues);
    if (keys.length === 0) return '=== NO ISSUES DETECTED ===\n\n';

    const lines = ['=== ISSUES DETECTED (' + keys.length + ' types) ==='];
    keys.sort((a, b) => _debugIssues[b] - _debugIssues[a]);
    for (const key of keys) {
      lines.push('  ⚠ ' + _debugIssues[key] + 'x ' + key);
    }
    lines.push('');
    const ordered = _debugIssueDetails.length < _DEBUG_ISSUES_MAX
      ? _debugIssueDetails
      : _debugIssueDetails.slice(_debugIssueHead).concat(_debugIssueDetails.slice(0, _debugIssueHead));
    const last50 = ordered.slice(-50);
    lines.push('--- Issue Details (last ' + last50.length + ') ---');
    for (const d of last50) {
      lines.push('  ' + d);
    }
    lines.push('=== END ISSUES ===');
    lines.push('');
    return lines.join('\n');
  }

  function _safeStringify(a) {
    if (typeof a === 'string') return a;
    try { return JSON.stringify(a); } catch { return String(a); }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      logIssue, getIssuesSummary, _safeStringify,
      _debugLog, _debugLogHead, _DEBUG_LOG_MAX,
      _debugIssues, _debugIssueDetails, _debugIssueHead, _DEBUG_ISSUES_MAX
    };
    return;
  }

  // Browser: expose globals + capture console into ring buffers.
  global._debugLog = _debugLog;
  global._debugLogHead = _debugLogHead;
  global._DEBUG_LOG_MAX = _DEBUG_LOG_MAX;
  global._debugIssues = _debugIssues;
  global._debugIssueDetails = _debugIssueDetails;
  global._debugIssueHead = _debugIssueHead;
  global._DEBUG_ISSUES_MAX = _DEBUG_ISSUES_MAX;
  global.logIssue = logIssue;
  global.getIssuesSummary = getIssuesSummary;

  const _origConsoleLog = console.log;
  const _origConsoleWarn = console.warn;
  const _isTranslatorLog = (a) => typeof a === 'string' && /\[.*Translator]/.test(a);

  console.log = function (...args) {
    _origConsoleLog.apply(console, args);
    if (_isTranslatorLog(args[0])) {
      const ts = new Date().toISOString().substring(11, 23);
      const msg = args.map(_safeStringify).join(' ');
      const entry = ts + ' ' + msg;
      if (_debugLog.length < _DEBUG_LOG_MAX) {
        _debugLog.push(entry);
      } else {
        _debugLog[_debugLogHead] = entry;
        _debugLogHead = (_debugLogHead + 1) % _DEBUG_LOG_MAX;
      }
    }
  };

  console.warn = function (...args) {
    _origConsoleWarn.apply(console, args);
    if (_isTranslatorLog(args[0])) {
      const ts = new Date().toISOString().substring(11, 23);
      const msg = args.map(_safeStringify).join(' ');
      const entry = ts + ' WARN ' + msg;
      if (_debugLog.length < _DEBUG_LOG_MAX) {
        _debugLog.push(entry);
      } else {
        _debugLog[_debugLogHead] = entry;
        _debugLogHead = (_debugLogHead + 1) % _DEBUG_LOG_MAX;
      }
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
