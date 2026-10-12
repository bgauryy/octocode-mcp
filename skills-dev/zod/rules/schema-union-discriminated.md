---
title: Use Discriminated Unions
impact: CRITICAL
description: Use z.discriminatedUnion() for tagged object unions instead of z.union().
tags: union, discriminated, tagged, performance
---

# Use Discriminated Unions

## Problem

`z.union()` tries each branch sequentially until one matches. For object unions with a shared discriminator field (like `type` or `kind`), this is slow and produces confusing error messages that show issues from every branch.

## Incorrect

```typescript
// BAD: tries each branch sequentially, error shows issues from all branches
const Shape = z.union([
  z.object({ type: z.literal("circle"), radius: z.number() }),
  z.object({ type: z.literal("square"), side: z.number() }),
  z.object({ type: z.literal("rect"), width: z.number(), height: z.number() }),
])
// Error on invalid input: "Invalid input" (unhelpful — which branch failed?)
```

## Correct

```typescript
// GOOD: uses discriminator for O(1) dispatch, targeted errors
const Shape = z.discriminatedUnion("type", [
  z.object({ type: z.literal("circle"), radius: z.number() }),
  z.object({ type: z.literal("square"), side: z.number() }),
  z.object({ type: z.literal("rect"), width: z.number(), height: z.number() }),
])
// Error: "Invalid discriminator. Expected 'circle' | 'square' | 'rect'"
```

## Why

`discriminatedUnion` checks the discriminator field first, then only validates the matching branch. This gives O(1) dispatch instead of O(n) sequential checking, and error messages target the actual problem instead of listing every branch's failures.
