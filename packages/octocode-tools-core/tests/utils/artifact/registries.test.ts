import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithRetries } from '../../../src/utils/http/fetch.js';
import { withDataCache } from '../../../src/utils/http/cache/dataCache.js';
import {
  searchRegistry,
  ArtifactProviderError,
} from '../../../src/utils/artifact/index.js';
import type {
  ArtifactQuery,
  ArtifactProviderState,
} from '../../../src/utils/artifact/types.js';

vi.mock('../../../src/utils/http/fetch.js', () => ({
  fetchWithRetries: vi.fn(),
}));
vi.mock('../../../src/utils/http/cache/dataCache.js', () => ({
  withDataCache: vi.fn((_key, operation) => operation()),
}));

const fetch = vi.mocked(fetchWithRetries);
const missing = () => Object.assign(new Error('not found'), { status: 404 });
const service = {
  resources: [
    {
      '@type': 'SearchQueryService/3.5.0',
      '@id': 'https://azuresearch-usnc.nuget.org/query',
    },
  ],
};
const registrationService = {
  resources: [
    {
      '@type': 'RegistrationsBaseUrl/3.6.0',
      '@id': 'https://api.nuget.org/v3/registration5-gz-semver2/',
    },
  ],
};
function requested(index = 0): URL {
  return new URL(fetch.mock.calls[index]![0]);
}

beforeEach(() => {
  vi.clearAllMocks();
  fetch.mockReset();
});

