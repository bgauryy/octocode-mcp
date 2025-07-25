# Octocode-MCP Architecture Documentation

## Overview

**Octocode-MCP** is a Model Context Protocol (MCP) server that provides AI assistants with advanced GitHub repository analysis, code discovery, and npm package exploration capabilities. It's designed with a research-driven approach, emphasizing progressive refinement, security, and token efficiency.

## System Architecture

### Core Philosophy

The system follows key architectural principles:

1. **Research-Driven**: Define goals → broad discovery → narrow focus → cross-validate sources
2. **Progressive Refinement**: Start broad, then apply specific filters based on findings  
3. **Token Efficiency**: Content minification, partial file access, optimized responses
4. **Security First**: Content sanitization, input validation, malicious content detection
5. **Resilient Design**: Fallback mechanisms, error recovery, graceful degradation

### System Overview Flow

```mermaid
graph TB
    %% User Journey & System Overview
    User[AI Assistant/User] --> Research[Research Goal]
    Research --> Strategy{Choose Strategy}
    
    %% Three Main Research Strategies
    Strategy -->|Package Discovery| PkgFlow[Package-First Flow]
    Strategy -->|Code Analysis| CodeFlow[Code-First Flow] 
    Strategy -->|Repository Study| RepoFlow[Repo-First Flow]
    
    %% Package-First Flow
    PkgFlow --> PS[package_search<br/>Find NPM/Python packages]
    PS --> NPV[npm_view_package<br/>Detailed analysis]
    NPV --> GVR1[github_view_repo_structure<br/>Explore codebase]
    GVR1 --> GFC1[github_fetch_content<br/>Read key files]
    
    %% Code-First Flow  
    CodeFlow --> GSC[github_search_code<br/>Find implementations]
    GSC --> GFC2[github_fetch_content<br/>Study specific files]
    GFC2 --> GVR2[github_view_repo_structure<br/>Understand context]
    GVR2 --> GSPR[github_search_pull_requests<br/>See evolution]
    
    %% Repo-First Flow
    RepoFlow --> GSR[github_search_repositories<br/>Discover projects]
    GSR --> GVR3[github_view_repo_structure<br/>Explore structure]
    GVR3 --> GFC3[github_fetch_content<br/>Read documentation]
    GFC3 --> GSI[github_search_issues<br/>Check problems]
    
    %% Progressive Refinement Process
    subgraph Progressive["Progressive Refinement Engine"]
        Phase1[Phase 1: Discovery<br/>Broad search, minimal filters]
        Phase2[Phase 2: Context<br/>Analyze findings, understand structure]
        Phase3[Phase 3: Targeted<br/>Apply specific filters]
        Phase4[Phase 4: Deep-dive<br/>Detailed analysis]
        
        Phase1 --> Phase2 --> Phase3 --> Phase4
    end
    
    %% All flows go through progressive refinement
    GFC1 --> Progressive
    GSPR --> Progressive
    GSI --> Progressive
    
    %% Smart Fallbacks & Error Recovery
    Progressive --> Fallback{Need Fallbacks?}
    Fallback -->|Yes| Alt[Alternative Tools<br/>Broader scope<br/>Different approach]
    Fallback -->|No| Results[Research Results]
    Alt --> Progressive
    
    %% Results Processing
    Results --> Insights[Extracted Insights<br/>- Patterns<br/>- Trade-offs<br/>- Design decisions<br/>- Best practices]
    
    %% Cross-validation
    Insights --> Validate[Cross-validate Sources<br/>Multiple tools & data types]
    Validate --> Final[Final Report<br/>Comprehensive understanding]
    
    %% System Support Services
    subgraph Support["System Support Services"]
        Cache[24h Caching<br/>Performance optimization]
        Security[Security Layer<br/>Content sanitization]
        Minify[Content Minification<br/>Token efficiency]
        Auth[Authentication<br/>api_status_check]
    end
    
    %% All operations use support services
    PS -.-> Support
    GSC -.-> Support
    GSR -.-> Support
    
    %% Quality Assurance
    Final --> QA[Quality Assurance<br/>✓ Verified sources only<br/>✓ No hallucination<br/>✓ Security filtered<br/>✓ Token optimized]
    
    QA --> User
    
    %% System Health Monitoring
    subgraph Health["System Health"]
        ErrorRecovery[Error Recovery<br/>Graceful degradation]
        RateLimit[Rate Limit Handling<br/>Smart backoffs]
        Monitoring[Connection Monitoring<br/>GitHub/NPM status]
    end
    
    Support -.-> Health
    
    %% Styling
    classDef strategy fill:#e1f5fe
    classDef tools fill:#f3e5f5
    classDef process fill:#e8f5e8
    classDef quality fill:#fff3e0
    classDef support fill:#fce4ec
    
    class PkgFlow,CodeFlow,RepoFlow strategy
    class PS,NPV,GSC,GSR,GVR1,GVR2,GVR3,GFC1,GFC2,GFC3,GSPR,GSI tools
    class Progressive,Fallback,Validate process
    class QA,Insights,Final quality
    class Support,Health support
```

