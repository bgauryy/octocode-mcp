/**
 * Agent Prompts
 *
 * Interactive prompts for agent configuration and execution.
 * Uses LLM-based intelligent task classification instead of rigid regex patterns.
 */

import { dim } from '../../utils/colors.js';
import { loadInquirer, input } from '../../utils/prompts.js';
import { discoverAPIKey } from '../../features/api-keys.js';

export type AgentMode =
  | 'research'
  | 'coding'
  | 'full'
  | 'planning'
  | 'delegate'
  | 'interactive'
  | 'custom';

/**
 * Classification result from LLM
 */
interface ClassificationResult {
  mode: AgentMode;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

/**
 * Tool schema for task classification
 * Uses Claude's tool_use feature for structured output
 */
const CLASSIFY_TASK_TOOL = {
  name: 'classify_task',
  description: 'Classify a user task into the most appropriate agent mode',
  input_schema: {
    type: 'object' as const,
    properties: {
      mode: {
        type: 'string',
        enum: ['research', 'coding', 'planning', 'full'],
        description: `The most appropriate mode for the task:
- research: Questions, exploration, analysis, understanding code, finding patterns, documentation lookup, best practices inquiry
- coding: Writing code, fixing bugs, implementing features, refactoring, adding tests, modifying files
- planning: Designing architecture, creating roadmaps, breaking down tasks, strategizing before implementation
- full: Complex multi-step tasks requiring both research AND coding, end-to-end implementations, deployments`,
      },
      confidence: {
        type: 'string',
        enum: ['high', 'medium', 'low'],
        description:
          'Confidence level: high if task clearly fits one mode, medium if somewhat ambiguous, low if very unclear',
      },
      reason: {
        type: 'string',
        description:
          'Brief explanation of why this mode was chosen (1-2 sentences)',
      },
    },
    required: ['mode', 'confidence', 'reason'],
  },
};

/**
 * System prompt for task classification
 */
const CLASSIFICATION_SYSTEM_PROMPT = `You are a task classifier for an AI coding assistant. Your job is to determine the best operating mode based on what the user wants to accomplish.

Modes explained:
- **research**: User wants to UNDERSTAND something - asking questions, exploring codebases, looking up best practices, finding examples, analyzing patterns. Key signals: questions, "how does", "what is", "find", "explain", "show me", "best practices"
- **coding**: User wants to CHANGE something - writing code, fixing bugs, implementing features, modifying files, refactoring. Key signals: "fix", "add", "create", "implement", "write", "update", "refactor"  
- **planning**: User wants to PLAN something - designing before coding, creating architecture, breaking down complex tasks. Key signals: "plan", "design", "how should we", "architecture", "break down"
- **full**: User wants EVERYTHING - complex tasks requiring both research AND implementation, end-to-end work. Key signals: multiple verbs spanning research and coding, "deploy", "ship", "complete"

Important: Focus on the USER'S INTENT, not just keywords. "check best practices" is research even if it mentions "code".`;

/**
 * Classify task using LLM for intelligent intent detection
 * Falls back to simple heuristics if API is unavailable
 */
export async function classifyTask(
  task: string
): Promise<ClassificationResult> {
  try {
    // Try to get API key for classification
    const apiKeyResult = await discoverAPIKey('anthropic');

    if (apiKeyResult.key) {
      return await classifyTaskWithLLM(task, apiKeyResult.key);
    }
  } catch {
    // Fall through to fallback
  }

  // Fallback: simple heuristic classification when no API available
  return classifyTaskFallback(task);
}

/**
 * Classify task using Claude API with tool_use for structured output
 */
async function classifyTaskWithLLM(
  task: string,
  apiKey: string
): Promise<ClassificationResult> {
  try {
    // Dynamic import to avoid bundling issues
    const { default: Anthropic } = await import('@anthropic-ai/sdk');

    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      system: CLASSIFICATION_SYSTEM_PROMPT,
      tools: [CLASSIFY_TASK_TOOL],
      tool_choice: { type: 'tool', name: 'classify_task' },
      messages: [
        {
          role: 'user',
          content: `Classify this task: "${task}"`,
        },
      ],
    });

