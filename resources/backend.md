# Backend Development Resources

> Node.js backend frameworks, API design patterns, and server-side architecture

**🎯 Purpose:** Backend resources for AI agents using octocode-mcp to generate Node.js/TypeScript applications
**🤖 For:** AI agents and developers building production-ready Node.js servers
**🌐 Focus:** Node.js, Express, NestJS, Fastify - Pure JavaScript/TypeScript backend
**📱 Mobile:** Backend APIs serving web and React Native mobile clients
**⚙️ Runtime:** 100% Node.js - no other server runtimes

**Last Updated:** October 13, 2025

---

## 🎯 Best for Application Generation

This file provides **backend building blocks** to help AI agents:
1. **Choose framework** - NestJS vs Fastify vs Express comparisons
2. **Design APIs** - REST vs GraphQL vs tRPC with type safety
3. **Implement validation** - Zod, Joi, class-validator patterns
4. **Structure code** - Clean architecture, layered architecture, DDD
5. **Serve all clients** - Same backend for web, mobile, and third-party APIs

**Generation Priorities:**
- ⚡ **NestJS** - Enterprise-grade applications with DI and modularity
- ⚡ **Fastify** - High-performance APIs with TypeScript
- ⚡ **tRPC** - End-to-end type safety without code generation
- ⚡ **Zod** - Runtime validation with TypeScript inference

---

## Must-Read Best Practices

**⭐ goldbergyoni/nodebestpractices** (104,369 stars) ⚡ ESSENTIAL
- 🏆 The Node.js best practices list (Updated 2025)
- 🔗 https://github.com/goldbergyoni/nodebestpractices
- **Use Case:** THE definitive Node.js best practices guide - must-read for all Node.js developers
- **Why Essential:** 100K+ stars, comprehensive coverage of security, performance, architecture, and production practices

**⭐ Sairyss/backend-best-practices** (2,046 stars)
- Best practices, tools and guidelines for backend development. Code examples in TypeScript + NodeJS
- 🔗 https://github.com/Sairyss/backend-best-practices
- **Use Case:** Backend development with TypeScript + Node.js

---

## Node.js Frameworks (2025 Recommendations)

### Enterprise & Production Ready

**⭐ nestjs/nest** (73,034 stars) ⚡ ESSENTIAL
- Progressive Node.js framework for enterprise-grade applications with TypeScript, DI, and modular architecture
- 🔗 https://github.com/nestjs/nest
- **Use Case:** THE modern Node.js framework for scalable, maintainable enterprise applications
- **Why Essential:** Best choice for large-scale apps in 2025 - structured, TypeScript-first, microservices-ready
- **2025 Recommendation:** Choose NestJS for new enterprise projects requiring structure and scalability

**⭐ fastify/fastify** (34,767 stars) ⚡ HIGHLY RECOMMENDED
- Fast and low overhead web framework - 2-3x faster than Express with TypeScript support
- 🔗 https://github.com/fastify/fastify
- **Use Case:** High-performance APIs, microservices, serverless functions
- **Why Recommended:** Blazing fast (48K req/sec), JSON schema validation, first-class TypeScript support
- **2025 Recommendation:** Choose Fastify for greenfield projects prioritizing performance

**⭐ expressjs/express** (67,995 stars) ⚡ ESSENTIAL
- Fast, unopinionated, minimalist web framework for Node.js
- 🔗 https://github.com/expressjs/express
- **Use Case:** Simple REST APIs, legacy projects, learning Node.js
- **Why Essential:** Most widely adopted framework with massive ecosystem and community
- **2025 Note:** Still strong for legacy/enterprise projects, but consider Fastify or NestJS for new projects

### Real-Time & Specialized

**⭐ socketio/socket.io** (62,480 stars) ⚡ HIGHLY RECOMMENDED
- Realtime application framework (Node.JS server)
- 🔗 https://github.com/socketio/socket.io
- **Use Case:** Real-time bidirectional communication, chat apps, live updates
- **Why Recommended:** Industry standard for WebSocket communication

**⭐ medusajs/medusa** (30,875 stars)
- The world's most flexible commerce platform
- 🔗 https://github.com/medusajs/medusa
- **Use Case:** Headless commerce with Node.js

