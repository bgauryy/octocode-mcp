/**
 * Provider Types for Multi-Provider LLM Support
 *
 * Type definitions for provider-agnostic LLM integration
 * using Vercel AI SDK as the unified interface.
 */

import type { LanguageModel } from 'ai';

// ============================================
// Provider Types
// ============================================

/**
 * Supported AI providers
 */
export type LLMProvider =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'groq'
  | 'openrouter'
  | 'bedrock'
  | 'vertex'
  | 'local';

/**
 * Provider status
 */
export interface ProviderStatus {
  provider: LLMProvider;
  configured: boolean;
  envVar?: string;
  displayName: string;
}

/**
 * Model identifier format: "provider:model-name"
 * Example: "anthropic:claude-4-sonnet", "openai:gpt-4o"
 */
export type ModelId = `${LLMProvider}:${string}`;

// ============================================
// Model Registry Types
// ============================================

/**
 * Model capabilities
 */
export interface ModelCapabilities {
  /** Supports tool/function calling */
  toolCalling: boolean;
  /** Supports streaming responses */
  streaming: boolean;
  /** Supports vision/image input */
  vision: boolean;
  /** Supports extended thinking/reasoning */
  reasoning: boolean;
  /** Supports JSON mode */
  jsonMode: boolean;
}

/**
 * Model pricing (per 1M tokens)
 */
export interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
  /** Cache read tokens (if supported) */
  cacheReadPer1M?: number;
  /** Cache write tokens (if supported) */
  cacheWritePer1M?: number;
}

/**
 * Model definition
 */
export interface ModelDefinition {
  /** Model ID (provider:model format) */
  id: ModelId;
  /** Display name */
  name: string;
  /** Provider this model belongs to */
  provider: LLMProvider;
  /** API model identifier (sent to provider) */
  apiModel: string;
  /** Context window size in tokens */
  contextWindow: number;
  /** Default max output tokens */
  defaultMaxTokens: number;
  /** Model capabilities */
  capabilities: ModelCapabilities;
  /** Pricing info */
  pricing: ModelPricing;
  /** Whether this is the default model for the provider */
  isDefault?: boolean;
  /** Model description */
  description?: string;
}

// ============================================
// Provider Configuration Types
// ============================================

/**
 * Base provider configuration
 */
export interface BaseProviderConfig {
  provider: LLMProvider;
  enabled: boolean;
}

/**
 * API key based provider config
 */
export interface APIKeyProviderConfig extends BaseProviderConfig {
  apiKey?: string;
  baseUrl?: string;
}

/**
 * Local/Ollama provider config
 */
export interface LocalProviderConfig extends BaseProviderConfig {
  provider: 'local';
  baseUrl: string;
  models?: string[];
}

/**
 * AWS Bedrock provider config
 */
export interface BedrockProviderConfig extends BaseProviderConfig {
  provider: 'bedrock';
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

/**
 * Google Vertex AI provider config
 */
export interface VertexProviderConfig extends BaseProviderConfig {
  provider: 'vertex';
  projectId?: string;
  location?: string;
}

/**
 * Union type for all provider configs
 */
export type ProviderConfig =
  | APIKeyProviderConfig
  | LocalProviderConfig
  | BedrockProviderConfig
  | VertexProviderConfig;

// ============================================
// AI Configuration Types
// ============================================

/**
 * Agent-specific model configuration
 */
export interface AgentModelConfig {
  /** Primary model */
  model: ModelId;
  /** Fallback model if primary unavailable */
  fallback?: ModelId;
}

/**
 * Full AI configuration
 */
export interface AIConfig {
  /** Default provider */
  defaultProvider: LLMProvider;
  /** Default model (provider:model format) */
  defaultModel: ModelId;
  /** Per-provider configurations */
  providers: Partial<Record<LLMProvider, ProviderConfig>>;
  /** Per-agent model defaults */
  agentDefaults?: {
    research?: ModelId;
    coding?: ModelId;
    planning?: ModelId;
    quick?: ModelId;
  };
}

// ============================================
// Runtime Types
// ============================================

/**
 * Resolved model ready for use
 */
export interface ResolvedModel {
  /** The Vercel AI SDK language model */
  model: LanguageModel;
  /** Model definition/metadata */
  definition: ModelDefinition;
  /** Provider this model belongs to */
  provider: LLMProvider;
}

/**
 * Provider factory function type
 */
export type ProviderFactory = (modelId: string) => LanguageModel;

// ============================================
// Environment Variable Mappings
// ============================================

/**
 * Environment variables for each provider
 */
export const PROVIDER_ENV_VARS: Record<LLMProvider, string[]> = {
  anthropic: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  google: ['GOOGLE_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'],
  groq: ['GROQ_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  bedrock: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
  vertex: ['GOOGLE_APPLICATION_CREDENTIALS'],
  local: ['LOCAL_ENDPOINT', 'OLLAMA_HOST'],
};

/**
 * Default base URLs for providers
 */
export const PROVIDER_BASE_URLS: Partial<Record<LLMProvider, string>> = {
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  local: 'http://localhost:11434/v1',
};

/**
 * Provider display names
 */
export const PROVIDER_DISPLAY_NAMES: Record<LLMProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (GPT)',
  google: 'Google (Gemini)',
  groq: 'Groq (Fast Inference)',
  openrouter: 'OpenRouter',
  bedrock: 'AWS Bedrock',
  vertex: 'Google Vertex AI',
  local: 'Local (Ollama)',
};
