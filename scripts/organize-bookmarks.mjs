#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const CATEGORY_RULES = [
  ['前端与设计', [
    [/\bcss\b|tailwind|scss|less\b/i, 5], [/frontend|前端|网页设计|web design/i, 4],
    [/react|next\.?js|vue\b|svelte|astro\b/i, 3], [/figma|ui\b|ux\b|交互设计|界面设计|design system|设计系统/i, 3],
    [/component librar|组件库|ui component|border beam/i, 4], [/website|webpage|网站|网页|landing page|着陆页/i, 3],
    [/designer|designs?\b|设计师|设计|审美|视觉设计|progress bar|进度条|gradient|渐变/i, 3],
    [/animation|motion|动效|动画|transition|framer motion/i, 2], [/grid|flexbox|container quer|responsive|响应式|landing page/i, 2],
    [/typography|font|icon|svg|canvas|webgl|three\.?js/i, 2],
  ]],
  ['AI 与智能体', [
    [/multi[- ]?agent|智能体|\bagents?\b/i, 4], [/\bllm\b|大语言模型|language model|gpt[- ]?\d|claude|gemini|deepseek|qwen|模型推理/i, 3],
    [/\bmcp\b|rag\b|prompt|提示词|context engineering|上下文工程|tool use|function calling/i, 3],
    [/machine learning|机器学习|deep learning|深度学习|neural network|transformer|fine[- ]?tun|微调/i, 3],
    [/openai|anthropic|hugging ?face|ollama|vllm|unsloth|kimi\b/i, 2],
    [/computer vision|计算机视觉|vision model|视觉模型/i, 3],
    [/artificial intelligence|人工智能|\bai\b/i, 2], [/nvidia|\bgpu\b|模型训练|train.*model/i, 2],
  ]],
  ['软件工程与架构', [
    [/software architecture|system design|系统设计|软件架构|架构设计|distributed system|分布式/i, 5],
    [/event[- ]driven|domain[- ]driven|\bddd\b|microservice|微服务|design pattern|设计模式/i, 4],
    [/refactor|重构|testing|测试|tdd\b|debug|调试|code review|代码审查/i, 3],
    [/typescript|javascript|python|rust\b|golang|\bgo\b|swift\b|java\b|c\+\+|编程|代码/i, 2],
    [/github|git\b|repository|repo\b|代码仓库|开源项目|open source/i, 3],
  ]],
  ['后端、数据与基础设施', [
    [/backend|后端|serverless|服务器|api design|rest api|graphql/i, 4],
    [/database|数据库|postgres|mysql|sqlite|redis|mongodb|supabase|neon\b/i, 4],
    [/docker|kubernetes|\bk8s\b|cloudflare|aws\b|azure\b|gcp\b|部署|deploy|devops|infra/i, 4],
    [/data pipeline|数据工程|etl\b|warehouse|vector database|向量数据库/i, 3],
    [/security|安全|authentication|authorization|oauth|加密|vulnerability/i, 3],
  ]],
  ['工具、自动化与效率', [
    [/automation|自动化|workflow|工作流|n8n\b|zapier|make\.com/i, 4],
    [/developer tool|开发工具|命令行|\bcli\b|plugin|插件|extension|扩展|skill\b/i, 3],
    [/obsidian|notion|raycast|alfred|chrome|browser|浏览器|macos|效率工具/i, 3],
    [/codex|claude code|cursor|windsurf|antigravity|ide\b|vscode/i, 3],
    [/\btools?\b|工具|\bskills?\b|openclaw|overleaf|notebook|配置/i, 3],
    [/app store|appstore|应用商店|publish.*app|发布应用/i, 3],
    [/api proxy|key generator|app builder|native integration|集成/i, 3],
    [/productivity|效率|shortcut|快捷键|template|模板/i, 2],
  ]],
  ['产品、创业与增长', [
    [/product management|产品经理|产品设计|product strategy|产品策略/i, 4],
    [/startup|创业|indie hacker|独立开发|saas\b|mrr\b|arr\b/i, 4],
    [/marketing|营销|growth|增长|seo\b|品牌|branding|copywriting|文案|流量|公众号|阅读量/i, 4],
    [/revenue|收入|business model|商业模式|monetization|变现|用户研究/i, 3],
  ]],
  ['学习、研究与知识方法', [
    [/academic research|学术研究|学术|research paper|paper|论文|arxiv|benchmark|基准|dataset|数据集/i, 4],
    [/tutorial|教程|course|课程/i, 4], [/learn|学习|study|研究/i, 2], [/book|书籍|reading|阅读|书单/i, 2],
    [/knowledge|知识管理|note[- ]taking|笔记方法|methodology|方法论/i, 3],
    [/education|教育|study|训练营|指南|guide\b|lecture|讲座/i, 3],
  ]],
  ['Web3、金融与量化', [
    [/web3|blockchain|区块链|ethereum|以太坊|\beth\b|bitcoin|\bbtc\b|crypto|加密货币/i, 5],
    [/defi\b|nft\b|solana|智能合约|smart contract|wallet|钱包|token\b/i, 4],
    [/quant|量化|trading|交易策略|stock|股票|投资|finance|金融|market|市场分析/i, 3],
    [/财富|资本积累|牛股|跟单|交易信号/i, 3],
  ]],
  ['创意、内容与多媒体', [
    [/video generation|视频生成|video editing|视频剪辑|摄影|photography|cinematic/i, 4],
    [/seedance|即梦|动漫视频|电影级镜头|屏幕录像|screen recording/i, 4],
    [/voice clon|声音复刻|复刻声音|声线|配音|shader|着色器/i, 4],
    [/image generation|图像生成|midjourney|stable diffusion|flux\b|comfyui|绘画|illustration/i, 4],
    [/content creation|内容创作|creator|创作者|music|音乐|podcast|播客|3d\b|blender/i, 3],
    [/storytelling|叙事|creative|创意|视觉艺术|art\b/i, 2],
  ]],
  ['生活、认知与其他', [
    [/life|生活|health|健康|fitness|健身|travel|旅行|food|美食/i, 3],
    [/philosophy|哲学|心理学|psychology|认知|思维|relationship|关系/i, 3],
    [/career|职业|工作感悟|个人成长|习惯|habit/i, 2],
    [/求职|面试|interview|job search|offer\b/i, 3],
  ]],
];

