import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export function parseYtDlpJsonLines(stdout) {
  const lines = String(stdout ?? '').split(/\r?\n/).filter((line) => line.trim());
  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid yt-dlp JSON at line ${index + 1}: ${error.message}`);
    }
  });
}

export function buildYtDlpDownloadArgs({
  output,
  tweetUrl,
  cookieProfile = null,
  timeoutMs = 600000,
}) {
  if (!output || !tweetUrl) throw new Error('yt-dlp output and tweet URL are required');
  const timeoutSeconds = Math.max(1, Math.floor(Number(timeoutMs) / 1000));
  const args = [
    '--output', output,
    '--format', 'bestvideo+bestaudio/best',
    '--merge-output-format', 'mp4',
    '--yes-playlist',
    '--socket-timeout', String(timeoutSeconds),
  ];
  if (cookieProfile) {
    args.push('--cookies-from-browser', `chrome:${cookieProfile}`);
  }
  args.push(tweetUrl);
  return args;
}

export function buildYtDlpMetadataArgs({ tweetUrl, cookieProfile = null, timeoutMs = 20000 }) {
  const args = [
    '--dump-json',
    '--yes-playlist',
    '--socket-timeout', String(Math.max(1, Math.floor(Number(timeoutMs) / 1000))),
  ];
  if (cookieProfile) args.push('--cookies-from-browser', `chrome:${cookieProfile}`);
  args.push(tweetUrl);
  return args;
}

export function mediaFilename(tweetId, entry = {}, index = 0) {
  if (!/^\d{15,25}$/.test(String(tweetId))) throw new Error(`Invalid tweet ID: ${tweetId}`);
  const rawIdentity = entry.id || `video-${index + 1}`;
  const safeIdentity = String(rawIdentity).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return `${tweetId}-${safeIdentity || `video-${index + 1}`}.mp4`;
}

function defaultRunner(command, args) {
  return spawnSync(command, args, { encoding: 'utf8' });
}

export function verifyVideo(filepath, runner = defaultRunner) {
  const result = runner('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filepath,
  ]);
  if (result.status !== 0) {
    return { ok: false, reason: String(result.stderr || `ffprobe exited ${result.status}`).trim() };
  }
  const duration = Number(String(result.stdout).trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    return { ok: false, reason: 'ffprobe did not report a positive duration' };
  }
  return { ok: true, duration };
}

export async function downloadImage(url, destination, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Image download failed with HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) throw new Error('Image download returned an empty file');
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.part`;
  try {
    fs.writeFileSync(temporary, bytes);
    fs.renameSync(temporary, destination);
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }); } catch {}
    throw error;
  }
  return { path: destination, bytes: bytes.length, contentType: response.headers.get('content-type') };
}
