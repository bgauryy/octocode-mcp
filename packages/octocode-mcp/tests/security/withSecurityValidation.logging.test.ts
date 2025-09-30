import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withSecurityValidation } from '../../src/security/withSecurityValidation.js';

// Mock the session logging
const mockLogToolCall = vi.hoisted(() => vi.fn());
vi.mock('../../src/session.js', () => ({
  logToolCall: mockLogToolCall,
}));

// Mock content sanitizer
vi.mock('../../src/security/contentSanitizer.js', () => ({
  ContentSanitizer: {
    validateInputParameters: vi.fn(() => ({
      isValid: true,
      sanitizedParams: {},
      warnings: [],
    })),
    sanitizeContent: vi.fn(content => ({
      content,
      hasSecrets: false,
      secretsDetected: [],
      warnings: [],
    })),
  },
}));

describe('withSecurityValidation logging', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should extract repo and owner from bulk queries and log them', async () => {
    const mockHandler = vi.fn(async () => ({
      isError: false,
      content: [{ type: 'text' as const, text: 'success' }],
    }));

    const wrappedHandler = withSecurityValidation('test_tool', mockHandler);

    const args = {
      queries: [
        {
          id: 'query1',
          owner: 'test-owner',
          repo: 'test-repo',
          keywordsToSearch: ['test'],
        },
      ],
    };

    // Mock the sanitizer to return our test args
    const { ContentSanitizer } = await import(
      '../../src/security/contentSanitizer.js'
    );
    vi.mocked(ContentSanitizer.validateInputParameters).mockReturnValue({
      isValid: true,
      sanitizedParams: args,
      warnings: [],
      hasSecrets: false,
    });

    await wrappedHandler(args, {});

    expect(mockLogToolCall).toHaveBeenCalledWith(
      'test_tool',
      'test-repo',
      'test-owner'
    );
  });

  it('should extract repo and owner from direct params and log them', async () => {
    const mockHandler = vi.fn(async () => ({
      isError: false,
      content: [{ type: 'text' as const, text: 'success' }],
    }));

    const wrappedHandler = withSecurityValidation('test_tool', mockHandler);

    const args = {
      owner: 'direct-owner',
      repo: 'direct-repo',
      path: 'test/file.js',
    };

    // Mock the sanitizer to return our test args
    const { ContentSanitizer } = await import(
      '../../src/security/contentSanitizer.js'
    );
    vi.mocked(ContentSanitizer.validateInputParameters).mockReturnValue({
      isValid: true,
      sanitizedParams: args,
      warnings: [],
      hasSecrets: false,
    });

    await wrappedHandler(args, {});

    expect(mockLogToolCall).toHaveBeenCalledWith(
      'test_tool',
      'direct-repo',
      'direct-owner'
    );
  });

  it('should log tool call without repo/owner when not present', async () => {
    const mockHandler = vi.fn(async () => ({
      isError: false,
      content: [{ type: 'text' as const, text: 'success' }],
    }));

    const wrappedHandler = withSecurityValidation('test_tool', mockHandler);

    const args = {
      someOtherParam: 'value',
    };

    // Mock the sanitizer to return our test args
    const { ContentSanitizer } = await import(
      '../../src/security/contentSanitizer.js'
    );
    vi.mocked(ContentSanitizer.validateInputParameters).mockReturnValue({
      isValid: true,
      sanitizedParams: args,
      warnings: [],
      hasSecrets: false,
    });

    await wrappedHandler(args, {});

    expect(mockLogToolCall).toHaveBeenCalledWith(
      'test_tool',
      undefined,
      undefined
    );
  });

  it('should handle empty queries array gracefully', async () => {
    const mockHandler = vi.fn(async () => ({
      isError: false,
      content: [{ type: 'text' as const, text: 'success' }],
    }));

    const wrappedHandler = withSecurityValidation('test_tool', mockHandler);

    const args = {
      queries: [],
    };

    // Mock the sanitizer to return our test args
    const { ContentSanitizer } = await import(
      '../../src/security/contentSanitizer.js'
    );
    vi.mocked(ContentSanitizer.validateInputParameters).mockReturnValue({
      isValid: true,
      sanitizedParams: args,
      warnings: [],
      hasSecrets: false,
    });

    await wrappedHandler(args, {});

    expect(mockLogToolCall).toHaveBeenCalledWith(
      'test_tool',
      undefined,
      undefined
    );
  });
});
