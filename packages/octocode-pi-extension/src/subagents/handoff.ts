import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { atomicWriteFileSync } from '../shared/atomic.js';
import { claimSuffix, releaseDeadClaims } from '../shared/claims.js';
import { privateDir, readPaths, sessionDir, workspacePaths, workspaceScratchDir } from '../shared/home.js';
import { sweepStaleOutputs } from '../shared/sweep.js';
import { DAY_MS } from '../shared/util.js';
import { processStartTime, sameProcess } from '../shared/process.js';
import type { ResultDetails } from './render.js';
import { teamWorkspace } from '../team/store.js';

/**
 * Handoff between a subagent and the session that started it: the scratch folder it leaves files in, and the delivery
 * of its background report to the parent.
 */

/** Custom message type of a background subagent's report. */
export const RESULT_TYPE = 'octocode-agent-result';

/** Subagent scratch folders untouched this long are removed when a session starts. */
const SCRATCH_MAX_AGE_MS = 7 * DAY_MS;

/** `<workspace>/.octocode/tmp/agents`: one folder per subagent for the files it hands back. */
export const scratchRoot = (cwd: string) => path.join(workspacePaths(cwd).tmp, 'agents');

/** File in a scratch folder naming the Pi process that started the subagent: its pid, then its start time (so a reused pid is not mistaken for it). */
const OWNER_FILE = '.owner';

/**
 * The subagent's handoff folder, or undefined when the workspace is not writable (it then reports inline only). It
 * names this process as its owner, so another session's sweep leaves it alone while this process runs.
 */
export function agentScratch(cwd: string, id: string): string | undefined {
  try {
    const dir = workspaceScratchDir(teamWorkspace(cwd), path.join('agents', id));
    fs.writeFileSync(path.join(dir, OWNER_FILE), [process.pid, processStartTime(process.pid)].filter(Boolean).join(' '));
    return dir;
  } catch {
    return undefined;
  }
}

/** Whether the process that owns a scratch folder still runs. An owner file with only a pid (start time unknown) is judged by the pid. */
function ownerRunning(dir: string): boolean {
  try {
    const [pid, ...started] = fs.readFileSync(path.join(dir, OWNER_FILE), 'utf8').trim().split(' ');
    return sameProcess(Number(pid), started.join(' '));
  } catch {
    return false;
  }
}

/** Removes scratch folders untouched for a week, except those whose owning Pi process (this or another session) is alive. */
export async function sweepScratch(root: string): Promise<void> {
  let names: string[];
  try {
    names = await fs.promises.readdir(root);
  } catch {
    return;
  }
  const owned = new Set(names.filter((name) => ownerRunning(path.join(root, name))));
  await sweepStaleOutputs(root, SCRATCH_MAX_AGE_MS, owned);
}

/** Background reports finishing within this window reach the parent together, as one wake. */
const REPORT_BATCH_MS = 1_500;

export interface Report {
  content: string;
  details: ResultDetails;
  /** Start a parent turn for it (not for a stop someone asked for, nor a report the parent already read). */
  wake: boolean;
  /** Names this one report wherever it is saved, claimed or queued, so a copy is never delivered twice; stamped when it is first queued or saved. */
  reportId?: string;
}

/**
 * `<session folder>/reports/pending`: background reports that finished after the session that started them ended (a
 * reload, /resume of another session), kept owner-only for the next start of the same Pi session.
 */
export const pendingReportsDir = (sessionId: string, env: NodeJS.ProcessEnv = process.env): string => path.join(sessionDir(sessionId, env), 'reports', 'pending');

/**
 * A pending report being delivered is renamed `<report>.json.claim-<pid>-<start time>` by the process that took it
 * (`shared/claims.ts`): it is deleted once Pi accepted the message and renamed back when it did not, and a claim whose
 * process died is given back by the next take, so a crash between claim and send loses nothing.
 */
const CLAIM_MARKER = '.claim-';

/** The pending files behind the reports `takePendingReports` returned: where each is claimed, and the name it goes back to. */
const claims = new WeakMap<Report, { claim: string; file: string }>();

/** Saves a report nobody could receive; never throws (a report that cannot be saved is lost). */
export function savePendingReport(dir: string, id: string, report: Report): void {
  try {
    privateDir(dir);
    const saved: Report = { ...report, reportId: report.reportId ?? crypto.randomUUID() };
    atomicWriteFileSync(path.join(dir, `${Date.now()}-${id.replace(/[^\w.-]/g, '_')}.json`), JSON.stringify(saved), { mode: 0o600 });
  } catch {
    // No disk: nothing more to do.
  }
}

/**
 * The saved reports, oldest first, each claimed by a rename so two processes never take one. The claim stays until
 * `ReportQueue` delivers the report (deleted) or fails to (renamed back); a report saved twice is delivered once.
 */
