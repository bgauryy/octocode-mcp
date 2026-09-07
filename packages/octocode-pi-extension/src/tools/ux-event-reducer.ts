import type { UxSeverity, UxSnapshotV1 } from './ux-snapshot.js';

export type UxEntityKind = 'session' | 'plan' | 'task' | 'agent' | 'check' | 'interaction' | 'message' | 'tool';

export interface UxEventV1 {
  version: 1;
  id: string;
  entityId: string;
  entityKind: UxEntityKind;
  correlationId?: string;
  previousState?: string;
  nextState: string;
  source: string;
  sourceSequence: number;
  observedAt: number;
  expiresAt?: number;
  label: string;
  evidence?: string;
  severity: UxSeverity;
  requiresAction: boolean;
  detailRoute: string;
}

export interface UxEventStateV1 {
  version: 1;
  events: Readonly<Record<string, UxEventV1>>;
  sequences: Readonly<Record<string, number>>;
  staleRejected: number;
  coalesced: number;
  reconciledAt?: number;
}

function entityKey(event: Pick<UxEventV1, 'source' | 'entityKind' | 'entityId'>): string {
  return `${event.source}:${event.entityKind}:${event.entityId}`;
}

function freezeState(state: UxEventStateV1): UxEventStateV1 {
  Object.values(state.events).forEach(Object.freeze);
  Object.freeze(state.events);
  Object.freeze(state.sequences);
  return Object.freeze(state);
}

export function createUxEventState(): UxEventStateV1 {
  return freezeState({ version: 1, events: {}, sequences: {}, staleRejected: 0, coalesced: 0 });
}

export function reduceUxEvent(state: UxEventStateV1, event: UxEventV1): UxEventStateV1 {
  const key = entityKey(event);
  const latestSequence = state.sequences[key];
  if (latestSequence !== undefined && event.sourceSequence <= latestSequence) {
    return freezeState({ ...state, staleRejected: state.staleRejected + 1 });
  }
  const previous = state.events[key];
  const coalesced = previous?.nextState === event.nextState;
  return freezeState({
    ...state,
    events: { ...state.events, [key]: { ...event } },
    sequences: { ...state.sequences, [key]: event.sourceSequence },
    coalesced: state.coalesced + Number(coalesced),
  });
}

export function selectUxEvents(state: UxEventStateV1, now = Date.now()): UxEventV1[] {
  return Object.values(state.events)
    .filter((event) => event.requiresAction || event.expiresAt === undefined || event.expiresAt > now)
    .sort((a, b) => Number(b.requiresAction) - Number(a.requiresAction)
      || b.observedAt - a.observedAt || a.id.localeCompare(b.id));
}

function canonicalState(snapshot: UxSnapshotV1, kind: UxEntityKind, id: string): string | undefined {
  if (kind === 'session') return snapshot.session.activity.kind;
  if (kind === 'plan') return snapshot.plan?.id === id ? snapshot.plan.phase : undefined;
  if (kind === 'task') return snapshot.tasks.find((task) => task.id === id)?.status;
  if (kind === 'agent') return snapshot.agents.find((agent) => agent.id === id)?.state;
  if (kind === 'message' && id === 'messages') return snapshot.messages.unread + snapshot.messages.queued > 0 ? 'pending' : 'clear';
  return undefined;
}

export function reconcileUxEvents(state: UxEventStateV1, snapshot: UxSnapshotV1): UxEventStateV1 {
  const events = Object.fromEntries(Object.entries(state.events).filter(([, event]) =>
    canonicalState(snapshot, event.entityKind, event.entityId) === undefined));
  return freezeState({ ...state, events, reconciledAt: snapshot.observedAt });
}
