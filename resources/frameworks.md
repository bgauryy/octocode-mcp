# Full-Stack Frameworks & UI Libraries

> Comprehensive collection of full-stack frameworks, UI component libraries, charting solutions, and 3D graphics frameworks for modern web development.

**Last Updated:** October 13, 2025

---

## Table of Contents
1. [Full-Stack Frameworks](#full-stack-frameworks)
2. [UI Component Libraries](#ui-component-libraries)
3. [Charts & Visualization](#charts--visualization)
4. [3D Graphics & WebGL](#3d-graphics--webgl)
5. [Quick Reference & Decision Guide](#quick-reference--decision-guide)

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

## Quick Reference & Decision Guide

### Full-Stack Framework Decision Tree

**Choose Next.js if:**
- You need production-ready React with all rendering strategies
- SEO and performance are critical
- You want the largest ecosystem and job market
- You're building e-commerce, SaaS, or content platforms
- **→ 95% of React projects should start here**

**Choose Remix if:**
- Your app is data-intensive with heavy mutations
- You want edge-native from the start
- You prioritize web standards and progressive enhancement
- You're building real-time dashboards or interactive platforms

**Choose Astro if:**
- You're building content-heavy static sites
- Performance and minimal JavaScript are top priorities
- You need multi-framework support
- You're building blogs, docs, or marketing sites

**Choose SvelteKit if:**
- You want smaller bundles than React
- You prefer simpler, more readable code
- You're building internal tools
- Your team wants to explore beyond React

---

### UI Library Decision Tree

**Choose Shadcn UI if:**
- You use Tailwind CSS
- You want maximum customization
- You prefer owning your component code
- Your design doesn't follow Material Design
- **→ Best for modern projects in 2025**

**Choose Material UI if:**
- You need enterprise-grade components
- You like Material Design
- You want comprehensive out-of-the-box features
- You're building complex data-heavy applications

**Choose Ant Design if:**
- You're building enterprise/admin applications
- You need extensive data visualization
- You require strong internationalization
- You want opinionated, consistent design

**Choose Chakra UI if:**
- You want accessible, hook-based components
- You prefer a modern, flexible API
- You need good TypeScript support

---

### Chart Library Decision Tree

**Choose ECharts if:**
- You need comprehensive chart types (100+)
- You're handling large datasets (10,000+ points)
- You want WebGL performance
- You're building enterprise dashboards
- **→ Best general-purpose choice for 2025**

**Choose Recharts if:**
- You're building React applications
- You need standard chart types (line, bar, pie, area)
- You want simple, declarative components
- Developer experience is a priority

**Choose D3.js (or Visx) if:**
- You need highly customized, unique visualizations
- You have strong JavaScript/SVG expertise
- Visual design is critical to your project
- Standard chart types don't meet your needs

**Choose Chart.js if:**
- You need lightweight, simple charts
- You're not using React
- Quick setup is important

---

### 2025 Recommended Stack Combinations

**Modern SaaS Application:**
- Framework: **Next.js 15** (App Router)
- UI Library: **Shadcn UI** + Tailwind CSS
- Charts: **ECharts** or **Recharts**
- State: React Server Components + Zustand
- Backend: **Next.js API Routes** or **NestJS**

**Enterprise Dashboard:**
- Framework: **Next.js 15** or **Remix**
- UI Library: **Ant Design** or **Material UI**
- Charts: **ECharts** (for complex visualizations)
- State: Redux Toolkit or Zustand
- Backend: **NestJS** or **Django**

**Content-Heavy Marketing Site:**
- Framework: **Astro** (with React islands)
- UI Library: **Shadcn UI** or **Tailwind CSS**
- Charts: **Chart.js** (if needed)
- CMS: **Contentful** or **Strapi**

**3D Product Showcase:**
- Framework: **Next.js 15**
- 3D Library: **React Three Fiber** + **Drei**
- UI Library: **Shadcn UI**
- Animation: **Framer Motion**

---

### Key 2025 Trends

**Framework Trends:**
1. **Next.js dominance continues** - Still the default choice for React applications
2. **Partial Prerendering** - Game-changer for performance
3. **Server Components adoption** - Reducing client-side JavaScript
4. **Edge-first architecture** - Remix and Next.js leading the way
5. **Content-focused alternatives** - Astro growing for static/content sites

**UI Library Trends:**
1. **Shadcn UI disruption** - Copy-and-own model gaining massive traction
2. **Tailwind integration** - Essential for modern UI libraries
3. **Headless components** - Separation of logic and styling
4. **Accessibility-first** - WCAG compliance becoming standard
5. **Bundle size discipline** - Moving away from monolithic libraries

**Visualization Trends:**
1. **ECharts market leadership** - Best balance of power and usability
2. **React-specific solutions** - Recharts and Visx for React apps
3. **WebGL for performance** - Handling larger datasets efficiently
4. **Declarative APIs** - Simpler chart creation with React components

---

**Top Picks for 2025:**
- **Full-Stack Framework:** `vercel/next.js` (143K+ stars)
- **UI Library:** `shadcn-ui/ui` (66K+ stars) for modern projects, `mui/material-ui` (94K+ stars) for enterprise
- **Charts:** `apache/echarts` (63K+ stars) for comprehensive needs, `recharts/recharts` (24.8K+ stars) for React simplicity
- **3D Graphics:** `mrdoob/three.js` (110K+ stars) with `pmndrs/react-three-fiber` (29.6K+ stars) for React

---

*Part of octocode-mcp resources collection*
