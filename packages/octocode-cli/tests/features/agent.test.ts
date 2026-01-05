/**
 * Tests for Agent Core Module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the agent SDK before imports
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

// Mock API keys module
vi.mock('../../src/features/api-keys.js', () => ({
  discoverAPIKey: vi.fn().mockResolvedValue({ key: 'test-key', source: 'env' }),
  isClaudeCodeAuthenticated: vi.fn().mockReturnValue(true),
  getClaudeCodeSubscriptionInfo: vi.fn().mockReturnValue({}),
}));

// Mock providers module
vi.mock('../../src/features/providers/index.js', () => ({
  isProviderConfigured: vi.fn().mockReturnValue(true),
}));

// Mock agent-hooks module
vi.mock('../../src/features/agent-hooks.js', () => ({
  getDefaultHooks: vi.fn().mockReturnValue({}),
  getPermissiveHooks: vi.fn().mockReturnValue({}),
  getVerboseHooks: vi.fn().mockReturnValue({}),
  resetCostTracker: vi.fn(),
  getCostStats: vi.fn().mockReturnValue({
    totalInputTokens: 100,
    totalOutputTokens: 50,
    toolCalls: 5,
    durationMs: 1000,
  }),
  resetToolCounter: vi.fn(),
  setAgentState: vi.fn(),
  updateTokenUsage: vi.fn(),
  getAgentState: vi.fn().mockReturnValue({
    state: 'completed',
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 10,
    cacheWriteTokens: 5,
  }),
  setStateChangeCallback: vi.fn(),
}));

import {
  createInteractivePermissionHandler,
  isAgentSDKAvailable,
  checkAgentReadiness,
  OCTOCODE_SUBAGENTS,
  OCTOCODE_SYSTEM_PROMPT,
  RESEARCH_TOOLS,
  CODING_TOOLS,
  ALL_TOOLS,
} from '../../src/features/agent.js';
import type { CanUseToolOptions } from '../../src/types/agent.js';

// Helper to create mock options
function createMockOptions(): CanUseToolOptions {
  return {
    signal: new AbortController().signal,
    toolUseID: `tool-${Date.now()}`,
  };
}

describe('Agent Core Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Constants', () => {
    describe('OCTOCODE_SUBAGENTS', () => {
      it('should define researcher subagent', () => {
        expect(OCTOCODE_SUBAGENTS.researcher).toBeDefined();
        expect(OCTOCODE_SUBAGENTS.researcher.description).toContain('research');
        expect(OCTOCODE_SUBAGENTS.researcher.tools).toBeDefined();
        expect(OCTOCODE_SUBAGENTS.researcher.model).toBe('sonnet');
      });

      it('should define codeReviewer subagent', () => {
        expect(OCTOCODE_SUBAGENTS.codeReviewer).toBeDefined();
        expect(OCTOCODE_SUBAGENTS.codeReviewer.description).toContain('review');
        expect(OCTOCODE_SUBAGENTS.codeReviewer.model).toBe('sonnet');
      });

      it('should define testRunner subagent', () => {
        expect(OCTOCODE_SUBAGENTS.testRunner).toBeDefined();
        expect(OCTOCODE_SUBAGENTS.testRunner.description).toContain('test');
        expect(OCTOCODE_SUBAGENTS.testRunner.model).toBe('haiku');
      });

      it('should define docWriter subagent', () => {
        expect(OCTOCODE_SUBAGENTS.docWriter).toBeDefined();
        expect(OCTOCODE_SUBAGENTS.docWriter.description).toContain(
          'documentation'
        );
        expect(OCTOCODE_SUBAGENTS.docWriter.model).toBe('sonnet');
      });

      it('should define securityAuditor subagent', () => {
        expect(OCTOCODE_SUBAGENTS.securityAuditor).toBeDefined();
        expect(OCTOCODE_SUBAGENTS.securityAuditor.description).toContain(
          'security'
        );
        expect(OCTOCODE_SUBAGENTS.securityAuditor.model).toBe('opus');
      });

      it('should define refactorer subagent', () => {
        expect(OCTOCODE_SUBAGENTS.refactorer).toBeDefined();
        expect(OCTOCODE_SUBAGENTS.refactorer.description).toContain(
          'refactoring'
        );
        expect(OCTOCODE_SUBAGENTS.refactorer.model).toBe('sonnet');
      });
    });

    describe('Tool Sets', () => {
      it('RESEARCH_TOOLS should contain read-only tools', () => {
        expect(RESEARCH_TOOLS).toContain('Read');
        expect(RESEARCH_TOOLS).toContain('Glob');
        expect(RESEARCH_TOOLS).toContain('Grep');
        expect(RESEARCH_TOOLS).toContain('WebSearch');
        expect(RESEARCH_TOOLS).toContain('WebFetch');
        expect(RESEARCH_TOOLS).not.toContain('Write');
        expect(RESEARCH_TOOLS).not.toContain('Edit');
      });

      it('CODING_TOOLS should contain edit tools', () => {
        expect(CODING_TOOLS).toContain('Read');
        expect(CODING_TOOLS).toContain('Write');
        expect(CODING_TOOLS).toContain('Edit');
        expect(CODING_TOOLS).toContain('Bash');
        expect(CODING_TOOLS).toContain('TodoWrite');
      });

      it('ALL_TOOLS should be a superset of RESEARCH_TOOLS and CODING_TOOLS', () => {
        for (const tool of RESEARCH_TOOLS) {
          expect(ALL_TOOLS).toContain(tool);
        }
        for (const tool of CODING_TOOLS) {
          expect(ALL_TOOLS).toContain(tool);
        }
      });
    });

    describe('OCTOCODE_SYSTEM_PROMPT', () => {
      it('should contain Octocode MCP tool documentation', () => {
        expect(OCTOCODE_SYSTEM_PROMPT).toContain('mcp__octocode');
        expect(OCTOCODE_SYSTEM_PROMPT).toContain('githubSearchCode');
        expect(OCTOCODE_SYSTEM_PROMPT).toContain('localSearchCode');
      });

      it('should contain research workflow guidance', () => {
        expect(OCTOCODE_SYSTEM_PROMPT).toContain('Research Workflow');
        expect(OCTOCODE_SYSTEM_PROMPT).toContain('Structure');
      });
    });
  });

  describe('isAgentSDKAvailable', () => {
    it('should return true when SDK is available', async () => {
      const result = await isAgentSDKAvailable();
      expect(result).toBe(true);
    });
  });

  describe('checkAgentReadiness', () => {
    it('should return ready when provider is configured', async () => {
      const result = await checkAgentReadiness();
      expect(result.ready).toBe(true);
      expect(result.message).toBe('Agent ready');
    });

    it('should check multiple auth methods', async () => {
      const result = await checkAgentReadiness();
      expect(result).toHaveProperty('sdkInstalled');
      expect(result).toHaveProperty('claudeCodeAuth');
      expect(result).toHaveProperty('hasAPIKey');
    });
  });

  describe('createInteractivePermissionHandler', () => {
    it('should return a function', () => {
      const handler = createInteractivePermissionHandler();
      expect(typeof handler).toBe('function');
    });

    it('should auto-approve read-only tools', async () => {
      const handler = createInteractivePermissionHandler();

      const result = await handler(
        'Read',
        { file_path: '/test.txt' },
        createMockOptions()
      );

      expect(result.behavior).toBe('allow');
    });

    it('should auto-approve Octocode MCP tools', async () => {
      const handler = createInteractivePermissionHandler();

      const result = await handler(
        'mcp__octocode-local__githubSearchCode',
        { query: 'test' },
        createMockOptions()
      );

      expect(result.behavior).toBe('allow');
    });

    it('should auto-approve Glob tool', async () => {
      const handler = createInteractivePermissionHandler();

      const result = await handler(
        'Glob',
        { pattern: '*.ts' },
        createMockOptions()
      );

      expect(result.behavior).toBe('allow');
    });

    it('should auto-approve Grep tool', async () => {
      const handler = createInteractivePermissionHandler();

      const result = await handler(
        'Grep',
        { pattern: 'test', path: '/src' },
        createMockOptions()
      );

      expect(result.behavior).toBe('allow');
    });

    it('should auto-approve WebSearch tool', async () => {
      const handler = createInteractivePermissionHandler();

      const result = await handler(
        'WebSearch',
        { query: 'test' },
        createMockOptions()
      );

      expect(result.behavior).toBe('allow');
    });

    it('should auto-approve WebFetch tool', async () => {
      const handler = createInteractivePermissionHandler();

      const result = await handler(
        'WebFetch',
        { url: 'https://test.com' },
        createMockOptions()
      );

      expect(result.behavior).toBe('allow');
    });

    it('should auto-approve ListMcpResources tool', async () => {
      const handler = createInteractivePermissionHandler();

      const result = await handler('ListMcpResources', {}, createMockOptions());

      expect(result.behavior).toBe('allow');
    });

    it('should auto-approve ReadMcpResource tool', async () => {
      const handler = createInteractivePermissionHandler();

      const result = await handler(
        'ReadMcpResource',
        { uri: 'test://x' },
        createMockOptions()
      );

      expect(result.behavior).toBe('allow');
    });

    it('should track always-allowed tools in session', async () => {
      const handler = createInteractivePermissionHandler();

      // First call for a read-only tool - auto-approved
      await handler('Read', { file_path: '/test.txt' }, createMockOptions());

      // If it was marked as always-allowed, subsequent calls should also be allowed
      const result2 = await handler(
        'Read',
        { file_path: '/other.txt' },
        createMockOptions()
      );
      expect(result2.behavior).toBe('allow');
    });
  });
});
