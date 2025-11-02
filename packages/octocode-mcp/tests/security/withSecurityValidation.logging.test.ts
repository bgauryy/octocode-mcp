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
      ['test-owner/test-repo'],
      undefined,
      undefined,
      undefined
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
      ['direct-owner/direct-repo'],
      undefined,
      undefined,
      undefined
    );
  });

  it('should skip logging when logging is disabled', async () => {
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

    // Verify logToolCall was NOT called since logging is disabled
    expect(mockLogToolCall).not.toHaveBeenCalled();

    // Verify the handler was still called successfully
    expect(mockHandler).toHaveBeenCalled();
  });

  it('should extract and log research fields from queries', async () => {
    const mockHandler = vi.fn(async () => ({
      isError: false,
      content: [{ type: 'text' as const, text: 'success' }],
    }));

    const wrappedHandler = withSecurityValidation('test_tool', mockHandler);

    const args = {
      queries: [
        {
          owner: 'test-owner',
          repo: 'test-repo',
          mainResearchGoal: 'Find authentication',
          researchGoal: 'Locate login function',
          reasoning: 'Need to understand auth flow',
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
      ['test-owner/test-repo'],
      'Find authentication',
      'Locate login function',
      'Need to understand auth flow'
    );
  });

  it('should extract and log partial research fields', async () => {
    const mockHandler = vi.fn(async () => ({
      isError: false,
      content: [{ type: 'text' as const, text: 'success' }],
    }));

    const wrappedHandler = withSecurityValidation('test_tool', mockHandler);

    const args = {
      queries: [
        {
          owner: 'test-owner',
          repo: 'test-repo',
          mainResearchGoal: 'Find authentication',
          reasoning: 'Need to understand auth flow',
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
      ['test-owner/test-repo'],
      'Find authentication',
      undefined,
      'Need to understand auth flow'
    );
  });

  it('should consolidate research fields from multiple queries', async () => {
    const mockHandler = vi.fn(async () => ({
      isError: false,
      content: [{ type: 'text' as const, text: 'success' }],
    }));

    const wrappedHandler = withSecurityValidation('test_tool', mockHandler);

    const args = {
      queries: [
        {
          owner: 'owner1',
          repo: 'repo1',
          mainResearchGoal: 'Authentication',
          researchGoal: 'Find login',
          reasoning: 'Security audit',
        },
        {
          owner: 'owner2',
          repo: 'repo2',
          mainResearchGoal: 'Authentication',
          researchGoal: 'Find logout',
          reasoning: 'Security audit',
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
      ['owner1/repo1', 'owner2/repo2'],
      'Authentication',
      'Find login; Find logout',
      'Security audit'
    );
  });

  it('should log without research fields when none are provided', async () => {
    const mockHandler = vi.fn(async () => ({
      isError: false,
      content: [{ type: 'text' as const, text: 'success' }],
    }));

    const wrappedHandler = withSecurityValidation('test_tool', mockHandler);

    const args = {
      queries: [
        {
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
      ['test-owner/test-repo'],
      undefined,
      undefined,
      undefined
    );
  });
});
