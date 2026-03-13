/**
 * Output formatting for CLI results.
 * Converts MCP CallToolResult to stdout JSON or pretty-printed text.
 */

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function outputResult(result: CallToolResult, pretty: boolean): void {
  if (pretty) {
    outputPretty(result);
  } else {
    outputJson(result);
  }
}

function outputJson(result: CallToolResult): void {
  // Prefer structuredContent if available (full typed data)
  const data = result.structuredContent ?? extractTextContent(result);
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

function outputPretty(result: CallToolResult): void {
  if (result.isError) {
    process.stderr.write('Error:\n');
  }

  for (const content of result.content) {
    if (content.type === 'text') {
      process.stdout.write(content.text + '\n');
    }
  }
}

function extractTextContent(result: CallToolResult): unknown {
  for (const content of result.content) {
    if (content.type === 'text') {
      try {
        return JSON.parse(content.text);
      } catch {
        return { text: content.text };
      }
    }
  }
  return { content: result.content };
}

export function outputError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}\n`);
  process.exitCode = 1;
}
