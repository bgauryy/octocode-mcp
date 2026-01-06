/**
 * PermissionDialog Component
 *
 * A dedicated UI component for permission prompts.
 * Displays when a tool requires user approval before execution.
 */

import React, { useMemo, memo, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import type { AgentTheme, PendingPermission } from './types.js';
import { BORDER_STYLES } from './types.js';
import { useTerminalSize } from './useTerminalSize.js';

export interface PermissionDialogProps {
  /** Permission request details */
  permission: PendingPermission;
  /** Theme configuration */
  theme: AgentTheme;
  /** Called when user allows the tool (y key) */
  onAllow: () => void;
  /** Called when user denies the tool (n key) */
  onDeny: () => void;
  /** Called when user allows all future permissions (a key) */
  onAllowAll?: () => void;
  /** Whether this dialog should handle input */
  isActive?: boolean;
}

/**
 * Format tool name for display (more readable)
 */
function formatToolNameForDisplay(name: string): string {
  if (name.startsWith('mcp__octocode-local__')) {
    return name.replace('mcp__octocode-local__', '');
  }
  if (name.startsWith('mcp__')) {
    return name.replace('mcp__', '').replace(/__/g, '/');
  }
  return name;
}

/**
 * Safely stringify and truncate tool args for display
 */
function formatToolArgs(
  args: Record<string, unknown> | undefined,
  maxChars: number = 200
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

/**
 * PermissionDialog - Prompts user for y/n/a to allow tool execution
 *
 * Keyboard shortcuts:
 * - y/Y: Allow this tool to execute
 * - n/N: Deny this tool
 * - a/A: Allow all future permission requests
 * - Esc: Cancel/deny
 */
function PermissionDialogImpl({
  permission,
  theme,
  onAllow,
  onDeny,
  onAllowAll,
  isActive = true,
}: PermissionDialogProps): React.ReactElement {
  const { columns } = useTerminalSize();
  const displayName = useMemo(
    () => formatToolNameForDisplay(permission.toolName),
    [permission.toolName]
  );
  const displayArgs = useMemo(
    () => (permission.toolArgs ? formatToolArgs(permission.toolArgs) : ''),
    [permission.toolArgs]
  );

  // Memoized input handler
  const handleInput = useCallback(
    (input: string, key: { escape?: boolean }) => {
      // y = allow this tool
      if (input === 'y' || input === 'Y') {
        onAllow();
      }
      // n = deny this tool
      else if (input === 'n' || input === 'N') {
        onDeny();
      }
      // a = allow all future permissions
      else if (input === 'a' || input === 'A') {
        onAllowAll?.();
        onAllow();
      }
      // Escape = deny/cancel
      else if (key.escape) {
        onDeny();
      }
    },
    [onAllow, onDeny, onAllowAll]
  );

  useInput(handleInput, { isActive });

  return (
    <Box
      flexDirection="column"
      borderStyle={BORDER_STYLES.permission}
      borderColor={theme.warningColor}
      paddingX={1}
      marginX={1}
      width={columns - 2}
    >
      {/* Header */}
      <Box>
        <Text backgroundColor="yellow" color="black" bold>
          {' '}
          ⚠ PERMISSION REQUIRED{' '}
        </Text>
      </Box>

      {/* Tool info */}
      <Box marginTop={1} flexDirection="column">
        <Text>
          Allow{' '}
          <Text bold color={theme.toolColor}>
            {displayName}
          </Text>{' '}
          to execute?
        </Text>
        {permission.description && (
          <Box marginLeft={2}>
            <Text dimColor>{permission.description}</Text>
          </Box>
        )}
        {displayArgs && (
          <Box marginLeft={2} marginTop={1}>
            <Text dimColor>Args: {displayArgs}</Text>
          </Box>
        )}
      </Box>

      {/* Actions */}
      <Box marginTop={1} gap={2}>
        <Text dimColor>
          <Text bold color={theme.successColor}>
            [y]
          </Text>{' '}
          Allow
        </Text>
        <Text dimColor>
          <Text bold color={theme.errorColor}>
            [n]
          </Text>{' '}
          Deny
        </Text>
        {onAllowAll && (
          <Text dimColor>
            <Text bold color={theme.infoColor}>
              [a]
            </Text>{' '}
            Allow All
          </Text>
        )}
        <Text dimColor>
          <Text bold>[Esc]</Text> Cancel
        </Text>
      </Box>
    </Box>
  );
}

export const PermissionDialog = memo(PermissionDialogImpl);
export default PermissionDialog;
