/**
 * LLM Judge - Uses GPT-4/Claude to evaluate research quality
 */

import type {
  LLMJudgeResponse,
  EvalTestCase,
  ToolResponse,
} from '../scorers/types.js';

const DEFAULT_SYSTEM_PROMPT = `You are an expert evaluator of code research quality.
Your task is to assess how well an AI tool answered a research question about code.

Rate the response on a scale of 1-5:
1 = Completely irrelevant or wrong
2 = Partially relevant but mostly unhelpful
3 = Somewhat helpful but missing key information
4 = Good response with minor gaps
5 = Excellent, comprehensive response

Consider:
- Did the tool find relevant code/files?
- Is the information accurate and useful?
- Does the response address the original question?
- Is the research approach logical and efficient?

Respond in JSON format:
{
  "score": <1-5>,
  "reasoning": "<brief explanation>",
  "confidence": <0-1>
}`;

export interface LLMJudgeConfig {
  model: string;
  apiKey?: string;
  baseUrl?: string;
  systemPrompt?: string;
  timeout?: number;
}

const DEFAULT_CONFIG: LLMJudgeConfig = {
  model: 'gpt-4o-mini',
  timeout: 30000,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
};

export class LLMJudge {
  private config: LLMJudgeConfig;

  constructor(config: Partial<LLMJudgeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async evaluate(
    testCase: EvalTestCase,
    responses: ToolResponse[],
    toolsCalled: string[]
  ): Promise<LLMJudgeResponse> {
    const apiKey = this.config.apiKey ?? process.env.OPENAI_API_KEY;

    if (!apiKey) {
      // Return neutral score if no API key
      return {
        score: 3,
        reasoning: 'LLM judge skipped: No API key configured',
        confidence: 0,
      };
    }

    const userPrompt = this.buildUserPrompt(testCase, responses, toolsCalled);

    try {
      const response = await this.callOpenAI(apiKey, userPrompt);
      return this.parseResponse(response);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        score: 3,
        reasoning: `LLM judge error: ${errorMessage}`,
        confidence: 0,
      };
    }
  }

  private buildUserPrompt(
    testCase: EvalTestCase,
    responses: ToolResponse[],
    toolsCalled: string[]
  ): string {
    const responsesSummary = responses
      .map((r, i) => {
        const status = r.status;
        const resultCount =
          (r.files as unknown[])?.length ??
          (r.repositories as unknown[])?.length ??
          (r.packages as unknown[])?.length ??
          (r.locations as unknown[])?.length ??
          0;

        let summary = `Response ${i + 1}: status=${status}, results=${resultCount}`;

        if (r.error) {
          summary += `, error="${r.error}"`;
        }

        // Add sample of content
        if ((r.files as unknown[])?.length) {
          const files = r.files as Array<{ path?: string }>;
          const paths = files
            .slice(0, 3)
            .map(f => f.path)
            .filter(Boolean);
          if (paths.length > 0) {
            summary += `, files=[${paths.join(', ')}${files.length > 3 ? '...' : ''}]`;
          }
        }

        return summary;
      })
      .join('\n');

    return `## Research Question
${testCase.prompt}

## Category
${testCase.category}

## Tools Called
${toolsCalled.join(' -> ') || 'None'}

## Tool Responses
${responsesSummary}

## Expected Outcome
${testCase.expected.mustContain ? `Must contain: ${testCase.expected.mustContain.join(', ')}` : 'No specific requirements'}
${testCase.expected.minResults ? `Minimum results: ${testCase.expected.minResults}` : ''}

Please evaluate the quality of this research response.`;
  }

  private async callOpenAI(
    apiKey: string,
    userPrompt: string
  ): Promise<string> {
    const baseUrl = this.config.baseUrl ?? 'https://api.openai.com/v1';

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.config.timeout ?? 30000
    );

    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [
            { role: 'system', content: this.config.systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          max_tokens: 500,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
      }

      const data = (await response.json()) as {
        choices: Array<{ message: { content: string } }>;
      };

      return data.choices[0]?.message?.content ?? '';
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parseResponse(content: string): LLMJudgeResponse {
    try {
      const parsed = JSON.parse(content) as Partial<LLMJudgeResponse>;

      return {
        score: Math.max(1, Math.min(5, parsed.score ?? 3)),
        reasoning: parsed.reasoning ?? 'No reasoning provided',
        confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
      };
    } catch {
      return {
        score: 3,
        reasoning: `Failed to parse LLM response: ${content.slice(0, 100)}`,
        confidence: 0,
      };
    }
  }
}

export function createLLMJudge(config?: Partial<LLMJudgeConfig>): LLMJudge {
  return new LLMJudge(config);
}
