import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';

// ─────────────────────────────────────────────────────────────────────
// 1. Schema validation tests (security-critical)
// ─────────────────────────────────────────────────────────────────────

import { BulkCloneRepoSchema } from '../../src/tools/github_clone_repo/scheme.js';

function parseSchema(overrides: Record<string, unknown>) {
  const base = {
    queries: [
      {
        mainResearchGoal: 'test',
        researchGoal: 'test',
        reasoning: 'test',
        owner: 'facebook',
        repo: 'react',
        ...overrides,
      },
    ],
  };
  return BulkCloneRepoSchema.safeParse(base);
}

describe('githubCloneRepo schema validation', () => {
  describe('owner validation', () => {
    it('accepts valid GitHub owner', () => {
      expect(parseSchema({ owner: 'facebook' }).success).toBe(true);
      expect(parseSchema({ owner: 'wix-private' }).success).toBe(true);
      expect(parseSchema({ owner: 'user.name' }).success).toBe(true);
      expect(parseSchema({ owner: 'user_name' }).success).toBe(true);
    });

    it('rejects path traversal in owner', () => {
      const result = parseSchema({ owner: '../../etc' });
      expect(result.success).toBe(false);
    });

    it('rejects slashes in owner', () => {
      expect(parseSchema({ owner: 'a/b' }).success).toBe(false);
      expect(parseSchema({ owner: 'a\\b' }).success).toBe(false);
    });

    it('rejects empty owner', () => {
      expect(parseSchema({ owner: '' }).success).toBe(false);
    });
  });

  describe('repo validation', () => {
    it('accepts valid repo names', () => {
      expect(parseSchema({ repo: 'react' }).success).toBe(true);
      expect(parseSchema({ repo: 'my-project.js' }).success).toBe(true);
      expect(parseSchema({ repo: 'repo_name' }).success).toBe(true);
    });

    it('rejects path traversal in repo', () => {
      expect(parseSchema({ repo: '../../passwd' }).success).toBe(false);
    });

    it('rejects slashes in repo', () => {
      expect(parseSchema({ repo: 'a/b' }).success).toBe(false);
    });
  });

  describe('branch validation', () => {
    it('accepts valid branch names', () => {
      expect(parseSchema({ branch: 'main' }).success).toBe(true);
      expect(parseSchema({ branch: 'feature/new-thing' }).success).toBe(true);
      expect(parseSchema({ branch: 'release-1.0.0' }).success).toBe(true);
    });

    it('rejects path traversal in branch', () => {
      expect(parseSchema({ branch: '../../../etc' }).success).toBe(false);
      expect(parseSchema({ branch: 'main/../../etc' }).success).toBe(false);
    });

    it('rejects leading dash (flag injection)', () => {
      expect(parseSchema({ branch: '-evil' }).success).toBe(false);
      expect(parseSchema({ branch: '--exec' }).success).toBe(false);
    });

    it('is optional', () => {
      expect(parseSchema({}).success).toBe(true);
    });
  });

  describe('sparse_path validation', () => {
    it('accepts valid sparse paths', () => {
      expect(parseSchema({ sparse_path: 'src/compiler' }).success).toBe(true);
      expect(parseSchema({ sparse_path: 'packages/core/src' }).success).toBe(
        true
      );
      expect(parseSchema({ sparse_path: 'lib' }).success).toBe(true);
      expect(parseSchema({ sparse_path: '@types/node' }).success).toBe(true);
    });

    it('rejects path traversal in sparse_path', () => {
      expect(parseSchema({ sparse_path: '../../etc' }).success).toBe(false);
      expect(parseSchema({ sparse_path: 'src/../../passwd' }).success).toBe(
        false
      );
    });

    it('rejects leading dash (flag injection)', () => {
      expect(parseSchema({ sparse_path: '-exec' }).success).toBe(false);
      expect(parseSchema({ sparse_path: '--evil' }).success).toBe(false);
    });

    it('rejects absolute paths (leading /)', () => {
      expect(parseSchema({ sparse_path: '/etc/passwd' }).success).toBe(false);
    });

    it('rejects backslash paths', () => {
      expect(parseSchema({ sparse_path: 'src\\evil' }).success).toBe(false);
    });

    it('is optional', () => {
      expect(parseSchema({}).success).toBe(true);
    });
  });

  describe('query limits', () => {
    it('rejects more than 3 queries', () => {
      const result = BulkCloneRepoSchema.safeParse({
        queries: Array.from({ length: 4 }, () => ({
          mainResearchGoal: 'test',
          researchGoal: 'test',
          reasoning: 'test',
          owner: 'a',
          repo: 'b',
        })),
      });
      expect(result.success).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// 2. Cache tests (pure, no mocks needed)
// ─────────────────────────────────────────────────────────────────────

import {
  getCloneDir,
  getReposBaseDir,
  readCacheMeta,
  writeCacheMeta,
  isCacheValid,
  isCacheHit,
  createCacheMeta,
  ensureCloneParentDir,
  removeCloneDir,
} from '../../src/tools/github_clone_repo/cache.js';

describe('github_clone_repo cache', () => {
  const testBaseDir = join(tmpdir(), `octocode-cache-test-${Date.now()}`);

  afterEach(() => {
    if (existsSync(testBaseDir)) {
      rmSync(testBaseDir, { recursive: true, force: true });
    }
  });

  describe('getReposBaseDir', () => {
    it('appends repos to octocode dir', () => {
      expect(getReposBaseDir('/home/.octocode')).toBe('/home/.octocode/repos');
    });
  });

  describe('getCloneDir', () => {
    it('builds path for full clone', () => {
      const dir = getCloneDir('/home/.octocode', 'facebook', 'react', 'main');
      expect(dir).toBe('/home/.octocode/repos/facebook/react/main');
    });

    it('builds path with sparse suffix for partial clone', () => {
      const dir = getCloneDir(
        '/home/.octocode',
        'facebook',
        'react',
        'main',
        'packages/core'
      );
      expect(dir).toContain('/home/.octocode/repos/facebook/react/main__sp_');
      // Different paths should produce different suffixes
      const dir2 = getCloneDir(
        '/home/.octocode',
        'facebook',
        'react',
        'main',
        'packages/other'
      );
      expect(dir).not.toBe(dir2);
    });

    it('same sparse_path produces same suffix (deterministic)', () => {
      const dir1 = getCloneDir(
        '/home/.octocode',
        'fb',
        'r',
        'main',
        'src/core'
      );
      const dir2 = getCloneDir(
        '/home/.octocode',
        'fb',
        'r',
        'main',
        'src/core'
      );
      expect(dir1).toBe(dir2);
    });
  });

  describe('readCacheMeta / writeCacheMeta', () => {
    it('returns null for non-existent directory', () => {
      expect(readCacheMeta('/non/existent/dir')).toBeNull();
    });

    it('returns null for corrupt metadata', () => {
      const dir = join(testBaseDir, 'corrupt');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, '.octocode-clone-meta.json'),
        'NOT JSON',
        'utf-8'
      );
      expect(readCacheMeta(dir)).toBeNull();
    });

    it('round-trips metadata', () => {
      const dir = join(testBaseDir, 'roundtrip');
      mkdirSync(dir, { recursive: true });
      const meta = createCacheMeta('fb', 'react', 'main');
      writeCacheMeta(dir, meta);
      const loaded = readCacheMeta(dir);
      expect(loaded).toEqual(meta);
    });

    it('round-trips metadata with sparse_path', () => {
      const dir = join(testBaseDir, 'sparse-roundtrip');
      mkdirSync(dir, { recursive: true });
      const meta = createCacheMeta('fb', 'react', 'main', 'src/core');
      writeCacheMeta(dir, meta);
      const loaded = readCacheMeta(dir);
      expect(loaded?.sparse_path).toBe('src/core');
    });
  });

  describe('isCacheValid', () => {
    it('returns true for unexpired cache', () => {
      const meta = createCacheMeta('fb', 'react', 'main');
      expect(isCacheValid(meta)).toBe(true);
    });

    it('returns false for expired cache', () => {
      const meta = createCacheMeta('fb', 'react', 'main');
      meta.expiresAt = new Date(Date.now() - 1000).toISOString();
      expect(isCacheValid(meta)).toBe(false);
    });
  });

  describe('isCacheHit', () => {
    it('returns hit=true when meta valid and dir exists', () => {
      const dir = join(testBaseDir, 'cache-hit');
      mkdirSync(dir, { recursive: true });
      const meta = createCacheMeta('fb', 'react', 'main');
      writeCacheMeta(dir, meta);

      const result = isCacheHit(dir);
      expect(result.hit).toBe(true);
      if (result.hit) {
        expect(result.meta.owner).toBe('fb');
      }
    });

    it('returns hit=false when no meta file exists', () => {
      const result = isCacheHit('/non/existent/path');
      expect(result.hit).toBe(false);
    });

    it('returns hit=false when meta is expired', () => {
      const dir = join(testBaseDir, 'cache-expired');
      mkdirSync(dir, { recursive: true });
      const meta = createCacheMeta('fb', 'react', 'main');
      meta.expiresAt = new Date(Date.now() - 1000).toISOString();
      writeCacheMeta(dir, meta);

      const result = isCacheHit(dir);
      expect(result.hit).toBe(false);
    });

    it('returns hit=false when directory was externally deleted', () => {
      const dir = join(testBaseDir, 'cache-gone');
      mkdirSync(dir, { recursive: true });
      const meta = createCacheMeta('fb', 'react', 'main');
      writeCacheMeta(dir, meta);
      // Delete the directory (meta goes with it)
      rmSync(dir, { recursive: true, force: true });

      const result = isCacheHit(dir);
      expect(result.hit).toBe(false);
    });
  });

  describe('createCacheMeta', () => {
    it('creates metadata with 24h TTL', () => {
      const before = Date.now();
      const meta = createCacheMeta('fb', 'react', 'main');
      const after = Date.now();

      const clonedAt = new Date(meta.clonedAt).getTime();
      const expiresAt = new Date(meta.expiresAt).getTime();
      const twentyFourHours = 24 * 60 * 60 * 1000;

      expect(clonedAt).toBeGreaterThanOrEqual(before);
      expect(clonedAt).toBeLessThanOrEqual(after);
      expect(expiresAt - clonedAt).toBe(twentyFourHours);
    });

    it('omits sparse_path when not provided', () => {
      const meta = createCacheMeta('fb', 'react', 'main');
      expect(meta).not.toHaveProperty('sparse_path');
    });

    it('includes sparse_path when provided', () => {
      const meta = createCacheMeta('fb', 'react', 'main', 'src/core');
      expect(meta.sparse_path).toBe('src/core');
    });

    it('omits source when not provided', () => {
      const meta = createCacheMeta('fb', 'react', 'main');
      expect(meta).not.toHaveProperty('source');
    });

    it('includes source when provided as clone', () => {
      const meta = createCacheMeta('fb', 'react', 'main', undefined, 'clone');
      expect(meta.source).toBe('clone');
    });

    it('includes source when provided as directoryFetch', () => {
      const meta = createCacheMeta(
        'fb',
        'react',
        'main',
        undefined,
        'directoryFetch'
      );
      expect(meta.source).toBe('directoryFetch');
    });
  });

  describe('ensureCloneParentDir', () => {
    it('creates parent directories', () => {
      const dir = join(testBaseDir, 'deep', 'nested', 'clone');
      ensureCloneParentDir(dir);
      expect(existsSync(join(testBaseDir, 'deep', 'nested'))).toBe(true);
    });

    it('does nothing when parent already exists', () => {
      const dir = join(testBaseDir, 'already-exists', 'clone');
      mkdirSync(join(testBaseDir, 'already-exists'), { recursive: true });
      // Should not throw
      ensureCloneParentDir(dir);
      expect(existsSync(join(testBaseDir, 'already-exists'))).toBe(true);
    });
  });

  describe('removeCloneDir', () => {
    it('removes existing directory', () => {
      const dir = join(testBaseDir, 'to-remove');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'file.txt'), 'hello', 'utf-8');
      removeCloneDir(dir);
      expect(existsSync(dir)).toBe(false);
    });

    it('does nothing for non-existent directory', () => {
      // Should not throw
      removeCloneDir(join(testBaseDir, 'does-not-exist'));
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// 3. cloneRepo logic tests (with mocks)
// ─────────────────────────────────────────────────────────────────────

const mockSpawnWithTimeout = vi.hoisted(() => vi.fn());
const mockGetOctokit = vi.hoisted(() => vi.fn());
const mockGetOctocodeDir = vi.hoisted(() => vi.fn());

vi.mock('../../src/utils/exec/spawn.js', async importOriginal => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    spawnWithTimeout: mockSpawnWithTimeout,
  };
});

vi.mock('../../src/github/client.js', () => ({
  getOctokit: mockGetOctokit,
}));

vi.mock('octocode-shared', () => ({
  getOctocodeDir: mockGetOctocodeDir,
}));

import { cloneRepo } from '../../src/tools/github_clone_repo/cloneRepo.js';

describe('cloneRepo', () => {
  let testDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    testDir = join(
      tmpdir(),
      `octocode-clone-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );
    mockGetOctocodeDir.mockReturnValue(testDir);

    // Default: git commands succeed AND create the target directory
    // (simulating what real git clone would do)
    mockSpawnWithTimeout.mockImplementation(
      async (_cmd: string, args: string[]) => {
        // For 'clone' commands, create the target directory
        if (args.includes('clone')) {
          // Target dir is the last argument
          const targetDir = args[args.length - 1]!;
          if (targetDir && !existsSync(targetDir)) {
            mkdirSync(targetDir, { recursive: true });
          }
        }
        return { success: true, stdout: 'ok', stderr: '', exitCode: 0 };
      }
    );

    // Default: API returns 'main' as default branch
    mockGetOctokit.mockResolvedValue({
      rest: {
        repos: {
          get: vi.fn().mockResolvedValue({
            data: { default_branch: 'main' },
          }),
        },
      },
    });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('performs full clone when no sparse_path', async () => {
    const result = await cloneRepo({
      mainResearchGoal: 'test',
      researchGoal: 'test',
      reasoning: 'test',
      owner: 'facebook',
      repo: 'react',
      branch: 'main',
    });

    expect(result.cached).toBe(false);
    expect(result.owner).toBe('facebook');
    expect(result.repo).toBe('react');
    expect(result.branch).toBe('main');
    expect(result.localPath).toContain('facebook/react/main');
    expect(result.sparse_path).toBeUndefined();

    // Verify git was called with clone args
    const cloneCall = mockSpawnWithTimeout.mock.calls.find(
      (call: unknown[]) => {
        const a = call[1] as string[];
        return a.includes('clone');
      }
    );
    expect(cloneCall).toBeDefined();
    const cloneArgs = cloneCall![1] as string[];
    expect(cloneArgs).toContain('--depth');
    expect(cloneArgs).toContain('--single-branch');
    expect(cloneArgs).toContain('--');
  });

  it('performs sparse clone when sparse_path given', async () => {
    const result = await cloneRepo({
      mainResearchGoal: 'test',
      researchGoal: 'test',
      reasoning: 'test',
      owner: 'facebook',
      repo: 'react',
      branch: 'main',
      sparse_path: 'packages/core',
    });

    expect(result.sparse_path).toBe('packages/core');
    expect(result.localPath).toContain('__sp_');

    // Should have 3 calls: git --version, git clone --sparse, git sparse-checkout set
    expect(mockSpawnWithTimeout).toHaveBeenCalledTimes(3);

    // Verify sparse-checkout uses '--' before path
    const sparseCall = mockSpawnWithTimeout.mock.calls.find(
      (call: unknown[]) => {
        const a = call[1] as string[];
        return a.includes('sparse-checkout');
      }
    );
    expect(sparseCall).toBeDefined();
    const sparseArgs = sparseCall![1] as string[];
    const dashDashIdx = sparseArgs.indexOf('--');
    const pathIdx = sparseArgs.indexOf('packages/core');
    expect(dashDashIdx).toBeGreaterThan(-1);
    expect(pathIdx).toBe(dashDashIdx + 1);
  });

  it('does not pass auth token to sparse-checkout (local operation)', async () => {
    await cloneRepo(
      {
        mainResearchGoal: 'test',
        researchGoal: 'test',
        reasoning: 'test',
        owner: 'facebook',
        repo: 'react',
        branch: 'main',
        sparse_path: 'src',
      },
      undefined,
      'ghp_secret_token_123'
    );

    // sparse-checkout call should NOT contain auth header
    const sparseCall = mockSpawnWithTimeout.mock.calls.find(
      (call: unknown[]) => {
        const a = call[1] as string[];
        return a.includes('sparse-checkout');
      }
    );
    const sparseArgs = sparseCall![1] as string[];
    const hasAuth = sparseArgs.some(
      (arg: string) => arg.includes('Authorization') || arg.includes('Bearer')
    );
    expect(hasAuth).toBe(false);
  });

  it('passes auth token to clone (network operation)', async () => {
    await cloneRepo(
      {
        mainResearchGoal: 'test',
        researchGoal: 'test',
        reasoning: 'test',
        owner: 'org',
        repo: 'monorepo',
        branch: 'main',
        sparse_path: 'packages/core',
      },
      undefined,
      'ghp_mytoken'
    );

    // Clone call should have auth
    const cloneCall = mockSpawnWithTimeout.mock.calls.find(
      (call: unknown[]) => {
        const a = call[1] as string[];
        return a.includes('clone');
      }
    );
    expect(cloneCall).toBeDefined();
    const cloneArgStr = (cloneCall![1] as string[]).join(' ');
    expect(cloneArgStr).toContain('Bearer ghp_mytoken');

    // sparse-checkout call should NOT have auth
    const sparseCall = mockSpawnWithTimeout.mock.calls.find(
      (call: unknown[]) => {
        const a = call[1] as string[];
        return a.includes('sparse-checkout');
      }
    );
    expect(sparseCall).toBeDefined();
    const sparseArgStr = (sparseCall![1] as string[]).join(' ');
    expect(sparseArgStr).not.toContain('Bearer');
    expect(sparseArgStr).not.toContain('ghp_mytoken');
  });

  it('returns cached result when cache is valid', async () => {
    // First clone
    await cloneRepo({
      mainResearchGoal: 'test',
      researchGoal: 'test',
      reasoning: 'test',
      owner: 'facebook',
      repo: 'react',
      branch: 'main',
    });

    mockSpawnWithTimeout.mockClear();
    // Re-setup for git --version check only
    mockSpawnWithTimeout.mockResolvedValue({
      success: true,
      stdout: 'git version 2.40.0',
      stderr: '',
      exitCode: 0,
    });

    // Second call should hit cache
    const result = await cloneRepo({
      mainResearchGoal: 'test',
      researchGoal: 'test',
      reasoning: 'test',
      owner: 'facebook',
      repo: 'react',
      branch: 'main',
    });

    expect(result.cached).toBe(true);
    // Only git --version should be called (no clone)
    const cloneCalls = mockSpawnWithTimeout.mock.calls.filter(
      (call: unknown[]) => {
        const a = call[1] as string[];
        return a.includes('clone');
      }
    );
    expect(cloneCalls).toHaveLength(0);
  });

  it('rejects directoryFetch cache and re-clones', async () => {
    // Simulate a directoryFetch having written metadata to the same cloneDir
    const cloneDir = getCloneDir(testDir, 'facebook', 'react', 'main');
    mkdirSync(cloneDir, { recursive: true });
    const dirFetchMeta = createCacheMeta('facebook', 'react', 'main');
    dirFetchMeta.source = 'directoryFetch';
    writeCacheMeta(cloneDir, dirFetchMeta);

    // Clone should NOT trust the directoryFetch metadata
    const result = await cloneRepo({
      mainResearchGoal: 'test',
      researchGoal: 'test',
      reasoning: 'test',
      owner: 'facebook',
      repo: 'react',
      branch: 'main',
    });

    expect(result.cached).toBe(false);
    // Should have invoked git clone (not returned cached)
    const cloneCalls = mockSpawnWithTimeout.mock.calls.filter(
      (call: unknown[]) => {
        const a = call[1] as string[];
        return a.includes('clone');
      }
    );
    expect(cloneCalls.length).toBeGreaterThan(0);
  });

  it('writes source: clone in cache metadata', async () => {
    const result = await cloneRepo({
      mainResearchGoal: 'test',
      researchGoal: 'test',
      reasoning: 'test',
      owner: 'facebook',
      repo: 'react',
      branch: 'main',
    });

    const metaPath = join(result.localPath, '.octocode-clone-meta.json');
    expect(existsSync(metaPath)).toBe(true);
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    expect(meta.source).toBe('clone');
  });

  it('re-clones when cache meta exists but is expired', async () => {
    // First clone creates cache
    const first = await cloneRepo({
      mainResearchGoal: 'test',
      researchGoal: 'test',
      reasoning: 'test',
      owner: 'facebook',
      repo: 'react',
      branch: 'main',
    });
    expect(first.cached).toBe(false);
    expect(existsSync(first.localPath)).toBe(true);

    // Manually expire the cache by rewriting the meta file
    const expiredMeta = createCacheMeta('facebook', 'react', 'main');
    expiredMeta.expiresAt = new Date(Date.now() - 1000).toISOString();
    writeCacheMeta(first.localPath, expiredMeta);

    mockSpawnWithTimeout.mockClear();
    mockSpawnWithTimeout.mockImplementation(
      async (_cmd: string, args: string[]) => {
        if (args.includes('clone')) {
          const targetDir = args[args.length - 1]!;
          if (targetDir && !existsSync(targetDir)) {
            mkdirSync(targetDir, { recursive: true });
          }
        }
        return { success: true, stdout: 'ok', stderr: '', exitCode: 0 };
      }
    );

    // Should detect expired cache and re-clone
    const second = await cloneRepo({
      mainResearchGoal: 'test',
      researchGoal: 'test',
      reasoning: 'test',
      owner: 'facebook',
      repo: 'react',
      branch: 'main',
    });
    expect(second.cached).toBe(false);
    const cloneCalls = mockSpawnWithTimeout.mock.calls.filter(
      (call: unknown[]) => {
        const a = call[1] as string[];
        return a.includes('clone');
      }
    );
    expect(cloneCalls.length).toBeGreaterThan(0);
  });

  it('re-clones when directory was externally deleted despite valid cache meta', async () => {
    // First clone creates cache
    const first = await cloneRepo({
      mainResearchGoal: 'test',
      researchGoal: 'test',
      reasoning: 'test',
      owner: 'facebook',
      repo: 'react',
      branch: 'main',
    });
    expect(first.cached).toBe(false);

    // Delete the clone directory externally — simulates user or OS cleanup.
    // Since the meta lives inside the clone dir, it's gone too.
    // cloneRepo should detect the missing directory and re-clone.
    rmSync(first.localPath, { recursive: true, force: true });
    mockSpawnWithTimeout.mockClear();
    mockSpawnWithTimeout.mockImplementation(
      async (_cmd: string, args: string[]) => {
        if (args.includes('clone')) {
          const targetDir = args[args.length - 1]!;
          if (targetDir && !existsSync(targetDir)) {
            mkdirSync(targetDir, { recursive: true });
          }
        }
        return { success: true, stdout: 'ok', stderr: '', exitCode: 0 };
      }
    );

    const second = await cloneRepo({
      mainResearchGoal: 'test',
      researchGoal: 'test',
      reasoning: 'test',
      owner: 'facebook',
      repo: 'react',
      branch: 'main',
    });
    expect(second.cached).toBe(false);
    // Should have performed a git clone
    const cloneCalls = mockSpawnWithTimeout.mock.calls.filter(
      (call: unknown[]) => {
        const a = call[1] as string[];
        return a.includes('clone');
      }
    );
    expect(cloneCalls.length).toBeGreaterThan(0);
  });

  it('resolves default branch from API when not specified', async () => {
    mockGetOctokit.mockResolvedValue({
      rest: {
        repos: {
          get: vi.fn().mockResolvedValue({
            data: { default_branch: 'develop' },
          }),
        },
      },
    });

    const result = await cloneRepo({
      mainResearchGoal: 'test',
      researchGoal: 'test',
      reasoning: 'test',
      owner: 'org',
      repo: 'project',
    });

    expect(result.branch).toBe('develop');
  });

  it('falls back to "main" when API fails', async () => {
    mockGetOctokit.mockRejectedValue(new Error('Network error'));

    const result = await cloneRepo({
      mainResearchGoal: 'test',
      researchGoal: 'test',
      reasoning: 'test',
      owner: 'org',
      repo: 'project',
    });

    expect(result.branch).toBe('main');
  });

  it('throws clear error when git is not available', async () => {
    mockSpawnWithTimeout.mockResolvedValueOnce({
      success: false,
      stdout: '',
      stderr: 'command not found: git',
      exitCode: 127,
    });

    await expect(
      cloneRepo({
        mainResearchGoal: 'test',
        researchGoal: 'test',
        reasoning: 'test',
        owner: 'fb',
        repo: 'react',
        branch: 'main',
      })
    ).rejects.toThrow('git is not installed');
  });

  it('throws on clone failure with scrubbed error', async () => {
    // git --version succeeds
    mockSpawnWithTimeout
      .mockResolvedValueOnce({
        success: true,
        stdout: 'git version 2.40.0',
        stderr: '',
        exitCode: 0,
      })
      // git clone fails with token in stderr
      .mockResolvedValueOnce({
        success: false,
        stdout: '',
        stderr: 'fatal: Authorization: Bearer ghp_secret123 failed',
        exitCode: 128,
      });

    await expect(
      cloneRepo(
        {
          mainResearchGoal: 'test',
          researchGoal: 'test',
          reasoning: 'test',
          owner: 'fb',
          repo: 'react',
          branch: 'main',
        },
        undefined,
        'ghp_secret123'
      )
    ).rejects.toThrow('[REDACTED]');
  });

  it('scrubs Authorization header patterns from error messages', async () => {
    mockSpawnWithTimeout
      .mockResolvedValueOnce({
        success: true,
        stdout: 'git version 2.40.0',
        stderr: '',
        exitCode: 0,
      })
      .mockResolvedValueOnce({
        success: false,
        stdout: '',
        stderr:
          'fatal: could not read Username: Authorization: Bearer sometoken123',
        exitCode: 128,
      });

    try {
      await cloneRepo({
        mainResearchGoal: 'test',
        researchGoal: 'test',
        reasoning: 'test',
        owner: 'fb',
        repo: 'react',
        branch: 'main',
      });
      expect.fail('should have thrown');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain('sometoken123');
      expect(msg).toContain('[REDACTED]');
    }
  });

  it('uses full clone args correctly (--depth 1 --single-branch --)', async () => {
    await cloneRepo({
      mainResearchGoal: 'test',
      researchGoal: 'test',
      reasoning: 'test',
      owner: 'fb',
      repo: 'react',
      branch: 'main',
    });

    const cloneCall = mockSpawnWithTimeout.mock.calls.find(
      (call: unknown[]) => {
        const a = call[1] as string[];
        return a.includes('clone') && !a.includes('--sparse');
      }
    );
    expect(cloneCall).toBeDefined();
    const args = cloneCall![1] as string[];

    // Check critical flags
    expect(args).toContain('--depth');
    expect(args[args.indexOf('--depth') + 1]).toBe('1');
    expect(args).toContain('--single-branch');
    expect(args).toContain('--branch');
    expect(args).toContain('--');

    // URL should be after '--'
    const dashDashIdx = args.indexOf('--');
    expect(args[dashDashIdx + 1]).toContain('github.com/fb/react.git');
  });

  it('uses sparse clone args correctly (--filter --sparse --depth 1)', async () => {
    await cloneRepo({
      mainResearchGoal: 'test',
      researchGoal: 'test',
      reasoning: 'test',
      owner: 'fb',
      repo: 'react',
      branch: 'main',
      sparse_path: 'packages/core',
    });

    const cloneCall = mockSpawnWithTimeout.mock.calls.find(
      (call: unknown[]) => {
        const a = call[1] as string[];
        return a.includes('clone') && a.includes('--sparse');
      }
    );
    expect(cloneCall).toBeDefined();
    const args = cloneCall![1] as string[];

    expect(args).toContain('--filter');
    expect(args[args.indexOf('--filter') + 1]).toBe('blob:none');
    expect(args).toContain('--sparse');
    expect(args).toContain('--depth');
    expect(args).toContain('--');
  });

  it('prefers authInfo.token over explicit token', async () => {
    const authInfo = { token: 'oauth_token_from_authinfo' } as any;

    await cloneRepo(
      {
        mainResearchGoal: 'test',
        researchGoal: 'test',
        reasoning: 'test',
        owner: 'fb',
        repo: 'react',
        branch: 'main',
      },
      authInfo,
      'fallback_token'
    );

    const cloneCall = mockSpawnWithTimeout.mock.calls.find(
      (call: unknown[]) => {
        const a = call[1] as string[];
        return a.includes('clone');
      }
    );
    const cloneArgStr = (cloneCall![1] as string[]).join(' ');
    expect(cloneArgStr).toContain('oauth_token_from_authinfo');
    expect(cloneArgStr).not.toContain('fallback_token');
  });

  it('works without any token (public repo)', async () => {
    await cloneRepo({
      mainResearchGoal: 'test',
      researchGoal: 'test',
      reasoning: 'test',
      owner: 'fb',
      repo: 'react',
      branch: 'main',
    });

    const cloneCall = mockSpawnWithTimeout.mock.calls.find(
      (call: unknown[]) => {
        const a = call[1] as string[];
        return a.includes('clone');
      }
    );
    const cloneArgStr = (cloneCall![1] as string[]).join(' ');
    expect(cloneArgStr).not.toContain('Authorization');
    expect(cloneArgStr).not.toContain('Bearer');
  });

  it('returns cached result with sparse_path when cache is valid', async () => {
    // First sparse clone
    await cloneRepo({
      mainResearchGoal: 'test',
      researchGoal: 'test',
      reasoning: 'test',
      owner: 'facebook',
      repo: 'react',
      branch: 'main',
      sparse_path: 'packages/core',
    });

    mockSpawnWithTimeout.mockClear();
    mockSpawnWithTimeout.mockResolvedValue({
      success: true,
      stdout: 'git version 2.40.0',
      stderr: '',
      exitCode: 0,
    });

    // Second call should hit cache, including sparse_path
    const result = await cloneRepo({
      mainResearchGoal: 'test',
      researchGoal: 'test',
      reasoning: 'test',
      owner: 'facebook',
      repo: 'react',
      branch: 'main',
      sparse_path: 'packages/core',
    });

    expect(result.cached).toBe(true);
    expect(result.sparse_path).toBe('packages/core');
  });

  it('throws clear error when spawn itself throws (git not on PATH)', async () => {
    mockSpawnWithTimeout.mockRejectedValueOnce(new Error('spawn git ENOENT'));

    await expect(
      cloneRepo({
        mainResearchGoal: 'test',
        researchGoal: 'test',
        reasoning: 'test',
        owner: 'fb',
        repo: 'react',
        branch: 'main',
      })
    ).rejects.toThrow('git is not installed');
  });

  it('scrubs "Authorization: token" pattern (not just Bearer)', async () => {
    mockSpawnWithTimeout
      .mockResolvedValueOnce({
        success: true,
        stdout: 'git version 2.40.0',
        stderr: '',
        exitCode: 0,
      })
      .mockResolvedValueOnce({
        success: false,
        stdout: '',
        stderr: 'Authorization: token ghp_abc123 in request',
        exitCode: 128,
      });

    try {
      await cloneRepo({
        mainResearchGoal: 'test',
        researchGoal: 'test',
        reasoning: 'test',
        owner: 'fb',
        repo: 'react',
        branch: 'main',
      });
      expect.fail('should have thrown');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).not.toContain('ghp_abc123');
      expect(msg).toContain('[REDACTED]');
    }
  });

  it('handles clone failure with empty stderr', async () => {
    mockSpawnWithTimeout
      .mockResolvedValueOnce({
        success: true,
        stdout: 'git version 2.40.0',
        stderr: '',
        exitCode: 0,
      })
      .mockResolvedValueOnce({
        success: false,
        stdout: '',
        stderr: '',
        exitCode: 128,
      });

    await expect(
      cloneRepo({
        mainResearchGoal: 'test',
        researchGoal: 'test',
        reasoning: 'test',
        owner: 'fb',
        repo: 'react',
        branch: 'main',
      })
    ).rejects.toThrow('git full clone of fb/react failed');
  });

  it('sets GIT_TERMINAL_PROMPT=0 to prevent interactive prompts', async () => {
    await cloneRepo({
      mainResearchGoal: 'test',
      researchGoal: 'test',
      reasoning: 'test',
      owner: 'fb',
      repo: 'react',
      branch: 'main',
    });

    // Every git call should have GIT_TERMINAL_PROMPT=0 in env
    for (const call of mockSpawnWithTimeout.mock.calls) {
      const opts = call[2] as { env?: Record<string, string> };
      expect(opts.env?.GIT_TERMINAL_PROMPT).toBe('0');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 4. Execution handler tests
// ─────────────────────────────────────────────────────────────────────

const mockGetActiveProvider = vi.hoisted(() => vi.fn());
const mockGetActiveProviderConfig = vi.hoisted(() => vi.fn());

vi.mock('../../src/serverConfig.js', () => ({
  getActiveProvider: mockGetActiveProvider,
  getActiveProviderConfig: mockGetActiveProviderConfig,
  isLoggingEnabled: vi.fn(() => false),
}));

import { executeCloneRepo } from '../../src/tools/github_clone_repo/execution.js';
import { registerGitHubCloneRepoTool } from '../../src/tools/github_clone_repo/register.js';
import { createMockMcpServer } from '../fixtures/mcp-fixtures.js';

// ─────────────────────────────────────────────────────────────────────
// 4.5. Registration test
// ─────────────────────────────────────────────────────────────────────

describe('registerGitHubCloneRepoTool', () => {
  it('registers the tool with correct name and metadata', () => {
    const mockServer = createMockMcpServer();
    registerGitHubCloneRepoTool(mockServer.server);

    expect(mockServer.server.registerTool).toHaveBeenCalledTimes(1);
    const [toolName, options] = (mockServer.server.registerTool as any).mock
      .calls[0];
    expect(toolName).toBe('githubCloneRepo');
    expect(options.description).toContain('Clone');
    expect(options.annotations.idempotentHint).toBe(true);
    expect(options.annotations.readOnlyHint).toBe(false);
  });

  it('registered handler invokes executeCloneRepo', async () => {
    const execTestDir = join(
      tmpdir(),
      `octocode-reg-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );
    mockGetOctocodeDir.mockReturnValue(execTestDir);
    mockGetActiveProvider.mockReturnValue('github');
    mockGetActiveProviderConfig.mockReturnValue({ token: 'test-token' });

    // git commands succeed and create the target dir
    mockSpawnWithTimeout.mockImplementation(
      async (_cmd: string, args: string[]) => {
        if (args.includes('clone')) {
          const targetDir = args[args.length - 1]!;
          if (targetDir && !existsSync(targetDir)) {
            mkdirSync(targetDir, { recursive: true });
          }
        }
        return { success: true, stdout: 'ok', stderr: '', exitCode: 0 };
      }
    );

    mockGetOctokit.mockResolvedValue({
      rest: {
        repos: {
          get: vi.fn().mockResolvedValue({ data: { default_branch: 'main' } }),
        },
      },
    });

    const mockServer = createMockMcpServer();
    registerGitHubCloneRepoTool(mockServer.server);

    // Invoke the handler via the mock server
    const result = await mockServer.callTool('githubCloneRepo', {
      queries: [
        {
          mainResearchGoal: 'test',
          researchGoal: 'test',
          reasoning: 'test',
          owner: 'fb',
          repo: 'react',
          branch: 'main',
        },
      ],
    });

    const text = result.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map(c => c.text)
      .join('\n');
    expect(text).toContain('localPath');

    // Cleanup
    if (existsSync(execTestDir)) {
      rmSync(execTestDir, { recursive: true, force: true });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────
// 5. Execution handler tests
// ─────────────────────────────────────────────────────────────────────

describe('executeCloneRepo', () => {
  let execTestDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetActiveProvider.mockReturnValue('github');
    mockGetActiveProviderConfig.mockReturnValue({ token: 'mock-token' });
    execTestDir = join(
      tmpdir(),
      `octocode-exec-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );
    mockGetOctocodeDir.mockReturnValue(execTestDir);

    // git commands succeed and create the target dir
    mockSpawnWithTimeout.mockImplementation(
      async (_cmd: string, args: string[]) => {
        if (args.includes('clone')) {
          const targetDir = args[args.length - 1]!;
          if (targetDir && !existsSync(targetDir)) {
            mkdirSync(targetDir, { recursive: true });
          }
        }
        return { success: true, stdout: 'ok', stderr: '', exitCode: 0 };
      }
    );

    mockGetOctokit.mockResolvedValue({
      rest: {
        repos: {
          get: vi.fn().mockResolvedValue({ data: { default_branch: 'main' } }),
        },
      },
    });
  });

  afterEach(() => {
    if (existsSync(execTestDir)) {
      rmSync(execTestDir, { recursive: true, force: true });
    }
  });

  it('returns error for non-github provider', async () => {
    mockGetActiveProvider.mockReturnValue('gitlab');

    const result = await executeCloneRepo({
      queries: [
        {
          mainResearchGoal: 'test',
          researchGoal: 'test',
          reasoning: 'test',
          owner: 'fb',
          repo: 'react',
        },
      ],
    });

    const text = result.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map(c => c.text)
      .join('\n');
    expect(text.toLowerCase()).toContain('github');
  });

  it('returns success result for github provider', async () => {
    const result = await executeCloneRepo({
      queries: [
        {
          mainResearchGoal: 'test',
          researchGoal: 'test',
          reasoning: 'test',
          owner: 'fb',
          repo: 'react',
          branch: 'main',
        },
      ],
    });

    const text = result.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map(c => c.text)
      .join('\n');
    expect(text).toContain('localPath');
    expect(text).toContain('fb');
  });

  it('includes sparse hints for sparse clone', async () => {
    const result = await executeCloneRepo({
      queries: [
        {
          mainResearchGoal: 'test',
          researchGoal: 'test',
          reasoning: 'test',
          owner: 'fb',
          repo: 'react',
          branch: 'main',
          sparse_path: 'packages/core',
        },
      ],
    });

    const text = result.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map(c => c.text)
      .join('\n');
    // Sparse hints mention 'sparse' or 'Partial'
    expect(text.toLowerCase()).toContain('sparse');
  });

  it('includes cache hint when returning cached result', async () => {
    // First clone
    await executeCloneRepo({
      queries: [
        {
          mainResearchGoal: 'test',
          researchGoal: 'test',
          reasoning: 'test',
          owner: 'fb',
          repo: 'react',
          branch: 'main',
        },
      ],
    });

    // Second call - cached
    const result = await executeCloneRepo({
      queries: [
        {
          mainResearchGoal: 'test',
          researchGoal: 'test',
          reasoning: 'test',
          owner: 'fb',
          repo: 'react',
          branch: 'main',
        },
      ],
    });

    const text = result.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map(c => c.text)
      .join('\n');
    expect(text.toLowerCase()).toContain('cache');
  });

  it('handles clone failure gracefully', async () => {
    // git --version succeeds
    mockSpawnWithTimeout
      .mockResolvedValueOnce({
        success: true,
        stdout: 'git version 2.40.0',
        stderr: '',
        exitCode: 0,
      })
      // git clone fails
      .mockResolvedValueOnce({
        success: false,
        stdout: '',
        stderr: 'Repository not found',
        exitCode: 128,
      });

    const result = await executeCloneRepo({
      queries: [
        {
          mainResearchGoal: 'test',
          researchGoal: 'test',
          reasoning: 'test',
          owner: 'fb',
          repo: 'nonexistent',
          branch: 'main',
        },
      ],
    });

    const text = result.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map(c => c.text)
      .join('\n');
    expect(text.toLowerCase()).toContain('failed');
  });
});
