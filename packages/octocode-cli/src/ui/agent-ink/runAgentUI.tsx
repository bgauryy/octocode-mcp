/**
 * Agent UI Runner
 *
 * Entry point for running agents with the interactive Ink-based UI.
 * Integrates Claude Agent SDK with React-based terminal rendering.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { render } from 'ink';
import { AgentView } from './AgentView.js';
import { useAgent } from './useAgent.js';
// Note: useBackgroundTasks is called internally by useAgent - no need to import here
import type {
  AgentUIConfig,
  AgentStateType,
  AgentContentLimits,
} from './types.js';
import { DEFAULT_AGENT_CONFIG, DEFAULT_CONTENT_LIMITS } from './types.js';
import type {
  AgentOptions,
  AgentResult,
  SDKMessage,
  HookCallback,
  HookInput,
  HookOutput,
  HookEventName,
  HookMatcher,
} from '../../types/agent.js';
import {
  resetCostTracker,
  resetToolCounter,
  getDefaultHooks,
  getPermissiveHooks,
  blockDangerousCommandsHook,
  autoApproveOctocodeToolsHook,
} from '../../features/agent-hooks.js';
import {
  checkAgentReadiness,
  getOctocodeMCPConfig,
  isAgentSDKAvailable,
} from '../../features/agent.js';
import {
  setCurrentSessionId,
  clearCurrentSessionId,
} from '../../features/session-context.js';
import { classifyTask as classifyTaskFn } from '../agent/prompts.js';

// Async wrapper for classifyTask

// Helper to truncate content based on config limits
function truncateContent(content: string, maxChars: number): string {
  if (maxChars <= 0) return content; // 0 means no limit
  if (content.length <= maxChars) return content;
  const truncated = content.length - maxChars;
  return (
    content.slice(0, maxChars) +
    `... [truncated ${truncated.toLocaleString()} chars]`
  );
}
async function classifyTaskAsync(task: string): Promise<{ mode: string }> {
  const result = await classifyTaskFn(task);
  return { mode: result.mode };
}

// ============================================
// Types
// ============================================

export interface RunAgentUIOptions {
  /** Task to execute (optional - will prompt if not provided) */
  task?: string;
  /** Agent mode (research, coding, full, etc.) */
  mode?: string;
  /** Model to use */
  model?: string;
  /** Agent options */
  agentOptions?: Omit<AgentOptions, 'prompt'>;
  /** UI configuration */
  uiConfig?: Partial<AgentUIConfig>;
}

// ============================================
// Agent UI Wrapper Component
// ============================================

interface AgentUIWrapperProps {
  initialTask?: string;
  initialMode?: string;
  model?: string;
  agentOptions?: Omit<AgentOptions, 'prompt'>;
  uiConfig?: Partial<AgentUIConfig>;
  onComplete: (result: AgentResult) => void;
}

