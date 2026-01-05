/**
 * AI Providers Display
 *
 * Display helpers for provider status and model information.
 */

import { c, dim } from '../../utils/colors.js';
import {
  getProviderStatuses,
  getConfiguredProviders,
  type ProviderStatus,
  type ModelDefinition,
  type LLMProvider,
  type ModelId,
} from '../../features/providers/index.js';

/**
 * Display provider status with icons
 */
export function displayProviderStatus(status: ProviderStatus): string {
  const icon = status.configured ? c('green', '●') : c('dim', '○');
  const name = status.displayName;
  const envHint = status.envVar
    ? dim(`(${status.envVar} detected)`)
    : status.configured
      ? ''
      : dim('Not configured');

  return `  ${icon} ${name}${envHint ? ' ' + envHint : ''}`;
}

/**
 * Display all provider statuses
 */
export function displayAllProviderStatuses(): void {
  const statuses = getProviderStatuses();

  console.log(`  ${dim('Configured Providers:')}`);
  for (const status of statuses) {
    console.log(displayProviderStatus(status));
  }
  console.log();
}

/**
 * Display model info for selection
 */
export function displayModelInfo(model: ModelDefinition): string {
  const parts: string[] = [];

  // Pricing
  if (model.pricing.inputPer1M > 0) {
    parts.push(
      `$${model.pricing.inputPer1M}/$${model.pricing.outputPer1M} per 1M`
    );
  } else {
    parts.push('Free');
  }

  // Context window
  const contextK = Math.round(model.contextWindow / 1000);
  parts.push(`${contextK}K context`);

  // Capabilities
  const caps: string[] = [];
  if (model.capabilities.reasoning) caps.push('reasoning');
  if (model.capabilities.vision) caps.push('vision');
  if (caps.length > 0) {
    parts.push(caps.join(', '));
  }

  return parts.join(' · ');
}

/**
 * Get current model display string
 */
export function getCurrentModelDisplay(modelId: ModelId | null): string {
  if (!modelId) {
    return dim('Not configured');
  }
  return c('cyan', modelId);
}

/**
 * Build status line for AI providers
 */
export function buildAIStatusLine(currentModel: ModelId | null): string {
  const configured = getConfiguredProviders();
  const parts: string[] = [];

  if (configured.length > 0) {
    parts.push(`${c('green', '●')} ${configured.length} providers`);
  } else {
    parts.push(`${c('yellow', '○')} No providers configured`);
  }

  if (currentModel) {
    parts.push(c('cyan', currentModel));
  }

  return parts.join(dim('  │  '));
}

/**
 * Display model capabilities table
 */
export function displayModelCapabilities(models: ModelDefinition[]): void {
  console.log();
  console.log(
    `  ┌──────────────────────┬─────────┬───────────┬─────────┬─────────┐`
  );
  console.log(
    `  │ Model                │ Tools   │ Streaming │ Vision  │ Reason  │`
  );
  console.log(
    `  ├──────────────────────┼─────────┼───────────┼─────────┼─────────┤`
  );

  for (const model of models.slice(0, 5)) {
    const name = model.name.slice(0, 20).padEnd(20);
    const tools = model.capabilities.toolCalling ? '✓' : '-';
    const stream = model.capabilities.streaming ? '✓' : '-';
    const vision = model.capabilities.vision ? '✓' : '-';
    const reason = model.capabilities.reasoning ? '✓' : '-';

    console.log(
      `  │ ${name} │    ${tools}    │     ${stream}     │    ${vision}    │    ${reason}    │`
    );
  }

  console.log(
    `  └──────────────────────┴─────────┴───────────┴─────────┴─────────┘`
  );
  console.log();
  console.log(
    `  ${dim('Note: All models get the same tools. Capabilities are model-specific features.')}`
  );
}

/**
 * Display environment variable help
 */
export function displayEnvVarHelp(provider: LLMProvider): void {
  const envVars: Record<LLMProvider, { varName: string; url: string }> = {
    anthropic: {
      varName: 'ANTHROPIC_API_KEY',
      url: 'https://console.anthropic.com/settings/keys',
    },
    openai: {
      varName: 'OPENAI_API_KEY',
      url: 'https://platform.openai.com/api-keys',
    },
    google: {
      varName: 'GEMINI_API_KEY',
      url: 'https://aistudio.google.com/apikey',
    },
    groq: {
      varName: 'GROQ_API_KEY',
      url: 'https://console.groq.com/keys',
    },
    openrouter: {
      varName: 'OPENROUTER_API_KEY',
      url: 'https://openrouter.ai/keys',
    },
    bedrock: {
      varName: 'AWS_ACCESS_KEY_ID',
      url: 'https://console.aws.amazon.com/iam/',
    },
    vertex: {
      varName: 'GOOGLE_APPLICATION_CREDENTIALS',
      url: 'https://console.cloud.google.com/apis/credentials',
    },
    local: {
      varName: 'LOCAL_ENDPOINT',
      url: 'https://ollama.ai/download',
    },
  };

  const info = envVars[provider];

  console.log();
  console.log(`  Set this environment variable:`);
  console.log();
  console.log(`    ${c('cyan', `export ${info.varName}="your-api-key-here"`)}`);
  console.log();
  console.log(
    `  ${dim('Add to your shell profile (~/.zshrc, ~/.bashrc) for persistence.')}`
  );
  console.log();
  console.log(`  ${dim('Get your API key:')} ${c('blue', info.url)}`);
}
