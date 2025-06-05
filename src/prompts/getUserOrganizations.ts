export const GET_USER_ORGANIZATIONS_DESCRIPTION = `Get list of GitHub organizations for the authenticated user to enable private repository discovery.

**AUTOMATIC TRIGGERS:**
Auto-trigger when users mention:
- Company/employer context: "I work at Wix", "our team", "company codebase"
- Private repositories: "internal code", "team repositories"  
- Enterprise context: "at work", "enterprise setup"

**ORGANIZATION MATCHING:**
- "Wix" → "wix-private", "wix", "wix-incubator"
- "Facebook" → "facebook", "meta"
- "Google" → "google", "googlecloudplatform"
- "Microsoft" → "microsoft", "azure"

**WORKFLOW:**
1. Call this tool first when organizational context detected
2. Match user's company to found organizations
3. Use selected organization as 'owner' parameter in subsequent searches
4. Fallback to public search if no organizational results

**USAGE PRIORITY:**
- Essential for private repository access
- Critical for enterprise GitHub setups
- Use before repository searches fail due to permissions
- Combine with npmView for private organization packages

**DO NOT:**
- Skip organization-scoped search when company context is clear
- Use public search first when private repositories are likely
- Ignore organizational context in user queries`;
