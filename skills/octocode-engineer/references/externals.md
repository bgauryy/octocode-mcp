# External Tools

**Ask user before running.** Use `npx` — no install needed.

## Scanner Already Covers

| Domain | Categories | Flags |
|--------|-----------|-------|
| Duplicates | `duplicate-function-body`, `similar-function-body`, `duplicate-flow-structure` | `--similarity-threshold 0.8` |
| Unused deps | `unused-npm-dependency` | `--features=dead-code` |
| Dead exports | `dead-export`, `dead-re-export`, `semantic-dead-export` | `--features=dead-code --semantic` |

## eslint

```bash
npx eslint --fix <target>
npx eslint --format json <target>
npx eslint --rule '{"complexity": ["error", 10]}' <target>
```

## tsc

```bash
npx tsc --noEmit
npx tsc --noEmit --strict
npx tsc --noEmit -p tsconfig.json --pretty --noErrorTruncation
```

## stylelint — CSS/SCSS/Less

Use when project has CSS files. Scanner only handles JS/TS.

```bash
npx stylelint "**/*.css"
npx stylelint "**/*.scss"
npx stylelint --fix "**/*.css"
npx stylelint --formatter json "**/*.css"
```

## knip — Framework-aware dead code

100+ plugins (Next.js, Remix, Angular) detect framework-specific usage scanner can't see.

```bash
npx knip
npx knip --exports
npx knip --dependencies
npx knip --files
npx knip --workspace packages/my-pkg
npx knip --fix
npx knip --reporter json
```

## type-coverage — Type safety %

Project-wide typed-vs-any ratio. Scanner counts per-file `any`; this gives one number.

```bash
npx type-coverage
npx type-coverage --strict --at-least 90
npx type-coverage --detail
```

## dependency-cruiser — Custom arch rules

Declarative rule DSL (`forbidden`/`allowed`/`required`). Scanner has 28 built-in detectors; this adds project-specific constraints.

```bash
npx depcruise --no-config --output-type err src/
npx depcruise --no-config --output-type metrics src/
npx depcruise --no-config --output-type mermaid src/ > deps.md
npx depcruise --no-config --output-type mermaid --focus "^src/session" src/
npx depcruise --no-config --output-type err --affected HEAD src/
```

## Quick Reference

| Finding | Tool | Command |
|---------|------|---------|
| `dependency-cycle` | dep-cruiser | `npx depcruise --no-config -T err <path>` |
| `dead-export` | knip | `npx knip --exports` |
| `unsafe-any` | type-coverage | `npx type-coverage --strict --detail` |
| `layer-violation` | dep-cruiser | `npx depcruise --no-config -T err <path>` |
| Lint issues | eslint | `npx eslint <path>` |
| Type errors | tsc | `npx tsc --noEmit` |
| CSS issues | stylelint | `npx stylelint "**/*.css"` |
