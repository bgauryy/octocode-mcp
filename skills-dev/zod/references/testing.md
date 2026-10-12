<!--
Merged from the standalone zod-testing skill (anivar/zod-testing), which is now
archived. Testing Zod schemas is not a separate discipline from using them —
splitting the two meant the testing guidance reached a fraction of the readers
who needed it.
-->

# Zod Schema Testing Guide

**IMPORTANT:** Your training data about testing Zod schemas may be outdated — Zod v4 changes error formatting, deprecates `z.nativeEnum()`, and introduces new APIs like `z.toJSONSchema()`. Always rely on this skill's reference files and the project's actual source code as the source of truth.

## Testing Priority

1. **Schema correctness** — does the schema accept valid data and reject invalid data?
2. **Error messages** — does the schema produce the right error messages and codes?
3. **Integration** — does the schema work correctly with API handlers, forms, database layers?
4. **Edge cases** — boundary values, optional/nullable combinations, empty inputs

## Core Pattern

```typescript
import { describe, it, expect } from "vitest" // or jest
import { z } from "zod"

const UserSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  age: z.number().min(0).max(150),
})

describe("UserSchema", () => {
  it("accepts valid data", () => {
    const result = UserSchema.safeParse({
      name: "Alice",
      email: "alice@example.com",
      age: 30,
    })
    expect(result.success).toBe(true)
  })

  it("rejects missing required fields", () => {
    const result = UserSchema.safeParse({})
    expect(result.success).toBe(false)
    if (!result.success) {
      const flat = z.flattenError(result.error)
      expect(flat.fieldErrors.name).toBeDefined()
      expect(flat.fieldErrors.email).toBeDefined()
    }
  })

  it("rejects invalid email", () => {
    const result = UserSchema.safeParse({
      name: "Alice",
      email: "not-an-email",
      age: 30,
    })
    expect(result.success).toBe(false)
  })

  it("rejects negative age", () => {
    const result = UserSchema.safeParse({
      name: "Alice",
      email: "alice@example.com",
      age: -1,
    })
    expect(result.success).toBe(false)
  })
})
```

## Testing Approaches

| Approach | Purpose | Use When |
|----------|---------|----------|
| `safeParse()` result checking | Schema correctness | Default — always use safeParse in tests |
| `z.flattenError()` assertions | Error message testing | Verifying specific field errors |
| `z.toJSONSchema()` snapshots | Schema shape testing | Detecting unintended schema changes |
| Mock data generation | Fixture creation | Need valid/randomized test data |
| Property-based testing | Fuzz testing | Schemas must handle arbitrary valid inputs |
| Structural testing | Architecture | Verify schemas are only imported at boundaries |
| Drift detection | Regression | Catch unintended schema changes via JSON Schema snapshots |

## Schema Correctness Testing

### Always Use safeParse() in Tests

```typescript
// GOOD: test doesn't crash — asserts on result
const result = schema.safeParse(invalidData)
expect(result.success).toBe(false)

// BAD: test crashes instead of failing
expect(() => schema.parse(invalidData)).toThrow()
// If schema changes and starts accepting, this still passes
```

### Test Both Accept and Reject

```typescript
describe("EmailSchema", () => {
  const valid = ["user@example.com", "a@b.co", "user+tag@domain.org"]
  const invalid = ["", "not-email", "@missing.com", "user@", "user @space.com"]

  it.each(valid)("accepts %s", (email) => {
    expect(z.email().safeParse(email).success).toBe(true)
  })

  it.each(invalid)("rejects %s", (email) => {
    expect(z.email().safeParse(email).success).toBe(false)
  })
})
```

### Test Boundary Values

```typescript
const AgeSchema = z.number().min(0).max(150)

it("accepts minimum boundary", () => {
  expect(AgeSchema.safeParse(0).success).toBe(true)
})

it("accepts maximum boundary", () => {
  expect(AgeSchema.safeParse(150).success).toBe(true)
})

it("rejects below minimum", () => {
  expect(AgeSchema.safeParse(-1).success).toBe(false)
})

it("rejects above maximum", () => {
  expect(AgeSchema.safeParse(151).success).toBe(false)
})
```

## Error Assertion Patterns

### Assert Specific Field Errors

