import path from 'node:path';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { formatCost, formatDuration, shortPath, toolCallCount } from '../shared/format.js';
import { addReply, emptyTotals, errorMessage, firstLine, modelLookup, settleWithin, unpricedModel, type ModelLookup } from '../shared/util.js';
import { AgentsView } from '../team/panel.js';
import { checkGoal, GOAL_DESCRIPTION, GOAL_MAX_CHARS } from '../team/identity.js';
import { USER_SENDER, type Team } from '../team/session.js';
import { teamWorkspace } from '../team/store.js';
import { timedTool } from '../shared/render.js';
import { projectTrustNow } from '../shared/trust.js';
import type { Permission } from '../permission/ask.js';
import { deniedLabel, doneSummary, renderAgentCall, renderAgentMessage, renderAgentResult, type RunDetails } from './render.js';
import { claimRun, joinTeam, lingerSeconds, maxSubagents, withIdentity, type AgentRuns, type Run } from './claim.js';
import { buildAgentArgs, runSubagent, type ChildProgress, type Identity } from './process.js';
import { askSpawn, type AgentProfile } from './profiles.js';
import { pendingReportsDir, ReadReports, ReportQueue, RESULT_TYPE, savePendingReport, scratchRoot, sweepScratch, takePendingReports, type Report } from './handoff.js';
import { saveShot, shotsDir, type Shot } from './screenshots.js';
import { agentsCommand, stopBackground, type BackgroundRun } from './command.js';
import type { Subcommand } from '../shared/commands.js';
import { createWorktree, describePrune, finishWorktree, isolationReport, pendingRefs, pruneWorktrees, recordWorktreePid, type Worktree } from './worktree.js';

/** What the rest of the extension may do with the subagents this session started. */
export interface AgentControl {
  /** Stops a background subagent this session started; the refusal text when there is none by that id. */
  stop(id: string, by: string): string | undefined;
  /** Resolves once every background subagent has finished and sent its report. */
  settle(): Promise<unknown>;
  /** Background subagents running now (a session switch would stop them). */
  background(): number;
  /** Session shutdown's first step: stops every background subagent and waits (bounded) for their reports. Idempotent. */
  stopAll(): Promise<void>;
  /** `/octocode agents`: list agents, tell, kill, merge; `index.ts` registers it and its `/agents` shortcut. */
  command: Subcommand;
}

/** Longest accepted task; a runaway task text is refused by schema validation instead of spawning a child. */
export const MAX_TASK_CHARS = 16_384;

/** How long shutdown waits for stopped background subagents: past the SIGTERM grace, after which they are killed. */
const SHUTDOWN_WAIT_MS = 6_000;

type Outcome = Awaited<ReturnType<typeof runSubagent>>;
type AgentUpdate = (update: { content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }>; details: RunDetails }) => void;
interface LingeringRun { until: number; run: Run; ctx: ExtensionContext; timer?: NodeJS.Timeout }

/** An isolated run's private worktree; `finish` commits its changes to the agent's ref and removes it, once, and returns the text for the report. */
class Isolation {
  worktree: Worktree | undefined;

  constructor(private readonly id: string) {}

  /** Creates the worktree and returns the child's cwd. The worktree is its own git root: the child stays on this team. */
  async start(ctx: Pick<ExtensionContext, 'cwd' | 'isProjectTrusted'>, identity: Identity): Promise<string> {
    this.worktree = await createWorktree(ctx.cwd, this.id);
    identity.workspace = teamWorkspace(ctx.cwd);
    // The worktree is a different root, so no stored decision matches it: hand down only a decision this session made.
    if (projectTrustNow(ctx) === true) identity.trustRoot = identity.workspace;
    return this.worktree.cwd;
  }

  finish(): Promise<string> {
    const worktree = this.worktree;
    return worktree
      ? finishWorktree(worktree).then(
          (result) => isolationReport(this.id, result),
          (error: unknown) => isolationReport(this.id, { error: errorMessage(error) }),
        )
      : Promise.resolve('');
  }
}

