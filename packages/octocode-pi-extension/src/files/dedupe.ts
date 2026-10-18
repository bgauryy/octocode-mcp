import { isDeepStrictEqual } from 'node:util';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { OCTOCODE_TOOL_PREFIX } from '../shared/octocode-tools.js';
import { isRecord } from '../shared/util.js';
import { contextMessages, plainText, sessionCleared, toolCallArguments } from './reads.js';

/**
 * Repeated reads: when a read returns exactly the text an earlier call with the same arguments returned, and that earlier
 * result is still in the model's context (not compacted away, not cleared), the new result becomes a one-line note that
 * points at it. The text is the proof that the file did not change, so nothing guesses from modification times, and
 * nothing is lost: the content is in the context above.
 */

/** Tools whose result is the content of a file: Pi's `read` and Octocode's `localFetch`. */
const DEDUPED_TOOLS: ReadonlySet<string> = new Set(['read', `${OCTOCODE_TOOL_PREFIX}localFetch`]);

/** The note that stands for a repeated result of `toolName` called with `input`. */
function unchangedNote(toolName: string, input: Record<string, unknown>): string {
  if (toolName === 'read' && typeof input['path'] === 'string') return `[Unchanged since your earlier read of ${input['path']} (same range); that result is above in your context.]`;
  return `[Unchanged since your earlier ${toolName.slice(OCTOCODE_TOOL_PREFIX.length) || toolName} of the same arguments; that result is above in your context.]`;
}

/**
 * Replaces the result of a repeated read with `unchangedNote`. The note keeps the read's own `details` (so the file guard
 * still sees a whole or a partial read) and adds `unchangedOf`, the tool call id of the full result it points at.
 *
 * Registered after the file guard's `tool_result` handler (`registerFileTool`): the guard digests the text the read
 * returned, so it must see that text, not the note.
 */
export function registerReadDedupe(pi: ExtensionAPI): void {
  pi.on('tool_result', async (event, ctx) => {
    if (event.isError || !DEDUPED_TOOLS.has(event.toolName)) return undefined;
    const text = plainText(event.content);
    if (text === undefined) return undefined;
    const messages = contextMessages(ctx);
    const calls = toolCallArguments(messages);
    const cleared = sessionCleared(ctx.sessionManager);
    for (const { message } of messages) {
      if (!isRecord(message) || message['role'] !== 'toolResult' || message['isError'] === true || message['toolName'] !== event.toolName) continue;
      const id = String(message['toolCallId']);
      const arguments_ = calls.get(id);
      if (id === event.toolCallId || cleared.has(id) || !arguments_ || !isDeepStrictEqual(arguments_, event.input) || plainText(message['content']) !== text) continue;
      return { content: [{ type: 'text' as const, text: unchangedNote(event.toolName, event.input) }], details: { ...(isRecord(event.details) ? event.details : {}), unchangedOf: id } };
    }
    return undefined;
  });
}
