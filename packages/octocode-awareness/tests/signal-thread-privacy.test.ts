import { describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { initDb } from '../src/db-init.js';
import { agentSignal } from '../src/notifications-signals.js';
import { getNotifications } from '../src/notifications-inbox.js';
import { attendAwareness } from '../src/attend-query.js';

function freshDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  initDb(db);
  return db;
}

describe('signal thread privacy', () => {
  it('does not let an outsider read, join, or resolve a targeted thread', () => {
    const db = freshDb();
    const published = agentSignal(db, {
      action: 'publish',
      agentId: 'sender',
      toAgents: ['recipient'],
      kind: 'question',
      subject: 'private question',
      body: 'PRIVATE_BODY',
      workspacePath: '/repo',
    });
    if (published.action !== 'publish') throw new Error('publish failed');

    const outsiderRead = getNotifications(db, {
      agentId: 'outsider',
      threadId: published.thread_id,
      workspacePath: '/repo',
      unreadOnly: false,
      markRead: true,
    });
    expect(outsiderRead.signals).toEqual([]);
    expect(db.prepare('SELECT COUNT(*) AS count FROM signal_reads WHERE agent_id = ?')
      .get('outsider')).toEqual({ count: 0 });

    expect(() => agentSignal(db, {
      action: 'reply',
      agentId: 'outsider',
      toAgents: ['sender'],
      subject: 'intrusion',
      inReplyTo: published.signal_id,
      workspacePath: '/repo',
    })).toThrow(/not a participant/);

    const outsiderResolve = agentSignal(db, {
      action: 'resolve',
      agentId: 'outsider',
      threadId: published.thread_id,
      workspacePath: '/repo',
    });
    expect(outsiderResolve).toMatchObject({ action: 'resolve', resolved: 0, signal_ids: [] });

    const recipientRead = getNotifications(db, {
      agentId: 'recipient',
      threadId: published.thread_id,
      workspacePath: '/repo',
      unreadOnly: false,
    });
    expect(recipientRead.signals.map((signal) => signal.body)).toEqual(['PRIVATE_BODY']);
  });

  it('keeps broadcast threads joinable but requires participation before resolve', () => {
    const db = freshDb();
    const published = agentSignal(db, {
      action: 'publish',
      agentId: 'sender',
      kind: 'fyi',
      subject: 'public note',
      body: 'PUBLIC_BODY',
      workspacePath: '/repo',
    });
    if (published.action !== 'publish') throw new Error('publish failed');

    const beforeRead = agentSignal(db, {
      action: 'resolve',
      agentId: 'reader',
      threadId: published.thread_id,
      workspacePath: '/repo',
    });
    expect(beforeRead).toMatchObject({ action: 'resolve', resolved: 0 });

    const joined = getNotifications(db, {
      agentId: 'reader',
      threadId: published.thread_id,
      workspacePath: '/repo',
      unreadOnly: false,
      markRead: true,
    });
    expect(joined.signals).toHaveLength(1);

    const reply = agentSignal(db, {
      action: 'reply',
      agentId: 'reader',
      subject: 'joined',
      inReplyTo: published.signal_id,
      workspacePath: '/repo',
    });
    expect(reply).toMatchObject({ action: 'reply', thread_id: published.thread_id });

    const resolved = agentSignal(db, {
      action: 'resolve',
      agentId: 'reader',
      threadId: published.thread_id,
      workspacePath: '/repo',
    });
    expect(resolved).toMatchObject({ action: 'resolve', resolved: 2 });
  });

  it('keeps targeted signals out of another agent attend snapshots while retaining peer verification work', () => {
    const db = freshDb();
    const workspace = '/repo';
    agentSignal(db, {
      action: 'publish', agentId: 'sender', toAgents: ['recipient'], kind: 'question',
      subject: 'private question', body: 'PRIVATE_BODY', workspacePath: workspace,
    });
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO task_runs
      (run_id, origin, agent_id, rationale, test_plan, status, workspace_path, created_at, updated_at)
      VALUES ('peer-run', 'WORK', 'peer', 'peer verification', 'run checks', 'PENDING', ?, ?, ?)`)
      .run(workspace, now, now);

    const outsider = attendAwareness(db, { workspacePath: workspace, agentId: 'outsider', compact: true });
    expect(outsider.workboard.Inbox ?? []).toEqual([]);
    expect(outsider.counts?.Inbox).toBe(0);
    expect(outsider.workboard.Verify?.map(row => row['id'])).toContain('peer-run');
    expect(JSON.stringify(outsider)).not.toContain('private question');

    agentSignal(db, {
      action: 'publish', agentId: 'sender', toAgents: ['recipient'], kind: 'question',
      subject: 'private follow-up', body: 'PRIVATE_FOLLOW_UP', workspacePath: workspace,
    });
    const unchanged = attendAwareness(db, {
      workspacePath: workspace, agentId: 'outsider', compact: true, revision: outsider.revision,
    });
    expect(unchanged).toMatchObject({ unchanged: true, revision: outsider.revision });
    expect(JSON.stringify(unchanged)).not.toContain('private follow-up');

    const recipient = attendAwareness(db, { workspacePath: workspace, agentId: 'recipient', compact: true });
    expect(recipient.workboard.Inbox).toHaveLength(1);
    expect(recipient.counts?.Inbox).toBe(2);
  });
});
