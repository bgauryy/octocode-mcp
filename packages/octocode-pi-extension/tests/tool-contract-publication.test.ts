import assert from 'node:assert/strict';
import { test } from 'vitest';
import { registerUniqueTool } from '../src/tools/octocode-tools.js';
import type { ToolDefinition } from '../src/types.js';

test('registration preserves complete schema constraints and example data', () => {
  const description = 'The first part explains the operation. '.repeat(8)
    + 'Only apply the exact approved preview ID; an expired preview requires a fresh review.';
  const parameters = {
    type: 'object',
    properties: { previewId: { type: 'string', description } },
    required: ['previewId'],
    additionalProperties: false,
    examples: [{ previewId: 'preview_123', description: 'literal  whitespace\nand lines' }],
  };
  let published: ToolDefinition | undefined;
  registerUniqueTool({ registerTool: tool => { published = tool; } }, new Set(), {
    name: 'previewFixture', label: 'Preview fixture', description: 'Apply a reviewed fixture.',
    parameters,
    execute: async () => ({ content: [{ type: 'text', text: 'unused' }] }),
  });
  assert.deepEqual(published?.parameters, parameters);
});
