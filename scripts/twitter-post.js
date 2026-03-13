/**
 * twitter-post.js — 通过 Chrome 远程调试发布 Twitter 帖子/Thread
 * 
 * 用法:
 *   node twitter-post.js "短文本"               — 发单条推文
 *   node twitter-post.js --file /path/to/text   — 从文件读取，自动拆分为Thread
 *   node twitter-post.js --thread "推文1" "推文2" — 手动指定每条内容
 *   node twitter-post.js --port 9223 "内容"      — 指定Chrome端口
 *   node twitter-post.js --dry-run "内容"         — 预览模式，不实际发送
 *   node twitter-post.js --limit 140 "内容"       — 自定义每条字符上限
 * 
 * Thread逻辑:
 *   - 单条文本超过字符限制时，自动按段落/句子拆分为多条
 *   - 使用Twitter原生Thread编辑器（点击"+"按钮添加推文）
 *   - 一次性"全部发帖"，确保Thread连贯性
 */

import puppeteer from 'puppeteer-core';
import fs from 'fs';

// ──────────────── 配置常量 ────────────────

// Twitter 字符限制（中文按2字符计算，约140个中文字）
const DEFAULT_CHAR_LIMIT = 270;

// ──────────────── 参数解析 ────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    port: null,
    tweets: [],      // 最终要发的推文列表
    dryRun: false,
    charLimit: DEFAULT_CHAR_LIMIT,
    threadMode: false // 是否手动指定了Thread模式
  };

  let rawText = null;
  let filePath = null;
  let manualTweets = [];
  let isThreadFlag = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      config.port = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--file' && args[i + 1]) {
      filePath = args[i + 1];
      i++;
    } else if (args[i] === '--limit' && args[i + 1]) {
      config.charLimit = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--dry-run') {
      config.dryRun = true;
    } else if (args[i] === '--thread') {
      isThreadFlag = true;
      config.threadMode = true;
    } else if (!args[i].startsWith('-')) {
      if (isThreadFlag) {
        manualTweets.push(args[i]);
      } else {
        rawText = args[i];
      }
    }
  }

  // 读取端口
  if (!config.port) {
    try {
      config.port = parseInt(fs.readFileSync('/tmp/chrome-debug-port', 'utf8').trim());
    } catch {
      config.port = 9222;
    }
  }

  // 读取文件内容
  if (filePath) {
    rawText = fs.readFileSync(filePath, 'utf8').trim();
  }

  // 组装推文列表
  if (config.threadMode && manualTweets.length > 0) {
    config.tweets = manualTweets;
  } else if (rawText) {
    config.tweets = splitIntoTweets(rawText, config.charLimit);
  } else {
    console.error('❌ 请提供要发布的文本内容');
    console.error('   用法: node twitter-post.js "文本内容"');
    console.error('   Thread: node twitter-post.js --thread "第1条" "第2条"');
    console.error('   文件:   node twitter-post.js --file /path/to/text.txt');
    process.exit(1);
  }

  return config;
}

// ──────────────── 文本拆分 ────────────────

/**
 * 计算Twitter字符数（中文/日文/韩文占2个字符）
 */
function twitterCharCount(text) {
  let count = 0;
  for (const char of text) {
    // CJK统一表意字符范围
    if (/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u2e80-\u2eff\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef]/.test(char)) {
      count += 2;
    } else {
      count += 1;
    }
  }
  return count;
}

/**
 * 将长文本智能拆分为多条推文
 * 优先按段落拆分（\n\n），其次按句子拆分（。！？.!?），最后按字符硬切
 */
