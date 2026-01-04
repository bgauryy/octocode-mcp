/**
 * Agent Core Module for octocode-cli
 *
 * Provides comprehensive agent functionality using Claude Agent SDK:
 * - Memory handling (sessions, CLAUDE.md, context management)
 * - Subagents (specialized agents for different tasks)
 * - System prompts (octocode-oriented prompts)
 * - Caching (session persistence)
 * - Tool integration (file tools, task tools, octocode MCP tools)
 *
 * Best Practices Applied:
 * 1. Plan before coding - use planning mode for complex tasks
 * 2. Subagents for focused subtasks - isolated context, parallel execution
 * 3. Extended thinking for complex problems
 * 4. Hooks for audit/security
 * 5. Session management for context persistence
 *
 * NEW: Modular Coder System
 * - Specialized coders for each mode (research, coding, full, planning)
 * - Centralized IO handling via AgentIO
 * - Runtime configuration via AgentConfigManager
 * - Per-turn state tracking with reflection limits
 */

import type {
  AgentOptions,
  AgentResult,
  AgentTool,
  OctocodeSubagents,
  SDKMessage,
  PermissionResult,
  CanUseTool,
  CanUseToolOptions,
} from '../types/agent.js';
import { discoverAPIKey, isClaudeCodeAuthenticated } from './api-keys.js';
import {
  getDefaultHooks,
  getPermissiveHooks,
  getVerboseHooks,
  resetCostTracker,
  getCostStats,
  resetToolCounter,
  setAgentState,
  updateTokenUsage,
  getAgentState,
  setStateChangeCallback,
} from './agent-hooks.js';
import { OCTOCODE_NPX } from '../configs/octocode.js';
import type { MCPServerConfig } from '../types/agent.js';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { loadInquirer, select } from '../utils/prompts.js';
import { c, bold, dim } from '../utils/colors.js';

// New modular system imports
import {
  createCoder,
  type CoderMode,
  type CoderConfig,
  type CoderResult,
} from './coders/index.js';
import { getConfigForMode } from './agent-config.js';

// System prompts are also available from './system-prompts.js' for external use
// import { OCTOCODE_RESEARCH_PROMPT, SUBAGENT_PROMPTS } from './system-prompts.js';

// ============================================
// Octocode System Prompt
// ============================================

const OCTOCODE_SYSTEM_PROMPT = `You are an expert AI coding assistant powered by Octocode.

## Octocode MCP Tools (ALWAYS USE THESE FOR RESEARCH)

You have access to powerful Octocode MCP tools. Use these tools with the exact names:

### GitHub Research Tools
- \`mcp__octocode-local__githubSearchCode\` - Search code patterns across GitHub repositories
- \`mcp__octocode-local__githubGetFileContent\` - Read file contents from GitHub repos
- \`mcp__octocode-local__githubViewRepoStructure\` - Explore repository directory structure
- \`mcp__octocode-local__githubSearchRepositories\` - Find repositories by keywords/topics
- \`mcp__octocode-local__githubSearchPullRequests\` - Search PR history and changes
- \`mcp__octocode-local__packageSearch\` - Find npm/Python packages and their repos

### Local Codebase Tools
- \`mcp__octocode-local__localSearchCode\` - Search patterns in local codebase (replaces grep)
- \`mcp__octocode-local__localGetFileContent\` - Read local file contents with targeting
- \`mcp__octocode-local__localViewStructure\` - View directory structure (replaces ls/tree)
- \`mcp__octocode-local__localFindFiles\` - Find files by name/metadata (replaces find)

## Research Workflow

1. **Start with Structure**: Use \`localViewStructure\` or \`githubViewRepoStructure\` to understand layout
2. **Search for Patterns**: Use \`localSearchCode\` or \`githubSearchCode\` to find implementations
3. **Read Context**: Use \`localGetFileContent\` or \`githubGetFileContent\` with \`matchString\` for targeted reading
4. **Trace Dependencies**: Follow imports and usages across files
5. **Cite Evidence**: Always provide file paths and line numbers for findings

## Task Breakdown

For complex tasks:
1. Use the Task tool to spawn specialized subagents for parallel work
2. Use TodoWrite to track progress on multi-step tasks
3. Break large requests into focused, actionable items
4. Complete each item before moving to the next

## Best Practices
- **Research First**: Explore and understand before making changes
- **Plan Complex Tasks**: Break down large tasks into smaller steps
- **Use Subagents**: Delegate specialized tasks via Task tool
- **Verify Changes**: Run tests after code modifications
- **Be Concise**: Show reasoning but keep responses focused
`;

