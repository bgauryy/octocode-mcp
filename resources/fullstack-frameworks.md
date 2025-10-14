# Full-Stack Frameworks & UI Libraries

> Node.js full-stack frameworks, UI component libraries, and data visualization

**🎯 Purpose:** Framework resources for AI agents building Node.js/TypeScript applications  
**🌐 Focus:** Next.js 15, React frameworks - JavaScript/TypeScript ecosystem  
**⚙️ Runtime:** All frameworks run on Node.js (Next.js, Remix, Astro)  
**📅 Updated:** October 14, 2025

---

## Quick Reference

### Full-Stack Frameworks (Start Here)
- **#1 Choice (95%):** `vercel/next.js` (143K+ ⭐) - Next.js 15 with React 19, SSR/SSG/ISR
- **Fast SPAs:** `vitejs/vite` (72K+ ⭐) - Lightning-fast dev, no SSR needed
- **Edge-Native:** `remix-run/remix` (30K+ ⭐) - Edge-first, nested routing
- **Content-Heavy:** `withastro/astro` (49K+ ⭐) - Static sites, multi-framework

### Decision Guide: Which Framework?
| Need | Choose | Why |
|------|--------|-----|
| Full-Stack + SEO | Next.js 15 | SSR/SSG/ISR, React 19, production-ready |
| Fast SPA (no SSR) | Vite + React | Instant dev, simple, client-only |
| Edge + Real-time | Remix | Edge-native, nested routes, data loading |
| Static Content | Astro | Minimal JS, fast builds, multi-framework |

### UI Component Libraries (See frontend-libs.md)
- **#1 Choice:** Shadcn UI - Copy/paste, Tailwind + TypeScript
- **Enterprise:** Material UI (97K+ ⭐) - Complete design system
- **Developer-Friendly:** Chakra UI (39K+ ⭐) - Accessible, themeable

### Charts & Visualization
- **Best Overall:** `apache/echarts` (61K+ ⭐) - Enterprise-grade, feature-rich
- **React Simple:** `recharts/recharts` (25K+ ⭐) - Declarative React charts
- **Full Power:** `d3/d3` (109K+ ⭐) - Ultimate flexibility, steep learning curve

### When to Choose Each Chart Library
| Need | Choose | Why |
|------|--------|-----|
| Enterprise Dashboards | ECharts | Feature-rich, performant, professional |
| React Integration | Recharts | Simple API, declarative, React-native |
| Custom Visualizations | D3 | Maximum flexibility, full control |

---

## Full-Stack Frameworks

### Next.js - THE React Framework

**⭐ vercel/next.js** (143,000+ stars) ⚡ ESSENTIAL
- The React Framework for the Web - Used by Netflix, TikTok, Hulu, Notion, Target, Nike
- 🔗 https://github.com/vercel/next.js
- **Use Case:** Production-ready React apps, SSR/SSG, SEO-heavy sites, e-commerce, SaaS platforms, AI-powered dashboards

**Why Next.js 15 in 2025:**
- **React 19 Integration:** Full support with streaming UI components as they become ready
- **Partial Prerendering (Stable):** Revolutionary performance - pre-renders only essential parts during build time, dynamic content loads progressively
- **Enhanced Form Component:** Built-in `<Form>` with prefetching, client-side navigation, and progressive enhancement
- **Turbopack in Dev:** Stable release with 15.5+ beta for builds - significantly faster than Webpack
- **Image Optimization:** Automatic format detection (WebP/AVIF), 30% bandwidth reduction
- **App Router:** Modern routing with Server Components, layouts, and nested routes
- **Edge Runtime:** Improved edge support with WebAssembly integration

**2025 Best Practices:**
- Use App Router (not Pages Router) for new projects
- Leverage Server Components for data fetching
- Implement Partial Prerendering for optimal performance
- Write 80%+ test coverage with automated E2E tests
- Use semantic HTML and AA accessibility standards
- Keep state management close to consuming components

