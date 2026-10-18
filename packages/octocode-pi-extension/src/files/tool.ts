import fs from 'node:fs';
import path from 'node:path';
import {
  createEditToolDefinition,
  createWriteToolDefinition,
  withFileMutationQueue,
  type ExtensionAPI,
  type ExtensionToolContext,
} from '@earendil-works/pi-coding-agent';
import { Type, type Static } from 'typebox';
import { atomicWriteFile, changedOnDisk, sha256, sha256File } from '../shared/atomic.js';
import { canonicalPath, isWithin, resolveToolPath, workspaceRoot } from '../shared/home.js';
import type { Permission } from '../permission/ask.js';
import { systemLines } from '../permission/effect.js';
import { runsLater, stateFolderRefusal } from '../permission/gate.js';
import { describeRanges, firstGap, lineCount, mergeRanges, readView, type LineRange } from './coverage.js';
import { lastUserEntry, type Capture, type Checkpoints } from './checkpoint.js';
import { notify } from '../shared/commands.js';
import { askReview } from './review.js';
import { timedTool } from '../shared/render.js';
import { renderFileCall, renderFileResult, type QueryOutcome } from './render.js';
import { readPaths } from '../shared/home.js';
import { contentText, elisionMarkers, errorMessage, escapeRegExp, isRecord } from '../shared/util.js';

/**
 * Octocode's `file` tool: batched edit / write / delete queries, each with a
 * reasoning line. Edits and writes run through Pi's own engines (exact-match
 * replacement, diffs, per-file mutation queue) but write atomically (temp file + rename) and only over the bytes
 * they checked. A file read with Pi's `read`, or changed by this
 * tool, that changed on disk since then must be read again before a write or delete; an edit re-validates each oldText
 * against the current content and applies when each still matches exactly once. A file whose earlier read left the
 * context (compaction, a branch switch, a rewind that restored it) must be read again before
 * it is changed, even if the disk did not move.
 *
 * Paths are checked against the workspace first: Octocode's own state folder (the Octocode home, holding trust
 * decisions, memory and sessions) is never changed, and a path outside the repository is a `file.outside` permission
 * ask. In `manual` mode the batch's review dialog is its `file.workspace` ask.
 *
 * A read is recorded by stat (size, mtime, ctime, inode) of the canonical path, without reading the file again; its
 * digest is known only when the read returned the whole file (Pi's read) or the file tool wrote it, and is then
 * checked against the bytes the change reads anyway. Residual race: a file changed between the read tool reading it
 * and the stat here is taken as read (unless its digest was known from the returned text).
 */

interface Snapshot {
  mtimeMs: number;
  ctimeMs: number;
  size: number;
  ino: number;
  mode: number;
  sha256?: string;
  /** The read showed a range or a truncated view, not the whole file. */
  partial?: boolean;
  /** For a partial view: the lines the reads showed so far (merged); a write needs them to cover the file. */
  lines?: LineRange[];
}

/** Content known without reading the file again (e.g. what was just written). */
interface KnownContent {
  sha256: string;
  size: number;
}

/** What this tool's last write put on disk: the digest and size, and the line count. */
interface WrittenContent extends KnownContent {
  lines: number;
}

interface Inspection {
  refusal?: string;
  /** The file's stat now; undefined when it does not exist. */
  current?: Snapshot;
  /** The digest the file's bytes must still have (known from the read or the last write), if any. */
  expected?: string;
  /** A write only: the lines the reads showed, when they did not show the whole file (see `unseenRefusal`). */
  lines?: readonly LineRange[];
  /** An edit only: the file changed since the read, so each oldText must be re-validated against its current content. */
  stale?: true;
}

/**
 * Why an edit's anchors do not fit `content` exactly: the first oldText that is gone or matches more than once, named,
 * with the instruction to read the file again. Undefined when each matches exactly once.
 */
function lostAnchor(display: string, edits: ReadonlyArray<{ oldText: string }>, content: string): string | undefined {
  for (const [index, { oldText }] of edits.entries()) {
    const count = oldText === '' ? 0 : content.split(oldText).length - 1;
    if (count === 1) continue;
    const shown = JSON.stringify(oldText.length > 60 ? `${oldText.slice(0, 60)}…` : oldText);
    return `${display} changed on disk since you last read it and edits[${index}] (oldText ${shown}) ${count === 0 ? 'is no longer in it' : `now matches ${count} times`}. Read it again with \`read\` before editing it.`;
  }
  return undefined;
}

