import { computeScore, formatScore, type ScoreInput } from './score';

export function buildSummary(input: ScoreInput): string {
  const score = computeScore(input);

  return `${formatScore(input)}:${score}`;
}