**When to Choose Next.js:**
- ✅ You need a flexible framework that scales from MVP to enterprise
- ✅ SEO and performance are critical (e-commerce, media, marketing sites)
- ✅ You want the full React ecosystem with production-grade features
- ✅ You need multiple rendering strategies (SSR, SSG, ISR, streaming)
- ✅ You're building SaaS applications or complex web apps
- ✅ Your team is already familiar with React

**When to Choose Alternatives:**
- ❌ Content-heavy static sites with minimal interactivity → Use **Astro**
- ❌ Need edge-native with heavy real-time data handling → Use **Remix**
- ❌ Want to avoid React entirely → Use **SvelteKit**
- ❌ Simple SPA without SSR → Use **Vite + React**

---

### Vite + React - Fast Development for SPAs

**⭐ vitejs/vite** (72,000+ stars) ⚡ HIGHLY RECOMMENDED
- Next Generation Frontend Tooling - Instant server start, lightning-fast HMR
- 🔗 https://github.com/vitejs/vite
- **Use Case:** Client-side SPAs, dashboards, admin panels, internal tools (no SSR needed)

**Why Vite in 2025:**
- **Lightning Fast Dev:** Instant server start, sub-100ms HMR updates
- **Simple Setup:** Zero-config for most use cases, minimal boilerplate
- **Modern by Default:** ESM-first, native TypeScript, modern CSS
- **Framework Agnostic:** Works with React, Vue, Svelte, vanilla JS
- **Production Optimized:** Uses Rollup for efficient bundling
- **Rich Plugin Ecosystem:** Extensive plugin support for any need

**Best Paired With:**
- React 19 + TypeScript for modern React development
- React Router for client-side routing
- TanStack Query for data fetching
- Shadcn UI for components

**When to Choose Vite:**
- ✅ You're building a client-side SPA (no SSR requirement)
- ✅ You want the fastest possible development experience
- ✅ You need a simple, lightweight framework setup
- ✅ You're building dashboards, admin panels, or internal tools
- ✅ SEO is not a priority for your application

**When NOT to Choose Vite:**
- ❌ You need server-side rendering or static site generation → Use **Next.js**
- ❌ SEO is critical for your application → Use **Next.js** or **Astro**
- ❌ You need built-in backend API routes → Use **Next.js** or **Remix**

**Trade-offs:**
- No built-in SSR/SSG (client-side only by default)
- Need to add routing, data fetching libraries manually
- Better for apps behind auth, not public-facing marketing sites

---

### Remix - Edge-Native Full-Stack React

**⭐ remix-run/remix** (30,000+ stars) ⚡ HIGHLY RECOMMENDED
- Build Better Websites with React (Now React Router 7)
- 🔗 https://github.com/remix-run/remix
- **Use Case:** Data-intensive apps, real-time dashboards, edge-first architecture, web standards-focused

**Key Strengths:**
- Edge-native by design with unified client-server architecture
- Exceptional data handling with web standards (FormData, fetch)
- Nested routing with per-route error boundaries
- Progressive enhancement by default
- No client-side bundle for data fetching

**When to Choose Remix:**
- ✅ Your app requires heavy data handling and real-time updates
- ✅ You want edge-native deployment from the start
- ✅ You prioritize web standards and progressive enhancement
- ✅ You're building interactive e-commerce or real-time platforms
- ✅ You need excellent form handling and mutations

---

### Astro - The Content Framework

**⭐ withastro/astro** (50,000+ stars) ⚡ HIGHLY RECOMMENDED
- Build fast websites, faster - Used by IKEA, NordVPN, Porsche, Cloudflare, StackBlitz
- 🔗 https://github.com/withastro/astro
- **Use Case:** Content-heavy sites, blogs, documentation, marketing pages, static sites with SEO priority

**Key Strengths:**
- Island Architecture: Zero JavaScript by default, hydrate only what's needed
- Multi-framework support: Use React, Vue, Svelte in the same project
- Outstanding performance: Loads JavaScript only where necessary
- Static-first with optional dynamic routes
- Built-in optimizations for images, fonts, and assets

