import { describe, it, expect } from 'vitest';

// Import actual schemas to verify they are correctly built
import { BulkRipgrepQuerySchema } from '../../src/tools/local_ripgrep/scheme.js';
import { BulkViewStructureSchema } from '../../src/tools/local_view_structure/scheme.js';
import { BulkFindFilesSchema } from '../../src/tools/local_find_files/scheme.js';
import { BulkFetchContentSchema } from '../../src/tools/local_fetch_content/scheme.js';
import { STATIC_TOOL_NAMES } from '../../src/tools/toolMetadata/index.js';

describe('Local tool schemas (TDD for local tools registration)', () => {
  const bulkQueriesShape = (schema: unknown) =>
    (schema as { _def: { schema: { shape: { queries: { description?: string } } } } })
      ._def.schema.shape.queries;

  describe('BulkRipgrepQuerySchema', () => {
    it('should be defined and valid', () => {
      expect(BulkRipgrepQuerySchema).toBeDefined();
      expect(bulkQueriesShape(BulkRipgrepQuerySchema)).toBeDefined();
    });

    it('should have correct description containing tool name', () => {
      const description = bulkQueriesShape(BulkRipgrepQuerySchema).description || '';
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
      const description =
        bulkQueriesShape(BulkViewStructureSchema).description || '';
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
      const description = bulkQueriesShape(BulkFindFilesSchema).description || '';
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
      const description =
        bulkQueriesShape(BulkFetchContentSchema).description || '';
      expect(description).not.toContain('undefined');
      expect(description).toContain(STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT);
    });
  });
});
