# Example verdict (calibration)

An illustrative `judge/Q<n>.md` for one question, showing the bar and the shape. Numbers and
answers are fabricated for calibration — copy the **structure and rigor**, not the values.
Reasoning comes first; each score is a one-sentence summary of it. Workflow is not scored
(`null`) and costs are not shown: tool transcripts and costs stay withheld until quality is
locked.

---

**Question (paraphrased):** In `vercel/next.js` on `canary`, name the file that defines the
exported `getRouteRegex()`, the internal helper it calls to parameterize the route, and the
top-level fields it returns.

**Judge model:** `<neutral-model-id>` · **Label mapping (out of band):** X=?, Y=?, Z=?
(randomized) · **Refs frozen:** `canary` @ `<SHA>`, UTC `<ts>`.

## Ground truth (built before reading any answer)

| Fact asked | Value | Evidence |
|---|---|---|
| Defining file | `packages/next/src/shared/lib/router/utils/route-regex.ts` | exact read, `export function getRouteRegex(` |
| Internal helper | `getParametrizedRoute(...)` | same file, called on line N |
| Returned top-level fields | `{ re, groups, routeKeys }` | `return { re: ..., groups, routeKeys }` |

## Per answer

**X** — Names the correct file and `getParametrizedRoute` as the helper, and lists `re`,
`groups`, `routeKeys`. Opened its cited line for `routeKeys` — it supports the claim.
- Correctness **10** — every material part correct, each citation verified.
- Depth **5** — every claim tied to an exact line I re-opened.

**Y** — Correct file and fields, but names the helper as `buildRouteRegex`, which does not
exist at this SHA; the real helper is `getParametrizedRoute`. Its other citations check out.
- Correctness **4** — a material part (the helper) is wrong/unsupported.
- Depth **3** — grounded except the fabricated helper name.

**Z** — Correct file and helper, but omits `routeKeys` from the returned fields and says
"returns `re` and `groups`." Missing a material part, not wrong on it.
- Correctness **7** — core correct, one required field missing.
- Depth **4** — solid on what it covered.

## Ranking (correctness first)

1. **X** — only answer correct and fully verified on all three parts.
2. **Z** — correct as far as it goes; missed `routeKeys` (a required field) but asserts
   nothing false.
3. **Y** — a fabricated helper name is a confidently-wrong material part; it cannot outrank
   an answer that is right on everything it claims.

No decisive-win confirmation needed here (X is unambiguous). Had X and Z been within one
correctness point, I would swap the order, re-judge, and report a tie if they stayed close;
the controller compares costs only after quality is locked.
