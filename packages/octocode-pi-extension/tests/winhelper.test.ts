import { spawn, spawnSync, type ChildProcess, type SpawnOptions } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { WindowsHelper, classifyPowerShell, windowsTree, type HelperOptions } from '../src/shared/winhelper.js';
import { WINDOWS_HELPER_SCRIPT } from '../src/shared/winhelper-script.js';
import { tmp } from './helpers.js';

const fake = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake-win-helper.mjs');
const helpers: WindowsHelper[] = [];

interface Rig {
  helper: WindowsHelper;
  /** `[shell, args]` of every spawn. */
  spawned: Array<[string, string[]]>;
  /** Request lines the fake helper received, and `stdin-closed`. */
  lines: () => string[];
}

/** A client whose helper is the fake program in `mode`; `broken` names shells that do not exist. */
function rig(mode = 'ok', options: HelperOptions & { broken?: string[] } = {}): Rig {
  const log = path.join(tmp(), 'log');
  const spawned: Array<[string, string[]]> = [];
  const { broken = [], ...rest } = options;
  const helper = new WindowsHelper({
    platform: () => 'win32',
    shells: ['pwsh', 'powershell.exe'],
    spawn: (command: string, args: string[], spawnOptions: SpawnOptions): ChildProcess => {
      spawned.push([command, args]);
      return spawn(broken.includes(command) ? path.join(path.dirname(log), 'missing-shell') : process.execPath, [fake], { ...spawnOptions, env: { ...process.env, FAKE_MODE: mode, FAKE_LOG: log } });
    },
    ...rest,
  });
  helpers.push(helper);
  return { helper, spawned, lines: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : []) };
}

afterEach(async () => {
  await Promise.all(helpers.splice(0).map((helper) => helper.stopAll()));
});

const waitFor = async (condition: () => boolean): Promise<void> => {
  for (let tries = 0; !condition() && tries < 200; tries++) await new Promise((resolve) => setTimeout(resolve, 25));
  expect(condition()).toBe(true);
};

describe('the helper script', () => {
  it('creates jobs that kill their processes on close, with no limit that lets a process leave', () => {
    expect(WINDOWS_HELPER_SCRIPT).toMatch(/JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;/);
    expect(WINDOWS_HELPER_SCRIPT).toMatch(/limits\.Basic\.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;/);
    // The only flag ever put in LimitFlags is that one.
    expect([...WINDOWS_HELPER_SCRIPT.matchAll(/LimitFlags\s*[|]?=\s*([^;]+);/g)].map((match) => match[1])).toEqual(['JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE']);
    expect(WINDOWS_HELPER_SCRIPT).not.toMatch(/breakaway/i);
    expect(WINDOWS_HELPER_SCRIPT).not.toMatch(/0x0800|0x1000/);
  });

  it('assigns by pid, terminates a job, and parses with the PowerShell parser', () => {
    expect(WINDOWS_HELPER_SCRIPT).toContain('AssignProcessToJobObject(job, process)');
    expect(WINDOWS_HELPER_SCRIPT).toContain('TerminateJobObject(job, 1)');
    expect(WINDOWS_HELPER_SCRIPT).toContain('[System.Management.Automation.Language.Parser]::ParseInput(');
  });

  it('is a template literal without backticks or interpolation, and fits a command line as -EncodedCommand', () => {
    expect(WINDOWS_HELPER_SCRIPT).not.toContain('`');
    // Windows limits a command line to 32767 characters; UTF-16 base64 is 8/3 characters per script character.
    expect(Math.ceil((WINDOWS_HELPER_SCRIPT.length * 8) / 3)).toBeLessThan(30_000);
  });

  it('answers one JSON line per request and keeps stdout to those lines', () => {
    expect(WINDOWS_HELPER_SCRIPT).toContain('ConvertTo-Json -InputObject $response -Compress');
    expect(WINDOWS_HELPER_SCRIPT).not.toMatch(/Write-Host|Write-Output/);
  });
});

