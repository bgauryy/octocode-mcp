import { describe, it, expect } from 'vitest';
import {
  PromptArgumentSchema,
  PromptMetadataSchema,
  ToolMetadataSchema,
  BaseSchemaSchema,
  BulkOperationsSchema,
  RawCompleteMetadataSchema,
} from '../../../src/tools/toolMetadata/schemas.js';

describe('toolMetadata/schemas', () => {
  describe('PromptArgumentSchema', () => {
    it('should validate valid prompt argument', () => {
      const result = PromptArgumentSchema.safeParse({
        name: 'testArg',
        description: 'A test argument',
        required: true,
      });
      expect(result.success).toBe(true);
    });

    it('should validate prompt argument without required field', () => {
      const result = PromptArgumentSchema.safeParse({
        name: 'optionalArg',
        description: 'Optional argument',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid prompt argument', () => {
      const result = PromptArgumentSchema.safeParse({
        name: 123,
        description: 'Invalid',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('PromptMetadataSchema', () => {
    it('should validate valid prompt metadata', () => {
      const result = PromptMetadataSchema.safeParse({
        name: 'testPrompt',
        description: 'Test prompt description',
        content: 'Test content',
        args: [{ name: 'arg1', description: 'First arg' }],
      });
      expect(result.success).toBe(true);
    });

    it('should validate prompt metadata without args', () => {
      const result = PromptMetadataSchema.safeParse({
        name: 'simplePrompt',
        description: 'Simple prompt',
        content: 'Content without args',
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing required fields', () => {
      const result = PromptMetadataSchema.safeParse({
        name: 'incomplete',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('ToolMetadataSchema', () => {
    it('should validate valid tool metadata', () => {
      const result = ToolMetadataSchema.safeParse({
        name: 'testTool',
        description: 'A test tool',
        schema: { field1: 'description1' },
        hints: {
          hasResults: ['hint1'],
          empty: ['empty hint'],
        },
      });
      expect(result.success).toBe(true);
    });

    it('should validate tool metadata with dynamic hints', () => {
      const result = ToolMetadataSchema.safeParse({
        name: 'dynamicTool',
        description: 'Tool with dynamic hints',
        schema: {},
        hints: {
          hasResults: [],
          empty: [],
          dynamic: {
            topicsHasResults: ['dynamic hint'],
          },
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid hints structure', () => {
      const result = ToolMetadataSchema.safeParse({
        name: 'invalidTool',
        description: 'Invalid',
        schema: {},
        hints: {
          hasResults: 'not-an-array',
          empty: [],
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('BaseSchemaSchema', () => {
    it('should validate valid base schema', () => {
      const result = BaseSchemaSchema.safeParse({
        mainResearchGoal: 'Main goal',
        researchGoal: 'Research goal',
        reasoning: 'Reasoning',
        bulkQueryTemplate: 'Template for {toolName}',
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing fields', () => {
      const result = BaseSchemaSchema.safeParse({
        mainResearchGoal: 'Only this',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('BulkOperationsSchema', () => {
    it('should validate valid bulk operations', () => {
      const result = BulkOperationsSchema.safeParse({
        instructions: {
          base: 'Base instruction',
          hasResults: 'Has results',
          empty: 'Empty',
          error: 'Error',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should validate partial bulk operations', () => {
      const result = BulkOperationsSchema.safeParse({
        instructions: {
          base: 'Only base',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should validate empty bulk operations', () => {
      const result = BulkOperationsSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('RawCompleteMetadataSchema', () => {
    const validMetadata = {
      instructions: 'Test instructions',
      prompts: {
        testPrompt: {
          name: 'testPrompt',
          description: 'Test',
          content: 'Content',
        },
      },
      toolNames: {
        GITHUB_SEARCH_CODE: 'githubSearchCode',
      },
      baseSchema: {
        mainResearchGoal: 'Main',
        researchGoal: 'Research',
        reasoning: 'Reason',
        bulkQueryTemplate: 'Template {toolName}',
      },
      tools: {
        githubSearchCode: {
          name: 'githubSearchCode',
          description: 'Search code',
          schema: { field: 'desc' },
          hints: {
            hasResults: ['hint'],
            empty: ['empty'],
          },
        },
      },
      baseHints: {
        hasResults: ['base hint'],
        empty: ['empty base'],
      },
      genericErrorHints: ['error hint'],
    };

    it('should validate complete metadata', () => {
      const result = RawCompleteMetadataSchema.safeParse(validMetadata);
      expect(result.success).toBe(true);
    });

    it('should validate with bulk operations', () => {
      const result = RawCompleteMetadataSchema.safeParse({
        ...validMetadata,
        bulkOperations: {
          instructions: { base: 'Base' },
        },
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid structure', () => {
      const result = RawCompleteMetadataSchema.safeParse({
        instructions: 'only this',
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid tool structure', () => {
      const result = RawCompleteMetadataSchema.safeParse({
        ...validMetadata,
        tools: {
          badTool: { name: 'bad' }, // Missing required fields
        },
      });
      expect(result.success).toBe(false);
    });
  });
});
