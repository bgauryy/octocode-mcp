# Octocode CLI UX & Logic Audit

**Date:** January 5, 2026
**Subject:** Analysis of octocode-cli Agent Logic, UX, and Data Visibility
**Scope:** `packages/octocode-cli`

## 🚨 Critical Findings

### 1. "RATE AGENT!" (Missing Feature)
*   **Status:** ❌ **MISSING**
*   **Analysis:** There is **no functionality** to rate, score, or provide feedback on the agent's performance in the current codebase.
*   **Locations Checked:**
    *   `src/ui/chat/ChatView.tsx` (Command handling)
    *   `src/ui/agent-ink/AgentView.tsx`
    *   `src/ui/chat/useChat.ts`
    *   `src/features/agent-loop/unified-loop.ts`

### 2. Chat UX & "Can't go back and scroll"
*   **Issue:** Native terminal scrolling is disabled because the CLI uses `Ink` (React for CLI) which takes over the entire screen (`alternateScreen`).
*   **Current Implementation:**
    *   Scrolling is implemented via keyboard shortcuts ONLY (`PageUp`, `PageDown`, `ArrowKeys`).
    *   **Limitation:** It only keeps the last **100 messages** in the render window (`MESSAGES_WINDOW_SIZE = 100` in `ChatView.tsx`).
    *   **User Pain:** Mouse wheel scrolling and standard terminal scrollbars **do not work**. If the user forgets the keyboard shortcuts or if focus is lost, they are stuck.
*   **Code Reference:** `packages/octocode-cli/src/ui/chat/ChatView.tsx`

### 3. "How can see data??" (Data Visibility)
*   **Issue:** The UI actively **hides/truncates data**.
*   **Evidence:**
    *   `MessageBubble.tsx` applies `truncateText` to tool results and thinking blocks.
    *   **Tool Results:** Truncated to ~500-1000 characters (configurable via `maxToolResultLength`).
    *   **Thinking:** Truncated to ~1000 characters.
*   **Consequence:** Users cannot see the full output of large file reads, long reasoning chains, or extensive grep results. There is no "expand" button in the terminal UI.
*   **Code Reference:** `packages/octocode-cli/src/ui/chat/MessageBubble.tsx`

### 4. Logic & Blocking ("Is something blocked??")
*   **Blocking Logic:**
    *   **Research Mode:** The agent is strictly blocked from writing or executing code. It uses `RESEARCH_TOOLS` which only contains `Read`, `Glob`, `ListDir`, and `Grep`.
    *   **Coding Mode:** All tools are available (`CODING_TOOLS`), including `Write`, `Edit`, `Bash`.
*   **Permission System:**
    *   While `AGENTS.md` mentions "Interactive approval", the `unified-loop.ts` relies on the tool definitions to handle blocking.
    *   Blocking is primarily enforced by the **selection of tools** passed to the agent loop (`RESEARCH_TOOLS` vs `CODING_TOOLS`).
*   **Code Reference:** `packages/octocode-cli/src/features/tools/index.ts`

---

## 📂 Codebase Analysis

### Chat Interface (`src/ui/chat/`)
- **`ChatView.tsx`**: Main component. Handles keyboard input for scrolling. Defines `MESSAGES_WINDOW_SIZE` (100).
- **`MessageBubble.tsx`**: Renders messages. Contains the `truncateText` function that hides data.
- **`useChat.ts`**: Manages state. Stores full message history in memory, but the View slices it for rendering.

### Agent Logic (`src/features/`)
- **`agent-loop/unified-loop.ts`**: The core loop using Vercel AI SDK. It accepts a `tools` object.
- **`tools/index.ts`**: Defines toolsets.
    - `RESEARCH_TOOLS`: Read-only.
    - `CODING_TOOLS`: Full access.

### UX Issues Summary
1.  **Navigation:** Reliance on keyboard shortcuts (`PgUp`/`PgDn`) without visual cues or native scroll support is unintuitive for many users.
2.  **Transparency:** Aggressive truncation makes it impossible to verify what the agent actually read or thought.
3.  **Feedback:** No feedback loop (rating) to improve the agent.

---

## 📋 Recommendations

1.  **Fix Scrolling/Data Visibility:**
    - Add a command (e.g., `/export` or `/log`) to dump the full chat history to a file so users can read truncated data.
    - Consider an "inspect" mode to view full message content.

2.  **Add Rate Agent:**
    - Implement a simple rating prompt (1-5 stars + text) at the end of a session (`/exit` or completion).
    - Store this rating in the session database.

3.  **Improve UX:**
    - Add visual cues for scrolling (e.g., "Press PgUp to scroll") to the status bar permanently.
    - Increase the `MESSAGES_WINDOW_SIZE` or allow it to be configurable.

---

## 🔴 DETAILED UX AUDIT - COMPREHENSIVE ISSUES

**Audit Date:** January 5, 2026 (Extended Analysis)

---

## 📜 SCROLLING/NAVIGATION ISSUES (CAN'T GO BACK AND SCROLL)