// ============================================
// Octocode Subagent Definitions
// ============================================

/**
 * Pre-configured subagents optimized for common development tasks
 */
export const OCTOCODE_SUBAGENTS: OctocodeSubagents = {
  researcher: {
    description:
      'Expert code researcher for exploring codebases, finding implementations, and understanding code patterns. Use for any research or exploration task.',
    prompt: `You are a code research specialist with access to Octocode MCP tools.

## Your MCP Tools (use exact names):
- \`mcp__octocode-local__localSearchCode\` - Search patterns in local codebase
- \`mcp__octocode-local__localGetFileContent\` - Read local files with matchString targeting
- \`mcp__octocode-local__localViewStructure\` - View directory structure
- \`mcp__octocode-local__githubSearchCode\` - Search GitHub repositories
- \`mcp__octocode-local__githubGetFileContent\` - Read GitHub file contents
- \`mcp__octocode-local__packageSearch\` - Find npm/Python packages

## Research Process:
1. Start with structure (localViewStructure) to understand layout
2. Search for patterns (localSearchCode) to find implementations
3. Read with context (localGetFileContent + matchString) for details
4. Trace imports and dependencies across files
5. Cite file paths and line numbers in findings

Be thorough but concise. Provide evidence-based summaries.`,
    tools: [
      'Read',
      'Glob',
      'Grep',
      'WebSearch',
      'WebFetch',
      'ListMcpResources',
      'ReadMcpResource',
    ],
    model: 'sonnet',
  },

  codeReviewer: {
    description:
      'Expert code reviewer for quality, security, and best practices analysis. Use for code review tasks.',
    prompt: `You are a senior code reviewer. Analyze code for:
- Security vulnerabilities and risks
- Performance issues and optimizations
- Code quality and maintainability
- Adherence to best practices
- Potential bugs and edge cases

Provide specific, actionable feedback with file paths and line numbers. Prioritize issues by severity.`,
    tools: ['Read', 'Glob', 'Grep'],
    model: 'sonnet',
  },

  testRunner: {
    description:
      'Test execution specialist for running tests and analyzing results. Use for test-related tasks.',
    prompt: `You are a testing specialist. Your role is to:
- Run test suites and analyze results
- Identify failing tests and their causes
- Suggest fixes for test failures
- Ensure adequate test coverage

Execute tests using appropriate commands (npm test, pytest, etc.) and provide clear analysis of results.`,
    tools: ['Bash', 'Read', 'Grep', 'Glob'],
    model: 'haiku',
  },

  docWriter: {
    description:
      'Documentation specialist for generating and updating documentation. Use for documentation tasks.',
    prompt: `You are a technical documentation specialist. Your role is to:
- Write clear, concise documentation
- Generate API documentation from code
- Create README files and guides
- Update existing documentation

Write documentation that is helpful for both new and experienced developers.`,
    tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep'],
    model: 'sonnet',
  },

  securityAuditor: {
    description:
      'Security specialist for vulnerability analysis and security audits. Use for security-related tasks.',
    prompt: `You are a security auditor. Analyze code for:
- OWASP Top 10 vulnerabilities
- Authentication and authorization issues
- Input validation problems
- Secrets and credential exposure
- Dependency vulnerabilities

Provide detailed security reports with remediation recommendations.`,
    tools: ['Read', 'Glob', 'Grep', 'Bash', 'WebSearch'],
    model: 'opus',
  },

  refactorer: {
    description:
      'Refactoring specialist for code improvements and modernization. Use for refactoring tasks.',
    prompt: `You are a refactoring specialist. Your role is to:
- Identify code that needs refactoring
- Apply design patterns appropriately
- Improve code readability and maintainability
- Modernize legacy code patterns
- Ensure refactoring doesn't break functionality

Make incremental, safe changes with clear explanations.`,
    tools: ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'],
    model: 'sonnet',
  },
};

// ============================================
// Default Tool Sets
// ============================================

