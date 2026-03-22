import { describe, it, expect } from 'vitest';
import { parseToolResponse, parseToolResponseBulk } from '../../utils/responseParser.js';

describe('parseToolResponse', () => {
  describe('structuredContent path', () => {
    it('returns structuredContent when available', () => {
      const result = parseToolResponse({
        structuredContent: { files: ['a.ts', 'b.ts'], count: 2 },
        isError: false,
      });
      expect(result.data).toEqual({ files: ['a.ts', 'b.ts'], count: 2 });
      expect(result.isError).toBe(false);
      expect(result.hints).toEqual([]);
    });

    it('preserves isError from response', () => {
      const result = parseToolResponse({
        structuredContent: { error: 'something' },
        isError: true,
      });
      expect(result.isError).toBe(true);
    });
  });

  describe('YAML content path', () => {
    it('extracts data from results[0].data', () => {
      const yaml = `results:
  - status: hasResults
    data:
      files:
        - path: test.ts
      totalMatches: 5`;
      const result = parseToolResponse({
        content: [{ type: 'text', text: yaml }],
      });
      expect(result.data.files).toBeDefined();
      expect(result.data.totalMatches).toBe(5);
      expect(result.status).toBe('hasResults');
      expect(result.isError).toBe(false);
    });

    it('extracts hasResultsStatusHints', () => {
      const yaml = `results:
  - status: hasResults
    data:
      files: []
hasResultsStatusHints:
  - Use lineHint for LSP
  - Check file paths`;
      const result = parseToolResponse({
        content: [{ type: 'text', text: yaml }],
      });
      expect(result.hints).toEqual(['Use lineHint for LSP', 'Check file paths']);
    });

    it('extracts emptyStatusHints', () => {
      const yaml = `results:
  - status: empty
    data: {}
emptyStatusHints:
  - Try broader search`;
      const result = parseToolResponse({
        content: [{ type: 'text', text: yaml }],
      });
      expect(result.hints).toEqual(['Try broader search']);
      expect(result.status).toBe('empty');
    });

    it('extracts errorStatusHints', () => {
      const yaml = `results:
  - status: error
    data:
      message: Rate limited
errorStatusHints:
  - Retry after 60s`;
      const result = parseToolResponse({
        content: [{ type: 'text', text: yaml }],
      });
      expect(result.hints).toEqual(['Retry after 60s']);
      expect(result.status).toBe('error');
      expect(result.isError).toBe(true);
    });

    it('extracts research context', () => {
      const yaml = `results:
  - status: hasResults
    mainResearchGoal: Find auth flow
    researchGoal: Locate middleware
    reasoning: Need to trace
    data:
      files: []`;
      const result = parseToolResponse({
        content: [{ type: 'text', text: yaml }],
      });
      expect(result.research.mainResearchGoal).toBe('Find auth flow');
      expect(result.research.researchGoal).toBe('Locate middleware');
      expect(result.research.reasoning).toBe('Need to trace');
    });
  });

  describe('fallback paths', () => {
    it('returns parsed YAML when no results array', () => {
      const yaml = `instructions: Do something\nkey: value`;
      const result = parseToolResponse({
        content: [{ type: 'text', text: yaml }],
      });
      expect(result.data).toHaveProperty('instructions');
      expect(result.data).toHaveProperty('key');
      expect(result.status).toBe('unknown');
    });

    it('returns empty result for invalid YAML', () => {
      const result = parseToolResponse({
        content: [{ type: 'text', text: '{{invalid yaml::' }],
      });
      expect(result.isError).toBe(true);
      expect(result.data).toEqual({});
    });

    it('returns empty result when no content', () => {
      const result = parseToolResponse({});
      expect(result.isError).toBe(true);
      expect(result.data).toEqual({});
      expect(result.hints).toEqual([]);
    });

    it('returns empty result for empty content array', () => {
      const result = parseToolResponse({ content: [] });
      expect(result.isError).toBe(true);
    });

    it('handles content with no text', () => {
      const result = parseToolResponse({ content: [{ type: 'text' }] });
      expect(result.isError).toBe(true);
    });

    it('handles results with non-object data', () => {
      const yaml = `results:
  - status: hasResults
    data: just-a-string`;
      const result = parseToolResponse({
        content: [{ type: 'text', text: yaml }],
      });
      expect(result.status).toBe('unknown');
    });
  });
});

