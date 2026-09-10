import { getAwarenessCommandDescriptor } from '@octocodeai/octocode-awareness';

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

/** Convert only result/row navigation; peer data and command parameters stay opaque. */
export function nativeContinuations(
  value: unknown,
  reservedParams: ReadonlySet<string>,
  command?: string,
): unknown {
  if (Array.isArray(value)) return value.map(child => nativeContinuations(child, reservedParams, command));
  const object = record(value);
  if (!object) return value;
  return Object.fromEntries(Object.entries(object).map(([key, child]) => [
    key,
    ['next', 'actions', 'continuations'].includes(key) ? nativeContinuation(child, reservedParams)
      : key === 'rows' ? nativeContinuations(child, reservedParams, command)
      : key === 'memories' && command === 'memory recall-verified'
        ? verifiedMemoryContinuations(child, reservedParams)
      : key === 'undo_preview' && command === 'history restore-apply'
        && record(child)?.command === 'history restore-preview'
        ? nativeContinuation(child, reservedParams)
        : child,
  ]));
}

/** Verified-memory history evidence is a nested continuation outside the generic rows envelope. */
function verifiedMemoryContinuations(value: unknown, reservedParams: ReadonlySet<string>): unknown {
  if (!Array.isArray(value)) return value;
  return value.map(memory => {
    const object = record(memory);
    const historyEvidence = object ? record(object.historyEvidence) : undefined;
    const next = historyEvidence && record(historyEvidence.next);
    const call = next && record(next.call);
    if (
      !object || !historyEvidence || !call
      || call.command !== 'history inspect'
      || !record(call.params)
    ) return memory;
    return {
      ...object,
      historyEvidence: {
        ...historyEvidence,
        next: nativeContinuation(next, reservedParams),
      },
    };
  });
}

function nativeContinuation(value: unknown, reservedParams: ReadonlySet<string>): unknown {
  if (Array.isArray(value)) return value.map(child => nativeContinuation(child, reservedParams));
  const object = record(value);
  if (!object) return value;
  if (
    typeof object.command === 'string' &&
    record(object.params) &&
    getAwarenessCommandDescriptor(object.command)
  ) {
    const params = Object.fromEntries(
      Object.entries(record(object.params)!).filter(
        ([key]) => !reservedParams.has(key)
      )
    );
    return {
      tool: 'awareness',
      queries: [
        {
          reasoning: 'Continue the requested Awareness results',
          action: 'call',
          command: object.command,
          params,
        },
      ],
    };
  }
  return Object.fromEntries(
    Object.entries(object).map(([key, child]) => [
      key,
      nativeContinuation(child, reservedParams),
    ])
  );
}
