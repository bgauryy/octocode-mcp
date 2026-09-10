import type { QueryRecord } from '../query-envelope.js';

/** Keep a worker handoff bounded; capability catalogs are selected separately. */
export function buildWorkerHandoff(query: QueryRecord) {
  const packet = {
    goal: String(query['goal'] ?? '').trim(),
    context: String(query['context'] ?? '').trim(),
    scope: String(query['scope'] ?? '').trim(),
    ownership: String(query['ownership'] ?? '').trim(),
    acceptance: String(query['acceptance'] ?? '').trim(),
    returnShape: String(query['returnShape'] ?? '').trim(),
  };
  for (const [field, value] of Object.entries(packet)) {
    if (!value) throw new Error(`agent spawn requires non-empty ${field}.`);
  }
  const roleInstructions = String(query['task'] ?? '').trim();
  const task = [
    `Goal: ${packet.goal}`,
    `Context: ${packet.context}`,
    `Scope: ${packet.scope}`,
    `Ownership: ${packet.ownership}`,
    `Acceptance: ${packet.acceptance}`,
    `Return: ${packet.returnShape}`,
    ...(roleInstructions ? [`Instructions: ${roleInstructions}`] : []),
    ...(query['evidence'] ? [`Evidence: ${String(query['evidence'])}`] : []),
    ...(query['instructions'] ? [`Applicable instructions: ${String(query['instructions'])}`] : []),
    ...(Array.isArray(query['skillResources']) && query['skillResources'].length ? [`Selected skill resources: ${query['skillResources'].join(', ')}`] : []),
  ].join('\n');
  if (task.length > 64_000) throw new Error('Worker handoff exceeds 64000 characters; pass a bounded goal, evidence, scope, and applicable instructions.');
  return { packet, task };
}
