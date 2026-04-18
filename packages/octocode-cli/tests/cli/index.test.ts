import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('LOCAL_TOOL_NAMES sync with local-tool-command TOOL_DEFINITIONS', () => {
  it('index.ts LOCAL_TOOL_NAMES matches the 4 local tools in local-tool-command.ts', async () => {
    const indexSource = await import('node:fs/promises').then(fs =>
      fs.readFile(new URL('../../src/cli/index.ts', import.meta.url), 'utf8')
    );

    const setMatch = indexSource.match(
      /const LOCAL_TOOL_NAMES\s*=\s*new Set\(\[([\s\S]*?)\]\)/
    );
    expect(setMatch).not.toBeNull();

    const names = [...setMatch![1].matchAll(/'([^']+)'/g)].map(m => m[1]);
    expect(names.sort()).toEqual([
      'localFindFiles',
      'localGetFileContent',
      'localSearchCode',
      'localViewStructure',
    ]);
  });
});

const mocks = vi.hoisted(() => ({
  findCommand: vi.fn(),
  showHelp: vi.fn(),
  showCommandHelp: vi.fn(),
  showToolHelp: vi.fn(),
  findStaticToolHelp: vi.fn(),
  showStaticToolHelp: vi.fn(),
  findStaticCommandHelp: vi.fn(),
  showStaticCommandHelp: vi.fn(),
  findAgentCommandSpec: vi.fn(),
  toAgentHelpCommand: vi.fn(),
  executeToolCommand: vi.fn().mockResolvedValue(true),
  executeLocalToolCommand: vi.fn().mockResolvedValue(true),
  printToolsContext: vi.fn().mockResolvedValue(undefined),
  findAgentCommand: vi.fn(),
}));

vi.mock('../../src/cli/commands.js', () => ({
  findCommand: mocks.findCommand,
}));

vi.mock('../../src/cli/help.js', () => ({
  showCommandHelp: mocks.showCommandHelp,
}));

vi.mock('../../src/cli/main-help.js', () => ({
  showHelp: mocks.showHelp,
}));

vi.mock('../../src/cli/command-help-specs.js', () => ({
  findStaticCommandHelp: mocks.findStaticCommandHelp,
  showStaticCommandHelp: mocks.showStaticCommandHelp,
}));

vi.mock('../../src/cli/agent-command-specs.js', () => ({
  AGENT_SUBCOMMAND_NAMES: new Set([
    'search-code',
    'get-file',
    'view-structure',
    'search-repos',
    'search-prs',
    'package-search',
  ]),
  findAgentCommandSpec: mocks.findAgentCommandSpec,
  toAgentHelpCommand: mocks.toAgentHelpCommand,
}));

vi.mock('../../src/cli/tool-command.js', () => ({
  showToolHelp: mocks.showToolHelp,
  executeToolCommand: mocks.executeToolCommand,
  printToolsContext: mocks.printToolsContext,
}));

vi.mock('../../src/cli/local-tool-command.js', () => ({
  executeLocalToolCommand: mocks.executeLocalToolCommand,
}));

vi.mock('../../src/cli/agent-commands.js', () => ({
  findAgentCommand: mocks.findAgentCommand,
  agentCommands: [],
}));

vi.mock('../../src/cli/tool-help-specs.js', () => ({
  findStaticToolHelp: mocks.findStaticToolHelp,
  showStaticToolHelp: mocks.showStaticToolHelp,
}));

