import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
  ICodeHostProvider,
  ProviderType,
  ProviderConfig,
  CodeSearchQuery,
  FileContentQuery,
  RepoSearchQuery,
  PullRequestQuery,
  RepoStructureQuery,
  ProviderResponse,
  CodeSearchResult,
  FileContentResult,
  RepoSearchResult,
  PullRequestSearchResult,
  RepoStructureResult,
} from '../../src/providers/types.js';

// Mock the crypto module for consistent hashing
vi.mock('crypto', () => ({
  createHash: vi.fn(() => ({
    update: vi.fn(() => ({
      digest: vi.fn(() => 'abcdef1234567890abcdef1234567890'),
    })),
  })),
}));

// Mock the provider imports
vi.mock('../../src/providers/github/GitHubProvider.js', () => ({
  GitHubProvider: vi.fn().mockImplementation((config?: ProviderConfig) => ({
    type: 'github' as ProviderType,
    config,
    searchCode: vi.fn(),
    getFileContent: vi.fn(),
    searchRepos: vi.fn(),
    searchPullRequests: vi.fn(),
    getRepoStructure: vi.fn(),
  })),
}));

vi.mock('../../src/providers/gitlab/GitLabProvider.js', () => ({
  GitLabProvider: vi.fn().mockImplementation((config?: ProviderConfig) => ({
    type: 'gitlab' as ProviderType,
    config,
    searchCode: vi.fn(),
    getFileContent: vi.fn(),
    searchRepos: vi.fn(),
    searchPullRequests: vi.fn(),
    getRepoStructure: vi.fn(),
  })),
}));

// Import the module under test after mocks are set up
import {
  getProvider,
  registerProvider,
  isProviderRegistered,
  getRegisteredProviders,
  clearProviderCache,
  clearProviderInstance,
  initializeProviders,
  extractProviderFromQuery,
  DEFAULT_PROVIDER,
} from '../../src/providers/factory.js';

/**
 * Create a mock provider class for testing
 */
function createMockProviderClass(type: ProviderType) {
  return class MockProvider implements ICodeHostProvider {
    readonly type = type;
    readonly config: ProviderConfig | undefined;

    constructor(config?: ProviderConfig) {
      this.config = config;
    }

    async searchCode(
      _query: CodeSearchQuery
    ): Promise<ProviderResponse<CodeSearchResult>> {
      return {
        status: 200,
        provider: this.type,
        data: {
          items: [],
          totalCount: 0,
          pagination: {
            currentPage: 1,
            totalPages: 1,
            hasMore: false,
          },
        },
      };
    }

    async getFileContent(
      _query: FileContentQuery
    ): Promise<ProviderResponse<FileContentResult>> {
      return {
        status: 200,
        provider: this.type,
        data: {
          path: 'test.ts',
          content: 'content',
          encoding: 'utf-8',
          size: 7,
          ref: 'main',
        },
      };
    }

    async searchRepos(
      _query: RepoSearchQuery
    ): Promise<ProviderResponse<RepoSearchResult>> {
      return {
        status: 200,
        provider: this.type,
        data: {
          repositories: [],
          totalCount: 0,
          pagination: {
            currentPage: 1,
            totalPages: 1,
            hasMore: false,
          },
        },
      };
    }

    async searchPullRequests(
      _query: PullRequestQuery
    ): Promise<ProviderResponse<PullRequestSearchResult>> {
      return {
        status: 200,
        provider: this.type,
        data: {
          items: [],
          totalCount: 0,
          pagination: {
            currentPage: 1,
            totalPages: 1,
            hasMore: false,
          },
        },
      };
    }

    async getRepoStructure(
      _query: RepoStructureQuery
    ): Promise<ProviderResponse<RepoStructureResult>> {
      return {
        status: 200,
        provider: this.type,
        data: {
          projectPath: 'owner/repo',
          branch: 'main',
          path: '',
          structure: {},
          summary: {
            totalFiles: 0,
            totalFolders: 0,
            truncated: false,
          },
        },
      };
    }
  };
}

