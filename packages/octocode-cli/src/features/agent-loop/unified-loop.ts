/**
 * Unified Agent Loop
 *
 * Provider-agnostic agent execution loop using Vercel AI SDK.
 * Works with any LLM provider - same tools, different brain.
 *
 * Core Principle: Users pick a model, and it works with ALL tools.
 * No two-tier system. No feature degradation based on provider choice.
 */

import {
  streamText,
  generateText,
  type LanguageModel,
  type CoreTool,
} from 'ai';
import type { ModelId } from '../../types/provider.js';
import { resolveModel } from '../providers/index.js';
import { BUILTIN_TOOLS, RESEARCH_TOOLS, CODING_TOOLS } from '../tools/index.js';

// ============================================
// Types
// ============================================

/**
 * Tool call event for callbacks
 */
export interface ToolCallEvent {
  toolName: string;
  args: unknown;
  result?: unknown;
}

/**
 * Agent loop options
 */
export interface AgentLoopOptions {
  /** Model to use (provider:model format) */
  model: LanguageModel | ModelId;
  /** Initial prompt/task */
  prompt: string;
  /** System prompt */
  systemPrompt?: string;
  /** Tools to make available */
  tools?: Record<string, CoreTool>;
  /** Maximum number of tool execution steps */
  maxSteps?: number;
  /** Maximum tokens for response */
  maxTokens?: number;
  /** Working directory */
  cwd?: string;
  /** Callback when a tool is called */
  onToolCall?: (event: ToolCallEvent) => void;
  /** Callback when text is generated */
  onText?: (text: string) => void;
  /** Callback when step completes */
  onStepComplete?: (step: {
    text: string;
    toolCalls: ToolCallEvent[];
    finishReason: string;
  }) => void;
  /** Whether to use streaming */
  stream?: boolean;
  /** Abort signal */
  abortSignal?: AbortSignal;
}

/**
 * Agent loop result
 */
export interface AgentLoopResult {
  /** Whether the execution was successful */
  success: boolean;
  /** Final text response */
  text: string;
  /** Error message if failed */
  error?: string;
  /** All tool calls made */
  toolCalls: ToolCallEvent[];
  /** Token usage */
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  /** Finish reason */
  finishReason: string;
  /** Number of steps taken */
  steps: number;
}

// ============================================
// Default System Prompts
// ============================================

const DEFAULT_SYSTEM_PROMPT = `You are an expert software developer assistant. You have access to tools for reading, writing, and editing files, as well as running shell commands.

Guidelines:
1. Always read files before modifying them to understand context
2. Make targeted, minimal changes when editing code
3. Test your changes when possible
4. Explain what you're doing and why
5. Ask for clarification if requirements are unclear

You should be helpful, accurate, and efficient in completing tasks.`;

const RESEARCH_SYSTEM_PROMPT = `You are an expert code researcher and analyzer. Your role is to explore, understand, and explain codebases.

Guidelines:
1. Use Read, Glob, and Grep to explore the codebase
2. Follow imports and dependencies to understand code flow
3. Identify patterns, conventions, and architecture
4. Provide clear, structured explanations
5. Cite specific files and line numbers when explaining code

Focus on understanding and explaining, not modifying code.`;

const CODING_SYSTEM_PROMPT = `You are an expert software developer. Your role is to implement features, fix bugs, and improve code quality.

Guidelines:
1. Read and understand existing code before making changes
2. Follow existing patterns and conventions
3. Write clean, maintainable code
4. Test your changes when possible
5. Explain your changes and reasoning

Focus on correct, efficient implementations that follow best practices.`;

// ============================================
// Agent Loop Implementation
// ============================================

/**
 * Run the unified agent loop
 * Works with any LLM provider via Vercel AI SDK
 */