describe('WindowsHelper', () => {
  it('starts nothing until first used, then one helper for every call, with the encoded script', async () => {
    const { helper, spawned } = rig();
    expect(spawned).toEqual([]);
    expect(helper.owns(100)).toBe(false);
    const [first, second] = await Promise.all([helper.assign(100), helper.assign(200)]);
    expect([first, second]).toEqual([true, true]);
    await helper.assign(300);
    expect(spawned).toHaveLength(1);
    const [shell, args] = spawned[0]!;
    expect(shell).toBe('pwsh');
    expect(args.slice(0, 4)).toEqual(['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand']);
    expect(Buffer.from(args[4]!, 'base64').toString('utf16le')).toBe(WINDOWS_HELPER_SCRIPT);
  });

  it('assigns, owns, and kills a job once', async () => {
    const { helper, lines } = rig();
    const assigning = helper.assign(4242);
    expect(helper.owns(4242)).toBe(true);
    expect(await assigning).toBe(true);
    expect(helper.owns(4242)).toBe(true);
    expect(await helper.kill(4242)).toBe(true);
    expect(helper.owns(4242)).toBe(false);
    expect(await helper.kill(4242)).toBe(false);
    expect(lines().map((line) => JSON.parse(line))).toEqual([
      { id: 1, cmd: 'assign', pid: 4242 },
      { id: 2, cmd: 'kill', pid: 4242 },
    ]);
  });

  it('lets a kill wait for the assignment still in flight', async () => {
    const { helper } = rig();
    void helper.assign(7);
    expect(await helper.kill(7)).toBe(true);
  });

  it('refuses bad pids and a pid without a job, without starting a helper', async () => {
    const { helper, spawned } = rig();
    for (const pid of [undefined, 0, 1, -5, 1.5, Number.NaN]) {
      expect(await helper.assign(pid)).toBe(false);
      expect(await helper.kill(pid)).toBe(false);
      expect(helper.owns(pid)).toBe(false);
    }
    expect(await helper.kill(99)).toBe(false);
    expect(spawned).toEqual([]);
  });

  it('has no jobs off Windows but still parses', async () => {
    const { helper, spawned } = rig('ok', { platform: () => 'darwin' });
    expect(await helper.assign(500)).toBe(false);
    expect(helper.owns(500)).toBe(false);
    expect(spawned).toEqual([]);
    expect(await helper.parse('[{"name":"ls","args":[]}]')).toEqual([{ name: 'ls', args: [] }]);
    expect(spawned).toHaveLength(1);
  });

  it('reports a kill the helper refuses as false, and no longer owns the pid', async () => {
    const { helper } = rig('refuse');
    await helper.assign(9);
    expect(await helper.kill(9)).toBe(false);
    expect(helper.owns(9)).toBe(false);
  });

  it('returns the commands of a script that parses, and undefined for one that does not or has a bad shape', async () => {
    const { helper } = rig();
    expect(await helper.parse('[{"name":"Get-ChildItem","args":[{"text":"-Force","param":"Force"}]},{"name":null,"args":[]}]')).toEqual([
      { name: 'Get-ChildItem', args: [{ text: '-Force', param: 'Force' }] },
      { name: null, args: [] },
    ]);
    expect(await helper.parse('{ not a script')).toBeUndefined();
    expect(await helper.parse('{"name":"x"}')).toBeUndefined();
    expect(await helper.parse('[{"name":5,"args":[]}]')).toBeUndefined();
    expect(await helper.parse('[1]')).toBeUndefined();
  });

  it('ignores stray output lines around its answers', async () => {
    const { helper } = rig('junk');
    expect(await helper.assign(11)).toBe(true);
    expect(await helper.parse('[]')).toEqual([]);
  });

  it('falls back to the next shell when the first does not start', async () => {
    const { helper, spawned } = rig('ok', { broken: ['pwsh'] });
    expect(await helper.assign(21)).toBe(true);
    expect(spawned.map(([shell]) => shell)).toEqual(['pwsh', 'powershell.exe']);
  });

  it('falls back when the first shell exits before it is ready', async () => {
    const modes = ['noready', 'ok'];
    const spawned: string[] = [];
    const helper = new WindowsHelper({
      platform: () => 'win32',
      shells: ['pwsh', 'powershell.exe'],
      spawn: (command, _args, options) => {
        spawned.push(command);
        return spawn(process.execPath, [fake], { ...options, env: { ...process.env, FAKE_MODE: modes.shift() ?? 'ok' } });
      },
    });
    helpers.push(helper);
    expect(await helper.assign(22)).toBe(true);
    expect(spawned).toEqual(['pwsh', 'powershell.exe']);
  });

  it('fails closed when no shell starts, and does not retry until stopAll', async () => {
    const { helper, spawned } = rig('ok', { broken: ['pwsh', 'powershell.exe'] });
    expect(await helper.start()).toBe(false);
    expect(await helper.assign(31)).toBe(false);
    expect(await helper.parse('[]')).toBeUndefined();
    expect(await helper.kill(31)).toBe(false);
    expect(spawned).toHaveLength(2);
    await helper.stopAll();
    expect(await helper.start()).toBe(false);
    expect(spawned).toHaveLength(4);
  });

  it('fails closed when a spawn throws or hands back no pipes', async () => {
    const throwing = new WindowsHelper({ platform: () => 'win32', shells: ['pwsh'], spawn: () => { throw new Error('EACCES'); } });
    expect(await throwing.start()).toBe(false);
    const piped = new WindowsHelper({ platform: () => 'win32', shells: ['pwsh'], spawn: (_command, _args, options) => spawn(process.execPath, ['-e', 'setTimeout(() => undefined, 5000)'], { ...options, stdio: 'ignore' }) });
    expect(await piped.start()).toBe(false);
  });

  it('gives up on a helper that never says ready', async () => {
    const { helper } = rig('hang', { startupMs: 150, shells: ['pwsh'] });
    expect(await helper.parse('[]')).toBeUndefined();
  });

  it('fails a request the helper never answers, and keeps the helper', async () => {
    const { helper, spawned } = rig('silent', { requestMs: 100 });
    expect(await helper.assign(41)).toBe(false);
    expect(await helper.parse('[]')).toBeUndefined();
    expect(spawned).toHaveLength(1);
  });

  it('fails the request in flight when the helper dies, forgets its jobs, and starts a new helper for the next call', async () => {
    const { helper, spawned } = rig();
    expect(await helper.assign(51)).toBe(true);
    expect(await helper.parse('die')).toBeUndefined();
    expect(helper.owns(51)).toBe(false);
    expect(await helper.kill(51)).toBe(false);
    expect(await helper.assign(52)).toBe(true);
    expect(spawned).toHaveLength(2);
  });

  it('fails an assignment when the helper dies on it', async () => {
    const { helper, spawned } = rig('crash');
    expect(await helper.assign(53)).toBe(false);
    expect(helper.owns(53)).toBe(false);
    expect(await helper.assign(54)).toBe(false);
    expect(spawned).toHaveLength(2);
  });

  it('exits when its stdin closes, and starts a new helper afterwards', async () => {
    const { helper, spawned, lines } = rig();
    await helper.assign(71);
    await helper.stopAll();
    expect(lines()).toContain('stdin-closed');
    expect(helper.owns(71)).toBe(false);
    expect(await helper.assign(72)).toBe(true);
    expect(spawned).toHaveLength(2);
    await helper.stopAll();
    await helper.stopAll();
  });

  it('kills a helper that outlives its stdin closing', async () => {
    const hanging = new WindowsHelper({
      platform: () => 'win32',
      shells: ['pwsh'],
      stopMs: 100,
      spawn: (_command, _args, options) =>
        spawn(process.execPath, ['-e', 'process.stdout.write("{\\"ready\\":true}\\n"); process.stdin.resume(); process.stdin.on("end", () => setInterval(() => undefined, 1000));'], options),
    });
    helpers.push(hanging);
    expect(await hanging.start()).toBe(true);
    const started = Date.now();
    await hanging.stopAll();
    expect(Date.now() - started).toBeLessThan(2500);
  });

  it('stops a helper that is still starting', async () => {
    const { helper, lines } = rig();
    const starting = helper.start();
    await helper.stopAll();
    expect(await starting).toBe(true);
    expect(lines()).toContain('stdin-closed');
  });

  it('reads responses split across chunks', async () => {
    const { helper } = rig();
    const big = JSON.stringify(Array.from({ length: 2000 }, (_, at) => ({ name: `cmd${at}`, args: [{ text: 'x'.repeat(50) }] })));
    expect(await helper.parse(big)).toHaveLength(2000);
  });

  it('sends requests only after the helper is ready, in order, with distinct ids', async () => {
    const { helper, lines } = rig();
    await Promise.all([helper.assign(81), helper.assign(82), helper.parse('[]')]);
    await waitFor(() => lines().length === 3);
    expect(lines().map((line) => JSON.parse(line).id)).toEqual([1, 2, 3]);
  });
});

