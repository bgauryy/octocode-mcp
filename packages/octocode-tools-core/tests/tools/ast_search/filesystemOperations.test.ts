import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findFiles } from '../../../src/tools/ast_search/filesystem/files.js';
import { viewFilesystemTree } from '../../../src/tools/ast_search/filesystem/tree.js';
import { AstSearchQuerySchema } from '@octocodeai/octocode-core/schema';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(path => rm(path, { recursive: true, force: true }))
  );
});

describe('canonical AST filesystem operations', () => {
  it.each(['files', 'tree'] as const)(
    'executes every %s continuation unchanged and covers the fixture',
    async operation => {
      const path = await mkdtemp(join(process.cwd(), '.tmp-ast-filesystem-'));
      roots.push(path);
      await Promise.all(
        ['c.ts', 'a.ts', 'b.ts'].map(name => writeFile(join(path, name), name))
      );
      const run = operation === 'files' ? findFiles : viewFilesystemTree;
      let query = AstSearchQuerySchema.parse({
        operation,
        path,
        entryType: 'f',
        sort: 'name',
        pageSize: 1,
        detail: 'full',
      });
      const paths: string[] = [];
      for (;;) {
        const result = await run(query as never);
        expect(result.status, JSON.stringify(result)).not.toBe('error');
        paths.push(
          ...('entries' in result ? (result.entries ?? []) : result.files).map(
            entry => entry.path
          )
        );
        const next = result.next?.nextPage;
        if (!next) break;
        expect(next.tool).toBe('astSearch');
        expect(next.query).toMatchObject({
          operation,
          pageSize: 1,
          sort: 'name',
        });
        expect(next.query).not.toHaveProperty('itemsPerPage');
        query = AstSearchQuerySchema.parse(next.query);
      }
      expect(paths).toEqual(
        ['a.ts', 'b.ts', 'c.ts'].map(name => join(path, name))
      );
      expect(new Set(paths).size).toBe(3);
    }
  );

  it('emits directly executable filesystem descent from directory discovery', async () => {
    const path = await mkdtemp(join(process.cwd(), '.tmp-ast-descent-'));
    roots.push(path);
    await mkdir(join(path, 'nested'));
    const result = await findFiles(
      AstSearchQuerySchema.parse({
        operation: 'files',
        path,
        entryType: 'd',
      }) as never
    );
    const next = result.next?.viewStructure;
    expect(next).toMatchObject({
      tool: 'astSearch',
      query: { operation: 'tree', treeKind: 'filesystem' },
    });
    expect(AstSearchQuerySchema.safeParse(next?.query).success).toBe(true);
  });

  it('preserves the distinct root and hidden-entry defaults', async () => {
    const path = await mkdtemp(join(process.cwd(), '.tmp-ast-defaults-'));
    roots.push(path);
    await Promise.all(
      ['visible.ts', '.hidden.ts'].map(name =>
        writeFile(join(path, name), name)
      )
    );
    const files = await findFiles(
      AstSearchQuerySchema.parse({ operation: 'files', path }) as never
    );
    expect(files.files.map(entry => entry.path)).toEqual(
      expect.arrayContaining([
        path,
        join(path, 'visible.ts'),
        join(path, '.hidden.ts'),
      ])
    );
    const tree = await viewFilesystemTree(
      AstSearchQuerySchema.parse({
        operation: 'tree',
        path,
        detail: 'full',
      }) as never
    );
    expect(tree.entries?.map(entry => entry.path)).toEqual([
      join(path, 'visible.ts'),
    ]);
    const hiddenTree = await viewFilesystemTree(
      AstSearchQuerySchema.parse({
        operation: 'tree',
        path,
        detail: 'full',
        hidden: true,
      }) as never
    );
    expect(hiddenTree.entries?.map(entry => entry.path)).toEqual([
      join(path, '.hidden.ts'),
      join(path, 'visible.ts'),
    ]);
  });

  it.each(['files', 'tree'] as const)(
    'preserves default pruning and explicit roots for %s',
    async operation => {
      const path = await mkdtemp(join(process.cwd(), '.tmp-ast-excludes-'));
      roots.push(path);
      const vendorPath = join(path, 'node_modules');
      await mkdir(vendorPath);
      await writeFile(
        join(vendorPath, 'dependency.ts'),
        'export const value = 1;'
      );
      await writeFile(join(path, 'source.ts'), 'export const value = 2;');
      const run = operation === 'files' ? findFiles : viewFilesystemTree;
      const pathsFor = async (scope: object) => {
        const result = await run(
          AstSearchQuerySchema.parse({
            operation,
            path,
            maxDepth: 3,
            entryType: 'f',
            detail: 'full',
            ...scope,
          }) as never
        );
        expect(result.status).not.toBe('error');
        return (
          'entries' in result ? (result.entries ?? []) : result.files
        ).map(entry => entry.path);
      };
      expect(await pathsFor({})).toEqual([join(path, 'source.ts')]);
      expect(await pathsFor({ excludeDir: [] })).toEqual(
        expect.arrayContaining([
          join(path, 'source.ts'),
          join(vendorPath, 'dependency.ts'),
        ])
      );
      expect(await pathsFor({ path: vendorPath })).toEqual([
        join(vendorPath, 'dependency.ts'),
      ]);
    }
  );
});
