/**
 * Branch coverage tests for providers/factory.ts
 * Targets: eviction, expired cache removal, capacity limits, normalizeUrl port branch
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

let hashCallCount = 0;
vi.mock('crypto', () => ({
  createHash: vi.fn(() => ({
    update: vi.fn(() => ({
      digest: vi.fn(() => `hash_${hashCallCount++}_${'x'.repeat(32)}`),
    })),
  })),
}));

vi.mock('../../src/providers/github/GitHubProvider.js', () => ({
  GitHubProvider: vi.fn().mockImplementation(() => ({
    type: 'github' as ProviderType,
    searchCode: vi.fn(),
    getFileContent: vi.fn(),
    searchRepos: vi.fn(),
    searchPullRequests: vi.fn(),
    getRepoStructure: vi.fn(),
  })),
}));

vi.mock('../../src/providers/gitlab/GitLabProvider.js', () => ({
  GitLabProvider: vi.fn().mockImplementation(() => ({
    type: 'gitlab' as ProviderType,
    searchCode: vi.fn(),
    getFileContent: vi.fn(),
    searchRepos: vi.fn(),
    searchPullRequests: vi.fn(),
    getRepoStructure: vi.fn(),
  })),
}));

import {
  getProvider,
  registerProvider,
  clearProviderCache,
} from '../../src/providers/factory.js';

function createMockProviderClass(type: ProviderType) {
  return class MockProvider implements ICodeHostProvider {
    readonly type = type;
    readonly config: ProviderConfig | undefined;

    constructor(config?: ProviderConfig) {
      this.config = config;
    }

    async searchCode(
      _q: CodeSearchQuery
    ): Promise<ProviderResponse<CodeSearchResult>> {
      return {
        status: 200,
        provider: this.type,
        data: {
          items: [],
          totalCount: 0,
          pagination: { currentPage: 1, totalPages: 1, hasMore: false },
        },
      };
    }

    async getFileContent(
      _q: FileContentQuery
    ): Promise<ProviderResponse<FileContentResult>> {
      return {
        status: 200,
        provider: this.type,
        data: {
          path: 'test.ts',
          content: '',
          encoding: 'utf-8',
          size: 0,
          ref: 'main',
        },
      };
    }

    async searchRepos(
      _q: RepoSearchQuery
    ): Promise<ProviderResponse<RepoSearchResult>> {
      return {
        status: 200,
        provider: this.type,
        data: {
          repositories: [],
          totalCount: 0,
          pagination: { currentPage: 1, totalPages: 1, hasMore: false },
        },
      };
    }

    async searchPullRequests(
      _q: PullRequestQuery
    ): Promise<ProviderResponse<PullRequestSearchResult>> {
      return {
        status: 200,
        provider: this.type,
        data: {
          items: [],
          totalCount: 0,
          pagination: { currentPage: 1, totalPages: 1, hasMore: false },
        },
      };
    }

    async getRepoStructure(
      _q: RepoStructureQuery
    ): Promise<ProviderResponse<RepoStructureResult>> {
      return {
        status: 200,
        provider: this.type,
        data: {
          projectPath: 'owner/repo',
          branch: 'main',
          path: '',
          structure: {},
          summary: { totalFiles: 0, totalFolders: 0, truncated: false },
        },
      };
    }
  };
}

describe('Provider Factory - Branch Coverage', () => {
  const originalDateNow = Date.now;

  beforeEach(() => {
    vi.clearAllMocks();
    hashCallCount = 0;
    clearProviderCache();
    const MockGitHubProvider = createMockProviderClass('github');
    registerProvider('github', MockGitHubProvider);
  });

  afterEach(() => {
    Date.now = originalDateNow;
    clearProviderCache();
  });

  describe('expired cache entry removal (line 179-181)', () => {
    it('should remove expired entry and create new provider', () => {
      let fakeTime = 1_000_000;
      Date.now = () => fakeTime;

      const config: ProviderConfig = {
        type: 'github',
        baseUrl: 'https://expire-test.github.com',
      };

      const provider1 = getProvider('github', config);

      // Advance past TTL (1 hour = 3_600_000ms)
      fakeTime += 3_600_001;

      const provider2 = getProvider('github', config);

      expect(provider1).not.toBe(provider2);
    });
  });

  describe('capacity eviction (lines 68-84, 184-186)', () => {
    it('should trigger eviction when cache reaches MAX_PROVIDER_INSTANCES', () => {
      let fakeTime = 1_000_000;
      Date.now = () => fakeTime;

      // Fill cache to capacity (MAX_PROVIDER_INSTANCES = 20)
      for (let i = 0; i < 20; i++) {
        getProvider('github', {
          type: 'github',
          baseUrl: `https://instance-${i}.github.com`,
        });
        fakeTime += 1;
      }

      // Next call should trigger eviction
      const overflow = getProvider('github', {
        type: 'github',
        baseUrl: 'https://overflow.github.com',
      });

      expect(overflow).toBeDefined();
      expect(overflow.type).toBe('github');
    });

    it('should evict expired entries first during capacity eviction', () => {
      let fakeTime = 1_000_000;
      Date.now = () => fakeTime;

      // Create 10 entries that will expire
      for (let i = 0; i < 10; i++) {
        getProvider('github', {
          type: 'github',
          baseUrl: `https://old-${i}.github.com`,
        });
        fakeTime += 1;
      }

      // Advance past TTL for the first 10
      fakeTime += 3_600_001;

      // Create 10 more (fresh) entries
      for (let i = 0; i < 10; i++) {
        getProvider('github', {
          type: 'github',
          baseUrl: `https://new-${i}.github.com`,
        });
        fakeTime += 1;
      }

      // Fill to capacity - should trigger eviction of expired entries
      const fresh = getProvider('github', {
        type: 'github',
        baseUrl: 'https://trigger-eviction.github.com',
      });

      expect(fresh).toBeDefined();
    });

    it('should evict LRU entries when no expired entries and over capacity', () => {
      let fakeTime = 1_000_000;
      Date.now = () => fakeTime;

      // Fill to exactly MAX_PROVIDER_INSTANCES with non-expired entries
      for (let i = 0; i < 20; i++) {
        getProvider('github', {
          type: 'github',
          baseUrl: `https://lru-${i}.github.com`,
        });
        fakeTime += 100; // small increments, all within TTL
      }

      // This triggers eviction since we're at capacity
      const result = getProvider('github', {
        type: 'github',
        baseUrl: 'https://lru-overflow.github.com',
      });

      expect(result).toBeDefined();
    });
  });

  describe('normalizeUrl with non-default port (line 120)', () => {
    it('should include non-default port in normalized URL', () => {
      const config1: ProviderConfig = {
        type: 'github',
        baseUrl: 'https://gitlab.example.com:9443/api/v4',
      };

      const provider = getProvider('github', config1);
      expect(provider).toBeDefined();
    });
  });
});
