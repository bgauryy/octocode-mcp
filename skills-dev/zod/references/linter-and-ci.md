# Linting and CI Rules for Zod

## Overview

Mechanical enforcement catches mistakes before code review. Use ESLint rules, CI checks, and static analysis tools to enforce Zod best practices automatically.

## ESLint: `no-restricted-syntax` Rules

### Ban `parse()` in Application Code

Force `safeParse()` usage. `parse()` throws, which leads to unhandled exceptions.

```jsonc
// .eslintrc.json
{
  "rules": {
    "no-restricted-syntax": [
      "error",
      {
        "selector": "CallExpression[callee.property.name='parse'][callee.object.type!='ThisExpression']",
        "message": "Use safeParse() instead of parse(). parse() throws on invalid input. See: rules/parse-use-safeParse.md"
      }
    ]
  }
}
```

To allow `parse()` in specific files (e.g., env config where crashing on invalid env is intentional), use ESLint overrides:

```jsonc
{
  "overrides": [
    {
      "files": ["**/config/env.ts", "**/env.ts"],
      "rules": {
        "no-restricted-syntax": "off"
      }
    }
  ]
}
```

### Detect `reportInput` Usage

`reportInput: true` leaks sensitive data in production.

```jsonc
{
  "rules": {
    "no-restricted-syntax": [
      "error",
      {
        "selector": "Property[key.name='reportInput'][value.value=true]",
        "message": "reportInput: true leaks sensitive data in production. Use: reportInput: process.env.NODE_ENV === 'development'. See: rules/error-input-security.md"
      }
    ]
  }
}
```

### Ban `z.nativeEnum()` (deprecated in v4)

```jsonc
{
  "selector": "CallExpression[callee.property.name='nativeEnum']",
  "message": "z.nativeEnum() is deprecated in Zod v4. Use z.enum(YourTSEnum) instead. See: rules/migrate-native-enum.md"
}
```

### Ban `z.string().email()` (Use `z.email()`)

```jsonc
{
  "selector": "CallExpression[callee.property.name='email'][callee.object.callee.property.name='string']",
  "message": "Use z.email() instead of z.string().email() in Zod v4. See: rules/migrate-string-formats.md"
}
```

### Full ESLint Config Example

```jsonc
{
  "rules": {
    "no-restricted-syntax": [
      "error",
      {
        "selector": "CallExpression[callee.property.name='parse'][callee.object.type!='ThisExpression']",
        "message": "Use safeParse() instead of parse(). See: rules/parse-use-safeParse.md"
      },
      {
        "selector": "Property[key.name='reportInput'][value.value=true]",
        "message": "reportInput: true leaks sensitive data. See: rules/error-input-security.md"
      },
      {
        "selector": "CallExpression[callee.property.name='nativeEnum']",
        "message": "z.nativeEnum() deprecated in v4. Use z.enum(). See: rules/migrate-native-enum.md"
      }
    ]
  },
  "overrides": [
    {
      "files": ["**/config/env.ts", "**/env.ts"],
      "rules": {
        "no-restricted-syntax": "off"
      }
    }
  ]
}
```

## CI: Schema Snapshot Regression

Detect unintended schema changes by committing JSON Schema snapshots and failing CI when they drift.

### Setup

```typescript
// scripts/export-schemas.ts
import { z } from "zod"
import { writeFileSync, mkdirSync } from "fs"
import { UserSchema, OrderSchema } from "../src/api/schemas"

const schemas = {
  User: UserSchema,
  Order: OrderSchema,
}

mkdirSync("snapshots", { recursive: true })

for (const [name, schema] of Object.entries(schemas)) {
  const jsonSchema = z.toJSONSchema(schema)
  writeFileSync(
    `snapshots/${name}.json`,
    JSON.stringify(jsonSchema, null, 2) + "\n"
  )
}
```

### CI Check

```yaml
# .github/workflows/schema-check.yml
name: Schema Snapshot Check
on: [pull_request]

jobs:
  schema-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm ci
      - run: npx tsx scripts/export-schemas.ts
      - name: Check for schema drift
        run: |
          if git diff --exit-code snapshots/; then
            echo "Schemas unchanged"
          else
            echo "::error::Schema snapshots have changed. Review the diff and update snapshots if intentional."
            git diff snapshots/
            exit 1
          fi
```

### Workflow

1. Developer changes a schema
2. CI runs `export-schemas.ts` and diffs against committed snapshots
3. If diff exists, CI fails with the exact changes shown
4. Developer reviews the diff, runs `npx tsx scripts/export-schemas.ts` locally, commits updated snapshots

## Unused Schema Detection

Find schemas that are defined but never imported.

### With knip

```bash
npx knip --include exports
```

knip detects unused exports including schemas. Configure in `knip.json`:

```jsonc
{
  "entry": ["src/index.ts"],
  "project": ["src/**/*.ts"],
  "ignore": ["**/*.test.ts", "**/*.spec.ts"]
}
```

### With ts-prune

```bash
npx ts-prune | grep -i schema
```

Shows exported symbols with no imports. Review and remove dead schemas.

## Circular Dependency Detection

Schemas that import each other create circular dependencies that cause runtime crashes.

### With madge

```bash
# Find circular dependencies
npx madge --circular --extensions ts src/

# Generate dependency graph
npx madge --image graph.svg --extensions ts src/
```

### CI Integration

```yaml
- name: Check circular dependencies
  run: |
    npx madge --circular --extensions ts src/
    if [ $? -ne 0 ]; then
      echo "::error::Circular dependencies detected"
      exit 1
    fi
```

## Custom ESLint Rule Messages

Include remediation instructions in ESLint messages so developers know exactly what to do:

```jsonc
{
  "selector": "CallExpression[callee.property.name='parse']",
  "message": "Use safeParse() instead of parse().\n\nparse() throws ZodError on invalid input.\nsafeParse() returns { success, data | error }.\n\nReplace:\n  schema.parse(data)\nWith:\n  const result = schema.safeParse(data)\n  if (!result.success) { /* handle error */ }\n\nSee: rules/parse-use-safeParse.md"
}
```

## Summary

| Tool | What It Catches | When |
|------|----------------|------|
| ESLint `no-restricted-syntax` | Banned API usage (parse, reportInput, nativeEnum) | On save / pre-commit |
| Schema snapshot CI | Unintended schema changes | On pull request |
| knip / ts-prune | Unused schemas | On pull request / periodic |
| madge | Circular schema dependencies | On pull request |
