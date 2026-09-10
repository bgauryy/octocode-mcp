import { c, bold, dim } from '../utils/colors.js';

/**
 * Light fallback shown when the Octocode tool runtime fails to load.
 * Never lists tool names or fields statically — those come from the live runtime.
 */
export function showLightAvailableTools(): void {
  console.log();
  console.log(
    `  ${c('magenta', bold('Octocode Tools'))}  ${dim('runtime unavailable')}`
  );
  console.log();
  console.log(
    `  ${dim('The tool runtime did not load. Tool names and schemas are only available when the runtime starts.')}`
  );
  console.log();
  console.log(
    `  ${dim('Common cause: the native engine addon (.node) was rejected by a sandboxed/app-embedded Node')}`
  );
  console.log(
    `  ${dim('(e.g. an editor runtime). Re-run with system Node — check `which node` — for local dogfood.')}`
  );
  console.log();
  console.log(`  ${bold('When the runtime loads, use:')}`);
  console.log(
    `    ${c('yellow', 'tools')}                                            ${dim('# list all tools with live schema')}`
  );
  console.log(
    `    ${c('yellow', 'tools <name>')}                                     ${dim('# show full input schema for one tool')}`
  );
  console.log(
    `    ${c('yellow', 'tools <name> --scheme')}                            ${dim('# schema only, never runs')}`
  );
  console.log(
    `    ${c('yellow', "tools <name> --queries '<json>'")}                  ${dim('# run a tool')}`
  );
  console.log();
  console.log(`  ${bold('AGENT CONTEXT')}`);
  console.log(
    `    ${c('yellow', 'context')}                                          ${dim('# protocol + concise tool descriptions')}`
  );
  console.log(
    `    ${c('yellow', 'context --full')}                                   ${dim('# MCP prompt + full tool descriptions')}`
  );
  console.log(
    `    ${c('yellow', 'context --json')}                                   ${dim('# machine-readable context wrapper')}`
  );
  console.log();
}

/**
 * Returns false so the caller falls back to showLightAvailableTools().
 * Per-tool help requires the live runtime — no static fallback to avoid stale data.
 */
export function showLightToolHelp(_toolName: string): boolean {
  return false;
}

export function printLightInstructions(
  _options: { full?: boolean; minimal?: boolean } = {}
): void {
  // No alternate protocol: core owns context and may itself be unavailable.
  console.log('Octocode CLI — Agent Context');
  console.log(
    'Context unavailable because the packaged tool contracts did not load.'
  );
  showLightAvailableTools();
}

export function printToolRuntimeUnavailable(): void {
  console.log();
  console.log(`  ${c('red', 'x')} Octocode tool runtime failed to load.`);
  console.log(
    `  ${dim('Schema summaries are available, but tool execution requires the packaged runtime.')}`
  );
  console.log();
}
