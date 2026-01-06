/**
 * useAgent Hook
 *
 * State management for the agent UI interface.
 * Handles messages, tool calls, stats tracking, and state updates.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  AgentUIState,
  AgentMessage,
  AgentToolCall,
  AgentStats,
  AgentStateType,
} from './types.js';
import { useBackgroundTasks } from './useBackgroundTasks.js';

/**
 * Minimum delay between streaming UI updates (in ms).
 * ~50ms = 20 updates/second, similar to Aider's approach.
 * This prevents excessive re-renders during fast streaming.
 */
const STREAMING_MIN_DELAY_MS = 50;

let messageIdCounter = 0;

function generateMessageId(): string {
  return `agent_msg_${Date.now()}_${++messageIdCounter}`;
}

function createInitialStats(): AgentStats {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    toolCount: 0,
    startTime: Date.now(),
    lastUpdate: Date.now(),
  };
}

export interface UseAgentOptions {
  task: string;
  mode: string;
  model?: string;
  maxMessages?: number;
}

export interface UseAgentReturn {
  state: AgentUIState;
  setAgentState: (state: AgentStateType, currentTool?: string) => void;
  addMessage: (message: Omit<AgentMessage, 'id' | 'timestamp'>) => string;
  addThinkingMessage: (content: string) => string;
  addTextMessage: (content: string) => string;
  addSystemMessage: (content: string) => string;
  addErrorMessage: (content: string) => string;
  setResult: (result: string) => void;
  setError: (error: string) => void;
  addToolCall: (toolCall: Omit<AgentToolCall, 'status' | 'startTime'>) => void;
  updateToolCall: (id: string, updates: Partial<AgentToolCall>) => void;
  completeToolCall: (id: string, result?: string, error?: string) => void;
  toggleToolCallCollapsed: (id: string) => void;
  updateStats: (updates: Partial<AgentStats>) => void;
  updateTokens: (usage: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  }) => void;
  appendStreamingText: (text: string) => void;
  finalizeStreamingText: () => void;
  clearMessages: () => void;
}

