import { Permission } from '../../src/permission/ask.js';
import { Team } from '../../src/team/session.js';
import { INTERNAL_MESSAGE_TYPE } from '../../src/shared/messages.js';
import { fakeCtx, fakePi } from '../fake-pi.js';

/**
 * A Pi process of the team, for a test that sends it mail from another process: `child` (a subagent: id, parent and
 * secret come from the environment, and its permission module takes the secret out of it as in a real child) or `peer`
 * (another session that joins on its own). Prints `ready <id>`, then each team message it hands to Pi as one JSON line
 * `{"content":…}`, and `aborted` when an interrupt stops its run. Stdin commands: `busy` (its run is going again), `settle` (the
 * stopped run settles, which is when held mail is handed over).
 */
const [mode, cwd] = process.argv.slice(2) as ['child' | 'peer', string];
const fake = fakePi();
const team = new Team(fake.pi);
if (mode === 'child') new Permission({ pi: fake.pi, isSubagent: true });
// A headless subagent is handed mail only while its run is going.
let idle = mode === 'peer';
const ctx = fakeCtx({ cwd, hasUI: false });
ctx.isIdle = () => idle;
ctx.abort = () => process.stdout.write('aborted\n');
team.start(ctx);
const id = team.join().id;
process.stdout.write(`ready ${id}\n`);

let reported = 0;
setInterval(() => {
  const mail = fake.sent.filter((entry) => entry.message.customType === INTERNAL_MESSAGE_TYPE);
  for (const entry of mail.slice(reported)) process.stdout.write(`${JSON.stringify({ content: entry.message.content })}\n`);
  reported = mail.length;
}, 25);
let input = '';
process.stdin.setEncoding('utf8').on('data', (chunk: string) => {
  input += chunk;
  for (let at = input.indexOf('\n'); at >= 0; at = input.indexOf('\n')) {
    const command = input.slice(0, at);
    input = input.slice(at + 1);
    if (command === 'busy') idle = false;
    if (command === 'settle') {
      idle = true;
      team.onAgentSettled();
    }
  }
});
process.stdin.on('end', () => process.exit(0));
