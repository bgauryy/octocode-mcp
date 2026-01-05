/**
 * Model Registry
 *
 * Central registry of all supported AI models across providers.
 * Contains model metadata including pricing, capabilities, and context windows.
 */

import type {
  ModelDefinition,
  ModelId,
  LLMProvider,
} from '../../types/provider.js';

// ============================================
// Anthropic Models
// ============================================

const ANTHROPIC_MODELS: ModelDefinition[] = [
  {
    id: 'anthropic:claude-4-sonnet' as ModelId,
    name: 'Claude 4 Sonnet',
    provider: 'anthropic',
    apiModel: 'claude-sonnet-4-20250514',
    contextWindow: 200000,
    defaultMaxTokens: 8192,
    capabilities: {
      toolCalling: true,
      streaming: true,
      vision: true,
      reasoning: true,
      jsonMode: true,
    },
    pricing: {
      inputPer1M: 3.0,
      outputPer1M: 15.0,
      cacheReadPer1M: 0.3,
      cacheWritePer1M: 3.75,
    },
    isDefault: true,
    description: 'Best balance of intelligence and speed',
  },
  {
    id: 'anthropic:claude-4-opus' as ModelId,
    name: 'Claude 4 Opus',
    provider: 'anthropic',
    apiModel: 'claude-opus-4-20250514',
    contextWindow: 200000,
    defaultMaxTokens: 8192,
    capabilities: {
      toolCalling: true,
      streaming: true,
      vision: true,
      reasoning: true,
      jsonMode: true,
    },
    pricing: {
      inputPer1M: 15.0,
      outputPer1M: 75.0,
      cacheReadPer1M: 1.5,
      cacheWritePer1M: 18.75,
    },
    description: 'Most capable model for complex tasks',
  },
  {
    id: 'anthropic:claude-3.7-sonnet' as ModelId,
    name: 'Claude 3.7 Sonnet',
    provider: 'anthropic',
    apiModel: 'claude-3-7-sonnet-20250219',
    contextWindow: 200000,
    defaultMaxTokens: 8192,
    capabilities: {
      toolCalling: true,
      streaming: true,
      vision: true,
      reasoning: true,
      jsonMode: true,
    },
    pricing: {
      inputPer1M: 3.0,
      outputPer1M: 15.0,
    },
    description: 'Extended thinking with hybrid reasoning',
  },
  {
    id: 'anthropic:claude-3.5-haiku' as ModelId,
    name: 'Claude 3.5 Haiku',
    provider: 'anthropic',
    apiModel: 'claude-3-5-haiku-20241022',
    contextWindow: 200000,
    defaultMaxTokens: 8192,
    capabilities: {
      toolCalling: true,
      streaming: true,
      vision: true,
      reasoning: false,
      jsonMode: true,
    },
    pricing: {
      inputPer1M: 0.8,
      outputPer1M: 4.0,
    },
    description: 'Fast and cost-effective',
  },
];

// ============================================
// OpenAI Models
// ============================================

const OPENAI_MODELS: ModelDefinition[] = [
  {
    id: 'openai:gpt-4o' as ModelId,
    name: 'GPT-4o',
    provider: 'openai',
    apiModel: 'gpt-4o',
    contextWindow: 128000,
    defaultMaxTokens: 16384,
    capabilities: {
      toolCalling: true,
      streaming: true,
      vision: true,
      reasoning: false,
      jsonMode: true,
    },
    pricing: {
      inputPer1M: 2.5,
      outputPer1M: 10.0,
    },
    isDefault: true,
    description: 'Most capable multimodal model',
  },
  {
    id: 'openai:gpt-4o-mini' as ModelId,
    name: 'GPT-4o Mini',
    provider: 'openai',
    apiModel: 'gpt-4o-mini',
    contextWindow: 128000,
    defaultMaxTokens: 16384,
    capabilities: {
      toolCalling: true,
      streaming: true,
      vision: true,
      reasoning: false,
      jsonMode: true,
    },
    pricing: {
      inputPer1M: 0.15,
      outputPer1M: 0.6,
    },
    description: 'Fast and affordable',
  },
  {
    id: 'openai:gpt-4-turbo' as ModelId,
    name: 'GPT-4 Turbo',
    provider: 'openai',
    apiModel: 'gpt-4-turbo',
    contextWindow: 128000,
    defaultMaxTokens: 4096,
    capabilities: {
      toolCalling: true,
      streaming: true,
      vision: true,
      reasoning: false,
      jsonMode: true,
    },
    pricing: {
      inputPer1M: 10.0,
      outputPer1M: 30.0,
    },
    description: 'Previous generation flagship',
  },
  {
    id: 'openai:o1' as ModelId,
    name: 'O1',
    provider: 'openai',
    apiModel: 'o1',
    contextWindow: 200000,
    defaultMaxTokens: 100000,
    capabilities: {
      toolCalling: true,
      streaming: false,
      vision: true,
      reasoning: true,
      jsonMode: true,
    },
    pricing: {
      inputPer1M: 15.0,
      outputPer1M: 60.0,
    },
    description: 'Advanced reasoning model',
  },
  {
    id: 'openai:o1-mini' as ModelId,
    name: 'O1 Mini',
    provider: 'openai',
    apiModel: 'o1-mini',
    contextWindow: 128000,
    defaultMaxTokens: 65536,
    capabilities: {
      toolCalling: true,
      streaming: false,
      vision: false,
      reasoning: true,
      jsonMode: true,
    },
    pricing: {
      inputPer1M: 3.0,
      outputPer1M: 12.0,
    },
    description: 'Fast reasoning model',
  },
];