const RESEARCH_TOOLS: AgentTool[] = [
  'Read',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch',
  'Task',
  'ListMcpResources',
  'ReadMcpResource',
];

const CODING_TOOLS: AgentTool[] = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Glob',
  'Grep',
  'Task',
  'TodoWrite',
  'AskUserQuestion',
];

const ALL_TOOLS: AgentTool[] = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch',
  'Task',
  'TodoWrite',
  'AskUserQuestion',
  'NotebookEdit',
  'ListMcpResources',
  'ReadMcpResource',
];

// ============================================
// Agent Runner
// ============================================

// Read-only tools that don't require permission prompts
const READ_ONLY_TOOLS = [
  'Read',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch',
  'ListMcpResources',
  'ReadMcpResource',
];

// Octocode MCP tools are safe (research-only)
const isOctocodeTool = (name: string) => name.startsWith('mcp__octocode');

/**
 * Create an interactive permission handler for human-in-the-loop approval
 *
 * This handler prompts the user before executing potentially dangerous tools,
 * allowing them to approve, deny, or always allow specific operations.
 */
export function createInteractivePermissionHandler(): CanUseTool {
  // Track tools that have been "always allowed" during this session
  const alwaysAllowedTools = new Set<string>();

  return async (
    toolName: string,
    input: Record<string, unknown>,
    options: CanUseToolOptions
  ): Promise<PermissionResult> => {
    // Auto-approve read-only and research tools
    if (READ_ONLY_TOOLS.includes(toolName) || isOctocodeTool(toolName)) {
      return { behavior: 'allow', updatedInput: input };
    }

    // Auto-approve if already marked as "always allow"
    if (alwaysAllowedTools.has(toolName)) {
      return { behavior: 'allow', updatedInput: input };
    }

    // Update agent state to show we're waiting for permission
    setAgentState('waiting_permission');

    // Display permission prompt
    console.log();
    console.log(`${c('yellow', '?')} ${bold('Permission Request')}`);
    console.log(`  ${dim('Tool:')} ${c('cyan', toolName)}`);

    if (options.decisionReason) {
      console.log(`  ${dim('Reason:')} ${options.decisionReason}`);
    }

    if (options.blockedPath) {
      console.log(`  ${dim('Blocked Path:')} ${c('red', options.blockedPath)}`);
    }

    if (options.agentID) {
      console.log(`  ${dim('Agent:')} ${options.agentID}`);
    }

    // Show input preview (truncated)
    const inputStr = JSON.stringify(input, null, 2);
    const preview =
      inputStr.length > 300 ? inputStr.slice(0, 300) + '...' : inputStr;
    console.log(`  ${dim('Input:')}`);
    for (const line of preview.split('\n').slice(0, 10)) {
      console.log(`    ${dim(line)}`);
    }
    console.log();

    try {
      // Load inquirer for interactive prompt
      await loadInquirer();

      const choice = await select<'allow' | 'always' | 'deny' | 'stop'>({
        message: 'Allow this operation?',
        choices: [
          { name: `${c('green', '✓')} Allow once`, value: 'allow' },
          {
            name: `${c('green', '✓✓')} Always allow ${toolName}`,
            value: 'always',
          },
          { name: `${c('yellow', '✗')} Deny`, value: 'deny' },
          { name: `${c('red', '✗✗')} Deny and stop agent`, value: 'stop' },
        ],
      });

      // Restore agent state
      setAgentState('executing');

      if (choice === 'allow') {
        return { behavior: 'allow', updatedInput: input };
      }

      if (choice === 'always') {
        alwaysAllowedTools.add(toolName);
        return {
          behavior: 'allow',
          updatedInput: input,
          updatedPermissions: options.suggestions,
        };
      }

      if (choice === 'deny') {
        return {
          behavior: 'deny',
          message: 'User denied permission',
          interrupt: false,
        };
      }

      // stop
      return {
        behavior: 'deny',
        message: 'User stopped the agent',
        interrupt: true,
      };
    } catch {
      // If prompt fails (e.g., non-interactive), deny by default
      console.log(
        `${c('yellow', '⚠')} Non-interactive mode, denying permission`
      );
      setAgentState('executing');
      return {
        behavior: 'deny',
        message: 'Non-interactive mode - permission denied',
        interrupt: false,
      };
    }
  };
}

