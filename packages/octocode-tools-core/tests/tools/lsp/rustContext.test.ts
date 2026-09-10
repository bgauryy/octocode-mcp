import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { LspSearchQuerySchema } from '@octocodeai/octocode-core/schema';
import {
  describeRustContext,
  semanticSnapshotItems,
} from '../../../src/tools/lsp/semantic_content/semanticSnapshot.js';
import type { LspSearchQuery } from '../../../src/tools/lsp/shared/semanticTypes.js';
import { attachReadinessWarning } from '../../../src/tools/lsp/shared/readiness.js';
import { BaseLspSearchQuerySchema as PublicLspSearchQuerySchema } from '@octocodeai/octocode-core/schema';

const query = {
  uri: '/workspace/main.rs',
  operation: 'references' as const,
  symbolName: 'target',
  lineHint: 1,
};

describe('public Rust semantic contexts', () => {
  it('marks an unconfirmed empty answer as typed partial evidence', () => {
    const envelope = {
      operation: 'definition' as const,
      uri: query.uri,
      lsp: { serverAvailable: true },
      payload: {
        kind: 'empty' as const,
        category: 'noLocations' as const,
        reason: 'No locations',
      },
    };
    expect(
      attachReadinessWarning(envelope, 'timeout').partialReasons
    ).toContain('readinessUnconfirmed');
    expect(attachReadinessWarning(envelope, 'timeout').incompleteResults).toBe(
      true
    );
    expect(
      attachReadinessWarning(envelope, 'progressIdle').partialReasons
    ).toBeUndefined();
  });
  it('can publish the public context as JSON Schema', () => {
    expect(() => z.toJSONSchema(LspSearchQuerySchema)).not.toThrow();
  });
  it('keeps public anchor branches aligned with runtime requirements', () => {
    expect(
      PublicLspSearchQuerySchema.safeParse({
        uri: '/workspace/main.ts',
        operation: 'definition',
        symbolName: 'target',
        lineHint: 1,
      }).success
    ).toBe(true);
    expect(
      PublicLspSearchQuerySchema.safeParse({
        uri: '/workspace/main.ts',
        operation: 'definition',
        position: { line: 0, character: 2 },
      }).success
    ).toBe(true);
    expect(
      PublicLspSearchQuerySchema.safeParse({
        uri: '/workspace/main.ts',
        operation: 'documentSymbols',
        symbolName: 'target',
        lineHint: 1,
      }).success
    ).toBe(false);
    expect(
      PublicLspSearchQuerySchema.safeParse({
        uri: '/workspace/main.ts',
        operation: 'definition',
        symbolName: 'target',
        lineHint: 1,
        position: null,
      }).success
    ).toBe(false);
    expect(
      PublicLspSearchQuerySchema.safeParse({
        operation: 'workspaceSymbol',
        symbolName: 'target',
      }).success
    ).toBe(false);
    expect(
      PublicLspSearchQuerySchema.safeParse({
        operation: 'workspaceSymbol',
        symbolName: 'target',
        workspaceRoot: '/workspace',
      }).success
    ).toBe(true);
  });
  it('publishes the workspace root alternative in generated JSON Schema', () => {
    const generated = z.fromJSONSchema(
      z.toJSONSchema(PublicLspSearchQuerySchema, { io: 'input' })
    );
    expect(
      generated.safeParse({
        operation: 'workspaceSymbol',
        symbolName: 'target',
      }).success
    ).toBe(false);
    expect(
      generated.safeParse({
        operation: 'workspaceSymbol',
        symbolName: 'target',
        workspaceRoot: '/workspace',
      }).success
    ).toBe(true);
  });
  it('normalizes equivalent contexts and requires explicit execution permission', () => {
    const first = LspSearchQuerySchema.parse({
      ...query,
      rustContext: { features: ['b', 'a', 'a'], cfgs: ['z', 'a'] },
    });
    const second = LspSearchQuerySchema.parse({
      ...query,
      rustContext: { cfgs: ['a', 'z'], features: ['a', 'b'] },
    });
    expect(describeRustContext(first)).toEqual(describeRustContext(second));
    expect(first.rustContext).toMatchObject({
      buildScripts: false,
      procMacros: false,
    });
    expect(
      LspSearchQuerySchema.safeParse({
        ...query,
        rustContext: { procMacros: true },
      }).success
    ).toBe(false);
    expect(
      LspSearchQuerySchema.safeParse({
        ...query,
        rustContext: { procMacros: true, buildScripts: true },
      }).success
    ).toBe(true);
    expect(
      LspSearchQuerySchema.safeParse({
        ...query,
        uri: '/workspace/main.ts',
        rustContext: {},
      }).success
    ).toBe(false);
  });

  it('never reuses a snapshot across build contexts even when locations coincide', () => {
    const rows = [
      { uri: query.uri, range: { start: { line: 1, character: 0 } } },
    ];
    const base = {
      ...query,
      rustContext: { features: ['a'] },
    } as LspSearchQuery;
    const first = semanticSnapshotItems(rows, base).snapshot;
    expect(
      semanticSnapshotItems(rows, { ...base, rustContext: { features: ['b'] } })
        .snapshot
    ).not.toBe(first);
    expect(semanticSnapshotItems(rows, { ...base, page: 2 }).snapshot).toBe(
      first
    );
    expect(describeRustContext(base)?.fingerprint).toMatch(/^rust-v1:/);
  });
});
