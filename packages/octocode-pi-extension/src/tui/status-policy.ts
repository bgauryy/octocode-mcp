import type { InlineSegment } from './components.js';
import type { UxPriority, UxSnapshotV1 } from '../tools/ux-snapshot.js';

export type StatusDensity = 'automatic' | 'compact' | 'expanded';

export interface StatusDiagnosticV1 {
  id: string;
  priority: UxPriority;
  segments: readonly InlineSegment[];
}

export interface StatusPolicyOptions {
  width: number;
  height: number;
  density?: StatusDensity;
  diagnostics?: readonly StatusDiagnosticV1[];
}

export interface StatusSelectionV1 {
  rows: InlineSegment[][];
  rowIds: string[];
  maxRows: number;
  omitted: number;
  detailRoutes: string[];
}

interface Candidate {
  id: string;
  priority: UxPriority;
  order: number;
  segments: InlineSegment[];
  detailRoute?: string;
}

const PRIORITY_ORDER: Record<UxPriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 };

function rowBudget(height: number, density: StatusDensity): number {
  const safeHeight = Math.max(1, Math.floor(Number.isFinite(height) ? height : 40));
  if (density === 'compact') return Math.min(2, safeHeight);
  if (density === 'expanded') return Math.min(10, Math.max(1, safeHeight - 4));
  return Math.min(6, Math.max(1, Math.floor(safeHeight * 0.15)));
}

