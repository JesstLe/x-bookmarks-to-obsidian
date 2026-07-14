#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer-core';

import { parseTweetIdentity } from './lib/bookmark-model.mjs';
import {
  buildYtDlpDownloadArgs as buildMediaDownloadArgs,
  downloadImage,
  verifyVideo,
} from './lib/media-manager.mjs';
import { renderBookmarkNote } from './lib/note-renderer.mjs';
import { SyncResult, writeRunReport as persistRunReport } from './lib/sync-result.mjs';
import {
  discoverBookmarkUrls as discoverUrls,
  extractTweetDetail as extractDetail,
} from './lib/twitter-browser.mjs';

const DEFAULT_VAULT_RELATIVE = 'Documents/Obsidian Vault/Inbox/X Bookmarks';

function positiveInteger(value, option) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${option} requires a positive integer`);
  }
  return parsed;
}

function optionValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return value;
}

function readDebugPort() {
  try {
    return positiveInteger(fs.readFileSync('/tmp/chrome-debug-port', 'utf8').trim(), '--port');
  } catch {
    return 9222;
  }
}

export function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const home = env.HOME || '/Users/lv';
  const config = {
    port: null,
    mode: 'count',
    count: 10,
    output: null,
    obsidian: false,
    obsidianPath: path.join(home, DEFAULT_VAULT_RELATIVE),
    videoDir: null,
    mediaDir: null,
    reportDir: null,
    downloadVideos: true,
    downloadImages: true,
    videoTimeout: 600000,
    videoSizeThreshold: 500 * 1024 * 1024,
    maxNoProgressRounds: 12,
    scrollDelay: 1500,
    dryRun: false,
    updateExisting: false,
    help: false,
    cookieProfile: env.X_BOOKMARKS_CHROME_PROFILE || path.join(home, '.chrome-debug-profile'),
  };
  let countSpecified = false;
  let allSpecified = false;
  let videoDirSpecified = false;
  let mediaDirSpecified = false;
  let reportDirSpecified = false;

  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    switch (option) {
      case '--port':
      case '-p':
        config.port = positiveInteger(optionValue(argv, index, option), option);
        index += 1;
        break;
      case '--count':
      case '-c':
        config.count = positiveInteger(optionValue(argv, index, option), option);
        countSpecified = true;
        index += 1;
        break;
      case '--all':
        config.mode = 'all';
        config.count = null;
        allSpecified = true;
        break;
      case '--output':
      case '-o':
        config.output = optionValue(argv, index, option);
        index += 1;
        break;
      case '--obsidian':
        config.obsidian = true;
        break;
      case '--obsidian-path':
        config.obsidianPath = optionValue(argv, index, option);
        index += 1;
        break;
      case '--video-dir':
        config.videoDir = optionValue(argv, index, option);
        videoDirSpecified = true;
        index += 1;
        break;
      case '--media-dir':
        config.mediaDir = optionValue(argv, index, option);
        mediaDirSpecified = true;
        index += 1;
        break;
      case '--report-dir':
        config.reportDir = optionValue(argv, index, option);
        reportDirSpecified = true;
        index += 1;
        break;
      case '--no-video-download':
        config.downloadVideos = false;
        break;
      case '--no-image-download':
        config.downloadImages = false;
        break;
      case '--video-timeout':
        config.videoTimeout = positiveInteger(optionValue(argv, index, option), option);
        index += 1;
        break;
      case '--video-size-threshold':
        config.videoSizeThreshold = positiveInteger(optionValue(argv, index, option), option);
        index += 1;
        break;
      case '--max-no-progress-rounds':
        config.maxNoProgressRounds = positiveInteger(optionValue(argv, index, option), option);
        index += 1;
        break;
      case '--scroll-delay':
        config.scrollDelay = positiveInteger(optionValue(argv, index, option), option);
        index += 1;
        break;
      case '--dry-run':
        config.dryRun = true;
        break;
      case '--update-existing':
        config.updateExisting = true;
        break;
      case '--help':
      case '-h':
        config.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${option}`);
    }
  }

  if (allSpecified && countSpecified) throw new Error('--all and --count are mutually exclusive');
  if (!config.port) config.port = readDebugPort();
  if (!videoDirSpecified) config.videoDir = path.join(config.obsidianPath, 'videos');
  if (!mediaDirSpecified) config.mediaDir = path.join(config.obsidianPath, 'media');
  if (!reportDirSpecified) config.reportDir = path.join(config.obsidianPath, '_sync');
  return config;
}

