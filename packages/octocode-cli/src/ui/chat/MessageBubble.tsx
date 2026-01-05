/**
 * MessageBubble Component
 *
 * Renders a single chat message with appropriate styling based on role.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { ChatMessage, ChatTheme } from './types.js';
import { DEFAULT_THEME } from './types.js';

interface MessageBubbleProps {
  message: ChatMessage;
  theme?: ChatTheme;
  /** Max chars for tool results (0 = unlimited) */
  maxToolResultLength?: number;
  /** Max chars for thinking blocks (0 = unlimited) */
  maxThinkingLength?: number;
  /** Whether to show thinking blocks */
  showThinking?: boolean;
}

const ROLE_ICONS: Record<string, string> = {
  user: '💬',
  assistant: '🐙',
  tool: '⚡',
  system: '💡',
};

const ROLE_LABELS: Record<string, string> = {
  user: 'You',
  assistant: 'Octocode',
  tool: 'Tool',
  system: 'Info',
};

export function MessageBubble({
  message,
  theme = DEFAULT_THEME,
  maxToolResultLength = 0, // 0 = unlimited (no truncation)
  maxThinkingLength = 0, // 0 = unlimited (no truncation)
  showThinking = true,
}: MessageBubbleProps): React.ReactElement {
  const icon = ROLE_ICONS[message.role] || '💬';
  const label = ROLE_LABELS[message.role] || message.role;
  const color = getColorForRole(message.role, theme);

  // Different styling for user vs assistant messages
  const isSystem = message.role === 'system';

  // Don't render empty messages (except streaming placeholders with thinking)
  const hasContent = message.content.trim() || message.thinking || message.toolResult;
  if (!hasContent && !message.isStreaming) {
    return <Box />;
  }

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Header with role indicator */}
      <Box>
        <Text color={color} bold>
          {icon} {label}
        </Text>
        {message.toolName && (
          <Text color={theme.toolColor}> [{message.toolName}]</Text>
        )}
        {message.isStreaming && (
          <Text color={color} bold> ●</Text>
        )}
      </Box>

      {/* Thinking block (shown before content) */}
      {showThinking && message.thinking && (
        <Box marginLeft={3} marginBottom={1} flexDirection="column">
          <Text color={theme.thinkingColor} dimColor>
            💭 Thinking:
          </Text>
          <Box marginLeft={2} flexDirection="column">
            {truncateText(message.thinking, maxThinkingLength).split('\n').map((line, i) => (
              <Text key={i} wrap="wrap" color={theme.thinkingColor} dimColor>
                {line}
              </Text>
            ))}
          </Box>
        </Box>
      )}

      {/* Content with visual distinction */}
      <Box marginLeft={3} flexDirection="column">
        {message.content.split('\n').map((line, i) => (
          <Text
            key={i}
            wrap="wrap"
            color={isSystem ? theme.dimColor : undefined}
            dimColor={isSystem}
          >
            {line}
          </Text>
        ))}
      </Box>

      {/* Tool result with better visibility */}
      {message.toolResult && (
        <Box marginLeft={3} marginTop={1}>
          <Text color={theme.toolColor}>
            ↳ {truncateText(message.toolResult, maxToolResultLength)}
          </Text>
        </Box>
      )}
    </Box>
  );
}

function getColorForRole(role: string, theme: ChatTheme): string {
  switch (role) {
    case 'user':
      return theme.userColor;
    case 'assistant':
      return theme.assistantColor;
    case 'tool':
      return theme.toolColor;
    case 'system':
      return theme.systemColor;
    default:
      return theme.dimColor;
  }
}

/**
 * Truncate text with ellipsis. If maxLength is 0, returns full text.
 */
function truncateText(text: string, maxLength: number): string {
  if (maxLength === 0 || text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '... [truncated]';
}

export default MessageBubble;

