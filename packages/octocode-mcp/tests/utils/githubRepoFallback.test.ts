import { describe, it, expect } from 'vitest';
import { tryInferRepoUrl } from '../../src/utils/githubRepoFallback.js';
import type { NpmPackageResult } from '../../src/utils/package.js';

// Helper to create a valid NpmPackageResult with optional overrides
function createNpmResult(
  overrides: Partial<NpmPackageResult> = {}
): NpmPackageResult {
  return {
    repoUrl: null,
    path: 'node_modules/test-package',
    version: '1.0.0',
    mainEntry: 'index.js',
    typeDefinitions: null,
    ...overrides,
  };
}

describe('githubRepoFallback', () => {
  describe('tryInferRepoUrl', () => {
    it('should return unchanged result if repoUrl already exists', () => {
      const existing = createNpmResult({
        repoUrl: 'https://github.com/existing/repo',
      });

      const result = tryInferRepoUrl('test-package', existing);

      expect(result).toEqual(existing);
      expect(result.repoUrl).toBe('https://github.com/existing/repo');
    });

    it('should return known package mapping for @wix/design-system', () => {
      const existing = createNpmResult();

      const result = tryInferRepoUrl('@wix/design-system', existing);

      expect(result.repoUrl).toBe(
        'https://github.com/wix-private/wix-design-systems'
      );
    });

    it('should return known package mapping for @types/node', () => {
      const existing = createNpmResult({ version: '20.0.0' });

      const result = tryInferRepoUrl('@types/node', existing);

      expect(result.repoUrl).toBe(
        'https://github.com/DefinitelyTyped/DefinitelyTyped'
      );
    });

    it('should return known package mapping for @modelcontextprotocol/sdk', () => {
      const existing = createNpmResult();

      const result = tryInferRepoUrl('@modelcontextprotocol/sdk', existing);

      expect(result.repoUrl).toBe(
        'https://github.com/modelcontextprotocol/typescript-sdk'
      );
    });

    it('should infer repo URL for scoped packages with known org', () => {
      const existing = createNpmResult({ version: '7.0.0' });

      const result = tryInferRepoUrl('@babel/core', existing);

      expect(result.repoUrl).toBe('https://github.com/babel/core');
    });

    it('should infer repo URL for @angular scoped packages', () => {
      const existing = createNpmResult({ version: '16.0.0' });

      const result = tryInferRepoUrl('@angular/core', existing);

      expect(result.repoUrl).toBe('https://github.com/angular/core');
    });

    it('should infer repo URL for @vue scoped packages', () => {
      const existing = createNpmResult({ version: '3.0.0' });

      const result = tryInferRepoUrl('@vue/reactivity', existing);

      expect(result.repoUrl).toBe('https://github.com/vuejs/reactivity');
    });

    it('should infer DefinitelyTyped URL for @types packages', () => {
      const existing = createNpmResult({ version: '18.0.0' });

      const result = tryInferRepoUrl('@types/react', existing);

      expect(result.repoUrl).toBe(
        'https://github.com/DefinitelyTyped/DefinitelyTyped'
      );
    });

    it('should return unchanged for non-scoped packages', () => {
      const existing = createNpmResult({ version: '4.0.0' });

      const result = tryInferRepoUrl('lodash', existing);

      expect(result.repoUrl).toBeNull();
    });

    it('should return unchanged for unknown scopes', () => {
      const existing = createNpmResult();

      const result = tryInferRepoUrl('@unknown-scope/package', existing);

      expect(result.repoUrl).toBeNull();
    });

    it('should return unchanged for malformed scoped package names', () => {
      const existing = createNpmResult();

      const result = tryInferRepoUrl('@babel', existing);

      expect(result.repoUrl).toBeNull();
    });

    it('should return unchanged for package with too many slashes', () => {
      const existing = createNpmResult();

      const result = tryInferRepoUrl('@babel/core/extra', existing);

      expect(result.repoUrl).toBeNull();
    });

    it('should return unchanged for empty scope after @ prefix', () => {
      const existing = createNpmResult();

      const result = tryInferRepoUrl('@/package', existing);

      expect(result.repoUrl).toBeNull();
    });

    it('should return unchanged for empty package name', () => {
      const existing = createNpmResult();

      const result = tryInferRepoUrl('@babel/', existing);

      expect(result.repoUrl).toBeNull();
    });

    it('should handle @vercel scoped packages', () => {
      const existing = createNpmResult();

      const result = tryInferRepoUrl('@vercel/analytics', existing);

      expect(result.repoUrl).toBe('https://github.com/vercel/analytics');
    });

    it('should handle @prisma scoped packages', () => {
      const existing = createNpmResult({ version: '5.0.0' });

      const result = tryInferRepoUrl('@prisma/client', existing);

      expect(result.repoUrl).toBe('https://github.com/prisma/client');
    });

    it('should handle @trpc scoped packages', () => {
      const existing = createNpmResult({ version: '10.0.0' });

      const result = tryInferRepoUrl('@trpc/server', existing);

      expect(result.repoUrl).toBe('https://github.com/trpc/server');
    });
  });
});