**When to Choose Astro:**
- ✅ You're building content-focused sites (blogs, docs, landing pages)
- ✅ SEO and load speed are top priorities
- ✅ You want minimal JavaScript shipped to the client
- ✅ You need to use multiple frameworks in one project
- ✅ Cost-effective hosting with static site generation

**Performance Note:** Unlike Next.js full-page hydration, Astro's island architecture hydrates individual components selectively, making it significantly faster for content sites.

---

### SvelteKit - Streamlined Web Development

**⭐ sveltejs/kit** (19,000+ stars) ⚡ HIGHLY RECOMMENDED
- Web development, streamlined
- 🔗 https://github.com/sveltejs/kit
- **Use Case:** Fast, lightweight full-stack apps, SPAs with SSR, developer-friendly projects

**Key Strengths:**
- Smaller bundle sizes than React-based frameworks
- Write less code with Svelte's compile-time approach
- Built-in state management without external libraries
- Excellent developer experience
- SSR, SSG, and SPA modes

**When to Choose SvelteKit:**
- ✅ You want the smallest possible bundle size
- ✅ You prefer simpler, more readable code
- ✅ You're building internal tools or dashboards
- ✅ Your team wants to learn a modern, non-React framework

---

### Enterprise Backend Frameworks

**⭐ nestjs/nest** (73,034 stars) ⚡ ESSENTIAL
- Progressive Node.js framework for enterprise-grade server-side applications
- 🔗 https://github.com/nestjs/nest
- **Use Case:** Enterprise APIs, microservices, scalable TypeScript backends

**⭐ django/django** (83,000+ stars) ⚡ ESSENTIAL
- The Web framework for perfectionists with deadlines
- 🔗 https://github.com/django/django
- **Use Case:** Data-intensive dashboards, rapid development, admin panels

**⭐ laravel/laravel** (79,000+ stars) ⚡ HIGHLY RECOMMENDED
- PHP web application framework
- 🔗 https://github.com/laravel/laravel
- **Use Case:** Authentication-heavy web apps, PHP applications

**⭐ rails/rails** (56,000+ stars) ⚡ HIGHLY RECOMMENDED
- Ruby on Rails web application framework
- 🔗 https://github.com/rails/rails
- **Use Case:** MVPs, CRUD-heavy apps, rapid prototyping

**⭐ spring-projects/spring-boot** (78,000+ stars)
- Spring Boot helps you to create stand-alone, production-grade Spring applications
- 🔗 https://github.com/spring-projects/spring-boot
- **Use Case:** Enterprise Java applications, robust full-stack apps

---

## UI Component Libraries

### 2025 UI Library Trends

The React UI landscape in 2025 is evolving from fully-featured libraries (MUI, Ant Design) to headless kits (Radix) to copy-and-own solutions (Shadcn UI) for ultimate control. **Tailwind CSS integration** is a major theme, with developers prioritizing customization alongside pre-built components.

**Key Decision Factors:**
- **Customization vs Speed:** Shadcn UI (maximum flexibility) vs MUI/Ant Design (rapid development)
- **Bundle Size:** Older libraries require bundle discipline; modern solutions are more optimized
- **Team Experience:** Enterprise teams prefer MUI/Ant Design; modern teams prefer Shadcn UI
- **Design System:** Material Design → MUI; Custom design → Shadcn UI + Tailwind

---

### Shadcn UI - The 2025 Winner

**⭐ shadcn-ui/ui** (66,000+ stars) ⚡ HIGHLY RECOMMENDED
- Beautifully designed components built with Radix UI and Tailwind CSS
- 🔗 https://github.com/shadcn/ui
- **Use Case:** Maximum customization, Tailwind-based projects, modern design systems

**Why Shadcn UI is Dominating 2025:**
- **Copy-and-own model:** Components live in YOUR codebase, not a package
- **Full control:** Direct access to component code for any modification
- **Tailwind-first:** Utility classes enable rapid design changes
- **Accessible by default:** Built on Radix UI primitives
- **No lock-in:** You own the code, modify freely

