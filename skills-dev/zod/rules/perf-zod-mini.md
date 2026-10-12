---
title: Use Zod Mini for Client Bundles
impact: MEDIUM
description: Use Zod Mini (1.88kb) for bundle-critical client-side apps. Functional API instead of methods.
tags: bundle-size, mini, client, tree-shaking
---

# Use Zod Mini for Client Bundles

## Problem

Full Zod adds significant weight to client bundles. For form validation or client-side parsing where bundle size matters, Zod Mini provides the same core functionality at ~1.88kb gzipped.

## Incorrect

```typescript
// BAD: full Zod in a client bundle where size matters
import { z } from "zod"

const LoginForm = z.object({
  email: z.email(),
  password: z.string().min(8),
})
```

## Correct

```typescript
// GOOD: Zod Mini for client bundles — 1.88kb gzipped
import { z } from "zod/v4/mini"

const LoginForm = z.object({
  email: z.email(),
  password: z.string().check(z.minLength(8)),
})
```

## Why

Zod Mini uses a functional API (`.check()` with check functions) instead of the chainable method API. This enables better tree-shaking. Use full Zod on the server where bundle size doesn't matter, and Zod Mini on the client where it does.

| | Full Zod | Zod Mini |
|---|---|---|
| Size (gzip) | ~13kb | ~1.88kb |
| API style | Method chaining (`.min()`, `.max()`) | Functional (`.check(z.minLength())`) |
| Features | All | Core (no `.describe()`, no JSON Schema) |
| Use when | Server, Node.js, scripts | Client bundles, edge functions |
