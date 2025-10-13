# Database & ORM Resources

> Database design, ORMs, and data management for Node.js/TypeScript applications

**🎯 Purpose:** Database resources for AI agents using octocode-mcp to generate Node.js/TypeScript applications
**🤖 For:** AI agents and developers choosing databases and ORMs for Node.js
**🌐 Focus:** Prisma, TypeORM, Drizzle - TypeScript-first ORMs
**📱 Mobile:** Same database/ORM for web and mobile backends
**⚙️ Runtime:** Node.js database clients and TypeScript ORMs

**Last Updated:** October 13, 2025

---

## 🎯 Best for Application Generation

This file provides **database guidance** to help AI agents:
1. **Choose ORM** - Prisma vs TypeORM vs Drizzle comparisons
2. **Design schemas** - Schema-first vs code-first approaches
3. **Select database** - PostgreSQL, MySQL, MongoDB with Node.js
4. **Handle migrations** - Version control and database evolution
5. **Optimize queries** - TypeScript-safe query builders

**Generation Priorities:**
- ⚡ **Prisma** - Best-in-class type safety and DX (2025 default)
- ⚡ **PostgreSQL** - Most recommended database for production
- ⚡ **TypedSQL** - Direct SQL with TypeScript types
- ⚡ **ZenStack** - Prisma + authorization rules

---

## Quick Decision Guide

**Choose Prisma if you want:**
- Best-in-class type safety and developer experience
- Schema-first approach with auto-generated types
- Rich ecosystem (Prisma Studio, Migrate, Accelerate, Pulse)
- Modern TypeScript-first architecture (Rust-free as of 2025)
- Rapid development with intuitive API

**Choose TypeORM if you need:**
- Maximum SQL control and flexibility
- Active Record or Data Mapper patterns
- Support for widest range of databases
- Mature ecosystem with extensive features

**Choose ZenStack if you require:**
- Prisma + built-in authorization (RBAC/ABAC/PBAC/ReBAC)
- Full-stack TypeScript with access control
- Authorization logic at the database layer

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

## Quick Reference

**Primary ORM Choice:**
- `prisma/prisma` - Default choice for all TypeScript/Node.js projects

**Alternative ORMs:**
- `typeorm/typeorm` - When you need SQL control
- `mikro-orm/mikro-orm` - For DDD architectures
- `drizzle-team/drizzle-orm` - For serverless/edge

**Authorization:**
- `zenstackhq/zenstack` - Prisma + built-in access control

**Tooling:**
- `liam-hq/liam` - ER diagram generation
- Prisma Studio - Visual database management (included with Prisma)

**Learning:**
- `pingcap/awesome-database-learning` - Database internals
- `oxnr/awesome-bigdata` - Big data tools

---

*Part of octocode-mcp resources collection*