/**
 * Progress of a run into `details` (tool lines, usage, the latest screenshot), mirrored to `onUpdate`. A reply from a model
 * without pricing (looked up in this session's registry) marks the run's cost `n/a`.
 */
function tracker(identity: Identity, details: RunDetails, find: ModelLookup) {
  const dir = shotsDir();
  let shots = 0;
  let latest: Shot | undefined;
  return (onUpdate: AgentUpdate | undefined) => ({ activity: line, usage, reply, image, denied }: ChildProgress) => {
    if (denied) details.denied = (details.denied ?? 0) + 1;
    if (line) {
      details.toolCalls += 1;
      details.activity = [...details.activity.slice(-4), line];
    }
    if (image) {
      latest = saveShot(dir, identity.id, (shots += 1), image);
      details.shot = latest.path;
    }
    // `usage` is the run's total so far: the details restart from it. Cached prompt tokens count in ↑.
    const unpriced = details.unpriced || unpricedModel(reply, find) !== undefined;
    Object.assign(details, emptyTotals());
    addReply(details, usage, unpriced);
    const text = { type: 'text' as const, text: line ?? details.activity.at(-1) ?? 'working' };
    // Partial results only reach the user's screen, so the latest screenshot is drawn there but never enters the model's context.
    onUpdate?.({ content: image && latest?.data ? [text, { type: 'image', data: latest.data, mimeType: latest.mimeType }] : [text], details: { ...details } });
  };
}

/** A run's details as it starts. */
function runDetails(run: Run): RunDetails {
  const { model, fallback } = run.route;
  return {
    id: run.identity.id, profile: run.identity.role, goal: run.identity.goal, toolCalls: 0, activity: [], input: 0, cacheRead: 0, output: 0, cost: 0, unpriced: false, startedAt: Date.now(), status: 'running',
    ...(model ? { model } : {}), ...(fallback ? { fallback } : {}),
  };
}

const withShot = (details: RunDetails, text: string) => (details.shot ? `${text}\n\n(Last screenshot: ${shortPath(details.shot)})` : text);

/** Runs the subagent in the background; its report (or why it stopped) arrives as a message, and then it gives its slot back. */
function startBackground(
  runs: AgentRuns, run: Run, details: RunDetails, task: string, launch: (signal: AbortSignal) => Promise<Outcome>, finish: () => Promise<string>, piSession: string,
  linger?: () => string,
): void {
  const { background, read } = runs;
  const { identity } = run;
  const session = runs.session;
  // A report that arrives after its session ended (a reload, a switch) is kept for the next start of that Pi session.
  const reports = { add: (report: Report) => (session === runs.session ? runs.reports.add(report) : savePendingReport(pendingReportsDir(piSession), identity.id, report)) };
  const controller = new AbortController();
  const entry: BackgroundRun = { controller, done: Promise.resolve() };
  background.set(identity.id, entry);
  read.track(identity.id, identity.scratch);
  // The parent may have many runs going: every report names the agent, its role and its goal.
  const who = `${identity.id} (${identity.role}: ${identity.goal})`;
  // For the renderer: the expanded report shows the whole prompt.
  const shown = { task, goal: identity.goal ?? '', profile: identity.role ?? '' };
  entry.done = (async () => {
    try {
      const outcome = await launch(controller.signal);
      const note = await finish();
      details.seconds = Math.round((Date.now() - details.startedAt) / 1000);
      const head = outcome.error ? `Background subagent ${who} failed: ${outcome.error}` : `Background subagent ${who} finished (${[formatDuration(Date.now() - details.startedAt), toolCallCount(details.toolCalls), deniedLabel(details), formatCost(details)].filter(Boolean).join(' · ')}):`;
      const durationMs = Date.now() - details.startedAt;
      const summary = outcome.error ? `Failed: ${firstLine(outcome.error)}` : doneSummary(details, durationMs);
      const alreadyRead = read.consume(identity.id);
      const next = outcome.error ? `\n${FAILED_NEXT}${outcome.text ? PARTIAL_UNVERIFIED : ''}` : '';
      // A successful run that lingers stays reachable: the report says for how long and how to use or end it.
      const reachable = outcome.error ? '' : (linger?.() ?? '');
      reports.add({ content: `${head}${next}\n${withShot(details, outcome.text || '(no text)')}${note}${reachable}`, details: { id: identity.id, status: outcome.error ? 'failed' : 'done', summary, durationMs, ...shown }, wake: !alreadyRead });
    } catch (error) {
      const note = await finish();
      read.consume(identity.id);
      const by = entry.stoppedBy;
      const reason = by === USER_SENDER ? 'cancelled by the user' : by ? `stopped by ${by}` : `stopped: ${errorMessage(error)}`;
      const reachable = by === 'permission change' ? (linger?.() ?? '') : '';
      reports.add({
        content: `Background subagent ${who} ${reason}${note}${reachable}`,
        details: { id: identity.id, status: 'stopped', summary: reason.charAt(0).toUpperCase() + reason.slice(1), durationMs: Date.now() - details.startedAt, ...shown, ...(by ? { requested: true } : {}) },
        wake: !by,
      });
    } finally {
      background.delete(identity.id);
    }
  })();
}