/**
 * Check if Claude Agent SDK is available
 */
export async function isAgentSDKAvailable(): Promise<boolean> {
  try {
    await import('@anthropic-ai/claude-agent-sdk');
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if agent functionality is ready to use
 */
export async function checkAgentReadiness(): Promise<{
  ready: boolean;
  sdkInstalled: boolean;
  claudeCodeAuth: boolean;
  hasAPIKey: boolean;
  message: string;
}> {
  const sdkInstalled = await isAgentSDKAvailable();
  const claudeCodeAuth = isClaudeCodeAuthenticated();
  const apiKeyResult = await discoverAPIKey('anthropic');
  const hasAPIKey = apiKeyResult.key !== null;

  const ready = sdkInstalled && (claudeCodeAuth || hasAPIKey);

  let message = '';
  if (!sdkInstalled) {
    message =
      'Claude Agent SDK not installed. Run: npm install @anthropic-ai/claude-agent-sdk';
  } else if (!claudeCodeAuth && !hasAPIKey) {
    message =
      'No API credentials found. Install Claude Code or set ANTHROPIC_API_KEY';
  } else {
    message = 'Agent ready';
  }

  return { ready, sdkInstalled, claudeCodeAuth, hasAPIKey, message };
}

/**
 * Run an agent with the given options
 *
 * @example
 * ```typescript
 * const result = await runAgent({
 *   prompt: "Analyze this codebase and suggest improvements",
 *   tools: ['Read', 'Glob', 'Grep', 'Task'],
 *   agents: OCTOCODE_SUBAGENTS,
 * });
 * ```
 */
export async function runAgent(options: AgentOptions): Promise<AgentResult> {
  // Reset tracking for this session
  resetCostTracker();
  resetToolCounter();
  setAgentState('initializing');

  // Set up state change callback for verbose mode
  if (options.verbose) {
    setStateChangeCallback(state => {
      // Display state updates inline
      const elapsed = ((Date.now() - state.startTime) / 1000).toFixed(1);
      const tokens = state.inputTokens + state.outputTokens;
      const stateIcons: Record<string, string> = {
        idle: '⏸',
        initializing: '🔄',
        connecting_mcp: '🔌',
        executing: '⚡',
        thinking: '🧠',
        tool_use: '🔧',
        waiting_permission: '⏳',
        completed: '✅',
        error: '❌',
      };
      const icon = stateIcons[state.state] || '●';

      // Only log significant state changes with stats
      if (
        state.state === 'executing' ||
        state.state === 'thinking' ||
        state.state === 'completed'
      ) {
        console.log(
          `\x1b[90m   ${icon} ${state.state} | ${elapsed}s | ${tokens.toLocaleString()} tokens\x1b[0m`
        );
      }
    });
  }

  // Check readiness
  const readiness = await checkAgentReadiness();
  if (!readiness.ready) {
    setAgentState('error');
    setStateChangeCallback(null);
    return {
      success: false,
      error: readiness.message,
    };
  }

  try {
    // Dynamic import of Claude Agent SDK
    const { query } = await import('@anthropic-ai/claude-agent-sdk');

    // Build query options
    const queryOptions = buildQueryOptions(options);

    let sessionId: string | undefined;
    let result = '';

    setAgentState('connecting_mcp');

    // Run the agent
    for await (const message of query({
      prompt: options.prompt,
      options: queryOptions,
    })) {
      const msg = message as SDKMessage;

      // Capture session ID from init message and log MCP status
      if (msg.type === 'system' && msg.subtype === 'init') {
        sessionId = msg.session_id;
        setAgentState('executing');

        // Log MCP server connection status in verbose mode
        if (options.verbose) {
          const mcpServers = (msg as unknown as Record<string, unknown>)
            .mcp_servers as Array<{ name: string; status: string }> | undefined;
          if (mcpServers && mcpServers.length > 0) {
            console.log('\n🔌 MCP Server Status:');
            for (const server of mcpServers) {
              const icon = server.status === 'connected' ? '✓' : '✗';
              const color = server.status === 'connected' ? '32' : '31'; // green/red
              console.log(
                `   \x1b[${color}m${icon}\x1b[0m ${server.name}: ${server.status}`
              );
            }
          }
        }
      }

      // Track token usage from stream events
      if (msg.type === 'stream_event') {
        const streamMsg = msg as unknown as Record<string, unknown>;
        // Usage is inside the event object, not at the top level
        const event = streamMsg.event as Record<string, unknown> | undefined;
        if (event?.usage) {
          const usage = event.usage as {
            input_tokens?: number;
            output_tokens?: number;
            cache_read_input_tokens?: number;
            cache_creation_input_tokens?: number;
          };
          updateTokenUsage(usage);
        }
        // Also check for usage in message property (message_delta events)
        const message = event?.message as Record<string, unknown> | undefined;
        if (message?.usage) {
          const usage = message.usage as {
            input_tokens?: number;
            output_tokens?: number;
            cache_read_input_tokens?: number;
            cache_creation_input_tokens?: number;
          };
          updateTokenUsage(usage);
        }
      }

      // Update state based on message type
      if (msg.type === 'assistant') {
        const content = msg.message?.content;
        if (content && Array.isArray(content)) {
          const hasThinking = content.some(b => b.type === 'thinking');
          const hasToolUse = content.some(b => b.type === 'tool_use');
          if (hasThinking) {
            setAgentState('thinking');
          } else if (hasToolUse) {
            const toolBlock = content.find(b => b.type === 'tool_use');
            setAgentState('tool_use', toolBlock?.name);
          } else {
            setAgentState('executing');
          }
        }
      }

      // Handle verbose output
      if (options.verbose) {
        logMessage(msg);
      }

      // Capture result and extract final usage
      if (msg.type === 'result') {
        const resultMsg = msg as unknown as Record<string, unknown>;
        if ('result' in resultMsg) {
          result = resultMsg.result as string;
        }

        // Extract usage from result message (this is the authoritative source)
        if (resultMsg.usage) {
          const usage = resultMsg.usage as {
            input_tokens?: number;
            output_tokens?: number;
            cache_read_input_tokens?: number;
            cache_creation_input_tokens?: number;
          };
          // Reset and set final values (result usage is cumulative)
          updateTokenUsage(usage);
        }

        setAgentState('completed');
      }
    }

    // Get final stats
    const stats = getCostStats();
    const finalState = getAgentState();

    // Clear callback
    setStateChangeCallback(null);

    return {
      success: true,
      result,
      sessionId,
      duration: stats.durationMs,
      usage: {
        inputTokens: finalState.inputTokens || stats.totalInputTokens,
        outputTokens: finalState.outputTokens || stats.totalOutputTokens,
        cacheReadTokens: finalState.cacheReadTokens,
        cacheWriteTokens: finalState.cacheWriteTokens,
      },
      cost: stats.totalCost,
    };
  } catch (error) {
    setAgentState('error');
    setStateChangeCallback(null);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Build query options from AgentOptions
 */

/**
 * Find Claude Code executable path
 */
function findClaudeCodePath(): string | undefined {
  // Check common locations
  const paths = [
    '/opt/homebrew/bin/claude', // macOS Homebrew
    '/usr/local/bin/claude', // Linux/macOS manual
    process.env.HOME + '/.local/bin/claude', // npm global (Linux)
    process.env.APPDATA + '/npm/claude.cmd', // Windows npm global
  ].filter(Boolean) as string[];

  for (const p of paths) {
    if (existsSync(p)) {
      return p;
    }
  }

  // Try to find via PATH using which/where
  try {
    const result = execSync(
      'which claude 2>/dev/null || where claude 2>/dev/null',
      {
        encoding: 'utf-8',
      }
    ).trim();
    if (result) return result.split('\n')[0];
  } catch {
    // Ignore - command not found
  }

  return undefined;
}

function buildQueryOptions(options: AgentOptions): Record<string, unknown> {
  const queryOptions: Record<string, unknown> = {};

  // Set Claude Code executable path (required by SDK)
  const claudePath = findClaudeCodePath();
  if (claudePath) {
    queryOptions.pathToClaudeCodeExecutable = claudePath;
  }

  // Working directory
  if (options.cwd) {
    queryOptions.cwd = options.cwd;
  }

  // Tools configuration
  // When MCP servers are configured, we don't restrict allowedTools
  // because MCP tools are named dynamically (mcp__<server>__<tool>)
  // and we want all MCP tools to be available
  if (!options.mcpServers || Object.keys(options.mcpServers).length === 0) {
    const allowedTools: string[] = options.tools
      ? [...options.tools]
      : [...ALL_TOOLS];

    // Include Task tool if subagents are defined
    if (options.agents && !allowedTools.includes('Task')) {
      allowedTools.push('Task');
    }

    queryOptions.allowedTools = allowedTools;
  }
  // When MCP servers are present, don't set allowedTools to allow all tools including MCP tools

  // Permission mode
  if (options.permissionMode) {
    queryOptions.permissionMode = options.permissionMode;

    // Enable dangerous bypass if needed
    if (options.permissionMode === 'bypassPermissions') {
      queryOptions.allowDangerouslySkipPermissions = true;
    }
  }

  // Model
  if (options.model && options.model !== 'inherit') {
    queryOptions.model = options.model;
  }

  // Max turns and budget
  if (options.maxTurns) {
    queryOptions.maxTurns = options.maxTurns;
  }
  if (options.maxBudgetUsd) {
    queryOptions.maxBudgetUsd = options.maxBudgetUsd;
  }

  // System prompt
  if (options.useClaudeCodePrompt) {
    queryOptions.systemPrompt = {
      type: 'preset',
      preset: 'claude_code',
      append: options.systemPrompt || OCTOCODE_SYSTEM_PROMPT,
    };
  } else if (options.systemPrompt) {
    queryOptions.systemPrompt = options.systemPrompt;
  } else {
    queryOptions.systemPrompt = OCTOCODE_SYSTEM_PROMPT;
  }

  // Project settings (CLAUDE.md, etc.)
  if (options.loadProjectSettings) {
    queryOptions.settingSources = ['project'];
  }

  // Subagents
  if (options.agents) {
    queryOptions.agents = options.agents;
  }

  // MCP servers
  if (options.mcpServers) {
    queryOptions.mcpServers = options.mcpServers;
  }

  // Session resume
  if (options.resumeSession) {
    queryOptions.resume = options.resumeSession;
  }

  // Extended thinking
  if (options.maxThinkingTokens) {
    queryOptions.maxThinkingTokens = options.maxThinkingTokens;
  } else if (options.enableThinking) {
    queryOptions.maxThinkingTokens = 16000; // Default
  }

  // Fallback model
  if (options.fallbackModel && options.fallbackModel !== 'inherit') {
    queryOptions.fallbackModel = options.fallbackModel;
  }

  // Output format
  if (options.outputFormat) {
    queryOptions.outputFormat = options.outputFormat;
  }

  // Additional directories
  if (options.additionalDirectories?.length) {
    queryOptions.additionalDirectories = options.additionalDirectories;
  }

  // Disallowed tools
  if (options.disallowedTools?.length) {
    queryOptions.disallowedTools = options.disallowedTools;
  }

  // Enable partial messages to receive stream_event with usage data
  // This is required for real-time token tracking in verbose mode
  if (options.verbose) {
    queryOptions.includePartialMessages = true;
  }

  // Hooks based on verbosity and mode
  const hooks = options.verbose
    ? getVerboseHooks()
    : options.permissionMode === 'bypassPermissions'
      ? getPermissiveHooks()
      : getDefaultHooks();

  queryOptions.hooks = hooks;

  // Interactive permission handler for human-in-the-loop
  // Only enable when interactive=true and not in bypass mode
  if (
    options.interactive &&
    options.permissionMode !== 'bypassPermissions' &&
    options.permissionMode !== 'plan'
  ) {
    queryOptions.canUseTool = createInteractivePermissionHandler();
  }

  // File checkpointing for rewind capability
  if (options.enableFileCheckpointing) {
    queryOptions.enableFileCheckpointing = true;
  }

  return queryOptions;
}

/**
 * Log message for verbose mode - interactive console output
 */
function logMessage(msg: SDKMessage): void {
  if (msg.type === 'assistant') {
    const content = msg.message?.content;
    if (content && Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'text') {
          // Show assistant text with formatting
          const text = block.text as string;
          // Truncate very long texts
          if (text.length > 500) {
            console.log(`\n\x1b[90m💭 ${text.slice(0, 500)}...\x1b[0m`);
          } else {
            console.log(`\n💭 ${text}`);
          }
        }
        // tool_use is handled by verboseLoggingHook
      }
    }
  } else if (msg.type === 'result') {
    console.log(
      '\n\x1b[32m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m'
    );
    console.log('\x1b[32m✅ Agent completed\x1b[0m');
  }
}

// ============================================
// Octocode MCP Server Configuration
// ============================================

/**
 * Get Octocode MCP server configuration for agent use
 */
function getOctocodeMCPConfig(): Record<string, MCPServerConfig> {
  return {
    'octocode-local': {
      type: 'stdio',
      command: OCTOCODE_NPX.command,
      args: OCTOCODE_NPX.args,
    },
  };
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Run a research-focused agent
 * Includes Octocode MCP tools for GitHub and local code research
 */
export async function runResearchAgent(
  prompt: string,
  options: Partial<AgentOptions> = {}
): Promise<AgentResult> {
  return runAgent({
    prompt,
    tools: RESEARCH_TOOLS,
    agents: {
      researcher: OCTOCODE_SUBAGENTS.researcher,
    },
    mcpServers: getOctocodeMCPConfig(),
    loadProjectSettings: true,
    ...options,
  });
}

/**
 * Run a coding-focused agent
 * Includes CLAUDE.md context for memory
 */
export async function runCodingAgent(
  prompt: string,
  options: Partial<AgentOptions> = {}
): Promise<AgentResult> {
  return runAgent({
    prompt,
    tools: CODING_TOOLS,
    agents: {
      codeReviewer: OCTOCODE_SUBAGENTS.codeReviewer,
      testRunner: OCTOCODE_SUBAGENTS.testRunner,
    },
    useClaudeCodePrompt: true,
    loadProjectSettings: true,
    ...options,
  });
}

/**
 * Run a full-featured agent with all subagents
 * Includes Octocode MCP tools and CLAUDE.md context
 */
export async function runFullAgent(
  prompt: string,
  options: Partial<AgentOptions> = {}
): Promise<AgentResult> {
  return runAgent({
    prompt,
    tools: ALL_TOOLS,
    agents: OCTOCODE_SUBAGENTS,
    mcpServers: getOctocodeMCPConfig(),
    useClaudeCodePrompt: true,
    loadProjectSettings: true,
    enableThinking: true,
    ...options,
  });
}

/**
 * Run agent in planning mode (no execution, just plan)
 * Includes Octocode MCP tools for research
 */
export async function runPlanningAgent(
  prompt: string,
  options: Partial<AgentOptions> = {}
): Promise<AgentResult> {
  return runAgent({
    prompt: `Think carefully and create a detailed plan for: ${prompt}\n\nDo NOT execute any code changes. Only create a plan.`,
    tools: RESEARCH_TOOLS,
    mcpServers: getOctocodeMCPConfig(),
    permissionMode: 'plan',
    loadProjectSettings: true,
    enableThinking: true,
    ...options,
  });
}

/**
 * Run agent in delegate mode (team leader pattern)
 *
 * The agent can ONLY delegate work to subagents via the Task tool.
 * It cannot directly edit files, run commands, or access tools.
 * Use this for complex tasks that benefit from coordination.
 */
export async function runDelegateAgent(
  prompt: string,
  options: Partial<AgentOptions> = {}
): Promise<AgentResult> {
  const delegatePrompt = `You are a team leader coordinating work across specialist agents.

Your task: ${prompt}

IMPORTANT CONSTRAINTS:
- You can ONLY delegate work to subagents via the Task tool
- You CANNOT directly edit files, run commands, or use other tools
- Break down the task and assign to appropriate specialists:
  • researcher: for code analysis, exploration, finding implementations
  • codeReviewer: for reviewing code quality and suggesting improvements
  • testRunner: for running and analyzing tests
  • refactorer: for code improvements and cleanup
  • docWriter: for documentation updates

Coordinate the work, synthesize results from subagents, and provide a unified summary.`;

  return runAgent({
    prompt: delegatePrompt,
    tools: ['Task', 'TodoWrite'], // Only coordination tools
    agents: OCTOCODE_SUBAGENTS,
    mcpServers: getOctocodeMCPConfig(),
    permissionMode: 'delegate',
    loadProjectSettings: true,
    enableThinking: true,
    ...options,
  });
}

/**
 * Run agent with interactive mode (human-in-the-loop)
 *
 * The user is prompted before potentially dangerous operations.
 * Includes subagent tracking and permission logging.
 */
export async function runInteractiveAgent(
  prompt: string,
  options: Partial<AgentOptions> = {}
): Promise<AgentResult> {
  return runAgent({
    prompt,
    tools: ALL_TOOLS,
    agents: OCTOCODE_SUBAGENTS,
    mcpServers: getOctocodeMCPConfig(),
    useClaudeCodePrompt: true,
    loadProjectSettings: true,
    enableThinking: true,
    interactive: true, // Enable human-in-the-loop
    verbose: true,
    ...options,
  });
}

// ============================================
// Session Management
// ============================================

/**
 * Resume a previous agent session
 */
export async function resumeSession(
  sessionId: string,
  prompt: string,
  options: Partial<AgentOptions> = {}
): Promise<AgentResult> {
  return runAgent({
    prompt,
    resumeSession: sessionId,
    ...options,
  });
}

// ============================================
// NEW: Modular Coder System
// ============================================

/**
 * Run agent using the new modular coder system
 *
 * This is the recommended way to run agents - provides:
 * - Better state tracking
 * - Per-turn resets
 * - Reflection limits
 * - Centralized IO
 * - Runtime configuration
 */
export async function runModularAgent(
  mode: CoderMode,
  prompt: string,
  options: Partial<CoderConfig> = {}
): Promise<CoderResult> {
  // Get config from manager
  const baseConfig = getConfigForMode(mode);
  const config = { ...baseConfig, ...options };

  // Create and run coder
  const coder = createCoder(mode, config);
  return coder.run(prompt);
}

/**
 * Run research using modular coder
 */
export async function runModularResearch(
  prompt: string,
  options: Partial<CoderConfig> = {}
): Promise<CoderResult> {
  return runModularAgent('research', prompt, options);
}

/**
 * Run coding using modular coder
 */
export async function runModularCoding(
  prompt: string,
  options: Partial<CoderConfig> = {}
): Promise<CoderResult> {
  return runModularAgent('coding', prompt, options);
}

/**
 * Run full agent using modular coder
 */
export async function runModularFull(
  prompt: string,
  options: Partial<CoderConfig> = {}
): Promise<CoderResult> {
  return runModularAgent('full', prompt, options);
}

/**
 * Run planning using modular coder
 */
export async function runModularPlanning(
  prompt: string,
  options: Partial<CoderConfig> = {}
): Promise<CoderResult> {
  return runModularAgent('planning', prompt, options);
}

/**
 * Convert CoderResult to AgentResult for backward compatibility
 */
export function coderResultToAgentResult(result: CoderResult): AgentResult {
  return {
    success: result.success,
    result: result.result,
    error: result.error,
    sessionId: result.sessionId,
    duration: result.duration,
    usage: result.usage,
    cost: result.cost,
  };
}

// ============================================
// Exports
// ============================================

export {
  OCTOCODE_SYSTEM_PROMPT,
  RESEARCH_TOOLS,
  CODING_TOOLS,
  ALL_TOOLS,
  getOctocodeMCPConfig,
};

// Re-export system prompts for external use
export {
  OCTOCODE_RESEARCH_PROMPT,
  OCTOCODE_FULL_AGENT_PROMPT,
  SUBAGENT_PROMPTS,
  MINIFIED_CODE_RESEARCH_PROMPT,
  SYSTEM_PROMPTS,
} from './system-prompts.js';

// Re-export modular coder system
export {
  createCoder,
  createResearchCoder,
  createCodingCoder,
  createFullCoder,
  createPlanningCoder,
  type CoderMode,
  type CoderConfig,
  type CoderResult,
} from './coders/index.js';

// Re-export AgentIO
export { AgentIO, createAgentIO } from './agent-io.js';

// Re-export config manager
export {
  AgentConfigManager,
  defaultConfigManager,
  getConfigForMode,
  createConfigManager,
} from './agent-config.js';

export type {
  AgentOptions,
  AgentResult,
  AgentDefinition,
} from '../types/agent.js';
