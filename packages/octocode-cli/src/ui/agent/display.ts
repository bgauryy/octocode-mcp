/**
 * Agent Display Components
 *
 * UI components for displaying agent status, results, and progress.
 */

import { c, bold, dim } from '../../utils/colors.js';
import type {
  AgentResult,
  AIProvider,
  APIKeyResult,
} from '../../types/agent.js';

/**
 * Print agent readiness status
 */
export function printAgentReadiness(status: {
  ready: boolean;
  sdkInstalled: boolean;
  claudeCodeAuth: boolean;
  hasAPIKey: boolean;
  message: string;
}): void {
  console.log();
  console.log(`  ${bold('🤖 Agent Status')}`);
  console.log();

  // SDK status
  const sdkStatus = status.sdkInstalled ? c('green', '✓') : c('red', '✗');
  console.log(
    `  ${sdkStatus} Claude Agent SDK ${status.sdkInstalled ? 'installed' : 'not installed'}`
  );

  // Auth status
  if (status.claudeCodeAuth) {
    console.log(`  ${c('green', '✓')} Claude Code authentication detected`);
  } else if (status.hasAPIKey) {
    console.log(`  ${c('green', '✓')} API key available`);
  } else {
    console.log(`  ${c('yellow', '○')} No API credentials found`);
  }

  console.log();

  if (status.ready) {
    console.log(`  ${c('green', '●')} Agent is ready to use`);
  } else {
    console.log(`  ${c('red', '●')} ${status.message}`);
  }

  console.log();
}

/**
 * Print API key discovery results
 */
export function printAPIKeyDiscovery(results: APIKeyResult[]): void {
  console.log();
  console.log(`  ${bold('🔑 API Key Discovery')}`);
  console.log();

  const found = results.filter(r => r.key !== null);
  const notFound = results.filter(r => r.key === null);

  if (found.length > 0) {
    console.log(`  ${bold('Found:')}`);
    for (const result of found) {
      const providerName = getProviderDisplayName(result.provider);
      const sourceDesc = getSourceDescription(result.source);
      const maskedKey = result.key ? maskAPIKey(result.key) : '';

      console.log(`    ${c('green', '✓')} ${providerName}`);
      console.log(`      ${dim('Source:')} ${sourceDesc}`);
      console.log(`      ${dim('Key:')} ${maskedKey}`);

      if (result.isOAuth && result.expiresAt) {
        const expiresIn = Math.round(
          (result.expiresAt - Date.now()) / 1000 / 60
        );
        if (expiresIn > 0) {
          console.log(`      ${dim('Expires:')} in ${expiresIn} minutes`);
        } else {
          console.log(`      ${c('yellow', '⚠')} Token expired`);
        }
      }
    }
  }

  if (notFound.length > 0) {
    console.log();
    console.log(`  ${dim('Not found:')}`);
    for (const result of notFound) {
      const providerName = getProviderDisplayName(result.provider);
      console.log(`    ${c('dim', '○')} ${providerName}`);
    }
  }

  console.log();
}

/**
 * Format duration for display
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = ((ms % 60000) / 1000).toFixed(0);
  return `${mins}m ${secs}s`;
}

/**
 * Print agent result summary
 */
