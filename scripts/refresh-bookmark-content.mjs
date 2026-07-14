#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import puppeteer from 'puppeteer-core';

import { mergeRefreshedNoteContent } from './lib/note-renderer.mjs';
import { inventoryVault, planRepairs } from './lib/repair-planner.mjs';
import { extractTweetDetail } from './lib/twitter-browser.mjs';

function optionValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return value;
}

function positiveInteger(value, option) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${option} requires a positive integer`);
  return parsed;
}

function debugPort() {
  try {
    return positiveInteger(fs.readFileSync('/tmp/chrome-debug-port', 'utf8').trim(), '--port');
  } catch {
    return 9222;
  }
}

export function parseRefreshArgs(argv = process.argv.slice(2), env = process.env) {
  const config = {
    vault: path.join(env.HOME || '/Users/lv', 'Documents/Obsidian Vault/Inbox/X Bookmarks'),
    apply: false,
    backupDir: null,
    report: null,
    port: null,
    limit: null,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    switch (option) {
      case '--vault': config.vault = optionValue(argv, index, option); index += 1; break;
      case '--dry-run': config.apply = false; break;
      case '--apply': config.apply = true; break;
      case '--backup-dir': config.backupDir = optionValue(argv, index, option); index += 1; break;
      case '--report': config.report = optionValue(argv, index, option); index += 1; break;
      case '--port': config.port = positiveInteger(optionValue(argv, index, option), option); index += 1; break;
      case '--limit': config.limit = positiveInteger(optionValue(argv, index, option), option); index += 1; break;
      case '--help':
      case '-h': config.help = true; break;
      default: throw new Error(`Unknown option: ${option}`);
    }
  }
  if (!config.port) config.port = debugPort();
  if (config.apply && !config.backupDir) throw new Error('--apply requires --backup-dir');
  return config;
}

export function refreshHelp() {
  return `X 书签历史正文刷新器

用法: node refresh-bookmark-content.mjs [选项]

  --vault <path>       X Bookmarks 目录
  --dry-run            仅列出正文为空或引用原帖缺失的候选（默认）
  --apply              在线刷新候选；必须同时提供 --backup-dir
  --backup-dir <path>  只备份候选 Markdown，必须位于 Vault 外
  --limit <n>          最多处理 n 条，适合烟雾测试
  --port <n>           Chrome 调试端口
  --report <file>      保存 JSON 报告
`;
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

function createCandidateBackup(vault, backupDir, candidates) {
  const resolved = path.resolve(backupDir);
  const relative = path.relative(path.resolve(vault), resolved);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
    throw new Error('Backup directory must be outside the vault');
  }
  if (fs.existsSync(resolved)) throw new Error(`Backup directory already exists: ${resolved}`);
  fs.mkdirSync(resolved, { recursive: true });
  for (const candidate of candidates) {
    fs.copyFileSync(candidate.filepath, path.join(resolved, candidate.filename));
  }
  atomicWrite(path.join(resolved, 'manifest.json'), `${JSON.stringify({
    vault: path.resolve(vault),
    createdAt: new Date().toISOString(),
    candidates: candidates.map(({ filename, identity, reasons }) => ({ filename, identity, reasons })),
  }, null, 2)}\n`);
  return resolved;
}

async function openDetailBrowser(port) {
  const browser = await puppeteer.connect({
    browserURL: `http://localhost:${port}`,
    defaultViewport: null,
  });
  const page = await browser.newPage();
  await page.bringToFront();
  return { browser, page };
}

async function extractWithRetry(resources, identity) {
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await extractTweetDetail(resources.page, identity);
    } catch (error) {
      lastError = error;
      if (attempt === 2) break;
      try { await resources.page.close(); } catch {}
      resources.page = await resources.browser.newPage();
      await resources.page.bringToFront();
    }
  }
  throw lastError;
}

export async function runContentRefresh(config) {
  const plan = planRepairs(inventoryVault(config.vault));
  const allCandidates = plan.contentRefreshCandidates;
  const candidates = config.limit ? allCandidates.slice(0, config.limit) : allCandidates;
  const report = {
    applied: config.apply,
    vault: path.resolve(config.vault),
    candidatesFound: allCandidates.length,
    candidatesSelected: candidates.length,
    refreshed: 0,
    unchanged: 0,
    failed: 0,
    failures: [],
  };
  if (!config.apply) return report;

  report.backupDir = createCandidateBackup(config.vault, config.backupDir, candidates);
  let resources = null;
  try {
    resources = await openDetailBrowser(config.port);
    for (const candidate of candidates) {
      try {
        const before = fs.readFileSync(candidate.filepath, 'utf8');
        const bookmark = await extractWithRetry(resources, candidate.identity);
        const after = mergeRefreshedNoteContent(before, bookmark);
        if (after === before) report.unchanged += 1;
        else {
          atomicWrite(candidate.filepath, after);
          report.refreshed += 1;
        }
      } catch (error) {
        report.failed += 1;
        report.failures.push({
          filename: candidate.filename,
          tweetUrl: candidate.identity.url,
          reasons: candidate.reasons,
          message: error.message,
        });
      }
    }
  } finally {
    try { await resources?.page?.close(); } catch {}
    try { await resources?.browser?.disconnect(); } catch {}
  }

  report.finishedAt = new Date().toISOString();
  const reportPath = config.report || path.join(config.vault, '_sync', `content-refresh-${report.finishedAt.replace(/[:.]/g, '-')}.json`);
  atomicWrite(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, reportPath };
}

async function main() {
  try {
    const config = parseRefreshArgs();
    if (config.help) {
      console.log(refreshHelp());
      return;
    }
    console.log(JSON.stringify(await runContentRefresh(config), null, 2));
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
