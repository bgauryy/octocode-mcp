import { describe, it, expect } from 'vitest';

// Import actual schemas to verify they are correctly built
import { BulkRipgrepQuerySchema } from '@octocodeai/octocode-core';
import { BulkViewStructureSchema } from '@octocodeai/octocode-core';
import { BulkFindFilesSchema } from '@octocodeai/octocode-core';
import { BulkFetchContentSchema } from '@octocodeai/octocode-core';
import { STATIC_TOOL_NAMES } from '../../src/tools/toolNames.js';

describe('Local tool schemas (TDD for local tools registration)', () => {
  const bulkQueriesShape = (schema: unknown) => {
    const s = schema as Record<string, unknown>;
    const def = s.def as Record<string, unknown> | undefined;
    const inner = (def?.in ?? def?.schema) as
      | Record<string, unknown>
      | undefined;
    const shape = (inner?.shape ?? (s as Record<string, unknown>).shape) as
      | Record<string, unknown>
      | undefined;
    return shape?.queries as { description?: string } | undefined;
  };

  describe('BulkRipgrepQuerySchema', () => {
    it('should be defined and valid', () => {
      expect(BulkRipgrepQuerySchema).toBeDefined();
      expect(bulkQueriesShape(BulkRipgrepQuerySchema)).toBeDefined();
    });

    it('should have correct description containing tool name', () => {
      const queriesShape = bulkQueriesShape(BulkRipgrepQuerySchema);
      const description = queriesShape?.description ?? '';
      // Should contain the actual tool name, not 'undefined'
      expect(description).not.toContain('undefined');
      expect(description).toContain(STATIC_TOOL_NAMES.LOCAL_RIPGREP);
    });
  });

  describe('BulkViewStructureSchema', () => {
    it('should be defined and valid', () => {
      expect(BulkViewStructureSchema).toBeDefined();
      expect(bulkQueriesShape(BulkViewStructureSchema)).toBeDefined();
    });

    it('should have correct description containing tool name', () => {
      const queriesShape = bulkQueriesShape(BulkViewStructureSchema);
      const description = queriesShape?.description ?? '';
      expect(description).not.toContain('undefined');
      expect(description).toContain(STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE);
    });
  });

  describe('BulkFindFilesSchema', () => {
    it('should be defined and valid', () => {
      expect(BulkFindFilesSchema).toBeDefined();
      expect(bulkQueriesShape(BulkFindFilesSchema)).toBeDefined();
    });

    it('should have correct description containing tool name', () => {
      const queriesShape = bulkQueriesShape(BulkFindFilesSchema);
      const description = queriesShape?.description ?? '';
      expect(description).not.toContain('undefined');
      expect(description).toContain(STATIC_TOOL_NAMES.LOCAL_FIND_FILES);
    });
  });

  describe('BulkFetchContentSchema', () => {
    it('should be defined and valid', () => {
      expect(BulkFetchContentSchema).toBeDefined();
      expect(bulkQueriesShape(BulkFetchContentSchema)).toBeDefined();
    });

    it('should have correct description containing tool name', () => {
      const queriesShape = bulkQueriesShape(BulkFetchContentSchema);
      const description = queriesShape?.description ?? '';
      expect(description).not.toContain('undefined');
      expect(description).toContain(STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT);
    });
  });
});
