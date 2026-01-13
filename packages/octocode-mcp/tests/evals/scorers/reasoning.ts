/**
 * Reasoning Scorer - Uses LLM judge to evaluate research logic quality
 */

import type {
  EvalScorer,
  EvalContext,
  ExpectedResult,
  ToolResponse,
  ReasoningScorerOptions,
} from './types.js';
import { LLMJudge, createLLMJudge } from '../utils/llm-judge.js';

const DEFAULT_OPTIONS: ReasoningScorerOptions = {
  model: 'gpt-4o-mini',
  timeout: 30000,
};

export class ReasoningScorer implements EvalScorer {
  name = 'reasoning';
  weight = 0.2;
  private options: ReasoningScorerOptions;
  private judge: LLMJudge;

  constructor(options: Partial<ReasoningScorerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.judge = createLLMJudge({
      model: this.options.model,
      apiKey: this.options.apiKey,
      systemPrompt: this.options.systemPrompt,
      timeout: this.options.timeout,
    });
  }

  async score(
    output: ToolResponse | ToolResponse[],
    _expected: ExpectedResult,
    ctx: EvalContext
  ): Promise<number> {
    const responses = Array.isArray(output) ? output : [output];

    const judgeResult = await this.judge.evaluate(
      ctx.testCase,
      responses,
      ctx.tools
    );

    // Convert 1-5 scale to 0-1
    // 1 -> 0, 2 -> 0.25, 3 -> 0.5, 4 -> 0.75, 5 -> 1.0
    const normalizedScore = (judgeResult.score - 1) / 4;

    // Weight by confidence
    const confidenceWeight = 0.5 + judgeResult.confidence * 0.5;

    return normalizedScore * confidenceWeight;
  }

  async explain(
    output: ToolResponse | ToolResponse[],
    _expected: ExpectedResult,
    ctx: EvalContext
  ): Promise<string> {
    const responses = Array.isArray(output) ? output : [output];

    const judgeResult = await this.judge.evaluate(
      ctx.testCase,
      responses,
      ctx.tools
    );

    return (
      `LLM Judge score: ${judgeResult.score}/5 ` +
      `(confidence: ${(judgeResult.confidence * 100).toFixed(0)}%). ` +
      `Reasoning: ${judgeResult.reasoning}`
    );
  }
}

export function createReasoningScorer(
  options?: Partial<ReasoningScorerOptions>
): ReasoningScorer {
  return new ReasoningScorer(options);
}
