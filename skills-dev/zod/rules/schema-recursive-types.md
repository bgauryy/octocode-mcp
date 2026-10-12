---
title: Recursive Schema Design
impact: CRITICAL
description: Use getter pattern for recursive schemas. Never pass cyclical data.
tags: recursive, lazy, getter, tree
---

# Recursive Schema Design

## Problem

Recursive schemas (trees, nested comments, categories) require special handling. Direct self-reference doesn't work because the variable isn't defined yet. Zod v4 uses a getter pattern instead of `z.lazy()`.

## Incorrect

```typescript
// AVOID: z.lazy() still works in Zod v4 but needs a hand-written type
const Category = z.object({
  name: z.string(),
  children: z.lazy(() => z.array(Category)),
})

// BUG: direct reference — Category not yet defined
const Category = z.object({
  name: z.string(),
  children: z.array(Category), // ReferenceError
})
```

## Correct

```typescript
// GOOD: getter pattern for recursive schemas in Zod v4
const Category = z.object({
  name: z.string(),
  get children() {
    return z.array(Category).optional()
  },
})

type Category = z.infer<typeof Category>
// { name: string; children?: Category[] | undefined }
```

## Why

The getter pattern defers property access until parse-time, avoiding the temporal dead zone. It is the Zod v4 replacement for most `z.lazy()` uses. Never pass cyclical data (objects that reference themselves) to a recursive schema — it will cause an infinite loop with no error.
