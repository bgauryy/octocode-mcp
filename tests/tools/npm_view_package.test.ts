import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockExecuteNpmCommand = vi.hoisted(() => vi.fn());
const mockGenerateCacheKey = vi.hoisted(() => vi.fn());
const mockWithCache = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../src/utils/exec.js', () => ({
  executeNpmCommand: mockExecuteNpmCommand,
}));

vi.mock('../../src/utils/cache.js', () => ({
  generateCacheKey: mockGenerateCacheKey,
  withCache: mockWithCache,
}));

// Import after mocking
import { registerNpmViewPackageTool } from '../../src/mcp/tools/npm_view_package.js';

describe('NPM View Package Tool', () => {
  let mockServer: McpServer;

  beforeEach(() => {
    // Create a mock server with a tool method
    mockServer = {
      tool: vi.fn(),
    } as any;

    // Clear all mocks
    vi.clearAllMocks();

    // Default implementation for withCache - just execute the function
    mockWithCache.mockImplementation(
      async (key: string, fn: () => Promise<any>) => fn()
    );

    // Default cache key generation
    mockGenerateCacheKey.mockReturnValue('test-cache-key');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register the NPM view package tool with correct parameters', () => {
      registerNpmViewPackageTool(mockServer);

      expect(mockServer.tool).toHaveBeenCalledWith(
        'npm_view_package',
        expect.any(String),
        expect.objectContaining({
          packageName: expect.any(Object),
        }),
        expect.objectContaining({
          title: 'npm_view_package',
          description: expect.any(String),
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        }),
        expect.any(Function)
      );
    });
  });

  describe('Successful Package Views', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerNpmViewPackageTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should view package with complete metadata', async () => {
      const mockNpmData = {
        name: 'react',
        'dist-tags': { latest: '18.2.0' },
        license: 'MIT',
        time: {
          created: '2013-05-29T20:58:11.266Z',
          modified: '2023-06-15T18:10:39.928Z',
          '18.2.0': '2022-06-14T21:35:09.282Z',
          '18.1.0': '2022-04-26T19:57:18.362Z',
          '18.0.0': '2022-03-29T20:42:56.440Z',
        },
        repository: { url: 'git+https://github.com/facebook/react.git' },
        description:
          'React is a JavaScript library for building user interfaces.',
        dist: {
          unpackedSize: 2345678,
          tarball: 'https://registry.npmjs.org/react/-/react-18.2.0.tgz',
        },
        dependencies: {
          'loose-envify': '^1.1.0',
        },
        devDependencies: {
          '@types/react': '^18.0.0',
        },
        exports: {
          '.': {
            import: './index.js',
            require: './index.js',
          },
        },
      };

      const mockNpmResponse = {
        result: JSON.stringify(mockNpmData),
        command: 'npm view react --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await toolHandler({
        packageName: 'react',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.name).toBe('react');
      expect(data.latest).toBe('18.2.0');
      expect(data.license).toBe('MIT');
      expect(data.timeCreated).toBe('2013-05-29T20:58:11.266Z');
      expect(data.timeModified).toBe('2023-06-15T18:10:39.928Z');
      expect(data.repositoryGitUrl).toBe(
        'git+https://github.com/facebook/react.git'
      );
      expect(data.registryUrl).toBe('https://registry.npmjs.org');
      expect(data.description).toBe(
        'React is a JavaScript library for building user interfaces.'
      );
      expect(data.size).toBe(2345678);
      expect(data.dependencies).toEqual({ 'loose-envify': '^1.1.0' });
      expect(data.devDependencies).toEqual({ '@types/react': '^18.0.0' });
      expect(data.exports).toEqual({
        '.': {
          import: './index.js',
          require: './index.js',
        },
      });

      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'view',
        ['react', '--json'],
        { cache: true }
      );
    });

    it('should process versions correctly', async () => {
      const mockNpmData = {
        name: 'test-package',
        'dist-tags': { latest: '3.0.0' },
        license: 'MIT',
        time: {
          created: '2020-01-01T00:00:00.000Z',
          modified: '2023-01-01T00:00:00.000Z',
          '3.0.0': '2023-01-01T00:00:00.000Z',
          '2.1.0': '2022-06-01T00:00:00.000Z',
          '2.0.0': '2022-01-01T00:00:00.000Z',
          '1.5.0': '2021-06-01T00:00:00.000Z',
          '1.0.0': '2021-01-01T00:00:00.000Z',
          '1.0.0-beta.1': '2020-12-01T00:00:00.000Z', // Should be filtered out
        },
        repository: { url: 'git+https://github.com/test/package.git' },
        description: 'Test package',
        dist: { unpackedSize: 1000 },
      };

      const mockNpmResponse = {
        result: JSON.stringify(mockNpmData),
        command: 'npm view test-package --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await toolHandler({
        packageName: 'test-package',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);

      // Check versions are sorted by date (newest first)
      expect(data.versions).toHaveLength(5);
      expect(data.versions[0]).toEqual({
        version: '3.0.0',
        releaseDate: '2023-01-01T00:00:00.000Z',
      });
      expect(data.versions[1]).toEqual({
        version: '2.1.0',
        releaseDate: '2022-06-01T00:00:00.000Z',
      });

      // Check version stats
      expect(data.versionStats.total).toBe(6); // Total entries minus 'created' and 'modified' (includes beta)
      expect(data.versionStats.official).toBe(5); // Only semantic versions
    });

    it('should handle packages with missing optional fields', async () => {
      const mockNpmData = {
        name: 'minimal-package',
        // Missing most optional fields
      };

      const mockNpmResponse = {
        result: JSON.stringify(mockNpmData),
        command: 'npm view minimal-package --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await toolHandler({
        packageName: 'minimal-package',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.name).toBe('minimal-package');
      expect(data.latest).toBe('');
      expect(data.license).toBe('');
      expect(data.timeCreated).toBe('');
      expect(data.timeModified).toBe('');
      expect(data.repositoryGitUrl).toBe('');
      expect(data.registryUrl).toBe('');
      expect(data.description).toBe('');
      expect(data.size).toBe(0);
      expect(data.dependencies).toEqual({});
      expect(data.devDependencies).toEqual({});
      expect(data.exports).toEqual({});
      expect(data.versions).toEqual([]);
      expect(data.versionStats).toEqual({ total: -2, official: 0 });
    });

    it('should handle scoped packages', async () => {
      const mockNpmData = {
        name: '@types/react',
        'dist-tags': { latest: '18.2.0' },
        license: 'MIT',
        time: {
          created: '2016-07-01T00:00:00.000Z',
          modified: '2023-06-01T00:00:00.000Z',
          '18.2.0': '2023-06-01T00:00:00.000Z',
        },
        repository: {
          url: 'git+https://github.com/DefinitelyTyped/DefinitelyTyped.git',
        },
        description: 'TypeScript definitions for React',
        dist: { unpackedSize: 500000 },
      };

      const mockNpmResponse = {
        result: JSON.stringify(mockNpmData),
        command: 'npm view @types/react --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await toolHandler({
        packageName: '@types/react',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.name).toBe('@types/react');
      expect(data.description).toBe('TypeScript definitions for React');
    });

    it('should handle packages with complex exports', async () => {
      const mockNpmData = {
        name: 'complex-exports',
        'dist-tags': { latest: '1.0.0' },
        exports: {
          '.': {
            import: './esm/index.js',
            require: './cjs/index.js',
            types: './types/index.d.ts',
          },
          './utils': {
            import: './esm/utils.js',
            require: './cjs/utils.js',
            types: './types/utils.d.ts',
          },
          './package.json': './package.json',
        },
        time: {
          created: '2023-01-01T00:00:00.000Z',
          modified: '2023-01-01T00:00:00.000Z',
          '1.0.0': '2023-01-01T00:00:00.000Z',
        },
      };

      const mockNpmResponse = {
        result: JSON.stringify(mockNpmData),
        command: 'npm view complex-exports --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await toolHandler({
        packageName: 'complex-exports',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.exports).toEqual({
        '.': {
          import: './esm/index.js',
          require: './cjs/index.js',
          types: './types/index.d.ts',
        },
        './utils': {
          import: './esm/utils.js',
          require: './cjs/utils.js',
          types: './types/utils.d.ts',
        },
        './package.json': './package.json',
      });
    });

    it('should limit versions to 10 most recent', async () => {
      const timeData: Record<string, string> = {
        created: '2020-01-01T00:00:00.000Z',
        modified: '2023-01-01T00:00:00.000Z',
      };

      // Add 15 versions (higher version numbers get later dates)
      for (let i = 1; i <= 15; i++) {
        // Use year progression for more than 12 versions
        const year = 2020 + Math.floor((i - 1) / 12);
        const month = ((i - 1) % 12) + 1;
        timeData[`1.${i}.0`] =
          `${year}-${String(month).padStart(2, '0')}-01T00:00:00.000Z`;
      }

      const mockNpmData = {
        name: 'many-versions',
        'dist-tags': { latest: '1.15.0' },
        time: timeData,
      };

      const mockNpmResponse = {
        result: JSON.stringify(mockNpmData),
        command: 'npm view many-versions --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await toolHandler({
        packageName: 'many-versions',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.versions).toHaveLength(10); // Limited to 10 most recent
      expect(data.versions[0].version).toBe('1.15.0'); // Most recent first
      expect(data.versionStats.total).toBe(15);
      expect(data.versionStats.official).toBe(15);
    });
  });

  describe('Error Handling', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerNpmViewPackageTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should handle npm command errors', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        isError: true,
        content: [
          {
            text: 'npm ERR! 404 Not Found - GET https://registry.npmjs.org/nonexistent-package',
          },
        ],
      });

      const result = await toolHandler({
        packageName: 'nonexistent-package',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('404 Not Found');
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network timeout');
      mockExecuteNpmCommand.mockRejectedValue(networkError);

      const result = await toolHandler({
        packageName: 'test-package',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Failed to get npm package metadata'
      );
      expect(result.content[0].text).toContain('Network timeout');
    });

    it('should handle malformed JSON responses', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: 'invalid json response' }],
      });

      const result = await toolHandler({
        packageName: 'test-package',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Failed to get npm package metadata'
      );
    });

    it('should handle missing command result', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify({ result: null }) }],
      });

      const result = await toolHandler({
        packageName: 'test-package',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Failed to get npm package metadata'
      );
    });

    it('should handle empty content array', async () => {
      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [],
      });

      const result = await toolHandler({
        packageName: 'test-package',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(
        'Failed to get npm package metadata'
      );
    });
  });

  describe('Input Validation', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerNpmViewPackageTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should reject empty package name', async () => {
      const result = await toolHandler({
        packageName: '',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Package name is required - provide a valid NPM package name');
      expect(mockExecuteNpmCommand).not.toHaveBeenCalled();
    });

    it('should reject whitespace-only package name', async () => {
      const result = await toolHandler({
        packageName: '   ',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Package name is required - provide a valid NPM package name');
      expect(mockExecuteNpmCommand).not.toHaveBeenCalled();
    });

    it('should reject invalid package name characters', async () => {
      const invalidNames = [
        'package with spaces',
        'package@#$%',
        'UPPERCASE',
        'package!',
        'package?',
      ];

      for (const invalidName of invalidNames) {
        const result = await toolHandler({
          packageName: invalidName,
        });

        expect(result.isError).toBe(true);
        expect(result.content[0].text).toBe('Invalid package name format - use standard NPM naming (e.g., "package-name" or "@scope/package")');
      }

      expect(mockExecuteNpmCommand).not.toHaveBeenCalled();
    });

    it('should accept valid package names', async () => {
      const validNames = [
        'react',
        '@types/react',
        'lodash.debounce',
        'package-name',
        'package_name',
        '@scope/package-name',
        'a',
        '123',
        'package123',
      ];

      const mockNpmData = { name: 'test' };
      const mockNpmResponse = {
        result: JSON.stringify(mockNpmData),
        command: 'npm view test --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      for (const validName of validNames) {
        mockExecuteNpmCommand.mockClear();

        const result = await toolHandler({
          packageName: validName,
        });

        expect(result.isError).toBe(false);
        expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
          'view',
          [validName, '--json'],
          { cache: true }
        );
      }
    });

    it('should handle missing packageName parameter', async () => {
      const result = await toolHandler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Package name is required - provide a valid NPM package name');
      expect(mockExecuteNpmCommand).not.toHaveBeenCalled();
    });
  });

  describe('Registry URL Extraction', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerNpmViewPackageTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should extract registry URL from tarball', async () => {
      const mockNpmData = {
        name: 'test-package',
        dist: {
          tarball:
            'https://registry.npmjs.org/test-package/-/test-package-1.0.0.tgz',
        },
      };

      const mockNpmResponse = {
        result: JSON.stringify(mockNpmData),
        command: 'npm view test-package --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await toolHandler({
        packageName: 'test-package',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.registryUrl).toBe('https://registry.npmjs.org');
    });

    it('should handle custom registry URLs', async () => {
      const mockNpmData = {
        name: 'private-package',
        dist: {
          tarball:
            'https://npm.company.com/private-package/-/private-package-1.0.0.tgz',
        },
      };

      const mockNpmResponse = {
        result: JSON.stringify(mockNpmData),
        command: 'npm view private-package --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await toolHandler({
        packageName: 'private-package',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.registryUrl).toBe('https://npm.company.com');
    });

    it('should handle missing tarball URL', async () => {
      const mockNpmData = {
        name: 'test-package',
        dist: {},
      };

      const mockNpmResponse = {
        result: JSON.stringify(mockNpmData),
        command: 'npm view test-package --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await toolHandler({
        packageName: 'test-package',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.registryUrl).toBe('');
    });
  });

  describe('Version Processing Edge Cases', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerNpmViewPackageTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should filter out non-semantic versions', async () => {
      const mockNpmData = {
        name: 'test-package',
        time: {
          created: '2020-01-01T00:00:00.000Z',
          modified: '2023-01-01T00:00:00.000Z',
          '1.0.0': '2021-01-01T00:00:00.000Z',
          '1.0.0-beta.1': '2020-12-01T00:00:00.000Z', // Pre-release
          '1.0.0-alpha': '2020-11-01T00:00:00.000Z', // Pre-release
          latest: '2021-01-01T00:00:00.000Z', // Tag, not version
          '1.0': '2020-10-01T00:00:00.000Z', // Not semantic
          'v1.0.0': '2020-09-01T00:00:00.000Z', // Has prefix
        },
      };

      const mockNpmResponse = {
        result: JSON.stringify(mockNpmData),
        command: 'npm view test-package --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await toolHandler({
        packageName: 'test-package',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.versions).toHaveLength(1);
      expect(data.versions[0].version).toBe('1.0.0');
      expect(data.versionStats.official).toBe(1);
      expect(data.versionStats.total).toBe(6); // Total minus created/modified
    });

    it('should handle empty time object', async () => {
      const mockNpmData = {
        name: 'test-package',
        time: null,
      };

      const mockNpmResponse = {
        result: JSON.stringify(mockNpmData),
        command: 'npm view test-package --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await toolHandler({
        packageName: 'test-package',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);
      expect(data.versions).toEqual([]);
      expect(data.versionStats).toEqual({ total: -2, official: 0 });
    });
  });

  describe('Caching', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerNpmViewPackageTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should use caching for npm view commands', async () => {
      const mockNpmData = { name: 'test-package' };
      const mockNpmResponse = {
        result: JSON.stringify(mockNpmData),
        command: 'npm view test-package --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      await toolHandler({
        packageName: 'test-package',
      });

      expect(mockGenerateCacheKey).toHaveBeenCalledWith('npm-view-package', {
        packageName: 'test-package',
      });
      expect(mockWithCache).toHaveBeenCalledWith(
        'test-cache-key',
        expect.any(Function)
      );
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'view',
        ['test-package', '--json'],
        { cache: true }
      );
    });

    it('should generate different cache keys for different packages', async () => {
      const mockNpmData = { name: 'test' };
      const mockNpmResponse = {
        result: JSON.stringify(mockNpmData),
        command: 'npm view test --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      mockGenerateCacheKey
        .mockReturnValueOnce('cache-key-1')
        .mockReturnValueOnce('cache-key-2');

      await toolHandler({ packageName: 'package1' });
      await toolHandler({ packageName: 'package2' });

      expect(mockGenerateCacheKey).toHaveBeenNthCalledWith(
        1,
        'npm-view-package',
        {
          packageName: 'package1',
        }
      );
      expect(mockGenerateCacheKey).toHaveBeenNthCalledWith(
        2,
        'npm-view-package',
        {
          packageName: 'package2',
        }
      );
      expect(mockWithCache).toHaveBeenNthCalledWith(
        1,
        'cache-key-1',
        expect.any(Function)
      );
      expect(mockWithCache).toHaveBeenNthCalledWith(
        2,
        'cache-key-2',
        expect.any(Function)
      );
    });
  });

  describe('Complex Integration', () => {
    let toolHandler: Function;

    beforeEach(() => {
      registerNpmViewPackageTool(mockServer);
      toolHandler = (mockServer.tool as any).mock.calls[0][4];
    });

    it('should handle real-world package structure', async () => {
      const mockNpmData = {
        name: '@babel/core',
        'dist-tags': {
          latest: '7.22.5',
          next: '7.23.0-beta.1',
        },
        license: 'MIT',
        time: {
          created: '2018-08-27T17:11:59.162Z',
          modified: '2023-06-15T18:10:39.928Z',
          '7.22.5': '2023-06-15T18:10:39.928Z',
          '7.22.4': '2023-06-08T12:30:00.000Z',
          '7.22.3': '2023-06-01T10:15:00.000Z',
        },
        repository: {
          type: 'git',
          url: 'git+https://github.com/babel/babel.git',
          directory: 'packages/babel-core',
        },
        description: 'Babel compiler core.',
        dist: {
          unpackedSize: 1234567,
          tarball: 'https://registry.npmjs.org/@babel/core/-/core-7.22.5.tgz',
        },
        dependencies: {
          '@ampproject/remapping': '^2.2.0',
          '@babel/code-frame': '^7.22.5',
          '@babel/generator': '^7.22.5',
        },
        devDependencies: {
          '@babel/helper-transform-fixture-test-runner': '^7.22.5',
          '@types/convert-source-map': '^1.5.1',
        },
        exports: {
          '.': './lib/index.js',
          './lib/config': './lib/config/index.js',
          './lib/transform': './lib/transform.js',
          './package.json': './package.json',
        },
        engines: {
          node: '>=6.9.0',
        },
        keywords: ['6to5', 'babel', 'classes', 'const', 'es6', 'harmony'],
      };

      const mockNpmResponse = {
        result: JSON.stringify(mockNpmData),
        command: 'npm view @babel/core --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await toolHandler({
        packageName: '@babel/core',
      });

      expect(result.isError).toBe(false);
      const data = JSON.parse(result.content[0].text as string);

      // Verify all fields are properly processed
      expect(data.name).toBe('@babel/core');
      expect(data.latest).toBe('7.22.5');
      expect(data.license).toBe('MIT');
      expect(data.repositoryGitUrl).toBe(
        'git+https://github.com/babel/babel.git'
      );
      expect(data.registryUrl).toBe('https://registry.npmjs.org');
      expect(data.description).toBe('Babel compiler core.');
      expect(data.size).toBe(1234567);

      // Check dependencies
      expect(Object.keys(data.dependencies)).toHaveLength(3);
      expect(data.dependencies['@babel/code-frame']).toBe('^7.22.5');

      // Check exports
      expect(data.exports['.']).toBe('./lib/index.js');
      expect(data.exports['./lib/config']).toBe('./lib/config/index.js');

      // Check versions are sorted correctly
      expect(data.versions[0].version).toBe('7.22.5');
      expect(data.versions[1].version).toBe('7.22.4');
      expect(data.versions[2].version).toBe('7.22.3');
    });
  });
});
