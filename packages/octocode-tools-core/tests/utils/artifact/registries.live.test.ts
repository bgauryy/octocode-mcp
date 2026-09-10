import { describe, expect, it } from 'vitest';
import { searchRegistry } from '../../../src/utils/artifact/index.js';
import type { ArtifactQuery } from '../../../src/utils/artifact/types.js';

// Opt-in smoke of official public registries; normal test runs stay deterministic/offline.
describe.skipIf(process.env.OCTOCODE_ARTIFACT_LIVE !== '1')(
  'live artifact registries',
  () => {
    const exact: ArtifactQuery[] = [
      { type: 'pypi', packageName: 'requests' },
      { type: 'crates', packageName: 'serde' },
      { type: 'maven', packageName: 'com.google.guava:guava' },
      { type: 'nuget', packageName: 'Newtonsoft.Json' },
      { type: 'go', packageName: 'golang.org/x/time' },
      { type: 'packagist', packageName: 'monolog/monolog' },
      { type: 'packagist', packageName: 'roave/security-advisories' },
      { type: 'rubygems', packageName: 'rack' },
    ];
    for (const query of exact) {
      it(`resolves ${query.type}:${query.packageName}`, async () => {
        const result = await searchRegistry(query);
        expect(result.artifacts).toHaveLength(1);
        expect(result.artifacts[0]?.name.toLowerCase()).toBe(
          query.packageName!.toLowerCase()
        );
        expect(result.artifacts[0]?.version).toBeTruthy();
      }, 60_000);
    }
    for (const type of [
      'crates',
      'maven',
      'nuget',
      'go',
      'packagist',
      'rubygems',
    ] as const) {
      it(`discovers ${type} and executes the provider continuation`, async () => {
        const query: ArtifactQuery = { type, keywords: ['json'], pageSize: 2 };
        const first = await searchRegistry(query);
        expect(first.artifacts.length).toBeGreaterThan(0);
        expect(first.nextState).toBeDefined();
        const second = await searchRegistry(query, first.nextState);
        expect(second.artifacts.length).toBeGreaterThan(0);
        expect(
          new Set(
            [...first.artifacts, ...second.artifacts].map(item => item.name)
          ).size
        ).toBe(first.artifacts.length + second.artifacts.length);
      }, 60_000);
    }
  }
);
