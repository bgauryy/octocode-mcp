/**
 * Tools Module
 *
 * Provider-agnostic tools that work with any LLM model.
 * These tools are used by the unified agent loop regardless of which
 * AI provider (Anthropic, OpenAI, Google, etc.) is selected.
 *
 * Core Principle: Same tools for all models.
 * The model is just the "brain" - we own the tools layer.
 */

import type { CoreTool } from 'ai';
import { fileTools } from './file-tools.js';
import { shellTools } from './shell-tools.js';

// ============================================
// Built-in Tool Registry
// ============================================

/**
 * All built-in tools available to agents
 */
export const BUILTIN_TOOLS: Record<string, CoreTool> = {
  // File operations
  Read: fileTools.Read,
  Write: fileTools.Write,
  Edit: fileTools.Edit,
  Glob: fileTools.Glob,
  ListDir: fileTools.ListDir,

  // Shell operations
  Bash: shellTools.Bash,
  Grep: shellTools.Grep,
};

/**
 * Tool names
 */
export type BuiltinToolName = keyof typeof BUILTIN_TOOLS;

/**
 * Get a subset of tools by name
 */
export function getTools(names: BuiltinToolName[]): Record<string, CoreTool> {
  const tools: Record<string, CoreTool> = {};
  for (const name of names) {
    if (BUILTIN_TOOLS[name]) {
      tools[name] = BUILTIN_TOOLS[name];
    }
  }
  return tools;
}

/**
 * Get all tools except specified ones
 */
export function getToolsExcept(
  exclude: BuiltinToolName[]
): Record<string, CoreTool> {
  const tools: Record<string, CoreTool> = {};
  for (const [name, tool] of Object.entries(BUILTIN_TOOLS)) {
    if (!exclude.includes(name as BuiltinToolName)) {
      tools[name] = tool;
    }
  }
  return tools;
}

// ============================================
// Tool Set Presets
// ============================================

/**
 * Research mode tools - read-only exploration
 */
export const RESEARCH_TOOLS: Record<string, CoreTool> = getTools([
  'Read',
  'Glob',
  'ListDir',
  'Grep',
]);

/**
 * Coding mode tools - file operations + shell
 */
export const CODING_TOOLS: Record<string, CoreTool> = {
  ...BUILTIN_TOOLS,
};

/**
 * Read-only tools - safe for exploration
 */
export const READONLY_TOOLS: Record<string, CoreTool> = getTools([
  'Read',
  'Glob',
  'ListDir',
  'Grep',
]);

// ============================================
// Re-exports
// ============================================

export { fileTools } from './file-tools.js';
export { shellTools } from './shell-tools.js';
