import { describe, it, expect } from 'vitest';
import {
  NpmPackage,
  PythonPackage,
  OptimizedNpmPackageResult,
  EnhancedPackageMetadata,
  PythonPackageMetadata,
  NpmPackageQuery,
  PythonPackageQuery,
  PackageSearchBulkParams,
} from '../src/tools/types';

describe('Types', () => {
  describe('NpmPackage', () => {
    it('should have correct structure', () => {
      const npmPackage: NpmPackage = {
        name: 'test-package',
        version: '1.0.0',
        description: 'Test package description',
        keywords: ['test', 'example'],
        repository: 'https://github.com/test/test-package',
        links: {
          repository: 'https://github.com/test/test-package',
        },
      };

      expect(npmPackage.name).toBe('test-package');
      expect(npmPackage.version).toBe('1.0.0');
      expect(npmPackage.description).toBe('Test package description');
      expect(npmPackage.keywords).toEqual(['test', 'example']);
      expect(npmPackage.repository).toBe(
        'https://github.com/test/test-package'
      );
      expect(npmPackage.links?.repository).toBe(
        'https://github.com/test/test-package'
      );
    });

    it('should allow null description and repository', () => {
      const npmPackage: NpmPackage = {
        name: 'test-package',
        version: '1.0.0',
        description: null,
        keywords: [],
        repository: null,
      };

      expect(npmPackage.description).toBeNull();
      expect(npmPackage.repository).toBeNull();
    });
  });

  describe('PythonPackage', () => {
    it('should have correct structure', () => {
      const pythonPackage: PythonPackage = {
        name: 'test-package',
        version: '1.0.0',
        description: 'Test package description',
        keywords: ['test', 'example'],
        repository: 'https://github.com/test/test-package',
      };

      expect(pythonPackage.name).toBe('test-package');
      expect(pythonPackage.version).toBe('1.0.0');
      expect(pythonPackage.description).toBe('Test package description');
      expect(pythonPackage.keywords).toEqual(['test', 'example']);
      expect(pythonPackage.repository).toBe(
        'https://github.com/test/test-package'
      );
    });
  });

  describe('OptimizedNpmPackageResult', () => {
    it('should have correct structure', () => {
      const optimizedPackage: OptimizedNpmPackageResult = {
        name: 'test-package',
        version: '1.0.0',
        description: 'Test package description',
        license: 'MIT',
        repository: 'https://github.com/test/test-package',
        size: '1.2MB',
        created: '2023-01-01',
        updated: '2023-12-01',
        versions: [
          { version: '1.0.0', date: '2023-01-01' },
          { version: '1.1.0', date: '2023-06-01' },
        ],
        stats: {
          total_versions: 2,
          weekly_downloads: 1000,
        },
        exports: {
          main: './index.js',
          types: './index.d.ts',
        },
      };

      expect(optimizedPackage.name).toBe('test-package');
      expect(optimizedPackage.versions).toHaveLength(2);
      expect(optimizedPackage.stats.total_versions).toBe(2);
      expect(optimizedPackage.exports?.main).toBe('./index.js');
    });
  });

  describe('EnhancedPackageMetadata', () => {
    it('should have correct structure with NPM package', () => {
      const npmPackage: OptimizedNpmPackageResult = {
        name: 'test-package',
        version: '1.0.0',
        description: 'Test package description',
        license: 'MIT',
        repository: 'https://github.com/test/test-package',
        size: '1.2MB',
        created: '2023-01-01',
        updated: '2023-12-01',
        versions: [],
        stats: { total_versions: 1 },
      };

      const enhancedMetadata: EnhancedPackageMetadata = {
        gitURL: 'https://github.com/test/test-package',
        metadata: npmPackage,
      };

      expect(enhancedMetadata.gitURL).toBe(
        'https://github.com/test/test-package'
      );
      expect(enhancedMetadata.metadata).toBe(npmPackage);
    });

    it('should have correct structure with Python package', () => {
      const pythonPackage: PythonPackageMetadata = {
        name: 'test-package',
        version: '1.0.0',
        description: 'Test package description',
        keywords: ['test'],
        repository: 'https://github.com/test/test-package',
        homepage: 'https://test-package.com',
        author: 'Test Author',
        license: 'MIT',
      };

      const enhancedMetadata: EnhancedPackageMetadata = {
        gitURL: 'https://github.com/test/test-package',
        metadata: pythonPackage,
      };

      expect(enhancedMetadata.gitURL).toBe(
        'https://github.com/test/test-package'
      );
      expect(enhancedMetadata.metadata).toBe(pythonPackage);
    });
  });

  describe('PythonPackageMetadata', () => {
    it('should have correct structure', () => {
      const pythonMetadata: PythonPackageMetadata = {
        name: 'test-package',
        version: '1.0.0',
        description: 'Test package description',
        keywords: ['test', 'example'],
        repository: 'https://github.com/test/test-package',
        homepage: 'https://test-package.com',
        author: 'Test Author',
        license: 'MIT',
      };

      expect(pythonMetadata.name).toBe('test-package');
      expect(pythonMetadata.homepage).toBe('https://test-package.com');
      expect(pythonMetadata.author).toBe('Test Author');
      expect(pythonMetadata.license).toBe('MIT');
    });
  });

  describe('NpmPackageQuery', () => {
    it('should have correct structure', () => {
      const npmQuery: NpmPackageQuery = {
        name: 'test-package',
        searchLimit: 10,
        npmSearchStrategy: 'individual',
        npmFetchMetadata: true,
        npmField: 'version',
        npmMatch: ['version', 'description'],
        id: 'query-1',
      };

      expect(npmQuery.name).toBe('test-package');
      expect(npmQuery.searchLimit).toBe(10);
      expect(npmQuery.npmSearchStrategy).toBe('individual');
      expect(npmQuery.npmFetchMetadata).toBe(true);
      expect(npmQuery.npmField).toBe('version');
      expect(npmQuery.npmMatch).toEqual(['version', 'description']);
      expect(npmQuery.id).toBe('query-1');
    });

    it('should allow minimal structure', () => {
      const npmQuery: NpmPackageQuery = {
        name: 'test-package',
      };

      expect(npmQuery.name).toBe('test-package');
      expect(npmQuery.searchLimit).toBeUndefined();
    });
  });

  describe('PythonPackageQuery', () => {
    it('should have correct structure', () => {
      const pythonQuery: PythonPackageQuery = {
        name: 'test-package',
        searchLimit: 5,
        id: 'query-1',
      };

      expect(pythonQuery.name).toBe('test-package');
      expect(pythonQuery.searchLimit).toBe(5);
      expect(pythonQuery.id).toBe('query-1');
    });
  });

  describe('PackageSearchBulkParams', () => {
    it('should have correct structure', () => {
      const bulkParams: PackageSearchBulkParams = {
        npmPackages: [
          { name: 'npm-package-1' },
          { name: 'npm-package-2', searchLimit: 10 },
        ],
        pythonPackages: [
          { name: 'python-package-1' },
          { name: 'python-package-2', searchLimit: 5 },
        ],
        searchLimit: 20,
        npmSearchStrategy: 'combined',
        npmFetchMetadata: true,
      };

      expect(bulkParams.npmPackages).toHaveLength(2);
      expect(bulkParams.pythonPackages).toHaveLength(2);
      expect(bulkParams.searchLimit).toBe(20);
      expect(bulkParams.npmSearchStrategy).toBe('combined');
      expect(bulkParams.npmFetchMetadata).toBe(true);
    });

    it('should allow minimal structure', () => {
      const bulkParams: PackageSearchBulkParams = {
        npmPackages: [{ name: 'test-package' }],
      };

      expect(bulkParams.npmPackages).toHaveLength(1);
      expect(bulkParams.pythonPackages).toBeUndefined();
    });
  });
});
