import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { KNOWN_FLAGS, COMMAND_ROUTES } from '../bin/cli-routing.js';
import { getAwarenessCommandDescriptor, listAwarenessCommandDescriptors, runSchemaCli } from '../src/schema/cli.js';
import { commandIndex } from '../src/schema/command-catalog.js';
import { tsxCli } from './helpers/tsx-cli.js';

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_SCRIPT = resolve(PACKAGE_ROOT, 'bin/awareness.ts');
const TSX_SCRIPT = tsxCli;

interface SourceResult {
  status: number;
  stdout: string;
  stderr: string;
  parsed: Record<string, unknown> | null;
}

function runSource(args: string[], cwd = process.cwd()): SourceResult {
  const result = spawnSync(process.execPath, [TSX_SCRIPT, SOURCE_SCRIPT, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 30_000,
  });
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(result.stdout) as Record<string, unknown>;
  } catch {
    // Help output is intentionally text.
  }
  return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr, parsed };
}

async function schemaCommand(command: string): Promise<Record<string, unknown>> {
  const output: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((value: unknown) => { output.push(String(value)); });
  try {
    expect(await runSchemaCli(['command', ...command.split(' '), '--compact'])).toBe(0);
  } finally {
    spy.mockRestore();
  }
  return JSON.parse(output.join('\n')) as Record<string, unknown>;
}

describe('CLI discovery contracts', () => {
  it('describes and classifies every canonical command exactly once', () => {
    const descriptors = listAwarenessCommandDescriptors();
    expect(commandIndex).toHaveLength(97);
    expect(descriptors).toHaveLength(commandIndex.length);
    expect(new Set(descriptors.map((entry) => entry.command)).size).toBe(commandIndex.length);
    expect(Object.isFrozen(descriptors)).toBe(true);

    for (const entry of descriptors) {
      expect(entry.schema).toBeTruthy();
      expect(entry.effect).toMatch(/^(read|coordination-write|workspace-write|host-config-write|destructive-admin)$/);
      expect(entry.piMode).toMatch(/^(normal|recovery|external-host-only)$/);
      expect(entry.injected).toContain('compact');
      expect(entry.inputSchema['x-awareness-effect']).toBe(entry.effect);
      expect(entry.inputSchema['x-awareness-pi-mode']).toBe(entry.piMode);
      expect(entry.inputSchema['x-awareness-injected']).toEqual(entry.injected);
      expect(Object.isFrozen(entry)).toBe(true);
      expect(Object.isFrozen(entry.inputSchema)).toBe(true);
      expect(getAwarenessCommandDescriptor(entry.command)).toEqual(entry);
    }
  });

  it('publishes verify host bindings, pagination, and report exit semantics', async () => {
    const audit = getAwarenessCommandDescriptor('verify audit');
    const mark = getAwarenessCommandDescriptor('verify mark');
    expect(audit).toMatchObject({
      injected: ['database', 'workspace', 'agent-id', 'compact'],
      resultExitCodes: [0, 1],
    });
    expect(mark).toMatchObject({
      injected: ['database', 'workspace', 'agent-id', 'compact'],
    });

    const auditSchema = await schemaCommand('verify audit');
    expect(auditSchema.properties).toMatchObject({
      limit: expect.any(Object),
      offset: expect.any(Object),
    });
  });

  it('publishes only root flags accepted by each schema route', async () => {
    const output: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((value: unknown) => { output.push(String(value)); });
    try {
      expect(await runSchemaCli(['commands', '--all', '--examples', '--compact'])).toBe(0);
    } finally {
      spy.mockRestore();
    }
    const catalog = JSON.parse(output.join('\n')) as { commands: Array<{ command: string; schema: string | null }> };

    for (const row of catalog.commands) {
      if (!row.schema) continue;
      const route = COMMAND_ROUTES[row.command];
      if (!route) continue;
      const schema = await schemaCommand(row.command);
      const properties = Object.keys((schema.properties ?? {}) as Record<string, unknown>);
      const accepted = new Set(KNOWN_FLAGS[route.command]!.map((flag) => flag.replace(/_/g, '-')));
      for (const property of properties) {
        expect(accepted, `${row.command} advertises --${property}`).toContain(property.replace(/_/g, '-'));
      }
    }
  });

  it('turns memory recall discovery into executable singular flags', () => {
    const root = mkdtempSync(join(tmpdir(), 'aw-cli-contract-'));
    const db = join(root, 'awareness.sqlite3');
    try {
      const schema = runSource(['schema', 'command', 'memory', 'recall', '--compact']);
      expect(schema.status, schema.stderr || schema.stdout).toBe(0);
      const properties = Object.keys((schema.parsed?.['properties'] ?? {}) as Record<string, unknown>);
      expect(properties).toEqual(expect.arrayContaining(['label', 'file', 'state']));
      expect(properties).not.toEqual(expect.arrayContaining(['labels', 'files', 'states']));

      const accepted = runSource([
        '--db', db, 'memory', 'recall', '--label', 'GOTCHA', '--file', 'src/a.ts', '--state', 'ACTIVE', '--compact',
      ], root);
      expect(accepted.status, accepted.stderr || accepted.stdout).toBe(0);

      const rejected = runSource(['--db', db, 'memory', 'recall', '--labels', 'GOTCHA', '--compact'], root);
      expect(rejected.status).toBe(1);
      expect(rejected.parsed?.['error']).toContain('--labels');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects removed duplicate coordination routes with a canonical replacement', () => {
    const root = mkdtempSync(join(tmpdir(), 'aw-cli-contract-'));
    try {
      const failure = runSource(['coordination', 'task', 'list', '--unknown', '--compact'], root);
      expect(failure.status).toBe(1);
      expect(failure.stderr).toBe('');
      expect(failure.parsed).toMatchObject({
        ok: false,
        error_code: 'REMOVED_COORDINATION_ROUTE',
        hint: expect.stringContaining('task'),
      });

      const message = runSource(['message', 'send', '--compact'], root);
      expect(message.status).toBe(1);
      expect(message.parsed).toMatchObject({ error_code: 'REMOVED_CLI_ROUTE', hint: expect.stringContaining('signal') });

      const check = runSource(['check', 'audit', '--compact'], root);
      expect(check.status).toBe(1);
      expect(check.parsed).toMatchObject({ error_code: 'REMOVED_CLI_ROUTE', hint: expect.stringContaining('verify') });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
