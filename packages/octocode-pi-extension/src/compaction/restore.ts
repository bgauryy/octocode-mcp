import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ExtensionAPI, ExtensionContext, SessionBeforeCompactEvent } from '@earendil-works/pi-coding-agent';
import { contextReads, seenFiles, RESTORED_FILES_TYPE } from '../files/reads.js';
import type { FileGuard } from '../files/tool.js';
import { sha256 } from '../shared/atomic.js';
import { canonicalPath } from '../shared/home.js';
import { isRecord } from '../shared/util.js';

/**
 * After a compaction, the files the agent was working on are read again from disk and put back in its context, as
 * Claude Code does: the summary names them, but editing one would otherwise need a fresh `read` first (the file guard
 * refuses a change to a file whose read left the context). The few most recently read or changed in the summarized
 * part come back, each cut at a line boundary past a per-file budget, within a total budget sized to the window, and
 * count as read once the message is in the model's context (Pi holds a context-only message until the running turn
 * ends, so the guard records them when a model call first carries it, not when it is sent).
 */

/** At most this many files come back... */
export const RESTORE_MAX_FILES = 5;
/** ...each up to this many characters (longer ones are cut at a line, with a note)... */
export const RESTORE_FILE_CHARS = 20_000;
/** ...and all of them together up to this many (about 12k tokens)... */
export const RESTORE_TOTAL_CHARS = 50_000;
/** ...and at most this share of the window left after Pi's reserve. */
export const RESTORE_SHARE = 0.1;
/** A file that would get fewer characters than this is not read back: a stub counted as read helps no one. */
export const RESTORE_MIN_FILE_CHARS = 2_000;
/** Files larger than this are never read back (a generated or data file is no working context). */
const RESTORE_MAX_BYTES = 2_000_000;

type Preparation = Pick<SessionBeforeCompactEvent['preparation'], 'messagesToSummarize' | 'turnPrefixMessages'>;

/** The files read or changed in the summarized messages, most recent first. */
export function recentFiles(preparation: Preparation, cwd: string): string[] {
  const messages = [...preparation.messagesToSummarize, ...preparation.turnPrefixMessages].map((message, index) => ({ id: String(index), message }));
  return [...seenFiles(messages, cwd).values()].sort((a, b) => (b.at ?? 0) - (a.at ?? 0)).map((seen) => seen.file);
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

/** `text` cut at the last line boundary within `max` characters; whether it was cut. */
function headOf(text: string, max: number): { text: string; cut: boolean } {
  if (text.length <= max) return { text, cut: false };
  const end = text.lastIndexOf('\n', max);
  return { text: text.slice(0, end > 0 ? end + 1 : max), cut: true };
}

export interface Restored {
  /** The message body: each file in a `<file>` block. */
  content: string;
  files: Array<{ file: string; whole: boolean; sha256?: string; size?: number }>;
}

/**
 * Reads back up to `RESTORE_MAX_FILES` of `candidates` (most recent first) that the context does not show now
 * (`shown`), within the budgets. Undefined when none qualifies.
 */
export function restoreFiles(candidates: readonly string[], shown: ReadonlySet<string>, cwd: string, total = RESTORE_TOTAL_CHARS): Restored | undefined {
  const blocks: string[] = [];
  const files: Restored['files'] = [];
  let used = 0;
  for (const file of candidates) {
    const room = Math.min(RESTORE_FILE_CHARS, total - used);
    if (files.length >= RESTORE_MAX_FILES || room < RESTORE_MIN_FILE_CHARS) break;
    if (shown.has(canonicalPath(file))) continue;
    const text = textOf(file);
    if (text === undefined) continue;
    const head = headOf(text, room);
    if (head.text.length === 0 && text.length > 0) continue;
    const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
    const shownLines = head.text.split('\n').length - (head.text.endsWith('\n') ? 1 : 0);
    const display = path.relative(cwd, file).startsWith('..') ? file : path.relative(cwd, file);
    const note = head.cut ? `\n[… the file continues past line ${shownLines} of ${lines}; read it with an offset to see the rest]` : '';
    // The file's text stays exact; a file that itself contains `</file>` gets a tag it cannot close by accident.
    const tag = head.text.includes('</file') ? `file-${sha256(text).slice(0, 8)}` : 'file';
    blocks.push(`<${tag} path="${display}">\n${head.text}${head.text.endsWith('\n') || head.text === '' ? '' : '\n'}</${tag}>${note}`);
    files.push(head.cut ? { file, whole: false } : { file, whole: true, sha256: sha256(text), size: Buffer.byteLength(text) });
    used += head.text.length;
  }
  if (files.length === 0) return undefined;
  const intro = '[After compaction] The files you were working on, read again from disk just now. They count as read: you may edit them without reading them first.';
  return { content: `${intro}\n\n${blocks.join('\n\n')}`, files };
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
export function deliverRestoredFiles(pi: Pick<ExtensionAPI, 'sendMessage'>, pending: readonly string[], ctx: Pick<ExtensionContext, 'cwd' | 'sessionManager'>, total: number): PendingRestore | undefined {
  const shown = new Set(contextReads(ctx).map((read) => canonicalPath(read.file)));
  const restored = restoreFiles(pending, shown, ctx.cwd, total);
  if (!restored) return undefined;
  const id = randomUUID();
  try {
    pi.sendMessage({ customType: RESTORED_FILES_TYPE, content: restored.content, display: false, details: { id, files: restored.files.map((entry) => entry.file) } }, { triggerTurn: false });
  } catch {
    return undefined; // The session was replaced.
  }
  return { id, files: restored.files };
}

/** Records `pending`'s files in the guard when `messages` (a model call's) carry its message; true when they did. */
export function settleRestoredFiles(messages: readonly unknown[], pending: PendingRestore, guard: FileGuard): boolean {
  const carried = messages.some((message) => isRecord(message) && message['role'] === 'custom' && message['customType'] === RESTORED_FILES_TYPE && isRecord(message['details']) && message['details']['id'] === pending.id);
  if (!carried) return false;
  for (const entry of pending.files) guard.record(entry.file, entry.whole && entry.sha256 !== undefined && entry.size !== undefined ? { sha256: entry.sha256, size: entry.size } : undefined);
  return true;
}
