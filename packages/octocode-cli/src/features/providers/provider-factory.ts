/**
 * Provider Factory
 *
 * Creates Vercel AI SDK language model instances from model IDs.
 * Handles provider-specific configuration and environment variables.
 */

import { execSync } from 'node:child_process';
import type { LanguageModel } from 'ai';
import type {
  LLMProvider,
  ModelId,
  ResolvedModel,
  ProviderStatus,
} from '../../types/provider.js';
import {
  PROVIDER_ENV_VARS,
  PROVIDER_BASE_URLS,
  PROVIDER_DISPLAY_NAMES,
} from '../../types/provider.js';
import {
  getModelDefinition,
  parseModelId,
  getDefaultModel,
} from './model-registry.js';

// ============================================
// Environment Helpers
// ============================================

/**
 * Get API key from environment for a provider
 */
export function getProviderApiKey(provider: LLMProvider): string | null {
  const envVars = PROVIDER_ENV_VARS[provider] || [];
  for (const envVar of envVars) {
    const value = process.env[envVar];
    if (value) return value;
  }
  return null;
}

/**
 * Check if a provider is configured (has API key, endpoint, or OAuth)
 */
export function isProviderConfigured(provider: LLMProvider): boolean {
  if (provider === 'local') {
    // Local always available if endpoint is set or default localhost
    return true;
  }

  // Check environment variables first
  if (getProviderApiKey(provider) !== null) {
    return true;
  }

  // For Anthropic, also check Claude Code OAuth credentials (sync check)
  if (provider === 'anthropic') {
    try {
      // Use synchronous check - Claude Code creds are in macOS keychain
      const result = execSync(
        'security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null',
        { encoding: 'utf-8', timeout: 2000 }
      ).trim();
      if (result) {
        const creds = JSON.parse(result);
        if (
          creds?.claudeAiOauth?.accessToken &&
          creds.claudeAiOauth.expiresAt > Date.now()
        ) {
          return true;
        }
      }
    } catch {
      // Keychain access failed or not on macOS, skip OAuth check
    }
  }

  return false;
}

/**
 * Get status of all providers
 */
export function getProviderStatuses(): ProviderStatus[] {
  const providers: LLMProvider[] = [
    'anthropic',
    'openai',
    'google',
    'groq',
    'openrouter',
    'bedrock',
    'vertex',
    'local',
  ];

  return providers.map(provider => {
    const envVars = PROVIDER_ENV_VARS[provider] || [];
    const configured = isProviderConfigured(provider);
    const configuredVar = envVars.find(v => process.env[v]);

    return {
      provider,
      configured,
      envVar: configuredVar,
      displayName: PROVIDER_DISPLAY_NAMES[provider],
    };
  });
}

/**
 * Get configured providers
 */
export function getConfiguredProviders(): LLMProvider[] {
  return getProviderStatuses()
    .filter(s => s.configured)
    .map(s => s.provider);
}

// ============================================
// Provider Factory
// ============================================

/**
 * Create an Anthropic model instance
 */
async function createAnthropicModel(modelName: string): Promise<LanguageModel> {
  const { createAnthropic } = await import('@ai-sdk/anthropic');

  // First check environment variable
  let apiKey = getProviderApiKey('anthropic');

  // Fall back to Claude Code OAuth token from keychain
  if (!apiKey) {
    try {
      const { getClaudeCodeCredentials, isClaudeCodeTokenValid } =
        await import('../api-keys.js');
      const creds = getClaudeCodeCredentials();
      if (creds?.claudeAiOauth && isClaudeCodeTokenValid(creds)) {
        apiKey = creds.claudeAiOauth.accessToken;
      }
    } catch {
      // api-keys module not available
    }
  }

  if (!apiKey) {
    throw new Error(
      'Anthropic API key not found. Set ANTHROPIC_API_KEY or install Claude Code.'
    );
  }

  const anthropic = createAnthropic({ apiKey });
  return anthropic(modelName);
}

/**
 * Create an OpenAI model instance
 */
async function createOpenAIModel(modelName: string): Promise<LanguageModel> {
  const { createOpenAI } = await import('@ai-sdk/openai');

  const apiKey = getProviderApiKey('openai');
  if (!apiKey) {
    throw new Error(
      'OpenAI API key not found. Set OPENAI_API_KEY environment variable.'
    );
  }

  const openai = createOpenAI({ apiKey });
  return openai(modelName);
}

/**
 * Create a Google model instance
 */
async function createGoogleModel(modelName: string): Promise<LanguageModel> {
  const { createGoogleGenerativeAI } = await import('@ai-sdk/google');

  const apiKey = getProviderApiKey('google');
  if (!apiKey) {
    throw new Error(
      'Google API key not found. Set GOOGLE_API_KEY or GEMINI_API_KEY environment variable.'
    );
  }

  const google = createGoogleGenerativeAI({ apiKey });
  return google(modelName);
}