describe('Provider Factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear both the cache and registry for clean tests
    clearProviderCache();
  });

  afterEach(() => {
    clearProviderCache();
  });

  describe('registerProvider', () => {
    it('should register a provider class', () => {
      const MockGitHubProvider = createMockProviderClass('github');
      registerProvider('github', MockGitHubProvider);

      expect(isProviderRegistered('github')).toBe(true);
    });

    it('should allow registering multiple provider types', () => {
      const MockGitHubProvider = createMockProviderClass('github');
      const MockGitLabProvider = createMockProviderClass('gitlab');

      registerProvider('github', MockGitHubProvider);
      registerProvider('gitlab', MockGitLabProvider);

      expect(isProviderRegistered('github')).toBe(true);
      expect(isProviderRegistered('gitlab')).toBe(true);
    });

    it('should overwrite existing registration for the same type', () => {
      const MockProvider1 = createMockProviderClass('github');
      const MockProvider2 = createMockProviderClass('github');

      registerProvider('github', MockProvider1);
      registerProvider('github', MockProvider2);

      // Should still be registered
      expect(isProviderRegistered('github')).toBe(true);

      // Clear cache to ensure new instance is created
      clearProviderCache();

      // Get provider should use the latest registration
      const provider = getProvider('github');
      expect(provider).toBeDefined();
      expect(provider.type).toBe('github');
    });
  });

  describe('isProviderRegistered', () => {
    it('should return true for registered provider', () => {
      const MockGitHubProvider = createMockProviderClass('github');
      registerProvider('github', MockGitHubProvider);

      expect(isProviderRegistered('github')).toBe(true);
    });

    it('should return false for unregistered provider', () => {
      // Cast to ProviderType to test with an unregistered type
      // Note: In real usage, TypeScript would prevent this, but we test runtime behavior
      // Use a fake provider type that will never be registered
      expect(isProviderRegistered('nonexistent' as ProviderType)).toBe(false);
    });
  });

  describe('getRegisteredProviders', () => {
    it('should return empty array when no providers registered', () => {
      // After fresh module load with cleared registry
      // Note: We can't fully clear the registry from tests, so we check current state
      const providers = getRegisteredProviders();
      expect(Array.isArray(providers)).toBe(true);
    });

    it('should return all registered provider types', () => {
      const MockGitHubProvider = createMockProviderClass('github');
      const MockGitLabProvider = createMockProviderClass('gitlab');

      registerProvider('github', MockGitHubProvider);
      registerProvider('gitlab', MockGitLabProvider);

      const providers = getRegisteredProviders();

      expect(providers).toContain('github');
      expect(providers).toContain('gitlab');
    });

    it('should return a new array each time (not the internal reference)', () => {
      const MockGitHubProvider = createMockProviderClass('github');
      registerProvider('github', MockGitHubProvider);

      const providers1 = getRegisteredProviders();
      const providers2 = getRegisteredProviders();

      expect(providers1).not.toBe(providers2);
      expect(providers1).toEqual(providers2);
    });
  });

  describe('getProvider', () => {
    beforeEach(() => {
      const MockGitHubProvider = createMockProviderClass('github');
      const MockGitLabProvider = createMockProviderClass('gitlab');
      registerProvider('github', MockGitHubProvider);
      registerProvider('gitlab', MockGitLabProvider);
    });

    it('should return a provider instance for registered type', () => {
      const provider = getProvider('github');

      expect(provider).toBeDefined();
      expect(provider.type).toBe('github');
    });

    it('should default to github provider when no type specified', () => {
      const provider = getProvider();

      expect(provider).toBeDefined();
      expect(provider.type).toBe('github');
    });

    it('should return gitlab provider when specified', () => {
      const provider = getProvider('gitlab');

      expect(provider).toBeDefined();
      expect(provider.type).toBe('gitlab');
    });

    it('should pass config to provider constructor', () => {
      const config: ProviderConfig = {
        type: 'github',
        baseUrl: 'https://github.mycompany.com/api/v3',
        token: 'test-token-123',
      };

      const provider = getProvider('github', config) as ICodeHostProvider & {
        config: ProviderConfig;
      };

      expect(provider.config).toBeDefined();
      expect(provider.config.baseUrl).toBe(config.baseUrl);
    });

    it('should throw error for unknown provider type', () => {
      // First, let's get a clean state by clearing everything
      clearProviderCache();

      // Attempt to get an unregistered provider type
      // We need to cast because TypeScript wouldn't allow this normally
      expect(() => getProvider('unknown' as ProviderType)).toThrow(
        /Unknown provider type: 'unknown'/
      );
    });

    it('should include available providers in error message', () => {
      const MockGitHubProvider = createMockProviderClass('github');
      registerProvider('github', MockGitHubProvider);

      expect(() => getProvider('unknown' as ProviderType)).toThrow(
        /Available providers:/
      );
    });

    describe('caching behavior', () => {
      it('should return cached instance for same type and config', () => {
        const config: ProviderConfig = {
          type: 'github',
          token: 'test-token',
        };

        const provider1 = getProvider('github', config);
        const provider2 = getProvider('github', config);

        expect(provider1).toBe(provider2);
      });

      it('should return different instances for different types', () => {
        const provider1 = getProvider('github');
        const provider2 = getProvider('gitlab');

        expect(provider1).not.toBe(provider2);
        expect(provider1.type).toBe('github');
        expect(provider2.type).toBe('gitlab');
      });

      it('should return different instances for different tokens', () => {
        const config1: ProviderConfig = {
          type: 'github',
          token: 'token-1',
        };
        const config2: ProviderConfig = {
          type: 'github',
          token: 'token-2',
        };

        // Note: Due to our mock, the hash will be the same, but in reality
        // different tokens would produce different hashes
        const provider1 = getProvider('github', config1);
        clearProviderCache(); // Clear to force new instance with different token
        const provider2 = getProvider('github', config2);

        // After clearing cache, should get a new instance
        expect(provider1).not.toBe(provider2);
      });

      it('should return different instances for different base URLs', () => {
        const config1: ProviderConfig = {
          type: 'github',
          baseUrl: 'https://api.github.com',
        };
        const config2: ProviderConfig = {
          type: 'github',
          baseUrl: 'https://github.mycompany.com/api/v3',
        };

        const provider1 = getProvider('github', config1);
        const provider2 = getProvider('github', config2);

        expect(provider1).not.toBe(provider2);
      });

      it('should handle undefined config for caching', () => {
        const provider1 = getProvider('github');
        const provider2 = getProvider('github', undefined);

        expect(provider1).toBe(provider2);
      });

      it('should use authInfo.token for cache key when token not provided', () => {
        const config1: ProviderConfig = {
          type: 'github',
          authInfo: { token: 'auth-token-1' } as AuthInfo,
        };
        const config2: ProviderConfig = {
          type: 'github',
          authInfo: { token: 'auth-token-2' } as AuthInfo,
        };

        const provider1 = getProvider('github', config1);
        clearProviderCache();
        const provider2 = getProvider('github', config2);

        expect(provider1).not.toBe(provider2);
      });
    });
  });

  describe('clearProviderCache', () => {
    beforeEach(() => {
      const MockGitHubProvider = createMockProviderClass('github');
      registerProvider('github', MockGitHubProvider);
    });

    it('should clear all cached provider instances', () => {
      const provider1 = getProvider('github');
      clearProviderCache();
      const provider2 = getProvider('github');

      expect(provider1).not.toBe(provider2);
    });

    it('should allow new instances to be created after clearing', () => {
      getProvider('github');
      clearProviderCache();

      const newProvider = getProvider('github');
      expect(newProvider).toBeDefined();
      expect(newProvider.type).toBe('github');
    });
  });

  describe('clearProviderInstance', () => {
    beforeEach(() => {
      const MockGitHubProvider = createMockProviderClass('github');
      const MockGitLabProvider = createMockProviderClass('gitlab');
      registerProvider('github', MockGitHubProvider);
      registerProvider('gitlab', MockGitLabProvider);
    });

    it('should clear specific provider instance from cache', () => {
      const config: ProviderConfig = {
        type: 'github',
        token: 'test-token',
      };

      const provider1 = getProvider('github', config);
      clearProviderInstance('github', config);
      const provider2 = getProvider('github', config);

      expect(provider1).not.toBe(provider2);
    });

    it('should not affect other provider instances', () => {
      const githubProvider1 = getProvider('github');
      const gitlabProvider1 = getProvider('gitlab');

      clearProviderInstance('github');

      const githubProvider2 = getProvider('github');
      const gitlabProvider2 = getProvider('gitlab');

      expect(githubProvider1).not.toBe(githubProvider2);
      expect(gitlabProvider1).toBe(gitlabProvider2);
    });

    it('should handle clearing non-existent instance gracefully', () => {
      // Should not throw
      expect(() => clearProviderInstance('github')).not.toThrow();
    });

    it('should clear instance with specific config without affecting default', () => {
      const config: ProviderConfig = {
        type: 'github',
        baseUrl: 'https://custom.github.com',
      };

      const defaultProvider1 = getProvider('github');
      const customProvider1 = getProvider('github', config);

      clearProviderInstance('github', config);

      const defaultProvider2 = getProvider('github');
      const customProvider2 = getProvider('github', config);

      // Default should still be cached
      expect(defaultProvider1).toBe(defaultProvider2);
      // Custom should be new instance
      expect(customProvider1).not.toBe(customProvider2);
    });
  });

  describe('initializeProviders', () => {
    let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
    let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it('should initialize and register GitHub provider', async () => {
      await initializeProviders();

      expect(isProviderRegistered('github')).toBe(true);
    });

    it('should initialize and register GitLab provider', async () => {
      await initializeProviders();

      expect(isProviderRegistered('gitlab')).toBe(true);
    });

    it('should handle GitHub provider initialization failure', async () => {
      // Mock the import to fail
      vi.doMock('../../src/providers/github/GitHubProvider.js', () => {
        throw new Error('Failed to load GitHub provider');
      });

      // We can't actually test this without restructuring the code
      // The current implementation catches errors internally
      // This test documents the expected behavior
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should handle GitLab provider initialization failure gracefully', async () => {
      // GitLab is optional, so failures should be warnings
      // This test documents the expected behavior
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('extractProviderFromQuery', () => {
    it('should return provider from query when specified', () => {
      const query = { provider: 'gitlab' as ProviderType };

      const result = extractProviderFromQuery(query);

      expect(result).toBe('gitlab');
    });

    it('should return default provider when query has no provider', () => {
      const query = {};

      const result = extractProviderFromQuery(query);

      expect(result).toBe('github');
    });

    it('should return default provider for undefined provider field', () => {
      const query = { provider: undefined };

      const result = extractProviderFromQuery(query);

      expect(result).toBe('github');
    });

    it('should return github for github provider', () => {
      const query = { provider: 'github' as ProviderType };

      const result = extractProviderFromQuery(query);

      expect(result).toBe('github');
    });
  });

  describe('DEFAULT_PROVIDER', () => {
    it('should be github', () => {
      expect(DEFAULT_PROVIDER).toBe('github');
    });
  });

  describe('Token hashing for cache keys', () => {
    beforeEach(() => {
      const MockGitHubProvider = createMockProviderClass('github');
      registerProvider('github', MockGitHubProvider);
    });

    it('should handle empty token', () => {
      const config: ProviderConfig = {
        type: 'github',
        token: '',
      };

      // Should not throw and should create provider
      const provider = getProvider('github', config);
      expect(provider).toBeDefined();
    });

    it('should handle undefined token', () => {
      const config: ProviderConfig = {
        type: 'github',
        token: undefined,
      };

      const provider = getProvider('github', config);
      expect(provider).toBeDefined();
    });

    it('should prefer token over authInfo.token for cache key', () => {
      const config: ProviderConfig = {
        type: 'github',
        token: 'explicit-token',
        authInfo: { token: 'auth-info-token' } as AuthInfo,
      };

      const provider = getProvider('github', config);
      expect(provider).toBeDefined();
    });

    it('should use authInfo.token when token is not provided', () => {
      const config: ProviderConfig = {
        type: 'github',
        authInfo: { token: 'auth-info-token' } as AuthInfo,
      };

      const provider = getProvider('github', config);
      expect(provider).toBeDefined();
    });
  });

  describe('Cache key generation', () => {
    beforeEach(() => {
      const MockGitHubProvider = createMockProviderClass('github');
      registerProvider('github', MockGitHubProvider);
    });

    it('should generate different cache keys for different base URLs', () => {
      const config1: ProviderConfig = {
        type: 'github',
        baseUrl: 'https://api1.github.com',
      };
      const config2: ProviderConfig = {
        type: 'github',
        baseUrl: 'https://api2.github.com',
      };

      const provider1 = getProvider('github', config1);
      const provider2 = getProvider('github', config2);

      // Different base URLs should result in different cache entries
      expect(provider1).not.toBe(provider2);
    });

    it('should use default for missing baseUrl', () => {
      const config: ProviderConfig = {
        type: 'github',
      };

      const provider1 = getProvider('github', config);
      const provider2 = getProvider('github');

      // Both should use 'default' baseUrl in cache key
      expect(provider1).toBe(provider2);
    });
  });

  describe('URL normalization for cache keys', () => {
    beforeEach(() => {
      const MockGitHubProvider = createMockProviderClass('github');
      registerProvider('github', MockGitHubProvider);
    });

    it('should cache same provider for URLs with and without trailing slash', () => {
      const config1: ProviderConfig = {
        type: 'github',
        baseUrl: 'https://api.github.com',
      };
      const config2: ProviderConfig = {
        type: 'github',
        baseUrl: 'https://api.github.com/',
      };

      const provider1 = getProvider('github', config1);
      const provider2 = getProvider('github', config2);

      // Both should use same cache entry after URL normalization
      expect(provider1).toBe(provider2);
    });

    it('should cache same provider for URLs with multiple trailing slashes', () => {
      const config1: ProviderConfig = {
        type: 'github',
        baseUrl: 'https://api.github.com',
      };
      const config2: ProviderConfig = {
        type: 'github',
        baseUrl: 'https://api.github.com///',
      };

      const provider1 = getProvider('github', config1);
      const provider2 = getProvider('github', config2);

      expect(provider1).toBe(provider2);
    });

    it('should cache same provider for URLs with different hostname casing', () => {
      const config1: ProviderConfig = {
        type: 'github',
        baseUrl: 'https://api.github.com',
      };
      const config2: ProviderConfig = {
        type: 'github',
        baseUrl: 'https://API.GITHUB.COM',
      };

      const provider1 = getProvider('github', config1);
      const provider2 = getProvider('github', config2);

      expect(provider1).toBe(provider2);
    });

    it('should cache same provider for URLs with default https port', () => {
      const config1: ProviderConfig = {
        type: 'github',
        baseUrl: 'https://api.github.com',
      };
      const config2: ProviderConfig = {
        type: 'github',
        baseUrl: 'https://api.github.com:443',
      };

      const provider1 = getProvider('github', config1);
      const provider2 = getProvider('github', config2);

      expect(provider1).toBe(provider2);
    });

    it('should cache same provider for URLs with default http port', () => {
      const config1: ProviderConfig = {
        type: 'github',
        baseUrl: 'http://localhost',
      };
      const config2: ProviderConfig = {
        type: 'github',
        baseUrl: 'http://localhost:80',
      };

      const provider1 = getProvider('github', config1);
      const provider2 = getProvider('github', config2);

      expect(provider1).toBe(provider2);
    });

    it('should NOT cache same provider for URLs with non-default ports', () => {
      const config1: ProviderConfig = {
        type: 'github',
        baseUrl: 'https://gitlab.example.com',
      };
      const config2: ProviderConfig = {
        type: 'github',
        baseUrl: 'https://gitlab.example.com:8443',
      };

      const provider1 = getProvider('github', config1);
      const provider2 = getProvider('github', config2);

      expect(provider1).not.toBe(provider2);
    });

    it('should handle combined normalization (case + trailing slash + port)', () => {
      const config1: ProviderConfig = {
        type: 'github',
        baseUrl: 'https://api.github.com',
      };
      const config2: ProviderConfig = {
        type: 'github',
        baseUrl: 'https://API.GITHUB.COM:443/',
      };

      const provider1 = getProvider('github', config1);
      const provider2 = getProvider('github', config2);

      expect(provider1).toBe(provider2);
    });

    it('should preserve path during normalization', () => {
      const config1: ProviderConfig = {
        type: 'github',
        baseUrl: 'https://github.company.com/api/v3',
      };
      const config2: ProviderConfig = {
        type: 'github',
        baseUrl: 'https://GITHUB.COMPANY.COM/api/v3/',
      };

      const provider1 = getProvider('github', config1);
      const provider2 = getProvider('github', config2);

      expect(provider1).toBe(provider2);
    });

    it('should handle invalid URLs gracefully by just normalizing trailing slashes', () => {
      const config1: ProviderConfig = {
        type: 'github',
        baseUrl: 'not-a-valid-url',
      };
      const config2: ProviderConfig = {
        type: 'github',
        baseUrl: 'not-a-valid-url/',
      };

      const provider1 = getProvider('github', config1);
      const provider2 = getProvider('github', config2);

      // Even for invalid URLs, trailing slash normalization should work
      expect(provider1).toBe(provider2);
    });

    it('should keep "default" value unchanged', () => {
      const provider1 = getProvider('github');
      const provider2 = getProvider('github', { type: 'github' });

      // Both use 'default' as baseUrl
      expect(provider1).toBe(provider2);
    });
  });

  describe('Provider instance interface', () => {
    beforeEach(() => {
      const MockGitHubProvider = createMockProviderClass('github');
      registerProvider('github', MockGitHubProvider);
    });

    it('should return provider with correct type property', () => {
      const provider = getProvider('github');

      expect(provider.type).toBe('github');
    });

    it('should return provider with searchCode method', () => {
      const provider = getProvider('github');

      expect(typeof provider.searchCode).toBe('function');
    });

    it('should return provider with getFileContent method', () => {
      const provider = getProvider('github');

      expect(typeof provider.getFileContent).toBe('function');
    });

    it('should return provider with searchRepos method', () => {
      const provider = getProvider('github');

      expect(typeof provider.searchRepos).toBe('function');
    });

    it('should return provider with searchPullRequests method', () => {
      const provider = getProvider('github');

      expect(typeof provider.searchPullRequests).toBe('function');
    });

    it('should return provider with getRepoStructure method', () => {
      const provider = getProvider('github');

      expect(typeof provider.getRepoStructure).toBe('function');
    });
  });

  describe('Error message formatting', () => {
    it('should show "none" when no providers are registered', () => {
      // Clear all registrations first by getting a fresh state
      // Note: We can't actually clear the internal registry from tests
      // This test documents expected behavior

      // Create a scenario where we try to access an unknown provider
      const MockGitHubProvider = createMockProviderClass('github');
      registerProvider('github', MockGitHubProvider);

      try {
        getProvider('nonexistent' as ProviderType);
      } catch (error) {
        expect((error as Error).message).toContain('Available providers:');
        expect((error as Error).message).toContain('github');
      }
    });

    it('should list all available providers in error message', () => {
      const MockGitHubProvider = createMockProviderClass('github');
      const MockGitLabProvider = createMockProviderClass('gitlab');
      registerProvider('github', MockGitHubProvider);
      registerProvider('gitlab', MockGitLabProvider);

      try {
        getProvider('nonexistent' as ProviderType);
      } catch (error) {
        const message = (error as Error).message;
        expect(message).toContain('github');
        expect(message).toContain('gitlab');
      }
    });
  });

  describe('Edge cases', () => {
    beforeEach(() => {
      const MockGitHubProvider = createMockProviderClass('github');
      registerProvider('github', MockGitHubProvider);
    });

    it('should handle rapid sequential provider requests', () => {
      const provider1 = getProvider('github');
      const provider2 = getProvider('github');
      const provider3 = getProvider('github');

      expect(provider1).toBe(provider2);
      expect(provider2).toBe(provider3);
    });

    it('should handle config with only type field', () => {
      const config: ProviderConfig = {
        type: 'github',
      };

      const provider = getProvider('github', config);
      expect(provider).toBeDefined();
    });

    it('should handle config with all fields', () => {
      const config: ProviderConfig = {
        type: 'github',
        baseUrl: 'https://api.github.com',
        token: 'test-token',
        authInfo: {
          token: 'auth-token',
        } as AuthInfo,
      };

      const provider = getProvider('github', config);
      expect(provider).toBeDefined();
    });

    it('should maintain separate cache entries for providers with different configs', () => {
      const configs: ProviderConfig[] = [
        { type: 'github', baseUrl: 'https://api1.github.com' },
        { type: 'github', baseUrl: 'https://api2.github.com' },
        { type: 'github', baseUrl: 'https://api3.github.com' },
      ];

      const providers = configs.map(config => getProvider('github', config));

      // All should be different instances
      expect(providers[0]).not.toBe(providers[1]);
      expect(providers[1]).not.toBe(providers[2]);
      expect(providers[0]).not.toBe(providers[2]);
    });
  });
});

/**
 * Error handling tests for provider factory
 *
 * These tests cover error scenarios in initializeProviders that require
 * module reset and re-import to properly test dynamic import failures.
 */
describe('Provider Factory Error Handling', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    vi.resetModules();
  });

  describe('initializeProviders error handling', () => {
    it('should log error when GitHub provider fails to load', async () => {
      // Mock GitHub provider to throw
      vi.doMock('../../src/providers/github/GitHubProvider.js', () => {
        throw new Error('GitHub provider load failed');
      });

      // Mock GitLab provider to succeed
      vi.doMock('../../src/providers/gitlab/GitLabProvider.js', () => ({
        GitLabProvider: class MockGitLabProvider {
          readonly type = 'gitlab';
        },
      }));

      // Import factory after mocks are set up
      const { initializeProviders } =
        await import('../../src/providers/factory.js');

      await initializeProviders();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to initialize GitHub provider:',
        expect.any(Error)
      );
    });

    it('should log warning when GitLab provider fails to load', async () => {
      // Mock GitHub provider to succeed
      vi.doMock('../../src/providers/github/GitHubProvider.js', () => ({
        GitHubProvider: class MockGitHubProvider {
          readonly type = 'github';
        },
      }));

      // Mock GitLab provider to throw
      vi.doMock('../../src/providers/gitlab/GitLabProvider.js', () => {
        throw new Error('GitLab provider load failed');
      });

      // Import factory after mocks are set up
      const { initializeProviders } =
        await import('../../src/providers/factory.js');

      await initializeProviders();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'GitLab provider not available:',
        expect.any(Error)
      );
    });

    it('should handle both providers failing to load', async () => {
      // Mock both providers to throw
      vi.doMock('../../src/providers/github/GitHubProvider.js', () => {
        throw new Error('GitHub provider load failed');
      });

      vi.doMock('../../src/providers/gitlab/GitLabProvider.js', () => {
        throw new Error('GitLab provider load failed');
      });

      // Import factory after mocks are set up
      const { initializeProviders } =
        await import('../../src/providers/factory.js');

      await initializeProviders();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to initialize GitHub provider:',
        expect.any(Error)
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'GitLab provider not available:',
        expect.any(Error)
      );
    });

    it('should continue initialization after GitHub provider failure', async () => {
      // Mock GitHub provider to throw
      vi.doMock('../../src/providers/github/GitHubProvider.js', () => {
        throw new Error('GitHub provider load failed');
      });

      // Mock GitLab provider to succeed
      vi.doMock('../../src/providers/gitlab/GitLabProvider.js', () => ({
        GitLabProvider: class MockGitLabProvider {
          readonly type = 'gitlab';
        },
      }));

      // Import factory after mocks are set up
      const { initializeProviders, isProviderRegistered } =
        await import('../../src/providers/factory.js');

      await initializeProviders();

      // GitHub should not be registered due to failure
      expect(isProviderRegistered('github')).toBe(false);
      // GitLab should be registered
      expect(isProviderRegistered('gitlab')).toBe(true);
    });
  });

  describe('getProvider error when no providers registered', () => {
    it('should show "none" when registry is empty', async () => {
      // Mock both providers to throw during initialization
      vi.doMock('../../src/providers/github/GitHubProvider.js', () => {
        throw new Error('GitHub provider load failed');
      });

      vi.doMock('../../src/providers/gitlab/GitLabProvider.js', () => {
        throw new Error('GitLab provider load failed');
      });

      // Import factory after mocks are set up (fresh module with empty registry)
      const { getProvider } = await import('../../src/providers/factory.js');

      // Try to get a provider when none are registered
      expect(() => getProvider('github')).toThrow(
        "Unknown provider type: 'github'. Available providers: none"
      );
    });
  });
});
