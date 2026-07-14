import fs from 'node:fs';
import path from 'node:path';

const EXIT_CODES = Object.freeze({
  complete: 0,
  failed: 1,
  incomplete: 2,
  auth_required: 3,
  rate_limited: 4,
});

export function exitCodeForState(state) {
  if (!(state in EXIT_CODES)) throw new Error(`Unknown sync state: ${state}`);
  return EXIT_CODES[state];
}

export class SyncResult {
  constructor({ requested = null, mode = 'count', options = {}, startedAt = new Date().toISOString() } = {}) {
    if (!['count', 'all'].includes(mode)) throw new Error(`Invalid sync mode: ${mode}`);
    if (mode === 'count' && (!Number.isInteger(requested) || requested <= 0)) {
      throw new Error('Count mode requires a positive requested count');
    }
    this.requested = requested;
    this.mode = mode;
    this.options = options;
    this.startedAt = startedAt;
    this.finishedAt = null;
    this.discovered = 0;
    this.extracted = 0;
    this.saved = 0;
    this.skipped = 0;
    this.failed = 0;
    this.reason = null;
    this.state = null;
    this.failures = [];
  }

  addFailure({ tweetUrl = null, stage, message, code = null }) {
    if (!stage || !message) throw new Error('Failure records require stage and message');
    this.failures.push({ tweetUrl, stage, message, code });
    this.failed = this.failures.length;
  }

  finish({ reason, finishedAt = new Date().toISOString() }) {
    this.reason = reason;
    this.finishedAt = finishedAt;

    if (reason === 'auth_required') this.state = 'auth_required';
    else if (reason === 'rate_limited') this.state = 'rate_limited';
    else if (reason === 'failed' || reason === 'fatal_error') this.state = 'failed';
    else if (this.mode === 'all') {
      this.state = reason === 'end_of_list'
        && this.extracted + this.skipped === this.discovered
        && this.failed === 0
        ? 'complete'
        : 'incomplete';
    } else {
      this.state = this.discovered >= this.requested
        && this.extracted + this.skipped >= this.requested
        && this.failed === 0
        ? 'complete'
        : 'incomplete';
    }
    return this;
  }

  get exitCode() {
    if (!this.state) throw new Error('Sync result has not been finished');
    return exitCodeForState(this.state);
  }

  toJSON() {
    return {
      state: this.state,
      exitCode: this.state ? this.exitCode : null,
      reason: this.reason,
      mode: this.mode,
      requested: this.requested,
      discovered: this.discovered,
      extracted: this.extracted,
      saved: this.saved,
      skipped: this.skipped,
      failed: this.failed,
      failures: this.failures,
      options: this.options,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
    };
  }
}

export function writeRunReport(result, reportDir) {
  if (!(result instanceof SyncResult) || !result.state) {
    throw new Error('A finished SyncResult is required');
  }
  fs.mkdirSync(reportDir, { recursive: true });
  const lastRun = path.join(reportDir, 'last-run.json');
  const temp = `${lastRun}.tmp`;
  const failures = path.join(reportDir, 'failures.jsonl');
  const serialized = `${JSON.stringify(result.toJSON(), null, 2)}\n`;
  fs.writeFileSync(temp, serialized, 'utf8');
  fs.renameSync(temp, lastRun);
  if (result.failures.length) {
    const lines = result.failures
      .map((failure) => JSON.stringify({ ...failure, startedAt: result.startedAt, finishedAt: result.finishedAt }))
      .join('\n');
    fs.appendFileSync(failures, `${lines}\n`, 'utf8');
  }
  return { lastRun, failures };
}
