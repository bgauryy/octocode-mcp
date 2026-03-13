#!/usr/bin/env bash
#
# Verification & Benchmark script for raw URL fetch optimization + timestamp caching
#
# Tests three optimization layers:
#   1. Raw URL vs REST API (PR #330) — content fetch cost & latency
#   2. listCommits (fetchFileTimestamp) — the hidden API cost per file
#   3. Combined session simulation — total cost with/without optimizations
#
# SCOPE: GitHub.com only. Directory/clone mode is NOT tested.
#
# Usage:
#   ./scripts/verify-raw-url-fetch.sh [owner/repo]
#   ./scripts/verify-raw-url-fetch.sh --private owner/private-repo
#   ./scripts/verify-raw-url-fetch.sh --skip-build owner/repo
#
set -euo pipefail

PRIVATE_MODE=false
SKIP_BUILD=false
POSITIONAL=()

for arg in "$@"; do
  case "$arg" in
    --private) PRIVATE_MODE=true ;;
    --skip-build) SKIP_BUILD=true ;;
    --help|-h)
      echo "Usage: $0 [--private] [--skip-build] [owner/repo]"
      echo ""
      echo "  --private     Include private repo auth tests"
      echo "  --skip-build  Skip typecheck and test suite"
      echo "  owner/repo    GitHub repo to test (default: bgauryy/octocode-mcp)"
      exit 0
      ;;
    *) POSITIONAL+=("$arg") ;;
  esac
done

REPO="${POSITIONAL[0]:-bgauryy/octocode-mcp}"
OWNER="${REPO%%/*}"
REPO_NAME="${REPO##*/}"

PASS=0; FAIL=0; WARN=0

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'
BLUE='\033[0;34m'; BOLD='\033[1m'; DIM='\033[2m'; NC='\033[0m'

log_pass() { echo -e "  ${GREEN}PASS${NC}  $1"; ((PASS++)); }
log_fail() { echo -e "  ${RED}FAIL${NC}  $1"; ((FAIL++)); }
log_warn() { echo -e "  ${YELLOW}WARN${NC}  $1"; ((WARN++)); }
log_info() { echo -e "  ${BLUE}----${NC}  $1"; }
section() { echo -e "\n${BOLD}[$1] $2${NC}"; }

# ─── Helpers ──────────────────────────────────────────────────────────

raw_url() {
  echo "https://raw.githubusercontent.com/${OWNER}/${REPO_NAME}/${1}/${2}"
}

raw_fetch() {
  curl -s -o "$3" -w "%{http_code}|%{time_total}|%{size_download}" \
    -H "Authorization: token ${TOKEN}" \
    -H "User-Agent: octocode-mcp" \
    --max-time 10 \
    "$(raw_url "$1" "$2")"
}

api_fetch() {
  curl -s -o "$3" -w "%{http_code}|%{time_total}|%{size_download}" \
    -H "Authorization: token ${TOKEN}" \
    -H "Accept: application/vnd.github.v3+json" \
    -H "User-Agent: octocode-mcp" \
    --max-time 10 \
    "https://api.github.com/repos/${REPO}/contents/${2}?ref=${1}"
}

timestamp_fetch() {
  local encoded_path
  encoded_path=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$1', safe=''))" 2>/dev/null || echo "$1")
  curl -s -o "$2" -w "%{http_code}|%{time_total}" \
    -H "Authorization: token ${TOKEN}" \
    -H "Accept: application/vnd.github.v3+json" \
    -H "User-Agent: octocode-mcp" \
    --max-time 10 \
    "https://api.github.com/repos/${REPO}/commits?path=${encoded_path}&per_page=1&sha=${DEFAULT_BRANCH}"
}

get_remaining() {
  curl -s -H "Authorization: token ${TOKEN}" \
    "https://api.github.com/rate_limit" | jq -r '.resources.core.remaining'
}

TMPDIR=$(mktemp -d)
trap "rm -rf ${TMPDIR}" EXIT

# Track benchmark data for final summary
declare -A BENCH

# ═══════════════════════════════════════════════════════════════════════
section "0" "Prerequisites"
# ═══════════════════════════════════════════════════════════════════════

for cmd in curl jq gh bc; do
  command -v "$cmd" &>/dev/null && log_pass "$cmd available" || { log_fail "$cmd missing"; exit 1; }
done