**⭐ mochajs/mocha** (22,836 stars)
- ☕️ Simple, flexible, fun JavaScript test framework
- 🔗 https://github.com/mochajs/mocha
- **Use Case:** Popular JavaScript testing framework

**⭐ eggjs/egg** (18,977 stars)
- 🥚 Born to build better enterprise frameworks and apps with Node.js & Koa
- 🔗 https://github.com/eggjs/egg
- **Use Case:** Enterprise Node.js framework

**⭐ adonisjs/core** (18,291 stars)
- TypeScript-first web framework for building web apps and API servers
- 🔗 https://github.com/adonisjs/core
- **Use Case:** Laravel-inspired Node.js framework

---

## Express Middleware

**⭐ chimurai/http-proxy-middleware** (11,080 stars) ⚡ HIGHLY RECOMMENDED
- ⚡ One-liner node.js http-proxy middleware for connect, express, next.js
- 🔗 https://github.com/chimurai/http-proxy-middleware
- **Use Case:** Proxy middleware for development and production

**⭐ expressjs/morgan** (8,116 stars)
- HTTP request logger middleware for node.js
- 🔗 https://github.com/expressjs/morgan
- **Use Case:** Standard request logging

**⭐ expressjs/session** (6,346 stars)
- Simple session middleware for Express
- 🔗 https://github.com/expressjs/session
- **Use Case:** Session management

**⭐ express-validator/express-validator** (6,240 stars)
- An express.js middleware for validator.js
- 🔗 https://github.com/express-validator/express-validator
- **Use Case:** Input validation and sanitization

---

## NestJS (Alternative to Express)

**⭐ juicycleff/ultimate-backend** (2,865 stars)
- Multi tenant SaaS starter kit with cqrs graphql microservice architecture, apollo federation, event source and authentication
- 🔗 https://github.com/juicycleff/ultimate-backend
- **Use Case:** NestJS microservices SaaS starter

**⭐ ablestack/nestjs-bff** (662 stars)
- A full-stack TypeScript solution, and starter project. Includes an API, CLI, and example client webapp
- 🔗 https://github.com/ablestack/nestjs-bff
- **Use Case:** NestJS BFF pattern implementation

**⭐ samchon/nestia** (2,086 stars)
- NestJS Helper + AI Chatbot Development
- 🔗 https://github.com/samchon/nestia
- **Use Case:** Enhanced NestJS development toolkit

---

## API Design & Development (2025 Guide)

### Type-Safe APIs (Recommended for TypeScript Projects)

**⭐ trpc/trpc** (38,636 stars) ⚡ ESSENTIAL
- Move Fast and Break Nothing. End-to-end typesafe APIs with zero code generation
- 🔗 https://github.com/trpc/trpc
- **Use Case:** Full-stack TypeScript apps (Next.js, React) - instant type safety from DB to UI
- **Why Essential:** THE choice for TypeScript full-stack in 2025 - eliminates API layer overhead completely
- **2025 Recommendation:** Use tRPC for internal TypeScript monorepos and full-stack TS projects
- **Best For:** Next.js apps, internal tools, startups prioritizing speed and type safety

### GraphQL (Flexible Data Querying)

**⭐ graphql-hive/graphql-yoga** (8,442 stars) ⚡ HIGHLY RECOMMENDED
- Fully-featured GraphQL Server with easy setup, performance & great DX
- 🔗 https://github.com/graphql-hive/graphql-yoga
- **Use Case:** Complex frontends with fluid data requirements, multi-source aggregation
- **Why Recommended:** Best modern GraphQL server implementation
- **2025 Recommendation:** Choose GraphQL when clients need flexible queries and data aggregation
- **Best For:** Mobile apps, complex dashboards, public APIs with diverse client needs

**⭐ graphql-hive/graphql-modules** (1,329 stars)
- Enterprise Grade Tooling For Your GraphQL Server
- 🔗 https://github.com/graphql-hive/graphql-modules
- **Use Case:** Modular GraphQL server architecture

