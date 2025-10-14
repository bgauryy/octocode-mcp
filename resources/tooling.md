# Developer Tooling & Productivity Resources

> Development tools, monorepo management, and productivity for Node.js/TypeScript workflows

**🎯 Purpose:** Tooling resources for AI agents building Node.js/TypeScript applications  
**🌐 Focus:** Biome, Turborepo, Vite - Modern JavaScript/TypeScript tooling  
**⚙️ Runtime:** All development tools run on Node.js  
**📅 Updated:** October 13, 2025

---

## Quick Reference

### Code Quality & Formatting (Start Here)
- **All-in-One (2025 Default):** `biomejs/biome` (22K+ ⭐) - Replaces ESLint + Prettier (25x faster)
- **Traditional Linter:** `eslint/eslint` (29K+ ⭐) - Industry standard, extensive plugins
- **Traditional Formatter:** `prettier/prettier` (49K+ ⭐) - Opinionated code formatter

### Monorepo Management
- **Best for Next.js:** `vercel/turborepo` (29K+ ⭐) - Fast builds, intelligent caching
- **Enterprise-Grade:** `nrwl/nx` (24K+ ⭐) - Advanced dependency management
- **Simple & Efficient:** pnpm workspaces - Fast installs, small disk footprint

### Build Tools
- **Frontend (Modern):** `vitejs/vite` (72K+ ⭐) - Instant dev server, lightning HMR
- **Library Bundling:** `rollup/rollup` (26K+ ⭐) - ES modules bundler
- **Speed:** `evanw/esbuild` (39K+ ⭐) - Extremely fast bundler in Go

### API Testing
- **Best Open Source:** `hoppscotch/hoppscotch` (75K+ ⭐) - Lightweight, browser-based
- **Alternative:** `usebruno/bruno` (29K+ ⭐) - Offline-first API client

### Documentation
- **Component Docs:** `storybookjs/storybook` (85K+ ⭐) - UI component explorer
- **Static Sites:** `facebook/docusaurus` (59K+ ⭐) - Documentation websites
- **API Docs:** `TypeStrong/typedoc` (8K+ ⭐) - TypeScript documentation generator

### Decision Guide
| Need | Choose | Why |
|------|--------|-----|
| Lint + Format | Biome | 25x faster, unified config |
| Monorepo (Next.js) | Turborepo | Fast builds, simple |
| Monorepo (Enterprise) | Nx | Advanced features, mature |
| Frontend Build | Vite | Instant dev, modern |
| API Testing | Hoppscotch | Open-source, Git-friendly |

---

## Code Quality & Formatting Tools

### Modern All-in-One Solution

**⭐ biomejs/biome** (21,568 stars) ⚡ ESSENTIAL
- Unified toolchain for formatting, linting, and type-checking
- 🔗 https://github.com/biomejs/biome
- **Use Case:** Replace ESLint + Prettier stack with single tool
- **Performance:** 25x faster than Prettier, 15x faster than ESLint
- **Configuration:** Single `biome.json` file for all rules
- **2025 Status:** Active development, Biome 2.0 on roadmap
- **Limitations:** Less support for Vue, Markdown, YAML; not all ESLint plugins covered yet

### Traditional Stack (Still Widely Used)

**⭐ eslint/eslint** (~29,000 stars) ⚡ HIGHLY RECOMMENDED
- Industry-standard JavaScript linter
- 🔗 https://github.com/eslint/eslint
- **Use Case:** When you need extensive plugin ecosystem or specific third-party rules
- **2025 Note:** Still the standard, but Biome is gaining rapid adoption

**⭐ prettier/prettier** (~49,000 stars) ⚡ HIGHLY RECOMMENDED
- Opinionated code formatter
- 🔗 https://github.com/prettier/prettier
- **Use Case:** When working with formats Biome doesn't fully support (Vue, Markdown, YAML)
- **2025 Note:** Still excellent, but consider Biome for new projects

---

## Monorepo Management

### Decision Guide: Which Monorepo Tool?

| Tool | Best For | Strengths | Backed By |
|------|----------|-----------|-----------|
| **Turborepo** | Build optimization, simplicity | Fast builds, intelligent caching, easy migration | Vercel |
| **Nx** | Complex enterprise projects | Advanced dependency management, rich plugins, project graphs | Nrwl (acquired Lerna) |
| **pnpm workspaces** | Flexibility, efficiency | Fast installs, small disk footprint, simple setup | Community |

### Turborepo

