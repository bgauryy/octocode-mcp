import { EXIT, reportExecutionFailure } from './exit-codes.js';
import { NativeLaunchError } from './native-delegate.js';
import { isTrueFlag, parseArgs } from './parser.js';

/**
 * Report a crash that escaped the CLI (a bug, or a native binary that could
 * not start) as an execution failure: the native error envelope with `--json`
 * (read from the parsed flag, not raw argv text), else text on stderr, and
 * exit 5. An unexpected crash keeps its stack on stderr; a launch failure is
 * already a complete message.
 */
export function reportCrash(error: unknown, argv: readonly string[]): number {
  const message = error instanceof Error ? error.message : String(error);
  const json = isTrueFlag(parseArgs([...argv]).options.json);
  if (json || error instanceof NativeLaunchError) {
    return reportExecutionFailure(message, json, 'executionFailed');
  }
  console.error('Error:', error);
  return EXIT.TOOL;
}
