# Zod Testing API Reference

## Schema Correctness Testing

### safeParse() for Tests

Always use `safeParse()` in tests. `parse()` throws, which crashes the test instead of producing a clear failure.

```typescript
// GOOD: assertion-based
const result = schema.safeParse(data)
expect(result.success).toBe(true)
// or
expect(result.success).toBe(false)

// BAD: crash-based — if schema changes, test behavior is unpredictable
expect(() => schema.parse(data)).toThrow()
```

### Testing Valid Data

```typescript
describe("UserSchema", () => {
  const validUsers = [
    { name: "Alice", email: "alice@example.com", age: 30 },
    { name: "B", email: "b@c.co", age: 0 },
    { name: "Zed", email: "zed+tag@domain.org", age: 150 },
  ]

  it.each(validUsers)("accepts valid user: $name", (user) => {
    const result = UserSchema.safeParse(user)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual(user)
    }
  })
})
```

### Testing Invalid Data

```typescript
const invalidInputs = [
  { input: {}, desc: "empty object" },
  { input: { name: "" }, desc: "empty name" },
  { input: { name: "A", email: "bad" }, desc: "invalid email" },
  { input: { name: "A", email: "a@b.com", age: -1 }, desc: "negative age" },
  { input: { name: "A", email: "a@b.com", age: 151 }, desc: "age over max" },
]

it.each(invalidInputs)("rejects $desc", ({ input }) => {
  expect(UserSchema.safeParse(input).success).toBe(false)
})
```

### Boundary Value Testing

```typescript
const NumberSchema = z.number().min(0).max(100)

const boundaries = [
  { value: 0, expected: true, desc: "minimum" },
  { value: 100, expected: true, desc: "maximum" },
  { value: -1, expected: false, desc: "below minimum" },
  { value: 101, expected: false, desc: "above maximum" },
  { value: -0.001, expected: false, desc: "fractionally below min" },
  { value: 100.001, expected: false, desc: "fractionally above max" },
]

it.each(boundaries)("$desc ($value) → $expected", ({ value, expected }) => {
  expect(NumberSchema.safeParse(value).success).toBe(expected)
})
```

### Optional and Nullable Testing

```typescript
const Schema = z.object({
  required: z.string(),
  optional: z.string().optional(),
  nullable: z.string().nullable(),
  both: z.string().optional().nullable(),
})

it("accepts all optional/nullable combinations", () => {
  expect(Schema.safeParse({ required: "a" }).success).toBe(true)
  expect(Schema.safeParse({ required: "a", optional: undefined }).success).toBe(true)
  expect(Schema.safeParse({ required: "a", nullable: null }).success).toBe(true)
  expect(Schema.safeParse({ required: "a", both: null }).success).toBe(true)
  expect(Schema.safeParse({ required: "a", both: undefined }).success).toBe(true)
})

it("rejects null for non-nullable", () => {
  expect(Schema.safeParse({ required: "a", optional: null }).success).toBe(false)
})

it("rejects undefined for non-optional", () => {
  expect(Schema.safeParse({ required: undefined }).success).toBe(false)
})
```

## Error Assertion Patterns

### Using z.flattenError()

```typescript
it("reports field-level errors", () => {
  const result = UserSchema.safeParse({ name: "", email: "bad", age: -1 })
  expect(result.success).toBe(false)
  if (!result.success) {
    const flat = z.flattenError(result.error)
    expect(flat.fieldErrors).toHaveProperty("email")
    expect(flat.fieldErrors).toHaveProperty("age")
  }
})
```

### Asserting Error Messages

```typescript
it("shows custom error message", () => {
  const Schema = z.string({ error: "Name is required" })
  const result = Schema.safeParse(undefined)
  expect(result.success).toBe(false)
  if (!result.success) {
    expect(result.error.issues[0].message).toBe("Name is required")
  }
})
```

### Asserting Error Codes

```typescript
it("produces invalid_type for wrong type", () => {
  const result = z.number().safeParse("string")
  expect(result.success).toBe(false)
  if (!result.success) {
    expect(result.error.issues[0].code).toBe("invalid_type")
  }
})

it("produces too_small for under minimum", () => {
  const result = z.number().min(5).safeParse(3)
  expect(result.success).toBe(false)
  if (!result.success) {
    expect(result.error.issues[0].code).toBe("too_small")
  }
})
```

### Asserting Error Paths

```typescript
it("targets the correct field", () => {
  const result = FormSchema.safeParse({
    password: "12345678",
    confirm: "different",
  })
  expect(result.success).toBe(false)
  if (!result.success) {
    const confirmError = result.error.issues.find(
      (i) => i.path.join(".") === "confirm"
    )
    expect(confirmError).toBeDefined()
    expect(confirmError!.message).toBe("Passwords don't match")
  }
})
```

### Counting Errors

```typescript
it("reports all validation errors at once", () => {
  const result = UserSchema.safeParse({})
  expect(result.success).toBe(false)
  if (!result.success) {
    // Zod reports all issues, not just the first
    expect(result.error.issues.length).toBeGreaterThanOrEqual(3)
  }
})
```