function splitIntoTweets(text, limit) {
  // 如果文本在限制内，直接返回单条
  if (twitterCharCount(text) <= limit) {
    return [text];
  }

  const tweets = [];
  // 先按双换行分段
  const paragraphs = text.split(/\n\n+/);

  let currentTweet = '';

  for (const paragraph of paragraphs) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;

    // 测试：当前内容 + 新段落是否超限
    const combined = currentTweet ? `${currentTweet}\n\n${trimmed}` : trimmed;

    if (twitterCharCount(combined) <= limit) {
      currentTweet = combined;
    } else {
      // 当前推文已满，保存并开始新的
      if (currentTweet) {
        tweets.push(currentTweet.trim());
      }

      // 这个段落本身可能就超限，需要进一步拆分
      if (twitterCharCount(trimmed) > limit) {
        const subParts = splitLongParagraph(trimmed, limit);
        // 除最后一段外都加入tweets
        for (let i = 0; i < subParts.length - 1; i++) {
          tweets.push(subParts[i].trim());
        }
        currentTweet = subParts[subParts.length - 1];
      } else {
        currentTweet = trimmed;
      }
    }
  }

  // 别忘了最后一条
  if (currentTweet.trim()) {
    tweets.push(currentTweet.trim());
  }

  return tweets;
}

/**
 * 拆分超长段落 — 按句子边界切分
 */
function splitLongParagraph(text, limit) {
  const parts = [];
  // 按中英文句子分割
  const sentences = text.split(/(?<=[。！？.!?\n])/);
  let current = '';

  for (const sentence of sentences) {
    const combined = current + sentence;
    if (twitterCharCount(combined) <= limit) {
      current = combined;
    } else {
      if (current) parts.push(current);

      // 单个句子就超限 — 需要硬切
      if (twitterCharCount(sentence) > limit) {
        const hardParts = hardSplit(sentence, limit);
        for (let i = 0; i < hardParts.length - 1; i++) {
          parts.push(hardParts[i]);
        }
        current = hardParts[hardParts.length - 1];
      } else {
        current = sentence;
      }
    }
  }

  if (current) parts.push(current);
  return parts;
}

/**
 * 硬切 — 当单个句子也超限时，按字符数切分
 */
function hardSplit(text, limit) {
  const parts = [];
  let current = '';
  let currentCount = 0;

  for (const char of text) {
    const charWeight = /[\u4e00-\u9fff]/.test(char) ? 2 : 1;
    if (currentCount + charWeight > limit) {
      parts.push(current);
      current = char;
      currentCount = charWeight;
    } else {
      current += char;
      currentCount += charWeight;
    }
  }

  if (current) parts.push(current);
  return parts;
}

// ──────────────── 工具函数 ────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ──────────────── 主逻辑 ────────────────

