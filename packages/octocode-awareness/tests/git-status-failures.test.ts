import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readGitStatus } from '../src/git.js';
import { workspaceChanges } from '../src/workspace-changes.js';

const { spawnSync } = vi.hoisted(() => ({ spawnSync: vi.fn() }));
vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(), spawnSync,
}));
afterEach(() => { spawnSync.mockReset(); });

describe('Git status failure boundaries', () => {
  it.each([' M truncated.ts', 'R  renamed.ts\0'])('rejects incomplete NUL records %j', output => {
    spawnSync.mockReturnValue({ status: 0, stdout: output, stderr: '' });
    expect(() => readGitStatus('/fixture')).toThrow(/incomplete/);
  });

  it('returns a typed terminal-limit diagnostic instead of a partial clean view', () => {
    spawnSync.mockImplementation((_command: string, args: string[]) => args.includes('status')
      ? { status: null, error: Object.assign(new Error('output too large'), { code: 'ENOBUFS' }), stdout: ' M partial.ts' }
      : { status: 1, stdout: '', stderr: 'not a repository' });
    const db = new DatabaseSync(':memory:');
    try {
      expect(workspaceChanges(db, { workspacePath: '/fixture' })).toMatchObject({
        ok: false, count: 0, partial: true, partialReasons: ['terminal_limit'],
        diagnostic: { code: 'GIT_STATUS_LIMIT', limit_bytes: 2 * 1024 * 1024 },
      });
    } finally { db.close(); }
  });
});
