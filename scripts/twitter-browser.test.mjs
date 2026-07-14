import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectPageState,
  discoverBookmarkUrls,
  extractTweetDetail,
  resolveQuoteUrlFromCard,
  selectBookmarkStatusUrls,
  selectTweetById,
} from './lib/twitter-browser.mjs';

test('recognizes auth, rate-limit, X error, and end-of-list states', () => {
  assert.equal(detectPageState({ url: 'https://x.com/i/flow/login', bodyText: '' }), 'auth_required');
  assert.equal(detectPageState({ url: 'https://x.com/i/bookmarks', bodyText: 'Rate limit exceeded' }), 'rate_limited');
  assert.equal(detectPageState({ url: 'https://x.com/i/bookmarks', bodyText: 'Something went wrong. Try reloading.' }), 'failed');
  assert.equal(detectPageState({ url: 'https://x.com/i/bookmarks', bodyText: "You've reached the end" }), 'end_of_list');
  assert.equal(detectPageState({ url: 'https://x.com/i/bookmarks', bodyText: 'Bookmarks' }), 'ready');
});

test('does not treat text inside a bookmarked post as a platform rate-limit state', () => {
  assert.equal(detectPageState({
    url: 'https://x.com/i/bookmarks',
    bodyText: 'A bookmarked post discussing rate limit handling',
    stateText: 'Bookmarks',
  }), 'ready');
});

test('selects the article containing the requested status ID', () => {
  const selected = selectTweetById([
    { statusUrls: ['https://x.com/reply/status/2000000000000000002'] },
    { statusUrls: ['https://x.com/main/status/2000000000000000001'] },
  ], '2000000000000000001');
  assert.equal(selected.statusUrls[0], 'https://x.com/main/status/2000000000000000001');
  assert.equal(selectTweetById([], '2000000000000000001'), null);
});

test('discovers only each bookmark card time URL, not quoted status links', () => {
  assert.deepEqual(selectBookmarkStatusUrls([
    {
      timeUrl: 'https://x.com/main/status/2000000000000000001',
      statusUrls: [
        'https://x.com/main/status/2000000000000000001',
        'https://x.com/quote/status/2000000000000000002',
      ],
    },
  ]), ['https://x.com/main/status/2000000000000000001']);
});

function fakeDiscoveryPage(snapshots) {
  let index = 0;
  return {
    evaluateCalls: 0,
    async evaluate() {
      this.evaluateCalls += 1;
      const value = snapshots[Math.min(index, snapshots.length - 1)];
      index += 1;
      return value;
    },
  };
}

test('does not report completion after repeated no-progress snapshots', async () => {
  const five = Array.from({ length: 5 }, (_, index) => `https://x.com/user/status/200000000000000000${index}`);
  const page = fakeDiscoveryPage([
    { url: 'https://x.com/i/bookmarks', bodyText: 'Bookmarks', statusUrls: five },
    { url: 'https://x.com/i/bookmarks', bodyText: 'Bookmarks', statusUrls: five },
    { url: 'https://x.com/i/bookmarks', bodyText: 'Bookmarks', statusUrls: five },
  ]);
  const result = await discoverBookmarkUrls(page, {
    count: 20,
    mode: 'count',
    maxNoProgressRounds: 2,
    wait: async () => {},
  });
  assert.equal(result.urls.length, 5);
  assert.equal(result.reason, 'no_progress');
});

test('waits for observable virtual-list progress between discovery rounds', async () => {
  const five = Array.from({ length: 5 }, (_, index) => `https://x.com/user/status/200000000000000000${index}`);
  const page = fakeDiscoveryPage([
    { url: 'https://x.com/i/bookmarks', bodyText: 'Bookmarks', statusUrls: five, scrollHeight: 1000, lastTimeUrl: five.at(-1) },
    { url: 'https://x.com/i/bookmarks', bodyText: 'Bookmarks', statusUrls: five, scrollHeight: 1000, lastTimeUrl: five.at(-1) },
    { url: 'https://x.com/i/bookmarks', bodyText: 'Bookmarks', statusUrls: five, scrollHeight: 1000, lastTimeUrl: five.at(-1) },
  ]);
  let conditionWaits = 0;
  page.waitForFunction = async () => { conditionWaits += 1; };
  await discoverBookmarkUrls(page, {
    count: 20,
    mode: 'count',
    maxNoProgressRounds: 2,
    wait: async () => {},
  });
  assert.ok(conditionWaits >= 2);
});

test('stops with requested-count evidence after collecting enough unique URLs', async () => {
  const first = Array.from({ length: 12 }, (_, index) => `https://twitter.com/user/status/20000000000000000${String(index).padStart(2, '0')}`);
  const second = Array.from({ length: 20 }, (_, index) => `https://x.com/user/status/20000000000000000${String(index).padStart(2, '0')}`);
  const page = fakeDiscoveryPage([
    { url: 'https://x.com/i/bookmarks', bodyText: 'Bookmarks', statusUrls: first },
    { url: 'https://x.com/i/bookmarks', bodyText: 'Bookmarks', statusUrls: second },
  ]);
  const result = await discoverBookmarkUrls(page, {
    count: 20,
    mode: 'count',
    wait: async () => {},
  });
  assert.equal(result.urls.length, 20);
  assert.equal(result.reason, 'requested_count');
  assert.ok(result.urls.every((url) => url.startsWith('https://x.com/')));
});

test('normalizes detail extraction and quote identity from the requested post', async () => {
  const calls = [];
  const page = {
    async goto(url) { calls.push(['goto', url]); },
    async waitForSelector(selector) { calls.push(['waitForSelector', selector]); },
    async evaluate(_fn, tweetId) {
      calls.push(['evaluate', tweetId]);
      return {
        author: 'Main',
        handle: 'wrong-handle-from-dom',
        text: 'Complete body',
        timestamp: '2026-07-14T00:00:00.000Z',
        images: ['https://pbs.twimg.com/media/a?format=jpg&name=orig'],
        videos: [{ videoId: 'v1', thumbnail: 'https://pbs.twimg.com/thumb.jpg' }],
        links: [],
        quotedTweet: {
          author: 'Quote',
          handle: 'quote',
          text: 'Quoted body',
          url: 'https://twitter.com/quote/status/2000000000000000002?s=20',
        },
        stats: { likes: 1, retweets: 2, replies: 3 },
        unsupported: [],
      };
    },
  };
  const detail = await extractTweetDetail(page, {
    handle: 'main',
    id: '2000000000000000001',
    url: 'https://x.com/main/status/2000000000000000001',
  }, { wait: async () => {} });
  assert.equal(detail.identity.url, 'https://x.com/main/status/2000000000000000001');
  assert.equal(detail.handle, 'main');
  assert.equal(detail.quotedTweet.url, 'https://x.com/quote/status/2000000000000000002');
  assert.deepEqual(calls[0], ['goto', 'https://x.com/main/status/2000000000000000001']);
});

test('resolves a quote card implemented as a role=link div by its navigation target', async () => {
  let currentUrl = 'https://x.com/main/status/2000000000000000001';
  const page = {
    url() { return currentUrl; },
    async evaluate(_fn, tweetId) {
      assert.equal(tweetId, '2000000000000000001');
      currentUrl = 'https://twitter.com/quote/status/2000000000000000002?s=20';
      return true;
    },
    async waitForFunction() {},
  };
  assert.equal(
    await resolveQuoteUrlFromCard(page, '2000000000000000001'),
    'https://x.com/quote/status/2000000000000000002',
  );
});
