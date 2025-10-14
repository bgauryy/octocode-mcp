# Frontend Libraries & Components

> React ecosystem libraries, UI components, state management, animations, 3D graphics, and mobile

**🎯 Purpose:** Frontend library resources for AI agents building React web and mobile applications  
**🌐 Focus:** React 19 libraries, UI components, widgets, animations, 3D graphics  
**⚙️ Runtime:** All frontend tooling runs on Node.js (Vite, Next.js, Metro bundler)  
**📅 Updated:** October 14, 2025

---

## Quick Reference

### State Management (Start Here - 2025 Best)
- **Client State:** `pmndrs/zustand` (55K+ ⭐) - THE recommended state solution (#1 pick)
- **Server State:** `TanStack/query` (47K+ ⭐) - THE server state solution (replaces Redux)
- **URL State:** nuqs - Game-changing URL query params as state
- **Built-in:** React Context - For rarely-changing global state only

### UI Component Libraries (2025 Top Picks)
- **#1 Choice:** `shadcn/ui` - Copy/paste components, Tailwind + TypeScript (2025 winner)
- **Enterprise:** `mui/material-ui` (97K+ ⭐) - Complete design system, mature
- **Developer-Friendly:** `chakra-ui/chakra-ui` (39K+ ⭐) - Accessible, themeable
- **Headless:** `radix-ui/primitives` (16K+ ⭐) - Unstyled, accessible primitives

### Forms & Validation (#1 Standard)
- **Forms:** `react-hook-form/react-hook-form` (44K+ ⭐) - THE form solution
- **Validation:** `colinhacks/zod` (36K+ ⭐) - TypeScript schema validation
- **Integration:** React Hook Form + Zod = Perfect combo

### Animations (#1 Choice)
- **Modern API:** `framer/motion` (26K+ ⭐) - THE animation library for 2025
- **After Effects:** `airbnb/lottie-web` (31K+ ⭐) - JSON animations from AE
- **React Spring:** `pmndrs/react-spring` (29K+ ⭐) - Physics-based animations

### 3D Graphics
- **React + Three.js:** `pmndrs/react-three-fiber` (29K+ ⭐) - THE 3D solution for React
- **3D UI:** `pmndrs/drei` (9K+ ⭐) - Helper components for R3F
- **Core Engine:** `mrdoob/three.js` (106K+ ⭐) - JavaScript 3D library

### React Native & Mobile
- **Framework:** `expo/expo` (35K+ ⭐) - Best React Native development platform
- **Navigation:** `react-navigation/react-navigation` (24K+ ⭐) - THE routing solution
- **UI Components:** `react-native-elements/react-native-elements` (25K+ ⭐) - Cross-platform UI

### Decision Guide
| Need | Choose | Why |
|------|--------|-----|
| State Management | Zustand + TanStack Query | Client + server state covered |
| UI Components | Shadcn UI | Best DX, Tailwind, TypeScript |
| Forms | React Hook Form + Zod | Best performance + validation |
| Animations | Framer Motion | Modern, powerful, best DX |
| 3D Graphics | React Three Fiber | Three.js in React |
| Mobile | Expo + React Native | Best development experience |

---

## Table of Contents
1. [Core React Library](#core-react-library)
2. [State Management](#state-management-2025-recommendations)
3. [UI Component Libraries](#ui-component-libraries-2025-top-picks)
4. [Forms & Validation](#forms--validation-2025-standard)
5. [Animation Libraries](#react-animation-libraries)
6. [Styling & CSS](#tailwind-css--utilities)
7. [Next.js & Boilerplates](#nextjs--modern-react)
8. [React Native & Mobile](#react-native--mobile)

---

## Core React Library

**⭐ facebook/react** (239,737 stars) ⚡ ESSENTIAL
- The library for web and native user interfaces - function components, hooks, Server Components
- 🔗 https://github.com/facebook/react
- **Use Case:** THE most popular UI library for building user interfaces
- **Why Essential:** Industry standard with 239K+ stars, massive ecosystem, backed by Meta
- **2025 Status:** Dominates frontend with React Server Components, concurrent features, and modern patterns

---

## State Management (2025 Recommendations)

### Modern State Solutions

**⭐ pmndrs/zustand** (55,123 stars) ⚡ ESSENTIAL
- Bear necessities for state management in React - minimal, fast, scalable
- 🔗 https://github.com/pmndrs/zustand
- **Use Case:** THE recommended React state management for 2025
- **Why Essential:** Minimal boilerplate, TypeScript-first, no Context hell, perfect for 99% of apps
- **2025 Recommendation:** Choose Zustand over Redux for new projects - simpler, faster, better DX

**⭐ TanStack/query** (46,951 stars) ⚡ ESSENTIAL
- Powerful asynchronous state management for server-state - caching, sync, updates
- 🔗 https://github.com/TanStack/query
- **Use Case:** THE solution for remote/server state - replaces most Redux use cases
- **Why Essential:** Solves caching, deduplication, invalidation, retries, pagination, optimistic updates
- **2025 Recommendation:** Use TanStack Query for ALL server data - it's a game-changer

### Context & URL State

**⭐ React Context API** ⚡ HIGHLY RECOMMENDED
- Built-in React state management for rarely-changing global state
- **Use Case:** Themes, auth state, i18n - NOT for frequent updates
- **2025 Best Practice:** Use Context for globals that rarely change, Zustand for everything else

**⭐ nuqs** (URL State Management)
- Game-changing library for managing URL query params as React state
- **Use Case:** Filters, pagination, search params - shareable, SEO-friendly state
- **2025 Recommendation:** Use nuqs for URL state - transforms how you handle query params

### Other Options (Specific Use Cases)

**⭐ Jotai**
- Minimal atomic state management with React Suspense support
- **Use Case:** When you need atomic state units with derived atoms
- **Why Consider:** Tiny, fast, works with Suspense, automatic garbage collection

**⭐ Redux Toolkit**
- Modern Redux with less boilerplate
- **Use Case:** Legacy projects, complex state machines, time-travel debugging
- **2025 Note:** Only use if maintaining existing Redux code or need specific Redux features

---

## React Patterns & Best Practices

**⭐ react-boilerplate/react-boilerplate** (29,536 stars)
- Highly scalable, offline-first foundation with best DX and performance focus
- 🔗 https://github.com/react-boilerplate/react-boilerplate
- **Use Case:** Production-grade React boilerplate

**⭐ ipenywis/react-solid** (578 stars)
- React S.O.L.I.D Principles for writing clean-code
- 🔗 https://github.com/ipenywis/react-solid
- **Use Case:** Apply SOLID principles in React

---

## React Animation Libraries

**⭐ airbnb/lottie-android** (35,488 stars) ⚡ HIGHLY RECOMMENDED
- Render After Effects animations natively on Android, iOS, Web, and React Native
- 🔗 https://github.com/airbnb/lottie-android
- **Use Case:** Production-quality animations from After Effects

**⭐ airbnb/lottie-web** (31,456 stars) ⚡ HIGHLY RECOMMENDED
- Render After Effects animations natively on Web, Android, iOS, and React Native
- 🔗 https://github.com/airbnb/lottie-web
- **Use Case:** Web animation from After Effects files

**⭐ motiondivision/motion** (30,003 stars) ⚡ ESSENTIAL
- A modern animation library for React and JavaScript (formerly Framer Motion)
- 🔗 https://github.com/motiondivision/motion
- **Use Case:** THE modern React animation library

**⭐ pmndrs/react-three-fiber** (29,644 stars) ⚡ HIGHLY RECOMMENDED
- 🇨🇭 A React renderer for Three.js
- 🔗 https://github.com/pmndrs/react-three-fiber
- **Use Case:** 3D graphics and animations in React

**⭐ pmndrs/react-spring** (28,927 stars) ⚡ HIGHLY RECOMMENDED
- ✌️ A spring physics based React animation library
- 🔗 https://github.com/pmndrs/react-spring
- **Use Case:** Physics-based animations for React

**⭐ chenglou/react-motion** (21,751 stars)
- A spring that solves your animation problems
- 🔗 https://github.com/chenglou/react-motion
- **Use Case:** Spring-based animation primitives

**⭐ formkit/auto-animate** (13,575 stars)
- Zero-config, drop-in animation utility for smooth transitions
- 🔗 https://github.com/formkit/auto-animate
- **Use Case:** Automatic animations for React, Vue, or vanilla JS

**⭐ software-mansion/react-native-reanimated** (10,330 stars)
- React Native's Animated library reimplemented
- 🔗 https://github.com/software-mansion/react-native-reanimated
- **Use Case:** High-performance animations for React Native

**⭐ reactjs/react-transition-group** (10,246 stars)
- Easy way to perform animations when a React component enters or leaves the DOM
- 🔗 https://github.com/reactjs/react-transition-group
- **Use Case:** Official React transition animations

**⭐ oblador/react-native-animatable** (9,935 stars)
- Standard set of easy to use animations for React Native
- 🔗 https://github.com/oblador/react-native-animatable
- **Use Case:** Declarative animations for React Native

---

## Forms & Validation (2025 Standard)

**⭐ react-hook-form/react-hook-form** (43,974 stars) ⚡ ESSENTIAL
- React Hooks for form state management and validation with minimal re-renders
- 🔗 https://github.com/react-hook-form/react-hook-form
- **Use Case:** THE modern React form library - best performance, minimal re-renders
- **Why Essential:** 43K+ stars, smallest bundle, best performance, works with Web + React Native
- **2025 Recommendation:** THE standard for React forms - use this for all form needs
- **Features:** TypeScript support, Zod/Yup validation, works with UI libraries (MUI, Shadcn)

**⭐ redux-form/redux-form** (12,535 stars)
- Redux-integrated form management (legacy)
- 🔗 https://github.com/redux-form/redux-form
- **Use Case:** Only if you have existing Redux forms
- **2025 Note:** Deprecated in favor of react-hook-form - don't use for new projects

---

## React Component Development

**⭐ storybookjs/storybook** (87,934 stars) ⚡ ESSENTIAL
- Industry standard workshop for building, documenting, and testing UI components
- 🔗 https://github.com/storybookjs/storybook
- **Use Case:** THE component development environment

**⭐ pmndrs/use-gesture** (9,482 stars)
- 👇 Bread n butter utility for component-tied mouse/touch gestures
- 🔗 https://github.com/pmndrs/use-gesture
- **Use Case:** Gesture handling for React

**⭐ testing-library/react-hooks-testing-library** (5,277 stars)
- 🐏 Simple and complete React hooks testing utilities
- 🔗 https://github.com/testing-library/react-hooks-testing-library
- **Use Case:** Testing React hooks in isolation

---

## Tailwind CSS & Utilities

**⭐ tailwindlabs/tailwindcss** (90,578 stars) ⚡ ESSENTIAL
- A utility-first CSS framework for rapid UI development
- 🔗 https://github.com/tailwindlabs/tailwindcss
- **Use Case:** THE modern utility-first CSS framework

**⭐ saadeghi/daisyui** (38,936 stars) ⚡ HIGHLY RECOMMENDED
- 🌼 The most popular, free and open-source Tailwind CSS component library
- 🔗 https://github.com/saadeghi/daisyui
- **Use Case:** Ready-to-use Tailwind components

**⭐ tailwindlabs/headlessui** (28,043 stars) ⚡ HIGHLY RECOMMENDED
- Completely unstyled, fully accessible UI components for Tailwind CSS
- 🔗 https://github.com/tailwindlabs/headlessui
- **Use Case:** Accessible unstyled components from Tailwind team

**⭐ aniftyco/awesome-tailwindcss** (14,596 stars)
- 😎 Awesome things related to Tailwind CSS
- 🔗 https://github.com/aniftyco/awesome-tailwindcss
- **Use Case:** Comprehensive Tailwind resources

**⭐ roots/sage** (13,097 stars)
- WordPress starter theme with Laravel Blade components and Tailwind CSS
- 🔗 https://github.com/roots/sage
- **Use Case:** Modern WordPress development with Tailwind

**⭐ mdbootstrap/TW-Elements** (13,066 stars)
- 𝙃𝙪𝙜𝙚 collection of Tailwind MIT licensed components and templates
- 🔗 https://github.com/mdbootstrap/TW-Elements
- **Use Case:** Free Tailwind component collection

**⭐ markmead/hyperui** (11,723 stars)
- Free Tailwind CSS v4 components for your next project
- 🔗 https://github.com/markmead/hyperui
- **Use Case:** Modern Tailwind v4 components

**⭐ timlrx/tailwind-nextjs-starter-blog** (10,127 stars)
- Next.js, Tailwind CSS blogging starter template
- 🔗 https://github.com/timlrx/tailwind-nextjs-starter-blog
- **Use Case:** Blog template with Tailwind and Next.js

**⭐ mertJF/tailblocks** (8,883 stars)
- Ready-to-use Tailwind CSS blocks
- 🔗 https://github.com/mertJF/tailblocks
- **Use Case:** Copy-paste Tailwind blocks

**⭐ themesberg/flowbite** (8,873 stars)
- Open-source UI component library based on Tailwind CSS
- 🔗 https://github.com/themesberg/flowbite
- **Use Case:** Tailwind component framework

**⭐ ben-rogerson/twin.macro** (8,025 stars)
- 🦹‍♂️ Twin blends Tailwind with css-in-js (emotion, styled-components)
- 🔗 https://github.com/ben-rogerson/twin.macro
- **Use Case:** Use Tailwind with CSS-in-JS

---

## CSS Frameworks & Styling

**⭐ postcss/postcss** (28,889 stars) ⚡ ESSENTIAL
- Transforming styles with JS plugins
- 🔗 https://github.com/postcss/postcss
- **Use Case:** Essential CSS transformation tool

**⭐ nostalgic-css/NES.css** (21,486 stars)
- NES-style CSS Framework | ファミコン風CSSフレームワーク
- 🔗 https://github.com/nostalgic-css/NES.css
- **Use Case:** Retro/nostalgic NES-style CSS

**⭐ styled-system/styled-system** (7,874 stars)
- ⬢ Style props for rapid UI development
- 🔗 https://github.com/styled-system/styled-system
- **Use Case:** Design system utilities for CSS-in-JS

---

## UI Component Libraries (2025 Top Picks)

### Tailwind-Based (Modern Choice)

**⭐ shadcn-ui/ui** (100,000+ stars) ⚡ ESSENTIAL
- Beautifully designed components built with Radix UI and Tailwind CSS - copy/paste, not npm
- 🔗 https://github.com/shadcn/ui
- **Use Case:** THE trending choice for 2025 - copy-paste components, full customization
- **Why Essential:** Most popular in 2025, perfect for Tailwind projects, owned by developers
- **2025 Recommendation:** Best choice for new projects using Tailwind - bridges customization and pre-built
- **Features:** Accessible, customizable, TypeScript, works with Next.js, no runtime overhead

**⭐ radix-ui/primitives** (17,994 stars) ⚡ ESSENTIAL
- Unstyled, accessible UI primitives - the foundation for Shadcn UI
- 🔗 https://github.com/radix-ui/primitives
- **Use Case:** Building custom design systems with accessibility built-in
- **Why Essential:** Best-in-class accessibility, unstyled (full control), used by Shadcn UI
- **2025 Recommendation:** Use directly for custom design systems, or via Shadcn UI

### Traditional Component Libraries

**⭐ mui/material-ui** (96,781 stars) ⚡ HIGHLY RECOMMENDED
- Comprehensive React component library implementing Google's Material Design with AI-assisted theming
- 🔗 https://github.com/mui/material-ui
- **Use Case:** Enterprise applications, Material Design projects, extensive components
- **Why Recommended:** Most mature (96K+ stars), comprehensive, battle-tested
- **2025 Status:** Still #1 for enterprise, now with AI-assisted theming and enhanced customization

**⭐ chakra-ui/chakra-ui** (39,000+ stars) ⚡ HIGHLY RECOMMENDED
- Simple, modular and accessible component library with intuitive API
- 🔗 https://github.com/chakra-ui/chakra-ui
- **Use Case:** Accessible UI, hook-based components, theme customization
- **Why Recommended:** Best accessibility defaults, intuitive API, great for rapid development
- **2025 Status:** Top choice for accessibility-first projects

**⭐ mantinedev/mantine** (29,000+ stars) ⚡ HIGHLY RECOMMENDED
- Fully featured React components library with extensive hooks
- 🔗 https://github.com/mantinedev/mantine
- **Use Case:** Modern UI, notifications, extensive hooks library, full-featured apps
- **Why Recommended:** Feature-rich with 100+ components, excellent TypeScript support
- **2025 Status:** Rapidly growing, best all-in-one solution

**⭐ heroui-inc/heroui** (26,951 stars) ⚡ HIGHLY RECOMMENDED
- Beautiful, fast and modern React UI library (Previously NextUI) focused on simplicity
- 🔗 https://github.com/heroui-inc/heroui
- **Use Case:** Modern React UI with great DX, Next.js integration
- **Why Recommended:** Beautiful defaults, performance-focused, Next.js optimized
- **2025 Status:** Excellent choice for Next.js projects

### Copy-Paste Components

**⭐ magicuidesign/magicui** (19,176 stars)
- UI Library for Design Engineers. Animated components and effects you can copy and paste
- 🔗 https://github.com/magicuidesign/magicui
- **Use Case:** Copy-paste animated components for design engineers
- **2025 Note:** Great for adding polish and animations to existing projects

---

## Next.js & Modern React

**⭐ vercel/next-forge** (6,574 stars)
- Production-grade Turborepo template for Next.js apps
- 🔗 https://github.com/vercel/next-forge
- **Use Case:** Official Vercel Next.js production template

**⭐ ixartz/SaaS-Boilerplate** (6,312 stars)
- 🚀🎉📚 SaaS Boilerplate built with Next.js + Tailwind CSS + Shadcn UI + TypeScript
- 🔗 https://github.com/ixartz/SaaS-Boilerplate
- **Use Case:** Complete SaaS starter with Auth, Multi-tenancy, Roles

**⭐ ixartz/Next-js-Boilerplate** (12,123 stars)
- 🚀🎉📚 Boilerplate and Starter for Next.js 15 with App Router and Page Router support
- 🔗 https://github.com/ixartz/Next-js-Boilerplate
- **Use Case:** Next.js 15 boilerplate with best practices

**⭐ Blazity/next-enterprise** (7,142 stars)
- 💼 An enterprise-grade Next.js boilerplate for high-performance, maintainable apps
- 🔗 https://github.com/Blazity/next-enterprise
- **Use Case:** Enterprise-grade Next.js template

**⭐ nextify-limited/saasfly** (2,692 stars)
- Your Next SaaS Template or Boilerplate! A magic trip start with `bun create saasfly`
- 🔗 https://github.com/nextify-limited/saasfly
- **Use Case:** SaaS boilerplate with modern stack

**⭐ ixartz/Next-JS-Landing-Page-Starter-Template** (2,060 stars)
- 🚀 Free NextJS Landing Page Template written in Tailwind CSS 3 and TypeScript
- 🔗 https://github.com/ixartz/Next-JS-Landing-Page-Starter-Template
- **Use Case:** Landing page template for Next.js

**⭐ themeselection/materio-mui-nextjs-admin-template-free** (1,866 stars)
- Enterprise-grade Next.js admin dashboard template with Material UI (MUI), Tailwind CSS
- 🔗 https://github.com/themeselection/materio-mui-nextjs-admin-template-free
- **Use Case:** Admin dashboard template

**⭐ BearStudio/start-ui-web** (1,521 stars)
- 🚀 Start UI [web] is an opinionated UI starter from the 🐻 Beastudio Team with Node.js, TypeScript, React, TanStack Start, Tailwind CSS
- 🔗 https://github.com/BearStudio/start-ui-web
- **Use Case:** Opinionated full-stack starter

---

## React Native & Mobile

**⭐ akveo/kittenTricks** (7,256 stars)
- React Native starter kit with over 40 screens and modern Light and Dark theme
- 🔗 https://github.com/akveo/kittenTricks
- **Use Case:** Complete React Native UI kit

**⭐ t3-oss/create-t3-turbo** (5,722 stars)
- Clean and simple starter repo using the T3 Stack along with Expo React Native
- 🔗 https://github.com/t3-oss/create-t3-turbo
- **Use Case:** T3 Stack with React Native

**⭐ futurice/pepperoni-app-kit** (4,624 stars)
- Pepperoni - React Native App Starter Kit for Android and iOS
- 🔗 https://github.com/futurice/pepperoni-app-kit
- **Use Case:** Production-ready React Native starter

**⭐ mcnamee/react-native-starter-kit** (3,371 stars)
- 🚀 A React Native boilerplate app to get you up and running very, very quickly 🚀
- 🔗 https://github.com/mcnamee/react-native-starter-kit
- **Use Case:** Quick React Native setup

**⭐ flatlogic/react-native-starter** (2,416 stars)
- 🚀A powerful react native starter template that bootstraps development of your mobile application
- 🔗 https://github.com/flatlogic/react-native-starter
- **Use Case:** Powerful React Native template

**⭐ microsoft/TypeScript-React-Native-Starter** (1,902 stars)
- A starter template for TypeScript and React Native with a detailed README
- 🔗 https://github.com/microsoft/TypeScript-React-Native-Starter
- **Use Case:** Official Microsoft TypeScript + React Native starter

**⭐ tauri-apps/tauri** (97,327 stars) ⚡ HIGHLY RECOMMENDED
- Build smaller, faster, more secure desktop and mobile applications with web frontend
- 🔗 https://github.com/tauri-apps/tauri
- **Use Case:** Electron alternative for desktop apps

**⭐ ionic-team/ionic-framework** (52,101 stars)
- Cross-platform UI toolkit for native-quality iOS, Android, and PWAs
- 🔗 https://github.com/ionic-team/ionic-framework
- **Use Case:** Hybrid mobile app framework

**⭐ expo/expo** (44,050 stars)
- Open-source framework for making universal native apps with React
- 🔗 https://github.com/expo/expo
- **Use Case:** React Native development platform

---

## State Management

**⭐ TanStack/query** (46,951 stars) ⚡ HIGHLY RECOMMENDED
- 🤖 Powerful asynchronous state management, server-state utilities and data fetching for the web. TS/JS, React Query, Solid Query, Svelte Query and Vue Query
- 🔗 https://github.com/TanStack/query
- **Use Case:** Async state management and data fetching

**⭐ pmndrs/zustand** (55,123 stars) ⚡ HIGHLY RECOMMENDED
- 🐻 Bear necessities for state management in React
- 🔗 https://github.com/pmndrs/zustand
- **Use Case:** Lightweight React state management (recommended in agent-architect guide)

---

## Material-UI (MUI)

**⭐ devias-io/material-kit-react** (5,548 stars)
- React Dashboard made with Material UI's components. Pro template contains features like TypeScript version, authentication system
- 🔗 https://github.com/devias-io/material-kit-react
- **Use Case:** Material-UI dashboard template

**⭐ gregnb/mui-datatables** (2,718 stars)
- Datatables for React using Material-UI
- 🔗 https://github.com/gregnb/mui-datatables
- **Use Case:** Data tables with Material-UI

**⭐ theodorusclarence/ts-nextjs-tailwind-starter** (3,348 stars)
- 🔋 Next.js + Tailwind CSS + TypeScript starter and boilerplate packed with useful development features
- 🔗 https://github.com/theodorusclarence/ts-nextjs-tailwind-starter
- **Use Case:** Next.js + Tailwind starter

**⭐ tailpress/tailpress** (1,403 stars)
- TailPress is a minimal boilerplate theme for WordPress using Tailwind CSS
- 🔗 https://github.com/tailpress/tailpress
- **Use Case:** WordPress with Tailwind CSS

---

## Quick Reference - Frontend (2025)

### 🏆 Top Picks for 2025 (Ordered by Priority)

**State Management:**
1. **Zustand** - `pmndrs/zustand` (55K+ stars) — #1 client state, replaces Redux
2. **TanStack Query** - `TanStack/query` (47K+ stars) — #1 server state
3. **React Context** - Built-in — For rare globals (theme, auth)
4. **nuqs** - URL state management — Game-changer for query params

**UI Component Libraries:**
1. **Shadcn UI** - `shadcn-ui/ui` (100K+ stars) — #1 for 2025, copy-paste Tailwind components
2. **Material UI** - `mui/material-ui` (97K+ stars) — #1 for enterprise
3. **Chakra UI** - `chakra-ui/chakra-ui` (39K+ stars) — Best accessibility
4. **Mantine** - `mantinedev/mantine` (29K+ stars) — Feature-rich, 100+ components
5. **Hero UI** - `heroui-inc/heroui` (27K+ stars) — Next.js optimized

**Forms & Validation:**
1. **React Hook Form** - `react-hook-form/react-hook-form` (44K+ stars) — THE standard

**Styling:**
1. **Tailwind CSS** - `tailwindlabs/tailwindcss` (91K+ stars) — #1 CSS framework
2. **DaisyUI** - `saadeghi/daisyui` (39K+ stars) — Tailwind components
3. **Radix UI** - `radix-ui/primitives` (18K+ stars) — Unstyled primitives

**Animation:**
1. **Framer Motion** - `motiondivision/motion` (30K+ stars) — #1 React animations
2. **Lottie** - `airbnb/lottie-web` (31K+ stars) — After Effects animations
3. **React Spring** - `pmndrs/react-spring` (29K+ stars) — Physics-based
4. **React Three Fiber** - `pmndrs/react-three-fiber` (30K+ stars) — 3D graphics

**Development Tools:**
1. **Storybook** - `storybookjs/storybook` (88K+ stars) — Component development

**Mobile:**
1. **React Native** - Cross-platform mobile (use same state/form libraries as web)
2. **Expo** - `expo/expo` (44K+ stars) — React Native platform

---

*Part of octocode-mcp resources collection*

