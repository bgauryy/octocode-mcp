import { describe, expect, it } from 'vitest';
import { connectDb } from '../src/db-runtime.js';
import { insertMemory } from '../src/memory-write.js';
import { getMemory } from '../src/memory-recall.js';

describe('bounded ranked memory recall', () => {
  it('exposes omitted ranked results instead of claiming a complete result', () => {
    const db = connectDb(':memory:');
    try {
      for (let i = 0; i < 8; i++) insertMemory(db, { taskContext: 'limits', observation: `shared constraint ${i}`, importance: 5 });
      const bounded = getMemory(db, { query: 'constraint', limit: 2, recordAccess: false });
      expect(bounded.memories).toHaveLength(2);
      expect(bounded.partial).toBe(true);
      expect(bounded.terminalLimit?.code).toBe('MEMORY_RECALL_LIMIT');
      const complete = getMemory(db, { query: 'constraint', limit: 20, recordAccess: false });
      expect(complete.memories).toHaveLength(8);
      expect(complete.partial).toBe(false);
      expect(complete.terminalLimit).toBeUndefined();
    } finally { db.close(); }
  });
});
