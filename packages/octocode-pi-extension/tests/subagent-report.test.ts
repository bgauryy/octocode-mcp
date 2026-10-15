import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { REPORT_MAX_BYTES, ReportTracker, reportStatus } from '../src/subagents/report.js';
import { capOutput } from '../src/shared/util.js';
import { tmp } from './helpers.js';

describe('the outcome word a report starts with', () => {
  it.each([
    ['done', 'done'], ['Done. Fixed the bug.', 'done'], ['**Partial**: two of three', 'partial'], ['  \n blocked - needs a decision', 'blocked'], ['FAILED: tests red', 'failed'], ['`done`', 'done'],
  ])('reads %j as %s', (text, status) => expect(reportStatus(text)).toBe(status));

  it.each([[undefined], [''], ['Finished the work'], ['Not done yet'], ['doneness'], ['done-ish'], ['The task is done'], ['1. done']])('treats %j as unknown, never a failure', (text) => expect(reportStatus(text)).toBeUndefined());
});

describe('incremental subagent reports', () => {
  it('marks output-limit answers incomplete and accepts a later successful retry', () => {
    const report = new ReportTracker(tmp());
    report.answer('The analysis is unfinished', 'length');
    expect(report.result()).toEqual({ text: 'The analysis is unfinished', body: 'The analysis is unfinished', answered: false, error: 'Model output limit reached; the report is incomplete' });
    report.answer('Verified complete report', 'stop');
    expect(report.result()).toEqual({ text: 'Verified complete report', body: 'Verified complete report', answered: true });
  });

  it.each([
    ['multibyte bytes', 'שלום😀'.repeat(2000)],
    ['lines', 'line\n'.repeat(300)],
    ['exact byte boundary', 'x'.repeat(REPORT_MAX_BYTES)],
    ['empty first line', `\n${'x'.repeat(9000)}`],
  ])('keeps the exact whole-report preview across %s overflow and retries', (_name, first) => {
    const scratch = tmp();
    const report = new ReportTracker(scratch);
    const sections = [first];
    report.answer(first, 'stop');
    for (let i = 0; i < 5; i++) {
      report.incoming('custom');
      report.answer('superseded '.repeat(1000), 'stop');
      const next = `follow-up ${i}\nmore evidence`;
      report.answer(next, 'stop');
      sections.push(next);
      const whole = sections.join('\n\n---\n\n');
      expect(report.result().text.split('\nFull report:')[0]).toBe(capOutput(whole, REPORT_MAX_BYTES, 200));
      expect(fs.readFileSync(path.join(scratch, 'report.md'), 'utf8')).toBe(whole);
    }
  });

  it('preserves a large partial answer when a child fails before completing a report', () => {
    const scratch = tmp();
    const report = new ReportTracker(scratch);
    const partial = 'partial detail '.repeat(2000);
    report.answer(partial, 'error', 'provider failed');
    expect(report.result()).toMatchObject({ answered: false, error: 'provider failed' });
    expect(report.result().text).toContain('Full partial report:');
    // The pointer is its own field, so a caller that shortens the body keeps it.
    const { text, body, pointer } = report.result();
    expect(pointer).toMatch(/^Full partial report: .*partial-report\.md/);
    expect(text).toBe(`${body}\n${pointer}`);
    expect(Buffer.byteLength(report.result().text)).toBeLessThan(10 * 1024);
    expect(fs.readFileSync(path.join(scratch, 'partial-report.md'), 'utf8')).toBe(partial);
  });

  it('preserves all follow-ups on disk with a bounded preview', () => {
    const scratch = tmp();
    const report = new ReportTracker(scratch);
    const sections = Array.from({ length: 100 }, (_, i) => `Section ${i}: ${'detail '.repeat(2000)}`);
    for (const section of sections) {
      report.incoming('custom');
      report.answer(section, 'stop');
      expect(Buffer.byteLength(report.result().text)).toBeLessThan(10 * 1024);
    }
    expect(fs.readFileSync(path.join(scratch, 'report.md'), 'utf8')).toBe(sections.join('\n\n---\n\n'));
    // One preview of the whole report and one pointer, not a truncation notice per follow-up.
    const text = report.result().text;
    expect(text.match(/\[Output trimmed/g)).toHaveLength(1);
    expect(text.match(/Full report:/g)).toHaveLength(1);
    expect(text.startsWith('Section 0: ')).toBe(true);
  });

  it('previews the whole report after short follow-ups, counting every line, with one notice and one pointer', () => {
    const scratch = tmp();
    const report = new ReportTracker(scratch);
    report.answer('line of text\n'.repeat(1000), 'stop');
    for (let i = 0; i < 3; i++) {
      report.incoming('custom');
      report.answer(`follow-up ${i}`, 'stop');
    }
    const whole = fs.readFileSync(path.join(scratch, 'report.md'), 'utf8');
    const text = report.result().text;
    expect(text).toContain(`of ${whole.split('\n').length} lines`);
    expect(text.match(/\[Output trimmed/g)).toHaveLength(1);
    expect(text.match(/Full report:/g)).toHaveLength(1);
  });

  it('replaces a retry at its UTF-8 byte offset without keeping the superseded answer', () => {
    const scratch = tmp();
    const report = new ReportTracker(scratch);
    const first = 'שלום '.repeat(2000);
    report.answer(first, 'stop');
    report.incoming('custom');
    report.answer('obsolete '.repeat(2000), 'stop');
    report.answer('replacement', 'stop');
    expect(fs.readFileSync(path.join(scratch, 'report.md'), 'utf8')).toBe(`${first}\n\n---\n\nreplacement`);
    report.incoming('custom');
    report.answer('replacement', 'stop');
    expect(fs.readFileSync(path.join(scratch, 'report.md'), 'utf8')).toBe(`${first}\n\n---\n\nreplacement`);
  });

  it('keeps a bounded answer when scratch is unavailable and shows controls in the disk report as visible escapes', () => {
    const scratch = tmp();
    const text = `\u001b[2J${'detail '.repeat(2000)}\u202e`;
    const disk = new ReportTracker(scratch);
    disk.answer(text, 'stop');
    expect(fs.readFileSync(path.join(scratch, 'report.md'), 'utf8')).toBe(`\\u{1b}[2J${'detail '.repeat(2000)}\\u{202e}`);
    const unavailable = new ReportTracker(path.join(scratch, 'missing'));
    unavailable.answer(text, 'stop');
    expect(unavailable.result().text).not.toContain('Full report:');
    expect(Buffer.byteLength(unavailable.result().text)).toBeLessThan(9 * 1024);
  });

  it('keeps the prior report and a bounded preview when a later disk append fails', () => {
    const scratch = tmp();
    const report = new ReportTracker(scratch);
    const first = 'verified evidence\n'.repeat(1000);
    report.answer(first, 'stop');
    const append = vi.spyOn(fs, 'appendFileSync').mockImplementationOnce(() => { throw new Error('disk full'); });
    try {
      report.incoming('custom');
      report.answer('later evidence', 'stop');
      expect(fs.readFileSync(path.join(scratch, 'report.md'), 'utf8')).toBe(first);
      expect(report.result().text).toBe(capOutput(`${first}\n\n---\n\nlater evidence`, REPORT_MAX_BYTES, 200));
      expect(report.result().text).not.toContain('Full report:');
    } finally { append.mockRestore(); }
  });
});
