/**
 * Terminal Colors & Formatting
 * Zero-dependency ANSI color utilities
 */

import type { ColorName } from '../types/index.js';

const colors: Record<ColorName, string> = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
};

/**
 * Apply color to text
 */
export const c = (color: ColorName, text: string): string =>
  `${colors[color]}${text}${colors.reset}`;

/**
 * Bold text
 */
export const bold = (text: string): string => c('bright', text);

/**
 * Dim text
 */
export const dim = (text: string): string => c('dim', text);

/**
 * Underline text
 */
export const underline = (text: string): string => c('underscore', text);
