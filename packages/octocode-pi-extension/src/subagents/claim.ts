import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { envFlag, envInt } from '../shared/env.js';
import { shortPath } from '../shared/format.js';
import { errorMessage } from '../shared/util.js';
import type { Team } from '../team/session.js';
import { routeModel, type ModelRoute } from './model.js';
import type { Identity } from './process.js';
import type { AgentProfile } from './profiles.js';
import { agentScratch, dropEmptyScratch, type ReadReports, type ReportQueue } from './handoff.js';
import type { Background } from './command.js';

/** Starting a subagent: who it is (name, role, goal), whether the limit allows it, and the task text it receives. */

const COLLABORATE_ENV = 'OCTOCODE_SUBAGENT_COLLABORATE';

/** Whether subagents collaborate when a call does not say: `OCTOCODE_SUBAGENT_COLLABORATE` = 1/true/on, else no. */
export function collaborateByDefault(env: NodeJS.ProcessEnv = process.env): boolean {
  return envFlag(env, COLLABORATE_ENV);
}

/** The task a collaborating subagent receives: its own task plus who else is on the team (`name`: `role: goal`) and how to reach them. */
export function teamTask(task: string, parentId: string, others: Array<[string, string]>): string {
  const list = others.length > 0 ? others.map(([id, line]) => `- \`${id}\`: ${line}`).join('\n') : '- none yet; `coordinate list` shows teammates that start later.';
  return `${task}\n\n## Teammates\nYou collaborate with the other subagents that ${parentId} started for the same goal. Running now:\n${list}`;
}

/**
 * The facts only this child has. They ride in its task, not its system prompt, so every child of one profile shares a
 * cached prompt prefix.
 */
export function withIdentity(task: string, identity: Pick<Identity, 'id' | 'role' | 'goal' | 'parentId' | 'scratch'>): string {
  const parent = identity.parentId ? `\`${identity.parentId}\`` : 'another agent';
  const scratch = identity.scratch ? `\`${shortPath(identity.scratch)}\`` : '`.octocode/tmp/` in the repository';
  const role = identity.role ? ` (${identity.role})` : '';
  const goal = identity.goal ? ` Your goal: ${identity.goal}.` : '';
  return `${task}\n\n## You\nYour name is \`${identity.id}\`${role}.${goal} You work for ${parent}. Your scratch folder, for handoff files and a long report, is ${scratch}.`;
}

export const MAX_SUBAGENTS_ENV = 'OCTOCODE_MAX_SUBAGENTS';
const DEFAULT_MAX_SUBAGENTS = 3;

/** How many subagents may run at once: `OCTOCODE_MAX_SUBAGENTS` (a positive integer), else 3. Many parallel children get messy. */
export function maxSubagents(env: NodeJS.ProcessEnv = process.env): number {
  const value = envInt(env, MAX_SUBAGENTS_ENV, DEFAULT_MAX_SUBAGENTS);
  return value >= 1 ? value : DEFAULT_MAX_SUBAGENTS;
}

export const SUBAGENT_LINGER_ENV = 'OCTOCODE_SUBAGENT_LINGER_SECONDS';

/** Seconds a finished background subagent stays reachable (a message resumes its saved conversation); 0 = off. */
export function lingerSeconds(env: NodeJS.ProcessEnv = process.env): number {
  return Math.max(0, envInt(env, SUBAGENT_LINGER_ENV, 0));
}

/** The refusal for a call over the limit, or undefined when there is room. */
export function subagentLimitError(active: Iterable<string>, limit: number): string | undefined {
  const ids = [...active];
  if (ids.length < limit) return undefined;
  return `${ids.length} subagents are already running (${ids.join(', ')}); the limit is ${limit}. Wait for one to finish (background answers arrive as messages), pass the work to a running subagent with \`sendMessage\`, or do it yourself. The limit is set by ${MAX_SUBAGENTS_ENV}.`;
}