**⭐ marmelab/react-admin** (26,282 stars)
- A frontend Framework for single-page applications on top of REST/GraphQL APIs
- 🔗 https://github.com/marmelab/react-admin
- **Use Case:** Complete admin framework for REST/GraphQL APIs

### REST APIs (Public & Multi-Language)

**⭐ microsoft/api-guidelines** (23,137 stars) ⚡ ESSENTIAL
- Microsoft REST API Guidelines
- 🔗 https://github.com/microsoft/api-guidelines
- **Use Case:** Industry-standard REST API design from Microsoft - best for public APIs
- **Why Essential:** Authoritative REST guidelines used by Fortune 500 companies
- **2025 Recommendation:** Use REST for public APIs, multi-language support, long-term stability
- **Best For:** Public APIs, legacy system integration, multi-language client support

**⭐ zalando/restful-api-guidelines** (3,047 stars)
- Comprehensive model set of guidelines for RESTful APIs and Events
- 🔗 https://github.com/zalando/restful-api-guidelines
- **Use Case:** Enterprise REST API design patterns

### API Decision Guide (2025)

- **Choose tRPC if:** Building internal TypeScript full-stack apps, want instant type safety, using Next.js/React
- **Choose GraphQL if:** Complex data requirements, multiple client types, need flexible querying
- **Choose REST if:** Public API, multi-language support, maximum compatibility, stable long-term contracts

---

## Production-Ready Node.js Boilerplates (2025)

### TypeScript + Node.js Templates

**⭐ hagopj13/node-express-boilerplate** (7,483 stars) ⚡ HIGHLY RECOMMENDED
- Production-ready RESTful APIs using Node.js, Express, Mongoose with auth, validation, testing
- 🔗 https://github.com/hagopj13/node-express-boilerplate
- **Use Case:** Express + MongoDB production boilerplate with JWT auth, Docker, testing
- **Why Recommended:** Most popular Node.js backend boilerplate with 7K+ stars, production-tested
- **Includes:** Authentication, validation (Joi), testing, Docker, logging, error handling

**⭐ fifocode/nodejs-backend-architecture-typescript** ⚡ HIGHLY RECOMMENDED
- Production-ready Node.js backend architecture with TypeScript, Express, MongoDB, Redis, JWT
- 🔗 https://github.com/fifocode/nodejs-backend-architecture-typescript
- **Use Case:** Enterprise-grade Node.js backend for high-scale applications (10M+ users)
- **Why Recommended:** Production-proven architecture with role-based access, unit & integration tests
- **Includes:** Role-based auth, Express.js, Mongoose, Redis, MongoDB, Joi, Docker, JWT, comprehensive tests
- **2025 Recommendation:** Best choice for production-ready, scalable Node.js + TypeScript backend

**⭐ practicajs/practica** (1,649 stars)
- Node.js solution starter boilerplate that is production-ready, packed with best practices
- 🔗 https://github.com/practicajs/practica
- **Use Case:** Best practices-focused Node.js starter with production patterns

**⭐ jsynowiec/node-typescript-boilerplate**
- Minimalistic Node.js backend template with TypeScript, ESLint, Vitest, native ESM support
- 🔗 https://github.com/jsynowiec/node-typescript-boilerplate
- **Use Case:** Lightweight Node.js + TypeScript boilerplate for APIs

### Full-Stack Node.js Templates

**⭐ kriasoft/react-starter-kit** (23,256 stars)
- Modern full-stack starter: Bun, TypeScript, Tailwind CSS, tRPC, Cloudflare Workers, React
- 🔗 https://github.com/kriasoft/react-starter-kit
- **Use Case:** Production-ready full-stack with tRPC and modern Node.js stack

**⭐ Sly777/ran** (2,208 stars)
- React + GraphQL + Next.js Toolkit - SEO-Ready, Production-Ready, SSR
- 🔗 https://github.com/Sly777/ran
- **Use Case:** Production-ready React + GraphQL + Next.js + Node.js

---

## Fullstack TypeScript Examples

**⭐ payloadcms/payload** (38,095 stars) ⚡ HIGHLY RECOMMENDED
- Payload is the open-source, fullstack Next.js framework, giving you instant backend superpowers
- 🔗 https://github.com/payloadcms/payload
- **Use Case:** Complete fullstack CMS with Next.js + TypeScript

