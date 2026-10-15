import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { Readable, Writable } from 'node:stream';
import { agent, methods, ndJsonStream, PROTOCOL_VERSION, RequestError } from '@agentclientprotocol/sdk';

const [mode, journal] = process.argv.slice(2);
const record = (value) => appendFileSync(journal, `${JSON.stringify(value)}\n`);
const pending = () => new Promise(() => undefined);
record({ event: 'start', pid: process.pid, cwd: process.cwd(), args: process.argv.slice(2) });
if (mode === 'descendant') {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  record({ event: 'descendant', pid: child.pid });
}
const held = setInterval(() => undefined, 1000);
let sessionId = 'fixture-session';
const app = agent({ name: 'external-acp-fixture' })
  .onRequest(methods.agent.initialize, async ({ params }) => {
    record({ event: 'initialize', params });
    if (mode === 'hang-initialize') await pending();
    if (mode === 'crash-initialize') process.exit(9);
    return { protocolVersion: mode === 'wrong-version' ? PROTOCOL_VERSION + 1 : PROTOCOL_VERSION, agentCapabilities: { loadSession: mode !== 'no-load' } };
  })
  .onRequest(methods.agent.session.new, async ({ params }) => {
    record({ event: 'new', params });
    if (mode === 'hang-new') await pending();
    return { sessionId: mode === 'empty-id' ? '' : sessionId };
  })
  .onRequest(methods.agent.session.load, async ({ params }) => {
    record({ event: 'load', params });
    if (mode === 'hang-load') await pending();
    if (mode === 'missing-session') throw RequestError.resourceNotFound('No saved conversation exists.');
    sessionId = params.sessionId;
    return {};
  })
  .onRequest(methods.agent.session.prompt, async ({ params, client }) => {
    const text = params.prompt[0]?.text;
    record({ event: 'prompt', text });
    const chunk = async (text, id = sessionId, kind = 'agent_message_chunk') => client.notify(methods.client.session.update, {
      sessionId: id, update: { sessionUpdate: kind, content: { type: 'text', text } },
    });
    await chunk('wrong-session-output', 'unrelated-session');
    await chunk('private-thought', sessionId, 'agent_thought_chunk');
    await chunk('first\n');
    if (mode === 'wait' || mode === 'descendant') await pending();
    if (mode === 'crash-prompt') {
      process.stderr.write('fixture diagnostic\n');
      process.exit(8);
    }
    if (mode === 'fail-prompt') throw new Error('fixture prompt failure');
    if (mode === 'permission' || mode === 'wrong-permission') {
      const response = await client.request(methods.client.session.requestPermission, {
        sessionId: mode === 'wrong-permission' ? 'unrelated-session' : sessionId,
        toolCall: { toolCallId: 'call-1', title: 'Edit a file', kind: 'edit', rawInput: { path: '/tmp/example' } },
        options: [{ optionId: 'allow', name: 'Allow', kind: 'allow_once' }, { optionId: 'deny', name: 'Deny', kind: 'reject_once' }],
      });
      record({ event: 'permission', response });
      await chunk(JSON.stringify(response.outcome));
    } else if (mode === 'require-fs') {
      await client.request(methods.client.fs.readTextFile, { sessionId, path: '/tmp/example' });
    } else {
      await client.notify(methods.client.session.update, {
        sessionId, update: { sessionUpdate: 'tool_call', toolCallId: 'call-1', title: 'Read', kind: 'read', rawOutput: { evidence: 'evidence\n'.repeat(25_000) } },
      });
      await client.notify(methods.client.session.update, {
        sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'image', mimeType: 'image/png', data: 'aGVsbG8=' } },
      });
      await chunk(text);
    }
    return { stopReason: 'end_turn', _meta: { fixture: true } };
  })
  .onNotification(methods.agent.session.cancel, () => { record({ event: 'cancel' }); });

const connection = app.connect(ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
await connection.closed;
clearInterval(held);
