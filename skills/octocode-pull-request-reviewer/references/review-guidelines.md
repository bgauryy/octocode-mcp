# Review Guidelines

<confidence>

| Level | Certainty | Action |
|-------|-----------|--------|
| **HIGH** | Verified issue exists | MUST include |
| **MED** | Likely issue, missing context | MUST include with caveat |
| **LOW** | Uncertain | Investigate more OR skip |

**Note**: Confidence is NOT Severity. HIGH confidence typo = Low Priority. LOW confidence security flaw = flag but mark uncertain.
</confidence>

<review_mindset>
**Core Principle: Focus on CHANGED Code Only**
- **Added code**: Lines with '+' prefix
- **Modified code**: New implementation ('+') while considering removed context
- **Deleted code**: Only comment if removal creates new risks

**MUST include when**: HIGH/MED confidence + NEW code ('+' prefix) + real problem + actionable fix
**FORBIDDEN to suggest when**: LOW confidence, unchanged code, style-only, caught by linters/compilers, already commented by others
</review_mindset>

<structural_code_vision>
**Think Like a Parser**: Visualize AST (Entry → Functions → Imports/Calls). Trace `import {X} from 'Y'` → GO TO 'Y'. Follow flow: Entry → Propagation → Termination. Ignore noise.
</structural_code_vision>
