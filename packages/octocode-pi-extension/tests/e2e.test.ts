import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFauxCore, fauxAssistantMessage, fauxToolCall, getCurrentSystemPrompt, getCurrentTools, type TranscriptContext } from '@earendil-works/pi-ai';
import { createAgentSession, createMcpExtension, createToolSearchExtension, DefaultResourceLoader, SessionManager, SettingsManager, type ExtensionFactory } from '@earendil-works/pi-coding-agent';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Mail } from '../src/team/mail.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = path.join(HERE, '..', process.env['OCTOCODE_E2E_ENTRY'] === 'dist' ? 'dist/index.js' : 'src/index.ts');
const octocode = (await import(ENTRY)).default as ExtensionFactory;

// Hermetic: a run from inside a Pi subagent inherits its identity and settings, which change the prompt, tools and limits.
for (const key of ['OCTOCODE_SUBAGENT', 'OCTOCODE_BROWSER_VISIBLE', 'OCTOCODE_PARENT_ID', 'OCTOCODE_AGENT_ID', 'OCTOCODE_AGENT_GOAL', 'OCTOCODE_AGENT_COLLABORATE', 'OCTOCODE_SUBAGENT_COLLABORATE', 'OCTOCODE_MAX_SUBAGENTS', 'OCTOCODE_DIRECT_TOOLS', 'OCTOCODE_HOME', 'OCTOCODE_AGENT_DB', 'OCTOCODE_MEMORY_AUTO', 'OCTOCODE_MCP_WAIT_SECONDS']) {
  delete process.env[key];
}

const FIXTURE = path.join(HERE, 'fixtures', 'echo-mcp.mjs');

// The extension launches its `octocode-mcp` dependency as is: in this monorepo the pinned version resolves to the
// workspace build (`packages/octocode-mcp`), so the e2e runs the server source and release share.

interface Turn {
  systemPrompt: string;
  tools: string[];
  toolContracts: ReturnType<typeof getCurrentTools>;
  lastResults: Array<{ toolName: string; isError: boolean; text: string }>;
}

function snapshot(context: TranscriptContext): Turn {
  const results: Turn['lastResults'] = [];
  for (let index = context.messages.length - 1; index >= 0; index--) {
    const message = context.messages[index] as { role: string; toolName?: string; isError?: boolean; content?: unknown };
    if (message.role === 'system') continue; // tool/prompt deltas are recorded as system messages
    if (message.role !== 'toolResult') break;
    const text = Array.isArray(message.content) ? message.content.map((part: { text?: string }) => part.text ?? '').join('') : '';
    results.unshift({ toolName: String(message.toolName), isError: message.isError === true, text });
  }
  const toolContracts = getCurrentTools(context.messages);
  return { systemPrompt: getCurrentSystemPrompt(context.messages), tools: toolContracts.map((tool) => tool.name), toolContracts, lastResults: results };
}

type Reply = ReturnType<typeof fauxAssistantMessage>;

