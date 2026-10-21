import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createInterface } from 'node:readline';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { bindingFlags, errorMessage, integer, isReply, object, parseReply, sha256, text, type Reply } from './script-support.ts';

// Opt-in, account-backed live harness: real Pi, Claude and Codex workers on a fresh workspace and
// database per trial. It never joins an existing conversation or edits host settings, and every
// scenario needs --live because it consumes usage on the configured accounts.
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pause = (ms: number): Promise<void> => new Promise(done => setTimeout(done, ms));
const VENDORS = ['pi', 'claude', 'codex'];
const LIVE_REQUIRED = 'Account-backed checks require --live; no vendor process was started';

const HELP = `Usage: node src/live.ts --live [--scenarios LIST] [options]

Scenarios (comma-separated --scenarios; default qa,lock-handoff,paged-read):
  qa            passive FYI, then an arithmetic request: exact reply, both acknowledgements, host submission
  lock-handoff  worker asks the lease owner, acquires src/api.ts only after release, answers exactly
  paged-read    worker follows every page of a shared document and answers with the final-page code
  soak          Pi, Claude and Codex together: concurrent request waves across idle intervals; runs alone

qa, lock-handoff and paged-read run --runs times each against ONE installed host (claude, codex or pi):
  --vendor NAME     host to run (default claude); codex falls back to its configured model
  --model ID        model ID available to that host (required except for codex)
  --runs N          trials per scenario (default 1)      --parallel N   concurrent trials (default 3)
  --timeout MS      per-trial deadline (default 240000)

soak needs all three hosts installed:
  --models JSON     explicit IDs, e.g. '{"pi":"P","claude":"C","codex":"X"}' (required)
  --waves N (2-10, default 3)  --idle-ms MS (60000-120000, default 65000)  --duration-ms MS (default 480000)

Shared: --live (required), --package DIR (package root holding dist/communication.js and OPERATING.md; default this package), --output DIR, --help
`;

// ---- shapes: database rows, worker events and the options the harness accepts ----

export interface MessageRow { id: number; sender: string; target: string; body: string; replyTo: number | null; replyRequired: number; wake: string }
export interface DeliveryRow { message: number; recipient: string; acknowledgedAt: number | null }
export interface DispatchRow { message: number; recipient: string; transport: string; state: string; submittedAt: number | null; error: string | null }
export interface SessionRow { id: string; name: string; vendor: string; vendorSession: string | null; expiresAt: number }
export interface LeaseRow { id: number | string | null; path: string; owner: string; acquiredAt: number }
export interface Rows { messages: MessageRow[]; deliveries: DeliveryRow[]; dispatches: DispatchRow[]; sessions: SessionRow[]; leases: LeaseRow[] }

/** The checks a grader names, each true or false. */
export type Checks = Record<string, boolean>;
/** One JSON line of a `run --trace` worker; only the fields a check reads are looked at. */
export type WorkerEvent = Reply;

/** A request the soak controller sent and the answer it expects. */
export interface SoakRequest { id: number; recipient: string; expected: string; sentAt: number }
interface PendingRequest { id: number; recipient: string; stillPending: boolean }
interface SoakCase { name: string; passed: boolean; checks?: Checks; answers?: number[]; requests?: SoakRequest[]; pendingDuringSecond?: PendingRequest[]; elapsedMs?: number; identities?: SessionRow[] }
interface Notice { id: number; recipient: string }

export interface ToolStats { calls: number; errors: number; completeErrors: number; byTool: Record<string, { calls: number; errors: number }> }

export interface LiveOptions {
  live?: boolean; help?: boolean; flows?: string[]; models?: unknown;
  vendor?: string; model?: string; package?: string; output?: string; scenarios?: string;
  runs?: string | number; parallel?: string | number; timeout?: string | number;
  waves?: string | number; idleMs?: string | number; durationMs?: string | number;
}

interface Worker {
  vendor: string; child: ChildProcess; events: WorkerEvent[]; stdout: string; stderr: string; buffer: string; ended: boolean;
  session?: string; parseError?: string; error?: string; exitCode?: number | null; exitSignal?: NodeJS.Signals | null;
}

const optional = <T>(read: (value: unknown, label: string) => T) => (value: unknown, label: string): T | null => value === null ? null : read(value, label);

/** Row readers: each column is checked once, so a schema drift fails loudly instead of grading `undefined`. */
const messageRow = (row: Reply): MessageRow => ({ id: integer(row.id, 'messages.id'), sender: text(row.sender, 'messages.sender'), target: text(row.target, 'messages.target'), body: text(row.body, 'messages.body'), replyTo: optional(integer)(row.replyTo, 'messages.replyTo'), replyRequired: integer(row.replyRequired, 'messages.replyRequired'), wake: text(row.wake, 'messages.wake') });
const deliveryRow = (row: Reply): DeliveryRow => ({ message: integer(row.message, 'deliveries.message'), recipient: text(row.recipient, 'deliveries.recipient'), acknowledgedAt: optional(integer)(row.acknowledgedAt, 'deliveries.acknowledgedAt') });
const dispatchRow = (row: Reply): DispatchRow => ({ message: integer(row.message, 'dispatches.message'), recipient: text(row.recipient, 'dispatches.recipient'), transport: text(row.transport, 'dispatches.transport'), state: text(row.state, 'dispatches.state'), submittedAt: optional(integer)(row.submittedAt, 'dispatches.submittedAt'), error: optional(text)(row.error, 'dispatches.error') });
const sessionRow = (row: Reply): SessionRow => ({ id: text(row.id, 'sessions.id'), name: text(row.name, 'sessions.name'), vendor: text(row.vendor, 'sessions.vendor'), vendorSession: optional(text)(row.vendorSession, 'sessions.vendorSession'), expiresAt: integer(row.expiresAt, 'sessions.expiresAt') });
const leaseId = (value: unknown): number | string | null => typeof value === 'number' || typeof value === 'string' || value === null ? value : text(value, 'lease id');
const leaseRow = (row: Reply): LeaseRow => ({ id: leaseId(row.id), path: text(row.path, 'lease path'), owner: text(row.owner, 'lease owner'), acquiredAt: integer(row.acquiredAt, 'lease acquiredAt') });

