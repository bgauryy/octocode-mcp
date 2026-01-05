/**
 * Agent Loop Module
 *
 * Unified agent execution loop that works with any LLM provider.
 * Core principle: Same tools, any model.
 */

export {
  runAgentLoop,
  runResearchLoop,
  runCodingLoop,
  quickGenerate,
  type AgentLoopOptions,
  type AgentLoopResult,
  type ToolCallEvent,
} from './unified-loop.js';
