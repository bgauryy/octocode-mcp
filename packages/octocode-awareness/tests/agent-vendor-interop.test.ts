import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openAwarenessStore } from '../src/coordination/open.js';

let root: string;
let store: ReturnType<typeof openAwarenessStore>;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'aw-vendor-'));
  vi.stubEnv('OCTOCODE_HOME', join(root, 'home'));
  for (const key of ['OCTOCODE_AGENT_ID', 'OCTOCODE_AGENT_NAME', 'OCTOCODE_AGENT_VENDOR', 'OCTOCODE_AGENT_HOST']) vi.stubEnv(key, '');
  store = openAwarenessStore({ workspace: root, dbPath: join(root, 'aw.sqlite3') });
});
afterEach(() => { store.close(); vi.unstubAllEnvs(); rmSync(root, { recursive: true, force: true }); });

function execCli(args: string[], cwd = root) {
  const result = spawnSync(process.execPath, [resolve(import.meta.dirname, '../out/octocode-awareness.js'), ...args], {
    cwd, encoding: 'utf8', timeout: 10000, env: process.env,
  });
  return { code: result.status, stdout: result.stdout, stderr: result.stderr };
}
function call(args: string[]) {
  const result = execCli([...args, '--db', store.dbPath, '--compact']);
  expect(result.code, result.stderr || result.stdout).toBe(0);
  return JSON.parse(result.stdout);
}

