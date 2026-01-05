/**
 * Base Coder - Foundation class for all coder implementations
 *
 * Provides:
 * - Core agent loop
 * - State management
 * - Turn/reflection handling
 * - Token tracking
 * - IO integration
 */

import type {
  CoderMode,
  CoderConfig,
  CoderCapabilities,
  CoderContext,
  CoderResult,
  TurnState,
  ICoder,
} from './types.js';
import { DEFAULT_CODER_CONFIG, createTurnState } from './types.js';
import type { SDKMessage } from '../../types/agent.js';
import { AgentIO, createAgentIO } from '../agent-io.js';
import {
  resetCostTracker,
  getCostStats,
  resetToolCounter,
  setAgentState,
  updateTokenUsage,
  getAgentState,
  setStateChangeCallback,
} from '../agent-hooks.js';
import { discoverAPIKey, isClaudeCodeAuthenticated } from '../api-keys.js';
import {
  getVerboseHooks,
  getDefaultHooks,
  getPermissiveHooks,
} from '../agent-hooks.js';
import { getSessionManager } from '../session-manager.js';
import { existsSync } from 'fs';
import { execSync } from 'child_process';

// ============================================
// Base Coder Class
// ============================================

export abstract class BaseCoder implements ICoder {
  abstract readonly mode: CoderMode;

  protected config: CoderConfig;
  protected io: AgentIO;
  protected turnState: TurnState;
  protected sessionId?: string;
  protected results: string[] = [];

  constructor(config: Partial<CoderConfig> = {}) {
    this.config = { ...DEFAULT_CODER_CONFIG, ...config };
    this.io = createAgentIO({
      verbose: this.config.verbose,
      showLiveStats: this.config.verbose,
    });
    this.turnState = createTurnState();
  }

  // ============================================
  // Abstract Methods (Implement in Subclasses)
  // ============================================

  /**
   * Get capabilities for this coder mode
   */
  abstract getCapabilities(): CoderCapabilities;

  /**
   * Get system prompt for this coder
   */
  protected abstract getSystemPrompt(): string;

  // ============================================
  // Public Methods
  // ============================================