/**
 * Create a Groq model instance (OpenAI-compatible)
 */
async function createGroqModel(modelName: string): Promise<LanguageModel> {
  const { createOpenAI } = await import('@ai-sdk/openai');

  const apiKey = getProviderApiKey('groq');
  if (!apiKey) {
    throw new Error(
      'Groq API key not found. Set GROQ_API_KEY environment variable.'
    );
  }

  const groq = createOpenAI({
    apiKey,
    baseURL: PROVIDER_BASE_URLS.groq,
  });
  return groq(modelName);
}

/**
 * Create an OpenRouter model instance (OpenAI-compatible)
 */
async function createOpenRouterModel(
  modelName: string
): Promise<LanguageModel> {
  const { createOpenAI } = await import('@ai-sdk/openai');

  const apiKey = getProviderApiKey('openrouter');
  if (!apiKey) {
    throw new Error(
      'OpenRouter API key not found. Set OPENROUTER_API_KEY environment variable.'
    );
  }

  const openrouter = createOpenAI({
    apiKey,
    baseURL: PROVIDER_BASE_URLS.openrouter,
  });
  return openrouter(modelName);
}

/**
 * Create a local/Ollama model instance (OpenAI-compatible)
 */
async function createLocalModel(modelName: string): Promise<LanguageModel> {
  const { createOpenAI } = await import('@ai-sdk/openai');

  const baseURL =
    process.env.LOCAL_ENDPOINT ||
    process.env.OLLAMA_HOST ||
    PROVIDER_BASE_URLS.local;

  const local = createOpenAI({
    apiKey: 'ollama', // Ollama doesn't need a real key
    baseURL,
  });
  return local(modelName);
}

/**
 * Create a model instance from a model ID
 * @param modelId - Model ID in format "provider:model-name"
 */
export async function createModel(modelId: ModelId): Promise<LanguageModel> {
  const parsed = parseModelId(modelId);
  if (!parsed) {
    throw new Error(
      `Invalid model ID: ${modelId}. Expected format: provider:model-name`
    );
  }

  const { provider, model } = parsed;

  // Get the API model name from registry, or use the provided model name
  const definition = getModelDefinition(modelId);
  const apiModel = definition?.apiModel ?? model;

  switch (provider) {
    case 'anthropic':
      return createAnthropicModel(apiModel);
    case 'openai':
      return createOpenAIModel(apiModel);
    case 'google':
      return createGoogleModel(apiModel);
    case 'groq':
      return createGroqModel(apiModel);
    case 'openrouter':
      return createOpenRouterModel(apiModel);
    case 'local':
      return createLocalModel(apiModel);
    case 'bedrock':
    case 'vertex':
      throw new Error(
        `Provider ${provider} is not yet supported. Use anthropic, openai, google, groq, or local.`
      );
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Create a resolved model with full metadata
 * @param modelId - Model ID in format "provider:model-name"
 */
export async function resolveModel(modelId: ModelId): Promise<ResolvedModel> {
  const parsed = parseModelId(modelId);
  if (!parsed) {
    throw new Error(`Invalid model ID: ${modelId}`);
  }

  const definition = getModelDefinition(modelId);
  if (!definition) {
    throw new Error(
      `Model not found in registry: ${modelId}. Use a known model or add it to the registry.`
    );
  }

  const model = await createModel(modelId);

  return {
    model,
    definition,
    provider: parsed.provider,
  };
}

/**
 * Get the best available model
 * Tries configured providers in order of preference
 */
export async function getBestAvailableModel(): Promise<ResolvedModel> {
  const preferredOrder: LLMProvider[] = [
    'anthropic',
    'openai',
    'google',
    'groq',
    'local',
  ];

  for (const provider of preferredOrder) {
    if (isProviderConfigured(provider)) {
      const defaultModel = getDefaultModel(provider);
      if (defaultModel) {
        return resolveModel(defaultModel.id);
      }
    }
  }

  throw new Error(
    'No AI provider configured. Set one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY, GROQ_API_KEY'
  );
}

/**
 * Auto-detect the best default model based on available credentials
 */
export function detectDefaultModelId(): ModelId | null {
  const preferredOrder: LLMProvider[] = [
    'anthropic',
    'openai',
    'google',
    'groq',
    'local',
  ];

  for (const provider of preferredOrder) {
    if (isProviderConfigured(provider)) {
      const defaultModel = getDefaultModel(provider);
      if (defaultModel) {
        return defaultModel.id;
      }
    }
  }

  return null;
}
