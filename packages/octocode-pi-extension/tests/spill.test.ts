import fs from 'node:fs';
import { PhotonImage } from '@silvia-odwyer/photon-node';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setCurrentSession } from '../src/shared/home.js';
import { sha256 } from '../src/shared/atomic.js';
import { IMAGE_MAX_CHARS, boundImagePart, capOutputToFile, imageExtension, saveFullOutput, saveImageFile, saveNamedContent, spillLabel } from '../src/shared/spill.js';
import { saveMessageFile, spillIntact } from '../src/team/spill.js';
import { noisyPng, pixelSize, tmp } from './helpers.js';

let home: string;
let saved: string | undefined;

beforeEach(() => {
  saved = process.env['OCTOCODE_HOME'];
  home = tmp();
  process.env['OCTOCODE_HOME'] = home;
});

afterEach(() => {
  setCurrentSession(undefined);
  if (saved === undefined) delete process.env['OCTOCODE_HOME'];
  else process.env['OCTOCODE_HOME'] = saved;
});

const manyLines = (count: number) => Array.from({ length: count }, (_, index) => `line ${index + 1}`).join('\n');
const savedPath = (text: string) => /Full output: (\S+?); search it/.exec(text)?.[1];

describe('capOutputToFile', () => {
  it('returns text within the limits unchanged and writes nothing', () => {
    const text = manyLines(100);
    expect(capOutputToFile(text, { label: 'x' })).toBe(text);
    expect(fs.existsSync(path.join(home, 'agent', 'pi', 'sessions'))).toBe(false);
  });

  it('saves over-limit text whole and previews its head and tail', () => {
    const text = manyLines(5_000);
    const out = capOutputToFile(text, { label: 'octocode/local search' });
    const file = savedPath(out)!;
    // No session yet (a unit test): a pid-named folder the sweep drops once the process is gone.
    expect(path.dirname(file)).toBe(path.join(home, 'agent', 'pi', 'sessions', `_pid-${process.pid}`, 'output'));
    expect(path.basename(file)).toMatch(/^octocode_local_search-\d+-\d+\.txt$/);
    expect(fs.readFileSync(file, 'utf8')).toBe(text);
    expect(out.startsWith('line 1\n')).toBe(true);
    expect(out).toContain('\nline 5000\n');
    expect(out).toMatch(/\[… \d+ lines omitted …\]/);
    expect(out).toMatch(/\[Output trimmed: showing \d+ of 5000 lines \(.+ of .+\)\. Full output: .+; search it or read it by line range\.\]$/);
    expect(out.split('\n').length).toBeLessThan(2_000);
  });

  it('saves into the current session folder once a session is set', () => {
    setCurrentSession('abc/1');
    const file = savedPath(capOutputToFile(manyLines(5_000), { label: 'x' }))!;
    expect(path.dirname(file)).toBe(path.join(home, 'agent', 'pi', 'sessions', 'abc_1', 'output'));
  });

  it('previews a single over-long line by bytes at both ends', () => {
    const text = `START${'y'.repeat(120_000)}END`;
    const out = capOutputToFile(text, { label: 'one' });
    expect(out.startsWith('START')).toBe(true);
    expect(out).toContain('END\n\n[Output trimmed');
    // The head and the tail are parts of the one line: the note never says it shows more lines than there are.
    expect(out).toMatch(/showing 1 of 1 lines \(/);
    expect(Buffer.byteLength(out)).toBeLessThan(52_000);
    expect(fs.readFileSync(savedPath(out)!, 'utf8')).toBe(text);
  });

  it('falls back to a head cap and says so when the folder cannot be written', () => {
    const blocker = path.join(tmp(), 'not-a-dir');
    fs.writeFileSync(blocker, '');
    process.env['OCTOCODE_HOME'] = blocker;
    const out = capOutputToFile(manyLines(5_000), { label: 'x' });
    expect(out).toContain('[Output trimmed: ');
    expect(out.endsWith('[full output could not be saved]')).toBe(true);
    expect(saveFullOutput('x', 'x')).toBeUndefined();
  });

  it('keeps labels to safe file-name characters', () => {
    expect(spillLabel('a/b c..d')).toBe('a_b_c__d');
    expect(spillLabel('')).toBe('output');
  });
});


describe('image bounds', () => {
  it('keeps a fitted visual image and the exact original bytes for a valid oversized PNG', async () => {
    const pixels = new Uint8Array(512 * 512 * 4);
    let random = 17;
    for (let index = 0; index < pixels.length; index++) {
      random = (Math.imul(random, 1_664_525) + 1_013_904_223) >>> 0;
      pixels[index] = index % 4 === 3 ? 255 : random >>> 24;
    }
    const png = new PhotonImage(pixels, 512, 512);
    const original = Buffer.from(png.get_bytes());
    png.free();
    const data = original.toString('base64');
    expect(data.length).toBeGreaterThan(IMAGE_MAX_CHARS);
    const parts = await boundImagePart({ type: 'image', data, mimeType: 'image/png' }, 'valid-shot');
    const image = parts.find((part) => part.type === 'image');
    expect(image).toBeDefined();
    expect(image!.data.length).toBeLessThanOrEqual(IMAGE_MAX_CHARS);
    const note = parts.find((part) => part.type === 'text')!;
    const file = /Original saved to (.+?)\.(?: |\])/.exec(note.text)?.[1];
    expect(file).toBeDefined();
    expect(fs.readFileSync(file!)).toEqual(original);
    expect(image!.mimeType).toBe('image/jpeg');
  }, 20_000);

  it('resizes an oversized image to the limits it is given and says how coordinates map back', async () => {
    const original = noisyPng(512);
    const data = original.toString('base64');
    const parts = await boundImagePart({ type: 'image', data, mimeType: 'image/png' }, 'limited', { limits: { maxWidth: 200, maxHeight: 100 } });
    const image = parts.find((part) => part.type === 'image')!;
    expect(pixelSize(image.data)).toEqual({ width: 100, height: 100 });
    const note = parts.find((part) => part.type === 'text')!.text;
    expect(note).toContain('original 512x512, displayed at 100x100');
    expect(note).toContain('Multiply coordinates by 5.12');
    expect(fs.readFileSync(/Original saved to (.+?)\.(?: |\])/.exec(note)![1]!)).toEqual(original);
  }, 20_000);

  it('uses an original the caller saved instead of saving it again, and a model byte limit below the default budget', async () => {
    const original = noisyPng(128);
    const data = original.toString('base64');
    expect(data.length).toBeLessThan(IMAGE_MAX_CHARS);
    expect(data.length).toBeGreaterThan(20_000);
    const kept = { type: 'image' as const, data, mimeType: 'image/png' };
    const outputDir = path.join(home, 'agent', 'pi', 'sessions', `_pid-${process.pid}`, 'output');
    expect((await boundImagePart(kept, 'fits'))[0]).toBe(kept);
    const outputFiles = () => fs.existsSync(outputDir) ? fs.readdirSync(outputDir).length : 0;
    const before = outputFiles();
    const parts = await boundImagePart(kept, 'fits', { limits: { maxWidth: 1568, maxHeight: 1568, maxBytes: 20_000 }, savedAs: '/tmp/already-saved.png' });
    const image = parts.find((part) => part.type === 'image')!;
    expect(image.data.length).toBeLessThanOrEqual(20_000);
    expect(parts.find((part) => part.type === 'text')!.text).toContain('Original saved to /tmp/already-saved.png.');
    expect(outputFiles()).toBe(before);
  }, 20_000);

  it('saves an image owner-only under the session output folder with an extension for its type', () => {
    const file = saveImageFile(Buffer.from('jpeg-bytes').toString('base64'), 'image/jpeg', 'browser screenshot')!;
    expect(path.dirname(file)).toBe(path.join(home, 'agent', 'pi', 'sessions', `_pid-${process.pid}`, 'output'));
    expect(path.basename(file)).toMatch(/^browser_screenshot-\d+-\d+\.jpg$/);
    expect(fs.readFileSync(file, 'utf8')).toBe('jpeg-bytes');
    if (process.platform !== 'win32') expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(path.extname(saveImageFile('AA', 'image/png', 'x')!)).toBe('.png');
    expect(path.extname(saveImageFile('AA', 'image/x-weird', 'x')!)).toBe('.img');
  });

  it('looks the extension up by own keys only: Object.prototype members are not image types', () => {
    for (const mime of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      expect(imageExtension(mime)).toBeUndefined();
      expect(path.extname(saveImageFile('AA', mime, 'x')!)).toBe('.img');
    }
    expect(imageExtension('image/gif')).toBe('gif');
  });

  it('passes an image within the budget through as the same object', async () => {
    const part = { type: 'image' as const, data: 'A'.repeat(IMAGE_MAX_CHARS), mimeType: 'image/png' };
    expect((await boundImagePart(part, 'x'))[0]).toBe(part);
  });

  it('replaces an invalid over-budget image by a note naming the saved full file', async () => {
    const data = 'A'.repeat(IMAGE_MAX_CHARS + 4);
    const [out] = await boundImagePart({ type: 'image', data, mimeType: 'image/png' }, 'mcp_shot');
    expect(out!.type).toBe('text');
    const file = /Saved to (\S+)\./.exec((out as { text: string }).text)?.[1];
    expect(file).toBeDefined();
    expect(fs.readFileSync(file!).length).toBe(Buffer.from(data, 'base64').length);
    expect((out as { text: string }).text).toContain('image/png');
  });
});

