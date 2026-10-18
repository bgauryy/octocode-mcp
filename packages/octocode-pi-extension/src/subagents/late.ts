import { onSecond } from '../shared/clock.js';
import { pendingReportsDir, takePendingReports } from './handoff.js';
import type { AgentRuns } from './claim.js';
import { SUBAGENT_STOP_GRACE_MS } from './process.js';

/**
 * After a session starts, how long it keeps looking for reports of runs the previous runtime stopped (a reload): a
 * stop can take two SIGTERM graces (term, then kill) plus saving an isolated run's worktree. Each settled turn looks too.
 */
const LATE_REPORTS_MS = 4 * SUBAGENT_STOP_GRACE_MS;

/**
 * Reports of background runs that finished after this Pi session last ended (a reload, a stop slower than the shutdown
 * wait) are saved for it: taken at its start, for a while after it, and after every settled turn.
 */
export class LateReports {
  private dir: string | undefined;
  private stopClock: (() => void) | undefined;
  /** The take in progress, or the last one: the next starts after it, so two takes never claim the same file. */
  private taking: Promise<void> = Promise.resolve();

  constructor(private readonly runs: AgentRuns) {}

  /** Takes the reports waiting for this Pi session now (resolves when done), and again every second for a while. */
  start(sessionId: string): Promise<void> {
    this.dir = pendingReportsDir(sessionId);
    this.runs.reports.pendingDir = this.dir;
    const first = this.take();
    const until = Date.now() + LATE_REPORTS_MS;
    this.stopClock?.();
    this.stopClock = onSecond(() => {
      void this.take();
      if (Date.now() >= until) this.stopPolling();
    });
    return first;
  }

  take(): Promise<void> {
    const next = this.taking.then(async () => {
      if (this.dir) for (const report of await takePendingReports(this.dir)) this.runs.reports.add(report);
    });
    this.taking = next.catch(() => undefined);
    return next;
  }

  stop(): void {
    this.stopPolling();
    this.dir = undefined;
  }

  private stopPolling(): void {
    this.stopClock?.();
    this.stopClock = undefined;
  }
}
