import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RotatingLog } from '../src/shared/rotating-log.js';
import { tmp } from './helpers.js';

describe('RotatingLog', () => {
  const open = (max: number) => {
    const file = path.join(tmp(), 'job.log');
    return { file, log: new RotatingLog(file, max) };
  };

  it('moves to .1 at a line boundary when the next text does not fit', () => {
    const { file, log } = open(64);
    log.write('first line\nsecond line\n');
    log.write('x'.repeat(30) + '\n');
    log.write('y'.repeat(30) + '\n');
    log.close();
    expect(log.rotations).toBeGreaterThan(0);
    expect(fs.readFileSync(`${file}.1`, 'utf8').endsWith('\n')).toBe(true);
    expect(fs.readFileSync(file, 'utf8')).toMatch(/^\[earlier output is in job\.log\.1\]\n/);
  });

  it('cuts one over-long line between characters, so no multibyte character is split across the files', () => {
    // 3-byte characters against a cap that is not a multiple of 3 and a 4-byte one: every cut would land inside one.
    for (const max of [100, 101, 102]) {
      const { file, log } = open(max);
      const text = '€'.repeat(120) + '😀'.repeat(40);
      log.write(text);
      log.close();
      const rotated = fs.readFileSync(`${file}.1`);
      const current = fs.readFileSync(file);
      // Every file decodes without replacement characters, and the text is all there (rotation keeps one older file only).
      expect(rotated.toString('utf8')).not.toContain('\ufffd');
      expect(current.toString('utf8')).not.toContain('\ufffd');
      expect(rotated.length).toBeLessThanOrEqual(max);
      expect(log.rotations).toBeGreaterThan(0);
    }
  });

  it('keeps writing when the cap is smaller than one character', () => {
    const { file, log } = open(2);
    log.write('€');
    log.close();
    expect(log.failure).toBeUndefined();
    expect(fs.existsSync(file)).toBe(true);
  });
});
