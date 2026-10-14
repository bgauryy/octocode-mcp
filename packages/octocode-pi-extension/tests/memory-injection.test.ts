import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { openAgentDb } from '../src/agentdb/db.js';
import { MEMORY_MESSAGE_TYPE, injectedIds, selectInjection, unchangedIds } from '../src/memory/inject.js';
import { MemoryStore } from '../src/memory/store.js';
import { tmp } from './helpers.js';

describe('bounded memory retrieval', () => {
  it.each([true, false])('finds unseen memories beyond the usual retrieval window (FTS: %s)', (fts) => {
    const db = openAgentDb(path.join(tmp(), 'memory.sqlite'));
    const store = new MemoryStore({ ...db, fts }, 'repo-a');
    try {
      for (const word of ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel', 'india', 'juliet', 'kilo', 'lima', 'mike', 'november', 'oscar', 'papa', 'quebec', 'romeo', 'sierra', 'tango']) {
        store.set({ title: `Rewind ${word}`, author: 'test' });
      }
      const ranked = store.search('rewind', 'all', 20);
      expect(ranked).toHaveLength(20);
      const unseen = ranked.at(-1)!;
      const seen = new Set(ranked.slice(0, -1).map((memory) => memory.id));
      expect(selectInjection(store, { query: 'rewind', scope: 'all', seen, topK: 1 })?.ids).toEqual([unseen.id]);
    } finally {
      db.close();
    }
  });

  it('keeps the retrieval limit independent of memories already seen', () => {
    const db = openAgentDb(path.join(tmp(), 'memory.sqlite'));
    try {
      const store = new MemoryStore(db, 'repo-a');
      const search = vi.spyOn(store, 'search');
      selectInjection(store, { query: 'rewind checkpoints', scope: 'all', seen: new Set(Array.from({ length: 10_000 }, (_, i) => i)), topK: 5 });
      expect(search.mock.calls[0]![2]).toBeLessThanOrEqual(10);
    } finally {
      db.close();
    }
  });
});

describe('injected ids across a compaction', () => {
  it('keeps the ids injected from the compaction\'s first kept entry on', () => {
    const message = (ids: unknown[]) => ({ type: 'custom_message', customType: MEMORY_MESSAGE_TYPE, content: 'x', details: { ids } });
    // A compaction keeps the entries from its first kept entry on: injections there are still in context.
    const kept = [{ ...message([1]), id: 'm1' }, { ...message([2]), id: 'm2' }, { ...message([3]), id: 'm3' }];
    expect([...injectedIds([...kept, { type: 'compaction', firstKeptEntryId: 'm2' }, message([4])]).keys()]).toEqual([2, 3, 4]);
    // A later compaction counts from its own first kept entry; one whose kept entry is not on the branch drops all.
    expect([...injectedIds([...kept, { type: 'compaction', firstKeptEntryId: 'm2' }, { ...message([4]), id: 'm4' }, { type: 'compaction', firstKeptEntryId: 'm4' }]).keys()]).toEqual([4]);
    expect([...injectedIds([...kept, { type: 'compaction', firstKeptEntryId: 'gone' }]).keys()]).toEqual([]);
  });
});

describe('edited and long memories', () => {
  it('sends a memory again once it was edited after its injection; an injection without versions still counts', () => {
    const db = openAgentDb(path.join(tmp(), 'memory.sqlite'));
    try {
      const store = new MemoryStore(db, 'repo-a');
      const memory = store.set({ title: 'Rewind notes', author: 'test' }, 1_000).memory;
      const first = selectInjection(store, { query: 'rewind', scope: 'all', seen: new Set(), topK: 5 })!;
      expect(first.updated).toEqual([1_000]);
      const branch = [{ type: 'custom_message', customType: MEMORY_MESSAGE_TYPE, content: first.content, details: { ids: first.ids, updated: first.updated } }];
      expect(injectedIds(branch)).toEqual(new Map([[memory.id, 1_000]]));
      expect(selectInjection(store, { query: 'rewind', scope: 'all', seen: unchangedIds(store, injectedIds(branch)), topK: 5 })).toBeUndefined();
      store.set({ id: memory.id, title: 'Rewind notes', body: 'now with a body', author: 'test' }, 2_000);
      expect(selectInjection(store, { query: 'rewind', scope: 'all', seen: unchangedIds(store, injectedIds(branch)), topK: 5 })?.ids).toEqual([memory.id]);
      const legacy = [{ type: 'custom_message', customType: MEMORY_MESSAGE_TYPE, content: 'x', details: { ids: [memory.id] } }];
      expect(unchangedIds(store, injectedIds(legacy))).toEqual(new Set([memory.id]));
    } finally {
      db.close();
    }
  });

  it('ends a memory line cut for the injection with the call that reads it whole', () => {
    const db = openAgentDb(path.join(tmp(), 'memory.sqlite'));
    try {
      const store = new MemoryStore(db, 'repo-a');
      const memory = store.set({ title: 'Rewind notes', body: 'word '.repeat(290), author: 'test' }).memory;
      const line = selectInjection(store, { query: 'rewind', scope: 'all', seen: new Set(), topK: 5 })!.content.split('\n')[1]!;
      expect(line.length).toBeLessThanOrEqual(600);
      expect(line.endsWith(`…" (memory get M${memory.id})`)).toBe(true);
    } finally {
      db.close();
    }
  });
});
