import { constants as fsConstants } from 'node:fs';
import { mkdir, open, rm, writeFile, link } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

type BoundaryChecker = (boundaryRoot: string, target: string, label: string) => Promise<void>;
type SymlinkChecker = (path: string, label: string) => Promise<void>;

function hasCatchAllIgnoreRule(content: string): boolean {
  let hasCatchAll = false;
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith('!')) return false;
    if (line.startsWith('#')) continue;
    let end = line.length;
    while (end > 0 && line[end - 1] === ' ') {
      let backslashes = 0;
      for (let index = end - 2; index >= 0 && line[index] === '\\'; index--) backslashes++;
      if (backslashes % 2 === 1) break;
      end--;
    }
    if (line.slice(0, end) === '*') hasCatchAll = true;
  }
  return hasCatchAll;
}

async function readIgnoreMarker(path: string): Promise<string> {
  const handle = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    return await handle.readFile('utf8');
  } finally {
    await handle.close();
  }
}

export async function ensureHistoryIgnoreMarker(
  path: string,
  boundaryRoot: string | undefined,
  assertDirectoryChain: BoundaryChecker,
  rejectSymlink: SymlinkChecker,
): Promise<void> {
  const parent = resolve(path, '..');
  if (boundaryRoot) await assertDirectoryChain(boundaryRoot, parent, 'history ignore marker ancestor');
  await mkdir(parent, { recursive: true, mode: 0o700 });
  await rejectSymlink(path, 'history ignore marker');
  try {
    const content = await readIgnoreMarker(path);
    if (!hasCatchAllIgnoreRule(content)) throw new Error(`History ignore marker must contain a catch-all '*' rule: ${path}`);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const temporary = resolve(parent, `.octocode-ignore-${randomUUID()}.tmp`);
  await writeFile(temporary, '*\n', { encoding: 'utf8', mode: 0o644, flag: 'wx' });
  try {
    await link(temporary, path).catch(async error => {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      await rejectSymlink(path, 'history ignore marker');
      const content = await readIgnoreMarker(path);
      if (!hasCatchAllIgnoreRule(content)) throw new Error(`History ignore marker must contain a catch-all '*' rule: ${path}`);
    });
  } finally {
    await rm(temporary, { force: true });
  }
}
