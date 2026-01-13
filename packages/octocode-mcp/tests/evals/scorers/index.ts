/**
 * Octocode Eval Scorers
 *
 * 5 dimensions for evaluating research quality:
 * 1. Accuracy - Correctness of results
 * 2. Completeness - Coverage of expected information
 * 3. Latency - Response time performance
 * 4. Tool Selection - Correct tool choices
 * 5. Reasoning - LLM judge on research logic
 */

// Types
export * from './types.js';

// Scorers
export { AccuracyScorer, createAccuracyScorer } from './accuracy.js';
export {
  CompletenessScorer,
  createCompletenessScorer,
} from './completeness.js';
export { LatencyScorer, createLatencyScorer } from './latency.js';
export {
  ToolSelectionScorer,
  createToolSelectionScorer,
} from './tool-selection.js';
export { ReasoningScorer, createReasoningScorer } from './reasoning.js';

// Default scorer set
import { createAccuracyScorer } from './accuracy.js';
import { createCompletenessScorer } from './completeness.js';
import { createLatencyScorer } from './latency.js';
import { createToolSelectionScorer } from './tool-selection.js';
import { createReasoningScorer } from './reasoning.js';
import type { EvalScorer } from './types.js';

export function createDefaultScorers(): EvalScorer[] {
  return [
    createAccuracyScorer(),
    createCompletenessScorer(),
    createLatencyScorer(),
    createToolSelectionScorer(),
    createReasoningScorer(),
  ];
}

// Scorer weights (should sum to 1.0)
export const DEFAULT_WEIGHTS = {
  accuracy: 0.25,
  completeness: 0.2,
  latency: 0.15,
  tool_selection: 0.2,
  reasoning: 0.2,
} as const;
