import type { InstanceRecord } from './registry.js';

/** Flags that take no value; every other `--name` takes the next argument. */
const BOOLEAN_FLAGS = new Set(['wait', 'top-level']);

/** The `--flag value` pairs and the plain words of a command line. A flag that needs a value and has none is an error: it never falls back to a default. */
export function parseArgs(args: string[]): { flags: Map<string, string | true>; words: string[] } {
  const flags = new Map<string, string | true>();
  const words: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (!arg.startsWith('--')) words.push(arg);
    else if (BOOLEAN_FLAGS.has(arg.slice(2))) flags.set(arg.slice(2), true);
    else {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value.`);
      flags.set(arg.slice(2), value);
      index += 1;
    }
  }
  return { flags, words };
}

/** The instance `--to` names; without it, the only running one, or the one in this directory when several run. */
export function pickInstance(instances: InstanceRecord[], id: string | undefined, cwd: string): InstanceRecord {
  const found = id !== undefined ? instances.filter((entry) => entry.id === id) : instances.length > 1 ? instances.filter((entry) => entry.cwd === cwd) : instances;
  if (found.length !== 1) throw new Error(found.length === 0 ? 'No running instance matches. Start Pi with OCTOCODE_API=1.' : `Several instances match; pass --to <id>: ${found.map((entry) => entry.id).join(', ')}`);
  return found[0]!;
}
