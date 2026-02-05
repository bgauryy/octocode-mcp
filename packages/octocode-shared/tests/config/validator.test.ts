/**
 * Configuration Validator Tests
 */

import { describe, it, expect } from 'vitest';
import { validateConfig } from '../../src/config/validator.js';
import {
  MIN_TIMEOUT,
  MAX_TIMEOUT,
  MIN_RETRIES,
  MAX_RETRIES,
} from '../../src/config/defaults.js';

describe('config/validator', () => {
  describe('validateConfig', () => {
    it('validates empty config as valid', () => {
      const result = validateConfig({});
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('validates complete valid config', () => {
      const result = validateConfig({
        version: 1,
        github: {
          apiUrl: 'https://api.github.com',
        },
        gitlab: {
          host: 'https://gitlab.com',
        },
        local: {
          enabled: true,
          allowedPaths: ['/home/user/projects'],
        },
        tools: {
          enabled: ['githubSearchCode'],
          disabled: ['packageSearch'],
        },
        network: {
          timeout: 30000,
          maxRetries: 3,
        },
        telemetry: {
          logging: true,
        },
        lsp: {
          configPath: '~/.octocode/lsp-servers.json',
          forceMcpLsp: false,
        },
        security: {
          redactErrorPaths: false,
        },
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects non-object config', () => {
      expect(validateConfig('string').valid).toBe(false);
      expect(validateConfig(123).valid).toBe(false);
      expect(validateConfig(null).valid).toBe(false);
      expect(validateConfig([]).valid).toBe(false);
    });

    describe('version validation', () => {
      it('accepts valid version', () => {
        const result = validateConfig({ version: 1 });
        expect(result.valid).toBe(true);
      });

      it('rejects non-integer version', () => {
        const result = validateConfig({ version: 1.5 });
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('version: Must be an integer');
      });

      it('warns about newer version', () => {
        const result = validateConfig({ version: 999 });
        expect(result.valid).toBe(true);
        expect(
          result.warnings.some(w => w.includes('newer than supported'))
        ).toBe(true);
      });
    });

    describe('github validation', () => {
      it('rejects invalid apiUrl', () => {
        const result = validateConfig({
          github: { apiUrl: 'not-a-url' },
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('github.apiUrl'))).toBe(true);
      });

      it('rejects non-http/https URL', () => {
        const result = validateConfig({
          github: { apiUrl: 'ftp://api.github.com' },
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Only http/https'))).toBe(
          true
        );
      });
    });

    describe('local validation', () => {
      it('rejects non-boolean enabled', () => {
        const result = validateConfig({
          local: { enabled: 'yes' },
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('local.enabled'))).toBe(true);
      });

      it('rejects non-array allowedPaths', () => {
        const result = validateConfig({
          local: { allowedPaths: '/path' },
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('local.allowedPaths'))).toBe(
          true
        );
      });
    });

    describe('tools validation', () => {
      it('accepts null enabled/disabled', () => {
        const result = validateConfig({
          tools: { enabled: null, disabled: null },
        });
        expect(result.valid).toBe(true);
      });

      it('rejects non-array enabled', () => {
        const result = validateConfig({
          tools: { enabled: 'githubSearchCode' },
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('tools.enabled'))).toBe(true);
      });
    });

    describe('network validation', () => {
      it('rejects timeout below minimum', () => {
        const result = validateConfig({
          network: { timeout: MIN_TIMEOUT - 1 },
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('network.timeout'))).toBe(
          true
        );
      });

      it('rejects timeout above maximum', () => {
        const result = validateConfig({
          network: { timeout: MAX_TIMEOUT + 1 },
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('network.timeout'))).toBe(
          true
        );
      });

      it('rejects maxRetries below minimum', () => {
        const result = validateConfig({
          network: { maxRetries: MIN_RETRIES - 1 },
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('network.maxRetries'))).toBe(
          true
        );
      });

      it('rejects maxRetries above maximum', () => {
        const result = validateConfig({
          network: { maxRetries: MAX_RETRIES + 1 },
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('network.maxRetries'))).toBe(
          true
        );
      });

      it('rejects non-number timeout', () => {
        const result = validateConfig({
          network: { timeout: '30000' },
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('Must be a number'))).toBe(
          true
        );
      });
    });

    describe('telemetry validation', () => {
      it('rejects non-boolean logging', () => {
        const result = validateConfig({
          telemetry: { logging: 'true' },
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('telemetry.logging'))).toBe(
          true
        );
      });
    });

    describe('lsp validation', () => {
      it('rejects non-string configPath', () => {
        const result = validateConfig({
          lsp: { configPath: 123 },
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('lsp.configPath'))).toBe(
          true
        );
      });

      it('rejects non-boolean forceMcpLsp', () => {
        const result = validateConfig({
          lsp: { forceMcpLsp: 'true' },
        });
        expect(result.valid).toBe(false);
        expect(result.errors.some(e => e.includes('lsp.forceMcpLsp'))).toBe(
          true
        );
      });
    });

    describe('unknown keys', () => {
      it('warns about unknown top-level keys', () => {
        const result = validateConfig({
          version: 1,
          unknownKey: 'value',
        });
        expect(result.valid).toBe(true);
        expect(
          result.warnings.some(w =>
            w.includes('Unknown configuration key: unknownKey')
          )
        ).toBe(true);
      });
    });
  });
});
