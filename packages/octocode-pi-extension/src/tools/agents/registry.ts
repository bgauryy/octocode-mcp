/**
 * Agent registry: the canonical `agents` Map, process-factory singleton, record predicates,
 * lookup helpers, eviction/pruning, and test seams.
 *
 * Depends only on: types, worktree (for test seam), node builtins.
 * No imports from agent-tools, ledger, or any other agents sub-module.
 *
 * NOTE: installProcessCleanupHandlers and cleanupSpawnedAgentsForShutdown remain in
 * agent-tools.ts for this step because cleanupSpawnedAgentsForShutdown is exported
 * from agent-tools.ts and imported by src/index.ts and other callers outside scope.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { setWorktreeGitRunnerForTests } from '../worktree.js';
import {
  type AgentRecord,
  type AgentProcessFactory,
  type AgentStatus,
  MAX_AGENT_RECORDS,
} from './types.js';

// ─── Module-level singletons ────────────────────────────────────────────────────

/** The canonical agent registry: one entry per spawned worker across the session. */
export const agents = new Map<string, AgentRecord>();

let processFactory: AgentProcessFactory = (command, args, options) =>
  spawn(command, args, options) as unknown as ReturnType<AgentProcessFactory>;

/** Whether the footer/widget ledger is hidden for the current session. */
let ledgerHidden = false;

// ─── Accessors for module-level state ───────────────────────────────────────────

export function getProcessFactory(): AgentProcessFactory { return processFactory; }
export function getLedgerHidden(): boolean { return ledgerHidden; }
export function setLedgerHidden(value: boolean): void { ledgerHidden = value; }

// ─── Predicates ───────────────────────────────────────────────────────────────

/**
 * True when running inside a spawned worker process (marked via SUBAGENT_ENV_VAR).
 * Workers must not register any agent-spawning tool — recursive spawning is forbidden.
 */
export function isSubagentProcess(): boolean {
  return process.env['OCTOCODE_PI_SUBAGENT'] === '1';
}

/** wait() resolves at end-of-turn: idle counts as "done for now", plus true terminals. */
export function isTerminal(record: { status: AgentStatus; pendingMessages?: number }): boolean {
  // A worker with a queued-but-unstarted turn is not terminal: wait must keep
  // blocking and the display must not render it as idle/done.
  if ((record.pendingMessages ?? 0) > 0) return false;
  return ['idle', 'exited', 'failed', 'killed'].includes(record.status);
}

/**
 * Safe to drop from the registry WITHOUT killing: the child process is gone.
 * `idle` is NOT droppable — an idle worker's process is still alive to accept
 * send/steer/followUp, so evicting or shutdown-skipping it would orphan the child.
 */
export function isDroppable(record: AgentRecord): boolean {
  if (
    record.worktree &&
    record.worktree.mergeState !== 'clean' &&
    record.worktree.mergeState !== 'merged' &&
    record.worktree.mergeState !== 'discarded'
  ) return false;
  return ['exited', 'failed', 'killed'].includes(record.status);
}

/**
 * Whether the underlying OS process is still running (authoritative, sync).
 * A real ChildProcess reports null for both while running; test mocks may leave
 * them undefined — treat null/undefined (== null) as "still running".
 */
export function isProcessAlive(record: AgentRecord): boolean {
  return record.process.exitCode == null && record.process.signalCode == null;
}

// ─── Lookup ───────────────────────────────────────────────────────────────────

export function findAgentByIdOrPrefix(agentId: unknown): AgentRecord | undefined {
  const id = String(agentId ?? '').trim();
  if (!id) return undefined;
  return agents.get(id) ?? [...agents.values()].find((record) => record.id.startsWith(id));
}

export function getAgent(agentId: unknown): AgentRecord {
  const id = String(agentId ?? '').trim();
  if (!id) throw new Error(
    'agent requires agentId for lifecycle operations except inspect. '
    + 'Use type:"inspect" to see all active agents.',
  );
  const record = findAgentByIdOrPrefix(id);
  if (!record) throw new Error(
    `No agent found with id: ${id.slice(0, 16)}${id.length > 16 ? '\u2026' : ''}. `
    + `Use type:"inspect" to see all active agents (${agents.size} registered).`,
  );
  return record;
}

export function activeAgentCount(): number {
  return [...agents.values()].filter((record) => !isDroppable(record)).length;
}

// ─── Prompt-file cleanup (local; moves to process.ts in a later decomposition step) ───

function removePromptFiles(record: AgentRecord): void {
  for (const filePath of record.promptFiles) {
    try {
      fs.rmSync(path.dirname(filePath), { recursive: true, force: true });
    } catch {
      // best-effort cleanup only
    }
  }
  record.promptFiles = [];
}

// ─── Eviction / pruning ───────────────────────────────────────────────────────

export function evictStaleAgents(): void {
  if (agents.size <= MAX_AGENT_RECORDS) return;
  // Only evict records whose process is truly gone — never silently drop an
  // alive (running/idle/starting) worker, which would orphan the child process.
  const droppable = [...agents.entries()]
    .filter(([, r]) => isDroppable(r))
    .sort(([, a], [, b]) => a.updatedAt - b.updatedAt || a.startedAt - b.startedAt);
  while (agents.size > MAX_AGENT_RECORDS && droppable.length > 0) {
    const [id, record] = droppable.shift()!;
    removePromptFiles(record);
    agents.delete(id);
  }
}

/**
 * Drop every droppable (exited/failed/killed) agent record. Called on
 * session_start so a new session does not inherit dead worker rows from a
 * previous session in the same long-lived process. Alive/idle workers are
 * preserved — their process is still up.
 */
export function pruneDroppableAgentsForSession(): number {
  let removed = 0;
  for (const [id, record] of [...agents.entries()]) {
    if (!isDroppable(record)) continue;
    removePromptFiles(record);
    agents.delete(id);
    removed += 1;
  }
  return removed;
}

// ─── Test seams ─────────────────────────────────────────────────────────────────

export function setAgentProcessFactoryForTests(factory: AgentProcessFactory | null): void {
  processFactory = factory ?? ((command, args, options) => spawn(command, args, options) as unknown as ReturnType<AgentProcessFactory>);
  setWorktreeGitRunnerForTests(null);
  agents.clear();
  ledgerHidden = false;
}

