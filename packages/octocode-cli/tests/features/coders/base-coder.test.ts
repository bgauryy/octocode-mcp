/**
 * Tests for Base Coder Module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the agent SDK before imports
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
}));

// Mock API keys module
vi.mock('../../../src/features/api-keys.js', () => ({
  discoverAPIKey: vi
    .fn()
    .mockResolvedValue({ key: 'test-key', source: 'environment' }),
  isClaudeCodeAuthenticated: vi.fn().mockReturnValue(true),
}));

// Mock agent-hooks module
vi.mock('../../../src/features/agent-hooks.js', () => ({
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
    toolCount: 5,
  }),
  setStateChangeCallback: vi.fn(),
}));

// Mock session manager
vi.mock('../../../src/features/session-manager.js', () => ({
  getSessionManager: vi.fn().mockReturnValue({
    createSessionInfo: vi.fn().mockReturnValue({
      id: 'test-session',
      status: 'active',
    }),
    saveSession: vi.fn(),
  }),
}));

// Mock agent-io
vi.mock('../../../src/features/agent-io.js', () => ({
  createAgentIO: vi.fn().mockReturnValue({
    verbose: false,
    updateConfig: vi.fn(),
    stateChange: vi.fn(),
    mcpStatus: vi.fn(),
    assistantOutput: vi.fn(),
    startLiveStats: vi.fn(),
    stopLiveStats: vi.fn(),
    resetCounters: vi.fn(),
  }),
  AgentIO: vi.fn(),
}));

// Mock fs for path finding
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
}));

// Mock child_process
vi.mock('child_process', () => ({
  execSync: vi.fn().mockImplementation(() => {
    throw new Error('Command not found');
  }),
}));

import { BaseCoder } from '../../../src/features/coders/base-coder.js';
import {
  DEFAULT_CODER_CONFIG,
  createTurnState,
  type CoderMode,
  type CoderCapabilities,
  type CoderConfig,
} from '../../../src/features/coders/types.js';

// Create a concrete implementation for testing
class TestCoder extends BaseCoder {
  readonly mode: CoderMode = 'research';

  getCapabilities(): CoderCapabilities {
    return {
      tools: ['Read', 'Glob', 'Grep'],
      agents: {},
      mcpServers: {},
      systemPrompt: 'Test system prompt',
      settings: {
        canEdit: false,
        canExecute: false,
        canAccessWeb: true,
        readOnly: true,
      },
    };
  }

  protected getSystemPrompt(): string {
    return 'Test system prompt';
  }
}

describe('Base Coder Module', () => {
  let coder: TestCoder;

  beforeEach(() => {
    vi.clearAllMocks();
    coder = new TestCoder();
  });

  describe('DEFAULT_CODER_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_CODER_CONFIG).toBeDefined();
      expect(DEFAULT_CODER_CONFIG.verbose).toBe(true); // Default is verbose
      expect(DEFAULT_CODER_CONFIG.maxReflections).toBeGreaterThan(0);
      expect(DEFAULT_CODER_CONFIG.model).toBeDefined();
    });
  });

  describe('createTurnState', () => {
    it('should create initial turn state', () => {
      const state = createTurnState();

      expect(state.reflectionCount).toBe(0);
      expect(state.turnTokens.input).toBe(0);
      expect(state.turnTokens.output).toBe(0);
      expect(state.editedFiles).toBeInstanceOf(Set);
      expect(state.executedCommands).toEqual([]);
      expect(state.startTime).toBeGreaterThan(0);
    });

    it('should create independent state instances', () => {
      const state1 = createTurnState();
      const state2 = createTurnState();

      state1.reflectionCount = 5;
      state1.editedFiles.add('test.ts');

      expect(state2.reflectionCount).toBe(0);
      expect(state2.editedFiles.size).toBe(0);
    });
  });

  describe('BaseCoder', () => {
    describe('constructor', () => {
      it('should use default config when none provided', () => {
        const context = coder.getContext();
        expect(context.config.verbose).toBe(DEFAULT_CODER_CONFIG.verbose);
        expect(context.config.maxReflections).toBe(
          DEFAULT_CODER_CONFIG.maxReflections
        );
      });

      it('should merge provided config with defaults', () => {
        const customCoder = new TestCoder({ verbose: true, maxTurns: 50 });
        const context = customCoder.getContext();

        expect(context.config.verbose).toBe(true);
        expect(context.config.maxTurns).toBe(50);
      });

      it('should initialize turn state', () => {
        const context = coder.getContext();
        expect(context.turnState).toBeDefined();
        expect(context.turnState.reflectionCount).toBe(0);
      });
    });

    describe('getContext', () => {
      it('should return current context', () => {
        const context = coder.getContext();

        expect(context).toHaveProperty('config');
        expect(context).toHaveProperty('io');
        expect(context).toHaveProperty('turnState');
        expect(context).toHaveProperty('sessionState');
        expect(context).toHaveProperty('results');
      });

      it('should return copy of results array', () => {
        const context1 = coder.getContext();
        const context2 = coder.getContext();

        expect(context1.results).not.toBe(context2.results);
      });
    });

    describe('resetTurn', () => {
      it('should reset turn state', () => {
        // Simulate some activity
        const context = coder.getContext();
        context.turnState.reflectionCount = 3;
        context.turnState.editedFiles.add('test.ts');

        coder.resetTurn();

        const newContext = coder.getContext();
        expect(newContext.turnState.reflectionCount).toBe(0);
        expect(newContext.turnState.editedFiles.size).toBe(0);
      });
    });

    describe('updateConfig', () => {
      it('should update configuration at runtime', () => {
        coder.updateConfig({ verbose: true });

        const context = coder.getContext();
        expect(context.config.verbose).toBe(true);
      });

      it('should preserve unmodified config values', () => {
        const originalMaxTurns = coder.getContext().config.maxTurns;

        coder.updateConfig({ verbose: true });

        const context = coder.getContext();
        expect(context.config.maxTurns).toBe(originalMaxTurns);
      });
    });

    describe('getCapabilities', () => {
      it('should return capabilities', () => {
        const capabilities = coder.getCapabilities();

        expect(capabilities).toHaveProperty('tools');
        expect(capabilities).toHaveProperty('agents');
        expect(capabilities).toHaveProperty('mcpServers');
        expect(capabilities).toHaveProperty('systemPrompt');
      });

      it('should include expected tools for test coder', () => {
        const capabilities = coder.getCapabilities();

        expect(capabilities.tools).toContain('Read');
        expect(capabilities.tools).toContain('Glob');
        expect(capabilities.tools).toContain('Grep');
      });
    });

    describe('run', () => {
      it('should check readiness before running', async () => {
        const apiKeys = await import('../../../src/features/api-keys.js');

        // Simulate no auth
        vi.mocked(apiKeys.isClaudeCodeAuthenticated).mockReturnValueOnce(false);
        vi.mocked(apiKeys.discoverAPIKey).mockResolvedValueOnce({
          key: null,
          source: 'none',
          provider: 'anthropic',
        });

        const result = await coder.run('test prompt');

        expect(result.success).toBe(false);
        expect(result.error).toContain('credentials');
      });

      it('should return error result when SDK not available', async () => {
        // Mock SDK import to fail
        vi.doMock('@anthropic-ai/claude-agent-sdk', () => {
          throw new Error('Module not found');
        });

        // Create a new coder that will hit the SDK check
        const apiKeys = await import('../../../src/features/api-keys.js');

        vi.mocked(apiKeys.isClaudeCodeAuthenticated).mockReturnValue(false);
        vi.mocked(apiKeys.discoverAPIKey).mockResolvedValue({
          key: null,
          source: 'none',
          provider: 'anthropic',
        });

        const result = await coder.run('test prompt');

        expect(result.success).toBe(false);
      });
    });
  });

  describe('CoderConfig', () => {
    it('should support all permission modes', () => {
      const modes = ['default', 'acceptEdits', 'bypassPermissions', 'plan'];

      for (const mode of modes) {
        const config: Partial<CoderConfig> = {
          permissionMode: mode as CoderConfig['permissionMode'],
        };
        const customCoder = new TestCoder(config);
        expect(customCoder.getContext().config.permissionMode).toBe(mode);
      }
    });

    it('should support all models', () => {
      const models = ['sonnet', 'opus', 'haiku', 'inherit'];

      for (const model of models) {
        const config: Partial<CoderConfig> = {
          model: model as CoderConfig['model'],
        };
        const customCoder = new TestCoder(config);
        expect(customCoder.getContext().config.model).toBe(model);
      }
    });

    it('should support working directory', () => {
      const customCoder = new TestCoder({ cwd: '/custom/path' });
      expect(customCoder.getContext().config.cwd).toBe('/custom/path');
    });

    it('should support session persistence', () => {
      const customCoder = new TestCoder({ persistSession: true });
      expect(customCoder.getContext().config.persistSession).toBe(true);
    });

    it('should support session resume', () => {
      const customCoder = new TestCoder({ resumeSession: 'session-123' });
      expect(customCoder.getContext().config.resumeSession).toBe('session-123');
    });

    it('should support extended thinking', () => {
      const customCoder = new TestCoder({
        enableThinking: true,
        maxThinkingTokens: 32000,
      });
      expect(customCoder.getContext().config.enableThinking).toBe(true);
      expect(customCoder.getContext().config.maxThinkingTokens).toBe(32000);
    });

    it('should support max turns and budget', () => {
      const customCoder = new TestCoder({ maxTurns: 100, maxBudgetUsd: 5 });
      expect(customCoder.getContext().config.maxTurns).toBe(100);
      expect(customCoder.getContext().config.maxBudgetUsd).toBe(5);
    });
  });

  describe('TurnState', () => {
    it('should track edited files', () => {
      const state = createTurnState();

      state.editedFiles.add('file1.ts');
      state.editedFiles.add('file2.ts');

      expect(state.editedFiles.size).toBe(2);
      expect(state.editedFiles.has('file1.ts')).toBe(true);
    });

    it('should track executed commands', () => {
      const state = createTurnState();

      state.executedCommands.push('npm test');
      state.executedCommands.push('npm run build');

      expect(state.executedCommands).toHaveLength(2);
      expect(state.executedCommands).toContain('npm test');
    });

    it('should track turn tokens', () => {
      const state = createTurnState();

      state.turnTokens.input += 100;
      state.turnTokens.output += 50;

      expect(state.turnTokens.input).toBe(100);
      expect(state.turnTokens.output).toBe(50);
    });

    it('should track reflection count', () => {
      const state = createTurnState();

      state.reflectionCount++;
      state.reflectionCount++;

      expect(state.reflectionCount).toBe(2);
    });
  });
});
