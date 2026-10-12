---
title: Evolve Schemas Without Breaking Consumers
impact: MEDIUM
description: Use additive changes for non-breaking evolution. New fields use .optional(). Never remove required fields without a major version bump.
tags: architecture, versioning, backward-compatibility, api-evolution
---

# Evolve Schemas Without Breaking Consumers

## Problem

Removing or tightening fields in a Zod schema silently breaks consumers. Because `z.object()` strips unknown keys by default, removed fields vanish from parsed output without any error — consumers reading that field get `undefined` at runtime despite TypeScript showing no compile error if they haven't updated their types.

## Incorrect

```typescript
// v1 — consumers depend on `role`
const UserV1 = z.object({
  name: z.string(),
  email: z.email(),
  role: z.enum(["admin", "user"]),
  nickname: z.string(),
})

// v2 — BREAKING: removed `role`, consumers silently get undefined
const UserV2 = z.object({
  name: z.string(),
  email: z.email(),
  nickname: z.string(),
  // role is gone — consumers calling user.role get undefined
})
```

## Correct

```typescript
// v2 — non-breaking: keep role, add displayName as optional, deprecate nickname
const UserV2 = z.object({
  name: z.string(),
  email: z.email(),
  role: z.enum(["admin", "user"]),         // kept — not removed
  nickname: z.string(),                     // kept — deprecate in docs, remove in v3
  displayName: z.string().optional(),       // new — optional so old payloads still parse
})

type UserV2 = z.infer<typeof UserV2>
```

## Decision Table: Schema Changes

| Change | Breaking? | Safe Approach |
|--------|-----------|---------------|
| Add optional field | No | `.optional()` — old data still parses |
| Add required field | **Yes** | Make optional first, require in next major |
| Remove field | **Yes** | Deprecate first, remove in next major |
| Tighten constraint (e.g., min 1 → min 5) | **Yes** | Previously valid data now fails |
| Loosen constraint (e.g., min 5 → min 1) | No | All existing data still valid |
| Rename field | **Yes** | Add new name as optional, keep old, migrate |
| Change type (e.g., string → number) | **Yes** | New field with new name, deprecate old |
| Add union member | No | Existing data still matches |
| Remove union member | **Yes** | Existing data with that value fails |

## Why

Zod schemas are runtime contracts. Changing them has the same impact as changing an API — consumers that depend on the shape will break. Additive changes (new optional fields, loosened constraints, new union members) are always safe. Subtractive changes (removing fields, tightening constraints) require coordinated migration across all consumers.
