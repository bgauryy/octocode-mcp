# Setup & Initialization

> **Pre-flight validation and workspace setup before pipeline execution.**

This document covers the sequential flow that must complete before the documentation generation pipeline begins:
1. **Pre-Flight Checks** - Validate the repository path and detect edge cases
2. **Initialize Workspace** - Set up directories and handle existing state

---

## Pre-Flight Checks

Before starting, validate the repository path and check for edge cases.

<pre_flight_gate>
**HALT. Complete ALL checks before proceeding to initialization.**

### Required Checks
1. **Verify Path Existence**
   - **IF** `repository_path` missing → **THEN** ERROR & EXIT
2. **Verify Directory Status**
   - **IF** not a directory → **THEN** ERROR & EXIT
3. **Source Code Check**
   - **IF** < 3 source files → **THEN** WARN & Ask User (Exit if no)
4. **Build Directory Check**
   - **IF** contains `node_modules` or `dist` → **THEN** ERROR & EXIT
5. **Size Estimation**
   - **IF** > 200k LOC → **THEN** WARN & Ask User (Exit if no)

### FORBIDDEN Until Gate Passes
- Workspace initialization
- Any agent spawning
- Writing to any output directories
- Running static analysis

### ALLOWED
- Reading repository path
- Counting files
- Prompting user for confirmation
- Exiting with error codes

### On Failure
- IF path doesn't exist → Display error with path, EXIT code 1
- IF not a directory → Display error with path, EXIT code 1
- IF build directory detected → Display error explaining to use project root, EXIT code 1
- IF user declines to continue → EXIT code 0 (user-requested abort)
</pre_flight_gate>

### 1. Verify Path Existence
- Ensure `repository_path` exists.
- If not, raise an ERROR: "Repository path does not exist: " + path and EXIT.

### 2. Verify Directory Status
- Confirm `repository_path` is a directory.
- If not, raise an ERROR: "Path is not a directory: " + path and EXIT.

### 3. Source Code Check
- Count files ending in `.ts`, `.js`, `.py`, `.go`, or `.rs`.
- Exclude directories: `node_modules`, `.git`, `dist`, `build`.
- If fewer than 3 source files are found:
  - WARN: "Very few source files detected ({count}). This may not be a code repository."
  - Ask user: "Continue anyway? [y/N]"
  - If not confirmed, EXIT.

### 4. Build Directory Check
- Ensure the path does not contain `node_modules`, `dist`, or `build`.
- If it does, raise an ERROR: "Repository path appears to be a build directory. Please specify the project root." and EXIT.

### 5. Size Estimation
- Estimate the repository size.
- If larger than 200,000 LOC:
  - WARN: "Large repository detected (~{size} LOC)."
  - Ask user: "Continue anyway? [y/N]"
  - If not confirmed, EXIT.

---

## Initialize Workspace

Before starting the pipeline, set up the working environment and handle any existing state.

<init_gate>
**STOP. DO NOT proceed to Phase 1 without completing initialization.**

### Pre-Conditions
- [ ] Pre-flight checks passed (see above)
- [ ] Repository path is valid and accessible

### Required Actions
1. **Define Directories** (`CONTEXT_DIR`, `DOC_DIR`)
2. **Handle Existing State**
   - **IF** `state.json` exists AND phase NOT "complete"/"failed" → **THEN** Prompt User to Resume
   - **IF** User says NO → **THEN** Reset state
3. **Create Directories**
4. **Initialize New State** (if not resuming)

### FORBIDDEN Until Gate Passes
- Starting Phase 0 (Static Analysis)
- Spawning any agents
- Writing to documentation directory

### ALLOWED
- Reading existing state.json
- Prompting user for resume decision
- Creating directories

### On Failure
- IF directory creation fails → Check permissions, report error, EXIT
- IF state.json corrupted → Prompt user to reset or fix manually
- IF disk full → Report error, EXIT
</init_gate>

### 1. Define Directories
- Context Directory (`CONTEXT_DIR`): `${REPOSITORY_PATH}/.context`
- Documentation Directory (`DOC_DIR`): `${REPOSITORY_PATH}/documentation`

### 2. Handle Existing State
- Check if `${CONTEXT_DIR}/state.json` exists.
- If it exists and the phase is NOT "complete" or "failed":
  - **Prompt User**: "Found existing documentation generation in progress (phase: [PHASE]). Resume from last checkpoint? [Y/n]"
  - **If User Confirms (Yes)**:
    - Set `RESUME_MODE = true`
    - Set `START_PHASE` from the saved state.
  - **If User Declines (No)**:
    - **WARN**: "Restarting from beginning. Previous progress will be overwritten."
    - Set `RESUME_MODE = false`
    - Set `START_PHASE = "initialized"`
- If `state.json` does not exist or previous run finished/failed, start fresh (`RESUME_MODE = false`).

### 3. Create Directories
- Ensure `CONTEXT_DIR` exists (create if missing).
- Ensure `DOC_DIR` exists (create if missing).

### 4. Initialize New State (If NOT Resuming)
- Create a new `state.json` using the schema defined in `schemas/state-schema.json`.

---

## Critical Rules Summary

**REMEMBER:**

### Pre-Flight Rules
1. **ALWAYS** validate path before any other operation
2. **ALWAYS** warn user about edge cases (few files, large repos)
3. **NEVER** proceed if path is a build directory
4. **NEVER** silently fail - always display clear error messages

### Initialization Rules
1. **ALWAYS** check for existing state before starting fresh
2. **ALWAYS** prompt user before overwriting previous progress
3. **NEVER** start pipeline phases before initialization completes
4. **NEVER** silently overwrite existing documentation
