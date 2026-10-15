import type { Usage } from '@earendil-works/pi-ai';
import { NEEDS_APPROVAL } from '../permission/ask.js';
import { redactSecrets } from '../shared/sanitize.js';
import { Thought, thoughtGist } from '../shared/thought.js';
import { addUsage, contentText, emptyUsage, isRecord, toolHint } from '../shared/util.js';
import { imagesOf } from './screenshots.js';

export interface WatchdogLimits {
  /**
   * Quiet time before a child counts as hung: no running tool, not settling after its answer, and no event at all. A
   * running tool (or the hold on background jobs after the answer) is busy, however long it stays silent: it ends on
   * its own deadline, and the user can stop it.
   */
  idleMs: number;
  /**
   * How long a busy child may stay busy past a call (or its answer) when that call declares no `timeout`; a call that
   * declares one gets that. Past it plus `idleMs`, a tool that never ends (or a hold that never settles) is hung.
   */
  busyMs: number;
}

/** One step of a running child, for the parent's live row. */
export interface ChildProgress {
  /** A tool call it started (`→ bash ls`). */
  activity?: string | undefined;
  /** A step of its reasoning that is not a tool call: a thought's gist (`✻ …`) or its narration (`› …`) once a reply ends. */
  step?: string | undefined;
  /** The gist of the thinking it streams now; empty once that thinking ends. */
  thinking?: string | undefined;
  /** Its usage so far. */
  usage: Usage;
  /** The assistant reply that just ended (with its `provider`, `model` and `usage`): its model may have no pricing. */
  reply?: Record<string, unknown>;
  /** The latest screenshot a tool returned. */
  image?: { data: string; mimeType: string };
  /** A tool call the child could not run without the user's approval (it has no one to ask). */
  denied?: boolean;
  /** The child waits for the user's answer to a dialog (`true`), or that answer arrived (`false`). */
  waiting?: boolean;
}

/**
 * What the events tell about a running child. The reducer (`reduceEvent`) updates it; the watchdog, `stop` and the exit
 * path of `runSubagent` read it, so the order of updates within one event is part of the behavior.
 */
export interface ChildState {
  /** Between `agent_start` and `agent_settled`: only a running child has anything to abort. */
  running: boolean;
  /** `agent_settled` arrived: the child leaves on its own once its input is closed. */
  settledSeen: boolean;
  toolsRunning: number;
  /** The answer is in and the child holds for its background jobs. */
  settling: boolean;
  /** While busy (tools running, or settling after the answer), the child is hung only past this moment. */
  busyUntil: number;
  /** The longest deadline of a background job it started: settling waits for timed jobs. */
  jobsMs: number;
  lastActivity: string;
  usage: Usage;
  thought: Thought;
}

export function newChildState(): ChildState {
  return { running: false, settledSeen: false, toolsRunning: 0, settling: false, busyUntil: 0, jobsMs: 0, lastActivity: 'started', usage: emptyUsage(), thought: new Thought() };
}

/** What the lifecycle does for an event, in order, once the state is updated. */
export type ChildEffect =
  | { kind: 'progress'; update: ChildProgress }
  /** A dialog of the child (`extension_ui_request`) for the relay. */
  | { kind: 'ui'; event: Record<string, unknown> }
  /** The child refused its task: the run fails with this message and stops. */
  | { kind: 'rejected'; message: string }
  /** Tell the child to shut down in order (close its stdin). */
  | { kind: 'close' }
  /** The run is over (`agent_settled`); `aborted` is what the child said, before the lifecycle weighs a stall. */
  | { kind: 'settled'; aborted: boolean }
  /** A message that is not the child's own reply (its prompt, a team message) reached it. */
  | { kind: 'incoming'; role: unknown }
  /** An assistant reply ended: the report tracker reads its text. */
  | { kind: 'answer'; text: string | undefined; stopReason: unknown; errorMessage: unknown };

