import { isRecord } from '../shared/util.js';

/**
 * Which lines of a file the model has seen. Pi's `read` shows at most 2000 lines or 50 KB, so a big file is never seen
 * in one read: a full write over it is allowed once the reads together cover every line (`firstGap`).
 */

/** An inclusive, 1-based range of lines; `last` is Infinity when the read ran to the end of the file. */
export type LineRange = readonly [first: number, last: number];

/** What one `read` result showed of its file. */
export interface ReadView {
  /** The whole file: an untruncated read with no offset or limit, or an image (all the tool can show of it). */
  whole: boolean;
  /** For a partial read: the lines it returned, when known. */
  lines?: LineRange;
}

/** The view a Pi `read` result gives, or undefined for any other tool. */
export function readView(toolName: string, input: Record<string, unknown>, content: unknown, details: unknown): ReadView | undefined {
  if (toolName !== 'read') return undefined;
  if (Array.isArray(content) && content.some((part) => isRecord(part) && part['type'] === 'image')) return { whole: true };
  const truncation = isRecord(details) ? details['truncation'] : undefined;
  const { offset, limit } = input;
  if (offset === undefined && limit === undefined && truncation === undefined) return { whole: true };
  const first = typeof offset === 'number' && offset >= 1 ? Math.floor(offset) : 1;
  let last: number | undefined = Infinity;
  if (truncation !== undefined) last = isRecord(truncation) && typeof truncation['outputLines'] === 'number' ? first + truncation['outputLines'] - 1 : undefined;
  else if (typeof limit === 'number') last = first + Math.floor(limit) - 1;
  return { whole: false, ...(last !== undefined && last >= first ? { lines: [first, last] as const } : {}) };
}

/** `ranges` plus `add`, sorted, with overlapping and adjacent ranges joined. */
export function mergeRanges(ranges: readonly LineRange[], add?: LineRange): LineRange[] {
  const sorted = (add ? [...ranges, add] : [...ranges]).sort((a, b) => a[0] - b[0]);
  const merged: LineRange[] = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && range[0] <= previous[1] + 1) merged[merged.length - 1] = [previous[0], Math.max(previous[1], range[1])];
    else merged.push(range);
  }
  return merged;
}

/** The number of lines in `data`: a final newline ends a line rather than starting an empty one. */
export function lineCount(data: Buffer): number {
  if (data.length === 0) return 0;
  let count = data[data.length - 1] === 0x0a ? 0 : 1;
  for (const byte of data) if (byte === 0x0a) count++;
  return count;
}

/** The first line of 1..`count` that `ranges` (merged, sorted) do not cover; undefined when they cover all. */
export function firstGap(ranges: readonly LineRange[], count: number): number | undefined {
  let next = 1;
  for (const [first, last] of ranges) {
    if (first > next) break;
    next = Math.max(next, last + 1);
  }
  return next > count ? undefined : next;
}

/** `1–2000, 2501–3000`, or `part` when the lines are unknown. */
export function describeRanges(ranges: readonly LineRange[]): string {
  return ranges.length === 0 ? 'only part' : ranges.map(([first, last]) => (Number.isFinite(last) ? `lines ${first}–${last}` : `lines ${first} to the end`)).join(', ');
}
