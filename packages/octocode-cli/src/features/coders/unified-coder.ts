/**
 * Unified Coder
 *
 * A provider-agnostic coder that uses the unified agent loop.
 * Works with any LLM provider (Anthropic, OpenAI, Google, etc.)
 * Same tools, any model.
 */

import type {
  CoderMode,
  CoderConfig,
  CoderCapabilities,
  CoderResult,
} from './types.js';
import {
  DEFAULT_CODER_CONFIG,
  createTurnState,
  type TurnState,
} from './types.js';
import { AgentIO, createAgentIO } from '../agent-io.js';
import {
  resetCostTracker,
  getCostStats,
  resetToolCounter,
  setAgentState,
  getAgentState,
  setStateChangeCallback,
} from '../agent-hooks.js';
import type { ModelId } from '../../types/provider.js';
import type { AgentTool } from '../../types/agent.js';
import {
  runAgentLoop,
  type AgentLoopResult,
  type ToolCallEvent,
} from '../agent-loop/index.js';
import {
  detectDefaultModelId,
  isProviderConfigured,
  parseModelId,
} from '../providers/index.js';
import { RESEARCH_TOOLS, CODING_TOOLS } from '../tools/index.js';
import type { CoreTool } from 'ai';

// ============================================
// Types
// ============================================

/**
 * Unified coder configuration
 */
export interface UnifiedCoderConfig extends Omit<CoderConfig, 'model'> {
  /** Model to use (provider:model format) */
  model?: ModelId;
  /** System prompt override */
  systemPrompt?: string;
}

/**
 * Default configuration for unified coder
 */
const DEFAULT_UNIFIED_CONFIG: UnifiedCoderConfig = {
  ...DEFAULT_CODER_CONFIG,
  model: undefined, // Will be auto-detected
};

// ============================================
// System Prompts
// ============================================

const RESEARCH_SYSTEM_PROMPT = `You are an expert code researcher and analyzer. Your role is to explore, understand, and explain codebases.

Guidelines:
1. Use Read, Glob, ListDir, and Grep to explore the codebase
2. Follow imports and dependencies to understand code flow
3. Identify patterns, conventions, and architecture
4. Provide clear, structured explanations
5. Cite specific files and line numbers when explaining code

Focus on understanding and explaining, not modifying code.`;

const CODING_SYSTEM_PROMPT = `You are an expert software developer. Your role is to implement features, fix bugs, and improve code quality.

Guidelines:
1. Read and understand existing code before making changes
2. Follow existing patterns and conventions
3. Write clean, maintainable code
4. Test your changes when possible
5. Explain your changes and reasoning

Focus on correct, efficient implementations that follow best practices.`;

const FULL_SYSTEM_PROMPT = `You are an expert software developer with full capabilities. You can research code, implement features, fix bugs, run commands, and explain your work.

Guidelines:
1. Start by understanding the existing codebase
2. Plan your approach before making changes
3. Follow existing patterns and conventions
4. Write clean, maintainable code
5. Test and verify your changes
6. Explain your work clearly

You have full access to read files, write files, edit code, and run shell commands.`;

const PLANNING_SYSTEM_PROMPT = `You are an expert software architect. Your role is to analyze requirements, design solutions, and create detailed implementation plans.

Guidelines:
1. Understand the requirements thoroughly
2. Analyze the existing codebase structure
3. Identify potential challenges and solutions
4. Create step-by-step implementation plans
5. Consider edge cases and error handling
6. Document your plan clearly

Focus on planning and design, not implementation.`;

// ============================================
// UnifiedCoder Class
// ============================================

/**
 * Unified Coder - works with any LLM provider
 */
export class UnifiedCoder {
  readonly mode: CoderMode;
  protected config: UnifiedCoderConfig;
  protected io: AgentIO;
  protected turnState: TurnState;
  protected sessionId?: string;
  protected results: string[] = [];

  constructor(mode: CoderMode, config: Partial<UnifiedCoderConfig> = {}) {
    this.mode = mode;
    this.config = {
      ...DEFAULT_UNIFIED_CONFIG,
      ...config,
      mode,
    };
    this.io = createAgentIO({
      verbose: this.config.verbose,
      showLiveStats: this.config.verbose,
    });
    this.turnState = createTurnState();
  }

  /**
   * Get capabilities for this mode
   */
  getCapabilities(): CoderCapabilities {
    const baseCapabilities = {
      mcpServers: {},
      agents: {},
      settings: {
        canEdit: this.mode !== 'research',
        canExecute: this.mode !== 'research',
        canAccessWeb: false,
        readOnly: this.mode === 'research',
      },
    };

    const researchTools: AgentTool[] = ['Read', 'Glob', 'Grep'];
    const codingTools: AgentTool[] = [
      'Read',
      'Write',
      'Edit',
      'Bash',
      'Glob',
      'Grep',
    ];

    switch (this.mode) {
      case 'research':
        return {
          ...baseCapabilities,
          tools: researchTools,
          systemPrompt: RESEARCH_SYSTEM_PROMPT,
        };
      case 'coding':
        return {
          ...baseCapabilities,
          tools: codingTools,
          systemPrompt: CODING_SYSTEM_PROMPT,
        };
      case 'full':
        return {
          ...baseCapabilities,
          tools: codingTools,
          systemPrompt: FULL_SYSTEM_PROMPT,
        };
      case 'planning':
        return {
          ...baseCapabilities,
          tools: researchTools,
          systemPrompt: PLANNING_SYSTEM_PROMPT,
        };
      default:
        return {
          ...baseCapabilities,
          tools: codingTools,
          systemPrompt: FULL_SYSTEM_PROMPT,
        };
    }
  }