**⭐ vercel/turborepo** (28,846 stars) ⚡ ESSENTIAL
- Build system optimized for JavaScript and TypeScript, written in Rust
- 🔗 https://github.com/vercel/turborepo
- **Use Case:** Fast monorepo build system with intelligent caching
- **2025 Features:** 30s initial builds → 0.2s cached builds, agnostic design allows fallback to npm/yarn/pnpm
- **Best Practice:** Combine with pnpm for optimal performance

**⭐ midday-ai/v1** (3,743 stars)
- Open-source starter kit based on Midday
- 🔗 https://github.com/midday-ai/v1
- **Use Case:** Production Turborepo example with best practices

**⭐ ducktors/turborepo-remote-cache** (1,305 stars)
- Open source implementation of Turborepo custom remote cache server
- 🔗 https://github.com/ducktors/turborepo-remote-cache
- **Use Case:** Self-hosted Turborepo cache for teams

**⭐ dan5py/turborepo-shadcn-ui** (650 stars)
- Turborepo starter with shadcn/ui pre-configured
- 🔗 https://github.com/dan5py/turborepo-shadcn-ui
- **Use Case:** Turborepo with modern UI components

### Nx

**⭐ nrwl/nx** (27,200 stars) ⚡ HIGHLY RECOMMENDED
- Smart monorepo tool with advanced features and extensive tooling
- 🔗 https://github.com/nrwl/nx
- **Use Case:** Complex, enterprise-level projects with deep customization needs
- **2025 Features:** Distributed execution across 50+ machines, Rust port in progress, acquired Lerna
- **Best For:** Large-scale applications requiring advanced dependency management and project graph visualization

### Package Management

**⭐ pnpm/pnpm** (~29,000 stars) ⚡ HIGHLY RECOMMENDED
- Fast, disk space efficient package manager
- 🔗 https://github.com/pnpm/pnpm
- **Use Case:** Content-addressable storage for faster installs and smaller disk footprint
- **2025 Recommendation:** Combine with Turborepo or use pnpm workspaces alone for simpler projects

**⭐ JamieMason/syncpack** (1,818 stars) ⚡ HIGHLY RECOMMENDED
- Consistent dependency versions in large JavaScript Monorepos
- 🔗 https://github.com/JamieMason/syncpack
- **Use Case:** Essential for maintaining version consistency across monorepo packages

### Mobile/React Native

**⭐ byCedric/expo-monorepo-example** (948 stars)
- Fast pnpm monorepo for cross-platform apps built with Expo / React Native
- 🔗 https://github.com/byCedric/expo-monorepo-example
- **Use Case:** Expo + React Native monorepo architecture

---

## API Development & Testing Tools

### Modern API Clients (2025)

**⭐ hoppscotch/hoppscotch** (74,963 stars) ⚡ ESSENTIAL
- Open source API development ecosystem
- 🔗 https://github.com/hoppscotch/hoppscotch
- **Use Case:** Lightweight, browser-based API testing for REST, GraphQL, WebSocket
- **2025 Features:** Code generation for 13+ languages, no installation required
- **Best For:** Individual developers, lightweight teams, browser-first workflow

**⭐ usebruno/bruno** (35,900 stars) ⚡ HIGHLY RECOMMENDED
- Fast, Git-friendly open source API client
- 🔗 https://github.com/usebruno/bruno
- **Use Case:** File-based API collections using plain text Bru format
- **2025 Features:** Perfect Git integration, offline-first, stores collections in project folder
- **Best For:** Teams prioritizing Git-based collaboration and version control

**⭐ Kong/insomnia** (~34,000 stars) ⚡ HIGHLY RECOMMENDED
- Powerful API client with robust functionality
- 🔗 https://github.com/Kong/insomnia
- **Use Case:** Design-first API development with auto-code generation
- **2025 Features:** Extensive feature set, supports modern protocols
- **Best For:** Enterprise teams, complex API workflows

### CLI Tools

**⭐ httpie/http-prompt** (9,074 stars)
- Interactive command-line HTTP and API testing client built on HTTPie
- 🔗 https://github.com/httpie/http-prompt
- **Use Case:** Interactive CLI for API testing and debugging

---

## Documentation Tools

### Component Documentation

**⭐ storybookjs/storybook** (87,934 stars) ⚡ ESSENTIAL
- Industry standard workshop for building, documenting, and testing UI components
- 🔗 https://github.com/storybookjs/storybook
- **Use Case:** THE component development environment
- **2025 Status:** Actively maintained with continuous updates for modern UI trends
- **Best For:** Design systems, component libraries, isolated UI development

### Static Site Generators

