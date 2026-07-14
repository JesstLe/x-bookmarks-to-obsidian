import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  applyRepairPlan,
  inventoryVault,
  planRepairs,
} from './lib/repair-planner.mjs';

function note({ handle, id, urlId = id, extra = '', embed = null }) {
  return `---
type: x-bookmark
author: "@${handle}"
name: "${handle}"
date: "2026-01-01"
url: "https://twitter.com/${handle}/status/${urlId}"
${extra}---

# ${handle} (@${handle})

> Body

${embed ? `![[videos/${embed}]]\n\n` : ''}---
📅 保存时间: old
📱 来源: X 书签
🔖 原链接: https://twitter.com/${handle}
`;
}

function createFixtureVault() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bookmark-repair-'));
  const videos = path.join(root, 'videos');
  fs.mkdirSync(videos);
  fs.writeFileSync(
    path.join(root, '2026-01-01 - @alpha - 2000000000000000001.md'),
    note({
      handle: 'alpha',
      id: '2000000000000000001',
      urlId: '1773408167960',
      extra: 'asset_category: "前端与设计"\nasset_topics:\n  - "css"\n',
      embed: '2000000000000000001-v1.mp4',
    }),
  );
  fs.writeFileSync(
    path.join(root, '2026-01-01 - @beta - 2000000000000000002.md'),
    note({
      handle: 'beta',
      id: '2000000000000000002',
      embed: 'missing.mp4',
    }).replace(
      'url: "https://twitter.com/beta/status/2000000000000000002"',
      'url: "https://x.com/beta/status/2000000000000000002"',
    ).replace(
      '🔖 原链接: https://twitter.com/beta',
      '🔖 原链接: [https://x.com/beta/status/2000000000000000002](https://x.com/beta/status/2000000000000000002)',
    ),
  );
  fs.writeFileSync(path.join(videos, '2000000000000000001-v1.mp4'), 'referenced-video');
  fs.writeFileSync(path.join(videos, 'orphan.mp4'), 'orphan-video');
  return root;
}

test('inventories notes, broken generated links, missing embeds, and orphan media', () => {
  const root = createFixtureVault();
  const inventory = inventoryVault(root);
  const plan = planRepairs(inventory);
  assert.equal(inventory.notes.length, 2);
  assert.equal(plan.notesScanned, 2);
  assert.equal(plan.noteChanges.length, 1);
  assert.deepEqual(plan.missingEmbeds.map((item) => item.filename), ['missing.mp4']);
  assert.deepEqual(plan.orphanMedia.map((item) => item.filename), ['orphan.mp4']);
});

test('planning and dry-run do not modify source files', () => {
  const root = createFixtureVault();
  const target = path.join(root, '2026-01-01 - @alpha - 2000000000000000001.md');
  const before = fs.readFileSync(target, 'utf8');
  const plan = planRepairs(inventoryVault(root));
  const report = applyRepairPlan(plan, { apply: false });
  assert.equal(report.applied, false);
  assert.equal(fs.readFileSync(target, 'utf8'), before);
  assert.equal(fs.existsSync(path.join(root, '_sync')), false);
});

test('apply requires a backup directory', () => {
  const root = createFixtureVault();
  const plan = planRepairs(inventoryVault(root));
  assert.throws(() => applyRepairPlan(plan, { apply: true }), /backup directory/i);
});

test('apply backs up, preserves organizer fields, quarantines orphans, and is idempotent', () => {
  const root = createFixtureVault();
  const backupDir = `${root}-backup`;
  const plan = planRepairs(inventoryVault(root));
  const report = applyRepairPlan(plan, {
    apply: true,
    backupDir,
    quarantine: true,
    timestamp: '2026-07-14T12-00-00-000Z',
  });
  assert.equal(report.applied, true);
  assert.equal(fs.existsSync(path.join(backupDir, 'videos', 'orphan.mp4')), true);
  assert.equal(fs.existsSync(path.join(root, 'videos', 'orphan.mp4')), false);
  assert.equal(fs.existsSync(path.join(root, '_quarantine', '2026-07-14T12-00-00-000Z', 'orphan.mp4')), true);

  const repaired = fs.readFileSync(
    path.join(root, '2026-01-01 - @alpha - 2000000000000000001.md'),
    'utf8',
  );
  assert.match(repaired, /asset_category: "前端与设计"/);
  assert.match(repaired, /url: "https:\/\/x\.com\/alpha\/status\/2000000000000000001"/);
  assert.match(repaired, /🔖 原链接: \[https:\/\/x\.com\/alpha\/status\/2000000000000000001\]/);

  const second = planRepairs(inventoryVault(root));
  assert.equal(second.noteChanges.length, 0);
  assert.equal(second.orphanMedia.length, 0);
});
