---
title: Error Formatting Functions
impact: HIGH
description: Use z.treeifyError() for nested, z.flattenError() for forms. Choose the output shape consumers expect.
tags: errors, formatting, treeify, flatten
---

# Error Formatting Functions

## Problem

`z.formatError()` remains exported and returns a tree using `_errors`. It is not interchangeable with `z.treeifyError()` or `z.flattenError()`. Choose the formatter to match the consumer; the deprecated instance method `error.format()` is a separate API.

## Incorrect

```typescript
// Wrong if the consumer expects treeifyError properties/errors
const result = schema.safeParse(data)
if (!result.success) {
  const formatted = z.formatError(result.error) // uses _errors keys
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
