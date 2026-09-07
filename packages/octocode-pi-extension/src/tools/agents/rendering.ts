/**
 * rendering.ts — TUI rendering layer for the agent ledger.
 *
 * Owns: AgentDetails/getAgentDisplayState through refreshAgentLedgerUi,
 * including ticker/spinner/summarize/render/format functions.
 *
 * No imports from agent-tools (keeps dependency direction clean: process ← rendering ← agent-tools).
 * Calls wireProcessCallbacks once at module init so spawnRpcAgent's event handlers
 * can invoke refreshAgentLedgerUi without a circular import.
 */
import fs from 'node:fs';
import { OCTOCODE_SPINNER_FRAMES } from '../../ui-extras.js';
import { hasUiTickSubscriber, setUiTickSubscriber } from '../../tui/ui-ticker.js';
import { shortId } from '../ids.js';
import { SEP } from '../../tui/palette.js';
import { inspectWorkerAwareness } from '../awareness-worker-audit.js';
import { truncateUserVisibleToolOutput } from '../../utils.js';
import type {
  PiContext,
  ToolCallResult,
  PiTheme,
  WorkerWorktreeState,
} from '../../types.js';
import { paint } from '../../tui/palette.js';
import { cliToolTitle } from '../../tui/cli-design.js';
import { truncateToWidth } from '../../tui/width.js';
import {
  type AgentRecord,
  type AgentToolCall,
  type AgentDisplayState,
  type AgentDisplaySource,
} from './types.js';
import {
  agents,
  getLedgerHidden,
  isTerminal,
} from './registry.js';
import {
  refreshNormalizedResult,
  getActiveAgentUi,
  wireProcessCallbacks,
} from './process.js';

// ─── AgentDetails ─────────────────────────────────────────────────────────────

interface AgentDetails {
  agents: Array<ReturnType<typeof summarizeAgent>>;
}

// ─── TUI rendering helpers ────────────────────────────────────────────────────

function getAgentDisplayState(agent: AgentDisplaySource): AgentDisplayState {
  const workerStatus = agent.normalizedResult?.status;
  if (agent.status === 'killed') return 'killed';
  if (agent.status === 'failed' || workerStatus === 'failed') return 'failed';
  if (agent.status === 'running') return 'running';
  // A queued-but-unstarted turn takes precedence over an idle/done snapshot so the
  // ledger never shows 'running' before agent_start, nor 'done' with work pending.
  if ((agent.pendingMessages ?? 0) > 0) return 'queued';
  // Exited beats blocked: a dead process that last said [BLOCKED] cannot be
  // steered/unblocked, so showing "blocked" would advertise a dead-end action.
  if (agent.status === 'exited') return 'done';
  if (workerStatus === 'blocked') return 'blocked';
  if (workerStatus === 'done') return 'done';
  if (agent.status === 'idle') return 'idle';
  return 'starting';
}

// Live-progress spinner: advanced once per ledger tick while a worker runs.
// Shares the working-indicator frames so the extension has ONE spinner glyph
// set (the ledger just steps it at the panel's 1s cadence).
const LEDGER_SPINNER = OCTOCODE_SPINNER_FRAMES;
let ledgerSpinnerFrame = 0;
/** Shared-clock subscription key; live only while ≥1 worker is non-terminal and the UI is present. */
const LEDGER_TICK_KEY = 'octocode-ledger';
let agentLedgerMetricsRefresh: ((ctx?: PiContext) => void) | undefined;

function stopLedgerTicker(): void {
  setUiTickSubscriber(LEDGER_TICK_KEY, undefined);
}

/** Test hook: stop the ticker and report its state so tests never leak a real timer. */
export function stopLedgerTickerForTests(): void {
  stopLedgerTicker();
}
export function isLedgerTickerActiveForTests(): boolean {
  return hasUiTickSubscriber(LEDGER_TICK_KEY);
}

function agentDisplayMeta(state: AgentDisplayState, theme?: PiTheme, opts: { frozen?: boolean } = {}): { icon: string; label: string } {
  const raw: { icon: string; label: string; color: Parameters<typeof paint>[1] } = (() => {
    switch (state) {
      case 'done': return { icon: '✓', label: 'done', color: 'success' };
      case 'failed': return { icon: '✗', label: 'failed', color: 'error' };
      // killed is a neutral terminal state (dismissed), not act-on-me — gold is
      // reserved for blocked (the row you must act on). Muted so the two differ.
      case 'killed': return { icon: '✗', label: 'killed', color: 'muted' };
      case 'blocked': return { icon: '!', label: 'blocked', color: 'warning' };
      // Running is normal activity (brand), idle is quiet (muted) — warning and
      // success stay reserved for real attention/outcome states.
      case 'running': return { icon: opts.frozen ? LEDGER_SPINNER[0]! : LEDGER_SPINNER[ledgerSpinnerFrame % LEDGER_SPINNER.length], label: 'running', color: 'brand' };
      case 'idle': return { icon: '◎', label: 'idle', color: 'muted' };
      case 'queued': return { icon: '⇥', label: 'queued', color: 'link' };
      case 'starting': return { icon: '○', label: 'starting', color: 'dim' };
    }
  })();
  return {
    icon: paint(theme, raw.color, raw.icon),
    label: paint(theme, raw.color, raw.label),
  };
}

