import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { AcpBackend, AcpError } from '../src/external/acp.js';
import { groupMembers, processMatch } from '../src/shared/process.js';

const runner = fileURLToPath(new URL('../scripts/live-acp-reliability.mjs', import.meta.url));
const proxy = fileURLToPath(new URL('../scripts/acp-reliability-proxy.mjs', import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/external-acp-reliability-agent.mjs', import.meta.url));
const roots: string[] = [];
const backends: AcpBackend[] = [];
interface Wire { event: string; direction?: string; method?: string; updateKind?: string; proxyPid: number; proxyStarted?: string }
const entries = (journal: string): Wire[] => readFileSync(journal, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line) as Wire);
afterEach(async () => {
  await Promise.all(backends.splice(0).map((backend) => backend.close()));
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('ACP reliability runner and saved-session crash recovery', () => {
  it('requires explicit live or fixture mode before loading the extension or making calls', () => {
    for (const args of [[], ['--help']]) {
      const result = spawnSync(process.execPath, [runner, ...args], { encoding: 'utf8', timeout: 5000 });
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout).toContain('No arguments or --help prints this help and makes no model calls.');
    }
  });

  it.skipIf(process.platform === 'win32')('retains streamed failure evidence and reloads saved memory after three abrupt owned-process failures, without replay', async () => {
    const root = mkdtempSync(join(tmpdir(), 'acp-reliability-'));
    roots.push(root);
    let saved: string | undefined;
    for (let round = 0; round < 3; round += 1) {
      const journal = join(root, `round-${round}.jsonl`);
      const backend = await AcpBackend.connect({ command: process.execPath, args: [proxy, journal, process.execPath, fixture, join(root, 'sessions')], cwd: root, vendor: 'fixture', sessionId: saved, timeoutMs: 5000 }, async () => ({ outcome: { outcome: 'cancelled' } }));
      backends.push(backend);
      if (saved) expect((await backend.prompt('Reply only the remembered marker and current counter', { timeoutMs: 5000 })).text).toBe('RANDOM_MARKER:14');
      else {
        expect((await backend.prompt('Remember marker RANDOM_MARKER', { timeoutMs: 5000 })).text).toBe('RANDOM_MARKER');
        await backend.prompt('Remember counter 7', { timeoutMs: 5000 });
        expect((await backend.prompt('increment the remembered counter', { timeoutMs: 5000 })).text).toBe('RANDOM_MARKER:14');
      }
      saved = backend.sessionId;
      const before = entries(journal).filter((entry) => entry.direction === 'outbound' && entry.method === 'session/prompt').length;
      const pending = backend.prompt('CRASH_BOUNDARY', { timeoutMs: 5000 }).catch((error: unknown) => error);
      await vi.waitFor(() => expect(entries(journal).some((entry) => entry.updateKind === 'agent_message_chunk' && entries(journal).filter((entry) => entry.updateKind === 'agent_message_chunk').length > before)).toBe(true));
      await expect(backend.prompt('must never dispatch', { timeoutMs: 5000 })).rejects.toThrow('ACP session already has an active prompt.');
      const spawned = entries(journal).find((entry) => entry.event === 'spawn')!;
      expect(processMatch(spawned.proxyPid, spawned.proxyStarted)).toBe('same');
      process.kill(-spawned.proxyPid, 'SIGKILL');
      const failed = await pending;
      expect(failed).toBeInstanceOf(AcpError);
      expect((failed as AcpError).execution).toBe('uncertain');
      expect((failed as AcpError).partial.text).toBe('PARTIAL_CRASH_EVIDENCE');
      expect((failed as Error).message).toContain('not replayed');
      expect(entries(journal).filter((entry) => entry.direction === 'outbound' && entry.method === 'session/prompt')).toHaveLength(before + 1);
      await backend.close();
      expect(groupMembers(spawned.proxyPid)).toEqual([]);
    }
    const journal = join(root, 'final-recovery.jsonl');
    const recovered = await AcpBackend.connect({ command: process.execPath, args: [proxy, journal, process.execPath, fixture, join(root, 'sessions')], cwd: root, vendor: 'fixture', sessionId: saved, timeoutMs: 5000 }, async () => ({ outcome: { outcome: 'cancelled' } }));
    backends.push(recovered);
    expect(recovered.sessionId).toBe(saved);
    expect((await recovered.prompt('Reply only the remembered marker and current counter', { timeoutMs: 5000 })).text).toBe('RANDOM_MARKER:14');
    await recovered.close();
    expect(groupMembers(entries(journal).find((entry) => entry.event === 'spawn')!.proxyPid)).toEqual([]);
  }, 20000);
});
