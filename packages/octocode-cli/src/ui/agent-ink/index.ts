/**
 * Agent Ink UI
 *
 * Interactive Ink-based UI for agent execution.
 * Provides a rich terminal experience with real-time updates.
 */

export { AgentView } from './AgentView.js';
export { useAgent } from './useAgent.js';
export { runAgentUI } from './runAgentUI.js';
export {
  useBackgroundTasks,
  useTaskStatus,
  useTaskNotification,
} from './useBackgroundTasks.js';
export type {
  AgentUIState,
  AgentUIConfig,
  AgentTheme,
  AgentStateType,
  AgentToolCall,
  AgentMessage,
  AgentStats,
  AgentContentLimits,
  BackgroundTaskInfo,
} from './types.js';
export {
  DEFAULT_AGENT_CONFIG,
  DEFAULT_AGENT_THEME,
  DEFAULT_CONTENT_LIMITS,
} from './types.js';
