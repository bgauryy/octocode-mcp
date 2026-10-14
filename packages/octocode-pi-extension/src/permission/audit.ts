import { isRecord } from '../shared/util.js';
import { auditLine } from './effect.js';
import { ACTION_CLASSES, ASK_REASONS, PERMISSION_MODES, type ActionClass, type ActionCount, type AskReason, type PermissionMode } from './mode.js';

/** The `via` of an entry a parent writes when it answers its subagent's prompt itself: the child's own entry counts the call. */
export const RELAY_VIA = 'relay';
/** Starts the `notify` message a subagent sends for each of its audit entries (the rest is the entry as JSON). */
export const AUDIT_NOTIFY_PREFIX = 'octocode-audit/1 ';

/** Audit entries a session writes before the rest are rolled up (`suppressed: <n> by action`). */
export const AUDIT_CEILING = 5000;
/** Suppressed entries between two rollup writes, so a crash loses at most this many counts. */
const ROLLUP_EVERY = 500;

/** Actions that carry a ⚠ in the footer counter, the activity line and the exit summary: they cannot be undone cheaply or reach beyond the repository. */
export const WARN_ACTIONS: ReadonlySet<string> = new Set<ActionClass>(['shell.destructive', 'browser.control', 'net.private']);

/** One audit entry (`pi.appendEntry`, never sent to the model). */
export interface AuditEntry {
  at: number;
  mode: PermissionMode;
  /** The effect; `call` when a reason forces a tool with no class; `mode` a mode change; `invariant` a refusal no mode skips; `rollup` the entries left out. */
  action: ActionClass | 'call' | 'mode' | 'invariant' | 'rollup';
  /** Provenance, hook and profile reasons that applied to the call (forcing or not). */
  reasons?: readonly AskReason[];
  /** Up to five targets, one line each, redacted, then `+n more`. */
  what: string[];
  /** What the agent said it was for (unverified, at most 160 characters). */
  purpose?: string;
  /** Which agent issued it. */
  agent: string;
  allowed: boolean;
  via: string;
  note?: string;
  /** The snapshot ref taken before a destructive shell call. */
  snapshot?: string;
  /** On a rollup: the entries left out, by action. */
  suppressed?: Record<string, number>;
}

const isCall = (entry: AuditEntry): boolean => entry.action !== 'mode' && entry.action !== 'rollup' && entry.via !== RELAY_VIA;

const ENTRY_ACTIONS: readonly string[] = [...ACTION_CLASSES, 'call', 'mode', 'invariant', 'rollup'];

/**
 * A subagent's audit entry from its `notify` message, as the parent records it: every field validated and cut to the
 * bounds of an entry of its own, and `agent` always the child's name from the process the message arrived on (never the
 * child's claim). Undefined when the message is not an entry.
 */
export function childAuditEntry(message: string, agent: string): AuditEntry | undefined {
  if (!message.startsWith(AUDIT_NOTIFY_PREFIX)) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(message.slice(AUDIT_NOTIFY_PREFIX.length));
  } catch {
    return undefined;
  }
  if (!isRecord(raw) || typeof raw['action'] !== 'string' || !ENTRY_ACTIONS.includes(raw['action'])) return undefined;
  const mode = PERMISSION_MODES.find((each) => each === raw['mode']);
  if (!mode || typeof raw['allowed'] !== 'boolean' || typeof raw['via'] !== 'string' || !Array.isArray(raw['what'])) return undefined;
  const at = typeof raw['at'] === 'number' && Number.isFinite(raw['at']) ? raw['at'] : Date.now();
  const text = (value: unknown): string | undefined => (typeof value === 'string' ? auditLine(value) : undefined);
  const reasons = Array.isArray(raw['reasons']) ? ASK_REASONS.filter((reason) => (raw['reasons'] as unknown[]).includes(reason)) : [];
  const suppressed = isRecord(raw['suppressed'])
    ? Object.fromEntries(Object.entries(raw['suppressed']).filter((pair): pair is [string, number] => typeof pair[1] === 'number').slice(0, ACTION_CLASSES.length + 4))
    : undefined;
  const purpose = text(raw['purpose']);
  const note = text(raw['note']);
  const snapshot = text(raw['snapshot']);
  return {
    at, mode, action: raw['action'] as AuditEntry['action'],
    ...(reasons.length > 0 ? { reasons } : {}),
    what: raw['what'].filter((line): line is string => typeof line === 'string').slice(0, 6).map(auditLine),
    ...(purpose ? { purpose } : {}),
    agent: auditLine(agent),
    allowed: raw['allowed'],
    via: auditLine(raw['via']).slice(0, 40),
    ...(note ? { note } : {}),
    ...(snapshot ? { snapshot } : {}),
    ...(suppressed ? { suppressed } : {}),
  };
}

