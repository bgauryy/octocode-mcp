import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setCurrentSession } from '../src/shared/home.js';
import { IMAGE_MAX_CHARS, boundImagePart } from '../src/shared/spill.js';
import { sniffImageType } from '../src/shared/vision.js';
import { pixelSize, tmp } from './helpers.js';

let saved: string | undefined;

beforeEach(() => {
  saved = process.env['OCTOCODE_HOME'];
  process.env['OCTOCODE_HOME'] = tmp();
});

afterEach(() => {
  setCurrentSession(undefined);
  if (saved === undefined) delete process.env['OCTOCODE_HOME'];
  else process.env['OCTOCODE_HOME'] = saved;
});

/**
 * An animated GIF89a of `frames` frames of `size` x `size` incompressible 256-colour pixels. The LZW stream is the
 * valid "literal codes" form (a clear code every 254 codes keeps the code width at 9 bits), so the bytes are
 * ~9/8 of the pixel count per frame and a decoder needs no compression to read them.
 */
function animatedGif(size: number, frames: number): Buffer {
  const out: number[] = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, size & 255, size >> 8, size & 255, size >> 8, 0xf7, 0, 0];
  for (let colour = 0; colour < 256; colour++) out.push(colour, 255 - colour, (colour * 7) & 255);
  out.push(0x21, 0xff, 0x0b, ...Buffer.from('NETSCAPE2.0'), 3, 1, 0, 0, 0);
  let random = 17;
  for (let frame = 0; frame < frames; frame++) {
    out.push(0x21, 0xf9, 4, 0, 10, 0, 0, 0);
    out.push(0x2c, 0, 0, 0, 0, size & 255, size >> 8, size & 255, size >> 8, 0, 8);
    const bytes: number[] = [];
    let bits = 0;
    let held = 0;
    const emit = (code: number) => {
      held |= code << bits;
      bits += 9;
      while (bits >= 8) {
        bytes.push(held & 255);
        held >>= 8;
        bits -= 8;
      }
    };
    for (let pixel = 0; pixel < size * size; pixel++) {
      if (pixel % 254 === 0) emit(256);
      random = (Math.imul(random, 1_664_525) + 1_013_904_223) >>> 0;
      emit(random >>> 24);
    }
    emit(257);
    if (bits > 0) bytes.push(held & 255);
    for (let at = 0; at < bytes.length; at += 255) {
      const block = bytes.slice(at, at + 255);
      out.push(block.length, ...block);
    }
    out.push(0);
  }
  out.push(0x3b);
  return Buffer.from(out);
}

describe('boundImagePart on an animated GIF', () => {
  const original = animatedGif(600, 2);
  const data = original.toString('base64');

  it('is a real animated GIF over the context budget', () => {
    expect(sniffImageType(original)).toBe('image/gif');
    expect(pixelSize(original)).toEqual({ width: 600, height: 600 });
    expect(original.subarray(13 + 768, 13 + 768 + 19).toString('latin1')).toContain('NETSCAPE2.0');
    expect(data.length).toBeGreaterThan(IMAGE_MAX_CHARS);
  });

  it('fits it from its first frame to the limits, says how coordinates map back, and saves the whole animated original', async () => {
    const parts = await boundImagePart({ type: 'image', data, mimeType: 'image/gif' }, 'animated', { limits: { maxWidth: 200, maxHeight: 200 } });
    const image = parts.find((part) => part.type === 'image')!;
    expect(image.mimeType).toBe('image/png');
    expect(image.data.length).toBeLessThanOrEqual(IMAGE_MAX_CHARS);
    expect(pixelSize(image.data)).toEqual({ width: 200, height: 200 });
    const note = parts.find((part) => part.type === 'text')!.text;
    expect(note).toContain('original 600x600, displayed at 200x200');
    const file = /Original saved to (\S+?\.gif)\./.exec(note)?.[1];
    expect(file, note).toBeDefined();
    expect(fs.readFileSync(file!)).toEqual(original);
  }, 30_000);

  it('replaces a GIF it cannot decode by a note naming the saved file, never dropping it silently', async () => {
    const broken = Buffer.concat([original.subarray(0, 13 + 768), Buffer.alloc(IMAGE_MAX_CHARS, 0x5a)]);
    const parts = await boundImagePart({ type: 'image', data: broken.toString('base64'), mimeType: 'image/gif' }, 'broken');
    expect(parts).toHaveLength(1);
    expect(parts[0]!.type).toBe('text');
    const text = (parts[0] as { text: string }).text;
    expect(text).toContain('image/gif');
    expect(text).toContain('left out: too large for the context');
    const file = /Saved to (\S+?\.gif)\./.exec(text)?.[1];
    expect(file, text).toBeDefined();
    expect(fs.readFileSync(file!)).toEqual(broken);
  }, 30_000);
});