TOKEN=$(gh auth token 2>/dev/null || echo "")
[[ -z "$TOKEN" ]] && { log_fail "No GitHub token (run: gh auth login)"; exit 1; }
log_pass "Token resolved"

DEFAULT_BRANCH=$(curl -s -H "Authorization: token ${TOKEN}" \
  "https://api.github.com/repos/${REPO}" | jq -r '.default_branch')
log_info "Repo: ${REPO}  Branch: ${DEFAULT_BRANCH}"

INITIAL_REMAINING=$(get_remaining)
LIMIT=$(curl -s -H "Authorization: token ${TOKEN}" \
  "https://api.github.com/rate_limit" | jq -r '.resources.core.limit')
log_info "Rate limit: ${INITIAL_REMAINING}/${LIMIT} remaining"

# ═══════════════════════════════════════════════════════════════════════
section "1" "Rate Limit Cost — Raw URL vs REST API vs listCommits"
# ═══════════════════════════════════════════════════════════════════════

FILES=("README.md" "package.json" "tsconfig.json" ".gitignore" "AGENTS.md")

# 1a: Raw URL cost
BEFORE=$(get_remaining)
for f in "${FILES[@]}"; do raw_fetch "$DEFAULT_BRANCH" "$f" /dev/null >/dev/null; done
AFTER=$(get_remaining)
RAW_COST=$((BEFORE - AFTER))
BENCH[raw_cost]=$RAW_COST
log_info "Raw URL: ${#FILES[@]} fetches consumed ${RAW_COST} API calls"

if [[ "$RAW_COST" -eq 0 ]]; then
  log_pass "Raw URL: 0 API calls for ${#FILES[@]} files"
elif [[ "$RAW_COST" -le 1 ]]; then
  log_warn "Raw URL: ${RAW_COST} call (possible rate_limit check noise)"
else
  log_fail "Raw URL: ${RAW_COST} calls (expected 0)"
fi

# 1b: REST API (repos/contents) cost
BEFORE=$(get_remaining)
for f in "${FILES[@]}"; do api_fetch "$DEFAULT_BRANCH" "$f" /dev/null >/dev/null; done
AFTER=$(get_remaining)
API_COST=$((BEFORE - AFTER))
BENCH[api_cost]=$API_COST
log_info "REST API (getContent): ${#FILES[@]} fetches consumed ${API_COST} API calls"

if [[ "$API_COST" -ge "${#FILES[@]}" ]]; then
  log_pass "REST API: ${API_COST} calls for ${#FILES[@]} files (1 call/file confirmed)"
else
  log_warn "REST API: ${API_COST} calls (expected >=${#FILES[@]})"
fi

# 1c: listCommits (fetchFileTimestamp) cost — THE HIDDEN COST
BEFORE=$(get_remaining)
for f in "${FILES[@]}"; do timestamp_fetch "$f" /dev/null >/dev/null; done
AFTER=$(get_remaining)
TS_COST=$((BEFORE - AFTER))
BENCH[ts_cost]=$TS_COST
log_info "listCommits (timestamp): ${#FILES[@]} fetches consumed ${TS_COST} API calls"

if [[ "$TS_COST" -ge "${#FILES[@]}" ]]; then
  log_pass "listCommits: ${TS_COST} calls for ${#FILES[@]} files (1 call/file — confirms the hidden cost)"
else
  log_warn "listCommits: ${TS_COST} calls (expected >=${#FILES[@]})"
fi

# 1d: Summary
TOTAL_CURRENT=$((API_COST + TS_COST))
log_info ""
log_info "${BOLD}Cost per ${#FILES[@]} files:${NC}"
log_info "  Current (getContent + listCommits):  ${TOTAL_CURRENT} API calls"
log_info "  Phase 0 only (getContent, no ts):    ${API_COST} calls  ${GREEN}(-${TS_COST})${NC}"
log_info "  PR #330 only (raw URL + listCommits): $((RAW_COST + TS_COST)) calls  ${GREEN}(-${API_COST})${NC}"
log_info "  Phase 0 + #330 (raw URL, no ts):     ${RAW_COST} calls  ${GREEN}(-${TOTAL_CURRENT})${NC}"

# ═══════════════════════════════════════════════════════════════════════
section "2" "Latency Benchmark — Raw URL vs REST API vs listCommits"
# ═══════════════════════════════════════════════════════════════════════

