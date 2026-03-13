#!/usr/bin/env node
// ============================================================================
// twitter-summary.mjs — 连接 Chrome 远程调试，浏览 Twitter 推荐页并收集帖子
//
// 用法:
//   node twitter-summary.mjs                    # 默认端口（从 /tmp/chrome-debug-port 读取或 9222）
//   node twitter-summary.mjs --port 9333        # 指定端口
//   node twitter-summary.mjs --count 30         # 收集 30 条（默认 20）
//   node twitter-summary.mjs --output result.json  # 输出到文件
// ============================================================================

import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "fs";

// ---- 解析参数 ----
function parseArgs() {
    const args = process.argv.slice(2);
    const config = {
        port: null,
        count: 20,
        output: null,
        timeout: 60000, // 整体超时 60s
        scrollDelay: 2000, // 每次滚动后等待 2s
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case "--port":
            case "-p":
                config.port = parseInt(args[++i], 10);
                break;
            case "--count":
            case "-c":
                config.count = parseInt(args[++i], 10);
                break;
            case "--output":
            case "-o":
                config.output = args[++i];
                break;
            case "--help":
            case "-h":
                console.log(`
用法: node twitter-summary.mjs [选项]

选项:
  --port, -p <port>    Chrome 调试端口 (默认: 读取 /tmp/chrome-debug-port 或 9222)
  --count, -c <n>      收集推文数量 (默认: 20)
  --output, -o <file>  输出到 JSON 文件
  --help, -h           显示帮助
`);
                process.exit(0);
        }
    }

    // 如果未指定端口，尝试从文件读取
    if (!config.port) {
        try {
            config.port = parseInt(
                readFileSync("/tmp/chrome-debug-port", "utf-8").trim(),
                10
            );
        } catch {
            config.port = 9222;
        }
    }

    return config;
}

// ---- 连接 Chrome ----
async function connectChrome(port) {
    const debugUrl = `http://localhost:${port}`;
    console.log(`🔗 连接 Chrome 调试端口: ${debugUrl}`);

    try {
        const browser = await puppeteer.connect({
            browserURL: debugUrl,
            defaultViewport: null, // 使用当前窗口大小
        });
        console.log("✅ 已连接到 Chrome");
        return browser;
    } catch (error) {
        console.error(`❌ 无法连接到 Chrome 调试端口 ${port}`);
        console.error(`   请先运行: ./launch-chrome.sh`);
        console.error(`   错误: ${error.message}`);
        process.exit(1);
    }
}

// ---- 提取推文数据 ----
async function extractTweets(page) {
    return await page.evaluate(() => {
        const tweets = [];
        // Twitter/X 的推文容器通常使用 article 标签
        const articles = document.querySelectorAll('article[data-testid="tweet"]');

        articles.forEach((article) => {
            try {
                // 作者名和用户名
                const userNameEl = article.querySelector(
                    '[data-testid="User-Name"]'
                );
                let displayName = "";
                let username = "";
                if (userNameEl) {
                    const spans = userNameEl.querySelectorAll("span");
                    for (const span of spans) {
                        const text = span.textContent.trim();
                        if (text.startsWith("@")) {
                            username = text;
                        } else if (
                            text &&
                            !text.includes("·") &&
                            !text.match(/^\d+[smhd]?$/) &&
                            !displayName
                        ) {
                            displayName = text;
                        }
                    }
                }

                // 推文正文
                const tweetTextEl = article.querySelector(
                    '[data-testid="tweetText"]'
                );
                const tweetText = tweetTextEl
                    ? tweetTextEl.textContent.trim()
                    : "";

                // 时间
                const timeEl = article.querySelector("time");
                const time = timeEl ? timeEl.getAttribute("datetime") : "";

                // 互动数据
                const replyEl = article.querySelector('[data-testid="reply"]');
                const retweetEl = article.querySelector('[data-testid="retweet"]');
                const likeEl = article.querySelector('[data-testid="like"]');
                const viewsEl = article.querySelector(
                    'a[href*="/analytics"]'
                );

                const getMetricText = (el) => {
                    if (!el) return "0";
                    const ariaLabel = el.getAttribute("aria-label");
                    if (ariaLabel) {
                        const match = ariaLabel.match(/(\d[\d,.]*[KMBkmb]?)/);
                        return match ? match[1] : "0";
                    }
                    return el.textContent.trim() || "0";
                };

                // 是否包含媒体
                const hasImage =
                    article.querySelector('[data-testid="tweetPhoto"]') !== null;
                const hasVideo =
                    article.querySelector('[data-testid="videoPlayer"]') !== null;
                const hasCard =
                    article.querySelector('[data-testid="card.wrapper"]') !== null;

                // 是否是转推
                const isRetweet =
                    article.querySelector('[data-testid="socialContext"]') !== null;
                const retweetInfo = isRetweet
                    ? article
                        .querySelector('[data-testid="socialContext"]')
                        ?.textContent.trim()
                    : null;

                if (tweetText || hasImage || hasVideo) {
                    tweets.push({
                        displayName,
                        username,
                        text: tweetText,
                        time,
                        metrics: {
                            replies: getMetricText(replyEl),
                            retweets: getMetricText(retweetEl),
                            likes: getMetricText(likeEl),
                        },
                        media: {
                            hasImage,
                            hasVideo,
                            hasCard,
                        },
                        isRetweet,
                        retweetInfo,
                    });
                }
            } catch {
                // 跳过解析失败的推文
            }
        });

        return tweets;
    });
}