export function helpText() {
  return `X 书签到 Obsidian 可靠同步器

用法: node twitter-bookmarks.mjs [选项]

  --count, -c <n>              严格处理 n 个唯一书签（默认 10）
  --all                         同步到 X 明确显示列表结束
  --obsidian                    保存到 Obsidian
  --obsidian-path <path>        书签目录
  --dry-run                     完整提取和校验，但不写文件或下载媒体
  --update-existing             刷新已有笔记
  --no-image-download           仅保留图片来源链接
  --no-video-download           仅保留视频原帖链接
  --max-no-progress-rounds <n>  无进展重试轮数（默认 12）
  --port, -p <n>                Chrome 调试端口
  --output, -o <file>           保存 JSON 结果
  --help, -h                    显示帮助
`;
}

export function buildYtDlpDownloadArgs(filepath, twitterUrl, timeout = 600000) {
  return buildMediaDownloadArgs({
    output: filepath,
    tweetUrl: twitterUrl,
    cookieProfile: process.env.X_BOOKMARKS_CHROME_PROFILE
      || path.join(process.env.HOME || '/Users/lv', '.chrome-debug-profile'),
    timeoutMs: timeout,
  });
}

async function openBrowserPages(config) {
  const browser = await puppeteer.connect({
    browserURL: `http://localhost:${config.port}`,
    defaultViewport: null,
  });
  try {
    const listPage = await browser.newPage();
    const detailPage = await browser.newPage();
    await listPage.goto('https://x.com/i/bookmarks', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    return { browser, listPage, detailPage };
  } catch (error) {
    await browser.disconnect();
    throw error;
  }
}

function runCommand(command, args, { timeoutMs = 600000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      reject(new Error(`${command} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout?.on('data', (data) => { stdout += data; });
    child.stderr?.on('data', (data) => { stderr += data; });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    });
  });
}

function imageExtension(sourceUrl) {
  try {
    const parsed = new URL(sourceUrl);
    const format = parsed.searchParams.get('format');
    if (/^(?:jpe?g|png|webp|gif)$/i.test(format || '')) return format.toLowerCase().replace('jpeg', 'jpg');
    const extension = path.extname(parsed.pathname).slice(1).toLowerCase();
    if (/^(?:jpe?g|png|webp|gif)$/.test(extension)) return extension.replace('jpeg', 'jpg');
  } catch {}
  return 'jpg';
}

async function processBookmarkMedia(bookmark, config) {
  const failures = [];
  const processed = {
    ...bookmark,
    images: (bookmark.images || []).map((image) => typeof image === 'string' ? { sourceUrl: image } : { ...image }),
    videos: (bookmark.videos || []).map((video) => ({ ...video })),
  };

  if (config.downloadImages) {
    for (let index = 0; index < processed.images.length; index += 1) {
      const image = processed.images[index];
      if (!image.sourceUrl) continue;
      const relativePath = path.join('media', processed.identity.id, `image-${index + 1}.${imageExtension(image.sourceUrl)}`);
      const destination = path.join(config.obsidianPath, relativePath);
      try {
        if (!fs.existsSync(destination)) await downloadImage(image.sourceUrl, destination);
        image.localPath = relativePath;
      } catch (error) {
        image.failure = error.message;
        failures.push({ stage: 'image', message: error.message, tweetUrl: processed.identity.url });
      }
    }
  }

  if (config.downloadVideos && processed.videos.length > 0) {
    fs.mkdirSync(config.videoDir, { recursive: true });
    const prefix = `${processed.identity.id}-`;
    const existing = fs.readdirSync(config.videoDir)
      .filter((filename) => filename.startsWith(prefix) && filename.endsWith('.mp4'));
    let candidates = existing;
    if (candidates.length === 0) {
      const outputTemplate = path.join(config.videoDir, `${processed.identity.id}-%(id)s.%(ext)s`);
      try {
        const execution = await runCommand('yt-dlp', buildMediaDownloadArgs({
          output: outputTemplate,
          tweetUrl: processed.identity.url,
          cookieProfile: config.cookieProfile,
          timeoutMs: config.videoTimeout,
        }), { timeoutMs: config.videoTimeout });
        if (execution.status !== 0) throw new Error(execution.stderr.trim() || `yt-dlp exited ${execution.status}`);
        candidates = fs.readdirSync(config.videoDir)
          .filter((filename) => filename.startsWith(prefix) && filename.endsWith('.mp4'));
      } catch (error) {
        failures.push({ stage: 'video', message: error.message, tweetUrl: processed.identity.url });
      }
    }

    const verified = [];
    for (const filename of candidates) {
      const result = verifyVideo(path.join(config.videoDir, filename));
      if (result.ok) {
        verified.push({
          sourceUrl: processed.identity.url,
          localPath: path.posix.join('videos', filename),
          duration: result.duration,
        });
      } else {
        failures.push({ stage: 'video_verify', message: result.reason, tweetUrl: processed.identity.url });
      }
    }
    if (verified.length > 0) {
      processed.videos = verified.map((video, index) => ({
        ...processed.videos[index],
        ...video,
      }));
    } else {
      processed.videos = processed.videos.map((video) => ({
        ...video,
        sourceUrl: processed.identity.url,
        failure: failures.find((failure) => failure.stage.startsWith('video'))?.message || 'video unavailable',
      }));
    }
  }
  return { bookmark: processed, failures };
}

function existingNotePath(identity, config) {
  if (!fs.existsSync(config.obsidianPath)) return null;
  const suffix = ` - ${identity.id}.md`;
  const filename = fs.readdirSync(config.obsidianPath).find((entry) => entry.endsWith(suffix));
  return filename ? path.join(config.obsidianPath, filename) : null;
}

function notePath(bookmark, config) {
  const date = new Date(bookmark.timestamp);
  if (Number.isNaN(date.getTime())) throw new Error('Tweet detail has an invalid timestamp');
  const safeHandle = bookmark.identity.handle.replace(/[^A-Za-z0-9_]/g, '_');
  return path.join(
    config.obsidianPath,
    `${date.toISOString().slice(0, 10)} - @${safeHandle} - ${bookmark.identity.id}.md`,
  );
}

function atomicWrite(filepath, content) {
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  const temporary = `${filepath}.tmp`;
  try {
    fs.writeFileSync(temporary, content, 'utf8');
    fs.renameSync(temporary, filepath);
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }); } catch {}
    throw error;
  }
}

const DEFAULT_DEPENDENCIES = {
  openBrowserPages,
  discoverBookmarkUrls: discoverUrls,
  extractTweetDetail: extractDetail,
  processMedia: processBookmarkMedia,
  renderBookmarkNote,
  noteExists: existingNotePath,
  writeNote(bookmark, content, config) { atomicWrite(notePath(bookmark, config), content); },
  writeOutput(output, value) { atomicWrite(output, `${JSON.stringify(value, null, 2)}\n`); },
  writeRunReport: persistRunReport,
  log: console.log,
};

function persistResult(config, deps, result) {
  if (config.dryRun) return;
  if (config.output) deps.writeOutput(config.output, result.toJSON());
  if (config.obsidian) deps.writeRunReport(result, config.reportDir);
}

export async function runSync(config, dependencies = {}) {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const result = new SyncResult({
    requested: config.mode === 'count' ? config.count : null,
    mode: config.mode,
    options: {
      count: config.count,
      mode: config.mode,
      dryRun: config.dryRun,
      downloadImages: config.downloadImages,
      downloadVideos: config.downloadVideos,
      updateExisting: config.updateExisting,
    },
  });
  let resources = null;

  try {
    resources = await deps.openBrowserPages(config);
    await resources.listPage?.bringToFront?.();
    const discovery = await deps.discoverBookmarkUrls(resources.listPage, {
      count: config.count,
      mode: config.mode,
      maxNoProgressRounds: config.maxNoProgressRounds,
      scrollDelayMs: config.scrollDelay,
    });
    result.discovered = discovery.urls.length;

    if (['auth_required', 'rate_limited', 'failed'].includes(discovery.reason)) {
      result.finish({ reason: discovery.reason });
      persistResult(config, deps, result);
      return result;
    }

    await resources.detailPage?.bringToFront?.();

    for (const url of discovery.urls) {
      const identity = parseTweetIdentity(url);
      const existing = !config.dryRun && config.obsidian && !config.updateExisting
        ? deps.noteExists(identity, config)
        : null;
      if (existing) {
        result.skipped += 1;
        continue;
      }
      try {
        let bookmark = await deps.extractTweetDetail(resources.detailPage, identity);
        result.extracted += 1;
        if (!config.dryRun && config.obsidian) {
          const media = await deps.processMedia(bookmark, config);
          bookmark = media.bookmark;
          for (const failure of media.failures) result.addFailure(failure);
          const content = deps.renderBookmarkNote(bookmark);
          deps.writeNote(bookmark, content, config);
          result.saved += 1;
        }
      } catch (error) {
        result.addFailure({ tweetUrl: identity.url, stage: 'detail_or_save', message: error.message });
      }
    }

    result.finish({ reason: discovery.reason });
    persistResult(config, deps, result);
    return result;
  } catch (error) {
    result.addFailure({ stage: 'sync', message: error.message });
    result.finish({ reason: 'fatal_error' });
    try { persistResult(config, deps, result); } catch {}
    return result;
  } finally {
    if (resources) {
      try { await resources.detailPage?.close(); } catch {}
      try { await resources.listPage?.close(); } catch {}
      try { await resources.browser?.disconnect(); } catch {}
    }
  }
}

async function main() {
  try {
    const config = parseArgs();
    if (config.help) {
      console.log(helpText());
      return;
    }
    const result = await runSync(config);
    console.log(JSON.stringify(result.toJSON(), null, 2));
    process.exitCode = result.exitCode;
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
