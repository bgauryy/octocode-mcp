/**
 * StatusBar Component
 *
 * Displays session stats: model, tokens, time, cost.
 * Uses purple/magenta theme for consistency with menu.
 */

import React from 'react';
import { Box, Text } from 'ink';
import type { ChatStats, ChatTheme } from './types.js';
import { DEFAULT_THEME } from './types.js';

interface StatusBarProps {
  stats: ChatStats;
  model?: string;
  isThinking?: boolean;
  theme?: ChatTheme;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  return `${(count / 1000).toFixed(1)}k`;
}

export function StatusBar({
  stats,
  model,
  isThinking = false,
  theme = DEFAULT_THEME,
}: StatusBarProps): React.ReactElement {
  const totalTokens = stats.totalInputTokens + stats.totalOutputTokens;
  const sessionDuration = Date.now() - stats.sessionStartTime;

  return (
    <Box
      borderStyle="round"
      borderColor={theme.borderColor}
      paddingX={1}
      justifyContent="space-between"
      flexWrap="wrap"
    >
      {/* Model name */}
      {model && (
        <Box marginRight={2}>
          <Text color={theme.assistantColor} bold>🤖 {model}</Text>
        </Box>
      )}

      {/* Tokens with accent color */}
      <Box marginRight={2}>
        <Text color={theme.borderColor} bold>⚡</Text>
        <Text color={totalTokens > 0 ? theme.assistantColor : theme.dimColor}>
          {' '}{formatTokens(totalTokens)}
        </Text>
        <Text color={theme.dimColor}> tok</Text>
        {totalTokens > 0 && (
          <Text color={theme.dimColor}>
            {' '}({formatTokens(stats.totalInputTokens)}↑{formatTokens(stats.totalOutputTokens)}↓)
          </Text>
        )}
      </Box>

      {/* Messages */}
      <Box marginRight={2}>
        <Text color={theme.borderColor} bold>💬</Text>
        <Text color={stats.totalMessages > 0 ? theme.assistantColor : theme.dimColor}>
          {' '}{stats.totalMessages}
        </Text>
      </Box>

      {/* Tools */}
      {stats.totalToolCalls > 0 && (
        <Box marginRight={2}>
          <Text color={theme.borderColor} bold>🔧</Text>
          <Text color={theme.toolColor}> {stats.totalToolCalls}</Text>
        </Box>
      )}

      {/* Last response time */}
      {stats.lastResponseTime && !isThinking && (
        <Box marginRight={2}>
          <Text color={theme.dimColor}>⏱ {formatDuration(stats.lastResponseTime)}</Text>
        </Box>
      )}

      {/* Session time */}
      <Box>
        <Text color={theme.dimColor}>⏰ {formatDuration(sessionDuration)}</Text>
      </Box>
    </Box>
  );
}

export default StatusBar;
