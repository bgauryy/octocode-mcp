import { describe, expect, it } from 'vitest';
import { DEFAULT_IMAGE_EDGE, imageLimits, sniffImageType } from '../src/shared/vision.js';
import { noisyPng } from './helpers.js';

describe('imageLimits', () => {
  it('uses the model metadata as it is, including its byte budget and jpeg quality', () => {
    expect(imageLimits({ inputLimits: { images: { resize: { maxWidth: 2576, maxHeight: 2000, maxBytes: 4_718_592, jpegQuality: 70 } } } })).toEqual({ maxWidth: 2576, maxHeight: 2000, maxBytes: 4_718_592, jpegQuality: 70 });
  });

  it('lets a side the metadata leaves out follow the other side', () => {
    expect(imageLimits({ inputLimits: { images: { resize: { maxWidth: 3000 } } } })).toEqual({ maxWidth: 3000, maxHeight: 3000 });
    expect(imageLimits({ inputLimits: { images: { resize: { maxHeight: 900 } } } })).toEqual({ maxWidth: 900, maxHeight: 900 });
  });

  it('falls back to 1568 px, under the 2000 px many-image rule, when the model says nothing about images', () => {
    const unknown = { maxWidth: DEFAULT_IMAGE_EDGE, maxHeight: DEFAULT_IMAGE_EDGE };
    expect(DEFAULT_IMAGE_EDGE).toBe(1568);
    expect(imageLimits()).toEqual(unknown);
    expect(imageLimits(null)).toEqual(unknown);
    expect(imageLimits({})).toEqual(unknown);
    expect(imageLimits({ inputLimits: { maxRequestBytes: 1 } })).toEqual(unknown);
    expect(imageLimits({ inputLimits: { images: { maxPerRequest: 100 } } })).toEqual(unknown);
    expect(imageLimits({ inputLimits: { images: { resize: { jpegQuality: 60 } } } })).toEqual({ ...unknown, jpegQuality: 60 });
  });
});

describe('sniffImageType', () => {
  it('names the format by signature and nothing else', () => {
    expect(sniffImageType(noisyPng(2))).toBe('image/png');
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe('image/jpeg');
    expect(sniffImageType(Buffer.from('GIF89a....'))).toBe('image/gif');
    expect(sniffImageType(Buffer.from('GIF87a....'))).toBe('image/gif');
    expect(sniffImageType(Buffer.from('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe('image/webp');
    expect(sniffImageType(Buffer.from('RIFF\u0000\u0000\u0000\u0000WAVEfmt '))).toBeUndefined();
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeUndefined();
    expect(sniffImageType(Buffer.from('<html>'))).toBeUndefined();
    expect(sniffImageType(Buffer.alloc(0))).toBeUndefined();
  });
});
