import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { INLINE_MAX_CHARS, imagesOf, saveShot } from '../src/subagents/screenshots.js';
import { tmp } from './helpers.js';

describe('subagent screenshots', () => {
  it('finds image parts in a tool result', () => {
    expect(imagesOf({ content: [{ type: 'text', text: 'x' }, { type: 'image', data: 'AA', mimeType: 'image/jpeg' }, { type: 'image', data: 'BB' }] })).toEqual([
      { data: 'AA', mimeType: 'image/jpeg' },
      { data: 'BB', mimeType: 'image/png' },
    ]);
    expect(imagesOf({ content: 'nope' })).toEqual([]);
    expect(imagesOf(undefined)).toEqual([]);
  });

  it('saves the picture, draws small ones inline and keeps only the newest files', () => {
    const dir = path.join(tmp(), 'shots');
    const png = Buffer.from('png-bytes').toString('base64');
    const shot = saveShot(dir, 'webHeadless-1', 1, { data: png, mimeType: 'image/png' });
    expect(fs.readFileSync(shot.path).toString()).toBe('png-bytes');
    expect(shot.data).toBe(png);
    const big = saveShot(dir, 'webHeadless-1', 2, { data: 'A'.repeat(INLINE_MAX_CHARS + 4), mimeType: 'image/png' });
    expect(big.data).toBeUndefined();
    for (let i = 3; i < 45; i++) saveShot(dir, 'webHeadless-1', i, { data: png, mimeType: 'image/png' });
    expect(fs.readdirSync(dir)).toHaveLength(30);
  });

  it.skipIf(process.platform === 'win32')('keeps the folder and its pictures owner-only, even over an older world-readable file', () => {
    const dir = path.join(tmp(), 'shots');
    fs.mkdirSync(dir, { mode: 0o755 });
    fs.writeFileSync(path.join(dir, 'a-1.png'), 'old', { mode: 0o644 });
    const first = saveShot(dir, 'a', 1, { data: 'AAAA', mimeType: 'image/png' });
    const second = saveShot(dir, 'a', 2, { data: 'AAAA', mimeType: 'image/jpeg' });
    expect(fs.statSync(dir).mode & 0o777).toBe(0o700);
    expect(fs.statSync(first.path).mode & 0o777).toBe(0o600);
    expect(fs.statSync(second.path).mode & 0o777).toBe(0o600);
  });
});
