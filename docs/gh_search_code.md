# GitHub Code Search Guide

> **Reference:** [Understanding GitHub Code Search Syntax](https://docs.github.com/en/search-github/github-code-search/understanding-github-code-search-syntax)

This guide will walk you through how to effectively use the `gh search code` command from the GitHub CLI. We'll cover its flags, the powerful query syntax, best practices for constructing your searches, and how to integrate it into your scripts.

## Understanding gh search code

The `gh search code` command allows you to search for code within GitHub repositories directly from your terminal. It leverages GitHub's robust code search API, supporting a wide range of sophisticated queries.

The basic syntax is:

```bash
gh search code <query> [flags]
```

Where `<query>` is your search string, and `[flags]` are optional arguments to control the command's behavior or output.

## Core Query Syntax (The Power Behind Your Search)

The most important aspect of `gh search code` is the `<query>` string itself. This is where you specify what you're looking for and apply various filters using qualifiers and boolean operators. The syntax for these is consistent with the GitHub web interface code search.

Here's a breakdown of the powerful query features:

### 1. Exact Matches

To find an exact string, including whitespace, enclose it in double quotes (`"`).

**Example:** `"sparse index"`

**In Qualifiers:** `path:git language:"protocol buffers"`

### 2. Searching for Quotes and Backslashes

**Quotes:** Escape a quotation mark within a quoted string using a backslash (`\"`).

**Example:** `"name = \"tensorflow\""`

**Backslashes:** Use a double backslash (`\\`) to search for a literal backslash.

> **Note:** `\` and `\"` are the only recognized escape sequences outside of regular expressions. Other backslashes are treated literally.

### 3. Boolean Operations

Combine search terms using `AND`, `OR`, and `NOT`. By default, adjacent terms are treated with `AND`.

- **AND (or space):** Results must contain all terms.
  - **Example:** `sparse index` (same as `sparse AND index`)

- **OR:** Results must contain at least one of the terms.
  - **Example:** `sparse OR index`

- **NOT:** Excludes files containing the specified term.
  - **Example:** `"fatal error" NOT path:__testing__`

- **Parentheses:** Use `()` for complex expressions.
  - **Example:** `(language:ruby OR language:python) AND NOT path:"/tests/"`

### 4. Qualifiers

Qualifiers narrow down your search to specific contexts.

#### Repository and Organization Qualifiers

- **`repo:<owner>/<repo_name>`**: Search within a specific repository. Full name (owner/repo) is required.
  - **Example:** `repo:github-linguist/linguist`
  - **Multiple Repos:** `repo:github-linguist/linguist OR repo:tree-sitter/tree-sitter`

- **`org:<organization_name>`**: Search within all repositories of an organization. Full name is required.
  - **Example:** `org:github`

- **`user:<username>`**: Search within all repositories of a personal account. Full name is required.
  - **Example:** `user:octocat`

#### Language Qualifier

- **`language:<language_name>`**: Filter by programming language. Refer to the [Linguist languages.yml](https://github.com/github-linguist/linguist/blob/main/lib/linguist/languages.yml) for a complete list.
  - **Example:** `language:ruby OR language:cpp OR language:csharp`

#### Path Qualifier

- **`path:<path_term>`**: Search for files where the path contains the term.
  - **Example:** `path:unit_tests` (matches `src/unit_tests/my_test.py` and `src/docs/unit_tests.md`)

**Glob Expressions:**

- **`*`**: Matches any character (except `/`).
  - **Example:** `path:*.txt` (for files with `.txt` extension)
  - **Anchored:** `path:/src/*.js` (direct descendants of src)

- **`**`**: Matches across subdirectories.
  - **Example:** `path:/src/**/*.js` (matches deeply nested `.js` files in src)

- **`?`**: Matches a single character.
  - **Example:** `path:*.a?c`

- **Literal Special Characters:** Enclose paths with `*` or `?` in quotes to search for them literally (e.g., `path:"file?"`).

#### Content Qualifier

- **`content:<term>`**: Restrict search to file content only (not file paths). By default, bare terms search both.
  - **Example:** `content:README.md` (finds files containing "README.md", not just files named README.md)

#### Repository Property Qualifier

- **`is:<property>`**: Filter based on repository properties.
  - **Values:** `archived`, `fork`, `vendored`, `generated`
  - **Example:** `path:/^MIT.txt$/ is:archived`
  - **Inverted:** `log4j NOT is:archived`

### 5. Using Regular Expressions

Surround your regular expression with forward slashes (`/`).

**Example:** `/sparse.*index/`

**Escaping Slashes:** Escape forward slashes within the regex (`App\/src\/`).

**Special Characters:** `\n` (newline), `\t` (tab), `\x{hhhh}` (Unicode character).

**Case Sensitivity:** By default, searches are case-insensitive. For case-sensitive search, use `/(?-i)True/`.

**Limitation:** "Look-around" assertions are not supported.

### 6. Separating Search Terms

Always separate search terms, exact strings, regex, qualifiers, parentheses, and boolean keywords with spaces. The only exception is items inside parentheses.

## gh search code Flags

While the query string handles most of the filtering logic, `gh search code` also has a few direct flags to control its output and behavior:

### `--language <string>` or `-l <string>`

**Description:** A convenient shortcut to filter results by a specific programming language. This is equivalent to adding `language:<string>` to your query.

**Example:** 
```bash
gh search code "hello world" --language=python
```

### `--web`

**Description:** Opens the search results in your default web browser instead of displaying them in the terminal.

**Example:** 
```bash
gh search code "main function" --web
```

### `--json <fields>`

**Description:** Outputs the search results in JSON format, allowing you to specify which fields you want to include (e.g., `repo,path,textMatches`). This is incredibly useful for scripting and parsing results.

**Example:** 
```bash
gh search code "TODO" --json repo,path,url
```

### `-q, --jq <expression>`

**Description:** Filters the JSON output using a jq expression. This flag requires `jq` to be installed on your system. It's often used in conjunction with `--json`.

**Example:** 
```bash
gh search code "error" --json repo,path,textMatches | gh search code -q '.[] | select(.repo.name == "my-project")'
```

### `-L, --limit <int>`

**Description:** Sets the maximum number of search results to fetch. The default limit is usually 30.

**Example:** 
```bash
gh search code "interface" --limit 100
```

## Best Practices for gh search code

1. **Start Broad, Then Refine:** Begin with a general term, then progressively add qualifiers and boolean operators to narrow down your results.

2. **Use Exact Matches for Specificity:** When looking for a precise phrase or string, always use double quotes.

3. **Leverage Qualifiers Heavily:** Qualifiers are your most powerful tools for relevant results. Always specify `repo:`, `org:`, `user:`, or `language:` if you know the context.

4. **Understand `path:` vs. `content:`:** Remember that bare terms search both. Use `content:` if you only care about the file's content, and `path:` (often with glob expressions) for file structure.

5. **Regex for Patterns:** When you need to find patterns rather than exact strings, regular expressions are essential. Be mindful of escaping special characters.

6. **Review GitHub Docs:** The official [GitHub code search documentation](https://docs.github.com/search-github/searching-on-github/searching-code) is the definitive source for query syntax updates and nuances.

7. **Pipe to jq for Parsing:** For programmatic use, always combine `--json` with `jq` (`-q` flag or piping to `jq` directly) to extract the data you need efficiently.

8. **Respect Rate Limits:** While `gh` CLI often handles rate limits, be aware that very broad or frequent queries can hit GitHub API limits. Consider adding delays in scripts if you're making many calls.

## How to Use gh search code via Code

You can execute `gh search code` from within scripts using your system's command execution capabilities. Here are examples in Bash and Python, demonstrating how to construct and execute commands, and parse JSON output.

### 1. Bash Scripting

```bash
#!/bin/bash

# Define your query and flags
SEARCH_QUERY="\"License MIT\" language:markdown repo:github-linguist/linguist"
LIMIT_RESULTS=5

echo "Searching for: $SEARCH_QUERY (limit: $LIMIT_RESULTS)"

# Execute the command and capture output
# --json repo,path,textMatches will give you repository info, file path, and the matching text snippets
# The 'jq .' at the end pretty-prints the JSON.
RESULTS=$(gh search code "$SEARCH_QUERY" --limit "$LIMIT_RESULTS" --json repo,path,textMatches)

if [ $? -eq 0 ]; then # Check if the command executed successfully
  echo "--- Search Results (JSON) ---"
  echo "$RESULTS" | jq . # Pretty-print the JSON output

  echo "--- Extracted Paths ---"
  # Example of extracting paths using jq
  echo "$RESULTS" | jq -r '.[].path'
else
  echo "Error executing gh search code. Check your query or GitHub CLI installation."
fi

# Example using --web flag
# gh search code "TODO fixme" --web
```

#### Explanation for Bash:

- **`#!/bin/bash`**: Shebang for bash script.
- **`SEARCH_QUERY="..."`**: Defines your query string. It's best to put complex queries in a variable.
- **`LIMIT_RESULTS=5`**: Defines the limit.
- **`RESULTS=$(...)`**: Captures the standard output of the gh command into the RESULTS variable.
- **`--json repo,path,textMatches`**: Tells gh to return the results as JSON, including specific fields. `textMatches` is crucial for seeing why a file matched.
- **`jq .`**: Pipes the JSON output to jq for pretty-printing. `jq` is a powerful command-line JSON processor.
- **`jq -r '.[].path'`**: Another jq example to extract specific data (raw path strings).
- **`if [ $? -eq 0 ]; then`**: Checks the exit status of the previous command (`gh search code`). 0 means success, non-zero means an error.

### 2. Python Scripting

```python
import subprocess
import json

def gh_search_code(query, limit=30, json_fields=None, web=False):
    """
    Executes gh search code and returns the results.

    Args:
        query (str): The search query string.
        limit (int): Maximum number of results to fetch.
        json_fields (list): List of fields to include in JSON output (e.g., ['repo', 'path', 'textMatches']).
                           If None, default text output is returned.
        web (bool): If True, opens results in the web browser instead of returning data.

    Returns:
        dict or str: Parsed JSON results if json_fields is provided,
                     raw text output if json_fields is None,
                     None if web is True, or if an error occurs.
    """
    cmd = ["gh", "search", "code", query]

    if limit:
        cmd.extend(["--limit", str(limit)])

    if json_fields:
        cmd.extend(["--json", ",".join(json_fields)])

    if web:
        cmd.append("--web")
        print(f"Opening search results in browser for query: '{query}'")
        try:
            subprocess.run(cmd, check=True)
            return None # No direct output when opening web
        except subprocess.CalledProcessError as e:
            print(f"Error opening web results: {e}")
            return None

    try:
        # Execute the command and capture output
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        
        if json_fields:
            return json.loads(result.stdout)
        else:
            return result.stdout.strip()

    except subprocess.CalledProcessError as e:
        print(f"Error executing gh search code: {e}")
        print(f"Stderr: {e.stderr}")
        return None
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON output: {e}")
        print(f"Raw output: {result.stdout}")
        return None

if __name__ == "__main__":
    # Example 1: Basic search with text output
    print("--- Example 1: Basic text search ---")
    text_results = gh_search_code("TODO", limit=5)
    if text_results:
        print(text_results)

    print("\n--- Example 2: JSON search for specific fields ---")
    # Example 2: Search for "License" in Markdown files, get repo and path
    json_results = gh_search_code(
        query='path:README.md "License"', 
        limit=2,
        json_fields=['repo', 'path']
    )
    if json_results:
        for item in json_results:
            print(f"Repo: {item['repo']['name']}, Path: {item['path']}")

    print("\n--- Example 3: More detailed JSON search with text matches ---")
    detailed_json_results = gh_search_code(
        query='language:javascript function AND "async await"',
        limit=3,
        json_fields=['repo', 'path', 'textMatches']
    )
    if detailed_json_results:
        for item in detailed_json_results:
            print(f"Repo: {item['repo']['name']}")
            print(f"  Path: {item['path']}")
            for match in item.get('textMatches', []):
                print(f"    Match: {match.get('fragment')}")
            print("-" * 20)

    # Example 4: Open results in web browser (uncomment to test)
    # gh_search_code(query="authentication token", web=True)
```

#### Explanation for Python:

- **`subprocess.run()`**: This function is used to run external commands.
- **`capture_output=True`**: Captures stdout and stderr.
- **`text=True`**: Decodes stdout/stderr as text.
- **`check=True`**: Raises a `CalledProcessError` if the command returns a non-zero exit code (indicating an error).
- **`json.loads()`**: Parses the JSON string output from gh CLI into a Python dictionary or list.
- **Error Handling**: The `try...except` blocks catch potential errors during command execution or JSON parsing, making the script more robust.
- **`json_fields` parameter**: Allows you to dynamically specify which fields you need, making the function versatile. `repo` and `path` are common, but `textMatches` is extremely useful for seeing the actual code snippets that caused the match.

## Conclusion

By understanding the query syntax and the available flags, you can harness the full power of `gh search code` for both interactive exploration and automated scripting tasks.