describe('runCLI', () => {
  let originalExitCode: typeof process.exitCode;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.findStaticToolHelp.mockReturnValue(undefined);
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    consoleSpy.mockRestore();
  });

  it('handles --tools-context before command dispatch', async () => {
    const { runCLI } = await import('../../src/cli/index.js');

    const handled = await runCLI(['--tools-context']);

    expect(handled).toBe(true);
    expect(mocks.printToolsContext).toHaveBeenCalledTimes(1);
    expect(mocks.findCommand).not.toHaveBeenCalled();
  });

  it('routes top-level local --tool usage through the local tool executor', async () => {
    const { runCLI } = await import('../../src/cli/index.js');

    const handled = await runCLI([
      '--tool',
      'localSearchCode',
      '{"path":".","pattern":"runCLI"}',
    ]);

    expect(handled).toBe(true);
    expect(mocks.executeLocalToolCommand).toHaveBeenCalledTimes(1);
    expect(mocks.executeLocalToolCommand).toHaveBeenCalledWith({
      command: 'tool',
      args: ['localSearchCode', '{"path":".","pattern":"runCLI"}'],
      options: {
        tool: 'localSearchCode',
      },
    });
    expect(mocks.executeToolCommand).not.toHaveBeenCalled();
    expect(mocks.findCommand).not.toHaveBeenCalled();
  });

  it('routes github tool usage through the shared tool executor with parsed JSON input', async () => {
    const { runCLI } = await import('../../src/cli/index.js');

    const handled = await runCLI([
      '--tool',
      'githubSearchCode',
      '{"owner":"bgauryy","repo":"octocode-mcp","keywordsToSearch":["tool"]}',
      '--output',
      'json',
    ]);

    expect(handled).toBe(true);
    expect(mocks.executeToolCommand).toHaveBeenCalledTimes(1);
    expect(mocks.executeToolCommand).toHaveBeenCalledWith({
      command: 'tool',
      args: [
        'githubSearchCode',
        '{"owner":"bgauryy","repo":"octocode-mcp","keywordsToSearch":["tool"]}',
      ],
      options: {
        tool: 'githubSearchCode',
        output: 'json',
      },
    });
    expect(mocks.findCommand).not.toHaveBeenCalled();
  });

  it('shows static tool help for supported top-level --tool --help usage', async () => {
    const spec = { name: 'localSearchCode' };
    mocks.findStaticToolHelp.mockReturnValue(spec);

    const { runCLI } = await import('../../src/cli/index.js');

    const handled = await runCLI(['--tool', 'localSearchCode', '--help']);

    expect(handled).toBe(true);
    expect(mocks.findStaticToolHelp).toHaveBeenCalledTimes(1);
    expect(mocks.findStaticToolHelp).toHaveBeenCalledWith('localSearchCode');
    expect(mocks.showStaticToolHelp).toHaveBeenCalledTimes(1);
    expect(mocks.showStaticToolHelp).toHaveBeenCalledWith(spec);
    expect(mocks.showToolHelp).not.toHaveBeenCalled();
    expect(mocks.executeToolCommand).not.toHaveBeenCalled();
    expect(mocks.findCommand).not.toHaveBeenCalled();
  });

  it('falls back to dynamic tool help for unsupported --tool --help usage', async () => {
    mocks.showToolHelp.mockResolvedValue(true);

    const { runCLI } = await import('../../src/cli/index.js');

    const handled = await runCLI(['--tool', 'lspGotoDefinition', '--help']);

    expect(handled).toBe(true);
    expect(mocks.findStaticToolHelp).toHaveBeenCalledTimes(1);
    expect(mocks.findStaticToolHelp).toHaveBeenCalledWith('lspGotoDefinition');
    expect(mocks.showStaticToolHelp).not.toHaveBeenCalled();
    expect(mocks.showToolHelp).toHaveBeenCalledTimes(1);
    expect(mocks.showToolHelp).toHaveBeenCalledWith('lspGotoDefinition');
    expect(mocks.executeToolCommand).not.toHaveBeenCalled();
  });

  it('rejects the legacy tool command and points users to --tool', async () => {
    const { runCLI } = await import('../../src/cli/index.js');

    const handled = await runCLI([
      'tool',
      'localSearchCode',
      '{"path":".","pattern":"runCLI"}',
    ]);

    expect(handled).toBe(true);
    expect(mocks.executeToolCommand).not.toHaveBeenCalled();
    expect(mocks.findCommand).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Use octocode-cli --tool')
    );
    expect(process.exitCode).toBe(1);
  });

  it('shows main help when --help is passed without a command', async () => {
    const { runCLI } = await import('../../src/cli/index.js');

    const handled = await runCLI(['--help']);

    expect(handled).toBe(true);
    expect(mocks.showHelp).toHaveBeenCalledTimes(1);
    expect(mocks.showCommandHelp).not.toHaveBeenCalled();
  });

  it('shows main help for "tool --help" (from main-help, not help module)', async () => {
    const { runCLI } = await import('../../src/cli/index.js');

    const handled = await runCLI(['tool', '--help']);

    expect(handled).toBe(true);
    expect(mocks.showHelp).toHaveBeenCalledTimes(1);
    expect(mocks.showCommandHelp).not.toHaveBeenCalled();
  });

  it('shows agent command help for "search-code --help"', async () => {
    const fakeSpec = { name: 'search-code', tool: 'githubSearchCode' };
    const fakeHelpCmd = { name: 'search-code', description: 'Search code' };
    mocks.findStaticCommandHelp.mockReturnValue(undefined);
    mocks.findAgentCommandSpec.mockReturnValue(fakeSpec);
    mocks.toAgentHelpCommand.mockReturnValue(fakeHelpCmd);

    const { runCLI } = await import('../../src/cli/index.js');

    const handled = await runCLI(['search-code', '--help']);

    expect(handled).toBe(true);
    expect(mocks.findAgentCommandSpec).toHaveBeenCalledWith('search-code');
    expect(mocks.toAgentHelpCommand).toHaveBeenCalledWith(fakeSpec);
    expect(mocks.showCommandHelp).toHaveBeenCalledWith(fakeHelpCmd);
  });

  it('falls through to main help for unknown command --help', async () => {
    mocks.findStaticCommandHelp.mockReturnValue(undefined);
    mocks.findCommand.mockReturnValue(undefined);

    const { runCLI } = await import('../../src/cli/index.js');

    const handled = await runCLI(['nonexistent', '--help']);

    expect(handled).toBe(true);
    expect(mocks.showHelp).toHaveBeenCalledTimes(1);
  });

  it('shows static command help for "install --help"', async () => {
    const fakeCmd = { name: 'install', description: 'Configure octocode-mcp' };
    mocks.findStaticCommandHelp.mockReturnValue(fakeCmd);

    const { runCLI } = await import('../../src/cli/index.js');

    const handled = await runCLI(['install', '--help']);

    expect(handled).toBe(true);
    expect(mocks.findStaticCommandHelp).toHaveBeenCalledWith('install');
    expect(mocks.showStaticCommandHelp).toHaveBeenCalledWith(fakeCmd);
    expect(mocks.showCommandHelp).not.toHaveBeenCalled();
    expect(mocks.findCommand).not.toHaveBeenCalled();
  });

  it('shows dynamic command help when static lookup misses but findCommand hits', async () => {
    const fakeCmd = { name: 'cache', description: 'Manage cache' };
    mocks.findStaticCommandHelp.mockReturnValue(undefined);
    mocks.findCommand.mockReturnValue(fakeCmd);

    const { runCLI } = await import('../../src/cli/index.js');

    const handled = await runCLI(['cache', '--help']);

    expect(handled).toBe(true);
    expect(mocks.showCommandHelp).toHaveBeenCalledWith(fakeCmd);
    expect(mocks.showHelp).not.toHaveBeenCalled();
  });

  it('prints version for --version flag', async () => {
    const { runCLI } = await import('../../src/cli/index.js');

    const handled = await runCLI(['--version']);

    expect(handled).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('octocode-cli v')
    );
    expect(mocks.findCommand).not.toHaveBeenCalled();
  });

  it('prints version for -v flag', async () => {
    const { runCLI } = await import('../../src/cli/index.js');

    const handled = await runCLI(['-v']);

    expect(handled).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('octocode-cli v')
    );
  });

  it('returns false when no command is given (triggers interactive mode)', async () => {
    const { runCLI } = await import('../../src/cli/index.js');

    const handled = await runCLI([]);

    expect(handled).toBe(false);
    expect(mocks.findCommand).not.toHaveBeenCalled();
    expect(mocks.showHelp).not.toHaveBeenCalled();
  });

  it('prints error for unknown command and sets exitCode 1', async () => {
    mocks.findCommand.mockReturnValue(undefined);

    const { runCLI } = await import('../../src/cli/index.js');

    const handled = await runCLI(['nonexistent']);

    expect(handled).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Unknown command: nonexistent')
    );
    expect(process.exitCode).toBe(1);
  });

  it('sets exitCode 1 when local --tool execution fails', async () => {
    mocks.executeLocalToolCommand.mockResolvedValueOnce(false);

    const { runCLI } = await import('../../src/cli/index.js');

    const handled = await runCLI([
      '--tool',
      'localSearchCode',
      '{"bad":"input"}',
    ]);

    expect(handled).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('sets exitCode 1 when github --tool execution fails', async () => {
    mocks.executeToolCommand.mockResolvedValueOnce(false);

    const { runCLI } = await import('../../src/cli/index.js');

    const handled = await runCLI([
      '--tool',
      'githubSearchCode',
      '{"bad":"input"}',
    ]);

    expect(handled).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('routes to agent subcommand handler for known agent commands', async () => {
    const handlerMock = vi.fn().mockResolvedValue(undefined);
    mocks.findAgentCommand.mockReturnValue({
      name: 'search-code',
      description: 'Search code',
      handler: handlerMock,
    });

    const { runCLI } = await import('../../src/cli/index.js');

    const handled = await runCLI(['search-code', '--query', 'foo']);

    expect(handled).toBe(true);
    expect(mocks.findAgentCommand).toHaveBeenCalledWith('search-code');
    expect(handlerMock).toHaveBeenCalledTimes(1);
    expect(mocks.findCommand).not.toHaveBeenCalled();
  });

  it('prints deprecation warning when using --tool', async () => {
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { runCLI } = await import('../../src/cli/index.js');

    await runCLI([
      '--tool',
      'githubSearchCode',
      '{"owner":"x","repo":"y","keywordsToSearch":["a"]}',
    ]);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('--tool is deprecated')
    );
    consoleErrorSpy.mockRestore();
  });
});
