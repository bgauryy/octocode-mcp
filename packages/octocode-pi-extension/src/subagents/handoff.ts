import fs from 'node:fs';
import path from 'node:path';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { sweepStaleOutputs, workspacePaths, workspaceScratchDir } from '../shared/home.js';
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
const SCRATCH_MAX_AGE_MS = 7 * 24 * 60 * 60_000;

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

/** Whether the process that owns a scratch folder still runs. An owner file with only a pid (older) is judged by the pid. */
function ownerRunning(dir: string): boolean {
  try {
    const [pid, ...started] = fs.readFileSync(path.join(dir, OWNER_FILE), 'utf8').trim().split(' ');
    return sameProcess(Number(pid), started.join(' '));
  } catch {
    return false;
  }
}

/** Removes scratch folders untouched for a week, except those whose owning Pi process (this or another session) is alive. */
export function sweepScratch(root: string): void {
  let names: string[];
  try {
    names = fs.readdirSync(root);
  } catch {
    return;
  }
  const owned = new Set(names.filter((name) => ownerRunning(path.join(root, name))));
  sweepStaleOutputs(root, SCRATCH_MAX_AGE_MS, owned);
}

/** Background reports finishing within this window reach the parent together, as one wake. */
export const REPORT_BATCH_MS = 1_500;

export interface Report {
  content: string;
  details: ResultDetails;
  /** Start a parent turn for it (not for a stop someone asked for, nor a report the parent already read). */
  wake: boolean;
}

/**
 * Delivers background reports. Reports that finish close together are batched: all are sent at once and only the last
 * may start a turn, so three subagents finishing in a second cost one parent turn instead of three.
 */
export class ReportQueue {
  private queued: Report[] = [];
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly pi: ExtensionAPI, private readonly windowMs = REPORT_BATCH_MS) {}

  add(report: Report): void {
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
        // The session ended before the subagent finished.
      }
    });
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
    const paths = toolName === 'read' ? [input['path']] : [];
    for (const file of paths) {
      if (typeof file !== 'string' || !file) continue;
      const id = this.scratch.get(path.resolve(cwd, file.replace(/^@/, '')));
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
