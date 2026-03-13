---
name: x-bookmarks-to-obsidian
description: 自动将 X (Twitter) 书签中的完整帖子内容保存到 Obsidian。支持登录、提取完整帖子文本（非预览）、自动保存到 Obsidian vault。当用户需要备份或整理 X 书签时触发。
---

# 🐦 X 书签到 Obsidian 自动保存器

自动登录 X (Twitter)，提取书签中所有帖子的**完整内容**（包括全文、图片链接、引用帖等），并保存到你的 Obsidian vault。

## ✨ 核心功能

- 🔐 **自动登录** - 支持持久化浏览器会话，保持登录状态
- 📖 **完整内容提取** - 不只是预览文本，点击进入帖子获取完整内容
- 🎬 **视频下载** - 使用 yt-dlp 下载完整视频（不是分片）
- 📦 **本地保存** - 视频保存到 Obsidian vault 内，可直接播放
- 🖼️ **图片与媒体** - 保存图片链接、视频链接
- 💾 **Obsidian 集成** - 自动创建格式化的 Obsidian 笔记
- 🔄 **增量同步** - 支持只保存新书签，避免重复

## 🚀 使用方式

### 快速开始

```
"帮我把 X 书签保存到 Obsidian"
"同步我的 Twitter 书签到笔记"
```

### 工作流程

1. **启动 Chrome** - 使用 `launch-chrome.sh` 保持登录状态
2. **连接 DevTools** - 通过 puppeteer 连接 localhost:9222
3. **访问书签页** - 直接访问 https://twitter.com/i/bookmarks
4. **提取内容** - 在列表页直接提取文本/图片/视频（无需逐个点击）
5. **点击展开** - 自动点击 "显示更多" 展开长文本
6. **下载视频** - 用 yt-dlp 下载完整视频（不是分片）
7. **保存笔记** - 视频存 vault，用嵌入语法
8. **增量保存** - 跳过已存在的文件

## 📝 输出格式

每个书签会保存为独立的 Obsidian 笔记：

```markdown
---
type: x-bookmark
author: @username
name: "用户显示名"
date: 2024-03-13
url: https://twitter.com/user/status/123
likes: 100
retweets: 20
replies: 5
media_count: 2
---

# 用户显示名 (@username)
*✅ 已展开完整内容*

> 完整的推文内容文本...

## 📷 图片

![](https://pbs.twimg.com/...)

## 🎬 视频

### 视频 1
![视频缩略图](https://pbs.twimg.com/amplify_video_thumb/...)

![[videos/username_video_id.mp4]]

## 🔗 链接

- [链接文字](https://t.co/...)

---
📅 保存时间: 3/13/2026, 5:00:00 PM
📱 来源: X 书签
🔖 原链接: https://twitter.com/username
```

**注意**: 视频使用 Obsidian 嵌入语法 `![[videos/xxx.mp4]]`，需要安装 Media Extended 或 Video Snippet 插件才能播放。

## 🛠️ 技术实现

### 实际使用的脚本

**主脚本**: `./scripts/twitter-bookmarks.mjs`

```bash
# 1. 启动 Chrome（保持登录状态）
cd ./scripts
./launch-chrome.sh --yes

# 2. 运行书签提取脚本
node twitter-bookmarks.mjs --count 10 --obsidian
```

### 依赖

- **Chrome 浏览器** - 需要已登录 X 的 Chrome 会话
- **Puppeteer** - 通过 DevTools Protocol 连接 Chrome
- **yt-dlp** - 下载完整视频 (`brew install yt-dlp`)
- **Obsidian 插件** - Media Extended 或 Video Snippet（播放视频）

### 工作原理

1. **Cookie 复用**: 使用 `launch-chrome.sh` 启动 Chrome，保持已有登录会话
2. **Puppeteer 连接**: 通过 `http://localhost:9222` 连接已启动的 Chrome
3. **内容提取**: 直接在书签列表页面提取，无需逐个点击进入详情页
4. **视频处理**: 捕获网络请求获取视频 URL，用 yt-dlp 下载完整视频
5. **增量保存**: 检查文件是否存在，跳过已保存的书签
- `obsidian-ai_*` - Obsidian vault 操作

### 提取策略

1. **预览模式** - 在书签列表中只能看到部分文本
2. **完整模式** - 必须点击进入帖子详情页才能获取完整内容
3. **展开策略**:
   - 获取所有书签链接
   - 逐个点击进入详情页
   - 提取完整文本（包括展开的 "显示更多"）
   - 提取图片/视频链接
   - 返回书签列表，继续下一个

### 处理的内容类型

- ✅ 纯文本帖子
- ✅ 图片帖子（1-4 张图片）
- ✅ 视频帖子
- ✅ 引用转发帖子
- ✅ 帖子串 (Thread) - 识别并合并
- ✅ 长帖子 - 自动展开 "显示更多"

### 反爬虫应对

- **人性化滚动** - 随机间隔，模拟真实用户
- **分批处理** - 每处理 N 个书签后暂停
- **会话保持** - 使用持久化浏览器，避免重复登录

## 🎯 使用示例

