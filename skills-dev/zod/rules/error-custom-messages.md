---
title: Custom Error Messages (v4 API)
impact: HIGH
description: Use v4 error parameter (string or function). Not v3's required_error/invalid_type_error.
tags: errors, messages, v4, migration
---

# Custom Error Messages (v4 API)

## Problem

Zod v3's `required_error`, `invalid_type_error`, and `message` parameters are removed in v4. Using them silently does nothing — your custom messages won't appear.

## Incorrect

```typescript
// BUG: v3 API — these parameters are removed in v4
const Name = z.string({
  required_error: "Name is required",
  invalid_type_error: "Name must be a string",
})

const Age = z.number().min(18, { message: "Must be 18+" })
```

## Correct

```typescript
// GOOD: v4 error parameter — string shorthand
const Name = z.string({ error: "Name is required" })
const Age = z.number().min(18, { error: "Must be 18+" })

// GOOD: v4 error parameter — function for dynamic messages
const Name = z.string({
  error: (issue) =>
    issue.input === undefined
      ? "Name is required"
      : "Name must be a string",
})

// GOOD: string shorthand for constraints
const Age = z.number().min(18, "Must be 18+")
```

## Why

Zod v4 unifies all error customization under a single `error` parameter that accepts either a string or a function receiving the issue. The function form gives you access to `issue.input`, `issue.code`, and other context for dynamic messages.