/** What the parent does after a failed subagent; its partial answer, if any, was never checked. */
const FAILED_NEXT = 'Retry with a narrower task or do the work yourself.';
const PARTIAL_UNVERIFIED = ' The partial answer is unverified.';

/** Runs the subagent and waits for its report; the child's model usage counts toward this session's totals. */
async function runForeground(
  runs: AgentRuns, run: Run, details: RunDetails, launch: (signal: AbortSignal) => Promise<Outcome>, finish: () => Promise<string>, warning: string, signal: AbortSignal | undefined,
) {
  const { identity } = run;
  // Its own controller, so `/agents kill` can stop this run without aborting the parent's turn.
  const controller = new AbortController();
  const entry: BackgroundRun = { controller, done: Promise.resolve() };
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  runs.foreground.set(identity.id, entry);
  let outcome: Outcome;
  try {
    outcome = await launch(controller.signal);
  } catch (error) {
    const note = await finish();
    const reason = entry.stoppedBy === USER_SENDER ? new Error(`Subagent ${identity.id} was stopped by the user.`) : error;
    throw note ? new Error(`${errorMessage(reason)}${note}`) : reason;
  } finally {
    signal?.removeEventListener('abort', abort);
    runs.foreground.delete(identity.id);
  }
  const note = `${await finish()}${warning}`;
  details.seconds = Math.round((Date.now() - details.startedAt) / 1000);
  if (outcome.error) {
    // An error result rather than a throw, so the child's spent tokens still reach this session's totals.
    details.status = 'failed';
    const text = `Subagent ${identity.id} failed: ${outcome.error}\n${FAILED_NEXT}${outcome.text ? `${PARTIAL_UNVERIFIED}\n\nPartial answer:\n${outcome.text}` : ''}${note}`;
    return { isError: true, content: [{ type: 'text' as const, text }], details, usage: outcome.usage };
  }
  details.status = 'done';
  return { content: [{ type: 'text' as const, text: `${withShot(details, outcome.text || '(subagent returned no text)')}${note}` }], details, usage: outcome.usage };
}

