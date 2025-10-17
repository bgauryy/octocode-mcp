# grep CLI Command - Complete Usage Guide

## Overview

`grep` (global regular expression print) is a powerful command-line utility for searching text patterns in files and streams. It scans files or standard input for lines matching specified patterns and outputs the matching lines, making it an essential tool for developers, system administrators, and power users.

## Quick Start

The most efficient way to search for text using grep is to understand its basic syntax and gradually build up to more advanced patterns:

```bash
grep 'pattern' filename.txt
```

This searches for `pattern` in `filename.txt` and displays all matching lines.

## Basic Syntax

```bash
grep [OPTIONS] PATTERN [FILE...]
```

- **PATTERN**: The text or regular expression to search for
- **FILE**: One or more files to search (optional - reads from stdin if omitted)

## Essential Options

### Core Search Options

| Option | Description | Example |
|--------|-------------|---------|
| `-i` | Case-insensitive search | `grep -i 'error' log.txt` |
| `-r` | Recursive directory search | `grep -r 'TODO' /project` |
| `-n` | Show line numbers | `grep -n 'function' script.py` |
| `-c` | Count matching lines | `grep -c 'error' log.txt` |
| `-v` | Invert match (exclude) | `grep -v 'success' output.txt` |
| `-w` | Match whole words only | `grep -w 'main' code.js` |
| `-l` | List filenames only | `grep -l 'import' *.py` |
| `-o` | Show only matched text | `grep -o 'http[^ ]*' file.html` |

### Context Control Options

| Option | Description | Example |
|--------|-------------|---------|
| `-A N` | Show N lines after match | `grep -A 3 'error' log.txt` |
| `-B N` | Show N lines before match | `grep -B 2 'exception' log.txt` |
| `-C N` | Show N lines before and after | `grep -C 5 'critical' log.txt` |

### Output Control Options

| Option | Description | Example |
|--------|-------------|---------|
| `-h` | Suppress filename prefix | `grep -h 'pattern' *.txt` |
| `-H` | Show filename with matches | `grep -H 'pattern' file.txt` |
| `--color` | Highlight matches | `grep --color 'error' log.txt` |
| `-q` | Quiet mode (no output) | `grep -q 'pattern' file && echo "Found"` |

## Common Usage Patterns

### Basic Searches

**Search for a pattern in a single file:**
```bash
grep 'error' logfile.txt
```

**Search for a pattern in multiple files:**
```bash
grep 'error' *.log
```

**Search recursively in all files:**
```bash
grep -r 'TODO' /path/to/project
```

### Case-Insensitive Searches

**Ignore case differences:**
```bash
grep -i 'warning' logfile.txt
```
Matches: Warning, warning, WARNING, WaRnInG

### Line Number Display

**Show line numbers with matches:**
```bash
grep -n 'function' script.py
```
Output format: `42:def function():`

### Counting Matches

**Count matching lines:**
```bash
grep -c 'error' logfile.txt
```
Output: `15` (number of lines with "error")

### Whole Word Matching

**Match complete words only:**
```bash
grep -w 'cat' animals.txt
```
Matches: "cat" but NOT "category" or "concatenate"

### Inverted Matching

**Show lines that DON'T match:**
```bash
grep -v 'success' test_results.txt
```
Shows all non-success lines (useful for filtering out noise)

### Context Display

**Show surrounding context:**
```bash
# 3 lines after each match
grep -A 3 'Exception' error.log

# 2 lines before each match
grep -B 2 'critical' system.log

# 5 lines before and after
grep -C 5 'FATAL' application.log
```

### File Listing

**List files containing pattern:**
```bash
grep -l 'import React' src/**/*.js
```
Output: List of filenames only, no content

**List files NOT containing pattern:**
```bash
grep -L 'deprecated' *.py
```

## Regular Expression Patterns

### Basic Regular Expressions

| Pattern | Description | Example |
|---------|-------------|---------|
| `.` | Any single character | `grep 'h.t' file.txt` (matches: hat, hot, hit) |
| `^` | Start of line | `grep '^Error' log.txt` (lines starting with "Error") |
| `$` | End of line | `grep 'done$' output.txt` (lines ending with "done") |
| `*` | Zero or more of previous | `grep 'ab*c' file.txt` (matches: ac, abc, abbc) |
| `[]` | Character class | `grep '[0-9]' file.txt` (lines with digits) |
| `[^]` | Negated character class | `grep '[^a-z]' file.txt` (non-lowercase chars) |

### Extended Regular Expressions (`-E` flag)

**Enable extended regex with `-E` or use `egrep`:**