/** A real Pi agent session running the Octocode extension against a scripted model. */
async function startSession(mcpServers: Record<string, unknown>, options: { tools?: string[]; settings?: Record<string, unknown>; agentSettings?: Record<string, unknown>; models?: Array<{ id: string; inputCost: number; maxTokens: number }> } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'octocode-e2e-'));
  const cwd = path.join(root, 'project');
  const home = path.join(root, 'home');
  fs.mkdirSync(cwd, { recursive: true });
  fs.mkdirSync(home, { recursive: true });
  const agentDir = path.join(root, 'agent');
  fs.mkdirSync(agentDir, { recursive: true });
  if (options.agentSettings) fs.writeFileSync(path.join(agentDir, 'settings.json'), JSON.stringify(options.agentSettings));
  // The user trusted this project with Pi's /trust.
  fs.writeFileSync(path.join(agentDir, 'trust.json'), JSON.stringify({ [fs.realpathSync(root)]: true }));
  const originalHome = process.env['HOME'];
  const originalAgentDir = process.env['PI_CODING_AGENT_DIR'];
  const originalPermission = process.env['OCTOCODE_PERMISSION'];
  process.env['HOME'] = home; // keep the developer's own config out of the test
  process.env['PI_CODING_AGENT_DIR'] = agentDir; // and their Pi settings
  // Sessions start in manual, and a headless one denies every ask: this user exported workspace.
  process.env['OCTOCODE_PERMISSION'] = 'workspace';
  // Pi's built-in MCP reads the user-level mcp.json; an `octocode` entry there overrides Octocode's registration.
  fs.writeFileSync(path.join(agentDir, 'mcp.json'), JSON.stringify({ mcpServers }));
  const turns: Turn[] = [];
  const models = options.models ?? [{ id: 'faux-1', inputCost: 0, maxTokens: 4_096 }];
  const faux = createFauxCore({ provider: 'faux', models: models.map(({ id, maxTokens }) => ({ id, contextWindow: 200_000, maxTokens })) as never });
  const provider: ExtensionFactory = (pi) => {
    pi.registerProvider('faux', {
      name: 'Faux',
      api: faux.api,
      baseUrl: 'http://127.0.0.1:0',
      apiKey: 'test',
      models: faux.models.map((model, index) => ({ ...model, cost: { input: models[index]!.inputCost, output: 0, cacheRead: 0, cacheWrite: 0 } })),
      streamSimple: faux.streamSimple,
    } as never);
  };
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false }, ...options.settings });
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: path.join(root, 'agent'),
    settingsManager,
    extensionFactories: [
      { name: 'faux-provider', factory: provider },
      { name: 'octocode', factory: octocode },
      // The CLI loads Pi's MCP as a built-in extension, after the user's; SDK sessions add it themselves.
      { name: 'mcp', factory: createMcpExtension({ logPath: path.join(root, 'mcp.log') }) },
      // Also built in on the CLI: it loads the tools of a user's deferred servers (Octocode declares all of its own).
      { name: 'tool-search', factory: createToolSearchExtension() },
    ],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await resourceLoader.reload();
  const { session } = await createAgentSession({ cwd, agentDir: path.join(root, 'agent'), resourceLoader, settingsManager, sessionManager: SessionManager.inMemory(cwd), ...(options.tools ? { tools: options.tools } : {}) });
  await session.bindExtensions({ mode: 'json', shutdownHandler: () => undefined } as never);
  await session.setModel(session.modelRuntime.getModel('faux', 'faux-1')!);
  const run = async (prompt: string, replies: Array<(turn: Turn) => Reply>) => {
    faux.setResponses(
      replies.map((reply) => (context: TranscriptContext) => {
        const turn = snapshot(context);
        turns.push(turn);
        return reply(turn);
      }),
    );
    await session.prompt(prompt);
    return turns;
  };
  const dispose = async () => {
    await session.dispose?.();
    process.env['HOME'] = originalHome;
    if (originalAgentDir === undefined) delete process.env['PI_CODING_AGENT_DIR'];
    else process.env['PI_CODING_AGENT_DIR'] = originalAgentDir;
    if (originalPermission === undefined) delete process.env['OCTOCODE_PERMISSION'];
    else process.env['OCTOCODE_PERMISSION'] = originalPermission;
    fs.rmSync(root, { recursive: true, force: true });
  };
  return { cwd, session, faux, run, dispose };
}

/** An mcp.json `octocode` entry that keeps the server off (a file entry wins over Octocode's registration). */
const OCTOCODE_OFF = { octocode: { command: 'false', enabled: false } };

const calls = (...toolCalls: ReturnType<typeof fauxToolCall>[]) => () => fauxAssistantMessage(toolCalls, { stopReason: 'toolUse' });
const say = (text: string) => () => fauxAssistantMessage(text);

