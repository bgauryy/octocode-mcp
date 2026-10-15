import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(fixtureDir, '../..');
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

export async function runNativeReliability(output = process.env.PI_NATIVE_RELIABILITY_RECEIPT) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-native-reliability-'));
  fs.chmodSync(root, 0o700);
  const cwd = path.join(root, 'repo');
  fs.mkdirSync(path.join(cwd, '.git'), { recursive: true });
  const bundle = path.join(root, 'extension.mjs');
  const source = (file) => path.join(packageRoot, 'src', file);
  await build({
    stdin: { contents: `export { default } from ${JSON.stringify(source('index.ts'))};
      export { ApiClient } from ${JSON.stringify(source('api/client.ts'))};
      export { PiBackend } from ${JSON.stringify(source('external/pi.ts'))};
      export { apiDir, listInstances } from ${JSON.stringify(source('api/registry.ts'))};
      export { TeamStore } from ${JSON.stringify(source('team/store.ts'))};
      export { agentDbPath } from ${JSON.stringify(source('shared/home.ts'))};`, resolveDir: packageRoot },
    bundle: true, format: 'esm', platform: 'node', packages: 'external', outfile: bundle,
    define: { 'import.meta.url': JSON.stringify(pathToFileURL(path.join(packageRoot, 'dist/pi/native-reliability.js')).href) },
  });
  // External packages resolve from the repository, while all host state stays in the private runtime.
  fs.symlinkSync(path.join(packageRoot, '../../node_modules'), path.join(root, 'node_modules'), 'dir');
  const { ApiClient, PiBackend, apiDir, listInstances, TeamStore, agentDbPath } = await import(pathToFileURL(bundle).href);
  const env = { OCTOCODE_HOME: path.join(root, 'octocode') };
  const children = [];
  let sequence = 0;
  const report = {
    evidenceClass: 'Deterministic protocol stress and bounded real-process recovery; no production reliability estimate',
    model: 'Official pi-ai fauxProvider: simulated model output; real Pi AgentSession, extension, API and subprocesses',
    node: process.version, platform: process.platform,
    sdkVersion: JSON.parse(fs.readFileSync(path.join(packageRoot, '../../node_modules/@earendil-works/pi-coding-agent/package.json'), 'utf8')).version,
    piAiVersion: JSON.parse(fs.readFileSync(path.join(packageRoot, '../../node_modules/@earendil-works/pi-ai/package.json'), 'utf8')).version,
    sourceHashes: Object.fromEntries(['external/pi.ts', 'api/client.ts', 'api/bridge.ts', 'api/registry.ts', 'external/manager.ts', 'team/store.ts'].map((file) => [file, hash(source(file))])),
    fixtureHashes: Object.fromEntries(['native-reliability-worker.mjs', 'native-reliability-runner.mjs'].map((file) => [file, hash(path.join(fixtureDir, file))])),
    bundleSha256: hash(bundle), cases: [], processes: [], errors: [], maxConcurrentProcesses: 0, startedAt: new Date().toISOString(),
  };
  const deadline = setTimeout(() => children.forEach((peer) => peer.child.kill('SIGKILL')), 115_000);
  async function waitFor(check, label, timeout = 10_000) {
    const end = Date.now() + timeout;
    while (Date.now() < end) { if (await check()) return; await pause(20); }
    throw new Error(`Timed out: ${label}`);
  }
  function start(name) {
    const child = fork(path.join(fixtureDir, 'native-reliability-worker.mjs'), [JSON.stringify({ name, root, cwd, bundle: pathToFileURL(bundle).href })], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'], execArgv: [], env: { PATH: process.env.PATH },
    });
    const events = [];
    const pending = new Map();
    let output = '';
    for (const pipe of [child.stdout, child.stderr]) pipe.on('data', (chunk) => { output += chunk; });
    let resolveReady, rejectReady;
    const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
    ready.catch(() => {});
    const exited = new Promise((resolve) => child.on('exit', (code, signal) => {
      rejectReady(new Error(`${name} exited before ready: ${output}`));
      for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(Object.assign(new Error(`${name} exited during request`), { execution: 'uncertain', boundary: 'controller-death' })); }
      pending.clear();
      report.processes.push({ name, pid: child.pid, code, signal, output, events });
      resolve({ code, signal });
    }));
    child.on('message', (message) => {
      events.push(message);
      if (message.kind === 'ready') resolveReady(message);
      if (message.kind !== 'response') return;
      const entry = pending.get(message.id);
      if (!entry) return;
      pending.delete(message.id); clearTimeout(entry.timer);
      if (message.error) entry.reject(Object.assign(new Error(message.error.message), message.error));
      else entry.resolve(message.result);
    });
    const peer = { name, child, ready, exited, events, command(action, input = {}) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${name} ${action} exceeded deadline`)); }, 20_000);
        pending.set(id, { resolve, reject, timer });
        child.send({ id, action, ...input }, (error) => { if (error) { pending.delete(id); clearTimeout(timer); reject(error); } });
      });
    } };
    children.push(peer);
    report.maxConcurrentProcesses = Math.max(report.maxConcurrentProcesses,
      children.filter((entry) => entry.child.exitCode === null && entry.child.signalCode === null).length);
    return peer;
  }
  const tool = (peer, input) => peer.command('tool', { tool: 'externalAgent', input });
  const record = (id) => {
    const found = listInstances(apiDir(env)).find((entry) => entry.id === id);
    assert(found, `Exact instance missing: ${id}`); return found;
  };
  const inspect = (id) => new ApiClient(record(id));
  const caught = (promise) => promise.then((value) => ({ ok: true, value }), (error) => ({ ok: false, error: { message: error.message, execution: error.execution, code: error.code, data: error.data } }));
  const nonceCount = (peer, nonce) => peer.events.filter((event) => event.kind === 'provider-request' && event.nonce === nonce).length;
  const idle = async (id) => { await waitFor(async () => (await inspect(id).call('status')).state === 'idle', 'peer idle'); };
  const leaseState = () => {
    const store = TeamStore.open(cwd, agentDbPath(env), env);
    try { store.sweep(); return { agents: store.names(), leases: store.leases().map(({ owner, path: held }) => ({ owner, path: held })) }; }
    finally { store.close(); }
  };
  const crash = async (peer) => { peer.child.kill('SIGKILL'); assert.equal((await peer.exited).signal, 'SIGKILL'); };
  const passed = (name, details) => { report.cases.push({ name, passed: true, ...details }); };
  try {
    let a = start('controller-0'), b = start('peer-0');
    let [ra, rb] = await Promise.all([a.ready, b.ready]);
    assert.equal(listInstances(apiDir(env)).length, 2);
    assert.equal(leaseState().leases.length, 2);
    const connection = await tool(a, { action: 'connect', transport: 'pi', instanceId: rb.instanceId, cwd });
    assert(!connection.details.error, JSON.stringify(connection));
    const calls = await Promise.all(Array.from({ length: 24 }, (_, i) => caught(tool(a, { action: 'prompt', id: connection.details.id, text: `NONCE=burst_${i} HOLD_MS=400`, timeoutMs: 5_000 }))));
    const answers = calls.filter((call) => call.ok && !call.value.details.error);
    const refused = calls.filter((call) => call.ok && call.value.details.error);
    assert.equal(answers.length, 1, JSON.stringify(calls));
    assert.equal(refused.length, 23, JSON.stringify(calls));
    assert(refused.every((call) => JSON.stringify(call.value).includes('in flight')));
    assert.equal(b.events.filter((event) => event.kind === 'provider-request').length, 1);
    assert.match(answers[0].value.details.reply.text, /NONCE=burst_\d+/);
    passed('24 concurrent callers on one execution connection', { submitted: 24, correlatedAnswers: 1, explicitRefusals: 23, providerExecutions: 1 });

    const independent = [];
    for (let i = 0; i < 24; i++) independent.push(await PiBackend.connect({ instanceId: rb.instanceId, cwd }, env));
    const pressure = await Promise.all(independent.map((backend, i) => caught(backend.prompt(`NONCE=independent_${i} HOLD_MS=400`, { key: `independent-${i}`, timeoutMs: 5000 }))));
    const accepted = pressure.filter((attempt) => attempt.ok);
    const rejected = pressure.filter((attempt) => !attempt.ok);
    assert.equal(accepted.length, 1, JSON.stringify(pressure));
    assert.equal(rejected.length, 23);
    assert(rejected.every((attempt) => ['not-sent', 'unknown'].includes(attempt.error.execution)), JSON.stringify(rejected));
    const busyReplies = rejected.filter((attempt) => attempt.error.code === -32000 && attempt.error.message.includes('busy'));
    assert(busyReplies.every((attempt) => attempt.error.execution === 'not-sent' && attempt.error.data?.execution === 'not-sent'), JSON.stringify(busyReplies));
    assert.equal(b.events.filter((event) => event.kind === 'provider-request' && event.nonce.startsWith('independent_')).length, 1);
    await Promise.all(independent.map((backend) => backend.close()));
    passed('24 independent native connections compete through real sockets', { submitted: 24, correlatedAnswers: 1,
      explicitNotSent: rejected.filter((attempt) => attempt.error.execution === 'not-sent').length,
      explicitUnknown: rejected.filter((attempt) => attempt.error.execution === 'unknown').length,
      atomicBusyReplies: busyReplies.length,
      socketOrProtocolFailures: rejected.filter((attempt) => attempt.error.message === 'Invalid API response identity').length,
      outcomes: pressure, providerExecutions: 1 });

    await a.command('native-connect', { input: { instanceId: rb.instanceId, cwd } });
    const keyedInput = { instanceId: rb.instanceId, key: 'repeated-key', text: 'NONCE=repeated_key HOLD_MS=2400', timeoutMs: 1000 };
    const attempts = [await caught(a.command('native-prompt', { input: keyedInput })), await caught(a.command('native-prompt', { input: keyedInput }))];
    assert(attempts.every((attempt) => !attempt.ok && attempt.error.execution === 'accepted'), JSON.stringify(attempts));
    await idle(rb.instanceId);
    for (let i = 0; i < 24; i++) {
      const answer = await a.command('native-prompt', { input: { ...keyedInput, timeoutMs: 5000 } });
      assert.match(answer.text, /NONCE=repeated_key/);
      attempts.push({ ok: true, value: answer });
    }
    const changed = await caught(a.command('native-prompt', { input: { ...keyedInput, text: 'NONCE=changed_key' } }));
    assert(!changed.ok); assert.equal(changed.error.code, -32602); assert.equal(changed.error.execution, 'not-sent');
    assert.equal(nonceCount(b, 'repeated_key'), 1); assert.equal(nonceCount(b, 'changed_key'), 0);
    passed('accepted timeout and 24 exact-key retries', { attempts, changed, providerExecutions: 1 });

    const controllers = [];
    for (let cycle = 1; cycle <= 3; cycle++) {
      const old = ra;
      const nonce = `controller_death_${cycle}`;
      const input = { instanceId: rb.instanceId, key: nonce, text: `NONCE=${nonce} HOLD_MS=1200`, timeoutMs: 5000 };
      const pending = caught(a.command('native-prompt', { input }));
      await waitFor(() => nonceCount(b, nonce) === 1, 'accepted before controller death');
      await crash(a);
      const lostWait = await pending;
      assert(!lostWait.ok && lostWait.error.execution === 'uncertain');
      assert(!listInstances(apiDir(env)).some((entry) => entry.id === old.instanceId));
      assert.equal(leaseState().leases.length, 1);
      a = start(`controller-${cycle}`); ra = await a.ready;
      assert.notEqual(ra.instanceId, old.instanceId); assert.notEqual(ra.sessionId, old.sessionId);
      assert.equal(rb.instanceId, record(rb.instanceId).id);
      await a.command('native-connect', { input: { instanceId: rb.instanceId, cwd } });
      await idle(rb.instanceId);
      const recovery = await a.command('native-prompt', { input });
      assert.match(recovery.text, new RegExp(`NONCE=${nonce}`));
      assert.equal(nonceCount(b, nonce), 1);
      controllers.push({ cycle, oldController: old, replacement: ra, retainedPeer: rb, lostWait, recovery, providerExecutions: 1, leasesAfterCrash: 1 });
    }
    passed('three controller SIGKILL cycles retain peer receipts without replay', { cycles: controllers });

    const peers = [];
    for (let cycle = 1; cycle <= 3; cycle++) {
      const old = rb;
      const nonce = `peer_death_${cycle}`;
      const input = { instanceId: old.instanceId, key: nonce, text: `NONCE=${nonce} HOLD_MS=5000`, timeoutMs: 8000 };
      const pending = caught(a.command('native-prompt', { input }));
      await waitFor(() => nonceCount(b, nonce) === 1, 'accepted before peer death');
      await crash(b);
      const failure = await pending;
      assert(!failure.ok && ['unknown', 'uncertain', 'accepted'].includes(failure.error.execution), JSON.stringify(failure));
      assert(!listInstances(apiDir(env)).some((entry) => entry.id === old.instanceId));
      assert.equal(leaseState().leases.length, 1);
      const staleConnect = await caught(a.command('native-connect', { input: { instanceId: old.instanceId, cwd } }));
      assert(!staleConnect.ok && staleConnect.error.message.includes('discoverable'));
      b = start(`peer-${cycle}`); rb = await b.ready;
      assert.notEqual(rb.instanceId, old.instanceId); assert.notEqual(rb.sessionId, old.sessionId);
      const oldConnection = await caught(a.command('native-prompt', { input }));
      assert(!oldConnection.ok);
      const before = await inspect(rb.instanceId).call('messages.list');
      assert(!JSON.stringify(before).includes(nonce));
      await a.command('native-connect', { input: { instanceId: rb.instanceId, cwd } });
      const freshNonce = `fresh_peer_${cycle}`;
      const recovery = await a.command('native-prompt', { input: { instanceId: rb.instanceId, key: freshNonce, text: `NONCE=${freshNonce}`, timeoutMs: 5000 } });
      assert.match(recovery.text, new RegExp(`NONCE=${freshNonce}`));
      assert.equal(nonceCount(b, nonce), 0); assert.equal(nonceCount(b, freshNonce), 1);
      peers.push({ cycle, oldPeer: old, replacement: rb, failure, staleConnect, oldConnection, recovery, oldRequestReplayed: false, leasesAfterCrash: 1 });
    }
    passed('three peer SIGKILL cycles fail explicitly and reconnect to a new session', { cycles: peers });

    const capacity = [];
    for (let i = 0; i < 127; i++) {
      const nonce = `capacity_${i}`;
      const response = await a.command('native-prompt', { input: { instanceId: rb.instanceId, key: nonce, text: `NONCE=${nonce}`, timeoutMs: 5000 } });
      assert.match(response.text, new RegExp(`NONCE=${nonce}(?:$|\\s)`));
      capacity.push(nonce);
    }
    const overflow = await caught(a.command('native-prompt', { input: { instanceId: rb.instanceId, key: 'capacity_overflow', text: 'NONCE=capacity_overflow', timeoutMs: 5000 } }));
    assert(!overflow.ok && overflow.error.message.includes('key capacity'), JSON.stringify(overflow));
    assert.equal(overflow.error.execution, 'not-sent');
    const earliest = await a.command('native-prompt', { input: { instanceId: rb.instanceId, key: 'fresh_peer_3', text: 'NONCE=fresh_peer_3', timeoutMs: 5000 } });
    assert.match(earliest.text, /NONCE=fresh_peer_3/);
    assert.equal(nonceCount(b, 'fresh_peer_3'), 1); assert.equal(nonceCount(b, 'capacity_overflow'), 0);
    passed('128-key session capacity retains old receipts and refuses new input', { acceptedKeys: 128, newTurns: capacity.length, overflow, earliest, earliestExecutions: 1, overflowExecutions: 0 });
    const live = children.filter((peer) => peer.child.exitCode === null && peer.child.signalCode === null);
    await Promise.all(live.map((peer) => peer.command('quit')));
    await Promise.all(live.map((peer) => peer.exited));
    assert.equal(listInstances(apiDir(env)).length, 0);
    const state = leaseState();
    assert.equal(state.agents.length, 0); assert.equal(state.leases.length, 0);
    assert(children.every((peer) => !peer.events.some((event) => event.kind === 'extension-error')));
    report.metrics = { burstSubmissions: 48, providerExecutions: children.reduce((count, peer) => count + peer.events.filter((event) => event.kind === 'provider-request').length, 0),
      controllerRecoveryCycles: controllers.length, peerRecoveryCycles: peers.length, completedExactKeyRetries: 24, retainedSessionKeys: 128 };
    passed('all processes, API registry records and real team leases empty', { processesStarted: children.length, registryRecords: 0, agents: 0, leases: 0 });
  } catch (error) {
    report.errors.push({ message: error.message, stack: error.stack });
  } finally {
    clearTimeout(deadline);
    for (const peer of children) if (peer.child.exitCode === null && peer.child.signalCode === null) peer.child.kill('SIGKILL');
    await Promise.all(children.map((peer) => peer.exited));
    report.cleanup = { processesAlive: children.filter((peer) => peer.child.exitCode === null && peer.child.signalCode === null).length };
    fs.rmSync(root, { recursive: true, force: true });
    report.cleanup.runtimeRemoved = !fs.existsSync(root);
    report.finishedAt = new Date().toISOString();
    if (output) { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600, flag: 'wx' }); }
  }
  assert.equal(report.errors.length, 0, JSON.stringify(report.errors));
  return report;
}

// argv[1] keeps a symlinked path while import.meta.url is the real path, so compare real paths.
const realOrSelf = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
if (process.argv[1] && realOrSelf(process.argv[1]) === realOrSelf(fileURLToPath(import.meta.url))) {
  const report = await runNativeReliability(process.argv[2]);
  console.log(JSON.stringify({ cases: report.cases.map(({ name, passed }) => ({ name, passed })), cleanup: report.cleanup, bundleSha256: report.bundleSha256 }));
}
