---
title: "v4: Top-Level String Formats"
impact: MEDIUM
description: Use top-level z.email(), z.uuid(), z.url() instead of deprecated z.string().email().
tags: migration, v4, string, email, uuid, url
---

# v4: Top-Level String Formats

## Problem

Zod v4 promotes string format validators to top-level functions. The old `z.string().email()` chaining style is deprecated.

## Incorrect

```typescript
// BAD: deprecated v3 style — chained string methods
const Email = z.string().email()
const Url = z.string().url()
const Uuid = z.string().uuid()
const Cuid = z.string().cuid()
```

## Correct

```typescript
// GOOD: v4 top-level format functions
const Email = z.email()
const Url = z.url()
const Uuid = z.uuid()
const Cuid = z.cuid()
const Cuid2 = z.cuid2()
const Ulid = z.ulid()
const Emoji = z.emoji()
const Ipv4 = z.ipv4()
const Ipv6 = z.ipv6()
const Cidrv4 = z.cidrv4()
const Cidrv6 = z.cidrv6()
const Jwt = z.jwt()
const Base64 = z.base64()
const Base64url = z.base64url()
```

## Why

Top-level format functions return dedicated schema types with optimized validation. They also compose better — `z.email()` is shorter and clearer than `z.string().email()`. The old chained syntax is deprecated in v4.
