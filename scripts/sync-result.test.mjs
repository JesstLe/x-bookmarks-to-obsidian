import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  SyncResult,
  exitCodeForState,
  writeRunReport,
} from './lib/sync-result.mjs';

test('fixed-count partial collection is incomplete with exit 2', () => {
  const result = new SyncResult({ requested: 20, mode: 'count' });
  result.discovered = 5;
  result.extracted = 5;
  result.finish({ reason: 'no_progress' });
  assert.equal(result.state, 'incomplete');
  assert.equal(result.exitCode, 2);
});

test('fixed-count run is complete only after extracting the requested count without failures', () => {
  const result = new SyncResult({ requested: 20, mode: 'count' });
  result.discovered = 20;
  result.extracted = 20;
  result.saved = 10;
  result.skipped = 10;
  result.finish({ reason: 'requested_count' });
  assert.equal(result.state, 'complete');
  assert.equal(result.exitCode, 0);
});

test('existing notes count as successfully handled without re-extraction', () => {
  const result = new SyncResult({ requested: 20, mode: 'count' });
  result.discovered = 20;
  result.extracted = 5;
  result.skipped = 15;
  result.finish({ reason: 'requested_count' });
  assert.equal(result.state, 'complete');
});

test('all mode is complete only with explicit end-of-list evidence', () => {
  const complete = new SyncResult({ requested: null, mode: 'all' });
  complete.discovered = 346;
  complete.extracted = 346;
  complete.finish({ reason: 'end_of_list' });
  assert.equal(complete.state, 'complete');

  const uncertain = new SyncResult({ requested: null, mode: 'all' });
  uncertain.discovered = 346;
  uncertain.extracted = 346;
  uncertain.finish({ reason: 'no_progress' });
  assert.equal(uncertain.state, 'incomplete');
});

test('auth, rate limit, and fatal states have stable exit codes', () => {
  assert.equal(exitCodeForState('failed'), 1);
  assert.equal(exitCodeForState('auth_required'), 3);
  assert.equal(exitCodeForState('rate_limited'), 4);
});

test('writes an atomic last-run report and append-only failure log', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-result-'));
  const result = new SyncResult({ requested: 1, mode: 'count', startedAt: '2026-07-14T00:00:00.000Z' });
  result.discovered = 1;
  result.extracted = 0;
  result.addFailure({ tweetUrl: 'https://x.com/a/status/2000000000000000001', stage: 'detail', message: 'unavailable' });
  result.finish({ reason: 'extraction_failed', finishedAt: '2026-07-14T00:01:00.000Z' });

  const paths = writeRunReport(result, dir);
  assert.equal(fs.existsSync(paths.lastRun), true);
  assert.equal(fs.existsSync(`${paths.lastRun}.tmp`), false);
  const saved = JSON.parse(fs.readFileSync(paths.lastRun, 'utf8'));
  assert.equal(saved.state, 'incomplete');
  assert.equal(saved.failures.length, 1);
  assert.match(fs.readFileSync(paths.failures, 'utf8'), /"stage":"detail"/);
});
