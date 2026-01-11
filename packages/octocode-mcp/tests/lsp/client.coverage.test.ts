import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import {
  LSPClient,
  getOrCreateClient,
  shutdownAllClients,
  isLanguageServerAvailable,
  resetUserConfigCache,
} from '../../src/lsp/index.js';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as jsonrpc from 'vscode-jsonrpc/node.js';
import { URI } from 'vscode-uri';
import { EventEmitter } from 'events';

// Mocks
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('fs', async importOriginal => {
  const original = await importOriginal<typeof import('fs')>();
  return {
    ...original,
    promises: {
      readFile: vi.fn(),
      access: vi.fn(),
    },
    // Sync functions used by validateLSPServerPath
    realpathSync: vi.fn((p: string) => p),
    statSync: vi.fn(() => ({ isFile: () => true })),
  };
});

vi.mock('vscode-jsonrpc/node.js', () => ({
  createMessageConnection: vi.fn(),
  StreamMessageReader: vi.fn(),
  StreamMessageWriter: vi.fn(),
}));

describe('LSPClient Coverage', () => {
  let client: LSPClient;
  let mockProcess: any;
  let mockConnection: any;

  const config = {
    command: 'test-server',
    args: ['--stdio'],
    workspaceRoot: '/workspace',
    languageId: 'typescript',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset user config cache to ensure clean state
    resetUserConfigCache();

    // Setup mock process
    mockProcess = new EventEmitter();
    mockProcess.stdin = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.kill = vi.fn();
    mockProcess.pid = 12345;
    (cp.spawn as Mock).mockReturnValue(mockProcess);

    // Setup mock connection
    mockConnection = {
      listen: vi.fn(),
      sendRequest: vi.fn(),
      sendNotification: vi.fn(),
      dispose: vi.fn(),
      onNotification: vi.fn(),
      onRequest: vi.fn(),
    };
    (jsonrpc.createMessageConnection as Mock).mockReturnValue(mockConnection);

    // Setup fs - mock readFile to handle different files appropriately
    (fs.promises.readFile as Mock).mockImplementation((path: string) => {
      // Config files should throw ENOENT to simulate not existing
      if (path.includes('lsp-servers.json')) {
        return Promise.reject(new Error('ENOENT'));
      }
      // Other files return mock content
      return Promise.resolve('file content\nline 2\nline 3');
    });
    (fs.promises.access as Mock).mockResolvedValue(undefined);

    client = new LSPClient(config);
  });

  afterEach(async () => {
    await shutdownAllClients();
    resetUserConfigCache();
  });

  describe('start()', () => {
    it('should spawn process and initialize connection', async () => {
      // Mock initialize response
      mockConnection.sendRequest.mockResolvedValueOnce({
        capabilities: {
          textDocument: { definition: { linkSupport: true } },
        },
      });

      await client.start();

      expect(cp.spawn).toHaveBeenCalledWith(
        'test-server',
        ['--stdio'],
        expect.objectContaining({ cwd: '/workspace' })
      );

      expect(jsonrpc.createMessageConnection).toHaveBeenCalled();
      expect(mockConnection.listen).toHaveBeenCalled();
      expect(mockConnection.sendRequest).toHaveBeenCalledWith(
        'initialize',
        expect.any(Object)
      );
      expect(mockConnection.sendNotification).toHaveBeenCalledWith(
        'initialized',
        {}
      );
    });

    it('should throw if process pipes are missing', async () => {
      (cp.spawn as Mock).mockReturnValue({}); // No stdin/stdout
      await expect(client.start()).rejects.toThrow(
        'Failed to create language server process pipes'
      );
    });

    it('should throw if already started', async () => {
      mockConnection.sendRequest.mockResolvedValueOnce({});
      await client.start();
      await expect(client.start()).rejects.toThrow(
        'LSP client already started'
      );
    });

    it('should handle process error', async () => {
      mockConnection.sendRequest.mockResolvedValueOnce({});
      await client.start();

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      mockProcess.emit('error', new Error('Process failed'));
      expect(consoleSpy).toHaveBeenCalledWith(
        'LSP process error:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });

    it('should handle stderr data', async () => {
      mockConnection.sendRequest.mockResolvedValueOnce({});
      await client.start();

      const consoleSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});
      mockProcess.stderr.emit('data', Buffer.from('stderr output'));
      expect(consoleSpy).toHaveBeenCalledWith('LSP stderr:', 'stderr output');
      consoleSpy.mockRestore();
    });
  });

  describe('openDocument()', () => {
    beforeEach(async () => {
      mockConnection.sendRequest.mockResolvedValueOnce({});
      await client.start();
    });

    it('should open document if not already open', async () => {
      await client.openDocument('/workspace/file.ts');

      expect(fs.promises.readFile).toHaveBeenCalledWith(
        '/workspace/file.ts',
        'utf-8'
      );
      expect(mockConnection.sendNotification).toHaveBeenCalledWith(
        'textDocument/didOpen',
        expect.objectContaining({
          textDocument: expect.objectContaining({
            uri: expect.stringContaining('file:///'),
            languageId: 'typescript',
            text: 'file content\nline 2\nline 3',
          }),
        })
      );
    });

    it('should not open document if already open', async () => {
      await client.openDocument('/workspace/file.ts');
      vi.clearAllMocks();

      await client.openDocument('/workspace/file.ts');
      expect(mockConnection.sendNotification).not.toHaveBeenCalled();
    });

    it('should throw if not initialized', async () => {
      const uninitClient = new LSPClient(config);
      await expect(uninitClient.openDocument('/file.ts')).rejects.toThrow(
        'LSP client not initialized'
      );
    });
  });

  describe('closeDocument()', () => {
    beforeEach(async () => {
      mockConnection.sendRequest.mockResolvedValueOnce({});
      await client.start();
      await client.openDocument('/workspace/file.ts');
    });

    it('should close document if open', async () => {
      await client.closeDocument('/workspace/file.ts');
      expect(mockConnection.sendNotification).toHaveBeenCalledWith(
        'textDocument/didClose',
        expect.objectContaining({
          textDocument: expect.objectContaining({
            uri: expect.stringContaining('file:///'),
          }),
        })
      );
    });

    it('should do nothing if document not open', async () => {
      await client.closeDocument('/workspace/other.ts');
      expect(mockConnection.sendNotification).toHaveBeenCalledTimes(2);
    });
  });

  describe('gotoDefinition()', () => {
    beforeEach(async () => {
      mockConnection.sendRequest.mockResolvedValueOnce({});
      await client.start();
    });

    it('should return snippets from location result', async () => {
      const location = {
        uri: URI.file('/workspace/def.ts').toString(),
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 10 },
        },
      };

      mockConnection.sendRequest.mockResolvedValueOnce(location);

      const snippets = await client.gotoDefinition('/workspace/file.ts', {
        line: 1,
        character: 1,
      });

      expect(mockConnection.sendRequest).toHaveBeenCalledWith(
        'textDocument/definition',
        expect.objectContaining({
          textDocument: { uri: expect.stringContaining('file:///') },
          position: { line: 1, character: 1 },
        })
      );

      expect(snippets).toHaveLength(1);
      expect(snippets[0]!.uri).toContain('/workspace/def.ts');
    });

    it('should return snippets from LocationLink result', async () => {
      const locationLink = {
        targetUri: URI.file('/workspace/def.ts').toString(),
        targetRange: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 10 },
        },
        targetSelectionRange: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 10 },
        },
      };

      mockConnection.sendRequest.mockResolvedValueOnce(locationLink);

      const snippets = await client.gotoDefinition('/workspace/file.ts', {
        line: 1,
        character: 1,
      });

      expect(snippets).toHaveLength(1);
      expect(snippets[0]!.uri).toContain('/workspace/def.ts');
    });

    it('should handle array of locations', async () => {
      const locations = [
        {
          uri: URI.file('/workspace/def1.ts').toString(),
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 10 },
          },
        },
      ];
      mockConnection.sendRequest.mockResolvedValueOnce(locations);

      const snippets = await client.gotoDefinition('/workspace/file.ts', {
        line: 1,
        character: 1,
      });
      expect(snippets).toHaveLength(1);
    });

    it('should handle null result', async () => {
      mockConnection.sendRequest.mockResolvedValueOnce(null);
      const snippets = await client.gotoDefinition('/workspace/file.ts', {
        line: 1,
        character: 1,
      });
      expect(snippets).toHaveLength(0);
    });

    it('should handle file read error gracefully', async () => {
      const location = {
        uri: URI.file('/workspace/error.ts').toString(),
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 10 },
        },
      };
      mockConnection.sendRequest.mockResolvedValueOnce(location);

      (fs.promises.readFile as Mock)
        .mockResolvedValueOnce('source content')
        .mockRejectedValueOnce(new Error('Read error'));

      const snippets = await client.gotoDefinition('/workspace/file.ts', {
        line: 1,
        character: 1,
      });
      expect(snippets[0]!.content).toContain('[Could not read file:');
    });
  });

  describe('findReferences()', () => {
    beforeEach(async () => {
      mockConnection.sendRequest.mockResolvedValueOnce({});
      await client.start();
    });

    it('findReferences should throw if not initialized', async () => {
      const uninitClient = new LSPClient(config);
      await expect(
        uninitClient.findReferences('/file.ts', { line: 0, character: 0 })
      ).rejects.toThrow('LSP client not initialized');
    });

    it('should return snippets from locations', async () => {
      const locations = [
        {
          uri: URI.file('/workspace/ref.ts').toString(),
          range: {
            start: { line: 1, character: 0 },
            end: { line: 1, character: 5 },
          },
        },
      ];
      mockConnection.sendRequest.mockResolvedValueOnce(locations);

      const snippets = await client.findReferences(
        '/workspace/file.ts',
        { line: 1, character: 1 },
        true
      );

      expect(mockConnection.sendRequest).toHaveBeenCalledWith(
        'textDocument/references',
        expect.objectContaining({
          context: { includeDeclaration: true },
        })
      );
      expect(snippets).toHaveLength(1);
    });
  });

  describe('Call Hierarchy', () => {
    beforeEach(async () => {
      mockConnection.sendRequest.mockResolvedValueOnce({});
      await client.start();
    });

    it('prepareCallHierarchy should throw if not initialized', async () => {
      const uninitClient = new LSPClient(config);
      await expect(
        uninitClient.prepareCallHierarchy('/file.ts', { line: 0, character: 0 })
      ).rejects.toThrow('LSP client not initialized');
    });

    it('prepareCallHierarchy should return empty array if result is invalid', async () => {
      mockConnection.sendRequest.mockResolvedValueOnce(null);
      const result = await client.prepareCallHierarchy('/workspace/file.ts', {
        line: 0,
        character: 0,
      });
      expect(result).toHaveLength(0);
    });

    it('prepareCallHierarchy should return items', async () => {
      const items = [
        {
          name: 'func',
          kind: 12, // Function
          uri: URI.file('/workspace/file.ts').toString(),
          range: {
            start: { line: 0, character: 0 },
            end: { line: 1, character: 0 },
          },
          selectionRange: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 5 },
          },
        },
      ];
      mockConnection.sendRequest.mockResolvedValueOnce(items);

      const result = await client.prepareCallHierarchy('/workspace/file.ts', {
        line: 0,
        character: 0,
      });

      expect(mockConnection.sendRequest).toHaveBeenCalledWith(
        'textDocument/prepareCallHierarchy',
        expect.anything()
      );
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('func');
    });

    it('getIncomingCalls should throw if not initialized', async () => {
      const uninitClient = new LSPClient(config);
      const item = {
        name: 'func',
        kind: 'function' as any,
        uri: '/workspace/file.ts',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 1, character: 0 },
        },
        selectionRange: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 5 },
        },
        displayRange: { startLine: 1, endLine: 2 },
      };

      await expect(uninitClient.getIncomingCalls(item)).rejects.toThrow(
        'LSP client not initialized'
      );
    });

    it('getIncomingCalls should return calls', async () => {
      const item = {
        name: 'func',
        kind: 'function' as any,
        uri: '/workspace/file.ts',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 1, character: 0 },
        },
        selectionRange: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 5 },
        },
        displayRange: { startLine: 1, endLine: 2 },
      };

      const incomingCalls = [
        {
          from: {
            name: 'caller',
            kind: 12,
            uri: URI.file('/workspace/caller.ts').toString(),
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 0 },
            },
            selectionRange: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 0 },
            },
          },
          fromRanges: [
            {
              start: { line: 5, character: 5 },
              end: { line: 5, character: 10 },
            },
          ],
        },
      ];

      mockConnection.sendRequest.mockResolvedValueOnce(incomingCalls);

      const result = await client.getIncomingCalls(item);
      expect(result).toHaveLength(1);
      expect(result[0]!.from.name).toBe('caller');
    });

    it('getIncomingCalls should return empty array if result is null', async () => {
      const item = {
        name: 'func',
        kind: 'function' as any,
        uri: '/workspace/file.ts',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 1, character: 0 },
        },
        selectionRange: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 5 },
        },
        displayRange: { startLine: 1, endLine: 2 },
      };

      mockConnection.sendRequest.mockResolvedValueOnce(null);

      const result = await client.getIncomingCalls(item);
      expect(result).toEqual([]);
    });

    it('getOutgoingCalls should throw if not initialized', async () => {
      const uninitClient = new LSPClient(config);
      const item = {
        name: 'func',
        kind: 'function' as any,
        uri: '/workspace/file.ts',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 1, character: 0 },
        },
        selectionRange: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 5 },
        },
        displayRange: { startLine: 1, endLine: 2 },
      };

      await expect(uninitClient.getOutgoingCalls(item)).rejects.toThrow(
        'LSP client not initialized'
      );
    });

    it('getOutgoingCalls should return empty array if result is null', async () => {
      const item = {
        name: 'func',
        kind: 'function' as any,
        uri: '/workspace/file.ts',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 1, character: 0 },
        },
        selectionRange: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 5 },
        },
        displayRange: { startLine: 1, endLine: 2 },
      };

      mockConnection.sendRequest.mockResolvedValueOnce(null);

      const result = await client.getOutgoingCalls(item);
      expect(result).toEqual([]);
    });

    it('getOutgoingCalls should return calls', async () => {
      const item = {
        name: 'func',
        kind: 'function' as any,
        uri: '/workspace/file.ts',
        range: {
          start: { line: 0, character: 0 },
          end: { line: 1, character: 0 },
        },
        selectionRange: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 5 },
        },
        displayRange: { startLine: 1, endLine: 2 },
      };

      const outgoingCalls = [
        {
          to: {
            name: 'callee',
            kind: 12,
            uri: URI.file('/workspace/callee.ts').toString(),
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 0 },
            },
            selectionRange: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 0 },
            },
          },
          fromRanges: [
            {
              start: { line: 5, character: 5 },
              end: { line: 5, character: 10 },
            },
          ],
        },
      ];

      mockConnection.sendRequest.mockResolvedValueOnce(outgoingCalls);

      const result = await client.getOutgoingCalls(item);
      expect(result).toHaveLength(1);
      expect(result[0]!.to.name).toBe('callee');
    });
  });

  describe('Utility Functions', () => {
    it('getOrCreateClient should create new client each time (no caching)', async () => {
      mockConnection.sendRequest.mockResolvedValue({});

      const client1 = await getOrCreateClient(
        '/workspace',
        '/workspace/file.ts'
      );
      expect(client1).toBeDefined();

      const client2 = await getOrCreateClient(
        '/workspace',
        '/workspace/file.ts'
      );
      expect(client2).toBeDefined();
      // Caching removed - each call creates a new client
      expect(client2).not.toBe(client1);
    });

    it('getOrCreateClient should return null for unsupported file', async () => {
      const client = await getOrCreateClient(
        '/workspace',
        '/workspace/file.txt'
      );
      expect(client).toBeNull();
    });

    it('getOrCreateClient should handle start failure', async () => {
      (cp.spawn as Mock).mockImplementationOnce(() => {
        throw new Error('Spawn failed');
      });
      const client = await getOrCreateClient(
        '/workspace-fail',
        '/workspace-fail/file.ts'
      );
      expect(client).toBeNull();
    });

    it('isLanguageServerAvailable should return true if command is in path', async () => {
      const result = await isLanguageServerAvailable('/file.ts');
      expect(result).toBe(true);
    });

    it('isLanguageServerAvailable should return false for unknown extension', async () => {
      const result = await isLanguageServerAvailable('/file.unknown');
      expect(result).toBe(false);
    });

    it('isLanguageServerAvailable should check absolute path if command is absolute', async () => {
      process.env['OCTOCODE_PYTHON_SERVER_PATH'] = '/absolute/path/to/pylsp';

      (fs.promises.access as Mock).mockResolvedValueOnce(undefined); // Success

      const result = await isLanguageServerAvailable('/file.py');
      expect(result).toBe(true);
      expect(fs.promises.access).toHaveBeenCalledWith(
        '/absolute/path/to/pylsp'
      );

      delete process.env['OCTOCODE_PYTHON_SERVER_PATH'];
    });

    it('isLanguageServerAvailable should return false if absolute path does not exist', async () => {
      process.env['OCTOCODE_PYTHON_SERVER_PATH'] = '/absolute/path/to/pylsp';

      (fs.promises.access as Mock).mockRejectedValueOnce(new Error('ENOENT')); // Fail

      const result = await isLanguageServerAvailable('/file.py');
      expect(result).toBe(false);

      delete process.env['OCTOCODE_PYTHON_SERVER_PATH'];
    });

    it('isLanguageServerAvailable should check PATH for non-absolute commands', async () => {
      const mockCheckProcess = new EventEmitter();
      (mockCheckProcess as any).kill = vi.fn();

      // Use mockImplementation that emits 'close' after spawn is called
      (cp.spawn as Mock).mockImplementationOnce(() => {
        setImmediate(() => mockCheckProcess.emit('close', 0));
        return mockCheckProcess;
      });

      const result = await isLanguageServerAvailable('/file.py');
      expect(result).toBe(true);
    });

    it('isLanguageServerAvailable should return false if command not in PATH', async () => {
      const mockCheckProcess = new EventEmitter();
      (mockCheckProcess as any).kill = vi.fn();

      // Use mockImplementation that emits 'close' with exit code 1 (not found)
      (cp.spawn as Mock).mockImplementationOnce(() => {
        setImmediate(() => mockCheckProcess.emit('close', 1));
        return mockCheckProcess;
      });

      const result = await isLanguageServerAvailable('/file.py');
      expect(result).toBe(false);
    });

    it('isLanguageServerAvailable should handle check process error', async () => {
      const mockCheckProcess = new EventEmitter();
      (mockCheckProcess as any).kill = vi.fn();

      // Use mockImplementation that emits 'error' after spawn is called
      (cp.spawn as Mock).mockImplementationOnce(() => {
        setImmediate(() =>
          mockCheckProcess.emit('error', new Error('Spawn error'))
        );
        return mockCheckProcess;
      });

      const result = await isLanguageServerAvailable('/file.py');
      expect(result).toBe(false);
    });

    it('isLanguageServerAvailable should handle timeout', async () => {
      vi.useFakeTimers();
      const mockCheckProcess = new EventEmitter();
      (mockCheckProcess as any).kill = vi.fn();

      (cp.spawn as Mock).mockReturnValueOnce(mockCheckProcess);

      const resultPromise = isLanguageServerAvailable('/file.py');

      // Run all timers to completion (handles both async operations and the 5s timeout)
      await vi.runAllTimersAsync();

      const result = await resultPromise;
      expect(result).toBe(false);
      expect((mockCheckProcess as any).kill).toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('should resolve bundled typescript-language-server', async () => {
      const consoleDebugSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});

      const result = await isLanguageServerAvailable('/file.ts');

      expect(typeof result).toBe('boolean');

      consoleDebugSpy.mockRestore();
    });
  });

  describe('hasCapability', () => {
    beforeEach(async () => {
      mockConnection.sendRequest.mockResolvedValueOnce({
        capabilities: {
          definitionProvider: true,
        },
      });
      await client.start();
    });

    it('should return true if capability exists', () => {
      expect(client.hasCapability('definitionProvider')).toBe(true);
    });

    it('should return false if capability does not exist', () => {
      expect(client.hasCapability('referencesProvider')).toBe(false);
    });

    it('should return false if not initialized (no capabilities)', () => {
      const newClient = new LSPClient(config);
      expect(newClient.hasCapability('anything')).toBe(false);
    });
  });

  describe('stop()', () => {
    it('should do nothing if no connection', async () => {
      await client.stop();
      expect(mockConnection.sendRequest).not.toHaveBeenCalled();
    });

    it('should cleanup resources', async () => {
      mockConnection.sendRequest.mockResolvedValueOnce({});
      await client.start();

      await client.stop();

      expect(mockConnection.sendRequest).toHaveBeenCalledWith('shutdown');
      expect(mockConnection.sendNotification).toHaveBeenCalledWith('exit');
      expect(mockConnection.dispose).toHaveBeenCalled();
      expect(mockProcess.kill).toHaveBeenCalled();
    });

    it('should close open documents before shutdown', async () => {
      mockConnection.sendRequest.mockResolvedValueOnce({});
      await client.start();

      (fs.promises.readFile as Mock).mockResolvedValue('content');

      await client.openDocument('/workspace/file1.ts');
      await client.openDocument('/workspace/file2.ts');

      await client.stop();

      expect(mockConnection.sendNotification).toHaveBeenCalledWith(
        'textDocument/didClose',
        expect.objectContaining({
          textDocument: { uri: expect.stringContaining('file1.ts') },
        })
      );
      expect(mockConnection.sendNotification).toHaveBeenCalledWith(
        'textDocument/didClose',
        expect.objectContaining({
          textDocument: { uri: expect.stringContaining('file2.ts') },
        })
      );
    });

    it('should handle errors during stop gracefully', async () => {
      mockConnection.sendRequest.mockResolvedValueOnce({});
      await client.start();

      mockConnection.sendRequest.mockRejectedValueOnce(
        new Error('Shutdown failed')
      );

      await client.stop();

      expect(mockConnection.dispose).toHaveBeenCalled();
    });
  });
});
