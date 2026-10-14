import { describe, expect, it, vi } from 'vitest';
import { resultBlock, resultText, toolHeader } from '../src/shared/render.js';
import { redactSecrets, secretProblem, sanitizeTerminalText, storedText, visibleControls } from '../src/shared/sanitize.js';
import { rendered, theme } from './fake-pi.js';

describe('sanitizeTerminalText', () => {
  const cases: Array<[string, string, string]> = [
    ['plain text is unchanged', 'hello world', 'hello world'],
    ['keeps newlines and tabs', 'a\n\tb', 'a\n\tb'],
    ['folds CRLF and lone CR into LF', 'a\r\nb\rc', 'a\nb\nc'],
    ['strips CSI colour and cursor codes', '\u001b[31mred\u001b[0m \u001b[2J\u001b[10;5H!', 'red !'],
    ['strips OSC title (BEL)', '\u001b]0;pwned\u0007after', 'after'],
    ['strips OSC 8 links (ST)', '\u001b]8;;https://evil.test\u001b\\click\u001b]8;;\u001b\\', 'click'],
    ['strips an unterminated OSC to the end', 'ok\u001b]52;c;Zm9v', 'ok'],
    ['ends an unterminated OSC at its line, keeping the lines after it', 'line1 \u001b] oops\nline2\nline3', 'line1 \nline2\nline3'],
    ['ends an unterminated DCS at its line', 'a\u0090junk\nb', 'a\nb'],
    ['strips DCS strings', 'x\u001bPqpayload\u001b\\y', 'xy'],
    ['strips 8-bit CSI', 'a\u009b31mb', 'ab'],
    ['strips lone ESC sequences', 'a\u001bcb\u001b(Bc', 'abc'],
    ['strips C0 controls and DEL', 'a\u0000b\u0007c\u0008d\u007fe', 'abcde'],
    ['strips bidi overrides and isolates', 'file\u202egnp.exe\u2066x\u2069', 'filegnp.exex'],
    ['turns line/paragraph separators into LF', 'a\u2028b\u2029c', 'a\nb\nc'],
    ['keeps other unicode', 'café 日本 🚀', 'café 日本 🚀'],
    ['strips Unicode tag characters', 'ok\u{e0001}\u{e0069}\u{e0067}\u{e006e}\u{e007f}!', 'ok!'],
    ['strips zero-width characters, word joiner and BOM', '\ufeffa\u200bb\u200cc\u200dd\u2060e\u2063f', 'abcdef'],
    ['strips bidi embeddings, overrides and isolates', 'a\u202ab\u202bc\u202cd\u202de\u2067f\u2068g', 'abcdefg'],
    ['keeps a ZWJ that joins emoji', '👩‍💻 👩🏽‍💻 ❤️‍🔥 👨‍👩‍👧', '👩‍💻 👩🏽‍💻 ❤️‍🔥 👨‍👩‍👧'],
    ['strips a ZWJ next to plain text', 'x\u200d👩 👩\u200dy', 'x👩 👩y'],
  ];
  it.each(cases)('%s', (_name, input, expected) => {
    expect(sanitizeTerminalText(input)).toBe(expected);
  });

  it('is applied by the shared renderers that draw subagent and MCP text', () => {
    expect(resultText({ content: [{ type: 'text', text: '\u001b]0;title\u0007ok\u001b[1m!' }] })).toBe('ok!');
    expect(rendered(resultBlock(theme, { expanded: true }, { summary: '\u001b]0;t\u0007done', body: '\u001b[31mred\u001b[0m\n\u202eevil' }))).toBe('  ⎿  done\n     red\n     evil');
    expect(rendered(toolHeader(theme, {}, 'Mcp', '\u001b[2Jx\u202ey'))).toBe('○ Mcp(xy)');
  });
});

describe('visibleControls', () => {
  const cases: Array<[string, string, string]> = [
    ['plain text is unchanged', 'hello world café 日本 🚀', 'hello world café 日本 🚀'],
    ['keeps newlines and tabs', 'a\n\tb', 'a\n\tb'],
    ['shows a ZWJ between letters', 'a\u200db', 'a\\u{200d}b'],
    ['keeps a ZWJ that joins emoji', '👩‍💻 👨‍👩‍👧', '👩‍💻 👨‍👩‍👧'],
    ['shows a right-to-left override and its pop', 'file\u202egnp.exe\u202c', 'file\\u{202e}gnp.exe\\u{202c}'],
    ['shows Unicode tag characters', 'ok\u{e0069}\u{e007f}!', 'ok\\u{e0069}\\u{e007f}!'],
    ['shows BOM, zero-width space and word joiner', '\ufeffa\u200bb\u2060c', '\\u{feff}a\\u{200b}b\\u{2060}c'],
    ['shows CRLF and a lone CR as \\r', 'a\r\nb\rc', 'a\\r\nb\\rc'],
    ['shows ESC and the C1 introducers instead of dropping a sequence', '\u001b]0;pwned\u0007\u009b31m', '\\u{1b}]0;pwned\\u{7}\\u{9b}31m'],
    ['shows NUL, DEL, and line and paragraph separators', 'a\u0000b\u007fc\u2028d\u2029', 'a\\u{0}b\\u{7f}c\\u{2028}d\\u{2029}'],
  ];
  it.each(cases)('%s', (_name, input, expected) => {
    expect(visibleControls(input)).toBe(expected);
  });

  it('leaves no character raw that sanitizeTerminalText would remove, and no more than it', () => {
    const text = 'x\u001b[31m\u202e\u200d\u{e0041}\r\ny 👩‍💻';
    // What survives visibleControls once its escapes are read back as text equals the original, so nothing was lost.
    const shown = visibleControls(text);
    expect(sanitizeTerminalText(shown)).toBe(shown);
    expect(shown.replace(/\\u\{([0-9a-f]+)\}/gu, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16))).replaceAll('\\r', '\r')).toBe(text);
  });
});

describe('secret redaction', () => {
  const token = `ghp_${'a'.repeat(36)}`;
  it('replaces every credential span, repeatedly, and leaves clean text alone', () => {
    const text = `a ${token} b ${token} c Bearer ${'x'.repeat(24)}`;
    expect(redactSecrets(text)).toBe('a [redacted] b [redacted] c [redacted]');
    expect(redactSecrets(text)).toBe('a [redacted] b [redacted] c [redacted]');
    expect(redactSecrets('nothing to see')).toBe('nothing to see');
    expect(secretProblem(token)).toContain('a GitHub token');
    expect(secretProblem(token)).toContain('a GitHub token');
    expect(secretProblem('plain')).toBeUndefined();
  });

  it('compiles no regular expression per call', () => {
    const construct = vi.spyOn(globalThis, 'RegExp');
    try {
      redactSecrets(`x ${token}`);
      redactSecrets('y');
      expect(construct).not.toHaveBeenCalled();
    } finally {
      construct.mockRestore();
    }
  });
});

describe('storedText', () => {
  it('cuts a one-line label by character, never through an emoji', () => {
    expect(storedText('ab😀cd', 3)).toBe('ab😀');
    expect(storedText('ab😀cd', 2)).toBe('ab');
    expect(storedText('  ab\u001b[31m😀  ')).toBe('ab😀');
  });
});
