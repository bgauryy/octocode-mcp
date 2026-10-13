import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { readPaths, resolveToolPath } from '../shared/home.js';
import { isRecord } from '../shared/util.js';

/**
 * Which files the model's context shows, read from session messages: the base of the file guard's memory across a
 * resume, reload, fork, branch switch or compaction (its live memory comes from `tool_result` events).
 */

/** The hidden message that puts files back into the context after a compaction (`compaction/restore`); its `details.files` count as read. */
export const RESTORED_FILES_TYPE = 'octocode-restored-files';

/** One message of the model's context, by the entry that owns it. */
export interface MessageRef {
  id: string;
  message: unknown;
}

/** The latest result that put a file in the model's view. */
export interface SeenFile {
  file: string;
  /** The entry of that result. */
  id: string;
  /** When the result was made (ms); the file is unchanged since if it was not modified after this. */
  at: number | undefined;
}

/**
 * The files shown by successful Pi `read` results, applied `file` changes and files restored after a compaction among
 * `messages`, each with its latest result. A `file` change counts because the guard lets the next change follow it without a read.
 */
export function seenFiles(messages: readonly MessageRef[], cwd: string): Map<string, SeenFile> {
  const calls = new Map<string, Record<string, unknown>>();
  for (const { message } of messages) {
    if (!isRecord(message) || message['role'] !== 'assistant' || !Array.isArray(message['content'])) continue;
    for (const part of message['content']) {
      if (isRecord(part) && part['type'] === 'toolCall' && typeof part['id'] === 'string' && isRecord(part['arguments'])) calls.set(part['id'], part['arguments']);
    }
  }
  const latest = new Map<string, SeenFile>();
  for (const { id, message } of messages) {
    if (isRecord(message) && message['role'] === 'custom' && message['customType'] === RESTORED_FILES_TYPE) {
      const at = typeof message['timestamp'] === 'number' ? message['timestamp'] : undefined;
      const restored = isRecord(message['details']) && Array.isArray(message['details']['files']) ? message['details']['files'] : [];
      for (const file of restored) if (typeof file === 'string') latest.set(file, { file, id, at });
      continue;
    }
    if (!isRecord(message) || message['role'] !== 'toolResult' || message['isError'] === true) continue;
    const tool = String(message['toolName']);
    const args = tool === 'read' ? calls.get(String(message['toolCallId'])) : undefined;
    const files = args ? readPaths(tool, args, cwd) : tool === 'file' ? changedFiles(message['details'], cwd) : [];
    const at = typeof message['timestamp'] === 'number' ? message['timestamp'] : undefined;
    for (const file of files) latest.set(file, { file, id, at });
  }
  return latest;
}

function changedFiles(details: unknown, cwd: string): string[] {
  const outcomes = isRecord(details) && Array.isArray(details['outcomes']) ? details['outcomes'] : [];
  return outcomes.flatMap((outcome) => (isRecord(outcome) && outcome['ok'] === true && typeof outcome['path'] === 'string' ? [resolveToolPath(cwd, outcome['path'])] : []));
}

/** The files the model's current context shows, with when each was last shown, for `FileGuard.restore`. */
export function contextReads(ctx: Pick<ExtensionContext, 'cwd' | 'sessionManager'>): Array<{ file: string; at: number }> {
  const messages = ctx.sessionManager.buildSessionProjection().entries.flatMap((entry) => entry.messages.map((message) => ({ id: entry.sourceEntry.id, message })));
  return [...seenFiles(messages, ctx.cwd).values()].flatMap((seen) => (seen.at === undefined ? [] : [{ file: seen.file, at: seen.at }]));
}
