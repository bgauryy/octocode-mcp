# Database & ORM Resources

> Database design, ORMs, and data management for Node.js/TypeScript applications

** Purpose:** Database resources for AI agents building Node.js/TypeScript applications  
**🌐 Focus:** Prisma, TypeORM, Drizzle - TypeScript-first ORMs  
**⚙️ Runtime:** Node.js database clients and TypeScript ORMs  
**📅 Updated:** October 13, 2025

---

## Quick Reference

### ORMs (Start Here)
- **Best Overall:** `prisma/prisma` (44K+ ⭐) - THE standard for TypeScript (Rust-free v6.16+)
- **Maximum Control:** `typeorm/typeorm` (36K+ ⭐) - Mature, flexible, broadest DB support
- **With Authorization:** `zenstackhq/zenstack` (2.7K+ ⭐) - Prisma + RBAC/ABAC built-in
- **Lightweight:** `drizzle-team/drizzle-orm` - SQL-centric, serverless-friendly
- **DDD Architecture:** `mikro-orm/mikro-orm` (8.6K+ ⭐) - Unit of Work pattern

### Database Clients
- **PostgreSQL:** `brianc/node-postgres` (13K+ ⭐) - De-facto standard pg client
- **MySQL:** `sidorares/node-mysql2` (4.2K+ ⭐) - Fast, MySQL 8.0+ support
- **MongoDB:** `mongodb/node-mongodb-native` (10K+ ⭐) - Official driver
- **MongoDB ODM:** `Automattic/mongoose` (27K+ ⭐) - Schema validation for MongoDB
- **SQLite:** `WiseLibs/better-sqlite3` (5.8K+ ⭐) - Fastest, synchronous API

### Caching Solutions
- **Production:** `redis/node-redis` (17K+ ⭐) - Distributed caching, sessions, pub/sub
- **Advanced Redis:** `luin/ioredis` (15K+ ⭐) - Cluster, Sentinel, Lua scripts
- **Development:** `node-cache/node-cache` (2.3K+ ⭐) - Zero-dependency in-memory cache
- **Memory-Bounded:** `isaacs/node-lru-cache` (5.4K+ ⭐) - LRU with automatic eviction

### Decision Guide
| Need | Choose | Why |
|------|--------|-----|
| Best TypeScript DX | Prisma | Type-safety, schema-first, rich ecosystem |
| SQL Control | TypeORM | Flexible, Active Record + Data Mapper |
| Authorization | ZenStack | Prisma + declarative access control |
| Production Cache | Redis | Distributed, persistent, pub/sub |
| Dev/Test Cache | node-cache | Zero deps, simple, local |
| PostgreSQL + Vectors | Prisma + pgvector | Keep vectors with relational data |

---

## Quick Decision Guide

**Choose Prisma if you want:**
- Best-in-class type safety and developer experience
- Schema-first approach with auto-generated types
- Rich ecosystem (Prisma Studio, Migrate, Accelerate, Pulse)
- Modern TypeScript-first (90% smaller bundle in v6.16+)

**Choose TypeORM if you need:**
- Maximum SQL control and flexibility
- Active Record or Data Mapper patterns
- Widest range of database support

**Choose Redis (node-redis) for:**
- Production caching across multiple servers
- Session storage and state management
- Real-time features (pub/sub)
- Rate limiting and distributed locks

**Choose node-cache for:**
- Development and testing
- Single-server applications
- Lightweight without external dependencies

---

## ESSENTIAL TypeScript ORMs

### #1: Prisma ORM - THE Standard for TypeScript/Node.js

**⭐ prisma/prisma** (44,016 stars) ⚡ THE #1 CHOICE FOR 2025

- Next-generation ORM for Node.js & TypeScript | PostgreSQL, MySQL, MariaDB, SQL Server, SQLite, MongoDB and CockroachDB
- 🔗 https://github.com/prisma/prisma

**Why Essential:**
Prisma is THE definitive ORM for TypeScript/Node.js development in 2025. It provides the strongest type-safety guarantees of any TypeScript ORM, with automatic type generation that makes runtime database errors nearly impossible. The intuitive, schema-first approach and auto-generated client offer unmatched developer experience with full IDE auto-completion.

