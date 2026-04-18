/**
 * Tests for cli/commands/install.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  unlinkSync: vi.fn(),
  rmSync: vi.fn(),
  statSync: vi.fn(),
  symlinkSync: vi.fn(),
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    unlink: vi.fn(),
    stat: vi.fn(),
  },
}));

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

vi.mock('../../../src/features/install.js', () => ({
  installOctocode: vi.fn(),
  getInstallPreview: vi.fn(),
}));

vi.mock('../../../src/features/node-check.js', () => ({
  checkNodeInPath: vi.fn().mockReturnValue({ installed: true }),
  checkNpmInPath: vi.fn().mockReturnValue({ installed: true }),
}));

vi.mock('../../../src/interactive.js', () => ({
  runInteractiveMode: vi.fn(),
}));

vi.mock('../../../src/utils/spinner.js', () => ({
  Spinner: vi.fn(function SpinnerMock(this: unknown) {
    return {
      start: vi.fn().mockReturnThis(),
      stop: vi.fn(),
      succeed: vi.fn(),
      fail: vi.fn(),
    };
  }),
}));

vi.mock('../../../src/ui/constants.js', () => ({
  IDE_INFO: { cursor: { name: 'Cursor' } },
  CLIENT_INFO: { cursor: { name: 'Cursor' } },
  INSTALL_METHOD_INFO: {
    npx: { name: 'npx' },
    direct: { name: 'Direct' },
  },
}));

describe('cli/commands/install', () => {
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

  async function loadDeps() {
    const { installOctocode, getInstallPreview } =
      await import('../../../src/features/install.js');
    const { runInteractiveMode } = await import('../../../src/interactive.js');
    const { checkNodeInPath, checkNpmInPath } =
      await import('../../../src/features/node-check.js');
    const { Spinner } = await import('../../../src/utils/spinner.js');
    const { installCommand } =
      await import('../../../src/cli/commands/install.js');
    return {
      installOctocode,
      getInstallPreview,
      runInteractiveMode,
      checkNodeInPath,
      checkNpmInPath,
      Spinner,
      installCommand,
    };
  }

  const basePreview = {
    ide: 'cursor' as const,
    method: 'npx' as const,
    configPath: '/mock/mcp.json',
    serverConfig: {},
    action: 'create' as const,
  };

  it('calls runInteractiveMode when no IDE is provided', async () => {
    const { installCommand, runInteractiveMode } = await loadDeps();
    await installCommand.handler!({
      command: 'install',
      args: [],
      options: {},
    });
    expect(runInteractiveMode).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBeUndefined();
  });

  it('errors when Node is not in PATH for npx method', async () => {
    const { installCommand, checkNodeInPath } = await loadDeps();
    vi.mocked(checkNodeInPath).mockReturnValueOnce({
      installed: false,
      version: null,
    });

    await installCommand.handler!({
      command: 'install',
      args: [],
      options: { ide: 'cursor', method: 'npx' },
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('not found in PATH')
    );
    expect(process.exitCode).toBe(1);
  });

  it('errors when npm is not in PATH for npx method', async () => {
    const { installCommand, checkNpmInPath } = await loadDeps();
    vi.mocked(checkNpmInPath).mockReturnValueOnce({
      installed: false,
      version: null,
    });

    await installCommand.handler!({
      command: 'install',
      args: [],
      options: { ide: 'cursor', method: 'npx' },
    });

    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('npm is'));
    expect(process.exitCode).toBe(1);
  });

  it('errors on invalid IDE', async () => {
    const { installCommand } = await loadDeps();

    await installCommand.handler!({
      command: 'install',
      args: [],
      options: { ide: 'not-a-real-ide', method: 'npx' },
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid IDE')
    );
    expect(process.exitCode).toBe(1);
  });

  it('errors on invalid method', async () => {
    const { installCommand } = await loadDeps();

    await installCommand.handler!({
      command: 'install',
      args: [],
      options: { ide: 'cursor', method: 'bogus' },
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid method')
    );
    expect(process.exitCode).toBe(1);
  });

  it('errors when already configured without --force', async () => {
    const { installCommand, getInstallPreview } = await loadDeps();
    vi.mocked(getInstallPreview).mockReturnValue({
      ...basePreview,
      action: 'override',
    });

    await installCommand.handler!({
      command: 'install',
      args: [],
      options: { ide: 'cursor', method: 'npx' },
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('already configured')
    );
    expect(process.exitCode).toBe(1);
  });

  it('runs successful install with spinner success path', async () => {
    const { installCommand, installOctocode, getInstallPreview, Spinner } =
      await loadDeps();

    vi.mocked(getInstallPreview).mockReturnValue({
      ...basePreview,
      action: 'create',
    });
    vi.mocked(installOctocode).mockReturnValue({
      success: true,
      configPath: '/mock/mcp.json',
    });

    await installCommand.handler!({
      command: 'install',
      args: [],
      options: { ide: 'cursor', method: 'npx' },
    });

    const spinnerInst = vi.mocked(Spinner).mock.results[0]?.value as {
      succeed: ReturnType<typeof vi.fn>;
    };
    expect(spinnerInst?.succeed).toHaveBeenCalledWith('Installation complete!');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Config saved')
    );
    expect(process.exitCode).toBeUndefined();
  });

  it('handles install failure', async () => {
    const { installCommand, installOctocode, getInstallPreview, Spinner } =
      await loadDeps();

    vi.mocked(getInstallPreview).mockReturnValue({
      ...basePreview,
      action: 'create',
    });
    vi.mocked(installOctocode).mockReturnValue({
      success: false,
      configPath: '/mock/mcp.json',
      error: 'disk full',
    });

    await installCommand.handler!({
      command: 'install',
      args: [],
      options: { ide: 'cursor', method: 'npx' },
    });

    const spinnerInst = vi.mocked(Spinner).mock.results[0]?.value as {
      fail: ReturnType<typeof vi.fn>;
    };
    expect(spinnerInst?.fail).toHaveBeenCalledWith('Installation failed');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('disk full')
    );
    expect(process.exitCode).toBe(1);
  });

  it('handles install failure without an error message', async () => {
    const { installCommand, installOctocode, getInstallPreview, Spinner } =
      await loadDeps();

    vi.mocked(getInstallPreview).mockReturnValue({
      ...basePreview,
      action: 'create',
    });
    vi.mocked(installOctocode).mockReturnValue({
      success: false,
      configPath: '/mock/mcp.json',
    });

    await installCommand.handler!({
      command: 'install',
      args: [],
      options: { ide: 'cursor', method: 'npx' },
    });

    const spinnerInst = vi.mocked(Spinner).mock.results[0]?.value as {
      fail: ReturnType<typeof vi.fn>;
    };
    expect(spinnerInst?.fail).toHaveBeenCalledWith('Installation failed');
    expect(process.exitCode).toBe(1);
  });

  it('prints backup path when install succeeds with backup', async () => {
    const { installCommand, installOctocode, getInstallPreview } =
      await loadDeps();

    vi.mocked(getInstallPreview).mockReturnValue({
      ...basePreview,
      action: 'override',
    });
    vi.mocked(installOctocode).mockReturnValue({
      success: true,
      configPath: '/mock/mcp.json',
      backupPath: '/mock/mcp.json.bak',
    });

    await installCommand.handler!({
      command: 'install',
      args: [],
      options: {
        ide: 'cursor',
        method: 'npx',
        force: true,
      },
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('/mock/mcp.json.bak')
    );
    expect(process.exitCode).toBeUndefined();
  });

  it('does not check node/npm when method is direct', async () => {
    const {
      installCommand,
      checkNodeInPath,
      checkNpmInPath,
      installOctocode,
      getInstallPreview,
    } = await loadDeps();

    vi.mocked(checkNodeInPath).mockReturnValue({
      installed: false,
      version: null,
    });
    vi.mocked(checkNpmInPath).mockReturnValue({
      installed: false,
      version: null,
    });
    vi.mocked(getInstallPreview).mockReturnValue({
      ...basePreview,
      method: 'direct',
      action: 'create',
    });
    vi.mocked(installOctocode).mockReturnValue({
      success: true,
      configPath: '/path',
    });

    await installCommand.handler!({
      command: 'install',
      args: [],
      options: { ide: 'cursor', method: 'direct' },
    });

    expect(process.exitCode).toBeUndefined();
    expect(installOctocode).toHaveBeenCalled();
  });
});
