import { describe, expect, it, vi } from 'vitest';
import { notify } from '../src/shared/commands.js';
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
    ['strips the soft hyphen, Mongolian vowel separator and Hangul filler', 'a\u00adb\u180ec\u3164d', 'abcd'],
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

  it('is applied to every notification, since Pi draws notify text as is', () => {
    const shown = vi.fn();
    notify({ notify: shown }, 'Skipped profiles:\n\u001b]0;pwned\u0007evil.md: bad\u202e', 'warning');
    expect(shown).toHaveBeenCalledWith('Skipped profiles:\nevil.md: bad', 'warning');
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
    ['shows the soft hyphen, Mongolian vowel separator and Hangul filler', 'a\u00adb\u180ec\u3164d', 'a\\u{ad}b\\u{180e}c\\u{3164}d'],
    ['shows the grapheme joiner, Khmer vowels, Mongolian selectors, braille blank and Hangul half filler', 'a\u034fb\u17b4c\u17b5d\u180be\u2800f\uffa0g', 'a\\u{34f}b\\u{17b4}c\\u{17b5}d\\u{180b}e\\u{2800}f\\u{ffa0}g'],
    ['keeps one variation selector after an emoji, a digit, a keycap base or a Han character', '❤\ufe0f 1\ufe0f\u20e3 #\ufe0f\u20e3 *\ufe0f 葛\u{e0100}', '❤\ufe0f 1\ufe0f\u20e3 #\ufe0f\u20e3 *\ufe0f 葛\u{e0100}'],
    ['shows a variation selector after a letter, and every one in a run', 'a\ufe0fb\u{e0100}c❤\ufe0f\ufe01\ufe02', 'a\\u{fe0f}b\\u{e0100}c❤\ufe0f\\u{fe01}\\u{fe02}'],
    ['keeps CRLF and shows a lone CR as \\r', 'a\r\nb\rc', 'a\r\nb\\rc'],
    ['shows a CR that does not directly precede the LF', 'a\r\r\nb\n\r', 'a\\r\r\nb\n\\r'],
    ['shows ESC and the C1 introducers instead of dropping a sequence', '\u001b]0;pwned\u0007\u009b31m', '\\u{1b}]0;pwned\\u{7}\\u{9b}31m'],
    ['shows NUL, DEL, and line and paragraph separators', 'a\u0000b\u007fc\u2028d\u2029', 'a\\u{0}b\\u{7f}c\\u{2028}d\\u{2029}'],
  ];
  it.each(cases)('%s', (_name, input, expected) => {
    expect(visibleControls(input)).toBe(expected);
  });

  it('leaves no character raw that sanitizeTerminalText would remove, and no more than it', () => {
    const text = 'x\u001b[31m\u202e\u200d\u{e0041}\r\ny 👩‍💻\rz';
    // What survives visibleControls once its escapes are read back as text equals the original, so nothing was lost.
    const shown = visibleControls(text);
    // Terminal-safe: once CRLF pairs (harmless) are set aside, sanitizeTerminalText has nothing left to remove.
    const unpaired = shown.replaceAll('\r\n', '\n');
    expect(sanitizeTerminalText(unpaired)).toBe(unpaired);
    expect(shown).not.toMatch(/\r(?!\n)/u);
    expect(shown.replace(/\\u\{([0-9a-f]+)\}/gu, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16))).replaceAll('\\r', '\r')).toBe(text);
  });

  it('has a cleaning pre-check that covers every character it would show', () => {
    const hidden = ['\u00ad', '\u034f', '\u17b4', '\u180b', '\u200b', '\u2060', '\u2800', '\u3164', '\uffa0', '\ufeff', '\u{e0041}', 'a\ufe0f', 'a\u{e0100}', 'a\u200d', '\u0000', '\u202e', '\u009b'];
    for (const text of hidden) {
      expect(visibleControls(text), JSON.stringify(text)).not.toBe(text);
      expect(sanitizeTerminalText(text), JSON.stringify(text)).not.toBe(text);
    }
  });

  it('leaves a CRLF text the same size, so an edit built from it matches the file', () => {
    const file = Array.from({ length: 200 }, (_, index) => `line ${index}`).join('\r\n') + '\r\n';
    expect(visibleControls(file)).toBe(file);
    expect(visibleControls('old\r\nline\r\n')).toContain('old\r\nline');
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
