/**
 * AgentView Component
 *
 * Main interactive agent interface using Ink (React for CLI).
 * Features:
 * - Real-time agent state display
 * - Tool call visualization with spinners
 * - Message streaming
 * - Token and cost tracking
 * - Keyboard shortcuts
 */

import React, { useEffect, useState, useMemo } from 'react';
import { Box, Text, useApp, useInput, Static } from 'ink';
import { Spinner, TextInput } from '@inkjs/ui';
import type {
  AgentUIConfig,
  AgentUIState,
  AgentTheme,
  AgentStateType,
  AgentMessage,
  BackgroundTaskInfo,
} from './types.js';
import { DEFAULT_AGENT_CONFIG } from './types.js';

// ============================================
// Animation Components
// ============================================

/**
 * Pulsing dot indicator for active states
 */
function PulsingIndicator({
  color = 'cyan',
}: {
  color?: string;
}): React.ReactElement {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setPhase(p => (p + 1) % 4);
    }, 250);
    return () => clearInterval(timer);
  }, []);

  const dots = ['●', '◉', '○', '◉'];
  return <Text color={color}>{dots[phase]}</Text>;
}

/**
 * Typing dots animation for "preparing answer" state
 */
function TypingDots({
  color = 'white',
}: {
  color?: string;
}): React.ReactElement {
  const [dots, setDots] = useState('');

  useEffect(() => {
    const timer = setInterval(() => {
      setDots(d => (d.length >= 3 ? '' : d + '.'));
    }, 400);
    return () => clearInterval(timer);
  }, []);

  return <Text color={color}>{dots.padEnd(3, ' ')}</Text>;
}

/**
 * Background Tasks Panel - displays running/completed background tasks
 */
function BackgroundTasksPanel({
  tasks,
  theme,
}: {
  tasks: BackgroundTaskInfo[];
  theme: AgentTheme;
}): React.ReactElement | null {
  if (!tasks || tasks.length === 0) return null;

  // Sort by status (running first) then by start time (newest first)
  const sortedTasks = [...tasks].sort((a, b) => {
    const statusOrder = { running: 0, pending: 1, completed: 2, failed: 3, killed: 4 };
    const orderA = statusOrder[a.status] ?? 5;
    const orderB = statusOrder[b.status] ?? 5;
    if (orderA !== orderB) return orderA - orderB;
    return b.startTime - a.startTime;
  });

  const runningCount = tasks.filter(
    t => t.status === 'running' || t.status === 'pending'
  ).length;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={runningCount > 0 ? theme.warningColor : theme.dimColor}
      paddingX={1}
      marginX={1}
    >
      <Text bold color={runningCount > 0 ? theme.warningColor : theme.dimColor}>
        📋 Background Tasks ({runningCount} running, {tasks.length} total)
      </Text>
      {sortedTasks.slice(0, 5).map(task => (
        <BackgroundTaskLine key={task.id} task={task} theme={theme} />
      ))}
      {tasks.length > 5 && (
        <Text color={theme.dimColor}>
          ... and {tasks.length - 5} more tasks
        </Text>
      )}
    </Box>
  );
}

/**
 * Single background task display line
 */