function plural(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

function planSegments(snapshot: UxSnapshotV1): InlineSegment[] | undefined {
  const plan = snapshot.plan;
  if (!plan) return undefined;
  if (plan.phase === 'verifying' || plan.verifying > 0) return [
    { text: 'Verify', token: 'brand' },
    { text: plural(plan.done, 'passed'), token: 'success' },
    ...(plan.verifying > 0 ? [{ text: plural(plan.verifying, 'running'), token: 'brand' as const }] : []),
    ...(plan.blocked > 0 ? [{ text: plural(plan.blocked, 'pending'), token: 'warning' as const, attention: true }] : []),
  ];
  if (plan.progressMode === 'linear' && plan.displayTotal !== undefined) {
    const current = snapshot.tasks.find((task) => task.status === 'doing')
      ?? snapshot.tasks.find((task) => task.status === 'todo')
      ?? snapshot.tasks.find((task) => task.status === 'blocked');
    return [
      { text: `Plan ${plan.done}/${plan.displayTotal}`, token: plan.blocked > 0 ? 'warning' : 'brand', attention: plan.blocked > 0 },
      ...(current ? [{ text: `task ${current.index} ${current.activeLabel ?? current.label}`, token: current.status === 'blocked' ? 'warning' as const : 'muted' as const }] : []),
      { text: 'plan', token: 'link' },
    ];
  }
  return [
    { text: 'Plan', token: plan.blocked > 0 || plan.failed > 0 ? 'warning' : 'brand', attention: plan.blocked > 0 || plan.failed > 0 },
    { text: `${plan.done} done`, token: 'success' },
    ...(plan.active > 0 ? [{ text: `${plan.active} active`, token: 'brand' as const }] : []),
    ...(plan.ready > 0 ? [{ text: `${plan.ready} ready`, token: 'muted' as const }] : []),
    ...(plan.blocked > 0 ? [{ text: `${plan.blocked} waiting`, token: 'warning' as const, attention: true }] : []),
    ...(plan.progressMode === 'dynamic' ? [{ text: 'scope changing', token: 'warning' as const }] : []),
    { text: 'plan', token: 'link' },
  ];
}

function attentionCandidates(snapshot: UxSnapshotV1): Candidate[] {
  return snapshot.attention
    .filter((item) => item.kind === 'input'
      || item.kind === 'authorization'
      || item.kind === 'runtime_failed'
      || item.kind === 'plan_blocked'
      || item.kind === 'stale_source')
    .map((item) => ({
      id: `attention:${item.id}`,
      priority: item.priority,
      order: -item.createdAt,
      segments: [
        { text: item.priority === 'P0' ? 'Needs you' : item.kind === 'runtime_failed' ? 'Failed' : item.kind === 'plan_blocked' ? 'Blocked' : item.actor, token: item.severity === 'error' ? 'error' : 'warning', attention: true },
        { text: item.reason, token: item.severity === 'error' ? 'error' : 'muted' },
        ...(item.requiredAction ? [{ text: item.requiredAction, token: 'muted' as const }] : []),
        { text: item.detailRoute, token: 'link', attention: true },
      ],
      detailRoute: item.detailRoute,
    }));
}

function agentCandidates(snapshot: UxSnapshotV1): Candidate[] {
  if (snapshot.agents.length === 0) return [];
  const attention = snapshot.agents
    .filter((agent) => agent.state === 'blocked' || agent.state === 'failed' || agent.state === 'error')
    .sort((a, b) => b.updatedAt - a.updatedAt || a.id.localeCompare(b.id))
    .map((agent, index): Candidate => ({
      id: `agent:${agent.id}:${agent.state}`,
      priority: 'P2',
      order: index,
      segments: [
        { text: `${agent.label} ${agent.state}`, token: agent.state === 'blocked' ? 'warning' : 'error', attention: true },
        { text: '/octocode-inbox', token: 'link', attention: true },
        ...(agent.assignment ? [{ text: agent.assignment, token: 'muted' as const }] : []),
      ],
      detailRoute: '/octocode-inbox',
    }));
  const normalizedState = (state: string): string => {
    if (state === 'completed' || state === 'exited') return 'done';
    if (state === 'error') return 'failed';
    return state;
  };
  const counts = new Map<string, number>();
  for (const agent of snapshot.agents) {
    const state = normalizedState(agent.state);
    counts.set(state, (counts.get(state) ?? 0) + 1);
  }
  // Blocked and failed workers already own named attention rows above; repeating
  // their counts here would give one semantic fact two ambient owners.
  const stateOrder = ['running', 'idle', 'queued', 'done', 'killed'];
  const summaryParts = stateOrder.flatMap((state) => {
    const count = counts.get(state) ?? 0;
    return count > 0 ? [{ text: `${count} ${state}`, token: state === 'failed' ? 'error' as const : state === 'blocked' ? 'warning' as const : 'muted' as const }] : [];
  });
  // When every agent already has a named attention row there is nothing useful to
  // add in a summary — suppress it to avoid a redundant 'Agents N · /octocode-inbox' row.
  if (summaryParts.length === 0 && attention.length > 0) return attention;
  const summary: Candidate = {
    id: 'agents:summary',
    priority: 'P2',
    order: 1_000,
    segments: [
      { text: `Agents ${snapshot.agents.length}`, token: 'brand' },
      ...summaryParts,
      { text: '/octocode-inbox', token: 'link' },
    ],
    detailRoute: '/octocode-inbox',
  };
  return [...attention, summary];
}

function candidates(snapshot: UxSnapshotV1, diagnostics: readonly StatusDiagnosticV1[]): Candidate[] {
  const result: Candidate[] = attentionCandidates(snapshot);
  const activityAttention = snapshot.session.activity.kind === 'awaiting_input'
    || snapshot.session.activity.kind === 'awaiting_start'
    || snapshot.session.activity.kind === 'blocked'
    || snapshot.session.activity.kind === 'failed';
  if (!activityAttention && snapshot.session.activity.kind !== 'idle') {
    const elapsedSec = Math.max(0, Math.floor((snapshot.observedAt - snapshot.session.activity.since) / 1_000));
    // Animate dots for "actively working" states so the footer visually signals
    // progress on every 1s tick: Thinking → Thinking. → Thinking.. → Thinking...
    const animated = snapshot.session.activity.kind === 'thinking'
      || snapshot.session.activity.kind === 'researching'
      || snapshot.session.activity.kind === 'planning'
      || snapshot.session.activity.kind === 'working'
      || snapshot.session.activity.kind === 'verifying';
    const dots = animated ? '.'.repeat(elapsedSec % 4) : '';
    result.push({
      id: 'session:activity', priority: 'P1', order: 0,
      segments: [
        { text: `${snapshot.session.activity.label}${dots}`, token: 'brand' },
        { text: `${elapsedSec}s`, token: 'dim' },
      ],
    });
  }
  const plan = planSegments(snapshot);
  if (plan) result.push({ id: 'plan:progress', priority: 'P1', order: 10, segments: plan, detailRoute: 'plan' });
  result.push(...agentCandidates(snapshot));
  if (snapshot.messages.unread + snapshot.messages.queued > 0) result.push({
    id: 'messages:summary', priority: 'P2', order: 2_000,
    segments: [
      { text: `${snapshot.messages.unread + snapshot.messages.queued} messages pending`, token: 'link', attention: true },
      ...(snapshot.messages.latestSender ? [{ text: `latest from ${snapshot.messages.latestSender}`, token: 'muted' as const }] : []),
      { text: snapshot.messages.detailRoute, token: 'link', attention: true },
    ],
    detailRoute: snapshot.messages.detailRoute,
  });
  if (snapshot.session.contextPressure !== undefined) result.push({
    id: 'context:pressure', priority: 'P3', order: 0,
    segments: [{
      text: `ctx ${snapshot.session.contextPressure}%`,
      token: snapshot.session.contextPressure >= 97 ? 'error' : snapshot.session.contextPressure >= 90 ? 'warning' : 'dim',
      attention: snapshot.session.contextPressure >= 90,
    }],
    detailRoute: '/configuration',
  });
  for (const diagnostic of diagnostics) result.push({
    id: `diagnostic:${diagnostic.id}`, priority: diagnostic.priority, order: 0,
    segments: diagnostic.segments.map((segment) => ({ ...segment })),
  });
  return result.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
    || a.order - b.order || a.id.localeCompare(b.id));
}