### **ISSUE #1: Arrow Keys Stolen by Input** ❌ CRITICAL

**Files:** `src/ui/chat/ChatInput.tsx:52-74`, `src/ui/chat/ChatView.tsx:100-134`

**Problem:** Arrow keys in `ChatInput` handle history navigation:
```typescript
// ChatInput.tsx:58-74
} else if (key.upArrow) {
  // Navigate history up
  if (history.length > 0) {
    const newIndex = Math.min(historyIndex + 1, history.length - 1);
    setHistoryIndex(newIndex);
    setValue(history[history.length - 1 - newIndex] || '');
  }
} else if (key.downArrow) {
  // Navigate history down
  ...
}
```

BUT `ChatView` ALSO uses arrow keys for scrolling:
```typescript
// ChatView.tsx:110-118
if (key.upArrow) {
  setScrollOffset(prev =>
    Math.min(prev + 1, Math.max(0, state.messages.length - 1))
  );
}
if (key.downArrow) {
  setScrollOffset(prev => Math.max(prev - 1, 0));
}
```

**These CONFLICT!** When input is focused (always in chat), **user CAN'T scroll** because input steals the keystrokes.

---

### **ISSUE #2: Scroll Window Hardcoded to 100 Messages** ❌

**File:** `src/ui/chat/ChatView.tsx:76`

```typescript
const MESSAGES_WINDOW_SIZE = 100;
```

**Problem:** Can only view the **last 100 messages**. Long research sessions lose history visibility entirely.

---

### **ISSUE #3: Scroll Logic Limits Visibility** ⚠️

**File:** `src/ui/chat/ChatView.tsx:352-357`

```typescript
state.messages
  .slice(
    Math.max(0, state.messages.length - MESSAGES_WINDOW_SIZE - scrollOffset),
    state.messages.length - scrollOffset || undefined
  )
```

**Problem:** The slice logic limits to `MESSAGES_WINDOW_SIZE`, so you can't scroll back to the beginning of a long conversation even if messages exist.

---

## 👁️ DATA VISIBILITY ISSUES (WHAT USER SEE / HOW CAN SEE DATA)

### **ISSUE #4: Tool Results DISAPPEAR After 1 Second** ❌ CRITICAL

**File:** `src/ui/chat/useChat.ts:246-250`

```typescript
// Remove completed tool calls after a delay
setTimeout(() => {
  setCurrentToolCalls(prev =>
    prev.filter(tc => tc.id !== id || tc.status === 'running')
  );
}, 1000);
```

**Problem:** Tool results vanish from the active display! Users can't see **WHAT the AI actually found**. The `ToolCallDisplay` only shows running tools, not their results.

---

### **ISSUE #5: Tool Message Matching Is Broken** ❌

**File:** `src/ui/chat/useChat.ts:229-243`

```typescript
// Update the message with result
if (result || error) {
  setMessages(prev =>
    prev.map(msg =>
      msg.role === 'tool' && msg.content.includes(id.split('_')[1] || id)
        ? {
            ...msg,
            toolResult: result || error,
            content: error
              ? `❌ ${msg.toolName} failed`
              : `✓ ${msg.toolName}`,
          }
        : msg
    )
  );
}
```

**Problem:** Uses `id.split('_')[1]` to find tool messages - this is **fragile string matching** and can fail to associate results with the correct tool message.

---

### **ISSUE #6: Tool Args Truncated Without Expand Option** ⚠️

**File:** `src/ui/agent-ink/AgentView.tsx:190-206`

```typescript
function formatToolArgs(
  args: Record<string, unknown> | undefined,
  maxChars: number = 1000
): string {
  if (!args) return '';
  try {
    const str = JSON.stringify(args);
    if (str.length <= maxChars) return str;
    const truncated = str.length - maxChars;
    return (
      str.slice(0, maxChars) +
      `... [${truncated.toLocaleString()} chars truncated]`
    );
  } catch {
    return '[Unable to display args]';
  }
}
```

**Problem:** Complex search queries get truncated to 1000 chars. **No way to see full args or expand.**

---

### **ISSUE #7: Thinking Blocks Hidden by Default Toggle** ⚠️

**Files:** `src/ui/chat/types.ts`, `src/ui/agent-ink/AgentView.tsx`

- AgentView has `[t] Show/Hide Think` toggle visible
- ChatView **doesn't have this toggle** exposed to users
- Thinking content can be silently hidden without user awareness

---

## 🚫 BLOCKING ISSUES (IS SOMETHING BLOCKED)

### **ISSUE #8: Input Blocked During AI Response** ⚠️

**Files:** `src/ui/chat/ChatInput.tsx:54`, `src/ui/chat/ChatView.tsx:405`

```typescript
<ChatInput
  ...
  disabled={state.isThinking}
  ...
/>
```

**Problem:** Can't type ANYTHING while waiting for AI. Can't queue up next question. Can't prepare follow-up.

---

### **ISSUE #9: No Way to Cancel Running Request** ❌ CRITICAL

**File:** `src/ui/chat/ChatView.tsx:100-104`

