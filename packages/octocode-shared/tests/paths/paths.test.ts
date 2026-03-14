import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync } from 'node:fs';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

describe('paths', () => {
  const originalHome = process.env.OCTOCODE_HOME;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(false);
    vi.resetModules();
  });

  afterEach(() => {
    if (originalHome === undefined) {
      delete process.env.OCTOCODE_HOME;
    } else {
      process.env.OCTOCODE_HOME = originalHome;
    }
  });

  it('uses default ~/.octocode when OCTOCODE_HOME is not set', async () => {
    delete process.env.OCTOCODE_HOME;
    const mod = await import('../../src/paths.js');

    expect(mod.paths.home).toContain('.octocode');
    expect(mod.paths.config).toContain('.octocoderc');
    expect(mod.paths.credentials).toContain('credentials.json');
    expect(mod.paths.repos).toContain('repos');
    expect(mod.paths.logs).toContain('logs');
    expect(mod.paths.lspConfig).toContain('lsp-servers.json');
  });

  it('respects OCTOCODE_HOME override', async () => {
    process.env.OCTOCODE_HOME = '/tmp/custom-octocode-home';
    const mod = await import('../../src/paths.js');

    expect(mod.paths.home).toBe('/tmp/custom-octocode-home');
    expect(mod.paths.config).toBe('/tmp/custom-octocode-home/.octocoderc');
    expect(mod.paths.cliConfig).toBe('/tmp/custom-octocode-home/config.json');
  });

  it('ensureHome creates home with 0o700', async () => {
    const mod = await import('../../src/paths.js');
    mod.ensureHome();

    expect(mkdirSync).toHaveBeenCalledWith(mod.paths.home, {
      recursive: true,
      mode: 0o700,
    });
  });

  it('ensureRepos creates repos with 0o700', async () => {
    const mod = await import('../../src/paths.js');
    mod.ensureRepos();

    expect(mkdirSync).toHaveBeenCalledWith(mod.paths.home, {
      recursive: true,
      mode: 0o700,
    });
    expect(mkdirSync).toHaveBeenCalledWith(mod.paths.repos, {
      recursive: true,
      mode: 0o700,
    });
  });

  it('ensureLogs creates logs with 0o700', async () => {
    const mod = await import('../../src/paths.js');
    mod.ensureLogs();

    expect(mkdirSync).toHaveBeenCalledWith(mod.paths.home, {
      recursive: true,
      mode: 0o700,
    });
    expect(mkdirSync).toHaveBeenCalledWith(mod.paths.logs, {
      recursive: true,
      mode: 0o700,
    });
  });

  it('ensureHome does NOT call mkdirSync when directory already exists', async () => {
    vi.mocked(existsSync).mockReturnValue(true);
    const mod = await import('../../src/paths.js');
    mod.ensureHome();

    expect(mkdirSync).not.toHaveBeenCalled();
  });

  it('ensureHome DOES call mkdirSync when directory does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false);
    const mod = await import('../../src/paths.js');
    mod.ensureHome();

    expect(mkdirSync).toHaveBeenCalledWith(mod.paths.home, {
      recursive: true,
      mode: 0o700,
    });
  });
});
