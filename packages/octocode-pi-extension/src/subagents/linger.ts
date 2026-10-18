import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Permission } from '../permission/ask.js';
import { USER_SENDER } from '../shared/messages.js';
import { claimRun, lingerSeconds, maxSubagents, subagentLimitError, type AgentRuns, type Run } from './claim.js';
import { askSpawn } from './profiles.js';

/**
 * Finished background runs that stay reachable (`OCTOCODE_SUBAGENT_LINGER_SECONDS`): a message from the parent or the
 * user resumes their saved conversation as a new background run.
 */

interface LingeringRun {
  until: number;
  run: Run;
  ctx: ExtensionContext;
  timer?: NodeJS.Timeout;
}

/** The message a resumed run starts with, and the text the user or parent sent. */
export interface Resumption {
  text: string;
  message: string;
}

export class Lingering {
  private readonly entries = new Map<string, LingeringRun>();
  private readonly resuming = new Set<string>();

  /**
   * `launchSignal` joins the caller's signal with the one a permission change or shutdown aborts. `start` begins the
   * resumed run in the background (and hands `window` back as its linger hook); a throw there releases the run.
   */
  constructor(
    private readonly runs: AgentRuns,
    private readonly permission: Permission,
    private readonly launchSignal: (signal?: AbortSignal) => AbortSignal,
    private readonly start: (run: Run, ctx: ExtensionContext, resumption: Resumption) => void,
  ) {}

  /** Ends a run's window; whether it was lingering. */
  forget(id: string): boolean {
    clearTimeout(this.entries.get(id)?.timer);
    return this.entries.delete(id);
  }

  forgetAll(): void {
    for (const id of [...this.entries.keys()]) this.forget(id);
  }

  /** Called when the run reported: it stays reachable for the window, and the report says so. */
  window(run: Run, ctx: ExtensionContext): () => string {
    const session = this.runs.session;
    return (): string => {
      const seconds = lingerSeconds();
      if (session !== this.runs.session || seconds === 0) return '';
      const id = run.identity.id;
      this.forget(id);
      const entry: LingeringRun = { until: Date.now() + seconds * 1000, run, ctx };
      this.entries.set(id, entry);
      // Release the saved context when the window ends, even if nobody messages this name again.
      const expire = () => {
        const remaining = entry.until - Date.now();
        if (remaining <= 0) {
          this.forget(id);
          return;
        }
        entry.timer = setTimeout(expire, Math.min(remaining, 2_147_483_647));
        entry.timer.unref();
      };
      expire();
      return `\n\n${id} stays reachable for ${seconds} s: \`sendMessage\` to it continues this conversation; \`coordinate stop ${id}\` ends that.`;
    };
  }

  /** A message to a lingering run, from its parent or the user, resumes it in the background; undefined when it does not linger. */
  async resume(id: string, text: string, from: string, signal?: AbortSignal): Promise<string | undefined> {
    const { runs, permission } = this;
    const prior = this.entries.get(id);
    if (!prior || (from !== prior.run.identity.parentId && from !== USER_SENDER)) return undefined;
    if (Date.now() >= prior.until) {
      this.forget(id);
      return undefined;
    }
    if (this.resuming.has(id)) throw new Error(`${id} is already awaiting permission to resume.`);
    const launchSignal = this.launchSignal(signal);
    launchSignal.throwIfAborted();
    const { run: last, ctx } = prior;
    // A message is answered now: over the limit it is refused, not left waiting for a slot.
    if (!runs.slots.tryTake()) throw new Error(subagentLimitError(runs.running.keys(), maxSubagents()));
    this.resuming.add(id);
    let run: Run | undefined;
    try {
      const grants = await askSpawn(permission, ctx, last.profile, text, launchSignal, runs.pi.getSettings().defaultTools, { goal: last.identity.goal });
      launchSignal.throwIfAborted();
      if (this.entries.get(id) !== prior) throw new Error(`Subagent ${id} is no longer available to resume.`);
      // Keep the saved conversation and model, but renew authorization from the parent's current policy.
      const identity = { ...last.identity, relay: ctx.hasUI, permission: { mode: permission.mode, grants: [...new Set([...grants, ...permission.childGrants()])] } };
      run = claimRun(runs, last, { goal: last.identity.goal }, ctx, [], identity);
      this.start(run, ctx, { text, message: `Follow-up from ${from === USER_SENDER ? 'the user' : 'your parent'}:\n${text}` });
      this.forget(id);
    } catch (error) {
      if (run) run.release();
      else runs.slots.give();
      throw error;
    } finally {
      this.resuming.delete(id);
    }
    return `Resumed ${id} with your message; its reply arrives as a background report.`;
  }
}
