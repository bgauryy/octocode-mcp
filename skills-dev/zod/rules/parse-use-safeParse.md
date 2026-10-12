---
title: Use safeParse() for User Input
impact: CRITICAL
description: Use safeParse() instead of parse() to avoid throwing on invalid input.
tags: parsing, safeParse, error-handling, validation
---

# Use safeParse() for User Input

## Problem

`parse()` throws a `ZodError` on invalid input. Wrapping it in try/catch is verbose and error-prone — you lose the discriminated success/error result and risk catching unrelated errors.

## Incorrect

```typescript
// BUG: try/catch is verbose and catches unrelated errors
function validateInput(data: unknown) {
  try {
    const result = UserSchema.parse(data)
    return { success: true, data: result }
  } catch (e) {
    if (e instanceof z.ZodError) {
      return { success: false, errors: e.errors }
    }
    throw e // rethrow non-Zod errors
  }
}
```

## Correct

```typescript
function validateInput(data: unknown) {
  const result = UserSchema.safeParse(data)
  if (!result.success) {
    return { success: false, errors: result.error.issues }
  }
  return { success: true, data: result.data }
}
```

## Why

`safeParse()` returns a discriminated union `{ success: true, data } | { success: false, error }`. No exceptions, no try/catch, no risk of catching unrelated errors. Use `parse()` only when invalid data is truly exceptional (e.g., internal config that should never be wrong).