const TOPIC_RULES = [
  ['css', /\bcss\b|tailwind|scss|less\b/i], ['frontend', /frontend|前端|react|next\.?js|vue\b|svelte|astro\b/i],
  ['ui-ux', /\bui\b|\bux\b|figma|交互设计|界面设计|设计师|审美/i], ['design-system', /design system|设计系统|component library|组件库/i],
  ['visual-design', /designer|designs?\b|视觉设计|设计|审美|gradient|渐变/i],
  ['animation', /animation|motion|动效|动画|transition/i], ['web-graphics', /webgl|three\.?js|canvas|svg\b/i],
  ['agents', /multi[- ]?agent|智能体|\bagents?\b|tool use/i], ['llm', /\bllm\b|大语言模型|language model|gpt|claude|gemini|deepseek|qwen/i],
  ['mcp', /\bmcp\b/i], ['rag', /\brag\b|retrieval augmented|检索增强/i], ['prompting', /prompt|提示词|context engineering|上下文工程/i],
  ['machine-learning', /machine learning|机器学习|deep learning|深度学习|fine[- ]?tun|微调|transformer/i],
  ['architecture', /architecture|架构|system design|系统设计|distributed system|分布式|event[- ]driven|domain[- ]driven|\bddd\b|microservice|微服务/i],
  ['testing', /testing|测试|\btdd\b|test[- ]driven/i], ['code-quality', /refactor|重构|debug|调试|code review|代码审查/i],
  ['programming', /typescript|javascript|python|rust\b|golang|swift\b|java\b|c\+\+|编程|代码/i], ['open-source', /github|git\b|repository|repo\b|代码仓库|开源项目|open source/i],
  ['backend', /backend|后端|serverless|服务器|rest api|graphql/i], ['database', /database|数据库|postgres|mysql|sqlite|redis|mongodb|supabase|neon\b/i],
  ['infrastructure', /docker|kubernetes|\bk8s\b|cloudflare|aws\b|azure\b|gcp\b|部署|deploy|devops|infra/i],
  ['data-engineering', /data pipeline|数据工程|etl\b|warehouse|数据仓库/i], ['security', /security|安全|authentication|authorization|oauth|vulnerability/i],
  ['automation', /automation|自动化|workflow|工作流|n8n\b|zapier/i], ['developer-tools', /developer tool|开发工具|\bcli\b|plugin|插件|extension|ide\b|vscode|cursor|codex|claude code/i],
  ['knowledge-tools', /obsidian|notion|知识管理|笔记/i], ['productivity', /productivity|效率|shortcut|快捷键/i],
  ['product', /product management|产品经理|产品设计|product strategy|产品策略|用户研究/i], ['startup', /startup|创业|indie hacker|独立开发|saas\b/i],
  ['marketing', /marketing|营销|growth|增长|seo\b|品牌|copywriting|文案/i],
  ['research', /research|研究|paper|论文|arxiv|benchmark|dataset|数据集/i], ['learning', /tutorial|教程|course|课程|learn|学习|book|书籍|指南/i],
  ['web3', /web3|blockchain|区块链|ethereum|以太坊|\beth\b|bitcoin|\bbtc\b|crypto|defi|nft|solana/i],
  ['quant-finance', /quant|量化|trading|交易|stock|股票|投资|finance|金融/i],
  ['image-generation', /image generation|图像生成|midjourney|stable diffusion|flux\b|comfyui/i],
  ['video', /video|视频|cinematic|剪辑|seedance|即梦|屏幕录像/i], ['audio', /voice|声音|声线|配音|音频/i], ['creative', /creative|创意|art\b|艺术|storytelling|叙事/i],
  ['life', /life|生活|health|健康|fitness|健身|travel|旅行|职业|个人成长/i],
];