**Best For:**
- ✅ Teams that want maximum design flexibility
- ✅ Projects using Tailwind CSS
- ✅ Developers who want to understand and modify components
- ✅ Modern design systems that don't follow Material Design

**Pairs Well With:**
- Radix UI (accessibility primitives)
- Tailwind CSS (styling)
- Next.js (full-stack framework)

---

### Material UI (MUI) - Enterprise Standard

**⭐ mui/material-ui** (94,000+ stars) ⚡ ESSENTIAL
- Comprehensive React component library implementing Google's Material Design
- 🔗 https://github.com/mui/material-ui
- **Use Case:** Enterprise-grade UI, Material Design adherence, extensive component needs

**Key Strengths:**
- 1.1M weekly downloads - the most popular React UI library
- Comprehensive, well-documented component library
- Powerful theme customization API
- Excellent TypeScript support
- Battle-tested in large-scale applications

**Best For:**
- ✅ Enterprise-grade applications requiring scalability
- ✅ Teams that like Material Design aesthetic
- ✅ Projects needing comprehensive out-of-the-box components
- ✅ Applications with complex data tables and forms

**Trade-offs:**
- Material Design aesthetic may not fit every brand
- Larger bundle size (requires optimization)
- Customization can be complex for non-Material designs

---

### Ant Design - Enterprise UI System

**⭐ ant-design/ant-design** (91,500+ stars) ⚡ ESSENTIAL
- Enterprise-class UI design system for web applications
- 🔗 https://github.com/ant-design/ant-design
- **Use Case:** Enterprise applications, data visualization, forms and tables, admin dashboards

**Key Strengths:**
- 1.3M weekly downloads
- Comprehensive component library for complex UIs
- Built-in data visualization components (tables, charts)
- Dozens of languages supported with i18n
- Heavily opinionated for consistency

**Best For:**
- ✅ Large-scale design systems
- ✅ Data-heavy enterprise applications
- ✅ International applications (excellent i18n)
- ✅ Teams wanting opinionated, consistent design

---

### Modern UI Libraries

**⭐ chakra-ui/chakra-ui** (39,000+ stars) ⚡ HIGHLY RECOMMENDED
- Simple, modular and accessible component library
- 🔗 https://github.com/chakra-ui/chakra-ui
- **Use Case:** Accessible UI, hook-based components, modals, tooltips

**⭐ mantinedev/mantine** (29,000+ stars) ⚡ HIGHLY RECOMMENDED
- Fully featured React components library
- 🔗 https://github.com/mantinedev/mantine
- **Use Case:** Modern UI, notifications, extensive hooks library

**⭐ tremorlabs/tremor** (18,000+ stars)
- React library to build charts and dashboards fast
- 🔗 https://github.com/tremorlabs/tremor
- **Use Case:** Modern dashboard components, Tailwind-based analytics

**⭐ primefaces/primereact** (7,500+ stars)
- Rich set of open source UI components for React
- 🔗 https://github.com/primefaces/primereact
- **Use Case:** Trees, calendars, advanced data tables, enterprise features

---

### Headless & Unstyled Libraries

**⭐ tailwindlabs/headlessui** (28,043 stars) ⚡ HIGHLY RECOMMENDED
- Completely unstyled, fully accessible UI components
- 🔗 https://github.com/tailwindlabs/headlessui
- **Use Case:** Tailwind's official unstyled components (menus, dialogs, transitions)

**⭐ radix-ui/primitives** (17,994 stars) ⚡ HIGHLY RECOMMENDED
- Unstyled, accessible components for building high-quality design systems
- 🔗 https://github.com/radix-ui/primitives
- **Use Case:** Accessible primitives, foundation for Shadcn UI

---

### Traditional & Specialized Libraries

