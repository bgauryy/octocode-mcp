import { truncateToWidth, visibleWidth } from '../tui/width.js';
/**
 * Pure functions for rendering the Octocode banner and tagline.
 *
 * All output is width-safe: every line is measured and truncated through the
 * same ANSI-aware helpers used by the rest of the extension so pi's TUI never
 * sees a line whose visible width exceeds the terminal width.
 */

import { BETA_ISSUES_PREFIX, BETA_ISSUES_URL, BETA_LABEL, TAGLINE } from '../tui/content.js';
import { paint, SEP } from '../tui/palette.js';

// ─── Minimal theme interface ──────────────────────────────────────────────────

/** Subset of PiTheme required by banner functions. */
export interface BannerTheme {
  fg(color: string, text: string): string;
  bold(text: string): string;
}

// ─── Constants ────────────────────────────────────────────────────────────────


/** Each word is a separate paint span at every terminal width. */
const OCTOCODE_ART: readonly string[] = [
    ' ██████╗  ██████╗████████╗ ██████╗  ██████╗ ██████╗ ██████╗ ███████╗',
    '██╔═══██╗██╔════╝╚══██╔══╝██╔═══██╗██╔════╝██╔═══██╗██╔══██╗██╔════╝',
    '██║   ██║██║        ██║   ██║   ██║██║     ██║   ██║██║  ██║█████╗  ',
    '██║   ██║██║        ██║   ██║   ██║██║     ██║   ██║██║  ██║██╔══╝  ',
    '╚██████╔╝╚██████╗   ██║   ╚██████╔╝╚██████╗╚██████╔╝██████╔╝███████╗',
    ' ╚═════╝  ╚═════╝   ╚═╝    ╚═════╝  ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝',
  ];
const CODE_ART: readonly string[] = [
  ' ██████╗ ██████╗ ██████╗ ███████╗',
  '██╔════╝██╔═══██╗██╔══██╗██╔════╝',
  '██║     ██║   ██║██║  ██║█████╗',
  '██║     ██║   ██║██║  ██║██╔══╝',
  '╚██████╗╚██████╔╝██████╔╝███████╗',
  ' ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝',
];
const OCTOCODE_WIDTH = Math.max(...OCTOCODE_ART.map(visibleWidth));
const WORDMARK_WIDTH = OCTOCODE_WIDTH + 2 + Math.max(...CODE_ART.map(visibleWidth));

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * The banner art painted with two solid, theme-owned colors. Pure in (theme,
 * width): identical input → byte-identical output, so repaints are free.
 * The art is shown only when both complete words fit.
 */
export function renderWordmarkLines(theme: BannerTheme, width: number): string[] {
  // Narrow terminals: the art cannot survive a hard clip (each row degrades to
  // a mid-letter fragment + "…"), so below WORDMARK_WIDTH fall back to the
  // compact brand mark. Still pure in (theme, width) — no animation.
  //
  // HEIGHT STABILITY: always return exactly OCTOCODE_ART.length lines, even
  // in compact mode. The banner is the FIRST entry in the transcript, so its
  // line number is 0 in the document. If its height changes (1 vs 6 lines)
  // on a terminal resize across the WORDMARK_WIDTH boundary, pi-tui's
  // differential renderer sees firstChanged=0 < viewportTop → fullRender(true)
  // → clears scrollback → user loses their scroll position. Padding with empty
  // strings keeps the height constant; the blank rows are invisible above
  // committed messages in a live session.
  if (width < WORDMARK_WIDTH) {
    const mark = `${paint(theme, 'brand', 'octocode')} ${paint(theme, 'brandAlt', 'code')}`;
    const lines: string[] = [truncateToWidth(mark, width)];
    while (lines.length < OCTOCODE_ART.length) lines.push('');
    return lines;
  }
  return OCTOCODE_ART.map((line, row) =>
    `${paint(theme, 'brand', line.padEnd(OCTOCODE_WIDTH))}  ${paint(theme, 'brandAlt', CODE_ART[row] ?? '')}`,
  );
}

/**
 * Build the two-color OCTOCODE CODE banner with an optional version row.
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
 * Beta is release metadata, styled quietly beside the issue-tracker URL. Keep the URL literal instead of OSC 8
 * here: startup lines are width-sanitized/truncated, and raw URLs are more
 * reliable across terminals while still auto-linking in most emulators.
 */
export function renderBetaNotice(theme: BannerTheme, width: number): string {
  const line = `${paint(theme, 'muted', BETA_LABEL)} ${paint(theme, 'muted', `· ${BETA_ISSUES_PREFIX}`)} ${paint(theme, 'link', BETA_ISSUES_URL)}`;
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
