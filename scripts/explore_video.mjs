#!/usr/bin/env node
// 探索 Twitter 视频 URL 提取方法 - 监听网络请求

import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "fs";

async function main() {
    const port = parseInt(readFileSync("/tmp/chrome-debug-port", "utf-8").trim(), 10);
    console.log(`🔌 连接 Chrome 端口: ${port}`);

    const browser = await puppeteer.connect({
        browserURL: `http://localhost:${port}`,
        defaultViewport: null,
    });

    const pages = await browser.pages();
    const page = pages[0] || await browser.newPage();

    // 监听网络请求
    const videoUrls = [];
    await page.setRequestInterception(true);
    
    page.on('request', request => {
        const url = request.url();
        // 捕获视频相关请求
        if (url.includes('video') || url.includes('media') || url.includes('.mp4')) {
            console.log("📹 视频请求:", url.substring(0, 150));
            videoUrls.push(url);
        }
        request.continue();
    });

    // 刷新页面触发视频请求
    console.log("🔄 刷新页面触发视频请求...");
    await page.reload({ waitUntil: "networkidle2" });
    await new Promise(r => setTimeout(r, 3000));

    // 获取视频容器信息
    const videoInfo = await page.evaluate(() => {
        const results = [];
        
        const videos = document.querySelectorAll('article video');
        videos.forEach((video, idx) => {
            // 从 poster URL 提取视频 ID
            const poster = video.poster || '';
            const videoIdMatch = poster.match(/\/([a-zA-Z0-9_]+)\/img\//);
            const videoId = videoIdMatch ? videoIdMatch[1] : null;
            
            // 尝试各种可能的视频 URL 格式
            const possibleUrls = [];
            if (videoId) {
                possibleUrls.push(
                    `https://video.twimg.com/amplify/video/${videoId}.mp4`,
                    `https://video.twimg.com/ext_tw_video/${videoId}.mp4`,
                    `https://video.twimg.com/tweet_video/${videoId}.mp4`
                );
            }
            
            results.push({
                index: idx + 1,
                poster: video.poster,
                videoId: videoId,
                possibleUrls: possibleUrls,
                blobSrc: video.currentSrc
            });
        });
        
        return results;
    });

    console.log("\n📊 视频信息:");
    console.log(JSON.stringify(videoInfo, null, 2));
    
    console.log("\n📡 捕获的视频请求:");
    videoUrls.forEach(url => console.log(" -", url));

    // 尝试直接请求可能的视频 URL
    console.log("\n🧪 测试可能的视频 URL...");
    for (const info of videoInfo) {
        if (info.possibleUrls) {
            for (const testUrl of info.possibleUrls) {
                try {
                    const response = await fetch(testUrl, { method: 'HEAD' });
                    if (response.ok) {
                        console.log(`✅ 有效: ${testUrl}`);
                    }
                } catch (e) {
                    // 忽略错误
                }
            }
        }
    }

    await browser.disconnect();
}

main().catch(console.error);
