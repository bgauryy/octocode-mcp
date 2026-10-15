import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';

const { name, root, cwd, bundle } = JSON.parse(process.argv[2]);
const privateHome = path.join(root, name, 'home');
const agentDir = path.join(root, name, 'agent');
for (const dir of [privateHome, agentDir]) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
os.homedir = () => privateHome;
syncBuiltinESMExports();
Object.assign(process.env, {
  PI_CODING_AGENT_DIR: agentDir, OCTOCODE_HOME: path.join(root, 'octocode'),
  OCTOCODE_API: '1', OCTOCODE_API_HTTP: '0', OCTOCODE_HOOKS: '0', OCTOCODE_MCP: '0',
  OCTOCODE_MEMORY_AUTO: '0', OCTOCODE_EXTRA_SKILLS: '0', OCTOCODE_NOTIFY: 'off', OCTOCODE_PERMISSION: 'full',
});
const sdk = await import('@earendil-works/pi-coding-agent');
const { fauxProvider, fauxAssistantMessage } = await import('@earendil-works/pi-ai');
const { apiDir, listInstances, PiBackend } = await import(bundle);
const entry = fileURLToPath(bundle);
const connections = new Map();
const send = (value) => process.connected && process.send(value);
let session;
let faux;
let generation = 0;
const requests = [];
const errors = [];

function contentText(value) {
  return typeof value === 'string' ? value : Array.isArray(value) ? value.filter((part) => part.type === 'text').map((part) => part.text).join('') : '';
}
async function boot() {
  generation++;
  faux = fauxProvider({ provider: `fixture-${name}`, api: `fixture-api-${name}`, models: [{ id: 'deterministic', name: 'Deterministic messaging fixture' }] });
  const response = async (context, options) => {
    const texts = context.messages.filter((message) => message.role === 'user').map((message) => contentText(message.content));
    const input = [...texts].reverse().find((text) => text.includes('NONCE=')) ?? texts.at(-1) ?? '';
    const nonce = /NONCE=([a-zA-Z0-9_-]+)/.exec(input)?.[1] ?? 'no-nonce';
    const hold = Number(/HOLD_MS=(\d+)/.exec(input)?.[1] ?? 0);
    const observation = { name, generation, nonce, hold, call: faux.state.callCount, at: Date.now() };
    requests.push(observation);
    send({ kind: 'provider-request', ...observation });
    try { if (hold) await pause(hold, undefined, { signal: options?.signal }); }
    catch { return fauxAssistantMessage('', { stopReason: 'aborted' }); }
    return fauxAssistantMessage(`ACK ${name} NONCE=${nonce}`);
  };
  faux.setResponses(Array.from({ length: 256 }, () => response));
  const settingsManager = sdk.SettingsManager.create(cwd, agentDir);
  const loader = new sdk.DefaultResourceLoader({
    cwd, agentDir, settingsManager, additionalExtensionPaths: [entry],
    extensionFactories: [(pi) => pi.registerProvider(faux.provider)],
    noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
  });
  await loader.reload();
  if (loader.getExtensions().errors.length) throw new Error(JSON.stringify(loader.getExtensions().errors));
  ({ session } = await sdk.createAgentSession({ cwd, agentDir, settingsManager, resourceLoader: loader,
    sessionManager: sdk.SessionManager.create(cwd, path.join(root, name, 'sessions')) }));
  session.subscribe((event) => {
    if (event.type === 'agent_settled') send({ kind: 'settled', name, generation, aborted: event.aborted ?? false });
  });
  await session.bindExtensions({ mode: 'rpc', onError: (error) => { errors.push({ event: error.event, error: error.error }); send({ kind: 'extension-error', name, event: error.event, error: error.error }); } });
  await session.setModel(faux.getModel());
  await execute('coordinate', { action: 'join', goal: `Isolated messaging fixture ${name}` });
  await execute('coordinate', { action: 'lock', paths: [`${name}.txt`], reason: 'Crash-cleanup fixture' });
  const instance = listInstances(apiDir(process.env)).find((record) => record.pid === process.pid);
  if (!instance) throw new Error('Missing own API instance');
  return { name, pid: process.pid, generation, instanceId: instance.id, sessionId: session.sessionManager.getSessionId(), cwd,
    tools: session.getAllTools().map((tool) => tool.name), build: fs.statSync(entry).mtime.toISOString() };
}
async function execute(name, input) {
  const tool = session.getToolDefinition(name);
  if (!tool) throw new Error(`Missing tool ${name}`);
  const id = `fixture-${Date.now()}`;
  const signal = new AbortController().signal;
  return tool.execute(id, input, signal, undefined, session.extensionRunner.createToolContext(id, signal));
}
async function shutdown(reason = 'quit') {
  if (!session) return;
  await session.extensionRunner.emit({ type: 'session_shutdown', reason });
  session.dispose();
  session = undefined;
}
process.on('message', async ({ id, action, tool, input }) => {
  try {
    let result;
    if (action === 'tool') result = await execute(tool, input);
    else if (action === 'native-connect') { const backend = await PiBackend.connect(input, process.env); connections.set(input.instanceId, backend); result = { sessionId: backend.sessionId, cwd: backend.cwd }; }
    else if (action === 'native-prompt') { const backend = connections.get(input.instanceId); if (!backend) throw new Error('Missing native connection'); result = await backend.prompt(input.text, { key: input.key, timeoutMs: input.timeoutMs }); }
    else if (action === 'snapshot') result = { requests, errors, sessionId: session?.sessionManager.getSessionId(), messages: session?.state.messages.map((message) => ({ role: message.role, customType: message.customType, content: contentText(message.content), details: message.details })) };
    else if (action === 'replace') { await shutdown('new'); result = await boot(); }
    else if (action === 'quit') { await shutdown(); result = { stopped: true }; }
    else throw new Error('Unknown fixture action');
    send({ kind: 'response', id, result });
    if (action === 'quit') process.disconnect();
  } catch (error) { send({ kind: 'response', id, error: { message: error.message, execution: error.execution, code: error.code, data: error.data } }); }
});
process.on('disconnect', () => { void shutdown().finally(() => process.exit()); });
send({ kind: 'ready', ...(await boot()) });
