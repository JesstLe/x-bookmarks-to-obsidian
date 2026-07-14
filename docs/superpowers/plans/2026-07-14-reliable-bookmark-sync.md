# Reliable X Bookmark Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make X bookmark synchronization complete, truthfully reported, canonically linked, media-safe, and able to repair the existing Obsidian asset collection without destructive deletion.

**Architecture:** Keep `twitter-bookmarks.mjs` as the CLI while extracting pure identity, rendering, run-state, media, and repair logic into `scripts/lib/`. Keep Puppeteer navigation in a browser adapter that first discovers canonical URLs and then extracts matching detail pages. Apply existing-vault repairs through a dry-run-first command with backups and quarantine.

**Tech Stack:** Node.js ESM, Node built-in test runner, Puppeteer Core, yt-dlp, ffprobe, Obsidian Markdown.

## Global Constraints

- Preserve the current dirty worktree and never reset unrelated changes.
- Normal sync and repair never permanently delete notes or media.
- Real-vault repair requires a timestamped backup and moves redundant files to quarantine.
- All generated original-post URLs use `https://x.com/<handle>/status/<tweet-id>`.
- A partial fixed-count run never exits 0.
- Existing organizer frontmatter fields must survive repairs and refreshes.
- Every production behavior change follows a failing-test-first cycle.

---

### Task 1: Canonical identity and note rendering

**Files:**
- Create: `scripts/lib/bookmark-model.mjs`
- Create: `scripts/lib/note-renderer.mjs`
- Create: `scripts/bookmark-model.test.mjs`
- Create: `scripts/note-renderer.test.mjs`
- Modify: `scripts/package.json`

**Interfaces:**
- Produces: `parseTweetIdentity(url)`, `canonicalTweetUrl(handle, id)`, `identityFromFilename(filename)`, `escapeYamlString(value)`.
- Produces: `parseFrontmatter(markdown)`, `renderBookmarkNote(bookmark, options)`, `repairGeneratedNoteFields(markdown, identity)`.

- [ ] **Step 1: Add failing canonical identity tests**

```javascript
test('reconstructs canonical URL from both X and Twitter URLs', () => {
  assert.deepEqual(parseTweetIdentity('https://twitter.com/A_User/status/1234567890123456789?s=20'), {
    handle: 'A_User', id: '1234567890123456789', url: 'https://x.com/A_User/status/1234567890123456789'
  });
});

test('derives identity from the existing note filename', () => {
  assert.deepEqual(identityFromFilename('2026-01-03 - @bestiseth - 2007345262172528850.md'), {
    handle: 'bestiseth', id: '2007345262172528850', url: 'https://x.com/bestiseth/status/2007345262172528850'
  });
});
```

- [ ] **Step 2: Run identity tests and verify RED**

Run: `node --test bookmark-model.test.mjs`

Expected: failure because `lib/bookmark-model.mjs` does not exist.

- [ ] **Step 3: Implement canonical identity and YAML escaping**

```javascript
export function canonicalTweetUrl(handle, id) {
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle) || !/^\d{15,25}$/.test(String(id))) {
    throw new Error('Invalid tweet identity');
  }
  return `https://x.com/${handle}/status/${id}`;
}

export function escapeYamlString(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n');
}
```

- [ ] **Step 4: Run identity tests and verify GREEN**

Run: `node --test bookmark-model.test.mjs`

Expected: all identity tests pass.

- [ ] **Step 5: Add failing note-rendering and repair tests**

```javascript
test('uses one canonical URL in YAML, quote link, and footer', () => {
  const note = renderBookmarkNote(fixtureBookmark, { savedAt: new Date('2026-07-14T00:00:00Z') });
  assert.match(note, /url: "https:\/\/x\.com\/main\/status\/2000000000000000001"/);
  assert.match(note, /\[查看引用原帖\]\(https:\/\/x\.com\/quote\/status\/2000000000000000002\)/);
  assert.match(note, /🔖 原链接: \[https:\/\/x\.com\/main\/status\/2000000000000000001\]/);
});

