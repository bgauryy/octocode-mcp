// Stands in for the PowerShell helper (src/shared/winhelper-script.ts): same protocol, behavior chosen by FAKE_MODE.
//   ok        answers assign, kill and parse   noready  exits at once   hang  never says ready
//   crash     exits on the first assign        silent   never answers   junk  prints stray lines between answers
//   refuse    refuses every kill               (any mode) a parse of the script `die` exits
// FAKE_LOG receives each request line, then `stdin-closed` when stdin ends (the helper exits then, as the real one does).
import fs from 'node:fs';
import readline from 'node:readline';

const mode = process.env.FAKE_MODE ?? 'ok';
const log = (text) => process.env.FAKE_LOG && fs.appendFileSync(process.env.FAKE_LOG, `${text}\n`);
const send = (value) => process.stdout.write(`${JSON.stringify(value)}\n`);

if (mode === 'noready') process.exit(1);
if (mode === 'hang') setInterval(() => undefined, 1000);
else {
  if (mode === 'junk') process.stdout.write('WARNING: noise\n');
  send({ ready: true });
  const jobs = new Set();
  const lines = readline.createInterface({ input: process.stdin });
  lines.on('line', (line) => {
    log(line);
    if (mode === 'silent') return;
    if (mode === 'junk') process.stdout.write('not json\n[1,2]\n');
    const request = JSON.parse(line);
    if (request.cmd === 'assign') {
      if (mode === 'crash') process.exit(1);
      jobs.add(request.pid);
      send({ id: request.id, ok: true });
    } else if (request.cmd === 'kill') {
      send(mode !== 'refuse' && jobs.delete(request.pid) ? { id: request.id, ok: true } : { id: request.id, ok: false, error: 'no job for that pid' });
    } else if (request.cmd === 'parse') {
      if (request.command === 'die') process.exit(1);
      // The script is the JSON of the commands to answer with; anything else is a parse error.
      try {
        send({ id: request.id, ok: true, commands: JSON.parse(request.command) });
      } catch {
        send({ id: request.id, ok: false, error: 'parse error' });
      }
    } else send({ id: request.id, ok: false, error: 'unknown command' });
  });
  lines.on('close', () => {
    log('stdin-closed');
    process.exit(0);
  });
}
