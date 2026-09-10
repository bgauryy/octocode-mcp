import type { ForegroundActivity, RuntimeState } from './runtime-store.js';
import type { SemanticToken } from '../tui/palette.js';
import { activeExecutionTools } from './execution-event-io.js';

export interface ActivityPresentation {
  visible: boolean;
  status?: string;
  message?: string;
  token: SemanticToken;
  attention?: boolean;
  since?: number;
}

export function activityPresentation(
  activity: ForegroundActivity
): ActivityPresentation {
  const since = 'since' in activity ? activity.since : undefined;
  let status: string | undefined;
  switch (activity.kind) {
    case 'idle':
      return { visible: false, token: 'dim' };
    case 'thinking':
      status = 'Working';
      break;
    case 'researching':
      status = `Researching${activity.detail ? ` · ${activity.detail}` : ''}`;
      break;
    case 'awaiting_input':
      status = activity.question || 'Input needed';
      break;
    case 'planning':
      status = `Planning${activity.detail ? ` · ${activity.detail}` : ''}`;
      break;
    case 'reviewing':
      status = 'Review plan · Start or Request changes';
      break;
    case 'awaiting_start':
      status = 'Plan ready · Review and Start';
      break;
    case 'ready_to_work':
      status = `Ready · ${activity.label}`;
      break;
    case 'working':
      status = activity.label;
      break;
    case 'verifying':
      status = `Verifying${activity.label ? ` · ${activity.label}` : ''}`;
      break;
    case 'blocked':
      status = `Blocked · ${activity.label}`;
      break;
    case 'complete':
      status = activity.label ? `Complete · ${activity.label}` : 'Complete';
      break;
    case 'failed':
      status = `Failed · ${activity.label}`;
      break;
  }
  const attention = [
    'awaiting_input',
    'reviewing',
    'awaiting_start',
    'blocked',
    'failed',
  ].includes(activity.kind);
  const visible = [
    'thinking',
    'researching',
    'planning',
    'working',
    'verifying',
  ].includes(activity.kind);
  return {
    visible,
    status,
    message: visible ? status : undefined,
    since,
    attention,
    token:
      activity.kind === 'failed'
        ? 'error'
        : attention
          ? 'warning'
          : activity.kind === 'complete'
            ? 'success'
            : 'brand',
  };
}

/** One priority rule for the live footer and Pi's motion indicator. */
export function runtimeActivityPresentation(
  state: Pick<RuntimeState, 'activity' | 'execution'>
): ActivityPresentation {
  const pending = Object.values(state.execution.interactions).find(
    item => item.status === 'waiting'
  );
  if (pending)
    return {
      visible: false,
      status: `${pending.kind === 'permission' ? 'Permission required' : 'Input needed'} · ${pending.title}`,
      token: 'warning',
      attention: true,
      since: pending.startedAt,
    };
  if (state.execution.compacting)
    return { visible: true, status: 'Compacting context', token: 'brand' };
  const calls = activeExecutionTools(state.execution);
  const latest = calls.at(-1);
  if (latest)
    return {
      visible: true,
      status: `${latest.title}${calls.length > 1 ? ` · ${calls.length} tools` : ''}`,
      token: 'brand',
      since: latest.startedAt,
    };
  if (state.execution.progress)
    return {
      visible: true,
      status: state.execution.progress.message,
      token: 'brand',
      since: state.execution.progress.since,
    };
  return activityPresentation(state.activity);
}
