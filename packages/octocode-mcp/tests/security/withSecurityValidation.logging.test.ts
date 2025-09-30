import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withSecurityValidation } from '../../src/security/withSecurityValidation.js';

// Mock the session logging
const mockLogToolCall = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock('../../src/session.js', () => ({
  logToolCall: mockLogToolCall,
}));

// Mock serverConfig to enable logging
const mockIsLoggingEnabled = vi.hoisted(() => vi.fn(() => true));
vi.mock('../../src/serverConfig.js', () => ({
  isLoggingEnabled: mockIsLoggingEnabled,
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
    // Reset mock to return resolved promise
    mockLogToolCall.mockResolvedValue(undefined);
    // Ensure logging is enabled for all tests
    mockIsLoggingEnabled.mockReturnValue(true);
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

  it('should sanitize repo and owner before logging', async () => {
    const mockHandler = vi.fn(async () => ({
      isError: false,
      content: [{ type: 'text' as const, text: 'success' }],
    }));

    const wrappedHandler = withSecurityValidation('test_tool', mockHandler);

    const args = {
      owner: 'test-owner',
      repo: 'test-repo',
    };

    // Mock the sanitizer
    const { ContentSanitizer } = await import(
      '../../src/security/contentSanitizer.js'
    );
    vi.mocked(ContentSanitizer.validateInputParameters).mockReturnValue({
      isValid: true,
      sanitizedParams: args,
      warnings: [],
      hasSecrets: false,
    });

    // Mock sanitizeContent to return sanitized values
    vi.mocked(ContentSanitizer.sanitizeContent).mockImplementation(content => ({
      content: `sanitized-${content}`,
      hasSecrets: false,
      secretsDetected: [],
      warnings: [],
    }));

    await wrappedHandler(args, {});

    // Verify sanitizeContent was called for both repo and owner
    expect(ContentSanitizer.sanitizeContent).toHaveBeenCalledWith('test-repo');
    expect(ContentSanitizer.sanitizeContent).toHaveBeenCalledWith('test-owner');

    // Verify logToolCall received sanitized values
    expect(mockLogToolCall).toHaveBeenCalledWith(
      'test_tool',
      'sanitized-test-repo',
      'sanitized-test-owner'
    );
  });

  it('should redact secrets from repo before logging', async () => {
    const mockHandler = vi.fn(async () => ({
      isError: false,
      content: [{ type: 'text' as const, text: 'success' }],
    }));

    const wrappedHandler = withSecurityValidation('test_tool', mockHandler);

    const args = {
      owner: 'safe-owner',
      repo: 'repo?token=ghp_secret123',
    };

    // Mock the sanitizer
    const { ContentSanitizer } = await import(
      '../../src/security/contentSanitizer.js'
    );
    vi.mocked(ContentSanitizer.validateInputParameters).mockReturnValue({
      isValid: true,
      sanitizedParams: args,
      warnings: [],
      hasSecrets: false,
    });

    // Mock sanitizeContent to redact the token
    vi.mocked(ContentSanitizer.sanitizeContent).mockImplementation(content => {
      if (content.includes('ghp_secret123')) {
        return {
          content: 'repo?token=[REDACTED-GITHUB-TOKEN]',
          hasSecrets: true,
          secretsDetected: ['github-token'],
          warnings: ['github-token'],
        };
      }
      return {
        content,
        hasSecrets: false,
        secretsDetected: [],
        warnings: [],
      };
    });

    await wrappedHandler(args, {});

    // Verify the token was redacted in the logged value
    expect(mockLogToolCall).toHaveBeenCalledWith(
      'test_tool',
      'repo?token=[REDACTED-GITHUB-TOKEN]',
      'safe-owner'
    );
  });

  it('should redact secrets from owner before logging', async () => {
    const mockHandler = vi.fn(async () => ({
      isError: false,
      content: [{ type: 'text' as const, text: 'success' }],
    }));

    const wrappedHandler = withSecurityValidation('test_tool', mockHandler);

    const args = {
      owner: 'owner-with-api-key-sk_live_12345',
      repo: 'safe-repo',
    };

    // Mock the sanitizer
    const { ContentSanitizer } = await import(
      '../../src/security/contentSanitizer.js'
    );
    vi.mocked(ContentSanitizer.validateInputParameters).mockReturnValue({
      isValid: true,
      sanitizedParams: args,
      warnings: [],
      hasSecrets: false,
    });

    // Mock sanitizeContent to redact the API key
    vi.mocked(ContentSanitizer.sanitizeContent).mockImplementation(content => {
      if (content.includes('sk_live_12345')) {
        return {
          content: 'owner-with-api-key-[REDACTED-API-KEY]',
          hasSecrets: true,
          secretsDetected: ['api-key'],
          warnings: ['api-key'],
        };
      }
      return {
        content,
        hasSecrets: false,
        secretsDetected: [],
        warnings: [],
      };
    });

    await wrappedHandler(args, {});

    // Verify the API key was redacted in the logged value
    expect(mockLogToolCall).toHaveBeenCalledWith(
      'test_tool',
      'safe-repo',
      'owner-with-api-key-[REDACTED-API-KEY]'
    );
  });

  it('should sanitize repo and owner from bulk queries before logging', async () => {
    const mockHandler = vi.fn(async () => ({
      isError: false,
      content: [{ type: 'text' as const, text: 'success' }],
    }));

    const wrappedHandler = withSecurityValidation('test_tool', mockHandler);

    const args = {
      queries: [
        {
          id: 'query1',
          owner: 'bulk-owner',
          repo: 'bulk-repo?secret=abc123',
          keywordsToSearch: ['test'],
        },
      ],
    };

    // Mock the sanitizer
    const { ContentSanitizer } = await import(
      '../../src/security/contentSanitizer.js'
    );
    vi.mocked(ContentSanitizer.validateInputParameters).mockReturnValue({
      isValid: true,
      sanitizedParams: args,
      warnings: [],
      hasSecrets: false,
    });

    // Mock sanitizeContent
    vi.mocked(ContentSanitizer.sanitizeContent).mockImplementation(content => {
      if (content.includes('secret=abc123')) {
        return {
          content: 'bulk-repo?secret=[REDACTED-SECRET]',
          hasSecrets: true,
          secretsDetected: ['secret'],
          warnings: ['secret'],
        };
      }
      return {
        content: `sanitized-${content}`,
        hasSecrets: false,
        secretsDetected: [],
        warnings: [],
      };
    });

    await wrappedHandler(args, {});

    // Verify sanitization was called
    expect(ContentSanitizer.sanitizeContent).toHaveBeenCalledWith(
      'bulk-repo?secret=abc123'
    );
    expect(ContentSanitizer.sanitizeContent).toHaveBeenCalledWith('bulk-owner');

    // Verify logToolCall received sanitized values from bulk query
    expect(mockLogToolCall).toHaveBeenCalledWith(
      'test_tool',
      'bulk-repo?secret=[REDACTED-SECRET]',
      'sanitized-bulk-owner'
    );
  });

  it('should handle undefined repo and owner gracefully', async () => {
    const mockHandler = vi.fn(async () => ({
      isError: false,
      content: [{ type: 'text' as const, text: 'success' }],
    }));

    const wrappedHandler = withSecurityValidation('test_tool', mockHandler);

    const args = {
      someParam: 'value',
    };

    // Mock the sanitizer
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

    // Verify sanitizeContent was NOT called since repo/owner are undefined
    expect(ContentSanitizer.sanitizeContent).not.toHaveBeenCalled();

    // Verify logToolCall received undefined values
    expect(mockLogToolCall).toHaveBeenCalledWith(
      'test_tool',
      undefined,
      undefined
    );
  });

  it('should skip sanitization and logging when logging is disabled', async () => {
    // Disable logging for this test
    mockIsLoggingEnabled.mockReturnValue(false);

    const mockHandler = vi.fn(async () => ({
      isError: false,
      content: [{ type: 'text' as const, text: 'success' }],
    }));

    const wrappedHandler = withSecurityValidation('test_tool', mockHandler);

    const args = {
      owner: 'test-owner',
      repo: 'test-repo',
    };

    // Mock the sanitizer
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

    // Verify isLoggingEnabled was called
    expect(mockIsLoggingEnabled).toHaveBeenCalled();

    // Verify sanitizeContent was NOT called since logging is disabled
    expect(ContentSanitizer.sanitizeContent).not.toHaveBeenCalled();

    // Verify logToolCall was NOT called since logging is disabled
    expect(mockLogToolCall).not.toHaveBeenCalled();

    // Verify the handler was still called successfully
    expect(mockHandler).toHaveBeenCalled();
  });
});
