# X 书签保存到 Obsidian

## ⚠️ 重要说明

这是**实际可用的实现**，不是草稿或规划。

## 🚀 快速开始

```bash
# 1. 启动 Chrome（保持登录状态）
cd ./scripts
./launch-chrome.sh --yes

# 2. 运行书签提取脚本
node twitter-bookmarks.mjs --count 10 --obsidian
```

## 📁 文件结构

```
x-bookmarks-to-obsidian/
├── SKILL.md                    # Skill 描述（已更新）
├── workflow.md                # 实际工作流
├── README.md                  # 本文件
├── scripts/                   # 自动化脚本（已从 chrome-automation 合并）
│   ├── launch-chrome.sh      # Chrome 启动器
│   ├── twitter-bookmarks.mjs # X 书签提取（核心）
│   ├── twitter-summary.mjs   # 推文采集
│   ├── twitter-post.js       # 推文发帖
│   ├── xiaohongshu-post.js   # 小红书发布
│   ├── delete-tweet.js       # 删除推文
│   └── package.json          # Node.js 依赖
├── references/
│   ├── extraction-patterns.md
│   └── obsidian-template.md
└── examples/
    └── usage-examples.md
```

## ✨ 实际功能

### ✅ 已实现

- **Cookie 复用** - 使用已登录的 Chrome 会话，无需重新登录
- **完整内容提取** - 在列表页直接提取，无需逐个点击
- **自动展开** - 点击 "显示更多" 展开长文本
- **视频下载** - 使用 yt-dlp 下载完整视频（不是分片）
- **本地保存** - 视频保存到 Obsidian vault 内
- **嵌入播放** - 笔记中使用 `![[videos/xxx.mp4]]` 嵌入视频
- **增量保存** - 跳过已存在的文件

### ❌ 未实现

- ~~自动登录~~ - 需要手动登录一次，后续复用
- ~~速率限制处理~~ - 简单实现，无自动暂停
- ~~失败重试~~ - 需要手动重跑

## 📝 输出示例

```markdown
---
type: x-bookmark
author: "@username"
name: "用户显示名"
date: 2026-03-13
url: https://twitter.com/user/status/123
likes: 100
retweets: 20
media_count: 2
---

# 用户显示名 (@username)
*✅ 已展开完整内容*

> 完整的推文内容...

## 🎬 视频

![[videos/username_video_123.mp4]]

---
📅 保存时间: 3/13/2026, 5:00:00 PM
📱 来源: X 书签
```

## 🛠️ 技术细节

### 依赖

- **Chrome** - 需要已登录 X 的会话
- **Puppeteer** - 连接 DevTools (localhost:9222)
- **yt-dlp** - `brew install yt-dlp`
- **Obsidian 插件** - Media Extended 或 Video Snippet

### 视频处理

Twitter 视频使用 DASH 分片（.m4s 文件），直接下载只有几百字节。

**解决**: 使用 yt-dlp 下载完整视频

```javascript
// 检测到 Twitter 视频时
spawn('yt-dlp', ['--output', filepath, twitterUrl]);
```

### 增量保存

```javascript
if (existsSync(filepath)) {
    console.log('⏭️ 跳过（已存在）');
} else {
    writeFileSync(filepath, content);
}
```

## 📍 保存位置

- **笔记**: `~/Documents/Obsidian Vault/Inbox/X Bookmarks/`
- **视频**: `~/Documents/Obsidian Vault/Inbox/X Bookmarks/videos/`

## ⚠️ 注意事项

1. 首次使用需要先在 Chrome 中登录 X
2. 视频需要 Obsidian 插件才能播放
3. 视频文件名使用 videoId，确保同一视频不重复下载
4. 笔记中链接的换行符已清理，避免 Markdown 链接失效

## 📚 相关文档

- `SKILL.md` - 完整 Skill 描述和故障排除
- `workflow.md` - 详细实现工作流
