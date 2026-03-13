/**
 * delete-tweet.js — 删除个人主页最新推文
 *
 * 用法:
 *   node delete-tweet.js <username>          — 删除指定用户最新推文
 *   node delete-tweet.js --port 9223 <user>  — 指定 Chrome 端口
 */

import puppeteer from 'puppeteer-core';
import fs from 'fs';

// ──────────────── 参数解析 ────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let port = null;
  let username = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[i + 1]);
      i++;
    } else if (!args[i].startsWith('-')) {
      username = args[i];
    }
  }

  // 读取端口
  if (!port) {
    try {
      port = parseInt(fs.readFileSync('/tmp/chrome-debug-port', 'utf8').trim());
    } catch {
      port = 9222;
    }
  }

  if (!username) {
    console.error('❌ 请提供 Twitter 用户名');
    console.error('   用法: node delete-tweet.js <username>');
    process.exit(1);
  }

  return { port, username };
}

// ──────────────── 主逻辑 ────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function deleteFirstTweet() {
  const { port, username } = parseArgs();

  const browser = await puppeteer.connect({
    browserURL: `http://localhost:${port}`,
    defaultViewport: null
  });

  const page = await browser.newPage();
  console.log(`🌐 打开 @${username} 的个人资料...`);

  await page.goto(`https://x.com/${username}`, {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  // 等待推文加载
  console.log('⏳ 等待推文加载...');
  try {
    await page.waitForSelector('[data-testid="tweet"]', { timeout: 10000 });
  } catch {
    console.error('❌ 未找到推文，页面可能未加载或无推文');
    await page.screenshot({ path: '/tmp/delete_tweet_error.png' });
    process.exit(1);
  }

  // 步骤1: 点击第一条推文的"更多"按钮（三个点）
  console.log('🔍 查找最新推文的更多按钮...');
  const caretBtn = await page.waitForSelector('[data-testid="caret"]', { timeout: 10000 });
  await caretBtn.click();
  await sleep(1000);

  // 步骤2: 在下拉菜单中找到"删除"选项
  // 中文界面是"删除"，英文界面是"Delete"
  console.log('🗑️  查找删除选项...');

  const deleteBtn = await page.evaluateHandle(() => {
    const items = document.querySelectorAll('[role="menuitem"]');
    for (const item of items) {
      const text = item.textContent || '';
      if (text.includes('删除') || text.includes('Delete')) {
        return item;
      }
    }
    return null;
  });

  if (!deleteBtn || !(await deleteBtn.asElement())) {
    console.error('❌ 未找到删除选项');
    await page.screenshot({ path: '/tmp/delete_tweet_menu_error.png' });
    process.exit(1);
  }

  await deleteBtn.asElement().click();
  console.log('✅ 点击删除');
  await sleep(1500);

  // 步骤3: 点击确认对话框中的"删除"按钮
  console.log('⏳ 等待确认对话框...');
  const confirmSelector = '[data-testid="confirmationSheetConfirm"]';

  try {
    await page.waitForSelector(confirmSelector, { timeout: 5000 });
  } catch {
    console.error('❌ 确认对话框未出现');
    await page.screenshot({ path: '/tmp/delete_tweet_confirm_error.png' });
    process.exit(1);
  }

  const confirmBtn = await page.$(confirmSelector);
  await confirmBtn.click();
  console.log('✅ 确认删除');

  // 等待删除完成
  await sleep(3000);
  await page.screenshot({ path: '/tmp/delete_tweet_result.png' });
  console.log('🎉 推文已删除！');
  console.log('   截图: /tmp/delete_tweet_result.png');

  await page.close();
  browser.disconnect();
}

deleteFirstTweet().catch(err => {
  console.error('❌ 错误:', err.message);
  process.exit(1);
});
