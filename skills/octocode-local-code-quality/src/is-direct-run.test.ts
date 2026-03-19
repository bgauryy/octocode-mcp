import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isDirectRun } from './is-direct-run.js';

describe('isDirectRun', () => {
  it('returns false when argv1 is missing', () => {
    expect(isDirectRun(pathToFileURL('/tmp/example.js').href, undefined)).toBe(false);
  });

  it('matches the current module path for absolute argv1', () => {
    const file = path.join(process.cwd(), 'scripts', 'example.js');

    expect(isDirectRun(pathToFileURL(file).href, file)).toBe(true);
  });

  it('matches the current module path for relative argv1', () => {
    const file = path.join(process.cwd(), 'scripts', 'example.js');
    const relativeFile = path.relative(process.cwd(), file);

    expect(isDirectRun(pathToFileURL(file).href, relativeFile)).toBe(true);
  });

  it('returns false for imported modules', () => {
    const file = path.join(process.cwd(), 'scripts', 'example.js');
    const differentFile = path.join(process.cwd(), 'scripts', 'other.js');

    expect(isDirectRun(pathToFileURL(file).href, differentFile)).toBe(false);
  });
});
