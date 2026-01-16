/**
 * prompt.ts - Get detailed information about a specific prompt
 *
 * Usage:
 *   npx tsx scripts/prompt.ts <prompt-name>
 *   npx tsx scripts/prompt.ts research
 *   npx tsx scripts/prompt.ts reviewPR --json
 */

import { colors, log, BASE_URL, handleConnectionError } from './common.js';

async function fetchPromptInfo(name: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${BASE_URL}/prompts/info/${encodeURIComponent(name)}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Prompt not found: ${name}`);
    }
    throw new Error(`Failed to fetch prompt: ${response.status}`);
  }

  return response.json();
}

async function listAvailablePrompts(): Promise<string[]> {
  const response = await fetch(`${BASE_URL}/prompts/list`);
  if (!response.ok) {
    return [];
  }
  const data = await response.json();
  return (data.prompts || []).map((p: { name: string }) => p.name);
}

function printUsage(): void {
  console.log(`
${colors.bold}Usage:${colors.reset}
  npx tsx scripts/prompt.ts <prompt-name> [--json]

${colors.bold}Examples:${colors.reset}
  npx tsx scripts/prompt.ts research         ${colors.dim}# External code research${colors.reset}
  npx tsx scripts/prompt.ts research_local   ${colors.dim}# Local codebase research${colors.reset}
  npx tsx scripts/prompt.ts reviewPR         ${colors.dim}# PR review${colors.reset}
  npx tsx scripts/prompt.ts plan             ${colors.dim}# Implementation planning${colors.reset}
  npx tsx scripts/prompt.ts generate         ${colors.dim}# Scaffold new project${colors.reset}

${colors.bold}Options:${colors.reset}
  --json    Output as JSON
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const promptName = args.find(a => !a.startsWith('--'));

  if (!promptName || args.includes('--help')) {
    printUsage();

    try {
      const available = await listAvailablePrompts();
      if (available.length > 0) {
        console.log(`${colors.bold}Available prompts:${colors.reset}`);
        available.forEach(p => console.log(`  ${colors.green}▸${colors.reset} ${p}`));
        console.log();
      }
    } catch {
      // Server might not be running, that's ok
    }

    process.exit(promptName ? 0 : 1);
  }

  const data = await fetchPromptInfo(promptName);

  if (asJson) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  console.log();
  log('📋', `Prompt: ${promptName}`, colors.bold + colors.magenta);
  console.log(`${colors.dim}─────────────────────────────────────────${colors.reset}`);
  console.log();

  // Handle different response formats
  if (data.messages && Array.isArray(data.messages)) {
    for (const msg of data.messages) {
      if (msg.role) {
        console.log(`${colors.cyan}[${msg.role}]${colors.reset}`);
      }
      if (msg.content && typeof msg.content === 'object' && msg.content.text) {
        console.log(msg.content.text);
      } else if (msg.content && typeof msg.content === 'string') {
        console.log(msg.content);
      }
      console.log();
    }
  } else if (data.content) {
    if (Array.isArray(data.content)) {
      for (const item of data.content) {
        if (item.type === 'text') {
          console.log(item.text);
        }
      }
    } else {
      console.log(data.content);
    }
  } else if (data.description) {
    console.log(`${colors.bold}Description:${colors.reset} ${data.description}`);
    console.log();
    if (data.arguments) {
      console.log(`${colors.bold}Arguments:${colors.reset}`);
      console.log(JSON.stringify(data.arguments, null, 2));
    }
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

main().catch(async (error) => {
  if (error instanceof Error && error.message.includes('not found')) {
    console.error(`\n❌ ${error.message}`);
    const available = await listAvailablePrompts();
    if (available.length > 0) {
      console.error('\nAvailable prompts:');
      available.forEach(p => console.error(`  - ${p}`));
    }
    console.error();
    process.exit(1);
  }
  handleConnectionError(error);
});
