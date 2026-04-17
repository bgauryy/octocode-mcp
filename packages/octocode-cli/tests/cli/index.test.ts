import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findCommand: vi.fn(),
  showHelp: vi.fn(),
  showCommandHelp: vi.fn(),
  showVersion: vi.fn(),
  showToolHelp: vi.fn(),
  findStaticToolHelp: vi.fn(),
  showStaticToolHelp: vi.fn(),
  executeToolCommand: vi.fn().mockResolvedValue(true),
  printToolsContext: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../src/cli/commands.js', () => ({
  findCommand: mocks.findCommand,
}));

vi.mock('../../src/cli/help.js', () => ({
  showHelp: mocks.showHelp,
  showCommandHelp: mocks.showCommandHelp,
  showVersion: mocks.showVersion,
}));

vi.mock('../../src/cli/tool-command.js', () => ({
  showToolHelp: mocks.showToolHelp,
  executeToolCommand: mocks.executeToolCommand,
  printToolsContext: mocks.printToolsContext,
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

  it('routes top-level --tool usage through the shared tool executor', async () => {
    const { runCLI } = await import('../../src/cli/index.js');

    const handled = await runCLI([
      '--tool',
      'localSearchCode',
      '{"path":".","pattern":"runCLI"}',
    ]);

    expect(handled).toBe(true);
    expect(mocks.executeToolCommand).toHaveBeenCalledTimes(1);
    expect(mocks.executeToolCommand).toHaveBeenCalledWith({
      command: 'tool',
      args: ['localSearchCode', '{"path":".","pattern":"runCLI"}'],
      options: {
        tool: 'localSearchCode',
      },
    });
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
});
