/**
 * Agent Hooks for octocode-cli
 *
 * Provides hook configurations for:
 * - Audit logging (track all tool calls)
 * - Security controls (block dangerous operations)
 * - Octocode integration (inject MCP context)
 * - Cost tracking
 * - Performance monitoring
 *
 * Best Practices from Anthropic:
 * - Use PreToolUse hooks to validate/block before execution
 * - Use PostToolUse hooks for logging and auditing
 * - Keep hooks focused and chain multiple for complex logic
 * - Return empty {} to allow, explicit deny to block
 */

import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type {
  HookCallback,
  HookInput,
  HookOutput,
  HookMatcher,
  HookEventName,
  AgentStateType,
  AgentStateInfo,
} from '../types/agent.js';
import { HOME } from '../utils/platform.js';
import { c, bold, dim } from '../utils/colors.js';
import {
  appendResearchFinding,
  summarizeQuery,
  summarizeResponse,
  isOctocodeResearchTool,
} from '../utils/research-output.js';

// ============================================
// Audit Logging Hooks
// ============================================

const AUDIT_LOG_DIR = join(HOME, '.octocode', 'logs');
const AUDIT_LOG_FILE = join(AUDIT_LOG_DIR, 'agent-audit.log');

function ensureLogDir(): void {
  if (!existsSync(AUDIT_LOG_DIR)) {
    mkdirSync(AUDIT_LOG_DIR, { recursive: true, mode: 0o700 });
  }
}

function formatLogEntry(entry: Record<string, unknown>): string {
  return JSON.stringify({
    ...entry,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Audit logger hook - logs all tool calls to file
 */
export const auditLoggerHook: HookCallback = async (
  input: HookInput,
  toolUseId: string | undefined
): Promise<HookOutput> => {
  ensureLogDir();

  const logEntry = {
    event: input.hook_event_name,
    sessionId: input.session_id,
    toolName: input.tool_name,
    toolUseId,
    cwd: input.cwd,
  };

  // Add tool-specific info
  if (input.hook_event_name === 'PreToolUse') {
    Object.assign(logEntry, {
      toolInput: sanitizeForLog(input.tool_input),
    });
  } else if (input.hook_event_name === 'PostToolUse') {
    Object.assign(logEntry, {
      hasResponse: input.tool_response !== undefined,
    });
  }

  try {
    appendFileSync(AUDIT_LOG_FILE, formatLogEntry(logEntry) + '\n');
  } catch {
    // Silently fail - don't block agent on logging errors
  }

  return {};
};

/**
 * Sanitize tool input for logging (remove sensitive data)
 */
function sanitizeForLog(
  input: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!input) return undefined;

  const sanitized = { ...input };

  // Mask sensitive fields
  const sensitiveFields = ['api_key', 'apiKey', 'token', 'password', 'secret'];
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '***REDACTED***';
    }
  }

  // Truncate large content fields
  if (typeof sanitized.content === 'string' && sanitized.content.length > 500) {
    sanitized.content = sanitized.content.slice(0, 500) + '...[truncated]';
  }

  return sanitized;
}

// ============================================
// Security Hooks
// ============================================

/** Dangerous command patterns to block */
const DANGEROUS_PATTERNS = [
  /rm\s+(-rf?|--recursive)\s+[/~]/i, // rm -rf / or ~
  />\s*\/dev\/sd[a-z]/i, // Write to raw disk
  /mkfs\./i, // Format filesystem
  /dd\s+if=.*of=\/dev/i, // dd to device
  /:(){ :|:& };:/i, // Fork bomb
  /chmod\s+-R\s+777\s+\//i, // chmod 777 /
  /curl.*\|\s*(ba)?sh/i, // curl | sh
  /wget.*\|\s*(ba)?sh/i, // wget | sh
];

/** Sensitive file patterns */
const SENSITIVE_FILE_PATTERNS = [
  /^\/etc\/(passwd|shadow|sudoers)/,
  /^\/(root|home\/[^/]+)\/.ssh\//,
  /\.env($|\.)/,
  /credentials\.json$/,
  /\.pem$/,
  /private[_-]?key/i,
];

/**
 * Security hook - blocks dangerous bash commands
 */
export const blockDangerousCommandsHook: HookCallback = async (
  input: HookInput
): Promise<HookOutput> => {
  if (input.hook_event_name !== 'PreToolUse') return {};
  if (input.tool_name !== 'Bash') return {};

  const command = (input.tool_input?.command as string) || '';

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `Blocked dangerous command pattern: ${pattern.source}`,
        },
      };
    }
  }

  return {};
};

