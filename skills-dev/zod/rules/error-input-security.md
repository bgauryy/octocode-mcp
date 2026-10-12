---
title: reportInput Leaks Sensitive Data
impact: HIGH
description: Never enable reportInput in production. It embeds raw input values in error messages.
tags: security, reportInput, logging, production
---

# reportInput Leaks Sensitive Data

## Problem

Zod v4's `reportInput` option includes the raw input value in error issues. If enabled in production, sensitive data (passwords, tokens, PII) ends up in error logs, monitoring systems, and API responses.

## Incorrect

```typescript
// BUG: leaks passwords, tokens, PII into error messages
app.post("/register", (req, res) => {
  const result = UserSchema.safeParse(req.body, { reportInput: true })
  if (!result.success) {
    // error.issues[0].input could contain: "myP@ssw0rd123"
    logger.error(result.error.issues)
    res.status(400).json({ errors: result.error.issues })
  }
})
```

## Correct

```typescript
// GOOD: only use reportInput in development/debugging
const parseOptions = {
  reportInput: process.env.NODE_ENV === "development",
}

app.post("/register", (req, res) => {
  const result = UserSchema.safeParse(req.body, parseOptions)
  if (!result.success) {
    // In production, issues won't contain raw input values
    const flat = z.flattenError(result.error)
    res.status(400).json({ errors: flat.fieldErrors })
  }
})
```

## Why

Error issues are routinely logged, sent to error monitoring (Sentry, Datadog), and sometimes returned in API responses. Including raw input values in these flows violates data privacy principles and can expose sensitive user data.
