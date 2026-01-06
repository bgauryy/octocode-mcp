import { describe, it, expect } from 'vitest';
import {
  DASHED_BORDER,
  STANDARD_BORDER,
  ROUNDED_BORDER,
  DOUBLE_BORDER,
  QUOTE_BORDER,
  DASHED_QUOTE_BORDER,
  renderLeftBorder,
  renderDashedLeftBorder,
  horizontalRule,
  dashedHorizontalRule,
  wrapInBox,
  wrapInDashedBox,
} from '../../../src/ui/agent-ink/borders.js';

describe('borders', () => {
  describe('Border Character Constants', () => {
    it('exports DASHED_BORDER with all required characters', () => {
      expect(DASHED_BORDER).toEqual({
        topLeft: '╭',
        topRight: '╮',
        bottomLeft: '╰',
        bottomRight: '╯',
        horizontal: '╌',
        vertical: '╎',
      });
    });

    it('exports STANDARD_BORDER with all required characters', () => {
      expect(STANDARD_BORDER).toEqual({
        topLeft: '┌',
        topRight: '┐',
        bottomLeft: '└',
        bottomRight: '┘',
        horizontal: '─',
        vertical: '│',
      });
    });

    it('exports ROUNDED_BORDER with all required characters', () => {
      expect(ROUNDED_BORDER).toEqual({
        topLeft: '╭',
        topRight: '╮',
        bottomLeft: '╰',
        bottomRight: '╯',
        horizontal: '─',
        vertical: '│',
      });
    });

    it('exports DOUBLE_BORDER with all required characters', () => {
      expect(DOUBLE_BORDER).toEqual({
        topLeft: '╔',
        topRight: '╗',
        bottomLeft: '╚',
        bottomRight: '╝',
        horizontal: '═',
        vertical: '║',
      });
    });

    it('exports quote border characters', () => {
      expect(QUOTE_BORDER).toBe('│');
      expect(DASHED_QUOTE_BORDER).toBe('╎');
    });
  });

  describe('renderLeftBorder', () => {
    it('adds left border to single line', () => {
      const result = renderLeftBorder('Hello');
      expect(result).toBe('│ Hello');
    });

    it('adds left border to multiple lines', () => {
      const result = renderLeftBorder('Hello\nWorld');
      expect(result).toBe('│ Hello\n│ World');
    });

    it('handles empty content', () => {
      const result = renderLeftBorder('');
      expect(result).toBe('│ ');
    });

    it('uses custom border character', () => {
      const result = renderLeftBorder('Hello', '>');
      expect(result).toBe('> Hello');
    });

    it('preserves whitespace in content', () => {
      const result = renderLeftBorder('  indented');
      expect(result).toBe('│   indented');
    });
  });

  describe('renderDashedLeftBorder', () => {
    it('uses dashed quote border character', () => {
      const result = renderDashedLeftBorder('Hello');
      expect(result).toBe('╎ Hello');
    });

    it('handles multiple lines', () => {
      const result = renderDashedLeftBorder('Line 1\nLine 2\nLine 3');
      expect(result).toBe('╎ Line 1\n╎ Line 2\n╎ Line 3');
    });
  });

  describe('horizontalRule', () => {
    it('creates rule of specified width', () => {
      const result = horizontalRule(5);
      expect(result).toBe('─────');
    });

    it('uses custom character', () => {
      const result = horizontalRule(3, '=');
      expect(result).toBe('===');
    });

    it('handles zero width', () => {
      const result = horizontalRule(0);
      expect(result).toBe('');
    });

    it('handles large width', () => {
      const result = horizontalRule(100);
      expect(result.length).toBe(100);
      expect(result).toMatch(/^─+$/);
    });
  });

  describe('dashedHorizontalRule', () => {
    it('creates dashed rule of specified width', () => {
      const result = dashedHorizontalRule(4);
      expect(result).toBe('╌╌╌╌');
    });
  });

  describe('wrapInBox', () => {
    it('wraps single line in standard box', () => {
      const result = wrapInBox('Hi', 6);
      expect(result).toBe('┌────┐\n│Hi  │\n└────┘');
    });

    it('wraps multiple lines', () => {
      const result = wrapInBox('A\nB', 5);
      expect(result).toBe('┌───┐\n│A  │\n│B  │\n└───┘');
    });

    it('truncates lines that are too long', () => {
      const result = wrapInBox('Hello World', 8);
      // inner width is 6, so "Hello World" (11 chars) gets truncated to "Hello "
      expect(result).toContain('Hello ');
      expect(result).toContain('│');
    });

    it('uses custom border characters', () => {
      const result = wrapInBox('X', 5, DOUBLE_BORDER);
      expect(result).toBe('╔═══╗\n║X  ║\n╚═══╝');
    });

    it('handles empty content', () => {
      const result = wrapInBox('', 4);
      expect(result).toBe('┌──┐\n│  │\n└──┘');
    });

    it('handles minimum width of 2', () => {
      const result = wrapInBox('', 2);
      expect(result).toBe('┌┐\n││\n└┘');
    });
  });

  describe('wrapInDashedBox', () => {
    it('uses dashed border characters', () => {
      const result = wrapInDashedBox('OK', 6);
      expect(result).toContain('╌');
      expect(result).toContain('╎');
      expect(result).toContain('╭');
      expect(result).toContain('╯');
    });

    it('wraps content correctly', () => {
      const result = wrapInDashedBox('Test', 8);
      expect(result).toBe('╭╌╌╌╌╌╌╮\n╎Test  ╎\n╰╌╌╌╌╌╌╯');
    });
  });
});