function staleRefusal(display: string): string {
  return `${display} changed on disk since you last read it. Read it again with \`read\` before modifying it.`;
}

function unreadRefusal(display: string): string {
  return `${display} already exists and was not read in this session. Read it with \`read\` before modifying it.`;
}

/**
 * Why a full write over `data` is refused when the reads showed only `lines`: the first line never seen, and what to do
 * (`read` reaches any line with an offset, so this never asks for a whole-file read a big file cannot give). Undefined
 * when the reads covered every line.
 */
function unseenRefusal(display: string, lines: readonly LineRange[], data: Buffer): string | undefined {
  const count = lineCount(data);
  const gap = firstGap(lines, count);
  if (gap === undefined) return undefined;
  return `${display}: a write replaces the whole file, but you have seen ${describeRanges(lines)} of its ${count} lines. Read the rest with \`read\` (offset=${gap}) until every line has been read, or use an edit to change part of it.`;
}

/**
 * What the bytes about to change say against what the guard knows (`inspection`, from `FileGuard.inspect`): `changed`
 * when they differ from what the read saw, and a refusal when a write or delete follows such a change, or a write
 * replaces lines the reads never showed. An edit over changes is not refused here: its anchors are re-validated.
 */
function judgeChange(display: string, mode: 'edit' | 'write' | 'delete', inspection: Inspection, data: Buffer | undefined, checked: string | null): { changed: boolean; refusal?: string } {
  const { stale, expected, lines } = inspection;
  const changed = stale === true || (expected !== undefined && expected !== checked);
  if (changed && mode !== 'edit') return { changed, refusal: staleRefusal(display) };
  const unseen = lines && data ? unseenRefusal(display, lines, data) : undefined;
  return unseen ? { changed, refusal: unseen } : { changed };
}

function rereadRefusal(display: string): string {
  return `${display}: your earlier read of it is no longer in your context. Read it again with \`read\` before modifying it.`;
}

export class FileGuard {
  readonly #seen = new Map<string, Snapshot>();
  /** Files whose read left the context: changing them needs a fresh read first. */
  readonly #reread = new Set<string>();
  /** Files whose read is in the context but that were modified after it (known only by time, not by a snapshot). */
  readonly #changed = new Set<string>();
  /** Set by the team layer: why another agent's reservation forbids changing `file`, if it does. */
  reservedBy: ((file: string) => string | undefined) | undefined;

  /**
   * Remember the file as read now (stat only). `known`: its content digest when the caller has it (kept if the size
   * agrees). `partial`: the read showed a range or a cut view, so a write needs the reads to cover every line (`lines`
   * is what this read showed, when known); an edit or a delete does not. Reads of an unchanged file add up: a later
   * range joins the earlier ones, and never takes back a whole read.
   */
  record(file: string, known?: KnownContent, partial = false, lines?: LineRange): void {
    const real = canonicalPath(file);
    const stat = statOf(real);
    this.#reread.delete(real);
    // A read lifts the stale flag, but a range of a file that changed after its recorded read shows only that range of
    // the current file: the earlier ranges describe other bytes, so they are not carried over.
    const wasStale = this.#changed.delete(real);
    if (!stat) {
      this.#seen.delete(real);
      return;
    }
    const before = this.#seen.get(real);
    const same = !wasStale && before !== undefined && before.mtimeMs === stat.mtimeMs && before.ctimeMs === stat.ctimeMs && before.size === stat.size && before.ino === stat.ino;
    if (partial && same && !before.partial) return;
    const covered = partial ? mergeRanges(same ? (before.lines ?? []) : [], lines) : undefined;
    this.#seen.set(real, { ...stat, ...(known && known.size === stat.size ? { sha256: known.sha256 } : {}), ...(covered ? { partial: true, lines: covered } : {}) });
  }

