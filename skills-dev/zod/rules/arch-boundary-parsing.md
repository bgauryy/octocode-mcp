---
title: Parse at System Boundaries, Not in Domain Logic
impact: CRITICAL
description: Call safeParse() at entry points (API handlers, env startup, form resolvers, external fetches) and pass typed data inward. Domain logic receives typed values, not unknown.
tags: architecture, boundaries, parsing, safeParse, separation-of-concerns
---

# Parse at System Boundaries, Not in Domain Logic

## Problem

When `safeParse()` calls are scattered throughout domain logic, every function must handle `unknown` input and validation errors. This mixes parsing concerns with business logic, makes error handling inconsistent, and creates redundant validation.

## Incorrect

```typescript
// BUG: domain logic handles unknown input and parsing
function calculateDiscount(data: unknown) {
  const result = OrderSchema.safeParse(data)
  if (!result.success) {
    throw new Error("Invalid order")
  }
  const order = result.data
  if (order.total > 100) {
    return order.total * 0.1
  }
  return 0
}

// BUG: service layer re-parses what was already validated
function processOrder(data: unknown) {
  const result = OrderSchema.safeParse(data)
  if (!result.success) return { error: "Invalid" }
  const discount = calculateDiscount(data) // parses again!
  return { total: result.data.total - discount }
}
```

## Correct

```typescript
// Parse ONCE at the boundary
app.post("/orders", (req, res) => {
  const result = OrderSchema.safeParse(req.body)
  if (!result.success) {
    return res.status(400).json({
      errors: z.flattenError(result.error).fieldErrors,
    })
  }
  // Pass typed data inward — no more unknown
  const response = processOrder(result.data)
  res.json(response)
})

// Domain logic receives typed data — no parsing needed
function calculateDiscount(order: Order): number {
  return order.total > 100 ? order.total * 0.1 : 0
}

function processOrder(order: Order) {
  const discount = calculateDiscount(order)
  return { total: order.total - discount }
}

type Order = z.infer<typeof OrderSchema>
```

## Decision Table: Where to Parse

| Boundary | Where to call safeParse() |
|----------|--------------------------|
| Express/Fastify route | In the route handler, before calling service functions |
| tRPC | `.input(Schema)` — framework parses for you |
| Next.js Server Action | At the top of the action function, before any logic |
| React Hook Form | `zodResolver(Schema)` — resolver parses on submit |
| Environment variables | At app startup (e.g., `envSchema.parse(process.env)`) |
| External API response | Immediately after `fetch()`, before using the data |
| Database results | After query, if schema might drift from DB shape |
| Message queue consumer | At the top of the handler, before processing |

## Why

Parsing at the boundary means domain functions are pure — they accept typed values and return typed values. This eliminates redundant validation, centralizes error handling, and makes business logic easier to test (no need to construct invalid inputs). The boundary layer is the only place that deals with `unknown` data.
