---
title: Handle Unknown Keys Explicitly
impact: CRITICAL
description: Default z.object() strips unknown keys. Use strictObject or looseObject for explicit behavior.
tags: object, unknown-keys, strict, passthrough
---

# Handle Unknown Keys Explicitly

## Problem

`z.object()` silently strips any keys not defined in the schema. This can cause data loss when forwarding payloads, storing extra metadata, or proxying API responses.

## Incorrect

```typescript
const Config = z.object({
  host: z.string(),
  port: z.number(),
})

// BUG: unknown keys are silently dropped
const input = { host: "localhost", port: 3000, debug: true, logLevel: "verbose" }
const result = Config.parse(input)
// result = { host: "localhost", port: 3000 } — debug and logLevel are gone
```

## Correct

```typescript
// REJECT unknown keys (API input validation)
const StrictConfig = z.strictObject({
  host: z.string(),
  port: z.number(),
})
// Throws on { host: "localhost", port: 3000, debug: true }

// PRESERVE unknown keys (proxy, forwarding)
const LooseConfig = z.looseObject({
  host: z.string(),
  port: z.number(),
})
// Passes through { host: "localhost", port: 3000, debug: true, logLevel: "verbose" }

// STRIP unknown keys (default — when you explicitly want stripping)
const SafeConfig = z.object({
  host: z.string(),
  port: z.number(),
})
```

## Why

| Variant | Unknown keys | Use when |
|---------|-------------|----------|
| `z.object()` | Strips | Sanitizing user input, you want only known fields |
| `z.strictObject()` | Rejects (error) | API contracts, config validation — no surprises |
| `z.looseObject()` | Preserves | Proxying data, forwarding payloads, middleware |
