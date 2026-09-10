import assert from 'node:assert/strict';
import { test } from 'vitest';
import { getAwarenessCommandDescriptor } from '@octocodeai/octocode-awareness';
import { compileMcpSchemaValidator } from '../src/tools/mcp/schema-validator.js';
import { nativeContinuations } from '../src/tools/awareness-continuations.js';

const reservedParams = new Set(['db', 'database', 'workspace', 'agent_id', 'lead_agent_id', 'compact']);

test('projects verified-memory history evidence into a schema-valid native continuation', () => {
  const payload = {
    memories: [{
      memoryId: 'mem-1',
      historyEvidence: {
        state: 'incomplete',
        reason: 'capture is incomplete',
        next: {
          cursor: 'opaque-cursor',
          call: {
            command: 'history inspect',
            params: {
              operation_id: 'op-1',
              source_workspace: '/tmp/source-worktree',
              workspace: '/tmp/host-workspace',
              database: '/tmp/host.sqlite3',
              compact: true,
            },
          },
        },
      },
    }],
  };

  const projected = nativeContinuations(payload, reservedParams, 'memory recall-verified') as typeof payload;
  const next = projected.memories[0]!.historyEvidence.next as unknown as {
    cursor: string;
    call: {
      tool: string;
      queries: Array<{ action: string; command: string; params: Record<string, unknown> }>;
    };
  };
  const continuation = next.call;
  assert.equal(next.cursor, 'opaque-cursor');
  assert.equal(continuation.tool, 'awareness');
  assert.equal(continuation.queries[0]!.action, 'call');
  assert.equal(continuation.queries[0]!.command, 'history inspect');
  assert.deepEqual(continuation.queries[0]!.params, {
    operation_id: 'op-1',
    source_workspace: '/tmp/source-worktree',
  });

  const descriptor = getAwarenessCommandDescriptor('history inspect');
  assert.ok(descriptor);
  const schema = structuredClone(descriptor.inputSchema) as Record<string, unknown>;
  const properties = schema.properties as Record<string, unknown>;
  delete properties.workspace;
  schema.required = ['operation_id'];
  assert.equal(compileMcpSchemaValidator(schema).validate(continuation.queries[0]!.params).valid, true);
});

test('keeps peer-shaped and unknown command content opaque', () => {
  const peerContent = {
    text: 'peer payload',
    data: { command: 'history inspect', params: { workspace: '/peer' } },
    unknown: {
      next: { call: { command: 'peer.command', params: { workspace: '/peer' } } },
    },
  };
  const payload = {
    memories: [{
      historyEvidence: { next: { call: { command: 'peer.command', params: { workspace: '/peer' } } } },
      peerContent,
    }],
  };
  const projected = nativeContinuations(payload, reservedParams, 'memory recall-verified');
  assert.deepEqual(projected, payload);
});

test('does not project nested memories for other commands', () => {
  const payload = {
    memories: [{ historyEvidence: { next: { call: { command: 'history inspect', params: { operation_id: 'op-1' } } } } }],
  };
  assert.deepEqual(nativeContinuations(payload, reservedParams, 'memory recall'), payload);
});

test('keeps restore undo previews executable without promoting peer payloads', () => {
  const payload = { undo_preview: { command: 'history restore-preview', params: {
    workspace: '/host', agent_id: 'actor', operation_id: 'undo-1', side: 'after',
  } } };
  const projected = nativeContinuations(payload, reservedParams, 'history restore-apply') as {
    undo_preview: { tool: string; queries: Array<{ command: string; params: Record<string, unknown> }> };
  };
  assert.equal(projected.undo_preview.tool, 'awareness');
  assert.deepEqual(projected.undo_preview.queries[0].params, { operation_id: 'undo-1', side: 'after' });
  assert.equal(projected.undo_preview.queries[0].command, 'history restore-preview');
  assert.deepEqual(nativeContinuations(payload, reservedParams, 'signal list'), payload);
});