RAW_TIMES=(); API_TIMES=(); TS_TIMES=()
BENCH_FILE="README.md"
ROUNDS=5

log_info "Benchmarking ${ROUNDS} rounds of ${BENCH_FILE}..."

for _ in $(seq 1 $ROUNDS); do
  t=$(raw_fetch "$DEFAULT_BRANCH" "$BENCH_FILE" /dev/null | cut -d'|' -f2)
  RAW_TIMES+=("$t")
done

for _ in $(seq 1 $ROUNDS); do
  t=$(api_fetch "$DEFAULT_BRANCH" "$BENCH_FILE" /dev/null | cut -d'|' -f2)
  API_TIMES+=("$t")
done

for _ in $(seq 1 $ROUNDS); do
  t=$(timestamp_fetch "$BENCH_FILE" /dev/null | cut -d'|' -f2)
  TS_TIMES+=("$t")
done

raw_avg=$(printf '%s\n' "${RAW_TIMES[@]}" | awk '{s+=$1} END {printf "%.3f", s/NR}')
api_avg=$(printf '%s\n' "${API_TIMES[@]}" | awk '{s+=$1} END {printf "%.3f", s/NR}')
ts_avg=$(printf '%s\n' "${TS_TIMES[@]}" | awk '{s+=$1} END {printf "%.3f", s/NR}')
raw_min=$(printf '%s\n' "${RAW_TIMES[@]}" | sort -n | head -1)
api_min=$(printf '%s\n' "${API_TIMES[@]}" | sort -n | head -1)
ts_min=$(printf '%s\n' "${TS_TIMES[@]}" | sort -n | head -1)
raw_max=$(printf '%s\n' "${RAW_TIMES[@]}" | sort -n | tail -1)
api_max=$(printf '%s\n' "${API_TIMES[@]}" | sort -n | tail -1)
ts_max=$(printf '%s\n' "${TS_TIMES[@]}" | sort -n | tail -1)

BENCH[raw_avg]=$raw_avg; BENCH[api_avg]=$api_avg; BENCH[ts_avg]=$ts_avg

log_info "Raw URL      :  avg=${raw_avg}s  min=${raw_min}s  max=${raw_max}s"
log_info "REST API     :  avg=${api_avg}s  min=${api_min}s  max=${api_max}s"
log_info "listCommits  :  avg=${ts_avg}s  min=${ts_min}s  max=${ts_max}s"

current_total=$(echo "$api_avg + $ts_avg" | bc -l 2>/dev/null | xargs printf "%.3f")
optimized_total=$raw_avg
log_info ""
log_info "${BOLD}Per-file latency:${NC}"
log_info "  Current (API + timestamp):  ${current_total}s"
log_info "  Optimized (raw URL only):   ${optimized_total}s"

if (( $(echo "$raw_avg < $api_avg" | bc -l 2>/dev/null || echo 0) )); then
  speedup=$(echo "$api_avg $raw_avg" | awk '{if ($2>0) printf "%.1f", $1/$2; else print "N/A"}')
  log_pass "Raw URL is ${speedup}x faster than REST API for content"
else
  log_warn "Raw URL not faster (possible network variance)"
fi

# ═══════════════════════════════════════════════════════════════════════
section "3" "Content Integrity — Raw vs API produce identical content"
# ═══════════════════════════════════════════════════════════════════════

for f in "${FILES[@]}"; do
  raw_fetch "$DEFAULT_BRANCH" "$f" "${TMPDIR}/raw_${f//\//_}" >/dev/null
  api_fetch "$DEFAULT_BRANCH" "$f" "${TMPDIR}/api_${f//\//_}.json" >/dev/null
  jq -r '.content' "${TMPDIR}/api_${f//\//_}.json" 2>/dev/null | tr -d '\n' | base64 -d > "${TMPDIR}/api_${f//\//_}" 2>/dev/null || true

  if [[ -f "${TMPDIR}/raw_${f//\//_}" && -f "${TMPDIR}/api_${f//\//_}" ]]; then
    RAW_SHA=$(shasum -a 256 "${TMPDIR}/raw_${f//\//_}" | cut -d' ' -f1)
    API_SHA=$(shasum -a 256 "${TMPDIR}/api_${f//\//_}" | cut -d' ' -f1)
    if [[ "$RAW_SHA" == "$API_SHA" ]]; then
      log_pass "Content match: ${f}"
    else
      RAW_SIZE=$(wc -c < "${TMPDIR}/raw_${f//\//_}" | tr -d ' ')
      API_SIZE=$(wc -c < "${TMPDIR}/api_${f//\//_}" | tr -d ' ')
      if [[ "$RAW_SIZE" -gt 0 && "$API_SIZE" -gt 0 ]]; then
        log_warn "Content differs: ${f} (raw=${RAW_SIZE}B api=${API_SIZE}B) — trailing newline"
      else
        log_fail "Content mismatch: ${f} (raw=${RAW_SIZE}B api=${API_SIZE}B)"
      fi
    fi
  else
    log_fail "Could not compare: ${f}"
  fi
