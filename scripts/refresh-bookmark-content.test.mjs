import test from 'node:test';
import assert from 'node:assert/strict';

import { parseRefreshArgs } from './refresh-bookmark-content.mjs';

test('parses content refresh dry-run and requires a backup before apply', () => {
  const dryRun = parseRefreshArgs(['--dry-run', '--limit', '3'], { HOME: '/tmp/home' });
  assert.equal(dryRun.apply, false);
  assert.equal(dryRun.limit, 3);
  assert.equal(dryRun.vault, '/tmp/home/Documents/Obsidian Vault/Inbox/X Bookmarks');
  assert.throws(() => parseRefreshArgs(['--apply'], { HOME: '/tmp/home' }), /backup-dir/);
});