/** State of one agent tool registration; a replaced session starts clean. */
export interface AgentRuns {
  pi: ExtensionAPI;
  team: Team;
  background: Background;
  /** Foreground runs, so `/agents kill` can stop one without aborting the whole turn. */
  foreground: Background;
  reports: ReportQueue;
  read: ReadReports;
  /** Subagents running now (foreground and background), by name. */
  running: Map<string, string | undefined>; // A `role: goal` line is present once a collaborating run launches.
  /** Bumped when a session ends: a background run started under an earlier session drops its late report. */
  session: number;
}

export interface AgentParams {
  task: string;
  /** Already checked (`checkGoal`). */
  goal: string;
  profile?: string;
  model?: string;
  background?: boolean;
  collaborate?: boolean;
  isolate?: boolean;
}

/** A claimed subagent run: who it is, who started it, where it hands files back, and how it gives its slot back. */
export interface Run {
  identity: Identity & { role: string; goal: string };
  profile: AgentProfile | undefined;
  /** The model it runs on (the parent's when nothing else routes); `fallback` is the profile's unavailable preference. */
  route: Extract<ModelRoute, { model?: string }>;
  /** Why the run starts without the team (its database is unusable), for the result. */
  teamNote: string;
  release: () => void;
}

/**
 * Checks the profile and the subagent limit, then claims a slot. Checked and claimed with no await in between, so
 * parallel calls in one turn cannot overshoot the limit. `avoid`: names to skip besides the team's (existing refs of isolated runs).
 */
export function claimRun(runs: AgentRuns, profiles: Map<string, AgentProfile>, params: AgentParams, ctx: Pick<ExtensionContext, 'cwd' | 'sessionManager' | 'modelRegistry' | 'model'>, avoid: Iterable<string> = [], resumed?: Run['identity']): Run {
  const { cwd } = ctx;
  const profile = params.profile ? profiles.get(params.profile) : undefined;
  if (params.profile && !profile) throw new Error(`Unknown profile "${params.profile}". Available: ${[...profiles.keys()].join(', ')}`);
  const overLimit = subagentLimitError(runs.running.keys(), maxSubagents());
  if (overLimit) throw new Error(overLimit);
  // An explicit model is strict; a profile's is a preference that falls back to this session's model.
  const route = routeModel({ explicit: params.model, preferred: profile?.model, available: ctx.modelRegistry?.getAvailable() ?? [], parent: ctx.model });
  if ('error' in route) throw new Error(route.error);
  // Joining gives the child its parent's address for sendMessage; without a usable team database it still runs, alone.
  let parentId: string | undefined;
  let teamNote = '';
  try {
    parentId = runs.team.join().id;
  } catch (error) {
    teamNote = `\n\n(Started without the team: ${errorMessage(error)}. It cannot message you or its teammates.)`;
  }
  const collaborate = parentId !== undefined && (params.collaborate ?? collaborateByDefault());
  // A resumed run continues as the same agent: name, role, goal, scratch folder and permission.
  const identity: Run['identity'] = resumed ?? {
    id: runs.team.newName([...runs.running.keys(), ...avoid]),
    role: profile?.name ?? 'general',
    goal: params.goal,
    parentSession: ctx.sessionManager.getSessionId(),
    ...(parentId ? { parentId } : {}),
    ...(collaborate ? { collaborate } : {}),
  };
  runs.running.set(identity.id, undefined);
  const scratch = agentScratch(cwd, identity.id);
  if (scratch) identity.scratch = scratch;
  const release = () => {
    if (!runs.running.delete(identity.id)) return;
    const kept = scratch && !dropEmptyScratch(scratch);
    runs.team.rememberFinished(identity.id, `its report (or failure) already reached you${kept ? ` (files it handed back, and its full report when cut, are in ${shortPath(scratch)})` : ''}.`);
  };
  return { identity, profile, route, teamNote, release };
}

/** A collaborating run's task, listing its running teammates (they find the newcomer with `coordinate list`). */
export function joinTeam(runs: AgentRuns, run: Run, task: string): string {
  const others = [...runs.running].filter((entry): entry is [string, string] => entry[1] !== undefined);
  const withTeam = teamTask(task, run.identity.parentId ?? 'your parent', others);
  runs.running.set(run.identity.id, `${run.identity.role}: ${run.identity.goal}`);
  return withTeam;
}
