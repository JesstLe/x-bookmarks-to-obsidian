import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { identityFromFilename } from './bookmark-model.mjs';
import { repairGeneratedNoteFields } from './note-renderer.mjs';

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  const output = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...walkFiles(target));
    else if (entry.isFile()) output.push(target);
  }
  return output;
}

function embeddedPaths(markdown) {
  return [...String(markdown).matchAll(/!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)]
    .map((match) => match[1].replace(/\\/g, '/'));
}

function remoteMediaUrls(markdown) {
  return [...String(markdown).matchAll(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/g)]
    .map((match) => match[1]);
}

function reconnectLocalVideoEmbeds(markdown, note, videoFiles) {
  if (/!\[\[videos\//.test(String(markdown))) {
    return { content: String(markdown), recovered: [] };
  }
  const recovered = [];
  const handlePrefix = `${note.identity.handle.toLowerCase()}_`;
  const pattern = /!\[视频缩略图\]\((https?:\/\/[^)\n]+\/(?:amplify_video_thumb|ext_tw_video_thumb)\/(\d+)\/[^)\n]+)\)/g;
  const content = String(markdown).replace(pattern, (thumbnail, _url, videoId) => {
    const candidates = videoFiles
      .filter((media) => media.filename.includes(videoId))
      .sort((left, right) => {
        const leftPreferred = left.filename.toLowerCase().startsWith(handlePrefix) ? 0 : 1;
        const rightPreferred = right.filename.toLowerCase().startsWith(handlePrefix) ? 0 : 1;
        return leftPreferred - rightPreferred || left.filename.length - right.filename.length;
      });
    const directDownloads = videoFiles
      .filter((media) => media.filename.startsWith(`${note.identity.id}-`))
      .sort((left, right) => left.filename.localeCompare(right.filename));
    const legacyFilename = `${note.identity.handle}_pu.mp4`.toLowerCase();
    const legacy = videoFiles.find((media) => media.filename.toLowerCase() === legacyFilename);
    const selected = [...new Map(
      [...candidates.slice(0, 1), ...directDownloads, ...(legacy ? [legacy] : [])]
        .map((media) => [media.relativePath, media]),
    ).values()].filter((media) => !String(markdown).includes(`![[${media.relativePath}]]`));
    if (selected.length === 0) return thumbnail;
    for (const media of selected) {
      recovered.push({ note: note.filename, videoId, embed: media.relativePath });
    }
    return `${thumbnail}\n\n${selected.map((media) => `![[${media.relativePath}]]`).join('\n\n')}`;
  });
  return { content, recovered };
}

function quoteSectionHasNoOriginalStatus(markdown, identity) {
  const content = String(markdown);
  const heading = /^## 💬 引用\s*$/m.exec(content);
  if (!heading) return false;
  const remainder = content.slice(heading.index + heading[0].length);
  const nextSection = /^(?:## |---\s*$)/m.exec(remainder);
  const section = nextSection ? remainder.slice(0, nextSection.index) : remainder;
  const statusIds = [...section.matchAll(/https?:\/\/(?:x|twitter)\.com\/[A-Za-z0-9_]+\/status\/(\d+)/g)]
    .map((match) => match[1]);
  return !statusIds.some((id) => id !== identity.id);
}

function mainPostTextIsEmpty(markdown) {
  const body = String(markdown).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  const title = /^#\s+.*$/m.exec(body);
  if (!title) return false;
  const remainder = body.slice(title.index + title[0].length);
  const boundary = /^(?:## |---\r?\n📅)/m.exec(remainder);
  const main = boundary ? remainder.slice(0, boundary.index) : remainder;
  const quotedText = main.split(/\r?\n/)
    .filter((line) => /^>/.test(line))
    .map((line) => line.replace(/^>\s?/, '').trim())
    .filter((line) => line && !/^\*.*(?:无文本内容|media or card).*\*$/i.test(line))
    .join('')
    .replace(/[^\p{L}\p{N}]+/gu, '');
  return quotedText.length === 0;
}

export function inventoryVault(vaultRoot) {
  const root = path.resolve(vaultRoot);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`Vault directory does not exist: ${root}`);
  }
  const notes = [];
  const invalidNotes = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const filepath = path.join(root, entry.name);
    const content = fs.readFileSync(filepath, 'utf8');
    try {
      notes.push({
        filename: entry.name,
        filepath,
        content,
        identity: identityFromFilename(entry.name),
        embeds: embeddedPaths(content),
        remoteMedia: remoteMediaUrls(content),
        videoSectionWithoutLocalEmbed: /^## 🎬 视频/m.test(content) && !/!\[\[videos\//.test(content),
      });
    } catch (error) {
      invalidNotes.push({ filename: entry.name, filepath, reason: error.message });
    }
  }

  const videoRoot = path.join(root, 'videos');
  const videoFiles = walkFiles(videoRoot)
    .filter((filepath) => filepath.toLowerCase().endsWith('.mp4'))
    .map((filepath) => ({
      filepath,
      filename: path.basename(filepath),
      relativePath: path.relative(root, filepath).replace(/\\/g, '/'),
      bytes: fs.statSync(filepath).size,
    }));

  return { root, notes, invalidNotes, videoFiles };
}

