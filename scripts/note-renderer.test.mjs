import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseFrontmatter,
  renderBookmarkNote,
  repairGeneratedNoteFields,
} from './lib/note-renderer.mjs';

const fixtureBookmark = {
  identity: {
    handle: 'main',
    id: '2000000000000000001',
    url: 'https://x.com/main/status/2000000000000000001',
  },
  author: 'Main "Author"',
  handle: 'main',
  timestamp: '2026-07-14T00:00:00.000Z',
  text: 'First paragraph\n\nSecond line',
  stats: { likes: 12, retweets: 3, replies: 2 },
  images: [
    {
      sourceUrl: 'https://pbs.twimg.com/media/image?format=jpg&name=orig',
      localPath: 'media/2000000000000000001/image-1.jpg',
    },
  ],
  videos: [
    {
      sourceUrl: 'https://x.com/main/status/2000000000000000001',
      localPath: 'videos/2000000000000000001-v1.mp4',
    },
    {
      sourceUrl: 'https://x.com/main/status/2000000000000000001',
      failure: 'download failed',
    },
  ],
  links: [{ text: 'Project', url: 'https://example.com/project' }],
  quotedTweet: {
    author: 'Quoted',
    handle: 'quote',
    text: 'Quoted body',
    url: 'https://twitter.com/quote/status/2000000000000000002?s=20',
  },
};

test('uses canonical URLs in YAML, quote link, and footer', () => {
  const note = renderBookmarkNote(fixtureBookmark, {
    savedAt: new Date('2026-07-14T01:02:03.000Z'),
  });
  assert.match(note, /url: "https:\/\/x\.com\/main\/status\/2000000000000000001"/);
  assert.match(
    note,
    /\[查看引用原帖\]\(https:\/\/x\.com\/quote\/status\/2000000000000000002\)/,
  );
  assert.match(
    note,
    /🔖 原链接: \[https:\/\/x\.com\/main\/status\/2000000000000000001\]\(https:\/\/x\.com\/main\/status\/2000000000000000001\)/,
  );
  assert.match(note, /!\[\[media\/2000000000000000001\/image-1\.jpg\]\]/);
  assert.match(note, /!\[\[videos\/2000000000000000001-v1\.mp4\]\]/);
  assert.match(
    note,
    /\[视频原帖：download failed\]\(https:\/\/x\.com\/main\/status\/2000000000000000001\)/,
  );
});

test('escapes YAML display names and parses frontmatter', () => {
  const note = renderBookmarkNote(fixtureBookmark, {
    savedAt: new Date('2026-07-14T01:02:03.000Z'),
  });
  assert.match(note, /name: "Main \\"Author\\""/);
  const parsed = parseFrontmatter(note);
  assert.equal(parsed.fields.type, 'x-bookmark');
  assert.equal(parsed.fields.url, 'https://x.com/main/status/2000000000000000001');
});

test('repairs generated links while preserving organizer metadata and body', () => {
  const existing = `---
type: x-bookmark
author: "@bestiseth"
name: "loveisbug"
date: "2026-01-03"
url: "https://twitter.com/bestiseth/status/1773408167960"
asset_category: "前端开发与设计"
asset_topics:
  - "css"
---

# loveisbug (@bestiseth)

> Existing body

---
📅 保存时间: old
📱 来源: X 书签
🔖 原链接: https://twitter.com/bestiseth
`;
  const repaired = repairGeneratedNoteFields(existing, {
    handle: 'bestiseth',
    id: '2007345262172528850',
    url: 'https://x.com/bestiseth/status/2007345262172528850',
  });
  assert.match(repaired, /asset_category: "前端开发与设计"/);
  assert.match(repaired, /asset_topics:\n  - "css"/);
  assert.match(repaired, /> Existing body/);
  assert.doesNotMatch(repaired, /1773408167960/);
  assert.match(
    repaired,
    /🔖 原链接: \[https:\/\/x\.com\/bestiseth\/status\/2007345262172528850\]/,
  );
  assert.equal(repairGeneratedNoteFields(repaired, {
    handle: 'bestiseth',
    id: '2007345262172528850',
    url: 'https://x.com/bestiseth/status/2007345262172528850',
  }), repaired);
});
