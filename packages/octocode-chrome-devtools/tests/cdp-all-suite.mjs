#!/usr/bin/env node
// Sends every command the installed Chrome advertises through the package's public
// engine CLI and classifies each reply. Params come from the schema alone: required
// fields, type placeholders, first enum value, resolved $ref. Destructive commands are
// survived by replacing the target or relaunching the browser, never skipped by name.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const args = process.argv.slice(2),
  get = (flag, fallback) =>
    args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback;
if (args.includes('--help')) {
  console.log(`Usage: cdp-all-suite.mjs [--via script|run] [--batch <n>] [--command-ms <ms>] [--only <Domain>] [--report <JSON file>] [--keep]
Sends every advertised CDP command to an isolated headless Chrome (page target; then the
browser, tab and dedicated worker targets, each for what the previous one answered -32601)
and classifies each reply:
  ok, chrome-error (Chrome routed and rejected the call), exception (reply carried
  exceptionDetails), timeout (no reply within --command-ms), target-destroyed /
  browser-destroyed (loss reproduced by replay; the suite relaunches and continues),
  unavailable (-32601 on every target for an experimental or deprecated member),
  not-found (-32601 on a stable member), transport (unreproduced connection loss),
  engine (the package failed without a Chrome reply).
not-found, transport and engine fail the suite.
--via script (default) sends the queue over one long-lived sandboxed connection with the
script command; --via run sends batched run plans of cdp steps, resuming after each stop.
Events: one run plan registers a listen step for every advertised event.`);
  process.exit(0);
}
const via = get('--via', 'script'),
  batchSize = Number(get('--batch', '120')),
  commandMs = Number(get('--command-ms', '3000')),
  only = get('--only'),
  engineDir = join(import.meta.dirname, '../dist/engine');
if (!['run', 'script'].includes(via)) throw Error('--via needs script or run');
const failing = new Set(['not-found', 'transport', 'engine']);
// Classes that mean no target knew the command.
const notFound = new Set(['not-found', 'unavailable']);
const lossClasses = new Set(['closed', 'engine']);
// A command is sent to the next target only while the previous one did not know it.
// tab and worker are flattened sessions attached from the browser connection: neither
// has its own /json entry the engine could select (tab) or a page that owns it (worker).
const scopes = {
  page: { select: ['--new-tab', 'about:blank', '--close-tab'] },
  browser: { select: ['--browser'] },
  tab: { select: ['--browser'], attach: 'tab' },
  // A worker answers from its own thread and drops a method it lacks without any reply,
  // so its silence says nothing: it keeps the earlier target's -32601 and is not waited on.
  worker: {
    select: ['--browser'],
    attach: 'worker',
    commandMs: 500,
    silentUnknown: true,
  },
};
// The initial page owns a dedicated worker that a replaced browser or target must regain.
const fixtureUrl =
  'data:text/html,' +
  encodeURIComponent(
    '<title>cdp-all</title><script>new Worker("data:text/javascript,setInterval(()=>{},1000)")</script>'
  );

const work = mkdtempSync(join(tmpdir(), 'octo-cdp-all-'));
const port = await new Promise((yes, no) => {
  const server = createServer().listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    server.close(() => yes(String(port)));
  });
  server.once('error', no);
});
const counters = { engineCalls: 0, relaunches: 0, engineMs: 0 };

