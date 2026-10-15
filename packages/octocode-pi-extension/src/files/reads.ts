import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { readPaths, resolveToolPath } from '../shared/home.js';
import { isRecord } from '../shared/util.js';
import { mergeRanges, readView, type LineRange, type ReadView } from './coverage.js';

/**
 * Which files the model's context shows, read from session messages: the base of the file guard's memory across a
 * resume, reload, fork, branch switch or compaction (its live memory comes from `tool_result` events).
 */

/** The hidden message that puts files back into the context after a compaction (`compaction/restore`); its `details.files` count as read, those also in `details.partial` only in part. */
export const RESTORED_FILES_TYPE = 'octocode-restored-files';

/**
 * The session entry that records which tool results were replaced by a placeholder after the prompt cache went cold
 * (`compaction/clearing`): `data.results` lists each result's `id` (its tool call id) and `saved`, where its whole text is.
 */
export const CLEARED_RESULTS_TYPE = 'octocode-cleared-results';

/** One message of the model's context, by the entry that owns it. */
export interface MessageRef {
  id: string;
  message: unknown;
}

/** The results cleared on this branch, as `tool call id → where the whole text was saved`. */
export function clearedResults(branch: readonly unknown[]): Map<string, string> {
  const cleared = new Map<string, string>();
  for (const entry of branch) {
    if (!isRecord(entry) || entry['type'] !== 'custom' || entry['customType'] !== CLEARED_RESULTS_TYPE || !isRecord(entry['data']) || !Array.isArray(entry['data']['results'])) continue;
    for (const result of entry['data']['results']) if (isRecord(result) && typeof result['id'] === 'string' && typeof result['saved'] === 'string') cleared.set(result['id'], result['saved']);
  }
  return cleared;
}

/** The messages of the model's current context (after the last compaction, on this branch), each with the entry that owns it. */
export function contextMessages(ctx: Pick<ExtensionContext, 'sessionManager'>): MessageRef[] {
  return ctx.sessionManager.buildSessionProjection().entries.flatMap((entry) => entry.messages.map((message) => ({ id: entry.sourceEntry.id, message })));
}

/** The text of a result made only of text parts, else undefined: an image is never replaced or cleared (`files/dedupe`, `compaction/clearing`). */
export function plainText(content: unknown): string | undefined {
  if (!Array.isArray(content) || content.length === 0) return undefined;
  const parts = content.map((part) => (isRecord(part) && part['type'] === 'text' && typeof part['text'] === 'string' ? part['text'] : undefined));
  return parts.every((text) => text !== undefined) ? parts.join('\n') : undefined;
}

/** The arguments of every tool call in `messages`, by tool call id. */
export function toolCallArguments(messages: readonly MessageRef[]): Map<string, Record<string, unknown>> {
  const calls = new Map<string, Record<string, unknown>>();
  for (const { message } of messages) {
    if (!isRecord(message) || message['role'] !== 'assistant' || !Array.isArray(message['content'])) continue;
    for (const part of message['content']) {
      if (isRecord(part) && part['type'] === 'toolCall' && typeof part['id'] === 'string' && isRecord(part['arguments'])) calls.set(part['id'], part['arguments']);
    }
  }
  return calls;
}

/** The latest result that put a file in the model's view. */
interface SeenFile {
  file: string;
  /** The entry of that result. */
  id: string;
  /** When the result was made (ms); the file is unchanged since if it was not modified after this. */
  at: number | undefined;
  /**
   * When the agent itself last read or changed the file (ms), for ranking what it worked on: a read-back after a
   * compaction carries the time of the work it stands for, so it does not look newer than it is.
   */
  workedAt: number | undefined;
  /** The first line that read showed or that change touched, when known. */
  line?: number;
  /** The reads showed a range or a cut view, not the whole file: an edit or a delete may follow, a write only when `lines` cover the file. */
  partial?: boolean;
  /** For a partial view: the lines the reads showed (merged), when known. */
  lines?: LineRange[];
}

/** What a read-back after compaction records per file (`details.worked`): the work it stands for. */
export interface WorkedFile {
  file: string;
  workedAt?: number;
  line?: number;
}

/**
 * The files shown by successful Pi `read` results, applied `file` changes and files restored after a compaction among
 * `messages`, each with its latest result. A `file` change counts because the guard lets the next change follow it without a read.
 * A result in `cleared` (tool call ids) no longer shows the file, nor does a repeated read's note (`details.unchangedOf`)
 * whose result is cleared or no longer among `messages` (a compaction kept the note but cut what it points at).
 */
