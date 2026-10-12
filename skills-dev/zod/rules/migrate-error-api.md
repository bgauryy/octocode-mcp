---
title: "v4: Unified Error Parameter"
impact: MEDIUM
description: Use v4 error parameter everywhere. message, required_error, invalid_type_error, errorMap removed.
tags: migration, v4, errors, message
---

# v4: Unified Error Parameter

## Problem

Zod v3 had multiple ways to customize errors: `message`, `required_error`, `invalid_type_error`, and `errorMap`. Zod v4 replaces all of them with a single `error` parameter.

## Incorrect

```typescript
// BAD: all removed in v4
const name = z.string({ required_error: "Required", invalid_type_error: "Not a string" })
const age = z.number().min(18, { message: "Too young" })
const email = z.email({ errorMap: myErrorMap })
```

## Correct

```typescript
// GOOD: unified error parameter — string shorthand
const name = z.string({ error: "Name is required" })
const age = z.number().min(18, { error: "Must be 18 or older" })

// GOOD: constraint shorthand (string as second arg)
const age2 = z.number().min(18, "Must be 18 or older")

// GOOD: function form for dynamic messages
const name2 = z.string({
  error: (issue) => {
    if (issue.input === undefined) return "Name is required"
    return "Name must be a string"
  },
})
```

## Why

The unified `error` parameter simplifies error customization. The string form covers most cases. The function form provides access to the issue context (`input`, `code`, `minimum`, etc.) for dynamic messages. Global error customization uses `z.config()` with an error map function.
