/**
 * cli-design — shared visual contract for Octocode CLI/TUI surfaces.
 *
 * Keep glyphs, progress wording, and raw ANSI token fallbacks in one place so Pi
 * extension surfaces do not drift into separate visual languages.
 */

import { TOKEN, type PaintTheme, type SemanticToken } from './palette.js';

export const CLI_GLYPH = {
  brand: '◆',
  tool: '◇',
  prompt: '›',
  thinking: '🧠',
  running: '⚙',
  update: '↳',
  success: '✓',
  error: '✗',
} as const;

export const CLI_SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

export const CLI_STATUS_TEXT = {
  running: 'running…',
  fetching: 'Fetching…',
  processing: 'Processing…',
  connectingChrome: '⧗ Connecting to Chrome…',
  editing: '… editing',
  done: 'done',
  cancelled: 'cancelled',
  unavailable: 'no interactive UI',
} as const;

const ANSI_BY_TOKEN: Partial<Record<SemanticToken, string>> = {
  brand: '\u001b[35m',
  brandAlt: '\u001b[36m',
  path: '\u001b[36m',
  link: '\u001b[35m',
  linkUrl: '\u001b[2m', // theme resolves mdLinkUrl → dim
  count: '\u001b[39m', // default fg (themed count is default-fg); 33m collided with warning
  symbol: '\u001b[36m',
  title: '\u001b[35m',
  success: '\u001b[32m',
  error: '\u001b[31m',
  warning: '\u001b[33m', // yellow — tracks the themes' gold warning, not magenta
  muted: '\u001b[2m',
  dim: '\u001b[2m',
  bright: '\u001b[1m',
  diffAdd: '\u001b[32m',
  diffRemove: '\u001b[31m',
  diffContext: '\u001b[2m',
};

/** Raw SGR open sequence for a semantic token (undefined when the token has no fallback). */
export function ansiForToken(token: SemanticToken): string | undefined {
  return ANSI_BY_TOKEN[token];
}

export function cliSpinnerFrame(now = Date.now()): string {
  return CLI_SPINNER_FRAMES[Math.floor(now / 120) % CLI_SPINNER_FRAMES.length] ?? CLI_SPINNER_FRAMES[0];
}

export function cliStatusGlyph(ok: boolean): string {
  return ok ? CLI_GLYPH.success : CLI_GLYPH.error;
}

export function cliStatusToken(ok: boolean): Extract<SemanticToken, 'success' | 'error'> {
  return ok ? 'success' : 'error';
}

export function cliToolTitle(theme: PaintTheme | undefined, toolName: string, opts: { bold?: boolean } = {}): string {
  const text = opts.bold && theme ? theme.bold(toolName) : toolName;
  return theme?.fg(TOKEN.title, text) ?? toolName;
}
