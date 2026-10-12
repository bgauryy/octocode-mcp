import type { ContextEditEntryDraft } from '@earendil-works/pi-coding-agent';
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
export const IMAGE_NOTE = '[image from an earlier tool call omitted]';

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
    ...strip.map((entry) => ({ type: 'context_edit' as const, targetId: entry.id, replacement: { content: withoutImages(entry.message) } })),
  ];
}

/** A result's text parts with its images replaced by one note. */
export function withoutImages(message: unknown): Array<{ type: 'text'; text: string }> {
  return [...texts(message).map((text) => ({ type: 'text' as const, text })), { type: 'text' as const, text: IMAGE_NOTE }];
}

/** The characters of all images in a message (base64), each counted as at least `least`. */
export function imageChars(message: unknown, least = 0): number {
  return parts(message).reduce<number>((sum, part) => {
    if (!isRecord(part) || part['type'] !== 'image') return sum;
    return sum + Math.max(least, typeof part['data'] === 'string' ? part['data'].length : 0);
  }, 0);
}

/** About the request size of a context, in characters: every text, thinking and image part of every message. */
export function contextChars(entries: ContextEntry[]): number {
  return entries.reduce((sum, entry) => {
    const message = entry.message;
    if (isRecord(message) && typeof message['content'] === 'string') return sum + message['content'].length;
    const text = parts(message).reduce<number>((total, part) => {
      if (!isRecord(part)) return total;
      const value = part['type'] === 'thinking' ? part['thinking'] : part['text'];
      return total + (typeof value === 'string' ? value.length : 0);
    }, 0);
    return sum + text + imageChars(message);
  }, 0);
}
