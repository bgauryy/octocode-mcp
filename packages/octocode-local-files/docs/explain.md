# Linux Commands Reference

## grep - Search File Content

### Overview
`grep` (Global Regular Expression Print) searches for text patterns within files. It's essential for finding specific code, strings, or patterns across your codebase.

### Research Goal
Quickly locate text patterns, function definitions, variable usage, error messages, or any content within files without manually opening each one.

### Key Examples

```bash
# Basic text search
grep "function" file.js

# Case-insensitive search
grep -i "error" logs.txt

# Search recursively in all files
grep -r "TODO" ./src

# Show line numbers
grep -n "import" app.js

# Search with regular expressions
grep -E "^function\s+\w+" *.js

# Invert match (show lines NOT matching)
grep -v "test" config.json

# Show only filenames with matches
grep -l "className" *.tsx

# Show context (3 lines before/after)
grep -C 3 "bug" README.md

# Count matching lines
grep -c "console.log" *.js

# Search multiple patterns
grep -e "error" -e "warning" server.log
```

### Best Practices
- Use `-i` for case-insensitive searches to catch all variations
- Add `-n` to show line numbers for easier navigation
- Use `-r` for recursive directory searches
- Combine with `-l` to first identify files, then search deeper
- Use `-E` for extended regex support (more powerful patterns)
- Add `--include="*.ext"` to filter by file type
- Use `-A`, `-B`, `-C` for context around matches
- Escape special regex characters: `grep "function\(\)" file.js`

---

## ls - List Directory Contents

### Overview
`ls` lists files and directories, showing detailed information about directory structure, permissions, sizes, and modification times.

### Research Goal
Understand directory organization, file properties, and structure to navigate codebases and identify relevant files for analysis.

### Key Examples

```bash
# Basic listing
ls

# Long format with details
ls -l

# Show hidden files
ls -a

# Human-readable file sizes
ls -lh

# Sort by modification time (newest first)
ls -lt

# Sort by size (largest first)
ls -lS

# Recursive listing
ls -R

# Show only directories
ls -d */

# Reverse sort order
ls -lr

# Show file types with indicators
ls -F

# One file per line
ls -1

# Show inode numbers
ls -i

# Combine multiple options
ls -lhta
```

### Best Practices
- Use `-l` for detailed information (permissions, size, date)
- Add `-h` to make file sizes human-readable (KB, MB, GB)
- Use `-a` to reveal hidden files (starting with `.`)
- Combine `-lt` to see recently modified files first
- Add `-R` for recursive view of subdirectories
- Use `ls -d */` to list only directories
- Filter with patterns: `ls *.js` for specific file types
- Use `-S` to identify large files quickly

---

## find - Advanced File Discovery

### Overview
`find` is a powerful tool for locating files based on multiple criteria: name, type, size, modification time, permissions, and even content.

### Research Goal
Discover files matching complex criteria across directory trees, enabling targeted analysis of specific file types, sizes, or modification dates.

### Key Examples

```bash
# Find a file by name
find / -name "file.txt"

# Case-insensitive file search
find ~/Documents -iname "report.*"

# Find directories only
find /var/log -type d

# Find files only
find . -type f

# Find all Python files
find /home -name "*.py"

# Find files modified in last 7 days
find /etc -mtime -7

# Find files modified more than 30 days ago
find /tmp -mtime +30

# Find files larger than 10 MB
find / -size +10M

# Find files smaller than 1 KB
find . -size -1k

# Find empty files or directories
find /tmp -empty

# Find by permissions
find . -perm 755

# Find files owned by user
find /home -user john

# Multiple file extensions with OR
find . \( -name "*.md" -o -name "*.txt" -o -name "*.log" \)

# Find web assets
find /var/www \( -name "*.html" -o -name "*.css" -o -name "*.js" \)

# Using regex for multiple extensions
find . -regextype posix-egrep -regex '.*\.(md|txt|log)$'

# Find and execute command on each file
find . -name "*.log" -exec rm {} \;

# Find files and search content
find . -type f -name "*.md" -exec grep -H "TODO" {} \;

# Find and list with details
find . -name "*.js" -exec ls -lh {} \;

# Find recently accessed files
find /var/log -atime -1

# Find files between size range
find . -size +1M -size -10M

# Exclude directories from search
find . -name "node_modules" -prune -o -name "*.js" -print

# Find and count files
find . -type f -name "*.ts" | wc -l
```

### Best Practices
- Start with specific paths to reduce search time: `find ./src` vs `find /`
- Use `-type f` for files only, `-type d` for directories
- Combine multiple criteria for precise results
- Use `-iname` for case-insensitive name searches
- Use parentheses `\(` and `-o` for OR conditions
- Add `-prune` to exclude directories (like node_modules)
- Use `-exec` carefully - test with `-print` first
- For speed, limit search depth: `-maxdepth 2`
- Combine with `grep` for content-based discovery
- Use `-regex` for complex pattern matching
- Remember time flags: `-mtime` (modified), `-atime` (accessed), `-ctime` (changed)
- Size units: `c` (bytes), `k` (KB), `M` (MB), `G` (GB)
- Use quotes around patterns to prevent shell expansion

### Time Expressions
- `-mtime -7` = modified in last 7 days
- `-mtime +30` = modified more than 30 days ago
- `-mtime 7` = modified exactly 7 days ago
- `-mmin -60` = modified in last 60 minutes

### Common Patterns
```bash
# Find all config files
find . -name "*.config.js" -o -name "*.config.ts"

# Find recent changes
find ./src -type f -mtime -1

# Find large files for cleanup
find . -type f -size +100M

# Find files by multiple extensions
find . -regextype posix-egrep -regex '.*\.(ts|tsx|js|jsx)$'

# Complex exclusion pattern
find . -path ./node_modules -prune -o -path ./.git -prune -o -name "*.js" -print
```

---

## Tool Integration

### LOCAL_SEARCH_CONTENT (grep)
Optimized for searching **content within files**. Best for finding code patterns, function definitions, imports, and text occurrences.

### LOCAL_VIEW_STRUCTURE (ls)
Optimized for **exploring directory structure**. Best for understanding file organization, identifying file types, and checking file properties.

### LOCAL_FIND_FILES (find)
Optimized for **discovering files by criteria**. Best for complex file searches combining name, size, type, time, and permissions.

### Workflow Recommendations
1. **Discovery**: Use `find` to locate relevant files by name/type
2. **Structure**: Use `ls` to understand directory organization  
3. **Content**: Use `grep` to search within discovered files
4. **Combined**: `find` + `grep` for content-based file discovery

---

## Performance Tips

### For Large Codebases
- Limit search scope to specific directories
- Use file type filters to reduce search space
- Exclude common large directories (node_modules, .git, dist)
- Use `-maxdepth` to limit recursion depth
- Combine tools efficiently: find files first, then grep content

### Speed Comparisons
- `grep -r` is faster for simple content searches in small trees
- `find -exec grep` better for complex file criteria + content search
- `ls` is fastest for single directory inspection
- `find` is fastest for file discovery by metadata (no content)
