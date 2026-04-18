import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('main-help', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it('renders top-level help with agent tools and admin sections', async () => {
    const { showHelp } = await import('../../src/cli/main-help.js');
    showHelp();

    const output = stdoutSpy.mock.calls.map(c => String(c[0])).join('');
    expect(output).toContain('search-code');
    expect(output).toContain('get-file');
    expect(output).toContain('view-structure');
    expect(output).toContain('search-repos');
    expect(output).toContain('search-prs');
    expect(output).toContain('package-search');
    expect(output).toContain('install');
    expect(output).toContain('AGENT TOOLS');
    expect(output).toContain('SETUP & ADMIN');
    expect(output).toContain('OPTIONS');
    expect(output).toContain('EXAMPLES');
    expect(output).toContain('--tools-context');
    expect(output).toContain('--tool');
  });
});

describe('command-help-specs', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it('finds install command by name', async () => {
    const { findStaticCommandHelp } =
      await import('../../src/cli/command-help-specs.js');
    const cmd = findStaticCommandHelp('install');
    expect(cmd).toBeDefined();
    expect(cmd!.name).toBe('install');
  });

  it('finds install command by alias "setup"', async () => {
    const { findStaticCommandHelp } =
      await import('../../src/cli/command-help-specs.js');
    const cmd = findStaticCommandHelp('setup');
    expect(cmd).toBeDefined();
    expect(cmd!.name).toBe('install');
  });

  it('finds all expected static commands', async () => {
    const { findStaticCommandHelp } =
      await import('../../src/cli/command-help-specs.js');
    const names = [
      'install',
      'auth',
      'login',
      'logout',
      'skills',
      'token',
      'status',
      'sync',
      'mcp',
      'cache',
    ];
    for (const name of names) {
      expect(findStaticCommandHelp(name)).toBeDefined();
    }
  });

  it('returns undefined for unknown commands', async () => {
    const { findStaticCommandHelp } =
      await import('../../src/cli/command-help-specs.js');
    expect(findStaticCommandHelp('nonexistent')).toBeUndefined();
  });

  it('renders static command help with usage and options', async () => {
    const { findStaticCommandHelp, showStaticCommandHelp } =
      await import('../../src/cli/command-help-specs.js');
    const cmd = findStaticCommandHelp('install')!;
    showStaticCommandHelp(cmd);

    const output = stdoutSpy.mock.calls.map(c => String(c[0])).join('');
    expect(output).toContain('install');
    expect(output).toContain('USAGE');
    expect(output).toContain('OPTIONS');
    expect(output).toContain('--ide');
    expect(output).toContain('--method');
    expect(output).toContain('--force');
  });

  it('renders command without options cleanly', async () => {
    const { findStaticCommandHelp, showStaticCommandHelp } =
      await import('../../src/cli/command-help-specs.js');
    const cmd = findStaticCommandHelp('auth')!;
    showStaticCommandHelp(cmd);

    const output = stdoutSpy.mock.calls.map(c => String(c[0])).join('');
    expect(output).toContain('auth');
    expect(output).toContain('USAGE');
    expect(output).not.toContain('OPTIONS');
  });
});

describe('tool-help-specs', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it('finds localSearchCode help', async () => {
    const { findStaticToolHelp } =
      await import('../../src/cli/tool-help-specs.js');
    const spec = findStaticToolHelp('localSearchCode');
    expect(spec).toBeDefined();
    expect(spec!.name).toBe('localSearchCode');
  });

  it('finds githubSearchCode help', async () => {
    const { findStaticToolHelp } =
      await import('../../src/cli/tool-help-specs.js');
    const spec = findStaticToolHelp('githubSearchCode');
    expect(spec).toBeDefined();
  });

  it('finds packageSearch help', async () => {
    const { findStaticToolHelp } =
      await import('../../src/cli/tool-help-specs.js');
    const spec = findStaticToolHelp('packageSearch');
    expect(spec).toBeDefined();
  });

  it('returns undefined for unknown tool', async () => {
    const { findStaticToolHelp } =
      await import('../../src/cli/tool-help-specs.js');
    expect(findStaticToolHelp('nonexistent')).toBeUndefined();
  });

  it('renders static tool help with required/optional/example', async () => {
    const { findStaticToolHelp, showStaticToolHelp } =
      await import('../../src/cli/tool-help-specs.js');
    const spec = findStaticToolHelp('localSearchCode')!;
    showStaticToolHelp(spec);

    const output = stdoutSpy.mock.calls.map(c => String(c[0])).join('');
    expect(output).toContain('localSearchCode');
    expect(output).toContain('Required');
    expect(output).toContain('Optional');
    expect(output).toContain('Auto-filled');
    expect(output).toContain('Example');
    expect(output).toContain('--tool localSearchCode');
  });

  it('renders tool help without optional field when absent', async () => {
    const { findStaticToolHelp, showStaticToolHelp } =
      await import('../../src/cli/tool-help-specs.js');
    const spec = findStaticToolHelp('packageSearch')!;
    showStaticToolHelp(spec);

    const output = stdoutSpy.mock.calls.map(c => String(c[0])).join('');
    expect(output).toContain('packageSearch');
    expect(output).not.toContain('Optional');
  });
});

describe('help (dynamic fallback)', () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it('renders dynamic command help with usage and options', async () => {
    const { showCommandHelp } = await import('../../src/cli/help.js');
    showCommandHelp({
      name: 'test-cmd',
      description: 'A test command',
      usage: 'octocode test-cmd --flag',
      options: [
        {
          name: 'flag',
          short: 'f',
          description: 'A flag',
          hasValue: true,
          default: 'yes',
        },
        { name: 'bool', description: 'Boolean flag' },
      ],
    });

    const output = stdoutSpy.mock.calls.map(c => String(c[0])).join('');
    expect(output).toContain('test-cmd');
    expect(output).toContain('A test command');
    expect(output).toContain('USAGE');
    expect(output).toContain('octocode-cli test-cmd --flag');
    expect(output).toContain('OPTIONS');
    expect(output).toContain('-f, --flag');
    expect(output).toContain('(default: yes)');
  });
});