### 示例 1: 首次使用
```
用户: "帮我把 X 书签保存到 Obsidian"
AI: 
1. 启动浏览器
2. 访问 X 书签页面
3. 检测到未登录状态
4. 提示: "请在浏览器中手动登录 X 账号"
5. 等待用户登录完成
6. 开始提取书签...
```

### 示例 2: 后续同步
```
用户: "同步新的 X 书签"
AI:
1. 复用已有浏览器会话（已登录）
2. 访问书签页面
3. 检查已有保存的书签 URL
4. 只提取新增的书签
5. 保存到 Obsidian
```

## ⚙️ 配置选项

在调用时可指定：
- `max_bookmarks` - 最大处理数量（默认: 50）
- `save_path` - Obsidian 保存路径（默认: `Inbox/X Bookmarks/`）
- `include_images` - 是否保存图片链接（默认: true）
- `merge_threads` - 是否合并帖子串（默认: true）
- `delay_ms` - 请求间隔毫秒数（默认: 1000-3000 随机）

## 🚨 注意事项

1. **首次使用需要手动登录** - AI 会提示你在浏览器中输入账号密码
2. **处理时间** - 完整提取 50 个书签约需 3-5 分钟
3. **速率限制** - 如果遇到限制，会自动暂停并等待
4. **数据隐私** - 所有数据保存在本地 Obsidian vault，不上传云端

## 🔄 故障恢复

如果中断：
1. 已保存的书签不会重复
2. 下次运行会从未处理的书签继续
3. 失败的书签会记录在 `failed_bookmarks.txt`

## 📚 相关文档

- `references/extraction-patterns.md` - 内容提取的 CSS 选择器和模式
- `references/obsidian-template.md` - 自定义笔记模板
- `examples/sessions/` - 真实使用案例

---

# 🔧 Chrome Automation 工具集

基于 Chrome 远程调试协议 (CDP) 的自动化工具集。连接到用户正在运行的 Chrome 浏览器（复用 Cookie 和登录状态），执行自动化任务。

## 核心功能

1.  **启动 Chrome 调试模式 (`launch-chrome.sh`)**:
    *   创建独立调试 Profile，同步用户 Cookie（无需重新登录）
    *   自动跳过被占用端口
    *   `--yes` 非交互模式 | `--resync` 强制重新同步 Cookie

2.  **Twitter 推荐页采集 (`twitter-summary.mjs`)**:
    *   自动滚动浏览推荐页，收集推文内容和互动数据
    *   `--count <n>` 指定数量 | `--output <file>` 保存 JSON

3.  **Twitter 发帖/Thread (`twitter-post.js`)**:
    *   **自动Thread**: 长文本自动按段落/句子拆分为多条推文
    *   **CJK字符计算**: 中文按2字符计，默认限制270字符/条
    *   使用Twitter原生Thread编辑器（`+`按钮逐条添加）
    *   4 层发送保障：按钮点击 → Cmd+Enter → CDP 鼠标事件 → JS事件链
    *   `--thread "第1条" "第2条"` 手动Thread | `--limit 140` 自定义字符上限
    *   `--dry-run` 预览模式 | `--file <path>` 从文件读取

4.  **小红书图文笔记发布 (`xiaohongshu-post.js`)**:
    *   自动上传图片 → 填写标题 → 输入正文 → 点击发布
    *   支持多图上传（最多 18 张），格式：png, jpg, jpeg, webp
    *   `--dry-run` 预览模式 | `--content-file <path>` 从文件读取正文
    *   `--topic <tag>` 添加话题标签

5.  **Twitter 删除推文 (`delete-tweet.js`)**:
    *   删除指定用户主页最新推文
    *   `node delete-tweet.js <username>` | `--port 9223` 指定端口

## 依赖安装

```bash
cd ./scripts
npm install
```

## 使用方法

### 1. 启动 Chrome

```bash
./scripts/launch-chrome.sh --yes
```

### 2. 采集推文

```bash
cd ./scripts
node twitter-summary.mjs --count 20 --output ~/tweets.json
```

### 3. Twitter 发帖

```bash
cd ./scripts

# 单条推文
node twitter-post.js "推文内容"

# 从文件读取（超长自动拆分为Thread）
node twitter-post.js --file /path/to/text.txt

# 手动指定Thread每条内容
node twitter-post.js --thread "第一条" "第二条" "第三条"

# 自定义字符限制 + 预览
node twitter-post.js --limit 140 --dry-run --file /path/to/text.txt
```

### 4. 小红书发布图文笔记

```bash
cd ./scripts

# 基本用法（标题 + 图片 必填）
node xiaohongshu-post.js --title "标题" --content "正文" --images /path/to/img1.png /path/to/img2.jpg

# 从文件读取正文
node xiaohongshu-post.js --title "标题" --content-file /path/to/content.txt --images /path/to/img.png

# 预览模式（不实际发布）
node xiaohongshu-post.js --dry-run --title "测试" --images /path/to/img.png

# 添加话题
node xiaohongshu-post.js --title "标题" --content "正文" --topic "话题名" --images /path/to/img.png
```