**2025 Recommendation:**
Prisma completed its migration from Rust to TypeScript-native architecture in September 2025 (v6.16.0), resulting in 90% smaller bundle sizes, faster query execution (30% improvement on complex joins), and lower CPU footprint. The new ESM-first generator and TypedSQL feature allow you to write raw SQL with full type-checking. With Prisma Accelerate for connection pooling/caching and Prisma Pulse for real-time events, Prisma offers the most complete TypeScript database toolkit available.

**Latest 2025 Features:**
- Rust-free version (v6.16.0+): 90% smaller bundle, faster queries, lower CPU usage
- ESM-first generator: Production-ready with full developer control
- TypedSQL: Execute raw SQL with type-checking and auto-completion
- Prisma Accelerate: Connection pooling and global caching
- Prisma Pulse: Real-time database events
- Prisma Studio: Visual database management

**Best For:**
- New TypeScript projects requiring type safety
- Teams prioritizing developer productivity
- Modern applications with complex data models
- Projects requiring rapid development cycles

**Use Case:** Primary ORM for all TypeScript/Node.js projects

---

### #2: TypeORM - Mature Alternative with Maximum Flexibility

**⭐ typeorm/typeorm** (35,875 stars) ⚡ MATURE ALTERNATIVE

- ORM for TypeScript and JavaScript. Supports multiple databases including Google Spanner
- 🔗 https://github.com/typeorm/typeorm

**Why Essential:**
TypeORM remains the most flexible TypeScript ORM, uniquely supporting both Active Record and Data Mapper patterns. It offers fine-grained SQL control while maintaining TypeScript type safety through decorators and interfaces. TypeORM supports more database engines than any other TypeScript ORM, making it ideal for enterprise environments with diverse database requirements.

**2025 Recommendation:**
Choose TypeORM when you need maximum control over SQL queries, architectural flexibility, or support for specialized databases. Its mature ecosystem and extensive features make it the go-to choice for teams that prefer working closer to SQL or migrating from traditional ORMs. The large legacy user base ensures long-term stability and extensive community resources.

**Key Strengths:**
- Dual pattern support: Active Record & Data Mapper
- Broadest database support: PostgreSQL, MySQL, MariaDB, SQL Server, Oracle, SAP HANA, Google Spanner, MongoDB, SQLite
- Fine-grained SQL control with query builder
- Mature ecosystem with extensive features
- Rich migration and synchronization capabilities

**Best For:**
- Projects requiring extensive SQL customization
- Teams comfortable with SQL who want control
- Enterprise apps with diverse database requirements
- Migration from traditional ORMs

**Use Case:** TypeScript ORM for maximum SQL control and flexibility

---

### #3: ZenStack - Prisma + Authorization

**⭐ zenstackhq/zenstack** (2,679 stars) ⚡ ESSENTIAL FOR AUTH

- Full-Stack TypeScript toolkit that enhances Prisma ORM with flexible Authorization layer for RBAC/ABAC/PBAC/ReBAC
- 🔗 https://github.com/zenstackhq/zenstack

**Why Essential:**
ZenStack extends Prisma with declarative authorization policies directly in your schema, eliminating the need for separate authorization logic throughout your application. It brings access control to the database layer while maintaining Prisma's type safety and developer experience.

**2025 Recommendation:**
For applications requiring complex authorization (role-based, attribute-based, or relationship-based access control), ZenStack is the most elegant solution. It keeps authorization logic centralized and type-safe, reducing bugs and improving maintainability. Perfect for multi-tenant SaaS applications or any project with sophisticated permission requirements.

**Use Case:** Prisma with built-in authorization for multi-tenant apps

---

## Additional TypeScript ORMs

**⭐ mikro-orm/mikro-orm** (8,553 stars)
- TypeScript ORM based on Data Mapper, Unit of Work and Identity Map patterns
- 🔗 https://github.com/mikro-orm/mikro-orm
- **2025 Context:** Type-safe ORM emphasizing clean architecture and domain-driven design. Implements Unit of Work pattern for optimized database operations.
- **Use Case:** Advanced TypeScript ORM for DDD architectures

