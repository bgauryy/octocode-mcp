#!/usr/bin/env bash
# Blind judge for one question: two arms' answers as X / Y (seeded random order, tool names
# redacted), graded by a model from a different family than the runners, which rebuilds
# ground truth with read-only gh first. For local questions (arms named `local-…`) the judge
# rebuilds ground truth with read-only shell on the pinned clones instead, and may read the
# answer key in compare/local-questions/answers/.
#
#   judge_pair.sh <campaign-dir> <armA> <armB> <pass> <Qn>
#
# Writes judge/<armA>~<armB>/p<pass>-<Qn>.md (verdict ending in a ```json score block) and
# appends the X/Y map to judge/<armA>~<armB>/MAP.secret.txt.
# Env: JUDGE_PROVIDER (default guy-provider-openai), JUDGE_MODEL (default gpt-5.5).
#      JUDGE_RUNNER=codex: codex exec judge (model JUDGE_MODEL, default gpt-5.5; workspace-write
#      sandbox with network in an empty temp cwd, gh behind the guard; recorded in
#      judge/<pair>/JUDGE.txt).
set -euo pipefail
CAMP="$(cd "$1" && pwd)"; A="$2"; B="$3"; PASS="$4"; Q="$5"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG="$(cd "$HERE/../.." && pwd)"
REF="$PKG/skills/octocode-benchmark/references"
DIR="$CAMP/judge/$A~$B"
QDIR="github-questions"; [ "${A#local-}" = "$A" ] || QDIR="local-questions"
mkdir -p "$DIR"
# Already judged: keep it (delete the verdict to judge again).
if grep -q '```json' "$DIR/p$PASS-$Q.md" 2>/dev/null; then echo "$A~$B p$PASS $Q already judged"; exit 0; fi

python3 - "$CAMP" "$PKG" "$A" "$B" "$PASS" "$Q" "$DIR" "$QDIR" <<'PY'
import hashlib, json, random, re, sys
from pathlib import Path
camp, pkg, a, b, p, q, out, qdir = Path(sys.argv[1]), Path(sys.argv[2]), *sys.argv[3:7], Path(sys.argv[7]), sys.argv[8]
# Hide which tool wrote an answer: tool names, CLIs and arm ids become "[research tool]".
IDENTITY = re.compile(
    r"(?:npx\s+octocode|octocode|headroom|\brtk\b|\bghc\b|\bgh\s+(?:api|search|pr|issue|repo)\b|\bgh[A-Z][A-Za-z]+"
    r"|\b(?:localSearch|localFetch|structureSearch|astSearch|lspSearch|artifactSearch|clasify|MCP)\b)",
    re.IGNORECASE)
# Local answers also name shell tools and the older Octocode tool names.
LOCAL_IDENTITY = re.compile(
    r"(?:\b(?:rg|ripgrep|ast-grep|sg|grep|egrep|localGetFileContent|lspGetSemantics|localAnalyzeGraph|npmSearch)\b"
    r"|\bsed\s+-n\b|\bwc\s+-[lc]\b|\bgit\s+(?:grep|show|log|ls-files|ls-tree|blame|cat-file)\b)")
clones = str(pkg.parents[1] / "octocode-local-testing" / "repos")
arms = [a, b]
random.Random(int(hashlib.sha256(f"42-{a}-{b}-{p}-{q}".encode()).hexdigest(), 16)).shuffle(arms)
text = [(pkg / f"compare/{qdir}/{q}.md").read_text(), "", "# Answers to grade (blind)"]
for label, arm in zip("XY", arms):
    rows = [json.loads(l) for l in (camp / f"{arm}-p{p}-{q}.jsonl").read_text().splitlines() if l.strip()]
    calls = [r for r in rows if r.get("kind") != "answer"]
    answer = (camp / f"runs/{arm}-p{p}-{q}/answer.md").read_text()
    if qdir == "local-questions":   # the clones' root contains "octocode": keep it out of the redaction
        answer = LOCAL_IDENTITY.sub("[research tool]", answer.replace(clones, "\0CLONES\0"))
    answer = IDENTITY.sub("[research tool]", answer).replace("\0CLONES\0", clones)
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

GROUND="Establish ground truth
yourself FIRST with read-only \`gh\` commands (\`gh api …\`, \`gh search …\`, \`gh pr view …\`)."
if [ "$QDIR" = local-questions ]; then
  GROUND="This is a local question about pinned clones on this machine. Establish ground truth
yourself FIRST with read-only shell commands on the clone the question names (\`rg -n\`, \`grep\`,
\`sed -n\`, \`wc\`, \`git -C <clone> ls-files|show|log\`, \`ast-grep\`). The answer key
$PKG/compare/local-questions/answers/$Q.md lists the expected facts and how they were checked:
read it, then re-verify every fact you rely on against the clone (the key can be wrong)."
fi
PROMPT="$(cat "$DIR/p$PASS-$Q.packet.md")

---
Grade X and Y per the judging instructions in your system prompt. $GROUND
Never modify anything. Write the verdict (ground-truth table, per-answer reasoning, ranking).
Scores are whole numbers. End with exactly one fenced \`\`\`json block:
{\"X\":{\"correctness\":0-10,\"depth\":1-5,\"workflow\":1-5},\"Y\":{\"correctness\":0-10,\"depth\":1-5,\"workflow\":1-5},\"winner\":\"X\"|\"Y\"|\"tie\",\"reason\":\"one line naming the deciding fact or char gap\"}"

# Resolve the real gh BEFORE the guard goes first on PATH, or the guard would call itself.
export REAL_GH="${REAL_GH:-$(command -v gh)}"
export PATH="$HERE/guard:$PATH"
if [ "$QDIR" = local-questions ]; then   # read-only git/find for the local judge
  export REAL_GIT="${REAL_GIT:-$(command -v git)}" REAL_FIND="${REAL_FIND:-$(command -v find)}"
  export PATH="$HERE/guard-local:$PATH"
fi
cd "$DIR"
if [ "${JUDGE_RUNNER:-pi}" = codex ]; then
  CODEX="${CODEX_BIN:-$(command -v codex || echo /Applications/Codex.app/Contents/Resources/codex-cli/bin/codex)}"
  MODEL="${JUDGE_MODEL:-gpt-5.5}"
  echo "runner=codex model=$MODEL codex=$("$CODEX" --version 2>/dev/null)" > "$DIR/JUDGE.txt"
  for attempt in 1 2 3; do
    WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/bench-judge-XXXXXX")"
    { cat "$REF/JUDGING.md"; echo; cat "$REF/example-verdict.md"; echo; echo '---'; echo; printf '%s\n' "$PROMPT"; } > "$WORKDIR/prompt.md"
    "$CODEX" exec --ephemeral --skip-git-repo-check --ignore-user-config --ignore-rules \
      -s workspace-write -c sandbox_workspace_write.network_access=true -m "$MODEL" -C "$WORKDIR" \
      -o "$DIR/p$PASS-$Q.md" - < "$WORKDIR/prompt.md" > "$DIR/p$PASS-$Q.stderr.log" 2>&1 || true
    rm -rf "$WORKDIR"
    if grep -q '```json' "$DIR/p$PASS-$Q.md" 2>/dev/null; then echo "$A~$B p$PASS $Q judged"; exit 0; fi
    sleep $((attempt * 30))
  done
  echo "$A~$B p$PASS $Q NO VERDICT ($(tail -c 120 "$DIR/p$PASS-$Q.stderr.log" | tr '\n' ' '))"
  exit 1
fi
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
