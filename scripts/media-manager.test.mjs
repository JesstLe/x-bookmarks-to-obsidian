import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildYtDlpDownloadArgs,
  mediaFilename,
  parseYtDlpJsonLines,
  verifyVideo,
} from './lib/media-manager.mjs';

const tweetUrl = 'https://x.com/main/status/2000000000000000001';

test('parses every yt-dlp JSON object and names entries distinctly', () => {
  const entries = parseYtDlpJsonLines('{"id":"v1","filesize":10}\n{"id":"v2","filesize":20}\n');
  assert.equal(entries.length, 2);
  assert.equal(entries[0].filesize, 10);
  assert.notEqual(
    mediaFilename('2000000000000000001', entries[0], 0),
    mediaFilename('2000000000000000001', entries[1], 1),
  );
});

test('rejects malformed yt-dlp JSON instead of bypassing size checks', () => {
  assert.throws(() => parseYtDlpJsonLines('{"id":"v1"}\nnot-json\n'), /line 2/);
});

test('requests high-quality merged output and debug-profile cookies', () => {
  const args = buildYtDlpDownloadArgs({
    output: '/tmp/video.%(ext)s',
    tweetUrl,
    cookieProfile: '/tmp/chrome-debug-profile',
    timeoutMs: 600000,
  });
  assert.deepEqual(args.slice(0, 4), [
    '--output',
    '/tmp/video.%(ext)s',
    '--format',
    'bestvideo+bestaudio/best',
  ]);
  assert.ok(args.includes('--merge-output-format'));
  assert.deepEqual(
    args.slice(args.indexOf('--cookies-from-browser'), args.indexOf('--cookies-from-browser') + 2),
    ['--cookies-from-browser', 'chrome:/tmp/chrome-debug-profile'],
  );
  assert.deepEqual(
    args.slice(args.indexOf('--socket-timeout'), args.indexOf('--socket-timeout') + 2),
    ['--socket-timeout', '600'],
  );
  assert.equal(args.at(-1), tweetUrl);
});

test('creates filesystem-safe deterministic media names', () => {
  assert.equal(
    mediaFilename('2000000000000000001', { id: 'video:id/one', ext: 'webm' }, 0),
    '2000000000000000001-video_id_one.mp4',
  );
  assert.equal(
    mediaFilename('2000000000000000001', {}, 1),
    '2000000000000000001-video-2.mp4',
  );
});

test('verifies positive-duration videos and rejects invalid files', () => {
  const ok = verifyVideo('/tmp/good.mp4', () => ({ status: 0, stdout: '12.50\n', stderr: '' }));
  assert.deepEqual(ok, { ok: true, duration: 12.5 });

  const zero = verifyVideo('/tmp/zero.mp4', () => ({ status: 0, stdout: '0\n', stderr: '' }));
  assert.equal(zero.ok, false);
  assert.match(zero.reason, /positive duration/);

  const corrupt = verifyVideo('/tmp/bad.mp4', () => ({ status: 1, stdout: '', stderr: 'invalid data' }));
  assert.equal(corrupt.ok, false);
  assert.match(corrupt.reason, /invalid data/);
});