describe('with Octocode MCP (default)', () => {
  let s: Awaited<ReturnType<typeof startSession>>;
  beforeAll(async () => {
    s = await startSession({});
    fs.writeFileSync(path.join(s.cwd, 'app.ts'), 'export const answer = 41;\n');
    fs.writeFileSync(path.join(s.cwd, 'unread.txt'), 'never read\n');
  }, 60_000);
  afterAll(() => s.dispose());

  it('exposes MCP tools and Octocode guidance from the first request', async () => {
    const turn = (await s.run('hello', [say('ready')])).at(-1)!;
    // Real Pi + the local MCP, before provider-specific encoding. Project context and user skills are disabled here.
    // The separate prompt-size test guards only extension-owned prose/schemas, not this complete fixture prefix.
    const fixedChars = turn.systemPrompt.length + JSON.stringify(turn.toolContracts).length;
    console.log(`default Pi + Octocode prefix: ${fixedChars} chars (prompt ${turn.systemPrompt.length}, ${turn.tools.length} tools)`);
    expect(fixedChars, 'default runtime prompt and declarations grew beyond their 5% headroom').toBeLessThan(43_500);
    expect(turn.tools).toContain('file');
    expect(turn.tools).toContain('read');
    expect(turn.tools).toContain('mcp__octocode__localFetch');
    expect(turn.tools).toContain('mcp__octocode__localSearch');
    for (const name of ['edit', 'write']) expect(turn.tools).not.toContain(name);
    expect(turn.systemPrompt).toContain('<octocode>');
    // Every tool the server lists, GitHub and package registry ones included, is declared from the first request.
    for (const name of ['ghSearchRepo', 'ghSearchCode', 'ghStructure', 'ghGetFileContent', 'ghSearchHistory', 'ghGetHistoryItem', 'artifactSearch', 'localSearch', 'structureSearch', 'astSearch', 'localFetch', 'lspSearch']) expect(turn.tools).toContain(`mcp__octocode__${name}`);
    expect(turn.tools).not.toContain('tool_search');
    // The extension's client connects before the first request is built, so the guidance and the server's own
    // instructions (which Pi puts in no prompt for direct tools) are there from the start, unchanged on the next request.
    expect(turn.systemPrompt).toContain('Use Octocode MCP (`mcp__octocode__*`');
    expect(turn.systemPrompt).toMatch(/# Octocode MCP server instructions\n\S/);
    const next = (await s.run('continue', [say('ready')])).at(-1)!;
    expect(next.tools).toContain('mcp__octocode__localSearch');
    expect(next.systemPrompt).toBe(turn.systemPrompt);
    expect(next.toolContracts).toEqual(turn.toolContracts);
  }, 60_000);

  it('records passive team notices during streaming without an extra model request', async () => {
    const mail = new Mail({ sendMessage: s.session.sendCustomMessage.bind(s.session) });
    let requests = 0;
    const unsubscribe = s.session.agent.subscribe((event) => { if (event.type === 'turn_start') requests++; });
    try {
      await s.run('finish this step', [() => {
        expect(mail.notice('passive notice: earlier mail was not delivered')).toBe(true);
        return fauxAssistantMessage('done');
      }]);
    } finally { unsubscribe(); }
    expect(requests).toBe(1);
    expect(JSON.stringify(s.session.sessionManager.getBranch())).toContain('passive notice: earlier mail was not delivered');
  });

  it('researches through Octocode, reads with read, then edits, writes and deletes with batched file calls', async () => {
    const appPath = path.join(s.cwd, 'app.ts');
    const turns = await s.run('fix the answer', [
      calls(fauxToolCall('mcp__octocode__localFetch', { queries: [{ path: appPath, fullContent: true }] }), fauxToolCall('read', { path: 'app.ts' })),
      calls(
        fauxToolCall('file', {
          queries: [
            { reasoning: 'answer is off by one', type: 'edit', path: 'app.ts', edits: [{ oldText: '41', newText: '42' }] },
            { reasoning: 'document the constant', type: 'write', path: 'NOTES.md', content: '# Notes\n' },
            { reasoning: 'replace a whole file', type: 'write', path: 'unread.txt', content: 'replaced' },
          ],
        }),
      ),
      calls(fauxToolCall('file', { queries: [{ reasoning: 'no longer needed', type: 'delete', path: 'NOTES.md' }] })),
      say('done'),
    ]);
    const [afterRead, afterBatch, afterDelete] = turns.slice(-3);
    expect(afterRead!.lastResults[0]!.text).toContain('export const answer = 41');
    const batch = afterBatch!.lastResults[0]!;
    expect(batch.isError).toBe(false);
    expect(batch.text).toMatch(/1\. OK edit app\.ts/);
    expect(batch.text).toMatch(/2\. OK write NOTES\.md/);
    // An existing file never read in this session is refused; the rest of the batch still applies.
    expect(batch.text).toMatch(/3\. FAILED write unread\.txt: unread\.txt already exists and was not read in this session/);
    expect(afterDelete!.lastResults[0]!.text).toMatch(/OK delete NOTES\.md/);
    expect(fs.readFileSync(appPath, 'utf8')).toBe('export const answer = 42;\n');
    expect(fs.readFileSync(path.join(s.cwd, 'unread.txt'), 'utf8')).toBe('never read\n');
    expect(fs.existsSync(path.join(s.cwd, 'NOTES.md'))).toBe(false);
  }, 60_000);

  it('refuses to edit a file that changed on disk after it was read', async () => {
    const appPath = path.join(s.cwd, 'app.ts');
    const turns = await s.run('edit again', [
      () => {
        fs.writeFileSync(appPath, 'export const answer = 7;\n'); // someone else edits the file
        return fauxAssistantMessage([fauxToolCall('file', { queries: [{ reasoning: 'bump', type: 'edit', path: 'app.ts', edits: [{ oldText: '42', newText: '43' }] }] })], { stopReason: 'toolUse' });
      },
      say('done'),
    ]);
    const result = turns.at(-1)!.lastResults[0]!;
    expect(result.isError).toBe(true);
    expect(result.text).toMatch(/changed on disk since you last read it/);
  }, 60_000);

  it('leaves the file guard to Pi read: an Octocode MCP read does not unlock a change', async () => {
    const seen = path.join(s.cwd, 'seen.ts');
    fs.writeFileSync(seen, 'export const seen = 1;\n');
    const turns = await s.run('read then edit', [
      calls(fauxToolCall('mcp__octocode__localFetch', { queries: [{ path: seen, fullContent: true }] })),
      calls(fauxToolCall('file', { queries: [{ reasoning: 'bump', type: 'edit', path: 'seen.ts', edits: [{ oldText: 'seen = 1', newText: 'seen = 2' }] }] })),
      say('done'),
    ]);
    const [afterRead, afterEdit] = turns.slice(-2);
    expect(afterRead!.lastResults[0]!.text).toContain('export const seen = 1;');
    expect(afterEdit!.lastResults[0]!.text).toMatch(/seen\.ts already exists and was not read in this session/);
    expect(fs.readFileSync(seen, 'utf8')).toBe('export const seen = 1;\n');
  }, 60_000);

  it('gives the model a page over 20 KB of UTF-8 whole, with no truncation marker', async () => {
    // Octocode budgets pages in characters, so a page of non-ASCII source is far over 20 KB of UTF-8.
    const files = ['one', 'two'].map((name) => {
      const file = path.join(s.cwd, `${name}.ts`);
      fs.writeFileSync(file, Array.from({ length: 3_000 }, (_, index) => `export const ${name}${index} = '${'日本語のテキスト'.repeat(4)}';\n`).join(''));
      return file;
    });
    const turns = await s.run('read both', [calls(fauxToolCall('mcp__octocode__localFetch', { queries: files.map((file) => ({ path: file, ranges: ['1-600'] })) })), say('done')]);
    const text = turns.at(-1)!.lastResults[0]!.text;
    expect(Buffer.byteLength(text)).toBeGreaterThan(20 * 1024);
    expect(text).not.toMatch(/truncated|fullOutputPath|pi-mcp/i);
    // Both rows arrive whole: each one's first returned line and its own continuation.
    for (const name of ['one', 'two']) expect(text).toContain(`export const ${name}0 = `);
    expect(text.match(/^next:$/gm)?.length).toBe(2);
  }, 60_000);
});

describe('with the user\'s own octocode server in mcp.json', () => {
  let s: Awaited<ReturnType<typeof startSession>>;
  beforeAll(async () => {
    // The user's entry owns `octocode`: Pi runs it, and the extension starts and registers nothing of its own.
    s = await startSession({ octocode: { command: process.execPath, args: [FIXTURE], exposure: 'direct' } });
  }, 60_000);
  afterAll(() => s.dispose());

  it('leaves the server to Pi, follows its tools in the prompt, and round-trips a call', async () => {
    const turns = await s.run('use it', [calls(fauxToolCall('mcp__octocode__shout', { text: 'hi' })), say('done')]);
    const first = turns.at(-2)!;
    expect(first.tools).toContain('mcp__octocode__shout');
    expect(first.tools).not.toContain('mcp__octocode__localSearch');
    expect(first.systemPrompt).toContain('Use Octocode MCP');
    expect(first.systemPrompt).not.toContain('# Octocode MCP server instructions');
    expect(turns.at(-1)!.lastResults[0]).toEqual({ toolName: 'mcp__octocode__shout', isError: false, text: 'HI' });
  });
});

describe('with another MCP server and Octocode disabled', () => {
  let s: Awaited<ReturnType<typeof startSession>>;
  beforeAll(async () => {
    s = await startSession({ ...OCTOCODE_OFF, echo: { command: process.execPath, args: [FIXTURE], exposure: 'direct' } });
  }, 60_000);
  afterAll(() => s.dispose());

  it('keeps Pi read, leaves MCP to Pi, and drops the Octocode research line', async () => {
    const turn = (await s.run('hello', [say('ready')])).at(-1)!;
    for (const name of ['read', 'file', 'bash', 'web', 'agent', 'askUser', 'coordinate', 'sendMessage', 'backlog', 'memory', 'mcp__echo__shout']) expect(turn.tools).toContain(name);
    for (const name of ['edit', 'write', 'mcp']) expect(turn.tools).not.toContain(name);
    expect(turn.tools.some((name) => name.startsWith('mcp__octocode__'))).toBe(false);
    // The mcp.json entry replaces the registration, so no request is told to prefer Octocode.
    expect(turn.systemPrompt).not.toContain('Use Octocode MCP');
    const next = (await s.run('again', [say('ok')])).at(-1)!;
    expect(next.systemPrompt).not.toContain('Use Octocode MCP');
  });

  it('calls another server\'s tools through Pi\'s MCP, surfacing remote errors', async () => {
    const turns = await s.run('use echo', [calls(fauxToolCall('mcp__echo__shout', { text: 'hi' }), fauxToolCall('mcp__echo__fail', {})), say('done')]);
    const [ok, failed] = turns.at(-1)!.lastResults;
    expect(ok).toEqual({ toolName: 'mcp__echo__shout', isError: false, text: 'HI' });
    expect(failed!.isError).toBe(true);
    expect(failed!.text).toContain('boom');
  });

  it('writes new files, refuses an unread existing one, and a read then write works', async () => {
    fs.writeFileSync(path.join(s.cwd, 'existing.txt'), 'original\n');
    const turns = await s.run('write files', [
      calls(fauxToolCall('file', { queries: [{ reasoning: 'new', type: 'write', path: 'new.txt', content: 'fresh' }, { reasoning: 'clobber', type: 'write', path: 'existing.txt', content: 'x' }] })),
      calls(fauxToolCall('read', { path: 'existing.txt' })),
      calls(fauxToolCall('file', { queries: [{ reasoning: 'replace', type: 'write', path: 'existing.txt', content: 'replaced' }] })),
      say('done'),
    ]);
    const [writes, , rewrite] = turns.slice(-3);
    expect(writes!.lastResults[0]!.text).toMatch(/1\. OK write new\.txt[\s\S]*2\. FAILED write existing\.txt: existing\.txt already exists and was not read/);
    expect(rewrite!.lastResults[0]!.text).toMatch(/OK write existing\.txt/);
    expect(fs.readFileSync(path.join(s.cwd, 'existing.txt'), 'utf8')).toBe('replaced');
  });

  it('trims old large tool results with persistent context edits at the turn boundary', async () => {
    fs.writeFileSync(path.join(s.cwd, 'big.txt'), 'line of text\n'.repeat(1_000));
    const reads = Array.from({ length: 22 }, () => fauxToolCall('read', { path: 'big.txt' }));
    // The reads ran past any prompt-cache lifetime (the call message, and every earlier request of this session, are an
    // hour old), so the cache is cold and trims are due. The faux provider reports cache use, so the inferred lifetime applies.
    const realNow = Date.now.bind(Date);
    const later = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + 60 * 60_000 + 1);
    const cold = () => fauxAssistantMessage(reads, { stopReason: 'toolUse', timestamp: realNow() });
    const results = await s.run('read a lot', [cold, say('done')]).finally(() => later.mockRestore()).then((turns) => turns.at(-1)!.lastResults);
    expect(results).toHaveLength(22);
    // 13k-char results: six fit the 80k verbatim budget, the older 16 are trimmed.
    expect(results.slice(0, 16).every((result) => /were trimmed/.test(result.text))).toBe(true);
    expect(results.slice(16).every((result) => result.text.length > 10_000)).toBe(true);
    expect(s.session.sessionManager.getEntries().filter((entry) => entry.type === 'context_edit')).toHaveLength(16);
  });

  it('reports unavailable askUser without inventing an answer or approval', async () => {
    const question = { question: 'Which?', header: 'Pick', options: [{ label: 'A (Recommended)', description: 'a' }, { label: 'B', description: 'b' }] };
    const turns = await s.run('ask', [calls(fauxToolCall('askUser', { questions: [question] })), say('done')]);
    expect(turns.at(-1)!.lastResults[0]!.text).toMatch(/No interactive user/);
    expect(turns.at(-1)!.lastResults[0]!.text).toContain('No answer or approval was supplied.');
  });
});