> **注意**: 小红书需要在调试 Chrome 中提前登录 creator.xiaohongshu.com

### 5. 删除推文

```bash
cd ./scripts
node delete-tweet.js username
```

## 重要说明

- Chrome 安全限制不允许在默认 data-dir 开启远程调试，故使用独立 Profile + Cookie 同步
- Twitter/X 的 React 框架会忽略 Puppeteer 的 `page.click()`，发帖脚本使用 Cmd+Enter 快捷键作为主要发送方式
- 小红书使用 TipTap 富文本编辑器，通过 `keyboard.type()` 输入正文内容
- Cookie 超过 1 小时自动重新同步；也可手动运行 `./scripts/launch-chrome.sh --resync`

## 文件结构

- `SKILL.md` — 本文件
- `scripts/package.json` — Node.js 项目配置（ESM 模块）
- `scripts/launch-chrome.sh` — Chrome 启动器
- `scripts/twitter-bookmarks.mjs` — **X 书签提取（本 Skill 核心）**
- `scripts/twitter-summary.mjs` — 推文采集
- `scripts/twitter-post.js` — 推文发帖/Thread
- `scripts/twitter-verify.js` — 发帖验证
- `scripts/delete-tweet.js` — 推文删除
- `scripts/xiaohongshu-post.js` — 小红书图文发布

## 🔧 问题排查与解决方案

### 问题 1: 语法错误导致脚本无法运行

**现象**: `args[[++i]` 语法错误

**解决**: 修正为 `args[++i]`

```javascript
// 错误
config.port = parseInt(args[[++i], 10);

// 正确
config.port = parseInt(args[++i], 10);
```

### 问题 2: ES Module 中 require() 无法使用

**现象**: `ReferenceError: require is not defined`

**解决**: 使用 import 代替 require

```javascript
// 错误
const fileStream = require('fs').createWriteStream(filepath);

// 正确
import { createWriteStream } from "fs";
const fileStream = createWriteStream(filepath);
```

### 问题 3: Twitter 视频使用 DASH 分片 (.m4s)

**现象**: 下载的视频文件只有几百字节，无法播放

**原因**: Twitter 使用 DASH 流媒体，视频被分割成多个 .m4s 分片文件

**解决**: 使用 yt-dlp 工具下载完整视频

```javascript
// 检测到分片文件时，使用 yt-dlp
if (url.includes('.m4s') || isTwitterVideo) {
    // 调用 yt-dlp 下载
    spawn('yt-dlp', ['--output', filepath, twitterUrl]);
}
```

### 问题 4: 视频重复下载（同一视频显示多次）

**现象**: 
- 同一推文中显示多个相同的视频
- 笔记中出现 "视频 1"、"视频 2" 但内容相同

**原因**: 
- Twitter DOM 中同一视频元素被多种选择器同时匹配
- 提取时产生重复记录

**解决**: 
1. 下载阶段基于 downloadUrl 去重
2. 生成笔记时基于 downloadUrl 过滤重复视频

```javascript
// 去重逻辑
const uniqueVideos = [];
const seenDownloadUrls = new Set();
for (const v of bookmark.videos) {
    const key = v.downloadUrl || v.thumbnail || v.url;
    if (!seenDownloadUrls.has(key)) {
        seenDownloadUrls.add(key);
        uniqueVideos.push(v);
    }
}
```

### 问题 5: 链接文本中的换行符导致 Markdown 链接失效

**现象**: Obsidian 中链接无法点击，分行显示

**原因**: 推文文本中的换行符被直接写入 Markdown

**解决**: 清理换行符

```javascript
// 清理链接文本
const cleanText = (l.text || l.url).replace(/[\r\n]+/g, ' ').trim();

// 清理推文正文
const cleanText = bookmark.text.replace(/[\r\n]+/g, ' ').trim();
```

### 问题 6: Obsidian 无法播放本地视频

**现象**: 视频文件已下载，但无法在笔记中直接播放

**解决**: 
1. 将视频保存到 Obsidian vault 内（不是外部目录）
2. 使用 Obsidian 嵌入语法

```javascript
// 保存到 vault 内的 videos 文件夹
videoDir: path.join(obsidianPath, 'videos');

// 笔记中使用嵌入语法
videoSection += `![[videos/${videoFilename}]]\n`;
```

**注意**: 需要安装 Obsidian 视频播放插件，如 Media Extended 或 Video Snippet

### 问题 7: 视频文件名生成策略

**现象**: 相同视频被多次下载，文件名不同

**解决**: 使用 videoId 或 thumbnail URL 生成唯一文件名

```javascript
const videoId = video.videoId || extractVideoId(video.thumbnail);
const filename = `${handle}_${videoId}.mp4`;
```

### 问题 8: 增量保存

**现象**: 每次运行都重新保存所有书签，覆盖已有文件

**解决**: 保存前检查文件是否已存在

```javascript
// 增量保存：如果文件已存在，跳过
if (existsSync(filepath)) {
    console.log(`⏭️ 跳过（已存在）: ${filepath}`);
} else {
    writeFileSync(filepath, content, 'utf8');
    console.log(`✅ 已保存: ${filepath}`);
}
```
