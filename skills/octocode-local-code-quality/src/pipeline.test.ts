import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import * as cache from './cache.js';
import * as cli from './cli.js';
import * as discovery from './discovery.js';
import { main } from './pipeline.js';
import { DEFAULT_OPTS } from './types.js';

function makeOptions(overrides: Partial<typeof DEFAULT_OPTS> = {}) {
  return {
    ...DEFAULT_OPTS,
    ...overrides,
  };
}

describe('pipeline main', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clears cache and returns early when clearCache is enabled', async () => {
    const opts = makeOptions({ clearCache: true, root: '/tmp/repo' });
    const parseSpy = vi.spyOn(cli, 'parseArgs').mockReturnValue(opts);
    const clearSpy = vi.spyOn(cache, 'clearCache').mockImplementation(() => {});
    const listSpy = vi.spyOn(discovery, 'listWorkspacePackages');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await main();

    expect(parseSpy).toHaveBeenCalledTimes(1);
    expect(clearSpy).toHaveBeenCalledWith('/tmp/repo');
    expect(errSpy).toHaveBeenCalledWith('Cache cleared.');
    expect(listSpy).not.toHaveBeenCalled();
  });

  it('exits when no packages and no root package.json exist', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oq-pipeline-empty-'));
    const opts = makeOptions({
      clearCache: false,
      root: tmp,
      packageRoot: path.join(tmp, 'packages'),
    });

    vi.spyOn(cli, 'parseArgs').mockReturnValue(opts);
    vi.spyOn(discovery, 'listWorkspacePackages').mockReturnValue([]);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const exitErr = new Error('exit-1');
    vi.spyOn(process, 'exit').mockImplementation(((
      code?: string | number | null
    ) => {
      throw code === 1 ? exitErr : new Error(`unexpected-exit-${code}`);
    }) as never);

    await expect(main()).rejects.toBe(exitErr);
  });

  it('exits when fallback root package.json is unreadable', async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oq-pipeline-badjson-'));
    fs.writeFileSync(path.join(tmp, 'package.json'), '{invalid-json', 'utf8');
    const opts = makeOptions({
      clearCache: false,
      root: tmp,
      packageRoot: path.join(tmp, 'packages'),
    });

    vi.spyOn(cli, 'parseArgs').mockReturnValue(opts);
    vi.spyOn(discovery, 'listWorkspacePackages').mockReturnValue([]);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const exitErr = new Error('exit-1');
    vi.spyOn(process, 'exit').mockImplementation(((
      code?: string | number | null
    ) => {
      throw code === 1 ? exitErr : new Error(`unexpected-exit-${code}`);
    }) as never);

    await expect(main()).rejects.toBe(exitErr);
  });
});