export async function runAgentLoop(
  options: AgentLoopOptions
): Promise<AgentLoopResult> {
  const {
    prompt,
    systemPrompt = DEFAULT_SYSTEM_PROMPT,
    tools = BUILTIN_TOOLS,
    maxSteps = 50,
    maxTokens = 8192,
    onToolCall,
    onText,
    onStepComplete,
    stream = true,
    abortSignal,
  } = options;

  // Resolve model if provided as string
  let model: LanguageModel;
  if (typeof options.model === 'string') {
    const resolved = await resolveModel(options.model);
    model = resolved.model;
  } else {
    model = options.model;
  }

  const allToolCalls: ToolCallEvent[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let stepCount = 0;

  try {
    if (stream) {
      // Streaming mode for real-time feedback
      const result = await streamText({
        model,
        system: systemPrompt,
        prompt,
        tools,
        maxSteps,
        maxTokens,
        abortSignal,
        onStepFinish: ({ text, toolCalls, finishReason, usage }) => {
          stepCount++;

          // Track tool calls
          const stepToolCalls: ToolCallEvent[] =
            toolCalls?.map(tc => ({
              toolName: tc.toolName,
              args: tc.args,
            })) ?? [];

          allToolCalls.push(...stepToolCalls);

          // Emit tool call events
          for (const tc of stepToolCalls) {
            onToolCall?.(tc);
          }

          // Emit text
          if (text) {
            onText?.(text);
          }

          // Track usage
          if (usage) {
            totalInputTokens += usage.promptTokens;
            totalOutputTokens += usage.completionTokens;
          }

          // Step complete callback
          onStepComplete?.({
            text,
            toolCalls: stepToolCalls,
            finishReason,
          });
        },
      });

      // Consume the stream
      let finalText = '';
      for await (const chunk of result.textStream) {
        finalText += chunk;
      }

      return {
        success: true,
        text: finalText,
        toolCalls: allToolCalls,
        usage: {
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
        },
        finishReason: result.finishReason ?? 'stop',
        steps: stepCount,
      };
    } else {
      // Non-streaming mode
      const result = await generateText({
        model,
        system: systemPrompt,
        prompt,
        tools,
        maxSteps,
        maxTokens,
        abortSignal,
      });

      // Track tool calls from steps
      for (const step of result.steps) {
        const stepToolCalls: ToolCallEvent[] =
          step.toolCalls?.map(tc => ({
            toolName: tc.toolName,
            args: tc.args,
          })) ?? [];

        allToolCalls.push(...stepToolCalls);

        for (const tc of stepToolCalls) {
          onToolCall?.(tc);
        }
      }

      return {
        success: true,
        text: result.text,
        toolCalls: allToolCalls,
        usage: {
          inputTokens: result.usage?.promptTokens ?? 0,
          outputTokens: result.usage?.completionTokens ?? 0,
        },
        finishReason: result.finishReason ?? 'stop',
        steps: result.steps.length,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      text: '',
      error: errorMessage,
      toolCalls: allToolCalls,
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      },
      finishReason: 'error',
      steps: stepCount,
    };
  }
}

// ============================================
// Convenience Functions
// ============================================

/**
 * Run agent in research mode (read-only tools)
 */
export async function runResearchLoop(
  options: Omit<AgentLoopOptions, 'tools'>
): Promise<AgentLoopResult> {
  return runAgentLoop({
    ...options,
    tools: RESEARCH_TOOLS,
    systemPrompt: options.systemPrompt ?? RESEARCH_SYSTEM_PROMPT,
  });
}

/**
 * Run agent in coding mode (all tools)
 */
export async function runCodingLoop(
  options: Omit<AgentLoopOptions, 'tools'>
): Promise<AgentLoopResult> {
  return runAgentLoop({
    ...options,
    tools: CODING_TOOLS,
    systemPrompt: options.systemPrompt ?? CODING_SYSTEM_PROMPT,
  });
}

/**
 * Quick single-turn generation (no tools)
 */
export async function quickGenerate(
  modelId: ModelId,
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  const resolved = await resolveModel(modelId);

  const result = await generateText({
    model: resolved.model,
    system: systemPrompt,
    prompt,
  });

  return result.text;
}
