// Scripted stand-in for `pi --mode json`: prints the events the agent tool reads, chosen by the task (last argument).
const fs = require('node:fs');

const task = process.argv.at(-1) ?? '';
const emit = (event) => process.stdout.write(`${JSON.stringify(event)}\n`);
const usage = { input: 100, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 120, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.01 } };
const say = (text, extra = {}) => ({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text }], usage, stopReason: 'stop', ...extra } });
// A 1x1 PNG, as a browser tool would return.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

if (task.includes('linger')) {
  emit(say(`LINGER mode=${process.env.OCTOCODE_PERMISSION} grants=${process.env.OCTOCODE_PERMISSION_GRANTS ?? ''} ${process.argv.slice(2).join(' ')}`));
} else if (task.startsWith('oversized')) {
  process.stdout.write('x'.repeat(17 * 1024 * 1024));
} else if (task.startsWith('fail')) {
  process.stderr.write('boom\n');
  process.exit(3);
} else if (task.startsWith('narrate then crash')) {
  emit(say('Let me look at src/a.ts', { stopReason: 'toolUse' }));
  process.stderr.write('segfault\n');
  process.exit(3);
} else if (task.startsWith('hostile fail')) {
  process.stderr.write('\u001b]0;pwned\u0007boom\u001b[31m red\u202e\n');
  process.exit(3);
} else if (task.startsWith('hostile')) {
  emit(say('\u001b]8;;https://evil.example\u0007click\u001b]8;;\u0007 \u001b[2Jdone\u202e', { stopReason: 'error', errorMessage: 'bad\u001b]0;title\u0007 provider' }));
} else if (task.startsWith('orphan holder')) {
  // Answers, then exits while a grandchild that left the process group keeps the stdio pipes open.
  require('node:child_process').spawn(process.execPath, ['-e', 'setTimeout(() => undefined, 8000)'], { detached: true, stdio: ['ignore', 'inherit', 'inherit'] }).unref();
  emit(say('ORPHAN REPORT'));
} else if (task.startsWith('detached helper')) {
  // Like a Chrome the child launched: a detached process in a group of its own, which the child never closes.
  const helper = require('node:child_process').spawn(process.execPath, ['-e', 'setInterval(() => undefined, 1000)'], { detached: true, stdio: 'ignore' });
  helper.unref();
  emit({ type: 'tool_execution_start', toolName: 'bash', args: { command: `helper ${helper.pid}` } });
  process.on('SIGTERM', () => process.exit(143));
  setTimeout(() => undefined, 60_000);
} else if (task.startsWith('hang')) {
  // A stalled model stream: no events at all.
  process.on('SIGTERM', () => process.exit(143));
  setTimeout(() => undefined, 60_000);
} else if (task.startsWith('answer then stalled shutdown')) {
  emit(say('COMPLETED REPORT'));
  process.on('SIGTERM', () => {
    emit({ type: 'agent_settled', aborted: true });
    process.exit(143);
  });
  setTimeout(() => undefined, 60_000);
} else if (task.startsWith('slow')) {
  emit({ type: 'tool_execution_start', toolName: 'bash', args: { command: 'sleep 60' } });
  process.on('SIGTERM', () => process.exit(143));
  setTimeout(() => undefined, 60_000);
} else if (task.startsWith('error')) {
  emit(say('partial findings', { stopReason: 'error', errorMessage: 'provider down' }));
} else if (task.startsWith('length')) {
  emit(say('unfinished findings', { stopReason: 'length' }));
} else if (task.startsWith('silent')) {
  emit({ type: 'message_end', message: { role: 'assistant', content: [], usage, stopReason: 'stop' } });
} else if (task.startsWith('long')) {
  emit(say(`summary first\n${'detail line\n'.repeat(1500)}the end`));
} else if (task.startsWith('late failure')) {
  emit(say('FULL REPORT'));
  emit({ type: 'message_end', message: { role: 'custom', content: 'Background bash job finished' } });
  emit(say('', { stopReason: 'error', errorMessage: 'overloaded' }));
} else if (task.startsWith('steered draft')) {
  emit(say('half a report', { stopReason: 'error', errorMessage: 'overloaded' }));
  emit({ type: 'message_end', message: { role: 'custom', content: 'steer: also check X' } });
  emit(say('FINAL REPORT'));
} else if (task.startsWith('late notice')) {
  emit({ type: 'message_end', message: { role: 'user', content: 'review' } });
  emit(say('checking', { stopReason: 'toolUse' }));
  emit(say('FULL REPORT draft', { stopReason: 'error', errorMessage: 'overloaded' }));
  emit(say('FULL REPORT'));
  emit({ type: 'message_end', message: { role: 'custom', content: 'Background bash job finished' } });
  emit(say('That job was my coverage rerun; findings unchanged.'));
} else if (task.startsWith('grants')) {
  emit(say(`mode=${process.env.OCTOCODE_PERMISSION ?? ''} grants=${process.env.OCTOCODE_PERMISSION_GRANTS ?? ''}`));
} else if (task.startsWith('denied')) {
  // Two calls refused for lack of approval (a blocked call's error text) and one ordinary failure.
  const denied = (text) => ({ type: 'tool_execution_end', toolName: 'bash', isError: true, result: { content: [{ type: 'text', text }] } });
  emit({ type: 'tool_execution_start', toolName: 'bash', args: { command: 'npm test' } });
  emit(denied(process.env.OCTOCODE_FAKE_DENIAL));
  emit({ type: 'tool_execution_start', toolName: 'file', args: {} });
  emit(denied(process.env.OCTOCODE_FAKE_DENIAL));
  emit({ type: 'tool_execution_start', toolName: 'bash', args: { command: 'false' } });
  emit(denied('Command exited with code 1'));
  emit(say('blocked: need approval for npm test and the edit'));
} else if (task.startsWith('unpriced')) {
  // A model without pricing (a free local one): tokens spent, no cost. Most of the prompt came from cache.
  emit(say('free answer', { provider: 'local', model: 'llama', usage: { ...usage, cacheRead: 300, totalTokens: 420, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } }));
} else if (task.startsWith('edit')) {
  fs.writeFileSync('child.txt', 'from the child\n');
  emit(say('edited child.txt'));
} else {
  emit({ type: 'tool_execution_start', toolName: 'bash', args: { command: 'ls -la' } });
  emit({ type: 'tool_execution_end', toolName: 'browser', result: { content: [{ type: 'image', data: PNG, mimeType: 'image/png' }] } });
  process.stdout.write('not json\n');
  emit({ type: 'message_end', message: { role: 'user', content: [] } });
  const env = process.env;
  const facts = { id: env.OCTOCODE_AGENT_ID, role: env.OCTOCODE_AGENT_ROLE, goal: env.OCTOCODE_AGENT_GOAL, parent: env.OCTOCODE_PARENT_ID, subagent: env.OCTOCODE_SUBAGENT, collaborate: env.OCTOCODE_AGENT_COLLABORATE, scratch: env.OCTOCODE_AGENT_SCRATCH, workspace: env.OCTOCODE_TEAM_WORKSPACE, trustRoot: env.OCTOCODE_TRUST_ROOT, cwd: process.cwd(), args: process.argv.slice(2, -1), task };
  // The last event has no trailing newline: the parent must still read it at exit.
  process.stdout.write(JSON.stringify(say(`report ${JSON.stringify(facts)}`)));
}
