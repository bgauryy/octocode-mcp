import { computeScore, type ScoreInput } from './score';

export function compareScores(left: ScoreInput, right: ScoreInput): number {
  return computeScore(left) - computeScore(right);
}
