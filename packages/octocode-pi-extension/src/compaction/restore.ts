import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ExtensionAPI, ExtensionContext, SessionBeforeCompactEvent } from '@earendil-works/pi-coding-agent';
import { contextReads, seenFiles, RESTORED_FILES_TYPE, type WorkedFile } from '../files/reads.js';
import type { FileGuard } from '../files/tool.js';
import { sha256 } from '../shared/atomic.js';
import { canonicalPath } from '../shared/home.js';
import { cutText, isRecord } from '../shared/util.js';

/**
 * After a compaction, the files the agent was working on are read again from disk and put back in its context, as
 * Claude Code does: the summary names them, but editing one would otherwise need a fresh `read` first (the file guard
 * refuses a change to a file whose read left the context). The few most recently read or changed in the summarized
 * part come back, each within a per-file budget (a longer file shows the lines from where the agent last read or changed
 * it, with a note naming them), within a total budget sized to the window, and count as read once the message is in the model's context (Pi holds a context-only message until the running turn
 * ends, so the guard records them when a model call first carries it, not when it is sent).
 */

/** At most this many files come back (the few the work centered on; more would refill the context the summary freed)... */
export const RESTORE_MAX_FILES = 5;
/** ...each up to this many characters (about 5k tokens: a working file's relevant part; longer ones show whole lines from the last range worked on, with a note)... */
export const RESTORE_FILE_CHARS = 20_000;
/** ...and all of them together up to this many (about 12k tokens: well under the room a compaction frees on any common window)... */
export const RESTORE_TOTAL_CHARS = 50_000;
/** ...and at most this share of the window left after Pi's reserve (so a small model is not refilled to its threshold). */
export const RESTORE_SHARE = 0.1;
/** A file that would get fewer characters than this is not read back: a stub counted as read helps no one. */
export const RESTORE_MIN_FILE_CHARS = 2_000;
/** Files larger than this are never read back (a generated or data file is no working context, and reading it costs time). */
const RESTORE_MAX_BYTES = 2_000_000;

type Preparation = Pick<SessionBeforeCompactEvent['preparation'], 'messagesToSummarize' | 'turnPrefixMessages'>;

/**
 * The files read or changed in the summarized messages, most recently worked on first, each with the line the agent
 * last read from or changed. A file read back by an earlier compaction ranks by the work it stands for, not by when it
 * was read back, so it does not keep coming back ahead of newer work.
 */
export function recentFiles(preparation: Preparation, cwd: string): WorkedFile[] {
  const messages = [...preparation.messagesToSummarize, ...preparation.turnPrefixMessages].map((message, index) => ({ id: String(index), message }));
  return [...seenFiles(messages, cwd).values()]
    .sort((a, b) => (b.workedAt ?? 0) - (a.workedAt ?? 0))
    .map(({ file, workedAt, line }) => ({ file, ...(workedAt === undefined ? {} : { workedAt }), ...(line ? { line } : {}) }));
}

/** The text of `file` when it is a small UTF-8 text file, else undefined. */
function textOf(file: string): string | undefined {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > RESTORE_MAX_BYTES) return undefined;
    const data = fs.readFileSync(file);
    if (data.subarray(0, 8_192).includes(0)) return undefined;
    const text = data.toString('utf8');
    return text.includes('\uFFFD') ? undefined : text;
  } catch {
    return undefined;
  }
}

interface Window {
  text: string;
  /** First and last line shown (1-based), and the file's line count. */
  first: number;
  last: number;
  total: number;
  cut: boolean;
}

/**
 * Whole lines of `text` within `max` characters, starting at `line` (else the first line); a window that reaches the
 * end of the file with room left starts earlier. A start line longer than `max` alone is cut.
 */
function windowOf(text: string, max: number, line = 1): Window {
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const total = lines.length;
  if (text.length <= max) return { text, first: 1, last: total, total, cut: false };
  const start = Math.min(Math.max(line, 1), total) - 1;
  let first = start;
  let last = start;
  let used = 0;
  while (last < total && used + lines[last]!.length <= max) used += lines[last++]!.length;
  if (last === start) return { text: cutText(lines[start]!, max, { chars: true }), first: start + 1, last: start + 1, total, cut: true };
  while (last === total && first > 0 && used + lines[first - 1]!.length <= max) used += lines[--first]!.length;
  return { text: lines.slice(first, last).join(''), first: first + 1, last, total, cut: true };
}