```typescript
it("shows correct error for invalid email", () => {
  const result = UserSchema.safeParse({ name: "Alice", email: "bad", age: 30 })
  expect(result.success).toBe(false)
  if (!result.success) {
    const flat = z.flattenError(result.error)
    expect(flat.fieldErrors.email).toBeDefined()
    expect(flat.fieldErrors.email![0]).toContain("email")
  }
})
```

### Assert Error Codes

```typescript
it("produces correct error code", () => {
  const result = z.number().safeParse("not a number")
  expect(result.success).toBe(false)
  if (!result.success) {
    expect(result.error.issues[0].code).toBe("invalid_type")
  }
})
```

### Assert Custom Error Messages

```typescript
const Schema = z.string({ error: "Name is required" }).min(1, "Name cannot be empty")

it("shows custom error for missing field", () => {
  const result = Schema.safeParse(undefined)
  expect(result.success).toBe(false)
  if (!result.success) {
    expect(result.error.issues[0].message).toBe("Name is required")
  }
})
```

## Mock Data Generation

### Using zod-schema-faker

```typescript
import { install, fake } from "zod-schema-faker"
import { z } from "zod"

install(z) // call once in test setup

const UserSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  age: z.number().min(0).max(150),
})

it("schema accepts generated data", () => {
  const mockUser = fake(UserSchema)
  expect(UserSchema.safeParse(mockUser).success).toBe(true)
})
```

### Seeding for Deterministic Tests

```typescript
import { seed, fake } from "zod-schema-faker"

beforeEach(() => {
  seed(12345) // deterministic output
})

it("generates consistent mock data", () => {
  const user = fake(UserSchema)
  expect(user.name).toBeDefined()
})
```

## Snapshot Testing with JSON Schema

```typescript
it("schema shape has not changed", () => {
  const jsonSchema = z.toJSONSchema(UserSchema)
  expect(jsonSchema).toMatchSnapshot()
})
```

This catches unintended schema changes in code review. The snapshot shows the JSON Schema representation of your Zod schema.

## Integration Testing

### API Handler Testing

```typescript
it("API rejects invalid request body", async () => {
  const response = await request(app)
    .post("/api/users")
    .send({ name: "", email: "invalid" })
    .expect(400)

  expect(response.body.errors).toBeDefined()
  expect(response.body.errors.fieldErrors.email).toBeDefined()
})
```

### Form Validation Testing

```typescript
it("form shows validation errors", () => {
  const result = FormSchema.safeParse(formData)
  if (!result.success) {
    const errors = z.flattenError(result.error)
    // Pass errors to form library
    expect(errors.fieldErrors).toHaveProperty("email")
  }
})
```

## Property-Based Testing

```typescript
import fc from "fast-check"
import { fake } from "zod-schema-faker"

it("schema always accepts its own generated data", () => {
  fc.assert(
    fc.property(fc.constant(null), () => {
      const data = fake(UserSchema)
      expect(UserSchema.safeParse(data).success).toBe(true)
    }),
    { numRuns: 100 }
  )
})
```

## Rules

1. **Always use `safeParse()`** in tests — `parse()` crashes the test instead of failing it
2. **Test both valid and invalid** — don't only test the happy path
3. **Test boundary values** — min, max, min-1, max+1 for numeric constraints
4. **Test optional/nullable combinations** — undefined, null, missing key
5. **Assert specific error fields** — use `z.flattenError()` to check which field failed
6. **Don't test schema internals** — test parse results, not `.shape` or `._def`
7. **Use `z.toJSONSchema()` snapshots** — catch unintended schema changes
8. **Seed random generators** — non-deterministic tests are flaky tests
9. **Test transforms separately** — verify input validation AND output conversion
10. **Don't duplicate schema logic in assertions** — test behavior, not implementation

## Anti-Patterns

See [references/testing-anti-patterns.md](testing-anti-patterns.md) for BAD/GOOD examples of:

- Testing schema internals instead of behavior
- Not testing error paths
- Using `parse()` in tests (crashes instead of failing)
- Not testing boundary values
- Hardcoding mock data instead of generating
- Snapshot testing raw ZodError instead of formatted output
- Not testing at boundaries (schema tests pass but handler doesn't validate)
- No snapshot regression testing (field removal goes unnoticed)
- Testing schema shape but not error observability (never assert on flattenError)
- No drift detection workflow (schema changes land without mechanical review)

## References

- [API Reference](testing-api.md) — Testing patterns, assertion helpers, mock generation
- [Anti-Patterns](testing-anti-patterns.md) — Common testing mistakes to avoid
