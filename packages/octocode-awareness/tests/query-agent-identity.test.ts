import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { initDb } from '../src/db-init.js';
import { listAgents, registerAgent } from '../src/agents.js';
import { formatAwarenessQueryResult, queryAwareness } from '../src/repo-query.js';

let db: DatabaseSync;
let workspace: string;
beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'query-agent-'));
  db = new DatabaseSync(':memory:');
  initDb(db);
  registerAgent(db, { agentId: 'codex:review', agentName: 'Reviewer', agentVendor: 'openai', agentHost: 'codex', workspacePath: workspace });
  registerAgent(db, { agentId: 'pi:review', agentName: 'Reviewer', agentVendor: 'anthropic', agentHost: 'pi', workspacePath: workspace });
});
afterEach(() => { db.close(); rmSync(workspace, { recursive: true, force: true }); });

it('projects the same identities as agent list, including global peers and excluding other workspaces', () => {
  registerAgent(db, { agentId: 'global-peer', agentName: 'Global' });
  registerAgent(db, { agentId: 'outside', workspacePath: join(workspace, 'other') });
  const rows = queryAwareness(db, { view: 'agents', workspacePath: workspace }).rows;
  const identities = listAgents(db, { workspacePath: workspace }).agents;
  expect(rows).toHaveLength(3);
  for (const identity of identities) {
    expect(rows).toContainEqual(expect.objectContaining({
      agent_id: identity.agent_id, agent_name: identity.agent_name,
      agent_vendor: identity.agent_vendor, agent_host: identity.agent_host,
    }));
  }
});

it('renders routing IDs, names and vendor/host labels in every format and the all-view Markdown section', () => {
  const result = queryAwareness(db, { view: 'agents', workspacePath: workspace });
  for (const format of ['json', 'table', 'csv', 'markdown', 'html']) {
    const text = formatAwarenessQueryResult(result, format);
    for (const value of ['codex:review', 'pi:review', 'Reviewer', 'openai', 'anthropic']) {
      expect(text, `${format}: ${value}`).toContain(value);
    }
  }
  const all = formatAwarenessQueryResult(queryAwareness(db, { view: 'all', workspacePath: workspace }), 'markdown');
  expect(all).toContain('## agents (2)');
  expect(all).toContain('`codex:review` Reviewer (vendor=`openai`; host=`codex`)');
  expect(all).toContain('`pi:review` Reviewer (vendor=`anthropic`; host=`pi`)');
});

it('honors the agent filter and keeps unknown vendor/host labels unknown', () => {
  registerAgent(db, { agentId: 'openai-looking-id', agentName: 'Claude', workspacePath: workspace });
  const result = queryAwareness(db, { view: 'agents', workspacePath: workspace, agentId: 'openai-looking-id' });
  expect(result.rows).toHaveLength(1);
  expect(result.rows[0]).toMatchObject({ agent_id: 'openai-looking-id', agent_vendor: null, agent_host: null });
  expect(formatAwarenessQueryResult(result, 'markdown')).toContain('vendor=`unknown`; host=`unknown`');
});

it('renders untrusted agent labels as literal inline text without creating headings or HTML', () => {
  registerAgent(db, {
    agentId: 'peer`id', agentName: '<b>Reviewer</b>\n# Override',
    agentVendor: 'provider`one', agentHost: 'custom', workspacePath: workspace,
  });
  const text = formatAwarenessQueryResult(queryAwareness(db, { view: 'agents', workspacePath: workspace, agentId: 'peer`id' }), 'markdown');
  expect(text).toContain('``peer`id``');
  expect(text).toContain('vendor=``provider`one``');
  expect(text).not.toContain('<b>');
  expect(text).not.toContain('\n# Override');
  expect(text).toContain('Reviewer');
});
