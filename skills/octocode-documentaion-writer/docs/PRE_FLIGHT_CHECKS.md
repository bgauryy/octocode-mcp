# Pre-Flight Checks

> **Review this document to understand the validation steps that must pass before documentation generation begins.**

<pre_flight_gate>
**HALT. Complete these requirements before proceeding:**

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

**FORBIDDEN until gate passes:**
- Any agent spawning
- Workspace initialization
</pre_flight_gate>

## Detailed Instructions

Before starting, validate the repository path and check for edge cases.

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
