/**
 * Agent Types for octocode-cli
 *
 * Comprehensive type definitions for agent functionality including:
 * - API key management
 * - Agent configuration
 * - Subagent definitions
 * - Hook configurations
 * - Session management
 */

// ============================================
// API Key Types
// ============================================

export type AIProvider =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'bedrock'
  | 'vertex';

export type APIKeySource =
  | 'environment'
  | 'keychain'
  | 'keychain-oauth'
  | 'config-file'
  | 'manual'
  | 'none';

export interface APIKeyResult {
  key: string | null;
  source: APIKeySource;
  provider: AIProvider;
  expiresAt?: number;
  isOAuth?: boolean;
  scopes?: string[];
}

export interface ClaudeCodeOAuthCredentials {
  claudeAiOauth?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string[];
    subscriptionType?: string;
    rateLimitTier?: string;
  };
}

// ============================================
// Agent Configuration Types
// ============================================

export type AgentModel = 'opus' | 'sonnet' | 'haiku' | 'inherit';

export type AgentPermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'plan'
  | 'delegate' // Team leader mode - only Task tool allowed
  | 'dontAsk'; // Don't prompt, deny if not pre-approved

export type AgentTool =
  | 'Read'
  | 'Write'
  | 'Edit'
  | 'Bash'
  | 'Glob'
  | 'Grep'
  | 'WebSearch'
  | 'WebFetch'
  | 'Task'
  | 'TodoWrite'
  | 'AskUserQuestion'
  | 'NotebookEdit'
  | 'ListMcpResources'
  | 'ReadMcpResource';

export interface AgentDefinition {
  /** Natural language description of when to use this agent */
  description: string;
  /** The agent's system prompt defining its role */
  prompt: string;
  /** Allowed tools (inherits all if omitted) */
  tools?: AgentTool[];
  /** Disallowed tools (removed from model's context) */
  disallowedTools?: AgentTool[];
  /** Model override for this agent */
  model?: AgentModel;
  /** Critical system reminder (experimental SDK feature) */
  criticalSystemReminder_EXPERIMENTAL?: string;
}

export interface AgentOptions {
  /** The task/prompt for the agent */
  prompt: string;
  /** Working directory */
  cwd?: string;
  /** AI provider to use */
  provider?: AIProvider;
  /** Allowed tools */
  tools?: AgentTool[];
  /** Disallowed tools */
  disallowedTools?: AgentTool[];
  /** Permission mode */
  permissionMode?: AgentPermissionMode;
  /** Model to use */
  model?: AgentModel;
  /** Fallback model if primary unavailable */
  fallbackModel?: AgentModel;
  /** Maximum turns */
  maxTurns?: number;
  /** Maximum budget in USD */
  maxBudgetUsd?: number;
  /** Maximum thinking tokens for extended thinking */
  maxThinkingTokens?: number;
  /** Custom system prompt */
  systemPrompt?: string;
  /** Use Claude Code system prompt preset */
  useClaudeCodePrompt?: boolean;
  /** Load project settings (CLAUDE.md, etc.) */
  loadProjectSettings?: boolean;
  /** Custom subagents */
  agents?: Record<string, AgentDefinition>;
  /** MCP servers to connect */
  mcpServers?: Record<string, MCPServerConfig>;
  /** Session ID to resume */
  resumeSession?: string;
  /** Enable extended thinking */
  enableThinking?: boolean;
  /** Verbose output */
  verbose?: boolean;
  /** Output format */
  outputFormat?: 'text' | 'json' | 'stream-json';
  /** Additional directories Claude can access beyond cwd */
  additionalDirectories?: string[];
  /** Enable interactive permission prompts (human-in-the-loop) */
  interactive?: boolean;
  /** Enable file checkpointing for rewind capability */
  enableFileCheckpointing?: boolean;
  /** Persist session for later resume */
  persistSession?: boolean;
}

export interface MCPServerConfig {
  type?: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

// ============================================
// Permission Types (Human-in-the-Loop)
// ============================================

/** Permission update destination */
export type PermissionUpdateDestination =
  | 'userSettings'
  | 'projectSettings'
  | 'localSettings'
  | 'session'
  | 'cliArg';

/** Permission behavior */
export type PermissionBehavior = 'allow' | 'deny' | 'ask';

/** Rule for a permission update */
export interface PermissionRuleValue {
  toolName: string;
  ruleContent?: string;
}

/** Permission update configuration */
export type PermissionUpdate =
  | {
      type: 'addRules';
      rules: PermissionRuleValue[];
      behavior: PermissionBehavior;
      destination: PermissionUpdateDestination;
    }
  | {
      type: 'replaceRules';
      rules: PermissionRuleValue[];
      behavior: PermissionBehavior;
      destination: PermissionUpdateDestination;
    }
  | {
      type: 'removeRules';
      rules: PermissionRuleValue[];
      behavior: PermissionBehavior;
      destination: PermissionUpdateDestination;
    }
  | {
      type: 'setMode';
      mode: AgentPermissionMode;
      destination: PermissionUpdateDestination;
    }
  | {
      type: 'addDirectories';
      directories: string[];
      destination: PermissionUpdateDestination;
    }
  | {
      type: 'removeDirectories';
      directories: string[];
      destination: PermissionUpdateDestination;
    };

/** Result of a permission check */
export type PermissionResult =
  | {
      behavior: 'allow';
      updatedInput: Record<string, unknown>;
      updatedPermissions?: PermissionUpdate[];
      toolUseID?: string;
    }
  | {
      behavior: 'deny';
      message: string;
      interrupt?: boolean;
      toolUseID?: string;
    };

/** Options passed to canUseTool callback */
export interface CanUseToolOptions {
  signal: AbortSignal;
  suggestions?: PermissionUpdate[];
  blockedPath?: string;
  decisionReason?: string;
  toolUseID: string;
  agentID?: string;
}

/** Custom permission handler type */
export type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: CanUseToolOptions
) => Promise<PermissionResult>;