```typescript
useInput((input, key) => {
  // Ctrl+C to exit
  if (input === 'c' && key.ctrl) {
    exit();
  }
```

**Problem:** Ctrl+C **exits the entire application** instead of cancelling current operation. No abort signal passed to `streamText`. User must quit and restart to stop a long operation.

---

### **ISSUE #10: Permission System UI Not Implemented** ❌

**File:** `src/ui/agent-ink/types.ts:15`

```typescript
type AgentStateType =
  | 'idle'
  | 'waiting_for_input'
  | ...
  | 'waiting_permission'  // ← State exists
  | 'completed'
  | 'error';
```

State exists but **no UI to approve/deny** operations! The permission workflow is defined in types but never rendered with approval buttons.

---

## 🎨 UX/DESIGN ISSUES

### **ISSUE #11: No Scroll Position Indicator** ⚠️

Only shows text like `(History 5)` in header - no visual scroll bar, percentage indicator, or position within total messages.

---

### **ISSUE #12: No "New Messages" Alert When Scrolled** ⚠️

When user scrolls up to read history, new messages arrive but **no notification**. User doesn't know to scroll down to see latest content.

---

### **ISSUE #13: Keyboard Shortcuts Not Discoverable** ⚠️

Must type `/help` to see shortcuts. Advanced shortcuts like:
- `PgUp`/`PgDn` for fast scroll
- `g`/`G` for vim-style navigation to top/bottom
- `t`/`l` for toggle thinking/tools

Are completely hidden from users.

---

### **ISSUE #14: Cost Estimation Hardcoded for Claude** ⚠️

**File:** `src/ui/chat/StatusBar.tsx:33-38`

```typescript
function estimateCost(inputTokens: number, outputTokens: number): number {
  // Rough estimate based on Claude pricing ($3/M input, $15/M output)
  const inputCost = (inputTokens / 1_000_000) * 3;
  const outputCost = (outputTokens / 1_000_000) * 15;
  return inputCost + outputCost;
}
```

**Problem:** Shows wrong cost estimates for OpenAI, Gemini, Groq, etc. Should be model-aware.

---

### **ISSUE #15: Inconsistent Time Display** ⚠️

Different components show time differently:
- `StatusBar`: `formatDuration` returns `ms`, `Xs`, `Xm Ys`
- `AgentView`: `formatDuration` returns `Xs` or `Xm Ys` (no ms)
- Tool calls: Show elapsed in `s` while running, `ms` when complete

---

## 🔧 LOGIC BUGS

### **ISSUE #16: Potential Memory Leak** ⚠️

**File:** `src/ui/chat/useChat.ts`, `src/ui/agent-ink/useAgent.ts`

Default `maxMessages = 0` (unlimited in useAgent) or `100` history limit. Messages grow without bound in memory for long sessions.

---

### **ISSUE #17: ID Generation Collision Risk** ⚠️

**File:** `src/ui/chat/useChat.ts:13-15`

```typescript
function generateMessageId(): string {
  return `msg_${Date.now()}_${++messageIdCounter}`;
}
```

`Date.now()` can return same value for rapid messages (sub-millisecond). Counter helps but isn't thread-safe in concurrent scenarios.

---

### **ISSUE #18: Session DB Operations Silent Failures** ⚠️

**File:** `src/ui/chat/runChat.tsx:167-180`

```typescript
try {
  await store.addMessage({...});
} catch (error) {
  if (verbose) {
    console.error('Failed to save user message:', error);
  }
}
```

Errors only shown in verbose mode - user loses data silently without knowing!

---

### **ISSUE #19: Duplicate History Tracking** ⚠️

**Files:** `src/ui/chat/ChatInput.tsx`, `src/ui/chat/useChat.ts`

Both components track input history separately:
- `ChatInput`: Local state `historyIndex`
- `useChat`: `inputHistoryRef`

This duplication can cause inconsistencies.

---

## 📊 ISSUE SEVERITY MATRIX

| Category | Critical (❌) | Major (⚠️) | Minor |
|----------|---------------|------------|-------|
| Scrolling | 1 | 2 | - |
| Data Visibility | 2 | 2 | 1 |
| Blocking | 2 | 1 | - |
| UX/Design | - | 5 | - |
| Logic | - | 4 | - |
| **Total** | **5** | **14** | **1** |

---

## 🎯 PRIORITY FIX LIST

### P0 - Critical (Fix Immediately)

1. **Arrow Key Conflict** - Use modifier keys for scrolling (e.g., `Shift+↑/↓`) or implement separate scroll mode
2. **Tool Results Visibility** - Don't auto-remove after 1 second, persist results in message history  
3. **Cancel Mechanism** - `Ctrl+C` should cancel operation first, double-tap to exit

### P1 - High Priority

4. **Tool Result Association** - Use proper ID tracking instead of fragile string matching
5. **Scroll Position Indicator** - Show `[5/120]` or visual position bar
6. **Permission UI** - Implement approval/deny interface for `waiting_permission` state

### P2 - Medium Priority

