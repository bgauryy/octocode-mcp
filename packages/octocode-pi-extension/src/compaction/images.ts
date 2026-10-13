import type { ImageContent } from '@earendil-works/pi-ai';
import { estimateTokens, type ContextEditEntryDraft } from '@earendil-works/pi-coding-agent';
import { saveContentCopy } from '../shared/spill.js';
import { isRecord } from '../shared/util.js';

/**
 * Message parts and images for context trimming. Images cost few tokens but many request bytes (a screenshot is about
 * 450 KB of base64), so they are budgeted by size and stripped when a provider or gateway rejects a request as too large.
 */

/** One session message in the model context, by its entry id. */
export interface ContextEntry {
  id: string;
  message: unknown;
}

/**
 * Only the newest tool results holding images keep them, even inside the recent window: a screenshot is about 450 KB of
 * base64 but costs few tokens, so a handful of them overflows a gateway's request-size limit long before the context
 * window fills. Older images are replaced by a note (their text stays).
 */
export const KEEP_RECENT_IMAGES = 3;
/** ...and only while their images fit this many base64 characters together (the newest image always stays). */
export const KEEP_RECENT_IMAGE_CHARS = 1_000_000;
/**
 * Context size (text and image characters, about request bytes) from which trims run even on a warm cache. Anthropic
 * accepts 32 MB, but gateways in front of it reject far less (one rejected requests just over 3 MB with a bodiless 413).
 */
export const REQUEST_PRESSURE_CHARS = 1_500_000;
/** Provider and gateway errors that reject a request for its byte size (not its tokens). */
const TOO_LARGE_ERROR = /^\s*413\b|\b(?:status|http)\D{0,12}413\b|request_too_large|request entity too large|payload too large|request exceeds the maximum size|too much media/i;
const IMAGE_EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

/**
 * Saves every image of a message to the session output folder, named by content: each as `<path> (sha256 …, n bytes)`,
 * or undefined when one could not be saved.
 */
export function saveImages(message: unknown): string[] | undefined {
  const copies: string[] = [];
  for (const part of parts(message)) {
    if (!isRecord(part) || part['type'] !== 'image') continue;
    const copy = typeof part['data'] === 'string' ? saveContentCopy(Buffer.from(part['data'], 'base64'), 'trimmed-image', IMAGE_EXTENSIONS[String(part['mimeType'])] ?? 'bin') : undefined;
    if (!copy) return undefined;
    copies.push(copy);
  }
  return copies;
}

/** The note that replaces a result's images: where they are saved, or (413 recovery only) that they could not be. */
export function imageNote(paths: string[] | undefined): string {
  return paths
    ? `[image from an earlier tool call omitted; saved at ${paths.join(', ')}; read that file to see it again]`
    : '[image from an earlier tool call omitted; it could not be saved]';
}

/**
 * The results whose images stay: those the model has not seen yet (`unseen`, whatever their size), then the newest
 * others while there are at most KEEP_RECENT_IMAGES and their images fit KEEP_RECENT_IMAGE_CHARS (the newest always).
 */
export function keptImageResults(results: ContextEntry[], unseen: ReadonlySet<string>): Set<ContextEntry> {
  const kept = new Set<ContextEntry>();
  let used = 0;
  for (let index = results.length - 1; index >= 0; index--) {
    const entry = results[index]!;
    if (!hasImage(entry.message)) continue;
    const size = imageChars(entry.message);
    if (!unseen.has(entry.id) && kept.size > 0 && (kept.size >= KEEP_RECENT_IMAGES || used + size > KEEP_RECENT_IMAGE_CHARS)) break;
    kept.add(entry);
    used += size;
  }
  return kept;
}

export function parts(message: unknown): unknown[] {
  return isRecord(message) && Array.isArray(message['content']) ? message['content'] : [];
}

export function texts(message: unknown): string[] {
  return parts(message).flatMap((part) => (isRecord(part) && part['type'] === 'text' && typeof part['text'] === 'string' ? [part['text']] : []));
}

export function hasImage(message: unknown): boolean {
  return parts(message).some((part) => isRecord(part) && part['type'] === 'image');
}

/** Whether a failed turn was rejected for the byte size of its request (HTTP 413 and its provider spellings). */
export function isRequestTooLarge(message: unknown): boolean {
  return isRecord(message) && message['stopReason'] === 'error' && TOO_LARGE_ERROR.test(String(message['errorMessage'] ?? ''));
}

/**
 * Context edits that let a request rejected as too large be sent again: every tool result's images except the newest
 * `keepImages` are replaced by a note, and the failed attempt (`failedId`) is omitted, since Pi cannot continue from an
 * assistant message; without it (Pi recovers that attempt itself) only images go. Undefined when no image is left to
 * remove, so a retry would fail the same way.
 */
export function planTooLargeRecovery(entries: ContextEntry[], failedId: string | undefined, keepImages: number): ContextEditEntryDraft[] | undefined {
  const withImages = entries.filter((entry) => isRecord(entry.message) && entry.message['role'] === 'toolResult' && hasImage(entry.message));
  const strip = withImages.slice(0, Math.max(0, withImages.length - keepImages));
  if (strip.length === 0) return undefined;
  return [
    ...(failedId === undefined ? [] : [{ type: 'context_edit' as const, targetId: failedId, replacement: null }]),
    // The session is stuck until the bytes go, so an image that cannot be saved is still removed (the note says so).
    ...strip.map((entry) => ({ type: 'context_edit' as const, targetId: entry.id, replacement: { content: withoutImages(entry.message, true)! } })),
  ];
}

/**
 * A result's text parts with its images saved and replaced by one note naming the files. Undefined when an image could
 * not be saved, so it stays in context, unless `force` (413 recovery).
 */
export function withoutImages(message: unknown, force = false): Array<{ type: 'text'; text: string }> | undefined {
  const paths = saveImages(message);
  if (!paths && !force) return undefined;
  return [...texts(message).map((text) => ({ type: 'text' as const, text })), { type: 'text' as const, text: imageNote(paths) }];
}

/** The characters of all images in a message (base64), each counted as at least `least`. */
export function imageChars(message: unknown, least = 0): number {
  return parts(message).reduce<number>((sum, part) => {
    if (!isRecord(part) || part['type'] !== 'image') return sum;
    return sum + Math.max(least, typeof part['data'] === 'string' ? part['data'].length : 0);
  }, 0);
}

/** Pi's visual-token estimate in text-character units, independent of an image's base64 transport size. */
export function imageTokenChars(message: unknown): number {
  const content = parts(message).filter((part): part is ImageContent => isRecord(part) && part['type'] === 'image');
  return estimateTokens({ role: 'user', content, timestamp: 0 }) * 4;
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

/** Economic estimate: text stays in character units, while images use Pi's visual-token estimate instead of bytes. */
export function contextTokenChars(entries: ContextEntry[]): number {
  return contextChars(entries) + entries.reduce((sum, entry) => sum + imageTokenChars(entry.message) - imageChars(entry.message), 0);
}
