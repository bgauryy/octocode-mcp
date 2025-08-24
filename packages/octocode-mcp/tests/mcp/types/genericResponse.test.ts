import { describe, it, expect } from 'vitest';
import {
  BaseToolMeta,
  GenericToolResponse,
  SimpleToolResponse,
} from '../../../src/mcp/types';

describe('Generic Response Types', () => {
  describe('BaseToolMeta', () => {
    it('should have required properties', () => {
      const meta: BaseToolMeta = {
        researchGoal: 'discovery',
        totalOperations: 5,
        successfulOperations: 4,
        failedOperations: 1,
      };

      expect(meta.researchGoal).toBe('discovery');
      expect(meta.totalOperations).toBe(5);
      expect(meta.successfulOperations).toBe(4);
      expect(meta.failedOperations).toBe(1);
      expect(meta.errors).toBeUndefined();
    });

    it('should allow optional errors array', () => {
      const meta: BaseToolMeta = {
        researchGoal: 'analysis',
        totalOperations: 3,
        successfulOperations: 2,
        failedOperations: 1,
        errors: [
          {
            operationId: 'op-1',
            error: 'Network timeout',
            hints: ['Check internet connection', 'Try again later'],
          },
          {
            error: 'Invalid input',
          },
        ],
      };

      expect(meta.errors).toBeDefined();
      expect(meta.errors).toHaveLength(2);
      expect(meta.errors?.[0]?.operationId).toBe('op-1');
      expect(meta.errors?.[0]?.error).toBe('Network timeout');
      expect(meta.errors?.[0]?.hints).toEqual([
        'Check internet connection',
        'Try again later',
      ]);
      expect(meta.errors?.[1]?.operationId).toBeUndefined();
      expect(meta.errors?.[1]?.error).toBe('Invalid input');
      expect(meta.errors?.[1]?.hints).toBeUndefined();
    });
  });

  describe('GenericToolResponse', () => {
    it('should work with default types', () => {
      const response: GenericToolResponse = {
        data: ['item1', 'item2', 'item3'],
        meta: {
          researchGoal: 'discovery',
          totalOperations: 3,
          successfulOperations: 3,
          failedOperations: 0,
        },
        hints: ['Try more specific terms', 'Use filters to narrow results'],
      };

      expect(response.data).toEqual(['item1', 'item2', 'item3']);
      expect(response.meta.researchGoal).toBe('discovery');
      expect(response.meta.totalOperations).toBe(3);
      expect(response.meta.successfulOperations).toBe(3);
      expect(response.meta.failedOperations).toBe(0);
      expect(response.hints).toEqual([
        'Try more specific terms',
        'Use filters to narrow results',
      ]);
    });

    it('should work with custom data type', () => {
      interface CustomData {
        id: string;
        name: string;
        value: number;
      }

      const response: GenericToolResponse<CustomData> = {
        data: [
          { id: '1', name: 'Item 1', value: 100 },
          { id: '2', name: 'Item 2', value: 200 },
        ],
        meta: {
          researchGoal: 'analysis',
          totalOperations: 2,
          successfulOperations: 2,
          failedOperations: 0,
        },
        hints: ['Analyze patterns in the data'],
      };

      expect(response.data).toHaveLength(2);
      expect(response.data?.[0]?.id).toBe('1');
      expect(response.data?.[0]?.name).toBe('Item 1');
      expect(response.data?.[0]?.value).toBe(100);
      expect(response.data?.[1]?.id).toBe('2');
      expect(response.data?.[1]?.name).toBe('Item 2');
      expect(response.data?.[1]?.value).toBe(200);
    });

    it('should work with custom metadata type', () => {
      interface CustomMeta extends BaseToolMeta {
        customField: string;
        additionalInfo: {
          source: string;
          timestamp: string;
        };
      }

      const response: GenericToolResponse<string, CustomMeta> = {
        data: ['result1', 'result2'],
        meta: {
          researchGoal: 'code_generation',
          totalOperations: 2,
          successfulOperations: 2,
          failedOperations: 0,
          customField: 'custom value',
          additionalInfo: {
            source: 'github',
            timestamp: '2024-01-01T00:00:00Z',
          },
        },
        hints: ['Use the generated code as a starting point'],
      };

      expect(response.meta.customField).toBe('custom value');
      expect(response.meta.additionalInfo.source).toBe('github');
      expect(response.meta.additionalInfo.timestamp).toBe(
        '2024-01-01T00:00:00Z'
      );
    });

    it('should work with complex nested types', () => {
      interface ComplexData {
        repository: {
          name: string;
          owner: string;
          url: string;
        };
        files: Array<{
          path: string;
          size: number;
          language?: string;
        }>;
        metadata: {
          totalFiles: number;
          totalSize: number;
          languages: string[];
        };
      }

      interface ComplexMeta extends BaseToolMeta {
        repositoryInfo: {
          stars: number;
          forks: number;
          lastUpdated: string;
        };
        analysisResults: {
          complexity: 'low' | 'medium' | 'high';
          maintainability: number;
          testCoverage?: number;
        };
      }

      const response: GenericToolResponse<ComplexData, ComplexMeta> = {
        data: [
          {
            repository: {
              name: 'test-repo',
              owner: 'test-user',
              url: 'https://github.com/test-user/test-repo',
            },
            files: [
              { path: 'src/index.js', size: 1024, language: 'JavaScript' },
              { path: 'README.md', size: 512 },
            ],
            metadata: {
              totalFiles: 2,
              totalSize: 1536,
              languages: ['JavaScript', 'Markdown'],
            },
          },
        ],
        meta: {
          researchGoal: 'code_analysis',
          totalOperations: 1,
          successfulOperations: 1,
          failedOperations: 0,
          repositoryInfo: {
            stars: 100,
            forks: 25,
            lastUpdated: '2024-01-01T00:00:00Z',
          },
          analysisResults: {
            complexity: 'medium',
            maintainability: 85,
            testCoverage: 75,
          },
        },
        hints: [
          'Consider adding more tests to improve coverage',
          'The codebase has good maintainability',
        ],
      };

      expect(response.data?.[0]?.repository?.name).toBe('test-repo');
      expect(response.data?.[0]?.files).toHaveLength(2);
      expect(response.data?.[0]?.files?.[0]?.language).toBe('JavaScript');
      expect(response.data?.[0]?.files?.[1]?.language).toBeUndefined();
      expect(response.meta?.repositoryInfo?.stars).toBe(100);
      expect(response.meta?.analysisResults?.complexity).toBe('medium');
      expect(response.meta?.analysisResults?.testCoverage).toBe(75);
    });
  });

  describe('SimpleToolResponse', () => {
    it('should work with simple data types', () => {
      const response: SimpleToolResponse<string> = {
        data: ['simple', 'response', 'data'],
        meta: {
          researchGoal: 'discovery',
          totalOperations: 3,
          successfulOperations: 3,
          failedOperations: 0,
        },
        hints: ['Simple hint'],
      };

      expect(response.data).toEqual(['simple', 'response', 'data']);
      expect(response.meta.researchGoal).toBe('discovery');
      expect(response.hints).toEqual(['Simple hint']);
    });

    it('should work with number data', () => {
      const response: SimpleToolResponse<number> = {
        data: [1, 2, 3, 4, 5],
        meta: {
          researchGoal: 'analysis',
          totalOperations: 5,
          successfulOperations: 5,
          failedOperations: 0,
        },
        hints: ['Numbers are sequential'],
      };

      expect(response.data).toEqual([1, 2, 3, 4, 5]);
      expect(response.meta.totalOperations).toBe(5);
    });

    it('should work with boolean data', () => {
      const response: SimpleToolResponse<boolean> = {
        data: [true, false, true],
        meta: {
          researchGoal: 'debugging',
          totalOperations: 3,
          successfulOperations: 3,
          failedOperations: 0,
        },
        hints: ['Check the boolean patterns'],
      };

      expect(response.data).toEqual([true, false, true]);
      expect(response.meta.researchGoal).toBe('debugging');
    });

    it('should work with object data', () => {
      const response: SimpleToolResponse<{ id: number; name: string }> = {
        data: [
          { id: 1, name: 'First' },
          { id: 2, name: 'Second' },
        ],
        meta: {
          researchGoal: 'context_generation',
          totalOperations: 2,
          successfulOperations: 2,
          failedOperations: 0,
        },
        hints: ['Objects have sequential IDs'],
      };

      expect(response.data).toHaveLength(2);
      expect(response.data?.[0]?.id).toBe(1);
      expect(response.data?.[0]?.name).toBe('First');
      expect(response.data?.[1]?.id).toBe(2);
      expect(response.data?.[1]?.name).toBe('Second');
    });
  });

  describe('Type Compatibility', () => {
    it('should allow SimpleToolResponse to be assigned to GenericToolResponse', () => {
      const simpleResponse: SimpleToolResponse<string> = {
        data: ['test'],
        meta: {
          researchGoal: 'discovery',
          totalOperations: 1,
          successfulOperations: 1,
          failedOperations: 0,
        },
        hints: ['test hint'],
      };

      // This should be type-compatible
      const genericResponse: GenericToolResponse<string> = simpleResponse;

      expect(genericResponse.data).toEqual(['test']);
      expect(genericResponse.meta.researchGoal).toBe('discovery');
      expect(genericResponse.hints).toEqual(['test hint']);
    });

    it('should enforce type constraints on metadata extension', () => {
      // This should work - extending BaseToolMeta
      interface ValidMeta extends BaseToolMeta {
        extraField: string;
      }

      const validResponse: GenericToolResponse<string, ValidMeta> = {
        data: ['test'],
        meta: {
          researchGoal: 'discovery',
          totalOperations: 1,
          successfulOperations: 1,
          failedOperations: 0,
          extraField: 'extra value',
        },
        hints: ['test'],
      };

      expect(validResponse.meta.extraField).toBe('extra value');
    });
  });
});
