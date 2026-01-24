# Completion, Error Recovery & Helper Functions

> **Review this document to understand the completion flow, error recovery mechanisms, helper functions, and retry logic.**

## Completion

```javascript
update_state({
  phase: "complete",
  completed_at: new Date().toISOString(),
  current_agent: null
})

DISPLAY: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
DISPLAY: "✅ Documentation Complete!"
DISPLAY: ""
DISPLAY: "📁 Location: {DOC_DIR}/"
DISPLAY: "📊 QA Report: {DOC_DIR}/QA-SUMMARY.md"
DISPLAY: ""

if (parsed_qa && parsed_qa.overall_score):
  DISPLAY: "Quality Score: {parsed_qa.overall_score}/100 ({parsed_qa.quality_rating})"

  if (parsed_qa.overall_score >= 90):
    DISPLAY: "Status: Excellent ✅ - Ready for release"
  else if (parsed_qa.overall_score >= 75):
    DISPLAY: "Status: Good ✅ - Minor improvements recommended"
  else if (parsed_qa.overall_score >= 60):
    DISPLAY: "Status: Fair -️ - Address gaps before release"
  else:
    DISPLAY: "Status: Needs Work -️ - Major improvements required"

  if (parsed_qa.gaps && parsed_qa.gaps.length > 0):
    DISPLAY: ""
    DISPLAY: "Next Steps:"
    for (i = 0; i < Math.min(3, parsed_qa.gaps.length); i++):
      gap = parsed_qa.gaps[i]
      DISPLAY: "  {i+1}. {gap.fix}"

DISPLAY: ""
DISPLAY: "📝 Documentation Coverage:"
DISPLAY: "   {parsed_questions.summary.total_questions} questions researched"
DISPLAY: "   {parsed_qa.question_coverage.answered} questions answered in docs"
DISPLAY: ""
DISPLAY: "View documentation: {DOC_DIR}/index.md"
DISPLAY: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

EXIT code 0
```

---

## Error Recovery

If any agent fails critically:

```javascript
function handle_critical_failure(phase, error):
  DISPLAY: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  DISPLAY: "❌ Documentation Generation Failed"
  DISPLAY: ""
  DISPLAY: "Phase: {phase}"
  DISPLAY: "Error: {error.message}"
  DISPLAY: ""

  if (error.recoverable):
    DISPLAY: "This error is recoverable. Run /octocode-documentaion-writer again to resume."
    DISPLAY: "State saved in: {CONTEXT_DIR}/state.json"
  else:
    DISPLAY: "This error is not recoverable. Please check the error and try again."
    DISPLAY: "You may need to fix the issue before retrying."

  DISPLAY: ""
  DISPLAY: "Logs: {CONTEXT_DIR}/state.json"
  DISPLAY: "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  EXIT code 1
```

---

## Helper Functions

> **IMPORTANT: State Synchronization**
> Only the main orchestrator process should update `state.json`. Individual parallel agents
> (Discovery 1A-1D, Researchers, Writers) must NOT directly modify `state.json` to avoid
> race conditions. Parallel agents should only write to their designated partial result files
> in `partials/<phase>/<task_id>.json`. The orchestrator aggregates these results and updates
> `state.json` after all parallel agents complete.

```javascript
// NOTE: This function should ONLY be called by the main orchestrator process,
// never by parallel sub-agents. Parallel agents use save_partial_result() instead.
function update_state(updates):
  current_state = Read(CONTEXT_DIR + "/state.json")
  parsed = JSON.parse(current_state)

  for key, value in updates:
    parsed[key] = value

  Write(CONTEXT_DIR + "/state.json", JSON.stringify(parsed, null, 2))

function estimate_repo_size(path):
  // Quick estimate: count source files
  files = count_files(path, ["*.ts", "*.js", "*.py", "*.go", "*.rs", "*.java"], excludeDir=["node_modules", ".git", "dist", "build"])
  // Assume ~200 LOC per file average
  return files * 200

function count_files(path, patterns, excludeDir):
  // Use localFindFiles MCP tool (mcp__octocode__localFindFiles)
  // Return count of matching files
```

---

## Retry & Data Preservation Logic

**CRITICAL**: Never lose partial work. All agents support retry with state preservation.