**⭐ drizzle-team/drizzle-orm**
- Lightweight, TypeScript-first ORM with SQL-centric approach and zero dependencies
- 🔗 https://github.com/drizzle-team/drizzle-orm
- **2025 Context:** Ideal for serverless environments with minimal overhead. SQL-first design for developers who prefer writing SQL-like queries.
- **Use Case:** Lightweight ORM for serverless and edge computing

---

## Node.js Database Clients

### PostgreSQL Clients

**⭐ brianc/node-postgres** (12,500+ stars) ⚡ ESSENTIAL
- PostgreSQL client for Node.js (pg)
- 🔗 https://github.com/brianc/node-postgres
- **2025 Context:** The de-facto standard PostgreSQL client for Node.js. Full support for async/await, connection pooling, prepared statements, and TypeScript.
- **Use Case:** Direct PostgreSQL access without ORM

**⭐ sequelize/sequelize** (29,723 stars)
- Feature-rich ORM for PostgreSQL, MySQL, MariaDB, SQLite, and Microsoft SQL Server
- 🔗 https://github.com/sequelize/sequelize
- **Use Case:** Traditional promise-based ORM with wide database support

### MySQL Clients

**⭐ mysqljs/mysql** (18,300+ stars) ⚡ ESSENTIAL
- Pure Node.js MySQL client implementing the MySQL protocol
- 🔗 https://github.com/mysqljs/mysql
- **Use Case:** Direct MySQL access without ORM

**⭐ sidorares/node-mysql2** (4,200+ stars)
- Faster MySQL client with prepared statements, support for MySQL 8.0
- 🔗 https://github.com/sidorares/node-mysql2
- **2025 Context:** Preferred over mysqljs/mysql for better performance and MySQL 8.0+ features
- **Use Case:** High-performance MySQL client

### MongoDB Clients

**⭐ mongodb/node-mongodb-native** (10,100+ stars) ⚡ ESSENTIAL
- Official MongoDB driver for Node.js
- 🔗 https://github.com/mongodb/node-mongodb-native
- **2025 Context:** Full support for MongoDB 7.0+, TypeScript definitions included
- **Use Case:** Direct MongoDB access

**⭐ Automattic/mongoose** (27,100+ stars)
- MongoDB object modeling tool designed to work in an asynchronous environment
- 🔗 https://github.com/Automattic/mongoose
- **Use Case:** MongoDB ODM with schema validation

### SQLite Clients

**⭐ TryGhost/node-sqlite3** (6,400+ stars)
- Asynchronous, non-blocking SQLite3 bindings for Node.js
- 🔗 https://github.com/TryGhost/node-sqlite3
- **Use Case:** Embedded SQLite database

**⭐ WiseLibs/better-sqlite3** (5,800+ stars)
- The fastest and simplest library for SQLite3 in Node.js
- 🔗 https://github.com/WiseLibs/better-sqlite3
- **2025 Context:** Synchronous API with superior performance, TypeScript support
- **Use Case:** High-performance embedded database

---

## Caching & In-Memory Data Stores

### Redis - Production Caching & Session Store

**⭐ redis/node-redis** (17,100+ stars) ⚡ ESSENTIAL FOR CACHING
- High-performance Node.js Redis client
- 🔗 https://github.com/redis/node-redis
- **Why Essential:** Redis is the industry standard for distributed caching, session storage, pub/sub messaging, and real-time data. The official Node.js client provides full async/await support, connection pooling, and TypeScript definitions.
- **2025 Context:** Full support for Redis 7.x features including Redis Stack (JSON, Search, TimeSeries, Bloom filters). Includes automatic reconnection, cluster support, and Sentinel support.
- **Use Case:** Production caching, session storage, real-time features, rate limiting, distributed locks

