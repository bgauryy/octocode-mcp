import type { PiContext, ToolCallResult } from '../types.js';
import { budgetToolResult } from './tool-result-budget.js';

/** Translate internal error results into Pi's thrown, text-only failure channel. */
export class ToolResultError extends Error {
  constructor(
    readonly result: ToolCallResult,
    ctx: PiContext | undefined,
    toolCallId: string,
    toolName: string,
  ) {
    const bounded = budgetToolResult(result, {
      ctx: ctx ?? { cwd: process.cwd() }, toolCallId, toolName, maxImages: 0,
    });
    super(bounded.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('\n\n') || `${toolName} failed`);
    this.name = 'ToolResultError';
  }
}
