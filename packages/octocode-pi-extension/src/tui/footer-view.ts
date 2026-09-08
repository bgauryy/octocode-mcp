/** Pure footer view: state collection and ranking stay outside. */
import type { PiTheme } from '../types.js';
import type { InlineSegment, TuiRenderContext } from './components.js';
import { paint, SEP } from './palette.js';
import { truncateToWidth, visibleWidth } from './width.js';

export interface FooterViewProps {
  /** Already-selected semantic rows. Each row owns exactly one physical line. */
  rows: readonly (readonly InlineSegment[])[];
}

function compactRoute(text: string): string {
  if (text === '/octocode-inbox') return 'inbox';
  if (text === '/configuration') return 'config';
  return text;
}

function isRoute(segment: InlineSegment): boolean {
  return segment.text.startsWith('/') || segment.text === 'plan' || segment.text === 'transcript' || segment.text === 'interaction';
}

function renderSemanticRow(segments: readonly InlineSegment[], context: TuiRenderContext): string | undefined {
  const visible = segments.filter((segment) => Boolean(segment.text?.trim()));
  if (visible.length === 0) return undefined;
  const first = visible[0]!;
  const routes = visible.slice(1).filter(isRoute);
  const required = visible.slice(1).filter((segment) => segment.attention && !isRoute(segment));
  const optional = visible.slice(1).filter((segment) => !segment.attention && !isRoute(segment));
  const attentionRoutes = routes.filter((r) => r.attention);
  const tailRoutes = routes.filter((r) => !r.attention);
  const ordered = [first, ...attentionRoutes, ...required, ...optional, ...tailRoutes];
  let line = '';
  for (const segment of ordered) {
    const text = compactRoute(segment.text);
    const colored = paint(context.theme, segment.token ?? 'dim', text);
    const value = segment.attention && context.theme?.bold ? context.theme.bold(colored) : colored;
    const joiner = line ? SEP : '';
    const remaining = context.width - visibleWidth(line) - visibleWidth(joiner);
    if (remaining <= 0) break;
    const clipped = truncateToWidth(value, remaining);
    if (!clipped) break;
    line = `${line}${joiner}${clipped}`;
    if (visibleWidth(value) > remaining) break;
  }
  return truncateToWidth(line, context.width);
}

/** Render the status policy's selected rows without reading or ranking state. */
export function renderFooterView(props: FooterViewProps, context: TuiRenderContext & { theme?: PiTheme }): string[] {
  return props.rows
    .map((segments) => renderSemanticRow(segments, context))
    .filter((line): line is string => Boolean(line));
}
