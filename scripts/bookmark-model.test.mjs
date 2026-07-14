import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canonicalTweetUrl,
  escapeYamlString,
  identityFromFilename,
  parseTweetIdentity,
} from './lib/bookmark-model.mjs';

test('reconstructs canonical URL from X and Twitter URLs', () => {
  const expected = {
    handle: 'A_User',
    id: '1234567890123456789',
    url: 'https://x.com/A_User/status/1234567890123456789',
  };
  assert.deepEqual(
    parseTweetIdentity('https://twitter.com/A_User/status/1234567890123456789?s=20'),
    expected,
  );
  assert.deepEqual(
    parseTweetIdentity('https://x.com/A_User/status/1234567890123456789/photo/1'),
    expected,
  );
});

test('derives identity from the existing note filename', () => {
  assert.deepEqual(
    identityFromFilename('2026-01-03 - @bestiseth - 2007345262172528850.md'),
    {
      handle: 'bestiseth',
      id: '2007345262172528850',
      url: 'https://x.com/bestiseth/status/2007345262172528850',
    },
  );
});

test('rejects invalid identities instead of creating plausible bad links', () => {
  assert.throws(() => canonicalTweetUrl('bad/handle', '1234567890123456789'), /Invalid/);
  assert.throws(() => parseTweetIdentity('https://example.com/user/status/1234567890123456789'), /Invalid/);
  assert.throws(() => identityFromFilename('not-a-bookmark.md'), /identity/);
});

test('escapes YAML scalar content', () => {
  assert.equal(escapeYamlString('A "quoted" name\\line\nnext'), 'A \\"quoted\\" name\\\\line\\nnext');
});
