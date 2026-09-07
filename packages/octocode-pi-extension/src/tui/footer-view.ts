import { truncateToWidth, visibleWidth } from './width.js';
/** Pure footer view: state collection stays outside, layout stays testable here. */
import type { PiTheme } from '../types.js';
import { renderInlineRows, type InlineSegment, type TuiRenderContext } from './components.js';
import { paint, SEP, type SemanticToken } from './palette.js';


export interface FooterAgentView {
  label: string;
  state: string;
  elapsed: string;
  task?: string;
  doing?: string;
  token?: SemanticToken;
  attention?: boolean;
}

export interface FooterViewProps {
  /**
   * Semantic footer rows. Each row wraps responsively, but no state is replaced
   * by a `+N` disclosure. Keep related facts together (activity/context, plan,
   * repository identity, metrics) so a narrow terminal never hides an entire
   * category of live state.
   */
  rows: readonly (readonly InlineSegment[])[];
  agents?: readonly FooterAgentView[];
}

function agentRow(agent: FooterAgentView, context: TuiRenderContext): string[] {
  const stateToken = agent.token ?? (agent.state === 'failed' ? 'error' : agent.state === 'blocked' ? 'warning' : agent.state === 'done' ? 'success' : 'brand');
  const state = paint(context.theme, stateToken, agent.state);
  const emphasizedState = agent.attention && context.theme ? context.theme.bold(state) : state;
  const activity = agent.doing ? `doing ${agent.doing}` : agent.task ? `task ${agent.task}` : '';
  const tail: InlineSegment[] = [
    ...(agent.attention ? [{ text: '/octocode-inbox', token: 'link' as const, attention: true }] : []),
    { text: agent.elapsed, token: 'dim' },
    ...(activity ? [{ text: activity, token: 'muted' as const }] : []),
  ];

  // A worker always owns exactly one physical footer row. Stable height matters:
  // changing footer line count while live state ticks causes viewport movement and
  // makes transcript scrollback hard to inspect. Wide panes reserve room for the
  // highest-value tail; narrow panes preserve identity + state first.
  const tailReserve = context.width >= 52 && tail.length > 0
    ? Math.min(28, Math.floor(context.width / 3))
    : 0;
  const labelWidth = Math.max(
    0,
    context.width - 2 - visibleWidth(SEP) - visibleWidth(agent.state)
      - (tailReserve > 0 ? visibleWidth(SEP) + tailReserve : 0),
  );
  const label = truncateToWidth(agent.label, labelWidth);
  let line = labelWidth > 0
    ? `  ${paint(context.theme, 'muted', label)}${SEP}${emphasizedState}`
    : emphasizedState;

  for (const segment of tail) {
    const remaining = context.width - visibleWidth(line) - visibleWidth(SEP);
    if (remaining <= 0) break;
    const value = paint(context.theme, segment.token ?? 'dim', segment.text);
    const emphasized = segment.attention && context.theme ? context.theme.bold(value) : value;
    line = `${line}${SEP}${truncateToWidth(emphasized, remaining)}`;
    if (visibleWidth(emphasized) > remaining) break;
  }
  return [truncateToWidth(line, context.width)];
}

/** Unified persistent state: responsive semantic rows plus every visible worker. */
export function renderFooterView(props: FooterViewProps, context: TuiRenderContext & { theme?: PiTheme }): string[] {
  const header = props.rows.flatMap((segments) => renderInlineRows({ segments }, context));
  const agents = (props.agents ?? [])
    .filter((agent) => agent.state !== 'killed')
    .map((agent, index) => ({ agent, index }))
    .sort((a, b) => Number(b.agent.attention) - Number(a.agent.attention) || a.index - b.index)
    .map(({ agent }) => agent);
  return [...header, ...agents.flatMap((agent) => agentRow(agent, context))];
}