/**
 * Security hook - warns about sensitive file access
 */
export const sensitiveFileAccessHook: HookCallback = async (
  input: HookInput
): Promise<HookOutput> => {
  if (input.hook_event_name !== 'PreToolUse') return {};
  if (!['Read', 'Write', 'Edit'].includes(input.tool_name || '')) return {};

  const filePath = (input.tool_input?.file_path as string) || '';

  for (const pattern of SENSITIVE_FILE_PATTERNS) {
    if (pattern.test(filePath)) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason: `Sensitive file detected: ${filePath}`,
        },
      };
    }
  }

  return {};
};

/**
 * Security hook - prevents secrets from being written to files
 */
export const preventSecretLeakHook: HookCallback = async (
  input: HookInput
): Promise<HookOutput> => {
  if (input.hook_event_name !== 'PreToolUse') return {};
  if (!['Write', 'Edit'].includes(input.tool_name || '')) return {};

  const content =
    (input.tool_input?.content as string) ||
    (input.tool_input?.new_string as string) ||
    '';

  // Check for common secret patterns
  const secretPatterns = [
    /sk-[a-zA-Z0-9]{20,}/g, // API keys
    /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g,
    /AKIA[0-9A-Z]{16}/g, // AWS access keys
    /ghp_[a-zA-Z0-9]{36}/g, // GitHub personal tokens
    /gho_[a-zA-Z0-9]{36}/g, // GitHub OAuth tokens
  ];

  for (const pattern of secretPatterns) {
    if (pattern.test(content)) {
      return {
        systemMessage:
          'Warning: The content appears to contain secrets or API keys. Consider using environment variables instead.',
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason:
            'Content may contain secrets. Please confirm this is intentional.',
        },
      };
    }
  }

  return {};
};

// ============================================
// Octocode Integration Hooks
// ============================================

/**
 * Octocode context hook - kept for backward compatibility
 * Note: MCP tool information is now in the main system prompt (OCTOCODE_SYSTEM_PROMPT)
 */
export const octocodeContextHook: HookCallback = async (
  input: HookInput
): Promise<HookOutput> => {
  // The main system prompt now contains all MCP tool information
  // This hook is kept for potential future context injection
  if (input.hook_event_name !== 'UserPromptSubmit') return {};
  return {};
};

// ============================================
// Performance & Cost Tracking Hooks
// ============================================

