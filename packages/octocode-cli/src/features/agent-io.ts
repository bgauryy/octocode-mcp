/**
 * Agent IO - Centralized output handling for agent operations
 *
 * Provides a unified interface for all agent-related terminal output:
 * - Configurable colors and styles
 * - Message type categorization
 * - Progress tracking
 * - Stats display
 * - Error/warning counters
 *
 * Inspired by Aider's InputOutput class pattern.
 */

import { c, bold, dim } from '../utils/colors.js';
import type { AgentStateInfo, AgentStateType } from '../types/agent.js';

// ============================================
// Configuration Types
// ============================================

export interface AgentIOConfig {
  /** Enable pretty output with colors */
  pretty: boolean;
  /** Show verbose output */
  verbose: boolean;
  /** Color for tool output */
  toolOutputColor: string;
  /** Color for tool errors */
  toolErrorColor: string;
  /** Color for tool warnings */
  toolWarningColor: string;
  /** Color for assistant output */
  assistantOutputColor: string;
  /** Color for user input display */
  userInputColor: string;
  /** Color for stats display */
  statsColor: string;
  /** Show live stats bar */
  showLiveStats: boolean;
  /** Stats update interval in ms */
  statsUpdateInterval: number;
}

const DEFAULT_CONFIG: AgentIOConfig = {
  pretty: true,
  verbose: true,
  toolOutputColor: 'cyan',
  toolErrorColor: 'red',
  toolWarningColor: 'yellow',
  assistantOutputColor: 'blue',
  userInputColor: 'green',
  statsColor: 'dim',
  showLiveStats: true,
  statsUpdateInterval: 500,
};

// ============================================
// State Icons & Labels
// ============================================

const STATE_ICONS: Record<AgentStateType, string> = {
  idle: '⏸',
  waiting_for_input: '✏️',
  initializing: '🔄',
  connecting_mcp: '🔌',
  executing: '⚡',
  thinking: '🧠',
  tool_use: '🔧',
  formulating_answer: '✍️',
  waiting_permission: '⏳',
  completed: '✅',
  error: '❌',
};

const STATE_LABELS: Record<AgentStateType, string> = {
  idle: 'Idle',
  waiting_for_input: 'Ready',
  initializing: 'Initializing',
  connecting_mcp: 'Connecting MCP',
  executing: 'Executing',
  thinking: 'Thinking',
  tool_use: 'Using Tool',
  formulating_answer: 'Preparing Answer',
  waiting_permission: 'Awaiting Permission',
  completed: 'Completed',
  error: 'Error',
};

// ============================================
// AgentIO Class
// ============================================

/**
 * Centralized IO handler for agent operations
 */
export class AgentIO {
  private config: AgentIOConfig;
  private errorCount = 0;
  private warningCount = 0;
  private lastStatsLine = '';
  private statsInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<AgentIOConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ============================================
  // Configuration
  // ============================================

  /**
   * Update configuration at runtime
   */
  updateConfig(config: Partial<AgentIOConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): AgentIOConfig {
    return { ...this.config };
  }

  // ============================================
  // Basic Output Methods
  // ============================================

  /**
   * Output from tools/system
   */
  toolOutput(message: string, indent = 0): void {
    if (!this.config.verbose) return;
    const prefix = '  '.repeat(indent);
    console.log(`${prefix}${c(this.config.toolOutputColor, message)}`);
  }

  /**
   * Error output
   */
  toolError(message: string): void {
    this.errorCount++;
    console.log(`${c(this.config.toolErrorColor, '✗')} ${message}`);
  }

  /**
   * Warning output
   */
  toolWarning(message: string): void {
    this.warningCount++;
    console.log(`${c(this.config.toolWarningColor, '⚠')} ${message}`);
  }

  /**
   * Assistant/LLM output
   * Note: No longer truncated - full output is important for debugging and context
   */
  assistantOutput(message: string): void {
    if (!this.config.verbose) return;
    console.log(`\n💭 ${message}`);
  }

  /**
   * User input display
   */
  userInput(message: string): void {
    console.log(
      `\n${c(this.config.userInputColor, '📝')} ${bold('Task:')} ${message}`
    );
  }

  /**
   * Section header
   */
  header(title: string, icon = '🤖'): void {
    console.log();
    console.log(c('blue', '━'.repeat(66)));
    console.log(`  ${icon} ${bold(title)}`);
    console.log(c('blue', '━'.repeat(66)));
    console.log();
  }

  /**
   * Separator line
   */
  separator(char = '─', length = 50): void {
    console.log(`  ${dim(char.repeat(length))}`);
  }

  // ============================================
  // Tool Execution Output
  // ============================================