// ============================================
// Google Models
// ============================================

const GOOGLE_MODELS: ModelDefinition[] = [
  {
    id: 'google:gemini-2.0-flash' as ModelId,
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    apiModel: 'gemini-2.0-flash',
    contextWindow: 1000000,
    defaultMaxTokens: 8192,
    capabilities: {
      toolCalling: true,
      streaming: true,
      vision: true,
      reasoning: false,
      jsonMode: true,
    },
    pricing: {
      inputPer1M: 0.1,
      outputPer1M: 0.4,
    },
    isDefault: true,
    description: 'Fast with 1M context window',
  },
  {
    id: 'google:gemini-2.0-pro' as ModelId,
    name: 'Gemini 2.0 Pro',
    provider: 'google',
    apiModel: 'gemini-2.0-pro',
    contextWindow: 2000000,
    defaultMaxTokens: 8192,
    capabilities: {
      toolCalling: true,
      streaming: true,
      vision: true,
      reasoning: true,
      jsonMode: true,
    },
    pricing: {
      inputPer1M: 1.25,
      outputPer1M: 5.0,
    },
    description: 'Most capable with 2M context',
  },
  {
    id: 'google:gemini-1.5-pro' as ModelId,
    name: 'Gemini 1.5 Pro',
    provider: 'google',
    apiModel: 'gemini-1.5-pro',
    contextWindow: 2000000,
    defaultMaxTokens: 8192,
    capabilities: {
      toolCalling: true,
      streaming: true,
      vision: true,
      reasoning: false,
      jsonMode: true,
    },
    pricing: {
      inputPer1M: 1.25,
      outputPer1M: 5.0,
    },
    description: 'Previous generation pro model',
  },
  {
    id: 'google:gemini-1.5-flash' as ModelId,
    name: 'Gemini 1.5 Flash',
    provider: 'google',
    apiModel: 'gemini-1.5-flash',
    contextWindow: 1000000,
    defaultMaxTokens: 8192,
    capabilities: {
      toolCalling: true,
      streaming: true,
      vision: true,
      reasoning: false,
      jsonMode: true,
    },
    pricing: {
      inputPer1M: 0.075,
      outputPer1M: 0.3,
    },
    description: 'Fast and cost-effective',
  },
];

// ============================================
// Groq Models (Fast Inference)
// ============================================

const GROQ_MODELS: ModelDefinition[] = [
  {
    id: 'groq:llama-3.3-70b' as ModelId,
    name: 'Llama 3.3 70B',
    provider: 'groq',
    apiModel: 'llama-3.3-70b-versatile',
    contextWindow: 128000,
    defaultMaxTokens: 32768,
    capabilities: {
      toolCalling: true,
      streaming: true,
      vision: false,
      reasoning: false,
      jsonMode: true,
    },
    pricing: {
      inputPer1M: 0.59,
      outputPer1M: 0.79,
    },
    isDefault: true,
    description: 'Fast open-source model',
  },
  {
    id: 'groq:llama-3.1-8b' as ModelId,
    name: 'Llama 3.1 8B',
    provider: 'groq',
    apiModel: 'llama-3.1-8b-instant',
    contextWindow: 131072,
    defaultMaxTokens: 8192,
    capabilities: {
      toolCalling: true,
      streaming: true,
      vision: false,
      reasoning: false,
      jsonMode: true,
    },
    pricing: {
      inputPer1M: 0.05,
      outputPer1M: 0.08,
    },
    description: 'Ultra-fast small model',
  },
  {
    id: 'groq:mixtral-8x7b' as ModelId,
    name: 'Mixtral 8x7B',
    provider: 'groq',
    apiModel: 'mixtral-8x7b-32768',
    contextWindow: 32768,
    defaultMaxTokens: 8192,
    capabilities: {
      toolCalling: true,
      streaming: true,
      vision: false,
      reasoning: false,
      jsonMode: true,
    },
    pricing: {
      inputPer1M: 0.24,
      outputPer1M: 0.24,
    },
    description: 'Mixture of experts model',
  },
];

