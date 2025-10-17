# Octocode-MCP Documentation Index

Complete documentation for the Octocode-MCP Model Context Protocol server.

---

## 📚 Documentation Structure

### 1. [Main Documentation](./DOCUMENTATION.md)
**The complete reference guide**

Comprehensive documentation covering:
- Overview and key features
- Complete architecture breakdown
- All 5 tools with detailed parameters
- Core features (bulk operations, security, caching)
- Installation and setup
- Type definitions
- API integration details
- Configuration options
- Troubleshooting guide
- Performance tips

**Use this when:** You need detailed information about any aspect of the system.

---

### 2. [Quick Start Guide](./QUICK_START.md)
**Get running in 5 minutes**

Fast-track guide including:
- Installation steps
- GitHub token setup
- Basic usage examples
- Common workflows
- Tips for better results
- Error handling
- Debugging tips
- Common patterns

**Use this when:** You're new to Octocode-MCP and want to get started quickly.

---

### 3. [Architecture Document](./ARCHITECTURE.md)
**Deep dive into system design**

Technical architecture covering:
- System overview and layers
- Core principles
- Detailed layer breakdown
- Data flow diagrams
- Design patterns
- Performance considerations
- Security model
- Extensibility guide
- Testing strategy
- Monitoring & observability

**Use this when:** You need to understand the internal design, contribute code, or extend the system.

---

### 4. [Usage Guide](./USAGE_GUIDE.md)
**Practical examples and workflows**

Practical guide covering:
- MCP client configuration
- Tool-specific examples
- Progressive refinement workflows
- Research strategies
- Best practices

**Use this when:** You need practical examples for specific use cases.

---

### 5. [Authentication Guide](./AUTHENTICATION.md)
**GitHub token setup and troubleshooting**

Detailed authentication documentation:
- Token creation steps
- Required permissions
- Environment configuration
- Common authentication errors
- Rate limits and quotas
- Enterprise setup

**Use this when:** You have authentication issues or need to set up tokens.

---

## 🎯 Quick Navigation

### By Topic