**⭐ facebook/docusaurus** (~59,000 stars) ⚡ HIGHLY RECOMMENDED
- Modern static site generator for documentation, backed by Meta
- 🔗 https://github.com/facebook/docusaurus
- **Use Case:** Developer documentation, open-source project docs
- **2025 Features:** React + MDX, versioning, localization, modern performance
- **Best For:** Open-source projects, developer portals, API documentation

**⭐ docsifyjs/docsify** (30,507 stars) ⚡ HIGHLY RECOMMENDED
- Magical documentation site generator
- 🔗 https://github.com/docsifyjs/docsify
- **Use Case:** Zero-config documentation site generator
- **Best For:** Quick documentation sites without build steps

### API Documentation

**⭐ jsdoc/jsdoc** (15,331 stars)
- Standard API documentation generator for JavaScript
- 🔗 https://github.com/jsdoc/jsdoc
- **Use Case:** Inline JavaScript documentation with type annotations
- **2025 Note:** Still relevant for JavaScript projects not using TypeScript

### Best Practices

**⭐ race2infinity/The-Documentation-Compendium** (5,816 stars)
- README templates & tips on writing high-quality documentation
- 🔗 https://github.com/race2infinity/The-Documentation-Compendium
- **Use Case:** Documentation templates and best practices for any project

---

## Style Guides & Code Standards

**⭐ airbnb/javascript** (147,612 stars) ⚡ ESSENTIAL
- The industry-standard JavaScript Style Guide
- 🔗 https://github.com/airbnb/javascript
- **Use Case:** JavaScript coding standards and best practices
- **2025 Status:** Still the gold standard for JavaScript style

**⭐ standard/standard** (29,371 stars)
- JavaScript Style Guide, with linter & automatic code fixer
- 🔗 https://github.com/standard/standard
- **Use Case:** Zero-config JavaScript style guide
- **Best For:** Projects wanting consistent style without configuration debates

---

## Developer Productivity Tools

### VS Code Extensions (2025 Essentials)

**AI-Powered Coding**
- **GitHub Copilot** ⚡ ESSENTIAL - AI pair programmer with context-aware suggestions
- **Cursor** - AI-first code editor built on VS Code

**Code Quality**
- **ESLint** ⚡ ESSENTIAL - Real-time linting with Quick Fixes
- **SonarLint** - Find bugs and security issues with 200+ JS/TS rules
- **Prettier** ⚡ ESSENTIAL - Automatic code formatting

**Node.js Development**
- **Node.js Modules Intellisense** - Auto-completion for Node.js modules
- **npm Intellisense** - Autocomplete npm modules in import statements
- **Path Intellisense** - File path autocomplete

**Testing & Debugging**
- **Jest** - Integrated Jest testing with IDE productivity features
- **Quokka.js** - Rapid JavaScript/TypeScript prototyping with live feedback
- **JavaScript Debugger** - Built-in debugging for Node.js

**Productivity**
- **JavaScript (ES6) Code Snippets** - ES6 syntax snippets
- **Auto Rename Tag** - Automatically rename paired HTML/XML tags
- **GitLens** - Supercharge Git within VS Code

### Terminal Tools

**⭐ starship/starship** (~46,000 stars) ⚡ HIGHLY RECOMMENDED
- Minimal, blazing fast, and infinitely customizable prompt for any shell
- 🔗 https://github.com/starship/starship
- **Use Case:** Modern terminal prompt with smart context awareness
- **2025 Status:** Now the standard recommendation (Powerlevel10k is on life support)
- **Features:** Written in Rust for speed, TOML configuration, cross-shell support

**Modern Shell Tools**
- **zsh** - Modern shell with rich plugin ecosystem
- **zsh-autosuggestions** - Fish-like command suggestions based on history
- **zsh-syntax-highlighting** - Real-time command validation (green = valid, red = invalid)
- **zoxide** - Smarter `cd` that learns your most-used directories
- **eza** - Modern `ls` replacement with colors and icons

### All-in-One Tools

**⭐ CorentinTh/it-tools** (33,402 stars) ⚡ HIGHLY RECOMMENDED
- Collection of handy online tools for developers with great UX
- 🔗 https://github.com/CorentinTh/it-tools
- **Use Case:** Swiss Army knife of developer utilities
- **2025 Features:** JWT debugger, hash generators, converters, formatters, and more

**⭐ guarinogabriel/Mac-CLI** (9,000 stars)
- macOS command line tool for developers
- 🔗 https://github.com/guarinogabriel/Mac-CLI
- **Use Case:** Automation and management for Mac developers