describe('official artifact registry adapters', () => {
  it('resolves Python metadata without treating arbitrary project links as source', async () => {
    fetch.mockResolvedValue({
      info: {
        name: 'Requests',
        version: '2.32.5',
        summary: 'HTTP client',
        license_expression: 'Apache-2.0',
        project_urls: {
          'Source Code': 'https://github.com/psf/requests',
          Documentation: 'https://requests.readthedocs.io',
        },
      },
    });
    const result = await searchRegistry({
      type: 'pypi',
      packageName: 'requests',
    });
    expect(result.artifacts).toEqual([
      expect.objectContaining({
        type: 'pypi',
        name: 'Requests',
        version: '2.32.5',
        repository: 'https://github.com/psf/requests',
        license: 'Apache-2.0',
      }),
    ]);
    expect(requested().pathname).toBe('/pypi/requests/json');
    expect(withDataCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Function),
      { ttl: 300, cacheRole: 'helper' }
    );
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: { Accept: 'application/json' },
        packageRegistry: 'pypi',
        rateLimitProvider: 'pypi',
      })
    );
  });

  it('rejects PyPI discovery before making network calls', async () => {
    await expect(
      searchRegistry({ type: 'pypi', keywords: ['http'] })
    ).rejects.toMatchObject({
      code: 'unsupported_capability',
      message: expect.stringContaining('exact packageName'),
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('omits absent or unsafe Python repository metadata', async () => {
    fetch.mockResolvedValue({
      info: {
        name: 'x',
        project_urls: { Source: 'https://token:secret@github.com/a/b' },
      },
    });
    const result = await searchRegistry({ type: 'pypi', packageName: 'x' });
    expect(result.artifacts[0]?.repository).toBeUndefined();
  });

  it('resolves crates and prefers latest stable metadata', async () => {
    fetch.mockResolvedValue({
      crate: {
        id: 'serde',
        max_stable_version: '1.0.0',
        max_version: '2.0.0-beta',
        repository: 'git+https://github.com/serde-rs/serde',
        license: 'MIT OR Apache-2.0',
      },
    });
    const result = await searchRegistry({
      type: 'crates',
      packageName: 'serde',
    });
    expect(result.artifacts[0]).toMatchObject({
      name: 'serde',
      version: '1.0.0',
      repository: 'https://github.com/serde-rs/serde',
    });
  });

  it('executes crates continuations and covers every result', async () => {
    fetch
      .mockResolvedValueOnce({
        crates: [{ name: 'one' }, { name: 'two' }],
        meta: { total: 3 },
      })
      .mockResolvedValueOnce({
        crates: [{ name: 'three' }],
        meta: { total: 3 },
      });
    const query: ArtifactQuery = {
      type: 'crates',
      keywords: ['serde', 'json'],
      pageSize: 2,
    };
    const first = await searchRegistry(query);
    const second = await searchRegistry(query, first.nextState);
    expect(
      [...first.artifacts, ...second.artifacts].map(item => item.name)
    ).toEqual(['one', 'two', 'three']);
    expect(second.nextState).toBeUndefined();
    expect(requested(1).searchParams.get('page')).toBe('2');
    expect(requested(1).searchParams.get('q')).toBe('serde json');
  });

  it('looks up exact Maven coordinates without inventing a repository', async () => {
    fetch.mockResolvedValue(
      '<metadata><groupId>com.google.guava</groupId><artifactId>guava</artifactId><versioning><latest>34-beta</latest><release>33.4.0-jre</release></versioning></metadata>'
    );
    const result = await searchRegistry({
      type: 'maven',
      packageName: 'com.google.guava:guava',
    });
    expect(requested().href).toBe(
      'https://repo.maven.apache.org/maven2/com/google/guava/guava/maven-metadata.xml'
    );
    expect(result.artifacts[0]).toMatchObject({
      name: 'com.google.guava:guava',
      version: '33.4.0-jre',
      registryUrl:
        'https://central.sonatype.com/artifact/com.google.guava/guava',
    });
    expect(result.artifacts[0]?.repository).toBeUndefined();
  });

  it('rejects malformed Maven coordinates', async () => {
    await expect(
      searchRegistry({ type: 'maven', packageName: 'guava' })
    ).rejects.toMatchObject({ code: 'invalid_query' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('advances Maven offsets using actual provider page length', async () => {
    fetch
      .mockResolvedValueOnce({
        response: { numFound: 3, docs: [{ g: 'a', a: 'one' }] },
      })
      .mockResolvedValueOnce({
        response: {
          numFound: 3,
          docs: [
            { g: 'a', a: 'two' },
            { g: 'a', a: 'three' },
          ],
        },
      });
    const query: ArtifactQuery = {
      type: 'maven',
      keywords: ['test'],
      pageSize: 2,
    };
    const first = await searchRegistry(query);
    const second = await searchRegistry(query, first.nextState);
    expect(
      [...first.artifacts, ...second.artifacts].map(item => item.name)
    ).toEqual(['a:one', 'a:two', 'a:three']);
    expect(requested(1).searchParams.get('start')).toBe('1');
    expect(second.nextState).toBeUndefined();
  });

  it('discovers NuGet registration metadata, including unlisted exact IDs, and preserves homepage', async () => {
    fetch.mockResolvedValueOnce(registrationService).mockResolvedValueOnce({
      items: [
        {
          upper: '13.0.3',
          items: [
            {
              catalogEntry: {
                id: 'Newtonsoft.Json',
                version: '13.0.3',
                listed: false,
                projectUrl: 'https://www.newtonsoft.com/json',
              },
            },
          ],
        },
      ],
    });
    const result = await searchRegistry({
      type: 'nuget',
      packageName: 'newtonsoft.json',
    });
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]).toMatchObject({
      name: 'Newtonsoft.Json',
      homepage: 'https://www.newtonsoft.com/json',
    });
    expect(result.artifacts[0]?.repository).toBeUndefined();
    expect(requested(1).pathname).toBe(
      '/v3/registration5-gz-semver2/newtonsoft.json/index.json'
    );
  });

  it('rejects unexpected NuGet discovery hosts', async () => {
    fetch.mockResolvedValue({
      resources: [
        {
          '@type': 'SearchQueryService',
          '@id': 'https://nuget.org.evil.test/query',
        },
      ],
    });
    await expect(
      searchRegistry({ type: 'nuget', keywords: ['json'] })
    ).rejects.toMatchObject({ code: 'provider_error' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('executes NuGet offset pagination without dropping packages', async () => {
    fetch
      .mockResolvedValueOnce(service)
      .mockResolvedValueOnce({ totalHits: 3, data: [{ id: 'A' }, { id: 'B' }] })
      .mockResolvedValueOnce(service)
      .mockResolvedValueOnce({ totalHits: 3, data: [{ id: 'C' }] });
    const query: ArtifactQuery = {
      type: 'nuget',
      keywords: ['json'],
      pageSize: 2,
    };
    const first = await searchRegistry(query);
    const second = await searchRegistry(query, first.nextState);
    expect(
      [...first.artifacts, ...second.artifacts].map(item => item.name)
    ).toEqual(['A', 'B', 'C']);
    expect(requested(3).searchParams.get('skip')).toBe('2');
    expect(second.nextState).toBeUndefined();
  });

  it('resolves Go module source without guessing from module path', async () => {
    fetch.mockResolvedValue({
      path: 'golang.org/x/time',
      version: 'v0.16.0',
      repoUrl: 'https://cs.opensource.google/go/x/time',
    });
    const result = await searchRegistry({
      type: 'go',
      packageName: 'golang.org/x/time',
    });
    expect(result.artifacts[0]).toMatchObject({
      name: 'golang.org/x/time',
      modulePath: 'golang.org/x/time',
      repository: 'https://cs.opensource.google/go/x/time',
    });
    expect(result.artifacts[0]?.packagePath).toBeUndefined();
  });

  it.each([400, 404])(
    'falls back from a Go module to exact package on %i only',
    async status => {
      fetch
        .mockRejectedValueOnce(
          Object.assign(new Error('package path'), { status })
        )
        .mockResolvedValueOnce({
          path: 'golang.org/x/time/rate',
          modulePath: 'golang.org/x/time',
          version: 'v0.16.0',
          synopsis: 'Rate limiter',
        });
      const result = await searchRegistry({
        type: 'go',
        packageName: 'golang.org/x/time/rate',
      });
      expect(requested(1).pathname).toBe('/v1/package/golang.org/x/time/rate');
      expect(result.artifacts[0]).toMatchObject({
        name: 'golang.org/x/time/rate',
        packagePath: 'golang.org/x/time/rate',
        modulePath: 'golang.org/x/time',
      });
    }
  );

  it('preserves Go empty pages with tokens and distinct packages in one module', async () => {
    fetch
      .mockResolvedValueOnce({
        items: [],
        total: -1,
        nextPageToken: 'opaque&token=1',
      })
      .mockResolvedValueOnce({
        items: [
          { packagePath: 'a/b', modulePath: 'a', synopsis: 'B' },
          { packagePath: 'a/c', modulePath: 'a', synopsis: 'C' },
        ],
        total: -1,
      });
    const query: ArtifactQuery = {
      type: 'go',
      keywords: ['cache'],
      pageSize: 2,
    };
    const first = await searchRegistry(query);
    expect(first).toMatchObject({
      artifacts: [],
      nextState: { token: 'opaque&token=1' },
    });
    expect(first.total).toBeUndefined();
    const second = await searchRegistry(query, first.nextState);
    expect(second.artifacts.map(item => item.name)).toEqual(['a/b', 'a/c']);
    expect(requested(1).searchParams.get('token')).toBe('opaque&token=1');
    const previous = requested(0);
    const following = requested(1);
    following.searchParams.delete('token');
    expect(following.href).toBe(previous.href);
  });

  it('reads current Packagist p2 metadata and explicit source repository', async () => {
    fetch.mockResolvedValue({
      minified: 'composer/2.0',
      packages: {
        'monolog/monolog': [
          {
            name: 'monolog/monolog',
            version: '3.0.0',
            source: { url: 'https://github.com/Seldaek/monolog.git' },
            license: ['MIT'],
          },
          { version: '2.0.0' },
        ],
      },
    });
    const result = await searchRegistry({
      type: 'packagist',
      packageName: 'Monolog/Monolog',
    });
    expect(requested().href).toBe(
      'https://repo.packagist.org/p2/monolog/monolog.json'
    );
    expect(result.artifacts[0]).toMatchObject({
      version: '3.0.0',
      license: 'MIT',
      repository: 'https://github.com/Seldaek/monolog.git',
    });
  });

  it.each(['empty', 'missing'] as const)(
    'resolves development-only Packagist packages after %s tagged metadata',
    async mode => {
      if (mode === 'empty') {
        fetch.mockResolvedValueOnce({
          packages: { 'roave/security-advisories': [] },
        });
      } else {
        fetch.mockRejectedValueOnce(missing());
      }
      fetch.mockResolvedValueOnce({
        packages: {
          'roave/security-advisories': [
            {
              name: 'roave/security-advisories',
              version: 'dev-latest',
              source: {
                url: 'https://github.com/Roave/SecurityAdvisories.git',
              },
            },
          ],
        },
      });
      const result = await searchRegistry({
        type: 'packagist',
        packageName: 'roave/security-advisories',
      });
      expect(result.artifacts).toEqual([
        expect.objectContaining({
          name: 'roave/security-advisories',
          version: 'dev-latest',
          repository: 'https://github.com/Roave/SecurityAdvisories.git',
        }),
      ]);
      expect(requested(1).href).toBe(
        'https://repo.packagist.org/p2/roave/security-advisories~dev.json'
      );
    }
  );

  it('prefers available tagged Packagist releases without fetching development metadata', async () => {
    fetch.mockResolvedValueOnce({
      packages: { 'a/b': [{ name: 'a/b', version: '2.0.0' }] },
    });
    const result = await searchRegistry({
      type: 'packagist',
      packageName: 'a/b',
    });
    expect(result.artifacts[0]?.version).toBe('2.0.0');
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns empty only when tagged and development Packagist metadata are absent', async () => {
    fetch
      .mockResolvedValueOnce({ packages: { 'a/b': [] } })
      .mockRejectedValueOnce(missing());
    await expect(
      searchRegistry({ type: 'packagist', packageName: 'a/b' })
    ).resolves.toMatchObject({ artifacts: [], total: 0 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('reconstructs Packagist pagination without following arbitrary next URLs', async () => {
    fetch
      .mockResolvedValueOnce({
        results: [{ name: 'a/b' }],
        total: 2,
        next: 'https://attacker.test/steal',
      })
      .mockResolvedValueOnce({ results: [{ name: 'c/d' }], total: 2 });
    const query: ArtifactQuery = {
      type: 'packagist',
      keywords: ['cache'],
      pageSize: 1,
    };
    const first = await searchRegistry(query);
    const second = await searchRegistry(query, first.nextState);
    expect(
      [...first.artifacts, ...second.artifacts].map(item => item.name)
    ).toEqual(['a/b', 'c/d']);
    expect(requested(1).origin).toBe('https://packagist.org');
    expect(requested(1).searchParams.get('page')).toBe('2');
  });

  it('returns a complete fixed RubyGems native page for outer cursor buffering', async () => {
    const native = Array.from({ length: 30 }, (_, index) => ({
      name: `gem${index}`,
      version: '1',
    }));
    fetch
      .mockResolvedValueOnce(native)
      .mockResolvedValueOnce([{ name: 'gem30' }])
      .mockResolvedValueOnce([]);
    const query: ArtifactQuery = {
      type: 'rubygems',
      keywords: ['cache'],
      pageSize: 2,
    };
    let state: ArtifactProviderState | undefined;
    const names: string[] = [];
    do {
      const response = await searchRegistry(query, state);
      names.push(...response.artifacts.map(item => item.name));
      state = response.nextState;
    } while (state);
    expect(names).toEqual(
      Array.from({ length: 31 }, (_, index) => `gem${index}`)
    );
    expect(requested(2).searchParams.get('page')).toBe('3');
    expect(requested().searchParams.has('per_page')).toBe(false);
  });

  it('resolves RubyGems explicit source and ignores credentials in URLs', async () => {
    fetch.mockResolvedValue({
      name: 'rack',
      version: '3',
      info: 'Rack',
      source_code_uri: 'https://github.com/rack/rack',
      homepage_uri: 'https://user:secret@example.com',
      licenses: ['MIT'],
    });
    const response = await searchRegistry({
      type: 'rubygems',
      packageName: 'rack',
    });
    expect(response.artifacts[0]).toMatchObject({
      repository: 'https://github.com/rack/rack',
      license: 'MIT',
    });
    expect(response.artifacts[0]?.homepage).toBeUndefined();
  });

  it.each(['pypi', 'crates', 'packagist', 'rubygems', 'go'] as const)(
    'treats exact %s 404 as empty',
    async type => {
      fetch.mockRejectedValue(missing());
      await expect(
        searchRegistry({ type, packageName: 'a/b' })
      ).resolves.toMatchObject({ artifacts: [], total: 0 });
    }
  );

  it.each([401, 403, 429, 500, 404])(
    'classifies provider HTTP %i without leaking upstream error text',
    async status => {
      fetch.mockRejectedValue(
        Object.assign(new Error('secret-token at private-path'), { status })
      );
      let caught: unknown;
      try {
        await searchRegistry({ type: 'crates', keywords: ['cache'] });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(ArtifactProviderError);
      expect(caught).toMatchObject({
        status,
        code:
          status === 401 || status === 403
            ? 'authentication'
            : status === 429
              ? 'rate_limit'
              : 'provider_error',
      });
      expect((caught as Error).message).not.toContain('secret');
    }
  );

  it('does not fall back to Go package lookup after a rate limit', async () => {
    fetch.mockRejectedValue(Object.assign(new Error('limit'), { status: 429 }));
    await expect(
      searchRegistry({ type: 'go', packageName: 'a/b' })
    ).rejects.toMatchObject({ code: 'rate_limit' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    { crates: null },
    { crates: [{ description: 'no identity' }] },
    { crates: [null] },
  ])(
    'reports malformed provider data instead of dropping results',
    async response => {
      fetch.mockResolvedValue(response);
      await expect(
        searchRegistry({ type: 'crates', keywords: ['x'] })
      ).rejects.toMatchObject({ code: 'provider_error' });
    }
  );

  it.each(['../secret', 'vendor/../secret', 'vendor//name'])(
    'rejects unsafe coordinate %s before network access',
    async packageName => {
      await expect(
        searchRegistry({ type: 'packagist', packageName })
      ).rejects.toMatchObject({ code: 'invalid_query' });
      expect(fetch).not.toHaveBeenCalled();
    }
  );

  it('does not accept npm or ambiguous modes in non-npm dispatch', async () => {
    await expect(
      searchRegistry({ type: 'npm', packageName: 'x' })
    ).rejects.toMatchObject({ code: 'unsupported_capability' });
    await expect(
      searchRegistry({ type: 'go', packageName: 'x', keywords: ['x'] })
    ).rejects.toMatchObject({ code: 'invalid_query' });
  });

  it('selects the highest NuGet page regardless of order and follows its official metadata link', async () => {
    fetch
      .mockResolvedValueOnce(registrationService)
      .mockResolvedValueOnce({
        items: [
          {
            upper: '10.0.0',
            '@id':
              'https://api.nuget.org/v3/registration5-gz-semver2/pkg/page/high.json',
          },
          {
            upper: '9.0.0',
            items: [{ catalogEntry: { id: 'Pkg', version: '9.0.0' } }],
          },
        ],
      })
      .mockResolvedValueOnce({
        items: [
          { catalogEntry: { id: 'Pkg', version: '10.0.0-beta.2' } },
          { catalogEntry: { id: 'Pkg', version: '10.0.0' } },
        ],
      });
    expect(
      (await searchRegistry({ type: 'nuget', packageName: 'pkg' })).artifacts[0]
        ?.version
    ).toBe('10.0.0');
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(requested(2).pathname).toContain('/page/high.json');
  });

  it.each([
    ['1.0.0-beta.2', '1.0.0-beta.10', '1.0.0-beta.10'],
    ['1.0.0-beta', '1.0.0-beta.1', '1.0.0-beta.1'],
    ['1.0.0-2', '1.0.0-alpha', '1.0.0-alpha'],
    ['1.0.0-z', '1.0.0-a', '1.0.0-z'],
    ['1.0.0.2', '1.0.0.10', '1.0.0.10'],
    ['1.0.0+metadata', '1.0.0', '1.0.0+metadata'],
  ])('uses NuGet precedence for %s and %s', async (first, second, expected) => {
    fetch.mockResolvedValueOnce(registrationService).mockResolvedValueOnce({
      items: [
        {
          upper: expected,
          items: [first, second].map(version => ({
            catalogEntry: { id: 'Pkg', version },
          })),
        },
      ],
    });
    expect(
      (await searchRegistry({ type: 'nuget', packageName: 'pkg' })).artifacts[0]
        ?.version
    ).toBe(expected);
  });

  it('treats an absent NuGet registration index as empty', async () => {
    fetch
      .mockResolvedValueOnce(registrationService)
      .mockRejectedValueOnce(missing());
    await expect(
      searchRegistry({ type: 'nuget', packageName: 'missing' })
    ).resolves.toEqual({ artifacts: [], total: 0 });
  });

  it('reports the NuGet search terminal limit with the final reachable page', async () => {
    fetch
      .mockResolvedValueOnce(service)
      .mockResolvedValueOnce({ totalHits: 4000, data: [{ id: 'Last' }] });
    const result = await searchRegistry(
      { type: 'nuget', keywords: ['json'], pageSize: 1 },
      { offset: 3000 }
    );
    expect(result.artifacts[0]?.name).toBe('Last');
    expect(result.nextState).toBeUndefined();
    expect(result.terminalLimit?.reason).toContain('3000');
    expect(requested(1).searchParams.get('take')).toBe('1000');
    fetch.mockClear();
    await searchRegistry(
      { type: 'nuget', keywords: ['json'] },
      { offset: 3001 }
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reaches the NuGet skip boundary without overlapping or losing the tail', async () => {
    fetch
      .mockResolvedValueOnce(service)
      .mockResolvedValueOnce({
        totalHits: 4001,
        data: [{ id: 'BeforeBoundary' }],
      })
      .mockResolvedValueOnce(service)
      .mockResolvedValueOnce({
        totalHits: 4001,
        data: Array.from({ length: 1000 }, (_, i) => ({ id: `Tail${i}` })),
      });
    const query: ArtifactQuery = {
      type: 'nuget',
      keywords: ['json'],
      pageSize: 7,
    };
    const before = await searchRegistry(query, { offset: 2999 });
    expect(before.nextState).toEqual({ offset: 3000 });
    expect(requested(1).searchParams.get('take')).toBe('1');
    const last = await searchRegistry(query, before.nextState);
    expect(last.artifacts).toHaveLength(1000);
    expect(last.nextState).toBeUndefined();
    expect(last.terminalLimit).toBeDefined();
  });

  it('reports an unexpected empty crates page as a terminal limit', async () => {
    fetch.mockResolvedValue({ crates: [], meta: { total: 4 } });
    const result = await searchRegistry({
      type: 'crates',
      keywords: ['json'],
      pageSize: 1,
    });
    expect(result.nextState).toBeUndefined();
    expect(result.terminalLimit?.reason).toContain('empty page');
  });

  it.each([
    ['pypi', { info: { name: 'different' } }],
    ['crates', { crate: { name: 'different' } }],
    [
      'maven',
      '<metadata><groupId>a</groupId><artifactId>different</artifactId></metadata>',
    ],
    ['go', { path: 'different' }],
    ['packagist', { packages: { 'a/b': [{ name: 'different' }] } }],
    ['rubygems', { name: 'different' }],
  ] as const)(
    'rejects mismatched exact %s identities',
    async (type, response) => {
      fetch.mockResolvedValue(response);
      await expect(
        searchRegistry({ type, packageName: type === 'maven' ? 'a:b' : 'a/b' })
      ).rejects.toMatchObject({
        code: 'provider_error',
        message: expect.stringContaining('different package'),
      });
    }
  );

  it('accepts normalized Python package identity', async () => {
    fetch.mockResolvedValue({ info: { name: 'my-package' } });
    await expect(
      searchRegistry({ type: 'pypi', packageName: 'My_Package' })
    ).resolves.toMatchObject({ artifacts: [{ name: 'my-package' }] });
  });

  it('returns actionable invalid-query guidance for ambiguous Go package paths', async () => {
    fetch.mockRejectedValue(
      Object.assign(new Error('ambiguous'), { status: 400 })
    );
    await expect(
      searchRegistry({ type: 'go', packageName: 'a/b' })
    ).rejects.toMatchObject({
      code: 'invalid_query',
      message: expect.stringContaining('containing module'),
    });
  });

  it('uses Maven latest when release is absent and ignores comment content', async () => {
    fetch.mockResolvedValue(
      '<metadata><!-- <release>fake</release> --><groupId>a</groupId><artifactId>b</artifactId><versioning><latest>1.0</latest></versioning></metadata>'
    );
    const result = await searchRegistry({ type: 'maven', packageName: 'a:b' });
    expect(result.artifacts[0]?.version).toBe('1.0');
  });

  it('does not expand external XML entities from Maven metadata', async () => {
    fetch.mockResolvedValue(
      '<!DOCTYPE metadata [<!ENTITY source SYSTEM "https://evil.test/">]><metadata><groupId>a</groupId><artifactId>b</artifactId></metadata>'
    );
    await expect(
      searchRegistry({ type: 'maven', packageName: 'a:b' })
    ).rejects.toMatchObject({ code: 'provider_error' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('treats missing Maven metadata as empty', async () => {
    fetch.mockRejectedValue(missing());
    await expect(
      searchRegistry({ type: 'maven', packageName: 'a:b' })
    ).resolves.toEqual({ artifacts: [], total: 0 });
  });

  it('preserves explicitly versioned Maven search rows', async () => {
    fetch.mockResolvedValue({
      response: {
        numFound: 2,
        docs: [
          { g: 'a', a: 'b', v: '1' },
          { g: 'a', a: 'b', v: '2' },
        ],
      },
    });
    const result = await searchRegistry({ type: 'maven', keywords: ['g:a'] });
    expect(result.artifacts.map(item => [item.name, item.version])).toEqual([
      ['a:b', '1'],
      ['a:b', '2'],
    ]);
  });
});
