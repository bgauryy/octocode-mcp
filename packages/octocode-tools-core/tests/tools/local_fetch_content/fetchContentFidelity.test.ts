import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setRuntimeSurface, _resetRuntimeSurface } from '@octocodeai/config';
import { executeFetchContent } from '../../../src/tools/local_fetch_content/execution.js';

describe('exact file-read batch invariance', () => {
  let dir: string;

  beforeEach(async () => {
    setRuntimeSurface('cli');
    dir = await mkdtemp(join(process.cwd(), '.tmp-content-fidelity-'));
    await mkdir(join(dir, 'nested'));
  });

  afterEach(async () => {
    _resetRuntimeSurface();
    await rm(dir, { recursive: true, force: true });
  });

  it('preserves identical source bytes alone and with an unrelated batch query', async () => {
    const file = join(dir, 'nested', 'source.md');
    const companion = join(dir, 'companion.md');
    const source = `[source](${join(dir, 'target.ts')})\n🌍 café\r\n`;
    await writeFile(file, source);
    await writeFile(companion, 'unrelated companion\n');
    const query = { path: file, fullContent: true, minify: 'none' as const };
    const extra = { ...query, path: companion };

    for (const queries of [[query], [query, extra], [extra, query]]) {
      const result = await executeFetchContent({ queries });
      const output = result.structuredContent as {
        results: Array<{ status?: string; data: { content?: string } }>;
      };
      const row = output.results[queries.indexOf(query)]!;
      expect(row.status).not.toBe('error');
      expect(row.data.content).toBe(source);
      expect(
        result.content?.some(
          block => 'text' in block && block.text.includes(source.trimEnd())
        )
      ).toBe(true);
    }
  });

  it('reconstructs path-bearing content by executing every returned continuation', async () => {
    const file = join(dir, 'nested', 'paged.md');
    const companion = join(dir, 'companion.md');
    const source = `[source](${join(dir, 'target.ts')}) 🌍 café\r\n`.repeat(30);
    await writeFile(file, source);
    await writeFile(companion, 'unrelated companion\n');
    let query: Record<string, unknown> = {
      path: file,
      minify: 'none',
      charLength: 250,
    };
    const chunks: string[] = [];

    for (let page = 0; page < 100; page++) {
      const result = await executeFetchContent({
        queries: [query, { path: companion, fullContent: true }],
      } as never);
      const row = (
        result.structuredContent as {
          results: Array<{
            data: {
              content: string;
              next?: {
                continueChars?: {
                  tool: string;
                  query: Record<string, unknown>;
                };
              };
            };
          }>;
        }
      ).results[0]!;
      chunks.push(row.data.content);
      const next = row.data.next?.continueChars;
      if (!next) break;
      expect(next.tool).toBe('localGetFileContent');
      expect(next.query.path).toBe(file);
      query = next.query;
    }

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe(source);
  });
});
