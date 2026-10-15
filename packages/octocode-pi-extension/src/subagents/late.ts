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
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly runs: AgentRuns) {}

  /** Takes the reports waiting for this Pi session now, and again every second for a while. */
  start(sessionId: string): void {
    this.dir = pendingReportsDir(sessionId);
    this.runs.reports.pendingDir = this.dir;
    this.take();
    const until = Date.now() + LATE_REPORTS_MS;
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      this.take();
      if (Date.now() >= until) clearInterval(this.timer);
    }, 1_000);
    this.timer.unref();
  }

  take(): void {
    if (this.dir) for (const report of takePendingReports(this.dir)) this.runs.reports.add(report);
  }

  stop(): void {
    clearInterval(this.timer);
    this.dir = undefined;
  }
}