export function registerAgentTool(pi: ExtensionAPI, getProfiles: () => Map<string, AgentProfile>, team: Team, permission: Permission): AgentControl {
  pi.registerMessageRenderer(RESULT_TYPE, renderAgentMessage);
  // Per registration, not per module: a replaced session starts clean.
  const runs: AgentRuns = { pi, team, background: new Map(), foreground: new Map(), reports: new ReportQueue(pi), read: new ReadReports(), running: new Map(), session: 0 };
  const { background } = runs;
  pi.on('tool_result', async (event, ctx) => void (!event.isError && background.size > 0 && runs.read.observe(event.toolName, event.input, ctx.cwd)));
  const panel = new AgentsView(team);
  // Finished background runs still reachable (OCTOCODE_SUBAGENT_LINGER_SECONDS): a message resumes their saved conversation.
  const lingering = new Map<string, LingeringRun>();
  const forgetLinger = (id: string): boolean => {
    clearTimeout(lingering.get(id)?.timer);
    return lingering.delete(id);
  };
  const resuming = new Set<string>();
  let launching = new AbortController();
  const cancelLaunches = () => {
    launching.abort();
    launching = new AbortController();
  };
  /** Where a run that will linger saves its conversation (its scratch folder, under its own name); undefined otherwise. */
  const savedSession = (run: Run, eligible: boolean) =>
    eligible && lingerSeconds() > 0 && run.identity.scratch ? { dir: path.join(run.identity.scratch, 'session'), id: run.identity.id } : undefined;
  /** Called when the run reported: it stays reachable for the window, and the report says so. */
  const lingerFor = (run: Run, ctx: ExtensionContext) => {
    const session = runs.session;
    return (): string => {
      const seconds = lingerSeconds();
      if (session !== runs.session || seconds === 0) return '';
      const id = run.identity.id;
      forgetLinger(id);
      const entry: LingeringRun = { until: Date.now() + seconds * 1000, run, ctx };
      lingering.set(id, entry);
      // Release the saved context when the window ends, even if nobody messages this name again.
      const expire = () => {
        const remaining = entry.until - Date.now();
        if (remaining <= 0) { forgetLinger(id); return; }
        entry.timer = setTimeout(expire, Math.min(remaining, 2_147_483_647));
        entry.timer.unref();
      };
      expire();
      return `\n\n${id} stays reachable for ${seconds} s: \`sendMessage\` to it continues this conversation; \`coordinate stop ${id}\` ends that.`;
    };
  };
  const stopAll = async (by = 'session shutdown'): Promise<void> => {
    // Wait (bounded) for stopped children to file their reports; a named stop files them without starting a turn.
    for (const id of runs.foreground.keys()) stopBackground(runs.foreground, id, by, 'subagent');
    const stopping = [...background].map(([id, entry]) => (stopBackground(background, id, by), entry.done));
    await settleWithin(Promise.all(stopping), SHUTDOWN_WAIT_MS);
    runs.reports.flush();
  };
  permission.onRevoke(() => {
    cancelLaunches();
    void stopAll('permission change');
  });
  pi.on('session_shutdown', async (_event, ctx) => {
    cancelLaunches();
    // Usually done already: index.ts runs it before the team leaves.
    await stopAll();
    // A child still closing keeps its entry (and its slot) until it exits; its report waits for this session's next start.
    runs.session += 1;
    for (const id of lingering.keys()) forgetLinger(id);
    panel.stop(ctx);
  });
  // Worktrees left by a Pi process that died: their changes are saved to the agent's ref, then the worktree goes (kept when saving fails).
  pi.on('session_start', async (_event, ctx) => {
    panel.start(ctx);
    // Reports of background runs that finished after this session last ended (a reload) arrive now, once.
    for (const report of takePendingReports(pendingReportsDir(ctx.sessionManager.getSessionId()))) runs.reports.add(report);
    // Off the start path: it lists and deletes directories.
    const root = scratchRoot(ctx.cwd);
    setImmediate(() => void sweepScratch(root));
    void pruneWorktrees(ctx.cwd)
      .then(describePrune, (error: unknown) => ({ text: `Could not prune orphaned subagent worktrees: ${errorMessage(error)}`, level: 'warning' as const }))
      .then((note) => {
        if (note && ctx.hasUI) ctx.ui.notify(note.text, note.level);
      })
      // The session may have been replaced meanwhile (/new, /resume): its ctx then throws, and nobody is left to tell.
      .catch(() => undefined);
  });
  pi.registerTool(timedTool({
    name: 'agent',
    label: 'Agent',
    description:
      'Delegate a self-contained task to a fresh Pi session that does not inherit this conversation. Choose a profile by its task and capabilities. ' +
      `Foreground calls return reports; background calls return the agent's name and send a report later. Parallel calls share a limit of ${maxSubagents()} agents; excess calls are refused. ` +
      'Reports include verification and blockers; long reports name their full file. Review the result before integrating it.',
    promptSnippet: 'Delegate bounded work to a subagent',
    parameters: Type.Object({
      goal: Type.String({ description: GOAL_DESCRIPTION, minLength: 1, maxLength: GOAL_MAX_CHARS }),
      task: Type.String({ description: 'Bounded scope, paths, evidence and decisions the subagent cannot infer, existing authorization and required output', maxLength: MAX_TASK_CHARS, minLength: 1 }),
      profile: Type.Optional(Type.String({ description: 'Profile name from the active Profiles list; omit for a general-purpose subagent. Profiles set instructions, tool exclusions and MCP access' })),
      model: Type.Optional(Type.String({ description: 'Model override: provider/id or a bare id, optionally with a :thinking level. Refused when unavailable; omit to use the profile\'s model, else this session\'s' })),
      background: Type.Optional(Type.Boolean({ description: 'Return at once for long or parallel work; the report arrives as a message. `sendMessage` redirects it; `coordinate stop` ends it' })),
      collaborate: Type.Optional(Type.Boolean({ description: 'Make subagents on one goal teammates that coordinate directly; useful for shared contracts, unnecessary for unrelated tasks' })),
      isolate: Type.Optional(Type.Boolean({ description: 'Work in a private git worktree; changes land on refs/octocode/pi/<id>, not in this tree. The report names the ref: ask the user to run `/agents merge <id>` to bring them in' })),
    }),
    async execute(_id, params, signal, onUpdate, ctx) {
      const launchSignal = signal ? AbortSignal.any([signal, launching.signal]) : launching.signal;
      launchSignal.throwIfAborted();
      const goal = checkGoal(params.goal);
      // The spawn ask first (claimRun refuses an unknown profile): a denied spawn claims and starts nothing.
      const grants = params.profile && !getProfiles().has(params.profile) ? [] : await askSpawn(permission, ctx, getProfiles().get(params.profile ?? ''), params.task, launchSignal, pi.getSettings().defaultTools);
      // An isolated run's name must not repeat a saved ref: `/agents merge <name>` would be ambiguous.
      const refs = params.isolate ? await pendingRefs(ctx.cwd) : [];
      launchSignal.throwIfAborted();
      const run = claimRun(runs, getProfiles(), { ...params, goal }, ctx, refs);
      // A child cannot ask anyone: it also gets every kind the user allowed for this session.
      run.identity.permission = { mode: permission.mode, grants: [...new Set([...grants, ...permission.childGrants()])] };
      const isolation = new Isolation(run.identity.id);
      let finalized: Promise<string> | undefined;
      const finish = () => (finalized ??= isolation.finish().finally(run.release));
      let handedOff = false;
      try {
        const cwd = params.isolate ? await isolation.start(ctx, run.identity) : ctx.cwd;
        launchSignal.throwIfAborted();
        const worktree = isolation.worktree;
        const warning = `${worktree?.warning ? `\n\n${worktree.warning}` : ''}${run.teamNote}`;
        const onSpawn = worktree ? (pid: number) => recordWorktreePid(worktree, pid) : undefined;
        const own = withIdentity(params.task, run.identity);
        const task = run.identity.collaborate ? joinTeam(runs, run, own) : own;
        const details = runDetails(run);
        const track = tracker(run.identity, details, modelLookup(ctx));
        const session = savedSession(run, params.background === true && !params.isolate);
        const args = buildAgentArgs(task, run.profile, run.route.model, undefined, undefined, session);
        const launch = (runSignal: AbortSignal | undefined, update: AgentUpdate | undefined) => runSubagent(args, cwd, run.profile, run.identity, runSignal, track(update), onSpawn);
        if (!params.background) return await runForeground(runs, run, details, (runSignal) => launch(runSignal, onUpdate), finish, warning, launchSignal);
        startBackground(runs, run, details, params.task, (runSignal) => launch(runSignal, undefined), finish, ctx.sessionManager.getSessionId(), session ? lingerFor(run, ctx) : undefined);
        handedOff = true;
        details.status = 'background';
        return { content: [{ type: 'text', text: `Started ${run.identity.id} (${run.identity.role}: ${goal}) in the background; its report arrives as a message.${warning}` }], details };
      } finally {
        // A failure before the run started still removes the worktree.
        if (!handedOff) await finish();
      }
    },
    renderCall: renderAgentCall,
    renderResult: renderAgentResult,
  }));
  /** A message to a lingering run, from its parent or the user, resumes it in the background; undefined when it does not linger. */
  const resume = async (id: string, text: string, from: string, signal?: AbortSignal): Promise<string | undefined> => {
    const prior = lingering.get(id);
    if (!prior || (from !== prior.run.identity.parentId && from !== USER_SENDER)) return undefined;
    if (Date.now() >= prior.until) {
      forgetLinger(id);
      return undefined;
    }
    if (resuming.has(id)) throw new Error(`${id} is already awaiting permission to resume.`);
    const launchSignal = signal ? AbortSignal.any([signal, launching.signal]) : launching.signal;
    launchSignal.throwIfAborted();
    const { run: last, ctx } = prior;
    const params = { goal: last.identity.goal, task: text, background: true, ...(last.profile ? { profile: last.profile.name } : {}) };
    resuming.add(id);
    let run: Run | undefined;
    try {
      const grants = await askSpawn(permission, ctx, getProfiles().get(params.profile ?? ''), text, launchSignal, pi.getSettings().defaultTools);
      launchSignal.throwIfAborted();
      if (lingering.get(id) !== prior) throw new Error(`Subagent ${id} is no longer available to resume.`);
      // Keep the saved conversation and model, but renew authorization from the parent's current policy.
      const identity = { ...last.identity, permission: { mode: permission.mode, grants: [...new Set([...grants, ...permission.childGrants()])] } };
      run = { ...claimRun(runs, getProfiles(), params, ctx, [], identity), route: last.route };
      const details = runDetails(run);
      const track = tracker(run.identity, details, modelLookup(ctx));
      const message = `Follow-up from ${from === USER_SENDER ? 'the user' : 'your parent'}:\n${text}`;
      const args = buildAgentArgs(message, run.profile, run.route.model, undefined, undefined, savedSession(run, true));
      const resumed = run;
      const launch = (signal: AbortSignal) => runSubagent(args, ctx.cwd, resumed.profile, resumed.identity, signal, track(undefined));
      startBackground(runs, run, details, text, launch, () => Promise.resolve('').finally(resumed.release), ctx.sessionManager.getSessionId(), lingerFor(run, ctx));
      forgetLinger(id);
    } catch (error) {
      run?.release();
      throw error;
    } finally {
      resuming.delete(id);
    }
    return `Resumed ${id} with your message; its reply arrives as a background report.`;
  };
  team.setResumer(resume);
  return {
    // A lingering run has nothing running: stopping it ends its window.
    stop: (id, by) => (forgetLinger(id) ? undefined : stopBackground(background, id, by)),
    // Reports still inside their batching window go out now: a held headless run hands them to its next turn.
    settle: () => Promise.all([...background.values()].map((entry) => entry.done)).then(() => runs.reports.flush()),
    background: () => background.size,
    stopAll,
    command: agentsCommand(team, background, runs.foreground),
  };
}