function BackgroundTaskLine({
  task,
  theme,
}: {
  task: BackgroundTaskInfo;
  theme: AgentTheme;
}): React.ReactElement {
  const elapsed = task.endTime
    ? task.endTime - task.startTime
    : Date.now() - task.startTime;
  const elapsedStr = formatDuration(Math.floor(elapsed / 1000));

  const statusIcons: Record<string, string> = {
    pending: '⏳',
    running: '🔄',
    completed: '✅',
    failed: '❌',
    killed: '⛔',
  };

  const statusColors: Record<string, string> = {
    pending: theme.warningColor,
    running: theme.infoColor,
    completed: theme.successColor,
    failed: theme.errorColor,
    killed: theme.dimColor,
  };

  return (
    <Box flexDirection="column" marginLeft={1}>
      <Box>
        {task.status === 'running' ? (
          <Spinner />
        ) : (
          <Text color={statusColors[task.status]}>{statusIcons[task.status]}</Text>
        )}
        <Text> </Text>
        <Text color={statusColors[task.status]} bold>
          {task.id}
        </Text>
        <Text color={theme.dimColor}> [{task.type}] </Text>
        <Text color={theme.dimColor}>({elapsedStr})</Text>
      </Box>
      <Box marginLeft={2}>
        <Text color={theme.dimColor}>
          {task.promptPreview.length > 60
            ? task.promptPreview.slice(0, 60) + '...'
            : task.promptPreview}
        </Text>
      </Box>
      {task.status === 'completed' && task.summary && (
        <Box marginLeft={2}>
          <Text color={theme.successColor}>→ {task.summary}</Text>
        </Box>
      )}
      {task.status === 'failed' && task.error && (
        <Box marginLeft={2}>
          <Text color={theme.errorColor}>→ {task.error}</Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Progress bar component (exported for use in other components)
 */
export function ProgressBar({
  progress,
  width = 20,
  color = 'cyan',
  showPercent = true,
}: {
  progress: number;
  width?: number;
  color?: string;
  showPercent?: boolean;
}): React.ReactElement {
  const filled = Math.round(Math.min(1, Math.max(0, progress)) * width);
  const empty = width - filled;
  return (
    <Text>
      <Text color={color}>{'█'.repeat(filled)}</Text>
      <Text color="gray">{'░'.repeat(empty)}</Text>
      {showPercent && <Text color="gray"> {Math.round(progress * 100)}%</Text>}
    </Text>
  );
}

/**
 * Animated state indicator based on current state
 */
function StateIndicator({
  state,
  theme,
}: {
  state: AgentStateType;
  theme: AgentTheme;
}): React.ReactElement {
  const stateConfig: Record<
    AgentStateType,
    { icon: string; color: string; animated: boolean; type: string }
  > = {
    idle: { icon: '⏸', color: theme.dimColor, animated: false, type: 'static' },
    waiting_for_input: {
      icon: '✏️',
      color: theme.primaryColor,
      animated: true,
      type: 'pulse',
    },
    initializing: {
      icon: '🔄',
      color: theme.infoColor,
      animated: true,
      type: 'spinner',
    },
    connecting_mcp: {
      icon: '🔌',
      color: theme.infoColor,
      animated: true,
      type: 'spinner',
    },
    executing: {
      icon: '⚡',
      color: theme.warningColor,
      animated: true,
      type: 'pulse',
    },
    thinking: {
      icon: '🧠',
      color: theme.thinkingColor,
      animated: true,
      type: 'pulse',
    },
    tool_use: {
      icon: '🔧',
      color: theme.toolColor,
      animated: true,
      type: 'spinner',
    },
    formulating_answer: {
      icon: '✍️',
      color: theme.successColor,
      animated: true,
      type: 'dots',
    },
    waiting_permission: {
      icon: '⏳',
      color: theme.warningColor,
      animated: true,
      type: 'pulse',
    },
    completed: {
      icon: '✅',
      color: theme.successColor,
      animated: false,
      type: 'static',
    },
    error: {
      icon: '❌',
      color: theme.errorColor,
      animated: false,
      type: 'static',
    },
  };

  const config = stateConfig[state];

  return (
    <Box>
      <Text>{config.icon} </Text>
      {config.animated && config.type === 'pulse' && (
        <PulsingIndicator color={config.color} />
      )}
      {config.animated && config.type === 'spinner' && <Spinner />}
      {config.animated && config.type === 'dots' && (
        <TypingDots color={config.color} />
      )}
    </Box>
  );
}

/**
 * Safely stringify and truncate tool args for display
 */
function formatToolArgs(
  args: Record<string, unknown> | undefined,
  maxChars: number = 1000
): string {
  if (!args) return '';
  try {
    const str = JSON.stringify(args);
    if (str.length <= maxChars) return str;
    const truncated = str.length - maxChars;
    return (
      str.slice(0, maxChars) +
      `... [${truncated.toLocaleString()} chars truncated]`
    );
  } catch {
    return '[Unable to display args]';
  }
}

interface AgentViewProps {
  state: AgentUIState;
  config?: Partial<AgentUIConfig>;
  onCancel?: () => void;
  onTaskSubmit?: (task: string) => void;
}

// State labels for display text
const STATE_LABELS: Record<string, string> = {
  idle: 'Idle',
  waiting_for_input: 'Ready',
  initializing: 'Initializing...',
  connecting_mcp: 'Connecting MCP...',
  executing: 'Executing',
  thinking: 'Thinking...',
  tool_use: 'Using Tool',
  formulating_answer: 'Preparing Answer...',
  waiting_permission: 'Awaiting Permission',
  completed: 'Completed',
  error: 'Error',
};

export function AgentView({
  state,
  config = {},
  onCancel,
  onTaskSubmit,
}: AgentViewProps): React.ReactElement {
  const { exit } = useApp();

  // Merge config with defaults
  const initialConfig: AgentUIConfig = { ...DEFAULT_AGENT_CONFIG, ...config };

  // Local state for toggles
  const [showThinking, setShowThinking] = useState(initialConfig.showThinking);
  const [showTools, setShowTools] = useState(initialConfig.showToolCalls);
  const theme = initialConfig.theme;

  const [, forceUpdate] = useState(0);
  const [inputValue, setInputValue] = useState('');
  const [inputKey, setInputKey] = useState(0);

  // Only force update when agent is actively running (not idle/waiting/completed)
  const isActiveState = ![
    'idle',
    'waiting_for_input',
    'completed',
    'error',
  ].includes(state.state);
  useEffect(() => {
    if (!isActiveState) return;
    const interval = setInterval(() => forceUpdate(n => n + 1), 1000);
    return () => clearInterval(interval);
  }, [isActiveState]);

  // Separate completed messages from streaming for proper rendering
  // Static items render once and stay in terminal scrollback
  // Streaming messages need to update dynamically
  const { completedMessages, streamingMessage } = useMemo(() => {
    const completed: AgentMessage[] = [];
    let streaming: AgentMessage | null = null;

    for (const msg of state.messages) {
      // Filter out hidden messages
      if (msg.type === 'thinking' && !showThinking) continue;
      if (msg.type === 'result' && msg.toolName) continue;

      if (msg.isStreaming) {
        streaming = msg;
      } else {
        completed.push(msg);
      }
    }

    return { completedMessages: completed, streamingMessage: streaming };
  }, [state.messages, showThinking]);

  // Handle keyboard shortcuts when agent is running
  // Only active when NOT waiting for input (TextInput handles its own keys)
  useInput(
    (input, key) => {
      // Ctrl+C to cancel/exit
      if (input === 'c' && key.ctrl) {
        onCancel?.();
        exit();
      }

      // Toggles (only when not in input mode to avoid interfering with typing)
      if (input === 't') {
        setShowThinking(prev => !prev);
      }
      if (input === 'l') {
        // 'l' for log/tools
        setShowTools(prev => !prev);
      }
    },
    { isActive: state.state !== 'waiting_for_input' }
  );

  // Handle Ctrl+C when waiting for input (exit the app)
  useInput(
    (input, key) => {
      if (input === 'c' && key.ctrl) {
        onCancel?.();
        exit();
      }
    },
    { isActive: state.state === 'waiting_for_input' }
  );

  // Handle task submission
  const handleTaskSubmit = (value: string) => {
    const trimmed = value.trim();
    if (trimmed && onTaskSubmit) {
      onTaskSubmit(trimmed);
      setInputValue(''); // Clear input after submit
      setInputKey(prev => prev + 1); // Force input reset
    }
  };

  // Calculate elapsed time
  const elapsedSeconds = Math.floor(
    (Date.now() - state.stats.startTime) / 1000
  );
  const elapsedStr = formatDuration(elapsedSeconds);

  // Calculate total tokens
  const totalTokens = state.stats.inputTokens + state.stats.outputTokens;

  return (
    <Box flexDirection="column">
      {/* Header - NOT in Static because it contains dynamic content (animations) */}
      <Box
        borderStyle="single"
        borderColor={theme.borderColor}
        paddingX={1}
        flexDirection="row"
        justifyContent="space-between"
      >
        <Box>
          <Text bold color={theme.primaryColor}>
            🐙 Octocode
          </Text>
          <Text color={theme.dimColor}> | </Text>
          <Text color={theme.infoColor}>
            {getModeIcon(state.mode)} {state.mode}
          </Text>
          {state.model && <Text color={theme.dimColor}> | {state.model}</Text>}
        </Box>

        <Box>
          <StateIndicator state={state.state} theme={theme} />
          <Text color={theme.dimColor}> {STATE_LABELS[state.state]}</Text>
          <Text color={theme.dimColor}>
            {' '}
            | Ctrl+C to{' '}
            {state.state === 'waiting_for_input' ? 'exit' : 'cancel'}
          </Text>
          <Text color={theme.dimColor}> | [t] Think [l] Tools</Text>
        </Box>
      </Box>

      {/* Task Display (only if running or completed) */}
      {state.task && (
        <Box paddingX={1} marginY={0}>
          <Text color={theme.dimColor}>Task: </Text>
          <Text>
            {state.task.length > 80
              ? state.task.slice(0, 80) + '...'
              : state.task}
          </Text>
        </Box>
      )}

      {/* Messages Area - Using Static for native terminal scrolling */}
      {state.messages.length === 0 && state.state === 'waiting_for_input' ? (
        <Box
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
          paddingY={2}
        >
          <Text color={theme.dimColor}>
            Enter a task below to start the agent.
          </Text>
          <Text color={theme.dimColor}>
            Examples: "Explore the auth module", "Find all TODO comments"
          </Text>
        </Box>
      ) : state.messages.length === 0 ? (
        <Box justifyContent="center" alignItems="center" paddingY={2}>
          {state.state === 'initializing' ||
          state.state === 'connecting_mcp' ? (
            <Spinner label="Starting agent..." />
          ) : (
            <Text color={theme.dimColor}>Waiting for agent output...</Text>
          )}
        </Box>
      ) : (
        <>
          {/* Completed messages - rendered once via Static */}
          {completedMessages.length > 0 && (
            <Static items={completedMessages}>
              {(message: AgentMessage) => (
                <Box key={message.id} paddingX={1}>
                  <MessageLine
                    message={message}
                    theme={theme}
                    showThinking={showThinking}
                  />
                </Box>
              )}
            </Static>
          )}

          {/* Streaming message - NOT in Static so it updates in real-time */}
          {streamingMessage && (
            <Box paddingX={1}>
              <MessageLine
                message={streamingMessage}
                theme={theme}
                showThinking={showThinking}
              />
            </Box>
          )}
        </>
      )}

      {/* Final Result Display - REMOVED
         The streaming message already shows the final answer content.
         Keeping this box would cause duplicate display of the same text.
         The completion is indicated by the state indicator in the header. */}

      {/* Active Tool Calls */}
      {showTools && state.currentToolCalls.length > 0 && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor={theme.toolColor}
          paddingX={1}
          marginX={1}
        >
          <Text bold color={theme.toolColor}>
            🔧 Active Tools
          </Text>
          {state.currentToolCalls.slice(0, 5).map(tool => (
            <ToolCallLine key={tool.id} tool={tool} theme={theme} />
          ))}
        </Box>
      )}

      {/* Background Tasks Panel */}
      {state.backgroundTasks && state.backgroundTasks.length > 0 && (
        <BackgroundTasksPanel tasks={state.backgroundTasks} theme={theme} />
      )}

      {/* Input Area (when waiting for input) */}
      {state.state === 'waiting_for_input' && (
        <Box
          borderStyle="round"
          borderColor={theme.primaryColor}
          paddingX={1}
          paddingY={0}
          marginTop={0}
        >
          <Text color={theme.primaryColor}>→ </Text>
          <TextInput
            key={inputKey}
            placeholder="What would you like me to do?"
            defaultValue={inputValue}
            onChange={setInputValue}
            onSubmit={handleTaskSubmit}
          />
        </Box>
      )}

      {/* Status Bar */}
      <Box
        borderStyle="single"
        borderColor={theme.borderColor}
        paddingX={1}
        justifyContent="space-between"
        marginTop={state.state === 'waiting_for_input' ? 0 : 1}
      >
        <Box>
          <Text color={theme.dimColor}>
            🎯 {totalTokens.toLocaleString()} tok | 🔧 {state.stats.toolCount} |
            ⏱ {elapsedStr}
          </Text>
        </Box>
        <Box>
          <Text color={theme.dimColor}>Scroll: mouse/touchpad</Text>
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Message line component
 */
interface MessageLineProps {
  message: {
    id: string;
    type: string;
    content: string;
    toolName?: string;
    toolArgs?: Record<string, unknown>;
    duration?: number;
    isStreaming?: boolean;
  };
  theme: AgentTheme;
  showThinking: boolean;
}

function MessageLine({
  message,
  theme,
  showThinking,
}: MessageLineProps): React.ReactElement | null {
  const { type, content, toolName, toolArgs, duration, isStreaming } = message;

  // Skip thinking messages if not showing
  if (type === 'thinking' && !showThinking) {
    return null;
  }

  const icons: Record<string, string> = {
    thinking: '💭',
    text: '🤖',
    tool: '🔧',
    result: '✅',
    system: 'ℹ️',
    error: '❌',
  };

  const colors: Record<string, string> = {
    thinking: theme.thinkingColor,
    text: 'white',
    tool: theme.toolColor,
    result: theme.successColor,
    system: theme.infoColor,
    error: theme.errorColor,
  };

  const icon = icons[type] || '●';
  const color = colors[type] || 'white';

  // Thinking Block
  if (type === 'thinking') {
    return (
      <Box
        flexDirection="column"
        marginLeft={2}
        marginBottom={0}
        borderStyle="single"
        borderColor={theme.dimColor}
        paddingX={1}
      >
        <Text color={theme.thinkingColor} italic>
          {icon} Thinking...
        </Text>
        <Text color={theme.dimColor}>{content}</Text>
      </Box>
    );
  }

  // Tool Use
  if (type === 'tool') {
    const displayArgs = formatToolArgs(toolArgs, 1000);

    return (
      <Box marginLeft={2} marginBottom={0} flexDirection="column">
        <Text color={theme.toolColor}>
          {icon} Using tool:{' '}
          <Text bold>{formatToolName(toolName || 'unknown')}</Text>
        </Text>
        {displayArgs && (
          <Box marginLeft={2}>
            <Text color={theme.dimColor} dimColor>
              Input: {displayArgs}
            </Text>
          </Box>
        )}
      </Box>
    );
  }

  // Regular Text / Result / System
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={color} bold>
          {icon}{' '}
        </Text>
        {type === 'system' && (
          <Text color={color} bold>
            System:{' '}
          </Text>
        )}
        {type === 'error' && (
          <Text color={color} bold>
            Error:{' '}
          </Text>
        )}
        {toolName && (
          <Text color={theme.toolColor}>[{formatToolName(toolName)}] </Text>
        )}
        {isStreaming && (
          <Text color={theme.primaryColor} bold> ●</Text>
        )}
      </Box>
      <Box marginLeft={2}>
        <Text color={type === 'text' ? undefined : color} wrap="wrap">
          {content || (isStreaming ? '...' : '')}
        </Text>
      </Box>
      {duration && (
        <Box marginLeft={2}>
          <Text color={theme.dimColor} dimColor>
            ({duration}ms)
          </Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Tool call line component
 */
interface ToolCallLineProps {
  tool: {
    id: string;
    name: string;
    args: Record<string, unknown>;
    status: string;
    duration?: number;
    startTime: number;
  };
  theme: AgentTheme;
}

function ToolCallLine({ tool, theme }: ToolCallLineProps): React.ReactElement {
  const elapsed = Date.now() - tool.startTime;
  const displayName = formatToolName(tool.name);
  const displayArgs = formatToolArgs(tool.args, 500);

  return (
    <Box flexDirection="column">
      <Box>
        {tool.status === 'running' ? (
          <Spinner />
        ) : tool.status === 'completed' ? (
          <Text color={theme.successColor}>✓</Text>
        ) : (
          <Text color={theme.errorColor}>✗</Text>
        )}
        <Text> {displayName}</Text>
        <Text color={theme.dimColor}>
          {' '}
          (
          {tool.status === 'running'
            ? `${Math.floor(elapsed / 1000)}s`
            : `${tool.duration}ms`}
          )
        </Text>
      </Box>
      {displayArgs && (
        <Box marginLeft={2}>
          <Text color={theme.dimColor} dimColor>
            Input: {displayArgs}
          </Text>
        </Box>
      )}
    </Box>
  );
}

/**
 * Helper functions
 */

function formatToolName(name: string): string {
  if (name.startsWith('mcp__octocode-local__')) {
    return '🔍 ' + name.replace('mcp__octocode-local__', '');
  }
  if (name.startsWith('mcp__')) {
    return '🔌 ' + name.replace('mcp__', '').replace(/__/g, '/');
  }
  return name;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function getModeIcon(mode: string): string {
  const icons: Record<string, string> = {
    research: '🔍',
    coding: '💻',
    full: '🚀',
    planning: '📋',
    delegate: '👥',
    interactive: '🤝',
  };
  return icons[mode] || '🤖';
}

export default AgentView;
