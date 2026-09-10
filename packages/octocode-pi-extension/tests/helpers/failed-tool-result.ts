import assert from 'node:assert/strict';
import { ToolResultError } from '../../src/tools/tool-result-error.js';
import type { ToolCallResult } from '../../src/types.js';

/** Require host-visible rejection, then expose original diagnostics for assertions. */
export async function failedToolResult(call: Promise<unknown>): Promise<ToolCallResult> {
  try { await call; }
  catch (error) {
    assert.ok(error instanceof ToolResultError, 'registered error results must reject through Pi');
    return error.result;
  }
  assert.fail('expected the registered tool to reject');
}