| Pattern | Description | Example |
|---------|-------------|---------|
| `+` | One or more of previous | `grep -E 'ab+c' file.txt` (abc, abbc, not ac) |
| `?` | Zero or one of previous | `grep -E 'colou?r' file.txt` (color, colour) |
| `\|` | Alternation (OR) | `grep -E 'error\|warning' log.txt` |
| `()` | Grouping | `grep -E '(foo\|bar)baz' file.txt` |
| `{n}` | Exactly n occurrences | `grep -E '[0-9]{3}' file.txt` (3 digits) |
| `{n,}` | n or more occurrences | `grep -E '[a-z]{5,}' file.txt` (5+ letters) |
| `{n,m}` | Between n and m | `grep -E '[0-9]{2,4}' file.txt` (2-4 digits) |

### Practical Regex Examples

**Find IP addresses:**
```bash
grep -E '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b' network.log
```

**Find email addresses:**
```bash
grep -E '\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b' contacts.txt
```

**Find URLs:**
```bash
grep -E 'https?://[^ ]+' webpage.html
```

**Find error codes (e.g., ERR-001):**
```bash
grep -E 'ERR-[0-9]{3}' application.log
```

**Lines starting with Error or Warning:**
```bash
grep -E '^(Error|Warning)' logfile.txt
```

## Advanced Techniques

### Multiple Pattern Matching

**Match multiple patterns (OR logic):**
```bash
grep -E 'error|warning|critical' logfile.txt
# or
grep -e 'error' -e 'warning' -e 'critical' logfile.txt
```

**Match all patterns (AND logic using pipes):**
```bash
grep 'error' logfile.txt | grep 'database' | grep 'timeout'
```

### File Type Filtering

**Search only specific file types:**
```bash
# Python files only
grep -r 'import' --include="*.py" /project

# Multiple file types
grep -r 'function' --include="*.js" --include="*.ts" /src

# Exclude specific files
grep -r 'TODO' --exclude="*.min.js" --exclude="*.log" /project

# Exclude directories
grep -r 'pattern' --exclude-dir="node_modules" --exclude-dir=".git" /project
```

### Combining with Other Commands

**Filter command output:**
```bash
# Find running processes
ps aux | grep 'apache'

# Search in compressed files
zcat logfile.gz | grep 'error'

# Find files and search content
find . -name "*.log" -exec grep 'error' {} +

# Count unique error types
grep 'ERROR' app.log | cut -d: -f2 | sort | uniq -c
```

### Performance Optimization

**Faster searches with optimizations:**
```bash
# Stop after first match
grep -m 1 'pattern' large_file.txt

# Use fixed strings (faster than regex)
grep -F 'exact.string.with.dots' file.txt

# Binary files: skip or treat as text
grep -I 'pattern' *           # Skip binary files
grep -a 'pattern' binary.dat  # Treat as text
```

## Quick Reference Table

| Task | Command |
|------|---------|
| Basic search | `grep 'pattern' file.txt` |
| Case-insensitive | `grep -i 'pattern' file.txt` |
| Recursive search | `grep -r 'pattern' /path` |
| Show line numbers | `grep -n 'pattern' file.txt` |
| Count matches | `grep -c 'pattern' file.txt` |
| Invert match | `grep -v 'pattern' file.txt` |
| Whole words only | `grep -w 'pattern' file.txt` |
| List filenames | `grep -l 'pattern' *.txt` |
| Show context (±5 lines) | `grep -C 5 'pattern' file.txt` |
| Multiple patterns (OR) | `grep -E 'foo\|bar' file.txt` |
| Extended regex | `grep -E 'pattern+' file.txt` |
| Fixed string search | `grep -F 'exact.string' file.txt` |
| Recursive with file filter | `grep -r 'pattern' --include="*.py" /path` |
| Exclude directories | `grep -r 'pattern' --exclude-dir="node_modules" /path` |
| Quiet mode (exit code only) | `grep -q 'pattern' file.txt` |
| Show only matched text | `grep -o 'pattern' file.txt` |

## Real-World Examples

### Log Analysis

**Find all errors in the last hour:**
```bash
grep 'ERROR' /var/log/application.log | grep "$(date -d '1 hour ago' '+%Y-%m-%d %H')"
```

**Find critical errors with context:**
```bash
grep -C 10 'CRITICAL' system.log
```

**Count error types:**
```bash
grep -o 'ERROR: [^:]*' app.log | sort | uniq -c | sort -nr
```

### Code Analysis

**Find all TODO comments in a project:**
```bash
grep -rn 'TODO' --include="*.js" --include="*.ts" /project/src
```