---

## Project Management

**⭐ automazeio/ccpm** (5,097 stars)
- Project management system for Claude Code using GitHub Issues and Git worktrees
- 🔗 https://github.com/automazeio/ccpm
- **Use Case:** AI-powered project management integrated with development workflow

---

## Quick Reference

### Tool Selection Decision Trees

**Code Quality Stack (Choose One Path)**

Path A - Modern All-in-One (2025 Recommended):
- ✅ Biome for formatting + linting
- ✅ TypeScript for type checking
- ✅ Benefit: 25x faster, single config file, simplified setup

Path B - Traditional Stack (Still Valid):
- ✅ ESLint for linting
- ✅ Prettier for formatting
- ✅ TypeScript for type checking
- ✅ Benefit: Mature ecosystem, extensive plugins

**Monorepo Strategy**

For Build Speed & Simplicity:
- ✅ Turborepo + pnpm workspaces
- ✅ Syncpack for version management

For Enterprise Complexity:
- ✅ Nx + pnpm
- ✅ Advanced dependency graphs and distributed execution

For Flexibility:
- ✅ pnpm workspaces alone
- ✅ Combine with Vite for builds

**API Testing**

For Individual Developers:
- ✅ Hoppscotch (browser-based, lightweight)

For Git-Friendly Teams:
- ✅ Bruno (file-based, version control)

For Enterprise Workflows:
- ✅ Insomnia (feature-rich, design-first)

**Documentation**

For Components:
- ✅ Storybook (component development + docs)

For Project Documentation:
- ✅ Docusaurus (feature-rich, versioning)
- ✅ Docsify (zero-config, lightweight)

For API Docs:
- ✅ TypeScript + JSDoc
- ✅ Docusaurus for static site

### Essential Tools Checklist for New Projects

**Must Have:**
- [ ] Code Quality: Biome OR ESLint + Prettier
- [ ] Version Control: Git + GitHub/GitLab
- [ ] Package Manager: pnpm (or npm/yarn)
- [ ] API Testing: Hoppscotch or Bruno
- [ ] Terminal: Starship + zsh

**For Monorepos:**
- [ ] Build System: Turborepo or Nx
- [ ] Version Management: Syncpack
- [ ] Remote Cache: Consider self-hosted option

**For Component Libraries:**
- [ ] Storybook for development
- [ ] Docusaurus or Docsify for documentation
- [ ] Versioning strategy (semantic release)

**Developer Experience:**
- [ ] VS Code with ESLint + Prettier extensions
- [ ] GitHub Copilot or AI assistant
- [ ] Jest + Testing Library
- [ ] GitLens for enhanced Git workflow

### Performance Benchmarks (2025)

**Code Formatting & Linting:**
- Biome: 25x faster than Prettier, 15x faster than ESLint
- Expected: 80% faster build pipelines

**Build Caching:**
- Turborepo: 30s initial build → 0.2s cached build
- Nx: Distributed execution scales across 50+ machines

**Package Installation:**
- pnpm: 2-3x faster than npm, 50% less disk space

### Top 2025 Trends

1. **Rust-Based Tooling**: Biome, Turborepo, Starship - Rust tools dominating for speed
2. **Git-Friendly Workflows**: Bruno, pnpm, file-based configurations
3. **All-in-One Tools**: Biome replacing multi-tool stacks, reducing complexity
4. **AI Integration**: GitHub Copilot, Cursor becoming essential
5. **Monorepo Adoption**: Enterprise teams moving to Turborepo/Nx
6. **Browser-First API Testing**: Hoppscotch gaining popularity over desktop clients

### Migration Guides

**From ESLint + Prettier to Biome:**
1. Install: `npm install --save-dev @biomejs/biome`
2. Initialize: `npx @biomejs/biome init`
3. Migrate: `npx @biomejs/biome migrate eslint --write`
4. Remove old configs and dependencies
5. Test: Run `npx @biomejs/biome check --write .`

**From npm/yarn to pnpm:**
1. Install pnpm: `npm install -g pnpm`
2. Import: `pnpm import` (converts lockfile)
3. Install: `pnpm install`
4. Update scripts: `package.json` scripts work unchanged
5. Commit: `.npmrc` and `pnpm-lock.yaml`

**From Postman to Bruno/Hoppscotch:**
1. Export collections from Postman (JSON format)
2. Import to Bruno or Hoppscotch
3. Commit collections to Git (Bruno) or save to browser (Hoppscotch)
4. Update team workflow documentation

---

*Part of octocode-mcp resources collection*
