/**
 * ChatView Component
 *
 * Main interactive chat interface using Ink (React for CLI).
 * Features:
 * - Message history with scrolling
 * - Streaming AI responses
 * - Tool call visualization
 * - Input with history navigation
 * - Keyboard shortcuts (/exit, /clear, /help, /stats)
 * - Token counting and cost estimation
 */

import React, {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import { writeFileSync } from 'fs';
import { Box, Text, useApp, useInput, Static, useFocus } from 'ink';
import { Spinner } from '@inkjs/ui';
import { MessageBubble } from './MessageBubble.js';
import { ChatInput } from './ChatInput.js';
import { ToolCallDisplay } from './ToolCallDisplay.js';
import { StatusBar } from './StatusBar.js';
import { useChat } from './useChat.js';
import type { ChatConfig, ChatMessage } from './types.js';
import { DEFAULT_CONFIG } from './types.js';

interface ChatViewProps {
  onMessage: (
    message: string,
    callbacks: {
      onToken: (token: string) => void;
      onThinking: (thinking: string) => void;
      onToolCall: (
        id: string,
        name: string,
        args: Record<string, unknown>
      ) => void;
      onToolResult: (id: string, name: string, result: string) => void;
      onComplete: (usage?: {
        inputTokens?: number;
        outputTokens?: number;
      }) => void;
      onError: (error: Error) => void;
    }
  ) => Promise<void>;
  config?: Partial<ChatConfig>;
  welcomeMessage?: string;
  model?: string;
}

const COMMANDS: Record<string, string> = {
  '/exit': 'Exit the chat',
  '/clear': 'Clear chat history',
  '/help': 'Show available commands',
  '/stats': 'Show session statistics',
  '/export [file]': 'Export chat to markdown file',
};

export function ChatView({
  onMessage,
  config = {},
  welcomeMessage,
  model,
}: ChatViewProps): React.ReactElement {
  const { exit } = useApp();
  const mergedConfig: ChatConfig = { ...DEFAULT_CONFIG, ...config };

  const {
    state,
    addUserMessage,
    addAssistantMessage,
    updateAssistantMessage,
    completeAssistantMessage,
    addToolCall,
    completeToolCall,
    addSystemMessage,
    setThinking,
    clearMessages,
    inputHistory,
  } = useChat({ model });

  const [error, setError] = useState<string | null>(null);
  const [, forceUpdate] = useState(0);
  const [scrollMode, setScrollMode] = useState(false);

  // Ctrl+C double-tap handling: first cancels operation, second exits
  const cancelCountRef = useRef(0);
  const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  // Track messages that were rendered as streaming to avoid duplicate rendering
  // When a message completes streaming, we keep it in the non-Static area to avoid duplication
  const streamedMessageIdsRef = useRef<Set<string>>(new Set());

  // Focus management - input gets focus when not thinking and not in scroll mode
  const { isFocused: inputFocused } = useFocus({
    autoFocus: true,
    isActive: !state.isThinking && !scrollMode,
  });

  // Only force update when actively thinking (streaming response)
  useEffect(() => {
    if (!state.isThinking) return;
    const interval = setInterval(() => forceUpdate(n => n + 1), 1000);
    return () => clearInterval(interval);
  }, [state.isThinking]);

  // Separate messages into three categories:
  // 1. staticMessages: Messages that were never streamed (safe for Static rendering)
  // 2. recentMessages: Messages that were/are streaming (render in non-Static to avoid duplicates)
  // 3. streamingMessage: Currently streaming message
  //
  // Memory management: We track streamed message IDs to avoid duplicate rendering.
  // When a message finishes streaming, we keep it in recentMessages for one render cycle
  // to avoid duplication, then remove its ID so it moves to staticMessages on next render.
  const { staticMessages, recentMessages, streamingMessage } = useMemo(() => {
    const staticMsgs: ChatMessage[] = [];
    const recentMsgs: ChatMessage[] = [];
    let streaming: ChatMessage | null = null;
    const completedStreamIds: string[] = [];

    for (const msg of state.messages) {
      if (msg.isStreaming) {
        // Currently streaming - track it and render separately
        streamedMessageIdsRef.current.add(msg.id);
        streaming = msg;
      } else if (streamedMessageIdsRef.current.has(msg.id)) {
        // Was previously streamed - keep in non-Static area to avoid duplicate
        // Mark for cleanup after this render
        recentMsgs.push(msg);
        completedStreamIds.push(msg.id);
      } else {
        // Never streamed - safe for Static
        staticMsgs.push(msg);
      }
    }

    // Schedule cleanup of completed stream IDs for next render cycle
    // This allows the message to render in recentMessages once before moving to Static
    if (completedStreamIds.length > 0) {
      setTimeout(() => {
        for (const id of completedStreamIds) {
          streamedMessageIdsRef.current.delete(id);
        }
      }, 0);
    }

    return {
      staticMessages: staticMsgs,
      recentMessages: recentMsgs,
      streamingMessage: streaming,
    };
  }, [state.messages]);

  // Add welcome message on mount
  useEffect(() => {
    if (welcomeMessage) {
      addSystemMessage(welcomeMessage);
    }
  }, [welcomeMessage, addSystemMessage]);

  // Clear streamed message tracking when messages are cleared
  useEffect(() => {
    if (state.messages.length === 0) {
      streamedMessageIdsRef.current.clear();
    }
  }, [state.messages.length]);

  // Handle global keyboard shortcuts
  // Note: Scrolling is handled natively by terminal when using <Static>
  useInput((input, key) => {
    // Ctrl+C: Double-tap to exit, single tap cancels current operation
    if (input === 'c' && key.ctrl) {
      cancelCountRef.current++;

      // Clear any existing timer
      if (cancelTimerRef.current) {
        clearTimeout(cancelTimerRef.current);
      }

      if (cancelCountRef.current === 1 && state.isThinking) {
        // First Ctrl+C while thinking: cancel the operation
        cancelledRef.current = true;
        setThinking(false);
        addSystemMessage('⚠️ Operation cancelled. Press Ctrl+C again to exit.');

        // Reset cancel count after 1.5s
        cancelTimerRef.current = setTimeout(() => {
          cancelCountRef.current = 0;
        }, 1500);
      } else if (cancelCountRef.current >= 2 || !state.isThinking) {
        // Second Ctrl+C (within timeout) or first Ctrl+C when not thinking: exit
        exit();
      }
      return;
    }

    // Ctrl+L to clear
    if (input === 'l' && key.ctrl) {
      clearMessages();
    }

    // Ctrl+S to toggle scroll mode (allows native terminal scrolling)
    if (input === 's' && key.ctrl) {
      setScrollMode(prev => !prev);
      return;
    }

    // Escape to exit scroll mode
    if (key.escape && scrollMode) {
      setScrollMode(false);
      return;
    }
  });

  const handleCommand = useCallback(
    (command: string): boolean => {
      const cmd = command.toLowerCase().trim();

      switch (cmd) {
        case '/exit':
        case '/quit':
        case '/q':
          exit();
          return true;

        case '/clear':
          clearMessages();
          addSystemMessage('Chat cleared.');
          return true;

        case '/stats': {
          const { stats } = state;
          const totalTokens = stats.totalInputTokens + stats.totalOutputTokens;
          const sessionTime = Math.floor(
            (Date.now() - stats.sessionStartTime) / 1000
          );
          const estimatedCost =
            (stats.totalInputTokens / 1_000_000) * 3 +
            (stats.totalOutputTokens / 1_000_000) * 15;

          const statsText = [
            '📊 Session Statistics',
            '',
            `  Model: ${model || 'default'}`,
            `  Messages: ${stats.totalMessages}`,
            `  Tool Calls: ${stats.totalToolCalls}`,
            `  Tokens: ${totalTokens.toLocaleString()} (${stats.totalInputTokens.toLocaleString()}↑ ${stats.totalOutputTokens.toLocaleString()}↓)`,
            `  Est. Cost: $${estimatedCost.toFixed(4)}`,
            `  Session Time: ${Math.floor(sessionTime / 60)}m ${sessionTime % 60}s`,
            stats.lastResponseTime
              ? `  Last Response: ${stats.lastResponseTime}ms`
              : '',
          ]
            .filter(Boolean)
            .join('\n');

          addSystemMessage(statsText);
          return true;
        }

        case '/help':
        case '/?': {
          const helpText = Object.entries(COMMANDS)
            .map(([c, desc]) => `  ${c} - ${desc}`)
            .join('\n');
          addSystemMessage(
            `Available commands:\n${helpText}\n\nKeyboard shortcuts:\n  Ctrl+C - Cancel operation (while thinking) / Exit (double-tap)\n  Ctrl+L - Clear chat\n  Ctrl+S - Toggle scroll mode (enables native terminal scrolling)\n  Esc - Exit scroll mode\n  ←/→ - Move cursor\n  ↑/↓ - Input history (when empty)\n  Ctrl+↑/↓ - Input history\n  Tab - Autocomplete placeholder`
          );
          return true;
        }

        default: {
          // Handle /export [filename] command
          if (cmd.startsWith('/export')) {
            const parts = command.trim().split(/\s+/);
            const filename = parts[1] || `octocode-chat-${Date.now()}.md`;

            try {
              // Format messages as markdown
              const markdown = [
                `# Octocode Chat Export`,
                ``,
                `**Model:** ${model || 'default'}`,
                `**Date:** ${new Date().toLocaleString()}`,
                `**Messages:** ${state.messages.length}`,
                ``,
                `---`,
                ``,
                ...state.messages.map(msg => {
                  const roleLabel =
                    msg.role === 'user'
                      ? '## 👤 User'
                      : msg.role === 'assistant'
                        ? '## 🤖 Assistant'
                        : '## 📌 System';
                  const timestamp = msg.timestamp
                    ? `*${new Date(msg.timestamp).toLocaleTimeString()}*`
                    : '';

                  const lines = [roleLabel, timestamp, '', msg.content];

                  // Include thinking if present
                  if (msg.thinking) {
                    lines.push(
                      '',
                      '<details>',
                      '<summary>💭 Thinking</summary>',
                      '',
                      msg.thinking,
                      '</details>'
                    );
                  }

                  return lines.join('\n');
                }),
                ``,
                `---`,
                ``,
                `*Exported from Octocode CLI*`,
              ].join('\n');

              writeFileSync(filename, markdown, 'utf-8');
              addSystemMessage(`✅ Chat exported to: ${filename}`);
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              addSystemMessage(`❌ Export failed: ${errMsg}`);
            }
            return true;
          }

          return false;
        }
      }
    },
    [exit, clearMessages, addSystemMessage, state, model]
  );

  const handleSubmit = useCallback(
    async (input: string) => {
      // Check for commands first
      if (input.startsWith('/')) {
        if (handleCommand(input)) {
          return;
        }
      }

      // Reset cancel state for new operation
      cancelledRef.current = false;

      // Add user message
      addUserMessage(input);
      setThinking(true);
      setError(null);

      // Start assistant response (streaming)
      const responseId = addAssistantMessage('', true);

      let responseText = '';
      let thinkingText = '';

      try {
        await onMessage(input, {
          onToken: (token: string) => {
            responseText += token;
            updateAssistantMessage(
              responseId,
              responseText,
              thinkingText || undefined
            );
          },
          onThinking: (thinking: string) => {
            thinkingText += thinking;
            updateAssistantMessage(responseId, responseText, thinkingText);
          },
          onToolCall: (
            id: string,
            name: string,
            args: Record<string, unknown>
          ) => {
            // Use the ID provided by the AI SDK (toolCallId) for exact matching
            addToolCall({
              id,
              name,
              args,
            });
          },
          onToolResult: (id: string, _name: string, result: string) => {
            // Match tool result by ID - this prevents race conditions when
            // multiple tools with the same name run concurrently
            completeToolCall(id, result);
          },
          onComplete: (usage?: {
            inputTokens?: number;
            outputTokens?: number;
          }) => {
            completeAssistantMessage(
              responseId,
              usage
                ? { input: usage.inputTokens, output: usage.outputTokens }
                : undefined
            );
            setThinking(false);
          },
          onError: (err: Error) => {
            setError(err.message);
            completeAssistantMessage(responseId);
            setThinking(false);
          },
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        setError(errorMessage);
        updateAssistantMessage(responseId, `Error: ${errorMessage}`);
        completeAssistantMessage(responseId);
        setThinking(false);
      }
    },
    [
      handleCommand,
      addUserMessage,
      setThinking,
      addAssistantMessage,
      updateAssistantMessage,
      completeAssistantMessage,
      addToolCall,
      completeToolCall,
      onMessage,
    ]
  );

  return (
    <Box flexDirection="column">
      {/* Header - NOT in Static because model name is dynamic */}
      <Box
        borderStyle="round"
        borderColor={mergedConfig.theme.borderColor}
        paddingX={2}
        justifyContent="space-between"
      >
        <Text bold color={mergedConfig.theme.borderColor}>
          🐙 Octocode Chat
        </Text>
        <Text color={mergedConfig.theme.assistantColor} bold>
          {model || 'AI Assistant'}
        </Text>
        <Text color={mergedConfig.theme.dimColor}>/help • Ctrl+C</Text>
      </Box>

      {/* Scroll Mode Indicator */}
      {scrollMode && (
        <Box paddingX={2} paddingY={1}>
          <Text backgroundColor="yellow" color="black" bold>
            {' '}
            SCROLL MODE{' '}
          </Text>
          <Text color="yellow">
            {' '}
            Use terminal scrolling (↑/↓/PgUp/PgDn) • Press Esc or Ctrl+S to exit
          </Text>
        </Box>
      )}

      {/* Static Messages - Messages that were never streamed (safe for Static) */}
      {staticMessages.length > 0 && (
        <Static items={staticMessages}>
          {(message: ChatMessage) => (
            <Box key={message.id} paddingX={1}>
              <MessageBubble
                message={message}
                theme={mergedConfig.theme}
                showThinking={mergedConfig.showThinking}
                maxToolResultLength={mergedConfig.maxToolResultLength}
                maxThinkingLength={mergedConfig.maxThinkingLength}
              />
            </Box>
          )}
        </Static>
      )}

      {/* Recent Messages - Completed but were streamed (non-Static to avoid duplicates) */}
      {recentMessages.map((message: ChatMessage) => (
        <Box key={message.id} paddingX={1}>
          <MessageBubble
            message={message}
            theme={mergedConfig.theme}
            showThinking={mergedConfig.showThinking}
            maxToolResultLength={mergedConfig.maxToolResultLength}
            maxThinkingLength={mergedConfig.maxThinkingLength}
          />
        </Box>
      ))}

      {/* Welcome message when no messages */}
      {state.messages.length === 0 && (
        <Box
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
          paddingY={2}
        >
          <Text color={mergedConfig.theme.borderColor} bold>
            ✨ Welcome to Octocode Chat ✨
          </Text>
          <Text> </Text>
          <Text color={mergedConfig.theme.dimColor}>
            I can help you with code research, writing, and debugging.
          </Text>
          <Text color={mergedConfig.theme.dimColor}>
            Type your question below to get started!
          </Text>
        </Box>
      )}

      {/* Currently streaming message - NOT in Static so it updates */}
      {streamingMessage && (
        <Box paddingX={1}>
          <MessageBubble
            message={streamingMessage}
            theme={mergedConfig.theme}
            showThinking={mergedConfig.showThinking}
            maxToolResultLength={mergedConfig.maxToolResultLength}
            maxThinkingLength={mergedConfig.maxThinkingLength}
          />
        </Box>
      )}

      {/* Thinking indicator */}
      {state.isThinking && !streamingMessage && (
        <Box marginLeft={2} paddingY={1}>
          <Spinner label="Thinking..." />
        </Box>
      )}

      {/* Tool Calls */}
      {mergedConfig.showToolCalls && state.currentToolCalls.length > 0 && (
        <ToolCallDisplay
          toolCalls={state.currentToolCalls}
          theme={mergedConfig.theme}
        />
      )}

      {/* Error Display */}
      {error && (
        <Box paddingX={1}>
          <Text color={mergedConfig.theme.errorColor}>⚠ {error}</Text>
        </Box>
      )}

      {/* Status Bar */}
      <StatusBar
        stats={state.stats}
        model={model}
        isThinking={state.isThinking}
        theme={mergedConfig.theme}
      />

      {/* Input Area */}
      <Box marginTop={1}>
        <ChatInput
          onSubmit={handleSubmit}
          disabled={state.isThinking || scrollMode}
          focus={inputFocused && !state.isThinking && !scrollMode}
          history={inputHistory}
          theme={mergedConfig.theme}
          placeholder={
            scrollMode
              ? 'Scroll mode active - Press Esc or Ctrl+S to type'
              : state.isThinking
                ? 'Waiting for response...'
                : 'Type your message... (/help for commands)'
          }
        />
      </Box>
    </Box>
  );
}

export default ChatView;