function engine(argv, timeout = 120000) {
  const started = Date.now();
  counters.engineCalls++;
  return new Promise((yes, no) => {
    const child = spawn(
      process.execPath,
      [join(engineDir, 'cli.mjs'), ...argv],
      {
        cwd: work,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    let out = '';
    child.stdout.on('data', chunk => (out += chunk));
    child.stderr.on('data', chunk => (out += chunk));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout);
    child.once('error', no);
    child.once('close', code => {
      clearTimeout(timer);
      counters.engineMs += Date.now() - started;
      yes({ code, out });
    });
  });
}
const artifact = (out, name) => {
  const prefix = '[ARTIFACT] ' + name + ' ',
    line = out.split('\n').find(row => row.startsWith(prefix));
  return line ? line.slice(prefix.length) : null;
};
async function alive() {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}
async function listTargets() {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}
// Waits for the fixture page's worker; a sweep that lost it opens the fixture again.
async function ensureWorker(reopen = false) {
  const has = async () =>
    (await listTargets()).some(target => target.type === 'worker');
  if (reopen && !(await has()))
    await fetch(
      `http://127.0.0.1:${port}/json/new?${encodeURIComponent(fixtureUrl)}`,
      { method: 'PUT', signal: AbortSignal.timeout(5000) }
    ).catch(() => {});
  for (let waited = 0; waited < 5000; waited += 100) {
    if (await has()) return;
    await new Promise(yes => setTimeout(yes, 100));
  }
  throw Error('Fixture worker target did not appear');
}
async function launch(first = false) {
  if (!first) counters.relaunches++;
  const r = await engine([
    'open',
    '--headless',
    '--port',
    port,
    '--url',
    fixtureUrl,
  ]);
  const info = JSON.parse(
    r.out.split('\n').find(line => line.startsWith('{')) ?? '{}'
  );
  if (r.code !== 0 || info.status !== 'BROWSER_READY')
    throw Error('Launch failed: ' + r.out);
  if (first && info.reused !== false)
    throw Error('Suite needs a fresh isolated browser');
  await ensureWorker();
  return info;
}
// Returns true when the browser had died and was relaunched.
async function ensureBrowser() {
  if (await alive()) {
    await ensureWorker(true);
    return false;
  }
  // A destroyed browser leaves a stale tracked session; cleanup is idempotent.
  await engine(['cleanup', '--port', port], 30000);
  await launch();
  return true;
}

// Schema-driven placeholder params: no per-method knowledge.
function placeholders(protocol) {
  const types = new Map();
  for (const domain of protocol.domains)
    for (const type of domain.types ?? [])
      types.set(domain.domain + '.' + type.id, type);
  const value = (spec, domain, seen) => {
    if (spec.$ref) {
      const ref = spec.$ref.includes('.')
        ? spec.$ref
        : domain + '.' + spec.$ref;
      const type = types.get(ref);
      if (!type || seen.has(ref)) return {};
      return value(type, ref.split('.')[0], new Set([...seen, ref]));
    }
    if (spec.enum?.length) return spec.enum[0];
    switch (spec.type) {
      case 'string':
        return '';
      case 'integer':
      case 'number':
        return 0;
      case 'boolean':
        return false;
      case 'array':
        return [];
      case 'object':
        return required(spec.properties, domain, seen);
      default:
        return {};
    }
  };
  const required = (fields = [], domain, seen) =>
    Object.fromEntries(
      fields
        .filter(field => !field.optional)
        .map(field => [field.name, value(field, domain, seen)])
    );
  return (domain, command) =>
    required(command.parameters, domain.domain, new Set());
}

function classify(error, replied) {
  if (replied) return { class: 'exception', error };
  const protocolError = error.match(/^CDP error \[(-?\d+)\]: ([^]*)$/);
  if (protocolError) {
    const code = Number(protocolError[1]);
    return {
      class: code === -32601 ? 'not-found' : 'chrome-error',
      code,
      error: protocolError[2],
    };
  }
  if (/CDP timeout|step deadline/.test(error))
    return { class: 'timeout', error };
  if (
    /WebSocket|Session (already )?closed|closed unexpectedly|detached from its target/i.test(
      error
    )
  )
    return { class: 'closed', error };
  return { class: 'engine', error };
}

const selectionFor = scope => scopes[scope].select;
const msFor = scope => scopes[scope].commandMs ?? commandMs;
const deadline = (count, scope) => String(count * msFor(scope) + 30000);

// Runs queue[from..] as one plan of cdp steps; a stop ends the batch.
// Steps that attach the session a tab or worker scope sends through; they head each plan.
// $step counts from 1.
const attachSteps = type =>
  type
    ? [
        {
          op: 'cdp',
          method: 'Target.getTargets',
          params: { filter: [{ type }] },
        },
        {
          op: 'cdp',
          method: 'Target.attachToTarget',
          params: {
            targetId: { $step: 1, pointer: '/targetInfos/0/targetId' },
            flatten: true,
          },
        },
      ]
    : [];
async function attemptRun(queue, from, scope) {
  const batch = queue.slice(from, from + batchSize);
  const file = join(work, 'plan.json');
  const prelude = attachSteps(scopes[scope].attach);
  const session = prelude.length
    ? { session: { $step: 2, pointer: '/sessionId' } }
    : {};
  writeFileSync(
    file,
    JSON.stringify({
      commandMs: msFor(scope),
      waitMs: msFor(scope),
      steps: [
        ...prelude,
        ...batch.map(({ method, params }) => ({
          op: 'cdp',
          method,
          params,
          ...session,
        })),
      ],
    })
  );
  const r = await engine(
    [
      'run',
      ...selectionFor(scope),
      '--port',
      port,
      '--script-timeout',
      deadline(batch.length, scope),
      '--plan',
      file,
    ],
    Number(deadline(batch.length, scope)) + 30000
  );
  const resultFile = artifact(r.out, 'browser-result.json');
  if (!resultFile)
    return [{ index: from, ...classify(r.out.slice(-600), false) }];
  const steps = JSON.parse(readFileSync(resultFile, 'utf8')).steps;
  // A target that cannot be attached is a suite failure, not an answer from the target.
  if (steps.slice(0, prelude.length).some(step => step.status !== 'complete'))
    throw Error(
      `Cannot attach a ${scopes[scope].attach} target: ${JSON.stringify(steps.slice(0, prelude.length))}`
    );
  return steps.slice(prelude.length).map((step, offset) =>
    step.status === 'complete'
      ? { index: from + offset, class: 'ok' }
      : {
          index: from + offset,
          // A saved cdp-N.json means Chrome replied and the engine rejected exceptionDetails.
          ...classify(
            step.error ?? 'missing step error',
            /\/cdp-\d+\.json$/.test(step.artifact ?? '')
          ),
        }
  );
}

// Sends queue[from..] over one long-lived sandboxed connection; the queue is inlined in a
// generated module and replies stream back as [CDPALL] lines. Context loss ends the run.
async function attemptScript(queue, from, scope) {
  const batch = queue.slice(from);
  const file = join(work, 'cdp-all-worker.mjs');
  writeFileSync(
    file,
    `const queue = ${JSON.stringify(batch.map(({ method, params }) => ({ method, params })))};
const attach = ${JSON.stringify(scopes[scope].attach ?? null)};
export async function run(cdp) {
  let sessionId;
  if (attach) {
    const { targetInfos } = await cdp.send('Target.getTargets', { filter: [{ type: attach }] });
    if (!targetInfos.length) {
      console.log('[CDPALL] ' + JSON.stringify({ setup: 'No ' + attach + ' target to attach' }));
      return;
    }
    ({ sessionId } = await cdp.send('Target.attachToTarget', { targetId: targetInfos[0].targetId, flatten: true }));
  }
  for (const [offset, row] of queue.entries()) {
    let reply;
    try {
      const result = await cdp.send(row.method, row.params, sessionId, { timeoutMs: ${msFor(scope)} });
      reply = result?.exceptionDetails ? { offset, replied: true, error: String(result.exceptionDetails.text) } : { offset, ok: true };
    } catch (error) {
      reply = { offset, error: error.message };
    }
    console.log('[CDPALL] ' + JSON.stringify(reply));
    if (reply.error && !reply.replied && !/^CDP error \\[/.test(reply.error)) return;
  }
}
`
  );
  const r = await engine(
    [
      'script',
      file,
      ...selectionFor(scope),
      '--port',
      port,
      '--script-timeout',
      deadline(batch.length, scope),
    ],
    Number(deadline(batch.length, scope)) + 30000
  );
  const replies = r.out
    .split('\n')
    .filter(line => line.startsWith('[CDPALL] '))
    .map(line => JSON.parse(line.slice(9)));
  const setup = replies.find(row => row.setup);
  if (setup) throw Error(setup.setup);
  const rows = replies.map(row =>
    row.ok
      ? { index: from + row.offset, class: 'ok' }
      : { index: from + row.offset, ...classify(row.error, row.replied) }
  );
  return rows.length
    ? rows
    : [{ index: from, ...classify(r.out.slice(-600), false) }];
}
const attempt = via === 'run' ? attemptRun : attemptScript;

// Replays items on a fresh target; reports whether the context was lost at the last item.
async function replay(items, scope) {
  const rows = await attempt(items, 0, scope),
    died = await ensureBrowser(),
    last = rows.at(-1);
  return {
    rows,
    died,
    lost:
      died || (lossClasses.has(last.class) && last.index === items.length - 1),
  };
}

// A lost context is blamed on the command that reproduces it: the lost command alone,
// or the command before it on the same connection (whose reply may precede the loss,
// e.g. Page.close or Browser.close). An unreproduced loss is a transport failure.
async function attribute(queue, outcome, loss, from, scope) {
  const index = loss.index,
    alone = await replay([queue[index]], scope),
    destroyed = died => (died ? 'browser-destroyed' : 'target-destroyed');
  let blamed = false;
  if (index > from) {
    const previous = index - 1,
      before = await replay([queue[previous]], scope);
    const pair =
      before.died || alone.lost
        ? before
        : await replay([queue[previous], queue[index]], scope);
    if (pair.lost) {
      outcome[previous] = {
        ...outcome[previous],
        class: destroyed(pair.died),
        reply: outcome[previous].class,
      };
      blamed = true;
    }
  }
  if (alone.lost)
    return { index, class: destroyed(alone.died), error: loss.error };
  const retried = { ...alone.rows[0], index };
  return blamed ? retried : { ...retried, class: 'transport', first: loss };
}

async function sweep(queue, scope) {
  const outcome = new Array(queue.length);
  let from = 0;
  while (from < queue.length) {
    const rows = await attempt(queue, from, scope);
    for (const row of rows) outcome[row.index] = row;
    const last = rows.at(-1);
    from = last.index + 1;
    // Chrome-routed stops just resume; a hung or lost context gets a fresh target first.
    if (!['timeout', ...lossClasses].includes(last.class)) continue;
    const died = await ensureBrowser();
    if (last.class === 'timeout') continue;
    outcome[last.index] = await attribute(
      queue,
      outcome,
      { ...last, browserDied: died },
      rows[0].index,
      scope
    );
  }
  return outcome;
}

const started = Date.now();
let report;
try {
  const info = await launch(true);
  const capture = await engine(['protocol', '--browser', '--port', port]);
  const protocol = JSON.parse(
    readFileSync(artifact(capture.out, 'cdp-protocol.json'), 'utf8')
  );
  const params = placeholders(protocol);
  const domains = protocol.domains.filter(
    domain => !only || domain.domain === only
  );
  const queue = domains.flatMap(domain =>
    (domain.commands ?? []).map(command => ({
      method: domain.domain + '.' + command.name,
      params: params(domain, command),
      stable: !(
        domain.experimental ||
        domain.deprecated ||
        command.experimental ||
        command.deprecated
      ),
    }))
  );
  const events = domains.flatMap(domain =>
    (domain.events ?? []).map(entry => domain.domain + '.' + entry.name)
  );

  const sweepStarted = Date.now();
  // Each target answers what the previous ones did not know (-32601): the browser target
  // owns browser-level domains, a tab target owns tab-scoped ones, workers their own.
  const finals = new Array(queue.length);
  let remaining = queue.map((_row, index) => index);
  const tried = [];
  for (const scope of Object.keys(scopes)) {
    if (!remaining.length) break;
    tried.push(scope);
    const outcome = await sweep(
      remaining.map(index => queue[index]),
      scope
    );
    remaining = remaining.filter((index, position) => {
      const row = outcome[position];
      if (scopes[scope].silentUnknown && row.class === 'timeout') {
        finals[index] = { ...finals[index], tried: [...tried] };
        return true;
      }
      finals[index] = { target: scope, tried: [...tried], ...row };
      return row.class === 'not-found';
    });
  }
  const sweepMs = Date.now() - sweepStarted;
  const methods = queue.map((row, index) => {
    const { index: _index, ...final } = finals[index];
    if (final.class === 'not-found' && !row.stable) final.class = 'unavailable';
    return {
      method: row.method,
      params: row.params,
      ...final,
      ...(final.error ? { error: final.error.slice(0, 300) } : {}),
    };
  });

  // Events: register a listen step for every advertised event, then enable every domain
  // whose parameterless enable answered ok on the page, so subscriptions see traffic.
  await ensureBrowser();
  const enables = methods.filter(
    row =>
      row.class === 'ok' &&
      row.target === 'page' &&
      row.method.endsWith('.enable') &&
      !Object.keys(row.params).length
  );
  const planFile = join(work, 'events-plan.json');
  writeFileSync(
    planFile,
    JSON.stringify({
      commandMs,
      waitMs: commandMs,
      steps: [
        ...events.map((event, index) => ({
          op: 'listen',
          id: 'e' + index,
          event,
        })),
        ...enables.map(row => ({ op: 'cdp', method: row.method, params: {} })),
      ],
    })
  );
  const eventRun = await engine([
    'run',
    ...selectionFor('page'),
    '--port',
    port,
    '--plan',
    planFile,
  ]);
  const eventResultFile = artifact(eventRun.out, 'browser-result.json');
  const eventResult = eventResultFile
    ? JSON.parse(readFileSync(eventResultFile, 'utf8'))
    : {
        ok: false,
        eventCoverage: [],
        failure: { error: eventRun.out.slice(-600) },
      };
  const coverage = new Map(
    eventResult.eventCoverage.map(row => [row.event, row])
  );
  const eventRows = events.map(event => ({
    event,
    subscribed: coverage.has(event),
    observed: coverage.get(event)?.observed ?? 0,
  }));

  const totals = {};
  for (const row of methods) totals[row.class] = (totals[row.class] ?? 0) + 1;
  const failures = methods.filter(row => failing.has(row.class));
  const unsubscribed = eventRows.filter(row => !row.subscribed);
  report = {
    ok: !failures.length && !unsubscribed.length && eventResult.ok,
    suite: 'chrome-cdp-all',
    via,
    browser: info.browser,
    protocolVersion: protocol.version,
    elapsedMs: Date.now() - started,
    sweepMs,
    ...counters,
    commands: {
      advertised: queue.length,
      sent: methods.length,
      totals,
      byTarget: Object.fromEntries(
        Object.keys(scopes).map(scope => [
          scope,
          {
            tried: methods.filter(row => row.tried.includes(scope)).length,
            answered: methods.filter(
              row => row.target === scope && !notFound.has(row.class)
            ).length,
          },
        ])
      ),
      failures: failures.length,
    },
    events: {
      advertised: events.length,
      subscribed: eventRows.length - unsubscribed.length,
      observed: eventRows.filter(row => row.observed).length,
      enablesSent: enables.length,
      planOk: eventResult.ok,
      ...(eventResult.ok ? {} : { failure: eventResult.failure }),
    },
    failures,
    methods,
    eventRows,
  };
} finally {
  await engine(['cleanup', '--port', port], 30000).catch(() => {});
  if (!args.includes('--keep')) rmSync(work, { recursive: true, force: true });
}
const file = resolve(
  get('--report', join(tmpdir(), 'octocode-cdp-all-report.json'))
);
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(report, null, 2) + '\n');
console.log('[ARTIFACT] cdp-all-report.json ' + file);
for (const row of report.failures)
  console.log(
    'FAIL ' + row.method + ' ' + row.class + ': ' + (row.error ?? '')
  );
const { methods: _methods, eventRows: _events, failures, ...summary } = report;
console.log(
  JSON.stringify({ ...summary, failures: failures.map(row => row.method) })
);
process.exitCode = report.ok ? 0 : 1;
