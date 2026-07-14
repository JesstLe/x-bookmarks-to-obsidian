#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyRepairPlan, inventoryVault, planRepairs } from './lib/repair-planner.mjs';

function value(argv, index, option) {
  const result = argv[index + 1];
  if (!result || result.startsWith('--')) throw new Error(`${option} requires a value`);
  return result;
}

export function parseRepairArgs(argv = process.argv.slice(2), env = process.env) {
  const config = {
    vault: path.join(env.HOME || '/Users/lv', 'Documents/Obsidian Vault/Inbox/X Bookmarks'),
    apply: false,
    backupDir: null,
    quarantine: false,
    report: null,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    switch (option) {
      case '--vault': config.vault = value(argv, index, option); index += 1; break;
      case '--dry-run': config.apply = false; break;
      case '--apply': config.apply = true; break;
      case '--backup-dir': config.backupDir = value(argv, index, option); index += 1; break;
      case '--quarantine': config.quarantine = true; break;
      case '--report': config.report = value(argv, index, option); index += 1; break;
      case '--help':
      case '-h': config.help = true; break;
      default: throw new Error(`Unknown option: ${option}`);
    }
  }
  if (config.apply && !config.backupDir) throw new Error('--apply requires --backup-dir');
  return config;
}

export function repairHelp() {
  return `X 书签资产修复器

用法: node repair-bookmarks.mjs [选项]

  --vault <path>       X Bookmarks 目录
  --dry-run            只生成计划，不修改 Vault（默认）
  --apply              应用修复；必须同时提供 --backup-dir
  --backup-dir <path>  完整备份目录，必须位于 Vault 外
  --quarantine         将孤儿视频移入 _quarantine，不删除
  --report <file>      额外保存 JSON 报告
`;
}

export function runRepair(config) {
  const plan = planRepairs(inventoryVault(config.vault));
  const report = applyRepairPlan(plan, {
    apply: config.apply,
    backupDir: config.backupDir,
    quarantine: config.quarantine,
  });
  if (config.report) {
    fs.mkdirSync(path.dirname(config.report), { recursive: true });
    fs.writeFileSync(config.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  return report;
}

async function main() {
  try {
    const config = parseRepairArgs();
    if (config.help) {
      console.log(repairHelp());
      return;
    }
    console.log(JSON.stringify(runRepair(config), null, 2));
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
