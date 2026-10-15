import { spawn } from 'node:child_process';
import { system32Executable } from './winpath.js';

interface OpenOptions {
  platform?: NodeJS.Platform;
  /** Replaceable so a test never opens a real application. */
  spawn?: typeof spawn;
}

/** The command that opens `file` in its default application on `platform`. */
function opener(file: string, platform: NodeJS.Platform): { command: string; args: string[]; verbatim: boolean } {
  if (platform === 'darwin') return { command: 'open', args: [file], verbatim: false };
  // `start` is a cmd builtin: its first quoted argument is a window title, and the path is quoted so `&` stays a path character.
  if (platform === 'win32') return { command: system32Executable('cmd.exe'), args: ['/d', '/c', `start "" "${file}"`], verbatim: true };
  return { command: 'xdg-open', args: [file], verbatim: false };
}

/**
 * Opens `file` with the system's default application (`open`, `xdg-open` or `cmd /c start`), detached so it outlives
 * this process. Resolves once the opener started; rejects with the spawn error (a missing `xdg-open`, for one).
 */
export function openFile(file: string, options: OpenOptions = {}): Promise<void> {
  const { command, args, verbatim } = opener(file, options.platform ?? process.platform);
  return new Promise((resolve, reject) => {
    const child = (options.spawn ?? spawn)(command, args, { detached: true, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: verbatim });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}
