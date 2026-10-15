import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseArgs, pickInstance } from '../src/api/args.js';
import { registerApi } from '../src/api/register.js';
import { apiDir, type InstanceRecord } from '../src/api/registry.js';
import { Subcommands } from '../src/shared/commands.js';
import { fakeCtx, fakePi } from './fake-pi.js';
import { tmp } from './helpers.js';

const instance = (id: string, cwd = '/w'): InstanceRecord => ({ id, pid: 1, cwd, startedAt: 1, protocol: 1 });

describe('octocode-pi-api arguments', () => {
  it('reads value flags, boolean flags and words', () => {
    const { flags, words } = parseArgs(['--to', 'pi-1', 'fix', '--wait', 'the', '--mode', 'steer', 'tests']);
    expect(Object.fromEntries(flags)).toEqual({ to: 'pi-1', wait: true, mode: 'steer' });
    expect(words).toEqual(['fix', 'the', 'tests']);
  });

  it('refuses a value flag with no value instead of falling back to a default instance', () => {
    expect(() => parseArgs(['--to'])).toThrow('--to needs a value.');
    expect(() => parseArgs(['hello', '--from'])).toThrow('--from needs a value.');
    // The next flag is not a value.
    expect(() => parseArgs(['--to', '--wait'])).toThrow('--to needs a value.');
  });

  it('picks the named instance, else the only one, else the one in this directory', () => {
    const both = [instance('a', '/x'), instance('b', '/y')];
    expect(pickInstance(both, 'b', '/x').id).toBe('b');
    expect(pickInstance([instance('a')], undefined, '/elsewhere').id).toBe('a');
    expect(pickInstance(both, undefined, '/y').id).toBe('b');
    expect(() => pickInstance(both, undefined, '/z')).toThrow('No running instance matches');
    expect(() => pickInstance([instance('a'), instance('b')], undefined, '/w')).toThrow('Several instances match; pass --to <id>: a, b');
  });

  it('treats an empty --to as a name, not as no name', () => {
    expect(() => pickInstance([instance('a')], '', '/w')).toThrow('No running instance matches');
  });
});

describe('API start failure without a UI', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('says why the API is off on stderr, where a headless run can read it', async () => {
    vi.stubEnv('OCTOCODE_HOME', tmp('octo-api-headless-'));
    vi.stubEnv('OCTOCODE_API', '1');
    vi.stubEnv('OCTOCODE_API_HTTP', 'abc');
    fs.mkdirSync(apiDir(), { recursive: true });
    const { pi } = fakePi();
    const wired = registerApi(pi, new Subcommands(), { list: () => [], tell: () => ({ sent: [] }), deliverable: (text) => text }, () => '1.2.3');
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    try {
      const headless = fakeCtx({ cwd: tmp(), hasUI: false });
      await wired.start(headless);
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining('OCTOCODE_API_HTTP=abc is not a port'));
      expect(headless.ui.notes).toEqual([]);
      stderr.mockClear();
      const ui = fakeCtx({ cwd: tmp() });
      await wired.start(ui);
      expect(stderr).not.toHaveBeenCalled();
      expect(ui.ui.notes.at(-1)).toMatchObject({ type: 'warning' });
    } finally {
      stderr.mockRestore();
      await wired.stop();
    }
  });
});