test('repairs generated links while preserving organizer metadata', () => {
  const repaired = repairGeneratedNoteFields(existingOrganizedNote, identity);
  assert.match(repaired, /asset_category: "前端开发与设计"/);
  assert.doesNotMatch(repaired, /status\/1773408167960/);
});
```

- [ ] **Step 6: Run note tests and verify RED**

Run: `node --test note-renderer.test.mjs`

Expected: failure because the renderer functions do not exist.

- [ ] **Step 7: Implement frontmatter-preserving rendering and repair**

The renderer must preserve the existing frontmatter block, replace only `author`, `name`, `date`, `url`, interaction counts, and `media_count`, and emit local embeds plus real Markdown fallback links.

- [ ] **Step 8: Run Task 1 tests and commit**

Run: `node --test bookmark-model.test.mjs note-renderer.test.mjs`

Expected: all tests pass.

Commit: `git add scripts/lib/bookmark-model.mjs scripts/lib/note-renderer.mjs scripts/bookmark-model.test.mjs scripts/note-renderer.test.mjs scripts/package.json && git commit -m 'feat: canonicalize bookmark notes'`

### Task 2: Truthful run state and atomic reports

**Files:**
- Create: `scripts/lib/sync-result.mjs`
- Create: `scripts/sync-result.test.mjs`

**Interfaces:**
- Produces: `class SyncResult`, `exitCodeForState(state)`, `writeRunReport(result, reportDir)`.
- Consumes: fixed-count/all-mode collection terminal evidence from Task 4.

- [ ] **Step 1: Add failing completion-classification tests**

```javascript
test('fixed-count partial collection is incomplete', () => {
  const result = new SyncResult({ requested: 20, mode: 'count' });
  result.discovered = 5;
  result.finish({ reason: 'no_progress' });
  assert.equal(result.state, 'incomplete');
  assert.equal(result.exitCode, 2);
});