describe('cross-vendor agent identity', () => {
  it('discovers native and CLI peers with distinct IDs despite identical display names, then replies across vendors', () => {
    store.joinAgent({ agentId: 'pi:session-a', name: 'Reviewer', metadata: { vendor: 'anthropic', host: 'pi', task: 'audit' } });
    const registered = call(['agent', 'register', '--agent-id', 'codex:session-b', '--agent-name', 'Reviewer', '--agent-vendor', 'openai', '--agent-host', 'codex', '--workspace', root]);
    expect(registered.agent).toMatchObject({ agent_id: 'codex:session-b', agent_name: 'Reviewer', agent_vendor: 'openai', agent_host: 'codex' });
    const roster = call(['agent', 'list', '--workspace', root]);
    expect(roster.agents).toEqual(expect.arrayContaining([
      expect.objectContaining({ agent_id: 'pi:session-a', agent_name: 'Reviewer', agent_vendor: 'anthropic', agent_host: 'pi' }),
      expect.objectContaining({ agent_id: 'codex:session-b', agent_name: 'Reviewer', agent_vendor: 'openai', agent_host: 'codex' }),
    ]));
    expect(store.listAgents().find(agent => agent.agentId === 'codex:session-b')?.metadata).toMatchObject({ vendor: 'openai', host: 'codex' });
    const sent = call(['signal', 'publish', '--kind', 'request', '--agent-id', 'codex:session-b', '--workspace', root, '--to-agent', 'pi:session-a', '--subject', 'Review', '--body', 'Please review']);
    const inbox = store.listMessagesPage({ agentId: 'pi:session-a' }).messages;
    expect(inbox).toHaveLength(1);
    expect(inbox[0]?.fromAgentId).toBe('codex:session-b');
    const reply = call(['signal', 'reply', '--agent-id', 'pi:session-a', '--in-reply-to', sent.signal_id, '--subject', 'Review complete', '--body', 'Reviewed']);
    expect(reply.thread_id).toBe(sent.signal_id);
    expect(call(['signal', 'list', '--workspace', root, '--agent-id', 'codex:session-b', '--include-bodies']).signals[0]).toMatchObject({ from_agent: 'pi:session-a', body: 'Reviewed' });
  });

  it('preserves identity metadata during ordinary refreshes and keeps unknown vendors unknown', () => {
    store.joinAgent({ agentId: 'peer', name: 'Peer', metadata: { vendor: 'google', host: 'custom-host', task: 'audit' } });
    const refreshed = call(['agent', 'register', '--agent-id', 'peer', '--workspace', root]);
    expect(refreshed.agent).toMatchObject({ agent_name: 'Peer', agent_vendor: 'google', agent_host: 'custom-host' });
    expect(store.listAgents()[0]?.metadata).toMatchObject({ task: 'audit', vendor: 'google' });
    store.joinAgent({ agentId: 'peer', metadata: { vendor: 'anthropic', host: 'pi' } });
    expect(store.listAgents().find(agent => agent.agentId === 'peer')?.metadata).toMatchObject({ task: 'audit', vendor: 'anthropic', host: 'pi' });
    expect(call(['agent', 'list', '--workspace', root]).agents[0]).toMatchObject({ agent_id: 'peer', agent_name: 'Peer', agent_vendor: 'anthropic', agent_host: 'pi' });
    const unknown = call(['agent', 'register', '--agent-id', 'openai-looking-id', '--agent-name', 'Claude', '--workspace', root]);
    expect(unknown.agent).toMatchObject({ agent_vendor: null, agent_host: null });
  });

  it('uses explicit identity environment bindings without inventing a shared fallback ID', () => {
    for (const identity of [undefined, '', '   ']) {
      vi.stubEnv('OCTOCODE_AGENT_ID', identity);
      const missing = execCli(['--db', store.dbPath, 'signal', 'publish', '--workspace', root, '--subject', 'Missing identity']);
      expect(missing.code).not.toBe(0);
      expect(missing.stdout + missing.stderr).toMatch(/agent-id|OCTOCODE_AGENT_ID/);
    }
    vi.stubEnv('OCTOCODE_AGENT_ID', 'codex:env-session');
    vi.stubEnv('OCTOCODE_AGENT_NAME', 'Env reviewer');
    vi.stubEnv('OCTOCODE_AGENT_VENDOR', 'openai');
    vi.stubEnv('OCTOCODE_AGENT_HOST', 'codex');
    const result = call(['agent', 'register', '--workspace', root]);
    expect(result.agent).toMatchObject({ agent_id: 'codex:env-session', agent_name: 'Env reviewer', agent_vendor: 'openai', agent_host: 'codex' });
  });

  it('enumerates every peer through executable scoped continuations', () => {
    for (let i = 0; i < 13; i++) store.joinAgent({ agentId: `peer:${i}`, name: 'Reviewer', metadata: { vendor: i % 2 ? 'openai' : 'anthropic', host: 'pi' } });
    mkdirSync(join(root, 'other'));
    const other = openAwarenessStore({ workspace: join(root, 'other'), dbPath: store.dbPath });
    other.joinAgent({ agentId: 'outside', metadata: { vendor: 'other' } });
    other.close();
    let args = ['agent', 'list', '--workspace', root, '--limit', '3'];
    const ids: string[] = [];
    for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
      const page = call(args);
      ids.push(...page.agents.map((agent: { agent_id: string }) => agent.agent_id));
      if (!page.partial) break;
      expect(page.next.list.command.name).toBe('agent list');
      args = ['agent', 'list', ...page.next.list.command.args];
    }
    expect(new Set(ids).size).toBe(13);
    expect(ids).toHaveLength(13);
    expect(ids).not.toContain('outside');
  });

  it('rejects malformed labels and paging inputs before writing an identity', () => {
    for (const args of [
      ['agent', 'register', '--agent-id', 'bad', '--agent-vendor'],
      ['agent', 'register', '--agent-id', 'bad', '--agent-host', 'x'.repeat(129)],
      ['agent', 'list', '--offset', '-1'],
      ['agent', 'list', '--offset', '1.5'],
      ['agent', 'list', '--limit', '201'],
    ]) expect(execCli([...args, '--db', store.dbPath]).code).not.toBe(0);
    expect(store.listAgents()).toHaveLength(0);
  });

  it('replies from another working directory using an explicit shared workspace and rejects a different scope', () => {
    const schema = call(['schema', 'command', 'signal', 'reply']);
    expect(schema.properties).toHaveProperty('workspace');
    const sent = store.sendMessage({ fromAgentId: 'pi:sender', toAgentId: 'codex:reader', text: 'Review scope' });
    const replyArgs = ['signal', 'reply', '--db', store.dbPath, '--agent-id', 'codex:reader', '--in-reply-to', sent.messageId, '--subject', 'Reviewed', '--body', 'Explicit workspace'];
    const result = execCli([...replyArgs, '--workspace', root], tmpdir());
    expect(result.code, result.stderr || result.stdout).toBe(0);
    expect(JSON.parse(result.stdout).thread_id).toBe(sent.messageId);
    expect(store.listMessagesPage({ agentId: 'pi:sender' }).messages[0]).toMatchObject({ fromAgentId: 'codex:reader', text: 'Explicit workspace' });
    const wrong = execCli([...replyArgs, '--workspace', tmpdir()], tmpdir());
    expect(wrong.code).not.toBe(0);
    expect(wrong.stdout).toContain('different workspace');
  });
});
