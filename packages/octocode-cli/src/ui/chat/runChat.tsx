/**
 * Chat Runner
 *
 * Entry point for running the interactive chat interface.
 * Integrates with the agent system for AI responses and session persistence.
 */

import { render } from 'ink';
import { ChatView } from './ChatView.js';
import { streamText, type CoreMessage } from 'ai';
import { resolveModel } from '../../features/providers/index.js';
import { CODING_TOOLS } from '../../features/tools/index.js';
import { octocodeClient } from '../../features/tools/mcp-client.js';
import { getCurrentDefaultModel } from '../ai-providers/index.js';
import { getSessionStore } from '../../features/session-store.js';
import {
  setCurrentSessionId,
  clearCurrentSessionId,
} from '../../features/session-context.js';
import { closeDatabase } from '../../db/index.js';
import type { ModelId } from '../../types/provider.js';
import type { Session } from '../../db/schema.js';

// ============================================
// Types
// ============================================

export interface RunChatOptions {
  /** Model to use for chat */
  model?: ModelId;
  /** Custom system prompt */
  systemPrompt?: string;
  /** Welcome message to display */
  welcomeMessage?: string;
  /** Enable verbose output */
  verbose?: boolean;
  /** Persist session to database */
  persistSession?: boolean;
  /** Resume from existing session ID */
  resumeSessionId?: string;
  /** Initial prompt (for non-interactive mode) */
  initialPrompt?: string;
}

// ============================================
// Constants
// ============================================

const DEFAULT_SYSTEM_PROMPT = `You are Octocode, an expert AI coding assistant.
You help users with code research, writing, and debugging.
Be concise but thorough. Use markdown for code blocks.
When you need to explore code, use the available tools.`;

const DEFAULT_WELCOME = `Welcome to Octocode Chat!

I can help you with:
- Code research and exploration
- Writing and debugging code
- Understanding codebases
- Technical questions

Type /help for commands or just start chatting!`;

// ============================================
// Main Function
// ============================================

