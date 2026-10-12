import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize, truncateHead, truncateTail } from '@earendil-works/pi-coding-agent';
import { PRIVATE_FILE_MODE, sessionOutputDir } from './home.js';
import { shortPath } from './format.js';
import { capOutput, cutText } from './util.js';

/** Bytes and lines kept back from the budget for the omission and pointer notes. */
const NOTE_BYTES = 512;
const NOTE_LINES = 6;

let written = 0;

/** `label` as a file-name part: anything outside `[A-Za-z0-9_-]` becomes `_`. */
export function spillLabel(label: string): string {
  return label.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'output';
}

/**
 * Writes `text` to `<session folder>/output/<label>-<timestamp>-<n>.txt` (`sessionOutputDir`) and returns the path, or
 * undefined when it could not be written. The session sweep removes old files. Never throws.
 */
export function saveFullOutput(text: string, label: string): string | undefined {
  try {
    const file = path.join(sessionOutputDir('output'), `${spillLabel(label)}-${Date.now()}-${++written}.txt`);
    fs.writeFileSync(file, text, { flag: 'wx', mode: PRIVATE_FILE_MODE });
    return file;
  } catch {
    return undefined;
  }
}

/**
 * Keeps a model-facing result inside Pi's per-result budget without losing it: text that fits comes back unchanged;
 * longer text is saved whole to a file and replaced by its head (about 70% of the budget) and tail (about 30%) plus a
 * note naming the file. When the file cannot be written, falls back to `capOutput` and says so. Never throws.
 */
export function capOutputToFile(text: string, options: { label: string; maxBytes?: number; maxLines?: number }): string {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxLines = options.maxLines ?? DEFAULT_MAX_LINES;
  const whole = truncateHead(text, { maxBytes, maxLines });
  if (!whole.truncated) return text;
  const file = saveFullOutput(text, options.label);
  if (!file) return `${capOutput(text, maxBytes, maxLines)}\n[full output could not be saved]`;
  const bytes = Math.max(maxBytes - NOTE_BYTES, 64);
  const lines = Math.max(maxLines - NOTE_LINES, 2);
  const head = headPreview(text, Math.floor(bytes * 0.7), Math.max(Math.floor(lines * 0.7), 1));
  const tail = tailPreview(text, Math.floor(bytes * 0.3), Math.max(Math.floor(lines * 0.3), 1));
  const shownLines = head.lines + tail.lines;
  const shownBytes = Buffer.byteLength(head.text) + Buffer.byteLength(tail.text);
  const omitted = Math.max(whole.totalLines - shownLines, 0);
  const gap = omitted > 0 ? `[… ${omitted} line${omitted === 1 ? '' : 's'} omitted …]` : `[… ${formatSize(Math.max(whole.totalBytes - shownBytes, 0))} omitted …]`;
  return (
    `${head.text}\n\n${gap}\n\n${tail.text}\n\n` +
    `[Output trimmed: showing ${shownLines} of ${whole.totalLines} lines (${formatSize(shownBytes)} of ${formatSize(whole.totalBytes)}). Full output: ${shortPath(file)}; search it or read it by line range.]`
  );
}

/** Whole leading lines within the budget; the head of the first line when it alone is over the byte budget. */
function headPreview(text: string, maxBytes: number, maxLines: number): { text: string; lines: number } {
  const cut = truncateHead(text, { maxBytes, maxLines });
  if (cut.content !== '') return { text: cut.content, lines: cut.outputLines };
  return { text: cutText(text, maxBytes), lines: 1 };
}

/** Trailing lines within the budget; the end of the last line when it alone is over the byte budget. */
function tailPreview(text: string, maxBytes: number, maxLines: number): { text: string; lines: number } {
  const cut = truncateTail(text, { maxBytes, maxLines });
  if (cut.content !== '') return { text: cut.content, lines: cut.outputLines };
  return { text: cutText(text, maxBytes, { tail: true }), lines: 1 };
}

/**
 * The most base64 characters of one image a tool puts in the model's context. A screenshot of ~450 KB costs few tokens
 * but many request bytes, and a gateway in front of the provider rejects a request of a few MB (HTTP 413).
 */
export const IMAGE_MAX_CHARS = 600_000;

const IMAGE_EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

/**
 * Writes a base64 image to `<session folder>/output/<label>-<timestamp>-<n>.<ext>` (owner-only) and returns the
 * absolute path, or undefined when it could not be written. The session sweep removes old files. Never throws.
 */
export function saveImageFile(base64: string, mimeType: string, label: string): string | undefined {
  try {
    const file = path.join(sessionOutputDir('output'), `${spillLabel(label)}-${Date.now()}-${++written}.${IMAGE_EXTENSIONS[mimeType] ?? 'img'}`);
    fs.writeFileSync(file, Buffer.from(base64, 'base64'), { flag: 'wx', mode: PRIVATE_FILE_MODE });
    return file;
  } catch {
    return undefined;
  }
}

/** An image part within `IMAGE_MAX_CHARS` unchanged; a larger one saved whole and replaced by a text note naming the file. */
export function boundImagePart<T extends { type: 'image'; data: string; mimeType: string }>(part: T, label: string): T | { type: 'text'; text: string } {
  if (part.data.length <= IMAGE_MAX_CHARS) return part;
  const file = saveImageFile(part.data, part.mimeType, label);
  const size = formatSize(Math.floor((part.data.length * 3) / 4));
  return { type: 'text', text: `[${part.mimeType} image of ${size} left out: too large for the context. ${file ? `Saved to ${file}.` : 'It could not be saved.'}]` };
}
