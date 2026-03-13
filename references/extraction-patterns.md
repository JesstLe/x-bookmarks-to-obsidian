# X 帖子内容提取模式

本文档描述如何从 X (Twitter) 页面提取完整的帖子内容。

## 🎯 关键选择器

### 书签列表页 (https://twitter.com/i/bookmarks)

```javascript
// 单个书签容器
'article[data-testid="tweet"]'

// 帖子链接 (用于点击进入详情页)
'a[href*="/status/"]'

// 预览文本（不完整）
'[data-testid="tweetText"]'

// 作者信息
'[data-testid="User-Name"]' // 包含名字和 @handle
```

### 帖子详情页

```javascript
// 完整文本内容
'[data-testid="tweetText"]'

// 展开 "显示更多"
// 如果文本被截断，需要点击：
'[data-testid="tweet-text-show-more-link"]' 
// 或
'span[contains(text(), "Show more")]'

// 图片
'div[data-testid="tweetPhoto"] img'
// 视频
'div[data-testid="videoPlayer"]'

// 引用的原帖
'div[data-testid="tweet"] div[aria-labelledby]'

// 作者信息
'a[href^="/"][role="link"]' // 包含 @handle
```

## 📋 提取流程

### 1. 加载书签列表

```javascript
// 使用 browser_observe() 获取页面结构
// 识别所有 [data-testid="tweet"] 元素
// 提取每个帖子的:
//   - 完整 URL (from a[href*="/status/"])
//   - 作者 (@handle)
//   - 预览文本（用于去重）
//   - 时间戳
```

### 2. 进入帖子详情

```javascript
// 对于每个书签:
// 1. browser_click(tweet_link_id)
// 2. browser_observe() 获取详情页
// 3. 检查是否有 "显示更多" 链接
// 4. 如果有，browser_click(show_more_id)
// 5. 提取完整内容
// 6. browser_keypress("Escape") 或 browser_goto("https://twitter.com/i/bookmarks")
```

### 3. 处理内容

#### 文本内容
```javascript
// 获取完整文本节点
const tweetText = document.querySelector('[data-testid="tweetText"]');
// 处理换行和格式
const text = tweetText.innerText;
```

#### 图片
```javascript
const images = document.querySelectorAll('div[data-testid="tweetPhoto"] img');
const imageUrls = Array.from(images).map(img => ({
  url: img.src,
  alt: img.alt || 'Tweet image'
}));
```

#### 链接
```javascript
const links = tweetText.querySelectorAll('a');
const extractedLinks = Array.from(links).map(link => ({
  text: link.innerText,
  url: link.href
}));
```

#### 话题标签
```javascript
const hashtags = tweetText.querySelectorAll('a[href*="/hashtag/"]');
const tags = Array.from(hashtags).map(a => a.innerText);
```

## 🔄 滚动加载策略

X 使用无限滚动，需要逐步加载所有书签：

```javascript
let lastHeight = 0;
let currentHeight = document.body.scrollHeight;

while (lastHeight !== currentHeight) {
  // 滚动到底部
  window.scrollTo(0, document.body.scrollHeight);
  
  // 等待新内容加载
  await sleep(2000);
  
  lastHeight = currentHeight;
  currentHeight = document.body.scrollHeight;
  
  // 检查是否有新帖子加载
  const tweets = document.querySelectorAll('[data-testid="tweet"]');
  console.log(`已加载 ${tweets.length} 个书签`);
  
  // 安全限制：最多加载 200 个
  if (tweets.length >= 200) break;
}
```

## 🚨 常见问题

### 1. 文本被截断 "..."
```
症状: 文本以 "..." 结尾，不是完整内容
解决: 查找并点击 [data-testid="tweet-text-show-more-link"]
```

### 2. 帖子已删除
```
症状: 点击链接后显示 "This Tweet is unavailable"
解决: 跳过该帖子，记录到 failed_bookmarks.txt
```

### 3. 账号被限制
```
症状: 显示 "Rate limit exceeded" 或 "Something went wrong"
解决: 
  - 等待 15-30 分钟
  - 增加请求间隔 delay_ms
  - 分批处理
```

### 4. 登录过期
```
症状: 重定向到登录页面
解决: 提示用户重新登录
```

## 🎨 Set-of-Mark 使用技巧

使用 `browser_debugging_daemon` 时，依赖视觉编号而非 CSS 选择器：

```javascript
// 1. 观察页面，获取标记
const observation = browser_observe();
// observation 包含:
//   - screenshot_path: 当前截图
//   - elements: { [id]: { type, text, selector, ... } }

// 2. 查找目标元素
const tweetLinks = Object.entries(observation.elements)
  .filter(([id, el]) => 
    el.type === 'link' && 
    el.href?.includes('/status/')
  );

// 3. 点击第一个链接
browser_click(tweetLinks[0][0]);
```

## 📊 数据结构

### 提取的帖子对象
```typescript
interface TweetData {
  id: string;              // "1234567890"
  url: string;             // "https://twitter.com/user/status/1234567890"
  author: {
    name: string;          // "User Name"
    handle: string;        // "@username"
  };
  text: string;            // 完整文本
  timestamp: string;       // "2024-03-13T10:30:00Z"
  images: Array<{
    url: string;
    alt?: string;
  }>;
  links: Array<{
    text: string;
    url: string;
  }>;
  hashtags: string[];      // ["#OpenAI", "#AI"]
  quoteTweet?: TweetData;  // 引用的原帖
  replyTo?: TweetData;     // 回复的帖子
}
```
