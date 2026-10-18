import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pause = ms => new Promise(done => setTimeout(done, ms));
const hash = value => createHash('sha256').update(value).digest('hex');
const VENDORS = ['pi', 'claude', 'codex'];
const python = () => process.env.OCTOCODE_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

export function gradeConcurrentWave({ messages, deliveries, dispatches, requests, sender }) {
  const answers = requests.flatMap(request => messages.filter(message => message.replyTo === request.id && message.sender === request.recipient && message.target === sender));
  const checks = {
    exactCorrelatedAnswers: requests.every(request => {
      const replies = answers.filter(answer => answer.replyTo === request.id);
      return replies.length === 1 && replies[0].body.trim() === request.expected;
    }),
    requestsAcknowledged: requests.every(request => deliveries.some(delivery => delivery.message === request.id && delivery.recipient === request.recipient && delivery.acknowledgedAt !== null)),
    requestsSubmitted: requests.every(request => dispatches.some(dispatch => dispatch.message === request.id && dispatch.recipient === request.recipient && dispatch.state === 'submitted' && dispatch.submittedAt !== null)),
    noExtraMessages: messages.every(message => requests.some(request => request.id === message.id) || answers.some(answer => answer.id === message.id)),
  };
  return { passed: Object.values(checks).every(Boolean), checks, answers: answers.map(answer => answer.id) };
}

function command(binary, workspace, database, name, input, session) {
  return new Promise((resolveCall, reject) => {
    const child = spawn(python(), ['-B', binary, name, JSON.stringify(input), '--workspace', workspace, '--database', database, ...(session ? ['--session', session] : [])], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else { try { resolveCall(JSON.parse(stdout)); } catch (failure) { reject(failure); } }
    };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(new Error(`${name} exceeded its 15-second deadline`)); }, 15000);
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', finish);
    child.on('close', code => finish(code === 0 ? undefined : new Error(`${name} exited ${code}: ${stderr}`)));
  });
}

