/**
 * ToolCallDisplay Component
 *
 * Shows active tool calls with their status.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Spinner } from '@inkjs/ui';
import type { ToolCall, ChatTheme } from './types.js';
import { DEFAULT_THEME } from './types.js';

interface ToolCallDisplayProps {
  toolCalls: ToolCall[];
  theme?: ChatTheme;
}

const STATUS_ICONS: Record<string, string> = {
  pending: '○',
  running: '◐',
  completed: '✓',
  error: '✗',
};

export function ToolCallDisplay({
  toolCalls,
  theme = DEFAULT_THEME,
}: ToolCallDisplayProps): React.ReactElement | null {
  // Show all tools (running, completed, error) - completed ones are cleaned up after 3s
  if (toolCalls.length === 0) {
    return null;
  }

  const runningTools = toolCalls.filter(tc => tc.status === 'running' || tc.status === 'pending');
  const completedTools = toolCalls.filter(tc => tc.status === 'completed');
  const errorTools = toolCalls.filter(tc => tc.status === 'error');

  return (
    <Box flexDirection="column" marginY={1} paddingX={1}>
      {/* Running tools */}
      {runningTools.length > 0 && (
        <>
          <Text color={theme.borderColor} bold>
            ⚡ Running Tools
          </Text>
          {runningTools.map((tc) => (
            <Box key={tc.id} marginLeft={2}>
              <Spinner label={tc.name} />
            </Box>
          ))}
        </>
      )}

      {/* Completed tools (shown briefly before cleanup) */}
      {completedTools.length > 0 && (
        <>
          <Text color="green" bold>
            ✓ Completed
          </Text>
          {completedTools.map((tc) => (
            <Box key={tc.id} marginLeft={2}>
              <Text color="green">
                {STATUS_ICONS.completed} {tc.name}
                {tc.duration && <Text dimColor> ({tc.duration}ms)</Text>}
              </Text>
            </Box>
          ))}
        </>
      )}

      {/* Error tools */}
      {errorTools.length > 0 && (
        <>
          <Text color={theme.errorColor} bold>
            ✗ Failed
          </Text>
          {errorTools.map((tc) => (
            <Box key={tc.id} marginLeft={2}>
              <Text color={theme.errorColor}>
                {STATUS_ICONS.error} {tc.name}
                {tc.error && <Text dimColor>: {tc.error.slice(0, 50)}</Text>}
              </Text>
            </Box>
          ))}
        </>
      )}
    </Box>
  );
}

export default ToolCallDisplay;