describe('classifyPowerShell', () => {
  it('asks the helper to parse and classifies what it returns', async () => {
    const { helper } = rig();
    const remove = JSON.stringify([{ name: 'rm', args: [{ param: 'r', text: '-r' }, { param: 'fo', text: '-fo' }, { text: 'C:\\x', value: 'C:\\x' }] }]);
    expect(await classifyPowerShell(remove, helper)).toEqual({ destructive: 'Remove-Item -Recurse -Force on C:\\x', parsed: true });
    expect(await classifyPowerShell(JSON.stringify([{ name: 'Get-ChildItem', args: [] }]), helper)).toEqual({ parsed: true });
  });

  it('is unparsed when the script does not parse', async () => {
    const { helper } = rig();
    expect(await classifyPowerShell('Get-ChildItem |', helper)).toEqual({ parsed: false });
  });

  it('is unparsed when no PowerShell is available', async () => {
    const { helper } = rig('ok', { broken: ['pwsh', 'powershell.exe'] });
    expect(await classifyPowerShell('Remove-Item -Recurse C:\\x', helper)).toEqual({ parsed: false });
  });

  it('uses the shared helper by default, which has no PowerShell on this machine unless one is installed', async () => {
    expect(typeof (await classifyPowerShell('Get-ChildItem')).parsed).toBe('boolean');
    await windowsTree.stopAll();
  });
});

