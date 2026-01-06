# Octocode-CLI Remaining Tasks

> **Status:** Validated January 6, 2026. Completed tasks removed.

---

## P0 - Critical: Permission UI Was Deleted

### TASK-009: Recreate Permission UI Component

**Problem:** `AgentView.tsx` was deleted, which contained the Permission UI implementation.

**Action Required:** Recreate the PermissionDialog component that was in AgentView.tsx.

**Previous Implementation (from deleted file):**
```tsx
function PermissionDialog({
  permission,
  theme,
}: {
  permission: PendingPermission;
  theme: AgentTheme;
}): React.ReactElement {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.warningColor}
      paddingX={1}
      marginY={1}
    >
      <Box>
        <Text backgroundColor="yellow" color="black" bold>
          {' '}PERMISSION REQUIRED{' '}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text>
          Allow <Text bold color={theme.toolColor}>{permission.toolName}</Text> to execute?
        </Text>
      </Box>
      {permission.description && (
        <Box marginLeft={2}>
          <Text color={theme.dimColor}>{permission.description}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={theme.dimColor}>
          Press <Text bold color="green">y</Text> to allow,{' '}
          <Text bold color="red">n</Text> to deny,{' '}
          <Text bold color="blue">a</Text> to allow all
        </Text>
      </Box>
    </Box>
  );
}
```

**Files to create/modify:**
- `src/ui/chat/PermissionDialog.tsx` (new component)
- Wire into ChatView.tsx or create standalone

---

## P1 - High Priority

### TASK-013: Model-Aware Cost Estimation

**Problem:** Cost estimates hardcoded for Claude pricing in ChatView.tsx:244-245.

**Current Code:**
```typescript
const estimatedCost =
  (stats.totalInputTokens / 1_000_000) * 3 +
  (stats.totalOutputTokens / 1_000_000) * 15;
```

**Fix:** Use provider-specific pricing data.

**Implementation:**
```typescript
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-3-opus': { input: 15, output: 75 },
  'claude-3-sonnet': { input: 3, output: 15 },
  'claude-3-haiku': { input: 0.25, output: 1.25 },
  'gpt-4': { input: 30, output: 60 },
  'gpt-4-turbo': { input: 10, output: 30 },
  'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
  'gemini-pro': { input: 0.5, output: 1.5 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING[model] || PRICING['claude-3-sonnet'];
  return (inputTokens / 1_000_000) * pricing.input +
         (outputTokens / 1_000_000) * pricing.output;
}
```

**File:** `src/ui/chat/ChatView.tsx:244-245`

---

### TASK-022: Tool Progress Messages

**Problem:** No progress indication for long-running tools.

**Source:** `claude-agent-sdk-architecture.md:1527`

**Implementation:**
```typescript
interface ToolProgressMessage {
  type: 'tool_progress';
  tool_use_id: string;
  tool_name: string;
  elapsed_time_seconds: number;
}

// Emit every 5 seconds during tool execution
const progressInterval = setInterval(() => {
  onToolProgress({
    type: 'tool_progress',
    tool_use_id: toolCall.id,
    tool_name: toolCall.name,
    elapsed_time_seconds: (Date.now() - startTime) / 1000
  });
}, 5000);
```

**Files:**
- `src/ui/chat/types.ts` - Add ToolProgressMessage type
- `src/ui/chat/useChat.ts` - Handle progress messages
- `src/ui/chat/ToolCallDisplay.tsx` - Show elapsed time

---

## P2 - Medium Priority

### TASK-011: Add Search in Chat History

**Problem:** No way to find specific content in long conversations.

**Implementation:**
```typescript
// In ChatView.tsx handleCommand:
case '/search': {
  const pattern = cmd.replace('/search ', '').trim();
  if (!pattern) {
    addSystemMessage('Usage: /search <pattern>');
    return true;
  }
  const matches = state.messages.filter(m =>
    m.content.toLowerCase().includes(pattern.toLowerCase())
  );
  if (matches.length === 0) {
    addSystemMessage(`No matches found for "${pattern}"`);
  } else {
    addSystemMessage(`Found ${matches.length} matches for "${pattern}":\n` +
      matches.slice(0, 10).map(m =>
        `  [${m.role}] ${m.content.slice(0, 100)}...`
      ).join('\n')
    );
  }
  return true;
}
```

**File:** `src/ui/chat/ChatView.tsx` - Add to handleCommand switch

---

### TASK-012: Add Scroll Position Indicator

**Problem:** No visual indication of position in message history.

**Implementation:**
```tsx
// In ChatView.tsx, add to status area:
{state.messages.length > 0 && (
  <Text color={theme.dimColor}>
    [{visibleStartIndex + 1}-{visibleEndIndex}/{state.messages.length}]
  </Text>
)}
```

**File:** `src/ui/chat/ChatView.tsx`

---

### TASK-014: New Messages Alert When Scrolled

**Problem:** When scrolled up, new messages arrive without notification.

**Implementation:**
```tsx
const [hasNewMessages, setHasNewMessages] = useState(false);
const [isAtBottom, setIsAtBottom] = useState(true);

// When new message arrives and not at bottom
useEffect(() => {
  if (!isAtBottom && state.messages.length > prevMessageCount) {
    setHasNewMessages(true);
  }
}, [state.messages.length, isAtBottom]);

// Render indicator
{hasNewMessages && !isAtBottom && (
  <Box position="absolute" bottom={2}>
    <Text backgroundColor="blue" color="white"> ↓ New messages below </Text>
  </Box>
)}
```

