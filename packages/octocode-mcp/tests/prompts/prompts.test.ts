import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPrompts } from '../../src/prompts/prompts.js';
import type { CompleteMetadata } from '../../src/tools/toolMetadata.js';

// Mock the individual prompt registration functions
vi.mock('../../src/prompts/research.js', () => ({
  registerResearchPrompt: vi.fn(),
}));

vi.mock('../../src/prompts/use.js', () => ({
  registerUsePrompt: vi.fn(),
}));

vi.mock('../../src/prompts/review_security.js', () => ({
  registerSecurityReviewPrompt: vi.fn(),
}));

import { registerResearchPrompt } from '../../src/prompts/research.js';
import { registerUsePrompt } from '../../src/prompts/use.js';
import { registerSecurityReviewPrompt } from '../../src/prompts/review_security.js';

describe('Prompts Registration', () => {
  let mockServer: McpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockServer = {} as McpServer;
  });

  describe('Full Metadata - All Prompts Present', () => {
    it('should register all prompts when all metadata is complete', () => {
      const fullMetadata: CompleteMetadata = {
        instructions: 'Test instructions',
        prompts: {
          research: {
            name: 'Research',
            description: 'Research prompt description',
            content: 'Research prompt content',
          },
          use: {
            name: 'Use',
            description: 'Use prompt description',
            content: 'Use prompt content',
          },
          reviewSecurity: {
            name: 'Security Review',
            description: 'Security review description',
            content: 'Security review content',
          },
        },
        toolNames: {
          GITHUB_FETCH_CONTENT: 'githubGetFileContent',
          GITHUB_SEARCH_CODE: 'githubSearchCode',
          GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
          GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
          GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
        },
        baseSchema: {
          mainResearchGoal: '',
          researchGoal: '',
          reasoning: '',
          bulkQuery: () => '',
        },
        tools: {},
        baseHints: { hasResults: [], empty: [] },
        genericErrorHints: [],
      };

      registerPrompts(mockServer, fullMetadata);

      expect(registerResearchPrompt).toHaveBeenCalledWith(
        mockServer,
        fullMetadata
      );
      expect(registerUsePrompt).toHaveBeenCalledWith(mockServer, fullMetadata);
      expect(registerSecurityReviewPrompt).toHaveBeenCalledWith(
        mockServer,
        fullMetadata
      );
    });
  });

  describe('Missing Content Field', () => {
    it('should not register research prompt when content is missing', () => {
      const metadata: CompleteMetadata = {
        instructions: 'Test instructions',
        prompts: {
          research: {
            name: 'Research',
            description: 'Research prompt description',
            content: '', // Empty content
          },
          use: {
            name: 'Use',
            description: 'Use prompt description',
            content: 'Use prompt content',
          },
          reviewSecurity: {
            name: 'Security Review',
            description: 'Security review description',
            content: 'Security review content',
          },
        },
        toolNames: {
          GITHUB_FETCH_CONTENT: 'githubGetFileContent',
          GITHUB_SEARCH_CODE: 'githubSearchCode',
          GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
          GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
          GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
        },
        baseSchema: {
          mainResearchGoal: '',
          researchGoal: '',
          reasoning: '',
          bulkQuery: () => '',
        },
        tools: {},
        baseHints: { hasResults: [], empty: [] },
        genericErrorHints: [],
      };

      registerPrompts(mockServer, metadata);

      expect(registerResearchPrompt).not.toHaveBeenCalled();
      expect(registerUsePrompt).toHaveBeenCalledWith(mockServer, metadata);
      expect(registerSecurityReviewPrompt).toHaveBeenCalledWith(
        mockServer,
        metadata
      );
    });

    it('should not register use prompt when content is missing', () => {
      const metadata: CompleteMetadata = {
        instructions: 'Test instructions',
        prompts: {
          research: {
            name: 'Research',
            description: 'Research prompt description',
            content: 'Research prompt content',
          },
          use: {
            name: 'Use',
            description: 'Use prompt description',
            content: '', // Empty content
          },
          reviewSecurity: {
            name: 'Security Review',
            description: 'Security review description',
            content: 'Security review content',
          },
        },
        toolNames: {
          GITHUB_FETCH_CONTENT: 'githubGetFileContent',
          GITHUB_SEARCH_CODE: 'githubSearchCode',
          GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
          GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
          GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
        },
        baseSchema: {
          mainResearchGoal: '',
          researchGoal: '',
          reasoning: '',
          bulkQuery: () => '',
        },
        tools: {},
        baseHints: { hasResults: [], empty: [] },
        genericErrorHints: [],
      };

      registerPrompts(mockServer, metadata);

      expect(registerResearchPrompt).toHaveBeenCalledWith(mockServer, metadata);
      expect(registerUsePrompt).not.toHaveBeenCalled();
      expect(registerSecurityReviewPrompt).toHaveBeenCalledWith(
        mockServer,
        metadata
      );
    });

    it('should not register reviewSecurity prompt when content is missing', () => {
      const metadata: CompleteMetadata = {
        instructions: 'Test instructions',
        prompts: {
          research: {
            name: 'Research',
            description: 'Research prompt description',
            content: 'Research prompt content',
          },
          use: {
            name: 'Use',
            description: 'Use prompt description',
            content: 'Use prompt content',
          },
          reviewSecurity: {
            name: 'Security Review',
            description: 'Security review description',
            content: '', // Empty content
          },
        },
        toolNames: {
          GITHUB_FETCH_CONTENT: 'githubGetFileContent',
          GITHUB_SEARCH_CODE: 'githubSearchCode',
          GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
          GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
          GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
        },
        baseSchema: {
          mainResearchGoal: '',
          researchGoal: '',
          reasoning: '',
          bulkQuery: () => '',
        },
        tools: {},
        baseHints: { hasResults: [], empty: [] },
        genericErrorHints: [],
      };

      registerPrompts(mockServer, metadata);

      expect(registerResearchPrompt).toHaveBeenCalledWith(mockServer, metadata);
      expect(registerUsePrompt).toHaveBeenCalledWith(mockServer, metadata);
      expect(registerSecurityReviewPrompt).not.toHaveBeenCalled();
    });
  });

  describe('Missing Description Field', () => {
    it('should not register research prompt when description is missing', () => {
      const metadata: CompleteMetadata = {
        instructions: 'Test instructions',
        prompts: {
          research: {
            name: 'Research',
            description: '', // Empty description
            content: 'Research prompt content',
          },
          use: {
            name: 'Use',
            description: 'Use prompt description',
            content: 'Use prompt content',
          },
          reviewSecurity: {
            name: 'Security Review',
            description: 'Security review description',
            content: 'Security review content',
          },
        },
        toolNames: {
          GITHUB_FETCH_CONTENT: 'githubGetFileContent',
          GITHUB_SEARCH_CODE: 'githubSearchCode',
          GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
          GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
          GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
        },
        baseSchema: {
          mainResearchGoal: '',
          researchGoal: '',
          reasoning: '',
          bulkQuery: () => '',
        },
        tools: {},
        baseHints: { hasResults: [], empty: [] },
        genericErrorHints: [],
      };

      registerPrompts(mockServer, metadata);

      expect(registerResearchPrompt).not.toHaveBeenCalled();
      expect(registerUsePrompt).toHaveBeenCalledWith(mockServer, metadata);
      expect(registerSecurityReviewPrompt).toHaveBeenCalledWith(
        mockServer,
        metadata
      );
    });

    it('should not register use prompt when description is missing', () => {
      const metadata: CompleteMetadata = {
        instructions: 'Test instructions',
        prompts: {
          research: {
            name: 'Research',
            description: 'Research prompt description',
            content: 'Research prompt content',
          },
          use: {
            name: 'Use',
            description: '', // Empty description
            content: 'Use prompt content',
          },
          reviewSecurity: {
            name: 'Security Review',
            description: 'Security review description',
            content: 'Security review content',
          },
        },
        toolNames: {
          GITHUB_FETCH_CONTENT: 'githubGetFileContent',
          GITHUB_SEARCH_CODE: 'githubSearchCode',
          GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
          GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
          GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
        },
        baseSchema: {
          mainResearchGoal: '',
          researchGoal: '',
          reasoning: '',
          bulkQuery: () => '',
        },
        tools: {},
        baseHints: { hasResults: [], empty: [] },
        genericErrorHints: [],
      };

      registerPrompts(mockServer, metadata);

      expect(registerResearchPrompt).toHaveBeenCalledWith(mockServer, metadata);
      expect(registerUsePrompt).not.toHaveBeenCalled();
      expect(registerSecurityReviewPrompt).toHaveBeenCalledWith(
        mockServer,
        metadata
      );
    });

    it('should not register reviewSecurity prompt when description is missing', () => {
      const metadata: CompleteMetadata = {
        instructions: 'Test instructions',
        prompts: {
          research: {
            name: 'Research',
            description: 'Research prompt description',
            content: 'Research prompt content',
          },
          use: {
            name: 'Use',
            description: 'Use prompt description',
            content: 'Use prompt content',
          },
          reviewSecurity: {
            name: 'Security Review',
            description: '', // Empty description
            content: 'Security review content',
          },
        },
        toolNames: {
          GITHUB_FETCH_CONTENT: 'githubGetFileContent',
          GITHUB_SEARCH_CODE: 'githubSearchCode',
          GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
          GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
          GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
        },
        baseSchema: {
          mainResearchGoal: '',
          researchGoal: '',
          reasoning: '',
          bulkQuery: () => '',
        },
        tools: {},
        baseHints: { hasResults: [], empty: [] },
        genericErrorHints: [],
      };

      registerPrompts(mockServer, metadata);

      expect(registerResearchPrompt).toHaveBeenCalledWith(mockServer, metadata);
      expect(registerUsePrompt).toHaveBeenCalledWith(mockServer, metadata);
      expect(registerSecurityReviewPrompt).not.toHaveBeenCalled();
    });
  });

  describe('Missing Name Field', () => {
    it('should not register research prompt when name is missing', () => {
      const metadata: CompleteMetadata = {
        instructions: 'Test instructions',
        prompts: {
          research: {
            name: '', // Empty name
            description: 'Research prompt description',
            content: 'Research prompt content',
          },
          use: {
            name: 'Use',
            description: 'Use prompt description',
            content: 'Use prompt content',
          },
          reviewSecurity: {
            name: 'Security Review',
            description: 'Security review description',
            content: 'Security review content',
          },
        },
        toolNames: {
          GITHUB_FETCH_CONTENT: 'githubGetFileContent',
          GITHUB_SEARCH_CODE: 'githubSearchCode',
          GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
          GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
          GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
        },
        baseSchema: {
          mainResearchGoal: '',
          researchGoal: '',
          reasoning: '',
          bulkQuery: () => '',
        },
        tools: {},
        baseHints: { hasResults: [], empty: [] },
        genericErrorHints: [],
      };

      registerPrompts(mockServer, metadata);

      expect(registerResearchPrompt).not.toHaveBeenCalled();
      expect(registerUsePrompt).toHaveBeenCalledWith(mockServer, metadata);
      expect(registerSecurityReviewPrompt).toHaveBeenCalledWith(
        mockServer,
        metadata
      );
    });

    it('should not register use prompt when name is missing', () => {
      const metadata: CompleteMetadata = {
        instructions: 'Test instructions',
        prompts: {
          research: {
            name: 'Research',
            description: 'Research prompt description',
            content: 'Research prompt content',
          },
          use: {
            name: '', // Empty name
            description: 'Use prompt description',
            content: 'Use prompt content',
          },
          reviewSecurity: {
            name: 'Security Review',
            description: 'Security review description',
            content: 'Security review content',
          },
        },
        toolNames: {
          GITHUB_FETCH_CONTENT: 'githubGetFileContent',
          GITHUB_SEARCH_CODE: 'githubSearchCode',
          GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
          GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
          GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
        },
        baseSchema: {
          mainResearchGoal: '',
          researchGoal: '',
          reasoning: '',
          bulkQuery: () => '',
        },
        tools: {},
        baseHints: { hasResults: [], empty: [] },
        genericErrorHints: [],
      };

      registerPrompts(mockServer, metadata);

      expect(registerResearchPrompt).toHaveBeenCalledWith(mockServer, metadata);
      expect(registerUsePrompt).not.toHaveBeenCalled();
      expect(registerSecurityReviewPrompt).toHaveBeenCalledWith(
        mockServer,
        metadata
      );
    });

    it('should not register reviewSecurity prompt when name is missing', () => {
      const metadata: CompleteMetadata = {
        instructions: 'Test instructions',
        prompts: {
          research: {
            name: 'Research',
            description: 'Research prompt description',
            content: 'Research prompt content',
          },
          use: {
            name: 'Use',
            description: 'Use prompt description',
            content: 'Use prompt content',
          },
          reviewSecurity: {
            name: '', // Empty name
            description: 'Security review description',
            content: 'Security review content',
          },
        },
        toolNames: {
          GITHUB_FETCH_CONTENT: 'githubGetFileContent',
          GITHUB_SEARCH_CODE: 'githubSearchCode',
          GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
          GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
          GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
        },
        baseSchema: {
          mainResearchGoal: '',
          researchGoal: '',
          reasoning: '',
          bulkQuery: () => '',
        },
        tools: {},
        baseHints: { hasResults: [], empty: [] },
        genericErrorHints: [],
      };

      registerPrompts(mockServer, metadata);

      expect(registerResearchPrompt).toHaveBeenCalledWith(mockServer, metadata);
      expect(registerUsePrompt).toHaveBeenCalledWith(mockServer, metadata);
      expect(registerSecurityReviewPrompt).not.toHaveBeenCalled();
    });
  });

  describe('Multiple Missing Fields', () => {
    it('should not register any prompts when all have missing content', () => {
      const metadata: CompleteMetadata = {
        instructions: 'Test instructions',
        prompts: {
          research: {
            name: 'Research',
            description: 'Research prompt description',
            content: '', // Empty
          },
          use: {
            name: 'Use',
            description: 'Use prompt description',
            content: '', // Empty
          },
          reviewSecurity: {
            name: 'Security Review',
            description: 'Security review description',
            content: '', // Empty
          },
        },
        toolNames: {
          GITHUB_FETCH_CONTENT: 'githubGetFileContent',
          GITHUB_SEARCH_CODE: 'githubSearchCode',
          GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
          GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
          GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
        },
        baseSchema: {
          mainResearchGoal: '',
          researchGoal: '',
          reasoning: '',
          bulkQuery: () => '',
        },
        tools: {},
        baseHints: { hasResults: [], empty: [] },
        genericErrorHints: [],
      };

      registerPrompts(mockServer, metadata);

      expect(registerResearchPrompt).not.toHaveBeenCalled();
      expect(registerUsePrompt).not.toHaveBeenCalled();
      expect(registerSecurityReviewPrompt).not.toHaveBeenCalled();
    });

    it('should not register prompts when content and description are both missing', () => {
      const metadata: CompleteMetadata = {
        instructions: 'Test instructions',
        prompts: {
          research: {
            name: 'Research',
            description: '', // Empty
            content: '', // Empty
          },
          use: {
            name: 'Use',
            description: 'Use prompt description',
            content: 'Use prompt content',
          },
          reviewSecurity: {
            name: 'Security Review',
            description: 'Security review description',
            content: 'Security review content',
          },
        },
        toolNames: {
          GITHUB_FETCH_CONTENT: 'githubGetFileContent',
          GITHUB_SEARCH_CODE: 'githubSearchCode',
          GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
          GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
          GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
        },
        baseSchema: {
          mainResearchGoal: '',
          researchGoal: '',
          reasoning: '',
          bulkQuery: () => '',
        },
        tools: {},
        baseHints: { hasResults: [], empty: [] },
        genericErrorHints: [],
      };

      registerPrompts(mockServer, metadata);

      expect(registerResearchPrompt).not.toHaveBeenCalled();
      expect(registerUsePrompt).toHaveBeenCalledWith(mockServer, metadata);
      expect(registerSecurityReviewPrompt).toHaveBeenCalledWith(
        mockServer,
        metadata
      );
    });

    it('should not register prompts when all fields are missing', () => {
      const metadata: CompleteMetadata = {
        instructions: 'Test instructions',
        prompts: {
          research: {
            name: '', // Empty
            description: '', // Empty
            content: '', // Empty
          },
          use: {
            name: 'Use',
            description: 'Use prompt description',
            content: 'Use prompt content',
          },
          reviewSecurity: {
            name: 'Security Review',
            description: 'Security review description',
            content: 'Security review content',
          },
        },
        toolNames: {
          GITHUB_FETCH_CONTENT: 'githubGetFileContent',
          GITHUB_SEARCH_CODE: 'githubSearchCode',
          GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
          GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
          GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
        },
        baseSchema: {
          mainResearchGoal: '',
          researchGoal: '',
          reasoning: '',
          bulkQuery: () => '',
        },
        tools: {},
        baseHints: { hasResults: [], empty: [] },
        genericErrorHints: [],
      };

      registerPrompts(mockServer, metadata);

      expect(registerResearchPrompt).not.toHaveBeenCalled();
      expect(registerUsePrompt).toHaveBeenCalledWith(mockServer, metadata);
      expect(registerSecurityReviewPrompt).toHaveBeenCalledWith(
        mockServer,
        metadata
      );
    });
  });

  describe('Missing Prompt Entries', () => {
    it('should not register research prompt when entry is undefined', () => {
      const metadata = {
        instructions: 'Test instructions',
        prompts: {
          // research is missing entirely
          research: {
            name: '',
            description: '',
            content: '',
          },
          use: {
            name: 'Use',
            description: 'Use prompt description',
            content: 'Use prompt content',
          },
          reviewSecurity: {
            name: 'Security Review',
            description: 'Security review description',
            content: 'Security review content',
          },
        },
        toolNames: {
          GITHUB_FETCH_CONTENT: 'githubGetFileContent',
          GITHUB_SEARCH_CODE: 'githubSearchCode',
          GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
          GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
          GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
        },
        baseSchema: {
          mainResearchGoal: '',
          researchGoal: '',
          reasoning: '',
          bulkQuery: () => '',
        },
        tools: {},
        baseHints: { hasResults: [], empty: [] },
        genericErrorHints: [],
      } as CompleteMetadata;

      registerPrompts(mockServer, metadata);

      expect(registerResearchPrompt).not.toHaveBeenCalled();
      expect(registerUsePrompt).toHaveBeenCalledWith(mockServer, metadata);
      expect(registerSecurityReviewPrompt).toHaveBeenCalledWith(
        mockServer,
        metadata
      );
    });

    it('should not register any prompts when prompts object is empty', () => {
      const metadata = {
        instructions: 'Test instructions',
        prompts: {
          research: {
            name: '',
            description: '',
            content: '',
          },
          use: {
            name: '',
            description: '',
            content: '',
          },
          reviewSecurity: {
            name: '',
            description: '',
            content: '',
          },
        },
        toolNames: {
          GITHUB_FETCH_CONTENT: 'githubGetFileContent',
          GITHUB_SEARCH_CODE: 'githubSearchCode',
          GITHUB_SEARCH_PULL_REQUESTS: 'githubSearchPullRequests',
          GITHUB_SEARCH_REPOSITORIES: 'githubSearchRepositories',
          GITHUB_VIEW_REPO_STRUCTURE: 'githubViewRepoStructure',
        },
        baseSchema: {
          mainResearchGoal: '',
          researchGoal: '',
          reasoning: '',
          bulkQuery: () => '',
        },
        tools: {},
        baseHints: { hasResults: [], empty: [] },
        genericErrorHints: [],
      } as CompleteMetadata;

      registerPrompts(mockServer, metadata);

      expect(registerResearchPrompt).not.toHaveBeenCalled();
      expect(registerUsePrompt).not.toHaveBeenCalled();
      expect(registerSecurityReviewPrompt).not.toHaveBeenCalled();
    });
  });
});
