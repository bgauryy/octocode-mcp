import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function isDirectRun(
  importMetaUrl: string,
  argv1: string | undefined = process.argv[1],
): boolean {
  if (!argv1) {
    return false;
  }

  return fileURLToPath(importMetaUrl) === path.resolve(argv1);
}