  /**
   * Display tool start
   */
  toolStart(
    toolName: string,
    toolIndex: number,
    input?: Record<string, unknown>
  ): void {
    if (!this.config.verbose) return;

    const displayName = this.formatToolName(toolName);
    const colorName = this.getToolColorName(toolName);

    console.log(`\n${c(colorName, `[${toolIndex}]`)} 🔧 ${displayName}`);

    // Show compact input
    if (input) {
      const compactInput = this.formatToolInput(toolName, input);
      if (compactInput) {
        console.log(`   ${dim('→')} ${dim(compactInput)}`);
      }
    }
  }

  /**
   * Display tool completion
   */
  toolComplete(durationMs: number): void {
    if (!this.config.verbose) return;
    const durationStr = durationMs > 0 ? ` ${dim(`(${durationMs}ms)`)}` : '';
    console.log(`   ${c('green', '✓')} completed${durationStr}`);
  }

  /**
   * Display tool failure
   */
  toolFailed(error: string): void {
    if (!this.config.verbose) return;
    console.log(`   ${c('red', '✗')} failed: ${error}`);
  }

  /**
   * Format tool name for display
   */
  private formatToolName(toolName: string): string {
    if (toolName.startsWith('mcp__octocode-local__')) {
      return toolName.replace('mcp__octocode-local__', '🔍 ');
    }
    if (toolName.startsWith('mcp__')) {
      return toolName.replace('mcp__', '🔌 ');
    }
    return toolName;
  }

  /**
   * Get color name for tool type (uses named colors instead of ANSI codes)
   */
  private getToolColorName(toolName: string): string {
    if (toolName.startsWith('mcp__')) return 'cyan'; // cyan for MCP
    if (['Read', 'Glob', 'Grep'].includes(toolName)) return 'blue'; // blue for read
    if (['Write', 'Edit'].includes(toolName)) return 'yellow'; // yellow for write
    if (toolName === 'Bash') return 'magenta'; // magenta for bash
    if (['WebSearch', 'WebFetch'].includes(toolName)) return 'green'; // green for web
    return 'white'; // white default
  }

  /**
   * Format tool input for compact display
   */
  private formatToolInput(
    toolName: string,
    input: Record<string, unknown>
  ): string | null {
    // For MCP tools, show key params only
    if (toolName.startsWith('mcp__')) {
      const keyParams = ['pattern', 'path', 'query', 'owner', 'repo', 'name'];
      const compact: Record<string, unknown> = {};
      for (const key of keyParams) {
        if (key in input) compact[key] = input[key];
      }
      if (Object.keys(compact).length > 0) {
        return JSON.stringify(compact);
      }
      return null;
    }

    // For other tools, show truncated input
    const str = JSON.stringify(input);
    return str.length > 200 ? str.slice(0, 200) + '...' : str;
  }

  // ============================================
  // State & Progress Display
  // ============================================

  /**
   * Display agent state change
   */
  stateChange(state: AgentStateInfo): void {
    if (!this.config.verbose) return;

    const icon = STATE_ICONS[state.state];
    const label = STATE_LABELS[state.state];
    const elapsed = ((Date.now() - state.startTime) / 1000).toFixed(1);
    const tokens = state.inputTokens + state.outputTokens;

    // Only show significant state changes
    if (['executing', 'thinking', 'completed', 'error'].includes(state.state)) {
      console.log(
        dim(
          `   ${icon} ${label} | ${elapsed}s | ${tokens.toLocaleString()} tokens`
        )
      );
    }
  }

  /**
   * Start live stats display
   */
  startLiveStats(getState: () => AgentStateInfo): void {
    if (!this.config.showLiveStats || !this.config.verbose) return;

    this.statsInterval = setInterval(() => {
      const state = getState();
      this.updateStatsLine(state);
    }, this.config.statsUpdateInterval);
  }

  /**
   * Stop live stats display
   */
  stopLiveStats(): void {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    // Clear the stats line
    if (this.lastStatsLine) {
      process.stdout.write('\r' + ' '.repeat(this.lastStatsLine.length) + '\r');
      this.lastStatsLine = '';
    }
  }

  /**
   * Update the stats line (single line, overwrites previous)
   */
  private updateStatsLine(state: AgentStateInfo): void {
    if (!process.stdout.isTTY) return;

    const icon = STATE_ICONS[state.state];
    const elapsed = ((Date.now() - state.startTime) / 1000).toFixed(1);
    const tokens = state.inputTokens + state.outputTokens;
    const toolInfo = state.currentTool
      ? ` | ${this.formatToolName(state.currentTool)}`
      : '';

    const statsLine = `${icon} ${elapsed}s | 🎯 ${tokens.toLocaleString()} tokens | 🔧 ${state.toolCount} tools${toolInfo}`;

    // Clear previous line and write new one
    if (this.lastStatsLine) {
      process.stdout.write('\r' + ' '.repeat(this.lastStatsLine.length) + '\r');
    }
    process.stdout.write(dim(statsLine));
    this.lastStatsLine = statsLine;
  }