**File:** `src/ui/chat/ChatView.tsx`

---

### TASK-015: Keyboard Shortcuts in Status Bar

**Problem:** Shortcuts like Ctrl+S, Ctrl+C are hidden (only in /help).

**Implementation:**
```tsx
// In StatusBar.tsx, add:
<Box marginLeft={2}>
  <Text dimColor>[Ctrl+S] Scroll</Text>
  <Text dimColor> [/help] Commands</Text>
</Box>
```

**File:** `src/ui/chat/StatusBar.tsx`

---

## P3 - Low Priority

### TASK-016: Unified formatDuration Utility

**Problem:** Multiple formatDuration implementations exist.

**Files with duration formatting:**
- `src/ui/chat/StatusBar.tsx:20-26`
- `src/ui/agent-ink/AgentView.tsx` (was deleted)

**Fix:** Create shared utility:
```typescript
// src/utils/format.ts
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.floor((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}
```

---

### TASK-019: Thinking Toggle in ChatView

**Problem:** AgentView had `[t]` toggle for thinking visibility, ChatView doesn't.

**Implementation:**
```typescript
// In ChatView.tsx useInput:
if (input === 't' && !state.isThinking) {
  setShowThinking(prev => !prev);
  addSystemMessage(`Thinking blocks ${showThinking ? 'hidden' : 'visible'}`);
}
```

**File:** `src/ui/chat/ChatView.tsx`

---

### TASK-024: Add Hyperlink Support

**Problem:** No clickable links in terminal output.

**Implementation:**
```typescript
// src/utils/hyperlink.ts
export function supportsHyperlinks(): boolean {
  return process.env.TERM_PROGRAM === 'iTerm.app' ||
         process.env.TERM_PROGRAM === 'Hyper' ||
         !!process.env.WT_SESSION;
}

export function makeHyperlink(url: string, text: string = url): string {
  if (!supportsHyperlinks()) return text;
  return `\x1B]8;;${url}\x07${text}\x1B]8;;\x07`;
}
```

---

## SDK Feature Parity (Future)

### TASK-SKILL: Implement Skill System

**Source:** `claude-agent-sdk-architecture.md:1790-1850`

**Description:** Load skills from `.claude/skills/` with SKILL.md format.

**File structure:**
```
.claude/skills/
├── my-skill/
│   ├── SKILL.md          # Skill definition
│   └── references/       # Optional reference files
```

---

### TASK-AGENTS: Implement AGENTS.md Loading

**Source:** `claude-agent-sdk-architecture.md:1722-1786`

**Description:** Load agent definitions from `.claude/agents/` with YAML frontmatter.

**File format:**
```markdown
---
color: blue
model: sonnet
forkContext: true
---
You are a specialized agent...
```

---

### TASK-SESSION-FORK: Session Forking

**Source:** `claude-agent-sdk-architecture.md:1970-1985`

**Description:** Add `forkSession` option to branch conversations.

```typescript
{
  resume: 'session-id',
  resumeSessionAt?: 'message-uuid',
  forkSession?: boolean,
}
```

---

## Quick Reference

| Priority | Task | File | Effort |
|----------|------|------|--------|
| P0 | TASK-009 Permission UI | New component | Medium |
| P1 | TASK-013 Cost estimation | ChatView.tsx | Small |
| P1 | TASK-022 Tool progress | Multiple | Medium |
| P2 | TASK-011 Search | ChatView.tsx | Small |
| P2 | TASK-012 Scroll indicator | ChatView.tsx | Small |
| P2 | TASK-014 New msg alert | ChatView.tsx | Small |
| P2 | TASK-015 Shortcuts bar | StatusBar.tsx | Small |
| P3 | TASK-016 formatDuration | New util | Small |
| P3 | TASK-019 Thinking toggle | ChatView.tsx | Small |
| P3 | TASK-024 Hyperlinks | New util | Small |
| Future | TASK-SKILL | New feature | Large |
| Future | TASK-AGENTS | New feature | Large |
| Future | TASK-SESSION-FORK | session-store.ts | Medium |

---

## Completed Tasks (Removed)

The following were verified as implemented:
- TASK-001: Tool results persist (useChat.ts)
- TASK-002: Ctrl+C double-tap (ChatView.tsx)
- TASK-003: Scroll mode with Ctrl+S (ChatView.tsx)
- TASK-004: /export command (ChatView.tsx)
- TASK-005: No 100 message limit (maxHistorySize=10000)
- TASK-006: Background task system (task-manager.ts)
- TASK-007: Context compaction (context-compaction.ts)
- TASK-008: Tool result ID association (ChatView.tsx)
- TASK-010: Session persistence with tools (session-store.ts)
- TASK-018: Better ID generation (msg_timestamp_counter)
- TASK-020: Read-before-write (in tools)
- TASK-021: Tool descriptions (in tools)
- TASK-023: Border style variety (types.ts BORDER_STYLES)
- TASK-025: Enhanced text styling (dimColor, bold throughout)

---

*Validated: January 6, 2026*