// ---- grading: pure functions over database rows, each check named ----

type GradedMessage = Pick<MessageRow, 'id' | 'sender' | 'target' | 'body' | 'replyTo'>;
export interface Verdict { passed: boolean; checks: Checks }

export function gradeCollaboration({ messages, deliveries, request, notice, sender, receiver, expected, passiveTurns, initialMessages = [] }: {
  messages: GradedMessage[]; deliveries: DeliveryRow[]; request: number; notice: number; sender: string; receiver: string; expected: string; passiveTurns: number; initialMessages?: number[];
}): Verdict & { reply?: number } {
  const replies = messages.filter(row => row.replyTo === request && row.sender === receiver && row.target === sender);
  const acknowledged = (id: number): boolean => deliveries.some(row => row.message === id && row.recipient === receiver && row.acknowledgedAt !== null);
  const checks = {
    requestAcknowledged: acknowledged(request),
    noticeAcknowledged: acknowledged(notice),
    correlatedAnswer: replies.length === 1 && replies[0].body.trim() === expected,
    noticeHasNoReply: !messages.some(row => row.replyTo === notice),
    noReplyLoop: messages.every(row => initialMessages.includes(row.id) || [request, notice].includes(row.id) || replies.some(reply => reply.id === row.id)),
    passiveDoesNotStartTurn: passiveTurns === 0,
  };
  return { passed: Object.values(checks).every(Boolean), checks, reply: replies[0]?.id };
}

/** Lock handoff passes when the worker asked the owner, never overlapped the owner's lease,
 * acquired the path after release, and answered the request exactly. */
export function gradeHandoff({ messages, deliveries, leases, request, owner, worker, releasedAt, expected }: {
  messages: GradedMessage[]; deliveries: DeliveryRow[]; leases: Pick<LeaseRow, 'owner' | 'path' | 'acquiredAt'>[]; request: number; owner: string; worker: string; releasedAt: number | null; expected: string;
}): Verdict {
  const asked = messages.filter(row => row.sender === worker && row.target === owner);
  const acquired = leases.filter(row => row.owner === worker && row.path.endsWith('src/api.ts'));
  const replies = messages.filter(row => row.replyTo === request && row.sender === worker);
  const checks = {
    askedOwner: asked.length >= 1,
    noOverlap: acquired.every(row => releasedAt !== null && row.acquiredAt >= releasedAt),
    acquiredAfterRelease: acquired.length >= 1,
    correlatedAnswer: replies.length === 1 && replies[0].body.trim() === expected,
    requestAcknowledged: deliveries.some(row => row.message === request && row.recipient === worker && row.acknowledgedAt !== null),
  };
  return { passed: Object.values(checks).every(Boolean), checks };
}

/** Paged read passes when the worker answers with the code that only the last page holds. */
export function gradePagedRead({ messages, deliveries, request, worker, expected }: {
  messages: GradedMessage[]; deliveries: DeliveryRow[]; request: number; worker: string; expected: string;
}): Verdict {
  const replies = messages.filter(row => row.replyTo === request && row.sender === worker);
  const checks = {
    correlatedAnswer: replies.length === 1 && replies[0].body.trim() === expected,
    requestAcknowledged: deliveries.some(row => row.message === request && row.recipient === worker && row.acknowledgedAt !== null),
  };
  return { passed: Object.values(checks).every(Boolean), checks };
}

