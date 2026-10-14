import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closeSharedAgentDb, openAgentDb, sharedAgentDb, type AgentDb } from '../src/agentdb/db.js';
import { boardRows, showBoard } from '../src/backlog/board.js';
import { registerBacklog } from '../src/backlog/index.js';
import { countsText } from '../src/backlog/format.js';
import { BacklogError, BacklogStore, parseRef } from '../src/backlog/store.js';
import { Subcommands } from '../src/shared/commands.js';
import { PARENT_SESSION_ENV } from '../src/shared/env.js';
import { fakeCtx, fakePi, rendered, theme } from './fake-pi.js';

const KEY = { enter: '\r', escape: '\x1b', up: '\x1b[A', down: '\x1b[B', right: '\x1b[C', left: '\x1b[D' };
const SECRET = `ghp_${'a1B2c3D4e5'.repeat(4)}`;

let tmp: string;
let savedDb: string | undefined;

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'octo-backlog-')));
  savedDb = process.env.OCTOCODE_AGENT_DB;
  process.env.OCTOCODE_AGENT_DB = path.join(tmp, 'home', 'octocode.db');
});

afterEach(() => {
  closeSharedAgentDb();
  if (savedDb === undefined) delete process.env.OCTOCODE_AGENT_DB;
  else process.env.OCTOCODE_AGENT_DB = savedDb;
  fs.rmSync(tmp, { recursive: true, force: true });
});

function storeFor(repo: string, db: AgentDb = sharedAgentDb()): BacklogStore {
  return new BacklogStore(() => db, repo);
}

/** Record a session row, as the sessions feature does at session_start. */
function session(id: string, pid: number | null, db: AgentDb = sharedAgentDb()): void {
  db.db.prepare(`INSERT INTO sessions (id, pid) VALUES (?, ?)`).run(id, pid);
}