    // Extract tool use result
    for (const block of response.content) {
      if (block.type === 'tool_use' && block.name === 'classify_task') {
        const input = block.input as {
          mode: AgentMode;
          confidence: 'high' | 'medium' | 'low';
          reason: string;
        };

        // Validate mode (exclude 'custom' as LLM shouldn't select it)
        const validModes: AgentMode[] = [
          'research',
          'coding',
          'planning',
          'full',
        ];
        if (!validModes.includes(input.mode)) {
          return classifyTaskFallback(task);
        }

        return {
          mode: input.mode,
          confidence: input.confidence,
          reason: input.reason,
        };
      }
    }

    // If no tool use found, fallback
    return classifyTaskFallback(task);
  } catch {
    // On any error, use fallback
    return classifyTaskFallback(task);
  }
}

/**
 * Simple heuristic fallback when LLM is unavailable
 * Uses basic keyword matching as last resort
 */
function classifyTaskFallback(task: string): ClassificationResult {
  const lower = task.toLowerCase();

  // Simple keyword-based detection as fallback
  const researchSignals = [
    'what',
    'how',
    'why',
    'where',
    'find',
    'search',
    'explain',
    'understand',
    'analyze',
    'show me',
    'best practice',
    'example',
    '?',
  ];
  const codingSignals = [
    'fix',
    'bug',
    'add',
    'create',
    'implement',
    'write',
    'update',
    'refactor',
    'delete',
    'modify',
    'test',
  ];
  const planningSignals = [
    'plan',
    'design',
    'architect',
    'strategy',
    'roadmap',
    'break down',
    'outline',
  ];
  const fullSignals = ['deploy', 'ship', 'release', 'end to end', 'complete'];

  const countMatches = (signals: string[]) =>
    signals.filter(s => lower.includes(s)).length;

  const scores = {
    research: countMatches(researchSignals),
    coding: countMatches(codingSignals),
    planning: countMatches(planningSignals),
    full: countMatches(fullSignals),
  };

  // Find highest scoring mode
  let bestMode: AgentMode = 'research';
  let bestScore = 0;

  for (const [mode, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestMode = mode as AgentMode;
    }
  }

  return {
    mode: bestMode,
    confidence: 'low',
    reason: 'Fallback classification (API unavailable)',
  };
}

/**
 * Get mode display info
 */
export function getModeDisplayInfo(mode: AgentMode): {
  icon: string;
  name: string;
  description: string;
} {
  const modeInfo: Record<
    AgentMode,
    { icon: string; name: string; description: string }
  > = {
    research: {
      icon: '🔍',
      name: 'Research',
      description: 'Explore & analyze codebases',
    },
    coding: {
      icon: '💻',
      name: 'Coding',
      description: 'Write & edit code',
    },
    full: {
      icon: '🚀',
      name: 'Full',
      description: 'All capabilities enabled',
    },
    planning: {
      icon: '📋',
      name: 'Planning',
      description: 'Create detailed plans',
    },
    delegate: {
      icon: '👥',
      name: 'Delegate',
      description: 'Team leader - coordinate subagents',
    },
    interactive: {
      icon: '🤝',
      name: 'Interactive',
      description: 'Human-in-the-loop approval',
    },
    custom: {
      icon: '⚙️',
      name: 'Custom',
      description: 'Manual configuration',
    },
  };
  return modeInfo[mode];
}

/**
 * Prompt for agent task/prompt
 */
export async function promptAgentTask(): Promise<string | null> {
  await loadInquirer();

  console.log();
  console.log(`  ${dim('Enter your task or question for the agent.')}`);
  console.log(
    `  ${dim('Press Enter twice to submit, or type "back" to cancel.')}`
  );
  console.log();

  const task = await input({
    message: 'Task:',
    validate: (value: string) => {
      if (value.trim().toLowerCase() === 'back') return true;
      if (value.trim().length < 3) {
        return 'Please enter a more detailed task description';
      }
      return true;
    },
  });

  if (task.trim().toLowerCase() === 'back') return null;
  return task.trim();
}