function AgentUIWrapper({
  initialTask,
  initialMode = 'research',
  model,
  agentOptions = {},
  uiConfig,
  onComplete,
}: AgentUIWrapperProps): React.ReactElement {
  const [task, setTask] = useState(initialTask || '');
  const [mode, setMode] = useState(initialMode);

  // Get config values with defaults - explicitly pass to useAgent to override its internal default
  const configMaxMessages =
    uiConfig?.maxMessages ?? DEFAULT_AGENT_CONFIG.maxMessages;
  const contentLimits = uiConfig?.contentLimits || DEFAULT_CONTENT_LIMITS;

  const {
    state,
    setAgentState,
    addThinkingMessage,
    addSystemMessage,
    addErrorMessage,
    setResult,
    setError,
    addToolCall,
    completeToolCall,
    updateTokens,
    appendStreamingText,
    finalizeStreamingText,
  } = useAgent({ task, mode, model, maxMessages: configMaxMessages });

  // Note: backgroundTasks comes from useAgent (which calls useBackgroundTasks internally)
  // No need to call useBackgroundTasks again here - it would create duplicate subscriptions

  const [isRunning, setIsRunning] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const cancelledRef = useRef(false);
  // FIFO queue per tool name to handle concurrent tools with same name
  // Key: tool name, Value: array of IDs in order they were started
  const toolCallMapRef = useRef(new Map<string, string[]>());

  // Show input state if no task provided
  useEffect(() => {
    if (!initialTask && !hasStarted) {
      setAgentState('waiting_for_input');
    }
  }, [initialTask, hasStarted, setAgentState]);

  // Run agent when task is set and not already running
  useEffect(() => {
    if (task && !isRunning && hasStarted) {
      setIsRunning(true);
      runAgentWithUI();
    }
  }, [task, hasStarted]);

  // Start immediately if task was provided
  useEffect(() => {
    if (initialTask && !hasStarted) {
      setHasStarted(true);
      setIsRunning(true);
      runAgentWithUI();
    }
  }, [initialTask]);

  // Handle task submission from input
  const handleTaskSubmit = useCallback((submittedTask: string) => {
    setTask(submittedTask);
    setHasStarted(true);

    // Auto-classify task for mode
    classifyTaskAsync(submittedTask).then(({ mode: detectedMode }) => {
      setMode(detectedMode);
    });
  }, []);

  const runAgentWithUI = useCallback(async () => {
    resetCostTracker();
    resetToolCounter();
    setAgentState('initializing');

    // Check SDK availability FIRST - this is required for agent mode
    const sdkAvailable = await isAgentSDKAvailable();
    if (!sdkAvailable) {
      setAgentState('error');
      const errorMsg =
        'Claude Code CLI is required for agent mode.\n\n' +
        '  Install with: npm install -g @anthropic-ai/claude-code\n\n' +
        '  For chat without Claude Code CLI, use: octocode chat';
      setError(errorMsg);
      onComplete({
        success: false,
        error: errorMsg,
      });
      return;
    }

    // Check provider/auth readiness
    const readiness = await checkAgentReadiness();
    if (!readiness.ready) {
      setAgentState('error');
      setError(readiness.message);
      onComplete({
        success: false,
        error: readiness.message,
      });
      return;
    }

    try {
      // Dynamic import of Claude Agent SDK (verified available above)
      const { query } = await import('@anthropic-ai/claude-agent-sdk');

      // Build agent options based on mode if not provided
      const effectiveAgentOptions =
        Object.keys(agentOptions).length > 0
          ? agentOptions
          : buildDefaultAgentOptions(mode);

      // Build query options with UI-aware hooks
      const queryOptions = buildQueryOptionsWithUIHooks(effectiveAgentOptions, {
        addToolCall,
        completeToolCall,
        toolCallMapRef,
        contentLimits,
      });

      let result = '';

      setAgentState('connecting_mcp');
      addSystemMessage('Starting agent...');

      // Run the agent
      for await (const message of query({
        prompt: task,
        options: queryOptions,
      })) {
        if (cancelledRef.current) {
          break;
        }

        const msg = message as SDKMessage;
        handleSDKMessage(msg, {
          setAgentState,
          addThinkingMessage,
          addSystemMessage,
          updateTokens,
          onSessionId: (sessionId: string) => {
            // Set session context for background task tracking
            setCurrentSessionId(sessionId);
          },
          contentLimits,
          onResult: r => {
            result = r;
          },
          onStreamingText: appendStreamingText,
        });
      }

      // Complete
      finalizeStreamingText(); // Finalize any pending streaming text
      setAgentState('completed');
      setResult(result);
      setIsRunning(false);
      setTask('');

      // Clear session context
      clearCurrentSessionId();

      // Call onComplete to propagate result to caller
      // This allows the Promise in runAgentUI to resolve with the result
      onComplete({
        success: true,
        result,
      });

      // Add a small delay before showing input again to let user see completion
      setTimeout(() => {
        setAgentState('waiting_for_input');
      }, 1000);
    } catch (error) {
      setAgentState('error');
      let errorMsg = error instanceof Error ? error.message : String(error);

      // Provide more helpful error messages for common issues
      if (
        errorMsg.includes('executable not found') ||
        errorMsg.includes('Claude Code')
      ) {
        errorMsg =
          'Claude Code CLI is required for agent mode. Install with: npm install -g @anthropic-ai/claude-code';
      } else if (errorMsg.includes('ANTHROPIC_API_KEY')) {
        errorMsg =
          'Missing ANTHROPIC_API_KEY. Set the environment variable or configure an AI provider.';
      }

      setError(errorMsg);
      // Clear session context on error
      clearCurrentSessionId();
      // Even on error, we might want to let user try again
      setIsRunning(false);
      setTask('');
      // setAgentState('waiting_for_input'); // Maybe let user see error first
    }
  }, [task, agentOptions, mode]);

  const handleCancel = useCallback(() => {
    if (isRunning) {
      cancelledRef.current = true;
      setAgentState('error');
      addErrorMessage('Agent cancelled by user');
      // Clear session context on cancel
      clearCurrentSessionId();
      setIsRunning(false);
      setTask('');
      setAgentState('waiting_for_input');
    } else {
      // If not running, exit the app
      clearCurrentSessionId();
      onComplete({
        success: true, // or false?
        result: 'Exited by user',
      });
    }
  }, [isRunning]);

  // state already includes backgroundTasks from useAgent hook
  // No need to merge - just use state directly

  return (
    <AgentView
      state={state}
      config={uiConfig}
      onCancel={handleCancel}
      onTaskSubmit={handleTaskSubmit}
    />
  );
}