  /**
   * Record the file after this tool's own edit: its content digest is known (`known`), but the agent has seen only what
   * its earlier reads showed, so a partial read stays partial. The ranges stay when the edit kept the line count
   * (`lineDelta` 0); a different count moved the lines below the edit, so they are dropped and the reads start over.
   * A file with no recorded read is not known to be seen at all.
   */
  edited(file: string, known: KnownContent | undefined, lineDelta: number | undefined): void {
    const real = canonicalPath(file);
    const before = this.#seen.get(real);
    this.record(real, known);
    const now = this.#seen.get(real);
    if (!now || (before && !before.partial)) return;
    this.#seen.set(real, { ...now, partial: true, lines: lineDelta === 0 ? (before?.lines ?? []) : [] });
  }

  /** The file's bytes changed after its read that the guard records (an edit applied over outside changes): a write or delete needs a fresh read. */
  stale(file: string): void {
    this.#changed.add(canonicalPath(file));
  }

  /** Forget one file, e.g. after /octocode rewind replaced it: the model must read it again before writing it. */
  forget(file: string): void {
    const real = canonicalPath(file);
    this.#seen.delete(real);
    this.#changed.delete(real);
    this.#reread.add(real);
  }

  /**
   * Rebuild the memory from what the context shows now (see `contextReads`), after a session start (resume, reload,
   * fork), compaction or branch switch. A file read earlier but no longer in view must be read again. One in view
   * counts as read when it was not modified after the read (`at`, ms); otherwise it is stale.
   */
  restore(inContext: Iterable<{ file: string; at: number; partial?: boolean; lines?: readonly LineRange[] }>): void {
    for (const real of this.#seen.keys()) this.#reread.add(real);
    this.#seen.clear();
    this.#changed.clear();
    for (const { file, at, partial, lines } of inContext) {
      const real = canonicalPath(file);
      const stat = statOf(real);
      if (!stat) continue;
      this.#reread.delete(real);
      if (Math.max(stat.mtimeMs, stat.ctimeMs) <= at) this.#seen.set(real, { ...stat, ...(partial ? { partial, lines: mergeRanges(lines ?? []) } : {}) });
      else this.#changed.add(real);
    }
  }

  /**
   * Returns an error message when the mutation must be refused, else undefined. An existing file must have been read
   * (or written by this tool) in this session, and not changed on disk or left the context since; a new file is free.
   * A write also needs every line of the file read (in one read or several); an edit does not, because its exact match
   * proves the edited region was seen, and a delete needs only proof that the read was of the current file.
   * `runQuery` applies the same two steps (`inspect`, then `judgeChange` over the bytes it reads); this runs them for
   * callers that only ask (the guard's tests).
   */
  check(file: string, mode: 'edit' | 'write' | 'delete', display: string): string | undefined {
    const inspection = this.inspect(file, mode, display);
    if (inspection.refusal) return inspection.refusal;
    try {
      const data = inspection.current ? fs.readFileSync(file) : undefined;
      return judgeChange(display, mode, inspection, data, data ? sha256(data) : null).refusal;
    } catch {
      return staleRefusal(display);
    }
  }

  /**
   * Like check, by stat alone (no read). Also returns the current stat and the digest the file must still have; the
   * caller verifies that against the bytes it reads for the change.
   */
  inspect(file: string, mode: 'edit' | 'write' | 'delete', display: string): Inspection {
    const reserved = this.reservedBy?.(file);
    if (reserved) return { refusal: reserved };
    const real = canonicalPath(file);
    const current = statOf(real);
    if (!current) return mode === 'edit' || mode === 'delete' ? { refusal: `${display} does not exist.` } : {};
    if (this.#reread.has(real)) return { refusal: rereadRefusal(display) };
    const edit = mode === 'edit';
    if (this.#changed.has(real)) return edit ? { current, stale: true } : { refusal: staleRefusal(display) };
    const seen = this.#seen.get(real);
    if (!seen) return { refusal: unreadRefusal(display) };
    // ctime and inode also move on a same-size rewrite that restored the mtime, or a rename over the file. With a
    // known digest a same-size move is left to the content check (a touch or a no-op rewrite is not a change).
    const moved = seen.mtimeMs !== current.mtimeMs || seen.ctimeMs !== current.ctimeMs || seen.size !== current.size || seen.ino !== current.ino;
    if (moved && (!seen.sha256 || seen.size !== current.size)) return edit ? { current, stale: true } : { refusal: staleRefusal(display) };
    return { current, ...(seen.sha256 ? { expected: seen.sha256 } : {}), ...(seen.partial && mode === 'write' ? { lines: seen.lines ?? [] } : {}) };
  }
}

function statOf(file: string): Snapshot | undefined {
  try {
    const stat = fs.statSync(file);
    return stat.isFile() ? { mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, size: stat.size, ino: stat.ino, mode: stat.mode } : undefined;
  } catch {
    return undefined;
  }
}

const warnedCheckpoints = new WeakSet<Checkpoints>();

/**
 * Records a change in the checkpoint without failing the change itself. A failure means /octocode rewind would miss this file,
 * so it is noted in the outcome and notified once per session.
 */
async function settleCheckpoint(ctx: ExtensionToolContext, checkpoints: Checkpoints | undefined, capture: Capture | undefined, file: string, ok: boolean, after?: string | null): Promise<string> {
  if (!checkpoints || !capture) return '';
  try {
    await checkpoints.settle(file, capture, ok, after);
    return '';
  } catch (error) {
    if (!warnedCheckpoints.has(checkpoints)) {
      warnedCheckpoints.add(checkpoints);
      if (ctx.ui) notify(ctx.ui, `Octocode could not save a checkpoint (${errorMessage(error)}); /octocode rewind may not restore changed files.`, 'warning');
    }
    return ' (checkpoint not saved: /octocode rewind will not restore this change)';
  }
}

const QuerySchema = Type.Object({
  reasoning: Type.String({ description: 'Why this change is needed, in one sentence' }),
  // A plain string enum (what pi-ai's StringEnum emits) keeps the schema portable across providers.
  type: Type.Unsafe<'edit' | 'write' | 'delete'>({
    type: 'string',
    enum: ['edit', 'write', 'delete'],
    description: 'edit: exact replacements in an existing file; write: create or fully replace a file; delete: remove a file (irreversible; only when the task requires it)',
  }),
  path: Type.String({ description: 'File path, relative to the working directory or absolute' }),
  edits: Type.Optional(
    Type.Array(
      Type.Object({
        oldText: Type.String({ description: 'Exact text to replace; unique in the original file; keep it small' }),
        newText: Type.String({ description: 'Replacement text' }),
      }),
      { description: 'For edit: all replacements for this file, matched against the original content; must not overlap' },
    ),
  ),
  content: Type.Optional(Type.String({ description: 'For write: the complete new file content' })),
});

const Params = Type.Object({ queries: Type.Array(QuerySchema) });
type FileQuery = Static<typeof QuerySchema>;


/**
 * Filesystem operations for Pi's edit and write engines: writes are atomic and succeed only if the file still holds
 * what was checked (`checked`: the digest of `initial`, the bytes already read for this change; null = still absent).
 * Pi's first read of that file is served from `initial` instead of the disk.
 */
function guardedOperations(display: string, checked: string | null, initial?: { file: string; data: Buffer }, reserved?: () => void) {
  let read: string | undefined;
  let written: WrittenContent | undefined;
  let cached = initial;
  return {
    /** The digest and size of what the last write put on disk. */
    written: () => written,
    readFile: async (file: string) => {
      if (cached && cached.file === file && checked !== null) {
        const { data } = cached;
        cached = undefined;
        read = checked;
        return data;
      }
      const data = await fs.promises.readFile(file);
      read = sha256(data);
      return data;
    },
    writeFile: async (file: string, content: string) => {
      reserved?.();
      try {
        await atomicWriteFile(file, content, read ?? checked);
        const bytes = Buffer.from(content);
        written = { sha256: sha256(bytes), size: bytes.length, lines: lineCount(bytes) };
      } catch (error) {
        throw /changed on disk/.test(errorMessage(error)) ? changedOnDisk(display) : error;
      }
    },
    access: (file: string) => fs.promises.access(file, fs.constants.R_OK | fs.constants.W_OK),
    mkdir: async (dir: string) => {
      await fs.promises.mkdir(dir, { recursive: true });
    },
  };
}

async function runQuery(
  query: FileQuery, index: number, id: string, guard: FileGuard, ctx: ExtensionToolContext,
  signal: AbortSignal | undefined, permission: Permission, checkpoints?: Checkpoints,
): Promise<QueryOutcome> {
  const base = { type: query.type, path: query.path, reasoning: query.reasoning };
  const file = resolveToolPath(ctx.cwd, query.path);
  let capture: Capture | undefined;
  let operations: ReturnType<typeof guardedOperations> | undefined;
  let before: Buffer | undefined;
  try {
    if (query.type === 'edit' && !query.edits?.length) throw new Error('edit needs a non-empty edits array.');
    if (query.type === 'write' && query.content === undefined) throw new Error('write needs content.');
    const outside = await workspaceRefusal(file, query, ctx, signal, permission, id);
    if (outside) throw new Error(outside);
    const inspection = guard.inspect(file, query.type, query.path);
    if (inspection.refusal) throw new Error(inspection.refusal);
    const { current } = inspection;
    // Checked again right before the write: a peer may reserve the file while the change is prepared (asks, reads, checkpoint).
    const reserved = () => {
      const now = guard.reservedBy?.(file);
      if (now) throw new Error(now);
    };
    // The one read before the change: it serves the content check, the checkpoint and Pi's edit engine. The atomic
    // write's compare-and-swap is the only other read.
    const data = current
      ? await fs.promises.readFile(file).catch(() => {
          throw changedOnDisk(query.path);
        })
      : undefined;
    before = data;
    const checked = data ? sha256(data) : null;
    // A write or delete over changed bytes is refused. An edit goes on when every anchor still matches once.
    const { changed, refusal: unfit } = judgeChange(query.path, query.type, inspection, data, checked);
    if (unfit) throw new Error(unfit);
    const lost = changed && data ? lostAnchor(query.path, query.edits ?? [], data.toString('utf8')) : undefined;
    if (lost) throw new Error(lost);
    const copied = copiedElision(query, data?.toString('utf8') ?? '');
    if (copied) {
      throw new Error(
        `The new text contains "${copied}": a placeholder Octocode puts where it cut a tool's output, not file content. Re-read the source and write the full text.`,
      );
    }
    capture = await checkpoints?.capture(file, () => lastUserEntry(ctx), data && checked ? { data, sha256: checked, mode: current?.mode ?? 0o644 } : null);
    const note = capture?.note ? ` (${capture.note})` : '';
    if (query.type === 'delete') {
      await withFileMutationQueue(file, async () => {
        signal?.throwIfAborted();
        if (((await sha256File(file)) ?? null) !== checked) throw changedOnDisk(query.path);
        signal?.throwIfAborted();
        reserved();
        await fs.promises.rm(file);
      });
      guard.record(file);
      const unsaved = await settleCheckpoint(ctx, checkpoints, capture, file, true, null);
      return { ...base, ok: true, message: `Deleted ${query.path}${note}${unsaved}` };
    }
    operations = guardedOperations(query.path, checked, data ? { file, data } : undefined, reserved);
    const tool = query.type === 'edit' ? createEditToolDefinition(ctx.cwd, { operations }) : createWriteToolDefinition(ctx.cwd, { operations });
    const args = query.type === 'edit' ? { path: query.path, edits: query.edits } : { path: query.path, content: query.content };
    const result = await tool.execute(`${id}:${index}`, args as never, signal, undefined, ctx);
    const written = operations.written();
    // An edit over outside changes leaves them unseen: later edits go on, a write or delete needs a fresh read.
    const lineDelta = recordChange(guard, file, query.type, before, written);
    if (changed) guard.stale(file);
    const unsaved = await settleCheckpoint(ctx, checkpoints, capture, file, true, written?.sha256);
    const message = (contentText(result.content).trim() || `${query.type} ${query.path}`) + note + unsaved;
    const diff = isRecord(result.details) && typeof result.details['diff'] === 'string' ? result.details['diff'] : undefined;
    return { ...base, ok: true, message, ...(diff ? { diff } : {}), ...(lineDelta !== undefined ? { lineDelta } : {}) };
  } catch (error) {
    // Pi can observe cancellation after writeFile succeeded: retain both the read guard and the undo checkpoint.
    const written = operations?.written();
    if (written) recordChange(guard, file, query.type, before, written);
    const note = await settleCheckpoint(ctx, checkpoints, capture, file, written !== undefined, written?.sha256);
    return { ...base, ok: false, message: `${errorMessage(error)}${written ? ' The file was changed; inspect it before retrying.' : ''}${note}` };
  }
}

/**
 * Records what this tool wrote. A write puts known content on disk, so the agent knows the whole file; an edit only
 * knows the digest, and the agent keeps the coverage its reads had (`FileGuard.edited`). Returns an edit's change in
 * line count, for the outcome (the session rebuild applies the same rule from it).
 */
function recordChange(guard: FileGuard, file: string, type: FileQuery['type'], before: Buffer | undefined, written: WrittenContent | undefined): number | undefined {
  if (type !== 'edit') {
    guard.record(file, written);
    return undefined;
  }
  const lineDelta = written && before ? written.lines - lineCount(before) : undefined;
  guard.edited(file, written, lineDelta);
  return lineDelta;
}

/**
 * Why `file` may not be changed for its place: inside Octocode's state folder (always refused, in every mode), or
 * outside the repository and the `file.outside` ask was not allowed. Undefined when the change may go ahead.
 */
async function workspaceRefusal(file: string, query: FileQuery, ctx: ExtensionToolContext, signal: AbortSignal | undefined, permission: Permission, toolCallId: string): Promise<string | undefined> {
  const real = canonicalPath(file);
  const home = stateFolderRefusal(real, query.path, 'the file tool');
  if (home) {
    permission.refused([`${query.type} ${real}`], home, 'file');
    return home;
  }
  const root = workspaceRoot(ctx.cwd);
  const inside = root !== undefined && isWithin(real, root);
  if (inside && !runsLater(real, root)) return undefined;
  const dir = path.dirname(real);
  const verdict = await permission.check(ctx, {
    action: 'file.outside',
    title: inside ? 'Change a file that runs in later sessions?' : 'Change a file outside the workspace?',
    what: [`${query.type} ${real}`, `workspace: ${root ?? 'none (the home folder is not a workspace)'}`],
    purpose: query.reasoning,
    toolCallId,
    cwd: ctx.cwd,
    grant: { key: dir, label: `file changes under ${dir}` },
    ...(signal ? { signal } : {}),
  });
  return verdict.allowed ? undefined : `${query.path} is ${inside ? 'a file that runs in later sessions' : root ? `outside the workspace (${root})` : 'outside any workspace (the home folder is not one)'}. ${verdict.message}`;
}

/** The batch's `purpose`: what its changes' `reasoning` fields say, in order; none when they say nothing (the assistant's message then stands in). */
function changePurpose(queries: readonly Pick<FileQuery, 'reasoning'>[]): { purpose?: string } {
  const said = [...new Set(queries.map((query) => query.reasoning?.trim()).filter(Boolean))];
  return said.length > 0 ? { purpose: said.join('; ') } : {};
}

/** The first output-cut placeholder a change would add to the file (one already in the file or the replaced text is fine). */
export function copiedElision(query: Pick<FileQuery, 'type' | 'edits' | 'content'>, original: string): string | undefined {
  const added = query.type === 'write' ? [{ oldText: '', newText: query.content ?? '' }] : query.type === 'edit' ? (query.edits ?? []) : [];
  for (const { oldText, newText } of added) {
    const found = elisionMarkers(newText).find((marker) => !oldText.includes(marker) && !original.includes(marker));
    if (found) return found;
  }
  return undefined;
}

/** Pi's messages end with "in <path>." or "to <path>"; the outcome line already names the path. */
function withoutPath(message: string, file: string): string {
  return message.replace(new RegExp(`\\s+(?:in|to) ${escapeRegExp(file)}\\.?$`), '').replace(/^Successfully /, '');
}

export function formatOutcomes(outcomes: QueryOutcome[]): string {
  return outcomes
    .map((outcome, index) => `${index + 1}. ${outcome.ok ? 'OK' : 'FAILED'} ${outcome.type} ${outcome.path}: ${outcome.ok ? withoutPath(outcome.message, outcome.path) : outcome.message}`)
    .join('\n');
}

/**
 * The digest of what Pi's read returned when that is the whole file verbatim (no offset, limit or truncation), so the
 * guard checks the change against what the model saw rather than what the disk holds a moment later.
 */
export function returnedContent(toolName: string, input: Record<string, unknown>, content: unknown, details: unknown): KnownContent | undefined {
  if (readView(toolName, input, content, details)?.whole !== true) return undefined;
  if (!Array.isArray(content) || content.length !== 1 || !isRecord(content[0]) || content[0]['type'] !== 'text') return undefined;
  const text = content[0]['text'];
  return typeof text === 'string' ? { sha256: sha256(text), size: Buffer.byteLength(text) } : undefined;
}

export function registerFileTool(pi: ExtensionAPI, guard: FileGuard, permission: Permission, checkpoints?: Checkpoints): void {
  pi.registerTool(timedTool({
    name: 'file',
    label: 'File',
    description:
      'Create, edit or delete files in this repository; other paths need approval in manual and workspace permission modes. Queries run in order and report individual outcomes; a failure does not roll back earlier changes. Put replacements for one file in one query. ' +
      'Read an existing file with `read` first: an unread file, or a write or delete over a changed one, is refused; an edit applies if each oldText still matches once. Inspect every outcome.',
    promptSnippet: 'Create, edit or delete files (guarded)',
    promptGuidelines: [
      'Use file for authored changes; batch related files when useful. Run formatters, generators and builds with bash, then inspect their changes.',
    ],
    parameters: Params,
    // `file` calls run one at a time (the guard, review dialog and checkpoints are shared); other tools batched beside
    // them still run in parallel. Each path's writes also queue behind Pi's edit/write through withFileMutationQueue.
    execute: async (id: string, params: Static<typeof Params>, signal: AbortSignal | undefined, _onUpdate: unknown, ctx: ExtensionToolContext) => {
      if (params.queries.length === 0) throw new Error('No queries: pass at least one edit, write or delete query.');
      const outcomes: QueryOutcome[] = [];
      // When the mode asks (manual), the review is the ask: nothing is applied until the user has said yes to each
      // change (or to all of them). Without a UI to ask in, the batch is refused.
      let rejected = new Map<number, string | undefined>();
      const verdict = await permission.check(
        ctx,
        { action: 'file.workspace', title: 'Apply these file changes?', what: params.queries.map((query) => `${query.type} ${query.path}`), ...changePurpose(params.queries), toolCallId: id, cwd: ctx.cwd, ...(signal ? { signal } : {}) },
        async (dialogCtx, request) => {
          const answer = await askReview(dialogCtx, params.queries, request.signal, systemLines(request, permission.mode));
          if (answer === 'cancelled') return undefined;
          if (answer === 'session') return 'kind';
          rejected = answer;
          if (answer.size !== params.queries.length) return 'once';
          const notes = [...answer].flatMap(([index, note]) => note ? [`${params.queries[index]!.path}: ${note}`] : []);
          return notes.length > 0 ? { deny: notes.join('\n') } : 'deny';
        },
      );
      // A dismissed or interrupted review is not a verdict on the changes.
      if ((!verdict.allowed && verdict.via === 'cancelled') || signal?.aborted) throw new Error('Cancelled before any change was applied.');
      if (!verdict.allowed) throw new Error(verdict.message);
      for (const [index, query] of params.queries.entries()) {
        const note = rejected.get(index);
        const skip = rejected.has(index) ? `Rejected by the user; do not retry this change.${note ? ` User's note: ${note}` : ''}` : signal?.aborted ? 'Not applied: the batch was aborted.' : undefined;
        const skipped = skip ? { type: query.type, path: query.path, reasoning: query.reasoning, ok: false, message: skip } : undefined;
        outcomes.push(skipped ?? (await runQuery(query, index, id, guard, ctx, signal, permission, checkpoints)));
      }
      if (outcomes.every((outcome) => !outcome.ok)) throw new Error(formatOutcomes(outcomes));
      return { content: [{ type: 'text' as const, text: formatOutcomes(outcomes) }], details: { outcomes } };
    },
    renderCall: renderFileCall,
    renderResult: renderFileResult,
  }, { exclusive: true }));

  pi.on('tool_result', async (event, ctx) => {
    if (event.isError) return;
    const known = returnedContent(event.toolName, event.input, event.content, event.details);
    const view = readView(event.toolName, event.input, event.content, event.details);
    for (const file of readPaths(event.toolName, event.input, ctx.cwd)) guard.record(file, known, view?.whole !== true, view?.lines);
  });
}
