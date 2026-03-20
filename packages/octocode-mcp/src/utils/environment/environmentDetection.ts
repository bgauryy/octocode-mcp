import { getConfigSync } from 'octocode-shared';

type Environment = 'vscode' | 'claude-code-mcp' | 'cursor' | 'standalone';

export function detectEnvironment(): Environment {
  if (process.env.VSCODE_PID || process.env.VSCODE_IPC_HOOK) {
    return 'vscode';
  }
  if (process.env.CURSOR_CHANNEL || process.env.CURSOR_TRACE_ID) {
    return 'cursor';
  }
  return 'standalone';
}

export function shouldUseMCPLsp(): boolean {
  try {
    return getConfigSync().local.enabled;
  } catch {
    // getConfigSync failed; treat local tools as disabled until config is readable.
    return false;
  }
}

export function getLspEnvironmentHint(): string | null {
  try {
    if (!getConfigSync().local.enabled) {
      return 'Local tools are disabled (ENABLE_LOCAL=false). MCP LSP tools are unavailable.';
    }
  } catch {
    // getConfigSync failed; omit LSP hint rather than guess enablement.
  }
  return null;
}