**⭐ react-bootstrap/react-bootstrap** (23,000+ stars)
- Bootstrap components built with React
- 🔗 https://github.com/react-bootstrap/react-bootstrap
- **Use Case:** Bootstrap-based projects, grids, carousels

**⭐ microsoft/fluentui** (19,000+ stars)
- Microsoft's Fluent UI web components
- 🔗 https://github.com/microsoft/fluentui
- **Use Case:** Microsoft-style UI, enterprise Windows-like applications

**⭐ palantir/blueprint** (21,000+ stars)
- React-based UI toolkit for the web
- 🔗 https://github.com/palantir/blueprint
- **Use Case:** Desktop-focused React components, data-heavy apps

**⭐ adobe/react-spectrum** (14,000+ stars)
- React components built with accessibility in mind
- 🔗 https://github.com/adobe/react-spectrum
- **Use Case:** Adobe's accessibility-first components, complex UIs

---

## Charts & Visualization

### 2025 Chart Library Trends

**Performance and complexity considerations:**
- **Simple dashboards:** Recharts or Chart.js (easiest learning curve)
- **Complex enterprise dashboards:** ECharts (handles 10,000+ data points efficiently)
- **Custom visualizations:** D3.js or Visx (maximum flexibility, steeper learning curve)
- **React-first projects:** Recharts, Visx, or Nivo (React-optimized)

**Key Insight:** ECharts has the widest range of chart types (second only to D3) while maintaining high user-friendliness, making it the best general-purpose choice for 2025.

---

### ECharts - Enterprise Visualization Leader

**⭐ apache/echarts** (63,000+ stars) ⚡ ESSENTIAL
- Powerful, interactive charting and data visualization library
- 🔗 https://github.com/apache/echarts
- **Use Case:** Complex enterprise dashboards, 100+ chart types, large datasets (10,000+ points)

**Why ECharts Leads in 2025:**
- **WebGL Support:** Efficiently renders tens of thousands of data points without performance issues
- **Comprehensive:** Widest range of built-in chart types (Gantt, radar, heatmaps, 3D, geographic)
- **Framework Agnostic:** Works with Angular, React, Vue.js
- **Dual Rendering:** Supports both SVG and Canvas
- **User-Friendly:** Unlike D3, doesn't require deep visualization expertise

**Best For:**
- ✅ Enterprise applications with complex data visualization needs
- ✅ Large datasets requiring high performance
- ✅ Teams needing comprehensive chart types out-of-the-box
- ✅ Dashboards with Gantt charts, geographic maps, or 3D visualizations

**Performance:** Handles the largest datasets efficiently while maintaining ease of use.

---

### Recharts - Simple React Charts

**⭐ recharts/recharts** (24,800+ stars) ⚡ HIGHLY RECOMMENDED
- Redefined chart library built with React and D3
- 🔗 https://github.com/recharts/recharts
- **Use Case:** Standard React charts (line, bar, area, pie), dashboard applications

**Key Strengths:**
- Excellent documentation and ease of use
- Composable React components
- Strong performance with large datasets
- SVG-based rendering
- Perfect for standard chart types

**Best For:**
- ✅ React applications needing standard charts
- ✅ Teams wanting simple, declarative chart components
- ✅ Dashboard applications with common chart types
- ✅ Projects prioritizing developer experience

**Trade-off:** Less customization than D3 or ECharts, but much easier to use.

---

### D3.js - Maximum Customization

**⭐ d3/d3** (110,000+ stars) ⚡ ESSENTIAL
- Data-Driven Documents - The standard for custom visualizations
- 🔗 https://github.com/d3/d3
- **Use Case:** Unique, highly customized visualizations, data journalism, research visualizations

**Key Strengths:**
- Ultimate flexibility and customization
- Granular control over every visual element
- Most powerful for creating novel visualizations
- Industry standard for custom data visualization

**Best For:**
- ✅ Unique visualizations that don't fit standard chart types
- ✅ Data journalism and research projects
- ✅ Teams with strong JavaScript and SVG expertise
- ✅ Projects where visual design is critical

