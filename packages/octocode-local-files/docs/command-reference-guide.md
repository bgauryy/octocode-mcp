# Command Reference Guide: grep, find, and ls

> Comprehensive guide for research and implementation purposes

## Table of Contents

- [Overview](#overview)
- [grep - Search File Contents](#grep---search-file-contents)
- [find - Search for Files](#find---search-for-files)
- [ls - List Directory Contents](#ls---list-directory-contents)
- [Integration Patterns](#integration-patterns)
- [References](#references)

---

## Overview

This guide covers three fundamental Unix/Linux commands that form the backbone of file system operations and text search functionality. These commands are essential for understanding the `octocode-local-files` implementation.

### Command Comparison

| Command | Primary Purpose | Search Scope | Output Type |
|---------|----------------|--------------|-------------|
| `grep` | Search **within** file contents | File content | Matching lines with context |
| `find` | Search **for** files by properties | File system structure | File/directory paths |
| `ls` | List directory contents | Single directory | File/directory listings |

---

## grep - Search File Contents

### Explanation

`grep` (Global Regular Expression Print) searches for patterns within file contents and prints matching lines. It's the foundation for content-based search operations.

**Etymology**: Comes from the ed command `g/re/p` (global / regular expression / print)

### Core Functionality

```bash
# Basic syntax
grep [OPTIONS] PATTERN [FILE...]

# Search for pattern in files
grep "error" logfile.txt

# Case-insensitive search
grep -i "warning" *.log

# Recursive search in directories
grep -r "TODO" src/

# Show line numbers
grep -n "function" script.js

# Count matches
grep -c "import" *.ts
```

### Best Practices

#### 1. **Use Appropriate Pattern Types**

```bash
# Basic Regular Expression (BRE) - default
grep "error.*failed" log.txt

# Extended Regular Expression (ERE) - more powerful
grep -E "(error|warning|critical)" log.txt

# Fixed strings - fastest for literal matches
grep -F "exact.string.with.dots" config.txt

# Perl Compatible Regular Expression (PCRE) - most powerful
grep -P "\d{3}-\d{3}-\d{4}" contacts.txt
```

#### 2. **Optimize Performance**

```bash
# Use -F for literal strings (10-100x faster)
grep -F "literal text" large_file.txt

# Limit directory traversal
grep -r --include="*.js" "pattern" src/

# Exclude unnecessary files
grep -r --exclude-dir=node_modules --exclude="*.min.js" "pattern" .

# Stop after N matches
grep -m 10 "error" huge_log.txt
```

#### 3. **Context Control**

```bash
# Show 3 lines before match
grep -B 3 "error" log.txt

# Show 3 lines after match
grep -A 3 "error" log.txt

# Show 3 lines before and after
grep -C 3 "error" log.txt

# Show filename with matches
grep -H "pattern" *.txt

# Show only filenames
grep -l "pattern" *.txt
```

#### 4. **Binary and Special Files**

```bash
# Treat binary files as text
grep -a "string" binary_file

# Skip binary files
grep -I "pattern" *

# Handle null-separated filenames
find . -print0 | xargs -0 grep "pattern"
```

### Common Pitfalls

❌ **Don't:**
- Use `grep` without quotes for patterns with spaces or special chars
- Forget to escape regex special characters: `. * [ ] ^ $ \ |`
- Use `grep -r` on large directories without exclusions
- Pipe large `find` output to `grep` (use `find -exec` instead)

✅ **Do:**
- Always quote patterns: `grep "my pattern" file.txt`
- Use `-F` for literal strings: `grep -F "192.168.1.1" file.txt`
- Exclude irrelevant directories: `--exclude-dir={node_modules,.git}`
- Use appropriate regex flavor for your needs

### Implementation Notes for octocode-local-files

```typescript
// Key considerations for GrepCommandBuilder:
// 1. Pattern escaping and sanitization
// 2. File type filtering (--include/--exclude)
// 3. Context line control (-A, -B, -C)
// 4. Binary file handling (-I)
// 5. Performance optimization (--max-count)
// 6. Output format standardization
```

---

## find - Search for Files

### Explanation

`find` searches for files and directories based on properties like name, type, size, modification time, and permissions. It traverses directory trees recursively.

### Core Functionality

```bash
# Basic syntax
find [PATH...] [EXPRESSION]

# Find by name
find . -name "*.js"

# Case-insensitive name search
find . -iname "readme.md"

# Find directories only
find . -type d -name "test*"

# Find files only
find . -type f -name "*.log"

# Find by size
find . -size +100M

# Find by modification time
find . -mtime -7  # Modified in last 7 days
```

### Best Practices

#### 1. **Efficient Path Traversal**

```bash
# Limit search depth
find . -maxdepth 2 -name "*.js"

# Start from specific directory
find src/ -name "*.ts"

# Prune directories early
find . -path "*/node_modules" -prune -o -name "*.js" -print

# Multiple starting points
find src/ tests/ -name "*.ts"
```

#### 2. **Complex Search Criteria**

```bash
# Combine conditions with AND
find . -name "*.js" -size +10k

# OR conditions
find . \( -name "*.js" -o -name "*.ts" \)

# NOT conditions
find . -name "*.js" ! -path "*/node_modules/*"

# Multiple file extensions
find . -type f \( -name "*.md" -o -name "*.txt" \)
```

#### 3. **Execute Actions on Results**

```bash
# Execute command on each file
find . -name "*.tmp" -exec rm {} \;

# Execute with multiple files (more efficient)
find . -name "*.txt" -exec grep "pattern" {} +

# Use with xargs for parallel processing
find . -name "*.js" -print0 | xargs -0 -P 4 eslint

# Interactive confirmation
find . -name "*.bak" -ok rm {} \;
```

#### 4. **Time-based Searches**

```bash
# Modified in last 24 hours
find . -mtime 0

# Modified more than 30 days ago
find . -mtime +30

# Modified between 7-14 days ago
find . -mtime +7 -mtime -14

# Accessed in last hour
find . -amin -60

# Changed (metadata) in last week
find . -ctime -7
```

#### 5. **Permission-based Searches**

```bash
# Find executable files
find . -type f -executable

# Find by specific permissions
find . -perm 644

# Find world-writable files
find . -perm -002

# Find files owned by user
find . -user username
```

### Common Pitfalls

❌ **Don't:**
- Forget to quote patterns with wildcards: `find . -name *.js` (wrong)
- Use `find` without `-print` in scripts (behavior varies)
- Pipe many results to slow commands without `xargs`
- Ignore the difference between `-exec \;` and `-exec +`

✅ **Do:**
- Always quote patterns: `find . -name "*.js"`
- Use `-print0` with `xargs -0` for files with spaces
- Prune early to avoid traversing large directories
- Use `-maxdepth` to limit recursion depth

### Implementation Notes for octocode-local-files

```typescript
// Key considerations for FindCommandBuilder:
// 1. Path sanitization and validation
// 2. Pattern escaping (especially wildcards)
// 3. Depth control for performance
// 4. Type filtering (files vs directories)
// 5. Ignored path handling (.git, node_modules)
// 6. Result limit for large directory trees
```

---

## ls - List Directory Contents

### Explanation

`ls` lists directory contents with various formatting and filtering options. It's the foundation for directory structure exploration.

### Core Functionality

```bash
# Basic syntax
ls [OPTIONS] [FILE...]

# List current directory
ls

# List with details
ls -l

# Show hidden files
ls -a

# Human-readable sizes
ls -lh

# Sort by modification time
ls -lt

# Reverse sort order
ls -lr
```

### Best Practices

#### 1. **Informative Listings**

```bash
# Long format with human-readable sizes
ls -lh

# Show all files including hidden, with details
ls -lah

# Show file type indicators
ls -F

# One file per line
ls -1

# Include inode numbers
ls -i
```

#### 2. **Sorting Options**

```bash
# Sort by modification time (newest first)
ls -lt

# Sort by size (largest first)
ls -lS

# Sort by extension
ls -lX

# Natural sort of version numbers
ls -v

# No sorting (fastest)
ls -U
```

#### 3. **Filtering and Selection**

```bash
# List only directories
ls -d */

# List specific file types
ls *.js

# Exclude patterns
ls --hide="*.bak"

# Show only files (not directories)
ls -p | grep -v /

# List recursively
ls -R
```

#### 4. **Output Formatting**

```bash
# Color output
ls --color=auto

# Comma-separated format
ls -m

# Detailed format with full timestamps
ls -l --time-style=full-iso

# Group directories first
ls --group-directories-first

# Quote filenames with special characters
ls -Q
```

### Common Pitfalls

❌ **Don't:**
- Parse `ls` output in scripts (use `find` instead)
- Rely on `ls` for file operations (not atomic)
- Use `ls -l` without `-h` for size comparisons
- Forget that `ls` behavior varies across systems

✅ **Do:**
- Use appropriate flags for readability: `-lh`
- Set `alias ls='ls --color=auto'` in shell config
- Use `ls -1` for scripting if needed (better: use `find`)
- Combine with `head` or `tail` for large directories

### Implementation Notes for octocode-local-files

```typescript
// Key considerations for LsCommandBuilder:
// 1. Depth control (single level vs recursive)
// 2. Hidden file handling
// 3. Sorting options (name, time, size)
// 4. Output format standardization
// 5. Path filtering (ignore patterns)
// 6. Metadata extraction (size, type, permissions)
```

---

## Integration Patterns

### When to Use Each Command

#### Use `grep` when:
- ✅ Searching for text patterns **inside files**
- ✅ Need to find code references, log entries, or configuration values
- ✅ Filtering output from other commands
- ✅ Regular expression matching is required

#### Use `find` when:
- ✅ Searching **for files** by name, type, or properties
- ✅ Need to process files based on attributes (size, time, permissions)
- ✅ Building file lists for batch operations
- ✅ Traversing complex directory structures

#### Use `ls` when:
- ✅ Exploring a **single directory** interactively
- ✅ Need formatted, human-readable directory listings
- ✅ Quick inspection of file properties
- ✅ Sorting files by various attributes

### Combined Usage Patterns

```bash
# Pattern 1: Find files, then search content
find . -name "*.log" -exec grep -l "ERROR" {} +

# Pattern 2: List files, filter by pattern
ls -1 | grep "test"

# Pattern 3: Find files, list with details
find . -name "*.js" -exec ls -lh {} \;

# Pattern 4: Complex search and process
find . -type f -name "*.ts" -mtime -7 | xargs grep -l "TODO"

# Pattern 5: Directory structure with grep filter
ls -R | grep "pattern"
```

### Performance Considerations

```bash
# ❌ SLOW: Grep entire directory without filtering
grep -r "pattern" /large/directory/

# ✅ FAST: Filter files first with find
find /large/directory/ -name "*.log" -exec grep "pattern" {} +

# ❌ SLOW: Multiple grep processes
for file in $(ls *.txt); do grep "pattern" "$file"; done

# ✅ FAST: Single grep with multiple files
grep "pattern" *.txt

# ❌ SLOW: Unnecessary ls piping
ls -R | grep "\.js$"

# ✅ FAST: Direct find with pattern
find . -name "*.js"
```

---

## References

### Official Documentation

#### grep
- **GNU grep Manual**: https://www.gnu.org/software/grep/manual/grep.html
- **Man Page**: `man grep` or https://man7.org/linux/man-pages/man1/grep.1.html
- **Source Code**: https://git.savannah.gnu.org/cgit/grep.git

#### find
- **GNU findutils Manual**: https://www.gnu.org/software/findutils/manual/html_node/find_html/
- **Man Page**: `man find` or https://man7.org/linux/man-pages/man1/find.1.html
- **Source Code**: https://git.savannah.gnu.org/cgit/findutils.git

#### ls
- **GNU coreutils Manual**: https://www.gnu.org/software/coreutils/manual/html_node/ls-invocation.html
- **Man Page**: `man ls` or https://man7.org/linux/man-pages/man1/ls.1.html
- **Source Code**: https://git.savannah.gnu.org/cgit/coreutils.git

### Learning Resources

#### Books and Tutorials
- **"CLI text processing with GNU grep and ripgrep"** by learnbyexample
  - Repository: https://github.com/learnbyexample/learn_gnugrep_ripgrep
  - Web: https://learnbyexample.github.io/learn_gnugrep_ripgrep/

- **"Linux Command Line Computing"** by learnbyexample
  - Repository: https://github.com/learnbyexample/cli-computing
  - Web: https://learnbyexample.github.io/cli-computing/
  - Covers: ls (Chapter 4), find (Chapter 7)

- **"CLI Text Processing with GNU Coreutils"** by learnbyexample
  - Repository: https://github.com/learnbyexample/cli_text_processing_coreutils
  - Web: https://learnbyexample.github.io/cli_text_processing_coreutils/

#### Implementation References
- **uutils/coreutils** - Rust implementation of GNU coreutils
  - Repository: https://github.com/uutils/coreutils
  - ls implementation: https://github.com/uutils/coreutils/tree/main/src/uu/ls
  - Excellent reference for modern implementation patterns

- **ripgrep** - Modern grep alternative
  - Repository: https://github.com/BurntSushi/ripgrep
  - User Guide: https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md

#### Community Resources
- **Stack Overflow Tags**:
  - [grep](https://stackoverflow.com/questions/tagged/grep)
  - [find](https://stackoverflow.com/questions/tagged/find)
  - [ls](https://stackoverflow.com/questions/tagged/ls)

- **Unix Stack Exchange**:
  - https://unix.stackexchange.com/
  - Excellent for command-line questions

### Related Tools and Alternatives

#### Modern Alternatives
- **ripgrep** (`rg`) - Faster grep with better defaults
- **fd** - User-friendly find alternative
- **exa/eza** - Modern ls replacement with colors and git integration
- **fzf** - Fuzzy finder for interactive searching

#### Complementary Tools
- **xargs** - Build and execute commands from standard input
- **parallel** - GNU parallel for concurrent execution
- **ag** (The Silver Searcher) - Code-optimized search tool
- **ack** - grep-like tool optimized for programmers

### Design Patterns and Best Practices

#### Books
- **"The Linux Command Line"** by William Shotts
  - Free online: https://linuxcommand.org/tlcl.php

- **"Unix Power Tools"** by Shelley Powers et al.
  - Comprehensive reference for Unix commands

#### Articles
- **"Why you shouldn't parse ls"**: https://mywiki.wooledge.org/ParsingLs
- **"Using find"**: https://mywiki.wooledge.org/UsingFind
- **"BashGuide/Patterns"**: https://mywiki.wooledge.org/BashGuide/Patterns

### Standards and Specifications

- **POSIX.1-2017**: https://pubs.opengroup.org/onlinepubs/9699919799/
  - grep: https://pubs.opengroup.org/onlinepubs/9699919799/utilities/grep.html
  - find: https://pubs.opengroup.org/onlinepubs/9699919799/utilities/find.html
  - ls: https://pubs.opengroup.org/onlinepubs/9699919799/utilities/ls.html

### Implementation Notes for octocode-local-files

This documentation directly informs the design of:

1. **`GrepCommandBuilder`** (`src/commands/GrepCommandBuilder.ts`)
   - Pattern escaping and validation
   - Context line control
   - File filtering and exclusions
   - Output parsing and formatting

2. **`FindCommandBuilder`** (`src/commands/FindCommandBuilder.ts`)
   - Path traversal and depth control
   - Pattern matching (name, type, size)
   - Prune directory optimization
   - Result limitation

3. **`LsCommandBuilder`** (`src/commands/LsCommandBuilder.ts`)
   - Directory listing with metadata
   - Sorting and filtering options
   - Depth control (single vs recursive)
   - Output format standardization

4. **Security Considerations**
   - Command injection prevention
   - Path traversal validation
   - Pattern sanitization
   - Resource limit enforcement

---

## Quick Reference Cheat Sheet

### grep
```bash
grep "pattern" file              # Basic search
grep -i "pattern" file           # Case insensitive
grep -r "pattern" dir/           # Recursive
grep -n "pattern" file           # Show line numbers
grep -c "pattern" file           # Count matches
grep -l "pattern" *.txt          # Files with matches
grep -v "pattern" file           # Invert match
grep -E "p1|p2" file            # Extended regex
grep -F "literal" file           # Fixed string
grep -A 3 "pattern" file         # 3 lines after
grep -B 3 "pattern" file         # 3 lines before
grep -C 3 "pattern" file         # 3 lines context
```

### find
```bash
find . -name "*.js"              # Find by name
find . -iname "readme.md"        # Case insensitive
find . -type f                   # Files only
find . -type d                   # Directories only
find . -size +100M               # Larger than 100MB
find . -mtime -7                 # Modified last 7 days
find . -maxdepth 2               # Limit depth
find . -name "*.tmp" -delete     # Find and delete
find . -name "*.js" -exec cmd {} \;  # Execute command
find . -path "*/node_modules" -prune -o -print  # Exclude dir
```

### ls
```bash
ls -l                            # Long format
ls -a                            # All files (hidden)
ls -h                            # Human-readable sizes
ls -t                            # Sort by time
ls -S                            # Sort by size
ls -r                            # Reverse order
ls -R                            # Recursive
ls -1                            # One per line
ls -d */                         # Directories only
ls --color=auto                  # Colored output
ls -lah                          # Combo: long, all, human
```

---

**Document Version**: 1.0  
**Last Updated**: 2025-10-17  
**Maintained by**: octocode-local-files team  
**Related Files**: 
- `docs/grep-cli-guide.md`
- `docs/ls-cli-guide.md`
- `src/commands/GrepCommandBuilder.ts`
- `src/commands/FindCommandBuilder.ts`
- `src/commands/LsCommandBuilder.ts`