describe('compaction', () => {
  let s: Awaited<ReturnType<typeof startSession>>;
  const compactionEntries = () => s.session.sessionManager.getEntries().filter((entry) => entry.type === 'compaction') as Array<{ fromHook?: boolean; summary: string; details?: Record<string, unknown> }>;
  /** Answers every summary request, recording the model and prompt text of each. */
  const script = (reply: string) => {
    const log: Array<{ model: string; text: string }> = [];
    s.faux.setResponses(
      Array.from({ length: 10 }, () => (context: TranscriptContext, _options: unknown, _state: unknown, model: { id: string }) => {
        log.push({ model: model.id, text: JSON.stringify(context.messages) });
        return fauxAssistantMessage(reply);
      }),
    );
    return log;
  };

  beforeAll(async () => {
    s = await startSession(
      OCTOCODE_OFF,
      {
        // A priced session model plus a cheaper small-tier one: compaction must stay on the session model.
        models: [
          { id: 'faux-1', inputCost: 3, maxTokens: 32_000 },
          { id: 'faux-haiku', inputCost: 1, maxTokens: 16_000 },
        ],
        settings: { compaction: { enabled: false, keepRecentTokens: 50 } },
      },
    );
  }, 60_000);
  afterAll(() => s.dispose());

  it("lets Pi summarize on the user's model, listing files the file tool changed", async () => {
    fs.writeFileSync(path.join(s.cwd, 'notes.txt'), 'hello\n');
    await s.run('Please read notes.txt and create todo.txt', [
      calls(fauxToolCall('read', { path: 'notes.txt' })),
      calls(fauxToolCall('file', { queries: [{ reasoning: 'create', type: 'write', path: 'todo.txt', content: 'x' }] })),
      say(`Done. ${'detail '.repeat(300)}`),
    ]);
    await s.run('Now keep going with the plan', [say(`More work. ${'detail '.repeat(300)}`)]);
    const log = script('## Goal\nPi summary');
    await s.session.compact('keep the notes');
    expect(log.length).toBeGreaterThan(0);
    expect(new Set(log.map((call) => call.model))).toEqual(new Set(['faux-1']));
    expect(log.some((call) => call.text.includes('keep the notes'))).toBe(true);
    const entry = compactionEntries().at(-1)!;
    expect(entry.fromHook).not.toBe(true);
    expect(entry.details).toMatchObject({ readFiles: ['notes.txt'], modifiedFiles: ['todo.txt'] });
    expect(entry.summary).toContain('Pi summary');
    expect(entry.summary).toMatch(/<read-files>\nnotes\.txt\n<\/read-files>[\s\S]*<modified-files>\ntodo\.txt\n<\/modified-files>/);
  }, 60_000);

  it('makes a file read before compaction need a fresh read before it is changed', async () => {
    const write = () => calls(fauxToolCall('file', { queries: [{ reasoning: 'replace', type: 'write', path: 'notes.txt', content: 'x' }] }));
    const refused = await s.run('overwrite', [write(), say('done')]);
    expect(refused.at(-1)!.lastResults[0]!.text).toMatch(/FAILED write notes\.txt: .*Read it again/);
    const turns = await s.run('read, then overwrite', [calls(fauxToolCall('read', { path: 'notes.txt' })), write(), say('done')]);
    expect(turns.at(-1)!.lastResults[0]!.text).toMatch(/OK write notes\.txt/);
  }, 60_000);

  it('carries file-tool paths forward through the next Pi compaction', async () => {
    await s.run('more', [say(`Even more. ${'detail '.repeat(300)}`)]);
    script('## Goal\nNext summary');
    await s.session.compact();
    expect(compactionEntries().at(-1)!.details!['modifiedFiles']).toEqual(expect.arrayContaining(['todo.txt', 'notes.txt']));
  }, 60_000);
});

