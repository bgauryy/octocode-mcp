import { homedir } from 'node:os';
import path from 'node:path';
import { runCommand } from './shell.js';

interface AppContext {
  cwd: string;
  ide: 'Cursor' | 'VS Code' | 'Terminal';
  git?: {
    branch: string;
    root: string;
  };
}

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
  const normalizedCwd = path.normalize(cwd);
  const normalizedHome = path.normalize(home);
  if (normalizedCwd.toLowerCase().startsWith(normalizedHome.toLowerCase())) {
    return '~' + normalizedCwd.slice(normalizedHome.length);
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
  return 'Terminal';
}

function detectGit(): AppContext['git'] | undefined {
  const root = runCommand('git', ['rev-parse', '--show-toplevel']);
  if (!root.success) return undefined;

  const branch = runCommand('git', ['branch', '--show-current']);

  return {
    root: path.basename(root.stdout.trim()) || 'repo',
    branch: branch.success ? branch.stdout : 'HEAD',
  };
}
