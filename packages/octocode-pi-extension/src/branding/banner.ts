import { truncateToWidth, visibleWidth } from '../tui/width.js';
/**
 * Pure functions for rendering the Octocode banner and tagline.
 *
 * All output is width-safe: every line is measured and truncated through the
 * same ANSI-aware helpers used by the rest of the extension so pi's TUI never
 * sees a line whose visible width exceeds the terminal width.
 */

import { truncatePlainToWidth } from '../tools/render-helpers.js';
import { BETA_ISSUES_PREFIX, BETA_ISSUES_URL, BETA_LABEL, TAGLINE } from '../tui/content.js';
import { paint, SEP, type SemanticToken } from '../tui/palette.js';

// ─── Minimal theme interface ──────────────────────────────────────────────────

/** Subset of PiTheme required by banner functions. */
export interface BannerTheme {
  fg(color: string, text: string): string;
  bold(text: string): string;
}

// ─── Constants ────────────────────────────────────────────────────────────────


/**
 * Octocode banner art: the block-style OCTOCODE CODE wordmark
 * (figlet "ANSI Shadow" face) painted by renderWordmarkLines with a
 * theme-aware lavender and purple gradient.
 */
const WORDMARK_ART: readonly string[] = [
  ' ██████╗  ██████╗████████╗ ██████╗  ██████╗ ██████╗ ██████╗ ███████╗   ██████╗ ██████╗ ██████╗ ███████╗',
  '██╔═══██╗██╔════╝╚══██╔══╝██╔═══██╗██╔════╝██╔═══██╗██╔══██╗██╔════╝  ██╔════╝██╔═══██╗██╔══██╗██╔════╝',
  '██║   ██║██║        ██║   ██║   ██║██║     ██║   ██║██║  ██║█████╗    ██║     ██║   ██║██║  ██║█████╗',
  '██║   ██║██║        ██║   ██║   ██║██║     ██║   ██║██║  ██║██╔══╝    ██║     ██║   ██║██║  ██║██╔══╝',
  '╚██████╔╝╚██████╗   ██║   ╚██████╔╝╚██████╗╚██████╔╝██████╔╝███████╗  ╚██████╗╚██████╔╝██████╔╝███████╗',
  ' ╚═════╝  ╚═════╝   ╚═╝    ╚═════╝  ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝   ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝',
];

const WORDMARK_WIDTH = WORDMARK_ART.reduce((max, line) => Math.max(max, visibleWidth(line)), 0);

/** Emoji lens+octopus mark prefixing the compact brand line (same glyphs as the HTML page / octocode CLI). */
const BRAND_MARK_EMOJI = '🔍🐙';

/** Product name shown after the emoji mark on the compact brand line. */
const BRAND_NAME = 'Octocode';

/** Static purple-family gradient used when the full wordmark cannot fit. */
const COMPACT_BRAND_RAMP: readonly SemanticToken[] = [
  'link',
  'brand',
  'title',
  'muted',
  'brand',
  'link',
  'title',
  'muted',
];

// The active theme owns every brand color, including plain/light themes.
// Use broad, static bands so identity stays calm and repaints stay deterministic.
const WORDMARK_RAMP: readonly SemanticToken[] = ['link', 'brand', 'title', 'brand'];

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * The banner art painted with the static theme gradient. Pure in (theme,
 * width): identical input → byte-identical output, so repaints are free.
 * Width-safe: the PLAIN art is clipped first (truncatePlainToWidth injects no
 * SGR resets), then the surviving glyphs are painted.
 */
export function renderWordmarkLines(theme: BannerTheme, width: number): string[] {
  // Narrow terminals: the art cannot survive a hard clip (each row degrades to
  // a mid-letter fragment + "…"), so below WORDMARK_WIDTH fall back to the
  // compact brand mark. Still pure in (theme, width) — no animation.
  //
  // HEIGHT STABILITY: always return exactly WORDMARK_ART.length lines, even
  // in compact mode. The banner is the FIRST entry in the transcript, so its
  // line number is 0 in the document. If its height changes (1 vs 6 lines)
  // on a terminal resize across the WORDMARK_WIDTH boundary, pi-tui's
  // differential renderer sees firstChanged=0 < viewportTop → fullRender(true)
  // → clears scrollback → user loses their scroll position. Padding with empty
  // strings keeps the height constant; the blank rows are invisible above
  // committed messages in a live session.
  if (width < WORDMARK_WIDTH) {
    const name = [...BRAND_NAME]
      .map((ch, index) => paint(theme, COMPACT_BRAND_RAMP[index] ?? 'brand', ch))
      .join('');
    const mark = `${BRAND_MARK_EMOJI} ${name}`;
    const lines: string[] = [truncateToWidth(mark, width)];
    while (lines.length < WORDMARK_ART.length) lines.push('');
    return lines;
  }
  return WORDMARK_ART.map((line) => {
    const clipped = truncatePlainToWidth(line, width);
    return [...clipped].map((ch, col) => {
      const stop = Math.min(WORDMARK_RAMP.length - 1,
        Math.floor(col * WORDMARK_RAMP.length / WORDMARK_WIDTH));
      return ch === ' ' ? ch : paint(theme, WORDMARK_RAMP[stop] ?? 'brand', ch);
    }).join('');
  });
}

