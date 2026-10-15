import fs from 'node:fs';
import { tildePath } from '../shared/home.js';
import { clipText, isRecord } from '../shared/util.js';
import { JOB_TYPE } from '../files/bash-jobs.js';
import { RESULT_TYPE } from '../subagents/handoff.js';
import { shownLine } from './store.js';

/**
 * Background work recorded in a session's entries: `bash` calls with `background: true` (result `details.job` and
 * `details.log`, report `JOB_TYPE` with the same log) and background `agent` calls (result `details.status`
 * `background` and `details.id`, report `RESULT_TYPE` with the same id). A start without its report is work
 * still running in this process, or, read when a session starts, work that ended with an earlier process unreported.
 */
interface BackgroundWork {
  kind: 'bash' | 'agent';
  id: string;
  /** The bash command or the subagent task, on one line. */
  label: string;
  /** A bash job's log file. */
  log?: string;
}

/** Longest command or task shown for one item. */
const LABEL_CHARS = 60;

/** Bash job ids restart with each extension instance; the log path (id plus start time) is unique. */
const jobKey = (id: string, log: string | undefined) => (log ? `log:${log}` : `id:${id}`);

/** The unreported work in `entries`, oldest first; with `since` (ms), only work started at or after it. */
export function unreportedWork(entries: readonly unknown[], since?: number): BackgroundWork[] {
  const args = new Map<string, Record<string, unknown>>();
  const started = new Map<string, BackgroundWork>();
  const reported = new Set<string>();
  for (const entry of entries) {
    if (!isRecord(entry)) continue;
    if (entry['type'] === 'custom_message') {
      const details = isRecord(entry['details']) ? entry['details'] : {};
      const id = typeof details['id'] === 'string' ? details['id'] : undefined;
      if (!id) continue;
      if (entry['customType'] === JOB_TYPE) {
        const log = typeof details['log'] === 'string' ? details['log'] : undefined;
        reported.add(jobKey(id, log));
      } else if (entry['customType'] === RESULT_TYPE) reported.add(`agent:${id}`);
      continue;
    }
    const message = entry['type'] === 'message' && isRecord(entry['message']) ? entry['message'] : undefined;
    if (!message) continue;
    if (message['role'] === 'assistant' && Array.isArray(message['content'])) {
      for (const part of message['content']) if (isRecord(part) && part['type'] === 'toolCall' && typeof part['id'] === 'string' && isRecord(part['arguments'])) args.set(part['id'], part['arguments']);
      continue;
    }
    if (message['role'] !== 'toolResult' || message['isError'] === true || !isRecord(message['details'])) continue;
    if (since !== undefined && !(Date.parse(String(entry['timestamp'] ?? '')) >= since)) continue;
    const details = message['details'];
    const input = args.get(String(message['toolCallId'])) ?? {};
    if (message['toolName'] === 'bash' && typeof details['job'] === 'string') {
      const log = typeof details['log'] === 'string' ? details['log'] : undefined;
      started.set(jobKey(details['job'], log), { kind: 'bash', id: details['job'], label: shownLine(String(input['command'] ?? ''), LABEL_CHARS), ...(log ? { log } : {}) });
    } else if (message['toolName'] === 'agent' && details['status'] === 'background' && typeof details['id'] === 'string') {
      started.set(`agent:${details['id']}`, { kind: 'agent', id: details['id'], label: shownLine(String(input['task'] ?? ''), LABEL_CHARS) });
    }
  }
  return [...started].filter(([key]) => !reported.has(key)).map(([, work]) => work);
}

/**
 * One item per line part: `bash-3 (`yarn test`, log ~/…/bash-3-….log)` or `general-ab12 (task "…")`. A log that is
 * gone (the retention sweep removed it) is not offered.
 */
export function describeWork(work: BackgroundWork, checkLog = true): string {
  if (work.kind === 'agent') return `${work.id} (task "${work.label}")`;
  const log = work.log ? (!checkLog || fs.existsSync(work.log) ? `, log ${tildePath(work.log)}` : ', log deleted') : '';
  return `${work.id} (\`${work.label}\`${log})`;
}

/**
 * `items` joined with `; ` within `max` characters, ending with `+N more` when some did not fit (the count, never a bare
 * cut). A first item longer than the budget alone is clipped.
 */
export function workList(items: readonly string[], max: number): string {
  let text = '';
  for (const [index, item] of items.entries()) {
    const next = text ? `${text}; ${item}` : item;
    const rest = items.length - index - 1;
    const more = rest > 0 ? `; +${rest} more` : '';
    if (next.length + more.length > max) return text ? `${text}; +${rest + 1} more` : `${clipText(item, max - more.length)}${more}`;
    text = next;
  }
  return text;
}

/** The first `max` of `items` joined with `; `, then `; +N more` for the rest. */
export function countedList(items: readonly string[], max: number): string {
  return `${items.slice(0, max).join('; ')}${items.length > max ? `; +${items.length - max} more` : ''}`;
}
