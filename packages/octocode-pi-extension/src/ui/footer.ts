import os from 'node:os';
import path from 'node:path';
import type { ExtensionAPI, ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import { truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import { PERMISSION_ID, shortChip } from '../permission/mode.js';
import { formatCost, formatTokens, formatTokenUsage } from '../shared/format.js';
import { sanitizeTerminalText } from '../shared/sanitize.js';
import { addReply, carriesUsage, emptyTotals, modelLookup, unpricedModel, type UsageTotals } from '../shared/util.js';

/**
 * Octocode's two-line footer, in the order other coding agents converged on: line 1 is what the agent is and is doing
 * (model, permission mode, thinking, context, running agents and bash jobs; speed and cost on the right), line 2 is where
 * it works (cwd, branch, session name, tokens, other extensions' statuses such as Pi's MCP and Octocode's hooks). Pure in (state, statuses, width) and
 * never animated: Pi repaints the footer on every streamed token.
 */

export interface FooterState {
  model?: string | undefined;
  /** Thinking level, only for models that reason. */
  thinking?: string | undefined;
  /** `percent` is null right after compaction, until the next response. */
  context?: { percent: number | null; window: number } | undefined;
  /** The session's replies and subagent results: ↑ counts the whole prompt; `cost` is Pi's estimate. */
  usage: UsageTotals;
  cwd: string;
  home?: string | undefined;
  sessionName?: string | undefined;
}

type Color = Parameters<Theme['fg']>[0];
type Paint = Pick<Theme, 'fg' | 'bold'>;

/** Status keys this footer places itself; any other extension's status is appended to line 2. */
const OWN = { permission: PERMISSION_ID, team: 'octocode-team', bash: 'octocode-bash', speed: 'octocode-speed' } as const;
const BAR_CELLS = 8;
const BRANCH_MAX = 24;

/** An 8-cell gauge and its colour: green under half, yellow to 80%, red above. */
export function contextBar(percent: number): { bar: string; color: Color } {
  const filled = Math.min(BAR_CELLS, Math.max(0, Math.floor((percent / 100) * BAR_CELLS)));
  return { bar: '▰'.repeat(filled) + '▱'.repeat(BAR_CELLS - filled), color: percent > 80 ? 'error' : percent >= 50 ? 'warning' : 'success' };
}

/**
 * A part of a line. Parts drop (or switch to `short`) lowest `priority` first until the line fits; `keep` parts are
 * shortened last; on very narrow rows the highest priority part survives.
 */
interface Part {
  text: string;
  priority: number;
  keep?: boolean;
  short?: string;
}

function tilde(cwd: string, home: string | undefined): string {
  if (!home) return cwd;
  const relative = path.relative(home, cwd);
  return relative === '' ? '~' : relative.startsWith('..') || path.isAbsolute(relative) ? cwd : `~${path.sep}${relative}`;
}

const oneLine = (text: string) => text.replace(/[\r\n\t\u2028\u2029]/g, ' ').replace(/ +/g, ' ').trim();
const plainRow = (text: string) => oneLine(sanitizeTerminalText(text));

/** Joins the left parts with dim dots and pushes the right parts to the edge, shortening and dropping until it fits. */
function fit(left: Part[], right: Part[], theme: Paint, width: number): string {
  const dot = theme.fg('dim', ' · ');
  let parts = [...left, ...right].filter((part) => part.text !== '');
  const full = new Map(parts.map((part) => [part, part.text]));
  const render = () => {
    const l = left.filter((part) => parts.includes(part)).map((part) => part.text).join(dot);
    const r = right.filter((part) => parts.includes(part)).map((part) => part.text).join(dot);
    if (!r) return l;
    return `${l}${' '.repeat(Math.max(2, width - visibleWidth(l) - visibleWidth(r)))}${r}`;
  };
  while (visibleWidth(render()) > width) {
    const next = parts.filter((part) => !part.keep || part.short !== undefined).sort((a, b) => a.priority - b.priority)[0];
    if (!next) break;
    if (next.short !== undefined) {
      next.text = next.short;
      delete next.short;
    } else parts = parts.filter((part) => part !== next);
  }
  // A kept model or work status can itself exceed the row. Shorten lower-priority parts before the permission chip,
  // rather than clipping the complete row from the right and hiding its most important status.
  while (visibleWidth(render()) > width && parts.length > 1) {
    const next = [...parts].sort((a, b) => a.priority - b.priority)[0]!;
    const room = visibleWidth(next.text) - (visibleWidth(render()) - width);
    if (room > 1) next.text = truncateToWidth(next.text, room, theme.fg('dim', '…'));
    else parts = parts.filter((part) => part !== next);
  }
  // Shortening a later part can make room for an earlier label's full text again.
  for (const part of [...parts].sort((a, b) => b.priority - a.priority)) {
    const short = part.text;
    part.text = full.get(part)!;
    if (visibleWidth(render()) > width) part.text = short;
  }
  return truncateToWidth(render(), Math.max(0, width), theme.fg('dim', '…'));
}

export function footerLines(state: FooterState, branch: string | null, statuses: ReadonlyMap<string, string>, theme: Paint, width: number): string[] {
  const status = (key: string) => oneLine(statuses.get(key) ?? '');
  const model = plainRow(state.model ?? 'no model');
  const shortModel = plainRow(truncateToWidth(model, Math.max(1, Math.floor(width / 3)), '…'));
  const context = state.context;
  let ctx: Part = { text: '', priority: 60, keep: true };
  if (context) {
    const window = formatTokens(context.window);
    if (context.percent === null) ctx = { ...ctx, text: `${theme.fg('muted', 'ctx')} ${theme.fg('dim', `? of ${window}`)}` };
    else {
      const { bar, color } = contextBar(context.percent);
      const percent = theme.fg(color, `${Math.round(context.percent)}%`);
      ctx = { ...ctx, text: `${theme.fg('muted', 'ctx')} ${theme.fg(color, bar)} ${percent} ${theme.fg('dim', `of ${window}`)}`, short: `${theme.fg('muted', 'ctx')} ${percent}` };
    }
  }
  const cost = formatCost(state.usage);
  const top = fit(
    [
      { text: theme.fg('accent', model), priority: 94, keep: true, ...(shortModel !== model ? { short: theme.fg('accent', shortModel) } : {}) },
      // The mode is what the user most needs on a narrow terminal: kept, shortened last after the model.
      { text: status(OWN.permission), priority: 95, keep: true, short: shortChip(status(OWN.permission)) },
      { text: state.thinking ? theme.fg('muted', plainRow(state.thinking)) : '', priority: 30 },
      ctx,
      { text: status(OWN.team), priority: 90, keep: true },
      { text: status(OWN.bash), priority: 90, keep: true },
    ],
    [
      { text: status(OWN.speed) ? theme.fg('dim', status(OWN.speed)) : '', priority: 10 },
      { text: cost ? theme.fg('muted', cost) : '', priority: 40 },
    ],
    theme,
    width,
  );

  const place = plainRow(tilde(state.cwd, state.home));
  const shownBranch = branch ? plainRow(truncateToWidth(plainRow(branch), BRANCH_MAX, '…')) : branch;
  const where = (dir: string) => `${theme.fg('text', dir)}${shownBranch ? ` ${theme.fg('muted', `⎇ ${shownBranch}`)}` : ''}`;
  const usage = formatTokenUsage(state.usage);
  const tokens = usage ? theme.fg('dim', usage) : '';
  const others = [...statuses].filter(([key]) => !(Object.values(OWN) as string[]).includes(key)).sort(([a], [b]) => a.localeCompare(b));
  const bottom = fit(
    [
      { text: where(place), priority: 100, keep: true, short: where(plainRow(path.basename(state.cwd))) },
      // Session names come from anywhere (RPC, other extensions); Pi strips only newlines.
      { text: state.sessionName ? theme.fg('muted', plainRow(state.sessionName)) : '', priority: 50 },
      { text: tokens, priority: 60 },
      // As Pi's own footer does (sanitizeStatusText): a line break inside a footer row breaks pi-tui's row tracking.
      ...others.map(([, text]) => ({ text: oneLine(text), priority: 20 })),
    ],
    [],
    theme,
    width,
  );
  return [top, bottom];
}

type Reply = { role?: string; usage?: unknown };

/** A session entry that adds to the totals: an assistant reply, or a tool result that carries usage (a subagent's). */
function entryReply(entry: unknown): Reply | undefined {
  const message = (entry as { type?: string; message?: Reply }).message;
  if ((entry as { type?: string }).type !== 'message' || !message?.usage) return undefined;
  return carriesUsage(message.role) ? message : undefined;
}

/**
 * Replaces Pi's footer with `footerLines`. The state is sampled on events (session start, each finished message,
 * model and thinking changes, compaction, tree moves), never inside render: context usage walks the whole session.
 * Pi repaints the footer on every streamed token, so a frame whose inputs are unchanged reuses the built lines. It also
 * warns once when a reply's model has no pricing.
 */
export function registerFooter(pi: ExtensionAPI): void {
  registerUnpricedNotice(pi);
  const state: FooterState = { usage: emptyTotals(), cwd: process.cwd(), home: os.homedir() };
  /** Moves whenever `state` changes, so the render cache knows its lines are stale. */
  let version = 0;
  let repaint: (() => void) | undefined;
  const add = (reply: Reply | undefined, ctx: ExtensionContext) => {
    if (!reply) return;
    version += 1;
    addReply(state.usage, reply.usage, unpricedModel(reply, modelLookup(ctx)) !== undefined);
  };
  const sample = (ctx: ExtensionContext) => {
    version += 1;
    const model = ctx.model;
    state.model = model?.id;
    state.thinking = model?.reasoning ? pi.getThinkingLevel() : undefined;
    const usage = ctx.getContextUsage();
    state.context = usage ? { percent: usage.percent, window: usage.contextWindow } : model ? { percent: null, window: model.contextWindow } : undefined;
    state.cwd = ctx.cwd;
    state.sessionName = ctx.sessionManager.getSessionName?.();
    repaint?.();
  };
  // The footer is a terminal component (setFooter does nothing over RPC), so its bookkeeping runs only in the TUI.
  const refresh = async (_event: unknown, ctx: ExtensionContext) => {
    if (ctx.hasUI && ctx.mode === 'tui') sample(ctx);
  };

  pi.on('session_start', async (_event, ctx) => {
    if (!ctx.hasUI || ctx.mode !== 'tui') return;
    state.usage = emptyTotals();
    for (const entry of ctx.sessionManager.getEntries()) add(entryReply(entry), ctx);
    sample(ctx);
    ctx.ui.setFooter((tui, theme, data) => {
      repaint = () => tui.requestRender();
      const unsubscribe = data.onBranchChange(() => tui.requestRender());
      let cached: { key: string; lines: string[] } | undefined;
      return {
        render: (width: number) => {
          const branch = data.getGitBranch();
          const statuses = data.getExtensionStatuses();
          const key = [version, width, branch ?? '', ...[...statuses].flat()].join('\0');
          if (cached?.key !== key) cached = { key, lines: footerLines(state, branch, statuses, theme, width) };
          return cached.lines;
        },
        invalidate: () => {
          cached = undefined;
        },
        dispose: () => {
          unsubscribe();
          repaint = undefined;
        },
      };
    });
  });
  pi.on('message_end', async (event, ctx) => {
    if (!ctx.hasUI || ctx.mode !== 'tui') return;
    const reply = entryReply({ type: 'message', message: event.message });
    add(reply, ctx);
    // Context usage walks the session: only a reply changes it. A tool result (a subagent's cost) only adds usage.
    if (event.message.role === 'assistant') sample(ctx);
    else if (reply) repaint?.();
  });
  pi.on('session_tree', refresh);
  pi.on('model_select', refresh);
  pi.on('thinking_level_select', refresh);
  pi.on('session_compact', refresh);
  pi.on('agent_end', refresh);
  pi.on('session_info_changed', refresh);
}

/**
 * Says once per session, as a warning, that a reply came from a model without pricing: the cost shown leaves its usage
 * out (the displays mark it `n/a`). Not only in the TUI: an RPC client shows notifications too.
 */
function registerUnpricedNotice(pi: ExtensionAPI): void {
  let warned = false;
  pi.on('session_start', async () => {
    warned = false;
  });
  pi.on('message_end', async (event, ctx) => {
    if (warned || !ctx.hasUI || event.message.role !== 'assistant') return;
    const model = unpricedModel(event.message, modelLookup(ctx));
    if (!model) return;
    warned = true;
    ctx.ui.notify(`${sanitizeTerminalText(model)} has no pricing in models.json; its usage is not in the cost`, 'warning');
  });
}