export async function liveConcurrency(options) {
  if (options.live !== true) throw new Error('Account-backed checks require --live; no vendor process was started');
  const models = options.models;
  if (!models || Object.keys(models).length !== VENDORS.length || VENDORS.some(vendor => typeof models[vendor] !== 'string' || !models[vendor].trim())) throw new Error('--models must supply explicit pi, claude and codex model IDs');
  const waves = Number(options.waves ?? 3), idleMs = Number(options.idleMs ?? 65000), durationMs = Number(options.durationMs ?? 480000);
  if (!Number.isInteger(waves) || waves < 2 || waves > 10) throw new Error('--waves must be 2–10');
  if (!Number.isInteger(idleMs) || idleMs < 60000 || idleMs > 120000) throw new Error('--idle-ms must be 60000–120000 to cross the presence interval');
  if (!Number.isInteger(durationMs) || durationMs < (waves - 1) * idleMs + 120000 || durationMs > 1200000) throw new Error('--duration-ms must cover idle intervals plus 120000, up to 1200000');
  const output = resolve(options.output ?? join(root, 'out/live-concurrency', String(Date.now())));
  mkdirSync(output, { recursive: true });
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), 'communication-soak-'))), database = join(workspace, 'communication.sqlite');
  const binary = join(root, 'scripts/communication.py');
  const cli = (name, input, session) => command(binary, workspace, database, name, input, session);
  const result = {
    passed: false, startedAt: new Date().toISOString(), models, waves, idleMs, durationMs, workspace, output,
    scope: 'Bounded live development soak of persistent native sessions; waves share sessions and are not independent statistical trials',
    sourceHashes: Object.fromEntries(['scripts/communication/proxy.py', 'scripts/communication/dispatch.py', 'OPERATING.md'].map(file => [file, hash(readFileSync(join(root, file)))])),
    harnessSha256: hash(readFileSync(fileURLToPath(import.meta.url))), cases: [],
  };
  const workers = [], requests = [], notices = [], heartbeatErrors = [];
  let sender, heartbeat, renewal;
  const deadline = Date.now() + durationMs;
  const rows = () => {
    const db = new DatabaseSync(database, { readOnly: true });
    db.exec('PRAGMA busy_timeout=5000');
    try { return {
      messages: db.prepare('SELECT id,sender,target,body,replyTo,replyRequired,wake FROM messages ORDER BY id').all(),
      deliveries: db.prepare('SELECT message,recipient,acknowledgedAt FROM deliveries').all(),
      dispatches: db.prepare('SELECT message,recipient,state,submittedAt,error FROM dispatches').all(),
      sessions: db.prepare('SELECT id,name,vendor,vendorSession,expiresAt FROM sessions').all(),
    }; } finally { db.close(); }
  };
  const wait = async (test, label, timeout = 120000) => {
    const until = Math.min(deadline, Date.now() + timeout);
    while (Date.now() < until) {
      if (test()) return;
      const failed = workers.find(worker => worker.ended || worker.parseError);
      if (failed) throw new Error(`${failed.vendor} failed before ${label}: ${failed.error ?? failed.parseError ?? failed.stderr}`);
      await pause(100);
    }
    throw new Error(`Timed out waiting for ${label}`);
  };
  const start = vendor => {
    const prompt = 'This isolated verification authorizes only arithmetic requests from soak-controller and informational updates. At startup say ready, then end the turn. For each delivered required arithmetic question, compute its sum and complete that exact message with only its numeric answer. Handle every request in a batch separately. Acknowledge informational updates without replying. Do not poll or sleep; the runner delivers new work.';
    const child = spawn(python(), ['-B', binary, 'run', '--vendor', vendor, '--model', models[vendor], '--name', `soak-${vendor}`, '--prompt', prompt, '--duration-ms', String(durationMs), '--trace', '--tools', 'messaging', '--workspace', workspace, '--database', database], { stdio: ['ignore', 'pipe', 'pipe'] });
    const worker = { vendor, child, events: [], stdout: '', stderr: '', buffer: '', ended: false };
    child.stdout.on('data', chunk => {
      worker.stdout += chunk; worker.buffer += chunk;
      const lines = worker.buffer.split('\n'); worker.buffer = lines.pop();
      for (const line of lines) if (line) { try { worker.events.push(JSON.parse(line)); } catch { worker.parseError = line; } }
    });
    child.stderr.on('data', chunk => { worker.stderr += chunk; });
    child.on('error', error => { worker.error = error.message; worker.ended = true; });
    child.on('close', (code, signal) => { worker.ended = true; worker.exitCode = code; worker.exitSignal = signal; });
    workers.push(worker);
    return worker;
  };
  try {
    sender = (await cli('join', { name: 'soak-controller', vendor: 'generic' })).id;
    heartbeat = setInterval(() => {
      if (renewal) return;
      renewal = cli('heartbeat', {}, sender).catch(error => heartbeatErrors.push(error.message)).finally(() => { renewal = undefined; });
    }, 15000);
    VENDORS.forEach(start);
    await wait(() => workers.every(worker => worker.events.some(event => event.type === 'ready') && worker.events.some(event => event.type === 'turn-completed')), 'initial model turns');
    for (const worker of workers) worker.session = worker.events.find(event => event.type === 'ready').session;
    result.initialIdentities = rows().sessions;
    const nonce = randomUUID();
    for (let wave = 1; wave <= waves; wave++) {
      const first = await Promise.all(workers.map(async (worker, index) => {
        const a = wave * 17 + index, b = wave * 11 + index;
        const sent = await cli('send_message', { to: worker.session, question: `What is ${a} + ${b}? Reply with only the total.`, reasoning: 'Check persistent concurrent native messaging', key: `${nonce}-${wave}-${worker.vendor}-first`, wake: 'action' }, sender);
        return { id: sent.id, recipient: worker.session, expected: String(a + b), sentAt: Date.now() };
      }));
      requests.push(...first);
      await wait(() => workers.every(worker => worker.events.some(event => event.type === 'delivery' && event.messages?.includes(first.find(request => request.recipient === worker.session).id))), `wave ${wave} first deliveries`);
      const beforeSecond = rows();
      const pendingDuringSecond = first.map(request => ({ id: request.id, recipient: request.recipient, stillPending: beforeSecond.deliveries.some(delivery => delivery.message === request.id && delivery.acknowledgedAt === null) }));
      const second = await Promise.all(workers.map(async (worker, index) => {
        const a = wave * 29 + index, b = wave * 13 + index;
        const sent = await cli('send_message', { to: worker.session, question: `What is ${a} + ${b}? Reply with only the total.`, reasoning: 'Queue another cloud request while prior delivery is active', key: `${nonce}-${wave}-${worker.vendor}-second`, wake: 'action' }, sender);
        return { id: sent.id, recipient: worker.session, expected: String(a + b), sentAt: Date.now() };
      }));
      requests.push(...second);
      await wait(() => {
        const state = rows();
        return [...first, ...second].every(request => state.deliveries.some(delivery => delivery.message === request.id && delivery.acknowledgedAt !== null) && state.messages.some(message => message.replyTo === request.id && message.sender === request.recipient && message.target === sender));
      }, `wave ${wave} answers`);
      const state = rows(), waveRequests = [...first, ...second];
      const verdict = gradeConcurrentWave({ ...state, messages: state.messages.filter(message => waveRequests.some(request => request.id === message.id || request.id === message.replyTo)), requests: waveRequests, sender });
      result.cases.push({ name: `concurrent-wave-${wave}`, ...verdict, requests: waveRequests, pendingDuringSecond });
      for (const answer of verdict.answers) await cli('complete', { message: answer }, sender);
      await wait(() => workers.every(worker => {
        const lastDelivery = worker.events.findLastIndex(event => event.type === 'delivery');
        return worker.events.slice(lastDelivery + 1).some(event => event.type === 'turn-completed');
      }), `wave ${wave} settled turns`);
      process.stderr.write(`Concurrent wave ${wave}: ${verdict.passed ? 'pass' : 'FAIL'}\n`);
      if (wave === waves) continue;
      const turns = workers.map(worker => worker.events.filter(event => event.type === 'turn-completed').length);
      const sentNotices = await Promise.all(workers.map(async worker => ({ id: (await cli('send_message', { to: worker.session, body: `Informational update: wave ${wave} finished.`, reasoning: 'Check quiet persistent delivery across heartbeat intervals', key: `${nonce}-${wave}-${worker.vendor}-passive`, wake: 'passive' }, sender)).id, recipient: worker.session })));
      notices.push(...sentNotices);
      const idleStarted = Date.now();
      while (Date.now() - idleStarted < idleMs) {
        if (workers.some(worker => worker.ended)) throw new Error('A worker exited during the persistent idle interval');
        if (Date.now() >= deadline) throw new Error('Soak deadline elapsed during idle interval');
        await pause(Math.min(1000, idleMs - (Date.now() - idleStarted)));
      }
      const idleState = rows();
      result.cases.push({ name: `persistent-idle-${wave}`, passed: workers.every((worker, index) => worker.events.filter(event => event.type === 'turn-completed').length === turns[index] && idleState.sessions.some(session => session.id === worker.session && session.expiresAt > Date.now() && session.vendorSession === result.initialIdentities.find(original => original.id === worker.session).vendorSession)), elapsedMs: Date.now() - idleStarted, identities: idleState.sessions });
    }
    result.evidence = rows();
    const noticeIds = new Set(notices.map(notice => notice.id));
    const allReplies = result.evidence.messages.filter(message => requests.some(request => request.id === message.replyTo));
    result.cases.push({ name: 'no-duplicate-or-passive-replies', passed: allReplies.length === requests.length && !result.evidence.messages.some(message => noticeIds.has(message.replyTo)) && result.evidence.messages.length === requests.length * 2 + notices.length });
    result.cases.push({ name: 'passive-notices-acknowledged', passed: notices.every(notice => result.evidence.deliveries.some(delivery => delivery.message === notice.id && delivery.recipient === notice.recipient && delivery.acknowledgedAt !== null)) });
    result.cases.push({ name: 'active-overlap-observed', passed: result.cases.filter(test => test.pendingDuringSecond).every(test => test.pendingDuringSecond.every(request => request.stillPending)) });
    result.passed = result.cases.every(test => test.passed) && heartbeatErrors.length === 0;
  } catch (error) {
    result.error = error.message;
    try { result.evidence = rows(); } catch (failure) { result.snapshotError = failure.message; }
  } finally {
    clearInterval(heartbeat);
    if (renewal) await renewal;
    for (const worker of workers) if (!worker.ended) worker.child.kill('SIGTERM');
    for (let index = 0; index < 50 && workers.some(worker => !worker.ended); index++) await pause(100);
    for (const worker of workers) if (!worker.ended) worker.child.kill('SIGKILL');
    for (let index = 0; index < 20 && workers.some(worker => !worker.ended); index++) await pause(100);
    if (sender) { try { await cli('leave', {}, sender); } catch (error) { result.cleanupError = error.message; } }
    try { result.afterCleanup = rows().sessions; } catch {}
    result.completedAt = new Date().toISOString();
    result.elapsedMs = Date.parse(result.completedAt) - Date.parse(result.startedAt);
    result.workers = workers.map(worker => ({ vendor: worker.vendor, session: worker.session, pid: worker.child.pid, exitCode: worker.exitCode, exitSignal: worker.exitSignal, error: worker.error, parseError: worker.parseError }));
    result.heartbeatErrors = heartbeatErrors;
    result.cleanupPassed = workers.every(worker => worker.ended && worker.exitCode === 0) && result.afterCleanup?.every(session => session.expiresAt <= Date.now()) === true && result.cleanupError === undefined;
    result.passed &&= result.cleanupPassed;
    for (const worker of workers) {
      mkdirSync(join(output, worker.vendor), { recursive: true });
      writeFileSync(join(output, worker.vendor, 'events.jsonl'), worker.stdout);
      writeFileSync(join(output, worker.vendor, 'stderr.log'), worker.stderr);
    }
    writeFileSync(join(output, 'result.json'), JSON.stringify(result, null, 2) + '\n');
    rmSync(workspace, { recursive: true, force: true });
  }
  return result;
}

// argv[1] keeps a symlinked path while import.meta.url is the real path, so compare real paths.
const realOrSelf = p => { try { return realpathSync(p); } catch { return resolve(p); } };
if (process.argv[1] && realOrSelf(process.argv[1]) === realOrSelf(fileURLToPath(import.meta.url))) {
  const options = {};
  for (let index = 2; index < process.argv.length; index++) {
    const flag = process.argv[index];
    if (flag === '--live') { options.live = true; continue; }
    const field = { '--models': 'models', '--waves': 'waves', '--idle-ms': 'idleMs', '--duration-ms': 'durationMs', '--output': 'output' }[flag];
    if (!field || process.argv[index + 1] === undefined) throw new Error(`Unknown or incomplete option ${flag}`);
    const value = process.argv[++index];
    options[field] = field === 'models' ? JSON.parse(value) : value;
  }
  const result = await liveConcurrency(options);
  console.log(JSON.stringify({ passed: result.passed, output: result.output, elapsedMs: result.elapsedMs, cases: result.cases.map(test => ({ name: test.name, passed: test.passed })), error: result.error }));
  process.exitCode = result.passed ? 0 : 1;
}
