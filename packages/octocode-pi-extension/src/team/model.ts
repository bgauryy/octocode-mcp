import { num, type Row } from '../agentdb/rows.js';

/** The team's records as the rest of the extension sees them, and how they are read from database rows. */

export interface Member {
  /** Unique across the shared database, and the address used by sendMessage: a name from `names.ts` (`inky-kraken`). */
  id: string;
  /** `main` for a session, the profile name (or `general`) for a subagent: what it is, where `id` says who. */
  role: string;
  parentId?: string;
  pid: number;
  /** When the process `pid` names started (`processStartTime`), absent where unknown: with the pid it names one process, which a later one that got the pid is not. */
  started?: string;
  status: 'idle' | 'working';
  /** What it works on, any length (`checkGoal` in `identity.ts` refuses only a missing one). Stored in the `task` column. */
  goal?: string;
  /** The tool it is running right now. */
  activity?: string;
  /** The model it runs (`claude-opus-4-5`), as Pi names it; absent until known. */
  model?: string;
  joinedAt: number;
  updatedAt: number;
  toolCalls: number;
  /** Every prompt token it sent (uncached, cache reads and writes); `cacheRead` is the part read from cache. */
  input: number;
  cacheRead: number;
  output: number;
  /** Pi's estimate at list rates, without the replies of a model with no pricing (`unpriced` says there were some). */
  cost: number;
  unpriced: boolean;
  /** Set by `list`: messages it received that still need an answer. */
  pending?: number;
  /** Set by `list`: paths it has reserved (trees end with `/`). */
  locks?: string[];
}

export interface Message {
  id: number;
  from: string;
  to: string;
  text: string;
  at: number;
  replyRequired: boolean;
  replyTo?: number;
  /** Whether it may start a turn of an idle recipient; decided when sent (`TeamStore.send`); absent means it waits. */
  wake?: boolean;
  /** Set when delivered: the sender's role and goal, unless it already left the team. */
  sender?: { role: string; goal?: string };
  /** Set when it stops a busy recipient's current step (its running tool is cancelled) and continues the run with it. */
  interrupt?: boolean;
  /** Set on a message the user typed for this recipient: the signature the parent made with the secret it gave the recipient (`userProof`). */
  proof?: string;
}

/** How a message is sent: whether it asks for a reply, which message it answers, and whether it interrupts. */
export interface SendOptions {
  replyRequired?: boolean;
  replyTo?: number;
  interrupt?: boolean;
}

/**
 * What a team message carries in Pi's `details`: the messages it puts in front of the model, oldest first. A team
 * notice (a lapsed reservation, a dead letter) is one entry without an id.
 */
export interface MailDetails {
  messages: Array<Pick<Message, 'from' | 'text' | 'at'> & Partial<Message>>;
}

/** A message whose recipients left before reading it, for its sender. */
export interface DeadLetter {
  id: number;
  recipients: string[];
  text: string;
}

/** One message as the user sees it in the feed: who talked to whom, and how far it got. */
export interface Traffic {
  id: number;
  from: string;
  to: string[];
  text: string;
  at: number;
  replyTo?: number;
  state: 'queued' | 'delivered' | 'awaiting reply' | 'answered' | 'dead-lettered';
}

export interface Lease {
  id: number;
  path: string;
  kind: 'file' | 'tree';
  owner: string;
  reason: string;
  acquiredAt: number;
  expiresAt: number;
}

export type LeaseRequest = Pick<Lease, 'path' | 'kind' | 'reason'>;

export const text = (value: unknown) => (typeof value === 'string' ? value : undefined);

export function toMember(row: Row): Member {
  const goal = text(row['task']);
  const activity = text(row['activity']);
  const parentId = text(row['parent_id']);
  const model = text(row['model']);
  const started = text(row['started']);
  return {
    id: String(row['id']),
    role: String(row['role']),
    ...(parentId ? { parentId } : {}),
    pid: num(row['pid']),
    ...(started ? { started } : {}),
    status: row['status'] === 'working' ? 'working' : 'idle',
    ...(goal ? { goal } : {}),
    ...(activity ? { activity } : {}),
    ...(model ? { model } : {}),
    joinedAt: num(row['joined_at']),
    updatedAt: num(row['seen_at']),
    toolCalls: num(row['tool_calls']),
    input: num(row['input']),
    cacheRead: num(row['cache_read']),
    output: num(row['output']),
    cost: num(row['cost']),
    unpriced: num(row['unpriced']) === 1,
    pending: num(row['pending']),
  };
}

/** One `messages` row and its `deliveries` rows as the feed shows it: queued until every recipient saw it or left. */
export function toTraffic(row: Row, deliveries: Row[]): Traffic {
  const state: Traffic['state'] =
    deliveries.some((d) => d['delivered_at'] === null && d['dead_at'] === null)
      ? 'queued'
      : deliveries.length === 0 || deliveries.some((d) => d['dead_at'] !== null)
        ? 'dead-lettered'
        : row['reply_required'] === 1
          ? deliveries.every((d) => d['completed_at'] !== null) ? 'answered' : 'awaiting reply'
          : 'delivered';
  const replyTo = row['reply_to'];
  return { id: num(row['id']), from: String(row['sender']), to: deliveries.map((d) => String(d['recipient'])), text: String(row['body']), at: num(row['created_at']), ...(typeof replyTo === 'number' ? { replyTo } : {}), state };
}

export function toLease(row: Row): Lease {
  return { id: num(row['id']), path: String(row['path']), kind: row['kind'] === 'tree' ? 'tree' : 'file', owner: String(row['owner']), reason: String(row['reason']), acquiredAt: num(row['acquired_at']), expiresAt: num(row['expires_at']) };
}


/** A message waiting for `to`, from a row that also carries the sender's role and goal (`sender_role`, `sender_goal`) while it is still on the team. */
export function toMessage(row: Row, to: string): Message {
  const replyTo = row['reply_to'];
  const wake = row['wake'];
  const role = text(row['sender_role']);
  const goal = text(row['sender_goal']);
  return {
    id: num(row['id']), from: String(row['sender']), to, text: String(row['body']), at: num(row['created_at']), replyRequired: row['reply_required'] === 1,
    ...(typeof replyTo === 'number' ? { replyTo } : {}),
    wake: num(wake) >= 1,
    ...(wake === 2 ? { interrupt: true } : {}),
    ...(typeof row['proof'] === 'string' ? { proof: row['proof'] } : {}),
    ...(role ? { sender: { role, ...(goal ? { goal } : {}) } } : {}),
  };
}
