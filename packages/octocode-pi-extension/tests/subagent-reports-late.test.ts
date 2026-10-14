import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { pendingReportsDir, savePendingReport } from '../src/subagents/handoff.js';
import { registerAgentTool } from '../src/subagents/tool.js';
import { Team } from '../src/team/session.js';
import { fakeCtx, fakePi, fakePermission } from './fake-pi.js';
import { tmp } from './helpers.js';

describe('late background reports', () => {
  it('keeps a report that finished after its session ended, owner-only, and delivers it once at the next start of the same session', async () => {
    const dir = pendingReportsDir('session-test');
    savePendingReport(dir, 'general-late', { content: 'Background subagent general-late finished:\nLATE REPORT', details: { id: 'general-late', status: 'done', summary: 'Done' }, wake: true });
    const [file] = fs.readdirSync(dir);
    if (process.platform !== 'win32') expect(fs.statSync(path.join(dir, file!)).mode & 0o777).toBe(0o600);
    const f = fakePi();
    registerAgentTool(f.pi, () => new Map(), new Team(f.pi, { OCTOCODE_AGENT_DB: path.join(tmp(), 'team.sqlite') }), fakePermission());
    const ctx = fakeCtx({ cwd: tmp() });
    const late = () => f.sent.filter((entry) => String(entry.message.content).includes('LATE REPORT'));
    await f.emit('session_start', {}, ctx);
    await vi.waitFor(() => expect(late()).toHaveLength(1), { timeout: 5_000 });
    expect(String(late()[0]!.message.content)).toMatch(/^\(Arrived after the session restarted\) Background subagent general-late finished/);
    expect(fs.readdirSync(dir)).toEqual([]);
    await f.emit('session_start', {}, ctx);
    await new Promise((resolve) => setTimeout(resolve, 1_700));
    expect(late()).toHaveLength(1);
    // Ended: it stops looking, so the next session's reports are its own.
    await f.emit('session_shutdown', { type: 'session_shutdown', reason: 'quit' }, ctx);
  });

  it('delivers a report saved after the session started (a stop slower than the reload\'s wait), without another restart', async () => {
    const f = fakePi();
    registerAgentTool(f.pi, () => new Map(), new Team(f.pi, { OCTOCODE_AGENT_DB: path.join(tmp(), 'team.sqlite') }), fakePermission());
    const ctx = fakeCtx({ cwd: tmp() });
    await f.emit('session_start', {}, ctx);
    const dir = pendingReportsDir(ctx.sessionManager.getSessionId());
    savePendingReport(dir, 'general-slow', { content: 'Background subagent general-slow stopped by the /reload', details: { id: 'general-slow', status: 'stopped', summary: 'Stopped' }, wake: false });
    await vi.waitFor(() => expect(f.sent.some((entry) => String(entry.message.content).includes('general-slow stopped by the /reload'))).toBe(true), { timeout: 5_000 });
    // A settled turn looks too, after the window.
    savePendingReport(dir, 'general-later', { content: 'Background subagent general-later finished', details: { id: 'general-later', status: 'done', summary: 'Done' }, wake: true });
    await f.emit('agent_settled', {}, ctx);
    await vi.waitFor(() => expect(f.sent.some((entry) => String(entry.message.content).includes('general-later finished'))).toBe(true), { timeout: 5_000 });
    await f.emit('session_shutdown', { type: 'session_shutdown', reason: 'quit' }, ctx);
  }, 15_000);

  it('saves a report still waiting in the batch window when the session shuts down, for the next start', async () => {
    const dir = pendingReportsDir('session-test');
    savePendingReport(dir, 'general-queued', { content: 'Background subagent general-queued finished:\nQUEUED REPORT', details: { id: 'general-queued', status: 'done', summary: 'Done' }, wake: true });
    const [saved] = fs.readdirSync(dir);
    const f = fakePi();
    registerAgentTool(f.pi, () => new Map(), new Team(f.pi, { OCTOCODE_AGENT_DB: path.join(tmp(), 'team.sqlite') }), fakePermission());
    const ctx = fakeCtx({ cwd: tmp() });
    // Taken at the start: queued, claimed, not yet sent (the batch window is open).
    await f.emit('session_start', {}, ctx);
    expect(fs.readdirSync(dir)).not.toContain(saved);
    await f.emit('session_shutdown', { type: 'session_shutdown', reason: 'quit' }, ctx);
    expect(fs.readdirSync(dir)).toEqual([saved]);
    expect(f.sent.filter((entry) => String(entry.message.content).includes('QUEUED REPORT'))).toHaveLength(0);
  });
});
