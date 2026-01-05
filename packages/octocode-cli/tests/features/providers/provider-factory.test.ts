/**
 * Tests for Provider Factory
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execSync } from 'node:child_process';
import {
  getProviderApiKey,
  isProviderConfigured,
  getProviderStatuses,
  getConfiguredProviders,
  detectDefaultModelId,
} from '../../../src/features/providers/provider-factory.js';

// Mock execSync to prevent keychain checks from interfering with tests
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

describe('Provider Factory', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
    // Mock execSync to throw (simulating no keychain access)
    // This ensures tests only check environment variables
    vi.mocked(execSync).mockImplementation(() => {
      throw new Error('Keychain access failed');
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  describe('getProviderApiKey', () => {
    it('should return API key from environment', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key-123';
      const key = getProviderApiKey('anthropic');
      expect(key).toBe('test-key-123');
    });

    it('should return null when no API key is set', () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.CLAUDE_API_KEY;
      const key = getProviderApiKey('anthropic');
      expect(key).toBeNull();
    });

    it('should check multiple environment variables', () => {
      delete process.env.ANTHROPIC_API_KEY;
      process.env.CLAUDE_API_KEY = 'claude-key-456';
      const key = getProviderApiKey('anthropic');
      expect(key).toBe('claude-key-456');
    });

    it('should work for different providers', () => {
      process.env.OPENAI_API_KEY = 'openai-key';
      expect(getProviderApiKey('openai')).toBe('openai-key');

      process.env.GEMINI_API_KEY = 'gemini-key';
      expect(getProviderApiKey('google')).toBe('gemini-key');

      process.env.GROQ_API_KEY = 'groq-key';
      expect(getProviderApiKey('groq')).toBe('groq-key');
    });
  });

  describe('isProviderConfigured', () => {
    it('should return true when API key is set', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      expect(isProviderConfigured('anthropic')).toBe(true);
    });

    it('should return false when API key is not set', () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.CLAUDE_API_KEY;
      expect(isProviderConfigured('anthropic')).toBe(false);
    });

    it('should always return true for local provider', () => {
      // Local is always available
      expect(isProviderConfigured('local')).toBe(true);
    });
  });

  describe('getProviderStatuses', () => {
    it('should return status for all providers', () => {
      const statuses = getProviderStatuses();
      expect(statuses.length).toBeGreaterThan(0);

      // Check structure
      for (const status of statuses) {
        expect(status.provider).toBeDefined();
        expect(typeof status.configured).toBe('boolean');
        expect(status.displayName).toBeDefined();
      }
    });

    it('should reflect configured state from environment', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      delete process.env.OPENAI_API_KEY;

      const statuses = getProviderStatuses();
      const anthropic = statuses.find(s => s.provider === 'anthropic');
      const openai = statuses.find(s => s.provider === 'openai');

      expect(anthropic?.configured).toBe(true);
      expect(anthropic?.envVar).toBe('ANTHROPIC_API_KEY');
      expect(openai?.configured).toBe(false);
    });
  });

  describe('getConfiguredProviders', () => {
    it('should return only configured providers', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      process.env.OPENAI_API_KEY = 'openai-key';
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      delete process.env.GROQ_API_KEY;

      const configured = getConfiguredProviders();
      expect(configured.includes('anthropic')).toBe(true);
      expect(configured.includes('openai')).toBe(true);
      expect(configured.includes('local')).toBe(true); // Always configured
    });
  });

  describe('detectDefaultModelId', () => {
    it('should detect default model based on configured providers', () => {
      process.env.ANTHROPIC_API_KEY = 'test-key';
      const modelId = detectDefaultModelId();
      expect(modelId).toBe('anthropic:claude-4-sonnet');
    });

    it('should prefer anthropic over other providers', () => {
      process.env.ANTHROPIC_API_KEY = 'anthropic-key';
      process.env.OPENAI_API_KEY = 'openai-key';
      const modelId = detectDefaultModelId();
      expect(modelId?.startsWith('anthropic:')).toBe(true);
    });

    it('should fall back to openai if anthropic not configured', () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.CLAUDE_API_KEY;
      process.env.OPENAI_API_KEY = 'openai-key';
      const modelId = detectDefaultModelId();
      expect(modelId?.startsWith('openai:')).toBe(true);
    });

    it('should fall back to local if nothing else configured', () => {
      // Clear all provider keys
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.CLAUDE_API_KEY;
      delete process.env.OPENAI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      delete process.env.GEMINI_API_KEY;
      delete process.env.GROQ_API_KEY;

      const modelId = detectDefaultModelId();
      // Local is always available
      expect(modelId?.startsWith('local:')).toBe(true);
    });
  });
});
