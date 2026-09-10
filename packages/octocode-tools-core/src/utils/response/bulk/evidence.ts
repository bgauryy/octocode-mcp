import type { EvidenceKind } from '../../../types/toolResults.js';

export function inferEvidenceKind(
  toolName: string,
  query: object,
  data: Record<string, unknown>
): EvidenceKind {
  if (toolName === 'ast.topology') return 'syntactic';
  if (toolName === 'astSearch') {
    const operation = (query as Record<string, unknown>).operation;
    if (
      operation === 'files' ||
      (operation === 'tree' &&
        (query as Record<string, unknown>).treeKind !== 'syntax')
    )
      return 'exact';
    return operation === 'match' ? 'structural' : 'syntactic';
  }
  if (toolName === 'lspSearch') {
    const source = (data.lsp as { source?: string } | undefined)?.source;
    return source &&
      ['native', 'native-graph-facts', 'markdown'].includes(source)
      ? 'syntactic'
      : 'semantic';
  }
  if (toolName === 'local.text') {
    return (query as Record<string, unknown>).mode === 'structural'
      ? 'structural'
      : 'lexical';
  }
  if (toolName === 'localSearch') return 'lexical';

  if (
    toolName.startsWith('gh') ||
    toolName.startsWith('github.') ||
    toolName === 'artifactSearch'
  )
    return 'provider';
  return 'exact';
}