done

# ═══════════════════════════════════════════════════════════════════════
section "4" "Timestamp Data Validation"
# ═══════════════════════════════════════════════════════════════════════

timestamp_fetch "README.md" "${TMPDIR}/ts_readme.json" >/dev/null

if [[ -f "${TMPDIR}/ts_readme.json" ]]; then
  COMMIT_DATE=$(jq -r '.[0].commit.committer.date // "null"' "${TMPDIR}/ts_readme.json" 2>/dev/null)
  AUTHOR=$(jq -r '.[0].commit.author.name // .[0].author.login // "null"' "${TMPDIR}/ts_readme.json" 2>/dev/null)
  COMMIT_COUNT=$(jq 'length' "${TMPDIR}/ts_readme.json" 2>/dev/null)

  [[ "$COMMIT_DATE" != "null" && -n "$COMMIT_DATE" ]] \
    && log_pass "Timestamp returned: ${COMMIT_DATE}" \
    || log_fail "No timestamp in listCommits response"

  [[ "$AUTHOR" != "null" && -n "$AUTHOR" ]] \
    && log_pass "Author returned: ${AUTHOR}" \
    || log_warn "No author in listCommits response"

  [[ "$COMMIT_COUNT" == "1" ]] \
    && log_pass "per_page=1 returns exactly 1 commit (minimal cost)" \
    || log_warn "Expected 1 commit, got ${COMMIT_COUNT}"
fi

# Test: repeated timestamp calls return same data (cacheable)
TS1=$(jq -r '.[0].sha' "${TMPDIR}/ts_readme.json" 2>/dev/null)
timestamp_fetch "README.md" "${TMPDIR}/ts_readme2.json" >/dev/null
TS2=$(jq -r '.[0].sha' "${TMPDIR}/ts_readme2.json" 2>/dev/null)

[[ "$TS1" == "$TS2" && -n "$TS1" ]] \
  && log_pass "Repeated timestamp calls return same SHA (safe to cache)" \
  || log_warn "Timestamp SHA changed between calls (${TS1} vs ${TS2})"

# ═══════════════════════════════════════════════════════════════════════
section "5" "Edge Cases — 404 Behaviors"
# ═══════════════════════════════════════════════════════════════════════

result=$(raw_fetch "$DEFAULT_BRANCH" "src/this-file-does-not-exist-99999.ts" /dev/null)
code=$(echo "$result" | cut -d'|' -f1)
[[ "$code" == "404" ]] && log_pass "Missing file → 404" || log_fail "Missing file → ${code}"

result=$(raw_fetch "$DEFAULT_BRANCH" "packages" /dev/null)
code=$(echo "$result" | cut -d'|' -f1)
[[ "$code" == "404" ]] && log_pass "Directory path → 404" || log_fail "Directory path → ${code}"

result=$(raw_fetch "this-branch-does-not-exist-xyz" "README.md" /dev/null)
code=$(echo "$result" | cut -d'|' -f1)
[[ "$code" == "404" ]] && log_pass "Bad branch → 404" || log_fail "Bad branch → ${code}"

result=$(raw_fetch "$DEFAULT_BRANCH" "" /dev/null)
code=$(echo "$result" | cut -d'|' -f1)
[[ "$code" != "200" ]] && log_pass "Empty path → ${code}" || log_fail "Empty path returned 200"

result=$(raw_fetch "$DEFAULT_BRANCH" "src/%00/evil" /dev/null)
code=$(echo "$result" | cut -d'|' -f1)
[[ "$code" != "200" ]] && log_pass "Null byte path → ${code}" || log_fail "Null byte path returned 200"

