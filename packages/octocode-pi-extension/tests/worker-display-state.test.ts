import assert from 'node:assert/strict';
import { test } from 'vitest';
import { effectiveAgentStatus } from '../src/tools/agents/display-state.js';

test('live retries supersede old handbacks and clean exits preserve blocked outcomes', () => {
  assert.equal(effectiveAgentStatus({ status: 'running', normalizedStatus: 'failed' }), 'running');
  assert.equal(effectiveAgentStatus({ status: 'idle', normalizedStatus: 'failed', pendingMessages: 1 }), 'queued');
  assert.equal(effectiveAgentStatus({ status: 'done', normalizedStatus: 'blocked' }), 'blocked');
  assert.equal(effectiveAgentStatus({ status: 'failed', normalizedStatus: 'done', pendingMessages: 1 }), 'failed');
  assert.equal(effectiveAgentStatus({ status: 'killed', normalizedStatus: 'blocked' }), 'killed');
});

test('effectiveAgentStatus gives terminal and normalized outcomes precedence over an idle process', () => {
  const entry = {
    agentId: 'worker',
    name: 'worker',
    status: 'idle',
    startedAt: '',
    updatedAt: '',
  };
  assert.equal(
    effectiveAgentStatus({ ...entry, normalizedStatus: 'done' }),
    'done'
  );
  assert.equal(
    effectiveAgentStatus({ ...entry, normalizedStatus: 'blocked' }),
    'blocked'
  );
  assert.equal(
    effectiveAgentStatus({ ...entry, normalizedStatus: 'failed' }),
    'failed'
  );
  assert.equal(
    effectiveAgentStatus({
      ...entry,
      status: 'killed',
      normalizedStatus: 'done',
    }),
    'killed'
  );
  assert.equal(
    effectiveAgentStatus({ ...entry, pendingMessages: 2 }),
    'queued'
  );
  assert.equal(
    effectiveAgentStatus({ ...entry, status: 'running', pendingMessages: 2 }),
    'running'
  );
  assert.equal(
    effectiveAgentStatus({
      ...entry,
      normalizedStatus: 'done',
      pendingMessages: 2,
    }),
    'queued'
  );
  assert.equal(
    effectiveAgentStatus({
      ...entry,
      status: 'running',
      normalizedStatus: 'blocked',
    }),
    'running'
  );
});
