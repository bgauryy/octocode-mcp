import { describe, expect, it, vi } from 'vitest';
import { ArtifactSearchBulkQueryLocalSchema } from '@octocodeai/octocode-core/schema';

vi.mock('../../../src/utils/package/npm/npmRegistry.js', () => ({
  resolveNpmRegistryContext: vi.fn(),
  fetchNpmRegistryJson: vi.fn(),
}));
vi.mock('../../../src/utils/http/cache/dataCache.js', () => ({
  withDataCache: (_key: string, run: () => unknown) => run(),
}));
vi.mock('../../../src/utils/http/circuitBreaker.js', () => ({
  isCircuitOpen: () => false,
}));

import {
  fetchNpmRegistryJson,
  resolveNpmRegistryContext,
} from '../../../src/utils/package/npm/npmRegistry.js';
import { searchPackages } from '../../../src/tools/package_search/execution.js';

interface PageData {
  artifacts: Array<{ name: string }>;
  pagination: { hasMore: boolean; returned: number; totalFound: number };
  next?: {
    nextPage: { tool: string; query: Record<string, unknown> };
  };
}

describe('npm registries with smaller native result pages', () => {
  it.each([6, 20])(
    'executes public continuations to retrieve all %i artifacts exactly once',
    async total => {
      const registry = 'https://capped-registry.example.test';
      const fixture = Array.from({ length: total }, (_, i) => `fixture-${i}`);
      const requestedOffsets: number[] = [];
      vi.mocked(resolveNpmRegistryContext).mockResolvedValue({
        registry,
        cacheIdentity: 'capped-fixture',
        options: {},
      });
      vi.mocked(fetchNpmRegistryJson).mockImplementation(
        async (_context, path) => {
          const request = new URL(path, registry + '/');
          expect(request.pathname).toBe('/-/v1/search');
          expect(request.searchParams.get('size')).toBe('10');
          const offset = Number(request.searchParams.get('from') ?? 0);
          requestedOffsets.push(offset);
          return {
            total,
            objects: fixture.slice(offset, offset + 5).map(name => ({
              package: { name, version: '1.0.0' },
            })),
          };
        }
      );

      let query: Record<string, unknown> = {
        type: 'npm',
        keywords: ['fixture'],
        pageSize: 10,
        registry,
      };
      const collected: string[] = [];
      let complete = false;
      for (let page = 0; page < total; page++) {
        const parsed = ArtifactSearchBulkQueryLocalSchema.parse({
          queries: [query],
        });
        const response = await searchPackages({ queries: parsed.queries });
        const row = (
          response.structuredContent as {
            results: Array<{ status?: string; data: PageData }>;
          }
        ).results[0]!;
        expect(row.status).not.toBe('error');
        const data = row.data;
        expect(data.pagination.totalFound).toBe(total);
        collected.push(...data.artifacts.map(artifact => artifact.name));
        expect(data.pagination.hasMore).toBe(collected.length < total);
        if (!data.pagination.hasMore) {
          expect(data.next).toBeUndefined();
          complete = true;
          break;
        }
        expect(data.next?.nextPage.tool).toBe('artifactSearch');
        query = data.next!.nextPage.query;
        expect(query).toMatchObject({
          type: 'npm',
          keywords: ['fixture'],
          pageSize: 10,
          registry,
        });
      }

      expect(complete).toBe(true);
      expect(collected).toEqual(fixture);
      expect(new Set(collected).size).toBe(total);
      expect(requestedOffsets).toEqual(
        Array.from({ length: Math.ceil(total / 5) }, (_, i) => i * 5)
      );
    }
  );
});
