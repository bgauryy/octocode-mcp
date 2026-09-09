import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeAwarenessCommand } from '../src/command-api.js';
import { executeAwarenessCli } from '../src/command-cli.js';
import { listAwarenessCommandDescriptors } from '../src/schema/cli.js';
import { commandSchemaProperties } from '../src/schema/command-properties.js';

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function context() {
  const workspace = mkdtempSync(join(tmpdir(), 'awareness-boundaries-'));
  roots.push(workspace);
  return { workspace, database: join(workspace, 'awareness.sqlite3'), agentId: 'native-owner', compact: false };
}

describe('Awareness command boundaries', () => {
  it('publishes every workspace and identity binding accepted by each command schema', () => {
    for (const descriptor of listAwarenessCommandDescriptors()) {
      const properties = commandSchemaProperties(descriptor.inputSchema);
      expect(descriptor.injected.includes('workspace'), descriptor.command).toBe(Object.hasOwn(properties, 'workspace'));
      const selector = descriptor.command === 'work list' || descriptor.command === 'work show';
      expect(descriptor.injected.includes('agent-id'), descriptor.command).toBe(!selector && (Object.hasOwn(properties, 'agent_id') || Object.hasOwn(properties, 'lead_agent_id')));
      expect(descriptor.inputSchema['x-awareness-injected'], descriptor.command).toEqual(descriptor.injected);
    }
  });

  it('keeps native audit output independent of shell compact defaults', async () => {
    const ctx = context();
    vi.stubEnv('OCTOCODE_AWARENESS_COMPACT', '0');
    const before = await executeAwarenessCommand({ command: 'verify audit' }, ctx);
    vi.stubEnv('OCTOCODE_AWARENESS_COMPACT', '1');
    expect(await executeAwarenessCommand({ command: 'verify audit' }, ctx)).toEqual(before);
  });

  it('leaves unknown native identity labels null while the shell adapter reads explicit environment defaults', async () => {
    const ctx = context();
    vi.stubEnv('OCTOCODE_AGENT_NAME', 'Shell identity');
    vi.stubEnv('OCTOCODE_AGENT_VENDOR', 'shell-vendor');
    vi.stubEnv('OCTOCODE_AGENT_HOST', 'shell-host');
    expect((await executeAwarenessCommand({ command: 'agent register' }, ctx)).exitCode).toBe(0);
    const native = await executeAwarenessCommand({ command: 'agent list' }, ctx);
    expect(JSON.stringify(native.payload)).not.toContain('shell-vendor');
    const shell = await executeAwarenessCli(['agent', 'register', '--db', ctx.database, '--workspace', ctx.workspace, '--agent-id', 'shell-owner']);
    expect(shell.exitCode).toBe(0);
    expect(JSON.stringify((await executeAwarenessCommand({ command: 'agent list' }, ctx)).payload)).toContain('shell-vendor');
  });

  it('accepts a structured native edit event without requiring JSON serialization', async () => {
    const result = await executeAwarenessCommand({ command: 'hooks pre-edit', params: { event_json: {} } }, context());
    expect(result.exitCode, JSON.stringify(result)).toBe(0);
  });

  it('keeps the native executor dependency graph outside process entrypoints', () => {
    const root = fileURLToPath(new URL('../', import.meta.url));
    const pending = [join(root, 'src/command-api.ts')];
    const visited = new Set<string>();
    const violations: string[] = [];
    while (pending.length) {
      const path = pending.pop()!;
      if (visited.has(path)) continue;
      visited.add(path);
      for (const match of readFileSync(path, 'utf8').matchAll(/\b(?:from\s*|import\s*\(\s*)['"]([^'"]+)['"]/g)) {
        const specifier = match[1]!;
        if (!specifier.startsWith('.') || !specifier.endsWith('.js')) continue;
        const target = resolve(dirname(path), specifier.replace(/\.js$/, '.ts'));
        if (target.startsWith(join(root, 'bin/'))) violations.push(`${path.slice(root.length)} -> ${specifier}`);
        else pending.push(target);
      }
    }
    expect(violations).toEqual([]);
  });
});