function repoDir(name = 'repo'): string {
  const dir = path.join(tmp, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function setup(options: { isSubagent?: boolean; agentId?: string; parentSession?: string } = {}) {
  const fake = fakePi();
  const commands = new Subcommands();
  registerBacklog(fake.pi, { commands, isSubagent: options.isSubagent ?? false, ...(options.agentId ? { agentId: () => options.agentId } : {}), ...(options.parentSession ? { env: { ...process.env, [PARENT_SESSION_ENV]: options.parentSession } } : {}) });
  const cwd = repoDir();
  const tool = fake.tools.get('backlog');
  const call = (params: Record<string, unknown>, ctx = fakeCtx({ cwd })) => tool.execute('id', params, undefined, undefined, ctx) as Promise<{ content: Array<{ text: string }> }>;
  const text = async (params: Record<string, unknown>) => (await call(params)).content[0]!.text;
  return { ...fake, commands, cwd, tool, call, text, command: commands.get('backlog')! };
}

describe('backlog store', () => {
  it('numbers items per repository and never reuses a number', () => {
    const a = storeFor('repo-a');
    const b = storeFor('repo-b');
    expect(a.add({ title: 'one', createdBy: 'user' }).ref).toBe('B1');
    expect(a.add({ title: 'two', createdBy: 'user' }).ref).toBe('B2');
    expect(b.add({ title: 'other', createdBy: 'user' }).ref).toBe('B1');
    a.remove('B2');
    expect(a.add({ title: 'three', createdBy: 'user' }).ref).toBe('B3');
    expect(a.list().items.map((item) => item.title)).toEqual(['three', 'one']);
    expect(parseRef('b7')).toBe(7);
    expect(parseRef('7')).toBe(7);
    expect(parseRef('x')).toBeUndefined();
  });

  it('defaults to the backlog state and sorts ongoing, then priority, then recent', () => {
    const store = storeFor('r');
    const low = store.add({ title: 'low', state: 'todo', priority: 3, createdBy: 'user' });
    store.add({ title: 'high', state: 'todo', priority: 0, createdBy: 'user' });
    expect(store.add({ title: 'idea', createdBy: 'agent' }).state).toBe('backlog');
    store.update(low.ref, { state: 'ongoing' }, { id: 's1' });
    expect(store.list({ states: ['todo', 'ongoing'] }).items.map((item) => item.title)).toEqual(['low', 'high']);
    expect(store.counts()).toEqual({ backlog: 1, todo: 1, ongoing: 1, done: 0 });
    expect(store.list({ query: 'hig' }).items.map((item) => item.title)).toEqual(['high']);
    expect(store.list({ query: '%' }).items).toEqual([]);
  });

  it('claims ongoing items, refuses a live holder, and takes over a finished one', () => {
    const store = storeFor('r');
    const item = store.add({ title: 'task', state: 'todo', createdBy: 'user' });
    session('live', process.ppid);
    session('gone', null);
    expect(store.update(item.ref, { state: 'ongoing' }, { id: 'live' }).assignee).toBe('live');
    expect(() => store.update(item.ref, { state: 'ongoing' }, { id: 'me' })).toThrow(/ongoing for live, which is still running/);
    store.update(item.ref, { state: 'todo' }, { id: 'live' });
    expect(store.get(item.ref)!.assignee).toBeUndefined();
    store.update(item.ref, { state: 'ongoing' }, { id: 'gone' });
    expect(store.update(item.ref, { state: 'ongoing' }, { id: 'me' }).assignee).toBe('me');
  });

  it('refuses changing an item a live session holds, except to add a note, unless the user forces it', () => {
    const store = storeFor('r');
    const item = store.add({ title: 'task', state: 'todo', createdBy: 'user' });
    session('live', process.ppid);
    store.update(item.ref, { state: 'ongoing' }, { id: 'live' });
    for (const input of [{ state: 'done' as const, note: 'x' }, { state: 'todo' as const }, { title: 'renamed' }, { priority: 0 }])
      expect(() => store.update(item.ref, input, { id: 'me' }), JSON.stringify(input)).toThrow(/ongoing for live, which is still running/);
    expect(store.update(item.ref, { note: 'fyi' }, { id: 'me' }).assignee).toBe('live');
    expect(store.update(item.ref, { state: 'todo', force: true }, { id: 'me' }).assignee).toBeUndefined();
  });

  it('stamps done, logs notes, and refuses a stale version', () => {
    const store = storeFor('r');
    const item = store.add({ title: 'task', createdBy: 'user' });
    const done = store.update(item.ref, { state: 'done', note: 'shipped; tests pass' }, { id: 'me' });
    expect(done.doneAt).toBeTypeOf('number');
    expect(done.version).toBe(item.version + 1);
    expect(store.notes(done)).toMatchObject([
      { author: 'me', kind: 'change', text: 'state backlog → done' },
      { author: 'me', kind: 'note', text: 'shipped; tests pass' },
    ]);
    expect(() => store.update(item.ref, { title: 'x', version: item.version }, { id: 'me' })).toThrow(/changed elsewhere/);
    expect(store.update(item.ref, { state: 'todo' }, { id: 'me' }).doneAt).toBeUndefined();
    store.remove(item.ref);
    expect(store.get(item.ref)).toBeUndefined();
  });

  it('sanitizes stored text and normalizes tags', () => {
    const store = storeFor('r');
    const item = store.add({ title: 'bad\u001b]0;pwned\u0007 title', tags: ['#UI', 'ui', 'a b', ''], createdBy: 'user' });
    expect(item.title).toBe('bad title');
    expect(item.tags).toEqual(['ui', 'a-b']);
  });

  it('refuses secrets on the stored (sanitized) text of title, body, note and tags', () => {
    const store = storeFor('r');
    const hidden = `ghp_\u200b${'a1B2c3D4e5'.repeat(4)}`;
    expect(() => store.add({ title: hidden, createdBy: 'user' })).toThrow(BacklogError);
    expect(() => store.add({ title: 'ok', body: `use ${hidden}`, createdBy: 'user' })).toThrow(/body .*secret/);
    expect(() => store.add({ title: 'ok', tags: ['AKIAIOSFODNN7EXAMPLE'], createdBy: 'user' })).toThrow(/tags .*secret/);
    const item = store.add({ title: 'ok', createdBy: 'user' });
    expect(() => store.update(item.ref, { note: hidden }, { id: 'me' })).toThrow(/note .*secret/);
    expect(() => store.update(item.ref, { title: hidden }, { id: 'me' })).toThrow(/secret/);
    expect(store.list().items).toHaveLength(1);
    expect(store.noteCount(item)).toBe(0);
  });

  it('lets a subagent touch only items its owners hold', () => {
    const store = storeFor('r');
    const mine = store.add({ title: 'given', state: 'todo', createdBy: 'user' });
    const other = store.add({ title: 'other', state: 'todo', createdBy: 'user' });
    store.update(mine.ref, { state: 'ongoing' }, { id: 'parent' });
    const sub = { id: 'sub-1', owners: new Set(['parent']) };
    expect(() => store.update(other.ref, { state: 'ongoing' }, sub)).toThrow(BacklogError);
    expect(store.update(mine.ref, { state: 'done', note: 'did it' }, sub).state).toBe('done');
  });

  it('links an item to the one it came from, lists those derived from it, and refuses unknown, self and loop links', () => {
    const store = storeFor('r');
    const root = store.add({ title: 'root', state: 'todo', createdBy: 'user' });
    const split = store.add({ title: 'split', from: 'b1', createdBy: 'agent' });
    const followUp = store.add({ title: 'follow-up', from: 'B1', state: 'todo', createdBy: 'agent' });
    const grandchild = store.add({ title: 'grandchild', from: split.ref, createdBy: 'agent' });
    expect(split.from).toBe(1);
    expect(store.notes(split)).toMatchObject([{ author: 'agent', kind: 'change', text: 'created from B1' }]);
    expect(store.derived(root).map((item) => item.ref)).toEqual([followUp.ref, split.ref]);
    expect(store.list({ from: 'B1' }).items.map((item) => item.ref)).toEqual([followUp.ref, split.ref]);
    expect(store.list({ from: 'B1', states: ['todo'] })).toMatchObject({ total: 1, items: [{ ref: followUp.ref }] });
    expect(() => store.add({ title: 'orphan', from: 'B99', createdBy: 'agent' })).toThrow(/No backlog item B99 to link from/);
    expect(() => storeFor('other-repo').add({ title: 'x', from: 'B1', createdBy: 'agent' })).toThrow(/No backlog item B1/);
    expect(() => store.update(root.ref, { from: root.ref }, { id: 'me' })).toThrow(/cannot come from itself/);
    expect(() => store.update(root.ref, { from: grandchild.ref }, { id: 'me' })).toThrow(/B4 already comes from B1: the link would make a loop/);
    expect(store.update(grandchild.ref, { from: root.ref }, { id: 'me' }).from).toBe(1);
    expect(store.update(grandchild.ref, { from: null }, { id: 'me' }).from).toBeUndefined();
    expect(store.notes(grandchild).map((note) => note.text)).toEqual(['created from B2', 'from B2 → B1', 'from B1 → none']);
  });

  it('clears the link on derived items when their origin is removed, and logs it on each', () => {
    const store = storeFor('r');
    const root = store.add({ title: 'root', createdBy: 'user' });
    const child = store.add({ title: 'child', from: root.ref, createdBy: 'agent' });
    store.remove(root.ref);
    const after = store.get(child.ref)!;
    expect(after.from).toBeUndefined();
    expect(after.version).toBe(child.version + 1);
    expect(store.notes(after).at(-1)).toMatchObject({ author: 'user', kind: 'change', text: 'from B1 → none (B1 "root" was removed)' });
  });

  it('logs every field an update changes, keeps a replaced body in full, and logs nothing for a note or a no-op', () => {
    const store = storeFor('r');
    const body = `why: ${'evidence '.repeat(300)}`.trim();
    const item = store.add({ title: 'old title', body, tags: ['a'], state: 'todo', createdBy: 'user' });
    store.update(item.ref, { title: 'new title', body: 'rewritten', priority: 0, tags: ['b', 'c'], state: 'ongoing' }, { id: 's1' });
    store.update(item.ref, { note: 'why I changed it' }, { id: 's1' });
    store.update(item.ref, { priority: 0, tags: ['b', 'c'], title: 'new title' }, { id: 's1' });
    const notes = store.notes(item, 50);
    expect(notes.map((note) => note.kind)).toEqual(['change', 'note']);
    expect(notes[0]!.text).toBe(`state todo → ongoing · assignee none → s1 · priority p2 → p0 · tags #a → #b #c · title was "old title" · body replaced; it was:\n${body}`);
    expect(body.length).toBeGreaterThan(1000);
    const blank = store.add({ title: 'blank', createdBy: 'user' });
    expect(store.notes(store.update(blank.ref, { body: 'first text' }, { id: 's1' }))[0]!.text).toBe('body added');
  });

  it('matches a query against title and body substrings but only whole tags', () => {
    const store = storeFor('r');
    store.add({ title: 'build cache', tags: ['infra'], createdBy: 'user' });
    store.add({ title: 'menu', tags: ['ui'], createdBy: 'user' });
    expect(store.list({ query: 'ui' }).items.map((item) => item.title)).toEqual(['menu', 'build cache']);
    expect(store.list({ query: '#ui' }).items.map((item) => item.title)).toEqual(['menu']);
    expect(store.list({ query: 'infr' }).items).toEqual([]);
    expect(store.list({ query: 'infra' }).items.map((item) => item.title)).toEqual(['build cache']);
  });

  it('keeps separate databases apart', () => {
    const db = openAgentDb(path.join(tmp, 'other.db'));
    try {
      storeFor('r', db).add({ title: 'elsewhere', createdBy: 'user' });
      expect(storeFor('r').list().items).toEqual([]);
    } finally {
      db.close();
    }
  });
});

describe('backlog tool', () => {
  it('pages every matching item and every note with executable continuations', async () => {
    const t = setup();
    for (let i = 0; i < 53; i++) await t.text({ op: 'add', title: `Task ${i}`, goal: 'it works', state: 'todo' });
    const next = (text: string) => JSON.parse(text.match(/^Next: backlog (.+)$/m)![1]!);
    const first = await t.text({ op: 'list', limit: 50 });
    const second = await t.text(next(first));
    const ids = [...`${first}\n${second}`.matchAll(/^(B\d+) \[/gm)].map((match) => match[1]);
    expect(ids).toHaveLength(53);
    expect(new Set(ids).size).toBe(53);
    expect(second).not.toContain('Next:');

    for (let i = 0; i < 23; i++) await t.text({ op: 'update', id: 'B1', note: `note-${i}` });
    const pages: string[] = [];
    let page = await t.text({ op: 'get', id: 'B1' });
    while (true) {
      pages.push(page);
      if (!page.includes('Next: backlog')) break;
      expect(pages.length).toBeLessThan(4);
      page = await t.text(next(page));
    }
    const notes = [...pages.join('\n').matchAll(/: (note-\d+)$/gm)].map((match) => match[1]);
    expect(notes).toHaveLength(23);
    expect(new Set(notes).size).toBe(23);
  });

  it('adds proposals to backlog, lists open work with a triage line, and gets details', async () => {
    const t = setup();
    expect(await t.text({ op: 'add', title: 'Add memory tool', goal: 'it works', body: 'with BM25', priority: 'p1', tags: ['mem'] })).toBe('Added B1 [backlog p1] Add memory tool #mem');
    await t.text({ op: 'add', title: 'Accepted', goal: 'it works', state: 'todo' });
    expect(await t.text({ op: 'list' })).toBe('B2 [todo p2] Accepted\n1 proposed item(s) await triage (list with states: ["backlog"]).');
    expect(await t.text({ op: 'update', id: 'B1', state: 'ongoing', note: 'starting' })).toBe('Updated B1 [ongoing p1] Add memory tool #mem (you)');
    const detail = await t.text({ op: 'get', id: 'b1' });
    expect(detail).toContain('B1 [ongoing p1] Add memory tool #mem (you)');
    expect(detail).toContain('with BM25');
    expect(detail).toMatch(/Notes and changes:\n- .* ago you · state backlog → ongoing · assignee none → \S+\n- .* ago you: starting/);
    expect(detail).not.toMatch(/version/);
    expect(await t.text({ op: 'list', states: ['todo'], limit: 1, query: 'Acc' })).toContain('B2 [todo p2] Accepted');
  });

  it('requires a note to finish and refuses secrets', async () => {
    const t = setup();
    await t.text({ op: 'add', title: 'task', goal: 'it works', state: 'todo' });
    await expect(t.call({ op: 'update', id: 'B1', state: 'done' })).rejects.toThrow(/needs a note/);
    await expect(t.call({ op: 'add', title: 'token', goal: 'it works', body: `use ${SECRET}` })).rejects.toThrow(/secret/);
    await expect(t.call({ op: 'update', id: 'B1', note: SECRET })).rejects.toThrow(/secret/);
    await expect(t.call({ op: 'update', id: 'B1', tags: [SECRET] })).rejects.toThrow(/secret/);
    // A secret note on add is refused before anything is stored.
    await expect(t.call({ op: 'add', title: 'fast', goal: 'it works', state: 'done', note: SECRET })).rejects.toThrow(/secret/);
    expect(await t.text({ op: 'list', states: ['todo'] })).toBe('B1 [todo p2] task');
    await expect(t.call({ op: 'update', id: 'B1' })).rejects.toThrow(/needs something to change/);
    await expect(t.call({ op: 'get' })).rejects.toThrow(/needs an id/);
    await expect(t.call({ op: 'get', id: 'B9' })).rejects.toThrow(/No backlog item B9/);
    expect(await t.text({ op: 'update', id: 'B1', state: 'done', note: 'fixed; yarn test passes' })).toBe('Updated B1 [done p2] task');
    expect(t.tool.executionMode).toBeUndefined();
    expect(t.tool.parameters.properties.op.enum).toEqual(['list', 'get', 'add', 'update', 'remove']);
  });

  it('refuses an add it cannot complete before creating anything, so a retry leaves no duplicate', async () => {
    const t = setup();
    await expect(t.call({ op: 'add', title: 'shipped', goal: 'it works', state: 'done' })).rejects.toThrow(/note/);
    await expect(t.call({ op: 'add', title: 'idea', goal: 'it works', note: 'context' })).rejects.toThrow(/note only with state ongoing or done/);
    expect(storeFor(fs.realpathSync(t.cwd)).counts()).toMatchObject({ backlog: 0, todo: 0, done: 0 });
    expect(await t.text({ op: 'add', title: 'shipped', goal: 'it works', state: 'done', note: 'merged; tests pass' })).toMatch(/^Added B1 \[done/);
  });

  it('removes an item and its notes, but not one another live session holds', async () => {
    const t = setup();
    await t.text({ op: 'add', title: 'dup', goal: 'it works', state: 'todo' });
    await t.text({ op: 'update', id: 'B1', note: 'a note' });
    expect(await t.text({ op: 'remove', id: 'b1' })).toBe('Removed B1 "dup" and its notes.');
    await expect(t.call({ op: 'get', id: 'B1' })).rejects.toThrow(/No backlog item B1/);
    await expect(t.call({ op: 'remove', id: 'B1' })).rejects.toThrow(/No backlog item/);
    await expect(t.call({ op: 'remove' })).rejects.toThrow(/needs an id/);
    await t.text({ op: 'add', title: 'held', goal: 'it works', state: 'todo' });
    session('other-session', process.ppid);
    storeFor(fs.realpathSync(t.cwd)).update('B2', { state: 'ongoing' }, { id: 'other-session' });
    await expect(t.call({ op: 'remove', id: 'B2' })).rejects.toThrow(/ongoing for other-session/);
  });

  it('refuses to claim an item another live session holds, naming it', async () => {
    const t = setup();
    await t.text({ op: 'add', title: 'task', goal: 'it works', state: 'todo' });
    session('other-session', process.ppid);
    storeFor(fs.realpathSync(t.cwd)).update('B1', { state: 'ongoing' }, { id: 'other-session' });
    await expect(t.call({ op: 'update', id: 'B1', state: 'ongoing' })).rejects.toThrow(/other-session/);
  });

  it('in a subagent: adds only to backlog and updates only its or its parent\'s items', async () => {
    const parent = setup();
    await parent.text({ op: 'add', title: 'delegated', goal: 'it works', state: 'todo' });
    await parent.text({ op: 'add', title: 'unrelated', goal: 'it works', state: 'todo' });
    storeFor(fs.realpathSync(parent.cwd)).update('B1', { state: 'ongoing' }, { id: 'parent-session' });
    const sub = setup({ isSubagent: true, agentId: 'general-1', parentSession: 'parent-session' });
    expect(sub.tool.parameters.properties.op.enum).toEqual(['list', 'get', 'add', 'update']);
    expect(sub.tool.parameters.properties.state.enum).toEqual(['ongoing', 'done']);
    expect(sub.tool.description).toContain('its parent has claimed');
    expect(sub.tool.parameters.properties.op.description).toContain('propose an item');
    expect(sub.tool.parameters.properties.op.description).not.toContain('remove');
    expect(sub.tool.promptGuidelines.join(' ')).not.toContain('set it ongoing');
    expect(await sub.text({ op: 'list' })).toBe('B1 [ongoing p2] delegated (parent)\nB2 [todo p2] unrelated');
    expect(await sub.text({ op: 'add', title: 'follow-up', goal: 'it works', state: 'todo' })).toBe('Added B3 [backlog p2] follow-up');
    expect(storeFor(fs.realpathSync(sub.cwd)).get('B3')!.createdBy).toBe('agent:general-1');
    // A proposal takes no note, and the parent has not claimed it, so the hint points at body, not a later update.
    await expect(sub.call({ op: 'add', title: 'with note', goal: 'it works', note: 'details' })).rejects.toThrow('A subagent adds without a note: put the details in body.');
    await expect(sub.call({ op: 'update', id: 'B2', state: 'ongoing' })).rejects.toThrow(/not claimed by your parent/);
    await expect(sub.call({ op: 'update', id: 'B1', title: 'renamed' })).rejects.toThrow(/only the state and notes/);
    await expect(sub.call({ op: 'update', id: 'B1', state: 'todo' })).rejects.toThrow(/sets only ongoing or done/);
    expect(storeFor(fs.realpathSync(sub.cwd)).get('B1')!.state).toBe('ongoing');
    expect(await sub.text({ op: 'update', id: 'B1', state: 'done', note: 'done; verified' })).toBe('Updated B1 [done p2] delegated');
    await expect(sub.call({ op: 'remove', id: 'B3' })).rejects.toThrow(/subagent cannot remove/);
  });

  it('links follow-ups with from: shows the origin and derived items in get, filters list, and lets a subagent link only on add', async () => {
    const t = setup();
    await t.text({ op: 'add', title: 'Root task', goal: 'it works', state: 'todo' });
    expect(await t.text({ op: 'add', title: 'Follow-up', goal: 'it works', from: 'B1' })).toBe('Added B2 [backlog p2] Follow-up (from B1)');
    const root = await t.text({ op: 'get', id: 'B1' });
    expect(root).toContain('Derived items (1):\n- B2 [backlog p2] Follow-up (from B1)');
    const child = await t.text({ op: 'get', id: 'B2' });
    expect(child).toContain('From: B1 [todo p2] Root task');
    expect(child).toMatch(/- .* ago agent · created from B1/);
    expect(await t.text({ op: 'list', from: 'B1', states: ['backlog'] })).toBe('B2 [backlog p2] Follow-up (from B1)');
    expect(await t.text({ op: 'update', id: 'B2', from: '' })).toBe('Updated B2 [backlog p2] Follow-up');
    await expect(t.call({ op: 'add', title: 'x', goal: 'it works', from: 'B9' })).rejects.toThrow(/No backlog item B9 to link from/);
    expect(rendered(t.tool.renderCall({ op: 'add', from: 'B1' }, theme, {}))).toContain('from B1');

    storeFor(fs.realpathSync(t.cwd)).update('B1', { state: 'ongoing' }, { id: 'parent-session' });
    const sub = setup({ isSubagent: true, agentId: 'general-1', parentSession: 'parent-session' });
    expect(await sub.text({ op: 'add', title: 'Found while working', goal: 'it works', from: 'B1' })).toBe('Added B3 [backlog p2] Found while working (from B1)');
    await expect(sub.call({ op: 'update', id: 'B1', from: 'B3' })).rejects.toThrow(/only the state and notes/);
  });

  it('keeps its prompt lean: at most 2 short guidelines (1 in a subagent), no double spaces', () => {
    for (const [t, max] of [[setup(), 2], [setup({ isSubagent: true }), 1]] as const) {
      const guidelines: string[] = t.tool.promptGuidelines;
      expect(guidelines.length).toBeLessThanOrEqual(max);
      for (const line of guidelines) expect(line.length, line).toBeLessThanOrEqual(230);
      expect(guidelines.join(' ')).not.toMatch(/not instructions/);
      expect(t.tool.description).not.toMatch(/ {2}/);
      for (const [name, schema] of Object.entries(t.tool.parameters.properties as Record<string, { description?: string }>)) expect(schema.description, name).toBeTruthy();
    }
  });

  it('renders a call line and refreshes the footer counts after a call', async () => {
    const t = setup();
    const ctx = fakeCtx({ cwd: t.cwd });
    await t.call({ op: 'add', title: 'one', goal: 'it works', state: 'todo' }, ctx);
    expect(ctx.ui.statuses.get('octocode-backlog')).toBe('backlog 1 todo · /backlog');
    await t.call({ op: 'update', id: 'B1', state: 'ongoing' }, ctx);
    expect(ctx.ui.statuses.get('octocode-backlog')).toBe('backlog 1 ongoing · /backlog');
    // Items live on the board (`/backlog`), not in a widget under the editor.
    expect(ctx.ui.widgets.has('octocode-backlog')).toBe(false);
    await t.call({ op: 'update', id: 'B1', state: 'done', note: 'ok' }, ctx);
    expect(ctx.ui.statuses.get('octocode-backlog')).toBeUndefined();
    expect(rendered(t.tool.renderCall({ op: 'update', id: 'B1', state: 'done' }, theme, {}))).toBe('○ Backlog(update B1 → done)');
    const row = async (params: Record<string, unknown>) => rendered(t.tool.renderResult(await t.call(params, ctx), { expanded: false }, theme, { args: params, isPartial: false, expanded: false }));
    expect(await row({ op: 'add', title: 'two', goal: 'it works' })).toBe('  ⎿  Added B2 · backlog');
    expect(await row({ op: 'update', id: 'B2', state: 'todo' })).toBe('  ⎿  B2 → todo');
    expect(await row({ op: 'list', states: ['todo', 'done'], limit: 1 })).toMatch(/^ {2}⎿ {2}1 of 2 items\n {5}B\d \[/);
    expect(await row({ op: 'list', states: ['ongoing'] })).toMatch(/^ {2}⎿ {2}No items/);
    expect(await row({ op: 'get', id: 'B2' })).toMatch(/^ {2}⎿ {2}B2 · todo · two\n/);
    expect(await row({ op: 'remove', id: 'B2' })).toBe('  ⎿  Removed B2');
    expect(rendered(t.tool.renderResult({ content: [{ type: 'text', text: 'No backlog item B9' }] }, {}, theme, { args: { op: 'get' }, isError: true }))).toBe('  ⎿  Error: No backlog item B9');
  });
});

describe('backlog status', () => {
  it('names every open state in words and ends with the command that opens the board', () => {
    expect(countsText({ ongoing: 2, todo: 4, backlog: 1, done: 9 })).toBe('backlog 2 ongoing · 4 todo · 1 to triage · /backlog');
    expect(countsText({ ongoing: 0, todo: 0, backlog: 0, done: 3 })).toBe('');
  });

  it('gives RPC clients the same status text and clears it when the database becomes unreadable', async () => {
    const t = setup();
    const rpc = fakeCtx({ cwd: t.cwd, mode: 'rpc' });
    await t.call({ op: 'add', title: 'one', goal: 'it works', state: 'todo' }, rpc);
    await t.call({ op: 'update', id: 'B1', state: 'ongoing' }, rpc);
    expect(rpc.ui.statuses.get('octocode-backlog')).toBe('backlog 1 ongoing · /backlog');
    expect(rpc.ui.widgets.has('octocode-backlog')).toBe(false);
    const db = path.join(t.cwd, 'foreign.sqlite');
    fs.writeFileSync(db, 'not sqlite at all, not even close to a header of one'.repeat(20));
    // afterEach restores OCTOCODE_AGENT_DB.
    closeSharedAgentDb();
    process.env.OCTOCODE_AGENT_DB = db;
    await t.handlers.get('agent_end')![0]!({}, rpc);
    expect(rpc.ui.statuses.get('octocode-backlog')).toBeUndefined();
    expect(rpc.ui.widgets.has('octocode-backlog')).toBe(false);
  });
});

describe('/octocode backlog', () => {
  it('works headless: add, list, move, detail, export', async () => {
    const t = setup();
    const ctx = fakeCtx({ cwd: t.cwd, hasUI: false });
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    await t.command.handler('', ctx);
    expect(ctx.ui.notes.at(-1)!.message).toMatch(/empty/);
    // Print mode has no notify surface: the text goes to stderr too.
    expect(String(stderr.mock.calls.at(-1)?.[0])).toMatch(/empty/);
    stderr.mockRestore();
    await t.command.handler('add Write the docs', ctx);
    expect(ctx.ui.notes.at(-1)!.message).toBe('Added B1 [todo p2] Write the docs');
    await t.command.handler('B1 ongoing', ctx);
    await t.command.handler('', ctx);
    expect(ctx.ui.notes.at(-1)!.message).toBe('Ongoing (1)\n  B1 [ongoing p2] Write the docs (you)');
    await t.command.handler('B1', ctx);
    expect(ctx.ui.notes.at(-1)!.message).toMatch(/claimed .+ ago by you/);
    expect(ctx.ui.notes.at(-1)!.message).toMatch(/version \d/);
    await t.command.handler('B1 done', ctx);
    await t.command.handler('B9', ctx);
    expect(ctx.ui.notes.at(-1)).toMatchObject({ type: 'warning' });
    await t.command.handler('export', ctx);
    const file = path.join(t.cwd, '.octocode', 'backlog.md');
    expect(ctx.ui.notes.at(-1)!.message).toContain(file);
    const markdown = fs.readFileSync(file, 'utf8');
    expect(markdown).toMatch(/^<!-- Generated by Octocode .* not read back\. -->/);
    expect(markdown).toContain('## Done (1)\n\n- **B1** [p2] Write the docs');
    expect(t.commands.complete('backlog e')).toEqual([expect.objectContaining({ value: 'backlog export' })]);
    expect(t.commands.complete('backlog B1 d')!.map((item) => item.value)).toEqual(['backlog B1 done', 'backlog B1 delete']);
  });

  it('"do" marks the item ongoing and sends it to the agent, as a follow-up while busy', async () => {
    const t = setup();
    storeFor(fs.realpathSync(t.cwd)).add({ title: 'Fix login', goal: 'Login submits without freezing; focused tests pass.', body: 'The form hangs.', state: 'todo', createdBy: 'user' });
    await t.command.handler('do B1', fakeCtx({ cwd: t.cwd, hasUI: false }));
    const sent = t.sent.at(-1)!;
    expect(sent.options).toBeUndefined();
    expect(sent.message).toContain('Work on backlog item B1: Fix login');
    expect(sent.message).toContain('Goal: Login submits without freezing; focused tests pass.');
    expect(sent.message).toContain('The form hangs.');
    expect(sent.message).toContain('from: B1');
    expect(sent.message).toContain('Mark it done only after verifying its goal');
    expect(sent.message).toContain('If blocked, record the blocker instead.');
    expect(sent.message).toContain('Follow existing permissions');
    expect(storeFor(fs.realpathSync(t.cwd)).get('B1')).toMatchObject({ state: 'ongoing', assignee: 'session-test' });
    await t.command.handler('do B1', fakeCtx({ cwd: t.cwd, hasUI: false, idle: false }));
    expect(t.sent.at(-1)!.options).toEqual({ deliverAs: 'followUp' });
  });

  it('falls back to select lists without a custom component: actions, move, priority, delegate, delete', async () => {
    const t = setup();
    const store = storeFor(fs.realpathSync(t.cwd));
    store.add({ title: 'first', goal: 'The selected action changes the item and repaints the board.', state: 'todo', createdBy: 'user' });
    const rpc = (selects: Array<string | undefined>, confirms: boolean[] = []) => fakeCtx({ cwd: t.cwd, mode: 'rpc', ui: { selects, confirms } });
    await t.command.handler('', rpc(['B1 [todo p2] first', 'Move to…', 'backlog', undefined]));
    expect(store.get('B1')!.state).toBe('backlog');
    await t.command.handler('', rpc(['B1 [backlog p2] first', 'Priority…', 'p0', undefined]));
    expect(store.get('B1')!.priority).toBe(0);
    await t.command.handler('', rpc(['+ Add an item', undefined]));
    await t.command.handler('B1', rpc(['Delegate to a subagent']));
    expect(t.sent.at(-1)!.message).toMatch(/^Delegate backlog item B1 to a subagent with the agent tool: first/);
    expect(t.sent.at(-1)!.message).toContain('Goal: The selected action changes the item and repaints the board.');
    expect(t.sent.at(-1)!.message).toContain("in the subagent's task");
    expect(t.sent.at(-1)!.message).toContain('Mark it done only after verifying its goal');
    expect(store.get('B1')!.state).toBe('ongoing');
    const edits = fakeCtx({ cwd: t.cwd, mode: 'rpc', ui: { selects: ['Edit'] } });
    Object.assign(edits.ui, { editor: async () => 'renamed\n\nnew body' });
    await t.command.handler('B1', edits);
    expect(store.get('B1')).toMatchObject({ title: 'renamed', body: 'new body' });
    await t.command.handler('B1', rpc(['Delete'], [false]));
    expect(store.get('B1')).toBeDefined();
    await t.command.handler('B1', rpc(['Delete'], [true]));
    expect(store.get('B1')).toBeUndefined();
  });

  it('rejects extra arguments before acting and completes the same item references that dispatch accepts', async () => {
    const t = setup();
    const store = storeFor(fs.realpathSync(t.cwd));
    const before = store.add({ title: 'keep me', state: 'todo', createdBy: 'user' });
    const ctx = fakeCtx({ cwd: t.cwd, mode: 'rpc' });
    const confirm = vi.spyOn(ctx.ui, 'confirm');
    for (const args of ['do B1 extra', 'export extra', 'B1 done extra', 'B1 delete extra', 'constructor', '__proto__']) {
      await t.command.handler(args, ctx);
      expect(ctx.ui.notes.at(-1)?.type).toBe('warning');
      expect(store.get('B1')).toEqual(before);
    }
    expect(t.sent).toEqual([]);
    expect(confirm).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(t.cwd, '.octocode', 'backlog.md'))).toBe(false);
    expect(t.commands.complete('backlog #1 d')!.map((item) => item.value)).toEqual(['backlog #1 done', 'backlog #1 delete']);
    await t.command.handler('#1 done', ctx);
    expect(store.get('B1')?.state).toBe('done');
    for (const syntax of ['add <title>', 'do <id>', 'export', 'backlog|todo|ongoing|done|delete']) expect(t.command.description).toContain(syntax);
  });

  it('shows the board, moves items with arrows, and "d" hands the selected item over', async () => {
    const t = setup();
    const store = storeFor(fs.realpathSync(t.cwd));
    store.add({ title: 'alpha', state: 'todo', createdBy: 'user' });
    store.add({ title: 'beta', state: 'backlog', createdBy: 'user' });
    const frames: string[] = [];
    const tui = { requestRender: () => undefined, terminal: { rows: 40, columns: 100 } };
    const ctx = fakeCtx({
      cwd: t.cwd,
      ui: {
        custom: (factory) =>
          new Promise((resolve) => {
            const board = factory(tui, theme, {}, resolve);
            frames.push(rendered(board, 100));
            for (const key of [KEY.down, KEY.right]) {
              board.handleInput(key);
              frames.push(rendered(board, 100));
            }
            board.handleInput('d');
          }),
      },
    });
    await t.command.handler('', ctx);
    // Sections are drawn in flow order, so → (toward done) moves an item down the board.
    const at = (heading: string) => frames[0]!.indexOf(heading);
    expect(at('Backlog (triage) (1)')).toBeLessThan(at('Todo (1)'));
    expect(at('Todo (1)')).toBeLessThan(at('Ongoing (0)'));
    expect(at('Ongoing (0)')).toBeLessThan(at('Done (0)'));
    expect(frames[0]).toMatch(/› B2 p2 beta/);
    expect(frames[1]).toMatch(/› B1 p2 alpha/);
    // → moves alpha from todo to ongoing; ← would move it back.
    expect(frames[2]).toContain('Ongoing (1)');
    expect(frames[2]).toMatch(/› B1 p2 alpha/);
    expect(frames[2]).toContain('←→ move up/down a state');
    expect(store.get('B1')).toMatchObject({ state: 'ongoing', assignee: 'session-test' });
    expect(t.sent.at(-1)!.message).toMatch(/^Work on backlog item B1: alpha/);
  });

  it('orders board rows by state and keeps only the latest done items', async () => {
    const store = storeFor('r');
    for (let index = 0; index < 7; index++) store.add({ title: `d${index}`, state: 'done', createdBy: 'user' });
    store.add({ title: 'now', state: 'ongoing', createdBy: 'user' });
    const rows = boardRows(store.list().items);
    expect(rows[0]!.title).toBe('now');
    expect(rows).toHaveLength(6);
    const ctx = fakeCtx({ cwd: tmp, ui: { custom: (factory) => new Promise((resolve) => factory({ requestRender: () => undefined, terminal: { rows: 40 } }, theme, {}, resolve).handleInput(KEY.escape)) } });
    expect(await showBoard(ctx, { title: 'x', self: 's', load: () => store.list().items, move: () => undefined })).toBeUndefined();
  });
});

describe('backlog fields: where, why, evidence, plan', () => {
  const FIELDS = {
    goal: 'Search finds an item by path; focused tests pass.',
    paths: ['src/backlog/store.ts', 'src/backlog/'],
    why: 'Agents lose the reason behind an item after a resume.',
    evidence: ['src/backlog/store.ts:87 — body copied into notes', 'yarn test → 2 failures'],
    plan: 'Add four columns, then render them.\nKeep search on LIKE.',
  };

  it('stores each field with entries cleaned to single lines, and finds an item by a path substring or an evidence word', () => {
    const store = storeFor('r');
    const item = store.add({ title: 'search', ...FIELDS, paths: ['  src/backlog/store.ts ', 'src/backlog/store.ts', '', 'docs/\nA.md'], createdBy: 'user' });
    expect(item).toMatchObject({ paths: ['src/backlog/store.ts', 'docs/ A.md'], why: FIELDS.why, evidence: FIELDS.evidence, plan: FIELDS.plan });
    store.add({ title: 'unrelated', createdBy: 'user' });
    expect(store.get('B2')).toMatchObject({ paths: [], why: '', evidence: [], plan: '' });
    const found = (query: string) => store.list({ query }).items.map((each) => each.ref);
    expect(found('backlog/store')).toEqual(['B1']);
    expect(found('2 failures')).toEqual(['B1']);
    expect(found('after a resume')).toEqual(['B1']);
    expect(found('four columns')).toEqual(['B1']);
    expect(found('100%')).toEqual([]);
  });

  it('logs every changed field with the old value in full, and nothing when a field is set to what it was', () => {
    const store = storeFor('r');
    const item = store.add({ title: 'fields', ...FIELDS, state: 'todo', createdBy: 'user' });
    store.update(item.ref, { paths: ['src/a.ts'], why: 'new why', evidence: ['one'], plan: 'new plan' }, { id: 's1' });
    store.update(item.ref, { paths: ['src/a.ts'], why: 'new why', evidence: ['one'], plan: 'new plan' }, { id: 's1' });
    const blank = store.add({ title: 'blank', createdBy: 'user' });
    store.update(blank.ref, { why: 'w', evidence: ['e'], plan: 'p', paths: ['x'] }, { id: 's1' });
    const [first, ...more] = store.notes(item, 50);
    expect(more).toEqual([]);
    expect(first!.text).toBe(
      `paths src/backlog/store.ts, src/backlog/ → src/a.ts · why replaced; it was:\n${FIELDS.why} · evidence replaced; it was:\n${FIELDS.evidence.join('\n')} · plan replaced; it was:\n${FIELDS.plan}`,
    );
    expect(store.notes(blank)[0]!.text).toBe('paths none → x · why added · evidence added · plan added');
    expect(store.update(item.ref, { paths: [] }, { id: 's1' }).paths).toEqual([]);
  });

  it('refuses a secret in any new field', () => {
    const store = storeFor('r');
    for (const field of ['why', 'plan']) expect(() => store.add({ title: 't', [field]: `use ${SECRET}`, createdBy: 'user' })).toThrow(new RegExp(`${field} .*secret`));
    expect(() => store.add({ title: 't', evidence: ['fine', SECRET], createdBy: 'user' })).toThrow(/evidence .*secret/);
    const item = store.add({ title: 't', createdBy: 'user' });
    expect(() => store.update(item.ref, { paths: [SECRET] }, { id: 's1' })).toThrow(/paths .*secret/);
  });

  it('adds with every field through the tool; get shows Goal, Where, Why, Evidence, Plan, then times, body and notes; list stays one line', async () => {
    const t = setup();
    expect(await t.text({ op: 'add', title: 'Path search', ...FIELDS, body: 'More background.', state: 'todo' })).toBe('Added B1 [todo p2] Path search');
    await t.text({ op: 'update', id: 'B1', note: 'looked at it' });
    const detail = await t.text({ op: 'get', id: 'B1' });
    const order = ['Goal: Search finds', 'Where: src/backlog/store.ts, src/backlog/', 'Why: Agents lose', 'Evidence:\n- src/backlog/store.ts:87 — body copied into notes\n- yarn test → 2 failures', 'Plan: Add four columns, then render them.\n  Keep search on LIKE.', 'created ', 'More background.', 'Notes and changes:'];
    const at = order.map((part) => detail.indexOf(part));
    expect(at.every((index) => index >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(await t.text({ op: 'list' })).toBe('B1 [todo p2] Path search');
    expect(await t.text({ op: 'list', query: 'src/backlog/' })).toBe('B1 [todo p2] Path search');
    expect(await t.text({ op: 'update', id: 'B1', paths: ['src/x.ts'], plan: 'Replace it.' })).toBe('Updated B1 [todo p2] Path search');
    expect(await t.text({ op: 'get', id: 'B1' })).toContain('Where: src/x.ts\n');
    expect(await t.text({ op: 'get', id: 'B1' })).toContain('Plan: Replace it.\n');
  });

  it('omits the sections an item leaves empty', async () => {
    const t = setup();
    await t.text({ op: 'add', title: 'Plain', goal: 'It works.', why: 'Because.' });
    const detail = await t.text({ op: 'get', id: 'B1' });
    expect(detail).toContain('Goal: It works.');
    expect(detail).toContain('Why: Because.');
    for (const heading of ['Where:', 'Evidence:', 'Plan:']) expect(detail).not.toContain(heading);
  });

  it('requires a goal when an agent adds, before anything is stored, but not when the user adds', async () => {
    const t = setup();
    await expect(t.call({ op: 'add', title: 'no goal' })).rejects.toThrow(/add needs a goal/);
    await expect(t.call({ op: 'add', title: 'blank goal', goal: '  ' })).rejects.toThrow(/add needs a goal/);
    expect(storeFor(fs.realpathSync(t.cwd)).list({ states: ['backlog'] }).total).toBe(0);
    await t.command.handler('add by the user', fakeCtx({ cwd: t.cwd, hasUI: false }));
    expect(storeFor(fs.realpathSync(t.cwd)).get('B1')).toMatchObject({ title: 'by the user', goal: '' });
  });

  it('describes each field by its decision rule, and says an update replaces the whole body', () => {
    const { properties } = setup().tool.parameters;
    expect(properties.paths.description).toMatch(/files, dirs or components/);
    expect(properties.why.description).toMatch(/why it matters/);
    expect(properties.evidence.description).toMatch(/observations/);
    expect(properties.plan.description).toMatch(/approach and steps/);
    expect(properties.body.description).toMatch(/update replaces the whole text/);
    expect(properties.paths.type).toBe('array');
    expect(properties.evidence.type).toBe('array');
  });

  it('lets a subagent propose with every field, but update only state and notes', async () => {
    const parent = setup();
    await parent.text({ op: 'add', title: 'delegated', goal: 'Done.', state: 'todo' });
    storeFor(fs.realpathSync(parent.cwd)).update('B1', { state: 'ongoing' }, { id: 'parent-session' });
    const sub = setup({ isSubagent: true, agentId: 'general-1', parentSession: 'parent-session' });
    expect(Object.keys(sub.tool.parameters.properties)).toEqual(expect.arrayContaining(['paths', 'why', 'evidence', 'plan']));
    await sub.text({ op: 'add', title: 'found', ...FIELDS, from: 'B1' });
    expect(storeFor(fs.realpathSync(sub.cwd)).get('B2')).toMatchObject({ paths: FIELDS.paths, evidence: FIELDS.evidence, why: FIELDS.why, plan: FIELDS.plan });
    await expect(sub.call({ op: 'add', title: 'no goal', why: 'x' })).rejects.toThrow(/add needs a goal/);
    for (const change of [{ paths: ['x'] }, { why: 'x' }, { evidence: ['x'] }, { plan: 'x' }]) {
      await expect(sub.call({ op: 'update', id: 'B1', ...change })).rejects.toThrow(/only the state and notes/);
    }
  });

  it('hands every saved field to the agent with "do"', async () => {
    const t = setup();
    storeFor(fs.realpathSync(t.cwd)).add({ title: 'Fix search', ...FIELDS, body: 'Extra.', state: 'todo', createdBy: 'user' });
    await t.command.handler('do B1', fakeCtx({ cwd: t.cwd, hasUI: false }));
    const message = t.sent.at(-1)!.message;
    expect(message).toContain('Where: src/backlog/store.ts, src/backlog/');
    expect(message).toContain('Why: Agents lose');
    expect(message).toContain('- yarn test → 2 failures');
    expect(message).toContain('Plan: Add four columns');
    expect(message).toContain('Extra.');
  });

  it('shows the fields in /backlog <id> and in the markdown export', async () => {
    const t = setup();
    storeFor(fs.realpathSync(t.cwd)).add({ title: 'Fix search', ...FIELDS, state: 'todo', createdBy: 'user' });
    const ctx = fakeCtx({ cwd: t.cwd, hasUI: false });
    await t.command.handler('B1', ctx);
    const shown = ctx.ui.notes.at(-1)!.message;
    expect(shown).toMatch(/Goal: .*\nWhere: src\/backlog\/store\.ts, src\/backlog\/\nWhy: .*\nEvidence:\n- .*\n- .*\nPlan: /);
    await t.command.handler('export', ctx);
    const markdown = fs.readFileSync(path.join(t.cwd, '.octocode', 'backlog.md'), 'utf8');
    expect(markdown).toContain('  Where: src/backlog/store.ts, src/backlog/\n  Why: Agents lose the reason behind an item after a resume.\n  Evidence:\n  - src/backlog/store.ts:87');
    expect(markdown).toContain('  Plan: Add four columns, then render them.\n    Keep search on LIKE.');
  });
});