export function printAgentResult(result: AgentResult): void {
  console.log();

  if (result.success) {
    console.log(c('green', '  ┌' + '─'.repeat(60) + '┐'));
    console.log(
      c('green', '  │ ') +
        `${c('green', '✓')} ${bold('Agent completed successfully!')}` +
        ' '.repeat(27) +
        c('green', '│')
    );
    console.log(c('green', '  └' + '─'.repeat(60) + '┘'));

    if (result.result) {
      console.log();
      console.log(`  ${bold('Result:')}`);
      console.log();
      // Indent each line of the result
      const lines = result.result.split('\n');
      for (const line of lines) {
        console.log(`  ${line}`);
      }
    }

    // Show usage stats if available
    if (result.usage || result.duration !== undefined) {
      console.log();
      console.log(c('blue', '  ┌' + '─'.repeat(40) + '┐'));
      console.log(
        c('blue', '  │ ') + bold('📊 Stats') + ' '.repeat(31) + c('blue', '│')
      );
      console.log(c('blue', '  └' + '─'.repeat(40) + '┘'));
      console.log();

      // Duration with icon
      if (result.duration !== undefined) {
        console.log(
          `    ${c('cyan', '⏱')}  ${dim('Time:')}    ${formatDuration(result.duration)}`
        );
      }

      // Tokens with breakdown
      if (result.usage) {
        const totalTokens =
          result.usage.inputTokens + result.usage.outputTokens;
        console.log(
          `    ${c('yellow', '🎯')} ${dim('Tokens:')}  ${totalTokens.toLocaleString()}`
        );
        console.log(
          `         ${dim('├─ In:')}   ${result.usage.inputTokens.toLocaleString()}`
        );
        console.log(
          `         ${dim('└─ Out:')}  ${result.usage.outputTokens.toLocaleString()}`
        );

        // Show cache stats if available
        if (result.usage.cacheReadTokens || result.usage.cacheWriteTokens) {
          console.log(
            `    ${c('green', '💾')} ${dim('Cache:')}   ${(result.usage.cacheReadTokens || 0).toLocaleString()} read / ${(result.usage.cacheWriteTokens || 0).toLocaleString()} write`
          );
        }
      }

      // Session ID
      if (result.sessionId) {
        console.log(
          `    ${c('magenta', '🔗')} ${dim('Session:')} ${result.sessionId.slice(0, 20)}...`
        );
      }
    }
  } else {
    console.log(c('red', '  ┌' + '─'.repeat(60) + '┐'));
    console.log(
      c('red', '  │ ') +
        `${c('red', '✗')} ${bold('Agent failed')}` +
        ' '.repeat(41) +
        c('red', '│')
    );
    console.log(c('red', '  └' + '─'.repeat(60) + '┘'));

    if (result.error) {
      console.log();
      console.log(`  ${c('red', 'Error:')} ${result.error}`);
    }

    // Still show duration/tokens on error if available
    if (result.duration !== undefined || result.usage) {
      console.log();
      console.log(`  ${dim('Stats:')}`);
      if (result.duration !== undefined) {
        console.log(
          `    ${c('cyan', '⏱')}  ${dim('Time:')} ${formatDuration(result.duration)}`
        );
      }
      if (result.usage) {
        const totalTokens =
          result.usage.inputTokens + result.usage.outputTokens;
        console.log(
          `    ${c('yellow', '🎯')} ${dim('Tokens:')} ${totalTokens.toLocaleString()}`
        );
      }
    }
  }

  console.log();
}

/**
 * Print progress indicator for agent execution
 */
export function printAgentProgress(
  message: string,
  type: 'info' | 'tool' | 'thinking' = 'info'
): void {
  const icons = {
    info: '💭',
    tool: '🔧',
    thinking: '🧠',
  };

  console.log(`  ${icons[type]} ${message}`);
}

/**
 * Print available subagents
 */
export function printAvailableSubagents(
  agents: Record<string, { description: string }>
): void {
  console.log();
  console.log(`  ${bold('Available Subagents:')}`);
  console.log();

  for (const [name, agent] of Object.entries(agents)) {
    console.log(`    ${c('cyan', '•')} ${bold(name)}`);
    console.log(`      ${dim(agent.description)}`);
  }

  console.log();
}

// Helper functions

function getProviderDisplayName(provider: AIProvider): string {
  switch (provider) {
    case 'anthropic':
      return 'Anthropic (Claude)';
    case 'openai':
      return 'OpenAI (GPT)';
    case 'google':
      return 'Google (Gemini)';
    case 'bedrock':
      return 'AWS Bedrock';
    case 'vertex':
      return 'Google Vertex AI';
    default:
      return provider;
  }
}

function getSourceDescription(source: string): string {
  switch (source) {
    case 'environment':
      return 'environment variable';
    case 'keychain':
      return 'OS keychain';
    case 'keychain-oauth':
      return 'Claude Code (OAuth)';
    case 'config-file':
      return 'config file';
    case 'manual':
      return 'manually entered';
    case 'none':
      return 'not found';
    default:
      return source;
  }
}

function maskAPIKey(key: string): string {
  if (key.length <= 12) return '****';
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}