describe('request too large (HTTP 413)', () => {
  let s: Awaited<ReturnType<typeof startSession>>;
  beforeAll(async () => {
    s = await startSession(OCTOCODE_OFF);
    // A 1x1 PNG: Pi's `read` returns it as an image part.
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    for (const name of ['a.png', 'b.png', 'c.png']) fs.writeFileSync(path.join(s.cwd, name), png);
  }, 60_000);
  afterAll(() => s.dispose());

  it('strips older images and retries on its own when a gateway rejects the request with a bodiless 413', async () => {
    const images = (context: TranscriptContext) =>
      context.messages.reduce((sum, message) => {
        const content = (message as { content?: unknown }).content;
        return sum + (Array.isArray(content) ? content.filter((part: { type?: string }) => part.type === 'image').length : 0);
      }, 0);
    const seen: number[] = [];
    // The gateway accepts at most one image per request.
    const gateway = (context: TranscriptContext, reply: Reply) => {
      seen.push(images(context));
      return images(context) > 1 ? fauxAssistantMessage([], { stopReason: 'error', errorMessage: '413 status code (no body)' }) : reply;
    };
    s.faux.setResponses([
      (context) => gateway(context, fauxAssistantMessage([fauxToolCall('read', { path: 'a.png' }), fauxToolCall('read', { path: 'b.png' }), fauxToolCall('read', { path: 'c.png' })], { stopReason: 'toolUse' })),
      (context) => gateway(context, fauxAssistantMessage('rejected')),
      (context) => gateway(context, fauxAssistantMessage('looked at the newest image')),
    ]);
    await s.session.prompt('look at the screenshots');
    // Request 2 carries three images and is rejected; the retry keeps only the newest and succeeds, without a new prompt.
    expect(seen).toEqual([0, 3, 1]);
    const last = s.session.messages.at(-1) as { role: string; content: Array<{ text?: string }> };
    expect(last.role).toBe('assistant');
    expect(last.content.map((part) => part.text).join('')).toBe('looked at the newest image');
  }, 60_000);
});

