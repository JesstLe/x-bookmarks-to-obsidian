import test from 'node:test';
import assert from 'node:assert/strict';

import { parseArgs, runSync } from './twitter-bookmarks.mjs';

test('rejects unknown options and invalid counts', () => {
  assert.throws(() => parseArgs(['--count', 'zero']), /positive integer/);
  assert.throws(() => parseArgs(['--count', '0']), /positive integer/);
  assert.throws(() => parseArgs(['--merge-threads']), /Unknown option/);
  assert.throws(() => parseArgs(['--all', '--count', '20']), /mutually exclusive/);
});

test('parses dry-run and media controls without touching process argv', () => {
  const config = parseArgs([
    '--count', '20',
    '--dry-run',
    '--no-image-download',
    '--no-video-download',
    '--max-no-progress-rounds', '7',
  ], { HOME: '/tmp/home' });
  assert.equal(config.count, 20);
  assert.equal(config.dryRun, true);
  assert.equal(config.downloadImages, false);
  assert.equal(config.downloadVideos, false);
  assert.equal(config.maxNoProgressRounds, 7);
  assert.equal(config.obsidianPath, '/tmp/home/Documents/Obsidian Vault/Inbox/X Bookmarks');
});

test('uses a patient default window for X virtual-list stalls', () => {
  const config = parseArgs([], { HOME: '/tmp/home' });
  assert.equal(config.maxNoProgressRounds, 12);
  assert.equal(config.scrollDelay, 1500);
});

function fakeRuntime({ discoveredCount, reason, extractionFailures = new Set() }) {
  const urls = Array.from(
    { length: discoveredCount },
    (_, index) => `https://x.com/user/status/20000000000000000${String(index).padStart(2, '0')}`,
  );
  const browser = { disconnected: false, async disconnect() { this.disconnected = true; } };
  const listPage = {
    frontCalls: 0,
    async goto() {},
    async bringToFront() { this.frontCalls += 1; },
    async close() {},
  };
  const detailPage = {
    frontCalls: 0,
    async bringToFront() { this.frontCalls += 1; },
    async close() {},
  };
  return {
    browser,
    listPage,
    detailPage,
    dependencies: {
      async openBrowserPages() { return { browser, listPage, detailPage }; },
      async discoverBookmarkUrls() { return { urls, reason }; },
      async extractTweetDetail(_page, identity) {
        if (extractionFailures.has(identity.id)) throw new Error('detail unavailable');
        return {
          identity,
          author: 'User',
          handle: identity.handle,
          timestamp: '2026-07-14T00:00:00.000Z',
          text: 'Body',
          stats: {},
          images: [],
          videos: [],
          links: [],
          quotedTweet: null,
        };
      },
      async processMedia(bookmark) { return { bookmark, failures: [] }; },
      renderBookmarkNote() { return 'note'; },
      noteExists() { return false; },
      writeNote() { throw new Error('dry-run must not write notes'); },
      writeOutput() { throw new Error('dry-run must not write output'); },
      writeRunReport() { throw new Error('dry-run must not write reports'); },
      log() {},
    },
  };
}

test('returns exit 2 when discovery is partial and still disconnects', async () => {
  const runtime = fakeRuntime({ discoveredCount: 5, reason: 'no_progress' });
  const result = await runSync({
    ...parseArgs(['--count', '20', '--dry-run'], { HOME: '/tmp/home' }),
    port: 9223,
  }, runtime.dependencies);
  assert.equal(result.state, 'incomplete');
  assert.equal(result.exitCode, 2);
  assert.equal(result.discovered, 5);
  assert.equal(result.extracted, 5);
  assert.equal(runtime.browser.disconnected, true);
});

test('returns complete only after handling the requested count', async () => {
  const runtime = fakeRuntime({ discoveredCount: 20, reason: 'requested_count' });
  const result = await runSync({
    ...parseArgs(['--count', '20', '--dry-run'], { HOME: '/tmp/home' }),
    port: 9223,
  }, runtime.dependencies);
  assert.equal(result.state, 'complete');
  assert.equal(result.exitCode, 0);
  assert.equal(result.extracted, 20);
});

test('keeps the virtual bookmark list in the foreground until discovery finishes', async () => {
  const runtime = fakeRuntime({ discoveredCount: 2, reason: 'requested_count' });
  await runSync({
    ...parseArgs(['--count', '2', '--dry-run'], { HOME: '/tmp/home' }),
    port: 9223,
  }, runtime.dependencies);
  assert.equal(runtime.listPage.frontCalls, 1);
  assert.equal(runtime.detailPage.frontCalls, 1);
});

test('records detail failures and returns incomplete', async () => {
  const failedId = '2000000000000000001';
  const runtime = fakeRuntime({
    discoveredCount: 2,
    reason: 'requested_count',
    extractionFailures: new Set([failedId]),
  });
  const result = await runSync({
    ...parseArgs(['--count', '2', '--dry-run'], { HOME: '/tmp/home' }),
    port: 9223,
  }, runtime.dependencies);
  assert.equal(result.state, 'incomplete');
  assert.equal(result.failed, 1);
  assert.match(result.failures[0].message, /detail unavailable/);
});

test('persists a structured report for authentication failures outside dry-run', async () => {
  let report = null;
  const browser = { async disconnect() {} };
  const dependencies = {
    async openBrowserPages() {
      return { browser, listPage: { async close() {} }, detailPage: { async close() {} } };
    },
    async discoverBookmarkUrls() { return { urls: [], reason: 'auth_required' }; },
    writeRunReport(result, reportDir) { report = { state: result.state, reportDir }; },
    log() {},
  };
  const config = {
    ...parseArgs(['--count', '20', '--obsidian'], { HOME: '/tmp/home' }),
    port: 9223,
  };
  const result = await runSync(config, dependencies);
  assert.equal(result.state, 'auth_required');
  assert.deepEqual(report, { state: 'auth_required', reportDir: config.reportDir });
});
