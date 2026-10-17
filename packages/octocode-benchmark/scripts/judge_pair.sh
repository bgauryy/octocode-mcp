#!/usr/bin/env bash
# Blind judge for one question: two arms' answers as X / Y (seeded random order, tool names
# redacted), graded by a model from a different family than the runners, which rebuilds
# ground truth with read-only gh first. For local questions (arms named `local-…`) the judge
# rebuilds ground truth with read-only shell on the pinned clones instead, and may read the
# answer key in local/datasets/core-v1/answers/.
#
#   judge_pair.sh <campaign-dir> <armA> <armB> <pass> <Qn>
#
# Writes judge/<armA>~<armB>/p<pass>-<Qn>.md (verdict ending in a ```json score block) and
# appends the X/Y map to judge/<armA>~<armB>/MAP.secret.txt.
# Env: JUDGE_PROVIDER (default guy-provider-openai), JUDGE_MODEL (default gpt-5.5).
#      JUDGE_RUNNER=codex: codex exec judge (model JUDGE_MODEL, default gpt-5.5; workspace-write
#      tools use an isolated filesystem and fresh homes, gh behind the guard; recorded in
#      judge/<pair>/JUDGE.txt).
set -euo pipefail
CAMP="$(cd "$1" && pwd)"; A="$2"; B="$3"; PASS="$4"; Q="$5"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG="$(cd "$HERE/.." && pwd)"
REF="$PKG/docs"
DIR="$CAMP/judge/$A~$B"
QDIR="external/questions"; [ "${A#local-}" = "$A" ] || QDIR="local/datasets/core-v1"
QUESTION_DIR="${QUESTION_DIR:-$PKG/$QDIR}"
Q="$(python3 "$HERE/question_catalog.py" "$QUESTION_DIR" "$Q")"
ANSWER_DIR="${ANSWER_DIR:-$QUESTION_DIR/answers}"
mkdir -p "$DIR"
valid_verdict() {
  python3 - "$HERE" "$1" <<'PYVERDICT'
import sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
from campaign_summary import parse_verdict
try:
    parse_verdict(Path(sys.argv[2]).read_text())
except (OSError, ValueError, AttributeError):
    raise SystemExit(1)
PYVERDICT
}
# Already judged: keep it (delete the verdict to judge again).
if valid_verdict "$DIR/p$PASS-$Q.md"; then echo "$A~$B p$PASS $Q already judged"; exit 0; fi

python3 - "$CAMP" "$PKG" "$A" "$B" "$PASS" "$Q" "$DIR" "$QDIR" "$QUESTION_DIR" <<'PY'
import hashlib, json, random, re, subprocess, sys
from pathlib import Path
camp, pkg, a, b, p, q, out, qdir = Path(sys.argv[1]), Path(sys.argv[2]), *sys.argv[3:7], Path(sys.argv[7]), sys.argv[8]
question_dir = Path(sys.argv[9])
# Hide which tool wrote an answer: tool names, CLIs and arm ids become "[research tool]".
IDENTITY = re.compile(
    r"(?:npx\s+octocode|octocode|headroom|\brtk\b|\bghc\b|\bgh\s+(?:api|search|pr|issue|repo)\b|\bgh[A-Z][A-Za-z]+"
    r"|\b(?:localSearch|localFetch|structureSearch|astSearch|lspSearch|artifactSearch|clasify|MCP)\b)",
    re.IGNORECASE)
# Local answers also name shell tools and the older Octocode tool names.
LOCAL_IDENTITY = re.compile(
    r"(?:\b(?:rg|ripgrep|ast-grep|sg|grep|egrep|localGetFileContent|lspGetSemantics|localAnalyzeGraph|npmSearch)\b"
    r"|\bsed\s+-n\b|\bwc\s+-[lc]\b|\bgit\s+(?:grep|show|log|ls-files|ls-tree|blame|cat-file)\b)")