async function run() {
  const config = parseArgs();

  console.log('🐦 Twitter 发帖工具');
  console.log(`   端口: ${config.port}`);
  console.log(`   模式: ${config.tweets.length > 1 ? `Thread (${config.tweets.length} 条)` : '单条推文'}`);
  console.log(`   字符限制: ${config.charLimit}`);
  if (config.dryRun) console.log('   🏁 DRY RUN 模式');
  console.log('');

  // 显示每条推文的预览
  config.tweets.forEach((t, i) => {
    const count = twitterCharCount(t);
    const preview = t.length > 60 ? t.substring(0, 60) + '...' : t;
    console.log(`   [${i + 1}/${config.tweets.length}] (${count}字) ${preview}`);
  });
  console.log('');

  // 1) 连接 Chrome
  let browser;
  try {
    browser = await puppeteer.connect({
      browserURL: `http://localhost:${config.port}`,
      defaultViewport: null
    });
    console.log('✅ 已连接到 Chrome');
  } catch (err) {
    console.error(`❌ 无法连接到 Chrome (端口 ${config.port})`);
    console.error('   请先运行: ./launch-chrome.sh');
    process.exit(1);
  }

  const page = await browser.newPage();

  try {
    // 2) 打开发帖页面
    console.log('🌐 正在打开发帖界面...');
    await page.goto('https://x.com/compose/post', {
      waitUntil: 'networkidle2',
      timeout: 15000
    });

    // 3) 等待第一个编辑器
    console.log('⏳ 等待编辑器加载...');
    const editorSelector = '[data-testid="tweetTextarea_0"]';
    try {
      await page.waitForSelector(editorSelector, { timeout: 10000 });
    } catch {
      await page.screenshot({ path: '/tmp/twitter_post_error.png' });
      console.error('❌ 编辑器未出现，可能需要登录');
      console.error('   截图: /tmp/twitter_post_error.png');
      process.exit(1);
    }
    console.log('✅ 编辑器已就绪');

    // 4) 输入第一条推文
    console.log(`✏️  正在输入第 1/${config.tweets.length} 条...`);
    await page.click(editorSelector);
    await sleep(300);
    await page.keyboard.type(config.tweets[0], { delay: 5 });
    await sleep(500);

    // 验证第一条输入
    const firstText = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="tweetTextarea_0"]');
      return el ? el.innerText : '';
    });
    if (!firstText || firstText.length < 3) {
      console.error('❌ 第一条推文输入失败');
      await page.screenshot({ path: '/tmp/twitter_post_input_error.png' });
      process.exit(1);
    }
    console.log(`✅ 第 1 条已输入 (${twitterCharCount(firstText)} 字)`);

    // 5) 如果是 Thread，逐条添加后续推文
    if (config.tweets.length > 1) {
      for (let i = 1; i < config.tweets.length; i++) {
        console.log(`📎 添加第 ${i + 1}/${config.tweets.length} 条到 Thread...`);

        // 点击"+"按钮添加新推文
        // 选择器：data-testid="addButton" 或 aria-label="添加帖子"
        const addBtnSelector = '[data-testid="addButton"]';
        const addBtnAlt = '[aria-label="添加帖子"], [aria-label="Add post"]';

        let addBtn = await page.$(addBtnSelector);
        if (!addBtn) {
          addBtn = await page.$(addBtnAlt);
        }

        if (!addBtn) {
          // 尝试等待按钮出现
          try {
            await page.waitForSelector(addBtnSelector, { timeout: 3000 });
            addBtn = await page.$(addBtnSelector);
          } catch {
            console.error(`❌ 找不到"添加帖子"按钮，无法继续添加第 ${i + 1} 条`);
            await page.screenshot({ path: '/tmp/twitter_thread_error.png' });
            process.exit(1);
          }
        }

        // 点击添加按钮
        await addBtn.click();
        await sleep(800);

        // 等待新的编辑器出现
        const newEditorSelector = `[data-testid="tweetTextarea_${i}"]`;
        try {
          await page.waitForSelector(newEditorSelector, { timeout: 5000 });
        } catch {
          console.error(`❌ 第 ${i + 1} 个编辑器未出现`);
          await page.screenshot({ path: '/tmp/twitter_thread_error.png' });
          process.exit(1);
        }

        // 输入文本到新编辑器
        await page.click(newEditorSelector);
        await sleep(300);
        await page.keyboard.type(config.tweets[i], { delay: 5 });
        await sleep(500);

        // 验证输入
        const inputOk = await page.evaluate((sel) => {
          const el = document.querySelector(sel);
          return el && el.innerText.length > 0;
        }, newEditorSelector);

        if (!inputOk) {
          console.error(`⚠️  第 ${i + 1} 条输入可能失败`);
        } else {
          console.log(`✅ 第 ${i + 1} 条已输入`);
        }
      }
    }

    // 6) 检查发帖按钮
    const buttonSelector = '[data-testid="tweetButton"]';
    await page.waitForSelector(buttonSelector, { timeout: 5000 });

    const buttonState = await page.evaluate((sel) => {
      const btn = document.querySelector(sel);
      if (!btn) return { exists: false };
      return {
        exists: true,
        disabled: btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true',
        text: btn.innerText
      };
    }, buttonSelector);

    if (!buttonState.exists) {
      console.error('❌ 发帖按钮未找到');
      process.exit(1);
    }
    if (buttonState.disabled) {
      console.error('❌ 发帖按钮被禁用');
      await page.screenshot({ path: '/tmp/twitter_post_disabled.png' });
      process.exit(1);
    }

    const btnLabel = config.tweets.length > 1 ? '全部发帖' : '发帖';
    console.log(`✅ 按钮就绪: "${buttonState.text}" (期望: ${btnLabel})`);

    // --- DRY RUN ---
    if (config.dryRun) {
      console.log('');
      console.log('🏁 DRY RUN 模式，不实际发送');
      await page.screenshot({ path: '/tmp/twitter_post_dryrun.png' });
      console.log('   截图: /tmp/twitter_post_dryrun.png');
      await page.close();
      browser.disconnect();
      return;
    }

    // 7) 发送推文/Thread
    const totalLabel = config.tweets.length > 1 ? 'Thread' : '推文';
    console.log(`📤 正在发送${totalLabel}...`);

    // 确保焦点在页面上
    await page.click(buttonSelector);
    await sleep(200);

    // 方法一：直接点击按钮（已经在上面点了）
    // 等待编辑器消失表示发送成功
    let posted = false;
    try {
      await page.waitForFunction(
        (sel) => !document.querySelector(sel),
        { timeout: 10000 },
        '[data-testid="tweetTextarea_0"]'
      );
      posted = true;
    } catch {
      console.log('⚠️  直接点击未生效，尝试 Cmd+Enter...');
    }

    // 方法二：Cmd+Enter
    if (!posted) {
      // 先聚焦到最后一个编辑器
      const lastEditor = `[data-testid="tweetTextarea_${config.tweets.length - 1}"]`;
      const lastEl = await page.$(lastEditor);
      if (lastEl) await lastEl.click();
      await sleep(200);

      await page.keyboard.down('Meta');
      await page.keyboard.press('Enter');
      await page.keyboard.up('Meta');

      try {
        await page.waitForFunction(
          (sel) => !document.querySelector(sel),
          { timeout: 8000 },
          '[data-testid="tweetTextarea_0"]'
        );
        posted = true;
      } catch {
        console.log('⚠️  Cmd+Enter 也未生效，尝试 CDP 点击...');
      }
    }

    // 方法三：CDP 底层鼠标事件
    if (!posted) {
      const btnEl = await page.$(buttonSelector);
      if (btnEl) {
        const box = await btnEl.boundingBox();
        if (box) {
          const x = box.x + box.width / 2;
          const y = box.y + box.height / 2;
          const cdpSession = await page.createCDPSession();

          await cdpSession.send('Input.dispatchMouseEvent', {
            type: 'mousePressed', x, y, button: 'left', clickCount: 1
          });
          await sleep(50);
          await cdpSession.send('Input.dispatchMouseEvent', {
            type: 'mouseReleased', x, y, button: 'left', clickCount: 1
          });

          try {
            await page.waitForFunction(
              (sel) => !document.querySelector(sel),
              { timeout: 8000 },
              '[data-testid="tweetTextarea_0"]'
            );
            posted = true;
          } catch {
            console.log('⚠️  CDP 点击也未触发发送');
          }
        }
      }
    }

    // 方法四：JS 事件链
    if (!posted) {
      console.log('⚠️  尝试 JavaScript 事件链...');
      await page.evaluate((sel) => {
        const btn = document.querySelector(sel);
        if (btn) {
          ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
            btn.dispatchEvent(new PointerEvent(type, {
              bubbles: true, cancelable: true, view: window, composed: true
            }));
          });
        }
      }, buttonSelector);

      await sleep(5000);
      const stillOpen = await page.evaluate(
        (sel) => !!document.querySelector(sel),
        '[data-testid="tweetTextarea_0"]'
      );
      posted = !stillOpen;
    }

    // 8) 结果
    await sleep(2000);
    await page.screenshot({ path: '/tmp/twitter_post_result.png' });

    if (posted) {
      console.log('');
      console.log(`🎉 ${totalLabel}发送成功！(共 ${config.tweets.length} 条)`);
      console.log('   截图: /tmp/twitter_post_result.png');
    } else {
      console.log('');
      console.log(`⚠️  ${totalLabel}可能未成功发送（编辑器未关闭）`);
      console.log('   请手动检查 Twitter');
      console.log('   截图: /tmp/twitter_post_result.png');
      process.exit(1);
    }

  } catch (err) {
    console.error('❌ 发生错误:', err.message);
    try { await page.screenshot({ path: '/tmp/twitter_post_crash.png' }); } catch { }
    process.exit(1);
  } finally {
    try { await page.close(); } catch { }
    browser.disconnect();
  }
}

run();
