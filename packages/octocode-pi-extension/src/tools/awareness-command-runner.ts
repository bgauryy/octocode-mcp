import { execFile } from 'node:child_process';
import type { PiExecResult } from '../types.js';
import { buildAwarenessCommand } from '../assets.js';

export const DEFAULT_AWARENESS_COMMAND_TIMEOUT_MS = 120_000;
const MAX_AWARENESS_PROCESS_OUTPUT_BYTES = 1024 * 1024;

export interface AwarenessCommandRunnerOptions {
  cwd: string;
  env: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export type AwarenessCommandRunner = (
  args: string[],
  options: AwarenessCommandRunnerOptions,
) => Promise<PiExecResult>;

/** Execute the bundled Awareness CLI without a shell. */
export const runAwarenessCommand: AwarenessCommandRunner = async (args, options) => {
  if (options.signal?.aborted) throw new Error('Awareness command aborted');
  const command = buildAwarenessCommand(args);
  const timeoutMs = options.timeoutMs ?? DEFAULT_AWARENESS_COMMAND_TIMEOUT_MS;

  return new Promise<PiExecResult>((resolve, reject) => {
    execFile(command.cmd, command.args, {
      cwd: options.cwd,
      env: options.env,
      signal: options.signal,
      timeout: timeoutMs,
      maxBuffer: MAX_AWARENESS_PROCESS_OUTPUT_BYTES,
      windowsHide: true,
    }, (error, stdout, stderr) => {
      if (!error) {
        resolve({ stdout, stderr, code: 0, killed: false });
        return;
      }
      if (options.signal?.aborted) {
        resolve({ stdout, stderr, code: null, killed: true });
        return;
      }
      if (error.killed) {
        reject(new Error(`Awareness command timed out after ${timeoutMs}ms`));
        return;
      }
      if (typeof error.code === 'number') {
        resolve({ stdout, stderr, code: error.code, killed: false });
        return;
      }
      reject(error);
    });
  });
};
