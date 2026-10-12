/**
 * The exit codes the Node-owned commands emit. They follow the native exit
 * table (`octocode --help`), which owns the remaining codes.
 */
export const EXIT = {
  OK: 0,
  /** A skill operation failed. */
  GENERAL: 1,
  USAGE: 2,
  /** The native runtime is unavailable or failed. */
  TOOL: 5,
} as const;

/**
 * The native CLI's JSON error envelope: `{error}` for a command error, plus
 * `errorCode` for a typed failure (a tool call's error adds `details`). The
 * one error shape on every Node-owned path.
 */
export function toolErrorJson(error: string, errorCode?: string): string {
  return JSON.stringify(errorCode ? { error, errorCode } : { error });
}

/**
 * Report an execution failure (runtime unavailable, crash, binary that will
 * not start) the way the native CLI reports one: the typed envelope on stdout
 * with `--json`, else the text on stderr. Returns the exit code (5; exit 1
 * means an empty result).
 */
export function reportExecutionFailure(
  message: string,
  json: boolean,
  errorCode: string
): number {
  if (json) console.log(toolErrorJson(message, errorCode));
  else console.error(message);
  return EXIT.TOOL;
}