clones = str(pkg.parents[1] / "packages/octocode-benchmark/local/e2e" / "repos")
arms = [a, b]
random.Random(int(hashlib.sha256(f"42-{a}-{b}-{p}-{q}".encode()).hexdigest(), 16)).shuffle(arms)
sys.path.insert(0, str(pkg / "scripts"))
from question_catalog import resolve
question = resolve(question_dir, q).read_text()
repo_file = Path(__import__("os").environ.get("QUESTION_REPO_MAP") or question_dir / "repositories.json")
if repo_file.exists():
    manifest = json.loads(repo_file.read_text())
    selected = manifest.get("questionRepositories", {}).get(q, [])
    for repository in manifest["repositories"]:
        if repository["id"] in selected:
            question += "\n\nRepository scope: " + repository["sourceRoot"]
        question = question.replace("{{REPO:" + repository["id"] + "}}", repository["sourceRoot"])
if "{{REPO:" in question:
    raise SystemExit("Unresolved repository token in judge question")
text = [question, "", "# Answers to grade (blind)",
        "Disposable corpus paths are normalized to their identical pinned original source roots for verification."]
for label, arm in zip("XY", arms):
    status_file = camp / f"runs/{arm}-p{p}-{q}/status.json"
    if not status_file.exists() or not json.loads(status_file.read_text()).get("ok"):
        raise SystemExit(f"Refusing to score invalid or unverified run {arm}-p{p}-{q}")
    rows = [json.loads(l) for l in (camp / f"{arm}-p{p}-{q}.jsonl").read_text().splitlines() if l.strip()]
    calls = [r for r in rows if r.get("kind") != "answer"]
    answer = (camp / f"runs/{arm}-p{p}-{q}/answer.md").read_text()
    corpus_file = camp / f"runs/{arm}-p{p}-{q}/corpus.json"
    if corpus_file.exists():
        for corpus in json.loads(corpus_file.read_text()):
            source = corpus["sourceRoot"]
            sha = subprocess.check_output(["git", "-C", source, "rev-parse", "HEAD"], text=True).strip()
            dirty = subprocess.check_output(["git", "-C", source, "status", "--porcelain", "--untracked-files=no"], text=True)
            if sha != corpus["commit"] or dirty.strip():
                raise SystemExit("Pinned judge corpus changed; refusing to grade")
            answer = answer.replace(corpus["solverRoot"], source)
    if qdir == "local/datasets/core-v1":   # the clones' root contains "octocode": keep it out of the redaction
        answer = LOCAL_IDENTITY.sub("[research tool]", answer.replace(clones, "\0CLONES\0"))
    answer = IDENTITY.sub("[research tool]", answer).replace("\0CLONES\0", clones)
    text += ["", f"## {label}", "", answer.strip()]
(out / f"p{p}-{q}.packet.md").write_text("\n".join(text) + "\n")
line = f"p{p} {q} X={arms[0]} Y={arms[1]}\n"
map_file = out / "MAP.secret.txt"
if line not in (map_file.read_text() if map_file.exists() else ""):   # the shuffle is seeded, so a retry maps the same
    with map_file.open("a") as f:
        f.write(line)
PY