### Architecture Components

#### 1. **Entry Point & Server** (`src/index.ts`)
- **MCP Server Initialization**: Sets up Model Context Protocol server
- **Tool Registration**: Registers all 10 tools with error handling
- **Graceful Shutdown**: Handles process signals and cleanup (cache clearing)
- **Error Recovery**: Continues operation even if individual tools fail

#### 2. **Security Layer** (`src/security/`)

**Content Sanitizer** (`contentSanitizer.ts`):
- **Secret Detection**: Identifies and redacts API keys, tokens, credentials
- **Content Filtering**: Removes potentially malicious patterns  
- **Length Limits**: Enforces 1MB max content, 10K max line length
- **Parameter Validation**: Sanitizes all user inputs

**Regex Patterns** (`regexes.ts`):
- Pattern library for detecting various secret types
- Used for content sanitization across all tools

#### 3. **Content Optimization** (`src/utils/minifier.ts`)

**Multi-Strategy Minification**:
- **Terser**: JavaScript/TypeScript files with advanced optimization
- **Conservative**: Python, YAML, indentation-sensitive languages
- **Aggressive**: HTML, CSS, C-style languages with comment removal
- **JSON**: Proper JSON parsing and compression
- **Markdown**: Specialized handling preserving structure
- **General**: Plain text optimization

**File Type Detection**: 50+ file extensions with appropriate strategies

#### 4. **Caching System** (`src/utils/cache.ts`)
- **24-hour TTL**: Balances freshness with performance
- **1000 key limit**: Prevents unbounded memory growth
- **MD5 key generation**: Efficient cache key creation from parameters
- **Success-only caching**: Only caches successful responses

#### 5. **Tool Architecture** (`src/mcp/tools/`)

**Base Command Builder** (`utils/BaseCommandBuilder.ts`):
- Abstract base class for all CLI command construction
- Handles query formatting, flag management, parameter normalization
- Supports both GitHub and NPM command types

**Tool Relationships** (`utils/toolRelationships.ts`):
- Defines interconnections between tools
- Provides fallback suggestions based on context
- Enables progressive refinement workflows

**Security Validation Wrapper** (`utils/withSecurityValidation.ts`):
- Applied to all tools for consistent security
- Input parameter sanitization
- Content filtering before response

### Tool Categories

#### **GitHub Analysis Tools**
1. **`github_search_code`**: Code search with progressive refinement strategy
2. **`github_fetch_content`**: File content retrieval with partial access
3. **`github_search_repositories`**: Repository discovery and exploration
4. **`github_search_commits`**: Commit history and change analysis
5. **`github_search_pull_requests`**: PR analysis with optional diff content
6. **`github_search_issues`**: Issue tracking and bug analysis
7. **`github_view_repo_structure`**: Repository structure exploration

#### **Package Management Tools**
8. **`package_search`**: NPM and Python package discovery
9. **`npm_view_package`**: Detailed NPM package information

#### **Infrastructure Tools**
10. **`api_status_check`**: GitHub/NPM connection verification

## Data Flow Architecture

### Request Processing Flow
1. **Input Validation**: Zod schema validation for all parameters
2. **Security Check**: Parameter sanitization and validation
3. **Cache Lookup**: Check for existing cached results
4. **Command Building**: Construct CLI commands using BaseCommandBuilder
5. **Execution**: Execute commands with error handling
6. **Content Processing**: Minification and optimization
7. **Security Filtering**: Final content sanitization
8. **Response Caching**: Cache successful responses
9. **Client Response**: Return optimized, secure results

### Error Handling & Fallbacks
- **Tool-level**: Individual tools have built-in error recovery
- **Command-level**: Multiple retry strategies and alternative approaches
- **Content-level**: Graceful degradation when minification fails
- **System-level**: Server continues operation despite individual tool failures

## Research Strategy Implementation

### Progressive Refinement Pattern
```
Phase 1: DISCOVERY
- Broad search with minimal filters
- Understand codebase structure

Phase 2: CONTEXT  
- Analyze initial results
- Identify relevant patterns

Phase 3: TARGETED
- Apply specific filters based on findings
- Focus on relevant code sections

Phase 4: DEEP-DIVE
- Detailed analysis of specific files
- Cross-reference findings
```

### Multi-Tool Workflows
Tools are designed to work together through defined relationships:
- **Prerequisites**: Tools that should be run first
- **Next Steps**: Logical follow-up tools
- **Fallbacks**: Alternative tools when primary fails

