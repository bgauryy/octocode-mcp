import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openAwarenessStore } from '../src/coordination/open.js';

let root: string;
let store: ReturnType<typeof openAwarenessStore>;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'aw-cli-api-'));
  store = openAwarenessStore({ workspace: root, dbPath: join(root, 'aw.sqlite3') });
});
afterEach(() => { store.close(); rmSync(root, { recursive: true, force: true }); });

function cli(args: string[]) {
  const result = spawnSync(process.execPath, [resolve(import.meta.dirname, '../out/octocode-awareness.js'), '--db', store.dbPath, ...args], {
    cwd: root, encoding: 'utf8', timeout: 10000,
    env: { ...process.env, OCTOCODE_HOME: join(root, 'home') },
  });
  expect(result.status, result.stderr || result.stdout).toBe(0);
  return JSON.parse(result.stdout);
}

describe('shared database CLI and embedded host communication', () => {
  it('returns the read receipt when acknowledging a message beyond the inbox preview', () => {
    for (let index = 0; index < 101; index++) {
      store.sendMessage({ fromAgentId: 'sender', toAgentId: 'reader', text: `message ${index}` });
    }
    const preview = store.listMessagesPage({ agentId: 'reader', limit: 100 });
    const oldest = store.listMessagesPage(preview.next!.list.params).messages[0]!;
    const receipt = store.markMessageRead({ messageId: oldest.messageId, agentId: 'reader' });
    expect(receipt.readAt).toEqual(expect.any(String));
    expect(store.countMessages({ agentId: 'reader' })).toBe(100);
    expect(cli(['signal', 'list', '--workspace', root, '--agent-id', 'reader', '--signal-id', oldest.messageId]).signals).toHaveLength(0);
  });

  it('delivers API messages to CLI recipients and CLI replies back to the API with durable acknowledgements', () => {
    const sent = store.sendMessage({ fromAgentId: 'pi', toAgentId: 'cli-agent', topic: 'review', text: 'Please check parser.ts', files: ['parser.ts'] });
    const inbox = cli(['signal', 'list', '--workspace', root, '--agent-id', 'cli-agent', '--include-bodies']);
    expect(inbox.signals.map((row: { signal_id: string }) => row.signal_id)).toEqual([sent.messageId]);
    expect(inbox.signals[0]).toMatchObject({ from_agent: 'pi', body: 'Please check parser.ts' });
    expect(cli(['signal', 'list', '--workspace', root, '--agent-id', 'unrelated']).signals).toHaveLength(0);
    expect(cli(['signal', 'ack', '--agent-id', 'unrelated', '--signal-id', sent.messageId]).acknowledged).toBe(0);
    expect(store.countMessages({ agentId: 'cli-agent' })).toBe(1);
    expect(cli(['signal', 'ack', '--agent-id', 'cli-agent', '--signal-id', sent.messageId]).acknowledged).toBe(1);
    expect(store.countMessages({ agentId: 'cli-agent' })).toBe(0);
    const reply = cli(['signal', 'reply', '--agent-id', 'cli-agent', '--in-reply-to', sent.messageId, '--subject', 'Parser reviewed', '--body', 'Tests passed; see receipt']);
    expect(reply.thread_id).toBe(sent.messageId);
    const received = store.listMessagesPage({ agentId: 'pi' }).messages;
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ messageId: reply.signal_id, fromAgentId: 'cli-agent', toAgentId: 'pi', text: 'Tests passed; see receipt' });
    store.markMessageRead({ messageId: reply.signal_id, agentId: 'pi' });
    expect(cli(['signal', 'list', '--workspace', root, '--agent-id', 'pi']).signals).toHaveLength(0);
  });

  it('keeps workspaces separate and follows CLI and API continuations without losing messages', () => {
    const otherWorkspace = join(root, 'other');
    mkdirSync(otherWorkspace);
    const other = openAwarenessStore({ workspace: otherWorkspace, dbPath: store.dbPath });
    try {
      other.sendMessage({ fromAgentId: 'peer', toAgentId: 'reader', text: 'other workspace' });
    } finally { other.close(); }
    const ids = Array.from({ length: 5 }, (_, index) => cli(['signal', 'publish', '--workspace', root, '--agent-id', 'writer', '--to-agent', 'reader', '--subject', `row ${index}`, '--body', `body ${index}`]).signal_id as string);
    const apiIds: string[] = [];
    let request: Parameters<typeof store.listMessagesPage>[0] = { agentId: 'reader', limit: 2 };
    for (;;) {
      const page = store.listMessagesPage(request);
      apiIds.push(...page.messages.map(message => message.messageId));
      if (!page.partial) break;
      request = page.next!.list.params;
    }
    expect(apiIds.sort()).toEqual([...ids].sort());
    let args = ['signal', 'list', '--workspace', root, '--agent-id', 'reader', '--limit', '2', '--mark-read', '--include-bodies'];
    const cliIds: string[] = [];
    for (;;) {
      const page = cli(args);
      cliIds.push(...page.signals.map((signal: { signal_id: string }) => signal.signal_id));
      if (!page.partial) break;
      expect(page.next.list.command.name).toBe('signal list');
      args = ['signal', 'list', ...page.next.list.command.args];
    }
    expect(cliIds.sort()).toEqual([...ids].sort());
    expect(store.countMessages({ agentId: 'reader' })).toBe(0);
  });
});
