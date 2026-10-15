import fs from 'node:fs';
import path from 'node:path';

/**
 * Where the Windows system programs Pi spawns live. Windows resolves a bare program name (`spawn('taskkill')`) in the
 * current folder before PATH, so a repository holding `powershell.exe` would run before any permission ask. Every
 * system program is therefore started by absolute path, built here from %SystemRoot%; nothing else decides it. Pure
 * path arithmetic (`path.win32`), so it runs and is tested on any platform.
 */

export type Env = Readonly<Record<string, string | undefined>>;

const DEFAULT_ROOT = 'C:\\Windows';

/** An absolute path with a drive letter: the only kind that cannot resolve against the current folder. */
const driveAbsolute = (value: string): boolean => /^[a-z]:[\\/]/i.test(value);

/** The variable `name`, matched whatever its case (Windows' own rule; a plain object is case-sensitive). */
function envValue(env: Env, name: string): string | undefined {
  const key = Object.keys(env).find((each) => each.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : env[key];
}

/** %SystemRoot%, else %windir%, else `C:\Windows`: a value that is not drive-absolute is never used. */
export function systemRoot(env: Env = process.env): string {
  for (const name of ['SystemRoot', 'windir']) {
    const value = envValue(env, name)?.trim();
    if (value && driveAbsolute(value)) return path.win32.normalize(value).replace(/\\+$/, '');
  }
  return DEFAULT_ROOT;
}

/** The absolute path of `file` (relative to System32, e.g. `taskkill.exe`). */
export function system32Executable(file: string, env: Env = process.env): string {
  return path.win32.join(systemRoot(env), 'System32', file);
}

export interface LookupOptions {
  env?: Env;
  /** The folder a bare name would resolve in first; PATH entries that are it, or are relative, are skipped. */
  cwd?: string;
  /** Whether a file exists, replaceable. */
  exists?: (file: string) => boolean;
}

const sameFolder = (left: string, right: string): boolean => path.win32.resolve(left).replace(/\\+$/, '').toLowerCase() === path.win32.resolve(right).replace(/\\+$/, '').toLowerCase();

/** `<name>.exe` in the first PATH folder that holds it, never in the current folder or a relative PATH entry; undefined when none does. */
export function pathExecutable(name: string, options: LookupOptions = {}): string | undefined {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const exists = options.exists ?? ((file: string) => fs.existsSync(file));
  for (const entry of (envValue(env, 'PATH') ?? '').split(';')) {
    const folder = entry.trim().replace(/^"(.*)"$/, '$1');
    if (!driveAbsolute(folder) || sameFolder(folder, cwd)) continue;
    const file = path.win32.join(folder, `${name}.exe`);
    if (exists(file)) return file;
  }
  return undefined;
}

/** The PowerShells the helper tries in order, by absolute path: `pwsh` found on PATH, then Windows PowerShell in System32. */
export function powerShellCandidates(options: LookupOptions = {}): string[] {
  const pwsh = pathExecutable('pwsh', options);
  return [...(pwsh ? [pwsh] : []), system32Executable('WindowsPowerShell\\v1.0\\powershell.exe', options.env)];
}
