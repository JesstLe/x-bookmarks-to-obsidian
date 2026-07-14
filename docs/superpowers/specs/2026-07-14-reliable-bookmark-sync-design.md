# Reliable X Bookmark Sync and Asset Repair Design

## Objective

Turn the existing X bookmark Skill into a dependable local asset pipeline. A run must never report success after silently collecting only part of the requested range, every saved note must contain a canonical original-post URL, media failures must remain actionable, and the existing Obsidian collection must be repairable without destructive edits.

The implementation covers both future synchronization and the current 346-note collection under `Inbox/X Bookmarks`.

## Current-State Problems

The audit established these concrete failures:

- A live request for 20 bookmarks stopped after 5 and exited with code 0.
- 337 of 346 YAML URLs contain a millisecond timestamp instead of the tweet ID.
- All 346 footer links point to author profiles rather than original posts.
- 34 video notes do not contain a playable local embed; 39 fallback addresses are not durable Markdown links.
- 67 downloaded videos are not referenced by any note and 21 exact-content duplicate groups exist.
- 93 of 107 quoted-post sections lack a quoted-post status URL.
- Main-post extraction reads list-card DOM even though the Skill promises detail-page completeness.
- Images are remote-only; two currently referenced image URLs already return 404.
- The documented failure file, login detection, rate-limit handling, thread merging, and several documented options do not exist in the main program.

## Chosen Approach

Preserve `twitter-bookmarks.mjs` as the user-facing CLI but move deterministic behavior into focused modules. Browser-specific code collects canonical URLs and detail-page data. Pure modules validate data, render notes, manage run results, and plan migrations. This limits the risky browser surface and makes the correctness rules executable as unit tests.

A full rewrite is rejected because it would discard working Chrome-session and extraction behavior. A monolithic patch is rejected because the current file couples browser navigation, downloading, rendering, persistence, and exit semantics, which caused the audited failures and prevents isolated tests.

## Architecture

### 1. Canonical bookmark model

`scripts/lib/bookmark-model.mjs` owns canonical URL and identity rules.

- A bookmark identity is the numeric tweet ID parsed from a canonical `x.com/<handle>/status/<id>` or `twitter.com/<handle>/status/<id>` URL.
- Saved canonical URLs use `https://x.com/<handle>/status/<id>`.
- Filename, YAML URL, footer URL, media prefix, and failure records all derive from the same identity.
- Display names and scalar YAML values are escaped before rendering.
- Unknown existing frontmatter fields, including organizer fields such as `asset_category`, `asset_topics`, `use_cases`, and `asset_confidence`, are preserved during repairs.

### 2. Browser adapter

`scripts/lib/twitter-browser.mjs` contains all Puppeteer interaction.

The list page is used only to discover stable canonical bookmark URLs. It scrolls until one of these explicit terminal conditions occurs:

- the requested number of unique bookmark URLs is collected;
- X exposes an end-of-list state;
- authentication is required;
- rate limiting or an X error state is detected;
- a configured maximum number of no-progress rounds is reached.

Small `window.scrollBy` increments are not treated as proof of completion. On no progress, the adapter scrolls the last visible article into view and then scrolls to the document bottom before retrying.

Each collected URL is opened in one reusable detail page. The adapter selects the article matching the requested tweet ID, not the first article with a time element. It extracts:

- full visible `tweetText` after expanding “Show more”;
- author, handle, timestamp, interaction counts, and canonical URL;
- original-quality image URLs;
- video identifiers and thumbnails;
- external links with their actual resolved `href`;
- quoted-post author, text, and canonical status URL;
- explicit unsupported-content markers for cards, polls, Spaces, X Articles, and unavailable posts.

The initial release does not claim thread merging. Documentation and CLI help will describe only implemented behavior.

### 3. Run state and failure semantics

`scripts/lib/sync-result.mjs` records:

- requested, discovered, extracted, saved, skipped, failed;
- terminal state: `complete`, `incomplete`, `auth_required`, `rate_limited`, or `failed`;
- one structured failure record per affected tweet;
- start/end timestamps and the exact command options.

Exit codes are stable:

- `0`: complete;
- `2`: incomplete collection or extraction;
- `3`: authentication required;
- `4`: rate limited;
- `1`: configuration, browser, persistence, or unexpected failure.

The run writes `_sync/last-run.json` atomically and appends failures to `_sync/failures.jsonl`. A run that requested 20 but discovered 5 cannot be `complete` unless an explicit end-of-list state was observed and the CLI was invoked in “all available” mode.

### 4. Note rendering and persistence

`scripts/lib/note-renderer.mjs` renders notes from the canonical model.