7. **"New Messages" Alert** - Show indicator when scrolled and new content arrives
8. **Keyboard Shortcuts Help** - Always-visible hint or overlay
9. **Model-Aware Cost Estimation** - Use provider pricing data
10. **Increase Message Window** - Make `MESSAGES_WINDOW_SIZE` configurable

### P3 - Low Priority

11. **Consistent Time Formatting** - Unify duration display across components
12. **Memory Management** - Add cleanup for very long sessions
13. **Better ID Generation** - Use UUID or similar
14. **Thinking Toggle in Chat** - Add `[t]` shortcut to ChatView

---

## 📁 FILES REQUIRING CHANGES

| File | Issues |
|------|--------|
| `src/ui/chat/ChatView.tsx` | #1, #2, #3, #5, #9, #11, #12 |
| `src/ui/chat/ChatInput.tsx` | #1, #8, #19 |
| `src/ui/chat/useChat.ts` | #4, #5, #16, #17 |
| `src/ui/chat/StatusBar.tsx` | #14, #15 |
| `src/ui/chat/ToolCallDisplay.tsx` | #4 |
| `src/ui/chat/runChat.tsx` | #18 |
| `src/ui/agent-ink/AgentView.tsx` | #6, #10 |
| `src/ui/agent-ink/types.ts` | #10 |

---

## 🔬 TESTING RECOMMENDATIONS

1. **Scrolling Tests:** Add integration tests for keyboard navigation
2. **Tool Result Persistence:** Verify results stay visible after completion
3. **Cancel Flow:** Test Ctrl+C behavior in various states
4. **Long Session:** Test with 500+ messages for memory/performance
5. **Multi-Provider:** Verify cost estimates across providers

---

# 💀 POWER USER ANALYSIS - THIS TOOL IS BROKEN FOR REAL WORK

**Perspective:** Senior developer managing 5+ projects, deep research sessions, needs reliable tooling

---

## 🔥 THE REAL PROBLEMS (Developer Pain Points)

### **DEALBREAKER #1: I CAN'T SEE WHAT THE AI FOUND** ❌❌❌

**Scenario:** I ask "find all authentication patterns in this codebase"

The agent runs 15 `localSearchCode` calls, finds 47 files, reads 12 of them...

**What I see:**
```
🔧 localSearchCode ◐
✓ localSearchCode (234ms)
✓ localSearchCode (189ms)
...
🐙 Octocode: Based on my analysis, the auth system uses JWT...
```

**What I NEED to see:**
- The actual grep results
- The file contents it read
- Which files matched
- The raw data to verify

**Current Reality:** Tool results disappear in 1 second. I have NO WAY to verify the AI's conclusions. I'm blindly trusting an LLM with zero transparency.

---

### **DEALBREAKER #2: I CAN'T REFERENCE PREVIOUS FINDINGS** ❌❌❌

**Scenario:** 30 minutes into research, I need to go back to what the agent found in step 3.

**Current Reality:**
- Only 100 messages visible (hardcoded)
- No search within chat history
- No bookmarks or highlights
- No `/export` to get raw data
- Session saved to SQLite but **NO WAY TO QUERY IT**

**What I need:**
```
/search "AuthService"        # Find in history
/export research.md          # Dump to file
/goto 15                     # Jump to message 15
/bookmark "important finding"
```

---

### **DEALBREAKER #3: I'M BLOCKED WHILE WAITING** ❌❌❌

**Scenario:** Agent is running a slow `localSearchCode` on a huge monorepo. Takes 30 seconds.

**Current Reality:**
- Input is DISABLED
- Can't type my next question
- Can't take notes
- Can't scroll to review
- Can't CANCEL without killing the entire app

**What a power user needs:**
- **Queue next message** while AI is thinking
- **Cancel current operation** (not exit!)
- **Background the task** and start a new one
- **Split pane** - chat + live results

---

### **DEALBREAKER #4: NO MULTI-PROJECT CONTEXT** ❌❌❌

**Scenario:** I'm researching how `project-A` implements auth to apply same pattern to `project-B`.

**Current Reality:**
- One session = one working directory
- Can't switch contexts
- Can't compare findings side-by-side
- Starting new session loses all context

**What I need:**
```
/context add ~/project-b     # Add second project
/compare auth-a.md auth-b.md # Compare findings
/workspace save "auth-research"
/workspace load "auth-research"
```

---

### **DEALBREAKER #5: SESSIONS ARE USELESS** ❌❌❌

**Scenario:** I spent 2 hours on research yesterday. Today I want to continue.

**Current Reality:**
- `octocode sessions` lists sessions (great!)
- Can resume with `--session <id>` (great!)
- BUT: **Tool results are NOT persisted**
- Only raw text messages are saved
- The context (what files were read, what code was found) is GONE

**The session is just a transcript, not a research artifact.**

---

### **DEALBREAKER #6: NO WAY TO SHARE/EXPORT** ❌❌❌

**Scenario:** I found the auth vulnerability. Need to share with team.

**Current Reality:**
- No export to markdown
- No export to JSON
- No way to copy (terminal limitation)
- Can't share a session link
- Can't create a report

