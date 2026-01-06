/**
 * Agent Ink UI
 *
 * Interactive Ink-based UI for agent execution.
 * Provides a rich terminal experience with real-time updates.
 */

export { AgentView } from './AgentView.js';
export { useAgent } from './useAgent.js';
export { runAgentUI } from './runAgentUI.js';
export { PermissionDialog } from './PermissionDialog.js';
export {
  useBackgroundTasks,
  useTaskStatus,
  useTaskNotification,
} from './useBackgroundTasks.js';
export {
  useTerminalSize,
  useResponsiveLayout,
  getLayoutMode,
  getContentWidth,
  LAYOUT_BREAKPOINTS,
} from './useTerminalSize.js';
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
  PendingPermission,
} from './types.js';
export type { TerminalSize, LayoutMode } from './useTerminalSize.js';
export {
  DEFAULT_AGENT_CONFIG,
  DEFAULT_AGENT_THEME,
  DEFAULT_CONTENT_LIMITS,
  BORDER_STYLES,
} from './types.js';
export type { BorderCharacters } from './borders.js';
export {
  DASHED_BORDER,
  STANDARD_BORDER,
  ROUNDED_BORDER,
  DOUBLE_BORDER,
  QUOTE_BORDER,
  DASHED_QUOTE_BORDER,
  renderLeftBorder,
  renderDashedLeftBorder,
  horizontalRule,
  dashedHorizontalRule,
  wrapInBox,
  wrapInDashedBox,
} from './borders.js';
