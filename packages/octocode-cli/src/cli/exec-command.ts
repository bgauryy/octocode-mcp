import { readFileSync } from 'node:fs';
import type { CLICommand, ParsedArgs } from './types.js';
import { c, dim } from '../utils/colors.js';
import { runOctocodeScript } from './exec-runtime.js';

function printExecError(message: string, details: string[] = []): void {
  console.error();
  console.error(`  ${c('red', 'X')} ${message}`);
  for (const detail of details) {
    console.error(`  ${dim('-')} ${detail}`);
  }
  console.error();
}

async function readStdin(): Promise<string | null> {
  if (process.stdin.isTTY) return null;

  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data.length > 0 ? data : null);
    });
    process.stdin.on('error', reject);
  });
}

async function readScriptSource(args: ParsedArgs): Promise<string | null> {
  const fileOpt = args.options['file'];
  if (typeof fileOpt === 'string' && fileOpt.length > 0) {
    try {
      return readFileSync(fileOpt, 'utf8');
    } catch (err) {
      throw new Error(
        `Cannot read script file "${fileOpt}": ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const firstArg = args.args[0];
  if (typeof firstArg === 'string' && firstArg.length > 0) {
    return firstArg;
  }

  return readStdin();
}

function parseTimeout(raw: unknown): number | undefined {
  if (raw === undefined || raw === true) return undefined;
  if (typeof raw !== 'string') return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`--timeout must be a positive number of ms, got "${raw}"`);
  }
  return n;
}

function formatReturnValue(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

async function runExecCommand(args: ParsedArgs): Promise<void> {
  let scriptSource: string | null;
  try {
    scriptSource = await readScriptSource(args);
  } catch (err) {
    printExecError(
      err instanceof Error ? err.message : 'Failed to read script'
    );
    process.exitCode = 1;
    return;
  }

  if (!scriptSource || scriptSource.trim().length === 0) {
    printExecError('No script provided.', [
      "Pass a script inline: octocode-cli exec 'console.log(await oct.tools())'",
      'Or via file: octocode-cli exec --file ./script.js',
      "Or via stdin: echo 'return await oct.tools()' | octocode-cli exec",
    ]);
    process.exitCode = 1;
    return;
  }

  let timeoutMs: number | undefined;
  try {
    timeoutMs = parseTimeout(args.options['timeout']);
  } catch (err) {
    printExecError(err instanceof Error ? err.message : 'Invalid --timeout');
    process.exitCode = 1;
    return;
  }

  const jsonOutput = args.options.json === true;

  try {
    const { returnValue, logs } = await runOctocodeScript(scriptSource, {
      timeoutMs,
    });

    if (jsonOutput) {
      console.log(
        JSON.stringify({ returnValue: returnValue ?? null, logs }, null, 2)
      );
      return;
    }

    for (const line of logs) {
      console.log(line);
    }

    const formatted = formatReturnValue(returnValue);
    if (formatted.length > 0) {
      console.log(formatted);
    }
  } catch (err) {
    printExecError(
      err instanceof Error ? err.message : 'Script execution failed'
    );
    process.exitCode = 1;
  }
}

export const execCommand: CLICommand = {
  name: 'exec',
  description:
    'Run a JavaScript script against the Octocode tool namespace (oct.*)',
  usage:
    "octocode exec '<script>' | --file <path> | stdin  [--timeout <ms>] [--json]",
  options: [
    {
      name: 'file',
      description: 'Read script from file instead of positional arg',
      hasValue: true,
    },
    {
      name: 'timeout',
      description: 'Script timeout in ms (default: 60000)',
      hasValue: true,
      default: '60000',
    },
    {
      name: 'json',
      description: 'Print { returnValue, logs } as JSON instead of plain text',
    },
  ],
  handler: runExecCommand,
};
