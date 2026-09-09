import type { AttendContinuation, AttendParams } from './attend-model.js';

const CONTINUATION_LIMIT = 50;

interface ContinuationInput {
  workspacePath: string;
  params: AttendParams;
  query: string;
  agentId: string;
  files: string[];
  limit: number;
  workboardPartial: boolean;
  evidenceOmittedCount: number;
  profilePartial: boolean;
  memorySnapshotPartial: boolean;
}

export function attendContinuations(input: ContinuationInput): {
  continuations: AttendContinuation[];
  partialReasons: string[];
} {
  const continuationLimit = Math.min(CONTINUATION_LIMIT, Math.max(input.limit + 1, input.limit * 2));
  const continuations: AttendContinuation[] = [];
  if (input.workboardPartial) {
    continuations.push({
      command: 'query workboard',
      params: {
        workspace: input.workspacePath,
        ...(input.params.artifact ? { artifact: input.params.artifact } : {}),
        ...(input.params.repo ? { repo: input.params.repo } : {}),
        ...(input.params.ref ? { ref: input.params.ref } : {}),
        ...(input.agentId ? { agent_id: input.agentId } : {}),
        ...(input.params.includeBodies ? { include_bodies: true } : {}),
        limit: continuationLimit,
        format: 'json',
      },
    });
  }
  if (input.evidenceOmittedCount > 0) {
    continuations.push({
      command: 'memory recall',
      params: {
        query: input.query || input.files.join(' '),
        limit: CONTINUATION_LIMIT,
        min_importance: 1,
        workspace: input.workspacePath,
        ...(input.params.artifact ? { artifact: input.params.artifact } : {}),
        ...(input.params.repo ? { repo: input.params.repo } : {}),
        ...(input.params.ref ? { ref: input.params.ref } : {}),
        ...(input.files.length > 0 ? { file: input.files } : {}),
        explain: true,
        smart: true,
        full: true,
      },
    });
  }
  const partialReasons = Array.from(new Set([
    ...(input.profilePartial ? ['profile'] : []),
    ...(input.workboardPartial ? ['workboard'] : []),
    ...(input.evidenceOmittedCount > 0 ? ['memory_selection'] : []),
    ...(input.memorySnapshotPartial ? ['memory_safety_cap'] : []),
  ]));
  return { continuations, partialReasons };
}
