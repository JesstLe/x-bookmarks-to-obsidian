/**
 * xiaohongshu-post.js — 通过 Chrome 远程调试发布小红书图文笔记
 *
 * 用法:
 *   node xiaohongshu-post.js --title "标题" --content "正文内容" --images /path/to/img1.png /path/to/img2.jpg
 *   node xiaohongshu-post.js --title "标题" --content-file /path/to/content.txt --images /path/to/img.png
 *   node xiaohongshu-post.js --port 9223 --dry-run --title "测试" --images /path/to/img.png
 *
 * 注意:
 *   - 小红书图文笔记必须至少上传一张图片
 *   - 支持格式: png, jpg, jpeg, webp（不支持 gif）
 *   - 图片最大 32MB，推荐 3:4 至 2:1 比例
 *   - 正文最多 1000 字
 */

import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';

// ---- 解析参数 ----
function parseArgs() {
    const args = process.argv.slice(2);
    const config = {
        port: null,
        title: null,
        content: '',
        contentFile: null,
        images: [],
        dryRun: false,
        topics: [] // 话题标签
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--port':
                config.port = parseInt(args[++i]);
                break;
            case '--title':
                config.title = args[++i];
                break;
            case '--content':
                config.content = args[++i];
                break;
            case '--content-file':
                config.contentFile = args[++i];
                break;
            case '--images':
                // Collect all following args until next flag
                while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
                    config.images.push(args[++i]);
                }
                break;
            case '--topic':
                config.topics.push(args[++i]);
                break;
            case '--dry-run':
                config.dryRun = true;
                break;
            default:
                if (!args[i].startsWith('--')) {
                    // Treat as image path if it looks like a file
                    if (fs.existsSync(args[i])) {
                        config.images.push(args[i]);
                    }
                }
        }
    }

    // Read port
    if (!config.port) {
        try {
            config.port = parseInt(fs.readFileSync('/tmp/chrome-debug-port', 'utf8').trim());
        } catch {
            config.port = 9222;
        }
    }

    // Read content from file
    if (config.contentFile) {
        config.content = fs.readFileSync(config.contentFile, 'utf8').trim();
    }

    // Validation
    if (!config.title) {
        console.error('❌ 请提供标题: --title "你的标题"');
        process.exit(1);
    }
    if (config.images.length === 0) {
        console.error('❌ 小红书图文笔记必须至少上传一张图片');
        console.error('   用法: --images /path/to/img1.png /path/to/img2.jpg');
        process.exit(1);
    }

    // Verify images exist
    for (const img of config.images) {
        if (!fs.existsSync(img)) {
            console.error(`❌ 图片文件不存在: ${img}`);
            process.exit(1);
        }
        const ext = path.extname(img).toLowerCase();
        if (!['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) {
            console.error(`❌ 不支持的图片格式: ${ext} (${img})`);
            console.error('   支持: png, jpg, jpeg, webp');
            process.exit(1);
        }
    }

    return config;
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ---- 主逻辑 ----
async function run() {
    const config = parseArgs();

    console.log('📕 小红书图文笔记发布工具');
    console.log(`   端口: ${config.port}`);
    console.log(`   标题: ${config.title}`);
    console.log(`   正文: ${config.content.substring(0, 50)}${config.content.length > 50 ? '...' : ''} (${config.content.length}字)`);
    console.log(`   图片: ${config.images.length} 张`);
    config.images.forEach((img, i) => console.log(`     [${i + 1}] ${path.basename(img)}`));
    if (config.dryRun) console.log('   模式: 🏁 DRY RUN');
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
        // 2) 打开发布页
        console.log('🌐 正在打开创作服务平台...');
        await page.goto('https://creator.xiaohongshu.com/publish/publish', {
            waitUntil: 'networkidle2',
            timeout: 20000
        });
        await sleep(2000);

        if (page.url().includes('login')) {
            await page.screenshot({ path: '/tmp/xhs_post_login.png' });
            console.error('❌ 未登录，请先在调试 Chrome 中登录小红书');
            process.exit(1);
        }
        console.log('✅ 创作服务平台已打开');

        // 3) 切换到"上传图文"标签页
        console.log('📑 切换到上传图文...');
        await page.evaluate(() => {
            const tabs = document.querySelectorAll('span.title');
            for (const tab of tabs) {
                if (tab.innerText.includes('上传图文')) {
                    tab.click();
                    return true;
                }
            }
            return false;
        });
        await sleep(2000);

        // 4) 上传图片
        console.log(`📷 正在上传 ${config.images.length} 张图片...`);
        const fileInput = await page.$('input.upload-input') || await page.$('input[type="file"]');
        if (!fileInput) {
            console.error('❌ 未找到图片上传控件');
            await page.screenshot({ path: '/tmp/xhs_post_error.png' });
            process.exit(1);
        }

        // Upload all images at once (input supports multiple)
        const absolutePaths = config.images.map(img => path.resolve(img));
        await fileInput.uploadFile(...absolutePaths);

        // Wait for upload to complete
        console.log('⏳ 等待图片上传完成...');
        await sleep(3000);

        // Check if title input appeared (indicates upload complete)
        let titleReady = false;
        for (let attempt = 0; attempt < 10; attempt++) {
            const hasTitle = await page.evaluate(() => {
                const input = document.querySelector('input.d-text');
                return input && input.placeholder && input.placeholder.includes('标题');
            });
            if (hasTitle) {
                titleReady = true;
                break;
            }
            await sleep(1000);
        }

        if (!titleReady) {
            console.error('❌ 图片上传后表单未出现');
            await page.screenshot({ path: '/tmp/xhs_post_upload_fail.png' });
            process.exit(1);
        }
        console.log('✅ 图片已上传');

        // 5) 填写标题
        console.log('✏️  正在输入标题...');
        const titleInput = await page.$('input.d-text');
        await titleInput.click();
        await sleep(200);
        await page.keyboard.type(config.title, { delay: 10 });
        await sleep(500);
        console.log(`✅ 标题已输入: "${config.title}"`);

        // 6) 填写正文
        if (config.content) {
            console.log('✏️  正在输入正文...');
            const contentEditor = await page.$('div.tiptap.ProseMirror[contenteditable="true"]');
            if (contentEditor) {
                await contentEditor.click();
                await sleep(300);

                // Use keyboard.type for the content
                await page.keyboard.type(config.content, { delay: 5 });
                await sleep(500);

                // Verify content was input
                const inputContent = await page.evaluate(() => {
                    const editor = document.querySelector('div.tiptap.ProseMirror');
                    return editor ? editor.innerText : '';
                });
                console.log(`✅ 正文已输入 (${inputContent.length}字)`);
            } else {
                console.log('⚠️  未找到正文编辑器，跳过正文输入');
            }
        }

        // 7) 添加话题（如果指定）
        if (config.topics.length > 0) {
            console.log('🏷️  正在添加话题...');
            for (const topic of config.topics) {
                // Click # 话题 button
                await page.evaluate(() => {
                    const btns = document.querySelectorAll('*');
                    for (const btn of btns) {
                        if (btn.innerText === '# 话题' || btn.innerText?.trim() === '话题') {
                            btn.click();
                            return true;
                        }
                    }
                    return false;
                });
                await sleep(1000);

                // Type topic in search
                await page.keyboard.type(topic, { delay: 30 });
                await sleep(1500);

                // Click first result
                await page.keyboard.press('Enter');
                await sleep(500);
            }
        }

        // 8) 检查发布按钮
        const publishBtn = await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
                if (btn.innerText?.trim() === '发布') {
                    return {
                        found: true,
                        disabled: btn.disabled,
                        className: btn.className
                    };
                }
            }
            return { found: false };
        });

        if (!publishBtn.found) {
            console.error('❌ 未找到发布按钮');
            await page.screenshot({ path: '/tmp/xhs_post_error.png' });
            process.exit(1);
        }

        console.log(`✅ 发布按钮状态: ${publishBtn.disabled ? '禁用' : '可用'}`);

        // --- DRY RUN ---
        if (config.dryRun) {
            console.log('');
            console.log('🏁 DRY RUN 模式，不实际发布');
            await page.screenshot({ path: '/tmp/xhs_post_dryrun.png' });
            console.log('   截图已保存到 /tmp/xhs_post_dryrun.png');
            await page.close();
            browser.disconnect();
            return;
        }

        // 9) 点击发布
        console.log('📤 正在发布...');

        // 方法一：直接点击发布按钮
        await page.evaluate(() => {
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
                if (btn.innerText?.trim() === '发布') {
                    btn.click();
                    return;
                }
            }
        });

        // 等待发布完成
        console.log('⏳ 等待发布完成...');
        let published = false;

        // 检查是否出现成功提示或页面跳转
        try {
            await page.waitForFunction(() => {
                // Check for success toast/message
                const toasts = document.querySelectorAll('*');
                for (const t of toasts) {
                    const text = t.innerText || '';
                    if (text.includes('发布成功') || text.includes('已发布')) return true;
                }
                // Check if URL changed (redirected to note management)
                if (location.href.includes('/notes') || location.href.includes('/home')) return true;
                // Check if the publish form disappeared
                const btn = document.querySelector('button');
                const hasPublishBtn = Array.from(document.querySelectorAll('button')).some(b => b.innerText?.trim() === '发布');
                return !hasPublishBtn;
            }, { timeout: 15000 });
            published = true;
        } catch {
            console.log('⚠️  第一次点击可能未生效，尝试备用方法...');
        }

        // 方法二：CDP 鼠标事件
        if (!published) {
            const btn = await page.evaluateHandle(() => {
                const buttons = document.querySelectorAll('button');
                for (const b of buttons) {
                    if (b.innerText?.trim() === '发布') return b;
                }
                return null;
            });

            if (btn) {
                const box = await btn.boundingBox();
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

                    await sleep(8000);

                    // Check result
                    const urlAfter = page.url();
                    if (urlAfter.includes('/notes') || urlAfter.includes('/home')) {
                        published = true;
                    }
                }
            }
        }

        // 10) 结果
        await sleep(2000);
        await page.screenshot({ path: '/tmp/xhs_post_result.png' });

        if (published) {
            console.log('');
            console.log('🎉 笔记发布成功！');
            console.log('   截图已保存到 /tmp/xhs_post_result.png');
        } else {
            console.log('');
            console.log('⚠️  笔记可能未成功发布');
            console.log('   请手动检查小红书创作服务平台');
            console.log('   截图已保存到 /tmp/xhs_post_result.png');
            process.exit(1);
        }

    } catch (err) {
        console.error('❌ 发生错误:', err.message);
        try {
            await page.screenshot({ path: '/tmp/xhs_post_crash.png' });
        } catch { }
        process.exit(1);
    } finally {
        try { await page.close(); } catch { }
        browser.disconnect();
    }
}

run();