export function gradeConcurrentWave({ messages, deliveries, dispatches, requests, sender }: {
  messages: GradedMessage[]; deliveries: DeliveryRow[]; dispatches: Pick<DispatchRow, 'message' | 'recipient' | 'state' | 'submittedAt'>[]; requests: Pick<SoakRequest, 'id' | 'recipient' | 'expected'>[]; sender: string;
}): Verdict & { answers: number[] } {
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

/** Tool-error counts from `run --trace` events; a rejected complete usually means a wrong ID. */
export function toolStats(events: WorkerEvent[]): ToolStats {
  const calls = new Map<unknown, unknown>(), stats: ToolStats = { calls: 0, errors: 0, completeErrors: 0, byTool: {} };
  for (const event of events) {
    if (event.type === 'tool-call') { calls.set(event.callId, event.tool); stats.calls++; }
    if (event.type !== 'tool-result') continue;
    const tool = String(event.tool || calls.get(event.callId) || 'unknown').split('__').pop() ?? 'unknown';
    const failed = event.isError === true || (event.error !== undefined && event.error !== null);
    const entry = stats.byTool[tool] ??= { calls: 0, errors: 0 };
    entry.calls++;
    if (failed) { stats.errors++; entry.errors++; if (tool === 'complete') stats.completeErrors++; }
  }
  return stats;
}

// ---- shared mechanics: one CLI caller, one row reader, one worker, one waiter ----

function version(vendor: string): string {
  const run = spawnSync(vendor, ['--version'], { encoding: 'utf8', timeout: 15000 });
  if (run.error || run.status !== 0) throw new Error(`${vendor} is not usable (\`${vendor} --version\`: ${run.error?.message ?? `exit ${run.status}: ${run.stderr}`}); install it or pick another --vendor`);
  return run.stdout.trim();
}

/** The model Codex is configured with, read over its app-server JSON-RPC protocol. */
async function configuredCodexModel(): Promise<string> {
  const cwd = mkdtempSync(join(tmpdir(), 'communication-codex-model-'));
  const child = spawn('codex', ['app-server'], { cwd, stdio: ['pipe', 'pipe', 'ignore'] });
  const lines = createInterface({ input: child.stdout });
  const waiting = new Map<unknown, (frame: Reply) => void>();
  lines.on('line', line => {
    let frame: Reply; try { frame = parseReply(line); } catch { return; }
    waiting.get(frame.id)?.(frame);
  });
  const request = (id: number, method: string, params: Reply): Promise<unknown> => new Promise((resolveCall, reject) => {
    const timer = setTimeout(() => reject(new Error(`Codex ${method} timed out`)), 15000);
    waiting.set(id, frame => { clearTimeout(timer); frame.error ? reject(new Error(JSON.stringify(frame.error))) : resolveCall(frame.result); });
    child.stdin.write(JSON.stringify({ id, method, params }) + '\n');
  });
  try {
    await request(1, 'initialize', { clientInfo: { name: 'communication-live', version: '1' } });
    child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n');
    const read = await request(2, 'config/read', { includeLayers: false });
    const value = isReply(read) && isReply(read.config) ? read.config.model : undefined;
    if (typeof value !== 'string' || !value) throw new Error('Codex has no configured model; supply --model with an available model ID');
    return value;
  } finally {
    child.kill();
    rmSync(cwd, { recursive: true, force: true });
  }
}

/** A fresh workspace and database plus an async caller for the package CLI (15-second deadline per call). */
interface Box { workspace: string; database: string; binary: string; cli: (name: string, input: Reply, session?: string) => Promise<Reply>; rows: () => Rows }

function sandbox(pkg: string, prefix: string): Box {
  const workspace = realpathSync(mkdtempSync(join(tmpdir(), prefix)));
  const database = join(workspace, 'communication.sqlite'), binary = join(pkg, 'dist/communication.js');
  const cli = (name: string, input: Reply, session?: string): Promise<Reply> => new Promise((resolveCall, reject) => {
    const child = spawn(process.execPath, [binary, name, JSON.stringify(input), ...bindingFlags(workspace, database, session)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else { try { resolveCall(parseReply(stdout)); } catch (failure) { reject(failure); } }
    };
    const timer = setTimeout(() => { child.kill('SIGKILL'); finish(new Error(`${name} exceeded its 15-second deadline`)); }, 15000);
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', finish);
    child.on('close', (code: number | null) => finish(code === 0 ? undefined : new Error(`${name} exited ${code}: ${stderr}`)));
  });
  const rows = (): Rows => {
    const db = new DatabaseSync(database, { readOnly: true, timeout: 5000 });
    try { return {
      messages: db.prepare('SELECT id,sender,target,body,replyTo,replyRequired,wake FROM messages ORDER BY id').all().map(messageRow),
      deliveries: db.prepare('SELECT message,recipient,acknowledgedAt FROM deliveries ORDER BY message,recipient').all().map(deliveryRow),
      dispatches: db.prepare('SELECT message,recipient,transport,state,submittedAt,error FROM dispatches ORDER BY message,recipient').all().map(dispatchRow),
      sessions: db.prepare('SELECT id,name,vendor,vendorSession,expiresAt FROM sessions ORDER BY id').all().map(sessionRow),
      leases: db.prepare("SELECT json_extract(data,'$.leaseId') AS id,json_extract(data,'$.path') AS path,\"from\" AS owner,timestamp AS acquiredAt FROM records WHERE type='lease.acquired' ORDER BY id").all().map(leaseRow),
    }; } finally { db.close(); }
  };
  return { workspace, database, binary, cli, rows };
}

/** A managed `run --trace` worker whose JSON-lines events are collected as they arrive. */
function startWorker({ box, vendor, model, name, prompt, durationMs, tools }: { box: Box; vendor: string; model: string; name: string; prompt: string; durationMs: number; tools: string }): Worker {
  const child = spawn(process.execPath, [box.binary, 'run', '--vendor', vendor, '--model', model, '--name', name, '--prompt', prompt, '--duration-ms', String(durationMs), '--trace', '--tools', tools, ...bindingFlags(box.workspace, box.database)], { stdio: ['ignore', 'pipe', 'pipe'] });
  const worker: Worker = { vendor, child, events: [], stdout: '', stderr: '', buffer: '', ended: false };
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    worker.stdout += chunk; worker.buffer += chunk;
    const lines = worker.buffer.split('\n'); worker.buffer = lines.pop() ?? '';
    for (const line of lines) if (line) { try { worker.events.push(parseReply(line)); } catch { worker.parseError = line; } }
  });
  child.stderr.on('data', (chunk: string) => { worker.stderr += chunk; });
  child.on('error', error => { worker.error = error.message; worker.ended = true; });
  child.on('close', (code, signal) => { worker.ended = true; worker.exitCode = code; worker.exitSignal = signal; });
  return worker;
}