// ============================================
// SDK Message Handler
// ============================================

interface MessageHandlerCallbacks {
  setAgentState: (state: AgentStateType, tool?: string) => void;
  addThinkingMessage: (content: string) => string;
  addSystemMessage: (content: string) => string;
  updateTokens: (usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  }) => void;
  onSessionId: (id: string) => void;
  onResult: (result: string) => void;
  onStreamingText: (text: string) => void;
  contentLimits: AgentContentLimits;
}

function handleSDKMessage(
  msg: SDKMessage,
  callbacks: MessageHandlerCallbacks
): void {
  const {
    setAgentState,
    addThinkingMessage,
    addSystemMessage,
    updateTokens,
    onSessionId,
    onResult,
    onStreamingText,
    contentLimits,
  } = callbacks;

  // Handle init message
  if (msg.type === 'system' && msg.subtype === 'init') {
    if (msg.session_id) {
      onSessionId(msg.session_id);
    }
    setAgentState('executing');

    // Log MCP status
    const mcpServers = (msg as unknown as Record<string, unknown>)
      .mcp_servers as Array<{ name: string; status: string }> | undefined;
    if (mcpServers && mcpServers.length > 0) {
      const connected = mcpServers.filter(s => s.status === 'connected');
      addSystemMessage(
        `Connected to ${connected.length}/${mcpServers.length} MCP servers`
      );
    }
  }

  // Track token usage and streaming text
  if (msg.type === 'stream_event') {
    const streamMsg = msg as unknown as Record<string, unknown>;
    const event = streamMsg.event as Record<string, unknown> | undefined;

    // Handle streaming text from content_block_delta events
    if (event?.type === 'content_block_delta') {
      const delta = event.delta as Record<string, unknown> | undefined;
      if (delta?.type === 'text_delta' && delta?.text) {
        setAgentState('formulating_answer');
        onStreamingText(delta.text as string);
      } else if (delta?.type === 'thinking_delta' && delta?.thinking) {
        // Only update state indicator for thinking - don't stream thinking content
        // The full thinking block will be added via addThinkingMessage when assistant message arrives
        // This avoids duplicate display (streaming as text + final as thinking)
        setAgentState('thinking');
      }
    }

    // Handle content block start to identify block types
    if (event?.type === 'content_block_start') {
      const contentBlock = event.content_block as
        | Record<string, unknown>
        | undefined;
      if (contentBlock?.type === 'text') {
        setAgentState('formulating_answer');
      } else if (contentBlock?.type === 'thinking') {
        setAgentState('thinking');
      } else if (contentBlock?.type === 'tool_use') {
        setAgentState('tool_use', contentBlock.name as string);
      }
    }

    if (event?.usage) {
      updateTokens(
        event.usage as {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
          cache_creation_input_tokens?: number;
        }
      );
    }
    const message = event?.message as Record<string, unknown> | undefined;
    if (message?.usage) {
      updateTokens(
        message.usage as {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
          cache_creation_input_tokens?: number;
        }
      );
    }
  }

  // Handle assistant messages
  // NOTE: We do NOT add text messages here because streaming (stream_event with text_delta)
  // already handles adding text to the UI in real-time via onStreamingText.
  // Adding text here would cause duplicate messages.
  if (msg.type === 'assistant') {
    const content = msg.message?.content;
    if (content && Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'thinking') {
          setAgentState('thinking');
          const thinkingText = (block as { thinking?: string }).thinking;
          if (thinkingText) {
            addThinkingMessage(
              truncateContent(thinkingText, contentLimits.maxThinkingChars)
            );
          }
        } else if (block.type === 'text') {
          // Text is handled by stream_event - just update state
          setAgentState('executing');
        } else if (block.type === 'tool_use') {
          const toolBlock = block as { name?: string };
          setAgentState('tool_use', toolBlock.name);
        }
      }
    }
  }

  // Handle result
  if (msg.type === 'result') {
    const resultMsg = msg as unknown as Record<string, unknown>;
    if ('result' in resultMsg) {
      onResult(resultMsg.result as string);
    }
    if (resultMsg.usage) {
      updateTokens(
        resultMsg.usage as {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
          cache_creation_input_tokens?: number;
        }
      );
    }
    setAgentState('completed');
  }
}

