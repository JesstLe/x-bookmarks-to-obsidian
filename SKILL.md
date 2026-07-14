---
name: x-bookmarks-to-obsidian
description: 将 X (Twitter) 书签的详情页正文、原帖链接、引用来源、图片和视频可靠保存到 Obsidian，并对既有书签资产做可回滚修复。用户要求同步、备份、整理或修复 X 书签时触发。
---

# X 书签到 Obsidian 可靠同步器

本 Skill 把 X 书签当作可长期复用的本地资产。同步成功必须有明确证据；未达到请求数量、登录过期、限流、详情提取失败或媒体失败都不能伪装成成功。

## 固定位置

- Skill 根目录：本 `SKILL.md` 所在目录
- 脚本目录：`./scripts`
- 默认书签目录：`~/Documents/Obsidian Vault/Inbox/X Bookmarks`
- 本地图片：`media/<tweet-id>/`
- 本地视频：`videos/`
- 最近运行报告：`_sync/last-run.json`
- 失败历史：`_sync/failures.jsonl`

## 标准同步流程

### 1. 启动或复用登录态 Chrome

```bash
cd ./scripts
./launch-chrome.sh --yes
```

如果 X 登录态已经过期，先在调试 Chrome 中登录。需要重新同步主 Chrome Cookie 时运行：

```bash
./launch-chrome.sh --resync --yes
```

### 2. 同步固定数量书签

```bash
node twitter-bookmarks.mjs --count 50 --obsidian
```

程序先从书签列表收集唯一原帖 URL，再逐条打开详情页提取目标 tweet ID 对应的帖子。已有笔记在普通增量同步中跳过；使用 `--update-existing` 才刷新已有笔记。

### 3. 检查结果

必须同时检查进程退出码和 `_sync/last-run.json`：

- `0` / `complete`：请求范围完整处理；
- `2` / `incomplete`：数量不足、详情失败或媒体失败；
- `3` / `auth_required`：需要重新登录；
- `4` / `rate_limited`：X 限流；
- `1` / `failed`：配置、浏览器、写入或其他致命失败。

固定数量模式下，请求 50 条却只发现 5 条时必须退出 `2`，不能当作完成。

### 4. 同步完成后整理资产索引

```bash
node organize-bookmarks.mjs \
  --bookmark-dir "$HOME/Documents/Obsidian Vault/Inbox/X Bookmarks"
```

整理脚本只更新 `asset_category`、`asset_topics`、`use_cases` 和 `asset_confidence`，并生成 `_资产库` 索引。CSS 属于前端与设计，不单列为一级资产类别。

## 安全预演

下面的命令会实际访问和提取 20 条书签，但不写笔记、不下载媒体、不写报告：

```bash
node twitter-bookmarks.mjs \
  --count 20 \
  --dry-run \
  --no-image-download \
  --no-video-download
```

它适合定时任务部署前的登录与完整性检查。

## 全量模式

```bash
node twitter-bookmarks.mjs --all --obsidian
```

只有 X 页面出现明确的列表结束状态时，全量模式才会返回 `complete`。单纯连续多轮没有新内容只会返回 `incomplete`。

## 笔记保证

每条新笔记保证：

- 文件名、YAML `url` 和页尾原链接使用同一个真实 tweet ID；
- 原链接为可点击的 `https://x.com/<handle>/status/<id>`；
- 引用帖只有在获得真实 status URL 时才显示“查看引用原帖”；
- YAML 显示名经过转义；
- 图片优先本地归档，同时保留远程来源；
- 视频通过 yt-dlp 使用高质量合并格式下载，并在嵌入前通过 ffprobe 正时长验证；
- 多视频使用 tweet ID 加视频 entry ID 命名，不按同一个推文 URL 错误去重；
- 媒体失败时保留真实原帖链接和失败原因；
- 写笔记和运行报告使用临时文件加原子替换。

## 修复既有资产

修复器默认只扫描，不修改：

```bash
node repair-bookmarks.mjs \
  --vault "$HOME/Documents/Obsidian Vault/Inbox/X Bookmarks" \
  --dry-run \
  --report /tmp/x-bookmark-repair.json
```

应用修复必须提供 Vault 外部的新备份目录：

```bash
node repair-bookmarks.mjs \
  --vault "$HOME/Documents/Obsidian Vault/Inbox/X Bookmarks" \
  --apply \
  --backup-dir "$HOME/Documents/Obsidian Backups/X Bookmarks-$(date +%Y%m%d-%H%M%S)" \
  --quarantine
```

修复器会：

- 从文件名恢复真实 tweet ID；
- 修复 YAML 和页尾原帖链接；
- 保留分类、主题和使用场景等未知 frontmatter；
- 报告缺失的本地嵌入和没有本地视频的笔记；
- 计算视频精确重复组；
- 将未被引用的视频移到 `_quarantine/<timestamp>/`；
- 在 `_sync/repair-<timestamp>.json` 保存报告。

修复器不会永久删除笔记或媒体。原帖已经删除、私密或不可访问时，保留现有本地内容并在报告中列出。

### 刷新历史缺损正文

正文为空或引用原帖 URL 缺失时，先预演：

```bash
node refresh-bookmark-content.mjs \
  --vault "$HOME/Documents/Obsidian Vault/Inbox/X Bookmarks" \
  --dry-run
```

应用时必须把候选 Markdown 备份到 Vault 外：

```bash
node refresh-bookmark-content.mjs \
  --vault "$HOME/Documents/Obsidian Vault/Inbox/X Bookmarks" \
  --apply \
  --backup-dir "$HOME/Documents/Obsidian Backups/X Content Refresh-$(date +%Y%m%d-%H%M%S)"
```

刷新器只合并在线恢复的主正文、外链、引用内容和真实引用 status URL；已有本地媒体、资产分类和原保存时间不被覆盖。无法打开的原帖保留现状并进入结构化失败报告。

## 主要选项

```text
--count <n>                 严格处理 n 个唯一书签
--all                       同步到明确列表结束
--obsidian                  写入 Obsidian
--obsidian-path <path>      指定书签目录
--dry-run                   不写文件或媒体
--update-existing           刷新已有笔记
--no-image-download         不本地化图片
--no-video-download         不下载视频
--max-no-progress-rounds n  无进展重试轮数
--port <n>                  Chrome 调试端口
--output <file>             输出结构化 JSON
```

未知选项、无效数字以及同时使用 `--all` 和 `--count` 会直接失败。

## 测试

```bash
cd ./scripts
npm install
npm test
node --check twitter-bookmarks.mjs
node --check repair-bookmarks.mjs
node --check refresh-bookmark-content.mjs
```

## 当前边界

- 不声称自动合并 Thread；每个书签按其原帖保存。
- X Article、投票、Space 和卡片会标记为不完全支持，不能伪装成已完整归档。
- X 已删除且本地未保存的媒体无法恢复。
- 遇到限流会明确失败并交给下次定时运行，不在一次任务中无限等待。
