import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pendingReportsDir, savePendingReport, type Report } from '../src/subagents/handoff.js';
import { LateReports } from '../src/subagents/late.js';

const stops: Array<() => void> = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const stop of stops.splice(0)) stop();
});

const report = (id: string): Report => ({ content: `Background subagent ${id} finished`, details: { id, status: 'done', summary: 'Done' }, wake: false });
let sessions = 0;

/** A started `LateReports` over an empty pending folder, with the reports it handed to the queue. */
async function started() {
  const added: Report[] = [];
  const runs = { reports: { pendingDir: undefined as string | undefined, add: (taken: Report) => void added.push(taken) } };
  const reports = new LateReports(runs as never);
  const sessionId = `late-poll-${process.pid}-${++sessions}`;
  await reports.start(sessionId);
  stops.push(() => reports.stop());
  return { reports, added, dir: pendingReportsDir(sessionId) };
}

describe('the late-report poll', () => {
  it('reads the pending folder with async calls only, so a poll never blocks the event loop on the disk', async () => {
    const { reports, added, dir } = await started();
    savePendingReport(dir, 'general-a', report('general-a'));
    savePendingReport(dir, 'general-b', report('general-b'));
    const spies = (['readdirSync', 'readFileSync', 'renameSync', 'rmSync', 'statSync', 'existsSync'] as const).map((name) => vi.spyOn(fs, name));
    await reports.take();
    const touching = spies.flatMap((spy) => spy.mock.calls.filter((call) => String(call[0]).startsWith(dir)));
    expect(touching).toEqual([]);
    expect(added.map((taken) => taken.details.id).sort()).toEqual(['general-a', 'general-b']);
  });

  it('hands over a report once when polls overlap', async () => {
    const { reports, added, dir } = await started();
    savePendingReport(dir, 'general-a', report('general-a'));
    await Promise.all(Array.from({ length: 5 }, () => reports.take()));
    expect(added).toHaveLength(1);
  });

  it('looks at nothing after it stops', async () => {
    const { reports, added, dir } = await started();
    reports.stop();
    savePendingReport(dir, 'general-a', report('general-a'));
    await reports.take();
    expect(added).toEqual([]);
    expect(fs.readdirSync(dir)).toHaveLength(1);
  });
});