  /**
   * Run the coder with a prompt
   */
  async run(prompt: string): Promise<CoderResult> {
    // Reset tracking
    this.resetTracking();
    setAgentState('initializing');

    // Set up state change callback
    if (this.config.verbose) {
      setStateChangeCallback(state => {
        this.io.stateChange(state);
      });
    }

    // Check readiness
    const readiness = await this.checkReadiness();
    if (!readiness.ready) {
      setAgentState('error');
      setStateChangeCallback(null);
      return this.createErrorResult(readiness.message);
    }

    try {
      // Run the agent loop
      const result = await this.runAgentLoop(prompt);
      return result;
    } catch (error) {
      setAgentState('error');
      setStateChangeCallback(null);
      return this.createErrorResult(
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Get current context
   */
  getContext(): CoderContext {
    return {
      config: this.config,
      io: this.io,
      turnState: this.turnState,
      sessionState: getAgentState(),
      sessionId: this.sessionId,
      results: [...this.results],
    };
  }

  /**
   * Reset turn state (call between turns)
   */
  resetTurn(): void {
    this.turnState = createTurnState();
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(config: Partial<CoderConfig>): void {
    this.config = { ...this.config, ...config };
    this.io.updateConfig({
      verbose: this.config.verbose,
      showLiveStats: this.config.verbose,
    });
  }

  // ============================================
  // Protected Methods
  // ============================================

  /**
   * Reset all tracking for new session
   */
  protected resetTracking(): void {
    resetCostTracker();
    resetToolCounter();
    this.resetTurn();
    this.results = [];
    this.sessionId = undefined;
    this.io.resetCounters();
  }

  /**
   * Check if agent is ready to run
   */
  protected async checkReadiness(): Promise<{
    ready: boolean;
    message: string;
  }> {
    try {
      // Check SDK availability
      await import('@anthropic-ai/claude-agent-sdk');
    } catch {
      return {
        ready: false,
        message:
          'Claude Agent SDK not installed. Run: npm install @anthropic-ai/claude-agent-sdk',
      };
    }

    // Check authentication
    const claudeCodeAuth = isClaudeCodeAuthenticated();
    const apiKeyResult = await discoverAPIKey('anthropic');
    const hasAPIKey = apiKeyResult.key !== null;

    if (!claudeCodeAuth && !hasAPIKey) {
      return {
        ready: false,
        message:
          'No API credentials found. Install Claude Code or set ANTHROPIC_API_KEY',
      };
    }

    return { ready: true, message: 'Agent ready' };
  }

  /**
   * Run the main agent loop
   */
  protected async runAgentLoop(prompt: string): Promise<CoderResult> {
    const { query } = await import('@anthropic-ai/claude-agent-sdk');

    const capabilities = this.getCapabilities();
    const queryOptions = this.buildQueryOptions(capabilities);

    setAgentState('connecting_mcp');

    let result = '';
    let hasError = false;

    // Start live stats if enabled
    if (this.config.verbose) {
      this.io.startLiveStats(() => getAgentState());
    }

    try {
      for await (const message of query({
        prompt,
        options: queryOptions,
      })) {
        const msg = message as SDKMessage;
        await this.handleMessage(msg);

        // Capture result
        if (msg.type === 'result' && 'result' in msg) {
          result = msg.result as string;
          setAgentState('completed');
        }
      }
    } catch (error) {
      hasError = true;
      throw error;
    } finally {
      // Stop live stats
      this.io.stopLiveStats();
      setStateChangeCallback(null);

      // Auto-save session if persistence is enabled
      if (this.config.persistSession && this.sessionId) {
        await this.saveSessionInfo(prompt, hasError);
      }
    }

    return this.createSuccessResult(result);
  }

  /**
   * Save session info to session manager
   */
  protected async saveSessionInfo(
    prompt: string,
    hasError: boolean
  ): Promise<void> {
    if (!this.sessionId) return;

    try {
      const sessionManager = getSessionManager();
      const stats = getCostStats();
      const state = getAgentState();

      const sessionInfo = sessionManager.createSessionInfo({
        id: this.sessionId,
        prompt,
        mode: this.mode,
        cwd: this.config.cwd,
      });

      // Update with final stats
      sessionInfo.status = hasError ? 'error' : 'completed';
      sessionInfo.totalCost = stats.totalCost;
      sessionInfo.totalTokens =
        (state.inputTokens || 0) + (state.outputTokens || 0);

      await sessionManager.saveSession(sessionInfo);
    } catch {
      // Silently fail session save - don't interrupt main flow
    }
  }

  /**
   * Handle incoming message from SDK
   */
  protected async handleMessage(msg: SDKMessage): Promise<void> {
    // Capture session ID
    if (msg.type === 'system' && msg.subtype === 'init') {
      this.sessionId = msg.session_id;
      setAgentState('executing');

      // Log MCP status
      const mcpServers = (msg as unknown as Record<string, unknown>)
        .mcp_servers as Array<{ name: string; status: string }> | undefined;
      if (mcpServers) {
        this.io.mcpStatus(mcpServers);
      }
    }

    // Track tokens from stream events
    if (msg.type === 'stream_event') {
      const streamMsg = msg as unknown as Record<string, unknown>;
      if (streamMsg.usage) {
        const usage = streamMsg.usage as {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
          cache_creation_input_tokens?: number;
        };
        updateTokenUsage(usage);
        if (usage.input_tokens) {
          this.turnState.turnTokens.input += usage.input_tokens;
        }
        if (usage.output_tokens) {
          this.turnState.turnTokens.output += usage.output_tokens;
        }
      }
    }

    // Update state based on message type
    if (msg.type === 'assistant') {
      await this.handleAssistantMessage(msg);
    }
  }

  /**
   * Handle assistant message
   */
  protected async handleAssistantMessage(msg: SDKMessage): Promise<void> {
    const content = msg.message?.content;
    if (!content || !Array.isArray(content)) return;

    const hasThinking = content.some(b => b.type === 'thinking');
    const hasToolUse = content.some(b => b.type === 'tool_use');

    if (hasThinking) {
      setAgentState('thinking');
    } else if (hasToolUse) {
      const toolBlock = content.find(b => b.type === 'tool_use');
      setAgentState('tool_use', toolBlock?.name);
    } else {
      setAgentState('executing');

      // Log assistant text
      for (const block of content) {
        if (block.type === 'text' && block.text) {
          this.io.assistantOutput(block.text as string);
        }
      }
    }
  }

  /**
   * Build query options for SDK
   */
  protected buildQueryOptions(
    capabilities: CoderCapabilities
  ): Record<string, unknown> {
    const options: Record<string, unknown> = {};

    // Find Claude Code executable
    const claudePath = this.findClaudeCodePath();
    if (claudePath) {
      options.pathToClaudeCodeExecutable = claudePath;
    }

    // Working directory
    options.cwd = this.config.cwd;

    // MCP servers (don't restrict tools when MCP is configured)
    if (Object.keys(capabilities.mcpServers).length > 0) {
      options.mcpServers = capabilities.mcpServers;
    } else {
      options.allowedTools = capabilities.tools;
    }

    // Permission mode
    options.permissionMode = this.config.permissionMode;
    if (this.config.permissionMode === 'bypassPermissions') {
      options.allowDangerouslySkipPermissions = true;
    }

    // Model
    if (this.config.model !== 'inherit') {
      options.model = this.config.model;
    }

    // Limits
    if (this.config.maxTurns) {
      options.maxTurns = this.config.maxTurns;
    }
    if (this.config.maxBudgetUsd) {
      options.maxBudgetUsd = this.config.maxBudgetUsd;
    }

    // System prompt
    if (this.config.useClaudeCodePrompt) {
      options.systemPrompt = {
        type: 'preset',
        preset: 'claude_code',
        append: capabilities.systemPrompt,
      };
    } else {
      options.systemPrompt = capabilities.systemPrompt;
    }

    // Project settings
    if (this.config.loadProjectSettings) {
      options.settingSources = ['project'];
    }

    // Subagents
    if (Object.keys(capabilities.agents).length > 0) {
      options.agents = capabilities.agents;
    }

    // Extended thinking
    if (this.config.enableThinking) {
      options.maxThinkingTokens = this.config.maxThinkingTokens;
    }

    // Session persistence
    if (this.config.persistSession) {
      options.persistSession = true;
    }

    // Session resume
    if (this.config.resumeSession) {
      options.resume = this.config.resumeSession;
    }

    // Import hooks
    options.hooks = this.getHooks();

    return options;
  }

  /**
   * Get hooks for this coder
   */
  protected getHooks(): Record<string, unknown> {
    if (this.config.verbose) {
      return getVerboseHooks();
    } else if (this.config.permissionMode === 'bypassPermissions') {
      return getPermissiveHooks();
    }
    return getDefaultHooks();
  }

  /**
   * Find Claude Code executable path
   */
  protected findClaudeCodePath(): string | undefined {
    const paths = [
      '/opt/homebrew/bin/claude',
      '/usr/local/bin/claude',
      process.env.HOME + '/.local/bin/claude',
      process.env.APPDATA + '/npm/claude.cmd',
    ].filter(Boolean) as string[];

    for (const p of paths) {
      if (existsSync(p)) return p;
    }

    try {
      const result = execSync(
        'which claude 2>/dev/null || where claude 2>/dev/null',
        { encoding: 'utf-8' }
      ).trim();
      if (result) return result.split('\n')[0];
    } catch {
      // Ignore
    }

    return undefined;
  }

  /**
   * Create success result
   */
  protected createSuccessResult(result: string): CoderResult {
    const stats = getCostStats();
    const state = getAgentState();

    return {
      success: true,
      result,
      sessionId: this.sessionId,
      duration: stats.durationMs,
      usage: {
        inputTokens: state.inputTokens || stats.totalInputTokens,
        outputTokens: state.outputTokens || stats.totalOutputTokens,
        cacheReadTokens: state.cacheReadTokens,
        cacheWriteTokens: state.cacheWriteTokens,
      },
      cost: stats.totalCost,
      stats: {
        toolCalls: state.toolCount,
        reflections: this.turnState.reflectionCount,
        filesEdited: this.turnState.editedFiles.size,
        commandsExecuted: this.turnState.executedCommands.length,
      },
    };
  }

  /**
   * Create error result
   */
  protected createErrorResult(error: string): CoderResult {
    const stats = getCostStats();

    return {
      success: false,
      error,
      duration: stats.durationMs,
      usage: {
        inputTokens: stats.totalInputTokens,
        outputTokens: stats.totalOutputTokens,
      },
      cost: stats.totalCost,
      stats: {
        toolCalls: 0,
        reflections: 0,
        filesEdited: 0,
        commandsExecuted: 0,
      },
    };
  }

  /**
   * Check if we've exceeded reflection limit
   */
  protected hasExceededReflectionLimit(): boolean {
    return this.turnState.reflectionCount >= this.config.maxReflections;
  }

  /**
   * Increment reflection count
   */
  protected incrementReflection(): void {
    this.turnState.reflectionCount++;
  }
}
