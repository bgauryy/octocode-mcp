/**
 * Agent UI Types
 *
 * Type definitions for the interactive agent view components.
 */

export type AgentStateType =
  | 'idle'
  | 'waiting_for_input'
  | 'initializing'
  | 'connecting_mcp'
  | 'executing'
  | 'thinking'
  | 'tool_use'
  | 'formulating_answer' // Agent preparing final response
  | 'waiting_permission'
  | 'completed'
  | 'error';

export interface AgentToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'error';
  result?: string;
  error?: string;
  duration?: number;
  startTime: number;
  /** Whether the tool call display is collapsed (for completed tools) */
  collapsed?: boolean;
}

export interface AgentMessage {
  id: string;
  type: 'thinking' | 'text' | 'tool' | 'result' | 'system' | 'error';
  content: string;
  timestamp: Date;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  duration?: number;
  /** True while content is being streamed */
  isStreaming?: boolean;
}

export interface AgentStats {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  toolCount: number;
  startTime: number;
  lastUpdate: number;
}

/**
 * Background task display info for UI
 */
export interface BackgroundTaskInfo {
  id: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'killed';
  promptPreview: string;
  startTime: number;
  endTime?: number;
  summary?: string;
  error?: string;
}

/**
 * Pending permission request for tool execution
 */
export interface PendingPermission {
  /** Tool call ID */
  toolId: string;
  /** Tool name requiring permission */
  toolName: string;
  /** Tool arguments */
  toolArgs?: Record<string, unknown>;
  /** Human-readable description of what the tool will do */
  description?: string;
}

export interface AgentUIState {
  state: AgentStateType;
  messages: AgentMessage[];
  currentToolCalls: AgentToolCall[];
  stats: AgentStats;
  task: string;
  mode: string;
  model?: string;
  result?: string;
  error?: string;
  /** Background tasks spawned by this agent */
  backgroundTasks?: BackgroundTaskInfo[];
  /** Pending permission request when state is 'waiting_permission' */
  pendingPermission?: PendingPermission;
}

/**
 * Content truncation limits for the agent UI.
 * Set to 0 or Infinity to disable truncation.
 */
export interface AgentContentLimits {
  /** Max characters for thinking blocks (0 = no limit) */
  maxThinkingChars: number;
  /** Max characters for text output (0 = no limit) */
  maxTextChars: number;
  /** Max characters for tool results (0 = no limit) */
  maxToolResultChars: number;
}

export interface AgentUIConfig {
  verbose: boolean;
  showToolCalls: boolean;
  showThinking: boolean;
  maxMessages: number;
  theme: AgentTheme;
  /** Content truncation limits */
  contentLimits: AgentContentLimits;
}

export interface AgentTheme {
  primaryColor: string;
  successColor: string;
  errorColor: string;
  warningColor: string;
  infoColor: string;
  dimColor: string;
  borderColor: string;
  thinkingColor: string;
  toolColor: string;
}

/**
 * Border style presets for different UI contexts.
 * Provides visual hierarchy and semantic meaning.
 */
export const BORDER_STYLES = {
  /** Primary input areas and main containers */
  primary: 'round',
  /** Secondary panels and tool calls */
  secondary: 'single',
  /** Thinking blocks (dimmed) */
  thinking: 'single',
  /** Error states */
  error: 'double',
  /** Permission dialogs (highlighted) */
  permission: 'round',
} as const;

export type BorderStyleType = keyof typeof BORDER_STYLES;

export const DEFAULT_AGENT_THEME: AgentTheme = {
  primaryColor: 'blue',
  successColor: 'green',
  errorColor: 'red',
  warningColor: 'yellow',
  infoColor: 'cyan',
  dimColor: 'gray',
  borderColor: 'gray',
  thinkingColor: 'magenta',
  toolColor: 'cyan',
};

export const DEFAULT_CONTENT_LIMITS: AgentContentLimits = {
  maxThinkingChars: 0, // No limit
  maxTextChars: 0, // No limit
  maxToolResultChars: 0, // No limit - show full tool results
};

export const DEFAULT_AGENT_CONFIG: AgentUIConfig = {
  verbose: true,
  showToolCalls: true,
  showThinking: true,
  maxMessages: 0, // No limit - keep all messages
  theme: DEFAULT_AGENT_THEME,
  contentLimits: DEFAULT_CONTENT_LIMITS,
};
