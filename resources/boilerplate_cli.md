# CLI Project Generators & Boilerplate Commands

> One-command project creation for AI agents - Node.js/TypeScript applications

**🤖 For:** AI agents scaffolding complete projects with zero manual configuration  
**⚙️ Runtime:** Node.js with npm/npx/yarn/pnpm  
**📅 Updated:** October 15, 2025

---

## Quick Selection Guide

| Need | Command | Why |
|------|---------|-----|
| **Full-stack + Type-safe** | `npx create-t3-app@latest` | Next.js + tRPC + Prisma |
| **Next.js** | `npx create-next-app@latest` | Official Next.js |
| **Fast SPA** | `npm create vite@latest` | Lightning dev server |
| **Vue Full-stack** | `npx nuxi@latest init` | Nuxt 3 SSR/SSG |
| **Vue SPA** | `npm create vue@latest` | Vue + Vite |
| **Svelte** | `npm create svelte@latest` | SvelteKit |
| **Max Performance** | `npm create solid@latest` | Fastest reactivity |
| **Instant Loading** | `npm create qwik@latest` | Zero JS by default |
| **Static Site** | `npm create astro@latest` | Multi-framework SSG |
| **Documentation** | `npx create-docusaurus@latest` | React docs site |
| **Backend API** | `nest new` | Enterprise NestJS |
| **Angular** | `npx @angular/cli new` | Enterprise frontend |
| **Desktop** | `npm create tauri-app@latest` | Lightweight native |
| **Browser Extension** | `npm create wxt@latest` | Modern Manifest V3 |
| **Monorepo** | `npx create-nx-workspace@latest` | Full-featured |
| **Monorepo (Fast)** | `npx create-turbo@latest` | High-performance |
| **Mobile** | `npx create-expo-stack@latest` | Modern Expo |
| **Mobile (Production)** | `npx ignite-cli@latest new` | Battle-tested RN |

---

## Table of Contents

