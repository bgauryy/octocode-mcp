import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import { processStartTime } from '../dist/shared/process.js';

const [journal, command, ...args] = process.argv.slice(2);
if (!journal || !command) throw new Error('Usage: acp-reliability-proxy.mjs <journal> <executable> [args...]');
const record = (data) => appendFileSync(journal, `${JSON.stringify({ time: Date.now(), ...data })}\n`, { mode: 0o600 });
const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
record({ event: 'spawn', proxyPid: process.pid, proxyStarted: processStartTime(process.pid), childPid: child.pid, command, args });
function observe(readable, direction) {
  const decoder = new StringDecoder('utf8');
  let buffered = '';
  readable.on('data', (bytes) => {
    buffered += decoder.write(bytes);
    let newline;
    while ((newline = buffered.indexOf('\n')) !== -1) {
      const line = buffered.slice(0, newline);
      buffered = buffered.slice(newline + 1);
      try {
        const message = JSON.parse(line);
        record({ event: 'wire', direction, id: message.id, method: message.method,
          sessionId: message.params?.sessionId ?? message.result?.sessionId,
          updateKind: message.params?.update?.sessionUpdate, errorCode: message.error?.code,
          hasResult: Object.hasOwn(message, 'result') });
      } catch { record({ event: 'non-json-wire', direction, bytes: Buffer.byteLength(line) }); }
    }
  });
}
observe(process.stdin, 'outbound');
observe(child.stdout, 'inbound');
process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);
child.once('error', (error) => { record({ event: 'spawn-error', message: error.message }); process.exitCode = 1; process.stdin.destroy(); });
child.stdin.on('error', () => undefined);
process.on('SIGTERM', () => { child.kill('SIGTERM'); });
child.once('close', (code, signal) => {
  record({ event: 'close', code, signal });
  process.stdin.destroy();
  process.stdout.end(() => process.exit(code ?? 1));
});