- YAML and footer URLs are identical canonical status URLs.
- Quote sections include a canonical quoted-post URL when one exists.
- Fallback media links are real Markdown links without truncation.
- Local image and video embeds use paths relative to the bookmark directory.
- Unsupported or unavailable content is labeled rather than silently omitted.
- Writes use a temporary file in the destination directory followed by atomic rename.
- Existing notes are not overwritten during normal incremental sync unless `--update-existing` is explicitly supplied.

### 5. Media manager

`scripts/lib/media-manager.mjs` owns media acquisition and verification.

Images are archived by default to `media/<tweet-id>/image-<n>.<ext>` while preserving the remote source URL in metadata. A failed image download remains a clickable source URL and produces a failure record.

Videos are downloaded with yt-dlp using the debug Chrome profile cookies and a quality selector equivalent to `bestvideo+bestaudio/best`. Output filenames use the tweet ID plus yt-dlp entry ID or an explicit sequence number, so multi-video posts cannot collapse onto one path. Every downloaded file must pass `ffprobe` with a positive duration before it is embedded. Partial files are removed after failed verification, while the original post URL and failure reason are retained.

Size checks parse every JSON entry emitted by yt-dlp rather than assuming one JSON object. Existing valid video files are reused by content identity.

### 6. Existing-asset repair

`scripts/repair-bookmarks.mjs` repairs the current collection.

Default behavior is `--dry-run`. `--apply` requires a backup directory and performs these stages:

1. inventory all notes and media;
2. derive canonical URLs from filename tweet IDs;
3. preserve organizer frontmatter and rewrite only incorrect generated fields;
4. add valid quoted-post URLs when they can be recovered from live detail pages;
5. retry missing image and video assets when the original post is accessible;
6. verify all referenced local media;
7. move unreferenced or superseded files to a timestamped `_quarantine` directory;
8. write a machine-readable repair report with changed, unchanged, unrecoverable, and quarantined counts.

No media is permanently deleted by the repair command. Notes whose original posts are deleted, private, or unavailable are retained with their locally archived content and an explicit availability marker.

## CLI Surface

The existing entry point remains valid:

```bash
node twitter-bookmarks.mjs --count 20 --obsidian
```

New or clarified options:

- `--count <n>`: require exactly `n` unique bookmarks unless end-of-list is explicitly observed;
- `--all`: synchronize until a verified end-of-list state;
- `--dry-run`: extract and validate without writing notes or media;
- `--update-existing`: refresh an existing note while preserving organizer metadata;
- `--no-image-download` and `--no-video-download`;
- `--max-no-progress-rounds <n>`;
- `--obsidian-path`, `--media-dir`, `--video-dir`, and `--report-dir`.

Unknown options and invalid numeric values cause configuration failure instead of being ignored.

## Testing Strategy

Tests use Node's built-in test runner.

Unit tests cover:

- canonical URL parsing and reconstruction;
- YAML escaping and preservation of unknown frontmatter;
- note rendering with correct main and quoted-post links;
- complete versus incomplete run classification and exit codes;
- multi-entry yt-dlp JSON parsing and media naming;
- failure record serialization;
- repair planning, dry-run behavior, backup requirements, and quarantine planning.

Fixture tests exercise browser-page extraction against saved HTML fragments for main text, quotes, media, cards, and missing-content states without requiring X.

Live smoke verification uses the logged-in debug Chrome:

```bash
node twitter-bookmarks.mjs --count 20 --dry-run --no-image-download --no-video-download
```

It must either collect and extract 20 unique bookmarks with exit 0 or exit nonzero with a structured terminal reason. Returning 5 with exit 0 is the regression condition.

Migration verification runs dry-run first, checks its expected counts, creates a temporary copy of representative notes, applies the repair there, and confirms idempotence on a second run before applying to the real vault backup.

## Safety and Compatibility

- Existing dirty worktree changes are preserved and incorporated rather than reset.
- Normal synchronization never deletes notes or media.
- Real-vault migration is preceded by a complete timestamped backup.
- Quarantine replaces deletion for orphan and duplicate media.
- Organizer-generated indexes and frontmatter remain valid after repair.
- The Skill documentation is corrected to match implemented behavior; unsupported thread merging and automatic rate-limit waiting are not claimed.

## Completion Criteria

The work is complete only when all of the following are proven:

1. The full automated test suite passes from `scripts/`.
2. The live 20-bookmark smoke test satisfies the strict completion/exit-code rule.
3. Freshly rendered notes use real status URLs in YAML and footer.
4. A multi-video fixture produces distinct media records and embeds.
5. A failed media download produces an actionable link and structured failure.
6. Repair dry-run reports all 346 existing notes without modifying them.
7. Repair apply runs against a backup-backed copy, preserves organizer metadata, and is idempotent.
8. The real vault repair leaves no incorrect generated main-post URL, no missing referenced local media, and a report for every unrecoverable external asset.
9. All local video embeds pass `ffprobe`.
10. Documentation and CLI help describe only behavior that current tests and live verification prove.
