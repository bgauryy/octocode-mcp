import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { getDirectorySizeBytes, formatBytes } from '../src/fs-utils.js';

const testDir = join(tmpdir(), 'octocode-shared-fs-utils-test');

afterEach(() => {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    // ignore
  }
});

describe('getDirectorySizeBytes', () => {
  it('returns 0 for non-existent path', () => {
    expect(getDirectorySizeBytes('/non/existent/path')).toBe(0);
  });

  it('returns 0 for empty directory', () => {
    mkdirSync(testDir, { recursive: true });
    expect(getDirectorySizeBytes(testDir)).toBe(0);
  });

  it('sums file sizes in flat directory', () => {
    mkdirSync(testDir, { recursive: true });
    writeFileSync(join(testDir, 'a.txt'), 'hello'); // 5 bytes
    writeFileSync(join(testDir, 'b.txt'), 'world!'); // 6 bytes
    expect(getDirectorySizeBytes(testDir)).toBe(11);
  });

  it('recurses into nested directories', () => {
    const nested = join(testDir, 'sub', 'deep');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(testDir, 'root.txt'), 'abc'); // 3 bytes
    writeFileSync(join(nested, 'deep.txt'), 'defgh'); // 5 bytes
    expect(getDirectorySizeBytes(testDir)).toBe(8);
  });
});

describe('formatBytes', () => {
  it('formats bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
  });

  it('formats gigabytes', () => {
    expect(formatBytes(2 * 1024 * 1024 * 1024)).toBe('2.00 GB');
  });
});