export function takePendingReports(dir: string): Report[] {
  let names: string[];
  try {
    releaseDeadClaims(dir, fs.readdirSync(dir), CLAIM_MARKER, (original) => original.endsWith('.json'));
    names = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort();
  } catch {
    return [];
  }
  const seen = new Set<string>();
  return names.flatMap((name) => {
    const file = path.join(dir, name);
    const claim = `${file}${claimSuffix(CLAIM_MARKER)}`;
    try {
      fs.renameSync(file, claim);
    } catch {
      return [];
    }
    try {
      const report = JSON.parse(fs.readFileSync(claim, 'utf8')) as Report;
      if (report.reportId !== undefined && seen.has(report.reportId)) {
        fs.rmSync(claim, { force: true });
        return [];
      }
      if (report.reportId !== undefined) seen.add(report.reportId);
      const taken = { ...report, content: `(Arrived after the session restarted) ${report.content}` };
      claims.set(taken, { claim, file });
      return [taken];
    } catch {
      // Unreadable: it stays where it was.
      try {
        fs.renameSync(claim, file);
      } catch {
        // Gone meanwhile.
      }
      return [];
    }
  });
}

/** Most report ids a queue remembers for deduplication. */
const KNOWN_REPORTS = 256;

/**
 * Delivers background reports. Reports that finish close together are batched: all are sent at once and only the last
 * may start a turn, so three subagents finishing in a second cost one parent turn instead of three. Delivery is
 * at-least-once: a report taken from the pending folder is deleted only after Pi accepted it, one Pi refused (the
 * session ended) goes back to the folder, and `persist` saves what is still queued; a report is queued once per id.
 */
export class ReportQueue {
  private queued: Report[] = [];
  private timer: NodeJS.Timeout | undefined;
  /** Ids of reports queued or delivered, oldest first. */
  private readonly known = new Set<string>();
  /** The pending folder of the Pi session this queue serves: where a report that could not be sent is saved. */
  pendingDir: string | undefined;

  constructor(private readonly pi: ExtensionAPI, private readonly windowMs = REPORT_BATCH_MS) {}

  add(report: Report): void {
    report.reportId ??= crypto.randomUUID();
    if (this.known.has(report.reportId)) {
      this.settle(report);
      return;
    }
    this.known.add(report.reportId);
    if (this.known.size > KNOWN_REPORTS) this.known.delete(this.known.values().next().value!);
    this.queued.push(report);
    if (this.timer) return;
    this.timer = setTimeout(() => this.flush(), this.windowMs);
    this.timer.unref?.();
  }

  flush(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    const batch = this.queued;
    this.queued = [];
    const wake = batch.some((report) => report.wake);
    batch.forEach((report, index) => {
      try {
        // followUp: read once the current turn ends; triggerTurn wakes an idle parent, once per batch.
        this.pi.sendMessage({ customType: RESULT_TYPE, content: report.content, display: true, details: report.details }, { triggerTurn: wake && index === batch.length - 1, deliverAs: 'followUp' });
      } catch {
        // The session ended before the subagent finished: the report waits for the next start.
        this.retain(report);
        return;
      }
      this.settle(report);
    });
  }

  /** Saves what is still queued for the next start of the session (a shutdown that does not send it). */
  persist(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    const batch = this.queued;
    this.queued = [];
    for (const report of batch) this.retain(report);
  }

  /** The report reached Pi (or is a copy of one that did): its pending file is no longer needed. */
  private settle(report: Report): void {
    const claim = claims.get(report);
    claims.delete(report);
    if (claim) fs.rmSync(claim.claim, { force: true });
  }

  /** The report did not reach Pi: it goes back to the pending folder, and may be queued again when taken. */
  private retain(report: Report): void {
    if (report.reportId !== undefined) this.known.delete(report.reportId);
    const claim = claims.get(report);
    claims.delete(report);
    if (claim) {
      try {
        fs.renameSync(claim.claim, claim.file);
      } catch {
        // The claim is gone; nothing to give back.
      }
    } else if (this.pendingDir) savePendingReport(this.pendingDir, report.details.id, report);
  }
}

/**
 * Report files the parent has read (Pi's `read` of `<scratch>/report.md`), by agent id, with the time.
 * A report whose file was read after its last change reaches the parent without starting a turn.
 */
export class ReadReports {
  private readonly scratch = new Map<string, string>();
  private readonly readAt = new Map<string, number>();

  track(id: string, scratch: string | undefined): void {
    if (scratch) this.scratch.set(path.join(path.resolve(scratch), 'report.md'), id);
  }

  observe(toolName: string, input: Record<string, unknown>, cwd: string): void {
    for (const file of readPaths(toolName, input, cwd)) {
      const id = this.scratch.get(file);
      if (id) this.readAt.set(id, Date.now());
    }
  }

  /** Whether the parent read this agent's report file since it was last written; forgets the agent. */
  consume(id: string): boolean {
    const at = this.readAt.get(id);
    const file = [...this.scratch].find(([, owner]) => owner === id)?.[0];
    this.readAt.delete(id);
    if (file) this.scratch.delete(file);
    if (at === undefined || !file) return false;
    try {
      return fs.statSync(file).mtimeMs <= at;
    } catch {
      return false;
    }
  }
}

/** Removes a scratch folder the subagent left empty (only the owner marker), so finished runs leave no clutter. */
export function dropEmptyScratch(dir: string | undefined): boolean {
  if (!dir) return false;
  try {
    if (fs.readdirSync(dir).some((name) => name !== OWNER_FILE)) return false;
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
  } catch {
    return false;
  }
}
