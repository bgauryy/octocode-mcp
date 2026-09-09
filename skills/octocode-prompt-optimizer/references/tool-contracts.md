# MCP, tool, and schema layers

Load when instructions govern MCP server behavior, tool selection, descriptions, input/output schemas, or result shape. Why: the three layers are read at different moments, so a rule placed in the wrong layer is never read when it is needed.

**One behavior, one owner.** The agent reads server instructions before choosing a family, the description while choosing a tool, and the schema while filling the call.

## Layer contract

| Layer | Read when | Owns | Never owns |
|---|---|---|---|
| MCP/server instructions | before the first call | which family applies, cross-tool order and workflow, shared conventions (request envelope, pagination shapes, hint grammar), approval and trust boundaries, what the server cannot do | per-field types; per-tool selection detail |
| Tool name + description | choosing among tools | when to call, when not to, the base knowledge that makes the choice decidable, what it returns, the next useful tool | exact types and limits; global workflow |
| Input/output schema | filling a call, reading a result | exact types, required versus optional, enums, limits, mutually dependent fields, how to use each field, how to continue | which tool to pick; workflow prose |

## Write the server instructions

Give the routing table (intent → tool), the execution order for chained calls, and every convention shared by all tools stated once. State the boundaries the agent cannot infer: what the server refuses, what needs approval, what an empty result does and does not prove. Keep it high level — one line per tool at most.

## Write the tool description

Use a stable namespace plus a precise verb and noun: `repo_search_code`, `issue_get`, `artifact_list`. Reserve `search` for filtered discovery, `get` for a known identifier, `list` for bounded browsing, and mutation verbs for state changes. Avoid overlapping near-synonyms unless evaluations show agents distinguish them.

Order it **Use when → Do not use when → Inputs → Returns → Next.** Include only the knowledge that makes selection decidable — which branch of the tool applies, what the result proves, and the tool that follows. A description that restates types is spending selection tokens on schema content.

## Write the schema

- Name fields unambiguously (`user_id`, not `user`); constrain ranges, enums, string lengths, and incompatible combinations.
- Describe each field with its usage rule, not its type: state when to set it, what happens when it is omitted, and which fields it conflicts with or requires.
- Model mutually exclusive branches as a discriminated operation with a strict field set per branch, so an invalid mix is unrepresentable rather than merely discouraged.
- Return action-relevant fields first; hide diagnostics, raw blobs, and opaque IDs unless the next call needs them.
- Offer `concise` by default and a deliberate `detailed` mode only when both are useful.
- Name the continuation and say how to resume: pass the returned handle unchanged, never infer an offset or invent a cursor. Keep one pagination shape per field name; `references/context-budget.md` owns the budget policy.
- Never claim completeness when a page, truncation, or permission boundary hides results — expose the partial-state field instead.

Generate every field shared by more than one tool from a single definition so its name, type, and description string cannot drift.

## Sources
- Anthropic, [Writing effective tools for AI agents](https://www.anthropic.com/engineering/writing-tools-for-agents) — namespacing, clear schemas, response formats, and token-efficient results.
- Model Context Protocol, [Tools specification](https://modelcontextprotocol.io/specification/2025-11-25/server/tools) — tool metadata, input/output schemas, and paginated discovery.

Next: to sweep the whole tool set for contradictions and descriptor drift load `references/contract-audit.md`; for the rule shape inside each layer load `references/behavior.md`; when a result can grow unbounded load `references/context-budget.md`; for TypeScript/Zod types load `references/zod-agent-contracts.md`; when annotations or result text carry outside instructions load `references/untrusted-content.md`; prove selection accuracy with `references/evaluation-data.md`.