## Mock Data Generation

### Using zod-schema-faker

```bash
npm install -D zod-schema-faker
```

```typescript
import { install, fake, seed } from "zod-schema-faker"
import { z } from "zod"

// Call once in test setup (beforeAll or setupFiles)
install(z)

const UserSchema = z.object({
  name: z.string().min(1).max(50),
  email: z.email(),
  age: z.number().int().min(0).max(150),
  role: z.enum(["admin", "user", "guest"]),
})

describe("with generated data", () => {
  beforeEach(() => seed(42)) // deterministic

  it("schema accepts its own generated data", () => {
    const user = fake(UserSchema)
    expect(UserSchema.safeParse(user).success).toBe(true)
  })

  it("generates array of valid items", () => {
    const users = Array.from({ length: 10 }, () => fake(UserSchema))
    users.forEach((u) => {
      expect(UserSchema.safeParse(u).success).toBe(true)
    })
  })
})
```

### Using @anatine/zod-mock

```bash
npm install -D @anatine/zod-mock @faker-js/faker
```

```typescript
import { generateMock } from "@anatine/zod-mock"

it("generates valid mock", () => {
  const mock = generateMock(UserSchema)
  expect(UserSchema.safeParse(mock).success).toBe(true)
})

// With seed for deterministic output
it("generates consistent mock", () => {
  const mock = generateMock(UserSchema, { seed: 123 })
  expect(mock.name).toBeDefined()
})
```

## Snapshot Testing

### JSON Schema Snapshots

```typescript
import { z } from "zod"

it("schema shape matches snapshot", () => {
  const jsonSchema = z.toJSONSchema(UserSchema)
  expect(jsonSchema).toMatchSnapshot()
})
```

Update snapshots when schema changes are intentional:
```bash
vitest --update  # or jest --updateSnapshot
```

### Formatted Error Snapshots

```typescript
it("error output matches snapshot", () => {
  const result = UserSchema.safeParse({ name: 123, email: "bad" })
  expect(result.success).toBe(false)
  if (!result.success) {
    const flat = z.flattenError(result.error)
    expect(flat).toMatchSnapshot()
  }
})
```

## Integration Testing

### Express/Fastify API Handler

```typescript
import request from "supertest"

it("validates request body", async () => {
  const res = await request(app)
    .post("/api/users")
    .send({ name: "", email: "invalid" })
    .expect(400)

  expect(res.body.errors.fieldErrors).toHaveProperty("email")
})

it("accepts valid request", async () => {
  const res = await request(app)
    .post("/api/users")
    .send({ name: "Alice", email: "alice@example.com", age: 30 })
    .expect(201)

  expect(res.body.id).toBeDefined()
})
```

### Form Validation

```typescript
it("produces form-compatible errors", () => {
  const result = FormSchema.safeParse(formData)
  if (!result.success) {
    const errors = z.flattenError(result.error)
    // Structure matches what form libraries expect
    expect(errors).toEqual({
      formErrors: expect.any(Array),
      fieldErrors: expect.objectContaining({
        email: expect.any(Array),
      }),
    })
  }
})
```

### Database Layer

```typescript
it("validates before insert", async () => {
  const invalidUser = { name: "", email: "bad" }
  const result = UserSchema.safeParse(invalidUser)
  expect(result.success).toBe(false)
  // Verify no database call was made
  expect(db.insert).not.toHaveBeenCalled()
})
```

## Property-Based Testing

### With fast-check

```bash
npm install -D fast-check
```

```typescript
import fc from "fast-check"
import { fake, seed } from "zod-schema-faker"

it("schema always accepts its own generated data", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 10000 }), (s) => {
      seed(s)
      const data = fake(UserSchema)
      return UserSchema.safeParse(data).success
    }),
    { numRuns: 200 }
  )
})
```

### Transform Round-Trip Testing

```typescript
it("transform preserves data integrity", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 10000 }), (s) => {
      seed(s)
      const input = fake(InputSchema)
      const result = InputSchema.safeParse(input)
      if (result.success) {
        // Verify output type matches expected shape
        expect(OutputSchema.safeParse(result.data).success).toBe(true)
      }
      return true
    }),
  )
})
```

## Async Schema Testing

```typescript
it("validates async refinements", async () => {
  const UniqueEmail = z.email().refine(
    async (email) => !(await db.exists(email)),
    { error: "Already registered" }
  )

  // Must use safeParseAsync
  const result = await UniqueEmail.safeParseAsync("taken@example.com")
  expect(result.success).toBe(false)
})
```

## Test Helpers

### reusable assertion helper

```typescript
function expectValid<T>(schema: z.ZodType<T>, data: unknown) {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new Error(
      `Expected valid but got errors:\n${z.prettifyError(result.error)}`
    )
  }
  return result.data
}

function expectInvalid(schema: z.ZodType, data: unknown) {
  const result = schema.safeParse(data)
  expect(result.success).toBe(false)
  if (!result.success) return result.error
  throw new Error("Expected invalid but data was accepted")
}

// Usage
it("accepts valid user", () => {
  const user = expectValid(UserSchema, validData)
  expect(user.name).toBe("Alice")
})

it("rejects invalid email", () => {
  const error = expectInvalid(UserSchema, { ...validData, email: "bad" })
  expect(error.issues[0].path).toEqual(["email"])
})
```

