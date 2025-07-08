import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  createMockMcpServer,
  MockMcpServer,
} from '../fixtures/mcp-fixtures.js';

// Use vi.hoisted to ensure mocks are available during module initialization
const mockExecuteNpmCommand = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('../../src/utils/exec.js', () => ({
  executeNpmCommand: mockExecuteNpmCommand,
}));

// Import after mocking
import { registerNpmViewPackageTool } from '../../src/mcp/tools/npm_view_package.js';

describe('NPM View Package Tool', () => {
  let mockServer: MockMcpServer;

  beforeEach(() => {
    // Create mock server using the fixture
    mockServer = createMockMcpServer();

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockServer.cleanup();
    vi.resetAllMocks();
  });

  describe('Tool Registration', () => {
    it('should register the NPM view package tool', () => {
      registerNpmViewPackageTool(mockServer.server);

      expect(mockServer.server.registerTool).toHaveBeenCalledWith(
        'npmViewPackage',
        expect.any(Object),
        expect.any(Function)
      );
    });
  });

  describe('Basic Functionality (No Parameters)', () => {
    it('should handle successful package view with full package info', async () => {
      registerNpmViewPackageTool(mockServer.server);

      const mockNpmResponse = {
        result: {
          name: 'react',
          version: '19.1.0',
          description: 'React library',
          license: 'MIT',
          repository: {
            url: 'git+https://github.com/facebook/react.git',
            type: 'git',
            directory: 'packages/react',
          },
          time: {
            created: '2011-10-26T17:46:21.942Z',
            modified: '2022-06-14T17:00:00.000Z',
          },
          dist: {
            unpackedSize: 50000,
          },
          versions: ['19.0.0', '19.1.0'],
        },
        command: 'npm view react --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await mockServer.callTool('npmViewPackage', {
        packageName: 'react',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'view',
        ['react', '--json'],
        { cache: false }
      );

      // Check that the response contains optimized data
      const responseData = JSON.parse(result.content[0].text as string);
      expect(responseData.name).toBe('react');
      expect(responseData.version).toBe('19.1.0');
    });
  });

  describe('Field Parameter (Single Field)', () => {
    it('should handle field parameter for version', async () => {
      registerNpmViewPackageTool(mockServer.server);

      const mockNpmResponse = {
        result: '19.1.0',
        command: 'npm view react version',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await mockServer.callTool('npmViewPackage', {
        packageName: 'react',
        field: 'version',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'view',
        ['react', 'version'],
        { cache: false }
      );

      // Check response format for field parameter
      const responseData = JSON.parse(result.content[0].text as string);
      expect(responseData).toEqual({
        field: 'version',
        value: '19.1.0',
        package: 'react',
      });
    });

    it('should handle field parameter for description', async () => {
      registerNpmViewPackageTool(mockServer.server);

      const mockNpmResponse = {
        result: 'React is a JavaScript library for building user interfaces.',
        command: 'npm view react description',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await mockServer.callTool('npmViewPackage', {
        packageName: 'react',
        field: 'description',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'view',
        ['react', 'description'],
        { cache: false }
      );

      const responseData = JSON.parse(result.content[0].text as string);
      expect(responseData).toEqual({
        field: 'description',
        value: 'React is a JavaScript library for building user interfaces.',
        package: 'react',
      });
    });
  });

  describe('Match Parameter (Filtered Fields)', () => {
    it('should handle match parameter with single field', async () => {
      registerNpmViewPackageTool(mockServer.server);

      const mockNpmResponse = {
        result: {
          name: 'react',
          version: '19.1.0',
          description: 'React library',
          license: 'MIT',
          repository: { url: 'git+https://github.com/facebook/react.git' },
          // ... other fields that should be filtered out
          otherField: 'should not appear in result',
        },
        command: 'npm view react --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await mockServer.callTool('npmViewPackage', {
        packageName: 'react',
        match: 'version',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'view',
        ['react', '--json'],
        { cache: false }
      );

      // Check response format for match parameter
      const responseData = JSON.parse(result.content[0].text as string);
      expect(responseData).toEqual({
        package: 'react',
        fields: ['version'],
        values: { version: '19.1.0' },
      });
    });

    it('should handle match parameter with multiple fields', async () => {
      registerNpmViewPackageTool(mockServer.server);

      const mockNpmResponse = {
        result: {
          name: 'react',
          version: '19.1.0',
          description: 'React library',
          license: 'MIT',
          repository: { url: 'git+https://github.com/facebook/react.git' },
          otherField: 'should not appear in result',
        },
        command: 'npm view react --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await mockServer.callTool('npmViewPackage', {
        packageName: 'react',
        match: ['version', 'description', 'license'],
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'view',
        ['react', '--json'],
        { cache: false }
      );

      // Check response format for multiple fields
      const responseData = JSON.parse(result.content[0].text as string);
      expect(responseData).toEqual({
        package: 'react',
        fields: ['version', 'description', 'license'],
        values: {
          version: '19.1.0',
          description: 'React library',
          license: 'MIT',
        },
      });
    });

    it('should handle match parameter with non-existent fields', async () => {
      registerNpmViewPackageTool(mockServer.server);

      const mockNpmResponse = {
        result: {
          name: 'react',
          version: '19.1.0',
          description: 'React library',
        },
        command: 'npm view react --json',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await mockServer.callTool('npmViewPackage', {
        packageName: 'react',
        match: ['version', 'nonexistent-field'],
      });

      expect(result.isError).toBe(false);

      // Check that only existing fields are returned
      const responseData = JSON.parse(result.content[0].text as string);
      expect(responseData).toEqual({
        package: 'react',
        fields: ['version', 'nonexistent-field'],
        values: { version: '19.1.0' }, // nonexistent-field should be omitted
      });
    });
  });

  describe('Parameter Priority', () => {
    it('should prioritize field parameter over match parameter', async () => {
      registerNpmViewPackageTool(mockServer.server);

      const mockNpmResponse = {
        result: '19.1.0',
        command: 'npm view react version',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await mockServer.callTool('npmViewPackage', {
        packageName: 'react',
        field: 'version',
        match: ['description', 'license'], // should be ignored
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'view',
        ['react', 'version'], // field parameter wins
        { cache: false }
      );

      // Should use field response format
      const responseData = JSON.parse(result.content[0].text as string);
      expect(responseData).toEqual({
        field: 'version',
        value: '19.1.0',
        package: 'react',
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle package not found', async () => {
      registerNpmViewPackageTool(mockServer.server);

      mockExecuteNpmCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'Package not found' }],
      });

      const result = await mockServer.callTool('npmViewPackage', {
        packageName: 'nonexistent-package',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Package not found');
    });

    it('should handle package not found with field parameter', async () => {
      registerNpmViewPackageTool(mockServer.server);

      mockExecuteNpmCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'Package not found' }],
      });

      const result = await mockServer.callTool('npmViewPackage', {
        packageName: 'nonexistent-package',
        field: 'version',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Package not found');
    });

    it('should handle package not found with match parameter', async () => {
      registerNpmViewPackageTool(mockServer.server);

      mockExecuteNpmCommand.mockResolvedValue({
        isError: true,
        content: [{ text: 'Package not found' }],
      });

      const result = await mockServer.callTool('npmViewPackage', {
        packageName: 'nonexistent-package',
        match: ['version', 'description'],
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe('Package not found');
    });

    it('should handle empty package name', async () => {
      registerNpmViewPackageTool(mockServer.server);

      const result = await mockServer.callTool('npmViewPackage', {
        packageName: '',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed to fetch package ""');
    });
  });

  describe('Scoped Packages', () => {
    it('should handle scoped packages with field parameter', async () => {
      registerNpmViewPackageTool(mockServer.server);

      const mockNpmResponse = {
        result: '20.0.5',
        command: 'npm view @angular/cli version',
        type: 'npm',
      };

      mockExecuteNpmCommand.mockResolvedValue({
        isError: false,
        content: [{ text: JSON.stringify(mockNpmResponse) }],
      });

      const result = await mockServer.callTool('npmViewPackage', {
        packageName: '@angular/cli',
        field: 'version',
      });

      expect(result.isError).toBe(false);
      expect(mockExecuteNpmCommand).toHaveBeenCalledWith(
        'view',
        ['@angular/cli', 'version'],
        { cache: false }
      );

      const responseData = JSON.parse(result.content[0].text as string);
      expect(responseData).toEqual({
        field: 'version',
        value: '20.0.5',
        package: '@angular/cli',
      });
    });
  });
});
