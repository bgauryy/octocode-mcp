import type { ContextEditEntryDraft } from '@earendil-works/pi-coding-agent';
import { imageExtension, saveContentCopy } from '../shared/spill.js';
import { isRecord, partText } from '../shared/util.js';

/**
 * Message parts and images for recovery from a request rejected as too large. Images cost few tokens but many request
 * bytes (a screenshot is about 450 KB of base64), so they are stripped when a provider or gateway rejects a request.
 */

/** One session message in the model context, by its entry id. */
export interface ContextEntry {
  id: string;
  message: unknown;
}

/** Provider and gateway errors that reject a request for its byte size (not its tokens). */
const TOO_LARGE_ERROR = /^\s*413\b|\b(?:status|http)\D{0,12}413\b|request_too_large|request entity too large|payload too large|request exceeds the maximum size|too much media/i;

/** What saving a message's images came to: the saved copies, and the 1-based positions of the images that could not be saved. */
interface SavedImages {
  copies: string[];
  failed: number[];
  total: number;
}

/**
 * Saves every image of a message to the session output folder, named by content: each saved as `<path> (sha256 …, n
 * bytes)`; one that cannot be saved does not stop the others.
 */
function saveImages(message: unknown): SavedImages {
  const saved: SavedImages = { copies: [], failed: [], total: 0 };
  for (const part of parts(message)) {
    if (!isRecord(part) || part['type'] !== 'image') continue;
    saved.total++;
    const copy = typeof part['data'] === 'string' ? saveContentCopy(Buffer.from(part['data'], 'base64'), 'omitted-image', imageExtension(String(part['mimeType'])) ?? 'bin') : undefined;
    if (copy) saved.copies.push(copy);
    else saved.failed.push(saved.total);
  }
  return saved;
}

/** The note that replaces a message's images: where each is saved, and which could not be. */
function imageNote({ copies, failed, total }: SavedImages, from = 'an earlier tool call'): string {
  if (copies.length === 0) return `[image from ${from} omitted; it could not be saved]`;
  const missing = failed.length === 0 ? '' : `; ${failed.length === 1 ? 'image' : 'images'} ${failed.join(', ')} of ${total} could not be saved`;
  return `[image from ${from} omitted; saved at ${copies.join(', ')}${missing}; read ${copies.length === 1 ? 'that file' : 'those files'} to see ${copies.length === 1 && failed.length === 0 ? 'it' : 'them'} again]`;
}

export function parts(message: unknown): unknown[] {
  return isRecord(message) && Array.isArray(message['content']) ? message['content'] : [];
}

function texts(message: unknown): string[] {
  return parts(message).flatMap((part) => partText(part) ?? []);
}

function hasImage(message: unknown): boolean {
  return parts(message).some((part) => isRecord(part) && part['type'] === 'image');
}

/** Whether a failed turn was rejected for the byte size of its request (HTTP 413 and its provider spellings). */
export function isRequestTooLarge(message: unknown): boolean {
  return isRecord(message) && message['stopReason'] === 'error' && TOO_LARGE_ERROR.test(String(message['errorMessage'] ?? ''));
}

/**
 * Context edits that let a request rejected as too large be sent again: the images of every tool result and user
 * message except the newest `keepImages` such messages are replaced by a note, oldest first, and the failed attempt
 * (`failedId`) is omitted, since Pi cannot continue from an assistant message; without it (Pi recovers that attempt
 * itself) only images go. Undefined when no image is left to remove, so a retry would fail the same way.
 */
export function planTooLargeRecovery(entries: ContextEntry[], failedId: string | undefined, keepImages: number): ContextEditEntryDraft[] | undefined {
  const withImages = entries.filter((entry) => isRecord(entry.message) && (entry.message['role'] === 'toolResult' || entry.message['role'] === 'user') && hasImage(entry.message));
  const strip = withImages.slice(0, Math.max(0, withImages.length - keepImages));
  if (strip.length === 0) return undefined;
  return [
    ...(failedId === undefined ? [] : [{ type: 'context_edit' as const, targetId: failedId, replacement: null }]),
    ...strip.map((entry) => ({ type: 'context_edit' as const, targetId: entry.id, replacement: { content: withoutImages(entry.message) } })),
  ];
}

/**
 * A message's text parts with its images saved and replaced by one note naming the files. The session is stuck until
 * the bytes go, so an image that cannot be saved is still removed (the note says so).
 */
function withoutImages(message: unknown): Array<{ type: 'text'; text: string }> {
  const saved = saveImages(message);
  const from = isRecord(message) && message['role'] === 'user' ? 'an earlier user message' : 'an earlier tool call';
  return [...texts(message).map((text) => ({ type: 'text' as const, text })), { type: 'text' as const, text: imageNote(saved, from) }];
}

const length = (value: unknown) => (typeof value === 'string' ? value.length : 0);

/** About the length of `value` as JSON (strings, keys and scalars; quotes and separators counted roughly), without serializing it. */
function jsonChars(value: unknown): number {
  if (typeof value === 'string') return value.length + 2;
  if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + jsonChars(item) + 1, 2);
  if (isRecord(value)) return Object.entries(value).reduce<number>((sum, [key, item]) => sum + key.length + 4 + jsonChars(item), 2);
  return value === undefined ? 0 : String(value).length;
}

/** The characters a message part adds to a request: pi-ai resends thinking with its signature, and tool calls as name and JSON arguments. */
function partChars(part: unknown): number {
  if (!isRecord(part)) return 0;
  switch (part['type']) {
    case 'thinking':
      return length(part['thinking']) + length(part['thinkingSignature']);
    case 'toolCall':
      return length(part['name']) + jsonChars(part['arguments']);
    case 'image':
      return length(part['data']);
    default:
      return length(part['text']);
  }
}

/** About the request size of a context, in characters: every part of every message as the provider is sent it. */
export function contextChars(entries: ContextEntry[]): number {
  return entries.reduce((sum, entry) => {
    const message = entry.message;
    if (isRecord(message) && typeof message['content'] === 'string') return sum + message['content'].length;
    return sum + parts(message).reduce<number>((total, part) => total + partChars(part), 0);
  }, 0);
}