## Structural Testing

### Schema Dependency Direction

Assert that schemas are imported from boundary layers, not from domain code. This enforces the architectural rule that parsing happens at boundaries.

```typescript
import { execSync } from "child_process"

describe("schema architecture", () => {
  it("domain layer does not import raw schemas", () => {
    // grep for Zod schema imports in domain code
    const result = execSync(
      'grep -r "from.*schemas" src/domain/ || true',
      { encoding: "utf-8" }
    )
    // Domain should only import types (z.infer), not raw schemas
    const rawImports = result
      .split("\n")
      .filter((line) => line && !line.includes("type {") && !line.includes("type{"))
    expect(rawImports).toHaveLength(0)
  })
})
```

### Circular Import Detection

Use madge to detect circular dependencies between schema files:

```typescript
import madge from "madge"

describe("schema dependencies", () => {
  it("has no circular dependencies", async () => {
    const result = await madge("src/", {
      fileExtensions: ["ts"],
      tsConfigPath: "tsconfig.json",
    })
    const circular = result.circular()
    expect(circular).toHaveLength(0)
  })
})
```

## Drift Detection

### JSON Schema Snapshot Workflow

Export schemas as JSON Schema and commit snapshots. CI fails when schemas change without updating snapshots.

```typescript
// scripts/export-schemas.ts
import { z } from "zod"
import { writeFileSync, mkdirSync } from "fs"
import { UserSchema, OrderSchema } from "../src/api/schemas"

const schemas = { User: UserSchema, Order: OrderSchema }

mkdirSync("snapshots", { recursive: true })
for (const [name, schema] of Object.entries(schemas)) {
  writeFileSync(
    `snapshots/${name}.json`,
    JSON.stringify(z.toJSONSchema(schema), null, 2) + "\n"
  )
}
```

### Snapshot Test

```typescript
import { readFileSync } from "fs"

describe("schema drift detection", () => {
  it("UserSchema matches committed snapshot", () => {
    const current = z.toJSONSchema(UserSchema)
    const committed = JSON.parse(
      readFileSync("snapshots/User.json", "utf-8")
    )
    expect(current).toEqual(committed)
  })
})
```

### CI Integration

```yaml
# .github/workflows/schema-check.yml
- run: npx tsx scripts/export-schemas.ts
- name: Check for schema drift
  run: |
    if git diff --exit-code snapshots/; then
      echo "Schemas unchanged"
    else
      echo "::error::Schema snapshots changed. Update snapshots if intentional."
      git diff snapshots/
      exit 1
    fi
```

## Observable Error Testing

### Assert flattenError Structure

Test that validation errors produce the expected structured output for logging and monitoring.

```typescript
describe("error observability", () => {
  it("flattenError has expected field keys", () => {
    const result = UserSchema.safeParse({ name: "", email: "bad" })
    expect(result.success).toBe(false)
    if (!result.success) {
      const flat = z.flattenError(result.error)
      // Verify structure matches what logging expects
      expect(flat).toHaveProperty("formErrors")
      expect(flat).toHaveProperty("fieldErrors")
      expect(flat.fieldErrors).toHaveProperty("email")
    }
  })

  it("error messages are user-facing quality", () => {
    const Schema = z.object({
      email: z.email({ error: "Please enter a valid email" }),
      age: z.number({ error: "Age must be a number" }).min(0, "Age cannot be negative"),
    })

    const result = Schema.safeParse({ email: "bad", age: -1 })
    expect(result.success).toBe(false)
    if (!result.success) {
      const flat = z.flattenError(result.error)
      expect(flat.fieldErrors.email![0]).toBe("Please enter a valid email")
      expect(flat.fieldErrors.age![0]).toBe("Age cannot be negative")
    }
  })
})
```

## Performance Testing

### Benchmark Parse Time

```typescript
describe("schema performance", () => {
  it("UserSchema parses within acceptable time", () => {
    const validUser = { name: "Alice", email: "alice@example.com", age: 30 }

    const start = performance.now()
    for (let i = 0; i < 10_000; i++) {
      UserSchema.safeParse(validUser)
    }
    const elapsed = performance.now() - start

    // 10k parses should complete in under 100ms
    expect(elapsed).toBeLessThan(100)
  })
})
```

### With Vitest Bench

```typescript
import { bench, describe } from "vitest"

describe("schema benchmarks", () => {
  const validUser = { name: "Alice", email: "alice@example.com", age: 30 }

  bench("UserSchema.safeParse", () => {
    UserSchema.safeParse(validUser)
  })

  bench("UserSchema.safeParse (invalid)", () => {
    UserSchema.safeParse({ name: 123 })
  })
})
```

Run with:
```bash
vitest bench
```
