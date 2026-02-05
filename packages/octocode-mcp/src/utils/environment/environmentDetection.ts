/**
 * Environment detection utilities for IDE/tool compatibility.
 * Detects execution environment and native LSP availability.
 * @module utils/environment/environmentDetection
 */

import { getConfigSync } from 'octocode-shared';

/**
 * Detected environment types
 */
type Environment =
  | 'vscode'
  | 'claude-code-native'
  | 'claude-code-mcp'
  | 'cursor'
  | 'standalone';

/**
 * Detect the current execution environment.
 *
 * @returns The detected environment type
 *
 * @example
 * const env = detectEnvironment();
 * if (env === 'claude-code-native') {
 *   // Claude Code has native LSP available
 * }
 */
export function detectEnvironment(): Environment {
  // Claude Code with native LSP enabled
  if (process.env.ENABLE_LSP_TOOL === '1') {
    return 'claude-code-native';
  }

  // VSCode extension host
  if (process.env.VSCODE_PID || process.env.VSCODE_IPC_HOOK) {
    return 'vscode';
  }

  // Cursor IDE
  if (process.env.CURSOR_CHANNEL || process.env.CURSOR_TRACE_ID) {
    return 'cursor';
  }

  // Default: standalone or MCP context
  return 'standalone';
}

/**
 * Check if octocode-mcp LSP should be used.
 * Returns false if native LSP is available and force flag is not set.
 *
 * @returns true if octocode-mcp LSP should be used
 *
 * @example
 * if (shouldUseMCPLsp()) {
 *   // Use octocode-mcp LSP tools
 * } else {
 *   // Suggest native tools
 * }
 */
export function shouldUseMCPLsp(): boolean {
  const env = detectEnvironment();

  // Force octocode-mcp LSP if explicitly requested (env var or config)
  if (process.env.OCTOCODE_FORCE_LSP === '1') {
    return true;
  }
  try {
    if (getConfigSync().lsp.forceMcpLsp) {
      return true;
    }
  } catch {
    // Config not loaded yet, fall through
  }

  // Defer to native LSP in Claude Code
  if (env === 'claude-code-native') {
    return false;
  }

  return true;
}

/**
 * Get a message about LSP environment status.
 * Returns a hint message if native LSP is available.
 *
 * @returns Hint message or null if no special environment detected
 */
export function getLspEnvironmentHint(): string | null {
  if (
    process.env.ENABLE_LSP_TOOL === '1' &&
    process.env.OCTOCODE_FORCE_LSP !== '1'
  ) {
    return (
      'Native Claude Code LSP detected (ENABLE_LSP_TOOL=1). ' +
      'Consider using native LSP tools for better integration. ' +
      'Set OCTOCODE_FORCE_LSP=1 to use octocode-mcp LSP instead.'
    );
  }
  return null;
}
