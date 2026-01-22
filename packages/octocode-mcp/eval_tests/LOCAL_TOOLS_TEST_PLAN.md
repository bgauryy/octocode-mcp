# Octocode Local Tools Test Plan

> Comprehensive agent evaluation tests for local tools: `localSearchCode`, `localViewStructure`, `localFindFiles`, `localGetFileContent`
> Tests cover all schema parameters with normal usage, edge cases, and failure scenarios.
>
> **Validation Notes:**
> - Schema validation happens at input parsing (Zod schemas)
> - Some "logical conflicts" produce warnings, not errors (e.g., conflicting case options)
> - Some constraints are checked at runtime, not schema level (e.g., minDepth > maxDepth)
> - Tests marked "Works" indicate valid combinations that function despite seeming conflicting


---

## Table of Contents

1. [Test Repository Target](#test-repository-target)
2. [Local Tools](#local-tools)
   - [1.1 localSearchCode](#11-localsearchcode)
   - [1.2 localViewStructure](#12-localviewstructure)
   - [1.3 localFindFiles](#13-localfindfiles)
   - [1.4 localGetFileContent](#14-localgetfilecontent)
3. [Advanced Scenarios](#advanced-scenarios)
   - [3.1 Search Mode Workflows](#31-search-mode-workflows)
   - [3.2 Pagination & Large Results](#32-pagination--large-results)
   - [3.3 Combined Filters](#33-combined-filters)
4. [Integration Test Flows](#integration-test-flows)
5. [Bulk Query Tests](#bulk-query-tests)


---

## Test Repository Target

> **Note:** All local tools test on the octocode-mcp workspace itself.

| Repository | Path | Purpose |
|------------|------|---------|
| octocode-mcp | `/packages/octocode-mcp/src` | Main MCP server TypeScript codebase |
| octocode-cli | `/packages/octocode-cli/src` | CLI TypeScript codebase |
| octocode-shared | `/packages/octocode-shared/src` | Shared utilities |


---

## Local Tools

### 1.1 localSearchCode

Fast pattern search across files using ripgrep. Produces `lineHint` for LSP tools.

#### Schema Parameters

| Parameter | Type | Required | Constraints | Default |
|-----------|------|----------|-------------|---------|
| `pattern` | string | ✅ Yes | min: 1 char | - |
| `path` | string | ✅ Yes | Directory path | - |
| `mode` | enum | No | `discovery` \| `paginated` \| `detailed` | - |
| `fixedString` | boolean | No | Treat pattern as literal | - |
| `smartCase` | boolean | No | Smart case sensitivity | true |
| `caseInsensitive` | boolean | No | `-i` flag | - |
| `caseSensitive` | boolean | No | `-s` flag | - |
| `wholeWord` | boolean | No | `-w` flag | - |
| `lineRegexp` | boolean | No | Match entire line | - |
| `multiline` | boolean | No | Memory intensive `-U` | - |
| `multilineDotall` | boolean | No | Dot matches newlines | - |
| `perlRegex` | boolean | No | PCRE2 mode `-P` | - |
| `type` | string | No | File type (ts, js, py, etc.) | - |
| `include` | string[] | No | Glob patterns to include | - |
| `exclude` | string[] | No | Glob patterns to exclude | - |
| `excludeDir` | string[] | No | Directory names to exclude | - |
| `hidden` | boolean | No | Search hidden files | - |
| `noIgnore` | boolean | No | Don't respect .gitignore | - |
| `followSymlinks` | boolean | No | Follow symbolic links | - |
| `filesOnly` | boolean | No | Return file paths only | - |
| `filesWithoutMatch` | boolean | No | Files that don't match | - |
| `count` | boolean | No | Return match counts | - |
| `countMatches` | boolean | No | Count all matches | - |
| `lineNumbers` | boolean | No | Include line numbers | true |
| `column` | boolean | No | Include column numbers | - |
| `contextLines` | number | No | 0-50 | - |
| `beforeContext` | number | No | 0-50, `-B` lines | - |
| `afterContext` | number | No | 0-50, `-A` lines | - |
| `maxMatchesPerFile` | number | No | 1-100 | - |
| `maxFiles` | number | No | 1-1000 | - |
| `filesPerPage` | number | No | 1-20 | 10 |
| `filePageNumber` | number | No | min: 1 | 1 |
| `matchesPerPage` | number | No | 1-100 | 10 |
| `matchContentLength` | number | No | 1-800 | 200 |
| `sort` | enum | No | `path` \| `modified` \| `accessed` \| `created` | path |
| `sortReverse` | boolean | No | Reverse sort order | - |
| `invertMatch` | boolean | No | `-v` invert match | - |
| `encoding` | string | No | File encoding | - |
| `binaryFiles` | enum | No | `text` \| `without-match` \| `binary` | without-match |
| `includeStats` | boolean | No | Include search statistics | true |
| `includeDistribution` | boolean | No | Include file distribution | true |
| `showFileLastModified` | boolean | No | Show file modification time | false |
| `threads` | number | No | 1-32 | - |
| `mmap` | boolean | No | Use memory-mapped I/O | - |
| `noUnicode` | boolean | No | Disable unicode | - |
| `noMessages` | boolean | No | Suppress error messages | - |
| `passthru` | boolean | No | Print all lines | - |
| `vimgrepFormat` | boolean | No | Vim-compatible output | - |
| `jsonOutput` | boolean | No | JSON output format | - |
| `debug` | boolean | No | Debug mode | - |

#### Normal Usage Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LSC-N01 | Simple pattern search | `pattern="export", path="/packages/octocode-mcp/src"` | Returns files with "export" keyword |
| LSC-N02 | Discovery mode | `pattern="function", path="/packages/octocode-mcp/src", mode="discovery"` | Returns file list only (fast) |
| LSC-N03 | Paginated mode | `pattern="const", path="/packages/octocode-mcp/src", mode="paginated"` | Returns paginated matches with stats |
| LSC-N04 | Detailed mode | `pattern="async", path="/packages/octocode-mcp/src", mode="detailed"` | Returns matches with full context |
| LSC-N05 | Type filter (TypeScript) | `pattern="interface", path="/packages/octocode-mcp/src", type="ts"` | Returns only .ts files |
| LSC-N06 | Files only | `pattern="TODO", path="/packages/octocode-mcp", filesOnly=true` | Returns file paths without match content |
| LSC-N07 | With context lines | `pattern="class", path="/packages/octocode-mcp/src", contextLines=5` | Returns matches with 5 lines context |
| LSC-N08 | Case insensitive | `pattern="error", path="/packages/octocode-mcp/src", caseInsensitive=true` | Matches ERROR, Error, error |
| LSC-N09 | Whole word | `pattern="test", path="/packages/octocode-mcp/src", wholeWord=true` | Matches "test" not "testing" |
| LSC-N10 | Exclude directory | `pattern="import", path="/packages/octocode-mcp", excludeDir=["node_modules", "dist"]` | Excludes specified directories |
| LSC-N11 | Include glob pattern | `pattern="export", path="/packages/octocode-mcp/src", include=["*.ts"]` | Searches only .ts files |
| LSC-N12 | Exclude glob pattern | `pattern="function", path="/packages/octocode-mcp/src", exclude=["*.test.ts", "*.spec.ts"]` | Excludes test files |
| LSC-N13 | Before/after context | `pattern="async function", path="/packages/octocode-mcp/src", beforeContext=3, afterContext=5` | Returns 3 lines before, 5 after |
| LSC-N14 | Sort by modified | `pattern="export", path="/packages/octocode-mcp/src", sort="modified"` | Returns sorted by modification time |
| LSC-N15 | With line numbers | `pattern="const", path="/packages/octocode-mcp/src", lineNumbers=true` | Returns matches with line numbers |

#### Edge Case Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LSC-E01 | Regex pattern | `pattern="export\\s+default", path="/packages/octocode-mcp/src"` | Matches "export default" with spaces |
| LSC-E02 | Fixed string (literal) | `pattern=".*", path="/packages/octocode-mcp/src", fixedString=true` | Matches literal ".*" not regex |
| LSC-E03 | Multiline pattern | `pattern="class.*\\{", path="/packages/octocode-mcp/src", multiline=true` | Matches class declarations spanning lines |
| LSC-E04 | Multiline dotall | `pattern="export.*function", path="/packages/octocode-mcp/src", multiline=true, multilineDotall=true` | Dot matches newlines |
| LSC-E05 | PCRE2 regex | `pattern="(?<=export\\s)\\w+", path="/packages/octocode-mcp/src", perlRegex=true` | Uses lookbehind assertion |
| LSC-E06 | Max context (50) | `pattern="function", path="/packages/octocode-mcp/src", contextLines=50` | Returns 50 lines context |
| LSC-E07 | Max matches per file | `pattern="const", path="/packages/octocode-mcp/src", maxMatchesPerFile=5` | Limits to 5 matches per file |
| LSC-E08 | Max files limit | `pattern="import", path="/packages/octocode-mcp", maxFiles=10` | Limits to 10 files total |
| LSC-E09 | Pagination page 2 | `pattern="export", path="/packages/octocode-mcp/src", filesPerPage=5, filePageNumber=2` | Returns second page of files |
| LSC-E10 | Count only | `pattern="function", path="/packages/octocode-mcp/src", count=true` | Returns match counts per file |
| LSC-E11 | Count all matches | `pattern="const", path="/packages/octocode-mcp/src", countMatches=true` | Returns total match count |
| LSC-E12 | Hidden files | `pattern="config", path="/packages/octocode-mcp", hidden=true` | Includes .hidden files |
| LSC-E13 | No gitignore | `pattern="test", path="/packages/octocode-mcp", noIgnore=true` | Ignores .gitignore rules |
| LSC-E14 | Follow symlinks | `pattern="export", path="/packages/octocode-mcp", followSymlinks=true` | Follows symbolic links |
| LSC-E15 | Sort reverse | `pattern="export", path="/packages/octocode-mcp/src", sort="modified", sortReverse=true` | Oldest files first |
| LSC-E16 | Invert match | `pattern="TODO", path="/packages/octocode-mcp/src", invertMatch=true, filesOnly=true` | Files without TODO |
| LSC-E17 | Line regexp | `pattern="^export", path="/packages/octocode-mcp/src", lineRegexp=false` | Matches lines starting with export |
| LSC-E18 | Files without match | `pattern="deprecated", path="/packages/octocode-mcp/src", filesWithoutMatch=true` | Files not containing "deprecated" |
| LSC-E19 | Column numbers | `pattern="function", path="/packages/octocode-mcp/src", column=true` | Includes column position |
| LSC-E20 | Match content length | `pattern="export", path="/packages/octocode-mcp/src", matchContentLength=500` | Returns up to 500 chars per match |
| LSC-E21 | Show file modified time | `pattern="class", path="/packages/octocode-mcp/src", showFileLastModified=true` | Includes last modified timestamp |
| LSC-E22 | Smart case (default) | `pattern="Error", path="/packages/octocode-mcp/src", smartCase=true` | Case-sensitive when caps present |
| LSC-E23 | Binary files handling | `pattern="test", path="/packages/octocode-mcp", binaryFiles="binary"` | Searches binary files |
| LSC-E24 | Include/exclude stats | `pattern="function", path="/packages/octocode-mcp/src", includeStats=true, includeDistribution=true` | Includes full statistics |
| LSC-E25 | Multiple includes | `pattern="export", path="/packages/octocode-mcp/src", include=["*.ts", "*.tsx"]` | Searches multiple patterns |
| LSC-E26 | JSON output format | `pattern="export", path="/packages/octocode-mcp/src", jsonOutput=true` | Returns JSON formatted results |
| LSC-E27 | Vim grep format | `pattern="function", path="/packages/octocode-mcp/src", vimgrepFormat=true` | Returns vim-compatible output |
| LSC-E28 | Memory-mapped I/O | `pattern="class", path="/packages/octocode-mcp/src", mmap=true` | Uses mmap for file reading |
| LSC-E29 | No unicode mode | `pattern="test", path="/packages/octocode-mcp/src", noUnicode=true` | Disables unicode support |
| LSC-E30 | Passthru mode | `pattern="export", path="/packages/octocode-mcp/src/index.ts", passthru=true` | Prints all lines from matches |
| LSC-E31 | Debug mode | `pattern="const", path="/packages/octocode-mcp/src", debug=true` | Returns debug information |
| LSC-E32 | Custom encoding | `pattern="test", path="/packages/octocode-mcp/src", encoding="utf-8"` | Uses specified encoding |
| LSC-E33 | No messages | `pattern="test", path="/packages/octocode-mcp/src", noMessages=true` | Suppresses error messages |

#### Failure Tests

| Test ID | Description | Query | Expected Error |
|---------|-------------|-------|----------------|
| LSC-F01 | Missing pattern | `path="/packages/octocode-mcp/src"` | Validation error: pattern required |
| LSC-F02 | Missing path | `pattern="test"` | Validation error: path required |
| LSC-F03 | Empty pattern | `pattern="", path="/packages/octocode-mcp/src"` | Validation error: min 1 char |
| LSC-F04 | Invalid mode | `pattern="test", path="/packages/octocode-mcp/src", mode="invalid"` | Validation error: enum mismatch |
| LSC-F05 | Invalid context (negative) | `pattern="test", path="/packages/octocode-mcp/src", contextLines=-1` | Validation error: min 0 |
| LSC-F06 | Context too large (51) | `pattern="test", path="/packages/octocode-mcp/src", contextLines=51` | Validation error: max 50 |
| LSC-F07 | Invalid beforeContext (51) | `pattern="test", path="/packages/octocode-mcp/src", beforeContext=51` | Validation error: max 50 |
| LSC-F08 | Invalid afterContext (51) | `pattern="test", path="/packages/octocode-mcp/src", afterContext=51` | Validation error: max 50 |
| LSC-F09 | Invalid filesPerPage (21) | `pattern="test", path="/packages/octocode-mcp/src", filesPerPage=21` | Validation error: max 20 |
| LSC-F10 | Invalid filesPerPage (0) | `pattern="test", path="/packages/octocode-mcp/src", filesPerPage=0` | Validation error: min 1 |
| LSC-F11 | Invalid matchesPerPage (101) | `pattern="test", path="/packages/octocode-mcp/src", matchesPerPage=101` | Validation error: max 100 |
| LSC-F12 | Invalid maxMatchesPerFile (101) | `pattern="test", path="/packages/octocode-mcp/src", maxMatchesPerFile=101` | Validation error: max 100 |
| LSC-F13 | Invalid maxFiles (1001) | `pattern="test", path="/packages/octocode-mcp/src", maxFiles=1001` | Validation error: max 1000 |
| LSC-F14 | Invalid matchContentLength (801) | `pattern="test", path="/packages/octocode-mcp/src", matchContentLength=801` | Validation error: max 800 |
| LSC-F15 | Invalid matchContentLength (0) | `pattern="test", path="/packages/octocode-mcp/src", matchContentLength=0` | Validation error: min 1 |
| LSC-F16 | Invalid sort value | `pattern="test", path="/packages/octocode-mcp/src", sort="invalid"` | Validation error: enum mismatch |
| LSC-F17 | Invalid binaryFiles value | `pattern="test", path="/packages/octocode-mcp/src", binaryFiles="invalid"` | Validation error: enum mismatch |
| LSC-F18 | Invalid threads (33) | `pattern="test", path="/packages/octocode-mcp/src", threads=33` | Validation error: max 32 |
| LSC-F19 | Invalid threads (0) | `pattern="test", path="/packages/octocode-mcp/src", threads=0` | Validation error: min 1 |
| LSC-F20 | Non-existent path | `pattern="test", path="/nonexistent/path"` | Path not found error |
| LSC-F21 | Invalid regex | `pattern="[invalid", path="/packages/octocode-mcp/src"` | Regex parse error |
| LSC-F22 | Invalid filePageNumber (0) | `pattern="test", path="/packages/octocode-mcp/src", filePageNumber=0` | Validation error: min 1 |
| LSC-F23 | Conflicting case options | `pattern="test", path="/packages/octocode-mcp/src", caseInsensitive=true, caseSensitive=true` | Warning: multiple case modes (caseSensitive takes priority) |


---

### 1.2 localViewStructure

Lists directory contents with metadata (size, type, time). Supports depth control and sorting.

#### Schema Parameters

| Parameter | Type | Required | Constraints | Default |
|-----------|------|----------|-------------|---------|
| `path` | string | ✅ Yes | Directory path | - |
| `depth` | number | No | 1-5 | - |
| `recursive` | boolean | No | Enable recursive listing | - |
| `sortBy` | enum | No | `name` \| `size` \| `time` \| `extension` | time |
| `reverse` | boolean | No | Reverse sort order | - |
| `filesOnly` | boolean | No | Show files only | - |
| `directoriesOnly` | boolean | No | Show directories only | - |
| `hidden` | boolean | No | Show hidden files | false |
| `pattern` | string | No | Name filter pattern | - |
| `extension` | string | No | Single extension filter | - |
| `extensions` | string[] | No | Multiple extensions filter | - |
| `details` | boolean | No | Show detailed info | false |
| `humanReadable` | boolean | No | Format sizes | true |
| `summary` | boolean | No | Include summary | true |
| `limit` | number | No | 1-10000 | - |
| `entriesPerPage` | number | No | 1-20 | 20 |
| `entryPageNumber` | number | No | min: 1 | 1 |
| `showFileLastModified` | boolean | No | Show modification time | false |
| `charOffset` | number | No | min: 0 | - |
| `charLength` | number | No | 1-10000 | - |

#### Normal Usage Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LVS-N01 | Root listing | `path="/packages/octocode-mcp"` | Returns directory contents |
| LVS-N02 | With depth 2 | `path="/packages/octocode-mcp", depth=2` | Returns 2-level structure |
| LVS-N03 | Sort by name | `path="/packages/octocode-mcp/src", sortBy="name"` | Alphabetically sorted |
| LVS-N04 | Sort by size | `path="/packages/octocode-mcp/src", sortBy="size"` | Sorted by file size |
| LVS-N05 | Sort by time | `path="/packages/octocode-mcp/src", sortBy="time"` | Sorted by modification time |
| LVS-N06 | Sort by extension | `path="/packages/octocode-mcp/src", sortBy="extension"` | Grouped by extension |
| LVS-N07 | Files only | `path="/packages/octocode-mcp/src", filesOnly=true` | Returns only files |
| LVS-N08 | Directories only | `path="/packages/octocode-mcp", directoriesOnly=true` | Returns only directories |
| LVS-N09 | Filter by extension | `path="/packages/octocode-mcp/src", extension="ts"` | Returns only .ts files |
| LVS-N10 | Filter by pattern | `path="/packages/octocode-mcp/src", pattern="index"` | Returns items matching "index" |
| LVS-N11 | Pagination | `path="/packages/octocode-mcp/src", entriesPerPage=10, entryPageNumber=1` | Returns first 10 entries |
| LVS-N12 | With summary | `path="/packages/octocode-mcp/src", summary=true` | Includes directory summary |
| LVS-N13 | With details | `path="/packages/octocode-mcp/src", details=true` | Shows detailed file info |
| LVS-N14 | Human readable sizes | `path="/packages/octocode-mcp/src", humanReadable=true` | Formats sizes as KB/MB |
| LVS-N15 | Show last modified | `path="/packages/octocode-mcp/src", showFileLastModified=true` | Includes modification timestamps |
| LVS-N16 | Recursive listing | `path="/packages/octocode-mcp", recursive=true` | Returns all nested contents recursively |

#### Edge Case Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LVS-E01 | Min depth (1) | `path="/packages/octocode-mcp", depth=1` | Returns flat listing |
| LVS-E02 | Max depth (5) | `path="/packages/octocode-mcp", depth=5` | Returns 5 levels deep |
| LVS-E03 | Hidden files | `path="/packages/octocode-mcp", hidden=true` | Shows .hidden files and dirs |
| LVS-E04 | Multiple extensions | `path="/packages/octocode-mcp/src", extensions=["ts", "tsx", "js"]` | Filters multiple extensions |
| LVS-E05 | Empty directory | `path="/packages/octocode-mcp/src/__tests__"` | Returns directory contents or empty |
| LVS-E06 | Reverse sort | `path="/packages/octocode-mcp/src", sortBy="time", reverse=true` | Oldest first |
| LVS-E07 | Min pagination (1) | `path="/packages/octocode-mcp/src", entriesPerPage=1` | Returns single entry |
| LVS-E08 | Max pagination (20) | `path="/packages/octocode-mcp/src", entriesPerPage=20` | Returns up to 20 entries |
| LVS-E09 | Page 2 | `path="/packages/octocode-mcp/src", entriesPerPage=5, entryPageNumber=2` | Returns second page |
| LVS-E10 | No summary | `path="/packages/octocode-mcp/src", summary=false` | Excludes summary |
| LVS-E11 | Nested path | `path="/packages/octocode-mcp/src/tools"` | Returns nested content |
| LVS-E12 | Limit entries | `path="/packages/octocode-mcp/src", limit=5` | Returns max 5 entries |
| LVS-E13 | Character offset | `path="/packages/octocode-mcp/src", charOffset=100, charLength=500` | Paginated output |
| LVS-E14 | Human readable false | `path="/packages/octocode-mcp/src", humanReadable=false` | Shows raw byte sizes |
| LVS-E15 | Pattern with wildcard | `path="/packages/octocode-mcp/src", pattern="*.ts"` | Filters by glob pattern |
| LVS-E16 | Recursive with depth | `path="/packages/octocode-mcp", recursive=true, depth=3` | Recursive limited to 3 levels |

#### Failure Tests

| Test ID | Description | Query | Expected Error |
|---------|-------------|-------|----------------|
| LVS-F01 | Missing path | `sortBy="name"` | Validation error: path required |
| LVS-F02 | Invalid depth (0) | `path="/packages/octocode-mcp", depth=0` | Validation error: min 1 |
| LVS-F03 | Invalid depth (6) | `path="/packages/octocode-mcp", depth=6` | Validation error: max 5 |
| LVS-F04 | Invalid sortBy | `path="/packages/octocode-mcp", sortBy="invalid"` | Validation error: enum mismatch |
| LVS-F05 | Invalid entriesPerPage (0) | `path="/packages/octocode-mcp", entriesPerPage=0` | Validation error: min 1 |
| LVS-F06 | Invalid entriesPerPage (21) | `path="/packages/octocode-mcp", entriesPerPage=21` | Validation error: max 20 |
| LVS-F07 | Invalid entryPageNumber (0) | `path="/packages/octocode-mcp", entryPageNumber=0` | Validation error: min 1 |
| LVS-F08 | Non-existent path | `path="/nonexistent/path"` | Path not found error |
| LVS-F09 | File as path | `path="/packages/octocode-mcp/package.json"` | Not a directory error |
| LVS-F10 | Conflicting filters | `path="/packages/octocode-mcp", filesOnly=true, directoriesOnly=true` | Returns empty results (no runtime validation) |
| LVS-F11 | Invalid limit (0) | `path="/packages/octocode-mcp", limit=0` | Validation error: min 1 |
| LVS-F12 | Invalid limit (10001) | `path="/packages/octocode-mcp", limit=10001` | Validation error: max 10000 |
| LVS-F13 | Invalid charLength (0) | `path="/packages/octocode-mcp", charLength=0` | Validation error: min 1 |
| LVS-F14 | Invalid charLength (10001) | `path="/packages/octocode-mcp", charLength=10001` | Validation error: max 10000 |
| LVS-F15 | Invalid charOffset (negative) | `path="/packages/octocode-mcp", charOffset=-1` | Validation error: min 0 |


---

### 1.3 localFindFiles

Finds files/directories recursively by name, type, size, or modification time.

#### Schema Parameters

| Parameter | Type | Required | Constraints | Default |
|-----------|------|----------|-------------|---------|
| `path` | string | ✅ Yes | Starting directory | - |
| `name` | string | No | Glob pattern (case-sensitive) | - |
| `iname` | string | No | Case-insensitive glob | - |
| `names` | string[] | No | Multiple patterns | - |
| `pathPattern` | string | No | Path pattern filter | - |
| `regex` | string | No | Regex pattern | - |
| `regexType` | enum | No | `posix-egrep` \| `posix-extended` \| `posix-basic` | - |
| `type` | enum | No | `f` \| `d` \| `l` \| `b` \| `c` \| `p` \| `s` | - |
| `maxDepth` | number | No | 1-10 | - |
| `minDepth` | number | No | 0-10 | - |
| `modifiedWithin` | string | No | e.g., "7d", "2h", "30m" | - |
| `modifiedBefore` | string | No | Date or duration | - |
| `accessedWithin` | string | No | Access time filter | - |
| `sizeGreater` | string | No | e.g., "1M", "100K", "50" | - |
| `sizeLess` | string | No | Size upper bound | - |
| `empty` | boolean | No | Find empty files/dirs | - |
| `executable` | boolean | No | Find executable files | - |
| `readable` | boolean | No | Find readable files | - |
| `writable` | boolean | No | Find writable files | - |
| `permissions` | string | No | Permission filter | - |
| `excludeDir` | string[] | No | Directories to exclude | - |
| `details` | boolean | No | Include file details | true |
| `limit` | number | No | 1-10000 | - |
| `filesPerPage` | number | No | 1-20 | 20 |
| `filePageNumber` | number | No | min: 1 | 1 |
| `showFileLastModified` | boolean | No | Show modification time | true |
| `charOffset` | number | No | min: 0 | - |
| `charLength` | number | No | 1-10000 | - |

#### Normal Usage Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LFF-N01 | Find by name glob | `path="/packages/octocode-mcp", name="*.ts"` | Returns all .ts files |
| LFF-N02 | Find by iname (case-insensitive) | `path="/packages/octocode-mcp", iname="*.Test.ts"` | Case-insensitive match |
| LFF-N03 | Find directories | `path="/packages/octocode-mcp", type="d"` | Returns directories only |
| LFF-N04 | Find files | `path="/packages/octocode-mcp", type="f"` | Returns files only |
| LFF-N05 | Max depth | `path="/packages/octocode-mcp", maxDepth=2` | Searches 2 levels deep |
| LFF-N06 | Modified recently | `path="/packages/octocode-mcp", modifiedWithin="7d"` | Files modified in 7 days |
| LFF-N07 | Size filter (greater) | `path="/packages/octocode-mcp", sizeGreater="1K"` | Files larger than 1KB |
| LFF-N08 | Size filter (less) | `path="/packages/octocode-mcp", sizeLess="100K"` | Files smaller than 100KB |
| LFF-N09 | Multiple names | `path="/packages/octocode-mcp", names=["*.ts", "*.tsx"]` | Matches multiple patterns |
| LFF-N10 | Regex search | `path="/packages/octocode-mcp", regex="test.*\\.ts$"` | Regex pattern match |
| LFF-N11 | Exclude directories | `path="/packages/octocode-mcp", excludeDir=["node_modules", "dist"]` | Excludes specified dirs |
| LFF-N12 | With details | `path="/packages/octocode-mcp", details=true` | Includes file metadata |
| LFF-N13 | Path pattern | `path="/packages/octocode-mcp", pathPattern="**/tools/**"` | Filters by path pattern |
| LFF-N14 | Pagination | `path="/packages/octocode-mcp", filesPerPage=10, filePageNumber=1` | Returns paginated results |
| LFF-N15 | Show last modified | `path="/packages/octocode-mcp", showFileLastModified=true` | Includes modification time |

#### Edge Case Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LFF-E01 | Empty files | `path="/packages/octocode-mcp", empty=true, type="f"` | Returns empty files |
| LFF-E02 | Executable files | `path="/packages/octocode-mcp", executable=true` | Returns executable files |
| LFF-E03 | Min depth | `path="/packages/octocode-mcp", minDepth=2` | Skips top levels |
| LFF-E04 | Max depth 10 | `path="/packages/octocode-mcp", maxDepth=10` | Searches deep |
| LFF-E05 | Min depth 0 | `path="/packages/octocode-mcp", minDepth=0` | Includes root level |
| LFF-E06 | Modified before | `path="/packages/octocode-mcp", modifiedBefore="2024-01-01"` | Files before date |
| LFF-E07 | Size range | `path="/packages/octocode-mcp", sizeGreater="100", sizeLess="10K"` | Size between 100B-10KB |
| LFF-E08 | Symlinks | `path="/packages/octocode-mcp", type="l"` | Returns symbolic links |
| LFF-E09 | POSIX egrep regex | `path="/packages/octocode-mcp", regex="(test|spec)\\.ts$", regexType="posix-egrep"` | Uses egrep regex |
| LFF-E10 | POSIX extended regex | `path="/packages/octocode-mcp", regex="test.+\\.ts$", regexType="posix-extended"` | Uses extended regex |
| LFF-E11 | POSIX basic regex | `path="/packages/octocode-mcp", regex="test.*\\.ts$", regexType="posix-basic"` | Uses basic regex |
| LFF-E12 | Pagination page 2 | `path="/packages/octocode-mcp", filesPerPage=5, filePageNumber=2` | Returns page 2 |
| LFF-E13 | Readable files | `path="/packages/octocode-mcp", readable=true` | Returns readable files |
| LFF-E14 | Writable files | `path="/packages/octocode-mcp", writable=true` | Returns writable files |
| LFF-E15 | Modified within hours | `path="/packages/octocode-mcp", modifiedWithin="24h"` | Files modified in 24 hours |
| LFF-E16 | Modified within minutes | `path="/packages/octocode-mcp", modifiedWithin="60m"` | Files modified in 60 minutes |
| LFF-E17 | Accessed within | `path="/packages/octocode-mcp", accessedWithin="7d"` | Files accessed in 7 days |
| LFF-E18 | Limit results | `path="/packages/octocode-mcp", limit=5` | Returns max 5 files |
| LFF-E19 | Character offset | `path="/packages/octocode-mcp", charOffset=100, charLength=500` | Paginated output |
| LFF-E20 | Details false | `path="/packages/octocode-mcp", details=false` | Basic file list only |
| LFF-E21 | Permissions filter | `path="/packages/octocode-mcp", permissions="644"` | Returns files with specific permissions |

#### Failure Tests

| Test ID | Description | Query | Expected Error |
|---------|-------------|-------|----------------|
| LFF-F01 | Missing path | `name="*.ts"` | Validation error: path required |
| LFF-F02 | Invalid type | `path="/packages/octocode-mcp", type="invalid"` | Validation error: enum mismatch |
| LFF-F03 | Invalid maxDepth (0) | `path="/packages/octocode-mcp", maxDepth=0` | Validation error: min 1 |
| LFF-F04 | Invalid maxDepth (11) | `path="/packages/octocode-mcp", maxDepth=11` | Validation error: max 10 |
| LFF-F05 | Invalid minDepth (11) | `path="/packages/octocode-mcp", minDepth=11` | Validation error: max 10 |
| LFF-F06 | Invalid minDepth (negative) | `path="/packages/octocode-mcp", minDepth=-1` | Validation error: min 0 |
| LFF-F07 | Invalid regexType | `path="/packages/octocode-mcp", regex="test", regexType="invalid"` | Validation error: enum mismatch |
| LFF-F08 | Non-existent path | `path="/nonexistent"` | Path not found error |
| LFF-F09 | Invalid time format | `path="/packages/octocode-mcp", modifiedWithin="invalid"` | Time parse error |
| LFF-F10 | Invalid size format | `path="/packages/octocode-mcp", sizeGreater="invalid"` | Size parse error |
| LFF-F11 | Invalid regex | `path="/packages/octocode-mcp", regex="[invalid"` | Regex parse error |
| LFF-F12 | minDepth > maxDepth | `path="/packages/octocode-mcp", minDepth=5, maxDepth=2` | Runtime error or empty results (no schema validation) |
| LFF-F13 | Invalid filesPerPage (0) | `path="/packages/octocode-mcp", filesPerPage=0` | Validation error: min 1 |
| LFF-F14 | Invalid filesPerPage (21) | `path="/packages/octocode-mcp", filesPerPage=21` | Validation error: max 20 |
| LFF-F15 | Invalid filePageNumber (0) | `path="/packages/octocode-mcp", filePageNumber=0` | Validation error: min 1 |
| LFF-F16 | Invalid limit (0) | `path="/packages/octocode-mcp", limit=0` | Validation error: min 1 |
| LFF-F17 | Invalid limit (10001) | `path="/packages/octocode-mcp", limit=10001` | Validation error: max 10000 |
| LFF-F18 | Invalid charLength (0) | `path="/packages/octocode-mcp", charLength=0` | Validation error: min 1 |
| LFF-F19 | Invalid charLength (10001) | `path="/packages/octocode-mcp", charLength=10001` | Validation error: max 10000 |
| LFF-F20 | Invalid charOffset (negative) | `path="/packages/octocode-mcp", charOffset=-1` | Validation error: min 0 |


---

### 1.4 localGetFileContent

Reads file content with line ranges or match-based extraction.

#### Schema Parameters

| Parameter | Type | Required | Constraints | Default |
|-----------|------|----------|-------------|---------|
| `path` | string | ✅ Yes | min: 1 char | - |
| `fullContent` | boolean | No | Read entire file | false |
| `startLine` | number | No | min: 1 | - |
| `endLine` | number | No | min: 1 | - |
| `matchString` | string | No | Search string | - |
| `matchStringContextLines` | number | No | 1-50 | 5 |
| `matchStringIsRegex` | boolean | No | Treat as regex | false |
| `matchStringCaseSensitive` | boolean | No | Case-sensitive | false |
| `charOffset` | number | No | min: 0 | - |
| `charLength` | number | No | 1-10000 | - |

#### Normal Usage Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LGC-N01 | Full content | `path="/packages/octocode-mcp/package.json", fullContent=true` | Returns entire file |
| LGC-N02 | Line range | `path="/packages/octocode-mcp/src/index.ts", startLine=1, endLine=50` | Returns lines 1-50 |
| LGC-N03 | Match string | `path="/packages/octocode-mcp/src/index.ts", matchString="export"` | Returns matches with context |
| LGC-N04 | Match with context | `path="/packages/octocode-mcp/src/index.ts", matchString="function", matchStringContextLines=10` | Returns 10 lines context |
| LGC-N05 | Regex match | `path="/packages/octocode-mcp/src/index.ts", matchString="export.*function", matchStringIsRegex=true` | Regex matching |
| LGC-N06 | Case sensitive match | `path="/packages/octocode-mcp/src/index.ts", matchString="Export", matchStringCaseSensitive=true` | Exact case match |
| LGC-N07 | Case insensitive match | `path="/packages/octocode-mcp/src/index.ts", matchString="EXPORT", matchStringCaseSensitive=false` | Matches any case |
| LGC-N08 | Character range | `path="/packages/octocode-mcp/README.md", charOffset=0, charLength=500` | Returns first 500 chars |
| LGC-N09 | Character offset | `path="/packages/octocode-mcp/README.md", charOffset=100, charLength=200` | Returns chars 100-300 |
| LGC-N10 | Nested file | `path="/packages/octocode-mcp/src/tools/index.ts", fullContent=true` | Returns nested file |
| LGC-N11 | Single line | `path="/packages/octocode-mcp/src/index.ts", startLine=1, endLine=1` | Returns line 1 only |
| LGC-N12 | Large line range | `path="/packages/octocode-mcp/src/index.ts", startLine=1, endLine=200` | Returns lines 1-200 |
| LGC-N13 | Dotfile | `path="/packages/octocode-mcp/.gitignore", fullContent=true` | Returns dotfile content |
| LGC-N14 | JSON file | `path="/packages/octocode-mcp/tsconfig.json", fullContent=true` | Returns JSON content |
| LGC-N15 | Match string default context | `path="/packages/octocode-mcp/src/index.ts", matchString="class"` | Returns with 5 lines context (default) |

#### Edge Case Tests

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| LGC-E01 | Min context (1) | `path="/packages/octocode-mcp/src/index.ts", matchString="test", matchStringContextLines=1` | 1 line context |
| LGC-E02 | Max context (50) | `path="/packages/octocode-mcp/src/index.ts", matchString="test", matchStringContextLines=50` | 50 lines context |
| LGC-E03 | Min charLength (1) | `path="/packages/octocode-mcp/README.md", charOffset=0, charLength=1` | 1 character |
| LGC-E04 | Max charLength (10000) | `path="/packages/octocode-mcp/README.md", charOffset=0, charLength=10000` | 10000 chars |
| LGC-E05 | Complex regex | `path="/packages/octocode-mcp/src/index.ts", matchString="(async\\s+)?function\\s+\\w+", matchStringIsRegex=true` | Complex regex pattern |
| LGC-E06 | Multiple matches | `path="/packages/octocode-mcp/src/index.ts", matchString="const"` | Returns all matches |
| LGC-E07 | Match near file start | `path="/packages/octocode-mcp/src/index.ts", matchString="import", matchStringContextLines=10` | Handles start boundary |
| LGC-E08 | Match near file end | `path="/packages/octocode-mcp/src/index.ts", matchString="export", matchStringContextLines=10` | Handles end boundary |
| LGC-E09 | Unicode content | `path="/packages/octocode-mcp/README.md", matchString="🚀"` | Handles unicode |
| LGC-E10 | Large file offset | `path="/packages/octocode-mcp/yarn.lock", charOffset=10000, charLength=1000` | Returns offset content |
| LGC-E11 | Line at end of file | `path="/packages/octocode-mcp/package.json", startLine=50, endLine=100` | Handles beyond file end |
| LGC-E12 | Empty match result | `path="/packages/octocode-mcp/src/index.ts", matchString="nonexistentstring123xyz"` | Returns empty or no matches |
| LGC-E13 | Regex with groups | `path="/packages/octocode-mcp/src/index.ts", matchString="(export)\\s+(const|function)", matchStringIsRegex=true` | Regex with capture groups |
| LGC-E14 | Match at line 1 | `path="/packages/octocode-mcp/src/index.ts", matchString="import", matchStringContextLines=3` | Handles first line match |
| LGC-E15 | CharOffset at file end | `path="/packages/octocode-mcp/package.json", charOffset=10000, charLength=100` | Handles beyond file |
| LGC-E16 | fullContent with matchString | `path="/packages/octocode-mcp/src/index.ts", fullContent=true, matchString="test"` | Works (matchString ignored when fullContent=true) |
| LGC-E17 | charOffset with matchString | `path="/packages/octocode-mcp/src/index.ts", matchString="test", charOffset=100` | Works (charOffset applies to matchString output) |
| LGC-E18 | charLength without charOffset | `path="/packages/octocode-mcp/README.md", charLength=500` | Works (charOffset defaults to 0) |

#### Failure Tests

| Test ID | Description | Query | Expected Error |
|---------|-------------|-------|----------------|
| LGC-F01 | Missing path | `fullContent=true` | Validation error: path required |
| LGC-F02 | Empty path | `path=""` | Validation error: min 1 char |
| LGC-F03 | Invalid startLine (0) | `path="/packages/octocode-mcp/src/index.ts", startLine=0, endLine=10` | Validation error: min 1 |
| LGC-F04 | Invalid endLine (0) | `path="/packages/octocode-mcp/src/index.ts", startLine=1, endLine=0` | Validation error: min 1 |
| LGC-F05 | startLine > endLine | `path="/packages/octocode-mcp/src/index.ts", startLine=100, endLine=50` | Validation error: startLine must be <= endLine |
| LGC-F06 | startLine without endLine | `path="/packages/octocode-mcp/src/index.ts", startLine=1` | Validation error: endLine required when startLine provided |
| LGC-F07 | endLine without startLine | `path="/packages/octocode-mcp/src/index.ts", endLine=50` | Validation error: startLine required when endLine provided |
| LGC-F08 | fullContent with line range | `path="/packages/octocode-mcp/src/index.ts", fullContent=true, startLine=1, endLine=10` | Validation error: mutually exclusive |
| LGC-F09 | fullContent with matchString and line range | `path="/packages/octocode-mcp/src/index.ts", fullContent=true, matchString="test", startLine=1, endLine=10` | Validation error: multiple extraction methods |
| LGC-F10 | matchString with line range | `path="/packages/octocode-mcp/src/index.ts", matchString="test", startLine=1, endLine=10` | Validation error: mutually exclusive |
| LGC-F11 | Non-existent file | `path="/packages/octocode-mcp/nonexistent.txt", fullContent=true` | File not found error |
| LGC-F12 | Invalid charLength (0) | `path="/packages/octocode-mcp/README.md", charOffset=0, charLength=0` | Validation error: min 1 |
| LGC-F13 | Invalid charLength (10001) | `path="/packages/octocode-mcp/README.md", charOffset=0, charLength=10001` | Validation error: max 10000 |
| LGC-F14 | Invalid charOffset (negative) | `path="/packages/octocode-mcp/README.md", charOffset=-1, charLength=100` | Validation error: min 0 |
| LGC-F15 | Invalid matchStringContextLines (0) | `path="/packages/octocode-mcp/src/index.ts", matchString="test", matchStringContextLines=0` | Validation error: min 1 |
| LGC-F16 | Invalid matchStringContextLines (51) | `path="/packages/octocode-mcp/src/index.ts", matchString="test", matchStringContextLines=51` | Validation error: max 50 |
| LGC-F17 | Directory path | `path="/packages/octocode-mcp/src", fullContent=true` | Not a file error |
| LGC-F18 | Invalid regex | `path="/packages/octocode-mcp/src/index.ts", matchString="[invalid", matchStringIsRegex=true` | Regex parse error |


---

## Advanced Scenarios

### 3.1 Search Mode Workflows

| Test ID | Description | Mode | Query | Expected Result |
|---------|-------------|------|-------|-----------------|
| SM-01 | Discovery for large codebase | discovery | `pattern="export", path="/packages", mode="discovery"` | Fast file list only |
| SM-02 | Paginated for browsing | paginated | `pattern="function", path="/packages/octocode-mcp/src", mode="paginated", filesPerPage=5` | Paginated with stats |
| SM-03 | Detailed for implementation | detailed | `pattern="async function", path="/packages/octocode-mcp/src", mode="detailed", contextLines=10` | Full context for reading |
| SM-04 | Discovery then detailed | - | 1. `mode="discovery"` → 2. `mode="detailed"` on specific file | Two-phase search |
| SM-05 | Count then paginate | - | 1. `count=true` → 2. `mode="paginated"` | Count first, then browse |


### 3.2 Pagination & Large Results

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| PG-01 | First page of many files | `pattern="const", filesPerPage=5, filePageNumber=1` | Returns page 1 with pagination info |
| PG-02 | Middle page | `pattern="const", filesPerPage=5, filePageNumber=3` | Returns page 3 |
| PG-03 | Last page | `pattern="const", filesPerPage=5, filePageNumber=100` | Returns last page or empty |
| PG-04 | Max entries per page | `pattern="export", filesPerPage=20` | Returns up to 20 files |
| PG-05 | Max matches per page | `pattern="const", matchesPerPage=100` | Returns up to 100 matches |
| PG-06 | Large result limit | `pattern="import", maxFiles=1000` | Limits to 1000 files |
| PG-07 | Pagination with sort | `pattern="function", filesPerPage=10, sort="modified"` | Sorted pagination |


### 3.3 Combined Filters

| Test ID | Description | Query | Expected Result |
|---------|-------------|-------|-----------------|
| CF-01 | Type + exclude | `pattern="test", type="ts", excludeDir=["node_modules"]` | TypeScript excluding node_modules |
| CF-02 | Include + exclude patterns | `pattern="export", include=["*.ts"], exclude=["*.test.ts"]` | .ts files except tests |
| CF-03 | Context + pagination | `pattern="class", contextLines=5, filesPerPage=5` | Paginated with context |
| CF-04 | Fixed string + multiline | `pattern="export default", fixedString=true` | Literal multiword search |
| CF-05 | Hidden + type filter | `pattern="config", hidden=true, type="json"` | Hidden JSON configs |
| CF-06 | Sort + reverse + limit | `pattern="TODO", sort="modified", sortReverse=true, maxFiles=10` | Oldest TODOs first |
| CF-07 | Multiple excludeDir | `pattern="import", excludeDir=["node_modules", "dist", ".git", "__tests__"]` | Multiple exclusions |
| CF-08 | Size + time filters | `sizeGreater="1K", sizeLess="100K", modifiedWithin="30d"` | Size range + recent |
| CF-09 | Name + type + depth | `name="*.ts", type="f", maxDepth=3` | TypeScript files max 3 deep |
| CF-10 | Regex + extension | `regex="test.*spec", path="/packages", type="f"` | Regex with file type |


---

## Integration Test Flows

### Flow 1: Search → Read Content

```
1. localSearchCode(pattern="handleRequest", path="/packages/octocode-mcp/src", filesOnly=true) → Get file list
2. localSearchCode(pattern="handleRequest", path="<specific-file>", contextLines=3) → Get lineHint
3. localGetFileContent(path="<file>", startLine=N-10, endLine=N+10) → Read implementation
```

### Flow 2: Structure Exploration → Find Files → Search

```
1. localViewStructure(path="/packages/octocode-mcp", depth=2) → See structure
2. localFindFiles(path="/packages/octocode-mcp/src", name="*.ts", modifiedWithin="7d") → Recent files
3. localSearchCode(pattern="export", path="<found-file>") → Search in recent
```

### Flow 3: Discovery → Detailed Investigation

```
1. localSearchCode(pattern="TODO", path="/packages", mode="discovery") → Get file list
2. localSearchCode(pattern="TODO", path="/packages", mode="detailed", contextLines=5) → Get all TODOs with context
3. localGetFileContent(path="<file-with-most-todos>", matchString="TODO") → Read specific file
```

### Flow 4: File Metadata → Content

```
1. localFindFiles(path="/packages/octocode-mcp", sizeGreater="10K", type="f") → Find large files
2. localViewStructure(path="/packages/octocode-mcp/src", sortBy="size", reverse=true) → Sort by size
3. localGetFileContent(path="<largest-file>", startLine=1, endLine=50) → Read large file start
```


---

## Bulk Query Tests

All local tools support 1-5 queries per call.

| Test ID | Tool | Description | Query | Expected Result |
|---------|------|-------------|-------|-----------------|
| BQ-L01 | localSearchCode | 5 parallel searches | `queries=[{pattern:"export"}, {pattern:"import"}, {pattern:"const"}, {pattern:"function"}, {pattern:"class"}]` | Returns 5 result sets |
| BQ-L02 | localViewStructure | 3 parallel structure views | `queries=[{path:"/packages/octocode-mcp"}, {path:"/packages/octocode-cli"}, {path:"/packages/octocode-shared"}]` | Returns 3 structures |
| BQ-L03 | localFindFiles | 5 parallel file searches | `queries=[{name:"*.ts"}, {name:"*.json"}, {name:"*.md"}, {type:"d"}, {modifiedWithin:"1d"}]` | Returns 5 file lists |
| BQ-L04 | localGetFileContent | 5 parallel file reads | `queries=[{path:"package.json"}, {path:"README.md"}, {path:"tsconfig.json"}, {path:"src/index.ts"}, {path:".gitignore"}]` | Returns 5 file contents |
| BQ-L05 | Mixed valid/invalid | 5 queries, 2 invalid | `queries=[{valid}, {valid}, {invalid}, {valid}, {invalid}]` | 3 results, 2 errors |
| BQ-L06 | 6 queries (over limit) | 6 localSearchCode queries | 6 queries | Validation error: max 5 |
| BQ-L07 | Empty queries | `queries=[]` | Empty array | Validation error: min 1 |


---

## Test Execution Checklist

- [ ] **localSearchCode**: All 71 tests (15 normal, 33 edge, 23 failure)
- [ ] **localViewStructure**: All 47 tests (16 normal, 16 edge, 15 failure)
- [ ] **localFindFiles**: All 56 tests (15 normal, 21 edge, 20 failure)
- [ ] **localGetFileContent**: All 51 tests (15 normal, 18 edge, 18 failure)
- [ ] **Search Mode Workflows**: All 5 scenarios
- [ ] **Pagination & Large Results**: All 7 scenarios
- [ ] **Combined Filters**: All 10 scenarios
- [ ] **Integration Flows**: All 4 flows
- [ ] **Bulk Queries**: All 7 tests


---

*Test Plan Version: 1.1*
*Last Updated: January 2026*
*Total Test Cases: 254+*