// ============================================
// Query Options Builder with UI Hooks
// ============================================

interface UIHookCallbacks {
  addToolCall: (
    toolCall: Omit<
      { id: string; name: string; args: Record<string, unknown> },
      'status' | 'startTime'
    >
  ) => void;
  completeToolCall: (id: string, result?: string, error?: string) => void;
  toolCallMapRef: React.MutableRefObject<Map<string, string[]>>;
  contentLimits: AgentContentLimits;
}

function buildQueryOptionsWithUIHooks(
  options: Omit<AgentOptions, 'prompt'>,
  uiCallbacks: UIHookCallbacks
): Record<string, unknown> {
  const { addToolCall, completeToolCall, toolCallMapRef, contentLimits } =
    uiCallbacks;

  // Create UI-aware hooks
  // Uses FIFO queue per tool name to handle concurrent tools with same name
  const uiPreToolHook: HookCallback = async (
    input: HookInput,
    toolUseId: string | undefined
  ): Promise<HookOutput> => {
    if (input.hook_event_name === 'PreToolUse' && input.tool_name) {
      const id =
        toolUseId ||
        `tool_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      // Push to FIFO queue for this tool name
      const queue = toolCallMapRef.current.get(input.tool_name) || [];
      queue.push(id);
      toolCallMapRef.current.set(input.tool_name, queue);

      addToolCall({
        id,
        name: input.tool_name,
        args: (input.tool_input as Record<string, unknown>) || {},
      });
    }
    return {};
  };

  const uiPostToolHook: HookCallback = async (
    input: HookInput,
    toolUseId: string | undefined
  ): Promise<HookOutput> => {
    if (input.hook_event_name === 'PostToolUse' && input.tool_name) {
      // If SDK provides toolUseId, use it directly
      // Otherwise, pop from FIFO queue (first in, first out)
      let id = toolUseId;
      if (!id) {
        const queue = toolCallMapRef.current.get(input.tool_name);
        if (queue && queue.length > 0) {
          id = queue.shift(); // Remove and return first element (FIFO)
          // Update the queue in the map (or delete if empty)
          if (queue.length === 0) {
            toolCallMapRef.current.delete(input.tool_name);
          }
        }
      }

      if (id) {
        const response = input.tool_response;
        const result =
          typeof response === 'string'
            ? truncateContent(response, contentLimits.maxToolResultChars)
            : truncateContent(
                JSON.stringify(response),
                contentLimits.maxToolResultChars
              );
        completeToolCall(id, result);
      }
    }
    return {};
  };

  // Build base hooks
  const baseHooks =
    options.permissionMode === 'bypassPermissions'
      ? getPermissiveHooks()
      : getDefaultHooks();

  // Merge with UI hooks
  const hooks: Partial<Record<HookEventName, HookMatcher[]>> = {
    ...baseHooks,
    PreToolUse: [
      ...(baseHooks.PreToolUse || []),
      {
        hooks: [
          uiPreToolHook,
          autoApproveOctocodeToolsHook,
          blockDangerousCommandsHook,
        ],
      },
    ],
    PostToolUse: [
      ...(baseHooks.PostToolUse || []),
      { hooks: [uiPostToolHook] },
    ],
  };

  // Build final options
  const queryOptions: Record<string, unknown> = {
    hooks,
    includePartialMessages: true, // For token tracking
  };

  // Copy relevant options
  if (options.cwd) queryOptions.cwd = options.cwd;
  if (options.tools) queryOptions.allowedTools = options.tools;
  if (options.agents) queryOptions.agents = options.agents;
  if (options.mcpServers) queryOptions.mcpServers = options.mcpServers;
  if (options.systemPrompt) queryOptions.systemPrompt = options.systemPrompt;
  if (options.model && options.model !== 'inherit') {
    queryOptions.model = options.model;
  }
  if (options.maxTurns) queryOptions.maxTurns = options.maxTurns;
  if (options.maxThinkingTokens) {
    queryOptions.maxThinkingTokens = options.maxThinkingTokens;
  } else if (options.enableThinking) {
    queryOptions.maxThinkingTokens = 16000;
  }
  if (options.permissionMode) {
    queryOptions.permissionMode = options.permissionMode;
    if (options.permissionMode === 'bypassPermissions') {
      queryOptions.allowDangerouslySkipPermissions = true;
    }
  }
  if (options.loadProjectSettings) {
    queryOptions.settingSources = ['project'];
  }
  if (options.useClaudeCodePrompt) {
    queryOptions.systemPrompt = {
      type: 'preset',
      preset: 'claude_code',
      append: options.systemPrompt || '',
    };
  }

  return queryOptions;
}

// ============================================
// Default Agent Options Builder
// ============================================

function buildDefaultAgentOptions(mode: string): Omit<AgentOptions, 'prompt'> {
  const mcpServers = getOctocodeMCPConfig();

  const RESEARCH_TOOLS = [
    'Read',
    'Glob',
    'Grep',
    'WebSearch',
    'WebFetch',
    'Task',
    'ListMcpResources',
    'ReadMcpResource',
  ];

  const CODING_TOOLS = [
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

  const ALL_TOOLS = [
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

  switch (mode) {
    case 'research':
      return {
        tools: RESEARCH_TOOLS as AgentOptions['tools'],
        mcpServers,
        loadProjectSettings: true,
        verbose: true,
      };

    case 'coding':
      return {
        tools: CODING_TOOLS as AgentOptions['tools'],
        useClaudeCodePrompt: true,
        loadProjectSettings: true,
        verbose: true,
      };

    case 'planning':
      return {
        tools: RESEARCH_TOOLS as AgentOptions['tools'],
        mcpServers,
        permissionMode: 'plan',
        loadProjectSettings: true,
        enableThinking: true,
        verbose: true,
      };

    case 'full':
    default:
      return {
        tools: ALL_TOOLS as AgentOptions['tools'],
        mcpServers,
        useClaudeCodePrompt: true,
        loadProjectSettings: true,
        enableThinking: true,
        verbose: true,
      };
  }
}

// ============================================
// Main Entry Point
// ============================================

export async function runAgentUI(
  options: RunAgentUIOptions = {}
): Promise<AgentResult> {
  return new Promise(resolve => {
    const { waitUntilExit } = render(
      <AgentUIWrapper
        initialTask={options.task}
        initialMode={options.mode}
        model={options.model}
        agentOptions={options.agentOptions}
        uiConfig={options.uiConfig}
        onComplete={result => {
          // Give UI time to show final state
          setTimeout(() => {
            resolve(result);
          }, 500);
        }}
      />
    );

    // Wait for exit
    waitUntilExit().catch(() => {
      resolve({
        success: false,
        error: 'UI terminated unexpectedly',
      });
    });
  });
}

export default runAgentUI;
