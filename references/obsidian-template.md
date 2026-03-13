# Obsidian 笔记模板

## 📝 默认模板

提取的 X 书签将保存为独立的 Obsidian 笔记。

### 单条帖子模板

```markdown
---
type: x-bookmark
source: twitter
tweet_id: {{tweet_id}}
author: {{author_handle}}
url: {{tweet_url}}
bookmarked_at: {{current_date}}
created: {{current_date}}
tags:
  - twitter-bookmark
  - {{auto_generated_tags}}
---

# {{author_name}} (@{{author_handle}})

> {{tweet_text}}

{{#if images}}
## 📷 图片
{{#each images}}
![]({{url}})
{{#if alt}}*{{alt}}*{{/if}}
{{/each}}
{{/if}}

{{#if links}}
## 🔗 链接
{{#each links}}
- [{{text}}]({{url}})
{{/each}}
{{/if}}

{{#if quote_tweet}}
## 💬 引用
> **{{quote_tweet.author_name}}** (@{{quote_tweet.author_handle}})
> 
> {{quote_tweet.text}}
{{/if}}

---
📱 [在 X 中查看]({{tweet_url}}) | 📅 {{tweet_date}}
```

### 示例输出

```markdown
---
type: x-bookmark
source: twitter
tweet_id: "1768327123456789012"
author: "@OpenAI"
url: https://twitter.com/OpenAI/status/1768327123456789012
bookmarked_at: "2024-03-13"
created: "2024-03-13"
tags:
  - twitter-bookmark
  - ai
  - gpt
---

# OpenAI (@OpenAI)

> Exciting news! GPT-5 is now available with enhanced reasoning capabilities and multimodal understanding. This represents a major step forward in AI development.
>
> Key improvements:
> - Better logical reasoning
> - Image understanding
> - Longer context window
> - Faster response times

## 🔗 链接
- [Learn more](https://openai.com/gpt-5)
- [Documentation](https://platform.openai.com/docs)

---
📱 [在 X 中查看](https://twitter.com/OpenAI/status/1768327123456789012) | 📅 2024-03-13
```

## 📁 组织方式

### 推荐目录结构

```
Inbox/
  X Bookmarks/
    2024-03/
      2024-03-13 - @OpenAI - GPT-5 Announcement.md
      2024-03-13 - @karpathy - AI Education.md
    2024-04/
      ...
```

### 文件命名规范

```
YYYY-MM-DD - @{{author_handle}} - {{first_30_chars}}.md
```

示例：
```
2024-03-13 - @OpenAI - Exciting news! GPT-5 is now av.md
```

## 🔄 批量保存模板

当保存多个书签时，可选创建索引页：

```markdown
---
type: x-bookmark-index
date: {{current_date}}
total: {{bookmark_count}}
---

# X 书签 - {{current_date}}

本次同步了 **{{bookmark_count}}** 个书签。

## 📚 书签列表

{{#each bookmarks}}
### [{{author_name}}]({{note_link}})
> {{text_preview}}
{{/each}}

---
📅 同步时间: {{sync_timestamp}}
```

## 🏷️ 自动标签生成

基于帖子内容自动生成标签：

```javascript
// 规则示例
const tagRules = [
  { pattern: /AI|GPT|机器学习|深度学习/i, tags: ["ai", "ml"] },
  { pattern: /编程|代码|开发|programming/i, tags: ["programming"] },
  { pattern: /设计|UI|UX|design/i, tags: ["design"] },
  { pattern: /创业|startup|产品/i, tags: ["startup"] },
  { pattern: /加密|区块链|crypto|web3/i, tags: ["crypto", "web3"] },
];

// 从 hashtag 提取
const hashtags = tweet.hashtags.map(h => h.replace('#', '').toLowerCase());

// 从作者提取（知名账号）
const authorTags = {
  "@OpenAI": ["openai", "ai"],
  "@elonmusk": ["elon", "tesla"],
  "@naval": ["wisdom", "philosophy"],
};
```

## 🔧 自定义模板

在 skill 调用时可以指定自定义模板：

```javascript
// 使用简化模板
save_to_obsidian({
  template: "minimal",
  // 只保存文本和链接，不保存图片
});

// 使用完整模板（默认）
save_to_obsidian({
  template: "full",
  // 包含所有信息
});

// 自定义模板路径
save_to_obsidian({
  template_path: "/path/to/custom-template.md",
});
```

### 简化模板示例

```markdown
---
type: x-bookmark
author: {{author_handle}}
url: {{tweet_url}}
tags: [twitter-bookmark]
---

{{tweet_text}}

[🔗 原推]({{tweet_url}})
```

## 📊 元数据字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | string | 固定为 "x-bookmark" |
| `source` | string | 固定为 "twitter" |
| `tweet_id` | string | 帖子唯一 ID |
| `author` | string | 作者 @handle |
| `url` | string | 原帖链接 |
| `bookmarked_at` | date | 书签保存日期 |
| `created` | date | 笔记创建日期 |
| `tags` | array | 自动 + 手动标签 |
| `thread_id` | string | (可选) 如果是帖子串的一部分 |

## 🔄 更新已保存的书签

如果书签已存在（通过 tweet_id 匹配）：

```javascript
// 选项 1: 跳过（默认）
if (exists(tweet_id)) {
  console.log(`书签 ${tweet_id} 已存在，跳过`);
}

// 选项 2: 更新
if (exists(tweet_id)) {
  append_to_note({
    file: existing_file,
    content: "\n\n---\n\n**更新于 {{current_date}}**\n\n{{new_content}}",
  });
}

// 选项 3: 创建新版本
if (exists(tweet_id)) {
  create_note({
    file: `${date} - @${author} - ${title} (v2).md`,
    content: new_content,
  });
}
```