  /**
   * Get system prompt for this mode
   */
  protected getSystemPrompt(): string {
    if (this.config.systemPrompt) {
      return this.config.systemPrompt;
    }

    switch (this.mode) {
      case 'research':
        return RESEARCH_SYSTEM_PROMPT;
      case 'coding':
        return CODING_SYSTEM_PROMPT;
      case 'full':
        return FULL_SYSTEM_PROMPT;
      case 'planning':
        return PLANNING_SYSTEM_PROMPT;
      default:
        return FULL_SYSTEM_PROMPT;
    }
  }

  /**
   * Get tools for this mode
   */
  protected getTools(): Record<string, CoreTool> {
    switch (this.mode) {
      case 'research':
      case 'planning':
        return RESEARCH_TOOLS;
      case 'coding':
      case 'full':
      default:
        return CODING_TOOLS;
    }
  }

  /**
   * Check if the coder is ready to run
   */
  async checkReadiness(): Promise<{ ready: boolean; message: string }> {
    // Get model to use
    const modelId = this.config.model ?? detectDefaultModelId();
    if (!modelId) {
      return {
        ready: false,
        message:
          'No AI provider configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or another provider API key.',
      };
    }

    // Check if provider is configured
    const parsed = parseModelId(modelId);
    if (!parsed) {
      return {
        ready: false,
        message: `Invalid model ID: ${modelId}`,
      };
    }

    if (!isProviderConfigured(parsed.provider)) {
      return {
        ready: false,
        message: `Provider ${parsed.provider} is not configured. Set the appropriate API key.`,
      };
    }

    return { ready: true, message: 'Agent ready' };
  }

  /**
   * Run the coder with a prompt
   */
  async run(prompt: string): Promise<CoderResult> {
    this.resetTracking();
    setAgentState('initializing');

    if (this.config.verbose) {
      setStateChangeCallback(state => {
        this.io.stateChange(state);
      });
    }

    const readiness = await this.checkReadiness();
    if (!readiness.ready) {
      setAgentState('error');
      setStateChangeCallback(null);
      return this.createErrorResult(readiness.message);
    }

    try {
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
   * Run the unified agent loop
   */
  protected async runAgentLoop(prompt: string): Promise<CoderResult> {
    const modelId = this.config.model ?? detectDefaultModelId();
    if (!modelId) {
      throw new Error('No model configured');
    }

    setAgentState('executing');

    const result = await runAgentLoop({
      model: modelId,
      prompt,
      systemPrompt: this.getSystemPrompt(),
      tools: this.getTools(),
      maxSteps: this.config.maxTurns ?? 50,
      cwd: this.config.cwd,
      onToolCall: (event: ToolCallEvent) => {
        setAgentState('tool_use', event.toolName);
        if (this.config.verbose) {
          const argsStr = JSON.stringify(event.args, null, 2);
          this.io.toolOutput(`Tool: ${event.toolName}\n${argsStr}`);
        }
        this.turnState.executedCommands.push(event.toolName);
      },
      onText: (text: string) => {
        if (this.config.verbose) {
          this.io.assistantOutput(text);
        }
      },
      stream: true,
    });

    setAgentState('completed');
    setStateChangeCallback(null);

    if (result.success) {
      return this.createSuccessResult(result);
    } else {
      return this.createErrorResult(result.error ?? 'Unknown error');
    }
  }

  /**
   * Reset tracking state
   */
  protected resetTracking(): void {
    resetCostTracker();
    resetToolCounter();
    this.turnState = createTurnState();
    this.results = [];
    this.sessionId = undefined;
    this.io.resetCounters();
  }

  /**
   * Create success result
   */
  protected createSuccessResult(result: AgentLoopResult): CoderResult {
    const stats = getCostStats();
    const state = getAgentState();

    return {
      success: true,
      result: result.text,
      sessionId: this.sessionId,
      duration: stats.durationMs,
      usage: {
        inputTokens: result.usage.inputTokens || stats.totalInputTokens,
        outputTokens: result.usage.outputTokens || stats.totalOutputTokens,
        cacheReadTokens: state.cacheReadTokens,
        cacheWriteTokens: state.cacheWriteTokens,
      },
      cost: stats.totalCost,
      stats: {
        toolCalls: result.toolCalls.length,
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
   * Update configuration
   */
  updateConfig(config: Partial<UnifiedCoderConfig>): void {
    this.config = { ...this.config, ...config };
    this.io.updateConfig({
      verbose: this.config.verbose,
      showLiveStats: this.config.verbose,
    });
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a research coder
 */
export function createResearchCoder(
  config?: Partial<UnifiedCoderConfig>
): UnifiedCoder {
  return new UnifiedCoder('research', config);
}

/**
 * Create a coding coder
 */
export function createCodingCoder(
  config?: Partial<UnifiedCoderConfig>
): UnifiedCoder {
  return new UnifiedCoder('coding', config);
}

/**
 * Create a full capabilities coder
 */
export function createFullCoder(
  config?: Partial<UnifiedCoderConfig>
): UnifiedCoder {
  return new UnifiedCoder('full', config);
}

/**
 * Create a planning coder
 */
export function createPlanningCoder(
  config?: Partial<UnifiedCoderConfig>
): UnifiedCoder {
  return new UnifiedCoder('planning', config);
}
