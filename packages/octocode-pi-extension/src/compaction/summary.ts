import type { Api, Context, Model, SimpleStreamOptions } from '@earendil-works/pi-ai';
import { compact, type ExtensionAPI, type ExtensionContext, type SessionBeforeCompactEvent, type SessionBeforeCompactResult, type SessionEntry } from '@earendil-works/pi-coding-agent';
import { tildePath } from '../shared/home.js';
import { errorMessage, isRecord } from '../shared/util.js';

/**
 * The compaction summary. Pi's own summary (goal, constraints, progress, decisions, next steps, critical context, file
 * lists) loses what a resumed agent most needs verbatim: the user's own words, the errors already solved, and where
 * the work stopped. Pi gives a hook no way to add to its prompt, so Octocode calls Pi's exported `compact()` (same
 * cut point, split-turn handling, iterative update of the previous summary and file lists) with this add-on joined to
 * the user's `/compact` instructions. Code, not the model, then appends the user's messages word for word (newest
 * first within a budget, carried across compactions), and the transcript that still holds every detail. Any failure
 * returns nothing, and Pi writes its default summary.
 */

/** The user's own messages kept after the summary, newest first, up to about 15k tokens in all... */
export const USER_MESSAGES_CHARS = 60_000;
/** ...each cut in the middle beyond this, with a note that the transcript holds the whole message. */
export const USER_MESSAGE_CHARS = 6_000;

/**
 * Characters a compaction add-on may take of the window it lands in: `share` of what is left after Pi's reserve
 * (four characters a token), never above `max`. Zero when the window is unknown-small, so a small model is not
 * refilled to its threshold by what compaction itself adds.
 */
export function windowBudget(contextWindow: number | undefined, reserveTokens: number, share: number, max: number): number {
  if (!contextWindow) return max;
  return Math.max(0, Math.min(max, Math.floor((contextWindow - reserveTokens) * 4 * share)));
}

/** Of the room after the reserve, the kept user messages take at most this share. */
export const USER_MESSAGES_SHARE = 0.1;

const USER_HEADING = '## User Messages (verbatim, oldest first)';
const RECOVERY_HEADING = '## Recovery';

/** Appended to Pi's summarization prompt (after its fixed sections, as "Additional focus"). */
export const SUMMARY_FOCUS = `This summary becomes the only record of the conversation above: the next model will not see those messages, and what the summary leaves out it will not know to look for. The user's messages are appended after your summary word for word by code, so do not copy them; state what they ask, decided and corrected. Condense the assistant's own reasoning and narration, but keep what the work found exactly: numbers, sizes, lists, names, states, error strings and conclusions. Detail that can be fetched again (a file, a command's output, a page) needs only a pointer: its path, command or URL. Images do not reach you: where the messages show an image was read, attached or captured, keep its path and what was said about it.

Also add these sections after "## Critical Context", in this order:

## Errors & Fixes
- Each error or failed approach: the exact error text, its cause, and the fix, or "unresolved". Include the user's corrections of your approach.

## Where We Stopped
- The work under way in the last messages above, with exact file paths, and a verbatim quote of the latest user request and of the assistant's last step. Name a next step only if it follows directly from that request; never start tangential work.

## Follow-ups
- Work promised, deferred or suggested but not started, and open questions for the user, or "(none)".

Everywhere, keep file paths, symbols, commands, error strings, URLs and identifiers exact. When updating a previous summary, keep the entries of these sections and add the new ones; newer messages win where they contradict, resolve or supersede it. Write only what the messages show; never guess.`;

/** The instructions passed to `compact()`: the user's own first, then the add-on. */
export function summaryInstructions(custom: string | undefined): string {
  return custom?.trim() ? `${custom.trim()}\n\n${SUMMARY_FOCUS}` : SUMMARY_FOCUS;
}

/** Where the summarized messages stay verbatim, appended to the summary so exact details are read, not guessed. */
export function transcriptNote(sessionFile: string | undefined, backlog: boolean): string {
  const lines = [
    ...(sessionFile ? [`The full transcript before this summary is ${tildePath(sessionFile)} (JSONL, one entry per line): search it for an exact message, error or tool result instead of guessing.`] : []),
    ...(backlog ? ['Record follow-ups that must outlive this session with `backlog`.'] : []),
  ];
  return lines.length > 0 ? `\n\n${RECOVERY_HEADING}\n${lines.map((line) => `- ${line}`).join('\n')}` : '';
}