// ============================================
// Agent State Types
// ============================================

export type AgentStateType =
  | 'idle'
  | 'initializing'
  | 'connecting_mcp'
  | 'executing'
  | 'thinking'
  | 'tool_use'
  | 'waiting_permission'
  | 'completed'
  | 'error';

export interface AgentStateInfo {
  state: AgentStateType;
  startTime: number;
  lastUpdate: number;
  currentTool?: string;
  toolCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

// ============================================
// Agent Result Types
// ============================================

export interface AgentResult {
  success: boolean;
  result?: string;
  error?: string;
  sessionId?: string;
  usage?: AgentUsage;
  duration?: number;
  cost?: number;
}

export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

// ============================================
// Hook Types
// ============================================

export type HookEventName =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolUseFailure'
  | 'UserPromptSubmit'
  | 'Stop'
  | 'SubagentStart'
  | 'SubagentStop'
  | 'PreCompact'
  | 'SessionStart'
  | 'SessionEnd'
  | 'Notification'
  | 'PermissionRequest';

export interface HookInput {
  hook_event_name: HookEventName;
  session_id: string;
  transcript_path: string;
  cwd: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: unknown;
  error?: string;
  prompt?: string;
  message?: string;
}

export interface HookOutput {
  continue?: boolean;
  stopReason?: string;
  suppressOutput?: boolean;
  systemMessage?: string;
  hookSpecificOutput?: {
    hookEventName: HookEventName;
    permissionDecision?: 'allow' | 'deny' | 'ask';
    permissionDecisionReason?: string;
    updatedInput?: Record<string, unknown>;
    additionalContext?: string;
  };
}

export type HookCallback = (
  input: HookInput,
  toolUseId: string | undefined,
  context: { signal: AbortSignal }
) => Promise<HookOutput>;

export interface HookMatcher {
  matcher?: string;
  hooks: HookCallback[];
  timeout?: number;
}

// ============================================
// Subagent Presets for Octocode
// ============================================

export interface OctocodeSubagents extends Record<string, AgentDefinition> {
  /** Code research and exploration */
  researcher: AgentDefinition;
  /** Code review and quality analysis */
  codeReviewer: AgentDefinition;
  /** Test writing and execution */
  testRunner: AgentDefinition;
  /** Documentation generation */
  docWriter: AgentDefinition;
  /** Security analysis */
  securityAuditor: AgentDefinition;
  /** Refactoring specialist */
  refactorer: AgentDefinition;
}

// ============================================
// Session Management Types
// ============================================

/** Coder mode type (duplicated to avoid circular import) */
export type SessionCoderMode =
  | 'research'
  | 'coding'
  | 'full'
  | 'planning'
  | 'custom';

export interface SessionInfo {
  /** Unique session ID from SDK */
  id: string;
  /** When the session was started */
  startedAt: string;
  /** Last activity timestamp */
  lastActiveAt: string;
  /** Initial prompt that started the session */
  prompt: string;
  /** Truncated prompt for display (max 100 chars) */
  promptPreview: string;
  /** Coder mode used */
  mode: SessionCoderMode;
  /** Session status */
  status: 'active' | 'completed' | 'error';
  /** Total cost in USD */
  totalCost?: number;
  /** Total tokens used */
  totalTokens?: number;
  /** Path to SDK transcript file */
  transcriptPath?: string;
  /** Working directory */
  cwd: string;
  /** AI provider used */
  provider?: AIProvider;
}

/** @deprecated Use SessionInfo instead */
export interface AgentSession {
  id: string;
  startedAt: Date;
  lastActiveAt: Date;
  provider: AIProvider;
  prompt: string;
  status: 'active' | 'completed' | 'error';
  totalCost?: number;
  totalTokens?: number;
}

export interface SessionStore {
  sessions: SessionInfo[];
  activeSessionId?: string;
}

// ============================================
// Message Types (from SDK)
// ============================================

export interface SDKMessage {
  type: 'assistant' | 'user' | 'result' | 'system' | 'stream_event';
  uuid?: string;
  session_id?: string;
  parent_tool_use_id?: string | null;
  result?: string;
  subtype?: string;
  message?: {
    content?: Array<{
      type: string;
      text?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
  };
}
