# Error Handling Reference

## ZodError

```typescript
const result = schema.safeParse(data)
if (!result.success) {
  result.error           // ZodError instance
  result.error.issues    // array of ZodIssue
  result.error.message   // JSON string of issues
  result.error.toString() // same as .message
}
```

## Issue Structure

```typescript
interface ZodIssue {
  code: string        // issue type code
  message: string     // human-readable message
  path: (string | number)[]  // path to the field
  input?: unknown     // raw input (only if reportInput: true)
  // ... additional fields depending on code
}
```

## Issue Codes

| Code | When | Extra Fields |
|------|------|-------------|
| `invalid_type` | Wrong type | `expected`, `received` |
| `too_small` | Below minimum | `minimum`, `inclusive`, `type` |
| `too_big` | Above maximum | `maximum`, `inclusive`, `type` |
| `invalid_string` | String format failure | `validation` |
| `custom` | Custom refinement | — |
| `invalid_enum_value` | Not in enum | `options`, `received` |
| `unrecognized_keys` | Unknown keys (strict) | `keys` |
| `invalid_union` | No branch matched | `unionErrors` |
| `invalid_arguments` | Function args invalid | `argumentsError` |
| `invalid_return_type` | Function return invalid | `returnTypeError` |

## Error Formatting Functions

### z.flattenError(error)

Flat structure for simple forms.

```typescript
const flat = z.flattenError(result.error)
// {
//   formErrors: ["Root-level error"],
//   fieldErrors: {
//     email: ["Invalid email"],
//     age: ["Must be positive", "Must be integer"],
//   }
// }
```

### z.treeifyError(error)

Nested tree matching schema shape. For deeply nested forms.

```typescript
const tree = z.treeifyError(result.error)
// {
//   errors: [],
//   properties: {
//     address: {
//       errors: [],
//       properties: {
//         zip: { errors: ["Required"] }
//       }
//     }
//   }
// }
```

### z.prettifyError(error)

Human-readable string for logging/debugging.

```typescript
const pretty = z.prettifyError(result.error)
// "✖ Invalid email at «email»
//  ✖ Required at «address.zip»"
```

### z.formatError() — Deprecated

Do not use. Removed in v4. Use `flattenError` or `treeifyError` instead.

## Error Customization

### Schema Level

```typescript
// String shorthand
z.string({ error: "Must be a string" })
z.number().min(18, { error: "Must be 18+" })
z.number().min(18, "Must be 18+") // shorthand

// Function form — dynamic messages
z.string({
  error: (issue) => {
    if (issue.input === undefined) return "Required"
    return "Must be a string"
  },
})
```

### Parse Level

```typescript
schema.safeParse(data, {
  error: (issue) => {
    // Override error for this parse call only
    return `Validation failed: ${issue.code}`
  },
})
```

### Global Level

```typescript
z.config({
  customError: (issue) => {
    // Global default error messages
    if (issue.code === "invalid_type") {
      return `Expected ${issue.expected}, got ${issue.received}`
    }
  },
})
```

## Error Precedence

1. **Schema-level** `error` — highest priority
2. **Parse-level** `error` — middle priority
3. **Global** `z.config({ customError })` — lowest priority

If a schema has an `error` parameter, it always wins over parse-level and global settings.

## reportInput Option

Includes raw input values in error issues. **Never use in production.**

```typescript
// Development only
const result = schema.safeParse(data, { reportInput: true })
if (!result.success) {
  result.error.issues[0].input // contains the raw value
}
```

Leaks passwords, tokens, PII into logs and error monitoring.

## i18n / Localization

Use the error function form for localized messages.

```typescript
const t = getTranslation(locale)

const NameSchema = z.string({
  error: (issue) => {
    if (issue.input === undefined) return t("field.required")
    return t("field.invalid_string")
  },
}).min(1, { error: t("field.too_short") })
```

Or use global config for app-wide localization:

```typescript
z.config({
  customError: (issue) => {
    const t = getTranslation(currentLocale)
    switch (issue.code) {
      case "invalid_type": return t("validation.invalid_type")
      case "too_small": return t("validation.too_small", { min: issue.minimum })
      default: return t("validation.invalid")
    }
  },
})
```