/** In-memory agent state tracker */
const agentState: AgentStateInfo = {
  state: 'idle',
  startTime: Date.now(),
  lastUpdate: Date.now(),
  currentTool: undefined,
  toolCount: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

/** In-memory cost tracker */
const costTracker = {
  totalCost: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  toolCalls: 0,
  startTime: Date.now(),
};

/** State change callback for UI updates */
let stateChangeCallback: ((state: AgentStateInfo) => void) | null = null;

/**
 * Set callback for state changes (for UI updates)
 */
export function setStateChangeCallback(
  callback: ((state: AgentStateInfo) => void) | null
): void {
  stateChangeCallback = callback;
}

/**
 * Update agent state and notify listeners
 */
export function updateAgentState(
  newState: Partial<AgentStateInfo>
): AgentStateInfo {
  Object.assign(agentState, newState, { lastUpdate: Date.now() });
  stateChangeCallback?.(agentState);
  return agentState;
}

/**
 * Set agent state type with optional tool info
 */
export function setAgentState(
  state: AgentStateType,
  currentTool?: string
): AgentStateInfo {
  return updateAgentState({ state, currentTool });
}

/**
 * Get current agent state
 */
export function getAgentState(): AgentStateInfo {
  return { ...agentState };
}

/**
 * Update token usage from SDK message
 */
export function updateTokenUsage(usage: {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}): void {
  if (usage.input_tokens) {
    agentState.inputTokens += usage.input_tokens;
    costTracker.totalInputTokens += usage.input_tokens;
  }
  if (usage.output_tokens) {
    agentState.outputTokens += usage.output_tokens;
    costTracker.totalOutputTokens += usage.output_tokens;
  }
  if (usage.cache_read_input_tokens) {
    agentState.cacheReadTokens += usage.cache_read_input_tokens;
  }
  if (usage.cache_creation_input_tokens) {
    agentState.cacheWriteTokens += usage.cache_creation_input_tokens;
  }
  agentState.lastUpdate = Date.now();
  stateChangeCallback?.(agentState);
}

/**
 * Cost tracking hook - monitors API usage
 */
export const costTrackingHook: HookCallback = async (
  input: HookInput
): Promise<HookOutput> => {
  if (input.hook_event_name === 'PreToolUse') {
    costTracker.toolCalls++;
    agentState.toolCount++;
    setAgentState('tool_use', input.tool_name);
  } else if (input.hook_event_name === 'PostToolUse') {
    setAgentState('executing');
  }

  return {};
};

/**
 * Get current cost tracking stats
 */
export function getCostStats(): typeof costTracker & { durationMs: number } {
  return {
    ...costTracker,
    durationMs: Date.now() - costTracker.startTime,
  };
}

/**
 * Reset cost tracker and agent state
 */
export function resetCostTracker(): void {
  costTracker.totalCost = 0;
  costTracker.totalInputTokens = 0;
  costTracker.totalOutputTokens = 0;
  costTracker.toolCalls = 0;
  costTracker.startTime = Date.now();

  // Reset agent state
  agentState.state = 'idle';
  agentState.startTime = Date.now();
  agentState.lastUpdate = Date.now();
  agentState.currentTool = undefined;
  agentState.toolCount = 0;
  agentState.inputTokens = 0;
  agentState.outputTokens = 0;
  agentState.cacheReadTokens = 0;
  agentState.cacheWriteTokens = 0;
}

// ============================================
// Auto-Approve Hooks (for trusted operations)
// ============================================

/** Read-only tools that are safe to auto-approve */
const READ_ONLY_TOOLS = ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch'];

/**
 * Auto-approve read-only operations
 */
export const autoApproveReadOnlyHook: HookCallback = async (
  input: HookInput
): Promise<HookOutput> => {
  if (input.hook_event_name !== 'PreToolUse') return {};

  if (READ_ONLY_TOOLS.includes(input.tool_name || '')) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: 'Read-only operation auto-approved',
      },
    };
  }

  return {};
};

/**
 * Auto-approve Octocode MCP tools (they're read-only research tools)
 */
export const autoApproveOctocodeToolsHook: HookCallback = async (
  input: HookInput
): Promise<HookOutput> => {
  if (input.hook_event_name !== 'PreToolUse') return {};

  const toolName = input.tool_name || '';

  if (toolName.startsWith('mcp__octocode')) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: 'Octocode MCP tool auto-approved',
      },
    };
  }

  return {};
};

// ============================================
// Subagent Lifecycle Hooks
// ============================================

/**
 * Subagent start hook - logs when subagents are spawned
 */
export const subagentStartHook: HookCallback = async (
  input: HookInput
): Promise<HookOutput> => {
  if (input.hook_event_name !== 'SubagentStart') return {};

  // Cast through unknown for extended properties
  const hookInput = input as unknown as {
    hook_event_name: 'SubagentStart';
    agent_id: string;
    agent_type: string;
    session_id: string;
  };

  console.log();
  console.log(`${c('cyan', '+')} ${bold('Subagent Started')}`);
  console.log(`  ${dim('Type:')} ${hookInput.agent_type || 'unknown'}`);
  console.log(`  ${dim('ID:')} ${(hookInput.agent_id || '').slice(0, 20)}...`);

  return {};
};

/**
 * Subagent stop hook - logs when subagents complete
 */
export const subagentStopHook: HookCallback = async (
  input: HookInput
): Promise<HookOutput> => {
  if (input.hook_event_name !== 'SubagentStop') return {};

  // Cast through unknown for extended properties
  const hookInput = input as unknown as {
    hook_event_name: 'SubagentStop';
    agent_id: string;
    agent_transcript_path: string;
    stop_hook_active: boolean;
  };

  console.log();
  console.log(`${c('green', '✓')} ${bold('Subagent Completed')}`);
  console.log(`  ${dim('ID:')} ${(hookInput.agent_id || '').slice(0, 20)}...`);

  return {};
};

// ============================================
// Permission Request Hook
// ============================================

/**
 * Permission request hook - intercepts permission prompts
 * Can be used to auto-approve, modify, or log permission requests
 */