describe('parseToolResponseBulk', () => {
  it('parses multiple results', () => {
    const yaml = `results:
  - id: 1
    status: hasResults
    data:
      files: [a.ts]
  - id: 2
    status: empty
    data: {}
  - id: 3
    status: error
    data:
      message: failed
hasResultsStatusHints:
  - Got results
emptyStatusHints:
  - No results
errorStatusHints:
  - Error occurred
instructions: Process all results`;
    const result = parseToolResponseBulk({
      content: [{ type: 'text', text: yaml }],
    });
    expect(result.results).toHaveLength(3);
    expect(result.counts).toEqual({ total: 3, hasResults: 1, empty: 1, error: 1 });
    expect(result.isError).toBe(false);
    expect(result.instructions).toBe('Process all results');
  });

  it('categorizes hints by status', () => {
    const yaml = `results:
  - status: hasResults
    data: {}
hasResultsStatusHints:
  - hint-a
emptyStatusHints:
  - hint-b
errorStatusHints:
  - hint-c`;
    const result = parseToolResponseBulk({
      content: [{ type: 'text', text: yaml }],
    });
    expect(result.hints.hasResults).toEqual(['hint-a']);
    expect(result.hints.empty).toEqual(['hint-b']);
    expect(result.hints.error).toEqual(['hint-c']);
  });

  it('marks isError true when all results are errors', () => {
    const yaml = `results:
  - id: 1
    status: error
    data:
      message: fail1
  - id: 2
    status: error
    data:
      message: fail2`;
    const result = parseToolResponseBulk({
      content: [{ type: 'text', text: yaml }],
    });
    expect(result.isError).toBe(true);
    expect(result.counts.error).toBe(2);
  });

  it('marks isError false when some succeed', () => {
    const yaml = `results:
  - status: hasResults
    data: {}
  - status: error
    data: {}`;
    const result = parseToolResponseBulk({
      content: [{ type: 'text', text: yaml }],
    });
    expect(result.isError).toBe(false);
  });

  it('extracts research context per result', () => {
    const yaml = `results:
  - status: hasResults
    mainResearchGoal: goal1
    researchGoal: sub1
    reasoning: reason1
    data:
      files: []`;
    const result = parseToolResponseBulk({
      content: [{ type: 'text', text: yaml }],
    });
    expect(result.results[0].research.mainResearchGoal).toBe('goal1');
    expect(result.results[0].research.researchGoal).toBe('sub1');
  });

  it('returns empty for no content', () => {
    const result = parseToolResponseBulk({});
    expect(result.results).toEqual([]);
    expect(result.isError).toBe(true);
    expect(result.counts.total).toBe(0);
  });

  it('returns empty for invalid YAML', () => {
    const result = parseToolResponseBulk({
      content: [{ type: 'text', text: '{{bad yaml' }],
    });
    expect(result.results).toEqual([]);
    expect(result.isError).toBe(true);
  });

  it('returns empty for missing results array', () => {
    const result = parseToolResponseBulk({
      content: [{ type: 'text', text: 'instructions: test' }],
    });
    expect(result.results).toEqual([]);
    expect(result.isError).toBe(true);
  });

  it('auto-assigns ids when missing', () => {
    const yaml = `results:
  - status: hasResults
    data: {}
  - status: hasResults
    data: {}`;
    const result = parseToolResponseBulk({
      content: [{ type: 'text', text: yaml }],
    });
    expect(result.results[0].id).toBe(1);
    expect(result.results[1].id).toBe(2);
  });

  it('skips non-object results', () => {
    const yaml = `results:
  - status: hasResults
    data: {}
  - null
  - just-a-string`;
    const result = parseToolResponseBulk({
      content: [{ type: 'text', text: yaml }],
    });
    expect(result.results).toHaveLength(1);
  });
});
