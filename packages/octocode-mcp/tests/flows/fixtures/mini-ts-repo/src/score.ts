export interface ScoreInput {
  value: number;
  bonus: number;
}

function normalizeScore(total: number): number {
  return Math.max(0, total);
}

export function computeScore(input: ScoreInput): number {
  return normalizeScore(input.value + input.bonus);
}

export function formatScore(input: ScoreInput): string {
  return `score:${computeScore(input)}`;
}