export const permissionRequestHook: HookCallback = async (
  input: HookInput
): Promise<HookOutput> => {
  if (input.hook_event_name !== 'PermissionRequest') return {};

  const toolName = input.tool_name || '';

  // Log permission requests in verbose mode
  console.log(`\n${c('yellow', '?')} Permission requested: ${toolName}`);

  // Auto-approve Octocode MCP tools (research-only)
  if (toolName.startsWith('mcp__octocode')) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
        permissionDecisionReason: 'Octocode MCP tools are auto-approved',
      },
    };
  }

  // Let user/other hooks handle
  return {};
};

// ============================================
// Hook Configuration Presets
// ============================================

/**
 * Default hooks for general agent usage
 * Includes: audit logging, security, cost tracking
 */
export function getDefaultHooks(): Partial<
  Record<HookEventName, HookMatcher[]>
> {
  return {
    PreToolUse: [
      { matcher: 'Bash', hooks: [blockDangerousCommandsHook] },
      { matcher: 'Read|Write|Edit', hooks: [sensitiveFileAccessHook] },
      { matcher: 'Write|Edit', hooks: [preventSecretLeakHook] },
      { hooks: [auditLoggerHook, costTrackingHook] },
    ],
    PostToolUse: [{ hooks: [auditLoggerHook] }],
    UserPromptSubmit: [{ hooks: [octocodeContextHook] }],
  };
}

/**
 * Strict security hooks (more restrictive)
 */
export function getStrictSecurityHooks(): Partial<
  Record<HookEventName, HookMatcher[]>
> {
  return {
    PreToolUse: [
      { matcher: 'Bash', hooks: [blockDangerousCommandsHook] },
      { matcher: 'Read|Write|Edit', hooks: [sensitiveFileAccessHook] },
      { matcher: 'Write|Edit', hooks: [preventSecretLeakHook] },
      { hooks: [auditLoggerHook] },
    ],
    PostToolUse: [{ hooks: [auditLoggerHook] }],
  };
}

/**
 * Fast/permissive hooks (auto-approve most operations)
 * Use with caution - bypasses many security checks
 */
export function getPermissiveHooks(): Partial<
  Record<HookEventName, HookMatcher[]>
> {
  return {
    PreToolUse: [
      { matcher: 'Bash', hooks: [blockDangerousCommandsHook] }, // Still block truly dangerous commands
      { hooks: [autoApproveReadOnlyHook, autoApproveOctocodeToolsHook] },
    ],
    UserPromptSubmit: [{ hooks: [octocodeContextHook] }],
  };
}

/**
 * Research output hook - captures Octocode MCP tool findings to file
 * Appends findings to .octocode/research/findings.md in the project
 */
export const researchOutputHook: HookCallback = async (
  input: HookInput
): Promise<HookOutput> => {
  // Only run on PostToolUse
  if (input.hook_event_name !== 'PostToolUse') return {};

  // Only capture Octocode research tools
  const toolName = input.tool_name || '';
  if (!isOctocodeResearchTool(toolName)) return {};

  // Build finding entry
  const finding = {
    tool: toolName,
    timestamp: new Date().toISOString(),
    query: summarizeQuery(input.tool_input),
    summary: summarizeResponse(input.tool_response),
  };

  // Append to findings file (silently fail if errors)
  try {
    await appendResearchFinding(input.cwd, finding);
  } catch {
    // Don't interrupt agent on research output errors
  }

  return {};
};

/**
 * Research-focused hooks (optimized for code exploration)
 * Now includes research output hook for auto-capturing findings
 */
export function getResearchHooks(): Partial<
  Record<HookEventName, HookMatcher[]>
> {
  return {
    PreToolUse: [
      // Auto-approve all read operations and Octocode tools
      { hooks: [autoApproveReadOnlyHook, autoApproveOctocodeToolsHook] },
      // Block writes and dangerous commands
      { matcher: 'Bash', hooks: [blockDangerousCommandsHook] },
    ],
    UserPromptSubmit: [{ hooks: [octocodeContextHook] }],
    PostToolUse: [
      // Capture research findings and audit log
      { hooks: [researchOutputHook, auditLoggerHook] },
    ],
  };
}

// ============================================
// Verbose/Debug Hooks
// ============================================

/** Tool execution counter for progress tracking */
let toolExecutionCount = 0;
let currentToolStartTime = 0;

/** Reset tool counter (call at start of agent run) */
export function resetToolCounter(): void {
  toolExecutionCount = 0;
  currentToolStartTime = 0;
}

