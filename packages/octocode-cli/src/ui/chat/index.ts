/**
 * Chat UI Module
 *
 * Interactive chat interface for Octocode CLI using Ink (React for CLI).
 */

export { ChatView } from './ChatView.js';
export { ChatInput } from './ChatInput.js';
export { MessageBubble } from './MessageBubble.js';
export { ToolCallDisplay } from './ToolCallDisplay.js';
export { StatusBar } from './StatusBar.js';
export { useChat } from './useChat.js';
export { runChat } from './runChat.js';
export type {
  ChatMessage,
  ChatState,
  ChatStats,
  ChatConfig,
  ChatTheme,
  ToolCall,
  MessageRole,
} from './types.js';
export { DEFAULT_CONFIG, DEFAULT_THEME } from './types.js';
