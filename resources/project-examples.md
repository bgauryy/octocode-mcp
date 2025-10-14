# Full Stack Project Examples

> Real-world Node.js/TypeScript project structures for production-ready applications

**🎯 Purpose:** Reference architectures for AI agents using octocode-mcp to generate Node.js/TypeScript applications
**🤖 For:** AI agents and developers building production applications
**🌐 Focus:** Modern TypeScript/JavaScript stacks - Web + Mobile (Node.js)
**📱 Mobile:** React Native monorepo examples with shared codebase
**⚙️ Runtime:** All projects run on Node.js - builds, tests, development, deployment

**Last Updated:** October 13, 2025

---

## 🎯 Best for Application Generation

This file provides **complete project structures** to help AI agents:
1. **Scaffold full-stack applications** - Ready-to-use templates and boilerplates
2. **Choose architecture patterns** - Monorepo vs multi-repo, feature-based vs layer-based
3. **Reference real production apps** - Learn from battle-tested projects (Cal.com, Supabase)
4. **Understand modern stacks** - T3 Stack, Bulletproof React, Enterprise TypeScript

**Generation Priorities:**
- ⚡ **T3 Stack (Next.js)** - Fastest MVP with SSR/SEO + end-to-end type safety
- ⚡ **Bulletproof React (Vite)** - Fastest SPA development with scalable architecture
- ⚡ **Enterprise Stack** - Large-scale applications with microservices

**Build Tool Decision (2025 Standard):**
- 🚀 **Use Vite:** Pure client-side SPAs, internal tools, dashboards, rapid prototyping
- 🔍 **Use Next.js:** SSR/SEO required, marketing sites, blogs, e-commerce, content platforms

**Testing Framework (2025 Standard):**
- ✅ **Primary:** Vitest (faster, better DX, Vite-compatible)
- 🔄 **Alternative:** Jest (for legacy NestJS patterns only)
- 🎭 **E2E:** Playwright (modern, fast, reliable)

---

## Quick Reference

### Build Tool Selection Guide (2025)

| Your Project Type | Build Tool | Stack | Example |
|------------------|-----------|-------|---------|
| Marketing site, blog, e-commerce | **Next.js** | T3 Stack | Example 1 |
| Internal dashboard, admin panel | **Vite** | Bulletproof React | Example 2 |
| SPA with no SEO needs | **Vite** | Bulletproof React | Example 2 |
| Content-heavy site (CMS) | **Next.js** | T3 Stack | Example 1 |
| Rapid prototype (SPA) | **Vite** | Bulletproof + Vite | Example 2 |
| Enterprise with SSR | **Next.js** | NestJS + Next.js | Example 3 |
| Enterprise SPA | **Vite** | NestJS + Vite | Example 3 |

**Simple Rule:** Need SSR/SEO? → Next.js | Building SPA? → Vite

### Top 3 Project Templates for 2025

1. **⚡ ESSENTIAL - T3 Stack (create-t3-app)** - 35k+ GitHub stars
   - Best for: Rapid MVP development with SSR/SEO, type-safe full-stack apps
   - Stack: Next.js 15 + tRPC + Prisma + NextAuth + Tailwind
   - Build Tool: Next.js (use when SEO/SSR needed)
   - Testing: Vitest + Playwright
   - Why: Zero boilerplate, end-to-end type safety, massive community
   - Get started: `npx create-t3-app@latest`

2. **⚡ PRODUCTION-READY - Bulletproof React Architecture** - 28k+ GitHub stars
   - Best for: Scalable React SPAs with clear boundaries (no SSR needed)
   - Stack: Vite + React + Feature-based architecture + TypeScript
   - Build Tool: Vite (fastest dev experience for SPAs)
   - Testing: Vitest + Testing Library + MSW
   - Why: Battle-tested structure, lightning-fast HMR, enterprise-grade organization
   - Repository: github.com/alan2207/bulletproof-react

3. **⚡ PRODUCTION-READY - Next.js Enterprise Boilerplate** - 10k+ GitHub stars
   - Best for: High-performance enterprise apps with SSR/SEO
   - Stack: Next.js 15 + TypeScript + Tailwind + Drizzle ORM + Testing Suite
   - Build Tool: Next.js (SSR/SEO optimized)
   - Testing: Vitest + Playwright
   - Why: Production-ready with monitoring, testing, CI/CD configured
   - Repository: github.com/ixartz/Next-js-Boilerplate

### Project Structure Decision Guide

#### Monorepo vs Multi-Repo

**Choose Monorepo when:**
- Building multiple related apps (web + mobile + admin)
- Sharing significant code between frontend/backend
- Team needs atomic changes across multiple projects
- Want unified tooling, testing, and deployment
- **Tools:** Turborepo (preferred for Next.js), Nx (enterprise-grade), pnpm workspaces

**Choose Multi-Repo when:**
- Projects are independent with different lifecycles
- Teams are completely separate
- Different tech stacks per project
- Simpler deployment requirements

#### Feature-Based vs Layer-Based Structure

**Feature-Based (Recommended for 2025):**
```
src/
├── features/
│   ├── auth/           # Everything auth-related
│   ├── dashboard/      # Everything dashboard-related
│   └── profile/        # Everything profile-related
└── shared/            # Shared utilities
```

**Benefits:** Better scalability, clearer boundaries, easier to navigate, team ownership

**Layer-Based (Traditional):**
```
src/
├── components/        # All components
├── services/          # All services
└── utils/            # All utilities
```

**Benefits:** Simpler for small projects, familiar pattern

**2025 Best Practice:** Start feature-based. Use layers within features.

### Modern Stack Recommendations

#### Choosing Your Build Tool: Vite vs Next.js

**Use Vite when:**
- Building pure client-side SPAs
- Rapid prototyping and experimentation
- Micro-frontend architectures
- SSR/SEO is not a critical concern
- Want fastest dev server and hot module replacement
- Building internal tools or dashboards

**Use Next.js when:**
- Server-side rendering (SSR) required
- SEO is essential (marketing sites, blogs, e-commerce)
- Need static site generation (SSG) or incremental static regeneration (ISR)
- Building full-stack React applications
- Want zero-config deployment on Vercel
- Team projects with structured conventions

#### For Startups/MVPs (Speed Priority)

**Option A: With SSR/SEO (Marketing, Blog, E-commerce)**
- **Frontend:** Next.js 15 + React 19 + Tailwind CSS
- **Backend:** tRPC (type-safe APIs without overhead)
- **Database:** Prisma + PostgreSQL (Vercel Postgres or Supabase)
- **Auth:** NextAuth.js or Clerk
- **Testing:** Vitest + Testing Library + Playwright
- **Deployment:** Vercel (zero-config)
- **Example:** T3 Stack (Example 1)

**Option B: Client-Side SPA (Internal Tools, Dashboards)**
- **Frontend:** Vite + React 19 + Tailwind CSS
- **Backend:** tRPC or REST APIs
- **Database:** Prisma + PostgreSQL
- **Auth:** Clerk or custom JWT
- **Testing:** Vitest + Testing Library
- **Deployment:** Netlify, Vercel, or Cloudflare Pages
- **Example:** Bulletproof React with Vite (Example 2)