const CATEGORY_USE_CASES = {
  '前端与设计': ['设计前端', '寻找实现参考'],
  'AI 与智能体': ['构建 AI 功能', '选择模型与方法'],
  '软件工程与架构': ['设计架构', '改进代码质量'],
  '后端、数据与基础设施': ['构建后端', '选择基础设施'],
  '工具、自动化与效率': ['自动化工作流', '选择工具'],
  '产品、创业与增长': ['规划产品', '制定增长策略'],
  '学习、研究与知识方法': ['学习研究', '建立知识体系'],
  'Web3、金融与量化': ['金融与量化决策', '研究 Web3'],
  '创意、内容与多媒体': ['创作内容', '寻找视觉灵感'],
  '生活、认知与其他': ['个人成长', '拓展认知'],
  '待进一步整理': ['稍后人工判断'],
};

const CATEGORY_FILES = [
  '前端与设计', 'AI 与智能体', '软件工程与架构', '后端、数据与基础设施', '工具、自动化与效率',
  '产品、创业与增长', '学习、研究与知识方法', 'Web3、金融与量化', '创意、内容与多媒体',
  '生活、认知与其他', '待进一步整理',
];

export function classifyBookmark(content) {
  const semanticContent = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const scores = CATEGORY_RULES.map(([category, rules]) => ({
    category,
    score: rules.reduce((sum, [pattern, weight]) => sum + (pattern.test(semanticContent) ? weight : 0), 0),
  })).sort((a, b) => b.score - a.score);

  const best = scores[0];
  const second = scores[1];
  const category = best.score >= 3 ? best.category : '待进一步整理';
  const topics = TOPIC_RULES.filter(([, pattern]) => pattern.test(semanticContent)).map(([topic]) => topic).slice(0, 8);
  const confidence = category === '待进一步整理' ? 'low' : best.score >= 7 || best.score - second.score >= 4 ? 'high' : 'medium';

  return {
    category,
    topics: topics.length ? topics : ['general'],
    useCases: CATEGORY_USE_CASES[category],
    confidence,
  };
}

function yamlList(key, values) {
  return `${key}:\n${values.map((value) => `  - ${JSON.stringify(value)}`).join('\n')}`;
}

export function upsertAssetMetadata(content, metadata) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return content;

  const managed = new Set(['asset_category', 'asset_topics', 'use_cases', 'asset_confidence']);
  const lines = match[1].split(/\r?\n/);
  const kept = [];
  for (let index = 0; index < lines.length; index += 1) {
    const key = lines[index].match(/^([a-zA-Z0-9_-]+):/)?.[1];
    if (!managed.has(key)) {
      kept.push(lines[index]);
      continue;
    }
    while (index + 1 < lines.length && /^\s+-\s/.test(lines[index + 1])) index += 1;
  }

  const assetBlock = [
    `asset_category: ${JSON.stringify(metadata.category)}`,
    yamlList('asset_topics', metadata.topics),
    yamlList('use_cases', metadata.useCases),
    `asset_confidence: ${JSON.stringify(metadata.confidence)}`,
  ].join('\n');
  const yaml = [...kept.filter((line, index, all) => !(line === '' && all[index - 1] === '')), assetBlock].join('\n');
  return `---\n${yaml}\n---\n${match[2]}`;
}

