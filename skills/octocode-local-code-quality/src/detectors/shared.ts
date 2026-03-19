import type { DependencyState, Finding } from '../types/index.js';

export type FindingDraft = Omit<Finding, 'id'>;

const MAX_FINDINGS_PER_DETECTOR = 200;

export function canAddFinding(findings: FindingDraft[]): boolean {
  return findings.length < MAX_FINDINGS_PER_DETECTOR;
}

export function findImportLine(
  state: DependencyState,
  fromFile: string,
  toFile: string
): { lineStart: number; lineEnd: number } {
  const imports = state.importedSymbolsByFile.get(fromFile);
  if (imports) {
    for (const ref of imports) {
      if (ref.resolvedModule === toFile && ref.lineStart) {
        return {
          lineStart: ref.lineStart,
          lineEnd: ref.lineEnd ?? ref.lineStart,
        };
      }
    }
  }
  const reexports = state.reExportsByFile.get(fromFile);
  if (reexports) {
    for (const ref of reexports) {
      if (ref.resolvedModule === toFile && ref.lineStart) {
        return {
          lineStart: ref.lineStart,
          lineEnd: ref.lineEnd ?? ref.lineStart,
        };
      }
    }
  }
  return { lineStart: 1, lineEnd: 1 };
}

export function isLikelyEntrypoint(filePath: string): boolean {
  const normalized = filePath.toLowerCase();
  if (
    /(^|\/)(index|main|app|server|cli|public)\.[mc]?[jt]sx?$/.test(normalized)
  )
    return true;
  if (/\.(config)\.[mc]?[jt]sx?$/.test(normalized)) return true;
  return false;
}