test('all mode is complete only with explicit end-of-list evidence', () => {
  const result = new SyncResult({ requested: null, mode: 'all' });
  result.discovered = 346;
  result.finish({ reason: 'end_of_list' });
  assert.equal(result.state, 'complete');
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test sync-result.test.mjs`

Expected: missing module failure.

- [ ] **Step 3: Implement stable states, exit codes, failure records, and atomic JSON writing**

Use `writeFileSync(tempPath)`, `renameSync(tempPath, finalPath)`, and append newline-delimited failure records only after the last-run report succeeds.

- [ ] **Step 4: Verify GREEN and commit**

Run: `node --test sync-result.test.mjs`

Expected: all tests pass.

Commit: `git add scripts/lib/sync-result.mjs scripts/sync-result.test.mjs && git commit -m 'feat: report bookmark sync outcomes'`

### Task 3: Media identity, quality, and verification

**Files:**
- Create: `scripts/lib/media-manager.mjs`
- Create: `scripts/media-manager.test.mjs`
- Modify: `scripts/twitter-bookmarks.mjs`

**Interfaces:**
- Produces: `parseYtDlpJsonLines(stdout)`, `buildYtDlpDownloadArgs(options)`, `mediaFilename(tweetId, entry, index)`, `verifyVideo(path, runner)`, `downloadImage(url, destination)`.
- Consumes: canonical tweet identity from Task 1.

- [ ] **Step 1: Add failing multi-video and quality tests**

```javascript
test('parses every yt-dlp JSON object and names entries distinctly', () => {
  const entries = parseYtDlpJsonLines('{"id":"v1","filesize":10}\n{"id":"v2","filesize":20}\n');
  assert.equal(entries.length, 2);
  assert.notEqual(mediaFilename('2000000000000000001', entries[0], 0), mediaFilename('2000000000000000001', entries[1], 1));
});

test('requests high-quality merged output and browser cookies', () => {
  const args = buildYtDlpDownloadArgs({ output: '/tmp/video.%(ext)s', tweetUrl, cookieProfile: '/tmp/chrome-debug-profile', timeoutMs: 600000 });
  assert.deepEqual(args.slice(0, 4), ['--output', '/tmp/video.%(ext)s', '--format', 'bestvideo+bestaudio/best']);
  assert.ok(args.includes('--cookies-from-browser'));
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test media-manager.test.mjs`

Expected: missing module failure.

- [ ] **Step 3: Implement media functions and ffprobe verification**

`verifyVideo` must return `{ ok: false, reason }` for nonzero ffprobe status, nonnumeric duration, or duration `<= 0`; only verified paths are rendered as embeds.

- [ ] **Step 4: Verify GREEN and commit**

Run: `node --test media-manager.test.mjs`

Expected: all tests pass.

Commit: `git add scripts/lib/media-manager.mjs scripts/media-manager.test.mjs scripts/twitter-bookmarks.mjs && git commit -m 'feat: verify bookmark media assets'`

### Task 4: Stable browser discovery and detail extraction

**Files:**
- Create: `scripts/lib/twitter-browser.mjs`
- Create: `scripts/twitter-browser.test.mjs`
- Create: `scripts/fixtures/tweet-detail.html`
- Create: `scripts/fixtures/bookmark-list.html`

**Interfaces:**
- Produces: `detectPageState(snapshot)`, `selectTweetById(articles, tweetId)`, `discoverBookmarkUrls(page, options)`, `extractTweetDetail(page, identity)`.
- Produces collection terminal evidence consumed by `SyncResult`.

- [ ] **Step 1: Add failing pure state and article-selection tests**

```javascript
test('recognizes auth and rate-limit states', () => {
  assert.equal(detectPageState({ url: 'https://x.com/i/flow/login', bodyText: '' }), 'auth_required');
  assert.equal(detectPageState({ url: 'https://x.com/i/bookmarks', bodyText: 'Rate limit exceeded' }), 'rate_limited');
});

test('selects the article containing the requested status ID', () => {
  const selected = selectTweetById([
    { statusUrls: ['https://x.com/reply/status/2000000000000000002'] },
    { statusUrls: ['https://x.com/main/status/2000000000000000001'] }
  ], '2000000000000000001');
  assert.equal(selected.statusUrls[0], 'https://x.com/main/status/2000000000000000001');
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test twitter-browser.test.mjs`

Expected: missing module failure.

- [ ] **Step 3: Implement browser adapter with strict terminal evidence**

Discovery must deduplicate canonical status URLs, scroll the last article into view and document bottom on no progress, and return `{ urls, reason }`. Detail extraction opens the canonical URL, waits for the matching article, expands text, and returns the canonical bookmark model including quoted URL.

- [ ] **Step 4: Verify fixture tests and commit**

Run: `node --test twitter-browser.test.mjs`

Expected: all tests pass without network access.

Commit: `git add scripts/lib/twitter-browser.mjs scripts/twitter-browser.test.mjs scripts/fixtures && git commit -m 'feat: extract bookmark detail pages reliably'`

### Task 5: Integrate the reliable CLI

**Files:**
- Modify: `scripts/twitter-bookmarks.mjs`
- Create: `scripts/twitter-bookmarks-cli.test.mjs`
- Modify: `scripts/package.json`

**Interfaces:**
- Consumes all Task 1–4 modules.
- Produces `parseArgs(argv)`, `runSync(config, dependencies)`, and CLI exit behavior.

- [ ] **Step 1: Add failing argument and partial-run tests**

```javascript
test('rejects unknown options and invalid counts', () => {
  assert.throws(() => parseArgs(['--count', 'zero']), /positive integer/);
  assert.throws(() => parseArgs(['--merge-threads']), /Unknown option/);
});

test('returns exit 2 when discovery is partial', async () => {
  const result = await runSync(config20, dependenciesReturningFiveNoProgress);
  assert.equal(result.state, 'incomplete');
  assert.equal(result.exitCode, 2);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test twitter-bookmarks-cli.test.mjs`

Expected: exported CLI APIs or behavior are missing.

- [ ] **Step 3: Refactor the CLI around discovery, detail extraction, media, renderer, and run reports**

Do not download media before checking whether a note already exists. In `--dry-run`, do not create note, media, or report files. Set `process.exitCode = result.exitCode` after disconnecting from Chrome.

- [ ] **Step 4: Run all automated tests and commit**

Run: `npm test`

Expected: all Task 1–5 and organizer tests pass.

Commit: `git add scripts/twitter-bookmarks.mjs scripts/twitter-bookmarks-cli.test.mjs scripts/package.json scripts/package-lock.json && git commit -m 'feat: enforce reliable bookmark sync completion'`

### Task 6: Dry-run-first existing-vault repair

**Files:**
- Create: `scripts/lib/repair-planner.mjs`
- Create: `scripts/repair-bookmarks.mjs`
- Create: `scripts/repair-bookmarks.test.mjs`

**Interfaces:**
- Produces: `inventoryVault(root)`, `planRepairs(inventory)`, `applyRepairPlan(plan, options)`, and repair CLI.
- Consumes note repair from Task 1 and media verification from Task 3.

- [ ] **Step 1: Add failing dry-run, backup, preservation, and idempotence tests**

```javascript
test('dry-run reports changes without modifying source files', () => {
  const before = readFixtureTree(tempVault);
  const report = planRepairs(inventoryVault(tempVault));
  assert.equal(report.notesScanned, 3);
  assert.deepEqual(readFixtureTree(tempVault), before);
});

test('apply requires a backup directory and is idempotent', () => {
  assert.throws(() => applyRepairPlan(plan, { apply: true }), /backup directory/);
  applyRepairPlan(plan, { apply: true, backupDir });
  const second = planRepairs(inventoryVault(tempVault));
  assert.equal(second.noteChanges.length, 0);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test repair-bookmarks.test.mjs`

Expected: missing repair modules.

- [ ] **Step 3: Implement inventory, repair planning, backup, atomic apply, and quarantine**

The planner derives identity from filenames, repairs generated main links, preserves all other frontmatter, reports missing embeds and remote assets, and moves orphans only under `--apply --quarantine`. It never calls `unlink` on user media.

- [ ] **Step 4: Verify GREEN and commit**

Run: `node --test repair-bookmarks.test.mjs`

Expected: all repair tests pass.

Commit: `git add scripts/lib/repair-planner.mjs scripts/repair-bookmarks.mjs scripts/repair-bookmarks.test.mjs && git commit -m 'feat: repair existing bookmark assets safely'`

### Task 7: Documentation, live smoke, and real-vault migration

**Files:**
- Modify: `SKILL.md`
- Modify: `README.md`
- Modify: `references/extraction-patterns.md`
- Modify: `/Users/lv/Documents/Obsidian Vault/Inbox/X Bookmarks/*.md` through the verified repair CLI
- Create: `/Users/lv/Documents/Obsidian Vault/Inbox/X Bookmarks/_sync/repair-<timestamp>.json` through the CLI

**Interfaces:**
- Consumes the final CLI and repair command.
- Produces user-facing truthful documentation and a repaired asset collection.

- [ ] **Step 1: Update documentation to match tested behavior**

Document detail-page extraction, strict exit codes, local images, verified videos, run reports, repair dry-run/apply, backup, and quarantine. Remove claims for thread merging, random automatic rate-limit waiting, unsupported options, and nonexistent `failed_bookmarks.txt`.

- [ ] **Step 2: Run complete automated verification**

Run: `npm test && node --check twitter-bookmarks.mjs && node --check repair-bookmarks.mjs`

Expected: zero test failures and zero syntax errors.

- [ ] **Step 3: Run the live regression smoke**

Run: `node twitter-bookmarks.mjs --count 20 --dry-run --no-image-download --no-video-download`

Expected: either 20 extracted with exit 0 or a nonzero exit with a structured `auth_required`, `rate_limited`, `incomplete`, or `failed` reason. Five extracted with exit 0 is forbidden.

- [ ] **Step 4: Dry-run the entire real vault and preserve the report**

Run: `node repair-bookmarks.mjs --vault '/Users/lv/Documents/Obsidian Vault/Inbox/X Bookmarks' --dry-run --report '/tmp/x-bookmark-repair-dry-run.json'`

Expected: `notesScanned: 346`, no vault modification, and explicit counts for link fixes, missing media, remote failures, and quarantine candidates.

- [ ] **Step 5: Apply through a timestamped backup**

Run: `node repair-bookmarks.mjs --vault '/Users/lv/Documents/Obsidian Vault/Inbox/X Bookmarks' --apply --backup-dir '/Users/lv/Documents/Obsidian Vault/Inbox/X Bookmarks Backups/2026-07-14' --quarantine`

Expected: complete backup, atomic note updates, quarantined rather than deleted media, and a repair report in `_sync/`.

- [ ] **Step 6: Verify the repaired vault and idempotence**

Run the repair dry-run again, scan all generated YAML/footer links, verify every local media embed exists, and run ffprobe over every embedded MP4.

Expected: zero incorrect generated main-post URLs, zero missing local embeds, zero invalid embedded videos, and zero additional note changes on the second repair plan.

- [ ] **Step 7: Commit documentation and implementation metadata**

Commit only Skill repository files; the Obsidian vault remains outside this repository.

Commit: `git add SKILL.md README.md references/extraction-patterns.md docs/superpowers/plans/2026-07-14-reliable-bookmark-sync.md && git commit -m 'docs: document reliable bookmark asset workflow'`
