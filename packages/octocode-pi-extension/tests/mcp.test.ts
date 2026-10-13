import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerMcpCommand } from '../src/mcp/command.js';
import { configuredOctocodeServer, isOctocodeTool, OCTOCODE_MCP_SPEC, OctocodeMcp, octocodeLaunch, registerOctocodeMcp } from '../src/mcp/octocode.js';
import { octocodeToolDefinition, sanitizeJson, toToolResult } from '../src/mcp/tools.js';
import { Subcommands } from '../src/shared/commands.js';
import { fakeCtx, fakePi, rendered, theme } from './fake-pi.js';
import { tmp } from './helpers.js';

const ECHO = path.join(import.meta.dirname, 'fixtures', 'echo-mcp.mjs');
const echo = (cwd: string) => ({ command: process.execPath, args: [ECHO], cwd, env: {} });
const exits = (cwd: string, stderr = 'kaboom') => ({ command: process.execPath, args: ['-e', `require('node:fs').writeSync(2, ${JSON.stringify(stderr)}); process.exit(3)`], cwd, env: {} });
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** An Octocode MCP wired to a fake Pi and a stdio launch the test chooses. */
function session(launch: (cwd: string) => ReturnType<typeof echo>, options: { env?: NodeJS.ProcessEnv; hasUI?: boolean } = {}) {
  const fake = fakePi();
  const cwd = tmp();
  const ctx = fakeCtx({ cwd, hasUI: options.hasUI ?? true });
  const mcp = new OctocodeMcp(fake.pi, { launch, env: { OCTOCODE_MCP_WAIT_SECONDS: '20', ...options.env }, version: '1.2.3' });
  const call = async (tool: string, params: Record<string, unknown> = {}, signal?: AbortSignal) =>
    (await fake.tools.get(`mcp__octocode__${tool}`).execute('call-1', params, signal, undefined, ctx)) as { content: Array<{ type: string; text?: string }>; isError?: boolean };
  return { fake, cwd, ctx, mcp, call, notes: ctx.ui.notes };
}
const text = (result: { content: Array<{ text?: string }> }) => result.content.map((part) => part.text ?? '').join('');

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Octocode MCP launch and ownership', () => {
  it('launches the bundled octocode-mcp with the workspace allowed', () => {
    const launch = octocodeLaunch('/work/app', { OCTOCODE_HOME: '/h/.octocode' }, '/x/octocode-mcp/bin.js');
    expect(launch).toEqual({ command: process.execPath, args: ['/x/octocode-mcp/bin.js'], cwd: '/work/app', env: { WORKSPACE_ROOT: '/work/app', ALLOWED_PATHS: '/work/app,/h/.octocode' } });
    // The real bundled bin resolves (octocode-mcp is a dependency).
    expect(fs.existsSync(octocodeLaunch('/w').args[0]!)).toBe(true);
  });

  it('runs octocode-mcp 20.2.0 or a later 20.x: the dependency and the npx fallback share the range', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    expect(manifest.dependencies['octocode-mcp']).toBe('^20.2.0');
    expect(OCTOCODE_MCP_SPEC).toBe('octocode-mcp@^20.2.0');
    expect(octocodeLaunch('/w', {}, '')).toMatchObject({ command: 'npx', args: ['-y', 'octocode-mcp@^20.2.0'] });
  });

  it('reads an octocode entry from Pi\'s mcp.json, the trusted project file replacing the global one', () => {
    const agentDir = tmp();
    const cwd = tmp();
    expect(configuredOctocodeServer(cwd, true, agentDir)).toBeUndefined();
    fs.writeFileSync(path.join(agentDir, 'mcp.json'), JSON.stringify({ mcpServers: { octocode: { command: 'x', enabled: false }, other: {} } }));
    fs.mkdirSync(path.join(cwd, '.pi'));
    fs.writeFileSync(path.join(cwd, '.pi', 'mcp.json'), JSON.stringify({ mcpServers: { octocode: { command: 'y' } } }));
    expect(configuredOctocodeServer(cwd, false, agentDir)).toEqual({ command: 'x', enabled: false });
    expect(configuredOctocodeServer(cwd, true, agentDir)).toEqual({ command: 'y' });
    fs.writeFileSync(path.join(cwd, '.pi', 'mcp.json'), JSON.stringify({ mcpServers: 'none' }));
    expect(configuredOctocodeServer(cwd, true, agentDir)).toEqual({ command: 'x', enabled: false });
    fs.writeFileSync(path.join(cwd, '.pi', 'mcp.json'), '{ not json');
    expect(configuredOctocodeServer(cwd, true, agentDir)).toEqual({ command: 'x', enabled: false });
  });

  it('recognizes Pi-named Octocode tools', () => {
    expect(isOctocodeTool('mcp__octocode__localSearch')).toBe(true);
    expect(isOctocodeTool('octocode_localSearch')).toBe(false);
    expect(isOctocodeTool('mcp__other__x')).toBe(false);
  });

  it('inherits global settings for a trusted project MCP override, but replaces them for a new transport', () => {
    const agentDir = tmp();
    const cwd = tmp();
    vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
    fs.mkdirSync(path.join(cwd, '.pi'));
    const projectConfig = path.join(cwd, '.pi', 'mcp.json');
    const global = { command: 'octocode-mcp', enabled: false, env: { TEST: 'kept' } };
    fs.writeFileSync(path.join(agentDir, 'mcp.json'), JSON.stringify({ mcpServers: { octocode: global } }));
    const writeProject = (octocode: unknown) => fs.writeFileSync(projectConfig, JSON.stringify({ mcpServers: { octocode } }));
    writeProject({ exposure: 'direct' });
    expect(configuredOctocodeServer(cwd, true, agentDir)).toEqual({ ...global, exposure: 'direct' });
    const mcp = new OctocodeMcp(fakePi().pi);
    const ctx = fakeCtx({ cwd });
    expect(mcp.owner(ctx)).toEqual({ by: 'user', enabled: false });
    writeProject({ enabled: true, toolExposure: { localFetch: 'direct' } });
    expect(configuredOctocodeServer(cwd, true, agentDir)).toEqual({ ...global, enabled: true, toolExposure: { localFetch: 'direct' } });
    expect(mcp.owner(ctx)).toEqual({ by: 'user', enabled: true });
    expect(configuredOctocodeServer(cwd, false, agentDir)).toEqual(global);
    writeProject({ command: 'replacement' });
    expect(configuredOctocodeServer(cwd, true, agentDir)).toEqual({ command: 'replacement' });
    writeProject({ enabled: true, env: { TEST: 'invalid override' } });
    expect(configuredOctocodeServer(cwd, true, agentDir)).toEqual(global);
    fs.unlinkSync(path.join(agentDir, 'mcp.json'));
    writeProject({ enabled: false });
    expect(configuredOctocodeServer(cwd, true, agentDir)).toBeUndefined();
  });


  it('is owned by the user\'s mcp.json entry, else by this extension, unless OCTOCODE_MCP=0', () => {
    const agentDir = tmp();
    vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
    const cwd = tmp();
    const ctx = { cwd, isProjectTrusted: () => false };
    const owner = (env: NodeJS.ProcessEnv = {}) => new OctocodeMcp(fakePi().pi, { env }).owner(ctx);
    expect(owner()).toEqual({ by: 'extension' });
    expect(owner({ OCTOCODE_MCP: '0' })).toEqual({ by: 'off' });
    fs.writeFileSync(path.join(agentDir, 'mcp.json'), JSON.stringify({ mcpServers: { octocode: { command: 'octocode-mcp' } } }));
    expect(owner()).toEqual({ by: 'user', enabled: true });
    fs.writeFileSync(path.join(agentDir, 'mcp.json'), JSON.stringify({ mcpServers: { octocode: { command: 'false', enabled: false } } }));
    // The user's entry wins even over OCTOCODE_MCP=0, and `enabled: false` is the user's way to turn Octocode off.
    expect(owner({ OCTOCODE_MCP: '0' })).toEqual({ by: 'user', enabled: false });
    expect(new OctocodeMcp(fakePi().pi).owner({ cwd, isProjectTrusted: undefined as never })).toEqual({ by: 'user', enabled: false });
  });

  it('starts nothing for a user-owned or switched-off server, and says so', async () => {
    const launch = vi.fn((cwd: string) => echo(cwd));
    const agentDir = tmp();
    vi.stubEnv('PI_CODING_AGENT_DIR', agentDir);
    const off = session(launch, { env: { OCTOCODE_MCP: '0' } });
    await off.mcp.start(off.ctx);
    expect(await off.mcp.ready(off.ctx)).toBe(false);
    expect(off.mcp.describe()).toBe('Octocode MCP: off (OCTOCODE_MCP=0)');
    fs.writeFileSync(path.join(agentDir, 'mcp.json'), JSON.stringify({ mcpServers: { octocode: { command: 'octocode-mcp' } } }));
    const own = session(launch);
    await own.mcp.start(own.ctx);
    expect(own.mcp.describe()).toContain('your own `octocode` server from mcp.json');
    expect(own.mcp.instructions).toBeUndefined();
    expect(launch).not.toHaveBeenCalled();
    expect(own.fake.tools.size).toBe(0);
  });
});