GROUND="Establish ground truth
yourself FIRST with read-only \`gh\` commands (\`gh api …\`, \`gh search …\`, \`gh pr view …\`)."
if [ "$QDIR" = local/datasets/core-v1 ]; then
  GROUND="This is a local question about pinned clones on this machine. Establish ground truth
yourself FIRST with read-only shell commands on the clone the question names (\`rg -n\`, \`grep\`,
\`sed -n\`, \`wc\`, \`git -C <clone> ls-files|show|log\`, \`ast-grep\`). The answer key
$ANSWER_DIR/$Q.md lists the expected facts and how they were checked:
If that key exists, read it and re-verify every fact you rely on against the clone (the key can be wrong). Otherwise derive the facts from the source."
fi
PROMPT="$(cat "$DIR/p$PASS-$Q.packet.md")

---
Grade X and Y per the judging instructions in your system prompt. $GROUND
Never modify anything. Explain verified source facts, material errors, omissions, and uncertainty in whatever layout makes the judgment clear. Do not infer tool efficiency from answer length; costs are withheld until quality is locked.
Correctness and depth scores are whole numbers. Workflow is null because tool transcripts and costs are withheld. If source access is insufficient to grade correctness, report the gap without a score block; the run remains unjudged. End with exactly one fenced \`\`\`json block:
{\"X\":{\"correctness\":0-10,\"depth\":1-5,\"workflow\":null},\"Y\":{\"correctness\":0-10,\"depth\":1-5,\"workflow\":null},\"winner\":\"X\"|\"Y\"|\"tie\",\"reason\":\"the verified fact deciding quality, or why quality is tied\"}"

# Resolve the real gh BEFORE the guard goes first on PATH, or the guard would call itself.
export REAL_GH="${REAL_GH:-$(command -v gh)}"
export PATH="$HERE/guard:$PATH"
if [ "$QDIR" = local/datasets/core-v1 ]; then   # read-only git/find for the local judge
  export REAL_GIT="${REAL_GIT:-$(command -v git)}" REAL_FIND="${REAL_FIND:-$(command -v find)}"
  export PATH="$HERE/guard-local:$PATH"
fi
cd "$DIR"
if [ "${JUDGE_RUNNER:-pi}" = codex ]; then
  CODEX="${CODEX_BIN:-$(command -v codex || echo /Applications/Codex.app/Contents/Resources/codex-cli/bin/codex)}"
  MODEL="${JUDGE_MODEL:-gpt-5.5}"
  echo "runner=codex model=$MODEL codex=$("$CODEX" --version 2>/dev/null)" > "$DIR/JUDGE.txt"
  USED="${JUDGE_ATTEMPTS_USED:-0}"
  case "$USED" in 0|1|2) ;; *) echo "Judge attempt budget exhausted or invalid" >&2; exit 2 ;; esac
  READ_ARGS=()
  if [ "$QDIR" = local/datasets/core-v1 ]; then
    [ ! -f "$ANSWER_DIR/$Q.md" ] || READ_ARGS+=(--read-path "$ANSWER_DIR/$Q.md")
    while IFS= read -r root; do READ_ARGS+=(--read-path "$root"); done < <(
      python3 - "$CAMP/runs/$A-p$PASS-$Q/corpus.json" <<'PYROOTS'
import json, sys
from pathlib import Path
for repository in json.loads(Path(sys.argv[1]).read_text()):
    print(repository['sourceRoot'])
PYROOTS
    )
  fi
  for ((attempt=USED+1; attempt<=3; attempt++)); do
    ATTEMPT="$DIR/attempts/p$PASS-$Q/$attempt"
    mkdir -p "$(dirname "$ATTEMPT")"
    mkdir "$ATTEMPT"
    { cat "$REF/judging.md"; echo; cat "$REF/example-verdict.md"; echo; echo '---'; echo; printf '%s\n' "$PROMPT"; } > "$ATTEMPT/prompt.md"
    RUN_OK=0
    CODEX_BIN="$CODEX" python3 "$HERE/judge_codex.py" --model "$MODEL" \
      --prompt "$ATTEMPT/prompt.md" --output "$ATTEMPT/verdict.md" \
      --receipt "$ATTEMPT/isolation.json" --timeout "${JUDGE_TIMEOUT:-600}" \
      ${READ_ARGS[@]+"${READ_ARGS[@]}"} > "$ATTEMPT/runner.log" 2>&1 && RUN_OK=1
    cp "$ATTEMPT/runner.log" "$DIR/p$PASS-$Q.stderr.log"
    if [ "$RUN_OK" = 1 ] && valid_verdict "$ATTEMPT/verdict.md"; then
      cp "$ATTEMPT/verdict.md" "$DIR/p$PASS-$Q.md"
      echo "$A~$B p$PASS $Q judged"; exit 0
    fi
    if [ "$attempt" -lt 3 ]; then sleep $((attempt * 30)); fi
  done
  echo "$A~$B p$PASS $Q NO VERDICT ($(tail -c 120 "$DIR/p$PASS-$Q.stderr.log" | tr '\n' ' '))"
  exit 1
fi
# A provider hiccup (connection error, empty reply) is retried with backoff; a judge that
# still returns no ```json verdict is reported, never scored.
for attempt in 1 2 3; do
  WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/bench-judge-XXXXXX")"
  python3 - "$WORKDIR/agent" <<'PYAGENT'
