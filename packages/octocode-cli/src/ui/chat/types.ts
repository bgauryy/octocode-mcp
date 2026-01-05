/**
 * Chat UI Types
 *
 * Type definitions for the interactive chat view components.
 */

export type MessageRole = 'user' | 'assistant' | 'tool' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
  toolName?: string;
  toolResult?: string;
  /** Tool call ID for matching tool results to tool calls */
  toolCallId?: string;
  isStreaming?: boolean;
  durationMs?: number;
  tokens?: {
    input?: number;
    output?: number;
  };
  /** AI thinking/reasoning content (extended thinking) */
  thinking?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'error';
  result?: string;
  error?: string;
  duration?: number;
  startTime?: number;
}

export interface ChatStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalMessages: number;
  totalToolCalls: number;
  sessionStartTime: number;
  lastResponseTime?: number;
  estimatedCost?: number;
}

export interface ChatState {
  messages: ChatMessage[];
  isThinking: boolean;
  currentToolCalls: ToolCall[];
  inputHistory: string[];
  historyIndex: number;
  stats: ChatStats;
  currentModel?: string;
}

export interface ChatConfig {
  verbose: boolean;
  showToolCalls: boolean;
  showTimestamps: boolean;
  maxHistorySize: number;
  theme: ChatTheme;
  /** Show AI thinking/reasoning blocks (default: true) */
  showThinking: boolean;
  /** Max characters to show for tool results (0 = unlimited, default: 500) */
  maxToolResultLength: number;
  /** Max characters to show for thinking blocks (0 = unlimited, default: 1000) */
  maxThinkingLength: number;
}

export interface ChatTheme {
  userColor: string;
  assistantColor: string;
  toolColor: string;
  systemColor: string;
  errorColor: string;
  borderColor: string;
  dimColor: string;
  /** Color for AI thinking blocks */
  thinkingColor: string;
}

export const DEFAULT_THEME: ChatTheme = {
  userColor: 'magenta',
  assistantColor: 'cyan',
  toolColor: 'yellow',
  systemColor: 'blue',
  errorColor: 'red',
  borderColor: 'magenta',
  dimColor: 'gray',
  thinkingColor: 'blueBright',
};

export const DEFAULT_CONFIG: ChatConfig = {
  verbose: true,
  showToolCalls: true,
  showTimestamps: false,
  maxHistorySize: 100,
  theme: DEFAULT_THEME,
  showThinking: true,
  maxToolResultLength: 0, // 0 = unlimited (no truncation)
  maxThinkingLength: 0, // 0 = unlimited (no truncation)
};