### Smart Fallbacks
Each tool provides context-aware fallback suggestions:
- No results → broader search scope
- Access denied → authentication check
- Rate limits → alternative approaches

## Security Implementation

### Content Sanitization
- **Multi-layer approach**: Input validation + output filtering
- **Pattern-based detection**: Comprehensive regex library for secrets
- **Safe defaults**: Conservative approach to unknown content

### Input Validation
- **Schema validation**: Zod-based parameter validation
- **Parameter sanitization**: Remove potentially dangerous characters
- **Length limits**: Prevent resource exhaustion attacks

### Output Security
- **Content filtering**: Remove sensitive information from responses
- **Minification safety**: Preserve functionality while reducing tokens
- **Warning system**: Alert users to potential security issues

## Performance Optimizations

### Token Efficiency
- **Smart minification**: File-type-aware compression strategies
- **Partial content**: Range-based file reading
- **Structured responses**: Optimized data formats
- **Content deduplication**: Avoid redundant information

### Caching Strategy
- **Intelligent expiration**: 24-hour TTL balances freshness/performance
- **Selective caching**: Only cache successful operations
- **Memory management**: 1000 key limit prevents unbounded growth

### Response Optimization
- **Structured data**: Consistent, predictable response formats
- **Minimal overhead**: Remove unnecessary metadata
- **Compressed content**: Reduce token usage without losing information

## Engineering Excellence

The system is built on five core engineering pillars that ensure robust, secure, and maintainable code:

```mermaid
graph TB
    %% Engineering Excellence Overview
    subgraph Excellence["Engineering Excellence Pillars"]
        Security[🔒 Security First<br/>Multi-layer protection]
        Performance[⚡ High Performance<br/>Token & memory optimized]  
        Reliability[🛡️ Reliability<br/>Fault tolerance & recovery]
        Quality[✨ Code Quality<br/>TypeScript, testing, linting]
        Maintainability[🔧 Maintainability<br/>Modular, documented, extensible]
    end
    
    %% Security Engineering
    Security --> SecArch[Security Architecture]
    SecArch --> InputVal[Input Validation<br/>Zod schemas + sanitization]
    SecArch --> SecretScan[Secret Detection<br/>50+ pattern library]
    SecArch --> SafeDefaults[Safe Defaults<br/>Conservative approach]
    SecArch --> OutputFilter[Output Filtering<br/>Content sanitization]
    
    %% Performance Engineering
    Performance --> PerfArch[Performance Architecture]
    PerfArch --> Caching[Intelligent Caching<br/>24h TTL, 1000 keys, MD5]
    PerfArch --> Minification[Smart Minification<br/>6 strategies, 50+ file types]
    PerfArch --> PartialAccess[Partial Content Access<br/>Line ranges, context control]
    PerfArch --> ParallelOps[Parallel Operations<br/>Multi-query support]
    
    %% Reliability Engineering  
    Reliability --> RelArch[Reliability Architecture]
    RelArch --> ErrorHandling[4-Layer Error Handling<br/>Tool→Command→Content→System]
    RelArch --> Fallbacks[Smart Fallbacks<br/>Context-aware alternatives]
    RelArch --> GracefulDeg[Graceful Degradation<br/>Continue on partial failures]
    RelArch --> HealthChecks[Health Monitoring<br/>Connection validation]
    
    %% Quality Engineering
    Quality --> QualArch[Quality Architecture]
    QualArch --> TypeSafety[Type Safety<br/>TypeScript + Zod validation]
    QualArch --> Testing[Comprehensive Testing<br/>Vitest + coverage reports]
    QualArch --> Linting[Code Standards<br/>ESLint + Prettier]
    QualArch --> Documentation[Living Documentation<br/>Architecture + API docs]
    
    %% Maintainability Engineering
    Maintainability --> MaintArch[Maintainability Architecture]
    MaintArch --> Modularity[Modular Design<br/>BaseCommandBuilder pattern]
    MaintArch --> Abstraction[Clean Abstractions<br/>Security wrapper, tool relationships]
    MaintArch --> Extensibility[Easy Extension<br/>Plugin architecture for new tools]
    MaintArch --> Standards[Coding Standards<br/>Consistent patterns across tools]
    
    %% Technical Implementation Patterns
    subgraph Patterns["Core Engineering Patterns"]
        Builder[Builder Pattern<br/>Command construction]
        Factory[Factory Pattern<br/>Tool registration]
        Strategy[Strategy Pattern<br/>Minification approaches]
        Decorator[Decorator Pattern<br/>Security validation wrapper]
        Observer[Observer Pattern<br/>Error handling chains]
    end
    
    %% Pattern Applications
    MaintArch --> Patterns
    
    %% Quality Gates & Metrics
    subgraph Gates["Quality Gates"]
        BuildGate[Build Gate<br/>TypeScript compilation]
        TestGate[Test Gate<br/>Unit + integration tests] 
        LintGate[Lint Gate<br/>Code quality checks]
        SecurityGate[Security Gate<br/>Vulnerability scanning]
        PerfGate[Performance Gate<br/>Token efficiency validation]
    end
    
    QualArch --> Gates
    
    %% Operational Excellence
    subgraph Operations["Operational Excellence"]
        Monitoring[System Monitoring<br/>Health checks, rate limits]
        Logging[Structured Logging<br/>Error tracking, debugging]
        Deployment[Safe Deployment<br/>NPM + DXT distribution]
        Rollback[Rollback Strategy<br/>Version management]
    end
    
    RelArch --> Operations
    
    %% Research Engineering Methodology
    subgraph Research["Research Engineering"]
        DataDriven[Data-Driven Decisions<br/>Real GitHub/NPM data only]
        Progressive[Progressive Refinement<br/>Broad → narrow → validate]
        MultiSource[Multi-Source Validation<br/>Cross-reference findings]
        PatternExtraction[Pattern Extraction<br/>Design decisions & trade-offs]
    end
    
    %% Engineering Culture & Practices
    subgraph Culture["Engineering Culture"]
        NoHallucination[No Hallucination<br/>Verified sources only]
        SecurityMindset[Security Mindset<br/>Threat modeling, safe coding]
        PerformanceFirst[Performance First<br/>Token efficiency priority]  
        UserCentric[User-Centric<br/>AI assistant experience]
        ContinuousImprovement[Continuous Improvement<br/>Iterative enhancement]
    end
    
    %% Everything flows to engineering outcomes
    Gates --> Outcomes[Engineering Outcomes]
    Operations --> Outcomes
    Research --> Outcomes
    Culture --> Outcomes
    
    Outcomes --> Benefits[System Benefits<br/>🚀 Fast & efficient research<br/>🔒 Secure by design<br/>📊 Reliable insights<br/>🛠️ Easy to maintain<br/>📈 Continuously improving]
    
    %% Technology Stack Integration
    subgraph Stack["Technology Integration"]
        MCP[MCP Protocol<br/>Standard AI interface]
        NodeJS[Node.js Ecosystem<br/>Rich tooling & libraries]
        CLI[CLI Integration<br/>GitHub CLI + NPM CLI]
        TypeScript[TypeScript<br/>Developer experience]
    end
    
    Benefits --> Stack
    
    %% Styling
    classDef excellence fill:#e8f5e8
    classDef security fill:#ffebee  
    classDef performance fill:#e3f2fd
    classDef reliability fill:#fff3e0
    classDef quality fill:#f3e5f5
    classDef maintainability fill:#e0f2f1
    classDef patterns fill:#fce4ec
    classDef outcomes fill:#e1f5fe
    
    class Excellence excellence
    class Security,SecArch,InputVal,SecretScan,SafeDefaults,OutputFilter security
    class Performance,PerfArch,Caching,Minification,PartialAccess,ParallelOps performance
    class Reliability,RelArch,ErrorHandling,Fallbacks,GracefulDeg,HealthChecks reliability
    class Quality,QualArch,TypeSafety,Testing,Linting,Documentation quality
    class Maintainability,MaintArch,Modularity,Abstraction,Extensibility,Standards maintainability
    class Patterns,Builder,Factory,Strategy,Decorator,Observer patterns
    class Outcomes,Benefits outcomes
```

