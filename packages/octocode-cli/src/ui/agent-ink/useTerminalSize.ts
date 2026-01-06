/**
 * Terminal Size Hook
 *
 * React hook for tracking terminal dimensions and responsive layouts.
 * Automatically updates when terminal is resized.
 */

import { useState, useEffect } from 'react';

export interface TerminalSize {
  /** Terminal width in columns */
  columns: number;
  /** Terminal height in rows */
  rows: number;
}

/**
 * Default terminal size fallback
 */
const DEFAULT_SIZE: TerminalSize = {
  columns: 80,
  rows: 24,
};

/**
 * Get current terminal size
 */
function getTerminalSize(): TerminalSize {
  return {
    columns: process.stdout.columns || DEFAULT_SIZE.columns,
    rows: process.stdout.rows || DEFAULT_SIZE.rows,
  };
}

/**
 * Hook to track terminal dimensions
 * Updates automatically when terminal is resized
 *
 * @returns Current terminal size { columns, rows }
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { columns, rows } = useTerminalSize();
 *   const layout = getLayoutMode(columns);
 *
 *   return (
 *     <Box width={Math.min(columns - 4, 120)}>
 *       {layout !== 'compact' && <Text>Extended info...</Text>}
 *     </Box>
 *   );
 * }
 * ```
 */
export function useTerminalSize(): TerminalSize {
  const [size, setSize] = useState<TerminalSize>(getTerminalSize);

  useEffect(() => {
    const handleResize = (): void => {
      setSize(getTerminalSize());
    };

    // Listen for terminal resize events
    process.stdout.on('resize', handleResize);

    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, []);

  return size;
}

/**
 * Layout mode based on terminal width
 */
export type LayoutMode = 'compact' | 'normal' | 'wide';

/**
 * Breakpoints for responsive layouts
 */
export const LAYOUT_BREAKPOINTS = {
  compact: 60, // < 60 columns
  wide: 120, // > 120 columns
} as const;

/**
 * Determine layout mode based on terminal width
 *
 * @param columns - Terminal width in columns
 * @returns Layout mode: 'compact', 'normal', or 'wide'
 *
 * @example
 * ```tsx
 * const { columns } = useTerminalSize();
 * const layout = getLayoutMode(columns);
 *
 * if (layout === 'compact') {
 *   // Show minimal UI
 * } else if (layout === 'wide') {
 *   // Show extended info
 * }
 * ```
 */
export function getLayoutMode(columns: number): LayoutMode {
  if (columns < LAYOUT_BREAKPOINTS.compact) return 'compact';
  if (columns > LAYOUT_BREAKPOINTS.wide) return 'wide';
  return 'normal';
}

/**
 * Calculate optimal content width
 *
 * @param columns - Terminal width
 * @param padding - Horizontal padding to subtract (default: 4)
 * @param maxWidth - Maximum content width (default: 120)
 * @returns Optimal content width
 */
export function getContentWidth(
  columns: number,
  padding: number = 4,
  maxWidth: number = 120
): number {
  return Math.min(columns - padding, maxWidth);
}

/**
 * Hook that provides both terminal size and layout utilities
 *
 * @returns Object with size, layout mode, and content width
 */
export function useResponsiveLayout(): {
  size: TerminalSize;
  layout: LayoutMode;
  contentWidth: number;
} {
  const size = useTerminalSize();
  const layout = getLayoutMode(size.columns);
  const contentWidth = getContentWidth(size.columns);

  return { size, layout, contentWidth };
}
