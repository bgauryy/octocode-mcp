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
Sends every advertised CDP command to an isolated headless Chrome (page target, then the
browser target for -32601) and classifies each reply:
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
const lossClasses = new Set(['closed', 'engine']);

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
async function launch(first = false) {
  if (!first) counters.relaunches++;
  const r = await engine([
    'open',
    '--headless',
    '--port',
    port,
    '--url',
    'about:blank',
  ]);
  const info = JSON.parse(
    r.out.split('\n').find(line => line.startsWith('{')) ?? '{}'
  );
  if (r.code !== 0 || info.status !== 'BROWSER_READY')
    throw Error('Launch failed: ' + r.out);
  if (first && info.reused !== false)
    throw Error('Suite needs a fresh isolated browser');
  return info;
}
// Returns true when the browser had died and was relaunched.
async function ensureBrowser() {
  if (await alive()) return false;
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
  if (/WebSocket|Session (already )?closed|closed unexpectedly/i.test(error))
    return { class: 'closed', error };
  return { class: 'engine', error };
}

const selectionFor = scope =>
  scope === 'browser'
    ? ['--browser']
    : ['--new-tab', 'about:blank', '--close-tab'];
const deadline = count => String(count * commandMs + 30000);

// Runs queue[from..] as one plan of cdp steps; a stop ends the batch.
async function attemptRun(queue, from, scope) {
  const batch = queue.slice(from, from + batchSize);
  const file = join(work, 'plan.json');
  writeFileSync(
    file,
    JSON.stringify({
      commandMs,
      waitMs: commandMs,
      steps: batch.map(({ method, params }) => ({ op: 'cdp', method, params })),
    })
  );
  const r = await engine(
    [
      'run',
      ...selectionFor(scope),
      '--port',
      port,
      '--script-timeout',
      deadline(batch.length),
      '--plan',
      file,
    ],
    Number(deadline(batch.length)) + 30000
  );
  const resultFile = artifact(r.out, 'browser-result.json');
  if (!resultFile)
    return [{ index: from, ...classify(r.out.slice(-600), false) }];
  return JSON.parse(readFileSync(resultFile, 'utf8')).steps.map(
    (step, offset) =>
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
export async function run(cdp) {
  for (const [offset, row] of queue.entries()) {
    let reply;
    try {
      const result = await cdp.send(row.method, row.params, undefined, { timeoutMs: ${commandMs} });
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
      deadline(batch.length),
    ],
    Number(deadline(batch.length)) + 30000
  );
  const rows = r.out
    .split('\n')
    .filter(line => line.startsWith('[CDPALL] '))
    .map(line => JSON.parse(line.slice(9)))
    .map(row =>
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
  const pageOutcome = await sweep(queue, 'page');
  // Browser-level domains answer -32601 on page targets; route those to the browser target.
  const missing = pageOutcome.flatMap((row, index) =>
    row.class === 'not-found' ? [index] : []
  );
  const browserOutcome = missing.length
    ? await sweep(
        missing.map(index => queue[index]),
        'browser'
      )
    : [];
  const sweepMs = Date.now() - sweepStarted;
  const methods = queue.map((row, index) => {
    const browser = browserOutcome[missing.indexOf(index)],
      { index: _index, ...final } = browser ?? pageOutcome[index];
    if (final.class === 'not-found' && !row.stable) final.class = 'unavailable';
    return {
      method: row.method,
      params: row.params,
      target: browser ? 'browser' : 'page',
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
