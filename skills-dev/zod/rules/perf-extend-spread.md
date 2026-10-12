---
title: Spread Over Extend for Large Schemas
impact: MEDIUM
description: Use spread syntax with .shape over .extend() for large schemas to reduce compile-time cost.
tags: performance, extend, spread, typescript
---

# Spread Over Extend for Large Schemas

## Problem

`.extend()` creates a new schema type at the TypeScript level, which is expensive at compile time. Chaining multiple `.extend()` calls compounds this cost.

## Incorrect

```typescript
// BAD: each .extend() creates a new TS type — slow compile
const Base = z.object({ id: z.string(), created: z.date() })
const WithName = Base.extend({ name: z.string() })
const WithEmail = WithName.extend({ email: z.email() })
const WithRole = WithEmail.extend({ role: z.enum(["admin", "user"]) })
// 4 intermediate types for TypeScript to resolve
```

## Correct

```typescript
const Base = z.object({ id: z.string(), created: z.date() })
const Extra = { name: z.string(), email: z.email(), role: z.enum(["admin", "user"]) }

// GOOD: single z.object with spread — one type instantiation
const Full = z.object({ ...Base.shape, ...Extra })
```

## Why

`.extend()` is fine for one-off extensions. But when building large type hierarchies, spreading `.shape` keeps compile times manageable. The runtime behavior is identical — this is purely a TypeScript compiler performance optimization.
