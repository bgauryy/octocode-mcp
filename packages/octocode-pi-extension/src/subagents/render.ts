import type { Usage } from '@earendil-works/pi-ai';
import type { AgentToolResult, MessageRenderer, Theme, ToolRenderResultOptions } from '@earendil-works/pi-coding-agent';
import { Box, type Component } from '@earendil-works/pi-tui';
import { fencedParts } from '../shared/fence.js';
import { formatCost, formatDuration, formatTokenUsage, shortPath } from '../shared/format.js';
import { bodyLines, clip, timingOf, plural, resultBlock, toolHeader, type RenderContext } from '../shared/render.js';
import { contentText, isRecord } from '../shared/util.js';
import type { ReportStatus } from './report.js';

/**
 * How the `agent` tool and a background subagent's report message are drawn: `● Agent(goal · model) · 38s`, then live
 * progress while it runs and `⎿ Done (name · 4 tool calls · ↑12k (80% cached) ↓2k · ≈$0.12 · 38s)` with the answer once it finishes. The row
 * stays one short line; the full prompt the agent was given shows in the expanded view, above its progress or report.
 */

/** The `agent` tool's result details, updated as the child streams. */
export interface RunDetails {
  /** The agent's name. */
  id: string;
  /** Its role. */
  profile: string;
  goal: string;
  toolCalls: number;
  /** Tool calls the child could not run without the user's approval. */
  denied?: number | undefined;
  /** Its latest steps: tool calls (`→ bash ls`), thoughts (`✻ …`) and narration (`› …`). */
  activity: string[];
  /** The gist of the thinking it streams now. */
  thinking?: string;
  /** Every prompt token (uncached, cache reads and writes); `cacheRead` is the part read from cache. */
  input: number;
  cacheRead: number;
  output: number;
  /** Pi's estimate; `unpriced`: part of the usage came from a model without pricing and is not in it. */
  cost: number;
  unpriced: boolean;
  startedAt: number;
  /** waiting: for a free slot; running: foreground, still working; background: returned at once, the report arrives as a message. */
  status: 'waiting' | 'running' | 'background' | 'done' | 'failed';
  /** The child waits for the user's answer to one of its dialogs (shown in this session). */
  waiting?: boolean;
  /** Someone stopped the run; it is closing (the child, an isolated run's worktree). */
  stopping?: boolean;
  /** The `provider/id` it runs on (with any `:thinking` suffix); absent when it runs on the parent's model. */
  model?: string;
  /** The profile's preferred model, unavailable here: the run fell back to the parent's model. */
  fallback?: string;
  /** The outcome word its report starts with; absent while it runs and when the report names none. */
  outcome?: ReportStatus;
  /** The subagent's latest screenshot, saved to this path. */
  shot?: string;
}

/** What the background-result message carries for its renderer: the outcome, not parsed back out of the text. */
export interface ResultDetails {
  id: string;
  /** Its role and its goal. */
  profile?: string;
  goal?: string;
  status: 'done' | 'failed' | 'stopped';
  /** The outcome word the report starts with (`failed` for a crashed run); absent when it names none. */
  outcome?: ReportStatus;
  /** The `⎿` line, e.g. `Done (name · 4 tool calls · ↑12k ↓2k · ≈$0.12 · 38s)`. */
  summary: string;
  durationMs?: number;
  /** A stop someone asked for (`/agents kill`, `coordinate stop`): drawn as an outcome, not as a failure. */
  requested?: boolean;
  /** The full prompt the subagent was given, shown when the report is expanded. */
  task?: string;
  /** The run's total model usage (Pi's `Usage`): the parent's footer and session index count it (`spendOf`). */
  usage?: Usage;
  /** Whether any of the run's replies came from a model without pricing (then `usage.cost` leaves them out). */
  unpriced?: boolean;
}

/** The model a run is on: its `provider/id`, marked as the parent's when the profile's preference was unavailable. */
function modelLabel(details: Pick<RunDetails, 'model' | 'fallback'>): string {
  if (!details.fallback) return details.model ?? '';
  return `${details.model ?? 'parent model'} (${details.fallback} unavailable)`;
}

/** `2 denied`: tool calls the child had no one to approve (empty when none). */
export const deniedLabel = (details: Pick<RunDetails, 'denied'>): string => (details.denied ? `${details.denied} denied` : '');

type Progress = Pick<RunDetails, 'id' | 'toolCalls' | 'denied' | 'input' | 'cacheRead' | 'output' | 'cost' | 'unpriced' | 'model' | 'fallback'>;

/** `inky-kraken · 4 tool calls · ↑12k (80% cached) ↓2k · ≈$0.12`, then `extra` (a duration), then the model. */
function runStats(details: Progress, ...extra: string[]): string {
  return [details.id, plural(details.toolCalls, 'tool call'), deniedLabel(details), formatTokenUsage(details), formatCost(details), ...extra, modelLabel(details)].filter(Boolean).join(' · ');
}

export const capitalize = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** `Done (inky-kraken · 4 tool calls · ↑12k (80% cached) ↓2k · ≈$0.12 · 38s · provider/id)`; `Blocked (…)` when the report says so. */
export function doneSummary(details: Progress & Pick<RunDetails, 'outcome'>, durationMs: number | undefined): string {
  const label = details.outcome ? capitalize(details.outcome) : 'Done';
  return `${label} (${runStats(details, durationMs === undefined ? '' : formatDuration(durationMs, true))})`;
}

