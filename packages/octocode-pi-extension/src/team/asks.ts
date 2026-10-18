import { formatDuration } from '../shared/format.js';

/**
 * A child's questions to its parent, measured: a message the child sent its parent with `replyRequired`, and the reply
 * to it (a message with `replyTo` that id). Pure data: nothing here classifies a question.
 */
export interface Ask {
  /** The question's message number. */
  id: number;
  /** The question as stored: at most `MESSAGE_MAX_CHARS`, a longer one holds its start and the path of the file with the whole text. */
  text: string;
  askedAt: number;
  /** Absent while nobody answered. */
  answer?: {
    /** The reply's message number. */
    id: number;
    at: number;
    /** The agent that answered (the parent). */
    by: string;
    /** The parent ran `askUser` after the question arrived and finished before it answered: the answer may be the user's. */
    afterAskUser?: true;
  };
}

/** How long the question waited: until its answer, or until `now` while it is open. */
export const askWaitMs = (ask: Ask, now: number): number => Math.max(0, (ask.answer?.at ?? now) - ask.askedAt);

/**
 * `2 asks (1 answered in 40s after askUser, 1 unanswered)`: the count shown in `/agents` and the report's footer.
 * Empty for no asks.
 */
export function asksLabel(asks: readonly Ask[] | undefined): string {
  if (!asks || asks.length === 0) return '';
  const answered = asks.filter((ask) => ask.answer);
  const open = asks.length - answered.length;
  const waits = answered.map((ask) => formatDuration(askWaitMs(ask, ask.askedAt)));
  const viaUser = answered.filter((ask) => ask.answer!.afterAskUser).length;
  const parts = [
    answered.length > 0 ? `${answered.length} answered in ${waits.join(', ')}${viaUser > 0 ? ` (${viaUser} after askUser)` : ''}` : '',
    open > 0 ? `${open} unanswered` : '',
  ].filter(Boolean);
  return `${asks.length} ${asks.length === 1 ? 'ask' : 'asks'} (${parts.join(', ')})`;
}

/** The footer line of a run's report: `Asks to its parent: 2 asks (…).` Empty for no asks. */
export function asksNote(asks: readonly Ask[] | undefined): string {
  const label = asksLabel(asks);
  return label ? `Asks to its parent: ${label}.` : '';
}

/** How long a finished `askUser` window is kept: the message history it is read against is kept a day. */
const WINDOW_KEPT_MS = 24 * 60 * 60_000;

/**
 * When this session's own `askUser` calls ran. A question the parent answers right after one it asked the user may
 * carry the user's answer; the database cannot say, because the parent writes the reply either way.
 */
export class UserQuestions {
  private readonly open = new Map<string, number>();
  private windows: Array<{ from: number; to: number }> = [];

  begin(call: string, at = Date.now()): void {
    this.open.set(call, at);
  }

  end(call: string, at = Date.now()): void {
    const from = this.open.get(call);
    if (from === undefined) return;
    this.open.delete(call);
    this.windows = [...this.windows.filter((window) => window.to > at - WINDOW_KEPT_MS), { from, to: at }];
  }

  /** The asks with `afterAskUser` set on answers that followed a finished `askUser` call, started after the question and ended before the answer. */
  mark(asks: readonly Ask[]): Ask[] {
    return asks.map((ask) => {
      const { answer } = ask;
      if (!answer || !this.windows.some((window) => window.from >= ask.askedAt && window.to <= answer.at)) return ask;
      return { ...ask, answer: { ...answer, afterAskUser: true } };
    });
  }
}
