#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd -- "$(dirname -- "$0")" && pwd)
BENCH=/tmp/bench-r245-autoresearch
RUNS="$BENCH/runs"
PROMPTS=/tmp/bench-r1-r5/prompts.sh
GT=/tmp/bench-r1-r5/ground-truth/ground-truth.json

mkdir -p "$RUNS"
rm -f "$RUNS"/*

if [ ! -f "$PROMPTS" ] || [ ! -f "$GT" ]; then
  echo "Missing benchmark fixtures under /tmp/bench-r1-r5" >&2
  exit 1
fi

YARN_ENABLE_SCRIPTS=0 yarn --cwd "$ROOT/packages/octocode-cli" build:dev >/dev/null

for name in bench-cli octocode-cli; do
cat > "$BENCH/$name" <<EOF
#!/usr/bin/env bash
exec node "$ROOT/packages/octocode-cli/out/octocode-cli.js" "\$@"
EOF
chmod +x "$BENCH/$name"
done

SKILL=$(cat "$ROOT/skills/octocode-cli/SKILL.md")
# shellcheck disable=SC1090
source "$PROMPTS"

run_cli_trial() {
  local task=$1
  local trial=$2
  local prompt=
  case "$task" in
    R2) prompt="$R2_PROMPT" ;;
    R3) prompt="$R3_PROMPT" ;;
    R4) prompt="$R4_PROMPT" ;;
    R5) prompt="$R5_PROMPT" ;;
    *) echo "bad task: $task" >&2; return 2 ;;
  esac

  local log="$RUNS/cli-${task}-t${trial}"
  local start end rc wall
  start=$(date +%s)
  set +e
  PATH="$BENCH:$PATH" \
  SKILL_CONTENT="$SKILL" \
  PROMPT_CONTENT="$prompt" \
  LOG_JSONL="$log.jsonl" \
  LOG_ERR="$log.err" \
  python3 - <<'PY'
import os
import subprocess
import sys

cmd = [
    'claude',
    '-p',
    '--model', 'sonnet',
    '--permission-mode', 'acceptEdits',
    '--allowedTools', 'Bash(octocode-cli:*)', 'Bash(bench-cli:*)',
    '--disallowedTools', 'mcp__octocode__*', 'Agent', 'Task', 'WebFetch', 'WebSearch',
    '--output-format', 'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--append-system-prompt', os.environ['SKILL_CONTENT'],
    os.environ['PROMPT_CONTENT'],
]
with open(os.environ['LOG_JSONL'], 'w') as out, open(os.environ['LOG_ERR'], 'w') as err:
    try:
        completed = subprocess.run(
            cmd,
            cwd='/tmp',
            env=os.environ.copy(),
            stdout=out,
            stderr=err,
            timeout=300,
        )
    except subprocess.TimeoutExpired:
        sys.exit(124)
sys.exit(completed.returncode)
PY
  rc=$?
  set -e
  end=$(date +%s)
  wall=$((end - start))
  echo "$rc" > "$log.rc"
  echo "$wall" > "$log.wall"
  echo "trial task=$task rep=$trial rc=$rc wall=${wall}s" >&2
}

# Less noisy broader subset: two target samples plus one guardrail run.
run_cli_trial R2 1
run_cli_trial R4 1
run_cli_trial R5 1
run_cli_trial R2 2
run_cli_trial R4 2
run_cli_trial R5 2
run_cli_trial R3 1

python3 - <<'PY'
from __future__ import annotations
import json
import re
import statistics
import subprocess
import sys
from pathlib import Path

RUNS = Path('/tmp/bench-r245-autoresearch/runs')
GT = json.loads(Path('/tmp/bench-r1-r5/ground-truth/ground-truth.json').read_text())
TASKS = ['R2', 'R4', 'R5']
GUARD = 'R3'
TEST_RE = re.compile(GT['R2']['test_path_regex'])


def extract_last_result(path: Path):
    if not path.exists():
        return None
    last = None
    for line in path.read_text().splitlines():
        if not line.startswith('{'):
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if obj.get('type') == 'result' and obj.get('subtype') == 'success':
            last = obj
    return last


def parse_answer_json(text: str):
    if not text:
        return None
    depth = 0
    start = -1
    for i, c in enumerate(text):
        if c == '{':
            if depth == 0:
                start = i
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0 and start != -1:
                candidate = text[start:i + 1]
                try:
                    return json.loads(candidate)
                except json.JSONDecodeError:
                    start = -1
    return None


def gh_fetch_file(repo: str, path: str) -> str | None:
    try:
        r = subprocess.run(
            ['gh', 'api', f'repos/{repo}/contents/{path}', '-H', 'Accept: application/vnd.github.raw'],
            capture_output=True,
            timeout=20,
        )
        if r.returncode == 0:
            return r.stdout.decode('utf-8', errors='replace')
    except Exception:
        pass
    return None


def gh_pr_files(repo: str, pr_number: int) -> list[str]:
    try:
        r = subprocess.run(
            ['gh', 'api', f'repos/{repo}/pulls/{pr_number}/files', '--jq', '[.[] | .filename] | .[]'],
            capture_output=True,
            timeout=30,
        )
        if r.returncode == 0:
            return [line for line in r.stdout.decode().splitlines() if line]
    except Exception:
        pass
    return []


def gh_exists(repo: str, path: str) -> bool:
    try:
        r = subprocess.run(
            ['gh', 'api', f'repos/{repo}/contents/{path}', '-H', 'Accept: application/vnd.github.raw'],
            capture_output=True,
            timeout=20,
        )
        return r.returncode == 0
    except Exception:
        return False


def score_r2(ans):
    if not isinstance(ans, dict):
        return False, 'answer not dict'
    examples = ans.get('examples') or []
    if len(examples) != 3:
        return False, f'examples count={len(examples)}'
    seen = set()
    for ex in examples:
        path = ex.get('file')
        line = ex.get('line')
        if not path or not isinstance(line, int):
            return False, f'bad example: {ex}'
        if path in seen:
            return False, f'duplicate file: {path}'
        seen.add(path)
        if not TEST_RE.search(path):
            return False, f'not test file: {path}'
        content = gh_fetch_file(GT['R2']['repo'], path)
        if content is None:
            return False, f'file not found: {path}'
        lines = content.splitlines()
        ok = False
        for target in range(max(1, line - 2), min(len(lines), line + 2) + 1):
            if 'discriminatedUnion' in lines[target - 1]:
                ok = True
                break
        if not ok:
            return False, f'no discriminatedUnion near {path}:{line}'
    return True, ''


def score_r3(ans):
    if not isinstance(ans, dict):
        return False, 'answer not dict'
    if not ans.get('purpose'):
        return False, 'missing purpose'
    topdirs = ans.get('topDirs') or []
    if len(topdirs) != 3:
        return False, f'topDirs count={len(topdirs)}'
    for d in topdirs:
        if d.get('name') not in GT['R3']['top_dirs_allowed']:
            return False, f'bad topDir: {d.get("name")}'
        if not d.get('role'):
            return False, f'missing role for {d.get("name")}'
    ep = ans.get('entryPoint') or {}
    file = ep.get('file')
    symbol = ep.get('symbol')
    if not file or not symbol:
        return False, 'missing entryPoint'
    accepted_files = {
        'src/mcp/server/fastmcp.py',
        'src/mcp/server/fastmcp/__init__.py',
        'src/mcp/server/fastmcp/fastmcp.py',
        'src/mcp/__init__.py',
    }
    content = gh_fetch_file(GT['R3']['repo'], file)
    if content is None and file in accepted_files:
        alt = 'src/mcp/server/fastmcp.py' if 'fastmcp' in file else 'src/mcp/__init__.py'
        content = gh_fetch_file(GT['R3']['repo'], alt)
        file = alt if content is not None else file
    if content is None:
        return False, f'entryPoint file not found: {file}'
    if symbol not in content:
        return False, f'symbol {symbol!r} not in {file}'
    return True, ''


def score_r4(ans):
    if not isinstance(ans, dict):
        return False, 'answer not dict'
    pr = ans.get('prNumber')
    title = ans.get('title')
    merged_at = ans.get('mergedAt') or ''
    changed = ans.get('changedFile') or ''
    if not changed.startswith('src/compiler/'):
        return False, f'changedFile not under src/compiler/: {changed}'
    for candidate in GT['R4']['top_n_accept']:
        if pr == candidate['number']:
            if title != candidate['title']:
                return False, f'title mismatch for #{pr}'
            if candidate['mergedAt'][:10] not in merged_at:
                return False, f'mergedAt mismatch for #{pr}'
            files = gh_pr_files('microsoft/TypeScript', pr)
            if changed in files:
                return True, ''
            return False, f'changedFile {changed} missing from PR #{pr}'
    return False, f'prNumber={pr} not accepted'


def score_r5(ans):
    if not isinstance(ans, dict):
        return False, 'answer not dict'
    repos = ans.get('repos') or []
    if len(repos) != 2:
        return False, f'repos count={len(repos)}'
    if [r.get('name') for r in repos] != ['vitejs/vite', 'webpack/webpack']:
        return False, f'bad repo order: {[r.get("name") for r in repos]}'
    for row in repos:
        spec = GT['R5']['vite'] if row['name'] == 'vitejs/vite' else GT['R5']['webpack']
        cli_file = row.get('cliFile') or ''
        cli_symbol = row.get('cliSymbol') or ''
        if cli_file not in spec['cliFile_accept'] and not gh_exists(spec['repo'], cli_file):
            return False, f'{row["name"]}: cliFile not resolvable: {cli_file}'
        content = gh_fetch_file(spec['repo'], cli_file) or ''
        if not cli_symbol or cli_symbol not in content:
            return False, f'{row["name"]}: symbol {cli_symbol!r} not in {cli_file}'
    return True, ''


SCORERS = {'R2': score_r2, 'R3': score_r3, 'R4': score_r4, 'R5': score_r5}


def eff_cost(usage: dict) -> float:
    return (
        (usage.get('cache_read_input_tokens') or 0) * 0.1
        + (usage.get('cache_creation_input_tokens') or 0) * 1.25
        + (usage.get('input_tokens') or 0)
        + (usage.get('output_tokens') or 0) * 5
    )


records = []
for path in sorted(RUNS.glob('cli-*.jsonl')):
    name = path.stem
    _, task, trial = name.split('-')
    trial = int(trial[1:])
    wall = int(path.with_suffix('.wall').read_text().strip())
    result = extract_last_result(path)
    if result is None:
        records.append({'task': task, 'trial': trial, 'pass': False, 'reason': 'missing result', 'wall': wall, 'turns': 0, 'eff_cost': 0.0})
        continue
    ans = parse_answer_json(result.get('result') or '')
    passed, reason = SCORERS[task](ans)
    usage = result.get('usage') or {}
    records.append({
        'task': task,
        'trial': trial,
        'pass': passed,
        'reason': reason,
        'wall': wall,
        'turns': result.get('num_turns') or 0,
        'eff_cost': eff_cost(usage),
    })


def median_wall(task: str) -> float:
    vals = [r['wall'] for r in records if r['task'] == task and r['pass']]
    if not vals:
        return 999.0
    return float(statistics.median(vals))


def total_passes() -> int:
    return sum(1 for r in records if r['pass'])


r2 = median_wall('R2')
r4 = median_wall('R4')
r5 = median_wall('R5')
r3 = median_wall('R3')
passes = total_passes()
target_passes = sum(1 for r in records if r['task'] in TASKS and r['pass'])
avg_turns = statistics.mean(r['turns'] for r in records) if records else 0.0
eff = statistics.mean(r['eff_cost'] for r in records) if records else 0.0
total = r2 + r4 + r5

print(f'METRIC total_s={total:.3f}')
print(f'METRIC r2_s={r2:.3f}')
print(f'METRIC r4_s={r4:.3f}')
print(f'METRIC r5_s={r5:.3f}')
print(f'METRIC r3_s={r3:.3f}')
print(f'METRIC passes={passes}')
print(f'METRIC target_passes={target_passes}')
print(f'METRIC avg_turns={avg_turns:.3f}')
print(f'METRIC eff_cost={eff:.3f}')

for r in records:
    status = 'PASS' if r['pass'] else 'FAIL'
    print(f'{status} {r["task"]} t{r["trial"]} wall={r["wall"]} turns={r["turns"]} reason={r["reason"]}')

if target_passes < len([r for r in records if r['task'] in TASKS]):
    sys.exit(2)
PY