/** Format tool name for display (shorten MCP tool names) */
function formatToolName(toolName: string): string {
  if (toolName.startsWith('mcp__octocode-local__')) {
    return toolName.replace('mcp__octocode-local__', '🔍 ');
  }
  return toolName;
}

/** Get color code for tool type */
function getToolColor(toolName: string): string {
  if (toolName.startsWith('mcp__')) return '36'; // cyan for MCP
  if (['Read', 'Glob', 'Grep'].includes(toolName)) return '34'; // blue for read
  if (['Write', 'Edit'].includes(toolName)) return '33'; // yellow for write
  if (toolName === 'Bash') return '35'; // magenta for bash
  if (['WebSearch', 'WebFetch'].includes(toolName)) return '32'; // green for web
  return '37'; // white default
}

/**
 * Verbose logging hook - interactive console output with progress
 */
export const verboseLoggingHook: HookCallback = async (
  input: HookInput,
  _toolUseId: string | undefined
): Promise<HookOutput> => {
  if (input.hook_event_name === 'PreToolUse') {
    toolExecutionCount++;
    currentToolStartTime = Date.now();

    const toolName = input.tool_name || 'unknown';
    const displayName = formatToolName(toolName);
    const color = getToolColor(toolName);

    // Show tool execution with counter
    console.log(
      `\n\x1b[${color}m[${toolExecutionCount}]\x1b[0m 🔧 ${displayName}`
    );

    // Show compact input for MCP tools
    if (input.tool_input) {
      const sanitized = sanitizeForLog(input.tool_input);
      if (sanitized) {
        // For MCP tools, show key params only
        if (toolName.startsWith('mcp__')) {
          const keyParams = [
            'pattern',
            'path',
            'query',
            'owner',
            'repo',
            'name',
          ];
          const compact: Record<string, unknown> = {};
          for (const key of keyParams) {
            if (key in sanitized) compact[key] = sanitized[key];
          }
          if (Object.keys(compact).length > 0) {
            console.log(`   → ${JSON.stringify(compact)}`);
          }
        } else {
          // For other tools, show first 200 chars of stringified input
          const str = JSON.stringify(sanitized);
          console.log(
            `   → ${str.slice(0, 200)}${str.length > 200 ? '...' : ''}`
          );
        }
      }
    }
  } else if (input.hook_event_name === 'PostToolUse') {
    const duration = currentToolStartTime
      ? Date.now() - currentToolStartTime
      : 0;
    const durationStr = duration > 0 ? ` (${duration}ms)` : '';
    console.log(`   \x1b[32m✓\x1b[0m completed${durationStr}`);
  } else if (input.hook_event_name === 'UserPromptSubmit') {
    toolExecutionCount = 0; // Reset counter for new prompt
    console.log(`\n📝 \x1b[1mTask:\x1b[0m ${input.prompt?.slice(0, 150)}...`);
    console.log(
      '\x1b[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m'
    );
  }

  return {};
};

/**
 * Get hooks with verbose logging enabled
 */
export function getVerboseHooks(): Partial<
  Record<HookEventName, HookMatcher[]>
> {
  return {
    PreToolUse: [
      {
        hooks: [
          verboseLoggingHook,
          autoApproveOctocodeToolsHook,
          blockDangerousCommandsHook,
        ],
      },
    ],
    PostToolUse: [{ hooks: [verboseLoggingHook, auditLoggerHook] }],
    UserPromptSubmit: [{ hooks: [verboseLoggingHook, octocodeContextHook] }],
    SubagentStart: [{ hooks: [subagentStartHook] }],
    SubagentStop: [{ hooks: [subagentStopHook] }],
    PermissionRequest: [{ hooks: [permissionRequestHook] }],
  };
}

/**
 * Get hooks for interactive mode (human-in-the-loop)
 * Includes subagent tracking and permission request logging
 */
export function getInteractiveHooks(): Partial<
  Record<HookEventName, HookMatcher[]>
> {
  return {
    PreToolUse: [
      {
        hooks: [verboseLoggingHook, blockDangerousCommandsHook],
      },
    ],
    PostToolUse: [{ hooks: [verboseLoggingHook, auditLoggerHook] }],
    UserPromptSubmit: [{ hooks: [verboseLoggingHook, octocodeContextHook] }],
    SubagentStart: [{ hooks: [subagentStartHook] }],
    SubagentStop: [{ hooks: [subagentStopHook] }],
  };
}