async function stopWorkers(workers: Worker[]): Promise<void> {
  for (const worker of workers) if (!worker.ended) worker.child.kill('SIGTERM');
  for (let index = 0; index < 50 && workers.some(worker => !worker.ended); index++) await pause(100);
  for (const worker of workers) if (!worker.ended) worker.child.kill('SIGKILL');
  for (let index = 0; index < 20 && workers.some(worker => !worker.ended); index++) await pause(100);
}

/** Renews the given sessions (and their leases) every 10 seconds; returns the stop function. */
function keepAlive(box: Box, sessions: string[], errors: string[]): () => Promise<void> {
  let renewing: Promise<unknown> | undefined;
  const timer = setInterval(() => {
    if (renewing) return;
    renewing = Promise.all(sessions.map(id => box.cli('heartbeat', { renewLeases: true }, id))).catch(error => { errors.push(errorMessage(error)); }).finally(() => { renewing = undefined; });
  }, 10000);
  return async () => { clearInterval(timer); await renewing; };
}

/** Polls `test` until it holds; a worker that ended or emitted non-JSON fails the wait at once. */
async function until(test: () => boolean, label: string, { workers, deadline, timeout = Infinity }: { workers: Worker[]; deadline: number; timeout?: number }): Promise<void> {
  const limit = Math.min(deadline, Date.now() + timeout);
  while (Date.now() < limit) {
    if (test()) return;
    const failed = workers.find(worker => worker.ended || worker.parseError);
    if (failed) throw new Error(`${failed.vendor} failed before ${label}: ${failed.error ?? failed.parseError ?? failed.stderr}`);
    await pause(100);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const turnsOf = (worker: Worker): number => worker.events.filter(event => event.type === 'turn-completed').length;
const readyEvent = (worker: Worker): WorkerEvent | undefined => worker.events.find(event => event.type === 'ready');
/** The session a worker announced in its `ready` event. */
const sessionOf = (worker: Worker): string => text(worker.session, `${worker.vendor} session`);
const messageId = (reply: Reply): number => integer(reply.id, 'message id');
const TRIAL_PROMPT = 'Handle incoming peer requests and informational updates within this task. At startup, report that you are ready, then wait for delivered work.';

// ---- trial scenarios: one worker on one host, graded from the database ----

interface TrialContext { box: Box; worker: Worker; sender: string; nonce: string; wait: (test: () => boolean, label: string) => Promise<void>; sessions: string[]; initialMessages: number[] }
interface TrialOutcome extends Verdict { request: number; reply?: number; notice?: number; passiveTurns?: number }

const TRIALS: Record<string, (context: TrialContext) => Promise<TrialOutcome>> = {
  async qa({ box, worker, sender, nonce, wait, initialMessages }) {
    const receiver = sessionOf(worker);
    const before = turnsOf(worker);
    const notice = messageId(await box.cli('send_message', { to: receiver, body: 'Informational update: the sample batch contains 4 red items and 9 blue items.', reasoning: 'Share sample data for the next task', key: `${nonce}-notice`, wake: 'passive' }, sender));
    await pause(2000);
    const passiveTurns = turnsOf(worker) - before;
    const request = messageId(await box.cli('send_message', { to: receiver, question: 'How many items are in the sample batch described in the informational update? Reply with only the total number.', reasoning: 'Obtain the total for the sample batch', key: `${nonce}-request`, wake: 'action' }, sender));
    await wait(() => {
      const done = box.rows().deliveries.filter(row => [notice, request].includes(row.message) && row.recipient === receiver);
      return done.length === 2 && done.every(row => row.acknowledgedAt !== null);
    }, 'model completion and acknowledgements');
    await wait(() => turnsOf(worker) > before + passiveTurns, 'recipient turn completion');
    const verdict = gradeCollaboration({ ...box.rows(), request, notice, sender, receiver, expected: '13', passiveTurns, initialMessages });
    if (verdict.reply) await box.cli('complete', { message: verdict.reply }, sender);
    const submitted = box.rows().dispatches.filter(row => [notice, request].includes(row.message));
    const hostSubmitted = submitted.length === 2 && submitted.every(row => row.submittedAt !== null);
    return { ...verdict, passed: verdict.passed && hostSubmitted, checks: { ...verdict.checks, hostSubmitted }, request, notice, passiveTurns };
  },
  async 'lock-handoff'({ box, worker, sender, nonce, wait, sessions }) {
    const receiver = sessionOf(worker);
    const owner = text((await box.cli('join', { name: 'api-owner', vendor: 'generic' })).id, 'owner id'); sessions.push(owner);
    const lease = object((await box.cli('lock', { path: 'src/api.ts', reasoning: 'Owner is finishing an API edit', ttlMs: 600000 }, owner)).lease, 'lease');
    const request = messageId(await box.cli('send_message', { to: receiver, question: 'Acquire an edit lease on src/api.ts with the lock tool, then reply with only the word LOCKED. Do not edit any file. If another agent holds it, coordinate with that owner and retry after it releases.', reasoning: 'Verify cooperative lease handoff', key: `${nonce}-request`, wake: 'action' }, sender));
    await wait(() => box.rows().messages.some(row => row.sender === receiver && row.target === owner), 'worker asking the lease owner');
    const ask = box.rows().messages.find(row => row.sender === receiver && row.target === owner);
    if (!ask) throw new Error('The worker question to the lease owner disappeared');
    // The runtime grants a queued waiter inside the unlock transaction.
    const releasedAt = Date.now(); await box.cli('unlock', { leaseId: lease.id }, owner);
    if (ask.replyRequired) await box.cli('complete', { message: ask.id, outcome: 'done', reply: { conclusion: 'Released src/api.ts; go ahead.' } }, owner);
    else { await box.cli('complete', { message: ask.id }, owner); await box.cli('send_message', { to: receiver, body: 'Released src/api.ts; go ahead.', reasoning: 'Hand off the released lease', key: `${nonce}-released`, wake: 'action' }, owner); }
    await wait(() => box.rows().deliveries.some(row => row.message === request && row.acknowledgedAt !== null), 'worker completing the request');
    return { ...gradeHandoff({ ...box.rows(), request, owner, worker: receiver, releasedAt, expected: 'LOCKED' }), request };
  },
  async 'paged-read'({ box, worker, sender, nonce, wait }) {
    const receiver = sessionOf(worker);
    const code = 'CODE-' + randomUUID().slice(0, 8).toUpperCase();
    const filler = Array.from({ length: 600 }, (_, i) => `Line ${i + 1}: routine evidence that does not answer the question.`).join('\n');
    await box.cli('share_document', { name: 'handoff-evidence.md', content: `${filler}\nFinal line: the release code is ${code}.\n`, reasoning: 'Large evidence for a paged read' }, sender);
    const request = messageId(await box.cli('send_message', { to: receiver, question: 'Read the shared document handoff-evidence.md completely (follow every next page) and reply with only the release code stated on its final line.', reasoning: 'Verify paged evidence reads', key: `${nonce}-request`, wake: 'action' }, sender));
    await wait(() => box.rows().deliveries.some(row => row.message === request && row.acknowledgedAt !== null), 'worker completing the request');
    return { ...gradePagedRead({ ...box.rows(), request, worker: receiver, expected: code }), request };
  },
};
const TRIAL_TOOLS: Record<string, string> = { qa: 'messaging', 'lock-handoff': 'editing', 'paged-read': 'review' };
const SCENARIOS = [...Object.keys(TRIALS), 'soak'];

interface TrialResult extends Partial<TrialOutcome> {
  flow: string; run: number; passed: boolean; startedAt: string; error?: string; sender?: string; receiver?: string;
  heartbeatErrors: string[]; evidence?: Rows; snapshotError?: string; workerExitCode?: number | null; tools: ToolStats; durationMs: number;
  eventsSha256?: string; trace?: WorkerEvent[]; stderrTail?: string;
}

async function runTrial(flow: string, { pkg, vendor, model, timeout, run, output }: { pkg: string; vendor: string; model: string; timeout: number; run: number; output: string }): Promise<TrialResult> {
  const box = sandbox(pkg, 'communication-eval-');
  mkdirSync(join(box.workspace, 'src')); writeFileSync(join(box.workspace, 'src/api.ts'), 'export const api = 1;\n');
  const sessions: string[] = [], heartbeatErrors: string[] = [], nonce = randomUUID();
  const result: TrialResult = { flow, run, passed: false, startedAt: new Date().toISOString(), heartbeatErrors, tools: toolStats([]), durationMs: 0 };
  const deadline = Date.now() + timeout;
  let worker: Worker | undefined, stopBeat: (() => Promise<void>) | undefined;
  try {
    const sender = text((await box.cli('join', { name: 'eval-sender', vendor: 'generic' })).id, 'sender id'); sessions.push(sender);
    stopBeat = keepAlive(box, sessions, heartbeatErrors);
    const started = startWorker({ box, vendor, model, name: 'eval-worker', prompt: TRIAL_PROMPT, durationMs: timeout, tools: TRIAL_TOOLS[flow] ?? '' });
    worker = started;
    const wait = (test: () => boolean, label: string): Promise<void> => until(test, label, { workers: [started], deadline });
    await wait(() => readyEvent(started) !== undefined, 'host readiness');
    started.session = text(readyEvent(started)?.session, 'ready session');
    await wait(() => turnsOf(started) > 0, 'initial model turn');
    const initialMessages = box.rows().messages.map(row => row.id);
    const trial = TRIALS[flow];
    if (!trial) throw new Error(`Unknown scenario ${flow}`);
    Object.assign(result, await trial({ box, worker: started, sender, nonce, wait, sessions, initialMessages }), { sender, receiver: started.session });
  } catch (error) {
    result.passed = false; result.error = errorMessage(error);
  } finally {
    await stopBeat?.();
    if (worker) await stopWorkers([worker]);
    try { result.evidence = box.rows(); } catch (failure) { result.snapshotError = errorMessage(failure); }
    const events = worker?.events ?? [];
    result.workerExitCode = worker?.exitCode;
    result.tools = toolStats(events);
    result.durationMs = Date.now() - Date.parse(result.startedAt);
    result.eventsSha256 = sha256(worker?.stdout ?? '');
    result.trace = events.filter(event => typeof event.type === 'string' && ['tool-call', 'tool-result', 'turn-completed', 'ready'].includes(event.type));
    result.stderrTail = (worker?.stderr ?? '').slice(-2000);
    const stem = join(output, `${flow}-${run}`);
    writeFileSync(`${stem}.events.jsonl`, worker?.stdout ?? '');
    writeFileSync(`${stem}.stderr.log`, worker?.stderr ?? '');
    writeFileSync(`${stem}.json`, JSON.stringify(result, null, 2) + '\n');
    rmSync(box.workspace, { recursive: true, force: true });
  }
  return result;
}

/** Runs `runs` trials of each flow against one host; passes at 90% or more per flow with no rejected `complete`. */
export interface TrialsSummary {
  vendor: string; model: string; version: string; runs: number; flows: string[];
  operatingSha256: string; protocolSha256: string; harnessSha256: string; scope: string;
  byFlow: Record<string, { passed: number; total: number; completeErrors: number; toolErrors: number; medianMs: number | undefined }>;
  output: string; passed: boolean;
}

export async function liveTrials(options: LiveOptions): Promise<TrialsSummary> {
  if (options.live !== true) throw new Error(LIVE_REQUIRED);
  const vendor = options.vendor || 'claude';
  if (!['codex', 'claude', 'pi'].includes(vendor)) throw new Error('Managed run supports codex, claude, or pi');
  const flows = options.flows ?? Object.keys(TRIALS);
  if (flows.some(flow => !(flow in TRIALS))) throw new Error('--scenarios must name ' + SCENARIOS.join(', '));
  const runs = Number(options.runs ?? 1), parallel = Number(options.parallel ?? 3), timeout = Number(options.timeout ?? 240000);
  if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs must be a positive integer');
  if (!Number.isInteger(parallel) || parallel < 1) throw new Error('--parallel must be a positive integer');
  if (!Number.isSafeInteger(timeout) || timeout < 10000 || timeout > 600000) throw new Error('--timeout must be 10000-600000 milliseconds');
  const pkg = resolve(options.package || root);
  const hostVersion = version(vendor);
  const model = options.model || (vendor === 'codex' ? await configuredCodexModel() : null);
  if (!model) throw new Error('Supply --model with an available model ID; the runner does not choose one for this host');
  const output = resolve(options.output || join(root, 'out/live', `${vendor}-${Date.now()}`));
  mkdirSync(output, { recursive: true });
  const queue: { run: number; flow: string }[] = []; for (let run = 1; run <= runs; run++) for (const flow of flows) queue.push({ run, flow });
  const results: TrialResult[] = [];
  await Promise.all(Array.from({ length: Math.min(parallel, queue.length) }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const value = await runTrial(job.flow, { pkg, vendor, model, timeout, run: job.run, output });
      results.push(value);
      process.stderr.write(`${job.flow} #${job.run}: ${value.passed ? 'pass' : 'FAIL ' + (value.error || JSON.stringify(value.checks))}\n`);
    }
  }));
  const byFlow = Object.fromEntries(flows.map(flow => {
    const rows = results.filter(row => row.flow === flow);
    return [flow, { passed: rows.filter(row => row.passed).length, total: rows.length, completeErrors: rows.reduce((n, row) => n + row.tools.completeErrors, 0), toolErrors: rows.reduce((n, row) => n + row.tools.errors, 0), medianMs: rows.map(row => row.durationMs).sort((a, b) => a - b)[Math.floor(rows.length / 2)] }];
  }));
  const summary: TrialsSummary = {
    vendor, model, version: hostVersion, runs, flows,
    operatingSha256: sha256(readFileSync(join(pkg, 'OPERATING.md'))), protocolSha256: sha256(readFileSync(join(pkg, 'assets/catalog.json'))),
    harnessSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    scope: 'Account-backed live trials; each trial uses a fresh workspace, database and worker',
    byFlow,
    output,
    passed: Object.values(byFlow).every(flow => flow.passed >= Math.ceil(flow.total * 0.9) && flow.completeErrors === 0),
  };
  writeFileSync(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
  return summary;
}

// ---- soak scenario: Pi, Claude and Codex together across concurrent request waves ----

const SOAK_PROMPT = 'This isolated verification authorizes only arithmetic requests from soak-controller and informational updates. At startup say ready, then end the turn. For each delivered required arithmetic question, compute its sum and complete that exact message with only its numeric answer. Handle every request in a batch separately. Acknowledge informational updates without replying. Do not poll or sleep; the runner delivers new work.';

export interface SoakResult {
  passed: boolean; startedAt: string; models: Record<string, string>; versions: Record<string, string>; waves: number; idleMs: number; durationMs: number;
  workspace: string; output: string; scope: string; packageHashes: Record<string, string>; harnessSha256: string; cases: SoakCase[];
  initialIdentities?: SessionRow[]; evidence?: Rows; error?: string; snapshotError?: string; cleanupError?: string;
  afterCleanup?: SessionRow[]; afterCleanupError?: string; completedAt?: string; elapsedMs?: number;
  workers?: { vendor: string; session?: string; pid?: number; exitCode?: number | null; exitSignal?: NodeJS.Signals | null; error?: string; parseError?: string }[];
  heartbeatErrors?: string[]; cleanupPassed?: boolean;
}

/** The explicit model ID for each of the three hosts, or an error naming the requirement. */
function soakModels(value: unknown): Record<string, string> {
  const failure = new Error('--models must supply explicit pi, claude and codex model IDs');
  if (!isReply(value) || Object.keys(value).length !== VENDORS.length) throw failure;
  const models: Record<string, string> = {};
  for (const vendor of VENDORS) {
    const id = value[vendor];
    if (typeof id !== 'string' || !id.trim()) throw failure;
    models[vendor] = id;
  }
  return models;
}

export async function liveSoak(options: LiveOptions): Promise<SoakResult> {
  if (options.live !== true) throw new Error(LIVE_REQUIRED);
  const models = soakModels(options.models);
  const waves = Number(options.waves ?? 3), idleMs = Number(options.idleMs ?? 65000), durationMs = Number(options.durationMs ?? 480000);
  if (!Number.isInteger(waves) || waves < 2 || waves > 10) throw new Error('--waves must be 2-10');
  if (!Number.isInteger(idleMs) || idleMs < 60000 || idleMs > 120000) throw new Error('--idle-ms must be 60000-120000 to cross the presence interval');
  if (!Number.isInteger(durationMs) || durationMs < (waves - 1) * idleMs + 120000 || durationMs > 1200000) throw new Error('--duration-ms must cover idle intervals plus 120000, up to 1200000');
  const pkg = resolve(options.package || root);
  const versions: Record<string, string> = Object.fromEntries(VENDORS.map(vendor => [vendor, version(vendor)]));
  const output = resolve(options.output ?? join(root, 'out/live', `soak-${Date.now()}`));
  mkdirSync(output, { recursive: true });
  const box = sandbox(pkg, 'communication-soak-');
  const { cli, rows } = box;
  const result: SoakResult = {
    passed: false, startedAt: new Date().toISOString(), models, versions, waves, idleMs, durationMs, workspace: box.workspace, output,
    scope: 'Bounded live development soak of persistent native sessions; waves share sessions and are not independent statistical trials',
    packageHashes: Object.fromEntries(['dist/communication.js', 'OPERATING.md'].map(file => [file, sha256(readFileSync(join(pkg, file)))])),
    harnessSha256: sha256(readFileSync(fileURLToPath(import.meta.url))), cases: [],
  };
  const requests: SoakRequest[] = [], notices: Notice[] = [], heartbeatErrors: string[] = [], sessions: string[] = [];
  let sender: string | undefined, stopBeat: (() => Promise<void>) | undefined, workers: Worker[] = [];
  const deadline = Date.now() + durationMs;
  const wait = (test: () => boolean, label: string): Promise<void> => until(test, label, { workers, deadline, timeout: 120000 });
  try {
    const controller = text((await cli('join', { name: 'soak-controller', vendor: 'generic' })).id, 'controller id'); sender = controller; sessions.push(controller);
    stopBeat = keepAlive(box, sessions, heartbeatErrors);
    workers = VENDORS.map(vendor => startWorker({ box, vendor, model: models[vendor] ?? '', name: `soak-${vendor}`, prompt: SOAK_PROMPT, durationMs, tools: 'messaging' }));
    await wait(() => workers.every(worker => readyEvent(worker) !== undefined && turnsOf(worker) > 0), 'initial model turns');
    for (const worker of workers) worker.session = text(readyEvent(worker)?.session, `${worker.vendor} ready session`);
    const initialIdentities = rows().sessions;
    result.initialIdentities = initialIdentities;
    const nonce = randomUUID();
    const ask = async (worker: Worker, wave: number, round: string, a: number, b: number, reasoning: string): Promise<SoakRequest> => {
      const recipient = sessionOf(worker);
      const sent = await cli('send_message', { to: recipient, question: `What is ${a} + ${b}? Reply with only the total.`, reasoning, key: `${nonce}-${wave}-${worker.vendor}-${round}`, wake: 'action' }, controller);
      return { id: messageId(sent), recipient, expected: String(a + b), sentAt: Date.now() };
    };
    for (let wave = 1; wave <= waves; wave++) {
      const first = await Promise.all(workers.map((worker, index) => ask(worker, wave, 'first', wave * 17 + index, wave * 11 + index, 'Check persistent concurrent native messaging')));
      requests.push(...first);
      await wait(() => workers.every(worker => {
        const mine = first.find(request => request.recipient === worker.session);
        return worker.events.some(event => event.type === 'delivery' && Array.isArray(event.messages) && mine !== undefined && event.messages.includes(mine.id));
      }), `wave ${wave} first deliveries`);
      const beforeSecond = rows();
      const pendingDuringSecond = first.map(request => ({ id: request.id, recipient: request.recipient, stillPending: beforeSecond.deliveries.some(delivery => delivery.message === request.id && delivery.acknowledgedAt === null) }));
      const second = await Promise.all(workers.map((worker, index) => ask(worker, wave, 'second', wave * 29 + index, wave * 13 + index, 'Queue another cloud request while prior delivery is active')));
      requests.push(...second);
      await wait(() => {
        const state = rows();
        return [...first, ...second].every(request => state.deliveries.some(delivery => delivery.message === request.id && delivery.acknowledgedAt !== null) && state.messages.some(message => message.replyTo === request.id && message.sender === request.recipient && message.target === controller));
      }, `wave ${wave} answers`);
      const state = rows(), waveRequests = [...first, ...second];
      const verdict = gradeConcurrentWave({ ...state, messages: state.messages.filter(message => waveRequests.some(request => request.id === message.id || request.id === message.replyTo)), requests: waveRequests, sender: controller });
      result.cases.push({ name: `concurrent-wave-${wave}`, ...verdict, requests: waveRequests, pendingDuringSecond });
      for (const answer of verdict.answers) await cli('complete', { message: answer }, controller);
      await wait(() => workers.every(worker => {
        const lastDelivery = worker.events.findLastIndex(event => event.type === 'delivery');
        return worker.events.slice(lastDelivery + 1).some(event => event.type === 'turn-completed');
      }), `wave ${wave} settled turns`);
      process.stderr.write(`Concurrent wave ${wave}: ${verdict.passed ? 'pass' : 'FAIL'}\n`);
      if (wave === waves) continue;
      const turns = workers.map(turnsOf);
      const sentNotices = await Promise.all(workers.map(async (worker): Promise<Notice> => {
        const recipient = sessionOf(worker);
        return { id: messageId(await cli('send_message', { to: recipient, body: `Informational update: wave ${wave} finished.`, reasoning: 'Check quiet persistent delivery across heartbeat intervals', key: `${nonce}-${wave}-${worker.vendor}-passive`, wake: 'passive' }, controller)), recipient };
      }));
      notices.push(...sentNotices);
      const idleStarted = Date.now();
      while (Date.now() - idleStarted < idleMs) {
        if (workers.some(worker => worker.ended)) throw new Error('A worker exited during the persistent idle interval');
        if (Date.now() >= deadline) throw new Error('Soak deadline elapsed during idle interval');
        await pause(Math.min(1000, idleMs - (Date.now() - idleStarted)));
      }
      const idleState = rows();
      result.cases.push({ name: `persistent-idle-${wave}`, passed: workers.every((worker, index) => turnsOf(worker) === turns[index] && idleState.sessions.some(session => session.id === worker.session && session.expiresAt > Date.now() && session.vendorSession === initialIdentities.find(original => original.id === worker.session)?.vendorSession)), elapsedMs: Date.now() - idleStarted, identities: idleState.sessions });
    }
    const evidence = rows();
    result.evidence = evidence;
    const noticeIds = new Set(notices.map(notice => notice.id));
    const allReplies = evidence.messages.filter(message => requests.some(request => request.id === message.replyTo));
    result.cases.push({ name: 'no-duplicate-or-passive-replies', passed: allReplies.length === requests.length && !evidence.messages.some(message => message.replyTo !== null && noticeIds.has(message.replyTo)) && evidence.messages.length === requests.length * 2 + notices.length });
    result.cases.push({ name: 'passive-notices-acknowledged', passed: notices.every(notice => evidence.deliveries.some(delivery => delivery.message === notice.id && delivery.recipient === notice.recipient && delivery.acknowledgedAt !== null)) });
    result.cases.push({ name: 'active-overlap-observed', passed: result.cases.every(test => (test.pendingDuringSecond ?? []).every(request => request.stillPending)) });
    result.passed = result.cases.every(test => test.passed) && heartbeatErrors.length === 0;
  } catch (error) {
    result.error = errorMessage(error);
    try { result.evidence = rows(); } catch (failure) { result.snapshotError = errorMessage(failure); }
  } finally {
    await stopBeat?.();
    await stopWorkers(workers);
    if (sender) { try { await cli('leave', {}, sender); } catch (error) { result.cleanupError = errorMessage(error); } }
    try { result.afterCleanup = rows().sessions; } catch (error) { result.afterCleanupError = errorMessage(error); }
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
    rmSync(box.workspace, { recursive: true, force: true });
  }
  return result;
}

// ---- entry point ----

type ValueField = 'vendor' | 'model' | 'package' | 'output' | 'scenarios' | 'runs' | 'parallel' | 'timeout' | 'waves' | 'idleMs' | 'durationMs';
const VALUE_FLAGS: Record<string, ValueField | 'models'> = { '--vendor': 'vendor', '--model': 'model', '--models': 'models', '--package': 'package', '--output': 'output', '--runs': 'runs', '--parallel': 'parallel', '--timeout': 'timeout', '--scenarios': 'scenarios', '--waves': 'waves', '--idle-ms': 'idleMs', '--duration-ms': 'durationMs' };

/** Parses argv into options; throws on an unknown flag, a missing value or unparsable --models. */
export function parseArgs(argv: string[]): LiveOptions {
  const options: LiveOptions = {};
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--live') { options.live = true; continue; }
    if (flag === '--help' || flag === '-h') { options.help = true; continue; }
    const field = VALUE_FLAGS[flag];
    if (!field || argv[index + 1] === undefined) throw new Error(`Unknown or incomplete option ${flag}`);
    const value = argv[++index] ?? '';
    if (field === 'models') { try { options.models = JSON.parse(value); } catch { throw new Error('--models must be a JSON object of pi, claude and codex model IDs'); } }
    else options[field] = value;
  }
  return options;
}