export function useAgent(options: UseAgentOptions): UseAgentReturn {
  // No message limit - keep all messages for full conversation history
  const { task, mode, model, maxMessages = 0 } = options;

  const [agentState, setAgentStateValue] = useState<AgentStateType>('idle');
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [currentToolCalls, setCurrentToolCalls] = useState<AgentToolCall[]>([]);
  const [stats, setStats] = useState<AgentStats>(createInitialStats);
  const [result, setResultValue] = useState<string | undefined>();
  const [error, setErrorValue] = useState<string | undefined>();
  const currentToolRef = useRef<string | undefined>();

  // Subscribe to background tasks from TaskManager
  const { tasks: backgroundTasks } = useBackgroundTasks();

  // Streaming text state - for accumulating text chunks in real-time
  const streamingMessageIdRef = useRef<string | null>(null);
  const streamingTextRef = useRef<string>('');

  // Rate limiting state for streaming updates
  const lastStreamingUpdateRef = useRef<number>(0);
  const pendingStreamingUpdateRef = useRef<NodeJS.Timeout | null>(null);

  const setAgentState = useCallback(
    (state: AgentStateType, currentTool?: string): void => {
      setAgentStateValue(state);
      currentToolRef.current = currentTool;
      setStats(prev => ({ ...prev, lastUpdate: Date.now() }));
    },
    []
  );

  const addMessage = useCallback(
    (msg: Omit<AgentMessage, 'id' | 'timestamp'>): string => {
      const id = generateMessageId();
      const message: AgentMessage = {
        ...msg,
        id,
        timestamp: new Date(),
      };

      setMessages(prev => {
        const updated = [...prev, message];
        // Keep all messages if maxMessages is 0 (unlimited), otherwise limit
        return maxMessages > 0 ? updated.slice(-maxMessages) : updated;
      });

      return id;
    },
    [maxMessages]
  );

  const addThinkingMessage = useCallback(
    (content: string): string => {
      return addMessage({ type: 'thinking', content });
    },
    [addMessage]
  );

  const addTextMessage = useCallback(
    (content: string): string => {
      return addMessage({ type: 'text', content });
    },
    [addMessage]
  );

  const addSystemMessage = useCallback(
    (content: string): string => {
      return addMessage({ type: 'system', content });
    },
    [addMessage]
  );

  const addErrorMessage = useCallback(
    (content: string): string => {
      return addMessage({ type: 'error', content });
    },
    [addMessage]
  );

  const setResult = useCallback((res: string): void => {
    // Just set the result value - AgentView has a dedicated "Final Result Display"
    // section that shows state.result. We don't add as a message to avoid
    // duplicating content that was already shown via streaming.
    setResultValue(res);
  }, []);

  const setError = useCallback(
    (err: string): void => {
      setErrorValue(err);
      addMessage({ type: 'error', content: err });
    },
    [addMessage]
  );

  const addToolCall = useCallback(
    (toolCall: Omit<AgentToolCall, 'status' | 'startTime'>): void => {
      const newToolCall: AgentToolCall = {
        ...toolCall,
        status: 'running',
        startTime: Date.now(),
      };
      setCurrentToolCalls(prev => [...prev, newToolCall]);
      setStats(prev => ({
        ...prev,
        toolCount: prev.toolCount + 1,
        lastUpdate: Date.now(),
      }));

      // Also add as a message
      addMessage({
        type: 'tool',
        content: formatToolName(toolCall.name),
        toolName: toolCall.name,
        toolArgs: toolCall.args,
      });
    },
    [addMessage]
  );

  const updateToolCall = useCallback(
    (id: string, updates: Partial<AgentToolCall>): void => {
      setCurrentToolCalls(prev =>
        prev.map(tc => (tc.id === id ? { ...tc, ...updates } : tc))
      );
    },
    []
  );

  const completeToolCall = useCallback(
    (id: string, result?: string, error?: string): void => {
      setCurrentToolCalls(prev => {
        const toolCall = prev.find(tc => tc.id === id);
        const duration = toolCall ? Date.now() - toolCall.startTime : undefined;

        return prev.map(tc =>
          tc.id === id
            ? {
                ...tc,
                status: error ? 'error' : 'completed',
                result,
                error,
                duration,
              }
            : tc
        );
      });

      // Note: We don't add tool results as messages here anymore
      // The intermediate results clutter the view - only final result matters
      // Tool call status is tracked in currentToolCalls which persists

      // Auto-collapse completed tool calls after 3 seconds
      // They remain visible but collapsed to save space
      setTimeout(() => {
        setCurrentToolCalls(prev =>
          prev.map(tc =>
            tc.id === id && tc.status !== 'running'
              ? { ...tc, collapsed: true }
              : tc
          )
        );
      }, 3000);
    },
    []
  );

  const toggleToolCallCollapsed = useCallback((id: string): void => {
    setCurrentToolCalls(prev =>
      prev.map(tc => (tc.id === id ? { ...tc, collapsed: !tc.collapsed } : tc))
    );
  }, []);

  const updateStats = useCallback((updates: Partial<AgentStats>): void => {
    setStats(prev => ({ ...prev, ...updates, lastUpdate: Date.now() }));
  }, []);

  const updateTokens = useCallback(
    (usage: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    }): void => {
      setStats(prev => ({
        ...prev,
        inputTokens: prev.inputTokens + (usage.input_tokens || 0),
        outputTokens: prev.outputTokens + (usage.output_tokens || 0),
        cacheReadTokens:
          prev.cacheReadTokens + (usage.cache_read_input_tokens || 0),
        cacheWriteTokens:
          prev.cacheWriteTokens + (usage.cache_creation_input_tokens || 0),
        lastUpdate: Date.now(),
      }));
    },
    []
  );

  /**
   * Flush pending streaming text to the UI.
   * Called either immediately (if enough time passed) or after rate limit delay.
   */
  const flushStreamingUpdate = useCallback((): void => {
    lastStreamingUpdateRef.current = Date.now();

    // Create or update the streaming message
    if (!streamingMessageIdRef.current) {
      // Create new streaming message
      const id = generateMessageId();
      streamingMessageIdRef.current = id;
      const message: AgentMessage = {
        id,
        type: 'text',
        content: streamingTextRef.current,
        timestamp: new Date(),
        isStreaming: true,
      };
      setMessages(prev => {
        const updated = [...prev, message];
        return maxMessages > 0 ? updated.slice(-maxMessages) : updated;
      });
    } else {
      // Update existing streaming message
      setMessages(prev =>
        prev.map(msg =>
          msg.id === streamingMessageIdRef.current
            ? { ...msg, content: streamingTextRef.current }
            : msg
        )
      );
    }
  }, [maxMessages]);

  /**
   * Append streaming text with rate limiting.
   * Accumulates chunks immediately but batches UI updates at ~50ms intervals.
   * This prevents excessive re-renders during fast streaming while maintaining
   * smooth visual updates (similar to Aider's MarkdownStream pattern).
   */
  const appendStreamingText = useCallback(
    (text: string): void => {
      // Always accumulate text immediately
      streamingTextRef.current += text;

      const now = Date.now();
      const timeSinceLastUpdate = now - lastStreamingUpdateRef.current;

      // If enough time has passed, update immediately
      if (timeSinceLastUpdate >= STREAMING_MIN_DELAY_MS) {
        // Clear any pending update since we're updating now
        if (pendingStreamingUpdateRef.current) {
          clearTimeout(pendingStreamingUpdateRef.current);
          pendingStreamingUpdateRef.current = null;
        }
        flushStreamingUpdate();
      } else {
        // Schedule a pending update if not already scheduled
        if (!pendingStreamingUpdateRef.current) {
          const delay = STREAMING_MIN_DELAY_MS - timeSinceLastUpdate;
          pendingStreamingUpdateRef.current = setTimeout(() => {
            pendingStreamingUpdateRef.current = null;
            flushStreamingUpdate();
          }, delay);
        }
        // If there's already a pending update, it will pick up the accumulated text
      }
    },
    [flushStreamingUpdate]
  );

  /**
   * Finalize streaming text - flushes any pending updates and marks message complete.
   * Should be called when streaming is done to ensure all text is displayed.
   */
  const finalizeStreamingText = useCallback((): void => {
    // Clear any pending update timer
    if (pendingStreamingUpdateRef.current) {
      clearTimeout(pendingStreamingUpdateRef.current);
      pendingStreamingUpdateRef.current = null;
    }

    // Flush any remaining accumulated text before finalizing
    if (streamingMessageIdRef.current && streamingTextRef.current) {
      setMessages(prev =>
        prev.map(msg =>
          msg.id === streamingMessageIdRef.current
            ? { ...msg, content: streamingTextRef.current, isStreaming: false }
            : msg
        )
      );
    } else if (streamingMessageIdRef.current) {
      // Just mark as not streaming if no pending text
      setMessages(prev =>
        prev.map(msg =>
          msg.id === streamingMessageIdRef.current
            ? { ...msg, isStreaming: false }
            : msg
        )
      );
    }

    // Reset streaming state
    streamingMessageIdRef.current = null;
    streamingTextRef.current = '';
    lastStreamingUpdateRef.current = 0;
  }, []);

  const clearMessages = useCallback((): void => {
    // Clear any pending streaming update
    if (pendingStreamingUpdateRef.current) {
      clearTimeout(pendingStreamingUpdateRef.current);
      pendingStreamingUpdateRef.current = null;
    }
    setMessages([]);
    setCurrentToolCalls([]);
    streamingMessageIdRef.current = null;
    streamingTextRef.current = '';
    lastStreamingUpdateRef.current = 0;
  }, []);

  // Cleanup pending timeout on unmount
  useEffect(() => {
    return () => {
      if (pendingStreamingUpdateRef.current) {
        clearTimeout(pendingStreamingUpdateRef.current);
      }
    };
  }, []);

  return {
    state: {
      state: agentState,
      messages,
      currentToolCalls,
      stats,
      task,
      mode,
      model,
      result,
      error,
      backgroundTasks,
    },
    setAgentState,
    addMessage,
    addThinkingMessage,
    addTextMessage,
    addSystemMessage,
    addErrorMessage,
    setResult,
    setError,
    addToolCall,
    updateToolCall,
    completeToolCall,
    toggleToolCallCollapsed,
    updateStats,
    updateTokens,
    appendStreamingText,
    finalizeStreamingText,
    clearMessages,
  };
}

/**
 * Format tool name for display
 */
function formatToolName(name: string): string {
  if (name.startsWith('mcp__octocode-local__')) {
    return name.replace('mcp__octocode-local__', '');
  }
  if (name.startsWith('mcp__')) {
    return name.replace('mcp__', '').replace(/__/g, '/');
  }
  return name;
}

export default useAgent;
