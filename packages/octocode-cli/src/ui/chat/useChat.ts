/**
 * useChat Hook
 *
 * State management for the chat interface.
 * Handles messages, streaming, history, and stats tracking.
 */

import { useState, useCallback, useRef } from 'react';
import type { ChatMessage, ChatState, ChatStats, ToolCall } from './types.js';

let messageIdCounter = 0;

function generateMessageId(): string {
  return `msg_${Date.now()}_${++messageIdCounter}`;
}

function createInitialStats(): ChatStats {
  return {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalMessages: 0,
    totalToolCalls: 0,
    sessionStartTime: Date.now(),
  };
}

export interface UseChatOptions {
  maxHistorySize?: number;
  onSend?: (message: string) => Promise<void>;
  model?: string;
}

export interface UseChatReturn {
  state: ChatState;
  addUserMessage: (content: string) => string;
  addAssistantMessage: (content: string, isStreaming?: boolean) => string;
  updateAssistantMessage: (
    id: string,
    content: string,
    thinking?: string
  ) => void;
  completeAssistantMessage: (
    id: string,
    tokens?: { input?: number; output?: number },
    durationMs?: number
  ) => void;
  addToolCall: (toolCall: Omit<ToolCall, 'status'>) => void;
  updateToolCall: (id: string, updates: Partial<ToolCall>) => void;
  completeToolCall: (id: string, result?: string, error?: string) => void;
  addSystemMessage: (content: string) => void;
  setThinking: (isThinking: boolean) => void;
  clearMessages: () => void;
  updateStats: (updates: Partial<ChatStats>) => void;
  inputHistory: string[];
}

export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const { maxHistorySize = 10000, model } = options; // 10000 entries for input history

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [currentToolCalls, setCurrentToolCalls] = useState<ToolCall[]>([]);
  const [stats, setStats] = useState<ChatStats>(createInitialStats);
  const inputHistoryRef = useRef<string[]>([]);
  const responseStartTimeRef = useRef<number | null>(null);

  const addUserMessage = useCallback(
    (content: string): string => {
      const id = generateMessageId();
      const message: ChatMessage = {
        id,
        role: 'user',
        content,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, message]);
      setStats(prev => ({
        ...prev,
        totalMessages: prev.totalMessages + 1,
      }));

      // Add to input history
      if (content.trim()) {
        inputHistoryRef.current = [
          ...inputHistoryRef.current.slice(-(maxHistorySize - 1)),
          content,
        ];
      }

      // Track response start time
      responseStartTimeRef.current = Date.now();

      return id;
    },
    [maxHistorySize]
  );

  const addAssistantMessage = useCallback(
    (content: string, isStreaming = false): string => {
      const id = generateMessageId();
      const message: ChatMessage = {
        id,
        role: 'assistant',
        content,
        timestamp: new Date(),
        isStreaming,
      };

      setMessages(prev => [...prev, message]);

      // Count assistant message when added (not when completed, to avoid double-counting)
      setStats(prev => ({
        ...prev,
        totalMessages: prev.totalMessages + 1,
      }));

      return id;
    },
    []
  );

  const updateAssistantMessage = useCallback(
    (id: string, content: string, thinking?: string): void => {
      setMessages(prev =>
        prev.map(msg =>
          msg.id === id
            ? {
                ...msg,
                content,
                isStreaming: true,
                ...(thinking !== undefined && { thinking }),
              }
            : msg
        )
      );
    },
    []
  );

  const completeAssistantMessage = useCallback(
    (
      id: string,
      tokens?: { input?: number; output?: number },
      durationMs?: number
    ): void => {
      const actualDuration =
        durationMs ??
        (responseStartTimeRef.current
          ? Date.now() - responseStartTimeRef.current
          : undefined);

      setMessages(prev =>
        prev.map(msg =>
          msg.id === id
            ? { ...msg, isStreaming: false, tokens, durationMs: actualDuration }
            : msg
        )
      );

      // Update stats (note: don't increment totalMessages here - message already counted when added)
      if (tokens) {
        setStats(prev => ({
          ...prev,
          totalInputTokens: prev.totalInputTokens + (tokens.input || 0),
          totalOutputTokens: prev.totalOutputTokens + (tokens.output || 0),
          lastResponseTime: actualDuration,
        }));
      }

      responseStartTimeRef.current = null;
    },
    []
  );

  const addToolCall = useCallback(
    (toolCall: Omit<ToolCall, 'status'>): void => {
      const newToolCall: ToolCall = {
        ...toolCall,
        status: 'running',
        startTime: Date.now(),
      };
      setCurrentToolCalls(prev => [...prev, newToolCall]);

      // Update stats
      setStats(prev => ({
        ...prev,
        totalToolCalls: prev.totalToolCalls + 1,
      }));

      // Note: We intentionally do NOT add tool calls as messages here
      // Running tools are shown in ToolCallDisplay component with spinners
      // This avoids visual duplication (tool shown twice: in messages AND in tool panel)
    },
    []
  );

  const updateToolCall = useCallback(
    (id: string, updates: Partial<ToolCall>): void => {
      setCurrentToolCalls(prev =>
        prev.map(tc => (tc.id === id ? { ...tc, ...updates } : tc))
      );
    },
    []
  );

  const completeToolCall = useCallback(
    (id: string, result?: string, error?: string): void => {
      // Update tool call status
      setCurrentToolCalls(prev => {
        const toolCall = prev.find(tc => tc.id === id);
        const duration = toolCall?.startTime
          ? Date.now() - toolCall.startTime
          : undefined;

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

      // Note: Tool results are kept in currentToolCalls for the session
      // They are shown in ToolCallDisplay with collapse/expand functionality
      // The assistant's response will incorporate tool results naturally
      // Tool results persist until chat is cleared to allow user review
    },
    []
  );

  const addSystemMessage = useCallback((content: string): void => {
    const message: ChatMessage = {
      id: generateMessageId(),
      role: 'system',
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, message]);
  }, []);

  const setThinking = useCallback((thinking: boolean): void => {
    setIsThinking(thinking);
  }, []);

  const clearMessages = useCallback((): void => {
    setMessages([]);
    setCurrentToolCalls([]);
  }, []);

  const updateStats = useCallback((updates: Partial<ChatStats>): void => {
    setStats(prev => ({ ...prev, ...updates }));
  }, []);

  return {
    state: {
      messages,
      isThinking,
      currentToolCalls,
      inputHistory: inputHistoryRef.current,
      historyIndex: -1,
      stats,
      currentModel: model,
    },
    addUserMessage,
    addAssistantMessage,
    updateAssistantMessage,
    completeAssistantMessage,
    addToolCall,
    updateToolCall,
    completeToolCall,
    addSystemMessage,
    setThinking,
    clearMessages,
    updateStats,
    inputHistory: inputHistoryRef.current,
  };
}

export default useChat;