export async function runChat(options: RunChatOptions = {}): Promise<void> {
  const {
    model: modelId = getCurrentDefaultModel(),
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    welcomeMessage = DEFAULT_WELCOME,
    verbose = false,
    persistSession = true,
    resumeSessionId,
    initialPrompt,
  } = options;

  if (!modelId) {
    console.error('No model configured. Please set up an AI provider first.');
    console.error('Run: octocode status');
    process.exit(1);
  }

  // Resolve the model
  let model;
  let modelDisplayName: string = modelId;
  try {
    const resolved = await resolveModel(modelId);
    model = resolved.model;
    // Extract a cleaner display name
    modelDisplayName = modelId.includes(':') ? modelId.split(':')[1] : modelId;
  } catch (error) {
    console.error('Failed to resolve model:', error);
    console.error('Check your API keys with: octocode status');
    process.exit(1);
  }

  // Initialize MCP Tools
  // We try to connect to the local MCP server to get advanced research tools
  let chatTools = { ...CODING_TOOLS };
  try {
    const mcpTools = await octocodeClient.getTools();
    chatTools = { ...chatTools, ...mcpTools };
    if (verbose) {
      console.log(`Loaded ${Object.keys(mcpTools).length} MCP tools`);
    }
  } catch (error) {
    // MCP tools failed to load - notify user
    console.warn(
      '\n⚠️  Advanced research tools unavailable (MCP connection failed)'
    );
    console.warn('   Basic tools (Read, Write, Edit, Bash, Grep) are available.');
    if (verbose) {
      console.warn('   Error:', error);
    }
    console.warn('');
  }

  // Session management
  const store = persistSession ? getSessionStore() : null;
  let session: Session | null = null;
  let turnIndex = 0;

  // Conversation history
  const messages: CoreMessage[] = [];

  // Resume existing session or create new
  if (resumeSessionId && store) {
    try {
      const loaded = await store.getSessionWithMessages(resumeSessionId);
      if (loaded) {
        session = loaded.session;
        // Set session context for background tasks
        setCurrentSessionId(session.id);

        // Load previous messages into conversation history
        // Filter out tool messages as they need special handling by the AI SDK
        const resumeMessages = await store.getMessagesForResume(resumeSessionId);
        for (const msg of resumeMessages) {
          // Only include user/assistant/system messages in the core conversation
          // Tool messages are tracked separately through tool call IDs
          if (msg.role !== 'tool') {
            messages.push({
              role: msg.role as 'user' | 'assistant' | 'system',
              content: msg.content,
            });
          }
        }

        // Get the next turn index
        turnIndex = (await store.getLastTurnIndex(resumeSessionId)) + 1;

        // Show resumed session info
        console.log(`\nResuming session: ${session.title || session.id.slice(0, 8)}`);
        console.log(`  ${loaded.messages.length} previous messages\n`);
      } else {
        console.error(`Session ${resumeSessionId} not found.`);
        process.exit(1);
      }
    } catch (error) {
      console.error('Failed to resume session:', error);
      process.exit(1);
    }
  }

  // Create new session if not resuming
  if (!session && store) {
    try {
      session = await store.createSession({
        prompt: initialPrompt || 'Interactive chat session',
        mode: 'interactive',
        cwd: process.cwd(),
        model: modelDisplayName,
      });
      // Set session context for background tasks
      setCurrentSessionId(session.id);

      if (verbose) {
        console.log(`Session created: ${session.id.slice(0, 8)}`);
      }
    } catch (error) {
      console.error('Failed to create session:', error);
      // Continue without persistence
    }
  }

  // Track total usage for session
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Message handler that integrates with AI SDK and persistence
  const handleMessage = async (
    userMessage: string,
    callbacks: {
      onToken: (token: string) => void;
      onThinking: (thinking: string) => void;
      onToolCall: (id: string, name: string, args: Record<string, unknown>) => void;
      onToolResult: (id: string, name: string, result: string) => void;
      onComplete: (usage?: { inputTokens?: number; outputTokens?: number }) => void;
      onError: (error: Error) => void;
    }
  ): Promise<void> => {
    // Save user message to database
    if (session && store) {
      try {
        await store.addMessage({
          sessionId: session.id,
          role: 'user',
          content: userMessage,
          turnIndex,
          messageIndex: 0,
        });
      } catch (error) {
        if (verbose) {
          console.error('Failed to save user message:', error);
        }
      }
    }

    // Add user message to conversation history
    messages.push({ role: 'user', content: userMessage });

    try {
      const result = await streamText({
        model,
        system: systemPrompt,
        messages,
        tools: chatTools, // Use the enhanced tools
        maxSteps: 10,
        maxTokens: 4096,
        onStepFinish: (step) => {
          // Capture reasoning/thinking from step (if available)
          const reasoning = (step as { reasoning?: string }).reasoning;
          if (reasoning) {
            callbacks.onThinking(reasoning);
          }

          if (step.toolCalls && Array.isArray(step.toolCalls)) {
            for (const tc of step.toolCalls) {
              const toolCall = tc as { toolCallId: string; toolName: string; args: Record<string, unknown> };
              callbacks.onToolCall(toolCall.toolCallId, toolCall.toolName, toolCall.args);
            }
          }
          if (step.toolResults && Array.isArray(step.toolResults)) {
            for (const tr of step.toolResults) {
              const toolResult = tr as { toolCallId: string; toolName: string; result: unknown };
              callbacks.onToolResult(
                toolResult.toolCallId,
                toolResult.toolName,
                typeof toolResult.result === 'string' ? toolResult.result : JSON.stringify(toolResult.result)
              );
            }
          }
        },
      });

      let fullResponse = '';

      // Stream reasoning/thinking content if available
      // Note: We consume reasoningStream concurrently with textStream to avoid blocking
      let reasoningPromise: Promise<void> | null = null;
      if ('reasoningStream' in result && result.reasoningStream) {
        const reasoningStream = result.reasoningStream as AsyncIterable<string>;
        reasoningPromise = (async () => {
          try {
            for await (const chunk of reasoningStream) {
              callbacks.onThinking(chunk);
            }
          } catch {
            // Reasoning stream may not be available for all models
          }
        })();
      }

      // Stream the response
      for await (const chunk of result.textStream) {
        fullResponse += chunk;
        callbacks.onToken(chunk);
      }

      // Wait for reasoning stream to complete (if any) before proceeding
      if (reasoningPromise) {
        await reasoningPromise;
      }

      // Add assistant response to conversation history
      messages.push({ role: 'assistant', content: fullResponse });

      // Get usage stats
      const usage = await result.usage;
      const inputTokens = usage?.promptTokens ?? 0;
      const outputTokens = usage?.completionTokens ?? 0;

      // Track totals
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;

      // Save assistant message to database
      if (session && store) {
        try {
          await store.addMessage({
            sessionId: session.id,
            role: 'assistant',
            content: fullResponse,
            turnIndex,
            messageIndex: 1,
            tokenCount: outputTokens,
          });

          // Update session token counts
          await store.updateSessionTokens(session.id, inputTokens, outputTokens);
        } catch (error) {
          if (verbose) {
            console.error('Failed to save assistant message:', error);
          }
        }
      }

      // Increment turn index for next exchange
      turnIndex++;

      callbacks.onComplete({
        inputTokens,
        outputTokens,
      });
    } catch (error) {
      // Save error to session
      if (session && store) {
        try {
          await store.errorSession(session.id);
        } catch {
          // Ignore error saving error state
        }
      }

      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  };

  // Render the chat interface
  // Note: Use 0 (unlimited) for content limits to show full results
  // Users can scroll in terminal to see full output
  const { waitUntilExit } = render(
    <ChatView
      onMessage={handleMessage}
      welcomeMessage={welcomeMessage}
      model={modelDisplayName}
      config={{
        verbose,
        showToolCalls: true,
        showTimestamps: false,
        showThinking: true,
        maxToolResultLength: 0, // 0 = unlimited - show full tool results
        maxThinkingLength: 0,   // 0 = unlimited - show full thinking
      }}
    />
  );

  // Wait for the user to exit
  await waitUntilExit();

  // Clean up MCP client
  await octocodeClient.disconnect();

  // Complete session on exit
  if (session && store) {
    try {
      await store.completeSession(session.id, {
        totalInputTokens,
        totalOutputTokens,
      });

      if (verbose) {
        console.log(`\nSession ${session.id.slice(0, 8)} saved.`);
        console.log(`  Total tokens: ${totalInputTokens + totalOutputTokens}`);
      }
    } catch (error) {
      if (verbose) {
        console.error('Failed to complete session:', error);
      }
    }
  }

  // Clear session context
  clearCurrentSessionId();

  // Close database connection
  closeDatabase();
}

export default runChat;