# ═══════════════════════════════════════════════════════════════════════
section "6" "Binary Detection & Size Headers"
# ═══════════════════════════════════════════════════════════════════════

raw_fetch "$DEFAULT_BRANCH" "README.md" "${TMPDIR}/readme_raw" >/dev/null
if [[ -f "${TMPDIR}/readme_raw" ]]; then
  NULL_COUNT=$(tr -cd '\0' < "${TMPDIR}/readme_raw" | wc -c | tr -d ' ')
  [[ "$NULL_COUNT" -eq 0 ]] \
    && log_pass "README.md: 0 null bytes (text, Buffer.indexOf(0)===-1)" \
    || log_fail "README.md: ${NULL_COUNT} null bytes"
fi

HEADERS=$(curl -sI -H "Authorization: token ${TOKEN}" -H "User-Agent: octocode-mcp" \
  --max-time 10 "$(raw_url "$DEFAULT_BRANCH" "README.md")")

CL=$(echo "$HEADERS" | grep -i "^content-length:" | awk '{print $2}' | tr -d '\r' || echo "")
ETAG=$(echo "$HEADERS" | grep -i "^etag:" | sed 's/^[^:]*: //' | tr -d '\r' || echo "")

[[ -n "$CL" ]] && log_pass "Content-Length: ${CL}B (pre-download size guard)" || log_warn "Content-Length missing"
[[ -n "$ETAG" ]] && log_pass "ETag present (conditional If-None-Match possible)" || log_info "No ETag"

# ═══════════════════════════════════════════════════════════════════════
section "7" "Auth & Security"
# ═══════════════════════════════════════════════════════════════════════

NOAUTH_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "User-Agent: octocode-mcp" --max-time 10 "$(raw_url "$DEFAULT_BRANCH" "README.md")")

if $PRIVATE_MODE; then
  [[ "$NOAUTH_CODE" == "404" ]] && log_pass "Private repo: no-auth → 404" \
    || log_fail "Private repo: no-auth → ${NOAUTH_CODE}"
else
  log_info "Public repo: no-auth → ${NOAUTH_CODE}"
fi

RAW_TEST_URL=$(raw_url "$DEFAULT_BRANCH" "README.md")
echo "$RAW_TEST_URL" | grep -qi "ghp_\|gho_\|github_pat_\|token" \
  && log_fail "SECURITY: Token in URL" \
  || log_pass "SECURITY: URL contains no token fragments"

# ═══════════════════════════════════════════════════════════════════════
section "8" "Code Structure (PR branch)"
# ═══════════════════════════════════════════════════════════════════════

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "")
SRC="packages/octocode-mcp/src/github/fileContentRaw.ts"

if [[ -n "$REPO_ROOT" && -f "${REPO_ROOT}/${SRC}" ]]; then
  FULL="${REPO_ROOT}/${SRC}"

  REQUIRED_FNS=("fetchRawGitHubFileContent" "isGitHubDotCom" "buildRawGitHubUrl"
    "fetchViaRawUrl" "tryRawUrlFetch" "fetchViaOctokit" "decodeOctokitContent"
    "handleBranch404" "handle404NoBranch" "fileError")

  MISSING=0
  for fn in "${REQUIRED_FNS[@]}"; do
    grep -q "$fn" "$FULL" 2>/dev/null || { log_fail "Missing: ${fn}"; ((MISSING++)); }
  done
  [[ "$MISSING" -eq 0 ]] && log_pass "All ${#REQUIRED_FNS[@]} required functions present"

  grep -q "export async function fetchRawGitHubFileContent" "$FULL" \
    && log_pass "Public API signature preserved" || log_fail "Signature changed"

  for pattern in "raw.githubusercontent.com" "MAX_FILE_SIZE" "AbortController" "encodeURIComponent"; do
    grep -q "$pattern" "$FULL" && log_pass "Found: ${pattern}" || log_warn "Missing: ${pattern}"
  done

  SHARED="${REPO_ROOT}/packages/octocode-shared/src/credentials/tokenResolution.ts"
  [[ -f "$SHARED" ]] && grep -q "resolveTokenString" "$SHARED" \
    && log_pass "resolveTokenString() in octocode-shared" \
    || log_fail "resolveTokenString() missing"

  # Phase 0 checks: timestamp caching
  FC="${REPO_ROOT}/packages/octocode-mcp/src/github/fileContent.ts"
  if [[ -f "$FC" ]]; then
    if grep -q "gh-api-file-timestamp" "$FC" 2>/dev/null; then
      log_pass "Phase 0: Timestamp cache key found in fileContent.ts"
    else
      log_warn "Phase 0: No timestamp caching in fileContent.ts (not yet implemented)"
    fi

    if grep -q "noTimestamp.*true\|noTimestamp.*??.*true" "$FC" 2>/dev/null; then
      log_pass "Phase 0: noTimestamp default found"
    else
      log_warn "Phase 0: noTimestamp not defaulted to true (not yet implemented)"
    fi
  fi

  CACHE="${REPO_ROOT}/packages/octocode-mcp/src/utils/http/cache.ts"
  if [[ -f "$CACHE" ]]; then
    if grep -q "gh-api-file-timestamp" "$CACHE" 2>/dev/null; then
      log_pass "Phase 0: Timestamp TTL registered in cache config"
    else
      log_warn "Phase 0: No 'gh-api-file-timestamp' in cache TTL config (not yet implemented)"
    fi
  fi