1. [Full-Stack Frameworks](#full-stack-frameworks)
2. [Frontend Frameworks](#frontend-frameworks)
3. [Static Site Generators](#static-site-generators)
4. [Backend & Enterprise](#backend--enterprise)
5. [Desktop & Extensions](#desktop--extensions)
6. [Monorepo Tools](#monorepo-tools)
7. [Mobile Apps](#mobile-apps)
8. [Code Generators](#code-generators)
9. [Package Manager Guide](#package-manager-guide)

---

## Full-Stack Frameworks

### T3 Stack (28K⭐) - Type-Safe Full-Stack
```bash
# Interactive (recommended)
npx create-t3-app@latest

# With all features
npx create-t3-app@latest my-app --prisma --trpc --tailwind --nextAuth

# Other package managers
pnpm create t3-app@latest
```
**Stack:** Next.js 15 + tRPC + Prisma + NextAuth + Tailwind + TypeScript

---

### Next.js (143K⭐) - React SSR/SSG
```bash
# Interactive
npx create-next-app@latest

# Complete setup
npx create-next-app@latest my-app --typescript --tailwind --app --eslint
```
**Features:** App Router, TypeScript, Tailwind, ESLint

---

### Remix (30K⭐) - Edge-Native Full-Stack
```bash
# Interactive
npx create-remix@latest

# With stacks
npx create-remix@latest --template remix-run/indie-stack  # SQLite
npx create-remix@latest --template remix-run/blues-stack  # PostgreSQL
```

---

### Blitz.js (14K⭐) - Zero-API Data Layer
```bash
npx create-blitz-app my-app
```

---

### RedwoodJS (18K⭐) - Full-Stack with GraphQL
```bash
yarn create redwood-app my-app
```

---

## Frontend Frameworks

### Vite (72K⭐) - Lightning-Fast Dev Server
```bash
# Interactive (recommended)
npm create vite@latest

# Specific templates
npm create vite@latest my-app -- --template react-ts
npm create vite@latest my-app -- --template vue-ts
npm create vite@latest my-app -- --template svelte-ts
npm create vite@latest my-app -- --template solid-ts
```
**Templates:** react, vue, svelte, solid, preact, lit, vanilla (all with -ts variants)

---

### Vue (30K⭐) - Official Vue CLI
```bash
npm create vue@latest
```
**Features:** Vue 3 + Vite, Router, Pinia, TypeScript, Testing

---

### Nuxt 3 (58K⭐) - Vue Full-Stack
```bash
npx nuxi@latest init my-app
```
**Features:** SSR/SSG, File-based routing, Auto-imports, Vite

---

### SvelteKit (20K⭐) - Svelte Full-Stack
```bash
npm create svelte@latest
```
**Features:** Smallest bundles, SSR/SSG, File-based routing

---

### SolidJS (34K⭐) - Maximum Performance
```bash
npm create solid@latest
```
**Features:** Fastest reactivity, No virtual DOM, TypeScript

---

### Qwik (22K⭐) - Instant Loading
```bash
npm create qwik@latest
```
**Features:** Zero JS by default, Resumable, Instant loading

---

### Preact (4.7K⭐) - 3KB React Alternative
```bash
npx preact-cli create default my-app
```
**Features:** PWA-ready, Pre-rendering, 3KB size

---

### Angular (27K⭐) - Enterprise Frontend
```bash
npx @angular/cli new my-app

# With options
ng new my-app --routing --style=scss --strict
```
**Post-install generators:**
```bash
ng generate component my-component
ng generate service my-service
```

---

## Static Site Generators

### Astro (49K⭐) - Multi-Framework SSG
```bash
# Interactive
npm create astro@latest

# With templates
npm create astro@latest my-app -- --template blog
npm create astro@latest my-app -- --template minimal
npm create astro@latest my-app -- --template portfolio
```

---

### Gatsby (56K⭐) - React SSG
```bash
npm init gatsby
```
**Features:** GraphQL, Image optimization, 3000+ plugins

---

### Docusaurus (62K⭐) - Documentation
```bash
npx create-docusaurus@latest my-website classic --typescript
```
**Features:** MDX, Versioning, i18n, Algolia search, Dark mode

---

## Backend & Enterprise

### NestJS (2.1K⭐) - Enterprise Node.js
```bash
npx @nestjs/cli new my-project
```
**Post-install generators:**
```bash
nest generate resource users  # Creates module, controller, service
```

---

### UmiJS (16K⭐) - Enterprise React
```bash
npx create-umi@latest
```
**Features:** Ant Design, Plugin system, State management

---

## Desktop & Extensions

### Tauri (1.3K⭐) - Lightweight Desktop
```bash
# Interactive
npm create tauri-app@latest

# With frontend
npm create tauri-app@latest -- --template react-ts
npm create tauri-app@latest -- --template vue-ts
```
**Features:** Rust backend, Smaller than Electron, Native access

---

### Electron Forge (6.9K⭐) - Full-Featured Desktop
```bash
npm init electron-app@latest my-app -- --template=vite-typescript
```

---

### WXT (8.2K⭐) - Modern Browser Extension
```bash
# Interactive
npm create wxt@latest

# With framework
npm create wxt@latest -- --template react
npm create wxt@latest -- --template vue
```
**Features:** Manifest V3, HMR, Multi-browser, TypeScript

---

### Chrome Extension (2K⭐)
```bash
npm create chrome-ext@latest
```

---

## Monorepo Tools

### Nx (27K⭐) - Smart Monorepos
```bash
# Create workspace
npx create-nx-workspace@latest

# With presets
npx create-nx-workspace@latest --preset=react-monorepo
npx create-nx-workspace@latest --preset=next
npx create-nx-workspace@latest --preset=ts
```

---

### Turborepo (26K⭐) - High-Performance
```bash
npx create-turbo@latest
```

---

### T3 Turbo (5.7K⭐) - Web + Mobile Monorepo
```bash
npx create-t3-turbo@latest
```
**Includes:** Next.js web + Expo mobile + tRPC + Prisma

---

## Mobile Apps

### Create Expo Stack (2.4K⭐) - Modern Expo
```bash
# Interactive (recommended)
npx create-expo-stack@latest

# With features
npx create-expo-stack@latest my-app --expo-router --nativewind --react-query
```
**Options:** expo-router, NativeWind, React Query, TypeScript

---

### Expo Official (44K⭐)
```bash
npx create-expo-app@latest my-app
```

---

### Obytes Template (3.7K⭐) - Production Expo
```bash
npx create-expo-app my-app --template @obytes/react-native-template-obytes
```
**Features:** expo-router, NativeWind, React Query, Zustand, Zod, i18next

---

### Ignite (19K⭐) - Battle-Tested RN
```bash
npx ignite-cli@latest new MyApp
```
**Features:** MobX-State-Tree, React Navigation, Generators

---

### React Native Boilerplate (5.4K⭐)
```bash
npx react-native init MyApp --template @thecodingmachine/react-native-boilerplate
```
**Features:** Redux Toolkit, React Navigation, i18next, Testing

---

### React Native TypeScript (1.9K⭐)
```bash
npx react-native init MyApp --template react-native-template-typescript
```

---

## Code Generators

### Hygen (5.9K⭐) - Fast Generator
```bash
# Install
npm install -g hygen

# Initialize
hygen init self

# Generate
hygen component new MyComponent
```

---

### Plop (7.5K⭐) - Micro-Generator
```bash
# Install
npm install --save-dev plop

# Use
npx plop
```

**Example plopfile.js:**
```javascript
module.exports = function (plop) {
  plop.setGenerator('component', {
    description: 'Create component',
    prompts: [{ type: 'input', name: 'name', message: 'Name:' }],
    actions: [{
      type: 'add',
      path: 'src/components/{{pascalCase name}}.tsx',
      templateFile: 'templates/component.hbs'
    }]
  });
};
```

---

### Yeoman (3.9K⭐) - Community Generators
```bash
# Install
npm install -g yo

# Install generator
npm install -g generator-webapp

# Run
yo webapp
```

---

## Next.js Examples & Templates

**Official Examples** (use with `npx create-next-app`):
```bash
# SaaS Starter
npx create-next-app --example saas-starter my-app

# Next Forge (Turborepo)
npx create-next-app --example next-forge my-app
```

---

## Remix Stacks

```bash
# Indie Stack (SQLite)
npx create-remix@latest --template remix-run/indie-stack

# Blues Stack (PostgreSQL + Fly.io)
npx create-remix@latest --template remix-run/blues-stack

# Grunge Stack (PostgreSQL + AWS)
npx create-remix@latest --template remix-run/grunge-stack
```

---

## Astro Templates

```bash
# AstroWind (Tailwind template)
npm create astro@latest -- --template arthelokyo/astrowind

# Astroship (Landing pages)
npm create astro@latest -- --template surjithctly/astroship
```

---

## Vite Templates

```bash
# Vitesse (Vue + Vite opinionated)
npx degit antfu/vitesse my-app
```

---

## Package Manager Guide

| Command | npm | yarn | pnpm | bun |
|---------|-----|------|------|-----|
| **Create** | `npm create` | `yarn create` | `pnpm create` | `bun create` |
| **Install** | `npm install` | `yarn` | `pnpm install` | `bun install` |
| **Execute** | `npx` | `yarn dlx` | `pnpm dlx` | `bunx` |

### Common Patterns
```bash
# Interactive (recommended)
npx create-<tool>@latest

# Non-interactive
npx create-<tool>@latest my-app --yes

# TypeScript
npx create-<tool>@latest my-app --typescript

# Specify package manager
npx create-<tool>@latest my-app --package-manager pnpm
```

---

## AI Agent Recommendations (2025)

| Use Case | Command |
|----------|---------|
| **Full-stack type-safe** | `npx create-t3-app@latest` |
| **React SSR** | `npx create-next-app@latest` |
| **Vue full-stack** | `npx nuxi@latest init` |
| **Fast SPA** | `npm create vite@latest` |
| **Smallest bundle** | `npm create svelte@latest` |
| **Max performance** | `npm create solid@latest` |
| **Zero JS** | `npm create qwik@latest` |
| **Static site** | `npm create astro@latest` |
| **Documentation** | `npx create-docusaurus@latest` |
| **Backend API** | `npx @nestjs/cli new` |
| **Desktop app** | `npm create tauri-app@latest` |
| **Browser extension** | `npm create wxt@latest` |
| **Monorepo** | `npx create-nx-workspace@latest` |
| **Mobile modern** | `npx create-expo-stack@latest` |
| **Mobile production** | `npx ignite-cli@latest new` |

---

## Best Practices

### Version Management
```bash
# Always use @latest
npx create-<tool>@latest

# Check Node.js version (most require 18+)
node --version

# Update Node.js if needed
nvm install 20 && nvm use 20
```

### Package Manager Selection
- **npm** - Default, universal compatibility
- **pnpm** - Fastest, disk-efficient
- **yarn** - Stable, good DX
- **bun** - Newest, experimental

---

*For AI agents - Part of octocode-mcp resources*

