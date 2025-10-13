# 🧪 Octocode Vibe Plugin - Testing Guide

Complete testing procedures to ensure the plugin works correctly before deployment.

---

## 📋 Pre-Testing Checklist

Before running tests, verify:

- [ ] Claude Code version >= 1.0.0 installed
- [ ] Node.js version >= 18.0.0 installed (for MCP servers)
- [ ] Git repository initialized in test project
- [ ] You have an Anthropic API key configured

---

## 🔧 Installation Testing

### 1. Plugin Installation

**Test A: Local Installation**

```bash
cd /path/to/octocode-mcp/octocode-vibe-plugin
```

In Claude Code:
```
/plugin add .
/restart
```

**Expected Result:**
- ✅ Plugin appears in `/plugin list`
- ✅ No installation errors
- ✅ MCP servers start automatically (check logs)

**Verification:**
```
/plugin list
```
Should show "octocode" plugin with version 1.0.0

---

**Test B: GitHub Installation (when published)**

In Claude Code:
```
/plugin add bgauryy/octocode-mcp/octocode-vibe-plugin
/restart
```

**Expected Result:**
- ✅ Plugin downloads and installs
- ✅ Appears in plugin list

---

### 2. MCP Server Verification

**Test: Verify MCP Servers are Running**

```bash
# Check if octocode-mcp is accessible
claude --debug
```

Then in Claude Code:
```
List available MCP tools
```

**Expected Result:**
- ✅ octocode-mcp tools are listed (repository_search, get_file_contents, etc.)
- ✅ chrome-devtools-mcp tools listed (if installed)
- ✅ No MCP connection errors

**Troubleshooting:**
If MCP tools are missing:
```bash
# Manually install octocode-mcp
npx octocode-mcp@latest --help

# Check MCP server logs
cat ~/.claude/logs/mcp-*.log
```

---

## 🤖 Agent Testing

### 3. Individual Agent Tests

**Test each agent independently using the Task tool:**

#### Test A: agent-product

In Claude Code:
```
Use the agent-product agent to create a PRD for a simple todo app
```

**Expected Behavior:**
- ✅ Agent asks clarifying questions
- ✅ Creates documents in `.octocode/requirements/`
- ✅ Logs decisions to `.octocode/debug/agent-decisions.json`
- ✅ Presents Gate 1 approval

**Files to Check:**
- `.octocode/requirements/prd.md`
- `.octocode/requirements/features.md`
- `.octocode/requirements/user-stories.md`
- `.octocode/debug/agent-decisions.json`

---

#### Test B: agent-architect

In Claude Code (after agent-product):
```
Use the agent-architect agent to design the architecture based on the PRD
```

