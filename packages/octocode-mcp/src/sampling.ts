import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  CreateMessageRequest,
  CreateMessageResultSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ToolName } from './constants.js';
import type { SamplingResponse } from './types.js';

/**
 * Sampling request schema for input validation
 */
const SamplingRequestSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(['user', 'assistant']),
      content: z.object({
        type: z.literal('text'),
        text: z.string(),
      }),
    })
  ),
  maxTokens: z.number().optional().default(1000),
  temperature: z.number().min(0).max(2).optional().default(0.7),
  stopSequences: z.array(z.string()).optional(),
});

export type SamplingRequest = z.infer<typeof SamplingRequestSchema>;

/**
 * Register sampling capabilities with the MCP server
 * This enables the server to handle sampling requests from clients
 */
export function registerSampling(_server: McpServer): void {
  // Note: In MCP SDK 1.16.0, sampling capabilities are declared in server constructor
}

/**
 * Perform sampling using the MCP server
 * Sends a sampling request to the LLM client for actual text generation
 *
 * @param server - The MCP server instance
 * @param samplingRequest - The sampling request containing messages and parameters
 * @returns Promise<SamplingResponse> - The LLM-generated content and metadata
 */
export async function performSampling(
  server: McpServer,
  samplingRequest: SamplingRequest
): Promise<SamplingResponse> {
  try {
    // Validate the input request
    const validatedRequest = SamplingRequestSchema.parse(samplingRequest);

    // Send sampling request to the LLM client
    const request: CreateMessageRequest = {
      method: 'sampling/createMessage',
      params: {
        messages: validatedRequest.messages,
        maxTokens: validatedRequest.maxTokens,
        temperature: validatedRequest.temperature,
        stopSequences: validatedRequest.stopSequences,
      },
    };

    const result = await server.server.request(
      request,
      CreateMessageResultSchema
    );

    const response: SamplingResponse = {
      content:
        result.content.type === 'text'
          ? result.content.text
          : 'Non-text response received',
      stopReason: result.stopReason,
      usage: {
        promptTokens: 0, // MCP doesn't provide token usage in the same format
        completionTokens: 0,
        totalTokens: 0,
      },
    };

    return response;
  } catch (error) {
    throw new Error(
      `Sampling failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Create a simple text sampling request
 * Utility function to create a basic sampling request with a single user message
 *
 * @param text - The text prompt to sample from
 * @param options - Optional sampling parameters
 * @returns SamplingRequest - The formatted sampling request
 */
export function createTextSamplingRequest(
  text: string,
  options?: {
    maxTokens?: number;
    temperature?: number;
    stopSequences?: string[];
  }
): SamplingRequest {
  return {
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text,
        },
      },
    ],
    maxTokens: options?.maxTokens ?? 1000,
    temperature: options?.temperature ?? 0.7,
    stopSequences: options?.stopSequences,
  };
}

/**
 * Sampling utilities for common use cases
 */
export const SamplingUtils = {
  /**
   * Create a code generation sampling request
   */
  createCodeSamplingRequest: (
    prompt: string,
    language: string = 'typescript',
    options?: { maxTokens?: number; temperature?: number }
  ): SamplingRequest => {
    return createTextSamplingRequest(
      `Generate ${language} code for: ${prompt}`,
      {
        maxTokens: options?.maxTokens ?? 2000,
        temperature: options?.temperature ?? 0.3, // Lower temperature for code
        stopSequences: ['```'],
      }
    );
  },

  /**
   * Create a text completion sampling request
   */
  createCompletionSamplingRequest: (
    text: string,
    options?: { maxTokens?: number; temperature?: number }
  ): SamplingRequest => {
    return createTextSamplingRequest(
      `Complete the following text: ${text}`,
      options
    );
  },

  /**
   * Create a question-answering sampling request
   */
  createQASamplingRequest: (
    question: string,
    context?: string,
    options?: { maxTokens?: number; temperature?: number }
  ): SamplingRequest => {
    const prompt = context
      ? `Context: ${context}\n\nQuestion: ${question}`
      : question;

    return createTextSamplingRequest(prompt, options);
  },

  /**
   * Create a research-enhanced sampling request with context injection
   */
  createResearchSamplingRequest: async (
    sessionId: string,
    toolName: ToolName,
    userPrompt: string,
    _toolParams: Record<string, unknown> = {},
    options?: { maxTokens?: number; temperature?: number }
  ): Promise<SamplingRequest> => {
    // This would inject research context via MCP sampling
    const enhancedPrompt = `${userPrompt}

# Research Enhancement Context
This request is part of ongoing research session: ${sessionId}
Current tool: ${toolName}
Research patterns and intelligence will be injected via MCP sampling protocol.`;

    return createTextSamplingRequest(enhancedPrompt, {
      maxTokens: options?.maxTokens ?? 2000,
      temperature: options?.temperature ?? 0.7,
    });
  },

  /**
   * Create a research synthesis sampling request
   */
  createSynthesisSamplingRequest: (
    discoveries: string[],
    options?: { maxTokens?: number; temperature?: number }
  ): SamplingRequest => {
    const prompt = `# Research Synthesis Task

Key Discoveries:
${discoveries.map((d, i) => `${i + 1}. ${d}`).join('\n')}

Please synthesize these findings into comprehensive insights and actionable recommendations.`;

    return createTextSamplingRequest(prompt, {
      maxTokens: options?.maxTokens ?? 3000,
      temperature: options?.temperature ?? 0.6,
    });
  },
};

/**
 * Research Sampling utilities
 */
export const ResearchSampling = {
  /**
   * Context injection for enhanced tool responses
   */
  async injectToolContext(
    _sessionId: string,
    _toolName: ToolName,
    _toolParams: Record<string, unknown>,
    _hints: string[]
  ): Promise<string | null> {
    // Not implemented yet
    return null;
  },

  /**
   * Session update tracking
   */
  updateSession(
    _sessionId: string,
    _toolName: ToolName,
    _params: Record<string, unknown>,
    _result: {
      success: boolean;
      resultCount: number;
      hints: string[];
      error?: string;
      executionTime: number;
    }
  ): void {
    // Not implemented yet
  },

  /**
   * Get session insights
   */
  getSessionInsights(_sessionId: string): Record<string, unknown> | null {
    // Not implemented yet
    return null;
  },
};
