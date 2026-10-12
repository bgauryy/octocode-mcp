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
  });
});
