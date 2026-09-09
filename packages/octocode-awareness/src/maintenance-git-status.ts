import { readGitStatus } from './git.js';


export function gitDirtyFiles(workspacePath: string | null): string[] {
  try {
    return readGitStatus(workspacePath).map(change => change.path);
  } catch {
    return [];
  }
}
