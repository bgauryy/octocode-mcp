import { describe, expect, it } from 'vitest';

import { processFileContentAPI } from '../../src/github/fileContentProcess.js';

// Plain-ish source so "standard" minify visibly alters it (strips the
// comment) while remaining valid JS for the assertions below.
const SRC = '// license header\nfunction add(a, b) {\n  return a + b;\n}\n';

describe('ghGetFileContent — contentView is always surfaced', () => {
  it('minify:"none" reports contentView:"none"', async () => {
    const out = await processFileContentAPI(
      SRC,
      'octo',
      'engine',
      'main',
      'src/add.js',
      true,
      undefined,
      undefined,
      5,
      undefined,
      undefined,
      undefined,
      'none'
    );
    expect(out.contentView).toBe('none');
  });

  it('explicit minify:"standard" reports contentView:"standard", not silently omitted', async () => {
    const out = await processFileContentAPI(
      SRC,
      'octo',
      'engine',
      'main',
      'src/add.js',
      true,
      undefined,
      undefined,
      5,
      undefined,
      undefined,
      undefined,
      'standard'
    );
    expect(out.contentView).toBe('standard');
    expect(out.content).not.toBe(SRC);
  });
});

describe('ghGetFileContent — out-of-range line requests are signaled, not silently substituted', () => {
  const TWENTY_LINES = Array.from(
    { length: 20 },
    (_, i) => `line ${i + 1}`
  ).join('\n');

  it('an in-range startLine/endLine returns just that range as a complete selection', async () => {
    const out = await processFileContentAPI(
      TWENTY_LINES,
      'octo',
      'engine',
      'main',
      'src/data.txt',
      false,
      5,
      10,
      0,
      undefined,
      undefined,
      undefined,
      'none'
    );
    expect(out.isPartial).not.toBe(true);
    expect(out.startLine).toBe(5);
    expect(out.endLine).toBe(10);
  });

  it('a startLine beyond the file length returns a typed empty selection', async () => {
    const out = await processFileContentAPI(
      TWENTY_LINES,
      'octo',
      'engine',
      'main',
      'src/data.txt',
      false,
      100,
      105,
      0,
      undefined,
      undefined,
      undefined,
      'none'
    );
    expect(out.isPartial).toBeFalsy();
    expect(out.content).toBe('');
    expect(out.errorCode).toBe('noMatches');
  });

  it('endLine before startLine returns a typed empty selection', async () => {
    const out = await processFileContentAPI(
      TWENTY_LINES,
      'octo',
      'engine',
      'main',
      'src/data.txt',
      false,
      10,
      5,
      0,
      undefined,
      undefined,
      undefined,
      'none'
    );
    expect(out.isPartial).toBeFalsy();
    expect(out.content).toBe('');
    expect(out.errorCode).toBe('noMatches');
  });
});
