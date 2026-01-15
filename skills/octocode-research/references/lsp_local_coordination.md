# Using LSP and Local Tools Together

> **Key Insight**: Search finds locations, LSP understands relationships.

---

## Why This Matters

**Local search** (`/local/search`) finds text patterns - it tells you "this pattern appears at these locations."

**LSP tools** (`/lsp/*`) understand code semantically - they tell you "this symbol is defined here, used there, and calls these functions."

They work best together: search to find where things are, LSP to understand how they connect.

---

## The lineHint Pattern

LSP tools work better when you give them a `lineHint` - a line number where the symbol appears:

```bash
# Step 1: Search finds the location
curl "http://localhost:1987/local/search?pattern=authenticate"
# Response: line 15 in auth.ts

# Step 2: LSP uses that line to resolve the symbol accurately
curl "http://localhost:1987/lsp/calls?symbolName=authenticate&lineHint=15&uri=auth.ts"
```

**Why?** LSP resolves symbols by position. If you say "find references to `auth`" it needs to know *which* `auth` - the function? The variable? The module? The line hint tells it exactly where to look.

---

## Tool Roles

| Tool | What It Does | Good For |
|------|--------------|----------|
| `/local/search` | Finds text patterns in files | Locating where things appear |
| `/local/structure` | Shows directory layout | Orienting in a codebase |
| `/local/content` | Reads file content | Understanding implementation |
| `/lsp/definition` | Jumps to where symbol is defined | Finding source of truth |
| `/lsp/references` | Finds all usages of a symbol | Impact analysis, usage patterns |
| `/lsp/calls` | Traces call relationships | Understanding flow and behavior |

---

## Typical Workflows

### Finding and Understanding a Function

```
Think: "I need to find it first, then understand it"

1. /local/search for the function name → get lineHint
2. /lsp/definition → see where it's actually defined
3. /lsp/calls (incoming) → see who calls it
4. /lsp/calls (outgoing) → see what it calls
5. /local/content → read the actual implementation
```

### Understanding All Usages

```
Think: "I need comprehensive coverage"

1. /local/search → find where symbol appears
2. /lsp/references → get all semantic usages (more accurate)
3. Compare results - text search may find more, LSP is more precise
```

### Tracing a Flow

```
Think: "I need to follow the execution path"

1. /local/search → find the starting point
2. /lsp/calls (outgoing) → what does it call?
3. /lsp/calls on each result → continue the trace
4. Build up a picture of the flow
```

---

## When LSP Adds Value

**LSP is valuable when:**
- You need to understand relationships (who calls what)
- You want precise symbol resolution (avoid false positives)
- You're doing impact analysis (what breaks if I change X)

**Text search is valuable when:**
- You're looking for patterns (comments, strings, partial names)
- LSP isn't available or times out
- You want quick, broad coverage

**Use both** for the best results - they complement each other.

---

## Functions vs Types

**For functions/methods**: Both `/lsp/references` and `/lsp/calls` work
- `calls`: Shows the call graph (who calls, what it calls)
- `references`: Shows all usages (including type annotations)

**For types/interfaces/variables**: Use `/lsp/references` only
- `calls` won't work (types aren't called)
- `references` shows where the type is used

---

## Parallel Execution

Once you have lineHint, you can make multiple LSP calls in parallel:

```bash
# These don't depend on each other
curl ".../lsp/calls?direction=incoming&lineHint=15" &
curl ".../lsp/calls?direction=outgoing&lineHint=15" &
wait
```

But: You need the search result (with lineHint) before making any LSP calls.

---

## When Things Don't Work

**LSP returns nothing?**
- Check if the symbol actually exists at that line
- The symbol might be external (from node_modules, etc.)
- Try text search as a fallback

**LSP times out?**
- The codebase might be large or cold
- Try a more specific search first
- Use text search as fallback

**Wrong symbol resolved?**
- Multiple symbols with same name? Use more specific lineHint
- Try searching for a more unique pattern

---

## Examples

### "Where is UserService defined?"

```
Thinking: This is a location question. Let me find it.

→ /local/search pattern=UserService
Found at services/user.ts:12

→ /lsp/definition at line 12
Confirmed: defined at services/user.ts:12-45 (class definition)

Answer: "UserService is defined at services/user.ts:12"
```

### "What happens when login is called?"

```
Thinking: This is a flow question. I need to trace the execution.

→ /local/search pattern=login
Found at routes/auth.ts:25

→ /lsp/calls direction=outgoing at line 25
Calls: validateCredentials, createSession, sendResponse

→ For each called function, continue tracing...
→ Build up the full flow

Answer: "When login is called, it validates credentials (auth.ts:30),
creates a session (session.ts:15), and sends the response (auth.ts:42)"
```

### "What will break if I change validateInput?"

```
Thinking: This is an impact question. I need all usages.

→ /local/search pattern=validateInput
Found at validators/input.ts:8

→ /lsp/references at line 8
Found 12 usages across 5 files

→ /lsp/calls direction=incoming
Found 8 direct callers

Answer: "validateInput is used in 12 places. The 8 direct callers are:
[list with file:line for each]"
```

---

## The Key Principle

**Search gives you coordinates. LSP gives you connections.**

Use search to find where things are. Use LSP to understand how they relate. Read files only when you need implementation details.