// ============================================
// Local/Ollama Models (Templates)
// ============================================

const LOCAL_MODELS: ModelDefinition[] = [
  {
    id: 'local:llama3.1' as ModelId,
    name: 'Llama 3.1',
    provider: 'local',
    apiModel: 'llama3.1',
    contextWindow: 128000,
    defaultMaxTokens: 8192,
    capabilities: {
      toolCalling: true,
      streaming: true,
      vision: false,
      reasoning: false,
      jsonMode: true,
    },
    pricing: {
      inputPer1M: 0,
      outputPer1M: 0,
    },
    isDefault: true,
    description: 'Local inference (free)',
  },
  {
    id: 'local:codellama' as ModelId,
    name: 'Code Llama',
    provider: 'local',
    apiModel: 'codellama',
    contextWindow: 16000,
    defaultMaxTokens: 4096,
    capabilities: {
      toolCalling: true,
      streaming: true,
      vision: false,
      reasoning: false,
      jsonMode: true,
    },
    pricing: {
      inputPer1M: 0,
      outputPer1M: 0,
    },
    description: 'Optimized for coding',
  },
  {
    id: 'local:deepseek-coder' as ModelId,
    name: 'DeepSeek Coder',
    provider: 'local',
    apiModel: 'deepseek-coder',
    contextWindow: 16000,
    defaultMaxTokens: 4096,
    capabilities: {
      toolCalling: true,
      streaming: true,
      vision: false,
      reasoning: false,
      jsonMode: true,
    },
    pricing: {
      inputPer1M: 0,
      outputPer1M: 0,
    },
    description: 'Strong coding model',
  },
];

// ============================================
// Model Registry
// ============================================

/**
 * All supported models
 */
export const MODEL_REGISTRY: ModelDefinition[] = [
  ...ANTHROPIC_MODELS,
  ...OPENAI_MODELS,
  ...GOOGLE_MODELS,
  ...GROQ_MODELS,
  ...LOCAL_MODELS,
];

/**
 * Map for fast model lookup by ID
 */
const MODEL_MAP = new Map<ModelId, ModelDefinition>(
  MODEL_REGISTRY.map(m => [m.id, m])
);

// ============================================
// Registry Functions
// ============================================

/**
 * Get model definition by ID
 */
export function getModelDefinition(modelId: ModelId): ModelDefinition | null {
  return MODEL_MAP.get(modelId) ?? null;
}

/**
 * Get all models for a provider
 */
export function getProviderModels(provider: LLMProvider): ModelDefinition[] {
  return MODEL_REGISTRY.filter(m => m.provider === provider);
}

/**
 * Get default model for a provider
 */
export function getDefaultModel(provider: LLMProvider): ModelDefinition | null {
  return (
    MODEL_REGISTRY.find(m => m.provider === provider && m.isDefault) ?? null
  );
}

/**
 * Get all available providers
 */
export function getAvailableProviders(): LLMProvider[] {
  const providers = new Set<LLMProvider>();
  for (const model of MODEL_REGISTRY) {
    providers.add(model.provider);
  }
  return Array.from(providers);
}

/**
 * Parse model ID into provider and model parts
 */
export function parseModelId(
  modelId: string
): { provider: LLMProvider; model: string } | null {
  const parts = modelId.split(':');
  if (parts.length !== 2) return null;

  const [provider, model] = parts;
  const validProviders: LLMProvider[] = [
    'anthropic',
    'openai',
    'google',
    'groq',
    'openrouter',
    'bedrock',
    'vertex',
    'local',
  ];

  if (!validProviders.includes(provider as LLMProvider)) return null;

  return { provider: provider as LLMProvider, model };
}

/**
 * Format model for display
 */
export function formatModelDisplay(model: ModelDefinition): string {
  const parts = [`${model.name}`];

  if (model.pricing.inputPer1M > 0) {
    parts.push(
      `$${model.pricing.inputPer1M}/$${model.pricing.outputPer1M} per 1M`
    );
  } else {
    parts.push('Free');
  }

  const contextK = Math.round(model.contextWindow / 1000);
  parts.push(`${contextK}K context`);

  const caps: string[] = [];
  if (model.capabilities.reasoning) caps.push('reasoning');
  if (model.capabilities.vision) caps.push('vision');
  if (caps.length > 0) {
    parts.push(caps.join(', '));
  }

  return parts.join(' · ');
}

/**
 * Get models grouped by provider
 */
export function getModelsGroupedByProvider(): Map<
  LLMProvider,
  ModelDefinition[]
> {
  const grouped = new Map<LLMProvider, ModelDefinition[]>();

  for (const model of MODEL_REGISTRY) {
    if (!grouped.has(model.provider)) {
      grouped.set(model.provider, []);
    }
    grouped.get(model.provider)!.push(model);
  }

  return grouped;
}
