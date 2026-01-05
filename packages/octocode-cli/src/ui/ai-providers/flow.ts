/**
 * AI Providers Flow
 *
 * Main flow for configuring AI providers and models.
 */

import { c, bold, dim } from '../../utils/colors.js';
import { loadInquirer, select, Separator, input } from '../../utils/prompts.js';
import {
  getProviderStatuses,
  detectDefaultModelId,
  PROVIDER_DISPLAY_NAMES,
  type ModelId,
} from '../../features/providers/index.js';
import {
  displayAllProviderStatuses,
  displayEnvVarHelp,
  getCurrentModelDisplay,
} from './display.js';
import {
  promptSelectProvider,
  promptSelectProviderModel,
  promptApiKeyMethod,
} from './prompts.js';

// ============================================
// Types
// ============================================

type AIProvidersMenuChoice =
  | 'set-default'
  | 'configure-keys'
  | 'view-models'
  | 'back';

// ============================================
// State
// ============================================

/**
 * Current default model (in-memory, would be persisted in config)
 */
let currentDefaultModel: ModelId | null = null;

/**
 * Get current default model
 */
export function getCurrentDefaultModel(): ModelId | null {
  if (!currentDefaultModel) {
    currentDefaultModel = detectDefaultModelId();
  }
  return currentDefaultModel;
}

/**
 * Set current default model
 */
