/**
 * Agent Configuration - Runtime configuration management
 *
 * Provides:
 * - Configuration loading/saving
 * - Environment variable integration
 * - Default configurations per mode
 * - Configuration validation
 */

import type { CoderMode, CoderConfig } from './coders/types.js';
import type { AgentModel, AgentPermissionMode } from '../types/agent.js';

// ============================================
// Configuration Types
// ============================================

export interface AgentRuntimeConfig {
  /** Default model for all modes */
  defaultModel: AgentModel;
  /** Default permission mode */
  defaultPermissionMode: AgentPermissionMode;
  /** Enable verbose output by default */
  defaultVerbose: boolean;
  /** Enable thinking for complex tasks */
  defaultEnableThinking: boolean;
  /** Max reflections before giving up */
  maxReflections: number;
  /** Default max turns */
  maxTurns?: number;
  /** Default budget limit in USD */
  maxBudgetUsd?: number;
  /** Show live stats during execution */
  showLiveStats: boolean;
  /** Stats update interval in ms */
  statsUpdateInterval: number;
  /** Mode-specific overrides */
  modeOverrides: Partial<Record<CoderMode, Partial<CoderConfig>>>;
}

export const DEFAULT_RUNTIME_CONFIG: AgentRuntimeConfig = {
  defaultModel: 'sonnet',
  defaultPermissionMode: 'default',
  defaultVerbose: true,
  defaultEnableThinking: false,
  maxReflections: 3,
  showLiveStats: true,
  statsUpdateInterval: 500,
  modeOverrides: {
    planning: {
      enableThinking: true,
      permissionMode: 'plan',
    },
    full: {
      enableThinking: true,
    },
  },
};

// ============================================
// Configuration Class
// ============================================

/**
 * Agent configuration manager
 */
export class AgentConfigManager {
  private config: AgentRuntimeConfig;

  constructor(config: Partial<AgentRuntimeConfig> = {}) {
    this.config = { ...DEFAULT_RUNTIME_CONFIG, ...config };
    this.loadFromEnvironment();
  }

  /**
   * Load configuration from environment variables
   */
  private loadFromEnvironment(): void {
    // Model override
    const model = process.env.OCTOCODE_AGENT_MODEL;
    if (model && this.isValidModel(model)) {
      this.config.defaultModel = model as AgentModel;
    }

    // Verbose override
    if (process.env.OCTOCODE_AGENT_VERBOSE !== undefined) {
      this.config.defaultVerbose =
        process.env.OCTOCODE_AGENT_VERBOSE === 'true';
    }

    // Thinking override
    if (process.env.OCTOCODE_AGENT_THINKING !== undefined) {
      this.config.defaultEnableThinking =
        process.env.OCTOCODE_AGENT_THINKING === 'true';
    }

    // Max reflections
    const maxReflections = process.env.OCTOCODE_AGENT_MAX_REFLECTIONS;
    if (maxReflections && !isNaN(parseInt(maxReflections))) {
      this.config.maxReflections = parseInt(maxReflections);
    }

    // Budget limit
    const budget = process.env.OCTOCODE_AGENT_MAX_BUDGET;
    if (budget && !isNaN(parseFloat(budget))) {
      this.config.maxBudgetUsd = parseFloat(budget);
    }
  }

  /**
   * Validate model string
   */
  private isValidModel(model: string): boolean {
    return ['opus', 'sonnet', 'haiku', 'inherit'].includes(model);
  }

  /**
   * Get configuration for a specific mode
   */
  getConfigForMode(mode: CoderMode): CoderConfig {
    const modeOverride = this.config.modeOverrides[mode] || {};

    return {
      mode,
      model: modeOverride.model || this.config.defaultModel,
      permissionMode:
        modeOverride.permissionMode || this.config.defaultPermissionMode,
      enableThinking:
        modeOverride.enableThinking ?? this.config.defaultEnableThinking,
      maxThinkingTokens: modeOverride.maxThinkingTokens || 16000,
      verbose: modeOverride.verbose ?? this.config.defaultVerbose,
      cwd: process.cwd(),
      maxReflections: this.config.maxReflections,
      maxTurns: this.config.maxTurns,
      maxBudgetUsd: this.config.maxBudgetUsd,
      useClaudeCodePrompt: modeOverride.useClaudeCodePrompt ?? true,
      loadProjectSettings: modeOverride.loadProjectSettings ?? true,
    };
  }

  /**
   * Get full runtime config
   */
  getConfig(): AgentRuntimeConfig {
    return { ...this.config };
  }

  /**
   * Update runtime config
   */
  updateConfig(updates: Partial<AgentRuntimeConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Set mode-specific override
   */
  setModeOverride(mode: CoderMode, override: Partial<CoderConfig>): void {
    this.config.modeOverrides[mode] = {
      ...this.config.modeOverrides[mode],
      ...override,
    };
  }

  /**
   * Reset to defaults
   */
  reset(): void {
    this.config = { ...DEFAULT_RUNTIME_CONFIG };
    this.loadFromEnvironment();
  }
}

// ============================================
// Default Instance
// ============================================

/**
 * Default configuration manager instance
 */
export const defaultConfigManager = new AgentConfigManager();

/**
 * Get configuration for a mode using default manager
 */
export function getConfigForMode(mode: CoderMode): CoderConfig {
  return defaultConfigManager.getConfigForMode(mode);
}

/**
 * Create a new configuration manager
 */
export function createConfigManager(
  config: Partial<AgentRuntimeConfig> = {}
): AgentConfigManager {
  return new AgentConfigManager(config);
}
