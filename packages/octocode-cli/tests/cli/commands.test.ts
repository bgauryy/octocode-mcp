/**
 * CLI Commands Tests - Token and Status Commands
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock node:fs to prevent any real file operations
vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  rmSync: vi.fn(),
  statSync: vi.fn(),
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    unlink: vi.fn(),
    stat: vi.fn(),
  },
}));

// Mock node:crypto to prevent real encryption
vi.mock('node:crypto', () => ({
  randomBytes: vi.fn().mockReturnValue(Buffer.alloc(32)),
  createCipheriv: vi.fn().mockReturnValue({
    update: vi.fn().mockReturnValue('encrypted'),
    final: vi.fn().mockReturnValue(''),
    getAuthTag: vi.fn().mockReturnValue(Buffer.alloc(16)),
  }),
  createDecipheriv: vi.fn().mockReturnValue({
    update: vi.fn().mockReturnValue('{}'),
    final: vi.fn().mockReturnValue(''),
    setAuthTag: vi.fn(),
  }),
}));

// Mock all external dependencies
vi.mock('../../src/features/github-oauth.js', () => ({
  login: vi.fn(),
  logout: vi.fn(),
  getAuthStatus: vi.fn(),
  getToken: vi.fn(),
  getStoragePath: vi
    .fn()
    .mockReturnValue('/home/test/.octocode/credentials.json'),
  getTokenType: vi
    .fn()
    .mockImplementation((source: string, envSource?: string) => {
      switch (source) {
        case 'env':
          return envSource ?? 'env:GITHUB_TOKEN';
        case 'gh-cli':
          return 'gh-cli';
        case 'octocode':
          return 'octocode-storage';
        case 'none':
        default:
          return 'none';
      }
    }),
}));

vi.mock('../../src/utils/token-storage.js', () => ({
  getCredentials: vi.fn(),
}));

vi.mock('../../src/features/install.js', () => ({
  installOctocode: vi.fn(),
  detectAvailableIDEs: vi.fn().mockReturnValue([]),
  getInstallPreview: vi.fn(),
}));

vi.mock('../../src/features/node-check.js', () => ({
  checkNodeInPath: vi.fn().mockReturnValue({ installed: true }),
  checkNpmInPath: vi.fn().mockReturnValue({ installed: true }),
}));

vi.mock('../../src/utils/prompts.js', () => ({
  loadInquirer: vi.fn(),
  select: vi.fn(),
}));

vi.mock('../../src/utils/spinner.js', () => ({
  Spinner: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockReturnThis(),
    stop: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
  })),
}));

vi.mock('../../src/utils/fs.js', () => ({
  copyDirectory: vi.fn(),
  dirExists: vi.fn(),
  listSubdirectories: vi.fn().mockReturnValue([]),
}));

describe('CLI Commands', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let originalExitCode: typeof process.exitCode;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    process.exitCode = originalExitCode;
  });

  describe('tokenCommand', () => {
    it('should output the token when authenticated via octocode', async () => {
      const { getToken } = await import('../../src/features/github-oauth.js');
      vi.mocked(getToken).mockResolvedValue({
        token: 'gho_test_token_12345',
        source: 'octocode',
        username: 'testuser',
      });

      const { findCommand } = await import('../../src/cli/commands.js');
      const tokenCmd = findCommand('token');
      expect(tokenCmd).toBeDefined();

      await tokenCmd!.handler({
        command: 'token',
        args: [],
        options: {},
      });

      expect(consoleSpy).toHaveBeenCalledWith('gho_test_token_12345');
      expect(process.exitCode).toBeUndefined();
    });

    it('should output the token when authenticated via gh-cli', async () => {
      const { getToken } = await import('../../src/features/github-oauth.js');
      vi.mocked(getToken).mockResolvedValue({
        token: 'gho_ghcli_token_12345',
        source: 'gh-cli',
        username: 'ghuser',
      });

      const { findCommand } = await import('../../src/cli/commands.js');
      const tokenCmd = findCommand('token');

      await tokenCmd!.handler({
        command: 'token',
        args: [],
        options: {},
      });

      expect(consoleSpy).toHaveBeenCalledWith('gho_ghcli_token_12345');
      expect(process.exitCode).toBeUndefined();
    });

    it('should show error when not authenticated (default auto type)', async () => {
      const { getToken } = await import('../../src/features/github-oauth.js');
      vi.mocked(getToken).mockResolvedValue({
        token: null,
        source: 'none',
      });

      const { findCommand } = await import('../../src/cli/commands.js');
      const tokenCmd = findCommand('token');
      expect(tokenCmd).toBeDefined();

      await tokenCmd!.handler({
        command: 'token',
        args: [],
        options: {},
      });

      // Should not output a token
      expect(consoleSpy).not.toHaveBeenCalledWith(
        expect.stringMatching(/^gho_/)
      );
      // Should show warning about not authenticated (default type is now 'auto')
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Not authenticated')
      );
      expect(process.exitCode).toBe(1);
    });

    it('should use custom hostname when provided', async () => {
      const { getToken } = await import('../../src/features/github-oauth.js');
      vi.mocked(getToken).mockResolvedValue({
        token: 'gho_enterprise_token',
        source: 'octocode',
        username: 'enterpriseuser',
      });

      const { findCommand } = await import('../../src/cli/commands.js');
      const tokenCmd = findCommand('token');

      await tokenCmd!.handler({
        command: 'token',
        args: [],
        options: { hostname: 'github.enterprise.com' },
      });

      // getToken is now called with hostname and tokenSource ('auto' is the new default)
      expect(getToken).toHaveBeenCalledWith('github.enterprise.com', 'auto');
      expect(consoleSpy).toHaveBeenCalledWith('gho_enterprise_token');
    });

    it('should show source info when --source flag is used', async () => {
      const { getToken } = await import('../../src/features/github-oauth.js');
      vi.mocked(getToken).mockResolvedValue({
        token: 'gho_test_token',
        source: 'gh-cli',
        username: 'testuser',
      });

      const { findCommand } = await import('../../src/cli/commands.js');
      const tokenCmd = findCommand('token');

      await tokenCmd!.handler({
        command: 'token',
        args: [],
        options: { source: true },
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Token found')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Source:')
      );
    });

    it('should be findable by alias "t"', async () => {
      const { findCommand } = await import('../../src/cli/commands.js');
      const tokenCmd = findCommand('t');
      expect(tokenCmd).toBeDefined();
      expect(tokenCmd!.name).toBe('token');
    });

    it('should use gh type when --type=gh is provided', async () => {
      const { getToken } = await import('../../src/features/github-oauth.js');
      vi.mocked(getToken).mockResolvedValue({
        token: 'gho_gh_cli_token',
        source: 'gh-cli',
        username: 'ghuser',
      });

      const { findCommand } = await import('../../src/cli/commands.js');
      const tokenCmd = findCommand('token');

      await tokenCmd!.handler({
        command: 'token',
        args: [],
        options: { type: 'gh' },
      });

      expect(getToken).toHaveBeenCalledWith('github.com', 'gh');
      expect(consoleSpy).toHaveBeenCalledWith('gho_gh_cli_token');
    });

    it('should use auto type when --type=auto is provided', async () => {
      const { getToken } = await import('../../src/features/github-oauth.js');
      vi.mocked(getToken).mockResolvedValue({
        token: 'gho_auto_token',
        source: 'octocode',
        username: 'autouser',
      });

      const { findCommand } = await import('../../src/cli/commands.js');
      const tokenCmd = findCommand('token');

      await tokenCmd!.handler({
        command: 'token',
        args: [],
        options: { type: 'auto' },
      });

      expect(getToken).toHaveBeenCalledWith('github.com', 'auto');
      expect(consoleSpy).toHaveBeenCalledWith('gho_auto_token');
    });

    it('should show error for invalid --type value', async () => {
      const { findCommand } = await import('../../src/cli/commands.js');
      const tokenCmd = findCommand('token');

      await tokenCmd!.handler({
        command: 'token',
        args: [],
        options: { type: 'invalid' },
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid token type')
      );
      expect(process.exitCode).toBe(1);
    });

    describe('--json flag', () => {
      it('should output valid JSON with token and type when authenticated via env', async () => {
        const { getToken } = await import('../../src/features/github-oauth.js');
        vi.mocked(getToken).mockResolvedValue({
          token: 'env_token_12345',
          source: 'env',
          envSource: 'env:GH_TOKEN',
        });

        const { findCommand } = await import('../../src/cli/commands.js');
        const tokenCmd = findCommand('token');

        await tokenCmd!.handler({
          command: 'token',
          args: [],
          options: { json: true },
        });

        // Get the output from console.log
        const output = consoleSpy.mock.calls.find(
          (call: unknown[]) =>
            typeof call[0] === 'string' && call[0].includes('"token"')
        );
        expect(output).toBeDefined();
        const parsed = JSON.parse(output![0]);
        expect(parsed.token).toBe('env_token_12345');
        expect(parsed.type).toBe('env:GH_TOKEN');
        expect(process.exitCode).toBeUndefined();
      });

      it('should output valid JSON with token and type when authenticated via gh-cli', async () => {
        const { getToken } = await import('../../src/features/github-oauth.js');
        vi.mocked(getToken).mockResolvedValue({
          token: 'ghcli_token_12345',
          source: 'gh-cli',
          username: 'ghuser',
        });

        const { findCommand } = await import('../../src/cli/commands.js');
        const tokenCmd = findCommand('token');

        await tokenCmd!.handler({
          command: 'token',
          args: [],
          options: { json: true },
        });

        const output = consoleSpy.mock.calls.find(
          (call: unknown[]) =>
            typeof call[0] === 'string' && call[0].includes('"token"')
        );
        expect(output).toBeDefined();
        const parsed = JSON.parse(output![0]);
        expect(parsed.token).toBe('ghcli_token_12345');
        expect(parsed.type).toBe('gh-cli');
      });

      it('should output valid JSON with token and type when authenticated via octocode', async () => {
        const { getToken } = await import('../../src/features/github-oauth.js');
        vi.mocked(getToken).mockResolvedValue({
          token: 'octocode_token_12345',
          source: 'octocode',
          username: 'octocodeuser',
        });

        const { findCommand } = await import('../../src/cli/commands.js');
        const tokenCmd = findCommand('token');

        await tokenCmd!.handler({
          command: 'token',
          args: [],
          options: { json: true },
        });

        const output = consoleSpy.mock.calls.find(
          (call: unknown[]) =>
            typeof call[0] === 'string' && call[0].includes('"token"')
        );
        expect(output).toBeDefined();
        const parsed = JSON.parse(output![0]);
        expect(parsed.token).toBe('octocode_token_12345');
        expect(parsed.type).toBe('octocode-storage');
      });

      it('should output JSON with null token and none type when not authenticated', async () => {
        const { getToken } = await import('../../src/features/github-oauth.js');
        vi.mocked(getToken).mockResolvedValue({
          token: null,
          source: 'none',
        });

        const { findCommand } = await import('../../src/cli/commands.js');
        const tokenCmd = findCommand('token');

        await tokenCmd!.handler({
          command: 'token',
          args: [],
          options: { json: true },
        });

        const output = consoleSpy.mock.calls.find(
          (call: unknown[]) =>
            typeof call[0] === 'string' && call[0].includes('"token"')
        );
        expect(output).toBeDefined();
        const parsed = JSON.parse(output![0]);
        expect(parsed.token).toBeNull();
        expect(parsed.type).toBe('none');
        expect(process.exitCode).toBe(1);
      });

      it('should work with -j shorthand', async () => {
        const { getToken } = await import('../../src/features/github-oauth.js');
        vi.mocked(getToken).mockResolvedValue({
          token: 'shorthand_token',
          source: 'gh-cli',
        });

        const { findCommand } = await import('../../src/cli/commands.js');
        const tokenCmd = findCommand('token');

        await tokenCmd!.handler({
          command: 'token',
          args: [],
          options: { j: true },
        });

        const output = consoleSpy.mock.calls.find(
          (call: unknown[]) =>
            typeof call[0] === 'string' && call[0].includes('"token"')
        );
        expect(output).toBeDefined();
        const parsed = JSON.parse(output![0]);
        expect(parsed.token).toBe('shorthand_token');
        expect(parsed.type).toBe('gh-cli');
      });

      it('should output JSON error for invalid type in json mode', async () => {
        const { findCommand } = await import('../../src/cli/commands.js');
        const tokenCmd = findCommand('token');

        await tokenCmd!.handler({
          command: 'token',
          args: [],
          options: { json: true, type: 'invalid' },
        });

        const output = consoleSpy.mock.calls.find(
          (call: unknown[]) =>
            typeof call[0] === 'string' && call[0].includes('"token"')
        );
        expect(output).toBeDefined();
        const parsed = JSON.parse(output![0]);
        expect(parsed.token).toBeNull();
        expect(parsed.type).toBe('none');
        expect(process.exitCode).toBe(1);
      });
    });
  });

  describe('statusCommand', () => {
    it('should show logged in status when authenticated', async () => {
      const { getAuthStatus } =
        await import('../../src/features/github-oauth.js');
      vi.mocked(getAuthStatus).mockReturnValue({
        authenticated: true,
        hostname: 'github.com',
        username: 'testuser',
        tokenExpired: false,
      });

      const { findCommand } = await import('../../src/cli/commands.js');
      const statusCmd = findCommand('status');
      expect(statusCmd).toBeDefined();

      await statusCmd!.handler({
        command: 'status',
        args: [],
        options: {},
      });

      // Check that logged in message is shown
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Logged in')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('testuser')
      );
      expect(process.exitCode).toBeUndefined();
    });

    it('should show not logged in status when not authenticated', async () => {
      const { getAuthStatus } =
        await import('../../src/features/github-oauth.js');
      vi.mocked(getAuthStatus).mockReturnValue({
        authenticated: false,
      });

      const { findCommand } = await import('../../src/cli/commands.js');
      const statusCmd = findCommand('status');

      await statusCmd!.handler({
        command: 'status',
        args: [],
        options: {},
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Not logged in')
      );
    });

    it('should show token expired warning when token is expired', async () => {
      const { getAuthStatus } =
        await import('../../src/features/github-oauth.js');
      vi.mocked(getAuthStatus).mockReturnValue({
        authenticated: true,
        hostname: 'github.com',
        username: 'testuser',
        tokenExpired: true,
      });

      const { findCommand } = await import('../../src/cli/commands.js');
      const statusCmd = findCommand('status');

      await statusCmd!.handler({
        command: 'status',
        args: [],
        options: {},
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('expired')
      );
    });

    it('should use custom hostname when provided', async () => {
      const { getAuthStatus } =
        await import('../../src/features/github-oauth.js');
      vi.mocked(getAuthStatus).mockReturnValue({
        authenticated: true,
        hostname: 'github.enterprise.com',
        username: 'enterpriseuser',
      });

      const { findCommand } = await import('../../src/cli/commands.js');
      const statusCmd = findCommand('status');

      await statusCmd!.handler({
        command: 'status',
        args: [],
        options: { hostname: 'github.enterprise.com' },
      });

      expect(getAuthStatus).toHaveBeenCalledWith('github.enterprise.com');
    });

    it('should be findable by alias "s"', async () => {
      const { findCommand } = await import('../../src/cli/commands.js');
      const statusCmd = findCommand('s');
      expect(statusCmd).toBeDefined();
      expect(statusCmd!.name).toBe('status');
    });
  });

  describe('findCommand', () => {
    it('should find token command by name', async () => {
      const { findCommand } = await import('../../src/cli/commands.js');
      const cmd = findCommand('token');
      expect(cmd).toBeDefined();
      expect(cmd!.name).toBe('token');
    });

    it('should find status command by name', async () => {
      const { findCommand } = await import('../../src/cli/commands.js');
      const cmd = findCommand('status');
      expect(cmd).toBeDefined();
      expect(cmd!.name).toBe('status');
    });

    it('should return undefined for unknown command', async () => {
      const { findCommand } = await import('../../src/cli/commands.js');
      const cmd = findCommand('unknown-command');
      expect(cmd).toBeUndefined();
    });
  });
});
