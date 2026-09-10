import { describe, expect, it } from 'vitest';
import { paginateArtifacts } from '../../../src/tools/package_search/pagination.js';

const query = { type: 'rubygems' as const, keywords: ['fixture'], pageSize: 2 };
const artifacts = Array.from({ length: 7 }, (_, i) => ({
  type: 'rubygems' as const,
  name: `gem-${i}`,
  registryUrl: `https://rubygems.org/gems/gem-${i}`,
}));

describe('artifactSearch provider-independent continuations', () => {
  it('rejects provider-incompatible cursor state instead of repeating the first page', async () => {
    const first = await paginateArtifacts(query, async () => ({
      artifacts,
      nextState: { page: 2 },
    }));
    const next = first.next!.nextPage.query;
    const cursor = JSON.parse(
      Buffer.from(next.cursor, 'base64url').toString('utf8')
    );
    cursor.state = { offset: 20 };
    await expect(
      paginateArtifacts(
        {
          ...next,
          cursor: Buffer.from(JSON.stringify(cursor)).toString('base64url'),
        },
        async () => ({ artifacts })
      )
    ).rejects.toThrow(/cursor/i);
  });

  it('reports a stalled provider token as a terminal limit', async () => {
    const input = { type: 'go' as const, keywords: ['http'] };
    const first = await paginateArtifacts(input, async () => ({
      artifacts: [],
      nextState: { token: 'same' },
    }));
    const second = await paginateArtifacts(
      first.next!.nextPage.query,
      async () => ({ artifacts: [], nextState: { token: 'same' } })
    );
    expect(second.terminalLimit).toBe(true);
    expect(second.next).toBeUndefined();
  });

  it('executes cursors through fixed provider pages without dropping overflow', async () => {
    let input: typeof query & { cursor?: string } = query;
    const found: string[] = [];
    for (let i = 0; i < 8; i++) {
      const result = await paginateArtifacts(input, async (_query, state) => {
        const page = state.page ?? 1;
        return {
          artifacts: artifacts.slice((page - 1) * 3, page * 3),
          ...(page < 3 ? { nextState: { page: page + 1 } } : {}),
        };
      });
      found.push(...result.artifacts.map(a => a.name));
      if (!result.next) break;
      input = result.next.nextPage.query as typeof input;
    }
    expect(found).toEqual(artifacts.map(a => a.name));
  });

  it('retains an empty provider page with a next token', async () => {
    const result = await paginateArtifacts(query, async () => ({
      artifacts: [],
      nextState: { token: 'next' },
    }));
    expect(result.pagination.hasMore).toBe(true);
    expect(result.next?.nextPage.query.cursor).toEqual(expect.any(String));
  });

  it('rejects a cursor reused with changed terms, size, or ecosystem', async () => {
    const loader = async () => ({ artifacts });
    const first = await paginateArtifacts(query, loader);
    const cursor = first.next!.nextPage.query.cursor;
    for (const changed of [
      { keywords: ['other'] },
      { pageSize: 3 },
      { type: 'npm' as const },
    ]) {
      await expect(
        paginateArtifacts({ ...query, ...changed, cursor }, loader)
      ).rejects.toThrow(/cursor/i);
    }
  });

  it('detects changed native pages before reading their remaining items', async () => {
    const first = await paginateArtifacts(query, async () => ({ artifacts }));
    await expect(
      paginateArtifacts(first.next!.nextPage.query, async () => ({
        artifacts: artifacts.slice(1),
      }))
    ).rejects.toThrow(/changed/i);
  });

  it('reports terminal provider bounds without inventing a continuation', async () => {
    const result = await paginateArtifacts(query, async () => ({
      artifacts: [],
      terminalLimit: { reason: 'provider ceiling' },
    }));
    expect(result.terminalLimit).toBe(true);
    expect(result.pagination.hasMore).toBe(true);
    expect(result.next).toBeUndefined();
  });

  it('makes replayed responses deterministic and rejects malformed cursors', async () => {
    const loader = async () => ({ artifacts });
    expect(await paginateArtifacts(query, loader)).toEqual(
      await paginateArtifacts(query, loader)
    );
    await expect(
      paginateArtifacts({ ...query, cursor: 'invalid' }, loader)
    ).rejects.toThrow(/cursor/i);
  });
});