/**
 * Build the main Octocode banner block: the colored OCTOCODE wordmark topped
 * off with the official `🔍🐙 Octocode` brand line (same mark as the published
 * `octocode` CLI), which also carries the optional version.
 *
 * Returns an array of width-safe strings (ANSI codes included) ready to be
 * passed to a pi TUI renderer. Each string is individually truncated to
 * `width` so callers can append them directly to component output.
 *
 * @param theme  A BannerTheme (fg + bold).
 * @param width  Available terminal width in columns.
 * @param version  Optional semver string shown after the wordmark, e.g. `"1.2.3"`.
 */
export function renderBannerLines(theme: BannerTheme, width: number, version?: string): string[] {
  const versionStr = version ? paint(theme, 'muted', `v${version}`) : '';
  const wordmark = renderWordmarkLines(theme, width);

  return versionStr ? [...wordmark, truncateToWidth(versionStr, width)] : wordmark;
}

/**
 * Build a single tagline line.
 *
 * @param theme  A BannerTheme (fg + bold).
 * @param width  Available terminal width in columns.
 */
export function renderTagline(theme: BannerTheme, width: number): string {
  const line = paint(theme, 'muted', TAGLINE);
  return truncateToWidth(line, width);
}

/**
 * Beta notice: gold label (this IS an act-on-me state — expect rough edges)
 * followed by a visible issue-tracker URL. Keep the URL literal instead of OSC 8
 * here: startup lines are width-sanitized/truncated, and raw URLs are more
 * reliable across terminals while still auto-linking in most emulators.
 */
export function renderBetaNotice(theme: BannerTheme, width: number): string {
  const line = `${paint(theme, 'warning', BETA_LABEL)} ${paint(theme, 'muted', `· ${BETA_ISSUES_PREFIX}`)} ${paint(theme, 'link', BETA_ISSUES_URL)}`;
  return truncateToWidth(line, width);
}

/**
 * Optional live session snapshot surfaced below the beta notice.
 * Data is captured once when the banner entry is appended (at session_start)
 * so it reads as a startup summary, not a live readout — avoids time-varying
 * bytes in a transcript entry (which would invalidate pi-tui's line diff and
 * cause scroll jumps during streaming).
 */
export interface BannerSessionInfo {
  /** Model identifier (e.g. "claude-opus-4-5"). */
  model?: string;
  /** Provider name (e.g. "anthropic"). */
  provider?: string;
  /** Thinking level active at session start (e.g. "medium"). */
  thinking?: string;
}

/**
 * Render a single muted session-info line: `model: provider/id · thinking: level`.
 * Returns `null` when there is nothing worth showing.
 */
export function renderSessionInfoLine(theme: BannerTheme, width: number, info: BannerSessionInfo): string | null {
  const parts: string[] = [];
  if (info.model && info.provider) parts.push(`model: ${info.provider}/${info.model}`);
  else if (info.model) parts.push(`model: ${info.model}`);
  if (info.thinking) parts.push(`thinking: ${info.thinking}`);
  if (parts.length === 0) return null;
  return truncateToWidth(paint(theme, 'muted', parts.join(SEP)), width);
}

/**
 * Convenience: banner lines, then the tagline, then the beta notice,
 * and optionally a session-info snapshot line when `info` is provided.
 */
export function renderBannerWithTagline(theme: BannerTheme, width: number, version?: string, info?: BannerSessionInfo): string[] {
  const lines: string[] = [...renderBannerLines(theme, width, version), renderTagline(theme, width), renderBetaNotice(theme, width)];
  if (info) {
    const infoLine = renderSessionInfoLine(theme, width, info);
    if (infoLine !== null) lines.push(infoLine);
  }
  return lines;
}
