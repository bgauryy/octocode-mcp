import os from 'node:os';
import path from 'node:path';
import type { SessionEntry } from '@earendil-works/pi-coding-agent';
import { JOB_TYPE } from '../files/bash-jobs.js';
import { shortPath } from '../shared/format.js';
import { sessionsRoot, tildePath } from '../shared/home.js';
import { saveFullOutput } from '../shared/spill.js';
import { contentText, escapeRegExp, isRecord } from '../shared/util.js';

/**
 * The files Octocode saved from the part of the conversation a summary replaces. A result bounded when written
 * (`capOutputToFile`: "Output trimmed … Full output: <path>"), a screenshot or image original, a fetched page, a bash log
 * and a result cleared after the prompt cache went cold (`clearing.ts`) each hold their whole text in the session's
 * `output/` or `bash/` folder and name that file only in the result itself. Compaction drops the result, so without
 * this the model would be told, in a result it no longer sees, that evidence was saved and never learn where.
 *
 * Like `<read-files>` and `<modified-files>`, the paths are appended to the summary's text by code, and kept in the
 * compaction's `details.savedResults` so the next summary carries them on. One source finds them: a path under the
 * sessions folder in a tool result's text or a finished background job's report, or the file a clearing entry recorded for a result.
 */

/** The compaction `details` key that carries the paths into the next summary. */
export const SAVED_RESULTS_DETAILS = 'savedResults';

/**
 * The most characters of paths listed in the summary itself (about 750 tokens, some 25 paths): a longer list is written
 * whole to a file and the summary names that file, so a long session's summary does not refill the context it frees.
 */
export const SAVED_RESULTS_INLINE_CHARS = 3_000;

const OPEN = '<saved-results>';
const CLOSE = '</saved-results>';
const OPEN_PREFIX = '<saved-results';
/** The block `savedResultsBlock` writes, from its blank line to its closing tag, with the count when it is a pointer. */
const CODE_BLOCK = /^\n\n<saved-results(?: count="\d+")?>\n[\s\S]*?\n<\/saved-results>$/;
/** A block as the model might write one anywhere in its text, with the blank lines before it. */
const ANY_BLOCK = /\n*<saved-results(?: count="\d+")?>\n[\s\S]*?\n<\/saved-results>/g;

/**
 * `body` without the block this module wrote, so a model updating an earlier summary never copies it. Code appends the
 * block last, so only the last block, and only when it ends `body`, is removed; text the model wrote stays.
 */
export function withoutSavedResults(body: string): string {
  const at = body.lastIndexOf(`\n\n${OPEN_PREFIX}`);
  return at >= 0 && CODE_BLOCK.test(body.slice(at)) ? body.slice(0, at) : body;
}

/**
 * The model's summary without any `<saved-results>` block it wrote itself: code owns that block (it appends the one
 * list of saved files), so a second one from the model would duplicate it or contradict it.
 */
export function withoutModelSavedResults(summary: string): string {
  return summary.replace(ANY_BLOCK, '');
}

/**
 * Every spelling the notes give a saved file's path: absolute, relative to the working directory, or under `~`
 * (`shortPath`), then the folders `<session>/output|bash/<name>`.
 */
function savedPathPattern(root: string): RegExp {
  const prefixes = [...new Set([root, shortPath(root), tildePath(root)])].sort((a, b) => b.length - a.length);
  const separator = '[\\\\/]';
  return new RegExp(`(?<![\\w.~/\\\\-])(?:${prefixes.map(escapeRegExp).join('|')})${separator}[\\w.-]+${separator}(?:output|bash)${separator}[\\w.-]*\\w`, 'g');
}

/** The absolute path a spelling of a saved file names, or undefined when it is not under the sessions folder. */
function resolveSaved(spelling: string, root: string): string | undefined {
  const file = spelling.startsWith('~') ? path.join(os.homedir(), spelling.slice(1)) : path.resolve(spelling);
  return file.startsWith(`${root}${path.sep}`) ? file : undefined;
}

/** The files in the sessions folder that `text` names, absolute, in order of appearance. */
function savedPaths(text: string): string[] {
  const root = sessionsRoot();
  return [...text.matchAll(savedPathPattern(root))].flatMap((match) => resolveSaved(match[0], root) ?? []);
}

/**
 * The paths earlier summaries of Octocode's carried: those of the latest compaction on the branch that has them. A
 * compaction that fell back to Pi's default summary has no `details.savedResults`, so the walk goes on to the one before.
 */
export function carriedSavedResults(branch: readonly SessionEntry[]): string[] {
  for (const entry of [...branch].reverse()) {
    if (entry.type !== 'compaction' || !isRecord(entry.details)) continue;
    const carried = entry.details[SAVED_RESULTS_DETAILS];
    if (Array.isArray(carried)) return carried.filter((item): item is string => typeof item === 'string');
  }
  return [];
}

/**
 * Each file saved from the summarized `messages`, once: those `carried` from the earlier summary, then the paths a tool
 * result or job report names, then the file `cleared` (tool call id → saved copy, `clearedResults`) holds for a result that was cleared.
 */
export function savedResultPaths(messages: readonly unknown[], cleared: ReadonlyMap<string, string>, carried: readonly string[] = []): string[] {
  const found = new Set(carried);
  for (const message of messages) {
    // A finished background job's report names its log (and the older part after a rotation) like a result does.
    if (isRecord(message) && message['role'] === 'custom' && message['customType'] === JOB_TYPE) for (const file of savedPaths(contentText(message['content']))) found.add(file);
    if (!isRecord(message) || message['role'] !== 'toolResult') continue;
    for (const file of savedPaths(contentText(message['content']))) found.add(file);
    const copy = cleared.get(String(message['toolCallId']));
    if (copy !== undefined) for (const file of savedPaths(copy)) found.add(file);
  }
  return [...found];
}

/**
 * The summary's block of saved files, empty when there are none: the paths listed one per line, or (over
 * `SAVED_RESULTS_INLINE_CHARS`) a pointer to a file in the session's output folder that lists them all. When that file
 * cannot be written the whole list stays in the summary.
 */
export function savedResultsBlock(files: readonly string[]): string {
  if (files.length === 0) return '';
  const lines = files.map((file) => shortPath(file));
  const list = lines.join('\n');
  const spilled = list.length > SAVED_RESULTS_INLINE_CHARS ? saveFullOutput(`${list}\n`, 'saved-results') : undefined;
  if (spilled === undefined) return `\n\n${OPEN}\nTool results this summary leaves out are saved whole in these files; read or search them:\n${list}\n${CLOSE}`;
  return `\n\n<saved-results count="${files.length}">\nTool results this summary leaves out are saved whole in ${files.length} files, listed one per line in ${shortPath(spilled)}; read or search that list for the one you need.\n${CLOSE}`;
}