/** Runs the requested scenarios: the single-host trials together, or the three-host soak alone. */
export async function runLive(options: LiveOptions): Promise<TrialsSummary | SoakResult> {
  const scenarios = options.scenarios ? options.scenarios.split(',') : Object.keys(TRIALS);
  const unknown = scenarios.filter(name => !SCENARIOS.includes(name));
  if (unknown.length) throw new Error(`Unknown scenario ${unknown.join(', ')}; choose from ${SCENARIOS.join(', ')}`);
  if (scenarios.includes('soak')) {
    if (scenarios.length > 1) throw new Error('soak uses its own hosts and models; run it alone');
    return liveSoak(options);
  }
  return liveTrials({ ...options, flows: scenarios });
}

// argv[1] keeps a symlinked path while import.meta.url is the real path, so compare real paths.
const realOrSelf = (p: string): string => { try { return realpathSync(p); } catch { return resolve(p); } };
if (process.argv[1] && realOrSelf(process.argv[1]) === realOrSelf(fileURLToPath(import.meta.url))) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) { process.stdout.write(HELP); }
    else {
      const result = await runLive(options);
      console.log(JSON.stringify('cases' in result
        ? { passed: result.passed, output: result.output, elapsedMs: result.elapsedMs, cases: result.cases.map(test => ({ name: test.name, passed: test.passed })), error: result.error }
        : result, null, 2));
      process.exitCode = result.passed ? 0 : 1;
    }
  } catch (error) {
    process.stderr.write(`live.ts: ${errorMessage(error)}\nRun with --help for scenarios and options.\n`);
    process.exitCode = 2;
  }
}
