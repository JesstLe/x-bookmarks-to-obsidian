# X 书签保存到 Obsidian 工作流

本文档定义了完整的执行工作流（基于实际实现）。

## 🎯 目标

从 X (Twitter) 书签中提取完整帖子内容，并保存到 Obsidian vault。

## 📋 执行步骤

### Phase 1: 启动浏览器

#### 1.1 启动 Chrome（持久化会话）

```bash
cd ./scripts
./launch-chrome.sh --yes
```

#### 1.2 连接 Chrome DevTools

```javascript
import puppeteer from "puppeteer-core";

const browser = await puppeteer.connect({
    browserURL: "http://localhost:9222"
});
const page = pages[0] || await browser.newPage();
```

### Phase 2: 访问书签页面

```javascript
await page.goto("https://twitter.com/i/bookmarks", {
    waitUntil: "networkidle2",
    timeout: 30000,
});
```

### Phase 3: 提取内容

#### 3.1 滚动加载

```javascript
// 滚动加载更多书签
await page.evaluate(() => {
    window.scrollBy({ top: window.innerHeight * 0.8, behavior: 'smooth' });
});
await new Promise(r => setTimeout(r, 2000));
```

#### 3.2 提取推文内容

```javascript
const tweetElements = await page.$$('article[data-testid="tweet"]');

for (const tweetEl of tweetElements) {
    const content = await page.evaluate((el) => {
        // 提取作者
        const userNameEl = el.querySelector('[data-testid="User-Name"]');
        const handle = userNameEl?.querySelector('a')?.href?.replace('/', '');
        
        // 提取文本
        const textEl = el.querySelector('[data-testid="tweetText"]');
        let text = textEl?.innerText || "";
        
        // 提取图片
        const images = Array.from(el.querySelectorAll('[data-testid="tweetPhoto"] img'))
            .map(img => img.src);
        
        // 提取视频
        const videos = [];
        const videoElements = el.querySelectorAll('video');
        videoElements.forEach(video => {
            const poster = video.getAttribute('poster');
            videos.push({ thumbnail: poster });
        });
        
        return { handle, text, images, videos };
    }, tweetEl);
}
```

#### 3.3 点击 "显示更多" 展开全文

```javascript
// 在页面中自动点击展开按钮
await page.evaluate((el) => {
    const showMoreBtn = el.querySelector('[data-testid="tweet-text-show-more-link"]');
    if (showMoreBtn) showMoreBtn.click();
}, tweetElement);
```

### Phase 4: 下载视频

#### 4.1 捕获网络请求

```javascript
const capturedVideoUrls = new Set();
await page.setRequestInterception(true);
page.on('request', request => {
    const url = request.url();
    if (url.includes('.mp4') || url.includes('.m4s')) {
        capturedVideoUrls.add(url);
    }
    request.continue();
});
```

#### 4.2 使用 yt-dlp 下载完整视频

```javascript
// Twitter 视频使用 DASH 分片，直接下载 .m4s 只有几百字节
// 必须使用 yt-dlp 下载完整视频

function downloadVideoWithYtdlp(twitterUrl, filepath) {
    return new Promise((resolve, reject) => {
        const ytdlp = spawn('yt-dlp', [
            '--output', filepath,
            '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
            '--no-playlist',
            twitterUrl
        ]);
        
        ytdlp.on('close', (code) => {
            if (code === 0) resolve(filepath);
            else reject(new Error(`yt-dlp failed: ${code}`));
        });
    });
}
```

### Phase 5: 保存到 Obsidian

#### 5.1 视频保存到 vault 内

```javascript
// 视频保存到 vault 内的 videos 文件夹
const videoDir = path.join(obsidianPath, 'videos');
const videoFilename = `${handle}_${videoId}.mp4`;
const videoFilepath = path.join(videoDir, videoFilename);
```

#### 5.2 生成笔记内容

```javascript
const content = `---
type: x-bookmark
author: "@${bookmark.handle}"
name: "${bookmark.author}"
date: "${date}"
url: "https://twitter.com/${bookmark.handle}/status/${tweetId}"
likes: ${stats.likes}
retweets: ${stats.retweets}
media_count: ${images.length + videos.length}
---

# ${bookmark.author} (@${bookmark.handle})

> ${bookmark.text.replace(/[\r\n]+/g, ' ')}

## 🎬 视频

![[videos/${videoFilename}]]

---
📅 保存时间: ${new Date().toLocaleString()}
📱 来源: X 书签
`;
```

#### 5.3 增量保存

```javascript
// 检查文件是否已存在，跳过重复
if (existsSync(filepath)) {
    console.log(`⏭️ 跳过（已存在）: ${filepath}`);
} else {
    writeFileSync(filepath, content, 'utf8');
    console.log(`✅ 已保存: ${filepath}`);
}
```

### Phase 6: 完成

```javascript
await browser.disconnect();
console.log("👋 已断开与 Chrome 的连接");
```

## 🔧 关键实现细节

### 视频去重

```javascript
// 基于 downloadUrl 去重，避免同一视频多次下载
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

### 链接文本清理

```javascript
// 移除换行符，避免 Markdown 链接失效
const cleanText = (l.text || l.url).replace(/[\r\n]+/g, ' ').trim();
```

## 📊 性能

- **启动浏览器**: 5-10秒
- **加载书签页面**: 5-10秒
- **提取+下载**: 30-60秒/书签（含视频）
- **50个书签**: 约30-60分钟

## ⚠️ 注意事项

1. 需要安装 yt-dlp: `brew install yt-dlp`
2. Obsidian 需要安装 Media Extended 或 Video Snippet 插件播放视频
3. 首次使用需要手动登录 X
4. 视频保存到 vault 内用嵌入语法: `![[videos/xxx.mp4]]`