#### For Enterprise/Scale (Robustness Priority)
- **Frontend:** Next.js 15 or Vite + React 19 + TypeScript strict mode
- **Backend:** NestJS (modular, microservices-ready)
- **Database:** Prisma + PostgreSQL + Redis caching
- **Auth:** Passport.js with JWT + OAuth 2.0
- **Testing:** Vitest (unit/integration) + Playwright (E2E)
- **Deployment:** Kubernetes or AWS ECS
- **Example:** Enterprise TypeScript Stack (Example 3)

#### For Traditional Teams (Familiarity Priority)
- **Frontend:** Vite + React 19 + TypeScript
- **Backend:** Express.js + REST APIs
- **Database:** MongoDB + Mongoose or PostgreSQL + TypeORM
- **Auth:** Passport.js or JWT
- **Testing:** Vitest + Testing Library
- **Deployment:** Traditional cloud providers
- **Example:** Classic Full Stack (Example 4)

---

## 📋 Quick Navigation

- [Example 1: T3 Stack - Modern TypeScript Monorepo](#example-1-t3-stack---modern-typescript-monorepo)
- [Example 2: Bulletproof React - Feature-Based Architecture](#example-2-bulletproof-react---feature-based-architecture)
- [Example 3: Enterprise TypeScript Stack](#example-3-enterprise-typescript-stack)
- [Example 4: Classic Full Stack](#example-4-classic-full-stack)
- [Real-World Production Examples](#real-world-production-examples)
- [Choosing Your Stack](#choosing-your-stack)
- [Best Practices](#best-practices)

---

## Example 1: T3 Stack - Modern TypeScript Monorepo

### Stack: Next.js 15 + tRPC + Prisma + NextAuth + Tailwind + Turborepo

**⚡ ESSENTIAL - PRODUCTION-READY** - The most popular TypeScript full-stack starter for 2025

**GitHub:** create-t3-app (35,000+ stars) | **Created by:** Theo Browne & T3 OSS Community
**Live Example:** Cal.com (scheduling platform handling millions of users)

### Why This Example

- **Zero Boilerplate:** No REST/GraphQL layer needed - direct type-safe functions
- **End-to-End Type Safety:** Database to frontend with full IntelliSense
- **Fastest Time to Market:** Ships with auth, database, styling ready to go
- **Battle-Tested:** Powers production apps like Cal.com with real traffic
- **Modular:** Choose only what you need (tRPC, Prisma, auth, Tailwind)
- **Active Community:** Huge ecosystem, constant updates, extensive docs

### Project Structure

```
my-t3-app/
├── src/
│   ├── app/                          # Next.js 15 App Router
│   │   ├── (auth)/                   # Route groups
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   └── register/
│   │   │       └── page.tsx
│   │   ├── dashboard/
│   │   │   ├── page.tsx
│   │   │   └── layout.tsx
│   │   ├── api/                      # API Routes
│   │   │   └── trpc/[trpc]/
│   │   │       └── route.ts
│   │   ├── layout.tsx                # Root layout
│   │   └── page.tsx                  # Home page
│   │
│   ├── server/                       # tRPC Backend
│   │   ├── api/
│   │   │   ├── routers/              # tRPC routers
│   │   │   │   ├── user.ts           # User operations
│   │   │   │   ├── post.ts           # Post operations
│   │   │   │   └── auth.ts           # Auth operations
│   │   │   ├── root.ts               # Root router
│   │   │   └── trpc.ts               # tRPC setup
│   │   ├── auth.ts                   # NextAuth config
│   │   └── db.ts                     # Prisma client
│   │
│   ├── components/                   # React components
│   │   ├── ui/                       # UI components (shadcn/ui)
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   └── modal.tsx
│   │   └── features/                 # Feature components
│   │       ├── auth/
│   │       └── dashboard/
│   │
│   ├── hooks/                        # Custom React hooks
│   │   ├── use-session.ts
│   │   └── use-media-query.ts
│   │
│   ├── lib/                          # Utilities
│   │   ├── utils.ts                  # Helper functions
│   │   └── validators.ts             # Zod schemas
│   │
│   └── styles/                       # Global styles
│       └── globals.css
│
├── prisma/
│   ├── schema.prisma                 # Database schema
│   └── migrations/                   # Migration history
│
├── public/                           # Static assets
│
├── .env                              # Environment variables
├── .env.example
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

### For Monorepo (Turborepo Structure)

```
my-t3-monorepo/
├── apps/
│   ├── web/                          # Next.js web app (structure above)
│   ├── mobile/                       # React Native/Expo app
│   └── admin/                        # Admin dashboard
│
├── packages/
│   ├── ui/                           # Shared UI components
│   │   ├── src/
│   │   │   ├── button.tsx
│   │   │   └── card.tsx
│   │   └── package.json
│   │
│   ├── api/                          # Shared tRPC routers
│   │   ├── src/
│   │   │   └── routers/
│   │   └── package.json
│   │
│   ├── db/                           # Shared database
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   ├── src/
│   │   │   └── client.ts
│   │   └── package.json
│   │
│   ├── auth/                         # Shared auth config
│   │   └── src/
│   │       └── index.ts
│   │
│   └── config/                       # Shared configs
│       ├── eslint-config/
│       ├── typescript-config/
│       └── tailwind-config/
│
├── turbo.json                        # Turborepo config
├── package.json                      # Root package.json
└── pnpm-workspace.yaml               # PNPM workspaces
```

### Key Features

- **End-to-end Type Safety:** Type inference from database to frontend without code generation
- **Zero API Layer Overhead:** Call backend functions directly like regular functions
- **Optimized Builds:** Turborepo caches builds, only rebuilds what changed
- **Authentication Ready:** NextAuth.js pre-configured with multiple providers
- **Database Migrations:** Prisma handles schema changes safely
- **Modern React:** Server Components, Streaming, Suspense out of the box

### Technology Details

- **Frontend:** Next.js 15 with App Router, React 19, TypeScript strict mode
- **Styling:** Tailwind CSS 4 with shadcn/ui components
- **State Management:** React Server Components (minimal client state), TanStack Query (via tRPC)
- **API:** tRPC v11 for type-safe APIs without REST/GraphQL overhead
- **Database:** Prisma 6 with PostgreSQL/MySQL/SQLite
- **Auth:** NextAuth.js v5 (Auth.js) or Clerk
- **Testing:** Vitest + Testing Library + Playwright
- **Validation:** Zod for runtime type validation
- **Build Tool:** Turborepo for monorepos, standard Next.js otherwise
- **Dev Server:** Next.js dev server (optimized for App Router)

### Getting Started

```bash
# Create new T3 app with CLI
npx create-t3-app@latest

# Choose your stack interactively:
# ✓ tRPC
# ✓ Prisma
# ✓ NextAuth.js
# ✓ Tailwind CSS
```

### Deployment

- **All-in-one:** Vercel (recommended - zero config, optimal performance)
- **Database:** Vercel Postgres, Supabase, PlanetScale, Railway
- **Alternative:** Railway, Render, Fly.io for full-stack deployment

### Real-World Usage

- **Cal.com:** Open-source scheduling platform (10k+ stars)
- **Taxonomy:** App directory example by Vercel
- **Countless SaaS products:** MVPs and production apps worldwide

### Related Resources

- [Frontend Libraries](./frontend-libs.md) - Next.js 15, React 19, Tailwind
- [Backend Development](./backend.md) - tRPC, API design
- [Database & ORM](./database.md) - Prisma best practices
- [Tooling & Productivity](./tooling.md) - Turborepo, monorepos
- **Official Docs:** https://create.t3.gg/

---

## Example 2: Bulletproof React - Feature-Based Architecture

### Stack: React 19 + Feature-Based Structure + TypeScript + Modern Tooling

**⚡ PRODUCTION-READY** - Industry-standard architecture for scalable React applications

**GitHub:** bulletproof-react (28,000+ stars) | **Created by:** Alan Alickovic
**Philosophy:** Simple, scalable, powerful architecture for production-ready apps

### Why This Example

- **Feature-Based Organization:** Scales from small to massive applications
- **Clear Boundaries:** Unidirectional code flow (shared → features → app)
- **Proven Pattern:** Used by thousands of production applications
- **Framework Agnostic:** Works with Next.js, Vite, CRA, Remix
- **Best Practices Built-in:** Performance, testing, security patterns included
- **Maintainability Focus:** Easy to onboard developers, debug, and extend

### Project Structure

```
bulletproof-app/
├── src/
│   ├── app/                          # Application layer
│   │   ├── routes/                   # Route definitions
│   │   │   ├── index.tsx             # Public routes
│   │   │   ├── app.tsx               # Protected routes
│   │   │   └── auth.tsx              # Auth routes
│   │   ├── provider.tsx              # App providers (React Query, etc.)
│   │   └── router.tsx                # Router setup
│   │
│   ├── features/                     # Feature modules (core pattern)
│   │   ├── auth/                     # Authentication feature
│   │   │   ├── api/                  # API calls
│   │   │   │   ├── login.ts
│   │   │   │   └── register.ts
│   │   │   ├── components/           # Feature components
│   │   │   │   ├── LoginForm.tsx
│   │   │   │   └── RegisterForm.tsx
│   │   │   ├── hooks/                # Feature hooks
│   │   │   │   └── use-auth.ts
│   │   │   ├── stores/               # Feature state
│   │   │   │   └── auth-store.ts
│   │   │   ├── types/                # Feature types
│   │   │   │   └── index.ts
│   │   │   └── utils/                # Feature utils
│   │   │       └── validators.ts
│   │   │
│   │   ├── dashboard/                # Dashboard feature
│   │   │   ├── api/
│   │   │   │   └── get-stats.ts
│   │   │   ├── components/
│   │   │   │   ├── StatsCard.tsx
│   │   │   │   └── RecentActivity.tsx
│   │   │   ├── hooks/
│   │   │   │   └── use-stats.ts
│   │   │   └── types/
│   │   │       └── index.ts
│   │   │
│   │   ├── users/                    # Users feature
│   │   │   ├── api/
│   │   │   │   ├── get-users.ts
│   │   │   │   ├── create-user.ts
│   │   │   │   ├── update-user.ts
│   │   │   │   └── delete-user.ts
│   │   │   ├── components/
│   │   │   │   ├── UsersList.tsx
│   │   │   │   ├── UserForm.tsx
│   │   │   │   └── UserCard.tsx
│   │   │   ├── hooks/
│   │   │   │   ├── use-users.ts
│   │   │   │   └── use-user.ts
│   │   │   └── types/
│   │   │       └── index.ts
│   │   │
│   │   └── comments/                 # Comments feature
│   │       ├── api/
│   │       ├── components/
│   │       ├── hooks/
│   │       └── types/
│   │
│   ├── components/                   # Shared components
│   │   ├── ui/                       # UI primitives
│   │   │   ├── button/
│   │   │   │   ├── button.tsx
│   │   │   │   └── button.test.tsx
│   │   │   ├── input/
│   │   │   ├── modal/
│   │   │   └── card/
│   │   ├── form/                     # Form components
│   │   │   ├── FormField.tsx
│   │   │   └── FormError.tsx
│   │   └── layout/                   # Layout components
│   │       ├── Header.tsx
│   │       ├── Footer.tsx
│   │       └── Sidebar.tsx
│   │
│   ├── hooks/                        # Shared hooks
│   │   ├── use-disclosure.ts
│   │   ├── use-media-query.ts
│   │   └── use-debounce.ts
│   │
│   ├── lib/                          # Shared libraries
│   │   ├── api-client.ts             # API client (axios/fetch)
│   │   ├── query-client.ts           # React Query client
│   │   └── auth.ts                   # Auth utilities
│   │
│   ├── stores/                       # Global state
│   │   ├── theme-store.ts
│   │   └── notifications-store.ts
│   │
│   ├── types/                        # Shared types
│   │   ├── api.ts
│   │   └── common.ts
│   │
│   ├── utils/                        # Shared utilities
│   │   ├── format.ts
│   │   ├── validators.ts
│   │   └── helpers.ts
│   │
│   ├── config/                       # App configuration
│   │   ├── env.ts
│   │   └── constants.ts
│   │
│   └── test/                         # Test utilities
│       ├── setup.ts
│       ├── utils.tsx                 # Test helpers
│       └── mocks/                    # Mock data
│
├── public/                           # Static assets
│
├── .env                              # Environment variables
├── .env.example
├── vite.config.ts                    # or next.config.js
├── tsconfig.json
├── tailwind.config.ts
└── package.json
```

### Architecture Principles

**1. Unidirectional Flow:**
```
shared/ → features/ → app/
```
- Features can use shared code
- App can use features and shared code
- Features CANNOT import from other features directly
- Shared code CANNOT import from features or app

**2. Feature Isolation:**
Each feature is self-contained with its own:
- API calls
- Components
- Hooks
- Types
- State
- Utils

**3. Vertical Slicing:**
Features represent complete vertical slices of functionality, not technical layers.

### Key Features

- **Scalability:** Add features without touching existing code
- **Maintainability:** Clear boundaries make debugging easier
- **Team Collaboration:** Teams can own entire features
- **Testing:** Features can be tested in isolation
- **Performance:** Easy to lazy-load entire features
- **Code Reuse:** Shared layer for common functionality

### Technology Details

- **Build Tool:** Vite (recommended for SPAs) or Next.js (if SSR/SEO needed)
- **Framework:** React 19 with TypeScript strict mode
- **Styling:** Tailwind CSS or CSS Modules
- **State Management:**
  - React Query (server state)
  - Zustand or Context (client state)
- **Form Handling:** React Hook Form + Zod
- **Testing:** Vitest (preferred) + Testing Library + MSW (mock service worker)
- **Routing:** React Router v6+ (Vite) or Next.js App Router (Next.js)
- **API Client:** Axios or native fetch with wrapper
- **Dev Server:** Vite (lightning-fast HMR)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/alan2207/bulletproof-react.git

# Or start with the structure manually
# Follow the documentation at:
# https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md
```

### Best Practices Included

- **API Layer Abstraction:** All API calls in feature/api folders
- **Component Colocation:** Components close to where they're used
- **Custom Hooks:** Reusable logic extracted to hooks
- **Type Safety:** Full TypeScript with strict mode
- **Error Handling:** Consistent error boundaries
- **Loading States:** Suspense and loading patterns
- **Optimistic Updates:** React Query optimistic updates
- **Security:** Authentication, authorization patterns built-in

### When to Use Bulletproof React

**Perfect for:**
- Medium to large React applications
- Teams with multiple developers
- Long-term projects requiring maintainability
- When you need clear feature boundaries
- Applications expected to scale significantly

**Consider alternatives if:**
- Building a simple landing page or small app
- Prototyping an MVP very quickly (consider T3 Stack instead)
- Team is very small (2-3 developers) and familiar with simpler structures

### Related Resources

- [Frontend Libraries](./frontend-libs.md) - React patterns, component design
- [Testing](./testing.md) - Testing strategies for features
- **Official Docs:** https://github.com/alan2207/bulletproof-react

---

## Example 3: Enterprise TypeScript Stack

### Stack: NestJS + Next.js + Prisma + GraphQL + Redis + Microservices

**⚡ PRODUCTION-READY** - Best for large enterprise applications requiring ultimate scalability

**Use Case:** Multi-team organizations, microservices architecture, complex business logic

### Why This Example

- **Modular Architecture:** NestJS modules enforce clear separation of concerns
- **Microservices Ready:** Built-in support for splitting into microservices
- **Enterprise Patterns:** Dependency injection, guards, interceptors, pipes, filters
- **Scalability:** Handles high traffic with caching, queues, and horizontal scaling
- **Team Collaboration:** Multiple teams can work on different modules independently
- **Testing:** Dependency injection makes unit testing straightforward
- **Documentation:** Auto-generated OpenAPI/GraphQL schemas

### Project Structure

```
enterprise-stack/
├── apps/
│   ├── web/                          # Next.js Frontend
│   │   ├── src/
│   │   │   ├── app/                  # Next.js 15 App Router
│   │   │   │   ├── (auth)/           # Auth routes group
│   │   │   │   │   ├── login/
│   │   │   │   │   └── register/
│   │   │   │   ├── (dashboard)/      # Dashboard routes
│   │   │   │   │   ├── layout.tsx
│   │   │   │   │   ├── page.tsx
│   │   │   │   │   ├── users/
│   │   │   │   │   └── settings/
│   │   │   │   ├── layout.tsx
│   │   │   │   └── page.tsx
│   │   │   ├── components/
│   │   │   │   ├── ui/               # UI components
│   │   │   │   └── features/         # Feature components
│   │   │   ├── lib/
│   │   │   │   ├── apollo.ts         # Apollo Client
│   │   │   │   └── graphql/          # GraphQL operations
│   │   │   │       ├── queries/
│   │   │   │       ├── mutations/
│   │   │   │       └── fragments/
│   │   │   └── utils/
│   │   ├── public/
│   │   ├── next.config.js
│   │   └── package.json
│   │
│   ├── api/                          # NestJS Backend
│   │   ├── src/
│   │   │   ├── modules/              # Feature modules
│   │   │   │   ├── auth/
│   │   │   │   │   ├── auth.module.ts
│   │   │   │   │   ├── auth.service.ts
│   │   │   │   │   ├── auth.resolver.ts  # GraphQL
│   │   │   │   │   ├── auth.controller.ts # REST
│   │   │   │   │   ├── dto/
│   │   │   │   │   │   ├── login.dto.ts
│   │   │   │   │   │   └── register.dto.ts
│   │   │   │   │   ├── strategies/
│   │   │   │   │   │   ├── jwt.strategy.ts
│   │   │   │   │   │   └── local.strategy.ts
│   │   │   │   │   └── guards/
│   │   │   │   │       ├── jwt-auth.guard.ts
│   │   │   │   │       └── roles.guard.ts
│   │   │   │   │
│   │   │   │   ├── users/
│   │   │   │   │   ├── users.module.ts
│   │   │   │   │   ├── users.service.ts
│   │   │   │   │   ├── users.resolver.ts
│   │   │   │   │   ├── users.controller.ts
│   │   │   │   │   ├── dto/
│   │   │   │   │   ├── entities/
│   │   │   │   │   │   └── user.entity.ts
│   │   │   │   │   └── tests/
│   │   │   │   │       ├── users.service.spec.ts
│   │   │   │   │       └── users.resolver.spec.ts
│   │   │   │   │
│   │   │   │   ├── posts/
│   │   │   │   │   ├── posts.module.ts
│   │   │   │   │   ├── posts.service.ts
│   │   │   │   │   ├── posts.resolver.ts
│   │   │   │   │   └── dto/
│   │   │   │   │
│   │   │   │   ├── notifications/
│   │   │   │   │   ├── notifications.module.ts
│   │   │   │   │   ├── notifications.service.ts
│   │   │   │   │   ├── notifications.gateway.ts  # WebSocket
│   │   │   │   │   └── dto/
│   │   │   │   │
│   │   │   │   └── payments/          # Payment module
│   │   │   │       ├── payments.module.ts
│   │   │   │       ├── payments.service.ts
│   │   │   │       ├── payments.controller.ts
│   │   │   │       └── dto/
│   │   │   │
│   │   │   ├── common/               # Shared code
│   │   │   │   ├── decorators/       # Custom decorators
│   │   │   │   │   ├── current-user.decorator.ts
│   │   │   │   │   └── roles.decorator.ts
│   │   │   │   ├── filters/          # Exception filters
│   │   │   │   │   ├── http-exception.filter.ts
│   │   │   │   │   └── graphql-exception.filter.ts
│   │   │   │   ├── guards/           # Global guards
│   │   │   │   │   └── throttler.guard.ts
│   │   │   │   ├── interceptors/     # Interceptors
│   │   │   │   │   ├── logging.interceptor.ts
│   │   │   │   │   └── transform.interceptor.ts
│   │   │   │   ├── pipes/            # Validation pipes
│   │   │   │   │   └── validation.pipe.ts
│   │   │   │   └── middleware/
│   │   │   │       └── logger.middleware.ts
│   │   │   │
│   │   │   ├── database/             # Database module
│   │   │   │   ├── database.module.ts
│   │   │   │   └── prisma.service.ts
│   │   │   │
│   │   │   ├── cache/                # Cache module
│   │   │   │   ├── cache.module.ts
│   │   │   │   └── redis.service.ts
│   │   │   │
│   │   │   ├── queue/                # Queue module (Bull/BullMQ)
│   │   │   │   ├── queue.module.ts
│   │   │   │   └── processors/
│   │   │   │       ├── email.processor.ts
│   │   │   │       └── notifications.processor.ts
│   │   │   │
│   │   │   ├── config/               # Configuration
│   │   │   │   ├── app.config.ts
│   │   │   │   ├── database.config.ts
│   │   │   │   ├── redis.config.ts
│   │   │   │   └── validation.ts
│   │   │   │
│   │   │   ├── graphql/              # GraphQL setup
│   │   │   │   ├── schema.gql        # Generated schema
│   │   │   │   └── scalars/          # Custom scalars
│   │   │   │       └── date.scalar.ts
│   │   │   │
│   │   │   ├── app.module.ts         # Root module
│   │   │   └── main.ts               # Bootstrap
│   │   │
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── seed.ts               # Database seeding
│   │   │   └── migrations/
│   │   │
│   │   ├── test/                     # E2E tests
│   │   │   ├── app.e2e-spec.ts
│   │   │   ├── auth.e2e-spec.ts
│   │   │   └── jest-e2e.json
│   │   │
│   │   ├── .env
│   │   ├── .env.example
│   │   ├── nest-cli.json
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── admin/                        # Admin Dashboard (optional)
│       └── ...                       # Similar Next.js structure
│
├── packages/
│   ├── ui/                           # Shared UI components
│   │   ├── src/
│   │   │   ├── button/
│   │   │   ├── card/
│   │   │   ├── modal/
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── types/                        # Shared TypeScript types
│   │   ├── src/
│   │   │   ├── user.ts
│   │   │   ├── post.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── utils/                        # Shared utilities
│   │   ├── src/
│   │   │   ├── validators.ts
│   │   │   ├── formatters.ts
│   │   │   └── index.ts
│   │   └── package.json
│   │
│   ├── config/                       # Shared configs
│   │   ├── eslint-config/
│   │   ├── typescript-config/
│   │   └── tailwind-config/
│   │
│   └── database/                     # Shared database package
│       ├── prisma/
│       │   └── schema.prisma
│       ├── src/
│       │   └── client.ts
│       └── package.json
│
├── libs/                             # NestJS shared libraries
│   ├── shared/                       # Shared code between NestJS services
│   │   ├── src/
│   │   │   ├── interfaces/
│   │   │   ├── dto/
│   │   │   └── utils/
│   │   └── package.json
│   │
│   └── logger/                       # Custom logger library
│       ├── src/
│       └── package.json
│
├── docker/
│   ├── Dockerfile.web
│   ├── Dockerfile.api
│   └── docker-compose.yml
│
├── k8s/                              # Kubernetes configs
│   ├── web/
│   ├── api/
│   └── database/
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── deploy-web.yml
│       └── deploy-api.yml
│
├── nx.json                           # Nx configuration
├── turbo.json                        # or Turborepo
├── package.json
└── README.md
```

### Key Features

- **Modular Architecture:** Each module is self-contained with clear boundaries
- **Dependency Injection:** Built-in IoC container for better testability
- **Dual API Support:** GraphQL and REST in the same application
- **WebSocket Support:** Real-time features with WebSocket gateways
- **Caching Layer:** Redis integration for high-performance caching
- **Queue System:** Background jobs with Bull/BullMQ
- **Microservices Ready:** Easy transition to microservices architecture
- **Enterprise Patterns:** Guards, interceptors, pipes, filters, decorators
- **API Documentation:** Auto-generated Swagger/OpenAPI docs
- **Monitoring:** Built-in health checks, metrics, logging

### Technology Details

- **Frontend:** Next.js 15, React 19, Apollo Client, Tailwind CSS
- **Backend:** NestJS 10+, TypeScript strict mode
- **API:** GraphQL (Code-first with @nestjs/graphql) + REST
- **Database:** Prisma 6 + PostgreSQL
- **Caching:** Redis with @nestjs/cache-manager
- **Queue:** Bull/BullMQ for background jobs
- **WebSocket:** Socket.io via @nestjs/websockets
- **Auth:** Passport.js with JWT strategy, OAuth 2.0
- **Validation:** class-validator + class-transformer + Zod
- **Testing:** 
  - Frontend: Vitest (preferred) + Testing Library
  - Backend: Vitest (preferred) or Jest + Supertest (E2E)
  - E2E: Playwright
- **Monitoring:** Prometheus metrics, Sentry error tracking
- **Monorepo:** Nx (recommended for NestJS) or Turborepo

### Deployment

- **Frontend:** Vercel, AWS Amplify, CloudFront + S3
- **Backend:** Kubernetes (GKE, EKS, AKS), AWS ECS, Google Cloud Run
- **Database:** AWS RDS, Google Cloud SQL, Azure Database
- **Caching:** AWS ElastiCache, Google Memorystore, Redis Cloud
- **Queue:** AWS SQS, Google Cloud Tasks, self-hosted Redis
- **Container Registry:** Docker Hub, AWS ECR, Google Container Registry

### Real-World Use Cases

- **Multi-tenant SaaS platforms**
- **E-commerce platforms with complex business logic**
- **Financial applications requiring high reliability**
- **Healthcare systems with strict compliance requirements**
- **Enterprise dashboards with real-time data**

### When to Use This Stack

**Perfect for:**
- Large enterprises with multiple teams
- Applications requiring microservices architecture
- Complex business logic and workflows
- High scalability requirements (millions of users)
- Projects with long-term maintenance (5+ years)
- When you need advanced patterns (CQRS, Event Sourcing, etc.)

**Overkill for:**
- Small projects or MVPs
- Teams smaller than 5 developers
- Simple CRUD applications
- Rapid prototyping
- Projects with unclear requirements

### Related Resources

- [Frontend Libraries](./frontend-libs.md) - Next.js, React, Apollo
- [Backend Development](./backend.md) - NestJS, GraphQL, microservices
- [Database & ORM](./database.md) - Prisma advanced patterns
- [Architecture](./architecture.md) - Clean Architecture with NestJS
- [Infrastructure](./infrastructure.md) - Kubernetes, Docker, CI/CD

---

## Example 4: Classic Full Stack

### Stack: React + Express + MongoDB + JWT/OAuth

**Good for:** Traditional REST API architecture, teams familiar with MERN stack, existing MERN projects

### Why This Example

- **Familiar Patterns:** Industry-standard MERN stack
- **Large Ecosystem:** Massive community, extensive packages
- **Flexible:** Works with any frontend/backend combination
- **Well-Documented:** Years of tutorials, courses, blog posts
- **Simple to Understand:** Traditional request/response model
- **Works Anywhere:** Deploy on any cloud provider or VPS

### Project Structure

```
classic-fullstack/
├── client/                           # React Frontend
│   ├── public/
│   │   ├── index.html
│   │   └── assets/
│   ├── src/
│   │   ├── components/               # React components
│   │   │   ├── common/               # Shared components
│   │   │   │   ├── Button.tsx
│   │   │   │   ├── Modal.tsx
│   │   │   │   └── Card.tsx
│   │   │   ├── layout/               # Layout components
│   │   │   │   ├── Header.tsx
│   │   │   │   ├── Footer.tsx
│   │   │   │   └── Sidebar.tsx
│   │   │   └── features/             # Feature components
│   │   │       ├── auth/
│   │   │       │   ├── LoginForm.tsx
│   │   │       │   └── RegisterForm.tsx
│   │   │       ├── dashboard/
│   │   │       └── profile/
│   │   │
│   │   ├── pages/                    # Page components
│   │   │   ├── Home.tsx
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   └── Profile.tsx
│   │   │
│   │   ├── hooks/                    # Custom hooks
│   │   │   ├── useAuth.ts
│   │   │   ├── useUser.ts
│   │   │   └── useDebounce.ts
│   │   │
│   │   ├── store/                    # State management
│   │   │   ├── slices/               # Redux Toolkit slices
│   │   │   │   ├── authSlice.ts
│   │   │   │   ├── userSlice.ts
│   │   │   │   └── uiSlice.ts
│   │   │   └── store.ts              # Store configuration
│   │   │
│   │   ├── services/                 # API services
│   │   │   ├── api.ts                # Axios instance
│   │   │   ├── authService.ts
│   │   │   ├── userService.ts
│   │   │   └── postService.ts
│   │   │
│   │   ├── utils/                    # Utilities
│   │   │   ├── validators.ts
│   │   │   ├── formatters.ts
│   │   │   └── helpers.ts
│   │   │
│   │   ├── types/                    # TypeScript types
│   │   │   ├── user.ts
│   │   │   ├── post.ts
│   │   │   └── api.ts
│   │   │
│   │   ├── styles/                   # Global styles
│   │   │   └── globals.css
│   │   │
│   │   ├── App.tsx                   # Root component
│   │   ├── main.tsx                  # Entry point
│   │   └── router.tsx                # Route configuration
│   │
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts                # Vite config
│   └── tailwind.config.ts
│
├── server/                           # Express Backend
│   ├── src/
│   │   ├── controllers/              # Route controllers
│   │   │   ├── authController.ts
│   │   │   ├── userController.ts
│   │   │   └── postController.ts
│   │   │
│   │   ├── middleware/               # Express middleware
│   │   │   ├── auth.ts               # JWT verification
│   │   │   ├── errorHandler.ts
│   │   │   ├── validation.ts
│   │   │   └── rateLimiter.ts
│   │   │
│   │   ├── models/                   # Database models
│   │   │   ├── User.ts               # Mongoose model
│   │   │   ├── Post.ts
│   │   │   └── Comment.ts
│   │   │
│   │   ├── routes/                   # API routes
│   │   │   ├── auth.ts               # /api/auth/*
│   │   │   ├── users.ts              # /api/users/*
│   │   │   ├── posts.ts              # /api/posts/*
│   │   │   └── index.ts              # Route aggregator
│   │   │
│   │   ├── services/                 # Business logic
│   │   │   ├── authService.ts
│   │   │   ├── userService.ts
│   │   │   ├── postService.ts
│   │   │   └── emailService.ts
│   │   │
│   │   ├── utils/                    # Server utilities
│   │   │   ├── jwt.ts
│   │   │   ├── validators.ts
│   │   │   ├── logger.ts
│   │   │   └── errors.ts
│   │   │
│   │   ├── config/                   # Configuration
│   │   │   ├── database.ts
│   │   │   ├── env.ts
│   │   │   └── constants.ts
│   │   │
│   │   ├── types/                    # TypeScript types
│   │   │   └── index.ts
│   │   │
│   │   ├── app.ts                    # Express app setup
│   │   └── server.ts                 # Server entry point
│   │
│   ├── package.json
│   └── tsconfig.json
│
├── shared/                           # Shared code
│   ├── types/                        # Shared TypeScript types
│   │   ├── user.ts
│   │   ├── post.ts
│   │   └── api.ts
│   └── constants/                    # Shared constants
│       └── index.ts
│
├── tests/                            # Tests
│   ├── client/                       # Frontend tests
│   │   ├── unit/
│   │   │   └── components/
│   │   └── integration/
│   │       └── features/
│   └── server/                       # Backend tests
│       ├── unit/
│       │   ├── services/
│       │   └── utils/
│       └── integration/
│           └── api/
│
├── .github/
│   └── workflows/
│       └── ci.yml
│
├── docker-compose.yml                # Local development
├── .env.example
├── package.json                      # Root package
└── README.md
```

### Key Features

- **Separation of Concerns:** Clear frontend/backend separation
- **REST API:** Traditional REST endpoints with standard HTTP methods
- **Redux State Management:** Centralized state for complex client-side logic
- **MongoDB:** Flexible NoSQL database with Mongoose ODM
- **Authentication:** JWT or Passport.js with multiple strategies
- **Familiar Patterns:** MVC-inspired architecture

### Technology Details

- **Frontend:** React 19, TypeScript, Vite (fast dev server + HMR), Redux Toolkit
- **Styling:** Tailwind CSS or Material-UI
- **API Client:** Axios with interceptors for auth, error handling
- **Routing:** React Router v6+
- **Backend:** Express.js, Node.js 20+
- **Database:** MongoDB with Mongoose
- **Auth:** JWT or Passport.js (Local, Google, GitHub strategies)
- **Validation:** express-validator or Joi + Zod
- **Testing:**
  - Frontend: Vitest (preferred) + Testing Library
  - Backend: Vitest (preferred) or Jest + Supertest
  - E2E: Playwright
- **API Documentation:** Swagger/OpenAPI

### Deployment

- **Frontend:** Netlify, Vercel, S3 + CloudFront, Surge
- **Backend:** Heroku, Render, DigitalOcean, AWS Elastic Beanstalk
- **Database:** MongoDB Atlas (recommended), self-hosted
- **Full-Stack:** Railway, Render (monorepo support)

### When to Use This Stack

**Perfect for:**
- Traditional web applications
- Teams with MERN stack experience
- Projects requiring flexible schema (MongoDB)
- When you want REST APIs with standard tooling
- Migrating from older MERN applications

**Consider alternatives if:**
- You want end-to-end type safety (use T3 Stack)
- Building complex enterprise apps (use NestJS)
- Need rapid MVP development (use T3 Stack or Bulletproof)

### Related Resources

- [Frontend Libraries](./frontend-libs.md) - React, Redux
- [Backend Development](./backend.md) - Express.js, REST APIs
- [Database & ORM](./database.md) - MongoDB, Mongoose

---

## Real-World Production Examples

### Open Source Applications to Study (2025)

**⚡ ESSENTIAL - Cal.com** - 35k+ GitHub stars
- **Stack:** T3 Stack (Next.js + tRPC + Prisma)
- **What:** Open-source scheduling platform (Calendly alternative)
- **Why Study:** Perfect example of T3 Stack at scale with real users
- **Learn:** Authentication flows, database design, real-time features
- **Repository:** github.com/calcom/cal.com

**Supabase Dashboard** - 75k+ GitHub stars (main repo)
- **Stack:** Next.js + TypeScript + PostgreSQL + Supabase
- **What:** Firebase alternative with PostgreSQL backend
- **Why Study:** Complex dashboard with real-time data, authentication patterns
- **Learn:** Database management UI, real-time subscriptions, auth flows
- **Repository:** github.com/supabase/supabase

**Documenso** - 8k+ GitHub stars
- **Stack:** Next.js 14 + TypeScript + Prisma + tRPC + Tailwind
- **What:** Open-source DocuSign alternative for document signing
- **Why Study:** Production SaaS built with modern stack
- **Learn:** Document handling, e-signatures, payment integration
- **Repository:** github.com/documenso/documenso

**Plane** - 30k+ GitHub stars
- **Stack:** Next.js + Django + PostgreSQL
- **What:** Open-source Jira alternative for project management
- **Why Study:** Complex state management, real-time collaboration
- **Learn:** Multi-user collaboration, permission systems, real-time updates
- **Repository:** github.com/makeplane/plane

**Formbricks** - 8k+ GitHub stars
- **Stack:** Next.js + tRPC + Prisma + TypeScript + Turborepo
- **What:** Open-source Typeform alternative for surveys
- **Why Study:** Monorepo structure, widget integration, analytics
- **Learn:** Embeddable widgets, survey logic, data visualization
- **Repository:** github.com/formbricks/formbricks

**Twenty CRM** - 20k+ GitHub stars
- **Stack:** NestJS + React + GraphQL + TypeScript + PostgreSQL
- **What:** Open-source Salesforce alternative
- **Why Study:** Enterprise architecture, NestJS at scale
- **Learn:** CRM features, GraphQL best practices, modular architecture
- **Repository:** github.com/twentyhq/twenty

**Novu** - 35k+ GitHub stars
- **Stack:** NestJS + React + MongoDB + TypeScript + Microservices
- **What:** Open-source notification infrastructure
- **Why Study:** Microservices architecture, multi-channel notifications
- **Learn:** Event-driven architecture, notification routing, provider integrations
- **Repository:** github.com/novuhq/novu

**Rallly** - 4k+ GitHub stars
- **Stack:** Next.js + tRPC + Prisma + TypeScript + Tailwind
- **What:** Open-source Doodle alternative for scheduling polls
- **Why Study:** Clean code, simple but complete feature set
- **Learn:** Polling logic, real-time updates, clean UI/UX
- **Repository:** github.com/lukevella/rallly

---

## Choosing Your Stack

### Decision Matrix

| Project Type | Build Tool | Recommended Stack | Why |
|-------------|-----------|------------------|-----|
| **Startup MVP (with SEO)** | Next.js | Example 1 (T3 Stack) | Fastest time to market, SSR/SEO, type safety |
| **Startup MVP (SPA)** | Vite | Example 2 (Bulletproof + Vite) | Fastest dev experience, client-side only |
| **Scalable React App** | Vite or Next.js | Example 2 (Bulletproof) | Feature-based architecture scales perfectly |
| **Enterprise/Microservices** | Next.js or Vite | Example 3 (NestJS + GraphQL) | Modular architecture, microservices-ready |
| **Traditional Web App** | Vite | Example 4 (MERN + Vite) | Familiar patterns, fast dev server |
| **E-commerce** | Next.js | Example 1 or 3 | SSR/SEO critical, type safety for payments |
| **SaaS Platform** | Vite or Next.js | Example 1 or 3 | Multi-tenancy, subscriptions, scalability |
| **Content Site/Blog** | Next.js | Example 1 (T3/Next.js) | SSR/SSG essential, SEO optimization |
| **Real-time Apps** | Vite or Next.js | Example 1 or 3 | WebSocket support with type safety |
| **Internal Tools/Dashboards** | Vite | Example 2 (Bulletproof + Vite) | Fast dev, no SSR needed, rapid iteration |
| **API-First Product** | Vite (frontend) | Example 3 (NestJS) | OpenAPI docs, multiple API types |

### Technology Comparison

#### Build Tool: Vite vs Next.js
**Vite Advantages:**
- ⚡ Lightning-fast dev server with instant HMR
- 🚀 Faster cold starts and hot reloads
- 🎯 Pure SPA focus - no SSR complexity
- 🔧 Simple configuration
- 📦 Better for micro-frontends

**Next.js Advantages:**
- 🔍 Built-in SSR/SSG/ISR for SEO
- 📱 Image optimization out of the box
- 🛣️ File-based routing (App Router)
- ⚙️ Zero-config deployment on Vercel
- 🎯 Full-stack capabilities (API routes)

**When to Choose:**
- **Vite:** Internal tools, dashboards, admin panels, SPAs, prototypes
- **Next.js:** Marketing sites, blogs, e-commerce, any public-facing content requiring SEO

#### Type Safety (Most Important in 2025)
1. **Excellent:** Example 1 (tRPC end-to-end), Example 3 (GraphQL + Prisma)
2. **Good:** Example 2 (TypeScript + patterns), Example 4 (TypeScript + REST)

#### Developer Experience
1. **Best DX (SPA):** Vite + Example 2 (Bulletproof) - Fastest HMR, clean architecture
2. **Best DX (Full-Stack):** Example 1 (T3) - Zero API overhead, instant feedback
3. **Great:** Example 2 (Bulletproof) - Clear patterns, easy navigation
4. **Good:** Example 3 (NestJS) - Strong patterns but steeper learning curve
5. **Familiar:** Example 4 (MERN) - Traditional but well-known

#### Scalability
1. **Enterprise-grade:** Example 3 (NestJS microservices)
2. **Highly Scalable:** Example 1 (T3 monorepo), Example 2 (Bulletproof)
3. **Scalable:** Example 4 (traditional scaling patterns)

#### Learning Curve
1. **Gentle:** Example 1 (T3) - Intuitive patterns, great docs
2. **Low:** Example 4 (MERN) - Traditional and familiar
3. **Moderate:** Example 2 (Bulletproof) - New patterns but clear benefits
4. **Steep:** Example 3 (NestJS) - Enterprise patterns, decorators, DI

#### Community & Ecosystem (2025)
1. **Massive:** Example 1 (Next.js/React), Example 4 (MERN)
2. **Large:** Example 3 (NestJS), Example 2 (React)
3. **All have excellent documentation and active communities**

#### Time to Production
1. **Fastest:** Example 1 (T3) - 1-2 weeks for MVP
2. **Fast:** Example 2 (Bulletproof) - 2-3 weeks for MVP
3. **Moderate:** Example 4 (MERN) - 2-4 weeks for MVP
4. **Slower:** Example 3 (NestJS) - 3-6 weeks for MVP (but better long-term)

### Stack Selection Flowchart

```
START
  |
  ├─ Do you need SEO / Server-Side Rendering?
  │   ├─ YES → Use Next.js
  │   │   ├─ Need rapid MVP? → Example 1: T3 Stack ⚡
  │   │   └─ Enterprise/Microservices? → Example 3: NestJS + Next.js ⚡
  │   │
  │   └─ NO → Use Vite (faster dev experience)
  │       ├─ Feature-based architecture? → Example 2: Bulletproof + Vite ⚡
  │       ├─ Traditional MERN? → Example 4: MERN + Vite
  │       └─ Enterprise? → Example 3: NestJS + Vite
  |
  ├─ Alternative Decision Path (by project type):
  │   ├─ Marketing site, blog, e-commerce?
  │   │   └─ YES → Next.js (Example 1 or 3) ⚡
  │   │
  │   ├─ Internal tool, dashboard, admin panel?
  │   │   └─ YES → Vite (Example 2) ⚡
  │   │
  │   ├─ Large enterprise with microservices?
  │   │   └─ YES → Example 3: NestJS + (Vite or Next.js) ⚡
  │   │
  │   └─ Rapid prototype/MVP?
  │       ├─ Need SEO? → Example 1: T3 Stack (Next.js) ⚡
  │       └─ SPA only? → Example 2: Bulletproof + Vite ⚡
```

---

## Best Practices

### Monorepo Management (2025 Standards)

**Top Tools:**
- **Turborepo** (Recommended for Next.js, Vite): Fast builds, simple config
- **Nx** (Recommended for NestJS, enterprise): Most powerful, steepest learning curve
- **pnpm workspaces** (Lightweight): Good for simple monorepos

**Best Practices:**
- **Shared packages:** Extract common code (ui, utils, types, config)
- **Consistent tooling:** Unified ESLint, Prettier, TypeScript configs
- **Versioning:** Use changesets for coordinated releases
- **Caching:** Leverage build caches (Turborepo/Nx automatically)
- **Task dependencies:** Define clear build order (db → api → web)
- **Selective testing:** Only test affected packages

### Project Structure Principles

**Feature-Based Organization (2025 Standard):**
- Group by feature, not file type
- Each feature is self-contained vertical slice
- Clear boundaries between features
- Shared code in dedicated `/shared` or `/common` folder

**Layered Architecture:**
- **Presentation Layer:** UI components, pages
- **Application Layer:** Business logic, use cases
- **Data Layer:** API calls, database access
- **Infrastructure Layer:** External services, utilities

**Folder Naming:**
- Use lowercase with hyphens: `user-profile/`
- Or camelCase for components: `userProfile/`
- Be consistent across the entire project

### Type Safety (Critical for 2025)

**End-to-End Types:**
- **Option 1:** tRPC (no code generation needed)
- **Option 2:** GraphQL Code Generator
- **Option 3:** OpenAPI TypeScript Generator
- Share types between frontend/backend via packages

**Runtime Validation:**
- **Zod** (TypeScript-first): Recommended for 2025
- **Yup:** Alternative with good DX
- Validate at API boundaries (input + output)

**Strict TypeScript:**
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true
  }
}
```

### Testing Strategy

**Testing Framework Preference:**
- **Primary:** Vitest (faster, better TypeScript support, compatible with Vite)
- **Alternative:** Jest (if needed for specific NestJS patterns or legacy codebases)
- **E2E:** Playwright (recommended for 2025) or Cypress

**Unit Tests (60-70% of tests):**
- Test business logic in isolation
- Mock external dependencies with Vitest or MSW
- Fast execution (< 5 seconds for entire suite)
- Use Vitest's built-in mocking and snapshot testing

**Integration Tests (20-30% of tests):**
- Test API endpoints with real database (test DB)
- Test multiple units working together
- Use factories for test data
- Vitest for API integration tests with Supertest

**E2E Tests (10-20% of tests):**
- Test critical user flows only
- Use Playwright (recommended) for modern browser automation
- Run on CI for every PR
- Parallel execution for faster test runs

**Coverage Goals:**
- Critical paths: 90%+ coverage
- Overall: 70-80% coverage
- Focus on business logic, not boilerplate
- Use Vitest's built-in coverage with v8 or istanbul

### Security (Non-Negotiable for 2025)

**Authentication:**
- Use battle-tested libraries (NextAuth.js, Passport.js, Clerk)
- JWT with refresh tokens (short-lived access tokens)
- OAuth 2.0 for social login
- Multi-factor authentication for sensitive apps

**Authorization:**
- RBAC (Role-Based) or ABAC (Attribute-Based)
- Check permissions at API level, not just UI
- Principle of least privilege

**Input Validation:**
- Validate ALL inputs with schemas (Zod)
- Sanitize user input
- Use parameterized queries (ORMs handle this)
- Rate limiting on all endpoints

**Environment Variables:**
- Never commit secrets (use .env.local, not .env)
- Different secrets per environment
- Use secret managers in production (AWS Secrets Manager, etc.)

**Headers:**
- CORS: Configure properly for production
- CSP (Content Security Policy): Prevent XSS
- HTTPS only in production
- Security headers with Helmet.js

### Performance (Essential for Production)

**Database:**
- Index frequently queried fields
- Use database query analyzers (EXPLAIN)
- Implement pagination (cursor-based preferred)
- Database connection pooling

**Caching:**
- Redis for session storage
- API response caching (Redis or HTTP cache)
- CDN for static assets
- Browser caching with proper headers

**Frontend:**
- Code splitting (React lazy, Next.js dynamic imports)
- Image optimization (next/image, Cloudinary)
- Lazy load components below the fold
- Web Vitals monitoring

**API:**
- Compression (gzip/brotli)
- Response pagination
- Field selection (GraphQL or sparse fieldsets)
- Database query optimization (N+1 problem)

### DevOps (Production-Ready Checklist)

**CI/CD:**
- Automated tests on every PR
- Automated deployment on merge to main
- Environment-specific deployments (dev/staging/prod)
- Rollback capability

**Monitoring:**
- **Error Tracking:** Sentry (recommended), Rollbar
- **Performance:** Vercel Analytics, DataDog
- **Logs:** Better Stack (formerly Logtail), CloudWatch
- **Uptime:** UptimeRobot, Better Stack

**Infrastructure as Code:**
- Docker for containerization
- Docker Compose for local development
- Kubernetes for production (if needed)
- Terraform or Pulumi for cloud resources

**Database Migrations:**
- Version-controlled schema changes (Prisma, Drizzle)
- Run migrations before deployment
- Backup before migrations
- Rollback plan for failed migrations

### Code Quality

**Linting & Formatting:**
- **ESLint:** Catch bugs and enforce patterns
- **Prettier:** Automatic code formatting
- **TypeScript:** Strict mode enabled
- Consistent configs across monorepo

**Pre-commit Hooks:**
- Husky + lint-staged
- Run linter on staged files
- Run type checking
- Prevent commits with errors

**Code Reviews:**
- Required for all production code
- Use PR templates
- Automated checks (CI) must pass
- Focus on logic, security, performance

**Documentation:**
- README with setup instructions
- API documentation (auto-generated preferred)
- Architecture diagrams (C4 model, ERD)
- Code comments for complex logic only

---

## Related Resources

### Core Development
- [Frontend Libraries](./frontend-libs.md) - React 19, Next.js 15, UI libraries
- [Backend Development](./backend.md) - Node.js, NestJS, tRPC, REST, GraphQL
- [Database & ORM](./database.md) - Prisma, TypeORM, MongoDB
- [Architecture](./architecture.md) - System design, patterns, best practices

### Quality & Infrastructure
- [Testing](./testing.md) - Testing strategies, tools, best practices
- [Security](./security.md) - Authentication, authorization, common vulnerabilities
- [Infrastructure](./infrastructure.md) - Deployment, Docker, Kubernetes, CI/CD
- [Tooling](./tooling.md) - Monorepo tools, dev productivity, VSCode setup

### Learning & Community
- [Learning Resources](./learning.md) - Courses, tutorials, books
- [AI Agents](./ai-agents.md) - Using AI in development workflow

---

## Additional Resources

### Official Documentation
- **T3 Stack:** https://create.t3.gg/
- **Bulletproof React:** https://github.com/alan2207/bulletproof-react
- **Next.js:** https://nextjs.org/docs
- **NestJS:** https://docs.nestjs.com/
- **Prisma:** https://www.prisma.io/docs
- **tRPC:** https://trpc.io/docs

### Community & Learning
- **Next.js Discord:** https://nextjs.org/discord
- **T3 Community:** https://discord.gg/t3-turbo
- **NestJS Discord:** https://discord.gg/nestjs
- **Reddit:** r/reactjs, r/nextjs, r/node

### Tools & Services
- **Deployment:** Vercel, Railway, Render, Fly.io
- **Database:** Vercel Postgres, Supabase, PlanetScale, Railway
- **Auth:** Clerk, Auth0, Supabase Auth
- **Monitoring:** Sentry, Vercel Analytics, Better Stack

---

*Part of octocode-mcp resources collection*
