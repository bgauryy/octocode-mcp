import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable, Writable } from 'node:stream';
import { agent, methods, ndJsonStream, PROTOCOL_VERSION } from '@agentclientprotocol/sdk';

const store = process.argv[2];
if (!store) throw new Error('Fixture requires an isolated session store directory');
fs.mkdirSync(store, { recursive: true });
let state;
let sessionId;
const persist = () => {
  const file = path.join(store, `${sessionId}.json`);
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(state));
  fs.renameSync(`${file}.tmp`, file);
};
const app = agent({ name: 'ACP reliability fixture' })
  .onRequest(methods.agent.initialize, () => ({ protocolVersion: PROTOCOL_VERSION, agentCapabilities: { loadSession: true } }))
  .onRequest(methods.agent.session.new, () => { sessionId = randomUUID(); state = {}; persist(); return { sessionId }; })
  .onRequest(methods.agent.session.load, ({ params }) => {
    if (!/^[a-f0-9-]{36}$/.test(params.sessionId)) throw new Error('Unknown saved session');
    state = JSON.parse(fs.readFileSync(path.join(store, `${params.sessionId}.json`), 'utf8'));
    sessionId = params.sessionId;
    return {};
  })
  .onRequest(methods.agent.session.prompt, async ({ params, client }) => {
    const text = params.prompt[0]?.text ?? '';
    const emit = (text) => client.notify(methods.client.session.update, { sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } } });
    let reply;
    if (text.includes('Remember marker ')) { state.marker = /Remember marker (\w+)/.exec(text)?.[1]; reply = state.marker; }
    else if (text.includes('Remember counter ')) { state.counter = Number(/Remember counter (\d+)/.exec(text)?.[1]); reply = 'COUNTER_READY'; }
    else if (text.includes('increment the remembered counter')) { state.counter += 7; reply = `${state.marker}:${state.counter}`; }
    else if (text.includes('remembered marker and current counter')) reply = `${state.marker}:${state.counter}`;
    else if (text.includes('remembered marker')) reply = state.marker;
    else if (text.includes('CRASH_BOUNDARY')) {
      await emit('PARTIAL_CRASH_EVIDENCE');
      await new Promise(() => undefined);
    } else reply = /Reply only (\w+)/.exec(text)?.[1] ?? 'FIXTURE_REPLY';
    persist();
    await new Promise((resolve) => setTimeout(resolve, 150));
    await emit(reply ?? 'MISSING_MEMORY');
    return { stopReason: 'end_turn', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
  });
const connection = app.connect(ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
await connection.closed;
