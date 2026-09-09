import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeAwarenessCommand } from '../src/command-api.js';
import { runCommandFeatureSweep } from './helpers/command-feature-sweep.js';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

describe('command feature sweep helper', () => {
  it('executes every benchmark gap through the source command API', async () => {
    const root = mkdtempSync(join(tmpdir(), 'awareness-feature-sweep-'));
    roots.push(root);
    const call = async (command: string, params: Record<string, unknown> = {}, options?: { expectedExit?: number }) => {
      const result = await executeAwarenessCommand({ command, params }, {
        database: join(root, 'awareness.sqlite3'), workspace: root, agentId: 'lead', compact: true,
      });
      expect(result.exitCode, `${command}: ${JSON.stringify(result)}`).toBe(options?.expectedExit ?? 0);
      return result.payload;
    };
    const commands = await runCommandFeatureSweep({ call, workspace: root, tempRoot: root });
    expect(new Set(commands)).toEqual(new Set([
      'agent register', 'agent touch', 'agent leave', 'plan create', 'plan list', 'plan show', 'plan join', 'plan doc', 'task create', 'task list', 'task show', 'task claim', 'task heartbeat',
      'task release', 'task retry', 'task submit', 'verify mark', 'verify audit', 'work show', 'refinement get', 'refinement delete', 'lock wait', 'work start', 'work end', 'refinement set',
      'lock prune', 'signal publish', 'signal prune', 'query files', 'query all', 'query developer-review', 'reflect mine-weakness',
      'reflect export-harness', 'reflect developer-review', 'agent touch', 'memory store-verified', 'memory recall-verified', 'memory evaluate',
      'memory prune', 'schema command', 'handoff add', 'handoff list', 'handoff clear',
    ]));
  });
});
