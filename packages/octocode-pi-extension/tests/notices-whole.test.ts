import { describe, expect, it } from 'vitest';
import { newChildState, noticeText, NOTICES_INLINE, NOTICES_INLINE_CHARS, reduceEvent, type ChildState } from '../src/subagents/events.js';
import { noticeLines } from '../src/subagents/render.js';

const LIMITS = { idleMs: 1_000, busyMs: 5_000 };
const notify = (notifyType: string, message: string) => ({ type: 'extension_ui_request', id: message.slice(0, 8), method: 'notify', message, notifyType });
const feed = (state: ChildState, ...events: Array<Record<string, unknown>>) => events.forEach((event) => reduceEvent(state, event, LIMITS, 0));
const log = (state: ChildState) => [...state.noticeLog.values()];

describe('a child\'s notices reach the parent whole', () => {
  it('keeps one long notice uncut, with its hidden characters shown', () => {
    const state = newChildState();
    feed(state, notify('error', `bad\u001b[31m ${'x'.repeat(3_000)} the end`));
    const [only] = state.notices.kept;
    expect(only!.text).toBe(`bad\\u{1b}[31m ${'x'.repeat(3_000)} the end`);
    expect(only!.text).not.toContain('more characters cut');
    expect(state.notices.lastError).toBe(only!.text);
  });

  it('folds identical repeats into one notice with a count, wherever they came', () => {
    const state = newChildState();
    feed(state, notify('warning', 'cache busy'), notify('warning', 'other'), notify('warning', 'cache busy'), notify('error', 'cache busy'), notify('warning', 'cache  busy\n'));
    expect(log(state).map((notice) => [notice.level, notice.text, notice.count])).toEqual([['warning', 'cache busy', 3], ['warning', 'other', 1], ['error', 'cache busy', 1]]);
    expect(state.notices.kept.map(noticeText)).toEqual(['warning (×3): cache busy', 'warning: other', 'error: cache busy']);
    expect(state.notices.more).toBe(0);
  });

  it('shows the first few distinct notices inline and logs every one for the saved copy', () => {
    const state = newChildState();
    for (let n = 1; n <= NOTICES_INLINE + 3; n++) feed(state, notify('warning', `warning ${n}`));
    expect(state.notices.kept).toHaveLength(NOTICES_INLINE);
    expect(state.notices.more).toBe(3);
    expect(log(state).map((notice) => notice.text)).toEqual(Array.from({ length: NOTICES_INLINE + 3 }, (_, n) => `warning ${n + 1}`));
  });

  it('counts a repeat of an inline notice there, and a repeat of a later one in the log only', () => {
    const state = newChildState();
    for (let n = 1; n <= NOTICES_INLINE + 1; n++) feed(state, notify('warning', `warning ${n}`));
    feed(state, notify('warning', 'warning 1'), notify('warning', `warning ${NOTICES_INLINE + 1}`));
    expect(state.notices.kept[0]!.count).toBe(2);
    expect(state.notices.more).toBe(1);
    expect(log(state).at(-1)).toMatchObject({ text: `warning ${NOTICES_INLINE + 1}`, count: 2 });
  });

  it('puts a notice too big for the inline page, and every one after it, in the log', () => {
    const state = newChildState();
    feed(state, notify('warning', 'small'), notify('error', 'y'.repeat(NOTICES_INLINE_CHARS)), notify('warning', 'tiny'));
    expect(state.notices.kept.map((notice) => notice.text)).toEqual(['small']);
    expect(state.notices.more).toBe(2);
    expect(log(state)[1]!.text).toBe('y'.repeat(NOTICES_INLINE_CHARS));
    expect(state.notices.lastError).toBe('y'.repeat(NOTICES_INLINE_CHARS));
  });

  it('keeps a failed compaction\'s message whole', () => {
    const state = newChildState();
    const message = `provider down ${'because '.repeat(400)}the end`;
    feed(state, { type: 'compaction_end', aborted: false, errorMessage: message });
    expect(state.compactions.error).toBe(message);
  });
});

describe('noticeLines', () => {
  const base = { compactions: { done: 0, aborted: 0, failed: 1, error: `failure ${'z'.repeat(1_000)}` } };

  it('writes each notice and the compaction failure whole, with the count of a folded repeat', () => {
    const lines = noticeLines({ ...base, notices: { kept: [{ level: 'error', text: 'e'.repeat(1_500), count: 1 }, { level: 'warning', text: 'again', count: 4 }], more: 0 } });
    expect(lines).toEqual([
      'Notices from the subagent (it has no screen):',
      `- error: ${'e'.repeat(1_500)}`,
      '- warning (×4): again',
      `- latest compaction failure: failure ${'z'.repeat(1_000)}`,
    ]);
  });

  it('names the file that holds every notice when some are not inline', () => {
    const lines = noticeLines({ notices: { kept: [{ level: 'warning', text: 'one', count: 1 }], more: 6, file: '/tmp/agent/notices.txt' } });
    expect(lines.at(-1)).toBe('- +6 more notices; every notice, whole, is in /tmp/agent/notices.txt (read it, or search it)');
  });

  it('says so when the rest could not be saved, instead of hiding that notices are missing', () => {
    const lines = noticeLines({ notices: { kept: [], more: 2 } });
    expect(lines.at(-1)).toBe('- +2 more notices, not saved');
  });
});