## Technology Stack

### Core Dependencies
- **@modelcontextprotocol/sdk**: MCP protocol implementation
- **zod**: Runtime type validation and schema definition
- **axios**: HTTP client for external API calls
- **node-cache**: In-memory caching solution

### Content Processing
- **terser**: JavaScript/TypeScript minification
- **clean-css**: CSS optimization
- **html-minifier-terser**: HTML compression

### Development & Quality
- **TypeScript**: Type safety and developer experience
- **ESLint + Prettier**: Code quality and formatting
- **Vitest**: Testing framework with coverage
- **Rollup**: Build system and bundling

## Deployment & Integration

### Distribution
- **NPM Package**: Easy installation and updates
- **DXT Extension**: Desktop integration capability
- **Docker Support**: Containerized deployment option

### Integration Points
- **MCP Protocol**: Standard interface for AI assistants
- **GitHub CLI**: Leverages official GitHub tooling
- **NPM CLI**: Uses standard npm commands
- **Standard I/O**: Communicates via stdin/stdout

## Future Extensibility

The architecture supports easy extension through:

1. **New Tools**: Add tools by implementing BaseCommandBuilder pattern
2. **Additional APIs**: Extend beyond GitHub/NPM with same patterns
3. **Security Enhancements**: Modular security layer for new threat vectors
4. **Performance Optimizations**: Pluggable caching and minification strategies

This architecture provides a robust, secure, and efficient foundation for AI-assisted code research and analysis. 