import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveMessageFile, spillIntact } from '../src/team/spill.js';

afterEach(() => vi.restoreAllMocks());

const TEXT = 'a long message\n'.repeat(500);
const pointer = (file: string) => `head\n[Full message (${TEXT.length} characters): ${file}]`;
const LATER = Date.now() + 60_000;

describe('spillIntact reads and hashes a message file once while the file is unchanged', () => {
  it('serves repeated checks of one file from its first verdict', () => {
    const file = saveMessageFile(`${TEXT}${Math.random()}`)!;
    const read = vi.spyOn(fs, 'readFileSync');
    for (let i = 0; i < 10; i++) expect(spillIntact(pointer(file), LATER)).toBe(true);
    expect(read.mock.calls.filter(([target]) => target === file)).toHaveLength(1);
  });

  it('reads again, and refuses, once the file changed (even to text of the same length)', async () => {
    const content = `${TEXT}${Math.random()}`;
    const file = saveMessageFile(content)!;
    expect(spillIntact(pointer(file), LATER)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 25));
    fs.writeFileSync(file, 'x'.repeat(content.length));
    expect(spillIntact(pointer(file), LATER)).toBe(false);
    expect(spillIntact(pointer(file), LATER)).toBe(false);
  });

  it('does not trust a file written moments ago: a second write in the same timestamp tick could go unseen', () => {
    const file = saveMessageFile(`${TEXT}${Math.random()}`)!;
    const read = vi.spyOn(fs, 'readFileSync');
    const now = Date.now();
    for (let i = 0; i < 3; i++) expect(spillIntact(pointer(file), now)).toBe(true);
    expect(read.mock.calls.filter(([target]) => target === file)).toHaveLength(3);
  });

  it('never remembers a refusal: a missing file is read for again', () => {
    const file = saveMessageFile(`${TEXT}${Math.random()}`)!;
    fs.rmSync(file);
    expect(spillIntact(pointer(file), LATER)).toBe(false);
    fs.writeFileSync(file, 'changed');
    expect(spillIntact(pointer(file), LATER)).toBe(false);
  });
});
