import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { explicitTools, profileHasBrowser, registerTurnSetup, sessionTools } from '../src/turn.js';
import type { OctocodeOwner } from '../src/mcp/octocode.js';
import { fakeOctocode, fakePi } from './fake-pi.js';
import { tmp } from './helpers.js';

describe('sessionTools', () => {
  const base = ['read', 'bash', 'edit', 'write', 'file'];

  it('replaces Pi edit/write with file only when file is active and the user did not choose them', () => {
    expect(sessionTools(base, new Set(), false)).toEqual(['read', 'bash', 'file']);
    expect(sessionTools(['read', 'edit', 'write'], new Set(), false)).toBeUndefined();
    expect(sessionTools(base, new Set(['edit']), false)).toEqual(['read', 'bash', 'edit', 'file']);
    expect(sessionTools(base, new Set(['edit', 'write']), false)).toBeUndefined();
    expect(sessionTools(['read', 'file'], new Set(), false)).toBeUndefined();
  });

  it('leaves browser to the profiles that carry it unless the user named it', () => {
    expect(sessionTools(['read', 'file', 'browser'], new Set(), true)).toEqual(['read', 'file']);
    expect(sessionTools(['read', 'file', 'browser'], new Set(), false)).toBeUndefined();
    expect(sessionTools(['read', 'file', 'browser'], new Set(['browser']), true)).toBeUndefined();
    // Without file, edit/write stay; browser still moves.
    expect(sessionTools(['read', 'edit', 'browser'], new Set(), true)).toEqual(['read', 'edit']);
  });

  it('knows which profiles carry browser', () => {
    const profile = (extra: object) => ({ name: 'p', description: '', prompt: '', ...extra });
    expect(profileHasBrowser(profile({}))).toBe(true);
    expect(profileHasBrowser(profile({ excludeTools: 'file, browser' }))).toBe(false);
    expect(profileHasBrowser(profile({ tools: 'read,web' }))).toBe(false);
    expect(profileHasBrowser(profile({ tools: 'web,browser' }))).toBe(true);
  });
});

describe('explicitTools', () => {
  it('reads --tools/-t lists and plain or +name defaultTools entries', () => {
    expect([...explicitTools(['node', 'pi', '--tools', 'read, edit', '-p', 'x'], undefined)]).toEqual(['read', 'edit']);
    expect([...explicitTools(['pi', '-t', 'write'], ['+grep', 'bash'])]).toEqual(['write', 'grep', 'bash']);
    expect(explicitTools(['pi', '--tools'], []).size).toBe(0);
  });
});

