import { describe, it, expect, vi, beforeAll } from 'vitest';
import { executeBulkOperation } from '../../src/utils/bulkOperations';
import {
  TOOL_NAMES,
  initializeToolMetadata,
} from '../../src/tools/toolMetadata';
import { getTextContent } from './testHelpers.js';

beforeAll(async () => {
  await initializeToolMetadata();
});

describe('Bulk Instructions Generation', () => {
  const toolName = TOOL_NAMES.GITHUB_SEARCH_CODE;

  it('should generate optimized concise instructions', async () => {
    const queries = [{ id: 'q1' }];
    const processor = vi.fn().mockResolvedValue({
      status: 'hasResults' as const,
      data: { test: true },
    });

    const result = await executeBulkOperation(queries, processor, { toolName });
    const text = getTextContent(result.content);

    // Optimized: Short instruction format
    expect(text).toContain('1 results:');
    expect(text).toContain('1 hasResults');
    expect(text).not.toContain('original query');
  });

  it('should include correct counts for all statuses', async () => {
    const queries = [
      { id: 'q1', type: 'hasResults' },
      { id: 'q2', type: 'empty' },
      { id: 'q3', type: 'error' },
    ];
    const processor = vi
      .fn()
      .mockImplementation(async (query: { type: string }) => {
        if (query.type === 'error') {
          return { status: 'error' as const, error: 'fail' };
        }
        return {
          status: query.type as 'hasResults' | 'empty',
          data: {},
        };
      });

    const result = await executeBulkOperation(queries, processor, { toolName });
    const text = getTextContent(result.content);

    // Optimized format
    expect(text).toContain('3 results:');
    expect(text).toContain('1 hasResults');
    expect(text).toContain('1 empty');
    expect(text).toContain('1 failed');
  });

  it('should include hints sections only for present statuses with custom hints', async () => {
    // Case 1: Only hasResults with custom hints - should have hasResultsStatusHints
    const q1 = [{ id: '1' }];
    const p1 = vi.fn().mockResolvedValue({
      status: 'hasResults',
      data: {},
      hints: ['Custom success hint'],
    });
    const r1 = await executeBulkOperation(q1, p1, { toolName });
    const t1 = getTextContent(r1.content);

    expect(t1).toContain('hasResultsStatusHints');
    expect(t1).toContain('Custom success hint');
    expect(t1).not.toContain('emptyStatusHints');
    expect(t1).not.toContain('errorStatusHints');

    // Case 2: Only empty with custom hints - should have emptyStatusHints
    const q2 = [{ id: '2' }];
    const p2 = vi.fn().mockResolvedValue({
      status: 'empty',
      data: {},
      hints: ['Custom empty hint'],
    });
    const r2 = await executeBulkOperation(q2, p2, { toolName });
    const t2 = getTextContent(r2.content);

    expect(t2).not.toContain('hasResultsStatusHints');
    expect(t2).toContain('emptyStatusHints');
    expect(t2).toContain('Custom empty hint');
    expect(t2).not.toContain('errorStatusHints');

    // Case 3: Only error with custom hints - should have errorStatusHints
    const q3 = [{ id: '3' }];
    const p3 = vi.fn().mockResolvedValue({
      status: 'error',
      error: 'e',
      hints: ['Custom error hint'],
    });
    const r3 = await executeBulkOperation(q3, p3, { toolName });
    const t3 = getTextContent(r3.content);

    expect(t3).not.toContain('hasResultsStatusHints');
    expect(t3).not.toContain('emptyStatusHints');
    expect(t3).toContain('errorStatusHints');
    expect(t3).toContain('Custom error hint');
  });
});
