const { test } = require('node:test');
const assert = require('node:assert');
const dbg = require('../../core/debug.js');

test('logIssue increments per-category counter and appears in summary', () => {
  const before = dbg._debugIssues['fetch'] || 0;
  dbg.logIssue('fetch', 'boom');
  assert.strictEqual(dbg._debugIssues['fetch'], before + 1);
  const s = dbg.getIssuesSummary();
  assert.match(s, /ISSUES DETECTED/);
  assert.match(s, /boom/);
});

test('getIssuesSummary: empty state reports no issues', () => {
  for (const k of Object.keys(dbg._debugIssues)) delete dbg._debugIssues[k];
  dbg._debugIssueDetails.length = 0;
  dbg._debugIssueHead = 0;
  const s = dbg.getIssuesSummary();
  assert.match(s, /NO ISSUES DETECTED/);
});

test('issue details ring buffer is capped', () => {
  for (let i = 0; i < 120; i++) dbg.logIssue('ring', 'detail ' + i);
  assert.strictEqual(dbg._debugIssueDetails.length, dbg._DEBUG_ISSUES_MAX);
  const s = dbg.getIssuesSummary();
  assert.match(s, /detail 11[0-9]/);
});