/** A summary split into the model's part and what code appended: the kept user messages (oldest first) and how many older ones were left out. */
export interface SplitSummary {
  body: string;
  messages: string[];
  omitted: number;
}

/** Splits a summary this module wrote; any other summary is all body. */
export function splitSummary(summary: string): SplitSummary {
  let body = summary.replace(new RegExp(`\\n\\n${RECOVERY_HEADING}\\n(?:- [^\\n]*(?:\\n|$))+$`), '');
  const at = body.lastIndexOf(`\n\n${USER_HEADING}\n`);
  if (at < 0) return { body, messages: [], omitted: 0 };
  const section = body.slice(at);
  body = body.slice(0, at);
  const messages = [...section.matchAll(/<user-message>\n([\s\S]*?)\n<\/user-message>/g)].map((match) => match[1]!);
  const omitted = Number(new RegExp(`^\\n\\n${escapeRegExp(USER_HEADING)}\\nEarlier user messages not kept here: (\\d+)`).exec(section)?.[1] ?? 0);
  return { body, messages, omitted };
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * User text made inert inside the section: its own `<user-message>` tags and a line starting like the section heading
 * get a backslash, so a pasted summary or a quote of this feature cannot split or fake the section.
 */
export function inertUserText(text: string): string {
  return text.replace(/<(\/?)user-message>/g, '<\\$1user-message>').replace(/^## User Messages/gm, '\\## User Messages');
}

/** A user message's text as the model saw it: its text parts, and a marker for each attached image. */
export function userText(message: unknown): string | undefined {
  if (!isRecord(message) || message['role'] !== 'user') return undefined;
  const content = message['content'];
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return undefined;
  const parts = content.flatMap((part) => {
    if (!isRecord(part)) return [];
    if (part['type'] === 'text' && typeof part['text'] === 'string') return [part['text']];
    return part['type'] === 'image' ? ['[image attached]'] : [];
  });
  return parts.length > 0 ? parts.join('\n') : undefined;
}

/** One message cut in the middle to `max` characters, with a note that the transcript has it whole. */
function cutMessage(text: string, max: number): string {
  if (text.length <= max) return text;
  const half = Math.floor(max / 2);
  return `${text.slice(0, half)}\n[… ${text.length - 2 * half} characters of this message are left out here; the transcript has it whole]\n${text.slice(-half)}`;
}

/**
 * The user-messages section: earlier kept messages then the new ones, the newest kept first while they fit
 * `USER_MESSAGES_CHARS`, each cut to `USER_MESSAGE_CHARS`. Empty when there are none.
 */
export function userMessagesSection(earlier: readonly string[], omittedBefore: number, added: readonly string[], budget = { total: USER_MESSAGES_CHARS, perMessage: USER_MESSAGE_CHARS }): string {
  const all = [...earlier, ...added.map((text) => cutMessage(inertUserText(text), budget.perMessage))];
  const kept: string[] = [];
  let used = 0;
  for (let index = all.length - 1; index >= 0; index--) {
    const text = all[index]!;
    if (used + text.length > budget.total && kept.length > 0) break;
    kept.unshift(text);
    used += text.length;
  }
  const omitted = omittedBefore + all.length - kept.length;
  if (kept.length === 0) return '';
  const note = omitted > 0 ? `\nEarlier user messages not kept here: ${omitted} (the transcript has them).` : '';
  return `\n\n${USER_HEADING}${note}\n${kept.map((text) => `<user-message>\n${text}\n</user-message>`).join('\n')}`;
}

/**
 * Pi carries the file lists of the previous summary forward only when Pi wrote it; this summary is a hook's, so its
 * lists (the same `readFiles`/`modifiedFiles` details) are added back to the preparation here (in place).
 */
export function carryFileLists(preparation: Pick<SessionBeforeCompactEvent['preparation'], 'fileOps'>, branch: readonly SessionEntry[]): void {
  const previous = [...branch].reverse().find((entry) => entry.type === 'compaction');
  if (previous?.type !== 'compaction' || !previous.fromHook || !isRecord(previous.details)) return;
  const strings = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);
  for (const file of strings(previous.details['readFiles'])) preparation.fileOps.read.add(file);
  for (const file of strings(previous.details['modifiedFiles'])) preparation.fileOps.edited.add(file);
}

/** Pi shows the summarizer only the first 2,000 characters of each tool result (`TOOL_RESULT_MAX_CHARS`). */
export const SUMMARIZER_RESULT_CHARS = 2_000;
/** Of those, a long result keeps this much of its head; the rest of the room goes to its tail. */
const SUMMARIZER_HEAD_CHARS = 1_000;

/**
 * The messages as the summarizer should read them: a tool result longer than Pi's cut keeps its head and its tail
 * (where a test run, build or stack trace puts its errors and verdict) within that cut, instead of the head alone.
 * Copies; the session's messages are never changed.
 */
export function summarizerView<T>(messages: readonly T[]): T[] {
  return messages.map((message) => {
    if (!isRecord(message) || message['role'] !== 'toolResult' || !Array.isArray(message['content'])) return message;
    const content = message['content'] as unknown[];
    const text = content.flatMap((part) => (isRecord(part) && part['type'] === 'text' && typeof part['text'] === 'string' ? [part['text']] : [])).join('\n');
    if (text.length <= SUMMARIZER_RESULT_CHARS) return message;
    const gap = (left: number) => `\n[… ${left} characters in the middle left out for the summary; the transcript has them]\n`;
    const room = SUMMARIZER_RESULT_CHARS - SUMMARIZER_HEAD_CHARS - gap(text.length).length;
    const kept = `${text.slice(0, SUMMARIZER_HEAD_CHARS)}${gap(text.length - SUMMARIZER_HEAD_CHARS - room)}${text.slice(text.length - room)}`;
    const others = content.filter((part) => !(isRecord(part) && part['type'] === 'text'));
    return { ...message, content: [{ type: 'text', text: kept }, ...others] } as T;
  });
}

/** Octocode's compaction result, or undefined to let Pi write its default summary. */
export async function writeSummary(
  pi: Pick<ExtensionAPI, 'getThinkingLevel' | 'getActiveTools'>,
  event: SessionBeforeCompactEvent,
  ctx: Pick<ExtensionContext, 'model' | 'modelRegistry' | 'sessionManager' | 'hasUI' | 'ui'>,
  summaryModel?: Model<Api>,
): Promise<SessionBeforeCompactResult | undefined> {
  // A compaction before a downshift summarizes on the model the context still fits.
  const model = summaryModel ?? ctx.model;
  if (!model || event.signal.aborted) return undefined;
  try {
    // Through the model registry, as Pi's own session streams: request-time auth, and providers an extension registered.
    const stream = (request: typeof model, context: Context, options?: SimpleStreamOptions) => ctx.modelRegistry.streamSimple(request, context, options);
    const instructions = summaryInstructions(event.customInstructions);
    // The model updates only its own part of the previous summary; code carries the user messages and the note.
    const previous = event.preparation.previousSummary === undefined ? undefined : splitSummary(event.preparation.previousSummary);
    const preparation = {
      ...event.preparation,
      messagesToSummarize: summarizerView(event.preparation.messagesToSummarize),
      turnPrefixMessages: summarizerView(event.preparation.turnPrefixMessages),
      ...(previous === undefined ? {} : { previousSummary: previous.body }),
    };
    const result = await compact(preparation, model, undefined, undefined, instructions, event.signal, pi.getThinkingLevel(), stream);
    const added = [...event.preparation.messagesToSummarize, ...event.preparation.turnPrefixMessages].flatMap((message) => userText(message) ?? []);
    // Sized for the window the summary lands in (this session's model; after a downshift, the smaller one).
    const total = windowBudget(ctx.model?.contextWindow, event.preparation.settings.reserveTokens, USER_MESSAGES_SHARE, USER_MESSAGES_CHARS);
    const messages = userMessagesSection(previous?.messages ?? [], previous?.omitted ?? 0, added, { total, perMessage: Math.min(USER_MESSAGE_CHARS, Math.max(500, Math.floor(total / 4))) });
    const note = transcriptNote(ctx.sessionManager.getSessionFile(), pi.getActiveTools().includes('backlog'));
    return { compaction: { ...result, summary: `${result.summary}${messages}${note}` } };
  } catch (error) {
    if (!event.signal.aborted && ctx.hasUI) ctx.ui.notify(`Octocode's compaction summary failed (${errorMessage(error)}); Pi writes its default summary.`, 'warning');
    return undefined;
  }
}
