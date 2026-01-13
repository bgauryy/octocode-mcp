/**
 * Tool Selection Scorer - Evaluates if the correct tools were chosen
 */

import type {
  EvalScorer,
  EvalContext,
  ExpectedResult,
  ToolResponse,
  ToolSelectionScorerOptions,
} from './types.js';

const DEFAULT_OPTIONS: ToolSelectionScorerOptions = {
  penalizeExtraTools: true,
  penalizeWrongOrder: true,
  extraToolPenalty: 0.1, // -0.1 per extra tool
  wrongOrderPenalty: 0.2, // -0.2 for wrong order
};

export class ToolSelectionScorer implements EvalScorer {
  name = 'tool_selection';
  weight = 0.2;
  private options: ToolSelectionScorerOptions;

  constructor(options: Partial<ToolSelectionScorerOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async score(
    _output: ToolResponse | ToolResponse[],
    expected: ExpectedResult,
    ctx: EvalContext
  ): Promise<number> {
    const expectedTools = expected.expectedTools ?? [];
    const actualTools = ctx.tools;

    // If no expected tools specified, check that at least some tools were called
    if (expectedTools.length === 0) {
      return actualTools.length > 0 ? 0.8 : 0.5;
    }

    let score = 0;

    // Calculate how many expected tools were called (60% weight)
    const calledExpectedTools = expectedTools.filter(tool =>
      actualTools.includes(tool)
    );
    const expectedToolScore =
      (calledExpectedTools.length / expectedTools.length) * 0.6;
    score += expectedToolScore;

    // Check tool order if required (20% weight)
    if (expected.expectedToolOrder && expectedTools.length > 1) {
      let orderScore = 0;
      let lastIndex = -1;

      for (const tool of expectedTools) {
        const currentIndex = actualTools.indexOf(tool);
        if (currentIndex > lastIndex) {
          orderScore += 1;
          lastIndex = currentIndex;
        }
      }

      const orderPercentage = orderScore / expectedTools.length;
      score += orderPercentage * 0.2;
    } else {
      // If order doesn't matter, give full order points if expected tools were called
      score += calledExpectedTools.length > 0 ? 0.2 : 0;
    }

    // Penalize extra tools (up to 20% penalty)
    if (this.options.penalizeExtraTools) {
      const extraTools = actualTools.filter(
        (tool: string) => !expectedTools.includes(tool)
      );
      const extraPenalty = Math.min(
        extraTools.length * this.options.extraToolPenalty,
        0.2
      );
      score = Math.max(0, score - extraPenalty);
    } else {
      // Bonus for not calling unnecessary tools
      const extraTools = actualTools.filter(
        (tool: string) => !expectedTools.includes(tool)
      );
      if (extraTools.length === 0 && calledExpectedTools.length > 0) {
        score += 0.1;
      }
    }

    // Bonus for calling all expected tools
    if (calledExpectedTools.length === expectedTools.length) {
      score += 0.1;
    }

    return Math.min(1, Math.max(0, score));
  }

  async explain(
    _output: ToolResponse | ToolResponse[],
    expected: ExpectedResult,
    ctx: EvalContext
  ): Promise<string> {
    const expectedTools = expected.expectedTools ?? [];
    const actualTools = ctx.tools;

    if (expectedTools.length === 0) {
      return `No specific tools expected. Called: [${actualTools.join(', ') || 'none'}]`;
    }

    const called = actualTools.join(', ') || 'none';
    const expectedStr = expectedTools.join(', ');

    const missing = expectedTools.filter(tool => !actualTools.includes(tool));
    const extra = actualTools.filter(tool => !expectedTools.includes(tool));

    let explanation = `Expected: [${expectedStr}], Called: [${called}]`;

    if (missing.length > 0) {
      explanation += `. Missing: [${missing.join(', ')}]`;
    }

    if (extra.length > 0 && this.options.penalizeExtraTools) {
      explanation += `. Extra tools: [${extra.join(', ')}]`;
    }

    if (expected.expectedToolOrder) {
      // Check if order is correct
      let lastIndex = -1;
      let orderCorrect = true;
      for (const tool of expectedTools) {
        const currentIndex = actualTools.indexOf(tool);
        if (currentIndex <= lastIndex && currentIndex !== -1) {
          orderCorrect = false;
          break;
        }
        if (currentIndex !== -1) {
          lastIndex = currentIndex;
        }
      }
      explanation += `. Order: ${orderCorrect ? 'correct' : 'incorrect'}`;
    }

    return explanation;
  }
}

export function createToolSelectionScorer(
  options?: Partial<ToolSelectionScorerOptions>
): ToolSelectionScorer {
  return new ToolSelectionScorer(options);
}
