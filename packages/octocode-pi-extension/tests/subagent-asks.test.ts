import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { askWaitMs, asksLabel, asksNote, UserQuestions, type Ask } from '../src/team/asks.js';
import { describeMembers } from '../src/team/routing.js';
import type { Member } from '../src/team/model.js';
import { TeamStore } from '../src/team/store.js';
import { tmp } from './helpers.js';

const member = (id: string, parentId?: string): Member => ({
  id, role: 'general', ...(parentId ? { parentId } : {}), pid: process.pid, status: 'working', joinedAt: 1_000, updatedAt: Date.now(),
  toolCalls: 0, input: 0, cacheRead: 0, output: 0, cost: 0, unpriced: false,
});

function family() {
  const store = TeamStore.open(tmp(), path.join(tmp(), 'team.sqlite'));
  for (const entry of [member('main-aaaaaa'), member('child-0001', 'main-aaaaaa'), member('child-0002', 'main-aaaaaa')]) store.save(entry);
  return store;
}

describe('a child\'s questions to its parent, from the team tables', () => {
  it('lists each replyRequired message to the parent with its first reply from the parent, and the wait', () => {
    const store = family();
    try {
      const first = store.send('child-0001', ['main-aaaaaa'], 'Which database?', { replyRequired: true }, 10_000).id!;
      store.send('child-0001', ['main-aaaaaa'], 'FYI: slow tests', { replyRequired: false }, 11_000);
      const second = store.send('child-0001', ['main-aaaaaa'], 'Rename the column?', { replyRequired: true }, 12_000).id!;
      const reply = store.send('main-aaaaaa', ['child-0001'], 'Postgres', { replyRequired: false, replyTo: first }, 70_000).id!;
      // A later second reply does not replace the first.
      store.send('main-aaaaaa', ['child-0001'], 'Postgres 16', { replyRequired: false, replyTo: first }, 80_000);
      const asks = store.asks('child-0001', 'main-aaaaaa', 0);
      expect(asks).toEqual([
        { id: first, text: 'Which database?', askedAt: 10_000, answer: { id: reply, at: 70_000, by: 'main-aaaaaa' } },
        { id: second, text: 'Rename the column?', askedAt: 12_000 },
      ]);
      expect(askWaitMs(asks[0]!, 0)).toBe(60_000);
      expect(askWaitMs(asks[1]!, 100_000)).toBe(88_000);
    } finally { store.close(); }
  });

  it('counts only the child\'s own questions to its parent, since the run began, answered only by the parent', () => {
    const store = family();
    try {
      const old = store.send('child-0001', ['main-aaaaaa'], 'old run', { replyRequired: true }, 1_000).id!;
      const toSibling = store.send('child-0001', ['child-0002'], 'to a sibling', { replyRequired: true }, 20_000).id!;
      const other = store.send('child-0002', ['main-aaaaaa'], 'another child asks', { replyRequired: true }, 20_000).id!;
      const mine = store.send('child-0001', ['main-aaaaaa'], 'mine', { replyRequired: true }, 20_000).id!;
      // A sibling answering is not the parent's answer.
      store.send('child-0002', ['child-0001'], 'I think so', { replyRequired: false, replyTo: mine }, 30_000);
      const asks = store.asks('child-0001', 'main-aaaaaa', 5_000);
      expect(asks.map((ask) => [ask.id, ask.answer])).toEqual([[mine, undefined]]);
      expect(store.asks('child-0001', 'main-aaaaaa', 0).map((ask) => ask.id)).toEqual([old, mine]);
      expect([toSibling, other]).not.toContain(asks[0]!.id);
    } finally { store.close(); }
  });

  it('keeps the whole stored text of a question', () => {
    const store = family();
    try {
      const text = `${'why '.repeat(1_000)}end`;
      store.send('child-0001', ['main-aaaaaa'], text, { replyRequired: true });
      expect(store.asks('child-0001', 'main-aaaaaa', 0)[0]!.text).toBe(text);
    } finally { store.close(); }
  });
});

describe('ask counts and the askUser windows', () => {
  const ask = (id: number, answerAt?: number): Ask => ({ id, text: 'q', askedAt: 1_000, ...(answerAt === undefined ? {} : { answer: { id: id + 1, at: answerAt, by: 'main-aaaaaa' } }) });

  it('words the count for /agents and the report footer', () => {
    expect(asksLabel(undefined)).toBe('');
    expect(asksLabel([])).toBe('');
    expect(asksNote([])).toBe('');
    expect(asksLabel([ask(1)])).toBe('1 ask (1 unanswered)');
    expect(asksLabel([ask(1, 41_000), ask(3, 3_601_000), ask(5)])).toBe('3 asks (2 answered in 40s, 1h, 1 unanswered)');
    expect(asksNote([ask(1, 41_000)])).toBe('Asks to its parent: 1 ask (1 answered in 40s).');
  });

  it('marks an answer only when an askUser call started after the question and ended before the answer', () => {
    const questions = new UserQuestions();
    questions.begin('early', 500);
    questions.end('early', 900);
    questions.begin('during', 2_000);
    questions.end('during', 3_000);
    questions.begin('late', 5_000);
    questions.end('late', 6_000);
    questions.begin('never-ended', 2_500);
    const marked = questions.mark([ask(1, 4_000), ask(3, 2_500), ask(5)]);
    expect(marked[0]!.answer).toEqual({ id: 2, at: 4_000, by: 'main-aaaaaa', afterAskUser: true });
    // The only window before this answer ended after it; an open question has none.
    expect(marked[1]!.answer).toEqual({ id: 4, at: 2_500, by: 'main-aaaaaa' });
    expect(marked[2]).toEqual(ask(5));
    // The early call began before this question was asked.
    expect(new UserQuestions().mark([ask(1, 4_000)])[0]!.answer).not.toHaveProperty('afterAskUser');
  });

  it('adds a line to a subagent\'s block in the agent listing only when given its asks', () => {
    const members = [member('main-aaaaaa'), member('child-0001', 'main-aaaaaa')];
    const asks = new Map([['child-0001', [ask(1, 41_000)]]]);
    expect(describeMembers(members, 'main-aaaaaa')).not.toContain('asks');
    const listing = describeMembers(members, 'main-aaaaaa', Date.now(), asks);
    expect(listing).toContain('  1 ask (1 answered in 40s) to its parent');
    expect(listing.match(/to its parent/g)).toHaveLength(1);
  });
});