**⭐ blitz-js/blitz** (14,054 stars)
- ⚡️ The Missing Fullstack Toolkit for Next.js
- 🔗 https://github.com/blitz-js/blitz
- **Use Case:** Fullstack framework built on Next.js

**⭐ TanStack/router** (11,706 stars)
- 🤖 Fully typesafe Router for React (and friends) w/ built-in caching, 1st class search-param APIs
- 🔗 https://github.com/TanStack/router
- **Use Case:** Type-safe routing solution

**⭐ remult/remult** (3,139 stars)
- Full-stack CRUD, simplified, with SSOT TypeScript entities
- 🔗 https://github.com/remult/remult
- **Use Case:** Type-safe full-stack CRUD framework

**⭐ karanpratapsingh/fullstack-starterkit** (1,179 stars)
- GraphQL first full-stack starter kit with Node.js, React. Powered by TypeScript
- 🔗 https://github.com/karanpratapsingh/fullstack-starterkit
- **Use Case:** Full-stack GraphQL + TypeScript + Node.js starter

---

## Real-time Communication

**⭐ websockets/ws** (22,456 stars)
- Simple to use, blazing fast and thoroughly tested WebSocket client and server for Node.js
- 🔗 https://github.com/websockets/ws
- **Use Case:** WebSocket implementation for Node.js

**⭐ soketi/soketi** (5,414 stars)
- Next-gen, Pusher-compatible, open-source WebSockets server. Simple, fast, and resilient
- 🔗 https://github.com/soketi/soketi
- **Use Case:** Pusher-compatible WebSocket server

**⭐ socketio/engine.io** (4,593 stars)
- The engine used in the Socket.IO JavaScript server, which manages low-level transports like HTTP long-polling and WebSocket
- 🔗 https://github.com/socketio/engine.io
- **Use Case:** Low-level real-time engine

**⭐ primus/primus** (4,475 stars)
- ⚡ Primus, the creator god of the transformers & an abstraction layer for real-time
- 🔗 https://github.com/primus/primus
- **Use Case:** Real-time framework abstraction

---

## Caching Strategies

**⭐ jaredwray/cacheable** (1,887 stars)
- A robust, scalable, and maintained set of caching packages
- 🔗 https://github.com/jaredwray/cacheable
- **Use Case:** Multi-tier caching solution for Node.js

**⭐ Julien-R44/bentocache** (581 stars)
- 🍱 Bentocache is a robust multi-tier caching library for Node.js applications
- 🔗 https://github.com/Julien-R44/bentocache
- **Use Case:** Multi-tier caching with Redis support

---

## Quick Reference - Node.js Backend (2025)

### Start Here
- **Best Practices:** `goldbergyoni/nodebestpractices` - Must-read for all Node.js developers

### Framework Choices
- **Enterprise Applications:** `nestjs/nest` - Structured, TypeScript-first, microservices-ready
- **High Performance:** `fastify/fastify` - 2-3x faster than Express, modern TypeScript support
- **Classic/Legacy:** `expressjs/express` - Most widely adopted, massive ecosystem
- **Real-Time:** `socketio/socket.io` - WebSocket communication standard

### API Architecture
- **TypeScript Full-Stack:** `trpc/trpc` - Zero-overhead type-safe APIs for Next.js/React
- **Flexible Queries:** `graphql-hive/graphql-yoga` - GraphQL for complex data requirements
- **Public/Multi-Language:** `microsoft/api-guidelines` - REST for public APIs

### Production Boilerplates
- **Enterprise Backend:** `fifocode/nodejs-backend-architecture-typescript` - 10M+ user proven architecture
- **REST API:** `hagopj13/node-express-boilerplate` - Express + MongoDB + JWT
- **Full-Stack:** `kriasoft/react-starter-kit` - tRPC + Next.js + Cloudflare Workers

### 2025 Recommendations
- **New Enterprise Project?** → NestJS + GraphQL or tRPC
- **Performance Critical?** → Fastify + REST or tRPC
- **Simple API?** → Express + REST
- **TypeScript Full-Stack?** → tRPC + Next.js

---

*Part of octocode-mcp resources collection*