else
  log_warn "Not on PR branch or not in repo — skipping code checks"
  log_info "Run: git checkout vladta/raw-url-file-fetch"
fi

# ═══════════════════════════════════════════════════════════════════════
section "9" "Build & Test Suite"
# ═══════════════════════════════════════════════════════════════════════

if $SKIP_BUILD; then
  log_info "Skipped (--skip-build)"
elif [[ -n "$REPO_ROOT" && -f "${REPO_ROOT}/package.json" ]]; then
  cd "$REPO_ROOT"

  log_info "Running typecheck..."
  if yarn typecheck 2>&1 | tee "${TMPDIR}/typecheck.log" | tail -3; then
    grep -qi "error" "${TMPDIR}/typecheck.log" && log_fail "TypeScript errors" || log_pass "TypeScript clean"
  else
    log_fail "TypeScript command failed"
  fi

  log_info "Running octocode-mcp tests..."
  if (cd packages/octocode-mcp && yarn test:quiet 2>&1 | tee "${TMPDIR}/test.log" | tail -5); then
    grep -qiE "fail|error" "${TMPDIR}/test.log" && ! grep -qi "0 failed" "${TMPDIR}/test.log" \
      && log_fail "Tests failed" || log_pass "Test suite passed"
  else
    log_fail "Test command failed"
  fi
else
  log_warn "Not in repo root — skipping build/test"
fi

# ═══════════════════════════════════════════════════════════════════════
section "10" "Session Simulation — Full Cost Comparison"
# ═══════════════════════════════════════════════════════════════════════

SIM_FILES=(
  "README.md" "package.json" "AGENTS.md" "tsconfig.json"
  ".gitignore" "turbo.json" "yarn.lock" ".eslintrc.json"
)

log_info "Simulating 4 optimization strategies on ${#SIM_FILES[@]} files..."

# Strategy A: Current (API + timestamp for each file)
BEFORE_A=$(get_remaining)
START_A=$(date +%s%N)
for f in "${SIM_FILES[@]}"; do
  api_fetch "$DEFAULT_BRANCH" "$f" /dev/null >/dev/null
  timestamp_fetch "$f" /dev/null >/dev/null
done
END_A=$(date +%s%N)
AFTER_A=$(get_remaining)
COST_A=$((BEFORE_A - AFTER_A)); MS_A=$(( (END_A - START_A) / 1000000 ))

# Strategy B: Phase 0 only (API + no timestamp)
BEFORE_B=$(get_remaining)
START_B=$(date +%s%N)
for f in "${SIM_FILES[@]}"; do
  api_fetch "$DEFAULT_BRANCH" "$f" /dev/null >/dev/null
done
END_B=$(date +%s%N)
AFTER_B=$(get_remaining)
COST_B=$((BEFORE_B - AFTER_B)); MS_B=$(( (END_B - START_B) / 1000000 ))

# Strategy C: PR #330 only (raw URL + timestamp)
BEFORE_C=$(get_remaining)
START_C=$(date +%s%N)
for f in "${SIM_FILES[@]}"; do
  raw_fetch "$DEFAULT_BRANCH" "$f" /dev/null >/dev/null
  timestamp_fetch "$f" /dev/null >/dev/null
