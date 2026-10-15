import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ConsoleLog } from '../src/browser/console-log.js';

const dirs: string[] = [];
const folder = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'console-log-'));
  dirs.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('the browser console log file', () => {
  it('holds every line whole, in order, with controls shown as visible escapes', () => {
    const dir = folder();
    const log = new ConsoleLog(1024, dir);
    log.append('[log] one');
    log.append('[log] \u001b[31mred\u001b[0m\nsecond row');
    log.append('[log] \u202eevil\u200b \u0000 lone\rcr crlf\r\nend');
    log.close();
    expect(fs.readFileSync(log.file!, 'utf8')).toBe('[log] one\n[log] \\u{1b}[31mred\\u{1b}[0m\nsecond row\n[log] \\u{202e}evil\\u{200b} \\u{0} lone\\rcr crlf\r\nend\n');
    expect(log.describe()).toBe(`every console line is in ${log.file}`);
  });

  it('rotates at its cap like a bash job log and says what each rotation keeps and drops', () => {
    const dir = folder();
    const log = new ConsoleLog(200, dir);
    const line = (n: number): string => `[log] line ${String(n).padStart(3, '0')} ${'x'.repeat(30)}`;
    for (let n = 1; n <= 5; n++) log.append(line(n));
    expect(log.describe()).toMatch(/capped at 200B and rotated: \S+\.1 holds the part before this file$/);
    const first = fs.readFileSync(`${log.file}.1`, 'utf8');
    expect(first.startsWith('[log] line 001')).toBe(true);
    for (let n = 6; n <= 40; n++) log.append(line(n));
    log.close();
    expect(log.describe()).toMatch(/rotated \d+ times: \S+\.1 holds the part before this file, and lines before that were dropped and cannot be recovered$/);
    // Disk use stays at two files of at most the cap; the newest line is in the current one.
    expect(fs.statSync(log.file!).size).toBeLessThanOrEqual(200);
    expect(fs.statSync(`${log.file}.1`).size).toBeLessThanOrEqual(200);
    expect(fs.readFileSync(log.file!, 'utf8')).toContain(line(40));
    expect(fs.readFileSync(log.file!, 'utf8').startsWith('[earlier console output is in ')).toBe(true);
  });

  it('says so when the file cannot be created', () => {
    const dir = folder();
    fs.rmSync(dir, { recursive: true });
    const log = new ConsoleLog(1024, dir);
    log.append('[log] lost');
    expect(log.file).toBeUndefined();
    expect(log.describe()).toMatch(/^the console log could not be created \(.*\), so dropped lines cannot be recovered$/);
  });
});