**What I need:**
```
/export report.md            # Full session as markdown
/export findings.json        # Structured data
/share                       # Generate shareable link
/screenshot                  # Capture terminal state
```

---

### **DEALBREAKER #7: THINKING IS HIDDEN/LOST** ❌❌❌

**Scenario:** The AI made a wrong conclusion. I need to understand WHY.

**Current Reality:**
- Extended thinking (Claude) is captured but truncated
- No way to expand thinking blocks
- Can't search within thinking
- Thinking might be hidden by default toggle

**Debugging AI decisions is impossible.**

---

## 📊 POWER USER SEVERITY MATRIX

| Issue | Impact | Workaround? | Time Wasted |
|-------|--------|-------------|-------------|
| Can't see tool results | CRITICAL | None | Hours of blind trust |
| Can't reference history | CRITICAL | Re-run queries | 30min+ per session |
| Blocked while waiting | HIGH | Wait patiently | 10-15min/day |
| No multi-project | HIGH | Multiple terminals | Context loss |
| Sessions don't persist findings | HIGH | Manual notes | 1hr+ per session |
| No export | MEDIUM | Screenshot spam | 15min per share |
| Thinking hidden | MEDIUM | Ask agent to explain | 5min per debug |

---

## 🎯 WHAT A POWER USER ACTUALLY NEEDS

### Tier 1: Make It Usable (P0)

1. **SHOW TOOL RESULTS IN CHAT** - Don't hide them!
   ```
   🔧 localSearchCode
   ┌─ Results (47 matches) ──────────────────────┐
   │ src/auth/jwt.ts:15     export class JwtAuth │
   │ src/auth/session.ts:8  import { JwtAuth }   │
   │ ... [+45 more - press 'e' to expand]        │
   └─────────────────────────────────────────────┘
   ```

2. **ADD `/export` COMMAND** - Basic necessity
   ```
   /export chat.md    # Export full conversation
   /export tools.json # Export all tool calls with results
   ```

3. **FIX CANCEL** - `Ctrl+C` once = cancel, twice = exit

4. **REMOVE 100 MESSAGE LIMIT** - Or make it configurable

### Tier 2: Make It Productive (P1)

5. **ADD SEARCH IN HISTORY**
   ```
   /search "pattern"  # Find in messages
   /find AuthService  # Find tool results mentioning this
   ```

6. **PERSIST TOOL RESULTS IN SESSIONS**
   - Store full tool args and results in SQLite
   - Resume with full context

7. **QUEUE MESSAGES**
   - Let me type while AI is working
   - Process queue when ready

8. **ADD SCROLL MODE**
   - `Ctrl+S` enters scroll mode (input disabled)
   - Full keyboard nav without conflict
   - `Escape` to return to input

### Tier 3: Make It Professional (P2)

9. **MULTI-CONTEXT SUPPORT**
   - Named workspaces
   - Multiple project roots
   - Context switching

10. **STRUCTURED OUTPUT OPTIONS**
    ```
    /format markdown  # AI outputs in markdown
    /format code-only # Only show code blocks
    /format verbose   # Show everything
    ```

11. **RESEARCH ARTIFACTS**
    - Auto-save findings to `.research/` folder
    - Create structured research notes
    - Link sessions to git commits

12. **COLLABORATION**
    - Share session via URL
    - Export to GitHub Gist
    - Team annotations

---

## 🔧 MINIMUM VIABLE FIXES (DO THESE FIRST)

### Fix 1: Show Tool Results (30min)
**File:** `src/ui/chat/useChat.ts`

```typescript
// REMOVE this (line 246-250):
setTimeout(() => {
  setCurrentToolCalls(prev =>
    prev.filter(tc => tc.id !== id || tc.status === 'running')
  );
}, 1000);

// KEEP tool results visible, add collapse/expand instead
```

### Fix 2: Add Export Command (1hr)
**File:** `src/ui/chat/ChatView.tsx`

```typescript
case '/export': {
  const filename = cmd.split(' ')[1] || 'chat-export.md';
  const markdown = state.messages.map(m => 
    `## ${m.role}\n${m.content}\n${m.toolResult || ''}`
  ).join('\n\n');
  fs.writeFileSync(filename, markdown);
  addSystemMessage(`Exported to ${filename}`);
  return true;
}
```

### Fix 3: Fix Ctrl+C Cancel (30min)
**File:** `src/ui/chat/ChatView.tsx`

```typescript
let cancelCount = 0;
let cancelTimer: NodeJS.Timeout;

useInput((input, key) => {
  if (input === 'c' && key.ctrl) {
    cancelCount++;
    clearTimeout(cancelTimer);
    
    if (cancelCount === 1 && state.isThinking) {
      // First Ctrl+C: Cancel current operation
      abortController.abort();
      addSystemMessage('Operation cancelled');
      cancelTimer = setTimeout(() => cancelCount = 0, 1000);
    } else if (cancelCount >= 2) {
      // Double Ctrl+C: Exit
      exit();
    }
  }
});
```

### Fix 4: Remove Message Limit (5min)
**File:** `src/ui/chat/ChatView.tsx`

```typescript
// Change from:
const MESSAGES_WINDOW_SIZE = 100;