describe('Octocode MCP client', () => {
  it('connects at session start, registers every listed tool directly, and keeps the instructions', async () => {
    const { fake, ctx, mcp, call } = session(echo);
    await mcp.start(ctx);
    expect(await mcp.ready(ctx)).toBe(true);
    const names = [...fake.tools.keys()].sort();
    expect(names).toEqual(['crash', 'exit', 'fail', 'grow', 'localFetch', 'pick', 'roots', 'shout', 'shrink'].map((name) => `mcp__octocode__${name}`));
    const shout = fake.tools.get('mcp__octocode__shout');
    expect(shout).toMatchObject({ description: 'Uppercase the given text', exposure: 'direct', namespace: { name: 'mcp__octocode', instructions: 'Echo test server.' } });
    // The server's JSON Schema is the tool's parameter schema as is.
    expect(shout.parameters).toMatchObject({ type: 'object', properties: { text: { type: 'string' } }, required: ['text'] });
    expect(mcp.instructions).toBe('Echo test server.');
    expect(text(await call('shout', { text: 'hello' }))).toBe('HELLO');
    const status = mcp.status();
    expect(status).toMatchObject({ state: 'connected', serverName: 'echo', serverVersion: '1.0.0', tools: 9, cwd: ctx.cwd });
    expect(mcp.describe()).toBe(`Octocode MCP: connected (echo 1.0.0, 9 tools, pid ${status.pid})`);
    await mcp.close();
    expect(alive(status.pid!)).toBe(false);
    expect(mcp.status().state).toBe('closed');
  });

  it('returns a server error as an error result and honours an aborted call', async () => {
    const { ctx, mcp, call } = session(echo);
    await mcp.start(ctx);
    await mcp.ready(ctx);
    expect(await call('fail')).toMatchObject({ isError: true, content: [{ type: 'text', text: 'boom' }] });
    const aborted = new AbortController();
    aborted.abort();
    await expect(call('shout', { text: 'x' }, aborted.signal)).rejects.toThrow();
    await mcp.close();
  });

  it('follows tools/list_changed: a new tool registers, a withdrawn one is hidden', async () => {
    const { fake, ctx, mcp, call } = session(echo);
    const registered = vi.spyOn(fake.pi, 'registerTool');
    await mcp.start(ctx);
    await mcp.ready(ctx);
    const shout = fake.tools.get('mcp__octocode__shout');
    registered.mockClear();
    await call('grow');
    await vi.waitFor(() => expect(fake.tools.get('mcp__octocode__late')).toMatchObject({ exposure: 'direct' }));
    expect(mcp.status().tools).toBe(10);
    expect(registered).toHaveBeenCalledTimes(1);
    expect(fake.tools.get('mcp__octocode__shout')).toBe(shout);
    registered.mockClear();
    // A tool the server withdraws is hidden from the model, not left callable.
    await call('shrink');
    await vi.waitFor(() => expect(fake.tools.get('mcp__octocode__late')).toMatchObject({ exposure: 'hidden' }));
    expect(mcp.status().tools).toBe(9);
    expect(registered).toHaveBeenCalledTimes(1);
    expect(fake.tools.get('mcp__octocode__shout')).toBe(shout);
    // Reintroducing a withdrawn tool makes it callable again without replacing the unchanged tools.
    registered.mockClear();
    await call('grow');
    await vi.waitFor(() => expect(fake.tools.get('mcp__octocode__late')).toMatchObject({ exposure: 'direct' }));
    expect(registered).toHaveBeenCalledTimes(1);
    expect(text(await call('late'))).toBe('late tool works');
    await mcp.close();
  });

  it('keeps unchanged definitions on reconnect and refreshes changed tools or namespace instructions', async () => {
    let instructions = 'First instructions';
    let description = 'Uppercase the given text';
    const { fake, ctx, mcp, call } = session((cwd) => ({ ...echo(cwd), env: { ECHO_INSTRUCTIONS: instructions, ECHO_SHOUT_DESCRIPTION: description } }));
    const registered = vi.spyOn(fake.pi, 'registerTool');
    try {
      await mcp.start(ctx);
      await mcp.ready(ctx);
      const shout = fake.tools.get('mcp__octocode__shout');
      registered.mockClear();
      await mcp.restart(ctx);
      expect(registered).not.toHaveBeenCalled();
      expect(fake.tools.get('mcp__octocode__shout')).toBe(shout);
      expect(text(await call('shout', { text: 'reconnected' }))).toBe('RECONNECTED');
      description = 'Updated uppercase description';
      await mcp.restart(ctx);
      expect(registered).toHaveBeenCalledTimes(1);
      expect(fake.tools.get('mcp__octocode__shout').description).toBe(description);
      registered.mockClear();
      instructions = 'New instructions';
      await mcp.restart(ctx);
      expect(registered).toHaveBeenCalledTimes(mcp.status().tools);
      expect(fake.tools.get('mcp__octocode__shout').namespace.instructions).toBe(instructions);
    } finally {
      await mcp.close();
    }
  });

  it('reconnects once after the process dies, then reports a clear error until restart', async () => {
    let launches = 0;
    const { ctx, mcp, call } = session((cwd) => (++launches === 2 ? echo(cwd) : launches === 1 ? echo(cwd) : exits(cwd)));
    await mcp.start(ctx);
    await mcp.ready(ctx);
    const first = mcp.status().pid!;
    expect(text(await call('exit'))).toBe('bye');
    await vi.waitFor(() => expect(mcp.status().state).toBe('disconnected'));
    expect(mcp.describe()).toContain('Octocode MCP: stopped');
    // The next call reconnects once and carries on.
    expect(text(await call('shout', { text: 'again' }))).toBe('AGAIN');
    expect(launches).toBe(2);
    expect(mcp.status().pid).not.toBe(first);
    // Dies again; the one reconnect fails: a clear error, and no further attempts until restart.
    await call('exit');
    await vi.waitFor(() => expect(mcp.status().state).toBe('disconnected'));
    await expect(call('shout', { text: 'x' })).rejects.toThrow(/Octocode MCP server is not available: .*kaboom/s);
    expect(launches).toBe(3);
    await expect(call('shout', { text: 'x' })).rejects.toThrow('not available');
    expect(launches).toBe(3);
    expect(mcp.status().state).toBe('failed');
    launches = 1;
    await mcp.restart(ctx);
    expect(text(await call('shout', { text: 'back' }))).toBe('BACK');
    await mcp.close();
  });

  it('registers tools without a namespace instructions block when the server has none', async () => {
    const { fake, ctx, mcp } = session(echo, {});
    const quiet = (cwd: string) => ({ ...echo(cwd), env: { ECHO_INSTRUCTIONS: '' } });
    const silent = new OctocodeMcp(fake.pi, { launch: quiet, env: {} });
    await silent.start(ctx);
    expect(await silent.ready(ctx)).toBe(true);
    expect(silent.instructions).toBeUndefined();
    expect(fake.tools.get('mcp__octocode__shout').namespace).toEqual({ name: 'mcp__octocode' });
    await Promise.all([silent.close(), mcp.close()]);
  });

  it('describes every state it can be in', () => {
    const mcp = new OctocodeMcp(fakePi().pi, { env: {} });
    const say = (status: object) => {
      (mcp as unknown as { server: { status: () => object } }).server.status = () => status;
      (mcp as unknown as { owned: unknown }).owned = { by: 'extension' };
      return mcp.describe();
    };
    expect(say({ state: 'idle', tools: 0 })).toContain('not started');
    expect(say({ state: 'connected', tools: 2 })).toBe('Octocode MCP: connected (octocode-mcp, 2 tools, pid ?)');
    expect(say({ state: 'failed', tools: 0 })).toContain('failed to start: unknown error');
    expect(say({ state: 'disconnected', tools: 0 })).toContain('stopped: the server exited');
    expect(say({ state: 'closed', tools: 0 })).toContain('not started');
    expect(say({ state: 'connected', tools: 1, serverName: 'x', pid: 7 })).toBe('Octocode MCP: connected (x, 1 tools, pid 7)');
  });

  it('says so when the server dies during a call, and starts it again for the next one', async () => {
    const { ctx, mcp, call } = session(echo);
    await mcp.start(ctx);
    await mcp.ready(ctx);
    await expect(call('crash')).rejects.toThrow('Octocode MCP server stopped during the call');
    expect(text(await call('shout', { text: 'next' }))).toBe('NEXT');
    await mcp.close();
  });

  it('reports a failed connect at once: notifies once, retries once on a later ready, then stays failed', async () => {
    const launch = vi.fn((cwd: string) => exits(cwd));
    const { fake, ctx, mcp, notes } = session(launch);
    await mcp.start(ctx);
    const started = Date.now();
    expect(await mcp.ready(ctx)).toBe(false);
    expect(Date.now() - started).toBeLessThan(10_000);
    expect(mcp.status()).toMatchObject({ state: 'failed', tools: 0 });
    expect(mcp.status().error).toContain('kaboom');
    expect(notes).toHaveLength(1);
    expect(notes[0]!.message).toContain('Octocode MCP failed to start');
    expect(notes[0]!.message).toContain('kaboom');
    expect(mcp.describe()).toContain('failed to start');
    expect(mcp.instructions).toBeUndefined();
    // A later prompt retries once; it fails again without another notice, and the one after does not even launch.
    expect(await mcp.ready(ctx)).toBe(false);
    expect(await mcp.ready(ctx)).toBe(false);
    expect(launch).toHaveBeenCalledTimes(2);
    expect(notes).toHaveLength(1);
    expect(fake.tools.size).toBe(0);
  });

  it('stays quiet without a UI', async () => {
    const { ctx, mcp, notes } = session(exits, { hasUI: false });
    await mcp.start(ctx);
    expect(await mcp.ready(ctx)).toBe(false);
    expect(notes).toHaveLength(0);
  });

  it('waits for a slow connect no longer than OCTOCODE_MCP_WAIT_SECONDS, and ends it with the session', async () => {
    const hangs = (cwd: string) => ({ command: process.execPath, args: ['-e', 'setTimeout(() => {}, 60000)'], cwd, env: {} });
    const { ctx, mcp } = session(hangs, { env: { OCTOCODE_MCP_WAIT_SECONDS: '0' } });
    await mcp.start(ctx);
    expect(await mcp.ready(ctx)).toBe(false);
    expect(mcp.status().state).toBe('connecting');
    expect(mcp.describe()).toBe('Octocode MCP: connecting…');
    const done = new AbortController();
    done.abort();
    expect(await mcp.ready({ ...ctx, signal: done.signal } as never)).toBe(false);
    const aborted = new AbortController();
    const waiting = session(hangs, { env: { OCTOCODE_MCP_WAIT_SECONDS: '30' } });
    await waiting.mcp.start(waiting.ctx);
    const pending = waiting.mcp.ready({ ...waiting.ctx, signal: aborted.signal } as never);
    aborted.abort();
    expect(await pending).toBe(false);
    await Promise.all([mcp.close(), waiting.mcp.close()]);
    expect(mcp.status().state).toBe('closed');
  });

  it('moves to the new folder when the session folder changes, and a restart gets a fresh process', async () => {
    const folders: string[] = [];
    const { ctx, mcp, call } = session((cwd) => (folders.push(cwd), echo(cwd)));
    await mcp.start(ctx);
    await mcp.ready(ctx);
    const first = mcp.status().pid!;
    await mcp.start(ctx);
    expect(mcp.status().pid).toBe(first);
    const other = { ...ctx, cwd: tmp() } as typeof ctx;
    await mcp.start(other);
    expect(await mcp.ready(other)).toBe(true);
    expect(folders).toEqual([ctx.cwd, other.cwd]);
    await vi.waitFor(() => expect(alive(first)).toBe(false));
    const second = mcp.status().pid!;
    expect(text(await call('shout', { text: 'ok' }))).toBe('OK');
    expect((await mcp.restart(other)).pid).not.toBe(second);
    await vi.waitFor(() => expect(alive(second)).toBe(false));
    await mcp.close();
    expect(mcp.status().state).toBe('closed');
  });

  it('wires start and shutdown to the session', async () => {
    const fake = fakePi();
    const mcp = registerOctocodeMcp(fake.pi);
    expect(mcp).toBeInstanceOf(OctocodeMcp);
    const ctx = fakeCtx({ cwd: tmp() });
    vi.stubEnv('OCTOCODE_MCP', '0');
    await fake.emit('session_start', {}, ctx);
    expect(mcp.describe()).toContain('off');
    await fake.emit('session_shutdown', {}, ctx);
    expect(mcp.status().state).toBe('closed');
  });
});

