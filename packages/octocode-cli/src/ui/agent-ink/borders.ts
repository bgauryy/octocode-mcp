/**
 * Custom Border Utilities
 *
 * Extended border characters for terminal UI beyond Ink's built-in styles.
 * Includes dashed borders and left-only border effects.
 */

/**
 * Border character set interface
 */
export interface BorderCharacters {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  horizontal: string;
  vertical: string;
}

/**
 * Dashed border characters (box-drawing)
 * These create a lighter, less prominent border effect
 */
export const DASHED_BORDER: BorderCharacters = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '╌',
  vertical: '╎',
} as const;

/**
 * Standard box-drawing characters for reference
 */
export const STANDARD_BORDER: BorderCharacters = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
} as const;

/**
 * Rounded box-drawing characters
 */
export const ROUNDED_BORDER: BorderCharacters = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
} as const;

/**
 * Double line box-drawing characters
 */
export const DOUBLE_BORDER: BorderCharacters = {
  topLeft: '╔',
  topRight: '╗',
  bottomLeft: '╚',
  bottomRight: '╝',
  horizontal: '═',
  vertical: '║',
} as const;

/**
 * Quote-style left border character
 */
export const QUOTE_BORDER = '│';
export const DASHED_QUOTE_BORDER = '╎';

/**
 * Render content with a left-only border (like code/quote blocks)
 *
 * @param content - The text content to render
 * @param borderChar - The border character to use (default: │)
 * @returns Content with left border prefix on each line
 *
 * @example
 * ```
 * const quoted = renderLeftBorder('Hello\nWorld');
 * // Output:
 * // │ Hello
 * // │ World
 * ```
 */
export function renderLeftBorder(
  content: string,
  borderChar: string = QUOTE_BORDER
): string {
  const lines = content.split('\n');
  return lines.map(line => `${borderChar} ${line}`).join('\n');
}

/**
 * Render content with a dashed left border
 *
 * @param content - The text content to render
 * @returns Content with dashed left border prefix on each line
 */
export function renderDashedLeftBorder(content: string): string {
  return renderLeftBorder(content, DASHED_QUOTE_BORDER);
}

/**
 * Create a horizontal rule with specified character
 *
 * @param width - Width of the rule in characters
 * @param char - Character to repeat (default: ─)
 * @returns Horizontal rule string
 */
export function horizontalRule(width: number, char: string = '─'): string {
  return char.repeat(width);
}

/**
 * Create a dashed horizontal rule
 *
 * @param width - Width of the rule in characters
 * @returns Dashed horizontal rule string
 */
export function dashedHorizontalRule(width: number): string {
  return horizontalRule(width, DASHED_BORDER.horizontal);
}

/**
 * Wrap content in a simple box with custom characters
 *
 * @param content - Content to wrap
 * @param width - Box width (including borders)
 * @param border - Border character set to use
 * @returns Boxed content string
 */
export function wrapInBox(
  content: string,
  width: number,
  border: BorderCharacters = STANDARD_BORDER
): string {
  const innerWidth = width - 2;
  const lines = content.split('\n');

  const topBorder =
    border.topLeft + border.horizontal.repeat(innerWidth) + border.topRight;

  const bottomBorder =
    border.bottomLeft +
    border.horizontal.repeat(innerWidth) +
    border.bottomRight;

  const paddedLines = lines.map(line => {
    const padding = innerWidth - line.length;
    if (padding < 0) {
      // Truncate if too long
      return border.vertical + line.slice(0, innerWidth) + border.vertical;
    }
    return border.vertical + line + ' '.repeat(padding) + border.vertical;
  });

  return [topBorder, ...paddedLines, bottomBorder].join('\n');
}

/**
 * Wrap content in a dashed box
 *
 * @param content - Content to wrap
 * @param width - Box width (including borders)
 * @returns Boxed content with dashed borders
 */
export function wrapInDashedBox(content: string, width: number): string {
  return wrapInBox(content, width, DASHED_BORDER);
}
