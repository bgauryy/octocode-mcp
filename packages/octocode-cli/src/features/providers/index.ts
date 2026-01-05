/**
 * Provider Module Exports
 *
 * Public API for the provider factory and model registry.
 */

// Model registry exports
export {
  MODEL_REGISTRY,
  getModelDefinition,
  getProviderModels,
  getDefaultModel,
  getAvailableProviders,
  parseModelId,
  formatModelDisplay,
  getModelsGroupedByProvider,
} from './model-registry.js';

// Provider factory exports
export {
  createModel,
  resolveModel,
  getBestAvailableModel,
  detectDefaultModelId,
  getProviderApiKey,
  isProviderConfigured,
  getProviderStatuses,
  getConfiguredProviders,
} from './provider-factory.js';

// Re-export types
export type {
  LLMProvider,
  ModelId,
  ModelDefinition,
  ModelCapabilities,
  ModelPricing,
  ProviderStatus,
  ResolvedModel,
  AIConfig,
} from '../../types/provider.js';

export {
  PROVIDER_ENV_VARS,
  PROVIDER_BASE_URLS,
  PROVIDER_DISPLAY_NAMES,
} from '../../types/provider.js';