**Trade-off:** Steeper learning curve, requires more development time than pre-built libraries.

---

### Modern Visualization Libraries

**⭐ apexcharts/apexcharts.js** (15,000+ stars) ⚡ HIGHLY RECOMMENDED
- Modern charting library for interactive visualizations
- 🔗 https://github.com/apexcharts/apexcharts.js
- **Use Case:** Interactive charts (Gantt, radar), modern design, React support

**⭐ plouc/nivo** (14,000+ stars) ⚡ HIGHLY RECOMMENDED
- Rich set of data visualization components built on D3
- 🔗 https://github.com/plouc/nivo
- **Use Case:** D3-powered React charts, highly customizable, responsive

**⭐ airbnb/visx** (20,000+ stars)
- Collection of expressive, low-level visualization primitives for React
- 🔗 https://github.com/airbnb/visx
- **Use Case:** D3 primitives for React, scalable custom visualizations

**⭐ chartjs/Chart.js** (66,000+ stars)
- Simple yet flexible JavaScript charting library
- 🔗 https://github.com/chartjs/Chart.js
- **Use Case:** Lightweight charts, canvas-based, easy setup

**⭐ FormidableLabs/victory** (11,000+ stars)
- Collection of composable React components for building interactive data visualizations
- 🔗 https://github.com/FormidableLabs/victory
- **Use Case:** Custom charts, web/mobile compatible, composable components

**⭐ ant-design/ant-design-charts** (2,000+ stars)
- Simple and easy to use React chart library based on G2Plot
- 🔗 https://github.com/ant-design/ant-design-charts
- **Use Case:** Enterprise charts, Ant Design integration, heatmaps

---

## 3D Graphics & WebGL

### Three.js - The 3D Standard

**⭐ mrdoob/three.js** (110,000+ stars) ⚡ ESSENTIAL
- JavaScript 3D library
- 🔗 https://github.com/mrdoob/three.js
- **Use Case:** THE standard for 3D web graphics, animations, games, product visualizations

**Why Three.js is Essential:**
- Industry-standard 3D library for the web
- Comprehensive 3D rendering capabilities
- WebGL abstraction with fallback support
- Massive ecosystem and community
- Used by major companies and creative studios

**Best For:**
- ✅ Any 3D visualization on the web
- ✅ Product configurators and 3D showcases
- ✅ Interactive 3D experiences
- ✅ WebGL games and simulations

---

### React Three Fiber - Declarative Three.js

**⭐ pmndrs/react-three-fiber** (29,644 stars) ⚡ HIGHLY RECOMMENDED
- React renderer for Three.js
- 🔗 https://github.com/pmndrs/react-three-fiber
- **Use Case:** Declarative Three.js for React, 3D graphics in React applications

**⭐ pmndrs/drei** (9,000+ stars) ⚡ HIGHLY RECOMMENDED
- Useful helpers for React Three Fiber
- 🔗 https://github.com/pmndrs/drei
- **Use Case:** Utilities for React Three Fiber, common 3D tasks

**Best For:**
- ✅ React developers building 3D experiences
- ✅ Declarative approach to 3D graphics
- ✅ Integration with React component architecture

---

### Alternative 3D Engines

**⭐ BabylonJS/Babylon.js** (24,000+ stars)
- Powerful, beautiful, simple, open game and rendering engine
- 🔗 https://github.com/BabylonJS/Babylon.js
- **Use Case:** 3D games, VR/AR applications, advanced rendering

**⭐ aframevr/aframe** (17,000+ stars)
- Web framework for building 3D/AR/VR experiences
- 🔗 https://github.com/aframevr/aframe
- **Use Case:** HTML-based VR with Three.js, accessible 3D

**⭐ playcanvas/engine** (10,000+ stars)
- Fast and lightweight JavaScript game engine
- 🔗 https://github.com/playcanvas/engine
- **Use Case:** Game-oriented WebGL, 2D/3D games

---

*Part of octocode-mcp resources collection*
