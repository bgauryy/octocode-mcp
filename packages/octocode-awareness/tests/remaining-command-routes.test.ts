import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeAwarenessCommand } from '../src/command-api.js';
import { MEMORY_EVALUATION_CORPUS_V1 } from '../src/memory-hardening.js';
import { openAwarenessStore } from '../src/coordination/open.js';

const roots: string[] = [];
const previousEmbedCommand = process.env['OCTOCODE_EMBED_CMD'];

afterEach(async () => {
  if (previousEmbedCommand === undefined) delete process.env['OCTOCODE_EMBED_CMD'];
  else process.env['OCTOCODE_EMBED_CMD'] = previousEmbedCommand;
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

async function context(prefix: string) {
  const workspace = await mkdtemp(join(tmpdir(), prefix));
  roots.push(workspace);
  return { workspace, database: join(workspace, 'awareness.sqlite3'), agentId: 'route-owner', compact: true };
}

const EMBED_SCRIPT = `
let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{
  const N=64;const v=new Array(N).fill(0);
  for(const w of d.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)){
    let h=0;for(const ch of w)h=(h*31+ch.charCodeAt(0))>>>0;
    v[h%N]+=1;
  }
  process.stdout.write(JSON.stringify({embedding:v,model:'test-bow'}));
});
`;

describe('remaining native command routes', () => {
  it('evaluates the supplied verified-memory corpus through the native API', async () => {
    const ctx = await context('awareness-route-evaluate-');
    delete process.env['OCTOCODE_EMBED_CMD'];
    const store = openAwarenessStore({ workspace: ctx.workspace, dbPath: ctx.database });
    try {
      const common = { verifiedAt: '2026-08-26T00:00:00.000Z', validUntil: '2026-09-01T00:00:00.000Z' };
      store.storeVerifiedMemory({ label: 'BUILD', text: 'sqlite migration transaction', sourceDigest: 'eval:fresh:migration', ...common });
      store.storeVerifiedMemory({ label: 'SECURITY', text: 'single use permission race', sourceDigest: 'eval:fresh:authorization', ...common });
      store.storeVerifiedMemory({ label: 'WORKFLOW', text: 'resume after compact', sourceDigest: 'eval:fresh:recovery', ...common });
      store.storeVerifiedMemory({ label: 'RELEASE', text: 'release command current', sourceDigest: 'eval:fresh:release', ...common });
      store.storeVerifiedMemory({ label: 'RELEASE', text: 'release command obsolete', sourceDigest: 'eval:stale:release', verifiedAt: '2026-07-01T00:00:00.000Z', validUntil: '2026-08-01T00:00:00.000Z' });
      store.storeVerifiedMemory({ label: 'DECISION', text: 'artifact decision', sourceDigest: 'eval:artifact:decision', scope: 'artifact', ...common });
      store.storeVerifiedMemory({ label: 'DECISION', text: 'artifact decision', sourceDigest: 'eval:project:decision', scope: 'project', ...common });
    } finally {
      store.close();
    }

    const result = await executeAwarenessCommand({
      command: 'memory evaluate',
      params: { corpus_json: JSON.stringify(MEMORY_EVALUATION_CORPUS_V1), now: '2026-08-26T00:00:00.000Z' },
    }, ctx);
    expect(result.exitCode, JSON.stringify(result)).toBe(0);
    const report = result.payload as Record<string, any>;
    expect(report.corpusId ?? report.corpus_id).toBe('octocode-memory-hardening-v1');
    expect(report.cases).toHaveLength(6);
    expect(report.aggregate).toMatchObject({ precision: 1, recall: 1, staleRecallRate: 0, falseRecallCost: 0 });
  });

  it('reindexes missing embeddings and makes the row available to native semantic recall', async () => {
    const ctx = await context('awareness-route-reindex-');
    delete process.env['OCTOCODE_EMBED_CMD'];
    const store = openAwarenessStore({ workspace: ctx.workspace, dbPath: ctx.database });
    try {
      store.storeMemory({ label: 'BUILD', text: 'database migration transaction' });
    } finally {
      store.close();
    }

    const scriptPath = join(ctx.workspace, 'embed.mjs');
    await writeFile(scriptPath, EMBED_SCRIPT, 'utf8');
    process.env['OCTOCODE_EMBED_CMD'] = `"${process.execPath}" "${scriptPath}"`;
    const reindexed = await executeAwarenessCommand({ command: 'memory reindex', params: { limit: 10 } }, ctx);
    expect(reindexed.exitCode, JSON.stringify(reindexed)).toBe(0);
    expect(reindexed.payload).toMatchObject({ enabled: true, scanned: 1, embedded: 1 });

    const recalled = await executeAwarenessCommand({
      command: 'memory recall',
      params: { query: 'database migration', semantic: true, limit: 5 },
    }, ctx);
    expect(recalled.exitCode, JSON.stringify(recalled)).toBe(0);
    expect(recalled.payload, JSON.stringify({ reindexed: reindexed.payload, recalled: recalled.payload })).toMatchObject({ memories: [expect.objectContaining({ label: 'BUILD', observation: 'database migration transaction' })] });
  });

  it('clears one native handoff while retaining it in the cleared ledger', async () => {
    const ctx = await context('awareness-route-handoff-');
    const added = await executeAwarenessCommand({ command: 'handoff add', params: { summary: 'Continue parser verification', file: ['src/parser.ts'] } }, ctx);
    expect(added.exitCode, JSON.stringify(added)).toBe(0);
    const handoffId = (added.payload as Record<string, any>).handoffId;
    expect(handoffId, JSON.stringify(added)).toEqual(expect.any(String));

    const before = await executeAwarenessCommand({ command: 'handoff list' }, ctx);
    expect(before.exitCode).toBe(0);
    expect(before.payload).toMatchObject([expect.objectContaining({ handoffId, clearedAt: null })]);

    const cleared = await executeAwarenessCommand({ command: 'handoff clear', params: { handoff_id: handoffId } }, ctx);
    expect(cleared.exitCode, JSON.stringify(cleared)).toBe(0);
    expect(cleared.payload).toEqual({ cleared: true });

    const active = await executeAwarenessCommand({ command: 'handoff list' }, ctx);
    expect(active.exitCode).toBe(0);
    expect(active.payload).toMatchObject([]);
    const retained = await executeAwarenessCommand({ command: 'handoff list', params: { include_cleared: true } }, ctx);
    expect(retained.exitCode).toBe(0);
    expect(retained.payload).toMatchObject([expect.objectContaining({ handoffId })]);
  });
});
