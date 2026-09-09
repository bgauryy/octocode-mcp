const graphOperations = new Set([
  'dependencies',
  'dependents',
  'path',
  'cycles',
  'reachability',
  'deadCode',
]);

/** Translate only executable tool-query envelopes; never alter source strings. */
export function normalizeAstContinuations<T>(value: T): T {
  if (Array.isArray(value)) return value.map(normalizeAstContinuations) as T;
  if (!value || typeof value !== 'object') return value;
  const result = Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      normalizeAstContinuations(item),
    ])
  );
  const tool = result.tool;
  if (
    !['local.text', 'local.files', 'local.tree', 'ast.topology'].includes(
      String(tool)
    )
  )
    return result as T;
  if (!result.query || typeof result.query !== 'object') return result as T;
  const query = { ...(result.query as Record<string, unknown>) };
  delete query.goal;
  delete query.reasoning;
  if (tool === 'ast.topology' && graphOperations.has(String(query.operation))) {
    query.analysis = query.operation;
    query.operation = 'topology';
  } else if (tool === 'local.text' && query.mode === 'structural') {
    query.operation = 'match';
    query.resultView = query.output ?? 'content';
    query.pageSize = query.itemsPerPage;
    query.reverse = query.sortReverse;
    for (const key of [
      'mode',
      'output',
      'itemsPerPage',
      'sortReverse',
      'searchText',
      'regex',
      'caseMode',
      'wholeWord',
      'invertMatch',
      'multiline',
      'unique',
      'matchWindow',
    ])
      delete query[key];
  } else if (tool === 'local.files' || tool === 'local.tree') {
    query.operation = tool === 'local.files' ? 'files' : 'tree';
    query.pageSize = query.itemsPerPage;
    query.sort = query.sortBy;
    delete query.itemsPerPage;
    delete query.sortBy;
    if (tool === 'local.files') {
      query.pathRegex = query.regex;
      delete query.regex;
    } else {
      query.treeKind = 'filesystem';
      query.namePattern = query.pattern;
      delete query.pattern;
      delete query.recursive;
    }
  } else return result as T;
  return { ...result, tool: 'astSearch', query } as T;
}