import os, json, sys
from pathlib import Path
target = Path(sys.argv[1]); target.mkdir()
source = Path(os.environ.get('PI_CODING_AGENT_DIR') or Path.home() / '.pi/agent')
for name in ('auth.json', 'models.json'):
    if (source / name).exists():
        (target / name).symlink_to((source / name).resolve())
(target / 'settings.json').write_text('{}\n')
PYAGENT
  echo "runner=pi model=${JUDGE_MODEL:-gpt-5.5} provider=${JUDGE_PROVIDER:-guy-provider-openai}" > "$DIR/JUDGE.txt"
  (cd "$WORKDIR" && PI_CODING_AGENT_DIR="$WORKDIR/agent" perl -e 'alarm shift; exec @ARGV' "${JUDGE_TIMEOUT:-600}" pi -p --mode json --no-session \
    --no-context-files --no-extensions --no-skills --no-prompt-templates --no-themes --no-mcp --offline \
    --provider "${JUDGE_PROVIDER:-guy-provider-openai}" --model "${JUDGE_MODEL:-gpt-5.5}" --tools bash,read \
    --append-system-prompt "$REF/judging.md" --append-system-prompt "$REF/example-verdict.md" \
    "$PROMPT") > "$DIR/p$PASS-$Q.transcript.jsonl" 2> "$DIR/p$PASS-$Q.stderr.log" || true
  python3 - "$DIR/p$PASS-$Q" <<'PYJUDGE'
import json, sys
from pathlib import Path
base = sys.argv[1]
messages = []
for line in Path(base + '.transcript.jsonl').read_text().splitlines():
    try:
        event = json.loads(line)
    except ValueError:
        continue
    if event.get('type') == 'message_end' and event.get('message', {}).get('role') == 'assistant':
        messages.append(event['message'])
last = messages[-1] if messages else {}
Path(base + '.md').write_text('\n'.join(c.get('text', '') for c in last.get('content', []) if c.get('type') == 'text'))
usage = [m.get('usage') for m in messages]
report = {'assistant_messages': len(messages), 'model': last.get('model'), 'usage_complete': bool(usage) and all(usage)}
for key in ('input', 'output', 'cacheRead', 'cacheWrite', 'totalTokens'):
    values = [u[key] for u in usage if u and u.get(key) is not None]
    report[key] = sum(values) if values else None
costs = [u['cost']['total'] for u in usage if u and (u.get('cost') or {}).get('total') is not None]
report['reported_cost_usd'] = sum(costs) if costs else None
Path(base + '.usage.json').write_text(json.dumps(report, indent=1) + '\n')
PYJUDGE
  rm -rf "$WORKDIR/agent"
  rmdir "$WORKDIR" 2>/dev/null || true
  if valid_verdict "$DIR/p$PASS-$Q.md"; then echo "$A~$B p$PASS $Q judged"; exit 0; fi
  mkdir -p "$DIR/attempts/p$PASS-$Q"
  cp "$DIR/p$PASS-$Q.md" "$DIR/attempts/p$PASS-$Q/$attempt.md"
  cp "$DIR/p$PASS-$Q.stderr.log" "$DIR/attempts/p$PASS-$Q/$attempt.stderr.log"
  cp "$DIR/p$PASS-$Q.transcript.jsonl" "$DIR/attempts/p$PASS-$Q/$attempt.transcript.jsonl"
  cp "$DIR/p$PASS-$Q.usage.json" "$DIR/attempts/p$PASS-$Q/$attempt.usage.json"
  sleep $((attempt * 30))
done
echo "$A~$B p$PASS $Q NO VERDICT ($(tail -c 120 "$DIR/p$PASS-$Q.stderr.log" | tr '\n' ' '))"
exit 1
