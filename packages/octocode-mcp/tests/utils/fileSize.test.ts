import { describe, it, expect } from 'vitest';
import {
  formatFileSize,
  parseFileSize,
} from '../../src/utils/local/utils/fileSize.js';

describe('fileSize utils', () => {
  it('formats bytes to human readable strings', () => {
    expect(formatFileSize(0)).toBe('0.0B');
    expect(formatFileSize(512)).toBe('512.0B');
    expect(formatFileSize(1024)).toBe('1.0KB');
    expect(formatFileSize(1024 * 1024)).toBe('1.0MB');
    expect(formatFileSize(1024 * 1024 * 5)).toBe('5.0MB');
  });

  it('parses human strings to bytes', () => {
    expect(parseFileSize('0')).toBe(0);
    expect(parseFileSize('512')).toBe(512);
    expect(parseFileSize('1K')).toBe(1024);
    expect(parseFileSize('1M')).toBe(1024 * 1024);
    expect(parseFileSize('5M')).toBe(5 * 1024 * 1024);
  });

  it('parses gigabytes and terabytes', () => {
    expect(parseFileSize('1G')).toBe(1024 * 1024 * 1024);
    expect(parseFileSize('2G')).toBe(2 * 1024 * 1024 * 1024);
    expect(parseFileSize('1T')).toBe(1024 * 1024 * 1024 * 1024);
  });

  it('round-trips basic sizes with supported parser units', () => {
    const pairs: Array<[number, string]> = [
      [0, '0'],
      [512, '512'],
      [1024, '1K'],
      [1024 * 1024, '1M'],
    ];
    for (const [bytes, human] of pairs) {
      expect(parseFileSize(human)).toBe(bytes);
    }
  });
});