#### **Getting Started**
1. [Quick Start Guide](./QUICK_START.md) - Get running fast
2. [Installation](./DOCUMENTATION.md#installation) - Detailed setup
3. [Configuration](./DOCUMENTATION.md#configuration-options) - Environment setup

#### **Using the Tools**
1. [Tool Overview](./DOCUMENTATION.md#available-tools) - All 5 tools
2. [Search Code](./DOCUMENTATION.md#1-githubsearchcode) - Code search tool
3. [Search Repositories](./DOCUMENTATION.md#2-githubsearchrepositories) - Repo discovery
4. [Fetch Content](./DOCUMENTATION.md#3-githubgetfilecontent) - File reading
5. [View Structure](./DOCUMENTATION.md#4-githubviewrepostructure) - Repo exploration
6. [Search PRs](./DOCUMENTATION.md#5-githubsearchpullrequests) - PR analysis

#### **Advanced Features**
1. [Bulk Operations](./DOCUMENTATION.md#bulk-operations) - Parallel queries
2. [Security Layer](./DOCUMENTATION.md#security-layer) - Content sanitization
3. [Caching System](./DOCUMENTATION.md#caching-system) - Performance optimization
4. [Error Handling](./DOCUMENTATION.md#error-handling) - Resilient operations

#### **Development**
1. [Architecture](./ARCHITECTURE.md) - System design
2. [Type Definitions](./DOCUMENTATION.md#type-definitions) - TypeScript types
3. [Extending the System](./ARCHITECTURE.md#extensibility) - Adding features
4. [Testing Strategy](./ARCHITECTURE.md#testing-strategy) - Testing guide

#### **Troubleshooting**
1. [Common Issues](./DOCUMENTATION.md#troubleshooting) - Problem solving
2. [Authentication Errors](./AUTHENTICATION.md) - Token issues
3. [Performance Tips](./DOCUMENTATION.md#performance-tips) - Optimization
4. [Debugging](./QUICK_START.md#9-debugging) - Debug tools

---

## 📖 Documentation by User Type

### **New Users**
Start here:
1. ✅ [Quick Start Guide](./QUICK_START.md)
2. ✅ [Tool Overview](./DOCUMENTATION.md#available-tools)
3. ✅ [Common Workflows](./QUICK_START.md#6-common-workflows)
4. ✅ [Authentication Setup](./AUTHENTICATION.md)

### **Integration Developers**
Focus on:
1. 🔧 [Installation](./DOCUMENTATION.md#installation)
2. 🔧 [Configuration Options](./DOCUMENTATION.md#configuration-options)
3. 🔧 [API Integration](./DOCUMENTATION.md#api-integration)
4. 🔧 [Error Handling](./DOCUMENTATION.md#error-handling)

### **Contributing Developers**
Essential reading:
1. 💻 [Architecture Document](./ARCHITECTURE.md)
2. 💻 [Development Guide](./DOCUMENTATION.md#development)
3. 💻 [Extensibility Guide](./ARCHITECTURE.md#extensibility)
4. 💻 [Testing Strategy](./ARCHITECTURE.md#testing-strategy)

### **AI/ML Engineers**
Key sections:
1. 🤖 [Bulk Operations](./DOCUMENTATION.md#bulk-operations)
2. 🤖 [Contextual Hints](./DOCUMENTATION.md#contextual-hints)
3. 🤖 [Progressive Refinement](./QUICK_START.md#6-common-workflows)
4. 🤖 [Type Definitions](./DOCUMENTATION.md#type-definitions)

### **DevOps/Infrastructure**
Important topics:
1. ⚙️ [Configuration](./DOCUMENTATION.md#configuration-options)
2. ⚙️ [Performance Considerations](./ARCHITECTURE.md#performance-considerations)
3. ⚙️ [Monitoring & Observability](./ARCHITECTURE.md#monitoring--observability)
4. ⚙️ [Caching System](./DOCUMENTATION.md#caching-system)

---

## 🔍 Search Guide

### Common Questions

**Q: How do I install and set up Octocode-MCP?**  
→ [Quick Start Guide](./QUICK_START.md) or [Installation](./DOCUMENTATION.md#installation)

**Q: What tools are available?**  
→ [Available Tools](./DOCUMENTATION.md#available-tools)

**Q: How do I search for code in GitHub?**  
→ [githubSearchCode](./DOCUMENTATION.md#1-githubsearchcode)

**Q: How do bulk operations work?**  
→ [Bulk Operations](./DOCUMENTATION.md#bulk-operations)

**Q: How is security handled?**  
→ [Security Layer](./DOCUMENTATION.md#security-layer) or [Security Model](./ARCHITECTURE.md#security-model)

**Q: Why am I getting authentication errors?**  
→ [Authentication Guide](./AUTHENTICATION.md) or [Troubleshooting](./DOCUMENTATION.md#troubleshooting)

**Q: How do I optimize performance?**  
→ [Performance Tips](./DOCUMENTATION.md#performance-tips) or [Performance Considerations](./ARCHITECTURE.md#performance-considerations)

**Q: How do I add a new tool?**  
→ [Adding New Tools](./ARCHITECTURE.md#adding-new-tools)

**Q: What's the system architecture?**  
→ [Architecture Document](./ARCHITECTURE.md)

**Q: How do I debug issues?**  
→ [Debugging](./QUICK_START.md#9-debugging) or [Troubleshooting](./DOCUMENTATION.md#troubleshooting)

---

## 📋 Cheat Sheet

### Quick Reference

#### Installation
```bash
npm install octocode-mcp
# Set GITHUB_TOKEN in .env
octocode-mcp
```

#### Basic Tool Usage
```typescript
// Search code
{ keywordsToSearch: ["term"], owner: "owner", repo: "repo" }

// Search repos
{ topicsToSearch: ["topic"], stars: ">100" }

// Fetch content
{ owner: "owner", repo: "repo", path: "file.ts", matchString: "function" }

// View structure
{ owner: "owner", repo: "repo", branch: "main", depth: 2 }

// Search PRs
{ owner: "owner", repo: "repo", state: "closed", merged: true }
```

#### Bulk Operations
```typescript
{
  queries: [
    { keywordsToSearch: ["auth"], path: "src/auth" },
    { keywordsToSearch: ["api"], path: "src/api" }
  ]
}
```

#### Common Filters
```typescript
// Code search filters
extension: "ts"
path: "src/components"
filename: "config"
stars: ">1000"
limit: 10

// Repo search filters
topicsToSearch: ["mcp"]
stars: ">100"
sort: "stars"
created: ">=2023-01-01"

// Content fetch modes
fullContent: true                      // Full file
startLine: 1, endLine: 50              // Line range
matchString: "export", matchStringContextLines: 10  // Pattern match
```

---

## 🔗 External Resources

### GitHub
- **Repository**: https://github.com/bgauryy/octocode-mcp
- **Issues**: https://github.com/bgauryy/octocode-mcp/issues
- **Releases**: https://github.com/bgauryy/octocode-mcp/releases

### Official Links
- **Homepage**: https://octocode.ai
- **NPM Package**: https://www.npmjs.com/package/octocode-mcp
- **License**: MIT

### MCP Protocol
- **MCP Specification**: https://modelcontextprotocol.io
- **MCP SDK**: https://github.com/modelcontextprotocol/sdk

### GitHub API
- **GitHub REST API**: https://docs.github.com/en/rest
- **GitHub Search**: https://docs.github.com/en/search-github
- **Rate Limits**: https://docs.github.com/en/rest/overview/resources-in-the-rest-api#rate-limiting

---

## 📝 Document Status

| Document | Status | Last Updated | Version |
|----------|--------|--------------|---------|
| [Main Documentation](./DOCUMENTATION.md) | ✅ Complete | Oct 2024 | 7.0.0 |
| [Quick Start](./QUICK_START.md) | ✅ Complete | Oct 2024 | 7.0.0 |
| [Architecture](./ARCHITECTURE.md) | ✅ Complete | Oct 2024 | 7.0.0 |
| [Authentication](./AUTHENTICATION.md) | ⚠️ Pending | - | - |
| [Usage Guide](./USAGE_GUIDE.md) | ℹ️ See README | - | - |

---

## 🤝 Contributing to Documentation

Found an issue or want to improve the docs?

1. **Report Issues**: Open an issue on GitHub
2. **Suggest Improvements**: Submit a PR with your changes
3. **Ask Questions**: Use GitHub Discussions

### Documentation Guidelines
- Keep it clear and concise
- Include practical examples
- Update all relevant sections
- Maintain consistent formatting
- Test all code examples

---

## 📊 Documentation Metrics

- **Total Pages**: 4 main documents
- **Estimated Reading Time**: 
  - Quick Start: 10 minutes
  - Main Documentation: 45 minutes
  - Architecture: 30 minutes
  - Complete: ~90 minutes

---

## 🎓 Learning Path

### Beginner → Intermediate → Advanced

**Beginner (Week 1)**
1. Read [Quick Start Guide](./QUICK_START.md)
2. Try basic examples
3. Understand tool parameters
4. Learn common workflows

**Intermediate (Week 2-3)**
1. Read [Main Documentation](./DOCUMENTATION.md)
2. Master bulk operations
3. Optimize queries
4. Handle errors effectively

**Advanced (Week 4+)**
1. Study [Architecture](./ARCHITECTURE.md)
2. Understand internal design
3. Contribute improvements
4. Build custom extensions

---

**Documentation Version:** 7.0.0  
**Last Updated:** October 2024

For questions or feedback: bgauryy@gmail.com

