/**
 * discover.ts - Discover available tools and prompts
 *
 * Usage:
 *   npx tsx scripts/discover.ts              # Show tools and prompts
 *   npx tsx scripts/discover.ts --tools      # Show only tools
 *   npx tsx scripts/discover.ts --prompts    # Show only prompts
 *   npx tsx scripts/discover.ts --json       # Output as JSON
 */

import { colors, log, BASE_URL, handleConnectionError } from './common.js';

interface Tool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

interface Prompt {
  name: string;
  description?: string;
}

async function fetchTools(): Promise<Tool[]> {
  const response = await fetch(`${BASE_URL}/tools/list`);
  if (!response.ok) {
    throw new Error(`Failed to fetch tools: ${response.status}`);
  }
  const data = await response.json();
  return data.tools || [];
}

async function fetchPrompts(): Promise<Prompt[]> {
  const response = await fetch(`${BASE_URL}/prompts/list`);
  if (!response.ok) {
    throw new Error(`Failed to fetch prompts: ${response.status}`);
  }
  const data = await response.json();
  return data.prompts || [];
}

function displayTools(tools: Tool[]): void {
  console.log();
  log('🔧', `Available Tools (${tools.length})`, colors.bold + colors.cyan);
  console.log(`${colors.dim}─────────────────────────────────────────${colors.reset}`);
  console.log();

  for (const tool of tools) {
    console.log(`  ${colors.green}▸${colors.reset} ${colors.bold}${tool.name}${colors.reset}`);
    if (tool.description) {
      console.log(`    ${colors.dim}${tool.description}${colors.reset}`);
    }
    console.log();
  }
}

function displayPrompts(prompts: Prompt[]): void {
  console.log();
  log('📋', `Available Prompts (${prompts.length})`, colors.bold + colors.magenta);
  console.log(`${colors.dim}─────────────────────────────────────────${colors.reset}`);
  console.log();

  for (const prompt of prompts) {
    console.log(`  ${colors.yellow}▸${colors.reset} ${colors.bold}${prompt.name}${colors.reset}`);
    if (prompt.description) {
      console.log(`    ${colors.dim}${prompt.description}${colors.reset}`);
    }
    console.log();
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const toolsOnly = args.includes('--tools');
  const promptsOnly = args.includes('--prompts');

  const showAll = !toolsOnly && !promptsOnly;

  const [tools, prompts] = await Promise.all([
    (showAll || toolsOnly) ? fetchTools() : Promise.resolve([]),
    (showAll || promptsOnly) ? fetchPrompts() : Promise.resolve([]),
  ]);

  if (asJson) {
    const result: Record<string, unknown> = {};
    if (showAll || toolsOnly) result.tools = tools;
    if (showAll || promptsOnly) result.prompts = prompts;
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log();
  log('🔍', 'Octocode Research - Discovery', colors.bold);

  if (showAll || toolsOnly) {
    displayTools(tools);
  }

  if (showAll || promptsOnly) {
    displayPrompts(prompts);
  }

  console.log(`${colors.dim}─────────────────────────────────────────${colors.reset}`);
  log('💡', 'Use: npx tsx scripts/prompt.ts <name> to get prompt details', colors.dim);
  console.log();
}

main().catch(handleConnectionError);
