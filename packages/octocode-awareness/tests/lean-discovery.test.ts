import { describe, expect, it } from 'vitest';
import { executeAwarenessCli } from '../src/command-cli.js';
import { getAwarenessCommandDescriptor, listAwarenessCommandDescriptors } from '../src/schema/cli.js';

type CompactCommands = {
  core: Record<string, string[]>;
  advanced: Record<string, string[]>;
};

async function schemaCommands(...args: string[]): Promise<Record<string, unknown>> {
  const result = await executeAwarenessCli(['schema', 'commands', ...args, '--compact']);
  expect(result.exitCode, JSON.stringify(result)).toBe(0);
  return result.payload as Record<string, unknown>;
}

describe('lean discovery tiers', () => {
  it('classifies administrative actions per route while keeping overlap locks visible', async () => {
    const result = await schemaCommands();
    const commands = result.commands as CompactCommands;

    expect(commands.core.memory).toEqual(expect.arrayContaining(['recall', 'record']));
    expect(commands.core.memory).not.toEqual(expect.arrayContaining(['forget', 'evaluate', 'reindex', 'prune']));
    expect(commands.advanced.memory).toEqual(expect.arrayContaining(['forget', 'evaluate', 'reindex', 'prune']));

    expect(commands.core.history).toEqual(expect.arrayContaining(['status', 'checkpoint', 'timeline', 'read']));
    expect(commands.advanced.history).toContain('capture');
    expect(commands.core.history).not.toEqual(expect.arrayContaining(['retention-preview', 'retention-prune', 'recovery', 'evidence']));
    expect(commands.advanced.history).toEqual(expect.arrayContaining(['retention-preview', 'retention-prune', 'recovery', 'evidence']));

    expect(commands.core.lock).toEqual(expect.arrayContaining(['acquire', 'wait', 'release']));
    expect(commands.advanced.lock).toEqual(expect.arrayContaining(['prune']));

    expect(commands.core.handoff).toEqual(expect.arrayContaining(['add', 'list', 'clear']));
    expect(commands.core.refinement ?? []).toEqual([]);
    expect(commands.core.session ?? []).toEqual([]);
    expect(commands.core.refinement ?? []).not.toEqual(expect.arrayContaining(['get', 'set']));
    expect(commands.core.session ?? []).not.toEqual(expect.arrayContaining(['capture']));

    const complete = await schemaCommands('--all');
    const allRows = complete.commands as Array<{ command: string }>;
    expect(allRows.map(row => row.command)).toEqual(expect.arrayContaining([
      'refinement get', 'refinement set', 'session capture',
    ]));
  });

  it('retains complete discovery and exact schemas as explicit escape hatches', async () => {
    const routine = listAwarenessCommandDescriptors({ routine: true }).map(row => row.command);
    expect(routine).toEqual(expect.arrayContaining(['handoff add', 'handoff list', 'handoff clear', 'history checkpoint']));
    for (const specialist of ['refinement get', 'session capture', 'memory prune', 'history capture', 'query all', 'database consolidate']) {
      expect(routine).not.toContain(specialist);
      expect(listAwarenessCommandDescriptors().some(row => row.command === specialist)).toBe(true);
    }
    const compact = await schemaCommands();
    const complete = await schemaCommands('--all');
    const allRows = complete.commands as Array<{ command: string }>;
    expect(allRows.map(row => row.command)).toContain('memory evaluate');
    expect(allRows.map(row => row.command)).toContain('history recovery');

    const exact = await executeAwarenessCli(['schema', 'command', 'memory', 'evaluate', '--compact']);
    expect(exact.exitCode).toBe(0);
    expect(exact.payload).toMatchObject({ 'x-cli-command': 'memory evaluate' });
    expect(compact).toMatchObject({ ok: true, hint: expect.stringContaining('--all') });
  });

  it('documents every detail trigger in the attend schema', () => {
    const descriptor = getAwarenessCommandDescriptor('attend');
    const details = JSON.stringify(descriptor?.inputSchema.properties);
    for (const trigger of ['query', 'file', 'artifact', 'repo', 'ref', 'include_bodies', 'explain_organ', 'revision']) {
      expect(details).toContain(trigger);
    }
    expect(JSON.stringify(descriptor?.inputSchema)).toContain('changes selects the separate Git view');
  });
});
