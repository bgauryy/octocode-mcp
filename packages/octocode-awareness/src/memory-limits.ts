/** Ranked recall is bounded evidence discovery, not an exhaustive inventory. */
export interface MemoryRecallBounds {
  partial: boolean;
  partialReasons: Array<'candidate_limit' | 'result_limit'>;
  terminalLimit?: {
    code: 'MEMORY_RECALL_LIMIT';
    candidateLimit: number;
    resultLimit: number;
    message: string;
  };
}

export function memoryRecallBounds(candidateLimited: boolean, resultLimited: boolean, candidateLimit: number, resultLimit: number): MemoryRecallBounds {
  const partialReasons: MemoryRecallBounds['partialReasons'] = [];
  if (candidateLimited) partialReasons.push('candidate_limit');
  if (resultLimited) partialReasons.push('result_limit');
  return {
    partial: partialReasons.length > 0,
    partialReasons,
    ...(partialReasons.length ? { terminalLimit: {
      code: 'MEMORY_RECALL_LIMIT' as const, candidateLimit, resultLimit,
      message: 'Ranked recall is bounded and has no stable continuation. Narrow file, artifact, reference or query filters; do not treat omitted evidence as absent.',
    } } : {}),
  };
}
