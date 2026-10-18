import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatDimensionNote, formatSize, resizeImage, truncateHead, truncateTail } from '@earendil-works/pi-coding-agent';
import { shortHash } from './atomic.js';
import { PRIVATE_FILE_MODE, sessionOutputDir } from './home.js';
import { shortPath } from './format.js';
import { capOutput, cutText, trimmedCounts } from './util.js';
import { imageLimits, type ImageLimits } from './vision.js';

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
  return saveTimestamped(text, label, 'txt');
}

/** Writes `data` owner-only to a new `<session folder>/output/<label>-<timestamp>-<n>.<extension>`; undefined on failure. */
function saveTimestamped(data: string | Uint8Array, label: string, extension: string): string | undefined {
  try {
    const file = path.join(sessionOutputDir('output'), `${spillLabel(label)}-${Date.now()}-${++written}.${extension}`);
    fs.writeFileSync(file, data, { flag: 'wx', mode: PRIVATE_FILE_MODE });
    return file;
  } catch {
    return undefined;
  }
}

/**
 * Writes `content` to `<session folder>/output/<name>` (owner-only) unless a file of that name already holds exactly these
 * bytes, and returns the absolute path; undefined when it could not be written or the name is taken by other content.
 * The caller names the file by its content's hash, so the same bytes always land in the same file. Never throws.
 */
export function saveNamedContent(content: string | Uint8Array, name: string): string | undefined {
  try {
    const file = path.join(sessionOutputDir('output'), name);
    try {
      fs.writeFileSync(file, content, { flag: 'wx', mode: PRIVATE_FILE_MODE });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !Buffer.from(content).equals(fs.readFileSync(file))) return undefined;
    }
    return file;
  } catch {
    return undefined;
  }
}

/**
 * Saves `content` to `<session folder>/output/<label>-<sha256 prefix>.<extension>`, named by its content, so the same
 * bytes always land in the same file (saving the same content twice points at one copy). Returns where it is
 * and how to check it, as `<path> (sha256 <prefix>, <n> bytes)`, or undefined when it could not be written. Never throws.
 */
export function saveContentCopy(content: string | Uint8Array, label: string, extension = 'txt'): string | undefined {
  const hash = shortHash(content);
  const file = saveNamedContent(content, `${spillLabel(label)}-${hash}.${extension}`);
  return file && `${shortPath(file)} (sha256 ${hash}, ${typeof content === 'string' ? Buffer.byteLength(content) : content.byteLength} bytes)`;
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
  // A single long line gives the head and the tail of the same line: it never shows more lines than the text has.
  const shownLines = Math.min(head.lines + tail.lines, whole.totalLines);
  const shownBytes = Buffer.byteLength(head.text) + Buffer.byteLength(tail.text);
  const omitted = Math.max(whole.totalLines - shownLines, 0);
  // A line shown only in part (one alone over the budget) counts as left out, so the read named shows it whole.
  const first = head.whole ? head.lines + 1 : 1;
  const last = tail.whole ? whole.totalLines - tail.lines : whole.totalLines;
  const read = `(lines ${first}–${last} of ${whole.totalLines}; read them from the full output with offset ${first} and limit ${last - first + 1})`;
  const gap = omitted > 0 ? `[… ${omitted} line${omitted === 1 ? '' : 's'} omitted …] ${read}` : `[… ${formatSize(Math.max(whole.totalBytes - shownBytes, 0))} omitted …]`;
  return (
    `${head.text}\n\n${gap}\n\n${tail.text}\n\n` +
    `[Output trimmed: showing ${trimmedCounts(shownLines, whole.totalLines, shownBytes, whole.totalBytes)}. Full output: ${shortPath(file)}; search it or read it by line range.]`
  );
}

/** Whole leading lines within the budget; the head of the first line when it alone is over the byte budget. */
function headPreview(text: string, maxBytes: number, maxLines: number): { text: string; lines: number; whole: boolean } {
  const cut = truncateHead(text, { maxBytes, maxLines });
  if (cut.content !== '') return { text: cut.content, lines: cut.outputLines, whole: true };
  return { text: cutText(text, maxBytes), lines: 1, whole: false };
}

