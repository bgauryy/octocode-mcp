---
title: Cross-Field Validation
impact: HIGH
description: Use .superRefine() on the parent object for cross-field validation with path targeting.
tags: superRefine, cross-field, password, confirm
---

# Cross-Field Validation

## Problem

Individual field refinements can't access sibling fields. You need to validate at the parent object level and target errors to specific fields using `path`.

## Incorrect

```typescript
// BUG: individual field can't access siblings
const Form = z.object({
  password: z.string().min(8),
  confirm: z.string().refine(
    (val) => val === ???, // can't access password here
    { error: "Passwords don't match" }
  ),
})
```

## Correct

```typescript
const Form = z
  .object({
    password: z.string().min(8),
    confirm: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirm) {
      ctx.addIssue({
        code: "custom",
        path: ["confirm"], // error targets the confirm field
        message: "Passwords don't match",
      })
    }
  })

// Error appears on the "confirm" field, not the root object
```

## Why

`.superRefine()` on the parent object receives the full parsed data and a context for adding issues. Use `path` to target the error to a specific field — this is critical for form libraries that display errors per field.
