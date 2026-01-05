/**
 * AI Providers Prompts
 *
 * Interactive prompts for provider and model selection.
 */

import { c, bold, dim } from '../../utils/colors.js';
import { select, Separator, input } from '../../utils/prompts.js';
import {
  getProviderStatuses,
  getModelsGroupedByProvider,
  PROVIDER_DISPLAY_NAMES,
  type LLMProvider,
  type ModelId,
} from '../../features/providers/index.js';
import { displayModelInfo } from './display.js';

// ============================================
// Provider Selection
// ============================================

/**
 * Prompt to select a provider
 */
export async function promptSelectProvider(): Promise<LLMProvider | 'back'> {
  const statuses = getProviderStatuses();

  const choices = statuses.map(status => ({
    name: `${status.configured ? c('green', '●') : c('dim', '○')} ${status.displayName}`,
    value: status.provider as LLMProvider | 'back',
    description: status.configured
      ? `${status.envVar} detected`
      : 'Not configured',
  }));

  choices.push(
    new Separator() as unknown as {
      name: string;
      value: LLMProvider | 'back';
      description?: string;
    }
  );

  choices.push({
    name: `${c('dim', '← Back')}`,
    value: 'back',
  });

  const choice = await select<LLMProvider | 'back'>({
    message: 'Select provider:',
    choices,
    pageSize: 12,
    loop: false,
    theme: {
      prefix: '  ',
      style: {
        highlight: (text: string) => c('magenta', text),
        message: (text: string) => bold(text),
      },
    },
  });

  return choice;
}

// ============================================
// Model Selection
// ============================================

/**
 * Prompt to select a model from all configured providers
 */
export async function promptSelectModel(
  currentModel?: ModelId
): Promise<ModelId | 'back'> {
  const modelsByProvider = getModelsGroupedByProvider();
  const statuses = getProviderStatuses();

  const choices: Array<{
    name: string;
    value: ModelId | 'back';
    description?: string;
  }> = [];

  // Group models by provider, only show configured providers
  for (const status of statuses) {
    if (!status.configured) continue;

    const models = modelsByProvider.get(status.provider) || [];
    if (models.length === 0) continue;

    // Add provider header
    choices.push({
      name: `── ${status.displayName} ──`,
      value: 'back' as const, // Placeholder, won't be selectable
      description: '',
    });

    // Add models for this provider
    for (const model of models) {
      const isCurrent = currentModel === model.id;
      const currentIndicator = isCurrent ? c('green', '✓ ') : '';
      choices.push({
        name: `${currentIndicator}${model.name}`,
        value: model.id,
        description: displayModelInfo(model),
      });
    }
  }

  // If no providers configured, show message
  if (choices.length === 0) {
    choices.push({
      name: dim('No providers configured'),
      value: 'back',
      description: 'Configure API keys first',
    });
  }

  choices.push(
    new Separator() as unknown as {
      name: string;
      value: ModelId | 'back';
      description?: string;
    }
  );

  choices.push({
    name: `${c('dim', '← Back')}`,
    value: 'back',
  });

  const choice = await select<ModelId | 'back'>({
    message: 'Select model for this session:',
    choices: choices.filter(c => c.value !== 'back' || c.name.includes('Back')),
    pageSize: 15,
    loop: false,
    theme: {
      prefix: '  ',
      style: {
        highlight: (text: string) => c('magenta', text),
        message: (text: string) => bold(text),
      },
    },
  });

  return choice;
}

/**
 * Prompt to select a model from a specific provider
 */
export async function promptSelectProviderModel(
  provider: LLMProvider,
  currentModel?: ModelId
): Promise<ModelId | 'back'> {
  const modelsByProvider = getModelsGroupedByProvider();
  const models = modelsByProvider.get(provider) || [];

  if (models.length === 0) {
    console.log(
      `  ${c('yellow', '!')} No models available for ${PROVIDER_DISPLAY_NAMES[provider]}`
    );
    return 'back';
  }

  const choices: Array<{
    name: string;
    value: ModelId | 'back';
    description?: string;
  }> = models.map(model => {
    const isCurrent = currentModel === model.id;
    const currentIndicator = isCurrent ? c('green', '✓ ') : '';
    return {
      name: `${currentIndicator}${model.name}`,
      value: model.id,
      description: displayModelInfo(model),
    };
  });

  choices.push(
    new Separator() as unknown as {
      name: string;
      value: ModelId | 'back';
      description?: string;
    }
  );

  choices.push({
    name: `${c('dim', '← Back to providers')}`,
    value: 'back',
  });

  const choice = await select<ModelId | 'back'>({
    message: `Select ${PROVIDER_DISPLAY_NAMES[provider]} model:`,
    choices,
    pageSize: 12,
    loop: false,
    theme: {
      prefix: '  ',
      style: {
        highlight: (text: string) => c('magenta', text),
        message: (text: string) => bold(text),
      },
    },
  });

  return choice;
}

// ============================================
// Configuration Prompts
// ============================================

/**
 * Prompt for API key input method
 */
export async function promptApiKeyMethod(): Promise<'env' | 'manual' | 'back'> {
  const choices = [
    {
      name: 'Environment variable',
      value: 'env' as const,
      description: 'Set in your shell profile',
    },
    {
      name: 'Enter manually',
      value: 'manual' as const,
      description: 'Store in config file',
    },
    new Separator() as unknown as {
      name: string;
      value: 'env' | 'manual' | 'back';
      description?: string;
    },
    {
      name: `${c('dim', '← Back')}`,
      value: 'back' as const,
    },
  ];

  const choice = await select<'env' | 'manual' | 'back'>({
    message: 'How would you like to provide the API key?',
    choices,
    pageSize: 10,
    loop: false,
    theme: {
      prefix: '  ',
      style: {
        highlight: (text: string) => c('magenta', text),
        message: (text: string) => bold(text),
      },
    },
  });

  return choice;
}

/**
 * Prompt for manual API key input
 */
export async function promptApiKeyInput(
  provider: LLMProvider
): Promise<string | null> {
  console.log();
  console.log(
    `  ${dim('Enter your API key for')} ${PROVIDER_DISPLAY_NAMES[provider]}`
  );
  console.log(`  ${dim('The key will be stored securely.')}`);
  console.log();

  const key = await input({
    message: 'API Key:',
    validate: (value: string) => {
      if (value.trim().toLowerCase() === 'back') return true;
      if (value.trim().length < 10) {
        return 'API key seems too short. Enter a valid key or type "back" to cancel.';
      }
      return true;
    },
  });

  if (key.trim().toLowerCase() === 'back') return null;
  return key.trim();
}

/**
 * Prompt for local endpoint URL
 */
export async function promptLocalEndpoint(): Promise<string | null> {
  console.log();
  console.log(
    `  ${dim('Enter the URL for your local LLM server (e.g., Ollama)')}`
  );
  console.log(
    `  ${dim('Default is')} ${c('cyan', 'http://localhost:11434/v1')}`
  );
  console.log();

  const url = await input({
    message: 'Endpoint URL:',
    default: 'http://localhost:11434/v1',
    validate: (value: string) => {
      if (value.trim().toLowerCase() === 'back') return true;
      try {
        new URL(value);
        return true;
      } catch {
        return 'Please enter a valid URL';
      }
    },
  });

  if (url.trim().toLowerCase() === 'back') return null;
  return url.trim();
}
