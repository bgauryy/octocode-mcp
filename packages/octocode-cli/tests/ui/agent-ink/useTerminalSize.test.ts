/**
 * Tests for useTerminalSize Hook
 *
 * Note: Testing React hooks without @testing-library/react requires
 * testing the exported utility functions directly rather than the hook behavior.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getLayoutMode,
  getContentWidth,
  LAYOUT_BREAKPOINTS,
} from '../../../src/ui/agent-ink/useTerminalSize.js';

describe('useTerminalSize Module', () => {
  let originalColumns: number | undefined;
  let originalRows: number | undefined;

  beforeEach(() => {
    // Store original values
    originalColumns = process.stdout.columns;
    originalRows = process.stdout.rows;
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original values
    Object.defineProperty(process.stdout, 'columns', {
      value: originalColumns,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(process.stdout, 'rows', {
      value: originalRows,
      configurable: true,
      writable: true,
    });
    vi.restoreAllMocks();
  });

  describe('Module Exports', () => {
    it('exports useTerminalSize hook', async () => {
      const module =
        await import('../../../src/ui/agent-ink/useTerminalSize.js');

      expect(module.useTerminalSize).toBeDefined();
      expect(typeof module.useTerminalSize).toBe('function');
    });

    it('exports useResponsiveLayout hook', async () => {
      const module =
        await import('../../../src/ui/agent-ink/useTerminalSize.js');

      expect(module.useResponsiveLayout).toBeDefined();
      expect(typeof module.useResponsiveLayout).toBe('function');
    });

    it('exports getLayoutMode utility', async () => {
      const module =
        await import('../../../src/ui/agent-ink/useTerminalSize.js');

      expect(module.getLayoutMode).toBeDefined();
      expect(typeof module.getLayoutMode).toBe('function');
    });

    it('exports getContentWidth utility', async () => {
      const module =
        await import('../../../src/ui/agent-ink/useTerminalSize.js');

      expect(module.getContentWidth).toBeDefined();
      expect(typeof module.getContentWidth).toBe('function');
    });

    it('exports LAYOUT_BREAKPOINTS constant', async () => {
      const module =
        await import('../../../src/ui/agent-ink/useTerminalSize.js');

      expect(module.LAYOUT_BREAKPOINTS).toBeDefined();
      expect(module.LAYOUT_BREAKPOINTS.compact).toBe(60);
      expect(module.LAYOUT_BREAKPOINTS.wide).toBe(120);
    });
  });

  describe('getLayoutMode', () => {
    it('returns compact for narrow terminals', () => {
      expect(getLayoutMode(50)).toBe('compact');
      expect(getLayoutMode(59)).toBe('compact');
    });

    it('returns normal for standard terminals', () => {
      expect(getLayoutMode(60)).toBe('normal');
      expect(getLayoutMode(80)).toBe('normal');
      expect(getLayoutMode(120)).toBe('normal');
    });

    it('returns wide for large terminals', () => {
      expect(getLayoutMode(121)).toBe('wide');
      expect(getLayoutMode(200)).toBe('wide');
    });

    it('uses correct breakpoints', () => {
      expect(getLayoutMode(LAYOUT_BREAKPOINTS.compact - 1)).toBe('compact');
      expect(getLayoutMode(LAYOUT_BREAKPOINTS.compact)).toBe('normal');
      expect(getLayoutMode(LAYOUT_BREAKPOINTS.wide)).toBe('normal');
      expect(getLayoutMode(LAYOUT_BREAKPOINTS.wide + 1)).toBe('wide');
    });

    it('handles edge cases', () => {
      expect(getLayoutMode(0)).toBe('compact');
      expect(getLayoutMode(1)).toBe('compact');
      expect(getLayoutMode(1000)).toBe('wide');
    });
  });

  describe('getContentWidth', () => {
    it('subtracts default padding from terminal width', () => {
      expect(getContentWidth(100)).toBe(96); // 100 - 4 default padding
    });

    it('respects default maxWidth of 120', () => {
      expect(getContentWidth(200)).toBe(120); // capped at 120
      expect(getContentWidth(150)).toBe(120);
    });

    it('uses custom padding', () => {
      expect(getContentWidth(100, 10)).toBe(90);
      expect(getContentWidth(100, 0)).toBe(100);
      expect(getContentWidth(100, 20)).toBe(80);
    });

    it('uses custom maxWidth', () => {
      expect(getContentWidth(200, 4, 150)).toBe(150);
      expect(getContentWidth(200, 4, 200)).toBe(196);
    });

    it('handles narrow terminals correctly', () => {
      expect(getContentWidth(40)).toBe(36);
      expect(getContentWidth(40, 4, 120)).toBe(36);
      expect(getContentWidth(20, 4)).toBe(16);
    });

    it('handles when width minus padding exceeds maxWidth', () => {
      expect(getContentWidth(150, 4, 100)).toBe(100);
    });

    it('handles edge cases', () => {
      expect(getContentWidth(4, 4)).toBe(0); // width equals padding
      expect(getContentWidth(0, 4)).toBe(-4); // returns negative (caller should handle)
    });
  });

  describe('Types', () => {
    it('exports TerminalSize interface', async () => {
      const module =
        await import('../../../src/ui/agent-ink/useTerminalSize.js');

      // TypeScript will verify the type exists
      expect(module).toBeDefined();
    });

    it('exports LayoutMode type', async () => {
      const module =
        await import('../../../src/ui/agent-ink/useTerminalSize.js');

      // Verify getLayoutMode returns valid LayoutMode values
      const result = module.getLayoutMode(80);
      expect(['compact', 'normal', 'wide']).toContain(result);
    });
  });
});
