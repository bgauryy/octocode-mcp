/**
 * Latency Scorer - Measures response time against thresholds
 */

import type {
  EvalScorer,
  EvalContext,
  ExpectedResult,
  ToolResponse,
  LatencyScorerOptions,
} from './types.js';

const DEFAULT_OPTIONS: LatencyScorerOptions = {
  excellent: 1000, // <1s = 1.0
  good: 3000, // <3s = 0.8
  acceptable: 5000, // <5s = 0.5
  poor: 10000, // <10s = 0.2, >10s = 0.1
};

export class LatencyScorer implements EvalScorer {
  name = 'latency';
  weight = 0.15;
  private options: LatencyScorerOptions;

  constructor(options: Partial<LatencyScorerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async score(
    _output: ToolResponse | ToolResponse[],
    expected: ExpectedResult,
    ctx: EvalContext
  ): Promise<number> {
    const latencyMs = ctx.endTime - ctx.startTime;

    // If expected has a specific max latency, use that as the threshold
    const maxLatency = expected.maxLatencyMs ?? this.options.acceptable;

    // Perfect score if under excellent threshold
    if (latencyMs <= this.options.excellent) {
      return 1.0;
    }

    // Good score if under good threshold
    if (latencyMs <= this.options.good) {
      return 0.9;
    }

    // Acceptable score if under acceptable threshold
    if (latencyMs <= this.options.acceptable) {
      return 0.7;
    }

    // Below acceptable but under expected max
    if (latencyMs <= maxLatency) {
      return 0.5;
    }

    // Poor score if under poor threshold
    if (latencyMs <= this.options.poor) {
      return 0.3;
    }

    // Very poor score for anything over poor threshold
    return 0.1;
  }

  async explain(
    _output: ToolResponse | ToolResponse[],
    expected: ExpectedResult,
    ctx: EvalContext
  ): Promise<string> {
    const latencyMs = ctx.endTime - ctx.startTime;
    const score = await this.score(_output, expected, ctx);

    const thresholdInfo = expected.maxLatencyMs
      ? ` (expected max: ${expected.maxLatencyMs}ms)`
      : '';

    const rating =
      score >= 0.9
        ? 'excellent'
        : score >= 0.7
          ? 'good'
          : score >= 0.5
            ? 'acceptable'
            : score >= 0.3
              ? 'poor'
              : 'very poor';

    return (
      `Latency: ${latencyMs}ms - ${rating}${thresholdInfo}. ` +
      `Thresholds: excellent<${this.options.excellent}ms, good<${this.options.good}ms, acceptable<${this.options.acceptable}ms`
    );
  }
}

export function createLatencyScorer(
  options?: Partial<LatencyScorerOptions>
): LatencyScorer {
  return new LatencyScorer(options);
}
