import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  supportsHyperlinks,
  makeHyperlink,
  fileLink,
  githubLink,
  githubIssueLink,
  urlLink,
} from '../../src/utils/hyperlinks.js';

describe('hyperlinks', () => {
  const originalEnv = process.env;
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    // Reset env for each test
    process.env = { ...originalEnv };
    // Store and set isTTY
    originalIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdout, 'isTTY', {
      value: true,
      configurable: true,
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    // Restore isTTY
    Object.defineProperty(process.stdout, 'isTTY', {
      value: originalIsTTY,
      configurable: true,
    });
    vi.restoreAllMocks();
  });

  describe('supportsHyperlinks', () => {
    it('returns false when not a TTY', () => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        configurable: true,
      });
      expect(supportsHyperlinks()).toBe(false);
    });

    it('returns true for iTerm.app', () => {
      process.env.TERM_PROGRAM = 'iTerm.app';
      expect(supportsHyperlinks()).toBe(true);
    });

    it('returns true for Hyper', () => {
      process.env.TERM_PROGRAM = 'Hyper';
      expect(supportsHyperlinks()).toBe(true);
    });

    it('returns true for WezTerm', () => {
      process.env.TERM_PROGRAM = 'WezTerm';
      expect(supportsHyperlinks()).toBe(true);
    });

    it('returns true for VS Code terminal', () => {
      process.env.TERM_PROGRAM = 'vscode';
      expect(supportsHyperlinks()).toBe(true);
    });

    it('returns true for Kitty', () => {
      process.env.TERM_PROGRAM = 'Kitty';
      expect(supportsHyperlinks()).toBe(true);
    });

    it('returns true for Windows Terminal', () => {
      process.env.WT_SESSION = 'some-session-id';
      expect(supportsHyperlinks()).toBe(true);
    });

    it('returns true for VTE 0.50+', () => {
      process.env.VTE_VERSION = '6003';
      expect(supportsHyperlinks()).toBe(true);
    });

    it('returns false for VTE < 0.50', () => {
      process.env.VTE_VERSION = '4999';
      expect(supportsHyperlinks()).toBe(false);
    });

    it('returns true when TERM contains kitty', () => {
      process.env.TERM = 'xterm-kitty';
      expect(supportsHyperlinks()).toBe(true);
    });

    it('returns false for unknown terminals', () => {
      delete process.env.TERM_PROGRAM;
      delete process.env.WT_SESSION;
      delete process.env.VTE_VERSION;
      process.env.TERM = 'xterm-256color';
      expect(supportsHyperlinks()).toBe(false);
    });
  });

  describe('makeHyperlink', () => {
    it('creates OSC 8 hyperlink when supported', () => {
      process.env.TERM_PROGRAM = 'iTerm.app';
      const result = makeHyperlink('https://example.com', 'Example');
      expect(result).toBe('\x1B]8;;https://example.com\x07Example\x1B]8;;\x07');
    });

    it('uses URL as display text when text not provided', () => {
      process.env.TERM_PROGRAM = 'iTerm.app';
      const result = makeHyperlink('https://example.com');
      expect(result).toBe(
        '\x1B]8;;https://example.com\x07https://example.com\x1B]8;;\x07'
      );
    });

    it('returns plain text when hyperlinks not supported', () => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        configurable: true,
      });
      const result = makeHyperlink('https://example.com', 'Example');
      expect(result).toBe('Example');
    });
  });

  describe('fileLink', () => {
    it('creates file:// URL for absolute paths', () => {
      process.env.TERM_PROGRAM = 'iTerm.app';
      const result = fileLink('/usr/local/bin/node', 'node');
      expect(result).toBe(
        '\x1B]8;;file:///usr/local/bin/node\x07node\x1B]8;;\x07'
      );
    });

    it('resolves relative paths to absolute', () => {
      process.env.TERM_PROGRAM = 'iTerm.app';
      const cwd = process.cwd();
      const result = fileLink('src/index.ts', 'index.ts');
      expect(result).toBe(
        `\x1B]8;;file://${cwd}/src/index.ts\x07index.ts\x1B]8;;\x07`
      );
    });

    it('uses path as display text when not provided', () => {
      process.env.TERM_PROGRAM = 'iTerm.app';
      const result = fileLink('/path/to/file.ts');
      expect(result).toBe(
        '\x1B]8;;file:///path/to/file.ts\x07/path/to/file.ts\x1B]8;;\x07'
      );
    });
  });

  describe('githubLink', () => {
    it('creates repo link without path', () => {
      process.env.TERM_PROGRAM = 'iTerm.app';
      const result = githubLink('facebook', 'react');
      expect(result).toBe(
        '\x1B]8;;https://github.com/facebook/react\x07facebook/react\x1B]8;;\x07'
      );
    });

    it('creates file link with path', () => {
      process.env.TERM_PROGRAM = 'iTerm.app';
      const result = githubLink('facebook', 'react', 'src/index.ts');
      expect(result).toBe(
        '\x1B]8;;https://github.com/facebook/react/blob/main/src/index.ts\x07src/index.ts\x1B]8;;\x07'
      );
    });

    it('uses custom branch', () => {
      process.env.TERM_PROGRAM = 'iTerm.app';
      const result = githubLink('facebook', 'react', 'README.md', 'develop');
      expect(result).toBe(
        '\x1B]8;;https://github.com/facebook/react/blob/develop/README.md\x07README.md\x1B]8;;\x07'
      );
    });
  });

  describe('githubIssueLink', () => {
    it('creates issue link', () => {
      process.env.TERM_PROGRAM = 'iTerm.app';
      const result = githubIssueLink('facebook', 'react', 123);
      expect(result).toBe(
        '\x1B]8;;https://github.com/facebook/react/issues/123\x07#123\x1B]8;;\x07'
      );
    });

    it('creates PR link', () => {
      process.env.TERM_PROGRAM = 'iTerm.app';
      const result = githubIssueLink('facebook', 'react', 456, 'pull');
      expect(result).toBe(
        '\x1B]8;;https://github.com/facebook/react/pull/456\x07#456\x1B]8;;\x07'
      );
    });
  });

  describe('urlLink', () => {
    it('creates link with shortened display text', () => {
      process.env.TERM_PROGRAM = 'iTerm.app';
      const result = urlLink('https://example.com/path/to/page');
      expect(result).toBe(
        '\x1B]8;;https://example.com/path/to/page\x07example.com/path/to/page\x1B]8;;\x07'
      );
    });

    it('truncates long paths', () => {
      process.env.TERM_PROGRAM = 'iTerm.app';
      const longPath =
        '/this/is/a/very/long/path/that/should/be/truncated/for/display';
      const result = urlLink(`https://example.com${longPath}`);
      expect(result).toContain('...');
    });

    it('returns URL as-is for invalid URLs', () => {
      process.env.TERM_PROGRAM = 'iTerm.app';
      const result = urlLink('not a valid url');
      expect(result).toBe('not a valid url');
    });

    it('handles URLs without paths', () => {
      process.env.TERM_PROGRAM = 'iTerm.app';
      const result = urlLink('https://example.com');
      expect(result).toBe(
        '\x1B]8;;https://example.com\x07example.com\x1B]8;;\x07'
      );
    });
  });
});
