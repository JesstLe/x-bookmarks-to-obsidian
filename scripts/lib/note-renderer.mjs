import path from 'node:path';

import {
  escapeYamlString,
  parseTweetIdentity,
} from './bookmark-model.mjs';

function unquoteYamlScalar(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed
      .slice(1, -1)
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
  }
  return trimmed;
}

export function parseFrontmatter(markdown) {
  const match = String(markdown).match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return { raw: '', fields: {}, body: String(markdown), start: -1, end: -1 };
  }
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const scalar = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (scalar && scalar[2] !== '') {
      fields[scalar[1]] = unquoteYamlScalar(scalar[2]);
    }
  }
  return {
    raw: match[1],
    fields,
    body: String(markdown).slice(match[0].length),
    start: 0,
    end: match[0].length,
  };
}

function quoteText(text, emptyLabel = '无文本内容；可能仅含媒体或卡片') {
  const normalized = String(text ?? '').trim();
  if (!normalized) return `> *${emptyLabel}*`;
  return normalized
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join('\n');
}

function safeLinkLabel(value) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/[\[\]]/g, '').trim();
}

function relativeEmbed(localPath) {
  return String(localPath).replace(/\\/g, '/').replace(/^\.\//, '');
}

function renderImage(image) {
  if (image.localPath) return `![[${relativeEmbed(image.localPath)}]]`;
  if (image.sourceUrl) return `![](${image.sourceUrl})`;
  return '';
}

function renderVideo(video, index, canonicalUrl) {
  const lines = [`### 视频 ${index + 1}`];
  if (video.thumbnail) lines.push(`![视频缩略图](${video.thumbnail})`);
  if (video.localPath) {
    lines.push(`![[${relativeEmbed(video.localPath)}]]`);
  } else {
    const source = video.sourceUrl || canonicalUrl;
    const suffix = video.failure ? `：${safeLinkLabel(video.failure)}` : '';
    lines.push(`[视频原帖${suffix}](${source})`);
  }
  return lines.join('\n\n');
}

function normalizeIdentity(bookmark) {
  if (bookmark.identity?.url) return parseTweetIdentity(bookmark.identity.url);
  if (bookmark.tweetUrl) return parseTweetIdentity(bookmark.tweetUrl);
  throw new Error('Bookmark is missing a canonical tweet identity');
}

export function renderBookmarkNote(bookmark, { savedAt = new Date() } = {}) {
  const identity = normalizeIdentity(bookmark);
  const timestamp = new Date(bookmark.timestamp);
  if (Number.isNaN(timestamp.getTime())) throw new Error('Bookmark has an invalid timestamp');
  const date = timestamp.toISOString().slice(0, 10);
  const author = bookmark.author || identity.handle;
  const stats = bookmark.stats || {};
  const images = Array.isArray(bookmark.images) ? bookmark.images : [];
  const videos = Array.isArray(bookmark.videos) ? bookmark.videos : [];
  const links = Array.isArray(bookmark.links) ? bookmark.links : [];
  const sections = [];

  sections.push(`# ${author} (@${identity.handle})`, quoteText(bookmark.text));

  if (images.length) {
    sections.push(`## 📷 图片\n\n${images.map(renderImage).filter(Boolean).join('\n\n')}`);
  }
  if (videos.length) {
    sections.push(`## 🎬 视频\n\n${videos.map((video, index) => renderVideo(video, index, identity.url)).join('\n\n')}`);
  }
  if (links.length) {
    const rendered = links
      .filter((link) => link?.url)
      .map((link) => `- [${safeLinkLabel(link.text || link.url)}](${link.url})`)
      .join('\n');
    if (rendered) sections.push(`## 🔗 链接\n\n${rendered}`);
  }
  if (bookmark.quotedTweet) {
    const quote = bookmark.quotedTweet;
    let quoteIdentity = null;
    try {
      if (quote.url) quoteIdentity = parseTweetIdentity(quote.url);
    } catch {
      quoteIdentity = null;
    }
    const quoteHandle = quoteIdentity?.handle || String(quote.handle || '').replace(/^@/, '');
    const quoteLines = [
      `> **${quote.author || quoteHandle || '引用作者'}**${quoteHandle ? ` (@${quoteHandle})` : ''}`,
      '',
      quoteText(quote.text),
    ];
    if (quoteIdentity) quoteLines.push('', `[查看引用原帖](${quoteIdentity.url})`);
    sections.push(`## 💬 引用\n\n${quoteLines.join('\n')}`);
  }

  const savedIso = new Date(savedAt).toISOString();
  return `---
type: x-bookmark
author: "@${escapeYamlString(identity.handle)}"
name: "${escapeYamlString(author)}"
date: "${date}"
url: "${identity.url}"
likes: ${Number(stats.likes) || 0}
retweets: ${Number(stats.retweets) || 0}
replies: ${Number(stats.replies) || 0}
media_count: ${images.length + videos.length}
---

${sections.join('\n\n')}

---
📅 保存时间: ${savedIso}
📱 来源: X 书签
🔖 原链接: [${identity.url}](${identity.url})
`;
}

export function repairGeneratedNoteFields(markdown, identity) {
  const canonical = parseTweetIdentity(identity.url);
  const parsed = parseFrontmatter(markdown);
  if (!parsed.raw) throw new Error('Cannot repair note without frontmatter');

  const frontmatterLines = parsed.raw.split(/\r?\n/);
  const urlLine = `url: "${canonical.url}"`;
  const existingUrlIndex = frontmatterLines.findIndex((line) => /^url:\s*/.test(line));
  if (existingUrlIndex >= 0) frontmatterLines[existingUrlIndex] = urlLine;
  else frontmatterLines.push(urlLine);

  let body = parsed.body;
  const footerLine = `🔖 原链接: [${canonical.url}](${canonical.url})`;
  if (/^🔖 原链接:.*$/m.test(body)) body = body.replace(/^🔖 原链接:.*$/m, footerLine);
  else body = `${body.replace(/\s*$/, '')}\n${footerLine}\n`;

  return `---\n${frontmatterLines.join('\n')}\n---\n${body}`;
}