const hasPwsh = spawnSync('pwsh', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.Major'], { encoding: 'utf8' }).status === 0;

describe.skipIf(!hasPwsh)('the real PowerShell helper', () => {
  const real = () => {
    const helper = new WindowsHelper({ platform: () => 'win32', shells: ['pwsh'] });
    helpers.push(helper);
    return helper;
  };

  it.each([
    ['rm -r -fo C:\\x'],
    ['Remove-Item -Recurse -Force C:\\'],
    ['pwsh -Command "Remove-Item -Recurse C:\\x"'],
    [`pwsh -NoProfile -EncodedCommand ${Buffer.from('Remove-Item -Recurse -Force C:\\x', 'utf16le').toString('base64')}`],
    ['Get-ChildItem | ForEach-Object { rm -r -fo C:\\x }'],
    ['cmd /c "rd /s /q C:\\x"'],
    ['Format-Volume -DriveLetter D'],
    ['iex "Remove-Item -Recurse C:\\x"'],
  ])('flags %s', async (command) => {
    const result = await classifyPowerShell(command, real());
    expect(result.parsed).toBe(true);
    expect(result.destructive).toBeDefined();
  }, 60_000);

  it.each([['Get-ChildItem'], ['Get-ChildItem -Recurse -Force | Select-Object -First 3'], ['Remove-Item .\\build\\out.txt'], ['pwsh -Command "Get-Date"'], ['Write-Output "it\'s fine"']])('does not flag %s', async (command) => {
    expect(await classifyPowerShell(command, real())).toEqual({ parsed: true });
  }, 60_000);

  it('does not parse a script with a syntax error', async () => {
    expect(await classifyPowerShell('Remove-Item -Recurse (', real())).toEqual({ parsed: false });
  }, 60_000);
});