interface AgentArgs {
  task?: string | undefined;
  goal?: string | undefined;
  /** Not drawn: the row names the run by its goal; `/agents` and `coordinate list` show the role. */
  profile?: string | undefined;
  model?: string | undefined;
  background?: boolean | undefined;
  isolate?: boolean | undefined;
}

const argsOf = (context: RenderContext): AgentArgs => (isRecord(context.args) ? (context.args as AgentArgs) : {});

/**
 * `Prompt` and the task, then the heading of what follows (`Report`, `Progress`): the expanded view's preface. Task
 * text comes from the model and may carry escape sequences; it is sanitized here.
 */
function promptPreface(theme: Theme, task: string | undefined, next: string | undefined): string[] {
  const rows = bodyLines(task ?? '');
  if (rows.length === 0) return [];
  const heading = (text: string) => theme.fg('accent', theme.bold(text));
  return [heading('Prompt'), ...rows.map((row) => theme.fg('muted', row)), ...(next ? ['', heading(next)] : [])];
}

/** Characters of the goal a row shows. */
const GOAL_ROW_CHARS = 60;

/** `audit auth token refresh · gpt-5 · isolated`: what the row says about the run, never the prompt or the profile. */
function runLabel(args: AgentArgs): string {
  return [args.goal ? clip(args.goal, GOAL_ROW_CHARS) : '', args.model ? clip(args.model, 40) : '', args.isolate ? 'isolated' : ''].filter(Boolean).join(' · ');
}

export function renderAgentCall(args: AgentArgs, theme: Theme, context: RenderContext): Component {
  return toolHeader(theme, context, 'Agent', runLabel(args), args.background ? { meta: 'background' } : {});
}

export function renderAgentResult(result: AgentToolResult<unknown>, { isPartial }: ToolRenderResultOptions, theme: Theme, context: RenderContext): Component {
  const details = result.details as RunDetails | undefined;
  const body = contentText(result.content);
  const task = argsOf(context).task;
  if (context.isError || !details) {
    const [head = '', ...rest] = body.split('\n');
    const more = rest.join('\n');
    return resultBlock(theme, context, { summary: head, body: more, prefaceLabel: 'prompt', preface: promptPreface(theme, task, more.trim() ? 'Output' : undefined), ...timingOf(result.details) });
  }
  // Waiting for a slot: the row says how many run before it.
  if (isPartial && details.status === 'waiting') return resultBlock(theme, context, { summary: body, lines: [], max: 0, prefaceLabel: 'prompt', preface: promptPreface(theme, task, undefined) });
  if (isPartial) {
    // Live progress: counts, then the latest steps (the header carries the running clock).
    const lines = [
      ...details.activity.slice(-3).map((line) => theme.fg('dim', clip(line, 200))),
      ...(details.thinking ? [theme.italic(theme.fg('thinkingText', `✻ ${clip(details.thinking, 200)}…`))] : []),
      ...(details.shot ? [theme.fg('dim', `📷 ${clip(shortPath(details.shot), 200)}`)] : []),
    ];
    const summary = details.stopping ? `stopping… (${runStats(details)})` : details.waiting ? `waiting for your approval (${runStats(details)})` : runStats(details);
    return resultBlock(theme, context, { summary, lines, max: lines.length, prefaceLabel: 'prompt', preface: promptPreface(theme, task, lines.length > 0 ? 'Progress' : undefined) });
  }
  if (details.status === 'background') {
    // The first line is for the model; only a later note (an isolation warning) is worth expanding to.
    const note = body.split('\n').slice(1).join('\n').trim();
    return resultBlock(theme, context, { summary: `Running in the background as ${details.id}`, ...(note ? { body: note } : {}), prefaceLabel: 'prompt', preface: promptPreface(theme, task, note ? 'Note' : undefined), max: 0, ...timingOf(result.details) });
  }
  const timing = timingOf(result.details);
  return resultBlock(theme, context, { summary: doneSummary(details, context.durationMs), body, prefaceLabel: 'prompt', preface: promptPreface(theme, task, body.trim() ? 'Report' : undefined), ...timing });
}

/** A report's text for the screen: the child's words without their fence lines, then the parent's own footer. */
function reportBody(text: string): string {
  const fenced = fencedParts(text);
  if (!fenced) return text;
  return fenced.footer ? `${fenced.body}\n\n${fenced.footer}` : fenced.body;
}

/**
 * A background subagent's report, drawn like the tool row it came from: `● Agent(id)` then `⎿ Done (…)` and
 * the report; expanded, the full prompt comes first.
 */
export const renderAgentMessage: MessageRenderer = (message, { expanded, outputPad }, theme) => {
  const details = (message.details ?? {}) as Partial<ResultDetails>;
  const [head = '', ...rest] = contentText(message.content).split('\n');
  const report = reportBody(rest.join('\n'));
  const stopped = details.status === 'stopped';
  // A stop (asked for or not) is an interruption, not a failure: drawn `◼` in the warning colour.
  const context = { isPartial: false, isError: details.status === 'failed' || stopped, expanded, state: stopped ? { stopped: true } : {} };
  // Pi draws custom messages flush left; pad them like a tool row.
  const box = new Box(outputPad ?? 1, 0);
  box.addChild(toolHeader(theme, context, 'Agent', [details.id ?? 'background', details.goal && clip(details.goal, GOAL_ROW_CHARS)].filter(Boolean).join(' · '), details.durationMs === undefined ? { meta: 'background' } : { meta: 'background', durationMs: details.durationMs }));
  box.addChild(resultBlock(theme, context, { summary: details.summary ?? head, body: report, stopped, prefaceLabel: 'prompt', preface: promptPreface(theme, details.task, report.trim() ? 'Report' : undefined) }));
  return box;
};
