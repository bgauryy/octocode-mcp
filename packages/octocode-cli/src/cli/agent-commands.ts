import type { CLICommand, ParsedArgs } from './types.js';
import { executeToolCommand } from './tool-command.js';
import { c, dim } from '../utils/colors.js';
import {
  AGENT_COMMAND_SPECS,
  findAgentCommandSpec,
  toAgentHelpCommand,
  type AgentCommandSpec,
} from './agent-command-specs.js';

function kebabToCamel(name: string): string {
  return name.replace(/-([a-z])/g, (_, ch: string) => ch.toUpperCase());
}

function buildQueryFromFlags(
  spec: AgentCommandSpec,
  options: Record<string, string | boolean>
): Record<string, unknown> {
  const query: Record<string, unknown> = {};

  for (const flag of spec.flags) {
    const value = options[flag.name];
    if (value === undefined) continue;

    const field = flag.field ?? kebabToCamel(flag.name);
    const type = flag.type ?? 'string';

    if (type === 'boolean') {
      query[field] = Boolean(value);
      continue;
    }

    if (typeof value !== 'string') {
      if (type === 'array' && value === true) {
        continue;
      }
      query[field] = value;
      continue;
    }

    if (type === 'number') {
      const n = Number(value);
      if (Number.isFinite(n)) {
        query[field] = n;
      } else {
        throw new Error(`--${flag.name} must be a number, got "${value}"`);
      }
      continue;
    }

    if (type === 'array') {
      query[field] = value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
      continue;
    }

    query[field] = value;
  }

  return query;
}

function validateRequiredFlags(
  spec: AgentCommandSpec,
  options: Record<string, string | boolean>
): string[] {
  const missing: string[] = [];
  for (const flag of spec.flags) {
    if (flag.required && options[flag.name] === undefined) {
      missing.push(`--${flag.name}`);
    }
  }
  return missing;
}

function printAgentError(message: string, details: string[] = []): void {
  console.error();
  console.error(`  ${c('red', 'X')} ${message}`);
  for (const detail of details) {
    console.error(`  ${dim('-')} ${detail}`);
  }
  console.error();
}

async function readStdinJson(): Promise<string | null> {
  if (process.stdin.isTTY) return null;

  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      const trimmed = data.trim();
      resolve(trimmed.length > 0 ? trimmed : null);
    });
    process.stdin.on('error', reject);
  });
}

function hasAnyFlag(
  spec: AgentCommandSpec,
  options: Record<string, string | boolean>
): boolean {
  return spec.flags.some(flag => options[flag.name] !== undefined);
}

async function runAgentSubcommand(
  spec: AgentCommandSpec,
  args: ParsedArgs
): Promise<void> {
  const stdinPayload = await readStdinJson();

  let payloadJson: string;

  if (stdinPayload !== null) {
    if (hasAnyFlag(spec, args.options)) {
      console.error(
        `  ${dim('note: stdin payload detected; ignoring command-line flags')}`
      );
    }
    payloadJson = stdinPayload;
  } else {
    const missing = validateRequiredFlags(spec, args.options);
    if (missing.length > 0) {
      printAgentError(
        `Missing required flag${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
        [
          `Usage: ${spec.usage.replace(/\boctocode\b/g, 'octocode-cli')}`,
          `Run 'octocode-cli ${spec.name} --help' for details.`,
        ]
      );
      process.exitCode = 1;
      return;
    }

    let query: Record<string, unknown>;
    try {
      query = buildQueryFromFlags(spec, args.options);
    } catch (err) {
      printAgentError(
        err instanceof Error ? err.message : 'Invalid flag value'
      );
      process.exitCode = 1;
      return;
    }

    payloadJson = JSON.stringify(query);
  }

  const toolArgs: ParsedArgs = {
    command: 'tool',
    args: [spec.tool, payloadJson],
    options: {
      tool: spec.tool,
      ...(args.options.json === true ? { json: true } : {}),
      ...(typeof args.options.output === 'string'
        ? { output: args.options.output }
        : {}),
    },
  };

  const success = await executeToolCommand(toolArgs);
  if (!success) {
    process.exitCode = 1;
  }
}

function withAgentHandler(spec: AgentCommandSpec): CLICommand {
  return {
    ...toAgentHelpCommand(spec),
    handler: (args: ParsedArgs) => runAgentSubcommand(spec, args),
  };
}

export const agentCommands: CLICommand[] =
  AGENT_COMMAND_SPECS.map(withAgentHandler);

export function findAgentCommand(name: string): CLICommand | undefined {
  const spec = findAgentCommandSpec(name);
  return spec ? withAgentHandler(spec) : undefined;
}
