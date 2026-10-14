import { processStartTime } from '../../src/shared/process.js';
import type { Member } from '../../src/team/model.js';
import { TeamStore } from '../../src/team/store.js';

/**
 * A process that joins the team under the first of the names n0, n1, … nobody holds yet, prints `joined <name>`, and
 * stays running until its stdin ends (a holder that exits would hand its name to the next joiner).
 */
const [cwd, db] = process.argv.slice(2) as [string, string];
const store = TeamStore.open(cwd, db);
for (let at = 0; ; at += 1) {
  const member: Member = {
    id: `n${at}`, role: 'worker', pid: process.pid, status: 'idle', joinedAt: Date.now(), updatedAt: Date.now(),
    toolCalls: 0, input: 0, cacheRead: 0, output: 0, cost: 0, unpriced: false,
    ...(processStartTime(process.pid) ? { started: processStartTime(process.pid)! } : {}),
  };
  if (store.join(member)) {
    process.stdout.write(`joined ${member.id}\n`);
    break;
  }
}
process.stdin.resume();
process.stdin.on('end', () => process.exit(0));
