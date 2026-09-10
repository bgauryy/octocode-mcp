import {
  createExecutionState,
  isExecutionEvent,
  reduceExecutionEvent,
  type ExecutionEvent,
  type ExecutionState,
  type ExecutionTool,
} from './execution-events.js';

export function serializeExecutionEvents(
  events: readonly ExecutionEvent[]
): string {
  return (
    events.map(event => JSON.stringify(event)).join('\n') +
    (events.length ? '\n' : '')
  );
}

/** Replay JSONL without allocating a second full-size array of every journal line. */
export function replayExecutionEvents(jsonl: string): ExecutionState {
  let state = createExecutionState();
  let lineNumber = 0;
  let offset = 0;
  while (offset <= jsonl.length) {
    const newline = jsonl.indexOf('\n', offset);
    const end = newline === -1 ? jsonl.length : newline;
    const line = jsonl.slice(offset, end);
    lineNumber += 1;
    if (line.trim()) {
      try {
        const value: unknown = JSON.parse(line);
        if (!isExecutionEvent(value))
          throw new Error('Invalid execution event');
        state = reduceExecutionEvent(state, value);
      } catch (error) {
        throw new Error(`Invalid execution event at line ${lineNumber}`, {
          cause: error,
        });
      }
    }
    if (newline === -1) break;
    offset = newline + 1;
  }
  return state;
}

export function activeExecutionTools(state: ExecutionState): ExecutionTool[] {
  return state.activeToolIds.flatMap(id =>
    state.tools[id] ? [state.tools[id]] : []
  );
}