**Expected Behavior:**
- ✅ Reads requirements from `.octocode/requirements/`
- ✅ Performs critical thinking (self-questioning, devil's advocate)
- ✅ Evaluates 3+ alternatives for major decisions
- ✅ Creates design documents in `.octocode/designs/`
- ✅ Logs all decisions with reasoning
- ✅ Presents Gate 2A

**Files to Check:**
- `.octocode/designs/architecture.md`
- `.octocode/designs/tech-stack.md`
- `.octocode/designs/database-schema.md`
- `.octocode/designs/api-design.md`
- `.octocode/debug/agent-decisions.json` (architecture decisions)

---

#### Test C: agent-ux (Parallel with architect)

In Claude Code:
```
Launch agent-architect and agent-ux in parallel for the todo app
```

**Expected Behavior:**
- ✅ Both agents run simultaneously
- ✅ Agents communicate with each other
- ✅ UX creates documents in `.octocode/ux/`
- ✅ Frontend architecture aligns with backend
- ✅ Combined Gate 2 presentation

**Files to Check:**
- `.octocode/ux/user-flows.md`
- `.octocode/ux/wireframes.md`
- `.octocode/ux/component-library.md`
- `.octocode/ux/design-system.md`
- `.octocode/debug/communication-log.md` (agent coordination)

---

#### Test D: agent-design-verification

In Claude Code:
```
Use agent-design-verification to validate the design and create task breakdown
```

**Expected Behavior:**
- ✅ Validates all requirements covered
- ✅ Checks architecture soundness
- ✅ Creates comprehensive task breakdown
- ✅ Identifies file dependencies
- ✅ Marks parallel opportunities
- ✅ Presents Gate 3

**Files to Check:**
- `.octocode/tasks.md`
- File dependencies correctly identified
- Parallelization opportunities marked

---

#### Test E: agent-research-context

In Claude Code:
```
Use agent-research-context to research implementation patterns for the tech stack
```

**Expected Behavior:**
- ✅ Searches GitHub using octocode-mcp
- ✅ Finds 5-10 high-quality repositories
- ✅ Extracts code examples
- ✅ Creates context guides in `.octocode/context/`
- ✅ Logs all research queries

**Files to Check:**
- `.octocode/context/*.md` (pattern guides)
- `.octocode/debug/research-queries.json`
- Code examples are copy-paste ready

---

#### Test F: agent-manager

In Claude Code:
```
Use agent-manager to orchestrate implementation tasks
```

**Expected Behavior:**
- ✅ Reads task breakdown from `.octocode/tasks.md`
- ✅ Analyzes file dependencies
- ✅ Creates execution plan
- ✅ Manages file locks (`.octocode/locks.json`)
- ✅ Spawns multiple agent-implementation instances
- ✅ Monitors progress
- ✅ Presents Gate 4 (live dashboard)

**Files to Check:**
- `.octocode/locks.json`
- `.octocode/logs/progress-dashboard.md`
- `.octocode/execution-state.json` (updated in real-time)

---

#### Test G: agent-implementation

In Claude Code (via agent-manager):
```
Agents should be spawned by agent-manager automatically
```

**Expected Behavior:**
- ✅ Requests file locks before modifying
- ✅ Reads context from `.octocode/context/`
- ✅ Implements features following patterns
- ✅ Runs tests before reporting completion
- ✅ Logs implementation decisions
- ✅ Reports to agent-manager

**Verification:**
- Check that multiple agents run in parallel
- Verify no file conflicts occur
- Check `.octocode/debug/agent-decisions.json` for implementation decisions

---

#### Test H: agent-verification

In Claude Code:
```
Use agent-verification to verify the implementation
```

**Expected Behavior:**
- ✅ Runs build (`npm run build`)
- ✅ Runs all tests (`npm test`)
- ✅ Runs linting (`npm run lint`)
- ✅ Verifies all features implemented
- ✅ Performs static analysis
- ✅ Tests runtime with chrome-devtools-mcp
- ✅ Creates verification report
- ✅ Presents Gate 5

**Files to Check:**
- `.octocode/verification-report.md`
- Build passes
- All tests pass
- No critical issues

---

## 🚪 Gate Testing

### 4. Human Approval Gates

**Test each gate's approval flow:**

#### Gate 1: Requirements Approval

After agent-product completes:

**Expected Prompt:**
```
📋 REQUIREMENTS REVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Requirements gathering complete!

Your options:
  [1] ✅ Approve - Continue to architecture design
  [2] 📝 Modify - Request changes to requirements
  [3] ❓ Ask Questions - Clarify specific points
  [4] 📖 Review Documents - Read full PRD before deciding

Your choice:
```

**Test Cases:**
- ✅ Approve → Should continue to Phase 2
- ✅ Modify → Should allow requirement changes
- ✅ Ask Questions → Should respond to questions
- ✅ Review Documents → Should show PRD contents

---

#### Gate 2: Architecture & UX Approval

After agent-architect and agent-ux complete:

**Expected Prompt:**
```
🏗️  ARCHITECTURE & UX REVIEW
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Backend architecture and UX design complete!

Your options:
  [1] ✅ Approve - Continue to design validation
  [2] 📝 Modify Backend - Request architecture changes
  [3] 🎨 Modify UX - Request UX changes
  ...
```

**Test Cases:**
- ✅ Approve → Should continue to Phase 3
- ✅ Modify Backend → Should allow architecture changes
- ✅ Modify UX → Should allow UX changes

---

#### Gate 3: Task Breakdown Approval

**Test:** Approve task breakdown with modifications

---

#### Gate 4: Live Implementation Monitoring

**Expected Prompt:**
```
⚡ IMPLEMENTATION IN PROGRESS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Progress: [████████████░░░░░░░░░░░] 65% (23/35 tasks)

Controls:
  [1] ⏸️  Pause - Stop all agents, save state
  [2] 📊 Details - See detailed task status
  ...
```

**Test Cases:**
- ✅ Dashboard updates in real-time
- ✅ Pause functionality works
- ✅ Resume functionality works

---

#### Gate 5: Final Verification

**Test:** Final deliverable approval

---

## 🪝 Hooks Testing

### 5. Hook Execution Tests

#### Test A: SessionStart Hook

**Test:**
```bash
# Create a fake state file
mkdir -p .octocode
echo '{"currentPhase":"implementation","timestamp":"2025-10-13T12:00:00Z"}' > .octocode/execution-state.json

# Start a new Claude Code session
claude
```

**Expected Output:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Previous Octocode-Vibe Session Detected

Last Phase: implementation
Last Update: 2025-10-13T12:00:00Z

💡 To resume: Use '/octocode-generate --resume' command
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Verification:**
- ✅ Hook detects previous state
- ✅ Shows resume instructions
- ✅ Doesn't block Claude Code if error

---

#### Test B: CheckpointState Hook

**Test:**
```
# In Claude Code, write to .octocode/execution-state.json
# Hook should automatically create backup
```

**Expected Result:**
- ✅ Backup created in `.octocode/.backups/`
- ✅ Timestamped backup file exists
- ✅ Only last 10 backups kept
- ✅ `latest.json` symlink points to most recent

**Verification:**
```bash
ls -la .octocode/.backups/
```

---

#### Test C: LogProgress Hook

**Test:** TodoWrite operations trigger logging

**Expected Result:**
- ✅ Logs created in `.octocode/logs/todo-history.log`
- ✅ Timestamps recorded
- ✅ Log size limited to 1000 lines

---

#### Test D: ValidateChanges Hook

**Test:** Edit an agent file with invalid frontmatter

**Expected Result:**
- ✅ Hook validates frontmatter
- ✅ Warns about missing fields
- ✅ Doesn't block the edit (warning only)

---

#### Test E: SessionEnd Hook

**Test:** End Claude Code session

**Expected Result:**
- ✅ Final checkpoint created
- ✅ Session summary created
- ✅ Message with resume instructions

---

#### Test F: PromptSubmit Hook

**Test:** Submit `/octocode-generate` command

**Expected Result:**
- ✅ Hook detects command
- ✅ Checks for `--resume` flag
- ✅ Validates state file if resuming

---

### 6. Hook Error Handling

**Test: Hook Failures Don't Block Claude Code**

```bash
# Corrupt a hook script temporarily
echo "exit 1" >> .claude-plugin/hooks/scripts/checkpoint-state.sh

# Try to use Claude Code
# Should see warning but continue working
```

**Expected:**
- ✅ Warning message displayed: "⚠️ Checkpoint hook error (non-blocking)"
- ✅ Claude Code continues normally
- ✅ No execution blocked

---

## 🎯 End-to-End Testing

### 7. Complete Workflow Test

**Test: Full project generation from start to finish**

```
/octocode-generate Build a simple todo app with React frontend and Express backend
```

**Phase 1: Requirements** (~5 minutes)
- ✅ Agent asks clarifying questions
- ✅ Creates PRD documents
- ✅ Gate 1 approval presented

**Phase 2: Architecture & UX** (~10 minutes)
- ✅ Both agents run in parallel
- ✅ Agents coordinate on framework selection
- ✅ Architecture and UX docs created
- ✅ Combined Gate 2 presented

**Phase 3: Validation** (~3 minutes)
- ✅ Design validated
- ✅ Task breakdown created
- ✅ File dependencies identified
- ✅ Gate 3 presented

**Phase 4: Research** (~5 minutes)
- ✅ Context guides created
- ✅ Code examples extracted
- ✅ Research logged

**Phase 5-6: Implementation** (~20-40 minutes)
- ✅ Multiple agents work in parallel
- ✅ File locking prevents conflicts
- ✅ Progress dashboard updates
- ✅ Tests run on each task
- ✅ Gate 4 monitoring works

**Phase 7: Verification** (~5 minutes)
- ✅ Build passes
- ✅ All tests pass
- ✅ Runtime tested in Chrome
- ✅ Verification report created
- ✅ Gate 5 presented

**Final Verification:**
```bash
# Check all output files exist
ls -R .octocode/

# Expected structure:
# .octocode/
#   ├── requirements/
#   ├── designs/
#   ├── ux/
#   ├── context/
#   ├── tasks.md
#   ├── logs/
#   ├── debug/
#   ├── execution-state.json
#   ├── locks.json
#   └── verification-report.md
```

---

### 8. Resume Functionality Test

**Test: Resume from checkpoint**

```bash
# After Phase 3, simulate interruption
# (manually stop or kill Claude Code session)

# Restart Claude Code
claude

# Should see session-start hook notification

# Resume
/octocode-generate --resume
```

**Expected Behavior:**
- ✅ Hook detects previous state
- ✅ Loads from `.octocode/execution-state.json`
- ✅ Continues from last phase
- ✅ No duplicate work

---

## 🐛 Debugging Tests

### 9. Debug Mode

**Test: Enable debug logging**

```bash
export CLAUDE_DEBUG=true
claude
```

**Expected:**
- ✅ Hooks show `[DEBUG]` messages
- ✅ More verbose logging
- ✅ Helps troubleshoot issues

---

### 10. Error Recovery

**Test various failure scenarios:**

#### Test A: Agent Failure

```
# Simulate agent error
# (provide impossible requirements)
```

**Expected:**
- ✅ Agent reports error
- ✅ Doesn't crash entire workflow
- ✅ User can retry or modify

---

#### Test B: MCP Server Unavailable

```bash
# Stop octocode-mcp server
# Try to use agent-research-context
```

**Expected:**
- ✅ Agent detects MCP unavailable
- ✅ Falls back to WebSearch (if applicable)
- ✅ Provides warning to user

---

#### Test C: File Lock Timeout

```
# Simulate two agents trying to modify same file
```

**Expected:**
- ✅ Second agent waits for lock
- ✅ If timeout (30s), reports blocked
- ✅ Agent-manager handles reassignment

---

## 📊 Performance Testing

### 11. Parallel Execution

**Test: Verify parallelization works**

Monitor Phase 2 (architect + UX):
- ✅ Both agents run simultaneously
- ✅ Completion time ~50% faster than sequential

Monitor Phase 6 (implementation):
- ✅ 4-5 agents run in parallel
- ✅ File locks prevent conflicts
- ✅ Progress dashboard tracks all agents

---

### 12. Resource Usage

**Monitor during execution:**

```bash
# CPU usage
top -p $(pgrep -f claude)

# Memory usage
ps aux | grep claude

# MCP server resource usage
top -p $(pgrep -f octocode-mcp)
```

**Expected:**
- ✅ CPU usage reasonable (<80% sustained)
- ✅ Memory usage stable (no leaks)
- ✅ MCP servers responsive

---

## ✅ Final Checklist

Before considering plugin ready for release:

### Functionality
- [ ] All 8 agents work independently
- [ ] Agents can communicate with each other
- [ ] All 5 gates function correctly
- [ ] Parallel execution works (Phase 2, Phase 6)
- [ ] File locking prevents conflicts
- [ ] State persistence and resume work
- [ ] Complete end-to-end workflow succeeds

### Hooks
- [ ] All 6 hooks execute correctly
- [ ] Hooks don't block Claude Code on errors
- [ ] Session start detects previous state
- [ ] Checkpoint creates backups
- [ ] Session end creates summary

### MCP Integration
- [ ] octocode-mcp server connects
- [ ] Agents can use MCP tools
- [ ] chrome-devtools-mcp works (when installed)
- [ ] Graceful degradation when MCP unavailable

### Documentation
- [ ] README complete and accurate
- [ ] WORKFLOW_GUIDE explains all phases
- [ ] TECHNICAL_GUIDE helps contributors
- [ ] Agent documentation clear

### Error Handling
- [ ] Agent errors don't crash workflow
- [ ] Hook errors are non-blocking
- [ ] MCP unavailability handled
- [ ] File lock timeouts managed
- [ ] User gets helpful error messages

### Quality
- [ ] No hardcoded paths
- [ ] Environment variables used correctly
- [ ] Logs don't contain sensitive data
- [ ] File permissions correct on hook scripts
- [ ] .claudeignore excludes appropriate files

---

## 🆘 Troubleshooting

### Common Issues

**Issue: MCP tools not available**
```bash
# Solution: Check MCP server logs
cat ~/.claude/logs/mcp-octocode.log

# Manually test MCP server
npx octocode-mcp@latest
```

**Issue: Hooks not executing**
```bash
# Solution: Check permissions
chmod +x .claude-plugin/hooks/scripts/*.sh

# Test hook manually
bash .claude-plugin/hooks/scripts/session-start.sh
```

**Issue: Agent frontmatter errors**
```
# Solution: Validate YAML format
# Ensure tools are comma-separated: tools: Read, Write, Grep
```

**Issue: File lock conflicts**
```
# Solution: Check locks.json
cat .octocode/locks.json

# Verify agent-manager is handling locks
grep "lock" .octocode/logs/progress-dashboard.md
```

---

## 📝 Test Log Template

Use this template to record test results:

```markdown
# Test Run: [Date]

## Environment
- Claude Code version: _____
- Node.js version: _____
- OS: _____

## Test Results

### Installation
- [ ] PASS / FAIL: Plugin installs
- [ ] PASS / FAIL: MCP servers start
- Notes: _____

### Agents
- [ ] PASS / FAIL: agent-product
- [ ] PASS / FAIL: agent-architect
- [ ] PASS / FAIL: agent-ux
- [ ] PASS / FAIL: agent-design-verification
- [ ] PASS / FAIL: agent-research-context
- [ ] PASS / FAIL: agent-manager
- [ ] PASS / FAIL: agent-implementation
- [ ] PASS / FAIL: agent-verification
- Notes: _____

### Gates
- [ ] PASS / FAIL: Gate 1
- [ ] PASS / FAIL: Gate 2
- [ ] PASS / FAIL: Gate 3
- [ ] PASS / FAIL: Gate 4
- [ ] PASS / FAIL: Gate 5
- Notes: _____

### Hooks
- [ ] PASS / FAIL: session-start
- [ ] PASS / FAIL: checkpoint-state
- [ ] PASS / FAIL: log-progress
- [ ] PASS / FAIL: validate-changes
- [ ] PASS / FAIL: session-end
- [ ] PASS / FAIL: prompt-submit
- Notes: _____

### End-to-End
- [ ] PASS / FAIL: Complete workflow
- [ ] PASS / FAIL: Resume functionality
- Time to complete: _____ minutes
- Notes: _____

## Issues Found
1. _____
2. _____

## Recommendations
1. _____
2. _____
```

---

**Testing complete! 🎉**

If all tests pass, the plugin is ready for use.
