/**
 * Public API — Server registration and configuration.
 */

export { registerTools } from '../tools/toolsManager.js';
export { registerPrompts } from '../prompts/prompts.js';
export { ALL_TOOLS, type ToolConfig } from '../tools/toolConfig.js';
export { initialize } from '../serverConfig.js';
export { initializeProviders } from '../providers/factory.js';
export { getGitHubToken, getToken } from '../serverConfig.js';
export { getTokenSource } from '../serverConfig.js';
export type { TokenSourceType } from '../types.js';
