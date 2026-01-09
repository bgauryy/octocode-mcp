---
name: octocode-generate
description: Scaffold apps with optimal tech stack
---

# Octocode Generate

Research-driven app scaffolding using Octocode MCP tools.

## Core Principle

```
MEASURE TWICE, CUT ONCE
```

1. **Research First**: Validate patterns before scaffolding
2. **Stack Selection**: Choose optimal framework based on requirements
3. **Green Build Required**: Scaffold must compile and run

## Flow

```
DISCOVERY → STACK → PLAN → RESEARCH → SCAFFOLD → VALIDATE
```

## Tools

| Tool | Purpose |
|------|---------|
| `localViewStructure` | **Analyze workspace context** (monorepo, existing configs) |
| `localGetFileContent` | **Read local conventions** (tsconfig, package.json) |
| `githubSearchRepositories` | Find template repos |
| `githubViewRepoStructure` | Explore structure |
| `githubSearchCode` | Find config patterns |
| `githubGetFileContent` | Read implementations |
| `packageSearch` | Check package info |

## Recommended Frameworks

### Fullstack
| Name | CLI Command | Best For |
|------|-------------|----------|
| Next.js | `npx create-next-app@latest` | React + SSR/SSG |
| T3 Stack | `npx create-t3-app@latest` | Type-safe fullstack |
| Remix | `npx create-remix@latest` | Web standards |
| Nuxt | `npx nuxi@latest init` | Vue + SSR |

### Frontend
| Name | CLI Command | Best For |
|------|-------------|----------|
| Vite | `npm create vite@latest` | Fast SPA |
| Angular | `npx @angular/cli new` | Enterprise SPA |

### Mobile
| Name | CLI Command | Best For |
|------|-------------|----------|
| Expo | `npx create-expo-app@latest` | React Native |

### Desktop
| Name | CLI Command | Best For |
|------|-------------|----------|
| Electron Vite | `npm create electron-vite` | Cross-platform |

### Backend
| Name | CLI Command | Best For |
|------|-------------|----------|
| NestJS | `npx @nestjs/cli new` | Enterprise API |
| Hono | `npm create hono@latest` | Edge/lightweight |
| Fastify | `npx fastify-cli generate` | High-perf Node |

## Execution Phases

### Phase 0: Discovery & Context
1. **Context Scan**:
   - Run `localViewStructure` to identify existing project type (Monorepo? Standalone?)
   - Check `package.json` / `tsconfig.json` for existing conventions (if in active workspace)
2. **Classify app type**: Fullstack | SPA | API | Mobile | Desktop
3. **Ask for references** (existing apps, designs, specs)
4. **Confirm package manager**: Match existing (`yarn` vs `npm`) or default to `npm`

**User Checkpoint**: If requirements unclear → STOP & ASK

### Phase 1: Stack Selection
**Selection Criteria**:
- Match app type to framework strengths
- Check framework freshness (avoid stale)
- Verify TypeScript support if required
- Consider deployment target (Vercel, AWS, etc.)

### Phase 2: Planning
Write plan with:
- Requirements summary
- Research tasks
- Scaffold steps
- Validation checklist

**User Checkpoint**: Present plan → Wait for approval

### Phase 3: Research
**Research Dimensions**:

| Dimension | Goal | Example Query |
|-----------|------|---------------|
| Official Examples | Canonical patterns | `owner="vercel" repo="next.js" path="examples"` |
| Popular Templates | Community patterns | `topics=["starter", "template"] stars=">1000"` |
| Integration Code | How libs connect | `filename="trpc" extension="ts" keywords=["createTRPCNext"]` |
| Config Files | Tooling setup | `filename="next.config" extension="mjs"` |

**Quality Guards**:
- Prefer repos updated within last 6 months
- Prefer repos with `stars` > 500
- Verify active maintenance (recent commits/PRs)

### Phase 4: Scaffold
**Execution Order**:
1. **Initialize**: Run framework CLI
2. **Install**: Add dependencies (from research)
3. **Configure**: Create/update config files
4. **Implement**: Add features using researched patterns

**Guidelines**:
- Follow researched patterns exactly
- Use explicit file paths
- Add TypeScript types
- Create `.env.example` (never commit secrets)
- Add essential comments for non-obvious code

### Phase 5: Validate
**Validation Gates (ALL MANDATORY)**:
- [ ] `npm run build` / `yarn build` - passes
- [ ] `npx tsc --noEmit` - no errors
- [ ] Dev server starts without errors
- [ ] All imports resolve
- [ ] No TypeScript `any` escapes

**Loop**: Fail → Fix → Re-validate until all gates pass

## Research Flows

| From | Need | Go To |
|------|------|-------|
| `localViewStructure` | Existing Patterns | `localGetFileContent` |
| `githubSearchRepositories` | Structure | `githubViewRepoStructure` |
| `githubSearchRepositories` | Patterns | `githubSearchCode` |
| `githubViewRepoStructure` | File content | `githubGetFileContent` |
| `githubSearchCode` | Full context | `githubGetFileContent` |
| `packageSearch` | Source code | `githubViewRepoStructure` |

## Confidence Framework

| Decision Type | Confidence Required | Action |
|---------------|---------------------|--------|
| Framework choice | HIGH (2+ sources) | Proceed |
| Config patterns | MED (1 quality source) | Proceed with note |
| Uncertain practice | LOW | Ask user |

## When to Skip Research

- Standard CLI defaults (Next.js app router, Vite React)
- User explicitly specified tech stack
- Common boilerplate (`.env.example`, `tsconfig.json` base)
- Trivial choices with no architectural impact

## Error Recovery

| Error | Action |
|-------|--------|
| Build fails | Fix imports/types, re-validate |
| Missing types | `npm i -D @types/{package}` |
| Version conflict | Research compatible versions |
| Config error | Research correct config pattern |
| CLI fails | Check framework docs via research |
