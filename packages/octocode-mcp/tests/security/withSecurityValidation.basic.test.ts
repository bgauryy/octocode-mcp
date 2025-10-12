import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  withBasicSecurityValidation,
  withSecurityValidation,
} from '../../src/security/withSecurityValidation.js';
import { ContentSanitizer } from '../../src/security/contentSanitizer.js';
import { createResult } from '../../src/responses.js';
import * as session from '../../src/session.js';
import * as serverConfig from '../../src/serverConfig.js';
import { TOOL_NAMES } from '../../src/constants.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types';

// Mock dependencies
vi.mock('../../src/security/contentSanitizer.js');
vi.mock('../../src/session.js');
vi.mock('../../src/serverConfig.js');

// Mock sanitizeContent to always return proper structure
vi.mock('../../src/security/contentSanitizer.js', () => ({
  ContentSanitizer: {
    validateInputParameters: vi.fn(),
    sanitizeContent: vi.fn((content: string) => ({
      content,
      hasSecrets: false,
      secretsDetected: [],
      warnings: [],
      hasPromptInjection: false,
      isMalicious: false,
    })),
  },
}));

describe('withSecurityValidation - Additional Coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('withBasicSecurityValidation', () => {
    it('should successfully validate and execute handler', async () => {
      const mockHandler = vi.fn().mockResolvedValue(
        createResult({
          data: { success: true },
          isError: false,
        })
      );

      const mockValidation = {
        isValid: true,
        sanitizedParams: { query: 'test' },
        warnings: [],
        hasSecrets: false,
      };

      vi.mocked(ContentSanitizer.validateInputParameters).mockReturnValue(
        mockValidation
      );

      const wrappedHandler = withBasicSecurityValidation(mockHandler);
      const result = await wrappedHandler({ query: 'test' });

      expect(ContentSanitizer.validateInputParameters).toHaveBeenCalledWith({
        query: 'test',
      });
      expect(mockHandler).toHaveBeenCalledWith({ query: 'test' });
      expect(result).toHaveProperty('content');
    });

    it('should reject invalid parameters', async () => {
      const mockHandler = vi.fn();

      const mockValidation = {
        isValid: false,
        sanitizedParams: {},
        warnings: ['Invalid parameter detected', 'Dangerous content found'],
        hasSecrets: false,
      };

      vi.mocked(ContentSanitizer.validateInputParameters).mockReturnValue(
        mockValidation
      );

      const wrappedHandler = withBasicSecurityValidation(mockHandler);
      const result = await wrappedHandler({ malicious: 'input' });

      expect(mockHandler).not.toHaveBeenCalled();
      expect(result).toHaveProperty('content');
      const content = Array.isArray(result.content)
        ? result.content
        : [result.content];
      const errorText = content
        .map(c => (typeof c === 'object' && 'text' in c ? c.text : String(c)))
        .join('');
      expect(errorText).toContain('Security validation failed');
      expect(errorText).toContain('Invalid parameter detected');
      expect(errorText).toContain('Dangerous content found');
    });

    it('should handle handler errors gracefully', async () => {
      const mockHandler = vi
        .fn()
        .mockRejectedValue(new Error('Handler execution failed'));

      const mockValidation = {
        isValid: true,
        sanitizedParams: { query: 'test' },
        warnings: [],
        hasSecrets: false,
      };

      vi.mocked(ContentSanitizer.validateInputParameters).mockReturnValue(
        mockValidation
      );

      const wrappedHandler = withBasicSecurityValidation(mockHandler);

      // Handler errors are caught and wrapped in createResult
      const result = await wrappedHandler({ query: 'test' });

      expect(result).toHaveProperty('content');
      const content = Array.isArray(result.content)
        ? result.content
        : [result.content];
      const errorText = content
        .map(c => (typeof c === 'object' && 'text' in c ? c.text : String(c)))
        .join('');
      expect(errorText).toContain('Security validation error');
      expect(errorText).toContain('Handler execution failed');
    });

    it('should handle validation errors', async () => {
      const mockHandler = vi.fn();

      vi.mocked(ContentSanitizer.validateInputParameters).mockImplementation(
        () => {
          throw new Error('Validation error');
        }
      );

      const wrappedHandler = withBasicSecurityValidation(mockHandler);
      const result = await wrappedHandler({ query: 'test' });

      expect(mockHandler).not.toHaveBeenCalled();
      expect(result).toHaveProperty('content');
      const content = Array.isArray(result.content)
        ? result.content
        : [result.content];
      const errorText = content
        .map(c => (typeof c === 'object' && 'text' in c ? c.text : String(c)))
        .join('');
      expect(errorText).toContain('Security validation error');
      expect(errorText).toContain('Validation error');
    });

    it('should handle non-Error exceptions in validation', async () => {
      const mockHandler = vi.fn();

      vi.mocked(ContentSanitizer.validateInputParameters).mockImplementation(
        () => {
          throw 'String error'; // Non-Error object
        }
      );

      const wrappedHandler = withBasicSecurityValidation(mockHandler);
      const result = await wrappedHandler({ query: 'test' });

      expect(result).toHaveProperty('content');
      const content = Array.isArray(result.content)
        ? result.content
        : [result.content];
      const errorText = content
        .map(c => (typeof c === 'object' && 'text' in c ? c.text : String(c)))
        .join('');
      expect(errorText).toContain('Security validation error');
      expect(errorText).toContain('Unknown error');
    });
  });

  describe('withSecurityValidation - Logging Integration', () => {
    it('should log tool call when logging is enabled and repos are found', async () => {
      const mockHandler = vi.fn().mockResolvedValue(
        createResult({
          data: { success: true },
          isError: false,
        })
      );

      const mockValidation = {
        isValid: true,
        sanitizedParams: {
          queries: [
            { owner: 'facebook', repo: 'react' },
            { owner: 'microsoft', repo: 'vscode' },
          ],
        },
        warnings: [],
        hasSecrets: false,
      };

      vi.mocked(ContentSanitizer.validateInputParameters).mockReturnValue(
        mockValidation
      );
      vi.mocked(serverConfig.isLoggingEnabled).mockReturnValue(true);
      vi.mocked(session.logToolCall).mockResolvedValue(undefined);

      const wrappedHandler = withSecurityValidation(
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        mockHandler
      );

      await wrappedHandler(
        { queries: [{ owner: 'facebook', repo: 'react' }] },
        { sessionId: 'test-session' }
      );

      expect(session.logToolCall).toHaveBeenCalledWith(
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        ['facebook/react', 'microsoft/vscode']
      );
    });

    it('should not log when logging is disabled', async () => {
      const mockHandler = vi.fn().mockResolvedValue(
        createResult({
          data: { success: true },
          isError: false,
        })
      );

      const mockValidation = {
        isValid: true,
        sanitizedParams: {
          queries: [{ owner: 'facebook', repo: 'react' }],
        },
        warnings: [],
        hasSecrets: false,
      };

      vi.mocked(ContentSanitizer.validateInputParameters).mockReturnValue(
        mockValidation
      );
      vi.mocked(serverConfig.isLoggingEnabled).mockReturnValue(false);

      const wrappedHandler = withSecurityValidation(
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        mockHandler
      );

      await wrappedHandler(
        { queries: [{ owner: 'facebook', repo: 'react' }] },
        { sessionId: 'test-session' }
      );

      expect(session.logToolCall).not.toHaveBeenCalled();
    });

    it('should not log when no repos are found in parameters', async () => {
      const mockHandler = vi.fn().mockResolvedValue(
        createResult({
          data: { success: true },
          isError: false,
        })
      );

      const mockValidation = {
        isValid: true,
        sanitizedParams: {
          someOtherParam: 'value',
        },
        warnings: [],
        hasSecrets: false,
      };

      vi.mocked(ContentSanitizer.validateInputParameters).mockReturnValue(
        mockValidation
      );
      vi.mocked(serverConfig.isLoggingEnabled).mockReturnValue(true);

      const wrappedHandler = withSecurityValidation('test-tool', mockHandler);

      await wrappedHandler(
        { someOtherParam: 'value' },
        { sessionId: 'test-session' }
      );

      expect(session.logToolCall).not.toHaveBeenCalled();
    });

    it('should ignore logging errors and continue execution', async () => {
      const mockHandler = vi.fn().mockResolvedValue(
        createResult({
          data: { success: true },
          isError: false,
        })
      );

      const mockValidation = {
        isValid: true,
        sanitizedParams: {
          queries: [{ owner: 'facebook', repo: 'react' }],
        },
        warnings: [],
        hasSecrets: false,
      };

      vi.mocked(ContentSanitizer.validateInputParameters).mockReturnValue(
        mockValidation
      );
      vi.mocked(serverConfig.isLoggingEnabled).mockReturnValue(true);
      vi.mocked(session.logToolCall).mockRejectedValue(
        new Error('Logging failed')
      );

      const wrappedHandler = withSecurityValidation(
        TOOL_NAMES.GITHUB_SEARCH_CODE,
        mockHandler
      );

      // Should not throw despite logging error
      const result = await wrappedHandler(
        { queries: [{ owner: 'facebook', repo: 'react' }] },
        { sessionId: 'test-session' }
      );

      expect(result).toHaveProperty('content');
      expect(mockHandler).toHaveBeenCalled();
    });
  });

  describe('withSecurityValidation - UserContext Creation', () => {
    it('should create userContext with sessionId', async () => {
      const mockHandler = vi.fn().mockResolvedValue(
        createResult({
          data: { success: true },
          isError: false,
        })
      );

      const mockValidation = {
        isValid: true,
        sanitizedParams: { query: 'test' },
        warnings: [],
        hasSecrets: false,
      };

      vi.mocked(ContentSanitizer.validateInputParameters).mockReturnValue(
        mockValidation
      );

      const wrappedHandler = withSecurityValidation('test-tool', mockHandler);

      await wrappedHandler({ query: 'test' }, { sessionId: 'session-123' });

      expect(mockHandler).toHaveBeenCalledWith(
        { query: 'test' },
        undefined,
        expect.objectContaining({
          userId: 'anonymous',
          userLogin: 'anonymous',
          isEnterpriseMode: false,
          sessionId: 'session-123',
        })
      );
    });

    it('should pass authInfo to handler', async () => {
      const mockHandler = vi.fn().mockResolvedValue(
        createResult({
          data: { success: true },
          isError: false,
        })
      );

      const mockValidation = {
        isValid: true,
        sanitizedParams: { query: 'test' },
        warnings: [],
        hasSecrets: false,
      };

      vi.mocked(ContentSanitizer.validateInputParameters).mockReturnValue(
        mockValidation
      );

      const wrappedHandler = withSecurityValidation('test-tool', mockHandler);

      const mockAuthInfo = {
        token: 'test-token',
      } as unknown as AuthInfo;

      await wrappedHandler({ query: 'test' }, { authInfo: mockAuthInfo });

      expect(mockHandler).toHaveBeenCalledWith(
        { query: 'test' },
        mockAuthInfo,
        expect.objectContaining({
          userId: 'anonymous',
          userLogin: 'anonymous',
        })
      );
    });

    it('should handle undefined sessionId', async () => {
      const mockHandler = vi.fn().mockResolvedValue(
        createResult({
          data: { success: true },
          isError: false,
        })
      );

      const mockValidation = {
        isValid: true,
        sanitizedParams: { query: 'test' },
        warnings: [],
        hasSecrets: false,
      };

      vi.mocked(ContentSanitizer.validateInputParameters).mockReturnValue(
        mockValidation
      );

      const wrappedHandler = withSecurityValidation('test-tool', mockHandler);

      await wrappedHandler({ query: 'test' }, {});

      expect(mockHandler).toHaveBeenCalledWith(
        { query: 'test' },
        undefined,
        expect.objectContaining({
          userId: 'anonymous',
          sessionId: undefined,
        })
      );
    });
  });

  describe('withSecurityValidation - Error Handling', () => {
    it('should handle validation errors with proper error response', async () => {
      const mockHandler = vi.fn();

      vi.mocked(ContentSanitizer.validateInputParameters).mockImplementation(
        () => {
          throw new Error('Critical validation error');
        }
      );

      const wrappedHandler = withSecurityValidation('test-tool', mockHandler);
      const result = await wrappedHandler(
        { query: 'test' },
        { sessionId: 'test' }
      );

      expect(result).toHaveProperty('content');
      const content = Array.isArray(result.content)
        ? result.content
        : [result.content];
      const errorText = content
        .map(c => (typeof c === 'object' && 'text' in c ? c.text : String(c)))
        .join('');
      expect(errorText).toContain('Security validation error');
      expect(errorText).toContain('Critical validation error');
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should handle non-Error exceptions', async () => {
      const mockHandler = vi.fn();

      vi.mocked(ContentSanitizer.validateInputParameters).mockImplementation(
        () => {
          throw { message: 'Object error' }; // Non-Error object
        }
      );

      const wrappedHandler = withSecurityValidation('test-tool', mockHandler);
      const result = await wrappedHandler(
        { query: 'test' },
        { sessionId: 'test' }
      );

      expect(result).toHaveProperty('content');
      const content = Array.isArray(result.content)
        ? result.content
        : [result.content];
      const errorText = content
        .map(c => (typeof c === 'object' && 'text' in c ? c.text : String(c)))
        .join('');
      expect(errorText).toContain('Security validation error');
      expect(errorText).toContain('Unknown error');
    });

    it('should return error when validation fails', async () => {
      const mockHandler = vi.fn();

      const mockValidation = {
        isValid: false,
        sanitizedParams: {},
        warnings: ['Malicious input detected', 'SQL injection attempt'],
        hasSecrets: false,
      };

      vi.mocked(ContentSanitizer.validateInputParameters).mockReturnValue(
        mockValidation
      );

      const wrappedHandler = withSecurityValidation('test-tool', mockHandler);
      const result = await wrappedHandler(
        { query: "'; DROP TABLE users; --" },
        { sessionId: 'test' }
      );

      expect(result).toHaveProperty('content');
      const content = Array.isArray(result.content)
        ? result.content
        : [result.content];
      const errorText = content
        .map(c => (typeof c === 'object' && 'text' in c ? c.text : String(c)))
        .join('');
      expect(errorText).toContain('Security validation failed');
      expect(errorText).toContain('Malicious input detected');
      expect(errorText).toContain('SQL injection attempt');
      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  describe('withSecurityValidation - Complex Parameter Extraction', () => {
    it('should extract repository from combined format', async () => {
      const mockHandler = vi
        .fn()
        .mockResolvedValue(
          createResult({ data: { success: true }, isError: false })
        );

      const mockValidation = {
        isValid: true,
        sanitizedParams: {
          queries: [
            { repository: 'facebook/react' },
            { repository: 'microsoft/vscode' },
          ],
        },
        warnings: [],
        hasSecrets: false,
      };

      vi.mocked(ContentSanitizer.validateInputParameters).mockReturnValue(
        mockValidation
      );
      vi.mocked(serverConfig.isLoggingEnabled).mockReturnValue(true);
      vi.mocked(session.logToolCall).mockResolvedValue(undefined);

      const wrappedHandler = withSecurityValidation('test-tool', mockHandler);

      await wrappedHandler(
        {
          queries: [{ repository: 'facebook/react' }],
        },
        { sessionId: 'test' }
      );

      expect(session.logToolCall).toHaveBeenCalledWith('test-tool', [
        'facebook/react',
        'microsoft/vscode',
      ]);
    });

    it('should extract owner-only format', async () => {
      const mockHandler = vi
        .fn()
        .mockResolvedValue(
          createResult({ data: { success: true }, isError: false })
        );

      const mockValidation = {
        isValid: true,
        sanitizedParams: {
          queries: [{ owner: 'facebook' }, { owner: 'microsoft' }],
        },
        warnings: [],
        hasSecrets: false,
      };

      vi.mocked(ContentSanitizer.validateInputParameters).mockReturnValue(
        mockValidation
      );
      vi.mocked(serverConfig.isLoggingEnabled).mockReturnValue(true);
      vi.mocked(session.logToolCall).mockResolvedValue(undefined);

      const wrappedHandler = withSecurityValidation(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        mockHandler
      );

      await wrappedHandler(
        { queries: [{ owner: 'facebook' }] },
        { sessionId: 'test' }
      );

      expect(session.logToolCall).toHaveBeenCalledWith(
        TOOL_NAMES.GITHUB_SEARCH_REPOSITORIES,
        ['facebook', 'microsoft']
      );
    });

    it('should extract from non-array parameters', async () => {
      const mockHandler = vi
        .fn()
        .mockResolvedValue(
          createResult({ data: { success: true }, isError: false })
        );

      const mockValidation = {
        isValid: true,
        sanitizedParams: {
          owner: 'vercel',
          repo: 'next.js',
        },
        warnings: [],
        hasSecrets: false,
      };

      vi.mocked(ContentSanitizer.validateInputParameters).mockReturnValue(
        mockValidation
      );
      vi.mocked(serverConfig.isLoggingEnabled).mockReturnValue(true);
      vi.mocked(session.logToolCall).mockResolvedValue(undefined);

      const wrappedHandler = withSecurityValidation('test-tool', mockHandler);

      await wrappedHandler(
        { owner: 'vercel', repo: 'next.js' },
        { sessionId: 'test' }
      );

      expect(session.logToolCall).toHaveBeenCalledWith('test-tool', [
        'vercel/next.js',
      ]);
    });
  });
});
