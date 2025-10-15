# Node.js/TypeScript Resources for AI Agents

> 650+ curated GitHub repositories organized into 13 specialized files for building production-ready Node.js/TypeScript applications

**For AI Agents:** Context resources for generating Node.js/TypeScript applications using octocode-mcp  
**Runtime:** All applications powered by Node.js - from simple POCs to production full-stack apps  
**Frontend:** React (preferred), plain HTML/CSS/JS, or any JavaScript framework  
**Mobile:** React Native (preferred) with Expo - all running on Node.js toolchain  
**Updated:** October 2025 with 2025 trends and decision guides

---

## 🎯 What's Covered

**Applications Powered by Node.js:**
- ✅ **Full-Stack Web Apps** - React, Next.js, Vite with Node.js backend
- ✅ **Mobile Apps** - React Native with Expo (iOS/Android) + Node.js backend
- ✅ **Native Desktop Apps** - Electron, Tauri with JavaScript/TypeScript
- ✅ **Simple POCs** - Plain HTML/CSS/JS served by Node.js or static
- ✅ **APIs & Backend Services** - Express, NestJS, Fastify, tRPC
- ✅ **Real-Time Apps** - WebSocket, Socket.io on Node.js
- ✅ **Serverless Functions** - Node.js on Vercel, AWS Lambda, Cloudflare Workers

**Tech Stack Focus:**
- **JavaScript/TypeScript** exclusively (no Python, Go, Java, etc.)
- **Node.js runtime** for all development, testing, building, and deployment
- **React preferred** for web UIs (but supports any JS framework)
- **React Native preferred** for mobile (but supports alternatives)
- **Modern tooling** optimized for Node.js ecosystem (Vite, Turborepo, Biome)

---

## 📁 File Structure (Optimized for AI Agents)

**Every file follows this structure:**

```
1. Quick Reference (at top)
   ├─ Start Here: Top 3-5 recommendations with star counts
   ├─ Decision Tables: Quick comparisons (Need | Choose | Why)
   └─ When to Choose: Clear selection criteria

2. Detailed Content
   ├─ Categories with ⚡ ESSENTIAL markers
   ├─ GitHub links + star counts
   └─ Use cases + "Why Essential" explanations

3. Ending: *Part of octocode-mcp resources collection*
```

**Why This Structure:**
- **Quick Reference first** = Instant answers for AI agents
- **Decision tables** = Fast comparisons without reading full content
- **No duplication** = Efficient token usage
- **Consistent format** = Easy parsing for AI models

---

## 📚 Resource Files (13 Total)

### 🚀 Getting Started

**[boilerplate_cli.md](./boilerplate_cli.md)** - ⚡ NEW! One-command project generators  
All CLI commands for scaffolding projects instantly  
`create-t3-app • create-next-app • create vite • Nx • Turborepo • Ignite • Hygen`

**[project-examples.md](./project-examples.md)** - Start here for new projects  
Full-stack templates, boilerplates, monorepo examples  
`T3 Stack • Bulletproof React • Cal.com • Supabase • Turborepo examples`

### 🎨 Frontend Development
**[frontend-libs.md](./frontend-libs.md)** - React ecosystem + React Native  
State management, UI components, forms, animations, 3D, mobile  
`Zustand • TanStack Query • Shadcn UI • React Hook Form • Framer Motion • React Native`

**[fullstack-frameworks.md](./fullstack-frameworks.md)** - Full-stack frameworks + charting  
Next.js, Vite, Remix, Astro, data visualization libraries  
`Next.js 15 • Vite • Material UI • ECharts • Recharts • Three.js`

### ⚙️ Backend Development
**[backend.md](./backend.md)** - Node.js backend frameworks + APIs  
REST, GraphQL, tRPC, validation, middleware, boilerplates  
`NestJS • Fastify • Express • tRPC • Zod • Joi • Node.js best practices`

**[auth.md](./auth.md)** - Authentication + authorization  
OAuth, JWT, passwordless, 2FA, session management, social login  
`NextAuth.js • Passport.js • SuperTokens • OAuth 2.1 • WebAuthn • JWT`

**[database.md](./database.md)** - ORMs + databases + caching  
Database clients, schema design, migrations, Redis caching  
`Prisma • TypeORM • PostgreSQL • MongoDB • Redis • node-cache`

### 🏗️ Architecture & Patterns
**[architecture.md](./architecture.md)** - System design + patterns  
Clean architecture, DDD, CQRS, scalability, microservices  
`System Design • Clean Architecture • DDD • Event Sourcing • Scalability`