describe('registerTurnSetup', () => {
  const setup = (owner?: OctocodeOwner) => {
    const fake = fakePi();
    for (const name of ['read', 'bash', 'edit', 'write', 'file']) fake.tools.set(name, { name });
    const { mcp, state } = fakeOctocode(owner);
    const turn = registerTurnSetup(fake.pi, { isSubagent: false, profiles: () => new Map(), octocode: mcp });
    turns.set(fake, turn);
    return { fake, turn, state };
  };
  const turns = new Map<ReturnType<typeof fakePi>, ReturnType<typeof registerTurnSetup>>();
  const setupTurn = (fake: ReturnType<typeof fakePi>) => turns.get(fake)!;
  const run = async (fake: ReturnType<typeof fakePi>, selectedTools?: string[]) => {
    const event = { systemPromptOptions: { sections: {} as Record<string, string>, ...(selectedTools ? { selectedTools } : {}) } };
    await fake.emit('before_agent_start', event, {});
    return event.systemPromptOptions.sections['octocode']!;
  };
  const argv = process.argv;
  let agentDir = '';
  // Pi's own mcp.json (in the agent directory) can replace the registration: keep the developer's out of the tests.
  beforeEach(() => {
    agentDir = tmp();
    vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
  });
  afterEach(() => {
    process.argv = argv;
    vi.unstubAllEnvs();
  });

  it('swaps edit/write for file once at session start and leaves the active set alone per turn', async () => {
    const { fake, turn } = setup();
    process.argv = ['node', 'pi'];
    turn.settleTools();
    expect(fake.pi.getActiveTools()).toEqual(['read', 'bash', 'file']);
    const event = { systemPromptOptions: { sections: {} as Record<string, string>, selectedTools: ['read', 'edit'] } };
    await fake.emit('before_agent_start', event, {});
    expect(event.systemPromptOptions.selectedTools).toEqual(['read', 'edit']);
  });

  it('does not re-settle the tool set on a /reload: Pi keeps the active tools, and the user may have re-enabled edit/write', async () => {
    const { fake, turn } = setup();
    process.argv = ['node', 'pi'];
    await fake.emit('session_start', { type: 'session_start', reason: 'startup' }, {});
    turn.settleTools();
    expect(fake.pi.getActiveTools()).toEqual(['read', 'bash', 'file']);
    fake.pi.setActiveTools(['read', 'bash', 'edit', 'write', 'file']);
    await fake.emit('session_start', { type: 'session_start', reason: 'reload' }, {});
    turn.settleTools();
    expect(fake.pi.getActiveTools()).toEqual(['read', 'bash', 'edit', 'write', 'file']);
    // A new, resumed or forked session starts with Pi's defaults again.
    await fake.emit('session_start', { type: 'session_start', reason: 'resume' }, {});
    turn.settleTools();
    expect(fake.pi.getActiveTools()).toEqual(['read', 'bash', 'file']);
  });

  it('keeps edit/write the user enabled with --tools', async () => {
    const { fake, turn } = setup();
    process.argv = ['node', 'pi', '--tools', 'read,edit,write,file'];
    turn.settleTools();
    expect(fake.pi.getActiveTools()).toEqual(['read', 'bash', 'edit', 'write', 'file']);
  });

  it('prefers Octocode MCP from the first turn once its server is connected, though its tools register after the snapshot', async () => {
    const { fake, state } = setup();
    // Pi snapshots selectedTools before before_agent_start; the extension's client connects (and registers) before it.
    const first = await run(fake, ['read']);
    expect(first).toContain('Use Octocode MCP (`mcp__octocode__*`');
    // Every Octocode tool is declared: no tool_search step to mention.
    expect(first).not.toContain('`tool_search`');
    fake.tools.set('mcp__octocode__localSearch', { name: 'mcp__octocode__localSearch' });
    // The section stays byte-identical once the tools appear, so the provider cache holds.
    expect(await run(fake, ['read', 'mcp__octocode__localSearch'])).toBe(first);
    // Settled: later prompts do not ask the client again.
    expect(state.readyCalls).toBe(1);
  });

  it('carries the Octocode server instructions whole in the first prompt, then keeps the section stable', async () => {
    const { fake, state } = setup();
    state.instructions = 'Loop: SCOPE → ORIENT → SEARCH.\nReuse returned data.next.* exactly.\nEmpty does not prove absence.';
    const first = await run(fake, ['read']);
    expect(first).toContain(`# Octocode MCP server instructions\n${state.instructions}\n`);
    expect(first.indexOf('# Research')).toBeLessThan(first.indexOf('# Octocode MCP server instructions'));
    expect(first.indexOf('# Octocode MCP server instructions')).toBeLessThan(first.indexOf('# Safety'));
    expect(await run(fake, ['read'])).toBe(first);
  });

  it('leaves Octocode out of the prompt while the server is not connected, and asks again on a later prompt', async () => {
    const { fake, state } = setup();
    state.connected = false;
    state.instructions = 'Reuse next.*';
    const failed = await run(fake, ['read']);
    expect(failed).not.toContain('Octocode MCP');
    expect(failed).not.toContain('server instructions');
    state.connected = true;
    expect(await run(fake, ['read'])).toContain('# Octocode MCP server instructions\nReuse next.*');
    expect(state.readyCalls).toBe(2);
    // A session reset forgets what was seen: the next session decides for itself.
    state.connected = false;
    expect(await run(fake, ['read'])).toContain('Use Octocode MCP');
    setupTurn(fake).reset();
    expect(await run(fake, ['read'])).not.toContain('Octocode MCP');
  });

  it('follows a user-owned octocode server without asking the client', async () => {
    const { fake, state } = setup({ by: 'user', enabled: true });
    const own = await run(fake, ['read']);
    expect(own).toContain('Use Octocode MCP');
    expect(own).not.toContain('server instructions');
    expect(state.readyCalls).toBe(0);
    // An entry that disables the server leaves Octocode out, unless its tools are there anyway.
    const disabled = setup({ by: 'user', enabled: false });
    expect(await run(disabled.fake, ['read'])).not.toContain('Octocode MCP');
    expect(await run(disabled.fake, ['read', 'mcp__octocode__localSearch'])).toContain('Use Octocode MCP');
  });

  it('with the server off, follows Octocode tools that are present and stays stable once seen', async () => {
    const { fake, state } = setup({ by: 'off' });
    expect(await run(fake, ['read'])).not.toContain('Octocode MCP');
    const withTools = await run(fake, ['read', 'mcp__octocode__localSearch']);
    expect(withTools).toContain('Use Octocode MCP');
    expect(await run(fake, ['read'])).toBe(withTools);
    expect(state.readyCalls).toBe(0);
  });

  it('gives every child of one profile the same octocode section, whatever its id, parent and scratch folder', async () => {
    const sectionFor = async (id: string, parent: string, scratch: string, collaborate = false) => {
      vi.stubEnv('OCTOCODE_AGENT_ID', id);
      vi.stubEnv('OCTOCODE_PARENT_ID', parent);
      vi.stubEnv('OCTOCODE_AGENT_SCRATCH', scratch);
      vi.stubEnv('OCTOCODE_AGENT_COLLABORATE', collaborate ? '1' : '');
      const fake = fakePi();
      for (const name of ['read', 'bash', 'file']) fake.tools.set(name, { name });
      registerTurnSetup(fake.pi, { isSubagent: true, profiles: () => new Map(), octocode: fakeOctocode({ by: 'off' }).mcp });
      return run(fake, ['read', 'file']);
    };
    const first = await sectionFor('researcher-1a2b', 'main-aaaaaa', '/repo/.octocode/tmp/agents/researcher-1a2b');
    const second = await sectionFor('researcher-9z8y', 'main-bbbbbb', '/other/.octocode/tmp/agents/researcher-9z8y');
    expect(second).toBe(first);
    expect(first).not.toMatch(/researcher-1a2b|main-aaaaaa|\.octocode\/tmp/);
    // Collaboration changes the section for every child alike, not per child.
    const team = await sectionFor('a-1', 'main-aaaaaa', '/x/a-1', true);
    expect(team).toBe(await sectionFor('b-2', 'main-bbbbbb', '/y/b-2', true));
    expect(team).not.toBe(first);
  });
});