export function parseEvent(line: string): Record<string, unknown> | undefined {
  try {
    const value = JSON.parse(line) as unknown;
    return isRecord(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

export function assistantText(message: unknown): string | undefined {
  if (!isRecord(message) || message['role'] !== 'assistant' || !Array.isArray(message['content'])) return undefined;
  const text = contentText(message['content']).trim();
  return text || undefined;
}

/** A reply's reasoning as trail lines: each thinking block's gist, then its narration when tool calls follow (a final answer is the report). */
function replySteps(message: Record<string, unknown>): string[] {
  if (!Array.isArray(message['content'])) return [];
  const steps: string[] = [];
  for (const part of message['content']) {
    if (!isRecord(part)) continue;
    const gist = part['type'] === 'thinking' && typeof part['thinking'] === 'string' ? thoughtGist(part['thinking'], true) : undefined;
    if (gist) steps.push(`✻ ${gist}`);
  }
  const narration = message['stopReason'] === 'toolUse' ? assistantText(message) : undefined;
  if (narration) steps.push(`› ${redactSecrets(narration.replace(/\s+/g, ' '))}`);
  return steps;
}

/** A call's own deadline in ms: its `timeout` argument (seconds), when it declares one. */
function declaredTimeout(args: unknown): number | undefined {
  const seconds = isRecord(args) ? args['timeout'] : undefined;
  return typeof seconds === 'number' && seconds > 0 ? seconds * 1000 : undefined;
}

function describeToolCall(name: unknown, args: unknown): string {
  const hint = toolHint(args);
  return `→ ${String(name)}${hint ? ` ${hint}` : ''}`;
}

/** The prompt command's own answer; every other `response` is for a command this parent never sends. */
function promptResponse(event: Record<string, unknown>): ChildEffect[] {
  if (event['command'] !== 'prompt') return [];
  if (event['success'] === false) return [{ kind: 'rejected', message: `Subagent rejected its task: ${typeof event['error'] === 'string' ? event['error'] : 'no reason given'}` }];
  // An extension command consumed the prompt: no run starts, so no `agent_settled` will come.
  return isRecord(event['data']) && event['data']['disposition'] === 'handled' ? [{ kind: 'close' }] : [];
}

/**
 * Applies one parsed event of the child to `state` and returns what the lifecycle does about it, in order. `now` is the
 * clock for the busy deadline. Nothing here touches the process, the report or the parent's row.
 */
export function reduceEvent(state: ChildState, event: Record<string, unknown>, limits: WatchdogLimits, now: number): ChildEffect[] {
  const type = event['type'];
  if (type === 'response') return promptResponse(event);
  if (type === 'extension_ui_request') return [{ kind: 'ui', event }];
  // Calls a tool makes itself (a codemode script) are part of that call, not activity of their own.
  if (event['parentToolCallId']) return [];
  const effects: ChildEffect[] = [];
  const progress = (update: Omit<ChildProgress, 'usage'>) => effects.push({ kind: 'progress', update: { ...update, usage: state.usage } });
  if (type === 'agent_start') state.running = true;
  if (type === 'agent_settled') {
    state.running = false;
    state.settledSeen = true;
    // The run is over and the report is in: the child has nothing left to do, so the lifecycle tells it to leave.
    return [{ kind: 'settled', aborted: event['aborted'] === true }];
  }
  // A new turn or a streaming reply means the previous turn's tools are over, even one that never reported its end.
  if (type === 'turn_start' || type === 'message_update') state.toolsRunning = 0;
  // A turn after the answer (a background job's report woke it) is a model turn again, not settling.
  if (type === 'turn_start') state.settling = false;
  if (type === 'message_update' && isRecord(event['assistantMessageEvent'])) {
    const update = event['assistantMessageEvent'];
    if (update['type'] === 'thinking_start') state.thought.reset();
    if (update['type'] === 'thinking_delta' && typeof update['delta'] === 'string' && state.thought.add(update['delta'])) progress({ thinking: state.thought.gist ?? '' });
    return effects;
  }
  if (type === 'tool_execution_start') {
    state.toolsRunning++;
    state.settling = false;
    const own = declaredTimeout(event['args']);
    if (own !== undefined && isRecord(event['args']) && event['args']['background'] === true) state.jobsMs = Math.max(state.jobsMs, own);
    state.busyUntil = Math.max(state.busyUntil, now + (own ?? limits.busyMs) + limits.idleMs);
    state.lastActivity = describeToolCall(event['toolName'], event['args']);
    progress({ activity: state.lastActivity });
  }
  if (type === 'tool_execution_end') {
    state.toolsRunning = Math.max(0, state.toolsRunning - 1);
    const image = imagesOf(event['result']).at(-1);
    if (image) progress({ image });
    const result = event['result'];
    if (event['isError'] === true && isRecord(result) && contentText(result['content']).startsWith(NEEDS_APPROVAL)) progress({ denied: true });
  }
  if (type !== 'message_end' || !isRecord(event['message'])) return effects;
  const message = event['message'];
  if (message['role'] !== 'assistant') return [...effects, { kind: 'incoming', role: message['role'] }];
  addUsage(state.usage, message['usage']);
  state.thought.reset();
  for (const step of replySteps(message)) progress({ step });
  progress({ reply: message, thinking: '' });
  state.settling = message['stopReason'] !== 'toolUse';
  if (state.settling) state.busyUntil = now + Math.max(state.jobsMs, limits.busyMs) + limits.idleMs;
  state.lastActivity = state.settling ? 'answered; settling' : 'model turn';
  effects.push({ kind: 'answer', text: assistantText(message), stopReason: message['stopReason'], errorMessage: message['errorMessage'] });
  return effects;
}
