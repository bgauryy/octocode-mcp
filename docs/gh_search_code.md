# Search code matching "react" and "lifecycle"
$ gh search code react lifecycle

# Search code matching "error handling"
$ gh search code "error handling"

# Search code matching "deque" in Python files
$ gh search code deque --language=python

# Search code matching "cli" in repositories owned by microsoft organization
$ gh search code cli --owner=microsoft

# Search code matching "panic" in the GitHub CLI repository
$ gh search code panic --repo cli/cli

# Search code matching keyword "lint" in package.json files
$ gh search code lint --filename package.json

USAGE
  gh search code <query> [flags]

FLAGS
      --extension string   Filter on file extension
      --filename string    Filter on filename
  -q, --jq expression      Filter JSON output using a jq expression
      --json fields        Output JSON with the specified fields
      --language string    Filter results by language
  -L, --limit int          Maximum number of code results to fetch (default 30)
      --match strings      Restrict search to file contents or file path: {file|path}
      --owner strings      Filter on owner
  -R, --repo strings       Filter on repository
      --size string        Filter on size range, in kilobytes
  -t, --template string    Format JSON output using a Go template; see "gh help formatting"
  -w, --web                Open the search query in the web browser

INHERITED FLAGS
  --help   Show help for command

JSON FIELDS
  path, repository, sha, textMatches, url

EXAMPLES
  # Search code matching "react" and "lifecycle"
  $ gh search code react lifecycle
  
  # Search code matching "error handling"
  $ gh search code "error handling"
  
  # Search code matching "deque" in Python files
  $ gh search code deque --language=python
  
  # Search code matching "cli" in repositories owned by microsoft organization
  $ gh search code cli --owner=microsoft
  
  # Search code matching "panic" in the GitHub CLI repository
  $ gh search code panic --repo cli/cli
  
  # Search code matching keyword "lint" in package.json files
  $ gh search code lint --filename package.json

LEARN MORE
  Use `gh <command> <subcommand> --help` for more information about a command.
  Read the manual at https://cli.github.com/manual
  Learn about exit codes using `gh help exit-codes`
  Learn about accessibility experiences using `gh help accessibility`



-----


Possibilities for gh search code Query Construction
gh search code is designed to find specific patterns, functions, variables, or phrases within the content of code files across GitHub.

1. Simple Keyword Search (Implicit AND)

Description: Provide one or more keywords. GitHub will search these keywords in the content of code files, and usually also in the file path and filename. Multiple keywords are implicitly ANDed.
Example:
Bash

gh search code react lifecycle
Meaning: Find code files that contain both "react" AND "lifecycle".
2. Exact Phrase Search

Description: Enclose a phrase in double quotes to search for that exact sequence of words in the code content.
Example:
Bash

gh search code "error handling"
Meaning: Find code files containing the exact phrase "error handling".
3. Single Filter/Qualifier

Description: Use a single command-line flag (--flag=value) to apply a specific filter.
Examples:
By Language:
Bash

gh search code deque --language=python
Meaning: Find "deque" in code files specifically written in Python.
By Extension:
Bash

gh search code "hello world" --extension=js
Meaning: Find "hello world" in files with the .js extension.
By Filename:
Bash

gh search code "main" --filename=server.js
Meaning: Find "main" within files named "server.js".
4. Multiple Filters (Implicit AND between Filters)

Description: Combine several command-line flags. All specified conditions must be met.
Example:
Bash

gh search code "cli" --owner=microsoft --language=typescript
Meaning: Find "cli" in TypeScript code files that are also in repositories owned by the "microsoft" organization.
5. Filtering by Repository or Owner

Description: Restrict the code search to specific repositories or owners.
Examples:
By Owner (Organization/User):
Bash

gh search code "authenticate" --owner=google
Meaning: Find "authenticate" in code files within repositories owned by the "google" organization.
By Specific Repository:
Bash

gh search code "config variable" --repo=octocat/Spoon-Knife
Meaning: Find "config variable" only in the octocat/Spoon-Knife repository.
6. Filtering by Repository Visibility

Description: Limit the search to public, private, or internal repositories.
Example:
Bash

gh search code "API_KEY" --visibility=private
Meaning: Find "API_KEY" in code within private repositories you have access to.
7. Exclusion (NOT Operator)

Description: Use the - (minus) prefix before a keyword or a qualifier to exclude results that match that term or condition.
Examples:
Exclude a Keyword:
Bash

gh search code "router" -test
Meaning: Find "router" in code, but exclude files that also contain the word "test".
Exclude by Extension:
Bash

gh search code "import" -- -extension:json
Meaning: Find "import" in code, excluding files with the .json extension. (Note the -- before -extension:json.)
Exclude by Path (using path: qualifier in query):
Bash

