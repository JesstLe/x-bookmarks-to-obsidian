import assert from 'node:assert/strict';
import { classifyBookmark, upsertAssetMetadata } from './organize-bookmarks.mjs';
import { buildYtDlpDownloadArgs } from './twitter-bookmarks.mjs';

const ytDlpArgs = buildYtDlpDownloadArgs('/tmp/video.mp4', 'https://x.com/user/status/1', 600000);
assert.ok(ytDlpArgs.includes('--socket-timeout'));
assert.ok(!ytDlpArgs.includes('--timeout'));

const css = classifyBookmark('用 CSS grid、container queries 和 animation 打造 responsive landing page UI');
assert.equal(css.category, '前端与设计');
assert.ok(css.topics.includes('css'));
assert.ok(css.useCases.includes('设计前端'));

const architecture = classifyBookmark('How to design a scalable distributed system architecture with event driven services and domain driven design');
assert.equal(architecture.category, '软件工程与架构');
assert.ok(architecture.topics.includes('architecture'));
assert.ok(architecture.useCases.includes('设计架构'));

const agents = classifyBookmark('Build a multi-agent workflow with LLM tool use, MCP, memory and RAG');
assert.equal(agents.category, 'AI 与智能体');
assert.ok(agents.topics.includes('agents'));
assert.ok(agents.useCases.includes('构建 AI 功能'));

const codingTool = classifyBookmark('仔细研究使用下来，ClaudeCode 是 Skill 工作流的承载工具，配合 IDE 很高效');
assert.equal(codingTool.category, '工具、自动化与效率');

const course = classifyBookmark('一门系统学习分布式系统的课程与教程，包含阅读书单');
assert.equal(course.category, '学习、研究与知识方法');

const component = classifyBookmark('Created an animated border beam component library for beautiful landing pages');
assert.equal(component.category, '前端与设计');

const videoCreation = classifyBookmark('用 Seedance 2.0 创作动漫视频，零基础生成电影级镜头');
assert.equal(videoCreation.category, '创意、内容与多媒体');

const finance = classifyBookmark('用监控工具跟踪牛股和交易信号，辅助投资决策');
assert.equal(finance.category, 'Web3、金融与量化');

assert.equal(classifyBookmark('some of my cleanest designs that deserved more attention').category, '前端与设计');
assert.equal(classifyBookmark('一个 49 万 Star 的 GitHub 开源项目与代码仓库').category, '软件工程与架构');
assert.equal(classifyBookmark('研究公众号标题和阅读量，获取流量并提高营销收益').category, '产品、创业与增长');
assert.equal(classifyBookmark('复刻声音和口音声线，用于配音创作').category, '创意、内容与多媒体');

const unknown = classifyBookmark('今天看到一个很有意思的东西');
assert.equal(unknown.category, '待进一步整理');
assert.deepEqual(unknown.topics, ['general']);

const metadataPoisoned = classifyBookmark(`---
type: x-bookmark
asset_category: "学习、研究与知识方法"
asset_topics:
  - "learning"
use_cases:
  - "学习研究"
---

今天看到一个很有意思的东西`);
assert.equal(metadataPoisoned.category, '待进一步整理');

const original = `---
type: x-bookmark
author: "@tester"
url: "https://x.com/tester/status/1"
---

# Tester

> CSS animation demo
`;
const metadata = {
  category: '前端与设计',
  topics: ['css', 'animation'],
  useCases: ['设计前端', '寻找实现参考'],
  confidence: 'high',
};
const once = upsertAssetMetadata(original, metadata);
const twice = upsertAssetMetadata(once, metadata);
assert.equal(once, twice);
assert.match(once, /asset_category: "前端与设计"/);
assert.match(once, /asset_topics:\n  - "css"\n  - "animation"/);
assert.match(once, /# Tester\n\n> CSS animation demo/);

console.log('organize-bookmarks tests: PASS');
