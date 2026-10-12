---
title: Error Formatting Functions
impact: HIGH
description: Use z.treeifyError() for nested, z.flattenError() for forms. Not deprecated z.formatError().
tags: errors, formatting, treeify, flatten
---

# Error Formatting Functions

## Problem

Zod v4 replaces `z.formatError()` with `z.treeifyError()` and `z.flattenError()`. Using the deprecated function gives different output shapes.

## Incorrect

```typescript
// BUG: deprecated in v4
const result = schema.safeParse(data)
if (!result.success) {
  const formatted = z.formatError(result.error) // deprecated
}
```

## Correct

```typescript
const result = schema.safeParse(data)
if (!result.success) {
  // For flat forms — { formErrors: string[], fieldErrors: Record<string, string[]> }
  const flat = z.flattenError(result.error)
  // flat.fieldErrors.email → ["Invalid email"]

  // For nested structures — tree mirrors schema shape
  const tree = z.treeifyError(result.error)
  // tree.properties.address.properties.zip.errors → ["Required"]

  // For debugging — human-readable string
  const pretty = z.prettifyError(result.error)
  // "✖ Invalid email at «email»\n✖ Required at «address.zip»"
}
```

## Why

| Function | Output | Use case |
|----------|--------|----------|
| `z.flattenError()` | `{ formErrors, fieldErrors }` | Flat forms, simple field→error mapping |
| `z.treeifyError()` | Nested tree matching schema shape | Deeply nested forms, recursive schemas |
| `z.prettifyError()` | Human-readable string | Logging, debugging, CLI output |
