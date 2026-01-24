# Initialize Workspace

> **Review this document to understand the workspace initialization process before the documentation pipeline starts.**

<init_gate>
**STOP. Verify state before initialization.**

### Required Actions
1. **Define Directories** (`CONTEXT_DIR`, `DOC_DIR`)
2. **Handle Existing State**
   - **IF** `state.json` exists → **THEN** Prompt User to Resume
   - **IF** User says NO → **THEN** Reset state
3. **Create Directories**
4. **Initialize New State** (if not resuming)

**FORBIDDEN:**
- Starting Phase 1 before state is initialized.
</init_gate>

## Workspace Initialization

Before starting the pipeline, set up the working environment and handle any existing state.

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