export function setCurrentDefaultModel(modelId: ModelId): void {
  currentDefaultModel = modelId;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Wait for user to press enter
 */
async function pressEnterToContinue(): Promise<void> {
  console.log();
  await input({
    message: dim('Press Enter to continue...'),
    default: '',
  });
}

// ============================================
// Menu
// ============================================

/**
 * Show AI providers settings menu
 */
async function showAIProvidersMenu(): Promise<AIProvidersMenuChoice> {
  const currentModel = getCurrentDefaultModel();
  const configured = getProviderStatuses().filter(s => s.configured).length;
  const total = getProviderStatuses().length;

  const choices: Array<{
    name: string;
    value: AIProvidersMenuChoice;
    description?: string;
  }> = [
    {
      name: '🎯 Set Default Model',
      value: 'set-default',
      description: currentModel ? `Currently: ${currentModel}` : 'Not set',
    },
    {
      name: '🔑 Configure API Keys',
      value: 'configure-keys',
      description: `${configured} of ${total} configured`,
    },
    {
      name: '📋 View Available Models',
      value: 'view-models',
      description: 'Browse models by provider',
    },
  ];

  choices.push(
    new Separator() as unknown as {
      name: string;
      value: AIProvidersMenuChoice;
      description?: string;
    }
  );

  choices.push({
    name: `${c('dim', '← Back to main menu')}`,
    value: 'back',
  });

  const choice = await select<AIProvidersMenuChoice>({
    message: 'AI Provider Settings:',
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
// Sub-flows
// ============================================

/**
 * Set default model flow
 */
async function runSetDefaultModelFlow(): Promise<void> {
  console.log();
  console.log(`  ${bold('🎯 Set Default Model')}`);
  console.log();

  const currentModel = getCurrentDefaultModel();

  // First, select provider
  const provider = await promptSelectProvider();
  if (provider === 'back') return;

  // Check if provider is configured
  const status = getProviderStatuses().find(s => s.provider === provider);
  if (!status?.configured) {
    console.log();
    console.log(
      `  ${c('yellow', '!')} ${PROVIDER_DISPLAY_NAMES[provider]} is not configured.`
    );
    displayEnvVarHelp(provider);
    await pressEnterToContinue();
    return;
  }

  // Select model from provider
  const modelId = await promptSelectProviderModel(provider, currentModel);
  if (modelId === 'back') return;

  // Set the model
  setCurrentDefaultModel(modelId);

  console.log();
  console.log(
    `  ${c('green', '✓')} Default model set to: ${c('cyan', modelId)}`
  );
  console.log();
  console.log(`  ${dim('This will be used for:')}`);
  console.log(`  ${dim('• octocode agent commands')}`);
  console.log(`  ${dim('• Research mode')}`);
  console.log(`  ${dim('• Coding mode')}`);
  console.log();
  console.log(
    `  ${dim('Tip: Override per-command with')} ${c('cyan', '--model openai:gpt-4o')}`
  );

  await pressEnterToContinue();
}

/**
 * Configure API keys flow
 */
async function runConfigureKeysFlow(): Promise<void> {
  console.log();
  console.log(`  ${bold('🔑 API Key Configuration')}`);
  console.log();

  displayAllProviderStatuses();

  const provider = await promptSelectProvider();
  if (provider === 'back') return;

  // Show configuration instructions
  if (provider === 'local') {
    console.log();
    console.log(`  ${bold('Configure Local LLM (Ollama)')}`);
    console.log();
    console.log(
      `  ${dim('1. Install Ollama from')} ${c('blue', 'https://ollama.ai')}`
    );
    console.log(
      `  ${dim('2. Pull a model:')} ${c('cyan', 'ollama pull llama3.1')}`
    );
    console.log(
      `  ${dim('3. Start the server:')} ${c('cyan', 'ollama serve')}`
    );
    console.log();
    console.log(
      `  ${dim('Default endpoint:')} ${c('cyan', 'http://localhost:11434/v1')}`
    );
    console.log();
    console.log(
      `  ${dim('To customize, set:')} ${c('cyan', 'export LOCAL_ENDPOINT="http://your-server:port/v1"')}`
    );
  } else {
    const method = await promptApiKeyMethod();
    if (method === 'back') return;

    if (method === 'env') {
      displayEnvVarHelp(provider);
    } else {
      console.log();
      console.log(
        `  ${c('yellow', '!')} Manual API key storage is not yet implemented.`
      );
      console.log(`  ${dim('Please use environment variables for now.')}`);
      displayEnvVarHelp(provider);
    }
  }

  await pressEnterToContinue();
}

/**
 * View available models flow
 */
async function runViewModelsFlow(): Promise<void> {
  console.log();
  console.log(`  ${bold('📋 Available Models')}`);
  console.log();

  // Select provider to view models
  const provider = await promptSelectProvider();
  if (provider === 'back') return;

  // Show model selection (read-only view)
  const modelId = await promptSelectProviderModel(provider);
  if (modelId === 'back') return;

  // Show model details
  console.log();
  console.log(`  ${c('green', '✓')} Selected: ${c('cyan', modelId)}`);
  console.log();
  console.log(
    `  ${dim('To use this model, set it as default or use')} ${c('cyan', `--model ${modelId}`)}`
  );

  await pressEnterToContinue();
}

// ============================================
// Main Flow
// ============================================

/**
 * Run the AI providers settings flow
 */
export async function runAIProvidersFlow(): Promise<void> {
  await loadInquirer();

  // Section header
  console.log();
  console.log(c('blue', '━'.repeat(66)));
  console.log(`  🧪 ${bold('AI Provider Settings')}`);
  console.log(c('blue', '━'.repeat(66)));
  console.log();

  // Display current status
  const currentModel = getCurrentDefaultModel();
  console.log(
    `  ${dim('Current Model:')} ${getCurrentModelDisplay(currentModel)}`
  );
  console.log();

  displayAllProviderStatuses();

  let inMenu = true;
  while (inMenu) {
    const choice = await showAIProvidersMenu();

    switch (choice) {
      case 'set-default':
        await runSetDefaultModelFlow();
        console.log();
        break;

      case 'configure-keys':
        await runConfigureKeysFlow();
        console.log();
        break;

      case 'view-models':
        await runViewModelsFlow();
        console.log();
        break;

      case 'back':
      default:
        inMenu = false;
        break;
    }
  }
}
