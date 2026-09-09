import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { initDb } from '../../src/db-init.js';
import { registerAgent, listAgents } from '../../src/agents.js';
import { agentSignal } from '../../src/notifications-signals.js';
import { getNotifications } from '../../src/notifications-inbox.js';
import { insertMemory } from '../../src/memory-write.js';
import { getMemory } from '../../src/memory-recall.js';
import { normalizeWorkspacePath, repositoryWorkspacePaths } from '../../src/git.js';
import { agentRows, signalRows } from '../../src/repo-coordination.js';
import { memoryRows } from '../../src/repo-plans.js';
import { openAwarenessStore } from '../../src/coordination/open.js';
import { createAwarenessEventConsumer } from '../../src/event-consumer.js';

/** Real Git worktrees and real SQLite; also runnable when the test runner is unavailable. */
export async function gitCoordinationScenario(): Promise<void> {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'awareness-git-coordination-')));
  const main = join(base, 'main');
  const peer = join(base, 'peer with spaces\nand newline');
  const other = join(base, 'unrelated');
  const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
  const db = new DatabaseSync(':memory:');
  try {
    mkdirSync(main);
    git(main, 'init', '-q', '-b', 'main');
    git(main, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '--allow-empty', '-qm', 'seed');
    git(main, 'worktree', 'add', '-qb', 'peer', peer);
    git(base, 'clone', '-q', main, other);
    const inheritedGitDir = process.env.GIT_DIR;
    process.env.GIT_DIR = join(other, '.git');
    try {
      assert.deepEqual(repositoryWorkspacePaths(peer), [main, peer], 'host Git overrides cannot redirect discovery');
    } finally {
      if (inheritedGitDir === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = inheritedGitDir;
    }
    mkdirSync(join(main, 'src'));
    mkdirSync(join(peer, 'src'));
    writeFileSync(join(main, 'src/auth.ts'), 'export const secure = true;');
    writeFileSync(join(peer, 'src/auth.ts'), 'export const secure = false;');
    const before = git(main, 'status', '--porcelain=v1');
    initDb(db);
    registerAgent(db, { agentId: 'main-agent', workspacePath: main });
    registerAgent(db, { agentId: 'peer-agent', workspacePath: peer });
    registerAgent(db, { agentId: 'other-agent', workspacePath: other });
    assert.deepEqual(listAgents(db, { workspacePath: peer }).agents.map(a => a.agent_id).sort(),
      ['main-agent', 'peer-agent'], 'linked worktree peers must discover each other without including clones');
    assert.equal(agentRows(db, { workspacePath: peer }).length, 2, 'detailed peer views use the same membership');
    assert.equal(normalizeWorkspacePath(peer, peer), peer, 'physical workspaces must remain distinct for locks and history');

    const message = agentSignal(db, { action: 'publish', agentId: 'main-agent', toAgents: ['peer-agent'],
      kind: 'question', subject: 'auth contract', body: 'Check the auth precondition', workspacePath: main });
    if (message.action !== 'publish') throw new Error('expected publication');
    assert.equal(getNotifications(db, { agentId: 'peer-agent', workspacePath: peer }).signals[0]?.signal_id, message.signal_id);
    assert.equal(signalRows(db, { workspacePath: peer, agentId: 'peer-agent' }).length, 1);
    assert.equal(getNotifications(db, { agentId: 'outsider', workspacePath: peer, threadId: message.thread_id }).count, 0);
    assert.equal(getNotifications(db, { agentId: 'peer-agent', workspacePath: other }).count, 0);
    assert.equal(getNotifications(db, { agentId: 'peer-agent', workspacePath: peer, ref: 'peer' }).count, 0,
      'explicit branch filters still apply');
    const reply = agentSignal(db, { action: 'reply', agentId: 'peer-agent', workspacePath: peer,
      subject: 'contract checked', inReplyTo: message.signal_id });
    assert.equal(reply.action, 'reply');
    const ack = agentSignal(db, { action: 'ack', agentId: 'peer-agent', workspacePath: peer, signalIds: [message.signal_id] });
    assert.equal(ack.action === 'ack' && ack.acknowledged, 1);
    const closed = agentSignal(db, { action: 'resolve', agentId: 'main-agent', workspacePath: main, threadId: message.thread_id });
    assert.equal(closed.action === 'resolve' && closed.resolved, 2, 'one resolution must cover both worktrees');

    const memory = insertMemory(db, { agentId: 'main-agent', workspacePath: main, taskContext: 'auth contract',
      observation: 'Check the auth precondition before making changes', label: 'GOTCHA', importance: 8,
      references: [`file:${join(main, 'src/auth.ts')}`] });
    assert.ok(getMemory(db, { workspacePath: peer, files: ['src/auth.ts'] }).memories.some(m => m.memory_id === memory.memoryId),
      'file knowledge must be discoverable from a sibling worktree');
    assert.equal(memoryRows(db, { workspacePath: peer, file: 'src/auth.ts' }).length, 1);
    assert.equal(getMemory(db, { workspacePath: other, files: ['src/auth.ts'] }).memories.length, 0);
    assert.equal(getMemory(db, { workspacePath: peer, strictScope: true }).memories.length, 0);

    const dbPath = join(base, 'native.sqlite3');
    const mainStore = openAwarenessStore({ workspace: main, dbPath });
    const peerStore = openAwarenessStore({ workspace: peer, dbPath });
    try {
      mainStore.joinAgent({ agentId: 'main-agent' });
      peerStore.joinAgent({ agentId: 'peer-agent' });
      assert.deepEqual(peerStore.listAgents().map(a => a.agentId).sort(), ['main-agent', 'peer-agent']);
      const sharedMemory = mainStore.storeMemory({ label: 'GOTCHA', text: 'Auth contract requires checking preconditions' });
      assert.ok(peerStore.recallMemory({ query: 'Auth contract' }).some(m => m.memoryId === sharedMemory.memoryId));
      const messages = Array.from({ length: 3 }, (_, n) => mainStore.sendMessage({
        fromAgentId: 'main-agent', toAgentId: 'peer-agent', text: `native question ${n}`,
      }));
      const received = new Set<string>();
      let page = peerStore.listMessagesPage({ agentId: 'peer-agent', limit: 1 });
      for (;;) {
        for (const item of page.messages) received.add(item.messageId);
        if (!page.next) break;
        page = peerStore[page.next.list.method](page.next.list.params);
      }
      assert.deepEqual(received, new Set(messages.map(m => m.messageId)), 'native continuations cover all sibling messages');
      const localOnly = mainStore.createHarnessEvent({ type: 'internal.test', aggregateKind: 'test', aggregateId: 'local', payload: {} });
      mainStore.appendEvent(localOnly);
      assert.ok(!peerStore.listEvents({ consumerId: 'peer-consumer' }).some(e => e.eventId === localOnly.eventId));
      let deliveries = 0;
      const consumer = createAwarenessEventConsumer({ workspace: peer, consumerId: 'peer-consumer', expectedAgentId: 'peer-agent',
        openStore: workspace => openAwarenessStore({ workspace, dbPath }), deliver: async () => { deliveries++; } });
      const drained = await consumer.drain();
      assert.equal(drained.drainErrors, 0);
      assert.equal(deliveries, 3, 'native event delivery reaches the sibling worktree');
      await consumer.drain();
      assert.equal(deliveries, 3, 'native event acknowledgements suppress repeats');
      assert.equal(peerStore.countMessages({ agentId: 'peer-agent' }), 0, 'delivery marks the canonical messages read');
      const firstLock = mainStore.acquireLock({ filePath: 'src/auth.ts', agentId: 'main-agent', reason: 'contract', testPlan: 'test auth' });
      const otherLock = peerStore.acquireLock({ filePath: 'src/auth.ts', agentId: 'peer-agent', reason: 'contract', testPlan: 'test auth' });
      assert.notEqual(firstLock.filePath, otherLock.filePath);
      assert.throws(() => mainStore.acquireLock({ filePath: 'src/auth.ts', agentId: 'peer-agent', reason: 'conflict', testPlan: 'test auth' }), /conflict/);
      mainStore.releaseLock({ filePath: 'src/auth.ts', agentId: 'main-agent', runId: firstLock.runId });
      peerStore.releaseLock({ filePath: 'src/auth.ts', agentId: 'peer-agent', runId: otherLock.runId });
    } finally {
      peerStore.close();
      mainStore.close();
    }
    assert.equal(git(main, 'status', '--porcelain=v1'), before, 'coordination must not edit the project index or files');
  } finally {
    db.close();
    rmSync(base, { recursive: true, force: true });
  }
}
