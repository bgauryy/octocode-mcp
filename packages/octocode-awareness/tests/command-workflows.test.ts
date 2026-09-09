import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { executeAwarenessCommand, type AwarenessCommandResult } from '../src/command-api.js';

let root: string;
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'awareness-command-flows-')));
  vi.stubEnv('OCTOCODE_HOME', join(root, 'home'));
  writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
  writeFileSync(join(root, 'b.ts'), 'export const b = 2;\n');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); });
function payload(result: AwarenessCommandResult, expected = 0): Record<string, any> {
  expect(result.exitCode, JSON.stringify(result)).toBe(expected);
  return result.payload as Record<string, any>;
}
function client(compact: boolean, agentId = 'lead') {
  return (command: string, params?: Record<string, unknown>) => executeAwarenessCommand({ command, params }, {
    database: join(root, 'awareness.sqlite3'), workspace: root, agentId, compact,
  });
}
const id = (result: Record<string, any>, kind: string): string => result[`${kind}_id`] ?? result[kind][`${kind}_id`];

describe.each([false, true])('native command workflows, compact=%s', (compact) => {
  it('delivers complete message pages, preserves reply threads and prunes only selected resolved messages', async () => {
    const call = client(compact);
    const peer = client(compact, 'peer');
    const scope = { artifact: 'parser', repo: 'owner/parser', ref: 'main' };
    payload(await call('agent register', { agent_name: 'Lead', artifact: 'parser', context: 'Review parser' }));
    payload(await peer('agent register', { artifact: 'parser' }));
    const registry = payload(await call('agent list', { artifact: 'parser', limit: 1 }));
    expect(registry.partial).toBe(true);
    const registryNext = registry.next.list.command;
    expect(payload(await call(registryNext.command, registryNext.params)).agents).toHaveLength(1);
    for (let index = 0; index < 3; index++) payload(await call('signal publish', {
      ...scope, kind: 'question', subject: `Fixture question ${index}`, body: `Can I edit fixture ${index}?`,
      to_agent: ['peer'], file: ['a.ts', 'b.ts', 'c.ts', 'd.ts'], ref_id: ['fixture:review'], importance: 8,
    }));
    const first = payload(await peer('signal list', { ...scope, kind: ['question'], limit: 1, all: true }));
    expect(first.partial).toBe(true);
    const messages = [...first.signals];
    let next = first.next?.list.command;
    while (next) {
      const page = payload(await peer(next.command, next.params));
      messages.push(...page.signals);
      next = page.next?.list.command;
    }
    expect(new Set(messages.map((message: any) => message.signal_id)).size).toBe(3);
    const signal_id = messages[0].signal_id;
    const thread_id = messages[0].thread_id;
    const read = payload(await peer('signal list', { ...scope, signal_id: [signal_id], thread_id, include_bodies: true, all: true, mark_read: true }));
    expect(read.signals[0].body).toContain('Can I edit fixture');
    payload(await peer('signal reply', { ...scope, in_reply_to: signal_id, to_agent: ['lead'], subject: 'Fixture reply', body: 'Fixture is ready', file: ['a.ts'], ref_id: ['fixture:review'], importance: 7 }));
    const reply = payload(await call('signal list', { thread_id, include_bodies: true, unread_only: true }));
    const replyRow = reply.signals.find((message: any) => message.reply_to === signal_id);
    expect(replyRow).toMatchObject({ reply_to: signal_id, thread_id, body: 'Fixture is ready' });
    payload(await peer('signal ack', { signal_id: messages.map((message: any) => message.signal_id) }));
    payload(await call('signal resolve', { thread_id }));
    payload(await call('signal prune', { artifact: 'parser', resolved: true, older_than_days: 1, dry_run: true }));
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 2 * 24 * 60 * 60 * 1000);
    payload(await call('signal prune', { signal_id: [signal_id], resolved: true, older_than_days: 1, dry_run: true }));
    expect(payload(await peer('signal list', { signal_id: [signal_id], all: true })).signals).toHaveLength(1);
    expect(payload(await call('signal prune', { signal_id: [signal_id], resolved: true, older_than_days: 1 })).deleted).toBe(0);
    const selected = { signal_id: [signal_id, replyRow.signal_id], resolved: true, older_than_days: 1 };
    expect(payload(await call('signal prune', { ...selected, dry_run: true })).would_delete).toBe(2);
    expect(payload(await call('signal prune', selected)).deleted).toBe(2);
    expect(payload(await peer('signal list', { signal_id: [signal_id], all: true })).signals).toHaveLength(0);
    const remaining = payload(await peer('signal list', { all: true })).signals;
    expect(remaining.filter((message: any) => message.kind === 'question')).toHaveLength(2);
    expect(remaining).toHaveLength(2);
  });

  it('preserves plan ownership, dependencies, failed retries and observed task completion', async () => {
    const call = client(compact);
    const peer = client(compact, 'peer');
    const plan = payload(await call('plan create', { name: 'Parser', objective: 'Verify the parser fixture', artifact: 'parser' }));
    const plan_id = id(plan, 'plan');
    expect(existsSync(plan.document ?? plan.document_path)).toBe(true);
    payload(await peer('plan join', { plan_id }));
    const docDir = join(dirname(plan.document ?? plan.document_path), 'docs');
    mkdirSync(docDir, { recursive: true });
    writeFileSync(join(docDir, 'TESTS.md'), 'Fixture verification');
    payload(await call('plan doc', { plan_id, path: 'docs/TESTS.md', title: 'Verification' }));
    payload(await call('plan status', { plan_id, status: 'ACTIVE' }));
    expect(payload(await call('plan show', { plan_id })).plan.status).toBe('ACTIVE');
    for (const full of [false, true]) expect(payload(await call('plan list', { artifact: 'parser', status: 'ACTIVE', limit: 1, full })).plans).toHaveLength(1);
    payload(await call('plan show', { plan_id: 'missing' }), 1);

    const makeTask = async (title: string, path: string[], depends_on: string[] = []) => id(payload(await call('task create', {
      plan_id, title, path, depends_on, priority: 2, reasoning: 'Exercise dependency ordering', acceptance: 'Fixture assertions pass',
    })), 'task');
    const first = await makeTask('First', ['a.ts', 'b.ts', 'c.ts', 'd.ts']);
    const second = await makeTask('Second', ['b.ts']);
    payload(await call('task depend', { task_id: second, depends_on: [first] }));
    const third = await makeTask('Third', ['c.ts'], [second]);
    for (const full of [false, true]) {
      expect(payload(await call('task list', { plan_id, full, limit: 10 })).tasks).toHaveLength(3);
      expect(payload(await call('task ready', { plan_id, full })).tasks.map((task: any) => task.task_id)).toEqual([first]);
    }
    payload(await call('task show', { task_id: 'missing' }), 1);
    payload(await peer('task claim', { task_id: second }), 1);
    let run_id = id(payload(await call('task claim', { plan_id, next: true, lease_minutes: 2, test_plan: 'Assert fixture lifecycle' })), 'run');
    payload(await peer('task claim', { task_id: first }), 2);
    payload(await call('task heartbeat', { task_id: first, run_id, lease_minutes: 3 }));
    expect(payload(await call('task list', { plan_id })).tasks.find((task: any) => task.task_id === first).claim.run_id).toBe(run_id);
    payload(await call('task release', { task_id: first, run_id, blocked_reason: 'Fixture dependency review' }));
    expect(payload(await call('task show', { task_id: first })).task.status).toBe('BLOCKED');
    payload(await call('task retry', { task_id: first, message: 'Fixture dependency reviewed' }));
    run_id = id(payload(await call('task claim', { task_id: first })), 'run');
    payload(await call('task submit', { task_id: first, run_id, message: 'Fixture ready for assertions' }));
    payload(await call('verify mark', { run_id: [run_id], status: 'FAILED', message: 'Simulated failing check fixture' }));
    payload(await call('task retry', { task_id: first }));
    for (const task_id of [first, second, third]) {
      run_id = id(payload(await call('task claim', { task_id })), 'run');
      payload(await call('task heartbeat', { task_id, run_id }));
      payload(await call('task submit', { task_id, run_id }));
      payload(await call('verify mark', { run_id: [run_id], status: 'SUCCESS', message: 'Observed fixture lifecycle assertions' }));
    }
    expect(payload(await call('task ready', { plan_id })).tasks).toEqual([]);
    payload(await call('task claim', { plan_id, next: true }), 1);
    payload(await call('plan status', { plan_id, status: 'COMPLETED' }));
    expect(payload(await call('plan show', { plan_id })).plan.status).toBe('COMPLETED');
  });

  it('keeps file work advisory, protects exclusive edits and audits the owning run', async () => {
    const call = client(compact);
    const peer = client(compact, 'peer');
    const started = payload(await call('work start', { session_id: 'session', artifact: 'parser', file: ['a.ts', 'b.ts'], rationale: 'Compare parser fixtures', test_plan: 'Assert ownership and debt', ttl_seconds: 120, context_ref: 'fixture:files' }));
    const run_id = id(started, 'run');
    payload(await call('work touch', { run_id, file: ['a.ts'], ttl_seconds: 60 }));
    for (const full of [false, true]) {
      expect(JSON.stringify(payload(await call('work list', { artifact: 'parser', full, all: true, limit: 1 })))).toContain('a.ts');
      expect(JSON.stringify(payload(await call('work show', { file: ['a.ts'], full, run_id })))).toContain('lead');
    }
    payload(await peer('lock acquire', { target_file: ['a.ts'], rationale: 'Conflicting edit', test_plan: 'Assert rejection' }), 2);
    payload(await call('work end', { run_id, file: ['a.ts'] }));
    payload(await call('work end', { run_id }));
    const debt = payload(await call('verify audit', { origin: ['WORK'], limit: 1, offset: 0 }), 1);
    expect(JSON.stringify(debt)).toContain(run_id);
    payload(await call('verify mark', { run_id: [run_id], status: 'SUCCESS', message: 'Ownership assertions passed' }));
    const exclusive = id(payload(await call('lock acquire', { target_file: ['a.ts'], artifact: 'parser', rationale: 'Sensitive fixture', test_plan: 'Assert release', ttl_minutes: 1, wait_seconds: 0, retry_interval: 1 })), 'run');
    payload(await peer('lock wait', { target_file: ['a.ts'], wait_seconds: 0 }), 2);
    payload(await call('lock release', { run_id: exclusive, target_file: ['a.ts'], status: 'PENDING' }));
    payload(await call('verify mark', { run_id: [exclusive], status: 'SUCCESS', message: 'Exclusive ownership released' }));
    payload(await call('lock wait', { target_file: ['a.ts'], wait_seconds: 0 }));
    expect(payload(await call('verify audit')).count).toBe(0);
    payload(await call('lock prune', { expired_only: true, target_file: ['a.ts'], dry_run: true, older_than_minutes: 1 }));
  });

  it('records scoped evidence, previews lifecycle changes and closes a real continuation', async () => {
    const call = client(compact);
    const scope = { artifact: 'parser', repo: 'owner/parser', ref: 'main' };
    const record = payload(await call('memory record', { ...scope, task_context: 'Parser imports', observation: 'Both fixture exports must remain present', importance: 8,
      label: 'GOTCHA', tag: ['parser'], reference: [`file:${join(root, 'a.ts')}`], file: ['a.ts', 'b.ts'], capture_fingerprint: true, failure_signature: 'parser-exports', valid_from: '2026-01-01T00:00:00Z' }));
    const memory_id = id(record, 'memory');
    for (const full of [false, true]) {
      const recalled = payload(await call('memory recall', { ...scope, query: 'fixture exports', full, label: ['GOTCHA'], tag: ['parser'], reference: [`file:${join(root, 'a.ts')}`], file: ['a.ts'], state: ['ACTIVE'], strict_scope: true, min_importance: 2, limit: 5, sort: 'importance', smart: false, explain: true, check_fingerprint: true }));
      expect(JSON.stringify(recalled)).toContain(memory_id);
    }
    for (const action of ['archive', 'restore']) {
      payload(await call(`memory ${action}`, { ...scope, memory_id: [memory_id], dry_run: true }));
      payload(await call(`memory ${action}`, { ...scope, memory_id: [memory_id] }));
    }
    payload(await call('memory forget', { ...scope, memory_id: [memory_id], tag: ['parser'], before: '2099-01-01T00:00:00Z', max_importance: 10, dry_run: true }));
    expect(JSON.stringify(payload(await call('memory recall', { query: 'fixture exports', full: true })))).toContain(memory_id);
    payload(await call('memory forget', { memory_id: [memory_id] }));
    expect(payload(await call('memory recall', { query: 'fixture exports' })).count).toBe(0);

    const refinement_id = id(payload(await call('refinement set', { ...scope, reasoning: 'Resume fixture review', remember: 'Check both exports', quality: 'handoff', state: 'open', file: ['a.ts'] })), 'refinement');
    payload(await call('refinement set', { refinement_id, state: 'ongoing', quality: 'good', reasoning: 'Review started', remember: 'Assert both files', file: ['a.ts', 'b.ts'] }));
    for (const full of [false, true]) expect(JSON.stringify(payload(await call('refinement get', { ...scope, refinement_id, state: ['ongoing'], quality: 'good', include_handoffs: true, limit: 1, offset: 0, full })))).toContain(refinement_id);
    payload(await call('refinement set', { refinement_id, state: 'done', check_receipt: 'Both fixture files were read and assertions passed' }));
    payload(await call('refinement delete', { refinement_id: [refinement_id], artifact: 'parser', dry_run: true }));
    payload(await call('refinement delete', { refinement_id: [refinement_id] }));
  });

  it('renders review and file reports through the API without stdout and previews maintenance', async () => {
    const call = client(compact);
    payload(await call('maintenance init'));
    payload(await call('maintenance self-test'));
    payload(await call('agent register', { agent_name: 'Lead', agent_vendor: 'fixture', agent_host: 'test', artifact: 'parser', context: 'Review fixture' }));
    payload(await call('reflect record', { task: 'Review parser', outcome: 'partial', worked: 'Located both exports', didnt_work: 'Missing regression', lesson: 'Exercise both exports', fix_repo: 'Add parser assertion', fix_file: ['a.ts'], fix_harness: 'Retain fixture paths', fix_instructions: 'Explain dependency coverage', failure_signature: 'coverage', judgment_note: 'Fixture evidence', importance: 8, artifact: 'parser', repo: 'owner/parser', ref: 'main', allow_similar: true }));
    for (const command of ['reflect developer-review', 'query developer-review']) {
      const params = { artifact: 'parser', query: 'parser', state: ['open'], limit: 5 };
      payload(await call(command, params));
      expect((await call(command, { ...params, format: 'markdown' })).text).toBeTruthy();
    }
    for (const command of ['query files', 'query workboard', 'query all']) {
      payload(await call(command));
      payload(await call(command, { artifact: 'parser', query: 'parser', repo: 'owner/parser', ref: 'main', state: ['open'], label: ['GOTCHA'], file: 'a.ts', since: '2026-01-01', include_bodies: true, limit: 5 }));
    }
    const report = payload(await call('query', { view: 'all', out: 'reports/awareness.md', format: 'markdown' }));
    expect(readFileSync(report.path, 'utf8')).toBeTruthy();
    payload(await call('docs staleness', { targets_json: JSON.stringify([{ docFile: 'README.md', sourceDirs: ['src'] }]), min_edits: 1, min_lines: 1, propose: true, session_id: 'fixture' }));
    payload(await call('reflect mine-weakness', { min_count: 1, limit: 5, artifact: 'parser', cwd: root }));
    payload(await call('reflect export-harness', { limit: 2, min_importance: 1, artifact: 'parser' }));
    payload(await call('status', { artifact: 'parser', limit: 5 }));
    payload(await call('session capture', { artifact: 'parser', repo: 'owner/parser', ref: 'main', reason: 'completed fixture', cwd: root }));
    payload(await call('maintenance digest', { dry_run: true, retention_days: 30, operational_retention_days: 14, pressure_age_days: 1, artifact: 'parser', fail_stale_active_runs: false }));
    payload(await call('maintenance digest', { export_doc: join(root, 'reports/memory.md') }));
    expect(existsSync(join(root, 'reports/memory.md'))).toBe(true);
    const docs = payload(await call('docs list', { full: true }));
    const shown = await call('docs show', { name: docs.docs[0].name });
    expect(shown.exitCode).toBe(0);
    expect(shown.text ?? JSON.stringify(shown.payload)).toBeTruthy();
    payload(await call('docs show', { name: 'does-not-exist' }), 1);
  });
});
