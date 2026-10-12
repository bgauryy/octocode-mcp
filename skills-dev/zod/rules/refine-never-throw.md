---
title: Never Throw in Refinements
impact: HIGH
description: Refinement and transform functions must never throw. Return false or use ctx.addIssue().
tags: refine, superRefine, throw, error
---

# Never Throw in Refinements

## Problem

Throwing inside a `.refine()` or `.transform()` callback bypasses Zod's error handling. The exception won't be wrapped in a `ZodError` — it will crash the parse operation and bubble as an unhandled exception.

## Incorrect

```typescript
// BUG: throwing inside refine bypasses Zod error handling
const PositiveNumber = z.number().refine((n) => {
  if (n <= 0) throw new Error("Must be positive") // crashes parse
  return true
})
```

## Correct

```typescript
// GOOD: return boolean from refine
const PositiveNumber = z.number().refine(
  (n) => n > 0,
  { error: "Must be positive" }
)

// GOOD: use superRefine with ctx.addIssue for complex logic
const Password = z.string().superRefine((val, ctx) => {
  if (val.length < 8) {
    ctx.addIssue({
      code: "custom",
      message: "Password must be at least 8 characters",
    })
  }
  if (!/[A-Z]/.test(val)) {
    ctx.addIssue({
      code: "custom",
      message: "Password must contain an uppercase letter",
    })
  }
})
```

## Why

`.refine()` expects a boolean return (or a Promise<boolean> for async). `.superRefine()` with `ctx.addIssue()` allows multiple issues per field. Both integrate cleanly with Zod's error system — throwing does not.