// ---- 去重 ----
function deduplicateTweets(tweets) {
    const seen = new Set();
    return tweets.filter((tweet) => {
        // 用 username + text 前50字符作为去重 key
        const key = `${tweet.username}:${tweet.text.slice(0, 50)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ---- 生成摘要 ----
function generateSummary(tweets) {
    const lines = [];
    lines.push("=".repeat(60));
    lines.push(`📊 Twitter 推荐页摘要 — 共 ${tweets.length} 条推文`);
    lines.push("=".repeat(60));
    lines.push("");

    // 统计
    const retweetCount = tweets.filter((t) => t.isRetweet).length;
    const mediaCount = tweets.filter(
        (t) => t.media.hasImage || t.media.hasVideo
    ).length;
    const uniqueAuthors = new Set(tweets.map((t) => t.username)).size;

    lines.push(`👥 涉及 ${uniqueAuthors} 位不同的作者`);
    lines.push(`🔄 其中 ${retweetCount} 条为转推`);
    lines.push(`🖼️ 其中 ${mediaCount} 条包含图片/视频`);
    lines.push("");
    lines.push("-".repeat(60));
    lines.push("");

    // 逐条列出
    tweets.forEach((tweet, i) => {
        const prefix = tweet.isRetweet ? `🔄 ${tweet.retweetInfo}` : "";
        lines.push(
            `[${i + 1}] ${tweet.displayName} ${tweet.username}${prefix ? " | " + prefix : ""}`
        );
        if (tweet.text) {
            // 截断过长的推文
            const text =
                tweet.text.length > 200
                    ? tweet.text.slice(0, 200) + "..."
                    : tweet.text;
            lines.push(`    ${text}`);
        }
        const mediaFlags = [];
        if (tweet.media.hasImage) mediaFlags.push("📷图片");
        if (tweet.media.hasVideo) mediaFlags.push("🎬视频");
        if (tweet.media.hasCard) mediaFlags.push("🔗卡片");
        const mediaStr = mediaFlags.length > 0 ? `  |  ${mediaFlags.join(" ")}` : "";
        lines.push(
            `    💬${tweet.metrics.replies}  🔄${tweet.metrics.retweets}  ❤️${tweet.metrics.likes}${mediaStr}`
        );
        lines.push("");
    });

    lines.push("=".repeat(60));
    return lines.join("\n");
}

// ---- 主流程 ----
async function main() {
    const config = parseArgs();
    console.log("");
    console.log("🐦 Twitter 推荐页自动浏览器");
    console.log(`   目标: 收集 ${config.count} 条推文`);
    console.log("");

    // 1. 连接 Chrome
    const browser = await connectChrome(config.port);

    // 2. 打开新标签页
    const page = await browser.newPage();
    console.log("📄 已打开新标签页");

    try {
        // 3. 导航到 Twitter 首页（推荐页）
        console.log("🌐 正在导航到 Twitter 推荐页...");
        await page.goto("https://x.com/home", {
            waitUntil: "networkidle2",
            timeout: 30000,
        });

        // 等待推文容器加载
        console.log("⏳ 等待推文加载...");
        try {
            await page.waitForSelector('article[data-testid="tweet"]', {
                timeout: 15000,
            });
        } catch {
            // 可能需要登录
            const currentUrl = page.url();
            if (
                currentUrl.includes("login") ||
                currentUrl.includes("flow")
            ) {
                console.error("❌ Twitter 需要登录！");
                console.error(
                    "   请先在 Chrome 中手动登录 Twitter，然后重新运行此脚本"
                );
                await page.close();
                browser.disconnect();
                process.exit(1);
            }
            console.error("❌ 推文加载超时，页面可能结构有变化");
            await page.close();
            browser.disconnect();
            process.exit(1);
        }
        console.log("✅ 推文已开始加载");

        // 4. 滚动并收集推文
        let allTweets = [];
        let scrollCount = 0;
        const maxScrolls = config.count * 3; // 防止无限滚动

        while (allTweets.length < config.count && scrollCount < maxScrolls) {
            // 提取当前可见推文
            const currentTweets = await extractTweets(page);
            allTweets = deduplicateTweets([...allTweets, ...currentTweets]);

            process.stdout.write(
                `\r📥 已收集 ${allTweets.length}/${config.count} 条推文 (滚动 ${scrollCount + 1} 次)`
            );

            if (allTweets.length >= config.count) break;

            // 向下滚动
            await page.evaluate(() => {
                window.scrollBy(0, window.innerHeight * 0.8);
            });

            // 等待新内容加载
            await new Promise((r) => setTimeout(r, config.scrollDelay));
            scrollCount++;
        }

        console.log(""); // 换行
        allTweets = allTweets.slice(0, config.count);
        console.log(`\n✅ 收集完成! 共 ${allTweets.length} 条推文\n`);

        // 5. 输出结果
        const summary = generateSummary(allTweets);
        console.log(summary);

        // 输出 JSON
        if (config.output) {
            const result = {
                collectedAt: new Date().toISOString(),
                totalCount: allTweets.length,
                tweets: allTweets,
            };
            writeFileSync(config.output, JSON.stringify(result, null, 2), "utf-8");
            console.log(`\n📁 JSON 结果已保存到: ${config.output}`);
        }

        // 6. 关闭标签页（不关闭浏览器）
        await page.close();
        console.log("\n📄 标签页已关闭（Chrome 保持运行）");
    } catch (error) {
        console.error(`\n❌ 执行出错: ${error.message}`);
        try {
            await page.close();
        } catch { }
    } finally {
        browser.disconnect();
        console.log("🔌 已断开 Chrome 连接");
    }
}

main().catch(console.error);
