# X Bookmarks to Obsidian

可靠地把 X 书签详情保存为 Obsidian 资产，并修复历史笔记中的错误原帖链接、缺损正文和媒体引用。

## 安装

```bash
cd scripts
npm install
brew install yt-dlp ffmpeg
```

启动复用登录态的调试 Chrome：

```bash
./launch-chrome.sh --yes
```

## 同步

```bash
node twitter-bookmarks.mjs --count 50 --obsidian
```

安全预演：

```bash
node twitter-bookmarks.mjs --count 20 --dry-run --no-image-download --no-video-download
```

同步结果不仅打印到终端；写入 Obsidian 时还会保存到：

- `_sync/last-run.json`
- `_sync/failures.jsonl`

退出码：`0` 完成、`2` 不完整、`3` 需要登录、`4` 被限流、`1` 致命失败。

## 修复历史资产

先 dry-run：

```bash
node repair-bookmarks.mjs --vault "$HOME/Documents/Obsidian Vault/Inbox/X Bookmarks" --dry-run --report /tmp/x-bookmark-repair.json
```

确认报告后应用：

```bash
node repair-bookmarks.mjs \
  --vault "$HOME/Documents/Obsidian Vault/Inbox/X Bookmarks" \
  --apply \
  --backup-dir "$HOME/Documents/Obsidian Backups/X Bookmarks-$(date +%Y%m%d-%H%M%S)" \
  --quarantine
```

应用前会完整备份；孤儿媒体只移动到 `_quarantine`，不删除。

历史笔记正文为空或引用原帖缺失时，可先预演，再用候选笔记级备份刷新：

```bash
node refresh-bookmark-content.mjs --vault "$HOME/Documents/Obsidian Vault/Inbox/X Bookmarks" --dry-run
node refresh-bookmark-content.mjs \
  --vault "$HOME/Documents/Obsidian Vault/Inbox/X Bookmarks" \
  --apply \
  --backup-dir "$HOME/Documents/Obsidian Backups/X Content Refresh-$(date +%Y%m%d-%H%M%S)"
```

刷新只合并主正文、引用和缺少的链接，保留分类元数据、已有本地媒体与原保存记录。删帖、私密帖或不可访问帖保留现有本地内容并写入失败报告。

## 整理索引

```bash
node organize-bookmarks.mjs --bookmark-dir "$HOME/Documents/Obsidian Vault/Inbox/X Bookmarks"
```

## 验证

```bash
npm test
node --check twitter-bookmarks.mjs
node --check repair-bookmarks.mjs
node --check refresh-bookmark-content.mjs
```

详细操作和失败语义见 [SKILL.md](SKILL.md)。
