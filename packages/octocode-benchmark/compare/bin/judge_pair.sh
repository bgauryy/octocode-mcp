#!/usr/bin/env bash
# Blind judge for one question: two arms' answers as X / Y (seeded random order, tool names
# redacted), graded by a model from a different family than the runners, which rebuilds
# ground truth with read-only gh first.
#
#   judge_pair.sh <campaign-dir> <armA> <armB> <pass> <Qn>
#
# Writes judge/<armA>~<armB>/p<pass>-<Qn>.md (verdict ending in a ```json score block) and
# appends the X/Y map to judge/<armA>~<armB>/MAP.secret.txt.
# Env: JUDGE_PROVIDER (default guy-provider-openai), JUDGE_MODEL (default gpt-5.5).
set -euo pipefail
CAMP="$(cd "$1" && pwd)"; A="$2"; B="$3"; PASS="$4"; Q="$5"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG="$(cd "$HERE/../.." && pwd)"
REF="$PKG/skills/octocode-benchmark/references"
DIR="$CAMP/judge/$A~$B"
mkdir -p "$DIR"
# Already judged: keep it (delete the verdict to judge again).
if grep -q '```json' "$DIR/p$PASS-$Q.md" 2>/dev/null; then echo "$A~$B p$PASS $Q already judged"; exit 0; fi

python3 - "$CAMP" "$PKG" "$A" "$B" "$PASS" "$Q" "$DIR" <<'PY'
import hashlib, json, random, re, sys
from pathlib import Path
camp, pkg, a, b, p, q, out = Path(sys.argv[1]), Path(sys.argv[2]), *sys.argv[3:7], Path(sys.argv[7])
# Hide which tool wrote an answer: tool names, CLIs and arm ids become "[research tool]".
IDENTITY = re.compile(
    r"(?:npx\s+octocode|octocode|headroom|\brtk\b|\bghc\b|\bgh\s+(?:api|search|pr|issue|repo)\b|\bgh[A-Z][A-Za-z]+"
    r"|\b(?:localSearch|localFetch|structureSearch|astSearch|lspSearch|artifactSearch|clasify|MCP)\b)",
    re.IGNORECASE)
arms = [a, b]
random.Random(int(hashlib.sha256(f"42-{a}-{b}-{p}-{q}".encode()).hexdigest(), 16)).shuffle(arms)
text = [(pkg / f"compare/github-questions/{q}.md").read_text(), "", "# Answers to grade (blind)"]
for label, arm in zip("XY", arms):
    rows = [json.loads(l) for l in (camp / f"{arm}-p{p}-{q}.jsonl").read_text().splitlines() if l.strip()]
    calls = [r for r in rows if r.get("kind") != "answer"]
    answer = IDENTITY.sub("[research tool]", (camp / f"runs/{arm}-p{p}-{q}/answer.md").read_text())
    text += ["", f"## {label}", "", answer.strip(), "",
             f"Authoritative metrics: calls={len(calls)}, failed_calls={sum(1 for r in calls if r.get('exit_code'))}, "
             f"total_chars={sum(r['total_chars'] for r in rows)}."]
(out / f"p{p}-{q}.packet.md").write_text("\n".join(text) + "\n")
line = f"p{p} {q} X={arms[0]} Y={arms[1]}\n"
map_file = out / "MAP.secret.txt"
if line not in (map_file.read_text() if map_file.exists() else ""):   # the shuffle is seeded, so a retry maps the same
    with map_file.open("a") as f:
        f.write(line)
PY

PROMPT="$(cat "$DIR/p$PASS-$Q.packet.md")

---
Grade X and Y per the judging instructions in your system prompt. Establish ground truth
yourself FIRST with read-only \`gh\` commands (\`gh api …\`, \`gh search …\`, \`gh pr view …\`).
Never modify anything. Write the verdict (ground-truth table, per-answer reasoning, ranking).
Scores are whole numbers. End with exactly one fenced \`\`\`json block:
{\"X\":{\"correctness\":0-10,\"depth\":1-5,\"workflow\":1-5},\"Y\":{\"correctness\":0-10,\"depth\":1-5,\"workflow\":1-5},\"winner\":\"X\"|\"Y\"|\"tie\",\"reason\":\"one line naming the deciding fact or char gap\"}"

# Resolve the real gh BEFORE the guard goes first on PATH, or the guard would call itself.
export REAL_GH="${REAL_GH:-$(command -v gh)}"
export PATH="$HERE/guard:$PATH"
cd "$DIR"
# A provider hiccup (connection error, empty reply) is retried with backoff; a judge that
# still returns no ```json verdict is reported, never scored.
for attempt in 1 2 3; do
  pi -p --no-session --provider "${JUDGE_PROVIDER:-guy-provider-openai}" --model "${JUDGE_MODEL:-gpt-5.5}" --tools bash,read \
    --append-system-prompt "$REF/JUDGING.md" --append-system-prompt "$REF/example-verdict.md" \
    "$PROMPT" > "$DIR/p$PASS-$Q.md" 2> "$DIR/p$PASS-$Q.stderr.log" || true
  if grep -q '```json' "$DIR/p$PASS-$Q.md"; then echo "$A~$B p$PASS $Q judged"; exit 0; fi
  sleep $((attempt * 30))
done
echo "$A~$B p$PASS $Q NO VERDICT ($(tail -c 120 "$DIR/p$PASS-$Q.stderr.log" | tr '\n' ' '))"
exit 1
