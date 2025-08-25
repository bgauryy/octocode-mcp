import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  withSmartValidation,
  withValidation,
} from '../../../src/utils/withSecurityValidation';
import { CallToolResult } from '@modelcontextprotocol/sdk/types';

describe('Smart Unified Validation System', () => {
  const mockHandler = vi.fn(async (args: Record<string, unknown>) => {
    return {
      content: [{ type: 'text', text: `Processed: ${JSON.stringify(args)}` }],
    } as CallToolResult;
  });

  beforeEach(() => {
    mockHandler.mockClear();
  });

  describe('Schema Validation (Zod)', () => {
    const testSchema = z.object({
      name: z.string().min(1),
      count: z.number().int().min(0),
      tags: z.array(z.string()).optional(),
    });

    it('should validate correct input with full type safety', async () => {
      const handler = withSmartValidation(testSchema, mockHandler);

      const validInput = { name: 'test', count: 5, tags: ['a', 'b'] };
      await handler(validInput);

      expect(mockHandler).toHaveBeenCalledWith(validInput);
    });

    it('should reject invalid input with clear error messages', async () => {
      const handler = withSmartValidation(testSchema, mockHandler);

      const invalidInput = { name: '', count: -1 };
      const result = await handler(invalidInput);

      expect(result).toHaveProperty('isError', true);
      const content = (result as { content: Array<{ text: string }> })
        .content[0]?.text;
      expect(content).toContain('Invalid parameters');
      expect(content).toContain('String must contain at least 1 character');
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should limit error verbosity to prevent overwhelming messages', async () => {
      const complexSchema = z.object({
        a: z.string().min(5),
        b: z.string().min(5),
        c: z.string().min(5),
        d: z.string().min(5),
        e: z.string().min(5),
      });

      const handler = withSmartValidation(complexSchema, mockHandler);

      const result = await handler({ a: '1', b: '2', c: '3', d: '4', e: '5' });
      const content = (result as { content: Array<{ text: string }> })
        .content[0]?.text;

      // Should limit to 3 errors max
      const errorCount = (content?.match(/String must contain/g) || []).length;
      expect(errorCount).toBeLessThanOrEqual(3);
    });
  });

  describe('Smart Intelligence - Context-Aware Sanitization', () => {
    const flexibleSchema = z.record(z.unknown());

    it('should NEVER sanitize search/query content', async () => {
      const handler = withSmartValidation(flexibleSchema, mockHandler, 'smart');

      const searchInputs = [
        { query: 'find rm -rf examples in codebase' },
        { searchTerms: ['rm', 'dangerous commands', 'sudo'] },
        { description: 'How to use rm -rf safely; be careful | with pipes' },
        { documentation: 'The command sudo && rm can delete files' },
        { text: 'Example: system("rm temp.log")' },
        { content: 'Code snippet: if (cleanup) { rm(files); }' },
        { comment: 'TODO: rm old files using shell script' },
        { message: 'Use rm | grep to find patterns' },
        { title: 'File deletion with rm -rf command' },
        { body: 'This function calls rm && cleanup' },
      ];

      for (const input of searchInputs) {
        mockHandler.mockClear();
        await handler(input);

        // Should pass through completely unchanged
        expect(mockHandler).toHaveBeenCalledWith(input);
      }
    });

    it('should NEVER sanitize structural parameters', async () => {
      const handler = withSmartValidation(flexibleSchema, mockHandler, 'smart');

      const structuralInputs = [
        { owner: 'facebook/react-rm-dangerous' },
        { repo: 'sudo-toolkit' },
        { path: '/usr/bin/rm' },
        { file: 'delete-all.sh' },
        { branch: 'feature/rm-cleanup' },
        { tag: 'v1.0-rm-safe' },
        { id: 'dangerous-rm-operation-123' },
      ];

      for (const input of structuralInputs) {
        mockHandler.mockClear();
        await handler(input);

        // Should pass through completely unchanged
        expect(mockHandler).toHaveBeenCalledWith(input);
      }
    });

    it('should sanitize ONLY dangerous command injection in command parameters', async () => {
      const handler = withSmartValidation(flexibleSchema, mockHandler, 'smart');

      const dangerousCommandInput = {
        query: 'find dangerous rm examples', // Should NOT be sanitized
        command: 'ls files; rm -rf /', // Should BE sanitized
        shellScript: 'backup && rm critical_data', // Should BE sanitized
        systemCommand: 'echo hello | rm temp', // Should BE sanitized
      };

      await handler(dangerousCommandInput);
      expect(mockHandler).toHaveBeenCalled();
      const sanitizedArgs = mockHandler.mock.calls[0]?.[0];
      expect(sanitizedArgs).toBeDefined();
      if (!sanitizedArgs) return;

      // Search content unchanged
      expect(sanitizedArgs.query).toBe('find dangerous rm examples');

      // Command parameters sanitized
      expect(sanitizedArgs.command).toContain('[BLOCKED]');
      expect(sanitizedArgs.shellScript).toContain('[BLOCKED]');
      expect(sanitizedArgs.systemCommand).toContain('[BLOCKED]');

      // Original dangerous parts should be blocked
      expect(sanitizedArgs.command).toBe('ls files; [BLOCKED] -rf /');
      expect(sanitizedArgs.shellScript).toBe(
        'backup && [BLOCKED] critical_data'
      );
      expect(sanitizedArgs.systemCommand).toBe('echo hello | [BLOCKED] temp');
    });

    it('should allow benign commands in command parameters', async () => {
      const handler = withSmartValidation(flexibleSchema, mockHandler, 'smart');

      const benignCommandInput = {
        command: 'echo hello world',
        shellScript: 'ls -la',
        bashCommand: 'pwd && date',
      };

      await handler(benignCommandInput);
      expect(mockHandler).toHaveBeenCalled();
      const sanitizedArgs = mockHandler.mock.calls[0]?.[0];
      expect(sanitizedArgs).toBeDefined();
      if (!sanitizedArgs) return;

      // Should pass through unchanged (no dangerous patterns)
      expect(sanitizedArgs.command).toBe('echo hello world');
      expect(sanitizedArgs.shellScript).toBe('ls -la');
      expect(sanitizedArgs.bashCommand).toBe('pwd && date');
    });

    it('should provide smart decision logging in development', async () => {
      // Set NODE_ENV to development for this test
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      try {
        const handler = withSmartValidation(
          flexibleSchema,
          mockHandler,
          'smart'
        );

        await handler({
          query: 'safe search content',
          command: 'dangerous; rm -rf /',
        });

        // Should log smart decisions about sanitization
        expect(consoleSpy).toHaveBeenCalledWith(
          'Smart validation decisions:',
          expect.arrayContaining([
            expect.objectContaining({
              key: 'command',
              action: 'sanitized',
              reason: 'Command parameter with dangerous injection patterns',
            }),
          ])
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
        consoleSpy.mockRestore();
      }
    });
  });

  describe('Intelligence Levels', () => {
    const testSchema = z.object({
      query: z.string(),
      command: z.string().optional(),
    });

    it('should use minimal intelligence (schema only)', async () => {
      const handler = withSmartValidation(testSchema, mockHandler, 'minimal');

      const input = {
        query: 'test',
        command: 'rm -rf dangerous; sudo kill',
      };

      await handler(input);

      // Minimal mode: no sanitization at all, just schema validation
      expect(mockHandler).toHaveBeenCalledWith(input);
    });

    it('should use smart intelligence (context-aware)', async () => {
      const handler = withSmartValidation(testSchema, mockHandler, 'smart');

      const input = {
        query: 'find rm examples',
        command: 'echo hello; rm -rf /',
      };

      await handler(input);
      expect(mockHandler).toHaveBeenCalled();
      const result = mockHandler.mock.calls[0]?.[0];
      expect(result).toBeDefined();
      if (!result) return;

      // Smart mode: query unchanged, command sanitized
      expect(result.query).toBe('find rm examples');
      expect(result.command).toContain('[BLOCKED]');
    });

    it('should use strict intelligence (comprehensive sanitization)', async () => {
      const handler = withSmartValidation(testSchema, mockHandler, 'strict');

      const input = {
        query: 'test query',
        command: 'normal command',
      };

      await handler(input);

      // Strict mode uses ContentSanitizer - should still pass for normal content
      expect(mockHandler).toHaveBeenCalled();
    });
  });

  describe('Backward Compatibility API', () => {
    it('should work with withValidation helper', async () => {
      const legacyHandler = withValidation(
        async (args: { name: string; query: string }) => {
          return { content: [{ type: 'text', text: `Legacy: ${args.name}` }] };
        }
      );

      const input = {
        name: 'test',
        query: 'find rm -rf examples', // Should not be sanitized
      };

      const result = await legacyHandler(input);
      expect(result.content[0]?.text).toContain('Legacy: test');
    });
  });

  describe('Error Handling', () => {
    it('should handle handler exceptions gracefully', async () => {
      const errorHandler = vi.fn(async () => {
        throw new Error('Handler failed');
      });

      const handler = withSmartValidation(z.record(z.unknown()), errorHandler);

      const result = await handler({ test: 'data' });

      expect(result).toHaveProperty('isError', true);
      const content = (result as { content: Array<{ text: string }> })
        .content[0]?.text;
      expect(content).toContain('Validation error');
      expect(content).toContain('Handler failed');
    });

    it('should reject non-object inputs', async () => {
      const handler = withSmartValidation(z.record(z.unknown()), mockHandler);

      const invalidInputs = [null, undefined, 'string', 123, [], true];

      for (const input of invalidInputs) {
        const result = await handler(input);
        expect(result).toHaveProperty('isError', true);
      }
    });
  });

  describe('Real-World Scenarios', () => {
    const githubSearchSchema = z.object({
      queryTerms: z.array(z.string()),
      owner: z.string().optional(),
      repo: z.string().optional(),
      language: z.string().optional(),
    });

    it('should handle GitHub search tool perfectly', async () => {
      const handler = withSmartValidation(
        githubSearchSchema,
        mockHandler,
        'smart'
      );

      const realSearchInput = {
        queryTerms: [
          'rm -rf',
          'dangerous commands',
          'sudo access',
          'shell injection; rm files',
        ],
        owner: 'facebook',
        repo: 'dangerous-rm-toolkit',
        language: 'shell',
      };

      await handler(realSearchInput);
      expect(mockHandler).toHaveBeenCalled();
      const result = mockHandler.mock.calls[0]?.[0];
      expect(result).toBeDefined();
      if (!result) return;

      // ALL parameters should pass through unchanged
      // Smart system recognizes this as search/structural content
      expect(result).toEqual(realSearchInput);
    });

    const buildToolSchema = z.object({
      searchQuery: z.string(),
      buildCommand: z.string(),
      description: z.string().optional(),
    });

    it('should handle build tool with mixed content types', async () => {
      const handler = withSmartValidation(
        buildToolSchema,
        mockHandler,
        'smart'
      );

      const buildInput = {
        searchQuery: 'find rm -rf usage in build scripts',
        buildCommand: 'npm build && rm -rf dist; rm node_modules',
        description: 'Clean build that uses rm to delete old files',
      };

      await handler(buildInput);
      expect(mockHandler).toHaveBeenCalled();
      const result = mockHandler.mock.calls[0]?.[0];
      expect(result).toBeDefined();
      if (!result) return;

      // Search query and description should be unchanged
      expect(result.searchQuery).toBe(buildInput.searchQuery);
      expect(result.description).toBe(buildInput.description);

      // Build command should be sanitized for dangerous parts
      expect(result.buildCommand).toContain('[BLOCKED]');
      expect(result.buildCommand).toBe(
        'npm build && [BLOCKED] -rf dist; [BLOCKED] node_modules'
      );
    });
  });
});
