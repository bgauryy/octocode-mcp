/**
 * Local tool schema helpers for typed access to tool schema descriptions.
 */
import { TOOL_NAMES } from './proxies.js';
import { createSchemaHelper } from './schemaHelperFactory.js';

export const LOCAL_RIPGREP = createSchemaHelper(TOOL_NAMES.LOCAL_RIPGREP) as {
  search: {
    pattern: string;
    path: string;
    mode: string;
  };
  filters: {
    type: string;
    include: string;
    exclude: string;
    excludeDir: string;
    binaryFiles: string;
    noIgnore: string;
    hidden: string;
    followSymlinks: string;
  };
  options: {
    smartCase: string;
    caseInsensitive: string;
    caseSensitive: string;
    fixedString: string;
    perlRegex: string;
    wholeWord: string;
    invertMatch: string;
    multiline: string;
    multilineDotall: string;
  };
  output: {
    filesOnly: string;
    filesWithoutMatch: string;
    count: string;
    countMatches: string;
    jsonOutput: string;
    vimgrepFormat: string;
    includeStats: string;
    includeDistribution: string;
  };
  context: {
    contextLines: string;
    beforeContext: string;
    afterContext: string;
    matchContentLength: string;
    lineNumbers: string;
    column: string;
  };
  pagination: {
    filesPerPage: string;
    filePageNumber: string;
    matchesPerPage: string;
    maxFiles: string;
    maxMatchesPerFile: string;
  };
  advanced: {
    threads: string;
    mmap: string;
    noUnicode: string;
    encoding: string;
    sort: string;
    sortReverse: string;
    noMessages: string;
    lineRegexp: string;
    passthru: string;
    debug: string;
    showFileLastModified: string;
  };
};

export const LOCAL_FETCH_CONTENT = createSchemaHelper(
  TOOL_NAMES.LOCAL_FETCH_CONTENT
) as {
  scope: {
    path: string;
  };
  range: {
    startLine: string;
    endLine: string;
  };
  options: {
    fullContent: string;
    matchString: string;
    matchStringContextLines: string;
    matchStringIsRegex: string;
    matchStringCaseSensitive: string;
    minified: string;
  };
  pagination: {
    charOffset: string;
    charLength: string;
  };
};

export const LOCAL_FIND_FILES = createSchemaHelper(
  TOOL_NAMES.LOCAL_FIND_FILES
) as {
  scope: {
    path: string;
  };
  filters: {
    name: string;
    iname: string;
    names: string;
    pathPattern: string;
    regex: string;
    regexType: string;
    type: string;
    empty: string;
    executable: string;
    readable: string;
    writable: string;
    excludeDir: string;
  };
  time: {
    modifiedWithin: string;
    modifiedBefore: string;
    accessedWithin: string;
  };
  size: {
    sizeGreater: string;
    sizeLess: string;
  };
  pagination: {
    limit: string;
    filesPerPage: string;
    filePageNumber: string;
    charOffset: string;
    charLength: string;
  };
  sorting: {
    sortBy: string;
  };
  options: {
    maxDepth: string;
    minDepth: string;
    details: string;
    permissions: string;
    showFileLastModified: string;
  };
};

export const LOCAL_VIEW_STRUCTURE = createSchemaHelper(
  TOOL_NAMES.LOCAL_VIEW_STRUCTURE
) as {
  scope: {
    path: string;
  };
  filters: {
    pattern: string;
    directoriesOnly: string;
    filesOnly: string;
    extension: string;
    extensions: string;
    hidden: string;
  };
  options: {
    depth: string;
    recursive: string;
    details: string;
    humanReadable: string;
    summary: string;
    showFileLastModified: string;
  };
  sorting: {
    sortBy: string;
    reverse: string;
  };
  pagination: {
    limit: string;
    entriesPerPage: string;
    entryPageNumber: string;
    charOffset: string;
    charLength: string;
  };
};
