import { isRecord } from '../shared/util.js';
import { ACTION_CLASSES, ASK_REASONS, type ActionClass, type AskReason } from './mode.js';

/**
 * The first line of a subagent's permission prompt: what its parent needs to answer the prompt without a dialog when the
 * parent's own mode already allows the action. It is an optimization only: a title with no valid header is shown whole.
 * Built with `JSON.stringify`, so it is always one line; read from the first line of the title and nowhere else.
 */
export const HEADER_PREFIX = 'octocode-permission/1 ';

export interface PermissionHeader {
  action: ActionClass;
  /** Other classes the same call is: each must be allowed. */
  also: ActionClass[];
  /** Every reason on the call (a reason only tightens, so the parent checks each against its own mode). */
  reasons: AskReason[];
  /** The child's option labels, as the dialog offers them. */
  options: string[];
  /** The call's targets as the audit names them. */
  what: string[];
}

export const permissionHeader = (header: PermissionHeader): string => `${HEADER_PREFIX}${JSON.stringify(header)}`;

const strings = (value: unknown): string[] | undefined => (Array.isArray(value) && value.every((item) => typeof item === 'string') ? (value as string[]) : undefined);
const subset = <T extends string>(value: unknown, allowed: readonly T[]): T[] | undefined => {
  const items = strings(value);
  return items && items.every((item) => (allowed as readonly string[]).includes(item)) ? (items as T[]) : undefined;
};

/**
 * `title` without a header line, and the header when it is valid. A first line that starts like a header is always
 * dropped from what the user sees, valid or not; an invalid one yields no header.
 */
export function splitHeader(title: string): { title: string; header?: PermissionHeader } {
  if (!title.startsWith(HEADER_PREFIX)) return { title };
  const end = title.indexOf('\n');
  const line = end < 0 ? title : title.slice(0, end);
  const rest = end < 0 ? '' : title.slice(end + 1);
  let raw: unknown;
  try {
    raw = JSON.parse(line.slice(HEADER_PREFIX.length));
  } catch {
    return { title: rest };
  }
  if (!isRecord(raw)) return { title: rest };
  const action = ACTION_CLASSES.find((each) => each === raw['action']);
  const also = subset(raw['also'], ACTION_CLASSES);
  const reasons = subset(raw['reasons'], ASK_REASONS);
  const options = strings(raw['options']);
  const what = strings(raw['what']);
  return action && also && reasons && options && what ? { title: rest, header: { action, also, reasons, options, what } } : { title: rest };
}
