import { executeAwarenessCommand, type AwarenessCommandCall, type AwarenessCommandContext, type AwarenessCommandResult } from '@octocodeai/octocode-awareness';

export const DEFAULT_AWARENESS_COMMAND_TIMEOUT_MS = 120_000;
export interface AwarenessCommandRunnerOptions extends AwarenessCommandContext { timeoutMs?: number }
export type AwarenessCommandRunner = (request: AwarenessCommandCall, options: AwarenessCommandRunnerOptions) => Promise<AwarenessCommandResult>;

/** Import the package API directly. Deadlines are cooperative, including lock waits. */
export const runAwarenessCommand: AwarenessCommandRunner = async (request, options) => {
  const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_AWARENESS_COMMAND_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  return executeAwarenessCommand(request, { ...options, signal });
};
