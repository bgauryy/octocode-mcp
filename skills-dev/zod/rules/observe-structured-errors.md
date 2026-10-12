---
title: Log Structured Errors, Not Raw ZodError
impact: HIGH
description: Use z.flattenError() for compact, structured logs with request correlation IDs. Never console.log a raw ZodError — it's noisy, unstructured, and impossible to query.
tags: observability, logging, errors, flattenError, structured-logging
---

# Log Structured Errors, Not Raw ZodError

## Problem

Raw `ZodError` objects contain deeply nested issue arrays with internal metadata. Logging them directly produces noisy, unstructured output that's impossible to filter, alert on, or query in log aggregation tools (Datadog, Grafana, ELK).

## Incorrect

```typescript
// BUG: raw ZodError is noisy and unqueryable
app.post("/api/users", (req, res) => {
  const result = UserSchema.safeParse(req.body)
  if (!result.success) {
    logger.error("Validation failed", { error: result.error })
    // Logs a massive nested object with internal Zod metadata
    // Cannot search by field name, schema, or request
    return res.status(400).json({ error: "Invalid input" })
  }
})
```

```typescript
// BUG: console.log — no structure, no correlation
if (!result.success) {
  console.log("Validation failed:", result.error)
}
```

## Correct

```typescript
app.post("/api/users", (req, res) => {
  const result = UserSchema.safeParse(req.body)
  if (!result.success) {
    const flat = z.flattenError(result.error)
    logger.warn("validation_failed", {
      requestId: req.id,
      schema: "UserSchema",
      path: req.path,
      formErrors: flat.formErrors,
      fieldErrors: flat.fieldErrors,
    })
    return res.status(400).json({ errors: flat.fieldErrors })
  }
})
```

```typescript
// Reusable helper for consistent structured logging
function logValidationError(
  logger: Logger,
  opts: {
    requestId: string
    schema: string
    error: z.ZodError
    path?: string
  }
) {
  const flat = z.flattenError(opts.error)
  logger.warn("validation_failed", {
    requestId: opts.requestId,
    schema: opts.schema,
    path: opts.path,
    formErrors: flat.formErrors,
    fieldErrors: flat.fieldErrors,
    fieldCount: Object.keys(flat.fieldErrors).length,
  })
}
```

## Why

Structured logs with `z.flattenError()` are compact (field name → error messages), queryable (search by schema name or failing field), and correlatable (request ID ties the error to a specific request). This enables dashboards that show which schemas and fields fail most often, alerting on validation spike rates, and debugging specific user requests.