  // ============================================
  // MCP Status Display
  // ============================================

  /**
   * Display MCP server connection status
   */
  mcpStatus(servers: Array<{ name: string; status: string }>): void {
    if (!this.config.verbose || servers.length === 0) return;

    console.log('\n🔌 MCP Server Status:');
    for (const server of servers) {
      const icon = server.status === 'connected' ? '✓' : '✗';
      const colorName = server.status === 'connected' ? 'green' : 'red';
      console.log(`   ${c(colorName, icon)} ${server.name}: ${server.status}`);
    }
  }

  // ============================================
  // Result Display
  // ============================================

  /**
   * Display final result with stats
   */
  result(
    success: boolean,
    result?: string,
    error?: string,
    stats?: {
      duration?: number;
      inputTokens?: number;
      outputTokens?: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
      sessionId?: string;
    }
  ): void {
    console.log();

    if (success) {
      console.log(c('green', '  ┌' + '─'.repeat(60) + '┐'));
      console.log(
        c('green', '  │ ') +
          `${c('green', '✓')} ${bold('Agent completed successfully!')}` +
          ' '.repeat(27) +
          c('green', '│')
      );
      console.log(c('green', '  └' + '─'.repeat(60) + '┘'));

      if (result) {
        console.log();
        console.log(`  ${bold('Result:')}`);
        console.log();
        for (const line of result.split('\n')) {
          console.log(`  ${line}`);
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

      if (error) {
        console.log();
        console.log(`  ${c('red', 'Error:')} ${error}`);
      }
    }

    // Display stats
    if (stats && (stats.duration || stats.inputTokens)) {
      this.displayStats(stats);
    }

    console.log();
  }

  /**
   * Display stats box
   */
  private displayStats(stats: {
    duration?: number;
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    sessionId?: string;
  }): void {
    console.log();
    console.log(c('blue', '  ┌' + '─'.repeat(40) + '┐'));
    console.log(
      c('blue', '  │ ') + bold('📊 Stats') + ' '.repeat(31) + c('blue', '│')
    );
    console.log(c('blue', '  └' + '─'.repeat(40) + '┘'));
    console.log();

    if (stats.duration !== undefined) {
      console.log(
        `    ${c('cyan', '⏱')}  ${dim('Time:')}    ${this.formatDuration(stats.duration)}`
      );
    }

    if (stats.inputTokens !== undefined && stats.outputTokens !== undefined) {
      const totalTokens = stats.inputTokens + stats.outputTokens;
      console.log(
        `    ${c('yellow', '🎯')} ${dim('Tokens:')}  ${totalTokens.toLocaleString()}`
      );
      console.log(
        `         ${dim('├─ In:')}   ${stats.inputTokens.toLocaleString()}`
      );
      console.log(
        `         ${dim('└─ Out:')}  ${stats.outputTokens.toLocaleString()}`
      );

      if (stats.cacheReadTokens || stats.cacheWriteTokens) {
        console.log(
          `    ${c('green', '💾')} ${dim('Cache:')}   ${(stats.cacheReadTokens || 0).toLocaleString()} read / ${(stats.cacheWriteTokens || 0).toLocaleString()} write`
        );
      }
    }

    if (stats.sessionId) {
      console.log(
        `    ${c('magenta', '🔗')} ${dim('Session:')} ${stats.sessionId.slice(0, 20)}...`
      );
    }
  }

  /**
   * Format duration for display
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = ((ms % 60000) / 1000).toFixed(0);
    return `${mins}m ${secs}s`;
  }

  // ============================================
  // Counters
  // ============================================

  /**
   * Get error count
   */
  getErrorCount(): number {
    return this.errorCount;
  }

  /**
   * Get warning count
   */
  getWarningCount(): number {
    return this.warningCount;
  }

  /**
   * Reset counters
   */
  resetCounters(): void {
    this.errorCount = 0;
    this.warningCount = 0;
  }
}

// ============================================
// Default Instance
// ============================================

/**
 * Default AgentIO instance
 */
export const defaultAgentIO = new AgentIO();

/**
 * Create a new AgentIO instance with custom config
 */
export function createAgentIO(config: Partial<AgentIOConfig> = {}): AgentIO {
  return new AgentIO(config);
}
