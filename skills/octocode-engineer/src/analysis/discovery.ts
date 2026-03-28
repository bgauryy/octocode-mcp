import fs from 'node:fs';
import path from 'node:path';

import { isTestFile } from '../common/utils.js';
import { ALLOWED_EXTS } from '../types/index.js';

import type { AnalysisOptions, FileEntry, PackageInfo } from '../types/index.js';

const SOURCE_MIRROR_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

function isExplicitlyScoped(
  filePath: string,
  scope: AnalysisOptions['scope']
): boolean {
  if (!scope || scope.length === 0) return false;
  const normalizedFile = path.normalize(filePath);
  return scope.some(scopeEntry => {
    const normalizedScope = path.normalize(scopeEntry);
    return (
      normalizedFile === normalizedScope ||
      normalizedFile.startsWith(normalizedScope + path.sep)
    );
  });
}

function isMinifiedArtifact(fileName: string): boolean {
  return /\.min\.(?:js|mjs|cjs)$/i.test(fileName);
}

function hasSrcMirror(filePath: string, rootDir: string): boolean {
  const rel = path.relative(rootDir, filePath);
  if (!rel || rel.startsWith('..')) return false;
  const parts = rel.split(path.sep);
  if (parts[0] !== 'scripts' || parts.length < 2) return false;

  const ext = path.extname(filePath);
  const relWithoutExt = parts.slice(1).join(path.sep).slice(0, -ext.length);
  for (const candidateExt of SOURCE_MIRROR_EXTS) {
    const candidate = path.join(rootDir, 'src', `${relWithoutExt}${candidateExt}`);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return true;
  }
  return false;
}

export function collectFiles(rootDir: string, opts: AnalysisOptions): string[] {
  const files: string[] = [];
  const walk = (dir: string): void => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (opts.ignoreDirs.has(entry.name)) continue;
      if (entry.isSymbolicLink()) continue;

      const next = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(next);
        continue;
      }

      if (!entry.isFile()) continue;
      if (entry.name.endsWith('.d.ts')) continue;

      if (
        !isExplicitlyScoped(next, opts.scope) &&
        (isMinifiedArtifact(entry.name) || hasSrcMirror(next, rootDir))
      ) {
        continue;
      }

      const ext = path.extname(entry.name);
      if (!ALLOWED_EXTS.has(ext)) continue;
      if (!opts.includeTests && isTestFile(next)) continue;

      files.push(next);
    }
  };

  walk(rootDir);
  return files;
}

export function safeRead(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

export function listWorkspacePackages(
  root: string,
  packageRoot: string
): PackageInfo[] {
  if (!fs.existsSync(packageRoot) || !fs.statSync(packageRoot).isDirectory())
    return [];

  const packageDirs = fs
    .readdirSync(packageRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));

  const packages: PackageInfo[] = [];
  for (const entry of packageDirs) {
    const dir = path.join(packageRoot, entry.name);
    const manifest = path.join(dir, 'package.json');
    if (!fs.existsSync(manifest)) continue;

    try {
      const json = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      if (typeof json.name === 'string') {
        packages.push({ name: json.name, dir, folder: entry.name });
      }
    } catch {
      void 0;
    }
  }

  return packages;
}

export function fileSummaryWithFindings(
  fileSummaries: FileEntry[],
  byFile: Map<string, string[]>
): (FileEntry & { issueIds: string[] })[] {
  return fileSummaries.map(entry => ({
    ...entry,
    issueIds: byFile.get(entry.file) || [],
  }));
}
