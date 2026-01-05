/**
 * Coder Types - Type definitions for the modular coder system
 */

import type {
  AgentModel,
  AgentPermissionMode,
  AgentTool,
  AgentDefinition,
  MCPServerConfig,
  AgentStateInfo,
} from '../../types/agent.js';
import type { AgentIO } from '../agent-io.js';

// ============================================
// Coder Mode Types
// ============================================

export type CoderMode = 'research' | 'coding' | 'full' | 'planning' | 'custom';

// ============================================
// Coder Configuration
// ============================================

export interface CoderConfig {
  /** Agent mode */
  mode: CoderMode;
  /** Model to use */
  model: AgentModel;
  /** Permission mode */
  permissionMode: AgentPermissionMode;
  /** Enable extended thinking */
  enableThinking: boolean;
  /** Max thinking tokens */
  maxThinkingTokens: number;
  /** Verbose output */
  verbose: boolean;
  /** Working directory */
  cwd: string;
  /** Maximum reflection attempts */
  maxReflections: number;
  /** Maximum turns */
  maxTurns?: number;
  /** Maximum budget in USD */
  maxBudgetUsd?: number;
  /** Use Claude Code system prompt */
  useClaudeCodePrompt: boolean;
  /** Load project settings (CLAUDE.md) */
  loadProjectSettings: boolean;
  /** Persist session for later resume */
  persistSession?: boolean;
  /** Session ID to resume */
  resumeSession?: string;
}

export const DEFAULT_CODER_CONFIG: CoderConfig = {
  mode: 'research',
  model: 'sonnet',
  permissionMode: 'default',
  enableThinking: false,
  maxThinkingTokens: 16000,
  verbose: true,
  cwd: process.cwd(),
  maxReflections: 3,
  useClaudeCodePrompt: true,
  loadProjectSettings: true,
};

// ============================================
// Coder Capabilities
// ============================================

export interface CoderCapabilities {
  /** Tools available to this coder */
  tools: AgentTool[];
  /** Subagents available */
  agents: Record<string, AgentDefinition>;
  /** MCP servers to connect */
  mcpServers: Record<string, MCPServerConfig>;
  /** System prompt for this mode */
  systemPrompt: string;
  /** Mode-specific settings */
  settings: {
    /** Can make file changes */
    canEdit: boolean;
    /** Can execute commands */
    canExecute: boolean;
    /** Can access web */
    canAccessWeb: boolean;
    /** Read-only mode */
    readOnly: boolean;
  };
}

// ============================================
// Turn State (Per-Message State)
// ============================================

export interface TurnState {
  /** Files edited in this turn */
  editedFiles: Set<string>;
  /** Commands executed in this turn */
  executedCommands: string[];
  /** Reflection count for this turn */
  reflectionCount: number;
  /** Tokens for this turn */
  turnTokens: {
    input: number;
    output: number;
  };
  /** Lint outcome for this turn */
  lintOutcome: 'pass' | 'fail' | null;
  /** Test outcome for this turn */
  testOutcome: 'pass' | 'fail' | null;
  /** Start time for this turn */
  startTime: number;
}

export function createTurnState(): TurnState {
  return {
    editedFiles: new Set(),
    executedCommands: [],
    reflectionCount: 0,
    turnTokens: { input: 0, output: 0 },
    lintOutcome: null,
    testOutcome: null,
    startTime: Date.now(),
  };
}

// ============================================
// Coder Context
// ============================================

export interface CoderContext {
  /** Configuration */
  config: CoderConfig;
  /** IO handler */
  io: AgentIO;
  /** Current turn state */
  turnState: TurnState;
  /** Session state */
  sessionState: AgentStateInfo;
  /** Session ID */
  sessionId?: string;
  /** Accumulated results */
  results: string[];
}

// ============================================
// Coder Result
// ============================================

export interface CoderResult {
  success: boolean;
  result?: string;
  error?: string;
  sessionId?: string;
  duration: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  };
  stats: {
    toolCalls: number;
    reflections: number;
    filesEdited: number;
    commandsExecuted: number;
  };
}

// ============================================
// Coder Interface
// ============================================

export interface ICoder {
  /** Coder mode */
  readonly mode: CoderMode;
  /** Get capabilities for this coder */
  getCapabilities(): CoderCapabilities;
  /** Run the coder with a prompt */
  run(prompt: string): Promise<CoderResult>;
  /** Get current context */
  getContext(): CoderContext;
  /** Reset turn state */
  resetTurn(): void;
}