```javascript
const RETRY_CONFIG = {
  discovery_analysis: { max_attempts: 3, backoff_ms: 2000 },
  engineer_questions: { max_attempts: 3, backoff_ms: 2000 },
  research:           { max_attempts: 3, backoff_ms: 3000 },
  orchestrator:       { max_attempts: 3, backoff_ms: 2000 },
  documentation:      { max_attempts: 3, backoff_ms: 5000 },  // per writer
  qa:                 { max_attempts: 2, backoff_ms: 1000 }
}

// === RETRY WRAPPER FOR ALL AGENTS ===
function retry_agent(phase_name, agent_fn, options = {}):
  config = RETRY_CONFIG[phase_name]
  state = get_retry_state(phase_name)

  while (state.attempts < config.max_attempts):
    state.attempts++
    update_retry_state(phase_name, state)

    DISPLAY: `⟳ ${phase_name} attempt ${state.attempts}/${config.max_attempts}`

    try:
      result = agent_fn(options)

      // Success - clear retry state
      clear_retry_state(phase_name)
      return { success: true, result }

    catch (error):
      state.last_error = error.message
      update_retry_state(phase_name, state)

      DISPLAY: `⚠️ ${phase_name} failed: ${error.message}`

      if (state.attempts < config.max_attempts):
        DISPLAY: `   Retrying in ${config.backoff_ms}ms...`
        sleep(config.backoff_ms * state.attempts)  // Exponential backoff
      else:
        DISPLAY: `❌ ${phase_name} exhausted all ${config.max_attempts} attempts`
        return { success: false, error, attempts: state.attempts }

  return { success: false, error: state.last_error, attempts: state.attempts }

// === PARALLEL AGENT RETRY (for Discovery, Research, Writers) ===
function retry_parallel_agents(phase_name, agent_tasks, options = {}):
  config = RETRY_CONFIG[phase_name]
  results = {}
  failed_tasks = []

  // First attempt - run all in parallel
  parallel_results = Task_Parallel(agent_tasks)

  for (task_id, result) in parallel_results:
    if (result.success):
      results[task_id] = result
      save_partial_result(phase_name, task_id, result)
    else:
      failed_tasks.push({ id: task_id, task: agent_tasks[task_id], attempts: 1 })

  // Retry failed tasks individually
  for failed in failed_tasks:
    while (failed.attempts < config.max_attempts):
      failed.attempts++
      DISPLAY: `⟳ Retrying ${phase_name}/${failed.id} (attempt ${failed.attempts}/${config.max_attempts})`

      try:
        result = Task(failed.task)
        if (result.success):
          results[failed.id] = result
          save_partial_result(phase_name, failed.id, result)
          break
      catch (error):
        DISPLAY: `⚠️ ${phase_name}/${failed.id} failed: ${error.message}`
        if (failed.attempts < config.max_attempts):
          sleep(config.backoff_ms * failed.attempts)

    if (failed.attempts >= config.max_attempts && !results[failed.id]):
      DISPLAY: `❌ ${phase_name}/${failed.id} failed after ${config.max_attempts} attempts`
      // Load any partial result saved during attempts
      results[failed.id] = load_partial_result(phase_name, failed.id) || { success: false, partial: true }

  return results

// === PARTIAL RESULT PRESERVATION ===
// Uses atomic writes to prevent corruption from concurrent access
function save_partial_result(phase_name, task_id, result):
  partial_dir = CONTEXT_DIR + "/partials/" + phase_name
  mkdir_p(partial_dir)

  target_path = partial_dir + "/" + task_id + ".json"
  temp_path = partial_dir + "/" + task_id + ".json.tmp." + random_uuid()

  // Atomic write: write to temp file, then rename (rename is atomic on POSIX)
  Write(temp_path, JSON.stringify(result))
  rename(temp_path, target_path)  // Atomic operation

function load_partial_result(phase_name, task_id):
  path = CONTEXT_DIR + "/partials/" + phase_name + "/" + task_id + ".json"
  if (exists(path)):
    return JSON.parse(Read(path))
  return null

function load_all_partial_results(phase_name):
  partial_dir = CONTEXT_DIR + "/partials/" + phase_name
  if (!exists(partial_dir)):
    return {}
  files = list_files(partial_dir, "*.json")
  results = {}
  for file in files:
    task_id = file.replace(".json", "")
    results[task_id] = JSON.parse(Read(partial_dir + "/" + file))
  return results

// === RETRY STATE MANAGEMENT ===
function get_retry_state(phase_name):
  state = Read(CONTEXT_DIR + "/state.json")
  parsed = JSON.parse(state)
  return parsed.retry_state?.[phase_name] || { attempts: 0 }

function update_retry_state(phase_name, retry_state):
  update_state({
    retry_state: {
      ...current_state.retry_state,
      [phase_name]: retry_state
    }
  })

function clear_retry_state(phase_name):
  state = JSON.parse(Read(CONTEXT_DIR + "/state.json"))
  if (state.retry_state):
    delete state.retry_state[phase_name]
    Write(CONTEXT_DIR + "/state.json", JSON.stringify(state, null, 2))
```

### Phase-Specific Retry Behavior

| Phase | Retry Strategy | Partial Data Preserved |
|-------|----------------|------------------------|
| **Discovery** | Retry failed sub-agents (1A-1D) individually | `partials/discovery/*.json` |
| **Questions** | Retry entire phase | Previous `questions.json` kept until success |
| **Research** | Retry failed batches only | `partials/research/batch-*.json` |
| **Orchestrator** | Retry entire phase | Previous `work-assignments.json` kept |
| **Writers** | Retry failed writers only | `partials/writers/writer-*.json` + completed files |
| **QA** | Retry failed validators only | `partials/qa/validator-*.json` |

### Critical Data Protection Rules

```javascript
// RULE 1: Never overwrite successful output until new output is validated
function safe_write_output(path, content):
  backup_path = path + ".backup"
  if (exists(path)):
    copy(path, backup_path)

  try:
    Write(path, content)
    validate_json(path)  // Ensure valid JSON
    delete(backup_path)  // Only delete backup after validation
  catch (error):
    // Restore from backup
    if (exists(backup_path)):
      copy(backup_path, path)
    throw error

// RULE 2: Aggregate partial results even on failure
// Uses file locking to prevent race conditions during aggregation
function aggregate_with_partials(phase_name, new_results):
  lock_file = CONTEXT_DIR + "/partials/" + phase_name + "/.aggregate.lock"

  // Acquire exclusive lock before aggregation
  lock_fd = acquire_file_lock(lock_file, timeout_ms=5000)
  if (!lock_fd):
    throw new Error("Failed to acquire lock for aggregation: " + phase_name)

  try:
    existing = load_all_partial_results(phase_name)
    merged = { ...existing, ...new_results }
    return merged
  finally:
    release_file_lock(lock_fd)
    delete(lock_file)

// RULE 3: Resume-aware execution
function should_skip_task(phase_name, task_id):
  partial = load_partial_result(phase_name, task_id)
  return partial?.success === true
```
