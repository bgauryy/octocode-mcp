# Octocode-MCP Tools Reference

## Overview

Octocode-MCP provides **10 specialized tools** organized into three categories, designed to work together through progressive refinement and intelligent fallbacks.

## Tool Categories

### 🔍 GitHub Analysis Tools (7 tools)

#### 1. `github_search_code`
**Purpose**: Search for code patterns across GitHub repositories  
**Strategy**: Progressive refinement - start broad, then narrow focus  
**Best For**: Finding implementations, functions, specific code patterns  
**Key Features**:
- Multi-query support (up to 5 queries)
- Language/extension/filename filters
- File size filtering
- Content minification for token efficiency

#### 2. `github_fetch_content`
**Purpose**: Retrieve specific file contents from repositories  
**Strategy**: Parallel queries with partial file access  
**Best For**: Reading source code, documentation, configuration files  
**Key Features**:
- Partial file access (line ranges)
- Context lines around target sections
- Branch/commit SHA support
- Auto-minification by file type

#### 3. `github_search_repositories`
**Purpose**: Discover repositories by topic, language, or criteria  
**Strategy**: Token-optimized discovery with smart filtering  
**Best For**: Finding projects, libraries, implementation examples  
**Key Features**:
- Multi-criteria filtering (stars, forks, language, topics)
- Date range filtering
- License and visibility filters
- Engagement metrics (stars, forks, issues)

#### 4. `github_search_commits`
**Purpose**: Search commit history by message, author, or date  
**Strategy**: Build comprehensive understanding of changes  
**Best For**: Tracking code evolution, finding specific changes  
**Key Features**:
- Message/author/date filtering
- Optional diff content retrieval
- Commit SHA extraction for file viewing
- Cross-repository search capability

#### 5. `github_search_pull_requests`
**Purpose**: Analyze pull requests with comprehensive filtering  
**Strategy**: Find solutions and implementation approaches  
**Best For**: Understanding code changes, review processes  
**Key Features**:
- State/review status filtering
- Optional commit data with diffs
- Comment content retrieval
- Branch and merge information

#### 6. `github_search_issues`
**Purpose**: Search GitHub issues and bug reports  
**Strategy**: Quality data from relevant problem discussions  
**Best For**: Understanding problems, feature requests, discussions  
**Key Features**:
- Label/milestone/assignee filtering
- Comment and reaction metrics
- State and date filtering
- Cross-repository issue search

#### 7. `github_view_repo_structure`
**Purpose**: Explore repository file/folder structure  
**Strategy**: Progressive depth exploration  
**Best For**: Understanding project organization, navigation  
**Key Features**:
- Configurable depth (1-4 levels)
- Smart file filtering (ignore irrelevant files)
- Media file inclusion option
- Branch validation and fallback

### 📦 Package Management Tools (2 tools)

#### 8. `package_search`
**Purpose**: Discover NPM and Python packages efficiently  
**Strategy**: Package-first discovery across ecosystems  
**Best For**: Initial package exploration, dependency research  
**Key Features**:
- Dual NPM/Python search
- Basic package metadata
- Repository URL extraction
- Search strategy optimization

#### 9. `npm_view_package`
**Purpose**: Detailed NPM package information and analysis  
**Strategy**: Quality data from verified sources  
**Best For**: Dependency analysis, package evaluation  
**Key Features**:
- Full package metadata
- Version history and statistics
- Repository links
- License and dependency information

### 🔧 Infrastructure Tools (1 tool)

#### 10. `api_status_check`
**Purpose**: Verify GitHub/NPM connections and permissions  
**Strategy**: Start research with access verification  
**Best For**: Troubleshooting, authentication verification  
**Key Features**:
- GitHub authentication status
- Organization access verification
- NPM registry connection
- Permission validation

## Tool Relationships & Workflows

### Progressive Refinement Chains

```
Repository Discovery:
github_search_repositories → github_view_repo_structure → github_fetch_content

Code Analysis:
github_search_code → github_fetch_content → github_view_repo_structure

Package Research:
package_search → npm_view_package → github_view_repo_structure → github_fetch_content

Issue Investigation:
github_search_issues → github_search_pull_requests → github_search_commits
```

### Smart Fallbacks

Each tool provides context-aware suggestions:

- **No Results**: Broader search scope, alternative tools
- **Access Denied**: Authentication check, public alternatives
- **Rate Limits**: Alternative approaches, cached results
- **Empty Response**: Prerequisite tools, different strategies

### Multi-Tool Workflows

**Complete Package Analysis**:
1. `package_search` → Find packages
2. `npm_view_package` → Get detailed info
3. `github_view_repo_structure` → Explore codebase
4. `github_fetch_content` → Read key files
5. `github_search_issues` → Check known problems

**Code Pattern Research**:
1. `github_search_repositories` → Find relevant repos
2. `github_search_code` → Locate implementations
3. `github_fetch_content` → Study specific files
4. `github_search_commits` → Understand evolution

## Usage Strategies

### Token Efficiency
- **Progressive queries**: Start broad, then narrow
- **Partial content**: Use line ranges for large files
- **Strategic filtering**: Apply filters based on initial findings
- **Content minification**: Automatic optimization by file type

### Research Methodology
1. **Define Goals**: Clear objectives before starting
2. **Broad Discovery**: Use search tools with minimal filters
3. **Narrow Focus**: Apply specific criteria based on findings
4. **Cross-Validate**: Use multiple tools to verify findings
5. **Extract Patterns**: Identify design decisions and trade-offs

### Error Recovery
- **Analyze Failures**: Extract hints from error messages
- **Try Alternatives**: Use fallback tool suggestions
- **Adjust Scope**: Modify search parameters
- **Pivot Strategy**: Switch to different tool combinations

## Security Features

All tools implement:
- **Input Sanitization**: Parameter validation and cleaning
- **Content Filtering**: Secret detection and redaction
- **Safe Defaults**: Conservative approach to unknown content
- **Warning System**: Alert users to potential security issues

## Performance Optimizations

- **Caching**: 24-hour TTL for repeated queries
- **Minification**: File-type-aware content compression
- **Structured Responses**: Consistent, token-efficient formats
- **Parallel Processing**: Multiple queries in single operations

This tool suite provides comprehensive GitHub and NPM ecosystem analysis capabilities while maintaining security, efficiency, and ease of use. 