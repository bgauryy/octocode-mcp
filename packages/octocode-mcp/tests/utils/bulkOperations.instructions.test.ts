import { describe, it, expect, vi } from 'vitest';
import { executeBulkOperation } from '../../src/utils/bulkOperations';
import { TOOL_NAMES } from '../../src/tools/toolMetadata';
import { getTextContent } from './testHelpers.js';

describe('Bulk Instructions Generation', () => {
  const toolName = TOOL_NAMES.GITHUB_SEARCH_CODE;

  it('should generate correct base message and structure explanation', async () => {
    const queries = [{ id: 'q1' }];
    const processor = vi.fn().mockResolvedValue({
      status: 'hasResults' as const,
      data: { test: true },
    });

    const result = await executeBulkOperation(queries, processor, { toolName });
    const text = getTextContent(result.content);

    // Verify structure explanation
    expect(text).toContain(
      'Each result includes the status, data, and research details.'
    );
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

    expect(text).toContain('Bulk response with 3 results');
    expect(text).toContain('1 hasResults');
    expect(text).toContain('1 empty');
    expect(text).toContain('1 failed');
  });

  it('should include guidance only for present statuses', async () => {
    // Case 1: Only hasResults
    const q1 = [{ id: '1' }];
    const p1 = vi.fn().mockResolvedValue({ status: 'hasResults', data: {} });
    const r1 = await executeBulkOperation(q1, p1, { toolName });
    const t1 = getTextContent(r1.content);

    expect(t1).toContain('Review hasResultsStatusHints');
    expect(t1).not.toContain('Review emptyStatusHints');
    expect(t1).not.toContain('Review errorStatusHints');

    // Case 2: Only empty
    const q2 = [{ id: '2' }];
    const p2 = vi.fn().mockResolvedValue({ status: 'empty', data: {} });
    const r2 = await executeBulkOperation(q2, p2, { toolName });
    const t2 = getTextContent(r2.content);

    expect(t2).not.toContain('Review hasResultsStatusHints');
    expect(t2).toContain('Review emptyStatusHints');
    expect(t2).not.toContain('Review errorStatusHints');

    // Case 3: Only error
    const q3 = [{ id: '3' }];
    const p3 = vi.fn().mockResolvedValue({ status: 'error', error: 'e' });
    const r3 = await executeBulkOperation(q3, p3, { toolName });
    const t3 = getTextContent(r3.content);

    expect(t3).not.toContain('Review hasResultsStatusHints');
    expect(t3).not.toContain('Review emptyStatusHints');
    expect(t3).toContain('Review errorStatusHints');
  });
});
