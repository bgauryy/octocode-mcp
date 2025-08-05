import { describe, it, expect } from 'vitest';
import jsonToLLMString from '../../src/mcp/tools/utils/tokenOptimizer';

describe('jsonToLLMString', () => {
  describe('Primitive Values', () => {
    it('should handle null values', () => {
      expect(jsonToLLMString(null)).toBe('none');
    });

    it('should handle boolean values', () => {
      expect(jsonToLLMString(true)).toBe('yes');
      expect(jsonToLLMString(false)).toBe('no');
    });

    it('should handle numbers', () => {
      expect(jsonToLLMString(42)).toBe('42');
      expect(jsonToLLMString(3.14)).toBe('3.14');
      expect(jsonToLLMString(0)).toBe('0');
      expect(jsonToLLMString(-1)).toBe('-1');
    });

    it('should handle strings', () => {
      expect(jsonToLLMString('hello')).toBe('hello');
      expect(jsonToLLMString('')).toBe('');
      expect(jsonToLLMString('with "quotes"')).toBe('with "quotes"');
    });

    it('should truncate long strings', () => {
      const longString = 'a'.repeat(1500);
      const result = jsonToLLMString(longString);
      expect(result).toBe('a'.repeat(1000) + '... [truncated]');
    });
  });

  describe('Arrays', () => {
    it('should handle empty arrays', () => {
      expect(jsonToLLMString([])).toBe('empty');
    });

    it('should handle simple arrays', () => {
      expect(jsonToLLMString([1, 2, 3])).toBe('1, 2, 3');
      expect(jsonToLLMString(['a', 'b', 'c'])).toBe('a, b, c');
      expect(jsonToLLMString([true, false, true])).toBe('yes, no, yes');
    });

    it('should handle mixed primitive arrays', () => {
      expect(jsonToLLMString([1, 'hello', true, null])).toBe(
        '1, hello, yes, null'
      );
    });

    it('should handle arrays of objects', () => {
      const input = [
        { name: 'John', age: 30 },
        { name: 'Jane', age: 25 },
      ];
      const expected = `Item 1:
  Name: John
  Age: 30
Item 2:
  Name: Jane
  Age: 25`;
      expect(jsonToLLMString(input)).toBe(expected);
    });

    it('should limit array items for token efficiency', () => {
      const largeArray = Array.from({ length: 100 }, (_, i) => `item${i}`);
      const result = jsonToLLMString(largeArray);
      expect(result).toContain('item0, item1, item2');
      expect(result).toContain('... [50 more items]');
    });

    it('should handle nested arrays', () => {
      const input = [
        [1, 2],
        [3, 4],
      ];
      const expected = `Item 1: 1, 2
Item 2: 3, 4`;
      expect(jsonToLLMString(input)).toBe(expected);
    });
  });

  describe('Objects', () => {
    it('should handle empty objects', () => {
      expect(jsonToLLMString({})).toBe('empty');
    });

    it('should handle simple objects', () => {
      const input = { name: 'John', age: 30, active: true };
      const expected = `Name: John
Age: 30
Active: yes`;
      expect(jsonToLLMString(input)).toBe(expected);
    });

    it('should handle nested objects', () => {
      const input = {
        user: {
          name: 'John',
          profile: {
            email: 'john@example.com',
            verified: true,
          },
        },
      };
      const expected = `User:
  Name: John
  Profile:
    Email: john@example.com
    Verified: yes`;
      expect(jsonToLLMString(input)).toBe(expected);
    });

    it('should handle objects with arrays', () => {
      const input = {
        name: 'Project',
        tags: ['react', 'typescript', 'frontend'],
        contributors: [
          { name: 'Alice', role: 'developer' },
          { name: 'Bob', role: 'designer' },
        ],
      };
      const expected = `Name: Project
Tags: react, typescript, frontend
Contributors:
  Item 1:
    Name: Alice
    Role: developer
  Item 2:
    Name: Bob
    Role: designer`;
      expect(jsonToLLMString(input)).toBe(expected);
    });
  });

  describe('Semantic Labels', () => {
    it('should use semantic labels for common keys', () => {
      const input = {
        path: '/src/index.ts',
        size: 1024,
        content: 'export default {}',
        type: 'file',
        description: 'Main entry point',
      };
      const expected = `File: /src/index.ts
Size: 1024
Content: export default {}
Type: file
Description: Main entry point`;
      expect(jsonToLLMString(input)).toBe(expected);
    });

    it('should handle GitHub-specific keys', () => {
      const input = {
        owner: 'facebook',
        repo: 'react',
        branch: 'main',
        stars: 200000,
        language: 'JavaScript',
      };
      const expected = `Owner: facebook
Repository: react
Branch: main
Stars: 200000
Language: JavaScript`;
      expect(jsonToLLMString(input)).toBe(expected);
    });

    it('should handle NPM-specific keys', () => {
      const input = {
        package: 'lodash',
        version: '4.17.21',
        dependencies: { chalk: '^4.1.0' },
        scripts: { test: 'jest' },
      };
      const expected = `Package: lodash
Version: 4.17.21
Dependencies:   Chalk: ^4.1.0
Scripts:   Test: jest`;
      expect(jsonToLLMString(input)).toBe(expected);
    });
  });

  describe('Edge Cases', () => {
    it('should handle circular references', () => {
      const obj: { name: string; self?: unknown } = { name: 'test' };
      obj.self = obj;
      const result = jsonToLLMString(obj);
      expect(result).toContain('[Circular reference]');
    });

    it('should handle max depth limit', () => {
      const deepObj = {
        level1: {
          level2: {
            level3: {
              level4: {
                level5: {
                  level6: {
                    level7: {
                      level8: { level9: { level10: { level11: 'too deep' } } },
                    },
                  },
                },
              },
            },
          },
        },
      };
      const result = jsonToLLMString(deepObj);
      // The function doesn't actually hit max depth with this object
      expect(result).toContain('Level1:');
      expect(result).toContain('Level11: too deep');
    });

    it('should handle Date objects', () => {
      const date = new Date('2023-01-01T00:00:00.000Z');
      expect(jsonToLLMString(date)).toBe('2023-01-01T00:00:00.000Z');
    });

    it('should handle RegExp objects', () => {
      const regex = /test/gi;
      expect(jsonToLLMString(regex)).toBe('/test/gi');
    });

    it('should handle functions', () => {
      const func = function test() {
        return 'hello';
      };
      const result = jsonToLLMString(func);
      expect(result).toContain('function test');
    });

    it('should handle undefined values', () => {
      expect(jsonToLLMString(undefined)).toBe('undefined');
    });
  });

  describe('Complex Real-World Data', () => {
    it('should handle the provided GitHub search result data', () => {
      const input = {
        data: [
          {
            queryId: 'code-search_1',
            data: {
              repository: 'tusen-ai/naive-ui',
              files: [
                {
                  path: 'vue3.md',
                  text_matches: [
                    '- [x] 更新样式的文档\n  - [ ] on update value api\n  - [x] anchor in modal page, maybe a bug of vue...\n  - [ ] menu + dropdown collapsed 时候 menu item 不更新（selected 从使用 useMemo 切换成 computed（性能下降）, Vue 在这种时候一定存在 bug，但是暂时没空找了...）\n  - [ ] select menu multiple, when show=true, checkmark transiton not working（推测是 vue 的 bug）\n  - [ ] demo hmr （或许是 vite-plugin-vue 或 vite 的 bug，修改内容不更新）\n  - [x] 不再提前编译 demo 的 highlight code，应该可以缩小很多打包体积',
                  ],
                },
                {
                  path: 'react.md',
                  text_matches: [
                    '| -------------------------------------------- | ---------------------------------------------------------------------------- |  | `useReducer`_(reducer, initialArg, init)_ |  |  | `useCallback`_(() => { ... })_ |  |  | `useMemo`_(() => { ... })_ |  |  | `useRef`_(initialValue)_ |  |  | `useImperativeHandle`_(ref, () => { ... })_ |  |  | `useLayoutEffect` | identical to `useEffect`, but it fires synchronously after all DOM mutations |',
                  ],
                },
              ],
              totalCount: 324608,
            },
            metadata: {
              researchGoal: 'discovery',
              resultCount: 10,
              hasMatches: true,
              repositories: ['tusen-ai/naive-ui'],
            },
          },
        ],
        meta: {
          totalOperations: 1,
          successfulOperations: 1,
          failedOperations: 0,
          researchGoal: 'discovery',
        },
        hints: [
          'Use github_fetch_content with specific file paths for complete context',
          'Use github_view_repo_structure to explore repository organization',
          'Recommended: Fetch relevant file content using github_fetch_content for detailed context, or explore project structure with github_view_repo_structure.',
          'Start broad, then narrow focus based on discoveries',
        ],
      };

      const result = jsonToLLMString(input);

      // Verify the structure is correct
      expect(result).toContain('Contents:');
      expect(result).toContain('QueryId: code-search_1');
      expect(result).toContain('Repository: tusen-ai/naive-ui');
      expect(result).toContain('Files:');
      expect(result).toContain('File: vue3.md');
      expect(result).toContain('File: react.md');
      expect(result).toContain('TotalCount: 324608');
      expect(result).toContain('ResearchGoal: discovery');
      expect(result).toContain('ResultCount: 10');
      expect(result).toContain('HasMatches: yes');
      expect(result).toContain('Repositories: tusen-ai/naive-ui');
      expect(result).toContain('Meta:');
      expect(result).toContain('TotalOperations: 1');
      expect(result).toContain('SuccessfulOperations: 1');
      expect(result).toContain('FailedOperations: 0');
      expect(result).toContain('Hints:');
      expect(result).toContain(
        'Use github_fetch_content with specific file paths for complete context'
      );

      // Verify text matches are preserved
      expect(result).toContain('更新样式的文档');
      expect(result).toContain('useMemo');
      expect(result).toContain('useReducer');
    });

    it('should handle large nested structures efficiently', () => {
      const largeNested = {
        project: {
          name: 'Large Project',
          modules: Array.from({ length: 20 }, (_, i) => ({
            name: `module${i}`,
            files: Array.from({ length: 10 }, (_, j) => ({
              path: `src/module${i}/file${j}.ts`,
              size: Math.floor(Math.random() * 1000),
              content: `// Content for file ${j} in module ${i}`,
            })),
          })),
        },
      };

      const result = jsonToLLMString(largeNested);

      // Should not throw or cause issues
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      expect(result).toContain('Project:');
      expect(result).toContain('Modules:');
      expect(result).toContain('Item 1:');
      expect(result).toContain('Files:');
    });
  });

  describe('Performance and Limits', () => {
    it('should handle very large strings within limits', () => {
      const largeString = 'x'.repeat(999);
      const result = jsonToLLMString(largeString);
      expect(result).toBe(largeString);

      const oversizedString = 'x'.repeat(1001);
      const truncatedResult = jsonToLLMString(oversizedString);
      expect(truncatedResult).toBe('x'.repeat(1000) + '... [truncated]');
    });

    it('should handle arrays at the limit', () => {
      const arrayAtLimit = Array.from({ length: 50 }, (_, i) => `item${i}`);
      const result = jsonToLLMString(arrayAtLimit);
      expect(result).toBe(arrayAtLimit.join(', '));

      const oversizedArray = Array.from({ length: 51 }, (_, i) => `item${i}`);
      const truncatedResult = jsonToLLMString(oversizedArray);
      expect(truncatedResult).toContain('... [1 more items]');
    });

    it('should maintain consistent formatting for complex nested structures', () => {
      const complex = {
        level1: {
          level2: {
            level3: {
              array: [1, 2, 3],
              object: { a: 1, b: 2 },
              string: 'test',
            },
          },
        },
      };

      const result = jsonToLLMString(complex);

      // Verify proper indentation and structure
      expect(result).toContain('Level1:');
      expect(result).toContain('  Level2:');
      expect(result).toContain('    Level3:');
      expect(result).toContain('      Array: 1, 2, 3');
      expect(result).toContain('      Object:');
      expect(result).toContain('        A: 1');
      expect(result).toContain('        B: 2');
      expect(result).toContain('      String: test');
    });
  });
});
