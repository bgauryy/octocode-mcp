import {
  delegateToNative,
  resolveNativeBin,
  shouldDelegateToNative,
} from './native-delegate.js';
import {
  hasHelpFlag,
  hasVersionFlag,
  isTrueFlag,
  parseArgs,
} from './parser.js';
import { reportExecutionFailure } from './exit-codes.js';

/**
 * The npm CLI is a launcher, not a second implementation. The native Rust
 * binary owns command parsing, command help, validation, and execution.
 * `schema` and `<tool> --help` included: the binary embeds the discovery
 * content. Node retains only management responsibilities:
 *  - `skill`: bundled-skill materialization (the native `skill` command
 *    shells back to this CLI; delegating it would recurse), and
 *  - the TTY client picker for a bare `install` (selection only — every
 *    operation after selection runs native).
 */
export async function runCLI(argv?: string[]): Promise<boolean> {
  const { maybeWarnAboutStaleBuild } = await import('./stale-build.js');
  maybeWarnAboutStaleBuild();

  const rawArgv = argv ?? process.argv.slice(2);
  const args = parseArgs(rawArgv);
  if (args.command === 'help' && args.args[0] === 'skill') {
    args.command = args.args.shift() ?? null;
    args.options.help = true;
  }

  // A bare `octocode` is the overview for whoever runs it: the command
  // reference on a terminal; on a pipe the binary prints the tool catalog
  // with agent instructions.
  if (
    args.command === null &&
    !hasHelpFlag(args) &&
    !hasVersionFlag(args) &&
    process.stdout.isTTY === true
  ) {
    rawArgv.push('--help');
  }

  if (args.command === null && hasVersionFlag(args) && !hasHelpFlag(args)) {
    const { versionLine } = await import('./version.js');
    const line = versionLine();
    if (line) {
      process.stdout.write(`${line}\n`);
      return true;
    }
  }

  if (!shouldDelegateToNative(args.command)) {
    const { skillCommand } = await import('./commands/skill.js');
    await skillCommand.handler(args);
    return true;
  }

  const resolved = resolveNativeBin();
  if ('error' in resolved) {
    // Runtime-unavailable is an execution failure (exit 5), matching the native
    // exit-code table and the `schema` path; do not throw into main().catch,
    // which would report the same condition as a crash. The resolver's own
    // message carries the fix (for example the missing platform package).
    process.exitCode = reportExecutionFailure(
      `The native Octocode runtime is unavailable for this platform or installation.\n${resolved.error}`,
      isTrueFlag(args.options.json),
      'toolUnavailable'
    );
    return false;
  }
  const { bin } = resolved;

  if (
    args.command === 'config' &&
    rawArgv[rawArgv.indexOf('config') + 1] === 'view' &&
    !hasHelpFlag(args)
  ) {
    const { configViewCommand } = await import('./commands/config-view.js');
    process.exitCode = await configViewCommand(bin, rawArgv);
    return true;
  }

  const hasExplicitIde = rawArgv.some(
    value => value === '--ide' || value.startsWith('--ide=')
  );
  const interactiveInstall =
    args.command === 'install' &&
    !hasExplicitIde &&
    !hasHelpFlag(args) &&
    !hasVersionFlag(args) &&
    !isTrueFlag(args.options.list) &&
    !isTrueFlag(args.options.json) &&
    process.stdin.isTTY === true &&
    process.stdout.isTTY === true;

  if (interactiveInstall) {
    const { runInteractiveInstall } = await import('./interactive-install.js');
    process.exitCode = await runInteractiveInstall(bin, rawArgv);
  } else {
    process.exitCode = await delegateToNative(bin, rawArgv);
  }
  return true;
}
