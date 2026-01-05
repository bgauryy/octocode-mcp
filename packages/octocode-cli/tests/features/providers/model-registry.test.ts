/**
 * Tests for Model Registry
 */

import { describe, it, expect } from 'vitest';
import {
  MODEL_REGISTRY,
  getModelDefinition,
  getProviderModels,
  getDefaultModel,
  getAvailableProviders,
  parseModelId,
  formatModelDisplay,
  getModelsGroupedByProvider,
} from '../../../src/features/providers/model-registry.js';
import type { LLMProvider, ModelId } from '../../../src/types/provider.js';

describe('Model Registry', () => {
  describe('MODEL_REGISTRY', () => {
    it('should have models defined', () => {
      expect(MODEL_REGISTRY.length).toBeGreaterThan(0);
    });

    it('should have models for all major providers', () => {
      const providers = new Set(MODEL_REGISTRY.map(m => m.provider));
      expect(providers.has('anthropic')).toBe(true);
      expect(providers.has('openai')).toBe(true);
      expect(providers.has('google')).toBe(true);
      expect(providers.has('groq')).toBe(true);
      expect(providers.has('local')).toBe(true);
    });

    it('should have valid model definitions', () => {
      for (const model of MODEL_REGISTRY) {
        expect(model.id).toBeDefined();
        expect(model.name).toBeDefined();
        expect(model.provider).toBeDefined();
        expect(model.apiModel).toBeDefined();
        expect(model.contextWindow).toBeGreaterThan(0);
        expect(model.defaultMaxTokens).toBeGreaterThan(0);
        expect(model.capabilities).toBeDefined();
        expect(model.pricing).toBeDefined();
      }
    });
  });

  describe('getModelDefinition', () => {
    it('should return model definition for valid ID', () => {
      const model = getModelDefinition('anthropic:claude-4-sonnet' as ModelId);
      expect(model).not.toBeNull();
      expect(model?.name).toBe('Claude 4 Sonnet');
      expect(model?.provider).toBe('anthropic');
    });

    it('should return null for invalid ID', () => {
      const model = getModelDefinition('invalid:model' as ModelId);
      expect(model).toBeNull();
    });
  });

  describe('getProviderModels', () => {
    it('should return models for a provider', () => {
      const anthropicModels = getProviderModels('anthropic');
      expect(anthropicModels.length).toBeGreaterThan(0);
      expect(anthropicModels.every(m => m.provider === 'anthropic')).toBe(true);
    });

    it('should return empty array for provider with no models', () => {
      const models = getProviderModels('vertex' as LLMProvider);
      expect(models).toEqual([]);
    });
  });

  describe('getDefaultModel', () => {
    it('should return default model for provider', () => {
      const defaultModel = getDefaultModel('anthropic');
      expect(defaultModel).not.toBeNull();
      expect(defaultModel?.isDefault).toBe(true);
      expect(defaultModel?.provider).toBe('anthropic');
    });

    it('should return null for provider without default', () => {
      const defaultModel = getDefaultModel('vertex' as LLMProvider);
      expect(defaultModel).toBeNull();
    });
  });

  describe('getAvailableProviders', () => {
    it('should return list of providers', () => {
      const providers = getAvailableProviders();
      expect(providers.length).toBeGreaterThan(0);
      expect(providers.includes('anthropic')).toBe(true);
      expect(providers.includes('openai')).toBe(true);
    });
  });

  describe('parseModelId', () => {
    it('should parse valid model ID', () => {
      const result = parseModelId('anthropic:claude-4-sonnet');
      expect(result).toEqual({
        provider: 'anthropic',
        model: 'claude-4-sonnet',
      });
    });

    it('should parse model ID with multiple colons', () => {
      const result = parseModelId('openai:gpt-4o');
      expect(result).toEqual({
        provider: 'openai',
        model: 'gpt-4o',
      });
    });

    it('should return null for invalid format', () => {
      expect(parseModelId('invalid')).toBeNull();
      expect(parseModelId('unknown:model')).toBeNull();
      expect(parseModelId('')).toBeNull();
    });
  });

  describe('formatModelDisplay', () => {
    it('should format model with pricing', () => {
      const model = getModelDefinition('anthropic:claude-4-sonnet' as ModelId);
      if (model) {
        const display = formatModelDisplay(model);
        expect(display).toContain('Claude 4 Sonnet');
        expect(display).toContain('$');
        expect(display).toContain('context');
      }
    });

    it('should format free model', () => {
      const model = getModelDefinition('local:llama3.1' as ModelId);
      if (model) {
        const display = formatModelDisplay(model);
        expect(display).toContain('Free');
      }
    });
  });

  describe('getModelsGroupedByProvider', () => {
    it('should return models grouped by provider', () => {
      const grouped = getModelsGroupedByProvider();
      expect(grouped.size).toBeGreaterThan(0);

      const anthropicModels = grouped.get('anthropic');
      expect(anthropicModels).toBeDefined();
      expect(anthropicModels?.length).toBeGreaterThan(0);
      expect(anthropicModels?.every(m => m.provider === 'anthropic')).toBe(
        true
      );
    });
  });
});
