import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { MEMORY_EVALUATION_CORPUS_V1 } from '../../src/memory-hardening.js';

export interface FeatureSweepCallOptions {
  expectedExit?: number;
  actionKey?: string;
  phase?: string;
}

export type FeatureSweepCall = (
  command: string,
  params?: Record<string, unknown>,
  options?: FeatureSweepCallOptions,
) => Promise<unknown>;

export interface FeatureSweepArgs {
  call: FeatureSweepCall;
  workspace: string;
  tempRoot: string;
  artifact?: string;
}

function body(result: unknown, command: string): Record<string, any> {
  assert.ok(result && typeof result === 'object', `${command}: expected an object payload`);
  return result as Record<string, any>;
}

function id(result: Record<string, any>, kind: string): string {
  const value = result[`${kind}_id`] ?? result[kind]?.[`${kind}_id`] ?? result[`${kind}Id`];
  assert.equal(typeof value, 'string', `missing ${kind} id in ${JSON.stringify(result)}`);
  return String(value);
}

/**
 * Executes the command routes that are easy to miss in a benchmark pass.
 * Every identifier is taken from the preceding response so this remains valid
 * across fresh databases and rebuilt command catalogs.
 */
export async function runCommandFeatureSweep({ call, workspace, tempRoot, artifact = 'feature-sweep' }: FeatureSweepArgs): Promise<string[]> {
  const commands: string[] = [];
  const run = async (command: string, params: Record<string, unknown> = {}, options?: FeatureSweepCallOptions) => {
    commands.push(command);
    return call(command, params, options);
  };
  const scope = { artifact, repo: 'fixture/repo', ref: 'main' };
  await run('agent register', { agent_name: 'Feature Sweep', artifact, context: 'Deterministic command feature sweep' });

  const plan = body(await run('plan create', { artifact, name: 'Feature sweep', objective: 'Exercise command routes' }), 'plan create');
  const planId = id(plan, 'plan');
  const planDocument = String(plan.document ?? plan.document_path ?? '');
  writeFileSync(join(tempRoot, '.feature-sweep-marker'), 'disposable feature sweep\n');
  writeFileSync(join(workspace, 'feature-sweep.md'), 'Feature sweep workspace fixture\n');
  const planFixture = join(dirname(planDocument), 'feature-sweep.md');
  writeFileSync(planFixture, 'Feature sweep fixture\n');
  await run('plan list', { artifact, status: 'DRAFT', limit: 10, full: true });
  await run('plan show', { plan_id: planId, full: true });
  await run('plan join', { plan_id: planId });
  await run('plan doc', { plan_id: planId, path: 'feature-sweep.md', title: 'Feature sweep fixture' });

  const task = body(await run('task create', {
    plan_id: planId, title: 'Feature sweep task', path: ['feature-sweep.md'], priority: 1,
    reasoning: 'Exercise lifecycle routes', acceptance: 'Route calls complete',
  }), 'task create');
  const taskId = id(task, 'task');
  await run('task list', { plan_id: planId, full: true, limit: 10 });
  await run('task show', { task_id: taskId, full: true });
  const claimed = body(await run('task claim', { task_id: taskId, lease_minutes: 2, test_plan: 'Run feature sweep' }), 'task claim');
  const runId = id(claimed, 'run');
  await run('task heartbeat', { task_id: taskId, run_id: runId, lease_minutes: 2 });
  await run('task release', { task_id: taskId, run_id: runId, blocked_reason: 'Feature sweep release' });
  await run('task retry', { task_id: taskId, message: 'Feature sweep retry' });
  const retried = body(await run('task claim', { task_id: taskId, lease_minutes: 2, test_plan: 'Run feature sweep after retry' }), 'task claim');
  const retriedRunId = id(retried, 'run');
  await run('task submit', { task_id: taskId, run_id: retriedRunId, message: 'Fixture is ready for verification' });

  const work = body(await run('work start', {
    artifact, session_id: 'feature-sweep', file: ['feature-sweep.md'], rationale: 'Exercise work routes',
    test_plan: 'Run feature sweep', ttl_seconds: 120,
  }), 'work start');
  const workRunId = id(work, 'run');
  await run('work show', { artifact, file: ['feature-sweep.md'], run_id: workRunId, full: true });
  await run('work end', { run_id: workRunId });

  const refinement = body(await run('refinement set', {
    ...scope, reasoning: 'Feature sweep refinement', remember: 'Route coverage', quality: 'good', state: 'open', file: ['feature-sweep.md'],
  }), 'refinement set');
  const refinementId = id(refinement, 'refinement');
  await run('refinement get', { ...scope, refinement_id: refinementId, include_handoffs: true, limit: 10, offset: 0, full: true });
  await run('refinement delete', { refinement_id: [refinementId], artifact, dry_run: true });
  await run('refinement delete', { refinement_id: [refinementId], artifact });

  const fixtureText = readFileSync(join(workspace, 'feature-sweep.md'), 'utf8');
  assert.match(fixtureText, /Feature sweep workspace fixture/);
  await run('verify mark', { run_id: [retriedRunId, workRunId], status: 'SUCCESS', message: 'Observed fixture contents and completed route sweep' });
  const audit = body(await run('verify audit'), 'verify audit');
  assert.equal(Number(audit.count ?? audit.pending ?? 0), 0);

  await run('lock wait', { target_file: ['feature-sweep.md'], wait_seconds: 0 });
  await run('lock prune', { target_file: ['feature-sweep.md'], expired_only: true, dry_run: true, older_than_minutes: 1 });
  await run('signal publish', { ...scope, kind: 'fyi', subject: 'Feature sweep signal', body: 'Disposable route fixture' });
  await run('signal prune', { artifact, resolved: true, older_than_days: 1, dry_run: true });

  await run('query files', { ...scope, limit: 10 });
  await run('query all', { ...scope, limit: 10 });
  await run('query developer-review', { ...scope, limit: 10 });
  await run('reflect developer-review', { artifact, limit: 10 });
  await run('reflect mine-weakness', { artifact, min_count: 1, limit: 5, cwd: workspace });
  await run('reflect export-harness', { artifact, limit: 5, min_importance: 1 });
  await run('agent touch', { status: 'ACTIVE' });

  const verified = body(await run('memory store-verified', {
    label: 'BUILD', text: 'Feature sweep verification receipt', source_digest: 'sha256:feature-sweep',
    scope: 'project', verified_at: '2026-09-01T00:00:00.000Z', valid_until: '2026-10-01T00:00:00.000Z', importance: 8,
  }), 'memory store-verified');
  const memoryId = id(verified, 'memory');
  for (const fixture of [
    ['BUILD', 'sqlite migration transaction', 'eval:fresh:migration'],
    ['SECURITY', 'single use permission race', 'eval:fresh:authorization'],
    ['WORKFLOW', 'resume after compact', 'eval:fresh:recovery'],
    ['RELEASE', 'release command current', 'eval:fresh:release'],
    ['RELEASE', 'release command obsolete', 'eval:stale:release'],
    ['DECISION', 'artifact decision', 'eval:artifact:decision'],
    ['DECISION', 'artifact decision', 'eval:project:decision'],
  ] as const) {
    const stale = fixture[2] === 'eval:stale:release';
    await run('memory store-verified', {
      label: fixture[0], text: fixture[1], source_digest: fixture[2], scope: fixture[2].includes('artifact') ? 'artifact' : 'project',
      ...(fixture[2].includes('artifact') ? { artifact: 'fixture-artifact' } : {}),
      verified_at: stale ? '2026-07-01T00:00:00.000Z' : '2026-08-26T00:00:00.000Z',
      valid_until: stale ? '2026-08-01T00:00:00.000Z' : '2026-09-30T00:00:00.000Z', importance: 8,
    });
  }
  await run('memory recall-verified', { query: 'feature sweep', source_digest: 'sha256:feature-sweep', scope: 'project', limit: 5, now: '2026-09-02T00:00:00.000Z' });
  const evaluation = body(await run('memory evaluate', {
    corpus_json: JSON.stringify(MEMORY_EVALUATION_CORPUS_V1),
    now: '2026-09-02T00:00:00.000Z',
  }), 'memory evaluate');
  assert.equal(Number(evaluation.aggregate?.precision), 1, 'lexical control precision should be deterministic');
  assert.equal(Number(evaluation.aggregate?.recall), 1, 'lexical control recall should be deterministic');
  await run('memory prune', { older_than: '1d', label: 'BUILD' });
  assert.ok(/^\S+$/.test(memoryId));

  await run('schema command', { noun: 'signal', subcommand: 'publish' });
  const handoff = body(await run('handoff add', { summary: 'Feature sweep handoff', file: ['feature-sweep.md'] }), 'handoff add');
  const handoffId = id(handoff, 'handoff');
  await run('handoff list', { include_cleared: false });
  await run('handoff clear', { handoff_id: handoffId });
  await run('handoff list', { include_cleared: true });
  await run('agent leave');

  return commands;
}