function compactCandidates(all: Candidate[]): Candidate[] {
  const activity = all.find((candidate) => candidate.id === 'session:activity');
  const plan = all.find((candidate) => candidate.id === 'plan:progress');
  const agentAttention = all.filter((candidate) => candidate.id.startsWith('agent:'));
  const removed = new Set<string>();
  const grouped: Candidate[] = [];
  if (activity && plan) {
    removed.add(activity.id);
    removed.add(plan.id);
    grouped.push({
      id: 'outcome:current', priority: 'P1', order: 0, detailRoute: 'plan',
      segments: [
        ...activity.segments,
        ...plan.segments.filter((segment) => !segment.text.startsWith('task ')),
      ],
    });
  }
  if (agentAttention.length > 0) {
    for (const candidate of agentAttention) removed.add(candidate.id);
    const MAX_NAMED = 2;
    const visibleAttention = agentAttention.slice(0, MAX_NAMED);
    const overflow = agentAttention.length - MAX_NAMED;
    grouped.push({
      id: 'agents:attention', priority: 'P2', order: -1, detailRoute: '/octocode-inbox',
      segments: [
        ...visibleAttention.flatMap((candidate) => candidate.segments.slice(0, 1)),
        ...(overflow > 0 ? [{ text: `+${overflow}`, token: 'warning' as const, attention: true }] : []),
        { text: '/octocode-inbox', token: 'link', attention: true },
      ],
    });
  }
  return [...all.filter((candidate) => !removed.has(candidate.id)), ...grouped]
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
      || a.order - b.order || a.id.localeCompare(b.id));
}

export function selectStatusRows(snapshot: UxSnapshotV1, options: StatusPolicyOptions): StatusSelectionV1 {
  const density = options.density ?? 'automatic';
  const maxRows = rowBudget(options.height, density);
  const projected = density === 'compact'
    ? compactCandidates(candidates(snapshot, options.diagnostics ?? []))
    : candidates(snapshot, options.diagnostics ?? []);
  const selected = projected.slice(0, maxRows);
  const omittedCandidates = projected.slice(maxRows);
  const omitted = omittedCandidates.length;
  const detailRoutes = [...new Set(omittedCandidates.flatMap((candidate) => candidate.detailRoute ? [candidate.detailRoute] : []))];
  const rows = selected.map((candidate) => candidate.segments);
  if (omitted > 0 && selected[0]?.priority !== 'P0') {
    const urgentContext = omittedCandidates.find((candidate) => candidate.id === 'context:pressure'
      && candidate.segments.some((segment) => segment.attention));
    const decisionRelevant = omittedCandidates.filter((candidate) => PRIORITY_ORDER[candidate.priority] <= PRIORITY_ORDER.P3
      && candidate !== urgentContext);
    const route = urgentContext?.detailRoute ?? decisionRelevant[0]?.detailRoute;
    rows[0] = [
      ...(urgentContext ? urgentContext.segments : []),
      ...(route ? [{ text: route, token: 'link' as const, attention: true }] : []),
      ...(decisionRelevant.length > 0 ? [{ text: `${decisionRelevant.length} more`, token: 'muted' as const }] : []),
      ...rows[0]!,
    ];
  }
  return {
    rows,
    rowIds: selected.map((candidate) => candidate.id),
    maxRows,
    omitted,
    detailRoutes,
  };
}
