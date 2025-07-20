import { describe, it, expect } from 'vitest';
import {
  NpmPackageSearchBuilder,
  NpmPackageViewBuilder,
} from '../../../src/mcp/tools/utils/NpmCommandBuilder.js';

describe('NpmCommandBuilder', () => {
  describe('NpmPackageSearchBuilder', () => {
    let builder: NpmPackageSearchBuilder;

    beforeEach(() => {
      builder = new NpmPackageSearchBuilder();
    });

    it('should build basic package search command', () => {
      const result = builder.build({
        query: 'react',
      });

      expect(result).toContain('react');
      expect(result).toContain('--json');
    });

    it('should build package search with exact query', () => {
      const result = builder.build({
        exactQuery: 'react hooks',
      });

      expect(result).toContain('react hooks');
      expect(result).toContain('--json');
    });

    it('should build package search with query terms', () => {
      const result = builder.build({
        queryTerms: ['react', 'typescript', 'components'],
      });

      expect(result).toContain('react typescript components');
      expect(result).toContain('--json');
    });

    it('should build package search with custom search limit', () => {
      const result = builder.build({
        query: 'express',
        searchLimit: 50,
      });

      expect(result).toContain('express');
      expect(result).toContain('--searchlimit=50');
      expect(result).toContain('--json');
    });

    it('should prioritize exactQuery over queryTerms', () => {
      const result = builder.build({
        exactQuery: 'exact search',
        queryTerms: ['should', 'be', 'ignored'],
      });

      expect(result).not.toContain('should be ignored');
    });

    it('should fallback to query if no exactQuery or queryTerms', () => {
      const result = builder.build({
        query: 'fallback query',
      });

      expect(result).toContain('fallback query');
    });

    it('should handle empty parameters gracefully', () => {
      const result = builder.build({});

      expect(result).toContain('--searchlimit=20');
      expect(result).toContain('--json');
      // Should not contain any query terms
      expect(result.filter(arg => !arg.startsWith('--'))).toHaveLength(0);
    });

    it('should handle search limit of 0 (no limit)', () => {
      const result = builder.build({
        query: 'unlimited',
        searchLimit: 0,
      });

      expect(result).toContain('unlimited');
      expect(result).not.toContain('--searchlimit');
    });

    describe('Query handling edge cases', () => {
      it('should handle special characters in query', () => {
        const result = builder.build({
          query: '@types/node',
        });

        expect(result).toContain('@types/node');
      });

      it('should handle scoped package names', () => {
        const result = builder.build({
          exactQuery: '@angular/core',
        });

        expect(result).toContain('@angular/core');
      });

      it('should handle multi-word queries', () => {
        const result = builder.build({
          queryTerms: ['lodash', 'utility', 'functions'],
        });

        expect(result).toContain('lodash utility functions');
      });
    });
  });

  describe('NpmPackageViewBuilder', () => {
    let builder: NpmPackageViewBuilder;

    beforeEach(() => {
      builder = new NpmPackageViewBuilder();
    });

    it('should build basic package view command', () => {
      const result = builder.build({
        packageName: 'react',
      });

      expect(result).toContain('react');
      expect(result).toContain('--json');
    });

    it('should build package view with specific field', () => {
      const result = builder.build({
        packageName: 'express',
        field: 'version',
      });

      expect(result).toContain('express');
      expect(result).toContain('version');
      expect(result).toContain('--json');
    });

    it('should build package view with single match field', () => {
      const result = builder.build({
        packageName: 'lodash',
        match: 'description',
      });

      expect(result).toContain('lodash');
      expect(result).toContain('description');
      expect(result).toContain('--json');
    });

    it('should build package view with multiple match fields', () => {
      const result = builder.build({
        packageName: 'typescript',
        match: ['version', 'description', 'license'],
      });

      expect(result).toContain('typescript');
      expect(result).toContain('version');
      expect(result).toContain('description');
      expect(result).toContain('license');
      expect(result).toContain('--json');
    });

    it('should prioritize field over match', () => {
      const result = builder.build({
        packageName: 'webpack',
        field: 'dependencies',
        match: 'version',
      });

      expect(result).toContain('webpack');
      expect(result).toContain('dependencies');
      expect(result).not.toContain('version');
      expect(result).toContain('--json');
    });

    it('should handle scoped package names', () => {
      const result = builder.build({
        packageName: '@types/react',
      });

      expect(result).toContain('@types/react');
      expect(result).toContain('--json');
    });

    it('should handle package names with versions', () => {
      const result = builder.build({
        packageName: 'react@18.0.0',
      });

      expect(result).toContain('react@18.0.0');
      expect(result).toContain('--json');
    });

    it('should handle empty package name gracefully', () => {
      const result = builder.build({
        packageName: '',
      });

      expect(result).toContain('');
      expect(result).toContain('--json');
    });

    describe('Field handling', () => {
      it('should handle all common npm fields', () => {
        const commonFields = [
          'version',
          'description',
          'license',
          'author',
          'homepage',
          'repository',
          'dependencies',
          'devDependencies',
          'keywords',
          'main',
          'scripts',
          'engines',
          'files',
          'publishConfig',
          'dist-tags',
          'time',
        ];

        commonFields.forEach(field => {
          const result = builder.build({
            packageName: 'test-package',
            field: field,
          });

          expect(result).toContain('test-package');
          expect(result).toContain(field);
          expect(result).toContain('--json');
        });
      });

      it('should handle nested field paths', () => {
        const result = builder.build({
          packageName: 'package',
          field: 'repository.url',
        });

        expect(result).toContain('package');
        expect(result).toContain('repository.url');
        expect(result).toContain('--json');
      });

      it('should handle array fields with brackets', () => {
        const result = builder.build({
          packageName: 'package',
          field: 'contributors[0].name',
        });

        expect(result).toContain('package');
        expect(result).toContain('contributors[0].name');
        expect(result).toContain('--json');
      });
    });

    describe('Match array handling', () => {
      it('should handle empty match array', () => {
        const result = builder.build({
          packageName: 'package',
          match: [],
        });

        expect(result).toContain('package');
        expect(result).toContain('--json');
        // Should not contain any field names
        const nonFlagArgs = result.filter(
          arg => !arg.startsWith('--') && arg !== 'package'
        );
        expect(nonFlagArgs).toHaveLength(0);
      });

      it('should handle single item match array', () => {
        const result = builder.build({
          packageName: 'package',
          match: ['version'],
        });

        expect(result).toContain('package');
        expect(result).toContain('version');
        expect(result).toContain('--json');
      });

      it('should handle large match arrays', () => {
        const manyFields = Array.from({ length: 10 }, (_, i) => `field${i}`);
        const result = builder.build({
          packageName: 'package',
          match: manyFields,
        });

        expect(result).toContain('package');
        manyFields.forEach(field => {
          expect(result).toContain(field);
        });
        expect(result).toContain('--json');
      });
    });
  });

  describe('NPM Common Features', () => {
    it('should always include --json flag across all builders', () => {
      const searchBuilder = new NpmPackageSearchBuilder();
      const viewBuilder = new NpmPackageViewBuilder();

      const searchResult = searchBuilder.build({ query: 'test' });
      const viewResult = viewBuilder.build({ packageName: 'test' });

      expect(searchResult).toContain('--json');
      expect(viewResult).toContain('--json');
    });

    it('should handle npm command type correctly', () => {
      const searchBuilder = new NpmPackageSearchBuilder();
      const viewBuilder = new NpmPackageViewBuilder();

      // Verify the commands are npm-specific
      expect(searchBuilder['commandType']).toBe('npm');
      expect(viewBuilder['commandType']).toBe('npm');
    });

    it('should maintain consistent argument order', () => {
      const searchBuilder = new NpmPackageSearchBuilder();
      const result = searchBuilder.build({
        query: 'test-package',
        searchLimit: 30,
      });

      // Query should be first
      expect(result[0]).toBe('test-package');
      // Flags should come after
      expect(result.slice(1).every(arg => arg.startsWith('--'))).toBe(true);
    });

    describe('Error handling and edge cases', () => {
      it('should handle undefined parameters gracefully', () => {
        const searchBuilder = new NpmPackageSearchBuilder();
        const viewBuilder = new NpmPackageViewBuilder();

        const searchResult = searchBuilder.build({
          query: undefined,
          searchLimit: undefined,
        });

        const viewResult = viewBuilder.build({
          packageName: undefined,
          field: undefined,
          match: undefined,
        });

        // Should not throw and should include basic structure
        expect(searchResult).toContain('--json');
        expect(viewResult).toContain('--json');
      });

      it('should handle null parameters gracefully', () => {
        const searchBuilder = new NpmPackageSearchBuilder();

        const result = searchBuilder.build({
          query: null,
          searchLimit: null,
        });

        expect(result).toContain('--json');
      });

      it('should handle numeric strings in search limit', () => {
        const searchBuilder = new NpmPackageSearchBuilder();

        const result = searchBuilder.build({
          query: 'test',
          searchLimit: '50' as any, // Simulating string input
        });

        expect(result).toContain('--searchlimit=50');
      });
    });
  });
});