export function planRepairs(inventory) {
  const noteChanges = [];
  const referenced = new Set();
  const missingEmbeds = [];
  const remoteMedia = [];
  const videoNotesWithoutLocalEmbed = [];
  const recoveredVideoEmbeds = [];
  const quoteSectionsWithoutStatusLink = [];
  const contentRefreshCandidates = [];

  for (const note of inventory.notes) {
    const generatedFieldsRepaired = repairGeneratedNoteFields(note.content, note.identity);
    const videoRepair = reconnectLocalVideoEmbeds(
      generatedFieldsRepaired,
      note,
      inventory.videoFiles,
    );
    const repaired = videoRepair.content;
    recoveredVideoEmbeds.push(...videoRepair.recovered);
    if (repaired !== note.content) {
      noteChanges.push({
        filepath: note.filepath,
        filename: note.filename,
        before: note.content,
        after: repaired,
        identity: note.identity,
      });
    }
    for (const embed of embeddedPaths(repaired)) {
      referenced.add(embed);
      const target = path.join(inventory.root, ...embed.split('/'));
      if (!fs.existsSync(target)) {
        missingEmbeds.push({ note: note.filename, embed, filename: path.basename(embed), target });
      }
    }
    for (const url of remoteMediaUrls(repaired)) remoteMedia.push({ note: note.filename, url });
    if (/^## 🎬 视频/m.test(repaired) && !/!\[\[videos\//.test(repaired)) {
      videoNotesWithoutLocalEmbed.push(note.filename);
    }
    const quoteOriginalMissing = quoteSectionHasNoOriginalStatus(repaired, note.identity);
    if (quoteOriginalMissing) {
      quoteSectionsWithoutStatusLink.push(note.filename);
    }
    const reasons = [];
    if (mainPostTextIsEmpty(repaired)) reasons.push('empty_main');
    if (quoteOriginalMissing) reasons.push('quote_original_missing');
    if (reasons.length > 0) {
      contentRefreshCandidates.push({
        filename: note.filename,
        filepath: note.filepath,
        identity: note.identity,
        reasons,
      });
    }
  }

  const orphanMedia = inventory.videoFiles
    .filter((media) => !referenced.has(media.relativePath))
    .map((media) => ({ ...media }));

  const hashes = new Map();
  for (const media of inventory.videoFiles) {
    const hash = crypto.createHash('sha256').update(fs.readFileSync(media.filepath)).digest('hex');
    const group = hashes.get(hash) || [];
    group.push(media.relativePath);
    hashes.set(hash, group);
  }
  const duplicateGroups = [...hashes.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([sha256, files]) => ({ sha256, files }));

  return {
    vaultRoot: inventory.root,
    notesScanned: inventory.notes.length,
    invalidNotes: inventory.invalidNotes,
    noteChanges,
    missingEmbeds,
    remoteMedia,
    recoveredVideoEmbeds,
    videoNotesWithoutLocalEmbed,
    quoteSectionsWithoutStatusLink,
    contentRefreshCandidates,
    orphanMedia,
    duplicateGroups,
  };
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

function reportFor(plan, extra = {}) {
  return {
    applied: false,
    vaultRoot: plan.vaultRoot,
    notesScanned: plan.notesScanned,
    notesChanged: plan.noteChanges.length,
    invalidNotes: plan.invalidNotes,
    missingEmbeds: plan.missingEmbeds,
    remoteMediaCount: plan.remoteMedia.length,
    recoveredVideoEmbeds: plan.recoveredVideoEmbeds,
    videoNotesWithoutLocalEmbed: plan.videoNotesWithoutLocalEmbed,
    quoteSectionsWithoutStatusLink: plan.quoteSectionsWithoutStatusLink,
    contentRefreshCandidates: plan.contentRefreshCandidates.map(({ filepath, ...item }) => item),
    orphanMedia: plan.orphanMedia.map(({ filepath, ...item }) => item),
    duplicateGroups: plan.duplicateGroups,
    ...extra,
  };
}

export function applyRepairPlan(plan, {
  apply = false,
  backupDir = null,
  quarantine = false,
  timestamp = new Date().toISOString().replace(/[:.]/g, '-'),
} = {}) {
  if (!apply) return reportFor(plan);
  if (!backupDir) throw new Error('Apply requires a backup directory');
  const resolvedBackup = path.resolve(backupDir);
  const relativeBackup = path.relative(plan.vaultRoot, resolvedBackup);
  if (relativeBackup === '' || (!relativeBackup.startsWith('..') && !path.isAbsolute(relativeBackup))) {
    throw new Error('Backup directory must be outside the vault');
  }
  if (fs.existsSync(resolvedBackup)) throw new Error(`Backup directory already exists: ${resolvedBackup}`);

  fs.cpSync(plan.vaultRoot, resolvedBackup, { recursive: true, errorOnExist: true, force: false });
  for (const change of plan.noteChanges) atomicWrite(change.filepath, change.after);

  const quarantined = [];
  if (quarantine && plan.orphanMedia.length > 0) {
    const quarantineDir = path.join(plan.vaultRoot, '_quarantine', timestamp);
    fs.mkdirSync(quarantineDir, { recursive: true });
    for (const media of plan.orphanMedia) {
      const destination = path.join(quarantineDir, media.filename);
      fs.renameSync(media.filepath, destination);
      quarantined.push({ from: media.relativePath, to: path.relative(plan.vaultRoot, destination).replace(/\\/g, '/') });
    }
  }

  const report = reportFor(plan, {
    applied: true,
    backupDir: resolvedBackup,
    quarantined,
    timestamp,
  });
  const reportPath = path.join(plan.vaultRoot, '_sync', `repair-${timestamp}.json`);
  atomicWrite(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, reportPath };
}