describe('named content files', () => {
  it('writes once under the given name, accepts the same bytes again, and refuses other bytes under a taken name', () => {
    const first = saveNamedContent('one', 'fixed.txt')!;
    expect(path.dirname(first)).toBe(path.join(home, 'agent', 'pi', 'sessions', `_pid-${process.pid}`, 'output'));
    expect(saveNamedContent('one', 'fixed.txt')).toBe(first);
    expect(saveNamedContent(Buffer.from('one'), 'fixed.txt')).toBe(first);
    expect(saveNamedContent('two', 'fixed.txt')).toBeUndefined();
    expect(fs.readFileSync(first, 'utf8')).toBe('one');
    if (process.platform !== 'win32') expect(fs.statSync(first).mode & 0o777).toBe(0o600);
  });

  it('saves a team message under its full 64-hex hash, and a recipient verifies it by that name', () => {
    const text = 'a long message\n'.repeat(500);
    const file = saveMessageFile(text)!;
    expect(path.basename(file)).toBe(`message-${sha256(text)}.txt`);
    expect(path.basename(file)).toMatch(/^message-[0-9a-f]{64}\.txt$/);
    // Saved again, the same file; a message that points at it verifies, and one whose file changed does not.
    expect(saveMessageFile(text)).toBe(file);
    const pointed = `head\n[Full message (${text.length} characters): ${file}]`;
    expect(spillIntact(pointed)).toBe(true);
    fs.writeFileSync(file, 'changed');
    expect(spillIntact(pointed)).toBe(false);
    expect(saveMessageFile(text)).toBeUndefined();
    expect(spillIntact(`head\n[Full message (3 characters): ${path.join(path.dirname(file), 'other.txt')}]`)).toBe(false);
  });
});
