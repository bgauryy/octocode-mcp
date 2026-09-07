import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultDbPath, EXTERNAL_AGENT_AWARENESS_PROMPT } from '@octocodeai/octocode-awareness';
import { SYSTEM_PROMPT } from '../src/prompts/system-prompt.js';
import { OCTOCODE_SUPPORT_TOOL_NAMES } from '../src/constants.js';
import type { PiContext } from '../src/types.js';
import { buildAwarenessCliEnvironment, renderAwarenessCliContext } from '../src/tools/awareness-cli-context.js';
import { getAwarenessAgentIdentity } from '../src/tools/awareness-shared.js';

beforeEach(() => {
  vi.stubEnv('OCTOCODE_AGENT_NAME', undefined);
  vi.stubEnv('OCTOCODE_AGENT_VENDOR', undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe('canonical Awareness CLI in Pi', () => {
  it('injects the package-owned instructions and removes duplicated model tools', () => {
    expect(SYSTEM_PROMPT).toContain(EXTERNAL_AGENT_AWARENESS_PROMPT);
    for (const name of ['memory', 'message', 'lock']) expect([...OCTOCODE_SUPPORT_TOOL_NAMES]).not.toContain(name);
    expect(SYSTEM_PROMPT).toContain('skill install');
  });

  it('binds shell calls to the native store, workspace, identity and local runtime', () => {
    vi.stubEnv('OCTOCODE_STORAGE_MODE', 'persistent');
    vi.stubEnv('OCTOCODE_AGENT_ID', 'pi-cli-test');
    const ctx = { cwd: process.cwd() } as PiContext;
    const env = buildAwarenessCliEnvironment(ctx);
    expect(env.OCTOCODE_AGENT_ID).toBe('pi-cli-test');
    expect(env.OCTOCODE_NODE).toBe(process.execPath);
    expect(env.OCTOCODE_AWARENESS_DB).toBe(defaultDbPath(process.cwd()));
    expect(env.OCTOCODE_AWARENESS_WORKSPACE).toBe(ctx.cwd);
    expect(env.OCTOCODE_AWARENESS_CLI).toMatch(/octocode-awareness\.js$/);
    expect(renderAwarenessCliContext(ctx)).toContain('pi-cli-test');
    expect(renderAwarenessCliContext(ctx)).toContain('$OCTOCODE_AWARENESS_DB');
  });

  it('does not advertise a durable CLI binding when persistence is disabled', () => {
    vi.stubEnv('OCTOCODE_STORAGE_MODE', 'memory');
    vi.stubEnv('OCTOCODE_AWARENESS_DB', '/stale/awareness.sqlite3');
    vi.stubEnv('OCTOCODE_AWARENESS_CLI', '/stale/cli.js');
    expect(buildAwarenessCliEnvironment({ cwd: process.cwd() } as PiContext).OCTOCODE_AWARENESS_DB).toBeUndefined();
    expect(renderAwarenessCliContext()).toContain('Persistent storage is disabled');
  });

  it('exports the native identity and actual worker provider despite stale inherited labels', () => {
    vi.stubEnv('OCTOCODE_STORAGE_MODE', 'persistent');
    vi.stubEnv('OCTOCODE_AGENT_ID', 'worker:123');
    vi.stubEnv('OCTOCODE_AGENT_VENDOR', 'parent-vendor');
    vi.stubEnv('OCTOCODE_AGENT_HOST', 'parent-host');
    const ctx = { cwd: process.cwd(), model: { provider: 'anthropic' }, sessionManager: { getSessionName: () => 'Parser review' } } as PiContext;
    const nativeIdentity = getAwarenessAgentIdentity(ctx);
    const env = buildAwarenessCliEnvironment(ctx);
    expect(env.OCTOCODE_AGENT_ID).toBe(nativeIdentity.agentId);
    expect(env.OCTOCODE_AGENT_NAME).toBe(nativeIdentity.name);
    expect(env.OCTOCODE_AGENT_VENDOR).toBe(nativeIdentity.metadata.vendor);
    expect(env.OCTOCODE_AGENT_HOST).toBe(nativeIdentity.metadata.host);
    expect(env.OCTOCODE_AGENT_VENDOR).toBe('anthropic');
    expect(env.OCTOCODE_AGENT_HOST).toBe('pi');
    expect(renderAwarenessCliContext(ctx)).toContain('"vendor":"anthropic","host":"pi"');
  });

  it('reports unknown vendor explicitly without guessing from a routing ID', () => {
    vi.stubEnv('OCTOCODE_STORAGE_MODE', 'persistent');
    vi.stubEnv('OCTOCODE_AGENT_ID', 'openai:opaque-id');
    const ctx = { cwd: process.cwd() } as PiContext;
    expect(buildAwarenessCliEnvironment(ctx).OCTOCODE_AGENT_VENDOR).toBeUndefined();
    expect(renderAwarenessCliContext(ctx)).toContain('"vendor":null');
  });
});