### ✅ Quality & Security
**[testing.md](./testing.md)** - Testing frameworks + strategies  
Unit, integration, E2E testing, best practices  
`Vitest • Jest • Playwright • Cypress • React Testing Library • Best practices`

**[security.md](./security.md)** - Security libraries + best practices  
Middleware, validation, OWASP, secrets management  
`Helmet • CORS • Rate limiting • Zod/Joi • bcrypt • OWASP Top 10`

### 🤖 AI Integration
**[ai-agents.md](./ai-agents.md)** - AI agents + RAG + vector databases  
TypeScript AI frameworks, embeddings, reranking, multi-agent  
`Mastra • LlamaIndexTS • LangChain • Qdrant • TanStack AI • RAG patterns`

**[mcp-typescript.md](./mcp-typescript.md)** - Model Context Protocol + AI SDKs  
MCP servers, TypeScript AI, RAG systems, Claude/Anthropic  
`MCP SDK • Vercel AI • LangGraph • Vector DBs • Claude tools • RAG`

### 🛠️ Development Tools
**[tooling.md](./tooling.md)** - Developer tools + monorepo  
Linting, formatting, build tools, API testing, documentation  
`Biome • Turborepo • Vite • Hoppscotch • Storybook • ESLint • Prettier`

---

## 🎯 Quick Selection Guide

| Need | File | Top Picks |
|------|------|-----------|
| **Quick project start** | **boilerplate_cli.md** | **create-t3-app, create-next-app, create vite** |
| New project template | project-examples.md | T3 Stack, Bulletproof React |
| State management | frontend-libs.md | Zustand, TanStack Query |
| UI components | frontend-libs.md | Shadcn UI, Material UI |
| Backend framework | backend.md | NestJS, Fastify |
| Authentication | auth.md | NextAuth.js, Passport.js |
| Database/ORM | database.md | Prisma, TypeORM |
| Full-stack framework | fullstack-frameworks.md | Next.js 15, Vite+React |
| Testing | testing.md | Vitest, Playwright |
| Security | security.md | Helmet, Zod, OWASP guides |
| AI agents | ai-agents.md | Mastra, LangChain, Qdrant |
| MCP tools | mcp-typescript.md | MCP SDK, Vercel AI SDK |
| Dev tools | tooling.md | Biome, Turborepo |

---

## 🤖 AI Agent Usage

**How to use these resources:**

1. **Match user question** → Find appropriate file from Quick Selection Guide
2. **Read Quick Reference** → Get instant top picks and decision tables
3. **Use decision tables** → Compare options without reading full details
4. **Reference detailed content** → Deep dive when needed for specific requirements

**Example queries:**
- "Create a new project fast?" → boilerplate_cli.md → npx create-t3-app@latest
- "Best state management?" → frontend-libs.md Quick Reference → Zustand + TanStack Query
- "Which framework?" → fullstack-frameworks.md → Next.js 15 (95% of projects)
- "Authentication solution?" → auth.md → NextAuth.js or Passport.js

---

## 📱 Mobile & Native Applications (2025)

### React Native Mobile Stack (Preferred)
All mobile development powered by Node.js toolchain:

```
Frontend:  React Native + TypeScript
State:     Zustand + TanStack Query  
Backend:   tRPC + NestJS/Fastify (Node.js)
Database:  Prisma + PostgreSQL
Build:     Expo (EAS Build) - Node.js CLI
Testing:   Jest/Detox - runs on Node.js
```

**Key files:** frontend-libs.md, project-examples.md (T3 Turbo), backend.md, auth.md, testing.md

### Desktop Applications
**Electron** (frontend-libs.md) - Build cross-platform desktop apps with JavaScript/TypeScript  
**Tauri** (frontend-libs.md) - Lightweight alternative with web frontend + Rust backend

### Simple POCs & Static Sites
**Plain HTML/CSS/JS** - Traditional web development, served via Node.js or static hosting  
**Vite** (fullstack-frameworks.md) - Fast dev server for simple projects  
**Express** (backend.md) - Serve static files with Node.js  
**Astro** (fullstack-frameworks.md) - Static site generator with minimal JavaScript

All development, testing, and build tools run on Node.js regardless of target platform.

---

**Legend:** ⚡ ESSENTIAL | 🔗 GitHub link | ⭐ Star count

*Part of octocode-mcp resources collection*

