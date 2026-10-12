---
title: Reuse Schemas with Composition
impact: MEDIUM
description: Define schemas once. Use .pick(), .omit(), .partial() to derive variants.
tags: composition, pick, omit, partial, DRY
---

# Reuse Schemas with Composition

## Problem

Duplicating field definitions across related schemas (Create, Update, Response) leads to drift. When a field changes, only some schemas get updated.

## Incorrect

```typescript
// BAD: fields duplicated across schemas
const UserCreate = z.object({
  name: z.string(),
  email: z.email(),
  password: z.string().min(8),
})

const UserUpdate = z.object({
  name: z.string().optional(),
  email: z.email().optional(),
  // forgot password field — drift
})

const UserResponse = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  createdAt: z.date(),
})
```

## Correct

```typescript
// GOOD: single source, derive variants
const User = z.object({
  id: z.string(),
  name: z.string(),
  email: z.email(),
  password: z.string().min(8),
  createdAt: z.date(),
})

const UserCreate = User.omit({ id: true, createdAt: true })
const UserUpdate = User.pick({ name: true, email: true }).partial()
const UserResponse = User.omit({ password: true })
```

## Why

`pick()`, `omit()`, `partial()`, and `required()` derive new schemas from a base. Changes to the base propagate automatically to all derived schemas. The inferred types also stay in sync.