// To:
const MESSAGES_WINDOW_SIZE = Infinity; // Or make configurable
```

### Fix 5: Separate Scroll Mode (1hr)
**File:** `src/ui/chat/ChatView.tsx`

```typescript
const [scrollMode, setScrollMode] = useState(false);

useInput((input, key) => {
  // Ctrl+S toggles scroll mode
  if (input === 's' && key.ctrl) {
    setScrollMode(prev => !prev);
    return;
  }
  
  // Only scroll in scroll mode
  if (scrollMode) {
    if (key.upArrow) setScrollOffset(prev => prev + 1);
    if (key.downArrow) setScrollOffset(prev => Math.max(0, prev - 1));
    if (key.escape) setScrollMode(false);
  }
});

// Show indicator
{scrollMode && (
  <Text color="yellow" bold> 📜 SCROLL MODE (Esc to exit)</Text>
)}
```

---

## 💡 COMPARISON: What Claude Code Does Right

| Feature | Claude Code | Octocode CLI |
|---------|-------------|--------------|
| Tool results | Always visible, expandable | Disappear in 1s |
| History | Full, searchable | 100 msg limit |
| Export | Built-in `/export` | None |
| Cancel | `Ctrl+C` cancels op | Exits app |
| Scroll | Native + keyboard | Broken conflict |
| Multi-context | Tab support | Single session |
| Sessions | Full context resume | Text-only resume |

---

## 🚨 VERDICT

**Current state:** The CLI is a **demo**, not a tool. It's fine for quick one-off questions but **completely unusable** for serious research work.

**For power users, the tool:**
- ❌ Hides the data I need to verify AI conclusions
- ❌ Loses context between sessions
- ❌ Blocks me from working efficiently
- ❌ Provides no way to share or export findings
- ❌ Has no search or navigation for long sessions

**Bottom line:** A developer doing real research would give up after 30 minutes and go back to `grep` + manual reading, or use Claude Code directly.

---

## 🎯 RECOMMENDED IMMEDIATE ACTIONS

1. **TODAY:** Fix tool result visibility (show, don't hide)
2. **THIS WEEK:** Add `/export` command
3. **THIS WEEK:** Fix Ctrl+C to cancel, not exit
4. **NEXT WEEK:** Add scroll mode
5. **NEXT SPRINT:** Persist tool results in sessions
6. **NEXT SPRINT:** Add `/search` in history

**Estimated effort:** 4-6 hours for P0 fixes, 2 days for P1

---

# 🛠️ CLAUDE CODE SDK - TOOL BEST PRACTICES

**Extracted from:** `@anthropic-ai/claude-agent-sdk/cli.js`

These are the actual tool prompts/instructions used by Claude Code CLI. They represent best practices for tool design and usage.

---

## 📝 Edit Tool (FileEdit)

**Name:** `Edit`  
**Description:** "A tool for editing files"

### Full Prompt:

```
Performs exact string replacements in files.

Usage:
- You must use your `Read` tool at least once in the conversation before editing. This tool will error if you attempt an edit without reading the file.
- When editing text from Read tool output, ensure you preserve the exact indentation (tabs/spaces) as it appears AFTER the line number prefix. The line number prefix format is: spaces + line number + tab. Everything after that tab is the actual file content to match. Never include any part of the line number prefix in the old_string or new_string.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- Only use emojis if the user explicitly requests it. Avoid adding emojis to files unless asked.
- The edit will FAIL if `old_string` is not unique in the file. Either provide a larger string with more surrounding context to make it unique or use `replace_all` to change every instance of `old_string`.
- Use `replace_all` for replacing and renaming strings across the file. This parameter is useful if you want to rename a variable for instance.
```

### Key Constraints:
1. **Must read first** - File must be read before editing
2. **Exact match** - `old_string` must be unique or use `replace_all`
3. **Preserve indentation** - Match exact whitespace
4. **Prefer editing over creating** - Don't create new files unless required

---

## ✏️ Write Tool (FileWrite)

**Name:** `Write`  
**Description:** "Writes a file to the local filesystem"

### Full Prompt:

```
Writes a file to the local filesystem.

Usage:
- This tool will overwrite the existing file if there is one at the provided path.
- If this is an existing file, you MUST use the Read tool first to read the file's contents. This tool will fail if you did not read the file first.
- ALWAYS prefer editing existing files in the codebase. NEVER write new files unless explicitly required.
- NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.
- Only use emojis if the user explicitly requests it. Avoid writing emojis to files unless asked.
```

### Key Constraints:
1. **Must read first (for existing files)** - Read before overwrite
2. **Prefer editing** - Use Edit for modifications
3. **No unsolicited docs** - Don't create README/docs unless asked
4. **No emojis** - Avoid unless explicitly requested

---

## 📖 Read Tool (FileRead)

**Name:** `Read`  
**Description:** "Reads a file from the local filesystem"

### Full Prompt:

```
Reads a file from the local filesystem. You can access any file directly by using this tool.
Assume this tool is able to read all files on the machine. If the User provides a path to a file assume that path is valid. It is okay to read a file that does not exist; an error will be returned.