describe('/octocode mcp', () => {
  it('shows the status and restarts the server', async () => {
    const { ctx, mcp } = session(echo);
    const commands = new Subcommands();
    registerMcpCommand(commands, mcp);
    const run = (args: string) => commands.get('mcp')!.handler(args, ctx);
    await mcp.start(ctx);
    await mcp.ready(ctx);
    const pid = mcp.status().pid;
    await run('');
    expect(ctx.ui.notes.at(-1)!.message).toBe(`Octocode MCP: connected (echo 1.0.0, 9 tools, pid ${pid})`);
    await run('restart');
    const restarted = ctx.ui.notes.at(-1)!.message;
    expect(restarted).toMatch(/^Octocode MCP: connected/);
    expect(restarted).not.toContain(`pid ${pid})`);
    await run('bogus');
    expect(ctx.ui.notes.at(-1)).toMatchObject({ type: 'warning', message: 'Usage: /octocode mcp [status|restart]' });
    expect(commands.get('mcp')!.complete!('r')).toEqual([{ value: 'restart', label: 'restart', description: 'stop and start the server again' }]);
    await mcp.close();
    // Nothing to restart when the user's own server or nobody runs it.
    vi.stubEnv('OCTOCODE_MCP', '0');
    const off = new OctocodeMcp(fakePi().pi, { env: { OCTOCODE_MCP: '0' } });
    registerMcpCommand(commands, off);
    await commands.get('mcp')!.handler('restart', ctx);
    expect(ctx.ui.notes.at(-1)).toMatchObject({ type: 'warning' });
    expect(ctx.ui.notes.at(-1)!.message).toContain('Nothing to restart');
  });
});