describe('with a tool allowlist that leaves out file', () => {
  let s: Awaited<ReturnType<typeof startSession>>;
  beforeAll(async () => {
    s = await startSession(OCTOCODE_OFF, { tools: ['read', 'bash', 'edit', 'write'] });
  }, 60_000);
  afterAll(() => s.dispose());

  it('keeps Pi edit and write, so the agent can still change files', async () => {
    const turn = (await s.run('hi', [say('ok')])).at(-1)!;
    expect(turn.tools).toEqual(expect.arrayContaining(['read', 'bash', 'edit', 'write']));
    expect(turn.tools).not.toContain('file');
  });
});

describe('a subagent session with visible browser and MCP enabled', () => {
  let s: Awaited<ReturnType<typeof startSession>>;
  const previous = {
    web: process.env['OCTOCODE_BROWSER_VISIBLE'],
    sub: process.env['OCTOCODE_SUBAGENT'],
  };

  beforeAll(async () => {
    process.env['OCTOCODE_BROWSER_VISIBLE'] = '1';
    process.env['OCTOCODE_SUBAGENT'] = '1';
    s = await startSession({});
    fs.writeFileSync(path.join(s.cwd, 'app.ts'), 'export const answer = 41;\n');
  }, 200_000);

  afterAll(async () => {
    await s?.dispose();
    for (const [key, value] of [['OCTOCODE_BROWSER_VISIBLE', previous.web], ['OCTOCODE_SUBAGENT', previous.sub]] as const) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('has Octocode and browser tools and can call Octocode', async () => {
    const turn = (await s.run('hello', [say('ready')])).at(-1)!;
    expect(turn.tools).toContain('mcp__octocode__localFetch');
    expect(turn.tools).toContain('browser');
    expect(turn.tools.filter((name) => name.includes('cua'))).toEqual([]);
    expect(turn.tools).not.toContain('agent');
    expect(turn.tools).not.toContain('askUser');
    expect(turn.toolContracts.find((tool) => tool.name === 'memory')?.parameters).toMatchObject({
      properties: { op: { enum: ['search', 'get', 'list'] } },
    });
    expect(turn.toolContracts.find((tool) => tool.name === 'backlog')?.parameters).toMatchObject({
      properties: { op: { enum: ['list', 'get', 'add', 'update'] } },
    });
    for (const name of ['coordinate', 'sendMessage', 'backlog', 'memory']) expect(turn.tools).toContain(name);
    expect(turn.systemPrompt).toContain('You are a subagent');
    expect(turn.systemPrompt).toContain('reserve files');
    const appPath = path.join(s.cwd, 'app.ts');
    const turns = await s.run('read', [
      calls(fauxToolCall('mcp__octocode__localFetch', { queries: [{ path: appPath, fullContent: true }] })),
      say('done'),
    ]);
    const results = turns.at(-1)!.lastResults;
    expect(results.find((result) => result.toolName === 'mcp__octocode__localFetch')?.text).toContain('answer = 41');
  }, 60_000);
});