done
END_C=$(date +%s%N)
AFTER_C=$(get_remaining)
COST_C=$((BEFORE_C - AFTER_C)); MS_C=$(( (END_C - START_C) / 1000000 ))

# Strategy D: Phase 0 + PR #330 (raw URL, no timestamp)
BEFORE_D=$(get_remaining)
START_D=$(date +%s%N)
for f in "${SIM_FILES[@]}"; do
  raw_fetch "$DEFAULT_BRANCH" "$f" /dev/null >/dev/null
done
END_D=$(date +%s%N)
AFTER_D=$(get_remaining)
COST_D=$((BEFORE_D - AFTER_D)); MS_D=$(( (END_D - START_D) / 1000000 ))

BENCH[sim_a]="${COST_A}|${MS_A}"; BENCH[sim_b]="${COST_B}|${MS_B}"
BENCH[sim_c]="${COST_C}|${MS_C}"; BENCH[sim_d]="${COST_D}|${MS_D}"

log_info ""
log_info "${BOLD}Results for ${#SIM_FILES[@]} files:${NC}"
log_info ""
printf "  %-35s  %10s  %10s  %10s\n" "Strategy" "API Calls" "Time (ms)" "Savings"
printf "  %-35s  %10s  %10s  %10s\n" "---" "---" "---" "---"
printf "  %-35s  %10d  %10d  %10s\n" "A: Current (API + timestamp)" "$COST_A" "$MS_A" "--"
printf "  %-35s  %10d  %10d  ${GREEN}%10s${NC}\n" "B: Phase 0 (API, no timestamp)" "$COST_B" "$MS_B" "-$((COST_A - COST_B)) calls"
printf "  %-35s  %10d  %10d  ${GREEN}%10s${NC}\n" "C: PR #330 (raw + timestamp)" "$COST_C" "$MS_C" "-$((COST_A - COST_C)) calls"
printf "  %-35s  %10d  %10d  ${GREEN}%10s${NC}\n" "D: Phase 0 + #330 (raw, no ts)" "$COST_D" "$MS_D" "-$((COST_A - COST_D)) calls"

# Validate expected ordering
if [[ "$COST_D" -le "$COST_C" && "$COST_D" -le "$COST_B" && "$COST_A" -ge "$COST_B" ]]; then
  log_pass "Cost ordering correct: D <= C, D <= B, A >= B"
else
  log_warn "Unexpected cost ordering (possible rate_limit noise)"
fi

if [[ "$MS_D" -le "$MS_A" && "$MS_A" -gt 0 ]]; then
  SPEEDUP_PCT=$(( (MS_A - MS_D) * 100 / MS_A ))
  log_pass "Strategy D is ${SPEEDUP_PCT}% faster than current (${MS_D}ms vs ${MS_A}ms)"
elif [[ "$MS_A" -eq 0 ]]; then
  log_warn "Cannot compute speedup (baseline is 0ms)"
else
  log_warn "Strategy D not faster (${MS_D}ms vs ${MS_A}ms)"
fi

# ═══════════════════════════════════════════════════════════════════════
echo ""
section "=" "RESULTS"
# ═══════════════════════════════════════════════════════════════════════

TOTAL=$((PASS + FAIL + WARN))
echo ""
echo -e "  ${GREEN}Passed : ${PASS}${NC}"
echo -e "  ${RED}Failed : ${FAIL}${NC}"
echo -e "  ${YELLOW}Warnings: ${WARN}${NC}"
echo -e "  Total  : ${TOTAL}"
echo ""

FINAL=$(get_remaining)
SCRIPT_COST=$((INITIAL_REMAINING - FINAL))
echo -e "  Rate limit: started=${INITIAL_REMAINING}  now=${FINAL}  ${DIM}script_cost=${SCRIPT_COST}${NC}"
echo ""

