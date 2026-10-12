---
title: Track Validation Error Rates per Schema and Field
impact: MEDIUM
description: Wrap safeParse in a tracked helper that increments counters per schema and per field on failure. Identify too-strict schemas (high failure rate) and too-loose schemas (never fail).
tags: observability, metrics, monitoring, validation, production
---

# Track Validation Error Rates per Schema and Field

## Problem

Without metrics on validation failures, you have no visibility into schema behavior in production. Too-strict schemas silently reject valid user input (causing UX frustration), while too-loose schemas that never fail may not be providing any real protection.

## Incorrect

```typescript
// No monitoring — validation is a black box
app.post("/api/orders", (req, res) => {
  const result = OrderSchema.safeParse(req.body)
  if (!result.success) {
    return res.status(400).json({ error: "Invalid" })
  }
  // How often does this fail? Which fields? No one knows.
})
```

## Correct

```typescript
import { z } from "zod"

// Tracked safeParse wrapper
function trackedSafeParse<T extends z.ZodType>(
  schema: T,
  data: unknown,
  schemaName: string
): z.SafeParseReturnType<z.input<T>, z.output<T>> {
  const result = schema.safeParse(data)

  metrics.increment("zod.validation.attempt", { schema: schemaName })

  if (!result.success) {
    metrics.increment("zod.validation.failure", { schema: schemaName })

    // Track which fields fail
    const flat = z.flattenError(result.error)
    for (const field of Object.keys(flat.fieldErrors)) {
      metrics.increment("zod.validation.field_error", {
        schema: schemaName,
        field,
      })
    }
  }

  return result
}

// Usage
app.post("/api/orders", (req, res) => {
  const result = trackedSafeParse(OrderSchema, req.body, "OrderSchema")
  if (!result.success) {
    return res.status(400).json({
      errors: z.flattenError(result.error).fieldErrors,
    })
  }
  processOrder(result.data)
})
```

## What the Metrics Tell You

| Signal | Meaning | Action |
|--------|---------|--------|
| High failure rate on a schema | Schema may be too strict | Review constraints, check if users send valid data that gets rejected |
| One field dominates failures | Confusing input format | Improve form UX, add coercion, clarify docs |
| Schema never fails | Schema may be too loose | Review if it's actually validating anything meaningful |
| Failure spike after deploy | Schema change broke clients | Roll back or make the change additive |

## Why

Validation metrics close the feedback loop between schema design and real-world usage. Without them, you're guessing whether schemas are helping or hurting. Tracking per-schema and per-field failure rates turns Zod from a silent gatekeeper into an observable system component.