function extractTitle(content, fallback) {
  return content.match(/^#\s+(.+)$/m)?.[1]?.trim() || fallback;
}

function extractAuthor(content) {
  return content.match(/^author:\s*["']?([^"'\n]+)["']?$/m)?.[1]?.trim() || 'unknown';
}

function extractPreview(content) {
  const body = content.replace(/^---[\s\S]*?---\s*/, '');
  const text = body.split(/\r?\n/)
    .filter((line) => /^>\s?/.test(line))
    .map((line) => line.replace(/^>\s?/, ''))
    .join(' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[\[\]`*_#|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 180) || '无可用文本预览';
}

function renderEntry(item) {
  return `- [[${item.basename}|${item.title.replace(/[\[\]|]/g, '')}]] — ${item.author} — \`${item.metadata.topics.join('` `')}\`\n  - ${item.preview}`;
}

function renderPage(title, description, items) {
  const entries = items.sort((a, b) => b.basename.localeCompare(a.basename, 'zh-CN')).map(renderEntry).join('\n');
  return `---\ntype: x-bookmark-asset-index\nupdated: 2026-07-14\nitem_count: ${items.length}\n---\n\n# ${title}\n\n${description}\n\n共 **${items.length}** 条资产。\n\n${entries || '_暂无内容_'}\n`;
}

export function organizeBookmarks(bookmarkDir, { dryRun = false } = {}) {
  const assetDir = path.join(bookmarkDir, '_资产库');
  mkdirSync(assetDir, { recursive: true });
  const filenames = readdirSync(bookmarkDir).filter((name) => name.endsWith('.md')).sort();
  const items = [];
  let changed = 0;

  for (const filename of filenames) {
    const filepath = path.join(bookmarkDir, filename);
    const original = readFileSync(filepath, 'utf8');
    if (!/^type:\s*x-bookmark\s*$/m.test(original)) continue;
    const metadata = classifyBookmark(original);
    const updated = upsertAssetMetadata(original, metadata);
    if (updated !== original) {
      changed += 1;
      if (!dryRun) writeFileSync(filepath, updated, 'utf8');
    }
    items.push({
      filename,
      basename: filename.slice(0, -3),
      title: extractTitle(original, filename.slice(0, -3)),
      author: extractAuthor(original),
      preview: extractPreview(original),
      metadata,
    });
  }

  if (!dryRun) {
    CATEGORY_FILES.forEach((category, index) => {
      const pageItems = items.filter((item) => item.metadata.category === category);
      const prefix = String(index + 1).padStart(2, '0');
      writeFileSync(path.join(assetDir, `${prefix}-${category}.md`), renderPage(category, `主分类：${category}`, pageItems), 'utf8');
    });

    const topicNames = [...new Set(items.flatMap((item) => item.metadata.topics))].sort();
    const topicSections = topicNames.map((topic) => {
      const matches = items.filter((item) => item.metadata.topics.includes(topic));
      return `## ${topic} (${matches.length})\n\n${matches.map(renderEntry).join('\n')}`;
    }).join('\n\n');
    writeFileSync(path.join(assetDir, '20-主题索引.md'), `# 主题索引\n\n${topicSections}\n`, 'utf8');

    const useCases = [...new Set(items.flatMap((item) => item.metadata.useCases))].sort();
    const useCaseSections = useCases.map((useCase) => {
      const matches = items.filter((item) => item.metadata.useCases.includes(useCase));
      return `## ${useCase} (${matches.length})\n\n${matches.map(renderEntry).join('\n')}`;
    }).join('\n\n');
    writeFileSync(path.join(assetDir, '21-使用场景索引.md'), `# 使用场景索引\n\n${useCaseSections}\n`, 'utf8');

    const categoryLinks = CATEGORY_FILES.map((category, index) => {
      const count = items.filter((item) => item.metadata.category === category).length;
      const prefix = String(index + 1).padStart(2, '0');
      return `- [[${prefix}-${category}|${category}]]：${count} 条`;
    }).join('\n');
    const overview = `---\ntype: x-bookmark-asset-hub\nupdated: 2026-07-14\ntotal: ${items.length}\n---\n\n# X 书签资产总索引\n\n这里是 X 书签的功能型入口。做项目时先按任务进入分类或使用场景，再打开原始书签获取完整内容、链接和媒体。\n\n## 按主功能分类\n\n${categoryLinks}\n\n## 跨分类入口\n\n- [[20-主题索引|按技术与主题查找]]\n- [[21-使用场景索引|按项目任务查找]]\n- [[00-组织设计|组织原则与 AI 使用方式]]\n`;
    writeFileSync(path.join(assetDir, '00-资产总索引.md'), overview, 'utf8');
  }

  const counts = Object.fromEntries(CATEGORY_FILES.map((category) => [category, items.filter((item) => item.metadata.category === category).length]));
  return { total: items.length, changed, counts, dryRun };
}

function parseArgs(argv) {
  const defaultDir = path.join(process.env.HOME || '/Users/lv', 'Documents/Obsidian Vault/Inbox/X Bookmarks');
  const options = { bookmarkDir: defaultDir, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--bookmark-dir') options.bookmarkDir = argv[++index];
    else if (argv[index] === '--dry-run') options.dryRun = true;
  }
  return options;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const options = parseArgs(process.argv.slice(2));
  const result = organizeBookmarks(options.bookmarkDir, { dryRun: options.dryRun });
  console.log(JSON.stringify(result, null, 2));
}
