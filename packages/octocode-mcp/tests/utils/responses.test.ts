import { describe, it, expect, vi } from 'vitest';
import {
  createResult,
  toDDMMYYYY,
  simplifyRepoUrl,
  getCommitTitle,
  humanizeBytes,
  simplifyGitHubUrl,
  optimizeTextMatch,
} from '../../src/responses';
import { jsonToYamlString } from 'octocode-utils';

// Mock the isBetaEnabled function
vi.mock('../../src/serverConfig', () => ({
  isBetaEnabled: vi.fn(() => false),
}));

describe('Response Utilities', () => {
  describe('createResult', () => {
    it('should create success result with JSON data', () => {
      const data = { message: 'Hello' };
      const result = createResult({ data });

      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe('text');
      const parsedResponse = JSON.parse(result.content[0]!.text as string);
      expect(parsedResponse).toEqual({
        data: { message: 'Hello' },
        hints: [],
      });
    });

    it('should create error result with string message', () => {
      const errorMessage = 'Something went wrong';
      const result = createResult({
        data: { error: errorMessage },
        isError: true,
      });

      expect(result.isError).toBe(true);
      expect(result.content).toHaveLength(1);
      expect(result.content[0]!.type).toBe('text');
      const parsedResponse = JSON.parse(result.content[0]!.text as string);
      expect(parsedResponse).toEqual({
        data: { error: errorMessage },
        hints: [],
      });
    });

    it('should include suggestions in error result', () => {
      const result = createResult({
        data: { error: 'Not found' },
        isError: true,
      });

      expect(result.isError).toBe(true);
      const parsedResponse = JSON.parse(result.content[0]!.text as string);
      expect(parsedResponse).toEqual({
        data: { error: 'Not found' },
        hints: [],
      });
    });

    it('should handle error object', () => {
      const error = new Error('Test error');
      const result = createResult({
        data: { error: error.message },
        isError: true,
      });

      expect(result.isError).toBe(true);
      const parsedResponse = JSON.parse(result.content[0]!.text as string);
      expect(parsedResponse).toEqual({
        data: { error: 'Test error' },
        hints: [],
      });
    });

    it('should create success result when no error provided', () => {
      const data = { test: 'value' };
      const result = createResult({ data });

      expect(result.isError).toBe(false);
      const parsedResponse = JSON.parse(result.content[0]!.text as string);
      expect(parsedResponse).toEqual({
        data: { test: 'value' },
        hints: [],
      });
    });
  });

  describe('toDDMMYYYY', () => {
    it('should convert ISO timestamp to DD/MM/YYYY format', () => {
      const result = toDDMMYYYY('2023-12-25T10:30:45Z');
      expect(result).toBe('25/12/2023');
    });

    it('should handle different ISO formats', () => {
      expect(toDDMMYYYY('2023-01-01T00:00:00.000Z')).toBe('01/01/2023');
      expect(toDDMMYYYY('2023-06-15T14:30:20Z')).toBe('15/06/2023');
    });

    it('should pad single digit days and months', () => {
      expect(toDDMMYYYY('2023-05-09T12:00:00Z')).toBe('09/05/2023');
      expect(toDDMMYYYY('2023-01-03T12:00:00Z')).toBe('03/01/2023');
    });
  });

  describe('simplifyRepoUrl', () => {
    it('should extract owner/repo from GitHub URL', () => {
      const url = 'https://github.com/facebook/react';
      expect(simplifyRepoUrl(url)).toBe('facebook/react');
    });

    it('should handle GitHub URLs with additional paths', () => {
      const url = 'https://github.com/microsoft/vscode/tree/main/src';
      expect(simplifyRepoUrl(url)).toBe('microsoft/vscode');
    });

    it('should return original URL if no match found', () => {
      const url = 'https://example.com/repo';
      expect(simplifyRepoUrl(url)).toBe(url);
    });

    it('should handle various GitHub URL formats', () => {
      expect(simplifyRepoUrl('https://github.com/owner/repo.git')).toBe(
        'owner/repo.git'
      );
      expect(simplifyRepoUrl('https://github.com/org/project/')).toBe(
        'org/project'
      );
    });
  });

  describe('getCommitTitle', () => {
    it('should extract first line of commit message', () => {
      const message =
        'Fix bug in authentication\n\nThis commit fixes the issue with...';
      expect(getCommitTitle(message)).toBe('Fix bug in authentication');
    });

    it('should handle single line commit messages', () => {
      const message = 'Update README';
      expect(getCommitTitle(message)).toBe('Update README');
    });

    it('should trim whitespace from first line', () => {
      const message = '  Add new feature  \n\nDetailed description';
      expect(getCommitTitle(message)).toBe('Add new feature');
    });

    it('should handle empty commit messages', () => {
      expect(getCommitTitle('')).toBe('');
      expect(getCommitTitle('\n\n')).toBe('');
    });
  });

  describe('humanizeBytes', () => {
    it('should handle zero bytes', () => {
      expect(humanizeBytes(0)).toBe('0 B');
    });

    it('should format bytes correctly', () => {
      expect(humanizeBytes(500)).toBe('500 B');
      expect(humanizeBytes(1023)).toBe('1023 B');
    });

    it('should format kilobytes correctly', () => {
      expect(humanizeBytes(1024)).toBe('1 KB');
      expect(humanizeBytes(2048)).toBe('2 KB');
      expect(humanizeBytes(1536)).toBe('2 KB'); // 1.5KB rounds to 2KB
    });

    it('should format megabytes correctly', () => {
      expect(humanizeBytes(1024 * 1024)).toBe('1 MB');
      expect(humanizeBytes(2 * 1024 * 1024)).toBe('2 MB');
      expect(humanizeBytes(1.5 * 1024 * 1024)).toBe('2 MB'); // rounds to 2MB
    });

    it('should format gigabytes correctly', () => {
      expect(humanizeBytes(1024 * 1024 * 1024)).toBe('1 GB');
      expect(humanizeBytes(2.5 * 1024 * 1024 * 1024)).toBe('3 GB'); // rounds to 3GB
    });
  });

  describe('simplifyGitHubUrl', () => {
    it('should extract file path from GitHub blob URL', () => {
      const url = 'https://github.com/facebook/react/blob/main/src/index.js';
      expect(simplifyGitHubUrl(url)).toBe('src/index.js');
    });

    it('should extract file path from GitHub commit URL', () => {
      const url =
        'https://github.com/facebook/react/commit/abc123/src/components/Button.tsx';
      expect(simplifyGitHubUrl(url)).toBe('src/components/Button.tsx');
    });

    it('should handle nested directory paths', () => {
      const url =
        'https://github.com/microsoft/vscode/blob/main/src/vs/base/common/utils.ts';
      expect(simplifyGitHubUrl(url)).toBe('src/vs/base/common/utils.ts');
    });

    it('should return original URL if no match found', () => {
      const url = 'https://github.com/owner/repo';
      expect(simplifyGitHubUrl(url)).toBe(url);
    });

    it('should handle various GitHub URL formats', () => {
      expect(
        simplifyGitHubUrl(
          'https://github.com/owner/repo/blob/feature-branch/test.js'
        )
      ).toBe('test.js');
      expect(
        simplifyGitHubUrl(
          'https://github.com/owner/repo/commit/hash/deep/nested/file.ts'
        )
      ).toBe('deep/nested/file.ts');
    });
  });

  describe('optimizeTextMatch', () => {
    it('should return short text as-is', () => {
      const text = 'Short text';
      expect(optimizeTextMatch(text)).toBe('Short text');
    });

    it('should normalize whitespace', () => {
      const text = 'Text  with   multiple    spaces';
      expect(optimizeTextMatch(text)).toBe('Text with multiple spaces');
    });

    it('should truncate long text at word boundary', () => {
      const text =
        'This is a very long text that should be truncated at a word boundary to avoid breaking words in the middle';
      const result = optimizeTextMatch(text, 50);

      expect(result.length).toBeLessThanOrEqual(52); // 50 + '…'
      expect(result.endsWith('…')).toBe(true);
      expect(result).not.toContain('  '); // No double spaces
    });

    it('should truncate at character boundary if no good word boundary', () => {
      const text =
        'verylongtextwithoutspacesorwordsthatcanbebrokenatwordboundaries';
      const result = optimizeTextMatch(text, 30);

      expect(result.length).toBe(31); // 30 + '…'
      expect(result.endsWith('…')).toBe(true);
    });

    it('should use default max length of 100', () => {
      const longText = 'A'.repeat(150);
      const result = optimizeTextMatch(longText);

      expect(result.length).toBe(101); // 100 + '…'
      expect(result.endsWith('…')).toBe(true);
    });

    it('should handle text with newlines and tabs', () => {
      const text = 'Text\nwith\ttabs\nand\nnewlines';
      const result = optimizeTextMatch(text);
      expect(result).toBe('Text with tabs and newlines');
    });

    it('should trim leading and trailing whitespace', () => {
      const text = '  \n  Leading and trailing whitespace  \n  ';
      const result = optimizeTextMatch(text);
      expect(result).toBe('Leading and trailing whitespace');
    });
  });

  describe('JSON Cleaning', () => {
    it('should clean response data by removing null, undefined, NaN and empty objects', () => {
      const dirtyData = {
        validString: 'hello',
        validNumber: 42,
        validBoolean: true,
        validArray: [1, 2, 3],
        emptyArray: [],
        nullValue: null,
        undefinedValue: undefined,
        nanValue: NaN,
        emptyObject: {},
        nestedObject: {
          validProp: 'test',
          nullProp: null,
          undefinedProp: undefined,
          nanProp: NaN,
          emptyObjectProp: {},
          nestedArray: [1, null, undefined, NaN, 2],
          deepNested: {
            valid: 'keep',
            invalid: null,
            empty: {},
          },
        },
        arrayWithMixed: [
          'valid',
          null,
          undefined,
          NaN,
          {},
          { valid: 'keep' },
          { empty: null },
        ],
      };

      const result = createResult({ data: dirtyData });
      const parsedResponse = JSON.parse(result.content[0]!.text as string);

      // Verify cleaning worked
      expect(parsedResponse.data).toEqual({
        validString: 'hello',
        validNumber: 42,
        validBoolean: true,
        validArray: [1, 2, 3],
        emptyArray: [], // Empty arrays should be preserved
        nestedObject: {
          validProp: 'test',
          nestedArray: [1, 2], // null, undefined, NaN filtered out
          deepNested: {
            valid: 'keep',
            // invalid and empty properties removed
          },
        },
        arrayWithMixed: [
          'valid',
          { valid: 'keep' },
          // null, undefined, NaN, empty objects filtered out
        ],
      });

      // Verify removed properties
      expect(parsedResponse.data).not.toHaveProperty('nullValue');
      expect(parsedResponse.data).not.toHaveProperty('undefinedValue');
      expect(parsedResponse.data).not.toHaveProperty('nanValue');
      expect(parsedResponse.data).not.toHaveProperty('emptyObject');
      expect(parsedResponse.data.nestedObject).not.toHaveProperty('nullProp');
      expect(parsedResponse.data.nestedObject).not.toHaveProperty(
        'undefinedProp'
      );
      expect(parsedResponse.data.nestedObject).not.toHaveProperty('nanProp');
      expect(parsedResponse.data.nestedObject).not.toHaveProperty(
        'emptyObjectProp'
      );
      expect(parsedResponse.data.nestedObject.deepNested).not.toHaveProperty(
        'invalid'
      );
      expect(parsedResponse.data.nestedObject.deepNested).not.toHaveProperty(
        'empty'
      );
    });

    it('should preserve meaningful empty arrays', () => {
      const data = {
        hints: [],
        results: [],
        validData: 'test',
      };

      const result = createResult({ data, hints: [] });
      const parsedResponse = JSON.parse(result.content[0]!.text as string);

      expect(parsedResponse.data.hints).toEqual([]);
      expect(parsedResponse.data.results).toEqual([]);
      expect(parsedResponse.hints).toEqual([]);
    });

    it('should handle deeply nested structures', () => {
      const data = {
        level1: {
          level2: {
            level3: {
              valid: 'keep',
              invalid: null,
              empty: {},
            },
            emptyLevel3: {},
          },
          emptyLevel2: {},
        },
      };

      const result = createResult({ data });
      const parsedResponse = JSON.parse(result.content[0]!.text as string);

      expect(parsedResponse.data).toEqual({
        level1: {
          level2: {
            level3: {
              valid: 'keep',
            },
          },
        },
      });
    });
  });

  describe('YAML Conversion with Real Octocode Responses', () => {
    describe('GitHub Repository Search Response', () => {
      it('should convert repository search response to YAML with priority keys', () => {
        const repoSearchResponse = {
          data: [
            {
              queryId: 'react_hooks_repos',
              reasoning:
                'Find popular React repositories that demonstrate useState usage patterns',
              repositories: [
                {
                  owner_repo: 'getify/TNG-Hooks',
                  stars: 1010,
                  description:
                    'Provides React-inspired hooks like useState(..) for stand-alone functions',
                  language: 'JavaScript',
                  url: 'https://github.com/getify/TNG-Hooks',
                  forks: 38,
                  updatedAt: '31/08/2025',
                },
                {
                  owner_repo: 'the-road-to-learn-react/use-state-with-callback',
                  stars: 277,
                  description:
                    'Custom hook to include a callback function for useState.',
                  language: 'JavaScript',
                  url: 'https://github.com/the-road-to-learn-react/use-state-with-callback',
                  forks: 37,
                  updatedAt: '18/04/2025',
                },
              ],
              total_count: 2,
            },
          ],
          hints: [
            'Chain tools strategically: start broad with repository search, then structure view, code search, and content fetch for deep analysis',
            'Use github_view_repo_structure first to understand project layout, then target specific files',
          ],
        };

        const yamlResult = jsonToYamlString(repoSearchResponse, {
          keysPriority: ['id', 'name', 'type', 'owner', 'repo', 'path', 'url'],
        });

        const expectedYaml = `data:
  - queryId: "react_hooks_repos"
    reasoning: "Find popular React repositories that demonstrate useState usage patterns"
    repositories:
      - url: "https://github.com/getify/TNG-Hooks"
        description: "Provides React-inspired hooks like useState(..) for stand-alone functions"
        forks: 38
        language: "JavaScript"
        owner_repo: "getify/TNG-Hooks"
        stars: 1010
        updatedAt: "31/08/2025"
      - url: "https://github.com/the-road-to-learn-react/use-state-with-callback"
        description: "Custom hook to include a callback function for useState."
        forks: 37
        language: "JavaScript"
        owner_repo: "the-road-to-learn-react/use-state-with-callback"
        stars: 277
        updatedAt: "18/04/2025"
    total_count: 2
hints:
  - "Chain tools strategically: start broad with repository search, then structure view, code search, and content fetch for deep analysis"
  - "Use github_view_repo_structure first to understand project layout, then target specific files"
`;

        expect(yamlResult).toEqual(expectedYaml);
      });

      it('should handle empty repository search response', () => {
        const emptyResponse = {
          data: [],
          hints: ['No repositories found matching your criteria'],
        };

        const yamlResult = jsonToYamlString(emptyResponse, {
          keysPriority: ['id', 'name', 'type', 'owner', 'repo', 'path', 'url'],
        });

        const expectedYaml = `data: []
hints:
  - "No repositories found matching your criteria"
`;

        expect(yamlResult).toEqual(expectedYaml);
      });
    });

    describe('GitHub Code Search Response', () => {
      it('should convert code search response to YAML with priority keys', () => {
        const codeSearchResponse = {
          data: [
            {
              queryId: 'usestate_examples',
              reasoning:
                'Find diverse code examples showing useState implementation patterns',
              repository: 'yyl134934/react-mini',
              files: [
                {
                  path: 'App.js',
                  text_matches: [
                    'function useState(initial) {\n  const oldHook = wipFiber?.alternate?.hooks?.shift();',
                    'function Counter() {\n  const [targetCount, setTargetCount] = React.useState(1);',
                  ],
                },
                {
                  path: 'static/examples/7.x/auth-flow.js',
                  text_matches: [
                    "function SignInScreen() {\n  const [username, setUsername] = React.useState('');",
                  ],
                },
              ],
              totalCount: 15,
            },
          ],
          hints: [
            'Chain tools strategically: start broad with repository search, then structure view, code search, and content fetch for deep analysis',
            'Use github_fetch_content with matchString from search results for precise context extraction',
          ],
        };

        const yamlResult = jsonToYamlString(codeSearchResponse, {
          keysPriority: ['id', 'name', 'type', 'owner', 'repo', 'path', 'url'],
        });

        const expectedYaml = `data:
  - files:
      - path: "App.js"
        text_matches:
          - "function useState(initial) {\\n  const oldHook = wipFiber?.alternate?.hooks?.shift();"
          - "function Counter() {\\n  const [targetCount, setTargetCount] = React.useState(1);"
      - path: "static/examples/7.x/auth-flow.js"
        text_matches:
          - "function SignInScreen() {\\n  const [username, setUsername] = React.useState('');"
    queryId: "usestate_examples"
    reasoning: "Find diverse code examples showing useState implementation patterns"
    repository: "yyl134934/react-mini"
    totalCount: 15
hints:
  - "Chain tools strategically: start broad with repository search, then structure view, code search, and content fetch for deep analysis"
  - "Use github_fetch_content with matchString from search results for precise context extraction"
`;

        expect(yamlResult).toEqual(expectedYaml);
      });
    });

    describe('GitHub File Content Response', () => {
      it('should convert file content response to YAML with priority keys', () => {
        const fileContentResponse = {
          data: [
            {
              filePath: 'README.md',
              owner: 'getify',
              repo: 'TNG-Hooks',
              content:
                '# TNG-Hooks\n\n[![Build Status](https://travis-ci.org/getify/TNG-Hooks.svg?branch=master)](https://travis-ci.org/getify/TNG-Hooks)',
              totalLines: 811,
              queryId: 'tng_hooks_readme',
              reasoning:
                'Get documentation for TNG-Hooks which provides React-inspired useState for standalone functions',
            },
          ],
          hints: [
            'Rich dataset available - analyze patterns, compare implementations, identify best practices',
            'Compare implementations across 3-5 repositories to identify best practices',
          ],
        };

        const yamlResult = jsonToYamlString(fileContentResponse, {
          keysPriority: ['id', 'name', 'type', 'owner', 'repo', 'path', 'url'],
        });

        const expectedYaml = `data:
  - owner: "getify"
    repo: "TNG-Hooks"
    content: "# TNG-Hooks\\n\\n[![Build Status](https://travis-ci.org/getify/TNG-Hooks.svg?branch=master)](https://travis-ci.org/getify/TNG-Hooks)"
    filePath: "README.md"
    queryId: "tng_hooks_readme"
    reasoning: "Get documentation for TNG-Hooks which provides React-inspired useState for standalone functions"
    totalLines: 811
hints:
  - "Rich dataset available - analyze patterns, compare implementations, identify best practices"
  - "Compare implementations across 3-5 repositories to identify best practices"
`;

        expect(yamlResult).toEqual(expectedYaml);
      });
    });

    describe('Complex Nested Response', () => {
      it('should handle deeply nested structures with priority keys', () => {
        const complexResponse = {
          data: {
            repositories: [
              {
                id: 'repo-123',
                name: 'test-repo',
                owner: 'testuser',
                url: 'https://github.com/testuser/test-repo',
                metadata: {
                  id: 'meta-456',
                  type: 'public',
                  stats: {
                    stars: 100,
                    forks: 25,
                  },
                },
              },
            ],
            pagination: {
              page: 1,
              total: 50,
            },
          },
          hints: ['Use pagination for large result sets'],
        };

        const yamlResult = jsonToYamlString(complexResponse, {
          keysPriority: ['id', 'name', 'type', 'owner', 'repo', 'path', 'url'],
        });

        const expectedYaml = `data:
  pagination:
    page: 1
    total: 50
  repositories:
    - id: "repo-123"
      name: "test-repo"
      owner: "testuser"
      url: "https://github.com/testuser/test-repo"
      metadata:
        id: "meta-456"
        type: "public"
        stats:
          forks: 25
          stars: 100
hints:
  - "Use pagination for large result sets"
`;

        expect(yamlResult).toEqual(expectedYaml);
      });
    });

    describe('Edge Cases', () => {
      it('should handle responses with null and undefined values', () => {
        const responseWithNulls = {
          data: {
            validField: 'test',
            nullField: null,
            undefinedField: undefined,
            emptyObject: {},
            emptyArray: [],
          },
          hints: [],
        };

        const yamlResult = jsonToYamlString(responseWithNulls, {
          keysPriority: ['id', 'name', 'type', 'owner', 'repo', 'path', 'url'],
        });

        const expectedYaml = `data:
  emptyArray: []
  emptyObject: {}
  nullField: null
  validField: "test"
hints: []
`;

        expect(yamlResult).toEqual(expectedYaml);
      });

      it('should handle responses with special characters', () => {
        const responseWithSpecialChars = {
          data: {
            message: 'Hello "world" with \'quotes\' and\nnewlines',
            code: 'const [state, setState] = useState("initial");',
            path: 'src/components/Button.tsx',
          },
          hints: ['Handle special characters properly'],
        };

        const yamlResult = jsonToYamlString(responseWithSpecialChars, {
          keysPriority: ['id', 'name', 'type', 'owner', 'repo', 'path', 'url'],
        });

        const expectedYaml = `data:
  path: "src/components/Button.tsx"
  code: "const [state, setState] = useState(\\"initial\\");"
  message: "Hello \\"world\\" with 'quotes' and\\nnewlines"
hints:
  - "Handle special characters properly"
`;

        expect(yamlResult).toEqual(expectedYaml);
      });

      it('should fallback to JSON if YAML conversion fails', () => {
        // Create an object that might cause YAML conversion issues
        const problematicResponse = {
          data: {
            circular: null as unknown,
          },
          hints: [],
        };

        // Create circular reference
        problematicResponse.data.circular = problematicResponse;

        const result = jsonToYamlString(problematicResponse, {
          keysPriority: ['id', 'name', 'type', 'owner', 'repo', 'path', 'url'],
        });

        // Should fallback to JSON format or error message
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
      });
    });

    describe('Priority Key Ordering', () => {
      it('should respect key priority order in YAML output', () => {
        const testData = {
          zebra: 'last',
          id: 'first',
          apple: 'middle',
          name: 'second',
          type: 'third',
          banana: 'middle2',
        };

        const yamlResult = jsonToYamlString(testData, {
          keysPriority: ['id', 'name', 'type'],
        });

        const lines = yamlResult.split('\n').filter(line => line.trim());

        // Find the positions of priority keys
        const idLine = lines.findIndex(line => line.includes('id:'));
        const nameLine = lines.findIndex(line => line.includes('name:'));
        const typeLine = lines.findIndex(line => line.includes('type:'));

        // Priority keys should appear first and in order
        expect(idLine).toBeLessThan(nameLine);
        expect(nameLine).toBeLessThan(typeLine);

        // Non-priority keys should come after priority keys
        const appleLine = lines.findIndex(line => line.includes('apple:'));
        const bananaLine = lines.findIndex(line => line.includes('banana:'));

        expect(typeLine).toBeLessThan(appleLine);
        expect(typeLine).toBeLessThan(bananaLine);
      });

      it('should handle missing priority keys gracefully', () => {
        const testData = {
          zebra: 'value1',
          apple: 'value2',
          banana: 'value3',
        };

        const yamlResult = jsonToYamlString(testData, {
          keysPriority: ['id', 'name', 'type', 'nonexistent'],
        });

        // Should still produce valid YAML
        expect(yamlResult).not.toMatch(/^\s*{/);
        expect(yamlResult).toContain('apple: "value2"');
        expect(yamlResult).toContain('banana: "value3"');
        expect(yamlResult).toContain('zebra: "value1"');
      });
    });
  });
});
