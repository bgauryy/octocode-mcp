import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { readPaths, resolveToolPath } from '../shared/home.js';
import { isRecord } from '../shared/util.js';
import { returnedContent } from './tool.js';

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
  /** The read showed a range or a cut view, not the whole file: an edit may follow it, a write or delete may not. */
  partial?: boolean;
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
 * A result in `cleared` (tool call ids), and a repeated read's note (`details.unchangedOf`) that points at one, no longer show the file.
 */
export function seenFiles(messages: readonly MessageRef[], cwd: string, cleared: ReadonlySet<string> = new Set()): Map<string, SeenFile> {
  const calls = toolCallArguments(messages);
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
    if (cleared.has(String(message['toolCallId'])) || (typeof unchangedOf === 'string' && cleared.has(unchangedOf))) continue;
    const tool = String(message['toolName']);
    const args = tool === 'read' ? calls.get(String(message['toolCallId'])) : undefined;
    const partial = args !== undefined && returnedContent(tool, args, message['content'], message['details']) === undefined;
    const files = args ? readPaths(tool, args, cwd).map((file) => ({ file, line: typeof args['offset'] === 'number' ? args['offset'] : undefined })) : tool === 'file' ? changedFiles(message['details'], cwd) : [];
    const at = typeof message['timestamp'] === 'number' ? message['timestamp'] : undefined;
    for (const { file, line } of files) latest.set(file, { file, id, at, workedAt: at, ...(line ? { line } : {}), ...(partial ? { partial } : {}) });
  }
  return latest;
}

/** The files a `file` result changed, each with the first line its diff shows changed (`+12 …` or `-12 …`). */
function changedFiles(details: unknown, cwd: string): Array<{ file: string; line: number | undefined }> {
  const outcomes = isRecord(details) && Array.isArray(details['outcomes']) ? details['outcomes'] : [];
  return outcomes.flatMap((outcome) => {
    if (!isRecord(outcome) || outcome['ok'] !== true || typeof outcome['path'] !== 'string') return [];
    const changed = typeof outcome['diff'] === 'string' ? /^[+-]\s*(\d+) /m.exec(outcome['diff']) : null;
    return [{ file: resolveToolPath(cwd, outcome['path']), line: changed ? Number(changed[1]) : undefined }];
  });
}

/** The files the model's current context shows (a cleared result shows none), with when each was last shown, for `FileGuard.restore`. */
export function contextReads(ctx: Pick<ExtensionContext, 'cwd' | 'sessionManager'>): Array<{ file: string; at: number; partial?: boolean }> {
  const cleared = new Set(clearedResults(ctx.sessionManager.getBranch()).keys());
  return [...seenFiles(contextMessages(ctx), ctx.cwd, cleared).values()].flatMap((seen) =>
    seen.at === undefined ? [] : [{ file: seen.file, at: seen.at, ...(seen.partial ? { partial: true } : {}) }],
  );
}
