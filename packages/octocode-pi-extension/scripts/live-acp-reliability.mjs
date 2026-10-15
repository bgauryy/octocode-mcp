import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import assert from 'node:assert/strict';

const USAGE = `Optional ACP reliability check for the built Pi extension.
  node packages/octocode-pi-extension/scripts/live-acp-reliability.mjs --fixture [--out DIR]
  node packages/octocode-pi-extension/scripts/live-acp-reliability.mjs --live [--out DIR] [--max-prompts 20]

No arguments or --help prints this help and makes no model calls.
--fixture runs the same lifecycle through local official-SDK agents, without cloud models.
--live explicitly permits up to --max-prompts cloud prompt attempts across Claude and Codex.
It creates fresh sessions, never resumes human conversations or automatically replays a failed prompt.
Requires the built extension and existing vendor authentication. HOME remains unchanged.
Results retain every attempt, full non-thought replies, hook correlation, usage, hashes and cleanup.
The abrupt process-group crash case currently requires POSIX; this is a bounded development soak.
`;
const { values } = parseArgs({ options: { live: { type: 'boolean' }, fixture: { type: 'boolean' }, help: { type: 'boolean' }, out: { type: 'string' }, 'max-prompts': { type: 'string' } } });
if (values.help || (!values.live && !values.fixture)) { console.log(USAGE); process.exit(0); }
if (values.live && values.fixture) throw new Error('Choose --live or --fixture.');
if (process.platform === 'win32') throw new Error('Abrupt process-group crash is not implemented on Windows; no model calls were made.');
const maxPrompts = Number(values['max-prompts'] ?? 20);
if (!Number.isSafeInteger(maxPrompts) || maxPrompts < 18) throw new Error('This case set needs a ceiling of at least 18 prompt attempts; no model calls were made.');
const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const repo = path.resolve(packageRoot, '../..');
const parent = path.resolve(values.out ?? path.join(repo, '.octocode/octocode-eval-benchmark/live-acp-reliability'));
fs.mkdirSync(parent, { recursive: true });
const run = path.join(parent, `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
fs.mkdirSync(run);
const workspace = path.join(run, 'workspace');
const userConfig = path.join(run, 'user-config');
const agentDir = path.join(run, 'pi-agent');
const octocodeHome = path.join(run, 'octocode');
for (const dir of [workspace, userConfig, agentDir, octocodeHome]) fs.mkdirSync(dir);
assert.equal(spawnSync('git', ['init', '-q'], { cwd: workspace, stdio: 'pipe' }).status, 0);
const originalHome = process.env.HOME;
os.homedir = () => userConfig;
syncBuiltinESMExports();
for (const key of Object.keys(process.env)) if (key.startsWith('OCTOCODE_')) delete process.env[key];
Object.assign(process.env, {
  OCTOCODE_HOME: octocodeHome, OCTOCODE_AGENT_DB: path.join(run, 'agents.sqlite'), PI_CODING_AGENT_DIR: agentDir,
  OCTOCODE_PERMISSION: 'full', OCTOCODE_MCP: '0', OCTOCODE_HOOKS: '1', OCTOCODE_MODELS_DEV: '0', OCTOCODE_MEMORY_AUTO: '0', OCTOCODE_API: '0', OCTOCODE_API_HTTP: '0',
});
fs.writeFileSync(path.join(agentDir, 'trust.json'), JSON.stringify({ [fs.realpathSync(workspace)]: true }));
const hookFile = path.join(run, 'hooks.jsonl');
const recorder = path.join(run, 'hook-recorder.mjs');
fs.writeFileSync(recorder, `import fs from 'node:fs'; let text=''; process.stdin.setEncoding('utf8'); process.stdin.on('data',c=>text+=c).on('end',()=>{fs.appendFileSync(${JSON.stringify(hookFile)},JSON.stringify(JSON.parse(text))+'\\n'); console.log('{}');});`);
const quote = (text) => `'${text.replaceAll("'", "'\\''")}'`;
const command = `${quote(process.execPath)} ${quote(recorder)}`;
fs.writeFileSync(path.join(octocodeHome, 'hooks.json'), JSON.stringify({ hooks: {
  PreMessageSend: [{ matcher: 'external', hooks: [{ type: 'command', command, failClosed: true, timeout: 10 }] }],
  PostMessageReceive: [{ matcher: 'external', hooks: [{ type: 'command', command, timeout: 10 }] }],
} }));
const { createFauxCore, fauxAssistantMessage, fauxToolCall } = await import('@earendil-works/pi-ai');
const { createAgentSession, DefaultResourceLoader, SettingsManager, SessionManager } = await import('@earendil-works/pi-coding-agent');
const { default: octocode } = await import(path.join(packageRoot, 'dist/index.js'));
const { ApiClient } = await import(path.join(packageRoot, 'dist/api/client.js'));
const { apiDir, listInstances } = await import(path.join(packageRoot, 'dist/api/registry.js'));
const { redactData } = await import(path.join(packageRoot, 'dist/shared/sanitize.js'));
const { descendantPids, groupMembers, stopTree, processMatch } = await import(path.join(packageRoot, 'dist/shared/process.js'));
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const report = { mode: values.live ? 'live' : 'fixture', evidenceClass: 'bounded development soak', started: new Date().toISOString(), run, maxPrompts,
  runtime: { node: process.version, platform: process.platform, arch: process.arch },
  cloudPromptAttempts: 0, trials: [], vendors: [], checks: {}, hashes: Object.fromEntries(['dist/index.js', 'dist/external/acp.js', 'dist/external/manager.js', 'dist/external/register.js', 'scripts/live-acp-reliability.mjs', 'scripts/acp-reliability-proxy.mjs'].map((file) => [file, hash(path.join(packageRoot, file))])) };
const save = () => fs.writeFileSync(path.join(run, 'results.json'), `${JSON.stringify(redactData(report), null, 2)}\n`);
const readJsonl = (file) => fs.existsSync(file) ? fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
const events = [];
const connections = [];
const cliChildren = new Set();
let session;
let api;
let instance;
let interrupted;
const interrupt = (signal) => {
  interrupted = signal;
  report.interrupted = signal;
  process.exitCode = 1;
  if (session) void session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' }).catch((error) => { report.shutdownError = error.message; });
};
process.once('SIGTERM', interrupt);
process.once('SIGINT', interrupt);
const faux = createFauxCore({ provider: 'reliability-controller', models: [{ id: 'scripted', contextWindow: 200000, maxTokens: 4096 }] });
const provider = (pi) => pi.registerProvider('reliability-controller', { name: 'Scripted controller', api: faux.api, baseUrl: 'http://127.0.0.1:0', apiKey: 'fixture-only',
  models: faux.models.map((model) => ({ ...model, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } })), streamSimple: faux.streamSimple });
async function waitFor(check, timeoutMs = 120000) {
  const end = Date.now() + timeoutMs;
  while (!check()) { if (interrupted) throw new Error(`Run interrupted by ${interrupted}; execution may have occurred, no replay`); if (Date.now() >= end) throw new Error('Case observation deadline exceeded; no prompt replay'); await new Promise((resolve) => setTimeout(resolve, 25)); }
}
function budget(vendor, phase, text) {
  if (interrupted) throw new Error(`Run interrupted by ${interrupted}; no further prompts`);
  if (values.live) { assert.ok(report.cloudPromptAttempts < maxPrompts, 'cloud prompt ceiling'); report.cloudPromptAttempts += 1; }
  const trial = { id: randomUUID(), vendor, phase, text, started: Date.now(), state: 'submitted' };
  report.trials.push(trial); save();
  return trial;
}
function failure(error) { return { error: error.message ?? String(error), ...(error.data ?? {}) }; }
async function toolBatch(inputs) {
  const ids = inputs.map(() => randomUUID());
  const start = events.length;
  faux.setResponses([fauxAssistantMessage(inputs.map((input, i) => fauxToolCall('externalAgent', input, { id: ids[i] })), { stopReason: 'toolUse' }), fauxAssistantMessage('Step complete.')]);
  await session.prompt('Execute the configured isolated externalAgent step.');
  return ids.map((id) => {
    const event = events.slice(start).find((event) => event.type === 'tool_execution_end' && event.toolCallId === id);
    assert.ok(event, 'registered externalAgent result');
    return event.isError ? { error: JSON.stringify(event.result) } : event.result.details;
  });
}
const tool = async (input) => (await toolBatch([input]))[0];
async function cli(input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(packageRoot, 'dist/api/cli.js'), 'external', '--to', instance.id, JSON.stringify(input)], { cwd: workspace, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    cliChildren.add(child);
    let stdout = ''; let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (text) => { stdout += text; });
    child.stderr.setEncoding('utf8').on('data', (text) => { stderr += text; });
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('CLI deadline; execution may have occurred, no replay')); }, 135000);
    child.once('error', reject);
    child.once('close', (code) => { clearTimeout(timer); cliChildren.delete(child); if (code) reject(new Error(stderr)); else { try { resolve(JSON.parse(stdout)); } catch (error) { reject(error); } } });
  });
}
function hooks(reply, text, connection, successful) {
  const records = readJsonl(hookFile);
  const sent = records.filter((entry) => entry.hook_event_name === 'PreMessageSend' && entry.message?.to === connection.id && entry.message.text === text);
  assert.equal(sent.length, 1, 'exactly one outbound hook per dispatched request');
  const received = records.filter((entry) => entry.hook_event_name === 'PostMessageReceive' && entry.message?.replyTo === sent[0].message.id);
  assert.equal(received.length, successful ? 1 : 0, 'completed reply or explicit failure, never invented reception');
  if (successful) { assert.equal(reply.messageId, sent[0].message.id); assert.equal(received[0].message.text, reply.reply.text); }
  return { outboundId: sent[0].message.id, inboundId: received[0]?.message.id ?? null };
}
function finish(trial, data, connection, expected) {
  trial.finished = Date.now(); trial.output = data;
  if (data.error) { trial.state = data.execution ?? 'failed'; trial.correlation = hooks(data, trial.text, connection, false); save(); throw new Error(`Prompt failed: ${data.error}`); }
  assert.equal(data.sessionId, connection.sessionId, 'persistent native session identity');
  assert.equal(data.reply.text.trim(), expected, 'conversation or arithmetic task result');
  assert.equal(data.reply.stopReason, 'end_turn');
  const toolCalls = data.reply.updates?.filter((entry) => entry.update?.sessionUpdate === 'tool_call') ?? [];
  assert.equal(toolCalls.length, 0, 'read-only model task used no tools or delegation');
  trial.correlation = hooks(data, trial.text, connection, true);
  trial.usage = data.reply.updates?.find((entry) => entry.type === 'prompt_response')?.response?.usage ?? null;
  trial.state = 'completed'; save();
}
async function connect(vendor, label, sessionId) {
  if (interrupted) throw new Error(`Run interrupted by ${interrupted}; no new connections`);
  const id = `${vendor}-${label}-${randomUUID().slice(0, 8)}`;
  const journal = path.join(run, `${id}.wire.jsonl`);
  const pkg = vendor === 'claude' ? '@agentclientprotocol/claude-agent-acp@0.90.0' : '@agentclientprotocol/codex-acp@2.2.2';
  const executable = values.fixture ? process.execPath : process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const args = values.fixture ? [path.join(packageRoot, 'tests/fixtures/external-acp-reliability-agent.mjs'), path.join(run, 'fixture-sessions')] : ['-y', pkg];
  const data = await tool({ action: 'connect', id, transport: 'acp', vendor: values.fixture ? 'test-fixture' : vendor, command: process.execPath,
    args: [path.join(packageRoot, 'scripts/acp-reliability-proxy.mjs'), journal, executable, ...args], cwd: workspace, timeoutMs: 120000, ...(sessionId ? { sessionId } : {}) });
  const connection = { id, sessionId: data.sessionId, requestedSessionId: sessionId, journal, pkg, label, vendor, info: data };
  connections.push(connection); save();
  if (data.error || !data.sessionId) throw Object.assign(new Error(JSON.stringify(data)), { connection });
  return connection;
}
const promptInput = (connection, text) => ({ action: 'prompt', id: connection.id, text, timeoutMs: 120000 });
async function prompt(connection, phase, text, expected, surface = 'api') {
  const trial = budget(connection.vendor, phase, text);
  let output;
  try { output = surface === 'tool' ? await tool(promptInput(connection, text)) : surface === 'cli' ? await cli(promptInput(connection, text)) : await api.call('external.call', promptInput(connection, text), { timeoutMs: 135000 }); }
  catch (error) { output = failure(error); }
  finish(trial, output, connection, expected); return trial;
}
async function disconnect(connection) {
  const members = readJsonl(connection.journal).find((entry) => entry.event === 'spawn');
  const before = members ? descendantPids(members.proxyPid) : [];
  await api.call('external.call', { action: 'disconnect', id: connection.id }, { timeoutMs: 15000 }).catch(() => undefined);
  connection.cleanup = { root: members?.proxyPid, observedDescendants: before, liveGroup: members ? groupMembers(members.proxyPid) : [] };
  assert.equal(connection.cleanup.liveGroup.length, 0, 'owned adapter group stopped'); save();
}
try {
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
  const resourceLoader = new DefaultResourceLoader({ cwd: workspace, agentDir, settingsManager, extensionFactories: [{ name: 'scripted-controller', factory: provider }, { name: 'built-octocode', factory: octocode }],
    noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true });
  await resourceLoader.reload();
  ({ session } = await createAgentSession({ cwd: workspace, agentDir, resourceLoader, settingsManager, sessionManager: SessionManager.inMemory(workspace), tools: ['externalAgent'] }));
  session.subscribe((event) => { if (event.type === 'tool_execution_start' || event.type === 'tool_execution_end') events.push(event); });
  await session.bindExtensions({ mode: 'json', shutdownHandler: () => undefined });
  await session.setModel(session.modelRuntime.getModel('reliability-controller', 'scripted'));
  instance = listInstances(apiDir())[0]; assert.ok(instance && instance.cwd === fs.realpathSync(workspace));
  api = new ApiClient(instance);
  const controls = await tool({ action: 'list' }); assert.deepEqual(controls.connections, []);
  report.checks.controllerRegisteredToolApi = true;
  for (const vendor of ['codex', 'claude']) {
    const state = { vendor, mainSuccessfulPrompts: 0, concurrentConnections: 2 }; report.vendors.push(state);
    process.stdout.write(`${vendor}: persistent and overlapping connections\n`);
    const main = await connect(vendor, 'main');
    const other = await connect(vendor, 'parallel');
    assert.notEqual(main.sessionId, other.sessionId);
    const marker = `M${randomUUID().replaceAll('-', '')}`;
    const otherMarker = `M${randomUUID().replaceAll('-', '')}`;
    const task = (value) => `Remember marker ${value} for this conversation. Reply only ${value}. Use no tools and do not delegate.`;
    const a = budget(vendor, 'persistent-1-overlap', task(marker));
    const b = budget(vendor, 'separate-connection-overlap', task(otherMarker));
    let settled = false;
    const overlapping = toolBatch([promptInput(main, a.text), promptInput(other, b.text)]).finally(() => { settled = true; });
    await waitFor(() => settled || [main, other].every((connection) => readJsonl(connection.journal).some((entry) => entry.direction === 'outbound' && entry.method === 'session/prompt')));
    assert.equal(settled, false, 'both requests overlap before settlement');
    const beforeRefusal = readJsonl(main.journal).filter((entry) => entry.direction === 'outbound' && entry.method === 'session/prompt').length;
    let refusal;
    try { refusal = await api.call('external.call', promptInput(main, `Reply only REFUSED_${randomUUID().replaceAll('-', '')}`)); }
    catch (error) { refusal = failure(error); }
    assert.match(refusal.error ?? '', /in flight/);
    assert.equal(readJsonl(main.journal).filter((entry) => entry.direction === 'outbound' && entry.method === 'session/prompt').length, beforeRefusal, 'refused request never reaches adapter');
    state.sameConnectionRefusal = refusal;
    const [first, second] = await overlapping;
    finish(a, first, main, marker); finish(b, second, other, otherMarker); state.mainSuccessfulPrompts += 1;
    const range = (connection) => {
      const records = readJsonl(connection.journal);
      const start = records.find((entry) => entry.direction === 'outbound' && entry.method === 'session/prompt');
      const end = records.find((entry) => entry.direction === 'inbound' && entry.id === start.id && entry.hasResult);
      assert.ok(end); return [start.time, end.time];
    };
    const ra = range(main); const rb = range(other);
    state.overlapMs = Math.min(ra[1], rb[1]) - Math.max(ra[0], rb[0]); assert.ok(state.overlapMs > 0);
    await prompt(other, 'parallel-memory-recall', 'Reply only the remembered marker. Use no tools and do not delegate.', otherMarker, 'cli');
    await prompt(main, 'persistent-2-recall', 'Reply only the remembered marker. Use no tools and do not delegate.', marker, 'cli'); state.mainSuccessfulPrompts += 1;
    const counter = 10 + Math.floor(Math.random() * 80);
    await prompt(main, 'persistent-3-counter', `Remember counter ${counter}. Keep the earlier marker. Reply only COUNTER_READY. Use no tools and do not delegate.`, 'COUNTER_READY'); state.mainSuccessfulPrompts += 1;
    await prompt(main, 'persistent-4-update', 'Add 7 to increment the remembered counter. Reply only the remembered marker, a colon, and the updated counter. Use no tools and do not delegate.', `${marker}:${counter + 7}`); state.mainSuccessfulPrompts += 1;
    await prompt(main, 'persistent-5-recall', 'Reply only the remembered marker and current counter separated by a colon. Use no tools and do not delegate.', `${marker}:${counter + 7}`, 'tool'); state.mainSuccessfulPrompts += 1;
    const crashText = `CRASH_BOUNDARY: Give 80 numbered rows of integers and their squares, beginning with CRASH_STARTED. Use no tools and do not delegate.`;
    const crash = budget(vendor, 'abrupt-process-failure', crashText);
    const earlier = readJsonl(main.journal).filter((entry) => entry.direction === 'outbound' && entry.method === 'session/prompt').length;
    let crashSettled = false;
    const pending = tool(promptInput(main, crashText)).finally(() => { crashSettled = true; });
    await waitFor(() => crashSettled || readJsonl(main.journal).filter((entry) => entry.direction === 'outbound' && entry.method === 'session/prompt').length > earlier);
    assert.equal(crashSettled, false, 'adapter prompt pending at crash boundary');
    const processRecord = readJsonl(main.journal).find((entry) => entry.event === 'spawn');
    crash.killed = { proxyPid: processRecord.proxyPid, descendants: descendantPids(processRecord.proxyPid) };
    assert.equal(processMatch(processRecord.proxyPid, processRecord.proxyStarted), 'same', 'crash targets the owned process identity');
    process.kill(-processRecord.proxyPid, 'SIGKILL');
    const broken = await pending;
    crash.finished = Date.now(); crash.output = broken; crash.state = broken.execution;
    crash.usage = broken.partial?.updates?.find((entry) => entry.type === 'prompt_response')?.response?.usage ?? null;
    assert.equal(broken.execution, 'uncertain'); assert.ok(broken.partial && typeof broken.partial.text === 'string');
    crash.correlation = hooks(broken, crashText, main, false);
    assert.equal(readJsonl(main.journal).filter((entry) => entry.direction === 'outbound' && entry.method === 'session/prompt').length, earlier + 1, 'crashed prompt never replayed');
    assert.equal((await api.call('external.call', { action: 'list' })).connections.some((entry) => entry.id === main.id), false, 'poisoned connection removed');
    state.crash = { explicitUncertain: true, partialCharacters: broken.partial.text.length, noReplay: true };
    let recovered;
    try {
      recovered = await connect(vendor, 'explicit-saved-recovery', main.sessionId);
      assert.equal(recovered.sessionId, main.sessionId);
      await prompt(recovered, 'saved-session-recovery', 'Reply only the remembered marker and current counter separated by a colon. Use no tools and do not delegate.', `${marker}:${counter + 7}`);
      state.savedSessionRecovery = true;
    } catch (error) {
      state.savedSessionRecovery = false;
      state.savedSessionRecoveryError = error.message;
      if (recovered) throw error;
      recovered = await connect(vendor, 'explicit-fresh-recovery');
      const recoveryMarker = `RECOVERED_${randomUUID().replaceAll('-', '')}`;
      await prompt(recovered, 'fresh-session-recovery', `Reply only ${recoveryMarker}. Use no tools and do not delegate.`, recoveryMarker);
    }
    await disconnect(other); await disconnect(recovered);
    state.completed = true; save(); process.stdout.write(`${vendor}: five persistent replies, overlap, refusal, crash and explicit recovery passed\n`);
  }
  assert.deepEqual((await api.call('external.call', { action: 'list' })).connections, []);
  report.checks.noRemainingConnections = true;
} catch (error) { report.error = error.stack ?? String(error); process.exitCode = 1; }
finally {
  for (const connection of connections) {
    const record = readJsonl(connection.journal).find((entry) => entry.event === 'spawn');
    if (record && processMatch(record.proxyPid, record.proxyStarted) === 'same') await stopTree(record.proxyPid);
  }
  for (const child of cliChildren) child.kill('SIGTERM');
  if (session) await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' });
  session?.dispose();
  for (const trial of report.trials) if (trial.state === 'submitted') { trial.state = 'uncertain-unobserved'; trial.error = 'Run ended before a correlated outcome was observed; no automatic replay'; }
  report.finished = new Date().toISOString(); report.hooks = readJsonl(hookFile); report.connections = connections;
  report.checks.homeUnchanged = process.env.HOME === originalHome;
  report.checks.apiRecordsAfterShutdown = listInstances(apiDir()).length;
  report.checks.liveGroupsAfterShutdown = connections.flatMap((connection) => {
    const pid = readJsonl(connection.journal).find((entry) => entry.event === 'spawn')?.proxyPid;
    return pid ? groupMembers(pid) : [];
  });
  fs.writeFileSync(path.join(run, 'tool-events.json'), `${JSON.stringify(redactData(events), null, 2)}\n`);
  save(); console.log(JSON.stringify({ run, mode: report.mode, cloudPromptAttempts: report.cloudPromptAttempts, vendors: report.vendors, checks: report.checks, error: report.error }, null, 2));
}