export interface Restored {
  /** The message body: each file in a `<file>` block. */
  content: string;
  files: Array<{ file: string; whole: boolean; sha256?: string; size?: number }>;
  /** The work each restored file stands for, so the next compaction ranks it by that (`seenFiles`). */
  worked: WorkedFile[];
}

/**
 * Reads back up to `RESTORE_MAX_FILES` of `candidates` (most recent first) that the context does not show now
 * (`shown`), within the budgets. Undefined when none qualifies.
 */
export function restoreFiles(candidates: readonly WorkedFile[], shown: ReadonlySet<string>, cwd: string, total = RESTORE_TOTAL_CHARS): Restored | undefined {
  const blocks: string[] = [];
  const files: Restored['files'] = [];
  const worked: WorkedFile[] = [];
  let used = 0;
  for (const candidate of candidates) {
    const { file } = candidate;
    const room = Math.min(RESTORE_FILE_CHARS, total - used);
    if (files.length >= RESTORE_MAX_FILES || room < RESTORE_MIN_FILE_CHARS) break;
    if (shown.has(canonicalPath(file))) continue;
    const text = textOf(file);
    if (text === undefined) continue;
    const view = windowOf(text, room, candidate.line);
    if (view.text.length === 0 && text.length > 0) continue;
    const display = path.relative(cwd, file).startsWith('..') ? file : path.relative(cwd, file);
    const from = candidate.line && view.first > 1 ? ', from where you last read or changed it' : '';
    const note = view.cut ? `\n[… shown lines ${view.first}–${view.last} of ${view.total}${from}; read the file with an offset for the rest]` : '';
    // The file's text stays exact; a file that itself contains `</file>` gets a tag it cannot close by accident.
    const tag = view.text.includes('</file') ? `file-${sha256(text).slice(0, 8)}` : 'file';
    blocks.push(`<${tag} path="${display}">\n${view.text}${view.text.endsWith('\n') || view.text === '' ? '' : '\n'}</${tag}>${note}`);
    files.push(view.cut ? { file, whole: false } : { file, whole: true, sha256: sha256(text), size: Buffer.byteLength(text) });
    worked.push(candidate);
    used += view.text.length;
  }
  if (files.length === 0) return undefined;
  const intro = '[After compaction] The files you were working on, read again from disk just now. They count as read: you may edit them without reading them first.';
  return { content: `${intro}\n\n${blocks.join('\n\n')}`, files, worked };
}

/** Files sent back to the context, recorded in the guard once a model call carries the message (`settleRestoredFiles`). */
export interface PendingRestore {
  id: string;
  files: Restored['files'];
}

/**
 * Puts `pending` (from `recentFiles`, taken before the compaction) back into the context right after it, as a hidden
 * message, within `total` characters. Run it after the guard was rebuilt from the compacted context; returns what to
 * record once the message is delivered.
 */
export function deliverRestoredFiles(pi: Pick<ExtensionAPI, 'sendMessage'>, pending: readonly WorkedFile[], ctx: Pick<ExtensionContext, 'cwd' | 'sessionManager'>, total: number): PendingRestore | undefined {
  const shown = new Set(contextReads(ctx).map((read) => canonicalPath(read.file)));
  const restored = restoreFiles(pending, shown, ctx.cwd, total);
  if (!restored) return undefined;
  const id = randomUUID();
  try {
    const partial = restored.files.filter((entry) => !entry.whole).map((entry) => entry.file);
    const details = { id, files: restored.files.map((entry) => entry.file), ...(partial.length > 0 ? { partial } : {}), worked: restored.worked };
    pi.sendMessage({ customType: RESTORED_FILES_TYPE, content: restored.content, display: false, details }, { triggerTurn: false });
  } catch {
    return undefined; // The session was replaced.
  }
  return { id, files: restored.files };
}

/** Records `pending`'s files in the guard when `messages` (a model call's) carry its message; true when they did. */
export function settleRestoredFiles(messages: readonly unknown[], pending: PendingRestore, guard: FileGuard): boolean {
  const carried = messages.some((message) => isRecord(message) && message['role'] === 'custom' && message['customType'] === RESTORED_FILES_TYPE && isRecord(message['details']) && message['details']['id'] === pending.id);
  if (!carried) return false;
  for (const entry of pending.files) {
    const known = entry.whole && entry.sha256 !== undefined && entry.size !== undefined ? { sha256: entry.sha256, size: entry.size } : undefined;
    guard.record(entry.file, known, !entry.whole);
  }
  return true;
}