/**
 * The session's audit entries and their tallies. Every entry counts; past `ceiling` the routine allowed ones are not
 * written but counted into rollups. A denial, a mode change and a ⚠ action are always written.
 */
export class AuditLog {
  #written = 0;
  #sinceRollup = 0;
  readonly #suppressed = new Map<string, number>();
  readonly #byAction = new Map<string, number>();
  readonly #warned: string[] = [];
  readonly #snapshots: string[] = [];
  #unshownWarned = 0;
  #ran: ActionCount = { actions: 0, warnings: 0 };

  constructor(
    private readonly write: (entry: AuditEntry) => void,
    private readonly ceiling = AUDIT_CEILING,
  ) {}

  /** A new session start: tallies reset; `existing` entries (a resumed session's) already count toward the ceiling. */
  reset(existing = 0): void {
    this.#written = existing;
    this.#sinceRollup = 0;
    this.#suppressed.clear();
    this.#byAction.clear();
    this.#warned.length = 0;
    this.#snapshots.length = 0;
    this.#unshownWarned = 0;
    this.#ran = { actions: 0, warnings: 0 };
  }

  /** Calls full mode ran this session. */
  get count(): ActionCount {
    return this.#ran;
  }

  record(entry: AuditEntry): void {
    const warn = WARN_ACTIONS.has(entry.action);
    if (isCall(entry) && entry.allowed) {
      this.#byAction.set(entry.action, (this.#byAction.get(entry.action) ?? 0) + 1);
      if (entry.mode === 'full') this.#ran = { actions: this.#ran.actions + 1, warnings: this.#ran.warnings + (warn ? 1 : 0) };
      if (warn) {
        if (this.#warned.length < this.ceiling) this.#warned.push(`${entry.action}: ${entry.what[0] ?? ''}`);
        else this.#unshownWarned += 1;
      }
      if (entry.snapshot) this.#snapshots.push(entry.snapshot);
    }
    const routine = isCall(entry) && entry.allowed && !warn;
    if (routine && this.#written >= this.ceiling) {
      this.#suppressed.set(entry.action, (this.#suppressed.get(entry.action) ?? 0) + 1);
      this.#sinceRollup += 1;
      if (this.#sinceRollup >= ROLLUP_EVERY) this.flush(entry.at, entry.mode, entry.agent);
      return;
    }
    this.#written += 1;
    this.write(entry);
  }

  /** Writes the rollup of the entries left out so far (no-op when none). */
  flush(at = Date.now(), mode: PermissionMode = 'full', agent = 'main'): void {
    if (this.#suppressed.size === 0 || this.#sinceRollup === 0) return;
    this.#sinceRollup = 0;
    const suppressed = Object.fromEntries(this.#suppressed);
    const total = [...this.#suppressed.values()].reduce((sum, count) => sum + count, 0);
    this.write({ at, mode, action: 'rollup', what: [`suppressed: ${total} by action`], agent, allowed: true, via: 'mode', suppressed });
  }

  /** Counts of allowed calls by action: `shell × 12, web × 3`. */
  tally(): string {
    return [...this.#byAction].map(([action, count]) => `${action} × ${count}`).join(', ');
  }

  /**
   * What a run with no UI prints when it ends: the counts by action, every ⚠ action and the snapshot refs; undefined
   * when nothing ran.
   */
  summary(): string | undefined {
    if (this.#byAction.size === 0) return undefined;
    return [
      `octocode: permission summary: ${this.tally()}`,
      ...this.#warned.map((line) => `  ⚠ ${line}`),
      ...(this.#unshownWarned > 0 ? [`  ⚠ +${this.#unshownWarned} more not listed (see the session file)`] : []),
      ...(this.#snapshots.length > 0 ? [`  snapshots: ${this.#snapshots.join(', ')}`] : []),
    ].join('\n');
  }
}