gh search code "debug_log" -- "NOT path:*/tests/*"
Meaning: Find "debug_log" in code, but exclude files where the path contains "tests" (indicating test files). (Note the NOT needs to be part of the query string and -- might be needed if it's the first element after the main query).
8. Explicit "OR" Logic (Using OR Keyword)

Description: For "OR" conditions between different keywords or qualifiers (or complex logical groupings), use the uppercase OR keyword within the main query string. Parentheses () can be used for grouping.
Examples:
Keywords with OR:
Bash

gh search code "GET /api OR POST /api"
Meaning: Find code containing "GET /api" OR "POST /api".
Qualifiers with OR (using standard GitHub search syntax in query):
Bash

gh search code "language:JavaScript OR language:TypeScript"
Meaning: Find code that is either JavaScript OR TypeScript.
Complex Grouping:
Bash

gh search code "function authenticate (owner:myorg OR repo:anotherorg/utility-lib)"
Meaning: Find the string "function authenticate" AND (the file is in a repository owned by "myorg" OR in the anotherorg/utility-lib repository).
9. Path Filtering (path: qualifier)

Description: Search for code within specific directory paths or patterns. This is a very powerful way to narrow searches.
Examples:
Specific directory:
Bash

gh search code "database connection" "path:src/utils"
Meaning: Find "database connection" only in files within the src/utils directory (and its subdirectories).
Root level files:
Bash

gh search code "config" "path:/"
Meaning: Find "config" in files located directly at the root of repositories.
Globbing in paths (advanced GitHub search syntax, might need direct gh api for full regex):
Bash

gh search code "logger" "path:*.go" "path:/cmd/**/*.go"
Meaning: (This example uses path: multiple times, which might be ANDed depending on the exact gh CLI parsing. For true OR, you might need (path:*.go OR path:/cmd/**/*.go). The gh CLI flags primarily implement AND, so combining path: with OR often requires putting it in the main query string.)
11. Sorting and Limits

Description: Control the number of results and their order.
Examples:
Limit results:
Bash

gh search code "interface" -L 50
Meaning: Find "interface" in code and return up to 50 results.
Sort (default is "best-match" for code): gh search code manual does not list --sort for code search directly, implying it's always best-match. You'd use --sort if available or rely on the default relevance.
Key Considerations for gh search code:

Indexing Limitations: GitHub's code search has limitations:
Forks are only searchable if they have more stars than the parent AND at least one commit after creation.
Only the default branch is indexed.
Files generally need to be smaller than a certain size (e.g., 384 KB for github.com) and only the first part of the file is indexed.
There's a limit on the number of private/internal repositories searched.
-- for Query Qualifiers: Remember to use -- before qualifiers like -topic:linux or -extension:json if they start with a hyphen and are part of the main query string, to prevent gh CLI from interpreting them as flags.
New Code Search Engine: GitHub recently updated its code search. The gh CLI uses what is described as a "legacy" engine, so results might not always perfectly match the web interface, and some newer features like full regex search might not be directly available via the gh CLI flags. For advanced regex, you might need to use gh api /search/code and pass the regex in the q parameter directly (e.g., content:/^MyMethod$/).
By combining these possibilities, you can construct very precise queries for finding code on GitHub.



-------

Boolean Operators in gh search code Queries
When using gh search code, you can combine keywords and specific qualifiers (--language, --repo, --path, etc.) using boolean logic to refine your search.

Key Principles:

Case Sensitivity: The boolean operators AND, OR, and NOT must be in uppercase.
Implicit AND: When you provide multiple terms or qualifiers separated by spaces, they are implicitly ANDed. This means all conditions must be met.
Parentheses (): Use parentheses to group clauses and control the order of operations, especially when mixing AND and OR.
-- for Query Qualifiers: If a query term starting with a hyphen (e.g., -extension:json) is not a direct gh flag, you might need to use -- before it to indicate it's part of the search query string.
1. AND Operator
The AND operator (or simply a space between terms) means that all specified terms or conditions must be present in the code files.

Examples:

Implicit AND (Keywords in code content):

Bash

gh search code "user authentication" token generation
Meaning: Find code files containing the phrase "user authentication" AND the words "token generation".
Implicit AND (Keywords + Filters):

Bash

gh search code "database connection" --language=python --repo=myorg/myproject
Meaning: Find code files that:
Contain "database connection"
AND are written in python
AND are located within the myorg/myproject repository.
Explicit AND (within the query string, less common as space works):

Bash

gh search code "router AND handler"
Meaning: Find code files containing both "router" AND "handler".
2. OR Operator
The OR operator means that results will be returned if they match any of the specified terms or conditions.

Examples:

Keywords OR Keywords:

Bash

gh search code "login form OR signup form"
Meaning: Find code files containing "login form" OR "signup form".
Qualifiers OR Qualifiers (within query string):

Bash

gh search code "language:Java OR language:Kotlin"
Meaning: Find code files that are either Java OR Kotlin.
Combining with AND using Parentheses:

Bash

gh search code "Logger (language:Go OR language:Rust)"
Meaning: Find code files that contain the term "Logger" AND (are written in Go OR are written in Rust).
Comma-separated values for specific flags (implicit OR for that flag):

Bash

gh search code "config" --extension=js,ts
Meaning: Find code files containing "config" that have either a .js OR a .ts extension.
3. NOT Operator (Exclusion)
The NOT operator (or the - prefix) excludes results that match the specified term or condition.

Examples:

Exclude a Keyword:

Bash

gh search code "class" -abstract
Meaning: Find code files containing the word "class" but NOT the word "abstract".
Exclude by Qualifier (using - prefix):

Bash

gh search code "test_data" -- -path:*/tests/*
Meaning: Find code files containing "test_data" but NOT where the file path includes the segment "tests" (e.g., to exclude test files themselves).
Note: The -- is important here to signify that -path:*/tests/* is a query term, not a gh flag.
Exclude by Qualifier (another example with - prefix):

Bash

gh search code "import" -- -extension:json
Meaning: Find code files containing "import" but NOT with a .json extension.
Explicit NOT (less common, usually - is preferred, especially with grouping):

Bash

gh search code "main NOT path:*/vendor/*"
Meaning: Find code files containing "main" that are NOT located in a "vendor" directory.