Usage:
- The file_path parameter must be an absolute path, not a relative path
- By default, it reads up to 2000 lines starting from the beginning of the file
- You can optionally specify a line offset and limit (especially handy for long files), but it's recommended to read the whole file by not providing these parameters
- Any lines longer than 2000 characters will be truncated
- Results are returned using cat -n format, with line numbers starting at 1
- This tool allows Claude Code to read images (eg PNG, JPG, etc). When reading an image file the contents are presented visually as Claude Code is a multimodal LLM.
- This tool can read PDF files (.pdf). PDFs are processed page by page, extracting both text and visual content for analysis.
- This tool can read Jupyter notebooks (.ipynb files) and returns all cells with their outputs, combining code, text, and visualizations.
- This tool can only read files, not directories. To read a directory, use an ls command via the Bash tool.
- You can call multiple tools in a single response. It is always better to speculatively read multiple potentially useful files in parallel.
- You will regularly be asked to read screenshots. If the user provides a path to a screenshot, ALWAYS use this tool to view the file at the path. This tool will work with all temporary file paths.
- If you read a file that exists but has empty contents you will receive a system reminder warning in place of file contents.
```

### Key Constraints:
1. **Absolute paths** - Always use absolute paths
2. **Line limits** - 2000 lines max by default
3. **Character truncation** - Long lines truncated at 2000 chars
4. **Multi-modal** - Can read images, PDFs, notebooks
5. **Parallel reads** - Speculatively read multiple files in parallel

---

## ⚙️ Task Tool (TaskOutput)

**Name:** `TaskOutput`  
**Description:** "Retrieves output from running or completed tasks"

### Full Prompt:

```
- Retrieves output from a running or completed task (background shell, agent, or remote session)
- Takes a task_id parameter identifying the task
- Returns the task output along with status information
- Use block=true (default) to wait for task completion
- Use block=false for non-blocking check of current status
- Task IDs can be found using the /tasks command
- Works with all task types: background shells, async agents, and remote sessions
```

### Related: Task Tool (Agent Launch)

```
Launch a new agent to handle complex, multi-step tasks autonomously.

The Task tool launches specialized agents (subprocesses) that autonomously handle complex tasks. Each agent type has specific capabilities and tools available to it.

Available agent types and the tools they have access to:
- [Dynamically populated based on agent definitions]

When using the Task tool, you must specify a subagent_type parameter to select which agent type to use.
```

### Key Patterns:
1. **Blocking mode** - Default waits for completion
2. **Non-blocking** - Use `block=false` for status check
3. **Task types** - Background shells, agents, remote sessions
4. **Task discovery** - Use `/tasks` command to list

---

## 🔍 Grep Tool (Search)

**Name:** `Grep`  
**Description:** "A powerful search tool built on ripgrep"

### Full Prompt:

```
A powerful search tool built on ripgrep

Usage:
- ALWAYS use Grep for search tasks. NEVER invoke `grep` or `rg` as a Bash command. The Grep tool has been optimized for correct permissions and access.
- Supports full regex syntax (e.g., "log.*Error", "function\\s+\\w+")
- Filter files with glob parameter (e.g., "*.js", "**/*.tsx") or type parameter (e.g., "js", "py", "rust")
- Output modes: "content" shows matching lines, "files_with_matches" shows only file paths (default), "count" shows match counts
- Use Task tool for open-ended searches requiring multiple rounds
- Pattern syntax: Uses ripgrep (not grep) - literal braces need escaping (use `interface\\{\\}` to find `interface{}` in Go code)
- Multiline matching: By default patterns match within single lines only. For cross-line patterns like `struct \\{[\\s\\S]*?field`, use `multiline: true`
```

### Key Constraints:
1. **Use tool, not shell** - Don't use bash grep/rg
2. **Ripgrep syntax** - Not standard grep
3. **Output modes** - files_with_matches is default
4. **Escape braces** - For literal brace matching
5. **Multiline flag** - Enable for cross-line patterns

---

## 📁 Glob Tool (File Pattern)

**Name:** `Glob`  
**Description:** "Fast file pattern matching tool"

### Full Prompt:

```
- Fast file pattern matching tool that works with any codebase size
- Supports glob patterns like "**/*.js" or "src/**/*.ts"
- Returns matching file paths sorted by modification time
- Use this tool when you need to find files by name patterns
- When you are doing an open ended search that may require multiple rounds of globbing and grepping, use the Agent tool instead
- You can call multiple tools in a single response. It is always better to speculatively perform multiple searches in parallel if they are potentially useful.
```

### Key Constraints:
1. **Modification time sorting** - Results sorted by mtime
2. **Complex searches** - Use Agent/Task for multi-round
3. **Parallel execution** - Speculatively run multiple in parallel

---

## 💻 Bash Tool (Shell)

**Name:** `Bash`  
**Description:** "Executes shell commands"

### Full Prompt (excerpted):

```
- You can specify an optional timeout in milliseconds. If not specified, commands will timeout after default (configurable).
- It is very helpful if you write a clear, concise description of what this command does in 5-10 words.
- If the output exceeds character limit, output will be truncated before being returned to you.
- You can use the `run_in_background` parameter to run the command in the background, which allows you to continue working while the command runs. You can monitor the output using the TaskOutput tool as it becomes available. You do not need to use '&' at the end of the command when using this parameter.

