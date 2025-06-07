import { TOOL_NAMES } from '../../contstants';

export const SEARCH_GITHUB_USERS_DESCRIPTION = `Advanced GitHub users and organizations search for developer discovery.

**SEARCH STRATEGY:**
1. **Single Criteria First**: "react", "python", location
2. **Then Combine**: "react javascript", location + language
3. **Never Start Complex**: Avoid "senior react typescript developer with 5+ years"

**CORE PURPOSE:**
- Expert discovery and community building
- Collaboration and learning opportunities
- Recruitment and network expansion

**SEARCH METHODOLOGY:**
- **Phase 1**: Technology terms ("react", "python", "kubernetes") -> analyze activity
- **Phase 2**: Add context (location filters, experience indicators)
- **Phase 3**: Specialized search (specific skills + activity filters)

**RESULT TARGETS:**
- 0 results: Try broader terms, remove filters
- 1-20 results: IDEAL - Analyze profiles for expertise
- 21-100 results: GOOD - Add location or activity filters
- 100+ results: Add specific terms or increase follower/repo filters

**TERM SELECTION:**
- Technology: "javascript", "python", "golang", "rust"
- Frameworks: "react", "vue", "django", "spring"
- Roles: "devops", "frontend", "backend", "fullstack"
- Context: "startup", "enterprise", "opensource"

**FILTERING STRATEGY:**
- Type: "user" for individuals, "org" for organizations
- Location: Find developers in specific regions
- Language: Search by primary programming language
- Followers: Find influential developers (">100", ">1000")
- Repos: Find active contributors (">10", ">50")
- Date: Recent activity or long-standing members

**DISCOVERY PATTERNS:**
- **Technology Experts**: Language + high follower count
- **Local Developers**: Location + technology
- **Open Source Contributors**: High repo count + specific tech
- **Industry Leaders**: Follower count + years of activity

**CROSS-REFERENCE STRATEGY:**
- Find repository contributors and maintainers
- Combine with ${TOOL_NAMES.SEARCH_GITHUB_REPOS} for project involvement
- Explore user repositories for learning opportunities

**OUTPUT:** Developer and organization discovery for networking, learning, and collaboration.`;