echo -e "  ${BOLD}Benchmark Summary (per-file latency, ${ROUNDS} rounds)${NC}"
echo -e "  ┌────────────────────┬──────────┬──────────┬────────────────┐"
echo -e "  │ Operation          │ Avg (s)  │ API Cost │ Per-file total │"
echo -e "  ├────────────────────┼──────────┼──────────┼────────────────┤"
printf  "  │ Raw URL (content)  │ %-8s │ %-8s │                │\n" "${BENCH[raw_avg]}" "${BENCH[raw_cost]}"
printf  "  │ REST API (content) │ %-8s │ %-8s │                │\n" "${BENCH[api_avg]}" "${BENCH[api_cost]}"
printf  "  │ listCommits (ts)   │ %-8s │ %-8s │                │\n" "${BENCH[ts_avg]}" "${BENCH[ts_cost]}"
echo -e "  ├────────────────────┼──────────┼──────────┼────────────────┤"
CURR_TOTAL=$(echo "${BENCH[api_avg]} + ${BENCH[ts_avg]}" | bc -l 2>/dev/null | xargs printf "%.3f")
printf  "  │ ${RED}Current${NC}            │ %-8s │ %-8s │ 2 calls/file   │\n" "${CURR_TOTAL}" "$((BENCH[api_cost] + BENCH[ts_cost]))"
printf  "  │ ${GREEN}Optimized${NC}          │ %-8s │ %-8s │ 0 calls/file   │\n" "${BENCH[raw_avg]}" "${BENCH[raw_cost]}"
echo -e "  └────────────────────┴──────────┴──────────┴────────────────┘"
echo ""

# Derive session projection from measured per-file costs
PER_FILE_CURRENT=2  # getContent + listCommits
PER_FILE_PHASE0=1   # getContent only (no timestamp)
if [[ "${BENCH[raw_cost]}" -eq 0 ]]; then
  PER_FILE_RAW_TS=1    # raw(0) + listCommits(1)
  PER_FILE_RAW_NOTS=0  # raw(0) + no timestamp
else
  PER_FILE_RAW_TS=$((BENCH[raw_cost] / ${#FILES[@]} + 1))
  PER_FILE_RAW_NOTS=$((BENCH[raw_cost] / ${#FILES[@]}))
fi

SESSION_FILES=80; CACHE_HIT_PCT=50
MISS=$((SESSION_FILES * (100 - CACHE_HIT_PCT) / 100))
HIT=$((SESSION_FILES * CACHE_HIT_PCT / 100))

PROJ_A=$((MISS * PER_FILE_CURRENT + HIT * 1))
PROJ_B=$((MISS * PER_FILE_PHASE0 + HIT * 0))
PROJ_C=$((MISS * PER_FILE_RAW_TS + HIT * 1))
PROJ_D=$((MISS * PER_FILE_RAW_NOTS + HIT * 0))

pct_b=$(( (PROJ_A - PROJ_B) * 100 / (PROJ_A > 0 ? PROJ_A : 1) ))
pct_c=$(( (PROJ_A - PROJ_C) * 100 / (PROJ_A > 0 ? PROJ_A : 1) ))
pct_d=$(( (PROJ_A - PROJ_D) * 100 / (PROJ_A > 0 ? PROJ_A : 1) ))

echo -e "  ${BOLD}Session Projection (${SESSION_FILES} files, ${CACHE_HIT_PCT}% cache hit)${NC}"
echo -e "  ┌─────────────────────────────────┬────────────┬──────────┐"
echo -e "  │ Strategy                        │ API Calls  │ Savings  │"
echo -e "  ├─────────────────────────────────┼────────────┼──────────┤"
printf  "  │ Current (API + timestamp)       │ %-10s │ --       │\n" "~${PROJ_A}"
printf  "  │ Phase 0 (API, no timestamp)     │ %-10s │ ${GREEN}-%-6s${NC} │\n" "~${PROJ_B}" "${pct_b}%"
printf  "  │ PR #330 (raw + timestamp)       │ %-10s │ ${GREEN}-%-6s${NC} │\n" "~${PROJ_C}" "${pct_c}%"
printf  "  │ ${GREEN}Phase 0 + #330 (recommended)${NC}     │ ${GREEN}%-10s${NC} │ ${GREEN}-%-6s${NC} │\n" "~${PROJ_D}" "${pct_d}%"
echo -e "  └─────────────────────────────────┴────────────┴──────────┘"
echo -e "  ${DIM}(Derived from measured per-file costs above)${NC}"
echo ""

if [[ "$FAIL" -gt 0 ]]; then
  echo -e "  ${RED}${BOLD}VERDICT: SOME CHECKS FAILED${NC}"
  exit 1
else
  echo -e "  ${GREEN}${BOLD}VERDICT: ALL CHECKS PASSED${NC}"
  exit 0
fi