- Avoid using Bash with the `find`, `grep`, `cat`, `head`, `tail`, `sed`, `awk`, or `echo` commands, unless explicitly instructed or when these commands are truly necessary for the task. Instead, always prefer using the dedicated tools for these commands:
  - File search: Use Glob (NOT find or ls)
  - Content search: Use Grep (NOT grep or rg)
  - Read files: Use Read (NOT cat/head/tail)
  - Edit files: Use Edit (NOT sed/awk)
  - Write files: Use Write (NOT echo >/cat <<EOF)
  - Communication: Output text directly (NOT echo/printf)

- When issuing multiple commands:
  - If the commands are independent and can run in parallel, make multiple Bash tool calls in a single message. For example, if you need to run "git status" and "git diff", send a single message with two Bash tool calls in parallel.
  - If the commands depend on each other and must run sequentially, use a single Bash call with '&&' to chain them together (e.g., `git add . && git commit -m "message" && git push`). For instance, if one operation must complete before another starts (like mkdir before cp, Write before Bash for git operations, or git add before git commit), run these operations sequentially instead.
  - Use ';' only when you need to run commands sequentially but don't care if earlier commands fail
  - DO NOT use newlines to separate commands (newlines are ok in quoted strings)

- Try to maintain your current working directory throughout the session by using absolute paths and avoiding usage of `cd`. You may use `cd` if the User explicitly requests it.
```

### Key Constraints:
1. **Prefer dedicated tools** - Don't use grep, cat, find via bash
2. **Parallel vs sequential** - Multiple calls for parallel, `&&` for sequential
3. **Background execution** - Use `run_in_background` not `&`
4. **Absolute paths** - Avoid `cd`, use full paths
5. **Clear descriptions** - 5-10 word descriptions
6. **No newline separators** - Use `&&` or `;` instead

---

## 🎯 OCTOCODE-CLI IMPLEMENTATION RECOMMENDATIONS

Based on the Claude Code SDK patterns, here are specific recommendations for `octocode-cli`:

### 1. Tool Instructions Must Be Explicit

Claude Code provides detailed, explicit instructions for each tool. `octocode-cli` should:
- Define clear constraints in tool descriptions
- Explain what NOT to do (e.g., "NEVER use grep via bash")
- Provide examples of correct/incorrect usage

### 2. Read-Before-Write Pattern

Claude Code enforces reading files before editing/writing. `octocode-cli` should:
- Track file read state
- Reject edits to unread files
- Error with actionable message: "File has not been read yet. Read it first."

### 3. Tool Preference Hierarchy

Claude Code explicitly guides tool selection:

| Task | Preferred Tool | NOT This |
|------|---------------|----------|
| Search content | Grep | `bash grep` |
| Find files | Glob | `bash find` |
| Read files | Read | `bash cat` |
| Edit files | Edit | `bash sed` |
| Write files | Write | `bash echo >` |

### 4. Parallel Execution Hints

Claude Code encourages parallel speculative execution:
- "Speculatively read multiple potentially useful files in parallel"
- "Make multiple Bash tool calls in a single message"

`octocode-cli` should support and encourage parallel tool calls.

### 5. Task Management

Claude Code separates:
- **Synchronous tasks** - Direct tool calls
- **Background tasks** - `run_in_background` parameter
- **Agent tasks** - Subagent delegation for complex work

`octocode-cli` should implement similar task lifecycle management.

---

## 📊 COMPARISON: octocode-cli vs Claude Code

| Feature | Claude Code | octocode-cli (Current) |
|---------|-------------|----------------------|
| Read-before-write | ✅ Enforced | ❌ Not enforced |
| Tool preference hints | ✅ In prompts | ❌ Not present |
| Parallel execution | ✅ Encouraged | ⚠️ Supported, not guided |
| Background tasks | ✅ TaskOutput | ❌ Not implemented |
| File state tracking | ✅ readFileState | ❌ Not tracked |
| Edit uniqueness check | ✅ Enforced | ❌ Not checked |

---

## 🔧 IMMEDIATE ACTIONS FOR OCTOCODE-CLI

1. **Add file read state tracking**
   - Track which files have been read
   - Block edits to unread files

2. **Enhance tool descriptions**
   - Add "NEVER do X" constraints
   - Add "PREFER tool Y over Z" guidance

3. **Implement TaskOutput equivalent**
   - Support background task monitoring
   - Track task lifecycle

4. **Add uniqueness validation to Edit**
   - Check if `old_string` is unique
   - Error with clear message if not
