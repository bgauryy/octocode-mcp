---
title: Branded Types for Nominal Typing
impact: MEDIUM
description: Use .brand<"Name">() for nominal typing to prevent mixing structurally identical types.
tags: brand, nominal, type-safety, USD, EUR
---

# Branded Types for Nominal Typing

## Problem

TypeScript uses structural typing — two types with the same shape are interchangeable. This means you can accidentally pass a USD value where EUR is expected, or a UserId where a PostId is expected.

## Incorrect

```typescript
// BAD: nothing prevents mixing these up
type USD = number
type EUR = number

function convert(amount: USD, rate: number): EUR {
  return amount * rate
}

const priceInEur: EUR = 100
convert(priceInEur, 1.1) // No error! EUR passed as USD
```

## Correct

```typescript
// GOOD: branded types prevent mixing
const USD = z.number().brand<"USD">()
const EUR = z.number().brand<"EUR">()

type USD = z.infer<typeof USD> // number & { __brand: "USD" }
type EUR = z.infer<typeof EUR> // number & { __brand: "EUR" }

function convert(amount: USD, rate: number): EUR {
  return EUR.parse(amount * rate)
}

const priceInEur = EUR.parse(100)
convert(priceInEur, 1.1) // TypeScript error! EUR is not USD
```

## Why

`.brand()` adds a phantom type brand that makes structurally identical types incompatible at the TypeScript level. Use this for IDs (UserId vs PostId), currencies, units, or any domain where mixing values is a logic error.