**⭐ luin/ioredis** (14,600+ stars) ⚡ ALTERNATIVE REDIS CLIENT
- Robust, performance-focused Redis client for Node.js
- 🔗 https://github.com/luin/ioredis
- **2025 Context:** Feature-rich alternative with built-in Cluster and Sentinel support, Lua scripting, pipeline, transaction support
- **Use Case:** Advanced Redis features, cluster mode, Lua scripts

### In-Memory Caching - Development & Lightweight Apps

**⭐ node-cache/node-cache** (2,300+ stars) ⚡ ESSENTIAL FOR LOCAL CACHING
- Simple and fast Node.js in-memory cache
- 🔗 https://github.com/node-cache/node-cache
- **Why Essential:** Zero-dependency in-memory caching solution perfect for development, testing, or single-server deployments. Simple key-value store with TTL support and automatic cleanup.
- **2025 Context:** Battle-tested, minimal overhead, TypeScript support. Ideal for applications that don't need distributed caching.
- **Best For:**
  - Development and testing environments
  - Single-server applications
  - Lightweight caching without external dependencies
  - API rate limiting and request deduplication
  - Configuration caching
- **Use Case:** In-memory cache for non-distributed applications

**⭐ isaacs/node-lru-cache** (5,400+ stars)
- Least Recently Used (LRU) cache implementation
- 🔗 https://github.com/isaacs/node-lru-cache
- **2025 Context:** Memory-bounded cache with automatic eviction. Used by npm internally.
- **Use Case:** Memory-efficient caching with size limits

### Cache Comparison

| Solution | Use Case | Distributed | Persistence | Complexity |
|----------|----------|-------------|-------------|------------|
| **node-cache** | Development, single-server apps | ❌ | ❌ | Low |
| **node-lru-cache** | Memory-bounded caching | ❌ | ❌ | Low |
| **Redis** | Production, multi-server apps | ✅ | ✅ | Medium |
| **Prisma Accelerate** | Prisma query caching | ✅ | ✅ | Low (integrated) |

**Quick Decision:**
- **Local/Dev:** Use `node-cache` - zero dependencies, simple setup
- **Production/Scale:** Use Redis (`node-redis`) - industry standard, distributed
- **Prisma Users:** Use Prisma Accelerate - integrated caching with connection pooling

---

## Database Tools

**⭐ liam-hq/liam** (4,360 stars)
- Automatically generates beautiful and easy-to-read ER diagrams from your database
- 🔗 https://github.com/liam-hq/liam
- **Use Case:** ER diagram generation from database schemas

**⭐ surrealdb/surrealdb** (30,168 stars)
- A scalable, distributed, collaborative, document-graph database, for the realtime web
- 🔗 https://github.com/surrealdb/surrealdb
- **Use Case:** Modern multi-model database for serverless apps

---

## Learning Resources

**⭐ pingcap/awesome-database-learning** (10,366 stars)
- A list of learning materials to understand databases internals
- 🔗 https://github.com/pingcap/awesome-database-learning
- **Use Case:** Learn database internals and design patterns

**⭐ oxnr/awesome-bigdata** (13,928 stars)
- A curated list of awesome big data frameworks, resources and other awesomeness
- 🔗 https://github.com/oxnr/awesome-bigdata
- **Use Case:** Big data frameworks and tools

---

## 2025 Database Design Patterns

**Modern Patterns in TypeScript ORMs:**

1. **Schema-First Development** (Prisma)
   - Define schema, generate types automatically
   - Single source of truth for data models
   - Type safety from database to application

2. **Data Mapper Pattern** (TypeORM, MikroORM)
   - Separation of domain logic from database access
   - Better for complex business logic
   - Supports clean architecture principles

3. **Active Record Pattern** (TypeORM)
   - Domain objects contain database access logic
   - Simpler for CRUD operations
   - Faster prototyping

4. **Unit of Work Pattern** (MikroORM)
   - Track entity changes, commit in single transaction
   - Optimized database operations
   - Reduced data inconsistency

5. **Type-Safe Query Building** (All Modern ORMs)
   - Compile-time query validation
   - Auto-completion for queries
   - Reduced runtime errors

---

*Part of octocode-mcp resources collection*

