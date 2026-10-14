# Maintaining octocode-scraping

For changing the `skills/octocode-scraping` scripts, their tests, or adding a scraping vendor. Agent-facing usage lives in the skill's `SKILL.md` and `references/`; script inputs are in each script's `--help`.

## Layout

- Entry scripts in `scripts/`; shared modules in `scripts/lib/`.
- `scripts/schemas/graph.schema.json` is copied into every session (`lib/corpus.mjs`) for downstream tools. No JSON-schema validator runs in the skill or its tests; schemas and the contract below are documentation, enforced only by tests.
- Errors go through `lib/fail.mjs` in the stdout shape of `references/corpus.md#stdout-contract`. Exception: `corpus-inspect`, `dom-find`, `graph-navigate`, and `resource-list` print usage on stderr.

## Vendor contract

Vendor code returns one `FetchResponse`; corpus, extraction, and graph (`lib/corpus.mjs`, `analyzers.mjs`, `extractors.mjs`) consume only that and stay provider-independent.

```js
// FetchResponse — all fields required
{ pageId, url, status, contentType, body, fetchError, creditCost, fetchedAt }

// ProviderDescriptor — entry in PROVIDERS (scripts/lib/providers.mjs)
{ name, fetch, supportsModes, requiresApiKey, apiKeyEnv, cleanup? }
```

- `fetch`: `async ({ url, pageId, config, apiKey }) => FetchResponse`; echo `pageId` and `url`.
- `status`: integer. `contentType`: string. `body`: raw response text (a vendor JSON envelope as a string, or raw HTML/markdown). `fetchError`: `null` or message. `creditCost`: vendor per-request cost (string or number), or `null` when the vendor has no cost (keyless direct). `fetchedAt`: ISO-8601.
- `supportsModes`: at least one, only implemented modes from `html`, `markdown`, `extended`, `extract` (`direct` is HTML only); `scripts/lib/args.mjs` rejects undeclared provider/mode combinations.
- `requiresApiKey`: boolean. `apiKeyEnv`: env var name for the key, `null` when no key is needed.
- `cleanup` (optional): `async (config) => void`, called once after the fetch/crawl loop, for providers holding a persistent resource such as a launched browser (`cdp`).

## Adding a vendor

1. Add `fetchX` to `scripts/lib/client.mjs`; honor `config.mockStatus`, `mockBodyFile`, `mockContentType` (`--mock-status`, `--mock-body-file`, `--mock-content-type`) so tests need no network or key.
2. Register it in `PROVIDERS`, e.g. `firecrawl: { name: 'firecrawl', fetch: fetchFirecrawl, supportsModes: ['html', 'markdown'], requiresApiKey: true, apiKeyEnv: 'FIRECRAWL_API_KEY' }`.
3. Add tests for the descriptor, unknown-provider handling, and provider/mode rejection.
4. A mock fetch must produce the same `AGENT_INDEX.json`, graph, workflow, and extraction shapes as existing providers.

## Tests

- One file: `node --test skills/octocode-scraping/scripts/tests/<file>.test.mjs`. All: `node --test 'skills/octocode-scraping/scripts/tests/*.test.mjs'` (a bare directory fails). CI runs them through `dev.mjs` `skills:check`.
- Browser integration changes also need a live browser check.
- Keep covered: compact stdout with no raw payload; agent index; graph v2 with source evidence on nodes and edges; target-error warnings; secret rejection without a stack trace; cost capture; failure reports; resource rows without `workflowType`; bridge `thinHints`, value-level redaction, rerun replacement, and API-field proof by local regex without live Chrome.
- Finish with `node skills/octocode-skills/scripts/skill-review.mjs skills/octocode-scraping`.
