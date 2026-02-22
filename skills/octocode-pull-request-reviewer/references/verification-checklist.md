# Verification Checklist

<verification>
Before delivering review, ALL items MUST be checked:

**Target & Mode:**
- [ ] Review target determined (PR Mode or Local Mode)
- [ ] **Local Mode**: `ENABLE_LOCAL=true` verified (local tools responding)

**Phase Completion — PR Mode:**
- [ ] Phase 1: User asked for guidelines/context files
- [ ] Phase 2: PR metadata, diff, and comments fetched via Octocode MCP
- [ ] Phase 3: TL;DR summary presented, user checkpoint completed
- [ ] Phase 4: All search queries executed, flow impact analyzed (Full mode)
- [ ] Phase 5: Findings deduplicated, verified against guidelines
- [ ] Phase 6: Chat summary presented, user asked before doc creation

**Phase Completion — Local Mode:**
- [ ] Phase 1: User asked for guidelines/context files
- [ ] Phase 2: `git status` + `git diff` collected, changed files enumerated via local tools
- [ ] Phase 3: TL;DR summary (local template) presented, user checkpoint completed
- [ ] Phase 4: All search queries executed via `local*` + `lsp*` tools, flow impact analyzed (Full mode)
- [ ] Phase 5: Findings deduplicated, verified against guidelines
- [ ] Phase 6: Chat summary presented, user asked before doc creation

**Finding Quality:**
- [ ] All findings cite exact `file:line` locations
- [ ] Every finding has an actionable fix with code diff
- [ ] Confidence level (HIGH/MED) assigned to each finding
- [ ] Findings capped per Phase 5 limit
- [ ] No duplicates with existing PR comments (PR Mode only)
- [ ] Previous review comments verified for resolution (PR Mode only)

**Guidelines & Tools:**
- [ ] Guidelines loaded and applied throughout analysis (if provided)
- [ ] Guidelines Compliance section included in report (if guidelines loaded)
- [ ] All code research done via Octocode MCP tools (not shell commands for reading/searching)
- [ ] Flow impact analyzed for all modified functions (LSP tools in Local Mode)
- [ ] Security issues flagged prominently
</verification>