export function seenFiles(messages: readonly MessageRef[], cwd: string, cleared: ReadonlySet<string> = new Set()): Map<string, SeenFile> {
  const calls = toolCallArguments(messages);
  const shown = new Set(messages.flatMap(({ message }) => (isRecord(message) && message['role'] === 'toolResult' && !cleared.has(String(message['toolCallId'])) ? [String(message['toolCallId'])] : [])));
  const latest = new Map<string, SeenFile>();
  for (const { id, message } of messages) {
    if (isRecord(message) && message['role'] === 'custom' && message['customType'] === RESTORED_FILES_TYPE) {
      const at = typeof message['timestamp'] === 'number' ? message['timestamp'] : undefined;
      const details = isRecord(message['details']) ? message['details'] : {};
      const restored = Array.isArray(details['files']) ? details['files'] : [];
      const cut = new Set(Array.isArray(details['partial']) ? details['partial'] : []);
      const worked = new Map((Array.isArray(details['worked']) ? details['worked'] : []).flatMap((entry) => (isRecord(entry) && typeof entry['file'] === 'string' ? [[entry['file'], entry] as const] : [])));
      for (const file of restored) {
        if (typeof file !== 'string') continue;
        const work = worked.get(file);
        const line = typeof work?.['line'] === 'number' ? work['line'] : undefined;
        latest.set(file, { file, id, at, workedAt: typeof work?.['workedAt'] === 'number' ? work['workedAt'] : undefined, ...(line ? { line } : {}), ...(cut.has(file) ? { partial: true } : {}) });
      }
      continue;
    }
    if (!isRecord(message) || message['role'] !== 'toolResult' || message['isError'] === true) continue;
    const unchangedOf = isRecord(message['details']) ? message['details']['unchangedOf'] : undefined;
    if (cleared.has(String(message['toolCallId'])) || (typeof unchangedOf === 'string' && !shown.has(unchangedOf))) continue;
    const tool = String(message['toolName']);
    const args = tool === 'read' ? calls.get(String(message['toolCallId'])) : undefined;
    const view = args ? readView(tool, args, message['content'], message['details']) : undefined;
    const offset = args && typeof args['offset'] === 'number' ? args['offset'] : undefined;
    const changed = tool === 'file' ? changedFiles(message['details'], cwd) : [];
    const files: ChangedFile[] = args ? readPaths(tool, args, cwd).map((file) => ({ file, line: offset })) : changed;
    const at = typeof message['timestamp'] === 'number' ? message['timestamp'] : undefined;
    for (const { file, line, edit } of files) {
      const shown = edit ? afterEdit(latest.get(file), edit, at) : shownBy(latest.get(file), view, at);
      latest.set(file, { file, id, workedAt: at, ...(line ? { line } : {}), ...shown });
    }
  }
  return latest;
}

/**
 * What the context shows of a file after a result with `view` at `at`: a whole read, an image or a write shows it
 * all; a range joins the earlier ones, and never takes back a whole view. Merged views date from the earliest result,
 * so a file changed between them counts as changed.
 */
function shownBy(previous: SeenFile | undefined, view: ReadView | undefined, at: number | undefined): Pick<SeenFile, 'at' | 'partial' | 'lines'> {
  if (!view || view.whole || !previous) return { at, ...(view && !view.whole ? partialView([], view) : {}) };
  const first = previous.at === undefined || at === undefined ? undefined : Math.min(previous.at, at);
  return { at: first, ...(previous.partial ? partialView(previous.lines ?? [], view) : {}) };
}

/**
 * What the context shows of a file after this tool's own edit (`FileGuard.edited` is the live rule): the edit adds no
 * view of the file, so a whole view stays whole and a partial one stays partial, with its ranges kept when the line
 * count did not change and dropped when it did. An edit with no earlier view in the context shows only its diff.
 */
function afterEdit(previous: SeenFile | undefined, edit: { lineDelta?: number }, at: number | undefined): Pick<SeenFile, 'at' | 'partial' | 'lines'> {
  if (previous && !previous.partial) return { at };
  const kept = edit.lineDelta === 0 ? (previous?.lines ?? []) : [];
  return { at, partial: true, ...(kept.length > 0 ? { lines: kept } : {}) };
}

function partialView(lines: readonly LineRange[], view: ReadView): Pick<SeenFile, 'partial' | 'lines'> {
  const merged = mergeRanges(lines, view.lines);
  return { partial: true, ...(merged.length > 0 ? { lines: merged } : {}) };
}

/** A file a result showed: the first line it concerns, and for an applied edit, how its line count moved. */
interface ChangedFile {
  file: string;
  line: number | undefined;
  edit?: { lineDelta?: number };
}

/** The files a `file` result changed, each with the first line its diff shows changed (`+12 …` or `-12 …`). */
function changedFiles(details: unknown, cwd: string): ChangedFile[] {
  const outcomes = isRecord(details) && Array.isArray(details['outcomes']) ? details['outcomes'] : [];
  return outcomes.flatMap((outcome) => {
    if (!isRecord(outcome) || outcome['ok'] !== true || typeof outcome['path'] !== 'string') return [];
    const changed = typeof outcome['diff'] === 'string' ? /^[+-]\s*(\d+) /m.exec(outcome['diff']) : null;
    const lineDelta = typeof outcome['lineDelta'] === 'number' ? outcome['lineDelta'] : undefined;
    return [{ file: resolveToolPath(cwd, outcome['path']), line: changed ? Number(changed[1]) : undefined, ...(outcome['type'] === 'edit' ? { edit: { ...(lineDelta !== undefined ? { lineDelta } : {}) } } : {}) }];
  });
}

/** The files the model's current context shows (a cleared result shows none), with when each was last shown, for `FileGuard.restore`. */
export function contextReads(ctx: Pick<ExtensionContext, 'cwd' | 'sessionManager'>): Array<{ file: string; at: number; partial?: boolean; lines?: LineRange[] }> {
  const cleared = new Set(clearedResults(ctx.sessionManager.getBranch()).keys());
  return [...seenFiles(contextMessages(ctx), ctx.cwd, cleared).values()].flatMap((seen) =>
    seen.at === undefined ? [] : [{ file: seen.file, at: seen.at, ...(seen.partial ? { partial: true, ...(seen.lines ? { lines: seen.lines } : {}) } : {}) }],
  );
}
