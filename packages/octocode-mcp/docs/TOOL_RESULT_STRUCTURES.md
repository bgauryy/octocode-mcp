# Octocode-MCP Tool Result Structures

This document provides comprehensive documentation of the data result structures for all tools in the Octocode-MCP system. Each tool returns structured JSON responses with consistent patterns for bulk operations, error handling, and metadata.

## Table of Contents

- [Common Response Patterns](#common-response-patterns)
- [GitHub Tools](#github-tools)
  - [GitHub Search Code](#github-search-code)
  - [GitHub Fetch Content](#github-fetch-content)
  - [GitHub Search Repositories](#github-search-repositories)
  - [GitHub View Repository Structure](#github-view-repository-structure)
  - [GitHub Search Commits](#github-search-commits)
  - [GitHub Search Pull Requests](#github-search-pull-requests)
- [Package Management Tools](#package-management-tools)
  - [Package Search](#package-search)

---

## Common Response Patterns

All tools follow consistent patterns for bulk operations, error handling, and metadata:

### Base Response Structure
```json
{
  "results": [...],      // Array of individual query results
  "hints": [...],        // Array of actionable guidance strings
  "meta": {              // Optional metadata about the operation
    "totalOperations": 3,
    "successfulOperations": 2,
    "failedOperations": 1
  }
}
```

### Base Query Item Structure
All queries include these common fields:
```json
{
  "id": "query-1",                    // Optional query identifier
  "reasoning": "Find auth patterns",  // Optional explanation for the query
  "verbose": false                    // Optional verbose output flag
}
```

### Error Handling
Errors are handled at both the operation level and individual query level:
```json
{
  "queryId": "query-1",
  "error": "Repository not found",
  "hints": ["Check repository name spelling", "Verify access permissions"]
}
```

---

## GitHub Tools

### GitHub Search Code

**Tool Name:** `github_search_code`

**Purpose:** Search for code patterns across GitHub repositories with advanced filtering and bulk query support.

#### Input Schema
```json
{
  "queries": [
    {
      "id": "search-1",
      "reasoning": "Find authentication patterns",
      "verbose": false,
      "queryTerms": ["auth", "token"],           // Required: 1-5 search terms
      "owner": "facebook",                       // Optional: single owner or array
      "repo": "react",                          // Optional: single repo or array
      "language": "javascript",                 // Optional: programming language
      "extension": "js",                        // Optional: file extension
      "filename": "auth.js",                    // Optional: specific filename
      "path": "src/auth",                       // Optional: path filter
      "stars": ">1000",                         // Optional: star count filter
      "match": ["file", "path"],                // Optional: search scope
      "limit": 20,                              // Optional: max results (1-20)
      "minify": true,                           // Optional: minify content
      "sanitize": true                          // Optional: sanitize content
    }
  ],
  "verbose": false
}
```

#### Success Response Structure
```json
{
  "results": [
    {
      "queryId": "search-1",
      "reasoning": "Find authentication patterns",
      "repository": "facebook/react",
      "files": [
        {
          "path": "src/auth/AuthProvider.js",
          "text_matches": [
            "function authenticate(token) {\n  return validateToken(token);\n}",
            "const authConfig = {\n  tokenExpiry: 3600\n};"
          ]
        }
      ],
      "totalCount": 15,
      "metadata": {},
      "query": {                                 // Only included when verbose=true or on error
        "queryTerms": ["auth", "token"],
        "language": "javascript"
      }
    }
  ],
  "hints": [
    "Use github_fetch_content with matchString from search results for precise context extraction",
    "Chain tools strategically: start broad with repository search, then structure view, code search, and content fetch for deep analysis"
  ],
  "meta": {
    "totalOperations": 1,
    "successfulOperations": 1,
    "failedOperations": 0
  }
}
```

#### Error Response Structure
```json
{
  "results": [
    {
      "queryId": "search-1",
      "reasoning": "Find authentication patterns",
      "error": "Rate limit exceeded",
      "hints": ["Wait 60 seconds before retrying", "Use more specific search terms"],
      "metadata": {},
      "query": {                                 // Always included on error
        "queryTerms": ["auth", "token"],
        "language": "javascript"
      }
    }
  ],
  "hints": ["Rate limit exceeded. Wait 60 seconds before retrying"],
  "meta": {
    "totalOperations": 1,
    "successfulOperations": 0,
    "failedOperations": 1
  }
}
```

---

### GitHub Fetch Content

**Tool Name:** `github_fetch_content`

**Purpose:** Fetch file content from GitHub repositories with support for partial content, pattern matching, and content optimization.

#### Input Schema
```json
{
  "queries": [
    {
      "id": "fetch-1",
      "reasoning": "Get authentication implementation",
      "verbose": false,
      "owner": "facebook",                       // Required: repository owner
      "repo": "react",                          // Required: repository name
      "filePath": "src/auth/AuthProvider.js",   // Required: exact file path
      "branch": "main",                         // Optional: branch/tag/SHA
      "fullContent": false,                     // Optional: return entire file
      "startLine": 10,                          // Optional: start line (with endLine)
      "endLine": 50,                            // Optional: end line (with startLine)
      "matchString": "authenticate",            // Optional: pattern to find
      "matchStringContextLines": 5,             // Optional: context lines around match
      "minified": true,                         // Optional: minify content
      "sanitize": true                          // Optional: sanitize content
    }
  ]
}
```

#### Success Response Structure
```json
{
  "results": [
    {
      "queryId": "fetch-1",
      "reasoning": "Get authentication implementation",
      "filePath": "src/auth/AuthProvider.js",
      "owner": "facebook",
      "repo": "react",
      "content": "function authenticate(token) {\n  if (!token) {\n    throw new Error('Token required');\n  }\n  return validateToken(token);\n}",
      "startLine": 15,
      "endLine": 21,
      "totalLines": 150,
      "isPartial": true,
      "securityWarnings": [],
      "branch": "main",                          // Only included when verbose=true
      "minified": true,                          // Only included when verbose=true
      "minificationFailed": false,               // Only included when verbose=true
      "minificationType": "terser",              // Only included when verbose=true
      "query": {                                 // Only included when verbose=true
        "owner": "facebook",
        "repo": "react",
        "filePath": "src/auth/AuthProvider.js"
      },
      "sampling": {                              // Only included when sampling is enabled
        "codeExplanation": "This file implements authentication logic...",
        "filePath": "src/auth/AuthProvider.js",
        "repo": "facebook/react",
        "usage": {
          "promptTokens": 150,
          "completionTokens": 75,
          "totalTokens": 225
        },
        "stopReason": "end_turn"
      }
    }
  ],
  "hints": [
    "Examine imports/exports to understand dependencies and usage",
    "Use repository structure analysis to find similar implementations"
  ]
}
```

#### Error Response Structure
```json
{
  "results": [
    {
      "queryId": "fetch-1",
      "originalQuery": {                         // Only included on error
        "owner": "facebook",
        "repo": "react",
        "filePath": "src/auth/NonExistent.js"
      },
      "error": "File not found: src/auth/NonExistent.js"
    }
  ],
  "hints": [
    "Check branch name (main/master) and verify file path exists",
    "Use github_view_repo_structure to explore available files"
  ]
}
```

---

### GitHub Search Repositories

**Tool Name:** `github_search_repositories`

**Purpose:** Search and discover GitHub repositories using multiple search strategies including query terms and topics.

#### Input Schema
```json
{
  "queries": [
    {
      "id": "repo-search-1",
      "reasoning": "Find React authentication libraries",
      "verbose": false,
      "queryTerms": ["react", "authentication"],  // Optional: search terms
      "topics": ["react", "auth"],               // Optional: GitHub topics
      "owner": "facebook",                       // Optional: single owner or array
      "language": "javascript",                  // Optional: programming language
      "stars": ">1000",                          // Optional: star count filter
      "size": "<10000",                          // Optional: repository size in KB
      "created": ">2020-01-01",                  // Optional: creation date filter
      "updated": ">2023-01-01",                  // Optional: last update filter
      "match": ["name", "description"],          // Optional: search scope
      "sort": "stars",                           // Optional: sort field
      "limit": 10                                // Optional: max results (1-20)
    }
  ],
  "verbose": false
}
```

#### Success Response Structure
```json
{
  "results": [
    {
      "queryId": "repo-search-1",
      "reasoning": "Find React authentication libraries",
      "repositories": [
        {
          "owner_repo": "facebook/react",
          "stars": 185000,
          "description": "A declarative, efficient, and flexible JavaScript library for building user interfaces.",
          "language": "JavaScript",
          "url": "https://github.com/facebook/react",
          "forks": 38000,
          "updatedAt": "2024-01-15T10:30:00Z"
        }
      ],
      "total_count": 1250,
      "metadata": {},
      "query": {                                 // Only included when verbose=true or no results
        "queryTerms": ["react", "authentication"],
        "language": "javascript"
      }
    }
  ],
  "hints": [
    "Use github_view_repo_structure first to understand project layout, then target specific files",
    "Compare implementations across 3-5 repositories to identify best practices"
  ],
  "meta": {
    "totalOperations": 1,
    "successfulOperations": 1,
    "failedOperations": 0
  }
}
```

---

### GitHub View Repository Structure

**Tool Name:** `github_view_repo_structure`

**Purpose:** Explore GitHub repository structure and file organization with depth control and filtering.

#### Input Schema
```json
{
  "queries": [
    {
      "id": "structure-1",
      "reasoning": "Understand React project layout",
      "verbose": false,
      "owner": "facebook",                       // Required: repository owner
      "repo": "react",                          // Required: repository name
      "branch": "main",                         // Required: branch/tag/SHA
      "path": "src",                            // Optional: specific path to explore
      "depth": 2                                // Optional: exploration depth (1-2)
    }
  ],
  "verbose": false
}
```

#### Success Response Structure
```json
{
  "results": [
    {
      "queryId": "structure-1",
      "reasoning": "Understand React project layout",
      "repository": "facebook/react",
      "branch": "main",
      "path": "src",
      "files": [
        "src/React.js",
        "src/ReactVersion.js",
        "src/shared/ReactTypes.js"
      ],
      "folders": [
        "src/react",
        "src/react-dom",
        "src/shared"
      ],
      "metadata": {
        "branch": "main",
        "path": "src",
        "folders": {
          "count": 15,
          "folders": [
            {
              "path": "src/react",
              "url": "https://github.com/facebook/react/tree/main/src/react"
            }
          ]
        },
        "summary": {
          "totalFiles": 45,
          "totalFolders": 15,
          "truncated": false,
          "filtered": true,
          "originalCount": 52
        },
        "searchType": "success"
      }
    }
  ],
  "hints": [
    "Use github_fetch_content to examine specific implementation files",
    "Focus on source code and example directories for implementation details"
  ]
}
```

---

### GitHub Search Commits

**Tool Name:** `github_search_commits`

**Purpose:** Search GitHub commits and analyze change history with optional diff content.

#### Input Schema
```json
{
  "queries": [
    {
      "id": "commit-search-1",
      "reasoning": "Find authentication-related commits",
      "verbose": false,
      "queryTerms": ["fix auth", "authentication"],  // Optional: commit message search
      "orTerms": ["login", "oauth"],                 // Optional: OR logic terms
      "owner": "facebook",                           // Optional: repository owner
      "repo": "react",                              // Optional: repository name
      "author": "gaearon",                          // Optional: commit author username
      "author-name": "Dan Abramov",                 // Optional: commit author full name
      "author-email": "dan@example.com",           // Optional: commit author email
      "committer": "gaearon",                       // Optional: committer username
      "committer-name": "Dan Abramov",              // Optional: committer full name
      "committer-email": "dan@example.com",        // Optional: committer email
      "author-date": ">2023-01-01",                 // Optional: author date filter
      "committer-date": "2023-01-01..2023-12-31",  // Optional: commit date filter
      "hash": "abc123",                             // Optional: commit SHA
      "parent": "def456",                           // Optional: parent commit SHA
      "tree": "ghi789",                             // Optional: tree SHA
      "merge": false,                               // Optional: exclude merge commits
      "visibility": "public",                       // Optional: repository visibility
      "limit": 25,                                  // Optional: max results (1-50)
      "getChangesContent": false,                   // Optional: include diff content (expensive)
      "sort": "author-date",                        // Optional: sort field
      "order": "desc"                               // Optional: sort order
    }
  ],
  "verbose": false
}
```

#### Success Response Structure
```json
{
  "data": [
    {
      "queryId": "commit-search-1",
      "reasoning": "Find authentication-related commits",
      "data": {
        "total_count": 15,
        "incomplete_results": false,
        "commits": [
          {
            "sha": "abc123def456",
            "node_id": "C_kwDOABK2zNoAKGFiYzEyM2RlZjQ1Ng",
            "url": "https://api.github.com/repos/facebook/react/commits/abc123def456",
            "html_url": "https://github.com/facebook/react/commit/abc123def456",
            "commit": {
              "message": "Fix authentication token validation",
              "author": {
                "name": "Dan Abramov",
                "email": "dan@example.com",
                "date": "2023-06-15T14:30:00Z"
              },
              "committer": {
                "name": "Dan Abramov",
                "email": "dan@example.com",
                "date": "2023-06-15T14:30:00Z"
              },
              "tree": {
                "sha": "ghi789jkl012",
                "url": "https://api.github.com/repos/facebook/react/git/trees/ghi789jkl012"
              },
              "verification": {
                "verified": true,
                "reason": "valid"
              }
            },
            "author": {
              "login": "gaearon",
              "id": 810438,
              "avatar_url": "https://avatars.githubusercontent.com/u/810438?v=4",
              "html_url": "https://github.com/gaearon"
            },
            "committer": {
              "login": "gaearon",
              "id": 810438,
              "avatar_url": "https://avatars.githubusercontent.com/u/810438?v=4",
              "html_url": "https://github.com/gaearon"
            },
            "parents": [
              {
                "sha": "def456ghi789",
                "url": "https://api.github.com/repos/facebook/react/commits/def456ghi789",
                "html_url": "https://github.com/facebook/react/commit/def456ghi789"
              }
            ],
            "repository": {
              "id": 10270250,
              "name": "react",
              "full_name": "facebook/react",
              "owner": {
                "login": "facebook",
                "id": 69631
              },
              "private": false,
              "html_url": "https://github.com/facebook/react",
              "description": "A declarative, efficient, and flexible JavaScript library for building user interfaces."
            },
            "score": 1.0,
            "files": [                              // Only included when getChangesContent=true
              {
                "sha": "jkl012mno345",
                "filename": "src/auth/AuthProvider.js",
                "status": "modified",
                "additions": 5,
                "deletions": 2,
                "changes": 7,
                "blob_url": "https://github.com/facebook/react/blob/abc123def456/src/auth/AuthProvider.js",
                "raw_url": "https://github.com/facebook/react/raw/abc123def456/src/auth/AuthProvider.js",
                "contents_url": "https://api.github.com/repos/facebook/react/contents/src/auth/AuthProvider.js?ref=abc123def456",
                "patch": "@@ -15,7 +15,10 @@ function validateToken(token) {\n   if (!token) {\n-    return false;\n+    throw new Error('Token required');\n   }\n+  if (token.length < 10) {\n+    throw new Error('Token too short');\n+  }\n   return jwt.verify(token, secret);\n }"
              }
            ],
            "stats": {                              // Only included when getChangesContent=true
              "total": 7,
              "additions": 5,
              "deletions": 2
            }
          }
        ]
      },
      "metadata": {
        "resultCount": 15,
        "hasResults": true,
        "searchType": "success",
        "queryArgs": {                              // Only included when verbose=true or on error
          "queryTerms": ["fix auth", "authentication"],
          "author": "gaearon"
        }
      }
    }
  ],
  "meta": {
    "totalOperations": 1,
    "successfulOperations": 1,
    "failedOperations": 0
  },
  "hints": [
    "Use commit SHAs with github_fetch_content to see actual code changes",
    "Focus on current implementation rather than change history"
  ]
}
```

---

### GitHub Search Pull Requests

**Tool Name:** `github_search_pull_requests`

**Purpose:** Search GitHub pull requests and analyze code reviews with optional comments and file changes.

#### Input Schema
```json
{
  "queries": [
    {
      "id": "pr-search-1",
      "reasoning": "Find authentication-related PRs",
      "verbose": false,
      "query": "authentication fix",              // Optional: search query for PR content
      "owner": "facebook",                       // Optional: single owner or array
      "repo": "react",                          // Optional: single repo or array
      "prNumber": 123,                          // Optional: specific PR number (with owner/repo)
      "state": "closed",                        // Optional: "open" or "closed"
      "assignee": "gaearon",                    // Optional: assignee username
      "author": "gaearon",                      // Optional: PR author username
      "commenter": "sebmarkbage",               // Optional: user who commented
      "involves": "gaearon",                    // Optional: user involved in any way
      "mentions": "reactjs",                    // Optional: user mentioned in PR
      "review-requested": "sebmarkbage",        // Optional: user/team requested for review
      "reviewed-by": "sebmarkbage",             // Optional: user who reviewed
      "team-mentions": "@facebook/react-core", // Optional: team mentions
      "label": ["bug", "authentication"],       // Optional: labels (single or array)
      "no-label": false,                        // Optional: PRs without labels
      "milestone": "v18.0.0",                   // Optional: milestone title
      "no-milestone": false,                    // Optional: PRs without milestones
      "project": "facebook/1",                  // Optional: project board
      "no-project": false,                      // Optional: PRs not in projects
      "no-assignee": false,                     // Optional: PRs without assignees
      "head": "feature-auth",                   // Optional: head branch filter
      "base": "main",                           // Optional: base branch filter
      "created": ">2023-01-01",                 // Optional: creation date filter
      "updated": "2023-01-01..2023-12-31",     // Optional: update date filter
      "closed": ">2023-06-01",                  // Optional: closed date filter
      "merged-at": "2023-01-01..2023-12-31",   // Optional: merged date filter
      "comments": ">5",                         // Optional: comment count filter
      "reactions": ">=10",                      // Optional: reaction count filter
      "interactions": "10..100",                // Optional: total interactions filter
      "merged": true,                           // Optional: merged state
      "draft": false,                           // Optional: draft state
      "locked": false,                          // Optional: locked state
      "review": "approved",                     // Optional: review status
      "checks": "success",                      // Optional: CI checks status
      "language": "javascript",                 // Optional: programming language
      "visibility": "public",                   // Optional: repository visibility
      "app": "dependabot",                      // Optional: GitHub App author
      "match": ["title", "body"],               // Optional: search scope
      "sort": "updated",                        // Optional: sort field
      "order": "desc",                          // Optional: sort order
      "limit": 30,                              // Optional: max results (1-100)
      "withComments": false,                    // Optional: include comment content (expensive)
      "getFileChanges": false                   // Optional: include file changes (expensive)
    }
  ],
  "verbose": false
}
```

#### Success Response Structure
```json
{
  "data": [
    {
      "queryId": "pr-search-1",
      "reasoning": "Find authentication-related PRs",
      "data": {
        "total_count": 8,
        "incomplete_results": false,
        "pull_requests": [
          {
            "id": 123456789,
            "number": 123,
            "title": "Fix authentication token validation",
            "url": "https://api.github.com/repos/facebook/react/pulls/123",
            "html_url": "https://github.com/facebook/react/pull/123",
            "state": "closed",
            "draft": false,
            "merged": true,
            "created_at": "2023-06-01T10:00:00Z",
            "updated_at": "2023-06-15T14:30:00Z",
            "closed_at": "2023-06-15T14:30:00Z",
            "merged_at": "2023-06-15T14:30:00Z",
            "user": {
              "login": "gaearon",
              "id": 810438,
              "avatar_url": "https://avatars.githubusercontent.com/u/810438?v=4",
              "html_url": "https://github.com/gaearon"
            },
            "assignees": [
              {
                "login": "sebmarkbage",
                "id": 63648,
                "avatar_url": "https://avatars.githubusercontent.com/u/63648?v=4",
                "html_url": "https://github.com/sebmarkbage"
              }
            ],
            "labels": [
              {
                "id": 1234567,
                "name": "bug",
                "color": "d73a4a",
                "description": "Something isn't working"
              },
              {
                "id": 2345678,
                "name": "authentication",
                "color": "0075ca",
                "description": "Authentication related issues"
              }
            ],
            "milestone": {
              "id": 3456789,
              "title": "v18.0.0",
              "description": "React 18 release",
              "state": "closed",
              "created_at": "2022-01-01T00:00:00Z",
              "updated_at": "2023-06-15T14:30:00Z",
              "due_on": "2023-07-01T00:00:00Z"
            },
            "head": {
              "ref": "feature-auth-fix",
              "sha": "abc123def456",
              "repo": {
                "id": 10270250,
                "name": "react",
                "full_name": "facebook/react",
                "owner": {
                  "login": "facebook",
                  "id": 69631
                },
                "private": false,
                "html_url": "https://github.com/facebook/react",
                "default_branch": "main"
              }
            },
            "base": {
              "ref": "main",
              "sha": "def456ghi789",
              "repo": {
                "id": 10270250,
                "name": "react",
                "full_name": "facebook/react",
                "owner": {
                  "login": "facebook",
                  "id": 69631
                },
                "private": false,
                "html_url": "https://github.com/facebook/react",
                "default_branch": "main"
              }
            },
            "body": "This PR fixes the authentication token validation logic by adding proper error handling and validation checks.",
            "comments": 8,
            "review_comments": 3,
            "commits": 2,
            "additions": 15,
            "deletions": 5,
            "changed_files": 2
          }
        ]
      },
      "metadata": {
        "resultCount": 8,
        "hasResults": true,
        "searchType": "success",
        "queryArgs": {                              // Always included for metadata
          "id": "pr-search-1",
          "query": "authentication fix",
          "state": "closed"
        }
      }
    }
  ],
  "meta": {
    "totalOperations": 1,
    "successfulOperations": 1,
    "failedOperations": 0
  },
  "hints": [
    "Focus on code changes rather than PR discussions for implementation details",
    "Use prNumber for direct PR access (most efficient)"
  ]
}
```


---

## Response Optimization Features

### Content Minification
All tools support content minification to reduce token usage:
- **Terser**: JavaScript/TypeScript files with advanced optimization
- **Conservative**: Python, YAML, indentation-sensitive languages  
- **Aggressive**: HTML, CSS, C-style languages with comment removal
- **JSON**: Proper JSON parsing and compression
- **Markdown**: Specialized handling preserving structure
- **General**: Plain text optimization

### Security Sanitization
All content is automatically sanitized to remove:
- API keys and tokens
- Credentials and secrets
- Potentially malicious patterns
- Sensitive information

### Verbose Mode
When `verbose: true` is specified:
- Original query parameters are included in results
- Additional metadata fields are preserved
- Debug information is provided
- Minification details are included

### Bulk Operations
All tools support bulk operations with:
- Up to 5-10 queries per request (varies by tool)
- Parallel processing for efficiency
- Individual error handling per query
- Consolidated hints and metadata

### Smart Hints System
All tools provide contextual hints for:
- **Error Recovery**: Specific guidance for different error types
- **Tool Navigation**: Strategic guidance for research workflows
- **Progressive Refinement**: Suggestions for iterative improvement
- **Implementation Focus**: Emphasis on code over documentation

---

## Best Practices

### Query Design
1. **Use descriptive IDs**: Help track results across bulk operations
2. **Include reasoning**: Document the purpose of each query
3. **Start broad, then narrow**: Use progressive refinement strategies
4. **Leverage bulk operations**: Process multiple related queries together

### Error Handling
1. **Check individual query results**: Bulk operations can have partial failures
2. **Follow hint suggestions**: Hints provide actionable recovery strategies
3. **Use fallback tools**: Switch tools based on error context

### Performance Optimization
1. **Enable minification**: Reduces token usage significantly
2. **Use partial content**: Fetch only needed sections of files
3. **Limit result counts**: Balance comprehensiveness with efficiency
4. **Cache results**: Tools implement intelligent caching strategies

### Research Workflows
1. **Repository Discovery**: Start with `github_search_repositories`
2. **Structure Analysis**: Use `github_view_repo_structure` for layout
3. **Code Discovery**: Apply `github_search_code` for specific patterns
4. **Deep Analysis**: Use `github_fetch_content` for implementation details
