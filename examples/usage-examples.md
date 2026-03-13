# 使用示例

本文档展示了如何使用 `x-bookmarks-to-obsidian` skill。

## 示例 1: 首次同步所有书签

### 用户输入
```
帮我把 X 上的所有书签保存到 Obsidian
```

### AI 执行过程

```
🤖 启动 X 书签同步...

Phase 1: 初始化
- 启动浏览器会话
- 访问 https://twitter.com/i/bookmarks
- 检测到需要登录
- 提示用户在浏览器中手动登录

⏸️ 等待用户登录...

用户回复: done

✅ 检测到登录成功

Phase 2: 加载书签列表
- 滚动加载所有书签...
- 发现 127 个书签
- 检查 Obsidian 中已存在的书签...
- 新增: 85 个
- 跳过: 42 个

Phase 3: 提取完整内容
[1/85] @OpenAI - "Exciting news! GPT-5 is now available..."
  ✅ 提取完成
  ✅ 保存到: Inbox/X Bookmarks/2024-03-13 - @OpenAI - GPT5 Announcement.md

[2/85] @naval - "The best books are those that tell you what..."
  ✅ 提取完成
  ✅ 保存到: Inbox/X Bookmarks/2024-03-13 - @naval - Best Books.md

[3/85] @elonmusk - "Starship update coming soon..."
  ✅ 提取完成
  ⚠️  包含 3 张图片
  ✅ 保存到: Inbox/X Bookmarks/2024-03-13 - @elonmusk - Starship Update.md

... (继续处理剩余 82 个书签)

Phase 4: 生成报告
✅ 同步完成！

📊 统计信息:
- 总书签数: 127
- 新增保存: 85
- 跳过已存在: 42
- 失败: 0
- 耗时: 4 小时 23 分钟

📁 保存位置: Inbox/X Bookmarks/
📄 详细报告: Inbox/X Bookmarks/Sync Reports/2024-03-13 - Full Sync.md
```

## 示例 2: 增量同步新书签

### 用户输入
```
同步新的 X 书签（最近一周的）
```

### AI 执行过程

```
🤖 启动 X 书签增量同步...

Phase 1: 复用浏览器会话
- 检测到已有活跃浏览器会话
- 导航到书签页面

Phase 2: 加载最近书签
- 只加载最近 7 天的书签
- 发现 12 个新书签
- 全部为新书签

Phase 3: 提取内容
[1/12] @anthropic - "Claude 3 Opus is now available..."
  ✅ 提取完成
  ✅ 保存到: Inbox/X Bookmarks/2024-03-13 - @anthropic - Claude 3 Opus.md

... (继续处理)

✅ 同步完成！

📊 统计信息:
- 新增保存: 12
- 耗时: 45 分钟
```

## 示例 3: 处理帖子串

### 用户输入
```
保存这个帖子串到 Obsidian: https://twitter.com/user/status/123...
```

### AI 执行过程

```
🤖 提取单个帖子串...

Phase 1: 访问帖子
- 导航到指定 URL
- 检测到这是一个帖子串（thread）

Phase 2: 展开整个串
- 点击 "Show this thread"
- 滚动加载所有回复
- 发现 7 条帖子

Phase 3: 提取完整串
- 提取主帖内容
- 提取 6 条回复
- 保存为单个笔记（串模式）

Phase 4: 保存
✅ 保存到: Inbox/X Bookmarks/2024-03-13 - @user - Thread About AI.md

帖子串内容:
1. 主帖: "Here's why AI will change everything..."
2. 回复 1: "First, let's talk about..."
3. 回复 2: "Second, consider the..."
... (7 条帖子合并为一个笔记)
```

## 示例 4: 自定义配置

### 用户输入
```
保存 X 书签，但是:
- 只要前 20 个
- 不保存图片
- 保存到 Research/Twitter/ 文件夹
```

### AI 执行过程

```
🤖 使用自定义配置同步...

配置:
- maxBookmarks: 20
- includeImages: false
- savePath: Research/Twitter/

Phase 1-2: 加载书签
- 发现 127 个书签，只处理前 20 个

Phase 3: 提取内容
- 跳过图片提取（includeImages: false）
- 更快的提取速度

Phase 4: 保存
- 保存到指定路径: Research/Twitter/

✅ 完成！保存了 20 个书签到 Research/Twitter/
```

## 示例 5: 处理失败与重试

### 用户输入
```
重试失败的书签
```

### AI 执行过程

```
🤖 读取失败记录...

从上次的失败记录中发现:
- Inbox/X Bookmarks/failed_bookmarks_2024-03-12.json
- 包含 3 个失败的书签

重试书签 1/3: @user1 - status/123...
  ❌ 失败原因: Rate limit exceeded (2024-03-12T10:30:00Z)
  🔄 重试中...
  ✅ 成功！已保存

重试书签 2/3: @user2 - status/456...
  ❌ 失败原因: 帖子已删除 (2024-03-12T10:35:00Z)
  ⏭️  跳过（帖子不可访问）

重试书签 3/3: @user3 - status/789...
  ❌ 失败原因: 网络超时 (2024-03-12T10:40:00Z)
  🔄 重试中...
  ✅ 成功！已保存

📊 重试结果:
- 成功: 2
- 仍然失败: 0
- 永久跳过: 1 (已删除)
```

## 示例 6: 生成标签云

### 用户输入
```
分析我的 X 书签，生成标签云
```

### AI 执行过程

```
🤖 分析书签内容...

读取 Inbox/X Bookmarks/ 中的所有笔记:
- 找到 85 个笔记
- 分析标签和内容

📊 标签统计:
#ai (23) - ███████████████████████
#programming (15) - ███████████████
#startup (12) - ████████████
#crypto (8) - ████████
#design (7) - ███████
#philosophy (5) - █████
#science (4) - ████
#productivity (4) - ████

热门作者:
- @naval (8 个书签)
- @OpenAI (6 个书签)
- @elonmusk (5 个书签)

💾 保存分析报告到: Inbox/X Bookmarks/Analysis/Tag Cloud.md
```

## 🎯 最佳实践

### 1. 定期增量同步
```
建议每周运行一次增量同步，而不是一次性同步所有书签
```

### 2. 分类保存
```
为不同主题的书签指定不同的保存路径:
- AI 相关 → Research/AI/Twitter/
- 设计相关 → Design/Inspiration/
- 创业相关 → Business/Startup/
```

### 3. 合并帖子串
```
对于相关的帖子串，使用串模式保存为一个笔记，而不是分散保存
```

### 4. 定期清理
```
定期检查 Obsidian 中的书签笔记，删除过时或不再需要的内容
```

### 5. 标签管理
```
- 使用一致的标签命名规范
- 定期审查和合并相似标签
- 为重要书签添加自定义标签
```
