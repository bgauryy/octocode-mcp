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

      const yaml = result.content[0]!.text as string;
      // Empty hints array is removed
      const expectedYaml = `data:\n  message: "Hello"\n`;

      expect(yaml).toEqual(expectedYaml);

      expect(result).toEqual({
        isError: false,
        content: [
          {
            type: 'text',
            text: expectedYaml,
          },
        ],
      });
    });

    it('should create error result with string message', () => {
      const errorMessage = 'Something went wrong';
      const result = createResult({
        data: { error: errorMessage },
        isError: true,
      });

      const yaml = result.content[0]!.text as string;
      // Empty hints array is removed
      const expectedYaml = `data:\n  error: "Something went wrong"\n`;

      expect(yaml).toEqual(expectedYaml);

      expect(result).toEqual({
        isError: true,
        content: [
          {
            type: 'text',
            text: expectedYaml,
          },
        ],
      });
    });

    it('should include suggestions in error result', () => {
      const result = createResult({
        data: { error: 'Not found' },
        isError: true,
      });

      const yaml = result.content[0]!.text as string;
      // Empty hints array is removed
      const expectedYaml = `data:\n  error: "Not found"\n`;

      expect(yaml).toEqual(expectedYaml);

      expect(result).toEqual({
        isError: true,
        content: [
          {
            type: 'text',
            text: expectedYaml,
          },
        ],
      });
    });

    it('should handle error object', () => {
      const error = new Error('Test error');
      const result = createResult({
        data: { error: error.message },
        isError: true,
      });

      const yaml = result.content[0]!.text as string;
      // Empty hints array is removed
      const expectedYaml = `data:\n  error: "Test error"\n`;

      expect(yaml).toEqual(expectedYaml);

      expect(result).toEqual({
        isError: true,
        content: [
          {
            type: 'text',
            text: expectedYaml,
          },
        ],
      });
    });

    it('should create success result when no error provided', () => {
      const data = { test: 'value' };
      const result = createResult({ data });

      const yaml = result.content[0]!.text as string;
      // Empty hints array is removed
      const expectedYaml = `data:\n  test: "value"\n`;
      expect(yaml).toEqual(expectedYaml);

      expect(result).toEqual({
        isError: false,
        content: [
          {
            type: 'text',
            text: expectedYaml,
          },
        ],
      });
    });
  });

  describe('toDDMMYYYY', () => {
    it('should convert ISO timestamp to DD/MM/YYYY format', () => {
      const result = toDDMMYYYY('2023-12-25T10:30:45Z');
      expect(result).toEqual('25/12/2023');
    });

    it('should handle different ISO formats', () => {
      expect(toDDMMYYYY('2023-01-01T00:00:00.000Z')).toEqual('01/01/2023');
      expect(toDDMMYYYY('2023-06-15T14:30:20Z')).toEqual('15/06/2023');
    });

    it('should pad single digit days and months', () => {
      expect(toDDMMYYYY('2023-05-09T12:00:00Z')).toEqual('09/05/2023');
      expect(toDDMMYYYY('2023-01-03T12:00:00Z')).toEqual('03/01/2023');
    });
  });

  describe('simplifyRepoUrl', () => {
    it('should extract owner/repo from GitHub URL', () => {
      const url = 'https://github.com/facebook/react';
      expect(simplifyRepoUrl(url)).toEqual('facebook/react');
    });

    it('should handle GitHub URLs with additional paths', () => {
      const url = 'https://github.com/microsoft/vscode/tree/main/src';
      expect(simplifyRepoUrl(url)).toEqual('microsoft/vscode');
    });

    it('should return original URL if no match found', () => {
      const url = 'https://example.com/repo';
      expect(simplifyRepoUrl(url)).toEqual(url);
    });

    it('should handle various GitHub URL formats', () => {
      expect(simplifyRepoUrl('https://github.com/owner/repo.git')).toEqual(
        'owner/repo.git'
      );
      expect(simplifyRepoUrl('https://github.com/org/project/')).toEqual(
        'org/project'
      );
    });
  });

  describe('getCommitTitle', () => {
    it('should extract first line of commit message', () => {
      const message =
        'Fix bug in authentication\n\nThis commit fixes the issue with...';
      expect(getCommitTitle(message)).toEqual('Fix bug in authentication');
    });

    it('should handle single line commit messages', () => {
      const message = 'Update README';
      expect(getCommitTitle(message)).toEqual('Update README');
    });

    it('should trim whitespace from first line', () => {
      const message = '  Add new feature  \n\nDetailed description';
      expect(getCommitTitle(message)).toEqual('Add new feature');
    });

    it('should handle empty commit messages', () => {
      expect(getCommitTitle('')).toEqual('');
      expect(getCommitTitle('\n\n')).toEqual('');
    });
  });

  describe('humanizeBytes', () => {
    it('should handle zero bytes', () => {
      expect(humanizeBytes(0)).toEqual('0 B');
    });

    it('should format bytes correctly', () => {
      expect(humanizeBytes(500)).toEqual('500 B');
      expect(humanizeBytes(1023)).toEqual('1023 B');
    });

    it('should format kilobytes correctly', () => {
      expect(humanizeBytes(1024)).toEqual('1 KB');
      expect(humanizeBytes(2048)).toEqual('2 KB');
      expect(humanizeBytes(1536)).toEqual('2 KB'); // 1.5KB rounds to 2KB
    });

    it('should format megabytes correctly', () => {
      expect(humanizeBytes(1024 * 1024)).toEqual('1 MB');
      expect(humanizeBytes(2 * 1024 * 1024)).toEqual('2 MB');
      expect(humanizeBytes(1.5 * 1024 * 1024)).toEqual('2 MB'); // rounds to 2MB
    });

    it('should format gigabytes correctly', () => {
      expect(humanizeBytes(1024 * 1024 * 1024)).toEqual('1 GB');
      expect(humanizeBytes(2.5 * 1024 * 1024 * 1024)).toEqual('3 GB'); // rounds to 3GB
    });
  });

  describe('simplifyGitHubUrl', () => {
    it('should extract file path from GitHub blob URL', () => {
      const url = 'https://github.com/facebook/react/blob/main/src/index.js';
      expect(simplifyGitHubUrl(url)).toEqual('src/index.js');
    });

    it('should extract file path from GitHub commit URL', () => {
      const url =
        'https://github.com/facebook/react/commit/abc123/src/components/Button.tsx';
      expect(simplifyGitHubUrl(url)).toEqual('src/components/Button.tsx');
    });

    it('should handle nested directory paths', () => {
      const url =
        'https://github.com/microsoft/vscode/blob/main/src/vs/base/common/utils.ts';
      expect(simplifyGitHubUrl(url)).toEqual('src/vs/base/common/utils.ts');
    });

    it('should return original URL if no match found', () => {
      const url = 'https://github.com/owner/repo';
      expect(simplifyGitHubUrl(url)).toEqual(url);
    });

    it('should handle various GitHub URL formats', () => {
      expect(
        simplifyGitHubUrl(
          'https://github.com/owner/repo/blob/feature-branch/test.js'
        )
      ).toEqual('test.js');
      expect(
        simplifyGitHubUrl(
          'https://github.com/owner/repo/commit/hash/deep/nested/file.ts'
        )
      ).toEqual('deep/nested/file.ts');
    });
  });

  describe('optimizeTextMatch', () => {
    it('should return short text as-is', () => {
      const text = 'Short text';
      expect(optimizeTextMatch(text)).toEqual('Short text');
    });

    it('should normalize whitespace', () => {
      const text = 'Text  with   multiple    spaces';
      expect(optimizeTextMatch(text)).toEqual('Text with multiple spaces');
    });

    it('should truncate long text at word boundary', () => {
      const text =
        'This is a very long text that should be truncated at a word boundary to avoid breaking words in the middle';
      const result = optimizeTextMatch(text, 50);

      expect(result.length).toBeLessThanOrEqual(52); // 50 + '…'
      expect(result.endsWith('…')).toEqual(true);
      // Verify no double spaces by checking the actual truncated result
      expect(result).toEqual(
        'This is a very long text that should be truncated…'
      );
    });

    it('should truncate at character boundary if no good word boundary', () => {
      const text =
        'verylongtextwithoutspacesorwordsthatcanbebrokenatwordboundaries';
      const result = optimizeTextMatch(text, 30);

      expect(result.length).toEqual(31); // 30 + '…'
      expect(result.endsWith('…')).toEqual(true);
    });

    it('should use default max length of 100', () => {
      const longText = 'A'.repeat(150);
      const result = optimizeTextMatch(longText);

      expect(result.length).toEqual(101); // 100 + '…'
      expect(result.endsWith('…')).toEqual(true);
    });

    it('should handle text with newlines and tabs', () => {
      const text = 'Text\nwith\ttabs\nand\nnewlines';
      const result = optimizeTextMatch(text);
      expect(result).toEqual('Text with tabs and newlines');
    });

    it('should trim leading and trailing whitespace', () => {
      const text = '  \n  Leading and trailing whitespace  \n  ';
      const result = optimizeTextMatch(text);
      expect(result).toEqual('Leading and trailing whitespace');
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
      const yaml = result.content[0]!.text as string;

      // Empty arrays are now removed during cleaning
      const expectedYaml =
        'data:\n  arrayWithMixed:\n    - "valid"\n    - valid: "keep"\n  nestedObject:\n    deepNested:\n      valid: "keep"\n    nestedArray:\n      - 1\n      - 2\n    validProp: "test"\n  validArray:\n    - 1\n    - 2\n    - 3\n  validBoolean: true\n  validNumber: 42\n  validString: "hello"\n';

      expect(yaml).toEqual(expectedYaml);
    });

    it('should remove all empty arrays', () => {
      const data = {
        hints: [],
        results: [],
        validData: 'test',
      };

      const result = createResult({ data });
      const yaml = result.content[0]!.text as string;

      // Empty arrays are now removed (including hints and results)
      const expectedYaml = `data:\n  validData: "test"\n`;
      expect(yaml).toEqual(expectedYaml);
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
      const yaml = result.content[0]!.text as string;

      // Empty hints array is removed
      const expectedYaml = `data:\n  level1:\n    level2:\n      level3:\n        valid: "keep"\n`;
      expect(yaml).toEqual(expectedYaml);
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
                  repository: 'getify/TNG-Hooks',
                  stars: 1010,
                  description:
                    'Provides React-inspired hooks like useState(..) for stand-alone functions',
                  url: 'https://github.com/getify/TNG-Hooks',
                  updatedAt: '31/08/2025',
                },
                {
                  repository: 'the-road-to-learn-react/use-state-with-callback',
                  stars: 277,
                  description:
                    'Custom hook to include a callback function for useState.',
                  url: 'https://github.com/the-road-to-learn-react/use-state-with-callback',
                  updatedAt: '18/04/2025',
                },
              ],
            },
          ],
          hints: [
            'Chain tools strategically: start broad with repository search, then structure view, code search, and content fetch for deep analysis',
            'Use github_view_repo_structure first to understand project layout, then target specific files',
          ],
        };

        const yamlResult = jsonToYamlString(repoSearchResponse, {
          keysPriority: [
            'queryId',
            'reasoning',
            'repository',
            'description',
            'url',
            'stars',
            'updatedAt',
          ],
        });

        const expectedYaml = `data:\n  - queryId: "react_hooks_repos"\n    reasoning: "Find popular React repositories that demonstrate useState usage patterns"\n    repositories:\n      - repository: "getify/TNG-Hooks"\n        description: "Provides React-inspired hooks like useState(..) for stand-alone functions"\n        url: "https://github.com/getify/TNG-Hooks"\n        stars: 1010\n        updatedAt: "31/08/2025"\n      - repository: "the-road-to-learn-react/use-state-with-callback"\n        description: "Custom hook to include a callback function for useState."\n        url: "https://github.com/the-road-to-learn-react/use-state-with-callback"\n        stars: 277\n        updatedAt: "18/04/2025"\nhints:\n  - "Chain tools strategically: start broad with repository search, then structure view, code search, and content fetch for deep analysis"\n  - "Use github_view_repo_structure first to understand project layout, then target specific files"\n`;

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

        const expectedYaml = `data: []\nhints:\n  - "No repositories found matching your criteria"\n`;

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
            },
          ],
          hints: [
            'Chain tools strategically: start broad with repository search, then structure view, code search, and content fetch for deep analysis',
            'Use github_fetch_content with matchString from search results for precise context extraction',
          ],
        };

        const yamlResult = jsonToYamlString(codeSearchResponse, {
          keysPriority: ['queryId', 'reasoning', 'repository', 'files'],
        });

        const expectedYaml = `data:\n  - queryId: "usestate_examples"\n    reasoning: "Find diverse code examples showing useState implementation patterns"\n    repository: "yyl134934/react-mini"\n    files:\n      - path: "App.js"\n        text_matches:\n          - "function useState(initial) {\\n  const oldHook = wipFiber?.alternate?.hooks?.shift();"\n          - "function Counter() {\\n  const [targetCount, setTargetCount] = React.useState(1);"\n      - path: "static/examples/7.x/auth-flow.js"\n        text_matches:\n          - "function SignInScreen() {\\n  const [username, setUsername] = React.useState('');"\nhints:\n  - "Chain tools strategically: start broad with repository search, then structure view, code search, and content fetch for deep analysis"\n  - "Use github_fetch_content with matchString from search results for precise context extraction"\n`;

        expect(yamlResult).toEqual(expectedYaml);
      });
    });

    describe('GitHub File Content Response', () => {
      it('should convert file content response to YAML with priority keys', () => {
        const fileContentResponse = {
          data: [
            {
              repository: 'getify/TNG-Hooks',
              path: 'README.md',
              contentLength: 126,
              content:
                '# TNG-Hooks\n\n[![Build Status](https://travis-ci.org/getify/TNG-Hooks.svg?branch=master)](https://travis-ci.org/getify/TNG-Hooks)',
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
          keysPriority: [
            'queryId',
            'reasoning',
            'repository',
            'path',
            'contentLength',
            'content',
          ],
        });

        const expectedYaml = `data:\n  - queryId: "tng_hooks_readme"\n    reasoning: "Get documentation for TNG-Hooks which provides React-inspired useState for standalone functions"\n    repository: "getify/TNG-Hooks"\n    path: "README.md"\n    contentLength: 126\n    content: "# TNG-Hooks\\n\\n[![Build Status](https://travis-ci.org/getify/TNG-Hooks.svg?branch=master)](https://travis-ci.org/getify/TNG-Hooks)"\nhints:\n  - "Rich dataset available - analyze patterns, compare implementations, identify best practices"\n  - "Compare implementations across 3-5 repositories to identify best practices"\n`;

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

        const expectedYaml = `data:\n  pagination:\n    page: 1\n    total: 50\n  repositories:\n    - id: "repo-123"\n      name: "test-repo"\n      owner: "testuser"\n      url: "https://github.com/testuser/test-repo"\nhints:\n  - "Use pagination for large result sets"\n`;

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

        const expectedYaml = `data:\n  emptyArray: []\n  emptyObject: {}\n  nullField: null\n  validField: "test"\nhints: []\n`;

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

        const expectedYaml =
          'data:\n  path: "src/components/Button.tsx"\n  code: "const [state, setState] = useState(\\"initial\\");"\n  message: "Hello \\"world\\" with \'quotes\' and\\nnewlines"\nhints:\n  - "Handle special characters properly"\n';

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
        expect(typeof result).toEqual('string');
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
        expect(yamlResult).toEqual(`apple: "value2"
banana: "value3"
zebra: "value1"
`);
      });
    });
  });

  describe('Real Response Objects YAML Conversion', () => {
    it('should convert repository structure response to YAML with priority keys', () => {
      const response = {
        data: {
          queries: {
            successful: [
              {
                researchGoal:
                  'Explore React repository structure to locate hooks implementation',
                reasoning:
                  'Understanding the overall structure will help identify where useState and other hooks are implemented',
                owner: 'facebook',
                repo: 'react',
                path: '/',
                files: [
                  '/.editorconfig',
                  '/.eslintignore',
                  '/.eslintrc.js',
                  '/.git-blame-ignore-revs',
                  '/.gitattributes',
                  '/.gitignore',
                  '/.mailmap',
                  '/.nvmrc',
                  '/.prettierignore',
                  '/.prettierrc.js',
                  '/.watchmanconfig',
                  '/babel.config-react-compiler.js',
                  '/babel.config-ts.js',
                  '/babel.config.js',
                  '/CHANGELOG.md',
                  '/CODE_OF_CONDUCT.md',
                  '/CONTRIBUTING.md',
                  '/dangerfile.js',
                  '/flow-typed.config.json',
                  '/LICENSE',
                  '/MAINTAINERS',
                  '/package.json',
                  '/react.code-workspace',
                  '/ReactVersions.js',
                  '/README.md',
                  '/SECURITY.md',
                ],
                folders: [
                  '/.codesandbox',
                  '/compiler',
                  '/fixtures',
                  '/flow-typed',
                  '/packages',
                  '/scripts',
                ],
              },
            ],
          },
        },
        hints: {
          successful: [
            'Analyze top results in depth before expanding search',
            'Cross-reference findings across multiple sources',
            'Explore src/ or packages/ first for relevant files',
            'Use depth: 2 to surface key files/folders quickly',
            'Build targeted code searches from discovered path and filename patterns',
            'Chain tools: repository search → structure view → code search → content fetch',
            'Compare implementations across 3-5 repositories to identify best practices',
            'Focus on source code and example directories for implementation details',
          ],
          researchSuggestions: [
            'Search for useState in the hooks directory',
            'Look at React reconciler implementation',
            'Check packages/react/src for hooks',
          ],
        },
      };

      const yamlResult = jsonToYamlString(response, {
        keysPriority: ['queryId', 'reasoning', 'repository', 'files'],
      });

      const expectedYaml = `data:\n  queries:\n    successful:\n      - reasoning: "Understanding the overall structure will help identify where useState and other hooks are implemented"\n        files:\n          - "/.editorconfig"\n          - "/.eslintignore"\n          - "/.eslintrc.js"\n          - "/.git-blame-ignore-revs"\n          - "/.gitattributes"\n          - "/.gitignore"\n          - "/.mailmap"\n          - "/.nvmrc"\n          - "/.prettierignore"\n          - "/.prettierrc.js"\n          - "/.watchmanconfig"\n          - "/babel.config-react-compiler.js"\n          - "/babel.config-ts.js"\n          - "/babel.config.js"\n          - "/CHANGELOG.md"\n          - "/CODE_OF_CONDUCT.md"\n          - "/CONTRIBUTING.md"\n          - "/dangerfile.js"\n          - "/flow-typed.config.json"\n          - "/LICENSE"\n          - "/MAINTAINERS"\n          - "/package.json"\n          - "/react.code-workspace"\n          - "/ReactVersions.js"\n          - "/README.md"\n          - "/SECURITY.md"\n        folders:\n          - "/.codesandbox"\n          - "/compiler"\n          - "/fixtures"\n          - "/flow-typed"\n          - "/packages"\n          - "/scripts"\n        owner: "facebook"\n        path: "/"\n        repo: "react"\n        researchGoal: "Explore React repository structure to locate hooks implementation"\nhints:\n  researchSuggestions:\n    - "Search for useState in the hooks directory"\n    - "Look at React reconciler implementation"\n    - "Check packages/react/src for hooks"\n  successful:\n    - "Analyze top results in depth before expanding search"\n    - "Cross-reference findings across multiple sources"\n    - "Explore src/ or packages/ first for relevant files"\n    - "Use depth: 2 to surface key files/folders quickly"\n    - "Build targeted code searches from discovered path and filename patterns"\n    - "Chain tools: repository search → structure view → code search → content fetch"\n    - "Compare implementations across 3-5 repositories to identify best practices"\n    - "Focus on source code and example directories for implementation details"\n`;

      expect(yamlResult).toEqual(expectedYaml);
    });

    it('should convert file content response with dispatcher definitions to YAML', () => {
      const response = {
        data: {
          queries: {
            successful: [
              {
                researchGoal:
                  'Read the end of ReactFiberHooks.js to find dispatcher definitions',
                reasoning:
                  'The dispatcher and hook implementations are typically at the end of the file',
                researchSuggestions: [
                  'Look for the exported dispatcher objects',
                  'Find useState assignments',
                  'Check the module exports',
                ],
                owner: 'facebook',
                repo: 'react',
                path: 'packages/react-reconciler/src/ReactFiberHooks.js',
                contentLength: 3309,
                content:
                  "\n markUpdateInDevTools(fiber, lane, action);\n}\n\nfunction isRenderPhaseUpdate(fiber: Fiber): boolean {\n const alternate = fiber.alternate;\n return (\n fiber === currentlyRenderingFiber ||\n (alternate !== null && alternate === currentlyRenderingFiber)\n );\n}\n\nfunction enqueueRenderPhaseUpdate<S, A>(\n queue: UpdateQueue<S, A>,\n update: Update<S, A>,\n): void {\n // This is a render phase update. Stash it in a lazily-created map of\n // queue -> linked list of updates. After this render pass, we'll restart\n // and apply the stashed updates on top of the work-in-progress hook.\n didScheduleRenderPhaseUpdateDuringThisPass = didScheduleRenderPhaseUpdate =\n true;\n const pending = queue.pending;\n if (pending === null) {\n // This is the first update. Create a circular list.\n update.next = update;\n } else {\n update.next = pending.next;\n pending.next = update;\n }\n queue.pending = update;\n}\n\n// TODO: Move to ReactFiberConcurrentUpdates?\nfunction entangleTransitionUpdate<S, A>(\n root: FiberRoot,\n queue: UpdateQueue<S, A>,\n lane: Lane,\n): void {\n if (isTransitionLane(lane)) {\n let queueLanes = queue.lanes;\n\n // If any entangled lanes are no longer pending on the root, then they\n // must have finished. We can remove them from the shared queue, which\n // represents a superset of the actually pending lanes. In some cases we\n // may entangle more than we need to, but that's OK. In fact it's worse if\n // we don't entangle when we should.\n queueLanes = intersectLanes(queueLanes, root.pendingLanes);\n\n // Entangle the new transition lane with the other transition lanes.\n const newQueueLanes = mergeLanes(queueLanes, lane);\n queue.lanes = newQueueLanes;\n // Even if queue.lanes already include lane, we don't know for certain if\n // the lane finished since the last time we entangled it. So we need to\n // entangle it again, just to be sure.\n markRootEntangled(root, newQueueLanes);\n }\n}\n\nfunction markUpdateInDevTools<A>(fiber: Fiber, lane: Lane, action: A): void {\n if (enableSchedulingProfiler) {\n markStateUpdateScheduled(fiber, lane);\n }\n}\n\nexport const ContextOnlyDispatcher: Dispatcher = {\n readContext,\n\n use,\n useCallback: throwInvalidHookError,\n useContext: throwInvalidHookError,\n useEffect: throwInvalidHookError,\n useImperativeHandle: throwInvalidHookError,\n useLayoutEffect: throwInvalidHookError,\n useInsertionEffect: throwInvalidHookError,\n useMemo: throwInvalidHookError,\n useReducer: throwInvalidHookError,\n useRef: throwInvalidHookError,\n useState: throwInvalidHookError,\n useDebugValue: throwInvalidHookError,\n useDeferredValue: throwInvalidHookError,\n useTransition: throwInvalidHookError,\n useSyncExternalStore: throwInvalidHookError,\n useId: throwInvalidHookError,\n useHostTransitionStatus: throwInvalidHookError,\n useFormState: throwInvalidHookError,\n useActionState: throwInvalidHookError,\n useOptimistic: throwInvalidHookError,\n useMemoCache: throwInvalidHookError,\n useCacheRefresh: throwInvalidHookError,\n};\nif (enableUseEffectEventHook) {\n (ContextOnlyDispatcher: Dispatcher).useEffectEvent = throwInvalidHookError;\n}\n\nconst HooksDispatcherOnMount: Dispatcher = {\n readContext,\n\n use,\n useCallback: mountCallback,\n useContext: readContext,\n useEffect: mountEffect,",
                branch: '66a390ebb815065b1e5ac7ae504dadb22989f0d4',
                startLine: 3800,
                endLine: 3900,
                isPartial: true,
                minified: false,
                minificationFailed: true,
                minificationType: 'failed',
              },
            ],
          },
        },
        hints: {
          successful: [
            'Analyze top results in depth before expanding search',
            'Cross-reference findings across multiple sources',
            'Prefer partial reads for token efficiency',
            'When readability matters (e.g., JSON/Markdown), consider minified: false',
            'Use matchString from code search text_matches and increase matchStringContextLines if needed',
            'Chain tools: repository search → structure view → code search → content fetch',
            'Compare implementations across 3-5 repositories to identify best practices',
            'Examine imports/exports to understand dependencies and usage',
          ],
        },
      };

      const yamlResult = jsonToYamlString(response, {
        keysPriority: [
          'researchGoal',
          'reasoning',
          'researchSuggestions',
          'owner',
          'repo',
          'path',
          'contentLength',
          'content',
        ],
      });

      const expectedYaml = `data:\n  queries:\n    successful:\n      - researchGoal: "Read the end of ReactFiberHooks.js to find dispatcher definitions"\n        reasoning: "The dispatcher and hook implementations are typically at the end of the file"\n        researchSuggestions:\n          - "Look for the exported dispatcher objects"\n          - "Find useState assignments"\n          - "Check the module exports"\n        owner: "facebook"\n        repo: "react"\n        path: "packages/react-reconciler/src/ReactFiberHooks.js"\n        contentLength: 3309\n        content: "\\n markUpdateInDevTools(fiber, lane, action);\\n}\\n\\nfunction isRenderPhaseUpdate(fiber: Fiber): boolean {\\n const alternate = fiber.alternate;\\n return (\\n fiber === currentlyRenderingFiber ||\\n (alternate !== null && alternate === currentlyRenderingFiber)\\n );\\n}\\n\\nfunction enqueueRenderPhaseUpdate<S, A>(\\n queue: UpdateQueue<S, A>,\\n update: Update<S, A>,\\n): void {\\n // This is a render phase update. Stash it in a lazily-created map of\\n // queue -> linked list of updates. After this render pass, we'll restart\\n // and apply the stashed updates on top of the work-in-progress hook.\\n didScheduleRenderPhaseUpdateDuringThisPass = didScheduleRenderPhaseUpdate =\\n true;\\n const pending = queue.pending;\\n if (pending === null) {\\n // This is the first update. Create a circular list.\\n update.next = update;\\n } else {\\n update.next = pending.next;\\n pending.next = update;\\n }\\n queue.pending = update;\\n}\\n\\n// TODO: Move to ReactFiberConcurrentUpdates?\\nfunction entangleTransitionUpdate<S, A>(\\n root: FiberRoot,\\n queue: UpdateQueue<S, A>,\\n lane: Lane,\\n): void {\\n if (isTransitionLane(lane)) {\\n let queueLanes = queue.lanes;\\n\\n // If any entangled lanes are no longer pending on the root, then they\\n // must have finished. We can remove them from the shared queue, which\\n // represents a superset of the actually pending lanes. In some cases we\\n // may entangle more than we need to, but that's OK. In fact it's worse if\\n // we don't entangle when we should.\\n queueLanes = intersectLanes(queueLanes, root.pendingLanes);\\n\\n // Entangle the new transition lane with the other transition lanes.\\n const newQueueLanes = mergeLanes(queueLanes, lane);\\n queue.lanes = newQueueLanes;\\n // Even if queue.lanes already include lane, we don't know for certain if\\n // the lane finished since the last time we entangled it. So we need to\\n // entangle it again, just to be sure.\\n markRootEntangled(root, newQueueLanes);\\n }\\n}\\n\\nfunction markUpdateInDevTools<A>(fiber: Fiber, lane: Lane, action: A): void {\\n if (enableSchedulingProfiler) {\\n markStateUpdateScheduled(fiber, lane);\\n }\\n}\\n\\nexport const ContextOnlyDispatcher: Dispatcher = {\\n readContext,\\n\\n use,\\n useCallback: throwInvalidHookError,\\n useContext: throwInvalidHookError,\\n useEffect: throwInvalidHookError,\\n useImperativeHandle: throwInvalidHookError,\\n useLayoutEffect: throwInvalidHookError,\\n useInsertionEffect: throwInvalidHookError,\\n useMemo: throwInvalidHookError,\\n useReducer: throwInvalidHookError,\\n useRef: throwInvalidHookError,\\n useState: throwInvalidHookError,\\n useDebugValue: throwInvalidHookError,\\n useDeferredValue: throwInvalidHookError,\\n useTransition: throwInvalidHookError,\\n useSyncExternalStore: throwInvalidHookError,\\n useId: throwInvalidHookError,\\n useHostTransitionStatus: throwInvalidHookError,\\n useFormState: throwInvalidHookError,\\n useActionState: throwInvalidHookError,\\n useOptimistic: throwInvalidHookError,\\n useMemoCache: throwInvalidHookError,\\n useCacheRefresh: throwInvalidHookError,\\n};\\nif (enableUseEffectEventHook) {\\n (ContextOnlyDispatcher: Dispatcher).useEffectEvent = throwInvalidHookError;\\n}\\n\\nconst HooksDispatcherOnMount: Dispatcher = {\\n readContext,\\n\\n use,\\n useCallback: mountCallback,\\n useContext: readContext,\\n useEffect: mountEffect,"\n        branch: "66a390ebb815065b1e5ac7ae504dadb22989f0d4"\n        endLine: 3900\n        isPartial: true\n        minificationFailed: true\n        minificationType: "failed"\n        minified: false\n        startLine: 3800\nhints:\n  successful:\n    - "Analyze top results in depth before expanding search"\n    - "Cross-reference findings across multiple sources"\n    - "Prefer partial reads for token efficiency"\n    - "When readability matters (e.g., JSON/Markdown), consider minified: false"\n    - "Use matchString from code search text_matches and increase matchStringContextLines if needed"\n    - "Chain tools: repository search → structure view → code search → content fetch"\n    - "Compare implementations across 3-5 repositories to identify best practices"\n    - "Examine imports/exports to understand dependencies and usage"\n`;

      expect(yamlResult).toEqual(expectedYaml);
    });

    it('should convert file content response with mountState function to YAML', () => {
      const response = {
        data: {
          queries: {
            successful: [
              {
                researchGoal:
                  'Find the mountState function before mountStateImpl',
                reasoning:
                  'The mountState function should be defined before mountStateImpl',
                researchSuggestions: [
                  'Read earlier lines',
                  'Look for the function definition',
                  'Check the complete implementation',
                ],
                owner: 'facebook',
                repo: 'react',
                path: 'packages/react-reconciler/src/ReactFiberHooks.js',
                contentLength: 1211,
                content:
                  " forceStoreRerender(fiber);\n }\n };\n // Subscribe to the store and return a clean-up function.\n return subscribe(handleStoreChange);\n}\n\nfunction checkIfSnapshotChanged<T>(inst: StoreInstance<T>): boolean {\n const latestGetSnapshot = inst.getSnapshot;\n const prevValue = inst.value;\n try {\n const nextValue = latestGetSnapshot();\n return !is(prevValue, nextValue);\n } catch (error) {\n return true;\n }\n}\n\nfunction forceStoreRerender(fiber: Fiber) {\n const root = enqueueConcurrentRenderForLane(fiber, SyncLane);\n if (root !== null) {\n scheduleUpdateOnFiber(root, fiber, SyncLane);\n }\n}\n\nfunction mountStateImpl<S>(initialState: (() => S) | S): Hook {\n const hook = mountWorkInProgressHook();\n if (typeof initialState === 'function') {\n const initialStateInitializer = initialState;\n // $FlowFixMe[incompatible-use]: Flow doesn't like mixed types\n initialState = initialStateInitializer();\n if (shouldDoubleInvokeUserFnsInHooksDEV) {\n setIsStrictModeForDevtools(true);\n try {\n // $FlowFixMe[incompatible-use]: Flow doesn't like mixed types\n initialStateInitializer();\n } finally {\n setIsStrictModeForDevtools(false);\n }\n }\n }",
                branch: '66a390ebb815065b1e5ac7ae504dadb22989f0d4',
                startLine: 1870,
                endLine: 1910,
                isPartial: true,
                minified: false,
                minificationFailed: true,
                minificationType: 'failed',
              },
            ],
          },
        },
        hints: {
          successful: [
            'Analyze top results in depth before expanding search',
            'Cross-reference findings across multiple sources',
            'Prefer partial reads for token efficiency',
            'When readability matters (e.g., JSON/Markdown), consider minified: false',
            'Use matchString from code search text_matches and increase matchStringContextLines if needed',
            'Chain tools: repository search → structure view → code search → content fetch',
            'Compare implementations across 3-5 repositories to identify best practices',
            'Examine imports/exports to understand dependencies and usage',
          ],
        },
      };

      const yamlResult = jsonToYamlString(response, {
        keysPriority: [
          'researchGoal',
          'reasoning',
          'researchSuggestions',
          'owner',
          'repo',
          'path',
          'contentLength',
          'content',
        ],
      });

      const expectedYaml = `data:\n  queries:\n    successful:\n      - researchGoal: "Find the mountState function before mountStateImpl"\n        reasoning: "The mountState function should be defined before mountStateImpl"\n        researchSuggestions:\n          - "Read earlier lines"\n          - "Look for the function definition"\n          - "Check the complete implementation"\n        owner: "facebook"\n        repo: "react"\n        path: "packages/react-reconciler/src/ReactFiberHooks.js"\n        contentLength: 1211\n        content: " forceStoreRerender(fiber);\\n }\\n };\\n // Subscribe to the store and return a clean-up function.\\n return subscribe(handleStoreChange);\\n}\\n\\nfunction checkIfSnapshotChanged<T>(inst: StoreInstance<T>): boolean {\\n const latestGetSnapshot = inst.getSnapshot;\\n const prevValue = inst.value;\\n try {\\n const nextValue = latestGetSnapshot();\\n return !is(prevValue, nextValue);\\n } catch (error) {\\n return true;\\n }\\n}\\n\\nfunction forceStoreRerender(fiber: Fiber) {\\n const root = enqueueConcurrentRenderForLane(fiber, SyncLane);\\n if (root !== null) {\\n scheduleUpdateOnFiber(root, fiber, SyncLane);\\n }\\n}\\n\\nfunction mountStateImpl<S>(initialState: (() => S) | S): Hook {\\n const hook = mountWorkInProgressHook();\\n if (typeof initialState === 'function') {\\n const initialStateInitializer = initialState;\\n // $FlowFixMe[incompatible-use]: Flow doesn't like mixed types\\n initialState = initialStateInitializer();\\n if (shouldDoubleInvokeUserFnsInHooksDEV) {\\n setIsStrictModeForDevtools(true);\\n try {\\n // $FlowFixMe[incompatible-use]: Flow doesn't like mixed types\\n initialStateInitializer();\\n } finally {\\n setIsStrictModeForDevtools(false);\\n }\\n }\\n }"\n        branch: "66a390ebb815065b1e5ac7ae504dadb22989f0d4"\n        endLine: 1910\n        isPartial: true\n        minificationFailed: true\n        minificationType: "failed"\n        minified: false\n        startLine: 1870\nhints:\n  successful:\n    - "Analyze top results in depth before expanding search"\n    - "Cross-reference findings across multiple sources"\n    - "Prefer partial reads for token efficiency"\n    - "When readability matters (e.g., JSON/Markdown), consider minified: false"\n    - "Use matchString from code search text_matches and increase matchStringContextLines if needed"\n    - "Chain tools: repository search → structure view → code search → content fetch"\n    - "Compare implementations across 3-5 repositories to identify best practices"\n    - "Examine imports/exports to understand dependencies and usage"\n`;

      expect(yamlResult).toEqual(expectedYaml);
    });
  });
});