**Find function definitions:**
```bash
grep -rn '^function\s' --include="*.js" /src
```

**Find unused imports:**
```bash
comm -23 <(grep -h 'import.*from' *.js | sort -u) <(grep -oh '\w\+' *.js | sort -u)
```

### System Administration

**Find running processes:**
```bash
ps aux | grep -v grep | grep 'apache'
```

**Check if service is running:**
```bash
systemctl status myservice | grep -q 'active (running)' && echo "Running" || echo "Stopped"
```

**Find files modified recently:**
```bash
find /var/log -mtime -1 -exec grep -l 'error' {} \;
```

### Security Auditing

**Find potential API keys or secrets:**
```bash
grep -rE '(api_key|apikey|secret|password|token)\s*[:=]\s*["\x27][^"\x27]+["\x27]' --include="*.js" /project
```

**Find hardcoded IP addresses:**
```bash
grep -rE '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b' --include="*.conf" /etc
```

## Best Practices

1. **Use `-r` for directory searches**: More efficient than `find` + `grep` for most cases
2. **Add `--color=auto`** to your shell config for better visibility
3. **Use `-w` for word searches** to avoid partial matches
4. **Exclude unnecessary directories** (`node_modules`, `.git`, etc.) for faster searches
5. **Use `-F` for literal strings** when you don't need regex (faster)
6. **Combine with other tools**: `sort`, `uniq`, `wc`, `awk` for powerful text processing
7. **Quiet mode (`-q`) in scripts**: Better for conditional checks
8. **Use context options** (`-A`, `-B`, `-C`) for debugging and log analysis

## Alternative Tools

For more advanced use cases, consider these modern alternatives:

- **ripgrep (`rg`)**: Extremely fast, respects `.gitignore`, better defaults
- **The Silver Searcher (`ag`)**: Fast code searching with good defaults
- **ack**: Perl-based, optimized for source code searching
- **GNU grep with PCRE**: Use `-P` flag for Perl-compatible regex (if available)

## Common Pitfalls

1. **Forgetting to quote patterns**: Use quotes to prevent shell interpretation
   ```bash
   # Wrong: grep $PATH file.txt
   # Right: grep '$PATH' file.txt
   ```

2. **Not escaping special characters**: Use `\` or `-F` for literal strings
   ```bash
   # Wrong: grep '192.168.1.1' file.txt  # . matches any character
   # Right: grep -F '192.168.1.1' file.txt
   # Right: grep '192\.168\.1\.1' file.txt
   ```

3. **Including grep itself in ps output**:
   ```bash
   # Wrong: ps aux | grep myprocess  # Shows the grep command too
   # Right: ps aux | grep -v grep | grep myprocess
   # Better: ps aux | grep '[m]yprocess'
   ```

4. **Recursively searching large directories**: Always exclude build artifacts
   ```bash
   grep -r 'pattern' --exclude-dir={node_modules,.git,dist,build} /project
   ```

## Workflow Examples

### Quick Search Workflow

1. **Start broad**: `grep -r 'pattern' /project`
2. **Refine with filters**: Add `--include="*.js"` or `--exclude-dir="tests"`
3. **Add context**: Use `-C 3` to see surrounding code
4. **Analyze results**: Pipe to `wc -l`, `sort`, or `uniq` for statistics

### Debugging Workflow

1. **Find error occurrence**: `grep -n 'ERROR' app.log`
2. **Get full context**: `grep -C 20 'ERROR: Database timeout' app.log`
3. **Check frequency**: `grep -c 'ERROR: Database timeout' app.log`
4. **Find pattern**: `grep -E 'ERROR: Database.*timeout' app.log`

### Code Search Workflow

1. **Find function usage**: `grep -rn 'functionName(' --include="*.js" /src`
2. **Find definitions**: `grep -rn '^function functionName' --include="*.js" /src`
3. **Find imports**: `grep -rn 'import.*functionName' --include="*.js" /src`
4. **Cross-reference**: Combine results to understand dependencies

## Summary

`grep` is an indispensable tool for text searching and pattern matching. Master these essentials:

- **Basic usage**: `grep 'pattern' file` with `-i`, `-r`, `-n` options
- **Regular expressions**: Use `-E` for powerful pattern matching
- **Context control**: `-A`, `-B`, `-C` for surrounding lines
- **Filtering**: `--include`, `--exclude` for targeted searches
- **Combining tools**: Pipe to other commands for advanced workflows

For everyday use, start with simple patterns and gradually incorporate regex and advanced options as needed. The key to efficiency is knowing when to use grep versus modern alternatives like `ripgrep`, and understanding how to filter and optimize your searches for large codebases.