/** Trailing lines within the budget; the end of the last line when it alone is over the byte budget. */
function tailPreview(text: string, maxBytes: number, maxLines: number): { text: string; lines: number; whole: boolean } {
  const cut = truncateTail(text, { maxBytes, maxLines });
  if (cut.content !== '') return { text: cut.content, lines: cut.outputLines, whole: true };
  return { text: cutText(text, maxBytes, { tail: true }), lines: 1, whole: false };
}

/**
 * The most base64 characters of one image a tool puts in the model's context. A screenshot of ~450 KB costs few tokens
 * but many request bytes, and a gateway in front of the provider rejects a request of a few MB (HTTP 413).
 */
export const IMAGE_MAX_CHARS = 600_000;

/** The most base64 characters of one image for a model with `limits`: `IMAGE_MAX_CHARS`, or its smaller `maxBytes`. */
export function imageBudget(limits: ImageLimits = imageLimits()): number {
  return Math.min(IMAGE_MAX_CHARS, limits.maxBytes ?? IMAGE_MAX_CHARS);
}

const IMAGE_EXTENSIONS: ReadonlyMap<string, string> = new Map([['image/png', 'png'], ['image/jpeg', 'jpg'], ['image/webp', 'webp'], ['image/gif', 'gif']]);

/** The file extension of an image MIME type, or undefined for one this version does not know (callers pick their own fallback). */
export const imageExtension = (mimeType: string): string | undefined => IMAGE_EXTENSIONS.get(mimeType);

/**
 * Writes a base64 image to `<session folder>/output/<label>-<timestamp>-<n>.<ext>` (owner-only) and returns the
 * absolute path, or undefined when it could not be written. The session sweep removes old files. Never throws.
 */
export function saveImageFile(base64: string, mimeType: string, label: string): string | undefined {
  return saveTimestamped(Buffer.from(base64, 'base64'), label, imageExtension(mimeType) ?? 'img');
}

/**
 * Keeps a fitted image visible and saves its original; falls back to a file pointer if Pi cannot resize it. An image
 * within the budget (`IMAGE_MAX_CHARS`, or the model's smaller `maxBytes`) passes through as is: Pi fits every tool
 * result image to the model's profile again, and decoding each small image here would cost more than it saves. A larger
 * one is resized to `limits` (default: `imageLimits()` for an unknown model) and gets a note with the original's
 * dimensions, so coordinates map back. `savedAs` is the path of an original the caller already saved.
 */
export async function boundImagePart<T extends { type: 'image'; data: string; mimeType: string }>(
  part: T,
  label: string,
  options: { limits?: ImageLimits; savedAs?: string } = {},
): Promise<Array<T | { type: 'text'; text: string }>> {
  const budget = imageBudget(options.limits);
  if (part.data.length <= budget) return [part];
  const file = options.savedAs ?? saveImageFile(part.data, part.mimeType, label);
  try {
    const resized = await resizeImage(Buffer.from(part.data, 'base64'), part.mimeType, { ...(options.limits ?? imageLimits()), maxBytes: budget });
    if (resized && resized.data.length <= budget) {
      const dimensions = formatDimensionNote(resized);
      return [
        { ...part, data: resized.data, mimeType: resized.mimeType },
        { type: 'text', text: `[Image fitted for context. ${file ? `Original saved to ${file}.` : 'The original could not be saved.'}${dimensions ? ` ${dimensions}` : ''}]` },
      ];
    }
  } catch {
    // Invalid encodings or an unavailable image worker still leave the original file reachable.
  }
  const size = formatSize(Math.floor((part.data.length * 3) / 4));
  return [{ type: 'text', text: `[${part.mimeType} image of ${size} left out: too large for the context. ${file ? `Saved to ${file}.` : 'It could not be saved.'}]` }];
}