describe('Octocode tool results and rendering', () => {
  const tool = { name: 'localFetch', description: ' Read files ', inputSchema: { type: 'object' as const }, annotations: { readOnlyHint: true, title: 'x' } };
  const binding = { prefix: 'mcp__octocode__', namespace: { name: 'mcp__octocode' }, call: async () => ({ content: [{ type: 'text' as const, text: 'ok' }] }) };

  it('gives a page over 20 KB to the model whole: no cut, no marker, non-ASCII intact', async () => {
    const page = `${'- row: héllo wörld — 日本語\n'.repeat(2_000)}  next:\n    continueChars: { charOffset: 20000 }\n${'- last row ✓\n'.repeat(500)}`;
    expect(Buffer.byteLength(page)).toBeGreaterThan(40 * 1024);
    const result = await toToolResult('localFetch', { content: [{ type: 'text', text: page }, { type: 'image', data: 'aW1n', mimeType: 'image/png' }] }, false);
    expect(result.content).toEqual([{ type: 'text', text: page }, { type: 'image', data: 'aW1n', mimeType: 'image/png' }]);
    expect(result).not.toHaveProperty('structuredContent');
    expect(result).not.toHaveProperty('isError');
  });

  it('spills text over the budget to a file and replaces an oversized image by a note naming its file', async () => {
    const huge = `${'- row: some repository text\n'.repeat(12_000)}tail line`;
    expect(Buffer.byteLength(huge)).toBeGreaterThan(300_000);
    const bigImage = 'A'.repeat(700_000);
    const result = await toToolResult('localSearch', { content: [{ type: 'text', text: huge }, { type: 'image', data: bigImage, mimeType: 'image/png' }, { type: 'image', data: 'aW1n', mimeType: 'image/png' }] }, false);
    const [text, dropped, kept] = result.content as Array<{ type: string; text?: string; data?: string }>;
    expect(Buffer.byteLength(text!.text!)).toBeLessThan(210_000);
    expect(text!.text).toContain('tail line');
    const textFile = /Full output: (\S+?); search/.exec(text!.text!)?.[1];
    expect(fs.readFileSync(textFile!.replace(/^~/, os.homedir()), 'utf8')).toBe(huge);
    expect(textFile).toMatch(/mcp_localSearch/);
    expect(dropped).toMatchObject({ type: 'text' });
    const imageFile = /Saved to (\S+?)\.\]/.exec(dropped!.text!)?.[1];
    expect(fs.statSync(imageFile!).size).toBe(Buffer.from(bigImage, 'base64').length);
    expect(kept).toEqual({ type: 'image', data: 'aW1n', mimeType: 'image/png' });
  });

  it('turns other blocks into text, an empty error into a message, and keeps structuredContent only when declared', async () => {
    const linked = await toToolResult('t', { content: [{ type: 'resource_link', uri: 'file:///a', name: 'a' }] }, false);
    expect(linked.content).toHaveLength(1);
    expect(linked.content[0]).toMatchObject({ type: 'text' });
    expect(await toToolResult('t', { content: [], isError: true }, false)).toMatchObject({ isError: true, content: [{ type: 'text', text: 't failed without a message.' }] });
    const structured = { content: [{ type: 'text' as const, text: '{}' }], structuredContent: { a: 1 } };
    expect((await toToolResult('t', structured, true)).structuredContent).toEqual({ a: 1 });
    expect(await toToolResult('t', structured, false)).not.toHaveProperty('structuredContent');
  });

  it('defines the Pi tool from the listed tool: name, hints, schema, declared output', async () => {
    const definition = octocodeToolDefinition(tool, binding);
    expect(definition).toMatchObject({ name: 'mcp__octocode__localFetch', label: 'localFetch', description: 'Read files', exposure: 'direct', annotations: { readOnlyHint: true }, parameters: tool.inputSchema });
    expect(definition).not.toHaveProperty('outputSchema');
    const withOutput = octocodeToolDefinition({ ...tool, title: 'Fetch', description: undefined, annotations: undefined, outputSchema: { type: 'object' } }, binding);
    expect(withOutput).toMatchObject({ label: 'Fetch', description: 'Fetch', outputSchema: { type: 'object' } });
    expect(withOutput).not.toHaveProperty('annotations');
    expect(octocodeToolDefinition({ name: 'x', inputSchema: {} }, binding).description).toBe('Octocode tool x');
    const out = (await definition.execute('id', { queries: [] }, undefined, undefined, {} as never)) as { content: unknown };
    expect(out.content).toEqual([{ type: 'text', text: 'ok' }]);
  });

  it('renders a call by what it looks for and a result as a compact block', () => {
    const definition = octocodeToolDefinition(tool, binding);
    const context = (extra: object = {}) => ({ lastComponent: undefined, state: {}, args: {}, toolCallId: 'c', invalidate: () => undefined, cwd: '/w', executionStarted: true, argsComplete: true, isPartial: false, expanded: false, showImages: false, isError: false, ...extra }) as never;
    const header = (args: object) => rendered(definition.renderCall!(args as never, theme, context()) as never);
    expect(header({ queries: [{ path: '.', searchText: 'add' }] })).toContain('localFetch(add in .)');
    const batch = header({ queries: [{ path: 'a.ts' }, { path: 'b.ts' }] });
    expect(batch).toContain('localFetch(2 queries)');
    expect(batch).toContain('a.ts');
    expect(batch).toContain('b.ts');
    expect(header({})).toContain('localFetch');
    const ok = rendered(definition.renderResult!({ content: [{ type: 'text', text: 'line one\nline two' }], details: { tool: 'localFetch' } } as never, { expanded: false, isPartial: false }, theme, context()) as never);
    expect(ok).toContain('line one');
    const failed = rendered(definition.renderResult!({ content: [{ type: 'text', text: 'It broke\nwith detail' }], details: { tool: 'localFetch' } } as never, { expanded: true, isPartial: false }, theme, context({ isError: true })) as never);
    expect(failed).toContain('It broke');
    expect(failed).toContain('with detail');
  });
});

describe('Octocode result sanitizing', () => {
  it('sanitizes tool results: text parts and structured content, clean ones untouched', async () => {
    const dirty = 'a\u202eb\u{e0041}\u{e0042}c\u001b]0;title\u0007d\u001b[31me\u0000f';
    const result = await toToolResult('localSearch', { content: [{ type: 'text', text: dirty }, { type: 'image', data: 'x', mimeType: 'image/png' }], structuredContent: { files: [{ path: 'p', text: dirty, n: 1 }] } }, true);
    expect(result.content).toEqual([{ type: 'text', text: 'abcdef' }, { type: 'image', data: 'x', mimeType: 'image/png' }]);
    expect(result.structuredContent).toEqual({ files: [{ path: 'p', text: 'abcdef', n: 1 }] });
    const clean = { a: ['x', { b: 'tab\there\n' }], n: 1 };
    expect(sanitizeJson(clean)).toBe(clean);
    expect(sanitizeJson([dirty, 1, null])).toEqual(['abcdef', 1, null]);
  });
});
