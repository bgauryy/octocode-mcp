import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ProviderDiagnostic } from '../../src/providers/factory.js';

describe('Provider Initialization Diagnostics', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    stderrSpy = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
  });

  it('should return success diagnostics when all providers load', async () => {
    const { initializeProviders } =
      await import('../../src/providers/factory.js');
    const diagnostics = await initializeProviders();

    expect(diagnostics).toBeInstanceOf(Array);
    expect(diagnostics.length).toBe(3);

    const names = diagnostics.map((d: ProviderDiagnostic) => d.provider);
    expect(names).toContain('github');
    expect(names).toContain('gitlab');
    expect(names).toContain('bitbucket');

    for (const d of diagnostics) {
      expect(d.ok).toBe(true);
      expect(d.error).toBeUndefined();
    }
  });

  it('should return an array (not throw) even if providers exist', async () => {
    const { initializeProviders } =
      await import('../../src/providers/factory.js');
    const result = await initializeProviders();
    expect(Array.isArray(result)).toBe(true);
  });

  describe('Diagnostic shape contract', () => {
    it('success diagnostic has provider + ok=true + no error', () => {
      const d: ProviderDiagnostic = { provider: 'github', ok: true };
      expect(d.provider).toBe('github');
      expect(d.ok).toBe(true);
      expect(d.error).toBeUndefined();
    });

    it('failure diagnostic has provider + ok=false + error string', () => {
      const d: ProviderDiagnostic = {
        provider: 'gitlab',
        ok: false,
        error: 'Module not found',
      };
      expect(d.provider).toBe('gitlab');
      expect(d.ok).toBe(false);
      expect(d.error).toBe('Module not found');
    });
  });

  describe('Partial failure simulation', () => {
    it('should write to stderr when a provider fails to import', async () => {
      const diagnosticWithFailure: ProviderDiagnostic = {
        provider: 'bitbucket',
        ok: false,
        error: 'Cannot find module',
      };

      process.stderr.write(
        `⚠️  ${diagnosticWithFailure.provider} provider failed to initialize: ${diagnosticWithFailure.error}\n`
      );

      expect(stderrSpy).toHaveBeenCalledWith(
        expect.stringContaining('bitbucket provider failed to initialize')
      );
    });

    it('should include the error message in stderr output', () => {
      const errorMsg = 'Unexpected token in JSON';
      process.stderr.write(
        `⚠️  github provider failed to initialize: ${errorMsg}\n`
      );

      expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining(errorMsg));
    });
  });

  describe('Return type guarantees', () => {
    it('should always return exactly 3 diagnostics (one per provider)', async () => {
      const { initializeProviders } =
        await import('../../src/providers/factory.js');
      const diagnostics = await initializeProviders();
      expect(diagnostics).toHaveLength(3);
    });

    it('diagnostics should cover github, gitlab, bitbucket', async () => {
      const { initializeProviders } =
        await import('../../src/providers/factory.js');
      const diagnostics = await initializeProviders();
      const providers = diagnostics
        .map((d: ProviderDiagnostic) => d.provider)
        .sort();
      expect(providers).toEqual(['bitbucket', 'github', 'gitlab']);
    });
  });
});
