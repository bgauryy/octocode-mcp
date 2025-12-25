import { homedir } from 'node:os';
import { runCommand } from './shell.js';

export interface AppContext {
  cwd: string;
  ide: 'Cursor' | 'VS Code' | 'Terminal' | 'Unknown';
  git?: {
    branch: string;
    root: string;
  };
}

/**
 * Get the current application context (path, IDE, git info)
 */
export function getAppContext(): AppContext {
  return {
    cwd: getShortCwd(),
    ide: detectIDE(),
    git: detectGit(),
  };
}

function getShortCwd(): string {
  const cwd = process.cwd();
  const home = homedir();
  if (cwd.startsWith(home)) {
    return '~' + cwd.slice(home.length);
  }
  return cwd;
}

function detectIDE(): AppContext['ide'] {
  const env = process.env;
  if (env.CURSOR_AGENT || env.CURSOR_TRACE_ID) {
    return 'Cursor';
  }
  if (env.TERM_PROGRAM === 'vscode' || env.VSCODE_PID) {
    return 'VS Code';
  }
  if (env.TERM_PROGRAM === 'Apple_Terminal') {
    return 'Terminal';
  }
  return 'Terminal'; // Default fallback
}

function detectGit(): AppContext['git'] | undefined {
  const root = runCommand('git', ['rev-parse', '--show-toplevel']);
  if (!root.success) return undefined;

  const branch = runCommand('git', ['branch', '--show-current']);

  return {
    root: root.stdout.split('/').pop() || 'repo', // Just the repo name
    branch: branch.success ? branch.stdout : 'HEAD',
  };
}