/**
 * `endedAt` freezes elapsed time at a terminal agent's last update instead of
 * letting it keep growing against Date.now() long after the agent finished —
 * pass it whenever the record/summary is terminal (see isTerminal()).
 */
export function formatElapsed(startedAt: number, endedAt?: number): string {
  const ms = (endedAt ?? Date.now()) - startedAt;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return s > 0 ? `${m}m${s}s` : `${m}m`;
}

function statHandbackArtifact(filePath: string): { path: string; exists: boolean; bytes?: number; modifiedAt?: string } {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return { path: filePath, exists: false };
    return { path: filePath, exists: true, bytes: stat.size, modifiedAt: stat.mtime.toISOString() };
  } catch {
    return { path: filePath, exists: false };
  }
}

export function formatToolCalls(toolCalls: AgentToolCall[], limit = 3): string {
  const recent = toolCalls.slice(-limit);
  return recent.map((call) => `${call.toolName}:${call.status}`).join(', ');
}

function worktreeSnapshot(worktree: WorkerWorktreeState | undefined): WorkerWorktreeState | undefined {
  return worktree ? { ...worktree } : undefined;
}

function formatWorktreeState(worktree: WorkerWorktreeState | undefined): string {
  if (!worktree) return '';
  const branch = worktree.branch.replace(/^octocode\//, '');
  return ` ⎇ ${branch} +${worktree.aheadCommits}c ~${worktree.dirtyFiles}f ${worktree.mergeState}`;
}

function getArgValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function getArgCsv(args: string[], flag: string): string[] | undefined {
  const value = getArgValue(args, flag);
  return value ? value.split(',').map((item) => item.trim()).filter(Boolean) : undefined;
}

export function summarizeAgent(record: AgentRecord, opts: { full?: boolean } = {}) {
  refreshNormalizedResult(record);
  const normalized = record.normalizedResult;
  const summaryText = normalized?.result || normalized?.next || record.lastOutput || record.stderr || record.error || '';
  const preview = truncateUserVisibleToolOutput(summaryText, 1000);
  return {
    agentId: record.id,
    name: record.name,
    status: record.status,
    awarenessAgentId: record.awarenessAgentId,
    awarenessInspection: record.awarenessInspection,
    cwd: record.cwd,
    model: getArgValue(record.args, '--model'),
    provider: getArgValue(record.args, '--provider'),
    task: record.task,
    planStep: record.planStep,
    thinking: getArgValue(record.args, '--thinking'),
    tools: getArgCsv(record.args, '--tools'),
    startedAt: new Date(record.startedAt).toISOString(),
    updatedAt: new Date(record.updatedAt).toISOString(),
    exitCode: record.exitCode,
    signal: record.signal,
    error: record.error,
    lastOutput: preview.text,
    outputTruncated: preview.truncated,
    normalizedResult: normalized,
    handback: statHandbackArtifact(record.handbackPath),
    recoveryRisk: record.recoveryRisk,
    pendingMessages: record.pendingMessages,
    lastMessage: record.lastMessage,
    policyWarnings: [...record.policyWarnings],
    ledgerEvents: opts.full ? [...record.ledgerEvents] : record.ledgerEvents.slice(-10),
    toolCalls: opts.full ? [...record.toolCalls] : record.toolCalls.slice(-10),
    activeTool: [...record.toolCalls].reverse().find((call) => call.status === 'running')?.toolName,
    worktree: worktreeSnapshot(record.worktree),
  };
}

function formatAgentModelLine(summary: ReturnType<typeof summarizeAgent>): string {
  const model = summary.model ?? 'default model';
  const provider = summary.provider ? `${summary.provider}/` : '';
  const thinking = summary.thinking ? ` · think:${summary.thinking}` : '';
  const tools = summary.tools?.length ? ` · tools:${summary.tools.length}` : '';
  return `${provider}${model}${thinking}${tools}`;
}

// ─── Result rendering ─────────────────────────────────────────────────────────

export function renderAgentResult(records: AgentRecord[], header: string): ToolCallResult {
  for (const record of records) {
    if (isTerminal(record)) record.awarenessInspection = inspectWorkerAwareness(record);
  }
  const summaries = records.map((record) => summarizeAgent(record));
  const lines: string[] = [`${header} (${records.length}):`];
  for (const s of summaries) {
    const exit = s.exitCode !== undefined ? ` (exit ${s.exitCode})` : '';
    const elapsed = formatElapsed(
      new Date(s.startedAt).getTime(),
      isTerminal(s) ? new Date(s.updatedAt).getTime() : undefined,
    );
    const state = getAgentDisplayState(s);
    const meta = agentDisplayMeta(state);
    const handback = s.normalizedResult?.status && s.normalizedResult.status !== 'unknown'
      ? ` · ${s.normalizedResult.status}/${s.normalizedResult.confidence}`
      : '';
    const latestEvent = s.ledgerEvents.at(-1)?.message;
    const result = s.normalizedResult?.result ?? s.normalizedResult?.next ?? s.lastOutput ?? latestEvent;
    const preview = result ? ` — ${result.slice(0, 60).replace(/\n/g, ' ')}${s.outputTruncated ? '…' : ''}` : '';
    const toolInfo = typeof s.activeTool === 'string' ? ` · active:${s.activeTool}` : '';
    const modelInfo = ` · ${formatAgentModelLine(s)}`;
    lines.push(`  ${meta.icon} ${s.name} (${shortId(s.agentId)}) · ${meta.label}${exit}${handback}${modelInfo} · ${elapsed}${toolInfo}${preview}`);
    lines.push(`    agentId: ${s.agentId}`);
    if (s.awarenessInspection) {
      const inspection = s.awarenessInspection;
      lines.push(`    Awareness ${inspection.agentId ?? 'identity unavailable'}: ${inspection.status === 'unavailable' ? 'debt unknown' : `${inspection.pendingCount} pending checks, ${inspection.staleActiveCount} stale active`}; inspection is not verification.`);
    }
  }
  return {
    content: [{ type: 'text', text: lines.join('\n') }],
    details: { agents: summaries } satisfies AgentDetails,
  };
}

function countAgentStates(records: AgentDisplaySource[]): Record<AgentDisplayState, number> {
  const counts: Record<AgentDisplayState, number> = {
    starting: 0,
    queued: 0,
    running: 0,
    idle: 0,
    done: 0,
    blocked: 0,
    failed: 0,
    killed: 0,
  };
  for (const record of records) counts[getAgentDisplayState(record)] += 1;
  return counts;
}

function formatAgentStateCounts(records: AgentDisplaySource[]): string {
  const counts = countAgentStates(records);
  const order: AgentDisplayState[] = ['starting', 'queued', 'running', 'idle', 'blocked', 'done', 'failed', 'killed'];
  const parts = order
    .filter((state) => counts[state] > 0)
    .map((state) => `${counts[state]} ${state}`);
  return [`${records.length} total`, ...parts].join(SEP);
}

export function formatAgentLedger(): string {
  const records = [...agents.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  if (records.length === 0) return 'Octocode agents: none';
  return `Octocode agents: ${formatAgentStateCounts(records)}`;
}

function buildAgentLedgerLines(limit = 10, theme?: PiTheme, width?: number): string[] {
  const records = [...agents.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  const title = cliToolTitle(theme, 'Octocode agents');
  if (records.length === 0) return [`${title}: none`];

  const counts = formatAgentStateCounts(records);
  const lines = [`${title}: ${paint(theme, 'dim', counts)}`];
  for (const record of records.slice(0, limit)) {
    const summary = summarizeAgent(record);
    const state = getAgentDisplayState(summary);
    const meta = agentDisplayMeta(state, theme);
    const handback = summary.normalizedResult?.status && summary.normalizedResult.status !== 'unknown'
      ? ` · ${summary.normalizedResult.status}/${summary.normalizedResult.confidence}`
      : '';
    // meta.label already prints "running"; don't repeat it. Show only the tool the
    // worker is currently in, so the row reads "… · running · bash" not "· running · running bash".
    const active = summary.activeTool ? ` · ${paint(theme, 'brand', summary.activeTool)}` : '';
    // Show what the worker is doing: total tool calls + the distinct tools it has used.
    const callCount = record.toolCalls.length;
    const toolNames = [...new Set(record.toolCalls.map((call) => call.toolName).filter(Boolean))].slice(0, 4);
    const toolsInfo = callCount > 0
      ? ` · ${callCount} call${callCount === 1 ? '' : 's'}${toolNames.length ? ` [${toolNames.join(',')}${new Set(record.toolCalls.map((c) => c.toolName)).size > toolNames.length ? ',…' : ''}]` : ''}`
      : '';
    const modelInfo = ` · ${formatAgentModelLine(summary)}`;
    const taskInfo = summary.task
      ? ` · ${paint(theme, 'muted', `task ${summary.task.replace(/\s+/g, ' ').slice(0, 64)}`)}`
      : '';
    const planInfo = summary.planStep
      ? ` · ${paint(theme, 'symbol', `plan ${summary.planStep.replace(/\s+/g, ' ').slice(0, 48)}`)}`
      : '';
    // Stable queued indicator: reveal turns queued behind a running worker, or a
    // multi-deep queue. A single queued turn on a non-running worker already shows
    // via the 'queued' state label, so it is not duplicated here.
    const pending = summary.pendingMessages ?? 0;
    const queuedInfo = pending > 0 && (state !== 'queued' || pending > 1)
      ? ` · ${paint(theme, 'link', `queued ${pending}`)}`
      : '';
    const worktreeInfo = formatWorktreeState(summary.worktree);
    const latestEvent = summary.ledgerEvents.at(-1)?.message;
    const result = summary.normalizedResult?.result ?? summary.normalizedResult?.next ?? summary.lastOutput ?? latestEvent;
    const live = !isTerminal(record) && record.deltaSummary ? record.deltaSummary : undefined;
    const previewText = live ?? result;
    const preview = previewText ? ` — ${previewText.replace(/\n/g, ' ').slice(0, 90)}${!live && summary.outputTruncated ? '…' : ''}` : '';
    const name = paint(theme, 'brand', summary.name);
    const id = paint(theme, 'dim', shortId(summary.agentId));
    const elapsed = formatElapsed(record.startedAt, isTerminal(record) ? record.updatedAt : undefined);
    lines.push(`${meta.icon} ${name} (${id}) · ${meta.label}${handback}${queuedInfo}${modelInfo}${taskInfo}${planInfo}${active}${toolsInfo}${worktreeInfo} · ${elapsed}${paint(theme, 'dim', preview)}`);
  }
  if (records.length > limit) lines.push(paint(theme, 'muted', `… ${records.length - limit} more; use agent inspect for full details.`));
  // Clip at the source when a width is known — pi errors on over-wide lines.
  return width ? lines.map((l) => truncateToWidth(l, width)) : lines;
}

export function formatAgentLedgerDetails(limit = 10): string {
  return buildAgentLedgerLines(limit).join('\n');
}

export function setAgentLedgerMetricsRefreshForUi(cb: ((ctx?: PiContext) => void) | undefined): void {
  agentLedgerMetricsRefresh = cb;
}

function refreshAgentFooterMetrics(ctx?: PiContext): void {
  try {
    agentLedgerMetricsRefresh?.(ctx);
  } catch {
    // Footer refresh is best-effort UI work; ledger state must remain authoritative.
  }
}

/** Repaint the single persistent agent projection in the unified footer. */
export function refreshAgentLedgerUi(ctx?: PiContext): void {
  const records = [...agents.values()];
  if (records.length === 0 || getLedgerHidden()) {
    stopLedgerTicker();
    refreshAgentFooterMetrics(ctx);
    return;
  }
  if (!getActiveAgentUi(ctx)) return;
  refreshAgentFooterMetrics(ctx);
  // Live refresh: while any worker is active, advance the spinner and re-render
  // every second on the shared ui-ticker clock (one timer process-wide).
  const anyActive = records.some((r) => !isTerminal(r));
  if (anyActive && !hasUiTickSubscriber(LEDGER_TICK_KEY)) {
    setUiTickSubscriber(LEDGER_TICK_KEY, () => {
      ledgerSpinnerFrame = (ledgerSpinnerFrame + 1) % LEDGER_SPINNER.length;
      if ([...agents.values()].some((r) => !isTerminal(r))) {
        refreshAgentLedgerUi(ctx);
      } else {
        stopLedgerTicker();
      }
    });
  } else if (!anyActive) {
    stopLedgerTicker();
  }
}

// Wire rendering callbacks into the process module so spawnRpcAgent's
// event handlers can call refreshAgentLedgerUi without a circular import.
// Function declarations are hoisted, so this is safe even though
// refreshAgentLedgerUi and stopLedgerTicker are defined above.
wireProcessCallbacks(refreshAgentLedgerUi, stopLedgerTicker);
