import { describe, it, expect } from 'vitest';

// Import actual schemas to verify they are correctly built
import { BulkRipgrepQuerySchema } from '../../src/scheme/local_ripgrep.js';
import { BulkViewStructureSchema } from '../../src/scheme/local_view_structure.js';
import { BulkFindFilesSchema } from '../../src/scheme/local_find_files.js';
import { BulkFetchContentSchema } from '../../src/scheme/local_fetch_content.js';
import { STATIC_TOOL_NAMES } from '../../src/tools/toolMetadata.js';

describe('Local tool schemas (TDD for local tools registration)', () => {
  describe('BulkRipgrepQuerySchema', () => {
    it('should be defined and valid', () => {
      expect(BulkRipgrepQuerySchema).toBeDefined();
      expect(BulkRipgrepQuerySchema.shape.queries).toBeDefined();
    });

    it('should have correct description containing tool name', () => {
      const description =
        BulkRipgrepQuerySchema.shape.queries.description || '';
      // Should contain the actual tool name, not 'undefined'
      expect(description).not.toContain('undefined');
      expect(description).toContain(STATIC_TOOL_NAMES.LOCAL_RIPGREP);
    });
  });

  describe('BulkViewStructureSchema', () => {
    it('should be defined and valid', () => {
      expect(BulkViewStructureSchema).toBeDefined();
      expect(BulkViewStructureSchema.shape.queries).toBeDefined();
    });

    it('should have correct description containing tool name', () => {
      const description =
        BulkViewStructureSchema.shape.queries.description || '';
      expect(description).not.toContain('undefined');
      expect(description).toContain(STATIC_TOOL_NAMES.LOCAL_VIEW_STRUCTURE);
    });
  });

  describe('BulkFindFilesSchema', () => {
    it('should be defined and valid', () => {
      expect(BulkFindFilesSchema).toBeDefined();
      expect(BulkFindFilesSchema.shape.queries).toBeDefined();
    });

    it('should have correct description containing tool name', () => {
      const description = BulkFindFilesSchema.shape.queries.description || '';
      expect(description).not.toContain('undefined');
      expect(description).toContain(STATIC_TOOL_NAMES.LOCAL_FIND_FILES);
    });
  });

  describe('BulkFetchContentSchema', () => {
    it('should be defined and valid', () => {
      expect(BulkFetchContentSchema).toBeDefined();
      expect(BulkFetchContentSchema.shape.queries).toBeDefined();
    });

    it('should have correct description containing tool name', () => {
      const description =
        BulkFetchContentSchema.shape.queries.description || '';
      expect(description).not.toContain('undefined');
      expect(description).toContain(STATIC_TOOL_NAMES.LOCAL_FETCH_CONTENT);
    });
  });
});
